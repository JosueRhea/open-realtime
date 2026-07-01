import type { EventBus } from "./ports/event-bus";
import { credentialsFor, type AppRegistry } from "./ports/app-registry";
import type { Observability } from "./ports/observability";
import type { PresenceStore } from "./ports/presence-store";
import type { PusherAuthenticatorFactory } from "./ports/pusher-authenticator";
import type { SocketRegistry } from "./ports/socket-registry";
import type { PusherWebhookEvent, WebhookDispatcher } from "./ports/webhook-dispatcher";
import type { UsageReporter } from "./usage-reporter";
import type { PresenceUser, RealtimeEvent, Subscription } from "../domain/realtime-event";
import type { RealtimeSocket } from "../domain/realtime-socket";
import { parsePresenceUser } from "../domain/presence-user";

interface ClientMessage {
  event: string;
  data?: unknown;
  channel?: string;
}

interface SubscribeData {
  channel?: string;
  auth?: string;
  channel_data?: string;
}

interface SigninData {
  auth?: string;
  user_data?: string;
}

interface UserData {
  id?: string;
  [key: string]: unknown;
}

const TERMINATE_USER_EVENT = "pusher_internal:terminate_user_connections";
const noopObservability: Observability = {
  record: () => {},
  flush: async () => {},
};

export class PusherProtocolService {
  constructor(
    private readonly registry: SocketRegistry,
    private readonly bus: EventBus,
    private readonly presence: PresenceStore,
    private readonly apps: AppRegistry,
    private readonly authenticatorFactory: PusherAuthenticatorFactory,
    private readonly webhooks: WebhookDispatcher,
    private readonly observability: Observability = noopObservability,
    private readonly usage?: UsageReporter,
  ) {}

  async start(): Promise<() => Promise<void> | void> {
    return this.bus.subscribe((event) => {
      if (event.event === TERMINATE_USER_EVENT) {
        this.registry.terminateUser(event.appId, String(event.data));
        this.observability.record({
          name: "user.terminate_connections.received",
          fields: {
            app_id: event.appId,
            user_id: String(event.data),
          },
        });
        return;
      }

      this.registry.broadcast(event);
      void this.apps.findById(event.appId).then((app) => {
        if (app) this.usage?.message(app, event.channel, event.event);
        this.observability.record({
          name: "message.delivered",
          fields: {
            channel: event.channel,
            app_id: event.appId,
            tenant_id: app?.tenantId,
            event_name: event.event,
            client_event: isClientEvent(event.event),
            user_event: isServerToUserChannel(event.channel),
            has_excluded_socket: Boolean(event.socketId),
          },
        });
      });
    });
  }

  async connect(socket: RealtimeSocket, appKey: string): Promise<void> {
    const app = await this.apps.findByKey(appKey);
    if (!app) {
      this.observability.record({
        name: "connection.rejected",
        level: "warn",
        fields: {
          reason: "unknown_app_key",
        },
      });
      socket.close(4001, "Unknown app key");
      return;
    }

    this.registry.add(socket, app.appId);
    this.usage?.connectionOpened(app);
    this.observability.record({
      name: "connection.opened",
      fields: {
        app_id: app.appId,
        tenant_id: app.tenantId,
        socket_id: socket.id,
      },
    });
    this.send(socket, "pusher:connection_established", {
      socket_id: socket.id,
      activity_timeout: 120,
    });
  }

  async disconnect(socketId: string): Promise<void> {
    const appId = this.registry.appId(socketId);
    const app = appId ? await this.apps.findById(appId) : undefined;
    const subscriptions = this.registry.remove(socketId);
    this.usage?.connectionClosed(app, subscriptions, socketId);
    this.observability.record({
      name: "connection.closed",
      fields: {
        app_id: app?.appId ?? appId,
        tenant_id: app?.tenantId,
        socket_id: socketId,
        subscription_count: subscriptions.length,
      },
    });
    for (const subscription of subscriptions.filter((item) => isPresenceChannel(item.channel))) {
      await this.removePresenceSubscription(subscription);
    }
  }

  async receive(socketId: string, raw: string): Promise<void> {
    const socket = this.registry.get(socketId);
    if (!socket) return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.sendError(socket, "Invalid JSON payload");
      this.observability.record({
        name: "protocol.invalid_json",
        level: "warn",
        fields: {
          socket_id: socketId,
        },
      });
      return;
    }

    switch (message.event) {
      case "pusher:ping":
        this.send(socket, "pusher:pong", {});
        return;
      case "pusher:subscribe":
        await this.subscribe(socket, parseClientData<SubscribeData>(message.data));
        return;
      case "pusher:signin":
        await this.signin(socket, parseClientData<SigninData>(message.data));
        return;
      case "pusher:unsubscribe":
        await this.unsubscribe(socket, parseClientData<SubscribeData>(message.data));
        return;
      default:
        if (isClientEvent(message.event)) {
          await this.forwardClientEvent(socket, message);
          return;
        }

        this.sendError(socket, `Unsupported client event: ${message.event}`);
    }
  }

  async trigger(event: RealtimeEvent): Promise<void> {
    await this.bus.publish(event);
  }

  async users(channel: string) {
    const app = await this.apps.defaultApp();
    return this.usersForApp(app.appId, channel);
  }

  async usersForApp(appId: string, channel: string) {
    return this.presence.users(appId, channel);
  }

  async terminateUserConnections(userId: string): Promise<void> {
    const app = await this.apps.defaultApp();
    await this.terminateUserConnectionsForApp(app.appId, userId);
  }

  async terminateUserConnectionsForApp(appId: string, userId: string): Promise<void> {
    await this.bus.publish({
      appId,
      channel: serverToUserChannel(userId),
      event: TERMINATE_USER_EVENT,
      data: userId,
    });
    this.observability.record({
      name: "user.terminate_connections.requested",
      fields: {
        app_id: appId,
        user_id: userId,
      },
    });
  }

  async signedInSocketIds(userId: string): Promise<string[]> {
    const app = await this.apps.defaultApp();
    return this.registry.socketIdsForUser(app.appId, userId);
  }

  private async signin(socket: RealtimeSocket, data: SigninData): Promise<void> {
    const app = await this.appForSocket(socket);
    if (!app) return;
    const userData = data?.user_data;
    if (!userData) {
      this.sendError(socket, "Missing user_data");
      this.observability.record({
        name: "user.signin_failed",
        level: "warn",
        fields: {
          socket_id: socket.id,
          reason: "missing_user_data",
        },
      });
      return;
    }

    const ok = this.authenticatorFactory(credentialsFor(app)).validateUserAuth({
      auth: data.auth ?? "",
      socketId: socket.id,
      userData,
    });
    if (!ok) {
      this.sendError(socket, "Invalid user auth");
      this.observability.record({
        name: "user.signin_failed",
        level: "warn",
        fields: {
          socket_id: socket.id,
          reason: "invalid_auth",
        },
      });
      return;
    }

    const user = parseUserData(userData);
    if (!user?.id) {
      this.sendError(socket, "Invalid user_data");
      this.observability.record({
        name: "user.signin_failed",
        level: "warn",
        fields: {
          socket_id: socket.id,
          reason: "invalid_user_data",
        },
      });
      return;
    }

    this.registry.signIn(socket.id, app.appId, String(user.id));
    this.observability.record({
      name: "user.signed_in",
      fields: {
        socket_id: socket.id,
        app_id: app.appId,
        tenant_id: app.tenantId,
        user_id: String(user.id),
      },
    });
    this.send(socket, "pusher:signin_success", {
      user_data: userData,
    });
  }

  private async subscribe(socket: RealtimeSocket, data: SubscribeData): Promise<void> {
    const app = await this.appForSocket(socket);
    if (!app) return;
    const channel = data?.channel;
    if (!channel) {
      this.sendError(socket, "Missing channel");
      this.observability.record({
        name: "channel.subscribe_failed",
        level: "warn",
        fields: {
          socket_id: socket.id,
          reason: "missing_channel",
        },
      });
      return;
    }

    if (isServerToUserChannel(channel)) {
      const userId = serverToUserId(channel);
      if (!userId || this.registry.signedInUser(socket.id) !== userId) {
        this.sendError(socket, "User must be signed in before subscribing to server-to-user channel", channel);
        this.observability.record({
          name: "channel.subscribe_failed",
          level: "warn",
          fields: {
            socket_id: socket.id,
            channel,
            reason: "user_not_signed_in",
          },
        });
        return;
      }
    } else if (isPrivateChannel(channel) || isPresenceChannel(channel)) {
      const ok = this.authenticatorFactory(credentialsFor(app)).validateChannelAuth({
        auth: data.auth ?? "",
        socketId: socket.id,
        channel,
        channelData: data.channel_data,
      });

      if (!ok) {
        this.sendError(socket, "Invalid channel auth", channel);
        this.observability.record({
          name: "channel.subscribe_failed",
          level: "warn",
          fields: {
            socket_id: socket.id,
            channel,
            reason: "invalid_auth",
          },
        });
        return;
      }
    }

    const subscription: Subscription = {
      appId: app.appId,
      socketId: socket.id,
      channel,
      channelData: data.channel_data,
    };

    this.registry.subscribe(subscription);
    this.usage?.subscribed(app, channel);

    let subscriptionData: unknown = {};
    if (isPresenceChannel(channel)) {
      const usersBefore = await this.presence.users(app.appId, channel);
      await this.presence.add(subscription);
      const users = await this.presence.users(app.appId, channel);
      subscriptionData = {
        presence: {
          count: users.length,
          ids: users.map((user) => user.id),
          hash: Object.fromEntries(users.map((user) => [user.id, user.info ?? {}])),
        },
      };
      await this.emitPresenceJoin(subscription, usersBefore, users);
    }

    this.send(socket, "pusher_internal:subscription_succeeded", subscriptionData, channel);
    this.observability.record({
      name: "channel.subscribed",
      fields: {
        socket_id: socket.id,
        app_id: app.appId,
        tenant_id: app.tenantId,
        channel,
        private: isPrivateChannel(channel),
        presence: isPresenceChannel(channel),
        server_to_user: isServerToUserChannel(channel),
      },
    });
  }

  private async unsubscribe(socket: RealtimeSocket, data: SubscribeData): Promise<void> {
    if (!data?.channel) return;
    const subscription = this.registry.unsubscribe(socket.id, data.channel);
    if (subscription && isPresenceChannel(subscription.channel)) {
      await this.removePresenceSubscription(subscription);
    }
    if (subscription) {
      const app = await this.apps.findById(subscription.appId);
      if (app) this.usage?.unsubscribed(app, subscription.channel);
      this.observability.record({
        name: "channel.unsubscribed",
        fields: {
          socket_id: socket.id,
          channel: subscription.channel,
        },
      });
    }
  }

  private async forwardClientEvent(socket: RealtimeSocket, message: ClientMessage): Promise<void> {
    const app = await this.appForSocket(socket);
    if (!app) return;
    const channel = message.channel;
    if (!channel) {
      this.sendError(socket, "Missing channel for client event");
      this.observability.record({
        name: "client_event.rejected",
        level: "warn",
        fields: {
          socket_id: socket.id,
          event_name: message.event,
          reason: "missing_channel",
        },
      });
      return;
    }

    if (!isPrivateChannel(channel) && !isPresenceChannel(channel)) {
      this.sendError(socket, "Client events require a private or presence channel", channel);
      this.observability.record({
        name: "client_event.rejected",
        level: "warn",
        fields: {
          socket_id: socket.id,
          channel,
          event_name: message.event,
          reason: "public_channel",
        },
      });
      return;
    }

    const subscription = this.registry
      .subscriptions(socket.id)
      .find((item) => item.channel === channel);
    if (!subscription) {
      this.sendError(socket, "Client must be subscribed to the channel before triggering events", channel);
      this.observability.record({
        name: "client_event.rejected",
        level: "warn",
        fields: {
          socket_id: socket.id,
          channel,
          event_name: message.event,
          reason: "not_subscribed",
        },
      });
      return;
    }

    this.observability.record({
      name: "client_event.accepted",
      fields: {
        socket_id: socket.id,
        app_id: app.appId,
        channel,
        event_name: message.event,
      },
    });
    await this.bus.publish({
      appId: app.appId,
      channel,
      event: message.event,
      data: parseEventData(message.data),
      socketId: socket.id,
    });
  }

  private async removePresenceSubscription(subscription: Subscription): Promise<void> {
    const usersBefore = await this.presence.users(subscription.appId, subscription.channel);
    await this.presence.remove(subscription);
    const usersAfter = await this.presence.users(subscription.appId, subscription.channel);
    await this.emitPresenceLeave(subscription, usersBefore, usersAfter);
  }

  private async emitPresenceJoin(
    subscription: Subscription,
    usersBefore: PresenceUser[],
    usersAfter: PresenceUser[],
  ): Promise<void> {
    const user = subscription.channelData ? parsePresenceUser(subscription.channelData) : null;
    if (!user || hasUser(usersBefore, user.id)) return;

    const events = [];
    if (usersBefore.length === 0) {
      events.push({
        name: "channel_occupied" as const,
        channel: subscription.channel,
        app_id: subscription.appId,
      });
    }
    events.push({
      name: "member_added" as const,
      channel: subscription.channel,
      app_id: subscription.appId,
      user_id: user.id,
    });

    await Promise.all([
      this.bus.publish({
        appId: subscription.appId,
        channel: subscription.channel,
        event: "pusher_internal:member_added",
        data: {
          user_id: user.id,
          user_info: user.info ?? {},
        },
        socketId: subscription.socketId,
      }),
      this.webhooks.dispatch(events),
    ]);
    this.observability.record({
      name: "presence.member_added",
      fields: {
        channel: subscription.channel,
        app_id: subscription.appId,
        user_id: user.id,
        channel_occupied: usersBefore.length === 0,
      },
    });
  }

  private async emitPresenceLeave(
    subscription: Subscription,
    usersBefore: PresenceUser[],
    usersAfter: PresenceUser[],
  ): Promise<void> {
    const user = subscription.channelData ? parsePresenceUser(subscription.channelData) : null;
    if (!user || hasUser(usersAfter, user.id)) return;

    const events: PusherWebhookEvent[] = [
      {
        name: "member_removed",
        channel: subscription.channel,
        app_id: subscription.appId,
        user_id: user.id,
      },
    ];
    if (usersBefore.length > 0 && usersAfter.length === 0) {
      events.push({
        name: "channel_vacated",
        channel: subscription.channel,
        app_id: subscription.appId,
      });
    }

    await Promise.all([
      this.bus.publish({
        appId: subscription.appId,
        channel: subscription.channel,
        event: "pusher_internal:member_removed",
        data: {
          user_id: user.id,
          user_info: user.info ?? {},
        },
        socketId: subscription.socketId,
      }),
      this.webhooks.dispatch(events),
    ]);
    this.observability.record({
      name: "presence.member_removed",
      fields: {
        channel: subscription.channel,
        app_id: subscription.appId,
        user_id: user.id,
        channel_vacated: usersBefore.length > 0 && usersAfter.length === 0,
      },
    });
  }

  private send(socket: RealtimeSocket, event: string, data: unknown, channel?: string): void {
    const payload = {
      event,
      ...(channel ? { channel } : {}),
      data: JSON.stringify(data),
    };
    socket.send(JSON.stringify(payload));
  }

  private sendError(socket: RealtimeSocket, message: string, channel?: string): void {
    this.send(socket, "pusher:error", { message }, channel);
  }

  private async appForSocket(socket: RealtimeSocket) {
    const appId = this.registry.appId(socket.id);
    if (!appId) {
      this.sendError(socket, "Socket is not attached to an app");
      return undefined;
    }

    const app = await this.apps.findById(appId);
    if (!app) {
      this.sendError(socket, "Unknown app");
      return undefined;
    }

    return app;
  }
}

function hasUser(users: PresenceUser[], id: string): boolean {
  return users.some((user) => user.id === id);
}

function isPrivateChannel(channel: string): boolean {
  return channel.startsWith("private-");
}

function isPresenceChannel(channel: string): boolean {
  return channel.startsWith("presence-");
}

function isClientEvent(event: string): boolean {
  return event.startsWith("client-");
}

function isServerToUserChannel(channel: string): boolean {
  return channel.startsWith("#server-to-user-");
}

function serverToUserChannel(userId: string): string {
  return `#server-to-user-${userId}`;
}

function serverToUserId(channel: string): string | undefined {
  return isServerToUserChannel(channel) ? channel.slice("#server-to-user-".length) : undefined;
}

function parseUserData(data: string): UserData | null {
  try {
    return JSON.parse(data) as UserData;
  } catch {
    return null;
  }
}

function parseClientData<T>(data: unknown): T {
  if (typeof data !== "string") return (data ?? {}) as T;

  try {
    return JSON.parse(data) as T;
  } catch {
    return {} as T;
  }
}

function parseEventData(data: unknown): unknown {
  if (typeof data !== "string") return data ?? {};

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
