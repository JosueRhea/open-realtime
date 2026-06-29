import { describe, expect, it } from "vitest";
import { AxiomObservability } from "./axiom-observability";

describe("AxiomObservability", () => {
  it("batches events to the Axiom ingest API", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const observability = new AxiomObservability({
      token: "token",
      dataset: "realtime-events",
      apiUrl: "https://axiom.example",
      service: "open-realtime",
      environment: "test",
      instanceId: "instance-1",
      batchSize: 2,
      flushIntervalMs: 10000,
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    observability.record({ name: "connection.opened", fields: { socket_id: "1.1" } });
    observability.record({ name: "channel.subscribed", fields: { channel: "orders" } });
    await observability.flush();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "https://axiom.example/v1/datasets/realtime-events/ingest?timestamp-field=timestamp",
    );
    expect(requests[0].init.headers).toMatchObject({
      authorization: "Bearer token",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(requests[0].init.body))).toMatchObject([
      {
        service: "open-realtime",
        environment: "test",
        instance_id: "instance-1",
        event: "connection.opened",
        socket_id: "1.1",
      },
      {
        event: "channel.subscribed",
        channel: "orders",
      },
    ]);
  });
});
