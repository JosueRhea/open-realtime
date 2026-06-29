import type { AppRegistry, TenantApp } from "../../application/ports/app-registry";

export class StaticAppRegistry implements AppRegistry {
  private readonly appsById = new Map<string, TenantApp>();
  private readonly appsByKey = new Map<string, TenantApp>();

  constructor(private readonly apps: TenantApp[]) {
    if (apps.length === 0) throw new Error("StaticAppRegistry requires at least one app");
    for (const app of apps) {
      this.appsById.set(app.appId, app);
      this.appsByKey.set(app.key, app);
    }
  }

  async findByKey(key: string): Promise<TenantApp | undefined> {
    return this.appsByKey.get(key);
  }

  async findById(appId: string): Promise<TenantApp | undefined> {
    return this.appsById.get(appId);
  }

  async defaultApp(): Promise<TenantApp> {
    return this.apps[0];
  }
}
