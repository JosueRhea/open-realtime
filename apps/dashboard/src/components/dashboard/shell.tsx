import {
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardRoute } from "@/components/dashboard/page-renderer";
import type { DashboardOverview } from "@/lib/orchestrator/types";
import { adapterLabel, tenantModeLabel } from "@/lib/runtime-labels";

const navGroups = [
  {
    label: "MONITOR",
    items: [
      { route: "overview", label: "Overview", href: "/", icon: Gauge },
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-b bg-card/80 px-3 py-3 lg:border-r lg:py-4">
          <Link className="mb-4 flex items-center gap-2 px-2 lg:mb-5" href="/">
            <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
              <RadioTower size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Open Realtime</p>
              <p className="text-xs text-muted-foreground">
                {tenantModeLabel(overview.tenant.mode)} console
              </p>
            </div>
          </Link>

          <div className="mb-3 lg:mb-5">
            <AppSwitcher
              apps={overview.apps}
              currentAppId={overview.currentApp?.appId ?? null}
            />
          </div>

          <nav className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0 lg:pb-0">
            {navGroups.map((group) => (
              <div className="flex shrink-0 gap-1 lg:block" key={group.label}>
                <p className="mb-2 hidden px-2 text-[11px] font-medium tracking-wide text-muted-foreground lg:block">
                  {group.label}
                </p>
                <div className="flex gap-1 lg:block lg:space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeRoute === item.route;

                    return (
                      <Link
                        className={[
                          "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-sm",
                          isActive
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        ].join(" ")}
                        href={`${item.href}${selectedAppQuery}`}
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

          <Card className="mt-8 hidden rounded-md lg:block" size="sm">
            <CardContent>
              <p className="font-medium">{overview.tenant.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{adapterLabel()}</p>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0">
          <header className="border-b bg-card/80">
            <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{overview.tenant.name}</span>
                  <span>/</span>
                  <span className="truncate">{overview.currentApp?.appId ?? "create-app"}</span>
                </div>
                <h1 className="mt-1 text-xl font-semibold">{title.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{title.subtitle}</p>
              </div>

              <div className="flex items-center gap-2 md:justify-end">
                <Button asChild className="w-full rounded-md sm:w-auto">
                  <Link href={`/apps${selectedAppQuery}`}>
                    <Plus size={15} />
                    Create app
                  </Link>
                </Button>
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
