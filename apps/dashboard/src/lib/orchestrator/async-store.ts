import { PostgresOrchestratorStore } from "@/lib/orchestrator/postgres-adapter";
import type { AsyncOrchestratorStore } from "@/lib/orchestrator/async-types";
import { SqliteAsyncOrchestratorStore } from "@/lib/orchestrator/sqlite-async-adapter";

export type OrchestratorStoreDriver = "sqlite" | "postgres";

export function orchestratorStoreDriver(): OrchestratorStoreDriver {
  const driver = process.env.ORCHESTRATOR_STORE_DRIVER;
  if (driver === "postgres") return "postgres";
  return "sqlite";
}

export function getAsyncOrchestratorStore(): AsyncOrchestratorStore {
  if (orchestratorStoreDriver() !== "postgres") {
    return new SqliteAsyncOrchestratorStore();
  }

  const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "POSTGRES_URL or DATABASE_URL is required when ORCHESTRATOR_STORE_DRIVER=postgres",
    );
  }

  return PostgresOrchestratorStore.fromConnectionString(databaseUrl);
}
