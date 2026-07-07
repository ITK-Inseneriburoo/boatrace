import { clamp } from "@shared/math";
import type { AudioEngine } from "./AudioEngine";

/** Ühekordsed heliefektid — kõik sünteesitud */
export class Sfx {
  constructor(private audio: AudioEngine) {}

  private get ctx(): AudioContext | null {
    return this.audio.ctx;
  }

  /** Veeprits (maandumine, suur laine) — intensity [0..1] */
  splash(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.audio.sfxBus) return;
    const i = clamp(intensity, 0.1, 1);
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700 + Math.random() * 1400;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.45 * i, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + i * 0.45);
    src.connect(bp).connect(g).connect(this.audio.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 1);
  }

  /** Kere-kolks kollisioonil */
  thunk(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.audio.sfxBus) return;
    const i = clamp(intensity, 0.15, 1);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * i, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(this.audio.sfxBus);
    osc.start(t);
    osc.stop(t + 0.2);
    // Kraaps
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2 * i, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(hp).connect(ng).connect(this.audio.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.15);
  }

  /** Värava kelluke: E5 → A5 */
  chime(): void {
    this.blip(659.3, 0.0, 0.12);
    this.blip(880, 0.09, 0.2);
  }

  /** Loenduse piiks; final = kõrgem START-piiks */
  countBlip(final = false): void {
    this.blip(final ? 880 : 440, 0, final ? 0.5 : 0.18);
  }

  private blip(freq: number, delay: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.audio.sfxBus) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.audio.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** UI klõps */
  click(): void {
    const ctx = this.ctx;
    if (!ctx || !this.audio.sfxBus) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(bp).connect(g).connect(this.audio.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }

  /** Kõuemürin — delaySec = kaugus välgust */
  thunder(delaySec: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.audio.sfxBus) return;
    const t = ctx.currentTime + delaySec;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    src.playbackRate.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
    src.connect(lp).connect(g).connect(this.audio.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 3);
  }
}
