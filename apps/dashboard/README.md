# Open Realtime Dashboard

Next.js dashboard and orchestrator API.

It provides:

- Better Auth owner login
- SQLite or Postgres-backed tenants, memberships, apps, API tokens, webhooks,
  usage, events, channels
- encrypted app secret storage for gateway registry sync
- authenticated dashboard APIs
- bearer-token gateway ingestion APIs

## Local setup

From the repo root:

```bash
pnpm bootstrap:local
pnpm dev:dashboard -- --port 3002
```

Open `http://localhost:3002`, create the first owner account, then create or
inspect apps, tokens, and webhook endpoints.

The local SQLite file defaults to:

```text
apps/dashboard/data/open-realtime.db
```

## Important routes

- `/`: overview
- `/apps`: app credentials/control
- `/team`: owner settings and one-time visible service token creation
- `/webhooks`: webhook endpoint configuration
- `/api/tokens`: session-authenticated API token CRUD
- `/api/ingest/usage`: gateway bearer-token usage ingestion
- `/api/ingest/events`: gateway bearer-token event ingestion
- `/api/ingest/channels`: gateway bearer-token channel ingestion
- `/api/gateway/apps`: gateway bearer-token app registry with `registry:read`

## Environment

Copy `.env.example` to `.env.local` or run `pnpm bootstrap:local`.

For hosted/SaaS mode, copy `.env.hosted.example`, set
`ORCHESTRATOR_STORE_DRIVER=postgres`, run `pnpm migrate:postgres`, and deploy
with a persistent Postgres database. Dashboard users are mapped to tenants via
the orchestrator `tenant_memberships` table.
