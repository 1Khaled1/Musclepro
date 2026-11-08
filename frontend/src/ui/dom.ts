/** Tiny DOM helpers. Every interpolated value goes through `esc` — the views
 *  build HTML with template strings, so escaping is the XSS boundary. */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Tagged template that escapes every interpolation except values wrapped
 *  with `raw()` (trusted markup we built ourselves, e.g. icons). */
export class Raw {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}
export const raw = (value: string): Raw => new Raw(value);

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return out;
}

function render(v: unknown): string {
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}

export function qsa<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Glass card markup (five-layer stack). `content` must already be safe HTML. */
export function glass(content: string, opts: { cls?: string; interactive?: boolean; accent?: boolean; beam?: boolean; delay?: number; tag?: string; attrs?: string } = {}): string {
  const stageCls = ['sg-stage', opts.interactive ? 'is-interactive' : '', opts.cls ?? ''].join(' ').trim();
  const tag = opts.tag ?? 'section';
  return `<${tag} class="${stageCls}" style="--sg-delay:${opts.delay ?? 0}ms" ${opts.attrs ?? ''}>
    <div class="sg-card"${opts.accent ? ' data-sg-accent' : ''}>
      ${opts.beam ? beam() : ''}
      <div class="sg-spotlight" aria-hidden="true"></div>
      <div class="card-content">${content}</div>
    </div>
  </${tag}>`;
}

function beam(): string {
  // Geometry (viewBox, width, height, rx) is synced to the card by
  // effects.ts, because pathLength="100" needs real pixel dimensions.
  const rect = (cls: string) => `<rect class="${cls}" pathLength="100"/>`;
  return `<svg class="sg-beam" aria-hidden="true" data-beam-radius="24">
    <defs><linearGradient id="beam-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff6a2b"/><stop offset="1" stop-color="#ffb347"/>
    </linearGradient></defs>
    ${rect('beam-track')}${rect('beam-shadow')}${rect('beam-aura')}${rect('beam-core')}${rect('beam-core beam-2')}
  </svg>`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: number | undefined;
  return (...args: A) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}
