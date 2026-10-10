import { DOORS, GRID, JUNCTION_BY_ID, NODE_BY_ID, NODES, isRoomNode, EXTERNALS, EXTERNAL_BY_ID, FAC_H, FAC_W, FAC_X0, FAC_Y0, LINKS, LINK_RULES, ROOMS, ROOM_BY_ID, ENTRANCE } from './map';
import { LAYOUT_ROOMS } from './layout';
import { BAYS, WING_NAMES, type BayDef, type Wing } from './rooms';
import { ROUTES, ROUTE_BY_ID, routePoints, routeRooms } from './routes';
import { PASSES } from './passes';
import type { DoorDef, PropDef, RoomId, RouteDef, RouteType, Side } from '../game/types';
import type { MissionDef } from './missions/types';
import type { ScenarioMission } from './missions/scenario';

/**
 * The facility graph: ONE typed description of the building that the in-game map, the minimap, the system diagrams, the room
 * blueprints, route highlights and waypoints are all generated from. It is derived from the gameplay data (ROOMS, CONNECTIONS,
 * EXTERNALS, ROUTES), so nothing about the topology is copied into UI code.
 */

// ---------------------------------------------------------------- equipment (the blueprint matches the playable scene) ----
export type Placement = 'north' | 'south' | 'east' | 'west' | 'centre';
/** Which parts of a room (room-local cell lx 0..9, ly 0..7) a cell belongs to. A cell can be in several (a corner is two). */
export function placementOf(lx: number, ly: number): Placement[] {
  const out: Placement[] = [];
  if (ly <= 1) out.push('north'); if (ly >= 6) out.push('south'); if (lx <= 2) out.push('west'); if (lx >= 7) out.push('east');
  if (lx >= 3 && lx <= 6 && ly >= 2 && ly <= 5) out.push('centre');
  return out;
}
export interface EquipmentSpec { room: RoomId; label: string; key: string; want: Placement[] }
const E = (room: RoomId, label: string, key: string, ...want: Placement[]): EquipmentSpec => ({ room, label, key, want });
/** The required in-room equipment and where each item stands (from the design brief). `key` is the prop's key in the room. */
export const EQUIPMENT_SPEC: EquipmentSpec[] = [
  E('secure_ops', 'Incident Wall', 'incident_wall', 'north'), E('secure_ops', 'Access Desk', 'access_desk', 'west', 'south'),
  E('secure_ops', 'Evidence Board', 'evidence_board', 'east'), E('secure_ops', 'Building map', 'map_table', 'south'), E('secure_ops', 'Communications console', 'comms_console', 'south'),
  E('service_payments', 'Request intake kiosk', 'intake_terminal', 'west'), E('service_payments', 'Validation desk', 'validation_desk', 'centre'), E('service_payments', 'Queue monitor', 'validation_queue', 'north'),
  E('api_gateway', 'Request-flow console', 'gateway_console', 'centre'), E('api_gateway', 'Authentication-status panel', 'auth_terminal', 'north'),
  E('card_payments', 'Card terminal', 'card_terminal', 'centre'), E('card_payments', 'Masked receipt-log terminal', 'receipt_log', 'east'),
  E('event_stream', 'Queue display', 'queue_monitor', 'north'), E('event_stream', 'Event-lane console A', 'lane_console_a', 'centre'), E('event_stream', 'Event-lane console B', 'lane_console_b', 'centre'), E('event_stream', 'Replay-diagnostics terminal', 'replay_console', 'east'),
  E('finance_core', 'General Ledger terminal', 'gl', 'centre'), E('finance_core', 'Accounts Payable station', 'ap', 'west'), E('finance_core', 'Accounts Receivable station', 'ar', 'east'), E('finance_core', 'Reconciliation screen', 'recon_screen', 'north'),
  E('payment_orchestration', 'Batch queue board', 'batch_rack', 'centre'), E('payment_orchestration', 'Approval station', 'validation_console', 'north'), E('payment_orchestration', 'Release controls', 'release_controls', 'east'),
  E('bacs_vault', 'Locked file cabinet', 'staging_cabinet', 'centre'), E('bacs_vault', 'Manifest terminal', 'file_terminal', 'west'), E('bacs_vault', 'Simulated bank-response monitor', 'bank_monitor', 'east'),
  E('debt_recovery', 'Debt-reconciliation console', 'recon_console', 'west'), E('debt_recovery', 'Receipt station', 'receipt_station', 'centre'), E('debt_recovery', 'Agency-export terminal', 'export_screen', 'east'),
  E('integration_exchange', 'Secure transfer racks', 'transfer_racks', 'centre'), E('integration_exchange', 'Route monitor', 'connection_panel', 'north'), E('integration_exchange', 'Agency connection console', 'agency_console', 'south'),
  E('agency_handoff', 'Export-validation terminal', 'transfer_station', 'centre'), E('agency_handoff', 'Delivery-receipt monitor', 'receipt_monitor', 'west'),
  E('fabric_platform', 'Bronze station', 'bronze', 'west'), E('fabric_platform', 'Silver station', 'silver', 'centre'), E('fabric_platform', 'Gold station', 'gold', 'east'), E('fabric_platform', 'Reporting dashboard', 'pipeline_display', 'north'),
];

export interface Equipment { id: string; room: RoomId; label: string; prop: PropDef; local: { x: number; y: number }; placement: Placement[]; wanted: Placement[]; ok: boolean }
export const EQUIPMENT: Equipment[] = EQUIPMENT_SPEC.map((e) => {
  const room = ROOM_BY_ID[e.room], prop = room.props.find((p) => p.key === e.key)!;
  const lr = LAYOUT_ROOMS.find((q) => q.id === e.room)!;
  const local = { x: prop.gx - room.x0 - lr.ox, y: prop.gy - room.y0 - lr.oy }, placement = placementOf(local.x, local.y);
  return { id: prop.id, room: e.room, label: e.label, prop, local, placement, wanted: e.want, ok: e.want.every((w) => placement.includes(w)) };
});
export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

// ---------------------------------------------------------------- ports (where data routes enter and leave a room) ----
export interface Port { id: string; room: RoomId; side: Side; label: string; routeIds: string[]; door?: string }
const sideOf = (room: RoomId, toward: string): Side => {
  const a = ROOM_BY_ID[room], b = ROOM_BY_ID[toward as RoomId];
  if (b) {
    const link = a.doors.find((d) => d.toward === b.id);
    if (link) return link.side;                      // a real door faces that neighbour
    const dx = b.x0 + b.w / 2 - (a.x0 + a.w / 2), dy = b.y0 + b.h / 2 - (a.y0 + a.h / 2);
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
  }
  const x = EXTERNAL_BY_ID[toward]; if (!x) return 'n';
  const dx = x.x + x.w / 2 - (a.x0 + a.w / 2), dy = x.y + x.h / 2 - (a.y0 + a.h / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
};
/** One port per (room, direction) that a route uses, labelled with where the data goes. Derived from the routes, never typed twice. */
export const PORTS: Port[] = (() => {
  const map = new Map<string, Port>();
  for (const r of ROUTES) {
    const hops = r.hops.filter((h) => !h.startsWith('prop:'));
    hops.forEach((h, i) => {
      if (!ROOM_BY_ID[h as RoomId]) return;
      for (const [nb, dir] of [[hops[i - 1], 'from'], [hops[i + 1], 'to']] as [string | undefined, string][]) {
        if (!nb) continue;
        const room = h as RoomId, side = sideOf(room, nb), id = `port:${room}.${side}.${nb}`;
        const label = `${dir === 'from' ? 'In from' : 'Out to'} ${ROOM_BY_ID[nb as RoomId]?.name ?? EXTERNAL_BY_ID[nb]?.name ?? nb}`;
        const p = map.get(id) ?? { id, room, side, label, routeIds: [], door: (ROOM_BY_ID[room].doors.find((d) => d.toward === nb) ?? ROOM_BY_ID[room].doors.find((d) => d.side === side))?.id };
        if (!p.routeIds.includes(r.id)) p.routeIds.push(r.id);
        map.set(id, p);
      }
    });
  }
  return [...map.values()];
})();

// ---------------------------------------------------------------- rooms, corridors, doors ----
export interface GraphRoom { id: RoomId; code: string; name: string; wing: Wing; bays: BayDef[]; x0: number; y0: number; w: number; h: number; pass: string; passName: string; doors: DoorDef[]; equipment: Equipment[]; ports: Port[]; routeIds: string[] }
export const GRAPH_ROOMS: GraphRoom[] = ROOMS.map((r) => ({
  id: r.id, code: r.code, name: r.name, wing: r.wing, bays: BAYS.filter((b) => b.room === r.id), x0: r.x0, y0: r.y0, w: r.w, h: r.h, pass: r.requiredPass, passName: PASSES[r.requiredPass].name,
  doors: r.doors, equipment: EQUIPMENT.filter((e) => e.room === r.id), ports: PORTS.filter((p) => p.room === r.id), routeIds: ROUTES.filter((q) => routeRooms(q).includes(r.id)).map((q) => q.id),
}));
export const GRAPH_ROOM_BY_ID = Object.fromEntries(GRAPH_ROOMS.map((r) => [r.id, r])) as Record<RoomId, GraphRoom>;

/** One physical corridor: an explicit link between two graph nodes (rooms or junctions). Never inferred from where rooms sit on screen. */
export interface Corridor { id: string; from: string; to: string; kind: 'main' | 'maintenance'; label: string; rects: { x: number; y: number; w: number; h: number }[]; /** door ids at the room ends (junction ends have none) */ doors: string[] }
export const CORRIDORS: Corridor[] = LINKS.map((l) => ({ id: l.id, from: l.a, to: l.b, kind: l.kind, label: l.label, rects: l.corridor,
  doors: [isRoomNode(l.a) && l.da ? `door:${l.a}.${l.b}` : '', isRoomNode(l.b) && l.db ? `door:${l.b}.${l.a}` : ''].filter(Boolean) }));
export const CORRIDOR_BY_ID = Object.fromEntries(CORRIDORS.map((c) => [c.id, c])) as Record<string, Corridor>;
export const FACILITY = { x0: FAC_X0, y0: FAC_Y0, w: FAC_W, h: FAC_H, entrance: ENTRANCE };
export const nodeName = (id: string) => NODE_BY_ID[id]?.name ?? id;
export const nodeCode = (id: string) => NODE_BY_ID[id]?.code ?? '';

/**
 * The explicit graph: rooms and junctions are nodes, corridors are edges. Movement, maps, doors and markers all read this.
 * A junction is open ground, so passing through one never needs a pass; passing through a ROOM does.
 */
export function neighbours(node: string, opts: { includeMaintenance?: boolean } = {}): { node: string; link: string; door: string | null }[] {
  return CORRIDORS.filter((c) => (c.from === node || c.to === node) && (opts.includeMaintenance !== false || c.kind === 'main')).map((c) => {
    const other = c.from === node ? c.to : c.from;
    return { node: other, link: c.id, door: isRoomNode(node) ? `door:${node}.${other}` : null };
  });
}
/**
 * Shortest route between two nodes over corridors. `transit` says which rooms may be walked THROUGH (junctions always can):
 * by default only the atrium. `blocked` = link ids to avoid.
 */
export function nodeRoute(from: string, to: string, opts: { blocked?: ReadonlySet<string>; maintenance?: boolean; transit?: (room: RoomId) => boolean } = {}): string[] | null {
  if (from === to) return [from];
  const blocked = opts.blocked ?? new Set<string>(), transit = opts.transit ?? ((r: RoomId) => r === 'secure_ops');
  const prev = new Map<string, string | null>([[from, null]]), q: string[] = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur !== from && isRoomNode(cur) && !transit(cur)) continue;               // a locked room is a dead end, not a thoroughfare
    for (const n of neighbours(cur, { includeMaintenance: opts.maintenance ?? true })) {
      if (blocked.has(n.link) || prev.has(n.node)) continue;
      prev.set(n.node, cur);
      if (n.node === to) { const out: string[] = []; for (let c: string | null = to; c; c = prev.get(c) ?? null) out.unshift(c); return out; }
      q.push(n.node);
    }
  }
  return null;
}
/** The required loops: cycles of nodes (each consecutive pair, and last to first, is a corridor). The Data loop closes through the maintenance cross-link. */
export interface LoopDef { id: string; name: string; nodes: string[]; note: string }
export const LOOPS: LoopDef[] = [
  { id: 'operations', name: 'Operations loop', nodes: ['secure_ops', 'jw', 'finance_core', 'jnw', 'event_stream', 'fabric_platform', 'jn'], note: 'Atrium, Finance Core, Event Stream and Fabric Platform around the control ring.' },
  { id: 'data', name: 'Data loop', nodes: ['event_stream', 'fabric_platform', 'api_gateway'], note: 'Event Stream, Fabric Platform and API Gateway; it closes through the Event Stream to API Gateway maintenance conduit (the cross-link).' },
  { id: 'payment', name: 'Payment loop', nodes: ['secure_ops', 'js', 'card_payments', 'bacs_vault', 'jse', 'payment_orchestration', 'je'], note: 'Atrium, Card Payments, BACS Vault and Payment Orchestration.' },
  { id: 'collections', name: 'Collections loop', nodes: ['payment_orchestration', 'jne', 'agency_handoff', 'debt_recovery', 'bacs_vault', 'jse'], note: 'Payment Orchestration, Agency Hand-off, Debt Recovery and the BACS Vault.' },
  { id: 'staff', name: 'Staff access loop', nodes: ['secure_ops', 'jsw', 'payroll_pensions', 'service_payments', 'finance_core', 'jw'], note: 'Atrium, Payroll & Pensions, Service Payments and Finance Core.' },
];
export const loopRooms = (l: LoopDef): RoomId[] => l.nodes.filter(isRoomNode) as RoomId[];
export const linkBetween = (a: string, b: string): string | null => CORRIDORS.find((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))?.id ?? null;
export const loopLinks = (l: LoopDef): string[] => l.nodes.map((n, i) => linkBetween(n, l.nodes[(i + 1) % l.nodes.length]) ?? '');
/** Which graph node a grid point is in: a room, a junction plaza, or (in a corridor) the nearer end of that corridor. */
export function locate(x: number, y: number): string | null {
  const cx = Math.floor(x), cy = Math.floor(y), k = `${cx},${cy}`;
  const room = GRID.roomOf[cy]?.[cx]; if (room) return room;
  const j = GRID.junctionOf.get(k); if (j) return j;
  const l = GRID.linkOf.get(k); if (!l) return null;
  const c = CORRIDOR_BY_ID[l], at = (id: string): [number, number] => { const r = ROOM_BY_ID[id as RoomId]; if (r) return [r.x0 + r.w / 2, r.y0 + r.h / 2]; const q = JUNCTION_BY_ID[id]; return [q.x + q.w / 2, q.y + q.h / 2]; };
  const da = Math.hypot(at(c.from)[0] - x, at(c.from)[1] - y), db = Math.hypot(at(c.to)[0] - x, at(c.to)[1] - y);
  return da <= db ? c.from : c.to;
}
export const nodeCentre = (id: string): [number, number] => { const r = ROOM_BY_ID[id as RoomId]; if (r) return [r.x0 + r.w / 2, r.y0 + r.h / 2]; const q = JUNCTION_BY_ID[id]; return [q.x + q.w / 2, q.y + q.h / 2]; };
export const WING_LABEL = WING_NAMES;
export { BAYS, DOORS, LINK_RULES, NODES };

// ---------------------------------------------------------------- nodes and edges for the system diagrams ----
export type NodeKind = 'room' | 'external' | 'station';
export interface GraphNode { id: string; kind: NodeKind; label: string; room?: RoomId; code?: string }
export function nodeOf(id: string): GraphNode {
  if (id.startsWith('prop:')) { const [room, key] = id.slice(5).split('.'); const p = ROOM_BY_ID[room as RoomId].props.find((q) => q.key === key)!; return { id, kind: 'station', label: p.name.replace(' Station', ''), room: room as RoomId }; }
  const r = ROOM_BY_ID[id as RoomId]; if (r) return { id, kind: 'room', label: r.name, room: r.id, code: r.code };
  const x = EXTERNAL_BY_ID[id]; return { id, kind: 'external', label: x?.name ?? id };
}
export interface GraphEdge { route: RouteDef; from: string; to: string; index: number }
export const EDGES: GraphEdge[] = ROUTES.flatMap((r) => r.hops.slice(1).map((h, i) => ({ route: r, from: r.hops[i], to: h, index: i })));
export const isReturning = (t: RouteType) => t === 'return' || t === 'agency_return';

export interface DiagramView { id: 'finance' | 'carddebt' | 'events'; label: string; title: string; routeIds: string[]; note: string }
export const DIAGRAMS: DiagramView[] = [
  { id: 'finance', label: 'Finance Flows', title: 'Finance payment flow', routeIds: ['service_payment_intake', 'supplier_payment_release', 'bank_response_reconciliation'], note: 'Requests enter through the API Gateway, are posted in Finance Core, released through Payment Orchestration and the BACS Vault to the simulated bank. Bank acknowledgements return the same way for reconciliation.' },
  { id: 'carddebt', label: 'Debt & Card', title: 'Card and debt flow', routeIds: ['card_receipt', 'debt_agency_export', 'agency_receipt'], note: 'Simulated card payments settle in Card Payments and post through Accounts Receivable. Approved debt exports leave through the Integration Exchange to the fictional agency; receipts come back the same approved way.' },
  { id: 'events', label: 'Events & Fabric', title: 'Events and analytics lineage', routeIds: ['finance_event_mirror', 'receipt_event_feed'], note: 'Finance modules and payment routes publish events to the Event Stream Hall, then Fabric lands them in Bronze, cleans them in Silver, publishes Gold, and feeds the reporting dashboard. Everything on this view is simulated while Demo data is on.' },
];

/** Layered layout for a diagram, computed from its routes: forward routes set the columns; returning routes run back along them. */
export function layoutDiagram(view: DiagramView): { nodes: (GraphNode & { col: number; row: number })[]; cols: number; rows: number } {
  const routes = view.routeIds.map((id) => ROUTE_BY_ID[id]);
  const depth: Record<string, number> = {}, order: string[] = [];
  const fwd = routes.filter((r) => !isReturning(r.type));
  for (const r of fwd) for (const h of r.hops) if (!(h in depth)) { depth[h] = 0; order.push(h); }
  for (let pass = 0; pass < 12; pass++) for (const r of fwd) r.hops.forEach((h, i) => { if (i && depth[h] < depth[r.hops[i - 1]] + 1) depth[h] = depth[r.hops[i - 1]] + 1; });
  for (const r of routes.filter((q) => isReturning(q.type))) for (const h of r.hops) if (!(h in depth)) { depth[h] = 0; order.push(h); }
  const rowsAt: Record<number, number> = {};
  const nodes = order.map((id) => { const col = depth[id], row = rowsAt[col] ?? 0; rowsAt[col] = row + 1; return { ...nodeOf(id), col, row }; });
  return { nodes, cols: Math.max(...nodes.map((n) => n.col)) + 1, rows: Math.max(...nodes.map((n) => n.row)) + 1 };
}

// ---------------------------------------------------------------- incident links ----
export interface IncidentLink { sourceRoom: RoomId; routeIds: string[]; evidenceRooms: RoomId[]; evidence: { id: string; name: string; room: RoomId; at: string | null }[] }
/** Where an evidence item is retrieved: the prop, from the mission's own steps (scenario missions) or the tutorial's fixed interactions. */
export function evidencePropId(m: MissionDef, evId: string): string | null {
  const sc = (m as Partial<ScenarioMission>).spec;
  const step = sc?.steps.find((x) => x.evidence === evId);
  if (step) return Array.isArray(step.at) ? step.at[0] : step.at;
  const tutorial: Record<string, string> = { ev_masked_receipt: 'prop:card_payments.receipt_log', ev_replay_trace: 'prop:event_stream.replay_console', ev_ledger_check: 'prop:finance_core.gl', ev_fabric_freshness: 'prop:fabric_platform.pipeline_display' };
  return tutorial[evId] ?? null;
}
export function incidentLink(m: MissionDef, liveRouteIds: string[] = []): IncidentLink {
  const routes = [...new Set([...(m.incidentRoute ? [m.incidentRoute] : []), ...liveRouteIds])].filter((id) => ROUTE_BY_ID[id]);
  const evidence = m.evidence.map((e) => ({ id: e.id, name: e.name, room: e.sourceRoom, at: evidencePropId(m, e.id) }));
  return { sourceRoom: m.alert.points, routeIds: routes, evidenceRooms: [...new Set(m.evidence.map((e) => e.sourceRoom))], evidence };
}

export { routePoints, ROUTE_BY_ID, ROOM_BY_ID };
