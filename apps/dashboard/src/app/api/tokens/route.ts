import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { authErrorResponse, requireDashboardSession } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const authContext = await requireDashboardSession(request.headers);

    return NextResponse.json({
      tenantId: authContext.tenantId,
      tokens: await getDashboardOrchestratorStore().listApiTokens(authContext.tenantId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authContext = await requireDashboardSession(request.headers);
    const body = (await request.json()) as {
      name?: unknown;
      scopes?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((scope): scope is string => typeof scope === "string")
      : undefined;

    if (!name) {
      return NextResponse.json(
        { error: "Token name is required" },
        { status: 400 },
      );
    }

    const created = await getDashboardOrchestratorStore().createApiToken({
      tenantId: authContext.tenantId,
      name,
      scopes,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
