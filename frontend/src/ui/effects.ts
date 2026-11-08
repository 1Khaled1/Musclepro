/** Glass interaction layer: cursor spotlight + travelling-beam geometry.
 *  One delegated listener / one shared observer for the whole document. */

export function initSpotlight(): void {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let pending: { card: HTMLElement; x: number; y: number } | null = null;

  const flush = () => {
    if (!pending) return;
    const { card, x, y } = pending;
    pending = null;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${(((x - r.left) / r.width) * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(((y - r.top) / r.height) * 100).toFixed(1)}%`);
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>('.sg-card');
      if (!card) return;
      const schedule = !pending;
      pending = { card, x: e.clientX, y: e.clientY };
      if (schedule) requestAnimationFrame(flush);
    },
    { passive: true },
  );

  document.addEventListener(
    'pointerout',
    (e) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>('.sg-card');
      if (!card || card.contains(e.relatedTarget as Node | null)) return;
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '0%');
    },
    { passive: true },
  );
}

const beamObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const svg = entry.target.querySelector<SVGSVGElement>(':scope > .sg-beam');
    if (svg) syncBeam(svg);
  }
});

function syncBeam(svg: SVGSVGElement): void {
  const card = svg.parentElement;
  if (!card) return;
  const w = card.clientWidth;
  const h = card.clientHeight;
  if (!w || !h) return;
  const inset = 1;
  const wanted = Number(getComputedStyle(card).getPropertyValue('--sg-radius').replace('px', '')) || 24;
  const radius = Math.max(0, Math.min(wanted - inset, Math.min(w, h) / 2 - inset));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.querySelectorAll('rect').forEach((rect) => {
    rect.setAttribute('x', String(inset));
    rect.setAttribute('y', String(inset));
    rect.setAttribute('width', String(Math.max(0, w - inset * 2)));
    rect.setAttribute('height', String(Math.max(0, h - inset * 2)));
    rect.setAttribute('rx', String(radius));
  });
}

/** Call after rendering markup that may contain beams. */
export function scanBeams(root: ParentNode = document): void {
  root.querySelectorAll<SVGSVGElement>('.sg-beam').forEach((svg) => {
    if (svg.dataset.beamReady) return;
    svg.dataset.beamReady = '1';
    syncBeam(svg);
    if (svg.parentElement) beamObserver.observe(svg.parentElement);
  });
}
