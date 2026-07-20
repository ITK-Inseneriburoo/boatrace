import * as THREE from "three";
import type { WeatherId } from "@shared/types";

/**
 * Heli juurikas: AudioContext (luuakse esimesel kasutaja žestil),
 * bussid (mootor/sfx/ambient) ja ilmapõhine ambient-taust.
 * Kõik helid sünteesitakse — null helifaili.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engineBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  ambientBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;
  private currentAmbient: WeatherId | null = null;
  private gullTimer = 0;
  private ambientWeather: WeatherId | null = null;
  private backgroundSuspended = false;

  /** Kutsu kasutaja žestilt (klikk, klahv või puldi interaktsioon) — brauser nõuab seda. */
  ensure(): void {
    if (this.ctx) {
      if (!this.backgroundSuspended && this.ctx.state !== "running" && this.ctx.state !== "closed") {
        void this.ctx.resume().catch(() => undefined);
      }
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0.55;
    this.engineBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = 0.5;
    this.ambientBus.connect(this.master);

    // 2s valge müra puhver (splashid, tuul, vihm)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    if (this.ambientWeather) this.setAmbient(this.ambientWeather);
    if (this.backgroundSuspended) {
      void ctx.suspend().catch(() => undefined);
    } else if (ctx.state !== "running" && ctx.state !== "closed") {
      void ctx.resume().catch(() => undefined);
    }
  }

  /** Peata kogu heligraaf, kui leht läheb taustale või ekraan lukustub. */
  suspendForBackground(): void {
    this.backgroundSuspended = true;
    if (this.ctx?.state === "running") {
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  /** Jätka varem kasutaja žestiga avatud helikonteksti. */
  resumeFromBackground(): void {
    this.backgroundSuspended = false;
    if (this.ctx && this.ctx.state !== "running" && this.ctx.state !== "closed") {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  get noise(): AudioBuffer {
    return this.noiseBuf!;
  }

  /** Kuulaja = kaamera */
  updateListener(camera: THREE.Camera): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.05);
      l.positionY.setTargetAtTime(p.y, t, 0.05);
      l.positionZ.setTargetAtTime(p.z, t, 0.05);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.05);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.05);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      l.upX.setTargetAtTime(up.x, t, 0.05);
      l.upY.setTargetAtTime(up.y, t, 0.05);
      l.upZ.setTargetAtTime(up.z, t, 0.05);
    } else {
      // Vana API (Firefox)
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  /** Ilma taustaheli 2s ristsulandusega */
  setAmbient(weather: WeatherId): void {
    this.ambientWeather = weather;
    if (!this.ctx || !this.ambientBus) return;
    if (this.currentAmbient === weather) return;
    this.currentAmbient = weather;
    const ctx = this.ctx;

    // Vana välja
    if (this.ambientGain) {
      const old = this.ambientGain;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.7);
      const oldNodes = this.ambientNodes;
      setTimeout(() => {
        oldNodes.forEach((n) => {
          try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* ok */ }
          n.disconnect();
        });
        old.disconnect();
      }, 3000);
    }
    this.ambientNodes = [];

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.ambientBus);
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.7);
    this.ambientGain = out;

    // --- Tuul (kõigil ilmadel, tormis tugevam) ---
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noiseBuf;
    windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = "lowpass";
    windLp.frequency.value = 480;
    const windBp = ctx.createBiquadFilter();
    windBp.type = "bandpass";
    windBp.frequency.value = 350;
    windBp.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = weather === "torm" ? 0.75 : weather === "udu" ? 0.22 : 0.32;
    // LFO puhub tuult
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = weather === "torm" ? 0.3 : 0.1;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 180;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(windBp.frequency);
    windSrc.connect(windLp).connect(windBp).connect(windGain).connect(out);
    windSrc.start();
    lfo.start();
    lfo2.start();
    this.ambientNodes.push(windSrc, lfo, lfo2, windLp, windBp, windGain, lfoGain, lfo2Gain);

    // --- Vihm (torm) ---
    if (weather === "torm") {
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = this.noiseBuf;
      rainSrc.loop = true;
      rainSrc.playbackRate.value = 1.3;
      const rainHp = ctx.createBiquadFilter();
      rainHp.type = "highpass";
      rainHp.frequency.value = 2800;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0.32;
      rainSrc.connect(rainHp).connect(rainGain).connect(out);
      rainSrc.start();
      this.ambientNodes.push(rainSrc, rainHp, rainGain);
    }

    // --- Väike lainete loksumine (kõik ilmad) ---
    const lapSrc = ctx.createBufferSource();
    lapSrc.buffer = this.noiseBuf;
    lapSrc.loop = true;
    lapSrc.playbackRate.value = 0.5;
    const lapBp = ctx.createBiquadFilter();
    lapBp.type = "bandpass";
    lapBp.frequency.value = 900;
    lapBp.Q.value = 1.2;
    const lapGain = ctx.createGain();
    lapGain.gain.value = 0.14;
    const lapLfo = ctx.createOscillator();
    lapLfo.frequency.value = 0.32;
    const lapLfoG = ctx.createGain();
    lapLfoG.gain.value = 0.07;
    lapLfo.connect(lapLfoG);
    lapLfoG.connect(lapGain.gain);
    lapSrc.connect(lapBp).connect(lapGain).connect(out);
    lapSrc.start();
    lapLfo.start();
    this.ambientNodes.push(lapSrc, lapBp, lapGain, lapLfo, lapLfoG);
  }

  /** Kajakad uduse õhtu ambient'ile — kutsu update-loopist */
  update(dt: number): void {
    if (!this.ctx || this.currentAmbient !== "udu") return;
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 5 + Math.random() * 12;
      this.gullCry();
    }
  }

  private gullCry(): void {
    if (!this.ctx || !this.ambientGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.5;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const start = t + i * (0.35 + Math.random() * 0.2);
      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modG = ctx.createGain();
      const g = ctx.createGain();
      const base = 950 + Math.random() * 350;
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 0.72, start + 0.28);
      mod.frequency.value = 24;
      modG.gain.value = 90;
      mod.connect(modG);
      modG.connect(osc.frequency);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.03, start + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(g).connect(this.ambientGain);
      osc.start(start);
      osc.stop(start + 0.4);
      mod.start(start);
      mod.stop(start + 0.4);
    }
  }
}
