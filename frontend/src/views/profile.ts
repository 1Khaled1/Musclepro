import { api } from '../api';
import { formatDate, setLang, t } from '../i18n';
import { navigate, type View } from '../router';
import { setBody, store } from '../store';
import { GOALS, LEVELS, type User } from '../types';
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
