import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.OPEN_REALTIME_SQLITE_PATH ??
  path.join(process.cwd(), "data", "open-realtime.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

declare global {
  var __openRealtimeSqlite: Database.Database | undefined;
}

export function getSqliteDatabase() {
  if (!globalThis.__openRealtimeSqlite) {
    globalThis.__openRealtimeSqlite = new Database(dbPath);
    globalThis.__openRealtimeSqlite.pragma("journal_mode = WAL");
    globalThis.__openRealtimeSqlite.pragma("foreign_keys = ON");
  }

  return globalThis.__openRealtimeSqlite;
}
