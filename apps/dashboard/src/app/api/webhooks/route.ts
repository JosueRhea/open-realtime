import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { authErrorResponse, requireDashboardSession } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const authContext = await requireDashboardSession(request.headers);
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("appId");

    if (!appId) {
      return NextResponse.json(
        { error: "appId is required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      tenantId: authContext.tenantId,
      webhooks: await getDashboardOrchestratorStore().listWebhooks(
        authContext.tenantId,
        appId,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authContext = await requireDashboardSession(request.headers);
    const body = (await request.json()) as {
      appId?: unknown;
      url?: unknown;
      enabledEvents?: unknown;
    };
    const appId = typeof body.appId === "string" ? body.appId.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const enabledEvents = Array.isArray(body.enabledEvents)
      ? body.enabledEvents.filter(
          (event): event is string => typeof event === "string",
        )
      : [];

    if (!appId || !url) {
      return NextResponse.json(
        { error: "appId and url are required" },
        { status: 400 },
      );
    }

    const webhook = await getDashboardOrchestratorStore().createWebhook({
      tenantId: authContext.tenantId,
      appId,
      url,
      enabledEvents,
    });

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create webhook",
      },
      { status: 409 },
    );
  }
}
