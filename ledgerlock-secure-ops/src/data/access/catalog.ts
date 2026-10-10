/**
 * Access Review: fictional finance-system permissions, roles and segregation-of-duties rules.
 * Everything here is synthetic game data. Nothing connects to a real directory, HR, payroll, payment or finance system.
 */
export type Env = 'Training' | 'Test' | 'Production';
export const ENVS: Env[] = ['Training', 'Test', 'Production'];
export const ENV_NOTE: Record<Env, string> = {
  Training: 'Practice copy with invented data. Safe for learning; nothing here is real.',
  Test: 'Rehearsal copy for checking changes. Invented data, but changes can be rehearsed against real processes.',
  Production: 'The live system. Actions here affect real money and real records, so access is the tightest.',
};
export type PermKind = 'read' | 'prepare' | 'review' | 'approve' | 'release' | 'change' | 'hold' | 'admin';
export type Risk = 'low' | 'medium' | 'high';
export type RoleId = 'accounting' | 'treasury' | 'fraud' | 'pensions' | 'payroll' | 'ap_member' | 'ap_manager' | 'ar_member' | 'ar_manager' | 'audit' | 'service';

export interface Permission {
  id: string; label: string; system: string; kind: PermKind; risk: Risk;
  /** Plain English: what it lets a person see or do. */
  what: string;
  /** The finance system area this touches, in the game's world. */
  room: string;
}
const P = (id: string, system: string, label: string, kind: PermKind, risk: Risk, what: string, room: string): Permission => ({ id, system, label, kind, risk, what, room });

export const PERMISSIONS: Permission[] = [
  P('gl.read', 'General Ledger', 'Read ledger data', 'read', 'low', 'See ledger balances and postings. Cannot change anything.', 'Finance Core'),
  P('gl.report', 'General Ledger', 'Run ledger reports', 'read', 'low', 'Run and export standard ledger reports.', 'Finance Core'),
  P('jnl.prepare', 'Journals', 'Prepare journals', 'prepare', 'medium', 'Draft a journal entry. It does not reach the ledger until someone else reviews it.', 'Finance Core'),
  P('jnl.post', 'Journals', 'Post journals', 'release', 'high', 'Push a reviewed journal into the ledger so the balances change.', 'Finance Core'),
  P('jnl.approve', 'Journals', 'Approve journals', 'approve', 'high', 'Sign off a journal that someone else prepared.', 'Finance Core'),
  P('ap.invoice.enter', 'Accounts Payable', 'Enter supplier invoices', 'prepare', 'low', 'Key in invoices from suppliers. They wait for review before payment.', 'Finance Core'),
  P('ap.invoice.review', 'Accounts Payable', 'Review invoices', 'review', 'medium', 'Check entered invoices against orders and receipts.', 'Finance Core'),
  P('ap.invoice.approve', 'Accounts Payable', 'Approve invoices (stated limit)', 'approve', 'high', 'Approve invoices for payment up to a stated limit. Never your own entries.', 'Finance Core'),
  P('sup.view', 'Suppliers', 'View supplier details', 'read', 'low', 'See supplier names and masked bank details needed to do invoice work.', 'Finance Core'),
  P('sup.change', 'Suppliers', 'Change supplier or beneficiary details', 'change', 'high', 'Edit a supplier or where their money is sent. A classic fraud route.', 'Finance Core'),
  P('pay.prepare', 'Payments', 'Prepare payment runs', 'prepare', 'medium', 'Assemble a batch of payments for approval.', 'Payment Orchestration'),
  P('pay.approve', 'Payments', 'Approve payment runs', 'approve', 'high', 'Approve a prepared payment batch.', 'Payment Orchestration'),
  P('pay.release', 'Payments', 'Release payments to the bank', 'release', 'high', 'Send an approved batch to the bank. Money leaves.', 'BACS Vault'),
  P('tre.cash.view', 'Treasury', 'View cash positions', 'read', 'low', 'See balances and forecasts across bank accounts.', 'Payment Orchestration'),
  P('tre.transfer.prepare', 'Treasury', 'Prepare treasury transfers', 'prepare', 'medium', 'Draft a movement of cash between accounts.', 'Payment Orchestration'),
  P('tre.transfer.approve', 'Treasury', 'Approve treasury transfers', 'approve', 'high', 'Approve a transfer that someone else prepared.', 'Payment Orchestration'),
  P('pr.view', 'Payroll', 'View payroll summaries', 'read', 'medium', 'See payroll totals and exceptions (not bank details).', 'Payroll & Pensions'),
  P('pr.batch.prepare', 'Payroll', 'Prepare payroll batches', 'prepare', 'medium', 'Build a payroll batch from timesheets and changes.', 'Payroll & Pensions'),
  P('pr.batch.review', 'Payroll', 'Review payroll batches', 'review', 'medium', 'Check a batch for errors before it is approved.', 'Payroll & Pensions'),
  P('pr.batch.approve', 'Payroll', 'Approve payroll batches', 'approve', 'high', 'Approve a batch that someone else prepared.', 'Payroll & Pensions'),
  P('pr.batch.release', 'Payroll', 'Release payroll batches', 'release', 'high', 'Send an approved payroll batch for payment.', 'Payroll & Pensions'),
  P('pen.view', 'Pensions', 'View pension records (in scope)', 'read', 'medium', 'See pension records for the schemes you administer.', 'Payroll & Pensions'),
  P('pen.update', 'Pensions', 'Update pension records (in scope)', 'change', 'medium', 'Correct or update records for the schemes you administer.', 'Payroll & Pensions'),
  P('ar.balance.view', 'Accounts Receivable', 'View customer balances', 'read', 'low', 'See what customers owe and have paid.', 'Debt Recovery'),
  P('ar.receipt.record', 'Accounts Receivable', 'Record receipts', 'prepare', 'low', 'Record money received against a balance.', 'Debt Recovery'),
  P('ar.case.work', 'Accounts Receivable', 'Work collection cases', 'prepare', 'low', 'Add notes, contact attempts and payment plans to collection cases.', 'Debt Recovery'),
  P('ar.adjust.prepare', 'Accounts Receivable', 'Prepare adjustments', 'prepare', 'medium', 'Draft a correction to a balance.', 'Debt Recovery'),
  P('ar.adjust.approve', 'Accounts Receivable', 'Approve adjustments', 'approve', 'high', 'Approve a balance correction that someone else prepared.', 'Debt Recovery'),
  P('ar.writeoff.prepare', 'Accounts Receivable', 'Prepare write-offs', 'prepare', 'high', 'Draft the write-off of a debt as uncollectable.', 'Debt Recovery'),
  P('ar.writeoff.approve', 'Accounts Receivable', 'Approve write-offs (stated limit)', 'approve', 'high', 'Approve a write-off up to a stated limit. Higher amounts need a second approver.', 'Debt Recovery'),
  P('ar.agency.refer', 'Accounts Receivable', 'Refer cases to the agency', 'release', 'medium', 'Send an approved case to the collection agency.', 'Agency Hand-off'),
  P('fr.alert.review', 'Fraud', 'Review fraud alerts', 'read', 'medium', 'See alerts about suspicious activity.', 'Secure Ops'),
  P('fr.case.manage', 'Fraud', 'Manage fraud cases', 'prepare', 'medium', 'Open, update and close fraud cases.', 'Secure Ops'),
  P('fr.hold.place', 'Fraud', 'Place or recommend payment holds', 'hold', 'medium', 'Pause a suspicious payment or recommend that it is paused. Cannot release money.', 'Payment Orchestration'),
  P('aud.evidence.read', 'Audit', 'Read approved evidence', 'read', 'low', 'Read evidence packs that have been approved for audit.', 'Audit Gallery'),
  P('aud.report.read', 'Audit', 'Read audit reports', 'read', 'low', 'Read finished reports. Cannot edit them.', 'Audit Gallery'),
  P('iam.request', 'Identity & Access', 'Raise access requests', 'read', 'low', 'Ask for access through the normal process. Grants nothing by itself.', 'Secure Ops'),
  P('iam.grant', 'Identity & Access', 'Grant roles to others', 'admin', 'high', 'Give other people access. Administrators only.', 'Secure Ops'),
  P('iam.approve', 'Identity & Access', 'Approve access requests', 'approve', 'high', 'Sign off other people’s access requests.', 'Secure Ops'),
  P('svc.events.read', 'Service access', 'Read event metadata (non-interactive)', 'read', 'low', 'A service reads event metadata. No person can log in with it.', 'Event Stream Hall'),
  P('svc.fabric.write', 'Service access', 'Write to the Fabric landing zone', 'change', 'medium', 'A service lands data in the analytics platform (Bronze).', 'Fabric Data Platform'),
  P('svc.ledger.read', 'Service access', 'Read masked ledger totals (non-interactive)', 'read', 'low', 'A service reads masked totals for reconciliation checks.', 'Finance Core'),
  P('svc.ledger.write', 'Service access', 'Write to the ledger', 'change', 'high', 'A service posts to the ledger directly. Almost never right.', 'Finance Core'),
  P('svc.interactive', 'Service access', 'Interactive login for the service account', 'admin', 'high', 'Lets a person sign in as the service. Defeats the point of a service identity.', 'Secure Ops'),
  P('svc.payments.release', 'Service access', 'Release payments (service)', 'release', 'high', 'A service sends payments to the bank on its own.', 'BACS Vault'),
];
export const PERM = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p])) as Record<string, Permission>;
export const RISK_WEIGHT: Record<Risk, number> = { low: 4, medium: 8, high: 14 };

export interface RoleDef {
  id: RoleId; team: string; seat: string; responsibilities: string[];
  /** Permissions that are normally appropriate for the role (the ceiling for "least privilege"). */
  allowed: string[];
  /** What the role must never hold, in plain English. */
  never: string;
}
export const ROLES: Record<RoleId, RoleDef> = {
  accounting: { id: 'accounting', team: 'Accounting', seat: 'Team member', responsibilities: ['Reads ledger data to answer queries', 'Prepares journals for review'], allowed: ['gl.read', 'gl.report', 'jnl.prepare'], never: 'Posting or approving journals needs separate review.' },
  treasury: { id: 'treasury', team: 'Treasury Management Team', seat: 'Team member or manager', responsibilities: ['Monitors cash positions', 'Prepares treasury activity (managers approve it)'], allowed: ['tre.cash.view', 'tre.transfer.prepare', 'tre.transfer.approve'], never: 'The person who prepares a transfer cannot approve it.' },
  fraud: { id: 'fraud', team: 'Fraud Team', seat: 'Team member', responsibilities: ['Reviews alerts and cases', 'Places or recommends holds on suspicious payments'], allowed: ['fr.alert.review', 'fr.case.manage', 'fr.hold.place', 'gl.read'], never: 'No payment release and no beneficiary changes.' },
  pensions: { id: 'pensions', team: 'Pensions', seat: 'Team member', responsibilities: ['Maintains pension records for assigned schemes'], allowed: ['pen.view', 'pen.update'], never: 'No payroll approval by default.' },
  payroll: { id: 'payroll', team: 'Payroll', seat: 'Team member', responsibilities: ['Prepares or reviews payroll batches'], allowed: ['pr.view', 'pr.batch.prepare', 'pr.batch.review'], never: 'Whoever prepares a batch cannot approve or release that batch.' },
  ap_member: { id: 'ap_member', team: 'Accounts Payable', seat: 'Team member', responsibilities: ['Enters invoices', 'Looks up the supplier details needed for the work'], allowed: ['ap.invoice.enter', 'sup.view', 'gl.read'], never: 'No supplier changes and no payment release.' },
  ap_manager: { id: 'ap_manager', team: 'Accounts Payable', seat: 'Manager', responsibilities: ['Reviews invoices', 'Approves within a stated limit'], allowed: ['ap.invoice.review', 'ap.invoice.approve', 'sup.view', 'gl.read'], never: 'Cannot approve their own work, and cannot combine supplier changes with payment release.' },
  ar_member: { id: 'ar_member', team: 'Accounts Receivable', seat: 'Team member', responsibilities: ['Views balances', 'Records receipts', 'Works collection cases'], allowed: ['ar.balance.view', 'ar.receipt.record', 'ar.case.work'], never: 'No adjustments, write-offs or agency referrals.' },
  ar_manager: { id: 'ar_manager', team: 'Accounts Receivable', seat: 'Manager', responsibilities: ['Reviews adjustments and write-offs', 'Refers cases to the agency'], allowed: ['ar.balance.view', 'ar.adjust.approve', 'ar.writeoff.approve', 'ar.agency.refer'], never: 'Higher-risk actions need a second approver. Cannot approve their own preparation.' },
  audit: { id: 'audit', team: 'Audit', seat: 'Read-only', responsibilities: ['Reads approved evidence and finished reports'], allowed: ['aud.evidence.read', 'aud.report.read', 'gl.read'], never: 'No editing, payment action, role administration or approvals.' },
  service: { id: 'service', team: 'Service identity', seat: 'Non-interactive', responsibilities: ['One named service, one purpose, one data scope, an owner and an expiry'], allowed: ['svc.events.read', 'svc.fabric.write', 'svc.ledger.read'], never: 'No interactive login, no broad access, nothing unrelated to its purpose.' },
};

export interface Ctx {
  role: RoleId;
  /** The requester would be approving or granting their own work or access. */
  ownWork?: boolean; selfApproval?: boolean;
  /** For service identities: permissions that fit the stated purpose. */
  purpose?: string[];
}
export interface SodRule {
  id: string; title: string; why: string; safeguard: string;
  /** Returns the permissions involved when the set breaks the rule, else null. */
  check(set: ReadonlySet<string>, ctx: Ctx): string[] | null;
}
const has = (s: ReadonlySet<string>, ...ids: string[]) => ids.filter((i) => s.has(i));
const both = (a: string[], b: string[]) => (s: ReadonlySet<string>) => { const x = has(s, ...a), y = has(s, ...b); return x.length && y.length ? [...x, ...y] : null; };

export const SOD_RULES: SodRule[] = [
  { id: 'J1', title: 'Prepare and approve the same journal', why: 'One person could invent a journal and approve it, with nobody checking.', safeguard: 'Someone else approves, so keep only one side.', check: (s) => both(['jnl.prepare', 'jnl.post'], ['jnl.approve'])(s) },
  { id: 'T1', title: 'Prepare and approve the same treasury transfer', why: 'Money could be moved with no independent check.', safeguard: 'Preparer and approver must be different people.', check: (s) => both(['tre.transfer.prepare'], ['tre.transfer.approve'])(s) },
  { id: 'P1', title: 'Prepare and approve or release the same payroll batch', why: 'Someone could pay themselves or a ghost employee unchecked.', safeguard: 'A different person approves and releases the batch.', check: (s) => both(['pr.batch.prepare'], ['pr.batch.approve', 'pr.batch.release'])(s) },
  { id: 'S1', title: 'Change a supplier or beneficiary and approve or release a payment to them', why: 'The person could redirect money to themselves and send it.', safeguard: 'Separate people change suppliers and approve or release payments.', check: (s) => both(['sup.change'], ['pay.approve', 'pay.release', 'ap.invoice.approve', 'svc.payments.release'])(s) },
  { id: 'W1', title: 'Create and approve the same write-off or high-risk adjustment', why: 'Debt could be wiped without anyone else looking.', safeguard: 'Someone else approves, and higher amounts need a second approver.', check: (s) => both(['ar.writeoff.prepare', 'ar.adjust.prepare'], ['ar.writeoff.approve', 'ar.adjust.approve'])(s) },
  { id: 'AP1', title: 'Enter and approve the same invoice', why: 'A fake invoice could be entered and approved by one person.', safeguard: 'An independent approver signs off invoices the requester entered.', check: (s, c) => (both(['ap.invoice.enter'], ['ap.invoice.approve'])(s) ?? (c.ownWork && s.has('ap.invoice.approve') ? ['ap.invoice.approve'] : null)) },
  { id: 'A1', title: 'Request, grant or approve your own access', why: 'Access controls only work if someone else checks them.', safeguard: 'An independent manager or system owner approves.', check: (s, c) => (c.selfApproval ? [...has(s, 'iam.grant', 'iam.approve')].concat(c.selfApproval && !has(s, 'iam.grant', 'iam.approve').length ? ['iam.request'] : []) : both(['iam.request'], ['iam.grant', 'iam.approve'])(s)) },
  { id: 'U1', title: 'Audit access with write, approval or administration', why: 'Auditors must be independent: they read evidence, they do not change it.', safeguard: 'Keep audit access read-only.', check: (s, c) => (c.role === 'audit' ? [...s].filter((id) => PERM[id] && PERM[id].kind !== 'read') : null) },
  { id: 'V1', title: 'Service identity with interactive or unrelated access', why: 'A service account anyone can log into, or with access it does not need, is an open door.', safeguard: 'Narrow, non-interactive, and only for the stated purpose.', check: (s, c) => (c.role === 'service' ? [...s].filter((id) => id === 'svc.interactive' || (c.purpose && !c.purpose.includes(id) && id.startsWith('svc.'))) : null) },
];
export const RULE_BY_ID = Object.fromEntries(SOD_RULES.map((r) => [r.id, r])) as Record<string, SodRule>;

/** Which rules a permission set breaks (with the permissions involved). */
export function conflictsOf(set: Iterable<string>, ctx: Ctx): { rule: SodRule; perms: string[] }[] {
  const s = new Set(set), out: { rule: SodRule; perms: string[] }[] = [];
  for (const rule of SOD_RULES) { const p = rule.check(s, ctx); if (p && p.length) out.push({ rule, perms: [...new Set(p)] }); }
  return out;
}
