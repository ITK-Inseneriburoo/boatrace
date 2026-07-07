import type { C2S, S2C } from "@shared/protocol";

type S2CType = S2C["type"];
type HandlerFor<T extends S2CType> = (msg: Extract<S2C, { type: T }>) => void;

const TOKEN_KEY = "boatrace.session";

/**
 * WebSocket-ühendus serveriga: automaatne reconnect sessionTokeniga,
 * kellasünk (serverNow) ja tüübikindel sõnumidispetšer.
 */
export class NetClient {
  playerId: string | null = null;
  connected = false;
  /** serveri kella nihe lokaalse suhtes (ms) */
  private clockOffset = 0;
  private ws: WebSocket | null = null;
  private handlers = new Map<S2CType, Set<(msg: never) => void>>();
  private name = "";
  private color = 0;
  private intentional = false;
  private pingTimer: number | null = null;
  private reconnectDelay = 500;

  onConnectionChange: (connected: boolean) => void = () => {};

  connect(name: string, color: number): void {
    this.name = name;
    this.color = color;
    this.intentional = false;
    this.open();
  }

  private open(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);

    this.ws.onopen = () => {
      this.reconnectDelay = 500;
      const token = sessionStorage.getItem(TOKEN_KEY) ?? undefined;
      this.sendRaw({ type: "hello", name: this.name, color: this.color, sessionToken: token });
      this.pingTimer = window.setInterval(() => {
        this.sendRaw({ type: "ping", t: Date.now() });
      }, 5000);
    };

    this.ws.onmessage = (ev) => {
      let msg: S2C;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === "welcome") {
        this.playerId = msg.playerId;
        sessionStorage.setItem(TOKEN_KEY, msg.sessionToken);
        this.clockOffset = msg.serverTime - Date.now();
        this.connected = true;
        this.onConnectionChange(true);
      } else if (msg.type === "pong") {
        const rtt = Date.now() - msg.t;
        const est = msg.serverTime + rtt / 2 - Date.now();
        // Silu, et üksik aeglane ping ei raputaks kella
        this.clockOffset = this.clockOffset * 0.8 + est * 0.2;
      }
      const set = this.handlers.get(msg.type);
      if (set) for (const fn of set) (fn as (m: S2C) => void)(msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.onConnectionChange(false);
      if (this.pingTimer !== null) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (!this.intentional) {
        setTimeout(() => this.open(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
      }
    };
    this.ws.onerror = () => this.ws?.close();
  }

  disconnect(): void {
    this.intentional = true;
    this.ws?.close();
  }

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  send(msg: C2S): void {
    this.sendRaw(msg);
  }

  private sendRaw(msg: C2S): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on<T extends S2CType>(type: T, fn: HandlerFor<T>): void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as (msg: never) => void);
  }
}
