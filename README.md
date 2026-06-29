# open-realtime

Monorepo for the Open Realtime platform.

Current workspace:

- `apps/gateway`: Pusher-compatible realtime data plane.
- `apps/dashboard`: self-hosted admin dashboard and orchestrator API.
- `packages/*`: shared packages when needed.

Root commands proxy to the existing gateway package:

```bash
pnpm install
pnpm bootstrap:local
pnpm dev:dashboard -- --port 3002
pnpm dev:gateway
pnpm typecheck
pnpm test
pnpm verify
pnpm smoke:live
pnpm smoke:frontend
```

See `apps/gateway/README.md`, `apps/dashboard/README.md`, and
`docs/deployment.md` for setup and deployment notes. Railway template setup is
documented in `docs/railway-template.md`.
