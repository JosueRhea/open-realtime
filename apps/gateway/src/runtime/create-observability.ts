import type { Observability } from "../application/ports/observability";
import { AxiomObservability } from "../infrastructure/observability/axiom-observability";
import { ConsoleObservability } from "../infrastructure/observability/console-observability";
import { NoopObservability } from "../infrastructure/observability/noop-observability";
import type { ObservabilityConfig } from "./config";

export function createObservability(config: ObservabilityConfig): Observability {
  if (config.driver === "console") {
    return new ConsoleObservability({
      service: config.service,
      environment: config.environment,
      instanceId: config.instanceId,
    });
  }

  if (config.driver === "axiom") {
    if (!config.axiomToken) throw new Error("Missing required env var: AXIOM_TOKEN");
    if (!config.axiomDataset) throw new Error("Missing required env var: AXIOM_DATASET");

    return new AxiomObservability({
      token: config.axiomToken,
      dataset: config.axiomDataset,
      apiUrl: config.axiomApiUrl,
      service: config.service,
      environment: config.environment,
      instanceId: config.instanceId,
      batchSize: config.batchSize,
      flushIntervalMs: config.flushIntervalMs,
      maxQueueSize: config.maxQueueSize,
    });
  }

  return new NoopObservability();
}
