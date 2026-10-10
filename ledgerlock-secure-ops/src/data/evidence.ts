import type { EvidenceDef } from '../game/types';

/** Evidence items for the tutorial. All data is synthetic and masked. */
export const EVIDENCE: EvidenceDef[] = [
  { id: 'ev_masked_receipt', name: 'Masked receipt R-77••', sourceRoom: 'card_payments', requiredPass: 'payments_audit_pass', sensitivity: 'Masked card data (synthetic)', objective: 'o_receipt', pathStep: 'card_payments' },
  { id: 'ev_replay_trace', name: 'Replay trace for R-77••', sourceRoom: 'event_stream', requiredPass: 'event_trace_pass', sensitivity: 'Event metadata only', objective: 'o_trace', pathStep: 'event_stream' },
  { id: 'ev_ledger_check', name: 'Masked ledger entries', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked ledger data (synthetic)', objective: 'o_ledger', pathStep: 'finance_core' },
  { id: 'ev_fabric_freshness', name: 'Fabric freshness check', sourceRoom: 'fabric_platform', requiredPass: 'fabric_observer_pass', sensitivity: 'Synthetic pipeline status', objective: 'o_fabric', pathStep: 'fabric_platform' },
];
export const EVIDENCE_BY_ID = Object.fromEntries(EVIDENCE.map((e) => [e.id, e]));
