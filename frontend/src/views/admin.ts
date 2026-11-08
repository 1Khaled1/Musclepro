import { api } from '../api';
import { formatDate, formatNumber, t } from '../i18n';
import { navigate, type View } from '../router';
import { store } from '../store';
import type { Role, User } from '../types';
import { errorBlock, levelBadge, loadingBlock, requireUser } from '../ui/components';
import { debounce, glass, html, initials, qs, raw } from '../ui/dom';
import { icon } from '../ui/icons';
import { errorMessage, toast, toastError } from '../ui/toast';

const ROLES: Role[] = ['user', 'coach', 'admin'];

export const adminView: View = async (root, ctx) => {
  if (!requireUser(ctx.path)) return;
  if (!store.isAdmin) {
    navigate('/', { replace: true });
    return;
  }
  root.innerHTML = loadingBlock(2);

  let stats: Awaited<ReturnType<typeof api.adminStats>>;
  try {
    stats = await api.adminStats();
  } catch (err) {
    root.innerHTML = errorBlock(errorMessage(err));
    return;
  }

  const stat = (label: string, value: number) =>
    html`<div class="panel stat"><span>${label}</span><strong>${formatNumber(value)}</strong></div>`;

  root.innerHTML = html`
    <div class="page-head">
      <div>
        <span class="eyebrow">${icon('shield', 'icon-sm')} Admin</span>
        <h1 style="margin-top:8px">${t('admin.title')}</h1>
        <p class="lead">${t('admin.lead')}</p>
      </div>
      <span class="badge ${stats.storage === 'firebase' ? 'beginner' : 'intermediate'}">${icon('layers', 'icon-sm')} ${t('admin.storage', { kind: stats.storage })}</span>
    </div>
    ${stats.storage !== 'firebase' ? raw(html`<div class="panel tip" style="margin-bottom:18px">${icon('alert')}<p>${t('admin.storageWarn')}</p></div>`) : ''}
    <div class="stat-tiles">
      ${raw(stat(t('admin.users'), stats.users))}
      ${raw(stat(t('admin.active'), stats.active))}
      ${raw(stat(t('admin.admins'), stats.admins))}
      ${raw(stat(t('admin.workouts'), stats.workouts))}
    </div>
    ${raw(glass(html`
      <div class="section-title">
        <h2>${t('admin.users')}</h2>
        <label class="search" style="width:min(100%,320px)">${icon('search')}
          <span class="visually-hidden">${t('admin.search')}</span>
          <input class="input" type="search" id="user-q" placeholder="${t('admin.search')}" autocomplete="off" /></label>
      </div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="${t('admin.users')}">
        <table class="table admin-table">
          <thead><tr>
            <th scope="col">${t('admin.user')}</th><th scope="col">${t('admin.level')}</th><th scope="col">${t('admin.role')}</th>
            <th scope="col">${t('admin.access')}</th><th scope="col">${t('admin.workouts')}</th><th scope="col">${t('admin.joined')}</th>
            <th scope="col"><span class="visually-hidden">${t('admin.actions')}</span></th>
          </tr></thead>
          <tbody id="user-rows"></tbody>
        </table>
      </div>`, { delay: 60, attrs: 'style="margin-top:18px;display:block"' }))}`;

  const rows = qs('#user-rows', root);
  const meId = store.user!.id;

  const row = (u: User) => {
    const me = u.id === meId;
    return html`<tr data-id="${u.id}">
      <th scope="row" style="font-weight:inherit;text-transform:none;letter-spacing:0;background:none;color:inherit;font-size:inherit">
        <span class="user-cell"><span class="avatar">${initials(u.name)}</span>
        <span><strong>${u.name}</strong>${me ? raw(html` <span class="badge">${t('admin.you')}</span>`) : ''}<small>${u.email}</small></span></span>
      </th>
      <td>${raw(levelBadge(u.level))}</td>
      <td><label><span class="visually-hidden">${t('admin.role')} — ${u.email}</span>
        <select class="select" data-field="role" ${raw(me ? 'disabled' : '')}>${raw(ROLES.map((r) => html`<option value="${r}" ${raw(u.role === r ? 'selected' : '')}>${t(`admin.role.${r}`)}</option>`).join(''))}</select></label></td>
      <td><label class="switch"><span class="visually-hidden">${t('admin.access')} — ${u.email}</span>
        <input type="checkbox" data-field="active" ${raw(u.active ? 'checked' : '')} ${raw(me ? 'disabled' : '')} /><span class="track" aria-hidden="true"></span></label></td>
      <td class="num">${u.workouts ?? 0}</td>
      <td class="num">${formatDate(u.created_at)}</td>
      <td>${me ? '' : raw(html`<button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="delete" aria-label="${t('common.delete')} ${u.email}">${icon('trash', 'icon-sm')}</button>`)}</td>
    </tr>`;
  };

  let users: User[] = [];
  const load = async (q = '') => {
    try {
      users = (await api.adminUsers(q)).users;
      rows.innerHTML = users.length
        ? users.map(row).join('')
        : html`<tr><td colspan="7"><div class="empty">${icon('search')}<p>${t('admin.empty')}</p></div></td></tr>`;
    } catch (err) {
      toastError(err);
    }
  };

  qs<HTMLInputElement>('#user-q', root).addEventListener(
    'input',
    debounce((e: Event) => void load((e.target as HTMLInputElement).value), 250),
  );

  rows.addEventListener('change', async (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const id = el.closest<HTMLElement>('tr')?.dataset.id;
    if (!id) return;
    const patch = el.dataset.field === 'role' ? { role: el.value as Role } : { active: (el as HTMLInputElement).checked };
    try {
      await api.adminUpdate(id, patch);
      toast(t('admin.updated'));
    } catch (err) {
      toastError(err);
      void load(qs<HTMLInputElement>('#user-q', root).value);
    }
  });

  rows.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act="delete"]');
    if (!btn) return;
    const tr = btn.closest<HTMLElement>('tr')!;
    const user = users.find((u) => u.id === tr.dataset.id);
    if (!user || !confirm(t('admin.deleteConfirm', { email: user.email }))) return;
    try {
      await api.adminDelete(user.id);
      tr.remove();
      toast(t('admin.deleted'));
    } catch (err) {
      toastError(err);
    }
  });

  await load();
};
