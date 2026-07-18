import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import type { WeatherPreset } from "./WeatherPresets";
import type { Engine } from "../core/Engine";
import { getTextureRes } from "../core/Textures";

const rgbeLoader = new RGBELoader();
const hdriCache = new Map<string, Promise<THREE.DataTexture | null>>();

/** Lae HDRI eelistatud resolutsioonis, 2k puudumisel 1k; viga → null */
function loadHdri(base: string): Promise<THREE.DataTexture | null> {
  const res = getTextureRes();
  const key = `${base}@${res}`;
  let p = hdriCache.get(key);
  if (!p) {
    p = rgbeLoader
      .loadAsync(`${base}_${res}.hdr`)
      .catch(() => (res === "2k" ? rgbeLoader.loadAsync(`${base}_1k.hdr`) : Promise.reject()))
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        return tex;
      })
      .catch(() => null);
    hdriCache.set(key, p);
  }
  return p;
}

/**
 * Taevas + päike + valgustus + udu ühe ilmapreseti kaupa.
 * Preseti rakendamisel renderdatakse taevas:
 *  - PMREM-ina scene.environment'iks (PBR-materjalide peegeldused)
 *  - CubeRenderTarget'ina ookeanishaderi envMap'iks
 */
export class SkySystem {
  readonly sky = new Sky();
  readonly sunLight = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.5);
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  /** Ookeanishaderi peegelduskuubik */
  envCube: THREE.CubeTexture | null = null;

  private cubeTarget: THREE.WebGLCubeRenderTarget;
  private cubeCamera: THREE.CubeCamera;
  private captureScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lightningLight = new THREE.DirectionalLight(0xe8f2ff, 0);
  private lightningTimer = 0;
  private lightningActive = 0;
  preset: WeatherPreset | null = null;
  /** Kutsutakse välgusähvatuse hetkel (heli jaoks, kaugus sekundites kõuemüristamiseni) */
  onLightning: (delaySec: number) => void = () => {};

  constructor(private engine: Engine) {
    this.sky.scale.setScalar(3000);
    engine.scene.add(this.sky);
    engine.scene.add(this.sunLight);
    engine.scene.add(this.hemiLight);
    engine.scene.add(this.lightningLight);
    this.lightningLight.position.set(200, 300, -100);

    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.bias = -0.0004;
    const s = 70;
    const cam = this.sunLight.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;

    this.cubeTarget = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(1, 5000, this.cubeTarget);
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
  }

  /** Kaitseb hilinenud HDRI-laadimise eest pärast preseti vahetust */
  private presetToken = 0;

  applyPreset(p: WeatherPreset): void {
    this.preset = p;
    const token = ++this.presetToken;
    // Alati kõigepealt protseduuriline taevas (HDRI on async täiendus)
    this.sky.visible = true;
    this.engine.scene.background = null;
    const u = this.sky.material.uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    u.mieCoefficient.value = p.mieCoefficient;
    u.mieDirectionalG.value = p.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - p.sunElevation);
    const theta = THREE.MathUtils.degToRad(p.sunAzimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);

    this.sunLight.position.copy(this.sunDir).multiplyScalar(300);
    this.sunLight.color.set(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;
    this.hemiLight.color.set(p.hemiSkyColor);
    this.hemiLight.groundColor.set(p.hemiGroundColor);
    this.hemiLight.intensity = p.hemiIntensity;

    this.engine.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);
    this.engine.renderer.toneMappingExposure = p.exposure;

    this.captureSky();
    this.lightningTimer = 4 + Math.random() * 8;

    if (p.hdri) {
      void loadHdri(p.hdri).then((tex) => {
        if (!tex || token !== this.presetToken) return;
        this.applyHdri(p, tex);
      });
    }
  }

  /** Vaheta protseduuriline taevas laetud HDRI vastu (taust + IBL + ookeanikuubik) */
  private applyHdri(p: WeatherPreset, tex: THREE.DataTexture): void {
    const { scene } = this.engine;
    this.sky.visible = false;
    scene.background = tex;
    // IBL annab ambient'i — hemi jääb vaid sosinaks varjukülgede jaoks
    this.hemiLight.intensity = p.hdriHemiIntensity ?? 0.15;

    this.envRT?.dispose();
    this.envRT = this.pmrem.fromEquirectangular(tex);
    scene.environment = this.envRT.texture;

    // Ookeani kuubik: sama cube-capture, ainult taustaks on equirect-HDRI.
    // NB: PMREM-tekstuuri EI tohi ookeani uEnvMap'i anda (pole tavaline cubemap).
    this.captureScene.background = tex;
    this.cubeCamera.update(this.engine.renderer, this.captureScene);
    this.captureScene.background = null;
    this.envCube = this.cubeTarget.texture;
  }

  /** Renderda taevas cube- ja PMREM-tekstuuriks (ainult preseti vahetusel) */
  private captureSky(): void {
    const { renderer, scene } = this.engine;
    // Tõsta taevas ajutiselt eraldi stseeni, et püüda AINULT taevast
    this.captureScene.add(this.sky);
    this.cubeCamera.update(renderer, this.captureScene);
    this.envCube = this.cubeTarget.texture;

    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.captureScene, 0.02);
    scene.environment = this.envRT.texture;
    scene.add(this.sky); // tagasi põhistseeni
  }

  /** Rakenda varjude ast: castShadow + map'i resolutsioon (vana map visatakse ära) */
  applyShadowTier(enabled: boolean, res: number): void {
    this.shadowRes = res;
    this.sunLight.castShadow = enabled;
    this.sunLight.shadow.mapSize.set(res, res);
    this.sunLight.shadow.map?.dispose();
    this.sunLight.shadow.map = null;
  }

  private shadowRes = 2048;

  /** Varjukaamera järgib mängijat (texel-snap, et varjud ei väreleks) */
  followTarget(pos: THREE.Vector3): void {
    // Texel-suurus PEAB vastama tegelikule map'i resolutsioonile,
    // muidu snap toimub vales sammus ja varjud värelevad (nt 4096 map'iga)
    const texelSize = 140 / this.shadowRes;
    const x = Math.round(pos.x / texelSize) * texelSize;
    const z = Math.round(pos.z / texelSize) * texelSize;
    this.sunLight.position.set(x, 0, z).addScaledVector(this.sunDir, 300);
    this.sunLight.target.position.set(x, 0, z);
    this.sunLight.target.updateMatrixWorld();
  }

  update(dt: number): void {
    const p = this.preset;
    if (!p?.lightning) return;
    if (this.lightningActive > 0) {
      this.lightningActive -= dt;
      this.lightningLight.intensity = this.lightningActive > 0 ? 8 : 0;
    } else {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4 + Math.random() * 11;
        this.lightningActive = 0.12 + Math.random() * 0.1;
        this.lightningLight.intensity = 8;
        this.onLightning(0.6 + Math.random() * 2.5);
      }
    }
  }
}
