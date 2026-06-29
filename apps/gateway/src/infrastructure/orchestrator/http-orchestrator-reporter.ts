import type { Observability } from "../../application/ports/observability";
import type {
  ChannelSnapshot,
  EventSnapshot,
  OrchestratorReporter,
  UsageSnapshot,
} from "../../application/ports/orchestrator-reporter";

export interface HttpOrchestratorReporterOptions {
  baseUrl: string;
  token: string;
  fetchFn?: typeof fetch;
  observability?: Observability;
}

export class HttpOrchestratorReporter implements OrchestratorReporter {
  constructor(private readonly options: HttpOrchestratorReporterOptions) {}

  async reportUsage(snapshot: UsageSnapshot): Promise<void> {
    await this.post("/api/ingest/usage", snapshot);
  }

  async reportEvent(snapshot: EventSnapshot): Promise<void> {
    await this.post("/api/ingest/events", snapshot);
  }

  async reportChannel(snapshot: ChannelSnapshot): Promise<void> {
    await this.post("/api/ingest/channels", snapshot);
  }

  async flush(): Promise<void> {}

  private async post(path: string, body: unknown): Promise<void> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const response = await fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = `Orchestrator ingest failed: ${path} HTTP ${response.status}`;
      this.options.observability?.record({
        name: "orchestrator.report_failed",
        level: "warn",
        fields: {
          path,
          status: response.status,
        },
      });
      throw new Error(message);
    }
  }

  private get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, "");
  }
}
