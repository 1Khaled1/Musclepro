/** Typed client for the Flask API. Same origin, cookie session, CSRF header. */
import type { Enrollment, Exercise, GeneratedWorkout, Percent, Program, ProgramSummary, Stats, Suggestion, Unit, User, Workout } from './types';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

// Requests still waiting after SLOW_MS: on Render's free plan the server
// sleeps when idle and takes up to a minute to wake. The UI explains it.
const SLOW_MS = 2500;
let slowCount = 0;
const slowListeners = new Set<(pending: number) => void>();
export function onSlowRequests(fn: (pending: number) => void): () => void {
  slowListeners.add(fn);
  return () => slowListeners.delete(fn);
}
const setSlow = (delta: number) => {
  slowCount += delta;
  slowListeners.forEach((fn) => fn(slowCount));
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let counted = false;
  const timer = window.setTimeout(() => {
    counted = true;
    setSlow(1);
  }, SLOW_MS);
  try {
    return await send<T>(method, path, body);
  } finally {
    window.clearTimeout(timer);
    if (counted) setSlow(-1);
  }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        // Custom header = CSRF defence: cross-site pages cannot send it.
        'X-Requested-With': 'MusclePro',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof data.error === 'string' ? data.error : 'generic', res.status);
  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
const put = <T>(path: string) => request<T>('PUT', path, {});
const del = <T>(path: string, body?: unknown) => request<T>('DELETE', path, body);

// Catalog responses never change during a session: cache them.
const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = load().catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

export const api = {
  // auth
  health: () => get<{ status: string; storage: string; persistent: boolean }>('/api/health'),
  me: () => get<{ user: User | null }>('/api/auth/me'),
  login: (email: string, password: string) => post<{ user: User }>('/api/auth/login', { email, password }),
  register: (data: Record<string, string>) => post<{ user: User }>('/api/auth/register', data),
  logout: () => post<{ ok: true }>('/api/auth/logout'),

  // profile
  updateProfile: (data: Partial<User>) => patch<{ user: User }>('/api/me', data),
  changePassword: (current: string, next: string) => post<{ ok: true }>('/api/me/password', { current, new: next }),
  logoutAll: () => post<{ ok: true }>('/api/me/logout-all'),
  deleteAccount: (password: string) => del<{ ok: true }>('/api/me', { password }),

  favorites: () => get<{ favorites: string[] }>('/api/me/favorites'),
  addFavorite: (id: string) => put<{ ok: true }>(`/api/me/favorites/${encodeURIComponent(id)}`),
  removeFavorite: (id: string) => del<{ ok: true }>(`/api/me/favorites/${encodeURIComponent(id)}`),

  enrollments: () => get<{ enrollments: Record<string, Enrollment> }>('/api/me/programs'),
  enroll: (id: string) => post<{ enrollment: Enrollment }>(`/api/me/programs/${encodeURIComponent(id)}`),
  unenroll: (id: string) => del<{ ok: true }>(`/api/me/programs/${encodeURIComponent(id)}`),

  // catalog
  exercises: () =>
    cached('exercises', async () => (await get<{ exercises: Exercise[] }>('/api/exercises')).exercises),
  exercise: (id: string) =>
    cached(`exercise:${id}`, () =>
      get<{ exercise: Exercise; related: Exercise[]; programs: Pick<Program, 'id' | 'name' | 'level'>[] }>(
        `/api/exercises/${encodeURIComponent(id)}`,
      ),
    ),
  programs: () => cached('programs', async () => (await get<{ programs: ProgramSummary[] }>('/api/programs')).programs),
  program: (id: string) =>
    cached(`program:${id}`, async () => (await get<{ program: Program }>(`/api/programs/${encodeURIComponent(id)}`)).program),
  generate: (params: Record<string, unknown>) => post<GeneratedWorkout>('/api/generate', params),

  // workouts
  saveWorkout: (data: unknown) => post<{ workout: Workout }>('/api/workouts', data),
  workouts: (limit = 30) => get<{ workouts: Workout[]; total: number }>(`/api/workouts?limit=${limit}`),
  deleteWorkout: (id: string) => del<{ ok: true }>(`/api/workouts/${encodeURIComponent(id)}`),
  stats: () => get<Stats>('/api/workouts/stats'),
  suggest: (data: { unit: Unit; program_id?: string; week?: number; items: { id: string; sets: number; reps: string | null; pct?: Percent }[] }) =>
    post<{ suggestions: Record<string, Suggestion | null> }>('/api/workouts/suggest', data),

  // admin
  adminUsers: (q = '') => get<{ users: User[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`),
  adminStats: () =>
    get<{ users: number; active: number; admins: number; workouts: number; storage: string }>('/api/admin/stats'),
  adminUpdate: (id: string, data: Partial<Pick<User, 'role' | 'active'>>) =>
    patch<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`, data),
  adminDelete: (id: string) => del<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}`),
};
