import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HmacPusherAuthenticator } from "../infrastructure/security/hmac-pusher-authenticator";
import { StaticAppRegistry } from "../infrastructure/apps/static-app-registry";
import { InMemoryPresenceStore } from "../infrastructure/presence/in-memory-presence-store";
import { InMemorySocketRegistry } from "../infrastructure/registry/in-memory-socket-registry";
import { FakeSocket, RecordingEventBus, RecordingWebhookDispatcher } from "../test/fakes";
import { PusherProtocolService } from "./pusher-protocol-service";

function createSubject() {
  const bus = new RecordingEventBus();
  const webhooks = new RecordingWebhookDispatcher();
  const appRegistry = new StaticAppRegistry([
    { appId: "app", key: "key", secret: "secret" },
    { appId: "other-app", key: "other-key", secret: "other-secret" },
  ]);
  const service = new PusherProtocolService(
    new InMemorySocketRegistry(),
    bus,
    new InMemoryPresenceStore(),
    appRegistry,
    (credentials) => new HmacPusherAuthenticator(credentials),
    webhooks,
  );
  return { service, bus, webhooks };
}

describe("PusherProtocolService", () => {
  it("rejects unknown app keys", async () => {
    const { service } = createSubject();
    const socket = new FakeSocket("1.1");

    await service.connect(socket, "wrong");

    expect(socket.closed).toEqual({ code: 4001, reason: "Unknown app key" });
  });

  it("delivers triggered events to subscribed public channels", async () => {
    const { service } = createSubject();
    await service.start();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await service.receive("1.1", JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));
    await service.trigger({ appId: "app", channel: "orders", event: "order-update", data: { order: 10 } });

    expect(socket.events().map((event) => event.event)).toContain("order-update");
  });

  it("does not deliver events across apps with the same channel name", async () => {
    const { service } = createSubject();
    await service.start();
    const first = new FakeSocket("1.1");
    const second = new FakeSocket("2.2");
    await service.connect(first, "key");
    await service.connect(second, "other-key");

    await service.receive(first.id, JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));
    await service.receive(second.id, JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));
    await service.trigger({ appId: "app", channel: "orders", event: "order-update", data: { order: 10 } });

    expect(first.events().map((event) => event.event)).toContain("order-update");
    expect(second.events().map((event) => event.event)).not.toContain("order-update");
  });

  it("accepts Pusher wire messages whose data field is a JSON string", async () => {
    const { service } = createSubject();
    await service.start();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await service.receive(
      "1.1",
      JSON.stringify({
        event: "pusher:subscribe",
        data: JSON.stringify({ channel: "orders" }),
      }),
    );
    await service.trigger({ appId: "app", channel: "orders", event: "order-update", data: { order: 10 } });

    expect(socket.events().map((event) => event.event)).toContain("order-update");
  });

  it("accepts Pusher wire unsubscribe messages whose data field is a JSON string", async () => {
    const { service } = createSubject();
    await service.start();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await service.receive("1.1", JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));
    await service.receive(
      "1.1",
      JSON.stringify({
        event: "pusher:unsubscribe",
        data: JSON.stringify({ channel: "orders" }),
      }),
    );
    await service.trigger({ appId: "app", channel: "orders", event: "order-update", data: { order: 10 } });

    expect(socket.events().map((event) => event.event)).not.toContain("order-update");
  });

  it("requires valid auth for private channels", async () => {
    const { service } = createSubject();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await service.receive(
      "1.1",
      JSON.stringify({
        event: "pusher:subscribe",
        data: { channel: "private-chats-209", auth: "key:bad" },
      }),
    );

    expect(socket.events().at(-1)).toMatchObject({
      event: "pusher:error",
      channel: "private-chats-209",
    });
  });

  it("forwards client events on subscribed private channels without echoing to the sender", async () => {
    const { service } = createSubject();
    await service.start();
    const sender = new FakeSocket("1.1");
    const receiver = new FakeSocket("2.2");
    await service.connect(sender, "key");
    await service.connect(receiver, "key");

    await subscribePrivate(service, sender, "private-chats-209");
    await subscribePrivate(service, receiver, "private-chats-209");

    await service.receive(
      sender.id,
      JSON.stringify({
        event: "client-typing",
        channel: "private-chats-209",
        data: JSON.stringify({ chatId: 10 }),
      }),
    );

    expect(receiver.events()).toContainEqual({
      event: "client-typing",
      channel: "private-chats-209",
      data: { chatId: 10 },
    });
    expect(sender.events().map((event) => event.event)).not.toContain("client-typing");
  });

  it("rejects client events on public channels", async () => {
    const { service } = createSubject();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");
    await service.receive("1.1", JSON.stringify({ event: "pusher:subscribe", data: { channel: "orders" } }));

    await service.receive(
      socket.id,
      JSON.stringify({
        event: "client-typing",
        channel: "orders",
        data: { chatId: 10 },
      }),
    );

    expect(socket.events().at(-1)).toMatchObject({
      event: "pusher:error",
      channel: "orders",
    });
  });

  it("rejects client events before the sender has subscribed to the channel", async () => {
    const { service } = createSubject();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await service.receive(
      socket.id,
      JSON.stringify({
        event: "client-typing",
        channel: "private-chats-209",
        data: { chatId: 10 },
      }),
    );

    expect(socket.events().at(-1)).toMatchObject({
      event: "pusher:error",
      channel: "private-chats-209",
    });
  });

  it("authenticates users and allows server-to-user channel subscriptions", async () => {
    const { service } = createSubject();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await signinUser(service, socket, { id: "42", name: "Ada" });
    await service.receive(
      socket.id,
      JSON.stringify({
        event: "pusher:subscribe",
        data: {
          channel: "#server-to-user-42",
        },
      }),
    );

    expect(socket.events()).toContainEqual({
      event: "pusher:signin_success",
      data: { user_data: JSON.stringify({ id: "42", name: "Ada" }) },
    });
    expect(socket.events()).toContainEqual({
      event: "pusher_internal:subscription_succeeded",
      channel: "#server-to-user-42",
      data: {},
    });
  });

  it("rejects invalid user authentication", async () => {
    const { service } = createSubject();
    const socket = new FakeSocket("1.1");
    await service.connect(socket, "key");

    await service.receive(
      socket.id,
      JSON.stringify({
        event: "pusher:signin",
        data: {
          auth: "key:bad",
          user_data: JSON.stringify({ id: "42" }),
        },
      }),
    );

    expect(socket.events().at(-1)).toMatchObject({
      event: "pusher:error",
      data: { message: "Invalid user auth" },
    });
  });

  it("delivers server-to-user events only to sockets signed in as that user", async () => {
    const { service } = createSubject();
    await service.start();
    const first = new FakeSocket("1.1");
    const second = new FakeSocket("2.2");
    await service.connect(first, "key");
    await service.connect(second, "key");

    await signinUser(service, first, { id: "42" });
    await signinUser(service, second, { id: "99" });
    await service.receive(
      first.id,
      JSON.stringify({ event: "pusher:subscribe", data: { channel: "#server-to-user-42" } }),
    );
    await service.receive(
      second.id,
      JSON.stringify({ event: "pusher:subscribe", data: { channel: "#server-to-user-99" } }),
    );

    await service.trigger({
      appId: "app",
      channel: "#server-to-user-42",
      event: "account-notice",
      data: { ok: true },
    });

    expect(first.events()).toContainEqual({
      event: "account-notice",
      channel: "#server-to-user-42",
      data: { ok: true },
    });
    expect(second.events().map((event) => event.event)).not.toContain("account-notice");
  });

  it("terminates all sockets signed in as a user", async () => {
    const { service } = createSubject();
    await service.start();
    const first = new FakeSocket("1.1");
    const second = new FakeSocket("2.2");
    const other = new FakeSocket("3.3");
    await service.connect(first, "key");
    await service.connect(second, "key");
    await service.connect(other, "key");

    await signinUser(service, first, { id: "42" });
    await signinUser(service, second, { id: "42" });
    await signinUser(service, other, { id: "99" });

    await service.terminateUserConnections("42");

    expect(first.closed).toEqual({ code: 4009, reason: "User connection terminated" });
    expect(second.closed).toEqual({ code: 4009, reason: "User connection terminated" });
    expect(other.closed).toBeUndefined();
  });

  it("emits presence member events and webhooks once per user", async () => {
    const { service, webhooks } = createSubject();
    await service.start();
    const first = new FakeSocket("1.1");
    const second = new FakeSocket("2.2");
    const observer = new FakeSocket("3.3");
    await service.connect(first, "key");
    await service.connect(second, "key");
    await service.connect(observer, "key");

    await subscribePresence(service, observer, "observer");
    await subscribePresence(service, first, "42");
    await subscribePresence(service, second, "42");
    await service.disconnect(first.id);

    const observerEvents = observer.events().map((event) => event.event);
    expect(observerEvents.filter((event) => event === "pusher_internal:member_added")).toHaveLength(1);
    expect(observerEvents).not.toContain("pusher_internal:member_removed");
    expect(webhooks.batches.flat().filter((event) => event.name === "member_added")).toHaveLength(2);
    expect(webhooks.batches.flat().filter((event) => event.name === "member_removed")).toHaveLength(0);

    await service.disconnect(second.id);
    expect(observer.events().map((event) => event.event)).toContain("pusher_internal:member_removed");
    expect(webhooks.batches.flat().filter((event) => event.name === "member_removed")).toHaveLength(1);
  });
});

async function signinUser(
  service: PusherProtocolService,
  socket: FakeSocket,
  user: Record<string, unknown>,
): Promise<void> {
  const userData = JSON.stringify(user);
  const signature = createHmac("sha256", "secret")
    .update(`${socket.id}::user::${userData}`)
    .digest("hex");

  await service.receive(
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

async function subscribePresence(
  service: PusherProtocolService,
  socket: FakeSocket,
  userId: string,
): Promise<void> {
  const channel = "presence-business-209";
  const channelData = JSON.stringify({ user_id: userId, user_info: { name: userId } });
  const signature = createHmac("sha256", "secret")
    .update(`${socket.id}:${channel}:${channelData}`)
    .digest("hex");

  await service.receive(
    socket.id,
    JSON.stringify({
      event: "pusher:subscribe",
      data: {
        channel,
        auth: `key:${signature}`,
        channel_data: channelData,
      },
    }),
  );
}

async function subscribePrivate(
  service: PusherProtocolService,
  socket: FakeSocket,
  channel: string,
): Promise<void> {
  const signature = createHmac("sha256", "secret").update(`${socket.id}:${channel}`).digest("hex");

  await service.receive(
    socket.id,
    JSON.stringify({
      event: "pusher:subscribe",
      data: {
        channel,
        auth: `key:${signature}`,
      },
    }),
  );
}
