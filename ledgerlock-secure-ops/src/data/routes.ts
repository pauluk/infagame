import type { Pt, RouteDef, RouteState } from '../game/types';
import { EXTERNAL_BY_ID, ROOM_BY_ID, roomCentre } from './map';
import type { RoomId } from '../game/types';

/**
 * Logical finance routes. They are an overlay: they never block movement and are not corridors.
 * IDs come from the design brief; `receipt_event_feed` is the one mission-specific addition (the replay path
 * used by "The Duplicate Ghost"; it carries card receipt events through the Event Stream Hall into the ledger).
 */
export const ROUTES: RouteDef[] = [
  { id: 'service_payment_intake', name: 'Service Payment Intake', type: 'request', color: 'cyan', owner: 'Platform Integration',
    hops: ['service_payments', 'api_gateway', 'finance_core'], speed: 0.07, lane: 0,
    desc: 'Service payment requests pass the API Gateway, are validated, and flow into Finance Core and the ledger.',
    impact: 'If disrupted, new service payment requests queue and postings to the ledger are delayed.' },
  { id: 'supplier_payment_release', name: 'Supplier Payment Release', type: 'outbound_payment', color: 'blue', owner: 'Payment Operations',
    hops: ['finance_core', 'payment_orchestration', 'bacs_vault', 'bank_sim'], speed: 0.06, lane: 0.35,
    desc: 'Approved payment batches flow through Payment Orchestration into the BACS Vault, then to the simulated bank.',
    impact: 'If disrupted, approved batches wait and the payment run deadline is at risk.' },
  { id: 'bank_response_reconciliation', name: 'Bank Response Reconciliation', type: 'return', color: 'mint', owner: 'Payment Operations', dashed: true,
    hops: ['bank_sim', 'bacs_vault', 'payment_orchestration', 'finance_core'], speed: 0.06, lane: -0.35,
    desc: 'Simulated bank responses return through the vault for reconciliation in Finance Core.',
    impact: 'If disrupted, failed payments may go unnoticed until reconciliation catches up.' },
  { id: 'card_receipt', name: 'Card Receipt', type: 'settlement', color: 'mint', owner: 'Card Services',
    hops: ['card_network_sim', 'card_payments', 'debt_recovery', 'finance_core'], speed: 0.065, lane: 0,
    desc: 'Simulated card payments settle in Card Payments and post as receipts through Accounts Receivable to the General Ledger.',
    impact: 'If disrupted, valid card receipts are delayed and debts may look unpaid.' },
  { id: 'debt_agency_export', name: 'Debt Agency Export', type: 'debt_export', color: 'violet', owner: 'Debt Recovery Team',
    hops: ['debt_recovery', 'integration_exchange', 'agency_handoff', 'agency_sim'], speed: 0.055, lane: 0.3,
    desc: 'Approved debt records are exported through the Integration Exchange to the fictional agency (controlled hand-off).',
    impact: 'If disrupted, agency exports pause. Holding it is safe for records already approved.' },
  { id: 'agency_receipt', name: 'Agency Receipt', type: 'agency_return', color: 'violet', owner: 'Debt Recovery Team', dashed: true,
    hops: ['agency_sim', 'agency_handoff', 'integration_exchange', 'debt_recovery', 'finance_core'], speed: 0.055, lane: -0.3,
    desc: 'Delivery receipts and recoveries from the fictional agency return to Debt Recovery and Finance Core.',
    impact: 'If disrupted, recoveries are posted late.' },
  { id: 'expense_payment', name: 'Expense Claim Payment', type: 'outbound_payment', color: 'mint', owner: 'Payroll Operations',
    hops: ['expense_claims', 'payroll_pensions', 'payment_orchestration', 'bacs_vault', 'bank_sim'], speed: 0.05, lane: -0.15,
    desc: 'Approved expense claims leave Expense Claims for the payroll system, are batched with salaries in Payment Orchestration, then go through the BACS Vault to the simulated bank.',
    impact: 'If disrupted, staff are reimbursed late. Holding it is safe: nothing is lost, it simply waits for the next payroll run.' },
  { id: 'finance_event_mirror', name: 'Finance Event Mirror', type: 'analytics', color: 'periwinkle', owner: 'Data Platform',
    hops: ['finance_core', 'event_stream', 'fabric_platform', 'prop:fabric_platform.bronze', 'prop:fabric_platform.silver', 'prop:fabric_platform.gold', 'reporting_display'], speed: 0.06, lane: 0,
    desc: 'Finance and system events are mirrored through the Event Stream Hall into Fabric Bronze, Silver and Gold, then the reporting display.',
    impact: 'If disrupted, reporting goes stale and Fabric data freshness rises.' },
  { id: 'receipt_event_feed', name: 'Receipt Event Feed', type: 'event', color: 'cyan', owner: 'Event Platform', missionSpecific: true,
    hops: ['card_payments', 'event_stream', 'finance_core'], speed: 0.05, lane: -0.5,
    desc: 'Card receipt events travel from Card Payments through the Event Stream Hall to Finance Core, where they post to the ledger.',
    impact: 'If contained, valid receipts queue (not lost). Replays are held. Other routes are unaffected.' },
];
export const ROUTE_BY_ID = Object.fromEntries(ROUTES.map((r) => [r.id, r])) as Record<string, RouteDef>;

export const initialRouteStates = (): Record<string, RouteState> => Object.fromEntries(ROUTES.map((r) => [r.id, 'healthy' as RouteState]));

/** All rooms (ids) a route passes through, in order. Externals and props map to their room where known. */
export function routeRooms(r: RouteDef): RoomId[] {
  const out: RoomId[] = [];
  for (const h of r.hops) {
    let id: string | null = null;
    if (h.startsWith('prop:')) id = h.split(':')[1].split('.')[0];
    else if (ROOM_BY_ID[h as RoomId]) id = h;
    if (id && !out.includes(id as RoomId)) out.push(id as RoomId);
  }
  return out;
}

function anchor(h: string): Pt {
  if (h.startsWith('prop:')) {
    const [room, key] = h.slice(5).split('.');
    const p = ROOM_BY_ID[room as RoomId].props.find((q) => q.key === key)!;
    return [p.gx + 0.5, p.gy + 0.5];
  }
  const ext = EXTERNAL_BY_ID[h];
  if (ext) return [ext.x + ext.w / 2, ext.y + ext.h / 2];
  const c = roomCentre(h as RoomId);
  return [c[0], c[1]];
}

/** Orthogonal polyline (grid coordinates, cell centres) for a route; elbows go horizontal-first. */
export function routePoints(r: RouteDef): Pt[] {
  const anchors = r.hops.map(anchor);
  const pts: Pt[] = [];
  const push = (p: Pt) => { const l = pts[pts.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 1e-6 || Math.abs(l[1] - p[1]) > 1e-6) pts.push(p); };
  anchors.forEach((a, i) => {
    const q: Pt = [a[0] + r.lane, a[1] + r.lane];
    if (i === 0) { push(q); return; }
    const prev = pts[pts.length - 1];
    if (Math.abs(prev[0] - q[0]) > 1e-6 && Math.abs(prev[1] - q[1]) > 1e-6) push([q[0], prev[1]]);
    push(q);
  });
  return pts;
}
export function polylineLength(pts: Pt[]): number {
  let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l;
}
/** Point and heading at fraction t (0..1) along a polyline. */
export function pointAt(pts: Pt[], t: number): { x: number; y: number; dx: number; dy: number } {
  const total = polylineLength(pts); let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg || i === pts.length - 1) {
      const f = seg ? d / seg : 0;
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
        dx: seg ? (pts[i][0] - pts[i - 1][0]) / seg : 0, dy: seg ? (pts[i][1] - pts[i - 1][1]) / seg : 0 };
    }
    d -= seg;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
}

export const STATE_LABEL: Record<RouteState, { label: string; icon: string }> = {
  healthy: { label: 'Healthy', icon: '●' },
  delayed: { label: 'Delayed', icon: '⏸' },
  suspicious: { label: 'Suspicious', icon: '⚠' },
  quarantined: { label: 'Quarantined', icon: '▣' },
  rerouted: { label: 'Rerouted', icon: '⇄' },
  restored: { label: 'Restored', icon: '✓' },
};
