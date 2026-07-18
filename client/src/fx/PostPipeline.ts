import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

export interface PipelineConfig {
  /** false = otse-render ilma composer'ita (madal aste); tone mapping teeb renderer */
  composer: boolean;
  /** MSAA sämplite arv composer'i värvi-RT-l (0 = väljas, siis kasuta fxaa/smaa) */
  samples: number;
  aa: "none" | "fxaa" | "smaa";
  bloom: boolean;
  gtao: boolean;
}

export const DEFAULT_PIPELINE: PipelineConfig = {
  composer: true,
  samples: 4,
  aa: "smaa",
  bloom: true,
  gtao: false,
};

/**
 * Post-processing torustik. Pass'ide järjekord:
 *   RenderPass → [GTAO] → [Bloom] → OutputPass → [SMAA/FXAA]
 * OutputPass rakendab renderer'i tone mapping'u + sRGB teisenduse lõpus;
 * AA jookseb selle JÄREL (LDR sRGB pildil, nagu peab).
 * HalfFloat + multisample RT: HDR väärtused (>1) säilivad bloom'i jaoks
 * ja WebGL2 MSAA ei kao composer'iga.
 * Ookeani shaderi tonemapping/colorspace chunk'id kompileeruvad RT-sse
 * renderdades automaatselt no-op'ideks — topelt-tonemappingut ei teki.
 */
export class PostPipeline {
  private composer: EffectComposer | null = null;
  private fxaaPass: ShaderPass | null = null;
  private cfg: PipelineConfig = { ...DEFAULT_PIPELINE };

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.rebuild();
  }

  configure(cfg: PipelineConfig): void {
    this.cfg = { ...cfg };
    this.rebuild();
  }

  private rebuild(): void {
    this.composer?.dispose();
    this.composer = null;
    this.fxaaPass = null;
    if (!this.cfg.composer) return;

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.cfg.samples,
    });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));

    if (this.cfg.gtao) {
      // GTAO teeb oma depth/normal RT-d ise, seega sobib multisample värvi-RT kõrvale
      const gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      gtao.output = GTAOPass.OUTPUT.Default;
      c.addPass(gtao);
    }

    if (this.cfg.bloom) {
      // threshold 1.0 = ainult HDR-väärtused säravad (päikese glitter, välk),
      // mitte vaht ega valged paadid
      c.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.4, 1.0));
    }

    c.addPass(new OutputPass());

    if (this.cfg.aa === "smaa") {
      c.addPass(new SMAAPass(1, 1));
    } else if (this.cfg.aa === "fxaa") {
      this.fxaaPass = new ShaderPass(FXAAShader);
      c.addPass(this.fxaaPass);
    }

    this.composer = c;
    this.syncSize();
  }

  /** Peab jooksma nii resize'il kui pixel ratio muutusel, muidu pilt udune. */
  syncSize(): void {
    if (!this.composer) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);
    if (this.fxaaPass) {
      (this.fxaaPass.material.uniforms.resolution.value as THREE.Vector2).set(
        1 / (size.x * pr),
        1 / (size.y * pr),
      );
    }
  }

  render(_frameDt: number): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
