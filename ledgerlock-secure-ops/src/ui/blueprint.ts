import { PALETTE } from '../game/constants';
import type { GameState } from '../game/systems/GameState';
import type { MissionRunner } from '../game/systems/MissionRunner';
import type { SceneApi } from '../game/sceneApi';
import type { RoomId, RouteDef, RouteType, Tone } from '../game/types';
import { measuresOf, overallConfidence } from '../game/systems/Confidence';
import { settings } from '../game/systems/Settings';
import { DIAGRAMS, EQUIPMENT_BY_ID, GRAPH_ROOMS, GRAPH_ROOM_BY_ID, incidentLink, nodeOf, type DiagramView, type IncidentLink } from '../data/facilityGraph';
import { ROOM_BY_ID } from '../data/map';
import { PASSES } from '../data/passes';
import { ROUTE_BY_ID, ROUTES, STATE_LABEL } from '../data/routes';
import { TOOL_BY_ID } from '../data/tools';
import { describeTarget } from '../data/targets';
import { $, $$, esc } from './dom';
import { dashFor, diagramSvg, nodeLabel, overviewBox, overviewSvg, roomLocked, roomSvg, routeColour, stateOf } from './blueprintSvg';

type Tab = 'overview' | 'systems' | 'room' | 'incident';
export interface BlueprintHost {
  state: GameState; runner: MissionRunner; scene: SceneApi;
  toast(html: string, tone?: Tone): void;
  pause(): void; resume(): void;
  /** Opens the Incident Board (kanban and puzzles), when available. */
  openBoard?: () => void;
}
const TYPE_LABEL: Record<RouteType, string> = { request: 'API and requests', outbound_payment: 'Outbound payments', return: 'Bank responses', settlement: 'Settlements and receipts', debt_export: 'Debt exports', agency_return: 'Agency receipts', analytics: 'Fabric analytics', event: 'Events' };
const SEV: Record<string, string> = { Low: 'good', Medium: 'warn', High: 'bad', Critical: 'bad' };

/** Facility Map and Systems Blueprint: a full-screen, keyboard- and touch-friendly view generated from the facility graph. */
export class BlueprintView {
  private box: HTMLElement | null = null;
  isOpen = false;
  private tab: Tab = 'overview';
  private mode: 'iso' | 'top' = 'iso';
  private showRoutes = true;
  private selRoom: RoomId | null = null;
  private selRoute: string | null = null;
  private selNode: string | null = null;
  private selProp: string | null = null;
  private diagram: DiagramView['id'] = 'finance';
  private types = new Set<string>(ROUTES.map((r) => r.type));
  private status = 'all';
  private onlyIncident = false;
  private room: RoomId = 'secure_ops';
  private incView: 'map' | 'diagram' = 'map';
  private vb: Record<string, { x: number; y: number; w: number; h: number }> = {};
  private waypoint: { x: number; y: number } | null = null;

  constructor(private root: HTMLElement, private host: BlueprintHost) {}

  // ---------------------------------------------------------------- open / close ----
  open(tab: Tab = 'overview', sel: { room?: RoomId; route?: string } = {}): void {
    this.tab = tab;
    if (sel.room) { this.selRoom = sel.room; this.room = sel.room; }
    if (sel.route) this.selRoute = sel.route;
    if (!this.isOpen) {
      this.isOpen = true; this.host.pause();
      this.box = document.createElement('div'); this.box.id = 'blueprint'; this.box.className = 'bp';
      this.box.addEventListener('click', (e) => this.onClick(e));
      this.box.addEventListener('keydown', (e) => this.onKey(e));
      this.root.appendChild(this.box);
      this.bindPan();
    }
    if (!this.selRoom) this.selRoom = this.host.state.player.room ?? 'secure_ops';
    this.room = this.selRoom ?? this.room;
    this.render();
  }
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false; this.box?.remove(); this.box = null; this.host.resume();
  }
  toggle(): void { this.isOpen ? this.close() : this.open(); }

  // ---------------------------------------------------------------- helpers ----
  private get s() { return this.host.state; }
  private link(): IncidentLink {
    const live = ROUTES.filter((r) => { const st = stateOf(this.s, r.id); return st !== 'healthy' && st !== 'restored'; }).map((r) => r.id);
    return incidentLink(this.s.mission, live);
  }
  private evidenceAt(room: RoomId): Record<string, { name: string; got: boolean }> {
    const out: Record<string, { name: string; got: boolean }> = {};
    for (const e of this.link().evidence) if (e.at && e.room === room) out[e.at] = { name: e.name, got: this.s.evidence.has(e.id) };
    return out;
  }
  private focusKey = '';
  private setBox(k: string, w: number, h: number, def: { x: number; y: number; w: number; h: number }) { if (!this.vb[k]) this.vb[k] = def; void w; void h; return this.vb[k]; }

  // ---------------------------------------------------------------- render ----
  private render(): void {
    if (!this.box) return;
    const s = this.s, m = s.mission, conf = overallConfidence(measuresOf(s)), lk = this.link();
    const tabs: [Tab, string][] = [['overview', 'Facility map'], ['systems', 'System diagrams'], ['room', 'Room blueprint'], ['incident', 'Incident location']];
    let main = '', side = '';
    if (this.tab === 'overview') { main = this.overviewMain(); side = this.roomPanel(this.selRoom); }
    else if (this.tab === 'systems') { main = this.systemsMain(); side = this.routeOrNodePanel(); }
    else if (this.tab === 'room') { main = this.roomMain(); side = this.propPanel(); }
    else { main = this.incidentMain(); side = this.incidentPanel(lk); }
    this.box.innerHTML = `<div class="bp-head"><h2>Facility Map &amp; Systems Blueprint</h2>
      <div class="bp-stats" aria-label="Shift status"><span class="sh">Shift: <b>${esc(m.title)}</b> · ${esc(s.fmtClock())}</span><span>Service Confidence <b>${conf}%</b></span><span>Active incidents <b>${s.incidents}</b></span></div>
      <div class="bp-head-btns"><button data-a="player" title="Close and put the camera back on you">⌖ Return to player</button><button data-a="close" class="primary" aria-label="Close the map">Close ✕</button></div></div>
      <div class="bp-tabs" role="tablist" aria-label="Views">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${this.tab === t}" data-tab="${t}">${l}</button>`).join('')}</div>
      <div class="bp-body"><section class="bp-main" aria-label="Map area">${main}</section><aside class="bp-side" aria-label="Details">${side}</aside></div>
      <div class="bp-foot">${this.legend()}<div class="bp-log" aria-label="Recent activity"><b>Recent activity</b>${s.logEntries.slice(-4).reverse().map((l) => `<div class="${l.tone}"><time>${esc(l.t)}</time> ${esc(l.text)}</div>`).join('') || '<div>Nothing yet.</div>'}</div></div>`;
    this.bindZoom();
    if (this.focusKey) { ($(this.box, this.focusKey) as HTMLElement | null)?.focus(); }
  }

  private toolbar(extra = ''): string {
    return `<div class="bp-tools" role="toolbar" aria-label="Map controls">${extra}
      <span class="grp"><button data-a="zoomin" aria-label="Zoom in">+</button><button data-a="zoomout" aria-label="Zoom out">−</button><button data-a="zoomreset">Fit</button><button data-a="centre">Centre on me</button></span></div>`;
  }

  private overviewMain(): string {
    const svg = overviewSvg(this.s, { mode: this.mode, selRoom: this.selRoom, selRoute: this.selRoute, showRoutes: this.showRoutes, incident: this.link(), waypoint: this.waypoint });
    return `${this.toolbar(`<span class="grp" role="group" aria-label="Map style"><button data-a="mode-iso" aria-pressed="${this.mode === 'iso'}">Isometric plan</button><button data-a="mode-top" aria-pressed="${this.mode === 'top'}">Top-down schematic</button></span>
      <button data-a="routes" aria-pressed="${this.showRoutes}">Show data routes</button><button data-a="to-systems">Open system diagram</button>`)}
      <div class="bp-canvas" data-vbkey="ov-${this.mode}">${svg}</div>
      <p class="bp-hint">Select a room (click, tap, or Tab then Enter; arrow keys move between rooms). Selecting never moves you: use <b>Set waypoint</b> to walk there.</p>`;
  }

  private systemsMain(): string {
    const view = DIAGRAMS.find((d) => d.id === this.diagram)!, lk = this.link();
    const present = [...new Set(view.routeIds.map((id) => ROUTE_BY_ID[id].type))];
    const d = diagramSvg(this.s, { view, types: this.types, status: this.status, onlyIncident: this.onlyIncident, selRoute: this.selRoute, selNode: this.selNode, incident: lk, reduced: settings.data.reducedMotion });
    return `<div class="bp-split rows"><nav class="bp-nav" aria-label="Diagrams">${DIAGRAMS.map((v) => `<button data-diagram="${v.id}" aria-pressed="${v.id === this.diagram}">${esc(v.label)}</button>`).join('')}</nav>
      <div class="bp-colmain"><div class="bp-tools" role="group" aria-label="Filters"><b>${esc(view.title)}</b>
        ${present.map((t) => `<label class="chk"><input type="checkbox" data-type="${t}" ${this.types.has(t) ? 'checked' : ''}> ${TYPE_LABEL[t as RouteType]}</label>`).join('')}
        <label class="chk">Status <select data-status aria-label="Filter by status"><option value="all">All</option>${Object.keys(STATE_LABEL).map((k) => `<option value="${k}" ${this.status === k ? 'selected' : ''}>${STATE_LABEL[k as keyof typeof STATE_LABEL].label}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" data-onlyinc ${this.onlyIncident ? 'checked' : ''}> Incident routes only</label>
        <span class="grp"><button data-a="zoomin" aria-label="Zoom in">+</button><button data-a="zoomout" aria-label="Zoom out">−</button><button data-a="zoomreset">Fit</button></span></div>
        <div class="bp-canvas" data-vbkey="dg-${view.id}">${d.svg}</div><p class="bp-hint">${esc(view.note)}${d.shown.length ? '' : ' <b>No routes match the filters.</b>'}</p></div></div>`;
  }

  private roomMain(): string {
    const r = GRAPH_ROOM_BY_ID[this.room];
    return `<div class="bp-split"><nav class="bp-nav" aria-label="Rooms">${GRAPH_ROOMS.map((x) => `<button data-room-pick="${x.id}" aria-pressed="${x.id === this.room}">${esc(x.code)} ${esc(x.name.replace('Accounts Receivable and Debt Recovery', 'AR & Debt Recovery'))}${roomLocked(this.s, x.id) ? ' \u{1F512}' : ''}</button>`).join('')}</nav>
      <div class="bp-colmain"><div class="bp-tools"><b>${esc(r.code)} · ${esc(r.name)}</b><span class="grp"><button data-a="zoomin" aria-label="Zoom in">+</button><button data-a="zoomout" aria-label="Zoom out">−</button><button data-a="zoomreset">Fit</button></span></div>
      <div class="bp-canvas" data-vbkey="rm-${r.id}">${roomSvg(this.s, { room: this.room, sel: this.selProp, incident: this.link(), evidenceAt: this.evidenceAt(this.room) })}</div>
      <p class="bp-hint">Numbered pins are the room's equipment, in the same positions as in the game. ⬦ marks where evidence is retrieved. Green = open door, amber hatched = locked, “R” = access reader, ringed circles = data-route ports (not doors).</p></div></div>`;
  }

  private incidentMain(): string {
    const lk = this.link(), s = this.s, m = s.mission;
    const toggle = `<span class="grp" role="group" aria-label="Show incident on"><button data-a="inc-map" aria-pressed="${this.incView === 'map'}">Show on facility map</button><button data-a="inc-diagram" aria-pressed="${this.incView === 'diagram'}">Show on system diagram</button></span>`;
    if (this.incView === 'map') {
      const svg = overviewSvg(s, { mode: this.mode, selRoom: lk.sourceRoom, selRoute: lk.routeIds[0] ?? null, showRoutes: true, incident: lk, waypoint: this.waypoint });
      return `${this.toolbar(`${toggle}<button data-a="mode-iso" aria-pressed="${this.mode === 'iso'}">Isometric</button><button data-a="mode-top" aria-pressed="${this.mode === 'top'}">Top-down</button>`)}<div class="bp-canvas" data-vbkey="in-${this.mode}">${svg}</div><p class="bp-hint">${esc(m.alert.headline)}</p>`;
    }
    const view = DIAGRAMS.find((d) => d.routeIds.some((r) => lk.routeIds.includes(r)) && d.id !== 'access') ?? DIAGRAMS[3];
    const d = diagramSvg(s, { view, types: new Set(ROUTES.map((r) => r.type)), status: 'all', onlyIncident: false, selRoute: lk.routeIds[0] ?? null, selNode: lk.sourceRoom, incident: lk, reduced: settings.data.reducedMotion });
    return `${this.toolbar(toggle)}<div class="bp-canvas" data-vbkey="id-${view.id}">${d.svg}</div><p class="bp-hint">${esc(view.title)}: the incident is marked ⚠, evidence sources ⌕.</p>`;
  }

  // ---------------------------------------------------------------- side panels ----
  private chips(st: string) { const l = STATE_LABEL[st as keyof typeof STATE_LABEL]; return `<span class="chip ${st === 'healthy' || st === 'restored' ? 'good' : st === 'quarantined' ? 'bad' : 'warn'}">${l.icon} ${l.label}</span>`; }

  private roomPanel(id: RoomId | null): string {
    if (!id) return '<h3>Select a room</h3><p>Choose a room on the map to see its access, doors, systems and equipment.</p>';
    const s = this.s, r = GRAPH_ROOM_BY_ID[id], rd = ROOM_BY_ID[id], lk = roomLocked(s, id), inc = this.link();
    const routes = r.routeIds.map((x) => ROUTE_BY_ID[x]);
    const ev = inc.evidence.filter((e) => e.room === id);
    const status = rd.props.map((p) => s.status[p.id]).filter(Boolean) as string[];
    const worst = status.includes('bad') ? 'Unsafe state found' : status.includes('suspect') ? 'Something suspicious here' : status.length ? 'Checked: looks fine' : 'Not checked yet';
    const clues = [...s.clues.values()].slice(-1)[0];
    return `<h3>${esc(r.code)} · ${esc(r.name)}</h3><div class="row"><span class="chip ${lk ? 'warn' : 'good'}">${lk ? '\u{1F512} Locked for you' : '✓ Open'}</span>${inc.sourceRoom === id ? '<span class="chip bad">⚠ Incident source</span>' : ''}<span class="chip">${esc(worst)}</span></div>
      <p>${esc(rd.blurb)}</p>
      <dl><dt>Location</dt><dd>Column ${'ABCD'[r.col]}, row ${r.row + 1} (grid ${r.x0},${r.y0})</dd><dt>Access pass</dt><dd>${esc(r.passName)} ${lk ? '(not held)' : '(held)'}<br><small>${esc(PASSES[rd.requiredPass].scope)}</small></dd>
      <dt>Doors</dt><dd>${r.doors.map((d) => { const l2 = roomLocked(s, d.toward); return `${d.side.toUpperCase()} → ${esc(GRAPH_ROOM_BY_ID[d.toward].code)} ${l2 ? '\u{1F512} locked' : '✓ open'}`; }).join('<br>')}</dd>
      <dt>Connected systems</dt><dd>${routes.map((x) => `<button class="link" data-goroute="${x.id}">${esc(x.name)}</button> ${this.chips(stateOf(s, x.id))}`).join('<br>') || 'None'}</dd>
      <dt>Evidence here</dt><dd>${ev.length ? ev.map((e) => `${s.evidence.has(e.id) ? '✓' : '○'} ${esc(e.name)}`).join('<br>') : 'None'}</dd>
      <dt>Latest clue</dt><dd>${clues ? esc(clues.label) : 'No clues yet'}</dd></dl>
      <div class="row"><button class="primary" data-a="waypoint" data-target="room:${id}" ${'' /* always reachable: locked rooms walk to the corridor outside */}>Set waypoint</button><button data-a="roomview" data-room="${id}">Room blueprint</button><button data-a="flash" data-target="room:${id}">Show in the game</button></div>
      <p class="small">${lk ? 'This room is locked for you, so the waypoint is the corridor outside its door. Door readers show how to request the pass. A locked room never blocks the corridors.' : 'Setting a waypoint walks you there. It never teleports you.'}</p>`;
  }

  private routeOrNodePanel(): string {
    if (this.selRoute) return this.routePanel(ROUTE_BY_ID[this.selRoute]);
    if (this.selNode) return this.nodePanel(this.selNode);
    const lk = this.link();
    return `<h3>Select a system or a connection</h3><p>Click, tap or Tab to a box or an arrow. The inspector shows its source, destination, status and the incident it is part of.</p>${lk.routeIds.length ? `<p><b>Incident routes:</b> ${lk.routeIds.map((id) => `<button class="link" data-goroute="${id}">${esc(ROUTE_BY_ID[id].name)}</button>`).join(', ')}</p>` : ''}`;
  }

  private endpointRoom(id: string, route: RouteDef): RoomId | null {
    const n = nodeOf(id);
    if (n.room) return n.room;
    const i = route.hops.indexOf(id), nb = [route.hops[i - 1], route.hops[i + 1]].find((h) => h && ROOM_BY_ID[h as RoomId]);
    return (nb as RoomId) ?? null;
  }
  private routePanel(r: RouteDef): string {
    const s = this.s, st = stateOf(s, r.id), a = r.hops[0], b = r.hops[r.hops.length - 1], lk = this.link();
    const last = [...s.logEntries].reverse().find((l) => l.text.toLowerCase().includes(r.name.toLowerCase()));
    const wp = (id: string) => { const rm = this.endpointRoom(id, r); return rm ? `<button data-a="waypoint" data-target="room:${rm}">Waypoint to ${esc(nodeLabel(id))}${nodeOf(id).kind === 'external' ? ` (via ${esc(ROOM_BY_ID[rm].name)})` : ''}</button>` : ''; };
    return `<h3>${esc(r.name)}</h3><div class="row">${this.chips(st)}<span class="chip">${esc(TYPE_LABEL[r.type])}</span>${lk.routeIds.includes(r.id) ? '<span class="chip bad">⚠ In this incident</span>' : ''}</div>
      <p>${esc(r.desc)}</p><dl><dt>Source</dt><dd>${esc(nodeLabel(a))}</dd><dt>Destination</dt><dd>${esc(nodeLabel(b))}</dd><dt>Path</dt><dd>${r.hops.map((h) => esc(nodeLabel(h))).join(' → ')}</dd>
      <dt>Owner</dt><dd>${esc(r.owner)}</dd><dt>If disrupted</dt><dd>${esc(r.impact)}</dd><dt>Last simulated event</dt><dd>${last ? `${esc(last.t)} ${esc(last.text)}` : 'Nothing logged on this route yet.'}</dd>
      <dt>Relevant incident</dt><dd>${lk.routeIds.includes(r.id) ? esc(s.mission.alert.headline) : 'None right now'}</dd></dl>
      <div class="row">${wp(a)}${wp(b)}<button data-a="flashroute" data-route="${r.id}">Show in the game</button></div>
      <p class="small">A data route is a flow of information or money. It is not a corridor or a door and never blocks your movement.</p>`;
  }
  private nodePanel(id: string): string {
    const n = nodeOf(id);
    if (n.kind === 'room' && n.room) return this.roomPanel(n.room);
    const routes = ROUTES.filter((r) => r.hops.includes(id));
    const room = n.room ?? (routes[0] ? this.endpointRoom(id, routes[0]) : null);
    return `<h3>${esc(n.label)}</h3><p>${n.kind === 'external' ? 'A simulated external service. The game never sends anything real.' : 'A processing stage in the Fabric lineage (synthetic data).'}</p>
      <dl><dt>Routes</dt><dd>${routes.map((r) => `<button class="link" data-goroute="${r.id}">${esc(r.name)}</button> ${this.chips(stateOf(this.s, r.id))}`).join('<br>')}</dd></dl>
      ${room ? `<div class="row"><button data-a="waypoint" data-target="room:${room}">Waypoint to ${esc(ROOM_BY_ID[room].name)}</button></div>` : ''}`;
  }

  private propPanel(): string {
    const id = this.selProp, rd = ROOM_BY_ID[this.room];
    if (!id) return `<h3>${esc(rd.name)}</h3><p>Select a pin to see what it does, its status, the pass it needs and how to use it.</p><div class="row"><button class="primary" data-a="back-room" data-room="${this.room}">Return to room</button><button data-a="waypoint" data-target="room:${this.room}">Set waypoint</button></div>`;
    const t = describeTarget(id)!, eq = EQUIPMENT_BY_ID[id], st = this.s.status[id], m = this.s.mission;
    const tools = m.rules.filter((r) => (typeof r.target === 'function' ? r.target(id) : Array.isArray(r.target) ? r.target.includes(id) : r.target === id)).map((r) => TOOL_BY_ID[r.tool].name);
    const hasInter = !!m.interactions?.[id];
    const evid = this.link().evidence.find((e) => e.at === id);
    return `<h3>${esc(eq?.label ?? t.name)}</h3><div class="row"><span class="chip ${st === 'bad' ? 'bad' : st === 'suspect' ? 'warn' : st ? 'good' : ''}">${st ? { suspect: '⚠ Suspicious', bad: '✕ Unsafe', ok: '✓ Checked: fine', fixed: '✓ Fixed' }[st] : 'Not checked yet'}</span>${evid ? `<span class="chip ${this.s.evidence.has(evid.id) ? 'good' : 'warn'}">${this.s.evidence.has(evid.id) ? '✓' : '⌕'} Evidence: ${esc(evid.name)}</span>` : ''}</div>
      <p>${esc(t.desc)}</p><dl><dt>Access</dt><dd>${esc(PASSES[rd.requiredPass].name)} ${roomLocked(this.s, this.room) ? '(not held)' : '(held)'}</dd>
      <dt>Location</dt><dd>${eq ? eq.wanted.map((w) => w).join(' + ') + ' of the room' : 'In the room'} (cell ${eq?.local.x ?? t.prop!.gx - rd.x0}, ${eq?.local.y ?? t.prop!.gy - rd.y0})</dd>
      <dt>Interaction</dt><dd>${hasInter ? 'Stand next to it and press <kbd>E</kbd>.' : ''}${tools.length ? ` Tools that work here: ${tools.map(esc).join(', ')}.` : ''}${!hasInter && !tools.length ? 'Press <kbd>E</kbd> next to it to read its status.' : ''}</dd></dl>
      <div class="row"><button class="primary" data-a="flash" data-target="${id}">Show in the game</button><button data-a="waypoint" data-target="${id}">Set waypoint</button><button data-a="back-room" data-room="${this.room}">Return to room</button></div>`;
  }

  private incidentPanel(lk: IncidentLink): string {
    const s = this.s, m = s.mission, prim = m.goals.filter((g) => g.kind === 'primary'), done = prim.filter((g) => g.done(s)).length;
    const status = s.complete ? 'Closed' : done === 0 ? (s.evidence.size ? 'Investigating' : 'New') : done < prim.length ? 'In progress' : 'Verifying';
    const sug = this.host.scene.team.suggestion(this.host.scene.team.you);
    const blocked = Object.entries(s.routeStates).filter(([, v]) => v === 'quarantined' || v === 'rerouted').map(([k, v]) => `${esc(ROUTE_BY_ID[k]?.name ?? k)} (${STATE_LABEL[v].label})`);
    return `<h3>${esc(m.alert.headline)}</h3><div class="row"><span class="chip ${SEV[m.alert.severity] ?? 'warn'}">${esc(m.alert.severity)} severity</span><span class="chip">${esc(status)}</span><span class="chip">${done}/${prim.length} primary objectives</span></div>
      <dl><dt>Source room</dt><dd><button class="link" data-goroom="${lk.sourceRoom}">${esc(GRAPH_ROOM_BY_ID[lk.sourceRoom].code)} ${esc(GRAPH_ROOM_BY_ID[lk.sourceRoom].name)}</button></dd>
      <dt>Affected routes</dt><dd>${lk.routeIds.map((id) => `<button class="link" data-goroute="${id}">${esc(ROUTE_BY_ID[id].name)}</button> ${this.chips(stateOf(s, id))}`).join('<br>') || 'None marked yet'}</dd>
      <dt>Blocked or quarantined</dt><dd>${blocked.join('<br>') || 'Nothing is held right now'}</dd>
      <dt>Evidence sources</dt><dd>${lk.evidence.map((e) => `${s.evidence.has(e.id) ? '✓' : '○'} ${esc(e.name)} <small>(${esc(GRAPH_ROOM_BY_ID[e.room].code)}${e.at ? '' : ''})</small>${e.at ? ` <button class="link" data-a="waypoint" data-target="${e.at}">waypoint</button>` : ''}`).join('<br>')}</dd>
      <dt>Next suggested step</dt><dd>${sug ? `${esc(sug.label)} ${sug.target ? `<button class="link" data-a="waypoint" data-target="${sug.target}">waypoint</button>` : ''}` : s.complete ? 'Incident closed.' : 'Nothing is ready yet: follow the clues or request the next pass.'}</dd></dl>
      <div class="row">${this.host.openBoard ? '<button class="primary" data-a="board">Open the Incident Board</button>' : ''}<button data-a="flash" data-target="room:${lk.sourceRoom}">Show in the game</button></div>`;
  }

  private legend(): string {
    const types = [...new Set(ROUTES.map((r) => r.type))];
    const sw = (r: RouteDef, st: string) => `<svg width="46" height="10" aria-hidden="true"><line x1="0" y1="5" x2="46" y2="5" stroke="${routeColour(r)}" stroke-width="3" ${dashFor(r, st as never) ? `stroke-dasharray="${dashFor(r, st as never)}"` : ''}/></svg>`;
    const sample = (t: RouteType) => ROUTES.find((r) => r.type === t && !r.dashed) ?? ROUTES.find((r) => r.type === t)!;
    return `<details class="bp-legend" aria-label="Legend" ${window.innerWidth > 900 ? 'open' : ''}><summary><b>Legend</b></summary>
      <div class="lg">${types.map((t) => `<span>${sw(sample(t), 'healthy')} ${TYPE_LABEL[t]}</span>`).join('')}</div>
      <div class="lg"><span><svg width="46" height="10" aria-hidden="true"><line x1="0" y1="5" x2="46" y2="5" stroke="#F3F6FA" stroke-width="3"/></svg> solid = active</span><span><svg width="46" height="10" aria-hidden="true"><line x1="0" y1="5" x2="46" y2="5" stroke="#F3F6FA" stroke-width="3" stroke-dasharray="9 5"/></svg> dashed = simulated / returning</span><span><svg width="46" height="10" aria-hidden="true"><line x1="0" y1="5" x2="46" y2="5" stroke="#FF7183" stroke-width="3" stroke-dasharray="1 7"/></svg> dotted + \u{1F512} = isolated</span><span>→ arrow = direction</span>
      <span>${Object.values(STATE_LABEL).map((l) => `${l.icon} ${l.label}`).join(' · ')}</span><span><i class="sq" style="background:#9DE3B1"></i> open door <i class="sq hatch"></i> locked door · grey = corridor (walkable) · amber ⚠ = warning · coral = unsafe</span></div></div>`;
  }

  // ---------------------------------------------------------------- interaction ----
  private act(target: HTMLElement): void {
    const d = target.dataset, a = d.a;
    if (d.tab) { this.tab = d.tab as Tab; this.vb = {}; return this.render(); }
    if (d.diagram) { this.diagram = d.diagram as DiagramView['id']; this.selRoute = null; this.selNode = null; return this.render(); }
    if (d.roomPick) { this.room = d.roomPick as RoomId; this.selProp = null; return this.render(); }
    if (d.goroute) { this.selRoute = d.goroute; this.selNode = null; if (this.tab === 'overview' || this.tab === 'incident') { this.tab = 'systems'; const v = DIAGRAMS.find((x) => x.id !== 'access' && x.routeIds.includes(d.goroute!)); if (v) this.diagram = v.id; } this.host.scene.selectTarget('route:' + d.goroute); return this.render(); }
    if (d.goroom) { this.selRoom = d.goroom as RoomId; this.tab = 'overview'; return this.render(); }
    switch (a) {
      case 'close': return this.close();
      case 'player': this.close(); this.host.scene.returnToPlayer(); return;
      case 'mode-iso': case 'mode-top': this.mode = a === 'mode-iso' ? 'iso' : 'top'; return this.render();
      case 'routes': this.showRoutes = !this.showRoutes; return this.render();
      case 'to-systems': this.tab = 'systems'; return this.render();
      case 'inc-map': case 'inc-diagram': this.incView = a === 'inc-map' ? 'map' : 'diagram'; return this.render();
      case 'zoomin': case 'zoomout': case 'zoomreset': case 'centre': return this.zoom(a);
      case 'roomview': this.room = d.room as RoomId; this.selProp = null; this.tab = 'room'; return this.render();
      case 'flash': { const t = d.target!; this.host.scene.flashTargets([t], 7000); this.host.scene.selectTarget(t); this.host.toast('Highlighted in the game. Close this view to see it.', 'info'); return; }
      case 'flashroute': { const r = ROUTE_BY_ID[d.route!]; this.host.scene.selectTarget('route:' + r.id); this.host.scene.flashTargets(r.hops.filter((h) => ROOM_BY_ID[h as RoomId]).map((h) => 'room:' + h), 7000); this.host.toast('Route and both endpoints highlighted in the game.', 'info'); return; }
      case 'waypoint': {
        const r = this.host.scene.setWaypoint(d.target!);
        if (!r.ok) { this.host.toast(esc(r.note), 'warn'); return; }
        this.close(); this.host.toast(esc(r.note), 'good'); return;
      }
      case 'back-room': { this.close(); this.host.scene.flashTargets([`room:${d.room}`], 6000); this.host.scene.focusOn(`room:${d.room}`); setTimeout(() => this.host.scene.returnToPlayer(), 3500); return; }
      case 'board': this.close(); this.host.openBoard?.(); return;
    }
  }
  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const g = t.closest<HTMLElement>('[data-room],[data-route],[data-node],[data-prop]');
    if (g && !t.closest('button,input,select') && !g.closest('.bp-side')) {
      if (g.dataset.room) { this.selRoom = g.dataset.room as RoomId; this.selRoute = null; this.focusKey = `[data-room="${g.dataset.room}"]`; }
      else if (g.dataset.route) { this.selRoute = g.dataset.route; this.selNode = null; this.host.scene.selectTarget('route:' + g.dataset.route); this.focusKey = `[data-route="${g.dataset.route}"]`; }
      else if (g.dataset.node) { this.selNode = g.dataset.node; this.selRoute = null; this.focusKey = `[data-node="${CSS.escape(g.dataset.node)}"]`; }
      else if (g.dataset.prop) { this.selProp = g.dataset.prop; this.focusKey = `[data-prop="${g.dataset.prop}"]`; }
      return this.render();
    }
    const b = t.closest<HTMLElement>('button');
    if (b && this.box?.contains(b)) { this.focusKey = ''; this.act(b); }
  }
  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return this.close(); }
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('g[tabindex]')) { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (t.matches('g[data-room]') && e.key.startsWith('Arrow')) {
      const cur = GRAPH_ROOM_BY_ID[t.dataset.room as RoomId], dc = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dr = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      const nxt = GRAPH_ROOMS.find((r) => r.col === cur.col + dc && r.row === cur.row + dr);
      if (nxt) { e.preventDefault(); ($(this.box!, `[data-room="${nxt.id}"]`) as HTMLElement | null)?.focus(); }
    }
    if (e.key === 'Tab') { /* default order: tabs, canvas, side panel, footer */ }
    e.stopPropagation();                                                         // keep game hotkeys (WASD, T, G...) out of the overlay
  }
  /** change{select,checkbox} handlers */
  private bindZoom(): void {
    const box = this.box!;
    $$(box, 'input[data-type]').forEach((i) => i.addEventListener('change', () => { const t = (i as HTMLInputElement).dataset.type!; (i as HTMLInputElement).checked ? this.types.add(t) : this.types.delete(t); this.render(); }));
    $$(box, 'select[data-status]').forEach((i) => i.addEventListener('change', () => { this.status = (i as HTMLSelectElement).value; this.render(); }));
    $$(box, 'input[data-onlyinc]').forEach((i) => i.addEventListener('change', () => { this.onlyIncident = (i as HTMLInputElement).checked; this.render(); }));
    const cv = $(box, '.bp-canvas'), svg = cv?.querySelector('svg');
    if (cv && svg) { const k = cv.dataset.vbkey!, v = this.vb[k]; if (v) svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
  }
  private curSvg(): { svg: SVGSVGElement; key: string } | null {
    const cv = $(this.box!, '.bp-canvas'), svg = cv?.querySelector('svg') as SVGSVGElement | null;
    return cv && svg ? { svg, key: cv.dataset.vbkey! } : null;
  }
  private zoom(a: string): void {
    const c = this.curSvg(); if (!c) return;
    const vb = c.svg.viewBox.baseVal;
    if (a === 'zoomreset') { delete this.vb[c.key]; return this.render(); }
    if (a === 'centre') {
      const P = (this.mode === 'iso' || this.tab === 'overview' || this.tab === 'incident') ? null : null; void P;
      const sc = this.host.state.player, b = overviewBox(this.mode); const k = this.mode === 'iso' ? { x: ((sc.x - sc.y) * 48 * 0.62) / 2, y: ((sc.x + sc.y) * 24 * 0.62) / 2 } : { x: sc.x * 15, y: sc.y * 15 };
      const w = Math.min(b.w, vb.width * 0.5), h = w * (vb.height / vb.width);
      this.vb[c.key] = { x: k.x - w / 2, y: k.y - h / 2, w, h }; return this.render();
    }
    const f = a === 'zoomin' ? 0.8 : 1.25, w = vb.width * f, h = vb.height * f;
    this.vb[c.key] = { x: vb.x + (vb.width - w) / 2, y: vb.y + (vb.height - h) / 2, w, h };
    c.svg.setAttribute('viewBox', `${this.vb[c.key].x} ${this.vb[c.key].y} ${w} ${h}`);
  }
  private bindPan(): void {
    let drag: { x: number; y: number; vx: number; vy: number; key: string; svg: SVGSVGElement } | null = null;
    this.box!.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement; if (t.closest('[data-room],[data-route],[data-node],[data-prop],button')) return;
      const c = this.curSvg(); if (!c || !(t.closest('.bp-canvas'))) return;
      drag = { x: e.clientX, y: e.clientY, vx: c.svg.viewBox.baseVal.x, vy: c.svg.viewBox.baseVal.y, key: c.key, svg: c.svg };
    });
    this.box!.addEventListener('pointermove', (e) => {
      if (!drag) return; const r = drag.svg.getBoundingClientRect(), vb = drag.svg.viewBox.baseVal, k = vb.width / r.width;
      const nv = { x: drag.vx - (e.clientX - drag.x) * k, y: drag.vy - (e.clientY - drag.y) * k, w: vb.width, h: vb.height };
      drag.svg.setAttribute('viewBox', `${nv.x} ${nv.y} ${nv.w} ${nv.h}`); this.vb[drag.key] = nv;
    });
    const end = () => { drag = null; };
    this.box!.addEventListener('pointerup', end); this.box!.addEventListener('pointercancel', end);
  }
}
void PALETTE;
