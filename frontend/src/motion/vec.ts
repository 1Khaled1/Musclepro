/** Tiny 3D vector / rotation helpers for the motion engine.
 *  World axes: x = the athlete's left, y = up, z = the way the athlete faces. */
export type V3 = readonly [number, number, number];
/** Rotation as its three column vectors: side (left), up, forward. */
export type M3 = readonly [V3, V3, V3];

const RAD = Math.PI / 180;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3, fallback: V3 = [0, 1, 0]): V3 => {
  const l = len(a);
  return l > 1e-9 ? mul(a, 1 / l) : fallback;
};
export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerp = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
/** Smoothstep on [0, 1]. */
export const ease = (t: number): number => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
/** Smoothstep between two edges. */
export const step = (lo: number, hi: number, x: number): number => ease((x - lo) / (hi - lo));
/** a + b·s */
export const madd = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
/** Part of `a` perpendicular to the unit vector `axis`. */
export const reject = (a: V3, axis: V3): V3 => madd(a, axis, -dot(a, axis));

/** Rotation from yaw (turn left), pitch (lean forward) and roll (lean right), in degrees. */
export function euler(yaw = 0, pitch = 0, roll = 0): M3 {
  const cy = Math.cos(yaw * RAD);
  const sy = Math.sin(yaw * RAD);
  const cp = Math.cos(pitch * RAD);
  const sp = Math.sin(pitch * RAD);
  const cr = Math.cos(roll * RAD);
  const sr = Math.sin(roll * RAD);
  const f = (p: V3): V3 => {
    const x = p[0] * cr - p[1] * sr; // roll about z
    const y = p[0] * sr + p[1] * cr;
    const y2 = y * cp - p[2] * sp; // pitch about x
    const z2 = y * sp + p[2] * cp;
    return [x * cy + z2 * sy, y2, -x * sy + z2 * cy]; // yaw about y
  };
  return [f([1, 0, 0]), f([0, 1, 0]), f([0, 0, 1])];
}

/** Rotate a local vector into the frame. */
export const apply = (m: M3, p: V3): V3 => [
  m[0][0] * p[0] + m[1][0] * p[1] + m[2][0] * p[2],
  m[0][1] * p[0] + m[1][1] * p[1] + m[2][1] * p[2],
  m[0][2] * p[0] + m[1][2] * p[1] + m[2][2] * p[2],
];
export const mmul = (a: M3, b: M3): M3 => [apply(a, b[0]), apply(a, b[1]), apply(a, b[2])];
/** Local point → world: origin + frame·p. */
export const place = (o: V3, m: M3, p: V3): V3 => add(o, apply(m, p));
export const sind = (deg: number): number => Math.sin(deg * RAD);
export const cosd = (deg: number): number => Math.cos(deg * RAD);
