import type { Localized } from './i18n';

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'pro';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'general' | 'strength' | 'hypertrophy' | 'endurance' | 'power' | 'fat_loss';
export type Unit = 'kg' | 'lbs';
export type BodyType = 'male' | 'female';
export type Role = 'user' | 'coach' | 'admin';

export const MUSCLES = [
  'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques',
  'traps', 'lats', 'lower_back', 'glutes', 'quads', 'hamstrings', 'calves',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = ['bodyweight', 'dumbbell', 'barbell', 'kettlebell', 'cable', 'machine', 'band'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced', 'pro'];
export const GOALS: Goal[] = ['general', 'strength', 'hypertrophy', 'endurance', 'power', 'fat_loss'];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  level: Level;
  lang: 'en' | 'fr';
  unit: Unit;
  goal: Goal;
  body: BodyType;
  created_at: string;
  active: boolean;
  workouts?: number;
}

export interface Exercise {
  id: string;
  name: Localized;
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  difficulty: Difficulty;
  mechanic: 'compound' | 'isolation';
  force: 'push' | 'pull' | 'static';
  type: 'strength' | 'power' | 'mobility';
  /** Mobility drills: suggested amount per set, e.g. "30s/side". */
  dose?: string;
  /** Dynamic drill that works as a warm-up before training. */
  warmup?: boolean;
  steps: { en: string[]; fr: string[] };
  tips: { en: string[]; fr: string[] };
}

/** % of 1-rep max: one value, or a range such as a test day [90, 102]. */
export type Percent = number | [number, number];

export interface Prescription {
  id: string;
  sets: number;
  reps: string;
  rest: number;
  /** Effort: RPE out of 10, or a % of 1RM for strength/power main lifts. */
  rpe?: number;
  pct?: Percent;
}

export interface ProgramDay {
  id: string;
  name: Localized;
  exercises: Prescription[];
}

export interface ProgramPhase {
  weeks: number[];
  name: Localized;
  focus: Localized;
}

export interface ProgramWeek {
  week: number;
  phase: number;
  deload: boolean;
  note: Localized;
  days: ProgramDay[];
}

/** A program as listed (no week-by-week plan). */
export interface ProgramSummary {
  id: string;
  level: Level;
  goal: Goal;
  days_per_week: number;
  weeks: number;
  minutes: number;
  equipment: Equipment[];
  name: Localized;
  summary: Localized;
  progression: Localized[];
  phases: ProgramPhase[];
}

export interface Program extends ProgramSummary {
  plan: ProgramWeek[];
}

export interface Enrollment {
  started_at: string;
  completed?: Record<string, string>;
}

export interface LoggedSet {
  reps: number;
  weight: number;
  unit: Unit;
  done: boolean;
}

export interface Workout {
  id: string;
  title: string;
  notes: string;
  duration_min: number;
  finished_at: string;
  program_id?: string;
  day_id?: string;
  week?: number;
  entries: { exercise_id: string; sets: LoggedSet[] }[];
}

export interface Stats {
  sessions: number;
  total_volume_kg: number;
  total_sets: number;
  streak_weeks: number;
  this_week: number;
  weekly: { week: string; volume_kg: number; sessions: number }[];
  personal_records: {
    exercise_id: string;
    e1rm_kg: number;
    weight: number;
    unit: Unit;
    reps: number;
    date: string;
  }[];
  muscle_sets_7d: Partial<Record<Muscle, number>>;
}

export interface GeneratedWorkout {
  goal: Goal;
  level: Level;
  muscles: Muscle[];
  /** Two dynamic mobility drills matched to the session. */
  warmup: Prescription[];
  exercises: Prescription[];
  estimated_minutes: number;
}

/** What to aim for next on one exercise, worked out from the logs (smart progression). */
export interface Suggestion {
  reason: 'progress' | 'reps' | 'repeat' | 'reset' | 'adjust' | 'pct' | 'deload' | 'return';
  /** Load per set, in `unit`; null for bodyweight work. */
  weight: number | null;
  unit: Unit;
  /** Reps per set; null for timed or distance targets. */
  reps: number | null;
  /** Estimated 1-rep max, for % of 1RM prescriptions. */
  e1rm?: number;
  /** Days since the exercise was last trained (return after a break). */
  days?: number;
  last: { date: string | null; weight: number; unit: Unit; reps: number[] } | null;
}

/** Workout being logged, kept in localStorage so a reload loses nothing. */
export interface DraftWorkout {
  title: string;
  /** Idempotency key: every save attempt of this session sends the same one. */
  client_id?: string;
  started_at: number;
  program_id?: string;
  day_id?: string;
  week?: number;
  notes: string;
  items: {
    id: string;
    target?: { sets: number; reps: string; rest: number; rpe?: number; pct?: Percent };
    /** undefined: not asked yet · null: nothing to suggest (first time, stretch…). */
    suggest?: Suggestion | null;
    sets: LoggedSet[];
  }[];
}
