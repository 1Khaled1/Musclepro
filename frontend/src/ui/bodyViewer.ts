/** Muscle-map viewer with two modes:
 *   2D — professional écorché illustration with blended muscle highlights
 *        (front/back, male/female, artwork per theme), instant.
 *   3D — real anatomical model (BodyParts3D + Z-Anatomy) loaded on demand,
 *        orbit to inspect, tap a muscle to select its group.
 *  Both share one API: select, highlight levels, front/back, dispose. */
import { t } from '../i18n';
import { getTheme, onThemeChange, store } from '../store';
import type { BodyType, Muscle } from '../types';
import type { AuraBackdrop } from '../three/AuraBackdrop';
import type { Anatomy3D } from '../three/Anatomy3D';
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
  /** 'single': one large figure (+ 2D/3D modes); 'dual': front & back side by side. */
  layout?: 'single' | 'dual';
  interactive?: boolean;
  view?: View;
  onSelect?: (m: Muscle) => void;
}

type Mode = '2d' | '3d';

/** Where each muscle is best seen, used to flip automatically. */
const BEST_VIEW: Record<Muscle, View> = {
  chest: 'front', shoulders: 'front', biceps: 'front', forearms: 'front', abs: 'front',
  obliques: 'front', quads: 'front', traps: 'back', lats: 'back', lower_back: 'back',
  triceps: 'back', glutes: 'back', hamstrings: 'back', calves: 'back',
};
export const bestView = (m: Muscle): View => BEST_VIEW[m];

const MODE_KEY = 'mp-body-mode';
const MODEL_URL = '/models/musclepro-anatomy.glb';
let preferredBody: BodyType | null = null;

function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

export async function mountBody(host: HTMLElement, opts: BodyViewerOptions = {}): Promise<BodyViewer> {
  const layout = opts.layout ?? 'single';
  const interactive = opts.interactive ?? layout === 'single';
  let body: BodyType = preferredBody ?? store.user?.body ?? 'male';
  let view: View = opts.view ?? 'front';
  let mode: Mode = layout === 'single' ? savedMode() : '2d';
  let selected: Muscle | null = null;
  let levels: Partial<Record<Muscle, number>> = {};
  let aura: AuraBackdrop | null = null;
  let auraEl: HTMLDivElement | null = null;
  let auraLoading = false;
  let scene3d: Anatomy3D | null = null;
  let host3d: HTMLDivElement | null = null;
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
      ${layout === 'single' ? seg('mode', [['2d', '2D'], ['3d', '3D']], mode, t('body.mode')) : ''}
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

    if (mode === '3d') {
      const note = body === 'female' ? `<span class="body-note">${esc(t('body.maleModel'))}</span>` : '';
      host.innerHTML = `${toolbar}
        <div class="body-map single is-3d">
          <div class="body-loading" role="status"><span class="spinner" aria-hidden="true"></span><span data-progress>${esc(t('body.loading3d'))}</span></div>
          ${note}
          <span class="body-hint">${iconHtml('rotate', 'icon-sm')}${esc(t('body.hint3d'))}</span>
        </div>
        <p class="body-credit">${esc(t('body.credit3d'))} <a class="link" href="/models/ATTRIBUTION.txt" target="_blank" rel="noopener">CC BY-SA</a></p>`;
      void attach3d();
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
    scene3d?.setSelected(selected);
    scene3d?.setLevels(levels);
    updateAuraFocus();
  };

  // ---- 3D ----------------------------------------------------------------
  const attach3d = async () => {
    const map = host.querySelector<HTMLElement>('.body-map.is-3d');
    if (!map || disposed) return;
    if (!host3d) {
      host3d = document.createElement('div');
      host3d.className = 'body-3d';
    }
    map.prepend(host3d);
    if (scene3d) {
      map.querySelector('.body-loading')?.remove();
      scene3d.setView(view);
      return;
    }
    try {
      const mod = await import('../three/Anatomy3D');
      if (disposed || !mod.webglAvailable()) throw new Error('no-webgl');
      scene3d = new mod.Anatomy3D(host3d, {
        theme: theme(),
        labelFor: label,
        onSelect: (m) => {
          selected = m;
          opts.onSelect?.(m);
        },
        onProgress: (r) => {
          const p = host.querySelector('[data-progress]');
          if (p) p.textContent = `${t('body.loading3d')} ${Math.round(r * 100)}%`;
        },
      });
      await scene3d.load(MODEL_URL);
      if (disposed) return;
      scene3d.setSelected(selected);
      scene3d.setLevels(levels);
      scene3d.setView(view);
      host.querySelector('.body-loading')?.remove();
    } catch {
      const l = host.querySelector<HTMLElement>('.body-loading');
      if (l) l.innerHTML = `${iconHtml('alert')}<span>${esc(t('body.error3d'))}</span>`;
    }
  };

  // ---- GLSL light field (2D single layout) -------------------------------
  const attachAura = async () => {
    const map = host.querySelector<HTMLElement>('.body-map.single:not(.is-3d)');
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

  // ---- interaction (2D) --------------------------------------------------
  const tip = () => host.querySelector<HTMLElement>('.body-map:not(.is-3d) .body-tip');

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
    if (mode === '3d' && layout === 'single') {
      scene3d?.setView(view);
      host.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.view === view)),
      );
      return;
    }
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

  const setMode = (next: Mode) => {
    if (next === mode) return;
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
    render();
  };

  const choose = (m: Muscle) => {
    selected = m;
    applyState();
    opts.onSelect?.(m);
  };

  const onClick = (e: Event) => {
    const target = e.target as Element;
    const btn = target.closest<HTMLButtonElement>('button[data-view], button[data-body], button[data-flip], button[data-mode]');
    if (btn) {
      if (btn.dataset.view) flip(btn.dataset.view as View);
      else if (btn.dataset.mode) setMode(btn.dataset.mode as Mode);
      else if (btn.dataset.body) {
        body = btn.dataset.body as BodyType;
        preferredBody = body;
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
    scene3d?.setTheme(th);
    if (mode === '2d' || layout === 'dual') render(); // the artwork has a version per theme
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
      scene3d?.dispose();
      scene3d = null;
    },
  };
}
