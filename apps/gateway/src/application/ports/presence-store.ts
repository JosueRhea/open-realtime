import type { PresenceUser, Subscription } from "../../domain/realtime-event";

export interface PresenceStore {
  add(subscription: Subscription): Promise<void>;
  remove(subscription: Subscription): Promise<void>;
  users(appId: string, channel: string): Promise<PresenceUser[]>;
}
