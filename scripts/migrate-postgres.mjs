#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const dashboardRequire = createRequire(
  path.join(root, "apps/dashboard/package.json"),
);
const postgres = dashboardRequire("postgres");
const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("POSTGRES_URL or DATABASE_URL is required");
  process.exit(1);
}

const schemaPath = path.join(
  root,
  "apps/dashboard/src/lib/orchestrator/postgres-schema.sql",
);
const schema = fs.readFileSync(schemaPath, "utf8");
const sql = postgres(databaseUrl);

try {
  await sql.unsafe(schema);
  console.log("Postgres orchestrator schema is up to date");
} finally {
  await sql.end();
}
