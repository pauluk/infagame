import type { Cell, DoorDef, ExternalDef, PropDef, RoomDef, RoomId, Side } from '../game/types';
import { PASSES, PASS_BY_ROOM } from './passes';

// ---- grid constants (cells). Rooms are 10 x 8, corridors are 2 cells wide. ----
export const ROOM_W = 10, ROOM_H = 8, CORRIDOR = 2;
export const FAC_X0 = 6, FAC_Y0 = 6;
export const PITCH_X = ROOM_W + CORRIDOR, PITCH_Y = ROOM_H + CORRIDOR;
export const FAC_W = CORRIDOR + 4 * ROOM_W + 3 * CORRIDOR + CORRIDOR;      // 50
export const FAC_H = CORRIDOR + 3 * ROOM_H + 2 * CORRIDOR + CORRIDOR;      // 32
export const WORLD_W = 64, WORLD_H = 46;

export type CellKind = 'void' | 'corridor' | 'room' | 'wall' | 'door';

type PropSpec = [key: string, sprite: string, rx: number, ry: number, name: string, desc: string, interactive?: boolean];
interface RoomSpec { id: RoomId; code: string; name: string; col: number; row: number; accent: RoomDef['accent']; blurb: string; props: PropSpec[] }

// Props avoid the door-approach cells ((4..5, 1..2), (4..5, 5..6), (1..2, 3..4), (7..8, 3..4)).
const SPECS: RoomSpec[] = [
  { id: 'api_gateway', code: 'A1', name: 'API Gateway', col: 0, row: 0, accent: 'cyan', blurb: 'Incoming requests, authentication status and service connections.', props: [
    ['gateway_console', 'i_console_api', 2, 1, 'Gateway Console', 'Routes authenticated requests to the right service.'],
    ['request_monitor', 'i_terminal_cyan', 7, 1, 'Request Monitor', 'Live request rates and error counts (synthetic).'],
    ['auth_terminal', 'i_terminal_blue', 2, 6, 'Authentication Status Terminal', 'Shows which service credentials are valid and when they rotate.'],
    ['desk', 'd_desk_set', 7, 6, 'Duty Desk', 'A mug reads "I ♥ rate limits".', false],
    ['plant', 'd_plant', 8, 1, 'Fern', 'Nobody remembers who waters it. It thrives anyway.', false],
  ] },
  { id: 'event_stream', code: 'B1', name: 'Event Stream Hall', col: 1, row: 0, accent: 'cyan', blurb: 'Events flowing from systems towards finance modules and analytics.', props: [
    ['queue_monitor', 'i_rack_cyan', 2, 1, 'Queue Monitor', 'Shows how many events wait in each lane.'],
    ['replay_console', 'i_console_event', 7, 1, 'Replay Diagnostic Console', 'Traces repeated events back to their source.'],
    ['replay_buffer', 'i_rack_amber', 8, 1, 'Replay Buffer', 'Keeps recent events so consumers can catch up.'],
    ['consumers', 'i_rack_cyan', 3, 1, 'Consumer Group', 'Services that read events from the stream: lanes, capacity and dead-letter handling.'],
    ['lane1', 'd_cable_tray', 2, 5, 'Event Lane 1', 'Events travel along these lanes.', false],
    ['lane2', 'd_cable_tray', 3, 5, 'Event Lane 2', 'Events travel along these lanes.', false],
    ['lane3', 'd_cable_tray', 6, 5, 'Event Lane 3', 'Events travel along these lanes.', false],
    ['lane4', 'd_cable_tray', 7, 5, 'Event Lane 4', 'Events travel along these lanes.', false],
    ['plant', 'd_plant', 8, 6, 'Tall Plant', 'Reaches towards the cable trays.', false],
  ] },
  { id: 'fabric_platform', code: 'C1', name: 'Fabric Data Platform', col: 2, row: 0, accent: 'periwinkle', blurb: 'Bronze, Silver and Gold stations feeding a reporting display.', props: [
    ['fan', 'd_fan', 8, 2, 'Cooling Fan', 'Keeps the medallion layers cool.', false],
    ['bronze', 'i_node_bronze', 2, 1, 'Bronze Station', 'Raw events, landed as they arrive (synthetic).'],
    ['silver', 'i_node_silver', 5, 1, 'Silver Station', 'Cleaned and conformed finance data (synthetic).'],
    ['gold', 'i_node_gold', 8, 1, 'Gold Station', 'Reporting-ready tables (synthetic).'],
    ['pipeline_display', 'i_screen_dashboard', 2, 6, 'Pipeline Status Display', 'Bronze, Silver and Gold pipeline status. Press F for the analytics panel.'],
    ['plant', 'd_plant_small', 8, 6, 'Desk Plant', 'Gold-standard greenery.', false],
  ] },
  { id: 'integration_exchange', code: 'D1', name: 'Integration Exchange', col: 3, row: 0, accent: 'cyan', blurb: 'Secure transfers between finance modules and external services.', props: [
    ['table', 'd_table', 8, 6, 'Coffee Table', 'Where partner handshakes are rehearsed.', false],
    ['transfer_console_a', 'i_console_integ', 2, 1, 'Secure Transfer Console A', 'Queue of secure transfers (synthetic).'],
    ['transfer_console_b', 'i_console_integ', 6, 1, 'Secure Transfer Console B', 'Second transfer queue.'],
    ['connection_panel', 'i_rack_violet', 8, 1, 'External Service Connection Panel', 'Status of links to simulated external services.'],
    ['crate', 'd_crate', 2, 6, 'Spare Cable Crate', 'Labelled "definitely cables".', false],
  ] },
  { id: 'service_payments', code: 'A2', name: 'Service Payments', col: 0, row: 1, accent: 'cyan', blurb: 'Payment request intake and validation.', props: [
    ['laptop', 'd_desk_laptop', 8, 6, 'Hot Desk', 'Somebody left a laptop open on a validation checklist.', false],
    ['intake_terminal', 'i_terminal_cyan', 2, 1, 'Payment Request Intake Terminal', 'Incoming service payment requests (masked).'],
    ['validation_queue', 'i_rack_cyan', 7, 1, 'Validation Queue', 'Requests waiting for reference and amount checks.'],
    ['desk', 'd_desk_set', 7, 6, 'Shared Desk', 'A sticky note: "Check the reference. Then check it again."', false],
    ['plant', 'd_plant', 2, 6, 'Rubber Plant', 'Decorative. Mostly.', false],
  ] },
  { id: 'finance_core', code: 'B2', name: 'Finance Core', col: 1, row: 1, accent: 'blue', blurb: 'General Ledger, Accounts Payable and Accounts Receivable.', props: [
    ['shelf', 'd_bookcase2', 8, 1, 'Policy Shelf', 'Binders labelled "Reconciliation: read twice".', false],
    ['gl', 'i_console_ledger', 2, 1, 'General Ledger', 'The single source of truth for postings.'],
    ['ap', 'i_console_payment', 7, 1, 'Accounts Payable', 'Supplier invoices and approved payment batches.'],
    ['ar', 'i_console_debt', 2, 6, 'Accounts Receivable', 'Receipts and amounts owed to the organisation.'],
    ['desk', 'd_desk_set', 7, 6, 'Finance Desk', 'Balanced. As all things should be.', false],
  ] },
  { id: 'payment_orchestration', code: 'C2', name: 'Payment Orchestration', col: 2, row: 1, accent: 'blue', blurb: 'Payment validation and batch release controls.', props: [
    ['validation_console', 'i_terminal_blue', 2, 1, 'Payment Validation Console', 'Limit and format checks on each batch (synthetic).'],
    ['release_controls', 'i_console_payment', 7, 1, 'Batch Release Controls', 'Approved batches are released from here.'],
    ['batch_rack', 'i_rack_blue', 2, 6, 'Batch Rack', 'Batches queued for the next payment run.'],
    ['plant', 'd_plant_small', 8, 6, 'Bonsai', 'Pruned on a strict schedule.', false],
  ] },
  { id: 'bacs_vault', code: 'D2', name: 'BACS Vault', col: 3, row: 1, accent: 'blue', blurb: 'Locked payment staging cabinet, file metadata and bank responses.', props: [
    ['holder', 'd_itemholder', 8, 1, 'Evidence Tray', 'Holds printed checksums. Very retro.', false],
    ['chest', 'd_chest', 1, 6, 'Spare Chest', 'Empty. The spare keys are in a different room on purpose.', false],
    ['staging_cabinet', 'i_cabinet_secure', 2, 1, 'Locked Payment Staging Cabinet', 'Holds approved outbound payment files. Read-only for auditors.'],
    ['file_terminal', 'i_terminal_blue', 7, 1, 'File Metadata Terminal', 'File sizes, checksums and counts (no payee details).'],
    ['bank_monitor', 'i_screen_alert', 2, 6, 'Bank-Response Monitor', 'Simulated bank responses.'],
    ['case', 'i_case_bacs', 8, 6, 'BACS File Case', 'Carrying case for offline file hand-over (empty).'],
  ] },
  { id: 'secure_ops', code: 'A3', name: 'Secure Ops Control', col: 0, row: 2, accent: 'amber', blurb: 'Incident wall, Access Desk and Evidence Board.', props: [
    ['lamp', 'd_lamp', 8, 6, 'Floor Lamp', 'Warm light for long incident nights.', false],
    ['coat', 'd_coatrack', 1, 1, 'Coat Rack', 'Three hi-vis jackets. Nobody claims the fourth.', false],
    ['incident_wall', 'i_screen_alert', 2, 1, 'Incident Wall', 'Live alerts for the whole platform. Currently very colourful.'],
    ['evidence_board', 'i_screen_dashboard', 7, 1, 'Evidence Board', 'Pins evidence in the order you collect it.'],
    ['access_desk', 'i_console_ops', 2, 6, 'Access Desk', 'Request fictional, read-only, mission-scoped passes.'],
    ['map_table', 'i_table_map', 7, 6, 'Facility Map Table', 'A tiny holographic facility. Press M for the minimap.'],
    ['log_terminal', 'i_terminal_cyan', 4, 6, 'Incident Log Terminal', 'The synthetic incident log: close stale entries and redact sensitive-looking values.'],
    ['coffee', 'i_coffee', 8, 1, 'Coffee Machine', 'Powers Secure Ops. Officially "infrastructure".', false],
    ['sofa', 'd_sofa', 1, 6, 'Break Sofa', 'For thinking. Not sleeping.', false],
  ] },
  { id: 'card_payments', code: 'B3', name: 'Card Payments', col: 1, row: 2, accent: 'mint', blurb: 'Simulated card terminal, settlement monitor and masked receipt log.', props: [
    ['box', 'd_box', 1, 6, 'Spare Terminals Box', 'Sealed. Probably.', false],
    ['card_terminal', 'i_terminal_card', 2, 1, 'Card Terminal (simulated)', 'Simulated terminal that authorises card payments.'],
    ['settlement_monitor', 'i_console_ledger', 7, 1, 'Settlement Monitor', 'Settlement events as they arrive.'],
    ['receipt_log', 'i_terminal_mint', 2, 6, 'Masked Receipt Log', 'Receipts with card numbers masked.'],
    ['notifier', 'i_rack_mint', 7, 6, 'Settlement Notifier', 'Sends a receipt event after each card settlement.'],
    ['plant', 'd_plant', 8, 1, 'Spider Plant', 'Has survived three migrations.', false],
  ] },
  { id: 'debt_recovery', code: 'C3', name: 'Accounts Receivable & Debt Recovery', col: 2, row: 2, accent: 'violet', blurb: 'Debt reconciliation and approved agency export.', props: [
    ['recon_console', 'i_console_debt', 2, 1, 'Debt Reconciliation Console', 'Matches receipts to debt records (synthetic).'],
    ['export_screen', 'i_terminal_violet', 7, 1, 'Approved Agency Export Screen', 'Only approved records appear here.'],
    ['records', 'd_bookcase', 2, 6, 'Debt Records Cabinet', 'Synthetic records awaiting recovery action.', false],
    ['plant', 'd_plant_small', 8, 6, 'Peace Lily', 'Hand-off approved. Very calm.', false],
  ] },
  { id: 'agency_handoff', code: 'D3', name: 'Agency Hand-off', col: 3, row: 2, accent: 'violet', blurb: 'Fictional agency transfer station and delivery receipt monitor.', props: [
    ['transfer_station', 'i_console_debt', 2, 1, 'Agency Transfer Station', 'Controlled hand-off to the fictional agency.'],
    ['receipt_monitor', 'i_terminal_violet', 7, 1, 'Delivery Receipt Monitor', 'Confirms what the agency received.'],
    ['box', 'd_box', 2, 6, 'Outbox', 'Empty. Everything is digital.', false],
    ['plant', 'd_plant', 8, 6, 'Palm', 'Was a gift from a vendor.', false],
  ] },
];

/** The 17 physical connections (door pairs) from the design brief. */
export const CONNECTIONS: { from: RoomId; to: RoomId; axis: 'ew' | 'ns' }[] = [
  { from: 'api_gateway', to: 'event_stream', axis: 'ew' }, { from: 'event_stream', to: 'fabric_platform', axis: 'ew' },
  { from: 'fabric_platform', to: 'integration_exchange', axis: 'ew' }, { from: 'service_payments', to: 'finance_core', axis: 'ew' },
  { from: 'finance_core', to: 'payment_orchestration', axis: 'ew' }, { from: 'payment_orchestration', to: 'bacs_vault', axis: 'ew' },
  { from: 'secure_ops', to: 'card_payments', axis: 'ew' }, { from: 'card_payments', to: 'debt_recovery', axis: 'ew' },
  { from: 'debt_recovery', to: 'agency_handoff', axis: 'ew' },
  { from: 'api_gateway', to: 'service_payments', axis: 'ns' }, { from: 'event_stream', to: 'finance_core', axis: 'ns' },
  { from: 'fabric_platform', to: 'payment_orchestration', axis: 'ns' }, { from: 'integration_exchange', to: 'bacs_vault', axis: 'ns' },
  { from: 'service_payments', to: 'secure_ops', axis: 'ns' }, { from: 'finance_core', to: 'card_payments', axis: 'ns' },
  { from: 'payment_orchestration', to: 'debt_recovery', axis: 'ns' }, { from: 'bacs_vault', to: 'agency_handoff', axis: 'ns' },
];

function doorCells(x0: number, y0: number, side: Side): [Cell, Cell] {
  switch (side) {
    case 'n': return [{ x: x0 + 4, y: y0 }, { x: x0 + 5, y: y0 }];
    case 's': return [{ x: x0 + 4, y: y0 + ROOM_H - 1 }, { x: x0 + 5, y: y0 + ROOM_H - 1 }];
    case 'w': return [{ x: x0, y: y0 + 3 }, { x: x0, y: y0 + 4 }];
    case 'e': return [{ x: x0 + ROOM_W - 1, y: y0 + 3 }, { x: x0 + ROOM_W - 1, y: y0 + 4 }];
  }
}
function readerCell(x0: number, y0: number, side: Side): Cell {
  switch (side) {
    case 'n': return { x: x0 + 3, y: y0 };
    case 's': return { x: x0 + 3, y: y0 + ROOM_H - 1 };
    case 'w': return { x: x0, y: y0 + 2 };
    case 'e': return { x: x0 + ROOM_W - 1, y: y0 + 2 };
  }
}

export const ROOMS: RoomDef[] = SPECS.map((s) => {
  const x0 = FAC_X0 + CORRIDOR + s.col * PITCH_X;
  const y0 = FAC_Y0 + CORRIDOR + s.row * PITCH_Y;
  const requiredPass = PASS_BY_ROOM[s.id];
  const props: PropDef[] = s.props.map(([key, sprite, rx, ry, name, desc, interactive = true]) => ({
    id: `prop:${s.id}.${key}`, key, room: s.id, sprite, atlas: 'props', gx: x0 + rx, gy: y0 + ry, name, desc, interactive, blocks: !sprite.startsWith('d_cable') && sprite !== 'd_rug' && sprite !== 'd_floorlight' && sprite !== 'd_vent',
  }));
  return { id: s.id, code: s.code, name: s.name, col: s.col, row: s.row, x0, y0, w: ROOM_W, h: ROOM_H, accent: s.accent, blurb: s.blurb,
    requiredPass, scope: PASSES[requiredPass].scope, doors: [], props };
});
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, RoomDef>;

// doors from connections (each connection yields one door in each room)
const oppositeSide: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
for (const c of CONNECTIONS) {
  const a = ROOM_BY_ID[c.from], b = ROOM_BY_ID[c.to];
  const sideA: Side = c.axis === 'ew' ? 'e' : 's';
  for (const [room, side, toward] of [[a, sideA, b.id], [b, oppositeSide[sideA], a.id]] as [typeof a, Side, RoomId][]) {
    room.doors.push({ id: `door:${room.id}.${side}`, room: room.id, side, cells: doorCells(room.x0, room.y0, side), toward, readerCell: readerCell(room.x0, room.y0, side) });
  }
}

export const EXTERNALS: ExternalDef[] = [
  { id: 'bank_sim', name: 'Bank', x: FAC_X0 + FAC_W + 2, y: ROOM_BY_ID.bacs_vault.y0 + 2, w: 3, h: 3, sprite: 'ext_dock_blue', color: 'blue', blurb: 'Receives payment files and returns responses.' },
  { id: 'agency_sim', name: 'Collection Agency', x: FAC_X0 + FAC_W + 2, y: ROOM_BY_ID.agency_handoff.y0 + 2, w: 3, h: 3, sprite: 'ext_dock_violet', color: 'violet', blurb: 'Receives approved hand-offs only. Fictional.' },
  { id: 'card_network_sim', name: 'Card Network', x: ROOM_BY_ID.card_payments.x0 + 4, y: FAC_Y0 + FAC_H + 2, w: 3, h: 3, sprite: 'ext_dock_mint', color: 'mint', blurb: 'Sends card authorisations and settlements.' },
  { id: 'reporting_display', name: 'Reporting Display', x: ROOM_BY_ID.fabric_platform.x0 + 4, y: FAC_Y0 - 5, w: 3, h: 3, sprite: 'ext_dock_cyan', color: 'periwinkle', blurb: 'Executive reporting screen fed by the Gold layer.' },
];
export const EXTERNAL_BY_ID = Object.fromEntries(EXTERNALS.map((e) => [e.id, e]));

/** Facility entrance on the south side of Secure Ops Control. */
export const ENTRANCE = { x: ROOM_BY_ID.secure_ops.x0 + 4, y: FAC_Y0 + FAC_H, w: 3 };

// ---- walk grid ----
export interface MapGrid {
  w: number; h: number;
  kind: CellKind[][];                       // [y][x]
  roomOf: (RoomId | null)[][];              // room whose footprint contains the cell
  doorOf: Map<string, DoorDef>;             // "x,y" -> door
  blockedProps: Set<string>;
}
export const cellKey = (x: number, y: number) => `${x},${y}`;

export function buildGrid(): MapGrid {
  const kind: CellKind[][] = Array.from({ length: WORLD_H }, () => Array<CellKind>(WORLD_W).fill('void'));
  const roomOf: (RoomId | null)[][] = Array.from({ length: WORLD_H }, () => Array<RoomId | null>(WORLD_W).fill(null));
  for (let y = FAC_Y0; y < FAC_Y0 + FAC_H; y++) for (let x = FAC_X0; x < FAC_X0 + FAC_W; x++) kind[y][x] = 'corridor';
  const doorOf = new Map<string, DoorDef>();
  const blockedProps = new Set<string>();
  for (const r of ROOMS) {
    for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) {
      roomOf[y][x] = r.id;
      const edge = x === r.x0 || x === r.x0 + r.w - 1 || y === r.y0 || y === r.y0 + r.h - 1;
      kind[y][x] = edge ? 'wall' : 'room';
    }
    for (const d of r.doors) for (const c of d.cells) { kind[c.y][c.x] = 'door'; doorOf.set(cellKey(c.x, c.y), d); }
    for (const p of r.props) if (p.blocks) blockedProps.add(cellKey(p.gx, p.gy));
  }
  for (const e of EXTERNALS) for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) blockedProps.add(cellKey(x, y));
  return { w: WORLD_W, h: WORLD_H, kind, roomOf, doorOf, blockedProps };
}

export const GRID = buildGrid();

export function roomAt(x: number, y: number): RoomDef | null {
  const id = GRID.roomOf[Math.floor(y)]?.[Math.floor(x)];
  return id ? ROOM_BY_ID[id] : null;
}
/** Cell is inside a room's interior (not wall/door). */
export function roomInteriorAt(x: number, y: number): RoomDef | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  return GRID.kind[cy]?.[cx] === 'room' ? roomAt(cx, cy) : null;
}
export const roomCentre = (id: RoomId): Pt2 => { const r = ROOM_BY_ID[id]; return [r.x0 + r.w / 2, r.y0 + r.h / 2]; };
type Pt2 = [number, number];

/**
 * Walkability for a given pass set. Corridors and open interiors are walkable; wall cells never; door cells only if the
 * player holds the pass of the room that door belongs to. Locked rooms therefore never block corridor travel.
 */
export function isWalkable(x: number, y: number, passes: ReadonlySet<string>): boolean {
  const k = GRID.kind[y]?.[x];
  if (!k || k === 'void' || k === 'wall') return false;
  if (GRID.blockedProps.has(cellKey(x, y))) return false;
  if (k === 'door') { const d = GRID.doorOf.get(cellKey(x, y))!; return passes.has(PASS_BY_ROOM[d.room]); }
  return true;
}
