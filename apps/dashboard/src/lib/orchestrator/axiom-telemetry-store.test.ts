import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  AxiomTelemetryClient,
  AxiomTelemetryOrchestratorStore,
} from "@/lib/orchestrator/axiom-telemetry-store";
import { SqliteAsyncOrchestratorStore } from "@/lib/orchestrator/sqlite-async-adapter";
import { SqliteOrchestratorStore } from "@/lib/orchestrator/sqlite-adapter";

describe("AxiomTelemetryClient", () => {
  it("queries Axiom tabular results for dashboard telemetry", async () => {
    const requests: Array<{ url: string; body: { apl: string; startTime: string } }> = [];
    const client = new AxiomTelemetryClient({
      token: "token",
      dataset: "open-realtime",
      apiUrl: "https://axiom.example",
      fetchFn: async (url, init) => {
        const body = JSON.parse(String(init?.body)) as { apl: string; startTime: string };
        requests.push({ url: String(url), body });

        if (body.apl.includes("summarize peak=max(connections)")) {
          return jsonTable(["peak"], [[6]]);
        }

        if (body.apl.includes("by bin(_time, 1m)")) {
          return jsonTable(
            ["_time", "connections", "messages"],
            [["2026-07-01T10:00:00Z"], [3], [9]],
          );
        }

        if (body.apl.includes("webhook.queued")) {
          return jsonTable(
            ["_time", "event", "level", "url", "status", "webhook_id", "event_count", "durable"],
            [
              ["2026-07-01T10:02:00Z"],
              ["webhook.delivery_failed"],
              ["warn"],
              ["https://example.com/webhook"],
              [500],
              ["wh_1"],
              [2],
              [null],
            ],
          );
        }

        if (body.apl.includes("project _time, event")) {
          return jsonTable(
            ["_time", "event", "channel", "socket_id", "event_name", "level", "service"],
            [
              ["2026-07-01T10:01:00Z"],
              ["message.delivered"],
              ["chat"],
              ["socket-1"],
              ["server:update"],
              ["info"],
              ["open-realtime"],
            ],
          );
        }

        if (body.apl.includes("by channel")) {
          return jsonTable(
            ["channel", "subscriptions", "messages", "last_activity"],
            [["presence-chat"], [2], [11], [1782915022793000000]],
          );
        }

        if (body.apl.includes("opened=countif")) {
          return jsonTable(["opened", "closed"], [[5], [2]]);
        }

        if (body.apl.includes("webhook.delivery_failed")) {
          return jsonTable(["failures"], [[1]]);
        }

        return jsonTable(["messages"], [[7]]);
      },
    });

    const overview = await client.overview({
      tenantId: "tenant-1",
      appId: "app-1",
      usageRange: "1h",
    });

    expect(overview.usage).toEqual([
      {
        tenantId: "tenant-1",
        appId: "app-1",
        hour: "2026-07-01T10:00:00Z",
        connections: 3,
        messages: 9,
        webhookFailures: 0,
      },
    ]);
    expect(overview.events[0]).toMatchObject({
      type: "server:update",
      channel: "chat",
      user: "socket-1",
      status: "sent",
    });
    expect(overview.channels[0]).toMatchObject({
      name: "presence-chat",
      type: "presence",
      subscriptions: 2,
      messagesPerSecond: 11,
    });
    expect(overview.webhookLogs[0]).toMatchObject({
      event: "webhook.delivery_failed",
      url: "https://example.com/webhook",
      status: "failed",
      httpStatus: 500,
      eventCount: 2,
      webhookId: "wh_1",
    });
    expect(overview.activeConnections).toBe(3);
    expect(overview.messagesToday).toBe(7);
    expect(overview.peakConnections).toBe(6);
    expect(overview.webhookFailures).toBe(1);
    expect(requests[0]).toMatchObject({
      url: "https://axiom.example/v1/datasets/_apl?format=tabular",
      body: { startTime: "now-1h" },
    });
    expect(requests[0].body.apl).toContain('["open-realtime"]');
    expect(requests[0].body.apl).toContain('app_id == "app-1"');
    expect(requests[0].body.apl).toContain("by bin(_time, 1m)");
    expect(
      requests.find((request) =>
        request.body.apl.includes("summarize peak=max(connections)"),
      )?.body.apl,
    ).toContain("by bin(_time, 1m)");
    expect(
      requests
        .filter((request) =>
          request.body.apl.includes("opened=countif") ||
          request.body.apl.includes("event == 'message.delivered'") ||
          request.body.apl.includes("event == 'webhook.delivery_failed'"),
        )
        .every((request) => request.body.startTime === "now-1h"),
    ).toBe(true);
  });

  it("marks dashboard observability as configured when Axiom is connected", async () => {
    const sqlite = new SqliteOrchestratorStore(new Database(":memory:"));
    const app = sqlite.createApp({ tenantId: "tenant-1", name: "Production" });
    const store = new AxiomTelemetryOrchestratorStore(
      new SqliteAsyncOrchestratorStore(sqlite),
      new AxiomTelemetryClient({
        token: "token",
        dataset: "open-realtime",
        fetchFn: async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as { apl: string };
          if (body.apl.includes("by bin(_time, 1h)")) {
            if (body.apl.includes("summarize peak=max(connections)")) {
              return jsonTable(["peak"], [[3]]);
            }
            return jsonTable(
              ["_time", "connections", "messages"],
              [["2026-07-01T10:00:00Z"], [3], [9]],
            );
          }
          if (body.apl.includes("webhook.queued")) {
            return jsonTable(
              ["_time", "event", "level", "url", "status", "webhook_id", "event_count", "durable"],
              [[], [], [], [], [], [], [], []],
            );
          }
          if (body.apl.includes("project _time, event")) {
            return jsonTable(
              ["_time", "event", "channel", "socket_id", "event_name", "level", "service"],
              [[], [], [], [], [], [], []],
            );
          }
          if (body.apl.includes("by channel")) {
            return jsonTable(
              ["channel", "subscriptions", "messages", "last_activity"],
              [[], [], [], []],
            );
          }
          if (body.apl.includes("opened=countif")) {
            return jsonTable(["opened", "closed"], [[3], [1]]);
          }
          if (body.apl.includes("webhook.delivery_failed")) {
            return jsonTable(["failures"], [[0]]);
          }
          return jsonTable(["messages"], [[9]]);
        },
      }),
    );

    const overview = await store.getOverview("tenant-1", app.appId);

    expect(overview.observability).toEqual({
      provider: "axiom",
      configured: true,
    });
    expect(overview.totals.activeConnections).toBe(2);
    expect(overview.totals.messagesToday).toBe(9);
    expect(overview.totals.peakConnections).toBe(3);
  });

  it("uses day buckets for day-based usage ranges", async () => {
    const requests: Array<{ apl: string; startTime: string }> = [];
    const client = new AxiomTelemetryClient({
      token: "token",
      dataset: "open-realtime",
      fetchFn: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { apl: string; startTime: string };
        requests.push(body);

        if (body.apl.includes("summarize peak=max(connections)")) {
          return jsonTable(["peak"], [[4]]);
        }
        if (body.apl.includes("summarize connections=countif")) {
          return jsonTable(
            ["_time", "connections", "messages"],
            [["2026-07-01T00:00:00Z"], [4], [12]],
          );
        }
        if (body.apl.includes("webhook.queued")) {
          return jsonTable(
            ["_time", "event", "level", "url", "status", "webhook_id", "event_count", "durable"],
            [[], [], [], [], [], [], [], []],
          );
        }
        if (body.apl.includes("project _time, event")) {
          return jsonTable(
            ["_time", "event", "channel", "socket_id", "event_name", "level", "service"],
            [[], [], [], [], [], [], []],
          );
        }
        if (body.apl.includes("by channel")) {
          return jsonTable(
            ["channel", "subscriptions", "messages", "last_activity"],
            [[], [], [], []],
          );
        }
        if (body.apl.includes("opened=countif")) {
          return jsonTable(["opened", "closed"], [[4], [0]]);
        }
        if (body.apl.includes("webhook.delivery_failed")) {
          return jsonTable(["failures"], [[0]]);
        }
        return jsonTable(["messages"], [[12]]);
      },
    });

    await client.overview({
      tenantId: "tenant-1",
      appId: "app-1",
      usageRange: "7d",
    });

    expect(
      requests.find((request) => request.apl.includes("summarize connections=countif"))
        ?.apl,
    ).toContain("by bin(_time, 1d)");
    expect(
      requests.find((request) => request.apl.includes("summarize peak=max(connections)"))
        ?.apl,
    ).toContain("by bin(_time, 1d)");
    expect(
      requests
        .filter((request) =>
          request.apl.includes("summarize connections=countif") ||
          request.apl.includes("summarize peak=max(connections)") ||
          request.apl.includes("opened=countif") ||
          request.apl.includes("event == 'message.delivered'") ||
          request.apl.includes("event == 'webhook.delivery_failed'"),
        )
        .every((request) => request.startTime === "now-7d"),
    ).toBe(true);

    requests.length = 0;

    await client.overview({
      tenantId: "tenant-1",
      appId: "app-1",
      usageRange: "30d",
    });

    expect(
      requests.find((request) => request.apl.includes("summarize connections=countif"))
        ?.apl,
    ).toContain("by bin(_time, 1d)");
    expect(
      requests.find((request) => request.apl.includes("summarize peak=max(connections)"))
        ?.apl,
    ).toContain("by bin(_time, 1d)");
    expect(
      requests
        .filter((request) =>
          request.apl.includes("summarize connections=countif") ||
          request.apl.includes("summarize peak=max(connections)") ||
          request.apl.includes("opened=countif") ||
          request.apl.includes("event == 'message.delivered'") ||
          request.apl.includes("event == 'webhook.delivery_failed'"),
        )
        .every((request) => request.startTime === "now-30d"),
    ).toBe(true);
  });
});

function jsonTable(fields: string[], columns: unknown[][]) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        format: "tabular",
        tables: [
          {
            name: "0",
            fields: fields.map((name) => ({ name, type: "string" })),
            columns,
          },
        ],
      }),
      { status: 200 },
    ),
  );
}
