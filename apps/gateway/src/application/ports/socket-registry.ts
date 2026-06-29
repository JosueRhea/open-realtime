import type { RealtimeEvent, Subscription } from "../../domain/realtime-event";
import type { RealtimeSocket } from "../../domain/realtime-socket";

export interface SocketRegistry {
  add(socket: RealtimeSocket, appId: string): void;
  remove(socketId: string): Subscription[];
  get(socketId: string): RealtimeSocket | undefined;
  appId(socketId: string): string | undefined;
  signIn(socketId: string, appId: string, userId: string): void;
  signedInUser(socketId: string): string | undefined;
  socketIdsForUser(appId: string, userId: string): string[];
  terminateUser(appId: string, userId: string): void;
  subscribe(subscription: Subscription): void;
  unsubscribe(socketId: string, channel: string): Subscription | undefined;
  subscriptions(socketId: string): Subscription[];
  broadcast(event: RealtimeEvent): void;
}
