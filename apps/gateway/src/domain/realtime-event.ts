export interface RealtimeEvent {
  appId: string;
  channel: string;
  event: string;
  data: unknown;
  socketId?: string;
}

export interface PresenceUser {
  id: string;
  info?: unknown;
}

export interface Subscription {
  appId: string;
  channel: string;
  socketId: string;
  channelData?: string;
}
