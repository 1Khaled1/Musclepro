import { api } from '../api';
import { loc, locList, t } from '../i18n';
import type { View } from '../router';
import { addToDraft, store } from '../store';
import type { Muscle } from '../types';
import { mountBody } from '../ui/bodyViewer';
import { bindFavorites, errorBlock, exerciseTile, levelBadge, loadingBlock } from '../ui/components';
import { glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast, toastError } from '../ui/toast';

export const exerciseView: View = async (root, ctx) => {
  root.innerHTML = loadingBlock(2);
  let data: Awaited<ReturnType<typeof api.exercise>>;
  try {
    data = await api.exercise(ctx.params.id);
  } catch (err) {
    root.innerHTML = errorBlock(errorMessage(err).replace(t('err.not_found'), t('ex.notFound')));
    return;
  }
  const { exercise: ex, related, programs } = data;
  const fav = store.favorites.has(ex.id);
  const name = loc(ex.name);
  document.title = `${name} — MusclePro`;

  root.innerHTML = html`
    <a class="back-link" href="/exercises?muscle=${ex.primary[0]}">${icon('left', 'icon-sm')} ${t('nav.exercises')}</a>
    <div class="page-head">
      <div>
        <span class="eyebrow">${ex.primary.map((m) => t(`muscle.${m}`)).join(' · ')}</span>
        <h1 style="margin-top:8px">${name}</h1>
        <div class="row" style="margin-top:14px">
          ${raw(levelBadge(ex.difficulty))}
          <span class="badge">${icon(ex.equipment, 'icon-sm')} ${t(`equip.${ex.equipment}`)}</span>
          <span class="badge">${t(`mechanic.${ex.mechanic}`)}</span>
          <span class="badge">${t(`force.${ex.force}`)}</span>
          ${ex.type === 'power' ? raw(html`<span class="badge accent">${icon('bolt', 'icon-sm')} ${t('type.power')}</span>`) : ''}
        </div>
      </div>
      <div class="row">
        ${store.user
          ? raw(html`<button class="btn" type="button" data-fav="${ex.id}" aria-pressed="${String(fav)}">${icon('heart')} <span>${t(fav ? 'ex.removeFav' : 'ex.addFav')}</span></button>`)
          : ''}
        <button class="btn btn-primary" type="button" id="add-workout">${icon('plus')} ${t('ex.addToWorkout')}</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        ${raw(glass(html`
          <h2 style="margin-bottom:18px">${t('ex.howTo')}</h2>
          <ol class="steps">${raw(locList(ex.steps).map((s) => html`<li><span>${s}</span></li>`).join(''))}</ol>
          ${raw(locList(ex.tips).map((tip) => html`<div class="panel tip" style="margin-top:18px">${icon('bulb')}<div><strong>${t('ex.tip')}</strong><p>${tip}</p></div></div>`).join(''))}
        `))}
        ${programs.length
          ? raw(glass(html`
            <h3 style="margin-bottom:12px">${t('ex.inPrograms')}</h3>
            <div class="row">${raw(programs.map((p) => html`<a class="chip" href="/programs/${p.id}">${icon('calendar', 'icon-sm')} ${loc(p.name)}</a>`).join(''))}</div>`, { delay: 60 }))
          : ''}
      </div>
      <div class="stack">
        ${raw(glass(html`
          <div class="section-title"><h3>${t('ex.targets')}</h3>
            <span class="legend"><span><i class="l-primary"></i>${t('ex.primary')}</span><span><i class="l-secondary"></i>${t('ex.secondary')}</span></span>
          </div>
          <div id="ex-body"></div>
          <dl class="kv" style="margin-top:14px">
            <dt>${t('ex.primary')}</dt><dd>${ex.primary.map((m) => t(`muscle.${m}`)).join(', ')}</dd>
            ${ex.secondary.length ? raw(html`<dt>${t('ex.secondary')}</dt><dd>${ex.secondary.map((m) => t(`muscle.${m}`)).join(', ')}</dd>`) : ''}
            <dt>${t('ex.equipment')}</dt><dd>${t(`equip.${ex.equipment}`)}</dd>
            <dt>${t('ex.level')}</dt><dd>${t(`level.${ex.difficulty}`)}</dd>
          </dl>`, { cls: 'body-stage', delay: 80 }))}
      </div>
    </div>

    ${related.length
      ? raw(html`<section style="margin-top:36px">
          <div class="section-title"><h2>${t('ex.related')}</h2></div>
          <div class="tiles">${raw(related.map(exerciseTile).join(''))}</div>
        </section>`)
      : ''}`;

  const levels: Partial<Record<Muscle, number>> = {};
  ex.secondary.forEach((m) => (levels[m] = 0.42));
  ex.primary.forEach((m) => (levels[m] = 1));
  const viewerPromise = mountBody(qs('#ex-body', root), { layout: 'dual' }).then((v) => {
    v.setLevels(levels);
    return v;
  });

  bindFavorites(root, (m) => {
    toast(m);
    const btn = root.querySelector<HTMLButtonElement>(`.page-head [data-fav]`);
    const on = store.favorites.has(ex.id);
    if (btn) btn.querySelector('span')!.textContent = t(on ? 'ex.removeFav' : 'ex.addFav');
  }, toastError);

  qs('#add-workout', root).addEventListener('click', () => {
    addToDraft(ex, t('wo.custom'));
    toast(t('ex.added'));
  });

  return () => {
    document.title = 'MusclePro — Train every muscle right';
    void viewerPromise.then((v) => v.dispose());
  };
};
