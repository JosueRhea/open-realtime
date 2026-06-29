import { describe, expect, it, vi } from "vitest";

import { HttpOrchestratorReporter } from "./http-orchestrator-reporter";

describe("HttpOrchestratorReporter", () => {
  it("posts usage, events, and channels with bearer auth", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const reporter = new HttpOrchestratorReporter({
      baseUrl: "http://orchestrator.test/",
      token: "token-1",
      fetchFn,
    });

    await reporter.reportUsage({
      tenantId: "tenant-1",
      appId: "app",
      hour: "12:00",
      connections: 4,
      messages: 9,
      webhookFailures: 1,
    });
    await reporter.reportEvent({
      tenantId: "tenant-1",
      appId: "app",
      type: "message_sent",
      channel: "orders",
      user: "system",
      status: "sent",
      meta: "gateway",
    });
    await reporter.reportChannel({
      tenantId: "tenant-1",
      appId: "app",
      name: "orders",
      type: "public",
      subscriptions: 2,
      messagesPerSecond: 3,
    });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "http://orchestrator.test/api/ingest/usage",
      "http://orchestrator.test/api/ingest/events",
      "http://orchestrator.test/api/ingest/channels",
    ]);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer token-1",
        "content-type": "application/json",
      },
    });
  });

  it("throws when the orchestrator rejects a report", async () => {
    const reporter = new HttpOrchestratorReporter({
      baseUrl: "http://orchestrator.test",
      token: "token-1",
      fetchFn: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    });

    await expect(
      reporter.reportUsage({
        tenantId: "tenant-1",
        appId: "app",
        hour: "12:00",
        connections: 1,
        messages: 1,
        webhookFailures: 0,
      }),
    ).rejects.toThrow("HTTP 403");
  });
});
