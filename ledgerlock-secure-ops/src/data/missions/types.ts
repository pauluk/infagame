import type { EvidenceDef, PassId, RoomId, ToolId, Tone, DialogSpec, ResultCard } from '../../game/types';
import type { GameState } from '../../game/systems/GameState';
import type { TargetInfo } from '../targets';

export interface MissionApi {
  s: GameState;
  data: Record<string, any>;
  flag(k: string, v?: boolean): void;
  has(k: string): boolean;
  say(title: string, text: string, tone?: Tone, extra?: { hint?: boolean }): void;
  clue(id: string, label: string, text: string): void;
  evidence(id: string): boolean;                       // retrieve evidence (checks the room pass)
  status(target: string, st: 'suspect' | 'bad' | 'ok' | 'fixed' | undefined): void;
  adjust(metric: 'integrity' | 'protection', d: number, why?: string): void;
  hit(key: string, availability: number, seconds?: number): void;
  entity(id: string, patch: Record<string, unknown>): void;
  removeEntity(id: string): void;
  fx(type: 'scan' | 'sparkle' | 'alarm' | 'barrier' | 'release' | 'pass' | 'repair', target: string): void;
  dialog(spec: DialogSpec): void;
  log(text: string, tone?: Tone): void;
  unnecessary(): void;
  contain(target: string): void;
  release(target: string): void;
  isContained(target: string): boolean;
  routeMark(routeId: string, state: 'suspicious' | 'restored' | undefined): void;
  score(label: string, tone?: Tone, points?: number): void;
}

export interface Rule {
  tool: ToolId;
  target: string | string[] | ((id: string) => boolean);
  requires?: (s: GameState) => true | string;
  confirm?: (s: GameState) => { title: string; body: string; impacts: { label: string; text: string; tone: Tone }[]; confirmLabel?: string } | null;
  run: (a: MissionApi, t: TargetInfo) => void;
}

export interface ContainmentCfg {
  availability: number;
  narrow: number;                                      // 0..1 how narrow the containment is (for scoring)
  effective?: boolean;                                 // stops the harm
  notes: { label?: string; text: string; tone?: Tone }[];
  applyText?: string;
  canRelease?: (s: GameState) => true | string;
  canReroute?: boolean;
  onApply?: (a: MissionApi) => void;
  onRelease?: (a: MissionApi) => void;
  onReroute?: (a: MissionApi) => void;
}

export interface ObjectiveDef { id: string; text: string; hint: string; done: (s: GameState) => boolean }

export interface Debrief { what: string; response: string[]; learn: string }

export interface MissionDef {
  id: string; title: string; tagline: string;
  status: 'playable' | 'outline';
  difficulty: string;
  startRoom: RoomId;
  startClock: number; deadlineClock: number; deadlineLabel: string;
  alert: { severity: string; headline: string; symptoms: string[]; impact: string; points: RoomId };
  briefing: string[];
  objectives: ObjectiveDef[];
  /** Pass requests are granted only when the evidence justifies them. */
  passGrants: Partial<Record<PassId, { when: (s: GameState) => boolean; hint: string }>>;
  setup?: (a: MissionApi) => void;
  tick?: (a: MissionApi, dt: number) => void;
  rules: Rule[];
  interactions?: Record<string, (a: MissionApi, t: TargetInfo) => void>;
  containment: Record<string, ContainmentCfg>;
  isComplete: (s: GameState) => boolean;
  /** Evidence Board: may the player file the report yet? Returns true or the reason it is not ready. */
  canReport: (s: GameState) => true | string;
  incidents: (s: GameState) => number;
  scoreInput: (s: GameState) => ScoreInput;
  debrief: (s: GameState) => Debrief;
  /** Evidence path (room ids) shown on the Evidence Board. */
  evidencePath: RoomId[];
  evidence: EvidenceDef[];
  /** rooms that should have a highlighted incident route on the minimap */
  incidentRoute?: string;
  /** Outline missions describe clues/choices/success for the mission select screen. */
  outline?: { objective: string; clues: string[]; choices: string[]; success: string; debrief: string };
  parSeconds: number;
}

export interface ScoreInput {
  diagnosed: boolean; verified: boolean; reconciled: boolean;
  narrow: number; privacyOk: boolean;
}
export type { ResultCard };
