import type { DialogSpec, PassId, ResultCard, RoomId, RouteState, ScoreEvent, ToolId, Tone } from '../types';
import { Emitter } from './Emitter';
import type { MissionDef } from '../../data/missions/types';
import { initialRouteStates } from '../../data/routes';
import type { FabricSnapshot } from '../../integrations/fabric/FabricDataProvider';

export const SECONDS_PER_GAME_MINUTE = 8;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface Entity {
  id: string; kind: 'bug' | 'malware' | 'wisp' | 'corrupt' | 'ghost';
  label: string; room?: RoomId; gx?: number; gy?: number;
  route?: string; p?: number; held?: boolean;
  visible: boolean; mood?: 'active' | 'fixed';
}
export interface LogEntry { t: string; text: string; tone: Tone }
export type Status = 'suspect' | 'bad' | 'ok' | 'fixed';

export type StateEvents = {
  change: GameState;
  log: LogEntry;
  result: ResultCard;
  dialog: DialogSpec;
  fx: { type: 'scan' | 'sparkle' | 'alarm' | 'barrier' | 'release' | 'pass' | 'repair'; target: string };
  ui: 'map' | 'log' | 'fabric' | 'blueprint' | 'board';
  complete: GameState;
  pass: { pass: PassId; granted: boolean };
};

/** Pure game state: no Phaser/DOM references. Scenes and the DOM UI subscribe to its events. */
export class GameState extends Emitter<StateEvents> {
  flags: Record<string, boolean> = {};
  clues = new Map<string, { label: string; text: string; t: string; room: RoomId | null }>();
  evidence = new Set<string>();
  evidenceTimes: Record<string, { t: string; room: RoomId | null }> = {};
  passes = new Set<PassId>(['ops_pass']);
  passDenials = 0;
  entities: Record<string, Entity> = {};
  status: Record<string, Status> = {};
  contained: Record<string, { rerouted: boolean; since: number }> = {};
  routeMarks: Record<string, RouteState | undefined> = {};
  routeStates: Record<string, RouteState> = initialRouteStates();
  hits: Record<string, { availability: number; until?: number }> = {};
  data: Record<string, any> = {};
  integrity = 100;
  protection = 100;
  recovery = 70;                  // recovery readiness
  audit = 40;                     // audit quality
  affected: Record<string, string> = {};     // route/room -> worst state it reached (for the debrief)
  passExpiry: Record<string, number> = {};   // pass -> elapsed seconds when it expires
  revoked: PassId[] = [];
  recordsMade: string[] = [];
  freshness = 2;
  incidents = 1;
  elapsed = 0;
  logEntries: LogEntry[] = [];
  scoreEvents: ScoreEvent[] = [];
  stats = { jevCalls: 0, jevFollowed: 0, autoActions: 0, orders: 0, toolUses: 0, unnecessary: 0, availSum: 0, availTime: 0, minAvail: 100, hintsUsed: 0, passDenials: 0, maskedOnly: true };
  selectedTool: ToolId = 'scanner';
  selectedTarget: string | null = null;
  paused = false;
  /** Tutorial mode: guided coaching, hints are free, incidents run slower, stretch goals are not counted. */
  tutorial = false;
  complete = false;
  /** Auto-play / team mode: game speed multiplier (1, 2 or 4). */
  speed = 1;
  /** Team controller hook: may take over a dialog raised by a teammate's action. Returns true when it handled it. */
  decide?: (spec: DialogSpec) => boolean;
  fabricSnapshot: FabricSnapshot | null = null;
  latestResult: ResultCard | null = null;
  player = { x: 0, y: 0, room: null as RoomId | null };

  constructor(public mission: MissionDef, public relaxed = false) { super(); }

  get availability(): number {
    let loss = 0;
    for (const h of Object.values(this.hits)) loss += h.availability || 0;
    return clamp(Math.round(100 - loss));
  }
  get clockMinutes(): number { return this.mission.startClock + this.elapsed / SECONDS_PER_GAME_MINUTE; }
  get deadlineLeft(): number { return this.mission.deadlineClock - this.clockMinutes; }
  fmtClock(m = this.clockMinutes): string {
    const t = Math.floor(m);
    return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  changed(): void { this.emit('change', this); }
  setFlag(k: string, v = true): void { if (this.flags[k] !== v) { this.flags[k] = v; this.changed(); } }
  adjust(metric: 'integrity' | 'protection' | 'recovery' | 'audit', d: number): void { this[metric] = clamp(this[metric] + d); this.changed(); }
  setStatus(target: string, st: Status | undefined): void { if (st) this.status[target] = st; else delete this.status[target]; this.changed(); }
  addClue(id: string, label: string, text: string): boolean {
    if (this.clues.has(id)) return false;
    this.clues.set(id, { label, text, t: this.fmtClock(), room: this.player.room }); this.changed(); return true;
  }
  log(text: string, tone: Tone = 'info'): void {
    const e = { t: this.fmtClock(), text, tone }; this.logEntries.push(e); this.emit('log', e);
  }
  score(label: string, tone: Tone = 'info', points?: number): void {
    this.scoreEvents.push({ t: Math.round(this.elapsed), label, tone, points });
  }
  setEntity(id: string, patch: Partial<Entity>): void {
    const base: Entity = this.entities[id] ?? { id, kind: 'bug', label: id, visible: true };
    this.entities[id] = { ...base, ...patch, id } as Entity; this.changed();
  }
  removeEntity(id: string): void { delete this.entities[id]; this.changed(); }
}
