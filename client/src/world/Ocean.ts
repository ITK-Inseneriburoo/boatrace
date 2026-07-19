import * as THREE from "three";
import type { WaveSet } from "@shared/waves";
import type { WeatherPreset } from "./WeatherPresets";
import { loadTexture } from "../core/Textures";
import vertSrc from "./ocean.vert.glsl?raw";
import fragSrc from "./ocean.frag.glsl?raw";

const NEAR_SIZE = 600;
const NEAR_SEGS = 220;
const FAR_OUTER = 3500;

/** Perioodiline RGBA müratekstuur (tile'ib sujuvalt) */
function makeNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  // 3 sõltumatut kihti (r,g,b) perioodilise lattemüraga
  const layer = (x: number, y: number, period: number, seed: number): number => {
    const gx = (x / size) * period;
    const gy = (y / size) * period;
    const xi = Math.floor(gx), yi = Math.floor(gy);
    const xf = gx - xi, yf = gy - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const h = (ix: number, iy: number): number => {
      let a = seed ^ Math.imul((ix % period + period) % period, 374761393) ^
        Math.imul((iy % period + period) % period, 668265263);
      a = Math.imul(a ^ (a >>> 13), 1274126177);
      return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
    };
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // fBm 3 oktaavi kanali kohta — peeneteraline, et peegeldus ei läheks laiguliseks
      let r = 0, g = 0, b = 0, amp = 0.5, per = 16;
      for (let o = 0; o < 3; o++) {
        r += layer(x, y, per, 11) * amp;
        g += layer(x, y, per, 47) * amp;
        b += layer(x, y, per * 2, 83) * amp;
        amp *= 0.5;
        per *= 2;
      }
      data[i] = Math.round(r * 255 * 1.14);
      data[i + 1] = Math.round(g * 255 * 1.14);
      data[i + 2] = Math.round(b * 255 * 1.14);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export interface OceanTierCfg {
  foamTex: boolean;
  shoreAlpha: boolean;
}

export class Ocean {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly ready: Promise<void>;
  private nearMesh: THREE.Mesh;
  private cellSize = NEAR_SIZE / NEAR_SEGS;
  private foamTex: THREE.Texture | null = null;
  private tierCfg: OceanTierCfg = { foamTex: true, shoreAlpha: true };

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uWaveA: { value: [...Array(4)].map(() => new THREE.Vector4(1, 0, 0, 10)) },
          uWaveB: { value: [...Array(4)].map(() => new THREE.Vector4(0, 1, 0, 0)) },
          uCamPos: { value: new THREE.Vector3() },
          uFadeStart: { value: 230 },
          uFadeEnd: { value: 290 },
          uEnvMap: { value: null },
          uNoiseTex: { value: makeNoiseTexture() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color(0xffffff) },
          uSunBoost: { value: 6.0 },
          uWaterDeep: { value: new THREE.Color(0x0e3d54) },
          uWaterShallow: { value: new THREE.Color(0x35b6ac) },
          uFoamLevel: { value: 0.7 },
          uAbsorb: { value: 0.5 },
          uFoamTex: { value: null },
          uDepthTex: { value: null },
          uHasDepthTex: { value: 0 },
          uDepthRect: { value: new THREE.Vector4(0, 0, 1, 1) },
          uDepthScale: { value: 1 },
          uDepthOffset: { value: 0 },
          uWakeTex: { value: null },
          uHasWakeTex: { value: 0 },
          uWakeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
          uPlanarTex: { value: null },
          uPlanarMatrix: { value: new THREE.Matrix4() },
          uPlanarDistort: { value: 0.055 },
        },
      ]),
    });

    const nearGeo = new THREE.PlaneGeometry(NEAR_SIZE, NEAR_SIZE, NEAR_SEGS, NEAR_SEGS);
    nearGeo.rotateX(-Math.PI / 2);
    this.nearMesh = new THREE.Mesh(nearGeo, this.material);
    this.nearMesh.frustumCulled = false;
    // Läbipaistvana (SHORE_ALPHA) peab vesi renderduma enne partikleid
    this.nearMesh.renderOrder = -1;
    this.group.add(this.nearMesh);

    // Vahutekstuur (valikuline — 404 korral jääb ühtlane vahuvärv)
    this.ready = loadTexture("/textures/water/foam_1k_color.webp", true).then((tex) => {
      if (!tex) return;
      this.foamTex = tex;
      this.material.uniforms.uFoamTex.value = tex;
      this.applyTier(this.tierCfg);
    });

    // Horisondirõngas — amplituud kustub kaugusega nagunii nulli.
    // Veidi allpool, et mitte z-fightida lähivõrgu nurkadega.
    const farGeo = new THREE.RingGeometry(NEAR_SIZE / 2 - 20, FAR_OUTER, 48, 6);
    farGeo.rotateX(-Math.PI / 2);
    farGeo.translate(0, -0.12, 0);
    const farMesh = new THREE.Mesh(farGeo, this.material);
    farMesh.frustumCulled = false;
    this.nearMesh.add(farMesh);
  }

  /** Graafikaastme lisad: vahutekstuur ja kalda-läbipaistvus (defines) */
  applyTier(cfg: OceanTierCfg): void {
    this.tierCfg = cfg;
    this.rebuildDefines();
  }

  /**
   * Planar-peegelduse tekstuur (null = tagasi ainult kuubikule).
   * Maatriksit uuendatakse viitena — PlanarReflection kirjutab sama objekti.
   */
  setPlanar(tex: THREE.Texture | null, matrix?: THREE.Matrix4): void {
    this.material.uniforms.uPlanarTex.value = tex;
    if (matrix) this.material.uniforms.uPlanarMatrix.value = matrix;
    this.planarOn = !!tex;
    this.rebuildDefines();
  }

  private planarOn = false;

  private rebuildDefines(): void {
    const cfg = this.tierCfg;
    const defines: Record<string, string> = {};
    if (cfg.foamTex && this.foamTex) defines.USE_FOAM_TEX = "";
    if (cfg.shoreAlpha) defines.SHORE_ALPHA = "";
    if (this.planarOn) defines.USE_PLANAR = "";
    this.material.defines = defines;
    this.material.transparent = cfg.shoreAlpha;
    this.material.needsUpdate = true;
  }

  applyWeather(p: WeatherPreset): void {
    this.setWaves(p.waves);
    const u = this.material.uniforms;
    (u.uWaterDeep.value as THREE.Color).set(p.waterDeep);
    (u.uWaterShallow.value as THREE.Color).set(p.waterShallow);
    u.uFoamLevel.value = p.foamLevel;
    (u.uSunColor.value as THREE.Color).set(p.sunColor);
    u.uSunBoost.value = p.sunBoost ?? 6.0;
  }

  setWaves(waves: WaveSet): void {
    const a = this.material.uniforms.uWaveA.value as THREE.Vector4[];
    const b = this.material.uniforms.uWaveB.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) {
      const w = waves[i];
      a[i].set(w.dirX, w.dirZ, w.amplitude, w.wavelength);
      b[i].set(w.steepness, w.speed, 0, 0);
    }
  }

  setEnvironment(envCube: THREE.CubeTexture, sunDir: THREE.Vector3): void {
    this.material.uniforms.uEnvMap.value = envCube;
    (this.material.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
  }

  setDepthTexture(tex: THREE.Texture, minX: number, minZ: number, sizeX: number, sizeZ: number, scale: number, offset: number): void {
    const u = this.material.uniforms;
    u.uDepthTex.value = tex;
    u.uHasDepthTex.value = 1;
    (u.uDepthRect.value as THREE.Vector4).set(minX, minZ, 1 / sizeX, 1 / sizeZ);
    u.uDepthScale.value = scale;
    u.uDepthOffset.value = offset;
  }

  setWakeTexture(tex: THREE.Texture | null, minX = 0, minZ = 0, sizeX = 1, sizeZ = 1): void {
    const u = this.material.uniforms;
    u.uWakeTex.value = tex;
    u.uHasWakeTex.value = tex ? 1 : 0;
    (u.uWakeRect.value as THREE.Vector4).set(minX, minZ, 1 / sizeX, 1 / sizeZ);
  }

  /** Kutsu igal kaadril: liigutab võrku kaameraga kaasa (raster-snap) ja uuendab aega */
  update(time: number, camPos: THREE.Vector3): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    (u.uCamPos.value as THREE.Vector3).copy(camPos);
    const s = this.cellSize;
    this.nearMesh.position.set(Math.round(camPos.x / s) * s, 0, Math.round(camPos.z / s) * s);
  }
}
