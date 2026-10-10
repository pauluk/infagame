import type { RoomId, RouteState } from '../../game/types';

/** Incident Board data. Every board task is plain data: deterministic, solvable from the evidence, with no random elements. */
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type KanbanStatus = 'new' | 'triage' | 'investigating' | 'contained' | 'fixing' | 'verifying' | 'closed';
export const KANBAN: { id: KanbanStatus; label: string; blurb: string }[] = [
  { id: 'new', label: 'New', blurb: 'Raised, not yet looked at' },
  { id: 'triage', label: 'Triage', blurb: 'Shift briefed, scope being decided' },
  { id: 'investigating', label: 'Investigating', blurb: 'Collecting and reading evidence' },
  { id: 'contained', label: 'Contained', blurb: 'Harm stopped, narrowly' },
  { id: 'fixing', label: 'Fixing', blurb: 'The cause is being corrected' },
  { id: 'verifying', label: 'Verifying', blurb: 'Fix applied: prove it is safe' },
  { id: 'closed', label: 'Closed', blurb: 'Verified and done' },
];
export const KANBAN_RANK = Object.fromEntries(KANBAN.map((c, i) => [c.id, i])) as Record<KanbanStatus, number>;

export type PuzzleType = 'cable' | 'match' | 'missing' | 'verify';
export type Shape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hex' | 'pill';

export interface Port { id: string; label: string; detail?: string; side: 'source' | 'dest' }
export interface Piece { id: string; label: string; detail?: string; shape: Shape; /** Plain-English reason it is (or is not) what a slot asks for. */ why: string }
export interface Slot { id: string; label: string; detail?: string }
/** One line of an expected-versus-current checklist. `problem` is set when the item is missing or out of place: it explains the impact. */
export interface MissingItem { id: string; label: string; expected: string; current: string; problem?: string; okWhy: string }
export interface VerifyCard { id: string; label: string; detail: string; confirms: boolean; why: string }

export type PuzzleLayout =
  | { type: 'cable'; ports: Port[] }
  | { type: 'match'; pieces: Piece[]; slots: Slot[] }
  | { type: 'missing'; expectedTitle: string; currentTitle: string; items: MissingItem[] }
  | { type: 'verify'; before: [string, string][]; after: [string, string][]; cards: VerifyCard[] };

export interface IncidentDef {
  incidentId: string;
  missionId: string;
  title: string;
  severity: Severity;
  sourceRoom: RoomId;
  affectedRouteIds: string[];
  /** Column the card starts in. */
  kanbanStatus: KanbanStatus;
  evidenceIds: string[];
  /** Plain-English summary of what each evidence item shows (the evidence panel also shows source, pass and time). */
  evidenceNotes: Record<string, string>;
  keyObjective: string;
  prompt: string;
  puzzleType: PuzzleType;
  puzzlePieces: PuzzleLayout;
  /** cable: [sourcePortId, destPortId] pairs that make up the safe route. */
  validConnections?: [string, string][];
  /** match: pieceId -> slotId. A piece with no entry is a decoy. */
  correctMatches?: Record<string, string>;
  /** Progressive hints, then the evidence/clue ids the solution depends on (used by "Show me the next clue"). */
  hintText: string[];
  clueOrder: string[];
  /** Keyed by "src>dst" (cable), "pieceId@slotId" (match), or an item/card id; `default` is the fallback. */
  failureFeedback: Record<string, string> & { default: string };
  successFeedback: string;
  /** Playbook action ids carried out for real when the task is solved (they change the mission state and routes). */
  actions: string[];
  /** World actions that still have to happen before the card can reach Verifying (done by hand or by teammates). */
  fixActions?: string[];
  /** Mission goal ids that must be done before the card can be Closed (the verification objective). */
  requiredObjectives: string[];
  /** Route or prop that must be contained for the card to reach Contained. */
  containTarget?: string;
  /** What the affected route should look like once the task is solved (checked by tests, produced by the real actions). */
  routeStateOnSuccess?: { routeId: string; state: RouteState };
}
