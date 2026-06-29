import Redis from "ioredis";
import type { EventBus } from "../../application/ports/event-bus";
import type { RealtimeEvent } from "../../domain/realtime-event";

export interface RedisEventBusOptions {
  url: string;
  channel?: string;
}

export class RedisEventBus implements EventBus {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly channel: string;

  constructor(options: RedisEventBusOptions) {
    this.publisher = new Redis(options.url, { lazyConnect: true });
    this.subscriber = new Redis(options.url, { lazyConnect: true });
    this.channel = options.channel ?? "open-realtime:events";
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.publisher.connect().catch(ignoreAlreadyConnected);
    await this.publisher.publish(this.channel, JSON.stringify(event));
  }

  async subscribe(handler: (event: RealtimeEvent) => void | Promise<void>): Promise<() => Promise<void>> {
    await this.subscriber.connect().catch(ignoreAlreadyConnected);
    await this.subscriber.subscribe(this.channel);
    const listener = (channel: string, message: string) => {
      if (channel !== this.channel) return;
      try {
        void handler(JSON.parse(message) as RealtimeEvent);
      } catch (error) {
        console.error("Failed to parse realtime event from Redis", error);
      }
    };
    this.subscriber.on("message", listener);

    return async () => {
      this.subscriber.off("message", listener);
      await this.subscriber.unsubscribe(this.channel);
    };
  }
}

function ignoreAlreadyConnected(error: unknown): void {
  if (!(error instanceof Error) || !error.message.includes("already connecting")) {
    throw error;
  }
}
