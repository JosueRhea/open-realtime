import { headers as nextHeaders } from "next/headers";

import { auth, ensureAuthSchema } from "@/lib/auth";
import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";

export type AuthenticatedTenant = {
  tenantId: string;
  userId?: string;
  tokenId?: string;
  role?: "owner" | "admin" | "member";
  scopes: string[];
};

export class AuthRequiredError extends Error {
  status = 401;

  constructor(message = "Authentication required") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  status = 403;

  constructor(message = "Forbidden") {
    super(message);
  }
}

export function getSelfHostedTenantId() {
  return process.env.OPEN_REALTIME_TENANT_ID ?? "self-hosted";
}

export async function requireDashboardSession(
  requestHeaders?: Headers,
): Promise<AuthenticatedTenant> {
  await ensureAuthSchema();

  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await nextHeaders()),
  });

  if (!session) {
    throw new AuthRequiredError();
  }

  const requestedTenantId =
    requestHeaders?.get("x-open-realtime-tenant-id") ??
    process.env.OPEN_REALTIME_TENANT_ID ??
    undefined;
  const membership = await getDashboardOrchestratorStore().ensureTenantForUser({
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    tenantId: requestedTenantId,
  });

  return {
    tenantId: membership.tenantId,
    userId: session.user.id,
    role: membership.role,
    scopes: ["dashboard:admin"],
  };
}

export async function requireOrchestratorToken(
  request: Request,
  requiredScope = "ingest:write",
): Promise<AuthenticatedTenant> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw new AuthRequiredError("Bearer token required");
  }

  const verifiedToken = await getDashboardOrchestratorStore().verifyApiToken(token);

  if (!verifiedToken) {
    throw new AuthRequiredError("Invalid bearer token");
  }

  if (!verifiedToken.scopes.includes(requiredScope)) {
    throw new ForbiddenError(`Missing scope ${requiredScope}`);
  }

  return {
    tenantId: verifiedToken.tenantId,
    tokenId: verifiedToken.id,
    scopes: verifiedToken.scopes,
  };
}

export function authErrorResponse(error: unknown) {
  const status =
    error instanceof AuthRequiredError || error instanceof ForbiddenError
      ? error.status
      : 500;

  return Response.json(
    {
      error: error instanceof Error ? error.message : "Unexpected error",
    },
    { status },
  );
}
