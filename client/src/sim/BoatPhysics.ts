import * as THREE from "three";
import type { VehicleStats } from "@shared/vehicles";
import type { WaveSet } from "@shared/waves";
import { getWaveHeight } from "@shared/waves";
import { clamp, damp, lerp } from "@shared/math";

export interface BoatInput {
  throttle: number; // [-1,1]
  steer: number; // [-1,1]
  slide: boolean;
  boost?: boolean;
}

export const GRAVITY = 13; // arkaadne gravitatsioon — piisavalt õhku hüpeteks

// Boost (Ctrl): tõukejõu kordaja piiratud energiaga. Kuna takistus jääb samaks,
// tõuseb ka tippkiirus ≈ topSpeed·√MUL (1.9 → ~+38%).
const BOOST_ACCEL_MUL = 1.9;
const BOOST_DRAIN = 0.4; // energiat/s (~2.5 s täisboosti täisakust)
const BOOST_REFILL = 1 / 6; // taastub ~6 s tühjast täis
const BOOST_REFILL_DELAY = 1; // s peale lahtilaskmist enne taastumist

/**
 * Pinnakõrguse lisafunktsioon (rambid faasis 4):
 * tagastab pinna kõrguse (x,z) või -Infinity kui pole rampi.
 */
export type SurfaceOverrideFn = (x: number, z: number) => number;

export class BoatPhysics {
  readonly pos = new THREE.Vector3(0, 0, 0);
  readonly vel = new THREE.Vector3();
  yaw = 0;
  yawRate = 0;
  pitch = 0; // + = nina üles
  roll = 0;
  airborne = false;
  /** hetkekiirus m/s (cache) */
  speed = 0;
  /** gaasi hetkeväärtus heli jaoks */
  throttle = 0;
  /** boosti energia 0..1 */
  boostEnergy = 1;
  /** kas boost on hetkel aktiivne (HUD/heli/fx jaoks) */
  boosting = false;
  /** Shift-võime aktiivsus (sõidukispetsiifiline) */
  abilityActive = false;
  private boostRefillDelay = 0;
  private braceActive = false;
  /** hoovus (m/s²) — jõekanjon lükkab piki rada */
  currentX = 0;
  currentZ = 0;

  /** Maandumise event (impact = kukkumiskiirus m/s) */
  onLanding: (impact: number) => void = () => {};
  /** Õhkutõusu event */
  onTakeoff: () => void = () => {};

  surfaceOverride: SurfaceOverrideFn | null = null;

  private heaveVel = 0;
  private wasAirborne = false;
  /** pinna tõusukiirus (silutud) — rambilt lahkumisel saab sellest lennukiirus */
  private climbRate = 0;
  private lastSurfY: number | null = null;

  constructor(public stats: VehicleStats) {}

  reset(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.airborne = false;
    this.heaveVel = 0;
    this.climbRate = 0;
    this.lastSurfY = null;
    this.wasOnRamp = false;
    this.boostEnergy = 1;
    this.boosting = false;
    this.abilityActive = false;
    this.braceActive = false;
    this.boostRefillDelay = 0;
  }

  /** Täida mängija käsitsi kasutatav boost kohe lõpuni. */
  refillBoost(): void {
    this.boostEnergy = 1;
    this.boostRefillDelay = 0;
  }

  get forwardX(): number {
    return Math.sin(this.yaw);
  }
  get forwardZ(): number {
    return Math.cos(this.yaw);
  }

  /** kas mõni pinnaproov tabas sel sammul rampi */
  private rampContact = false;
  private wasOnRamp = false;

  /** Pinnakõrgus punktis — lained + võimalik rambi override */
  private surfaceAt(waves: WaveSet, x: number, z: number, t: number): number {
    const w = getWaveHeight(waves, x, z, t);
    if (this.surfaceOverride) {
      const o = this.surfaceOverride(x, z);
      if (o > w) {
        this.rampContact = true;
        return o;
      }
    }
    return w;
  }

  step(input: BoatInput, waves: WaveSet, time: number, dt: number): void {
    const s = this.stats;
    this.throttle = input.throttle;
    const fx = this.forwardX, fz = this.forwardZ;
    const rx = fz, rz = -fx; // paremale osutav vektor

    const halfL = s.hullLength / 2;
    const halfW = s.hullWidth / 2;

    // Pinnaproovid 4 kerepunktis
    const t = time;
    this.rampContact = false;
    const hBow = this.surfaceAt(waves, this.pos.x + fx * halfL, this.pos.z + fz * halfL, t);
    const hStern = this.surfaceAt(waves, this.pos.x - fx * halfL, this.pos.z - fz * halfL, t);
    const hRight = this.surfaceAt(waves, this.pos.x + rx * halfW, this.pos.z + rz * halfW, t);
    const hLeft = this.surfaceAt(waves, this.pos.x - rx * halfW, this.pos.z - rz * halfW, t);
    const onRamp = this.rampContact;
    let waterY = (hBow + hStern + hRight + hLeft) / 4;
    // Rambil ei tohi kere keskpunkt kaldpinnast läbi vajuda: nelja punkti
    // keskmine on rambile sõites poole rambi kõrgusel (ahter alles vees) —
    // toeta vähemalt keskpunkti-alusele rambipinnale
    if (onRamp && this.surfaceOverride) {
      const centerO = this.surfaceOverride(this.pos.x, this.pos.z);
      if (centerO > waterY) waterY = centerO;
    }

    // Pinna tõusukiirus (rambil ronides positiivne) — hüppe stardikiiruseks.
    // Tõus järgneb kiiresti, aga kustub aeglaselt: rambi ülaservas läheb
    // keskmine pind mõneks kaadriks alla ja kiire kustumine sõi hüppe ära
    if (this.lastSurfY !== null) {
      const rate = Math.max((waterY - this.lastSurfY) / dt, 0);
      this.climbRate = damp(this.climbRate, rate, rate > this.climbRate ? 14 : 4, dt);
    }
    this.lastSurfY = waterY;

    const speedRatio = clamp(this.speed / s.topSpeed, 0, 1);
    const ability = !!input.slide && !this.airborne;
    this.abilityActive = ability;
    this.braceActive = ability && s.id === "kalapaat";

    if (!this.airborne) {
      // --- Vees: vedru-sumbuvusega heave + pitch/roll sihtide poole ---
      // Väike vabaparras: kere istub veidi lainest kõrgemal
      const targetY = waterY + 0.1;
      const springAccel =
        (targetY - this.pos.y) * s.buoyStiffness - this.heaveVel * s.buoyDamping;
      this.heaveVel += springAccel * dt;
      this.pos.y += this.heaveVel * dt;

      // Ramp on jäik pind — vedru võib pehmendada ülalpool, aga mitte
      // lasta kerel tekist läbi vajuda
      if (onRamp && this.pos.y < waterY) {
        this.pos.y = waterY;
        this.heaveVel = Math.max(this.heaveVel, 0);
      }

      // Glisseerimine: kiirusega nina kergelt üles
      const planingPitch = speedRatio * 0.06 * (input.throttle > 0 ? 1 : 0.3);
      const targetPitch = Math.atan2(hBow - hStern, s.hullLength) + planingPitch;
      // Lained + kurvi sissepoole kaldumine (yawRate+ = vasakpööre → vasak külg alla)
      const rollMul = ability && s.id === "sportjett" ? 0.78 : 0.55;
      const targetRoll =
        Math.atan2(hLeft - hRight, s.hullWidth) - this.yawRate * speedRatio * rollMul;
      this.pitch = damp(this.pitch, targetPitch, 6, dt);
      this.roll = damp(this.roll, clamp(targetRoll, -0.5, 0.5), 5, dt);

      // Õhkutõus. Rambi ülaserv on deterministlik: kontakt kadus ja tõusu
      // on salvestatud → hüppa alati, sõltumata vedru hetkeseisust.
      // Laineharja-hüpped käivad endise läve kaudu.
      const leftRampEdge = this.wasOnRamp && !onRamp && this.climbRate > 1.2;
      if (leftRampEdge || (this.pos.y > waterY + 0.45 && (this.heaveVel > 1.5 || this.climbRate > 2))) {
        this.airborne = true;
        this.vel.y = clamp(Math.max(this.heaveVel, this.climbRate * 1.05), leftRampEdge ? 1.2 : 0, 9);
        this.climbRate = 0;
        this.onTakeoff();
      }
    } else {
      // --- Õhus ---
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      // Nina vajub aeglaselt alla
      this.pitch = damp(this.pitch, -0.25, 1.2, dt);
      this.roll = damp(this.roll, 0, 2, dt);

      if (this.pos.y <= waterY && this.vel.y < 0) {
        const impact = -this.vel.y;
        this.airborne = false;
        this.pos.y = waterY;
        this.heaveVel = this.vel.y * 0.3;
        this.vel.y = 0;
        // Maandumise pidurdus ∝ löök
        const slow = clamp(1 - impact * 0.022, 0.6, 1);
        this.vel.x *= slow;
        this.vel.z *= slow;
        this.onLanding(impact);
      }
    }

    // --- Boost (Ctrl) ---
    // Aktiivne ainult vees, edasigaasiga ja kui energiat jagub. Kulutab energiat;
    // taastub viivitusega peale lahtilaskmist.
    const wantsBoost = !!input.boost && !this.airborne && input.throttle > 0;
    const boostActive = wantsBoost && this.boostEnergy > 0;
    this.boosting = boostActive;
    if (boostActive) {
      this.boostEnergy = Math.max(0, this.boostEnergy - BOOST_DRAIN * dt);
      this.boostRefillDelay = BOOST_REFILL_DELAY;
    } else if (this.boostRefillDelay > 0) {
      this.boostRefillDelay -= dt;
    } else {
      this.boostEnergy = Math.min(1, this.boostEnergy + BOOST_REFILL * dt);
    }
    const boostMul = boostActive ? BOOST_ACCEL_MUL : 1;

    // --- Tõukejõud (õhus propeller ei tööta) ---
    const thrustScale = this.airborne ? 0 : 1;
    // Vöör laine sees → tõuge kärbub (tormis tuntav)
    const buried = clamp(1 + this.pitch * 2.2, 0.35, 1);
    const fwdAccel =
      input.throttle >= 0
        ? input.throttle * s.accel * buried * boostMul
        : input.throttle * s.accel * 0.45;
    this.vel.x += fx * fwdAccel * thrustScale * dt;
    this.vel.z += fz * fwdAccel * thrustScale * dt;

    // --- Takistus + grip (ainult XZ) ---
    const vx = this.vel.x, vz = this.vel.z;
    const fwdSpeed = vx * fx + vz * fz;
    const latSpeed = vx * rx + vz * rz;

    // Ruutkiirustakistus: terminal ≈ topSpeed
    let dragK = s.accel / (s.topSpeed * s.topSpeed);
    if (ability && s.id === "kaater" && input.throttle > 0) dragK *= 0.68;
    const newFwd = fwdSpeed - Math.sign(fwdSpeed) * dragK * fwdSpeed * fwdSpeed * dt
      - Math.sign(fwdSpeed) * 0.35 * dt; // lineaarne lisahõõre madalatel kiirustel
    // Külgtakistus = grip (slide lõikab gripi triivimiseks)
    let gripNow = this.airborne ? s.grip * 0.1 : s.grip;
    if (ability) {
      if (s.id === "sportjett") gripNow = s.grip * 0.11;
      else if (s.id === "jett") gripNow = s.grip * 1.45;
      else if (s.id === "kiirpaat") gripNow = s.grip * 1.25;
      else if (s.id === "kaater") gripNow = s.grip * 0.72;
      else if (s.id === "kalapaat") gripNow = s.grip * 1.15;
    }
    const newLat = latSpeed * Math.exp(-gripNow * 8 * dt);

    this.vel.x = fx * newFwd + rx * newLat;
    this.vel.z = fz * newFwd + rz * newLat;

    // --- Rool ---
    // NB: yaw+ pöörab forward-vektori +X poole, mis on tagantvaates VASAKULE,
    // seega parem (steer +1) = negatiivne yawRate.
    let steerAuthority = Math.sqrt(Math.max(speedRatio, 0.04)) * (this.airborne ? 0.15 : 1);
    if (ability) {
      if (s.id === "sportjett") steerAuthority *= 1.22;
      else if (s.id === "jett") steerAuthority *= 1.38;
      else if (s.id === "kiirpaat") steerAuthority *= 1.18;
      else if (s.id === "kaater") steerAuthority *= 0.72;
    }
    // Tagurdades peegeldub roolitunnetus nagu autol (ahter läheb klahvi suunas)
    const reversing = fwdSpeed < -0.5 ? -1 : 1;
    const targetYawRate = -input.steer * s.rudder * 1.15 * steerAuthority * reversing;
    this.yawRate = damp(this.yawRate, targetYawRate, 5.5, dt);
    this.yaw += this.yawRate * dt;

    // --- Hoovus ---
    if (!this.airborne) {
      this.vel.x += this.currentX * dt;
      this.vel.z += this.currentZ * dt;
    }

    // --- Integreeri ---
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    this.wasOnRamp = onRamp && !this.airborne;
  }

  /** Hetkeline tõuge/väljalükkamine kollisioonist (faas 4) */
  applyImpulse(nx: number, nz: number, push: number, restitution = 0.3): number {
    this.pos.x += nx * push;
    this.pos.z += nz * push;
    const vn = this.vel.x * nx + this.vel.z * nz;
    let impact = 0;
    if (vn < 0) {
      impact = -vn;
      const massSoften = (this.braceActive ? 0.45 : 1) / this.stats.mass;
      this.vel.x -= nx * vn * (1 + restitution);
      this.vel.z -= nz * vn * (1 + restitution);
      // Löök võtab hoogu maha (raske kere kaotab vähem)
      const slow = clamp(1 - impact * 0.03 * massSoften, this.braceActive ? 0.72 : 0.5, 1);
      this.vel.x *= slow;
      this.vel.z *= slow;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    return impact;
  }
}
