import type { GameState } from './GameState';

export interface Measures { integrity: number; availability: number; protection: number; recovery: number; audit: number }
export const MEASURE_KEYS = ['integrity', 'availability', 'protection', 'recovery', 'audit'] as const;
export const MEASURE_LABEL: Record<keyof Measures, { name: string; icon: string; what: string }> = {
  integrity: { name: 'Transaction integrity', icon: '⚖', what: 'Correct totals, no duplicate or missing simulated transactions' },
  availability: { name: 'Service availability', icon: '⚡', what: 'Keeping legitimate finance services running' },
  protection: { name: 'Data protection', icon: '⛨', what: 'Masked data and only the access needed' },
  recovery: { name: 'Recovery readiness', icon: '↺', what: 'Safe restore, rollback and recovery verification' },
  audit: { name: 'Audit quality', icon: '☰', what: 'Clear evidence, recorded actions and a verified outcome' },
};
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Current (or, with `final`, time-averaged availability) measures for a mission. */
export function measuresOf(s: GameState, final = false): Measures {
  const avg = s.stats.availTime > 0 ? s.stats.availSum / s.stats.availTime : 100;
  return { integrity: clamp(s.integrity), availability: clamp(final ? avg : s.availability), protection: clamp(s.protection), recovery: clamp(s.recovery), audit: clamp(s.audit) };
}

/**
 * Service Confidence rewards balance: the mean is pulled down by the weakest measure, so shutting everything down
 * (low availability) or releasing everything unchecked (low integrity) both score poorly.
 */
export function overallConfidence(m: Measures): number {
  const v = MEASURE_KEYS.map((k) => m[k]);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return clamp(0.6 * mean + 0.4 * Math.min(...v));
}
export const confidenceWord = (n: number) => (n >= 90 ? 'Excellent' : n >= 75 ? 'Good' : n >= 60 ? 'Fair' : 'At risk');
