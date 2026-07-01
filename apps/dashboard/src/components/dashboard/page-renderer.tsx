import { headers } from "next/headers";

import { ensureAuthSchema } from "@/lib/auth";
import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { getSelfHostedTenantId, requireDashboardSession } from "@/lib/security";
import { AuthScreen } from "@/components/dashboard/screens";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  AppsView,
  ChannelsView,
  CredentialsView,
  LimitsView,
  ObservabilityNotice,
  OverviewView,
  TeamView,
  UsageView,
  WebhooksView,
} from "@/components/dashboard/views";
import type { DashboardOverview, UsageRange } from "@/lib/orchestrator/types";

export type DashboardRoute =
  | "overview"
  | "channels"
  | "usage"
  | "apps"
  | "credentials"
  | "webhooks"
  | "limits"
  | "team";

type DashboardSearchParams =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>
  | undefined;

export async function renderDashboardPage(
  route: DashboardRoute,
  searchParams?: DashboardSearchParams,
) {
  await ensureAuthSchema();

  const requestHeaders = await headers();
  const session = await requireDashboardSession(requestHeaders).catch(() => null);

  if (!session) {
    return <AuthScreen />;
  }

  const params = searchParams ? await searchParams : {};
  const selectedAppId = firstParam(params.app);
  const usageRange = parseUsageRange(firstParam(params.range));
  const overview = await getDashboardOrchestratorStore().getOverview(
    session.tenantId || getSelfHostedTenantId(),
    selectedAppId,
    { usageRange },
  );

  return (
    <DashboardShell activeRoute={route} overview={overview}>
      {!overview.observability.configured ? <ObservabilityNotice /> : null}
      {renderRoute(route, overview, usageRange)}
    </DashboardShell>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function renderRoute(
  route: DashboardRoute,
  overview: DashboardOverview,
  usageRange: UsageRange,
) {
  switch (route) {
    case "channels":
      return <ChannelsView overview={overview} />;
    case "usage":
      return <UsageView overview={overview} usageRange={usageRange} />;
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

function parseUsageRange(value: string | undefined): UsageRange {
  switch (value) {
    case "1h":
    case "7d":
    case "30d":
      return value;
    case "24h":
    default:
      return "24h";
  }
}
