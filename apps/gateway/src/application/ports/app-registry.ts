import type { PusherCredentials } from "./pusher-authenticator";

export interface TenantApp {
  appId: string;
  key: string;
  secret: string;
  cluster?: string;
  tenantId?: string;
  name?: string;
}

export interface AppRegistry {
  findByKey(key: string): Promise<TenantApp | undefined>;
  findById(appId: string): Promise<TenantApp | undefined>;
  defaultApp(): Promise<TenantApp>;
}

export function credentialsFor(app: TenantApp): PusherCredentials {
  return {
    appId: app.appId,
    key: app.key,
    secret: app.secret,
    cluster: app.cluster,
  };
}
