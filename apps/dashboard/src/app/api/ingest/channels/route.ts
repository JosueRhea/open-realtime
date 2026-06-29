import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import type { ChannelSummary } from "@/lib/orchestrator/types";
import { authErrorResponse, requireOrchestratorToken } from "@/lib/security";

const channelTypes = new Set<ChannelSummary["type"]>([
  "public",
  "private",
  "presence",
]);

export async function POST(request: Request) {
  try {
    const authContext = await requireOrchestratorToken(request);
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = requireTenantMatch(body.tenantId, authContext.tenantId);

    const channel = await getDashboardOrchestratorStore().reportChannel({
      tenantId,
      appId: requireString(body.appId, "appId"),
      name: requireString(body.name, "name"),
      type: requireChannelType(body.type),
      subscriptions: requireNumber(body.subscriptions, "subscriptions"),
      messagesPerSecond: requireNumber(
        body.messagesPerSecond,
        "messagesPerSecond",
      ),
      lastActivity:
        typeof body.lastActivity === "string" ? body.lastActivity : undefined,
    });

    return NextResponse.json({ channel }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

function requireChannelType(value: unknown): ChannelSummary["type"] {
  if (
    typeof value !== "string" ||
    !channelTypes.has(value as ChannelSummary["type"])
  ) {
    throw Object.assign(new Error("channel type is invalid"), { status: 400 });
  }

  return value as ChannelSummary["type"];
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
