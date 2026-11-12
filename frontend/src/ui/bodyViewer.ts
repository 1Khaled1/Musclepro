/** Muscle-map viewer: professional écorché illustration with blended muscle
 *  highlights (front/back, male/female, artwork per theme) over a GLSL light
 *  field. API: select, highlight levels, front/back, dispose. */
import { t } from '../i18n';
import { getBody, getTheme, onThemeChange, setBody } from '../store';
import type { BodyType, Muscle } from '../types';
import type { AuraBackdrop } from '../three/AuraBackdrop';
import { renderAnatomy, type View } from './anatomy';
import { esc, prefersReducedMotion } from './dom';
import { iconHtml } from './icons';

export interface BodyViewer {
  setSelected(m: Muscle | null): void;
  setLevels(levels: Partial<Record<Muscle, number>>): void;
  setView(v: View): void;
  dispose(): void;
}

export interface BodyViewerOptions {
  /** 'single': one large figure with a flip thumbnail; 'dual': front & back side by side. */
  layout?: 'single' | 'dual';
  interactive?: boolean;
  view?: View;
  onSelect?: (m: Muscle) => void;
}

/** Where each muscle is best seen, used to flip automatically. */
const BEST_VIEW: Record<Muscle, View> = {
  chest: 'front', shoulders: 'front', biceps: 'front', forearms: 'front', abs: 'front',
  obliques: 'front', quads: 'front', traps: 'back', lats: 'back', lower_back: 'back',
  triceps: 'back', glutes: 'back', hamstrings: 'back', calves: 'back',
};
export const bestView = (m: Muscle): View => BEST_VIEW[m];

// The 3D viewer was retired; forget its saved preference.
try {
  localStorage.removeItem('mp-body-mode');
} catch {
  /* storage unavailable */
}

export async function mountBody(host: HTMLElement, opts: BodyViewerOptions = {}): Promise<BodyViewer> {
  const layout = opts.layout ?? 'single';
  const interactive = opts.interactive ?? layout === 'single';
  let body: BodyType = getBody();
  let view: View = opts.view ?? 'front';
  let selected: Muscle | null = null;
  let levels: Partial<Record<Muscle, number>> = {};
  let aura: AuraBackdrop | null = null;
  let auraEl: HTMLDivElement | null = null;
  let auraLoading = false;
  let disposed = false;
  const label = (m: Muscle) => t(`muscle.${m}`);
  const theme = () => getTheme();

  const seg = (attr: string, items: [string, string][], current: string, aria: string) =>
    `<div class="segmented" role="group" aria-label="${esc(aria)}">${items
      .map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === current}">${esc(l)}</button>`)
      .join('')}</div>`;

  const figure = (v: View, isInteractive: boolean, frame: 'full' | 'thumb' = 'full') =>
    renderAnatomy(v, body, { label, interactive: isInteractive, theme: theme(), frame });

  // ---- render ------------------------------------------------------------
  const render = () => {
    const toolbar = `<div class="body-toolbar">
      ${layout === 'single' ? seg('view', [['front', t('body.front')], ['back', t('body.back')]], view, t('body.view')) : '<span></span>'}
      ${seg('body', [['male', t('body.male')], ['female', t('body.female')]], body, t('body.model'))}
    </div>`;

    if (layout === 'dual') {
      host.innerHTML = `${toolbar}
        <div class="body-map dual${interactive ? ' is-interactive' : ''}">
          <figure class="body-figure" data-view="front">${figure('front', interactive)}<figcaption>${esc(t('body.front'))}</figcaption></figure>
          <figure class="body-figure" data-view="back">${figure('back', interactive)}<figcaption>${esc(t('body.back'))}</figcaption></figure>
          <div class="body-tip" role="presentation"></div>
        </div>`;
      applyState();
      return;
    }

    const other: View = view === 'front' ? 'back' : 'front';
    host.innerHTML = `${toolbar}
      <div class="body-map single${interactive ? ' is-interactive' : ''}">
        <div class="body-figure" data-view="${view}">${figure(view, interactive)}</div>
        <button class="body-thumb" type="button" data-flip aria-label="${esc(t(other === 'back' ? 'body.showBack' : 'body.showFront'))}">
          ${figure(other, false, 'thumb')}<span>${esc(t(other === 'back' ? 'body.back' : 'body.front'))}</span>
        </button>
        ${interactive ? `<span class="body-hint">${iconHtml('target', 'icon-sm')}${esc(t('body.hint'))}</span>` : ''}
        <div class="body-tip" role="presentation"></div>
      </div>`;
    applyState();
    void attachAura();
  };

  const groups = () => host.querySelectorAll<SVGGElement>('.body-figure .mg, .body-thumb .mg');

  const applyState = () => {
    groups().forEach((g) => {
      const m = g.dataset.muscle as Muscle;
      const on = m === selected;
      g.classList.toggle('is-selected', on);
      if (g.hasAttribute('aria-pressed')) g.setAttribute('aria-pressed', String(on));
      const lvl = levels[m];
      if (lvl !== undefined && lvl > 0) {
        g.classList.add('has-level');
        g.style.setProperty('--lvl', String(Math.min(1, lvl)));
      } else {
        g.classList.remove('has-level');
        g.style.removeProperty('--lvl');
      }
    });
    updateAuraFocus();
  };

  // ---- GLSL light field (single layout) -----------------------------------
  const attachAura = async () => {
    const map = host.querySelector<HTMLElement>('.body-map.single');
    if (!map || disposed) return;
    if (!auraEl) {
      auraEl = document.createElement('div');
      auraEl.className = 'body-aura';
      auraEl.setAttribute('aria-hidden', 'true');
    }
    map.prepend(auraEl);
    if (aura || auraLoading) {
      updateAuraFocus();
      return;
    }
    auraLoading = true;
    try {
      const mod = await import('../three/AuraBackdrop');
      if (disposed || !mod.webglAvailable()) return;
      aura = new mod.AuraBackdrop(auraEl, theme());
      updateAuraFocus();
    } catch {
      /* the static CSS glow remains */
    }
  };

  const updateAuraFocus = () => {
    if (!aura || !auraEl) return;
    const g = selected ? host.querySelector<SVGGElement>(`.body-figure .mg[data-muscle="${selected}"]`) : null;
    if (!g) {
      aura.setFocus(null);
      return;
    }
    const r = g.getBoundingClientRect();
    const a = auraEl.getBoundingClientRect();
    if (!a.width || !a.height) return;
    aura.setFocus({ x: (r.left + r.width / 2 - a.left) / a.width, y: (r.top + r.height / 2 - a.top) / a.height });
  };

  // ---- interaction ---------------------------------------------------------
  const tip = () => host.querySelector<HTMLElement>('.body-map .body-tip');

  const showTip = (g: SVGGElement, x?: number, y?: number) => {
    const el = tip();
    const map = host.querySelector<HTMLElement>('.body-map');
    if (!el || !map) return;
    const m = map.getBoundingClientRect();
    let px = x;
    let py = y;
    if (px === undefined || py === undefined) {
      const r = g.getBoundingClientRect();
      px = r.left + r.width / 2;
      py = r.top;
    }
    el.textContent = label(g.dataset.muscle as Muscle);
    el.style.left = `${px - m.left}px`;
    el.style.top = `${py - m.top}px`;
    el.classList.add('is-visible');
  };
  const hideTip = () => tip()?.classList.remove('is-visible');

  const flip = (to: View) => {
    if (to === view) return;
    view = to;
    const fig = host.querySelector<HTMLElement>('.body-figure');
    if (!fig || prefersReducedMotion() || layout === 'dual') {
      render();
      return;
    }
    fig.classList.add('is-flipping');
    window.setTimeout(() => {
      if (disposed) return;
      render();
      const next = host.querySelector<HTMLElement>('.body-figure');
      next?.classList.add('is-flipped-in');
      window.setTimeout(() => next?.classList.remove('is-flipped-in'), 260);
    }, 170);
  };

  const choose = (m: Muscle) => {
    selected = m;
    applyState();
    opts.onSelect?.(m);
  };

  const onClick = (e: Event) => {
    const target = e.target as Element;
    const btn = target.closest<HTMLButtonElement>('button[data-view], button[data-body], button[data-flip]');
    if (btn) {
      if (btn.dataset.view) flip(btn.dataset.view as View);
      else if (btn.dataset.body) {
        body = btn.dataset.body as BodyType;
        setBody(body);
        render();
      } else flip(view === 'front' ? 'back' : 'front');
      return;
    }
    if (!interactive) return;
    const g = target.closest<SVGGElement>('.body-figure .mg');
    if (g) choose(g.dataset.muscle as Muscle);
  };
  const onKey = (e: KeyboardEvent) => {
    const g = (e.target as Element).closest?.<SVGGElement>('.body-figure .mg');
    if (!g || !interactive || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    choose(g.dataset.muscle as Muscle);
  };
  const onMove = (e: PointerEvent) => {
    const g = (e.target as Element).closest?.<SVGGElement>('.body-figure .mg');
    if (g && e.pointerType === 'mouse') showTip(g, e.clientX, e.clientY);
    else if (!g) hideTip();
  };
  const onFocus = (e: FocusEvent) => {
    const g = (e.target as Element).closest?.<SVGGElement>('.body-figure .mg');
    if (g) showTip(g);
  };

  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', hideTip);
  host.addEventListener('focusin', onFocus);
  host.addEventListener('focusout', hideTip);
  const offTheme = onThemeChange((th) => {
    aura?.setTheme(th);
    render(); // the artwork has a version per theme
  });
  const onResize = () => updateAuraFocus();
  window.addEventListener('resize', onResize);

  render();

  return {
    setSelected(m) {
      selected = m;
      if (m && layout === 'single' && bestView(m) !== view) flip(bestView(m));
      applyState();
    },
    setLevels(next) {
      levels = next;
      applyState();
    },
    setView(v) {
      if (layout === 'single') flip(v);
    },
    dispose() {
      disposed = true;
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', hideTip);
      host.removeEventListener('focusin', onFocus);
      host.removeEventListener('focusout', hideTip);
      window.removeEventListener('resize', onResize);
      offTheme();
      aura?.dispose();
      aura = null;
    },
  };
}
