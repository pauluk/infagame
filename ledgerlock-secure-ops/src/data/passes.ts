import type { PassId, RoomId } from '../game/types';

export interface PassDef { id: PassId; name: string; room: RoomId; scope: string; hint: string; special?: boolean; minutes?: number }

/** Fictional, mission-scoped, read-only passes. They expire when the mission ends. */
export const PASSES: Record<PassId, PassDef> = {
  ops_pass: { id: 'ops_pass', name: 'Ops Pass', room: 'secure_ops', scope: 'Control Room and common corridors', hint: 'Issued to every Secure Ops engineer at the start of a shift.' },
  service_audit_pass: { id: 'service_audit_pass', name: 'Service Audit Pass', room: 'service_payments', scope: 'Read-only, masked payment-request evidence', hint: 'Request this when evidence points at payment-request intake.' },
  api_audit_pass: { id: 'api_audit_pass', name: 'API Audit Pass', room: 'api_gateway', scope: 'Read-only request and authentication metadata', hint: 'Request this when evidence points at gateway requests or authentication.' },
  payments_audit_pass: { id: 'payments_audit_pass', name: 'Payments Audit Pass', room: 'card_payments', scope: 'Read-only, masked card-receipt evidence', hint: 'Request this when an alert points at card receipts.' },
  event_trace_pass: { id: 'event_trace_pass', name: 'Event Trace Pass', room: 'event_stream', scope: 'Read-only event metadata and replay trace', hint: 'Request this when a clue points at the event stream or a replay.' },
  ledger_read_pass: { id: 'ledger_read_pass', name: 'Ledger Read Pass', room: 'finance_core', scope: 'Read-only, masked ledger and reconciliation data', hint: 'Request this when evidence suggests a posting problem in the ledger.' },
  payment_ops_pass: { id: 'payment_ops_pass', name: 'Payment Ops Pass', room: 'payment_orchestration', scope: 'Read-only batch and queue metadata', hint: 'Request this when a payment batch or queue looks wrong.' },
  bacs_audit_pass: { id: 'bacs_audit_pass', name: 'BACS Audit Pass', room: 'bacs_vault', scope: 'Read-only file metadata and simulated bank-response status', hint: 'Request this when evidence points at staged payment files.' },
  debt_read_pass: { id: 'debt_read_pass', name: 'Debt Read Pass', room: 'debt_recovery', scope: 'Read-only masked debt and receipt evidence', hint: 'Request this when evidence points at debt records or receipts.' },
  agency_audit_pass: { id: 'agency_audit_pass', name: 'Agency Audit Pass', room: 'agency_handoff', scope: 'Read-only transfer manifest and delivery receipt', hint: 'Request this when an agency export looks wrong.' },
  fabric_observer_pass: { id: 'fabric_observer_pass', name: 'Fabric Observer Pass', room: 'fabric_platform', scope: 'Read-only synthetic Bronze/Silver/Gold pipeline status', hint: 'Request this once a fix is ready to verify in reporting.' },
  token_rotation_pass: { id: 'token_rotation_pass', name: 'Token Rotation Pass', room: 'secure_ops', scope: 'Time-limited approval to rotate one simulated service credential via the Access Desk', hint: 'Request this once you know which service credential may be exposed.', special: true, minutes: 12 },
  integration_audit_pass: { id: 'integration_audit_pass', name: 'Integration Audit Pass', room: 'integration_exchange', scope: 'Read-only transfer status and routing metadata', hint: 'Request this when evidence points at a secure transfer.' },
};
export const PASS_BY_ROOM = Object.fromEntries(Object.values(PASSES).filter((p) => !p.special).map((p) => [p.room, p.id])) as Record<RoomId, PassId>;
