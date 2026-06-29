import type { AppRegistry, TenantApp } from "../../application/ports/app-registry";

export interface HttpOrchestratorAppRegistryOptions {
  baseUrl: string;
  token: string;
  fetchFn?: typeof fetch;
  refreshIntervalMs?: number;
}

type RegistryResponse = {
  tenantId: string;
  apps: TenantApp[];
};

export class HttpOrchestratorAppRegistry implements AppRegistry {
  private cachedApps: TenantApp[] | undefined;
  private expiresAt = 0;

  constructor(private readonly options: HttpOrchestratorAppRegistryOptions) {}

  async findByKey(key: string): Promise<TenantApp | undefined> {
    const apps = await this.apps();
    return apps.find((app) => app.key === key);
  }

  async findById(appId: string): Promise<TenantApp | undefined> {
    const apps = await this.apps();
    return apps.find((app) => app.appId === appId);
  }

  async defaultApp(): Promise<TenantApp> {
    const app = (await this.apps())[0];
    if (!app) {
      throw new Error("Orchestrator registry returned no apps");
    }
    return app;
  }

  private async apps(): Promise<TenantApp[]> {
    if (this.cachedApps && Date.now() < this.expiresAt) {
      return this.cachedApps;
    }

    const response = await (this.options.fetchFn ?? fetch)(
      `${this.baseUrl}/api/gateway/apps`,
      {
        headers: {
          authorization: `Bearer ${this.options.token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Unable to load orchestrator app registry: HTTP ${response.status}`);
    }

    const body = (await response.json()) as RegistryResponse;
    if (!Array.isArray(body.apps)) {
      throw new Error("Orchestrator app registry response must include apps");
    }

    this.cachedApps = body.apps.map((app) => ({
      ...app,
      tenantId: app.tenantId ?? body.tenantId,
    }));
    this.expiresAt = Date.now() + this.refreshIntervalMs;
    return this.cachedApps;
  }

  private get refreshIntervalMs(): number {
    return Math.max(1000, this.options.refreshIntervalMs ?? 10000);
  }

  private get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, "");
  }
}
