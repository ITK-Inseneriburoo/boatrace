import type { Gate, TrackWorld } from "../world/TrackBuilder";

/**
 * Väravate/ringide loogika ühe paadi kohta.
 * Värav loeb, kui paat ületab väravatasandi õiges suunas ja piisavalt
 * värava keskkoha lähedal — JA ainult siis, kui see on järgmine värav.
 */
export class RaceLogic {
  nextGate = 1;
  lap = 1;
  totalLaps: number;
  raceTime = 0;
  lapStartTime = 0;
  lapTimes: number[] = [];
  bestLap = Infinity;
  finished = false;
  wrongWay = false;

  onGate: (gateIndex: number) => void = () => {};
  onLap: (lap: number, lapTimeMs: number) => void = () => {};
  onFinish: (totalMs: number) => void = () => {};

  private prevSigned = new Map<number, number>();
  private wrongWayTimer = 0;
  running = false;

  constructor(private world: TrackWorld, totalLaps: number) {
    this.totalLaps = totalLaps;
  }

  start(): void {
    this.running = true;
    this.raceTime = 0;
    this.lapStartTime = 0;
    this.nextGate = 1;
    this.lap = 1;
    this.finished = false;
    this.lapTimes = [];
    this.prevSigned.clear();
  }

  /** Viimati läbitud värav (respawni jaoks) */
  get lastGate(): Gate {
    const i = (this.nextGate - 1 + this.world.gates.length) % this.world.gates.length;
    return this.world.gates[i];
  }

  update(px: number, pz: number, vx: number, vz: number, dt: number): void {
    if (!this.running || this.finished) return;
    this.raceTime += dt;

    const gate = this.world.gates[this.nextGate % this.world.gates.length];
    const gi = gate.index;
    const signed = (px - gate.center.x) * gate.dirX + (pz - gate.center.z) * gate.dirZ;
    const prev = this.prevSigned.get(gi);
    if (prev !== undefined && prev < 0 && signed >= 0) {
      // Ületas tasandi — kas värava laiuses?
      const latX = px - gate.center.x;
      const latZ = pz - gate.center.z;
      const nx = gate.dirZ, nz = -gate.dirX;
      const lat = Math.abs(latX * nx + latZ * nz);
      if (lat <= gate.width / 2 + 2.5) {
        this.passGate(gi);
      }
    }
    this.prevSigned.set(gi, signed);

    // Vale suund: liigub vastu raja tangenti > 2 s
    const speed = Math.hypot(vx, vz);
    if (speed > 3) {
      const [tx, tz] = this.world.nearestTangent(px, pz);
      const along = (vx * tx + vz * tz) / speed;
      if (along < -0.3) this.wrongWayTimer += dt;
      else this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * 2);
    } else {
      this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * 2);
    }
    this.wrongWay = this.wrongWayTimer > 2;
  }

  private passGate(gateIndex: number): void {
    const gateCount = this.world.gates.length;
    this.onGate(gateIndex);
    if (gateIndex === 0) {
      // Ring täis
      const lapTime = (this.raceTime - this.lapStartTime) * 1000;
      this.lapTimes.push(lapTime);
      this.bestLap = Math.min(this.bestLap, lapTime);
      this.onLap(this.lap, lapTime);
      this.lapStartTime = this.raceTime;
      if (this.lap >= this.totalLaps) {
        this.finished = true;
        this.onFinish(this.raceTime * 1000);
        return;
      }
      this.lap++;
    }
    this.nextGate = (gateIndex + 1) % gateCount;
  }

  /** Edenemine [0..laps] — kohajärjestuse arvutuseks */
  get progress(): number {
    const gateCount = this.world.gates.length;
    const gatesPassed = (this.lap - 1) * gateCount + ((this.nextGate - 1 + gateCount) % gateCount);
    return gatesPassed / gateCount;
  }
}
