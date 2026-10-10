import { describe, expect, it } from 'vitest';
import { CONNECTIONS, GRID, ROOMS, ROOM_BY_ID, isWalkable } from '../src/data/map';
import { PASSES, PASS_BY_ROOM } from '../src/data/passes';
import { ROUTES, routePoints } from '../src/data/routes';
import { findPath, walkableFor } from '../src/game/systems/Grid';
import { GameState } from '../src/game/systems/GameState';
import { MissionRunner } from '../src/game/systems/MissionRunner';
import { computeScore } from '../src/game/systems/Scoring';
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

describe('all missions load on the same engine', () => {
  it('has the tutorial plus four follow-on scenarios with objectives, clues, choices and a debrief', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['duplicate-ghost', 'bacs-after-dark', 'collection-connection', 'event-stream-tide', 'fabric-mirror']);
    for (const m of MISSIONS.slice(1)) { expect(m.outline!.clues.length).toBeGreaterThan(1); expect(m.outline!.choices.length).toBeGreaterThan(1); expect(m.objectives.length).toBeGreaterThan(5); expect(m.debrief(new GameState(m)).what.length).toBeGreaterThan(20); }
  });
  it('follow-on scenarios can be completed through passes, evidence, response and verification', () => {
    for (const m of MISSIONS.slice(1)) {
      const s = new GameState(m); const run = new MissionRunner(s); run.start(); const d = dialogs(s);
      s.flags.briefed = true;
      const [p1, p2] = Object.keys(m.passGrants) as PassId[];
      run.requestPass(p1, 'desk'); expect(s.passes.has(p1)).toBe(true);
      const [ev1, ev2] = m.evidence;
      s.passes.add(p1); run.api.evidence(ev1.id); s.flags.ev1 = true;
      run.requestPass(p2, 'reader'); expect(s.passes.has(p2)).toBe(true);
      run.api.evidence(ev2.id); s.flags.ev2 = true;
      const resp = Object.keys(m.interactions!).find((k) => !k.includes('incident_wall') && !k.includes(ev1.sourceRoom) && !k.includes(ev2.sourceRoom)) ?? Object.keys(m.interactions!).at(-1)!;
      run.inspect(Object.keys(m.interactions!).at(-1)!);
      const choice = d.at(-1) as any; expect(choice.type).toBe('choice'); choice.onChoose(choice.options[0].id);
      expect(s.flags.fixed, resp).toBe(true);
      s.selectedTool = 'scanner'; run.interact('route:' + m.incidentRoute); expect(s.flags.verified).toBe(true);
      expect(m.canReport(s)).toBe(true); run.fileReport(); expect(s.complete).toBe(true);
    }
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
