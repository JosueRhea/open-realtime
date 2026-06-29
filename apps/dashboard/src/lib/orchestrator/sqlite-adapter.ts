import type { Database as SqliteDatabase } from "better-sqlite3";

import { getSqliteDatabase } from "@/lib/db/sqlite";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  randomToken,
} from "@/lib/orchestrator/crypto";
import type {
  ApiToken,
  ChannelSummary,
  CreatedRealtimeApp,
  DashboardOverview,
  EventReportInput,
  GatewayAppCredential,
  OrchestratorStore,
  RealtimeApp,
  RealtimeEvent,
  UsageReportInput,
  Tenant,
  TenantMembership,
  UsagePoint,
  VerifiedApiToken,
  WebhookEndpoint,
  ChannelReportInput,
} from "@/lib/orchestrator/types";

type TenantRow = {
  id: string;
  name: string;
  mode: Tenant["mode"];
  created_at: string;
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
  created_at: string;
};

type WebhookRow = {
  id: string;
  tenant_id: string;
  app_id: string;
  url: string;
  enabled_events: string;
  status: WebhookEndpoint["status"];
  last_delivery_at: string | null;
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
  time: string;
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
  last_activity: string;
};

type ApiTokenRow = {
  id: string;
  tenant_id: string;
  name: string;
  token_hash: string;
  token_preview: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
};

type TenantMembershipRow = {
  tenant_id: string;
  user_id: string;
  role: TenantMembership["role"];
  created_at: string;
};

export class SqliteOrchestratorStore implements OrchestratorStore {
  constructor(private readonly db: SqliteDatabase = getSqliteDatabase()) {
    this.migrate();
  }

  ensureTenantForUser(input: {
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    tenantId?: string;
  }): TenantMembership {
    const tenantId = input.tenantId ?? process.env.OPEN_REALTIME_TENANT_ID ?? "self-hosted";
    const tenantName =
      process.env.OPEN_REALTIME_TENANT_NAME ??
      input.userName ??
      input.userEmail ??
      "Self Hosted";
    this.ensureTenantWithName(tenantId, tenantName, "self-hosted");

    const existing = this.db
      .prepare(
        `select * from tenant_memberships where tenant_id = ? and user_id = ?`,
      )
      .get(tenantId, input.userId) as TenantMembershipRow | undefined;

    if (existing) {
      return mapTenantMembership(existing);
    }

    const membership: TenantMembership = {
      tenantId,
      userId: input.userId,
      role: "owner",
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `insert into tenant_memberships (tenant_id, user_id, role, created_at)
         values (?, ?, ?, ?)`,
      )
      .run(membership.tenantId, membership.userId, membership.role, membership.createdAt);

    return membership;
  }

  listTenantMemberships(userId: string): TenantMembership[] {
    return this.db
      .prepare(`select * from tenant_memberships where user_id = ? order by created_at`)
      .all(userId)
      .map((row) => mapTenantMembership(row as TenantMembershipRow));
  }

  getOverview(tenantId: string): DashboardOverview {
    const tenant = this.getTenant(tenantId) ?? defaultTenant(tenantId);
    const apps = this.listApps(tenant.id);
    const currentApp = apps[0];

    const webhooks = currentApp ? this.listWebhooks(tenant.id, currentApp.appId) : [];
    const usage = currentApp ? this.listUsage(tenant.id, currentApp.appId) : [];
    const events = currentApp ? this.listEvents(tenant.id, currentApp.appId) : [];
    const channels = currentApp
      ? this.listChannels(tenant.id, currentApp.appId)
      : [];
    const apiTokens = this.listApiTokens(tenant.id);
    const peakConnections = Math.max(
      currentApp?.activeConnections ?? 0,
      ...usage.map((point) => point.connections),
    );

    return {
      tenant,
      currentApp,
      apps,
      webhooks,
      usage,
      events,
      channels,
      apiTokens,
      totals: {
        activeConnections: currentApp?.activeConnections ?? 0,
        messagesToday: apps.reduce((sum, app) => sum + app.messagesToday, 0),
        peakConnections,
        webhookFailures: webhooks.reduce(
          (sum, webhook) => sum + webhook.failureCount,
          0,
        ),
      },
    };
  }

  listApps(tenantId: string): RealtimeApp[] {
    return this.db
      .prepare(
        `select * from realtime_apps where tenant_id = ? order by messages_today desc`,
      )
      .all(tenantId)
      .map((row) => mapApp(row as AppRow));
  }

  listGatewayApps(tenantId: string): GatewayAppCredential[] {
    return this.db
      .prepare(
        `select * from realtime_apps
         where tenant_id = ? and secret_encrypted is not null
         order by messages_today desc`,
      )
      .all(tenantId)
      .map((row) => {
        const app = row as AppRow;

        return {
          appId: app.app_id,
          tenantId: app.tenant_id,
          key: app.key,
          secret: decryptSecret(app.secret_encrypted!),
          cluster: app.cluster,
          name: app.name,
        };
      });
  }

  createApp(input: { tenantId: string; name: string }): CreatedRealtimeApp {
    const tenant = this.ensureTenant(input.tenantId);
    const appId = slugify(input.name);
    const existing = this.db
      .prepare(
        `select app_id from realtime_apps where tenant_id = ? and app_id = ?`,
      )
      .get(tenant.id, appId);

    if (existing) {
      throw new Error(`App ${appId} already exists`);
    }

    const now = new Date().toISOString();
    const key = `io_${randomToken(18)}`;
    const secret = `sec_${randomToken(32)}`;
    const secretPreview = `${secret.slice(0, 8)}...${secret.slice(-4)}`;

    this.db
      .prepare(
        `insert into realtime_apps
         (app_id, tenant_id, name, org, key, secret_encrypted, secret_preview, cluster, host, status, active_connections, messages_today, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        appId,
        tenant.id,
        input.name.trim(),
        tenant.name,
        key,
        encryptSecret(secret),
        secretPreview,
        process.env.OPEN_REALTIME_CLUSTER ?? "self-host-1",
        process.env.OPEN_REALTIME_HOST ?? "localhost:3001",
        "operational",
        0,
        0,
        now,
      );

    const app = this.listApps(tenant.id).find((candidate) => candidate.appId === appId);
    if (!app) throw new Error(`Unable to create app ${appId}`);
    return { ...app, plainTextSecret: secret };
  }

  listWebhooks(tenantId: string, appId: string): WebhookEndpoint[] {
    return this.webhooksForApp(tenantId, appId);
  }

  createWebhook(input: {
    tenantId: string;
    appId: string;
    url: string;
    enabledEvents: string[];
  }): WebhookEndpoint {
    this.assertAppBelongsToTenant(input.tenantId, input.appId);

    const id = `wh_${randomToken(14)}`;
    this.db
      .prepare(
        `insert into webhook_endpoints
         (id, tenant_id, app_id, url, enabled_events, status, last_delivery_at, failure_count)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.tenantId,
        input.appId,
        input.url,
        JSON.stringify(input.enabledEvents),
        "healthy",
        null,
        0,
      );

    const webhook = this.webhooksForApp(input.tenantId, input.appId).find(
      (candidate) => candidate.id === id,
    );

    if (!webhook) {
      throw new Error(`Unable to create webhook ${id}`);
    }

    return webhook;
  }

  listApiTokens(tenantId: string): ApiToken[] {
    return this.db
      .prepare(`select * from api_tokens where tenant_id = ? order by created_at desc`)
      .all(tenantId)
      .map((row) => mapApiToken(row as ApiTokenRow));
  }

  createApiToken(input: {
    tenantId: string;
    name: string;
    scopes?: string[];
  }): { token: ApiToken; plainTextToken: string } {
    this.ensureTenant(input.tenantId);

    const id = `tok_${randomToken(14)}`;
    const plainTextToken = `ort_${input.tenantId}_${randomToken(32)}`;
    const tokenPreview = `${plainTextToken.slice(0, 14)}...${plainTextToken.slice(-4)}`;
    const scopes = input.scopes?.length
      ? input.scopes
      : ["ingest:write", "registry:read"];
    const now = new Date().toISOString();

    this.db
      .prepare(
        `insert into api_tokens
         (id, tenant_id, name, token_hash, token_preview, scopes, created_at, last_used_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.tenantId,
        input.name.trim(),
        hashToken(plainTextToken),
        tokenPreview,
        JSON.stringify(scopes),
        now,
        null,
      );

    const token = this.listApiTokens(input.tenantId).find(
      (candidate) => candidate.id === id,
    );

    if (!token) {
      throw new Error(`Unable to create API token ${id}`);
    }

    return { token, plainTextToken };
  }

  verifyApiToken(plainTextToken: string): VerifiedApiToken | null {
    const row = this.db
      .prepare(`select * from api_tokens where token_hash = ?`)
      .get(hashToken(plainTextToken)) as ApiTokenRow | undefined;

    if (!row) {
      return null;
    }

    this.db
      .prepare(`update api_tokens set last_used_at = ? where id = ?`)
      .run(new Date().toISOString(), row.id);

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      scopes: JSON.parse(row.scopes) as string[],
    };
  }

  reportUsage(input: UsageReportInput): UsagePoint {
    this.assertAppBelongsToTenant(input.tenantId, input.appId);

    const id = `${input.tenantId}:${input.appId}:${input.hour}`;

    this.db
      .prepare(
        `insert into usage_hourly
         (id, tenant_id, app_id, hour, connections, messages, webhook_failures)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           connections = excluded.connections,
           messages = excluded.messages,
           webhook_failures = excluded.webhook_failures`,
      )
      .run(
        id,
        input.tenantId,
        input.appId,
        input.hour,
        input.connections,
        input.messages,
        input.webhookFailures ?? 0,
      );

    this.db
      .prepare(
        `update realtime_apps
         set active_connections = ?, messages_today = ?
         where tenant_id = ? and app_id = ?`,
      )
      .run(input.connections, input.messages, input.tenantId, input.appId);

    return {
      tenantId: input.tenantId,
      appId: input.appId,
      hour: input.hour,
      connections: input.connections,
      messages: input.messages,
      webhookFailures: input.webhookFailures ?? 0,
    };
  }

  reportEvent(input: EventReportInput): RealtimeEvent {
    this.assertAppBelongsToTenant(input.tenantId, input.appId);

    const id = `evt_${randomToken(16)}`;
    const time = input.time ?? new Date().toISOString();

    this.db
      .prepare(
        `insert into realtime_events
         (id, tenant_id, app_id, time, type, channel, user, status, meta)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.tenantId,
        input.appId,
        time,
        input.type,
        input.channel,
        input.user,
        input.status,
        input.meta,
      );

    return {
      id,
      tenantId: input.tenantId,
      appId: input.appId,
      time,
      type: input.type,
      channel: input.channel,
      user: input.user,
      status: input.status,
      meta: input.meta,
    };
  }

  reportChannel(input: ChannelReportInput): ChannelSummary {
    this.assertAppBelongsToTenant(input.tenantId, input.appId);

    const id = `${input.tenantId}:${input.appId}:${input.name}`;
    const lastActivity = input.lastActivity ?? new Date().toISOString();

    this.db
      .prepare(
        `insert into channel_summaries
         (id, tenant_id, app_id, name, type, subscriptions, messages_per_second, last_activity)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           type = excluded.type,
           subscriptions = excluded.subscriptions,
           messages_per_second = excluded.messages_per_second,
           last_activity = excluded.last_activity`,
      )
      .run(
        id,
        input.tenantId,
        input.appId,
        input.name,
        input.type,
        input.subscriptions,
        input.messagesPerSecond,
        lastActivity,
      );

    return {
      tenantId: input.tenantId,
      appId: input.appId,
      name: input.name,
      type: input.type,
      subscriptions: input.subscriptions,
      messagesPerSecond: input.messagesPerSecond,
      lastActivity,
    };
  }

  private getTenant(id: string): Tenant | null {
    const row = this.db
      .prepare(`select * from tenants where id = ?`)
      .get(id) as TenantRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      mode: row.mode,
      createdAt: row.created_at,
    };
  }

  private ensureTenant(id: string): Tenant {
    const existing = this.getTenant(id);

    if (existing) {
      return existing;
    }

    const tenant = defaultTenant(id);

    this.db
      .prepare(`insert into tenants (id, name, mode, created_at) values (?, ?, ?, ?)`)
      .run(tenant.id, tenant.name, tenant.mode, tenant.createdAt);

    return tenant;
  }

  private ensureTenantWithName(
    id: string,
    name: string,
    mode: Tenant["mode"],
  ): Tenant {
    const existing = this.getTenant(id);

    if (existing) {
      return existing;
    }

    const tenant: Tenant = {
      id,
      name,
      mode,
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(`insert into tenants (id, name, mode, created_at) values (?, ?, ?, ?)`)
      .run(tenant.id, tenant.name, tenant.mode, tenant.createdAt);

    return tenant;
  }

  private assertAppBelongsToTenant(tenantId: string, appId: string) {
    const row = this.db
      .prepare(
        `select app_id from realtime_apps where tenant_id = ? and app_id = ?`,
      )
      .get(tenantId, appId);

    if (!row) {
      throw new Error(`App ${appId} was not found for tenant ${tenantId}`);
    }
  }

  private webhooksForApp(tenantId: string, appId: string): WebhookEndpoint[] {
    return this.db
      .prepare(
        `select * from webhook_endpoints where tenant_id = ? and app_id = ? order by url`,
      )
      .all(tenantId, appId)
      .map((row) => {
        const webhook = row as WebhookRow;

        return {
          id: webhook.id,
          tenantId: webhook.tenant_id,
          appId: webhook.app_id,
          url: webhook.url,
          enabledEvents: JSON.parse(webhook.enabled_events) as string[],
          status: webhook.status,
          lastDeliveryAt: webhook.last_delivery_at,
          failureCount: webhook.failure_count,
        };
      });
  }

  private listUsage(tenantId: string, appId: string): UsagePoint[] {
    return this.db
      .prepare(
        `select * from usage_hourly where tenant_id = ? and app_id = ? order by hour`,
      )
      .all(tenantId, appId)
      .map((row) => {
        const usage = row as UsageRow;

        return {
          tenantId: usage.tenant_id,
          appId: usage.app_id,
          hour: usage.hour,
          connections: usage.connections,
          messages: usage.messages,
          webhookFailures: usage.webhook_failures,
        };
      });
  }

  private listEvents(tenantId: string, appId: string): RealtimeEvent[] {
    return this.db
      .prepare(
        `select * from realtime_events where tenant_id = ? and app_id = ? order by time desc limit 8`,
      )
      .all(tenantId, appId)
      .map((row) => {
        const event = row as EventRow;

        return {
          id: event.id,
          tenantId: event.tenant_id,
          appId: event.app_id,
          time: event.time,
          type: event.type,
          channel: event.channel,
          user: event.user,
          status: event.status,
          meta: event.meta,
        };
      });
  }

  private listChannels(tenantId: string, appId: string): ChannelSummary[] {
    return this.db
      .prepare(
        `select * from channel_summaries where tenant_id = ? and app_id = ? order by subscriptions desc`,
      )
      .all(tenantId, appId)
      .map((row) => {
        const channel = row as ChannelRow;

        return {
          tenantId: channel.tenant_id,
          appId: channel.app_id,
          name: channel.name,
          type: channel.type,
          subscriptions: channel.subscriptions,
          messagesPerSecond: channel.messages_per_second,
          lastActivity: channel.last_activity,
        };
      });
  }

  private migrate() {
    this.db.exec(`
      create table if not exists tenants (
        id text primary key,
        name text not null,
        mode text not null,
        created_at text not null
      );

      create table if not exists realtime_apps (
        app_id text primary key,
        tenant_id text not null references tenants(id),
        name text not null,
        org text not null,
        key text not null,
        secret_encrypted text,
        secret_preview text not null,
        cluster text not null,
        host text not null,
        status text not null,
        active_connections integer not null,
        messages_today integer not null,
        created_at text not null
      );

      create table if not exists webhook_endpoints (
        id text primary key,
        tenant_id text not null default 'self-hosted',
        app_id text not null references realtime_apps(app_id),
        url text not null,
        enabled_events text not null,
        status text not null,
        last_delivery_at text,
        failure_count integer not null default 0
      );

      create table if not exists usage_hourly (
        id text primary key,
        tenant_id text not null default 'self-hosted',
        app_id text not null references realtime_apps(app_id),
        hour text not null,
        connections integer not null,
        messages integer not null,
        webhook_failures integer not null default 0
      );

      create table if not exists realtime_events (
        id text primary key,
        tenant_id text not null default 'self-hosted',
        app_id text not null references realtime_apps(app_id),
        time text not null,
        type text not null,
        channel text not null,
        user text not null,
        status text not null,
        meta text not null
      );

      create table if not exists channel_summaries (
        id text primary key,
        tenant_id text not null default 'self-hosted',
        app_id text not null references realtime_apps(app_id),
        name text not null,
        type text not null,
        subscriptions integer not null,
        messages_per_second real not null,
        last_activity text not null
      );

      create table if not exists api_tokens (
        id text primary key,
        tenant_id text not null references tenants(id),
        name text not null,
        token_hash text not null unique,
        token_preview text not null,
        scopes text not null,
        created_at text not null,
        last_used_at text
      );

      create table if not exists tenant_memberships (
        tenant_id text not null references tenants(id),
        user_id text not null,
        role text not null,
        created_at text not null,
        primary key (tenant_id, user_id)
      );

      create index if not exists tenant_memberships_user_idx
        on tenant_memberships(user_id);
    `);

    this.ensureColumn("webhook_endpoints", "tenant_id", "text not null default 'self-hosted'");
    this.ensureColumn("usage_hourly", "tenant_id", "text not null default 'self-hosted'");
    this.ensureColumn("realtime_events", "tenant_id", "text not null default 'self-hosted'");
    this.ensureColumn("channel_summaries", "tenant_id", "text not null default 'self-hosted'");
    this.ensureColumn("realtime_apps", "secret_encrypted", "text");
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db
      .prepare(`pragma table_info(${table})`)
      .all() as Array<{ name: string }>;

    if (!columns.some((existing) => existing.name === column)) {
      this.db.exec(`alter table ${table} add column ${column} ${definition}`);
    }
  }
}

function mapTenantMembership(row: TenantMembershipRow): TenantMembership {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
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
    createdAt: row.created_at,
  };
}

function mapApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    tokenPreview: row.token_preview,
    scopes: JSON.parse(row.scopes) as string[],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

function defaultTenant(id: string): Tenant {
  return {
    id,
    name: process.env.OPEN_REALTIME_TENANT_NAME ?? "Self Hosted",
    mode: "self-hosted",
    createdAt: new Date().toISOString(),
  };
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || `app-${Date.now()}`;
}
