export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

export interface ObservabilityEvent {
  name: string;
  level?: ObservabilityLevel;
  fields?: Record<string, unknown>;
}

export interface Observability {
  record(event: ObservabilityEvent): void;
  flush(): Promise<void>;
}
