import Redis from "ioredis";
import type {
  PusherWebhookEvent,
  WebhookDispatcher,
} from "../../application/ports/webhook-dispatcher";
import type { Observability } from "../../application/ports/observability";
import type { PusherCredentials } from "../../application/ports/pusher-authenticator";
import { deliverWebhookBatch } from "./webhook-delivery";

export interface RedisWebhookDispatcherOptions {
  credentials: PusherCredentials;
  urls: string[];
  redisUrl: string;
  prefix: string;
  enabledEvents?: Set<string>;
  batchSize?: number;
  flushIntervalMs?: number;
  lockMs?: number;
  fetchFn?: typeof fetch;
  redisClient?: RedisWebhookClient;
  observability?: Observability;
}

export class RedisWebhookDispatcher implements WebhookDispatcher {
  private readonly redis: RedisWebhookClient;
  private readonly workerId = `${process.pid}:${Math.random().toString(36).slice(2)}`;
  private readonly timer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: RedisWebhookDispatcherOptions) {
    this.redis = options.redisClient ?? new Redis(options.redisUrl);

    if (this.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.drain();
      }, this.flushIntervalMs);
      this.timer.unref?.();
    }
  }

  async dispatch(events: PusherWebhookEvent[]): Promise<void> {
    const filtered = this.filterEvents(events);
    if (filtered.length === 0 || this.options.urls.length === 0) return;

    await this.redis.rpush(this.queueKey, ...filtered.map((event) => JSON.stringify(event)));
    this.options.observability?.record({
      name: "webhook.queued",
      fields: {
        app_id: appIdForEvents(filtered),
        event_count: filtered.length,
        durable: true,
      },
    });

    const queued = await this.redis.llen(this.queueKey);
    if (queued >= this.batchSize || this.flushIntervalMs <= 0) {
      await this.drain();
    }
  }

  async drain(): Promise<void> {
    if (this.options.urls.length === 0) return;

    const lock = await this.redis.set(this.lockKey, this.workerId, "PX", this.lockMs, "NX");
    if (lock !== "OK") return;

    try {
      while (true) {
        const rawEvents = await this.redis.lrange(this.queueKey, 0, this.batchSize - 1);
        if (rawEvents.length === 0) return;

        const events = rawEvents.map((event) => JSON.parse(event) as PusherWebhookEvent);
        try {
          await deliverWebhookBatch(events, this.options);
        } catch (error) {
          console.error("Pusher webhook delivery failed, keeping Redis batch queued", error);
          this.scheduleRetry();
          return;
        }

        await this.redis.ltrim(this.queueKey, rawEvents.length, -1);

        if (rawEvents.length < this.batchSize) return;
      }
    } finally {
      await this.releaseLock();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.redis.quit();
  }

  private filterEvents(events: PusherWebhookEvent[]): PusherWebhookEvent[] {
    if (!this.options.enabledEvents || this.options.enabledEvents.size === 0) {
      return events;
    }

    return events.filter((event) => this.options.enabledEvents?.has(event.name));
  }

  private async releaseLock(): Promise<void> {
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      this.lockKey,
      this.workerId,
    );
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.drain();
    }, this.nextRetryDelayMs);
    this.retryTimer.unref?.();
  }

  private get queueKey(): string {
    return `${this.options.prefix}:webhooks:queue`;
  }

  private get lockKey(): string {
    return `${this.options.prefix}:webhooks:lock`;
  }

  private get batchSize(): number {
    return Math.max(1, this.options.batchSize ?? 100);
  }

  private get flushIntervalMs(): number {
    return this.options.flushIntervalMs ?? 1000;
  }

  private get lockMs(): number {
    return Math.max(1000, this.options.lockMs ?? 30000);
  }

  private get nextRetryDelayMs(): number {
    return Math.max(1000, this.flushIntervalMs);
  }
}

export interface RedisWebhookClient {
  rpush(key: string, ...values: string[]): Promise<number> | number;
  llen(key: string): Promise<number> | number;
  set(
    key: string,
    value: string,
    px: "PX",
    ttl: number,
    nx: "NX",
  ): Promise<"OK" | null> | "OK" | null;
  lrange(key: string, start: number, stop: number): Promise<string[]> | string[];
  ltrim(key: string, start: number, stop: number): Promise<unknown> | unknown;
  eval(script: string, keys: number, key: string, value: string): Promise<unknown> | unknown;
  quit(): Promise<unknown> | unknown;
}

function appIdForEvents(events: PusherWebhookEvent[]): string | undefined {
  const appIds = new Set(events.map((event) => event.app_id).filter(Boolean));
  if (appIds.size === 0) return undefined;
  if (appIds.size === 1) return [...appIds][0];
  return "multiple";
}
