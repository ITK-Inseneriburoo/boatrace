// Gerstner-lained — PEAB vastama shared/src/waves.ts CPU-arvutusele
uniform float uTime;
uniform vec4 uWaveA[4]; // dirX, dirZ, amplitude, wavelength
uniform vec4 uWaveB[4]; // steepness, speed, -, -
uniform vec3 uCamPos;
uniform float uFadeStart; // kaugus, kust amplituud hakkab kahanema
uniform float uFadeEnd;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

#include <fog_pars_vertex>

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;

  float distFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(p, uCamPos.xz));

  vec3 disp = vec3(0.0);
  float gx = 0.0, gy = 0.0, gz = 0.0;

  for (int i = 0; i < 4; i++) {
    vec2 D = normalize(uWaveA[i].xy);
    float A = uWaveA[i].z * distFade;
    float L = uWaveA[i].w;
    float Q = uWaveB[i].x;
    float c = uWaveB[i].y;
    float k = 6.2831853 / L;
    float f = k * (dot(D, p) - c * uTime);
    float sf = sin(f);
    float cf = cos(f);
    disp.x += Q * A * D.x * cf;
    disp.z += Q * A * D.y * cf;
    disp.y += A * sf;
    gx += D.x * k * A * cf;
    gz += D.y * k * A * cf;
    gy += Q * k * A * sf;
  }

  vec3 displaced = vec3(wp.x + disp.x, disp.y, wp.z + disp.z);
  vWorldPos = displaced;
  vNormal = normalize(vec3(-gx, 1.0 - gy, -gz));
  // "Jacobian"-laadne harjategur: suur seal, kus lained kokku pressivad
  vCrest = clamp(gy * 1.4, 0.0, 1.5);

  vec4 mvPosition = viewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
