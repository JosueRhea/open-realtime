import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PusherProtocolService } from "../../application/pusher-protocol-service";
import { StaticAppRegistry } from "../../infrastructure/apps/static-app-registry";
import { InMemoryEventBus } from "../../infrastructure/event-bus/in-memory-event-bus";
import { InMemoryPresenceStore } from "../../infrastructure/presence/in-memory-presence-store";
import { InMemorySocketRegistry } from "../../infrastructure/registry/in-memory-socket-registry";
import { HmacPusherAuthenticator } from "../../infrastructure/security/hmac-pusher-authenticator";
import { NoopWebhookDispatcher } from "../../infrastructure/webhooks/noop-webhook-dispatcher";
import { FakeSocket } from "../../test/fakes";
import { PusherRestController } from "./rest-controller";

describe("PusherRestController", () => {
  it("accepts signed trigger requests and publishes to sockets", async () => {
    const { appRegistry, authenticatorFactory, protocol } = createSubject();
    await protocol.start();
    const controller = new PusherRestController(protocol, appRegistry, authenticatorFactory);
    const socket = new FakeSocket("1.1");
    await protocol.connect(socket, "key");
    await protocol.receive("1.1", JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));

    const body = JSON.stringify({ channel: "orders", event: "order-update", data: { order: 99 } });
    const response = await controller.trigger("app", signedRequest("/apps/app/events", body));

    expect(response.status).toBe(200);
    expect(socket.events().map((event) => event.event)).toContain("order-update");
  });

  it("accepts signed trigger requests with multiple channels", async () => {
    const { appRegistry, authenticatorFactory, protocol } = createSubject();
    await protocol.start();
    const controller = new PusherRestController(protocol, appRegistry, authenticatorFactory);
    const first = new FakeSocket("1.1");
    const second = new FakeSocket("2.2");
    await protocol.connect(first, "key");
    await protocol.connect(second, "key");
    await protocol.receive("1.1", JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));
    await protocol.receive("2.2", JSON.stringify({ event: "pusher:subscribe", data: { channel: "status" } }));

    const body = JSON.stringify({
      channels: ["orders", "status"],
      event: "shared-update",
      data: { ok: true },
    });
    const response = await controller.trigger("app", signedRequest("/apps/app/events", body));

    expect(response.status).toBe(200);
    expect(first.events().map((event) => event.event)).toContain("shared-update");
    expect(second.events().map((event) => event.event)).toContain("shared-update");
  });

  it("accepts official server SDK trigger payloads that use name", async () => {
    const { appRegistry, authenticatorFactory, protocol } = createSubject();
    await protocol.start();
    const controller = new PusherRestController(protocol, appRegistry, authenticatorFactory);
    const socket = new FakeSocket("1.1");
    await protocol.connect(socket, "key");
    await protocol.receive("1.1", JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));

    const body = JSON.stringify({ channel: "orders", name: "sdk-update", data: { ok: true } });
    const response = await controller.trigger("app", signedRequest("/apps/app/events", body));

    expect(response.status).toBe(200);
    expect(socket.events().map((event) => event.event)).toContain("sdk-update");
  });

  it("returns presence channel users for signed GET requests", async () => {
    const { appRegistry, authenticatorFactory, protocol } = createSubject();
    const controller = new PusherRestController(protocol, appRegistry, authenticatorFactory);
    const socket = new FakeSocket("1.1");
    const channel = "presence-business-209";
    const channelData = JSON.stringify({ user_id: "42", user_info: { name: "Ada" } });
    const auth = `key:${createHmac("sha256", "secret")
      .update(`${socket.id}:${channel}:${channelData}`)
      .digest("hex")}`;

    await protocol.connect(socket, "key");
    await protocol.receive(
      socket.id,
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          channel,
          auth,
          channel_data: channelData,
        },
      }),
    );

    const response = await controller.users(
      "app",
      channel,
      signedRequest(`/apps/app/channels/${channel}/users`, "", "GET"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      users: [{ id: "42", user_info: { name: "Ada" } }],
    });
  });

  it("accepts signed user connection termination requests", async () => {
    const { appRegistry, authenticatorFactory, protocol } = createSubject();
    await protocol.start();
    const controller = new PusherRestController(protocol, appRegistry, authenticatorFactory);
    const socket = new FakeSocket("1.1");
    await protocol.connect(socket, "key");
    await signIn(protocol, socket, { id: "42" });

    const response = await controller.terminateUserConnections(
      "app",
      "42",
      signedRequest("/apps/app/users/42/terminate_connections", "{}"),
    );

    expect(response.status).toBe(200);
    expect(socket.closed).toEqual({ code: 4009, reason: "User connection terminated" });
  });
});

function createSubject() {
  const appRegistry = new StaticAppRegistry([{
    appId: "app",
    key: "key",
    secret: "secret",
  }]);
  const authenticatorFactory = (credentials: { appId: string; key: string; secret: string; cluster?: string }) =>
    new HmacPusherAuthenticator(credentials);
  const protocol = new PusherProtocolService(
    new InMemorySocketRegistry(),
    new InMemoryEventBus(),
    new InMemoryPresenceStore(),
    appRegistry,
    authenticatorFactory,
    new NoopWebhookDispatcher(),
  );
  return { appRegistry, authenticatorFactory, protocol };
}

function signedRequest(path: string, body: string, method = "POST") {
  const query = {
    auth_key: "key",
    auth_timestamp: "1780000000",
    auth_version: "1.0",
    ...(body ? { body_md5: createHash("md5").update(body).digest("hex") } : {}),
  };
  const queryString = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return {
    method,
    path,
    query: {
      ...query,
      auth_signature: createHmac("sha256", "secret")
        .update(`${method}\n${path}\n${queryString}`)
        .digest("hex"),
    },
    body,
  };
}

async function signIn(
  protocol: PusherProtocolService,
  socket: FakeSocket,
  user: Record<string, unknown>,
): Promise<void> {
  const userData = JSON.stringify(user);
  const signature = createHmac("sha256", "secret")
    .update(`${socket.id}::user::${userData}`)
    .digest("hex");

  await protocol.receive(
    socket.id,
    JSON.stringify({
      event: "pusher:signin",
      data: {
        auth: `key:${signature}`,
        user_data: userData,
      },
    }),
  );
}
