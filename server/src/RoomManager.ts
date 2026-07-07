import type { S2C } from "../../shared/src/protocol";
import { MAX_ROOMS } from "../../shared/src/constants";
import { Room } from "./Room";
import type { Player } from "./Player";

/**
 * Tubade register + roomList'i levitamine mängijatele, kes pole toas.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private emptySince = new Map<string, number>();
  /** kõik ühendatud mängijad (lobby-sirvijatele roomList'i saatmiseks) */
  allPlayers = new Set<Player>();

  constructor() {
    setInterval(() => this.sweep(), 30_000);
  }

  create(name: string, host: Player): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const room = new Room(name, host);
    room.onChanged = () => this.broadcastRoomList();
    this.rooms.set(room.id, room);
    room.addPlayer(host);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  listMsg(): S2C {
    return {
      type: "roomList",
      rooms: [...this.rooms.values()].filter((r) => !r.empty).map((r) => r.summary()),
    };
  }

  /** roomList kõigile, kes parasjagu üheski toas pole */
  broadcastRoomList(): void {
    const msg = this.listMsg();
    for (const p of this.allPlayers) {
      if (!p.room && p.connected) p.send(msg);
    }
  }

  leaveRoom(p: Player): void {
    const room = p.room;
    if (!room) return;
    room.removePlayer(p);
    p.send({ type: "leftRoom" });
    p.send(this.listMsg());
    if (room.empty) {
      room.stopTimers();
      this.rooms.delete(room.id);
      this.broadcastRoomList();
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      const anyone = room.players.some((p) => p.connected || p.disconnectedAt !== null);
      if (room.empty || !anyone) {
        const since = this.emptySince.get(id) ?? now;
        this.emptySince.set(id, since);
        if (now - since > 60_000) {
          room.stopTimers();
          this.rooms.delete(id);
          this.emptySince.delete(id);
          this.broadcastRoomList();
        }
      } else {
        this.emptySince.delete(id);
      }
    }
  }
}
