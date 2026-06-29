export interface PusherWebhookEvent {
  name: "channel_occupied" | "channel_vacated" | "member_added" | "member_removed";
  channel: string;
  app_id?: string;
  user_id?: string;
}

export interface WebhookDispatcher {
  dispatch(events: PusherWebhookEvent[]): Promise<void>;
}
