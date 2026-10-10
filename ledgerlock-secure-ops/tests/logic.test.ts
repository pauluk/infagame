import { describe, expect, it } from 'vitest';
import { CONNECTIONS, GRID, ROOMS, ROOM_BY_ID, isWalkable } from '../src/data/map';
import { PASSES, PASS_BY_ROOM } from '../src/data/passes';
import { ROUTES, routePoints } from '../src/data/routes';
import { findPath, walkableFor } from '../src/game/systems/Grid';
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

describe('Fabric demo adapter', () => {
  it('works offline, is labelled Demo data, and reacts to paused mirroring', async () => {
    const a = new DemoFabricAdapter();
    const ok = await a.getSnapshot({ elapsedMin: 3, mirrorPaused: false, duplicatesInBronze: 0, verified: false });
    expect(ok.mode).toBe('demo'); expect(ok.label).toBe('Demo data'); expect(ok.dashboard.status).toBe('healthy'); expect(ok.stages).toHaveLength(3);
    const lag = await a.getSnapshot({ elapsedMin: 20, mirrorPaused: true, duplicatesInBronze: 2, verified: false });
    expect(lag.freshnessMin).toBeGreaterThan(ok.freshnessMin); expect(lag.dashboard.status).toBe('stale');
  });
});
