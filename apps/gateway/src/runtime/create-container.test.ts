import { describe, expect, it } from "vitest";

import { createContainer } from "./create-container";
import type { RuntimeConfig } from "./config";

describe("createContainer", () => {
  it("starts with an empty registry when hosted registry credentials are not ready yet", async () => {
    const container = await createContainer({
      apps: [],
      appRegistry: { source: "orchestrator", refreshIntervalMs: 10000 },
      redisPrefix: "test",
      observability: {
        driver: "none",
        service: "test",
        instanceId: "test",
        batchSize: 10,
        flushIntervalMs: 1000,
        maxQueueSize: 100,
      },
      webhookUrls: [],
      webhookEvents: new Set(),
      webhookBatchSize: 100,
      webhookFlushIntervalMs: 1000,
      orchestrator: {
        url: "https://dashboard.example.com",
        tenantId: "self-hosted",
        flushIntervalMs: 5000,
      },
      port: 3001,
    } satisfies RuntimeConfig);

    const response = await container.app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });
});
