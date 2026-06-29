import { describe, expect, it, vi } from "vitest";
import { HttpWebhookDispatcher } from "./http-webhook-dispatcher";

describe("HttpWebhookDispatcher", () => {
  it("batches events across dispatch calls into one Pusher-shaped payload", async () => {
    const requests: Array<{ url: string; body: string; headers: HeadersInit | undefined }> = [];
    const dispatcher = new HttpWebhookDispatcher({
      credentials: {
        appId: "app",
        key: "key",
        secret: "secret",
      },
      urls: ["https://example.com/webhook"],
      batchSize: 10,
      flushIntervalMs: 1000,
      fetchFn: fakeFetch(requests),
    });

    await dispatcher.dispatch([{ name: "member_added", channel: "presence-business-209", user_id: "1" }]);
    await dispatcher.dispatch([{ name: "member_removed", channel: "presence-business-209", user_id: "1" }]);
    expect(requests).toHaveLength(0);

    await dispatcher.flush();

    expect(requests).toHaveLength(1);
    const payload = JSON.parse(requests[0].body);
    expect(payload.events).toEqual([
      { name: "member_added", channel: "presence-business-209", user_id: "1" },
      { name: "member_removed", channel: "presence-business-209", user_id: "1" },
    ]);
    expect((requests[0].headers as Record<string, string>)["x-pusher-key"]).toBe("key");
    expect((requests[0].headers as Record<string, string>)["x-pusher-signature"]).toBeTruthy();
  });

  it("flushes as soon as the configured batch size is reached", async () => {
    const requests: Array<{ url: string; body: string; headers: HeadersInit | undefined }> = [];
    const dispatcher = new HttpWebhookDispatcher({
      credentials: {
        appId: "app",
        key: "key",
        secret: "secret",
      },
      urls: ["https://example.com/webhook"],
      batchSize: 2,
      flushIntervalMs: 1000,
      fetchFn: fakeFetch(requests),
    });

    await dispatcher.dispatch([
      { name: "channel_occupied", channel: "presence-business-209" },
      { name: "member_added", channel: "presence-business-209", user_id: "1" },
    ]);

    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].body).events).toHaveLength(2);
  });

  it("flushes on the configured interval", async () => {
    vi.useFakeTimers();
    const requests: Array<{ url: string; body: string; headers: HeadersInit | undefined }> = [];
    const dispatcher = new HttpWebhookDispatcher({
      credentials: {
        appId: "app",
        key: "key",
        secret: "secret",
      },
      urls: ["https://example.com/webhook"],
      batchSize: 10,
      flushIntervalMs: 500,
      fetchFn: fakeFetch(requests),
    });

    await dispatcher.dispatch([{ name: "member_added", channel: "presence-business-209", user_id: "1" }]);
    expect(requests).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(500);

    expect(requests).toHaveLength(1);
    vi.useRealTimers();
  });

  it("retries failed in-memory deliveries instead of dropping the batch", async () => {
    vi.useFakeTimers();
    const statuses = [500, 200];
    const requests: Array<{ url: string; body: string; headers: HeadersInit | undefined }> = [];
    const dispatcher = new HttpWebhookDispatcher({
      credentials: {
        appId: "app",
        key: "key",
        secret: "secret",
      },
      urls: ["https://example.com/webhook"],
      batchSize: 1,
      flushIntervalMs: 1000,
      retryBaseDelayMs: 1000,
      fetchFn: (async (url, init) => {
        requests.push({
          url: String(url),
          body: String(init?.body ?? ""),
          headers: init?.headers,
        });
        return new Response("{}", { status: statuses.shift() ?? 200 });
      }) as typeof fetch,
    });

    await dispatcher.dispatch([{ name: "member_added", channel: "presence-business-209", user_id: "1" }]);
    expect(requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1].body).events).toEqual([
      { name: "member_added", channel: "presence-business-209", user_id: "1" },
    ]);
    vi.useRealTimers();
  });
});

function fakeFetch(requests: Array<{ url: string; body: string; headers: HeadersInit | undefined }>): typeof fetch {
  return (async (url, init) => {
    requests.push({
      url: String(url),
      body: String(init?.body ?? ""),
      headers: init?.headers,
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}
