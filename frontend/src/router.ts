/** Minimal history-API router. Flask serves index.html for every non-API
 *  path, so deep links and reloads work on Render. */

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  path: string;
}

/** A view renders into `root` and may return a cleanup function. */
export type View = (root: HTMLElement, ctx: RouteContext) => Promise<void | (() => void)> | void | (() => void);

interface Route {
  pattern: RegExp;
  keys: string[];
  load: () => Promise<View>;
  name: string;
}

const routes: Route[] = [];
let notFound: (() => Promise<View>) | null = null;
let outlet: HTMLElement;
let cleanup: (() => void) | null = null;
let renderToken = 0;
const navListeners = new Set<(path: string, name: string) => void>();

export function route(path: string, name: string, load: () => Promise<View>): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/\/:([a-z_]+)/gi, (_, key) => {
        keys.push(key);
        return '/([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ pattern, keys, load, name });
}

export function fallback(load: () => Promise<View>): void {
  notFound = load;
}

export function onNavigate(fn: (path: string, name: string) => void): void {
  navListeners.add(fn);
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) {
    location.href = to;
    return;
  }
  const target = url.pathname + url.search + url.hash;
  if (opts.replace) history.replaceState({}, '', target);
  else if (target !== location.pathname + location.search + location.hash) history.pushState({}, '', target);
  void render();
}

/** Re-render the current view (e.g. after a language change). */
export function refresh(): void {
  void render({ keepScroll: true });
}

async function render(opts: { keepScroll?: boolean } = {}): Promise<void> {
  const token = ++renderToken;
  const path = decodeURI(location.pathname);
  const query = new URLSearchParams(location.search);
  let matched: Route | undefined;
  let params: Record<string, string> = {};
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (m) {
      matched = r;
      params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      break;
    }
  }
  const view = await (matched ? matched.load() : notFound!());
  if (token !== renderToken) return; // a newer navigation won

  cleanup?.();
  cleanup = null;
  const scrollY = window.scrollY;
  outlet.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page';
  outlet.append(page);
  navListeners.forEach((fn) => fn(path, matched?.name ?? 'notfound'));

  const result = await view(page, { params, query, path });
  if (token !== renderToken) {
    if (typeof result === 'function') result();
    return;
  }
  if (typeof result === 'function') cleanup = result;
  if (opts.keepScroll) window.scrollTo(0, scrollY);
  else if (!location.hash) window.scrollTo(0, 0);
}

export function startRouter(root: HTMLElement): void {
  outlet = root;
  window.addEventListener('popstate', () => void render());
  // Intercept same-origin <a> clicks for client-side navigation.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
    e.preventDefault();
    navigate(href);
  });
  void render();
}
