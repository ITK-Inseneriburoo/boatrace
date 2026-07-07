import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Input } from "./core/Input";
import { Ocean } from "./world/Ocean";
import { SkySystem } from "./world/SkySystem";
import { WEATHERS, type WeatherPreset } from "./world/WeatherPresets";
import { PlayerBoat } from "./sim/PlayerBoat";
import { ChaseCamera } from "./camera/ChaseCamera";
import { TrackWorld } from "./world/TrackBuilder";
import { RaceLogic } from "./sim/RaceLogic";
import { resolveCollisions } from "./sim/Collisions";
import { RemoteBoat } from "./sim/RemoteBoat";
import { NetClient } from "./net/NetClient";
import { getTrack } from "@shared/tracks";
import { getWaveHeight } from "@shared/waves";
import { TICK_RATE } from "@shared/constants";
import type { TrackId } from "@shared/types";
import type { RoomStateMsg } from "@shared/protocol";
import { ScreenManager } from "./ui/ScreenManager";
import { MainMenu, type MenuChoices } from "./ui/screens/MainMenu";
import { ResultsScreen, type ResultRow } from "./ui/screens/Results";
import { LobbyBrowser } from "./ui/screens/LobbyBrowser";
import { RoomScreen } from "./ui/screens/RoomScreen";
import { Hud } from "./ui/screens/Hud";
import { t } from "./ui/i18n/et";
import type { MinimapDot } from "./ui/Minimap";

type GameState = "menu" | "lobby" | "room" | "countdown" | "racing" | "results";

/**
 * Mängu olekumasin.
 * Soolo: menu → countdown → racing → results.
 * Võrgus: menu → lobby → room → countdown (serveri kell) → racing → results → room.
 */
export class Game {
  readonly engine: Engine;
  readonly input = new Input();
  readonly sky: SkySystem;
  readonly ocean = new Ocean();

  private screens: ScreenManager;
  private menu = new MainMenu();
  private results = new ResultsScreen();
  private lobbyScreen = new LobbyBrowser();
  private roomScreen = new RoomScreen();
  private hud = new Hud();

  private track: TrackWorld;
  private boat: PlayerBoat | null = null;
  private chaseCam: ChaseCamera;
  private race: RaceLogic | null = null;
  private weather: WeatherPreset = WEATHERS.paike;
  private state: GameState = "menu";
  private mode: "solo" | "mp" = "solo";
  private countdownT = 0;
  private lastCountShown = -1;
  private finishTimer = 0;
  private choices: MenuChoices | null = null;
  private gateArrow: THREE.Mesh;

  // --- Võrgumäng ---
  private net: NetClient | null = null;
  private remoteBoats = new Map<string, RemoteBoat>();
  private room: RoomStateMsg | null = null;
  private mpStartsAt = 0;
  private mpStarted = false;
  private sendAccum = 0;
  private standings: string[] = [];
  private mpFinished = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = new Engine(canvas);
    this.sky = new SkySystem(this.engine);
    this.engine.scene.add(this.ocean.group);
    this.chaseCam = new ChaseCamera(this.engine.camera);

    this.track = new TrackWorld(getTrack("saarestik"));
    this.engine.scene.add(this.track.group);
    this.attachTrackDeps();

    this.gateArrow = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.2, 4),
      new THREE.MeshStandardMaterial({
        color: 0x2ec4b6,
        emissive: 0x2ec4b6,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.gateArrow.rotation.x = Math.PI;
    this.gateArrow.visible = false;
    this.engine.scene.add(this.gateArrow);

    this.applyWeather(WEATHERS.paike);

    // --- UI ---
    this.screens = new ScreenManager(uiRoot);
    this.screens.register(this.menu);
    this.screens.register(this.results);
    this.screens.register(this.lobbyScreen);
    this.screens.register(this.roomScreen);
    uiRoot.appendChild(this.hud.el);

    this.menu.onSolo = (c) => this.startSolo(c);
    this.menu.onMultiplayer = (c) => this.connectMultiplayer(c);
    this.menu.enableMultiplayer();
    this.results.onRestart = () => {
      if (this.choices) this.startSolo(this.choices);
    };
    this.results.onMenu = () => {
      if (this.mode === "mp" && this.room) this.backToRoom();
      else this.toMenu();
    };

    this.lobbyScreen.onCreate = (name) => this.net?.send({ type: "createRoom", roomName: name });
    this.lobbyScreen.onJoin = (roomId) => this.net?.send({ type: "joinRoom", roomId });
    this.lobbyScreen.onBack = () => {
      this.net?.disconnect();
      this.net = null;
      this.toMenu();
    };

    this.roomScreen.onReady = (ready) => this.net?.send({ type: "setReady", ready });
    this.roomScreen.onVehicle = (vehicle) => this.net?.send({ type: "selectVehicle", vehicle });
    this.roomScreen.onConfigure = (trackId, weatherId, laps) =>
      this.net?.send({ type: "configureRace", config: { trackId, weatherId, laps } });
    this.roomScreen.onStart = () => this.net?.send({ type: "startRace" });
    this.roomScreen.onLeave = () => {
      this.net?.send({ type: "leaveRoom" });
      this.clearRemoteBoats();
      this.room = null;
      this.state = "lobby";
      this.screens.show(this.lobbyScreen);
    };
    this.roomScreen.onChat = (text) => this.net?.send({ type: "chat", text });

    this.screens.show(this.menu);

    this.engine.onUpdate = (dt) => this.update(dt);
    this.engine.onRender = (alpha, frameDt) => this.render(alpha, frameDt);
    this.engine.start();
  }

  private attachTrackDeps(): void {
    this.ocean.setDepthTexture(
      this.track.terrain.depthTexture,
      -this.track.terrain.size / 2,
      -this.track.terrain.size / 2,
      this.track.terrain.size,
      this.track.terrain.size,
      1,
      0,
    );
    this.hud.attachTrack(this.track);
  }

  private applyWeather(w: WeatherPreset): void {
    this.weather = w;
    this.sky.applyPreset(w);
    this.ocean.applyWeather(w);
    if (this.sky.envCube) this.ocean.setEnvironment(this.sky.envCube, this.sky.sunDir);
  }

  setTrack(id: TrackId): void {
    if (this.track.def.id === id) return;
    this.engine.scene.remove(this.track.group);
    this.track = new TrackWorld(getTrack(id));
    this.engine.scene.add(this.track.group);
    this.attachTrackDeps();
  }

  // ------------------------------------------------------------------
  //  Soolo
  // ------------------------------------------------------------------

  private startSolo(c: MenuChoices): void {
    this.mode = "solo";
    this.choices = c;
    this.applyWeather(WEATHERS[c.weather]);
    this.spawnOwnBoat(c.vehicle, c.color, 0);

    this.race = new RaceLogic(this.track, c.laps);
    this.race.onLap = (_lap, ms) => this.hud.flashCenter(`${(ms / 1000).toFixed(1)}s`, 1.6);
    this.race.onFinish = () => {
      this.hud.flashCenter(t("hud.finis"), 2.5);
      this.finishTimer = 2.6;
    };

    this.screens.show(null);
    this.hud.show();
    this.gateArrow.visible = true;
    this.state = "countdown";
    this.countdownT = 3.999;
    this.lastCountShown = -1;
  }

  // ------------------------------------------------------------------
  //  Võrgumäng
  // ------------------------------------------------------------------

  private connectMultiplayer(c: MenuChoices): void {
    this.mode = "mp";
    this.choices = c;
    this.state = "lobby";
    this.screens.show(this.lobbyScreen);
    this.lobbyScreen.setConnectionStatus(false);

    if (this.net) {
      // Juba ühendatud (tagasi menüüst)
      this.lobbyScreen.setConnectionStatus(this.net.connected);
      this.net.send({ type: "listRooms" });
      return;
    }

    const net = new NetClient();
    this.net = net;
    net.onConnectionChange = (ok) => {
      this.lobbyScreen.setConnectionStatus(ok);
      if (ok && net.playerId) this.roomScreen.setMyId(net.playerId);
    };

    net.on("roomList", (m) => this.lobbyScreen.setRooms(m.rooms));
    net.on("roomState", (m) => {
      this.room = m.room;
      this.roomScreen.setRoom(m.room);
      if (this.state === "lobby") {
        this.state = "room";
        this.screens.show(this.roomScreen);
      }
      this.syncRemoteBoatRoster();
    });
    net.on("leftRoom", () => {
      this.room = null;
      this.clearRemoteBoats();
      if (this.state !== "menu") {
        this.state = "lobby";
        this.screens.show(this.lobbyScreen);
      }
    });
    net.on("chat", (m) => this.roomScreen.addChat(m.name, m.text));
    net.on("error", (m) => console.warn("Server:", m.code, m.message));

    net.on("countdown", (m) => this.startMpCountdown(m.startsAt, m.config, m.spawns));
    net.on("raceStarted", () => {
      this.mpStarted = true;
    });
    net.on("peer", (m) => {
      const rb = this.remoteBoats.get(m.id);
      if (rb) rb.push(m.st, m);
    });
    net.on("standings", (m) => (this.standings = m.order));
    net.on("lap", (m) => {
      if (m.playerId === net.playerId) {
        this.hud.flashCenter(`${(m.lapMs / 1000).toFixed(1)}s`, 1.6);
      }
    });
    net.on("finished", (m) => {
      if (m.playerId === net.playerId) {
        this.mpFinished = true;
        this.hud.flashCenter(`${t("hud.finis")} ${m.position}.`, 3);
      }
    });
    net.on("results", (m) => {
      const rows: ResultRow[] = m.results.map((r) => ({
        position: r.position,
        name: r.name,
        totalMs: r.totalMs,
        bestLapMs: r.bestLapMs ?? Infinity,
        me: r.playerId === net.playerId,
        dnf: r.dnf,
      }));
      this.results.setResults(rows);
      this.state = "results";
      this.hud.hide();
      this.gateArrow.visible = false;
      this.screens.show(this.results);
    });
    net.on("raceAborted", () => {
      if (this.state === "countdown" || this.state === "racing") this.backToRoom();
    });

    net.connect(c.name, c.color);
  }

  private startMpCountdown(
    startsAt: number,
    config: { trackId: TrackId; weatherId: string; laps: number },
    spawns: Record<string, number>,
  ): void {
    if (!this.net || !this.room) return;
    this.setTrack(config.trackId);
    this.applyWeather(WEATHERS[config.weatherId as keyof typeof WEATHERS]);

    const me = this.room.players.find((p) => p.id === this.net!.playerId);
    const mySlot = spawns[this.net.playerId ?? ""] ?? 0;
    this.spawnOwnBoat(me?.vehicle ?? "kiirpaat", me?.color ?? 0xe63946, mySlot);

    // Kaugpaadid stardikohtadele
    this.clearRemoteBoats();
    for (const p of this.room.players) {
      if (p.id === this.net.playerId) continue;
      const rb = new RemoteBoat(p.id, p.vehicle, p.color);
      const sp = this.track.spawnPoint(spawns[p.id] ?? 0);
      rb.mesh.position.set(sp.x, 0, sp.z);
      rb.mesh.rotation.y = sp.yaw;
      this.remoteBoats.set(p.id, rb);
      this.engine.scene.add(rb.mesh);
    }

    this.race = new RaceLogic(this.track, config.laps);
    this.race.onGate = (gate) => this.net?.send({ type: "gate", gate });

    this.mpStartsAt = startsAt;
    this.mpStarted = false;
    this.mpFinished = false;
    this.standings = [];
    this.sendAccum = 0;
    this.lastCountShown = -1;

    this.screens.show(null);
    this.hud.show();
    this.gateArrow.visible = true;
    this.state = "countdown";
  }

  private backToRoom(): void {
    this.state = "room";
    this.hud.hide();
    this.gateArrow.visible = false;
    this.clearRemoteBoats();
    if (this.room) this.roomScreen.setRoom(this.room);
    this.screens.show(this.roomScreen);
  }

  private syncRemoteBoatRoster(): void {
    // Sõidu ajal lahkunud mängijate paadid ära
    if (!this.room) return;
    const ids = new Set(this.room.players.map((p) => p.id));
    for (const [id, rb] of this.remoteBoats) {
      if (!ids.has(id)) {
        rb.dispose();
        this.remoteBoats.delete(id);
      }
    }
  }

  private clearRemoteBoats(): void {
    for (const rb of this.remoteBoats.values()) rb.dispose();
    this.remoteBoats.clear();
  }

  // ------------------------------------------------------------------
  //  Ühised
  // ------------------------------------------------------------------

  private spawnOwnBoat(vehicle: MenuChoices["vehicle"], color: number, slot: number): void {
    if (this.boat) this.engine.scene.remove(this.boat.mesh);
    this.boat = new PlayerBoat(vehicle, color);
    this.engine.scene.add(this.boat.mesh);
    const spawn = this.track.spawnPoint(slot);
    this.boat.physics.reset(spawn.x, spawn.z, spawn.yaw);
    this.boat.physics.surfaceOverride = this.track.surfaceOverride;
    this.boat.physics.onLanding = (impact) => {
      this.chaseCam.addTrauma(Math.min(impact * 0.06, 0.5));
    };
    this.chaseCam.snapTo(this.boat.physics);
  }

  private toMenu(): void {
    this.state = "menu";
    this.mode = "solo";
    this.hud.hide();
    this.gateArrow.visible = false;
    this.clearRemoteBoats();
    this.screens.show(this.menu);
  }

  private showSoloResults(): void {
    if (!this.race || !this.choices) return;
    this.state = "results";
    this.hud.hide();
    this.gateArrow.visible = false;
    this.results.setResults(
      [
        {
          position: 1,
          name: this.choices.name,
          totalMs: this.race.raceTime * 1000,
          bestLapMs: this.race.bestLap,
          me: true,
        },
      ],
      this.race.lapTimes,
    );
    this.screens.show(this.results);
  }

  private respawn(): void {
    if (!this.boat || !this.race) return;
    const g = this.race.lastGate;
    this.boat.physics.reset(g.center.x, g.center.z, Math.atan2(g.dirX, g.dirZ));
    this.boat.physics.pos.y = getWaveHeight(
      this.weather.waves,
      g.center.x,
      g.center.z,
      this.engine.simTime,
    );
    this.chaseCam.snapTo(this.boat.physics);
    if (this.mode === "mp") this.net?.send({ type: "respawn" });
  }

  private update(dt: number): void {
    this.sky.update(dt);

    if (this.state === "countdown" && this.boat) {
      let remaining: number;
      if (this.mode === "mp") {
        remaining = (this.mpStartsAt - (this.net?.serverNow() ?? 0)) / 1000;
      } else {
        this.countdownT -= dt;
        remaining = this.countdownT;
      }
      const n = Math.ceil(remaining);
      if (n !== this.lastCountShown && n >= 1 && n <= 3) {
        this.lastCountShown = n;
        this.hud.flashCenter(String(n), 0.9);
      }
      this.boat.update({ throttle: 0, steer: 0, slide: false }, this.weather.waves, this.engine.simTime, dt);
      const canStart = this.mode === "mp" ? remaining <= 0 || this.mpStarted : remaining <= 0;
      if (canStart) {
        this.state = "racing";
        this.race!.start();
        this.hud.flashCenter(t("hud.start"), 1);
      }
      return;
    }

    if (this.state === "racing" && this.boat && this.race) {
      if (this.input.respawnPressed) this.respawn();
      this.boat.update(
        { throttle: this.input.throttle, steer: this.input.steer, slide: this.input.slide },
        this.weather.waves,
        this.engine.simTime,
        dt,
      );
      const hit = resolveCollisions(this.boat.physics, this.track.colliders, this.track.terrain);
      if (hit && !hit.soft) this.chaseCam.addTrauma(Math.min(hit.impact * 0.05, 0.6));

      // Paat-paadi vastu: pehme ringtõrjumine ainult oma paadile
      for (const rb of this.remoteBoats.values()) {
        const dx = this.boat.physics.pos.x - rb.x;
        const dz = this.boat.physics.pos.z - rb.z;
        const d = Math.hypot(dx, dz);
        const minD = this.boat.physics.stats.hullRadius + 1.6;
        if (d > 0.01 && d < minD) {
          this.boat.physics.applyImpulse(dx / d, dz / d, (minD - d) * 0.5, 0.2);
        }
      }

      this.race.update(
        this.boat.physics.pos.x,
        this.boat.physics.pos.z,
        this.boat.physics.vel.x,
        this.boat.physics.vel.z,
        dt,
      );

      // Olekusaatmine 15Hz
      if (this.mode === "mp" && this.net) {
        this.sendAccum += dt;
        if (this.sendAccum >= 1 / TICK_RATE) {
          this.sendAccum %= 1 / TICK_RATE;
          const p = this.boat.physics;
          const r2 = (x: number): number => Math.round(x * 100) / 100;
          const r3 = (x: number): number => Math.round(x * 1000) / 1000;
          this.net.send({
            type: "state",
            p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)],
            r: [r3(p.yaw), r3(p.pitch), r3(p.roll)],
            v: [r2(p.vel.x), r2(p.vel.z)],
            s: r2(p.speed),
          });
        }
      }

      // Soolo finiš
      if (this.mode === "solo" && this.race.finished) {
        this.finishTimer -= dt;
        if (this.finishTimer <= 0) this.showSoloResults();
      }
    }
  }

  private render(alpha: number, frameDt: number): void {
    const time = this.engine.simTime;

    if (this.state === "menu" || this.state === "lobby" || this.state === "room") {
      const a = time * 0.04;
      this.engine.camera.position.set(Math.sin(a) * 300, 55, Math.cos(a) * 300);
      this.engine.camera.lookAt(0, 6, 0);
      this.engine.camera.fov = 55;
      this.engine.camera.updateProjectionMatrix();
      this.sky.followTarget(this.engine.camera.position);
    } else if (this.boat) {
      this.boat.applyVisual(alpha);
      this.chaseCam.update(this.boat.physics, this.weather.waves, time, frameDt);
      this.sky.followTarget(this.boat.physics.pos);
    }

    // Kaugpaadid
    if (this.net && this.remoteBoats.size) {
      const now = this.net.serverNow();
      for (const rb of this.remoteBoats.values()) rb.update(now);
    }

    const nextGate =
      this.race && (this.state === "racing" || this.state === "countdown") ? this.race.nextGate : -1;
    this.track.update(this.weather.waves, time, nextGate);

    if (this.gateArrow.visible && this.race) {
      const g = this.track.gates[this.race.nextGate % this.track.gates.length];
      this.gateArrow.position.set(
        g.center.x,
        getWaveHeight(this.weather.waves, g.center.x, g.center.z, time) + 4.4 + Math.sin(time * 2.4) * 0.35,
        g.center.z,
      );
      this.gateArrow.rotation.y = time * 1.5;
    }

    this.ocean.update(time, this.engine.camera.position);

    if (this.state === "racing" || this.state === "countdown") {
      this.updateHud(frameDt);
    }

    this.input.endFrame();
  }

  private updateHud(frameDt: number): void {
    const b = this.boat!;
    const r = this.race!;
    this.hud.setSpeed(b.physics.speed * 3.6);
    this.hud.setLap(
      Math.min(r.lap, r.totalLaps),
      r.totalLaps,
      r.nextGate === 0 ? this.track.gates.length : r.nextGate,
      this.track.gates.length,
    );
    this.hud.setTimes(
      r.raceTime * 1000,
      r.lapTimes.length ? r.lapTimes[r.lapTimes.length - 1] : null,
      r.bestLap,
    );

    if (this.mode === "mp" && this.net) {
      const idx = this.standings.indexOf(this.net.playerId ?? "");
      const total = this.room?.players.length ?? 1;
      this.hud.setPosition(idx >= 0 ? idx + 1 : null, total);
    } else {
      this.hud.setPosition(null, 1);
    }
    this.hud.setWrongWay(r.wrongWay);

    const dots: MinimapDot[] = [
      { x: b.physics.pos.x, z: b.physics.pos.z, yaw: b.physics.yaw, color: "#2ec4b6", me: true },
    ];
    for (const rb of this.remoteBoats.values()) {
      dots.push({ x: rb.x, z: rb.z, yaw: rb.yaw, color: "#ffb3ba", me: false });
    }
    this.hud.update(frameDt, dots);
  }
}
