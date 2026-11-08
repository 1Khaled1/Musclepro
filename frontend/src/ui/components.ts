/** Reusable markup builders shared by several views. */
import { loc, t } from '../i18n';
import { navigate } from '../router';
import { store } from '../store';
import type { Exercise, Level, Program } from '../types';
import { glass, html, raw } from './dom';
import { icon } from './icons';

export function levelBadge(level: string): string {
  return html`<span class="badge ${level}">${t(`level.${level}` as 'level.beginner')}</span>`;
}

export function exerciseTile(ex: Exercise): string {
  const fav = store.favorites.has(ex.id);
  return html`
    <a class="panel tile" href="/exercises/${ex.id}">
      <span class="eq" title="${t(`equip.${ex.equipment}`)}">${icon(ex.equipment)}</span>
      <span>
        <h3>${loc(ex.name)}</h3>
        <span class="sub">${ex.primary.map((m) => t(`muscle.${m}`)).join(' · ')}</span>
        <span class="meta">${raw(levelBadge(ex.difficulty))}<span class="badge">${t(`equip.${ex.equipment}`)}</span></span>
      </span>
      ${store.user
        ? raw(html`<button class="fav-btn" type="button" data-fav="${ex.id}" aria-pressed="${String(fav)}"
            aria-label="${t(fav ? 'ex.removeFav' : 'ex.addFav')}">${icon('heart')}</button>`)
        : ''}
    </a>`;
}

const LEVEL_RANK: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3, pro: 4 };

export function levelBar(level: Level): string {
  const n = LEVEL_RANK[level];
  return `<span class="level-bar" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function programCard(p: Program, delay = 0): string {
  const mine = store.user && (store.user.level === p.level);
  return glass(
    html`
      <div class="row between">
        <span class="row">${raw(levelBadge(p.level))}<span class="badge holo">${t(`goal.${p.goal}`)}</span></span>
        ${raw(levelBar(p.level))}
      </div>
      <h2>${loc(p.name)}</h2>
      <p>${loc(p.summary)}</p>
      <div class="program-meta">
        <span>${icon('calendar', 'icon-sm')}${t('prog.days', { n: p.days_per_week })}</span>
        <span>${icon('layers', 'icon-sm')}${t('prog.weeks', { n: p.weeks })}</span>
        <span>${icon('clock', 'icon-sm')}${t('prog.minutes', { n: p.minutes })}</span>
      </div>
      <div class="actions row between">
        <a class="btn btn-primary btn-sm" href="/programs/${p.id}">${t('prog.view')} ${icon('arrow', 'icon-sm')}</a>
        ${mine ? raw(html`<span class="badge accent">${icon('target', 'icon-sm')}${t('prog.yourLevel')}</span>`) : ''}
      </div>
    `,
    { cls: 'program-card is-interactive', delay },
  );
}

/** Delegated favorite toggling for any container with .fav-btn buttons. */
export function bindFavorites(root: HTMLElement, onToast: (msg: string) => void, onError: (e: unknown) => void): void {
  root.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fav]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    try {
      const on = await store.toggleFavorite(btn.dataset.fav!);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', t(on ? 'ex.removeFav' : 'ex.addFav'));
      onToast(t(on ? 'ex.favAdded' : 'ex.favRemoved'));
    } catch (err) {
      onError(err);
    } finally {
      btn.disabled = false;
    }
  });
}

/** Redirect guests to /login, returning afterwards. */
export function requireUser(path: string): boolean {
  if (store.user) return true;
  navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  return false;
}

export function loadingBlock(lines = 3): string {
  return `<div class="stack" aria-busy="true">${Array.from({ length: lines }, () => '<div class="skeleton" style="height:120px"></div>').join('')}</div>`;
}

export function errorBlock(message: string): string {
  return glass(html`<div class="empty">${icon('alert')}<p>${message}</p>
    <button class="btn btn-sm" type="button" data-reload>${t('common.retry')}</button></div>`);
}
