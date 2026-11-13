import { api } from '../api';
import { formatDate, loc, setLang, t } from '../i18n';
import { navigate, type View } from '../router';
import { setBody, store } from '../store';
import { GOALS, LEVELS, type MyCoach, type ProgramSummary, type User } from '../types';
import { requireUser } from '../ui/components';
import { glass, html, initials, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast, toastError } from '../ui/toast';

const opt = (value: string, label: string, current: string) =>
  html`<option value="${value}" ${raw(value === current ? 'selected' : '')}>${label}</option>`;

export const profileView: View = (root, ctx) => {
  if (!requireUser(ctx.path)) return;
  const u = store.user!;

  root.innerHTML = html`
    <div class="page-head">
      <div class="row" style="gap:16px">
        <span class="avatar" style="width:64px;height:64px;border-radius:20px;font-size:1.4rem">${initials(u.name)}</span>
        <div>
          <h1>${u.name}</h1>
          <p class="text-2">${u.email} · ${t('profile.memberSince', { date: formatDate(u.created_at) })}</p>
        </div>
      </div>
      ${u.role !== 'user' ? raw(html`<span class="badge accent">${icon('shield', 'icon-sm')} ${t(`admin.role.${u.role}`)}</span>`) : ''}
    </div>

    <div class="grid-2" style="align-items:start">
      ${raw(glass(html`
        <form id="profile-form" class="stack" style="gap:16px">
          <h2>${t('profile.details')}</h2>
          <label class="field"><span>${t('auth.name')}</span><input class="input" name="name" value="${u.name}" maxlength="60" required /></label>
          <h3 style="margin-top:6px">${t('profile.training')}</h3>
          <div class="grid-2" style="gap:14px">
            <label class="field"><span>${t('auth.level')}</span>
              <select class="select" name="level">${raw(LEVELS.map((l) => opt(l, t(`level.${l}`), u.level)).join(''))}</select></label>
            <label class="field"><span>${t('profile.goal')}</span>
              <select class="select" name="goal">${raw(GOALS.map((g) => opt(g, t(`goal.${g}`), u.goal)).join(''))}</select></label>
            <label class="field"><span>${t('profile.unit')}</span>
              <select class="select" name="unit">${raw(opt('kg', 'kg', u.unit) + opt('lbs', 'lbs', u.unit))}</select></label>
            <label class="field"><span>${t('profile.body')}</span>
              <select class="select" name="body">${raw(opt('male', t('body.male'), u.body) + opt('female', t('body.female'), u.body))}</select></label>
            <label class="field"><span>${t('profile.language')}</span>
              <select class="select" name="lang">${raw(opt('en', 'English', u.lang) + opt('fr', 'Français', u.lang))}</select></label>
          </div>
          <div><button class="btn btn-primary" type="submit">${icon('check')} ${t('common.save')}</button></div>
        </form>`))}

      <div class="stack">
        ${raw(glass(html`<div id="coach-card"><h2>${icon('target')} ${t('mycoach.title')}</h2></div>`, { delay: 30 }))}
        ${raw(glass(html`
          <form id="pw-form" class="stack" style="gap:14px">
            <h2>${icon('lock')} ${t('profile.security')}</h2>
            <label class="field"><span>${t('profile.currentPw')}</span>
              <input class="input" name="current" type="password" autocomplete="current-password" required /></label>
            <label class="field"><span>${t('profile.newPw')}</span>
              <input class="input" name="next" type="password" autocomplete="new-password" minlength="8" required />
              <span class="muted" style="font-size:.8rem">${t('auth.pwHint')}</span></label>
            <p class="form-error" id="pw-error" role="alert"></p>
            <div class="row">
              <button class="btn" type="submit">${t('profile.changePw')}</button>
              <button class="btn btn-ghost" type="button" data-act="logout-all">${icon('logout', 'icon-sm')} ${t('profile.logoutAll')}</button>
            </div>
          </form>`, { delay: 60 }))}
        ${raw(glass(html`
          <h2 style="color:var(--danger)">${t('profile.danger')}</h2>
          <p class="text-2" style="margin:8px 0 14px">${t('profile.dangerLead')}</p>
          <button class="btn btn-danger" type="button" data-act="delete">${icon('trash')} ${t('profile.deleteBtn')}</button>`, { delay: 120 }))}
      </div>
    </div>`;

  qs<HTMLFormElement>('#profile-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)) as Partial<User>;
    try {
      const { user } = await api.updateProfile(data);
      store.user = user;
      setBody(user.body);
      setLang(user.lang); // re-renders the page if the language changed
      store.emit();
      toast(t('profile.saved'));
    } catch (err) {
      toastError(err);
    }
  });

  // ---- coach: join with a code, see what the coach can see, leave at any time
  let mine: MyCoach = { coach: null, assignment: null };
  let programs: ProgramSummary[] = [];
  const coachCard = () => {
    const el = qs('#coach-card', root);
    const head = html`<h2>${icon('target')} ${t('mycoach.title')}</h2>`;
    const dash = u.role !== 'user' ? html`<p style="margin-top:14px"><a class="btn btn-sm" href="/coach">${t('mycoach.dashboard')} ${icon('right', 'icon-sm')}</a></p>` : '';
    if (!mine.coach) {
      el.innerHTML = html`${raw(head)}
        <p class="text-2" style="margin:8px 0 14px">${t('mycoach.none')}</p>
        <form id="coach-form" class="row" style="align-items:flex-end">
          <label class="field" style="flex:1;min-width:160px"><span>${t('mycoach.code')}</span>
            <input class="input coach-code-input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="XXXX-XXXX" required /></label>
          <button class="btn" type="submit">${t('mycoach.join')}</button>
        </form>
        <p class="form-error" id="coach-error" role="alert"></p>${raw(dash)}`;
      return;
    }
    const a = mine.assignment;
    const name = a ? loc(programs.find((p) => p.id === a.program_id)?.name) || a.program_id : '';
    el.innerHTML = html`${raw(head)}
      <p style="margin-top:8px"><strong>${t('mycoach.with', { name: mine.coach.name })}</strong>
        ${mine.coach.since ? raw(html`<span class="muted" style="font-size:.84rem"> · ${t('mycoach.since', { date: formatDate(mine.coach.since) })}</span>`) : ''}</p>
      <p class="text-2" style="margin:8px 0 14px">${t('mycoach.sees')}</p>
      ${a
        ? raw(html`<div class="panel coach-assigned" style="margin-bottom:14px">
            <span class="muted" style="font-size:.8rem;font-weight:700">${t('mycoach.assigned')}</span>
            <a class="link" href="/programs/${a.program_id}"><strong>${name}</strong></a>
            ${a.note ? raw(html`<p class="text-2">“${a.note}”</p>`) : ''}
          </div>`)
        : ''}
      <button class="btn btn-ghost btn-danger btn-sm" type="button" data-act="leave-coach">${t('mycoach.leave')}</button>${raw(dash)}`;
  };
  coachCard();
  void Promise.all([api.myCoach(), api.programs()]).then(
    ([m, p]) => {
      mine = m;
      programs = p;
      coachCard();
    },
    () => undefined, // offline: the card keeps its default state
  );
  root.addEventListener('submit', async (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id !== 'coach-form') return;
    e.preventDefault();
    try {
      mine = await api.joinCoach(String(new FormData(form).get('code') ?? ''));
      coachCard();
      toast(t('mycoach.joined', { name: mine.coach?.name ?? '' }));
    } catch (err) {
      qs('#coach-error', root).textContent = errorMessage(err);
    }
  });

  const pwForm = qs<HTMLFormElement>('#pw-form', root);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(pwForm);
    qs('#pw-error', root).textContent = '';
    try {
      await api.changePassword(String(f.get('current')), String(f.get('next')));
      pwForm.reset();
      toast(t('profile.pwChanged'));
    } catch (err) {
      qs('#pw-error', root).textContent = errorMessage(err);
    }
  });

  root.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    try {
      if (act === 'logout-all') {
        await api.logoutAll();
        await store.setUser(null);
        toast(t('auth.loggedOut'), 'info');
        navigate('/login');
      } else if (act === 'leave-coach') {
        if (!confirm(t('mycoach.leaveConfirm', { name: mine.coach?.name ?? '' }))) return;
        await api.leaveCoach();
        mine = { coach: null, assignment: null };
        coachCard();
        toast(t('mycoach.left'), 'info');
      } else if (act === 'delete') {
        const password = prompt(t('profile.deletePrompt'));
        if (!password) return;
        await api.deleteAccount(password);
        await store.setUser(null);
        toast(t('profile.deleted'), 'info');
        navigate('/');
      }
    } catch (err) {
      toastError(err);
    }
  });
};
