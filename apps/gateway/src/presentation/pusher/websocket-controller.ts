import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import type { PusherProtocolService } from "../../application/pusher-protocol-service";
import { WsRealtimeSocket } from "../../infrastructure/socket/ws-realtime-socket";

export class PusherWebSocketController {
  constructor(private readonly protocol: PusherProtocolService) {}

  accept(socket: WebSocket, appKey: string): void {
    const realtimeSocket = new WsRealtimeSocket(createSocketId(), socket);
    void this.protocol.connect(realtimeSocket, appKey);

    socket.on("message", (data) => {
      void this.protocol.receive(realtimeSocket.id, data.toString());
    });

    socket.on("close", () => {
      void this.protocol.disconnect(realtimeSocket.id);
    });

    socket.on("error", () => {
      void this.protocol.disconnect(realtimeSocket.id);
    });
  }
}

function createSocketId(): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${Date.now()}.${suffix}`;
}
