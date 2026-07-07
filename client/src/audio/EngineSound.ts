import { clamp, damp } from "@shared/math";
import type { AudioEngine } from "./AudioEngine";

/**
 * Sünteesitud paadimootor: 2 saehammast (kergelt detuunitud) + sub-oktav
 * ruut → pehme distortion → lowpass, mille cutoff järgib RPM-i.
 * Burble madalal RPM-il + aeglane LFO-võbin teevad sellest "mootori".
 */
export class EngineSound {
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private panner: PannerNode | null = null;
  private wobble: OscillatorNode | null = null;
  private rpm = 0.25;
  private burbleT = 0;
  private started = false;

  constructor(
    private audio: AudioEngine,
    /** jetid on kilavama häälega */
    private baseFreq: number,
    private spatial: boolean,
  ) {}

  private start(): void {
    const ctx = this.audio.ctx;
    if (!ctx || !this.audio.engineBus || this.started) return;
    this.started = true;

    this.osc1 = ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "sawtooth";
    this.sub = ctx.createOscillator();
    this.sub.type = "square";

    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.55;
    const subg = ctx.createGain();
    subg.gain.value = 0.4;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 400;
    this.lowpass.Q.value = 1.1;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    // Aeglane ±3Hz võbin
    this.wobble = ctx.createOscillator();
    this.wobble.frequency.value = 3.1;
    const wobbleG = ctx.createGain();
    wobbleG.gain.value = 2.2;
    this.wobble.connect(wobbleG);
    wobbleG.connect(this.osc1.frequency);

    this.osc1.connect(pre);
    this.osc2.connect(o2g).connect(pre);
    this.sub.connect(subg).connect(pre);
    pre.connect(shaper).connect(this.lowpass).connect(this.gain);

    if (this.spatial) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = "HRTF";
      this.panner.distanceModel = "inverse";
      this.panner.refDistance = 8;
      this.panner.maxDistance = 400;
      this.panner.rolloffFactor = 1.2;
      this.gain.connect(this.panner).connect(this.audio.engineBus);
    } else {
      this.gain.connect(this.audio.engineBus);
    }

    this.osc1.start();
    this.osc2.start();
    this.sub.start();
    this.wobble.start();
  }

  /**
   * @param throttle [0..1], speedRatio [0..1], airborne — RPM hüppab propeller-veest-väljas
   * @param pos kaugpaadi asukoht (spatial)
   * @param dopplerScale suhtelisest radiaalkiirusest [0.85..1.15]
   */
  update(
    dt: number,
    throttle: number,
    speedRatio: number,
    airborne: boolean,
    pos?: { x: number; y: number; z: number },
    dopplerScale = 1,
  ): void {
    if (!this.started) this.start();
    const ctx = this.audio.ctx;
    if (!ctx || !this.osc1 || !this.osc2 || !this.sub || !this.lowpass || !this.gain) return;

    let target = 0.22 + 0.78 * (Math.abs(throttle) * 0.55 + speedRatio * 0.45);
    if (airborne) target = Math.min(target * 1.35, 1.15);
    this.rpm = damp(this.rpm, target, airborne ? 9 : 3.5, dt);

    // Burble: madalal RPM-il juhuslikud katked
    this.burbleT -= dt;
    let burble = 1;
    if (this.rpm < 0.45 && this.burbleT <= 0) {
      this.burbleT = 0.04 + Math.random() * 0.09;
      burble = 0.55 + Math.random() * 0.45;
    }

    const f = this.baseFreq * (0.55 + this.rpm * 1.9) * dopplerScale;
    const t = ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 2.02, t, 0.03);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.lowpass.frequency.setTargetAtTime(260 + this.rpm * 2400, t, 0.05);

    const vol = (0.16 + this.rpm * 0.5) * burble;
    this.gain.gain.setTargetAtTime(vol, t, 0.05);

    if (this.panner && pos) {
      if (this.panner.positionX) {
        this.panner.positionX.setTargetAtTime(pos.x, t, 0.08);
        this.panner.positionY.setTargetAtTime(pos.y, t, 0.08);
        this.panner.positionZ.setTargetAtTime(pos.z, t, 0.08);
      } else {
        this.panner.setPosition(pos.x, pos.y, pos.z);
      }
    }
  }

  dispose(): void {
    for (const n of [this.osc1, this.osc2, this.sub, this.wobble]) {
      try { n?.stop(); } catch { /* ok */ }
      n?.disconnect();
    }
    this.gain?.disconnect();
    this.panner?.disconnect();
    this.started = false;
  }
}
