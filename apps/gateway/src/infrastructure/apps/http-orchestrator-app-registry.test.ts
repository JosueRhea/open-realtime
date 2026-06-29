import { describe, expect, it, vi } from "vitest";

import { HttpOrchestratorAppRegistry } from "./http-orchestrator-app-registry";

describe("HttpOrchestratorAppRegistry", () => {
  it("loads apps from the orchestrator with bearer auth and caches them", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      Response.json({
        tenantId: "tenant-1",
        apps: [
          {
            appId: "app-1",
            key: "key-1",
            secret: "secret-1",
            cluster: "mt1",
            name: "Production",
          },
        ],
      }),
    );
    const registry = new HttpOrchestratorAppRegistry({
      baseUrl: "https://orchestrator.test/",
      token: "token-1",
      fetchFn,
      refreshIntervalMs: 30000,
    });

    await expect(registry.findByKey("key-1")).resolves.toMatchObject({
      appId: "app-1",
      tenantId: "tenant-1",
      secret: "secret-1",
    });
    await expect(registry.findById("app-1")).resolves.toMatchObject({
      key: "key-1",
    });
    await expect(registry.defaultApp()).resolves.toMatchObject({
      appId: "app-1",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://orchestrator.test/api/gateway/apps",
      {
        headers: {
          authorization: "Bearer token-1",
        },
      },
    );
  });

  it("throws when the orchestrator rejects the registry request", async () => {
    const registry = new HttpOrchestratorAppRegistry({
      baseUrl: "https://orchestrator.test",
      token: "token-1",
      fetchFn: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    });

    await expect(registry.defaultApp()).rejects.toThrow("HTTP 403");
  });
});
