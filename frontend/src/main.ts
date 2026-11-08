import '@fontsource-variable/manrope';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/views.css';

import { fallback, route, startRouter } from './router';
import { store } from './store';
import { initSpotlight } from './ui/effects';
import { mountShell } from './ui/shell';

// Views are code-split: each page (and Three.js) loads on first visit.
route('/', 'home', () => import('./views/home').then((m) => m.homeView));
route('/exercises', 'exercises', () => import('./views/exercises').then((m) => m.exercisesView));
route('/exercises/:id', 'exercise', () => import('./views/exercise').then((m) => m.exerciseView));
route('/programs', 'programs', () => import('./views/programs').then((m) => m.programsView));
route('/programs/:id', 'program', () => import('./views/program').then((m) => m.programView));
route('/generator', 'generator', () => import('./views/generator').then((m) => m.generatorView));
route('/workout', 'workout', () => import('./views/workout').then((m) => m.workoutView));
route('/history', 'history', () => import('./views/history').then((m) => m.historyView));
route('/login', 'login', () => import('./views/auth').then((m) => m.loginView));
route('/register', 'register', () => import('./views/auth').then((m) => m.registerView));
route('/profile', 'profile', () => import('./views/profile').then((m) => m.profileView));
route('/admin', 'admin', () => import('./views/admin').then((m) => m.adminView));
fallback(() => import('./views/notfound').then((m) => m.notFoundView));

document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('[data-reload]')) location.reload();
});

async function boot(): Promise<void> {
  await store.init(); // resolve the session before the first render
  const main = mountShell(document.getElementById('app')!);
  initSpotlight();
  startRouter(main);
}

void boot();
