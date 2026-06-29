import type { Observability, ObservabilityEvent } from "../../application/ports/observability";

export class NoopObservability implements Observability {
  record(_event: ObservabilityEvent): void {}

  async flush(): Promise<void> {}
}
