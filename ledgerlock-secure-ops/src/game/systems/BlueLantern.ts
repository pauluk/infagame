import type { GameState } from './GameState';

/**
 * Blue Lantern: emergency payment continuity. A fictional training scenario: every provider, supplier, account and payment is
 * synthetic and every connection, upload, acknowledgement and payment is simulated. No real secrets are ever asked for.
 * This file is the rule engine only (no DOM): the panels and the mission read and drive it.
 */
export type BLRole = 'secure_ops' | 'strategic' | 'ap' | 'treasury' | 'independent';
export const ROLES: Record<BLRole, { name: string; person: string; does: string; never: string }> = {
  secure_ops: { name: 'Secure Ops incident lead', person: 'You', does: 'Coordinates the incident, records evidence, verifies the provider connection against the approved record and monitors the route.', never: 'Does not approve payments or prepare the batch.' },
  strategic: { name: 'Strategic Finance', person: 'Hannah Cole', does: 'Sets priorities, approves the scope and duration of emergency processing and agrees the exposure limit.', never: 'Does not prepare or release payments.' },
  ap: { name: 'Accounts Payable', person: 'Dana Whitfield', does: 'Checks invoice approval, supplier details, due dates, duplicates and eligibility, and prepares the proposed batch.', never: 'Does not check or approve her own batch.' },
  treasury: { name: 'Treasury', person: 'Rohan Mehta', does: 'Confirms the source account and funds, checks the batch total and limit, and performs the independent release review.', never: 'Does not prepare the batch.' },
  independent: { name: 'Independent approver', person: 'Imani Clarke', does: 'Gives the second approval where the risk or value threshold needs it, and verifies changed supplier details.', never: 'A requester cannot approve their own request or batch.' },
};

export type Stage = 'triage' | 'scope' | 'govern' | 'configure' | 'prepare' | 'review' | 'submit' | 'reconcile' | 'restore';
export const STAGES: { id: Stage; title: string; owner: BLRole; deps: Stage[]; what: string }[] = [
  { id: 'triage', title: 'Triage', owner: 'secure_ops', deps: [], what: 'Assess what is affected, pause automatic retries and preserve the queue for review.' },
  { id: 'scope', title: 'Scope', owner: 'secure_ops', deps: ['triage'], what: 'Separate unsent, sent, rejected, duplicated and unknown payments, and agree which payment types are eligible.' },
  { id: 'govern', title: 'Govern', owner: 'strategic', deps: ['scope'], what: 'Check the provider\'s contract, due diligence and approval, then obtain the independent approvals.' },
  { id: 'configure', title: 'Configure', owner: 'secure_ops', deps: ['govern'], what: 'Review every connection item, then run the sandbox handshake and the no-value test.' },
  { id: 'prepare', title: 'Prepare', owner: 'ap', deps: ['configure'], what: 'Accounts Payable inspects the invoices and prepares the proposed batch; risky items go to Hold for Review.' },
  { id: 'review', title: 'Dual Review', owner: 'treasury', deps: ['prepare'], what: 'Treasury checks the account, funds, total, limit and approvals; the independent approver gives the second approval.' },
  { id: 'submit', title: 'Simulate Submission', owner: 'secure_ops', deps: ['review'], what: 'Submit through the mock secure provider portal and read the acknowledgements.' },
  { id: 'reconcile', title: 'Reconcile', owner: 'secure_ops', deps: ['submit'], what: 'Match each item against the AP batch, the provider acknowledgement, the bank feed and the ledger.' },
  { id: 'restore', title: 'Restore', owner: 'secure_ops', deps: ['reconcile'], what: 'Restore the normal route, check for queued duplicates, monitor the next cycle and deactivate the emergency connection.' },
];

export type Cls = 'unsent' | 'sent' | 'rejected' | 'duplicate' | 'unknown';
export const CLS_LABEL: Record<Cls, string> = { unsent: 'Confirmed unsent', sent: 'Confirmed sent', rejected: 'Rejected', duplicate: 'Duplicate', unknown: 'Unknown status' };
export type Lane = 'eligible' | 'hold_supplier' | 'hold_reconcile' | 'hold_duplicate' | 'escalate';
export const LANE_LABEL: Record<Lane, string> = { eligible: 'Eligible for the batch', hold_supplier: 'Hold: supplier verification', hold_reconcile: 'Hold: do not resend until reconciled', hold_duplicate: 'Hold: duplicate', escalate: 'Escalate for approval or defer' };

export interface Item { id: string; supplier: string; ref: string; value: number; evidence: string; cls: Cls; ideal?: Lane; changed?: boolean; over?: boolean; why: string }
export const LIMITS = { txn: 25000, batch: 40000, independentFrom: 15000, hours: 4 };
export const ITEMS: Item[] = [
  { id: 'A', supplier: 'Harbour Stationery Ltd', ref: 'INV-A-2041', value: 18400, evidence: 'Approved, verified supplier, not present in the outbound queue.', cls: 'unsent', ideal: 'eligible', why: 'Approved and verified, and it never reached the queue, so it is safe for Accounts Payable to prepare.' },
  { id: 'B', supplier: 'Larch & Pine Services', ref: 'INV-B-2042', value: 9250, evidence: 'Supplier payment details changed three days ago.', cls: 'unsent', ideal: 'hold_supplier', changed: true, why: 'Recently changed payment details are a classic fraud signal: verify independently against the approved supplier record before including it.' },
  { id: 'C', supplier: 'Meridian Cleaning Co', ref: 'INV-C-2043', value: 7800, evidence: 'Outbound status unknown: no acknowledgement came back.', cls: 'unknown', ideal: 'hold_reconcile', why: 'It may already have been paid. Resending could pay twice: reconcile first.' },
  { id: 'D', supplier: 'Harbour Stationery Ltd', ref: 'INV-A-2041', value: 18400, evidence: 'Duplicate invoice reference INV-A-2041 is already in the batch.', cls: 'duplicate', ideal: 'hold_duplicate', why: 'The same invoice reference twice means a duplicate: hold it or remove it.' },
  { id: 'E', supplier: 'Cedar Freight plc', ref: 'INV-E-2045', value: 62000, evidence: 'Valid invoice, but above the incident limit of £25,000 per payment.', cls: 'unsent', ideal: 'escalate', over: true, why: 'It is over the illustrative limit: it needs additional approval or must wait for the normal route.' },
  { id: 'F', supplier: 'Orchard Print Ltd', ref: 'INV-F-2036', value: 5100, evidence: 'Provider acknowledgement was received before the failure.', cls: 'sent', why: 'It was sent and acknowledged: nothing to do.' },
  { id: 'G', supplier: 'Willow Catering Ltd', ref: 'INV-G-2037', value: 3300, evidence: 'Rejected by the bank: invalid reference.', cls: 'rejected', why: 'The bank rejected it: it returns to review to fix the reference, not to be resent as it is.' },
];
export const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ProviderRecord {
  name: string; contract: 'valid' | 'expired' | 'missing'; dueDiligence: 'valid' | 'expired' | 'missing'; approval: 'valid' | 'expired' | 'missing';
  endpoint: string; types: string[]; dataScope: string; owner: string; approvers: string[]; contractRef: string;
}
export const PROVIDER: ProviderRecord = {
  name: 'Northstar PayLink (fictional)', contract: 'valid', dueDiligence: 'valid', approval: 'valid', contractRef: 'NSP-2024-017 (synthetic)',
  endpoint: 'sandbox.northstar-paylink.example', types: ['Approved supplier invoices'], dataScope: 'Supplier name, masked account reference, invoice reference, amount', owner: 'Hannah Cole (Strategic Finance)', approvers: ['Hannah Cole', 'Imani Clarke'],
};
export const DECOY_ENDPOINT = 'secure-paylink-northstar.example.net';
export const ACCOUNTS = {
  ops: { id: 'ops', name: 'Emergency Operations account', mask: '•••• 4417 (sort •• •• 21)', eligible: true, funds: 120000, note: 'Eligible for the approved contingency route, subject to the incident limit and Treasury approval.' },
  payroll: { id: 'payroll', name: 'Payroll-only account', mask: '•••• 9082 (sort •• •• 21)', eligible: false, funds: 410000, note: 'Unavailable for supplier payments and excluded from this route.' },
} as const;

export type ConnItem = 'record' | 'identity' | 'types' | 'account' | 'limits' | 'owner' | 'times' | 'test';
export const CONN_ITEMS: { id: ConnItem; label: string }[] = [
  { id: 'record', label: 'Approved fictional provider record and contract status' }, { id: 'identity', label: 'Provider identity and the verified endpoint from the approved record' },
  { id: 'types', label: 'Permitted payment types and data scope' }, { id: 'account', label: 'Designated source account and approved account scope' },
  { id: 'limits', label: 'Illustrative batch and transaction limits' }, { id: 'owner', label: 'Named service owner and approvers' },
  { id: 'times', label: 'Start time, expiry time and the reason for emergency use' }, { id: 'test', label: 'Connection test result and audit record' },
];

export interface Audit { t: string; role: BLRole | 'system'; text: string; tone: 'info' | 'good' | 'warn' | 'bad'; stage?: Stage }
export interface Ack { id: string; status: 'Accepted' | 'Rejected' | 'Pending' | 'Unknown'; note: string }
export interface Recon { ap: boolean; ack?: Ack['status']; bank: 'Debited' | 'Pending debit' | 'No debit' | 'Not applicable'; ledger: 'Posted' | 'Awaiting posting' | 'Not applicable'; decision?: 'processed' | 'monitor' | 'review' | 'requeue'; evidence: string[]; note?: string }
export type Result = { ok: boolean; text: string; tone: 'good' | 'warn' | 'bad' | 'info' };
const res = (ok: boolean, text: string, tone: Result['tone'] = ok ? 'good' : 'warn'): Result => ({ ok, text, tone });

export interface BLData {
  variant: 'normal' | 'gap';
  provider: ProviderRecord;
  paused: boolean; preserved: boolean; affected: string[] | null;
  classes: Record<string, Cls | undefined>;
  scope: { types: string[] | null; limitSet: boolean; hours: number; agreed: boolean };
  govern: { strategic: boolean; independent: boolean; escalated: boolean; blocked: boolean; verifiedSuppliers: string[] };
  conn: { reviewed: ConnItem[]; endpoint: string | null; account: 'ops' | 'payroll' | null; start: number | null; expires: number | null; reason: string; handshake: 'pass' | 'fail' | null; test: 'pass' | 'fail' | null; status: 'inactive' | 'configured' | 'tested' | 'active' | 'expired' };
  lanes: Record<string, Lane | undefined>;
  batch: { ref: string; items: string[]; maker: BLRole | null; total: number } | null;
  treasury: { account: 'ops' | 'payroll' | null; funds: boolean; total: boolean; limit: boolean; approvals: boolean; items: boolean; signed: boolean };
  approvals: { by: BLRole; what: string }[];
  acks: Record<string, Ack>;
  recon: Record<string, Recon>;
  restore: { route: boolean; duplicates: boolean; cycle: boolean; deactivated: boolean };
  deferred: boolean;
  log: Audit[];
  penalties: { cat: 'prioritisation' | 'separation' | 'governance' | 'duplicates' | 'reconciliation' | 'audit'; text: string; points: number }[];
  decisions: Record<string, { t: string; role: BLRole | 'system'; text: string }[]>;
}

export const SCORE_CATS: { id: BLData['penalties'][number]['cat']; label: string; max: number }[] = [
  { id: 'prioritisation', label: 'Safe prioritisation', max: 20 }, { id: 'separation', label: 'Approval separation', max: 20 }, { id: 'governance', label: 'Connection governance', max: 20 },
  { id: 'duplicates', label: 'Duplicate prevention', max: 15 }, { id: 'reconciliation', label: 'Accurate reconciliation', max: 15 }, { id: 'audit', label: 'Audit trail', max: 10 },
];

/** The Blue Lantern rules for one game. Methods return a plain-language result and record the audit trail. */
export class BlueLantern {
  static for(s: GameState): BlueLantern { return new BlueLantern(s); }
  static init(s: GameState, variant: 'normal' | 'gap'): BLData {
    const provider: ProviderRecord = { ...PROVIDER, types: [...PROVIDER.types], approvers: [...PROVIDER.approvers] };
    if (variant === 'gap') { provider.dueDiligence = 'expired'; provider.approval = 'missing'; }
    const d: BLData = {
      variant, provider, paused: false, preserved: false, affected: null, classes: {}, scope: { types: null, limitSet: false, hours: 0, agreed: false },
      govern: { strategic: false, independent: false, escalated: false, blocked: false, verifiedSuppliers: [] },
      conn: { reviewed: [], endpoint: null, account: null, start: null, expires: null, reason: '', handshake: null, test: null, status: 'inactive' },
      lanes: {}, batch: null, treasury: { account: null, funds: false, total: false, limit: false, approvals: false, items: false, signed: false }, approvals: [], acks: {}, recon: {},
      restore: { route: false, duplicates: false, cycle: false, deactivated: false }, deferred: false, log: [], penalties: [], decisions: {},
    };
    s.data.bl = d; return d;
  }
  constructor(private s: GameState) {}
  get d(): BLData { return (this.s.data.bl as BLData | undefined) ?? BlueLantern.init(this.s, this.s.mission.id.endsWith('gap') ? 'gap' : 'normal'); }
  get minutes() { return this.s.clockMinutes; }
  item(id: string) { return ITEMS.find((i) => i.id === id)!; }
  /** The lane an invoice belongs in right now (a changed supplier becomes eligible once independently verified). */
  idealLane(it: Item): Lane | undefined { return it.changed && this.d.govern.verifiedSuppliers.includes(it.id) ? 'eligible' : it.ideal; }

  // ------------------------------------------------------------------ audit, consequences ----
  private note(role: BLRole | 'system', text: string, tone: Audit['tone'] = 'info', stage?: Stage): void {
    this.d.log.push({ t: this.s.fmtClock(), role, text, tone, stage });
    if (stage) (this.d.decisions[stage] ??= []).push({ t: this.s.fmtClock(), role, text });
    this.s.log(`Blue Lantern: ${text}`, tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'info'); this.s.changed();
  }
  private hit(cat: BLData['penalties'][number]['cat'], text: string, points: number, metric?: 'integrity' | 'protection' | 'recovery' | 'audit', amount = 0): void {
    this.d.penalties.push({ cat, text, points }); if (metric) this.s.adjust(metric, amount);
    this.s.score(text, 'warn', -points); this.s.log(`Consequence: ${text}`, 'warn');
  }
  /** Marks a stage done: the mission's own flag, so the objectives, the playbook and the board all see it. */
  private done(stage: Stage, stepId?: string): void { this.s.setFlag('st_' + (stepId ?? stage)); this.s.setFlag('bl_' + stage); }
  stageDone(stage: Stage): boolean { return !!this.s.flags['bl_' + stage]; }
  stageState(stage: Stage): 'done' | 'ready' | 'blocked' | 'skipped' {
    if (this.stageDone(stage)) return 'done';
    if (this.d.deferred && !['triage', 'scope', 'govern'].includes(stage)) return 'skipped';
    const st = STAGES.find((x) => x.id === stage)!;
    return st.deps.every((x) => this.stageDone(x)) ? 'ready' : 'blocked';
  }
  /** Role check: the person at this desk may only do their own job. */
  private may(role: BLRole, need: BLRole, approval = false): Result | null {
    if (role === need) return null;
    if (approval) this.hit('separation', `${ROLES[role].name} tried to do ${ROLES[need].name}'s approval.`, 3, 'audit', -3);
    return res(false, `That belongs to ${ROLES[need].name} (${ROLES[need].person}). You are at ${ROLES[role].name}'s desk. Keeping the maker, the checker and the approver as different people is the point.`);
  }

  // ------------------------------------------------------------------ triage ----
  setAffected(role: BLRole, picks: string[]): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const right = ['orchestration', 'outbound', 'retries'], wrong = picks.filter((p) => !right.includes(p));
    const missing = right.filter((p) => !picks.includes(p));
    if (wrong.length) return res(false, 'Accounts Payable, Finance Core and the ledger are still available, so they are not what is down. Only the Payment Orchestration system and the outbound route (with its automatic retries) are affected.');
    if (missing.length) return res(false, 'Something affected is missing: the Payment Orchestration system, the outbound route and the automatic retries all need a decision.');
    this.d.affected = picks; this.note('secure_ops', 'Impact assessed: Payment Orchestration and the outbound route are down; AP, Finance Core and the ledger are up. Treasury and Accounts Payable are the teams affected.', 'good', 'triage');
    return res(true, 'Impact assessed.');
  }
  pauseRetries(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    this.d.paused = true; this.note('secure_ops', 'Automatic retries paused in the simulation.', 'good', 'triage'); return this.checkTriage('Retries paused.');
  }
  preserveQueue(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    this.d.preserved = true; this.note('secure_ops', 'The outgoing queue is preserved read-only for review. Nothing is deleted or resent.', 'good', 'triage'); return this.checkTriage('Queue preserved.');
  }
  private checkTriage(text: string): Result {
    if (this.d.affected && this.d.paused && this.d.preserved) { this.done('triage'); return res(true, text + ' Triage complete.'); }
    return res(true, text);
  }

  // ------------------------------------------------------------------ scope ----
  classify(role: BLRole, id: string, cls: Cls): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const it = this.item(id);
    if (it.cls !== cls) { this.d.classes[id] = undefined; this.hit('prioritisation', `Item ${id} was classed as "${CLS_LABEL[cls]}" but the evidence says "${CLS_LABEL[it.cls]}".`, 2); return res(false, `Not quite: ${it.evidence} That makes it "${CLS_LABEL[it.cls]}".`); }
    this.d.classes[id] = cls; this.note('secure_ops', `Item ${id} (${it.supplier}) classed as ${CLS_LABEL[cls]}.`, 'info', 'scope');
    return this.checkScope(`Item ${id}: ${CLS_LABEL[cls]}. ${it.why}`);
  }
  agreeScope(role: BLRole, types: string[], limitSet: boolean, hours: number): Result {
    const bad = this.may(role, 'strategic'); if (bad) return bad;
    if (types.length !== 1 || types[0] !== 'Approved supplier invoices') { this.hit('prioritisation', 'The emergency scope was wider or narrower than approved supplier invoices.', 3); return res(false, 'The contract allows approved supplier invoices only. Payroll, tax and anything not yet approved stay on the normal route.'); }
    if (!limitSet) return res(false, `Agree the illustrative exposure limit: ${money(LIMITS.txn)} per payment and ${money(LIMITS.batch)} per batch.`);
    if (hours < 1 || hours > LIMITS.hours) { this.hit('governance', 'The emergency window was not time-limited sensibly.', 3); return res(false, `Emergency processing must be time-limited: between 1 and ${LIMITS.hours} hours.`); }
    this.d.scope = { types, limitSet, hours, agreed: true };
    this.note('strategic', `Scope agreed: approved supplier invoices only, up to ${money(LIMITS.txn)} per payment and ${money(LIMITS.batch)} per batch, for ${hours} hours. Strategic Finance does not prepare or release payments.`, 'good', 'scope');
    return this.checkScope('Scope agreed.');
  }
  private checkScope(text: string): Result {
    const all = ITEMS.every((i) => this.d.classes[i.id] === i.cls);
    if (all && this.d.scope.agreed) { this.done('scope'); return res(true, text + ' Scope complete.'); }
    return res(true, text);
  }

  // ------------------------------------------------------------------ govern ----
  reviewProvider(role: BLRole): Result {
    const bad = this.may(role, 'strategic'); if (bad) return bad;
    const p = this.d.provider, gaps = (['contract', 'dueDiligence', 'approval'] as const).filter((k) => p[k] !== 'valid');
    if (gaps.length) {
      this.d.govern.blocked = true;
      this.note('strategic', `Provider record check FAILED: ${gaps.map((g) => g === 'dueDiligence' ? `due diligence is ${p.dueDiligence}` : `${g} is ${p[g]}`).join(', ')}. The activation path is blocked. No bypass.`, 'bad', 'govern');
      return res(false, 'The provider\'s fictional record has a gap: ' + gaps.map((g) => (g === 'dueDiligence' ? 'due diligence' : g) + ' is ' + p[g]).join(', ') + '. Activation is blocked. Escalate it, keep the provider inactive, and hold or defer payments safely.', 'bad');
    }
    this.d.govern.blocked = false; return res(true, 'The contract, due diligence and approval are all valid and in date.');
  }
  strategicApprove(role: BLRole): Result {
    const bad = this.may(role, 'strategic', true); if (bad) return bad;
    if (!this.d.scope.agreed) return res(false, 'Agree the scope first.');
    const rp = this.reviewProvider('strategic'); if (!rp.ok) return rp;
    this.d.govern.strategic = true; this.d.approvals.push({ by: 'strategic', what: 'Emergency scope, duration and exposure limit' });
    this.note('strategic', 'Strategic Finance approved the scope, duration and exposure limit for emergency processing.', 'good', 'govern'); return this.checkGovern('Approved.');
  }
  independentApproveScope(role: BLRole): Result {
    const bad = this.may(role, 'independent', true); if (bad) return bad;
    if (!this.d.govern.strategic) { this.hit('separation', 'The independent approver was asked before Strategic Finance had decided.', 2); return res(false, 'There is nothing to approve yet: Strategic Finance decides the scope first.'); }
    this.d.govern.independent = true; this.d.approvals.push({ by: 'independent', what: 'Use of the contingency provider' });
    this.note('independent', 'The independent approver approved the use of the contingency provider. The request came from Strategic Finance and the Secure Ops lead, not from the approver.', 'good', 'govern'); return this.checkGovern('Independent approval recorded.');
  }
  escalate(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (!this.d.govern.blocked) return res(false, 'There is no governance gap to escalate.');
    this.d.govern.escalated = true; this.note('secure_ops', 'Escalated the provider\'s missing due diligence and approval to the Chief Financial Officer and Procurement. The provider stays inactive.', 'good', 'govern'); return res(true, 'Escalated.');
  }
  /** The correct outcome when the provider cannot pass governance: keep it inactive, preserve the queue, escalate, defer. */
  deferSafely(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (!this.d.govern.blocked) return res(false, 'The provider passed governance: there is no need to defer.');
    if (!this.d.govern.escalated) return res(false, 'Escalate the gap to the decision-makers first.');
    if (!this.d.preserved || !this.d.paused) return res(false, 'Pause the retries and preserve the queue first.');
    this.d.deferred = true; this.d.conn.status = 'inactive';
    this.note('secure_ops', 'Decision: the provider stays inactive. The queue is preserved, supplier payments are deferred to the next approved run, and only the already-approved route will be used when it returns.', 'good', 'govern');
    for (const st of STAGES) if (!['triage', 'scope', 'govern'].includes(st.id)) this.s.setFlag('bl_' + st.id);
    this.s.setFlag('bl_deferred'); this.done('govern'); return res(true, 'Safely deferred. The governance gate held.');
  }
  private checkGovern(text: string): Result {
    if (this.d.govern.strategic && this.d.govern.independent) { this.done('govern'); return res(true, text + ' Governance complete.'); }
    return res(true, text);
  }
  /** Independent verification of a supplier whose details changed, against the approved supplier record. */
  verifySupplier(role: BLRole, id: string): Result {
    const bad = this.may(role, 'independent'); if (bad) return bad;
    const it = this.item(id); if (!it.changed) return res(false, 'That supplier\'s details have not changed: nothing to verify.');
    if (!this.d.govern.verifiedSuppliers.includes(id)) this.d.govern.verifiedSuppliers.push(id);
    this.note('independent', `Supplier ${it.supplier}: the changed details were verified against the approved supplier record (a call-back to the number on file). Supplier details cannot be changed during the emergency run.`, 'good', 'prepare'); return res(true, 'Verified through the approved supplier record.');
  }

  // ------------------------------------------------------------------ configure ----
  review(role: BLRole, item: ConnItem, pick?: string): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (this.d.govern.blocked || !this.stageDone('govern')) return res(false, 'The connection cannot be configured until governance has passed.');
    const c = this.d.conn;
    if (item === 'identity') {
      if (pick !== PROVIDER.endpoint) { c.endpoint = pick ?? null; this.hit('governance', 'An unverified endpoint was chosen instead of the one in the approved provider record.', 4, 'protection', -4); return res(false, 'That endpoint does not match the approved provider record. A look-alike address is how connections get hijacked. Use the endpoint from the record.', 'bad'); }
      c.endpoint = pick;
    }
    if (item === 'account') {
      if (pick !== 'ops') { this.hit('governance', 'The payroll-only account was chosen as the source for supplier payments.', 5, 'integrity', -5); return res(false, 'The Payroll-only account is excluded from this route. The Emergency Operations account is the designated source.', 'bad'); }
      c.account = 'ops';
    }
    if (item === 'times') { c.start = this.minutes; c.expires = this.minutes + (this.d.scope.hours || LIMITS.hours) * 60; c.reason = 'Primary payment route down at 07:35: contingency run for approved supplier invoices.'; }
    if (!c.reviewed.includes(item)) c.reviewed.push(item);
    this.note('secure_ops', `Connection item reviewed: ${CONN_ITEMS.find((x) => x.id === item)!.label}.`, 'info', 'configure');
    return res(true, 'Reviewed.');
  }
  handshake(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const c = this.d.conn, missing = CONN_ITEMS.filter((x) => x.id !== 'test' && !c.reviewed.includes(x.id));
    if (missing.length) { c.handshake = 'fail'; this.hit('governance', 'The sandbox handshake was run before every connection item was reviewed.', 3); this.note('secure_ops', 'Sandbox handshake FAILED: the connection record is incomplete.', 'bad', 'configure'); return res(false, `Handshake failed: review ${missing.map((m) => m.label.split(' and ')[0].toLowerCase()).join('; ')} first.`, 'bad'); }
    c.handshake = 'pass'; c.status = 'configured'; this.note('secure_ops', 'Sandbox handshake PASSED against the verified endpoint (simulated, no secrets).', 'good', 'configure'); return res(true, 'Sandbox handshake passed.');
  }
  noValueTest(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const c = this.d.conn; if (c.handshake !== 'pass') return res(false, 'Run the sandbox handshake first.');
    c.test = 'pass'; c.status = 'tested'; if (!c.reviewed.includes('test')) c.reviewed.push('test');
    this.note('secure_ops', 'No-value test message accepted by the provider sandbox. Audit record written. The connection is configured and time-limited; it is not yet active.', 'good', 'configure'); this.done('configure'); return res(true, 'No-value test passed. The connection is ready, but nothing is active until the batch is approved.');
  }
  /** The connection is only ever active after the batch passes dual review, and only for the approved window. */
  activate(): boolean {
    const c = this.d.conn; if (c.status !== 'tested' || !c.expires) return false;
    c.status = 'active'; this.note('system', `Emergency connection ACTIVE until ${this.s.fmtClock(c.expires)}. It returns to inactive by itself unless a new approval is recorded.`, 'info'); return true;
  }
  tick(): void {
    const c = this.d.conn;
    if ((c.status === 'active' || c.status === 'tested' || c.status === 'configured') && c.expires && this.minutes >= c.expires) { c.status = 'expired'; this.note('system', 'The emergency connection expired automatically and is inactive again. A new approval is needed to reactivate it.', 'warn'); }
  }

  // ------------------------------------------------------------------ prepare (AP workbench) ----
  moveToLane(role: BLRole, id: string, lane: Lane): Result {
    const bad = this.may(role, 'ap'); if (bad) return bad;
    if (!this.stageDone('configure')) return res(false, 'The connection is not configured yet.');
    const it = this.item(id); if (!it.ideal) return res(false, `Item ${id} was already sent or rejected: it is not a candidate for this batch.`);
    const ideal = this.idealLane(it)!;
    if (lane === ideal) { this.d.lanes[id] = lane; this.note('ap', `Invoice ${id} placed in "${LANE_LABEL[lane]}": ${it.why}`, 'info', 'prepare'); return res(true, it.why); }
    if (lane === 'eligible') {
      const why = id === 'B' ? 'Its supplier details changed recently. It needs independent verification against the approved supplier record before it can go in.' : id === 'C' ? 'Its outbound status is unknown. It may already have been paid, so resending could pay twice.' : id === 'D' ? 'It repeats invoice reference INV-A-2041, which is already in the batch.' : 'It is above the incident limit and needs additional approval or the normal route.';
      this.hit(id === 'C' || id === 'D' ? 'duplicates' : 'prioritisation', `Invoice ${id} was put in the batch although: ${why}`, id === 'C' || id === 'D' ? 4 : 3); return res(false, why, 'bad');
    }
    this.d.lanes[id] = lane; return res(false, `Placed, but "${LANE_LABEL[ideal]}" fits better. ${it.why}`, 'warn');
  }
  prepareBatch(role: BLRole): Result {
    const bad = this.may(role, 'ap'); if (bad) return bad;
    const elig = ITEMS.filter((i) => this.d.lanes[i.id] === 'eligible' && i.ideal);
    const unplaced = ITEMS.filter((i) => i.ideal && !this.d.lanes[i.id]);
    if (unplaced.length) return res(false, `Place every invoice first: ${unplaced.map((i) => i.id).join(', ')} still ${unplaced.length > 1 ? 'need' : 'needs'} a lane.`);
    const wrong = ITEMS.filter((i) => i.ideal && this.idealLane(i) !== this.d.lanes[i.id]);
    if (wrong.length) return res(false, `Check the lanes for ${wrong.map((i) => i.id).join(', ')}: each one still has a reason to sit somewhere else.`);
    if (!elig.length) return res(false, 'There is nothing eligible to prepare.');
    const total = elig.reduce((n, i) => n + i.value, 0);
    this.d.batch = { ref: 'BL-EMG-0001', items: elig.map((i) => i.id), maker: 'ap', total };
    this.note('ap', `Proposed batch ${this.d.batch.ref} prepared by Accounts Payable: ${elig.length} item(s), ${money(total)}. Held items: ${ITEMS.filter((i) => i.ideal && this.d.lanes[i.id] !== 'eligible').map((i) => i.id).join(', ') || 'none'}.`, 'good', 'prepare'); this.done('prepare');
    return res(true, `Batch ${this.d.batch.ref} prepared: ${money(total)}.`);
  }

  // ------------------------------------------------------------------ dual review ----
  treasuryCheck(role: BLRole, what: 'account' | 'funds' | 'total' | 'limit' | 'approvals' | 'items', pick?: 'ops' | 'payroll'): Result {
    const bad = this.may(role, 'treasury'); if (bad) return bad;
    const b = this.d.batch; if (!b) return res(false, 'Accounts Payable has not prepared a batch yet.');
    if (b.maker === 'treasury') return res(false, 'The preparer cannot check their own batch.');
    const t = this.d.treasury;
    if (what === 'account') {
      if (pick !== 'ops') { this.hit('governance', 'Treasury selected the payroll-only account as the source for supplier payments.', 5, 'integrity', -5); return res(false, 'The Payroll-only account cannot pay suppliers. The source account is the Emergency Operations account; the supplier\'s own account is a different thing and belongs to the beneficiary.', 'bad'); }
      t.account = 'ops'; this.note('treasury', 'Source account confirmed: Emergency Operations (•••• 4417). The provider route is not a beneficiary account.', 'good', 'review'); return res(true, 'Source account confirmed.');
    }
    if (what === 'funds') { if (t.account !== 'ops') return res(false, 'Confirm the source account first.'); t.funds = ACCOUNTS.ops.funds >= b.total; this.note('treasury', `Funds checked: ${money(ACCOUNTS.ops.funds)} available against ${money(b.total)}.`, 'good', 'review'); return res(t.funds, t.funds ? 'Funds are sufficient.' : 'Not enough funds.'); }
    if (what === 'total') { t.total = true; this.note('treasury', `Batch total ${money(b.total)} agrees to the AP invoices.`, 'good', 'review'); return res(true, 'The total agrees to the invoices.'); }
    if (what === 'limit') { const over = b.total > LIMITS.batch || b.items.some((i) => this.item(i).value > LIMITS.txn); t.limit = !over; this.note('treasury', over ? 'The batch is over the incident limit.' : `Within the limits: ${money(LIMITS.txn)} per payment, ${money(LIMITS.batch)} per batch.`, over ? 'bad' : 'good', 'review'); return res(!over, over ? 'Over the limit: remove the item or get additional approval.' : 'Within the limits.', over ? 'bad' : 'good'); }
    if (what === 'items') { const dirty = b.items.filter((i) => { const it = this.item(i); return it.cls !== 'unsent' || (it.changed && !this.d.govern.verifiedSuppliers.includes(i)); }); t.items = !dirty.length; return res(t.items, t.items ? 'Every item is eligible.' : `Item(s) ${dirty.join(', ')} are not eligible.`); }
    if (!this.d.govern.strategic || !this.d.govern.independent) return res(false, 'The approval record is incomplete.', 'bad');
    t.approvals = true; this.note('treasury', 'Approval record checked: Strategic Finance and the independent approver on file.', 'good', 'review'); return res(true, 'The approval record is complete.');
  }
  treasurySign(role: BLRole): Result {
    const bad = this.may(role, 'treasury', true); if (bad) return bad;
    const t = this.d.treasury, miss = (['account', 'funds', 'total', 'limit', 'approvals', 'items'] as const).filter((k) => (k === 'account' ? t.account !== 'ops' : !t[k]));
    if (miss.length) { this.hit('separation', 'Treasury was asked to sign before every check was done: a rushed approval.', 4, 'audit', -4); return res(false, `Do not sign yet: ${miss.join(', ')} not checked. A rushed approval is a control failure.`, 'bad'); }
    t.signed = true; this.d.approvals.push({ by: 'treasury', what: `Release review of ${this.d.batch!.ref}` }); this.note('treasury', 'Treasury signed the independent release review. Treasury did not prepare the batch.', 'good', 'review'); return this.checkReview('Treasury signed.');
  }
  independentApproveBatch(role: BLRole): Result {
    const bad = this.may(role, 'independent', true); if (bad) return bad;
    const b = this.d.batch; if (!b) return res(false, 'There is no batch yet.');
    if (b.total < LIMITS.independentFrom) return res(true, 'Not needed: below the threshold.');
    if (!this.d.treasury.signed) { this.hit('separation', 'The independent approver was asked to approve before Treasury had reviewed the batch.', 3); return res(false, 'Treasury reviews first, then the independent approver gives the second approval.', 'bad'); }
    this.d.approvals.push({ by: 'independent', what: `Second approval of ${b.ref} (${money(b.total)} is over ${money(LIMITS.independentFrom)})` });
    this.note('independent', `Second approval of ${b.ref} given: the value is over the ${money(LIMITS.independentFrom)} threshold. The requester is not the approver.`, 'good', 'review'); return this.checkReview('Second approval recorded.');
  }
  private checkReview(text: string): Result {
    const b = this.d.batch!, needInd = b.total >= LIMITS.independentFrom, haveInd = this.d.approvals.some((a) => a.by === 'independent' && a.what.startsWith('Second approval'));
    if (this.d.treasury.signed && (!needInd || haveInd)) { this.done('review'); return res(true, text + ' Dual review complete.'); }
    return res(true, text);
  }

  // ------------------------------------------------------------------ submission ----
  summary() {
    const b = this.d.batch; if (!b) return null;
    return { count: b.items.length, total: b.total, held: ITEMS.filter((i) => i.ideal && !b.items.includes(i.id)).map((i) => i.id), account: ACCOUNTS.ops.name + ' ' + ACCOUNTS.ops.mask, provider: this.d.provider.name, approvers: this.d.approvals.map((a) => `${ROLES[a.by].person} (${ROLES[a.by].name})`), ref: b.ref };
  }
  /** "Simulate secure submission": nothing real is sent. Fictional acknowledgements come back. */
  submit(role: BLRole, opts: { extra?: string[] } = {}): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const b = this.d.batch; if (!b || !this.stageDone('review')) { this.hit('separation', 'A submission was attempted before the dual review was complete.', 4, 'audit', -4); return res(false, 'The batch has not passed dual review. Nothing is submitted without it.', 'bad'); }
    if (!this.activate()) {
      const st = this.d.conn.status;
      if (st === 'expired') return res(false, 'The emergency connection has expired. A new approval is needed.', 'bad');
      return res(false, 'The connection is not ready: it must be tested and approved.', 'bad');
    }
    const ids = [...b.items, ...(opts.extra ?? [])];
    for (const id of ids) {
      const it = this.item(id);
      let ack: Ack;
      if (id === 'D') { ack = { id, status: 'Rejected', note: 'Duplicate of INV-A-2041 already submitted.' }; this.hit('duplicates', 'Invoice D was resent as a duplicate of A.', 6, 'integrity', -8); }
      else if (id === 'C') { ack = { id, status: 'Rejected', note: 'The provider holds an earlier payment for this invoice: duplicate.' }; this.hit('duplicates', 'Invoice C was resent while its status was unknown: it had already been paid.', 6, 'integrity', -8); }
      else if (id === 'A') ack = { id, status: 'Accepted', note: 'Accepted for processing (simulated).' };
      else if (id === 'B') ack = { id, status: 'Pending', note: 'Pending: the provider is still processing (simulated).' };
      else ack = { id, status: 'Rejected', note: 'Not an eligible item for this route.' };
      this.d.acks[id] = ack;
      this.d.recon[id] = { ap: true, ack: ack.status, bank: ack.status === 'Accepted' ? 'Debited' : ack.status === 'Pending' ? 'Pending debit' : 'No debit', ledger: ack.status === 'Accepted' ? 'Awaiting posting' : 'Not applicable', evidence: [] };
      void it;
    }
    this.note('secure_ops', `Simulated secure submission of ${b.ref}: ${ids.length} item(s), ${money(ids.reduce((n, i) => n + this.item(i).value, 0))}. Nothing real was sent. Acknowledgements: ${ids.map((i) => `${i} ${this.d.acks[i].status}`).join(', ')}.`, 'info', 'submit');
    this.done('submit'); return res(true, 'Submission simulated. Read the acknowledgements.');
  }

  // ------------------------------------------------------------------ reconcile ----
  recordEvidence(role: BLRole, id: string, ev: string): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const r = this.d.recon[id]; if (!r) return res(false, 'That item was not submitted.');
    if (!r.evidence.includes(ev)) r.evidence.push(ev); this.note('secure_ops', `Evidence recorded for ${id}: ${ev}.`, 'info', 'reconcile'); return res(true, 'Evidence recorded.');
  }
  postLedger(role: BLRole, id: string): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const r = this.d.recon[id]; if (!r) return res(false, 'That item was not submitted.');
    if (r.ack !== 'Accepted' || r.bank !== 'Debited') return res(false, 'The ledger is only updated once the provider has accepted and the bank feed shows the debit.');
    for (const e of ['Provider acknowledgement: Accepted', 'Bank feed: debited', 'AP invoice and batch reference match']) if (!r.evidence.includes(e)) r.evidence.push(e);
    r.ledger = 'Posted'; this.note('secure_ops', `Finance Core now shows ${id} as posted, matching the acknowledgement and the bank debit.`, 'good', 'reconcile'); return res(true, 'Ledger posted.');
  }
  decide(role: BLRole, id: string, decision: NonNullable<Recon['decision']>): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const r = this.d.recon[id]; if (!r) return res(false, 'That item was not submitted.');
    if (decision === 'processed') {
      const ok = r.ap && r.ack === 'Accepted' && r.bank === 'Debited' && r.ledger === 'Posted';
      if (!ok) { this.hit('reconciliation', `Invoice ${id} was marked processed without all four pieces of evidence.`, 4, 'audit', -3); return res(false, 'Not yet: an item is only processed when the AP batch, the provider acknowledgement, the bank debit and the ledger all agree.', 'bad'); }
      r.decision = 'processed'; this.note('secure_ops', `Invoice ${id} processed: all four sources agree.`, 'good', 'reconcile');
    } else if (decision === 'monitor') {
      if (r.ack !== 'Pending') return res(false, 'Only a Pending item is monitored.');
      r.decision = 'monitor'; this.note('secure_ops', `Invoice ${id} is Pending: it is NOT resent. Monitor the next processing cycle.`, 'good', 'reconcile');
    } else if (decision === 'review') {
      if (r.ack !== 'Rejected') return res(false, 'Only a Rejected item returns to review.');
      r.decision = 'review'; this.note('secure_ops', `Invoice ${id} was rejected and returns to the correct review lane.`, 'good', 'reconcile');
    } else r.decision = 'requeue';
    return this.checkReconcile('Recorded.');
  }
  /** Invoice C: its status was Unknown. Investigate with evidence, never resend. */
  investigateC(role: BLRole, evidence: string[]): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    const need = ['bank', 'portal', 'orchestration'], ok = need.every((n) => evidence.includes(n)) && evidence.length === need.length;
    if (!ok) { this.hit('reconciliation', 'Invoice C was resolved on weak or incomplete evidence.', 3); return res(false, 'Choose the evidence that proves it: the bank feed shows no debit, the provider portal has no record, and the Payment Orchestration log shows it never left. Opinions and a green icon are not evidence.', 'warn'); }
    this.d.recon.C = { ap: true, ack: undefined, bank: 'No debit', ledger: 'Not applicable', evidence: ['Bank feed: no debit', 'Provider portal: no record', 'Orchestration log: unsent'], decision: 'requeue', note: 'Confirmed unsent: re-queue on the restored normal route, with approval.' };
    this.note('secure_ops', 'Invoice C investigated: the bank feed, the provider portal and the orchestration log all show it was never sent. It will be re-queued on the normal route after restore. It was NOT resent through the provider.', 'good', 'reconcile'); return this.checkReconcile('Invoice C is now confirmed unsent.');
  }
  reconcileComplete(): boolean {
    const r = this.d.recon; const sub = Object.keys(r).filter((k) => k !== 'C');
    const subs = sub.every((k) => r[k].decision === 'processed' || r[k].decision === 'monitor' || r[k].decision === 'review');
    return subs && r.C?.decision === 'requeue' && ITEMS.filter((i) => i.cls === 'rejected' && this.d.classes[i.id] === 'rejected').length >= 0;
  }
  private checkReconcile(text: string): Result {
    if (this.reconcileComplete() && this.d.recon.B?.decision === 'monitor' && this.d.recon.A?.decision === 'processed') { this.done('reconcile'); return res(true, text + ' Reconciliation complete.'); }
    return res(true, text);
  }

  // ------------------------------------------------------------------ restore ----
  restoreRoute(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (!this.stageDone('reconcile')) { this.hit('reconciliation', 'The normal route was restored before the reconciliation was complete.', 4, 'integrity', -6); return res(false, 'Not yet: restoring the normal route before everything is reconciled can release queued items twice.', 'bad'); }
    this.d.restore.route = true; this.s.routeStates.supplier_payment_release = 'restored'; this.note('secure_ops', 'The normal payment route is restored. The preserved queue stays paused until it has been checked.', 'good', 'restore'); return this.checkRestore('Normal route restored.');
  }
  checkDuplicates(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (!this.d.restore.route) return res(false, 'Restore the normal route first.');
    const dup = Object.values(this.d.acks).filter((a) => a.note.includes('uplicate')).length;
    this.d.restore.duplicates = true; this.note('secure_ops', dup ? `Queue check: ${dup} duplicate(s) found from the earlier resend: they are rejected, not paid.` : 'Queue check: no duplicate is waiting to be released. Invoice D stays held and C is re-queued once, with approval.', dup ? 'warn' : 'good', 'restore'); return this.checkRestore('Queued items checked.');
  }
  monitorCycle(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (!this.d.restore.route) return res(false, 'Restore the normal route first.');
    this.d.restore.cycle = true; const b = this.d.recon.B;
    if (b && b.ack === 'Pending') { b.ack = 'Accepted'; b.bank = 'Debited'; b.ledger = 'Awaiting posting'; this.d.acks.B = { id: 'B', status: 'Accepted', note: 'Accepted after the next processing cycle (simulated).' }; }
    this.note('secure_ops', 'The next processing cycle ran: the pending item B was accepted and debited. Post it to the ledger and mark it processed.', 'good', 'restore'); this.s.setFlag('bl_cycle'); return this.checkRestore('Next cycle monitored.');
  }
  deactivate(role: BLRole): Result {
    const bad = this.may(role, 'secure_ops'); if (bad) return bad;
    if (!this.d.restore.route) return res(false, 'Restore the normal route first.');
    this.d.conn.status = 'inactive'; this.d.restore.deactivated = true; this.note('secure_ops', `The emergency connection is disabled and recorded as inactive at ${this.s.fmtClock()} (approved expiry ${this.d.conn.expires ? this.s.fmtClock(this.d.conn.expires) : 'n/a'}).`, 'good', 'restore'); return this.checkRestore('Emergency connection deactivated.');
  }
  private checkRestore(text: string): Result {
    const r = this.d.restore, b = this.d.recon.B;
    if (r.route && r.duplicates && r.cycle && r.deactivated && (!b || b.decision === 'processed')) {
      if (this.d.recon.C?.decision !== 'requeue') this.hit('reconciliation', 'Invoice C finished with an unresolved Unknown status.', 5, 'integrity', -6);
      this.done('restore'); return res(true, text + ' Restore complete.');
    }
    return res(true, text);
  }

  // ------------------------------------------------------------------ the best path, for Auto and the tests ----
  /** Carries out one desk's best-practice work. Used by teammates on Auto and by the scripted tests. */
  solve(stage: string): void {
    const d = this.d;
    switch (stage) {
      case 'triage': this.setAffected('secure_ops', ['orchestration', 'outbound', 'retries']); this.pauseRetries('secure_ops'); this.preserveQueue('secure_ops'); break;
      case 'scope':
        for (const i of ITEMS) this.classify('secure_ops', i.id, i.cls);
        this.agreeScope('strategic', ['Approved supplier invoices'], true, LIMITS.hours); break;
      case 'govern':
        if (!this.reviewProvider('strategic').ok) { this.escalate('secure_ops'); this.deferSafely('secure_ops'); break; }
        this.strategicApprove('strategic'); this.independentApproveScope('independent'); break;
      case 'configure':
        for (const c of CONN_ITEMS) if (c.id !== 'test') this.review('secure_ops', c.id, c.id === 'identity' ? PROVIDER.endpoint : c.id === 'account' ? 'ops' : undefined);
        this.handshake('secure_ops'); this.noValueTest('secure_ops'); break;
      case 'prepare':
        this.verifySupplier('independent', 'B');
        for (const i of ITEMS) if (i.ideal) this.moveToLane('ap', i.id, this.idealLane(i)!);
        this.prepareBatch('ap'); break;
      case 'review':
        this.treasuryCheck('treasury', 'account', 'ops');
        for (const w of ['funds', 'total', 'limit', 'items', 'approvals'] as const) this.treasuryCheck('treasury', w);
        this.treasurySign('treasury'); this.independentApproveBatch('independent'); break;
      case 'submit': this.submit('secure_ops'); break;
      case 'reconcile':
        this.recordEvidence('secure_ops', 'A', 'Provider acknowledgement: Accepted'); this.recordEvidence('secure_ops', 'A', 'Bank feed: debited');
        this.postLedger('secure_ops', 'A'); this.decide('secure_ops', 'A', 'processed');
        this.decide('secure_ops', 'B', 'monitor'); this.investigateC('secure_ops', ['bank', 'portal', 'orchestration']); break;
      case 'restore':
        this.restoreRoute('secure_ops'); this.checkDuplicates('secure_ops'); this.monitorCycle('secure_ops');
        this.postLedger('secure_ops', 'B'); this.decide('secure_ops', 'B', 'processed'); this.deactivate('secure_ops'); break;
    }
    void d;
  }

  // ------------------------------------------------------------------ score ----
  scoreboard(): { cats: { id: string; label: string; points: number; max: number; notes: string[] }[]; total: number } {
    const cats = SCORE_CATS.map((c) => {
      const lost = this.d.penalties.filter((p) => p.cat === c.id).reduce((n, p) => n + p.points, 0);
      let points = Math.max(0, c.max - lost);
      const notes = this.d.penalties.filter((p) => p.cat === c.id).map((p) => `−${p.points}: ${p.text}`);
      if (c.id === 'audit') { const stagesLogged = new Set(Object.keys(this.d.decisions)).size; points = Math.max(0, Math.min(c.max, stagesLogged + 1 - lost)); notes.push(`${stagesLogged} stage(s) have a recorded decision history.`); }
      if (c.id === 'governance' && this.d.govern.blocked && this.d.deferred) { points = c.max; notes.push('The governance gate held: the provider stayed inactive and the queue was preserved.'); }
      return { id: c.id, label: c.label, points, max: c.max, notes };
    });
    return { cats, total: Math.round(cats.reduce((n, c) => n + c.points, 0)) };
  }
}
