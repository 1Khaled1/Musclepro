import { api } from '../api';
import { fmtReps, loc, t } from '../i18n';
import { navigate, type View } from '../router';
import { loadDraft, startDraft, store } from '../store';
import type { Enrollment, Exercise, Program } from '../types';
import { errorBlock, levelBadge, levelBar, loadingBlock } from '../ui/components';
import { glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast, toastError } from '../ui/toast';

export const programView: View = async (root, ctx) => {
  root.innerHTML = loadingBlock(3);
  let program: Program;
  let exercises: Exercise[];
  let enrollment: Enrollment | null = null;
  try {
    [program, exercises] = await Promise.all([api.program(ctx.params.id), api.exercises()]);
    if (store.user) enrollment = (await api.enrollments()).enrollments[program.id] ?? null;
  } catch (err) {
    root.innerHTML = errorBlock(errorMessage(err).replace(t('err.not_found'), t('prog.notFound')));
    return;
  }
  const byId = new Map(exercises.map((e) => [e.id, e]));
  let week = 1;

  const completedCount = () => Object.keys(enrollment?.completed ?? {}).length;
  const total = program.weeks * program.days.length;

  const enrollBlock = () => {
    if (!store.user) {
      return html`<div class="panel tip">${icon('lock')}<div><p>${t('prog.loginToEnroll')}</p>
        <a class="link" href="/login?next=/programs/${program.id}">${t('nav.login')}</a></div></div>`;
    }
    if (!enrollment) {
      return html`<button class="btn btn-primary btn-block" type="button" data-act="enroll">${icon('play')} ${t('prog.enroll')}</button>`;
    }
    const done = completedCount();
    const pct = Math.round((done / total) * 100);
    return html`
      <div class="stack" style="gap:10px">
        <div class="row between"><strong>${icon('check', 'icon-sm')} ${t('prog.enrolled')}</strong><span class="num">${pct}%</span></div>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <span class="muted" style="font-size:.85rem">${t('prog.progress', { done, total })}</span>
        <button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="leave">${t('prog.leave')}</button>
      </div>`;
  };

  const weekPicker = () =>
    html`<div class="week-dots" role="group" aria-label="${t('prog.week')}">${raw(
      Array.from({ length: program.weeks }, (_, i) => i + 1)
        .map((w) => {
          const doneAll = program.days.every((d) => enrollment?.completed?.[`w${w}-${d.id}`]);
          return html`<button type="button" class="chip${w === week ? ' is-active' : ''}" data-week="${w}" aria-pressed="${String(w === week)}"
            style="min-height:34px;padding:0 12px">${t('prog.week')} ${w}${doneAll ? raw(' ✓') : ''}</button>`;
        })
        .join(''),
    )}</div>`;

  const dayCard = (day: Program['days'][number], i: number) => {
    const done = enrollment?.completed?.[`w${week}-${day.id}`];
    return glass(
      html`
        <div class="section-title">
          <h3>${loc(day.name)}</h3>
          ${done ? raw(html`<span class="badge accent">${icon('check', 'icon-sm')} ${t('wo.done')}</span>`) : ''}
        </div>
        <div class="table-wrap" tabindex="0" role="region" aria-label="${loc(day.name)}">
          <table class="table">
            <thead><tr><th scope="col">${t('prog.exercise')}</th><th scope="col">${t('prog.setsReps')}</th><th scope="col">${t('prog.rest')}</th></tr></thead>
            <tbody>${raw(
              day.exercises
                .map((x) => {
                  const ex = byId.get(x.id);
                  return html`<tr><td><a class="link" href="/exercises/${x.id}">${ex ? loc(ex.name) : x.id}</a></td>
                    <td class="num">${x.sets} × ${fmtReps(x.reps)}</td><td class="num">${x.rest}s</td></tr>`;
                })
                .join(''),
            )}</tbody>
          </table>
        </div>
        <div style="margin-top:14px"><button class="btn btn-sm btn-primary" type="button" data-start="${day.id}">${icon('play', 'icon-sm')} ${t('prog.startDay')}</button></div>`,
      { cls: 'day-card', delay: i * 60 },
    );
  };

  const render = () => {
    root.innerHTML = html`
      <a class="back-link" href="/programs">${icon('left', 'icon-sm')} ${t('nav.programs')}</a>
      <div class="page-head">
        <div>
          <span class="row">${raw(levelBadge(program.level))}<span class="badge holo">${t(`goal.${program.goal}`)}</span>${raw(levelBar(program.level))}</span>
          <h1 style="margin-top:12px">${loc(program.name)}</h1>
          <p class="lead">${loc(program.summary)}</p>
        </div>
      </div>
      <div class="detail-grid">
        <div class="stack" id="days">
          <div class="section-title"><h2>${t('prog.schedule')}</h2></div>
          ${raw(program.weeks > 1 ? weekPicker() : '')}
          ${raw(program.days.map(dayCard).join(''))}
        </div>
        <div class="stack">
          ${raw(glass(html`
            <div class="program-meta" style="margin-bottom:16px">
              <span>${icon('calendar', 'icon-sm')}${t('prog.days', { n: program.days_per_week })}</span>
              <span>${icon('layers', 'icon-sm')}${t('prog.weeks', { n: program.weeks })}</span>
              <span>${icon('clock', 'icon-sm')}${t('prog.minutes', { n: program.minutes })}</span>
            </div>
            <div id="enroll">${raw(enrollBlock())}</div>`, { delay: 40 }))}
          ${raw(glass(html`
            <h3 style="margin-bottom:12px">${t('prog.progression')}</h3>
            <ol class="steps">${raw(program.progression.map((p) => html`<li><span>${loc(p)}</span></li>`).join(''))}</ol>`, { delay: 100 }))}
          ${raw(glass(html`
            <h3 style="margin-bottom:12px">${t('prog.equipment')}</h3>
            <div class="row">${raw(program.equipment.map((e) => html`<span class="badge">${icon(e, 'icon-sm')} ${t(`equip.${e}`)}</span>`).join(''))}</div>`, { delay: 140 }))}
        </div>
      </div>`;
  };

  root.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    const weekBtn = el.closest<HTMLElement>('[data-week]');
    if (weekBtn) {
      week = Number(weekBtn.dataset.week);
      render();
      return;
    }
    const startBtn = el.closest<HTMLElement>('[data-start]');
    if (startBtn) {
      const day = program.days.find((d) => d.id === startBtn.dataset.start)!;
      if (loadDraft() && !confirm(t('wo.discardConfirm'))) return;
      startDraft(`${loc(program.name)} — ${loc(day.name)}`, day.exercises, {
        program_id: program.id,
        day_id: day.id,
        week,
      });
      navigate('/workout');
      return;
    }
    const act = el.closest<HTMLButtonElement>('[data-act]')?.dataset.act;
    if (!act) return;
    try {
      if (act === 'enroll') {
        enrollment = (await api.enroll(program.id)).enrollment;
        toast(t('prog.enrolled'));
      } else if (act === 'leave') {
        await api.unenroll(program.id);
        enrollment = null;
      }
      qs('#enroll', root).innerHTML = enrollBlock();
    } catch (err) {
      toastError(err);
    }
  });

  render();
};
