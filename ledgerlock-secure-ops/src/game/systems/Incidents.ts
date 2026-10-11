import { KANBAN, KANBAN_RANK, type IncidentDef, type KanbanStatus, type PuzzleLayout } from '../../data/incidents/types';
import { INCIDENTS_BY_MISSION } from '../../data/incidents';
import { describeTarget } from '../../data/targets';
import type { DialogSpec } from '../types';
import type { GameState } from './GameState';
import type { MissionRunner } from './MissionRunner';
import { performAction, playbookFor, type PlayAction } from './Playbook';

export interface Feedback { ok: boolean; tone: 'good' | 'warn' | 'bad' | 'info'; text: string }
export interface PuzzleState {
  solved: boolean; touched: boolean;
  connections: [string, string][]; placements: Record<string, string>; marked: string[]; selected: string[];
  hints: number; clues: number; attempts: number;
  /** Set when the puzzle is solved but its real actions are waiting on something. */
  pending?: string; msg?: Feedback;
}
export interface Gate { ok: boolean; need: string }
export interface Gates { triaged: Gate; investigating: Gate; contained: Gate; fixed: Gate; verified: Gate }
export interface Blocker { text: string; target?: string }
export interface BoardLogEntry { t: string; text: string; tone: 'info' | 'good' | 'warn' | 'bad'; inc?: string }
export interface BoardData { kanban: Record<string, { status: KanbanStatus; lastAuto: KanbanStatus }>; puzzles: Record<string, PuzzleState>; log: BoardLogEntry[] }
export type Guide = { kind: 'connect'; from: string; to: string } | { kind: 'place'; piece: string; slot: string } | { kind: 'mark'; id: string } | { kind: 'unmark'; id: string } | { kind: 'select'; id: string } | { kind: 'unselect'; id: string } | { kind: 'submit' } | { kind: 'done' };

const CACHE = new WeakMap<GameState, IncidentBoard>();
const DESK = 'prop:secure_ops.access_desk';

/** The Incident Board's rules: Kanban gating, puzzle moves and the real actions a solved puzzle carries out. No rendering here. */
export class IncidentBoard {
  readonly defs: IncidentDef[];
  readonly actions: Map<string, PlayAction>;
  /** Info and timeline dialogs raised by board actions, kept so the player can read them afterwards. */
  reports: { inc: string; title: string; spec: DialogSpec }[] = [];

  static for(s: GameState, runner: MissionRunner): IncidentBoard {
    let b = CACHE.get(s); if (!b) { b = new IncidentBoard(s, runner); CACHE.set(s, b); } return b;
  }
  private constructor(private s: GameState, private runner: MissionRunner) {
    this.defs = INCIDENTS_BY_MISSION[s.mission.id] ?? [];
    this.actions = new Map(playbookFor(s.mission).map((a) => [a.id, a]));
    s.data.board ??= { kanban: {}, puzzles: {}, log: [] } as BoardData;
  }
  private get data(): BoardData { return this.s.data.board as BoardData; }
  def(id: string): IncidentDef { return this.defs.find((d) => d.incidentId === id)!; }

  // ---------------------------------------------------------------- log ----
  log(text: string, tone: BoardLogEntry['tone'] = 'info', inc?: string): void {
    this.data.log.push({ t: this.s.fmtClock(), text, tone, inc }); if (this.data.log.length > 200) this.data.log.shift();
    this.s.log(`Incident Board: ${text}`, tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'info');
  }
  logFor(id: string): BoardLogEntry[] { return this.data.log.filter((l) => !l.inc || l.inc === id); }

  // ---------------------------------------------------------------- gates and kanban ----
  private done(id: string): boolean { return !!this.actions.get(id)?.done(this.s); }
  private goalText(gid: string) { return this.s.mission.goals.find((g) => g.id === gid)?.text ?? gid; }
  gates(d: IncidentDef): Gates {
    const s = this.s, m = s.mission;
    const evNames = d.evidenceIds.map((e) => m.evidence.find((x) => x.id === e)?.name ?? e);
    const collected = d.evidenceIds.length ? d.evidenceIds.some((e) => s.evidence.has(e)) : true;      // nothing to collect first: the task is the first step
    const contained = d.containTarget ? !!(s.data.containments as { target: string }[] | undefined)?.some((c) => c.target === d.containTarget) : collected;
    const undoneFix = [...d.actions, ...(d.fixActions ?? [])].map((id) => this.actions.get(id)).filter((a): a is PlayAction => !!a && !a.done(s));
    const missingGoal = d.requiredObjectives.find((g) => !m.goals.find((x) => x.id === g)?.done(s));
    return {
      triaged: { ok: !!s.flags.briefed, need: 'Read the Incident Wall in Secure Operations Atrium to brief the shift' },
      investigating: { ok: collected, need: `Collect evidence: ${evNames.join(' or ')}` },
      contained: { ok: contained, need: `Contain ${d.containTarget ? describeTarget(d.containTarget)?.name ?? 'the affected route' : 'the incident'} (narrowly)` },
      fixed: { ok: undoneFix.length === 0, need: `Apply the fix: ${undoneFix[0]?.label ?? 'done'}` },
      verified: { ok: !missingGoal, need: `Complete the verification objective: ${missingGoal ? this.goalText(missingGoal) : ''}` },
    };
  }
  /** Gates that must hold for a card to sit in `col`. */
  private required(col: KanbanStatus, g: Gates): Gate[] {
    switch (col) {
      case 'new': return [];
      case 'triage': return [g.triaged];
      case 'investigating': return [g.triaged, g.investigating];
      case 'contained': case 'fixing': return [g.triaged, g.investigating, g.contained];
      case 'verifying': return [g.triaged, g.investigating, g.contained, g.fixed];
      case 'closed': return [g.triaged, g.investigating, g.contained, g.fixed, g.verified];
    }
  }
  private autoStatus(d: IncidentDef, g: Gates): KanbanStatus {
    const ps = this.puzzle(d.incidentId);
    if (this.s.complete && g.fixed.ok && g.verified.ok) return 'closed';
    const working = ps.touched || ps.solved || [...d.actions, ...(d.fixActions ?? [])].some((id) => this.done(id));
    if (g.fixed.ok && g.contained.ok && g.investigating.ok) return 'verifying';
    if (g.contained.ok && g.investigating.ok) return d.containTarget ? (working ? 'fixing' : 'contained') : (working ? 'fixing' : 'investigating');
    if (g.investigating.ok && g.triaged.ok) return 'investigating';
    if (g.triaged.ok) return 'triage';
    return 'new';
  }
  /** Current column, advancing automatically when the game state moves the incident forward (never auto-closing by drag). */
  status(d: IncidentDef): KanbanStatus {
    const rec = (this.data.kanban[d.incidentId] ??= { status: d.kanbanStatus, lastAuto: 'new' });
    const g = this.gates(d), auto = this.autoStatus(d, g);
    if (KANBAN_RANK[auto] > KANBAN_RANK[rec.lastAuto]) { if (KANBAN_RANK[auto] > KANBAN_RANK[rec.status]) rec.status = auto; rec.lastAuto = auto; }
    return rec.status;
  }
  /** Why the card can or cannot move to `to`. */
  canMove(d: IncidentDef, to: KanbanStatus): true | string {
    const cur = this.status(d);
    if (KANBAN_RANK[to] <= KANBAN_RANK[cur]) return true;
    const label = KANBAN.find((c) => c.id === to)!.label;
    const miss = this.required(to, this.gates(d)).find((x) => !x.ok);
    return miss ? `Cannot move to ${label} yet: ${miss.need}.` : true;
  }
  move(d: IncidentDef, to: KanbanStatus): string | null {
    const ok = this.canMove(d, to);
    if (ok !== true) return ok;
    const from = this.status(d);
    if (from === to) return null;
    const rec = this.data.kanban[d.incidentId]; rec.status = to;
    this.log(`${d.incidentId} moved to ${KANBAN.find((c) => c.id === to)!.label}.`, 'info', d.incidentId);
    this.s.changed();
    return null;
  }
  /** The prerequisite shown on the card: what stands between it and the next column. */
  nextNeed(d: IncidentDef): { next: KanbanStatus | null; text: string } {
    const cur = this.status(d), i = KANBAN_RANK[cur];
    if (i >= KANBAN.length - 1) return { next: null, text: 'Closed.' };
    const next = KANBAN[i + 1].id, miss = this.required(next, this.gates(d)).find((x) => !x.ok);
    return { next, text: miss ? `To move to ${KANBAN[i + 1].label}: ${miss.need}.` : `Ready to move to ${KANBAN[i + 1].label}.` };
  }

  // ---------------------------------------------------------------- puzzle availability ----
  puzzle(id: string): PuzzleState {
    return (this.data.puzzles[id] ??= { solved: false, touched: false, connections: [], placements: {}, marked: [], selected: [], hints: 0, clues: 0, attempts: 0 });
  }
  /** Solved by the board or because its real actions were already done by hand or by a teammate. */
  isSolved(d: IncidentDef): boolean { return this.puzzle(d.incidentId).solved || (d.actions.length > 0 && d.actions.every((a) => this.done(a))); }
  blockers(d: IncidentDef): Blocker[] {
    const s = this.s, out: Blocker[] = [], g = this.gates(d);
    if (this.isSolved(d)) return out;
    if (!g.triaged.ok) out.push({ text: g.triaged.need + '.', target: 'prop:secure_ops.incident_wall' });
    if (!g.investigating.ok) { const ev = d.evidenceIds[0] && this.s.mission.evidence.find((e) => e.id === d.evidenceIds[0]); out.push({ text: g.investigating.need + '.', target: ev ? `room:${ev.sourceRoom}` : undefined }); }
    const first = d.actions.map((id) => this.actions.get(id)).find((a) => a && !a.done(s));
    if (first) {
      for (const dep of first.after) { const x = this.actions.get(dep); if (x && !x.done(s) && !d.actions.includes(dep)) out.push({ text: `First: ${x.label}.`, target: x.target }); }
      const r = first.ready(s);
      if (r !== true && !out.some((o) => o.text.includes(r))) out.push({ text: `${first.label}: ${r}.`, target: /pass/i.test(r) ? DESK : first.target });
    }
    for (const id of d.actions) {                                   // a pass needed by a later action is still a blocker
      const a = this.actions.get(id); if (!a || a.done(s) || a === first) continue;
      const r = a.ready(s);
      if (typeof r === 'string' && r.startsWith('needs the')) out.push({ text: `${a.label}: ${r}.`, target: DESK });
    }
    return out;
  }
  available(d: IncidentDef): boolean { return this.isSolved(d) || this.blockers(d).length === 0; }

  // ---------------------------------------------------------------- puzzle moves ----
  private fb(ps: PuzzleState, ok: boolean, tone: Feedback['tone'], text: string): Feedback { return (ps.msg = { ok, tone, text }); }
  private layout<T extends PuzzleLayout['type']>(d: IncidentDef, t: T): Extract<PuzzleLayout, { type: T }> { return d.puzzlePieces as Extract<PuzzleLayout, { type: T }>; void t; }

  connect(d: IncidentDef, from: string, to: string): Feedback {
    const ps = this.puzzle(d.incidentId), L = this.layout(d, 'cable');
    if (ps.solved) return this.fb(ps, true, 'info', 'This task is already done.');
    const a = L.ports.find((p) => p.id === from), b = L.ports.find((p) => p.id === to);
    if (!a || !b || a.side !== 'source' || b.side !== 'dest') return this.fb(ps, false, 'info', 'Drag a cable from a source port (left) to a destination port (right).');
    if (ps.connections.some(([f, t]) => f === from && t === to)) return this.fb(ps, true, 'info', 'Those two ports are already connected.');
    ps.touched = true;
    if (!(d.validConnections ?? []).some(([f, t]) => f === from && t === to)) {
      ps.attempts++;
      const text = d.failureFeedback[`${from}>${to}`] ?? `${a.label} should not go to ${b.label}. ${d.failureFeedback.default}`;
      this.log(`Cable refused: ${a.label} → ${b.label}.`, 'warn', d.incidentId);
      return this.fb(ps, false, 'warn', text);
    }
    ps.connections.push([from, to]);
    this.log(`Connected ${a.label} → ${b.label}.`, 'good', d.incidentId);
    if ((d.validConnections ?? []).every(([f, t]) => ps.connections.some(([x, y]) => x === f && y === t))) return this.finish(d);
    return this.fb(ps, true, 'good', `Connected: ${a.label} → ${b.label}. ${(d.validConnections ?? []).length - ps.connections.length} more connection(s) to make.`);
  }
  disconnect(d: IncidentDef, from: string, to: string): void {
    const ps = this.puzzle(d.incidentId); if (ps.solved) return;
    ps.connections = ps.connections.filter(([f, t]) => !(f === from && t === to)); ps.msg = undefined; this.s.changed();
  }
  place(d: IncidentDef, pieceId: string, slotId: string): Feedback {
    const ps = this.puzzle(d.incidentId), L = this.layout(d, 'match');
    if (ps.solved) return this.fb(ps, true, 'info', 'This task is already done.');
    const piece = L.pieces.find((p) => p.id === pieceId), slot = L.slots.find((x) => x.id === slotId);
    if (!piece || !slot) return this.fb(ps, false, 'info', 'Drag a card onto a slot.');
    ps.touched = true;
    const home = (d.correctMatches ?? {})[pieceId];
    if (home !== slotId) {
      ps.attempts++;
      const text = d.failureFeedback[`${pieceId}@${slotId}`] ?? (home ? `${piece.why} It does not belong in "${slot.label}".` : `${piece.why} It is not part of this task.`);
      this.log(`Mismatch: ${piece.label} is not "${slot.label}".`, 'warn', d.incidentId);
      return this.fb(ps, false, 'warn', text);
    }
    ps.placements[pieceId] = slotId;
    this.log(`Matched ${piece.label} → ${slot.label}.`, 'good', d.incidentId);
    const need = Object.keys(d.correctMatches ?? {});
    if (need.every((p) => ps.placements[p] === d.correctMatches![p])) return this.finish(d);
    return this.fb(ps, true, 'good', `Matched. ${piece.why} ${need.length - Object.keys(ps.placements).length} to go.`);
  }
  unplace(d: IncidentDef, pieceId: string): void { const ps = this.puzzle(d.incidentId); if (!ps.solved) { delete ps.placements[pieceId]; ps.msg = undefined; this.s.changed(); } }
  toggleMark(d: IncidentDef, id: string): void { const ps = this.puzzle(d.incidentId); if (ps.solved) return; ps.touched = true; ps.marked = ps.marked.includes(id) ? ps.marked.filter((x) => x !== id) : [...ps.marked, id]; ps.msg = undefined; this.s.changed(); }
  submitMissing(d: IncidentDef): Feedback {
    const ps = this.puzzle(d.incidentId), L = this.layout(d, 'missing');
    if (ps.solved) return this.fb(ps, true, 'info', 'This task is already done.');
    const want = L.items.filter((i) => i.problem).map((i) => i.id), wrong = ps.marked.filter((m) => !want.includes(m)), miss = want.filter((w) => !ps.marked.includes(w));
    ps.touched = true;
    if (!wrong.length && !miss.length) return this.finish(d);
    ps.attempts++;
    const lines = wrong.map((w) => { const it = L.items.find((i) => i.id === w)!; return `${it.label}: ${it.okWhy}`; });
    if (miss.length) lines.push(miss.length === 1 ? 'One item is still missing or out of place: compare Expected with Current line by line.' : `${miss.length} items are still missing or out of place: compare Expected with Current line by line.`);
    this.log('Findings not accepted yet.', 'warn', d.incidentId);
    return this.fb(ps, false, 'warn', lines.join(' '));
  }
  toggleSelect(d: IncidentDef, id: string): void { const ps = this.puzzle(d.incidentId); if (ps.solved) return; ps.touched = true; ps.selected = ps.selected.includes(id) ? ps.selected.filter((x) => x !== id) : [...ps.selected, id]; ps.msg = undefined; this.s.changed(); }
  submitVerify(d: IncidentDef): Feedback {
    const ps = this.puzzle(d.incidentId), L = this.layout(d, 'verify');
    if (ps.solved) return this.fb(ps, true, 'info', 'This task is already done.');
    const want = L.cards.filter((c) => c.confirms).map((c) => c.id), wrong = ps.selected.filter((x) => !want.includes(x)), miss = want.filter((w) => !ps.selected.includes(w));
    ps.touched = true;
    if (!wrong.length && !miss.length) return this.finish(d);
    ps.attempts++;
    const lines = wrong.map((w) => { const c = L.cards.find((x) => x.id === w)!; return `${c.label}: ${c.why}`; });
    if (miss.length) lines.push(`That is not yet enough to show it is safe: ${miss.length} more piece${miss.length > 1 ? 's' : ''} of evidence ${miss.length > 1 ? 'are' : 'is'} needed.`);
    this.log('Verification not accepted yet.', 'warn', d.incidentId);
    return this.fb(ps, false, 'warn', lines.join(' '));
  }

  // ---------------------------------------------------------------- finishing: the real state change ----
  private finish(d: IncidentDef): Feedback {
    const ps = this.puzzle(d.incidentId);
    ps.solved = true; ps.touched = true;
    this.log(`${d.title}: task completed.`, 'good', d.incidentId);
    this.runEffect(d);
    return this.fb(ps, true, 'good', d.successFeedback + (ps.pending ? ` (Waiting: ${ps.pending})` : ''));
  }
  /** Carries out the incident's playbook actions for real (containment, fixes, checks...), recording what the board did. */
  runEffect(d: IncidentDef): void {
    const s = this.s, ps = this.puzzle(d.incidentId), best = s.mission.bestChoice ?? {};
    ps.pending = undefined;
    const prev = s.decide;
    s.decide = (spec) => {
      switch (spec.type) {
        case 'meeting': spec.onChoose(best[spec.title] ?? spec.options[0].id); return true;
        case 'choice': spec.onChoose(best[spec.title] ?? spec.options[0].id); return true;
        case 'confirm': spec.onConfirm(); return true;
        case 'emergency': spec.autoSolve(); return true;
        case 'info': this.reports.push({ inc: d.incidentId, title: spec.title, spec }); return true;
        case 'timeline': { const { onClose, ...rest } = spec; this.reports.push({ inc: d.incidentId, title: spec.title, spec: rest }); onClose?.(); return true; }
        default: return true;
      }
    };
    try {
      for (const id of d.actions) {
        const a = this.actions.get(id); if (!a || a.done(s)) continue;
        performAction(this.runner, a);
        if (!a.done(s)) { ps.pending = `${a.label}: ${s.latestResult?.text ?? 'not ready yet'}`; this.log(`Waiting on "${a.label}".`, 'warn', d.incidentId); break; }
        this.log(`Done: ${a.label}.`, 'good', d.incidentId);
      }
    } finally { s.decide = prev; }
    this.s.changed();
  }
  /** Try the remaining real actions again (a solved task that was waiting on something). */
  retry(d: IncidentDef): void { if (this.puzzle(d.incidentId).solved) this.runEffect(d); }

  // ---------------------------------------------------------------- help ----
  hint(d: IncidentDef): string {
    const ps = this.puzzle(d.incidentId), i = Math.min(ps.hints, d.hintText.length - 1);
    ps.hints++; if (!this.s.tutorial) this.s.stats.hintsUsed++;
    this.log(`Hint ${Math.min(ps.hints, d.hintText.length)} of ${d.hintText.length} shown.`, 'info', d.incidentId);
    return d.hintText[i];
  }
  /** "Show me the next clue": the next evidence or clue the solution depends on, in order. */
  nextClue(d: IncidentDef): { id: string; text: string } {
    const ps = this.puzzle(d.incidentId), id = d.clueOrder[ps.clues % d.clueOrder.length]; ps.clues++;
    if (!this.s.tutorial) this.s.stats.hintsUsed++;
    const ev = this.s.mission.evidence.find((e) => e.id === id);
    const text = d.evidenceNotes[id] ?? this.s.clues.get(id)?.text ?? ev?.name ?? id;
    this.log(`Pointed at the next clue: ${ev?.name ?? id}.`, 'info', d.incidentId);
    return { id, text };
  }
  /** The next correct move (for guided mode and tests). */
  guide(d: IncidentDef): Guide {
    const ps = this.puzzle(d.incidentId);
    if (ps.solved) return { kind: 'done' };
    switch (d.puzzleType) {
      case 'cable': { const need = (d.validConnections ?? []).find(([f, t]) => !ps.connections.some(([x, y]) => x === f && y === t)); return need ? { kind: 'connect', from: need[0], to: need[1] } : { kind: 'done' }; }
      case 'match': { const m = d.correctMatches ?? {}, p = Object.keys(m).find((k) => ps.placements[k] !== m[k]); return p ? { kind: 'place', piece: p, slot: m[p] } : { kind: 'done' }; }
      case 'missing': {
        const L = this.layout(d, 'missing'), want = L.items.filter((i) => i.problem).map((i) => i.id);
        const wrong = ps.marked.find((x) => !want.includes(x)); if (wrong) return { kind: 'unmark', id: wrong };
        const miss = want.find((w) => !ps.marked.includes(w)); return miss ? { kind: 'mark', id: miss } : { kind: 'submit' };
      }
      case 'verify': {
        const L = this.layout(d, 'verify'), want = L.cards.filter((c) => c.confirms).map((c) => c.id);
        const wrong = ps.selected.find((x) => !want.includes(x)); if (wrong) return { kind: 'unselect', id: wrong };
        const miss = want.find((w) => !ps.selected.includes(w)); return miss ? { kind: 'select', id: miss } : { kind: 'submit' };
      }
    }
  }
  /** Plays one guided move (used by tests and by guided mode's "do it for me" is NOT offered: the player still makes the move). */
  applyGuide(d: IncidentDef, g: Guide = this.guide(d)): Feedback | null {
    switch (g.kind) {
      case 'connect': return this.connect(d, g.from, g.to);
      case 'place': return this.place(d, g.piece, g.slot);
      case 'mark': case 'unmark': this.toggleMark(d, g.id); return null;
      case 'select': case 'unselect': this.toggleSelect(d, g.id); return null;
      case 'submit': return d.puzzleType === 'missing' ? this.submitMissing(d) : this.submitVerify(d);
      default: return null;
    }
  }
}
