/** Professional 2D muscle map.
 *
 *  Artwork: detailed écorché illustrations (male/female × front/back ×
 *  dark/light) with muscle masks traced over them, from js-rich-body-highlighter
 *  (MIT, see public/anatomy/LICENSE.txt). The masks share the artwork's
 *  coordinate space, so a highlighted group lands exactly on its muscles; the
 *  colour is blended into the illustration so the shading stays visible.
 */
import type { BodyType, Muscle } from '../types';
import masks from '../data/muscle-masks.json';

export type View = 'front' | 'back';
export type ArtTheme = 'dark' | 'light';

interface Mask {
  id: string;
  group: string;
  gender: BodyType;
  view: View;
  offset: { x: number; y: number };
  d: string;
}

const PX2MM = 25.4 / 96;
const W = 1365 * PX2MM;
const H = 2048 * PX2MM;

/** The artwork's group names → MusclePro's muscle ids. */
const GROUP: Record<string, Muscle> = {
  chest: 'chest', shoulders: 'shoulders', biceps: 'biceps', triceps: 'triceps', forearms: 'forearms',
  abs: 'abs', obliques: 'obliques', upper_back: 'traps', lats: 'lats', lower_back: 'lower_back',
  glutes: 'glutes', quads: 'quads', hamstrings: 'hamstrings', calves: 'calves',
};

// Frames in artwork pixels: the body without the empty side margins.
const FRAMES = {
  full: { x: 150, y: 20, w: 1065, h: 2010 },
  thumb: { x: 190, y: 30, w: 985, h: 1990 },
} as const;

export const artSrc = (gender: BodyType, view: View, theme: ArtTheme) =>
  `/anatomy/${gender}-${view}-${theme}.webp`;

export interface AnatomyOptions {
  label?: (m: Muscle) => string;
  interactive?: boolean;
  theme: ArtTheme;
  frame?: keyof typeof FRAMES;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Render one view as an <svg> string. Muscle groups are <g data-muscle>. */
export function renderAnatomy(view: View, body: BodyType, opts: AnatomyOptions): string {
  const f = FRAMES[opts.frame ?? 'full'];
  const vb = [f.x, f.y, f.w, f.h].map((v) => (v * PX2MM).toFixed(2)).join(' ');
  const list = (masks as Record<View, Mask[]>)[view].filter((m) => m.gender === body);
  const groups = new Map<Muscle, string[]>();
  for (const m of list) {
    const muscle = GROUP[m.group];
    if (!muscle) continue;
    const t = `translate(${(m.offset.x * PX2MM).toFixed(3)} ${(m.offset.y * PX2MM).toFixed(3)})`;
    const paths = groups.get(muscle) ?? [];
    paths.push(`<path d="${m.d}" transform="${t}"/>`);
    groups.set(muscle, paths);
  }
  const masksSvg = [...groups.entries()]
    .map(([m, paths]) => {
      const label = esc(opts.label ? opts.label(m) : m);
      const a11y = opts.interactive ? ` role="button" tabindex="0" aria-label="${label}" aria-pressed="false"` : '';
      return `<g class="mg" data-muscle="${m}"${a11y}>${paths.join('')}</g>`;
    })
    .join('');

  return `<svg class="anatomy" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" data-view="${view}" role="group">
    <image class="anatomy-art" href="${artSrc(body, view, opts.theme)}" x="0" y="0" width="${W.toFixed(2)}" height="${H.toFixed(2)}"/>
    <g class="anatomy-masks">${masksSvg}</g>
  </svg>`;
}
