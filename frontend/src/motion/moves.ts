/** Movement patterns. Each returns the pose at phase k (0 = start, 1 = end of
 *  the range of motion). They are parametrised, so "squat" serves the back
 *  squat, the goblet squat, the wall sit… and hands/feet stay on their
 *  supports because limbs are solved by inverse kinematics. */
import { ARM, D, LEG, chestOf, inFrame, pelvisOf, solve, type Frame, type Limb, type Pose, type Prop } from './rig';
import { add, apply, clamp, cosd, ease, lerp, madd, mix, norm, sind, step, sub, type V3 } from './vec';

// ================================================================ helpers
export const foot = (x: number, z = 0, y: number = D.ankle): V3 => [x, y, z];
export const toeOut = (deg: number): V3 => [sind(deg), 0, cosd(deg)];
/** Hip height that leaves the knees just soft for a given foot offset. */
export const standY = (half = 0.11, dz = 0, ankleY: number = D.ankle): number =>
  ankleY + Math.sqrt((LEG - 0.008) ** 2 - (half - D.hipW) ** 2 - dz * dz);
/** Ankle height when balanced on the toes with the foot pointing `deg` below horizontal. */
export const onToes = (deg: number): number => 0.165 * sind(deg) + 0.042 * cosd(deg) + 0.028;
/** Straight body length from the ankles to the shoulder line, and hips to shoulders. */
export const TRUNK = D.lumbar + D.chest;
export const BODY = LEG + TRUNK;
const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];
const up = (deg: number): V3 => [0, cosd(deg), sind(deg)]; // trunk direction for a forward lean
/** 0 → 1 → 0 over u ∈ [0, 1]. */
export const tri = (u: number): number => 1 - Math.abs(1 - 2 * clamp(u));
/** Eased progress of u between a and b. */
export const span = (u: number, a: number, b: number): number => ease((u - a) / (b - a));

/** Pull a target back inside the arm's reach from a shoulder. */
export const within = (shoulder: V3, target: V3, reach = ARM - 0.02): V3 => {
  const d = sub(target, shoulder);
  const l = Math.hypot(d[0], d[1], d[2]);
  return l <= reach ? target : madd(shoulder, d, reach / l);
};

export const HANG: Limb = { at: [0.03, -(ARM - 0.012), 0.03], pole: [0.25, 0, -1], local: true };
const mixLimb = (a: Limb, b: Limb, k: number): Limb => ({
  ...a,
  at: lerp(a.at, b.at, k),
  pole: a.pole && b.pole ? lerp(a.pole, b.pole, k) : (b.pole ?? a.pole),
});
const vmix = (a: V3 | undefined, b: V3 | undefined, t: number): V3 | undefined => (a && b ? lerp(a, b, t) : t < 0.5 ? (a ?? b) : (b ?? a));

function toWorld(spec: Limb, side: number, root: V3, f: Frame, shared: boolean): Limb {
  const cv = (v: V3 | undefined, point: boolean): V3 | undefined => {
    if (!v) return undefined;
    if (spec.local) {
      const w = apply(f.m, [v[0] * side, v[1], v[2]]);
      return point ? add(root, w) : w;
    }
    return shared && side < 0 ? mirror(v) : v;
  };
  return { at: cv(spec.at, true)!, pole: cv(spec.pole, false), toe: cv(spec.toe, false), hand: cv(spec.hand, false), fist: spec.fist };
}

/** Same pose with all four limbs written as world targets (needed to blend two poses). */
export function explicit(p: Pose): Pose {
  const P = pelvisOf(p);
  const C = chestOf(p);
  const out: Pose = { ...p };
  for (const side of [1, -1]) {
    const ownArm = side > 0 ? p.armL : p.armR;
    const sh = inFrame(C, side * D.shoW, D.chest + (p.shrug ?? 0), p.reach ?? 0);
    const arm = toWorld(ownArm ?? p.arms ?? HANG, side, sh, C, !ownArm);
    const ownLeg = side > 0 ? p.legL : p.legR;
    const hip = inFrame(P, side * D.hipW, 0, 0);
    const leg = toWorld(ownLeg ?? p.legs ?? { at: [0.11, D.ankle, p.pelvis[2]], pole: [0.08, 0, 1] }, side, hip, P, !ownLeg);
    if (side > 0) {
      out.armL = arm;
      out.legL = leg;
    } else {
      out.armR = arm;
      out.legR = leg;
    }
  }
  delete out.arms;
  delete out.legs;
  return out;
}

/** Blend two poses (limb targets travel in straight lines in world space). */
export function blend(a: Pose, b: Pose, t: number): Pose {
  const A = explicit(a);
  const B = explicit(b);
  const n = (x: number | undefined, y: number | undefined): number => mix(x ?? 0, y ?? 0, t);
  const limb = (x: Limb, y: Limb): Limb => ({ at: lerp(x.at, y.at, t), pole: vmix(x.pole, y.pole, t), toe: vmix(x.toe, y.toe, t), hand: vmix(x.hand, y.hand, t), fist: t < 0.5 ? x.fist : y.fist });
  return {
    pelvis: lerp(A.pelvis, B.pelvis, t),
    yaw: n(A.yaw, B.yaw),
    pitch: n(A.pitch, B.pitch),
    roll: n(A.roll, B.roll),
    spine: n(A.spine, B.spine),
    twist: n(A.twist, B.twist),
    bend: n(A.bend, B.bend),
    head: n(A.head, B.head),
    headYaw: n(A.headYaw, B.headYaw),
    headRoll: n(A.headRoll, B.headRoll),
    shrug: n(A.shrug, B.shrug),
    reach: n(A.reach, B.reach),
    armL: limb(A.armL!, B.armL!),
    armR: limb(A.armR!, B.armR!),
    legL: limb(A.legL!, B.legL!),
    legR: limb(A.legR!, B.legR!),
    props: t < 0.5 ? a.props : b.props,
  };
}

/** Piecewise blend through timed key poses. */
export function seq(u: number, keys: [number, Pose][]): Pose {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) return blend(keys[i - 1][1], keys[i][1], ease((u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  }
  return keys[keys.length - 1][1];
}

/** Lift the whole athlete off the floor by h, toes pointing down. */
export function air(p: Pose, h: number): Pose {
  const e = explicit(p);
  const t = clamp(h / 0.06);
  const raise = (l: Limb): Limb => ({ ...l, at: [l.at[0], l.at[1] + h + 0.035 * t, l.at[2]], toe: norm(lerp(l.toe ?? [0, 0, 1], [0, -0.75, 0.66], t)) });
  return { ...e, pelvis: [e.pelvis[0], e.pelvis[1] + h, e.pelvis[2]], legL: raise(e.legL!), legR: raise(e.legR!), armL: { ...e.armL!, at: add(e.armL!.at, [0, h, 0]) }, armR: { ...e.armR!, at: add(e.armR!.at, [0, h, 0]) } };
}

// ---------------------------------------------------------------- equipment
export const barbell = (centre: V3, side: V3 = [1, 0, 0], half = 0.95, plate = 0.2): Prop => ({ t: 'bar', a: madd(centre, side, half), b: madd(centre, side, -half), plate });
export const rod = (a: V3, b: V3, r = 0.016): Prop => ({ t: 'bar', a, b, r });

/** Flat bench along z (the athlete lies on it). */
export const bench = (z: number, top = 0.44, halfLen = 0.62, x = 0): Prop[] => [
  { t: 'box', c: [x, 0.02, z - halfLen * 0.72], h: [0.2, 0.02, 0.03], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x, 0.02, z + halfLen * 0.72], h: [0.2, 0.02, 0.03], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x, (top - 0.08) / 2, z - halfLen * 0.72], h: [0.025, (top - 0.08) / 2, 0.025], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x, (top - 0.08) / 2, z + halfLen * 0.72], h: [0.025, (top - 0.08) / 2, 0.025], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x, top - 0.04, z], h: [0.15, 0.04, halfLen], tone: 'pad', layer: 'back' },
];
/** Bench across x (to sit on, or to put a foot / the shoulders on). */
export const benchX = (z: number, top = 0.44, half = 0.55, x = 0): Prop[] => [
  { t: 'box', c: [x - half * 0.75, (top - 0.08) / 2, z], h: [0.025, (top - 0.08) / 2, 0.14], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x + half * 0.75, (top - 0.08) / 2, z], h: [0.025, (top - 0.08) / 2, 0.14], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x, top - 0.04, z], h: [half, 0.04, 0.15], tone: 'pad', layer: 'back' },
];
export const crate = (z: number, top: number, hx = 0.3, hz = 0.22, x = 0): Prop => ({ t: 'box', c: [x, top / 2, z], h: [hx, top / 2, hz], tone: 'wood', layer: 'back' });
export const wall = (z: number, x = 0, half = 0.6, height = 1.9): Prop => ({ t: 'box', c: [x, height / 2, z], h: [half, height / 2, 0.015], tone: 'wall' });
export const cable = (a: V3, b: V3): Prop => ({ t: 'line', a, b, tone: 'cable', w: 0.008 });
export const band = (a: V3, b: V3): Prop => ({ t: 'line', a, b, tone: 'band', w: 0.016 });
/** Cable column: upright with a pulley at height y. */
export const pulley = (x: number, y: number, z: number, height = 2.05): Prop[] => [
  { t: 'box', c: [x, height / 2, z], h: [0.04, height / 2, 0.04], tone: 'frame', layer: 'back' },
  { t: 'box', c: [x, 0.02, z], h: [0.22, 0.02, 0.16], tone: 'frame', layer: 'back' },
  { t: 'disc', c: [x, y, z + (z > 0 ? -0.05 : 0.05)], n: [1, 0, 0], r: 0.045, tone: 'steel' },
];

/** Put a dumbbell in each closed hand. */
export function dumbbells(p: Pose, axis: V3 = [0, 0, 1], which: 'both' | 'L' | 'R' = 'both'): Pose {
  const e = explicit(p);
  const props = [...(p.props ?? [])];
  if (which !== 'R') {
    e.armL = { ...e.armL!, fist: true };
    props.push({ t: 'db', at: e.armL.at, axis });
  }
  if (which !== 'L') {
    e.armR = { ...e.armR!, fist: true };
    props.push({ t: 'db', at: e.armR.at, axis: mirror(axis) });
  }
  return { ...e, props };
}

/** Standing tall. */
export interface StandOpts {
  half?: number;
  toe?: number;
  drop?: number;
  back?: number;
  pitch?: number;
}
export function stand(o: StandOpts = {}): Pose {
  const half = o.half ?? 0.11;
  const toe = o.toe ?? 8;
  return {
    pelvis: [0, standY(half) - (o.drop ?? 0), -(o.back ?? 0)],
    pitch: o.pitch ?? 0,
    head: -(o.pitch ?? 0) * 0.5,
    legs: { at: foot(half), toe: toeOut(toe), pole: [sind(toe) * 1.3 + 0.05, 0, 1] },
    arms: HANG,
  };
}

// ================================================================ squat family
export interface SquatOpts {
  depth?: number;
  half?: number;
  back?: number;
  lean?: number;
  toe?: number;
  load?: 'none' | 'back' | 'front' | 'goblet' | 'sides' | 'prayer';
}

export function squat(k: number, o: SquatOpts = {}): Pose {
  const half = o.half ?? 0.19;
  const toe = o.toe ?? 18;
  const lean = (o.lean ?? 38) * k;
  const p: Pose = {
    pelvis: [0, standY(half, 0.02) - (o.depth ?? 0.5) * k, -(o.back ?? 0.24) * k],
    pitch: lean,
    spine: -lean * 0.3,
    head: -lean * 0.6,
    legs: { at: foot(half, 0.02), toe: toeOut(toe), pole: [sind(toe) * 1.3, 0, 1] },
  };
  const c = chestOf(p);
  const load = o.load ?? 'none';
  if (load === 'none') {
    p.arms = mixLimb(HANG, { at: [-0.03, 0.12, 0.5], pole: [0.3, -1, -0.2], local: true }, k);
  } else if (load === 'prayer') {
    p.arms = mixLimb(HANG, { at: [-0.17, -0.2, 0.2], pole: [1, -0.4, 0.1], local: true }, ease(k * 1.6));
  } else if (load === 'back') {
    p.armL = { at: inFrame(c, 0.36, 0.29, -0.09), pole: [0.3, -1, -0.5], fist: true };
    p.armR = { at: inFrame(c, -0.36, 0.29, -0.09), pole: [-0.3, -1, -0.5], fist: true };
    p.props = [barbell(inFrame(c, 0, 0.3, -0.1), c.m[0])];
  } else if (load === 'front') {
    p.armL = { at: inFrame(c, 0.215, 0.3, 0.1), pole: [0.1, -0.2, 1], fist: true };
    p.armR = { at: inFrame(c, -0.215, 0.3, 0.1), pole: [-0.1, -0.2, 1], fist: true };
    p.props = [barbell(inFrame(c, 0, 0.285, 0.105), c.m[0])];
  } else if (load === 'goblet') {
    p.armL = { at: inFrame(c, 0.055, 0.2, 0.17), pole: [0.5, -1, 0], fist: true };
    p.armR = { at: inFrame(c, -0.055, 0.2, 0.17), pole: [-0.5, -1, 0], fist: true };
    p.props = [{ t: 'kb', at: inFrame(c, 0, 0.235, 0.18), dir: [0, -1, 0], size: 0.95 }];
  } else {
    p.arms = HANG;
    return dumbbells(p);
  }
  return p;
}

export function boxSquat(k: number): Pose {
  const p = squat(k, { load: 'back', depth: 0.36, back: 0.31, lean: 42 });
  p.props!.push(crate(-0.52, 0.45, 0.26, 0.2));
  return p;
}

export function wallSit(k: number): Pose {
  const wz = -0.17;
  return {
    pelvis: [0, mix(0.86, 0.5, k), wz + 0.155],
    legs: { at: foot(0.12, mix(0.24, 0.47, k)), pole: [0.05, 0, 1] },
    arms: { at: [0.02, -0.5, 0.08], pole: [0.3, 0, -1], local: true },
    props: [wall(wz - 0.015)],
  };
}

/** Squat down, jump, land: u is the position in the cycle. */
export function jumpSquat(u: number, o: SquatOpts = {}): Pose {
  const dip = u < 0.34 ? ease(u / 0.34) * 0.72 : u < 0.46 ? 0.72 * (1 - ease((u - 0.34) / 0.12)) : u < 0.74 ? 0 : u < 0.86 ? 0.42 * ease((u - 0.74) / 0.12) : 0.42 * (1 - ease((u - 0.86) / 0.14));
  const f = clamp((u - 0.46) / 0.28);
  const h = u > 0.46 && u < 0.74 ? 0.24 * 4 * f * (1 - f) : 0;
  const p = squat(dip, { depth: 0.44, lean: 34, ...o });
  // Arms swing back in the dip and drive up in the jump.
  const swing = u < 0.34 ? ease(u / 0.34) : u < 0.5 ? 1 - ease((u - 0.34) / 0.16) * 2 : u < 0.74 ? -1 : -1 + ease((u - 0.74) / 0.2);
  p.arms = { at: lerp([0.04, -0.5, 0.12], swing > 0 ? [0.08, -0.36, -0.36] : [0.02, 0.4, 0.3], Math.abs(swing)), pole: [0.3, -0.3, -1], local: true };
  return h > 0 ? air(p, h) : p;
}

export function pistolSquat(k: number): Pose {
  const p: Pose = {
    pelvis: [0.03, mix(standY(0.1), 0.37, k), -0.2 * k],
    pitch: 40 * k,
    spine: 8 * k,
    head: -30 * k,
    legL: { at: foot(0.07, 0.02), pole: [0.1, 0, 1] },
    legR: { at: [-0.09, mix(0.09, 0.35, k), mix(0.12, 0.61, k)], pole: [0, 1, 0.2], toe: norm([0, 0.5, 0.85]) },
    arms: mixLimb(HANG, { at: [-0.04, 0.2, 0.48], pole: [0.3, -1, -0.2], local: true }, ease(k * 1.5)),
  };
  return p;
}

/** Step sideways into a lunge (frontal plane). */
export function lateralLunge(k: number): Pose {
  const p: Pose = {
    pelvis: [0.5 * k, mix(standY(0.12), 0.66, k), -0.16 * k],
    pitch: 28 * k,
    spine: -8 * k,
    head: -14 * k,
    legL: { at: [mix(0.12, 0.74, k), D.ankle + 0.05 * Math.sin(Math.PI * k), 0.02], toe: toeOut(12), pole: [0.3, 0, 1] },
    legR: { at: foot(-0.12, 0.02), toe: toeOut(-8), pole: [-0.1, 0, 1] },
  };
  const c = chestOf(p);
  p.armL = { at: inFrame(c, 0.035, 0.14, 0.2), pole: [0.8, -0.6, 0], fist: true };
  p.armR = { at: inFrame(c, -0.035, 0.14, 0.2), pole: [-0.8, -0.6, 0], fist: true };
  return p;
}

export function cossackSquat(k: number): Pose {
  const half = 0.47;
  const p: Pose = {
    pelvis: [0.36 * k, mix(standY(half), 0.34, k), -0.1 * k],
    pitch: 24 * k,
    head: -14 * k,
    legL: { at: foot(half, 0.02), toe: toeOut(32), pole: [0.6, 0, 1] },
    legR: { at: [-half, mix(D.ankle, 0.095, k), 0.02], toe: norm(lerp(toeOut(-25), [-0.35, 0.85, 0.3], ease(k))), pole: [-0.2, 0.3, 1] },
  };
  const c = chestOf(p);
  p.armL = { at: inFrame(c, 0.035, 0.16, 0.22), pole: [0.8, -0.6, 0], fist: true };
  p.armR = { at: inFrame(c, -0.035, 0.16, 0.22), pole: [-0.8, -0.6, 0], fist: true };
  return p;
}

/** Hack squat machine: the back slides on rails leaning 25° back. */
export function hackSquat(k: number): Pose {
  const A = 25;
  const d: V3 = [0, cosd(A), -sind(A)];
  const plate: V3 = [0, 0.2, 0.5];
  const ankle = madd(plate, d, 0.07);
  const hip = madd(ankle, d, mix(LEG - 0.03, 0.42, k));
  const p: Pose = {
    pelvis: [0, hip[1], hip[2]],
    pitch: -A,
    legs: { at: [0.15, ankle[1], ankle[2]], pole: [0.15, sind(A), cosd(A)], toe: [0.12, sind(A), cosd(A)] },
  };
  const c = chestOf(p);
  p.armL = { at: inFrame(c, 0.27, 0.25, 0.1), pole: [0.4, -1, 0.3], fist: true };
  p.armR = { at: inFrame(c, -0.27, 0.25, 0.1), pole: [-0.4, -1, 0.3], fist: true };
  const pad = inFrame(c, 0, 0.1, -0.125);
  p.props = [
    { t: 'box', c: madd(plate, d, -0.02), h: [0.3, 0.02, 0.2], pitch: -A, tone: 'frame', layer: 'back' },
    { t: 'line', a: [0.3, 0.06, 0.62], b: [0.3, 1.62, -0.11], tone: 'frame', w: 0.03, layer: 'back' },
    { t: 'line', a: [-0.3, 0.06, 0.62], b: [-0.3, 1.62, -0.11], tone: 'frame', w: 0.03, layer: 'back' },
    { t: 'box', c: pad, h: [0.17, 0.3, 0.03], pitch: -A, tone: 'pad', layer: 'back' },
    rod(inFrame(c, 0.27, 0.25, 0.1), inFrame(c, 0.27, 0.25, -0.1)),
    rod(inFrame(c, -0.27, 0.25, 0.1), inFrame(c, -0.27, 0.25, -0.1)),
  ];
  return p;
}

// ================================================================ hinge family
export interface HingeOpts {
  half?: number;
  toe?: number;
  grip?: number;
}
/** Hip height reached when the arms hang straight to a bar at y: the lockout height of a deadlift. */
export const lockoutY = (half = 0.13, grip = 0.26): number => standY(half) - 0.004 + TRUNK - Math.sqrt((ARM - 0.014) ** 2 - (D.shoW - grip) ** 2);

/** Arms hang straight to a bar at (y, z); the trunk leans by `pitch`; the hips go where that puts them. */
export function hangHinge(barY: number, barZ: number, pitch: number, o: HingeOpts = {}): Pose {
  const half = o.half ?? 0.13;
  const toe = o.toe ?? 12;
  const u = up(pitch);
  const grip = o.grip ?? 0.26;
  const shY = barY + Math.sqrt((ARM - 0.014) ** 2 - (D.shoW - grip) ** 2);
  return {
    pelvis: [0, shY - TRUNK * u[1], barZ - TRUNK * u[2]],
    pitch,
    head: -pitch * 0.5,
    legs: { at: foot(half, 0.02), toe: toeOut(toe), pole: [sind(toe) * 1.3, 0, 1] },
    arms: { at: [grip, barY, barZ], pole: [0.3, 0.2, -1], fist: true },
  };
}

export function deadlift(k: number): Pose {
  const y = mix(0.2, lockoutY(), k);
  const z = mix(0.08, 0.115, k);
  const p = hangHinge(y, z, 72 * (1 - k) ** 1.15);
  p.props = [barbell([0, y, z])];
  return p;
}

export function romanianDeadlift(k: number): Pose {
  const y = mix(lockoutY(), 0.4, k);
  const z = mix(0.115, 0.1, k);
  const p = hangHinge(y, z, 68 * k);
  p.props = [barbell([0, y, z])];
  return p;
}

export function sumoDeadlift(k: number): Pose {
  const half = 0.33;
  const y = mix(0.2, lockoutY(half, 0.14), k);
  const z = mix(0.07, 0.115, k);
  const p = hangHinge(y, z, 58 * (1 - k) ** 1.1, { half, toe: 36, grip: 0.14 });
  p.props = [barbell([0, y, z])];
  return p;
}

export function kettlebellDeadlift(k: number): Pose {
  const half = 0.2;
  const y = mix(0.2, lockoutY(half, 0.045), k);
  const z = mix(0.03, 0.1, k);
  const p = hangHinge(y, z, 64 * (1 - k) ** 1.1, { half, toe: 18, grip: 0.045 });
  p.props = [{ t: 'kb', at: [0, y, z] }];
  return p;
}

export function goodMorning(k: number): Pose {
  const p: Pose = {
    pelvis: [0, standY(0.14) - 0.05 * k, -0.2 * k],
    pitch: 70 * k,
    head: -32 * k,
    legs: { at: foot(0.14, 0.02), toe: toeOut(10), pole: [0.2, 0, 1] },
  };
  const c = chestOf(p);
  p.armL = { at: inFrame(c, 0.36, 0.29, -0.09), pole: [0.3, -1, -0.5], fist: true };
  p.armR = { at: inFrame(c, -0.36, 0.29, -0.09), pole: [-0.3, -1, -0.5], fist: true };
  p.props = [barbell(inFrame(c, 0, 0.3, -0.1), c.m[0])];
  return p;
}

export function cablePullThrough(k: number): Pose {
  const p: Pose = {
    pelvis: [0, standY(0.2) - 0.09 * k, -0.3 * k],
    pitch: 70 * k,
    head: -34 * k,
    legs: { at: foot(0.2, 0.02), toe: toeOut(15), pole: [0.3, 0, 1] },
  };
  const sh = inFrame(chestOf(p), 0, D.chest, 0);
  const beta = mix(9, -30, k);
  const hand = madd(sh, [0, -cosd(beta), sind(beta)], ARM - 0.04);
  p.arms = { at: [0.045, hand[1], hand[2]], pole: [0.6, 0.2, -0.5], fist: true };
  p.props = [...pulley(0, 0.12, -1.2, 1.2), cable([0, 0.12, -1.15], hand)];
  return p;
}

/** Kettlebell swing: hike back (k = 0) to chest height (k = 1). */
export function kettlebellSwing(k: number): Pose {
  const pitch = 68 * (1 - ease(k)) - 4 * k;
  const p: Pose = {
    pelvis: [0, standY(0.2) - 0.1 * (1 - k), -0.24 * (1 - k)],
    pitch,
    head: -pitch * 0.5,
    legs: { at: foot(0.2, 0.02), toe: toeOut(14), pole: [0.3, 0, 1] },
  };
  const c = chestOf(p);
  const beta = mix(-42, 88, ease(k));
  const dir: V3 = [0, -cosd(beta), sind(beta)];
  const sh = inFrame(c, 0, D.chest, 0);
  const hand = madd(sh, dir, ARM - 0.04);
  p.arms = { at: [0.04, hand[1], hand[2]], pole: [0.6, 0, -0.4], fist: true };
  p.props = [{ t: 'kb', at: hand, dir }];
  return p;
}

export function singleLegRdl(k: number): Pose {
  const pitch = 76 * k;
  const p: Pose = {
    pelvis: [0.02, standY(0.1) - 0.02 - 0.03 * k, -0.07 * k],
    pitch,
    head: -pitch * 0.5,
    legL: { at: foot(0.08, 0.02), pole: [0.05, 0, 1] },
    legR: { at: [0, -(LEG - 0.012), -0.03], pole: [0, 0, 1], toe: [0, -0.25, 1], local: true },
  };
  const c = chestOf(p);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  p.armR = { at: [shR[0] + 0.02, shR[1] - (ARM - 0.02), shR[2] + 0.02], pole: [-0.3, 0.2, -1], fist: true };
  p.armL = { at: [shL[0] + 0.1, shL[1] - (ARM - 0.06), shL[2]], pole: [0.3, 0.2, -1] };
  p.props = [{ t: 'db', at: p.armR.at, axis: [0, 0, 1] }];
  return p;
}

/** Hinged over, pull a bar from straight arms to the belly. */
export function barRow(k: number, pitch = 58, floor = false): Pose {
  const u = up(pitch);
  const hang = floor ? 0.2 : standY(0.15) - 0.1 + TRUNK * u[1] - (ARM - 0.014);
  const pelvisY = floor ? 0.2 + ARM - 0.014 - TRUNK * u[1] : standY(0.15) - 0.1;
  const p: Pose = {
    pelvis: [0, pelvisY, -TRUNK * u[2] + 0.1],
    pitch,
    head: -pitch * 0.5,
    legs: { at: foot(0.15, 0.02), toe: toeOut(10), pole: [0.2, 0, 1] },
  };
  const c = chestOf(p);
  const low: V3 = [0, hang, 0.1];
  const high = inFrame(c, 0, 0.03, 0.15);
  const bar = lerp(low, high, k);
  p.arms = { at: [0.27, bar[1], bar[2]], pole: [0.45, 0.8, -0.5], fist: true };
  p.props = [barbell(bar)];
  return p;
}

export function reverseFly(k: number): Pose {
  const pitch = 66;
  const p: Pose = {
    pelvis: [0, standY(0.13) - 0.09, -0.22],
    pitch,
    head: -30,
    legs: { at: foot(0.13, 0.02), pole: [0.1, 0, 1] },
  };
  const c = chestOf(p);
  const sh = inFrame(c, D.shoW, D.chest, 0);
  const low: V3 = [0.07, sh[1] - (ARM - 0.05), sh[2] + 0.06];
  const high: V3 = [sh[0] + ARM - 0.07, sh[1] + 0.02, sh[2] + 0.05];
  // Sweep the hand on an arc around the shoulder.
  const a = ease(k);
  const mid: V3 = [mix(low[0], high[0], a), mix(low[1], high[1], a * a), mix(low[2], high[2], a)];
  const at = madd(sh, norm(sub(mid, sh)), ARM - 0.05);
  p.arms = { at, pole: [0.2, 0.8, -0.6], fist: true };
  return dumbbells(p, [0, 0, 1]);
}

export function kickback(k: number): Pose {
  const pitch = 64;
  const p: Pose = {
    pelvis: [0, standY(0.13) - 0.1, -0.22],
    pitch,
    head: -30,
    legs: { at: foot(0.13, 0.02), pole: [0.1, 0, 1] },
  };
  const c = chestOf(p);
  const sh = inFrame(c, D.shoW + 0.01, D.chest, 0);
  const back: V3 = [0, -cosd(pitch - 8), -sind(pitch - 8)]; // upper arm along the trunk
  const el = madd(sh, back, D.upper);
  const at = madd(el, norm(lerp([0, -1, 0.15], back, ease(k))), D.fore - 0.005);
  p.arms = { at, pole: [0.1, 0.9, -0.5], fist: true };
  return dumbbells(p, [0, 0, 1]);
}

// ================================================================ lunge family
/** Step back into a lunge. `front`: +1 = left leg stays in front. `walk` slides the whole thing forward instead. */
export function lunge(k: number, front = 1, walk = false): Pose {
  const TOE = 62;
  const lift = ease(k / 0.45);
  const shift = walk ? 0.62 * k : 0;
  const hop = 0.05 * Math.sin(Math.PI * k);
  const frontLeg: Limb = { at: [0.1 * front, D.ankle + (walk ? hop : 0), 0.02 + shift], pole: [0.04 * front, 0, 1] };
  const rearLeg: Limb = {
    at: [-0.1 * front, mix(D.ankle, onToes(TOE), lift) + (walk ? 0 : hop), -0.62 * k + shift],
    pole: [0, -0.6, 1],
    toe: [0, -sind(TOE * lift), cosd(TOE * lift)],
  };
  return {
    pelvis: [0, mix(standY(0.1), 0.53, k), -0.2 * k + shift],
    pitch: 8 * k,
    head: -4 * k,
    legL: front > 0 ? frontLeg : rearLeg,
    legR: front > 0 ? rearLeg : frontLeg,
    arms: HANG,
  };
}

export function bulgarianSplitSquat(k: number): Pose {
  const top = 0.42;
  const p: Pose = {
    pelvis: [0, mix(0.86, 0.5, k), mix(-0.3, -0.34, k)],
    pitch: mix(4, 14, k),
    head: -6 * k,
    legL: { at: foot(0.1, 0), pole: [0.05, 0, 1] },
    legR: { at: [-0.1, top + 0.06, -0.86], pole: [0, -1, 0.25], toe: norm([0, -0.15, -1]) },
    arms: HANG,
  };
  return { ...dumbbells(p), props: [...benchX(-0.95, top, 0.5), ...dumbbells(p).props!] };
}

export function stepUp(k: number): Pose {
  const top = 0.3;
  const p: Pose = {
    pelvis: [0, mix(0.9, top + standY(0.1), k), mix(0.05, 0.33, k)],
    pitch: 16 * (1 - k),
    head: -8 * (1 - k),
    legL: { at: [0.1, top + D.ankle, 0.36], pole: [0.05, 0, 1] },
    legR: { at: [-0.1, mix(D.ankle, top + D.ankle, ease(k)) + 0.06 * Math.sin(Math.PI * k), mix(0, 0.32, ease(k))], pole: [-0.05, 0, 1] },
    arms: HANG,
  };
  const d = dumbbells(p);
  return { ...d, props: [crate(0.42, top, 0.32, 0.22), ...d.props!] };
}

/** Leg press at 45°: k = 0 legs extended, k = 1 knees to the chest. */
export function legPress(k: number): Pose {
  const d: V3 = [0, sind(45), cosd(45)];
  const hip: V3 = [0, 0.4, 0];
  const ankle = madd(hip, d, mix(LEG - 0.04, 0.46, k));
  const p: Pose = {
    pelvis: hip,
    pitch: -42,
    head: 20,
    legs: { at: [0.13, ankle[1], ankle[2]], pole: [0.25, 1, -0.35], toe: [0.1, sind(45), -cosd(45)] },
    arms: { at: [0.06, -0.42, 0.2], pole: [0.5, 0.2, -1], local: true, fist: true },
  };
  const c = chestOf(p);
  const sole = madd(ankle, d, 0.085);
  p.props = [
    { t: 'box', c: [0, 0.14, -0.02], h: [0.2, 0.14, 0.2], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, 0.27, 0.02], h: [0.19, 0.03, 0.17], tone: 'pad', layer: 'back' },
    { t: 'box', c: inFrame(c, 0, 0.12, -0.125), h: [0.19, 0.33, 0.035], pitch: -42, tone: 'pad', layer: 'back' },
    { t: 'line', a: [0.33, 0.1, 0.25], b: [0.33, 1.22, 1.37], tone: 'frame', w: 0.035, layer: 'back' },
    { t: 'line', a: [-0.33, 0.1, 0.25], b: [-0.33, 1.22, 1.37], tone: 'frame', w: 0.035, layer: 'back' },
    { t: 'box', c: sole, h: [0.3, 0.24, 0.02], pitch: 45, tone: 'frame' },
    { t: 'disc', c: madd(sole, [1, 0, 0], 0.4), n: [1, 0, 0], r: 0.17, tone: 'plate' },
    { t: 'disc', c: madd(sole, [1, 0, 0], -0.4), n: [1, 0, 0], r: 0.17, tone: 'plate' },
  ];
  return p;
}

// ================================================================ push-up, plank and floor (face down)
export interface PushOpts {
  hands?: number; // height of the hand support
  feet?: number; // height of the foot support
  width?: number;
  low?: number; // shoulder height above the hands at the bottom
  tuck?: boolean; // elbows close to the ribs
  bench?: 'hands' | 'feet';
}
const PLANK_TOE = 72;

export function pushup(k: number, o: PushOpts = {}): Pose {
  const anY = (o.feet ?? 0) + onToes(PLANK_TOE);
  const handY = (o.hands ?? 0) + 0.035;
  const width = o.width ?? 0.27;
  const top = handY + Math.sqrt((ARM - 0.012) ** 2 - (D.shoW - width) ** 2);
  const shY = mix(top, handY + (o.low ?? 0.15), k);
  const th = (Math.asin((shY - anY) / BODY) * 180) / Math.PI;
  const th0 = (Math.asin((top - anY) / BODY) * 180) / Math.PI;
  const anZ = -BODY * cosd(th0) + 0.02;
  const p: Pose = {
    pelvis: [0, anY + (LEG - 0.006) * sind(th), anZ + (LEG - 0.006) * cosd(th)],
    pitch: 90 - th,
    head: -18,
    legs: { at: [0.09, anY, anZ], toe: [0, -sind(PLANK_TOE), cosd(PLANK_TOE)], pole: [0, -1, 0.2] },
    arms: { at: [width, handY, 0], pole: o.tuck ? [0.25, 0.1, -1] : [0.8, 0.15, -0.6], hand: [0, 0, 1] },
  };
  if (o.bench === 'hands') p.props = benchX(0.07, o.hands ?? 0.44, 0.5);
  if (o.bench === 'feet') p.props = benchX(anZ - 0.02, o.feet ?? 0.44, 0.45);
  return p;
}

/** Shoulder blades only: the chest sinks between straight arms. */
export function scapularPushup(k: number): Pose {
  return { ...pushup(k, { low: ARM - 0.012 - 0.05 }), reach: -0.05 * k };
}

export function pikePushup(k: number): Pose {
  const anY = onToes(45);
  const pitch = mix(136, 157, k);
  return {
    pelvis: lerp([0, 0.9, -0.42], [0, 0.86, -0.4], k),
    pitch,
    head: 6,
    legs: { at: [0.1, anY, -0.75], toe: [0, -sind(45), cosd(45)], pole: [0, -0.5, 1] },
    arms: { at: [0.27, 0.035, 0], pole: [0.9, 0, -0.4], hand: [0, 0, 1] },
  };
}

export function forearmPlank(): Pose {
  const anY = onToes(PLANK_TOE);
  const shY = 0.045 + D.upper;
  const th = (Math.asin((shY - anY) / BODY) * 180) / Math.PI;
  const anZ = -BODY * cosd(th);
  return {
    pelvis: [0, anY + (LEG - 0.006) * sind(th), anZ + (LEG - 0.006) * cosd(th)],
    pitch: 90 - th,
    head: -12,
    legs: { at: [0.09, anY, anZ], toe: [0, -sind(PLANK_TOE), cosd(PLANK_TOE)], pole: [0, -1, 0.2] },
    arms: { at: [0.19, 0.035, D.fore - 0.005], pole: [0, -1, -0.3], hand: [0, 0, 1] },
  };
}

/** Side plank on the left forearm, facing the viewer (head to the right). */
export function sidePlank(): Pose {
  const th = 16.66;
  const p: Pose = {
    pelvis: [0, 0.388, 0],
    roll: -(90 - th),
    legL: { at: [-0.779, 0.052, 0], toe: [0, 0, 1], pole: [0, 0, 1] },
    legR: { at: [-0.79, 0.155, 0.02], toe: [0, 0, 1], pole: [0, 0, 1] },
  };
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  p.armL = { at: [shL[0], 0.035, D.fore - 0.005], pole: [0, -1, -0.3], hand: [0, 0, 1] };
  p.armR = { at: [shR[0] - 0.02, shR[1] + ARM - 0.03, shR[2]], pole: [1, 0, -0.2] };
  return p;
}

/** Plank with the hips a little high, so a knee can drive under the chest without scraping the floor. */
export function mountainClimber(u: number): Pose {
  const plank = pushup(0);
  const back = plank.legs!.at;
  const hipY = 0.5;
  const th = (Math.asin((hipY - back[1]) / (LEG - 0.006)) * 180) / Math.PI;
  const base: Pose = {
    ...plank,
    pelvis: [0, hipY, back[2] + (LEG - 0.006) * cosd(th)],
    pitch: 90 - (Math.asin((0.56 - hipY) / TRUNK) * 180) / Math.PI,
  };
  const drive = (ph: number, side: number): Limb => {
    const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
    return {
      at: lerp([side * back[0], back[1], back[2]], [side * back[0], 0.175, back[2] + 0.8], s),
      toe: norm(lerp(plank.legs!.toe!, [0, -0.707, 0.707], s)),
      pole: [0, mix(-1, 0.25, s), mix(0.2, 1, s)],
    };
  };
  return { ...base, legs: undefined, legL: drive(u, 1), legR: drive(u + 0.5, -1) };
}

export function bearCrawl(u: number): Pose {
  const anY = onToes(60);
  const sway = 0.035 * Math.sin(2 * Math.PI * u);
  const step = (ph: number): number => Math.max(0, Math.sin(2 * Math.PI * ph));
  const p: Pose = {
    pelvis: [0, 0.52, sway],
    pitch: 84,
    head: -16,
    legL: { at: [0.11, anY + 0.07 * step(u), -0.36 + 0.07 * step(u)], toe: [0, -sind(60), cosd(60)], pole: [0.1, -0.4, 1] },
    legR: { at: [-0.11, anY + 0.07 * step(u + 0.5), -0.36 + 0.07 * step(u + 0.5)], toe: [0, -sind(60), cosd(60)], pole: [-0.1, -0.4, 1] },
    armL: { at: [0.21, 0.035 + 0.07 * step(u + 0.5), 0.5 + 0.07 * step(u + 0.5)], pole: [0.5, 0, -1], hand: [0, 0, 1] },
    armR: { at: [-0.21, 0.035 + 0.07 * step(u), 0.5 + 0.07 * step(u)], pole: [-0.5, 0, -1], hand: [0, 0, 1] },
  };
  return p;
}

/** Move a pose along z (world targets included). */
export function shiftZ(p: Pose, dz: number): Pose {
  const e = explicit(p);
  const mv = (l: Limb): Limb => ({ ...l, at: add(l.at, [0, 0, dz]) });
  return { ...e, pelvis: add(e.pelvis, [0, 0, dz]), armL: mv(e.armL!), armR: mv(e.armR!), legL: mv(e.legL!), legR: mv(e.legR!) };
}

const crouch = (handZ: number): Pose => ({
  pelvis: [0, 0.36, -0.24],
  pitch: 70,
  head: -30,
  legs: { at: foot(0.16, 0), toe: toeOut(14), pole: [0.35, 0, 1] },
  arms: { at: [0.2, 0.035, handZ], pole: [0.5, 0, -1], hand: [0, 0, 1] },
});

export function burpee(u: number): Pose {
  const HZ = 0.32;
  const st = stand({ half: 0.14 });
  const plank = shiftZ(pushup(0, { width: 0.2 }), HZ);
  const low = shiftZ(pushup(1, { width: 0.2 }), HZ);
  const reachUp: Pose = { ...stand({ half: 0.14 }), arms: { at: [0.06, ARM - 0.03, 0.06], pole: [0.4, 0, 1], local: true } };
  if (u > 0.86 && u < 0.97) {
    const f = (u - 0.86) / 0.11;
    return air(reachUp, 0.2 * 4 * f * (1 - f));
  }
  const hop: Pose = {
    pelvis: [0, 0.58, -0.17],
    pitch: 98,
    head: -20,
    legs: { at: [0.12, 0.26, -0.5], toe: [0, -0.8, 0.6], pole: [0.1, -0.2, 1] },
    arms: { at: [0.2, 0.035, HZ], pole: [0.5, 0, -1], hand: [0, 0, 1] },
  };
  return seq(u, [
    [0, st],
    [0.14, crouch(HZ)],
    [0.21, hop],
    [0.28, plank],
    [0.4, low],
    [0.52, plank],
    [0.59, hop],
    [0.66, crouch(HZ)],
    [0.8, st],
    [0.86, reachUp],
    [0.97, reachUp],
    [1, st],
  ]);
}

const forwardFold = (handZ: number): Pose => ({
  pelvis: [0, 0.9, -0.1],
  pitch: 150,
  head: 10,
  legs: { at: foot(0.1, 0), pole: [0.05, 0, 1] },
  arms: { at: [0.18, 0.035, handZ], pole: [0.5, 0, -1], hand: [0, 0, 1] },
});

export function inchworm(u: number): Pose {
  const st = stand({ half: 0.1 });
  const plank = shiftZ(pushup(0, { width: 0.2 }), BODY * cosd(16.5) + 0.07);
  const pike: Pose = {
    pelvis: [0, 0.78, 0.24],
    pitch: 140,
    head: 8,
    legs: { at: [0.1, onToes(40), 0.0], toe: [0, -sind(40), cosd(40)], pole: [0, -0.4, 1] },
    arms: { at: [0.19, 0.035, 0.92], pole: [0.5, 0, -1], hand: [0, 0, 1] },
  };
  return seq(u, [
    [0, st],
    [0.14, forwardFold(0.45)],
    [0.28, pike],
    [0.42, plank],
    [0.58, plank],
    [0.72, pike],
    [0.86, forwardFold(0.45)],
    [1, st],
  ]);
}

/** On hands and knees. */
export function allFours(): Pose {
  return {
    pelvis: [0, 0.475, 0],
    pitch: 80,
    head: -6,
    legs: { at: [0.1, 0.05, -0.42], toe: norm([0, -0.12, -1]), pole: [0, -1, 0.15] },
    arms: { at: [0.2, 0.035, 0.49], pole: [0.4, 0, -1], hand: [0, 0, 1] },
  };
}

export function downwardDog(k: number): Pose {
  const start: Pose = { ...allFours(), pelvis: [0, 0.475, -0.42], legs: { at: [0.1, onToes(60), -0.86], toe: [0, -sind(60), cosd(60)], pole: [0, -1, 0.3] }, arms: { at: [0.24, 0.035, 0.07], pole: [0.4, 0, -1], hand: [0, 0, 1] } };
  const dog: Pose = {
    pelvis: [0, 0.86, -0.52],
    pitch: 145,
    head: 8,
    legs: { at: [0.1, 0.1, -0.86], toe: norm([0, -0.2, 1]), pole: [0, -0.4, 1] },
    arms: { at: [0.24, 0.035, 0.07], pole: [0.6, 0.2, -0.6], hand: [0, 0, 1] },
  };
  return blend(start, dog, k);
}

export function catCow(u: number): Pose {
  const s = Math.sin(2 * Math.PI * u); // +1 = cat (rounded), −1 = cow (arched)
  const base = allFours();
  return { ...base, pitch: 82 - 17 * s, spine: 30 * s, head: 28 * s - 4 };
}

export function birdDog(u: number): Pose {
  const base = explicit(allFours());
  const side = u < 0.5 ? 1 : -1;
  const k = ease(tri(u < 0.5 ? u * 2 : u * 2 - 1) * 1.5);
  const arm = side > 0 ? base.armL! : base.armR!;
  const leg = side > 0 ? base.legR! : base.legL!;
  const armOut: Limb = { ...arm, at: lerp(arm.at, [arm.at[0], 0.6, 1.02], k), pole: [0.3 * side, -1, 0] };
  const legOut: Limb = { ...leg, at: lerp(leg.at, [leg.at[0], 0.46, -0.83], k), pole: [0, -1, 0.3], toe: norm(lerp(leg.toe!, [0, -1, -0.2], k)) };
  return side > 0 ? { ...base, armL: armOut, legR: legOut } : { ...base, armR: armOut, legL: legOut };
}

export function threadTheNeedle(u: number): Pose {
  const base = explicit(allFours());
  const open = span(u, 0.05, 0.3) - span(u, 0.42, 0.62); // reach up
  const under = span(u, 0.5, 0.72) - span(u, 0.86, 1); // thread under
  const c = chestOf({ ...base, twist: -50 * open + 36 * under });
  const upAt = inFrame(c, -D.shoW - 0.04, D.chest + 0.02, -(ARM - 0.03));
  const underAt: V3 = [0.42, 0.07, 0.4];
  const rest = base.armR!.at;
  return {
    ...base,
    twist: -50 * open + 36 * under,
    spine: 8 * under,
    pitch: 80 + 6 * under,
    head: -6,
    headYaw: -50 * open + 20 * under,
    armR: { at: within(inFrame(c, -D.shoW, D.chest, 0), lerp(lerp(rest, upAt, open), underAt, under)), pole: under > 0.3 ? [0, 0.3, -1] : [-1, 0, -0.4], hand: undefined },
    armL: { ...base.armL!, at: within(inFrame(c, D.shoW, D.chest, 0), base.armL!.at) },
  };
}

/** Hip centre when the knees stay planted and the thighs make `phi` degrees with the floor. */
const overKnees = (phi: number): V3 => [0, 0.045 + D.thigh * sind(phi), -D.thigh * cosd(phi)];

export function childsPose(k: number): Pose {
  return {
    pelvis: overKnees(mix(90, 24, k)),
    pitch: mix(80, 86, k),
    spine: 8 * k,
    head: mix(-6, 6, k),
    legs: { at: [mix(0.1, 0.13, k), 0.05, -0.42], toe: norm([0, -0.12, -1]), pole: [0.4 * k, -1, 0.15 + 0.45 * k] },
    arms: { at: [mix(0.2, 0.17, k), 0.035, mix(0.49, 0.56, k)], pole: [0.4 + 0.2 * k, 0.3 * k, -1 + 0.7 * k], hand: [0, 0, 1] },
  };
}

export function adductorRockBack(k: number): Pose {
  const base = allFours();
  return {
    ...base,
    pelvis: overKnees(mix(90, 56, k)),
    pitch: 80 + 6 * k,
    legs: undefined,
    legR: { at: [-0.1, 0.05, -0.42], toe: norm([0, -0.12, -1]), pole: [0, -1, 0.15] },
    legL: { at: [0.74, D.ankle + 0.012, -0.04], toe: [0, 0, 1], pole: [0.2, 1, 0.2] },
  };
}

/** Lying face down. */
const prone = (): Pose => ({
  pelvis: [0, 0.1, 0],
  pitch: 90,
  head: -8,
  legs: { at: [0.1, 0.07, -(LEG - 0.002)], toe: [0, 0.12, -1], pole: [0, -1, 0] },
  arms: { at: [0.22, 0.035, 0.42], pole: [0.5, 0.6, -0.6], hand: [0, 0, 1] },
});

export function cobra(k: number): Pose {
  const p = prone();
  return { ...p, pitch: 90 - 8 * k, spine: -38 * k, head: -8 - 14 * k, arms: { at: [0.22, 0.035, 0.44], pole: [0.4, 0.5, -0.8], hand: [0, 0, 1] } };
}

export function superman(k: number): Pose {
  const p = prone();
  const L = LEG - 0.004;
  return {
    ...p,
    spine: -16 * k,
    head: -8 - 8 * k,
    legs: { at: [0.02, -L * cosd(9.5 * k), 0.03 * (1 - k) - L * sind(9.5 * k)], toe: [0, -1, -0.12], pole: [0, 0, 1], local: true },
    arms: { at: [0.1, 0.5, 0.02 - 0.1 * k], pole: [0.6, 0, -0.6], local: true },
  };
}

export function proneYtw(u: number): Pose {
  const p = prone();
  const lift = (a: number, b: number): number => span(u, a, a + 0.08) - span(u, b - 0.08, b);
  const y = lift(0.03, 0.33);
  const t = lift(0.36, 0.66);
  const w = lift(0.69, 0.99);
  const shape = u < 0.345 ? 0 : u < 0.675 ? 1 : 2;
  const at: V3 = shape === 0 ? [0.2, 0.47, -0.02 - 0.1 * y] : shape === 1 ? [0.5, 0.06, -0.02 - 0.1 * t] : [0.26, 0.0, -0.02 - 0.1 * w];
  return { ...p, spine: -6 * (y + t + w), arms: { at, pole: shape === 2 ? [0.6, -1, -0.3] : [0.5, -0.5, -0.5], local: true } };
}

// ================================================================ lying on the back
/** Flat on the back, knees bent, feet on the floor. */
const supine = (): Pose => ({
  pelvis: [0, 0.1, 0],
  pitch: -90,
  head: 0,
  legs: { at: foot(0.11, 0.46), pole: [0.1, 1, 0.2] },
  arms: { at: [0.3, 0.035, 0], pole: [0.6, 0.2, -0.4], hand: [0, 0, 1] },
});

/** Hips lift while the shoulders stay on the floor. `raise`: free leg up (single-leg version). */
export function gluteBridge(k: number, single = false): Pose {
  const a = 27 * k;
  const S: V3 = [0, 0.1, -TRUNK];
  const p: Pose = {
    pelvis: [0, S[1] + TRUNK * sind(a), S[2] + TRUNK * cosd(a)],
    pitch: -(90 + a),
    head: a,
    legs: { at: foot(0.11, 0.44), pole: [0.1, 1, 0.2] },
    arms: { at: [0.3, 0.035, -0.02], pole: [0.6, 0.2, -0.4], hand: [0, 0, 1] },
  };
  if (single) {
    p.legL = { at: foot(0.09, 0.44), pole: [0.1, 1, 0.2] };
    p.legR = { at: [0, -0.74, 0.37], pole: [0, 0, 1], toe: [0, -0.5, 0.85], local: true };
    p.legs = undefined;
  }
  return p;
}

export function hipThrust(k: number): Pose {
  const top = 0.44;
  const S: V3 = [0, top + 0.09, -0.36];
  const pelvis = lerp([0, 0.2, 0.012], [0, 0.5, 0.139], k);
  const d = norm(sub(S, pelvis));
  const p: Pose = {
    pelvis,
    pitch: (Math.atan2(d[2], d[1]) * 180) / Math.PI,
    head: mix(34, 12, k),
    legs: { at: foot(0.15, 0.55), pole: [0.15, 1, 0.3], toe: toeOut(8) },
  };
  const bar = inFrame(pelvisOf(p), 0, 0.03, 0.118);
  p.arms = { at: [0.3, bar[1], bar[2]], pole: [0.8, -0.2, -0.5], fist: true };
  p.props = [...benchX(-0.5, top, 0.5), barbell(bar)];
  return p;
}

export function deadBug(u: number): Pose {
  const sL = 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, u * 2)); // left arm + right leg
  const sR = u > 0.5 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * (u * 2 - 1)) : 0;
  const armUp = (x: number): V3 => [x, 0.1 + ARM - 0.03, -TRUNK + 0.02];
  const armBack = (x: number): V3 => [x, 0.14, -TRUNK - ARM + 0.06];
  const legUp = (x: number): V3 => [x, 0.1 + D.thigh, D.shin - 0.01];
  const legOut = (x: number): V3 => [x, 0.16, LEG - 0.03];
  return {
    pelvis: [0, 0.1, 0],
    pitch: -90,
    head: 4,
    armL: { at: lerp(armUp(0.2), armBack(0.2), sL), pole: [0.4, 0, 1] },
    armR: { at: lerp(armUp(-0.2), armBack(-0.2), sR), pole: [-0.4, 0, 1] },
    legR: { at: lerp(legUp(-0.1), legOut(-0.1), sL), pole: [0, 1, -0.2], toe: [0, 0.6, 0.8] },
    legL: { at: lerp(legUp(0.1), legOut(0.1), sR), pole: [0, 1, -0.2], toe: [0, 0.6, 0.8] },
  };
}

export function hollowHold(k: number): Pose {
  const flat: Pose = { ...supine(), legs: { at: [0.06, 0.07, LEG - 0.01], pole: [0, 1, 0], toe: [0, 0.5, 0.86] }, arms: { at: [0.16, 0.06, -TRUNK - ARM + 0.03], pole: [0.5, 1, 0] } };
  const hollow: Pose = {
    pelvis: [0, 0.1, 0],
    pitch: -84,
    spine: 20,
    head: 10,
    legs: { at: [0.05, 0.3, LEG - 0.06], pole: [0, 1, 0], toe: [0, 0.3, 0.95] },
    arms: { at: [0.14, 0.42, -TRUNK - ARM + 0.14], pole: [0.5, 1, 0] },
  };
  return blend(flat, hollow, k);
}

export function vUp(k: number): Pose {
  const flat: Pose = { ...supine(), legs: { at: [0.06, 0.07, LEG - 0.01], pole: [0, 1, 0], toe: [0, 0.5, 0.86] }, arms: { at: [0.16, 0.06, -TRUNK - ARM + 0.03], pole: [0.5, 1, 0] } };
  const v: Pose = {
    pelvis: [0, 0.11, 0],
    pitch: -42,
    spine: 12,
    head: 4,
    legs: { at: [0.05, 0.7, 0.44], pole: [0, 1, -0.4], toe: norm([0, 0.8, 0.6]) },
    arms: { at: [0.1, 0.58, 0.18], pole: [0.6, -0.3, -0.5] },
  };
  return blend(flat, v, k);
}

export function bicycleCrunch(u: number): Pose {
  const s = Math.sin(2 * Math.PI * u); // +1: left knee in, right elbow toward it
  const kn = (ph: number): number => 0.5 + 0.5 * ph;
  const p: Pose = {
    pelvis: [0, 0.1, 0],
    pitch: -90,
    spine: 30,
    twist: -30 * s,
    head: 12,
  };
  const c = chestOf(p);
  const headC = inFrame(c, 0, D.neck + D.head, 0);
  p.armL = { at: madd(madd(headC, c.m[0], 0.1), c.m[2], -0.07), pole: madd(c.m[0], c.m[1], 0.2) };
  p.armR = { at: madd(madd(headC, c.m[0], -0.1), c.m[2], -0.07), pole: madd(mirror(c.m[0]), c.m[1], 0.2) };
  p.armR.pole = [-c.m[0][0], -c.m[0][1], -c.m[0][2]];
  const leg = (x: number, a: number): Limb => ({ at: lerp([x, 0.2, LEG - 0.06], [x, 0.44, 0.3], a), pole: [0, 1, -0.3], toe: [0, 0.5, 0.86] });
  p.legL = leg(0.1, kn(s));
  p.legR = leg(-0.1, kn(-s));
  return p;
}

export function mcgillCurlUp(k: number): Pose {
  return {
    pelvis: [0, 0.1, 0],
    pitch: -90,
    spine: 12 * k,
    head: 10 * k,
    legL: { at: foot(0.11, 0.44), pole: [0.1, 1, 0.2] },
    legR: { at: [-0.1, 0.07, LEG - 0.01], pole: [0, 1, 0], toe: [0, 0.6, 0.8] },
    arms: { at: [0.1, 0.05, -0.1], pole: [1, 0, -0.5], hand: [-1, 0, 0] },
  };
}

export function russianTwist(u: number): Pose {
  const s = Math.sin(2 * Math.PI * u);
  const p: Pose = {
    pelvis: [0, 0.1, 0],
    pitch: -38,
    spine: 10,
    twist: 42 * s,
    head: 4,
    headYaw: 14 * s,
    legs: { at: [0.1, 0.16, 0.6], pole: [0.1, 1, -0.2], toe: [0, 0.4, 0.9] },
  };
  const c = chestOf(p);
  const hands = inFrame(c, 0, 0.1, 0.36);
  p.armL = { at: madd(hands, c.m[0], 0.04), pole: [0.6, -1, 0], fist: true };
  p.armR = { at: madd(hands, c.m[0], -0.04), pole: [-0.6, -1, 0], fist: true };
  return p;
}

export function bandHamstringStretch(k: number): Pose {
  const a = mix(18, 86, k);
  const an: V3 = [0.1, 0.1 + (LEG - 0.01) * sind(a), (LEG - 0.01) * cosd(a)];
  const p: Pose = {
    pelvis: [0, 0.1, 0],
    pitch: -90,
    head: 0,
    legL: { at: an, pole: [0, cosd(a), -sind(a)], toe: [0, cosd(a + 80), -sind(a + 80)] },
    legR: { at: [-0.1, 0.07, LEG - 0.01], pole: [0, 1, 0], toe: [0, 0.6, 0.8] },
  };
  const hand: V3 = [0.1, mix(0.3, 0.4, k), mix(-0.08, -0.22, k)];
  p.armL = { at: [0.14, hand[1], hand[2]], pole: [1, -0.3, 0], fist: true };
  p.armR = { at: [0.02, hand[1], hand[2] + 0.02], pole: [-1, -0.3, 0], fist: true };
  const sole = madd(an, p.legL!.toe!, 0.1);
  p.props = [band(sole, [0.14, hand[1], hand[2]]), band(sole, [0.02, hand[1], hand[2] + 0.02])];
  return p;
}

// ================================================================ bench press family
export interface BenchOpts {
  incline?: number;
  grip?: number;
  tool?: 'bar' | 'db' | 'fly' | 'skull';
  tuck?: boolean;
}
const BENCH_TOP = 0.44;

/** Incline bench: a seat and a back pad at `inc` degrees. */
const inclineBench = (inc: number): Prop[] => {
  const d: V3 = [0, sind(inc), -cosd(inc)];
  const back = madd([0, BENCH_TOP + 0.1, 0], d, 0.36);
  const pad: V3 = [back[0], back[1] - 0.135 * cosd(inc), back[2] - 0.135 * sind(inc)];
  return [
    { t: 'box', c: [0, 0.02, 0.1], h: [0.22, 0.02, 0.03], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, 0.02, -0.75], h: [0.22, 0.02, 0.03], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, 0.2, 0.1], h: [0.025, 0.2, 0.025], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, 0.3, -0.75], h: [0.025, 0.3, 0.025], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, BENCH_TOP - 0.04, 0.02], h: [0.15, 0.04, 0.2], tone: 'pad', layer: 'back' },
    { t: 'box', c: pad, h: [0.15, 0.46, 0.035], pitch: -(90 - inc), tone: 'pad', layer: 'back' },
  ];
};

export function benchPress(k: number, o: BenchOpts = {}): Pose {
  const inc = o.incline ?? 0;
  const tool = o.tool ?? 'bar';
  const p: Pose = {
    pelvis: [0, BENCH_TOP + 0.1, 0],
    pitch: -(90 - inc),
    head: 0,
    legs: { at: foot(0.26, 0.42), pole: [0.3, 1, 0.4], toe: toeOut(14) },
  };
  const c = chestOf(p);
  const sh = inFrame(c, 0, D.chest, 0);
  const top: V3 = [0, sh[1] + ARM - 0.025, sh[2] + 0.02 * (inc > 0 ? 1 : 0)];
  const furniture = inc > 0 ? inclineBench(inc) : bench(-0.33, BENCH_TOP);
  if (tool === 'bar') {
    const grip = o.grip ?? 0.31;
    const bar = lerp(top, inFrame(c, 0, inc > 0 ? 0.25 : 0.2, 0.142), k);
    const pole: V3 = o.tuck ? [0.25, -0.6, 0.8] : [1, -0.5, 0.3];
    p.armL = { at: [grip, bar[1], bar[2]], pole, fist: true };
    p.armR = { at: [-grip, bar[1], bar[2]], pole: mirror(pole), fist: true };
    p.props = [...furniture, barbell(bar)];
  } else if (tool === 'skull') {
    const bar = lerp(top, inFrame(c, 0, 0.55, 0.15), k);
    p.armL = { at: [0.11, bar[1], bar[2]], pole: [0.1, 1, -0.2], fist: true };
    p.armR = { at: [-0.11, bar[1], bar[2]], pole: [-0.1, 1, -0.2], fist: true };
    p.props = [...furniture, barbell(bar, [1, 0, 0], 0.55, 0.11)];
  } else {
    const fly = tool === 'fly';
    const hi: V3 = [fly ? 0.07 : 0.17, top[1], top[2]];
    const lo = fly ? inFrame(c, 0.6, 0.29, 0.04) : inFrame(c, 0.31, 0.24, 0.07);
    // Flyes sweep an arc; presses go straight.
    const a = ease(k);
    const at: V3 = fly ? madd(inFrame(c, D.shoW, D.chest, 0), norm(sub(lerp(hi, lo, a), inFrame(c, D.shoW, D.chest, 0))), ARM - 0.045) : lerp(hi, lo, k);
    const pole: V3 = fly ? [0.3, -1, 0.2] : [1, -0.6, 0.3];
    p.armL = { at, pole, fist: true };
    p.armR = { at: mirror(at), pole: mirror(pole), fist: true };
    const axis: V3 = fly ? c.m[1] : [1, 0, 0];
    p.props = [...furniture, { t: 'db', at, axis }, { t: 'db', at: mirror(at), axis: mirror(axis) }];
  }
  return p;
}

// ================================================================ overhead press family
/** Sitting upright on a bench, feet on the floor. */
export function seated(o: { back?: boolean; top?: number; lean?: number } = {}): Pose {
  const top = o.top ?? BENCH_TOP;
  const p: Pose = {
    pelvis: [0, top + 0.1, 0],
    pitch: -(o.lean ?? 0),
    legs: { at: foot(0.17, 0.42), pole: [0.2, 1, 0.5], toe: toeOut(10) },
    arms: HANG,
  };
  p.props = [...benchX(0.03, top, 0.3)];
  if (o.back) {
    const c = chestOf(p);
    p.props.push({ t: 'box', c: inFrame(c, 0, 0.14, -0.13), h: [0.15, 0.36, 0.03], pitch: -(o.lean ?? 0), tone: 'pad', layer: 'back' });
  }
  return p;
}

export interface PressOpts {
  tool?: 'bar' | 'db' | 'arnold' | 'kb' | 'machine';
  seat?: boolean;
  dip?: number; // knee dip (push press)
}

export function overheadPress(k: number, o: PressOpts = {}): Pose {
  const tool = o.tool ?? 'bar';
  const p: Pose = o.seat ? seated({ back: true }) : { ...stand({ half: 0.15 }), pelvis: [0, standY(0.15) - (o.dip ?? 0), 0] };
  if (o.dip) p.legs = { at: foot(0.15, 0.02), toe: toeOut(10), pole: [0.25, 0, 1] };
  const c = chestOf(p);
  const sh = inFrame(c, 0, D.chest, 0);
  const topY = sh[1] + ARM - 0.03;
  const props = [...(p.props ?? [])];
  p.head = -4 * (1 - k);
  if (tool === 'bar') {
    const bar = lerp([0, sh[1] - 0.025, sh[2] + 0.135], [0, topY, sh[2] - 0.01], k);
    const pole: V3 = lerp([0.35, -1, 0.7], [1, -0.2, 0.5], k);
    p.armL = { at: [0.26, bar[1], bar[2]], pole, fist: true };
    p.armR = { at: [-0.26, bar[1], bar[2]], pole: mirror(pole), fist: true };
    props.push(barbell(bar));
  } else if (tool === 'kb') {
    const at = lerp([-0.19, sh[1] - 0.03, sh[2] + 0.13], [-0.21, topY, sh[2]], k);
    p.armR = { at, pole: lerp([-0.3, -1, 0.3], [-1, -0.2, 0.3], k), fist: true };
    p.armL = { at: [0.06, -0.42, 0.06], pole: [0.6, 0, -0.6], local: true };
    props.push({ t: 'kb', at, dir: norm(lerp([-0.5, -0.8, -0.2], [-0.2, -1, -0.3], k)) });
  } else {
    const low: V3 = tool === 'arnold' ? [0.11, sh[1] + 0.02, sh[2] + 0.2] : [0.3, sh[1] + 0.03, sh[2] + 0.04];
    const at = lerp(low, [0.2, topY, sh[2]], k);
    const pole: V3 = tool === 'arnold' ? lerp([0.3, -1, 0.5], [1, -0.3, 0.2], k) : [1, -0.6, 0.15];
    p.armL = { at, pole, fist: true };
    p.armR = { at: mirror(at), pole: mirror(pole), fist: true };
    if (tool === 'machine') {
      const pivot: V3 = [0.3, sh[1] + 0.25, sh[2] - 0.42];
      props.push(rod(madd(at, [1, 0, 0], -0.06), madd(at, [1, 0, 0], 0.08)), rod(mirror(madd(at, [1, 0, 0], -0.06)), mirror(madd(at, [1, 0, 0], 0.08))));
      props.push({ t: 'line', a: pivot, b: madd(at, [1, 0, 0], 0.08), tone: 'frame', w: 0.028 }, { t: 'line', a: mirror(pivot), b: mirror(madd(at, [1, 0, 0], 0.08)), tone: 'frame', w: 0.028 });
      props.push({ t: 'box', c: [0, 0.95, sh[2] - 0.44], h: [0.05, 0.95, 0.05], tone: 'frame', layer: 'back' });
    } else {
      props.push({ t: 'db', at, axis: [1, 0, 0] }, { t: 'db', at: mirror(at), axis: [-1, 0, 0] });
    }
  }
  p.props = props;
  return p;
}

/** Push press: dip, drive, lock out, lower. */
export function pushPress(u: number): Pose {
  const dip = span(u, 0, 0.16) - span(u, 0.16, 0.27);
  const press = span(u, 0.2, 0.36) - span(u, 0.6, 0.88);
  return overheadPress(press, { dip: 0.13 * dip });
}

export function landminePress(k: number): Pose {
  const p: Pose = {
    pelvis: [0, standY(0.1, 0.24), -0.02],
    pitch: 6,
    legL: { at: foot(0.12, 0.24), pole: [0.05, 0, 1] },
    legR: { at: foot(-0.12, -0.26), pole: [-0.05, 0, 1], toe: toeOut(-20) },
    armL: { at: [0.04, -0.34, 0.08], pole: [0.8, -0.2, -0.5], local: true },
  };
  const c = chestOf(p);
  const sh = inFrame(c, -D.shoW, D.chest, 0);
  const pivot: V3 = [-0.1, 0.04, 1.75];
  const hand = lerp([sh[0] + 0.03, sh[1] - 0.03, sh[2] + 0.16], [sh[0] + 0.05, sh[1] + 0.36, sh[2] + 0.4], k);
  p.armR = { at: hand, pole: [-0.5, -1, -0.1], fist: true };
  const tip = madd(hand, norm(sub(hand, pivot)), 0.13);
  p.props = [rod(pivot, tip, 0.016), { t: 'disc', c: madd(hand, norm(sub(hand, pivot)), -0.12), n: norm(sub(hand, pivot)), r: 0.15, tone: 'plate' }, { t: 'box', c: [-0.1, 0.03, 1.78], h: [0.08, 0.03, 0.06], tone: 'frame', layer: 'back' }];
  return p;
}

export function overheadTricepsExtension(k: number): Pose {
  const p = stand({ half: 0.13 });
  const c = chestOf(p);
  const sh = inFrame(c, 0, D.chest, 0);
  const at = lerp([0.045, sh[1] + 0.07, sh[2] - 0.15], [0.045, sh[1] + ARM - 0.04, sh[2] - 0.03], k);
  p.armL = { at, pole: [0.3, 0.8, 0.6], fist: true };
  p.armR = { at: mirror(at), pole: [-0.3, 0.8, 0.6], fist: true };
  p.props = [{ t: 'db', at: [0, at[1] + 0.01, at[2]], axis: [0, 1, 0] }];
  return p;
}

// ================================================================ arms and shoulders (standing)
/** A hand that swings around a fixed elbow: `phi` degrees of elbow flexion from straight down. */
const hinged = (elbow: V3, phi: number, out = 0): V3 => [elbow[0] + out * sind(phi), elbow[1] - D.fore * cosd(phi), elbow[2] + D.fore * sind(phi) * (1 - Math.abs(out))];

export interface CurlOpts {
  tool?: 'db' | 'hammer' | 'bar' | 'cable';
  from?: number;
  to?: number;
}
export function curl(k: number, o: CurlOpts = {}): Pose {
  const tool = o.tool ?? 'db';
  const p = stand({ half: 0.13 });
  const c = chestOf(p);
  const phi = mix(o.from ?? 8, o.to ?? 142, k);
  const el = add(inFrame(c, D.shoW, D.chest, 0), [-0.005, -D.upper + 0.004, 0.02]);
  const at = hinged(el, phi);
  p.arms = { at, pole: [0.15, 0.1, -1], fist: true };
  const fore = norm(sub(at, el));
  if (tool === 'bar' || tool === 'cable') {
    const bar: V3 = [0, at[1], at[2] + 0.005];
    p.props = [barbell(bar, [1, 0, 0], tool === 'cable' ? 0.3 : 0.62, tool === 'cable' ? 0 : 0.11)];
    if (tool === 'cable') p.props = [...pulley(0, 0.12, 0.95, 1.0), rod(madd(bar, [1, 0, 0], 0.3), madd(bar, [1, 0, 0], -0.3)), cable([0, 0.12, 0.9], bar)];
  } else {
    const axis: V3 = tool === 'hammer' ? norm([0, fore[2], -fore[1]]) : [1, 0, 0];
    p.props = [{ t: 'db', at, axis }, { t: 'db', at: mirror(at), axis: mirror(axis) }];
  }
  return p;
}

export function concentrationCurl(k: number): Pose {
  const p: Pose = {
    pelvis: [0, BENCH_TOP + 0.1, 0],
    pitch: 36,
    head: -18,
    legs: { at: foot(0.3, 0.38), pole: [0.6, 1, 0.5], toe: toeOut(28) },
    props: benchX(0.03, BENCH_TOP, 0.3),
  };
  const c = chestOf(p);
  const el = add(inFrame(c, -D.shoW, D.chest, 0), [0.03, -D.upper + 0.01, 0.03]);
  const phi = mix(14, 136, k);
  const at: V3 = [el[0] + 0.1 * sind(phi), el[1] - D.fore * cosd(phi), el[2] + D.fore * sind(phi) * 0.5];
  p.armR = { at: within(inFrame(c, -D.shoW, D.chest, 0), at), pole: [-0.2, -0.3, -1], fist: true };
  p.armL = { at: [0.3, 0.6, 0.36], pole: [1, 0.3, -0.3] };
  p.props = [...p.props!, { t: 'db', at: p.armR.at, axis: [0, 0, 1] }];
  return p;
}

export function wristCurl(k: number): Pose {
  const p: Pose = {
    pelvis: [0, BENCH_TOP + 0.1, 0],
    pitch: 30,
    head: -14,
    legs: { at: foot(0.17, 0.42), pole: [0.2, 1, 0.5] },
    props: benchX(0.03, BENCH_TOP, 0.3),
  };
  const hand = norm(lerp([0, -0.75, 0.66], [0, 0.6, 0.8], k));
  const at: V3 = [0.17, 0.62, 0.5];
  p.arms = { at, pole: [0.5, -0.4, -1], fist: true, hand };
  p.props = [...p.props!, { t: 'db', at: madd(at, hand, 0.05), axis: [1, 0, 0] }, { t: 'db', at: mirror(madd(at, hand, 0.05)), axis: [-1, 0, 0] }];
  return p;
}

export function pushdown(k: number): Pose {
  const p = stand({ half: 0.13, pitch: 8, back: 0.03 });
  const c = chestOf(p);
  const el = add(inFrame(c, D.shoW, D.chest, 0), [-0.01, -D.upper + 0.005, 0.03]);
  const at = hinged(el, mix(104, 8, k));
  p.arms = { at: [at[0] - 0.07, at[1], at[2]], pole: [0.2, 0.1, -1], fist: true };
  const bar: V3 = [0, at[1], at[2]];
  p.props = [...pulley(0, 2.0, 0.6), rod(madd(bar, [1, 0, 0], 0.2), madd(bar, [1, 0, 0], -0.2)), cable([0, 2.0, 0.55], bar)];
  return p;
}

/** Arms lift out to the sides. `one`: only the left arm, against a cable. */
export function lateralRaise(k: number, one = false): Pose {
  const p = stand({ half: 0.13 });
  const c = chestOf(p);
  const sh = inFrame(c, D.shoW, D.chest, 0);
  const a = mix(9, 86, k);
  const at: V3 = [sh[0] + (ARM - 0.05) * sind(a), sh[1] - (ARM - 0.05) * cosd(a), sh[2] + 0.07];
  const pole: V3 = [0.2, 0.3 + k, -1];
  if (one) {
    p.armL = { at, pole, fist: true };
    p.armR = { at: [0.06, -0.28, 0.1], pole: [1, -0.2, -0.6], local: true };
    p.props = [...pulley(-0.95, 0.12, 0.05, 1.0), cable([-0.9, 0.12, 0.05], at)];
    return p;
  }
  p.arms = { at, pole, fist: true };
  p.props = [{ t: 'db', at, axis: [0, 0, 1] }, { t: 'db', at: mirror(at), axis: [0, 0, 1] }];
  return p;
}

export function bandPullApart(k: number): Pose {
  const p = stand({ half: 0.13 });
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const a = mix(-5, 64, k); // arm angle outward from straight ahead
  const at: V3 = [sh[0] + (ARM - 0.04) * sind(a), sh[1] - 0.01, sh[2] + (ARM - 0.04) * cosd(a)];
  p.arms = { at, pole: [0.3, -1, -0.3], fist: true };
  p.props = [band(at, mirror(at))];
  return p;
}

export function facePull(k: number): Pose {
  const p = stand({ half: 0.16, pitch: -5 });
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const at = lerp([0.09, sh[1] + 0.1, sh[2] + ARM - 0.05], [0.25, sh[1] + 0.13, sh[2] + 0.08], k);
  p.arms = { at, pole: [1, 0.45, -0.2], fist: true };
  p.props = [...pulley(0, 1.75, 1.25), cable([0, 1.75, 1.2], at), cable([0, 1.75, 1.2], mirror(at))];
  return p;
}

export function shrug(k: number): Pose {
  const y = lockoutY(0.13) + 0.055 * k;
  const p = hangHinge(lockoutY(0.13), 0.115, 0);
  p.shrug = 0.055 * k;
  p.arms = { at: [0.26, y, 0.115], pole: [0.3, 0.2, -1], fist: true };
  p.props = [barbell([0, y, 0.115])];
  return p;
}

export function bandExternalRotation(k: number): Pose {
  const p = stand({ half: 0.13 });
  const c = chestOf(p);
  const el = add(inFrame(c, -D.shoW, D.chest, 0), [-0.01, -D.upper + 0.01, 0.01]);
  const a = mix(48, -58, k); // forearm direction: + = across the body, − = out to the side
  const at: V3 = [el[0] + D.fore * sind(a), el[1] + 0.01, el[2] + D.fore * cosd(a)];
  p.armR = { at, pole: [-0.2, -1, -0.2], fist: true };
  p.armL = { at: [0.05, -0.3, 0.1], pole: [1, -0.2, -0.6], local: true };
  p.props = [{ t: 'box', c: [0.95, 0.6, 0.1], h: [0.03, 0.6, 0.03], tone: 'frame', layer: 'back' }, band([0.95, el[1] + 0.01, 0.1], at)];
  return p;
}

export function armCircle(u: number): Pose {
  const p = stand({ half: 0.13 });
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const r = 0.13;
  const at: V3 = [sh[0] + ARM - 0.05, sh[1] + r * Math.sin(2 * Math.PI * u), sh[2] + r * Math.cos(2 * Math.PI * u)];
  p.arms = { at: within(sh, at), pole: [0, -0.4, -1] };
  return p;
}

export function bandPassThrough(k: number): Pose {
  const p = stand({ half: 0.13 });
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const wide = 0.44;
  const L = Math.sqrt((ARM - 0.03) ** 2 - (wide - D.shoW) ** 2);
  const phi = mix(24, 196, ease(k));
  const at: V3 = [wide, sh[1] - L * cosd(phi), sh[2] + L * sind(phi)];
  p.arms = { at, pole: [1, 0, -0.3], fist: true };
  p.head = -4 * k;
  p.props = [band(at, mirror(at))];
  return p;
}

export function wallSlide(k: number): Pose {
  const wz = -0.17;
  const p: Pose = { ...stand({ half: 0.12 }), pelvis: [0, standY(0.12, 0.14), wz + 0.16], legs: { at: foot(0.12, 0.16), pole: [0.05, 0, 1] } };
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const at = lerp([sh[0] + 0.19, sh[1] + 0.2, wz + 0.05], [sh[0] + 0.1, sh[1] + ARM - 0.05, wz + 0.05], k);
  p.arms = { at, pole: [1, -0.8, 0.1], hand: [0, 1, 0] };
  p.props = [wall(wz - 0.015, 0, 0.75, 2.2)];
  return p;
}

export function benchDip(k: number): Pose {
  const top = BENCH_TOP;
  const shY = top + 0.035 + mix(ARM - 0.02, 0.3, k);
  const p: Pose = {
    pelvis: [0, shY - TRUNK * cosd(6), 0.11 + TRUNK * sind(6)],
    pitch: -6,
    head: 6,
    legs: { at: foot(0.11, 0.62), pole: [0.05, 1, 0.3] },
    arms: { at: [0.2, top + 0.035, 0.0], pole: [0.15, 0.1, -1], hand: [0, 0, 1] },
    props: benchX(-0.05, top, 0.5),
  };
  return p;
}

export function chestDip(k: number): Pose {
  const BAR = 1.08;
  const lean = mix(4, 24, k);
  const shY = BAR + 0.03 + mix(ARM - 0.02, 0.27, k);
  const u = up(lean);
  const p: Pose = {
    pelvis: [0, shY - TRUNK * u[1], -TRUNK * u[2] + 0.06 * k],
    pitch: lean,
    head: -lean * 0.6,
    legs: { at: [0.02, -0.5, -0.36], pole: [0, -0.2, 1], toe: [0, -0.9, -0.4], local: true },
    arms: { at: [0.29, BAR + 0.03, 0.0], pole: [0.35, 0.2, -1], fist: true },
  };
  p.props = [
    rod([0.29, BAR, -0.38], [0.29, BAR, 0.3], 0.02),
    rod([-0.29, BAR, -0.38], [-0.29, BAR, 0.3], 0.02),
    { t: 'line', a: [0.29, 0, -0.38], b: [0.29, BAR, -0.38], tone: 'frame', w: 0.03, layer: 'back' },
    { t: 'line', a: [-0.29, 0, -0.38], b: [-0.29, BAR, -0.38], tone: 'frame', w: 0.03, layer: 'back' },
    { t: 'box', c: [0, 0.02, -0.38], h: [0.42, 0.02, 0.1], tone: 'frame', layer: 'back' },
  ];
  return p;
}

export function cableChestFly(k: number): Pose {
  const p: Pose = {
    pelvis: [0, standY(0.1, 0.2), 0.02],
    pitch: 12,
    head: -6,
    legL: { at: foot(0.12, 0.24), pole: [0.05, 0, 1] },
    legR: { at: foot(-0.12, -0.2), pole: [-0.05, 0, 1] },
  };
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const wide: V3 = [sh[0] + ARM - 0.09, sh[1] + 0.04, sh[2] - 0.02];
  const closed: V3 = [0.05, sh[1] - 0.3, sh[2] + 0.4];
  const a = ease(k);
  const at = within(sh, [mix(wide[0], closed[0], a), mix(wide[1], closed[1], a), mix(wide[2], closed[2], Math.sin((a * Math.PI) / 2))], ARM - 0.05);
  p.arms = { at, pole: [0.5, 0.2, -1], fist: true };
  p.props = [...pulley(1.1, 1.9, -0.15), ...pulley(-1.1, 1.9, -0.15), cable([1.1, 1.9, -0.1], at), cable([-1.1, 1.9, -0.1], mirror(at))];
  return p;
}

export function pallofPress(k: number): Pose {
  const p = squat(0.16, { half: 0.2, load: 'sides', lean: 10 });
  const c = chestOf(p);
  const at = lerp(inFrame(c, 0, 0.16, 0.16), inFrame(c, 0, 0.17, 0.5), k);
  return {
    ...p,
    armL: { at: madd(at, [1, 0, 0], 0.04), pole: [0.7, -1, 0], fist: true },
    armR: { at: madd(at, [1, 0, 0], -0.04), pole: [-0.7, -1, 0], fist: true },
    props: [{ t: 'box', c: [1.15, 0.75, 0.1], h: [0.03, 0.75, 0.03], tone: 'frame', layer: 'back' }, band([1.15, at[1], 0.1], at)],
  };
}

export function cableWoodchop(k: number): Pose {
  const a = ease(k);
  const p: Pose = {
    pelvis: [0, standY(0.24) - 0.1 * a, 0],
    twist: mix(42, -44, a),
    yaw: mix(10, -14, a),
    pitch: 12 * a,
    headYaw: mix(20, -20, a),
    legs: { at: foot(0.24, 0.02), toe: toeOut(14), pole: [0.3, 0, 1] },
  };
  const c = chestOf(p);
  const at = lerp(inFrame(c, 0.02, 0.5, 0.42), inFrame(c, -0.02, -0.12, 0.42), a);
  p.armL = { at: within(inFrame(c, D.shoW, D.chest, 0), madd(at, c.m[0], 0.04)), pole: [0.5, -1, -0.2], fist: true };
  p.armR = { at: within(inFrame(c, -D.shoW, D.chest, 0), madd(at, c.m[0], -0.04)), pole: [-0.5, -1, -0.2], fist: true };
  p.props = [...pulley(1.15, 1.95, 0.25), cable([1.15, 1.95, 0.3], at)];
  return p;
}

export function cableCrunch(k: number): Pose {
  const p: Pose = {
    pelvis: [0, 0.5, 0],
    pitch: mix(10, 32, k),
    spine: 50 * k,
    head: 14 * k,
    legs: { at: [0.1, 0.06, -0.41], toe: norm([0, -0.12, -1]), pole: [0, 0.2, 1] },
  };
  const c = chestOf(p);
  const at = inFrame(c, 0.1, D.neck + D.head - 0.04, 0.11);
  p.armL = { at, pole: [0.5, -1, 0.4], fist: true };
  p.armR = { at: inFrame(c, -0.1, D.neck + D.head - 0.04, 0.11), pole: [-0.5, -1, 0.4], fist: true };
  const mid = inFrame(c, 0, D.neck + D.head - 0.04, 0.11);
  p.props = [...pulley(0, 2.0, 0.95), cable([0, 2.0, 0.9], mid)];
  return p;
}

// ================================================================ hanging and pulling
const PULL_BAR = 2.26;
const rig = (y: number, half = 0.72, z = 0): Prop[] => [
  { t: 'line', a: [half, 0, z], b: [half, y, z], tone: 'frame', w: 0.035, layer: 'back' },
  { t: 'line', a: [-half, 0, z], b: [-half, y, z], tone: 'frame', w: 0.035, layer: 'back' },
  { t: 'box', c: [half, 0.015, z], h: [0.05, 0.015, 0.3], tone: 'frame', layer: 'back' },
  { t: 'box', c: [-half, 0.015, z], h: [0.05, 0.015, 0.3], tone: 'frame', layer: 'back' },
  rod([half, y, z], [-half, y, z], 0.018),
];

export interface PullOpts {
  grip?: number;
  chin?: boolean;
  assist?: boolean;
  /** Leg raise angle in degrees (hanging leg raise / toes to bar). */
  legs?: number;
  lean?: number;
}
export function pullup(k: number, o: PullOpts = {}): Pose {
  const grip = o.grip ?? 0.33;
  const hangY = PULL_BAR - Math.sqrt((ARM - 0.014) ** 2 - (grip - D.shoW) ** 2);
  const shY = mix(hangY, PULL_BAR - 0.09, k);
  const lean = -(o.lean ?? 10 * k);
  const u = up(lean);
  const shZ = -0.07 * k + (o.lean ? -0.004 * o.lean : 0);
  const p: Pose = {
    pelvis: [0, shY - TRUNK * u[1], shZ - TRUNK * u[2]],
    pitch: lean,
    head: -8 * k,
    arms: { at: [grip, PULL_BAR, 0], pole: o.chin ? [0.25, -0.5, 1] : [1, -0.4, -0.35], fist: true },
    props: rig(PULL_BAR),
  };
  if (o.legs !== undefined) {
    const a = o.legs;
    p.legs = { at: [0, -(LEG - 0.012) * cosd(a), (LEG - 0.012) * sind(a)], pole: [0, sind(a), cosd(a)], toe: [0, -cosd(a + 60), sind(a + 60)], local: true };
  } else if (o.assist) {
    p.legs = { at: [0.01, -0.44, -0.4], pole: [0, -0.3, 1], toe: [0, -0.3, -1], local: true };
    const pad: V3 = [0, p.pelvis[1] - 0.5, p.pelvis[2] + 0.02];
    p.props = [...p.props!, { t: 'box', c: pad, h: [0.2, 0.03, 0.13], tone: 'pad' }, { t: 'line', a: pad, b: [0, 0.5, -0.62], tone: 'frame', w: 0.03, layer: 'back' }, { t: 'box', c: [0, 0.6, -0.66], h: [0.06, 0.6, 0.05], tone: 'frame', layer: 'back' }];
  } else {
    p.legs = { at: [0.015, -0.74, -0.26], pole: [0, -0.2, 1], toe: [0, -0.95, -0.25], local: true };
  }
  return p;
}

export function latPulldown(k: number): Pose {
  const top = 0.5;
  const p: Pose = {
    pelvis: [0, top + 0.1, 0],
    pitch: -12 * k,
    head: -6 * k,
    legs: { at: foot(0.17, 0.4), pole: [0.2, 1, 0.5] },
  };
  const c = chestOf(p);
  const sh = inFrame(c, 0, D.chest, 0);
  const grip = 0.4;
  const high: V3 = [0, sh[1] + Math.sqrt((ARM - 0.015) ** 2 - (grip - D.shoW) ** 2), sh[2] + 0.03];
  const bar = lerp(high, inFrame(c, 0, 0.27, 0.15), k);
  p.arms = { at: [grip, bar[1], bar[2]], pole: [1, -0.5, -0.3], fist: true };
  p.props = [
    ...benchX(0.02, top, 0.26),
    { t: 'box', c: [0, top + 0.2, 0.33], h: [0.24, 0.035, 0.06], tone: 'pad' },
    { t: 'box', c: [0, 1.15, 0.6], h: [0.05, 1.15, 0.05], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, 2.28, 0.34], h: [0.04, 0.03, 0.3], tone: 'frame', layer: 'back' },
    rod(madd(bar, [1, 0, 0], 0.56), madd(bar, [1, 0, 0], -0.56), 0.016),
    cable([0, 2.25, 0.1], bar),
  ];
  return p;
}

export function straightArmPulldown(k: number): Pose {
  const p = stand({ half: 0.14, pitch: 20, back: 0.1, drop: 0.03 });
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const phi = mix(112, 14, k);
  const at: V3 = [sh[0] - 0.01, sh[1] - (ARM - 0.03) * cosd(phi), sh[2] + (ARM - 0.03) * sind(phi)];
  p.arms = { at, pole: [0.4, 0.4, -1], fist: true };
  const bar: V3 = [0, at[1], at[2]];
  p.props = [...pulley(0, 2.05, 1.1), rod(madd(bar, [1, 0, 0], 0.28), madd(bar, [1, 0, 0], -0.28)), cable([0, 2.05, 1.05], bar)];
  return p;
}

export function seatedRow(k: number, bandOnly = false): Pose {
  const top = 0.3;
  const p: Pose = {
    pelvis: [0, top + 0.1, 0],
    pitch: mix(12, -6, k),
    head: mix(-6, 2, k),
    legs: { at: [0.12, 0.26, 0.76], pole: [0.1, 1, 0.1], toe: norm([0, 0.9, 0.42]) },
  };
  const c = chestOf(p);
  const at = within(inFrame(c, D.shoW, D.chest, 0), lerp(inFrame(c, 0.07, 0.07, ARM - 0.03), inFrame(c, 0.1, 0.02, 0.17), k));
  p.arms = { at, pole: [0.5, 0.1, -1], fist: true };
  const mid: V3 = [0, at[1], at[2]];
  p.props = bandOnly
    ? [...benchX(0.02, top, 0.26), band([0.12, 0.3, 0.84], at), band([-0.12, 0.3, 0.84], mirror(at))]
    : [
        { t: 'box', c: [0, top / 2 - 0.02, 0.0], h: [0.05, top / 2 - 0.02, 0.2], tone: 'frame', layer: 'back' },
        { t: 'box', c: [0, top - 0.04, 0.0], h: [0.16, 0.04, 0.2], tone: 'pad', layer: 'back' },
        { t: 'box', c: [0, 0.2, 0.86], h: [0.24, 0.14, 0.02], pitch: -22, tone: 'frame', layer: 'back' },
        ...pulley(0, 0.5, 1.35, 1.0),
        rod(at, mirror(at), 0.012),
        cable([0, 0.5, 1.3], mid),
      ];
  return p;
}

export function bandRow(k: number): Pose {
  const p = squat(0.12, { half: 0.16, load: 'sides', lean: 6 });
  const c = chestOf(p);
  const at = within(inFrame(c, D.shoW, D.chest, 0), lerp(inFrame(c, 0.1, 0.06, ARM - 0.04), inFrame(c, 0.12, 0.0, 0.14), k));
  return { ...p, armL: { at, pole: [0.4, 0.1, -1], fist: true }, armR: { at: mirror(at), pole: [-0.4, 0.1, -1], fist: true }, props: [{ t: 'box', c: [0, 0.7, 1.45], h: [0.03, 0.7, 0.03], tone: 'frame', layer: 'back' }, band([0, 1.2, 1.45], at), band([0, 1.2, 1.45], mirror(at))] };
}

export function invertedRow(k: number): Pose {
  const BAR = 0.98;
  const grip = 0.3;
  const hangY = BAR - Math.sqrt((ARM - 0.02) ** 2 - (grip - D.shoW) ** 2);
  const shY = mix(hangY, BAR - 0.13, k);
  const heelY = 0.085;
  const th = (Math.asin((shY - heelY) / BODY) * 180) / Math.PI;
  const th0 = (Math.asin((hangY - heelY) / BODY) * 180) / Math.PI;
  const heelZ = BODY * cosd(th0);
  const d: V3 = [0, sind(th), -cosd(th)]; // toward the head
  const p: Pose = {
    pelvis: madd([0, heelY, heelZ], d, LEG - 0.006),
    pitch: -(90 - th),
    head: 8,
    legs: { at: [0.09, heelY, heelZ], toe: norm([0, 0.85, 0.5]), pole: [0, 1, 0.2] },
    arms: { at: [grip, BAR, 0], pole: [0.8, -0.7, 0.1], fist: true },
    props: rig(BAR, 0.62),
  };
  return p;
}

export function oneArmRow(k: number): Pose {
  const bx = 0.12;
  const p: Pose = {
    pelvis: [0, 0.885, -0.25],
    pitch: 84,
    head: -20,
    legL: { at: [bx, BENCH_TOP + 0.055, -0.67], pole: [0, -1, 0.3], toe: norm([0, -0.15, -1]) },
    legR: { at: foot(-0.3, -0.3), pole: [-0.2, 0, 1], toe: toeOut(-10) },
    armL: { at: [bx + 0.08, BENCH_TOP + 0.035, 0.27], pole: [0.5, 0, -1], hand: [0, 0, 1] },
  };
  const c = chestOf(p);
  p.armL!.at = within(inFrame(c, D.shoW, D.chest, 0), p.armL!.at);
  const sh = inFrame(c, -D.shoW, D.chest, 0);
  const at = within(sh, lerp([sh[0] - 0.02, sh[1] - (ARM - 0.02), sh[2] + 0.02], [sh[0] - 0.05, sh[1] - 0.1, sh[2] - 0.14], k));
  p.armR = { at, pole: [-0.3, 1, -0.6], fist: true };
  p.props = [...bench(-0.15, BENCH_TOP, 0.62, bx), { t: 'db', at, axis: [0, 0, 1] }];
  return p;
}

export function chestSupportedRow(k: number): Pose {
  const inc = 36;
  const u: V3 = [0, sind(inc), cosd(inc)];
  const p: Pose = {
    pelvis: [0, 0.6, 0],
    pitch: 90 - inc,
    head: -30,
    legs: { at: [0.13, onToes(50), -0.64], pole: [0.1, 0, 1], toe: [0, -sind(50), cosd(50)] },
  };
  const c = chestOf(p);
  const sh = inFrame(c, D.shoW, D.chest, 0);
  const at = lerp([sh[0] + 0.01, sh[1] - (ARM - 0.02), sh[2] + 0.02], [sh[0] + 0.06, sh[1] - 0.14, sh[2] - 0.2], k);
  p.arms = { at, pole: [0.4, 0.8, -0.8], fist: true };
  const pad = madd(madd(p.pelvis, u, 0.36), c.m[2], 0.155);
  p.props = [
    { t: 'box', c: pad, h: [0.14, 0.44, 0.035], pitch: 90 - inc, tone: 'pad', layer: 'back' },
    { t: 'line', a: [0, 0, pad[2] + 0.12], b: madd(pad, c.m[2], 0.04), tone: 'frame', w: 0.04, layer: 'back' },
    { t: 'box', c: [0, 0.02, pad[2] + 0.12], h: [0.24, 0.02, 0.04], tone: 'frame', layer: 'back' },
    { t: 'db', at, axis: [0, 0, 1] },
    { t: 'db', at: mirror(at), axis: [0, 0, 1] },
  ];
  return p;
}

// ================================================================ machines
const machineSeat = (top: number, lean: number, pelvis: V3): Prop[] => [
  { t: 'box', c: [0, top / 2 - 0.03, pelvis[2] + 0.04], h: [0.06, top / 2 - 0.03, 0.16], tone: 'frame', layer: 'back' },
  { t: 'box', c: [0, top - 0.04, pelvis[2] + 0.14], h: [0.19, 0.04, 0.26], tone: 'pad', layer: 'back' },
  { t: 'box', c: [pelvis[0], pelvis[1] + 0.3 * cosd(lean) - 0.02, pelvis[2] - 0.135 - 0.3 * sind(lean)], h: [0.17, 0.34, 0.03], pitch: -lean, tone: 'pad', layer: 'back' },
];

/** Leg extension (curl = false) or seated leg curl (curl = true). */
export function legMachine(k: number, curlIt = false): Pose {
  const top = 0.56;
  const lean = 14;
  const pelvis: V3 = [0, top + 0.1, 0];
  const knee: V3 = [0.12, top + 0.075, 0.43];
  const a = curlIt ? mix(80, -32, k) : mix(4, 84, k);
  const an: V3 = [knee[0], knee[1] - (D.shin - 0.004) * cosd(a), knee[2] + (D.shin - 0.004) * sind(a)];
  const p: Pose = {
    pelvis,
    pitch: -lean,
    head: 8,
    legs: { at: an, pole: [0, 1, 0.2], toe: [0, sind(a), cosd(a) * 0.5 + 0.5] },
    arms: { at: [0.27, top + 0.08, -0.02], pole: [0.5, 0.2, -1], fist: true },
  };
  const shinDir: V3 = [0, -cosd(a), sind(a)];
  const front: V3 = [0, sind(a), cosd(a)];
  const roller = madd(madd([0, knee[1], knee[2]], shinDir, D.shin - 0.07), front, curlIt ? -0.085 : 0.085);
  p.props = [
    ...machineSeat(top, lean, pelvis),
    { t: 'line', a: [0.24, knee[1], knee[2]], b: madd(roller, [1, 0, 0], 0.24), tone: 'frame', w: 0.028 },
    rod(madd(roller, [1, 0, 0], 0.24), madd(roller, [1, 0, 0], -0.24), 0.04),
  ];
  if (curlIt) p.props.push({ t: 'box', c: [0, knee[1] + 0.125, knee[2] - 0.1], h: [0.22, 0.03, 0.07], tone: 'pad' });
  return p;
}

export function lyingLegCurl(k: number): Pose {
  const top = 0.52;
  const a = mix(4, 118, k);
  const knee: V3 = [0.1, top + 0.085, -D.thigh];
  const an: V3 = [knee[0], knee[1] + (D.shin - 0.004) * sind(a), knee[2] - (D.shin - 0.004) * cosd(a)];
  const p: Pose = {
    pelvis: [0, top + 0.1, 0],
    pitch: 90,
    head: -14,
    legs: { at: an, pole: [0, -1, 0], toe: [0, cosd(a) * -0.3 + sind(a), -cosd(a) - 0.3 * sind(a)] },
    arms: { at: [0.2, top - 0.06, 0.56], pole: [0.6, 0, -0.6], fist: true },
  };
  const shinDir: V3 = [0, sind(a), -cosd(a)];
  const back: V3 = [0, cosd(a), sind(a)];
  const roller = madd(madd([0, knee[1], knee[2]], shinDir, D.shin - 0.06), back, 0.085);
  p.props = [
    ...bench(0.22, top, 0.6),
    { t: 'line', a: [0.24, knee[1] - 0.02, knee[2]], b: madd(roller, [1, 0, 0], 0.24), tone: 'frame', w: 0.028 },
    rod(madd(roller, [1, 0, 0], 0.24), madd(roller, [1, 0, 0], -0.24), 0.04),
  ];
  return p;
}

/** Ankle position when the ball of the foot stays on a point and the heel lifts by `deg`. */
const onBall = (ball: V3, deg: number): { at: V3; toe: V3 } => ({
  at: [ball[0], ball[1] + 0.034 + 0.11 * sind(deg) + 0.036 * cosd(deg), ball[2] - 0.11 * cosd(deg) + 0.036 * sind(deg)],
  toe: [0, -sind(deg), cosd(deg)],
});

export function seatedCalfRaise(k: number): Pose {
  const top = 0.5;
  const f = onBall([0.14, 0.08, 0.5], mix(-12, 30, k));
  const p: Pose = {
    pelvis: [0, top + 0.1, 0],
    pitch: 4,
    legs: { at: f.at, toe: f.toe, pole: [0, 1, 0.3] },
    arms: { at: [0.17, 0.74 + 0.05 * k, 0.36], pole: [0.6, 0.2, -1], fist: true },
  };
  const kneeY = 0.585 + 0.055 * k;
  p.props = [
    ...benchX(0.0, top, 0.28),
    { t: 'box', c: [0, 0.04, 0.53], h: [0.26, 0.04, 0.07], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, kneeY + 0.11, 0.4], h: [0.24, 0.035, 0.07], tone: 'pad' },
    { t: 'line', a: [0, kneeY + 0.11, 0.47], b: [0, 0.5, 0.95], tone: 'frame', w: 0.03, layer: 'back' },
    { t: 'disc', c: [0.06, 0.5, 0.95], n: [1, 0, 0], r: 0.14, tone: 'plate' },
  ];
  return p;
}

export function hipAbduction(k: number): Pose {
  const top = 0.56;
  const lean = 12;
  const pelvis: V3 = [0, top + 0.1, 0];
  const x = mix(0.1, 0.36, k);
  const p: Pose = {
    pelvis,
    pitch: -lean,
    legs: { at: [x + 0.03, 0.17, 0.4 - 0.05 * k], pole: [x * 2, 1, 0.6], toe: toeOut(8 + 26 * k) },
    arms: { at: [0.27, top + 0.08, -0.02], pole: [0.5, 0.2, -1], fist: true },
  };
  p.props = [
    ...machineSeat(top, lean, pelvis),
    { t: 'box', c: [0, 0.07, 0.4], h: [0.45, 0.02, 0.1], tone: 'frame', layer: 'back' },
    { t: 'box', c: [x + 0.13, top + 0.08, 0.36 - 0.05 * k], h: [0.02, 0.07, 0.09], yaw: 22 * k, tone: 'pad' },
    { t: 'box', c: [-x - 0.13, top + 0.08, 0.36 - 0.05 * k], h: [0.02, 0.07, 0.09], yaw: -22 * k, tone: 'pad' },
  ];
  return p;
}

/** Seated chest machines: press (fly = false) or pec deck (fly = true). */
export function chestMachine(k: number, fly = false): Pose {
  const top = 0.52;
  const pelvis: V3 = [0, top + 0.1, 0];
  const p: Pose = { pelvis, pitch: 0, legs: { at: foot(0.18, 0.42), pole: [0.2, 1, 0.5], toe: toeOut(10) } };
  const c = chestOf(p);
  const sh = inFrame(c, D.shoW, D.chest, 0);
  let at: V3;
  if (fly) {
    const a = mix(8, 84, ease(k)); // upper-arm angle forward from out to the side
    const el: V3 = [sh[0] + D.upper * cosd(a), sh[1] - 0.02, sh[2] + D.upper * sind(a)];
    at = [el[0] - 0.03 * sind(a), el[1] + D.fore * 0.86, el[2] + D.fore * 0.5];
    p.arms = { at: within(sh, at), pole: [cosd(a), -0.25, sind(a) - 0.2], fist: true };
  } else {
    at = lerp([sh[0] + 0.1, sh[1] - 0.09, sh[2] + 0.12], [sh[0] + 0.06, sh[1] - 0.09, sh[2] + ARM - 0.04], k);
    p.arms = { at, pole: [1, -0.5, -0.3], fist: true };
  }
  const hand = p.arms.at;
  const pivot: V3 = [0.34, sh[1] + 0.55, sh[2] - 0.05];
  p.props = [
    ...machineSeat(top, 0, pelvis),
    { t: 'box', c: [0, 1.02, -0.26], h: [0.05, 1.02, 0.05], tone: 'frame', layer: 'back' },
    { t: 'box', c: [0, sh[1] + 0.55, -0.15], h: [0.38, 0.03, 0.14], tone: 'frame', layer: 'back' },
    { t: 'line', a: pivot, b: madd(hand, [0, 1, 0], 0.09), tone: 'frame', w: 0.028 },
    { t: 'line', a: mirror(pivot), b: mirror(madd(hand, [0, 1, 0], 0.09)), tone: 'frame', w: 0.028 },
    rod(madd(hand, [0, 1, 0], 0.09), madd(hand, [0, 1, 0], -0.08), 0.018),
    rod(mirror(madd(hand, [0, 1, 0], 0.09)), mirror(madd(hand, [0, 1, 0], -0.08)), 0.018),
  ];
  return p;
}

/** 45° back extension: k = 0 folded forward, k = 1 body in a straight line. */
export function backExtension(k: number): Pose {
  const u: V3 = [0, sind(45), cosd(45)];
  const ankle: V3 = [0.1, 0.27, -0.56];
  const hip = madd([0, ankle[1], ankle[2]], u, LEG - 0.006);
  const pitch = mix(118, 45, k);
  const p: Pose = {
    pelvis: hip,
    pitch,
    head: mix(4, -16, k),
    legs: { at: ankle, pole: [0, -0.7, 0.7], toe: norm([0, -0.5, 0.86]) },
    arms: { at: [-0.14, -0.13, 0.15], pole: [1, -0.6, 0], local: true },
  };
  const pad = madd(madd(hip, u, -0.14), [0, -0.7071, 0.7071], 0.13);
  p.props = [
    { t: 'box', c: pad, h: [0.2, 0.035, 0.13], pitch: 45, tone: 'pad', layer: 'back' },
    { t: 'line', a: [0, 0.02, pad[2] + 0.1], b: pad, tone: 'frame', w: 0.045, layer: 'back' },
    { t: 'line', a: [0, 0.02, -0.75], b: [0, 0.02, pad[2] + 0.28], tone: 'frame', w: 0.045, layer: 'back' },
    { t: 'line', a: [0, 0.02, -0.66], b: [0, ankle[1] + 0.09, ankle[2] - 0.1], tone: 'frame', w: 0.035, layer: 'back' },
    rod([0.22, ankle[1] + 0.09, ankle[2] - 0.1], [-0.22, ankle[1] + 0.09, ankle[2] - 0.1], 0.04),
  ];
  return p;
}

// ================================================================ shared by the last families
/** Translate a pose (world targets included). */
export function move(p: Pose, d: V3): Pose {
  const e = explicit(p);
  const mv = (l: Limb): Limb => ({ ...l, at: add(l.at, d) });
  return { ...e, pelvis: add(e.pelvis, d), armL: mv(e.armL!), armR: mv(e.armR!), legL: mv(e.legL!), legR: mv(e.legR!) };
}

/** Left ↔ right mirror image of a pose (equipment is dropped). */
export function mirrorPose(p: Pose): Pose {
  const e = explicit(p);
  const fl = (l: Limb): Limb => ({ ...l, at: mirror(l.at), pole: l.pole && mirror(l.pole), toe: l.toe && mirror(l.toe), hand: l.hand && mirror(l.hand) });
  return {
    ...e,
    pelvis: mirror(e.pelvis),
    yaw: -(e.yaw ?? 0),
    roll: -(e.roll ?? 0),
    twist: -(e.twist ?? 0),
    bend: -(e.bend ?? 0),
    headYaw: -(e.headYaw ?? 0),
    headRoll: -(e.headRoll ?? 0),
    armL: fl(e.armR!),
    armR: fl(e.armL!),
    legL: fl(e.legR!),
    legR: fl(e.legL!),
    props: undefined,
  };
}

const HIPS: Limb = { at: [-0.035, -0.4, 0.07], pole: [1, 0, -0.5], local: true }; // hands on the hips
/** Arms for a jump: s = +1 swung back, −1 driven up. */
const armSwing = (s: number): Limb => ({ at: lerp([0.04, -0.5, 0.12], s > 0 ? [0.08, -0.36, -0.36] : [0.02, 0.4, 0.3], Math.abs(s)), pole: [0.3, -0.3, -1], local: true });
/** An arm swept through the side: `a` degrees from hanging (0) to overhead (180). */
const sweep = (a: number, fwd = 0.03): Limb => ({ at: [(ARM - 0.04) * sind(a), -(ARM - 0.04) * cosd(a), fwd], pole: [0.2, 0, -1], local: true });

// ================================================================ calves, carries, band walk, nordic
export function calfRaise(k: number, single = false): Pose {
  const top = 0.1;
  const f = onBall([single ? 0.07 : 0.1, top, 0.06], mix(-12, 32, k));
  const p: Pose = {
    pelvis: [single ? 0.045 : 0, f.at[1] + LEG - 0.008, f.at[2]],
    legs: { at: f.at, toe: f.toe, pole: [0.03, 0, 1] },
    arms: HIPS,
    props: [crate(0.2, top, 0.34, 0.17)],
  };
  if (single) {
    const wz = f.at[2] + 0.5;
    p.legs = undefined;
    p.legL = { at: f.at, toe: f.toe, pole: [0.03, 0, 1] };
    p.legR = { at: [-0.07, f.at[1] + 0.3, f.at[2] - 0.24], toe: norm([0, -0.8, -0.5]), pole: [-0.05, 0, 1] };
    p.arms = { at: [0.17, p.pelvis[1] + TRUNK - 0.1, wz - 0.035], pole: [0.5, -1, 0], hand: [0, 1, 0] };
    p.props = [crate(0.2, top, 0.34, 0.17), wall(wz, 0, 0.5, 1.9)];
  }
  return p;
}

export interface WalkOpts {
  stride?: number; // half a step, in metres
  half?: number;
  drop?: number;
  lift?: number;
  out?: number; // the swinging foot arcs outward
  knee?: number;
}
/** Walking on the spot: the feet slide back under the body and swing forward. */
export function walk(u: number, o: WalkOpts = {}): Pose {
  const a = o.stride ?? 0.24;
  const half = o.half ?? 0.09;
  const leg = (ph: number, side: number): Limb => {
    const f = ph - Math.floor(ph);
    const pole: V3 = [(o.knee ?? 0.03) * side, 0, 1];
    if (f < 0.6) {
      const s = f / 0.6;
      const heel = step(0.72, 1, s); // the heel peels off at the end of the stance
      return { at: [side * half, D.ankle + 0.04 * heel, mix(a, -a, s)], toe: [0, -sind(24 * heel), cosd(24 * heel)], pole };
    }
    const s = (f - 0.6) / 0.4;
    const e = ease(s);
    const pitch = mix(24, -10, e);
    return { at: [side * (half + (o.out ?? 0) * Math.sin(Math.PI * s)), D.ankle + mix(0.04, 0, e) + (o.lift ?? 0.08) * Math.sin(Math.PI * s), mix(-a, a, e)], toe: [0, -sind(pitch), cosd(pitch)], pole };
  };
  const bob = 0.012 * (0.5 - 0.5 * Math.cos(4 * Math.PI * (u - 0.05)));
  return {
    pelvis: [0.014 * Math.sin(2 * Math.PI * (u - 0.05)), standY(half, a) - 0.014 + bob - (o.drop ?? 0), 0],
    legL: leg(u, 1),
    legR: leg(u + 0.5, -1),
  };
}

export function carry(u: number, oneSide = false): Pose {
  const p: Pose = { ...walk(u, { stride: 0.2 }), arms: { at: [0.05, -(ARM - 0.012), 0.02], pole: [0.25, 0, -1], local: true } };
  if (!oneSide) return dumbbells(p, [0, 0, 1]);
  p.armL = { at: [0.15, -0.49, 0.03], pole: [0.6, 0, -1], local: true };
  return dumbbells(p, [0, 0, 1], 'R');
}

export function monsterWalk(u: number): Pose {
  const p: Pose = { ...walk(u, { stride: 0.1, half: 0.21, drop: 0.13, out: 0.07, lift: 0.05, knee: 0.3 }), pitch: 16, head: -8, arms: { at: [-0.17, -0.2, 0.2], pole: [1, -0.4, 0.1], local: true } };
  const s = solve(p);
  p.props = [{ t: 'line', a: lerp(s.hip[0], s.kn[0], 0.84), b: lerp(s.hip[1], s.kn[1], 0.84), tone: 'band', w: 0.03 }];
  return p;
}

/** Nordic curl: knees planted, ankles held, the body lowers forward in one line. */
export function nordicCurl(k: number): Pose {
  const lean = 56 * k;
  return {
    pelvis: [0, 0.045 + D.thigh * cosd(lean), D.thigh * sind(lean)],
    pitch: lean,
    head: -lean * 0.3,
    legs: { at: [0.1, 0.06, -0.42], toe: norm([0, -0.12, -1]), pole: [0, -1, 0.3] },
    arms: { at: lerp([-0.03, -0.12, 0.26], [0, 0.06, 0.4], k), pole: [0.6, -0.7, -0.2], local: true },
    props: [
      rod([0.3, 0.155, -0.42], [-0.3, 0.155, -0.42], 0.035),
      { t: 'box', c: [0.3, 0.08, -0.42], h: [0.03, 0.08, 0.03], tone: 'frame', layer: 'back' },
      { t: 'box', c: [-0.3, 0.08, -0.42], h: [0.03, 0.08, 0.03], tone: 'frame', layer: 'back' },
    ],
  };
}

// ================================================================ jumps
export function boxJump(u: number): Pose {
  const TOP = 0.5;
  const BZ = 0.64;
  const S0 = standY(0.19, 0.02);
  const sq = (d: number, swing: number): Pose => ({ ...squat(d, { depth: 0.44, lean: 34 }), arms: armSwing(swing) });
  let p: Pose;
  if (u < 0.2) p = sq(0.62 * ease(u / 0.2), ease(u / 0.2));
  else if (u < 0.28) {
    const t = ease((u - 0.2) / 0.08);
    p = sq(0.62 * (1 - t), 1 - 2 * t);
  } else if (u < 0.5) {
    const f = (u - 0.28) / 0.22;
    p = move(sq(0.5 * ease(f * 1.5), -1 + 0.6 * f), [0, TOP * f + 1.4 * f * (1 - f), BZ * f]);
  } else if (u < 0.56) {
    const t = ease((u - 0.5) / 0.06);
    p = move(sq(mix(0.5, 0.62, t), -0.4 * (1 - t)), [0, TOP, BZ]);
  } else if (u < 0.7) p = move(sq(0.62 * (1 - ease((u - 0.56) / 0.14)), 0), [0, TOP, BZ]);
  else if (u < 0.76) p = move(sq(0, 0), [0, TOP, BZ]);
  else {
    // Step down backwards, one foot at a time.
    const g = (u - 0.76) / 0.24;
    const rz = mix(BZ + 0.02, 0.02, ease(g / 0.55));
    const ry = mix(TOP + D.ankle, D.ankle, ease((g - 0.3) / 0.25));
    const lz = mix(BZ + 0.02, 0.02, ease((g - 0.55) / 0.4));
    const ly = mix(TOP + D.ankle, D.ankle, ease((g - 0.78) / 0.2));
    const py = g < 0.5 ? mix(TOP + S0, 0.86, ease(g / 0.5)) : mix(0.86, S0, ease((g - 0.6) / 0.4));
    p = {
      pelvis: [0, py, mix(BZ, 0, ease(g))],
      pitch: 12 * Math.sin(Math.PI * g),
      head: -6 * Math.sin(Math.PI * g),
      legL: { at: [0.19, ly, lz], toe: toeOut(18), pole: [0.4, 0, 1] },
      legR: { at: [-0.19, ry, rz], toe: toeOut(-18), pole: [-0.4, 0, 1] },
      arms: armSwing(0),
    };
  }
  return { ...p, props: [crate(BZ + 0.11, TOP, 0.36, 0.3)] };
}

export function broadJump(u: number): Pose {
  const Z0 = -0.75;
  const LEN = 1.5;
  const sq = (d: number, swing: number, z: number, y = 0): Pose => move({ ...squat(d, { depth: 0.44, lean: 40 }), arms: armSwing(swing) }, [0, y, z]);
  if (u < 0.26) return sq(0.62 * ease(u / 0.26), ease(u / 0.26), Z0);
  if (u < 0.34) {
    const t = ease((u - 0.26) / 0.08);
    return sq(mix(0.62, 0.04, t), 1 - 2 * t, Z0);
  }
  if (u < 0.58) {
    const f = (u - 0.34) / 0.24;
    return sq(0.04 + 0.4 * ease(f * 1.3), -1 + 0.5 * f, Z0 + LEN * f, 0.3 * 4 * f * (1 - f));
  }
  if (u < 0.68) {
    const t = ease((u - 0.58) / 0.1);
    return sq(mix(0.44, 0.74, t), -0.5 + 0.3 * t, Z0 + LEN);
  }
  if (u < 0.88) {
    const t = ease((u - 0.68) / 0.2);
    return sq(0.74 * (1 - t), -0.2 * (1 - t), Z0 + LEN);
  }
  return sq(0, 0, Z0 + LEN);
}

export function tuckJump(u: number): Pose {
  const S0 = standY(0.19, 0.02);
  if (u >= 0.3 && u < 0.62) {
    const f = (u - 0.3) / 0.32;
    const t = Math.sin(Math.PI * f) ** 1.3;
    return {
      pelvis: [0, S0 + 0.36 * 4 * f * (1 - f), 0],
      pitch: 12 * t,
      head: -6 * t,
      legs: { at: lerp([0.09, -(S0 - D.ankle), 0.02], [0.03, -0.37, 0.38], t), pole: [0.1, 0.7 * t, 1], toe: norm(lerp([sind(18), 0, cosd(18)], [0.05, -0.75, 0.6], Math.min(1, 2.5 * Math.sin(Math.PI * f)))), local: true },
      arms: { at: lerp([0.02, 0.4, 0.3], [0, -0.2, 0.36], t), pole: lerp([0.3, -0.3, -1], [0.5, -0.6, -0.4], t), local: true },
    };
  }
  const d = u < 0.22 ? 0.55 * ease(u / 0.22) : u < 0.3 ? 0.55 * (1 - ease((u - 0.22) / 0.08)) : u < 0.72 ? 0.45 * ease((u - 0.62) / 0.1) : 0.45 * (1 - ease((u - 0.72) / 0.2));
  const swing = u < 0.22 ? ease(u / 0.22) : u < 0.3 ? 1 - 2 * ease((u - 0.22) / 0.08) : -1 + ease((u - 0.62) / 0.25);
  return { ...squat(d, { depth: 0.44, lean: 34 }), arms: armSwing(swing) };
}

export function jumpingJack(u: number): Pose {
  const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
  const an = 0.115 + 0.035 * Math.sin(2 * Math.PI * u) ** 2;
  const half = mix(0.08, 0.36, s);
  return {
    pelvis: [0, an + Math.sqrt((LEG - 0.012) ** 2 - (half - D.hipW) ** 2), 0],
    legs: { at: [half, an, 0], toe: norm([sind(10), -0.3, cosd(10)]), pole: [0.1, 0, 1] },
    arms: sweep(mix(8, 198, s)),
  };
}

export function highKnees(u: number): Pose {
  const w = Math.sin(2 * Math.PI * u);
  const py = 0.125 + LEG - 0.03 + 0.012 * Math.abs(w);
  const leg = (s: number, side: number): Limb => {
    const k = ease(clamp(s));
    return { at: lerp([side * 0.09, 0.125, 0], [side * 0.1, py - 0.4, 0.4], k), toe: norm(lerp([0, -sind(20), cosd(20)], [0, -0.7, 0.7], k)), pole: [0, 0.4 * k, 1] };
  };
  const fwd: V3 = [-0.03, -0.14, 0.3];
  const back: V3 = [0.04, -0.3, -0.14];
  return {
    pelvis: [0, py, 0],
    pitch: 4,
    legL: leg(w, 1),
    legR: leg(-w, -1),
    armL: { at: lerp(fwd, back, 0.5 + 0.5 * w), pole: [0.2, -0.4, -1], local: true, fist: true },
    armR: { at: lerp(fwd, back, 0.5 - 0.5 * w), pole: [0.2, -0.4, -1], local: true, fist: true },
  };
}

/** Lateral bound from one leg to the other. */
export function skaterJump(u: number): Pose {
  const onLeft: Pose = {
    pelvis: [0.3, 0.7, -0.08],
    pitch: 32,
    head: -18,
    legL: { at: [0.36, D.ankle, 0.02], pole: [0.15, 0, 1], toe: toeOut(6) },
    legR: { at: [0.6, 0.2, -0.42], pole: [0.2, -0.2, 1], toe: norm([0.2, -0.75, -0.3]) },
    armL: { at: [0.12, -0.3, -0.36], pole: [0.4, 0, -1], local: true },
  };
  const c = chestOf(onLeft);
  onLeft.armR = { at: within(inFrame(c, -D.shoW, D.chest, 0), [0.3, 0.62, 0.3]), pole: [-0.5, 0, -1] };
  const onRight = mirrorPose(onLeft);
  const v = (u * 2) % 1;
  const from = u < 0.5 ? onRight : onLeft;
  const to = u < 0.5 ? onLeft : onRight;
  if (v < 0.3) {
    const e = explicit(from);
    return { ...e, pelvis: add(e.pelvis, [0, -0.05 * Math.sin((Math.PI * v) / 0.3), 0]) };
  }
  const t = (v - 0.3) / 0.7;
  return move(blend(from, to, ease(t)), [0, 0.14 * Math.sin(Math.PI * t), 0]);
}

// ================================================================ cleans, get-up, windmill
export function powerClean(u: number): Pose {
  if (u < 0.08) return deadlift(0);
  if (u < 0.26) return deadlift(0.62 * ease((u - 0.08) / 0.18));
  if (u >= 0.78) return deadlift(1 - ease((u - 0.78) / 0.16));
  const barY = lockoutY() + 0.14;
  const pull: Pose = {
    pelvis: [0, standY(0.13) + 0.045, 0.02],
    pitch: -6,
    head: 4,
    shrug: 0.05,
    legs: { at: [0.13, 0.115, 0.02], toe: norm([0.2, -0.42, 0.9]), pole: [0.2, 0, 1] },
    arms: { at: [0.26, barY, 0.13], pole: [0.7, 0.3, -1], fist: true },
  };
  const rack = (k: number): Pose => squat(k, { load: 'front', lean: 20, back: 0.17, half: 0.16, toe: 14 });
  const e = explicit(
    seq(u, [
      [0.26, deadlift(0.62)],
      [0.33, pull],
      [0.42, rack(0.36)],
      [0.56, rack(0)],
      [0.68, rack(0)],
      [0.78, deadlift(1)],
    ]),
  );
  const mid = lerp(e.armL!.at, e.armR!.at, 0.5);
  return { ...e, props: [barbell([0, mid[1], mid[2] + 0.005])] };
}

/** One-arm clean: from the hike between the legs (k = 0) to the rack at the shoulder (k = 1). */
export function kettlebellClean(k: number): Pose {
  const e = ease(k);
  const pitch = 66 * (1 - e);
  const p: Pose = {
    pelvis: [0, standY(0.2) - 0.1 * (1 - e), -0.24 * (1 - e)],
    pitch,
    head: -pitch * 0.5,
    legs: { at: foot(0.2, 0.02), toe: toeOut(14), pole: [0.3, 0, 1] },
    armL: { at: [0.16, -0.42, 0.04], pole: [1, 0, -0.3], local: true },
  };
  const c = chestOf(p);
  const sh = inFrame(c, -D.shoW, D.chest, 0);
  const beta = mix(-40, 26, clamp(k / 0.55));
  const L = 0.488;
  const swingAt: V3 = [-0.04, sh[1] - L * cosd(beta), sh[2] + L * sind(beta)];
  const pullIn = ease((k - 0.4) / 0.6);
  const at = lerp(swingAt, inFrame(c, -0.15, D.chest - 0.07, 0.13), pullIn);
  p.armR = { at, pole: lerp([-0.6, 0, -0.4], [-0.3, -1, 0.3], pullIn), fist: true };
  p.props = [{ t: 'kb', at, dir: norm(lerp(sub(at, sh), [-0.5, -0.8, -0.2], pullIn)) }];
  return p;
}

/** Turkish get-up, bell in the right hand: v = 0 lying down, v = 1 standing. */
export function turkishGetUp(u: number): Pose {
  const v = u < 0.5 ? u / 0.5 : (1 - u) / 0.5;
  const bent: Limb = { at: [-0.16, D.ankle, 0.44], pole: [-0.1, 1, 0.2] };
  const long: Limb = { at: [0.22, 0.06, 0.83], pole: [0, 1, 0], toe: [0, 1, 0.1] };
  const overhead = (p: Pose): Limb => {
    const sh = inFrame(chestOf(p), -D.shoW, D.chest, 0);
    return { at: [sh[0], sh[1] + ARM - 0.02, sh[2]], pole: [-1, 0, 0.3], fist: true };
  };
  const key = (p: Pose, armL: (sh: V3) => Limb): Pose => ({ ...p, armR: overhead(p), armL: armL(inFrame(chestOf(p), D.shoW, D.chest, 0)) });
  const lying = key({ pelvis: [0, 0.1, 0], pitch: -90, legL: long, legR: bent }, () => ({ at: [0.5, 0.035, -0.22], pole: [0.6, 0.2, 0.4], hand: [0.7, 0, 0.7] }));
  const onElbow = key({ pelvis: [0, 0.1, 0], pitch: -58, roll: -12, head: 8, legL: long, legR: bent }, (sh) => ({ at: [sh[0] + 0.06, 0.035, sh[2] + 0.2], pole: [0.3, -1, -0.4], hand: [0.3, 0, 1] }));
  const onHand = key({ pelvis: [0, 0.1, 0], pitch: -30, roll: -8, head: 4, legL: long, legR: bent }, (sh) => ({ at: within(sh, [sh[0] + 0.12, 0.035, sh[2] - 0.05]), pole: [0.4, 0.2, -1], hand: [0.5, 0, -0.8] }));
  const kneeling = key(
    { pelvis: [0.02, 0.475, 0.02], legL: { at: [0.12, 0.06, -0.4], toe: norm([0, -0.12, -1]), pole: [0, -1, 0.3] }, legR: { at: [-0.16, D.ankle, 0.44], pole: [-0.1, 0.3, 1] } },
    (sh) => ({ at: [sh[0] + 0.03, sh[1] - (ARM - 0.012), sh[2] + 0.03], pole: [0.25, 0, -1] }),
  );
  // Hips up on the left hand and the right foot: room to sweep the left leg under the body.
  const sweepPose: Pose = { pelvis: [0.02, 0.32, 0], pitch: -20, roll: -35, head: 2, legL: { at: [0.16, D.ankle, 0.1], pole: [0.8, 0.3, 0.5], toe: norm([0.5, 0, 1]) }, legR: bent };
  const handDown = onHand.armL!.at;
  const sweeping = key(sweepPose, (sh) => ({ at: within(sh, handDown, ARM - 0.012), pole: [0.4, 0.2, -1], hand: [0.5, 0, -0.8] }));
  const tucking = key(
    { pelvis: [0.02, 0.47, 0.01], pitch: -8, roll: -12, legL: { at: [0.14, 0.065, -0.15], pole: [0.4, -0.4, 0.5], toe: norm([0.3, -0.3, -1]) }, legR: { at: [-0.16, D.ankle, 0.44], pole: [-0.1, 0.6, 0.6] } },
    (sh) => ({ at: [sh[0] + 0.1, sh[1] - 0.45, sh[2] + 0.05], pole: [0.4, 0.1, -1] }),
  );
  const standing = key(
    { pelvis: [0, standY(0.13), 0.44], legL: { at: foot(0.13, 0.44), pole: [0.05, 0, 1] }, legR: { at: foot(-0.13, 0.44), pole: [-0.05, 0, 1] } },
    (sh) => ({ at: [sh[0] + 0.03, sh[1] - (ARM - 0.012), sh[2] + 0.03], pole: [0.25, 0, -1] }),
  );
  const e = explicit(
    seq(v, [
      [0.05, lying],
      [0.22, onElbow],
      [0.38, onHand],
      [0.54, sweeping],
      [0.63, tucking],
      [0.72, kneeling],
      [0.94, standing],
    ]),
  );
  // The bell arm stays vertical above its shoulder whatever the blend did.
  const armR = overhead(e);
  return { ...e, armR, props: [{ t: 'kb', at: armR.at, dir: norm([-0.3, -0.9, -0.25]) }] };
}

export function kettlebellWindmill(k: number): Pose {
  const e = ease(k);
  const half = 0.3;
  const p: Pose = {
    pelvis: [-0.12 * e, mix(standY(half), 0.84, e), -0.04 * e],
    roll: -34 * e,
    bend: -30 * e,
    pitch: 10 * e,
    head: -6 * e,
    headYaw: -55 * e,
    legL: { at: foot(half, 0), toe: toeOut(40), pole: [0.6, 0, 1] },
    legR: { at: foot(-half, 0), toe: toeOut(-5), pole: [-0.1, 0, 1] },
  };
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  const top: V3 = [shR[0], shR[1] + ARM - 0.02, shR[2]];
  p.armR = { at: top, pole: [-0.3, 0, -1], fist: true };
  p.armL = { at: within(shL, lerp([shL[0] + 0.03, shL[1] - (ARM - 0.02), shL[2] + 0.03], [0.26, 0.3, 0.1], e)), pole: [0.3, 0.2, -1] };
  p.props = [{ t: 'kb', at: top, dir: norm([0.2, -0.9, -0.3]) }];
  return p;
}

// ================================================================ mobility
export function worldsGreatestStretch(u: number): Pose {
  const drop = span(u, 0.1, 0.26) - span(u, 0.4, 0.52); // elbow to the instep
  const open = span(u, 0.44, 0.62) - span(u, 0.8, 0.96); // rotate and reach up
  const p: Pose = {
    pelvis: [0, 0.42 - 0.04 * drop, 0],
    pitch: 76 + 6 * drop - 4 * open,
    twist: 62 * open,
    head: -10,
    headYaw: 55 * open,
    legL: { at: [0.16, D.ankle, 0.56], pole: [0.5, 1, 0.3], toe: toeOut(8) },
    legR: { at: [-0.1, onToes(60), -0.75], pole: [0, -1, 0.2], toe: [0, -sind(60), cosd(60)] },
  };
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  const upAt = madd(shL, norm(lerp(norm(sub(shL, shR)), [0, 1, 0], 0.55)), ARM - 0.03);
  const low = lerp([0.0, 0.035, 0.56], [0.03, 0.06, 0.66], drop);
  p.armL = { at: within(shL, lerp(low, upAt, open)), pole: lerp([0.6, 0.2, -0.6], [0, 0, -1], open), hand: open > 0.3 ? undefined : [0, 0, 1] };
  p.armR = { at: within(shR, [-0.26, 0.035, 0.5]), pole: [-0.5, 0.2, -0.8], hand: [0, 0, 1] };
  return p;
}

/** Half-kneeling. side = +1: left knee on the floor, right foot in front. `fwd`: how far the hips push forward (degrees). */
function halfKneel(fwd: number, side = 1, footZ = 0.46): Pose {
  const down: Limb = { at: [side * 0.1, 0.06, -0.42], toe: norm([0, -0.12, -1]), pole: [0, -1, 0.3] };
  const front: Limb = { at: [-side * 0.12, D.ankle, footZ], pole: [-side * 0.05, 0.3, 1] };
  return {
    pelvis: [0, 0.045 + D.thigh * cosd(fwd), D.thigh * sind(fwd)],
    legL: side > 0 ? down : front,
    legR: side > 0 ? front : down,
  };
}

export function hipFlexorStretch(k: number): Pose {
  return { ...halfKneel(19 * k, 1, 0.5), pitch: -4 * k, head: 2 * k, arms: HIPS };
}

export function kneeToWall(k: number): Pose {
  return { ...halfKneel(24 * k, -1, 0.42), pitch: 4 + 6 * k, head: -4, arms: HIPS, props: [wall(0.685, 0, 0.5, 1.3)] };
}

/** Sitting, feet planted wide: both knees drop to one side, then the other. */
export function hip9090(u: number): Pose {
  const s = clamp(1.5 * Math.sin(2 * Math.PI * u), -1, 1);
  const a = 86 * Math.sign(s) * ease(Math.abs(s)); // + = knees to the athlete's right
  const leg = (side: number): Limb => ({
    at: [side * 0.3, 0.06, 0.42],
    pole: [-sind(a), cosd(a) - 0.1, 0.15 + (side * a < 0 ? 0 : 0.15 * Math.abs(sind(a)))],
    toe: norm([side * 0.2 - 0.6 * sind(a), 0.25 * Math.abs(sind(a)), 1 - 0.4 * Math.abs(sind(a))]),
  });
  return {
    pelvis: [0, 0.1, 0],
    pitch: 6,
    twist: -0.22 * a,
    headYaw: -0.1 * a,
    legL: leg(1),
    legR: leg(-1),
    arms: { at: [-0.17, -0.2, 0.2], pole: [1, -0.4, 0.1], local: true },
  };
}

/** Lying on the left side, head toward +x, facing the viewer. */
const SIDE_TILT = 12.7;
const sideLying = (): Pose => ({ pelvis: [0, 0.15, 0], roll: -(90 - SIDE_TILT), headRoll: -24 });

export function openBook(u: number): Pose {
  const k = span(u, 0.08, 0.42) - span(u, 0.58, 0.92);
  const p: Pose = {
    ...sideLying(),
    twist: -72 * k,
    headYaw: -50 * k,
    legL: { at: [-0.42, 0.06, 0.43], pole: [0, 0, 1], toe: [0, 0, 1] },
    legR: { at: [-0.42, 0.17, 0.43], pole: [0, 0.1, 1], toe: [0, 0, 1] },
  };
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  const L = ARM - 0.03;
  p.armL = { at: [shL[0], 0.045, shL[2] + Math.sqrt(Math.max(0.01, L * L - (shL[1] - 0.045) ** 2))], pole: [1, 0, -0.3], hand: [0, 0, 1] };
  const beta = mix(-36, 166, k);
  p.armR = { at: within(shR, [shR[0], Math.max(0.05, shR[1] + L * sind(beta)), shR[2] + L * cosd(beta)]), pole: [1, 0, -0.2] };
  return p;
}

export function pigeon(k: number): Pose {
  const p: Pose = {
    pelvis: [0, 0.16, 0],
    pitch: mix(20, 68, k),
    spine: 10 * k,
    head: mix(-8, 4, k),
    legL: { at: [-0.18, 0.06, 0.27], pole: [0.5, -0.2, 1], toe: norm([-1, 0, -0.2]) },
    legR: { at: [-0.1, 0.06, -(LEG - 0.006)], pole: [0, -1, 0], toe: [0, 0.12, -1] },
  };
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  p.arms = { at: within(sh, lerp([0.3, 0.1, sh[2] + 0.02], [0.2, 0.035, sh[2] + 0.42], k)), pole: [0.7, 0.2, -0.5], hand: k < 0.4 ? [0, -1, 0.2] : [0, 0, 1] };
  return p;
}

export function couchStretch(k: number): Pose {
  const wz = -0.3;
  const phi = mix(34, 8, k);
  return {
    pelvis: [0, 0.045 + D.thigh * cosd(phi), wz + 0.12 + D.thigh * sind(phi)],
    pitch: mix(34, -2, k),
    head: mix(-14, 0, k),
    legL: { at: [0.1, 0.46, wz + 0.07], toe: norm([0, 1, 0.06]), pole: [0, -1, 0.3] },
    legR: { at: [-0.12, D.ankle, wz + 0.72], pole: [-0.05, 0.3, 1] },
    arms: HIPS,
    props: [wall(wz - 0.015, 0, 0.5, 1.25)],
  };
}

export function wallCalfStretch(k: number): Pose {
  const lean = mix(18, 27, k);
  const L = LEG - 0.005;
  const p: Pose = {
    pelvis: [0, D.ankle + L * cosd(lean), -0.4 + L * sind(lean)],
    pitch: lean,
    head: -lean * 0.6,
    legL: { at: foot(0.1, -0.4), pole: [0.03, 0, 1] },
    legR: { at: foot(-0.1, 0.05), pole: [-0.03, 0, 1] },
    arms: { at: [0.2, 1.3, 0.495], pole: [0.5, -1, -0.2], hand: [0, 1, 0] },
    props: [wall(0.53, 0, 0.55, 1.9)],
  };
  return p;
}

export function doorwayChestStretch(k: number): Pose {
  const e = ease(k);
  const p: Pose = {
    pelvis: [0, standY(0.1, 0.28 * e), mix(-0.12, 0.08, e)],
    yaw: -18 * e,
    headYaw: 8 * e,
    legL: { at: foot(0.1, mix(-0.12, 0.34, e), D.ankle + 0.05 * Math.sin(Math.PI * e)), pole: [0.05, 0, 1] },
    legR: { at: foot(-0.1, mix(-0.12, -0.2, e)), pole: [-0.05, 0, 1] },
    armL: { at: [0.49, 1.665, 0], pole: [0.3, -1, -0.5], hand: [0, 1, 0] },
    props: [
      { t: 'box', c: [0.56, 1.0, 0], h: [0.04, 1.0, 0.05], tone: 'frame', layer: 'back' },
      { t: 'box', c: [-0.56, 1.0, 0], h: [0.04, 1.0, 0.05], tone: 'frame', layer: 'back' },
      { t: 'box', c: [0, 2.03, 0], h: [0.6, 0.03, 0.05], tone: 'frame', layer: 'back' },
    ],
  };
  return p;
}

export function standingQuadStretch(k: number): Pose {
  const e = ease(k);
  const py = standY(0.1);
  const an: V3 = lerp([0.1, D.ankle, 0], [0.09, py - 0.05, -0.18], e);
  const p: Pose = {
    pelvis: [-0.035 * e, py, 0],
    legR: { at: foot(-0.08, 0), pole: [-0.03, 0, 1] },
    legL: { at: an, pole: lerp([0.05, 0, 1], [0, -1, 0.3], e), toe: norm(lerp([0, 0, 1], [0, 0.55, -0.85], e)) },
    armR: { at: [0.13, -0.5, 0.05], pole: [0.5, 0, -1], local: true },
  };
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  const hang: V3 = [sh[0] + 0.03, sh[1] - (ARM - 0.012), sh[2] + 0.03];
  p.armL = { at: within(sh, lerp(hang, [an[0] + 0.02, an[1] + 0.03, an[2] - 0.04], e), ARM - 0.01), pole: [0.4, 0.3, -1], fist: e > 0.7 };
  return p;
}

export function seatedForwardFold(k: number): Pose {
  const p: Pose = {
    pelvis: [0, 0.1, 0],
    pitch: mix(-4, 46, k),
    spine: 20 * k,
    head: 10 * k,
    legs: { at: [0.08, 0.065, LEG - 0.004], toe: norm([0, 1, 0.12]), pole: [0, 1, 0] },
  };
  const sh = inFrame(chestOf(p), D.shoW, D.chest, 0);
  p.arms = { at: within(sh, lerp([0.13, 0.19, 0.42], [0.1, 0.17, 0.8], k)), pole: [0.6, 0.4, -0.5] };
  return p;
}

export function kneelingLatStretch(k: number): Pose {
  const phi = mix(90, 50, k);
  const hip = overKnees(phi);
  const shY = mix(0.72, 0.42, k);
  const shZ = hip[2] + Math.sqrt(TRUNK * TRUNK - (shY - hip[1]) ** 2);
  return {
    pelvis: hip,
    pitch: (Math.atan2(shZ - hip[2], shY - hip[1]) * 180) / Math.PI,
    head: mix(-10, 12, k),
    legs: { at: [0.1, 0.06, -0.42], toe: norm([0, -0.12, -1]), pole: [0, -1, 0.3] },
    arms: { at: [0.03, 0.69, 0.36], pole: [0.4, -0.6, 1], hand: [0, 0.8, -0.6] },
    props: benchX(0.55, 0.44, 0.5),
  };
}

export function wristFlexorStretch(k: number): Pose {
  const e = ease(k);
  const p: Pose = { ...stand({ half: 0.12 }), reach: 0.05 * e };
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0.05 * e);
  const shR = inFrame(c, -D.shoW, D.chest, 0.05 * e);
  const hang = (sh: V3, side: number): V3 => [sh[0] + 0.03 * side, sh[1] - (ARM - 0.012), sh[2] + 0.03];
  const wrist: V3 = [0.06, shL[1] - 0.1, shL[2] + 0.45];
  const fingers = norm(lerp([0, 0, 1], [0, -1, 0.1], e));
  p.armL = { at: lerp(hang(shL, 1), wrist, e), pole: [0.4, -1, -0.3], hand: fingers };
  p.armR = { at: within(shR, lerp(hang(shR, -1), madd(wrist, fingers, 0.075), e), ARM - 0.015), pole: [-0.6, -0.6, -0.4], fist: e > 0.8 };
  return p;
}

export function crossBodyShoulderStretch(k: number): Pose {
  const e = ease(k);
  const p = stand({ half: 0.12 });
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  const hang = (sh: V3, side: number): V3 => [sh[0] + 0.03 * side, sh[1] - (ARM - 0.012), sh[2] + 0.03];
  p.armL = { at: lerp(hang(shL, 1), [-0.26, shL[1] - 0.02, 0.2], e), pole: [0, -1, 0.3] };
  p.armR = { at: lerp(hang(shR, -1), [-0.03, shR[1] - 0.03, 0.22], e), pole: [-0.3, -1, 0.3], fist: e > 0.8 };
  return p;
}

export function overheadTricepsStretch(k: number): Pose {
  const e = ease(k);
  const p: Pose = { ...stand({ half: 0.12 }), head: 6 * e };
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  // The left arm goes up through the side, then folds behind the neck.
  const a = mix(8, 176, clamp(e / 0.6));
  const side: V3 = [shL[0] + (ARM - 0.04) * sind(a), shL[1] - (ARM - 0.04) * cosd(a), shL[2] + 0.03];
  const fold = ease((e - 0.5) / 0.5);
  p.armL = { at: lerp(side, [0.05, shL[1] + 0.07, -0.15], fold), pole: lerp([0.2, 0, -1], [0.3, 1, 0.1], fold) };
  const hang: V3 = [shR[0] - 0.03, shR[1] - (ARM - 0.012), shR[2] + 0.03];
  p.armR = { at: lerp(hang, [0.09, shR[1] + 0.3, -0.06], e), pole: [-0.5, 0.5, 1], fist: e > 0.85 };
  return p;
}

export function legSwing(u: number): Pose {
  const a = 38 * Math.sin(2 * Math.PI * u);
  const L = LEG - 0.02;
  const wx = -0.52;
  return {
    pelvis: [-0.03, standY(0.08), 0],
    pitch: -a * 0.1,
    legR: { at: foot(-0.08, 0), pole: [-0.03, 0, 1] },
    legL: { at: [0, -L * cosd(a), L * sind(a)], pole: [0, 0, 1], toe: [0, sind(a), cosd(a)], local: true },
    armR: { at: [wx + 0.04, 1.2, 0.12], pole: [-0.3, -1, -0.3], hand: [0, 1, 0] },
    armL: { at: [0.07, -0.49, -0.005 * a], pole: [0.4, 0, -1], local: true },
    props: [{ t: 'box', c: [wx, 0.95, 0], h: [0.6, 0.95, 0.015], yaw: 90, tone: 'wall' }],
  };
}

export function standingSideStretch(k: number): Pose {
  const e = ease(k);
  const bendIn = ease((k - 0.35) / 0.65);
  return {
    ...stand({ half: 0.13 }),
    pelvis: [0.045 * bendIn, standY(0.13), 0],
    bend: 30 * bendIn,
    headRoll: 8 * bendIn,
    armL: sweep(mix(8, 186, e)),
    armR: { at: [-0.02, -(ARM - 0.02), 0.04], pole: [0.25, 0, -1], local: true },
  };
}

export function neckSideStretch(k: number): Pose {
  const e = ease(k);
  const p: Pose = { ...stand({ half: 0.12 }), headRoll: 28 * e };
  const c = chestOf(p);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  const hang: V3 = [shR[0] - 0.03, shR[1] - (ARM - 0.012), shR[2] + 0.03];
  // The elbow goes out to the side, the hand comes to rest on the crown of the tilted head.
  const top: V3 = [-0.13, c.o[1] + D.neck + D.head + 0.085, -0.02];
  p.armR = { at: lerp(hang, top, e), pole: lerp([-0.25, 0, -1], [-1, 0.2, -0.2], ease(e * 1.6)), hand: e > 0.6 ? [1, -0.3, 0] : undefined };
  p.armL = { at: [0.1 * e + 0.03, -(ARM - 0.03), 0.03], pole: [0.25, 0, -1], local: true };
  return p;
}

// ================================================================ lying on the side
const sideArms = (p: Pose): Pose => {
  const c = chestOf(p);
  const shL = inFrame(c, D.shoW, D.chest, 0);
  const shR = inFrame(c, -D.shoW, D.chest, 0);
  return {
    ...p,
    armL: { at: within(shL, [shL[0] + 0.3, 0.05, shL[2] + 0.12]), pole: [0, 0.5, 1] },
    armR: { at: within(shR, [shR[0] - 0.1, 0.035, 0.32]), pole: [0, 0.6, 1], hand: [0.3, 0, 1] },
  };
};

export function clamshell(k: number): Pose {
  const p = sideArms({
    ...sideLying(),
    legL: { at: [-0.58, 0.06, 0], pole: [0, 0, 1], toe: norm([-0.3, 0, 1]) },
    legR: { at: [-0.58, 0.165, 0], pole: [0, 0.05 + 1.1 * k, 1], toe: norm([-0.3, 0.3 * k, 1]) },
  });
  const s = solve(p);
  p.props = [{ t: 'line', a: lerp(s.hip[0], s.kn[0], 0.82), b: lerp(s.hip[1], s.kn[1], 0.82), tone: 'band', w: 0.03 }];
  return p;
}

export function sideLyingHipAbduction(k: number): Pose {
  const a = mix(-5, 36, k);
  const L = LEG - 0.006;
  const p = sideLying();
  const hipR: V3 = [-0.1 * sind(SIDE_TILT), 0.15 + 0.1 * cosd(SIDE_TILT), 0];
  return sideArms({
    ...p,
    legL: { at: [-0.574, 0.06, -0.078], pole: [0, 0, 1], toe: norm([-0.3, 0, 1]) },
    legR: { at: [hipR[0] - L * cosd(a), hipR[1] + L * sind(a), -0.05], pole: [0, 0, 1], toe: norm([0.1, -0.25, 1]) },
  });
}
