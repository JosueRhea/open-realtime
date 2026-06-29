import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { RuntimeConfig } from "./config";
import { createContainer } from "./create-container";

export async function createNodeServer(config: RuntimeConfig) {
  const { app, websocketController } = await createContainer(config);
  const server = createServer(getRequestListener(app.fetch));
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const match = /^\/app\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      websocketController.accept(ws, decodeURIComponent(match[1]));
    });
  });

  return server;
}
