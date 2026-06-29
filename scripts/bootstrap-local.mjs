#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const dashboardDir = path.join(root, "apps/dashboard");
const gatewayDir = path.join(root, "apps/gateway");
const requireFromDashboard = createRequire(path.join(dashboardDir, "package.json"));
const Database = requireFromDashboard("better-sqlite3");

const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");
const existingDashboardEnv = readEnv(path.join(dashboardDir, ".env.local"));
const existingGatewayEnv = readEnv(path.join(gatewayDir, ".env"));
const tenantId =
  process.env.OPEN_REALTIME_TENANT_ID ??
  existingDashboardEnv.OPEN_REALTIME_TENANT_ID ??
  existingGatewayEnv.ORCHESTRATOR_TENANT_ID ??
  "self-hosted";
const tenantName =
  process.env.OPEN_REALTIME_TENANT_NAME ??
  unquote(existingDashboardEnv.OPEN_REALTIME_TENANT_NAME) ??
  "Self Hosted";
const appId = process.env.PUSHER_APP_ID ?? existingGatewayEnv.PUSHER_APP_ID ?? "open-realtime";
const key = process.env.PUSHER_KEY ?? existingGatewayEnv.PUSHER_KEY ?? `io_${token(18)}`;
const secret =
  process.env.PUSHER_SECRET ?? existingGatewayEnv.PUSHER_SECRET ?? `sec_${token(32)}`;
const cluster =
  process.env.PUSHER_CLUSTER ??
  existingGatewayEnv.PUSHER_CLUSTER ??
  existingDashboardEnv.OPEN_REALTIME_CLUSTER ??
  "self-host-1";
const gatewayPort = process.env.GATEWAY_PORT ?? existingGatewayEnv.PORT ?? "3001";
const dashboardPort = process.env.DASHBOARD_PORT ?? "3002";
const orchestratorUrl =
  process.env.ORCHESTRATOR_URL ?? `http://localhost:${dashboardPort}`;
const databasePath = path.join(dashboardDir, "data/open-realtime.db");
const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ??
  existingDashboardEnv.BETTER_AUTH_SECRET ??
  token(48);
const appSecretKey =
  process.env.ORCHESTRATOR_APP_SECRET_KEY ??
  existingDashboardEnv.ORCHESTRATOR_APP_SECRET_KEY ??
  betterAuthSecret;
const serviceToken =
  process.env.ORCHESTRATOR_TOKEN ??
  existingGatewayEnv.ORCHESTRATOR_TOKEN ??
  `ort_${tenantId}_${token(32)}`;

if (!dryRun) fs.mkdirSync(path.dirname(databasePath), { recursive: true });
writeFile(
  path.join(dashboardDir, ".env.local"),
  [
    `BETTER_AUTH_URL=http://localhost:${dashboardPort}`,
    `BETTER_AUTH_SECRET=${betterAuthSecret}`,
    `ORCHESTRATOR_APP_SECRET_KEY=${appSecretKey}`,
    `OPEN_REALTIME_SQLITE_PATH=${databasePath}`,
    `OPEN_REALTIME_TENANT_ID=${tenantId}`,
    `OPEN_REALTIME_TENANT_NAME="${tenantName}"`,
    `OPEN_REALTIME_CLUSTER=${cluster}`,
    `OPEN_REALTIME_HOST=localhost:${gatewayPort}`,
  ].join("\n") + "\n",
);

writeFile(
  path.join(gatewayDir, ".env"),
  [
    `PUSHER_APP_ID=${appId}`,
    `PUSHER_KEY=${key}`,
    `PUSHER_SECRET=${secret}`,
    `PUSHER_CLUSTER=${cluster}`,
    `PUSHER_TENANT_ID=${tenantId}`,
    `PUSHER_APP_NAME="Open Realtime Local"`,
    `PORT=${gatewayPort}`,
    `ORCHESTRATOR_URL=${orchestratorUrl}`,
    `ORCHESTRATOR_TOKEN=${serviceToken}`,
    `ORCHESTRATOR_TENANT_ID=${tenantId}`,
    `ORCHESTRATOR_FLUSH_INTERVAL_MS=5000`,
    `OBSERVABILITY_DRIVER=none`,
  ].join("\n") + "\n",
);

if (!dryRun) seedSqlite();

console.log(`Local bootstrap complete.

Dashboard:
  cd ${root}
  pnpm dev:dashboard -- --port ${dashboardPort}

Gateway:
  cd ${root}
  pnpm dev:gateway

Pusher app:
  app_id: ${appId}
  key:    ${key}
  secret: ${secret}
  host:   localhost:${gatewayPort}

Gateway orchestrator token ${dryRun ? "would be written to apps/gateway/.env and stored hashed in SQLite" : "was written to apps/gateway/.env and stored hashed in SQLite"}.
`);

function writeFile(filePath, contents) {
  if (fs.existsSync(filePath) && !force) {
  console.log(`Keeping existing ${path.relative(root, filePath)} (use --force to overwrite)`);
    return;
  }

  if (dryRun) {
    console.log(`Would write ${path.relative(root, filePath)}`);
    return;
  }

  fs.writeFileSync(filePath, contents);
  console.log(`Wrote ${path.relative(root, filePath)}`);
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), unquote(line.slice(index + 1))];
      }),
  );
}

function unquote(value) {
  if (!value) return value;
  return value.replace(/^["']|["']$/g, "");
}

function seedSqlite() {
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    create table if not exists tenants (
      id text primary key,
      name text not null,
      mode text not null,
      created_at text not null
    );

    create table if not exists realtime_apps (
      app_id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      org text not null,
      key text not null,
      secret_encrypted text,
      secret_preview text not null,
      cluster text not null,
      host text not null,
      status text not null,
      active_connections integer not null,
      messages_today integer not null,
      created_at text not null
    );

    create table if not exists api_tokens (
      id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      token_hash text not null unique,
      token_preview text not null,
      scopes text not null,
      created_at text not null,
      last_used_at text
    );

    create table if not exists tenant_memberships (
      tenant_id text not null references tenants(id),
      user_id text not null,
      role text not null,
      created_at text not null,
      primary key (tenant_id, user_id)
    );

    create index if not exists tenant_memberships_user_idx
      on tenant_memberships(user_id);
  `);

  ensureColumn(db, "realtime_apps", "secret_encrypted", "text");

  const now = new Date().toISOString();
  db.prepare(
    `insert into tenants (id, name, mode, created_at)
     values (?, ?, ?, ?)
     on conflict(id) do update set name = excluded.name`,
  ).run(tenantId, tenantName, "self-hosted", now);
  db.prepare(
    `insert into realtime_apps
     (app_id, tenant_id, name, org, key, secret_encrypted, secret_preview, cluster, host, status, active_connections, messages_today, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(app_id) do update set
       tenant_id = excluded.tenant_id,
       key = excluded.key,
       secret_encrypted = excluded.secret_encrypted,
       secret_preview = excluded.secret_preview,
       cluster = excluded.cluster,
       host = excluded.host`,
  ).run(
    appId,
    tenantId,
    "Open Realtime Local",
    tenantName,
    key,
    encrypt(secret),
    `${secret.slice(0, 8)}...${secret.slice(-4)}`,
    cluster,
    `localhost:${gatewayPort}`,
    "operational",
    0,
    0,
    now,
  );
  db.prepare(
    `insert into api_tokens
     (id, tenant_id, name, token_hash, token_preview, scopes, created_at, last_used_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(token_hash) do nothing`,
  ).run(
    `tok_${token(14)}`,
    tenantId,
    "Local gateway",
    hash(serviceToken),
    `${serviceToken.slice(0, 14)}...${serviceToken.slice(-4)}`,
    JSON.stringify(["ingest:write", "registry:read"]),
    now,
    null,
  );
  db.close();
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`pragma table_info(${table})`).all();
  if (!columns.some((existing) => existing.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

function token(length) {
  return crypto.randomBytes(Math.ceil(length * 0.75)).toString("base64url").slice(0, length);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function encryptionKey() {
  return crypto.createHash("sha256").update(appSecretKey).digest();
}
