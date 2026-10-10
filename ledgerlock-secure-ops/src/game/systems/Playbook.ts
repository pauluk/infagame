import type { MissionDef } from '../../data/missions/types';
import type { ScenarioMission } from '../../data/missions/scenario';
import { PASSES } from '../../data/passes';
import { TOOL_BY_ID } from '../../data/tools';
import { describeTarget, propTarget, roomTarget, routeTarget } from '../../data/targets';
import type { PassId, ToolId } from '../types';
import type { GameState } from './GameState';
import { accessFor } from './Reach';

/**
 * A mission "playbook": the best-practice path through a mission as a list of actions. Teammates and Auto-play work through it.
 * It only ever uses the same tools, passes and interactions a player has, so it earns exactly what a careful player would.
 */
export type Role = 'investigator' | 'containment' | 'records';
export const ROLE_LABEL: Record<Role, string> = { investigator: 'Investigator', containment: 'Containment engineer', records: 'Records and access' };

export interface PlayAction {
  id: string; label: string; role: Role;
  kind: 'use' | 'pass' | 'contain' | 'release' | 'reroute' | 'record' | 'report' | 'wait';
  target?: string; tool?: ToolId | 'e'; pass?: PassId; recordId?: string; seconds?: number;
  /** Actions that must be done first. */
  after: string[];
  done(s: GameState): boolean;
  /** true when the action can be attempted now, otherwise a short reason. */
  ready(s: GameState): true | string;
}

const DESK = propTarget('secure_ops', 'access_desk');
const nameOf = (t?: string) => (t ? describeTarget(t)?.name ?? t : '');
const MISSING = (p: PassId) => `needs the ${PASSES[p].name}`;

function roleFor(kind: PlayAction['kind'], tool?: ToolId | 'e'): Role {
  if (kind === 'pass' || kind === 'record' || kind === 'report' || kind === 'wait' || tool === 'recon') return 'records';
  if (kind === 'contain' || kind === 'release' || kind === 'reroute' || tool === 'patch' || tool === 'restore' || tool === 'token' || tool === 'quarantine') return 'containment';
  return 'investigator';
}
const labelUse = (tool: ToolId | 'e', target: string) => (tool === 'e' ? `Inspect ${nameOf(target)}` : `${TOOL_BY_ID[tool].name} on ${nameOf(target)}`);

function passAction(m: MissionDef, id: string, pass: PassId, after: string[] = []): PlayAction {
  return {
    id, label: `Request the ${PASSES[pass].name}`, role: 'records', kind: 'pass', target: DESK, pass, after,
    done: (s) => s.passes.has(pass) || !!s.flags['granted_' + pass],
    ready: (s) => (m.passGrants[pass]?.when(s) ? true : 'no clue points at that room yet'),
  };
}

function compileScenario(m: ScenarioMission): PlayAction[] {
  const sp = m.spec, out: PlayAction[] = [];
  const BARRIER = new Set<PlayAction['kind']>(['contain', 'release', 'wait', 'report']);
  let lastBarrier: string | null = null;
  const everyPrev = () => out.map((a) => a.id);
  const push = (a: PlayAction) => {
    const barrier = BARRIER.has(a.kind);
    a.after = [...a.after, ...(barrier ? everyPrev() : lastBarrier ? [lastBarrier] : [])];
    out.push(a); if (barrier) lastBarrier = a.id;
  };
  m.script.forEach((act, i) => {
    const [k, v] = act as [string, any];
    if (k === 'pass') push(passAction(m, `pass:${v}:${i}`, v as PassId));
    else if (k === 'step') {
      const x = sp.steps.find((q) => q.id === v)!, target = Array.isArray(x.at) ? x.at[0] : x.at;
      const ev = x.evidence ? sp.evidence.find((e) => e.id === x.evidence) : undefined;
      push({
        id: 'step:' + x.id, label: labelUse(x.tool, target), role: roleFor('use', x.tool), kind: 'use', target, tool: x.tool, after: [],
        done: (s) => !!s.flags['st_' + x.id],
        ready: (s) => {
          if (x.needs?.some((n) => !s.flags['st_' + n])) return 'an earlier step comes first';
          if (x.needsPass && !s.passes.has(x.needsPass)) return MISSING(x.needsPass);
          if (ev && !s.passes.has(ev.requiredPass)) return MISSING(ev.requiredPass);
          const acc = accessFor(target, s.passes); return acc === true ? true : MISSING(acc);
        },
      });
    } else if (k === 'contain' || k === 'release') {
      const c = sp.contain!.find((q) => q.id === v)!;
      const releasing = k === 'release';
      push({
        id: `${k}:${v}`, label: `${releasing ? 'Release' : 'Contain'} ${nameOf(c.target)}`, role: 'containment', kind: releasing ? 'release' : 'contain', target: c.target, tool: 'quarantine', after: [],
        done: (s) => (releasing ? !!s.flags['st_' + c.id] && !s.contained[c.target] : !!s.flags['st_' + c.id]),
        ready: (s) => { if (releasing) { const r = c.canRelease?.(s); if (typeof r === 'string') return r; } const acc = accessFor(c.target, s.passes); return acc === true ? true : MISSING(acc); },
      });
    } else if (k === 'wait') {
      const id = `wait:${i}`;
      push({
        id, label: 'Let traffic settle', role: 'records', kind: 'wait', seconds: v, after: [],
        done: (s) => { const t0 = s.data.__waits?.[id]; return t0 !== undefined && s.elapsed - t0 >= v; },
        ready: () => true,
      });
    } else if (k === 'record') {
      const r = m.recordables!.find((q) => q.id === v)!;
      push({ id: 'record:' + v, label: `Record: ${r.label}`, role: 'records', kind: 'record', recordId: v, target: propTarget('secure_ops', 'evidence_board'), after: [], done: (s) => s.recordsMade.includes(v), ready: (s) => (r.when(s) ? true : 'the result is not ready to record yet') });
    } else if (k === 'report') {
      push({ id: 'report', label: 'File the report', role: 'records', kind: 'report', target: propTarget('secure_ops', 'evidence_board'), after: [], done: (s) => s.complete || !!s.flags.reported, ready: (s) => { const r = m.canReport(s); return r === true ? true : r; } });
    }
  });
  return out;
}

/** The tutorial mission has its own simulation, so its playbook is written by hand (same order as the guided steps). */
function duplicateGhost(m: MissionDef): PlayAction[] {
  const P = (room: Parameters<typeof propTarget>[0], key: string) => propTarget(room, key);
  const FEED = routeTarget('receipt_event_feed');
  const f = (k: string) => (s: GameState) => !!s.flags[k];
  const acc = (t: string) => (s: GameState) => { const a = accessFor(t, s.passes); return a === true ? true : MISSING(a); };
  const when = (cond: (s: GameState) => boolean, why: string, t?: string) => (s: GameState) => (!cond(s) ? why : t ? acc(t)(s) : true);
  const use = (id: string, tool: ToolId | 'e', target: string, done: (s: GameState) => boolean, after: string[], ready: PlayAction['ready'], kind: PlayAction['kind'] = 'use'): PlayAction => ({
    id, tool, target, kind, after, done, ready, role: roleFor(kind, tool),
    label: kind === 'contain' ? `Contain ${nameOf(target)}` : kind === 'release' ? `Release ${nameOf(target)}` : labelUse(tool, target),
  });
  const TERMINAL = P('card_payments', 'card_terminal'), NOTIFIER = P('card_payments', 'notifier'), LOG = P('card_payments', 'receipt_log');
  const BUF = P('event_stream', 'replay_buffer'), CONSOLE = P('event_stream', 'replay_console'), GL = P('finance_core', 'gl'), AR = P('finance_core', 'ar');
  const PIPE = P('fabric_platform', 'pipeline_display');
  const A: PlayAction[] = [
    use('brief', 'e', P('secure_ops', 'incident_wall'), f('briefed'), [], () => true),
    passAction(m, 'pass:pay', 'payments_audit_pass', ['brief']),
    use('scan', 'scanner', TERMINAL, f('scannedTerminal'), ['pass:pay'], when(() => true, '', TERMINAL)),
    use('receipt', 'e', LOG, f('receiptEvidence'), ['scan'], when(f('scannedTerminal'), 'scan the card terminal first', LOG)),
    use('lens', 'lens', FEED, (s) => !!s.flags.lensed && !!s.flags.diagnosed, ['receipt'], when((s) => !!s.flags.scannedTerminal && s.evidence.has('ev_masked_receipt'), 'the masked receipt comes first', FEED)),
    passAction(m, 'pass:trace', 'event_trace_pass', ['lens']),
    use('trace', 'e', CONSOLE, f('traceEvidence'), ['pass:trace'], when(() => true, '', CONSOLE)),
    passAction(m, 'pass:ledger', 'ledger_read_pass', ['trace']),
    use('ledger', 'e', GL, f('ledgerEvidence'), ['pass:ledger'], when(() => true, '', GL)),
    use('contain', 'quarantine', FEED, f('contained'), ['ledger'], () => true, 'contain'),
    use('reroute', 'reroute', FEED, f('rerouted'), ['contain'], () => true, 'reroute'),
    use('patch', 'patch', NOTIFIER, f('patched'), ['contain'], when(f('diagnosed'), 'diagnose first', NOTIFIER)),
    use('restore', 'restore', BUF, f('purged'), ['patch'], when((s) => !!s.flags.patched && !!s.contained[FEED], 'patch the cause and contain the feed first', BUF)),
    use('recon', 'recon', AR, f('reconciled'), ['restore'], when((s) => !!s.flags.patched && !!s.flags.purged && s.evidence.has('ev_ledger_check'), 'the fix and the ledger check come first', AR)),
    use('release', 'quarantine', FEED, f('released'), ['recon'], (s) => { const c = (s.mission.containment[FEED] as { canRelease?: (x: GameState) => true | string } | undefined)?.canRelease?.(s); return typeof c === 'string' ? c : true; }, 'release'),
    use('verify', 'scanner', FEED, f('flowVerified'), ['release'], when((s) => !!s.flags.released && !!s.flags.patched && !!s.flags.purged, 'release the containment first', FEED)),
    passAction(m, 'pass:fabric', 'fabric_observer_pass', ['verify']),
    use('fabric', 'e', PIPE, f('fabricVerified'), ['pass:fabric'], when((s) => !!s.flags.flowVerified, 'verify the feed first', PIPE)),
    { id: 'record:recon_result', label: 'Record the final reconciliation', role: 'records', kind: 'record', recordId: 'recon_result', target: P('secure_ops', 'evidence_board'), after: ['fabric'], done: (s) => s.recordsMade.includes('recon_result'), ready: () => true },
    { id: 'report', label: 'File the report', role: 'records', kind: 'report', target: P('secure_ops', 'evidence_board'), after: ['record:recon_result'], done: (s) => s.complete || !!s.flags.reported, ready: (s) => { const r = m.canReport(s); return r === true ? true : r; } },
  ];
  void roomTarget;
  return A;
}

const CACHE = new WeakMap<MissionDef, PlayAction[]>();
export function playbookFor(m: MissionDef): PlayAction[] {
  let pb = CACHE.get(m);
  if (!pb) { pb = (m as ScenarioMission).script ? compileScenario(m as ScenarioMission) : m.id === 'duplicate-ghost' ? duplicateGhost(m) : []; CACHE.set(m, pb); }
  return pb;
}
