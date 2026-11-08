/** Hand-drawn anatomical muscle map (original artwork for MusclePro).
 *
 *  Style: a few large, smooth anatomical forms with thick outlines — the
 *  way fitness muscle charts read best at phone size. Each view is authored
 *  as the LEFT half of a 600×1010 heroic male figure (midline x = 300) in
 *  absolute M/L/C/Z commands; the right half is mirrored and the female
 *  figure is a smooth width warp of the same art plus her own chest shape.
 */
import type { BodyType, Muscle } from '../types';

export type View = 'front' | 'back';
type Kind = 'muscle' | 'minor' | 'skin' | 'line' | 'back';

interface Part {
  d: string;
  m?: Muscle; // clickable muscle group
  kind?: Kind; // default 'muscle' when m is set, else 'skin'
  center?: boolean; // spans the midline: drawn once, not mirrored
  only?: BodyType; // shape used for one body type only
  arm?: boolean; // arms move as one rigid unit in the female warp
}

// ----------------------------------------------------------------- shared
const HEAD = 'M 300 26 C 328 26 347 40 350 64 C 352 80 351 96 348 110 C 346 126 340 142 330 152 C 321 160 311 164 300 164 C 289 164 279 160 270 152 C 260 142 254 126 252 110 C 249 96 248 80 250 64 C 253 40 272 26 300 26 Z';
const EAR = 'M 252 90 C 243 86 239 98 241 110 C 243 120 249 126 255 124';
const HAIR = 'M 251 84 C 245 56 260 32 288 26 C 310 21 336 28 347 48 C 353 60 353 74 349 86 C 345 72 337 62 325 57 C 307 50 287 52 271 58 C 261 64 255 73 251 84 Z';
const NECK = 'M 270 148 C 268 168 266 188 261 206 L 339 206 C 334 188 332 168 330 148 C 320 159 310 164 300 164 C 290 164 280 159 270 148 Z';

// Arm: deltoid cap → one upper-arm form → flaring forearm → open hand.
const ARM_UPPER = 'M 130 322 C 152 312 176 298 196 280 C 190 290 186 300 184 310 C 182 352 168 402 132 458 C 116 462 98 456 86 444 C 98 400 114 360 130 322 Z';
const FOREARM = 'M 86 444 C 98 456 116 462 132 458 C 132 478 124 498 112 516 C 98 538 84 560 70 578 L 40 566 C 44 540 50 510 58 486 C 66 466 76 452 86 444 Z';
const HAND = 'M 40 566 C 30 584 24 606 21 628 C 18 648 19 664 26 672 C 33 679 44 676 50 666 C 56 654 60 636 62 620 C 64 612 66 606 68 600 C 72 606 76 614 78 624 C 79 632 85 634 87 627 C 89 614 84 598 78 588 C 75 584 72 581 70 578 Z';
const FINGERS = 'M 30 634 C 30 648 31 660 34 671 M 40 636 C 40 650 41 662 42 673 M 50 632 C 51 644 51 655 50 665';

const KNEE = 'M 220 760 C 232 764 248 766 262 764 C 274 760 284 752 291 744 C 295 762 295 782 291 798 C 276 808 236 808 220 798 C 213 786 213 772 220 760 Z';
const SHIN = 'M 228 806 C 220 860 216 900 214 934 C 222 944 230 954 234 962 L 280 962 C 280 950 281 940 282 930 C 280 900 278 860 278 806 C 264 810 244 810 228 806 Z';
const FOOT = 'M 234 962 C 230 974 222 984 214 990 C 207 996 213 1002 226 1002 L 288 1002 C 296 1001 297 994 291 987 C 285 980 282 972 280 962 Z';

// Backings: dark body behind the muscles, so every gap reads as a seam.
const TORSO_BACKING = 'M 200 206 L 400 206 C 412 280 406 360 398 420 C 394 470 394 510 394 530 L 304 582 L 296 582 L 206 530 C 206 510 206 470 202 420 C 194 360 188 280 200 206 Z';
const LEG_BACKING = 'M 206 532 L 290 566 L 290 800 L 228 800 C 204 760 194 700 194 640 C 194 600 198 560 206 532 Z';
const CROTCH_BACKING = 'M 282 560 L 318 560 L 318 802 L 282 802 Z';

const FRONT: Part[] = [
  { d: TORSO_BACKING, center: true, kind: 'back' },
  { d: LEG_BACKING, kind: 'back' },
  { d: CROTCH_BACKING, center: true, kind: 'back' },

  // head & neck
  { d: HEAD, center: true },
  { d: EAR },
  { d: HAIR, center: true },
  { d: NECK, center: true },
  { d: 'M 275 166 C 282 182 290 194 297 205', kind: 'line' },

  // traps rising to the neck
  { m: 'traps', d: 'M 270 166 C 266 184 260 196 252 202 C 236 208 214 212 194 214 C 214 198 236 186 252 178 C 260 174 266 170 270 166 Z' },

  // shoulders & chest
  { m: 'shoulders', d: 'M 244 208 C 214 200 182 204 160 220 C 138 236 127 262 126 290 C 126 302 127 312 130 322 C 152 312 176 298 196 280 C 212 256 230 232 244 208 Z' },
  { m: 'chest', only: 'male', d: 'M 300 206 C 280 204 262 205 244 208 C 230 232 212 256 196 280 C 190 290 186 300 184 310 C 196 334 226 352 260 354 C 280 355 292 350 300 344 Z' },
  { m: 'chest', only: 'female', d: 'M 300 208 C 280 206 262 207 244 210 C 230 234 212 258 198 282 C 184 306 184 334 206 350 C 228 366 268 362 300 350 Z' },

  // arms
  { m: 'biceps', d: ARM_UPPER, arm: true },
  { m: 'forearms', d: FOREARM, arm: true },
  { d: HAND, arm: true },
  { d: FINGERS, kind: 'line', arm: true },

  // torso: one oblique form per side, one abdominal wall with its lines
  { m: 'obliques', d: 'M 186 322 C 206 340 230 352 249 358 C 250 400 252 450 255 492 C 236 502 216 512 198 522 C 196 500 202 482 202 466 C 202 430 196 380 186 322 Z' },
  { m: 'abs', center: true, d: 'M 300 350 C 288 352 272 354 259 360 C 253 364 251 372 251 382 C 251 420 253 460 257 494 C 263 520 280 544 300 556 C 320 544 337 520 343 494 C 347 460 349 420 349 382 C 349 372 347 364 341 360 C 328 354 312 352 300 350 Z' },
  { center: true, kind: 'line', d: 'M 300 358 L 300 546 M 258 402 C 272 395 288 397 300 404 C 312 397 328 395 342 402 M 257 442 C 272 435 288 437 300 444 C 312 437 328 435 343 442 M 258 482 C 272 475 288 477 300 484 C 312 477 328 475 342 482' },

  // thighs: the outer quad sweep and the inner thigh, split by one line
  { m: 'quads', d: 'M 198 524 C 212 528 226 534 238 540 C 246 600 244 680 252 744 C 254 752 256 758 258 762 C 246 766 232 766 220 760 C 204 740 194 712 190 680 C 186 648 184 610 188 576 C 190 556 194 538 198 524 Z' },
  { m: 'quads', d: 'M 238 540 C 258 548 276 556 292 568 C 292 610 290 660 288 700 C 287 722 286 738 284 748 C 276 758 268 762 258 762 C 256 758 254 752 252 744 C 244 680 246 600 238 540 Z' },
  { d: 'M 266 690 C 276 708 282 726 284 744', kind: 'line' },

  // knees, lower legs, feet
  { d: KNEE },
  { d: SHIN },
  { m: 'calves', d: 'M 218 800 C 204 822 196 852 198 884 C 200 906 206 922 214 934 C 216 900 220 860 228 806 Z' },
  { m: 'calves', d: 'M 288 800 C 298 826 300 856 296 886 C 293 906 288 920 282 930 C 280 900 278 860 278 806 Z' },
  { d: FOOT },
];

const BACK: Part[] = [
  { d: TORSO_BACKING, center: true, kind: 'back' },
  { d: LEG_BACKING, kind: 'back' },
  { d: CROTCH_BACKING, center: true, kind: 'back' },

  { d: HEAD, center: true },
  { d: EAR },
  { d: 'M 251 92 C 244 60 262 30 300 28 C 338 30 356 60 349 92 C 346 112 340 128 330 140 C 312 146 288 146 270 140 C 260 128 254 112 251 92 Z', center: true },
  { d: NECK, center: true },

  // traps kite, rear delts, rotator cuff, lats
  { m: 'traps', d: 'M 300 176 L 300 420 C 290 384 276 344 262 314 C 254 296 244 280 232 266 C 222 254 208 240 194 226 C 214 212 240 200 258 190 C 266 184 270 174 272 164 C 280 170 290 174 300 176 Z' },
  { m: 'shoulders', d: 'M 194 226 C 172 210 146 214 134 236 C 124 256 124 284 126 300 C 127 310 128 316 130 322 C 152 316 176 302 196 288 C 204 278 210 268 214 260 C 208 250 202 238 194 226 Z' },
  { m: 'shoulders', d: 'M 194 226 C 208 240 222 254 232 266 C 244 280 252 296 254 312 C 254 324 251 334 246 342 C 230 344 212 338 198 330 C 196 316 196 300 196 288 C 204 278 210 268 214 260 C 208 250 202 238 194 226 Z' },
  { m: 'lats', d: 'M 198 330 C 212 338 230 344 246 342 C 252 334 256 324 262 314 C 276 344 290 384 300 420 L 300 426 C 288 446 280 470 276 500 C 254 506 228 504 204 498 C 204 470 202 440 200 410 C 198 380 196 352 198 330 Z' },
  { m: 'lower_back', d: 'M 300 426 L 300 558 C 290 552 280 542 274 528 C 272 518 274 508 276 500 C 280 470 288 446 300 426 Z' },
  { m: 'obliques', d: 'M 204 498 C 228 504 254 506 276 500 C 274 508 272 518 274 528 C 250 534 226 532 204 526 C 202 516 202 506 204 498 Z' },

  // arms
  { m: 'triceps', d: 'M 130 322 C 152 316 176 302 196 288 C 194 298 192 308 190 318 C 182 356 168 404 132 458 C 116 462 98 456 86 444 C 98 400 114 360 130 322 Z', arm: true },
  { d: 'M 158 318 C 146 360 130 404 112 452', kind: 'line', arm: true },
  { m: 'forearms', d: FOREARM, arm: true },
  { d: HAND, arm: true },
  { d: FINGERS, kind: 'line', arm: true },

  // glutes & legs
  { m: 'glutes', d: 'M 204 526 C 226 532 250 534 274 528 C 288 540 296 552 300 566 L 300 640 C 286 656 262 662 240 658 C 214 654 196 636 192 610 C 188 584 194 548 204 526 Z' },
  { m: 'hamstrings', d: 'M 192 612 C 204 640 222 656 244 660 C 244 700 246 734 250 762 C 236 764 226 762 220 760 C 200 730 188 690 184 660 C 182 640 186 624 192 612 Z' },
  { m: 'hamstrings', d: 'M 244 660 C 266 662 288 654 299 642 C 299 680 296 720 290 748 C 278 760 264 764 250 762 C 246 734 244 700 244 660 Z' },
  { d: KNEE },
  { d: 'M 230 782 C 246 790 268 790 284 782', kind: 'line' },
  { m: 'calves', d: 'M 218 800 C 202 824 194 860 202 892 C 208 906 226 912 244 906 C 244 872 244 838 244 806 C 236 800 226 798 218 800 Z' },
  { m: 'calves', d: 'M 244 806 C 256 798 274 798 288 800 C 300 826 300 866 290 896 C 284 908 266 912 244 906 C 244 872 244 838 244 806 Z' },
  { m: 'calves', d: 'M 202 892 C 208 906 226 912 244 906 C 266 912 284 908 290 896 C 286 920 282 942 280 962 L 234 962 C 226 940 214 916 202 892 Z' },
  { d: FOOT },
];

// ------------------------------------------------------------ geometry
type Fn = (x: number, y: number) => [number, number];

function mapPath(d: string, fn: Fn): string {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? [];
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/[MLCZ]/.test(tok)) {
      out.push(tok);
      i++;
      continue;
    }
    const [x, y] = fn(parseFloat(tok), parseFloat(tokens[i + 1]));
    out.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    i += 2;
  }
  return out.join(' ');
}

const MID = 300;
const mirror: Fn = (x, y) => [2 * MID - x, y];
const identity: Fn = (x, y) => [x, y];

/** Smoothstep interpolation through (y, k) keyframes. */
function smoothKeys(y: number, keys: [number, number][]): number {
  for (let i = 1; i < keys.length; i++) {
    const [y1, k1] = keys[i];
    const [y0, k0] = keys[i - 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return k0 + (k1 - k0) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1][1];
}

// Female silhouette: narrower shoulders and waist, wider hips (width
// multiplier by height); arms follow the shoulders as one rigid unit.
const FEMALE_K: [number, number][] = [
  [0, 0.93], [165, 0.93], [210, 0.86], [340, 0.88], [470, 0.85], [535, 1.0], [612, 1.06], [760, 1.01], [1010, 0.97],
];
const FEMALE_ARM = 0.87;
const female = (arm: boolean): Fn =>
  arm ? (x, y) => [MID + (x - MID) * FEMALE_ARM, y] : (x, y) => [MID + (x - MID) * smoothKeys(y, FEMALE_K), y];

// ------------------------------------------------------------- render
export interface AnatomyOptions {
  label?: (m: Muscle) => string;
  interactive?: boolean;
  /** 'full' shows head to feet; 'focus' frames head to mid-calf, bigger. */
  frame?: 'full' | 'focus';
}

const VIEWBOX = { full: '-4 14 608 996', focus: '4 18 592 880' };

/** Render one view as an <svg> string. Muscle groups are <g data-muscle>. */
export function renderAnatomy(view: View, body: BodyType, opts: AnatomyOptions = {}): string {
  const parts = (view === 'front' ? FRONT : BACK).filter((p) => !p.only || p.only === body);
  const groups = new Map<Muscle, string[]>();
  const layers: Record<Exclude<Kind, 'muscle'>, string[]> = { back: [], skin: [], minor: [], line: [] };

  for (const p of parts) {
    const warp = body === 'female' ? female(!!p.arm) : identity;
    const ds = [mapPath(p.d, warp)];
    // Shape the authored left half first, then mirror (all passes are symmetric).
    if (!p.center) ds.push(mapPath(p.d, (x, y) => mirror(...warp(x, y))));
    if (p.m) {
      const list = groups.get(p.m) ?? [];
      list.push(...ds);
      groups.set(p.m, list);
    } else {
      const kind = p.kind && p.kind !== 'muscle' ? p.kind : 'skin';
      layers[kind].push(...ds);
    }
  }

  const path = (cls: string) => (d: string) => `<path class="${cls}" d="${d}"/>`;
  const muscles = [...groups.entries()]
    .map(([m, ds]) => {
      const label = opts.label ? opts.label(m) : m;
      const a11y = opts.interactive
        ? ` role="button" tabindex="0" aria-label="${label.replace(/"/g, '&quot;')}" aria-pressed="false"`
        : '';
      return `<g class="mg" data-muscle="${m}"${a11y}>${ds.map(path('mp-m')).join('')}</g>`;
    })
    .join('');

  return `<svg class="anatomy" viewBox="${VIEWBOX[opts.frame ?? 'full']}" xmlns="http://www.w3.org/2000/svg" data-view="${view}" role="group">
    <g class="mp-back-layer">${layers.back.map(path('mp-back')).join('')}</g>
    <g class="mp-skin-layer">${layers.skin.map(path('mp-skin')).join('')}</g>
    <g class="mp-minor-layer">${layers.minor.map(path('mp-minor')).join('')}</g>
    <g class="mp-muscles">${muscles}</g>
    <g class="mp-line-layer" aria-hidden="true">${layers.line.map(path('mp-line')).join('')}</g>
  </svg>`;
}
