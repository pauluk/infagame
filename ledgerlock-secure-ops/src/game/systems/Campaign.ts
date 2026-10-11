import type { GameState } from './GameState';
import { MEASURE_KEYS, measuresOf, overallConfidence, type Measures } from './Confidence';
import { computeScore } from './Scoring';
import type { MissionDef } from '../../data/missions/types';

export interface BadgeDef { id: string; name: string; icon: string; text: string }
export const BADGES: BadgeDef[] = [
  { id: 'precision', name: 'Precision Over Panic', icon: '◎', text: 'Contain only the affected route.' },
  { id: 'least_privilege', name: 'Least Privilege', icon: '⛨', text: 'Use no unnecessary access passes.' },
  { id: 'no_lost_events', name: 'No Lost Events', icon: '⚓', text: 'Resolve a backlog without dropping valid events.' },
  { id: 'ledger_listener', name: 'Ledger Listener', icon: '⚖', text: 'Reconcile all totals before closing an incident.' },
  { id: 'clean_restore', name: 'Clean Restore', icon: '↺', text: 'Verify a recovery point before restoring.' },
  { id: 'good_evidence', name: 'Good Evidence', icon: '☰', text: 'Complete a mission with a clear evidence trail.' },
];

export interface MissionRecord {
  completed: boolean; plays: number; best: number;
  primary: string[]; optional: string[]; stretch: string[];
  evidence: string[]; badges: string[]; confidence: number;
}
export interface CampaignData {
  version: 1;
  missions: Record<string, MissionRecord>;
  measures: Measures;                 // running campaign measures (blend of mission results)
  badges: string[];
  side: string[];                     // completed side tasks (ids)
  unlockedAll: boolean;
}
const KEY = 'ledgerlock.campaign.v1';
const BASE: Measures = { integrity: 70, availability: 70, protection: 70, recovery: 70, audit: 70 };
const fresh = (): CampaignData => ({ version: 1, missions: {}, measures: { ...BASE }, badges: [], side: [], unlockedAll: false });

/** Campaign progress lives only in this browser's localStorage. It never stores finance data or credentials (all of it is synthetic). */
/** First mission of the business-continuity track (orders 9 to 11). */
export const BCP_FIRST = 9;
/** First mission of the cyber track (orders 12 to 14), also open after the tutorial. */
export const CYBER_FIRST = 12;
/** The two Blue Lantern payment-continuity missions (orders 15 and 16) also open after the tutorial. */
export const BLUE_FIRST = 15;
export class Campaign {
  data: CampaignData = fresh();
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = typeof localStorage !== 'undefined' ? safeStorage() : null) { this.load(); }

  load(): void {
    try { const raw = this.storage?.getItem(KEY); if (raw) { const d = JSON.parse(raw) as CampaignData; if (d?.version === 1) this.data = { ...fresh(), ...d }; } } catch { this.data = fresh(); }
  }
  save(): void { try { this.storage?.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ } }
  reset(): void { this.data = fresh(); try { this.storage?.removeItem(KEY); } catch { /* ignore */ } }

  isCompleted(id: string) { return !!this.data.missions[id]?.completed; }
  /** Campaign missions unlock in order; the side-task hub unlocks with the tutorial. */
  /** Every mission is open from the start and can be played in any order. */
  isUnlocked(_m: MissionDef, _all: MissionDef[]): boolean { return true; }
  unlockAll() { this.data.unlockedAll = true; this.save(); }
  overall(): number { return overallConfidence(this.data.measures); }
  priorEvidence(excludeId: string): string[] {
    return Object.entries(this.data.missions).filter(([id, r]) => id !== excludeId && r.completed).flatMap(([, r]) => r.evidence);
  }

  /** Called when a mission is completed. Returns the data the debrief needs. */
  recordResult(s: GameState): MissionOutcome {
    const m = s.mission;
    const before = { ...this.data.measures };
    const final = measuresOf(s, true);
    const goals = { primary: [] as string[], optional: [] as string[], stretch: [] as string[] };
    for (const g of m.goals) if (g.done(s) && !((s.tutorial || s.stats.autoActions > 0) && g.kind === 'stretch')) goals[g.kind].push(g.id);   // stretch goals are earned by hand: not in Tutorial mode or when Auto did any of the work
    const score = computeScore(s);
    const badges = evaluateBadges(s);
    const prev = this.data.missions[m.id];
    const newBadges = badges.filter((b) => !this.data.badges.includes(b));
    const rec: MissionRecord = {
      completed: true, plays: (prev?.plays ?? 0) + 1, best: Math.max(prev?.best ?? 0, score.total),
      primary: union(prev?.primary, goals.primary), optional: union(prev?.optional, goals.optional), stretch: union(prev?.stretch, goals.stretch),
      evidence: union(prev?.evidence, [...s.evidence]), badges: union(prev?.badges, badges), confidence: Math.max(prev?.confidence ?? 0, overallConfidence(final)),
    };
    this.data.missions[m.id] = rec;
    if (m.order === 0) for (const g of m.goals) if (g.done(s)) this.recordSide(g.id);
    this.data.badges = union(this.data.badges, badges);
    for (const k of MEASURE_KEYS) this.data.measures[k] = Math.round(before[k] * 0.4 + final[k] * 0.6);   // campaign measures move towards this mission's result
    this.save();
    return { before, after: { ...this.data.measures }, final, goals, score, badges, newBadges };
  }
  recordSide(id: string): void { if (!this.data.side.includes(id)) { this.data.side.push(id); this.save(); } }
}

export interface MissionOutcome {
  before: Measures; after: Measures; final: Measures;
  goals: { primary: string[]; optional: string[]; stretch: string[] };
  score: ReturnType<typeof computeScore>; badges: string[]; newBadges: string[];
}
const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

function safeStorage(): Storage | null { try { const k = '__ll'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { return null; } }

/** Good-habit badges, evaluated from what actually happened in the mission. */
export function evaluateBadges(s: GameState): string[] {
  const out: string[] = [];
  const cont = (s.data.containments ?? []) as { narrow: number }[];
  if (cont.length && cont.every((c) => c.narrow >= 0.95) && s.stats.unnecessary === 0) out.push('precision');
  const need = new Set(s.mission.requiredPasses ?? []);
  const granted = [...s.passes].filter((p) => p !== 'ops_pass' && p !== 'token_rotation_pass');
  if (granted.length > 0 && granted.every((p) => need.has(p)) && s.stats.passDenials <= 1) out.push('least_privilege');
  if (s.flags.noLostEvents) out.push('no_lost_events');
  if (s.flags.reconciledAll) out.push('ledger_listener');
  if (s.flags.verifiedPoint && s.flags.restored) out.push('clean_restore');
  const allEv = s.mission.evidence.length > 0 && s.mission.evidence.every((e) => s.evidence.has(e.id));
  if (allEv && s.audit >= 80 && s.flags.reported) out.push('good_evidence');
  return out;
}

export const campaign = new Campaign();
