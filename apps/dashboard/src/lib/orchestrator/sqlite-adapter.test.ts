import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { SqliteOrchestratorStore } from "@/lib/orchestrator/sqlite-adapter";

function createStore() {
  return new SqliteOrchestratorStore(new Database(":memory:"));
}

describe("SqliteOrchestratorStore", () => {
  it("provisions a tenant membership for dashboard users", () => {
    const store = createStore();

    const membership = store.ensureTenantForUser({
      userId: "user-1",
      userName: "Ada",
      userEmail: "ada@example.com",
      tenantId: "tenant-1",
    });

    expect(membership).toMatchObject({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
    });
    expect(store.listTenantMemberships("user-1")).toEqual([membership]);
    expect(store.ensureTenantForUser({ userId: "user-1", tenantId: "tenant-1" }))
      .toEqual(membership);
    expect(store.getOverview("tenant-1").tenant).toMatchObject({
      id: "tenant-1",
      mode: "self-hosted",
    });
  });

  it("creates and verifies tenant-scoped API tokens", () => {
    const store = createStore();

    const created = store.createApiToken({
      tenantId: "tenant-1",
      name: "Gateway",
      scopes: ["ingest:write"],
    });

    expect(created.token).toMatchObject({
      tenantId: "tenant-1",
      name: "Gateway",
      scopes: ["ingest:write"],
    });
    expect(created.plainTextToken).toContain("tenant-1");
    expect(store.verifyApiToken(created.plainTextToken)).toMatchObject({
      tenantId: "tenant-1",
      scopes: ["ingest:write"],
    });
    expect(store.verifyApiToken("bad-token")).toBeNull();
  });

  it("stores app secrets encrypted and returns gateway credentials", () => {
    const store = createStore();
    const app = store.createApp({ tenantId: "tenant-1", name: "Production" });

    const gatewayApps = store.listGatewayApps("tenant-1");

    expect(gatewayApps).toEqual([
      expect.objectContaining({
        appId: app.appId,
        tenantId: "tenant-1",
        key: app.key,
        cluster: app.cluster,
        name: app.name,
      }),
    ]);
    expect(gatewayApps[0]?.secret).toMatch(/^sec_/);
    expect(gatewayApps[0]?.secret).not.toBe(app.secretPreview);
  });

  it("builds overview for the selected app while listing all app credentials", () => {
    const store = createStore();
    const firstApp = store.createApp({ tenantId: "tenant-1", name: "Production" });
    const secondApp = store.createApp({ tenantId: "tenant-1", name: "Sandbox" });

    store.reportUsage({
      tenantId: "tenant-1",
      appId: secondApp.appId,
      hour: "13:00",
      connections: 7,
      messages: 11,
    });

    const overview = store.getOverview("tenant-1", secondApp.appId);

    expect(overview.currentApp?.appId).toBe(secondApp.appId);
    expect(overview.usage).toEqual([
      expect.objectContaining({ appId: secondApp.appId, connections: 7 }),
    ]);
    expect(overview.gatewayApps.map((app) => app.appId).sort()).toEqual(
      [firstApp.appId, secondApp.appId].sort(),
    );
    expect(overview.gatewayApps.every((app) => app.secret.startsWith("sec_"))).toBe(true);
  });

  it("writes usage, events, channels, and webhooks only for the matching tenant app", () => {
    const store = createStore();
    const app = store.createApp({ tenantId: "tenant-1", name: "Production" });

    expect(() =>
      store.reportUsage({
        tenantId: "other-tenant",
        appId: app.appId,
        hour: "12:00",
        connections: 1,
        messages: 1,
      }),
    ).toThrow("was not found for tenant other-tenant");

    store.reportUsage({
      tenantId: "tenant-1",
      appId: app.appId,
      hour: "12:00",
      connections: 12,
      messages: 24,
      webhookFailures: 2,
    });
    store.reportEvent({
      tenantId: "tenant-1",
      appId: app.appId,
      type: "message_sent",
      channel: "presence-room",
      user: "system",
      status: "sent",
      meta: "gateway",
    });
    store.reportChannel({
      tenantId: "tenant-1",
      appId: app.appId,
      name: "presence-room",
      type: "presence",
      subscriptions: 3,
      messagesPerSecond: 4,
    });
    store.createWebhook({
      tenantId: "tenant-1",
      appId: app.appId,
      url: "https://example.com/webhooks",
      enabledEvents: ["member_added"],
    });

    const overview = store.getOverview("tenant-1");
    expect(overview.totals).toMatchObject({
      activeConnections: 12,
      messagesToday: 24,
      webhookFailures: 0,
    });
    expect(overview.usage).toHaveLength(1);
    expect(overview.events).toHaveLength(1);
    expect(overview.channels).toHaveLength(1);
    expect(overview.webhooks).toHaveLength(1);
  });

  it("returns usage buckets for the selected range in chronological order", () => {
    const store = createStore();
    const app = store.createApp({ tenantId: "tenant-1", name: "Production" });

    for (let index = 0; index < 30; index += 1) {
      store.reportUsage({
        tenantId: "tenant-1",
        appId: app.appId,
        hour: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        connections: index,
        messages: index * 2,
      });
    }

    const overview = store.getOverview("tenant-1", app.appId);

    expect(overview.usage).toHaveLength(24);
    expect(overview.usage[0]?.hour).toBe("2026-06-07T00:00:00.000Z");
    expect(overview.usage.at(-1)?.hour).toBe("2026-06-30T00:00:00.000Z");

    expect(store.getOverview("tenant-1", app.appId, { usageRange: "1h" }).usage)
      .toHaveLength(1);
    expect(store.getOverview("tenant-1", app.appId, { usageRange: "7d" }).usage)
      .toHaveLength(30);
    expect(store.getOverview("tenant-1", app.appId, { usageRange: "30d" }).usage)
      .toHaveLength(30);
  });

  it("aggregates connection deltas instead of trusting one gateway instance", () => {
    const store = createStore();
    const app = store.createApp({ tenantId: "tenant-1", name: "Production" });

    store.reportUsage({
      tenantId: "tenant-1",
      appId: app.appId,
      hour: "2026-06-30T12:00:00.000Z",
      connections: 1,
      connectionDelta: 1,
      messages: 0,
    });
    store.reportUsage({
      tenantId: "tenant-1",
      appId: app.appId,
      hour: "2026-06-30T12:00:00.000Z",
      connections: 1,
      connectionDelta: 1,
      messages: 0,
    });
    store.reportUsage({
      tenantId: "tenant-1",
      appId: app.appId,
      hour: "2026-06-30T12:00:00.000Z",
      connections: 0,
      connectionDelta: -1,
      messages: 0,
    });

    const overview = store.getOverview("tenant-1", app.appId);

    expect(overview.totals.activeConnections).toBe(1);
    expect(overview.usage).toEqual([
      expect.objectContaining({ connections: 1 }),
    ]);
  });
});
