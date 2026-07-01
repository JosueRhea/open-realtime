import type {
  PusherWebhookEvent,
  WebhookDispatcher,
} from "../../application/ports/webhook-dispatcher";
import type { Observability } from "../../application/ports/observability";
import type { PusherCredentials } from "../../application/ports/pusher-authenticator";
import { deliverWebhookBatch } from "./webhook-delivery";

export interface HttpWebhookDispatcherOptions {
  credentials: PusherCredentials;
  urls: string[];
  enabledEvents?: Set<string>;
  batchSize?: number;
  flushIntervalMs?: number;
  fetchFn?: typeof fetch;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  observability?: Observability;
}

export class HttpWebhookDispatcher implements WebhookDispatcher {
  private readonly pending: PusherWebhookEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(private readonly options: HttpWebhookDispatcherOptions) {}

  async dispatch(events: PusherWebhookEvent[]): Promise<void> {
    const filtered = this.filterEvents(events);
    if (filtered.length === 0 || this.options.urls.length === 0) return;

    this.pending.push(...filtered);
    this.options.observability?.record({
      name: "webhook.queued",
      fields: {
        app_id: appIdForEvents(filtered),
        event_count: filtered.length,
        durable: false,
      },
    });

    if (this.pending.length >= this.batchSize) {
      await this.flush();
      return;
    }

    if (this.flushIntervalMs <= 0) {
      await this.flush();
      return;
    }

    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.pending.length === 0) return this.flushPromise;

    const batch = this.pending.splice(0, this.batchSize);
    const delivered = await this.flushPromise.then(() => this.deliver(batch));
    this.flushPromise = Promise.resolve();
    if (!delivered) return;

    if (this.pending.length > 0) {
      if (this.pending.length >= this.batchSize || this.flushIntervalMs <= 0) {
        await this.flush();
      } else {
        this.scheduleFlush();
      }
    }
  }

  private async deliver(events: PusherWebhookEvent[]): Promise<boolean> {
    try {
      await deliverWebhookBatch(events, this.options);
      return true;
    } catch (error) {
      console.error("Pusher webhook delivery failed, requeueing in memory", error);
      this.pending.unshift(...events);
      this.scheduleFlush(this.nextRetryDelayMs);
      return false;
    }
  }

  private scheduleFlush(delayMs = this.flushIntervalMs): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, delayMs);
  }

  private filterEvents(events: PusherWebhookEvent[]): PusherWebhookEvent[] {
    if (!this.options.enabledEvents || this.options.enabledEvents.size === 0) {
      return events;
    }

    return events.filter((event) => this.options.enabledEvents?.has(event.name));
  }

  private get batchSize(): number {
    return Math.max(1, this.options.batchSize ?? 100);
  }

  private get flushIntervalMs(): number {
    return this.options.flushIntervalMs ?? 1000;
  }

  private get nextRetryDelayMs(): number {
    const base = Math.max(100, this.options.retryBaseDelayMs ?? this.flushIntervalMs);
    const max = Math.max(base, this.options.retryMaxDelayMs ?? 30000);
    return Math.min(max, base);
  }
}

function appIdForEvents(events: PusherWebhookEvent[]): string | undefined {
  const appIds = new Set(events.map((event) => event.app_id).filter(Boolean));
  if (appIds.size === 0) return undefined;
  if (appIds.size === 1) return [...appIds][0];
  return "multiple";
}
