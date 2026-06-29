import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import type { RealtimeEvent } from "@/lib/orchestrator/types";
import { authErrorResponse, requireOrchestratorToken } from "@/lib/security";

const statuses = new Set<RealtimeEvent["status"]>([
  "sent",
  "delivered",
  "failed",
]);

export async function POST(request: Request) {
  try {
    const authContext = await requireOrchestratorToken(request);
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = requireTenantMatch(body.tenantId, authContext.tenantId);
    const status = requireStatus(body.status);

    const event = await getDashboardOrchestratorStore().reportEvent({
      tenantId,
      appId: requireString(body.appId, "appId"),
      type: requireString(body.type, "type"),
      channel: requireString(body.channel, "channel"),
      user: requireString(body.user, "user"),
      status,
      meta: typeof body.meta === "string" ? body.meta : "",
      time: typeof body.time === "string" ? body.time : undefined,
    });

    return NextResponse.json({ event }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

function requireStatus(value: unknown): RealtimeEvent["status"] {
  if (typeof value !== "string" || !statuses.has(value as RealtimeEvent["status"])) {
    throw Object.assign(new Error("status is invalid"), { status: 400 });
  }

  return value as RealtimeEvent["status"];
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

function errorResponse(error: unknown) {
  if (error instanceof Error && "status" in error) {
    return Response.json(
      { error: error.message },
      { status: Number(error.status) },
    );
  }

  return authErrorResponse(error);
}
