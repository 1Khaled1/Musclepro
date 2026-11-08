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
  steps: { en: string[]; fr: string[] };
  tips: { en: string[]; fr: string[] };
}

export interface Prescription {
  id: string;
  sets: number;
  reps: string;
  rest: number;
}

export interface ProgramDay {
  id: string;
  name: Localized;
  exercises: Prescription[];
}

export interface Program {
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
  days: ProgramDay[];
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
  exercises: Prescription[];
  estimated_minutes: number;
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
    target?: { sets: number; reps: string; rest: number };
    sets: LoggedSet[];
  }[];
}
