import { api } from '../api';
import { getLang, t } from '../i18n';
import { navigate, type View } from '../router';
import { store } from '../store';
import { LEVELS } from '../types';
import { glass, html, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast } from '../ui/toast';

/** Only allow same-site relative redirects after login (no open redirect). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/api/')) return '/';
  return next;
}

function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (/[^A-Za-z0-9]/.test(pw) || /[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  return Math.min(4, s);
}

function authPage(mode: 'login' | 'register'): View {
  return (root, ctx) => {
    const next = safeNext(ctx.query.get('next'));
    if (store.user) {
      navigate(next, { replace: true });
      return;
    }
    const isLogin = mode === 'login';
    root.innerHTML = html`<div class="auth-wrap">${raw(
      glass(
        html`
          <img class="logo" src="/logo.svg" alt="" width="56" height="56" />
          <div>
            <h1 style="font-size:1.8rem">${t(isLogin ? 'auth.loginTitle' : 'auth.registerTitle')}</h1>
            <p class="text-2" style="margin-top:6px">${t(isLogin ? 'auth.loginLead' : 'auth.registerLead')}</p>
          </div>
          <form class="stack" style="gap:14px" id="auth-form" novalidate>
            ${isLogin ? '' : raw(html`<label class="field"><span>${t('auth.name')}</span>
              <input class="input" name="name" autocomplete="name" required maxlength="60" /></label>`)}
            <label class="field"><span>${t('auth.email')}</span>
              <input class="input" name="email" type="email" autocomplete="email" required maxlength="254" /></label>
            <label class="field"><span>${t('auth.password')}</span>
              <span class="search">
                <input class="input" name="password" type="password" required minlength="${isLogin ? 1 : 8}" maxlength="128"
                  autocomplete="${isLogin ? 'current-password' : 'new-password'}" style="padding-right:48px" />
                <button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="reveal" aria-label="${t('auth.show')}" aria-pressed="false"
                  style="position:absolute;right:5px">${icon('eye', 'icon-sm')}</button>
              </span>
              ${isLogin ? '' : raw(html`<span class="pw-meter" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <span class="muted" style="font-size:.8rem">${t('auth.pwHint')}</span>`)}
            </label>
            ${isLogin ? '' : raw(html`<label class="field"><span>${t('auth.level')}</span>
              <select class="select" name="level">${raw(LEVELS.map((l) => html`<option value="${l}">${t(`level.${l}`)}</option>`).join(''))}</select></label>`)}
            <p class="form-error" id="auth-error" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit">${icon(isLogin ? 'login' : 'user')} ${t(isLogin ? 'auth.submitLogin' : 'auth.submitRegister')}</button>
          </form>
          <p class="text-2" style="text-align:center">
            ${t(isLogin ? 'auth.noAccount' : 'auth.haveAccount')}
            <a class="link" href="${isLogin ? '/register' : '/login'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}">${t(isLogin ? 'nav.register' : 'nav.login')}</a>
          </p>`,
        { cls: 'auth-card' },
      ),
    )}</div>`;

    // Demo mode: tell people before they create an account that this server
    // does not keep data yet (no database configured).
    api
      .health()
      .then((h) => {
        if (h.persistent || !root.isConnected) return;
        root.querySelector('#auth-form')?.insertAdjacentHTML(
          'beforebegin',
          html`<div class="panel tip demo-note" role="note">${icon('info')}<div><strong>${t('auth.demoTitle')}</strong>
            <p>${t('auth.demoBody')}</p></div></div>`,
        );
      })
      .catch(() => undefined);

    const form = qs<HTMLFormElement>('#auth-form', root);
    const errorEl = qs('#auth-error', root);
    const pw = form.elements.namedItem('password') as HTMLInputElement;
    (form.elements.namedItem(isLogin ? 'email' : 'name') as HTMLInputElement).focus();

    pw.addEventListener('input', () => {
      root.querySelector('.pw-meter')?.setAttribute('data-score', String(scorePassword(pw.value)));
    });
    root.querySelector('[data-act="reveal"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submit.disabled = true;
      try {
        const { user } = isLogin
          ? await api.login(data.email, data.password)
          : await api.register({ ...data, lang: getLang() });
        await store.setUser(user);
        toast(t('auth.welcome', { name: user.name }));
        navigate(next, { replace: true });
      } catch (err) {
        errorEl.textContent = errorMessage(err);
        form.querySelectorAll('.input').forEach((i) => i.setAttribute('aria-invalid', 'true'));
        submit.disabled = false;
      }
    });
    form.addEventListener('input', () => form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid')));
  };
}

export const loginView = authPage('login');
export const registerView = authPage('register');
