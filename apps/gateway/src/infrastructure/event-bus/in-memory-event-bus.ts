import type { EventBus } from "../../application/ports/event-bus";
import type { RealtimeEvent } from "../../domain/realtime-event";

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Set<(event: RealtimeEvent) => void | Promise<void>>();

  async publish(event: RealtimeEvent): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }

  async subscribe(handler: (event: RealtimeEvent) => void | Promise<void>): Promise<() => void> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
