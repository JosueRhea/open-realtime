import { describe, expect, it } from "vitest";

import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("loads static single-app config by default", () => {
    const config = loadConfig({
      PUSHER_APP_ID: "app-1",
      PUSHER_KEY: "key-1",
      PUSHER_SECRET: "secret-1",
    });

    expect(config.appRegistry).toMatchObject({ source: "static" });
    expect(config.apps).toEqual([
      expect.objectContaining({
        appId: "app-1",
        key: "key-1",
        secret: "secret-1",
        tenantId: "self-hosted",
      }),
    ]);
    expect(config.pusher).toMatchObject({ appId: "app-1" });
  });

  it("does not require static pusher secrets in orchestrator registry mode", () => {
    const config = loadConfig({
      ORCHESTRATOR_APP_REGISTRY: "true",
      ORCHESTRATOR_APP_REGISTRY_REFRESH_MS: "2500",
      ORCHESTRATOR_URL: "https://orchestrator.test",
      ORCHESTRATOR_TOKEN: "token-1",
      ORCHESTRATOR_TENANT_ID: "tenant-1",
    });

    expect(config.appRegistry).toEqual({
      source: "orchestrator",
      refreshIntervalMs: 2500,
    });
    expect(config.apps).toEqual([]);
    expect(config.pusher).toBeUndefined();
    expect(config.orchestrator).toMatchObject({
      url: "https://orchestrator.test",
      token: "token-1",
      tenantId: "tenant-1",
    });
  });
});
