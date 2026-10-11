/**
 * Layout lab: the authoring tool for src/data/layout.ts. It places rooms, picks door cells that keep clear of props, routes 2-wide
 * corridors that never touch another link's corridor or door, and EMITS the result as explicit data. The game never runs this:
 * it reads the committed layout.ts. Usage: npx vite-node tools/layout-lab.mts [--emit]
 */
import { writeFileSync } from 'node:fs';
import { SPECS } from '../src/data/rooms';

const W = 92, H = 57, DY = 3, DX = 14;   // DX shifts the original layout east to make room for the Expense Claims wing on the west
type Side = 'n' | 's' | 'e' | 'w';
interface R { id: string; x: number; y: number; w: number; h: number; ox: number; oy: number }
const R: Record<string, R> = {};
const room = (id: string, x: number, y: number, w: number, h: number) => { R[id] = { id, x: x + DX, y: y + DY, w, h, ox: Math.max(0, Math.floor((w - 10) / 2)), oy: Math.max(0, Math.floor((h - 8) / 2)) }; };
room('audit_gallery', 2, 4, 6, 9);
room('event_stream', 11, 2, 12, 9);
room('fabric_platform', 27, 2, 12, 9);
room('api_gateway', 43, 2, 12, 9);
room('integration_exchange', 60, 8, 11, 10);
room('finance_core', 9, 17, 14, 12);
room('secure_ops', 30, 22, 13, 11);
room('payment_orchestration', 50, 24, 12, 10);
room('agency_handoff', 66, 24, 10, 8);
room('service_payments', 6, 40, 12, 9);
room('payroll_pensions', 22, 36, 8, 7);
room('card_payments', 34, 40, 12, 8);
room('bacs_vault', 49, 40, 10, 8);
room('debt_recovery', 63, 40, 10, 8);
R.bcp_command = { id: 'bcp_command', x: 1, y: 6, w: 12, h: 10, ox: 1, oy: 0 };
R.expense_claims = { id: 'expense_claims', x: 2, y: 23, w: 10, h: 8, ox: 0, oy: 0 };
R.audit_gallery.ox = 0; R.audit_gallery.oy = 0; R.payroll_pensions.ox = 0; R.payroll_pensions.oy = 0;

type LinkKind = 'main' | 'maintenance';
interface Lk { id: string; a: string; sa?: Side; b: string; sb?: Side; kind: LinkKind; label: string }
interface Jn { id: string; x: number; y: number; w: number; h: number; name: string }
/** Corridor junctions (concourses): explicit graph nodes where corridors meet, so a locked room never sits on the only way somewhere. */
const J: Record<string, Jn> = {};
const junction = (id: string, name: string, x: number, y: number) => { J[id] = { id, name, x: x + DX, y: y + 0, w: 4, h: 4 }; };
junction('jn', 'North Concourse', 33, 17);
junction('jnw', 'North-West Concourse', 13, 15);
junction('jw', 'West Concourse', 25, 26);
junction('jsw', 'South-West Concourse', 16, 34);
junction('je', 'East Concourse', 45, 28);
junction('jne', 'North-East Concourse', 55, 21);
junction('js', 'South Concourse', 37, 38);
junction('jbc', 'Command Concourse', -2, 18);
junction('jse', 'South-East Concourse', 60, 38);
const L = (id: string, a: string, sa: Side | undefined, b: string, sb: Side | undefined, label: string, kind: LinkKind = 'main'): Lk => ({ id, a, sa, b, sb, kind, label });
const LINKS: Lk[] = [
  // spokes from the atrium
  L('a-jn', 'secure_ops', 'n', 'jn', undefined, 'North spine'), L('a-je', 'secure_ops', 'e', 'je', undefined, 'East spine'), L('a-jw', 'secure_ops', 'w', 'jw', undefined, 'West spine'),
  L('a-jsw', 'secure_ops', 'w', 'jsw', undefined, 'Staff spine'), L('a-js', 'secure_ops', 's', 'js', undefined, 'South spine'),
  // concourse branches
  L('jn-fab', 'jn', undefined, 'fabric_platform', 's', 'Platform branch'), L('jn-api', 'jn', undefined, 'api_gateway', 's', 'Gateway branch'), L('jn-jnw', 'jn', undefined, 'jnw', undefined, 'Records concourse'),
  L('jnw-es', 'jnw', undefined, 'event_stream', 's', 'Stream branch'), L('jnw-fc', 'jnw', undefined, 'finance_core', 'n', 'Ledger riser'), L('jnw-audit', 'jnw', undefined, 'audit_gallery', 's', 'Gallery branch'),
  L('jw-fc', 'jw', undefined, 'finance_core', 'e', 'Finance branch'), L('jsw-sp', 'jsw', undefined, 'service_payments', 'n', 'Service branch'), L('jsw-pp', 'jsw', undefined, 'payroll_pensions', 'n', 'Staff branch'),
  L('je-po', 'je', undefined, 'payment_orchestration', 'w', 'Payments branch'), L('je-jne', 'je', undefined, 'jne', undefined, 'Exchange concourse'),
  L('jne-ix', 'jne', undefined, 'integration_exchange', 's', 'Exchange branch'), L('jne-po', 'jne', undefined, 'payment_orchestration', 'n', 'Orchestration riser'), L('jne-agency', 'jne', undefined, 'agency_handoff', 'w', 'Hand-off branch'),
  L('js-card', 'js', undefined, 'card_payments', 'n', 'Cards branch'), L('js-jse', 'js', undefined, 'jse', undefined, 'Rails concourse'),
  L('jse-bacs', 'jse', undefined, 'bacs_vault', 'n', 'Vault branch'), L('jse-debt', 'jse', undefined, 'debt_recovery', 'n', 'Recovery branch'), L('jse-agency', 'jse', undefined, 'agency_handoff', 's', 'Agency branch'), L('jse-po', 'jse', undefined, 'payment_orchestration', 's', 'Payment rail riser'),
  // direct room-to-room corridors: loops, cross-links and shortcuts
  L('es-fab', 'event_stream', 'e', 'fabric_platform', 'w', 'Stream link'), L('fab-api', 'fabric_platform', 'e', 'api_gateway', 'w', 'Platform link'),
  L('es-api', 'event_stream', 'n', 'api_gateway', 'n', 'Conduit shortcut (Event Stream to API Gateway)', 'maintenance'),
  L('es-audit', 'event_stream', 'w', 'audit_gallery', 'e', 'Gallery approach'), L('api-ix', 'api_gateway', 'e', 'integration_exchange', 'w', 'Gateway link'),
  L('ix-agency', 'integration_exchange', 's', 'agency_handoff', 'n', 'Courier lift (Integration Exchange to Agency Hand-off)', 'maintenance'),
  L('jnw-jbc', 'jnw', undefined, 'jbc', undefined, 'Command spine'), L('jbc-bcp', 'jbc', undefined, 'bcp_command', 's', 'Command branch'), L('jbc-exp', 'jbc', undefined, 'expense_claims', 'n', 'Claims branch'),
  L('bcp-audit', 'bcp_command', 'e', 'audit_gallery', 'w', 'Command to gallery'), L('exp-fc', 'expense_claims', 'e', 'finance_core', 'w', 'Claims to ledger'),
  L('fc-sp', 'finance_core', 's', 'service_payments', 'n', 'Service walk'), L('sp-pp', 'service_payments', 'e', 'payroll_pensions', 'w', 'Staff corridor'),
  L('sp-card', 'service_payments', 'e', 'card_payments', 'w', 'Back-office shortcut (Service Payments to Card Payments)', 'maintenance'),
  L('card-bacs', 'card_payments', 'e', 'bacs_vault', 'w', 'Rails corridor'), L('bacs-debt', 'bacs_vault', 'e', 'debt_recovery', 'w', 'Service tunnel'), L('agency-debt', 'agency_handoff', 's', 'debt_recovery', 'n', 'Recovery walk'),
];
const isRoom = (id: string) => !!R[id];

const propCells = (id: string) => new Set((SPECS.find((s) => s.id === id)?.props ?? []).filter((p) => !p[1].startsWith('d_cable')).map((p) => `${R[id].x + R[id].ox + p[2]},${R[id].y + R[id].oy + p[3]}`));
const v: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const owner: (string | null)[][] = Array.from({ length: H }, () => Array(W).fill(null));
for (const r of Object.values(R)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) owner[y][x] = r.id;
for (const a of Object.values(R)) for (const b of Object.values(R)) if (a.id < b.id && a.x < b.x + b.w + 2 && b.x < a.x + a.w + 2 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2) console.error('TOO CLOSE', a.id, b.id);

interface Door { side: Side; cells: [number, number][]; out: [number, number][]; reader: [number, number] }
const used: Record<string, number[]> = {};     // room+side -> door start positions along the wall
const centre = (id: string): [number, number] => (isRoom(id) ? [R[id].x + R[id].w / 2, R[id].y + R[id].h / 2] : [J[id].x + J[id].w / 2, J[id].y + J[id].h / 2]);
function makeDoor(rid: string, side: Side, toward: string): Door {
  const r = R[rid], pc = propCells(rid), horiz = side === 'n' || side === 's', [cx, cy] = centre(toward);
  const len = horiz ? r.w : r.h, want = horiz ? cx : cy, base = horiz ? r.x : r.y;
  const key = rid + side; used[key] ??= [];
  let best: number | null = null, bd = Infinity;
  for (let p = 2; p <= len - 3; p++) {   // door occupies p, p+1; reader at p-1 (needs p-1 >= 1 and not a corner)
    if (used[key].some((q) => Math.abs(q - p) < 3)) continue;
    const cells: [number, number][] = [0, 1].map((k) => (horiz ? [r.x + p + k, side === 'n' ? r.y : r.y + r.h - 1] : [side === 'w' ? r.x : r.x + r.w - 1, r.y + p + k]) as [number, number]);
    let ok = true;
    for (const c of cells) { const ix = c[0] - v[side][0], iy = c[1] - v[side][1]; if (pc.has(`${ix},${iy}`)) ok = false; }
    if (!ok) continue;
    const dist = Math.abs(base + p + 1 - want); if (dist < bd) { bd = dist; best = p; }
  }
  if (best === null) throw new Error(`no door slot ${rid} ${side} -> ${toward}`);
  used[key].push(best);
  const cells: [number, number][] = [0, 1].map((k) => (horiz ? [r.x + best! + k, side === 'n' ? r.y : r.y + r.h - 1] : [side === 'w' ? r.x : r.x + r.w - 1, r.y + best! + k]) as [number, number]);
  const out = cells.map((c) => [c[0] + v[side][0], c[1] + v[side][1]] as [number, number]);
  const reader: [number, number] = horiz ? [r.x + best - 1, cells[0][1]] : [cells[0][0], r.y + best - 1];
  return { side, cells, out, reader };
}

// place every door first (nearest slot to the other end), then route
const doors: Record<string, { a?: Door; b?: Door }> = {};
for (const l of LINKS) doors[l.id] = { a: isRoom(l.a) ? makeDoor(l.a, l.sa!, l.b) : undefined, b: isRoom(l.b) ? makeDoor(l.b, l.sb!, l.a) : undefined };
const doorList = (id: string) => [doors[id].a, doors[id].b].filter(Boolean) as Door[];
const reserve: Record<string, Set<string>> = {};   // cells around each link's door-outs that other links must keep clear
for (const l of LINKS) { const set = new Set<string>(); for (const d of doorList(l.id)) for (const [x, y] of d.out) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set.add(`${x + dx},${y + dy}`); reserve[l.id] = set; }
const claim: (string | null)[][] = Array.from({ length: H }, () => Array(W).fill(null));
for (const j of Object.values(J)) { for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) { if (owner[y][x]) console.error('JUNCTION ON ROOM', j.id); claim[y][x] = 'J:' + j.id; } for (const r of Object.values(R)) if (j.x < r.x + r.w + 1 && r.x < j.x + j.w + 1 && j.y < r.y + r.h + 1 && r.y < j.y + j.h + 1) console.error('JUNCTION TOO CLOSE', j.id, r.id); }
const ends = (l: Lk) => [l.a, l.b];
const allowed = (c: string, l: Lk) => c === l.id || (c.startsWith('J:') && ends(l).includes(c.slice(2))) || (!c.startsWith('J:') && LINKS.some((o) => o.id === c && ends(o).some((e) => !isRoom(e) && ends(l).includes(e))) );
const nearForeign = (x: number, y: number, l: Lk) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const c = claim[y + dy]?.[x + dx]; if (c && !allowed(c, l)) return true; } return false; };
/** The 2x2 brush at (x,y) overlaps the plaza or shares an EDGE with it (a corner touch would not connect for a walker). */
const touches = (x: number, y: number, j: Jn) => {
  const rowsOverlap = y < j.y + j.h && y + 2 > j.y, colsOverlap = x < j.x + j.w && x + 2 > j.x;
  if (rowsOverlap && colsOverlap) return true;
  return (rowsOverlap && (x + 2 === j.x || x === j.x + j.w)) || (colsOverlap && (y + 2 === j.y || y === j.y + j.h));
};
const route = (l: Lk): [number, number][] | null => {
  const free2 = (x: number, y: number) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => {
    const X = x + dx, Y = y + dy;
    if (X < 1 || Y < 1 || X > W - 2 || Y > H - 2 || owner[Y][X]) return false;
    const c = claim[Y][X]; if (c && !(c === l.id || (c.startsWith('J:') && ends(l).includes(c.slice(2))))) return false;
    if (nearForeign(X, Y, l)) return false;
    return !LINKS.some((o) => o.id !== l.id && reserve[o.id].has(`${X},${Y}`) && !ends(o).some((e) => !isRoom(e) && ends(l).includes(e)));
  });
  const key = (x: number, y: number) => y * 1000 + x;
  const start: [number, number][] = [], goalTest: (x: number, y: number) => boolean = (() => {
    const eb = l.b;
    return isRoom(eb) ? (x, y) => x === doors[l.id].b!.out[0][0] && y === doors[l.id].b!.out[0][1] : (x, y) => touches(x, y, J[eb]);
  })();
  if (isRoom(l.a)) start.push(doors[l.id].a!.out[0]);
  else for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) if (touches(x, y, J[l.a]) && free2(x, y)) start.push([x, y]);
  const exempt = (x: number, y: number) => (isRoom(l.a) && x === doors[l.id].a!.out[0][0] && y === doors[l.id].a!.out[0][1]) || (isRoom(l.b) && x === doors[l.id].b!.out[0][0] && y === doors[l.id].b!.out[0][1]);
  const prev = new Map<number, [number, number] | null>(), q: [number, number][] = [];
  for (const st of start) { prev.set(key(st[0], st[1]), null); q.push(st); }
  let found: [number, number] | null = null;
  while (q.length) {
    const [x, y] = q.shift()!; if (goalTest(x, y)) { found = [x, y]; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (prev.has(key(nx, ny))) continue;
      if (!exempt(nx, ny) && !free2(nx, ny)) continue;
      prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
    }
  }
  if (!found) { console.error('  debug', l.id, 'starts', start.length, 'visited', prev.size); return null; }
  const path: [number, number][] = []; for (let c: [number, number] | null = found; c; c = prev.get(key(c[0], c[1])) ?? null) path.unshift(c);
  return path;
};
const cellsOf = new Map<string, Set<string>>();
const dist = (l: Lk) => { const [ax, ay] = centre(l.a), [bx, by] = centre(l.b); return Math.abs(ax - bx) + Math.abs(ay - by); };
for (const l of [...LINKS].sort((p, q) => dist(p) - dist(q))) {
  const p = route(l); if (!p) { console.error('NO ROUTE', l.id); continue; }
  const set = new Set<string>();
  for (const d of doorList(l.id)) for (const [x, y] of d.out) set.add(`${x},${y}`);
  for (const [x, y] of p) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const X = x + dx, Y = y + dy; if (!owner[Y][X] && !claim[Y][X]) set.add(`${X},${Y}`); }
  for (const k of set) { const [x, y] = k.split(',').map(Number); claim[y][x] = l.id; }
  cellsOf.set(l.id, set);
}
function rects(set: Set<string>) {
  const rows = new Map<number, number[]>(); for (const k of set) { const [x, y] = k.split(',').map(Number); (rows.get(y) ?? rows.set(y, []).get(y)!).push(x); }
  const runs: { x: number; y: number; w: number; h: number }[] = [];
  for (const y of [...rows.keys()].sort((a, b) => a - b)) { const xs = rows.get(y)!.sort((a, b) => a - b); let s0 = xs[0], p0 = xs[0]; for (let i = 1; i <= xs.length; i++) { if (i < xs.length && xs[i] === p0 + 1) { p0 = xs[i]; continue; } runs.push({ x: s0, y, w: p0 - s0 + 1, h: 1 }); s0 = xs[i]; p0 = xs[i]; } }
  const out: typeof runs = [];
  for (const r of runs) { const m = out.find((o) => o.x === r.x && o.w === r.w && o.y + o.h === r.y); if (m) m.h++; else out.push({ ...r }); }
  return out;
}
const grid = Array.from({ length: H }, () => Array(W).fill('.'));
for (const r of Object.values(R)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) ? '#' : ' ';
for (const [id, set] of cellsOf) for (const k of set) { const [x, y] = k.split(',').map(Number); grid[y][x] = LINKS.find((l) => l.id === id)!.kind === 'maintenance' ? 'm' : '+'; }
for (const j of Object.values(J)) for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) grid[y][x] = 'J';
for (const l of LINKS) for (const d of doorList(l.id)) { for (const [x, y] of d.cells) grid[y][x] = 'D'; grid[d.reader[1]][d.reader[0]] = 'r'; }
console.log(grid.map((r) => r.join('')).join('\n'));
console.log(LINKS.map((l) => `${l.id}:${cellsOf.has(l.id) ? (cellsOf.get(l.id)!.size / 2) | 0 : 'NONE'}`).join('  '));

if (process.argv.includes('--emit')) {
  const j = (x: unknown) => JSON.stringify(x).replace(/"([a-z]+)":/gi, '$1:').replace(/,/g, ', ');
  const ds = (x: Door | undefined) => (x ? `{ side: '${x.side}', cells: ${j(x.cells)}, reader: ${j(x.reader)} }` : 'undefined');
  const out = `// GENERATED by tools/layout-lab.mts, then committed as explicit data. Edit the lab, not this file.
// Rooms, junctions (concourses), corridors and doors are listed here; nothing is inferred from screen position.
import type { RoomId, Side } from '../game/types';

export const WORLD_W = ${W}, WORLD_H = ${H};
export interface LayoutRoom { id: RoomId; x0: number; y0: number; w: number; h: number; /** room-local prop cells are measured from (x0+ox, y0+oy) */ ox: number; oy: number }
/** A corridor junction: an open plaza where corridors meet. Walking between rooms never needs to pass through a locked room. */
export interface LayoutJunction { id: string; name: string; x: number; y: number; w: number; h: number }
export interface DoorSpec { side: Side; cells: [[number, number], [number, number]]; reader: [number, number] }
export interface Rect { x: number; y: number; w: number; h: number }
/** A link joins two graph nodes (a room or a junction). A room end has a door; a junction end opens onto the plaza. */
export interface LinkDef { id: string; a: string; b: string; kind: 'main' | 'maintenance'; label: string; da?: DoorSpec; db?: DoorSpec; corridor: Rect[] }

export const LAYOUT_ROOMS: LayoutRoom[] = [
${Object.values(R).map((r) => `  { id: '${r.id}', x0: ${r.x}, y0: ${r.y}, w: ${r.w}, h: ${r.h}, ox: ${r.ox}, oy: ${r.oy} },`).join('\n')}
];

export const LAYOUT_JUNCTIONS: LayoutJunction[] = [
${Object.values(J).map((q) => `  { id: '${q.id}', name: ${JSON.stringify(q.name)}, x: ${q.x}, y: ${q.y}, w: ${q.w}, h: ${q.h} },`).join('\n')}
];

export const LINKS: LinkDef[] = [
${LINKS.map((l) => { const d = doors[l.id]; return `  { id: '${l.id}', a: '${l.a}', b: '${l.b}', kind: '${l.kind}', label: ${JSON.stringify(l.label)},${d.a ? `\n    da: ${ds(d.a)},` : ''}${d.b ? `\n    db: ${ds(d.b)},` : ''}\n    corridor: ${j(rects(cellsOf.get(l.id) ?? new Set())).replace(/\{x:/g, '{ x:').replace(/\}/g, ' }')} },`; }).join('\n')}
];
`;
  writeFileSync('src/data/layout.ts', out); console.log('wrote src/data/layout.ts');
}
