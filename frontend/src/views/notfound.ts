import { t } from '../i18n';
import type { View } from '../router';
import { glass, html } from '../ui/dom';
import { icon } from '../ui/icons';

export const notFoundView: View = (root) => {
  root.innerHTML = glass(html`<div class="nf">
    <span class="code">404</span>
    <h1 style="font-size:1.8rem">${t('nf.title')}</h1>
    <p class="text-2">${t('nf.lead')}</p>
    <a class="btn btn-primary" href="/">${icon('body')} ${t('nf.home')}</a>
  </div>`);
};
