import { betterAuth } from "better-auth";

import { getAuthDatabase } from "@/lib/auth-database";

export const auth = betterAuth({
  database: getAuthDatabase(),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET ?? "development-only-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
});

let authSchemaPromise: Promise<void> | undefined;

export function ensureAuthSchema() {
  authSchemaPromise ??= auth.$context.then((context) => context.runMigrations());

  return authSchemaPromise;
}
