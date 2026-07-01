export interface UsageSnapshot {
  tenantId: string;
  appId: string;
  hour: string;
  connections: number;
  connectionDelta?: number;
  messages: number;
  webhookFailures: number;
}

export interface EventSnapshot {
  tenantId: string;
  appId: string;
  type: string;
  channel: string;
  user: string;
  status: "sent" | "delivered" | "failed";
  meta: string;
  time?: string;
}

export interface ChannelSnapshot {
  tenantId: string;
  appId: string;
  name: string;
  type: "public" | "private" | "presence";
  subscriptions: number;
  messagesPerSecond: number;
  lastActivity?: string;
}

export interface OrchestratorReporter {
  reportUsage(snapshot: UsageSnapshot): Promise<void>;
  reportEvent(snapshot: EventSnapshot): Promise<void>;
  reportChannel(snapshot: ChannelSnapshot): Promise<void>;
  flush(): Promise<void>;
}
