import type { Observability, ObservabilityEvent } from "../../application/ports/observability";

export interface ConsoleObservabilityOptions {
  service: string;
  environment?: string;
  instanceId: string;
}

export class ConsoleObservability implements Observability {
  constructor(private readonly options: ConsoleObservabilityOptions) {}

  record(event: ObservabilityEvent): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: this.options.service,
        environment: this.options.environment,
        instance_id: this.options.instanceId,
        level: event.level ?? "info",
        event: event.name,
        ...(event.fields ?? {}),
      }),
    );
  }

  async flush(): Promise<void> {}
}
