// Body shell: a dark lit form with a holographic fresnel rim, faint scan
// lines and a slow luminous band sweeping from feet to head.
uniform vec3 uBase;
uniform vec3 uRim;
uniform float uTime;
uniform float uMotion;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
varying float vHeight;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
  vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
  float diff = clamp(dot(n, L), 0.0, 1.0);

  vec3 col = uBase * (0.55 + 0.45 * diff);

  float lines = smoothstep(0.9, 1.0, 0.5 + 0.5 * sin(vHeight * 150.0)) * 0.05;
  float band = fract(uTime * 0.11) * 2.6 - 0.3;
  float sweep = exp(-pow((band - vHeight / 1.8) * 9.0, 2.0)) * uMotion;

  col += uRim * (fres * 0.8 + lines + sweep * 0.22);
  gl_FragColor = vec4(col, 1.0);
}
