import { api } from '../api';
import { t, tn } from '../i18n';
import type { View } from '../router';
import { store } from '../store';
import { EQUIPMENT, MUSCLES, type Exercise } from '../types';
import { bindFavorites, errorBlock, exerciseTile, loadingBlock } from '../ui/components';
import { debounce, glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast, toastError } from '../ui/toast';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const TYPES = ['strength', 'power', 'mobility'] as const;

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const exercisesView: View = async (root, ctx) => {
  const state = {
    q: ctx.query.get('q') ?? '',
    muscle: ctx.query.get('muscle') ?? '',
    equipment: ctx.query.get('equipment') ?? '',
    difficulty: ctx.query.get('difficulty') ?? '',
    type: ctx.query.get('type') ?? '',
    fav: ctx.query.get('fav') === '1' && !!store.user,
  };

  root.innerHTML = html`
    <div class="page-head">
      <div>
        <span class="eyebrow">${icon('library', 'icon-sm')} ${t('nav.exercises')}</span>
        <h1 style="margin-top:8px">${state.fav ? t('nav.favorites') : t('ex.title')}</h1>
        <p class="lead" id="ex-lead"></p>
      </div>
    </div>
    ${raw(glass(html`
      <form class="filters" role="search" id="ex-filters">
        <div class="row-fields">
          <label class="search">${icon('search')}
            <span class="visually-hidden">${t('ex.search')}</span>
            <input class="input" type="search" name="q" placeholder="${t('ex.search')}" value="${state.q}" autocomplete="off" />
          </label>
          <label><span class="visually-hidden">${t('ex.equipment')}</span>
            <select class="select" name="equipment">
              <option value="">${t('ex.allEquipment')}</option>
              ${raw(EQUIPMENT.map((e) => html`<option value="${e}" ${raw(state.equipment === e ? 'selected' : '')}>${t(`equip.${e}`)}</option>`).join(''))}
            </select></label>
          <label><span class="visually-hidden">${t('ex.level')}</span>
            <select class="select" name="difficulty">
              <option value="">${t('ex.allLevels')}</option>
              ${raw(DIFFICULTIES.map((d) => html`<option value="${d}" ${raw(state.difficulty === d ? 'selected' : '')}>${t(`level.${d}`)}</option>`).join(''))}
            </select></label>
          <label><span class="visually-hidden">${t('ex.type')}</span>
            <select class="select" name="type">
              <option value="">${t('ex.allTypes')}</option>
              ${raw(TYPES.map((k) => html`<option value="${k}" ${raw(state.type === k ? 'selected' : '')}>${t(`type.${k}`)}</option>`).join(''))}
            </select></label>
        </div>
        <div class="chip-scroller" role="group" aria-label="${t('ex.targets')}" id="ex-muscles"></div>
      </form>`))}
    <div class="section-title" style="margin-top:22px">
      <h2 class="h3" id="ex-count" aria-live="polite"></h2>
      <span class="row">
        ${store.user ? raw(html`<button class="chip" type="button" id="fav-toggle" aria-pressed="${String(state.fav)}">${icon('heart', 'icon-sm')} ${t('ex.favoritesOnly')}</button>`) : ''}
        <button class="btn btn-sm btn-ghost" type="button" id="ex-clear">${t('ex.clear')}</button>
      </span>
    </div>
    <div id="ex-results">${raw(loadingBlock(2))}</div>`;

  let all: Exercise[] = [];
  try {
    all = await api.exercises();
  } catch (err) {
    qs('#ex-results', root).innerHTML = errorBlock(errorMessage(err));
    return;
  }
  qs('#ex-lead', root).textContent = t('ex.lead', { n: all.length });

  const musclesEl = qs('#ex-muscles', root);
  const renderMuscles = () => {
    musclesEl.innerHTML =
      html`<button class="chip" type="button" data-muscle="" aria-pressed="${String(!state.muscle)}">${t('ex.allMuscles')}</button>` +
      MUSCLES.map(
        (m) => html`<button class="chip" type="button" data-muscle="${m}" aria-pressed="${String(state.muscle === m)}">${t(`muscle.${m}`)}</button>`,
      ).join('');
  };

  const syncUrl = () => {
    const params = new URLSearchParams();
    (['q', 'muscle', 'equipment', 'difficulty', 'type'] as const).forEach((k) => state[k] && params.set(k, state[k]));
    if (state.fav) params.set('fav', '1');
    const qs2 = params.toString();
    history.replaceState({}, '', `/exercises${qs2 ? `?${qs2}` : ''}`);
  };

  const render = () => {
    const q = normalize(state.q.trim());
    let items = all.filter((e) => {
      if (state.muscle && !e.primary.includes(state.muscle as never) && !e.secondary.includes(state.muscle as never)) return false;
      if (state.equipment && e.equipment !== state.equipment) return false;
      if (state.difficulty && e.difficulty !== state.difficulty) return false;
      if (state.type && e.type !== state.type) return false;
      if (state.fav && !store.favorites.has(e.id)) return false;
      if (q && !normalize(e.name.en).includes(q) && !normalize(e.name.fr).includes(q)) return false;
      return true;
    });
    if (state.muscle) {
      items = [...items].sort((a, b) => Number(!a.primary.includes(state.muscle as never)) - Number(!b.primary.includes(state.muscle as never)));
    }
    qs('#ex-count', root).textContent = tn('ex.results', items.length);
    qs('#ex-results', root).innerHTML = items.length
      ? `<div class="tiles">${items.map(exerciseTile).join('')}</div>`
      : glass(html`<div class="empty">${icon('search')}<p>${t('ex.empty')}</p></div>`);
    syncUrl();
  };

  const form = qs<HTMLFormElement>('#ex-filters', root);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener(
    'input',
    debounce((e: Event) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      if (el.name in state) (state as Record<string, unknown>)[el.name] = el.value;
      render();
    }, 120),
  );
  musclesEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-muscle]');
    if (!btn) return;
    state.muscle = btn.dataset.muscle ?? '';
    renderMuscles();
    render();
  });
  root.querySelector('#fav-toggle')?.addEventListener('click', (e) => {
    state.fav = !state.fav;
    (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(state.fav));
    render();
  });
  qs('#ex-clear', root).addEventListener('click', () => {
    Object.assign(state, { q: '', muscle: '', equipment: '', difficulty: '', type: '', fav: false });
    form.reset();
    (form.elements.namedItem('q') as HTMLInputElement).value = '';
    root.querySelector('#fav-toggle')?.setAttribute('aria-pressed', 'false');
    renderMuscles();
    render();
  });
  bindFavorites(
    root,
    (m) => {
      toast(m);
      if (state.fav) render();
    },
    toastError,
  );

  renderMuscles();
  render();
};
