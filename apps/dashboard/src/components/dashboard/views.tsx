import {
  BellRing,
  Boxes,
  CircleDot,
  Globe2,
  KeyRound,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { createWebhookAction } from "@/app/actions";
import { AppManager } from "@/components/dashboard/app-manager";
import { TokenManager } from "@/components/dashboard/token-manager";
import {
  CredentialRow,
  EmptyState,
  Panel,
  SetupRow,
} from "@/components/dashboard/ui";
import { UsageChart } from "@/components/dashboard/usage-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  ChannelSummary,
  DashboardOverview,
  GatewayAppCredential,
  RealtimeApp,
  RealtimeEvent,
  UsageRange,
  WebhookEndpoint,
} from "@/lib/orchestrator/types";
import {
  adapterLabel,
  controlPlaneDescription,
  databaseLabel,
  tenantModeLabel,
} from "@/lib/runtime-labels";

export function OverviewView({ overview }: { overview: DashboardOverview }) {
  if (overview.apps.length === 0) {
    return <EmptyPlatform overview={overview} />;
  }

  return (
    <>
      <Metrics overview={overview} />
      <section className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <UsageChart usage={overview.usage} />
        <HealthPanel overview={overview} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <EventsPanel events={overview.events} />
        <WebhookPanel webhooks={overview.webhooks} compact />
      </section>
    </>
  );
}

export function ChannelsView({ overview }: { overview: DashboardOverview }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Panel>
        <h2 className="text-sm font-semibold">Channels</h2>
        <div className="mt-4">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subs</TableHead>
                <TableHead>Msg/s</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.channels.map((channel) => (
                <TableRow key={channel.name}>
                  <TableCell className="font-medium">{channel.name}</TableCell>
                  <TableCell>{channel.type}</TableCell>
                  <TableCell>{channel.subscriptions.toLocaleString()}</TableCell>
                  <TableCell>{channel.messagesPerSecond}</TableCell>
                  <TableCell className="text-muted-foreground">{channel.lastActivity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {overview.channels.length === 0 ? (
            <EmptyState
              body="Public, private, and presence channels will appear as clients subscribe."
              title="No active channels"
            />
          ) : null}
        </div>
      </Panel>
      <PresencePanel channels={overview.channels} />
    </section>
  );
}

export function UsageView({
  overview,
  usageRange,
}: {
  overview: DashboardOverview;
  usageRange: UsageRange;
}) {
  return (
    <>
      <UsageRangeSelector
        currentAppId={overview.currentApp?.appId ?? null}
        value={usageRange}
      />
      <Metrics overview={overview} />
      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <UsageChart
          range={usageRange}
          usage={overview.usage}
          title={`Connections · ${usageRangeLabel(usageRange)}`}
        />
        <UsageChart
          usage={overview.usage}
          metric="messages"
          range={usageRange}
          title={`Messages · ${usageRangeLabel(usageRange)}`}
        />
      </section>
      <section className="grid gap-5 xl:grid-cols-[0.8fr_1fr]">
        <BreakdownPanel />
        <TopChannels channels={overview.channels} />
      </section>
    </>
  );
}

function UsageRangeSelector({
  currentAppId,
  value,
}: {
  currentAppId: string | null;
  value: UsageRange;
}) {
  const ranges: Array<{ label: string; value: UsageRange }> = [
    { label: "1H", value: "1h" },
    { label: "24H", value: "24h" },
    { label: "7D", value: "7d" },
    { label: "30D", value: "30d" },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold">Usage window</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connections and messages for the selected app.
        </p>
      </div>
      <ToggleGroup
        className="w-full justify-start overflow-x-auto rounded-md border bg-card p-1 sm:w-auto"
        size="sm"
        type="single"
        value={value}
      >
        {ranges.map((range) => {
          const params = new URLSearchParams({ range: range.value });
          if (currentAppId) params.set("app", currentAppId);

          return (
            <ToggleGroupItem asChild key={range.value} value={range.value}>
              <Link className="rounded-md" href={`/usage?${params.toString()}`}>
                {range.label}
              </Link>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

export function AppsView({ overview }: { overview: DashboardOverview }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <AppsTable apps={overview.apps} />
      <CreateAppPanel />
    </section>
  );
}

export function CredentialsView({ overview }: { overview: DashboardOverview }) {
  const app = overview.currentApp;
  const selectedCredentials = app
    ? overview.gatewayApps.find((credentials) => credentials.appId === app.appId) ?? null
    : null;
  const clientCode = app
    ? `new Pusher("${app.key}", { wsHost: "${app.host}", cluster: "${app.cluster}", forceTLS: false })`
    : "Create an app to generate client credentials.";
  const serverCode = app && selectedCredentials
    ? `new Pusher({ appId: "${app.appId}", key: "${app.key}", secret: "${selectedCredentials.secret}", host: "${app.host}" })`
    : "Create an app to generate server credentials.";

  return (
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Credentials app={app} credentials={selectedCredentials} />
      <Panel>
        <h2 className="text-sm font-semibold">Code snippets</h2>
        <CodeBlock label="Client · pusher-js" value={clientCode} />
        <CodeBlock label="Server · pusher (Node)" value={serverCode} />
      </Panel>
    </section>
  );
}

export function WebhooksView({ overview }: { overview: DashboardOverview }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <WebhookPanel webhooks={overview.webhooks} />
      <Panel>
        <h2 className="text-sm font-semibold">Add endpoint</h2>
        <form action={createWebhookAction} className="mt-4 space-y-3">
          <input
            name="appId"
            type="hidden"
            value={overview.currentApp?.appId ?? ""}
          />
          <Input
            className="rounded-md"
            disabled={!overview.currentApp}
            name="url"
            placeholder="https://api.example.com/pusher/webhooks"
            required
            type="url"
          />
          <div className="space-y-2 text-sm text-muted-foreground">
            {[
              "channel_occupied",
              "channel_vacated",
              "member_added",
              "member_removed",
            ].map((event) => (
              <label className="flex items-center gap-2" key={event}>
                <Checkbox
                  defaultChecked
                  name="events"
                  value={event}
                />
                {event}
              </label>
            ))}
          </div>
          <Button
            className="w-full rounded-md"
            disabled={!overview.currentApp}
          >
            Add endpoint
          </Button>
        </form>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Endpoints receive signed POST requests for presence, channel, and
          batched Pusher-compatible events.
        </p>
      </Panel>
    </section>
  );
}

export function LimitsView({ overview }: { overview: DashboardOverview }) {
  const limits = [
    ["Max connections", "20,000", `${overview.totals.activeConnections.toLocaleString()} used`],
    ["Messages / day", "5,000,000", `${overview.totals.messagesToday.toLocaleString()} used`],
    ["Webhook URLs", "10", `${overview.webhooks.length} configured`],
    ["Retention", "14 days", "metadata only"],
    ["Regions", tenantModeLabel(overview.tenant.mode), overview.currentApp?.cluster ?? "not configured"],
  ];

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,360px)_1fr]">
      <Panel>
        <p className="text-sm text-muted-foreground">Current plan</p>
        <h2 className="mt-1 text-2xl font-semibold">
          {tenantModeLabel(overview.tenant.mode)}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {controlPlaneDescription()}
        </p>
      </Panel>
      <Panel>
        <h2 className="text-sm font-semibold">Included usage</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {limits.map(([label, value, note]) => (
            <SetupRow icon={ShieldCheck} key={label} label={label} value={`${value} · ${note}`} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

export function TeamView({ overview }: { overview: DashboardOverview }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Panel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Members</h2>
          <Button className="rounded-md" size="xs">
            Invite member
          </Button>
        </div>
        <EmptyState
          body="The first owner account is active. Team invitations will be stored through the auth adapter next."
          title="No invited members"
        />
      </Panel>
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">API tokens</h2>
        </div>
        <TokenManager tokens={overview.apiTokens} />
      </Panel>
      <Panel>
        <h2 className="text-sm font-semibold">Instance settings</h2>
        <div className="mt-4 space-y-3">
          <SetupRow icon={ShieldCheck} label="Tenant" value={overview.tenant.name} />
          <SetupRow icon={CircleDot} label="Mode" value={tenantModeLabel(overview.tenant.mode)} />
          <SetupRow icon={Globe2} label="Adapter" value={adapterLabel()} />
        </div>
      </Panel>
      <Panel className="xl:col-span-2">
        <h2 className="text-sm font-semibold">Audit log</h2>
        <EmptyState
          body="Security-sensitive changes will show here once audit events are written."
          title="No audit entries"
        />
      </Panel>
    </section>
  );
}

function EmptyPlatform({ overview }: { overview: DashboardOverview }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Panel className="p-8">
        <div className="flex size-11 items-center justify-center rounded-md bg-muted text-foreground">
          <Boxes size={20} />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">Create your first app</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          The platform is running with {databaseLabel()} and Better Auth. No demo data is
          loaded; once an app is created, the gateway can report realtime
          usage, webhooks, channels, and event metadata into this store.
        </p>
        <div className="mt-6 max-w-xl">
          <AppManager />
        </div>
      </Panel>

      <Panel>
        <h3 className="text-sm font-semibold">{tenantModeLabel(overview.tenant.mode)} runtime</h3>
        <div className="mt-4 space-y-3">
          <SetupRow icon={ShieldCheck} label="Auth" value="Better Auth" />
          <SetupRow icon={Globe2} label="Orchestrator" value="Next API routes" />
          <SetupRow icon={CircleDot} label="Database" value={databaseLabel()} />
          <SetupRow icon={RadioTower} label="Gateway" value="Hono app" />
        </div>
      </Panel>
    </section>
  );
}

function Metrics({ overview }: { overview: DashboardOverview }) {
  const metrics = [
    ["Active connections", overview.totals.activeConnections.toLocaleString(), "reported by gateway"],
    ["Messages today", overview.totals.messagesToday.toLocaleString(), "all apps"],
    ["Peak connections", overview.totals.peakConnections.toLocaleString(), "current window"],
    ["Webhook failures", overview.totals.webhookFailures.toLocaleString(), "needs attention"],
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value, hint]) => (
        <Panel className="p-4" key={label}>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </Panel>
      ))}
    </section>
  );
}

function usageRangeLabel(range: UsageRange) {
  switch (range) {
    case "1h":
      return "last hour";
    case "7d":
      return "last 7 days";
    case "30d":
      return "last 30 days";
    case "24h":
    default:
      return "last 24 hours";
  }
}

function HealthPanel({ overview }: { overview: DashboardOverview }) {
  return (
    <Panel>
      <h2 className="text-sm font-semibold">App health</h2>
      <div className="mt-4 grid gap-3">
        <SetupRow icon={CircleDot} label="Status" value={overview.currentApp?.status ?? "not configured"} />
        <SetupRow icon={Globe2} label="Host" value={overview.currentApp?.host ?? "not configured"} />
        <SetupRow icon={RadioTower} label="Cluster" value={overview.currentApp?.cluster ?? "not configured"} />
        <SetupRow icon={BellRing} label="Webhook success" value={overview.totals.webhookFailures === 0 ? "clean" : "attention"} />
      </div>
    </Panel>
  );
}

function AppsTable({ apps }: { apps: RealtimeApp[] }) {
  return (
    <Panel>
      <h2 className="text-sm font-semibold">{apps.length} apps in this instance</h2>
      <div className="mt-4">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead>App ID</TableHead>
              <TableHead>Cluster</TableHead>
              <TableHead>Conns</TableHead>
              <TableHead>Msgs today</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.map((app) => (
              <TableRow key={app.appId}>
                <TableCell className="font-medium">{app.name}</TableCell>
                <TableCell className="text-muted-foreground">{app.appId}</TableCell>
                <TableCell>{app.cluster}</TableCell>
                <TableCell>{app.activeConnections.toLocaleString()}</TableCell>
                <TableCell>{app.messagesToday.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline">{app.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild className="rounded-md" size="xs" variant="outline">
                    <Link href={`/credentials?app=${encodeURIComponent(app.appId)}`}>
                      <KeyRound size={13} />
                      Keys
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {apps.length === 0 ? (
          <EmptyState
            body="Create an app to issue Pusher-compatible keys and start accepting connections."
            title="No apps yet"
          />
        ) : null}
      </div>
    </Panel>
  );
}

function CreateAppPanel() {
  return (
    <Panel>
      <h2 className="text-sm font-semibold">Create app</h2>
      <AppManager />
    </Panel>
  );
}

function Credentials({
  app,
  credentials,
}: {
  app: RealtimeApp | null;
  credentials: GatewayAppCredential | null;
}) {
  return (
    <Panel>
      <h2 className="text-sm font-semibold">
        {app ? `${app.name} keys` : "App keys"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pusher-compatible credentials. Keep your secret private.
      </p>
      <div className="mt-4 space-y-3">
        <CredentialRow label="app_id" value={app?.appId ?? "create an app first"} />
        <CredentialRow label="key" value={app?.key ?? "create an app first"} />
        <CredentialRow
          label="secret"
          value={credentials?.secret ?? app?.secretPreview ?? "create an app first"}
        />
        <CredentialRow label="cluster" value={app?.cluster ?? "create an app first"} />
        <CredentialRow label="host" value={app?.host ?? "create an app first"} />
      </div>
    </Panel>
  );
}

function WebhookPanel({
  compact = false,
  webhooks,
}: {
  compact?: boolean;
  webhooks: WebhookEndpoint[];
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">Webhooks</h2>
        <Button className="rounded-md" size="xs" variant="outline">
          Add endpoint
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {webhooks.length === 0 ? (
          <EmptyState
            body="Presence and channel webhooks can be added once an app exists."
            title="No webhook endpoints"
          />
        ) : (
          webhooks.slice(0, compact ? 2 : undefined).map((webhook) => (
            <div className="rounded-md border p-3" key={webhook.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="truncate text-sm font-medium">{webhook.url}</p>
                <Badge variant="outline">{webhook.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {webhook.enabledEvents.join(", ")}
              </p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function EventsPanel({ events }: { events: RealtimeEvent[] }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent realtime events</h2>
        <Badge variant="secondary">Live</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {events.length === 0 ? (
          <EmptyState
            body="Only event metadata will appear here after the gateway starts reporting."
            title="Waiting for events"
          />
        ) : (
          events.map((event) => (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 text-sm sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:gap-3" key={event.id}>
              <span className="text-muted-foreground">{event.time}</span>
              <span className="min-w-0 break-all">{event.channel}</span>
              <span className="text-muted-foreground">{event.status}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function PresencePanel({ channels }: { channels: ChannelSummary[] }) {
  const presence = channels.find((channel) => channel.type === "presence");

  return (
    <Panel>
      <h2 className="text-sm font-semibold">
        Presence members · {presence?.subscriptions ?? 0}
      </h2>
      {presence ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Presence member details will appear here once the gateway reports
          member state for {presence.name}.
        </p>
      ) : (
        <EmptyState
          body="Presence members are only tracked on presence channels."
          title="No presence data"
        />
      )}
    </Panel>
  );
}

function BreakdownPanel() {
  const rows = [
    ["message_sent", "0"],
    ["client_event", "0"],
    ["member_added", "0"],
    ["webhook_delivery", "0"],
  ];

  return (
    <Panel>
      <h2 className="text-sm font-semibold">Breakdown by event type</h2>
      <div className="mt-4 space-y-2">
        {rows.map(([name, value]) => (
          <div className="flex justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm" key={name}>
            <span>{name}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TopChannels({ channels }: { channels: ChannelSummary[] }) {
  return (
    <Panel>
      <h2 className="text-sm font-semibold">Top channels</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {channels.length === 0 ? (
          <EmptyState
            body="Channels will rank here by subscriptions and message rate."
            title="No channel traffic"
          />
        ) : (
          channels.map((channel) => (
            <div className="rounded-md border p-3" key={channel.name}>
              <p className="truncate text-sm font-medium">{channel.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{channel.type}</p>
              <p className="mt-3 text-sm">
                {channel.subscriptions.toLocaleString()} subs ·{" "}
                {channel.messagesPerSecond}/s
              </p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-4 text-xs leading-6 text-foreground">
        <code>{value}</code>
      </pre>
    </div>
  );
}
