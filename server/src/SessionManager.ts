import type { WebSocket } from "ws";
import { RECONNECT_GRACE_MS } from "../../shared/src/constants";
import { Player } from "./Player";

/**
 * Sessioonid: token → Player. Reconnect armuaja (60s) jooksul
 * seob uue socketi sama Player-objekti külge — võistlusprogress säilib.
 */
export class SessionManager {
  private byToken = new Map<string, Player>();

  constructor() {
    setInterval(() => this.sweep(), 15_000);
  }

  create(name: string, color: number, socket: WebSocket): Player {
    const p = new Player(name, color);
    p.socket = socket;
    this.byToken.set(p.token, p);
    return p;
  }

  /** Proovi reconnecti; tagastab taastatud Playeri või null */
  tryReconnect(token: string, socket: WebSocket): Player | null {
    const p = this.byToken.get(token);
    if (!p) return null;
    if (p.disconnectedAt !== null && Date.now() - p.disconnectedAt > RECONNECT_GRACE_MS) {
      return null;
    }
    // Vana socket kinni (kui topelt-ühendus)
    if (p.socket && p.socket !== socket) {
      try { p.socket.terminate(); } catch { /* juba kinni */ }
    }
    p.socket = socket;
    p.disconnectedAt = null;
    return p;
  }

  markDisconnected(p: Player): void {
    p.socket = null;
    p.disconnectedAt = Date.now();
  }

  remove(p: Player): void {
    this.byToken.delete(p.token);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [token, p] of this.byToken) {
      if (p.disconnectedAt !== null && now - p.disconnectedAt > RECONNECT_GRACE_MS) {
        this.byToken.delete(token);
      }
    }
  }
}
