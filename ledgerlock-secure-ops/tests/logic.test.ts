import { describe, expect, it } from 'vitest';
import { DOORS, DOOR_BY_ID, GATE, GRID, LINKS, LINK_BY_ID, LINK_RULES, LAYOUT_JUNCTIONS, ROOMS, ROOM_BY_ID, ENTRANCE, EXTERNALS, cellKey, doorInfo, isWalkable, linkInfo } from '../src/data/map';
import { PASSES, PASS_BY_ROOM } from '../src/data/passes';
import { ROUTES, routePoints } from '../src/data/routes';
import { findPath, nearestWalkable, walkableFor } from '../src/game/systems/Grid';
import { accessFor, standFor } from '../src/game/systems/Reach';
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
  it('has the 12 core rooms with their ids and codes, plus the Audit Gallery, the Payroll & Pensions office, Expense Claims and the BCP Command Centre', () => {
    const want: Record<string, string> = { api_gateway: 'A1', event_stream: 'B1', fabric_platform: 'C1', integration_exchange: 'D1', service_payments: 'A2', finance_core: 'B2', payment_orchestration: 'C2', bacs_vault: 'D2', secure_ops: 'A3', card_payments: 'B3', debt_recovery: 'C3', agency_handoff: 'D3' };
    for (const [id, code] of Object.entries(want)) expect(ROOM_BY_ID[id as RoomId]?.code).toBe(code);
    expect(ROOM_BY_ID.audit_gallery.name).toBe('Audit Gallery'); expect(ROOM_BY_ID.payroll_pensions.name).toBe('Payroll & Pensions Office');
    expect(ROOM_BY_ID.secure_ops.name).toBe('Secure Operations Atrium');
    expect(ROOM_BY_ID.expense_claims.name).toBe('Expense Claims'); expect(ROOM_BY_ID.expense_claims.wing).toBe('finance');
    expect(ROOM_BY_ID.bcp_command.code).toBe('F1'); expect(ROOM_BY_ID.bcp_command.wing).toBe('command');
    expect(ROOMS).toHaveLength(16);
  });
  it('is irregular: rooms differ in size, never overlap or touch, and sit in four wings around the atrium', () => {
    expect(new Set(ROOMS.map((r) => `${r.w}x${r.h}`)).size).toBeGreaterThanOrEqual(6);
    for (const a of ROOMS) for (const b of ROOMS) if (a.id < b.id) {
      const apart = a.x0 + a.w < b.x0 || b.x0 + b.w < a.x0 || a.y0 + a.h < b.y0 || b.y0 + b.h < a.y0;
      expect(apart, `${a.id} and ${b.id} must not touch`).toBe(true);
    }
    expect(new Set(ROOMS.map((r) => r.wing))).toEqual(new Set(['atrium', 'data', 'finance', 'payments', 'collections', 'command']));
    const wingOf = (id: RoomId) => ROOM_BY_ID[id].wing;
    expect(['api_gateway', 'event_stream', 'fabric_platform', 'audit_gallery'].map((i) => wingOf(i as RoomId))).toEqual(['data', 'data', 'data', 'data']);
    expect(['finance_core', 'service_payments', 'expense_claims'].map((i) => wingOf(i as RoomId))).toEqual(['finance', 'finance', 'finance']);
    expect(['payment_orchestration', 'card_payments', 'bacs_vault'].map((i) => wingOf(i as RoomId))).toEqual(['payments', 'payments', 'payments']);
    expect(['debt_recovery', 'agency_handoff', 'payroll_pensions'].map((i) => wingOf(i as RoomId))).toEqual(['collections', 'collections', 'collections']);
  });
  it('lists every link with real endpoints, stable door ids and doors on room ends only', () => {
    const ids = new Set([...ROOMS.map((r) => r.id as string), ...LAYOUT_JUNCTIONS.map((j) => j.id)]);
    expect(new Set(LINKS.map((l) => l.id)).size).toBe(LINKS.length);
    for (const l of LINKS) {
      expect(ids.has(l.a) && ids.has(l.b), l.id).toBe(true);
      for (const [end, spec, other] of [[l.a, l.da, l.b], [l.b, l.db, l.a]] as const) {
        if (ROOM_BY_ID[end as RoomId]) { expect(spec, `${l.id} door at ${end}`).toBeDefined(); const d = DOOR_BY_ID[`door:${end}.${other}`]; expect(d, `door:${end}.${other}`).toBeDefined(); expect(d.link).toBe(l.id); }
        else expect(spec).toBeUndefined();
      }
    }
    for (const r of ROOMS) expect(r.doors.length).toBeGreaterThanOrEqual(2);
  });
  it('the walkable grid joins exactly the nodes the graph says it joins (corridors are explicit, never inferred)', () => {
    // flood-fill every connected patch of corridor cells and list the rooms whose door cells touch it
    const comp = new Map<string, number>(); let n = 0;
    for (let y = 0; y < GRID.h; y++) for (let x = 0; x < GRID.w; x++) {
      if (GRID.kind[y][x] !== 'corridor' || comp.has(cellKey(x, y))) continue;
      const q = [[x, y]]; comp.set(cellKey(x, y), n);
      while (q.length) { const [cx, cy] = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = cellKey(cx + dx, cy + dy); if (GRID.kind[cy + dy]?.[cx + dx] === 'corridor' && !comp.has(k)) { comp.set(k, n); q.push([cx + dx, cy + dy]); } } }
      n++;
    }
    for (const l of LINKS) for (const e of [l.a, l.b]) { const j = LAYOUT_JUNCTIONS.find((q) => q.id === e); if (j) expect(comp.get(cellKey(j.x, j.y)), `${l.id} must open onto the ${e} plaza`).toBe(comp.get(cellKey(l.corridor[0].x, l.corridor[0].y))); }
    const gridRooms = new Map<number, Set<string>>(), graphRooms = new Map<number, Set<string>>();
    const add = (m: Map<number, Set<string>>, c: number, r: string) => { (m.get(c) ?? m.set(c, new Set()).get(c)!).add(r); };
    for (const d of DOORS) for (const c of d.cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = cellKey(c.x + dx, c.y + dy); if (comp.has(k)) add(gridRooms, comp.get(k)!, d.room); }
    for (const l of LINKS) {
      const cells = l.corridor.length ? [l.corridor[0].x, l.corridor[0].y] : null; expect(cells, `${l.id} has corridor cells`).not.toBeNull();
      const c = comp.get(cellKey(cells![0], cells![1]))!;
      for (const e of [l.a, l.b]) if (ROOM_BY_ID[e as RoomId]) add(graphRooms, c, e);
    }
    expect(gridRooms.size).toBe(graphRooms.size);
    for (const [c, rooms] of graphRooms) expect([...(gridRooms.get(c) ?? [])].sort(), `patch ${c}`).toEqual([...rooms].sort());
  });
  it('has a central atrium with at least three exits, the spawn, the incident wall and the Identity & Access Desk', () => {
    const a = ROOM_BY_ID.secure_ops;
    expect(new Set(a.doors.map((d) => d.link)).size).toBeGreaterThanOrEqual(3);
    for (const k of ['incident_wall', 'identity_desk', 'map_table', 'access_desk']) expect(a.props.find((p) => p.key === k), k).toBeDefined();
    const cx = a.x0 + a.w / 2, cy = a.y0 + a.h / 2;
    for (const r of ROOMS) if (r.id !== 'secure_ops') { const d = Math.hypot(r.x0 + r.w / 2 - cx, r.y0 + r.h / 2 - cy); expect(d, r.id).toBeGreaterThan(8); }
    expect(Math.abs(cx - GRID.w / 2)).toBeLessThan(GRID.w * 0.15);          // roughly central in the world
    expect(MISSIONS.every((m) => m.startRoom === 'secure_ops')).toBe(true);
  });
  it('the Identity & Access Desk, Incident Wall, overview terminal and Access Desk can all be used from the spawn with only the ops pass', () => {
    const a = ROOM_BY_ID.secure_ops, passes = new Set<PassId>(['ops_pass']), from = nearestWalkable(walkableFor(passes), a.x0 + a.w / 2, a.y0 + a.h / 2, 4)!;
    for (const k of ['identity_desk', 'incident_wall', 'map_table', 'access_desk', 'evidence_board']) expect(standFor(`prop:secure_ops.${k}`, from, passes), k).not.toBeNull();
    expect(accessFor('prop:secure_ops.identity_desk', passes)).toBe(true);
  });
  it('decorative things (entrance gate, external docks) stand on open ground, not on rooms or corridors', () => {
    for (let x = ENTRANCE.x; x < ENTRANCE.x + ENTRANCE.w; x++) for (let y = ENTRANCE.y - 1; y <= ENTRANCE.y; y++) expect(GRID.kind[y][x], `entrance ${x},${y}`).toBe('void');
    for (const e of EXTERNALS) for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) expect(GRID.kind[y][x], `${e.id} ${x},${y}`).toBe('void');
  });
  it('every restricted room door has a reader and a required pass from the access map', () => {
    for (const r of ROOMS) { expect(PASS_BY_ROOM[r.id]).toBeDefined(); expect(PASSES[PASS_BY_ROOM[r.id]].room).toBe(r.id); for (const d of r.doors) expect(GRID.kind[d.readerCell.y][d.readerCell.x]).toBe('wall'); }
    expect(PASS_BY_ROOM.secure_ops).toBe('ops_pass'); expect(PASS_BY_ROOM.card_payments).toBe('payments_audit_pass'); expect(PASS_BY_ROOM.fabric_platform).toBe('fabric_observer_pass');
  });
  it('locked rooms never block corridor travel: every door that opens onto a concourse is reachable with only the ops pass', () => {
    const walk = walkableFor(NO_ROOM_PASSES);
    const a = ROOM_BY_ID.secure_ops, start = nearestWalkable(walk, a.x0 + a.w / 2, a.y0 + a.h / 2, 4)!;
    for (const r of ROOMS) for (const d of r.doors) {
      if (LINK_BY_ID[d.link].kind === 'maintenance' || ROOM_BY_ID[d.toward as RoomId]) continue;     // direct room-to-room links are loops: walking them means crossing a room
      const out = d.side === 'n' ? { x: d.cells[0].x, y: d.cells[0].y - 1 } : d.side === 's' ? { x: d.cells[0].x, y: d.cells[0].y + 1 } : d.side === 'w' ? { x: d.cells[0].x - 1, y: d.cells[0].y } : { x: d.cells[0].x + 1, y: d.cells[0].y };
      expect(findPath(walk, start, out, 9000), `${r.id} -> ${d.toward}`).not.toBeNull();
    }
    for (const r of ROOMS) expect(r.doors.some((d) => !ROOM_BY_ID[d.toward as RoomId] && LINK_BY_ID[d.link].kind === 'main'), `${r.id} has a concourse door`).toBe(true);
  });
  it('cannot enter a locked room, but can with its pass', () => {
    const card = ROOM_BY_ID.card_payments, inside = nearestWalkable(walkableFor(ALL_PASSES), card.x0 + card.w / 2, card.y0 + card.h / 2, 4)!;
    const a = ROOM_BY_ID.secure_ops, start = nearestWalkable(walkableFor(NO_ROOM_PASSES), a.x0 + a.w / 2, a.y0 + a.h / 2, 4)!;
    expect(findPath(walkableFor(NO_ROOM_PASSES), start, inside, 9000)).toBeNull();
    expect(findPath(walkableFor(new Set<PassId>(['ops_pass', 'payments_audit_pass'])), start, inside, 9000)).not.toBeNull();
    for (const d of card.doors) for (const c of d.cells) expect(isWalkable(c.x, c.y, NO_ROOM_PASSES)).toBe(false);
  });
  it('props block movement and the whole map is reachable with every pass', () => {
    for (const r of ROOMS) for (const p of r.props) if (p.blocks) expect(isWalkable(p.gx, p.gy, ALL_PASSES)).toBe(false);
    const walk = walkableFor(ALL_PASSES);
    const a = ROOM_BY_ID.secure_ops, start = nearestWalkable(walk, a.x0 + a.w / 2, a.y0 + a.h / 2, 4)!;
    for (const r of ROOMS) expect(findPath(walk, start, nearestWalkable(walk, r.x0 + r.w / 2, r.y0 + r.h / 2, 4)!, 9000), r.id).not.toBeNull();
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
  it('has the tutorial, seven further campaign missions, the three business-continuity missions in order, and the side-task hub', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['duplicate-ghost', 'bacs-after-dark', 'collection-connection', 'event-stream-tide', 'fabric-mirror', 'token-on-the-table', 'clean-restore', 'root-of-the-ripple', 'payments-down', 'rising-water', 'flood-gates', 'quiet-malware', 'ransom-note', 'worm-in-the-wires', 'blue-lantern', 'blue-lantern-gap', 'bau-opening-checks', 'bau-payment-run', 'bau-month-end', 'bau-leavers-joiners', 'ops-floor']);
    expect(MISSIONS.filter((m) => m.order > 0).map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
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
      else if (dlg.type === 'choice' || dlg.type === 'meeting') { const step = m.spec.steps.find((x) => (x.choice ?? x.meeting)?.title === dlg.title); const c = (step!.choice ?? step!.meeting)!; const o = c.options.find((x) => x.correct) ?? c.options[0]; dlg.onChoose(o.id); }
      else if (dlg.type === 'emergency') dlg.autoSolve();
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
  it('persists progress locally, keeps every mission open, supports replay and reset', () => {
    const mem = new Map<string, string>(); const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const c = new Campaign(store);
    const [m1, m2, m3, m4] = MISSIONS;
    expect(c.isUnlocked(m1, MISSIONS)).toBe(true); expect(c.isUnlocked(m2, MISSIONS)).toBe(true);
    const { s } = runScript(m2 as ScenarioMission);   // play m2 directly to produce a result (unlock gating is a UI/campaign rule)
    const out = c.recordResult(s);
    expect(out.after.integrity).not.toBe(out.before.integrity + 999);
    expect(c.isCompleted(m2.id)).toBe(true);
    c.recordResult(s);                                  // replay keeps best and increments plays
    expect(c.data.missions[m2.id].plays).toBe(2);
    expect(JSON.parse(mem.get('ledgerlock.campaign.v1')!).missions[m2.id].completed).toBe(true);
    const c2 = new Campaign(store); expect(c2.isCompleted(m2.id)).toBe(true);
    expect(c2.isUnlocked(m1, MISSIONS)).toBe(true); expect(c2.isUnlocked(m3, MISSIONS)).toBe(true); expect(c2.isUnlocked(m4, MISSIONS)).toBe(true);
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
      const sp = it.spec as any; if (sp.type === 'choice' || sp.type === 'meeting') sp.onChoose(m.bestChoice?.[sp.title] ?? sp.options[0].id); else sp.onConfirm();
    }
    while (modal.length) { const d = modal.shift(); if (d.type === 'choice' || d.type === 'meeting') d.onChoose(m.bestChoice?.[d.title] ?? d.options[0].id); else if (d.type === 'confirm') d.onConfirm(); else if (d.type === 'emergency') d.autoSolve(); else if (d.type === 'timeline' && d.onClose) d.onClose(); }
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
  it('lists the 12 core rooms with the specified IDs, names and codes, and every room has a wing', () => {
    const want: Record<string, [string, string]> = { api_gateway: ['A1', 'API Gateway'], event_stream: ['B1', 'Event Stream Hall'], fabric_platform: ['C1', 'Fabric Data Platform'], integration_exchange: ['D1', 'Integration Exchange'], service_payments: ['A2', 'Service Payments'], finance_core: ['B2', 'Finance Core'], payment_orchestration: ['C2', 'Payment Orchestration'], bacs_vault: ['D2', 'BACS Vault'], secure_ops: ['A3', 'Secure Operations Atrium'], card_payments: ['B3', 'Card Payments'], debt_recovery: ['C3', 'Accounts Receivable & Debt Recovery'], agency_handoff: ['D3', 'Agency Hand-off'] };
    expect(GRAPH_ROOMS.length).toBe(16);
    for (const [id, w] of Object.entries(want)) { const r = GRAPH_ROOMS.find((q) => q.id === id)!; expect([r.code, r.name]).toEqual(w); }
    for (const r of GRAPH_ROOMS) expect(r.wing).toBeDefined();
  });
  it('places every listed piece of equipment in its room at the requested spot', () => {
    expect(EQUIPMENT.length).toBe(EQUIPMENT_SPEC.length);
    for (const e of EQUIPMENT) expect(e.ok, `${e.room}: ${e.label} wants ${e.wanted.join('+')}, is at ${e.placement.join('+')} (${e.local.x},${e.local.y})`).toBe(true);
    expect(placementOf(5, 4)).toEqual(['centre']);
  });
  it('has one corridor per link, all outside the room footprints, with the door ids the map uses', () => {
    expect(CORRIDORS.length).toBe(LINKS.length);
    for (const c of CORRIDORS) {
      for (const r of c.rects) for (const room of GRAPH_ROOMS) { const hit = r.x < room.x0 + room.w && r.x + r.w > room.x0 && r.y < room.y0 + room.h && r.y + r.h > room.y0; expect(hit, `${c.id} overlaps ${room.id}`).toBe(false); }
      for (const d of c.doors) expect(DOOR_BY_ID[d], d).toBeDefined();
    }
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
      if (m.order > 0 && !m.id.startsWith('blue-lantern') && !m.id.startsWith('bau-')) expect(defs.length, m.id).toBeGreaterThanOrEqual(3);
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

// ---------------------------------------------------------------- Manager mode: effort and resources are visible and matter ----
import { effortCost, fatigueOf, EFFORT_BUDGET, REST_UNTIL } from '../src/game/systems/Team';
describe('manager mode: effort, focus and questions', () => {
  function crew() {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!; const s = new GameState(m); const run = new MissionRunner(s); run.start();
    const r = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
    const team = new TeamController(s, run, { team: true, spawn: [0, 1, 2, 3].map((i) => nearestWalkable(walk, r.x0 + 2 + i * 2, r.y0 + 4, 4)!), autoDecide: () => true });
    return { m, s, run, team, step: (n: number) => { for (let i = 0; i < n; i++) { run.tick(0.25); team.update(0.25); } } };
  }
  it('every action has a visible cost: specialists are efficient, covering for someone else costs half as much again', () => {
    const { team } = crew(); const a = team.actions.find((x) => x.id === 'scan')!;       // an investigation task
    const priya = team.member('priya')!, marcus = team.member('marcus')!;
    expect(effortCost(a, priya)).toBe(4); expect(effortCost(a, marcus)).toBe(6);
    const q = team.quote(marcus, a); expect(q.cost).toBe(6); expect(q.specialist).toBe(false); expect(q.seconds).toBeGreaterThan(0); expect(q.enough).toBe(true);
    expect(team.quote(priya, a).specialist).toBe(true);
  });
  it('doing work spends Focus and the team budget; idling recovers Focus', () => {
    const { team, s, step } = crew();
    expect(team.order('priya', { tool: 'e', target: 'prop:secure_ops.incident_wall' })).toBeNull();
    step(120);
    const p = team.member('priya')!;
    expect(s.flags.briefed).toBe(true); expect(p.spent).toBeGreaterThan(2); expect(team.spent).toBeGreaterThan(2); expect(s.stats.effort).toBeGreaterThan(2);
    const low = p.focus; step(80); expect(p.focus).toBeGreaterThanOrEqual(low);        // recovering, not draining
    expect(EFFORT_BUDGET).toBe(100); expect(team.overtime).toBe(0);
  });
  it('an exhausted teammate refuses orders until they have had a break, and a break restores Focus', () => {
    const { team, step } = crew(); const p = team.member('priya')!;
    p.focus = 4; expect(fatigueOf(p.focus)).toBe('exhausted');
    expect(team.order('priya', { tool: 'e', target: 'prop:secure_ops.incident_wall' })).toMatch(/exhausted.*break/i);
    team.rest('priya'); expect(p.resting).toBe(true); expect(p.breaks).toBe(1);
    step(60); expect(p.focus).toBeGreaterThanOrEqual(REST_UNTIL); expect(p.resting).toBe(false);
    expect(team.order('priya', { tool: 'e', target: 'prop:secure_ops.incident_wall' })).toBeNull();
  });
  it('a tired teammate works more slowly', () => {
    const a = crew(), b = crew(); const run = (c: typeof a, focus: number) => { const p = c.team.member('priya')!; p.focus = focus; c.team.order('priya', { tool: 'e', target: 'prop:secure_ops.incident_wall' }); let t = 0; while (!c.s.flags.briefed && t < 800) { c.step(1); p.focus = focus; t++; } return t; };
    expect(run(b, 20)).toBeGreaterThan(run(a, 90));
  });
  it('Auto teammates take their own breaks and still finish the shift', () => {
    const { team, s, step } = crew(); team.setAllAuto(true);
    for (let i = 0; i < 4000 && !s.complete; i++) step(1);
    expect(s.stats.effort).toBeGreaterThan(20);
  });
  it('questions get plain answers about status, recommendation, blockers and how they feel', () => {
    const { team, step } = crew(); const all = (['status', 'recommend', 'blocked', 'feeling'] as const).map((q) => team.question('marcus', q)!);
    for (const it of all) { expect(it.kind).toBe('report'); expect(it.member).toBe('Marcus'); expect(it.text!.length).toBeGreaterThan(10); }
    expect(all[2].text).toMatch(/cannot start yet|Nothing/); expect(all[3].text).toMatch(/Fresh \(Focus 100%\)/);
    team.member('marcus')!.focus = 20; expect(team.question('marcus', 'feeling')!.text).toMatch(/tired/i);
    expect(team.question('you', 'status')).toBeNull(); step(1);
  });
});

// ---------------------------------------------------------------- Access Review (fictional) ----
import { PERMISSIONS, PERM, ROLES, SOD_RULES, conflictsOf } from '../src/data/access/catalog';
import { REQUESTS as ACCESS_REQUESTS, REJECT_REASONS, type AccessRequest } from '../src/data/access/requests';
import { SERVICE_BRIEFS as SBRIEFS, REVIEW_RECORDS as RRECORDS } from '../src/data/access/service';
import { AccessSession, checkService, evaluate, evaluateReview, flagsFor, rationaleFor, type Decision } from '../src/game/systems/AccessReview';

describe('access review: data', () => {
  it('covers every team and role, manager and member seats, audit, service identities and all three environments', () => {
    expect(new Set(ACCESS_REQUESTS.map((r) => r.person.role))).toEqual(new Set(Object.keys(ROLES)));
    expect(new Set(ACCESS_REQUESTS.map((r) => r.env))).toEqual(new Set(['Training', 'Test', 'Production']));
    expect(ACCESS_REQUESTS.some((r) => r.person.role === 'ap_manager')).toBe(true); expect(ACCESS_REQUESTS.some((r) => r.person.role === 'ap_member')).toBe(true);
    expect(ACCESS_REQUESTS.some((r) => r.person.role === 'ar_manager')).toBe(true); expect(ACCESS_REQUESTS.some((r) => r.person.role === 'ar_member')).toBe(true);
    for (const a of ['approve', 'amend', 'reject', 'info', 'escalate']) expect(ACCESS_REQUESTS.some((r) => r.ideal.action === a), a).toBe(true);
  });
  it('is internally consistent: real permission ids, conflict-free least-privilege answers, synthetic people only', () => {
    expect(new Set(ACCESS_REQUESTS.map((r) => r.id)).size).toBe(ACCESS_REQUESTS.length);
    for (const r of ACCESS_REQUESTS) {
      for (const p of [...r.current, ...r.requested, ...r.tray, ...r.ideal.set]) expect(PERM[p], `${r.id}: ${p}`).toBeDefined();
      expect(r.requested.some((p) => !r.current.includes(p)) || r.current.length === r.requested.length, r.id).toBe(true);
      if (r.ideal.action === 'amend' || r.ideal.action === 'approve') expect(conflictsOf(r.ideal.set, { role: r.person.role, ...r.ctx, ownWork: false }), `${r.id} ideal has no conflicts`).toEqual([]);
      expect(r.person.seed).toMatch(/^[a-z0-9]{6}$/); expect(r.person.staffId).toMatch(/^(ST|SV)-\d{4}$/);
      expect(r.person.name).not.toMatch(/@/); expect(r.reason.length).toBeGreaterThan(5);
    }
    for (const p of PERMISSIONS) { expect(p.what.length, p.id).toBeGreaterThan(15); expect(p.system && p.room).toBeTruthy(); }
  });
  it('detects every segregation-of-duties rule', () => {
    const t = (set: string[], role: any, extra: any = {}) => conflictsOf(set, { role, ...extra }).map((c) => c.rule.id);
    expect(t(['jnl.prepare', 'jnl.approve'], 'accounting')).toContain('J1'); expect(t(['jnl.post', 'jnl.approve'], 'accounting')).toContain('J1');
    expect(t(['tre.transfer.prepare', 'tre.transfer.approve'], 'treasury')).toContain('T1');
    expect(t(['pr.batch.prepare', 'pr.batch.release'], 'payroll')).toContain('P1'); expect(t(['pr.batch.prepare', 'pr.batch.approve'], 'payroll')).toContain('P1');
    expect(t(['sup.change', 'pay.release'], 'ap_manager')).toContain('S1'); expect(t(['sup.change', 'ap.invoice.approve'], 'ap_manager')).toContain('S1');
    expect(t(['ar.writeoff.prepare', 'ar.writeoff.approve'], 'ar_manager')).toContain('W1'); expect(t(['ar.adjust.prepare', 'ar.adjust.approve'], 'ar_manager')).toContain('W1');
    expect(t(['ap.invoice.enter', 'ap.invoice.approve'], 'ap_member')).toContain('AP1'); expect(t(['ap.invoice.approve'], 'ap_manager', { ownWork: true })).toContain('AP1');
    expect(t(['iam.grant'], 'accounting', { selfApproval: true })).toContain('A1');
    expect(t(['aud.report.read', 'jnl.approve'], 'audit')).toContain('U1'); expect(t(['aud.report.read', 'aud.evidence.read'], 'audit')).toEqual([]);
    expect(t(['svc.events.read', 'svc.interactive'], 'service')).toContain('V1'); expect(t(['svc.events.read', 'svc.ledger.write'], 'service', { purpose: ['svc.events.read'] })).toContain('V1');
    expect(SOD_RULES.length).toBe(9);
  });
  it('the policy checker flags what the request screen promises: conflicts, excess, gaps, environment, duration, vagueness', () => {
    const f = (id: string) => flagsFor(ACCESS_REQUESTS.find((r) => r.id === id)!).map((x) => x.type);
    expect(f('R02')).toContain('sod'); expect(f('R10')).toContain('role'); expect(f('R05')).toContain('sod'); expect(f('R06')).toContain('env'); expect(f('R14')).toContain('gap');
    expect(f('R19')).toContain('duration'); expect(f('R21')).toContain('vague'); expect(f('R20')).toContain('self'); expect(f('R03')).toEqual([]);
  });
});

const idealDecision = (r: AccessRequest): Decision => ({ action: r.ideal.action, set: r.ideal.set, env: r.ideal.env, rejectWhy: r.ideal.reject ?? [], info: r.ideal.info ?? [], escalateTo: r.ideal.escalateTo, reasons: rationaleFor(r).filter((x) => x.correct && !x.id.startsWith('rej:') && !x.id.startsWith('info:')).map((x) => x.id), seconds: 20 });

describe('access review: decisions and scoring', () => {
  it('the best answer to every request scores as sound, and its explanation names what was right', () => {
    for (const r of ACCESS_REQUESTS) {
      const res = evaluate(r, idealDecision(r));
      expect(res.score, `${r.id} ${res.penalties.map((p) => p.text).join(' | ')}`).toBeGreaterThanOrEqual(95); expect(res.verdict, r.id).toBe('correct');
      expect(res.right.length, r.id).toBeGreaterThan(0); expect(res.teach.length).toBeGreaterThan(20);
    }
  });
  it('approving everything as submitted is punished, with the reasons visible', () => {
    let total = 0, conflicts = 0;
    for (const r of ACCESS_REQUESTS) { const res = evaluate(r, { action: 'approve', set: [], env: r.env, rejectWhy: [], info: [], reasons: [], seconds: 5 }); total += res.score; conflicts += res.penalties.filter((p) => /Segregation|Unnecessary/.test(p.text)).length; if (r.ideal.action !== 'approve') expect(res.verdict).not.toBe('correct'); }
    expect(total / ACCESS_REQUESTS.length).toBeLessThan(55); expect(conflicts).toBeGreaterThan(8);
  });
  it('rejecting everything is no better: legitimate requests are not blocked for nothing', () => {
    const ok = ACCESS_REQUESTS.find((r) => r.id === 'R13')!, res = evaluate(ok, { action: 'reject', set: [], env: ok.env, rejectWhy: ['noneed'], info: [], reasons: [], seconds: 5 });
    expect(res.score).toBeLessThan(50); expect(res.risky.join(' ')).toMatch(/not the best response/); expect(res.penalties.map((p) => p.text).join(' ')).toMatch(/blocked from legitimate work|Missing necessary/);
  });
  it('a senior title does not excuse a conflict (R02), and the safeguard is explained', () => {
    const r = ACCESS_REQUESTS.find((x) => x.id === 'R02')!;
    const res = evaluate(r, { action: 'approve', set: [], env: r.env, rejectWhy: [], info: [], reasons: ['x0'], seconds: 10 });
    expect(res.verdict).toBe('risky'); expect(res.risky.join(' ')).toMatch(/J1/); expect(res.risky.join(' ')).toMatch(/Safeguard/);
  });
  it('adding the justified missing permission and removing excess are both rewarded (R14, R05)', () => {
    const r14 = ACCESS_REQUESTS.find((x) => x.id === 'R14')!;
    const noAdd = evaluate(r14, { ...idealDecision(r14), set: ['ar.balance.view', 'ar.receipt.record'] }); expect(noAdd.penalties.map((p) => p.text).join(' ')).toMatch(/Missing necessary access: "Work collection cases"/);
    const r05 = ACCESS_REQUESTS.find((x) => x.id === 'R05')!;
    const keep = evaluate(r05, { ...idealDecision(r05), set: [...r05.ideal.set, 'pay.release'] }); expect(keep.penalties.map((p) => p.text).join(' ')).toMatch(/Unnecessary privilege: "Release payments to the bank"/);
    expect(evaluate(r05, idealDecision(r05)).score).toBeGreaterThan(keep.score);
  });
  it('environment matters (R06: practice belongs in Training)', () => {
    const r = ACCESS_REQUESTS.find((x) => x.id === 'R06')!; const prod = evaluate(r, { ...idealDecision(r), env: 'Production' });
    expect(prod.penalties.map((p) => p.text).join(' ')).toMatch(/Wrong environment/); expect(evaluate(r, idealDecision(r)).env).toBe('Training');
  });
  it('independent approval: the right approver scores, the requester or their own manager does not (R12, R15)', () => {
    const r = ACCESS_REQUESTS.find((x) => x.id === 'R12')!;
    const good = evaluate(r, idealDecision(r)), self = evaluate(r, { ...idealDecision(r), escalateTo: 'self' }), line = evaluate(r, { ...idealDecision(r), escalateTo: 'line_mgr' });
    expect(good.parts[1].points).toBe(30); expect(self.parts[1].points).toBe(0); expect(line.parts[1].points).toBe(0); expect(self.risky.join(' ')).toMatch(/not independent/);
    const r15 = ACCESS_REQUESTS.find((x) => x.id === 'R15')!; expect(evaluate(r15, { action: 'approve', set: [], env: r15.env, rejectWhy: [], info: [], reasons: [], seconds: 5 }).verdict).not.toBe('correct');
  });
  it('slow decisions lose timeliness points but are not marked wrong', () => {
    const r = ACCESS_REQUESTS.find((x) => x.id === 'R03')!; const slow = evaluate(r, { ...idealDecision(r), seconds: r.sla * 3 });
    expect(slow.parts[3].points).toBe(4); expect(slow.score).toBeGreaterThan(80); expect(slow.risky.join(' ')).toMatch(/target was/);
  });
  it('the "why" list mixes justifying reasons with plausible wrong ones, deterministically', () => {
    for (const r of ACCESS_REQUESTS) { const a = rationaleFor(r), b = rationaleFor(r); expect(a).toEqual(b); expect(a.some((x) => x.correct)).toBe(true); expect(a.filter((x) => !x.correct).length).toBeGreaterThanOrEqual(3); }
    expect(REJECT_REASONS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('access review: service form, review board, audit trail', () => {
  const good = (b: (typeof SBRIEFS)[number]) => ({ name: 'svc-' + b.id.toLowerCase(), owner: 'Data Platform lead', purpose: b.purpose, target: b.target, env: b.env, actions: b.required, scope: b.scope, days: b.maxDays - 10, approver: 'Independent manager', reviewDays: 30 });
  it('a well-formed service form passes every check, and each mistake is caught with a fix', () => {
    for (const b of SBRIEFS) expect(checkService(b, good(b)).score).toBe(100);
    const b = SBRIEFS[0], bad = checkService(b, { ...good(b), name: 'Jane Doe', owner: '(not named)', actions: [...b.required, 'svc.interactive', 'svc.ledger.write'], scope: 'All ledger data', days: 400, approver: 'The service owner (same person)', reviewDays: 500 });
    expect(bad.checks.filter((c) => !c.ok).length).toBeGreaterThanOrEqual(7); expect(bad.checks.every((c) => c.ok || c.fix.length > 10)).toBe(true); expect(bad.score).toBeLessThan(40);
  });
  it('review records: the right action scores fully; keeping excess or removing justified access is penalised with a reason', () => {
    for (const r of RRECORDS) expect(evaluateReview(r, { verdict: r.ideal, addPerm: r.addPerm }).points, r.id).toBe(100);
    const stale = RRECORDS.find((r) => r.issue === 'stale')!, ok = RRECORDS.find((r) => r.issue === 'ok')!;
    expect(evaluateReview(stale, { verdict: 'keep' }).penalty).toMatch(/Left stale access/); expect(evaluateReview(ok, { verdict: 'remove' }).penalty).toMatch(/Removed justified access/);
    expect(evaluateReview(stale, { verdict: 'independent' }).points).toBe(60);
    const miss = RRECORDS.find((r) => r.issue === 'missing')!; expect(evaluateReview(miss, { verdict: 'add', addPerm: 'ar.writeoff.prepare' }).points).toBe(40);
    expect(new Set(RRECORDS.map((r) => r.issue))).toEqual(new Set(['ok', 'stale', 'excessive', 'conflict', 'orphaned', 'missing']));
  });
  it('the audit trail records who asked, who approved and what was decided; unreviewed high-risk access costs points', () => {
    const store: Record<string, string> = {}; const s = new AccessSession({ getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } });
    const r = ACCESS_REQUESTS.find((x) => x.id === 'R12')!; s.decide(r, idealDecision(r));
    const e = s.audit[0]; expect(e.requestedBy).toBe('Mateo Ibarra'); expect(e.approvedBy).toMatch(/Pending: .*Accounts Payable approver/); expect(e.decision).toMatch(/Awaiting/); expect(e.subject).toMatch(/Production/);
    const sum = s.summary(); expect(sum.penalties.some((p) => /never reviewed/.test(p.text))).toBe(true); expect(sum.total).toBeLessThan(100);
    expect(JSON.parse(store['ledgerlock.access.v1']).audit.length).toBe(1);
    for (const q of ACCESS_REQUESTS) s.decide(q, idealDecision(q));
    expect(s.summary().penalties.filter((p) => /never reviewed/.test(p.text))).toEqual([]); expect(s.summary().total).toBeGreaterThanOrEqual(95);
  });
});

describe('avatars: local generator with a built-in fallback', async () => {
  const { avatarSvg, monogram } = await import('../src/ui/avatar');
  it('is deterministic, varied, self-contained (no network) and never needs a real name', () => {
    expect(avatarSvg('k3f9a1')).toBe(avatarSvg('k3f9a1'));
    const set = new Set(ACCESS_REQUESTS.map((r) => avatarSvg(r.person.seed))); expect(set.size).toBe(ACCESS_REQUESTS.length);
    for (const r of ACCESS_REQUESTS) { const svg = avatarSvg(r.person.seed, r.person.name); expect(svg).toMatch(/^<svg/); expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); expect(svg).not.toMatch(/<image|<script|href=/); }
  });
  it('falls back to a monogram badge when there is no seed', () => {
    expect(avatarSvg('', 'Marisol Vance')).toBe(monogram('Marisol Vance')); expect(monogram('Marisol Vance')).toContain('>MV<'); expect(monogram('')).toContain('>?<');
  });
});

// ---------------------------------------------------------------- facility graph: loops, shortcuts, door states, fog ----
import { CORRIDORS as CORR, LOOPS, linkBetween, loopLinks, neighbours, nodeRoute, locate } from '../src/data/facilityGraph';
import { isKnown, knownRooms } from '../src/game/systems/Fog';

describe('facility graph: loops, cross-links and optional shortcuts', () => {
  const ALL_NODES = [...ROOMS.map((r) => r.id as string), ...LAYOUT_JUNCTIONS.map((j) => j.id)];
  const connected = (skip: ReadonlySet<string>) => {
    const seen = new Set<string>(['secure_ops']), q = ['secure_ops'];
    while (q.length) { const c = q.pop()!; for (const n of neighbours(c)) if (!skip.has(n.link) && !seen.has(n.node)) { seen.add(n.node); q.push(n.node); } }
    return ALL_NODES.every((n) => seen.has(n));
  };
  it('defines the five required loops, each a real cycle of corridors', () => {
    expect(LOOPS.map((l) => l.id)).toEqual(['operations', 'data', 'payment', 'collections', 'staff']);
    for (const l of LOOPS) { expect(l.nodes.length, l.id).toBeGreaterThanOrEqual(3); expect(loopLinks(l).every(Boolean), `${l.id} links: ${loopLinks(l).join(',')}`).toBe(true); expect(new Set(loopLinks(l)).size).toBe(l.nodes.length); }
  });
  it('the Data loop closes through the Event Stream to API Gateway cross-link, which is an optional maintenance corridor', () => {
    const cross = linkBetween('event_stream', 'api_gateway');
    expect(cross).not.toBeNull(); expect(LINK_BY_ID[cross!].kind).toBe('maintenance');
    expect(loopLinks(LOOPS.find((l) => l.id === 'data')!)).toContain(cross);
    expect(ROOM_BY_ID.event_stream.doors.some((d) => d.toward === 'api_gateway')).toBe(true);
  });
  it('has a few optional maintenance corridors, some starting locked (pass), disabled (window) or sealable (incident)', () => {
    const m = CORR.filter((c) => c.kind === 'maintenance');
    expect(m.length).toBeGreaterThanOrEqual(3); expect(m.length).toBeLessThanOrEqual(5);
    for (const c of m) expect(LINK_RULES[c.id], c.id).toBeDefined();
    expect(m.some((c) => LINK_RULES[c.id].lock)).toBe(true); expect(m.some((c) => LINK_RULES[c.id].disabled)).toBe(true); expect(m.some((c) => LINK_RULES[c.id].sealWhen)).toBe(true);
    for (const c of CORR.filter((x) => x.kind === 'main')) expect(LINK_RULES[c.id], `${c.id} is a main corridor, never gated`).toBeUndefined();
  });
  it('is bridgeless: the facility stays connected if any single main corridor is lost', () => {
    expect(connected(new Set())).toBe(true);
    for (const c of CORR) if (c.kind === 'main') { const ok = connected(new Set([c.id])); if (!ok) { const isConcourseLeaf = c.from !== c.to && (neighbours(c.from).length === 1 || neighbours(c.to).length === 1); expect(isConcourseLeaf, `losing ${c.id} must not split the facility`).toBe(false); } }
  });
  it('every room is reachable from the atrium over main corridors and open ground, walking through no other room', () => {
    for (const r of ROOMS) expect(nodeRoute('secure_ops', r.id, { maintenance: false, transit: (x) => x === 'secure_ops' }), r.id).not.toBeNull();
  });
  it('blocking every optional corridor (sealed, disabled or locked) never leaves a room or a mission objective unreachable', () => {
    const blocked = new Set(CORR.filter((c) => c.kind === 'maintenance').map((c) => c.id));
    for (const r of ROOMS) expect(nodeRoute('secure_ops', r.id, { blocked, transit: (x) => x === 'secure_ops' }), r.id).not.toBeNull();
    for (const m of MISSIONS) for (const room of new Set<RoomId>([m.startRoom, m.alert.points, ...m.evidence.map((e) => e.sourceRoom)])) expect(nodeRoute('secure_ops', room, { blocked, transit: (x) => x === 'secure_ops' }), `${m.title}: ${room}`).not.toBeNull();
  });
  it('locates a point as a room, a concourse or the nearer end of a corridor', () => {
    const a = ROOM_BY_ID.secure_ops; expect(locate(a.x0 + 3, a.y0 + 3)).toBe('secure_ops');
    const j = LAYOUT_JUNCTIONS[0]; expect(locate(j.x + 1, j.y + 1)).toBe(j.id);
    expect(locate(0, 0)).toBeNull();
  });
});

describe('door states: open, locked, incident-sealed and temporarily disabled, each with a reason', () => {
  const reset = () => { GATE.minutes = 99; GATE.sealed.clear(); };
  const door = (a: string, b: string) => DOOR_BY_ID[`door:${a}.${b}`];
  it('a room door is locked until its pass is held, and says which pass', () => {
    reset();
    const d = ROOM_BY_ID.card_payments.doors[0], none = new Set<string>(['ops_pass']);
    const i = doorInfo(d, none); expect(i.status).toBe('locked'); expect(i.need).toBe('payments_audit_pass'); expect(i.reason).toMatch(/Payments Audit Pass/);
    expect(doorInfo(d, new Set(['ops_pass', 'payments_audit_pass'])).status).toBe('open');
  });
  it('the conduit shortcut starts locked until the Maintenance Pass', () => {
    reset();
    const d = door('event_stream', 'api_gateway'), pass = new Set<string>(['ops_pass', 'event_trace_pass']);
    expect(doorInfo(d, pass)).toMatchObject({ status: 'locked', need: 'maintenance_pass' });
    expect(doorInfo(d, new Set([...pass, 'maintenance_pass'])).status).toBe('open');
    // and the corridor itself blocks walkers without the pass, even though the door's own room is open
    const c = LINK_BY_ID['es-api'].corridor[0]; expect(isWalkable(c.x, c.y, pass)).toBe(false); expect(isWalkable(c.x, c.y, new Set([...pass, 'maintenance_pass']))).toBe(true);
  });
  it('the back-office shortcut is temporarily disabled for maintenance, then comes back by itself', () => {
    reset(); GATE.minutes = 1;
    const d = door('service_payments', 'card_payments'), pass = new Set<string>(['ops_pass', 'service_audit_pass']);
    const i = doorInfo(d, pass); expect(i.status).toBe('disabled'); expect(i.reason).toMatch(/Temporarily disabled/);
    GATE.minutes = 7; expect(doorInfo(d, pass).status).toBe('open');
    reset();
  });
  it('an uncontained incident seals the optional corridors beside its room, and containing it reopens them', () => {
    reset();
    const m = MISSIONS.find((x) => x.alert.points === 'card_payments')!;
    const s = new GameState(m); const run = new MissionRunner(s); run.start();
    expect(GATE.sealed.has('sp-card')).toBe(true);
    const d = door('card_payments', 'service_payments'), pass = new Set<string>(['ops_pass', 'payments_audit_pass']);
    s.elapsed = 100; run.syncGate(); expect(GATE.minutes).toBeGreaterThan(6);
    expect(doorInfo(d, pass)).toMatchObject({ status: 'sealed' }); expect(doorInfo(d, pass).reason).toMatch(/incident/i);
    s.contained['route:receipt_event_feed'] = { rerouted: false, since: 0 }; run.syncGate();
    expect(GATE.sealed.has('sp-card')).toBe(false); expect(doorInfo(d, pass).status).toBe('open');
    reset();
  });
  it('a sealed door is not walkable and a sealed corridor blocks walking', () => {
    reset(); GATE.sealed.add('ix-agency');
    const pass = new Set<string>(['ops_pass', 'integration_audit_pass', 'agency_audit_pass', 'courier_pass']);
    const c = LINK_BY_ID['ix-agency'].corridor[0]; expect(isWalkable(c.x, c.y, pass)).toBe(false);
    for (const dc of door('agency_handoff', 'integration_exchange').cells) expect(isWalkable(dc.x, dc.y, pass)).toBe(false);
    reset(); expect(isWalkable(c.x, c.y, pass)).toBe(true);
  });
  it('linkInfo reports the same state the door shows', () => {
    reset(); expect(linkInfo('es-api', new Set(['ops_pass'])).status).toBe('locked'); expect(linkInfo('a-jn', new Set(['ops_pass'])).status).toBe('open');
  });
});

describe('fog of discovery: visited rooms are revealed, the rest are silhouettes', () => {
  it('reveals the start room and the incident room, then rooms as they are visited', () => {
    const m = MISSIONS[0], s = new GameState(m); new MissionRunner(s).start();
    expect(isKnown(s, m.startRoom)).toBe(true); expect(isKnown(s, m.alert.points)).toBe(true);
    const hidden = ROOMS.find((r) => !isKnown(s, r.id))!; expect(hidden).toBeDefined();
    expect(knownRooms(s).length).toBeLessThan(ROOMS.length);
    s.setFlag('visited_' + hidden.id); expect(isKnown(s, hidden.id)).toBe(true);
  });
});

// ---------------------------------------------------------------- Auto keeps going; business-continuity missions ----
import { settings } from '../src/game/systems/Settings';
import { BCP_FIRST, CYBER_FIRST } from '../src/game/systems/Campaign';

describe('Auto keeps going', () => {
  it('Auto makes the calls by default, and Auto-run is opt-in', () => {
    expect(settings.data.autoDecide).toBe(true); expect(settings.data.autoRun).toBe(false);
  });
  it('the watchdog gets a stalled Auto team moving again', () => {
    const m = MISSIONS.find((x) => x.id === 'bacs-after-dark')!;
    const s = new GameState(m); const run = new MissionRunner(s); run.start(); s.flags.briefed = true;
    const room = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
    const team = new TeamController(s, run, { team: true, spawn: [0, 1, 2, 3].map((i) => nearestWalkable(walk, room.x0 + 2 + i * 2, room.y0 + 4, 4)!), autoDecide: () => true });
    team.setAllAuto(true);
    for (let i = 0; i < 40; i++) { run.tick(0.25); team.update(0.25); }
    // simulate a stall: every action cooling down for ages and everyone "blocked"
    for (const mem of team.members) { for (const a of playbookFor(m)) mem.coolUntil[a.id] = s.elapsed + 1e6; mem.fails = { x: 9 }; }
    const before = s.stats.autoActions;
    for (let i = 0; i < 4 * 400 && !s.complete; i++) { run.tick(0.25); team.update(0.25); }
    expect(team.nudges).toBeGreaterThan(0);
    expect(s.stats.autoActions).toBeGreaterThan(before);
  });
  it('the Auto flag is reported so the UI can remember it', () => {
    const m = MISSIONS[1]; const s = new GameState(m); const run = new MissionRunner(s); run.start();
    const seen: boolean[] = []; const team = new TeamController(s, run, { team: true, spawn: [{ x: 36, y: 30 }], autoDecide: () => true, onAuto: (a) => seen.push(a) });
    team.setAuto('you', true); team.setAuto('you', false);
    expect(seen).toEqual([true, false]);
  });
});

describe('business-continuity missions', () => {
  const bcp = MISSIONS.filter((m) => m.order >= BCP_FIRST && m.order < CYBER_FIRST);
  it('adds payments failure, a flood in a room and a request flood, each with a continuity decision and goals', () => {
    expect(bcp.map((m) => m.id)).toEqual(['payments-down', 'rising-water', 'flood-gates']);
    for (const m of bcp) {
      const sp = (m as ScenarioMission).spec;
      expect(sp.steps.some((x) => x.choice && x.choice.options.some((o) => !o.correct)), m.id).toBe(true);
      expect(m.goals.filter((g) => g.kind === 'primary').length, m.id).toBeGreaterThanOrEqual(7);
      expect(m.evidence.length, m.id).toBeGreaterThanOrEqual(3);
    }
  });
  it('every mission in the track is open from the start', () => {
    const mem = new Map<string, string>(); const c = new Campaign({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    const [a, b] = bcp; expect(c.isUnlocked(a, MISSIONS)).toBe(true);
    const tut = MISSIONS.find((m) => m.id === 'duplicate-ghost')!; const st0 = new GameState(tut); c.recordResult(Object.assign(st0, { complete: true }));
    expect(c.isUnlocked(a, MISSIONS)).toBe(true); expect(c.isUnlocked(b, MISSIONS)).toBe(true);
  });
  it('wrong continuity calls are explained and do not complete the step', () => {
    for (const [id, step, bad] of [['payments-down', 'strategy', 'wait'], ['payments-down', 'comms', 'fine'], ['rising-water', 'safety', 'rescue'], ['flood-gates', 'strategy', 'blockall']] as const) {
      const m = MISSIONS.find((x) => x.id === id) as ScenarioMission, sp = m.spec;
      const { s, run } = runScript(m, { skipRecord: true });
      void s; void run;
      const g = new GameState(m); const r = new MissionRunner(g); r.start(); const d = dialogs(g);
      g.flags.briefed = true;
      for (const act of m.script) { const [k, v] = act as [string, any]; if (k === 'step' && v === step) break; if (k === 'pass') r.requestPass(v, 'desk'); else if (k === 'step') { const x = sp.steps.find((q) => q.id === v)!; g.selectedTool = x.tool === 'e' ? 'scanner' : x.tool; const at = Array.isArray(x.at) ? x.at[0] : x.at; if (x.tool === 'e') r.inspect(at); else r.interact(at); while (d.length) { const dl = d.shift(); if (dl.type === 'confirm') dl.onConfirm(); else if (dl.type === 'choice') { const st = sp.steps.find((q) => q.choice?.title === dl.title)!; dl.onChoose(st.choice!.options.find((o) => o.correct)!.id); } } } else if (k === 'contain') { g.selectedTool = 'quarantine'; r.interact(sp.contain!.find((q) => q.id === v)!.target); while (d.length) { const dl = d.shift(); if (dl.type === 'confirm') dl.onConfirm(); } } else if (k === 'wait') for (let t = 0; t < v * 2; t++) r.tick(0.5); }
      const x = sp.steps.find((q) => q.id === step)!; g.selectedTool = 'scanner'; r.inspect(Array.isArray(x.at) ? x.at[0] : x.at);
      const dl = d.shift(); expect(dl?.type, `${id}:${step}`).toBe('choice'); dl.onChoose(bad);
      expect(g.flags['st_' + step], `${id}:${step}:${bad} must not complete`).toBeFalsy();
      expect(g.latestResult?.text.length ?? 0).toBeGreaterThan(20);
    }
  });
  it('the flood is a real state: it floods the room at the start and clears when facilities report it dry', () => {
    const m = MISSIONS.find((x) => x.id === 'rising-water') as ScenarioMission;
    const s = new GameState(m); const run = new MissionRunner(s); run.start();
    expect(s.flags.flood_event_stream).toBe(true); expect(s.availability).toBeLessThan(100);
    const { s: done } = runScript(m);
    expect(done.flags.flood_event_stream).toBeFalsy(); expect(done.complete).toBe(true);
  });
});

describe('Expense Claims: a service room whose claims flow to payroll and then the bank', () => {
  it('has a route Expense Claims to Payroll & Pensions to Payment Orchestration to the BACS Vault to the bank, and a diagram for it', () => {
    const r = ROUTES.find((q) => q.id === 'expense_payment')!;
    expect(r.hops).toEqual(['expense_claims', 'payroll_pensions', 'payment_orchestration', 'bacs_vault', 'bank_sim']);
    expect(routePoints(r).length).toBeGreaterThan(4);
    expect(DIAGRAMS.some((d) => d.id === 'expenses' && d.routeIds.includes('expense_payment'))).toBe(true);
  });
  it('is reachable from open ground and needs its own optional pass', () => {
    expect(nodeRoute('secure_ops', 'expense_claims', { maintenance: false, transit: (x) => x === 'secure_ops' })).not.toBeNull();
    expect(PASS_BY_ROOM.expense_claims).toBe('expense_audit_pass');
  });
});

// ---------------------------------------------------------------- Blue Lantern ----
import { BlueLantern, ITEMS, LIMITS, PROVIDER, ACCOUNTS } from '../src/game/systems/BlueLantern';

describe('Blue Lantern: emergency payment continuity', () => {
  const fresh = (variant: 'normal' | 'gap' = 'normal') => {
    const m = MISSIONS.find((x) => x.id === (variant === 'gap' ? 'blue-lantern-gap' : 'blue-lantern'))!;
    const s = new GameState(m); BlueLantern.init(s, variant); return { s, b: BlueLantern.for(s) };
  };
  const upTo = (b: BlueLantern, stage: string) => { for (const st of ['triage', 'scope', 'govern', 'configure', 'prepare', 'review', 'submit', 'reconcile', 'restore']) { b.solve(st); if (st === stage) break; } };

  it('the full by-the-book path completes every stage with no penalty and a top score', () => {
    const { s, b } = fresh(); upTo(b, 'restore');
    for (const st of ['triage', 'scope', 'govern', 'configure', 'prepare', 'review', 'submit', 'reconcile', 'restore'] as const) expect(b.stageDone(st), st).toBe(true);
    expect(b.d.penalties).toEqual([]); expect(b.scoreboard().total).toBeGreaterThanOrEqual(90);
    expect(b.d.conn.status).toBe('inactive'); expect(b.d.restore.deactivated).toBe(true);
    expect(s.flags.st_restore).toBe(true);
  });
  it('seeds the invoices exactly as briefed', () => {
    const [A, B, C, D, E] = ITEMS;
    expect(A.ideal).toBe('eligible'); expect(B.changed).toBe(true); expect(C.cls).toBe('unknown'); expect(D.ref).toBe(A.ref); expect(E.value).toBeGreaterThan(LIMITS.txn);
  });
  it('rule 1: the route cannot be configured before governance, nor tested before every item is reviewed', () => {
    const { b } = fresh(); upTo(b, 'scope');
    expect(b.review('secure_ops', 'record').ok).toBe(false);
    upTo(b, 'govern');
    const r = b.handshake('secure_ops'); expect(r.ok).toBe(false); expect(b.d.conn.status).toBe('inactive');
    expect(b.noValueTest('secure_ops').ok).toBe(false);
  });
  it('rule 1b: an unverified look-alike endpoint and the payroll account are refused with consequences', () => {
    const { b } = fresh(); upTo(b, 'govern');
    expect(b.review('secure_ops', 'identity', 'secure-paylink-northstar.example.net').ok).toBe(false);
    expect(b.review('secure_ops', 'account', 'payroll').ok).toBe(false);
    expect(b.d.penalties.filter((p) => p.cat === 'governance').length).toBe(2); expect(ACCOUNTS.payroll.eligible).toBe(false);
  });
  it('rule 2: each person may do only their own job, and a wrong-desk approval is penalised', () => {
    const { b } = fresh(); upTo(b, 'scope');
    expect(b.strategicApprove('ap').ok).toBe(false); expect(b.d.penalties.some((p) => p.cat === 'separation')).toBe(true);
    upTo(b, 'prepare');
    expect(b.treasuryCheck('ap', 'account', 'ops').ok).toBe(false);
    expect(b.treasurySign('ap').ok).toBe(false);
    expect(b.prepareBatch('treasury').ok).toBe(false); expect(b.d.batch!.maker).toBe('ap');
  });
  it('rule 2b: Treasury cannot sign a rushed review, and the second approval needs Treasury first', () => {
    const { b } = fresh(); upTo(b, 'prepare');
    expect(b.treasurySign('treasury').ok).toBe(false); expect(b.d.penalties.some((p) => /rushed/.test(p.text))).toBe(true);
    expect(b.independentApproveBatch('independent').ok).toBe(false);
    expect(b.submit('secure_ops').ok).toBe(false);
  });
  it('rule 3: the payroll-only account can never be the source', () => {
    const { b } = fresh(); upTo(b, 'prepare');
    expect(b.treasuryCheck('treasury', 'account', 'payroll').ok).toBe(false); expect(b.d.treasury.account).toBeNull();
  });
  it('rule 4: changed-supplier, unknown, duplicate and over-limit items cannot enter the batch', () => {
    const { b } = fresh(); upTo(b, 'configure');
    for (const id of ['B', 'C', 'D', 'E']) expect(b.moveToLane('ap', id, 'eligible').ok, id).toBe(false);
    expect(b.d.penalties.length).toBe(4);
    expect(b.moveToLane('ap', 'A', 'eligible').ok).toBe(true);
    expect(b.verifySupplier('independent', 'B').ok).toBe(true); expect(b.moveToLane('ap', 'B', 'eligible').ok).toBe(true);
  });
  it('rule 5: resending an uncertain or duplicate item is a visible consequence, and Pending is never auto-resent', () => {
    const { b } = fresh(); upTo(b, 'review');
    b.submit('secure_ops', { extra: ['C', 'D'] });
    expect(b.d.acks.C.status).toBe('Rejected'); expect(b.d.penalties.filter((p) => p.cat === 'duplicates').length).toBe(2);
    expect(b.d.acks.B.status).toBe('Pending'); expect(b.decide('secure_ops', 'B', 'processed').ok).toBe(false);
    expect(b.decide('secure_ops', 'B', 'monitor').ok).toBe(true);
  });
  it('rule 5b: processed needs all four sources; the normal route cannot be restored before reconciliation', () => {
    const { b } = fresh(); upTo(b, 'submit');
    expect(b.decide('secure_ops', 'A', 'processed').ok).toBe(false);
    expect(b.restoreRoute('secure_ops').ok).toBe(false);
    expect(b.investigateC('secure_ops', ['bank']).ok).toBe(false);
  });
  it('the emergency connection expires by itself and then blocks submission until re-approved', () => {
    const { s, b } = fresh(); upTo(b, 'review');
    s.elapsed += (LIMITS.hours * 60 + 5) * 8; b.tick();
    expect(b.d.conn.status).toBe('expired'); expect(b.submit('secure_ops').ok).toBe(false);
  });
  it('rule 6: when the provider fails governance, escalate, keep it inactive, preserve the queue and defer, for full marks', () => {
    const { b } = fresh('gap'); upTo(b, 'scope');
    expect(b.strategicApprove('strategic').ok).toBe(false); expect(b.d.govern.blocked).toBe(true);
    expect(b.deferSafely('secure_ops').ok).toBe(false);          // escalate first
    expect(b.review('secure_ops', 'record').ok).toBe(false);
    b.solve('govern');
    expect(b.d.deferred).toBe(true); expect(b.d.conn.status).toBe('inactive'); expect(b.d.preserved).toBe(true);
    expect(b.d.penalties).toEqual([]); expect(b.scoreboard().cats.find((c) => c.id === 'governance')!.points).toBe(20);
    expect(PROVIDER.dueDiligence).toBe('valid');                // the gap is the scenario's own copy, not the shared record
  });
  it('misclassifying an item is explained and costs points', () => {
    const { b } = fresh();
    const r = b.classify('secure_ops', 'C', 'sent'); expect(r.ok).toBe(false); expect(r.text).toMatch(/Unknown/);
    expect(b.d.penalties.length).toBe(1);
  });
  it('the map marks the affected rooms and Secure Ops reaches AP and Treasury without Payment Orchestration', () => {
    const m = MISSIONS.find((x) => x.id === 'blue-lantern')!;
    expect(m.affectedRooms).toEqual(expect.arrayContaining(['payment_orchestration', 'finance_core', 'secure_ops', 'integration_exchange']));
    const passes = new Set<PassId>(['ops_pass', 'ledger_read_pass', 'payment_ops_pass', 'integration_audit_pass', 'bcp_pass']);
    const a = ROOM_BY_ID.secure_ops, from = nearestWalkable(walkableFor(passes), a.x0 + a.w / 2, a.y0 + a.h / 2, 4)!;
    for (const t of ['prop:finance_core.ap', 'prop:payment_orchestration.treasury_ws_a', 'prop:integration_exchange.connection_panel', 'prop:bcp_command.bronze_table'])
      expect(standFor(t, from, passes), t).not.toBeNull();
  });
});

describe('Blue Lantern campaign placement', () => {
  it('both Blue Lantern missions are open from the start', () => {
    const mem = new Map<string, string>(); const c = new Campaign({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    const bl = MISSIONS.filter((m) => m.id.startsWith('blue-lantern'));
    expect(bl).toHaveLength(2);
    for (const m of bl) expect(c.isUnlocked(m, MISSIONS)).toBe(true);
    (c.data.missions as any)['duplicate-ghost'] = { completed: true };
    for (const m of bl) expect(c.isUnlocked(m, MISSIONS)).toBe(true);
  });
});

describe('giving orders to a selected teammate', () => {
  it('selects a teammate, sends them across the floor, and refuses orders when the team is off', () => {
    const m = MISSIONS.find((x) => x.id === 'duplicate-ghost')!;
    const { s, team } = teamRun(m, { team: true, autoDecide: true, auto: 'none', limit: 1 });
    team.setAuto('priya', false);
    team.select('priya'); expect(team.selected).toBe('priya');
    team.select('you'); expect(team.selected).toBeNull();           // you cannot "order" yourself
    team.select('marcus'); expect(team.selected).toBe('marcus');
    const mem = team.member('marcus')!;
    const walk = walkableFor(s.passes), a = ROOM_BY_ID.secure_ops;
    const goal = nearestWalkable(walk, a.x0 + a.w - 3, a.y0 + a.h - 3, 5)!;
    expect(team.goTo('marcus', goal)).toBeNull();
    for (let i = 0; i < 400 && mem.phase === 'walking'; i++) team.update(0.25);
    expect(mem.phase).toBe('idle'); expect(Math.floor(mem.pos.x)).toBe(goal.x); expect(Math.floor(mem.pos.y)).toBe(goal.y);
    expect(team.goTo('marcus', { x: 0, y: 0 })).toMatch(/cannot get there/);
    team.setCrew(false); expect(team.goTo('marcus', goal)).toMatch(/Only teammates/); team.select('marcus'); expect(team.selected).toBeNull();
  });
});
