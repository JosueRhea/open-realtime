import { SqliteOrchestratorStore } from "@/lib/orchestrator/sqlite-adapter";
import type { AsyncOrchestratorStore } from "@/lib/orchestrator/async-types";
import type {
  ChannelReportInput,
  DashboardOverviewOptions,
  EventReportInput,
  UsageReportInput,
} from "@/lib/orchestrator/types";

export class SqliteAsyncOrchestratorStore implements AsyncOrchestratorStore {
  constructor(private readonly store = new SqliteOrchestratorStore()) {}

  async ensureTenantForUser(input: {
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    tenantId?: string;
  }) {
    return this.store.ensureTenantForUser(input);
  }

  async listTenantMemberships(userId: string) {
    return this.store.listTenantMemberships(userId);
  }

  async getOverview(
    tenantId: string,
    appId?: string,
    options?: DashboardOverviewOptions,
  ) {
    return this.store.getOverview(tenantId, appId, options);
  }

  async listApps(tenantId: string) {
    return this.store.listApps(tenantId);
  }

  async listGatewayApps(tenantId: string) {
    return this.store.listGatewayApps(tenantId);
  }

  async createApp(input: { tenantId: string; name: string }) {
    return this.store.createApp(input);
  }

  async listWebhooks(tenantId: string, appId: string) {
    return this.store.listWebhooks(tenantId, appId);
  }

  async createWebhook(input: {
    tenantId: string;
    appId: string;
    url: string;
    enabledEvents: string[];
  }) {
    return this.store.createWebhook(input);
  }

  async listApiTokens(tenantId: string) {
    return this.store.listApiTokens(tenantId);
  }

  async createApiToken(input: {
    tenantId: string;
    name: string;
    scopes?: string[];
  }) {
    return this.store.createApiToken(input);
  }

  async verifyApiToken(plainTextToken: string) {
    return this.store.verifyApiToken(plainTextToken);
  }

  async reportUsage(input: UsageReportInput) {
    return this.store.reportUsage(input);
  }

  async reportEvent(input: EventReportInput) {
    return this.store.reportEvent(input);
  }

  async reportChannel(input: ChannelReportInput) {
    return this.store.reportChannel(input);
  }
}
