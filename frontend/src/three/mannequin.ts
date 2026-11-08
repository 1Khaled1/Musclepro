/** Procedural anatomy figure: a lathe-built body shell with 14 clickable
 *  muscle groups (mirrored left/right) laid over it. No model files to load —
 *  the whole figure is ~40 KB of geometry generated at runtime. */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Group,
  LatheGeometry,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three';
import type { BodyType, Muscle } from '../types';

export interface Figure {
  group: Group;
  shell: Mesh[];
  muscles: Map<Muscle, Mesh[]>;
  geometries: BufferGeometry[];
}

interface Proportions {
  torso: [number, number][]; // lathe profile (radius, height)
  depth: number; // torso front-to-back squash
  shoulder: number; // x of the shoulder joint
  hip: number; // x of the hip joint
  arm: [number, number, number]; // upper arm radii top/mid/bottom
  fore: [number, number, number];
  thigh: [number, number, number];
  shin: [number, number, number];
  chest: number; // pec scale
  scale: number; // overall height scale
}

const MALE: Proportions = {
  torso: [
    [0.0, 0.84], [0.12, 0.845], [0.158, 0.88], [0.165, 0.93], [0.155, 0.99], [0.143, 1.06],
    [0.142, 1.12], [0.152, 1.19], [0.172, 1.27], [0.186, 1.34], [0.19, 1.39], [0.176, 1.44],
    [0.135, 1.48], [0.07, 1.51], [0.052, 1.53], [0.0, 1.535],
  ],
  depth: 0.62,
  shoulder: 0.205,
  hip: 0.09,
  arm: [0.05, 0.05, 0.038],
  fore: [0.043, 0.04, 0.028],
  thigh: [0.085, 0.074, 0.05],
  shin: [0.052, 0.05, 0.032],
  chest: 1,
  scale: 1,
};

const FEMALE: Proportions = {
  torso: [
    [0.0, 0.83], [0.13, 0.835], [0.172, 0.87], [0.18, 0.93], [0.163, 0.99], [0.132, 1.07],
    [0.126, 1.12], [0.138, 1.19], [0.158, 1.27], [0.166, 1.33], [0.168, 1.38], [0.158, 1.43],
    [0.122, 1.47], [0.062, 1.5], [0.046, 1.52], [0.0, 1.525],
  ],
  depth: 0.64,
  shoulder: 0.185,
  hip: 0.097,
  arm: [0.042, 0.041, 0.032],
  fore: [0.036, 0.034, 0.024],
  thigh: [0.088, 0.075, 0.048],
  shin: [0.05, 0.047, 0.03],
  chest: 0.88,
  scale: 0.95,
};

/** Smooth lathe profile from a few control radii (top→bottom along −Y). */
function limbGeometry(length: number, [top, mid, bottom]: [number, number, number]): LatheGeometry {
  const curve = new CatmullRomCurve3([
    new Vector3(0.0001, 0, 0),
    new Vector3(top * 0.8, -length * 0.02, 0),
    new Vector3(top, -length * 0.12, 0),
    new Vector3(mid, -length * 0.45, 0),
    new Vector3(bottom, -length * 0.88, 0),
    new Vector3(bottom * 0.7, -length * 0.99, 0),
    new Vector3(0.0001, -length, 0),
  ]);
  const pts = curve.getPoints(28).map((p) => new Vector2(Math.max(0.0001, p.x), p.y));
  return new LatheGeometry(pts, 32);
}

export function buildFigure(type: BodyType, shellMat: Material, muscleMat: (m: Muscle) => Material): Figure {
  const P = type === 'female' ? FEMALE : MALE;
  const group = new Group();
  const shell: Mesh[] = [];
  const muscles = new Map<Muscle, Mesh[]>();
  const geometries: BufferGeometry[] = [];
  const sphere = new SphereGeometry(1, 36, 24);
  geometries.push(sphere);

  const addShell = (geo: BufferGeometry, parent: Group = group): Mesh => {
    geometries.push(geo);
    const mesh = new Mesh(geo, shellMat);
    parent.add(mesh);
    shell.push(mesh);
    return mesh;
  };

  const addMuscle = (
    muscle: Muscle,
    parent: Group,
    pos: [number, number, number],
    scale: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ): void => {
    const mesh = new Mesh(sphere, muscleMat(muscle));
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    mesh.userData.muscle = muscle;
    parent.add(mesh);
    const list = muscles.get(muscle) ?? [];
    list.push(mesh);
    muscles.set(muscle, list);
  };

  // A limb segment: group at `from`, its local −Y axis pointing at `to`.
  const segment = (from: Vector3, to: Vector3, radii: [number, number, number]) => {
    const g = new Group();
    g.position.copy(from);
    const dir = to.clone().sub(from);
    const length = dir.length();
    g.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir.normalize()));
    group.add(g);
    addShell(limbGeometry(length, radii), g);
    return { g, length };
  };

  // Spheres at the joints so limb segments read as one continuous form.
  const joint = (pos: Vector3, r: number, squash = 1) => {
    const j = addShell(new SphereGeometry(r, 24, 16));
    j.position.copy(pos);
    j.scale.set(1, squash, 1);
  };

  // ---- torso, neck, head --------------------------------------------------
  const torso = addShell(new LatheGeometry(P.torso.map(([r, y]) => new Vector2(r, y)), 48));
  torso.scale.z = P.depth;

  const neck = addShell(limbGeometry(0.13, [0.05, 0.05, 0.062]));
  neck.position.set(0, 1.62, -0.008);

  const head = addShell(new SphereGeometry(0.105, 40, 28));
  head.position.set(0, 1.665, 0.005);
  head.scale.set(0.86, 1.08, 0.98);
  const jaw = addShell(new SphereGeometry(0.07, 28, 18));
  jaw.position.set(0, 1.605, 0.03);
  jaw.scale.set(0.95, 0.75, 0.95);

  const surfaceZ = (r: number, x: number) => P.depth * Math.sqrt(Math.max(0, r * r - x * x));

  for (const side of [-1, 1] as const) {
    const s = side;

    // ---- arms --------------------------------------------------------------
    const shoulder = new Vector3(s * P.shoulder, 1.43, 0);
    const elbow = new Vector3(s * (P.shoulder + 0.052), 1.145, -0.012);
    const wrist = new Vector3(s * (P.shoulder + 0.085), 0.89, 0.018);
    const upper = segment(shoulder, elbow, P.arm);
    const fore = segment(elbow, wrist, P.fore);
    joint(elbow, P.arm[2] * 0.95);
    joint(wrist, P.fore[2] * 1.08);
    const hand = addShell(new SphereGeometry(1, 20, 14));
    hand.position.set(s * (P.shoulder + 0.093), 0.835, 0.02);
    hand.scale.set(0.03, 0.066, 0.046);

    const ar = P.arm[1];
    addMuscle('biceps', upper.g, [0, -upper.length * 0.52, ar * 0.5], [ar * 0.78, upper.length * 0.3, ar * 0.62]);
    addMuscle('triceps', upper.g, [0, -upper.length * 0.45, -ar * 0.5], [ar * 0.84, upper.length * 0.34, ar * 0.64]);
    const fr = P.fore[0];
    addMuscle('forearms', fore.g, [0, -fore.length * 0.3, 0.004], [fr * 1.12, fore.length * 0.3, fr * 1.1]);
    addMuscle('shoulders', group, [s * (P.shoulder + 0.012), 1.425, 0.002], [0.064, 0.07, 0.068]);

    // ---- legs --------------------------------------------------------------
    const hip = new Vector3(s * P.hip, 0.9, 0);
    const knee = new Vector3(s * (P.hip + 0.012), 0.475, 0.01);
    const ankle = new Vector3(s * (P.hip + 0.016), 0.075, -0.005);
    const thigh = segment(hip, knee, P.thigh);
    const shin = segment(knee, ankle, P.shin);
    joint(knee, P.thigh[2] * 0.96, 1.1);
    joint(ankle, P.shin[2] * 1.05);
    const foot = addShell(new SphereGeometry(1, 20, 14));
    foot.position.set(s * (P.hip + 0.02), 0.038, 0.045);
    foot.scale.set(0.046, 0.038, 0.115);

    const tr = P.thigh[1];
    addMuscle('quads', thigh.g, [0, -thigh.length * 0.45, tr * 0.42], [tr * 0.95, thigh.length * 0.37, tr * 0.74]);
    addMuscle('hamstrings', thigh.g, [0, -thigh.length * 0.52, -tr * 0.42], [tr * 0.88, thigh.length * 0.34, tr * 0.7]);
    const sr = P.shin[0];
    addMuscle('calves', shin.g, [0, -shin.length * 0.3, -sr * 0.38], [sr * 1.02, shin.length * 0.26, sr * 0.88]);
    addMuscle('glutes', group, [s * 0.076, 0.9, -0.07], [0.082, 0.088, 0.06]);

    // ---- torso, front ------------------------------------------------------
    const pecX = 0.077 * P.chest;
    addMuscle('chest', group, [s * pecX, 1.335, surfaceZ(0.186, pecX) - 0.016],
      [0.084 * P.chest, 0.06 * P.chest, 0.032], [0.08, s * 0.2, s * -0.12]);

    for (const [i, y] of [1.225, 1.16, 1.095, 1.03].entries()) {
      const x = 0.034;
      const r = 0.146 + (i === 3 ? 0.004 : 0);
      addMuscle('abs', group, [s * x, y, surfaceZ(r, x) - 0.008], [0.031, 0.03, 0.016]);
    }

    addMuscle('obliques', group, [s * 0.11, 1.11, 0.042], [0.04, 0.085, 0.034], [0, s * 0.6, s * 0.18]);

    // ---- torso, back -------------------------------------------------------
    addMuscle('traps', group, [s * 0.085, 1.478, -0.022], [0.088, 0.034, 0.05], [0, 0, s * -0.38]);
    addMuscle('lats', group, [s * 0.112, 1.25, -0.074], [0.066, 0.13, 0.046], [0, s * -0.42, s * -0.22]);
    addMuscle('lower_back', group, [s * 0.038, 1.06, -surfaceZ(0.143, 0.038) + 0.012], [0.034, 0.075, 0.028]);
  }
  // Mid trapezius: a single diamond between the shoulder blades.
  addMuscle('traps', group, [0, 1.36, -surfaceZ(0.188, 0) + 0.018], [0.064, 0.1, 0.03]);

  group.scale.setScalar(P.scale);
  return { group, shell, muscles, geometries };
}
