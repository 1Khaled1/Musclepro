// Floating light motes rising slowly around the figure.
attribute float aSeed;
uniform float uTime;
uniform float uMotion;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec3 p = position;
  float speed = 0.04 + aSeed * 0.06;
  p.y = mod(p.y + uTime * speed * uMotion, 2.1);
  p.x += sin(uTime * 0.5 + aSeed * 40.0) * 0.03 * uMotion;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (2.0 + aSeed * 3.0) * uPixelRatio * (3.0 / -mv.z);
  // Fade in at the floor and out near the top.
  vAlpha = smoothstep(0.0, 0.25, p.y) * smoothstep(2.1, 1.5, p.y) * (0.35 + aSeed * 0.65);
}
