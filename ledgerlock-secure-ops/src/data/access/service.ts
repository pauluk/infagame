import type { Env } from './catalog';
import type { Person } from './requests';

/** Service access form briefs and access-review records. Synthetic. No real credentials: the form only ever shows masked placeholders. */
export interface ServiceBrief {
  id: string; title: string; story: string;
  purpose: string; target: string; env: Env; scope: string;
  required: string[]; allowed: string[]; maxDays: number;
}
export const OWNERS = ['Data Platform lead', 'Payments Operations lead', 'Finance Systems owner', 'Secure Ops lead'];
export const NO_OWNER = '(not named)';
export const TARGETS = ['Fabric Bronze landing zone', 'Event Stream Hall', 'Finance Core (ledger)', 'BACS Vault', 'Payroll'];
export const SCOPES = ['Masked event metadata only', 'Masked ledger totals', 'All ledger data', 'Unmasked customer records'];
export const SERVICE_ACTIONS: { id: string; label: string }[] = [
  { id: 'svc.events.read', label: 'Read event metadata (non-interactive)' }, { id: 'svc.fabric.write', label: 'Write to the Fabric landing zone' },
  { id: 'svc.ledger.read', label: 'Read masked ledger totals (non-interactive)' }, { id: 'svc.ledger.write', label: 'Write to the ledger' },
  { id: 'svc.payments.release', label: 'Release payments' }, { id: 'svc.interactive', label: 'Interactive login for the service account' },
];
export const SERVICE_APPROVERS = ['Independent manager', 'System owner', 'The service owner (same person)', 'Nobody: auto-approve'];
export const SERVICE_BRIEFS: ServiceBrief[] = [
  { id: 'SB1', title: 'Nightly Fabric loader', story: 'A nightly job copies event metadata from the Event Stream Hall into the Fabric Bronze zone. It is owned by the Data Platform lead. Fill in the form with only what the job needs.',
    purpose: 'Land event metadata in Fabric Bronze', target: 'Fabric Bronze landing zone', env: 'Production', scope: 'Masked event metadata only', required: ['svc.events.read', 'svc.fabric.write'], allowed: ['svc.events.read', 'svc.fabric.write'], maxDays: 90 },
  { id: 'SB2', title: 'Reconciliation checker', story: 'A service compares masked ledger totals with the event counts every hour in the Test environment. It is owned by the Finance Systems owner.',
    purpose: 'Compare ledger totals with event counts', target: 'Finance Core (ledger)', env: 'Test', scope: 'Masked ledger totals', required: ['svc.ledger.read'], allowed: ['svc.ledger.read'], maxDays: 60 },
  { id: 'SB3', title: 'Event watcher', story: 'A monitor reads event metadata to raise alerts about queue backlogs. It never changes anything. It is owned by the Secure Ops lead.',
    purpose: 'Watch event queues for backlogs', target: 'Event Stream Hall', env: 'Production', scope: 'Masked event metadata only', required: ['svc.events.read'], allowed: ['svc.events.read'], maxDays: 90 },
];

export type ReviewVerdict = 'keep' | 'remove' | 'add' | 'independent';
export interface ReviewRecord {
  id: string; who: Person | { seed: string; staffId: string; name: string; team: string; role: string; title: string; manager: string };
  status: 'active' | 'left' | 'moved'; env: Env; perm: string; role: string;
  requestedBy: string; approvedBy: string | null; lastUsedDays: number; overdueDays: number;
  issue: 'stale' | 'excessive' | 'conflict' | 'orphaned' | 'missing' | 'ok'; ideal: ReviewVerdict; addPerm?: string; why: string; note: string;
}
const who = (seed: string, staffId: string, name: string, team: string, role: string, title: string, manager: string) => ({ seed, staffId, name, team, role, title, manager });
export const REVIEW_RECORDS: ReviewRecord[] = [
  { id: 'RV01', who: who('aa11b2', 'ST-3301', 'Orla Finch', 'Accounting', 'accounting', 'Accountant', 'Hollis Bright'), status: 'active', env: 'Production', perm: 'gl.read', role: 'Accounting', requestedBy: 'Orla Finch', approvedBy: 'Hollis Bright', lastUsedDays: 3, overdueDays: 0, issue: 'ok', ideal: 'keep', why: 'Used this week, part of the role, approved by the line manager.', note: 'Everything lines up: removing it would stop their work.' },
  { id: 'RV02', who: who('bb22c3', 'ST-2204', 'Pascal Weir', 'Accounting', 'accounting', 'Accountant', 'Hollis Bright'), status: 'active', env: 'Production', perm: 'jnl.post', role: 'Accounting', requestedBy: 'Pascal Weir', approvedBy: 'Hollis Bright', lastUsedDays: 410, overdueDays: 200, issue: 'stale', ideal: 'remove', why: 'Not used for 410 days and posting is a high-risk permission the role does not normally need.', note: 'Stale access is unused risk.' },
  { id: 'RV03', who: who('cc33d4', 'ST-5120', 'Linnea Berg', 'Treasury Management Team', 'treasury', 'Treasury Analyst', 'Amara Teague'), status: 'active', env: 'Production', perm: 'tre.transfer.approve', role: 'Treasury', requestedBy: 'Linnea Berg', approvedBy: 'Linnea Berg', lastUsedDays: 12, overdueDays: 90, issue: 'conflict', ideal: 'independent', why: 'She also prepares transfers, and the approval was granted by herself: a segregation-of-duties conflict with no independent approval.', note: 'Send it for independent review.' },
  { id: 'RV04', who: who('dd44e5', 'ST-1450', 'Emeka Obi', 'Accounts Receivable', 'ar_member', 'Collections Officer', 'Gareth Whitlock'), status: 'active', env: 'Production', perm: 'ar.writeoff.approve', role: 'Accounts Receivable team member', requestedBy: 'Emeka Obi', approvedBy: 'Gareth Whitlock', lastUsedDays: 5, overdueDays: 30, issue: 'excessive', ideal: 'remove', why: 'Team members work cases; write-off approval belongs to managers.', note: 'Role mismatch: excessive access.' },
  { id: 'RV05', who: who('ee55f6', 'ST-0990', 'Vera Lindholm', 'Payroll', 'payroll', 'Payroll Administrator', 'Odette Marsh'), status: 'left', env: 'Production', perm: 'pr.batch.release', role: 'Payroll', requestedBy: 'Vera Lindholm', approvedBy: 'Odette Marsh', lastUsedDays: 120, overdueDays: 120, issue: 'orphaned', ideal: 'remove', why: 'The person left the company 120 days ago but still holds payroll release.', note: 'Orphaned access: remove it now.' },
  { id: 'RV06', who: who('ff66a7', 'ST-6420', 'Sunil Bhatt', 'Accounts Receivable', 'ar_member', 'Collections Officer', 'Gareth Whitlock'), status: 'active', env: 'Production', perm: 'ar.balance.view', role: 'Accounts Receivable team member', requestedBy: 'Sunil Bhatt', approvedBy: 'Gareth Whitlock', lastUsedDays: 2, overdueDays: 0, issue: 'missing', ideal: 'add', addPerm: 'ar.case.work', why: 'His role works collection cases daily, but he has no permission to do so and has been borrowing a colleague’s login.', note: 'Add the missing least-privilege permission (work collection cases).' },
  { id: 'RV07', who: who('gg77b8', 'SV-0012', 'svc-old-exporter', 'Service identity', 'service', 'Service identity', 'Owner: not named'), status: 'active', env: 'Production', perm: 'svc.ledger.write', role: 'Service identity', requestedBy: 'unknown', approvedBy: null, lastUsedDays: 300, overdueDays: 210, issue: 'orphaned', ideal: 'remove', why: 'No owner, no approver, no expiry and unused for 300 days, yet it can write to the ledger.', note: 'Orphaned service identity: remove.' },
  { id: 'RV08', who: who('hh88c9', 'ST-7011', 'Amalia Strand', 'Audit', 'audit', 'Internal Auditor', 'Brannock Hale'), status: 'active', env: 'Production', perm: 'aud.evidence.read', role: 'Audit', requestedBy: 'Amalia Strand', approvedBy: 'Brannock Hale', lastUsedDays: 9, overdueDays: 0, issue: 'ok', ideal: 'keep', why: 'Read-only evidence access, used regularly, approved by her manager.', note: 'Justified: keep.' },
  { id: 'RV09', who: who('ii99d1', 'ST-2870', 'Joaquin Pruitt', 'Accounts Payable', 'ap_manager', 'AP Manager', 'Rhea Kingsley'), status: 'active', env: 'Production', perm: 'sup.change', role: 'Accounts Payable manager', requestedBy: 'Joaquin Pruitt', approvedBy: 'Joaquin Pruitt', lastUsedDays: 20, overdueDays: 150, issue: 'conflict', ideal: 'independent', why: 'He can change suppliers and also approves invoices to them, and approved the access himself.', note: 'Needs an independent review of both the permission and its approval.' },
  { id: 'RV10', who: who('jj10e2', 'ST-4333', 'Marguerite Doyle', 'Pensions', 'pensions', 'Pensions Officer', 'Wynn Aldous'), status: 'moved', env: 'Production', perm: 'pen.update', role: 'Pensions', requestedBy: 'Marguerite Doyle', approvedBy: 'Wynn Aldous', lastUsedDays: 260, overdueDays: 60, issue: 'stale', ideal: 'remove', why: 'She moved to another team 260 days ago and has not used pension updates since.', note: 'Moved on: remove the access she no longer needs.' },
  { id: 'RV11', who: who('kk21f3', 'ST-5902', 'Felix Ardent', 'Fraud Team', 'fraud', 'Fraud Analyst', 'Joss Calder'), status: 'active', env: 'Production', perm: 'fr.hold.place', role: 'Fraud', requestedBy: 'Felix Ardent', approvedBy: 'Joss Calder', lastUsedDays: 1, overdueDays: 0, issue: 'ok', ideal: 'keep', why: 'Core to the role: used daily and approved.', note: 'Justified: keep.' },
  { id: 'RV12', who: who('ll32g4', 'ST-3718', 'Rosalind Grey', 'Fraud Team', 'fraud', 'Fraud Analyst', 'Joss Calder'), status: 'active', env: 'Production', perm: 'pay.release', role: 'Fraud', requestedBy: 'Rosalind Grey', approvedBy: 'Joss Calder', lastUsedDays: 45, overdueDays: 75, issue: 'excessive', ideal: 'remove', why: 'Fraud analysts hold payments, they do not release them. It was granted as a temporary favour and never removed.', note: 'Role mismatch: excessive access.' },
];
