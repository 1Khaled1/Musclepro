// Shared vertex stage for the body shell and the muscles.
varying vec3 vNormal;   // view-space normal
varying vec3 vView;     // view-space direction to the camera
varying vec3 vLocal;    // object-space position (drives the fibre pattern)
varying float vHeight;  // world height in metres (drives scan + pulse)

void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vHeight = world.y;
  vec4 mv = viewMatrix * world;
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
