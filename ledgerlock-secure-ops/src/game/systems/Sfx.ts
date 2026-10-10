import { settings } from './Settings';

/** Tiny synthesised sound effects (no audio files, nothing plays until the player has interacted). */
let ctx: AudioContext | null = null;
function ensure(): AudioContext | null {
  if (settings.data.muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.05, when = 0): void {
  const c = ensure(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + when;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  click: () => tone(520, 0.06, 'triangle'),
  scan: () => { tone(660, 0.12, 'sine'); tone(990, 0.16, 'sine', 0.04, 0.1); },
  good: () => { tone(523, 0.1, 'triangle'); tone(784, 0.16, 'triangle', 0.05, 0.09); },
  warn: () => tone(330, 0.2, 'square', 0.03),
  bad: () => { tone(180, 0.25, 'sawtooth', 0.04); tone(140, 0.3, 'sawtooth', 0.04, 0.15); },
  pass: () => { tone(600, 0.08, 'triangle'); tone(900, 0.12, 'triangle', 0.05, 0.08); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.05, i * 0.1)),
};
