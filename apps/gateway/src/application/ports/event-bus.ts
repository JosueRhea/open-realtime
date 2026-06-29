import type { RealtimeEvent } from "../../domain/realtime-event";

export interface EventBus {
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(handler: (event: RealtimeEvent) => void | Promise<void>): Promise<() => Promise<void> | void>;
}
