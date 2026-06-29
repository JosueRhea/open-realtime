import {
  BellRing,
  Boxes,
  CircleDot,
  Globe2,
  RadioTower,
  ShieldCheck,
} from "lucide-react";

import { createWebhookAction } from "@/app/actions";
import { AppManager } from "@/components/dashboard/app-manager";
import { TokenManager } from "@/components/dashboard/token-manager";
import {
  CredentialRow,
  EmptyState,
  Panel,
  SetupRow,
} from "@/components/dashboard/ui";
import type {
  ChannelSummary,
  DashboardOverview,
  RealtimeApp,
  RealtimeEvent,
  UsagePoint,
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

export function ActivityView({ overview }: { overview: DashboardOverview }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Streaming event metadata</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Message bodies are not stored, only delivery metadata.
          </p>
        </div>
        <span className="rounded-md bg-[#f0faf3] px-2 py-1 text-xs text-[#15803d]">
          Powered by Axiom
        </span>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[#6b7280]">
            <tr>
              <th className="py-2 font-medium">Time</th>
              <th className="py-2 font-medium">Event</th>
              <th className="py-2 font-medium">Channel</th>
              <th className="py-2 font-medium">User</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Meta</th>
            </tr>
          </thead>
          <tbody>
            {overview.events.map((event) => (
              <tr className="border-t border-[#eceef0]" key={event.id}>
                <td className="py-3 text-[#6b7280]">{event.time}</td>
                <td className="py-3 font-medium">{event.type}</td>
                <td className="py-3">{event.channel}</td>
                <td className="py-3">{event.user}</td>
                <td className="py-3">{event.status}</td>
                <td className="py-3 text-[#6b7280]">{event.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {overview.events.length === 0 ? (
          <EmptyState
            body="Connect the gateway and start triggering channel events to populate this stream."
            title="No events yet"
          />
        ) : null}
      </div>
    </Panel>
  );
}

export function ChannelsView({ overview }: { overview: DashboardOverview }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Panel>
        <h2 className="text-sm font-semibold">Channels</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[#6b7280]">
              <tr>
                <th className="py-2 font-medium">Channel</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Subs</th>
                <th className="py-2 font-medium">Msg/s</th>
                <th className="py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {overview.channels.map((channel) => (
                <tr className="border-t border-[#eceef0]" key={channel.name}>
                  <td className="py-3 font-medium">{channel.name}</td>
                  <td className="py-3">{channel.type}</td>
                  <td className="py-3">{channel.subscriptions.toLocaleString()}</td>
                  <td className="py-3">{channel.messagesPerSecond}</td>
                  <td className="py-3 text-[#6b7280]">{channel.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

export function UsageView({ overview }: { overview: DashboardOverview }) {
  return (
    <>
      <Metrics overview={overview} />
      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <UsageChart usage={overview.usage} title="Connections · 7d" />
        <UsageChart usage={overview.usage} metric="messages" title="Messages · per hour" />
      </section>
      <section className="grid gap-5 xl:grid-cols-[0.8fr_1fr]">
        <BreakdownPanel />
        <TopChannels channels={overview.channels} />
      </section>
    </>
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
  const clientCode = app
    ? `new Pusher("${app.key}", { wsHost: "${app.host}", cluster: "${app.cluster}", forceTLS: false })`
    : "Create an app to generate client credentials.";
  const serverCode = app
    ? `new Pusher({ appId: "${app.appId}", key: "${app.key}", secret: "env:OPEN_REALTIME_PUSHER_SECRET", host: "${app.host}" })`
    : "Create an app to generate server credentials.";

  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1fr]">
      <Credentials app={app} />
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
          <input
            className="w-full rounded-md border border-[#d4d7db] bg-white px-3 py-2 text-sm outline-none focus:border-[#4f46e5]"
            disabled={!overview.currentApp}
            name="url"
            placeholder="https://api.example.com/pusher/webhooks"
            required
            type="url"
          />
          <div className="space-y-2 text-sm text-[#4b5563]">
            {[
              "channel_occupied",
              "channel_vacated",
              "member_added",
              "member_removed",
            ].map((event) => (
              <label className="flex items-center gap-2" key={event}>
                <input
                  className="size-4"
                  defaultChecked
                  name="events"
                  type="checkbox"
                  value={event}
                />
                {event}
              </label>
            ))}
          </div>
          <button
            className="w-full rounded-md bg-[#1a1d21] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!overview.currentApp}
          >
            Add endpoint
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-[#8a9099]">
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
    <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Panel>
        <p className="text-sm text-[#6b7280]">Current plan</p>
        <h2 className="mt-1 text-2xl font-semibold">
          {tenantModeLabel(overview.tenant.mode)}
        </h2>
        <p className="mt-2 text-sm text-[#6b7280]">
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Members</h2>
          <button className="rounded-md bg-[#1a1d21] px-3 py-2 text-xs font-medium text-white">
            Invite member
          </button>
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
        <div className="flex size-11 items-center justify-center rounded-md bg-[#eef1fe] text-[#3730a3]">
          <Boxes size={20} />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">Create your first app</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7280]">
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
          <p className="text-sm text-[#6b7280]">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          <p className="mt-2 text-xs text-[#6b7280]">{hint}</p>
        </Panel>
      ))}
    </section>
  );
}

function UsageChart({
  metric = "connections",
  title = "Connections · last 24h",
  usage,
}: {
  metric?: "connections" | "messages";
  title?: string;
  usage: UsagePoint[];
}) {
  const max = Math.max(1, ...usage.map((point) => point[metric]));

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-[#6b7280]">{metric}</span>
      </div>
      <div className="mt-5 flex h-56 items-end gap-2 border-b border-[#eceef0]">
        {usage.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-[#8a9099]">
            Waiting for gateway usage reports
          </div>
        ) : (
          usage.map((point) => (
            <div className="flex flex-1 flex-col items-center gap-2" key={point.hour}>
              <div
                className="w-full rounded-t bg-[#4f46e5]"
                style={{ height: `${Math.max(8, (point[metric] / max) * 190)}px` }}
              />
              <span className="text-[11px] text-[#8a9099]">{point.hour}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
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
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[#6b7280]">
            <tr>
              <th className="py-2 font-medium">App</th>
              <th className="py-2 font-medium">App ID</th>
              <th className="py-2 font-medium">Cluster</th>
              <th className="py-2 font-medium">Conns</th>
              <th className="py-2 font-medium">Msgs today</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr className="border-t border-[#eceef0]" key={app.appId}>
                <td className="py-3 font-medium">{app.name}</td>
                <td className="py-3 text-[#6b7280]">{app.appId}</td>
                <td className="py-3">{app.cluster}</td>
                <td className="py-3">{app.activeConnections.toLocaleString()}</td>
                <td className="py-3">{app.messagesToday.toLocaleString()}</td>
                <td className="py-3">{app.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function Credentials({ app }: { app: RealtimeApp | null }) {
  return (
    <Panel>
      <h2 className="text-sm font-semibold">App keys</h2>
      <p className="mt-1 text-sm text-[#6b7280]">
        Pusher-compatible credentials. Keep your secret private.
      </p>
      <div className="mt-4 space-y-3">
        <CredentialRow label="app_id" value={app?.appId ?? "create an app first"} />
        <CredentialRow label="key" value={app?.key ?? "create an app first"} />
        <CredentialRow label="secret" value={app?.secretPreview ?? "create an app first"} />
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Webhooks</h2>
        <button className="rounded-md border border-[#d4d7db] px-3 py-1.5 text-xs">
          Add endpoint
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {webhooks.length === 0 ? (
          <EmptyState
            body="Presence and channel webhooks can be added once an app exists."
            title="No webhook endpoints"
          />
        ) : (
          webhooks.slice(0, compact ? 2 : undefined).map((webhook) => (
            <div className="rounded-md border border-[#eceef0] p-3" key={webhook.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{webhook.url}</p>
                <span className="text-xs text-[#6b7280]">{webhook.status}</span>
              </div>
              <p className="mt-1 text-xs text-[#6b7280]">
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
        <span className="rounded-md bg-[#f0faf3] px-2 py-1 text-xs text-[#15803d]">
          Live
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {events.length === 0 ? (
          <EmptyState
            body="Only event metadata will appear here after the gateway starts reporting."
            title="Waiting for events"
          />
        ) : (
          events.map((event) => (
            <div className="grid grid-cols-[52px_1fr_auto] gap-3 text-sm" key={event.id}>
              <span className="text-[#8a9099]">{event.time}</span>
              <span className="truncate">{event.channel}</span>
              <span className="text-[#6b7280]">{event.status}</span>
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
        <p className="mt-4 text-sm text-[#6b7280]">
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
          <div className="flex justify-between rounded-md border border-[#eceef0] bg-[#fafbfc] px-3 py-2 text-sm" key={name}>
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
            <div className="rounded-md border border-[#eceef0] p-3" key={channel.name}>
              <p className="truncate text-sm font-medium">{channel.name}</p>
              <p className="mt-1 text-xs text-[#6b7280]">{channel.type}</p>
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
      <div className="mb-2 flex items-center justify-between text-xs text-[#6b7280]">
        <span>{label}</span>
      </div>
      <pre className="overflow-x-auto rounded-md bg-[#0e1117] p-4 text-xs leading-6 text-[#c9d1d9]">
        <code>{value}</code>
      </pre>
    </div>
  );
}
