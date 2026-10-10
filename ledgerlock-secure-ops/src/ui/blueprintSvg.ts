import { PALETTE, TILE_H, TILE_W } from '../game/constants';
import type { GameState } from '../game/systems/GameState';
import type { PaletteKey } from '../game/constants';
import type { RoomId, RouteDef, RouteState } from '../game/types';
import { CORRIDORS, DIAGRAMS, FACILITY, nodeOf, GRAPH_ROOMS, GRAPH_ROOM_BY_ID, EQUIPMENT_BY_ID, PORTS, isReturning, layoutDiagram, type DiagramView, type IncidentLink } from '../data/facilityGraph';
import { EXTERNALS, ROOM_BY_ID } from '../data/map';
import { ROUTE_BY_ID, ROUTES, STATE_LABEL, routePoints } from '../data/routes';
import { esc } from './dom';

/** Pure SVG generators for the Facility Map, System Diagrams and Room Blueprints. Every shape comes from the facility graph. */
const col = (k: PaletteKey | string) => (PALETTE as Record<string, string>)[k] ?? '#8aa';
export const routeColour = (r: RouteDef) => col(r.color);
export const stateOf = (s: GameState, id: string): RouteState => s.routeStates[id] ?? 'healthy';

/** Line pattern per state: solid = active, dashed = simulated/return response, dotted + lock = isolated, dot-dash = delayed. */
export function dashFor(r: RouteDef, st: RouteState): string {
  if (st === 'quarantined') return '1 7';
  if (st === 'delayed') return '3 3 10 3';
  if (st === 'rerouted') return '2 4 10 4';
  return r.dashed ? '9 5' : '';
}
export const roomLocked = (s: GameState, id: RoomId) => !s.passes.has(ROOM_BY_ID[id].requiredPass);

const DEFS = `<defs>
  <pattern id="lockHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#FFC45E" stroke-width="2" opacity=".55"/></pattern>
  ${(['cyan', 'blue', 'mint', 'violet', 'periwinkle', 'amber', 'coral', 'white'] as PaletteKey[]).map((k) => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${col(k)}"/></marker>`).join('')}
</defs>`;

// ------------------------------------------------------------------------------------------------ overview ----
export interface OverviewOpts { mode: 'iso' | 'top'; selRoom: RoomId | null; selRoute: string | null; showRoutes: boolean; incident: IncidentLink | null; waypoint?: { x: number; y: number } | null }

/** Grid -> drawing coordinates for the two map modes (iso uses the game's own 2:1 projection). */
export function projector(mode: 'iso' | 'top') {
  const S = 15, k = 0.62;
  return mode === 'top' ? (gx: number, gy: number): [number, number] => [gx * S, gy * S] : (gx: number, gy: number): [number, number] => [((gx - gy) * TILE_W * k) / 2, ((gx + gy) * TILE_H * k) / 2];
}
const BOUNDS = () => {
  const xs = EXTERNALS.map((e) => e.x + e.w), ys0 = EXTERNALS.map((e) => e.y), ys1 = EXTERNALS.map((e) => e.y + e.h);
  return { x0: FACILITY.x0 - 1, x1: Math.max(FACILITY.x0 + FACILITY.w, ...xs) + 1.5, y0: Math.min(FACILITY.y0, ...ys0) - 1, y1: Math.max(FACILITY.y0 + FACILITY.h, ...ys1) + 2.5 };
};
export function overviewBox(mode: 'iso' | 'top'): { x: number; y: number; w: number; h: number } {
  const P = projector(mode), b = BOUNDS();
  const pts = [P(b.x0, b.y0), P(b.x1, b.y0), P(b.x1, b.y1), P(b.x0, b.y1)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
const poly = (P: ReturnType<typeof projector>, c: [number, number][]) => c.map(([x, y]) => P(x, y).map((v) => v.toFixed(1)).join(',')).join(' ');
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export function overviewSvg(s: GameState, o: OverviewOpts): string {
  const P = projector(o.mode), box = overviewBox(o.mode), fs = o.mode === 'top' ? 16 : 20;
  const near = new Set<string>(); if (o.selRoom) for (const c of CORRIDORS) if (c.from === o.selRoom || c.to === o.selRoom) near.add(`${c.from}>${c.to}`);
  const selRoute = o.selRoute ? ROUTE_BY_ID[o.selRoute] : null;
  const roomRoutes = new Set(o.selRoom ? GRAPH_ROOM_BY_ID[o.selRoom].routeIds : []);
  const out: string[] = [`<svg class="bp-svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="group" aria-label="Facility ${o.mode === 'iso' ? 'isometric plan' : 'top-down schematic'}" xmlns="http://www.w3.org/2000/svg">`, DEFS];
  out.push(`<polygon points="${poly(P, rect(FACILITY.x0, FACILITY.y0, FACILITY.w, FACILITY.h))}" fill="#10203a" stroke="#2c4a75" stroke-width="2"/>`);
  for (const c of CORRIDORS) {
    const on = near.has(`${c.from}>${c.to}`);
    out.push(`<polygon points="${poly(P, rect(c.x, c.y, c.w, c.h))}" fill="${on ? '#3a5f93' : '#1f3556'}" stroke="${on ? '#F3F6FA' : '#34517f'}" stroke-width="${on ? 2.5 : 1}"><title>Corridor ${esc(GRAPH_ROOM_BY_ID[c.from].code)}–${esc(GRAPH_ROOM_BY_ID[c.to].code)} (walkable)</title></polygon>`);
  }
  // perimeter walkway ring is implied by the facility base; label it once
  const lab = P(FACILITY.x0 + 1, FACILITY.y0 + FACILITY.h - 0.4);
  out.push(`<text x="${lab[0]}" y="${lab[1]}" fill="#7f9bc4" font-size="${fs - 1}">corridors are walkable; data routes are not</text>`);
  for (const r of GRAPH_ROOMS) {
    const lk = roomLocked(s, r.id), sel = r.id === o.selRoom, acc = col(ROOM_BY_ID[r.id].accent);
    const inc = o.incident?.sourceRoom === r.id, evi = o.incident?.evidenceRooms.includes(r.id), rel = roomRoutes.has('') ;
    void rel;
    const c = P(r.x0 + r.w / 2, r.y0 + r.h / 2);
    out.push(`<g class="bp-room${sel ? ' sel' : ''}" data-room="${r.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(r.code)} ${esc(r.name)}. ${lk ? 'Locked: needs the ' + esc(r.passName) : 'Open'}${inc ? '. Incident source' : ''}">
      <polygon points="${poly(P, rect(r.x0, r.y0, r.w, r.h))}" fill="${acc}" fill-opacity="${sel ? 0.42 : 0.2}" stroke="${sel ? '#F3F6FA' : acc}" stroke-width="${sel ? 4 : 2}"/>
      ${lk ? `<polygon points="${poly(P, rect(r.x0, r.y0, r.w, r.h))}" fill="url(#lockHatch)" pointer-events="none"/>` : ''}
      <text x="${c[0]}" y="${c[1] - 2}" text-anchor="middle" fill="#F3F6FA" font-size="${fs + 4}" font-weight="800">${esc(r.code)}</text>
      <text x="${c[0]}" y="${c[1] + fs + 2}" text-anchor="middle" fill="#F3F6FA" font-size="${fs}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(r.name.replace('Accounts Receivable and Debt Recovery', 'AR & Debt Recovery'))}</text>
      <text x="${c[0]}" y="${c[1] + fs * 2 + 4}" text-anchor="middle" fill="${lk ? '#FFC45E' : '#9DE3B1'}" font-size="${fs - 3}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${lk ? '🔒 ' + esc(r.passName.replace(' Pass', '').replace(' Audit', '').replace(' Read', '')) : '✓ open'}</text>
      ${inc ? `<text x="${c[0] + 4 * (o.mode === 'top' ? 15 : 11)}" y="${c[1] - 14}" font-size="${fs + 8}" fill="#FF7183" stroke="#0B1424" stroke-width="3" paint-order="stroke">⚠</text>` : ''}
      ${evi && !inc ? `<text x="${c[0] + 4 * (o.mode === 'top' ? 15 : 11)}" y="${c[1] - 14}" font-size="${fs + 4}" fill="#FFC45E" stroke="#0B1424" stroke-width="3" paint-order="stroke">⌕</text>` : ''}
      <title>${esc(r.code)} · ${esc(r.name)} (${lk ? 'locked' : 'open'})</title></g>`);
    for (const d of r.doors) {
      const [a, b] = d.cells, ox = d.side === 'e' ? 0.5 : d.side === 'w' ? -0.5 : 0, oy = d.side === 's' ? 0.5 : d.side === 'n' ? -0.5 : 0;
      const nxt = roomLocked(s, d.toward);
      out.push(`<polygon points="${poly(P, [[Math.min(a.x, b.x) + ox, Math.min(a.y, b.y) + oy], [Math.max(a.x, b.x) + 1 + ox, Math.min(a.y, b.y) + oy], [Math.max(a.x, b.x) + 1 + ox, Math.max(a.y, b.y) + 1 + oy], [Math.min(a.x, b.x) + ox, Math.max(a.y, b.y) + 1 + oy]])}" fill="${nxt ? '#FFC45E' : '#9DE3B1'}" fill-opacity=".85" stroke="#0B1424" stroke-width="1"><title>Door ${esc(r.code)} → ${esc(GRAPH_ROOM_BY_ID[d.toward].code)} (${nxt ? 'locked for you' : 'open'})</title></polygon>`);
      const rc = P(d.readerCell.x + 0.5, d.readerCell.y + 0.5);
      out.push(`<circle cx="${rc[0]}" cy="${rc[1]}" r="${o.mode === 'top' ? 4.5 : 5}" fill="#37D7D0" stroke="#0B1424"><title>Access reader</title></circle>`);
    }
  }
  const en = FACILITY.entrance, ec = P(en.x + en.w / 2, en.y + 0.5);
  out.push(`<polygon points="${poly(P, rect(en.x, en.y - 0.5, en.w, 1))}" fill="#9DE3B1" stroke="#0B1424"/><text x="${ec[0]}" y="${ec[1] + fs + 6}" text-anchor="middle" fill="#9DE3B1" font-size="${fs}" font-weight="700">▲ Facility entrance</text>`);
  for (const x of EXTERNALS) {
    const c = P(x.x + x.w / 2, x.y + x.h / 2);
    out.push(`<polygon points="${poly(P, rect(x.x, x.y, x.w, x.h))}" fill="${col(x.color)}" fill-opacity=".2" stroke="${col(x.color)}" stroke-dasharray="6 4" stroke-width="2"><title>${esc(x.name)} (simulated external)</title></polygon><text x="${c[0]}" y="${c[1]}" text-anchor="middle" fill="#F3F6FA" font-size="${fs}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(x.name)}</text><text x="${c[0]}" y="${c[1] + fs + 1}" text-anchor="middle" fill="#9fb4d6" font-size="${fs - 2}">(simulated)</text>`);
  }
  if (o.showRoutes || selRoute) {
    const list = ROUTES.filter((r) => o.showRoutes || r.id === selRoute?.id);
    for (const r of list) {
      const st = stateOf(s, r.id), pts = routePoints(r), strong = r.id === selRoute?.id || roomRoutes.has(r.id) || o.incident?.routeIds.includes(r.id);
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${P(x, y).map((v) => v.toFixed(1)).join(',')}`).join(' ');
      const colr = st === 'suspicious' ? col('amber') : st === 'quarantined' ? col('coral') : routeColour(r);
      out.push(`<g class="bp-route-ov" pointer-events="none" aria-label="${esc(r.name)}: ${STATE_LABEL[st].label}"><path d="${d}" fill="none" stroke="${colr}" stroke-width="${strong ? fs * 0.5 : fs * 0.28}" stroke-opacity="${strong || !o.selRoom ? 0.95 : 0.3}" ${dashFor(r, st) ? `stroke-dasharray="${dashFor(r, st)}"` : ''} stroke-linejoin="round" marker-end="url(#ar-${st === 'suspicious' ? 'amber' : st === 'quarantined' ? 'coral' : r.color})"/>
        ${st === 'quarantined' ? (() => { const m = pts[Math.floor(pts.length / 2)], q = P(m[0], m[1]); return `<text x="${q[0]}" y="${q[1]}" font-size="${fs + 6}" text-anchor="middle" fill="#FF7183" stroke="#0B1424" stroke-width="3" paint-order="stroke">🔒</text>`; })() : ''}<title>${esc(r.name)} · ${STATE_LABEL[st].label}</title></g>`);
    }
  }
  if (o.waypoint) { const w = P(o.waypoint.x + 0.5, o.waypoint.y + 0.5); out.push(`<circle cx="${w[0]}" cy="${w[1]}" r="${fs * 0.8}" fill="none" stroke="#37D7D0" stroke-width="4"/><text x="${w[0]}" y="${w[1] - 14}" text-anchor="middle" fill="#37D7D0" font-size="${fs}" font-weight="700">Waypoint</text>`); }
  const pl = P(s.player.x, s.player.y);
  out.push(`<g aria-label="You are here"><circle cx="${pl[0]}" cy="${pl[1]}" r="${fs * 0.7}" fill="#FFC45E" stroke="#0B1424" stroke-width="3"/><text x="${pl[0]}" y="${pl[1] - fs}" text-anchor="middle" fill="#FFC45E" font-size="${fs + 1}" font-weight="800" stroke="#0B1424" stroke-width="3" paint-order="stroke">You</text></g>`);
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------------------------------------------ diagrams ----
export interface DiagramOpts { view: DiagramView; types: Set<string>; status: string; onlyIncident: boolean; selRoute: string | null; selNode: string | null; incident: IncidentLink | null; reduced: boolean }
const NW = 158, NH = 58, GX = 216, GY = 132, PADX = 24, PADY = 70;

export function diagramSvg(s: GameState, o: DiagramOpts): { svg: string; shown: string[]; w: number; h: number } {
  const lay = layoutDiagram(o.view), pos: Record<string, { x: number; y: number }> = {};
  for (const n of lay.nodes) pos[n.id] = { x: PADX + n.col * GX, y: PADY + n.row * GY };
  const W = PADX * 2 + (lay.cols - 1) * GX + NW, H = PADY * 2 + (lay.rows - 1) * GY + NH + 24;
  const routes = o.view.routeIds.map((id) => ROUTE_BY_ID[id]).filter((r) => o.types.has(r.type) && (o.status === 'all' || stateOf(s, r.id) === o.status) && (!o.onlyIncident || o.incident?.routeIds.includes(r.id)));
  const out: string[] = [`<svg class="bp-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.view.title)}" xmlns="http://www.w3.org/2000/svg">`, DEFS];
  // physical corridors (access view): thin grey double lines, clearly not data routes
  if (o.view.id === 'access') {
    for (const c of CORRIDORS) {
      const a = pos[c.from], b = pos[c.to]; if (!a || !b) continue;
      const x1 = a.x + NW / 2, y1 = a.y + NH / 2, x2 = b.x + NW / 2, y2 = b.y + NH / 2;
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#46618c" stroke-width="9" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#16263f" stroke-width="3" stroke-linecap="round"/>`);
    }
    out.push(`<text x="${W - 14}" y="${H - 8}" text-anchor="end" fill="#9fb4d6" font-size="12">grey double lines = physical corridors (walkable) · coloured arrows = data routes (not walkable)</text>`);
  }
  const shown: string[] = []; const stack: Record<string, number> = {};
  const edgeD = (a: { x: number; y: number }, b: { x: number; y: number }, off: number, back: boolean) => {
    const ax = a.x, bx = b.x;
    if (Math.abs(ax - bx) < 4) { const y1 = a.y + (b.y > a.y ? NH : 0), y2 = b.y + (b.y > a.y ? 0 : NH); return `M${ax + NW / 2 + off},${y1} L${bx + NW / 2 + off},${y2}`; }
    const right = bx > ax, x1 = right ? ax + NW : ax, x2 = right ? bx : bx + NW, y1 = a.y + NH / 2 + off, y2 = b.y + NH / 2 + off, mx = (x1 + x2) / 2;
    void back; return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  for (const r of routes) {
    const st = stateOf(s, r.id), colr = st === 'suspicious' ? col('amber') : st === 'quarantined' ? col('coral') : routeColour(r), sel = o.selRoute === r.id, inc = !!o.incident?.routeIds.includes(r.id);
    const off = r.lane * 44, back = isReturning(r.type);
    shown.push(r.id);
    out.push(`<g class="bp-route" data-route="${r.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(r.name)}, ${STATE_LABEL[st].label}. From ${esc(nodeLabel(r.hops[0]))} to ${esc(nodeLabel(r.hops[r.hops.length - 1]))}">`);
    r.hops.slice(1).forEach((h, i) => {
      const a = pos[r.hops[i]], b = pos[h]; if (!a || !b) return;
      const d = edgeD(a, b, off, back);
      out.push(`<path d="${d}" fill="none" stroke="transparent" stroke-width="18"/><path d="${d}" fill="none" stroke="${colr}" stroke-width="${sel || inc ? 5 : 3}" ${dashFor(r, st) ? `stroke-dasharray="${dashFor(r, st)}"` : ''} marker-end="url(#ar-${st === 'suspicious' ? 'amber' : st === 'quarantined' ? 'coral' : r.color})" ${sel ? 'filter="drop-shadow(0 0 4px #fff)"' : ''}/>`);
      if (st !== 'quarantined' && !o.reduced) out.push(`<circle r="4.5" fill="${colr}" stroke="#0B1424"><animateMotion dur="${(1 / r.speed / 2.2).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`);
      if (i === Math.floor((r.hops.length - 2) / 2)) {
        // labels sit above the node row (forward routes) or below it (returning routes), stacked so they never overlap
        const key = `${back ? 'b' : 'f'}${Math.round((a.x + b.x) / 2 / 40)}${Math.round(a.y / 40)}`, k = (stack[key] = (stack[key] ?? -1) + 1);
        const mx = (a.x + b.x) / 2 + NW / 2, base = Math.min(a.y, b.y), my = back ? Math.max(a.y, b.y) + NH + 22 + k * 17 : base - 10 - k * 17;
        out.push(`<text x="${mx}" y="${my}" text-anchor="middle" fill="${colr}" font-size="13" font-weight="700" stroke="#0B1424" stroke-width="4" paint-order="stroke">${back ? '\u2190' : '\u2192'} ${STATE_LABEL[st].icon} ${esc(r.name)}${st === 'quarantined' ? ' \u{1F512}' : ''}</text>`);
      }
    });
    out.push(`<title>${esc(r.name)} · ${STATE_LABEL[st].label}</title></g>`);
  }
  const used = new Set(routes.flatMap((r) => r.hops)); if (o.view.id === 'access') for (const n of lay.nodes) used.add(n.id);
  for (const n of lay.nodes) {
    if (!used.has(n.id)) continue;
    const p = pos[n.id], sel = o.selNode === n.id, locked = n.room && n.kind === 'room' ? roomLocked(s, n.room) : false;
    const acc = n.room ? col(ROOM_BY_ID[n.room].accent) : '#9fb4d6', inc = o.incident?.sourceRoom === n.id;
    const shape = n.kind === 'room' ? `<rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="10" fill="#142640" stroke="${sel ? '#F3F6FA' : acc}" stroke-width="${sel ? 4 : 2.5}"/>`
      : n.kind === 'external' ? `<polygon points="${p.x + 14},${p.y} ${p.x + NW - 14},${p.y} ${p.x + NW},${p.y + NH / 2} ${p.x + NW - 14},${p.y + NH} ${p.x + 14},${p.y + NH} ${p.x},${p.y + NH / 2}" fill="#142640" stroke="${sel ? '#F3F6FA' : '#9fb4d6'}" stroke-width="${sel ? 4 : 2.5}" stroke-dasharray="7 4"/>`
      : `<ellipse cx="${p.x + NW / 2}" cy="${p.y + NH / 2}" rx="${NW / 2}" ry="${NH / 2}" fill="#142640" stroke="${sel ? '#F3F6FA' : col('periwinkle')}" stroke-width="${sel ? 4 : 2.5}"/>`;
    out.push(`<g class="bp-node" data-node="${esc(n.id)}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(n.label)}${n.code ? ' ' + n.code : ''}${locked ? ', locked' : ''}">${shape}
      <text x="${p.x + NW / 2}" y="${p.y + 25}" text-anchor="middle" fill="#F3F6FA" font-size="15" font-weight="700">${n.code ? esc(n.code) + ' · ' : ''}${esc(n.label.length > 17 ? n.label.slice(0, 16) + '…' : n.label)}</text>
      <text x="${p.x + NW / 2}" y="${p.y + 45}" text-anchor="middle" fill="${n.kind === 'external' ? '#9fb4d6' : locked ? '#FFC45E' : '#9DE3B1'}" font-size="12.5">${n.kind === 'external' ? 'simulated external' : n.kind === 'station' ? 'Fabric stage' : locked ? '🔒 locked' : '✓ open'}${inc ? ' · ⚠ incident' : ''}</text>
      <title>${esc(n.label)}</title></g>`);
  }
  out.push('</svg>');
  return { svg: out.join(''), shown, w: W, h: H };
}
export const nodeLabel = (id: string) => nodeOf(id).label;

// ------------------------------------------------------------------------------------------------ room blueprint ----
export interface RoomOpts { room: RoomId; sel: string | null; incident: IncidentLink | null; evidenceAt: Record<string, { name: string; got: boolean }> }
const CELL = 54, MX = 200, MY = 96;
export function roomSvg(s: GameState, o: RoomOpts): string {
  const r = ROOM_BY_ID[o.room], g = GRAPH_ROOM_BY_ID[o.room], W = MX * 2 + r.w * CELL, H = MY * 2 + r.h * CELL;
  const X = (lx: number) => MX + lx * CELL, Y = (ly: number) => MY + ly * CELL;
  const out: string[] = [`<svg class="bp-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Floor plan of ${esc(r.name)}" xmlns="http://www.w3.org/2000/svg">`, DEFS];
  out.push(`<rect x="${X(0)}" y="${Y(0)}" width="${r.w * CELL}" height="${r.h * CELL}" fill="#10203a" stroke="#7f9bc4" stroke-width="4"/>`);
  for (let i = 1; i < r.w; i++) out.push(`<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(r.h)}" stroke="#1d3150" stroke-width="1"/>`);
  for (let j = 1; j < r.h; j++) out.push(`<line x1="${X(0)}" y1="${Y(j)}" x2="${X(r.w)}" y2="${Y(j)}" stroke="#1d3150" stroke-width="1"/>`);
  out.push(`<text x="${X(0) - 150}" y="${Y(0) - 62}" fill="#F3F6FA" font-size="22" font-weight="800">${esc(r.code)} · ${esc(r.name)}</text><text x="${X(0) - 150}" y="${Y(0) - 42}" fill="#9fb4d6" font-size="13">grid ${r.x0},${r.y0} · ${r.w}×${r.h} cells · column ${'ABCD'[r.col]}, row ${r.row + 1} · needs the ${esc(g.passName)}</text>`);
  for (const [side, label] of [['n', 'NORTH wall'], ['s', 'SOUTH wall'], ['w', 'WEST wall'], ['e', 'EAST wall']] as const) {
    const px = side === 'n' || side === 's' ? X(r.w / 2) : side === 'w' ? X(0) - 12 : X(r.w) + 12, py = side === 'n' ? Y(0) - 8 : side === 's' ? Y(r.h) + 22 : Y(r.h / 2);
    out.push(`<text x="${px}" y="${py}" text-anchor="${side === 'w' ? 'end' : side === 'e' ? 'start' : 'middle'}" fill="#5f7ca6" font-size="11" ${side === 'w' || side === 'e' ? `transform="rotate(${side === 'w' ? -90 : 90} ${px} ${py})" text-anchor="middle"` : ''}>${label}</text>`);
  }
  for (const d of r.doors) {
    const [a, b] = d.cells, lx = Math.min(a.x, b.x) - r.x0, ly = Math.min(a.y, b.y) - r.y0, horiz = d.side === 'n' || d.side === 's';
    const lk = roomLocked(s, d.toward), nb = GRAPH_ROOM_BY_ID[d.toward];
    const x = X(lx) - (d.side === 'w' ? 7 : 0) + (d.side === 'e' ? 0 : 0), y = Y(ly) - (d.side === 'n' ? 7 : 0);
    out.push(`<g aria-label="Door to ${esc(nb.name)}, ${lk ? 'locked for you' : 'open'}"><rect x="${horiz ? X(lx) : d.side === 'w' ? X(0) - 8 : X(r.w) - 2}" y="${horiz ? (d.side === 'n' ? Y(0) - 8 : Y(r.h) - 2) : Y(ly)}" width="${horiz ? CELL * 2 : 10}" height="${horiz ? 10 : CELL * 2}" fill="${lk ? '#FFC45E' : '#9DE3B1'}" stroke="#0B1424" stroke-width="1.5"/>${lk ? `<rect x="${horiz ? X(lx) : d.side === 'w' ? X(0) - 8 : X(r.w) - 2}" y="${horiz ? (d.side === 'n' ? Y(0) - 8 : Y(r.h) - 2) : Y(ly)}" width="${horiz ? CELL * 2 : 10}" height="${horiz ? 10 : CELL * 2}" fill="url(#lockHatch)"/>` : ''}
      <text x="${horiz ? X(lx) + CELL : d.side === 'w' ? X(0) - 18 : X(r.w) + 18}" y="${horiz ? (d.side === 'n' ? Y(0) - 18 : Y(r.h) + 34) : Y(ly) + CELL + 4}" text-anchor="${d.side === 'w' ? 'end' : horiz ? 'middle' : 'start'}" fill="${lk ? '#FFC45E' : '#9DE3B1'}" font-size="12" font-weight="700">${lk ? '🔒' : '✓'} → ${esc(nb.code)} ${esc(nb.name.length > 16 ? nb.name.slice(0, 15) + '…' : nb.name)}</text></g>`);
    const rc = d.readerCell; out.push(`<g aria-label="Access reader for ${esc(nb.name)} door"><circle cx="${X(rc.x - r.x0) + CELL / 2}" cy="${Y(rc.y - r.y0) + CELL / 2}" r="9" fill="#37D7D0" stroke="#0B1424" stroke-width="2"/><text x="${X(rc.x - r.x0) + CELL / 2}" y="${Y(rc.y - r.y0) + CELL / 2 + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#0B1424">R</text></g>`);
  }
  // route ports on the walls (data connections: a notch with an arrow, never a door)
  const used: Record<string, number> = {};
  for (const p of g.ports) {
    const i = (used[p.side] = (used[p.side] ?? -1) + 1), horiz = p.side === 'n' || p.side === 's';
    const along = [1.2, 7.8, 0.2, 9.2][i % 4], x = horiz ? X(along) : p.side === 'w' ? X(0) : X(r.w), y = horiz ? (p.side === 'n' ? Y(0) : Y(r.h)) : Y(along * 0.8);
    const first = ROUTE_BY_ID[p.routeIds[0]], c = routeColour(first), out2 = p.label.startsWith('Out');
    out.push(`<g aria-label="Route port: ${esc(p.label)}"><circle cx="${x}" cy="${y}" r="7" fill="#0B1424" stroke="${c}" stroke-width="3" ${out2 ? '' : 'stroke-dasharray="3 2"'}/><text x="${x}" y="${y + (p.side === 'n' ? -12 : p.side === 's' ? 22 : 4)}" text-anchor="${p.side === 'w' ? 'end' : p.side === 'e' ? 'start' : 'middle'}" dx="${p.side === 'w' ? -12 : p.side === 'e' ? 12 : 0}" fill="${c}" font-size="10">${out2 ? '→' : '←'} port</text><title>${esc(p.label)}</title></g>`);
  }
  let n = 0;
  for (const p of r.props) {
    const lx = p.gx - r.x0, ly = p.gy - r.y0, cx = X(lx) + CELL / 2, cy = Y(ly) + CELL / 2, sel = o.sel === p.id, st = s.status[p.id];
    const eq = EQUIPMENT_BY_ID[p.id], ev = o.evidenceAt[p.id], stroke = st === 'bad' ? '#FF7183' : st === 'suspect' ? '#FFC45E' : st === 'fixed' || st === 'ok' ? '#9DE3B1' : '#8aa6d0';
    if (!p.interactive) { out.push(`<rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" rx="4" fill="#1a2b43" stroke="#35507a" stroke-dasharray="3 3"><title>${esc(p.name)} (decor)</title></rect>`); continue; }
    n++;
    out.push(`<g class="bp-pin${sel ? ' sel' : ''}" data-prop="${p.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(eq?.label ?? p.name)}${ev ? ', evidence source' : ''}${st ? ', ' + st : ''}">
      <rect x="${cx - 17}" y="${cy - 17}" width="34" height="34" rx="9" fill="${sel ? '#F3F6FA' : '#16304f'}" stroke="${stroke}" stroke-width="${sel ? 4 : 3}"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="${sel ? '#0B1424' : '#F3F6FA'}">${n}</text>
      ${ev ? `<g><polygon points="${cx + 12},${cy - 26} ${cx + 22},${cy - 16} ${cx + 12},${cy - 6} ${cx + 2},${cy - 16}" fill="${ev.got ? '#9DE3B1' : '#FFC45E'}" stroke="#0B1424"/><text x="${cx + 12}" y="${cy - 12}" text-anchor="middle" font-size="10" font-weight="800" fill="#0B1424">${ev.got ? '✓' : '⌕'}</text></g>` : ''}
      <text x="${cx}" y="${cy + 33}" text-anchor="middle" fill="#F3F6FA" font-size="10.5" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc((eq?.label ?? p.name).replace(/ \(.*/, '').slice(0, 28))}</text>
      <title>${esc(eq?.label ?? p.name)}</title></g>`);
  }
  if (s.player.room === o.room) { const px = X(s.player.x - r.x0), py = Y(s.player.y - r.y0); out.push(`<circle cx="${px}" cy="${py}" r="9" fill="#FFC45E" stroke="#0B1424" stroke-width="2"/><text x="${px}" y="${py - 13}" text-anchor="middle" fill="#FFC45E" font-size="12" font-weight="800" stroke="#0B1424" stroke-width="3" paint-order="stroke">You</text>`); }
  out.push('</svg>');
  return out.join('');
}
export { DIAGRAMS, PORTS };
