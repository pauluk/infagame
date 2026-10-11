import type { PaletteKey } from './constants';

export type RoomId =
  | 'api_gateway' | 'event_stream' | 'fabric_platform' | 'integration_exchange'
  | 'service_payments' | 'finance_core' | 'payment_orchestration' | 'bacs_vault'
  | 'secure_ops' | 'card_payments' | 'debt_recovery' | 'agency_handoff'
  | 'audit_gallery' | 'payroll_pensions' | 'expense_claims' | 'bcp_command';

export type ExternalId = 'bank_sim' | 'card_network_sim' | 'agency_sim' | 'reporting_display';

export type PassId =
  | 'ops_pass' | 'service_audit_pass' | 'api_audit_pass' | 'payments_audit_pass' | 'event_trace_pass'
  | 'ledger_read_pass' | 'payment_ops_pass' | 'bacs_audit_pass' | 'debt_read_pass'
  | 'agency_audit_pass' | 'fabric_observer_pass' | 'integration_audit_pass'
  | 'audit_gallery_pass' | 'staff_office_pass' | 'expense_audit_pass' | 'bcp_pass'
  | 'maintenance_pass' | 'courier_pass'   // open optional maintenance shortcuts, never a required route
  | 'token_rotation_pass';        // special: time-limited rotation approval (opens no door)

/** A service manager at the Bronze table: who they are, how their service is doing and what they say. */
export interface MeetingAttendee { name: string; role: string; service: string; status: 'ok' | 'warn' | 'bad'; says: string }

export type Side = 'n' | 'e' | 's' | 'w';
export interface Cell { x: number; y: number }
export type Pt = [number, number];

export interface PropDef {
  id: string;                 // prop:<room>.<key>
  key: string;
  room: RoomId;
  sprite: string;             // atlas frame name
  atlas: 'props';
  gx: number; gy: number;     // absolute cell
  name: string;
  desc: string;
  interactive: boolean;
  blocks: boolean;
}

export interface DoorDef {
  id: string;                 // door:<room>.<link id>
  room: RoomId;               // the room this door belongs to / leads into
  side: Side;
  cells: [Cell, Cell];        // two cells in the room's wall line
  toward: string;             // the graph node (room or junction id) at the other end of the corridor outside
  readerCell: Cell;           // wall cell carrying the access reader
  link: string;               // the facility-graph link (corridor) this door opens onto
}

export interface RoomDef {
  id: RoomId;
  code: string;               // A1..D3
  name: string;
  wing: import('../data/rooms').Wing;
  x0: number; y0: number; w: number; h: number;
  accent: PaletteKey;
  blurb: string;
  requiredPass: PassId;
  scope: string;
  doors: DoorDef[];
  props: PropDef[];
}

export interface ExternalDef { id: ExternalId; name: string; x: number; y: number; w: number; h: number; sprite: string; color: PaletteKey; blurb: string }

export type RouteType = 'request' | 'outbound_payment' | 'return' | 'settlement' | 'debt_export' | 'agency_return' | 'analytics' | 'event';
export type RouteState = 'healthy' | 'delayed' | 'suspicious' | 'quarantined' | 'rerouted' | 'restored';

export interface RouteDef {
  id: string;
  name: string;
  type: RouteType;
  color: PaletteKey;
  hops: string[];             // room ids, external ids or prop ids (prop:...)
  owner: string;
  desc: string;
  impact: string;
  speed: number;              // pulses: fraction of route per second
  lane: number;               // lateral offset in cells so overlapping routes separate
  dashed?: boolean;
  missionSpecific?: boolean;
}

export interface EvidenceDef {
  id: string;
  name: string;
  sourceRoom: RoomId;
  requiredPass: PassId;
  sensitivity: string;
  objective: string;
  /** rooms in the evidence path shown on the Evidence Board */
  pathStep: RoomId;
}

export type ToolId = 'scanner' | 'lens' | 'quarantine' | 'patch' | 'token' | 'restore' | 'recon' | 'reroute';
export interface ToolDef { id: ToolId; key: number; name: string; icon: string; sprite: string; short: string; blurb: string; why: string }

export type Tone = 'info' | 'good' | 'warn' | 'bad' | 'clue' | 'alert';

export interface Impact { label: string; text: string; tone: Tone }
export type DialogSpec =
  | { type: 'confirm'; title: string; body: string; why?: string; impacts: Impact[]; confirmLabel: string; onConfirm: () => void }
  | { type: 'timeline'; title: string; steps: { time: string; text: string; tone: Tone }[]; conclusion: string; onClose?: () => void }
  | { type: 'choice'; title: string; body: string; options: { id: string; label: string; detail: string }[]; onChoose: (id: string) => void }
  | { type: 'meeting'; title: string; body: string; attendees: MeetingAttendee[]; options: { id: string; label: string; detail: string; backers?: string[] }[]; confirmLabel?: string; onChoose: (id: string) => void }
  | { type: 'emergency'; title: string; role: string; tab: string; autoSolve: () => void }
  | { type: 'info'; title: string; body: string; rows?: [string, string][]; compare?: { before: [string, string][]; after: [string, string][] } }
  | { type: 'alert' }
  | { type: 'access'; readerRoom?: RoomId; door?: string }
  | { type: 'board' }
  | { type: 'confidence' }
  | { type: 'goals' };

export interface ResultCard { title: string; text: string; tone: Tone; hint?: boolean }

export interface ScoreEvent { t: number; label: string; points?: number; tone: Tone }
