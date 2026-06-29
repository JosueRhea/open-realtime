# Railway template

This repository can be published as a Railway template with four services:

- `Dashboard`: Next.js orchestrator/admin app from this repo.
- `Gateway`: Hono/WebSocket Pusher-compatible data plane from this repo.
- `Postgres`: Railway managed Postgres database.
- `Redis`: Railway managed Redis database.

The Railway app services use config-as-code files in `deploy/`:

- `deploy/railway.dashboard.json`
- `deploy/railway.gateway.json`

When creating the template in Railway, set each app service's config file path
to the matching file above. Both app services should use the repository root as
their root directory because the Dockerfiles build from the monorepo root.

## Dashboard service

Source:

- GitHub repository: this repository
- Root directory: repository root
- Config file path: `deploy/railway.dashboard.json`
- Public networking: enabled

Variables:

```text
PORT=3000
BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
BETTER_AUTH_SECRET=${{secret(43, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/")}}=
ORCHESTRATOR_APP_SECRET_KEY=${{secret(43, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/")}}=
ORCHESTRATOR_STORE_DRIVER=postgres
POSTGRES_URL=${{Postgres.DATABASE_URL}}
OPEN_REALTIME_CLUSTER=railway
OPEN_REALTIME_HOST=${{Gateway.RAILWAY_PUBLIC_DOMAIN}}
```

The dashboard config runs `pnpm migrate:postgres` as a Railway pre-deploy
command, so the Postgres schema is updated before the Next.js app starts.

## Gateway service

Source:

- GitHub repository: this repository
- Root directory: repository root
- Config file path: `deploy/railway.gateway.json`
- Public networking: enabled

Variables:

```text
PORT=3001
PUSHER_CLUSTER=railway
ORCHESTRATOR_APP_REGISTRY=true
ORCHESTRATOR_APP_REGISTRY_REFRESH_MS=10000
ORCHESTRATOR_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
ORCHESTRATOR_TOKEN=
ORCHESTRATOR_TENANT_ID=
ORCHESTRATOR_FLUSH_INTERVAL_MS=5000
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_PREFIX=open-realtime
OBSERVABILITY_DRIVER=none
OBSERVABILITY_SERVICE=open-realtime
OBSERVABILITY_ENVIRONMENT=production
AXIOM_TOKEN=
AXIOM_DATASET=
AXIOM_API_URL=https://api.axiom.co
```

`ORCHESTRATOR_TOKEN` and `ORCHESTRATOR_TENANT_ID` are intentionally blank in the
template because they are created in the dashboard after the first owner signs
in. After deploying the template:

1. Open the dashboard service URL.
2. Create the first owner account.
3. Create or select the tenant/app.
4. Create an API token with `ingest:write` and `registry:read`.
5. Copy the tenant ID and token into the gateway service variables.
6. Redeploy the gateway.

## Optional Axiom observability

Set these gateway variables to send gateway logs/metrics to Axiom:

```text
OBSERVABILITY_DRIVER=axiom
AXIOM_TOKEN=<axiom-token>
AXIOM_DATASET=open-realtime-events
```

The dashboard/orchestrator remains the product source of truth for tenant apps,
usage rollups, channel summaries, and API tokens. Axiom is for observability,
not billing state.

## Template publishing checklist

1. Create a new Railway template from the workspace templates page.
2. Add managed `Postgres` and `Redis` services.
3. Add the `Dashboard` app service and apply the dashboard variables above.
4. Add the `Gateway` app service and apply the gateway variables above.
5. Enable public HTTP networking on both app services.
6. Confirm the `Dashboard` config file path is `deploy/railway.dashboard.json`.
7. Confirm the `Gateway` config file path is `deploy/railway.gateway.json`.
8. Deploy once, create the gateway token in the dashboard, set it on the
   gateway service, and redeploy the gateway.
9. Generate the Railway template from the working project.
