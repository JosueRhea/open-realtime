import type {
  ChannelSnapshot,
  EventSnapshot,
  OrchestratorReporter,
  UsageSnapshot,
} from "../../application/ports/orchestrator-reporter";

export class NoopOrchestratorReporter implements OrchestratorReporter {
  async reportUsage(_snapshot: UsageSnapshot): Promise<void> {}
  async reportEvent(_snapshot: EventSnapshot): Promise<void> {}
  async reportChannel(_snapshot: ChannelSnapshot): Promise<void> {}
  async flush(): Promise<void> {}
}
