/** Animated demonstration player: plays one exercise from `demos.ts` on a
 *  canvas, with play / pause, slow motion and a camera the user can turn.
 *  Loaded on demand (the pages import it dynamically). */
import { t } from '../i18n';
import { getBody, getTheme, onBodyChange, onThemeChange } from '../store';
import { prefersReducedMotion } from '../ui/dom';
import { iconHtml } from '../ui/icons';
import { DEMOS, type Demo } from './demos';
import { boundsOf, draw, frameCamera, makePalette, type Bounds, type Levels, type Palette } from './render';
import { solve } from './rig';
import { clamp, ease } from './vec';

export interface DemoPlayer {
  dispose(): void;
}

export interface DemoOptions {
  /** Exercise id. */
  id: string;
  /** Exercise name, for the accessible description. */
  name: string;
  /** Muscle highlight: 1 = primary, lower = secondary. */
  levels: Levels;
}

export const hasDemo = (id: string): boolean => Object.prototype.hasOwnProperty.call(DEMOS, id);

interface Moment {
  /** Phase handed to the demo's pose function. */
  k: number;
  /** 0–1: how settled the athlete is in a held position (drives the breathing). */
  held: number;
  /** Opacity (below 1 only around the cut of a loop that does not close). */
  alpha: number;
}

interface Timeline {
  length: number;
  at(time: number): Moment;
  /** A representative instant, shown when motion is reduced. */
  still: number;
}

const FADE = 0.24;

function timeline(demo: Demo): Timeline {
  if (demo.mode === 'cycle') {
    const length = demo.period ?? 3;
    return {
      length,
      still: length * 0.3,
      at: (time) => ({ k: time / length, held: 0, alpha: demo.cut ? clamp(Math.min(time, length - time) / FADE) : 1 }),
    };
  }
  // [move to the end of the range, pause there, come back, pause at the start]
  const [go, stay, back, rest] = demo.mode === 'ecc' ? [1.3, 0.25, 0.9, 0.45] : demo.mode === 'con' ? [0.9, 0.3, 1.4, 0.4] : [1.2, 3.4, 1.0, 0.6];
  return {
    length: go + stay + back + rest,
    still: go + stay / 2,
    at: (time) => {
      if (time < go) return { k: ease(time / go), held: 0, alpha: 1 };
      if (time < go + stay) return { k: 1, held: demo.mode === 'hold' ? clamp(Math.min(time - go, go + stay - time) / 0.5) : 0, alpha: 1 };
      if (time < go + stay + back) return { k: 1 - ease((time - go - stay) / back), held: 0, alpha: 1 };
      return { k: 0, held: 0, alpha: 1 };
    },
  };
}

const cssRGB = (name: string, fallback: [number, number, number]): [number, number, number] => {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/[\s,]+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2]] : fallback;
};

const currentPalette = (): Palette => makePalette(getTheme(), cssRGB('--accent-rgb', [255, 106, 43]), cssRGB('--holo-rgb', [90, 215, 255]));

type Preset = 'best' | 'front' | 'side' | 'back';

export function mountDemo(host: HTMLElement, o: DemoOptions): DemoPlayer | null {
  const demo = DEMOS[o.id];
  if (!demo) return null;

  const clockLine = timeline(demo);
  const side = demo.view > 0 ? 1 : -1; // keep the presets on the side the demo was framed from
  const presets: Record<Preset, number> = { best: demo.view, front: 12 * side, side: 78 * side, back: 142 * side };

  // ---- world bounds of the whole movement: the camera never has to move
  const samples = Array.from({ length: 33 }, (_, i) => demo.pose(demo.mode === 'cycle' ? i / 33 : i / 32));
  const bounds: Bounds = boundsOf(samples.map(solve), samples.map((p) => p.props ?? []));

  host.innerHTML = `
    <div class="demo">
      <div class="demo-stage">
        <canvas class="demo-canvas" role="img"></canvas>
        <span class="demo-hint" aria-hidden="true">${iconHtml('rotate', 'icon-sm')} <span></span></span>
      </div>
      <div class="demo-bar">
        <div class="row demo-transport">
          <button class="btn btn-sm btn-icon" type="button" data-demo="toggle"></button>
          <button class="btn btn-sm" type="button" data-demo="slow" aria-pressed="false"><span class="demo-speed" aria-hidden="true">0.5×</span> <span></span></button>
        </div>
        <div class="segmented demo-views" role="group">
          ${(['best', 'front', 'side', 'back'] as Preset[]).map((p) => `<button type="button" data-view="${p}" aria-pressed="${p === 'best'}"></button>`).join('')}
        </div>
      </div>
    </div>`;

  const stage = host.querySelector<HTMLElement>('.demo-stage')!;
  const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
  const hint = host.querySelector<HTMLElement>('.demo-hint')!;
  const toggle = host.querySelector<HTMLButtonElement>('[data-demo="toggle"]')!;
  const slow = host.querySelector<HTMLButtonElement>('[data-demo="slow"]')!;
  const viewButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-view]'));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    host.innerHTML = '';
    return null;
  }

  // Text goes in through textContent: names come from the catalogue, never as markup.
  canvas.setAttribute('aria-label', t('demo.aria', { name: o.name }));
  hint.querySelector('span')!.textContent = t('demo.hint');
  slow.querySelector('span:last-child')!.textContent = t('demo.slow');
  host.querySelector('.demo-views')!.setAttribute('aria-label', t('demo.view'));
  viewButtons.forEach((b) => (b.textContent = t(`demo.view.${b.dataset.view as Preset}`)));

  let palette = currentPalette();
  let build = getBody();
  let width = 0;
  let height = 0;
  let time = 0;
  let speed = 1;
  let playing = !prefersReducedMotion();
  let visible = true;
  let yaw = demo.view;
  let yawTarget = demo.view;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let density = 2.5; // upper bound on the device pixel ratio; lowered if frames are slow to draw
  let cost = 0;
  if (!playing) time = clockLine.still;

  const paintToggle = (): void => {
    toggle.innerHTML = iconHtml(playing ? 'pause' : 'play', 'icon-sm');
    toggle.setAttribute('aria-label', t(playing ? 'demo.pause' : 'demo.play'));
  };
  paintToggle();

  const paint = (): void => {
    if (!width || !height) return;
    const m = clockLine.at(time % clockLine.length);
    const pose = demo.pose(m.k);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    canvas.style.opacity = String(m.alpha);
    draw(ctx, solve(pose), pose, bounds, frameCamera(bounds, width, height, yaw), palette, { levels: o.levels, build, breath: m.held * Math.sin((time * 2 * Math.PI) / 3.6) });
  };

  const running = (): boolean => playing && visible && !document.hidden;

  const tick = (now: number): void => {
    frame = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (running()) time += dt * speed;
    const gap = yawTarget - yaw;
    yaw = Math.abs(gap) < 0.05 ? yawTarget : yaw + gap * (1 - Math.exp(-dt * 12));
    const before = performance.now();
    paint();
    cost = cost * 0.9 + (performance.now() - before) * 0.1;
    if (cost > 22 && density > 1) {
      density = Math.max(1, density - 0.75);
      cost = 0;
      fit();
    }
    if (running() || yaw !== yawTarget) request();
    else last = 0;
  };
  const request = (): void => {
    if (!frame && !disposed) frame = requestAnimationFrame(tick);
  };

  const fit = (): void => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, density);
    width = w;
    height = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  };

  const ac = new AbortController();
  const on = { signal: ac.signal };

  toggle.addEventListener(
    'click',
    () => {
      playing = !playing;
      paintToggle();
      request();
    },
    on,
  );
  slow.addEventListener(
    'click',
    () => {
      speed = speed === 1 ? 0.5 : 1;
      slow.setAttribute('aria-pressed', String(speed !== 1));
    },
    on,
  );
  const press = (which: Preset | null): void => viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === which)));
  viewButtons.forEach((b) =>
    b.addEventListener(
      'click',
      () => {
        const which = b.dataset.view as Preset;
        // Turn the short way round.
        const target = presets[which];
        yawTarget = yaw + ((((target - yaw) % 360) + 540) % 360) - 180;
        press(which);
        request();
      },
      on,
    ),
  );

  // ---- drag to turn the athlete (vertical swipes still scroll the page)
  let dragX: number | null = null;
  let dragYaw = 0;
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      dragX = e.clientX;
      dragYaw = yaw;
      canvas.setPointerCapture(e.pointerId);
    },
    on,
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (dragX === null) return;
      const dx = e.clientX - dragX;
      if (Math.abs(dx) < 3) return;
      yaw = yawTarget = dragYaw + dx * 0.6;
      press(null);
      hint.classList.add('is-used');
      request();
    },
    on,
  );
  const drop = (): void => {
    dragX = null;
  };
  canvas.addEventListener('pointerup', drop, on);
  canvas.addEventListener('pointercancel', drop, on);

  const resize = new ResizeObserver(fit);
  resize.observe(stage);
  const watch = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) request();
  });
  watch.observe(stage);
  document.addEventListener('visibilitychange', request, on);
  const offTheme = onThemeChange(() => {
    palette = currentPalette();
    request();
  });
  // The athlete follows the body model chosen on the muscle map or in the profile.
  const offBody = onBodyChange((b) => {
    build = b;
    request();
  });

  fit();
  request();

  return {
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      ac.abort();
      resize.disconnect();
      watch.disconnect();
      offTheme();
      offBody();
      host.innerHTML = '';
    },
  };
}
