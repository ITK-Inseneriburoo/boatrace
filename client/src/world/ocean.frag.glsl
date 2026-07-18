uniform samplerCube uEnvMap;
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunBoost;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uFoamLevel;
uniform float uAbsorb;
#ifdef USE_FOAM_TEX
uniform sampler2D uFoamTex;
#endif
#ifdef USE_PLANAR
uniform sampler2D uPlanarTex;
uniform mat4 uPlanarMatrix;
uniform float uPlanarDistort;
#endif

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

#ifdef USE_PLANAR
  // Päris peegelpilt (paadid, maastik) lähialas; normaaliga häiritud UV
  // peidab RT madala resolutsiooni. Kaugemal sulab tagasi odavasse kuubikusse.
  vec4 pc = uPlanarMatrix * vec4(vWorldPos, 1.0);
  if (pc.w > 0.0) {
    vec2 puv = pc.xy / pc.w + N.xz * uPlanarDistort;
    if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
      float pfade = (1.0 - smoothstep(60.0, 140.0, distance(uCamPos, vWorldPos))) * 0.85;
      env = mix(env, texture2D(uPlanarTex, puv).rgb, pfade);
    }
  }
#endif

  // Lagi < 1: madala nurga all jäi vesi puhtaks peegliks ja vee oma värv
  // kadus täielikult ära
  float fresnel = 0.022 + 0.75 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // Sügavus maastiku kõrguskaardist → türkiissinised madalikud + kaldavaht
  float depth = 30.0;
  if (uHasDepthTex > 0.5) {
    vec2 duv = (vWorldPos.xz - uDepthRect.xy) * uDepthRect.zw;
    if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
      float terrainH = texture2D(uDepthTex, duv).r * uDepthScale + uDepthOffset;
      depth = max(0.0, -terrainH);
    }
  }
  // Beer–Lambert neeldumine: särav türkiis madalikuriba, mis kaob
  // eksponentsiaalselt sügavusse (lineaarne mix nägi välja nagu gradient-dekaal)
  vec3 waterCol = mix(uWaterShallow, uWaterDeep, 1.0 - exp(-depth * uAbsorb));

  vec3 col = mix(waterCol, env, fresnel);

  // Päikese specular-sära + glitter. uSunBoost viib tipud HDR-vahemikku
  // (lineaarses ruumis ~5–15) — bloom teeb neist päris sädelused,
  // ilma composer'ita rullib ACES need sujuvalt valgeks.
  vec3 H = normalize(V + uSunDir);
  float ndh = max(dot(N, H), 0.0);
  float spec = pow(ndh, 260.0) * uSunBoost;
  float g = texture2D(uNoiseTex, vWorldPos.xz * 0.55 + uTime * 0.06).b;
  float glit = pow(ndh, 128.0) * g * g * uSunBoost * 0.12;
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
#ifdef USE_FOAM_TEX
  // foam-skalaar läve-maskina tekstuuri peal → pitsilised, murduvad servad.
  // Kaks skaalat eri kiirusega, et muster ei korduks silmanähtavalt.
  float ft = texture2D(uFoamTex, vWorldPos.xz * 0.21 + uTime * vec2(0.020, 0.013)).g * 0.6 +
             texture2D(uFoamTex, vWorldPos.xz * 0.067 - uTime * vec2(0.011, 0.017)).g * 0.4;
  float foamMask = smoothstep(1.0 - foam, 1.0 - foam + 0.25, ft) * clamp(foam * 1.3, 0.0, 1.0);
  col = mix(col, vec3(0.93, 0.96, 0.97), foamMask);
  foam = foamMask;
#else
  col = mix(col, vec3(0.92, 0.96, 0.97), foam);
#endif

  float alpha = 1.0;
#ifdef SHORE_ALPHA
  // Viimane poolmeeter enne randa läbipaistvaks — liiv kumab läbi;
  // vaht jääb läbipaistmatuks
  alpha = max(smoothstep(0.05, 0.8, depth), foam);
#endif
  gl_FragColor = vec4(col, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
