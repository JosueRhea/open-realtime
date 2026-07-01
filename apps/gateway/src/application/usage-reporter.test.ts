import { describe, expect, it } from "vitest";

import type {
  ChannelSnapshot,
  EventSnapshot,
  OrchestratorReporter,
  UsageSnapshot,
} from "./ports/orchestrator-reporter";
import { UsageReporter } from "./usage-reporter";

class RecordingReporter implements OrchestratorReporter {
  readonly usage: UsageSnapshot[] = [];
  readonly events: EventSnapshot[] = [];
  readonly channels: ChannelSnapshot[] = [];

  async reportUsage(snapshot: UsageSnapshot): Promise<void> {
    this.usage.push(snapshot);
  }

  async reportEvent(snapshot: EventSnapshot): Promise<void> {
    this.events.push(snapshot);
  }

  async reportChannel(snapshot: ChannelSnapshot): Promise<void> {
    this.channels.push(snapshot);
  }

  async flush(): Promise<void> {}
}

const app = {
  appId: "app",
  key: "key",
  secret: "secret",
  tenantId: "tenant-1",
};

describe("UsageReporter", () => {
  it("reports tenant-scoped connection, message, and channel snapshots", async () => {
    const reporter = new RecordingReporter();
    const usage = new UsageReporter(reporter, { flushIntervalMs: 0 });

    usage.connectionOpened(app);
    usage.subscribed(app, "presence-room");
    usage.message(app, "presence-room", "client-typing", "user-1");
    await usage.flush();

    expect(reporter.usage.at(-1)).toMatchObject({
      tenantId: "tenant-1",
      appId: "app",
      connections: 1,
      messages: 1,
      webhookFailures: 0,
    });
    expect(reporter.usage.at(-1)?.hour).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/,
    );
    expect(reporter.channels.at(-1)).toMatchObject({
      tenantId: "tenant-1",
      appId: "app",
      name: "presence-room",
      type: "presence",
      subscriptions: 1,
    });
    expect(reporter.events.at(-1)).toMatchObject({
      tenantId: "tenant-1",
      appId: "app",
      type: "client-typing",
      channel: "presence-room",
      user: "user-1",
    });
    expect(reporter.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "connection.opened",
          channel: "connection",
          user: "gateway",
        }),
        expect.objectContaining({
          type: "channel.subscribed",
          channel: "presence-room",
        }),
      ]),
    );

    usage.connectionClosed(app, [
      { appId: "app", channel: "presence-room", socketId: "1.1" },
    ], "1.1");
    await usage.flush();

    expect(reporter.usage.at(-1)).toMatchObject({
      connections: 0,
      messages: 1,
    });
    expect(reporter.channels.at(-1)).toMatchObject({
      name: "presence-room",
      subscriptions: 0,
    });
    expect(reporter.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "channel.unsubscribed",
          channel: "presence-room",
        }),
        expect.objectContaining({
          type: "connection.closed",
          channel: "connection",
          user: "1.1",
          meta: "subscriptions:1",
        }),
      ]),
    );
  });
});
