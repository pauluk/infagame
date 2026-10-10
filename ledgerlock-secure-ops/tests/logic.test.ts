import { describe, expect, it } from 'vitest';
import { CONNECTIONS, GRID, ROOMS, ROOM_BY_ID, isWalkable } from '../src/data/map';
import { PASSES, PASS_BY_ROOM } from '../src/data/passes';
import { ROUTES, routePoints } from '../src/data/routes';
import { findPath, nearestWalkable, walkableFor } from '../src/game/systems/Grid';
import { GameState } from '../src/game/systems/GameState';
import { MissionRunner } from '../src/game/systems/MissionRunner';
import { computeScore } from '../src/game/systems/Scoring';
import { Campaign, evaluateBadges } from '../src/game/systems/Campaign';
import { measuresOf, overallConfidence } from '../src/game/systems/Confidence';
import type { ScenarioMission } from '../src/data/missions/scenario';
import { MISSIONS } from '../src/data/missions';
import duplicateGhost from '../src/data/missions/duplicateGhost';
import type { PassId, RoomId } from '../src/game/types';
import { DemoFabricAdapter } from '../src/integrations/fabric/DemoFabricAdapter';

const ALL_PASSES = new Set(Object.keys(PASSES) as PassId[]);
const NO_ROOM_PASSES = new Set<PassId>(['ops_pass']);

describe('facility map', () => {
  it('has the 12 required room ids at the required positions', () => {
    const want: Record<string, string> = { api_gateway: 'A1', event_stream: 'B1', fabric_platform: 'C1', integration_exchange: 'D1', service_payments: 'A2', finance_core: 'B2', payment_orchestration: 'C2', bacs_vault: 'D2', secure_ops: 'A3', card_payments: 'B3', debt_recovery: 'C3', agency_handoff: 'D3' };
    for (const [id, code] of Object.entries(want)) expect(ROOM_BY_ID[id as RoomId]?.code).toBe(code);
    expect(ROOMS).toHaveLength(12);
  });
  it('uses 10 x 8 rooms with at least 2 cells between them', () => {
    for (const r of ROOMS) { expect(r.w).toBe(10); expect(r.h).toBe(8); }
    expect(ROOM_BY_ID.event_stream.x0 - (ROOM_BY_ID.api_gateway.x0 + 10)).toBeGreaterThanOrEqual(2);
    expect(ROOM_BY_ID.service_payments.y0 - (ROOM_BY_ID.api_gateway.y0 + 8)).toBeGreaterThanOrEqual(2);
  });
  it('defines all 17 physical connections as door pairs', () => {
    expect(CONNECTIONS).toHaveLength(17);
    for (const c of CONNECTIONS) {
      const a = ROOM_BY_ID[c.from], b = ROOM_BY_ID[c.to];
      expect(a.doors.some((d) => d.toward === c.to)).toBe(true);
      expect(b.doors.some((d) => d.toward === c.from)).toBe(true);
    }
    for (const r of ROOMS) expect(r.doors.length).toBeGreaterThanOrEqual(1);
  });
  it('every restricted room door has a reader and a required pass from the access map', () => {
    for (const r of ROOMS) { expect(PASS_BY_ROOM[r.id]).toBeDefined(); expect(PASSES[PASS_BY_ROOM[r.id]].room).toBe(r.id); for (const d of r.doors) expect(GRID.kind[d.readerCell.y][d.readerCell.x]).toBe('wall'); }
    expect(PASS_BY_ROOM.secure_ops).toBe('ops_pass'); expect(PASS_BY_ROOM.card_payments).toBe('payments_audit_pass'); expect(PASS_BY_ROOM.fabric_platform).toBe('fabric_observer_pass');
  });
  it('locked rooms never block corridor travel: every room door is reachable through corridors with only ops_pass', () => {
    const walk = walkableFor(NO_ROOM_PASSES);
    const start = { x: ROOM_BY_ID.secure_ops.x0 + 5, y: ROOM_BY_ID.secure_ops.y0 + 4 };
    for (const r of ROOMS) for (const d of r.doors) {
      const out = d.side === 'n' ? { x: d.cells[0].x, y: d.cells[0].y - 1 } : d.side === 's' ? { x: d.cells[0].x, y: d.cells[0].y + 1 } : d.side === 'w' ? { x: d.cells[0].x - 1, y: d.cells[0].y } : { x: d.cells[0].x + 1, y: d.cells[0].y };
      expect(findPath(walk, start, out), `${r.id} ${d.side}`).not.toBeNull();
    }
  });
  it('cannot enter a locked room, but can with its pass', () => {
    const card = ROOM_BY_ID.card_payments, inside = { x: card.x0 + 5, y: card.y0 + 4 };
    const start = { x: ROOM_BY_ID.secure_ops.x0 + 5, y: ROOM_BY_ID.secure_ops.y0 + 4 };
    expect(findPath(walkableFor(NO_ROOM_PASSES), start, inside)).toBeNull();
    expect(findPath(walkableFor(new Set<PassId>(['ops_pass', 'payments_audit_pass'])), start, inside)).not.toBeNull();
    for (const d of card.doors) for (const c of d.cells) expect(isWalkable(c.x, c.y, NO_ROOM_PASSES)).toBe(false);
  });
  it('props block movement and the whole map is reachable with every pass', () => {
    for (const r of ROOMS) for (const p of r.props) if (p.blocks) expect(isWalkable(p.gx, p.gy, ALL_PASSES)).toBe(false);
    const walk = walkableFor(ALL_PASSES);
    const start = { x: ROOM_BY_ID.secure_ops.x0 + 5, y: ROOM_BY_ID.secure_ops.y0 + 4 };
    for (const r of ROOMS) expect(findPath(walk, start, { x: r.x0 + 5, y: r.y0 + 4 }), r.id).not.toBeNull();
  });
  it('every interactive prop has a walkable neighbour so it can be reached', () => {
    const walk = walkableFor(ALL_PASSES);
    for (const r of ROOMS) for (const p of r.props) {
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walk(p.gx + dx, p.gy + dy));
      expect(n, p.id).toBe(true);
    }
  });
});

describe('routes', () => {
  it('has the required route ids with a direction (hops) and geometry', () => {
    const ids = ['service_payment_intake', 'supplier_payment_release', 'bank_response_reconciliation', 'card_receipt', 'debt_agency_export', 'agency_receipt', 'finance_event_mirror'];
    for (const id of ids) { const r = ROUTES.find((q) => q.id === id)!; expect(r).toBeDefined(); expect(routePoints(r).length).toBeGreaterThan(1); }
    expect(ROUTES.find((r) => r.id === 'bank_response_reconciliation')!.hops[0]).toBe('bank_sim');
    expect(ROUTES.find((r) => r.id === 'supplier_payment_release')!.hops.at(-1)).toBe('bank_sim');
    expect(ROUTES.find((r) => r.id === 'agency_receipt')!.hops.at(-1)).toBe('finance_core');
  });
  it('routes are an overlay: they do not change walkability', () => {
    const before = JSON.stringify(GRID.kind);
    for (const r of ROUTES) routePoints(r);
    expect(JSON.stringify(GRID.kind)).toBe(before);
  });
});

function play() {
  const s = new GameState(duplicateGhost);
  const run = new MissionRunner(s);
  run.start();
  return { s, run };
}
const dialogs = (s: GameState) => { const out: any[] = []; s.on('dialog', (d) => out.push(d)); return out; };

describe('Duplicate Ghost mission logic', () => {
  it('starts with only ops_pass and every route healthy', () => {
    const { s } = play();
    expect([...s.passes]).toEqual(['ops_pass']);
    expect(Object.values(s.routeStates).every((v) => v === 'healthy')).toBe(true);
  });
  it('denies unjustified passes and grants justified ones in the required order', () => {
    const { s, run } = play();
    run.requestPass('ledger_read_pass', 'desk'); expect(s.passes.has('ledger_read_pass')).toBe(false);
    run.requestPass('payments_audit_pass', 'desk'); expect(s.passes.has('payments_audit_pass')).toBe(false);   // not briefed yet
    s.flags.briefed = true;
    run.requestPass('payments_audit_pass', 'desk'); expect(s.passes.has('payments_audit_pass')).toBe(true);
    run.requestPass('event_trace_pass', 'reader'); expect(s.passes.has('event_trace_pass')).toBe(false);       // needs the lens clue
    expect(s.stats.passDenials).toBe(3);
  });
  it('evidence needs the room pass (no remote access)', () => {
    const { s, run } = play();
    run.api.evidence('ev_masked_receipt'); expect(s.evidence.has('ev_masked_receipt')).toBe(false);
    s.passes.add('payments_audit_pass'); run.api.evidence('ev_masked_receipt'); expect(s.evidence.has('ev_masked_receipt')).toBe(true);
  });
  it('cannot be completed without the required evidence and fixes', () => {
    const { s, run } = play();
    expect(duplicateGhost.canReport(s)).not.toBe(true);
    run.fileReport(); expect(s.complete).toBe(false);
    s.flags.briefed = true;
    expect(duplicateGhost.isComplete(s)).toBe(false);
  });
  it('lens is gated behind scanning and evidence; patch is gated behind diagnosis', () => {
    const { s, run } = play();
    s.selectedTool = 'lens'; run.interact('route:receipt_event_feed'); expect(s.flags.lensed).toBeUndefined();
    s.selectedTool = 'patch'; run.interact('prop:card_payments.notifier'); expect(s.flags.patched).toBeUndefined();
  });
  it('quarantining the replay path affects only that route; rooms delay the routes through them', () => {
    const { s, run } = play(); const d = dialogs(s);
    s.selectedTool = 'quarantine'; run.interact('route:receipt_event_feed');
    (d.at(-1) as any).onConfirm();
    expect(s.routeStates.receipt_event_feed).toBe('quarantined');
    for (const [k, v] of Object.entries(s.routeStates)) if (k !== 'receipt_event_feed') expect(v, k).toBe('healthy');
    s.selectedTool = 'reroute'; run.interact('route:receipt_event_feed'); (d.at(-1) as any).onConfirm();
    expect(s.routeStates.receipt_event_feed).toBe('rerouted');
    expect(s.availability).toBeGreaterThan(95);
    // a broad room containment delays the mirror to Fabric as well (and costs more)
    const b = play(); const bd = dialogs(b.s);
    b.s.selectedTool = 'quarantine'; b.run.interact('room:event_stream'); (bd.at(-1) as any).onConfirm();
    expect(b.s.routeStates.finance_event_mirror).toBe('delayed'); expect(b.s.availability).toBeLessThan(95);
  });
  it('replays hit the ledger when uncontained, and are held when contained', () => {
    const { s, run } = play(); s.flags.briefed = true;
    for (let i = 0; i < 4000 && (s.data.dupPosted ?? 0) === 0; i++) run.tick(0.5);
    expect(s.data.dupPosted).toBeGreaterThan(0); expect(s.integrity).toBeLessThan(100);
    const c = play(); c.s.flags.briefed = true; const cd = dialogs(c.s);
    c.s.selectedTool = 'quarantine'; c.run.interact('route:receipt_event_feed'); (cd.at(-1) as any).onConfirm();
    for (let i = 0; i < 4000; i++) c.run.tick(0.5);
    expect(c.s.data.dupPosted).toBe(0); expect(c.s.integrity).toBe(100);
  });
  it('scores 0-100 with the required weights and never dead-ends', () => {
    const { s } = play();
    const r = computeScore(s);
    expect(r.parts.map((p) => p.max)).toEqual([35, 25, 20, 10, 10]);
    expect(r.total).toBeGreaterThanOrEqual(0); expect(r.total).toBeLessThanOrEqual(100);
    expect(r.parts[4].points).toBeGreaterThanOrEqual(3 - 1e-9 > 0 ? 3 : 0);
  });
});

describe('campaign missions', () => {
  it('has the tutorial, seven further campaign missions in order, and the side-task hub', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['duplicate-ghost', 'bacs-after-dark', 'collection-connection', 'event-stream-tide', 'fabric-mirror', 'token-on-the-table', 'clean-restore', 'root-of-the-ripple', 'ops-floor']);
    expect(MISSIONS.filter((m) => m.order > 0).map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('every mission has primary, optional and stretch goals (hub: optional + stretch), evidence sources and a debrief', () => {
    for (const m of MISSIONS) {
      const kinds = new Set(m.goals.map((g) => g.kind));
      if (m.order > 0) expect(kinds.has('primary'), m.id).toBe(true);
      expect(kinds.has('optional'), m.id).toBe(true); expect(kinds.has('stretch'), m.id).toBe(true);
      const s = new GameState(m);
      expect(m.debrief(s).what.length).toBeGreaterThan(20); expect(m.nextStep(s).length).toBeGreaterThan(10);
      for (const e of m.evidence) { expect(e.sourceRoom).toBeTruthy(); expect(PASSES[e.requiredPass]).toBeDefined(); }
    }
  });
  it('the primary goals match the brief for each mission', () => {
    const count = Object.fromEntries(MISSIONS.map((m) => [m.id, m.goals.filter((g) => g.kind === 'primary').length]));
    expect(count['duplicate-ghost']).toBe(6); expect(count['bacs-after-dark']).toBe(6); expect(count['collection-connection']).toBe(6);
    expect(count['event-stream-tide']).toBe(5); expect(count['fabric-mirror']).toBe(6); expect(count['token-on-the-table']).toBe(6);
    expect(count['clean-restore']).toBe(6); expect(count['root-of-the-ripple']).toBe(6);
  });
});

/** Drives a scenario mission through its scripted (best-practice) path using only the public runner API. */
function runScript(m: ScenarioMission, opts: { skipRecord?: boolean } = {}) {
  const s = new GameState(m); const run = new MissionRunner(s); run.start(); const d = dialogs(s);
  s.flags.briefed = true;
  const handle = () => {
    for (let i = 0; i < 8 && d.length; i++) {
      const dlg = d.shift();
      if (dlg.type === 'confirm') dlg.onConfirm();
      else if (dlg.type === 'choice') { const step = m.spec.steps.find((x) => x.choice && x.choice.title === dlg.title); const o = step?.choice?.options.find((x) => x.correct) ?? step!.choice!.options[0]; dlg.onChoose(o.id); }
      else if (dlg.type === 'timeline' && dlg.onClose) dlg.onClose();
    }
  };
  const interactStep = (id: string) => {
    const x = m.spec.steps.find((q) => q.id === id)!; const at = Array.isArray(x.at) ? x.at[0] : x.at;
    s.selectedTool = x.tool === 'e' ? 'scanner' : x.tool; if (x.tool === 'e') run.inspect(at); else run.interact(at);
    handle();
  };
  for (const act of m.script) {
    const [k, v] = act as [string, any];
    if (k === 'pass') { run.requestPass(v, 'desk'); }
    else if (k === 'step') interactStep(v);
    else if (k === 'contain') { const c = m.spec.contain!.find((q) => q.id === v)!; s.selectedTool = 'quarantine'; run.interact(c.target); handle(); }
    else if (k === 'release') { const c = m.spec.contain!.find((q) => q.id === v)!; s.selectedTool = 'quarantine'; run.interact(c.target); handle(); }
    else if (k === 'wait') for (let t = 0; t < v * 2; t++) run.tick(0.5);
    else if (k === 'record') { if (!opts.skipRecord) run.record(v); }
    else if (k === 'report') run.fileReport();
  }
  return { s, run };
}

describe('every campaign mission can be completed through its scripted path', () => {
  for (const m of MISSIONS.filter((x) => (x as ScenarioMission).script)) {
    it(`${m.id}: primary goals done, mission completes, optional goals reachable`, () => {
      const { s } = runScript(m as ScenarioMission);
      for (const g of m.goals.filter((x) => x.kind === 'primary')) expect(g.done(s), `${m.id} primary: ${g.text}`).toBe(true);
      expect(s.complete, `${m.id} complete`).toBe(true);
      const opt = m.goals.filter((x) => x.kind === 'optional');
      expect(opt.filter((g) => g.done(s)).length, `${m.id} optional`).toBeGreaterThanOrEqual(Math.min(2, opt.length));
    });
  }
  it('cannot be completed by skipping primary objectives', () => {
    for (const m of MISSIONS.filter((x) => (x as ScenarioMission).script && x.order > 0)) {
      const s = new GameState(m); const run = new MissionRunner(s); run.start();
      run.fileReport(); expect(s.complete, m.id).toBe(false);
    }
  });
  it('optional objectives never block completion: failing every optional goal still finishes', () => {
    const m = MISSIONS.find((x) => x.id === 'bacs-after-dark') as ScenarioMission;
    const { s } = runScript(m, { skipRecord: true });
    expect(s.complete).toBe(true); expect(m.goals.find((g) => g.id === 'o3')!.done(s)).toBe(false);
  });
});

describe('Service Confidence and campaign storage', () => {
  it('rewards balance: shutting everything down or skipping checks both lower confidence', () => {
    const m = MISSIONS[0]; const good = new GameState(m); const shut = new GameState(m); const rush = new GameState(m);
    shut.hits.a = { availability: 70 }; rush.integrity = 40;
    const oc = (s: GameState) => overallConfidence(measuresOf(s));
    expect(oc(good)).toBeGreaterThan(oc(shut)); expect(oc(good)).toBeGreaterThan(oc(rush));
    expect(measuresOf(shut).integrity).toBe(100); expect(measuresOf(rush).availability).toBe(100);   // one strong measure is not enough
  });
  it('persists progress locally, unlocks missions in order, supports replay and reset', () => {
    const mem = new Map<string, string>(); const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const c = new Campaign(store);
    const [m1, m2, m3, m4] = MISSIONS;
    expect(c.isUnlocked(m1, MISSIONS)).toBe(true); expect(c.isUnlocked(m2, MISSIONS)).toBe(false);
    const { s } = runScript(m2 as ScenarioMission);   // play m2 directly to produce a result (unlock gating is a UI/campaign rule)
    const out = c.recordResult(s);
    expect(out.after.integrity).not.toBe(out.before.integrity + 999);
    expect(c.isCompleted(m2.id)).toBe(true);
    c.recordResult(s);                                  // replay keeps best and increments plays
    expect(c.data.missions[m2.id].plays).toBe(2);
    expect(JSON.parse(mem.get('ledgerlock.campaign.v1')!).missions[m2.id].completed).toBe(true);
    const c2 = new Campaign(store); expect(c2.isCompleted(m2.id)).toBe(true);
    expect(c2.isUnlocked(m1, MISSIONS)).toBe(true); expect(c2.isUnlocked(m3, MISSIONS)).toBe(true); expect(c2.isUnlocked(m4, MISSIONS)).toBe(false);
    c2.reset(); expect(c2.isCompleted(m2.id)).toBe(false);
    expect(JSON.stringify([...mem.values()])).not.toMatch(/password|secret|token_value/i);
  });
  it('awards badges from what actually happened', () => {
    const { s } = runScript(MISSIONS.find((m) => m.id === 'bacs-after-dark') as ScenarioMission);
    const b = evaluateBadges(s);
    expect(b).toContain('precision'); expect(b).toContain('least_privilege'); expect(b).toContain('ledger_listener'); expect(b).toContain('good_evidence');
    const r = runScript(MISSIONS.find((m) => m.id === 'clean-restore') as ScenarioMission);
    expect(evaluateBadges(r.s)).toContain('clean_restore');
    const e = runScript(MISSIONS.find((m) => m.id === 'event-stream-tide') as ScenarioMission);
    expect(evaluateBadges(e.s)).toContain('no_lost_events');
    // a broad containment loses Precision Over Panic
    const broad = new GameState(MISSIONS[0]); broad.data.containments = [{ target: 'room:event_stream', narrow: 0.45 }];
    expect(evaluateBadges(broad)).not.toContain('precision');
  });
  it('side-task hub tasks are recorded as side objectives', () => {
    const mem = new Map<string, string>(); const c = new Campaign({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    const hub = MISSIONS.find((m) => m.id === 'ops-floor') as ScenarioMission;
    const { s } = runScript(hub);
    c.recordResult(s); expect(c.data.side).toContain('alert_routing'); expect(c.data.side).toContain('close_log');
  });
  it('revoking an unneeded pass removes access and raises data protection', () => {
    const hub = MISSIONS.find((m) => m.id === 'ops-floor')!;
    const s = new GameState(hub); const run = new MissionRunner(s); run.start();
    expect(s.passes.has('service_audit_pass')).toBe(true);
    s.protection = 80; run.revoke('service_audit_pass');
    expect(s.passes.has('service_audit_pass')).toBe(false); expect(s.protection).toBeGreaterThan(80); expect(s.flags.st_revoke_pass).toBe(true);
    run.revoke('ops_pass'); expect(s.passes.has('ops_pass')).toBe(true);
  });
  it('time-limited rotation pass expires; unneeded passes cost data protection', () => {
    const m = MISSIONS.find((x) => x.id === 'token-on-the-table')!;
    const s = new GameState(m); const run = new MissionRunner(s); run.start();
    run.grant('token_rotation_pass'); expect(s.passes.has('token_rotation_pass')).toBe(true);
    for (let i = 0; i < 400; i++) run.tick(1);
    expect(s.passes.has('token_rotation_pass')).toBe(false); expect(s.flags.expired_token_rotation_pass).toBe(true);
    const before = s.protection; run.grant('bacs_audit_pass'); expect(s.protection).toBeLessThan(before);
  });
});

describe('tutorial mode', () => {
  it('coaches every guided step of The Duplicate Ghost with a valid target, tool and reason', async () => {
    const { COACH } = await import('../src/data/coach');
    const { describeTarget } = await import('../src/data/targets');
    const entries = COACH['duplicate-ghost'];
    for (const o of duplicateGhost.objectives) {
      const c = entries[o.id]; expect(c, o.id).toBeDefined(); expect(c.why.length).toBeGreaterThan(30);
      const s = new GameState(duplicateGhost);
      const t = typeof c.target === 'function' ? c.target(s) : c.target;
      for (const id of (Array.isArray(t) ? t : t ? [t] : [])) expect(describeTarget(id), `${o.id} -> ${id}`).not.toBeNull();
    }
  });
  it('hints are free, incidents run slower and stretch goals are not counted while tutorial mode is on', () => {
    const { s, run } = play(); s.tutorial = true;
    run.api.say('x', 'y', 'warn', { hint: true }); expect(s.stats.hintsUsed).toBe(0);
    const normal = play(); normal.run.api.say('x', 'y', 'warn', { hint: true }); expect(normal.s.stats.hintsUsed).toBe(1);
    s.flags.briefed = true; normal.s.flags.briefed = true;
    for (let i = 0; i < 40; i++) { run.tick(1); normal.run.tick(1); }
    expect(s.elapsed).toBeLessThan(normal.s.elapsed);
    const mem = new Map<string, string>(); const c = new Campaign({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    const t = runScript(MISSIONS.find((m) => m.id === 'bacs-after-dark') as ScenarioMission); t.s.tutorial = true;
    expect(c.recordResult(t.s).goals.stretch).toEqual([]);
    const u = runScript(MISSIONS.find((m) => m.id === 'bacs-after-dark') as ScenarioMission);
    expect(new Campaign({ getItem: () => null, setItem: () => {}, removeItem: () => {} }).recordResult(u.s).goals.stretch.length).toBeGreaterThan(0);
  });
});

describe('Fabric demo adapter', () => {
  it('works offline, is labelled Demo data, and reacts to paused mirroring', async () => {
    const a = new DemoFabricAdapter();
    const ok = await a.getSnapshot({ elapsedMin: 3, mirrorPaused: false, duplicatesInBronze: 0, verified: false });
    expect(ok.mode).toBe('demo'); expect(ok.label).toBe('Demo data'); expect(ok.dashboard.status).toBe('healthy'); expect(ok.stages).toHaveLength(3);
    const lag = await a.getSnapshot({ elapsedMin: 20, mirrorPaused: true, duplicatesInBronze: 2, verified: false });
    expect(lag.freshnessMin).toBeGreaterThan(ok.freshnessMin); expect(lag.dashboard.status).toBe('stale');
  });
});

// ---------------------------------------------------------------- team mode and auto-play ----
import { TeamController, type ExternalBody } from '../src/game/systems/Team';
import { playbookFor } from '../src/game/systems/Playbook';

function teamRun(m: (typeof MISSIONS)[number], o: { team: boolean; autoDecide: boolean; auto?: 'all' | 'you' | 'none'; limit?: number; answer?: boolean }) {
  const s = new GameState(m); const run = new MissionRunner(s); run.start(); s.flags.briefed = true;
  const r = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
  const spawn = [0, 1, 2, 3].map((i) => nearestWalkable(walk, r.x0 + 2 + i * 2, r.y0 + 4, 4)!);
  let me = { x: spawn[0].x + 0.5, y: spawn[0].y + 0.5 };
  const body: ExternalBody = { cell: () => ({ x: Math.floor(me.x), y: Math.floor(me.y) }), pos: () => me, walkTo: (c) => { me = { x: c.x + 0.5, y: c.y + 0.5 }; }, idle: () => true, cancel: () => {}, pose: () => {} };
  const team = new TeamController(s, run, { team: o.team, spawn, body, autoDecide: () => o.autoDecide });
  const modal: any[] = []; s.on('dialog', (d) => modal.push(d));
  if (o.auto !== 'none') for (const mem of team.members) if (o.auto !== 'you' || mem.id === 'you') team.setAuto(mem.id, true);
  const dt = 0.25, limit = o.limit ?? 2400;
  for (let t = 0; t < limit / dt && !s.complete; t++) {
    run.tick(dt); team.update(dt);
    // a human answering whatever a teammate or a modal asks for
    for (const it of team.inbox) if (!it.resolved && it.kind === 'decision' && o.answer !== false) {
      const sp = it.spec as any; if (sp.type === 'choice') sp.onChoose(m.bestChoice?.[sp.title] ?? sp.options[0].id); else sp.onConfirm();
    }
    while (modal.length) { const d = modal.shift(); if (d.type === 'choice') d.onChoose(m.bestChoice?.[d.title] ?? d.options[0].id); else if (d.type === 'confirm') d.onConfirm(); else if (d.type === 'timeline' && d.onClose) d.onClose(); }
  }
  return { s, team, run };
}

describe('team mode and auto-play', () => {
  const playable = MISSIONS.filter((m) => playbookFor(m).length > 0);
  it('every mission has a playbook', () => { expect(playable.length).toBe(MISSIONS.length); });
  for (const m of MISSIONS) {
    it(`${m.title}: a team on auto (deciding for the manager) finishes it with every primary goal met`, () => {
      const { s } = teamRun(m, { team: true, autoDecide: true });
      expect(s.complete).toBe(true);
      for (const g of m.goals.filter((x) => x.kind === 'primary')) expect(g.done(s), g.text).toBe(true);
    });
  }
  it('solo Auto-play finishes the tutorial; the manager answers the decisions', () => {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!;
    const { s } = teamRun(m, { team: false, autoDecide: false, auto: 'you' });
    expect(s.complete).toBe(true);
    expect(m.goals.filter((x) => x.kind === 'primary').every((g) => g.done(s))).toBe(true);
  });
  it('a team that asks the manager waits for the answer and does not decide for them', () => {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!;
    const { s, team } = teamRun(m, { team: true, autoDecide: false, answer: false, limit: 600 });
    expect(s.complete).toBe(false);
    const open = team.inbox.filter((i) => i.kind === 'decision' && !i.resolved);
    expect(open.length).toBeGreaterThan(0);
    expect(s.flags.diagnosed).toBeFalsy();
  });
  it('orders are carried out with the chosen tool, and stretch goals are not counted once Auto did the work', () => {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!;
    const s = new GameState(m); const run = new MissionRunner(s); run.start();
    const r = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
    const team = new TeamController(s, run, { team: true, spawn: [nearestWalkable(walk, r.x0 + 4, r.y0 + 4, 4)!], autoDecide: () => true });
    expect(team.order('priya', { tool: 'e', target: 'prop:secure_ops.incident_wall' })).toBeNull();
    for (let i = 0; i < 400 && !s.flags.briefed; i++) { run.tick(0.25); team.update(0.25); }
    expect(s.flags.briefed).toBe(true);
    expect(s.stats.orders).toBe(1); expect(s.stats.autoActions).toBe(0);
  });
  it('auto work counts: stretch goals are skipped in the campaign record', () => {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!;
    const { s } = teamRun(m, { team: true, autoDecide: true });
    expect(s.stats.autoActions).toBeGreaterThan(5);
    const out = new Campaign().recordResult(s);
    expect(out.goals.stretch).toEqual([]);
  });
});

// ---------------------------------------------------------------- JEV (server adapter and teammate routing) ----
import { handleJev, buildRequest } from '../server/jevHandler.mjs';
import { JEV_GATE } from '../src/game/systems/Team';

describe('JEV server adapter', () => {
  const opts = [{ id: 'bug', label: 'Software bug', detail: 'A retry fault' }, { id: 'malware', label: 'Malware', detail: 'Hostile code' }];
  const decision = { kind: 'decision', title: 'Diagnosis', body: 'What is it?', options: opts, context: 'receipt twice' };
  const upstream = (answers: object, status = 200) => async (_u: string, init: any) => { upstream.last = { url: _u, init }; return { ok: status < 400, status, json: async () => ({ model: 'jev-1.13.0', answers }) } as any; };
  upstream.last = null as any;
  it('is "not configured" without a real key (placeholder values do not count) and never echoes the key', async () => {
    expect((await handleJev({ method: 'GET', env: {} })).json).toMatchObject({ configured: false });
    expect((await handleJev({ method: 'GET', env: { TYPESAFE_API_KEY: 'replace-me' } })).json).toMatchObject({ configured: false });
    expect((await handleJev({ method: 'POST', body: decision, env: {} })).status).toBe(503);
    const ok = await handleJev({ method: 'GET', env: { TYPESAFE_API_KEY: 'sk-secret-123' } });
    expect(JSON.stringify(ok.json)).not.toContain('sk-secret-123');
  });
  it('sends a documented System One request with Bearer auth and returns only the useful fields', async () => {
    const f = upstream({ best: { type: 'choice', choice: 'bug', confidence: 0.91, probabilities: { bug: 0.91, malware: 0.09 } } });
    const r = await handleJev({ method: 'POST', body: decision, ip: 't1', env: { TYPESAFE_API_KEY: 'sk-secret-123' }, fetchImpl: f as any });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ choice: 'bug', confidence: 0.91, model: 'jev-1.13.0' });
    expect(JSON.stringify(r.json)).not.toContain('sk-secret-123');
    const sent = upstream.last; const body = JSON.parse(sent.init.body);
    expect(sent.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(sent.init.headers.Authorization).toBe('Bearer sk-secret-123');
    expect(body.model).toBe('jev-latest'); expect(body.questions.best.type).toBe('choice'); expect(Object.keys(body.questions.best.criteria)).toEqual(['bug', 'malware']);
    expect(body.state).toContain('receipt twice');
  });
  it('only accepts the two question templates, with bounded input (not an open proxy)', async () => {
    expect(buildRequest({ kind: 'raw', url: 'https://evil.example' })).toMatchObject({ error: 'bad_request' });
    expect(buildRequest({ kind: 'decision', options: [opts[0]] })).toMatchObject({ error: 'bad_request' });
    const big = buildRequest({ ...decision, body: 'x'.repeat(50000), context: 'y'.repeat(50000) }) as any;
    expect(big.payload.state.length).toBeLessThan(6500);
    const s = buildRequest({ kind: 'supports', claim: 'The retry is the cause', context: 'c' }) as any;
    expect(s.payload.questions.supported.type).toBe('noul');
  });
  it('turns upstream failures into safe errors', async () => {
    const env = { TYPESAFE_API_KEY: 'sk-secret-123' };
    expect((await handleJev({ method: 'POST', body: decision, ip: 't2', env, fetchImpl: upstream({}, 401) as any })).json).toMatchObject({ error: 'key_rejected' });
    expect((await handleJev({ method: 'POST', body: decision, ip: 't3', env, fetchImpl: upstream({}, 529) as any })).status).toBe(429);
    const boom = (async () => { throw new Error('sk-secret-123 leaked in message'); }) as any;
    const r = await handleJev({ method: 'POST', body: decision, ip: 't4', env, fetchImpl: boom });
    expect(r.status).toBe(502); expect(JSON.stringify(r.json)).not.toContain('sk-secret');
  });
});

describe('teammates and JEV (confidence-gated routing)', () => {
  const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  function setup(advice: { id: string; confidence: number } | null, auto: boolean) {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!;
    const s = new GameState(m); const run = new MissionRunner(s); run.start();
    const room = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
    const team = new TeamController(s, run, { team: true, spawn: [nearestWalkable(walk, room.x0 + 4, room.y0 + 4, 4)!], autoDecide: () => auto, jevOn: () => true, advise: async () => advice });
    const modal: any[] = []; s.on('dialog', (d) => modal.push(d));
    // put the mission right at the diagnosis question
    Object.assign(s.flags, { briefed: true, scannedTerminal: true, receiptEvidence: true, lensed: true }); s.evidence.add('ev_masked_receipt');
    return { s, run, team, modal, m };
  }
  const ask = (t: any, s: any, run: any) => { t.acting = t.members[1]; run.api.dialog({ type: 'choice', title: 'Diagnosis: what are we dealing with?', body: 'b', options: [{ id: 'bug', label: 'Software bug', detail: 'd' }, { id: 'malware', label: 'Malware', detail: 'd' }], onChoose: (id: string) => { if (id === 'bug') s.flags.diagnosed = true; } }); t.acting = null; };
  it('acts on a confident JEV answer when Auto may decide, and counts it', async () => {
    const { s, run, team } = setup({ id: 'bug', confidence: 0.93 }, true); ask(team, s, run); await tick();
    expect(s.flags.diagnosed).toBe(true); expect(s.stats.jevFollowed).toBe(1); expect(team.inbox.some((i) => i.kind === 'decision' && !i.resolved)).toBe(false);
  });
  it('does not act alone when JEV is unsure: it asks the manager and shows JEV\'s lean', async () => {
    const { s, run, team } = setup({ id: 'bug', confidence: JEV_GATE - 0.2 }, true); ask(team, s, run); await tick();
    expect(s.flags.diagnosed).toBeFalsy();
    const it = team.inbox.find((i) => i.kind === 'decision' && !i.resolved)!;
    expect(it.text).toMatch(/JEV suggests "Software bug".*Not sure enough/);
  });
  it('never acts alone when the manager keeps the calls, even if JEV is sure', async () => {
    const { s, run, team } = setup({ id: 'bug', confidence: 0.99 }, false); ask(team, s, run); await tick();
    expect(s.flags.diagnosed).toBeFalsy(); expect(team.inbox.find((i) => i.kind === 'decision' && !i.resolved)!.text).toMatch(/Your call/);
  });
  it('falls back to the playbook answer when JEV is unreachable and Auto may decide', async () => {
    const { s, run, team } = setup(null, true); ask(team, s, run); await tick();
    expect(s.flags.diagnosed).toBe(true);
  });
});

// ---------------------------------------------------------------- facility graph (single source of truth) ----
import { EQUIPMENT, EQUIPMENT_SPEC, GRAPH_ROOMS, CORRIDORS, DIAGRAMS, PORTS, layoutDiagram, incidentLink, placementOf } from '../src/data/facilityGraph';
describe('facility graph', () => {
  it('lists the 12 rooms at their grid positions with the specified IDs, names and codes', () => {
    const want: Record<string, [string, string, number, number]> = { api_gateway: ['A1', 'API Gateway', 0, 0], event_stream: ['B1', 'Event Stream Hall', 1, 0], fabric_platform: ['C1', 'Fabric Data Platform', 2, 0], integration_exchange: ['D1', 'Integration Exchange', 3, 0], service_payments: ['A2', 'Service Payments', 0, 1], finance_core: ['B2', 'Finance Core', 1, 1], payment_orchestration: ['C2', 'Payment Orchestration', 2, 1], bacs_vault: ['D2', 'BACS Vault', 3, 1], secure_ops: ['A3', 'Secure Ops Control', 0, 2], card_payments: ['B3', 'Card Payments', 1, 2], debt_recovery: ['C3', 'Accounts Receivable & Debt Recovery', 2, 2], agency_handoff: ['D3', 'Agency Hand-off', 3, 2] };
    expect(GRAPH_ROOMS.length).toBe(12);
    for (const r of GRAPH_ROOMS) { const w = want[r.id]; expect(w, r.id).toBeDefined(); expect([r.code, r.col, r.row]).toEqual([w[0], w[2], w[3]]); expect(r.name.replace('Accounts Receivable and Debt Recovery', 'Accounts Receivable & Debt Recovery')).toBe(w[1]); }
  });
  it('places every listed piece of equipment in its room at the requested spot', () => {
    expect(EQUIPMENT.length).toBe(EQUIPMENT_SPEC.length);
    for (const e of EQUIPMENT) expect(e.ok, `${e.room}: ${e.label} wants ${e.wanted.join('+')}, is at ${e.placement.join('+')} (${e.local.x},${e.local.y})`).toBe(true);
    expect(placementOf(5, 4)).toEqual(['centre']);
  });
  it('has 17 corridors between rooms, all outside the room footprints', () => {
    expect(CORRIDORS.length).toBe(17);
    for (const c of CORRIDORS) for (const r of GRAPH_ROOMS) { const hit = c.x < r.x0 + r.w && c.x + c.w > r.x0 && c.y < r.y0 + r.h && c.y + c.h > r.y0; expect(hit, `${c.from}-${c.to} overlaps ${r.id}`).toBe(false); }
  });
  it('builds each diagram from route data: finance flow follows the specified chain, and returning routes run back', () => {
    const fin = layoutDiagram(DIAGRAMS[0]);
    const col = (id: string) => fin.nodes.find((n) => n.id === id)!.col;
    expect(['service_payments', 'api_gateway', 'finance_core', 'payment_orchestration', 'bacs_vault', 'bank_sim'].map(col)).toEqual([0, 1, 2, 3, 4, 5]);
    const ev = layoutDiagram(DIAGRAMS[2]);
    expect(ev.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['finance_core', 'event_stream', 'fabric_platform', 'prop:fabric_platform.bronze', 'prop:fabric_platform.silver', 'prop:fabric_platform.gold', 'reporting_display']));
    const cd = layoutDiagram(DIAGRAMS[1]); const c2 = (id: string) => cd.nodes.find((n) => n.id === id)!.col;
    expect(c2('card_network_sim')).toBeLessThan(c2('card_payments')); expect(c2('integration_exchange')).toBeLessThan(c2('agency_sim'));
  });
  it('derives ports from the routes and links incidents to rooms, routes and evidence locations', () => {
    expect(PORTS.some((p) => p.room === 'card_payments' && p.routeIds.includes('receipt_event_feed'))).toBe(true);
    for (const m of MISSIONS) { const l = incidentLink(m); expect(l.sourceRoom).toBe(m.alert.points); for (const e of l.evidence) if (e.at) expect(e.at.startsWith('prop:')).toBe(true); }
    const dg = incidentLink(MISSIONS.find((x) => x.id === 'duplicate-ghost')!); expect(dg.evidence.every((e) => e.at)).toBe(true);
  });
});

// ---------------------------------------------------------------- Incident Board ----
import { INCIDENTS, INCIDENTS_BY_MISSION } from '../src/data/incidents';
import { IncidentBoard } from '../src/game/systems/Incidents';
import { KANBAN, KANBAN_RANK } from '../src/data/incidents/types';

describe('incident board data', () => {
  it('has unique IDs, valid links and every puzzle type is used', () => {
    expect(new Set(INCIDENTS.map((i) => i.incidentId)).size).toBe(INCIDENTS.length);
    expect(new Set(INCIDENTS.map((i) => i.puzzleType))).toEqual(new Set(['cable', 'match', 'missing', 'verify']));
    for (const m of MISSIONS) {
      const defs = INCIDENTS_BY_MISSION[m.id] ?? [];
      if (m.order > 0) expect(defs.length, m.id).toBeGreaterThanOrEqual(3);
      const ids = new Set(playbookFor(m).map((a) => a.id)), goals = new Set(m.goals.map((g) => g.id)), ev = new Set(m.evidence.map((e) => e.id));
      for (const d of defs) {
        const w = `${d.incidentId} (${m.id})`;
        for (const a of [...d.actions, ...(d.fixActions ?? [])]) expect(ids.has(a), `${w}: action ${a}`).toBe(true);
        for (const g of d.requiredObjectives) expect(goals.has(g), `${w}: goal ${g}`).toBe(true);
        for (const e of d.evidenceIds) expect(ev.has(e), `${w}: evidence ${e}`).toBe(true);
        const own = new Set(d.actions.map((a) => (m as any).spec?.steps.find((x: any) => `step:${x.id}` === a)?.evidence).filter(Boolean));
        for (const e of d.evidenceIds) expect(own.has(e), `${w}: ${e} is produced by this incident's own actions, so the task could never open`).toBe(false);
        for (const c of d.clueOrder) expect(!!(d.evidenceNotes[c] || ev.has(c)), `${w}: clue ${c}`).toBe(true);
        for (const r of d.affectedRouteIds) expect(ROUTES.some((x) => x.id === r), `${w}: route ${r}`).toBe(true);
        expect(ROOM_BY_ID[d.sourceRoom], w).toBeDefined(); expect(d.hintText.length, w).toBeGreaterThanOrEqual(3); expect(d.failureFeedback.default.length).toBeGreaterThan(10); expect(d.successFeedback.length).toBeGreaterThan(10);
        const L: any = d.puzzlePieces; expect(L.type).toBe(d.puzzleType);
        if (d.puzzleType === 'cable') {
          const pid = new Map(L.ports.map((p: any) => [p.id, p.side]));
          expect(d.validConnections!.length, w).toBeGreaterThanOrEqual(2);
          for (const [f, t] of d.validConnections!) { expect(pid.get(f), w).toBe('source'); expect(pid.get(t), w).toBe('dest'); }
          expect(L.ports.some((p: any) => p.side === 'dest' && !d.validConnections!.some(([, t]) => t === p.id)), `${w}: needs a decoy port`).toBe(true);
        } else if (d.puzzleType === 'match') {
          const pieces = new Set(L.pieces.map((p: any) => p.id)), slots = new Set(L.slots.map((p: any) => p.id));
          for (const [p, sl] of Object.entries(d.correctMatches!)) { expect(pieces.has(p), `${w}: piece ${p}`).toBe(true); expect(slots.has(sl), `${w}: slot ${sl}`).toBe(true); }
          expect(L.pieces.some((p: any) => !(p.id in d.correctMatches!)), `${w}: needs a decoy card`).toBe(true);
          expect(new Set(L.pieces.map((p: any) => p.shape)).size, `${w}: distinct shapes`).toBeGreaterThanOrEqual(3);
        } else if (d.puzzleType === 'missing') {
          expect(L.items.filter((i: any) => i.problem).length, w).toBeGreaterThanOrEqual(1); expect(L.items.filter((i: any) => !i.problem && i.okWhy).length, w).toBeGreaterThanOrEqual(2);
        } else {
          expect(L.cards.filter((c: any) => c.confirms).length, w).toBeGreaterThanOrEqual(2); expect(L.cards.filter((c: any) => !c.confirms).length, w).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});

/** Plays a mission with teammates on Auto, except the actions the board's puzzles carry out: the board solves those. */
function boardRun(m: (typeof MISSIONS)[number]) {
  const s = new GameState(m); const run = new MissionRunner(s); run.start();
  const board = IncidentBoard.for(s, run);
  const room = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
  const reserved = new Set(board.defs.flatMap((d) => d.actions));
  const team = new TeamController(s, run, { team: true, spawn: [0, 1, 2, 3].map((i) => nearestWalkable(walk, room.x0 + 2 + i * 2, room.y0 + 4, 4)!), autoDecide: () => true, reserved });
  team.setAllAuto(true);
  const solved: Record<string, string | undefined> = {};
  for (let t = 0; t < 12000 && !s.complete; t++) {
    run.tick(0.25); team.update(0.25);
    for (const d of board.defs) if (!board.puzzle(d.incidentId).solved && board.available(d)) {
      for (let k = 0; k < 40 && !board.puzzle(d.incidentId).solved; k++) board.applyGuide(d);
      expect(board.puzzle(d.incidentId).solved, d.incidentId).toBe(true);
      const rs = d.routeStateOnSuccess; if (rs) solved[d.incidentId] = s.routeStates[rs.routeId];
    }
  }
  if (!s.complete && process.env.DEBUG_BOARD) console.log(m.id, s.elapsed, team.outstanding().map((o) => `${o.a.id}:${o.state}:${o.why ?? o.by ?? ''}`).join(' | '), team.members.map((q) => q.note).join(' / '), board.defs.map((d) => d.incidentId + ':' + board.puzzle(d.incidentId).solved + ':' + (board.puzzle(d.incidentId).pending ?? '') + ':' + board.blockers(d).map((b) => b.text).join(',')).join(' ; '));
  return { s, run, board, solved };
}

describe('incident board: puzzles change the real game', () => {
  for (const m of MISSIONS.filter((x) => (INCIDENTS_BY_MISSION[x.id] ?? []).length)) {
    it(`${m.title}: solving every board task (and letting the team do the rest) completes the mission and closes every card`, () => {
      const { s, board, solved } = boardRun(m);
      expect(s.complete, 'mission completed').toBe(true);
      for (const g of m.goals.filter((x) => x.kind === 'primary')) expect(g.done(s), g.text).toBe(true);
      for (const d of board.defs) {
        expect(board.puzzle(d.incidentId).solved, d.incidentId).toBe(true);
        expect(board.puzzle(d.incidentId).pending, d.incidentId).toBeUndefined();
        expect(board.canMove(d, 'closed'), d.incidentId).toBe(true);
        if (d.routeStateOnSuccess) expect(solved[d.incidentId], `${d.incidentId}: route ${d.routeStateOnSuccess.routeId} right after the task`).toBe(d.routeStateOnSuccess.state);
      }
    });
  }
});

describe('incident board: wrong moves, hints and the Kanban rules', () => {
  const dg = () => { const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!; const s = new GameState(m); const run = new MissionRunner(s); run.start(); return { m, s, run, board: IncidentBoard.for(s, run) }; };
  it('a wrong placement explains the mismatch, keeps earlier progress and costs nothing', () => {
    const { s, board } = dg(); const d = board.def('INC-101');
    expect(board.place(d, 'a', 'orig').ok).toBe(true);
    const bad = board.place(d, 'a', 'replay');
    expect(bad.ok).toBe(false); expect(bad.text).toMatch(/first delivery/i);
    expect(board.puzzle('INC-101').placements).toEqual({ a: 'orig' });           // nothing reset
    expect(board.place(d, 'x', 'valid').text).toMatch(/not a receipt|total/i);   // a decoy card
    expect(s.integrity).toBe(100); expect(s.protection).toBe(100); expect(s.stats.hintsUsed).toBe(0);
  });
  it('a wrong cable explains why and leaves the cables already made', () => {
    const { board } = dg(); const d = board.def('INC-102');
    expect(board.connect(d, 'valid', 'card').ok).toBe(true);
    const bad = board.connect(d, 'replay', 'ledger');
    expect(bad.ok).toBe(false); expect(bad.text).toMatch(/twice|duplicate/i);
    expect(board.puzzle('INC-102').connections).toEqual([['valid', 'card']]);
    expect(board.connect(d, 'card', 'valid').ok).toBe(false);                      // wrong direction
    board.disconnect(d, 'valid', 'card'); expect(board.puzzle('INC-102').connections).toEqual([]);
  });
  it('findings and evidence choices are explained item by item and can be retried', () => {
    const m = MISSIONS.find((x) => x.id === 'bacs-after-dark')!; const s = new GameState(m); const run = new MissionRunner(s); run.start(); const b = IncidentBoard.for(s, run);
    const d = b.def('INC-202'); b.toggleMark(d, 'first'); b.toggleMark(d, 'hash');
    const r = b.submitMissing(d); expect(r.ok).toBe(false); expect(r.text).toMatch(/First approval/); expect(r.text).toMatch(/still missing|out of place/);
    expect(b.puzzle('INC-202').solved).toBe(false);
    b.toggleMark(d, 'first'); expect(b.guide(d)).toEqual({ kind: 'mark', id: 'second' });
  });
  it('hints and "show me the next clue" progress and count as hints (never as penalties)', () => {
    const { s, board } = dg(); const d = board.def('INC-102');
    const h = [board.hint(d), board.hint(d), board.hint(d), board.hint(d)];
    expect(h[0]).not.toBe(h[1]); expect(h[3]).toBe(h[2]);                         // the last hint repeats
    expect(board.nextClue(d).id).toBe('ev_replay_trace'); expect(board.nextClue(d).id).toBe('ev_ledger_check');
    expect(s.stats.hintsUsed).toBe(6); expect(s.integrity).toBe(100);
    s.tutorial = true; board.hint(d); expect(s.stats.hintsUsed).toBe(6);
  });
  it('cards cannot skip prerequisites: the unmet one is named, and a card cannot be closed by dragging', () => {
    const { s, run, board } = dg(); const d = board.def('INC-102');
    expect(board.status(d)).toBe('new');
    expect(board.canMove(d, 'triage')).toMatch(/Incident Wall/);
    s.flags.briefed = true; expect(board.canMove(d, 'triage')).toBe(true);
    expect(board.canMove(d, 'investigating')).toMatch(/Collect evidence/);
    expect(board.canMove(d, 'closed')).toMatch(/Cannot move to Closed yet/);
    expect(board.move(d, 'closed')).toMatch(/Cannot move/); expect(board.status(d)).toBe('triage');
    expect(board.nextNeed(d).text).toMatch(/To move to Investigating: Collect evidence/);
    s.evidence.add('ev_replay_trace'); expect(board.status(d)).toBe('investigating');
    expect(board.canMove(d, 'contained')).toMatch(/Contain Receipt Event Feed/);
    expect(board.canMove(d, 'verifying')).toMatch(/Cannot move to Verifying/);
    void run;
  });
  it('moving back is always allowed (reopen) and does not lose progress', () => {
    const { s, board } = dg(); const d = board.def('INC-101'); s.flags.briefed = true; s.evidence.add('ev_masked_receipt');
    expect(board.status(d)).toBe('investigating'); expect(board.move(d, 'triage')).toBeNull(); expect(board.status(d)).toBe('triage');
    expect(board.move(d, 'investigating')).toBeNull();
    expect(KANBAN.map((c) => c.label)).toEqual(['New', 'Triage', 'Investigating', 'Contained', 'Fixing', 'Verifying', 'Closed']);
    expect(KANBAN_RANK.closed).toBe(6);
  });
  it('a puzzle that is not ready names what is blocking it (and a pass is a blocker, not a penalty)', () => {
    const { board } = dg(); const d = board.def('INC-102');
    const b = board.blockers(d); expect(b.length).toBeGreaterThan(0); expect(board.available(d)).toBe(false);
    expect(b.map((x) => x.text).join(' ')).toMatch(/Incident Wall|Collect evidence/);
  });
  it('the Control Room tutorial still works with the board: teammates skip nothing unless reserved', () => {
    const { s, board } = dg(); expect(board.defs.length).toBe(3); expect(s.data.board).toBeDefined();
    const hub = MISSIONS.find((x) => x.order === 0)!; const s2 = new GameState(hub); const r2 = new MissionRunner(s2); r2.start(); expect(IncidentBoard.for(s2, r2).defs.length).toBe(0);
  });
});
