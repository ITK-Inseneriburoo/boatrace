import * as THREE from "three";
import type { TrackDef } from "@shared/tracks";
import { clamp, fbm2, smoothstep } from "@shared/math";
import { loadPbrSet } from "../core/Textures";
import { currentTier } from "../core/Quality";
import { installSplat, type SplatOptions } from "./materials/terrainSplat";

const GRID = 256;

/** Vaikepalett — paleti tint splatis = raja palett / vaikeväärtus */
const DEF_SAND = 0xcbb389, DEF_GRASS = 0x4a7440, DEF_ROCK = 0x7d7a72;

function tintOf(color: number, def: number): THREE.Color {
  const c = new THREE.Color(color), d = new THREE.Color(def);
  return new THREE.Color(
    clamp(c.r / Math.max(d.r, 1e-3), 0, 2),
    clamp(c.g / Math.max(d.g, 1e-3), 0, 2),
    clamp(c.b / Math.max(d.b, 1e-3), 0, 2),
  );
}

/**
 * Deterministlik maastik: saarte radiaalkühmud + fBm müra,
 * millest süvendatakse rajasplaini äärde alati sõidetav kanal.
 * Sama seemnega tuleb kõigil klientidel identne maastik.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  /** kõrguskaart ookeanishaderi madalike/kaldavahu jaoks */
  readonly depthTexture: THREE.DataTexture;
  readonly size: number;

  private heights: Float32Array;
  private cell: number;

  constructor(track: TrackDef, routePolyline: THREE.Vector2[]) {
    const t = track.terrain;
    this.size = t.size;
    this.cell = t.size / (GRID - 1);
    this.heights = new Float32Array(GRID * GRID);

    // --- 1. Kõrgused ---
    for (let iz = 0; iz < GRID; iz++) {
      for (let ix = 0; ix < GRID; ix++) {
        const x = -t.size / 2 + ix * this.cell;
        const z = -t.size / 2 + iz * this.cell;

        let h = -t.baseDepth;
        let islandMask = 0;
        let plateau = 0;
        let flatMask = 0;
        for (const isl of t.islands) {
          const d = Math.hypot(x - isl.x, z - isl.z) / isl.r;
          if (isl.flat) {
            // Kaiplatvorm: tasane lagi, järsk sein. Max-liide, et
            // kattuvad platvormid ei kuhjuks künkaks. w+d annab
            // ristkülikukujulise kai, muidu ümar platvorm.
            const EDGE = 12; // seina laius meetrites (lagi -> merepõhi)
            let dist: number;
            if (isl.w && isl.d) {
              const c = Math.cos(isl.rot ?? 0), s = Math.sin(isl.rot ?? 0);
              const lx = c * (x - isl.x) + s * (z - isl.z);
              const lz = -s * (x - isl.x) + c * (z - isl.z);
              dist = Math.hypot(
                Math.max(0, Math.abs(lx) - isl.w / 2),
                Math.max(0, Math.abs(lz) - isl.d / 2),
              );
            } else {
              dist = Math.max(0, d * isl.r - isl.r * 0.7);
            }
            if (dist < EDGE) {
              const bump = smoothstep(EDGE, 0, dist);
              plateau = Math.max(plateau, (isl.h + t.baseDepth) * bump);
              flatMask = Math.max(flatMask, bump);
            }
          } else if (d < 1.6) {
            const bump = Math.pow(Math.max(0, 1 - d * d * 0.62), 1.6);
            h += (isl.h + t.baseDepth) * bump;
            islandMask = Math.max(islandMask, bump);
          }
        }
        h = Math.max(h, -t.baseDepth + plateau);
        // Müra ainult saarte lähedal (meri jääb siledaks, platvormid lamedaks)
        const n = fbm2(x * t.noiseScale, z * t.noiseScale, 4, track.seed);
        h += (n - 0.45) * t.noiseAmp * islandMask * (1 - flatMask);

        this.heights[iz * GRID + ix] = h;
      }
    }

    // --- 2. Kanali süvendamine splaini äärde ---
    // Iga rastripunkti kaugus lähimast polyline-lõigust
    for (let iz = 0; iz < GRID; iz++) {
      for (let ix = 0; ix < GRID; ix++) {
        const x = -t.size / 2 + ix * this.cell;
        const z = -t.size / 2 + iz * this.cell;
        const d = distToPolyline(x, z, routePolyline);
        if (d < t.carveWidth) {
          const k = smoothstep(t.carveWidth, t.carveWidth * 0.55, d); // 1 keskel
          const i = iz * GRID + ix;
          const carved = -5.5;
          this.heights[i] = Math.min(
            this.heights[i],
            carved * k + this.heights[i] * (1 - k),
          );
          // Kanali keskel garanteeritult sügav
          if (d < t.carveWidth * 0.55) this.heights[i] = Math.min(this.heights[i], carved);
        }
      }
    }

    // --- 3. Mesh vertex-värvidega (liiv/rohi/kalju) ---
    const geo = new THREE.PlaneGeometry(t.size, t.size, GRID - 1, GRID - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const pal = track.palette;
    const sand = new THREE.Color(pal?.sand ?? 0xcbb389);
    const grass = new THREE.Color(pal?.grass ?? 0x4a7440);
    const rock = new THREE.Color(pal?.rock ?? 0x7d7a72);
    const snow = new THREE.Color(0xeef2f5);
    const snowAbove = pal?.snowAbove ?? Infinity;
    const dark = new THREE.Color(0x2b3c38); // veealune

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);

      const c = new THREE.Color();
      if (h < -0.4) c.copy(dark);
      else if (h < 0.9) c.copy(sand);
      else if (h < 5.5) c.copy(grass).lerp(sand, clamp(1 - (h - 0.9) / 1.4, 0, 1) * 0.7);
      else c.copy(rock).lerp(grass, clamp(1 - (h - 5.5) / 2.5, 0, 1));
      // Lumemütsid (fjord)
      if (h > snowAbove) {
        c.lerp(snow, clamp((h - snowAbove) / 4, 0, 1));
      }
      // Kerge variatsioon (tehiskate on ühtlasem — asfalt ei laigu nagu loodus)
      const vAmp = pal?.kunstkate ? 0.05 : 0.16;
      const v = fbm2(x * 0.05, z * 0.05, 2, track.seed + 7) * vAmp;
      c.offsetHSL(0, 0, v - vAmp / 2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;

    // PBR-splat saabub asünkroonselt: vertex-värvid kirjutatakse üle
    // heleduse-variatsiooni tindiks ja shader arvutab kihid ise.
    // 404 → jääb praegune vertex-värvi välimus.
    void this.installSplatAsync(geo, mat, track);

    // --- 4. Sügavustekstuur ookeanile (r = normaliseeritud kõrgus) ---
    const texData = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      texData[i] = this.heights[i];
    }
    this.depthTexture = new THREE.DataTexture(
      texData,
      GRID,
      GRID,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.depthTexture.minFilter = THREE.LinearFilter;
    this.depthTexture.magFilter = THREE.LinearFilter;
    this.depthTexture.needsUpdate = true;
  }

  private splatOpts: SplatOptions | null = null;
  private splatMat: THREE.MeshStandardMaterial | null = null;

  private async installSplatAsync(
    geo: THREE.BufferGeometry,
    mat: THREE.MeshStandardMaterial,
    track: TrackDef,
  ): Promise<void> {
    // Tehiskattega (asfalt/betoon) rajad jäävad vertex-värvidele —
    // loodustekstuurid muudaks kaid liivarannaks
    if (track.palette?.kunstkate) return;
    const [sand, grass, rock] = await Promise.all([
      loadPbrSet("/textures/terrain/sand"),
      loadPbrSet("/textures/terrain/grass"),
      loadPbrSet("/textures/terrain/rock"),
    ]);
    if (!sand || !grass || !rock) return;

    // Vertex-värvid → ainult heleduse variatsioon (shader teeb kihivärvid).
    // Amplituud hoitakse väike — 256-võrgu vertex-interpolatsioon joonistus
    // tugevama variatsiooniga ruudustikuna välja
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const v = fbm2(pos.getX(i) * 0.05, pos.getZ(i) * 0.05, 2, track.seed + 7) * 0.08;
      const tint = 1 + (v - 0.04);
      col.setXYZ(i, tint, tint, tint);
    }
    col.needsUpdate = true;

    const pal = track.palette;
    this.splatOpts = {
      sand,
      grass,
      rock,
      sandTint: tintOf(pal?.sand ?? DEF_SAND, DEF_SAND),
      grassTint: tintOf(pal?.grass ?? DEF_GRASS, DEF_GRASS),
      rockTint: tintOf(pal?.rock ?? DEF_ROCK, DEF_ROCK),
      snowColor: new THREE.Color(0xeef2f5),
      snowAbove: pal?.snowAbove ?? Infinity,
      underwaterColor: new THREE.Color(0x2b3c38),
      texScale: 1 / 6,
      detailNormals: currentTier.terrainNormals,
    };
    this.splatMat = mat;
    installSplat(mat, this.splatOpts);
  }

  /** Astmevahetus: normal-mapid sisse/välja (shader kompileerub ümber) */
  setDetailNormals(enabled: boolean): void {
    if (!this.splatOpts || !this.splatMat) return;
    if (this.splatOpts.detailNormals === enabled) return;
    this.splatOpts.detailNormals = enabled;
    installSplat(this.splatMat, this.splatOpts);
  }

  /** Bilineaarne kõrgusproov maailmakoordinaatides */
  getHeight(x: number, z: number): number {
    const fx = (x + this.size / 2) / this.cell;
    const fz = (z + this.size / 2) / this.cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= GRID - 1 || iz >= GRID - 1) return -30;
    const tx = fx - ix, tz = fz - iz;
    const h00 = this.heights[iz * GRID + ix];
    const h10 = this.heights[iz * GRID + ix + 1];
    const h01 = this.heights[(iz + 1) * GRID + ix];
    const h11 = this.heights[(iz + 1) * GRID + ix + 1];
    return (
      h00 * (1 - tx) * (1 - tz) +
      h10 * tx * (1 - tz) +
      h01 * (1 - tx) * tz +
      h11 * tx * tz
    );
  }

  /** Kõrgusgradient (normaali XZ-suund kollisiooni väljalükkeks) */
  getGradient(x: number, z: number): [number, number] {
    const e = this.cell;
    const gx = (this.getHeight(x + e, z) - this.getHeight(x - e, z)) / (2 * e);
    const gz = (this.getHeight(x, z + e) - this.getHeight(x, z - e)) / (2 * e);
    return [gx, gz];
  }
}

function distToPolyline(x: number, z: number, line: THREE.Vector2[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[(i + 1) % line.length];
    const abx = b.x - a.x, abz = b.y - a.y;
    const apx = x - a.x, apz = z - a.y;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? clamp((apx * abx + apz * abz) / len2, 0, 1) : 0;
    const dx = apx - abx * t, dz = apz - abz * t;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
