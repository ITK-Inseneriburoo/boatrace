import * as THREE from "three";
import type { TrackDef } from "@shared/tracks";
import type { WaveSet } from "@shared/waves";
import { mulberry32 } from "@shared/math";
import { Terrain } from "./Terrain";
import { BuoyField, type BuoyInstance } from "./props/Buoys";
import { buildRampMesh, rampSurfaceHeight, type RampInstance } from "./props/Ramp";
import { buildObstacleMeshes, type PlacedObstacle } from "./props/Obstacles";
import { buildVegetation } from "./props/Vegetation";
import { buildProp } from "./props/Harbor";
import { fitToBox, loadModel, wrapRotated } from "../core/Assets";
import type { ColliderSet } from "../sim/Collisions";

export interface Gate {
  index: number;
  center: THREE.Vector3;
  /** sõidusuund väravas (ühikvektor XZ) */
  dirX: number;
  dirZ: number;
  width: number;
  left: THREE.Vector2;
  right: THREE.Vector2;
}

/**
 * Ehitab rajadefinitsioonist maailma: maastik, väravad (poipaarid),
 * rambid, takistused, propid, kollisioonid, spawn-punktid.
 */
export class TrackWorld {
  readonly group = new THREE.Group();
  readonly terrain: Terrain;
  readonly gates: Gate[] = [];
  readonly colliders: ColliderSet = { circles: [], segments: [] };
  readonly ramps: RampInstance[] = [];
  readonly curve: THREE.CatmullRomCurve3;
  /** minimapi jaoks */
  readonly polyline: THREE.Vector2[] = [];

  private punaneField: BuoyField;
  private rohelineField: BuoyField;
  private startField: BuoyField;

  constructor(public def: TrackDef) {
    this.curve = new THREE.CatmullRomCurve3(
      def.route.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "catmullrom",
      0.5,
    );

    const SAMPLES = 512;
    for (let i = 0; i < SAMPLES; i++) {
      const p = this.curve.getPointAt(i / SAMPLES);
      this.polyline.push(new THREE.Vector2(p.x, p.z));
    }

    // Maastik
    this.terrain = new Terrain(def, this.polyline);
    this.group.add(this.terrain.mesh);

    // Väravad: stardijoon (t=0, ruuduline) + tavaväravad def-ist
    const punane: BuoyInstance[] = [];
    const roheline: BuoyInstance[] = [];
    const start: BuoyInstance[] = [];
    const rnd = mulberry32(def.seed + 1);

    const gateDefs = [{ t: 0, width: def.routeWidth + 4 }, ...def.gates];
    gateDefs.forEach((gd, index) => {
      const p = this.curve.getPointAt(gd.t);
      const tangent = this.curve.getTangentAt(gd.t).normalize();
      // Sõidusuunas vasakule: (+dirZ, -dirX); paremale: (-dirZ, +dirX)
      const nx = tangent.z, nz = -tangent.x;
      const w = gd.width ?? 22;
      const left = new THREE.Vector2(p.x + nx * (w / 2), p.z + nz * (w / 2));
      const right = new THREE.Vector2(p.x - nx * (w / 2), p.z - nz * (w / 2));
      this.gates.push({
        index,
        center: p.clone(),
        dirX: tangent.x,
        dirZ: tangent.z,
        width: w,
        left,
        right,
      });
      if (index === 0) {
        start.push({ x: left.x, z: left.y, phase: rnd() * 6, gateIndex: 0 });
        start.push({ x: right.x, z: right.y, phase: rnd() * 6, gateIndex: 0 });
      } else {
        // Meresõidu loogika: punane vasakul, roheline paremal
        punane.push({ x: left.x, z: left.y, phase: rnd() * 6, gateIndex: index });
        roheline.push({ x: right.x, z: right.y, phase: rnd() * 6, gateIndex: index });
      }
      // Poid pehmete takistustena
      this.colliders.circles.push({ x: left.x, z: left.y, r: 0.7, soft: true });
      this.colliders.circles.push({ x: right.x, z: right.y, r: 0.7, soft: true });
    });

    this.punaneField = new BuoyField(punane, 0xd7263d, 0xff7a8a);
    this.rohelineField = new BuoyField(roheline, 0x1b9e4b, 0x7dffab);
    this.startField = new BuoyField(start, 0xf2f2f2, 0xfff8c4);
    this.group.add(this.punaneField.mesh, this.rohelineField.mesh, this.startField.mesh);

    // Finišikaar stardijoonele (Kenney gate-finish, kui saadaval)
    const g0 = this.gates[0];
    void loadModel("gate-finish").then((m) => {
      if (!m) return;
      // Kaare ava peab jääma risti sõidusuunaga: pikem horisontaaltelg = sild
      const box = new THREE.Box3().setFromObject(m);
      const dims = new THREE.Vector3();
      box.getSize(dims);
      const spanRot = dims.z > dims.x ? Math.PI / 2 : 0;
      const wrapped = wrapRotated(m, spanRot);
      // Lai värav ühtlase skaalaga veniks 20m kõrguseks — piira kõrgus
      fitToBox(wrapped, g0.width * 1.05, 7.5, 2.6);
      wrapped.position.y -= 0.25;
      const place = new THREE.Group();
      place.add(wrapped);
      place.position.set(g0.center.x, 0, g0.center.z);
      place.rotation.y = Math.atan2(g0.dirX, g0.dirZ);
      this.group.add(place);
    });

    // Rambid
    for (const rd of def.ramps) {
      const p = this.curve.getPointAt(rd.t);
      const tangent = this.curve.getTangentAt(rd.t).normalize();
      const nx = tangent.z, nz = -tangent.x;
      const inst: RampInstance = {
        x: p.x + nx * rd.offset,
        z: p.z + nz * rd.offset,
        dirX: tangent.x,
        dirZ: tangent.z,
        width: rd.width ?? 7,
        length: rd.length ?? 13,
        height: rd.height ?? 2.2,
      };
      this.ramps.push(inst);
      this.group.add(buildRampMesh(inst));
    }

    // Takistused
    const placed: PlacedObstacle[] = def.obstacles.map((o) => {
      const p = this.curve.getPointAt(o.t);
      const tangent = this.curve.getTangentAt(o.t).normalize();
      const nx = tangent.z, nz = -tangent.x;
      const scale = o.scale ?? 1;
      const x = p.x + nx * o.offset;
      const z = p.z + nz * o.offset;
      const r = o.kind === "kivi" ? 1.6 * scale : 2.6 * scale;
      this.colliders.circles.push({ x, z, r });
      return { kind: o.kind, x, z, scale, rot: rnd() * Math.PI * 2, r };
    });
    this.group.add(buildObstacleMeshes(placed, def.seed));

    // Puud + propid
    this.group.add(buildVegetation(def, this.terrain));
    def.props.forEach((pd, i) => {
      this.group.add(buildProp(pd, this.colliders, def.seed + i * 17));
    });
  }

  /** Rambipind füüsika overrideks */
  surfaceOverride = (x: number, z: number): number => {
    let best = -Infinity;
    for (const r of this.ramps) {
      const h = rampSurfaceHeight(r, x, z);
      if (h > best) best = h;
    }
    return best;
  };

  /** Stardikoht n-ndale mängijale (rivi stardijoone taga) */
  spawnPoint(slot: number): { x: number; z: number; yaw: number } {
    const gate = this.gates[0];
    const back = 12 + Math.floor(slot / 2) * 9;
    const side = (slot % 2 === 0 ? -1 : 1) * (gate.width / 5) * (1 + Math.floor(slot / 4));
    const nx = gate.dirZ, nz = -gate.dirX;
    return {
      x: gate.center.x - gate.dirX * back + nx * side,
      z: gate.center.z - gate.dirZ * back + nz * side,
      yaw: Math.atan2(gate.dirX, gate.dirZ),
    };
  }

  /** Lähima splainipunkti tangent (vale suuna tuvastuseks) */
  nearestTangent(x: number, z: number): [number, number] {
    let bestD = Infinity, bestI = 0;
    for (let i = 0; i < this.polyline.length; i += 4) {
      const p = this.polyline[i];
      const d = (p.x - x) * (p.x - x) + (p.y - z) * (p.y - z);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const a = this.polyline[bestI];
    const b = this.polyline[(bestI + 4) % this.polyline.length];
    const dx = b.x - a.x, dz = b.y - a.y;
    const len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  }

  update(waves: WaveSet, time: number, nextGate: number): void {
    this.punaneField.update(waves, time, nextGate);
    this.rohelineField.update(waves, time, nextGate);
    this.startField.update(waves, time, nextGate === 0 ? 0 : -1);
  }
}
