/** Program editor: write a week of training (days → exercises with sets,
 *  reps and rest); the program repeats it for the chosen number of weeks. */
import { api } from '../api';
import { loc, t } from '../i18n';
import { navigate, type View } from '../router';
import { store } from '../store';
import { GOALS, LEVELS, MUSCLES, type Exercise, type ProgramTemplate, type TemplateExercise } from '../types';
import { errorBlock, loadingBlock, requireUser } from '../ui/components';
import { glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast } from '../ui/toast';

const MAX_DAYS = 7;
const MAX_EXERCISES = 15;
/** Same shapes the server accepts: 8, 8-10, 10/side, 30s, 30m. */
const REPS_PATTERN = '\\s*(\\d{1,3}\\s*((-|–)\\s*\\d{1,3})?|\\d{1,3}\\s*(s|m|S|M))\\s*(\\/\\s*(side|leg))?\\s*';

const newExercise = (): TemplateExercise => ({ id: '', sets: 3, reps: '8-10', rest: 90 });
const blank = (): ProgramTemplate => ({
  name: '',
  description: '',
  level: store.user?.level ?? 'beginner',
  goal: store.user?.goal ?? 'general',
  weeks: 6,
  deload_every: 0,
  visibility: 'private',
  days: [{ name: '', exercises: [newExercise()] }],
});

export const programEditorView: View = async (root, ctx) => {
  if (!requireUser(ctx.path)) return;
  const id = ctx.params.id as string | undefined;
  root.innerHTML = loadingBlock(3);
  let tpl: ProgramTemplate;
  let exercises: Exercise[];
  try {
    [tpl, exercises] = await Promise.all([id ? api.programTemplate(id) : Promise.resolve(blank()), api.exercises()]);
  } catch (err) {
    root.innerHTML = html`<a class="back-link" href="/programs">${icon('left', 'icon-sm')} ${t('nav.programs')}</a>${raw(errorBlock(errorMessage(err)))}`;
    return;
  }

  // One <option> list, grouped by main muscle, reused by every row.
  const sorted = [...exercises].sort((a, b) => loc(a.name).localeCompare(loc(b.name)));
  const options = MUSCLES.map((m) => {
    const group = sorted.filter((e) => e.primary[0] === m);
    return group.length ? `<optgroup label="${t(`muscle.${m}`)}">${group.map((e) => html`<option value="${e.id}">${loc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const select = (current: string) => options.replace(`value="${current}"`, `value="${current}" selected`);

  const row = (x: TemplateExercise, di: number, xi: number, count: number) => html`
    <li class="cp-row" data-di="${di}" data-xi="${xi}">
      <span class="cp-n" aria-hidden="true">${xi + 1}</span>
      <label class="cp-ex"><span class="visually-hidden">${t('cp.exerciseN', { n: xi + 1 })}</span>
        <select class="select" data-f="id" required><option value="">${t('cp.pick')}</option>${raw(select(x.id))}</select></label>
      <label><span class="cp-label">${t('cp.sets')}</span>
        <input class="input input-num" type="number" inputmode="numeric" min="1" max="10" step="1" data-f="sets" value="${x.sets}" required /></label>
      <label><span class="cp-label">${t('cp.reps')}</span>
        <input class="input input-num" type="text" data-f="reps" value="${x.reps}" maxlength="12" pattern="${REPS_PATTERN}" title="${t('cp.repsHint')}" autocomplete="off" required /></label>
      <label><span class="cp-label">${t('cp.rest')}</span>
        <input class="input input-num" type="number" inputmode="numeric" min="0" max="600" step="5" data-f="rest" value="${x.rest}" required /></label>
      <span class="cp-tools">
        <button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="up" ${raw(xi === 0 ? 'disabled' : '')} aria-label="${t('cp.moveUp', { n: xi + 1 })}">${icon('left', 'icon-sm cp-up')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="down" ${raw(xi === count - 1 ? 'disabled' : '')} aria-label="${t('cp.moveDown', { n: xi + 1 })}">${icon('right', 'icon-sm cp-down')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="remove-ex" ${raw(count === 1 ? 'disabled' : '')} aria-label="${t('cp.removeExercise', { n: xi + 1 })}">${icon('trash', 'icon-sm')}</button>
      </span>
    </li>`;

  const dayCard = (day: ProgramTemplate['days'][number], di: number) =>
    glass(
      html`
        <fieldset class="cp-day" data-di="${di}">
          <legend class="visually-hidden">${t('cp.day', { n: di + 1 })}</legend>
          <div class="row between" style="align-items:flex-end;gap:12px">
            <label class="field" style="flex:1"><span>${t('cp.dayName', { n: di + 1 })}</span>
              <input class="input" data-f="day-name" value="${day.name}" maxlength="60" placeholder="${t('cp.dayPlaceholder')}" /></label>
            ${tpl.days.length > 1 ? raw(html`<button class="btn btn-ghost btn-danger btn-sm" type="button" data-act="remove-day">${icon('trash', 'icon-sm')} ${t('cp.removeDay')}</button>`) : ''}
          </div>
          <ol class="cp-rows">${raw(day.exercises.map((x, xi) => row(x, di, xi, day.exercises.length)).join(''))}</ol>
          ${day.exercises.length < MAX_EXERCISES ? raw(html`<div><button class="btn btn-sm" type="button" data-act="add-ex">${icon('plus', 'icon-sm')} ${t('cp.addExercise')}</button></div>`) : ''}
        </fieldset>`,
      { cls: 'cp-day-card no-enter' },
    );

  const renderDays = () => {
    qs('#cp-days', root).innerHTML = html`${raw(tpl.days.map(dayCard).join(''))}
      ${tpl.days.length < MAX_DAYS ? raw(html`<div><button class="btn" type="button" data-act="add-day">${icon('plus')} ${t('cp.addDay')}</button></div>`) : ''}`;
  };

  const opt = (value: string | number, label: string, current: string | number) => html`<option value="${value}" ${raw(String(value) === String(current) ? 'selected' : '')}>${label}</option>`;
  const back = id ? `/programs/${id}` : '/programs';
  document.title = `${t(id ? 'cp.edit' : 'cp.new')} — MusclePro`;
  root.innerHTML = html`
    <a class="back-link" href="${back}">${icon('left', 'icon-sm')} ${id ? tpl.name : t('nav.programs')}</a>
    <div class="page-head"><div><h1>${t(id ? 'cp.edit' : 'cp.new')}</h1></div></div>
    <form id="cp-form" class="stack" style="gap:18px" novalidate>
      ${raw(glass(html`
        <div class="stack" style="gap:16px">
          <h2>${t('cp.details')}</h2>
          <label class="field"><span>${t('cp.name')}</span>
            <input class="input" name="name" value="${tpl.name}" maxlength="80" placeholder="${t('cp.namePlaceholder')}" required /></label>
          <label class="field"><span>${t('cp.description')}</span>
            <textarea class="input textarea" name="description" maxlength="400" rows="2">${tpl.description}</textarea></label>
          <div class="grid-2" style="gap:14px">
            <label class="field"><span>${t('auth.level')}</span>
              <select class="select" name="level">${raw(LEVELS.map((l) => opt(l, t(`level.${l}`), tpl.level)).join(''))}</select></label>
            <label class="field"><span>${t('profile.goal')}</span>
              <select class="select" name="goal">${raw(GOALS.map((g) => opt(g, t(`goal.${g}`), tpl.goal)).join(''))}</select></label>
            <label class="field"><span>${t('cp.weeks')}</span>
              <input class="input" name="weeks" type="number" inputmode="numeric" min="1" max="24" step="1" value="${tpl.weeks}" required /></label>
            <label class="field"><span>${t('cp.deload')}</span>
              <select class="select" name="deload_every">${raw([0, 3, 4, 5, 6].map((n) => opt(n, n ? t('cp.deloadEvery', { n }) : t('cp.deloadNone'), tpl.deload_every)).join(''))}</select>
              <span class="muted" style="font-size:.8rem">${t('cp.deloadHint')}</span></label>
          </div>
          <div>
            <label class="switch"><input type="checkbox" name="share" ${raw(tpl.visibility === 'link' ? 'checked' : '')} /><span class="track" aria-hidden="true"></span><span>${t('cp.share')}</span></label>
            <p class="muted" style="font-size:.8rem;margin-top:6px">${t('cp.shareHint')}</p>
          </div>
        </div>`))}
      <div>
        <h2>${t('cp.week')}</h2>
        <p class="muted" style="margin-top:4px">${t('cp.weekLead')} ${t('cp.repsHint')}</p>
      </div>
      <div id="cp-days" class="stack" style="gap:18px"></div>
      <p class="form-error" id="cp-error" role="alert"></p>
      <div class="row cp-actions">
        <button class="btn btn-primary" type="submit">${icon('check')} ${t('cp.save')}</button>
        <a class="btn btn-ghost" href="${back}">${t('common.cancel')}</a>
      </div>
    </form>`;
  renderDays();

  const form = qs<HTMLFormElement>('#cp-form', root);

  // Typing updates the template in place; only adding, removing or moving re-draws the days.
  form.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const f = el.dataset.f;
    if (!f) return;
    const day = tpl.days[Number(el.closest<HTMLElement>('[data-di]')!.dataset.di)];
    if (f === 'day-name') {
      day.name = el.value;
      return;
    }
    const x = day.exercises[Number(el.closest<HTMLElement>('.cp-row')!.dataset.xi)];
    if (f === 'id') x.id = el.value;
    else if (f === 'reps') x.reps = el.value;
    else if (f === 'sets') x.sets = Math.round(Number(el.value)) || 0;
    else if (f === 'rest') x.rest = Math.round(Number(el.value)) || 0;
  });

  form.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const di = Number(btn.closest<HTMLElement>('[data-di]')?.dataset.di ?? -1);
    const xi = Number(btn.closest<HTMLElement>('.cp-row')?.dataset.xi ?? -1);
    let focus = '';
    if (act === 'add-day') {
      tpl.days.push({ name: '', exercises: [newExercise()] });
      focus = `.cp-day[data-di="${tpl.days.length - 1}"] [data-f="day-name"]`;
    } else if (act === 'remove-day') {
      tpl.days.splice(di, 1);
      focus = `.cp-day[data-di="${Math.min(di, tpl.days.length - 1)}"] [data-f="day-name"]`;
    } else if (act === 'add-ex') {
      tpl.days[di].exercises.push(newExercise());
      focus = `.cp-row[data-di="${di}"][data-xi="${tpl.days[di].exercises.length - 1}"] [data-f="id"]`;
    } else if (act === 'remove-ex') {
      tpl.days[di].exercises.splice(xi, 1);
      focus = `.cp-row[data-di="${di}"][data-xi="${Math.min(xi, tpl.days[di].exercises.length - 1)}"] [data-f="id"]`;
    } else if (act === 'up' || act === 'down') {
      const list = tpl.days[di].exercises;
      const to = xi + (act === 'up' ? -1 : 1);
      if (to < 0 || to >= list.length) return;
      [list[xi], list[to]] = [list[to], list[xi]];
      // Keep the keyboard on the row that moved (on its other arrow at either end).
      const again = to === 0 ? 'down' : to === list.length - 1 ? 'up' : act;
      focus = `.cp-row[data-di="${di}"][data-xi="${to}"] [data-act="${again}"]`;
    } else return;
    renderDays();
    root.querySelector<HTMLElement>(focus)?.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = qs('#cp-error', root);
    errorEl.textContent = '';
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const payload: ProgramTemplate = {
      ...tpl,
      name: String(f.get('name') ?? ''),
      description: String(f.get('description') ?? ''),
      level: f.get('level') as ProgramTemplate['level'],
      goal: f.get('goal') as ProgramTemplate['goal'],
      weeks: Math.round(Number(f.get('weeks'))),
      deload_every: Number(f.get('deload_every')),
      visibility: f.get('share') ? 'link' : 'private',
    };
    try {
      const program = id ? await api.updateProgram(id, payload) : await api.createProgram(payload);
      toast(t('cp.saved'));
      navigate(`/programs/${program.id}`);
    } catch (err) {
      errorEl.textContent = errorMessage(err);
      errorEl.scrollIntoView({ block: 'center' });
    }
  });

  return () => {
    document.title = 'MusclePro — Train every muscle right';
  };
};
