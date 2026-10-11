import type { ContainmentCfg, Debrief, GoalDef, MissionApi, MissionDef, Recordable, Rule, ScoreInput } from './types';
import type { GameState } from '../../game/systems/GameState';
import type { EvidenceDef, MeetingAttendee, PassId, RoomId, ToolId, Tone } from '../../game/types';
import { PASSES } from '../passes';
import { propTarget } from '../targets';

type Gain = Partial<Record<'integrity' | 'protection' | 'recovery' | 'audit', number>>;
export interface Info { title: string; rows?: [string, string][]; body: string; compare?: { before: [string, string][]; after: [string, string][] } }
export interface ChoiceOption {
  id: string; label: string; detail: string; correct: boolean;
  /** Completes the step even though it is not the best choice (e.g. a broad but safe response). Default: same as `correct`. */
  completes?: boolean;
  result: string; gain?: Gain; hit?: number; hitSeconds?: number; flags?: string[];
}
export interface StepSpec {
  id: string; at: string | string[]; tool: ToolId | 'e';
  needs?: string[]; needsMsg?: string; needsPass?: PassId;
  evidence?: string;
  info?: Info | ((a: MissionApi) => Info);
  choice?: { title: string; body: string | ((a: MissionApi) => string); options: ChoiceOption[] };
  /** A Bronze meeting: service managers report (live, from the game state) and the team decides together. */
  meeting?: { title: string; body: string | ((a: MissionApi) => string); attendees: (a: MissionApi) => MeetingAttendee[]; options: (ChoiceOption & { backers?: string[] })[] };
  confirm?: { title: string; body: string; impacts: { label: string; text: string; tone: Tone }[]; confirmLabel?: string };
  say?: [string, string, Tone];
  fx?: 'scan' | 'sparkle' | 'repair';
  gain?: Gain;
  status?: [string, 'suspect' | 'bad' | 'ok' | 'fixed' | undefined][];
  mark?: [string, 'suspicious' | 'restored' | undefined][];
  effect?: (a: MissionApi) => void;
}
export type ScriptAction = ['pass', PassId] | ['step', string] | ['contain', string] | ['release', string] | ['wait', number] | ['record', string] | ['report'];
export interface ContainSpec { id: string; target: string; cfg: Omit<ContainmentCfg, 'onApply' | 'onRelease'>; releaseId?: string; canRelease?: (s: GameState) => true | string; scope: string }

export interface ScenarioSpec {
  id: string; title: string; tagline: string; difficulty: string; order: number; theme: string;
  pointsRoom: RoomId; incidentRoute: string;
  clock: [start: string, deadline: string, label: string]; parSeconds: number;
  alert: { severity: string; headline: string; symptoms: string[]; impact: string };
  briefing: string[];
  evidence: EvidenceDef[]; evidencePath: RoomId[];
  passes: { pass: PassId; when: (s: GameState) => boolean; hint: string }[];
  required?: PassId[];
  steps: StepSpec[];
  contain?: ContainSpec[];
  goals: GoalDef[];
  recordables?: Recordable[];
  setup?: (a: MissionApi) => void;
  tick?: (a: MissionApi, dt: number) => void;
  interactions?: MissionDef['interactions'];
  onRevoke?: MissionDef['onRevoke'];
  incidents?: (s: GameState) => number;
  narrow?: (s: GameState) => number;
  debrief: { what: string; learn: string; response?: (s: GameState) => string[]; nextStep: (s: GameState) => string };
  script: ScriptAction[];
}

const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const matches = (spec: string | string[], id: string) => (Array.isArray(spec) ? spec.includes(id) : spec === id);
export const st = (id: string) => (s: GameState) => !!s.flags['st_' + id];
export const goal = (id: string, kind: GoalDef['kind'], text: string, done: GoalDef['done'], hint?: string): GoalDef => ({ id, kind, text, done, hint });

/** Builds a playable mission from declarative steps on the same engine as the tutorial. */
export function makeScenario(sp: ScenarioSpec): MissionDef {
  const done = (s: GameState, id: string) => !!s.flags['st_' + id];
  const stepsFor = (target: string, tool: ToolId | 'e') => sp.steps.filter((x) => x.tool === tool && matches(x.at, target));

  function complete(a: MissionApi, step: StepSpec, target: string): void {
    if (step.evidence && !a.evidence(step.evidence)) return;
    a.flag('st_' + step.id);
    if (step.gain) for (const [k, v] of Object.entries(step.gain)) a.adjust(k as keyof Gain, v as number);
    for (const [t, st2] of step.status ?? []) a.status(t, st2);
    for (const [r, m] of step.mark ?? []) a.routeMark(r, m);
    step.effect?.(a);
    if (step.fx) a.fx(step.fx, target);
    if (step.say) a.say(step.say[0], step.say[1], step.say[2]);
  }
  function perform(a: MissionApi, step: StepSpec, target: string): void {
    if (step.evidence) {
      const ev = sp.evidence.find((e) => e.id === step.evidence);
      if (ev && !a.s.passes.has(ev.requiredPass)) { a.say('Access denied', `${ev.name} needs the ${PASSES[ev.requiredPass].name}.`, 'warn', { hint: true }); return; }
    }
    const info = typeof step.info === 'function' ? step.info(a) : step.info;
    if (step.meeting) {
      const c = step.meeting;
      a.dialog({
        type: 'meeting', title: c.title, body: typeof c.body === 'function' ? c.body(a) : c.body, attendees: c.attendees(a),
        options: c.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail, backers: o.backers })),
        onChoose: (id) => {
          const o = c.options.find((x) => x.id === id)!;
          if (o.gain) for (const [k, v] of Object.entries(o.gain)) a.adjust(k as keyof Gain, v as number, o.correct ? undefined : o.label);
          if (o.hit) a.hit('opt:' + step.id + id, o.hit, o.hitSeconds ?? 45);
          for (const f of o.flags ?? []) a.flag(f);
          if (o.completes ?? o.correct) { complete(a, step, target); a.say(o.correct ? 'Agreed at Bronze' : 'Agreed, with a cost', o.result, o.correct ? 'good' : 'warn'); }
          else { a.data.wrong = (a.data.wrong ?? 0) + 1; a.say('The Bronze team pushes back', o.result + ' You can raise it again.', 'warn', { hint: true }); }
        },
      });
      return;
    }
    if (step.choice) {
      const c = step.choice;
      a.dialog({
        type: 'choice', title: c.title, body: typeof c.body === 'function' ? c.body(a) : c.body,
        options: c.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
        onChoose: (id) => {
          const o = c.options.find((x) => x.id === id)!;
          if (o.gain) for (const [k, v] of Object.entries(o.gain)) a.adjust(k as keyof Gain, v as number, o.correct ? undefined : o.label);
          if (o.hit) a.hit('opt:' + step.id + id, o.hit, o.hitSeconds ?? 45);
          for (const f of o.flags ?? []) a.flag(f);
          if (o.completes ?? o.correct) { complete(a, step, target); a.say(o.correct ? 'Good call' : 'Done, with a cost', o.result, o.correct ? 'good' : 'warn'); }
          else { a.data.wrong = (a.data.wrong ?? 0) + 1; a.say('That works against you', o.result + ' You can try again.', 'warn', { hint: true }); }
        },
      });
      return;
    }
    if (info) a.dialog({ type: 'info', ...info });
    complete(a, step, target);
  }
  function dispatch(a: MissionApi, target: string, tool: ToolId | 'e'): void {
    const cands = stepsFor(target, tool);
    if (!cands.length) return;
    const okNeeds = (x: StepSpec) => (x.needs ?? []).every((n) => done(a.s, n)) && (!x.needsPass || a.s.passes.has(x.needsPass));
    const pick = cands.find((x) => !done(a.s, x.id) && okNeeds(x));
    if (!pick) {
      const blocked = cands.find((x) => !done(a.s, x.id));
      if (blocked) return a.say('Not just yet', blocked.needsMsg ?? 'Another step needs to happen first.', 'warn', { hint: true });
      if (target.endsWith('incident_wall')) return a.dialog({ type: 'alert' });
      if (target.endsWith('evidence_board')) return a.dialog({ type: 'board' });
      const last = cands[cands.length - 1], info = typeof last.info === 'function' ? last.info(a) : last.info;
      if (info) return a.dialog({ type: 'info', ...info });
      return a.say('Already done', 'This step is complete.', 'info');
    }
    if (pick.confirm) {
      const c = pick.confirm, tool2 = pick.tool;
      a.dialog({ type: 'confirm', title: c.title, body: c.body, why: tool2 === 'e' ? undefined : undefined, impacts: c.impacts, confirmLabel: c.confirmLabel ?? 'Go ahead', onConfirm: () => perform(a, pick, target) });
      return;
    }
    perform(a, pick, target);
  }

  const toolTargets = new Map<ToolId, Set<string>>();
  for (const x of sp.steps) if (x.tool !== 'e') { const set = toolTargets.get(x.tool) ?? new Set(); (Array.isArray(x.at) ? x.at : [x.at]).forEach((t) => set.add(t)); toolTargets.set(x.tool, set); }
  const rules: Rule[] = [...toolTargets.entries()].map(([tool, set]) => ({ tool, target: (id: string) => set.has(id), run: (a, t) => dispatch(a, t.id, tool) }));

  const interactions: NonNullable<MissionDef['interactions']> = {
    [propTarget('secure_ops', 'incident_wall')]: (a) => { a.flag('briefed'); a.dialog({ type: 'alert' }); },
    ...(sp.interactions ?? {}),
  };
  for (const x of sp.steps) if (x.tool === 'e') for (const t of Array.isArray(x.at) ? x.at : [x.at]) if (!interactions[t] || sp.interactions?.[t] === undefined) interactions[t] = (a, tt) => dispatch(a, tt.id, 'e');

  const containment: Record<string, ContainmentCfg> = {};
  for (const c of sp.contain ?? []) {
    containment[c.target] = {
      ...c.cfg,
      onApply: (a) => { a.data.scope ??= c.scope; a.flag('st_' + c.id); },
      onRelease: (a) => { if (c.releaseId) { a.flag('st_' + c.releaseId); } },
      canRelease: c.canRelease,
    };
  }

  const primary = sp.goals.filter((g) => g.kind === 'primary');
  const mission: MissionDef = {
    id: sp.id, title: sp.title, tagline: sp.tagline, status: 'playable', difficulty: sp.difficulty, order: sp.order, theme: sp.theme,
    startRoom: 'secure_ops', startClock: mins(sp.clock[0]), deadlineClock: mins(sp.clock[1]), deadlineLabel: sp.clock[2], parSeconds: sp.parSeconds,
    alert: { ...sp.alert, points: sp.pointsRoom }, briefing: sp.briefing,
    evidencePath: sp.evidencePath, evidence: sp.evidence, incidentRoute: sp.incidentRoute,
    passGrants: Object.fromEntries(sp.passes.map((p) => [p.pass, { when: p.when, hint: p.hint }])),
    requiredPasses: sp.required,
    rules, containment, interactions,
    goals: sp.goals, recordables: sp.recordables,
    objectives: (primary.length ? primary : sp.goals.filter((g) => g.kind === 'optional')).map((g) => ({ id: g.id, text: g.text, hint: g.hint ?? 'Follow the evidence.', done: g.done })),
    setup: (a) => { sp.setup?.(a); },
    tick: sp.tick,
    onRevoke: sp.onRevoke,
    canReport: (s) => { const missing = primary.find((g) => !g.done(s)); return missing ? `Primary objective outstanding: ${missing.text}` : true; },
    isComplete: (s) => !!s.flags.reported,
    incidents: sp.incidents ?? ((s) => (primary.every((g) => g.done(s)) ? 0 : 1)),
    scoreInput: (s): ScoreInput => ({
      diagnosed: s.evidence.size > 0, verified: primary.every((g) => g.done(s)), reconciled: !!s.flags.reconciledAll || primary.every((g) => g.done(s)),
      narrow: sp.narrow ? sp.narrow(s) : (((s.data.containments ?? []) as { narrow: number }[]).length ? Math.min(...(s.data.containments as { narrow: number }[]).map((c) => c.narrow)) : 0.6),
      privacyOk: s.stats.unnecessary === 0 && s.stats.passDenials <= 1 && !s.flags.unmasked,
    }),
    debrief: (s): Debrief => ({ what: sp.debrief.what, response: sp.debrief.response ? sp.debrief.response(s) : ['You worked through the evidence in order, using only read-only, masked access.'], learn: sp.debrief.learn }),
    nextStep: sp.debrief.nextStep,
    bestChoice: Object.fromEntries(sp.steps.filter((x) => x.choice || x.meeting).map((x) => { const c = (x.choice ?? x.meeting)!; return [c.title, (c.options.find((o) => o.correct) ?? c.options[0]).id]; })),
  };
  (mission as MissionDef & { script: ScriptAction[]; spec: ScenarioSpec }).script = sp.script;
  (mission as MissionDef & { spec: ScenarioSpec }).spec = sp;
  return mission;
}
export type ScenarioMission = MissionDef & { script: ScriptAction[]; spec: ScenarioSpec };
export { propTarget };
