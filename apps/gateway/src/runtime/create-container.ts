import { PusherProtocolService } from "../application/pusher-protocol-service";
import { credentialsFor } from "../application/ports/app-registry";
import { UsageReporter } from "../application/usage-reporter";
import { HttpOrchestratorAppRegistry } from "../infrastructure/apps/http-orchestrator-app-registry";
import { StaticAppRegistry } from "../infrastructure/apps/static-app-registry";
import { InMemoryEventBus } from "../infrastructure/event-bus/in-memory-event-bus";
import { RedisEventBus } from "../infrastructure/event-bus/redis-event-bus";
import { InMemoryPresenceStore } from "../infrastructure/presence/in-memory-presence-store";
import { RedisPresenceStore } from "../infrastructure/presence/redis-presence-store";
import { InMemorySocketRegistry } from "../infrastructure/registry/in-memory-socket-registry";
import { HttpOrchestratorReporter } from "../infrastructure/orchestrator/http-orchestrator-reporter";
import { NoopOrchestratorReporter } from "../infrastructure/orchestrator/noop-orchestrator-reporter";
import { HmacPusherAuthenticator } from "../infrastructure/security/hmac-pusher-authenticator";
import { HttpWebhookDispatcher } from "../infrastructure/webhooks/http-webhook-dispatcher";
import { NoopWebhookDispatcher } from "../infrastructure/webhooks/noop-webhook-dispatcher";
import { RedisWebhookDispatcher } from "../infrastructure/webhooks/redis-webhook-dispatcher";
import { ExampleController } from "../presentation/example/example-controller";
import { createRealtimeApp } from "../presentation/hono/create-realtime-app";
import { PusherRestController } from "../presentation/pusher/rest-controller";
import { PusherWebSocketController } from "../presentation/pusher/websocket-controller";
import type { RuntimeConfig } from "./config";
import { createObservability } from "./create-observability";

export async function createContainer(config: RuntimeConfig) {
  const observability = createObservability(config.observability);
  const appRegistry =
    config.appRegistry.source === "orchestrator"
      ? createOrchestratorAppRegistry(config)
      : new StaticAppRegistry(config.apps);
  const defaultApp = config.pusher ?? (await appRegistry.defaultApp().catch(() => undefined));
  const defaultCredentials = defaultApp ? credentialsFor(defaultApp) : undefined;
  const authenticatorFactory = (credentials: Parameters<typeof credentialsFor>[0]) =>
    new HmacPusherAuthenticator(credentials);
  const registry = new InMemorySocketRegistry();
  const bus = config.redisUrl
    ? new RedisEventBus({
        url: config.redisUrl,
        channel: `${config.redisPrefix}:events`,
      })
    : new InMemoryEventBus();
  const presence = config.redisUrl
    ? new RedisPresenceStore({
        url: config.redisUrl,
        prefix: config.redisPrefix,
      })
    : new InMemoryPresenceStore();
  const webhooks =
    config.webhookUrls.length > 0
      ? !defaultCredentials
        ? (() => {
            throw new Error(
              "At least one app is required before enabling PUSHER_WEBHOOK_URLS",
            );
          })()
        : config.redisUrl
        ? new RedisWebhookDispatcher({
            credentials: defaultCredentials,
            urls: config.webhookUrls,
            redisUrl: config.redisUrl,
            prefix: config.redisPrefix,
            enabledEvents: config.webhookEvents,
            batchSize: config.webhookBatchSize,
            flushIntervalMs: config.webhookFlushIntervalMs,
            observability,
          })
        : new HttpWebhookDispatcher({
            credentials: defaultCredentials,
            urls: config.webhookUrls,
            enabledEvents: config.webhookEvents,
            batchSize: config.webhookBatchSize,
            flushIntervalMs: config.webhookFlushIntervalMs,
            observability,
          })
      : new NoopWebhookDispatcher();
  const orchestratorReporter =
    config.orchestrator.url && config.orchestrator.token
      ? new HttpOrchestratorReporter({
          baseUrl: config.orchestrator.url,
          token: config.orchestrator.token,
          observability,
        })
      : new NoopOrchestratorReporter();
  const usageReporter = new UsageReporter(orchestratorReporter, {
    flushIntervalMs: config.orchestrator.flushIntervalMs,
  });

  const protocol = new PusherProtocolService(
    registry,
    bus,
    presence,
    appRegistry,
    authenticatorFactory,
    webhooks,
    observability,
    usageReporter,
  );
  await protocol.start();

  const restController = new PusherRestController(
    protocol,
    appRegistry,
    authenticatorFactory,
    observability,
  );
  const websocketController = new PusherWebSocketController(protocol);
  const app = createRealtimeApp(restController);
  if (defaultCredentials) {
    new ExampleController(
      authenticatorFactory(defaultCredentials),
      defaultCredentials,
    ).register(app);
  }

  return {
    app,
    websocketController,
    protocol,
  };
}

function createOrchestratorAppRegistry(config: RuntimeConfig) {
  if (!config.orchestrator.url || !config.orchestrator.token) {
    throw new Error(
      "ORCHESTRATOR_URL and ORCHESTRATOR_TOKEN are required when ORCHESTRATOR_APP_REGISTRY is enabled",
    );
  }

  return new HttpOrchestratorAppRegistry({
    baseUrl: config.orchestrator.url,
    token: config.orchestrator.token,
    refreshIntervalMs: config.appRegistry.refreshIntervalMs,
  });
}
