import Pusher from "pusher";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Context, Hono } from "hono";
import type { PusherCredentials } from "../../application/ports/pusher-authenticator";
import type { PusherAuthenticator } from "../../application/ports/pusher-authenticator";

const require = createRequire(import.meta.url);

interface WebhookBatch {
  receivedAt: string;
  body: unknown;
  headers: Record<string, string>;
}

export class ExampleController {
  private readonly webhooks: WebhookBatch[] = [];

  constructor(
    private readonly authenticator: PusherAuthenticator,
    private readonly credentials: PusherCredentials,
  ) {}

  register(app: Hono): void {
    app.get("/example", (c) => c.html(exampleHtml()));
    app.get("/example/app.js", (c) =>
      c.body(exampleJs(), 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      }),
    );
    app.get("/example/pusher.min.js", async (c) => {
      const bundlePath = require.resolve("pusher-js/dist/web/pusher.min.js");
      return c.body(await readFile(bundlePath, "utf8"), 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=86400",
      });
    });

    app.get("/example/config", (c) =>
      c.json({
        appKey: this.credentials.key,
        cluster: this.credentials.cluster,
      }),
    );

    app.post("/example/auth", async (c) => this.authorizeChannel(c));
    app.post("/example/user-auth", async (c) => this.authorizeUser(c));
    app.post("/example/server/trigger", async (c) => this.trigger(c));
    app.post("/example/server/batch", async (c) => this.triggerBatch(c));
    app.post("/example/server/send-to-user", async (c) => this.sendToUser(c));
    app.post("/example/server/terminate-user", async (c) => this.terminateUser(c));
    app.get("/example/server/users/:channel", async (c) => this.users(c));

    app.post("/example/webhooks", async (c) => this.captureWebhook(c));
    app.get("/example/webhooks", (c) => c.json({ batches: this.webhooks }));
    app.delete("/example/webhooks", (c) => {
      this.webhooks.length = 0;
      return c.json({ ok: true });
    });
  }

  private async authorizeChannel(c: Context): Promise<Response> {
    const form = await c.req.parseBody();
    const socketId = String(form.socket_id ?? "");
    const channel = String(form.channel_name ?? "");
    const userId = String(form.user_id ?? "example-user");
    const userName = String(form.user_name ?? userId);
    const channelData = channel.startsWith("presence-")
      ? JSON.stringify({
          user_id: userId,
          user_info: {
            name: userName,
            source: "open-realtime-example",
          },
        })
      : undefined;

    return c.json({
      auth: this.authenticator.signChannel({
        socketId,
        channel,
        channelData,
      }),
      ...(channelData ? { channel_data: channelData } : {}),
    });
  }

  private async authorizeUser(c: Context): Promise<Response> {
    const form = await c.req.parseBody();
    const socketId = String(form.socket_id ?? "");
    const userId = String(form.user_id ?? "example-user");
    const userName = String(form.user_name ?? userId);
    const userData = JSON.stringify({
      id: userId,
      name: userName,
      source: "open-realtime-example",
    });

    return c.json({
      auth: this.authenticator.signUser({
        socketId,
        userData,
      }),
      user_data: userData,
    });
  }

  private async trigger(c: Context): Promise<Response> {
    const body = await c.req.json().catch(() => ({}));
    const pusher = createSdkClient(c, this.credentials);
    await pusher.trigger(body.channel ?? "public-example", body.event ?? "server:single", body.data ?? {});
    return c.json({ ok: true });
  }

  private async triggerBatch(c: Context): Promise<Response> {
    const body = await c.req.json().catch(() => ({}));
    const pusher = createSdkClient(c, this.credentials);
    await pusher.triggerBatch(
      Array.isArray(body.batch)
        ? body.batch
        : [
            {
              channel: "public-example",
              name: "server:batch",
              data: { message: "default batch event" },
            },
          ],
    );
    return c.json({ ok: true });
  }

  private async sendToUser(c: Context): Promise<Response> {
    const body = await c.req.json().catch(() => ({}));
    const pusher = createSdkClient(c, this.credentials);
    await pusher.sendToUser(body.userId ?? "example-user", body.event ?? "user:direct", body.data ?? {});
    return c.json({ ok: true });
  }

  private async terminateUser(c: Context): Promise<Response> {
    const body = await c.req.json().catch(() => ({}));
    const pusher = createSdkClient(c, this.credentials);
    await pusher.terminateUserConnections(body.userId ?? "example-user");
    return c.json({ ok: true });
  }

  private async users(c: Context): Promise<Response> {
    const pusher = createSdkClient(c, this.credentials);
    const channel = c.req.param("channel") ?? "";
    const response = await pusher.get({
      path: `/channels/${encodeURIComponent(channel)}/users`,
    });
    const body = await response.json();
    return c.json(body);
  }

  private async captureWebhook(c: Context): Promise<Response> {
    const headers: Record<string, string> = {};
    for (const [key, value] of c.req.raw.headers.entries()) {
      if (key.startsWith("x-pusher-")) headers[key] = value;
    }

    this.webhooks.push({
      receivedAt: new Date().toISOString(),
      headers,
      body: await c.req.json().catch(() => null),
    });

    return c.json({ ok: true });
  }
}

function createSdkClient(c: Context, credentials: PusherCredentials): Pusher {
  const url = new URL(c.req.url);
  return new Pusher({
    appId: credentials.appId,
    key: credentials.key,
    secret: credentials.secret,
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    useTLS: url.protocol === "https:",
  });
}

function exampleHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>open realtime live example</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172033;
      background: #f5f7fb;
    }
    body {
      margin: 0;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      margin-bottom: 22px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #5b6475;
    }
    button, input {
      font: inherit;
    }
    button {
      border: 1px solid #b8c0ce;
      background: #ffffff;
      color: #172033;
      border-radius: 6px;
      min-height: 36px;
      padding: 0 12px;
      cursor: pointer;
    }
    button.primary {
      background: #1769e0;
      border-color: #1769e0;
      color: #ffffff;
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    section {
      background: #ffffff;
      border: 1px solid #dfe4ee;
      border-radius: 8px;
      padding: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 16px;
      letter-spacing: 0;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .status {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .pill {
      border: 1px solid #dfe4ee;
      border-radius: 999px;
      padding: 6px 10px;
      background: #f9fafc;
      color: #3b4558;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    pre {
      margin: 0;
      min-height: 280px;
      max-height: 420px;
      overflow: auto;
      padding: 12px;
      border-radius: 6px;
      background: #0f172a;
      color: #dbeafe;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .wide {
      grid-column: 1 / -1;
    }
    @media (max-width: 860px) {
      main {
        padding: 18px;
      }
      header, .grid {
        display: block;
      }
      section {
        margin-bottom: 14px;
      }
      .status {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>open realtime live example</h1>
        <p>Real pusher-js clients against this gateway, with server SDK triggers and webhook capture.</p>
      </div>
      <div class="controls">
        <button id="connect" class="primary">Connect client</button>
        <button id="disconnect">Disconnect</button>
      </div>
    </header>

    <div class="grid">
      <section>
        <h2>Client status</h2>
        <div class="status">
          <div id="user" class="pill">User: none</div>
          <div id="status" class="pill">Client: idle</div>
          <div id="socket" class="pill">Socket: none</div>
          <div id="presence" class="pill">Presence: unknown</div>
        </div>
        <div class="controls">
          <button id="serverSingle">Server trigger</button>
          <button id="serverBatch">Batch trigger</button>
          <button id="clientEvent">Client event</button>
          <button id="sendToUser">Send to user</button>
          <button id="terminateUser">Terminate user</button>
          <button id="presenceUsers">Presence users</button>
        </div>
      </section>

      <section>
        <h2>Webhook capture</h2>
        <div class="controls">
          <button id="loadWebhooks">Refresh webhooks</button>
          <button id="clearWebhooks">Clear webhooks</button>
        </div>
        <pre id="webhooks"></pre>
      </section>

      <section class="wide">
        <h2>Event log</h2>
        <pre id="log"></pre>
      </section>
    </div>
  </main>

  <script src="/example/pusher.min.js"></script>
  <script src="/example/app.js"></script>
</body>
</html>`;
}

function exampleJs(): string {
  return String.raw`const channels = {
  public: "public-example",
  private: "private-example",
  presence: "presence-example",
};

const state = {
  client: null,
  privateChannel: null,
  user: getTabUser(),
};

const $ = (id) => document.getElementById(id);
const log = (label, value) => {
  const line = "[" + new Date().toLocaleTimeString() + "] " + label + (value === undefined ? "" : " " + JSON.stringify(value));
  $("log").textContent = line + "\n" + $("log").textContent;
};

function setStatus(id, text) {
  $(id).textContent = text;
}

function getTabUser() {
  const key = "open-realtime-example-user";
  const existing = sessionStorage.getItem(key);
  if (existing) return JSON.parse(existing);

  const suffix = Math.random().toString(36).slice(2, 8);
  const user = {
    id: "example-tab-" + suffix,
    name: "Example Tab " + suffix,
  };
  sessionStorage.setItem(key, JSON.stringify(user));
  return user;
}

async function authRequest(params, user) {
  const body = new URLSearchParams({
    socket_id: params.socketId,
    channel_name: params.channelName,
    user_id: user.id,
    user_name: user.name,
  });
  const response = await fetch("/example/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Auth failed: " + response.status);
  return response.json();
}

async function userAuthRequest(params, user) {
  const body = new URLSearchParams({
    socket_id: params.socketId,
    user_id: user.id,
    user_name: user.name,
  });
  const response = await fetch("/example/user-auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("User auth failed: " + response.status);
  return response.json();
}

async function createClient(user) {
  const config = await fetch("/example/config").then((response) => response.json());
  const secure = location.protocol === "https:";
  const client = new Pusher(config.appKey, {
    cluster: config.cluster || "mt1",
    wsHost: location.hostname,
    wsPort: secure ? undefined : Number(location.port || 80),
    wssPort: secure ? Number(location.port || 443) : undefined,
    forceTLS: secure,
    enabledTransports: secure ? ["wss"] : ["ws"],
    disableStats: true,
    channelAuthorization: {
      customHandler: (params, callback) => {
        authRequest(params, user)
          .then((data) => callback(null, data))
          .catch((error) => callback(error, null));
      },
    },
    userAuthentication: {
      customHandler: (params, callback) => {
        userAuthRequest(params, user)
          .then((data) => callback(null, data))
          .catch((error) => callback(error, null));
      },
    },
  });

  client.connection.bind("state_change", ({ current }) => {
    setStatus("status", "Client: " + current);
  });
  client.connection.bind("connected", () => {
    setStatus("socket", "Socket: " + client.connection.socket_id);
    client.signin();
  });
  client.connection.bind("error", (error) => log("connection error", error));

  const publicChannel = client.subscribe(channels.public);
  const privateChannel = client.subscribe(channels.private);
  const presenceChannel = client.subscribe(channels.presence);
  client.user.bind("user:direct", (data) => log("received user:direct", data));
  [publicChannel, privateChannel, presenceChannel].forEach((channel) => {
    channel.bind("pusher:subscription_succeeded", (data) => log("subscribed " + channel.name, data));
    channel.bind("pusher:subscription_error", (error) => log("subscription error " + channel.name, error));
    channel.bind("server:single", (data) => log("received server:single", data));
    channel.bind("server:batch", (data) => log("received server:batch", data));
    channel.bind("client-live-test", (data) => log("received client-live-test", data));
  });
  presenceChannel.bind("pusher:subscription_succeeded", (data) => {
    const count = data?.count ?? data?.presence?.count ?? "unknown";
    setStatus("presence", "Presence: " + count + " member(s)");
  });
  presenceChannel.bind("pusher:member_added", (member) => {
    log("presence member_added", member);
    refreshPresenceCount();
  });
  presenceChannel.bind("pusher:member_removed", (member) => {
    log("presence member_removed", member);
    refreshPresenceCount();
  });

  return { client, privateChannel };
}

async function connect() {
  disconnect();
  $("log").textContent = "";
  try {
    setStatus("user", "User: " + state.user.id);
    const connection = await createClient(state.user);
    state.client = connection.client;
    state.privateChannel = connection.privateChannel;
    log("started one pusher-js client for this tab", state.user);
  } catch (error) {
    log("connect failed", { message: error.message });
  }
}

function disconnect() {
  if (state.client) state.client.disconnect();
  state.client = null;
  state.privateChannel = null;
  setStatus("user", "User: " + state.user.id);
  setStatus("status", "Client: idle");
  setStatus("socket", "Socket: none");
  setStatus("presence", "Presence: unknown");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(url + " failed: " + response.status);
  return response.json();
}

$("connect").addEventListener("click", connect);
$("disconnect").addEventListener("click", disconnect);
$("serverSingle").addEventListener("click", async () => {
  await postJson("/example/server/trigger", {
    channel: channels.public,
    event: "server:single",
    data: { source: "official pusher server SDK", at: new Date().toISOString() },
  });
  log("sent server trigger");
});
$("serverBatch").addEventListener("click", async () => {
  await postJson("/example/server/batch", {
    batch: [
      { channel: channels.public, name: "server:batch", data: { item: "public" } },
      { channel: channels.private, name: "server:batch", data: { item: "private" } },
      { channel: channels.presence, name: "server:batch", data: { item: "presence" } },
    ],
  });
  log("sent batch trigger");
});
$("clientEvent").addEventListener("click", () => {
  if (!state.privateChannel) return log("connect first");
  state.privateChannel.trigger("client-live-test", { from: state.user.id, at: new Date().toISOString() });
  log("triggered client-live-test", { from: state.user.id });
});
$("sendToUser").addEventListener("click", async () => {
  await postJson("/example/server/send-to-user", {
    userId: state.user.id,
    event: "user:direct",
    data: { message: "hello signed-in user", to: state.user.id, at: new Date().toISOString() },
  });
  log("sent user:direct", { to: state.user.id });
});
$("terminateUser").addEventListener("click", async () => {
  await postJson("/example/server/terminate-user", {
    userId: state.user.id,
  });
  log("requested terminate user", { userId: state.user.id });
});
$("presenceUsers").addEventListener("click", async () => {
  const users = await refreshPresenceCount();
  log("presence users", users);
});
$("loadWebhooks").addEventListener("click", async () => {
  $("webhooks").textContent = JSON.stringify(await fetch("/example/webhooks").then((response) => response.json()), null, 2);
});
$("clearWebhooks").addEventListener("click", async () => {
  await fetch("/example/webhooks", { method: "DELETE" });
  $("webhooks").textContent = "";
});

async function refreshPresenceCount() {
  const users = await fetch("/example/server/users/" + encodeURIComponent(channels.presence)).then((response) => response.json());
  const count = Array.isArray(users.users) ? users.users.length : "unknown";
  setStatus("presence", "Presence: " + count + " member(s)");
  return users;
}

setStatus("user", "User: " + state.user.id);
log("open /example in two tabs to test two real browser users");
connect();
`;
}
