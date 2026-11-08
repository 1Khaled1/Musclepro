/** App state: signed-in user, favorites, theme, and the workout draft. */
import { api, ApiError } from './api';
import { setLang } from './i18n';
import type { DraftWorkout, Exercise, Prescription, Unit, User } from './types';

type Listener = () => void;

const USER_KEY = 'mp-user';

function readUserCache(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeUserCache(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

class Store {
  user: User | null = null;
  favorites = new Set<string>();
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  async init(): Promise<void> {
    try {
      const { user } = await api.me();
      await this.setUser(user, false);
    } catch (err) {
      // Offline: keep showing the last signed-in profile (public fields only,
      // no credentials — the session cookie stays HttpOnly) so logging works.
      this.user = err instanceof ApiError && err.code === 'network' ? readUserCache() : null;
      if (this.user) setLang(this.user.lang);
    }
  }

  async setUser(user: User | null, emit = true): Promise<void> {
    this.user = user;
    writeUserCache(user);
    this.favorites.clear();
    if (user) {
      setLang(user.lang);
      try {
        (await api.favorites()).favorites.forEach((id) => this.favorites.add(id));
      } catch {
        /* favorites are non-critical */
      }
    }
    if (emit) this.emit();
  }

  get isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  get unit(): Unit {
    return this.user?.unit ?? 'kg';
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const on = !this.favorites.has(id);
    if (on) {
      await api.addFavorite(id);
      this.favorites.add(id);
    } else {
      await api.removeFavorite(id);
      this.favorites.delete(id);
    }
    return on;
  }
}

export const store = new Store();

// ----------------------------------------------------------------- theme
export type Theme = 'dark' | 'light';
const themeListeners = new Set<(t: Theme) => void>();

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('mp-theme', theme);
  } catch {
    /* ignore */
  }
  themeListeners.forEach((fn) => fn(theme));
}

export function onThemeChange(fn: (t: Theme) => void): () => void {
  themeListeners.add(fn);
  return () => themeListeners.delete(fn);
}

// --------------------------------------------------------- workout draft
const DRAFT_KEY = 'mp-draft-workout';

export function loadDraft(): DraftWorkout | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftWorkout) : null;
  } catch {
    return memoryDraft;
  }
}

let memoryDraft: DraftWorkout | null = null;

export function saveDraft(draft: DraftWorkout | null): void {
  const existed = !!loadDraft();
  memoryDraft = draft;
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable: the draft lives only in memory */
  }
  // Only the shell's "Live" badge depends on the draft: emit on start/end.
  if (existed !== !!draft) store.emit();
}

function setsFor(target: Prescription | undefined, unit: Unit) {
  const count = target?.sets ?? 3;
  const reps = parseInt(target?.reps ?? '10', 10);
  return Array.from({ length: count }, () => ({
    reps: Number.isFinite(reps) ? reps : 10,
    weight: 0,
    unit,
    done: false,
  }));
}

export function startDraft(
  title: string,
  items: Prescription[],
  meta: Partial<Pick<DraftWorkout, 'program_id' | 'day_id' | 'week'>> = {},
): DraftWorkout {
  const draft: DraftWorkout = {
    title,
    started_at: Date.now(),
    notes: '',
    ...meta,
    items: items.map((p) => ({
      id: p.id,
      target: { sets: p.sets, reps: p.reps, rest: p.rest },
      sets: setsFor(p, store.unit),
    })),
  };
  saveDraft(draft);
  return draft;
}

/** Append an exercise to the current draft (creating a custom one if needed). */
export function addToDraft(exercise: Exercise, customTitle: string): void {
  const draft = loadDraft() ?? {
    title: customTitle,
    started_at: Date.now(),
    notes: '',
    items: [],
  };
  draft.items.push({ id: exercise.id, sets: setsFor(undefined, store.unit) });
  saveDraft(draft);
}
