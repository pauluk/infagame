/**
 * Small pointer-based drag and drop (mouse, pen and touch). It never replaces the other ways to do the same thing: every
 * draggable thing in the game also works by "pick up, then choose where" with the keyboard or with two taps.
 */
export interface DragSpec {
  /** Which elements start a drag (matched with closest() from the pointerdown target). */
  handle: string;
  /** Where things can be dropped. */
  drop: string;
  /** Called at the start with the handle element; return false to refuse. */
  start?(h: HTMLElement): boolean | void;
  /** Called on drop with the handle and the drop element (null when dropped on nothing). */
  end(h: HTMLElement, target: HTMLElement | null): void;
  /** Draw a line from the handle to the pointer instead of a floating copy (cables). */
  line?: boolean;
}

const THRESHOLD = 7;

export function enableDrag(root: HTMLElement, spec: DragSpec): void {
  let s: { h: HTMLElement; x: number; y: number; drag: boolean; ghost?: HTMLElement; id: number; hover?: HTMLElement | null; line?: SVGSVGElement } | null = null;
  const clear = () => { s?.ghost?.remove(); s?.line?.remove(); s?.hover?.classList.remove('drop-hover'); root.querySelectorAll('.drop-ok').forEach((e) => e.classList.remove('drop-ok')); document.body.classList.remove('dragging'); s = null; };
  const under = (x: number, y: number): HTMLElement | null => {
    for (const e of document.elementsFromPoint(x, y)) { const t = (e as HTMLElement).closest?.(spec.drop) as HTMLElement | null; if (t && root.contains(t)) return t; }
    return null;
  };
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const h = (e.target as HTMLElement).closest(spec.handle) as HTMLElement | null;
    if (!h || !root.contains(h) || (h as HTMLButtonElement).disabled) return;
    s = { h, x: e.clientX, y: e.clientY, drag: false, id: e.pointerId };
  });
  root.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (!s.drag) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD) return;
      if (spec.start?.(s.h) === false) { s = null; return; }
      s.drag = true; document.body.classList.add('dragging');
      try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      root.querySelectorAll(spec.drop).forEach((d) => d.classList.add('drop-ok'));
      if (spec.line) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'drag-line'); svg.innerHTML = '<line stroke="#9DE3B1" stroke-width="4" stroke-dasharray="6 5" stroke-linecap="round"/>';
        document.body.appendChild(svg); s.line = svg;
      } else {
        const g = s.h.cloneNode(true) as HTMLElement; g.classList.add('drag-ghost'); g.style.width = s.h.getBoundingClientRect().width + 'px'; document.body.appendChild(g); s.ghost = g;
      }
    }
    if (s.ghost) { s.ghost.style.left = e.clientX - 20 + 'px'; s.ghost.style.top = e.clientY - 20 + 'px'; }
    if (s.line) { const r = s.h.getBoundingClientRect(), ln = s.line.firstChild as SVGLineElement; ln.setAttribute('x1', String(r.left + r.width)); ln.setAttribute('y1', String(r.top + r.height / 2)); ln.setAttribute('x2', String(e.clientX)); ln.setAttribute('y2', String(e.clientY)); }
    const t = under(e.clientX, e.clientY);
    if (t !== s.hover) { s.hover?.classList.remove('drop-hover'); t?.classList.add('drop-hover'); s.hover = t; }
    e.preventDefault();
  });
  const finish = (e: PointerEvent, cancel: boolean) => {
    if (!s || e.pointerId !== s.id) return;
    const wasDrag = s.drag, h = s.h, t = wasDrag && !cancel ? under(e.clientX, e.clientY) : null;
    try { root.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    clear();
    if (wasDrag) {
      // swallow the click that follows a drag so it does not also "pick up"
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); root.removeEventListener('click', stop, true); };
      root.addEventListener('click', stop, true); setTimeout(() => root.removeEventListener('click', stop, true), 60);
      if (!cancel) spec.end(h, t);
    }
  };
  root.addEventListener('pointerup', (e) => finish(e, false));
  root.addEventListener('pointercancel', (e) => finish(e, true));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && s?.drag) { clear(); } });
}
