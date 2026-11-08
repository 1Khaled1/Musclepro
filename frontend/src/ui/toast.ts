import { ApiError } from '../api';
import { t, tk } from '../i18n';
import { esc } from './dom';
import { iconHtml } from './icons';

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (!region) {
    region = document.createElement('div');
    region.className = 'toasts';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  return region;
}

export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'ok'): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${iconHtml(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info')}<span>${esc(message)}</span>`;
  ensureRegion().append(el);
  window.setTimeout(() => el.remove(), kind === 'error' ? 5200 : 3200);
}

const INVALID = new Set([
  'bad_request', 'entries_invalid', 'set_invalid', 'unit_invalid', 'title_invalid', 'notes_invalid',
  'duration_invalid', 'program_invalid', 'level_invalid', 'goal_invalid', 'muscles_invalid',
  'equipment_invalid', 'minutes_invalid', 'role_invalid', 'lang_invalid', 'body_invalid',
]);

/** Translate an API error code into a user-facing message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (INVALID.has(err.code)) return t('err.invalid_data');
    return tk('err', err.code, 'err.generic');
  }
  return t('err.generic');
}

export function toastError(err: unknown): void {
  toast(errorMessage(err), 'error');
}
