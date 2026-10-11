import { PALETTE, TILE_H, TILE_W } from '../game/constants';
import type { GameState } from '../game/systems/GameState';
import type { PaletteKey } from '../game/constants';
import type { PassId, RoomId, RouteDef, RouteState } from '../game/types';
import { PASSES } from '../data/passes';
import { CORRIDORS, DIAGRAMS, FACILITY, LOOPS, loopLinks, loopRooms, locate, nodeCentre, nodeName, nodeOf, GRAPH_ROOMS, GRAPH_ROOM_BY_ID, EQUIPMENT_BY_ID, PORTS, isReturning, layoutDiagram, nodeRoute, type DiagramView, type IncidentLink } from '../data/facilityGraph';
import { EXTERNALS, LAYOUT_JUNCTIONS, ROOM_BY_ID, doorInfo, linkInfo, LINK_RULES, type DoorStatus } from '../data/map';
import { isKnown } from '../game/systems/Fog';
import { BAYS, WING_NAMES } from '../data/rooms';
import { ROUTE_BY_ID, ROUTES, STATE_LABEL, routePoints } from '../data/routes';
import { esc } from './dom';

/** Pure SVG generators for the Facility Map, System Diagrams and Room Blueprints. Every shape comes from the facility graph. */
const WING_NAME = WING_NAMES;
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
export type MapLayer = 'facility' | 'access' | 'incident';
export interface OverviewOpts { mode: 'iso' | 'top'; layer: MapLayer; selRoom: RoomId | null; selDoor?: string | null; selCorridor?: string | null; loop?: string | null; incident: IncidentLink | null; waypoint?: { x: number; y: number } | null; crew?: { id: string; name: string; colour: string; x: number; y: number; note: string }[] }

/** Colour-blind-safe door states (Okabe-Ito): the shape and the word carry the meaning as well as the colour. */
export const DOOR_STYLE: Record<DoorStatus, { colour: string; glyph: string; word: string; dash: string }> = {
  open: { colour: '#009E73', glyph: '●', word: 'Open', dash: '' },
  locked: { colour: '#E69F00', glyph: '■', word: 'Locked', dash: '' },
  sealed: { colour: '#D55E00', glyph: '◆', word: 'Sealed by incident', dash: '4 2' },
  disabled: { colour: '#9aa5b8', glyph: '▢', word: 'Temporarily disabled', dash: '2 3' },
};

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

/**
 * The physical facility: rooms, corridors and doors read straight from the facility graph (layout.ts links), never from where a
 * room happens to sit. Data routes are NOT drawn here (see the System diagrams); the three layers differ only in what they annotate.
 */
export function overviewSvg(s: GameState, o: OverviewOpts): string {
  const P = projector(o.mode), box = overviewBox(o.mode), fs = o.mode === 'top' ? 15 : 19;
  const loop = o.loop ? LOOPS.find((l) => l.id === o.loop) ?? null : null, loopSet = new Set(loop ? loopLinks(loop) : []), inLoopNodes = new Set<string>(loop?.nodes ?? []);
  const near = new Set<string>(); if (o.selRoom) for (const c of CORRIDORS) if (c.from === o.selRoom || c.to === o.selRoom) near.add(c.id);
  const path = o.layer === 'incident' && o.incident ? nodeRoute(locate(s.player.x, s.player.y) ?? 'secure_ops', o.incident.sourceRoom, { blocked: new Set(CORRIDORS.filter((c) => linkInfo(c.id, s.passes).status !== 'open').map((c) => c.id)), transit: (r) => r === 'secure_ops' || r === o.incident!.sourceRoom }) : null;
  const pathLinks = new Set<string>(); if (path) path.forEach((r, i) => { const n = path[i + 1]; const c = n && CORRIDORS.find((q) => (q.from === r && q.to === n) || (q.from === n && q.to === r)); if (c) pathLinks.add(c.id); });
  const out: string[] = [`<svg class="bp-svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="group" aria-label="Facility ${o.mode === 'iso' ? 'isometric plan' : 'top-down schematic'}: ${o.layer} view" xmlns="http://www.w3.org/2000/svg">`, DEFS];
  // corridors: explicit rectangles from the links
  for (const c of CORRIDORS) {
    const sel = o.selCorridor === c.id, on = near.has(c.id) || loopSet.has(c.id) || pathLinks.has(c.id) || sel, st = linkInfo(c.id, s.passes);
    const stroke = pathLinks.has(c.id) ? '#56B4E9' : on ? '#F3F6FA' : c.kind === 'maintenance' ? '#c9b25a' : '#34517f';
    out.push(`<g class="bp-corr" data-corr="${c.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${c.kind === 'maintenance' ? 'Maintenance corridor' : 'Corridor'}: ${esc(c.label)}, ${esc(nodeName(c.from))} to ${esc(nodeName(c.to))}${c.kind === 'maintenance' ? ', ' + esc(st.reason) : ''}">${c.rects.map((r) => `<polygon points="${poly(P, rect(r.x, r.y, r.w, r.h))}" fill="${on ? '#3a5f93' : c.kind === 'maintenance' ? '#2a3a4a' : '#1f3556'}" stroke="${stroke}" stroke-width="${on ? 2.5 : 1}" ${c.kind === 'maintenance' ? 'stroke-dasharray="5 3"' : ''}/>`).join('')}<title>${esc(c.label)}${c.kind === 'maintenance' ? ` (optional maintenance corridor: ${esc(st.reason)})` : ''}</title></g>`);
  }
  for (const j of LAYOUT_JUNCTIONS) {
    const on = loopSet.size > 0 && inLoopNodes.has(j.id), jc = P(j.x + j.w / 2, j.y + j.h / 2);
    out.push(`<g class="bp-junction" aria-label="Junction: ${esc(j.name)}"><polygon points="${poly(P, rect(j.x, j.y, j.w, j.h))}" fill="${on ? '#3a5f93' : '#27446e'}" stroke="${on ? '#56B4E9' : '#4a6a9c'}" stroke-width="${on ? 3 : 1.5}"/><text x="${jc[0]}" y="${jc[1] + 4}" text-anchor="middle" fill="#9fb4d6" font-size="${fs - 7}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(j.name.replace(' Concourse', ''))}</text><title>${esc(j.name)} (junction: open ground, no pass needed)</title></g>`);
  }
  for (const r of GRAPH_ROOMS) {
    const lk = roomLocked(s, r.id), sel = r.id === o.selRoom, acc = col(ROOM_BY_ID[r.id].accent), known = isKnown(s, r.id);
    const inc = o.incident?.sourceRoom === r.id, evi = o.incident?.evidenceRooms.includes(r.id), inLoop = inLoopNodes.has(r.id);
    const c = P(r.x0 + r.w / 2, r.y0 + r.h / 2);
    if (!known) {
      out.push(`<g class="bp-room unknown${sel ? ' sel' : ''}" data-room="${r.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="Unexplored room. Walk into it to reveal it."><polygon points="${poly(P, rect(r.x0, r.y0, r.w, r.h))}" fill="#0f1b2e" stroke="${sel ? '#F3F6FA' : '#34517f'}" stroke-width="${sel ? 4 : 2}" stroke-dasharray="6 5"/><text x="${c[0]}" y="${c[1] + fs / 2}" text-anchor="middle" fill="#5f7ca6" font-size="${fs + 8}" font-weight="800">?</text><title>Unexplored</title></g>`);
      continue;
    }
    out.push(`<g class="bp-room${sel ? ' sel' : ''}" data-room="${r.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(r.code)} ${esc(r.name)}. ${lk ? 'Locked: needs the ' + esc(r.passName) : 'Open'}${inc ? '. Incident source' : ''}">
      <polygon points="${poly(P, rect(r.x0, r.y0, r.w, r.h))}" fill="${acc}" fill-opacity="${sel ? 0.42 : inLoop ? 0.34 : 0.2}" stroke="${sel ? '#F3F6FA' : inLoop ? '#56B4E9' : acc}" stroke-width="${sel || inLoop ? 4 : 2}"/>
      ${lk ? `<polygon points="${poly(P, rect(r.x0, r.y0, r.w, r.h))}" fill="url(#lockHatch)" pointer-events="none"/>` : ''}
      <text x="${c[0]}" y="${c[1] - 2}" text-anchor="middle" fill="#F3F6FA" font-size="${fs + 3}" font-weight="800">${esc(r.code)}</text>
      <text x="${c[0]}" y="${c[1] + fs + 1}" text-anchor="middle" fill="#F3F6FA" font-size="${fs - 2}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(r.name.replace('Accounts Receivable & Debt Recovery', 'AR & Debt Recovery').replace('Payroll & Pensions Office', 'Payroll & Pensions').replace('Secure Operations Atrium', 'Secure Ops Atrium'))}</text>
      <text x="${c[0]}" y="${c[1] + fs * 2}" text-anchor="middle" fill="${lk ? '#E69F00' : '#2fd4a0'}" font-size="${fs - 4}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${lk ? '🔒 ' + esc(o.layer === 'access' ? r.passName : r.passName.replace(' Pass', '').replace(' Audit', '').replace(' Read', '')) : '✓ open'}</text>
      ${inc ? `<text x="${c[0] + 4 * (o.mode === 'top' ? 15 : 11)}" y="${c[1] - 14}" font-size="${fs + 8}" fill="#FF7183" stroke="#0B1424" stroke-width="3" paint-order="stroke">⚠</text>` : ''}
      ${s.mission.affectedRooms?.includes(r.id) && o.layer !== 'access' ? `<text x="${c[0] - 4 * (o.mode === 'top' ? 15 : 11)}" y="${c[1] - 14}" font-size="${fs + 5}" fill="#FFC45E" stroke="#0B1424" stroke-width="3" paint-order="stroke" aria-label="Affected by the incident">✖<title>Affected by this incident</title></text>` : ''}
      ${evi && !inc ? `<text x="${c[0] + 4 * (o.mode === 'top' ? 15 : 11)}" y="${c[1] - 14}" font-size="${fs + 4}" fill="#F0E442" stroke="#0B1424" stroke-width="3" paint-order="stroke">⌕</text>` : ''}
      <title>${esc(r.code)} · ${esc(r.name)} (${lk ? 'locked' : 'open'})</title></g>`);
    // workstation bays: small marked squares at the prop they belong to
    for (const b of BAYS.filter((q) => q.room === r.id)) {
      const pr = ROOM_BY_ID[r.id].props.find((p) => p.key === b.prop); if (!pr) continue;
      const q = P(pr.gx + 0.5, pr.gy + 0.5);
      out.push(`<g aria-label="${esc(b.label)}"><rect x="${q[0] - 5}" y="${q[1] - 5}" width="10" height="10" rx="2" fill="#0B1424" stroke="#CC79A7" stroke-width="2"/>${o.layer === 'access' ? `<text x="${q[0]}" y="${q[1] - 8}" text-anchor="middle" fill="#CC79A7" font-size="${fs - 7}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(b.dept)}</text>` : ''}<title>${esc(b.label)} (${esc(b.dept)})</title></g>`);
    }
  }
  // doors: a marker per door (shape + colour + word), selectable. Each corridor's two doors are listed in the graph.
  for (const r of GRAPH_ROOMS) {
    for (const d of r.doors) {
      const di = doorInfo(d, s.passes), st = DOOR_STYLE[di.status], [a, b] = d.cells, sel = o.selDoor === d.id;
      const known = isKnown(s, r.id) || (ROOM_BY_ID[d.toward as RoomId] ? isKnown(s, d.toward as RoomId) : true);
      if (!known) continue;
      const q = P((a.x + b.x) / 2 + 0.5, (a.y + b.y) / 2 + 0.5), z = o.mode === 'top' ? 7 : 8;
      const shape = di.status === 'open' ? `<circle cx="${q[0]}" cy="${q[1]}" r="${z}" fill="${st.colour}"/>` : di.status === 'locked' ? `<rect x="${q[0] - z}" y="${q[1] - z}" width="${z * 2}" height="${z * 2}" fill="${st.colour}"/>` : di.status === 'sealed' ? `<polygon points="${q[0]},${q[1] - z * 1.4} ${q[0] + z * 1.4},${q[1]} ${q[0]},${q[1] + z * 1.4} ${q[0] - z * 1.4},${q[1]}" fill="${st.colour}"/>` : `<rect x="${q[0] - z}" y="${q[1] - z}" width="${z * 2}" height="${z * 2}" fill="none" stroke="${st.colour}" stroke-width="3" stroke-dasharray="${st.dash}"/>`;
      out.push(`<g class="bp-door${sel ? ' sel' : ''}" data-door="${d.id}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="Door from ${esc(r.name)} to ${esc(nodeName(d.toward))}: ${st.word}. ${esc(di.reason)}">${shape}${sel ? `<circle cx="${q[0]}" cy="${q[1]}" r="${z + 5}" fill="none" stroke="#F3F6FA" stroke-width="3"/>` : ''}
        ${o.layer === 'access' && di.status !== 'open' ? `<text x="${q[0]}" y="${q[1] - z - 4}" text-anchor="middle" fill="${st.colour}" font-size="${fs - 6}" font-weight="700" stroke="#0B1424" stroke-width="3" paint-order="stroke">${di.need ? esc(PASSES_SHORT(di.need)) : st.word}</text>` : ''}<title>${esc(r.code)} → ${esc(nodeName(d.toward))}: ${st.word}. ${esc(di.reason)}</title></g>`);
    }
  }
  const en = FACILITY.entrance, ec = P(en.x + en.w / 2, en.y + 0.5);
  out.push(`<polygon points="${poly(P, rect(en.x, en.y - 0.5, en.w, 1))}" fill="#2fd4a0" stroke="#0B1424"/><text x="${ec[0]}" y="${ec[1] + fs + 6}" text-anchor="middle" fill="#2fd4a0" font-size="${fs}" font-weight="700">▲ Facility entrance</text>`);
  for (const x of EXTERNALS) {
    const c = P(x.x + x.w / 2, x.y + x.h / 2);
    out.push(`<polygon points="${poly(P, rect(x.x, x.y, x.w, x.h))}" fill="${col(x.color)}" fill-opacity=".2" stroke="${col(x.color)}" stroke-dasharray="6 4" stroke-width="2"><title>${esc(x.name)} (simulated external)</title></polygon><text x="${c[0]}" y="${c[1]}" text-anchor="middle" fill="#F3F6FA" font-size="${fs - 2}" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(x.name)}</text><text x="${c[0]}" y="${c[1] + fs}" text-anchor="middle" fill="#9fb4d6" font-size="${fs - 4}">(simulated)</text>`);
  }
  if (path && path.length > 1) { const pts = path.map((id) => { const c = nodeCentre(id); return P(c[0], c[1]).map((v) => v.toFixed(1)).join(','); }).join(' '); out.push(`<polyline points="${pts}" fill="none" stroke="#56B4E9" stroke-width="${fs * 0.35}" stroke-dasharray="10 6" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"><title>Corridor route from you to the incident room</title></polyline>`); }
  if (o.waypoint) { const w = P(o.waypoint.x + 0.5, o.waypoint.y + 0.5); out.push(`<circle cx="${w[0]}" cy="${w[1]}" r="${fs * 0.8}" fill="none" stroke="#37D7D0" stroke-width="4"/><text x="${w[0]}" y="${w[1] - 14}" text-anchor="middle" fill="#37D7D0" font-size="${fs}" font-weight="700">Waypoint</text>`); }
  const pl = P(s.player.x, s.player.y);
  out.push(`<g aria-label="You are here"><circle cx="${pl[0]}" cy="${pl[1]}" r="${fs * 0.7}" fill="#F0E442" stroke="#0B1424" stroke-width="3"/><text x="${pl[0]}" y="${pl[1] - fs}" text-anchor="middle" fill="#F0E442" font-size="${fs + 1}" font-weight="800" stroke="#0B1424" stroke-width="3" paint-order="stroke">You</text></g>`);
  for (const m of o.crew ?? []) { const q = P(m.x, m.y); out.push(`<g class="bp-crew" aria-label="${esc(m.name)}: ${esc(m.note)}"><circle cx="${q[0]}" cy="${q[1]}" r="${fs * 0.55}" fill="${m.colour}" stroke="#0B1424" stroke-width="3"/><text x="${q[0]}" y="${q[1] + fs * 0.25}" text-anchor="middle" fill="#0B1424" font-size="${fs * 0.7}" font-weight="800">${esc(m.name[0])}</text><text x="${q[0]}" y="${q[1] - fs * 0.8}" text-anchor="middle" fill="${m.colour}" font-size="${fs - 3}" font-weight="700" stroke="#0B1424" stroke-width="3" paint-order="stroke">${esc(m.name)}</text><title>${esc(m.name)}: ${esc(m.note)}</title></g>`); }
  out.push('</svg>');
  return out.join('');
}
const PASSES_SHORT = (id: string) => PASSES[id as PassId].name.replace(' Pass', '').replace(' Audit', '').replace(' Read', '');
void LINK_RULES;

// ------------------------------------------------------------------------------------------------ diagrams ----
export interface DiagramOpts { view: DiagramView; types: Set<string>; status: string; onlyIncident: boolean; selRoute: string | null; selNode: string | null; incident: IncidentLink | null; reduced: boolean }
const NW = 158, NH = 58, GX = 216, GY = 132, PADX = 24, PADY = 70;

export function diagramSvg(s: GameState, o: DiagramOpts): { svg: string; shown: string[]; w: number; h: number } {
  const lay = layoutDiagram(o.view), pos: Record<string, { x: number; y: number }> = {};
  for (const n of lay.nodes) pos[n.id] = { x: PADX + n.col * GX, y: PADY + n.row * GY };
  const W = PADX * 2 + (lay.cols - 1) * GX + NW, H = PADY * 2 + (lay.rows - 1) * GY + NH + 24;
  const routes = o.view.routeIds.map((id) => ROUTE_BY_ID[id]).filter((r) => o.types.has(r.type) && (o.status === 'all' || stateOf(s, r.id) === o.status) && (!o.onlyIncident || o.incident?.routeIds.includes(r.id)));
  const out: string[] = [`<svg class="bp-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.view.title)}" xmlns="http://www.w3.org/2000/svg">`, DEFS];
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
  const used = new Set(routes.flatMap((r) => r.hops));
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
  out.push(`<text x="${X(0) - 150}" y="${Y(0) - 62}" fill="#F3F6FA" font-size="22" font-weight="800">${esc(r.code)} · ${esc(r.name)}</text><text x="${X(0) - 150}" y="${Y(0) - 42}" fill="#9fb4d6" font-size="13">grid ${r.x0},${r.y0} · ${r.w}×${r.h} cells · ${esc(WING_NAME[r.wing])} · needs the ${esc(g.passName)}</text>`);
  for (const [side, label] of [['n', 'NORTH wall'], ['s', 'SOUTH wall'], ['w', 'WEST wall'], ['e', 'EAST wall']] as const) {
    const px = side === 'n' || side === 's' ? X(r.w / 2) : side === 'w' ? X(0) - 12 : X(r.w) + 12, py = side === 'n' ? Y(0) - 8 : side === 's' ? Y(r.h) + 22 : Y(r.h / 2);
    out.push(`<text x="${px}" y="${py}" text-anchor="${side === 'w' ? 'end' : side === 'e' ? 'start' : 'middle'}" fill="#5f7ca6" font-size="11" ${side === 'w' || side === 'e' ? `transform="rotate(${side === 'w' ? -90 : 90} ${px} ${py})" text-anchor="middle"` : ''}>${label}</text>`);
  }
  for (const d of r.doors) {
    const [a, b] = d.cells, lx = Math.min(a.x, b.x) - r.x0, ly = Math.min(a.y, b.y) - r.y0, horiz = d.side === 'n' || d.side === 's';
    const di = doorInfo(d, s.passes), lk = di.status !== 'open', nb = { code: ROOM_BY_ID[d.toward as RoomId]?.code ?? '', name: nodeName(d.toward) }, dc = DOOR_STYLE[di.status].colour;
    const x = X(lx) - (d.side === 'w' ? 7 : 0) + (d.side === 'e' ? 0 : 0), y = Y(ly) - (d.side === 'n' ? 7 : 0);
    out.push(`<g aria-label="Door to ${esc(nb.name)}: ${DOOR_STYLE[di.status].word}. ${esc(di.reason)}"><rect x="${horiz ? X(lx) : d.side === 'w' ? X(0) - 8 : X(r.w) - 2}" y="${horiz ? (d.side === 'n' ? Y(0) - 8 : Y(r.h) - 2) : Y(ly)}" width="${horiz ? CELL * 2 : 10}" height="${horiz ? 10 : CELL * 2}" fill="${dc}" stroke="#0B1424" stroke-width="1.5"/>${lk ? `<rect x="${horiz ? X(lx) : d.side === 'w' ? X(0) - 8 : X(r.w) - 2}" y="${horiz ? (d.side === 'n' ? Y(0) - 8 : Y(r.h) - 2) : Y(ly)}" width="${horiz ? CELL * 2 : 10}" height="${horiz ? 10 : CELL * 2}" fill="url(#lockHatch)"/>` : ''}
      <text x="${horiz ? X(lx) + CELL : d.side === 'w' ? X(0) - 18 : X(r.w) + 18}" y="${horiz ? (d.side === 'n' ? Y(0) - 18 : Y(r.h) + 34) : Y(ly) + CELL + 4}" text-anchor="${d.side === 'w' ? 'end' : horiz ? 'middle' : 'start'}" fill="${dc}" font-size="12" font-weight="700">${DOOR_STYLE[di.status].glyph} ${di.status === 'open' ? '' : DOOR_STYLE[di.status].word + ' '}→ ${esc(nb.code)} ${esc(nb.name.length > 16 ? nb.name.slice(0, 15) + '…' : nb.name)}</text></g>`);
    const rc = d.readerCell; out.push(`<g aria-label="Access reader for ${esc(nb.name)} door"><circle cx="${X(rc.x - r.x0) + CELL / 2}" cy="${Y(rc.y - r.y0) + CELL / 2}" r="9" fill="#37D7D0" stroke="#0B1424" stroke-width="2"/><text x="${X(rc.x - r.x0) + CELL / 2}" y="${Y(rc.y - r.y0) + CELL / 2 + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#0B1424">R</text></g>`);
  }
  // route ports on the walls (data connections: a notch with an arrow, never a door)
  const used: Record<string, number> = {};
  for (const p of g.ports) {
    const i = (used[p.side] = (used[p.side] ?? -1) + 1), horiz = p.side === 'n' || p.side === 's';
    const f = [0.12, 0.78, 0.02, 0.92][i % 4], along = f * r.w, x = horiz ? X(along) : p.side === 'w' ? X(0) : X(r.w), y = horiz ? (p.side === 'n' ? Y(0) : Y(r.h)) : Y(f * r.h);
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
