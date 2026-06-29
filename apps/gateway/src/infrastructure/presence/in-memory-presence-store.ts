import type { PresenceStore } from "../../application/ports/presence-store";
import type { PresenceUser, Subscription } from "../../domain/realtime-event";
import { parsePresenceUser, uniquePresenceUsers } from "../../domain/presence-user";

export class InMemoryPresenceStore implements PresenceStore {
  private readonly channelDataByConnection = new Map<string, Map<string, string>>();

  async add(subscription: Subscription): Promise<void> {
    if (!subscription.channelData) return;
    const key = presenceKey(subscription.appId, subscription.channel);
    const channel = this.channelDataByConnection.get(key) ?? new Map();
    channel.set(subscription.socketId, subscription.channelData);
    this.channelDataByConnection.set(key, channel);
  }

  async remove(subscription: Subscription): Promise<void> {
    const key = presenceKey(subscription.appId, subscription.channel);
    const channel = this.channelDataByConnection.get(key);
    channel?.delete(subscription.socketId);
    if (channel?.size === 0) this.channelDataByConnection.delete(key);
  }

  async users(appId: string, channel: string): Promise<PresenceUser[]> {
    const entries = this.channelDataByConnection.get(presenceKey(appId, channel));
    if (!entries) return [];

    return uniquePresenceUsers(
      [...entries.values()]
        .map(parsePresenceUser)
        .filter((user): user is PresenceUser => user !== null),
    );
  }
}

function presenceKey(appId: string, channel: string): string {
  return `${appId}:${channel}`;
}
