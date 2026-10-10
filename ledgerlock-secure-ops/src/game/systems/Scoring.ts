import type { GameState } from './GameState';

export interface ScorePart { label: string; points: number; max: number; note: string }
export interface ScoreResult { total: number; parts: ScorePart[]; rating: string; message: string }

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 0-100: 35 integrity, 25 availability, 20 diagnosis & verification, 10 privacy & containment, 10 time. */
export function computeScore(s: GameState): ScoreResult {
  const inp = s.mission.scoreInput(s);
  const integrity = 35 * (s.integrity / 100);
  const avg = s.stats.availTime > 0 ? s.stats.availSum / s.stats.availTime : 100;
  const availability = 25 * clamp((avg - 50) / 50);
  const diag = (inp.diagnosed ? 6 : 0) + (inp.reconciled ? 6 : 0) + (inp.verified ? 8 : 0);
  const privacy = 6 * inp.narrow + (inp.privacyOk ? 4 : s.stats.unnecessary === 0 ? 2 : 0);
  const over = s.elapsed - s.mission.parSeconds;
  const time = over <= 0 ? 10 : 10 - 7 * clamp(over / (s.mission.parSeconds * 1.5));      // slow but safe still earns 3/10
  const parts: ScorePart[] = [
    { label: 'Transaction integrity restored', points: r1(integrity), max: 35, note: `Final integrity ${s.integrity}%` },
    { label: 'Valid service kept available', points: r1(availability), max: 25, note: `Average availability ${Math.round(avg)}% (lowest ${s.stats.minAvail}%)` },
    { label: 'Diagnosis and verification', points: r1(diag), max: 20, note: `${inp.diagnosed ? 'Diagnosed. ' : ''}${inp.reconciled ? 'Reconciled. ' : ''}${inp.verified ? 'Verified in reporting.' : ''}` },
    { label: 'Privacy and containment', points: r1(privacy), max: 10, note: inp.narrow >= 0.95 ? 'Narrowest safe containment' : inp.narrow > 0 ? 'Contained, but wider than needed' : 'No effective containment' },
    { label: 'Time taken', points: r1(time), max: 10, note: `${Math.round(s.elapsed / 60 * 10) / 10} min (par ${Math.round(s.mission.parSeconds / 60)} min)` },
  ];
  const total = Math.round(parts.reduce((a, p) => a + p.points, 0));
  const rating = total >= 90 ? 'Gold: narrowest safe fix' : total >= 75 ? 'Silver: safe and verified' : total >= 55 ? 'Bronze: resolved with some disruption' : 'Resolved: safe, verified outcome';
  const message = total >= 75 ? 'Careful, narrow and verified. That is the job.' : 'The incident is resolved and verified. Next time, try a narrower containment and fewer detours.';
  return { total, parts, rating, message };
}
