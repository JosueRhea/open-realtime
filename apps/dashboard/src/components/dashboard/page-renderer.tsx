import { headers } from "next/headers";

import { ensureAuthSchema } from "@/lib/auth";
import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { getSelfHostedTenantId, requireDashboardSession } from "@/lib/security";
import { AuthScreen } from "@/components/dashboard/screens";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  ActivityView,
  AppsView,
  ChannelsView,
  CredentialsView,
  LimitsView,
  OverviewView,
  TeamView,
  UsageView,
  WebhooksView,
} from "@/components/dashboard/views";
import type { DashboardOverview } from "@/lib/orchestrator/types";

export type DashboardRoute =
  | "overview"
  | "activity"
  | "channels"
  | "usage"
  | "apps"
  | "credentials"
  | "webhooks"
  | "limits"
  | "team";

export async function renderDashboardPage(route: DashboardRoute) {
  await ensureAuthSchema();

  const requestHeaders = await headers();
  const session = await requireDashboardSession(requestHeaders).catch(() => null);

  if (!session) {
    return <AuthScreen />;
  }

  const overview = await getDashboardOrchestratorStore().getOverview(
    session.tenantId || getSelfHostedTenantId(),
  );

  return (
    <DashboardShell activeRoute={route} overview={overview}>
      {renderRoute(route, overview)}
    </DashboardShell>
  );
}

function renderRoute(
  route: DashboardRoute,
  overview: DashboardOverview,
) {
  switch (route) {
    case "activity":
      return <ActivityView overview={overview} />;
    case "channels":
      return <ChannelsView overview={overview} />;
    case "usage":
      return <UsageView overview={overview} />;
    case "apps":
      return <AppsView overview={overview} />;
    case "credentials":
      return <CredentialsView overview={overview} />;
    case "webhooks":
      return <WebhooksView overview={overview} />;
    case "limits":
      return <LimitsView overview={overview} />;
    case "team":
      return <TeamView overview={overview} />;
    case "overview":
    default:
      return <OverviewView overview={overview} />;
  }
}
