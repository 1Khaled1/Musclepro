// Muscle surface: wrapped key light from the top-left (same light source as
// the glass UI), fibre striations, fresnel rim, and an "activation" state
// that blends toward the accent colour with an upward energy pulse.
uniform vec3 uBase;
uniform vec3 uRim;
uniform vec3 uActive;
uniform float uTime;
uniform float uHover;     // 0..1, eased on the CPU
uniform float uLevel;     // 0..1 selected / secondary / heat intensity
uniform float uMotion;    // 0 when the user prefers reduced motion

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
varying float vHeight;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);

  vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float wrap = diff * 0.7 + 0.3;
  vec3 H = normalize(L + v);
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 36.0);

  // Fine striations along the muscle's long axis.
  float fibre = 0.5 + 0.5 * sin(vLocal.y * 44.0 + sin(vLocal.x * 9.0) * 1.6);

  float act = clamp(uLevel, 0.0, 1.0);
  float mixAmt = clamp(act + uHover * 0.55, 0.0, 1.0);

  vec3 base = uBase * wrap * (0.88 + 0.12 * fibre);
  vec3 lit = uActive * (0.55 + 0.6 * wrap) * (0.82 + 0.18 * fibre);
  vec3 col = mix(base, lit, mixAmt);
  col += spec * (0.22 + 0.45 * mixAmt);

  // Energy travelling upward through active muscles.
  float pulse = 0.5 + 0.5 * sin(uTime * 3.2 - vHeight * 7.0);
  col += uActive * smoothstep(0.78, 1.0, pulse) * act * uMotion * 0.35;

  vec3 rimCol = mix(uRim, uActive, mixAmt);
  col += rimCol * fres * (0.22 + 1.0 * mixAmt);

  gl_FragColor = vec4(col, 1.0);
}
