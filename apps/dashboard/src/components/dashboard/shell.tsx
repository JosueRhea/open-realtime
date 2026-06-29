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

import type { DashboardRoute } from "@/components/dashboard/page-renderer";
import type { DashboardOverview } from "@/lib/orchestrator/types";

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
    subtitle: "Self-hosted limits, quotas, and future hosted plan controls.",
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

  return (
    <main className="min-h-screen bg-[#f5f6f7] text-[#1a1d21]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-[#e7e9ec] bg-white/80 px-3 py-4">
          <Link className="mb-5 flex items-center gap-2 px-2" href="/">
            <span className="flex size-8 items-center justify-center rounded-md bg-[#1a1d21] text-white">
              <RadioTower size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold">Open Realtime</p>
              <p className="text-xs text-[#6b7280]">Self-hosted console</p>
            </div>
          </Link>

          <div className="mb-5 rounded-md border border-[#e7e9ec] bg-[#fafbfc] p-3">
            <p className="truncate text-sm font-medium">
              {overview.currentApp?.name ?? "No app yet"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[#6b7280]">
              <span className="size-2 rounded-full bg-[#16a34a]" />
              {overview.currentApp?.cluster ?? "SQLite ready"}
            </div>
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
                          "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                          isActive
                            ? "bg-[#eef1fe] text-[#3730a3]"
                            : "text-[#4b5563] hover:bg-[#f4f5f6]",
                        ].join(" ")}
                        href={item.href}
                        key={item.route}
                      >
                        <Icon size={15} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-8 rounded-md border border-[#e7e9ec] bg-[#fafbfc] p-3 text-xs">
            <p className="font-medium">{overview.tenant.name}</p>
            <p className="mt-1 text-[#6b7280]">SQLite adapter</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-[#e7e9ec] bg-white/80">
            <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <div className="flex items-center gap-2 text-xs text-[#6b7280]">
                  <span>{overview.tenant.name}</span>
                  <span>/</span>
                  <span>{overview.currentApp?.appId ?? "create-app"}</span>
                </div>
                <h1 className="mt-1 text-xl font-semibold">{title.title}</h1>
                <p className="mt-1 text-sm text-[#6b7280]">{title.subtitle}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden rounded-md border border-[#d4d7db] bg-white px-3 py-2 text-xs text-[#4b5563] sm:inline-flex">
                  1H 24H 7D 30D
                </span>
                <Link
                  className="inline-flex items-center gap-2 rounded-md bg-[#1a1d21] px-3 py-2 text-sm font-medium text-white"
                  href="/apps"
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
