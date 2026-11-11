/** The athlete's skeleton: a pose is described by where the hips are, how the
 *  trunk is oriented and where the hands and feet must be. Elbows and knees
 *  are found by inverse kinematics, so hands stay on the bar and feet stay on
 *  the floor through the whole movement. Units: metres. */
import { add, apply, clamp, cross, dot, euler, len, madd, mmul, mul, norm, place, reject, sub, type M3, type V3 } from './vec';

/** Body dimensions (≈ 1.74 m athlete). */
export const D = {
  hipW: 0.1, // hip joint, from the midline
  shoW: 0.205, // shoulder joint, from the midline
  thigh: 0.43,
  shin: 0.42,
  ankle: 0.07, // ankle joint above the sole
  lumbar: 0.2, // hip centre → waist joint
  chest: 0.3, // waist joint → shoulder line
  neck: 0.345, // waist joint → base of the head
  head: 0.165, // base → centre of the head
  upper: 0.29,
  fore: 0.255,
  hand: 0.085,
} as const;
export const LEG = D.thigh + D.shin;
export const ARM = D.upper + D.fore;
/** Hip height when standing tall. */
export const HIP = D.ankle + LEG;

export interface Limb {
  /** Wrist or ankle target. */
  at: V3;
  /** Direction the elbow / knee points. */
  pole?: V3;
  /** Target and pole are relative to the shoulder / hip, as (outward, up, forward) of the chest / pelvis. */
  local?: boolean;
  /** Foot: direction of the toes. */
  toe?: V3;
  /** Hand: closed around a handle. */
  fist?: boolean;
  /** Hand: direction of the fingers (defaults to the forearm's). */
  hand?: V3;
}

export type Tone = 'steel' | 'plate' | 'pad' | 'frame' | 'wood' | 'wall' | 'cable' | 'band' | 'mat';

export type Prop =
  | { t: 'bar'; a: V3; b: V3; plate?: number; r?: number }
  | { t: 'db'; at: V3; axis: V3; size?: number }
  | { t: 'kb'; at: V3; dir?: V3; size?: number }
  | { t: 'box'; c: V3; h: V3; pitch?: number; yaw?: number; tone: Tone; layer?: 'back' | 'front' }
  | { t: 'line'; a: V3; b: V3; tone: Tone; w?: number; layer?: 'back' | 'front' }
  | { t: 'disc'; c: V3; n: V3; r: number; tone: Tone; layer?: 'back' | 'front' }
  | { t: 'ball'; c: V3; r: number; tone: Tone };

export interface Pose {
  /** Centre of the hips. */
  pelvis: V3;
  yaw?: number;
  /** Trunk lean forward, degrees (90 = face down, −90 = on the back). */
  pitch?: number;
  roll?: number;
  /** Chest relative to the pelvis: forward bend, twist, side bend (degrees). */
  spine?: number;
  twist?: number;
  bend?: number;
  /** Head relative to the chest: nod, turn, tilt (degrees). */
  head?: number;
  headYaw?: number;
  headRoll?: number;
  /** Shoulders raised (m). */
  shrug?: number;
  /** Shoulders pushed forward (m). */
  reach?: number;
  /** Both arms / legs. World targets are given for the left side and mirrored. */
  arms?: Limb;
  armL?: Limb;
  armR?: Limb;
  legs?: Limb;
  legL?: Limb;
  legR?: Limb;
  props?: Prop[];
}

export interface Frame {
  o: V3;
  m: M3;
}

/** Solved skeleton. Index 0 = left, 1 = right. */
export interface Skel {
  P: Frame; // pelvis
  C: Frame; // chest (origin at the waist joint)
  H: Frame; // head (origin at its base)
  head: V3;
  sh: [V3, V3];
  el: [V3, V3];
  wr: [V3, V3];
  hand: [V3, V3]; // unit direction of the fingers
  fist: [boolean, boolean];
  armPole: [V3, V3];
  hip: [V3, V3];
  kn: [V3, V3];
  an: [V3, V3];
  toe: [V3, V3];
  sole: [V3, V3]; // unit vector out of the sole
  legPole: [V3, V3];
  /** Largest distance (m) by which a target was out of reach: 0 when the pose is valid. */
  strain: number;
}

const HANG: Limb = { at: [0.03, -(ARM - 0.012), 0.03], pole: [0.25, 0, -1], local: true };

function ik(root: V3, target: V3, l1: number, l2: number, pole: V3): { mid: V3; end: V3; over: number } {
  const d = sub(target, root);
  const dist = len(d);
  const max = l1 + l2 - 0.0005;
  const min = Math.abs(l1 - l2) + 0.03;
  const cd = clamp(dist, min, max);
  const dir = norm(d, [0, -1, 0]);
  const a = (l1 * l1 - l2 * l2 + cd * cd) / (2 * cd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let pp = reject(pole, dir);
  if (len(pp) < 1e-4) pp = reject(Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1], dir);
  const mid = madd(madd(root, dir, a), norm(pp), h);
  return { mid, end: madd(root, dir, cd), over: Math.max(0, dist - (l1 + l2), min - 0.03 - dist) };
}

const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];

function limbTarget(spec: Limb, side: number, root: V3, m: M3, shared: boolean): { at: V3; pole: V3 | undefined } {
  if (spec.local) {
    const loc = (p: V3): V3 => apply(m, [p[0] * side, p[1], p[2]]);
    return { at: add(root, loc(spec.at)), pole: spec.pole && loc(spec.pole) };
  }
  // A shared world target is written for the left side and mirrored for the right.
  const flip = shared && side < 0;
  return { at: flip ? mirror(spec.at) : spec.at, pole: spec.pole && (flip ? mirror(spec.pole) : spec.pole) };
}

export function solve(p: Pose): Skel {
  const Rp = euler(p.yaw, p.pitch, p.roll);
  const Rc = mmul(Rp, euler(p.twist, p.spine, p.bend));
  const Rh = mmul(Rc, euler(p.headYaw, p.head, p.headRoll));
  const waist = place(p.pelvis, Rp, [0, D.lumbar, 0]);
  const base = place(waist, Rc, [0, D.neck, 0]);
  const s: Skel = {
    P: { o: p.pelvis, m: Rp },
    C: { o: waist, m: Rc },
    H: { o: base, m: Rh },
    head: place(base, Rh, [0, D.head, 0]),
    sh: [waist, waist],
    el: [waist, waist],
    wr: [waist, waist],
    hand: [Rc[2], Rc[2]],
    fist: [false, false],
    armPole: [Rc[2], Rc[2]],
    hip: [p.pelvis, p.pelvis],
    kn: [p.pelvis, p.pelvis],
    an: [p.pelvis, p.pelvis],
    toe: [Rp[2], Rp[2]],
    sole: [[0, -1, 0], [0, -1, 0]],
    legPole: [Rp[2], Rp[2]],
    strain: 0,
  };

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;

    // ---- arm
    const own = i === 0 ? p.armL : p.armR;
    const aSpec = own ?? p.arms ?? HANG;
    const sh = place(waist, Rc, [side * D.shoW, D.chest + (p.shrug ?? 0), p.reach ?? 0]);
    const a = limbTarget(aSpec, side, sh, Rc, !own);
    const aPole = a.pole ?? apply(Rc, [0.25 * side, -0.2, -1]);
    const arm = ik(sh, a.at, D.upper, D.fore, aPole);
    s.sh[i] = sh;
    s.el[i] = arm.mid;
    s.wr[i] = arm.end;
    s.armPole[i] = aPole;
    s.fist[i] = !!aSpec.fist;
    const hd = aSpec.hand ? (aSpec.local ? apply(Rc, [aSpec.hand[0] * side, aSpec.hand[1], aSpec.hand[2]]) : !own && side < 0 ? mirror(aSpec.hand) : aSpec.hand) : sub(arm.end, arm.mid);
    s.hand[i] = norm(hd, Rc[2]);
    s.strain = Math.max(s.strain, arm.over);

    // ---- leg
    const ownLeg = i === 0 ? p.legL : p.legR;
    const lSpec = ownLeg ?? p.legs ?? { at: [0.11, D.ankle, p.pelvis[2]] as V3, pole: [0.08, 0, 1] as V3 };
    const hip = place(p.pelvis, Rp, [side * D.hipW, 0, 0]);
    const l = limbTarget(lSpec, side, hip, Rp, !ownLeg);
    const lPole = l.pole ?? apply(Rp, [0.08 * side, 0, 1]);
    const leg = ik(hip, l.at, D.thigh, D.shin, lPole);
    s.hip[i] = hip;
    s.kn[i] = leg.mid;
    s.an[i] = leg.end;
    s.legPole[i] = lPole;
    s.strain = Math.max(s.strain, leg.over);

    // Toes: as asked, else flat along the way the hips face (or away from the head when lying).
    let toe: V3;
    if (lSpec.toe) {
      toe = lSpec.local ? apply(Rp, [lSpec.toe[0] * side, lSpec.toe[1], lSpec.toe[2]]) : !ownLeg && side < 0 ? mirror(lSpec.toe) : lSpec.toe;
    } else {
      const flat: V3 = [Rp[2][0], 0, Rp[2][2]];
      toe = len(flat) > 0.35 ? flat : [-Rp[1][0], 0, -Rp[1][2]];
    }
    toe = norm(toe, [0, 0, 1]);
    const sideRef = Math.abs(dot(Rp[0], toe)) > 0.9 ? Rp[2] : Rp[0];
    s.toe[i] = toe;
    s.sole[i] = norm(cross(sideRef, toe), [0, -1, 0]);
    if (dot(s.sole[i], [0, -1, 0]) < 0 && !lSpec.toe) s.sole[i] = mul(s.sole[i], -1);
  }
  return s;
}

/** The chest frame a pose will produce: lets a movement place a bar on the back or hands on the chest before solving. */
export function chestOf(p: Pose): Frame {
  const Rp = euler(p.yaw, p.pitch, p.roll);
  return { o: place(p.pelvis, Rp, [0, D.lumbar, 0]), m: mmul(Rp, euler(p.twist, p.spine, p.bend)) };
}
export const pelvisOf = (p: Pose): Frame => ({ o: p.pelvis, m: euler(p.yaw, p.pitch, p.roll) });
/** A point given in a frame's (left, up, forward) coordinates. */
export const inFrame = (f: Frame, x: number, y: number, z: number): V3 => place(f.o, f.m, [x, y, z]);
