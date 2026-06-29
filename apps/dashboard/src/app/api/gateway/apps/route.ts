import { NextResponse } from "next/server";

import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { authErrorResponse, requireOrchestratorToken } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const authContext = await requireOrchestratorToken(request, "registry:read");
    const apps = await getDashboardOrchestratorStore().listGatewayApps(
      authContext.tenantId,
    );

    return NextResponse.json({
      tenantId: authContext.tenantId,
      apps,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
