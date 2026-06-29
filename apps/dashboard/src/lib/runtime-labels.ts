import { orchestratorStoreDriver } from "@/lib/orchestrator/async-store";
import type { TenantMode } from "@/lib/orchestrator/types";

export function databaseLabel() {
  return orchestratorStoreDriver() === "postgres" ? "Postgres" : "SQLite";
}

export function adapterLabel() {
  return `${databaseLabel()} adapter`;
}

export function deploymentModeLabel() {
  return orchestratorStoreDriver() === "postgres" ? "Managed cloud" : "Self-hosted";
}

export function tenantModeLabel(mode: TenantMode) {
  return mode === "managed-cloud" ? "Managed cloud" : "Self-hosted";
}

export function controlPlaneDescription() {
  return orchestratorStoreDriver() === "postgres"
    ? "Hosted Postgres control plane for apps, credentials, webhooks, channels, and usage."
    : "Local SQLite control plane for apps, credentials, webhooks, channels, and usage.";
}
