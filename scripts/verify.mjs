#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const selfHostedEnv = {
  ...process.env,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "verify-better-auth-secret-at-least-32-characters",
  ORCHESTRATOR_APP_SECRET_KEY:
    process.env.ORCHESTRATOR_APP_SECRET_KEY ??
    "verify-app-secret-key-at-least-32-characters",
  PUSHER_KEY: process.env.PUSHER_KEY ?? "verify-key",
  PUSHER_SECRET:
    process.env.PUSHER_SECRET ?? "verify-pusher-secret-at-least-32-characters",
  ORCHESTRATOR_TOKEN:
    process.env.ORCHESTRATOR_TOKEN ??
    "ort_self-hosted_verify-token-at-least-32",
};

const checks = [
  ["node", ["--check", "scripts/bootstrap-local.mjs"]],
  ["node", ["--check", "scripts/migrate-postgres.mjs"]],
  ["pnpm", ["--filter", "@open-realtime/dashboard", "lint"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
  ["pnpm", ["build"]],
  [
    "docker",
    [
      "compose",
      "--env-file",
      "deploy/.env.hosted.example",
      "-f",
      "deploy/docker-compose.hosted.yml",
      "config",
    ],
  ],
  [
    "docker",
    ["compose", "-f", "deploy/docker-compose.self-hosted.yml", "config"],
    { env: selfHostedEnv },
  ],
];

for (const [command, args, options] of checks) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
