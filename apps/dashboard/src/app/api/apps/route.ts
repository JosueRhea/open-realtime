import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { authErrorResponse, requireDashboardSession } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const authContext = await requireDashboardSession(request.headers);
    const store = getDashboardOrchestratorStore();

    return NextResponse.json({
      tenantId: authContext.tenantId,
      apps: await store.listApps(authContext.tenantId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authContext = await requireDashboardSession(request.headers);
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "App name is required" },
        { status: 400 },
      );
    }

    const { plainTextSecret, ...app } = await getDashboardOrchestratorStore().createApp({
      tenantId: authContext.tenantId,
      name,
    });

    return NextResponse.json({ app, plainTextSecret }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return authErrorResponse(error);
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create app",
      },
      { status: 409 },
    );
  }
}
