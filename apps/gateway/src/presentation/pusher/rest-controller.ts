import type { PusherProtocolService } from "../../application/pusher-protocol-service";
import { credentialsFor, type AppRegistry, type TenantApp } from "../../application/ports/app-registry";
import type { Observability } from "../../application/ports/observability";
import type { PusherAuthenticatorFactory } from "../../application/ports/pusher-authenticator";
import type { RealtimeEvent } from "../../domain/realtime-event";

export interface HttpRequestSnapshot {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string;
}

export class PusherRestController {
  constructor(
    private readonly protocol: PusherProtocolService,
    private readonly apps: AppRegistry,
    private readonly authenticatorFactory: PusherAuthenticatorFactory,
    private readonly observability?: Observability,
  ) {}

  async trigger(appId: string, request: HttpRequestSnapshot): Promise<Response> {
    const app = await this.authorize(appId, request);
    if (app instanceof Response) return app;

    const body = parseJson<PusherEventRequest>(request.body);
    const event = body?.event ?? body?.name;
    const data = body?.data ?? {};
    const socketId = body?.socket_id;
    const channels = eventChannels(body);
    if (channels.length === 0 || !event) {
      this.observability?.record({
        name: "rest.trigger_rejected",
        level: "warn",
        fields: {
          reason: "missing_channel_or_event",
        },
      });
      return json({ error: "Missing channel(s) or event" }, 422);
    }

    await Promise.all(
      channels.map((channel) =>
        this.protocol.trigger({
          channel,
          appId: app.appId,
          event,
          data,
          socketId,
        }),
      ),
    );

    this.observability?.record({
      name: "rest.trigger",
      fields: {
        event_name: event,
        app_id: app.appId,
        tenant_id: app.tenantId,
        channel_count: channels.length,
        socket_id: socketId,
      },
    });
    return json({});
  }

  async triggerBatch(appId: string, request: HttpRequestSnapshot): Promise<Response> {
    const app = await this.authorize(appId, request);
    if (app instanceof Response) return app;

    const body = parseJson<PusherBatchRequest>(request.body);
    if (!Array.isArray(body?.batch)) {
      this.observability?.record({
        name: "rest.batch_trigger_rejected",
        level: "warn",
        fields: {
          reason: "missing_batch",
        },
      });
      return json({ error: "Missing batch" }, 422);
    }

    await Promise.all(
      body.batch.map((event) =>
        this.protocol.trigger({
          channel: event.channel,
          appId: app.appId,
          event: event.name ?? event.event,
          data: event.data ?? {},
          socketId: event.socket_id,
        }),
      ),
    );

    this.observability?.record({
      name: "rest.batch_trigger",
      fields: {
        event_count: body.batch.length,
        app_id: app.appId,
        tenant_id: app.tenantId,
      },
    });
    return json({});
  }

  async users(appId: string, channel: string, request: HttpRequestSnapshot): Promise<Response> {
    const app = await this.authorize(appId, request);
    if (app instanceof Response) return app;

    const users = await this.protocol.usersForApp(app.appId, channel);
    this.observability?.record({
      name: "rest.presence_users",
      fields: {
        channel,
        app_id: app.appId,
        tenant_id: app.tenantId,
        user_count: users.length,
      },
    });
    return json({
      users: users.map((user) => ({
        id: user.id,
        user_info: user.info ?? {},
      })),
    });
  }

  async terminateUserConnections(appId: string, userId: string, request: HttpRequestSnapshot): Promise<Response> {
    const app = await this.authorize(appId, request);
    if (app instanceof Response) return app;

    await this.protocol.terminateUserConnectionsForApp(app.appId, userId);
    this.observability?.record({
      name: "rest.terminate_user_connections",
      fields: {
        user_id: userId,
        app_id: app.appId,
        tenant_id: app.tenantId,
      },
    });
    return json({});
  }

  private async authorize(appId: string, request: HttpRequestSnapshot): Promise<TenantApp | Response> {
    const app = await this.apps.findById(appId);
    if (!app) {
      this.observability?.record({
        name: "rest.auth_failed",
        level: "warn",
        fields: {
          reason: "unknown_app",
          path: request.path,
        },
      });
      return json({ error: "Unknown app" }, 403);
    }

    if (!this.authenticatorFactory(credentialsFor(app)).validateRestRequest(request)) {
      this.observability?.record({
        name: "rest.auth_failed",
        level: "warn",
        fields: {
          reason: "invalid_signature",
          path: request.path,
        },
      });
      return json({ error: "Invalid auth signature" }, 401);
    }

    return app;
  }
}

interface PusherEventRequest {
  channel?: string;
  channels?: string[];
  event?: string;
  name?: string;
  data?: unknown;
  socket_id?: string;
}

interface PusherBatchRequest {
  batch?: Array<RealtimeEvent & { name?: string; socket_id?: string }>;
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function eventChannels(body: PusherEventRequest | null): string[] {
  if (!body) return [];
  if (Array.isArray(body.channels)) return body.channels.filter(Boolean);
  return body.channel ? [body.channel] : [];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
