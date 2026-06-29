import Redis from "ioredis";
import type { PresenceStore } from "../../application/ports/presence-store";
import type { PresenceUser, Subscription } from "../../domain/realtime-event";
import { parsePresenceUser, uniquePresenceUsers } from "../../domain/presence-user";

export interface RedisPresenceStoreOptions {
  url: string;
  prefix?: string;
  ttlSeconds?: number;
}

export class RedisPresenceStore implements PresenceStore {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly ttlSeconds: number;

  constructor(options: RedisPresenceStoreOptions) {
    this.redis = new Redis(options.url, { lazyConnect: true });
    this.prefix = options.prefix ?? "open-realtime";
    this.ttlSeconds = options.ttlSeconds ?? 180;
  }

  async add(subscription: Subscription): Promise<void> {
    if (!subscription.channelData) return;
    await this.redis.connect().catch(ignoreAlreadyConnected);
    const key = this.key(subscription.appId, subscription.channel);
    await this.redis.hset(key, subscription.socketId, subscription.channelData);
    await this.redis.expire(key, this.ttlSeconds);
  }

  async remove(subscription: Subscription): Promise<void> {
    await this.redis.connect().catch(ignoreAlreadyConnected);
    await this.redis.hdel(this.key(subscription.appId, subscription.channel), subscription.socketId);
  }

  async users(appId: string, channel: string): Promise<PresenceUser[]> {
    await this.redis.connect().catch(ignoreAlreadyConnected);
    const values = await this.redis.hvals(this.key(appId, channel));
    return uniquePresenceUsers(
      values
        .map(parsePresenceUser)
        .filter((user): user is PresenceUser => user !== null),
    );
  }

  private key(appId: string, channel: string): string {
    return `${this.prefix}:presence:${appId}:${channel}`;
  }
}

function ignoreAlreadyConnected(error: unknown): void {
  if (!(error instanceof Error) || !error.message.includes("already connecting")) {
    throw error;
  }
}
