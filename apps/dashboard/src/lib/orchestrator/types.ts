export type TenantMode = "self-hosted" | "managed-cloud";

export type Tenant = {
  id: string;
  name: string;
  mode: TenantMode;
  createdAt: string;
};

export type TenantMembership = {
  tenantId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
};

export type RealtimeApp = {
  appId: string;
  tenantId: string;
  name: string;
  org: string;
  key: string;
  secretPreview: string;
  cluster: string;
  host: string;
  status: "operational" | "degraded" | "offline";
  activeConnections: number;
  messagesToday: number;
  createdAt: string;
};

export type CreatedRealtimeApp = RealtimeApp & {
  plainTextSecret: string;
};

export type GatewayAppCredential = {
  appId: string;
  tenantId: string;
  key: string;
  secret: string;
  cluster: string;
  name?: string;
};

export type WebhookEndpoint = {
  id: string;
  tenantId: string;
  appId: string;
  url: string;
  enabledEvents: string[];
  status: "healthy" | "failing" | "paused";
  lastDeliveryAt: string | null;
  failureCount: number;
};

export type UsagePoint = {
  tenantId: string;
  appId: string;
  hour: string;
  connections: number;
  messages: number;
  webhookFailures: number;
};

export type RealtimeEvent = {
  id: string;
  tenantId: string;
  appId: string;
  time: string;
  type: string;
  channel: string;
  user: string;
  status: "sent" | "delivered" | "failed";
  meta: string;
};

export type ChannelSummary = {
  tenantId: string;
  appId: string;
  name: string;
  type: "public" | "private" | "presence";
  subscriptions: number;
  messagesPerSecond: number;
  lastActivity: string;
};

export type ApiToken = {
  id: string;
  tenantId: string;
  name: string;
  tokenPreview: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type VerifiedApiToken = {
  id: string;
  tenantId: string;
  name: string;
  scopes: string[];
};

export type UsageReportInput = {
  tenantId: string;
  appId: string;
  hour: string;
  connections: number;
  messages: number;
  webhookFailures?: number;
};

export type EventReportInput = {
  tenantId: string;
  appId: string;
  type: string;
  channel: string;
  user: string;
  status: RealtimeEvent["status"];
  meta: string;
  time?: string;
};

export type ChannelReportInput = {
  tenantId: string;
  appId: string;
  name: string;
  type: ChannelSummary["type"];
  subscriptions: number;
  messagesPerSecond: number;
  lastActivity?: string;
};

export type DashboardOverview = {
  tenant: Tenant;
  currentApp: RealtimeApp | null;
  apps: RealtimeApp[];
  webhooks: WebhookEndpoint[];
  usage: UsagePoint[];
  events: RealtimeEvent[];
  channels: ChannelSummary[];
  apiTokens: ApiToken[];
  totals: {
    activeConnections: number;
    messagesToday: number;
    peakConnections: number;
    webhookFailures: number;
  };
};

export interface OrchestratorStore {
  ensureTenantForUser(input: {
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    tenantId?: string;
  }): TenantMembership;
  listTenantMemberships(userId: string): TenantMembership[];
  getOverview(tenantId: string): DashboardOverview;
  listApps(tenantId: string): RealtimeApp[];
  listGatewayApps(tenantId: string): GatewayAppCredential[];
  createApp(input: { tenantId: string; name: string }): CreatedRealtimeApp;
  listWebhooks(tenantId: string, appId: string): WebhookEndpoint[];
  createWebhook(input: {
    tenantId: string;
    appId: string;
    url: string;
    enabledEvents: string[];
  }): WebhookEndpoint;
  listApiTokens(tenantId: string): ApiToken[];
  createApiToken(input: {
    tenantId: string;
    name: string;
    scopes?: string[];
  }): { token: ApiToken; plainTextToken: string };
  verifyApiToken(plainTextToken: string): VerifiedApiToken | null;
  reportUsage(input: UsageReportInput): UsagePoint;
  reportEvent(input: EventReportInput): RealtimeEvent;
  reportChannel(input: ChannelReportInput): ChannelSummary;
}
