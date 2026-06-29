import type WebSocket from "ws";
import type { RealtimeSocket } from "../../domain/realtime-socket";

export class WsRealtimeSocket implements RealtimeSocket {
  constructor(
    readonly id: string,
    private readonly socket: WebSocket,
  ) {}

  send(payload: string): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(payload);
    }
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }
}
