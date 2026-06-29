import { describe, expect, it } from "vitest";
import {
  RedisWebhookDispatcher,
  type RedisWebhookClient,
} from "./redis-webhook-dispatcher";

describe("RedisWebhookDispatcher", () => {
  it("keeps failed webhook batches in Redis until delivery succeeds", async () => {
    const redis = new FakeRedisWebhookClient();
    const statuses = [500, 200];
    const requests: Array<{ body: string }> = [];
    const dispatcher = new RedisWebhookDispatcher({
      credentials: {
        appId: "app",
        key: "key",
        secret: "secret",
      },
      urls: ["https://example.com/webhook"],
      redisUrl: "redis://unused",
      prefix: "test",
      batchSize: 10,
      flushIntervalMs: 0,
      redisClient: redis,
      fetchFn: (async (_url, init) => {
        requests.push({ body: String(init?.body ?? "") });
        return new Response("{}", { status: statuses.shift() ?? 200 });
      }) as typeof fetch,
    });

    await dispatcher.dispatch([{ name: "member_added", channel: "presence-business-209", user_id: "1" }]);

    expect(requests).toHaveLength(1);
    expect(redis.queue("test:webhooks:queue")).toHaveLength(1);

    await dispatcher.drain();

    expect(requests).toHaveLength(2);
    expect(redis.queue("test:webhooks:queue")).toHaveLength(0);
    expect(JSON.parse(requests[1].body).events).toEqual([
      { name: "member_added", channel: "presence-business-209", user_id: "1" },
    ]);
    await dispatcher.stop();
  });

  it("does not let concurrent workers drain the same batch", async () => {
    const redis = new FakeRedisWebhookClient();
    redis.locked = true;
    const requests: Array<{ body: string }> = [];
    const dispatcher = new RedisWebhookDispatcher({
      credentials: {
        appId: "app",
        key: "key",
        secret: "secret",
      },
      urls: ["https://example.com/webhook"],
      redisUrl: "redis://unused",
      prefix: "test",
      batchSize: 10,
      flushIntervalMs: 1000,
      redisClient: redis,
      fetchFn: (async (_url, init) => {
        requests.push({ body: String(init?.body ?? "") });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });

    await dispatcher.dispatch([{ name: "member_added", channel: "presence-business-209", user_id: "1" }]);
    await dispatcher.drain();
    await dispatcher.stop();

    expect(requests).toHaveLength(0);
    expect(redis.queue("test:webhooks:queue")).toHaveLength(1);
  });
});

class FakeRedisWebhookClient implements RedisWebhookClient {
  locked = false;
  private readonly lists = new Map<string, string[]>();

  queue(key: string): string[] {
    return [...(this.lists.get(key) ?? [])];
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length ?? 0;
  }

  async set(): Promise<"OK" | null> {
    if (this.locked) return null;
    this.locked = true;
    return "OK";
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length : stop + 1;
    this.lists.set(key, list.slice(start, end));
  }

  async eval(_script: string, _keys: number, _key: string, _value: string): Promise<number> {
    this.locked = false;
    return 1;
  }

  async quit(): Promise<void> {}
}
