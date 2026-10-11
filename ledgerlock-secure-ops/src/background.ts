import Phaser from 'phaser';

/**
 * Keeps the game running when its tab or window is not in front, so Auto can play in the background.
 * Browsers stop animation frames and slow ordinary timers in hidden tabs, so a Web Worker (whose timers are not throttled)
 * supplies the clock: the game is stepped from it while hidden, and the interface's own timers use it too.
 */
type Job = { at: number; fn: () => void; every?: number };
const jobs = new Map<number, Job>();
let seq = 0, worker: Worker | null = null, lastStep = 0;
let stepper: ((now: number, delta: number) => void) | null = null;

function ensureWorker(): void {
  if (worker || typeof Worker === 'undefined') return;
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),100)'], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = () => pump();
  } catch { worker = null; }
}
function pump(): void {
  const now = performance.now();
  for (const [id, j] of [...jobs]) if (now >= j.at) { if (j.every) j.at = now + j.every; else jobs.delete(id); try { j.fn(); } catch (e) { console.error(e); } }
  if (document.hidden && stepper) {
    const gap = Math.min(now - (lastStep || now - 100), 4000);
    for (let n = Math.round(gap / 50); n > 0; n--) stepper(now, 50);
  }
  lastStep = now;
}

/** setTimeout that keeps its schedule in a hidden tab. */
export function bgTimeout(fn: () => void, ms: number): number { ensureWorker(); const id = ++seq; jobs.set(id, { at: performance.now() + ms, fn }); if (!worker) window.setTimeout(() => { if (jobs.delete(id)) fn(); }, ms); return id; }
export function bgClear(id: number): void { jobs.delete(id); }
/** setInterval that keeps its schedule in a hidden tab. */
export function bgInterval(fn: () => void, ms: number): number { ensureWorker(); const id = ++seq; jobs.set(id, { at: performance.now() + ms, fn, every: ms }); if (!worker) { const h = window.setInterval(() => { if (jobs.has(id)) fn(); else clearInterval(h); }, ms); } return id; }

/** Stop Phaser pausing itself when the window loses focus, and drive it from the worker while the tab is hidden. */
export function keepRunningInBackground(game: Phaser.Game): void {
  const ev = Phaser.Core.Events;
  game.events.off(ev.HIDDEN); game.events.off(ev.BLUR);
  stepper = (now, delta) => { if (!game.isRunning) return; game.step(now, delta); };
  ensureWorker();
  document.addEventListener('visibilitychange', () => { lastStep = performance.now(); });
}
