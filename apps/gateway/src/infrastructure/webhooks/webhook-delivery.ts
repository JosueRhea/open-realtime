import { createHmac, randomUUID } from "node:crypto";
import type { Observability } from "../../application/ports/observability";
import type { PusherCredentials } from "../../application/ports/pusher-authenticator";
import type { PusherWebhookEvent } from "../../application/ports/webhook-dispatcher";

export interface WebhookDeliveryOptions {
  credentials: PusherCredentials;
  urls: string[];
  fetchFn?: typeof fetch;
  observability?: Observability;
}

export async function deliverWebhookBatch(
  events: PusherWebhookEvent[],
  options: WebhookDeliveryOptions,
): Promise<void> {
  if (events.length === 0 || options.urls.length === 0) return;

  const body = JSON.stringify({
    time_ms: Date.now(),
    webhook_id: randomUUID(),
    events,
  });
  const payload = JSON.parse(body) as { webhook_id: string; events: PusherWebhookEvent[] };

  const signature = createHmac("sha256", options.credentials.secret)
    .update(body)
    .digest("hex");
  const fetchFn = options.fetchFn ?? fetch;

  const results = await Promise.allSettled(
    options.urls.map(async (url) => {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pusher-key": options.credentials.key,
          "x-pusher-signature": signature,
        },
        body,
      });

      if (!response.ok) {
        options.observability?.record({
          name: "webhook.delivery_failed",
          level: "warn",
          fields: {
            url,
            status: response.status,
            webhook_id: payload.webhook_id,
            event_count: payload.events.length,
          },
        });
        throw new Error(`Webhook delivery failed for ${url}: HTTP ${response.status}`);
      }

      options.observability?.record({
        name: "webhook.delivered",
        fields: {
          url,
          webhook_id: payload.webhook_id,
          event_count: payload.events.length,
        },
      });
    }),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => (failure as PromiseRejectedResult).reason),
      "One or more webhook deliveries failed",
    );
  }
}
