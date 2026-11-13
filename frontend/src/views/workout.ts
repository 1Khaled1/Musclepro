/** Live workout logger: per-set weight + unit (kg/lbs) + reps, rest timer,
 *  autosaved draft (survives reloads), save to Firebase via the API. */
import { api, ApiError } from '../api';
import { effortLabel, fmtReps, formatNumber, loc, relativeDay, t, tn } from '../i18n';
import { navigate, type View } from '../router';
import { DEFAULT_REPS, loadDraft, saveDraft, setsFor, store } from '../store';
import type { DemoPlayer } from '../motion/player';
import type { DraftWorkout, Exercise, LoggedSet, Muscle, Suggestion, Unit } from '../types';
import { glass, html, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast, toastError } from '../ui/toast';
import { queueWorkout } from '../offline';

const kgOrLb = (w: number, unit: Unit) => `${formatNumber(w, 2)} ${t(`common.${unit}`)}`;

/** "Today: 62.5 kg × 8" and why, then what was done last time. */
function suggestionBlock(s: Suggestion, item: DraftWorkout['items'][number]): string {
  const what = [s.weight !== null ? kgOrLb(s.weight, s.unit) : '', s.reps !== null ? (s.weight !== null ? `× ${formatNumber(s.reps)}` : tn('sug.reps', s.reps)) : '']
    .filter(Boolean)
    .join(' ');
  const bw = s.weight === null;
  const why =
    s.reason === 'pct'
      ? t('sug.pct', { pct: effortLabel({ pct: item.target?.pct }).replace(' 1RM', ''), e1rm: kgOrLb(s.e1rm ?? 0, s.unit) })
      : s.reason === 'return'
        ? t('sug.return', { days: formatNumber(s.days ?? 21) })
        : t(bw && (s.reason === 'progress' || s.reason === 'reps') ? (s.reason === 'progress' ? 'sug.progressBw' : 'sug.repsBw') : `sug.${s.reason}`);
  const last = s.last
    ? t('sug.last', {
        sets: `${s.last.weight > 0 ? `${kgOrLb(s.last.weight, s.last.unit)} × ` : ''}${s.last.reps.map((r) => formatNumber(r)).join(', ')}`,
        when: relativeDay(s.last.date),
      })
    : '';
  return html`<div class="suggest" data-reason="${s.reason}">
      ${icon('spark', 'icon-sm')}
      <div><p><strong>${t('sug.next', { what })}</strong> <span>${why}</span></p>${last ? raw(html`<p class="muted">${last}</p>`) : ''}</div>
    </div>`;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const workoutView: View = async (root) => {
  let draft = loadDraft();
  let exercises: Exercise[] = [];
  try {
    exercises = await api.exercises();
  } catch (err) {
    toastError(err);
  }
  const byId = new Map(exercises.map((e) => [e.id, e]));

  if (!draft) {
    root.innerHTML = glass(
      html`<div class="empty" style="padding:48px 16px">
        ${icon('timer')}<h1 class="h2">${t('wo.none')}</h1><p>${t('wo.noneLead')}</p>
        <div class="row" style="justify-content:center">
          <a class="btn btn-primary" href="/programs">${icon('calendar')} ${t('nav.programs')}</a>
          <a class="btn" href="/generator">${icon('spark')} ${t('nav.generator')}</a>
          <a class="btn" href="/exercises">${icon('library')} ${t('nav.exercises')}</a>
        </div>
      </div>`,
    );
    return;
  }

  let restEnd = 0;
  let saving = false;
  const persist = () => saveDraft(draft);

  // ---- smart progression: ask the server once per exercise, fill untouched sets
  let asking = false;
  const fetchSuggestions = async () => {
    if (!draft || !store.user || asking) return;
    const pending = draft.items.filter((it) => it.suggest === undefined && byId.has(it.id));
    if (!pending.length) return;
    asking = true;
    try {
      const { suggestions } = await api.suggest({
        unit: store.unit,
        ...(draft.program_id ? { program_id: draft.program_id, week: draft.week ?? 1 } : {}),
        items: pending.map((it) => ({ id: it.id, sets: it.sets.length || 1, reps: it.target?.reps ?? null, ...(it.target?.pct !== undefined ? { pct: it.target.pct } : {}) })),
      });
      if (!draft) return;
      let changed = false;
      for (const it of draft.items) {
        if (it.suggest !== undefined || !(it.id in suggestions)) continue;
        const s = suggestions[it.id];
        it.suggest = s;
        changed = true;
        if (!s) continue;
        // Only sets the athlete has not touched yet: never overwrite what they typed.
        for (const set of it.sets) {
          if (set.done || set.weight !== 0) continue;
          if (s.weight !== null && set.unit === s.unit) set.weight = s.weight;
          if (s.reps !== null) set.reps = s.reps;
        }
      }
      if (changed) {
        persist();
        render();
      }
    } catch {
      /* offline or server asleep: the logger works without suggestions; we ask again next time */
    } finally {
      asking = false;
    }
  };

  // One demonstration open at a time, under the exercise it belongs to.
  let demoAt: number | null = null;
  let demoPlayer: DemoPlayer | null = null;
  let demoRun = 0;
  const syncDemo = () => {
    demoPlayer?.dispose();
    demoPlayer = null;
    const run = ++demoRun;
    root.querySelectorAll<HTMLButtonElement>('[data-act="demo"]').forEach((btn) => {
      const open = Number(btn.dataset.ei) === demoAt;
      btn.setAttribute('aria-expanded', String(open));
      btn.querySelector('span')!.textContent = t(open ? 'demo.hide' : 'demo.show');
    });
    root.querySelectorAll<HTMLElement>('.demo-slot').forEach((slot) => {
      slot.hidden = Number(slot.dataset.ei) !== demoAt;
    });
    if (demoAt === null || !draft) return;
    const at = demoAt;
    const ex = byId.get(draft.items[at]?.id ?? '');
    const slot = root.querySelector<HTMLElement>(`.demo-slot[data-ei="${at}"]`);
    if (!ex || !slot) return;
    const levels: Partial<Record<Muscle, number>> = {};
    ex.secondary.forEach((m) => (levels[m] = 0.42));
    ex.primary.forEach((m) => (levels[m] = 1));
    void import('../motion/player').then(({ mountDemo }) => {
      if (run !== demoRun) return; // closed or re-rendered meanwhile
      demoPlayer = mountDemo(slot, { id: ex.id, name: loc(ex.name), levels });
    });
  };

  const setRow = (ei: number, si: number, s: LoggedSet) => html`
    <div class="set-row${s.done ? ' is-done' : ''}" data-ei="${ei}" data-si="${si}">
      <span class="set-n">${si + 1}</span>
      <label><span class="visually-hidden">${t('wo.weight')} ${si + 1}</span>
        <input class="input input-num" type="number" inputmode="decimal" min="0" max="2000" step="0.5" data-field="weight" value="${s.weight || ''}" placeholder="0" /></label>
      <button class="unit-toggle" type="button" data-act="unit" aria-label="${t('wo.toggleUnit')}">${t(`common.${s.unit}`)}</button>
      <label><span class="visually-hidden">${t('wo.reps')} ${si + 1}</span>
        <input class="input input-num" type="number" inputmode="numeric" min="0" max="1000" step="1" data-field="reps" value="${s.reps}" /></label>
      <button class="done-btn" type="button" data-act="done" aria-pressed="${String(s.done)}" aria-label="${t('wo.markDone')} ${si + 1}">${icon('check')}</button>
      <span></span>
    </div>`;

  const exerciseCard = (item: DraftWorkout['items'][number], ei: number) => {
    const ex = byId.get(item.id);
    return glass(
      html`
        <div class="row between" style="align-items:flex-start">
          <div>
            <h2 class="h3"><a href="/exercises/${item.id}">${ex ? loc(ex.name) : item.id}</a></h2>
            ${item.target ? raw(html`<span class="muted" style="font-size:.82rem">${t('wo.target', { sets: item.target.sets, rest: item.target.rest, reps: fmtReps(item.target.reps) })}${effortLabel(item.target) ? ` · ${effortLabel(item.target)}` : ''}</span>`) : ''}
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="remove-ex" data-ei="${ei}" aria-label="${t('wo.removeExercise')}">${icon('trash', 'icon-sm')}</button>
        </div>
        ${item.suggest ? raw(suggestionBlock(item.suggest, item)) : ''}
        <div class="set-grid">
          <div class="set-row head" aria-hidden="true"><span>#</span><span>${t('wo.weight')}</span><span>${t('wo.unit')}</span><span>${t('wo.reps')}</span><span>${t('wo.done')}</span><span></span></div>
          ${raw(item.sets.map((s, si) => setRow(ei, si, s)).join(''))}
        </div>
        <div class="row">
          <button class="btn btn-sm" type="button" data-act="add-set" data-ei="${ei}">${icon('plus', 'icon-sm')} ${t('wo.addSet')}</button>
          ${item.sets.length > 1 ? raw(html`<button class="btn btn-sm btn-ghost" type="button" data-act="remove-set" data-ei="${ei}">${icon('minus', 'icon-sm')} ${t('wo.removeSet')}</button>`) : ''}
          ${ex ? raw(html`<button class="btn btn-sm btn-ghost" type="button" data-act="demo" data-ei="${ei}" aria-expanded="false" aria-controls="demo-${ei}">${icon('play', 'icon-sm')} <span>${t('demo.show')}</span></button>`) : ''}
        </div>
        <div class="demo-slot" id="demo-${ei}" data-ei="${ei}" hidden></div>`,
      { cls: 'ex-log', delay: Math.min(ei, 6) * 40 },
    );
  };

  const render = () => {
    if (!draft) return;
    root.innerHTML = html`
      <h1 class="visually-hidden">${t('nav.workout')} — ${draft.title}</h1>
      ${raw(glass(html`
        <div>
          <span class="muted" style="font-size:.78rem;font-weight:700">${t('wo.elapsed')}</span>
          <div class="timer" id="elapsed">0:00</div>
        </div>
        <span id="rest"></span>
        <div class="row">
          <button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="discard">${t('wo.discard')}</button>
          <button class="btn btn-primary" type="button" data-act="finish">${icon('check')} ${t('wo.finish')}</button>
        </div>`, { cls: 'session-bar no-enter' }))}
      <div class="stack" style="margin-top:18px">
        <label class="field"><span>${t('wo.name')}</span>
          <input class="input" type="text" maxlength="120" data-field="title" value="${draft.title}" /></label>
        ${raw(draft.items.map(exerciseCard).join(''))}
        ${raw(glass(html`
          <label class="field"><span>${t('wo.addExercise')}</span>
            <select class="select" data-act="add-ex">
              <option value="">${t('wo.pickExercise')}</option>
              ${raw([...exercises].sort((a, b) => loc(a.name).localeCompare(loc(b.name))).map((e) => html`<option value="${e.id}">${loc(e.name)}</option>`).join(''))}
            </select></label>
          <label class="field" style="margin-top:14px"><span>${t('wo.notes')}</span>
            <textarea class="input textarea" maxlength="1000" data-field="notes" placeholder="${t('wo.notesPlaceholder')}">${draft.notes}</textarea></label>`))}
        ${store.user ? '' : raw(html`<div class="panel tip">${icon('lock')}<div><p>${t('wo.loginToSave')}</p><a class="link" href="/login?next=/workout">${t('nav.login')}</a></div></div>`)}
      </div>`;
    tick();
    syncDemo();
    void fetchSuggestions();
  };

  const tick = () => {
    const el = root.querySelector('#elapsed');
    if (!el || !draft) return;
    el.textContent = clock((Date.now() - draft.started_at) / 1000);
    const restEl = root.querySelector('#rest')!;
    const left = (restEnd - Date.now()) / 1000;
    if (left > 0) {
      restEl.innerHTML = html`<span class="rest-pill" role="timer" aria-live="off">${icon('timer', 'icon-sm')} ${t('wo.rest')} ${clock(left)}
        <button class="btn btn-sm btn-ghost" type="button" data-act="skip-rest" style="--btn-h:28px">${t('wo.skipRest')}</button></span>`;
    } else if (restEl.innerHTML) {
      restEl.innerHTML = '';
      if (restEnd) {
        restEnd = 0;
        navigator.vibrate?.(200);
      }
    }
  };
  const timer = window.setInterval(tick, 1000);

  root.addEventListener('input', (e) => {
    if (!draft) return;
    const el = e.target as HTMLInputElement;
    const field = el.dataset.field;
    if (field === 'title') draft.title = el.value;
    else if (field === 'notes') draft.notes = el.value;
    else if (field === 'weight' || field === 'reps') {
      const row = el.closest<HTMLElement>('.set-row')!;
      const set = draft.items[Number(row.dataset.ei)].sets[Number(row.dataset.si)];
      const v = parseFloat(el.value);
      set[field] = Number.isFinite(v) ? Math.max(0, field === 'reps' ? Math.round(v) : v) : 0;
    } else return;
    persist();
  });

  root.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.act !== 'add-ex' || !el.value || !draft) return;
    draft.items.push({
      id: el.value,
      sets: setsFor(undefined, store.unit),
    });
    persist();
    render();
  });

  root.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn || !draft || btn.tagName === 'SELECT') return;
    const act = btn.dataset.act;
    const row = btn.closest<HTMLElement>('.set-row');
    const ei = Number(row?.dataset.ei ?? btn.dataset.ei);
    const si = Number(row?.dataset.si);

    switch (act) {
      case 'unit': {
        const set = draft.items[ei].sets[si];
        set.unit = set.unit === 'kg' ? 'lbs' : 'kg';
        btn.textContent = t(`common.${set.unit}`);
        persist();
        return;
      }
      case 'done': {
        const set = draft.items[ei].sets[si];
        set.done = !set.done;
        btn.setAttribute('aria-pressed', String(set.done));
        row?.classList.toggle('is-done', set.done);
        if (set.done) restEnd = Date.now() + (draft.items[ei].target?.rest ?? 90) * 1000;
        persist();
        tick();
        return;
      }
      case 'skip-rest':
        restEnd = 0;
        tick();
        return;
      case 'demo':
        demoAt = demoAt === ei ? null : ei;
        syncDemo();
        return;
      case 'add-set': {
        const sets = draft.items[ei].sets;
        const last = sets[sets.length - 1];
        sets.push({ reps: last?.reps ?? DEFAULT_REPS, weight: last?.weight ?? 0, unit: last?.unit ?? store.unit, done: false });
        break;
      }
      case 'remove-set':
        draft.items[ei].sets.pop();
        break;
      case 'remove-ex':
        draft.items.splice(ei, 1);
        if (demoAt !== null) demoAt = demoAt === ei ? null : demoAt > ei ? demoAt - 1 : demoAt;
        break;
      case 'discard':
        if (!confirm(t('wo.discardConfirm'))) return;
        draft = null;
        saveDraft(null);
        navigate('/');
        return;
      case 'finish':
        await finish();
        return;
      default:
        return;
    }
    persist();
    render();
  });

  async function finish() {
    if (!draft || saving) return;
    if (!store.user) {
      navigate('/login?next=/workout');
      return;
    }
    const entries = draft.items
      .map((it) => ({ exercise_id: it.id, sets: it.sets.filter((s) => s.done) }))
      .filter((it) => it.sets.length);
    if (!entries.length) {
      toast(t('wo.nothingDone'), 'error');
      return;
    }
    saving = true;
    if (!draft.client_id) {
      draft.client_id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      persist();
    }
    const payload = {
      client_id: draft.client_id,
      title: draft.title.trim() || t('wo.custom'),
      notes: draft.notes,
      duration_min: Math.min(600, Math.round((Date.now() - draft.started_at) / 60000)),
      finished_at: new Date().toISOString(),
      entries,
      ...(draft.program_id ? { program_id: draft.program_id, day_id: draft.day_id, week: draft.week } : {}),
    };
    try {
      await api.saveWorkout(payload);
      draft = null;
      saveDraft(null);
      toast(t('wo.saved'));
      navigate('/history');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'network') {
        // No connection (gym basement…): keep it on the device, sync later.
        queueWorkout(payload);
        draft = null;
        saveDraft(null);
        toast(t('wo.savedOffline'), 'info');
        navigate('/');
      } else {
        toastError(err);
      }
    } finally {
      saving = false;
    }
  }

  render();
  return () => {
    window.clearInterval(timer);
    demoRun++;
    demoPlayer?.dispose();
  };
};
