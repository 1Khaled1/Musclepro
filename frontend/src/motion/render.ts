/** Draws the athlete and the equipment on a 2D canvas.
 *  The body is a set of 3D spheres joined into smooth shapes; an orthographic
 *  camera projects them, shapes are painted back to front, and the muscles
 *  an exercise trains are tinted on top (clipped to the body). */
import type { Muscle } from '../types';
import { D, type Frame, type Pose, type Prop, type Skel, type Tone } from './rig';
import { add, apply, clamp, cosd, cross, dot, euler, len, lerp, madd, mul, norm, place, reject, sind, step, sub, type V3 } from './vec';

// ---------------------------------------------------------------- colours
type RGB = readonly [number, number, number];
type Ramp = readonly [string, string, string]; // light, base, shade

const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1): string => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])}${a < 1 ? ` / ${a}` : ''})`;
const ramp = (light: string, base: string, shade: string): Ramp => [light, base, shade];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

export interface Palette {
  outline: string;
  body: Ramp;
  far: Ramp;
  short: Ramp;
  shortFar: Ramp;
  shoe: Ramp;
  relief: Ramp;
  reliefFar: Ramp;
  accent: Ramp;
  tones: Record<Exclude<Tone, 'wall' | 'cable' | 'band' | 'mat'>, Ramp>;
  wall: string;
  wallEdge: string;
  cable: string;
  band: string;
  mat: string;
  matEdge: string;
  shadow: string;
}

export function makePalette(theme: 'dark' | 'light', accent: RGB, holo: RGB): Palette {
  const dark = theme === 'dark';
  const acc = ramp(css(mixc(accent, WHITE, 0.28)), css(accent), css(mixc(accent, BLACK, 0.2)));
  return dark
    ? {
        outline: '#121826',
        body: ramp('#f4f6fa', '#cdd3de', '#9aa4b7'),
        far: ramp('#cfd5e0', '#a9b1c2', '#7f899d'),
        short: ramp('#5b6a8c', '#3c4864', '#273048'),
        shortFar: ramp('#4a5673', '#303a52', '#1f2739'),
        shoe: ramp('#ffffff', '#e9edf3', '#b9c2d1'),
        relief: ramp('#dfe4ec', '#aab3c4', '#8490a6'),
        reliefFar: ramp('#b9c1cf', '#8f99ad', '#6f7a90'),
        accent: acc,
        tones: {
          steel: ramp('#eef1f6', '#b4bccb', '#7b8598'),
          plate: ramp('#444e68', '#262d40', '#151a27'),
          pad: ramp('#56637f', '#3a4560', '#293249'),
          frame: ramp('#8e98ad', '#69738a', '#4a5367'),
          wood: ramp('#c79f74', '#a17b54', '#7c5d3d'),
        },
        wall: 'rgb(170 195 255 / 0.09)',
        wallEdge: 'rgb(190 210 255 / 0.3)',
        cable: '#c3cad6',
        band: css(holo),
        mat: 'rgb(120 160 255 / 0.1)',
        matEdge: 'rgb(150 185 255 / 0.26)',
        shadow: 'rgb(0 0 0 / 0.3)',
      }
    : {
        outline: '#1d2540',
        body: ramp('#fbfcfd', '#dfe3ea', '#b4bccb'),
        far: ramp('#e1e5ec', '#c0c7d4', '#98a1b4'),
        short: ramp('#4d5b7b', '#333e5a', '#232b41'),
        shortFar: ramp('#414d6a', '#2a344c', '#1d2437'),
        shoe: ramp('#ffffff', '#f1f3f7', '#c4ccd9'),
        relief: ramp('#eceff4', '#bcc4d2', '#98a2b6'),
        reliefFar: ramp('#cdd3de', '#a3acbe', '#838da2'),
        accent: acc,
        tones: {
          steel: ramp('#f6f7fa', '#bcc4d2', '#858fa3'),
          plate: ramp('#56617d', '#343d56', '#20273a'),
          pad: ramp('#6b7896', '#4c5876', '#38425c'),
          frame: ramp('#a3acbf', '#7c869c', '#5b647a'),
          wood: ramp('#d3ad84', '#b08a62', '#8a6a47'),
        },
        wall: 'rgb(40 70 140 / 0.07)',
        wallEdge: 'rgb(40 70 140 / 0.28)',
        cable: '#6d778d',
        band: css(holo),
        mat: 'rgb(40 80 190 / 0.07)',
        matEdge: 'rgb(40 80 190 / 0.22)',
        shadow: 'rgb(20 30 70 / 0.16)',
      };
}

// ---------------------------------------------------------------- camera
export interface Camera {
  right: V3;
  up: V3;
  to: V3; // from the scene toward the viewer
  scale: number;
  ox: number;
  oy: number;
}

export const PITCH = 9;

export function aim(yaw: number, pitch = PITCH): Pick<Camera, 'right' | 'up' | 'to'> {
  const c = cosd(yaw);
  const s = sind(yaw);
  const cp = cosd(pitch);
  const sp = sind(pitch);
  return { right: [c, 0, -s], up: [-s * sp, cp, -c * sp], to: [s * cp, sp, c * cp] };
}

/** World bounds of a movement (independent of the viewing angle, so rotating never rescales). */
export interface Bounds {
  min: V3;
  max: V3;
  /** Bounds of the athlete alone (used for the mat). */
  bodyMin: V3;
  bodyMax: V3;
}

export function boundsOf(skels: Skel[], props: Prop[][]): Bounds {
  let min: [number, number, number] = [9, 9, 9];
  let max: [number, number, number] = [-9, -9, -9];
  const grow = (p: V3, r: number): void => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i] - r);
      max[i] = Math.max(max[i], p[i] + r);
    }
  };
  for (const s of skels) {
    grow(s.head, 0.13);
    grow(s.P.o, 0.19);
    grow(place(s.C.o, s.C.m, [0, 0.2, 0]), 0.22);
    for (let i = 0; i < 2; i++) {
      grow(s.sh[i], 0.07);
      grow(s.el[i], 0.05);
      grow(madd(s.wr[i], s.hand[i], 0.06), 0.06);
      grow(s.kn[i], 0.06);
      grow(madd(s.an[i], s.toe[i], 0.08), 0.12);
    }
  }
  const bodyMin: V3 = [min[0], min[1], min[2]];
  const bodyMax: V3 = [max[0], max[1], max[2]];
  for (const list of props) {
    for (const p of list) {
      if (p.t === 'bar') {
        grow(p.a, p.plate ?? 0.03);
        grow(p.b, p.plate ?? 0.03);
      } else if (p.t === 'db' || p.t === 'kb') grow(p.at, 0.16);
      else if (p.t === 'box') {
        if (p.tone === 'wall') continue;
        const m = euler(p.yaw, p.pitch, 0);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) grow(place(p.c, m, [p.h[0] * sx, p.h[1] * sy, p.h[2] * sz]), 0);
      } else if (p.t === 'line') {
        grow(p.a, 0.02);
        grow(p.b, 0.02);
      } else if (p.t === 'disc' || p.t === 'ball') grow(p.c, p.r);
    }
  }
  min = [min[0], Math.min(min[1], 0), min[2]];
  return { min, max, bodyMin, bodyMax };
}

/** Place the camera so the whole movement fits a w × h canvas from any angle. */
export function frameCamera(b: Bounds, w: number, h: number, yaw: number, maxScale = 168): Camera {
  const dir = aim(yaw);
  const diag = Math.hypot(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const top = b.max[1];
  const sp = sind(PITCH);
  const cp = cosd(PITCH);
  const mx = w * 0.05;
  const mt = h * 0.07;
  const mb = h * 0.08;
  const scale = Math.min(maxScale * (w / 480), (w - 2 * mx) / diag, (h - mt - mb) / (top * cp + diag * sp));
  const centre: V3 = [(b.min[0] + b.max[0]) / 2, 0, (b.min[2] + b.max[2]) / 2];
  const above = (top * cp + (diag / 2) * sp) * scale;
  const below = (diag / 2) * sp * scale;
  const spare = h - mt - mb - above - below;
  const floorY = mt + spare * 0.6 + above;
  return { ...dir, scale, ox: w / 2 - dot(centre, dir.right) * scale, oy: floorY + dot(centre, dir.up) * scale };
}

// ---------------------------------------------------------------- shapes
interface Ball {
  c: V3;
  r: number;
}
type BodyTone = 'body' | 'short' | 'shoe';
interface Blob {
  balls: Ball[];
  tone: BodyTone;
}
interface Patch {
  balls: Ball[];
  muscle: Muscle;
  /** Outward direction of the muscle; null = visible from every side. */
  n: V3 | null;
}
interface Group {
  blobs: Blob[];
  patches: Patch[];
  centre: V3;
  limb: boolean;
}

const ball = (c: V3, r: number): Ball => ({ c, r });

/** Unit vector toward the front of a limb segment: away from the fold of the joint, or along the pole when straight. */
function facing(root: V3, mid: V3, end: V3, pole: V3, upper: boolean): V3 {
  const axis = norm(upper ? sub(mid, root) : sub(end, mid));
  const fold = upper ? reject(sub(end, mid), axis) : reject(sub(root, mid), axis);
  const straight = norm(reject(pole, axis), [0, 0, 1]);
  const w = clamp(len(fold) / 0.12);
  // Upper segment: the next one folds toward the back. Lower segment: the back faces the upper one.
  return norm(lerp(straight, mul(norm(fold, straight), -1), w), straight);
}

function bodyGroups(s: Skel, breath: number): Group[] {
  const Pf = (x: number, y: number, z: number): V3 => place(s.P.o, s.P.m, [x, y, z]);
  const Cf = (x: number, y: number, z: number): V3 => place(s.C.o, s.C.m, [x, y, z]);
  const pair = (f: (x: number, y: number, z: number) => V3, x: number, y: number, z: number, r: number): Ball[] => [ball(f(x, y, z), r), ball(f(-x, y, z), r)];
  const br = 1 + 0.016 * breath;
  const Hup = s.H.m[1];
  const Hfw = s.H.m[2];
  const Hside = s.H.m[0];
  const Cfw = s.C.m[2];
  const Cup = s.C.m[1];
  const Cside = s.C.m[0];
  const Pfw = s.P.m[2];
  const Pside = s.P.m[0];
  const trunkFw = norm(add(Cfw, Pfw));

  const patches: Patch[] = [];
  for (const sd of [1, -1]) {
    patches.push(
      { muscle: 'chest', n: Cfw, balls: [ball(Cf(0.05 * sd, 0.252, 0.062), 0.044), ball(Cf(0.122 * sd, 0.25, 0.04), 0.05), ball(Cf(0.082 * sd, 0.19, 0.062), 0.052)] },
      { muscle: 'obliques', n: norm(madd(mul(Cside, 0.8 * sd), Cfw, 0.5)), balls: [ball(Cf(0.126 * sd, 0.09, 0.03), 0.05), ball(Pf(0.11 * sd, 0.13, 0.026), 0.046)] },
      { muscle: 'lats', n: norm(madd(mul(Cfw, -0.8), Cside, 0.55 * sd)), balls: [ball(Cf(0.13 * sd, 0.235, -0.04), 0.056), ball(Cf(0.108 * sd, 0.11, -0.03), 0.054), ball(Cf(0.062 * sd, 0.16, -0.064), 0.05)] },
      { muscle: 'glutes', n: norm(madd(mul(Pfw, -0.9), Pside, 0.25 * sd)), balls: [ball(Pf(0.078 * sd, -0.014, -0.064), 0.086)] },
    );
    // Six-pack: three rows per side.
    patches.push(
      { muscle: 'abs', n: trunkFw, balls: [ball(Cf(0.034 * sd, 0.128, 0.064), 0.031)] },
      { muscle: 'abs', n: trunkFw, balls: [ball(lerp(Cf(0.034 * sd, 0.06, 0.066), Pf(0.034 * sd, 0.27, 0.06), 0.5), 0.031)] },
      { muscle: 'abs', n: trunkFw, balls: [ball(Pf(0.033 * sd, 0.2, 0.058), 0.03), ball(Pf(0.03 * sd, 0.13, 0.058), 0.027)] },
    );
  }
  patches.push(
    { muscle: 'lower_back', n: mul(trunkFw, -1), balls: [ball(Cf(0.034, 0.1, -0.058), 0.038), ball(Pf(0.034, 0.12, -0.05), 0.036)] },
    { muscle: 'lower_back', n: mul(trunkFw, -1), balls: [ball(Cf(-0.034, 0.1, -0.058), 0.038), ball(Pf(-0.034, 0.12, -0.05), 0.036)] },
    { muscle: 'traps', n: norm(madd(mul(Cfw, -0.9), Cup, 0.35)), balls: [ball(Cf(0, 0.325, -0.03), 0.046), ball(Cf(0.105, 0.322, -0.02), 0.036), ball(Cf(-0.105, 0.322, -0.02), 0.036), ball(Cf(0, 0.2, -0.078), 0.04)] },
  );

  const torso: Group = {
    limb: false,
    centre: mul(add(add(s.P.o, Cf(0, 0.15, 0)), Cf(0, 0.3, 0)), 1 / 3),
    blobs: [
      // waist
      { tone: 'body', balls: [...pair(Pf, 0.07, 0.15, 0.006, 0.076), ...pair(Cf, 0.094, 0.1, 0.012, 0.086)] },
      // shorts
      { tone: 'short', balls: [...pair(Pf, 0.082, -0.012, 0, 0.092), ...pair(Pf, 0.074, -0.03, -0.05, 0.088), ...pair(Pf, 0.074, 0.07, 0.004, 0.08)] },
      // rib cage, chest and upper back
      {
        tone: 'body',
        balls: [
          ...pair(Cf, 0.094, 0.1, 0.012, 0.086 * br),
          ...pair(Cf, 0.14, 0.235, 0, 0.084 * br),
          ...pair(Cf, 0.15, 0.3, -0.004, 0.06),
          ...pair(Cf, 0.08, 0.215, 0.058, 0.074 * br),
          ...pair(Cf, 0.075, 0.22, -0.05, 0.082),
          ...pair(Cf, 0.055, 0.335, -0.012, 0.056),
        ],
      },
      // neck
      { tone: 'body', balls: [ball(Cf(0, 0.33, -0.004), 0.056), ball(madd(s.head, Hup, -0.08), 0.052)] },
      // head: skull, jaw and a hint of nose/brow so the facing direction reads
      { tone: 'body', balls: [ball(madd(s.head, Hup, 0.012), 0.094), ball(madd(madd(s.head, Hup, -0.058), Hfw, 0.03), 0.066), ball(madd(madd(s.head, Hup, -0.012), Hfw, 0.074), 0.03)] },
    ],
    patches,
  };
  // Ears (tiny, same tone) help the head read from the front and back.
  torso.blobs.push({ tone: 'body', balls: [ball(madd(madd(s.head, Hside, 0.094), Hup, -0.014), 0.022)] }, { tone: 'body', balls: [ball(madd(madd(s.head, Hside, -0.094), Hup, -0.014), 0.022)] });

  const groups: Group[] = [torso];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    // ---- arm
    const sh = s.sh[i];
    const el = s.el[i];
    const wr = s.wr[i];
    const ua = norm(sub(el, sh));
    const fa = norm(sub(wr, el));
    // Biceps side = where the forearm folds to; when the arm is straight, opposite the elbow's pole.
    const armFront = mul(facing(sh, el, wr, s.armPole[i], true), -1);
    const hand: Ball[] = s.fist[i] ? [ball(madd(wr, s.hand[i], 0.03), 0.042)] : [ball(wr, 0.034), ball(madd(wr, s.hand[i], D.hand), 0.027)];
    groups.push({
      limb: true,
      centre: mul(add(add(sh, el), wr), 1 / 3),
      blobs: [
        { tone: 'body', balls: [ball(madd(sh, Cup, 0.004), 0.07), ball(madd(sh, ua, 0.12), 0.059), ball(el, 0.047)] },
        { tone: 'body', balls: [ball(el, 0.046), ball(madd(el, fa, 0.07), 0.049), ball(wr, 0.034)] },
        { tone: 'body', balls: hand },
      ],
      patches: [
        { muscle: 'shoulders', n: null, balls: [ball(madd(madd(sh, Cside, 0.004 * side), Cup, 0.006), 0.064), ball(madd(sh, ua, 0.075), 0.05)] },
        { muscle: 'biceps', n: armFront, balls: [ball(madd(madd(sh, ua, 0.125), armFront, 0.024), 0.04), ball(madd(madd(sh, ua, 0.24), armFront, 0.018), 0.034)] },
        { muscle: 'triceps', n: mul(armFront, -1), balls: [ball(madd(madd(sh, ua, 0.12), armFront, -0.026), 0.04), ball(madd(madd(sh, ua, 0.245), armFront, -0.018), 0.034)] },
        { muscle: 'forearms', n: null, balls: [ball(madd(el, fa, 0.045), 0.043), ball(madd(el, fa, 0.17), 0.034)] },
      ],
    });

    // ---- leg
    const hip = s.hip[i];
    const kn = s.kn[i];
    const an = s.an[i];
    const th = norm(sub(kn, hip));
    const shn = norm(sub(an, kn));
    const thighFront = facing(hip, kn, an, s.legPole[i], true);
    const shinBack = mul(facing(hip, kn, an, s.legPole[i], false), -1);
    const toe = s.toe[i];
    const sole = s.sole[i];
    groups.push({
      limb: true,
      centre: mul(add(add(hip, kn), an), 1 / 3),
      blobs: [
        { tone: 'body', balls: [ball(hip, 0.094), ball(madd(madd(hip, th, 0.16), thighFront, 0.014), 0.09), ball(kn, 0.06)] },
        { tone: 'body', balls: [ball(kn, 0.057), ball(madd(madd(kn, shn, D.shin * 0.3), shinBack, 0.02), 0.063), ball(an, 0.04)] },
        { tone: 'short', balls: [ball(hip, 0.098), ball(madd(madd(hip, th, D.thigh * 0.3), thighFront, 0.012), 0.093)] },
        {
          tone: 'shoe',
          balls: [ball(an, 0.043), ball(madd(madd(an, toe, -0.045), sole, 0.025), 0.045), ball(madd(madd(an, toe, 0.11), sole, 0.036), 0.034), ball(madd(madd(an, toe, 0.165), sole, 0.042), 0.028)],
        },
      ],
      patches: [
        { muscle: 'quads', n: thighFront, balls: [ball(madd(madd(hip, th, 0.11), thighFront, 0.04), 0.07), ball(madd(madd(hip, th, 0.37), thighFront, 0.026), 0.046)] },
        { muscle: 'hamstrings', n: mul(thighFront, -1), balls: [ball(madd(madd(hip, th, 0.13), thighFront, -0.04), 0.064), ball(madd(madd(hip, th, 0.37), thighFront, -0.026), 0.044)] },
        { muscle: 'calves', n: shinBack, balls: [ball(madd(madd(kn, shn, 0.06), shinBack, 0.028), 0.048), ball(madd(madd(kn, shn, 0.22), shinBack, 0.02), 0.04)] },
      ],
    });
  }
  return groups;
}

// ---------------------------------------------------------------- projection + hulls
const SEG = 14;
const COS: number[] = [];
const SIN: number[] = [];
for (let i = 0; i < SEG; i++) {
  COS.push(Math.cos((i / SEG) * Math.PI * 2));
  SIN.push(Math.sin((i / SEG) * Math.PI * 2));
}

const px = (cam: Camera, p: V3): number => cam.ox + dot(p, cam.right) * cam.scale;
const py = (cam: Camera, p: V3): number => cam.oy - dot(p, cam.up) * cam.scale;
const depth = (cam: Camera, p: V3): number => dot(p, cam.to);

/** Convex hull of projected spheres, as a flat [x0, y0, x1, y1, …] polygon. */
function hull(balls: Ball[], cam: Camera): number[] {
  const n = balls.length * SEG;
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  let k = 0;
  for (const b of balls) {
    const cx = px(cam, b.c);
    const cy = py(cam, b.c);
    const r = b.r * cam.scale;
    for (let i = 0; i < SEG; i++) {
      xs[k] = cx + COS[i] * r;
      ys[k] = cy + SIN[i] * r;
      k++;
    }
  }
  if (balls.length === 1) {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(xs[i], ys[i]);
    return out;
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
  const turn = (o: number, a: number, b: number): number => (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let j = idx.length - 1; j >= 0; j--) {
    const i = idx[j];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  const out: number[] = [];
  for (const i of lower) out.push(xs[i], ys[i]);
  for (const i of upper) out.push(xs[i], ys[i]);
  return out;
}

function trace(ctx: CanvasRenderingContext2D, poly: number[]): void {
  ctx.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
  ctx.closePath();
}

/** Fill with a soft top-left light. */
function shade(ctx: CanvasRenderingContext2D, poly: number[], r: Ramp, alpha = 1): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]);
    y1 = Math.max(y1, poly[i + 1]);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const R = Math.max(x1 - x0, y1 - y0) * 0.56;
  const g = ctx.createLinearGradient(cx - 0.5 * R, cy - 0.86 * R, cx + 0.5 * R, cy + 0.86 * R);
  g.addColorStop(0, r[0]);
  g.addColorStop(0.5, r[1]);
  g.addColorStop(1, r[2]);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  trace(ctx, poly);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- painter
interface Item {
  depth: number;
  draw: () => void;
}

export type Levels = Partial<Record<Muscle, number>>;

function groupItem(ctx: CanvasRenderingContext2D, g: Group, cam: Camera, pal: Palette, lv: Levels, torsoDepth: number, line: number): Item {
  const d = depth(cam, g.centre);
  const far = g.limb && d < torsoDepth - 0.035;
  return {
    depth: d,
    draw: () => {
      const blobs = g.blobs;
      const polys = blobs.map((b) => hull(b.balls, cam));
      ctx.beginPath();
      for (const p of polys) trace(ctx, p);
      ctx.lineJoin = 'round';
      ctx.lineWidth = line * 2;
      ctx.strokeStyle = pal.outline;
      ctx.stroke();
      blobs.forEach((b, i) => {
        if (b.tone === 'short') return; // painted after the muscles
        shade(ctx, polys[i], b.tone === 'body' ? (far ? pal.far : pal.body) : pal.shoe);
      });
      // Muscles: always drawn as a soft relief (like the body map), in the accent colour when trained.
      ctx.save();
      ctx.beginPath();
      blobs.forEach((b, i) => {
        if (b.tone === 'body') trace(ctx, polys[i]);
      });
      ctx.clip();
      for (const p of g.patches) {
        const vis = p.n ? step(-0.4, 0.05, dot(p.n, cam.to)) : 1;
        if (vis < 0.02) continue;
        const level = lv[p.muscle] ?? 0;
        const poly = hull(p.balls, cam);
        if (level > 0) shade(ctx, poly, pal.accent, (level >= 1 ? 0.95 : 0.5) * vis * (far ? 0.88 : 1));
        else shade(ctx, poly, far ? pal.reliefFar : pal.relief, 0.55 * vis);
      }
      ctx.restore();
      // Shorts go over the muscles of the hips; trained glutes still show through.
      blobs.forEach((b, i) => {
        if (b.tone !== 'short') return;
        shade(ctx, polys[i], far ? pal.shortFar : pal.short);
      });
      const glutes = g.patches.filter((p) => p.muscle === 'glutes' && (lv.glutes ?? 0) > 0);
      if (glutes.length) {
        ctx.save();
        ctx.beginPath();
        blobs.forEach((b, i) => {
          if (b.tone === 'short') trace(ctx, polys[i]);
        });
        ctx.clip();
        for (const p of glutes) {
          const vis = p.n ? step(-0.4, 0.05, dot(p.n, cam.to)) : 1;
          if (vis >= 0.02) shade(ctx, hull(p.balls, cam), pal.accent, ((lv.glutes ?? 0) >= 1 ? 0.82 : 0.42) * vis);
        }
        ctx.restore();
      }
    },
  };
}

function discPoly(c: V3, n: V3, r: number, cam: Camera): number[] {
  const a = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const b = cross(n, a);
  const out: number[] = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const p = madd(madd(c, a, Math.cos(t) * r), b, Math.sin(t) * r);
    out.push(px(cam, p), py(cam, p));
  }
  return out;
}

function solid(ctx: CanvasRenderingContext2D, poly: number[], r: Ramp, pal: Palette, line: number): void {
  ctx.beginPath();
  trace(ctx, poly);
  ctx.lineJoin = 'round';
  ctx.lineWidth = line * 2;
  ctx.strokeStyle = pal.outline;
  ctx.stroke();
  shade(ctx, poly, r);
}

function propItems(ctx: CanvasRenderingContext2D, p: Prop, cam: Camera, pal: Palette, line: number): Item[] {
  const layer = (l: 'back' | 'front' | undefined, d: number): number => (l === 'back' ? d - 100 : l === 'front' ? d + 100 : d);
  switch (p.t) {
    case 'bar': {
      const u = norm(sub(p.b, p.a));
      const mid = lerp(p.a, p.b, 0.5);
      const items: Item[] = [
        {
          depth: depth(cam, mid) + (p.plate ? 0.03 : 0),
          draw: () => solid(ctx, hull([ball(p.a, p.r ?? 0.014), ball(p.b, p.r ?? 0.014)], cam), pal.tones.steel, pal, line * 0.8),
        },
      ];
      if (p.plate) {
        for (const [end, dir] of [[p.a, 1], [p.b, -1]] as const) {
          const c = madd(end, u, 0.09 * dir);
          items.push({
            depth: depth(cam, c) + 0.04,
            draw: () => {
              solid(ctx, discPoly(c, u, p.plate!, cam), pal.tones.plate, pal, line);
              shade(ctx, discPoly(madd(c, u, 0), u, p.plate! * 0.82, cam), [pal.tones.plate[1], pal.tones.plate[1], pal.tones.plate[2]]);
              solid(ctx, hull([ball(c, 0.03), ball(madd(end, u, 0), 0.022)], cam), pal.tones.steel, pal, line * 0.7);
            },
          });
        }
      }
      return items;
    }
    case 'db': {
      const u = norm(p.axis, [0, 0, 1]);
      const k = p.size ?? 1;
      return [
        {
          depth: depth(cam, p.at) + 0.05,
          draw: () => {
            solid(ctx, hull([ball(madd(p.at, u, -0.07), 0.013), ball(madd(p.at, u, 0.07), 0.013)], cam), pal.tones.steel, pal, line * 0.7);
            for (const s of [-1, 1]) solid(ctx, hull([ball(madd(p.at, u, 0.062 * s), 0.046 * k), ball(madd(p.at, u, 0.1 * s), 0.046 * k)], cam), pal.tones.plate, pal, line * 0.9);
          },
        },
      ];
    }
    case 'kb': {
      const dir = norm(p.dir ?? [0, -1, 0]);
      const k = p.size ?? 1;
      const c = madd(p.at, dir, 0.115 * k);
      return [
        {
          depth: depth(cam, c) + 0.04,
          draw: () => {
            const hx = px(cam, madd(p.at, dir, 0.035 * k));
            const hy = py(cam, madd(p.at, dir, 0.035 * k));
            ctx.beginPath();
            ctx.arc(hx, hy, 0.045 * k * cam.scale, 0, Math.PI * 2);
            ctx.lineWidth = 0.02 * k * cam.scale + line * 2;
            ctx.strokeStyle = pal.outline;
            ctx.stroke();
            ctx.lineWidth = 0.02 * k * cam.scale;
            ctx.strokeStyle = pal.tones.plate[0];
            ctx.stroke();
            solid(ctx, hull([ball(c, 0.082 * k)], cam), pal.tones.plate, pal, line);
          },
        },
      ];
    }
    case 'box': {
      const m = euler(p.yaw, p.pitch, 0);
      const corner = (sx: number, sy: number, sz: number): V3 => place(p.c, m, [p.h[0] * sx, p.h[1] * sy, p.h[2] * sz]);
      const faces: [V3, [number, number, number][]][] = [
        [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
        [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
        [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
        [[-1, 0, 0], [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]]],
        [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
        [[0, 0, -1], [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]],
      ];
      const light = norm(add(add(mul(cam.up, 0.8), mul(cam.right, -0.45)), mul(cam.to, 0.4)));
      return [
        {
          depth: layer(p.layer ?? (p.tone === 'wall' ? 'back' : undefined), depth(cam, p.c) - 0.02),
          draw: () => {
            for (const [nl, quad] of faces) {
              const n = apply(m, nl);
              if (dot(n, cam.to) <= 0.002) continue;
              const poly: number[] = [];
              for (const q of quad) {
                const w = corner(q[0], q[1], q[2]);
                poly.push(px(cam, w), py(cam, w));
              }
              ctx.beginPath();
              trace(ctx, poly);
              ctx.lineJoin = 'round';
              if (p.tone === 'wall') {
                ctx.fillStyle = pal.wall;
                ctx.fill();
                ctx.lineWidth = line;
                ctx.strokeStyle = pal.wallEdge;
                ctx.stroke();
                continue;
              }
              const r = pal.tones[p.tone as keyof Palette['tones']] ?? pal.tones.frame;
              const lit = clamp(dot(n, light));
              ctx.fillStyle = lit > 0.62 ? r[0] : lit > 0.25 ? r[1] : r[2];
              ctx.lineWidth = line * 1.4;
              ctx.strokeStyle = pal.outline;
              ctx.stroke();
              ctx.fill();
            }
          },
        },
      ];
    }
    case 'line':
      return [
        {
          depth: layer(p.layer, depth(cam, lerp(p.a, p.b, 0.5)) + 0.03),
          draw: () => {
            const w = Math.max(1.4, (p.w ?? 0.012) * cam.scale);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px(cam, p.a), py(cam, p.a));
            ctx.lineTo(px(cam, p.b), py(cam, p.b));
            if (p.tone !== 'cable') {
              ctx.lineWidth = w + line * 1.6;
              ctx.strokeStyle = pal.outline;
              ctx.stroke();
            }
            ctx.lineWidth = w;
            ctx.strokeStyle = p.tone === 'band' ? pal.band : p.tone === 'cable' ? pal.cable : (pal.tones[p.tone as keyof Palette['tones']] ?? pal.tones.frame)[1];
            ctx.stroke();
          },
        },
      ];
    case 'disc':
      return [
        {
          depth: layer(p.layer, depth(cam, p.c) + 0.02),
          draw: () => solid(ctx, discPoly(p.c, norm(p.n), p.r, cam), pal.tones[p.tone as keyof Palette['tones']] ?? pal.tones.plate, pal, line),
        },
      ];
    case 'ball':
      return [{ depth: depth(cam, p.c), draw: () => solid(ctx, hull([ball(p.c, p.r)], cam), pal.tones[p.tone as keyof Palette['tones']] ?? pal.tones.plate, pal, line) }];
  }
}

function floor(ctx: CanvasRenderingContext2D, s: Skel, b: Bounds, cam: Camera, pal: Palette): void {
  // Mat: a rounded slab under the athlete.
  const cx = (b.bodyMin[0] + b.bodyMax[0]) / 2;
  const cz = (b.bodyMin[2] + b.bodyMax[2]) / 2;
  const hx = clamp((b.bodyMax[0] - b.bodyMin[0]) / 2 + 0.16, 0.5, 1.2);
  const hz = clamp((b.bodyMax[2] - b.bodyMin[2]) / 2 + 0.16, 0.5, 1.3);
  const quad: V3[] = [[cx - hx, 0, cz - hz], [cx + hx, 0, cz - hz], [cx + hx, 0, cz + hz], [cx - hx, 0, cz + hz]];
  ctx.beginPath();
  quad.forEach((q, i) => (i ? ctx.lineTo(px(cam, q), py(cam, q)) : ctx.moveTo(px(cam, q), py(cam, q))));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.09 * cam.scale;
  ctx.strokeStyle = pal.mat;
  ctx.fillStyle = pal.mat;
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(1, cam.scale * 0.006);
  ctx.strokeStyle = pal.matEdge;
  ctx.stroke();

  // Contact shadows: stronger the closer a body part is to the floor.
  const spots: [V3, number][] = [
    [s.an[0], 0.13],
    [s.an[1], 0.13],
    [s.P.o, 0.2],
    [place(s.C.o, s.C.m, [0, 0.2, 0]), 0.2],
    [s.head, 0.12],
    [s.wr[0], 0.08],
    [s.wr[1], 0.08],
    [s.kn[0], 0.1],
    [s.kn[1], 0.1],
  ];
  ctx.fillStyle = pal.shadow;
  for (const [p, r] of spots) {
    const a = clamp(1 - p[1] / 0.55) ** 1.5;
    if (a < 0.03) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    const poly = discPoly([p[0], 0, p[2]], [0, 1, 0], r * (0.8 + 0.4 * a), cam);
    trace(ctx, poly);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export interface DrawOptions {
  levels: Levels;
  breath?: number;
}

/** Paint one frame. The canvas transform must already map CSS pixels. */
export function draw(ctx: CanvasRenderingContext2D, s: Skel, pose: Pose, b: Bounds, cam: Camera, pal: Palette, opts: DrawOptions): void {
  const line = Math.max(1.1, cam.scale * 0.0098);
  floor(ctx, s, b, cam, pal);
  const groups = bodyGroups(s, opts.breath ?? 0);
  const torsoDepth = depth(cam, groups[0].centre);
  const items: Item[] = groups.map((g) => groupItem(ctx, g, cam, pal, opts.levels, torsoDepth, line));
  for (const p of pose.props ?? []) items.push(...propItems(ctx, p, cam, pal, line));
  items.sort((a, b2) => a.depth - b2.depth);
  for (const it of items) it.draw();
}

export type { Frame };
