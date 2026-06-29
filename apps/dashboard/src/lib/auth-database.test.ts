import { afterEach, describe, expect, it } from "vitest";

import { getAuthDatabase } from "@/lib/auth-database";

describe("getAuthDatabase", () => {
  const originalDriver = process.env.ORCHESTRATOR_STORE_DRIVER;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.ORCHESTRATOR_STORE_DRIVER = originalDriver;
    process.env.POSTGRES_URL = originalPostgresUrl;
    process.env.DATABASE_URL = originalDatabaseUrl;
    globalThis.__openRealtimeAuthPostgres = undefined;
  });

  it("uses SQLite when the orchestrator store driver is SQLite", () => {
    process.env.ORCHESTRATOR_STORE_DRIVER = "sqlite";

    expect("prepare" in getAuthDatabase()).toBe(true);
  });

  it("uses Postgres when the orchestrator store driver is Postgres", () => {
    process.env.ORCHESTRATOR_STORE_DRIVER = "postgres";
    process.env.POSTGRES_URL = "postgres://user:password@localhost:5432/open_realtime";

    expect(getAuthDatabase()).toMatchObject({ type: "postgres" });
  });
});
