/** Coach mode: the coach's athletes, and one athlete's training in detail.
 *  A coach only ever sees athletes who joined with the coach's invite code. */
import { api } from '../api';
import { formatDate, formatNumber, loc, relativeDay, t, tn } from '../i18n';
import { navigate, type View } from '../router';
import { store } from '../store';
import type { CoachAssignment, CoachAthlete, CoachAthleteDetail, Exercise, ProgramSummary, Workout } from '../types';
import { errorBlock, levelBadge, loadingBlock, requireUser } from '../ui/components';
import { glass, html, initials, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { recoveryList } from '../ui/recovery';
import { errorMessage, toast, toastError } from '../ui/toast';

const isCoach = (): boolean => store.user?.role === 'coach' || store.user?.role === 'admin';

const progress = (a: CoachAssignment): string => html`
  <div class="coach-progress">
    <span class="rec-bar" aria-hidden="true"><i style="width:${a.total ? Math.round((100 * a.done) / a.total) : 0}%"></i></span>
    <span class="muted">${t('coach.progress', { done: formatNumber(a.done), total: formatNumber(a.total) })}</span>
  </div>`;

// ------------------------------------------------------------------ dashboard
export const coachView: View = async (root, ctx) => {
  if (!requireUser(ctx.path)) return;
  if (!isCoach()) {
    root.innerHTML = errorBlock(t('err.forbidden'));
    return;
  }
  root.innerHTML = loadingBlock(3);
  let code: string;
  let athletes: CoachAthlete[];
  let programs: ProgramSummary[];
  try {
    let mine: ProgramSummary[];
    [{ code, athletes }, programs, mine] = await Promise.all([api.coach(), api.programs(), api.myPrograms()]);
    programs = [...mine, ...programs];
  } catch (err) {
    root.innerHTML = errorBlock(errorMessage(err));
    return;
  }
  const programName = (id: string) => loc(programs.find((p) => p.id === id)?.name) || id;

  const card = (a: CoachAthlete, i: number) =>
    glass(
      html`
        <div class="row" style="gap:12px;align-items:center">
          <span class="avatar" aria-hidden="true">${initials(a.name)}</span>
          <div class="grow">
            <h2 class="h3"><a href="/coach/athletes/${a.id}">${a.name}</a></h2>
            <span class="muted" style="font-size:.82rem">${a.last_workout_at ? t('coach.lastSession', { when: relativeDay(a.last_workout_at) }) : t('coach.noSession')}</span>
          </div>
          ${raw(levelBadge(a.level))}
        </div>
        <dl class="kv coach-kv">
          <dt>${t('coach.thisWeek')}</dt><dd>${tn('coach.sessionsCount', a.this_week)}</dd>
          <dt>${t('coach.streak')}</dt><dd>${tn('coach.weeks', a.streak_weeks)}</dd>
          <dt>${t('coach.program')}</dt><dd>${a.assignment ? programName(a.assignment.program_id) : t('coach.noProgram')}</dd>
        </dl>
        ${a.assignment ? raw(progress(a.assignment)) : ''}
        <a class="btn btn-sm" href="/coach/athletes/${a.id}">${t('coach.open')} ${icon('right', 'icon-sm')}</a>`,
      { cls: 'coach-card', delay: Math.min(i, 6) * 50 },
    );

  const render = () => {
    root.innerHTML = html`
      <div class="page-head">
        <div>
          <span class="eyebrow">${icon('target', 'icon-sm')} ${t('admin.role.coach')}</span>
          <h1 style="margin-top:8px">${t('coach.title')}</h1>
          <p class="lead">${t('coach.lead')}</p>
        </div>
      </div>
      ${raw(glass(html`
        <div class="coach-invite">
          <div>
            <h2 class="h3">${t('coach.code')}</h2>
            <p class="muted" style="font-size:.86rem;margin-top:4px">${t('coach.codeLead')}</p>
          </div>
          <div class="row">
            <output class="coach-code" id="coach-code" aria-label="${t('coach.code')}">${code}</output>
            <button class="btn btn-sm" type="button" data-act="copy">${t('coach.copy')}</button>
            <button class="btn btn-sm btn-ghost" type="button" data-act="renew">${icon('repeat', 'icon-sm')} ${t('coach.renew')}</button>
          </div>
        </div>`))}
      <section style="margin-top:28px">
        <div class="section-title"><h2>${tn('coach.count', athletes.length)}</h2></div>
        ${athletes.length
          ? raw(html`<div class="grid-3">${raw(athletes.map(card).join(''))}</div>`)
          : raw(glass(html`<div class="empty">${icon('user')}<p>${t('coach.empty')}</p></div>`))}
        <p class="muted" style="font-size:.8rem;margin-top:16px">${icon('lock', 'icon-sm')} ${t('coach.privacy')}</p>
      </section>`;
  };
  render();

  root.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    try {
      if (act === 'copy') {
        await navigator.clipboard.writeText(code);
        toast(t('coach.copied'));
      } else if (act === 'renew') {
        if (!confirm(t('coach.renewConfirm'))) return;
        code = (await api.coachRenewCode()).code;
        qs('#coach-code', root).textContent = code;
        toast(t('coach.renewed'));
      }
    } catch (err) {
      toastError(err);
    }
  });
};

// ------------------------------------------------------------------ one athlete
export const coachAthleteView: View = async (root, ctx) => {
  if (!requireUser(ctx.path)) return;
  if (!isCoach()) {
    root.innerHTML = errorBlock(t('err.forbidden'));
    return;
  }
  root.innerHTML = loadingBlock(3);
  const id = ctx.params.id;
  let data: CoachAthleteDetail;
  let programs: ProgramSummary[];
  let exercises: Exercise[];
  try {
    let mine: ProgramSummary[];
    [data, programs, exercises, mine] = await Promise.all([api.coachAthlete(id), api.programs(), api.exercises(), api.myPrograms()]);
    programs = [...mine, ...programs]; // the coach's own programs first
  } catch (err) {
    root.innerHTML = html`<a class="back-link" href="/coach">${icon('left', 'icon-sm')} ${t('coach.back')}</a>${raw(errorBlock(errorMessage(err)))}`;
    return;
  }
  const exName = (ex: string) => loc(exercises.find((e) => e.id === ex)?.name) || ex;
  const programName = (pid: string) => loc(programs.find((p) => p.id === pid)?.name) || pid;
  const stat = (label: string, value: string, unit = '') => html`<div class="panel stat"><span>${label}</span><strong>${value}</strong>${unit ? raw(html`<small>${unit}</small>`) : ''}</div>`;

  const workoutItem = (w: Workout) => {
    const sets = w.entries.reduce((n, e) => n + e.sets.length, 0);
    return html`<details class="panel workout-item" data-id="${w.id}">
      <summary>
        <span class="eq" style="display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgb(var(--accent-rgb)/.12);color:var(--accent)">${icon(w.program_id ? 'calendar' : 'dumbbell')}</span>
        <span class="grow"><strong>${w.title}</strong>
          <span class="muted" style="font-size:.82rem">${formatDate(w.finished_at, { weekday: 'short', day: 'numeric', month: 'short' })} · ${tn('hist.setsCount', sets)} · ${w.duration_min} ${t('common.min')}${w.coach_comment ? ` · ${t('coach.feedback')}` : ''}</span></span>
        <span class="chev">${icon('right')}</span>
      </summary>
      <div class="body">
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${t('prog.exercise')}</th><th scope="col">${t('common.sets')}</th></tr></thead>
          <tbody>${raw(w.entries.map((e) => html`<tr><td>${exName(e.exercise_id)}</td>
            <td class="num">${e.sets.map((s) => `${s.weight ? `${s.weight}${t(`common.${s.unit}`)}×` : ''}${s.reps}`).join(' · ')}</td></tr>`).join(''))}</tbody>
        </table></div>
        ${w.notes ? raw(html`<p class="text-2" style="margin-top:10px">${w.notes}</p>`) : ''}
        <form class="stack" data-comment="${w.id}" style="gap:8px;margin-top:12px">
          <label class="field"><span>${t('coach.feedbackLabel')}</span>
            <textarea class="input textarea" name="text" maxlength="600" rows="2" placeholder="${t('coach.feedbackPlaceholder')}">${w.coach_comment?.text ?? ''}</textarea></label>
          <div><button class="btn btn-sm" type="submit">${icon('check', 'icon-sm')} ${t('coach.feedbackSave')}</button></div>
        </form>
      </div>
    </details>`;
  };

  const programCard = () => {
    const a = data.assignment;
    return html`
      <h2>${t('coach.program')}</h2>
      ${a
        ? raw(html`<div class="panel coach-assigned">
            <a class="link" href="/programs/${a.program_id}"><strong>${programName(a.program_id)}</strong></a>
            ${raw(progress(a))}
            ${a.note ? raw(html`<p class="text-2">“${a.note}”</p>`) : ''}
            <span class="muted" style="font-size:.8rem">${t('coach.assignedOn', { date: formatDate(a.at) })}</span>
          </div>`)
        : raw(html`<p class="muted" style="margin-top:6px">${t('coach.noProgram')}</p>`)}
      <form id="assign-form" class="stack" style="gap:12px;margin-top:16px">
        <label class="field"><span>${t('coach.assign')}</span>
          <select class="select" name="program_id" required>
            <option value="">${t('coach.pick')}</option>
            ${raw(programs.map((p) => html`<option value="${p.id}" ${raw(a?.program_id === p.id ? 'selected' : '')}>${loc(p.name)} · ${p.custom ? t('cp.badge') : t(`level.${p.level}`)}</option>`).join(''))}
          </select>
          <span class="muted" style="font-size:.8rem">${t('coach.assignLead')}</span></label>
        <label class="field"><span>${t('coach.note')}</span>
          <textarea class="input textarea" name="note" maxlength="500" rows="2" placeholder="${t('coach.notePlaceholder')}">${a?.note ?? ''}</textarea></label>
        <div class="row">
          <button class="btn btn-primary" type="submit">${icon('check')} ${t('coach.assignBtn')}</button>
          ${a ? raw(html`<button class="btn btn-ghost" type="button" data-act="unassign">${t('coach.unassign')}</button>`) : ''}
        </div>
      </form>`;
  };

  const { athlete, stats } = data;
  document.title = `${athlete.name} — MusclePro`;
  root.innerHTML = html`
    <a class="back-link" href="/coach">${icon('left', 'icon-sm')} ${t('coach.back')}</a>
    <div class="page-head">
      <div class="row" style="gap:16px">
        <span class="avatar" aria-hidden="true" style="width:64px;height:64px;border-radius:20px;font-size:1.4rem">${initials(athlete.name)}</span>
        <div>
          <h1>${athlete.name}</h1>
          <div class="row" style="margin-top:10px">
            ${raw(levelBadge(athlete.level))}
            <span class="badge">${t(`goal.${athlete.goal}`)}</span>
            ${data.since ? raw(html`<span class="muted" style="font-size:.84rem">${t('coach.since', { date: formatDate(data.since) })}</span>`) : ''}
          </div>
        </div>
      </div>
      <button class="btn btn-ghost btn-danger" type="button" data-act="remove">${icon('trash', 'icon-sm')} ${t('coach.remove')}</button>
    </div>

    <div class="stat-tiles">
      ${raw(stat(t('coach.sessions'), formatNumber(stats.sessions)))}
      ${raw(stat(t('coach.thisWeek'), formatNumber(stats.this_week)))}
      ${raw(stat(t('coach.streak'), formatNumber(stats.streak_weeks)))}
      ${raw(stat(t('coach.volume'), formatNumber(stats.total_volume_kg), 'kg'))}
    </div>

    <div class="grid-2" style="margin-top:18px;align-items:start">
      <div class="stack">
        ${raw(glass(html`<div id="program-card">${raw(programCard())}</div>`))}
        ${raw(glass(html`
          <h2>${t('coach.workouts')}</h2>
          <div class="stack" style="gap:10px;margin-top:14px">
            ${data.workouts.length ? raw(data.workouts.map(workoutItem).join('')) : raw(html`<p class="muted">${t('coach.noWorkouts')}</p>`)}
          </div>`, { delay: 60 }))}
      </div>
      <div class="stack">
        ${raw(glass(html`
          <h2>${t('rec.title')}</h2>
          ${raw(recoveryList(data.recovery))}
          <p class="muted rec-note">${t('rec.lead')}</p>`, { delay: 40 }))}
        ${raw(glass(html`
          <h2>${t('hist.prs')}</h2>
          ${stats.personal_records.length
            ? raw(html`<div class="table-wrap" tabindex="0" role="region" aria-label="${t('hist.prs')}" style="margin-top:12px"><table class="table">
                <thead><tr><th scope="col">${t('prog.exercise')}</th><th scope="col">${t('hist.e1rm')}</th><th scope="col">${t('hist.best')}</th></tr></thead>
                <tbody>${raw(stats.personal_records.map((p) => html`<tr>
                  <td>${exName(p.exercise_id)}</td>
                  <td class="num"><strong>${formatNumber(p.e1rm_kg, 1)} kg</strong></td>
                  <td class="num">${p.weight}${t(`common.${p.unit}`)} × ${p.reps}</td></tr>`).join(''))}</tbody>
              </table></div>`)
            : raw(html`<p class="muted" style="margin-top:8px">${t('hist.noPrs')}</p>`)}`, { delay: 80 }))}
      </div>
    </div>`;

  root.addEventListener('submit', async (e) => {
    const form = e.target as HTMLFormElement;
    e.preventDefault();
    try {
      if (form.id === 'assign-form') {
        const f = new FormData(form);
        data.assignment = (await api.coachAssign(id, String(f.get('program_id')), String(f.get('note') ?? ''))).assignment;
        qs('#program-card', root).innerHTML = programCard();
        toast(t('coach.assigned'));
      } else if (form.dataset.comment) {
        const text = String(new FormData(form).get('text') ?? '');
        const { comment } = await api.coachComment(id, form.dataset.comment, text);
        const w = data.workouts.find((x) => x.id === form.dataset.comment);
        if (w) w.coach_comment = comment;
        toast(t(comment ? 'coach.feedbackSaved' : 'coach.feedbackRemoved'));
      }
    } catch (err) {
      toastError(err);
    }
  });

  root.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    try {
      if (act === 'unassign') {
        await api.coachUnassign(id);
        data.assignment = null;
        qs('#program-card', root).innerHTML = programCard();
        toast(t('coach.unassigned'));
      } else if (act === 'remove') {
        if (!confirm(t('coach.removeConfirm', { name: athlete.name }))) return;
        await api.coachRemoveAthlete(id);
        toast(t('coach.removed'));
        navigate('/coach');
      }
    } catch (err) {
      toastError(err);
    }
  });

  return () => {
    document.title = 'MusclePro — Train every muscle right';
  };
};
