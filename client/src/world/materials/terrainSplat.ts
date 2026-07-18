import * as THREE from "three";
import type { PbrSet } from "../../core/Textures";

export interface SplatOptions {
  sand: PbrSet;
  grass: PbrSet;
  rock: PbrSet;
  /** Paleti tint kihi kaupa (1,1,1 = tekstuuri naturaalne värv) */
  sandTint: THREE.Color;
  grassTint: THREE.Color;
  rockTint: THREE.Color;
  snowColor: THREE.Color;
  snowAbove: number;
  underwaterColor: THREE.Color;
  /** Tekstuuri kordus (maailmaühikut tsükli kohta = 1/scale) */
  texScale: number;
  detailNormals: boolean;
}

/**
 * Kõrguse+kalde põhine splatting MeshStandardMaterial'i peal
 * (onBeforeCompile — varjud/udu/IBL jäävad tasuta alles).
 * Kihipiirid vastavad Terrain'i senistele vertex-värvi lävedele:
 * liiv < 0.9 < rohi < 5.5 < kalju; järsak → kalju; h > snowAbove → lumi.
 * Kalju sämplitakse triplanaarselt (järsakud venitaks planar-UV puruks),
 * liiv/rohi planaarselt XZ-tasandil.
 * Vertex-color jääb alles heleduse-variatsiooni tindina (color_fragment).
 */
export function installSplat(material: THREE.MeshStandardMaterial, o: SplatOptions): void {
  const uniforms = {
    uSandMap: { value: o.sand.color },
    uGrassMap: { value: o.grass.color },
    uRockMap: { value: o.rock.color },
    uSandN: { value: o.sand.normal },
    uGrassN: { value: o.grass.normal },
    uRockN: { value: o.rock.normal },
    uSandTint: { value: o.sandTint },
    uGrassTint: { value: o.grassTint },
    uRockTint: { value: o.rockTint },
    uSnowColor: { value: o.snowColor },
    uSnowAbove: { value: o.snowAbove },
    uUnderwater: { value: o.underwaterColor },
    uTexScale: { value: o.texScale },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (o.detailNormals && o.sand.normal && o.grass.normal && o.rock.normal) {
      shader.defines = { ...shader.defines, SPLAT_NORMALS: "" };
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSplatPos;\nvarying float vSplatUp;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vSplatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSplatUp = normalize(mat3(modelMatrix) * normal).y;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vSplatPos;
        varying float vSplatUp;
        // three seob normalMatrix'i nime järgi ka fragment-shaderis,
        // aga deklareerima peab ise (prefix lisab selle vaid vertexisse)
        uniform mat3 normalMatrix;
        uniform sampler2D uSandMap, uGrassMap, uRockMap;
        uniform sampler2D uSandN, uGrassN, uRockN;
        uniform vec3 uSandTint, uGrassTint, uRockTint, uSnowColor, uUnderwater;
        uniform float uSnowAbove, uTexScale;

        // Kihikaalud (liiv, rohi, kalju) kõrgusest + kaldest
        vec3 splatWeights() {
          float h = vSplatPos.y;
          float wGrass = smoothstep(0.9, 2.3, h) * (1.0 - smoothstep(5.5, 8.0, h));
          float wRock = smoothstep(5.5, 8.0, h);
          // Järsak on kalju sõltumata kõrgusest
          wRock = max(wRock, smoothstep(0.45, 0.7, 1.0 - vSplatUp));
          wGrass *= 1.0 - wRock;
          float wSand = max(0.0, 1.0 - wGrass - wRock);
          return vec3(wSand, wGrass, wRock);
        }

        // Kalju triplanaarselt (3 proovi), blend |normaali| komponentide järgi
        vec3 rockTriplanar(sampler2D tex) {
          vec3 p = vSplatPos * uTexScale;
          // Maailma-normaal positsiooni tuletisest (vNormal on view-space)
          vec3 dx = dFdx(vSplatPos), dy = dFdy(vSplatPos);
          vec3 wn = abs(normalize(cross(dx, dy)));
          wn /= (wn.x + wn.y + wn.z);
          vec3 cx = texture2D(tex, p.zy).rgb;
          vec3 cy = texture2D(tex, p.xz).rgb;
          vec3 cz = texture2D(tex, p.xy).rgb;
          return cx * wn.x + cy * wn.y + cz * wn.z;
        }

        vec3 splatAlbedo() {
          vec3 w = splatWeights();
          vec2 uv = vSplatPos.xz * uTexScale;
          vec3 sand = texture2D(uSandMap, uv).rgb * uSandTint;
          vec3 grass = texture2D(uGrassMap, uv * 1.31).rgb * uGrassTint;
          vec3 rock = rockTriplanar(uRockMap) * uRockTint;
          vec3 c = sand * w.x + grass * w.y + rock * w.z;
          // Lumemütsid ja veealune toon värvidena splati peale
          float h = vSplatPos.y;
          c = mix(c, uSnowColor, clamp((h - uSnowAbove) / 4.0, 0.0, 1.0));
          c = mix(uUnderwater, c, smoothstep(-1.2, -0.15, h));
          return c;
        }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( splatAlbedo(), opacity );",
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#ifdef SPLAT_NORMALS
      {
        vec3 w = splatWeights();
        vec2 uv = vSplatPos.xz * uTexScale;
        vec3 nSand = texture2D(uSandN, uv).xyz * 2.0 - 1.0;
        vec3 nGrass = texture2D(uGrassN, uv * 1.31).xyz * 2.0 - 1.0;
        vec3 nRock = rockTriplanar(uRockN) * 2.0 - 1.0;
        vec3 nm = nSand * w.x + nGrass * w.y + nRock * w.z;
        // UDN-laadne häiring view-space normaalile (piisav horisontaalsel maastikul)
        normal = normalize(normal + normalize(normalMatrix * vec3(nm.x, 0.0, -nm.y)) * 0.6 * length(nm.xy));
      }
      #else
      #include <normal_fragment_maps>
      #endif`,
    );
  };
  material.customProgramCacheKey = () =>
    `terrain-splat-v1:${o.detailNormals ? "n" : ""}`;
  material.needsUpdate = true;
}
