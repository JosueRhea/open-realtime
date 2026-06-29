export interface RealtimeSocket {
  id: string;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
}
