import type { TenantApp } from "./ports/app-registry";
import type {
  ChannelSnapshot,
  EventSnapshot,
  OrchestratorReporter,
  UsageSnapshot,
} from "./ports/orchestrator-reporter";
import type { Subscription } from "../domain/realtime-event";

interface AppCounters {
  tenantId: string;
  appId: string;
  activeConnections: number;
  messages: number;
  webhookFailures: number;
  channels: Map<string, ChannelCounters>;
}

interface ChannelCounters {
  name: string;
  type: ChannelSnapshot["type"];
  subscriptions: number;
  messages: number;
  lastActivity: string;
}

export class UsageReporter {
  private readonly apps = new Map<string, AppCounters>();
  private readonly interval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly reporter: OrchestratorReporter,
    private readonly options: { flushIntervalMs: number },
  ) {
    if (options.flushIntervalMs > 0) {
      this.interval = setInterval(() => {
        void this.flush();
      }, options.flushIntervalMs);
      this.interval.unref?.();
    }
  }

  connectionOpened(app: TenantApp): void {
    this.counters(app).activeConnections += 1;
    void Promise.all([
      this.flushApp(app),
      this.reportLifecycleEvent(app, "connection.opened", "connection", "gateway"),
    ]).catch(() => {});
  }

  connectionClosed(app: TenantApp | undefined, subscriptions: Subscription[], socketId?: string): void {
    if (!app) return;
    const counters = this.counters(app);
    counters.activeConnections = Math.max(0, counters.activeConnections - 1);
    for (const subscription of subscriptions) {
      this.unsubscribed(app, subscription.channel);
    }
    void Promise.all([
      this.flushApp(app),
      this.reportLifecycleEvent(
        app,
        "connection.closed",
        "connection",
        socketId ?? "gateway",
        `subscriptions:${subscriptions.length}`,
      ),
    ]).catch(() => {});
  }

  subscribed(app: TenantApp, channel: string): void {
    this.channel(app, channel).subscriptions += 1;
    void Promise.all([
      this.flushChannel(app, channel),
      this.reportLifecycleEvent(app, "channel.subscribed", channel, "gateway"),
    ]).catch(() => {});
  }

  unsubscribed(app: TenantApp, channel: string): void {
    const channelCounters = this.channel(app, channel);
    channelCounters.subscriptions = Math.max(0, channelCounters.subscriptions - 1);
    channelCounters.lastActivity = new Date().toISOString();
    void Promise.all([
      this.flushChannel(app, channel),
      this.reportLifecycleEvent(app, "channel.unsubscribed", channel, "gateway"),
    ]).catch(() => {});
  }

  message(app: TenantApp, channel: string, event: string, user = "system"): void {
    const counters = this.counters(app);
    counters.messages += 1;
    const channelCounters = this.channel(app, channel);
    channelCounters.messages += 1;
    channelCounters.lastActivity = new Date().toISOString();
    void Promise.all([
      this.flushApp(app),
      this.flushChannel(app, channel),
      this.reporter.reportEvent({
        tenantId: tenantIdFor(app),
        appId: app.appId,
        type: event,
        channel,
        user,
        status: "sent",
        meta: "gateway",
      }),
    ]).catch(() => {});
  }

  webhookFailure(app: TenantApp): void {
    this.counters(app).webhookFailures += 1;
    void this.flushApp(app);
  }

  async flush(): Promise<void> {
    for (const counters of this.apps.values()) {
      await this.reporter.reportUsage(toUsageSnapshot(counters));
      for (const channel of counters.channels.values()) {
        await this.reporter.reportChannel(toChannelSnapshot(counters, channel));
      }
    }
    await this.reporter.flush();
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private counters(app: TenantApp): AppCounters {
    const tenantId = tenantIdFor(app);
    const key = `${tenantId}:${app.appId}`;
    const existing = this.apps.get(key);
    if (existing) return existing;

    const created: AppCounters = {
      tenantId,
      appId: app.appId,
      activeConnections: 0,
      messages: 0,
      webhookFailures: 0,
      channels: new Map(),
    };
    this.apps.set(key, created);
    return created;
  }

  private channel(app: TenantApp, name: string): ChannelCounters {
    const counters = this.counters(app);
    const existing = counters.channels.get(name);
    if (existing) return existing;

    const created: ChannelCounters = {
      name,
      type: channelType(name),
      subscriptions: 0,
      messages: 0,
      lastActivity: new Date().toISOString(),
    };
    counters.channels.set(name, created);
    return created;
  }

  private async flushApp(app: TenantApp): Promise<void> {
    await this.reporter.reportUsage(toUsageSnapshot(this.counters(app))).catch(() => {});
  }

  private async flushChannel(app: TenantApp, channel: string): Promise<void> {
    const counters = this.counters(app);
    const channelCounters = this.channel(app, channel);
    await this.reporter.reportChannel(toChannelSnapshot(counters, channelCounters)).catch(() => {});
  }

  private async reportLifecycleEvent(
    app: TenantApp,
    type: string,
    channel: string,
    user: string,
    meta = "gateway",
  ): Promise<void> {
    await this.reporter.reportEvent({
      tenantId: tenantIdFor(app),
      appId: app.appId,
      type,
      channel,
      user,
      status: "sent",
      meta,
    });
  }
}

function toUsageSnapshot(counters: AppCounters): UsageSnapshot {
  return {
    tenantId: counters.tenantId,
    appId: counters.appId,
    hour: currentHour(),
    connections: counters.activeConnections,
    messages: counters.messages,
    webhookFailures: counters.webhookFailures,
  };
}

function toChannelSnapshot(counters: AppCounters, channel: ChannelCounters): ChannelSnapshot {
  return {
    tenantId: counters.tenantId,
    appId: counters.appId,
    name: channel.name,
    type: channel.type,
    subscriptions: channel.subscriptions,
    messagesPerSecond: channel.messages,
    lastActivity: channel.lastActivity,
  };
}

function tenantIdFor(app: TenantApp): string {
  return app.tenantId ?? "self-hosted";
}

function channelType(channel: string): ChannelSnapshot["type"] {
  if (channel.startsWith("presence-")) return "presence";
  if (channel.startsWith("private-")) return "private";
  return "public";
}

function currentHour(): string {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return now.toISOString();
}
