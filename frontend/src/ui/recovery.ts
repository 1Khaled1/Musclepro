/** Recovery map helpers: wording and the list shown next to the body. */
import { formatNumber, t } from '../i18n';
import { MUSCLES, type Muscle, type Recovery } from '../types';
import { html, raw } from './dom';

/** "fresh in about 20 h" / "fresh in about 2 days". */
export function readyIn(hours: number): string {
  if (hours <= 1) return t('rec.readySoon');
  if (hours < 36) return t('rec.readyHours', { h: formatNumber(hours) });
  return t('rec.readyDays', { d: formatNumber(Math.round(hours / 24)) });
}

/** Compact form for chips: "9 h", "2 d". */
export function readyInShort(hours: number): string {
  if (hours < 36) return t('rec.shortHours', { h: formatNumber(Math.max(1, hours)) });
  return t('rec.shortDays', { d: formatNumber(Math.round(hours / 24)) });
}

/** Muscles that are not fresh yet, most tired first. */
export const notFresh = (rec: Recovery): Muscle[] =>
  MUSCLES.filter((m) => rec[m] && rec[m].status !== 'fresh').sort((a, b) => rec[a].readiness - rec[b].readiness);

/** Body-map levels: the more tired, the brighter. */
export function fatigueLevels(rec: Recovery): Partial<Record<Muscle, number>> {
  const levels: Partial<Record<Muscle, number>> = {};
  for (const m of notFresh(rec)) levels[m] = Math.min(1, 0.25 + (100 - rec[m].readiness) / 100);
  return levels;
}

/** The same information as text: status, how recovered, and when it is fresh again. */
export function recoveryList(rec: Recovery): string {
  const list = notFresh(rec);
  if (!list.length) return html`<p class="rec-fresh">${t('rec.allFresh')}</p>`;
  return html`<ul class="rec-list">${raw(
    list
      .map(
        (m) => html`<li data-status="${rec[m].status}">
          <span class="rec-name">${t(`muscle.${m}`)}</span>
          <span class="rec-bar" aria-hidden="true"><i style="width:${rec[m].readiness}%"></i></span>
          <span class="rec-text"><strong>${t(`rec.status.${rec[m].status}`)}</strong> · ${t('rec.readiness', { n: formatNumber(rec[m].readiness) })} · ${readyIn(rec[m].ready_in_h)}</span>
        </li>`,
      )
      .join(''),
  )}</ul>`;
}
