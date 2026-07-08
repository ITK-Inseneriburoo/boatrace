import type { WebSocket } from "ws";
import type { C2S, ErrorCode } from "../../shared/src/protocol";
import { VEHICLES } from "../../shared/src/vehicles";
import { validateC2S } from "./validation";
import type { Player } from "./Player";
import { SessionManager } from "./SessionManager";
import { RoomManager } from "./RoomManager";

/**
 * Ühe socketi elutsükkel: hello → sõnumite marsruutimine → disconnect.
 * Rate-limitid ja teleportide kontroll elavad siin.
 */
export class ConnectionHandler {
  readonly sessions = new SessionManager();
  readonly rooms = new RoomManager();

  handleConnection(socket: WebSocket): void {
    let player: Player | null = null;
    let garbage = 0;

    socket.on("message", (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(data));
      } catch {
        if (++garbage > 5) socket.terminate();
        return;
      }
      const msg = validateC2S(raw);
      if (!msg) {
        if (++garbage > 20) socket.terminate();
        return;
      }

      if (!player) {
        if (msg.type !== "hello") return;
        player = this.handleHello(msg, socket);
        return;
      }

      // Üldine rate-limit: >100 sõnumit/s → välja
      const now = Date.now();
      const mw = player.msgWindow;
      if (now - mw.start > 1000) {
        mw.start = now;
        mw.count = 0;
      }
      if (++mw.count > 100) {
        this.sendError(player, "RATE_LIMITED", "Liiga palju sõnumeid");
        socket.terminate();
        return;
      }

      this.route(player, msg);
    });

    socket.on("close", () => {
      // Ignoreeri vana socketi close'i, kui mängija on vahepeal juba uue
      // socketiga reconnectinud (tryReconnect termineerib vana socketi — see
      // close ei tohi värsket ühendust maha võtta).
      if (player && player.socket === socket) this.handleDisconnect(player);
    });
    socket.on("error", () => socket.terminate());
  }

  private handleHello(
    msg: Extract<C2S, { type: "hello" }>,
    socket: WebSocket,
  ): Player {
    let player: Player | null = null;
    if (msg.sessionToken) {
      player = this.sessions.tryReconnect(msg.sessionToken, socket);
    }
    if (player) {
      // Taastatud sessioon: saada täisolek
      player.send({
        type: "welcome",
        playerId: player.id,
        sessionToken: player.token,
        serverTime: Date.now(),
      });
      if (player.room) {
        player.send({ type: "roomState", room: player.room.stateMsg() });
        if (player.room.phase === "countdown" || player.room.phase === "racing") {
          const spawns: Record<string, number> = {};
          player.room.racers.forEach((p) => (spawns[p.id] = p.spawnSlot));
          player.send({
            type: "countdown",
            startsAt: player.room.raceStartsAt,
            config: player.room.config,
            spawns,
          });
          if (player.room.phase === "racing") {
            player.send({ type: "raceStarted", startTime: player.room.raceStartTime });
          }
        }
        player.room.sync();
      } else {
        player.send(this.rooms.listMsg());
      }
    } else {
      player = this.sessions.create(msg.name, msg.color, socket);
      this.rooms.allPlayers.add(player);
      player.send({
        type: "welcome",
        playerId: player.id,
        sessionToken: player.token,
        serverTime: Date.now(),
      });
      player.send(this.rooms.listMsg());
    }
    return player;
  }

  private handleDisconnect(player: Player): void {
    this.sessions.markDisconnected(player);
    if (player.room) {
      if (player.room.phase === "racing" || player.room.phase === "countdown") {
        // Armuaeg: jääb tuppa, teised näevad "ühendus katkes"
        player.room.sync();
        setTimeout(() => {
          if (!player.connected && player.room) {
            this.rooms.leaveRoom(player);
            this.rooms.allPlayers.delete(player);
          }
        }, 61_000);
      } else {
        this.rooms.leaveRoom(player);
        this.rooms.allPlayers.delete(player);
      }
    } else {
      this.rooms.allPlayers.delete(player);
    }
  }

  private sendError(p: Player, code: ErrorCode, message: string): void {
    p.send({ type: "error", code, message });
  }

  private route(p: Player, msg: C2S): void {
    switch (msg.type) {
      case "ping":
        p.send({ type: "pong", t: msg.t, serverTime: Date.now() });
        break;

      case "listRooms":
        p.send(this.rooms.listMsg());
        break;

      case "createRoom": {
        if (p.room) this.rooms.leaveRoom(p);
        const room = this.rooms.create(msg.roomName, p);
        if (!room) this.sendError(p, "TOO_MANY_ROOMS", "Tube on liiga palju");
        else this.rooms.broadcastRoomList();
        break;
      }

      case "joinRoom": {
        if (p.room) this.rooms.leaveRoom(p);
        const room = this.rooms.get(msg.roomId);
        if (!room) {
          this.sendError(p, "ROOM_NOT_FOUND", "Tuba ei leitud");
          break;
        }
        const res = room.addPlayer(p, msg.spectator === true);
        if (res === "full") this.sendError(p, "ROOM_FULL", "Tuba on täis");
        else if (res === "racing") this.sendError(p, "ROOM_RACING", "Võistlus juba käib");
        else if (room.phase === "countdown" || room.phase === "racing") {
          // Vaatleja liitus keset sõitu — saada sõiduseis
          const spawns: Record<string, number> = {};
          room.racers.forEach((rp) => (spawns[rp.id] = rp.spawnSlot));
          p.send({
            type: "countdown",
            startsAt: room.raceStartsAt,
            config: room.config,
            spawns,
          });
          if (room.phase === "racing") {
            p.send({ type: "raceStarted", startTime: room.raceStartTime });
          }
        }
        break;
      }

      case "leaveRoom":
        this.rooms.leaveRoom(p);
        break;

      case "chat": {
        if (!p.room) break;
        // 5 sõnumit / 5 s
        const now = Date.now();
        p.chatTimes = p.chatTimes.filter((t) => now - t < 5000);
        if (p.chatTimes.length >= 5) break;
        p.chatTimes.push(now);
        p.room.broadcast({ type: "chat", playerId: p.id, name: p.name, text: msg.text });
        break;
      }

      case "selectVehicle":
        if (p.room?.phase === "lobby") {
          p.vehicle = msg.vehicle;
          p.room.sync();
        }
        break;

      case "setColor":
        p.color = msg.color;
        p.room?.sync();
        break;

      case "setReady":
        if (p.room?.phase === "lobby") {
          p.ready = msg.ready;
          p.room.sync();
        }
        break;

      case "setSpectator":
        if (p.room?.phase === "lobby") {
          p.spectator = msg.on;
          p.ready = false;
          p.room.sync();
        }
        break;

      case "configureRace":
        if (p.room && p.id === p.room.hostId && p.room.phase === "lobby") {
          p.room.config = msg.config;
          p.room.sync();
        }
        break;

      case "startRace": {
        if (!p.room) break;
        const res = p.room.startRace(p);
        if (res === "not_host") this.sendError(p, "NOT_HOST", "Ainult host saab startida");
        else if (res === "not_ready") this.sendError(p, "NOT_ALL_READY", "Kõik pole valmis");
        break;
      }

      case "state": {
        const room = p.room;
        if (!room || room.phase !== "racing" || p.dnf) break;

        // Rate-limit: >30 olekut/s → drop
        const now = Date.now();
        const sw = p.stateWindow;
        if (now - sw.start > 1000) {
          sw.start = now;
          sw.count = 0;
        }
        if (++sw.count > 30) break;

        // Teleportide kontroll: nihe > maxSpeed × 1.5 × dt → drop
        if (p.lastStatePos) {
          const dt = Math.max((now - p.lastStateAt) / 1000, 0.01);
          const dx = msg.p[0] - p.lastStatePos[0];
          const dz = msg.p[2] - p.lastStatePos[2];
          const maxDist = VEHICLES[p.vehicle].topSpeed * 1.8 * dt + 2;
          if (Math.hypot(dx, dz) > maxDist) break;
        }
        p.lastStatePos = [msg.p[0], msg.p[1], msg.p[2]];
        p.lastStateAt = now;

        room.broadcast(
          { type: "peer", id: p.id, st: now, p: msg.p, r: msg.r, v: msg.v, s: msg.s },
          p,
        );
        break;
      }

      case "respawn":
        // Respawn nullib teleportide kontrolli referentsi
        p.lastStatePos = null;
        break;

      case "gate":
        p.room?.handleGate(p, msg.gate);
        break;
    }
  }
}
