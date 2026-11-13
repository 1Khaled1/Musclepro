import { api } from '../api';
import { loc, t } from '../i18n';
import type { View } from '../router';
import { store } from '../store';
import { LEVELS, type ProgramSummary } from '../types';
import { errorBlock, loadingBlock, programCard } from '../ui/components';
import { html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage } from '../ui/toast';

export const programsView: View = async (root, ctx) => {
  let level = ctx.query.get('level') ?? '';
  root.innerHTML = html`
    <div class="page-head">
      <div>
        <span class="eyebrow">${icon('calendar', 'icon-sm')} ${t('nav.programs')}</span>
        <h1 style="margin-top:8px">${t('prog.title')}</h1>
        <p class="lead">${t('prog.lead')}</p>
      </div>
      <div class="segmented" role="group" aria-label="${t('ex.level')}" id="lvl"></div>
    </div>
    <div id="prog-assigned"></div>
    <div id="prog-list">${raw(loadingBlock(2))}</div>`;

  let programs: ProgramSummary[];
  try {
    programs = await api.programs();
  } catch (err) {
    qs('#prog-list', root).innerHTML = errorBlock(errorMessage(err));
    return;
  }

  if (store.user) {
    void api.myCoach().then(
      ({ coach, assignment }) => {
        const slot = root.querySelector<HTMLElement>('#prog-assigned');
        const p = assignment && programs.find((x) => x.id === assignment.program_id);
        if (!slot || !coach || !assignment || !p) return;
        slot.innerHTML = html`<a class="panel coach-banner" href="/programs/${p.id}">
          ${icon('target')}
          <span class="grow"><span class="muted">${t('mycoach.assignedBy', { name: coach.name })}</span>
            <strong>${loc(p.name)}</strong>
            ${assignment.note ? raw(html`<span class="text-2">“${assignment.note}”</span>`) : ''}</span>
          ${icon('right')}
        </a>`;
      },
      () => undefined,
    );
  }

  const lvlEl = qs('#lvl', root);
  const render = () => {
    lvlEl.innerHTML = ['', ...LEVELS]
      .map((l) => html`<button type="button" data-level="${l}" aria-pressed="${String(level === l)}">${l ? t(`level.${l}` as 'level.pro') : t('common.all')}</button>`)
      .join('');
    // The athlete's own level first, then by difficulty.
    const order = (p: ProgramSummary) => (store.user?.level === p.level ? -1 : LEVELS.indexOf(p.level));
    const items = programs.filter((p) => !level || p.level === level).sort((a, b) => order(a) - order(b));
    qs('#prog-list', root).innerHTML = `<div class="grid-3">${items.map((p, i) => programCard(p, i * 60)).join('')}</div>`;
    history.replaceState({}, '', `/programs${level ? `?level=${level}` : ''}`);
  };
  lvlEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-level]');
    if (!btn) return;
    level = btn.dataset.level ?? '';
    render();
  });
  render();
};
