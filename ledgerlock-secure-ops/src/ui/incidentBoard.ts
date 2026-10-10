import type { GameState } from '../game/systems/GameState';
import type { MissionRunner } from '../game/systems/MissionRunner';
import type { SceneApi } from '../game/sceneApi';
import type { Tone } from '../game/types';
import { IncidentBoard, type Feedback, type Guide } from '../game/systems/Incidents';
import { settings } from '../game/systems/Settings';
import { sfx } from '../game/systems/Sfx';
import { ROOM_BY_ID } from '../data/map';
import { PASSES } from '../data/passes';
import { ROUTE_BY_ID, STATE_LABEL } from '../data/routes';
import { describeTarget } from '../data/targets';
import { KANBAN, KANBAN_RANK, type IncidentDef, type KanbanStatus, type Piece, type Shape } from '../data/incidents/types';
import { measuresOf, overallConfidence } from '../game/systems/Confidence';
import { $, $$, esc } from './dom';
import { enableDrag } from './dragkit';

export interface BoardHost {
  state: GameState; runner: MissionRunner; scene: SceneApi;
  toast(html: string, tone?: Tone): void;
  pause(): void; resume(): void;
  /** Opens the Facility Map and Systems Blueprint on the incident. */
  openMap?: () => void;
  openDialog?: (spec: import('../game/types').DialogSpec) => void;
}

const SHAPE: Record<Shape, string> = {
  circle: '<circle cx="12" cy="12" r="9"/>', square: '<rect x="3" y="3" width="18" height="18" rx="2"/>', diamond: '<polygon points="12,2 22,12 12,22 2,12"/>',
  triangle: '<polygon points="12,3 22,21 2,21"/>', hex: '<polygon points="7,3 17,3 22,12 17,21 7,21 2,12"/>', pill: '<rect x="2" y="7" width="20" height="10" rx="5"/>',
};
const shapeSvg = (s: Shape) => `<svg class="shape" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor" stroke="#0b1424" stroke-width="1.5">${SHAPE[s]}</svg>`;
const SEV: Record<string, string> = { Low: 'good', Medium: 'warn', High: 'bad', Critical: 'bad' };

/** The Secure Ops Incident Board: a Kanban of every active incident, and for each one its evidence, a hands-on task and its objectives. */
export class IncidentBoardView {
  private box: HTMLElement | null = null;
  isOpen = false;
  private view: 'kanban' | 'incident' = 'kanban';
  private incId: string | null = null;
  /** Something "picked up" for the keyboard / tap alternative to dragging. */
  private picked: { kind: 'card' | 'piece' | 'port'; id: string; col?: KanbanStatus } | null = null;
  private msg: { id: string; fb: Feedback } | null = null;
  private note = '';
  private hl: string | null = null;
  private focusKey = '';
  private lastRefused: string | null = null;

  constructor(private root: HTMLElement, private host: BoardHost) {}
  private get s() { return this.host.state; }
  private get b() { return IncidentBoard.for(this.host.state, this.host.runner); }

  // ---------------------------------------------------------------- open / close ----
  open(incidentId?: string): void {
    if (!this.isOpen) {
      this.isOpen = true; this.host.pause();
      this.box = document.createElement('div'); this.box.id = 'iboard'; this.box.className = 'bp ib';
      this.box.addEventListener('click', (e) => this.onClick(e));
      this.box.addEventListener('keydown', (e) => this.onKey(e));
      this.box.addEventListener('change', (e) => this.onChange(e));
      this.root.appendChild(this.box);
      this.bindDrag();
    }
    if (incidentId && this.b.defs.some((d) => d.incidentId === incidentId)) { this.view = 'incident'; this.incId = incidentId; } else { this.view = 'kanban'; this.incId = null; }
    this.picked = null; this.msg = null; this.hl = null;
    this.render();
  }
  close(): void { if (!this.isOpen) return; this.isOpen = false; this.box?.remove(); this.box = null; this.host.resume(); }
  toggle(): void { this.isOpen ? this.close() : this.open(); }

  // ---------------------------------------------------------------- render ----
  private render(): void {
    if (!this.box) return;
    const s = this.s, m = s.mission, conf = overallConfidence(measuresOf(s));
    const defs = this.b.defs, d = this.incId ? defs.find((x) => x.incidentId === this.incId) : null;
    this.box.innerHTML = `<div class="bp-head"><h2>Secure Ops Incident Board</h2>
      <div class="bp-stats"><span class="sh">Shift: <b>${esc(m.title)}</b> · ${esc(s.fmtClock())}</span><span>${esc(m.deadlineLabel)}: <b>${Math.max(0, Math.round(s.deadlineLeft))} min</b> left</span><span>Service Confidence <b>${conf}%</b></span></div>
      <div class="bp-head-btns"><button data-a="player" title="Close and put the camera back on you">⌖ Return to player</button><button class="primary" data-a="close" aria-label="Close the board">Close ✕</button></div></div>
      ${d ? this.incidentHtml(d) : this.kanbanHtml()}
      <div class="sr-only" role="status" aria-live="polite" id="ib-live">${esc(this.note)}</div>`;
    this.note = '';
    if (this.focusKey) { ($(this.box, this.focusKey) as HTMLElement | null)?.focus(); }
    if (d) requestAnimationFrame(() => this.drawCables(d));
  }

  // ---------------------------------------------------------------- kanban ----
  private cardHtml(d: IncidentDef): string {
    const s = this.s, st = this.b.status(d), need = this.b.nextNeed(d), room = ROOM_BY_ID[d.sourceRoom], routes = d.affectedRouteIds.map((r) => ROUTE_BY_ID[r]);
    const picked = this.picked?.kind === 'card' && this.picked.id === d.incidentId;
    const bl = this.b.blockers(d)[0];
    const solved = this.b.isSolved(d);
    return `<article class="kcard sev-${(SEV[d.severity] ?? 'warn')}${picked ? ' picked' : ''}${this.lastRefused === d.incidentId ? ' refused' : ''}" data-card="${d.incidentId}" tabindex="0" aria-label="${esc(d.incidentId)} ${esc(d.title)}, ${esc(d.severity)} severity, in ${KANBAN.find((c) => c.id === st)!.label}. ${esc(need.text)}">
      <div class="kc-head"><button class="grip" data-grip="${d.incidentId}" aria-label="Drag ${esc(d.incidentId)} to another column" title="Drag to another column">⠿</button><b>${esc(d.incidentId)}</b><span class="chip ${SEV[d.severity] ?? 'warn'}">${esc(d.severity)}</span>${solved ? '<span class="chip good">✓ task done</span>' : ''}</div>
      <h4>${esc(d.title)}</h4>
      <div class="kc-meta"><span>\u{1F4CD} ${esc(room.code)} ${esc(room.name.replace('Accounts Receivable and Debt Recovery', 'AR & Debt Recovery'))}</span>${routes.map((r) => `<span>⤳ ${esc(r.name)} ${STATE_LABEL[s.routeStates[r.id] ?? 'healthy'].icon}</span>`).join('')}</div>
      <p class="kc-obj"><b>Key objective:</b> ${esc(d.keyObjective)}</p>
      <p class="kc-need ${need.text.startsWith('Ready') || need.next === null ? 'ok' : 'warn'}" title="${esc(need.text)}">${need.next === null ? '✓ Closed' : esc(need.text)}</p>
      ${!solved && bl && st !== 'closed' && !need.text.includes(bl.text.replace(/\.$/, '')) ? `<p class="kc-block" title="${esc(bl.text)}">Blocker: ${esc(bl.text)}</p>` : ''}
      <div class="kc-btns"><button data-open="${d.incidentId}" class="primary">Open board</button>
        <label class="mv">Move to… <select data-moveto="${d.incidentId}" aria-label="Move ${esc(d.incidentId)} to">${KANBAN.map((c) => `<option value="${c.id}" ${c.id === st ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label></div>
    </article>`;
  }
  private kanbanHtml(): string {
    const defs = this.b.defs;
    if (!defs.length) return `<div class="bp-body one"><section class="bp-main"><div class="bp-side"><h3>No active incidents</h3><p>${esc(this.s.mission.alert.headline)}. Routine checks only: nothing to triage this shift.</p></div></section></div>`;
    const cols = KANBAN.map((c) => {
      const cards = defs.filter((d) => this.b.status(d) === c.id);
      const target = this.picked?.kind === 'card';
      return `<section class="kcol" aria-label="${c.label}, ${cards.length} incident${cards.length === 1 ? '' : 's'}"><h3>${c.label} <span class="chip">${cards.length}</span></h3><small>${c.blurb}</small>
        <div class="kcards" data-col="${c.id}" role="list">${cards.map((d) => this.cardHtml(d)).join('') || '<div class="kempty">Drop a card here</div>'}${target ? `<button class="kdrop" data-dropcol="${c.id}">Move here</button>` : ''}</div></section>`;
    }).join('');
    const open = defs.filter((d) => this.b.status(d) !== 'closed').length;
    const tpl = KANBAN.map((c) => (defs.some((d) => this.b.status(d) === c.id) ? 'minmax(250px, 2.2fr)' : 'minmax(116px, .6fr)')).join(' ');
    return `<p class="bp-hint kbhint"><b>${open}</b> active incident${open === 1 ? '' : 's'} of ${defs.length}. Drag a card by its handle ⠿, use <b>Move to…</b>, or focus a card and press <kbd>Space</kbd>, then ← → and <kbd>Space</kbd> again. A card only moves forward when its prerequisite is met. Select <b>Open board</b> to work the incident.</p>
      <div class="kb" aria-label="Incident Kanban" style="grid-template-columns:${tpl}">${cols}</div>
      ${open === 0 ? '<p class="bp-hint kbdone">✓ Every incident is closed. File the report at the Evidence Board.</p>' : ''}`;
  }

  // ---------------------------------------------------------------- incident detail ----
  private incidentHtml(d: IncidentDef): string {
    const s = this.s, b = this.b, st = b.status(d), room = ROOM_BY_ID[d.sourceRoom], routes = d.affectedRouteIds.map((r) => ROUTE_BY_ID[r]);
    return `<div class="ib-top"><button data-a="back">← All incidents</button><h3><b>${esc(d.incidentId)}</b> ${esc(d.title)}</h3>
      <span class="chip ${SEV[d.severity] ?? 'warn'}">${esc(d.severity)}</span><span class="chip info">${KANBAN.find((c) => c.id === st)!.label}</span>
      <span class="chip">\u{1F4CD} ${esc(room.code)} ${esc(room.name.replace('Accounts Receivable and Debt Recovery', 'AR & Debt Recovery'))}</span>
      ${routes.map((r) => `<span class="chip ${s.routeStates[r.id] === 'quarantined' ? 'bad' : s.routeStates[r.id] === 'healthy' || s.routeStates[r.id] === 'restored' ? 'good' : 'warn'}">⤳ ${esc(r.name)}: ${STATE_LABEL[s.routeStates[r.id] ?? 'healthy'].label}</span>`).join('')}
      <span class="chip">${esc(s.mission.deadlineLabel)}</span>
      <span class="grow"></span>${this.host.openMap ? '<button data-a="map">Show on the map</button>' : ''}</div>
      <div class="ib-body"><section class="ib-panel" aria-label="Evidence">${this.evidencePanel(d)}</section>
        <section class="ib-panel task" aria-label="Interactive task">${this.taskPanel(d)}</section>
        <section class="ib-panel" aria-label="Objectives">${this.objectivesPanel(d)}</section></div>
      <div class="ib-log" aria-label="Incident activity log"><b>Incident activity</b>${b.logFor(d.incidentId).slice(-6).reverse().map((l) => `<div class="${l.tone}"><time>${esc(l.t)}</time> ${esc(l.text)}</div>`).join('') || '<div>No activity yet.</div>'}</div>`;
  }

  private evidencePanel(d: IncidentDef): string {
    const s = this.s, m = s.mission;
    const ev = d.evidenceIds.map((id) => {
      const e = m.evidence.find((x) => x.id === id)!, got = s.evidence.has(id), t = s.evidenceTimes[id];
      return `<div class="ev ${got ? 'got' : 'todo'}${this.hl === id ? ' hl' : ''}" data-ev="${id}"><b>${got ? '✓' : '○'} ${esc(e.name)}</b>
        <small>Source: ${esc(ROOM_BY_ID[e.sourceRoom].code)} ${esc(ROOM_BY_ID[e.sourceRoom].name)} · ${esc(PASSES[e.requiredPass].name)}${got && t ? ` · collected ${esc(t.t)}` : ''}</small>
        <p>${got ? esc(d.evidenceNotes[id] ?? e.sensitivity) : `Not collected yet. <button class="link" data-wp="room:${e.sourceRoom}">Set waypoint to ${esc(ROOM_BY_ID[e.sourceRoom].name)}</button>`}</p></div>`;
    }).join('');
    const notes = Object.keys(d.evidenceNotes).filter((k) => !d.evidenceIds.includes(k)).map((k) => `<div class="ev got${this.hl === k ? ' hl' : ''}" data-ev="${k}"><b>✓ Background</b><p>${esc(d.evidenceNotes[k])}</p></div>`).join('');
    const clues = [...s.clues.entries()].slice(-5).reverse().map(([id, c]) => `<div class="ev got${this.hl === id ? ' hl' : ''}" data-ev="${id}"><b>⌕ ${esc(c.label)}</b><small>${c.room ? `Found in ${esc(ROOM_BY_ID[c.room].name)} · ` : ''}${esc(c.t)}</small><p>${esc(c.text)}</p></div>`).join('');
    const reps = this.b.reports.filter((r) => r.inc === d.incidentId).map((r, i) => `<button class="link" data-report="${this.b.reports.indexOf(r)}" title="${esc(r.title)}">${i + 1}. ${esc(r.title)}</button>`).join('<br>');
    return `<h3>Evidence</h3>${ev || '<p>No evidence to collect first: this task is where the investigation starts.</p>'}${notes}${clues ? `<h4>Clues found</h4>${clues}` : ''}${reps ? `<h4>Reports from board actions</h4>${reps}` : ''}`;
  }

  private objectivesPanel(d: IncidentDef): string {
    const s = this.s, m = s.mission, b = this.b;
    const row = (g: { id: string; text: string; done: (x: GameState) => boolean; hint?: string }) => `<li class="${g.done(s) ? 'done' : ''}">${g.done(s) ? '✓' : '○'} ${esc(g.text)}${d.requiredObjectives.includes(g.id) ? ' <small>(needed to close)</small>' : ''}</li>`;
    const blockers = b.blockers(d), sug = this.host.scene.team.suggestion(this.host.scene.team.you);
    const need = b.nextNeed(d);
    return `<h3>Objectives</h3><p><b>${esc(d.keyObjective)}</b></p>
      <h4>Primary</h4><ul class="goals">${m.goals.filter((g) => g.kind === 'primary').map(row).join('')}</ul>
      <h4>Optional</h4><ul class="goals">${m.goals.filter((g) => g.kind === 'optional').map(row).join('') || '<li>None.</li>'}</ul>
      <h4>Blockers</h4>${blockers.length ? `<ul class="goals">${blockers.map((x) => `<li class="blk">⛔ ${esc(x.text)}${x.target ? ` <button class="link" data-wp="${esc(x.target)}">waypoint</button>` : ''}</li>`).join('')}</ul>` : '<p>None: the task is ready.</p>'}
      <h4>Card</h4><p class="kc-need ${need.text.startsWith('Ready') ? 'ok' : 'warn'}">${esc(need.text)}</p>
      <h4>Next suggested action</h4><p>${sug ? `${esc(sug.label)}${sug.target ? ` <button class="link" data-wp="${esc(sug.target)}">waypoint</button>` : ''}` : s.complete ? 'Incident closed.' : 'Nothing is ready yet: follow the clues.'}</p>`;
  }

  // ---------------------------------------------------------------- the task ----
  private taskPanel(d: IncidentDef): string {
    const b = this.b, ps = b.puzzle(d.incidentId), solved = b.isSolved(d), blockers = b.blockers(d);
    const TYPE = { cable: 'Cable rerouting', match: 'Match the parts', missing: 'Identify what is missing', verify: 'Verify the result' }[d.puzzleType];
    const fb = this.msg && this.msg.id === d.incidentId ? this.msg.fb : ps.msg;
    const guide = settings.data.guided && !solved && blockers.length === 0 ? b.guide(d) : null;
    let body = '';
    if (blockers.length && !solved) {
      body = `<div class="pz-locked"><h4>\u{1F512} Not ready yet</h4><p>This task opens once the investigation has caught up:</p><ul class="goals">${blockers.map((x) => `<li class="blk">⛔ ${esc(x.text)}${x.target ? ` <button class="link" data-wp="${esc(x.target)}">waypoint</button>` : ''}</li>`).join('')}</ul></div>`;
    } else if (solved) {
      body = `<div class="pz-done"><h4>✓ Task complete</h4><p>${esc(d.successFeedback)}</p>${ps.pending ? `<p class="warnbox">Waiting: ${esc(ps.pending)} <button data-retry="1">Try again</button></p>` : '<p class="small">The mission, the card and the route have been updated.</p>'}</div>`;
    } else {
      body = `<p class="pz-prompt">${esc(d.prompt)}</p>${this.puzzleHtml(d, guide)}`;
    }
    const help = !solved && !blockers.length ? `<div class="pz-help" role="group" aria-label="Help"><button data-hint="1">Hint</button><button data-clue="1">Show me the next clue</button><label class="chk"><input type="checkbox" data-guided ${settings.data.guided ? 'checked' : ''}> Guided mode</label></div>${guide ? `<p class="guide-line" role="status">Guided: ${esc(this.guideText(d, guide))}</p>` : ''}` : '';
    return `<h3>${TYPE}</h3>${body}${help}<div class="pz-msg ${fb?.tone ?? ''}" role="status" aria-live="polite">${fb ? `${fb.tone === 'good' ? '✓' : fb.tone === 'warn' ? '⚠' : 'ⓘ'} ${esc(fb.text)}` : ''}${this.hintLine(d)}</div>`;
  }
  private hintLine(d: IncidentDef): string { const n = this.b.puzzle(d.incidentId).hints; return n && !this.b.isSolved(d) ? `<div class="hintline"><b>Hint ${Math.min(n, d.hintText.length)}/${d.hintText.length}:</b> ${esc(d.hintText[Math.min(n, d.hintText.length) - 1])}</div>` : ''; }
  private guideText(d: IncidentDef, g: Guide): string {
    const L: any = d.puzzlePieces;
    switch (g.kind) {
      case 'connect': return `connect "${L.ports.find((p: any) => p.id === g.from).label}" to "${L.ports.find((p: any) => p.id === g.to).label}".`;
      case 'place': return `put "${L.pieces.find((p: any) => p.id === g.piece).label}" in "${L.slots.find((p: any) => p.id === g.slot).label}".`;
      case 'mark': return `mark "${L.items.find((p: any) => p.id === g.id).label}".`;
      case 'unmark': return `unmark "${L.items.find((p: any) => p.id === g.id).label}": it is fine as it is.`;
      case 'select': return `select "${L.cards.find((p: any) => p.id === g.id).label}".`;
      case 'unselect': return `unselect "${L.cards.find((p: any) => p.id === g.id).label}": it does not prove it is safe.`;
      case 'submit': return 'submit your answer.';
      default: return 'done.';
    }
  }

  private puzzleHtml(d: IncidentDef, g: Guide | null): string {
    const ps = this.b.puzzle(d.incidentId), L: any = d.puzzlePieces;
    const pk = this.picked && this.picked.kind !== 'card' ? this.picked : null;
    if (d.puzzleType === 'match') {
      const placed = new Set(Object.keys(ps.placements));
      const pieceHtml = (p: Piece, inSlot = false) => `<button class="piece${pk?.id === p.id ? ' picked' : ''}${g?.kind === 'place' && g.piece === p.id ? ' guide' : ''}" data-piece="${p.id}" aria-pressed="${pk?.id === p.id}" aria-label="${esc(p.label)}. ${esc(p.detail ?? '')}${inSlot ? ' (placed: press to take it back)' : ''}">${shapeSvg(p.shape)}<span><b>${esc(p.label)}</b><small>${esc(p.detail ?? '')}</small></span></button>`;
      return `<div class="pz match"><div class="pieces" aria-label="Cards to place">${L.pieces.filter((p: Piece) => !placed.has(p.id)).map((p: Piece) => pieceHtml(p)).join('') || '<small>All cards placed.</small>'}</div>
        <div class="slots">${L.slots.map((sl: any) => `<div class="slot${g?.kind === 'place' && g.slot === sl.id ? ' guide' : ''}" data-slot="${sl.id}" tabindex="0" role="button" aria-label="Slot: ${esc(sl.label)}. ${esc(sl.detail ?? '')}. ${pk ? 'Press Enter to place the picked card here.' : 'Pick a card first.'}"><b>${esc(sl.label)}</b><small>${esc(sl.detail ?? '')}</small><div class="placed">${L.pieces.filter((p: Piece) => ps.placements[p.id] === sl.id).map((p: Piece) => pieceHtml(p, true)).join('')}</div></div>`).join('')}</div></div>`;
    }
    if (d.puzzleType === 'cable') {
      const port = (p: any) => `<button class="port ${p.side}${pk?.id === p.id ? ' picked' : ''}${g?.kind === 'connect' && (g.from === p.id || g.to === p.id) ? ' guide' : ''}" data-port="${p.id}" data-side="${p.side}" aria-pressed="${pk?.id === p.id}" aria-label="${p.side === 'source' ? 'Source' : 'Destination'} port: ${esc(p.label)}. ${esc(p.detail ?? '')}. ${p.side === 'source' ? 'Press to pick up a cable end, then choose a destination.' : (pk ? 'Press to connect the picked cable here.' : 'Pick a source first.')}">${p.side === 'source' ? '' : '<span class="arr">◀</span>'}<span><b>${esc(p.label)}</b><small>${esc(p.detail ?? '')}</small></span>${p.side === 'source' ? '<span class="arr">▶</span>' : ''}</button>`;
      return `<div class="pz cable" data-cableboard><div class="cports left"><small class="colhead">Sources</small>${L.ports.filter((p: any) => p.side === 'source').map(port).join('')}</div>
        <svg class="cables" aria-hidden="true"></svg>
        <div class="cports right"><small class="colhead">Destinations</small>${L.ports.filter((p: any) => p.side === 'dest').map(port).join('')}</div></div>
        <p class="small">${ps.connections.length ? `Cables: ${ps.connections.map(([f, t]) => `<button class="link" data-cut="${f}|${t}" title="Disconnect">${esc(L.ports.find((p: any) => p.id === f).label)} → ${esc(L.ports.find((p: any) => p.id === t).label)} ✕</button>`).join(' · ')}` : 'No cables yet. Drag from a source to a destination, or press a source then a destination.'}</p>`;
    }
    if (d.puzzleType === 'missing') {
      return `<div class="pz missing"><div class="mhead"><b>${esc(L.expectedTitle)}</b><b>${esc(L.currentTitle)}</b><span></span></div>${L.items.map((it: any) => { const on = ps.marked.includes(it.id); return `<div class="mrow2${on ? ' marked' : ''}${g && (g.kind === 'mark' || g.kind === 'unmark') && g.id === it.id ? ' guide' : ''}"><div><b>${esc(it.label)}</b><small>${esc(it.expected)}</small></div><div><small>${esc(it.current)}</small></div><button data-mark="${it.id}" aria-pressed="${on}" aria-label="${on ? 'Unmark' : 'Mark'}: ${esc(it.label)} is missing or out of place">${on ? '⚑ Marked' : '⚐ Mark'}</button></div>`; }).join('')}
        <div class="row"><button class="primary${g?.kind === 'submit' ? ' guide' : ''}" data-submit="1">Submit findings (${ps.marked.length} marked)</button></div></div>`;
    }
    return `<div class="pz verify"><div class="vtabs"><div><b>Before</b>${L.before.map(([k, v]: [string, string]) => `<div class="vrow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div><div class="after"><b>After the fix</b>${L.after.map(([k, v]: [string, string]) => `<div class="vrow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
      <small>Select the evidence that proves it is safe:</small><div class="vcards">${L.cards.map((c: any) => { const on = ps.selected.includes(c.id); return `<button class="vcard${on ? ' on' : ''}${g && (g.kind === 'select' || g.kind === 'unselect') && g.id === c.id ? ' guide' : ''}" data-select="${c.id}" aria-pressed="${on}"><span class="tick">${on ? '☑' : '☐'}</span><span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></span></button>`; }).join('')}</div>
      <div class="row"><button class="primary${g?.kind === 'submit' ? ' guide' : ''}" data-submit="1">Confirm it is safe (${ps.selected.length} selected)</button></div></div>`;
  }

  /** Cables are an SVG layer between the port buttons, drawn after layout. */
  private drawCables(d: IncidentDef): void {
    if (d.puzzleType !== 'cable' || !this.box) return;
    const board = $(this.box, '[data-cableboard]'), svg = board?.querySelector('svg.cables') as SVGSVGElement | null; if (!board || !svg) return;
    const bb = board.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${bb.width} ${bb.height}`); svg.setAttribute('width', String(bb.width)); svg.setAttribute('height', String(bb.height));
    const ps = this.b.puzzle(d.incidentId); let out = '<defs><marker id="cab" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" fill="#9DE3B1"/></marker></defs>';
    for (const [f, t] of ps.connections) {
      const a = board.querySelector(`[data-port="${f}"]`)?.getBoundingClientRect(), z = board.querySelector(`[data-port="${t}"]`)?.getBoundingClientRect(); if (!a || !z) continue;
      const x1 = a.right - bb.left, y1 = a.top + a.height / 2 - bb.top, x2 = z.left - bb.left - 2, y2 = z.top + z.height / 2 - bb.top, mx = (x1 + x2) / 2;
      out += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#9DE3B1" stroke-width="5" stroke-linecap="round" marker-end="url(#cab)"/><path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#0b1424" stroke-width="1.5" stroke-dasharray="2 10" stroke-linecap="round" opacity=".5"/>`;
    }
    svg.innerHTML = out;
  }

  // ---------------------------------------------------------------- actions ----
  private flash(id: string, fb: Feedback): void {
    this.msg = { id, fb };
    this.note = fb.text;
    if (fb.ok) sfx.good(); else if (fb.tone === 'warn') sfx.warn();
  }
  private afterChange(): void { this.s.changed(); this.render(); }

  private moveCard(id: string, to: KanbanStatus): void {
    const d = this.b.def(id), err = this.b.move(d, to);
    if (err) { this.lastRefused = id; this.host.toast(esc(err), 'warn'); this.note = err; sfx.warn(); setTimeout(() => { this.lastRefused = null; this.box?.querySelector(`[data-card="${id}"]`)?.classList.remove('refused'); }, 900); }
    else { this.note = `${id} moved to ${KANBAN.find((c) => c.id === to)!.label}.`; sfx.good(); if (to === 'closed') this.host.toast(`<b>${esc(id)}</b> closed. Verified.`, 'good'); }
    this.picked = null; this.render();
  }

  private place(d: IncidentDef, pieceId: string, slotId: string): void { const fb = this.b.place(d, pieceId, slotId); this.picked = null; this.flash(d.incidentId, fb); this.render(); }
  private connect(d: IncidentDef, from: string, to: string): void { const fb = this.b.connect(d, from, to); this.picked = null; this.flash(d.incidentId, fb); this.render(); }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement, q = <T extends string>(attr: T) => t.closest<HTMLElement>(`[${attr}]`);
    const d = this.incId ? this.b.defs.find((x) => x.incidentId === this.incId)! : null;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a) {
      if (a === 'close') return this.close();
      if (a === 'player') { this.close(); this.host.scene.returnToPlayer(); return; }
      if (a === 'back') { this.view = 'kanban'; this.incId = null; this.picked = null; this.focusKey = ''; return this.render(); }
      if (a === 'map') { this.close(); this.host.openMap?.(); return; }
    }
    const wp = q('data-wp'); if (wp) { const r = this.host.scene.setWaypoint(wp.dataset.wp!); this.host.toast(esc(r.note), r.ok ? 'good' : 'warn'); if (r.ok) this.close(); return; }
    const open = q('data-open'); if (open) { this.view = 'incident'; this.incId = open.dataset.open!; this.picked = null; this.focusKey = ''; return this.render(); }
    const dropcol = q('data-dropcol'); if (dropcol && this.picked?.kind === 'card') return this.moveCard(this.picked.id, dropcol.dataset.dropcol as KanbanStatus);
    if (t.closest('[data-moveto]')) return;
    if (!d) return;
    const rep = q('data-report'); if (rep) { const r = this.b.reports[Number(rep.dataset.report)]; if (r) this.host.openDialog?.(r.spec); return; }
    if (q('data-hint')) { const text = this.b.hint(d); this.note = text; this.msg = { id: d.incidentId, fb: { ok: true, tone: 'info', text: 'Hint shown below.' } }; return this.render(); }
    if (q('data-clue')) { const c = this.b.nextClue(d); this.hl = c.id; this.msg = { id: d.incidentId, fb: { ok: true, tone: 'info', text: `Look at: ${c.text}` } }; this.render(); $(this.box!, `[data-ev="${c.id}"]`)?.scrollIntoView({ block: 'nearest' }); return; }
    if (q('data-retry')) { this.b.retry(d); return this.afterChange(); }
    const cut = q('data-cut'); if (cut) { const [f, to] = cut.dataset.cut!.split('|'); this.b.disconnect(d, f, to); return this.render(); }
    const mark = q('data-mark'); if (mark) { this.b.toggleMark(d, mark.dataset.mark!); this.focusKey = `[data-mark="${mark.dataset.mark}"]`; return this.render(); }
    const sel = q('data-select'); if (sel) { this.b.toggleSelect(d, sel.dataset.select!); this.focusKey = `[data-select="${sel.dataset.select}"]`; return this.render(); }
    if (q('data-submit')) { const fb = d.puzzleType === 'missing' ? this.b.submitMissing(d) : this.b.submitVerify(d); this.flash(d.incidentId, fb); this.focusKey = ''; return this.render(); }
    // match: piece pick / take back, slot place
    const piece = q('data-piece');
    if (piece) {
      const id = piece.dataset.piece!;
      if (this.b.puzzle(d.incidentId).placements[id]) { this.b.unplace(d, id); this.focusKey = ''; return this.render(); }
      this.picked = this.picked?.id === id ? null : { kind: 'piece', id }; this.note = this.picked ? `Picked up. Now choose a slot, or press Escape to cancel.` : 'Cancelled.'; this.focusKey = `[data-piece="${id}"]`; return this.render();
    }
    const slot = q('data-slot'); if (slot) { if (this.picked?.kind === 'piece') return this.place(d, this.picked.id, slot.dataset.slot!); this.note = 'Pick a card first.'; return this.render(); }
    // cable: port pick / connect
    const port = q('data-port');
    if (port) {
      const id = port.dataset.port!, side = port.dataset.side;
      if (side === 'source') { this.picked = this.picked?.id === id ? null : { kind: 'port', id }; this.note = this.picked ? 'Cable end picked up. Choose a destination port, or press Escape.' : 'Cancelled.'; this.focusKey = `[data-port="${id}"]`; return this.render(); }
      if (this.picked?.kind === 'port') return this.connect(d, this.picked.id, id);
      this.note = 'Pick a source port first.'; return this.render();
    }
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if ((t as HTMLSelectElement).dataset.moveto) { this.moveCard((t as HTMLSelectElement).dataset.moveto!, (t as HTMLSelectElement).value as KanbanStatus); return; }
    if ((t as HTMLInputElement).dataset.guided !== undefined) { settings.set('guided', (t as HTMLInputElement).checked); this.render(); }
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.picked) { this.picked = null; this.note = 'Cancelled.'; return this.render(); } return this.close(); }
    // keyboard move for Kanban cards: Space picks up, arrows choose the column, Space drops
    const card = t.closest<HTMLElement>('[data-card]');
    if (card && t === card) {
      const id = card.dataset.card!;
      if (e.key === ' ') { e.preventDefault(); if (this.picked?.kind === 'card' && this.picked.id === id) { const to = this.picked.col!; return this.moveCard(id, to); } this.picked = { kind: 'card', id, col: this.b.status(this.b.def(id)) }; this.note = `Picked up ${id}. Use the left and right arrow keys to choose a column, Space to drop, Escape to cancel.`; this.focusKey = `[data-card="${id}"]`; return this.render(); }
      if (this.picked?.kind === 'card' && this.picked.id === id && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault(); const i = KANBAN_RANK[this.picked.col!] + (e.key === 'ArrowRight' ? 1 : -1), c = KANBAN[Math.max(0, Math.min(KANBAN.length - 1, i))];
        this.picked.col = c.id; const ok = this.b.canMove(this.b.def(id), c.id);
        this.note = `Target column: ${c.label}. ${ok === true ? 'Press Space to drop.' : ok}`; this.focusKey = `[data-card="${id}"]`; this.hlCol(c.id, ok === true); return;
      }
      if (e.key === 'Enter') { e.preventDefault(); this.view = 'incident'; this.incId = id; this.focusKey = ''; return this.render(); }
    }
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('[data-slot]')) { e.preventDefault(); t.click(); return; }
    e.stopPropagation();
  }
  private hlCol(col: KanbanStatus, ok: boolean): void {
    $$(this.box!, '.kcards').forEach((c) => { c.classList.toggle('target', c.dataset.col === col); c.classList.toggle('target-bad', c.dataset.col === col && !ok); });
    const live = $(this.box!, '#ib-live'); if (live) live.textContent = this.note;
  }

  private bindDrag(): void {
    const box = this.box!;
    // Kanban cards (by their grip)
    enableDrag(box, {
      handle: '[data-grip]', drop: '.kcards[data-col]',
      end: (h, target) => { if (target) this.moveCard(h.dataset.grip!, target.dataset.col as KanbanStatus); },
    });
    // puzzle cards and cable ends
    enableDrag(box, {
      handle: '[data-piece], [data-port][data-side="source"]', drop: '[data-slot], [data-port][data-side="dest"]',
      line: false,
      start: (h) => { if (h.dataset.port) return true; const d = this.cur(); return !!d && !this.b.puzzle(d.incidentId).placements[h.dataset.piece!]; },
      end: (h, target) => {
        const d = this.cur(); if (!d || !target) return;
        if (h.dataset.piece && target.dataset.slot) this.place(d, h.dataset.piece, target.dataset.slot);
        else if (h.dataset.port && target.dataset.port) this.connect(d, h.dataset.port, target.dataset.port);
      },
    });
  }
  private cur(): IncidentDef | null { return this.incId ? this.b.defs.find((x) => x.incidentId === this.incId) ?? null : null; }
}
