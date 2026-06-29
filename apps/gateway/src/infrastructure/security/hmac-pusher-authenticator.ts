import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  PusherAuthenticator,
  PusherCredentials,
  RestAuthRequest,
} from "../../application/ports/pusher-authenticator";

export class HmacPusherAuthenticator implements PusherAuthenticator {
  constructor(readonly credentials: PusherCredentials) {}

  signChannel(params: {
    socketId: string;
    channel: string;
    channelData?: string;
  }): string {
    const source = params.channelData
      ? `${params.socketId}:${params.channel}:${params.channelData}`
      : `${params.socketId}:${params.channel}`;
    return `${this.credentials.key}:${hmacSha256(this.credentials.secret, source)}`;
  }

  signUser(params: { socketId: string; userData: string }): string {
    return `${this.credentials.key}:${hmacSha256(
      this.credentials.secret,
      `${params.socketId}::user::${params.userData}`,
    )}`;
  }

  validateChannelAuth(params: {
    auth: string;
    socketId: string;
    channel: string;
    channelData?: string;
  }): boolean {
    return safeEquals(params.auth, this.signChannel(params));
  }

  validateUserAuth(params: {
    auth: string;
    socketId: string;
    userData: string;
  }): boolean {
    return safeEquals(params.auth, this.signUser(params));
  }

  validateRestRequest(request: RestAuthRequest): boolean {
    if (request.query.auth_key !== this.credentials.key) return false;
    if (request.body && request.query.body_md5 !== md5(request.body)) return false;
    if (!request.query.auth_signature) return false;

    const queryToSign = Object.entries(request.query)
      .filter(([key]) => key !== "auth_signature")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");

    const expected = hmacSha256(
      this.credentials.secret,
      `${request.method.toUpperCase()}\n${request.path}\n${queryToSign}`,
    );

    return safeEquals(request.query.auth_signature, expected);
  }
}

function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
