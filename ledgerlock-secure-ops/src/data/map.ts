import type { Cell, DoorDef, ExternalDef, PropDef, RoomDef, RoomId, Side, PassId } from '../game/types';
import { PASSES, PASS_BY_ROOM } from './passes';
import { SPECS } from './rooms';
import { LAYOUT_JUNCTIONS, LAYOUT_ROOMS, LINKS, WORLD_H, WORLD_W } from './layout';
import type { DoorSpec, LinkDef } from './layout';

export { WORLD_H, WORLD_W, LINKS, LAYOUT_JUNCTIONS };
export type CellKind = 'void' | 'corridor' | 'room' | 'wall' | 'door';

/**
 * The facility, built ONLY from explicit data: room rectangles and prop origins (layout.ts), the link list (layout.ts), and the
 * room specs (rooms.ts). Nothing here looks at screen position to decide what connects to what.
 */
const SPEC_BY_ID = Object.fromEntries(SPECS.map((s) => [s.id, s])) as Record<RoomId, (typeof SPECS)[number]>;

export const ROOMS: RoomDef[] = LAYOUT_ROOMS.map((l) => {
  const s = SPEC_BY_ID[l.id];
  const requiredPass = PASS_BY_ROOM[l.id];
  const props: PropDef[] = s.props.map(([key, sprite, rx, ry, name, desc, interactive = true]) => ({
    id: `prop:${l.id}.${key}`, key, room: l.id, sprite, atlas: 'props', gx: l.x0 + l.ox + rx, gy: l.y0 + l.oy + ry, name, desc, interactive,
    blocks: !sprite.startsWith('d_cable') && sprite !== 'd_rug' && sprite !== 'd_floorlight' && sprite !== 'd_vent',
  }));
  return { id: l.id, code: s.code, name: s.name, wing: s.wing, x0: l.x0, y0: l.y0, w: l.w, h: l.h, accent: s.accent, blurb: s.blurb,
    requiredPass, scope: PASSES[requiredPass].scope, doors: [], props };
});
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, RoomDef>;

// ---- graph nodes: rooms and corridor junctions (concourses) ----
export interface GraphNodeDef { id: string; kind: 'room' | 'junction'; name: string; code?: string }
export const JUNCTION_BY_ID = Object.fromEntries(LAYOUT_JUNCTIONS.map((j) => [j.id, j]));
export const NODES: GraphNodeDef[] = [...ROOMS.map((r) => ({ id: r.id as string, kind: 'room' as const, name: r.name, code: r.code })), ...LAYOUT_JUNCTIONS.map((j) => ({ id: j.id, kind: 'junction' as const, name: j.name }))];
export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, GraphNodeDef>;
export const isRoomNode = (id: string): id is RoomId => !!ROOM_BY_ID[id as RoomId];

// ---- links -> doors (each room end of a link has one door; a junction end has none) ----
export const LINK_BY_ID = Object.fromEntries(LINKS.map((l) => [l.id, l])) as Record<string, LinkDef>;
export const doorId = (room: string, other: string) => `door:${room}.${other}`;
for (const l of LINKS) {
  for (const [room, other, spec] of [[l.a, l.b, l.da], [l.b, l.a, l.db]] as [string, string, DoorSpec | undefined][]) {
    if (!spec || !isRoomNode(room)) continue;
    ROOM_BY_ID[room].doors.push({ id: doorId(room, other), room, side: spec.side as Side, toward: other, link: l.id,
      cells: [{ x: spec.cells[0][0], y: spec.cells[0][1] }, { x: spec.cells[1][0], y: spec.cells[1][1] }], readerCell: { x: spec.reader[0], y: spec.reader[1] } });
  }
}
/** Every door in the facility, by id. */
export const DOORS: DoorDef[] = ROOMS.flatMap((r) => r.doors);
export const DOOR_BY_ID = Object.fromEntries(DOORS.map((d) => [d.id, d])) as Record<string, DoorDef>;

// ---- optional shortcuts: which links can be locked, sealed by an incident, or disabled for a while ----
export interface LinkRule { /** a pass or approval that opens it */ lock?: PassId; /** sealed while an uncontained incident starts in one of these rooms */ sealWhen?: RoomId[]; /** disabled for maintenance between these game minutes */ disabled?: [from: number, to: number] }
export const LINK_RULES: Record<string, LinkRule> = {
  'es-api': { lock: 'maintenance_pass' },
  'ix-agency': { lock: 'courier_pass', sealWhen: ['integration_exchange', 'agency_handoff'] },
  'sp-card': { sealWhen: ['service_payments', 'card_payments'], disabled: [0, 6] },
};
/** Live conditions that the mission runner keeps up to date. */
export const GATE: { minutes: number; sealed: Set<string> } = { minutes: 0, sealed: new Set() };

export type DoorStatus = 'open' | 'locked' | 'sealed' | 'disabled';
export interface DoorInfo { status: DoorStatus; reason: string; need?: PassId }
export function linkInfo(linkId: string, passes: ReadonlySet<string>): DoorInfo {
  const rule = LINK_RULES[linkId];
  if (rule?.disabled && GATE.minutes >= rule.disabled[0] && GATE.minutes < rule.disabled[1]) {
    return { status: 'disabled', reason: `Temporarily disabled for scheduled maintenance (about ${Math.max(1, Math.ceil(rule.disabled[1] - GATE.minutes))} more game minutes)` };
  }
  if (GATE.sealed.has(linkId)) return { status: 'sealed', reason: 'Sealed by an active incident until it is contained' };
  if (rule?.lock && !passes.has(rule.lock)) return { status: 'locked', reason: `Needs the ${PASSES[rule.lock].name}`, need: rule.lock };
  return { status: 'open', reason: 'Open' };
}
/** The state of one door: the corridor it opens onto first, then the pass for the room it belongs to. */
export function doorInfo(d: DoorDef, passes: ReadonlySet<string>): DoorInfo {
  const li = linkInfo(d.link, passes);
  if (li.status !== 'open') return li;
  const need = PASS_BY_ROOM[d.room];
  if (!passes.has(need)) return { status: 'locked', reason: `Needs the ${PASSES[need].name}`, need };
  return { status: 'open', reason: 'Open' };
}

// ---- derived bounds of the whole facility (rooms and corridors) ----
const xs: number[] = [], ys: number[] = [];
for (const r of ROOMS) { xs.push(r.x0, r.x0 + r.w); ys.push(r.y0, r.y0 + r.h); }
for (const l of LINKS) for (const c of l.corridor) { xs.push(c.x, c.x + c.w); ys.push(c.y, c.y + c.h); }
for (const j of LAYOUT_JUNCTIONS) { xs.push(j.x, j.x + j.w); ys.push(j.y, j.y + j.h); }
export const FAC_X0 = Math.min(...xs), FAC_Y0 = Math.min(...ys), FAC_W = Math.max(...xs) - FAC_X0, FAC_H = Math.max(...ys) - FAC_Y0;

export const EXTERNALS: ExternalDef[] = [
  { id: 'bank_sim', name: 'Bank', x: ROOM_BY_ID.bacs_vault.x0 + 3, y: ROOM_BY_ID.bacs_vault.y0 + ROOM_BY_ID.bacs_vault.h + 2, w: 3, h: 3, sprite: 'ext_dock_blue', color: 'blue', blurb: 'Receives payment files and returns responses.' },
  { id: 'agency_sim', name: 'Collection Agency', x: ROOM_BY_ID.agency_handoff.x0 + 6, y: ROOM_BY_ID.agency_handoff.y0 - 5, w: 3, h: 3, sprite: 'ext_dock_violet', color: 'violet', blurb: 'Receives approved hand-offs only. Fictional.' },
  { id: 'card_network_sim', name: 'Card Network', x: ROOM_BY_ID.card_payments.x0 + 4, y: ROOM_BY_ID.card_payments.y0 + ROOM_BY_ID.card_payments.h + 2, w: 3, h: 3, sprite: 'ext_dock_mint', color: 'mint', blurb: 'Sends card authorisations and settlements.' },
  { id: 'reporting_display', name: 'Reporting Display', x: ROOM_BY_ID.fabric_platform.x0 + 4, y: 0, w: 3, h: 3, sprite: 'ext_dock_cyan', color: 'periwinkle', blurb: 'Executive reporting screen fed by the Gold layer.' },
];
export const EXTERNAL_BY_ID = Object.fromEntries(EXTERNALS.map((e) => [e.id, e]));

/** Facility entrance gate: decorative, on open ground outside the atrium's south-east corner (checked by the layout tests). */
export const ENTRANCE = { x: 45, y: 36, w: 3 };

// ---- walk grid ----
export interface MapGrid {
  w: number; h: number;
  kind: CellKind[][];                       // [y][x]
  roomOf: (RoomId | null)[][];              // room whose footprint contains the cell
  doorOf: Map<string, DoorDef>;             // "x,y" -> door
  linkOf: Map<string, string>;              // "x,y" -> the link whose corridor covers the cell
  junctionOf: Map<string, string>;          // "x,y" -> the junction (concourse) plaza covering the cell
  blockedProps: Set<string>;
}
export const cellKey = (x: number, y: number) => `${x},${y}`;

export function buildGrid(): MapGrid {
  const kind: CellKind[][] = Array.from({ length: WORLD_H }, () => Array<CellKind>(WORLD_W).fill('void'));
  const roomOf: (RoomId | null)[][] = Array.from({ length: WORLD_H }, () => Array<RoomId | null>(WORLD_W).fill(null));
  const doorOf = new Map<string, DoorDef>(), linkOf = new Map<string, string>(), junctionOf = new Map<string, string>(), blockedProps = new Set<string>();
  for (const l of LINKS) for (const c of l.corridor) for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) { kind[y][x] = 'corridor'; linkOf.set(cellKey(x, y), l.id); }
  for (const j of LAYOUT_JUNCTIONS) for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) { kind[y][x] = 'corridor'; junctionOf.set(cellKey(x, y), j.id); }
  for (const r of ROOMS) {
    for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) {
      roomOf[y][x] = r.id;
      kind[y][x] = x === r.x0 || x === r.x0 + r.w - 1 || y === r.y0 || y === r.y0 + r.h - 1 ? 'wall' : 'room';
    }
    for (const d of r.doors) for (const c of d.cells) { kind[c.y][c.x] = 'door'; doorOf.set(cellKey(c.x, c.y), d); }
    for (const p of r.props) if (p.blocks) blockedProps.add(cellKey(p.gx, p.gy));
  }
  for (const e of EXTERNALS) for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) blockedProps.add(cellKey(x, y));
  return { w: WORLD_W, h: WORLD_H, kind, roomOf, doorOf, linkOf, junctionOf, blockedProps };
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
export const roomCentre = (id: RoomId): [number, number] => { const r = ROOM_BY_ID[id]; return [r.x0 + r.w / 2, r.y0 + r.h / 2]; };

/**
 * Walkability for a given pass set. Corridors and open interiors are walkable; wall cells never; a door cell only when its
 * door is open: the corridor behind it is not sealed or disabled, and the player holds the pass of the room it belongs to.
 */
export function isWalkable(x: number, y: number, passes: ReadonlySet<string>): boolean {
  const k = GRID.kind[y]?.[x];
  if (!k || k === 'void' || k === 'wall') return false;
  if (GRID.blockedProps.has(cellKey(x, y))) return false;
  if (k === 'door') return doorInfo(GRID.doorOf.get(cellKey(x, y))!, passes).status === 'open';
  if (k === 'corridor') { const l = GRID.linkOf.get(cellKey(x, y)); if (l && LINK_RULES[l] && linkInfo(l, passes).status !== 'open') return false; }
  return true;
}
export type { Cell };
