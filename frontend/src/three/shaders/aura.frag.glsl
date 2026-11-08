// Living light behind the muscle map: a soft drifting energy field around
// the figure, a floor halo, and a pulsing focus glow that travels to the
// selected muscle. Output is premultiplied alpha over the glass card.
uniform vec2 uRes;
uniform float uTime;
uniform float uMotion;      // 0 when the user prefers reduced motion
uniform vec3 uField;        // ambient field colour
uniform vec3 uFocusColor;   // accent
uniform vec2 uFocus;        // focus point, 0..1 (y up)
uniform float uFocusAmt;    // 0..1, eased on the CPU
uniform float uStrength;    // theme-dependent overall intensity

varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 3.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = uTime * uMotion;

  // Tall soft aura around the figure, textured by slow upward-drifting noise.
  float aura = exp(-pow(p.x * 2.4, 2.0) - pow(p.y * 1.25, 2.0));
  float n = fbm(p * 3.2 + vec2(0.0, -t * 0.12));
  vec3 col = uField * aura * (0.22 + 0.5 * n);

  // Floor halo under the feet.
  vec2 fp = (p - vec2(0.0, -0.47)) * vec2(1.0, 4.0);
  float ring = smoothstep(0.018, 0.0, abs(length(fp) - 0.2)) + exp(-dot(fp, fp) * 18.0) * 0.6;
  col += uField * ring * 0.35;

  // Focus glow on the selected muscle.
  vec2 f = (uFocus - 0.5) * vec2(aspect, 1.0);
  float d = length(p - f);
  float pulse = 0.82 + 0.18 * sin(uTime * 2.6 * uMotion);
  col += uFocusColor * exp(-d * d * 26.0) * uFocusAmt * pulse;

  col *= uStrength;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
