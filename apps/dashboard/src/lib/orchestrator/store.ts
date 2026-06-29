import { SqliteOrchestratorStore } from "@/lib/orchestrator/sqlite-adapter";
import { getAsyncOrchestratorStore } from "@/lib/orchestrator/async-store";
import type { AsyncOrchestratorStore } from "@/lib/orchestrator/async-types";
import type { OrchestratorStore } from "@/lib/orchestrator/types";

declare global {
  var __openRealtimeOrchestratorStore: OrchestratorStore | undefined;
  var __openRealtimeAsyncOrchestratorStore: AsyncOrchestratorStore | undefined;
}

export function getOrchestratorStore(): OrchestratorStore {
  if (
    !globalThis.__openRealtimeOrchestratorStore ||
    typeof globalThis.__openRealtimeOrchestratorStore.createApiToken !== "function" ||
    typeof globalThis.__openRealtimeOrchestratorStore.reportUsage !== "function"
  ) {
    globalThis.__openRealtimeOrchestratorStore = new SqliteOrchestratorStore();
  }

  return globalThis.__openRealtimeOrchestratorStore;
}

export function getDashboardOrchestratorStore(): AsyncOrchestratorStore {
  if (!globalThis.__openRealtimeAsyncOrchestratorStore) {
    globalThis.__openRealtimeAsyncOrchestratorStore = getAsyncOrchestratorStore();
  }

  return globalThis.__openRealtimeAsyncOrchestratorStore;
}
