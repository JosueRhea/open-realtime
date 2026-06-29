import { toNextJsHandler } from "better-auth/next-js";

import { auth, ensureAuthSchema } from "@/lib/auth";

const authHandlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureAuthSchema();

  return authHandlers.GET(request);
}

export async function POST(request: Request) {
  await ensureAuthSchema();

  return authHandlers.POST(request);
}
