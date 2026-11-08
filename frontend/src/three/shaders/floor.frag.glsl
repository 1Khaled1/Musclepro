// Holographic platform: concentric rings, a rotating radar sweep, a tick
// ring and a soft pool of light under the feet.
uniform vec3 uColor;
uniform float uTime;
uniform float uMotion;
uniform float uOpacity;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float ring = 0.0;
  for (int i = 1; i <= 4; i++) {
    float rr = float(i) * 0.22;
    ring += smoothstep(0.012, 0.0, abs(r - rr)) * (1.0 - rr * 0.6);
  }

  float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
  float sweep = pow(fract(ang + uTime * 0.07 * uMotion), 7.0) * smoothstep(0.95, 0.15, r);
  float ticks = step(0.9, fract(ang * 72.0)) * smoothstep(0.86, 0.875, r) * smoothstep(0.93, 0.915, r);
  float glow = exp(-r * r * 9.0) * 0.5;

  float a = (ring * 0.5 + sweep * 0.35 + glow + ticks * 0.55) * smoothstep(1.0, 0.72, r);
  gl_FragColor = vec4(uColor * a, a * uOpacity);
}
