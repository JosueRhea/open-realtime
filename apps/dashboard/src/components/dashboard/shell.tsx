import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  CreditCard,
  Gauge,
  KeyRound,
  Plus,
  RadioTower,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppSwitcher } from "@/components/dashboard/app-switcher";
import type { DashboardRoute } from "@/components/dashboard/page-renderer";
import type { DashboardOverview } from "@/lib/orchestrator/types";
import { adapterLabel, tenantModeLabel } from "@/lib/runtime-labels";

const navGroups = [
  {
    label: "MONITOR",
    items: [
      { route: "overview", label: "Overview", href: "/", icon: Gauge },
      { route: "activity", label: "Realtime Activity", href: "/activity", icon: Activity },
      { route: "channels", label: "Channels", href: "/channels", icon: RadioTower },
      { route: "usage", label: "Usage & Analytics", href: "/usage", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "CONFIGURE",
    items: [
      { route: "apps", label: "Apps", href: "/apps", icon: Boxes },
      { route: "credentials", label: "Credentials", href: "/credentials", icon: KeyRound },
      { route: "webhooks", label: "Webhooks", href: "/webhooks", icon: Webhook },
      { route: "limits", label: "Limits & Billing", href: "/limits", icon: CreditCard },
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      { route: "team", label: "Team & Settings", href: "/team", icon: Users },
    ],
  },
] as const;

const titles: Record<DashboardRoute, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "Health, traffic, and app status for this realtime instance.",
  },
  activity: {
    title: "Realtime Activity",
    subtitle: "Event metadata stream from channels and webhooks.",
  },
  channels: {
    title: "Channels",
    subtitle: "Current channel subscriptions, types, and presence state.",
  },
  usage: {
    title: "Usage & Analytics",
    subtitle: "Connections, messages, event types, and top channels.",
  },
  apps: {
    title: "Apps",
    subtitle: "Create and manage Pusher-compatible realtime applications.",
  },
  credentials: {
    title: "Credentials",
    subtitle: "Client and server keys for the selected app.",
  },
  webhooks: {
    title: "Webhooks",
    subtitle: "Presence, channel, and client-event delivery endpoints.",
  },
  limits: {
    title: "Limits & Billing",
    subtitle: "Limits, quotas, and hosted plan controls.",
  },
  team: {
    title: "Team & Settings",
    subtitle: "Members, API tokens, audit log, and instance settings.",
  },
};

export function DashboardShell({
  activeRoute,
  children,
  overview,
}: {
  activeRoute: DashboardRoute;
  children: ReactNode;
  overview: DashboardOverview;
}) {
  const title = titles[activeRoute];
  const selectedAppQuery = overview.currentApp
    ? `?app=${encodeURIComponent(overview.currentApp.appId)}`
    : "";

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#1a1d21]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-[#dde5ef] bg-white px-3 py-4 shadow-[1px_0_0_rgba(15,23,42,0.02)]">
          <Link className="mb-5 flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-[#f4f7fb]" href="/">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#14213d] text-white">
              <RadioTower size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Open Realtime</p>
              <p className="truncate text-xs text-[#6b7280]">
                {tenantModeLabel(overview.tenant.mode)} console
              </p>
            </div>
          </Link>

          <div className="mb-5">
            <AppSwitcher
              apps={overview.apps}
              currentAppId={overview.currentApp?.appId ?? null}
            />
          </div>

          <nav className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-2 text-[11px] font-medium tracking-wide text-[#a3a8b0]">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeRoute === item.route;

                    return (
                      <Link
                        className={[
                          "flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm",
                          isActive
                            ? "bg-[#eaf2ff] text-[#1454b8] shadow-[inset_3px_0_0_#2f80ed]"
                            : "text-[#4b5563] hover:bg-[#f4f7fb]",
                        ].join(" ")}
                        href={`${item.href}${selectedAppQuery}`}
                        key={item.route}
                      >
                        <Icon className="shrink-0" size={15} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-8 rounded-md border border-[#dde5ef] bg-[#f7fafc] p-3 text-xs">
            <p className="break-words font-medium">{overview.tenant.name}</p>
            <p className="mt-1 text-[#6b7280]">{adapterLabel()}</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-[#dde5ef] bg-white/90">
            <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-xs text-[#6b7280]">
                  <span className="truncate">{overview.tenant.name}</span>
                  <span>/</span>
                  <span className="truncate">{overview.currentApp?.appId ?? "create-app"}</span>
                </div>
                <h1 className="mt-1 text-xl font-semibold">{title.title}</h1>
                <p className="mt-1 text-sm leading-5 text-[#6b7280]">{title.subtitle}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden rounded-md border border-[#d4d7db] bg-white px-3 py-2 text-xs text-[#4b5563] sm:inline-flex">
                  1H 24H 7D 30D
                </span>
                <Link
                  className="inline-flex items-center gap-2 rounded-md bg-[#14213d] px-3 py-2 text-sm font-medium text-white hover:bg-[#0f1a31]"
                  href={`/apps${selectedAppQuery}`}
                >
                  <Plus size={15} />
                  Create app
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
