/** MusclePro icon set — 24×24, 1.8 stroke, round caps. Drawn for this app. */
import { raw, type Raw } from './dom';

const P: Record<string, string> = {
  menu: '<path d="M4 7h16M4 12h11M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>',
  body: '<circle cx="12" cy="4.5" r="2"/><path d="M6 9.5c2 .8 4 1.2 6 1.2s4-.4 6-1.2"/><path d="M12 10.7V15"/><path d="m9 21 3-6 3 6"/>',
  dumbbell: '<path d="M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  library: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10.5h16"/><path d="m9.5 15 1.8 1.8 3.4-3.6"/>',
  spark: '<path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.6L12 17.5l-1.8-5.4L4.5 10.5 10.2 9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  activity: '<path d="M3.5 12.5h4l2.5-6 4 11 2.5-5h4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 4-5.3 7-5.3s5.8 1.7 7 5.3"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  logout: '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  login: '<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.6 12 20 12 20z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  rotate: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15"/><path d="M4.5 19.5V15H9"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M9.5 3.5h5M18.5 7l1.5-1.5"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.6 2.8-5.4 3.6-8.7 1.9 1.2 2.6 3 2.6 4.5 1-.6 1.8-1.8 2-3.3 2.3 1.9 3.8 4.4 3.8 7.5 0 3.3-2.4 5.8-6 5.8z"/>',
  trophy: '<path d="M8 4.5h8v5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5v1.5a3 3 0 0 0 3 3M16 6.5h3v1.5a3 3 0 0 1-3 3"/><path d="M12 13.5v3.5M8.5 20h7M10 17h4v3h-4z"/>',
  bolt: '<path d="M13.5 3 5.5 13.5h6L10.5 21l8-10.5h-6z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  bulb: '<path d="M9 17.5h6M10 20.5h4"/><path d="M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 7.5 7.5 6 7.5-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  repeat: '<path d="M4.5 10V9a3 3 0 0 1 3-3h11l-3-3M19.5 14v1a3 3 0 0 1-3 3h-11l3 3"/>',
  edit: '<path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z"/><path d="m13.5 7 3.5 3.5"/>',
  // equipment
  bodyweight: '<circle cx="12" cy="4.5" r="2"/><path d="M5 9h14M12 9v5.5M8.5 21l3.5-6.5 3.5 6.5"/>',
  barbell: '<path d="M2.5 12h19M5.5 8v8M8.5 6.5v11M15.5 6.5v11M18.5 8v8"/>',
  kettlebell: '<path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/><path d="M8 8.5h8a4.5 4.5 0 0 1 2 6.5l-.9 4.5H6.9L6 15a4.5 4.5 0 0 1 2-6.5z"/>',
  cable: '<path d="M6 3.5v17M18 3.5v17M6 5h12"/><circle cx="12" cy="8" r="1.5"/><path d="M12 9.5v6.5M9.5 16h5"/>',
  machine: '<rect x="4" y="3.5" width="5" height="17" rx="1.5"/><path d="M9 7h6.5a3 3 0 0 1 3 3v1.5M9 16.5h6M15 14v5"/><path d="M5.8 7h1.4M5.8 10h1.4M5.8 13h1.4"/>',
  band: '<path d="M4 8c3 0 3 8 8 8s5-8 8-8"/><path d="M4 8v8M20 8v8"/>',
};

export type IconName = keyof typeof P;

export function icon(name: string, cls = ''): Raw {
  const body = P[name] ?? P.info;
  return raw(
    `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`,
  );
}

export const iconHtml = (name: string, cls = ''): string => icon(name, cls).value;
