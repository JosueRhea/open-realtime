import type { Observability, ObservabilityEvent } from "../../application/ports/observability";

export interface AxiomObservabilityOptions {
  token: string;
  dataset: string;
  apiUrl?: string;
  service: string;
  environment?: string;
  instanceId: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  fetchFn?: typeof fetch;
}

export class AxiomObservability implements Observability {
  private readonly pending: Record<string, unknown>[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(private readonly options: AxiomObservabilityOptions) {}

  record(event: ObservabilityEvent): void {
    if (this.pending.length >= this.maxQueueSize) {
      this.pending.shift();
    }

    this.pending.push(this.toAxiomEvent(event));

    if (this.pending.length >= this.batchSize || this.flushIntervalMs <= 0) {
      void this.flush();
      return;
    }

    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.pending.length === 0) return this.flushPromise;

    const batch = this.pending.splice(0, this.batchSize);
    this.flushPromise = this.flushPromise.catch(() => {}).then(() => this.deliver(batch));
    await this.flushPromise.catch((error) => {
      console.error("Axiom observability delivery failed", error);
    });

    if (this.pending.length > 0) {
      if (this.pending.length >= this.batchSize || this.flushIntervalMs <= 0) {
        await this.flush();
      } else {
        this.scheduleFlush();
      }
    }
  }

  private async deliver(batch: Record<string, unknown>[]): Promise<void> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const response = await fetchFn(this.ingestUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      this.requeue(batch);
      throw new Error(`Axiom ingest failed: HTTP ${response.status}`);
    }
  }

  private requeue(batch: Record<string, unknown>[]): void {
    const available = Math.max(0, this.maxQueueSize - this.pending.length);
    if (available === 0) return;
    this.pending.unshift(...batch.slice(-available));
    this.scheduleFlush(this.nextRetryDelayMs);
  }

  private toAxiomEvent(event: ObservabilityEvent): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      service: this.options.service,
      environment: this.options.environment,
      instance_id: this.options.instanceId,
      level: event.level ?? "info",
      event: event.name,
      ...sanitizeFields(event.fields ?? {}),
    };
  }

  private scheduleFlush(delayMs = this.flushIntervalMs): void {
    if (this.flushTimer || delayMs <= 0) return;
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, delayMs);
    this.flushTimer.unref?.();
  }

  private get ingestUrl(): string {
    const base = (this.options.apiUrl ?? "https://api.axiom.co").replace(/\/$/, "");
    const dataset = encodeURIComponent(this.options.dataset);
    return `${base}/v1/datasets/${dataset}/ingest?timestamp-field=timestamp`;
  }

  private get batchSize(): number {
    return Math.max(1, this.options.batchSize ?? 100);
  }

  private get flushIntervalMs(): number {
    return this.options.flushIntervalMs ?? 1000;
  }

  private get maxQueueSize(): number {
    return Math.max(this.batchSize, this.options.maxQueueSize ?? 10000);
  }

  private get nextRetryDelayMs(): number {
    return Math.max(1000, this.flushIntervalMs);
  }
}

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && typeof value !== "function")
      .map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return sanitizeFields(value as Record<string, unknown>);
  }

  return value;
}
