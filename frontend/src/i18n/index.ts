import { en, type MessageKey } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export type Localized = { en: string; fr: string };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, fr };
const listeners = new Set<(lang: Lang) => void>();

function initialLang(): Lang {
  const attr = document.documentElement.getAttribute('lang');
  return attr === 'fr' ? 'fr' : 'en';
}

let current: Lang = initialLang();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  document.documentElement.setAttribute('lang', lang);
  try {
    localStorage.setItem('mp-lang', lang);
  } catch {
    /* storage unavailable — the choice lasts for this visit */
  }
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let msg: string = dictionaries[current][key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) msg = msg.split(`{${k}}`).join(String(v));
  }
  return msg;
}

/** Translate a dynamic key (API error codes, enum values). */
export function tk(prefix: string, value: string, fallback?: MessageKey): string {
  const key = `${prefix}.${value}` as MessageKey;
  if (key in en) return t(key);
  return fallback ? t(fallback) : value;
}

/** Pick the current language from bilingual catalog data. */
export function loc(value: Localized | undefined | null): string {
  if (!value) return '';
  return value[current] || value.en;
}

export function locList(value: { en: string[]; fr: string[] } | undefined): string[] {
  if (!value) return [];
  return value[current]?.length ? value[current] : value.en;
}

export function formatDate(iso: string | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(current === 'fr' ? 'fr-FR' : 'en-GB', opts).format(d);
}

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat(current === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: digits,
  }).format(n);
}

export type { MessageKey };

/** Prescriptions like "10/side" or "8/leg" are stored in English. */
export function fmtReps(reps: string): string {
  if (current !== 'fr') return reps;
  return reps.replace('/side', '/côté').replace('/leg', '/jambe');
}
