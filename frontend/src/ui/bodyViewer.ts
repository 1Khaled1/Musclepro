/** Glass-framed 3D body viewer with Front/Back + Male/Female controls.
 *  Three.js is loaded lazily, so pages without the body stay light. */
import { t } from '../i18n';
import { getTheme, onThemeChange, store } from '../store';
import type { BodyType, Muscle } from '../types';
import type { BodyScene } from '../three/BodyScene';
import { esc } from './dom';
import { iconHtml } from './icons';

export interface BodyViewer {
  setSelected(m: Muscle | null): void;
  setLevels(levels: Partial<Record<Muscle, number>>): void;
  setView(v: 'front' | 'back'): void;
  dispose(): void;
}

export interface BodyViewerOptions {
  interactive?: boolean;
  autoRotate?: boolean;
  compact?: boolean;
  toolbar?: boolean;
  hint?: boolean;
  view?: 'front' | 'back';
  onSelect?: (m: Muscle) => void;
}

let preferredBody: BodyType | null = null;

export async function mountBody(host: HTMLElement, opts: BodyViewerOptions = {}): Promise<BodyViewer> {
  let body: BodyType = preferredBody ?? store.user?.body ?? 'male';
  let view: 'front' | 'back' = opts.view ?? 'front';
  const seg = (attr: string, items: [string, string][], current: string, label: string) =>
    `<div class="segmented" role="group" aria-label="${esc(label)}">${items
      .map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === current}">${esc(l)}</button>`)
      .join('')}</div>`;

  host.innerHTML = `
    ${opts.toolbar === false ? '' : `<div class="body-toolbar">
      ${seg('view', [['front', t('body.front')], ['back', t('body.back')]], view, t('body.view'))}
      ${seg('body', [['male', t('body.male')], ['female', t('body.female')]], body, t('body.model'))}
    </div>`}
    <div class="body-canvas${opts.compact ? ' compact' : ''}">
      ${opts.hint === false ? '' : `<span class="body-hint">${iconHtml('rotate', 'icon-sm')}${esc(t('body.hint'))}</span>`}
    </div>`;
  const canvasHost = host.querySelector<HTMLElement>('.body-canvas')!;

  let scene: BodyScene | null = null;
  let pending: { selected?: Muscle | null; levels?: Partial<Record<Muscle, number>> } = {};
  let disposed = false;

  const sync = (attr: string, value: string) =>
    host.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    });

  const onClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-view], button[data-body]');
    if (!btn) return;
    if (btn.dataset.view) {
      view = btn.dataset.view as 'front' | 'back';
      scene?.setView(view);
      sync('view', view);
    } else if (btn.dataset.body) {
      body = btn.dataset.body as BodyType;
      preferredBody = body;
      scene?.setBody(body);
      sync('body', body);
    }
  };
  host.addEventListener('click', onClick);
  const offTheme = onThemeChange((th) => scene?.setTheme(th));

  try {
    const mod = await import('../three/BodyScene');
    if (!mod.webglAvailable()) throw new Error('no-webgl');
    if (!disposed) {
      scene = new mod.BodyScene(canvasHost, {
        theme: getTheme(),
        body,
        interactive: opts.interactive !== false,
        autoRotate: opts.autoRotate,
        labelFor: (m) => t(`muscle.${m}`),
        onSelect: (m) => m && opts.onSelect?.(m),
      });
      if (view === 'back') scene.setView('back');
      if (pending.selected !== undefined) scene.setSelected(pending.selected);
      if (pending.levels) scene.setLevels(pending.levels);
    }
  } catch {
    canvasHost.innerHTML = `<div class="body-fallback">${iconHtml('body', 'icon-lg')}<p>${esc(t('body.noWebgl'))}</p></div>`;
  }

  return {
    setSelected(m) {
      if (scene) scene.setSelected(m);
      else pending.selected = m;
    },
    setLevels(levels) {
      if (scene) scene.setLevels(levels);
      else pending.levels = levels;
    },
    setView(v) {
      view = v;
      scene?.setView(v);
      sync('view', v);
    },
    dispose() {
      disposed = true;
      host.removeEventListener('click', onClick);
      offTheme();
      scene?.dispose();
      scene = null;
      pending = {};
    },
  };
}
