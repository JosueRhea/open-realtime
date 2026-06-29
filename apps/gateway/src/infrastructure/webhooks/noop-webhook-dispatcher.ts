import type {
  PusherWebhookEvent,
  WebhookDispatcher,
} from "../../application/ports/webhook-dispatcher";

export class NoopWebhookDispatcher implements WebhookDispatcher {
  async dispatch(_events: PusherWebhookEvent[]): Promise<void> {}
}
