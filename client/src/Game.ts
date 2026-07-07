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
import { getTrack } from "@shared/tracks";
import { getWaveHeight } from "@shared/waves";
import type { TrackId } from "@shared/types";
import { ScreenManager } from "./ui/ScreenManager";
import { MainMenu, type MenuChoices } from "./ui/screens/MainMenu";
import { ResultsScreen } from "./ui/screens/Results";
import { Hud } from "./ui/screens/Hud";
import { t } from "./ui/i18n/et";

type GameState = "menu" | "countdown" | "racing" | "results";

/**
 * Mängu olekumasin: menüü → loendus → sõit → tulemused.
 * (Faas 6 lisab siia võrgumängu olekud.)
 */
export class Game {
  readonly engine: Engine;
  readonly input = new Input();
  readonly sky: SkySystem;
  readonly ocean = new Ocean();

  private screens: ScreenManager;
  private menu = new MainMenu();
  private results = new ResultsScreen();
  private hud = new Hud();

  private track: TrackWorld;
  private boat: PlayerBoat | null = null;
  private chaseCam: ChaseCamera;
  private race: RaceLogic | null = null;
  private weather: WeatherPreset = WEATHERS.paike;
  private state: GameState = "menu";
  private countdownT = 0;
  private lastCountShown = -1;
  private finishTimer = 0;
  private choices: MenuChoices | null = null;
  private gateArrow: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = new Engine(canvas);
    this.sky = new SkySystem(this.engine);
    this.engine.scene.add(this.ocean.group);
    this.chaseCam = new ChaseCamera(this.engine.camera);

    // Rada (v1: saarestik) on kogu aeg stseenis — ka menüü taustaks
    this.track = new TrackWorld(getTrack("saarestik"));
    this.engine.scene.add(this.track.group);
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

    // Järgmise värava viit: hõljuv kolmnurk
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
    this.gateArrow.rotation.x = Math.PI; // teravik alla
    this.gateArrow.visible = false;
    this.engine.scene.add(this.gateArrow);

    this.applyWeather(WEATHERS.paike);

    // UI
    this.screens = new ScreenManager(uiRoot);
    this.screens.register(this.menu);
    this.screens.register(this.results);
    uiRoot.appendChild(this.hud.el);

    this.menu.onSolo = (c) => this.startSolo(c);
    this.results.onRestart = () => {
      if (this.choices) this.startSolo(this.choices);
    };
    this.results.onMenu = () => this.toMenu();

    this.screens.show(this.menu);

    this.engine.onUpdate = (dt) => this.update(dt);
    this.engine.onRender = (alpha, frameDt) => this.render(alpha, frameDt);
    this.engine.start();
  }

  private applyWeather(w: WeatherPreset): void {
    this.weather = w;
    this.sky.applyPreset(w);
    this.ocean.applyWeather(w);
    if (this.sky.envCube) this.ocean.setEnvironment(this.sky.envCube, this.sky.sunDir);
  }

  /** Vaheta rada (võrgumäng, faas 9 lisab rohkem radu) */
  setTrack(id: TrackId): void {
    if (this.track.def.id === id) return;
    this.engine.scene.remove(this.track.group);
    this.track = new TrackWorld(getTrack(id));
    this.engine.scene.add(this.track.group);
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

  private startSolo(c: MenuChoices): void {
    this.choices = c;
    this.applyWeather(WEATHERS[c.weather]);

    if (this.boat) this.engine.scene.remove(this.boat.mesh);
    this.boat = new PlayerBoat(c.vehicle, c.color);
    this.engine.scene.add(this.boat.mesh);
    const spawn = this.track.spawnPoint(0);
    this.boat.physics.reset(spawn.x, spawn.z, spawn.yaw);
    this.boat.physics.surfaceOverride = this.track.surfaceOverride;
    this.boat.physics.onLanding = (impact) => {
      this.chaseCam.addTrauma(Math.min(impact * 0.06, 0.5));
    };
    this.chaseCam.snapTo(this.boat.physics);

    this.race = new RaceLogic(this.track, c.laps);
    this.race.onLap = (_lap, ms) => this.hud.flashCenter(formatLapFlash(ms), 1.6);
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

  private toMenu(): void {
    this.state = "menu";
    this.hud.hide();
    this.gateArrow.visible = false;
    this.screens.show(this.menu);
  }

  private showResults(): void {
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
  }

  private update(dt: number): void {
    this.sky.update(dt);

    if (this.state === "countdown" && this.boat) {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (n !== this.lastCountShown && n >= 1 && n <= 3) {
        this.lastCountShown = n;
        this.hud.flashCenter(String(n), 0.9);
      }
      // Paat õõtsub paigal (gaas lukus)
      this.boat.update({ throttle: 0, steer: 0, slide: false }, this.weather.waves, this.engine.simTime, dt);
      if (this.countdownT <= 0) {
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
      this.race.update(
        this.boat.physics.pos.x,
        this.boat.physics.pos.z,
        this.boat.physics.vel.x,
        this.boat.physics.vel.z,
        dt,
      );
      if (this.race.finished) {
        this.finishTimer -= dt;
        if (this.finishTimer <= 0) this.showResults();
      }
    }
  }

  private render(alpha: number, frameDt: number): void {
    const time = this.engine.simTime;

    if (this.state === "menu") {
      // Aeglane orbiit menüü taustaks
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

    const nextGate = this.race && this.state !== "menu" ? this.race.nextGate : -1;
    this.track.update(this.weather.waves, time, nextGate);

    // Väravaviit
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

    // HUD
    if (this.state === "racing" || this.state === "countdown") {
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
      this.hud.setPosition(null, 1);
      this.hud.setWrongWay(r.wrongWay);
      this.hud.update(frameDt, [
        {
          x: b.physics.pos.x,
          z: b.physics.pos.z,
          yaw: b.physics.yaw,
          color: "#2ec4b6",
          me: true,
        },
      ]);
    }

    this.input.endFrame();
  }
}

function formatLapFlash(ms: number): string {
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}
