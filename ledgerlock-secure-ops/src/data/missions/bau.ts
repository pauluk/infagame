import { goal, makeScenario, st, type ScenarioMission, type ScriptAction, type StepSpec } from './scenario';
import { propTarget } from '../targets';
import type { PassId, RoomId } from '../../game/types';

/**
 * Business-as-usual missions: no outage, no attacker. A routine shift of checks where the skill is noticing the small thing that is
 * off, choosing the proportionate response and keeping the records. Each is built from a short list of checks.
 */
export interface Check {
  id: string; room: RoomId; prop: string; pass: PassId; title: string; evidence: string; sens: string;
  rows: [string, string][]; body: string;
  /** A routine check can hide one thing that needs a decision. */
  decide?: { title: string; body: string; options: { id: string; label: string; detail: string; correct: boolean; result: string; gain?: Partial<Record<'integrity' | 'protection' | 'recovery' | 'audit', number>> }[] };
  gain?: Partial<Record<'integrity' | 'protection' | 'recovery' | 'audit', number>>;
  goal: string;
}
export interface BauSpec {
  id: string; order: number; title: string; tagline: string; theme: string; difficulty?: string;
  clock: [string, string, string]; parSeconds: number; points: RoomId; route: string;
  alert: { headline: string; symptoms: string[]; impact: string };
  briefing: string[]; checks: Check[]; log: string;
  debrief: { what: string; learn: string; next: string };
}

export function makeBau(b: BauSpec): ScenarioMission {
  const T = (c: Check) => propTarget(c.room, c.prop);
  const steps: StepSpec[] = b.checks.map((c, i) => {
    const base: StepSpec = { id: c.id, at: T(c), tool: 'e', evidence: 'ev_' + c.id, gain: { audit: 2, ...c.gain }, needs: i ? [b.checks[i - 1].id] : undefined, needsMsg: i ? 'Work the checklist in order: finish the previous check first.' : undefined };
    if (c.decide) return { ...base, choice: { title: c.decide.title, body: c.decide.body, options: c.decide.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail, correct: o.correct, result: o.result, gain: o.gain ?? (o.correct ? { audit: 3 } : { audit: -3 }) })) } };
    return { ...base, info: { title: c.title, rows: c.rows, body: c.body } };
  });
  // a check with a decision still shows its readings first
  const withReadings: StepSpec[] = steps.map((s, i) => (b.checks[i].decide ? { ...s, info: undefined } : s));
  const firstPassStep = new Map<PassId, string>();
  b.checks.forEach((c) => { if (!firstPassStep.has(c.pass)) firstPassStep.set(c.pass, c.id); });
  const passes = [...firstPassStep.entries()].map(([pass, id], k) => {
    const idx = b.checks.findIndex((c) => c.id === id);
    return { pass, when: idx === 0 ? (s: import('../../game/systems/GameState').GameState) => !!s.flags.briefed : st(b.checks[idx - 1].id), hint: idx === 0 ? 'Read the Incident Wall first: it lists today\'s checks.' : `Finish the previous check first (${b.checks[idx - 1].title}); then this room is next on the list.` + (k < 0 ? '' : '') };
  });
  const script: ScriptAction[] = [];
  const seen = new Set<PassId>();
  for (const c of b.checks) { if (!seen.has(c.pass)) { seen.add(c.pass); script.push(['pass', c.pass]); } script.push(['step', c.id]); }
  script.push(['record', 'bau_log'], ['report']);
  const m = makeScenario({
    id: b.id, order: b.order, title: b.title, tagline: b.tagline, difficulty: b.difficulty ?? 'Easy', theme: b.theme,
    pointsRoom: b.points, incidentRoute: b.route, clock: b.clock, parSeconds: b.parSeconds,
    alert: { severity: 'Routine', headline: b.alert.headline, symptoms: b.alert.symptoms, impact: b.alert.impact },
    briefing: ['This is a business-as-usual shift (everything is synthetic): nothing is on fire. The skill is working a checklist carefully, noticing the small thing that is off and choosing a proportionate response.', ...b.briefing],
    evidence: b.checks.map((c) => ({ id: 'ev_' + c.id, name: c.title, sourceRoom: c.room, requiredPass: c.pass, sensitivity: c.sens, objective: 'p' + (b.checks.indexOf(c) + 1), pathStep: c.room })),
    evidencePath: b.checks.map((c) => c.room).filter((r, i, a) => a.indexOf(r) === i),
    passes, required: [...firstPassStep.keys()],
    steps: withReadings.map((s, i) => (b.checks[i].decide ? { ...s, choice: { ...s.choice!, body: `${b.checks[i].rows.map(([k, v]) => `${k}: ${v}`).join('. ')}. ${s.choice!.body}` } } : s)),
    goals: [
      ...b.checks.map((c, i) => goal('p' + (i + 1), 'primary', c.goal, st(c.id), `Press E at the ${c.prop.replace(/_/g, ' ')} in ${c.room.replace(/_/g, ' ')}.`)),
      goal('o1', 'optional', 'Make every judgement call correctly first time', (s) => (s.data.wrong ?? 0) === 0),
      goal('o2', 'optional', 'Record the shift log', (s) => !!s.flags.rec_bau_log),
      goal('o3', 'optional', 'Finish with time to spare', (s) => s.deadlineLeft > 10),
      goal('s1', 'stretch', 'No hints and no unjustified pass requests', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    ],
    recordables: [{ id: 'bau_log', label: b.log, when: (s) => b.checks.every((c) => !!s.flags['st_' + c.id]) }],
    incidents: () => 0,
    narrow: () => 1,
    debrief: { what: b.debrief.what, learn: b.debrief.learn, nextStep: () => b.debrief.next, response: (s) => [`${b.checks.filter((c) => s.flags['st_' + c.id]).length} of ${b.checks.length} checks completed.`, (s.data.wrong ?? 0) === 0 ? 'Every judgement call was proportionate.' : `${s.data.wrong} judgement call(s) needed a second try.`] },
    script,
  });
  return m as ScenarioMission;
}
