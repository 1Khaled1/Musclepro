import { api } from '../api';
import { fmtReps, fmtSec, loc, t } from '../i18n';
import { navigate, type View } from '../router';
import { loadDraft, startDraft, store } from '../store';
import { EQUIPMENT, GOALS, LEVELS, MUSCLES, type Exercise, type GeneratedWorkout, type Goal } from '../types';
import { glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { toastError } from '../ui/toast';

const GEN_GOALS: Goal[] = GOALS.filter((g) => g !== 'fat_loss');

export const generatorView: View = async (root) => {
  const state = {
    goal: (store.user?.goal && GEN_GOALS.includes(store.user.goal) ? store.user.goal : 'hypertrophy') as Goal,
    level: store.user?.level ?? 'beginner',
    minutes: 45,
    equipment: new Set<string>(['dumbbell']),
    muscles: new Set<string>(),
  };
  let result: GeneratedWorkout | null = null;
  let exercises: Exercise[] = [];

  root.innerHTML = html`
    <div class="page-head">
      <div>
        <span class="eyebrow">${icon('spark', 'icon-sm')} ${t('nav.generator')}</span>
        <h1 style="margin-top:8px">${t('gen.title')}</h1>
        <p class="lead">${t('gen.lead')}</p>
      </div>
    </div>
    <div class="gen-grid">
      ${raw(glass(html`<form id="gen-form" class="stack" style="gap:22px">
        <fieldset class="field" style="border:0;padding:0;margin:0">
          <legend class="label" style="margin-bottom:8px">${t('gen.goal')}</legend>
          <div class="chips" id="g-goal"></div>
        </fieldset>
        <div class="grid-2" style="gap:14px">
          <label class="field"><span>${t('gen.level')}</span>
            <select class="select" name="level">${raw(LEVELS.map((l) => html`<option value="${l}" ${raw(state.level === l ? 'selected' : '')}>${t(`level.${l}`)}</option>`).join(''))}</select>
          </label>
          <label class="field"><span>${t('gen.time')} · <output class="num" id="g-min">${state.minutes}</output> ${t('common.min')}</span>
            <input class="range" type="range" name="minutes" min="15" max="120" step="5" value="${state.minutes}" />
          </label>
        </div>
        <fieldset class="field" style="border:0;padding:0;margin:0">
          <legend class="label" style="margin-bottom:4px">${t('gen.equipment')}</legend>
          <span class="muted" style="font-size:.8rem;margin-bottom:8px">${t('gen.equipmentHint')}</span>
          <div class="chips" id="g-eq"></div>
        </fieldset>
        <fieldset class="field" style="border:0;padding:0;margin:0">
          <legend class="label" style="margin-bottom:4px">${t('gen.muscles')}</legend>
          <span class="muted" style="font-size:.8rem;margin-bottom:8px">${t('gen.musclesHint')}</span>
          <div class="chips" id="g-mus"></div>
        </fieldset>
        <button class="btn btn-primary btn-block" type="submit">${icon('spark')} ${t('gen.generate')}</button>
      </form>`))}
      <div id="gen-result"></div>
    </div>`;

  const chip = (group: string, value: string, label: string, on: boolean) =>
    html`<button class="chip" type="button" data-group="${group}" data-value="${value}" aria-pressed="${String(on)}">${label}</button>`;

  const renderChips = () => {
    qs('#g-goal', root).innerHTML = GEN_GOALS.map((g) => chip('goal', g, t(`goal.${g}`), state.goal === g)).join('');
    qs('#g-eq', root).innerHTML = EQUIPMENT.filter((e) => e !== 'bodyweight')
      .map((e) => chip('equipment', e, t(`equip.${e}`), state.equipment.has(e)))
      .join('');
    qs('#g-mus', root).innerHTML = MUSCLES.map((m) => chip('muscles', m, t(`muscle.${m}`), state.muscles.has(m))).join('');
  };

  const renderResult = () => {
    const el = qs('#gen-result', root);
    if (!result) {
      el.innerHTML = glass(html`<div class="empty">${icon('spark')}<p>${t('gen.empty')}</p></div>`, { delay: 60 });
      return;
    }
    if (!result.exercises.length) {
      el.innerHTML = glass(html`<div class="empty">${icon('alert')}<p>${t('gen.noResult')}</p></div>`);
      return;
    }
    const byId = new Map(exercises.map((e) => [e.id, e]));
    el.innerHTML = glass(
      html`
        <div class="section-title">
          <div><h2>${t('gen.result')}</h2>
            <span class="muted" style="font-size:.85rem">${t(`goal.${result.goal}`)} · ${t('gen.estimate', { n: result.estimated_minutes })}</span></div>
          <button class="btn btn-sm" type="button" data-act="shuffle">${icon('repeat', 'icon-sm')} ${t('gen.regenerate')}</button>
        </div>
        ${result.warmup?.length
          ? raw(html`<h3 class="plan-heading">${icon('flame', 'icon-sm')} ${t('gen.warmup')}</h3>
            <ul class="plan-list">${raw(
              result.warmup
                .map((x) => {
                  const ex = byId.get(x.id);
                  return html`<li class="panel plan-item is-warmup">
                    <span class="n" aria-hidden="true">${icon('rotate', 'icon-sm')}</span>
                    <span><a class="link" style="color:inherit" href="/exercises/${x.id}">${ex ? loc(ex.name) : x.id}</a>
                      <span class="muted" style="display:block;font-size:.8rem">${t('type.mobility')}</span></span>
                    <span class="rx">${x.sets} × ${fmtReps(x.reps)}</span>
                  </li>`;
                })
                .join(''),
            )}</ul>
            <h3 class="plan-heading">${icon('dumbbell', 'icon-sm')} ${t('gen.main')}</h3>`)
          : ''}
        <ol class="plan-list">${raw(
          result.exercises
            .map((x, i) => {
              const ex = byId.get(x.id);
              return html`<li class="panel plan-item">
                <span class="n">${String(i + 1).padStart(2, '0')}</span>
                <span><a class="link" style="color:inherit" href="/exercises/${x.id}">${ex ? loc(ex.name) : x.id}</a>
                  <span class="muted" style="display:block;font-size:.8rem">${ex ? ex.primary.map((m) => t(`muscle.${m}`)).join(' · ') : ''}</span></span>
                <span class="rx">${x.sets} × ${fmtReps(x.reps)}<br />${fmtSec(x.rest)}</span>
              </li>`;
            })
            .join(''),
        )}</ol>
        <button class="btn btn-primary btn-block" type="button" data-act="start" style="margin-top:16px">${icon('play')} ${t('gen.start')}</button>`,
      { cls: 'is-interactive' },
    );
  };

  const generate = async () => {
    try {
      const [res, all] = await Promise.all([
        api.generate({
          goal: state.goal,
          level: state.level,
          minutes: state.minutes,
          equipment: [...state.equipment],
          muscles: [...state.muscles],
        }),
        api.exercises(),
      ]);
      result = res;
      exercises = all;
      renderResult();
      if (window.matchMedia('(max-width: 920px)').matches) qs('#gen-result', root).scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toastError(err);
    }
  };

  const form = qs<HTMLFormElement>('#gen-form', root);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void generate();
  });
  form.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'minutes') {
      state.minutes = Number(el.value);
      qs('#g-min', root).textContent = el.value;
    } else if (el.name === 'level') state.level = el.value as typeof state.level;
  });
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const c = target.closest<HTMLButtonElement>('[data-group]');
    if (c) {
      const { group, value } = c.dataset as { group: string; value: string };
      if (group === 'goal') state.goal = value as Goal;
      else {
        const set = group === 'equipment' ? state.equipment : state.muscles;
        if (set.has(value)) set.delete(value);
        else set.add(value);
      }
      renderChips();
      return;
    }
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'shuffle') void generate();
    if (act === 'start' && result) {
      if (loadDraft() && !confirm(t('wo.discardConfirm'))) return;
      const focus = state.muscles.size ? [...state.muscles].map((m) => t(`muscle.${m}` as 'muscle.chest')).join(', ') : t('gen.fullBody');
      startDraft(`${t(`goal.${result.goal}`)} · ${focus}`, [...(result.warmup ?? []), ...result.exercises]);
      navigate('/workout');
    }
  });

  renderChips();
  renderResult();
};
