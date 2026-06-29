import type { TenantApp } from "../application/ports/app-registry";
import type { PusherCredentials } from "../application/ports/pusher-authenticator";

export interface RuntimeConfig {
  pusher?: PusherCredentials;
  apps: TenantApp[];
  appRegistry: AppRegistryConfig;
  redisUrl?: string;
  redisPrefix: string;
  observability: ObservabilityConfig;
  webhookUrls: string[];
  webhookEvents: Set<string>;
  webhookBatchSize: number;
  webhookFlushIntervalMs: number;
  orchestrator: OrchestratorConfig;
  port: number;
}

export interface AppRegistryConfig {
  source: "static" | "orchestrator";
  refreshIntervalMs: number;
}

export interface OrchestratorConfig {
  url?: string;
  token?: string;
  tenantId: string;
  flushIntervalMs: number;
}

export interface ObservabilityConfig {
  driver: "none" | "console" | "axiom";
  service: string;
  environment?: string;
  instanceId: string;
  axiomToken?: string;
  axiomDataset?: string;
  axiomApiUrl?: string;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const appRegistry = appRegistryConfig(env);
  const apps = loadApps(env);
  const pusher = apps[0];

  return {
    pusher,
    apps,
    appRegistry,
    redisUrl: env.REDIS_URL,
    redisPrefix: env.REDIS_PREFIX ?? "open-realtime",
    observability: {
      driver: observabilityDriver(env),
      service: env.OBSERVABILITY_SERVICE ?? "open-realtime",
      environment: env.OBSERVABILITY_ENVIRONMENT ?? env.VERCEL_ENV ?? env.NODE_ENV,
      instanceId:
        env.OBSERVABILITY_INSTANCE_ID ??
        env.VERCEL_REGION ??
        `local-${Math.random().toString(36).slice(2)}`,
      axiomToken: env.AXIOM_TOKEN,
      axiomDataset: env.AXIOM_DATASET,
      axiomApiUrl: env.AXIOM_API_URL,
      batchSize: number(env.OBSERVABILITY_BATCH_SIZE, 100),
      flushIntervalMs: number(env.OBSERVABILITY_FLUSH_INTERVAL_MS, 1000),
      maxQueueSize: number(env.OBSERVABILITY_MAX_QUEUE_SIZE, 10000),
    },
    webhookUrls: list(env.PUSHER_WEBHOOK_URLS),
    webhookEvents: new Set(list(env.PUSHER_WEBHOOK_EVENTS)),
    webhookBatchSize: number(env.PUSHER_WEBHOOK_BATCH_SIZE, 100),
    webhookFlushIntervalMs: number(env.PUSHER_WEBHOOK_FLUSH_INTERVAL_MS, 1000),
    orchestrator: {
      url: env.ORCHESTRATOR_URL,
      token: env.ORCHESTRATOR_TOKEN,
      tenantId: env.ORCHESTRATOR_TENANT_ID ?? env.PUSHER_TENANT_ID ?? "self-hosted",
      flushIntervalMs: number(env.ORCHESTRATOR_FLUSH_INTERVAL_MS, 5000),
    },
    port: Number(env.PORT ?? 3001),
  };
}

function loadApps(env: NodeJS.ProcessEnv): TenantApp[] {
  if (appRegistryConfig(env).source === "orchestrator") {
    return [];
  }

  if (env.PUSHER_APPS_JSON) {
    const parsed = JSON.parse(env.PUSHER_APPS_JSON) as TenantApp[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("PUSHER_APPS_JSON must be a non-empty app array");
    }
    return parsed.map((app) => validateApp(app, tenantId(env)));
  }

  return [
    validateApp({
      appId: required(env, "PUSHER_APP_ID"),
      key: required(env, "PUSHER_KEY"),
      secret: required(env, "PUSHER_SECRET"),
      cluster: env.PUSHER_CLUSTER ?? "mt1",
      tenantId: tenantId(env),
      name: env.PUSHER_APP_NAME,
    }, tenantId(env)),
  ];
}

function appRegistryConfig(env: NodeJS.ProcessEnv): AppRegistryConfig {
  const useOrchestratorRegistry =
    env.ORCHESTRATOR_APP_REGISTRY === "true" ||
    env.ORCHESTRATOR_APP_REGISTRY === "1";
  return {
    source: useOrchestratorRegistry ? "orchestrator" : "static",
    refreshIntervalMs: number(env.ORCHESTRATOR_APP_REGISTRY_REFRESH_MS, 10000),
  };
}

function validateApp(app: TenantApp, fallbackTenantId: string): TenantApp {
  if (!app.appId || !app.key || !app.secret) {
    throw new Error("Each tenant app requires appId, key, and secret");
  }
  return {
    ...app,
    tenantId: app.tenantId ?? fallbackTenantId,
    cluster: app.cluster ?? "mt1",
  };
}

function tenantId(env: NodeJS.ProcessEnv): string {
  return env.ORCHESTRATOR_TENANT_ID ?? env.PUSHER_TENANT_ID ?? "self-hosted";
}

function observabilityDriver(env: NodeJS.ProcessEnv): ObservabilityConfig["driver"] {
  const configured = env.OBSERVABILITY_DRIVER;
  if (configured === "none" || configured === "console" || configured === "axiom") return configured;
  if (env.AXIOM_TOKEN && env.AXIOM_DATASET) return "axiom";
  return "none";
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function list(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function number(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
