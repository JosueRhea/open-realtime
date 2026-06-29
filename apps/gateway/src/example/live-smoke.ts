import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import Pusher from "pusher";
import PusherJsModule from "pusher-js/node.js";
import { createNodeServer } from "../runtime/create-node-server";
import type { RuntimeConfig } from "../runtime/config";

const PusherJs = PusherJsModule.Pusher;

const credentials = {
  appId: "live-smoke",
  key: "live-smoke-key",
  secret: "live-smoke-secret",
  cluster: "mt1",
};

const channels = {
  public: "public-live-smoke",
  private: "private-live-smoke",
  presence: "presence-live-smoke",
};

interface SmokeClient {
  label: string;
  user: { id: string; name: string };
  client: any;
  publicChannel: any;
  privateChannel: any;
  presenceChannel: any;
}

const steps: string[] = [];

async function main(): Promise<void> {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const config: RuntimeConfig = {
    pusher: credentials,
    apps: [credentials],
    appRegistry: {
      source: "static",
      refreshIntervalMs: 10000,
    },
    redisPrefix: "live-smoke",
    observability: {
      driver: "none",
      service: "open-realtime",
      environment: "test",
      instanceId: "live-smoke",
      batchSize: 100,
      flushIntervalMs: 1000,
      maxQueueSize: 10000,
    },
    webhookUrls: [`${baseUrl}/example/webhooks`],
    webhookEvents: new Set(["channel_occupied", "channel_vacated", "member_added", "member_removed"]),
    webhookBatchSize: 20,
    webhookFlushIntervalMs: 50,
    orchestrator: {
      tenantId: "self-hosted",
      flushIntervalMs: 0,
    },
    port,
  };
  const server = await createNodeServer(config);
  await listen(server, port);

  const sdk = new Pusher({
    appId: credentials.appId,
    key: credentials.key,
    secret: credentials.secret,
    host: "127.0.0.1",
    port: String(port),
    useTLS: false,
  });

  const clients: SmokeClient[] = [];

  try {
    await request(baseUrl, "/example/webhooks", { method: "DELETE" });
    ok("gateway started with example webhook receiver");

    const a = createSmokeClient(baseUrl, "A", { id: "smoke-a", name: "Smoke A" });
    const b = createSmokeClient(baseUrl, "B", { id: "smoke-b", name: "Smoke B" });
    clients.push(a, b);

    await Promise.all([connected(a), connected(b)]);
    ok("real pusher-js clients connected");

    await Promise.all([
      subscribed(a.publicChannel),
      subscribed(a.privateChannel),
      subscribed(a.presenceChannel),
      subscribed(b.publicChannel),
      subscribed(b.privateChannel),
      subscribed(b.presenceChannel),
    ]);
    ok("public, private, and presence channels subscribed");

    a.client.signin();
    b.client.signin();
    await Promise.all([signedIn(a), signedIn(b)]);
    ok("real pusher-js clients authenticated as users");

    const publicA = onceChannel(a.publicChannel, "server:single");
    const publicB = onceChannel(b.publicChannel, "server:single");
    await sdk.trigger(channels.public, "server:single", {
      source: "official pusher server sdk",
    });
    await Promise.all([publicA, publicB]);
    ok("official pusher server SDK trigger reached both clients");

    const batchEvents = [
      onceChannel(a.publicChannel, "server:batch"),
      onceChannel(a.privateChannel, "server:batch"),
      onceChannel(a.presenceChannel, "server:batch"),
    ];
    await sdk.triggerBatch([
      { channel: channels.public, name: "server:batch", data: { channel: "public" } },
      { channel: channels.private, name: "server:batch", data: { channel: "private" } },
      { channel: channels.presence, name: "server:batch", data: { channel: "presence" } },
    ]);
    await Promise.all(batchEvents);
    ok("official pusher server SDK batch trigger reached all channel types");

    let echoedToSender = false;
    a.privateChannel.bind("client-live-smoke", () => {
      echoedToSender = true;
    });
    const clientEventOnB = onceChannel(b.privateChannel, "client-live-smoke");
    a.privateChannel.trigger("client-live-smoke", {
      from: "client A",
    });
    await clientEventOnB;
    await delay(150);
    assert(!echoedToSender, "client event was echoed to sender");
    ok("client-* event forwarded to peers without echo");

    const userEventOnA = onceUserEvent(a, "user:direct");
    await sdk.sendToUser("smoke-a", "user:direct", {
      message: "hello user",
    });
    await userEventOnA;
    await delay(150);
    assert(
      !b.client.user_data || b.user.id !== "smoke-a",
      "sanity check failed for smoke users",
    );
    ok("official pusher server SDK sendToUser reached signed-in user");

    const usersResponse = await sdk.get({
      path: `/channels/${channels.presence}/users`,
    });
    const users = (await usersResponse.json()) as { users?: Array<{ id: string }> };
    assert(
      users.users?.some((user) => user.id === "smoke-a") &&
        users.users?.some((user) => user.id === "smoke-b"),
      "presence users endpoint did not return both users",
    );
    ok("presence users endpoint returned subscribed users");

    const terminated = disconnected(a);
    await sdk.terminateUserConnections("smoke-a");
    await terminated;
    assert(b.client.connection.state === "connected", "terminating smoke-a disconnected smoke-b");
    ok("official pusher server SDK terminateUserConnections closed signed-in user sockets");

    b.client.disconnect();
    await waitForWebhookEvents(baseUrl, ["channel_occupied", "member_added", "member_removed"]);
    a.client.disconnect();
    await waitForWebhookEvents(baseUrl, [
      "channel_occupied",
      "member_added",
      "member_removed",
      "channel_vacated",
    ]);
    ok("presence webhook batch receiver captured join and leave events");

    console.log(`\nLive smoke passed against ${baseUrl}`);
    for (const step of steps) console.log(`- ${step}`);
  } finally {
    for (const client of clients) client.client.disconnect();
    await close(server);
  }
}

function createSmokeClient(
  baseUrl: string,
  label: string,
  user: { id: string; name: string },
): SmokeClient {
  const url = new URL(baseUrl);
  const client = new PusherJs(credentials.key, {
    cluster: credentials.cluster,
    wsHost: url.hostname,
    wsPort: Number(url.port),
    forceTLS: false,
    enabledTransports: ["ws"],
    disableStats: true,
    channelAuthorization: {
      customHandler: async (params: { socketId: string; channelName: string }, callback: any) => {
        try {
          const body = new URLSearchParams({
            socket_id: params.socketId,
            channel_name: params.channelName,
            user_id: user.id,
            user_name: user.name,
          });
          const response = await fetch(`${baseUrl}/example/auth`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
          });
          callback(null, await response.json());
        } catch (error) {
          callback(error, null);
        }
      },
    },
    userAuthentication: {
      customHandler: async (params: { socketId: string }, callback: any) => {
        try {
          const body = new URLSearchParams({
            socket_id: params.socketId,
            user_id: user.id,
            user_name: user.name,
          });
          const response = await fetch(`${baseUrl}/example/user-auth`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
          });
          callback(null, await response.json());
        } catch (error) {
          callback(error, null);
        }
      },
    },
  });

  return {
    label,
    user,
    client,
    publicChannel: client.subscribe(channels.public),
    privateChannel: client.subscribe(channels.private),
    presenceChannel: client.subscribe(channels.presence),
  };
}

function connected(client: SmokeClient): Promise<void> {
  if (client.client.connection.state === "connected") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${client.label} did not connect`)), 5000);
    client.client.connection.bind("connected", () => {
      clearTimeout(timer);
      resolve();
    });
    client.client.connection.bind("error", (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function signedIn(client: SmokeClient): Promise<void> {
  if (client.client.user?.user_data?.id === client.user.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${client.label} did not sign in`)), 5000);
    client.client.user.signinDonePromise
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function disconnected(client: SmokeClient): Promise<void> {
  if (client.client.connection.state !== "connected") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${client.label} was not disconnected`)), 5000);
    client.client.connection.bind("state_change", ({ current }: { current: string }) => {
      if (current !== "connected") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function onceUserEvent(client: SmokeClient, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} was not received by ${client.label}`)), 5000);
    client.client.user.bind(event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function subscribed(channel: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${channel.name} did not subscribe`)), 5000);
    channel.bind("pusher:subscription_succeeded", () => {
      clearTimeout(timer);
      resolve();
    });
    channel.bind("pusher:subscription_error", (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function onceChannel(channel: any, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} was not received on ${channel.name}`)), 5000);
    channel.bind(event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function waitForWebhookEvents(baseUrl: string, names: string[]): Promise<void> {
  await retry(async () => {
    const response = await request(baseUrl, "/example/webhooks");
    const batches = Array.isArray(response.batches) ? response.batches : [];
    const received = new Set<string>();
    for (const batch of batches) {
      for (const event of batch.body?.events ?? []) {
        received.add(event.name);
      }
    }
    for (const name of names) {
      assert(received.has(name), `missing webhook event: ${name}`);
    }
  });
}

async function request(baseUrl: string, path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return response.json();
}

async function retry(fn: () => Promise<void>, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      await delay(80);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function ok(message: string): void {
  steps.push(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

function listen(server: Awaited<ReturnType<typeof createNodeServer>>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

function close(server: Awaited<ReturnType<typeof createNodeServer>>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

await main();
