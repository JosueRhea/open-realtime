import type { AsyncOrchestratorStore } from "@/lib/orchestrator/async-types";
import type {
  ChannelSummary,
  DashboardOverview,
  DashboardOverviewOptions,
  RealtimeEvent,
  UsagePoint,
  UsageRange,
  WebhookDeliveryLog,
} from "@/lib/orchestrator/types";

interface AxiomTelemetryOptions {
  token: string;
  dataset: string;
  apiUrl?: string;
  fetchFn?: FetchLike;
}

interface AxiomTable {
  name: string;
  fields: Array<{ name: string; type: string }>;
  columns: unknown[][];
}

interface AxiomTabularResponse {
  tables?: AxiomTable[];
}

type AxiomRow = Record<string, unknown>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class AxiomTelemetryOrchestratorStore implements AsyncOrchestratorStore {
  constructor(
    private readonly delegate: AsyncOrchestratorStore,
    private readonly telemetry: AxiomTelemetryClient,
  ) {}

  async getOverview(
    tenantId: string,
    appId?: string,
    options: DashboardOverviewOptions = {},
  ): Promise<DashboardOverview> {
    const overview = await this.delegate.getOverview(tenantId, appId, options);
    const axiomOverview = {
      ...overview,
      observability: {
        provider: "axiom" as const,
        configured: true,
      },
    };
    const currentApp = overview.currentApp;
    if (!currentApp) return axiomOverview;

    try {
      const telemetry = await this.telemetry.overview({
        tenantId: currentApp.tenantId,
        appId: currentApp.appId,
        usageRange: options.usageRange ?? "24h",
      });
      const usage = telemetry.usage;
      const peakConnections = Math.max(
        telemetry.activeConnections,
        ...usage.map((point) => point.connections),
      );

      return {
        ...overview,
        usage,
        events: telemetry.events,
        channels: telemetry.channels,
        webhookLogs: telemetry.webhookLogs,
        observability: axiomOverview.observability,
        totals: {
          ...overview.totals,
          activeConnections: telemetry.activeConnections,
          messagesToday: telemetry.messagesToday,
          peakConnections,
          webhookFailures: telemetry.webhookFailures,
        },
      };
    } catch (error) {
      console.warn("Unable to load Axiom dashboard telemetry", error);
      return axiomOverview;
    }
  }

  ensureTenantForUser = this.delegate.ensureTenantForUser.bind(this.delegate);
  listTenantMemberships = this.delegate.listTenantMemberships.bind(this.delegate);
  listApps = this.delegate.listApps.bind(this.delegate);
  listGatewayApps = this.delegate.listGatewayApps.bind(this.delegate);
  createApp = this.delegate.createApp.bind(this.delegate);
  listWebhooks = this.delegate.listWebhooks.bind(this.delegate);
  createWebhook = this.delegate.createWebhook.bind(this.delegate);
  listApiTokens = this.delegate.listApiTokens.bind(this.delegate);
  createApiToken = this.delegate.createApiToken.bind(this.delegate);
  verifyApiToken = this.delegate.verifyApiToken.bind(this.delegate);
  reportUsage = this.delegate.reportUsage.bind(this.delegate);
  reportEvent = this.delegate.reportEvent.bind(this.delegate);
  reportChannel = this.delegate.reportChannel.bind(this.delegate);
}

export class AxiomTelemetryClient {
  constructor(private readonly options: AxiomTelemetryOptions) {}

  async overview(input: {
    tenantId: string;
    appId: string;
    usageRange: UsageRange;
  }): Promise<{
    usage: UsagePoint[];
    events: RealtimeEvent[];
    channels: ChannelSummary[];
    webhookLogs: WebhookDeliveryLog[];
    activeConnections: number;
    messagesToday: number;
    webhookFailures: number;
  }> {
    const [
      usage,
      events,
      channels,
      webhookLogs,
      activeConnections,
      messagesToday,
      webhookFailures,
    ] =
      await Promise.all([
        this.usage(input),
        this.events(input),
        this.channels(input),
        this.webhookLogs(input),
        this.activeConnections(input),
        this.messagesToday(input),
        this.webhookFailures(input),
      ]);

    return {
      usage,
      events,
      channels,
      webhookLogs,
      activeConnections,
      messagesToday,
      webhookFailures,
    };
  }

  private async usage(input: {
    tenantId: string;
    appId: string;
    usageRange: UsageRange;
  }): Promise<UsagePoint[]> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)}`,
        "where event in ('connection.opened', 'message.delivered')",
        [
          "summarize",
          "connections=countif(event == 'connection.opened'),",
          "messages=countif(event == 'message.delivered')",
          "by bin(_time, 1h)",
        ].join(" "),
        "order by _time asc",
      ].join(" | "),
      rangeStartTime(input.usageRange),
    );

    return rows.map((row) => ({
      tenantId: input.tenantId,
      appId: input.appId,
      hour: stringValue(row._time),
      connections: numberValue(row.connections),
      messages: numberValue(row.messages),
      webhookFailures: 0,
    }));
  }

  private async events(input: {
    tenantId: string;
    appId: string;
  }): Promise<RealtimeEvent[]> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)}`,
        "project _time, event, channel, socket_id, event_name, level, service",
        "order by _time desc",
        "limit 8",
      ].join(" | "),
      "now-30d",
    );

    return rows.map((row, index) => {
      const time = stringValue(row._time);
      const event = stringValue(row.event);
      const level = stringValue(row.level);
      const channel = stringValue(row.channel) || "gateway";

      return {
        id: `axiom_${Date.parse(time) || index}_${index}`,
        tenantId: input.tenantId,
        appId: input.appId,
        time,
        type: stringValue(row.event_name) || event,
        channel,
        user: stringValue(row.socket_id) || "system",
        status: level === "error" ? "failed" : "sent",
        meta: stringValue(row.service) || event,
      };
    });
  }

  private async channels(input: {
    tenantId: string;
    appId: string;
    usageRange: UsageRange;
  }): Promise<ChannelSummary[]> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)} and isnotnull(channel)`,
        [
          "summarize",
          "subscriptions=countif(event == 'channel.subscribed') - countif(event == 'channel.unsubscribed'),",
          "messages=countif(event == 'message.delivered'),",
          "last_activity=max(_time)",
          "by channel",
        ].join(" "),
        "order by subscriptions desc",
        "limit 8",
      ].join(" | "),
      rangeStartTime(input.usageRange),
    );

    return rows.map((row) => {
      const name = stringValue(row.channel);
      return {
        tenantId: input.tenantId,
        appId: input.appId,
        name,
        type: channelType(name),
        subscriptions: Math.max(0, numberValue(row.subscriptions)),
        messagesPerSecond: numberValue(row.messages),
        lastActivity: dateValue(row.last_activity),
      };
    });
  }

  private async activeConnections(input: {
    tenantId: string;
    appId: string;
    usageRange: UsageRange;
  }): Promise<number> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)}`,
        "where event in ('connection.opened', 'connection.closed')",
        [
          "summarize",
          "opened=countif(event == 'connection.opened'),",
          "closed=countif(event == 'connection.closed')",
        ].join(" "),
      ].join(" | "),
      rangeStartTime(input.usageRange),
    );
    const row = rows[0];
    if (!row) return 0;
    return Math.max(0, numberValue(row.opened) - numberValue(row.closed));
  }

  private async webhookLogs(input: {
    tenantId: string;
    appId: string;
  }): Promise<WebhookDeliveryLog[]> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)}`,
        "where event in ('webhook.queued', 'webhook.delivered', 'webhook.delivery_failed')",
        [
          "project",
          "_time,",
          "event,",
          "level,",
          "url=column_ifexists('url', ''),",
          "status=column_ifexists('status', ''),",
          "webhook_id=column_ifexists('webhook_id', ''),",
          "event_count=column_ifexists('event_count', 0),",
          "durable=column_ifexists('durable', false)",
        ].join(" "),
        "order by _time desc",
        "limit 50",
      ].join(" | "),
      "now-30d",
    );

    return rows.map((row, index) => {
      const event = webhookEventValue(row.event);
      const time = stringValue(row._time);
      const webhookId = stringValue(row.webhook_id);
      const httpStatus = nullableNumberValue(row.status);

      return {
        id: webhookId || `axiom_webhook_${Date.parse(time) || index}_${index}`,
        tenantId: input.tenantId,
        appId: input.appId,
        time,
        event,
        url: stringValue(row.url),
        status: webhookStatus(event),
        httpStatus,
        eventCount: numberValue(row.event_count),
        webhookId,
        durable: nullableBooleanValue(row.durable),
      };
    });
  }

  private async messagesToday(input: {
    tenantId: string;
    appId: string;
    usageRange: UsageRange;
  }): Promise<number> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)}`,
        "where event == 'message.delivered'",
        "summarize messages=count()",
      ].join(" | "),
      rangeStartTime(input.usageRange),
    );
    return numberValue(rows[0]?.messages);
  }

  private async webhookFailures(input: {
    tenantId: string;
    appId: string;
    usageRange: UsageRange;
  }): Promise<number> {
    const rows = await this.queryRows(
      [
        this.datasetExpression,
        `where ${this.appFilter(input)}`,
        "where event == 'webhook.delivery_failed'",
        "summarize failures=count()",
      ].join(" | "),
      rangeStartTime(input.usageRange),
    );
    return numberValue(rows[0]?.failures);
  }

  private async queryRows(apl: string, startTime: string): Promise<AxiomRow[]> {
    const response = await (this.options.fetchFn ?? fetch)(this.queryUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ apl, startTime }),
    });

    if (!response.ok) {
      throw new Error(`Axiom query failed: HTTP ${response.status}`);
    }

    return rowsFromTable(((await response.json()) as AxiomTabularResponse).tables?.[0]);
  }

  private appFilter(input: { tenantId: string; appId: string }) {
    return [
      `app_id == ${aplString(input.appId)}`,
      `(tenant_id == ${aplString(input.tenantId)} or isnull(tenant_id))`,
    ].join(" and ");
  }

  private get queryUrl(): string {
    const base = (this.options.apiUrl ?? "https://api.axiom.co").replace(/\/$/, "");
    return `${base}/v1/datasets/_apl?format=tabular`;
  }

  private get datasetExpression(): string {
    return `[${aplString(this.options.dataset)}]`;
  }
}

export function createAxiomTelemetryStore(
  delegate: AsyncOrchestratorStore,
): AsyncOrchestratorStore {
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;
  if (!token || !dataset) return delegate;

  return new AxiomTelemetryOrchestratorStore(
    delegate,
    new AxiomTelemetryClient({
      token,
      dataset,
      apiUrl: process.env.AXIOM_API_URL,
    }),
  );
}

function rowsFromTable(table: AxiomTable | undefined): AxiomRow[] {
  if (!table) return [];
  const rowCount = table.columns[0]?.length ?? 0;
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Object.fromEntries(
      table.fields.map((field, columnIndex) => [
        field.name,
        table.columns[columnIndex]?.[rowIndex],
      ]),
    ),
  );
}

function rangeStartTime(range: UsageRange): string {
  switch (range) {
    case "1h":
      return "now-1h";
    case "7d":
      return "now-7d";
    case "30d":
      return "now-30d";
    case "24h":
    default:
      return "now-24h";
  }
}

function aplString(value: string): string {
  return JSON.stringify(value);
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableBooleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function dateValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value / 1_000_000).toISOString();
  }
  return new Date().toISOString();
}

function webhookEventValue(value: unknown): WebhookDeliveryLog["event"] {
  switch (value) {
    case "webhook.delivered":
    case "webhook.delivery_failed":
    case "webhook.queued":
      return value;
    default:
      return "webhook.queued";
  }
}

function webhookStatus(
  event: WebhookDeliveryLog["event"],
): WebhookDeliveryLog["status"] {
  switch (event) {
    case "webhook.delivered":
      return "delivered";
    case "webhook.delivery_failed":
      return "failed";
    case "webhook.queued":
    default:
      return "queued";
  }
}

function channelType(name: string): ChannelSummary["type"] {
  if (name.startsWith("presence-")) return "presence";
  if (name.startsWith("private-")) return "private";
  return "public";
}
