import type { PresenceUser } from "./realtime-event";

export function parsePresenceUser(channelData: string): PresenceUser | null {
  try {
    const parsed = JSON.parse(channelData) as { user_id?: string; user_info?: unknown };
    if (!parsed.user_id) return null;
    return { id: String(parsed.user_id), info: parsed.user_info };
  } catch {
    return null;
  }
}

export function uniquePresenceUsers(users: PresenceUser[]): PresenceUser[] {
  return [...new Map(users.map((user) => [user.id, user])).values()];
}
