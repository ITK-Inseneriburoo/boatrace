import * as THREE from "three";
import type { StatePayload } from "@shared/protocol";
import type { VehicleId } from "@shared/types";
import { INTERP_DELAY_MS, MAX_EXTRAPOLATION_MS } from "@shared/constants";
import { angleLerp, lerp } from "@shared/math";
import { VEHICLES } from "@shared/vehicles";
import { buildBoatModel } from "../boats/BoatFactory";

interface Snapshot {
  t: number;
  p: [number, number, number];
  r: [number, number, number];
  v: [number, number];
  s: number;
}

interface PlayerMarker {
  group: THREE.Group;
  labelMaterial: THREE.SpriteMaterial;
  ringMaterial: THREE.MeshBasicMaterial;
  dispose(): void;
}

function colorCss(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Kaamerasse pöörduv nimesilt + veepinna lähedal olev mängijavärvi rõngas. */
function buildPlayerMarker(name: string, color: number, ringRadius: number): PlayerMarker {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Tume taust hoiab valge teksti loetavana nii taeva, vahu kui ka maastiku ees.
  const left = 8;
  const top = 8;
  const right = canvas.width - 8;
  const bottom = canvas.height - 18;
  const radius = 26;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.quadraticCurveTo(right, top, right, top + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(left + radius, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fillStyle = "rgba(4, 16, 22, 0.82)";
  ctx.fill();
  ctx.strokeStyle = colorCss(color);
  ctx.lineWidth = 9;
  ctx.stroke();

  ctx.font = "700 54px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.lineWidth = 8;
  ctx.strokeText(name, canvas.width / 2, 61, 450);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, canvas.width / 2, 61, 450);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const labelMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.y = 3.1;
  label.scale.set(4.8, 1.2, 1);
  label.renderOrder = 100;

  const ringGeometry = new THREE.RingGeometry(ringRadius - 0.16, ringRadius + 0.16, 48);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.18;
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;

  const group = new THREE.Group();
  group.add(label, ring);
  return {
    group,
    labelMaterial,
    ringMaterial,
    dispose: () => {
      texture.dispose();
      labelMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
    },
  };
}

/**
 * Kaugmängija paat: snapshot-puhver + renderdus INTERP_DELAY_MS minevikus.
 * Puuduvate snapshotide korral ekstrapoleerib kuni MAX_EXTRAPOLATION_MS,
 * seejärel külmub ja muutub kummituseks (poolläbipaistev).
 */
export class RemoteBoat {
  readonly mesh: THREE.Group;
  /** viimane teadaolev kiirus m/s (heli/efektide jaoks) */
  speed = 0;
  x = 0;
  z = 0;
  yaw = 0;

  private buffer: Snapshot[] = [];
  private ghost = false;
  private materials: THREE.Material[] = [];
  private readonly boatModel: THREE.Group;
  private readonly marker: PlayerMarker;

  constructor(
    public readonly playerId: string,
    public readonly vehicle: VehicleId,
    name: string,
    color: number,
  ) {
    this.mesh = new THREE.Group();
    this.boatModel = buildBoatModel(vehicle, color);
    this.marker = buildPlayerMarker(name, color, VEHICLES[vehicle].hullRadius + 0.65);
    this.mesh.add(this.boatModel, this.marker.group);
    this.collectMaterials();
    // GLB-vahetus toob uued materjalid — kogu uuesti ja taasta läbipaistvus
    this.boatModel.userData.onModelSwapped = () => {
      this.collectMaterials();
      const g = this.ghost;
      this.ghost = !g; // sunni setGhost uuesti rakendama
      this.setGhost(g);
    };
  }

  private collectMaterials(): void {
    this.materials = [];
    this.boatModel.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        this.materials.push(...mats);
      }
    });
  }

  push(st: number, payload: StatePayload): void {
    // Hoia puhver ajalises järjekorras; viska liiga vanad ära
    this.buffer.push({ t: st, p: payload.p, r: payload.r, v: payload.v, s: payload.s });
    if (this.buffer.length > 40) this.buffer.splice(0, this.buffer.length - 40);
  }

  /** @param serverNow serveri kellaaeg praegu (NetClient.serverNow()) */
  update(serverNow: number): void {
    const renderTime = serverNow - INTERP_DELAY_MS;
    const buf = this.buffer;
    if (buf.length === 0) return;

    let a: Snapshot | null = null;
    let b: Snapshot | null = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= renderTime) {
        a = buf[i];
        b = buf[i + 1] ?? null;
        break;
      }
    }

    let p: [number, number, number];
    let r: [number, number, number];
    let stale = false;

    if (a && b) {
      const k = (renderTime - a.t) / Math.max(b.t - a.t, 1);
      p = [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)];
      r = [
        angleLerp(a.r[0], b.r[0], k),
        angleLerp(a.r[1], b.r[1], k),
        angleLerp(a.r[2], b.r[2], k),
      ];
      this.speed = lerp(a.s, b.s, k);
    } else if (a) {
      // Uusim snapshot on minevikus → ekstrapoleeri veidi
      const over = Math.min(renderTime - a.t, MAX_EXTRAPOLATION_MS);
      const dt = over / 1000;
      p = [a.p[0] + a.v[0] * dt, a.p[1], a.p[2] + a.v[1] * dt];
      r = a.r;
      this.speed = a.s;
      stale = renderTime - a.t > MAX_EXTRAPOLATION_MS + 1500;
    } else {
      // Kõik snapshotid tulevikus (just liitusime) — võta esimene
      p = buf[0].p;
      r = buf[0].r;
      this.speed = buf[0].s;
    }

    this.mesh.position.set(p[0], p[1], p[2]);
    this.mesh.rotation.set(-r[1], r[0], -r[2], "YXZ");
    this.x = p[0];
    this.z = p[2];
    this.yaw = r[0];
    this.setGhost(stale);
  }

  private setGhost(on: boolean): void {
    if (on === this.ghost) return;
    this.ghost = on;
    for (const m of this.materials) {
      m.transparent = on;
      m.opacity = on ? 0.35 : 1;
      m.needsUpdate = true;
    }
    this.marker.labelMaterial.opacity = on ? 0.35 : 1;
    this.marker.ringMaterial.opacity = on ? 0.2 : 0.72;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.marker.dispose();
  }
}
