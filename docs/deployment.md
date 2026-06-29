# Deployment

## Self-hosted shape

Run two services:

- `apps/dashboard`: Next.js control plane, Better Auth, SQLite.
- `apps/gateway`: Hono/WebSocket data plane, Pusher-compatible API.

The gateway reports product state to the dashboard/orchestrator with
`ORCHESTRATOR_TOKEN`. Axiom remains optional observability.

Bootstrap local env and a matching SQLite app/token:

```bash
pnpm bootstrap:local
pnpm dev:dashboard -- --port 3002
pnpm dev:gateway
```

Docker compose entry point:

```bash
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
PUSHER_KEY="io_local" \
PUSHER_SECRET="$(openssl rand -base64 32)" \
ORCHESTRATOR_TOKEN="create-with-bootstrap-or-dashboard" \
docker compose -f deploy/docker-compose.self-hosted.yml up --build
```

For production, keep the dashboard SQLite file on persistent storage. Set
`REDIS_URL` on the gateway for cross-instance fanout and durable webhook retry.

## Vercel split-project shape

Use two Vercel projects from this monorepo:

- dashboard project root: `apps/dashboard`
- gateway project root: `apps/gateway`

Dashboard env:

```bash
ORCHESTRATOR_STORE_DRIVER=sqlite
BETTER_AUTH_URL=https://realtime-admin.example.com
BETTER_AUTH_SECRET=...
ORCHESTRATOR_APP_SECRET_KEY=...
OPEN_REALTIME_SQLITE_PATH=/data/open-realtime.db
OPEN_REALTIME_TENANT_ID=self-hosted
OPEN_REALTIME_TENANT_NAME="Self Hosted"
OPEN_REALTIME_CLUSTER=mt1
OPEN_REALTIME_HOST=realtime.example.com
```

Gateway env:

```bash
PUSHER_APP_ID=open-realtime
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=mt1
PUSHER_TENANT_ID=self-hosted
ORCHESTRATOR_URL=https://realtime-admin.example.com
ORCHESTRATOR_TOKEN=...
ORCHESTRATOR_TENANT_ID=self-hosted
REDIS_URL=...
OBSERVABILITY_DRIVER=axiom
AXIOM_TOKEN=...
AXIOM_DATASET=open-realtime-events
```

Hosted env examples are checked in at:

```text
apps/dashboard/.env.hosted.example
apps/gateway/.env.hosted.example
deploy/.env.hosted.example
```

## Hosted/SaaS path

The current self-hosted orchestrator is a Next app plus store interface. The
SaaS version keeps the same store contract and uses the Postgres adapter:

```bash
ORCHESTRATOR_STORE_DRIVER=postgres
POSTGRES_URL=postgres://...
```

The Postgres schema lives in:

```text
apps/dashboard/src/lib/orchestrator/postgres-schema.sql
```

Apply it with:

```bash
POSTGRES_URL=postgres://... pnpm migrate:postgres
```

Production-style compose entry point:

```bash
cp deploy/.env.hosted.example deploy/.env.hosted
docker compose --env-file deploy/.env.hosted -f deploy/docker-compose.hosted.yml up --build
```

Railway template notes live in:

```text
docs/railway-template.md
deploy/railway.dashboard.json
deploy/railway.gateway.json
```

The hosted adapter entrypoint is:

```text
apps/dashboard/src/lib/orchestrator/postgres-adapter.ts
```

Hosted dashboard sessions resolve through `tenant_memberships`. On first login,
the dashboard creates a managed-cloud tenant for the user unless the request
includes a known `x-open-realtime-tenant-id`. Self-hosted mode still uses the explicit
single tenant from `OPEN_REALTIME_TENANT_ID`.

- API tokens are stored per tenant and can later be delegated to Unkey
- dashboard-created app secrets are encrypted with `ORCHESTRATOR_APP_SECRET_KEY`
  and exposed to gateways only through `/api/gateway/apps`
- usage rollups are stored in Postgres by tenant, app, and hour
- gateway instances can run single-tenant env config or
  `ORCHESTRATOR_APP_REGISTRY=true` to pull tenant app credentials from the
  dashboard/orchestrator with a `registry:read` token
- Redis required for gateway fanout, presence, and webhook queues
- dashboard deployed separately from gateway pools

The tenant ID should remain explicit on every product-state write, even when a
single self-hosted instance only has `self-hosted`.
