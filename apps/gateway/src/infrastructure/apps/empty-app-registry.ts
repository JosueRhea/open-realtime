import type { AppRegistry, TenantApp } from "../../application/ports/app-registry";

export class EmptyAppRegistry implements AppRegistry {
  async findByKey(): Promise<TenantApp | undefined> {
    return undefined;
  }

  async findById(): Promise<TenantApp | undefined> {
    return undefined;
  }

  async defaultApp(): Promise<TenantApp> {
    throw new Error("No apps are available yet");
  }
}
