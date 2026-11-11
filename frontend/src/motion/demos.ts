/** One animated demonstration per exercise id. */
import * as M from './moves';
import type { Pose } from './rig';
import { ease } from './vec';

export interface Demo {
  /** Pose at phase k ∈ [0, 1]; for 'cycle', k is the position in the loop. */
  pose: (k: number) => Pose;
  /** ecc: lower first, then lift (squat) · con: lift first (curl) · hold: get into position and hold · cycle: continuous loop. */
  mode: 'ecc' | 'con' | 'hold' | 'cycle';
  /** Default viewing angle in degrees: 0 = from the front, −90 = from the side (facing right), 180 = from behind. */
  view: number;
  /** Seconds per loop ('cycle' only). */
  period?: number;
  /** The loop does not end where it starts (a jump that travels): the player fades between repetitions. */
  cut?: boolean;
}

const Q = -40; // three-quarter front
const SIDE = -78;
const FRONT = -12;
const BACK = -142; // three-quarter back

const ecc = (pose: Demo['pose'], view = Q): Demo => ({ pose, mode: 'ecc', view });
const con = (pose: Demo['pose'], view = Q): Demo => ({ pose, mode: 'con', view });
const hold = (pose: Demo['pose'], view = Q): Demo => ({ pose, mode: 'hold', view });
const cycle = (pose: Demo['pose'], period: number, view = Q): Demo => ({ pose, mode: 'cycle', view, period });
/** Alternate sides: each half of the loop goes down and back up. */
const alternate = (side: (k: number, s: number) => Pose) => (u: number): Pose => (u < 0.5 ? side(ease(M.tri(u * 2)), 1) : side(ease(M.tri(u * 2 - 1)), -1));

export const DEMOS: Record<string, Demo> = {
  // ---- squat pattern
  'bodyweight-squat': ecc((k) => M.squat(k)),
  'back-squat': ecc((k) => M.squat(k, { load: 'back' })),
  'front-squat': ecc((k) => M.squat(k, { load: 'front', lean: 20, back: 0.17 })),
  'goblet-squat': ecc((k) => M.squat(k, { load: 'goblet', lean: 24, back: 0.2 })),
  'box-squat': ecc(M.boxSquat, -58),
  'deep-squat-hold': hold((k) => M.squat(k, { depth: 0.56, lean: 26, back: 0.2, half: 0.22, toe: 28, load: 'prayer' })),
  'wall-sit': hold(M.wallSit, -62),
  'jump-squat': cycle((u) => M.jumpSquat(u), 2.3),
  'pistol-squat': ecc(M.pistolSquat, -58),
  'lateral-lunge': ecc(M.lateralLunge, FRONT),
  'cossack-squat': ecc(M.cossackSquat, FRONT),
  'hack-squat': ecc(M.hackSquat, -62),
  'leg-press': ecc(M.legPress, -68),
  // ---- hinge pattern
  deadlift: con(M.deadlift),
  'romanian-deadlift': ecc(M.romanianDeadlift, -52),
  'sumo-deadlift': con(M.sumoDeadlift, -28),
  'kettlebell-deadlift': con(M.kettlebellDeadlift, -50),
  'good-morning': ecc(M.goodMorning, -58),
  'cable-pull-through': ecc(M.cablePullThrough, SIDE),
  'kettlebell-swing': con(M.kettlebellSwing, -66),
  'single-leg-romanian-deadlift': ecc(M.singleLegRdl, -68),
  'bent-over-row': con((k) => M.barRow(k), -50),
  'pendlay-row': con((k) => M.barRow(k, 80, true), -50),
  'reverse-fly': con(M.reverseFly, -30),
  'dumbbell-kickback': con(M.kickback, SIDE),
  // ---- lunge pattern
  'walking-lunge': cycle(alternate((k, s) => M.dumbbells(M.lunge(k, s, true))), 4.2, -60),
  'reverse-lunge': cycle(alternate((k, s) => M.dumbbells(M.lunge(k, s))), 4.2, -60),
  'bulgarian-split-squat': ecc(M.bulgarianSplitSquat, -66),
  'step-up': con(M.stepUp, -62),
  // ---- push-ups, planks and work on all fours
  'push-up': ecc((k) => M.pushup(k), -62),
  'incline-push-up': ecc((k) => M.pushup(k, { hands: 0.44, bench: 'hands' }), -62),
  'decline-push-up': ecc((k) => M.pushup(k, { feet: 0.42, bench: 'feet' }), -62),
  'diamond-push-up': ecc((k) => M.pushup(k, { width: 0.05, tuck: true, low: 0.13 }), -62),
  'pike-push-up': ecc(M.pikePushup, -72),
  'scapular-push-up': ecc(M.scapularPushup, -66),
  plank: hold(() => M.forearmPlank(), -62),
  'side-plank': hold(() => M.sidePlank(), -30),
  'mountain-climber': cycle(M.mountainClimber, 1.1, -66),
  'bear-crawl': cycle(M.bearCrawl, 1.5, -60),
  burpee: cycle(M.burpee, 4.6, -66),
  inchworm: cycle(M.inchworm, 7, -70),
  'downward-dog': hold(M.downwardDog, -70),
  'cat-cow': cycle(M.catCow, 4.6, -72),
  'bird-dog': cycle(M.birdDog, 6, -64),
  'thread-the-needle': cycle(M.threadTheNeedle, 6.5, -48),
  'childs-pose': hold(M.childsPose, -66),
  'adductor-rock-back': ecc(M.adductorRockBack, -28),
  'cobra-stretch': hold(M.cobra, -70),
  superman: con(M.superman, -70),
  'prone-ytw-raise': cycle(M.proneYtw, 7.5, -52),
  // ---- on the back
  'glute-bridge': con((k) => M.gluteBridge(k), -66),
  'single-leg-glute-bridge': con((k) => M.gluteBridge(k, true), -66),
  'hip-thrust': con(M.hipThrust, -62),
  'dead-bug': cycle(M.deadBug, 5.2, -60),
  'hollow-hold': hold(M.hollowHold, -72),
  'v-up': con(M.vUp, -72),
  'bicycle-crunch': cycle(M.bicycleCrunch, 2.6, -56),
  'mcgill-curl-up': hold(M.mcgillCurlUp, -60),
  'russian-twist': cycle(M.russianTwist, 2.8, -34),
  'band-hamstring-stretch': hold(M.bandHamstringStretch, -66),
  // ---- bench press family
  'barbell-bench-press': ecc((k) => M.benchPress(k)),
  'close-grip-bench-press': ecc((k) => M.benchPress(k, { grip: 0.13, tuck: true })),
  'incline-barbell-bench-press': ecc((k) => M.benchPress(k, { incline: 32 }), -50),
  'dumbbell-bench-press': ecc((k) => M.benchPress(k, { tool: 'db' })),
  'incline-dumbbell-press': ecc((k) => M.benchPress(k, { tool: 'db', incline: 32 }), -50),
  'dumbbell-fly': ecc((k) => M.benchPress(k, { tool: 'fly' }), -32),
  'skull-crusher': ecc((k) => M.benchPress(k, { tool: 'skull' }), -62),
  // ---- overhead press family
  'overhead-press': con((k) => M.overheadPress(k)),
  'push-press': cycle(M.pushPress, 3.4),
  'dumbbell-shoulder-press': con((k) => M.overheadPress(k, { tool: 'db', seat: true }), -30),
  'arnold-press': con((k) => M.overheadPress(k, { tool: 'arnold', seat: true }), -34),
  'kettlebell-press': con((k) => M.overheadPress(k, { tool: 'kb' }), -32),
  'machine-shoulder-press': con((k) => M.overheadPress(k, { tool: 'machine', seat: true }), -42),
  'landmine-press': con(M.landminePress, -64),
  'overhead-triceps-extension': con(M.overheadTricepsExtension, -58),
  // ---- arms and shoulders
  'dumbbell-curl': con((k) => M.curl(k), -52),
  'hammer-curl': con((k) => M.curl(k, { tool: 'hammer' }), -52),
  'barbell-curl': con((k) => M.curl(k, { tool: 'bar' }), -46),
  'reverse-curl': con((k) => M.curl(k, { tool: 'bar', to: 132 }), -46),
  'cable-curl': con((k) => M.curl(k, { tool: 'cable' }), -62),
  'concentration-curl': con(M.concentrationCurl, -28),
  'wrist-curl': con(M.wristCurl, -58),
  'triceps-pushdown': con(M.pushdown, -66),
  'lateral-raise': con((k) => M.lateralRaise(k), -18),
  'cable-lateral-raise': con((k) => M.lateralRaise(k, true), -14),
  'band-pull-apart': con(M.bandPullApart, -30),
  'face-pull': con(M.facePull, -58),
  'barbell-shrug': con(M.shrug, -30),
  'band-external-rotation': con(M.bandExternalRotation, -8),
  'arm-circle': cycle(M.armCircle, 1.6, -24),
  'band-pass-through': ecc(M.bandPassThrough, -60),
  'wall-slide': con(M.wallSlide, -22),
  'bench-dip': ecc(M.benchDip, -62),
  'chest-dip': ecc(M.chestDip, -52),
  'cable-chest-fly': con(M.cableChestFly, -24),
  'pallof-press': con(M.pallofPress, -34),
  'cable-woodchop': con(M.cableWoodchop, -18),
  'cable-crunch': con(M.cableCrunch, SIDE),
  // ---- hanging and pulling
  'pull-up': con((k) => M.pullup(k), BACK),
  'chin-up': con((k) => M.pullup(k, { grip: 0.2, chin: true }), -44),
  'assisted-pull-up': con((k) => M.pullup(k, { assist: true }), -128),
  'dead-hang': hold(() => M.pullup(0), -36),
  'hanging-leg-raise': con((k) => M.pullup(0.06, { legs: 4 + 88 * k, lean: 4 + 6 * k }), -64),
  'toes-to-bar': con((k) => M.pullup(0.1, { legs: 4 + 150 * k, lean: 4 + 36 * k }), -68),
  'lat-pulldown': con(M.latPulldown, BACK),
  'straight-arm-pulldown': con(M.straightArmPulldown, -64),
  'seated-cable-row': con((k) => M.seatedRow(k), -112),
  'band-row': con(M.bandRow, -118),
  'inverted-row': con(M.invertedRow, -58),
  'one-arm-dumbbell-row': con(M.oneArmRow, -118),
  'chest-supported-dumbbell-row': con(M.chestSupportedRow, -120),
  // ---- machines
  'leg-extension': con((k) => M.legMachine(k), -58),
  'seated-leg-curl': con((k) => M.legMachine(k, true), -62),
  'lying-leg-curl': con(M.lyingLegCurl, -112),
  'seated-calf-raise': con(M.seatedCalfRaise, -60),
  'hip-abduction-machine': con(M.hipAbduction, FRONT),
  'pec-deck': con((k) => M.chestMachine(k, true), -26),
  'machine-chest-press': con((k) => M.chestMachine(k), -44),
  'back-extension': con(M.backExtension, -66),
  // ---- calves, carries, band walk
  'standing-calf-raise': con((k) => M.calfRaise(k), -112),
  'single-leg-calf-raise': con((k) => M.calfRaise(k, true), -112),
  'farmers-carry': cycle((u) => M.carry(u), 1.15, -52),
  'suitcase-carry': cycle((u) => M.carry(u, true), 1.15, 36),
  'monster-walk': cycle(M.monsterWalk, 1.5, -30),
  'nordic-curl': ecc(M.nordicCurl, -104),
  // ---- jumps
  'box-jump': cycle(M.boxJump, 4.6, -64),
  'broad-jump': { ...cycle(M.broadJump, 3.4, -74), cut: true },
  'tuck-jump': cycle(M.tuckJump, 2.2),
  'jumping-jack': cycle(M.jumpingJack, 1.0, FRONT),
  'high-knees': cycle(M.highKnees, 0.72, -52),
  'skater-jump': cycle(M.skaterJump, 2.4, FRONT),
  // ---- cleans, get-up, windmill
  'power-clean': cycle(M.powerClean, 4.4, -52),
  'kettlebell-clean': con(M.kettlebellClean, -58),
  'turkish-get-up': cycle(M.turkishGetUp, 11, -56),
  'kettlebell-windmill': ecc(M.kettlebellWindmill, FRONT),
  // ---- mobility
  'worlds-greatest-stretch': cycle(M.worldsGreatestStretch, 7.5, -56),
  'half-kneeling-hip-flexor-stretch': hold(M.hipFlexorStretch, SIDE),
  'hip-90-90-switch': cycle(M.hip9090, 5.5, -26),
  'open-book-rotation': cycle(M.openBook, 6, -18),
  'pigeon-stretch': hold(M.pigeon, -50),
  'couch-stretch': hold(M.couchStretch, -74),
  'wall-calf-stretch': hold(M.wallCalfStretch, -96),
  'knee-to-wall-ankle-rock': ecc(M.kneeToWall, SIDE),
  'doorway-chest-stretch': hold(M.doorwayChestStretch, -26),
  'standing-quad-stretch': hold(M.standingQuadStretch, -70),
  'seated-forward-fold': hold(M.seatedForwardFold, -74),
  'kneeling-lat-stretch': hold(M.kneelingLatStretch, -72),
  'wrist-flexor-stretch': hold(M.wristFlexorStretch, -36),
  'cross-body-shoulder-stretch': hold(M.crossBodyShoulderStretch, -18),
  'overhead-triceps-stretch': hold(M.overheadTricepsStretch, -150),
  'leg-swing': cycle(M.legSwing, 1.7, -68),
  'standing-side-stretch': hold(M.standingSideStretch, FRONT),
  'neck-side-stretch': hold(M.neckSideStretch, -10),
  // ---- lying on the side
  'banded-clamshell': con(M.clamshell, -16),
  'side-lying-hip-abduction': con(M.sideLyingHipAbduction, -16),
};

export const VIEWS = { Q, SIDE, FRONT, BACK };
