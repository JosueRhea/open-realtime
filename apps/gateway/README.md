# open-realtime

Pusher-compatible realtime gateway. The service keeps Pusher protocol
compatibility at the edges while the core uses small ports that can be swapped:
Hono today, another HTTP presentation later; Redis today, another bus later.

## Current compatibility target

- `pusher-js` WebSocket endpoint: `/app/:key`
- REST trigger endpoint used by the official `pusher` server SDK:
  `/apps/:appId/events`
- Multi-channel REST triggers using the Pusher `channels` payload field
- Batch trigger endpoint: `/apps/:appId/batch_events`
- Private channel subscription auth validation
- Presence channel subscription/auth shape and `/channels/:channel/users`
- Pusher client events (`client-*`) on subscribed private/presence channels,
  forwarded to other subscribers without echoing to the sender
- User authentication through `pusher.signin()`
- Server-to-user events through the official server SDK `sendToUser`
- User connection termination through the official server SDK
  `terminateUserConnections`
- Presence webhooks: `channel_occupied`, `channel_vacated`, `member_added`,
  `member_removed`
- Redis pub/sub for fanout across Vercel Function instances

## Run locally

```bash
pnpm install
pnpm bootstrap:local
pnpm dev:dashboard -- --port 3002
pnpm dev:gateway
```

From inside `apps/gateway`, the same commands also work with local paths:

```bash
cp .env.example .env
pnpm dev
```

`pnpm bootstrap:local` creates matching dashboard and gateway env files, seeds
the dashboard SQLite control-plane app, creates a hashed gateway service token,
and writes that token to `apps/gateway/.env` as `ORCHESTRATOR_TOKEN`.

## Multi-Tenant Modes

The gateway supports two deployment shapes:

- **Self-hosted / single tenant per instance**: keep using `PUSHER_APP_ID`,
  `PUSHER_KEY`, and `PUSHER_SECRET`. This is the simplest mode and is the
  default.
- **Shared infra / many tenants per instance**: set `PUSHER_APPS_JSON` to a
  static app registry. The runtime resolves WebSocket tenants by `/app/:key` and
  REST tenants by `/apps/:appId`.
- **Hosted orchestrator registry**: set `ORCHESTRATOR_APP_REGISTRY=true`,
  `ORCHESTRATOR_URL`, and an `ORCHESTRATOR_TOKEN` with `registry:read`. The
  gateway pulls encrypted-at-rest app credentials from `/api/gateway/apps` and
  refreshes them with `ORCHESTRATOR_APP_REGISTRY_REFRESH_MS`.

Example shared registry:

```bash
PUSHER_APPS_JSON='[
  {
    "appId": "app_1",
    "key": "key_1",
    "secret": "secret_1",
    "tenantId": "tenant_1",
    "name": "Tenant 1",
    "cluster": "mt1"
  },
  {
    "appId": "app_2",
    "key": "key_2",
    "secret": "secret_2",
    "tenantId": "tenant_2",
    "name": "Tenant 2",
    "cluster": "mt1"
  }
]'
```

Internal routing is app-scoped:

- socket registry uses `app_id + channel`
- event bus payloads include `appId`
- presence state uses `app_id + channel`
- user-specific sockets use `app_id + user_id`
- observability events include `app_id` and `tenant_id`
- presence webhook payloads include `app_id`
- orchestrator usage reports include `tenantId`

That means two tenants can use the same channel name without receiving each
other's messages.

## Test

```bash
pnpm test
pnpm typecheck
```

## Live example

Run the gateway and open the built-in frontend example:

```bash
pnpm dev
open http://localhost:3001/example
```

The page uses the real browser `pusher-js` client. Each browser tab starts one
client against the local gateway, so opening two tabs gives you two presence
users and a real peer for `client-*` events. It exercises:

- public channel subscriptions
- private channel auth
- presence channel auth and member events
- `client-*` events
- user authentication with `pusher.signin()`
- user-specific events through the official `pusher` server SDK `sendToUser`
- user connection termination through the official `pusher` server SDK
  `terminateUserConnections`
- REST single-event triggers through the official `pusher` server SDK
- REST batch triggers through the official `pusher` server SDK
- `/channels/:channel/users`
- Pusher-style webhook capture at `/example/webhooks`

For a repeatable local/live validation run:

```bash
pnpm smoke:live
pnpm smoke:frontend
```

The smoke command starts its own local gateway on a free port, configures the
gateway to send webhooks back into `/example/webhooks`, connects real
`pusher-js` clients, drives the REST API with the official `pusher` server SDK,
and fails if any compatibility path does not work.

`pnpm smoke:frontend` does the same from a real browser: it opens `/example` in
two tabs, waits for browser `pusher-js` clients to connect, clicks the demo
controls, and asserts the UI receives server triggers, batch triggers,
cross-tab client events, user-specific events, user termination, presence users,
and webhook batches.

## Deploy on Vercel

Deploy `open-realtime` as its own Vercel project. The project includes
`api/server.ts` plus a catch-all rewrite so Pusher clients can keep using
Pusher-shaped paths such as `/app/:key` and `/apps/:appId/events`.

The Hono app is only the HTTP presentation layer. The WebSocket upgrade is
handled in `api/server.ts`, while application logic stays behind ports in
`src/application`, so another presentation can be added without changing the
Pusher protocol service.

## Migration Notes

Point an existing backend at this gateway with its existing Pusher credentials
and:

```bash
PUSHER_HOST=realtime.your-domain.com
```

For browser clients, keep the existing Pusher app key and set:

```bash
NEXT_PUBLIC_PUSHER_HOST=realtime.your-domain.com
NEXT_PUBLIC_PUSHER_FORCE_TLS=true
```

Local frontend testing can also set `NEXT_PUBLIC_PUSHER_WS_PORT=3001` and
`NEXT_PUBLIC_PUSHER_FORCE_TLS=false`.

Existing private and presence channel auth endpoints can stay in your backend:

- dashboard private/presence channels: `/auth/pusher/auth`
- widget private channels: `/tokens/widget/auth`

Pusher Beams is a separate push-notification product and is not replaced by
this WebSocket gateway.

## Observability

The gateway emits compact structured events through an observability port. The
core does not depend on Axiom directly; local development can keep
observability disabled or print JSON logs to stdout.

Supported drivers:

- `OBSERVABILITY_DRIVER=none`: no-op, the local default
- `OBSERVABILITY_DRIVER=console`: structured JSON logs
- `OBSERVABILITY_DRIVER=axiom`: batched HTTP ingest to Axiom

Production Axiom setup:

```bash
OBSERVABILITY_DRIVER=axiom
OBSERVABILITY_SERVICE=open-realtime
OBSERVABILITY_ENVIRONMENT=production
OBSERVABILITY_BATCH_SIZE=100
OBSERVABILITY_FLUSH_INTERVAL_MS=1000
OBSERVABILITY_MAX_QUEUE_SIZE=10000
AXIOM_TOKEN=your-axiom-token
AXIOM_DATASET=open-realtime-events
AXIOM_API_URL=https://api.axiom.co
```

The Axiom adapter sends batches to Axiom's dataset ingest API and does not block
the realtime path. Events intentionally avoid message bodies and large payloads.
Examples:

```text
connection.opened
connection.closed
channel.subscribed
channel.subscribe_failed
message.delivered
client_event.accepted
user.signed_in
user.terminate_connections.requested
presence.member_added
presence.member_removed
webhook.queued
webhook.delivered
webhook.delivery_failed
rest.trigger
rest.batch_trigger
rest.auth_failed
```

## Orchestrator reporting

The gateway reports product/control-plane state to the dashboard/orchestrator
when both `ORCHESTRATOR_URL` and `ORCHESTRATOR_TOKEN` are configured.

```bash
ORCHESTRATOR_URL=http://localhost:3002
ORCHESTRATOR_TOKEN=ort_self-hosted_...
ORCHESTRATOR_TENANT_ID=self-hosted
ORCHESTRATOR_FLUSH_INTERVAL_MS=5000
```

For hosted shared gateways, add:

```bash
ORCHESTRATOR_APP_REGISTRY=true
ORCHESTRATOR_APP_REGISTRY_REFRESH_MS=10000
```

Reported state includes active connections, hourly messages, webhook failures,
channel summaries, and event metadata. This is separate from Axiom: Axiom is
for logs/debugging, while the orchestrator is product state.

## Presence webhooks

Set `PUSHER_WEBHOOK_URLS` to one or more comma-separated endpoints. Webhook
payloads follow Pusher's shape and are signed with `x-pusher-key` and
`x-pusher-signature` using `PUSHER_SECRET`.
Webhook events are batched by `PUSHER_WEBHOOK_BATCH_SIZE` or
`PUSHER_WEBHOOK_FLUSH_INTERVAL_MS`, whichever comes first.

For production reliability, set `REDIS_URL`. With Redis enabled, webhook events
are written to a Redis queue before delivery and are removed only after every
configured webhook URL returns a successful response. Failed deliveries stay at
the head of the queue and are retried by any live gateway instance, giving
at-least-once delivery. This can create duplicates after network ambiguity or a
process crash after the receiver handled the request but before the queue trim
completed, so webhook consumers should stay idempotent.

Without Redis, the dispatcher retries in memory only while the current process
is alive. That is useful for local development, but it is not durable enough for
production presence logging.

For presence logging, configure:

```bash
PUSHER_WEBHOOK_URLS=https://api.example.com/pusher/webhook
PUSHER_WEBHOOK_EVENTS=member_added,member_removed
```

```json
{
  "time_ms": 1760000000000,
  "webhook_id": "uuid",
  "events": [
    {
      "name": "member_added",
      "channel": "presence-business-209",
      "user_id": "123"
    }
  ]
}
```

Client SDK config:

```ts
new Pusher(APP_KEY, {
  wsHost: "localhost",
  wsPort: 3001,
  forceTLS: false,
  enabledTransports: ["ws"],
  cluster: "mt1",
});
```

Server SDK config:

```ts
new Pusher({
  appId: APP_ID,
  key: APP_KEY,
  secret: APP_SECRET,
  cluster: "mt1",
  useTLS: true,
  host: "realtime.your-domain.com",
});
```
