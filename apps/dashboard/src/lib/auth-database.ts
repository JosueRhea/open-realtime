import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { getSqliteDatabase } from "@/lib/db/sqlite";
import { orchestratorStoreDriver } from "@/lib/orchestrator/async-store";

type BetterAuthPostgresDatabase = {
  db: Kysely<unknown>;
  type: "postgres";
};

declare global {
  var __openRealtimeAuthPostgres: BetterAuthPostgresDatabase | undefined;
}

export function getAuthDatabase() {
  if (orchestratorStoreDriver() !== "postgres") {
    return getSqliteDatabase();
  }

  if (!globalThis.__openRealtimeAuthPostgres) {
    const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "POSTGRES_URL or DATABASE_URL is required when ORCHESTRATOR_STORE_DRIVER=postgres",
      );
    }

    globalThis.__openRealtimeAuthPostgres = {
      db: new Kysely({
        dialect: new PostgresDialect({
          pool: new Pool({ connectionString }),
        }),
      }),
      type: "postgres",
    };
  }

  return globalThis.__openRealtimeAuthPostgres;
}
