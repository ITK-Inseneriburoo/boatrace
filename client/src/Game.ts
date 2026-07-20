import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Input } from "./core/Input";
import { TouchControls } from "./core/TouchControls";
import {
  applyGraphicsCompatibility,
  detectGraphicsCompatibility,
  type GraphicsCompatibility,
} from "./core/GraphicsCompatibility";
import { Ocean } from "./world/Ocean";
import { SkySystem } from "./world/SkySystem";
import { WEATHERS, type WeatherPreset } from "./world/WeatherPresets";
import { PlayerBoat } from "./sim/PlayerBoat";
import { ChaseCamera } from "./camera/ChaseCamera";
import { SpectatorCamera } from "./camera/SpectatorCamera";
import { TrackWorld } from "./world/TrackBuilder";
import { RaceLogic } from "./sim/RaceLogic";
import { resolveCollisions } from "./sim/Collisions";
import { RemoteBoat } from "./sim/RemoteBoat";
import { GhostBoat, GhostRecorder, loadGhostData } from "./sim/Ghost";
import { NetClient } from "./net/NetClient";
import { getTrack } from "@shared/tracks";
import { getWaveHeight } from "@shared/waves";
import { TICK_RATE } from "@shared/constants";
import type { TrackId } from "@shared/types";
import type { ErrorCode, RoomStateMsg } from "@shared/protocol";
import { ScreenManager } from "./ui/ScreenManager";
import { MainMenu, type GraphicsLevel, type MenuChoices } from "./ui/screens/MainMenu";
import { ResultsScreen, type ResultRow, type ResultsMeta } from "./ui/screens/Results";
import { LobbyBrowser } from "./ui/screens/LobbyBrowser";
import { RoomScreen } from "./ui/screens/RoomScreen";
import { Hud, type SpectatorRow } from "./ui/screens/Hud";
import { t, type TKey } from "./ui/i18n/et";
import type { MinimapDot } from "./ui/Minimap";
import { AudioEngine } from "./audio/AudioEngine";
import { EngineSound } from "./audio/EngineSound";
import { Sfx } from "./audio/Sfx";
import { Effects } from "./fx/Effects";
import { WakeSystem } from "./world/WakeSystem";
import { Rain } from "./world/Rain";
import { VEHICLES } from "@shared/vehicles";
import { clamp } from "@shared/math";
import { QUALITY_TIERS, lowerLevel, setCurrentTier, type QualityTier } from "./core/Quality";
import { setTextureQuality } from "./core/Textures";
import { setCurrentEnvIntensity, applyEnvIntensityTo } from "./world/env";
import { PlanarReflection } from "./world/PlanarReflection";
import { preloadVehicleModels } from "./boats/BoatFactory";
import { preloadWorldAssets } from "./core/Assets";
import { waitForAssetLoads } from "./core/AssetLoading";

type GameState = "menu" | "lobby" | "room" | "countdown" | "racing" | "results";

interface WaterShot {
  ownerId: string;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  life: number;
  mesh: THREE.Mesh;
}

/**
 * Mängu olekumasin.
 * Soolo: menu → countdown → racing → results.
 * Võrgus: menu → lobby → room → countdown (serveri kell) → racing → results → room.
 */
export class Game {
  readonly engine: Engine;
  readonly input = new Input();
  readonly sky: SkySystem;
  private readonly graphicsCompatibility: GraphicsCompatibility;
  readonly ocean = new Ocean();

  private screens: ScreenManager;
  private menu = new MainMenu();
  private results = new ResultsScreen();
  private lobbyScreen = new LobbyBrowser();
  private roomScreen = new RoomScreen();
  private hud = new Hud();
  private touch = new TouchControls(this.input);

  private track: TrackWorld;
  private boat: PlayerBoat | null = null;
  private chaseCam: ChaseCamera;
  private race: RaceLogic | null = null;
  private weather: WeatherPreset = WEATHERS.paike;
  private state: GameState = "menu";
  private mode: "solo" | "mp" = "solo";
  private countdownT = 0;
  private lastCountShown = -1;
  private touchStartPending = false;
  private finishTimer = 0;
  private paused = false;
  private backgrounded = document.hidden;
  private engineReady = false;
  private choices: MenuChoices | null = null;
  private gateArrow: THREE.Mesh;
  private boostCooldown = new Map<number, number>();
  private activeRamp: number | null = null;
  private shotReadyAt = 0;
  private shots: WaterShot[] = [];
  private shotGeo = new THREE.SphereGeometry(0.7, 12, 8);
  private shotMat = new THREE.MeshStandardMaterial({
    color: 0xb7f3ff,
    emissive: 0x49d7ff,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    transparent: true,
    opacity: 0.82,
  });
  private soloHadRecord = false;

  // --- Kvaliteediastmed ---
  private userGraphics: GraphicsLevel = "korge";
  private effectiveGraphics: GraphicsLevel = "korge";
  private lowFpsTime = 0;
  private planar: PlanarReflection | null = null;
  private readonly vehicleAssetsReady: Promise<void>;
  private worldAssetsReady: Promise<void> = Promise.resolve();

  // --- Efektid ---
  private effects = new Effects();
  private wake: WakeSystem | null = null;
  private rain = new Rain(3000);

  // --- Heli ---
  private audio = new AudioEngine();
  private sfx = new Sfx(this.audio);
  private ownEngine: EngineSound | null = null;
  private remoteEngines = new Map<string, EngineSound>();
  private remoteDist = new Map<string, number>();

  // --- Võrgumäng ---
  private net: NetClient | null = null;
  private remoteBoats = new Map<string, RemoteBoat>();
  private room: RoomStateMsg | null = null;
  private mpStartsAt = 0;
  private mpStarted = false;
  private sendAccum = 0;
  private standings: string[] = [];
  private mpFinished = false;
  private pendingJoinRoomId: string | null = null;
  /** Vaatleja-režiim: ei võistle, vaba kaamera */
  private spectating = false;
  private spectatorCam: SpectatorCamera;

  // --- Kummituspaat (soolo parim ring) ---
  private ghostRecorder: GhostRecorder | null = null;
  private ghostBoat: GhostBoat | null = null;
  private ghostBestMs: number | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = new Engine(canvas);
    this.graphicsCompatibility = detectGraphicsCompatibility(this.engine.renderer);
    // Sõidukimudelid sooja: menüü ajal parsitakse GLB-d ja tekstuurid GPU-le.
    // Maailma varad soojendab applyGraphics (vajab õiget tekstuuriresolutsiooni)
    this.vehicleAssetsReady = preloadVehicleModels(this.engine.renderer);
    this.sky = new SkySystem(this.engine);
    this.engine.scene.add(this.ocean.group);
    this.chaseCam = new ChaseCamera(this.engine.camera);
    this.spectatorCam = new SpectatorCamera(this.engine.camera);

    // Taustamaailm = menüüs viimati valitud rada
    this.track = new TrackWorld(getTrack(this.menu.currentTrack()));
    this.engine.scene.add(this.track.group);
    this.engine.scene.add(this.effects.group);
    this.engine.scene.add(this.rain.points);
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

    this.applyWeather(WEATHERS[this.menu.currentWeather()] ?? WEATHERS.paike);

    // AudioContext vajab kasutaja žesti
    window.addEventListener("pointerdown", () => this.audio.ensure());
    window.addEventListener("keydown", () => this.audio.ensure());
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.suspendForBackground);
    window.addEventListener("pageshow", this.resumeFromBackground);
    if (this.backgrounded) this.audio.suspendForBackground();
    this.sky.onLightning = (delay) => this.sfx.thunder(delay);

    // --- UI ---
    this.screens = new ScreenManager(uiRoot);
    this.screens.register(this.menu);
    this.screens.register(this.results);
    this.screens.register(this.lobbyScreen);
    this.screens.register(this.roomScreen);
    uiRoot.appendChild(this.hud.el);
    this.hud.el.appendChild(this.touch.el);

    this.menu.onSolo = (c) => {
      if (this.touchStartPending) return;
      this.touchStartPending = true;
      void this.touch
        .prepareTilt()
        .then(() => this.startSolo(c))
        .finally(() => (this.touchStartPending = false));
    };
    this.menu.onMultiplayer = (c) => {
      void this.touch.prepareTilt();
      this.connectMultiplayer(c);
    };
    this.menu.onGraphics = (level) => this.applyGraphics(level);
    this.menu.onTrack = (id) => {
      if (this.state === "menu") this.setTrack(id);
    };
    this.menu.onWeather = (id) => {
      if (this.state === "menu") this.applyWeather(WEATHERS[id]);
    };
    this.menu.enableMultiplayer();
    this.applyGraphics(this.menu.currentGraphics());
    this.results.onRestart = () => {
      if (this.choices) this.startSolo(this.choices);
    };
    this.results.onVariant = () => this.startSoloWeatherVariant();
    this.results.onMenu = () => {
      if (this.mode === "mp" && this.room) this.backToRoom();
      else this.toMenu();
    };

    this.lobbyScreen.onCreate = (name) => this.net?.send({ type: "createRoom", roomName: name });
    this.lobbyScreen.onJoin = (roomId) => this.net?.send({ type: "joinRoom", roomId });
    this.lobbyScreen.onSpectate = (roomId) =>
      this.net?.send({ type: "joinRoom", roomId, spectator: true });
    this.lobbyScreen.onBack = () => {
      this.net?.disconnect();
      this.net = null;
      this.toMenu();
    };

    this.roomScreen.onReady = (ready) => this.net?.send({ type: "setReady", ready });
    this.roomScreen.onSpectator = (on) => this.net?.send({ type: "setSpectator", on });
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

    this.hud.onResume = () => this.setPaused(false);
    this.hud.onQuit = () => this.quitRace();

    this.screens.show(this.menu);

    this.engine.onUpdate = (dt) => {
      this.update(dt);
      // Ära kustuta hetkesisendit renderkaadris: 90/120 Hz ekraanil ei ole
      // igal renderkaadril 60 Hz simulatsioonisammu ja vajutus läheks kaduma.
      this.input.endUpdate();
    };
    this.engine.onRender = (alpha, frameDt) => this.render(alpha, frameDt);
  }

  /**
   * Lõpeta külmkäivitus laadimiskatte taga: oota välised varad, tõsta
   * tekstuurid GPU-le, kompileeri stseeni shaderid ja soojenda post-pipeline.
   */
  async start(): Promise<void> {
    await Promise.all([
      this.vehicleAssetsReady,
      this.worldAssetsReady,
      this.ocean.ready,
      this.sky.whenReady(),
    ]);
    await waitForAssetLoads();

    // Assetide paigaldavad jätkud saavad stseeni enne kompileerimist lõpuni muuta.
    // Ka brauser saab laadimiskatte ühe korra ära joonistada.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await this.engine.renderer.compileAsync(this.engine.scene, this.engine.camera);
    this.engine.pipeline.render(0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    this.engineReady = true;
    if (!this.backgrounded && !document.hidden) this.engine.start();
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.suspendForBackground();
    else this.resumeFromBackground();
  };

  private suspendForBackground = (): void => {
    this.backgrounded = true;
    if (this.engineReady) this.engine.stop();
    this.audio.suspendForBackground();
  };

  private resumeFromBackground = (): void => {
    if (document.hidden) return;
    this.backgrounded = false;
    this.audio.resumeFromBackground();
    if (this.engineReady) this.engine.start();
  };

  private attachTrackDeps(): void {
    const size = this.track.terrain.size;
    this.ocean.setDepthTexture(
      this.track.terrain.depthTexture,
      -size / 2,
      -size / 2,
      size,
      size,
      1,
      0,
    );
    this.hud.attachTrack(this.track);
    // Kiiluvee-RT katab kogu raja ala (v-telg peegeldatud — vt WakeSystem)
    this.wake = new WakeSystem(size);
    this.ocean.setWakeTexture(this.wake.texture, -size / 2, size / 2, size, -size);
  }

  private applyWeather(w: WeatherPreset): void {
    this.weather = w;
    this.sky.applyPreset(w);
    this.ocean.applyWeather(w);
    if (this.sky.envCube) this.ocean.setEnvironment(this.sky.envCube, this.sky.sunDir);
    this.audio.setAmbient(w.id);
    this.rain.setEnabled(w.rainCount > 0);
    this.track.setWeather(w.id);
    // IBL-peegelduste tugevus ilma järgi; hiljem spawnitavad paadid
    // võtavad sama väärtuse buildBoatModel'is
    setCurrentEnvIntensity(w.envMapIntensity);
    applyEnvIntensityTo(this.engine.scene);
  }

  private applyGraphics(level: GraphicsLevel, userChoice = true): void {
    if (userChoice) this.userGraphics = level;
    this.effectiveGraphics = level;
    this.lowFpsTime = 0;
    const selectedTier = QUALITY_TIERS[level];
    // Draiveri/WebGL-i workaround'id lahendatakse keskselt; menüüs valitud aste
    // jääb alles ja siin rakendub ainult tuvastatud seadme minimaalne piirang.
    const tier: QualityTier = applyGraphicsCompatibility(
      selectedTier,
      this.graphicsCompatibility,
    );
    setCurrentTier(tier);
    this.engine.setPixelRatioCap(tier.pixelRatio);
    this.engine.pipeline.configure(tier.pipeline);
    this.sky.applyShadowTier(tier.shadows, tier.shadowRes);
    setTextureQuality(
      tier.texRes,
      tier.anisotropy,
      this.engine.renderer.capabilities.getMaxAnisotropy(),
    );
    // Soojenda maailma varad valitud resolutsioonis (cache'itud, idempotentne)
    this.worldAssetsReady = preloadWorldAssets(this.engine.renderer);
    this.track?.terrain.setDetailNormals(tier.terrainNormals);
    this.track?.setSceneryDetail(tier.particleScale);
    this.ocean.applyTier({ foamTex: tier.ocean.foamTex, shoreAlpha: tier.ocean.shoreAlpha });

    // Planar-peegeldus (korge/ultra)
    const res = tier.ocean.planarRes;
    if (res > 0) {
      if (!this.planar) this.planar = new PlanarReflection(res);
      else this.planar.setSize(res);
      this.ocean.setPlanar(this.planar.target.texture, this.planar.textureMatrix);
    } else if (this.planar) {
      this.planar.dispose();
      this.planar = null;
      this.ocean.setPlanar(null);
    }
  }

  /**
   * Automaatne kvaliteedilangetus: kui FPS on pikalt madal, astu aste alla.
   * Kunagi üles tagasi ega kasutaja salvestatud valikut üle ei kirjuta.
   */
  private autoDowngrade(frameDt: number): void {
    if (this.engine.avgFps < 45) {
      this.lowFpsTime += frameDt;
      if (this.lowFpsTime > 5) {
        const lower = lowerLevel(this.effectiveGraphics);
        if (lower) {
          this.applyGraphics(lower, false);
          this.hud.flashCenter(t("hud.grafikaLangetatud"), 2.5);
        } else {
          this.lowFpsTime = 0;
        }
      }
    } else {
      this.lowFpsTime = 0;
    }
  }

  setTrack(id: TrackId): void {
    if (this.track.def.id === id) return;
    this.engine.scene.remove(this.track.group);
    this.track = new TrackWorld(getTrack(id));
    this.track.setWeather(this.weather.id);
    this.track.setSceneryDetail(QUALITY_TIERS[this.effectiveGraphics].particleScale);
    this.engine.scene.add(this.track.group);
    this.boostCooldown.clear();
    this.attachTrackDeps();
  }

  // ------------------------------------------------------------------
  //  Soolo
  // ------------------------------------------------------------------

  private startSolo(c: MenuChoices): void {
    this.mode = "solo";
    this.choices = c;
    this.setTrack(c.track);
    this.applyWeather(WEATHERS[c.weather]);
    this.spawnOwnBoat(c.vehicle, c.color, 0);
    this.soloHadRecord = false;

    // Kummituspaat: eelmine parim ring sõidab kaasa
    this.ghostBoat?.dispose();
    this.ghostBoat = null;
    const ghostData = loadGhostData(c.track, c.weather, c.vehicle);
    this.ghostBestMs = ghostData?.lapMs ?? null;
    this.hud.setGhostDelta(null, this.ghostBestMs);
    if (ghostData) {
      this.ghostBoat = new GhostBoat(ghostData);
      this.engine.scene.add(this.ghostBoat.mesh);
    }
    this.ghostRecorder = new GhostRecorder(c.track, c.weather, c.vehicle);

    this.race = new RaceLogic(this.track, c.laps);
    this.race.onGate = () => this.sfx.chime();
    this.race.onMissGate = () => this.hud.flashCenter(t("hud.varavMoodas"), 0.8);
    this.race.onLap = (_lap, ms) => {
      const previousBest = this.ghostBestMs;
      const record = this.ghostRecorder?.finishLap(ms) ?? false;
      if (record) {
        this.ghostBestMs = ms;
        this.soloHadRecord = true;
      }
      const delta =
        previousBest !== null && isFinite(previousBest) ? ` (${ms - previousBest <= 0 ? "−" : "+"}${(Math.abs(ms - previousBest) / 1000).toFixed(2)}s)` : "";
      this.hud.flashCenter(
        record
          ? `${(ms / 1000).toFixed(1)}s · ${t("hud.rekord")}${delta}`
          : `${(ms / 1000).toFixed(1)}s${delta}`,
        record ? 2.2 : 1.6,
      );
    };
    this.race.onFinish = () => {
      this.hud.flashCenter(t("hud.finis"), 2.5);
      this.finishTimer = 2.6;
    };

    this.screens.show(null);
    this.hud.show();
    this.touch.show(c.vehicle);
    this.gateArrow.visible = true;
    this.boostCooldown.clear();
    this.clearShots();
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
    this.pendingJoinRoomId = this.roomIdFromHash();
    this.state = "lobby";
    this.screens.show(this.lobbyScreen);
    this.lobbyScreen.setConnectionStatus(false);

    if (this.net) {
      // Juba ühendatud (tagasi menüüst)
      this.lobbyScreen.setConnectionStatus(this.net.connected);
      if (this.pendingJoinRoomId) this.joinPendingRoom();
      else this.net.send({ type: "listRooms" });
      return;
    }

    const net = new NetClient();
    this.net = net;
    net.onConnectionChange = (ok) => {
      this.lobbyScreen.setConnectionStatus(ok);
      if (ok && net.playerId) this.roomScreen.setMyId(net.playerId);
      if (ok && this.pendingJoinRoomId) this.joinPendingRoom();
    };

    net.on("roomList", (m) => this.lobbyScreen.setRooms(m.rooms));
    net.on("roomState", (m) => {
      this.room = m.room;
      this.roomScreen.setRoom(m.room);
      if (this.state === "lobby") {
        this.state = "room";
        this.screens.show(this.roomScreen);
      }
      // Toas näidatakse taustal valitud rada ja ilma
      if (this.state === "room") {
        this.setTrack(m.room.config.trackId);
        const w = WEATHERS[m.room.config.weatherId];
        if (w && w !== this.weather) this.applyWeather(w);
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
    net.on("error", (m) => this.showNetError(m.code, m.message));

    net.on("countdown", (m) => this.startMpCountdown(m.startsAt, m.config, m.spawns));
    net.on("raceStarted", () => {
      this.mpStarted = true;
    });
    net.on("peer", (m) => {
      const rb = this.remoteBoats.get(m.id);
      if (rb) rb.push(m.st, m);
    });
    net.on("shot", (m) => this.spawnWaterShot(m.playerId, m.x, m.z, m.yaw));
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
      this.boat?.freezeVisual();
      this.state = "results";
      this.hud.hide();
      this.touch.hide();
      this.gateArrow.visible = false;
      this.clearShots();
      this.stopRaceAudio();
      this.screens.show(this.results);
    });
    net.on("raceAborted", () => {
      if (this.state === "countdown" || this.state === "racing") this.backToRoom();
    });

    net.connect(c.name, c.color);
  }

  private roomIdFromHash(): string | null {
    const match = location.hash.match(/(?:^|[#&])room=([a-z0-9-]+)/i);
    return match?.[1]?.slice(0, 12) ?? null;
  }

  private joinPendingRoom(): void {
    if (!this.net || !this.pendingJoinRoomId) return;
    const roomId = this.pendingJoinRoomId;
    this.pendingJoinRoomId = null;
    this.net.send({ type: "joinRoom", roomId });
  }

  private showNetError(code: ErrorCode, fallback: string): void {
    const msg = t(`viga.${code}` as TKey) || fallback;
    if (this.state === "lobby") this.lobbyScreen.showNotice(msg);
    else if (this.state === "room") this.roomScreen.showNotice(msg);
    else this.hud.flashCenter(msg, 2.4);
    console.warn("Server:", code, fallback);
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
    this.spectating = me?.spectator ?? !(this.net.playerId! in spawns);

    if (this.spectating) {
      // Vaatleja: oma paati pole, kaamera stardijoone kohale
      if (this.boat) {
        this.engine.scene.remove(this.boat.mesh);
        this.boat = null;
      }
      this.ownEngine?.dispose();
      this.ownEngine = null;
      this.race = null;
      const g0 = this.track.gates[0];
      this.spectatorCam.reset(g0.center.x, g0.center.z);
    } else {
      const mySlot = spawns[this.net.playerId ?? ""] ?? 0;
      this.spawnOwnBoat(me?.vehicle ?? "kiirpaat", me?.color ?? 0xe63946, mySlot);
      this.race = new RaceLogic(this.track, config.laps);
      this.race.onGate = (gate) => {
        this.net?.send({ type: "gate", gate });
        this.sfx.chime();
      };
      this.race.onMissGate = () => this.hud.flashCenter(t("hud.varavMoodas"), 0.8);
    }

    // Kaugpaadid stardikohtadele — ainult võistlejad (spawns-i liikmed)
    this.clearRemoteBoats();
    for (const p of this.room.players) {
      if (p.id === this.net.playerId || !(p.id in spawns)) continue;
      const rb = new RemoteBoat(p.id, p.vehicle, p.name, p.color);
      const sp = this.track.spawnPoint(spawns[p.id] ?? 0);
      rb.mesh.position.set(sp.x, 0, sp.z);
      rb.mesh.rotation.y = sp.yaw;
      this.remoteBoats.set(p.id, rb);
      this.engine.scene.add(rb.mesh);
      this.remoteEngines.set(
        p.id,
        new EngineSound(this.audio, VEHICLES[p.vehicle].tyyp === "jett" ? 76 : 52, true),
      );
    }

    this.mpStartsAt = startsAt;
    this.mpStarted = false;
    this.mpFinished = false;
    this.standings = [];
    this.sendAccum = 0;
    this.boostCooldown.clear();
    this.clearShots();
    this.lastCountShown = -1;

    this.screens.show(null);
    this.hud.show(true);
    this.hud.setSpectator(this.spectating, t("hud.vaatleja.legend"));
    if (this.spectating) this.touch.hide();
    else this.touch.show(me?.vehicle ?? "kiirpaat");
    this.gateArrow.visible = !this.spectating;
    this.state = "countdown";
  }

  private backToRoom(): void {
    this.state = "room";
    this.hud.hide();
    this.touch.hide();
    this.hud.setSpectator(false);
    this.spectating = false;
    this.gateArrow.visible = false;
    this.clearRemoteBoats();
    this.clearShots();
    this.stopRaceAudio();
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
    for (const e of this.remoteEngines.values()) e.dispose();
    this.remoteEngines.clear();
    this.remoteDist.clear();
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
    this.activeRamp = null;
    this.boat.physics.surfaceOverride = this.track.surfaceOverride;
    this.boat.physics.onLanding = (impact) => {
      this.chaseCam.addTrauma(Math.min(impact * 0.06, 0.5));
      this.sfx.splash(impact * 0.12);
      if (this.boat) {
        this.effects.burst(
          this.boat.physics.pos.x,
          this.boat.physics.pos.z,
          Math.min(impact * 0.14, 1),
          this.weather.waves,
          this.engine.simTime,
        );
      }
    };
    this.chaseCam.snapTo(this.boat.physics);

    this.ownEngine?.dispose();
    this.ownEngine = new EngineSound(
      this.audio,
      VEHICLES[vehicle].tyyp === "jett" ? 76 : 52,
      false,
    );
  }

  private checkRampReward(prevX: number, prevZ: number): void {
    const physics = this.boat?.physics;
    if (!physics) return;

    const local = (
      ramp: TrackWorld["ramps"][number],
      x: number,
      z: number,
    ): [number, number] => {
      const px = x - ramp.x;
      const pz = z - ramp.z;
      return [
        px * ramp.dirX + pz * ramp.dirZ,
        px * -ramp.dirZ + pz * ramp.dirX,
      ];
    };

    if (this.activeRamp === null) {
      for (let i = 0; i < this.track.ramps.length; i++) {
        const ramp = this.track.ramps[i];
        const [u, v] = local(ramp, physics.pos.x, physics.pos.z);
        const forwardSpeed = physics.vel.x * ramp.dirX + physics.vel.z * ramp.dirZ;
        if (
          u >= 0 &&
          u < ramp.length &&
          Math.abs(v) <= ramp.width / 2 &&
          forwardSpeed > 2
        ) {
          this.activeRamp = i;
          break;
        }
      }
    }

    if (this.activeRamp === null) return;
    const ramp = this.track.ramps[this.activeRamp];
    if (!ramp) {
      this.activeRamp = null;
      return;
    }

    const [prevU, prevV] = local(ramp, prevX, prevZ);
    const [u, v] = local(ramp, physics.pos.x, physics.pos.z);
    const forwardSpeed = physics.vel.x * ramp.dirX + physics.vel.z * ramp.dirZ;
    const du = u - prevU;

    if (prevU < ramp.length && u >= ramp.length && du > 0) {
      const alpha = (ramp.length - prevU) / du;
      const crossV = prevV + (v - prevV) * alpha;
      if (Math.abs(crossV) <= ramp.width / 2 + 0.25 && forwardSpeed > 2) {
        physics.refillBoost();
        this.hud.flashCenter(t("hud.boostTais"), 1.2);
        this.sfx.chime();
      }
      this.activeRamp = null;
      return;
    }

    if (
      u < -physics.stats.hullLength ||
      u > ramp.length + physics.stats.hullLength + 1 ||
      Math.abs(v) > ramp.width / 2 + 0.75 ||
      forwardSpeed < -2
    ) {
      this.activeRamp = null;
    }
  }

  private stopRaceAudio(): void {
    this.ownEngine?.dispose();
    this.ownEngine = null;
    for (const e of this.remoteEngines.values()) e.dispose();
    this.remoteEngines.clear();
    this.remoteDist.clear();
  }

  private setPaused(on: boolean): void {
    this.paused = on;
    if (on && this.mode === "solo") this.boat?.freezeVisual();
    this.hud.setPaused(on, this.mode === "mp" ? t("paus.lahku") : t("paus.katkesta"));
    this.touch.setPaused(on);
  }

  /** Katkesta sõit pausimenüüst */
  private quitRace(): void {
    this.setPaused(false);
    if (this.mode === "mp") {
      this.net?.send({ type: "leaveRoom" });
      this.hud.hide();
      this.touch.hide();
      this.hud.setSpectator(false);
      this.spectating = false;
      this.gateArrow.visible = false;
      this.clearRemoteBoats();
      this.clearShots();
      this.stopRaceAudio();
      this.state = "lobby";
      this.screens.show(this.lobbyScreen);
    } else {
      this.toMenu();
    }
  }

  private toMenu(): void {
    this.state = "menu";
    this.mode = "solo";
    this.hud.hide();
    this.touch.hide();
    this.hud.setSpectator(false);
    this.spectating = false;
    this.gateArrow.visible = false;
    this.clearRemoteBoats();
    this.clearShots();
    this.stopRaceAudio();
    this.ghostBoat?.dispose();
    this.ghostBoat = null;
    this.ghostBestMs = null;
    this.hud.setGhostDelta(null, null);
    this.screens.show(this.menu);
  }

  private showSoloResults(): void {
    if (!this.race || !this.choices) return;
    this.boat?.freezeVisual();
    this.state = "results";
    this.hud.hide();
    this.touch.hide();
    this.gateArrow.visible = false;
    this.clearShots();
    this.stopRaceAudio();
    const meta: ResultsMeta = {
      trackName: this.track.def.nimi,
      weatherName: this.weather.nimi,
      vehicleName: VEHICLES[this.choices.vehicle].nimi,
      laps: this.race.totalLaps,
      bestLapMs: this.race.bestLap,
      newRecord: this.soloHadRecord,
      variantLabel: t("tulemused.jargmineIlm"),
    };
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
      meta,
    );
    this.screens.show(this.results);
  }

  private startSoloWeatherVariant(): void {
    if (!this.choices) return;
    const allowed = this.track.def.allowedWeathers;
    const i = allowed.indexOf(this.choices.weather);
    const weather = allowed[(i + 1 + allowed.length) % allowed.length] ?? this.choices.weather;
    this.startSolo({ ...this.choices, weather });
  }

  private respawn(): void {
    if (!this.boat || !this.race) return;
    this.ghostRecorder?.markDirty();
    if (this.mode === "solo") this.hud.flashCenter(t("hud.puhasRingRikutud"), 0.9);
    const g = this.race.lastGate;
    this.boat.physics.reset(g.center.x, g.center.z, Math.atan2(g.dirX, g.dirZ));
    this.activeRamp = null;
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

    const inRace = this.state === "racing" || this.state === "countdown";

    // H — juhtimise legend sõidu/loenduse ajal
    if (inRace && this.input.legendPressed) {
      this.hud.toggleLegend();
    }

    // Esc — pausimenüü (soolo peatab mängu; võrgus ainult overlay)
    if (inRace && this.input.pausePressed) {
      this.setPaused(!this.paused);
    }
    if (this.paused && this.mode === "solo") return;

    if (this.state === "countdown") {
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
        this.sfx.countBlip();
      }
      this.boat?.update({ throttle: 0, steer: 0, slide: false }, this.weather.waves, this.engine.simTime, dt);
      const canStart = this.mode === "mp" ? remaining <= 0 || this.mpStarted : remaining <= 0;
      if (canStart) {
        this.state = "racing";
        this.race?.start();
        this.ghostRecorder?.startLap();
        this.hud.flashCenter(t("hud.start"), 1);
        this.sfx.countBlip(true);
      }
      return;
    }

    // Vaatleja: Tab tsükleerib vaatepunkte
    if (this.spectating && this.state === "racing" && this.input.wasPressed("Tab")) {
      this.spectatorCam.cycle(this.remoteBoats.size);
    }

    if (this.state === "racing" && this.boat && this.race) {
      if (this.input.respawnPressed && !this.paused) this.respawn();
      if (this.input.actionPressed && !this.paused) this.fireWaterShot();
      // Hoovus (jõekanjon)
      const cur = this.track.def.current ?? 0;
      if (cur > 0) {
        const [tx, tz] = this.track.nearestTangent(
          this.boat.physics.pos.x,
          this.boat.physics.pos.z,
        );
        this.boat.physics.currentX = tx * cur;
        this.boat.physics.currentZ = tz * cur;
      } else {
        this.boat.physics.currentX = 0;
        this.boat.physics.currentZ = 0;
      }
      // Pausi ajal (võrgus) gaas maha — paat jääb triivima, sõit jätkub teistel
      const inp = this.paused
        ? { throttle: 0, steer: 0, slide: false }
        : {
            throttle: this.input.throttle,
            steer: this.input.steer,
            slide: this.input.slide,
            boost: this.input.boost,
          };
      const prevX = this.boat.physics.pos.x;
      const prevZ = this.boat.physics.pos.z;
      this.boat.update(inp, this.weather.waves, this.engine.simTime, dt);
      this.checkRampReward(prevX, prevZ);
      const hit = resolveCollisions(this.boat.physics, this.track.colliders, this.track.terrain);
      if (hit && !hit.soft) {
        this.chaseCam.addTrauma(Math.min(hit.impact * 0.05, 0.6));
        this.sfx.thunk(hit.impact * 0.12);
      }
      this.checkBoosts();

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

      // Kummituse salvestus (ainult soolo)
      if (this.mode === "solo" && this.ghostRecorder && !this.race.finished) {
        this.ghostRecorder.record(this.boat.physics, dt);
      }

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
    if (this.state === "racing") this.updateWaterShots(dt);
  }

  private render(alpha: number, frameDt: number): void {
    const time = this.engine.simTime;

    this.autoDowngrade(frameDt);

    if (this.state === "menu" || this.state === "lobby" || this.state === "room") {
      const a = time * 0.04;
      this.engine.camera.position.set(Math.sin(a) * 300, 55, Math.cos(a) * 300);
      this.engine.camera.lookAt(0, 6, 0);
      this.engine.camera.fov = 55;
      this.engine.camera.updateProjectionMatrix();
      this.sky.followTarget(this.engine.camera.position);
    } else if (this.spectating) {
      const targets = [...this.remoteBoats.values()].map((rb) => ({
        x: rb.x,
        z: rb.z,
        yaw: rb.yaw,
      }));
      this.spectatorCam.update(this.input, targets, frameDt);
      this.sky.followTarget(this.engine.camera.position);
    } else if (this.boat) {
      // Kui kohalik füüsika ei astu, tiksub Engine'i alpha siiski edasi.
      // Kasuta lukustatud hetkepoosi nii pausil kui tulemuste ekraanil.
      const frozen = this.state === "results" || (this.paused && this.mode === "solo");
      this.boat.applyVisual(frozen ? 1 : alpha);
      this.chaseCam.update(this.boat.physics, this.weather.waves, time, frameDt);
      this.sky.followTarget(this.boat.physics.pos);
    }

    // Kaugpaadid
    if (this.net && this.remoteBoats.size) {
      const now = this.net.serverNow();
      for (const rb of this.remoteBoats.values()) rb.update(now);
    }

    // Kummituspaat mängib parimat ringi
    if (this.ghostBoat && this.race && this.state === "racing" && this.race.running) {
      this.ghostBoat.update(this.race.raceTime - this.race.lapStartTime);
      this.ghostBoat.mesh.visible = !this.race.finished;
    }

    // --- Heli ---
    this.audio.updateListener(this.engine.camera);
    this.audio.update(frameDt);
    if (this.ownEngine && this.boat && (this.state === "racing" || this.state === "countdown")) {
      const p = this.boat.physics;
      this.ownEngine.update(
        frameDt,
        this.state === "countdown" ? 0 : Math.abs(this.input.throttle),
        clamp(p.speed / p.stats.topSpeed, 0, 1),
        p.airborne,
      );
    }
    if (this.state === "racing" || this.state === "countdown") {
      const cam = this.engine.camera.position;
      for (const [id, eng] of this.remoteEngines) {
        const rb = this.remoteBoats.get(id);
        if (!rb) continue;
        const dist = Math.hypot(rb.x - cam.x, rb.z - cam.z);
        const prev = this.remoteDist.get(id) ?? dist;
        this.remoteDist.set(id, dist);
        const radialVel = frameDt > 0 ? (dist - prev) / frameDt : 0;
        const doppler = clamp(1 - radialVel / 120, 0.85, 1.15);
        const topSpeed = VEHICLES[rb.vehicle].topSpeed;
        const ratio = clamp(rb.speed / topSpeed, 0, 1);
        eng.update(
          frameDt,
          ratio,
          ratio,
          false,
          { x: rb.x, y: rb.mesh.position.y, z: rb.z },
          doppler,
        );
      }
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

    // --- Efektid: pritsmed + kiiluvesi + vihm ---
    this.effects.update(time);
    if (this.wake) this.wake.begin();
    if (this.state === "racing" || this.state === "countdown") {
      if (this.boat) {
        const p = this.boat.physics;
        const ratio = clamp(p.speed / p.stats.topSpeed, 0, 1);
        this.effects.boatSpray(
          "me",
          {
            x: p.pos.x, y: p.pos.y, z: p.pos.z,
            yaw: p.yaw,
            speed: p.speed,
            topSpeed: p.stats.topSpeed,
            airborne: p.airborne,
            isJet: p.stats.tyyp === "jett",
          },
          frameDt,
          this.weather.waves,
          time,
        );
        this.wake?.stamp(p.pos.x, p.pos.z, p.yaw, ratio);
      }
      for (const rb of this.remoteBoats.values()) {
        const stats = VEHICLES[rb.vehicle];
        this.effects.boatSpray(
          rb.playerId,
          {
            x: rb.x, y: rb.mesh.position.y, z: rb.z,
            yaw: rb.yaw,
            speed: rb.speed,
            topSpeed: stats.topSpeed,
            airborne: false,
            isJet: stats.tyyp === "jett",
          },
          frameDt,
          this.weather.waves,
          time,
        );
        this.wake?.stamp(rb.x, rb.z, rb.yaw, clamp(rb.speed / stats.topSpeed, 0, 1));
      }
    }
    this.wake?.render(this.engine.renderer);
    this.rain.update(time, this.engine.camera.position);

    this.ocean.update(time, this.engine.camera.position);

    // Peegelpilt — PEAB renderduma enne composer'it (onRender jookseb enne),
    // partiklid/vihm/ookean ise peeglist väljas
    this.planar?.render(this.engine.renderer, this.engine.scene, this.engine.camera, [
      this.ocean.group,
      this.effects.group,
      this.rain.points,
    ]);

    if (this.state === "racing" || this.state === "countdown") {
      this.updateHud(frameDt);
    }

  }

  private checkBoosts(): void {
    if (!this.boat || !this.track.boosts.length || this.paused) return;
    const p = this.boat.physics;
    const now = this.engine.simTime;
    for (const b of this.track.boosts) {
      if ((this.boostCooldown.get(b.index) ?? 0) > now) continue;
      const dx = p.pos.x - b.x;
      const dz = p.pos.z - b.z;
      if (Math.hypot(dx, dz) > b.radius) continue;

      const forwardSpeed = p.vel.x * b.dirX + p.vel.z * b.dirZ;
      const cappedPower = Math.max(3, Math.min(b.power, p.stats.topSpeed * 1.28 - forwardSpeed));
      p.vel.x += b.dirX * cappedPower;
      p.vel.z += b.dirZ * cappedPower;
      p.speed = Math.hypot(p.vel.x, p.vel.z);
      this.boostCooldown.set(b.index, now + 1.25);
      this.chaseCam.addTrauma(0.18);
      this.sfx.chime();
      this.hud.flashCenter(t("hud.boost"), 0.55);
      this.effects.burst(p.pos.x, p.pos.z, 0.45, this.weather.waves, now);
      break;
    }
  }

  private fireWaterShot(): void {
    if (!this.boat) return;
    const now = this.engine.simTime;
    if (now < this.shotReadyAt) return;
    const p = this.boat.physics;
    const x = p.pos.x + p.forwardX * 4.2;
    const z = p.pos.z + p.forwardZ * 4.2;
    const ownerId = this.net?.playerId ?? "solo";
    this.spawnWaterShot(ownerId, x, z, p.yaw);
    this.shotReadyAt = now + 0.72;
    this.sfx.splash(0.28);
    if (this.mode === "mp") {
      this.net?.send({
        type: "shot",
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        yaw: Math.round(p.yaw * 1000) / 1000,
      });
    }
  }

  private spawnWaterShot(ownerId: string, x: number, z: number, yaw: number): void {
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    mesh.castShadow = false;
    mesh.scale.set(1, 0.72, 1.25);
    this.engine.scene.add(mesh);
    this.shots.push({
      ownerId,
      x,
      z,
      dirX: Math.sin(yaw),
      dirZ: Math.cos(yaw),
      life: 1.25,
      mesh,
    });
  }

  private updateWaterShots(dt: number): void {
    if (!this.shots.length) return;
    const myId = this.net?.playerId ?? "solo";
    const speed = 54;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.life -= dt;
      shot.x += shot.dirX * speed * dt;
      shot.z += shot.dirZ * speed * dt;
      const y = getWaveHeight(this.weather.waves, shot.x, shot.z, this.engine.simTime) + 0.6;
      shot.mesh.position.set(shot.x, y, shot.z);
      shot.mesh.rotation.y = Math.atan2(shot.dirX, shot.dirZ);
      const pulse = 0.85 + Math.sin(this.engine.simTime * 22) * 0.12;
      shot.mesh.scale.setScalar(pulse);

      let remove = shot.life <= 0;
      if (!remove && this.boat && shot.ownerId !== myId && !this.spectating) {
        const p = this.boat.physics;
        const d = Math.hypot(p.pos.x - shot.x, p.pos.z - shot.z);
        if (d < p.stats.hullRadius + 1.25) {
          p.vel.x += shot.dirX * 6.5;
          p.vel.z += shot.dirZ * 6.5;
          p.speed = Math.hypot(p.vel.x, p.vel.z);
          this.chaseCam.addTrauma(0.28);
          this.sfx.splash(0.55);
          this.effects.burst(p.pos.x, p.pos.z, 0.55, this.weather.waves, this.engine.simTime);
          this.hud.flashCenter(t("hud.tabamus"), 0.75);
          remove = true;
        }
      }
      if (remove) {
        shot.mesh.removeFromParent();
        this.shots.splice(i, 1);
      }
    }
  }

  private clearShots(): void {
    for (const shot of this.shots) shot.mesh.removeFromParent();
    this.shots = [];
    this.shotReadyAt = 0;
  }

  private updateHud(frameDt: number): void {
    if (this.spectating) {
      // Vaatleja: ainult minimap + keskteated
      const dots: MinimapDot[] = [];
      const playersById = new Map((this.room?.players ?? []).map((p) => [p.id, p]));
      const rows: SpectatorRow[] = [];
      for (const rb of this.remoteBoats.values()) {
        dots.push({ x: rb.x, z: rb.z, yaw: rb.yaw, color: "#ffb3ba", me: false });
        const idx = this.standings.indexOf(rb.playerId);
        rows.push({
          name: playersById.get(rb.playerId)?.name ?? rb.playerId,
          position: idx >= 0 ? idx + 1 : null,
          speedKmh: rb.speed * 3.6,
        });
      }
      rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
      this.hud.setSpectatorRows(rows);
      this.hud.update(frameDt, dots);
      return;
    }
    const b = this.boat!;
    const r = this.race!;
    this.hud.setSpeed(b.physics.speed * 3.6);
    this.hud.setBoost(b.physics.boostEnergy, b.physics.boosting);
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
    if (this.mode === "solo" && this.ghostBestMs !== null && !r.finished) {
      const progress = this.track.nearestProgress(b.physics.pos.x, b.physics.pos.z);
      const lapElapsedMs = (r.raceTime - r.lapStartTime) * 1000;
      const deltaMs =
        progress > 0.04 ? lapElapsedMs - this.ghostBestMs * progress : null;
      this.hud.setGhostDelta(deltaMs, this.ghostBestMs);
    } else {
      this.hud.setGhostDelta(null, null);
    }

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
