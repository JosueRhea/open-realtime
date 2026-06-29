import type { RealtimeEvent, Subscription } from "../../domain/realtime-event";
import type { RealtimeSocket } from "../../domain/realtime-socket";
import type { SocketRegistry } from "../../application/ports/socket-registry";

export class InMemorySocketRegistry implements SocketRegistry {
  private readonly sockets = new Map<string, RealtimeSocket>();
  private readonly appIdBySocket = new Map<string, string>();
  private readonly subscriptionsBySocket = new Map<string, Map<string, Subscription>>();
  private readonly socketIdsByChannel = new Map<string, Set<string>>();
  private readonly userIdBySocket = new Map<string, string>();
  private readonly socketIdsByUser = new Map<string, Set<string>>();

  add(socket: RealtimeSocket, appId: string): void {
    this.sockets.set(socket.id, socket);
    this.appIdBySocket.set(socket.id, appId);
  }

  remove(socketId: string): Subscription[] {
    this.sockets.delete(socketId);
    this.removeUser(socketId);
    this.appIdBySocket.delete(socketId);
    const subscriptions = [...(this.subscriptionsBySocket.get(socketId)?.values() ?? [])];
    for (const subscription of subscriptions) {
      this.unsubscribe(socketId, subscription.channel);
    }
    return subscriptions;
  }

  get(socketId: string): RealtimeSocket | undefined {
    return this.sockets.get(socketId);
  }

  appId(socketId: string): string | undefined {
    return this.appIdBySocket.get(socketId);
  }

  signIn(socketId: string, appId: string, userId: string): void {
    this.removeUser(socketId);
    this.userIdBySocket.set(socketId, userId);

    const key = userKey(appId, userId);
    const socketIds = this.socketIdsByUser.get(key) ?? new Set();
    socketIds.add(socketId);
    this.socketIdsByUser.set(key, socketIds);
  }

  signedInUser(socketId: string): string | undefined {
    return this.userIdBySocket.get(socketId);
  }

  socketIdsForUser(appId: string, userId: string): string[] {
    return [...(this.socketIdsByUser.get(userKey(appId, userId)) ?? [])];
  }

  terminateUser(appId: string, userId: string): void {
    for (const socketId of this.socketIdsForUser(appId, userId)) {
      this.sockets.get(socketId)?.close(4009, "User connection terminated");
    }
  }

  subscribe(subscription: Subscription): void {
    const bySocket = this.subscriptionsBySocket.get(subscription.socketId) ?? new Map();
    bySocket.set(subscription.channel, subscription);
    this.subscriptionsBySocket.set(subscription.socketId, bySocket);

    const key = channelKey(subscription.appId, subscription.channel);
    const socketIds = this.socketIdsByChannel.get(key) ?? new Set();
    socketIds.add(subscription.socketId);
    this.socketIdsByChannel.set(key, socketIds);
  }

  unsubscribe(socketId: string, channel: string): Subscription | undefined {
    const bySocket = this.subscriptionsBySocket.get(socketId);
    const subscription = bySocket?.get(channel);
    bySocket?.delete(channel);
    if (bySocket?.size === 0) this.subscriptionsBySocket.delete(socketId);

    const key = subscription ? channelKey(subscription.appId, channel) : undefined;
    const socketIds = key ? this.socketIdsByChannel.get(key) : undefined;
    socketIds?.delete(socketId);
    if (key && socketIds?.size === 0) this.socketIdsByChannel.delete(key);

    return subscription;
  }

  subscriptions(socketId: string): Subscription[] {
    return [...(this.subscriptionsBySocket.get(socketId)?.values() ?? [])];
  }

  broadcast(event: RealtimeEvent): void {
    const socketIds = this.socketIdsByChannel.get(channelKey(event.appId, event.channel));
    if (!socketIds) return;

    const payload = JSON.stringify({
      event: event.event,
      channel: event.channel,
      data: JSON.stringify(event.data),
    });

    for (const socketId of socketIds) {
      if (event.socketId && event.socketId === socketId) continue;
      this.sockets.get(socketId)?.send(payload);
    }
  }

  private removeUser(socketId: string): void {
    const userId = this.userIdBySocket.get(socketId);
    if (!userId) return;
    const appId = this.appIdBySocket.get(socketId);
    if (!appId) return;

    this.userIdBySocket.delete(socketId);
    const key = userKey(appId, userId);
    const socketIds = this.socketIdsByUser.get(key);
    socketIds?.delete(socketId);
    if (socketIds?.size === 0) this.socketIdsByUser.delete(key);
  }
}

function channelKey(appId: string, channel: string): string {
  return `${appId}:${channel}`;
}

function userKey(appId: string, userId: string): string {
  return `${appId}:${userId}`;
}
