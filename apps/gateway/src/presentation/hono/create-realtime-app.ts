import { Hono } from "hono";
import { cors } from "hono/cors";
import type { PusherRestController } from "../pusher/rest-controller";

export function createRealtimeApp(restController: PusherRestController): Hono {
  const app = new Hono();

  app.use(cors());

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "open-realtime",
    }),
  );

  app.post("/apps/:appId/events", async (c) => {
    const request = await snapshot(c.req.raw);
    return restController.trigger(c.req.param("appId"), request);
  });

  app.post("/apps/:appId/batch_events", async (c) => {
    const request = await snapshot(c.req.raw);
    return restController.triggerBatch(c.req.param("appId"), request);
  });

  app.get("/apps/:appId/channels/:channel/users", async (c) => {
    const request = await snapshot(c.req.raw);
    return restController.users(c.req.param("appId"), c.req.param("channel"), request);
  });

  app.post("/apps/:appId/users/:userId/terminate_connections", async (c) => {
    const request = await snapshot(c.req.raw);
    return restController.terminateUserConnections(
      c.req.param("appId"),
      c.req.param("userId"),
      request,
    );
  });

  return app;
}

async function snapshot(request: Request) {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body: await request.text(),
  };
}
