import { api } from '../api';
import { formatNumber, t, tn } from '../i18n';
import { navigate, type View } from '../router';
import { store } from '../store';
import { EQUIPMENT, MUSCLES, type Equipment, type Exercise, type Muscle, type ProgramSummary, type Stats } from '../types';
import { bestView, mountBody, type BodyViewer } from '../ui/bodyViewer';
import { bindFavorites, exerciseTile, programCard } from '../ui/components';
import { glass, html, qs, raw } from '../ui/dom';
import { scanBeams } from '../ui/effects';
import { icon } from '../ui/icons';
import { toast, toastError } from '../ui/toast';

const EQUIP_KEY = 'mp-equipment';

function savedEquipment(): Equipment | '' {
  try {
    const v = localStorage.getItem(EQUIP_KEY) as Equipment | null;
    return v && EQUIPMENT.includes(v) ? v : '';
  } catch {
    return '';
  }
}

export const homeView: View = async (root, ctx) => {
  const initial = MUSCLES.includes(ctx.query.get('muscle') as Muscle) ? (ctx.query.get('muscle') as Muscle) : null;
  let selected: Muscle | null = initial;
  let exercises: Exercise[] = [];
  let programs: ProgramSummary[] = [];
  let stats: Stats | null = null;
  let equipment: Equipment | '' = savedEquipment();

  root.innerHTML = html`
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <span class="eyebrow">${t('home.eyebrow')}</span>
        <h1 id="hero-title">${t('home.title1')}<br />${t('home.title2')} <em>${t('home.title3')}</em></h1>
        <p class="lead">${t('home.lead')}</p>
        <div class="hero-stats" id="hero-stats"></div>
      </div>
      ${raw(glass(html`
        <div id="body-host"></div>
        <div class="body-actions">
          <form class="search" role="search" id="home-search">
            ${icon('search')}
            <label class="visually-hidden" for="home-q">${t('ex.search')}</label>
            <input class="input" id="home-q" type="search" name="q" placeholder="${t('ex.search')}" autocomplete="off" />
          </form>
          <a class="btn" href="/generator">${icon('spark')} ${t('nav.generator')}</a>
        </div>`, { cls: 'hero-stage body-stage', delay: 80 }))}
      ${raw(glass(html`
        <div class="section-title" style="margin-bottom:12px">
          <h2 class="h3">${t('home.pickMuscle')}</h2>
          <label class="equip-select">
            <span class="visually-hidden">${t('ex.equipment')}</span>
            ${icon('dumbbell', 'icon-sm')}
            <select class="select" id="home-equipment">
              <option value="">${t('ex.allEquipment')}</option>
              ${raw(EQUIPMENT.map((e) => html`<option value="${e}" ${raw(equipment === e ? 'selected' : '')}>${t(`equip.${e}`)}</option>`).join(''))}
            </select>
          </label>
        </div>
        <div class="chips" id="muscle-chips" role="group" aria-label="${t('home.pickMuscle')}"></div>`,
        { cls: 'hero-picker muscle-picker', delay: 140 }))}
      ${raw(glass('<div id="muscle-panel" aria-live="polite"></div>', { cls: 'hero-panel muscle-panel', delay: 200 }))}
    </section>

    <section style="margin-top:56px" aria-labelledby="programs-title">
      <div class="section-title">
        <div><h2 id="programs-title">${t('home.programsTitle')}</h2>
          <p class="text-2" style="margin-top:6px;max-width:64ch">${t('home.programsLead')}</p></div>
        <a class="btn btn-sm" href="/programs">${t('common.seeAll')} ${icon('arrow', 'icon-sm')}</a>
      </div>
      <div class="grid-3" id="home-programs"></div>
    </section>

    <section class="grid-2" style="margin-top:28px" id="home-ctas"></section>
  `;

  const chipsEl = qs('#muscle-chips', root);
  const panelEl = qs('#muscle-panel', root);

  const renderChips = () => {
    chipsEl.innerHTML = MUSCLES.map(
      (m) => html`<button class="chip" type="button" data-muscle="${m}" aria-pressed="${String(m === selected)}">
        <span class="dot"></span>${t(`muscle.${m}`)}</button>`,
    ).join('');
  };

  const renderPanel = () => {
    if (!selected) {
      panelEl.innerHTML = html`<div class="empty" style="padding:22px 8px">${icon('target')}<p>${t('home.selectPrompt')}</p></div>`;
      return;
    }
    const name = t(`muscle.${selected}`);
    const top = exercises
      .filter((e) => e.primary.includes(selected!) && (!equipment || e.equipment === equipment))
      .sort((a, b) => a.primary.length - b.primary.length)
      .slice(0, 6);
    const allHref = `/exercises?muscle=${selected}${equipment ? `&equipment=${equipment}` : ''}`;
    panelEl.innerHTML = html`
      <div class="section-title">
        <h2>${t('home.selectedTitle', { muscle: name })}</h2>
      </div>
      ${top.length
        ? raw(`<div class="tiles">${top.map(exerciseTile).join('')}</div>`)
        : raw(html`<div class="empty" style="padding:18px 8px">${icon('dumbbell')}<p>${t('home.noneForEquipment', {
            muscle: name,
            equipment: equipment ? t(`equip.${equipment}`) : '',
          })}</p></div>`)}
      <div style="margin-top:14px">
        <a class="btn btn-sm" href="${allHref}">${t('home.seeAllFor', { muscle: name })} ${icon('arrow', 'icon-sm')}</a>
      </div>`;
  };

  const select = (m: Muscle, fromScene = false) => {
    selected = m;
    if (!fromScene) viewer?.setSelected(m);
    const url = new URL(location.href);
    url.searchParams.set('muscle', m);
    history.replaceState({}, '', url.pathname + url.search);
    renderChips();
    renderPanel();
    if (fromScene && window.matchMedia('(max-width: 980px)').matches) {
      panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  chipsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-muscle]');
    if (btn) select(btn.dataset.muscle as Muscle);
  });
  bindFavorites(root, (m) => toast(m), toastError);

  qs<HTMLSelectElement>('#home-equipment', root).addEventListener('change', (e) => {
    equipment = (e.target as HTMLSelectElement).value as Equipment | '';
    try {
      if (equipment) localStorage.setItem(EQUIP_KEY, equipment);
      else localStorage.removeItem(EQUIP_KEY);
    } catch {
      /* preference lasts for this visit only */
    }
    renderPanel();
  });
  qs<HTMLFormElement>('#home-search', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (qs<HTMLInputElement>('#home-q', root).value || '').trim();
    navigate(`/exercises${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  });

  renderChips();
  renderPanel();

  let viewer: BodyViewer | null = null;
  const bodyHost = qs('#body-host', root);
  const viewerPromise = mountBody(bodyHost, {
    onSelect: (m) => select(m, true),
    view: initial ? bestView(initial) : 'front',
  }).then((v) => {
    viewer = v;
    if (selected) v.setSelected(selected);
    return v;
  });

  try {
    [exercises, programs] = await Promise.all([api.exercises(), api.programs()]);
    if (store.user) stats = await api.stats().catch(() => null);
  } catch (err) {
    toastError(err);
  }

  qs('#hero-stats', root).innerHTML = html`
    <div><strong>${exercises.length || '—'}</strong><span>${t('home.statExercises')}</span></div>
    <div><strong>${programs.length || '—'}</strong><span>${t('home.statPrograms')}</span></div>
    <div><strong>${MUSCLES.length}</strong><span>${t('home.statMuscles')}</span></div>`;
  renderPanel();

  // One program per tier, matched to the athlete's level when signed in.
  const pick = ['beginner', 'intermediate', 'pro']
    .map((lvl) => programs.find((p) => p.level === lvl))
    .filter((p): p is ProgramSummary => !!p);
  qs('#home-programs', root).innerHTML = pick.map((p, i) => programCard(p, i * 70)).join('');

  const genCard = glass(
    html`<div class="stack" style="gap:14px">
      <span class="eyebrow">${icon('spark', 'icon-sm')} ${t('nav.generator')}</span>
      <h2>${t('home.genTitle')}</h2>
      <p class="text-2">${t('home.genLead')}</p>
      <div><a class="btn btn-primary" href="/generator">${icon('spark')} ${t('home.genCta')}</a></div>
    </div>`,
    { accent: true, beam: true, interactive: true },
  );
  const trackCard = stats
    ? glass(
        html`<div class="stack" style="gap:14px">
          <span class="eyebrow">${icon('activity', 'icon-sm')} ${t('home.weekTitle')}</span>
          <h2>${tn('home.weekSessions', stats.this_week)} · ${tn('home.weekStreak', stats.streak_weeks)}</h2>
          <div class="stat-tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <div class="panel stat"><span>${t('hist.sessions')}</span><strong>${formatNumber(stats.sessions)}</strong></div>
            <div class="panel stat"><span>${t('hist.volume')}</span><strong>${formatNumber(stats.total_volume_kg)}</strong><small>kg</small></div>
          </div>
          <div><a class="btn" href="/history">${t('home.progressCta')} ${icon('arrow', 'icon-sm')}</a></div>
        </div>`,
        { interactive: true, delay: 80 },
      )
    : glass(
        html`<div class="stack" style="gap:14px">
          <span class="eyebrow">${icon('activity', 'icon-sm')} ${t('nav.history')}</span>
          <h2>${t('home.trackTitle')}</h2>
          <p class="text-2">${t('home.trackLead')}</p>
          <div class="row">${store.user
            ? raw(html`<a class="btn" href="/history">${t('home.progressCta')}</a>`)
            : raw(html`<a class="btn" href="/register">${icon('user')} ${t('home.trackCta')}</a>`)}</div>
        </div>`,
        { interactive: true, delay: 80 },
      );
  qs('#home-ctas', root).innerHTML = genCard + trackCard;
  scanBeams(root);

  return () => {
    void viewerPromise.then((v) => v.dispose());
  };
};
