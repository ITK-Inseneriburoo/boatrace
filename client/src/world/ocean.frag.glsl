uniform samplerCube uEnvMap;
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uFoamLevel;

// Maastiku kõrguskaart madalike/kaldavahu jaoks (faas 4+)
uniform sampler2D uDepthTex;
uniform float uHasDepthTex;
uniform vec4 uDepthRect; // minX, minZ, 1/suurusX, 1/suurusZ
uniform float uDepthScale; // kõrguskaardi väärtuste skaala (m)
uniform float uDepthOffset;

// Kiiluvee render-target (faas 8)
uniform sampler2D uWakeTex;
uniform float uHasWakeTex;
uniform vec4 uWakeRect;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

#include <fog_pars_fragment>

void main() {
  vec3 N = normalize(vNormal);

  // Kaks kerivat detail-normaali oktaavi (nõrk häiring, muidu läheb piimjaks)
  vec2 uv1 = vWorldPos.xz * 0.13 + uTime * vec2(0.021, 0.014);
  vec2 uv2 = vWorldPos.xz * 0.37 - uTime * vec2(0.017, 0.026);
  vec2 n1 = texture2D(uNoiseTex, uv1).rg * 2.0 - 1.0;
  vec2 n2 = texture2D(uNoiseTex, uv2).rg * 2.0 - 1.0;
  N = normalize(N + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * 0.05);

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 env = textureCube(uEnvMap, R).rgb;

  float fresnel = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // Sügavus maastiku kõrguskaardist → türkiissinised madalikud + kaldavaht
  float depth = 30.0;
  if (uHasDepthTex > 0.5) {
    vec2 duv = (vWorldPos.xz - uDepthRect.xy) * uDepthRect.zw;
    if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
      float terrainH = texture2D(uDepthTex, duv).r * uDepthScale + uDepthOffset;
      depth = max(0.0, -terrainH);
    }
  }
  vec3 waterCol = mix(uWaterShallow, uWaterDeep, clamp(depth / 5.0, 0.0, 1.0));

  vec3 col = mix(waterCol, env, fresnel);

  // Päikese specular-sära + glitter
  vec3 H = normalize(V + uSunDir);
  float ndh = max(dot(N, H), 0.0);
  float spec = pow(ndh, 260.0) * 3.0;
  float glit = pow(ndh, 128.0) * texture2D(uNoiseTex, vWorldPos.xz * 0.55 + uTime * 0.06).b * 0.2;
  col += uSunColor * (spec + glit);

  // Vaht: laineharjad + kaldajoon + kiiluvesi
  float foamNoise = texture2D(uNoiseTex, vWorldPos.xz * 0.09 + uTime * 0.008).g;
  float foam = smoothstep(uFoamLevel, uFoamLevel + 0.3, vCrest) * (0.5 + foamNoise * 0.7);
  if (uHasDepthTex > 0.5) {
    float shore = 1.0 - smoothstep(0.0, 1.6, depth);
    float shoreWave = 0.6 + 0.4 * sin(depth * 4.0 - uTime * 1.7);
    foam += shore * shoreWave * (0.4 + foamNoise * 0.8);
  }
  if (uHasWakeTex > 0.5) {
    vec2 wuv = (vWorldPos.xz - uWakeRect.xy) * uWakeRect.zw;
    if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) {
      float wake = texture2D(uWakeTex, wuv).r;
      foam += wake * (0.55 + foamNoise * 0.45);
    }
  }
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.96, 0.97), foam);

  gl_FragColor = vec4(col, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
