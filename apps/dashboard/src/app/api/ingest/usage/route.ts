import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { authErrorResponse, requireOrchestratorToken } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const authContext = await requireOrchestratorToken(request);
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = requireTenantMatch(body.tenantId, authContext.tenantId);
    const appId = requireString(body.appId, "appId");
    const hour = requireString(body.hour, "hour");
    const connections = requireNumber(body.connections, "connections");
    const connectionDelta =
      typeof body.connectionDelta === "number" && Number.isFinite(body.connectionDelta)
        ? body.connectionDelta
        : undefined;
    const messages = requireNumber(body.messages, "messages");
    const webhookFailures =
      typeof body.webhookFailures === "number" ? body.webhookFailures : 0;

    const usage = await getDashboardOrchestratorStore().reportUsage({
      tenantId,
      appId,
      hour,
      connections,
      connectionDelta,
      messages,
      webhookFailures,
    });

    return NextResponse.json({ usage }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

function requireTenantMatch(value: unknown, tokenTenantId: string) {
  const tenantId = requireString(value, "tenantId");

  if (tenantId !== tokenTenantId) {
    throw Object.assign(new Error("tenantId does not match bearer token"), {
      status: 403,
    });
  }

  return tenantId;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }

  return value.trim();
}

function requireNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw Object.assign(new Error(`${field} must be a number`), { status: 400 });
  }

  return value;
}

function errorResponse(error: unknown) {
  if (error instanceof Error && "status" in error) {
    return Response.json(
      { error: error.message },
      { status: Number(error.status) },
    );
  }

  return authErrorResponse(error);
}
