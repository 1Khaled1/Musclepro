import { api } from '../api';
import { formatDate, formatNumber, getLang, loc, t, tn } from '../i18n';
import { refresh, type View } from '../router';
import { flushOutbox, pendingCount } from '../offline';
import type { Exercise, Muscle, Recovery, Stats, Workout } from '../types';
import { mountBody } from '../ui/bodyViewer';
import { errorBlock, loadingBlock, requireUser } from '../ui/components';
import { glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { fatigueLevels, recoveryList } from '../ui/recovery';
import { errorMessage, toast, toastError } from '../ui/toast';

/** Weekly volume: single series → no legend, title names it. Bars anchored
 *  to the baseline with 4px rounded data ends; hover/focus tooltip per bar;
 *  only the current week is direct-labelled; a table view follows. */
function volumeChart(weekly: Stats['weekly']): string {
  const W = 640;
  const H = 230;
  const pad = { l: 44, r: 8, t: 22, b: 26 };
  const max = Math.max(1, ...weekly.map((w) => w.volume_kg));
  const nice = (() => {
    const p = 10 ** Math.floor(Math.log10(max));
    const n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  })();
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / weekly.length;
  const barW = Math.min(46, band - 2 * Math.max(6, band * 0.2));
  const y = (v: number) => pad.t + plotH - (v / nice) * plotH;
  const ticks = [0, 0.5, 1].map((f) => f * nice);

  const bars = weekly
    .map((w, i) => {
      const x = pad.l + i * band + (band - barW) / 2;
      const top = y(w.volume_kg);
      const h = pad.t + plotH - top;
      const r = Math.min(4, h, barW / 2);
      const label = `${t('hist.weekOf', { date: formatDate(w.week, { day: 'numeric', month: 'short' }) })}: ${formatNumber(w.volume_kg)} kg`;
      const path = h > 0
        ? `M${x},${pad.t + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.t + plotH} Z`
        : '';
      const isLast = i === weekly.length - 1;
      return `
        ${path ? `<path class="bar" data-i="${i}" d="${path}"/>` : ''}
        ${isLast && w.volume_kg > 0 ? `<text class="value" x="${x + barW / 2}" y="${top - 6}" text-anchor="middle">${formatNumber(w.volume_kg)}</text>` : ''}
        <text class="axis" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${formatDate(w.week, { day: 'numeric', month: 'short' })}</text>
        <rect class="hit" data-i="${i}" x="${pad.l + i * band}" y="${pad.t}" width="${band}" height="${plotH}" tabindex="0" role="img" aria-label="${label}"/>`;
    })
    .join('');

  return `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="group" aria-label="${t('hist.weekly')}">
      ${ticks.map((v) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${formatNumber(v >= 1000 ? v / 1000 : v, 1)}${v >= 1000 ? 'k' : ''}</text>`).join('')}
      <line class="baseline" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + plotH}" y2="${pad.t + plotH}"/>
      ${bars}
    </svg>
    <div class="chart-tip" aria-hidden="true"></div>
  </div>`;
}

function bindChart(root: HTMLElement, weekly: Stats['weekly']): void {
  const wrap = root.querySelector<HTMLElement>('.chart-wrap');
  if (!wrap) return;
  const tip = qs('.chart-tip', wrap);
  const show = (el: Element) => {
    const i = Number((el as HTMLElement).dataset.i);
    const w = weekly[i];
    const r = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    tip.innerHTML = html`<span class="muted">${t('hist.weekOf', { date: formatDate(w.week, { day: 'numeric', month: 'short' }) })}</span>
      <strong>${formatNumber(w.volume_kg)} kg</strong><span>${t('hist.sessions')}: ${w.sessions}</span>`;
    const bar = wrap.querySelector(`.bar[data-i="${i}"]`);
    const top = bar ? bar.getBoundingClientRect().top : r.bottom - 10;
    tip.style.left = `${r.left - wr.left + r.width / 2}px`;
    tip.style.top = `${Math.max(40, top - wr.top)}px`;
    tip.classList.add('is-visible');
    wrap.classList.add('has-focus');
    wrap.querySelectorAll('.bar').forEach((b) => b.classList.toggle('is-focus', b === bar));
  };
  const hide = () => {
    tip.classList.remove('is-visible');
    wrap.classList.remove('has-focus');
  };
  wrap.querySelectorAll('.hit').forEach((hit) => {
    hit.addEventListener('pointerenter', () => show(hit));
    hit.addEventListener('focus', () => show(hit));
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('blur', hide);
  });
}

function pendingBanner(): string {
  const n = pendingCount();
  if (!n) return '';
  return html`<div class="panel tip" style="margin-bottom:18px;align-items:center">${icon('clock')}
    <p style="flex:1">${tn('hist.pending', n)}</p>
    <button class="btn btn-sm" type="button" data-sync>${icon('repeat', 'icon-sm')} ${t('hist.syncNow')}</button></div>`;
}

export const historyView: View = async (root, ctx) => {
  if (!requireUser(ctx.path)) return;
  const onSync = async (e: Event) => {
    if (!(e.target as HTMLElement).closest('[data-sync]')) return;
    await flushOutbox();
    refresh();
  };
  root.addEventListener('click', onSync);
  root.innerHTML = loadingBlock(3);
  let stats: Stats;
  let workouts: Workout[];
  let exercises: Exercise[];
  let recovery: Recovery | null;
  try {
    [stats, { workouts }, exercises, recovery] = await Promise.all([api.stats(), api.workouts(30), api.exercises(), api.recovery().catch(() => null)]);
  } catch (err) {
    root.innerHTML = pendingBanner() + errorBlock(errorMessage(err));
    return;
  }
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const exName = (id: string) => (byId.get(id) ? loc(byId.get(id)!.name) : id);

  const stat = (label: string, value: string, sub = '') =>
    html`<div class="panel stat"><span>${label}</span><strong>${value}</strong>${sub ? raw(html`<small>${sub}</small>`) : ''}</div>`;

  const workoutItem = (w: Workout) => {
    const sets = w.entries.reduce((n, e) => n + e.sets.length, 0);
    return html`<details class="panel workout-item" data-id="${w.id}">
      <summary>
        <span class="eq" style="display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgb(var(--accent-rgb)/.12);color:var(--accent)">${icon(w.program_id ? 'calendar' : 'dumbbell')}</span>
        <span class="grow"><strong>${w.title}</strong>
          <span class="muted" style="font-size:.82rem">${formatDate(w.finished_at, { weekday: 'short', day: 'numeric', month: 'short' })} · ${tn('hist.setsCount', sets)} · ${w.duration_min} ${t('common.min')}</span></span>
        <span class="chev">${icon('right')}</span>
      </summary>
      <div class="body">
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${t('prog.exercise')}</th><th scope="col">${t('common.sets')}</th></tr></thead>
          <tbody>${raw(w.entries.map((e) => html`<tr><td>${exName(e.exercise_id)}</td>
            <td class="num">${e.sets.map((s) => `${s.weight ? `${s.weight}${t(`common.${s.unit}`)}×` : ''}${s.reps}`).join(' · ')}</td></tr>`).join(''))}</tbody>
        </table></div>
        ${w.notes ? raw(html`<p class="text-2" style="margin-top:10px">${w.notes}</p>`) : ''}
        ${w.coach_comment ? raw(html`<div class="panel coach-note">${icon('target', 'icon-sm')}<div><strong>${t('coach.feedback')}</strong><p>${w.coach_comment.text}</p></div></div>`) : ''}
        <button class="btn btn-sm btn-ghost btn-danger" type="button" data-del="${w.id}" style="margin-top:10px">${icon('trash', 'icon-sm')} ${t('common.delete')}</button>
      </div>
    </details>`;
  };

  root.innerHTML = html`
    <div class="page-head">
      <div>
        <span class="eyebrow">${icon('activity', 'icon-sm')} ${t('nav.history')}</span>
        <h1 style="margin-top:8px">${t('hist.title')}</h1>
        <p class="lead">${t('hist.lead')}</p>
      </div>
      <a class="btn" href="/api/workouts/export.csv?lang=${getLang()}" download>${icon('download')} ${t('hist.export')}</a>
    </div>
    ${raw(pendingBanner())}

    <div class="stat-tiles">
      ${raw(stat(t('hist.sessions'), formatNumber(stats.sessions)))}
      ${raw(stat(t('hist.thisWeek'), formatNumber(stats.this_week)))}
      ${raw(stat(t('hist.streak'), formatNumber(stats.streak_weeks)))}
      ${raw(stat(t('hist.volume'), formatNumber(stats.total_volume_kg), 'kg'))}
    </div>

    <div class="grid-2" style="margin-top:18px;align-items:start">
      <div class="stack">
        ${raw(glass(html`
          <h2>${t('hist.weekly')}</h2>
          <p class="muted" style="font-size:.85rem;margin:4px 0 12px">${t('hist.weeklyLead')}</p>
          ${raw(volumeChart(stats.weekly))}
          <details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:.85rem">${t('hist.table')}</summary>
            <div class="table-wrap" style="margin-top:8px"><table class="table">
              <thead><tr><th scope="col">${t('prog.week')}</th><th scope="col">kg</th><th scope="col">${t('hist.sessions')}</th></tr></thead>
              <tbody>${raw(stats.weekly.map((w) => html`<tr><td>${formatDate(w.week)}</td><td class="num">${formatNumber(w.volume_kg)}</td><td class="num">${w.sessions}</td></tr>`).join(''))}</tbody>
            </table></div>
          </details>`))}
        ${raw(glass(html`
          <h2>${t('hist.prs')}</h2>
          <p class="muted" style="font-size:.85rem;margin:4px 0 12px">${t('hist.prsLead')}</p>
          ${stats.personal_records.length
            ? raw(html`<div class="table-wrap" tabindex="0" role="region" aria-label="${t('hist.prs')}"><table class="table">
                <thead><tr><th scope="col">${t('prog.exercise')}</th><th scope="col">${t('hist.e1rm')}</th><th scope="col">${t('hist.best')}</th></tr></thead>
                <tbody>${raw(stats.personal_records.map((p) => html`<tr>
                  <td><a class="link" href="/exercises/${p.exercise_id}">${exName(p.exercise_id)}</a></td>
                  <td class="num"><strong>${formatNumber(p.e1rm_kg, 1)} kg</strong></td>
                  <td class="num">${p.weight}${t(`common.${p.unit}`)} × ${p.reps}</td></tr>`).join(''))}</tbody>
              </table></div>`)
            : raw(html`<div class="empty">${icon('trophy')}<p>${t('hist.noPrs')}</p></div>`)}`, { delay: 60 }))}
      </div>
      ${raw(glass(html`
        <div class="section-title" style="flex-wrap:wrap">
          <h2 id="heat-title">${t(recovery ? 'rec.title' : 'hist.heat')}</h2>
          ${recovery
            ? raw(html`<div class="segmented" role="group" aria-label="${t('rec.show')}">
                <button type="button" data-heat="recovery" aria-pressed="true">${t('rec.title')}</button>
                <button type="button" data-heat="week" aria-pressed="false">${t('rec.week')}</button>
              </div>`)
            : ''}
        </div>
        <span class="legend" id="heat-legend" style="margin-bottom:10px"></span>
        <div id="heat-body"></div>
        <div id="heat-list"></div>`, { cls: 'body-stage', delay: 90 }))}
    </div>

    <section style="margin-top:28px">
      <div class="section-title"><h2>${t('hist.recent')}</h2></div>
      <div class="stack" id="recent" style="gap:10px">
        ${workouts.length
          ? raw(workouts.map(workoutItem).join(''))
          : raw(glass(html`<div class="empty">${icon('dumbbell')}<p>${t('hist.empty')}</p><a class="btn btn-primary" href="/programs">${t('hist.emptyCta')}</a></div>`))}
      </div>
    </section>`;

  bindChart(root, stats.weekly);

  // Body map: recovery (how tired each muscle still is) or the week's volume.
  // Both use one hue; the text list under the body says the same in words.
  const weekLevels: Partial<Record<Muscle, number>> = {};
  for (const [m, sets] of Object.entries(stats.muscle_sets_7d)) {
    weekLevels[m as Muscle] = Math.min(1, 0.2 + (sets ?? 0) / 12);
  }
  let heatMode: 'recovery' | 'week' = recovery ? 'recovery' : 'week';
  const viewerPromise = mountBody(qs('#heat-body', root), { layout: 'dual' });
  const paintHeat = () => {
    const rec = heatMode === 'recovery' && recovery;
    qs('#heat-title', root).textContent = t(rec ? 'rec.title' : 'hist.heat');
    qs('#heat-legend', root).innerHTML = rec
      ? html`<span><i class="l-heat-lo"></i>${t('rec.status.recovering')}</span><span><i class="l-heat-hi"></i>${t('rec.status.tired')}</span>`
      : html`<span><i class="l-heat-lo"></i>${t('hist.heatLow')}</span><span><i class="l-heat-hi"></i>${t('hist.heatHigh')}</span>`;
    qs('#heat-list', root).innerHTML = rec ? html`${raw(recoveryList(rec))}<p class="muted rec-note">${t('rec.lead')}</p>` : '';
    root.querySelectorAll<HTMLButtonElement>('[data-heat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.heat === heatMode)));
    void viewerPromise.then((v) => v.setLevels(rec ? fatigueLevels(rec) : weekLevels));
  };
  paintHeat();

  root.addEventListener('click', async (e) => {
    const mode = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-heat]');
    if (mode) {
      heatMode = mode.dataset.heat as typeof heatMode;
      paintHeat();
      return;
    }
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
    if (!btn || !confirm(t('hist.deleteConfirm'))) return;
    try {
      await api.deleteWorkout(btn.dataset.del!);
      btn.closest('details')?.remove();
      toast(t('hist.deleted'));
    } catch (err) {
      toastError(err);
    }
  });

  return () => void viewerPromise.then((v) => v.dispose());
};
