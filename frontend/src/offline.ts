/** Offline outbox: workouts finished without a connection are queued in
 *  localStorage (per user) and sent when the device is back online. */
import { api, ApiError } from './api';
import { store } from './store';

const KEY = 'mp-outbox';

interface Pending {
  uid: string;
  payload: Record<string, unknown>;
  queuedAt: number;
}

const listeners = new Set<() => void>();
let chain: Promise<unknown> = Promise.resolve();

function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Pending[];
  } catch {
    return [];
  }
}

function write(items: Pending[]): void {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: nothing more we can do offline */
  }
  listeners.forEach((fn) => fn());
}

export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pendingCount(): number {
  const uid = store.user?.id;
  return uid ? read().filter((p) => p.uid === uid).length : 0;
}

/** Queue a workout payload for the signed-in user. */
export function queueWorkout(payload: Record<string, unknown>): void {
  const uid = store.user?.id;
  if (!uid) return;
  write([...read(), { uid, payload, queuedAt: Date.now() }]);
}

interface FlushResult {
  saved: number;
  dropped: number;
}

/** Send queued workouts of the current user. Runs one flush at a time, in
 *  this tab (chained) and across tabs (Web Locks), so a later flush sees the
 *  queue the earlier one left. The server also ignores replays (client_id). */
export function flushOutbox(): Promise<FlushResult> {
  const locked = async (): Promise<FlushResult> =>
    navigator.locks ? await navigator.locks.request('mp-outbox', send) : send();
  const next = chain.then(locked, locked);
  chain = next.catch(() => undefined);
  return next;
}

async function send(): Promise<FlushResult> {
  const uid = store.user?.id;
  let saved = 0;
  let dropped = 0;
  if (!uid || !navigator.onLine) return { saved, dropped };
  for (const item of read().filter((p) => p.uid === uid)) {
    try {
      await api.saveWorkout(item.payload);
      saved++;
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'network' || err.status === 401 || err.status >= 500)) {
        break; // try again later (offline, signed out, or server trouble)
      }
      dropped++; // the server rejected the data itself: retrying won't help
    }
    write(read().filter((p) => !(p.uid === item.uid && p.queuedAt === item.queuedAt)));
  }
  return { saved, dropped };
}
