import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HmacPusherAuthenticator } from "./hmac-pusher-authenticator";

describe("HmacPusherAuthenticator", () => {
  const auth = new HmacPusherAuthenticator({
    appId: "app",
    key: "key",
    secret: "secret",
  });

  it("validates private channel auth signatures", () => {
    const signature = createHmac("sha256", "secret")
      .update("123.456:private-chats-209")
      .digest("hex");

    expect(
      auth.validateChannelAuth({
        auth: `key:${signature}`,
        socketId: "123.456",
        channel: "private-chats-209",
      }),
    ).toBe(true);
  });

  it("validates presence channel auth signatures with channel_data", () => {
    const channelData = JSON.stringify({ user_id: "42", user_info: { name: "Ada" } });
    const signature = createHmac("sha256", "secret")
      .update(`123.456:presence-business-209:${channelData}`)
      .digest("hex");

    expect(
      auth.validateChannelAuth({
        auth: `key:${signature}`,
        socketId: "123.456",
        channel: "presence-business-209",
        channelData,
      }),
    ).toBe(true);
  });

  it("validates user authentication signatures", () => {
    const userData = JSON.stringify({ id: "42", name: "Ada" });
    const signature = createHmac("sha256", "secret")
      .update(`123.456::user::${userData}`)
      .digest("hex");

    expect(
      auth.validateUserAuth({
        auth: `key:${signature}`,
        socketId: "123.456",
        userData,
      }),
    ).toBe(true);
  });

  it("validates Pusher REST signatures", () => {
    const body = JSON.stringify({ channel: "orders", event: "order-update", data: { order: 1 } });
    const path = "/apps/app/events";
    const query = {
      auth_key: "key",
      auth_timestamp: "1780000000",
      auth_version: "1.0",
      body_md5: createHash("md5").update(body).digest("hex"),
    };
    const queryString = Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");

    expect(
      auth.validateRestRequest({
        method: "POST",
        path,
        query: {
          ...query,
          auth_signature: createHmac("sha256", "secret")
            .update(`POST\n${path}\n${queryString}`)
            .digest("hex"),
        },
        body,
      }),
    ).toBe(true);
  });

  it("validates Pusher REST GET signatures without body_md5", () => {
    const path = "/apps/app/channels/presence-business-209/users";
    const query = {
      auth_key: "key",
      auth_timestamp: "1780000000",
      auth_version: "1.0",
    };
    const queryString = Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");

    expect(
      auth.validateRestRequest({
        method: "GET",
        path,
        query: {
          ...query,
          auth_signature: createHmac("sha256", "secret")
            .update(`GET\n${path}\n${queryString}`)
            .digest("hex"),
        },
        body: "",
      }),
    ).toBe(true);
  });
});
