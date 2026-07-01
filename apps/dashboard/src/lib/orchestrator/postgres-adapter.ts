import postgres from "postgres";
import { readFile } from "node:fs/promises";

import {
  decryptSecret,
  encryptSecret,
  hashToken,
  randomToken,
} from "@/lib/orchestrator/crypto";
import type { AsyncOrchestratorStore } from "@/lib/orchestrator/async-types";
import type {
  ApiToken,
  ChannelReportInput,
  ChannelSummary,
  CreatedRealtimeApp,
  DashboardOverview,
  DashboardOverviewOptions,
  EventReportInput,
  GatewayAppCredential,
  RealtimeApp,
  RealtimeEvent,
  Tenant,
  TenantMembership,
  UsagePoint,
  UsageReportInput,
  VerifiedApiToken,
  WebhookEndpoint,
} from "@/lib/orchestrator/types";

type Sql = postgres.Sql;

type TenantRow = {
  id: string;
  name: string;
  mode: Tenant["mode"];
  created_at: Date | string;
};

type AppRow = {
  app_id: string;
  tenant_id: string;
  name: string;
  org: string;
  key: string;
  secret_encrypted: string | null;
  secret_preview: string;
  cluster: string;
  host: string;
  status: RealtimeApp["status"];
  active_connections: number;
  messages_today: number;
  created_at: Date | string;
};

type WebhookRow = {
  id: string;
  tenant_id: string;
  app_id: string;
  url: string;
  enabled_events: string[] | string;
  status: WebhookEndpoint["status"];
  last_delivery_at: Date | string | null;
  failure_count: number;
};

type UsageRow = {
  tenant_id: string;
  app_id: string;
  hour: string;
  connections: number;
  messages: number;
  webhook_failures: number;
};

type EventRow = {
  id: string;
  tenant_id: string;
  app_id: string;
  time: Date | string;
  type: string;
  channel: string;
  user: string;
  status: RealtimeEvent["status"];
  meta: string;
};

type ChannelRow = {
  tenant_id: string;
  app_id: string;
  name: string;
  type: ChannelSummary["type"];
  subscriptions: number;
  messages_per_second: number;
  last_activity: Date | string;
};

type ApiTokenRow = {
  id: string;
  tenant_id: string;
  name: string;
  token_preview: string;
  scopes: string[] | string;
  created_at: Date | string;
  last_used_at: Date | string | null;
};

type TenantMembershipRow = {
  tenant_id: string;
  user_id: string;
  role: TenantMembership["role"];
  created_at: Date | string;
};

export class PostgresOrchestratorStore implements AsyncOrchestratorStore {
  constructor(private readonly sql: Sql) {}

  static fromConnectionString(connectionString: string) {
    return new PostgresOrchestratorStore(postgres(connectionString));
  }

  async migrate(): Promise<void> {
    await this.sql.unsafe(await readPostgresSchema());
  }

  async ensureTenantForUser(input: {
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    tenantId?: string;
  }): Promise<TenantMembership> {
    const existingMemberships = await this.listTenantMemberships(input.userId);
    const requestedMembership = input.tenantId
      ? existingMemberships.find((membership) => membership.tenantId === input.tenantId)
      : existingMemberships[0];

    if (requestedMembership) {
      return requestedMembership;
    }

    const tenantId = input.tenantId ?? `tenant_${randomToken(12)}`;
    const tenantName =
      process.env.OPEN_REALTIME_TENANT_NAME ??
      input.userName ??
      input.userEmail ??
      "Hosted Tenant";
    await this.ensureTenantWithName(tenantId, tenantName, "managed-cloud");
    const membership: TenantMembership = {
      tenantId,
      userId: input.userId,
      role: "owner",
      createdAt: new Date().toISOString(),
    };

    await this.sql`
      insert into tenant_memberships (tenant_id, user_id, role, created_at)
      values (${membership.tenantId}, ${membership.userId}, ${membership.role}, ${membership.createdAt})
      on conflict (tenant_id, user_id) do nothing
    `;

    return (
      (await this.listTenantMemberships(input.userId)).find(
        (item) => item.tenantId === tenantId,
      ) ?? membership
    );
  }

  async listTenantMemberships(userId: string): Promise<TenantMembership[]> {
    const rows = await this.sql<TenantMembershipRow[]>`
      select * from tenant_memberships where user_id = ${userId} order by created_at
    `;
    return rows.map(mapTenantMembership);
  }

  async getOverview(
    tenantId: string,
    appId?: string,
    options: DashboardOverviewOptions = {},
  ): Promise<DashboardOverview> {
    const tenant = (await this.getTenant(tenantId)) ?? defaultTenant(tenantId);
    const apps = await this.listApps(tenant.id);
    const currentApp = apps.find((app) => app.appId === appId) ?? apps[0] ?? null;
    const [webhooks, usage, events, channels, apiTokens, gatewayApps] = currentApp
      ? await Promise.all([
          this.listWebhooks(tenant.id, currentApp.appId),
          this.listUsage(tenant.id, currentApp.appId, usageBucketLimit(options.usageRange)),
          this.listEvents(tenant.id, currentApp.appId),
          this.listChannels(tenant.id, currentApp.appId),
          this.listApiTokens(tenant.id),
          this.listGatewayApps(tenant.id),
        ])
      : [[], [], [], [], await this.listApiTokens(tenant.id), await this.listGatewayApps(tenant.id)];
    const peakConnections = Math.max(
      currentApp?.activeConnections ?? 0,
      ...usage.map((point) => point.connections),
    );

    return {
      tenant,
      currentApp,
      apps,
      gatewayApps,
      webhooks,
      usage,
      events,
      channels,
      apiTokens,
      totals: {
        activeConnections: currentApp?.activeConnections ?? 0,
        messagesToday: apps.reduce((sum, app) => sum + app.messagesToday, 0),
        peakConnections,
        webhookFailures: webhooks.reduce((sum, webhook) => sum + webhook.failureCount, 0),
      },
    };
  }

  async listApps(tenantId: string): Promise<RealtimeApp[]> {
    const rows = await this.sql<AppRow[]>`
      select * from realtime_apps where tenant_id = ${tenantId} order by messages_today desc
    `;
    return rows.map(mapApp);
  }

  async listGatewayApps(tenantId: string): Promise<GatewayAppCredential[]> {
    const rows = await this.sql<AppRow[]>`
      select * from realtime_apps
      where tenant_id = ${tenantId} and secret_encrypted is not null
      order by messages_today desc
    `;
    return rows.map((row) => ({
      appId: row.app_id,
      tenantId: row.tenant_id,
      key: row.key,
      secret: decryptSecret(row.secret_encrypted!),
      cluster: row.cluster,
      name: row.name,
    }));
  }

  async createApp(input: { tenantId: string; name: string }): Promise<CreatedRealtimeApp> {
    const tenant = await this.ensureTenant(input.tenantId);
    const appId = slugify(input.name);
    const now = new Date().toISOString();
    const key = `io_${randomToken(18)}`;
    const secret = `sec_${randomToken(32)}`;
    const secretPreview = `${secret.slice(0, 8)}...${secret.slice(-4)}`;

    await this.sql`
      insert into realtime_apps
      (app_id, tenant_id, name, org, key, secret_encrypted, secret_preview, cluster, host, status, active_connections, messages_today, created_at)
      values (${appId}, ${tenant.id}, ${input.name.trim()}, ${tenant.name}, ${key}, ${encryptSecret(secret)}, ${secretPreview}, ${process.env.OPEN_REALTIME_CLUSTER ?? "mt1"}, ${process.env.OPEN_REALTIME_HOST ?? "realtime.example.com"}, 'operational', 0, 0, ${now})
    `;

    const app = (await this.listApps(tenant.id)).find((item) => item.appId === appId);
    if (!app) throw new Error(`Unable to create app ${appId}`);
    return { ...app, plainTextSecret: secret };
  }

  async listWebhooks(tenantId: string, appId: string): Promise<WebhookEndpoint[]> {
    const rows = await this.sql<WebhookRow[]>`
      select * from webhook_endpoints where tenant_id = ${tenantId} and app_id = ${appId} order by url
    `;
    return rows.map(mapWebhook);
  }

  async createWebhook(input: {
    tenantId: string;
    appId: string;
    url: string;
    enabledEvents: string[];
  }): Promise<WebhookEndpoint> {
    await this.assertAppBelongsToTenant(input.tenantId, input.appId);
    const id = `wh_${randomToken(14)}`;
    await this.sql`
      insert into webhook_endpoints
      (id, tenant_id, app_id, url, enabled_events, status, last_delivery_at, failure_count)
      values (${id}, ${input.tenantId}, ${input.appId}, ${input.url}, ${this.sql.json(input.enabledEvents)}, 'healthy', null, 0)
    `;
    const webhook = (await this.listWebhooks(input.tenantId, input.appId)).find((item) => item.id === id);
    if (!webhook) throw new Error(`Unable to create webhook ${id}`);
    return webhook;
  }

  async listApiTokens(tenantId: string): Promise<ApiToken[]> {
    const rows = await this.sql<ApiTokenRow[]>`
      select id, tenant_id, name, token_preview, scopes, created_at, last_used_at
      from api_tokens
      where tenant_id = ${tenantId}
      order by created_at desc
    `;
    return rows.map(mapApiToken);
  }

  async createApiToken(input: {
    tenantId: string;
    name: string;
    scopes?: string[];
  }): Promise<{ token: ApiToken; plainTextToken: string }> {
    await this.ensureTenant(input.tenantId);
    const id = `tok_${randomToken(14)}`;
    const plainTextToken = `ort_${input.tenantId}_${randomToken(32)}`;
    const tokenPreview = `${plainTextToken.slice(0, 14)}...${plainTextToken.slice(-4)}`;
    const scopes = input.scopes?.length
      ? input.scopes
      : ["ingest:write", "registry:read"];
    const now = new Date().toISOString();

    await this.sql`
      insert into api_tokens
      (id, tenant_id, name, token_hash, token_preview, scopes, created_at, last_used_at)
      values (${id}, ${input.tenantId}, ${input.name.trim()}, ${hashToken(plainTextToken)}, ${tokenPreview}, ${this.sql.json(scopes)}, ${now}, null)
    `;
    const token = (await this.listApiTokens(input.tenantId)).find((item) => item.id === id);
    if (!token) throw new Error(`Unable to create API token ${id}`);
    return { token, plainTextToken };
  }

  async verifyApiToken(plainTextToken: string): Promise<VerifiedApiToken | null> {
    const rows = await this.sql<Array<ApiTokenRow & { scopes: string[] | string }>>`
      select id, tenant_id, name, token_preview, scopes, created_at, last_used_at
      from api_tokens where token_hash = ${hashToken(plainTextToken)} limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    await this.sql`update api_tokens set last_used_at = ${new Date().toISOString()} where id = ${row.id}`;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      scopes: parseJsonArray(row.scopes),
    };
  }

  async reportUsage(input: UsageReportInput): Promise<UsagePoint> {
    await this.assertAppBelongsToTenant(input.tenantId, input.appId);
    const id = `${input.tenantId}:${input.appId}:${input.hour}`;
    const reportedConnections = await this.updateAppUsage(input);
    await this.sql`
      insert into usage_hourly
      (id, tenant_id, app_id, hour, connections, messages, webhook_failures)
      values (${id}, ${input.tenantId}, ${input.appId}, ${input.hour}, ${reportedConnections}, ${input.messages}, ${input.webhookFailures ?? 0})
      on conflict(id) do update set
        connections = excluded.connections,
        messages = excluded.messages,
        webhook_failures = excluded.webhook_failures
    `;
    return {
      tenantId: input.tenantId,
      appId: input.appId,
      hour: input.hour,
      connections: reportedConnections,
      messages: input.messages,
      webhookFailures: input.webhookFailures ?? 0,
    };
  }

  private async updateAppUsage(input: UsageReportInput): Promise<number> {
    const rows =
      typeof input.connectionDelta === "number"
        ? await this.sql<Pick<AppRow, "active_connections">[]>`
            update realtime_apps
            set active_connections = greatest(0, active_connections + ${input.connectionDelta}),
                messages_today = ${input.messages}
            where tenant_id = ${input.tenantId} and app_id = ${input.appId}
            returning active_connections
          `
        : await this.sql<Pick<AppRow, "active_connections">[]>`
            update realtime_apps
            set active_connections = ${input.connections},
                messages_today = ${input.messages}
            where tenant_id = ${input.tenantId} and app_id = ${input.appId}
            returning active_connections
          `;

    return rows[0]?.active_connections ?? input.connections;
  }

  async reportEvent(input: EventReportInput): Promise<RealtimeEvent> {
    await this.assertAppBelongsToTenant(input.tenantId, input.appId);
    const id = `evt_${randomToken(16)}`;
    const time = input.time ?? new Date().toISOString();
    await this.sql`
      insert into realtime_events
      (id, tenant_id, app_id, time, type, channel, "user", status, meta)
      values (${id}, ${input.tenantId}, ${input.appId}, ${time}, ${input.type}, ${input.channel}, ${input.user}, ${input.status}, ${input.meta})
    `;
    return { id, ...input, time };
  }

  async reportChannel(input: ChannelReportInput): Promise<ChannelSummary> {
    await this.assertAppBelongsToTenant(input.tenantId, input.appId);
    const id = `${input.tenantId}:${input.appId}:${input.name}`;
    const lastActivity = input.lastActivity ?? new Date().toISOString();
    await this.sql`
      insert into channel_summaries
      (id, tenant_id, app_id, name, type, subscriptions, messages_per_second, last_activity)
      values (${id}, ${input.tenantId}, ${input.appId}, ${input.name}, ${input.type}, ${input.subscriptions}, ${input.messagesPerSecond}, ${lastActivity})
      on conflict(id) do update set
        type = excluded.type,
        subscriptions = excluded.subscriptions,
        messages_per_second = excluded.messages_per_second,
        last_activity = excluded.last_activity
    `;
    return { ...input, lastActivity };
  }

  private async getTenant(id: string): Promise<Tenant | null> {
    const rows = await this.sql<TenantRow[]>`select * from tenants where id = ${id} limit 1`;
    return rows[0] ? mapTenant(rows[0]) : null;
  }

  private async ensureTenant(id: string): Promise<Tenant> {
    const existing = await this.getTenant(id);
    if (existing) return existing;
    const tenant = defaultTenant(id);
    await this.sql`
      insert into tenants (id, name, mode, created_at)
      values (${tenant.id}, ${tenant.name}, ${tenant.mode}, ${tenant.createdAt})
    `;
    return tenant;
  }

  private async ensureTenantWithName(
    id: string,
    name: string,
    mode: Tenant["mode"],
  ): Promise<Tenant> {
    const existing = await this.getTenant(id);
    if (existing) return existing;
    const tenant: Tenant = {
      id,
      name,
      mode,
      createdAt: new Date().toISOString(),
    };
    await this.sql`
      insert into tenants (id, name, mode, created_at)
      values (${tenant.id}, ${tenant.name}, ${tenant.mode}, ${tenant.createdAt})
    `;
    return tenant;
  }

  private async listUsage(
    tenantId: string,
    appId: string,
    limit: number,
  ): Promise<UsagePoint[]> {
    const rows = await this.sql<UsageRow[]>`
      select * from (
        select * from usage_hourly
        where tenant_id = ${tenantId} and app_id = ${appId}
        order by hour desc
        limit ${limit}
      ) as recent_usage
      order by hour
    `;
    return rows.map(mapUsage);
  }

  private async listEvents(tenantId: string, appId: string): Promise<RealtimeEvent[]> {
    const rows = await this.sql<EventRow[]>`
      select * from realtime_events where tenant_id = ${tenantId} and app_id = ${appId} order by time desc limit 8
    `;
    return rows.map(mapEvent);
  }

  private async listChannels(tenantId: string, appId: string): Promise<ChannelSummary[]> {
    const rows = await this.sql<ChannelRow[]>`
      select * from channel_summaries where tenant_id = ${tenantId} and app_id = ${appId} order by subscriptions desc
    `;
    return rows.map(mapChannel);
  }

  private async assertAppBelongsToTenant(tenantId: string, appId: string): Promise<void> {
    const rows = await this.sql`
      select app_id from realtime_apps where tenant_id = ${tenantId} and app_id = ${appId} limit 1
    `;
    if (rows.length === 0) {
      throw new Error(`App ${appId} was not found for tenant ${tenantId}`);
    }
  }
}

function usageBucketLimit(range: DashboardOverviewOptions["usageRange"]) {
  switch (range) {
    case "1h":
      return 1;
    case "7d":
      return 24 * 7;
    case "30d":
      return 24 * 30;
    case "24h":
    default:
      return 24;
  }
}

function mapTenantMembership(row: TenantMembershipRow): TenantMembership {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    createdAt: toIso(row.created_at),
  };
}

function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    createdAt: toIso(row.created_at),
  };
}

function mapApp(row: AppRow): RealtimeApp {
  return {
    appId: row.app_id,
    tenantId: row.tenant_id,
    name: row.name,
    org: row.org,
    key: row.key,
    secretPreview: row.secret_preview,
    cluster: row.cluster,
    host: row.host,
    status: row.status,
    activeConnections: row.active_connections,
    messagesToday: row.messages_today,
    createdAt: toIso(row.created_at),
  };
}

function mapWebhook(row: WebhookRow): WebhookEndpoint {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    appId: row.app_id,
    url: row.url,
    enabledEvents: parseJsonArray(row.enabled_events),
    status: row.status,
    lastDeliveryAt: row.last_delivery_at ? toIso(row.last_delivery_at) : null,
    failureCount: row.failure_count,
  };
}

function mapUsage(row: UsageRow): UsagePoint {
  return {
    tenantId: row.tenant_id,
    appId: row.app_id,
    hour: row.hour,
    connections: row.connections,
    messages: row.messages,
    webhookFailures: row.webhook_failures,
  };
}

function mapEvent(row: EventRow): RealtimeEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    appId: row.app_id,
    time: toIso(row.time),
    type: row.type,
    channel: row.channel,
    user: row.user,
    status: row.status,
    meta: row.meta,
  };
}

function mapChannel(row: ChannelRow): ChannelSummary {
  return {
    tenantId: row.tenant_id,
    appId: row.app_id,
    name: row.name,
    type: row.type,
    subscriptions: row.subscriptions,
    messagesPerSecond: row.messages_per_second,
    lastActivity: toIso(row.last_activity),
  };
}

function mapApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    tokenPreview: row.token_preview,
    scopes: parseJsonArray(row.scopes),
    createdAt: toIso(row.created_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
  };
}

function defaultTenant(id: string): Tenant {
  return {
    id,
    name: process.env.OPEN_REALTIME_TENANT_NAME ?? "Hosted Tenant",
    mode: defaultTenantMode(),
    createdAt: new Date().toISOString(),
  };
}

function defaultTenantMode(): Tenant["mode"] {
  return process.env.OPEN_REALTIME_TENANT_MODE === "self-hosted"
    ? "self-hosted"
    : "managed-cloud";
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || `app-${Date.now()}`;
}

function parseJsonArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  return JSON.parse(value) as string[];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readPostgresSchema() {
  return readFile(new URL("./postgres-schema.sql", import.meta.url), "utf8");
}
