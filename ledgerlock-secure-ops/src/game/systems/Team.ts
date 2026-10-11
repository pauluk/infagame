import { roomAt, GRID } from '../../data/map';
import { describeTarget } from '../../data/targets';
import { TOOL_BY_ID } from '../../data/tools';
import type { Cell, DialogSpec, ToolId } from '../types';
import type { GameState } from './GameState';
import type { MissionRunner } from './MissionRunner';
import { walkableFor } from './Grid';
import { ROLE_LABEL, performAction, playbookFor, type PlayAction, type Role } from './Playbook';
import { reachRange, standFor } from './Reach';

export type Facing = 'se' | 'sw' | 'nw' | 'ne';
export type Phase = 'idle' | 'walking' | 'working' | 'settle' | 'waiting' | 'blocked';

/** How the real player avatar (owned by the scene) is driven when the player's own Auto-play is on. */
export interface ExternalBody {
  cell(): Cell; pos(): { x: number; y: number };
  walkTo(cell: Cell): void; idle(): boolean; cancel(): void;
  pose(tool: string): void;
}

export interface Member {
  id: string; name: string; role: Role | 'any'; title: string; color: number;
  auto: boolean;
  pos: { x: number; y: number }; facing: Facing; path: Cell[];
  phase: Phase; note: string; moving: boolean;
  task: PlayAction | null; manual: boolean; workLeft: number; settle: number;
  claimed: string | null;
  fails: Record<string, number>; coolUntil: Record<string, number>; idleFor: number;
  external?: ExternalBody; walkIssued?: boolean; pending?: InboxItem | null; done: number;
  /** Manager mode resources: Focus (0-100) is spent as effort and recovers while idle or on a break. */
  focus: number; resting: boolean; spent: number; breaks: number;
}
export type Fatigue = 'fresh' | 'steady' | 'tired' | 'exhausted';
/** Effort units per action (before the specialist adjustment). One unit costs one point of Focus. */
const BASE_COST: Record<string, number> = { e: 3, scanner: 4, lens: 6, patch: 9, restore: 9, recon: 8, token: 8, quarantine: 10, reroute: 8, pass: 3, record: 3, report: 5 };
export const EFFORT_BUDGET = 100;          // team effort available this shift before it turns into overtime
export const TIRED_AT = 35, EXHAUSTED_AT = 8, REST_UNTIL = 75, WALK_EFFORT = 0.2, IDLE_RECOVERY = 1.6, REST_RECOVERY = 7;
export const fatigueOf = (f: number): Fatigue => (f <= EXHAUSTED_AT ? 'exhausted' : f < TIRED_AT ? 'tired' : f < 70 ? 'steady' : 'fresh');
/** Effort an action costs a member. Specialists are efficient; covering for someone else costs half as much again. */
export function effortCost(a: PlayAction, m: Pick<Member, 'role'>): number {
  const base = a.kind === 'use' || a.kind === 'contain' || a.kind === 'release' || a.kind === 'reroute' ? BASE_COST[a.kind === 'use' ? String(a.tool) : a.kind === 'contain' || a.kind === 'release' ? 'quarantine' : 'reroute'] ?? 5 : BASE_COST[a.kind] ?? 3;
  return Math.ceil(base * (m.role === 'any' || a.role === m.role ? 1 : 1.5));
}
export interface Quote { cost: number; seconds: number; specialist: boolean; enough: boolean; fatigue: Fatigue; walk: number }
export type Question = 'status' | 'recommend' | 'blocked' | 'feeling';
export interface InboxItem {
  id: number; member: string; kind: 'decision' | 'report' | 'alert'; title: string; text?: string; t: string;
  spec?: DialogSpec; resolved?: boolean;
}

export const ROSTER: { id: string; name: string; role: Role; title: string; color: number }[] = [
  { id: 'priya', name: 'Priya', role: 'investigator', title: ROLE_LABEL.investigator, color: 0x58c4dd },
  { id: 'marcus', name: 'Marcus', role: 'containment', title: ROLE_LABEL.containment, color: 0xf2a65a },
  { id: 'lena', name: 'Lena', role: 'records', title: ROLE_LABEL.records, color: 0xb59cff },
];
const WALK_SPEED = 4.4;           // cells / second

export interface TeamOptions {
  /** Start with the three teammates on duty (Manager mode). The player's own avatar can always be put on Auto-play. */
  team: boolean;
  spawn: Cell[];
  body?: ExternalBody;
  autoDecide: () => boolean;
  /** Playbook action ids teammates leave alone (the Incident Board's puzzles carry them out instead). */
  reserved?: ReadonlySet<string>;
  /** JEV second opinion (optional). When it is on, choices go to JEV first; teammates only act on it when it is confident. */
  jevOn?: () => boolean;
  advise?: (spec: Extract<DialogSpec, { type: 'choice' }>) => Promise<{ id: string; confidence: number } | null>;
  /** Called whenever anyone is switched on or off Auto (the UI remembers it so Auto keeps going across missions). */
  onAuto?: (any: boolean) => void;
}
/** How sure JEV must be before a teammate acts on its answer without asking the manager. */
export const JEV_GATE = 0.75;

/** Team and Auto-play. Pure game logic: teammates walk the grid, then use the same MissionRunner a player does. */
export class TeamController {
  members: Member[] = [];
  inbox: InboxItem[] = [];
  readonly actions: PlayAction[];
  private byId = new Map<string, PlayAction>();
  private claims = new Map<string, string>();
  private readyAt: Record<string, number> = {};
  private acting: Member | null = null;
  private seq = 0; private manualSeq = 0;
  private lastReport = 0;
  /** Manager mode: are the teammates on duty? (They can be called in or sent home at any time.) */
  crewOn = false;

  constructor(public s: GameState, public runner: MissionRunner, public opts: TeamOptions) {
    this.actions = playbookFor(s.mission);
    for (const a of this.actions) this.byId.set(a.id, a);
    const mk = (id: string, name: string, role: Role | 'any', title: string, color: number, cell: Cell, external?: ExternalBody): Member => ({
      id, name, role, title, color, auto: false, pos: { x: cell.x + 0.5, y: cell.y + 0.5 }, facing: 'se', path: [], phase: 'idle', note: 'Standing by',
      moving: false, task: null, manual: false, workLeft: 0, settle: 0, claimed: null, fails: {}, coolUntil: {}, idleFor: 0, external, pending: null, done: 0,
      focus: 100, resting: false, spent: 0, breaks: 0,
    });
    this.members.push(mk('you', 'You', 'any', 'Manager', 0xf5c542, opts.spawn[0], opts.body));
    this.crewOn = opts.team;
    ROSTER.forEach((r, i) => this.members.push(mk(r.id, r.name, r.role, r.title, r.color, opts.spawn[(i + 1) % opts.spawn.length])));
    s.decide = (spec) => this.decide(spec);
  }

  dispose(): void { if (this.s.decide) this.s.decide = undefined; }
  member(id: string): Member | undefined { return this.members.find((m) => m.id === id); }
  get you(): Member { return this.members[0]; }
  get crew(): Member[] { return this.crewOn ? this.members.filter((m) => m.id !== 'you') : []; }
  private live(): Member[] { return this.crewOn ? this.members : this.members.filter((m) => m.id === 'you'); }
  setCrew(on: boolean): void {
    if (on === this.crewOn) return;
    if (!on) for (const m of this.members) if (m.id !== 'you') { this.release(m); this.stop(m, 'Standing by'); m.auto = false; }
    this.crewOn = on; this.s.changed();
  }

  // ------------------------------------------------------------ commands ----
  setAuto(id: string, on: boolean): void {
    const m = this.member(id); if (!m) return;
    m.auto = on; this.lastProgAt = this.s.elapsed;
    if (!on && m.phase !== 'working' && m.phase !== 'waiting') this.stop(m, 'Standing by');
    else if (on && m.phase === 'idle') m.note = 'Looking for work';
    this.opts.onAuto?.(this.anyAuto());
  }
  setAllAuto(on: boolean): void { for (const m of this.live()) this.setAuto(m.id, on); }
  anyAuto(): boolean { return this.live().some((m) => m.auto); }
  /** Auto-run progress watchdog: if nothing has advanced for a while, forget old failures so everyone tries again. */
  private lastProg = -1; private lastProgAt = 0; nudges = 0;
  private watchdog(): void {
    const s = this.s; if (!this.anyAuto()) return;
    const prog = this.actions.filter((a) => a.done(s)).length * 1000 + s.evidence.size * 10 + this.members.reduce((n, m) => n + m.done, 0);
    if (prog !== this.lastProg) { this.lastProg = prog; this.lastProgAt = s.elapsed; return; }
    if (s.elapsed - this.lastProgAt < 40 || this.members.some((m) => m.pending && !m.pending.resolved)) return;
    this.lastProgAt = s.elapsed; this.nudges++;
    for (const m of this.live()) { m.coolUntil = {}; m.fails = {}; if (m.phase === 'blocked' || (m.phase === 'idle' && !m.task)) { this.release(m); m.phase = 'idle'; m.idleFor = 1; } }
    this.claims.clear();
    s.log('Auto: nothing has moved for a while, so everyone is trying again.', 'info');
  }

  /** Order a teammate to use a tool on a target, or to take one of the playbook actions. */
  order(id: string, o: { tool: ToolId | 'e'; target: string } | { actionId: string }): string | null {
    const m = this.member(id); if (!m || m.id === 'you' || !this.crewOn) return 'Only teammates take orders.';
    let a: PlayAction | undefined;
    if ('actionId' in o) a = this.byId.get(o.actionId);
    else {
      const t = describeTarget(o.target); if (!t) return 'Pick a target first.';
      const needsArea = o.tool === 'quarantine' || o.tool === 'reroute';
      if (needsArea && t.kind !== 'room' && t.kind !== 'route' && t.kind !== 'prop') return 'Quarantine and Reroute work on a room, a route or a flagged component.';
      const tool = o.tool;
      a = { id: 'manual:' + ++this.manualSeq, label: tool === 'e' ? `Inspect ${t.name}` : `${TOOL_BY_ID[tool].name} on ${t.name}`, role: 'investigator', kind: 'use', target: o.target, tool, after: [], done: () => false, ready: () => true };
    }
    if (!a) return 'That task is no longer available.';
    if (fatigueOf(m.focus) === 'exhausted') return `${m.name} is exhausted (Focus ${Math.round(m.focus)}%). Give them a break first.`;
    this.release(m); m.resting = false;
    m.task = a; m.manual = true; m.fails = {}; this.begin(m);
    this.s.stats.orders++; this.s.log(`${this.s.fmtClock()} ${m.name} ordered: ${a.label} (about ${effortCost(a, m)} effort).`, 'info');
    this.s.changed();
    return null;
  }
  recall(id: string): void {
    const m = this.member(id); if (!m) return;
    this.release(m); this.stop(m, m.auto ? 'Looking for work' : 'Standing by');
    if (m.external) m.external.cancel();
  }
  /** Send a teammate on a break: Focus recovers quickly, and they take no work until they are back up. */
  rest(id: string): void {
    const m = this.member(id); if (!m || m.id === 'you' || !this.crewOn) return;
    this.release(m); m.path = []; m.phase = 'idle'; m.resting = true; m.breaks++; this.s.stats.breaks++; m.note = 'On a break: recovering Focus';
    this.s.log(`${m.name} takes a break.`, 'info'); this.s.changed();
  }
  get spent(): number { return Math.round(this.crew.reduce((n, m) => n + m.spent, 0) * 10) / 10; }
  get overtime(): number { return Math.max(0, Math.round((this.spent - EFFORT_BUDGET) * 10) / 10); }
  /** What an action would cost this member: effort, time and whether they are fit to do it. Shown before any order is given. */
  quote(m: Member, a: PlayAction): Quote {
    const cost = effortCost(a, m), fatigue = fatigueOf(m.focus), cell = this.cellOf(m);
    const key = `${m.id}|${a.id}|${cell.x},${cell.y}|${[...this.s.passes].length}`;
    let walk = this.walkCache.get(key);
    if (walk === undefined) { const st = a.target ? standFor(a.target, cell, this.s.passes) : { path: [] as Cell[] }; walk = st ? st.path.length : 0; if (this.walkCache.size > 400) this.walkCache.clear(); this.walkCache.set(key, walk); }
    const work = (a.kind === 'contain' || a.kind === 'release' ? 1.6 : 1.1) * (m.role === 'any' || a.role === m.role ? 1 : 1.8) * (fatigue === 'tired' ? 1.5 : 1);
    return { cost, walk, seconds: Math.round(walk / WALK_SPEED + work), specialist: m.role === 'any' || a.role === m.role, enough: m.focus >= cost, fatigue };
  }
  private walkCache = new Map<string, number>();
  /** Ask a teammate a question. The answer arrives as a message; asking costs them a moment of attention, never effort. */
  question(id: string, q: Question): InboxItem | null {
    const m = this.member(id); if (!m || m.id === 'you' || !this.crewOn) return null;
    const s = this.s, fat = fatigueOf(m.focus), focus = Math.round(m.focus);
    let text = '', title = '';
    if (q === 'status') {
      title = 'Status';
      text = m.resting ? `On a break (Focus ${focus}%).` : m.task ? `${m.phase === 'working' ? 'Working on' : m.phase === 'walking' ? 'Heading to do' : m.phase === 'waiting' ? 'Waiting for you on' : 'On'}: ${m.task.label}. About ${this.quote(m, m.task).cost} effort. Focus ${focus}% (${fat}).` : `Standing by. Focus ${focus}% (${fat}).`;
    } else if (q === 'recommend') {
      title = 'Recommendation';
      const a = this.suggestion(m);
      if (!a) { const blocked = this.outstanding().find((o) => o.state === 'blocked'); text = blocked ? `Nothing is ready for me. Next up, "${blocked.a.label}", is waiting: ${blocked.why}.` : 'Nothing left to do, as far as I can see.'; }
      else { const qt = this.quote(m, a); text = `I would ${a.label}. About ${qt.cost} effort and ${qt.seconds}s${qt.specialist ? ' (my specialty)' : ': not my specialty, so it costs half as much again. Someone else may be better placed'}.${qt.enough ? '' : ' I do not have the Focus for it right now: I need a break first.'}`; }
    } else if (q === 'blocked') {
      title = 'Blockers';
      text = m.phase === 'blocked' ? m.note : m.pending && !m.pending.resolved ? `I am waiting for your call: ${m.pending.title}.` : (() => { const b = this.outstanding().find((o) => o.state === 'blocked'); return b ? `Nothing blocks me, but "${b.a.label}" cannot start yet: ${b.why}.` : 'Nothing is blocking me.'; })();
    } else {
      title = 'How are you?';
      text = fat === 'exhausted' ? `I am spent (Focus ${focus}%). Please send me on a break.` : fat === 'tired' ? `Getting tired (Focus ${focus}%): I am slower now. A short break would help.` : fat === 'steady' ? `Fine (Focus ${focus}%).` : `Fresh (Focus ${focus}%).`;
    }
    if (m.phase === 'working') m.workLeft += 0.6;                // an interruption costs a moment
    const it: InboxItem = { id: ++this.seq, member: m.name, kind: 'report', title: `${title}?`, text, t: s.fmtClock() };
    this.push(it); return it;
  }
  dismiss(itemId: number): void {
    const it = this.inbox.find((x) => x.id === itemId); if (!it) return;
    it.resolved = true;
    for (const m of this.members) if (m.pending === it) m.pending = null;
    this.s.changed();
  }
  /** Next playbook action for a member (what the "Suggested" button would do). */
  suggestion(m: Member): PlayAction | null { return this.available(m, true)[0] ?? null; }
  /** Everything left in the playbook, with status, for the Orders list. */
  outstanding(): { a: PlayAction; state: 'ready' | 'blocked' | 'taken'; why?: string; by?: string }[] {
    const out: { a: PlayAction; state: 'ready' | 'blocked' | 'taken'; why?: string; by?: string }[] = [];
    for (const a of this.actions) {
      if (a.done(this.s) || a.kind === 'wait') continue;
      const by = this.claims.get(a.id);
      if (by) { out.push({ a, state: 'taken', by: this.member(by)?.name }); continue; }
      const why = this.blockedBy(a);
      out.push(why ? { a, state: 'blocked', why } : { a, state: 'ready' });
    }
    return out;
  }
  stuckReport(): string[] { return this.live().filter((m) => m.phase === 'blocked').map((m) => `${m.name}: ${m.note}`); }

  // ------------------------------------------------------------ decisions from teammates ----
  private decide(spec: DialogSpec): boolean {
    const m = this.acting; if (!m) return false;
    const auto = this.opts.autoDecide();
    if (m.external && !auto) return false;                    // the player is at the keyboard: normal dialogs
    const mission = this.s.mission;
    switch (spec.type) {
      case 'choice': {
        if (this.opts.jevOn?.() && this.opts.advise) { this.askJev(m, spec, auto); return true; }
        if (auto) { this.postReport(m, spec.title, `${m.name} chose the best-practice answer.`); spec.onChoose(mission.bestChoice?.[spec.title] ?? spec.options[0].id); return true; }
        this.ask(m, spec.title, 'Needs your call', { ...spec, onChoose: (id) => { it.resolved = true; if (m.pending === it) m.pending = null; spec.onChoose(id); } });
        const it = this.inbox[this.inbox.length - 1];
        return true;
      }
      case 'meeting': {
        if (auto) { this.postReport(m, spec.title, `${m.name} agreed the best-practice decision with the Bronze team.`); spec.onChoose(mission.bestChoice?.[spec.title] ?? spec.options[0].id); return true; }
        this.ask(m, spec.title, 'Bronze needs your decision', { ...spec, onChoose: (id) => { it.resolved = true; if (m.pending === it) m.pending = null; spec.onChoose(id); } });
        const it = this.inbox[this.inbox.length - 1];
        return true;
      }
      case 'confirm': {
        if (auto) { this.postReport(m, spec.title, `${m.name} confirmed: ${spec.confirmLabel}.`); spec.onConfirm(); return true; }
        this.ask(m, spec.title, 'Needs your approval', { ...spec, onConfirm: () => { it.resolved = true; if (m.pending === it) m.pending = null; spec.onConfirm(); } });
        const it = this.inbox[this.inbox.length - 1];
        return true;
      }
      case 'emergency': {
        if (auto) { this.postReport(m, spec.title, `${m.name} worked the emergency payment desk by the book.`); spec.autoSolve(); return true; }
        this.postReport(m, spec.title, 'This desk needs your decisions. Open it yourself.'); return true;
      }
      case 'info': this.postReport(m, spec.title, spec.body, spec); return true;
      case 'timeline': { const { onClose, ...rest } = spec; this.postReport(m, spec.title, spec.conclusion, rest); onClose?.(); return true; }
      default: return true;                                    // alert / board / goals / access: nothing to ask of anyone
    }
  }
  /** Confidence-gated routing: JEV answers; the teammate acts only when it is sure and Auto may decide, otherwise it asks the manager. */
  private askJev(m: Member, spec: Extract<DialogSpec, { type: 'choice' }>, auto: boolean): void {
    const it: InboxItem = { id: ++this.seq, member: m.name, kind: 'decision', title: spec.title, text: 'Asking JEV for a second opinion…', t: this.s.fmtClock() };
    const done = (id: string) => { it.resolved = true; if (m.pending === it) m.pending = null; spec.onChoose(id); };
    it.spec = { ...spec, onChoose: done };
    this.push(it); m.pending = it;
    const label = (id: string) => spec.options.find((o) => o.id === id)?.label ?? id;
    void this.opts.advise!(spec).then((r) => {
      if (it.resolved) return;
      const best = this.s.mission.bestChoice?.[spec.title];
      if (r) {
        const pct = Math.round(r.confidence * 100);
        if (auto && r.confidence >= JEV_GATE) { this.s.stats.jevFollowed++; this.postReport(m, spec.title, `Followed JEV: "${label(r.id)}" (${pct}% sure).`); done(r.id); return; }
        it.text = `JEV suggests "${label(r.id)}" (${pct}% sure).${auto ? ' Not sure enough to act alone: your call.' : ' Your call.'}`;
      } else if (auto && best) { this.postReport(m, spec.title, `JEV was unavailable, so ${m.name} used the playbook answer.`); done(best); return; }
      else it.text = 'JEV is unavailable right now. Your call.';
      this.s.log(`${m.name}: ${spec.title}: ${it.text}`, 'warn'); this.s.changed();
    });
  }
  private ask(m: Member, title: string, text: string, spec: DialogSpec): void {
    const it: InboxItem = { id: ++this.seq, member: m.name, kind: 'decision', title, text, t: this.s.fmtClock(), spec };
    this.push(it); m.pending = it;
    this.s.log(`${m.name}: ${title}: ${text.toLowerCase()}.`, 'warn');
  }
  private postReport(m: Member, title: string, text: string, spec?: DialogSpec): void {
    this.push({ id: ++this.seq, member: m.name, kind: 'report', title, text, t: this.s.fmtClock(), spec });
    this.lastReport = this.s.elapsed;
  }
  private push(it: InboxItem): void { this.inbox.unshift(it); this.inbox.length = Math.min(this.inbox.length, 40); this.s.changed(); }

  // ------------------------------------------------------------ planning ----
  private blockedBy(a: PlayAction): string | null {
    const s = this.s;
    for (const d of a.after) { const x = this.byId.get(d); if (x && !x.done(s)) return `after "${x.label}"`; }
    const r = a.ready(s);
    return r === true ? null : r;
  }
  private available(m: Member, any = false): PlayAction[] {
    const s = this.s;
    const ok = this.actions.filter((a) => a.kind !== 'wait' && !this.opts.reserved?.has(a.id) && !a.done(s) && (!this.claims.has(a.id) || this.claims.get(a.id) === m.id) && !this.blockedBy(a) && (m.coolUntil[a.id] ?? 0) <= s.elapsed);
    for (const a of ok) this.readyAt[a.id] ??= s.elapsed;
    for (const k of Object.keys(this.readyAt)) if (!ok.some((a) => a.id === k)) delete this.readyAt[k];
    const mine = ok.filter((a) => m.role === 'any' || a.role === m.role);
    if (any) return mine.length ? mine : ok;
    const helped = ok.filter((a) => s.elapsed - (this.readyAt[a.id] ?? s.elapsed) > 5);       // teammates only cover for each other after a pause
    return mine.length ? mine : helped;
  }
  private tickWaits(): void {
    const s = this.s; const w = (s.data.__waits ??= {} as Record<string, number>);
    for (const a of this.actions) if (a.kind === 'wait' && w[a.id] === undefined && a.after.every((d) => this.byId.get(d)?.done(s))) w[a.id] = s.elapsed;
  }

  // ------------------------------------------------------------ the loop ----
  update(dt: number): void {
    const s = this.s; if (s.complete) return;
    this.tickWaits(); this.watchdog();
    for (const m of this.live()) {
      if (m.external) m.pos = m.external.pos(); else if (m.id !== 'you') this.recover(m, dt);
      switch (m.phase) {
        case 'idle': this.idle(m, dt); break;
        case 'walking': this.walk(m, dt); break;
        case 'working': m.workLeft -= m.id === 'you' ? dt : dt / (fatigueOf(m.focus) === 'tired' ? 1.5 : 1); if (m.workLeft <= 0) this.perform(m); break;
        case 'settle': m.settle -= dt; if (m.settle <= 0) this.afterPerform(m); break;
        case 'waiting': if (!m.pending || m.pending.resolved) { m.pending = null; m.phase = 'settle'; m.settle = 0.5; m.note = 'Checking the result'; } break;
        case 'blocked': m.idleFor += dt; if (m.idleFor > 6) this.stop(m, m.auto ? 'Looking for work' : 'Standing by'); break;
      }
      m.moving = m.phase === 'walking';
    }
  }

  /** Focus returns while idle or blocked, and much faster on a break. Walking and working are paid for per action instead. */
  private recover(m: Member, dt: number): void {
    if (m.resting) { m.focus = Math.min(100, m.focus + REST_RECOVERY * dt); if (m.focus >= REST_UNTIL) { m.resting = false; m.note = m.auto ? 'Looking for work' : 'Back from the break'; this.s.changed(); } return; }
    if (m.phase === 'idle' || m.phase === 'blocked' || m.phase === 'waiting') m.focus = Math.min(100, m.focus + IDLE_RECOVERY * dt);
  }
  private spend(m: Member, n: number): void { if (m.id === 'you') return; m.focus = Math.max(0, m.focus - n); m.spent += n; this.s.stats.effort = Math.round((this.s.stats.effort + n) * 10) / 10; }

  private idle(m: Member, dt: number): void {
    if (m.resting) return;
    if (m.task) return this.begin(m);
    if (!m.auto) return;
    m.idleFor += dt; if (m.idleFor < 0.4) return;
    if (m.id !== 'you' && m.focus < 15) { this.rest(m.id); return; }                      // Auto teammates look after themselves
    const pick = this.available(m).find((a) => m.id === 'you' || m.focus >= effortCost(a, m)) ?? null;
    if (!pick && m.id !== 'you' && this.available(m).length && m.focus < 60) { this.rest(m.id); return; }
    if (!pick) { m.note = this.actions.every((a) => a.done(this.s) || a.kind === 'wait') ? 'All done: file the report' : 'Standing by: nothing ready yet'; return; }
    this.claims.set(pick.id, m.id); m.claimed = pick.id; m.task = pick; m.manual = false; this.begin(m);
  }

  private begin(m: Member): void {
    const a = m.task!, s = this.s;
    m.idleFor = 0;
    const where = a.target;
    if (!where) { m.phase = 'working'; m.workLeft = 0.5; return; }
    const from = this.cellOf(m);
    const st = standFor(where, from, s.passes);
    if (!st) { return this.block(m, a, `can't find a way to ${describeTarget(where)?.name ?? 'the target'} (missing a pass?)`); }
    m.path = st.path; m.phase = 'walking'; m.walkIssued = false;
    m.note = st.path.length ? `Heading to ${describeTarget(where)?.name}` : `At ${describeTarget(where)?.name}`;
    if (m.external && st.path.length) { m.external.walkTo(st.goal); m.walkIssued = true; }
  }

  private cellOf(m: Member): Cell { return m.external ? m.external.cell() : { x: Math.floor(m.pos.x), y: Math.floor(m.pos.y) }; }

  private walk(m: Member, dt: number): void {
    const a = m.task!, target = a.target!;
    if (m.external) {
      if (!m.walkIssued) { const st = standFor(target, this.cellOf(m), this.s.passes); if (!st) return this.block(m, a, 'no route'); m.external.walkTo(st.goal); m.walkIssued = true; return; }
      if (!m.external.idle()) return;
      return this.arrive(m);
    }
    const walk = walkableFor(this.s.passes);
    let budget = WALK_SPEED * dt;
    while (budget > 0 && m.path.length) {
      const nx = m.path[0];
      if (!walk(nx.x, nx.y)) { m.path = []; const st = standFor(target, this.cellOf(m), this.s.passes); if (!st) return this.block(m, a, 'the door closed behind them'); m.path = st.path; continue; }
      const tx = nx.x + 0.5, ty = nx.y + 0.5, dx = tx - m.pos.x, dy = ty - m.pos.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) m.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'se' : 'nw') : (dy > 0 ? 'sw' : 'ne');
      if (d <= budget) { m.pos = { x: tx, y: ty }; m.path.shift(); budget -= d; this.enter(m); }
      else { m.pos = { x: m.pos.x + (dx / d) * budget, y: m.pos.y + (dy / d) * budget }; budget = 0; }
    }
    if (!m.path.length) this.arrive(m);
  }
  private enter(m: Member): void {
    this.spend(m, WALK_EFFORT);
    const cx = Math.floor(m.pos.x), cy = Math.floor(m.pos.y);
    if (GRID.kind[cy]?.[cx] === 'room') { const r = roomAt(cx, cy); if (r) this.runner.onEnterRoom(r.id); }
  }
  private arrive(m: Member): void {
    const a = m.task!;
    if (a.target && !reachRange(a.target, m.pos.x, m.pos.y).ok) return this.block(m, a, 'could not get close enough');
    m.phase = 'working'; m.note = `${this.verb(a)}…`;
    const quick = m.role === 'any' || m.manual || a.role === m.role;
    m.workLeft = (a.kind === 'contain' || a.kind === 'release' ? 1.6 : 1.1) * (quick ? 1 : 1.8);
    if (m.external && a.tool && a.tool !== 'e') m.external.pose(a.tool);
  }
  private verb(a: PlayAction): string {
    switch (a.kind) {
      case 'pass': return 'Requesting a pass'; case 'contain': return 'Containing'; case 'release': return 'Releasing'; case 'reroute': return 'Rerouting';
      case 'record': return 'Recording the result'; case 'report': return 'Filing the report';
      default: return a.tool === 'e' ? 'Reading' : a.tool ? TOOL_BY_ID[a.tool as ToolId].short.replace(/\.$/, '') : 'Working';
    }
  }

  private perform(m: Member): void {
    const a = m.task!, s = this.s, r = this.runner;
    s.log(`${m.name}: ${a.label}.`, 'info');
    this.acting = m; this.spend(m, effortCost(a, m));
    try { performAction(r, a); } finally { this.acting = null; }
    if (!m.manual) s.stats.autoActions++;
    m.phase = 'settle'; m.settle = 0.5; m.note = 'Checking the result';
  }

  private afterPerform(m: Member): void {
    const a = m.task!, s = this.s;
    if (m.pending && !m.pending.resolved) { m.phase = 'waiting'; m.note = `Waiting for your call: ${m.pending.title}`; return; }
    if (a.done(s) || a.id.startsWith('manual:')) {
      m.done++; this.release(m);
      m.note = `Done: ${a.label}`; m.phase = 'idle'; m.idleFor = 0.2;
      return;
    }
    const n = (m.fails[a.id] = (m.fails[a.id] ?? 0) + 1);
    const why = s.latestResult?.text ?? 'it did not work yet';
    if (n >= 2) { m.coolUntil[a.id] = s.elapsed + 25; this.block(m, a, why); }
    else { m.phase = 'idle'; m.idleFor = 0; m.note = 'Trying again'; }
  }

  private block(m: Member, a: PlayAction, why: string): void {
    m.phase = 'blocked'; m.idleFor = 0; m.note = `Stuck on "${a.label}": ${why}`;
    m.coolUntil[a.id] = this.s.elapsed + 25;
    this.release(m);
    if (!this.inbox.some((i) => i.kind === 'alert' && i.title === a.label && !i.resolved)) this.push({ id: ++this.seq, member: m.name, kind: 'alert', title: `${m.name} is stuck`, text: `${a.label}: ${why}`, t: this.s.fmtClock() });
  }

  private release(m: Member): void {
    if (m.claimed) this.claims.delete(m.claimed);
    m.claimed = null; m.task = null; m.manual = false; m.pending = null;
  }
  private stop(m: Member, note: string): void { this.release(m); m.phase = 'idle'; m.path = []; m.note = note; m.idleFor = 0; }
}
