import type {
  ApiToken,
  ChannelReportInput,
  ChannelSummary,
  CreatedRealtimeApp,
  DashboardOverview,
  EventReportInput,
  GatewayAppCredential,
  RealtimeApp,
  RealtimeEvent,
  UsagePoint,
  UsageReportInput,
  VerifiedApiToken,
  WebhookEndpoint,
  TenantMembership,
} from "@/lib/orchestrator/types";

export interface AsyncOrchestratorStore {
  ensureTenantForUser(input: {
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    tenantId?: string;
  }): Promise<TenantMembership>;
  listTenantMemberships(userId: string): Promise<TenantMembership[]>;
  getOverview(tenantId: string): Promise<DashboardOverview>;
  listApps(tenantId: string): Promise<RealtimeApp[]>;
  listGatewayApps(tenantId: string): Promise<GatewayAppCredential[]>;
  createApp(input: { tenantId: string; name: string }): Promise<CreatedRealtimeApp>;
  listWebhooks(tenantId: string, appId: string): Promise<WebhookEndpoint[]>;
  createWebhook(input: {
    tenantId: string;
    appId: string;
    url: string;
    enabledEvents: string[];
  }): Promise<WebhookEndpoint>;
  listApiTokens(tenantId: string): Promise<ApiToken[]>;
  createApiToken(input: {
    tenantId: string;
    name: string;
    scopes?: string[];
  }): Promise<{ token: ApiToken; plainTextToken: string }>;
  verifyApiToken(plainTextToken: string): Promise<VerifiedApiToken | null>;
  reportUsage(input: UsageReportInput): Promise<UsagePoint>;
  reportEvent(input: EventReportInput): Promise<RealtimeEvent>;
  reportChannel(input: ChannelReportInput): Promise<ChannelSummary>;
}
