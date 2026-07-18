import * as THREE from "three";
import type { PbrSet } from "../../core/Textures";

/**
 * Triplanaarne PBR-kate UV-deta geomeetriale (deformeeritud kivid jm).
 * onBeforeCompile MeshStandardMaterial'i peal — varjud/udu/IBL jäävad alles;
 * instance-värvid korrutuvad edasi (color_fragment jookseb meie asenduse järel).
 * Maailma-normaal võetakse positsiooni tuletistest, seega töötab ka
 * InstancedMesh'iga ilma normaal-varyingut lisamata.
 */
export function installTriplanar(
  material: THREE.MeshStandardMaterial,
  set: PbrSet,
  scale: number,
): void {
  const uniforms = {
    uTriMap: { value: set.color },
    uTriN: { value: set.normal },
    uTriScale: { value: scale },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (set.normal) shader.defines = { ...shader.defines, TRI_NORMAL: "" };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vTriPos;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vTriPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
        vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTriPos;
        uniform sampler2D uTriMap, uTriN;
        uniform float uTriScale;
        // vt terrainSplat: normalMatrix tuleb fragmentis ise deklareerida
        uniform mat3 normalMatrix;

        vec3 triWeights() {
          vec3 wn = abs(normalize(cross(dFdx(vTriPos), dFdy(vTriPos))));
          return wn / (wn.x + wn.y + wn.z);
        }
        vec3 triSample(sampler2D tex) {
          vec3 p = vTriPos * uTriScale;
          vec3 w = triWeights();
          return texture2D(tex, p.zy).rgb * w.x +
                 texture2D(tex, p.xz).rgb * w.y +
                 texture2D(tex, p.xy).rgb * w.z;
        }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse * triSample(uTriMap), opacity );",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#ifdef TRI_NORMAL
        {
          vec3 nm = triSample(uTriN) * 2.0 - 1.0;
          normal = normalize(normal + normalize(normalMatrix * vec3(nm.x, 0.0, -nm.y)) * 0.55 * length(nm.xy));
        }
        #else
        #include <normal_fragment_maps>
        #endif`,
      );
  };
  material.customProgramCacheKey = () => "triplanar-v1";
  material.needsUpdate = true;
}
