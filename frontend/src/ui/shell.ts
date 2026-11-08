/** App shell: floating glass top bar + hamburger drawer + footer. */
import { api } from '../api';
import { getLang, onLangChange, setLang, t, type Lang } from '../i18n';
import { navigate, onNavigate, refresh } from '../router';
import { getTheme, loadDraft, onThemeChange, setTheme, store } from '../store';
import { canInstall, onInstallChange, promptInstall } from '../pwa';
import { esc, glass, html, initials, qs, raw } from './dom';
import { icon } from './icons';
import { toast, toastError } from './toast';

let currentPath = '/';
let drawerOpen = false;
let lastFocus: HTMLElement | null = null;

export function mountShell(app: HTMLElement): HTMLElement {
  app.innerHTML = `
    <a class="skip-link" href="#main" data-skip></a>
    <header class="topbar" id="topbar"></header>
    <div class="scrim" id="scrim" aria-hidden="true"></div>
    <div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-hidden="true" tabindex="-1"></div>
    <main id="main" tabindex="-1"></main>
    <footer class="site-foot" id="foot"></footer>`;

  renderAll();
  store.subscribe(renderAll);
  onLangChange(() => {
    renderAll();
    refresh();
  });
  onThemeChange(renderAll);
  onInstallChange(renderAll);
  onNavigate((path) => {
    currentPath = path;
    closeDrawer(false);
    renderAll();
  });

  qs('#scrim').addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerOpen) closeDrawer();
    if (e.key === 'Tab' && drawerOpen) trapFocus(e);
  });
  app.addEventListener('click', onShellClick);
  return qs('#main');
}

function renderAll(): void {
  renderTopbar();
  renderDrawer();
  renderFooter();
  const skip = document.querySelector('[data-skip]');
  if (skip) skip.textContent = t('nav.skip');
}

function langSwitch(): string {
  const lang = getLang();
  const b = (l: Lang, label: string) =>
    `<button type="button" data-lang="${l}" aria-pressed="${lang === l}" lang="${l}">${label}</button>`;
  return `<div class="segmented" role="group" aria-label="${esc(t('nav.language'))}">${b('en', 'EN')}${b('fr', 'FR')}</div>`;
}

function renderTopbar(): void {
  const user = store.user;
  const live = loadDraft();
  const themeIcon = getTheme() === 'dark' ? 'sun' : 'moon';
  qs('#topbar').innerHTML = glass(
    html`
      <button class="btn btn-ghost btn-icon hamburger" type="button" data-action="menu"
        aria-controls="drawer" aria-expanded="${String(drawerOpen)}" aria-label="${t(drawerOpen ? 'nav.close' : 'nav.open')}">
        <span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
      <a class="brand" href="/" aria-label="MusclePro">
        <img src="/logo.svg" alt="" width="36" height="36" /><span>Muscle<b>Pro</b></span>
      </a>
      <span class="grow"></span>
      ${live ? raw(html`<a class="btn btn-sm hide-sm" href="/workout">${icon('activity', 'icon-sm')} ${t('nav.live')}</a>`) : ''}
      <span class="hide-sm">${raw(langSwitch())}</span>
      <button class="btn btn-ghost btn-icon hide-sm" type="button" data-action="theme" aria-label="${t('nav.theme')}">${icon(themeIcon)}</button>
      ${user
        ? raw(html`<a class="user-btn" href="/profile" aria-label="${t('nav.profile')}"><span class="avatar">${initials(user.name)}</span></a>`)
        : raw(html`<a class="btn btn-sm btn-primary" href="/login">${t('nav.login')}</a>`)}
    `,
    { tag: 'div', cls: 'no-enter' },
  );
}

function link(href: string, iconName: string, label: string, extra = ''): string {
  const path = href.split('?')[0];
  const active = path === '/' ? currentPath === '/' : currentPath.startsWith(path) && !href.includes('?');
  return html`<a class="nav-link" href="${href}" ${raw(active ? 'aria-current="page"' : '')}>${icon(iconName)}<span>${label}</span>${raw(extra)}</a>`;
}

function renderDrawer(): void {
  const user = store.user;
  const live = loadDraft();
  const drawer = qs('#drawer');
  drawer.setAttribute('aria-label', 'MusclePro');
  drawer.innerHTML = glass(
    html`
      <div class="drawer-head">
        <a class="brand" href="/"><img src="/logo.svg" alt="" width="36" height="36" /><span>Muscle<b>Pro</b></span></a>
        <button class="btn btn-ghost btn-icon" type="button" data-action="close" aria-label="${t('nav.close')}">${icon('close')}</button>
      </div>

      ${user
        ? raw(html`<a class="panel drawer-user" href="/profile">
            <span class="avatar">${initials(user.name)}</span>
            <span><strong>${user.name}</strong><span class="badge ${user.level}">${t(`level.${user.level}`)}</span></span>
          </a>`)
        : raw(html`<div class="panel drawer-user" style="display:grid;gap:10px">
            <span><strong>${t('nav.guest')}</strong><span class="muted" style="font-size:.84rem">${t('nav.guestHint')}</span></span>
            <span class="row"><a class="btn btn-sm btn-primary" href="/login">${t('nav.login')}</a><a class="btn btn-sm" href="/register">${t('nav.register')}</a></span>
          </div>`)}

      <nav class="drawer-nav" aria-label="${t('nav.main')}">
      <div class="nav-group">
        <h4>${t('nav.group.train')}</h4>
        ${raw(link('/', 'body', t('nav.home')))}
        ${raw(link('/exercises', 'library', t('nav.exercises')))}
        ${raw(link('/programs', 'calendar', t('nav.programs')))}
        ${raw(link('/generator', 'spark', t('nav.generator')))}
      </div>
      <div class="nav-group">
        <h4>${t('nav.group.track')}</h4>
        ${raw(link('/workout', 'timer', t('nav.workout'), live ? html`<span class="badge accent">${t('nav.live')}</span>` : ''))}
        ${raw(link('/history', 'activity', t('nav.history')))}
        ${raw(link('/exercises?fav=1', 'heart', t('nav.favorites')))}
      </div>
      ${user
        ? raw(html`<div class="nav-group">
            <h4>${t('nav.group.account')}</h4>
            ${raw(link('/profile', 'user', t('nav.profile')))}
            ${store.isAdmin ? raw(link('/admin', 'shield', t('nav.admin'))) : ''}
            <button class="nav-link" type="button" data-action="logout">${icon('logout')}<span>${t('nav.logout')}</span></button>
          </div>`)
        : ''}
      </nav>

      ${canInstall()
        ? raw(html`<button class="nav-link" type="button" data-action="install">${icon('download')}<span>${t('nav.install')}</span></button>`)
        : ''}
      <div class="drawer-foot">
        <div class="row"><span>${icon('globe', 'icon-sm')} ${t('nav.language')}</span>${raw(langSwitch())}</div>
        <label class="row switch">
          <span>${icon('moon', 'icon-sm')} ${t('nav.theme')}</span>
          <input type="checkbox" data-action="theme-switch" ${raw(getTheme() === 'dark' ? 'checked' : '')} />
          <span class="track" aria-hidden="true"></span>
        </label>
      </div>
    `,
    { tag: 'div', cls: 'no-enter' },
  );
  drawer.classList.toggle('is-open', drawerOpen);
  drawer.setAttribute('aria-hidden', String(!drawerOpen));
  qs('#scrim').classList.toggle('is-open', drawerOpen);
}

function renderFooter(): void {
  qs('#foot').innerHTML = html`<span>${t('foot.tagline')}</span><span>${t('foot.disclaimer')}</span>`;
}

function setBackgroundInert(inert: boolean): void {
  for (const id of ['main', 'foot', 'topbar']) {
    const el = document.getElementById(id);
    if (el) el.inert = inert;
  }
}

function openDrawer(): void {
  lastFocus = document.activeElement as HTMLElement | null;
  drawerOpen = true;
  renderAll();
  setBackgroundInert(true);
  requestAnimationFrame(() => qs<HTMLElement>('#drawer [data-action="close"]').focus());
}

function closeDrawer(restoreFocus = true): void {
  if (!drawerOpen) return;
  drawerOpen = false;
  setBackgroundInert(false);
  renderAll();
  if (restoreFocus) {
    // The top bar re-renders on open/close, so the button that opened the
    // menu may have been replaced: fall back to its fresh copy.
    const back = lastFocus?.isConnected ? lastFocus : qs<HTMLElement>('#topbar [data-action="menu"]');
    back.focus();
  }
}

function trapFocus(e: KeyboardEvent): void {
  const focusable = Array.from(
    qs('#drawer').querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('disabled'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

async function onShellClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement;
  const langBtn = target.closest<HTMLElement>('[data-lang]');
  if (langBtn && target.closest('#topbar, #drawer')) {
    const lang = langBtn.dataset.lang as Lang;
    setLang(lang);
    if (store.user && store.user.lang !== lang) {
      store.user.lang = lang;
      api.updateProfile({ lang }).catch(() => undefined);
    }
    return;
  }
  const actionEl = target.closest<HTMLElement>('[data-action]');
  if (!actionEl || !actionEl.closest('#topbar, #drawer')) return;
  switch (actionEl.dataset.action) {
    case 'menu':
      if (drawerOpen) closeDrawer();
      else openDrawer();
      break;
    case 'close':
      closeDrawer();
      break;
    case 'theme':
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
      break;
    case 'install':
      await promptInstall();
      break;
    case 'theme-switch':
      setTheme((actionEl as HTMLInputElement).checked ? 'dark' : 'light');
      break;
    case 'logout':
      try {
        await api.logout();
        await store.setUser(null);
        closeDrawer(false);
        toast(t('auth.loggedOut'), 'info');
        navigate('/');
      } catch (err) {
        toastError(err);
      }
      break;
  }
}
