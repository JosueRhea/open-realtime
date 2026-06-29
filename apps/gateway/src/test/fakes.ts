import type { EventBus } from "../application/ports/event-bus";
import type { Observability, ObservabilityEvent } from "../application/ports/observability";
import type {
  PusherWebhookEvent,
  WebhookDispatcher,
} from "../application/ports/webhook-dispatcher";
import type { RealtimeEvent } from "../domain/realtime-event";
import type { RealtimeSocket } from "../domain/realtime-socket";

export class FakeSocket implements RealtimeSocket {
  readonly sent: string[] = [];
  closed?: { code?: number; reason?: string };

  constructor(readonly id: string) {}

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  events(): Array<{ event: string; channel?: string; data: unknown }> {
    return this.sent.map((payload) => {
      const parsed = JSON.parse(payload);
      return {
        event: parsed.event,
        channel: parsed.channel,
        data: parsed.data ? JSON.parse(parsed.data) : undefined,
      };
    });
  }
}

export class RecordingWebhookDispatcher implements WebhookDispatcher {
  readonly batches: PusherWebhookEvent[][] = [];

  async dispatch(events: PusherWebhookEvent[]): Promise<void> {
    this.batches.push(events);
  }
}

export class RecordingEventBus implements EventBus {
  readonly published: RealtimeEvent[] = [];
  private readonly handlers = new Set<(event: RealtimeEvent) => void | Promise<void>>();

  async publish(event: RealtimeEvent): Promise<void> {
    this.published.push(event);
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }

  async subscribe(handler: (event: RealtimeEvent) => void | Promise<void>): Promise<() => void> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export class RecordingObservability implements Observability {
  readonly events: ObservabilityEvent[] = [];

  record(event: ObservabilityEvent): void {
    this.events.push(event);
  }

  async flush(): Promise<void> {}
}
