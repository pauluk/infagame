import type { Ctx, Env, RoleId } from './catalog';

/** All people, systems, IDs and approvals in the Access Review are fictional. Avatar seeds are random strings, never names, emails or employee IDs. */
export type Action = 'approve' | 'amend' | 'reject' | 'info' | 'escalate';
export interface Person { seed: string; staffId: string; name: string; team: string; role: RoleId; title: string; manager: string }
export interface Choice { id: string; label: string }

export const REJECT_REASONS: Choice[] = [
  { id: 'sod', label: 'A segregation-of-duties conflict that cannot be fixed by trimming the request' },
  { id: 'self', label: 'The requester would approve or grant their own access' },
  { id: 'role', label: 'The access does not fit the role at all' },
  { id: 'env', label: 'Wrong environment for the stated reason' },
  { id: 'noneed', label: 'No business need has been shown' },
];
export const INFO_ITEMS: Choice[] = [
  { id: 'reason', label: 'A clear business reason' }, { id: 'duration', label: 'A start and end date (how long)' }, { id: 'owner', label: 'A named owner or approver' },
  { id: 'scope', label: 'The exact data scope' }, { id: 'env', label: 'Which environment is needed' },
];
export const APPROVERS: Choice[] = [
  { id: 'indep_mgr', label: 'An independent manager (outside the requester’s reporting line)' }, { id: 'sys_owner', label: 'The system owner' },
  { id: 'line_mgr', label: 'The requester’s own line manager' }, { id: 'self', label: 'The requester themselves' },
  { id: 'ap_indep', label: 'An independent Accounts Payable approver' }, { id: 'ar_second', label: 'A second Accounts Receivable approver' }, { id: 'payroll_ctrl', label: 'The payroll controller' },
];

export interface AccessRequest {
  id: string; person: Person; env: Env; area: string; reason: string; days: number;
  /** What they hold now, what they ask for in total (current is included in requested), and extra cards the player may add. */
  current: string[]; requested: string[]; tray: string[];
  ctx: Omit<Ctx, 'role'>; sla: number;
  /** The least-privilege answer. */
  ideal: { action: Action; set: string[]; env: Env; acceptable?: Action[]; escalateTo?: string; info?: string[]; reject?: string[] };
  /** Business need the reason states (used by the policy checker to flag a possible gap). */
  needs?: string[];
  limit?: string; teach: string;
}
const person = (seed: string, staffId: string, name: string, team: string, role: RoleId, title: string, manager: string): Person => ({ seed, staffId, name, team, role, title, manager });

export const REQUESTS: AccessRequest[] = [
  { id: 'R01', person: person('k3f9a1', 'ST-4102', 'Marisol Vance', 'Accounting', 'accounting', 'Accountant', 'Hollis Bright'), env: 'Test', area: 'Journals and General Ledger', days: 30,
    reason: 'Prepare month-end accrual journals in Test while I learn the new template.',
    current: ['gl.read'], requested: ['gl.read', 'jnl.prepare', 'jnl.post'], tray: ['gl.report', 'jnl.approve'], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['gl.read', 'jnl.prepare'], env: 'Test' }, needs: ['jnl.prepare'],
    teach: 'Preparing a journal is not the same as posting it. Posting changes the ledger, so it stays with a separate reviewer.' },
  { id: 'R02', person: person('p7d2c8', 'ST-1187', 'Idris Okoye', 'Accounting', 'accounting', 'Senior Accountant', 'Hollis Bright'), env: 'Production', area: 'Journals', days: 90,
    reason: 'I am a senior accountant. Approving my own journals would save the team time.',
    current: ['gl.read', 'jnl.prepare'], requested: ['gl.read', 'jnl.prepare', 'jnl.approve'], tray: ['gl.report'], ctx: { ownWork: true }, sla: 120,
    ideal: { action: 'amend', set: ['gl.read', 'jnl.prepare'], env: 'Production', acceptable: ['reject'] },
    teach: 'Seniority does not remove a conflict. Someone who prepares journals must not approve them: another person reviews.' },
  { id: 'R03', person: person('m2x6q4', 'ST-3320', 'Noor Haddad', 'Treasury Management Team', 'treasury', 'Treasury Analyst', 'Amara Teague'), env: 'Production', area: 'Treasury', days: 180,
    reason: 'Prepare the daily liquidity transfers. The treasury manager approves them.',
    current: ['tre.cash.view'], requested: ['tre.cash.view', 'tre.transfer.prepare'], tray: ['tre.transfer.approve'], ctx: {}, sla: 90,
    ideal: { action: 'approve', set: ['tre.cash.view', 'tre.transfer.prepare'], env: 'Production' }, needs: ['tre.transfer.prepare'],
    teach: 'This request is already least privilege: they can prepare, someone else approves. Approving it unchanged is the right call.' },
  { id: 'R04', person: person('w8n1v5', 'ST-2045', 'Tobias Lindqvist', 'Treasury Management Team', 'treasury', 'Treasury Manager (newly promoted)', 'Amara Teague'), env: 'Production', area: 'Treasury', days: 365,
    reason: 'I was promoted to manager, so I need to approve transfers. I will keep preparing them too.',
    current: ['tre.cash.view', 'tre.transfer.prepare'], requested: ['tre.cash.view', 'tre.transfer.prepare', 'tre.transfer.approve'], tray: [], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['tre.cash.view', 'tre.transfer.approve'], env: 'Production' }, needs: ['tre.transfer.approve'],
    teach: 'A change of role should replace access, not pile on top of it. Keep approval, remove preparation.' },
  { id: 'R05', person: person('b5h9z3', 'ST-5521', 'Priyanka Rao', 'Fraud Team', 'fraud', 'Fraud Analyst', 'Joss Calder'), env: 'Production', area: 'Fraud cases and payments', days: 180,
    reason: 'Handle suspicious payment cases end to end, including releasing genuine ones and fixing supplier details.',
    current: ['fr.alert.review'], requested: ['fr.alert.review', 'fr.case.manage', 'fr.hold.place', 'pay.release', 'sup.change'], tray: ['gl.read'], ctx: {}, sla: 150,
    ideal: { action: 'amend', set: ['fr.alert.review', 'fr.case.manage', 'fr.hold.place'], env: 'Production' }, needs: ['fr.case.manage', 'fr.hold.place'],
    teach: 'Fraud analysts can place or recommend holds. Releasing money and changing beneficiaries stay with other teams.' },
  { id: 'R06', person: person('r4t7e2', 'ST-6014', 'Kai Brennan', 'Fraud Team', 'fraud', 'Fraud Trainee', 'Joss Calder'), env: 'Production', area: 'Fraud cases', days: 14,
    reason: 'Practising on example cases during onboarding week.',
    current: [], requested: ['fr.alert.review', 'fr.case.manage'], tray: ['fr.hold.place'], ctx: {}, sla: 90,
    ideal: { action: 'amend', set: ['fr.alert.review', 'fr.case.manage'], env: 'Training' }, needs: ['fr.alert.review'],
    teach: 'Practice belongs in Training, with invented data. Production is for live work.' },
  { id: 'R07', person: person('c1y8u6', 'ST-2210', 'Elodie Marchetti', 'Pensions', 'pensions', 'Pensions Officer', 'Wynn Aldous'), env: 'Production', area: 'Pensions records and payroll', days: 365,
    reason: 'Update records for the Northbank scheme, and sign off the payroll uplift that follows.',
    current: ['pen.view'], requested: ['pen.view', 'pen.update', 'pr.batch.approve'], tray: ['pr.view'], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['pen.view', 'pen.update'], env: 'Production' }, needs: ['pen.update'],
    teach: 'Pensions staff update their own scheme’s records. Payroll approval is a separate duty and is not granted by default.' },
  { id: 'R08', person: person('n9j3k7', 'ST-3908', 'Dmitri Volkov', 'Payroll', 'payroll', 'Payroll Administrator', 'Odette Marsh'), env: 'Production', area: 'Payroll', days: 30,
    reason: 'Cover for the payroll lead: I will prepare and release the March batch.',
    current: ['pr.view', 'pr.batch.prepare'], requested: ['pr.view', 'pr.batch.prepare', 'pr.batch.release'], tray: ['pr.batch.review'], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['pr.view', 'pr.batch.prepare'], env: 'Production', acceptable: ['escalate'], escalateTo: 'payroll_ctrl' }, needs: ['pr.batch.prepare'],
    teach: 'Whoever prepares a batch cannot release it. Someone else, such as the payroll controller, releases it.' },
  { id: 'R09', person: person('f6s2d9', 'ST-4477', 'Saoirse Doyle', 'Payroll', 'payroll', 'Payroll Reviewer', 'Odette Marsh'), env: 'Test', area: 'Payroll', days: 60,
    reason: 'Review payroll batches in Test before the new process goes live.',
    current: ['pr.view'], requested: ['pr.view', 'pr.batch.review'], tray: ['pr.batch.approve'], ctx: {}, sla: 90,
    ideal: { action: 'approve', set: ['pr.view', 'pr.batch.review'], env: 'Test' }, needs: ['pr.batch.review'],
    teach: 'Reviewing is the right level for this job and the environment is Test. Nothing to trim.' },
  { id: 'R10', person: person('t8l4g1', 'ST-7301', 'Hamza Qureshi', 'Accounts Payable', 'ap_member', 'AP Clerk', 'Lucinda Ford'), env: 'Test', area: 'Accounts Payable and Suppliers', days: 60,
    reason: 'Enter invoices and fix supplier bank details when they come back wrong.',
    current: ['ap.invoice.enter'], requested: ['ap.invoice.enter', 'sup.view', 'sup.change'], tray: ['gl.read'], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['ap.invoice.enter', 'sup.view'], env: 'Test' }, needs: ['ap.invoice.enter', 'sup.view'],
    teach: 'Clerks can look up supplier details. Changing where a supplier is paid is high risk and goes through a separate, checked process.' },
  { id: 'R11', person: person('v3b7m5', 'ST-1630', 'Lucinda Ford', 'Accounts Payable', 'ap_manager', 'AP Manager', 'Rhea Kingsley'), env: 'Production', area: 'Accounts Payable, Suppliers, Payments', days: 365, limit: '£10,000',
    reason: 'Approve invoices up to £10,000, keep supplier data tidy and release the payment run at month end.',
    current: ['ap.invoice.review'], requested: ['ap.invoice.review', 'ap.invoice.approve', 'sup.change', 'pay.release'], tray: ['sup.view', 'gl.read'], ctx: {}, sla: 150,
    ideal: { action: 'amend', set: ['ap.invoice.review', 'ap.invoice.approve', 'sup.view'], env: 'Production' }, needs: ['ap.invoice.approve'],
    teach: 'A manager can approve within a limit. Changing suppliers and releasing payments together is exactly how money is diverted.' },
  { id: 'R12', person: person('h2q8w4', 'ST-1702', 'Mateo Ibarra', 'Accounts Payable', 'ap_manager', 'AP Manager (covering)', 'Rhea Kingsley'), env: 'Production', area: 'Accounts Payable', days: 14, limit: '£10,000',
    reason: 'Cover for absences this fortnight: I will enter invoices as well as approving them as usual.',
    current: ['ap.invoice.review', 'ap.invoice.approve'], requested: ['ap.invoice.review', 'ap.invoice.approve', 'ap.invoice.enter'], tray: ['sup.view'], ctx: { ownWork: true }, sla: 150,
    ideal: { action: 'escalate', set: ['ap.invoice.review', 'ap.invoice.approve', 'ap.invoice.enter'], env: 'Production', escalateTo: 'ap_indep', acceptable: ['amend'] }, needs: ['ap.invoice.enter'],
    teach: 'The cover need is real, so the safeguard is an independent approver for any invoice Mateo enters. He cannot approve his own work.' },
  { id: 'R13', person: person('z5c1x9', 'ST-8120', 'Chidi Okafor', 'Accounts Receivable', 'ar_member', 'Collections Officer', 'Gareth Whitlock'), env: 'Production', area: 'Accounts Receivable', days: 365,
    reason: 'Record receipts against balances and work my assigned collection cases.',
    current: ['ar.balance.view'], requested: ['ar.balance.view', 'ar.receipt.record', 'ar.case.work'], tray: ['ar.adjust.prepare'], ctx: {}, sla: 90,
    ideal: { action: 'approve', set: ['ar.balance.view', 'ar.receipt.record', 'ar.case.work'], env: 'Production' }, needs: ['ar.receipt.record', 'ar.case.work'],
    teach: 'Matches the role exactly, and nothing high risk is involved. Approve as submitted.' },
  { id: 'R14', person: person('j9e5r2', 'ST-8133', 'Beatrix Holloway', 'Accounts Receivable', 'ar_member', 'Collections Officer', 'Gareth Whitlock'), env: 'Production', area: 'Accounts Receivable', days: 365,
    reason: 'I record receipts, and I also work the overdue-collections queue every day.',
    current: ['ar.balance.view'], requested: ['ar.balance.view', 'ar.receipt.record'], tray: ['ar.case.work', 'ar.writeoff.prepare', 'ar.adjust.prepare'], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['ar.balance.view', 'ar.receipt.record', 'ar.case.work'], env: 'Production' }, needs: ['ar.receipt.record', 'ar.case.work'],
    teach: 'Least privilege also means enough access to do the job. The reason mentions collection work, so a justified permission was missed.' },
  { id: 'R15', person: person('x4k8t1', 'ST-1215', 'Gareth Whitlock', 'Accounts Receivable', 'ar_manager', 'AR Manager', 'Rhea Kingsley'), env: 'Production', area: 'Accounts Receivable write-offs', days: 7, limit: '£10,000',
    reason: 'Approve the £48,000 write-off for the Harcourt account. My limit is £10,000.',
    current: ['ar.balance.view', 'ar.adjust.approve'], requested: ['ar.balance.view', 'ar.adjust.approve', 'ar.writeoff.approve'], tray: ['ar.agency.refer'], ctx: {}, sla: 150,
    ideal: { action: 'escalate', set: ['ar.balance.view', 'ar.adjust.approve', 'ar.writeoff.approve'], env: 'Production', escalateTo: 'ar_second' }, needs: ['ar.writeoff.approve'],
    teach: 'The role may approve write-offs, but £48,000 is over the stated limit. Higher-risk actions need a second approver.' },
  { id: 'R16', person: person('d7p3a6', 'ST-9041', 'Imogen Castellano', 'Audit', 'audit', 'Internal Auditor', 'Brannock Hale'), env: 'Production', area: 'Audit evidence', days: 90,
    reason: 'Check evidence packs and tick journals off to save the finance team time.',
    current: ['aud.report.read'], requested: ['aud.report.read', 'aud.evidence.read', 'jnl.approve', 'iam.grant'], tray: ['gl.read'], ctx: {}, sla: 120,
    ideal: { action: 'amend', set: ['aud.report.read', 'aud.evidence.read'], env: 'Production' }, needs: ['aud.evidence.read'],
    teach: 'Auditors must stay independent: read-only. No approvals, no edits, no role administration.' },
  { id: 'R17', person: person('q1m6n3', 'ST-9055', 'Ravi Menon', 'Audit', 'audit', 'Audit Analyst', 'Brannock Hale'), env: 'Test', area: 'Audit evidence', days: 45,
    reason: 'Read approved evidence and reports to rehearse the quarterly audit in Test.',
    current: [], requested: ['aud.evidence.read', 'aud.report.read'], tray: ['jnl.approve'], ctx: {}, sla: 90,
    ideal: { action: 'approve', set: ['aud.evidence.read', 'aud.report.read'], env: 'Test' }, needs: ['aud.evidence.read'],
    teach: 'Read-only access to approved evidence is exactly what an auditor needs. Approve.' },
  { id: 'R18', person: person('l8v2h5', 'SV-0021', 'svc-fabric-loader', 'Service identity', 'service', 'Service identity · owner Data Platform', 'Owner: Data Platform lead'), env: 'Production', area: 'Event stream to Fabric', days: 90,
    reason: 'Nightly job that lands event metadata in the Fabric Bronze zone.',
    current: [], requested: ['svc.events.read', 'svc.fabric.write', 'svc.ledger.write', 'svc.interactive'], tray: ['svc.ledger.read'], ctx: { purpose: ['svc.events.read', 'svc.fabric.write'] }, sla: 120,
    ideal: { action: 'amend', set: ['svc.events.read', 'svc.fabric.write'], env: 'Production' }, needs: ['svc.events.read', 'svc.fabric.write'],
    teach: 'A service identity does one job. It does not write to the ledger and nobody should be able to log in as it.' },
  { id: 'R19', person: person('g3w9y7', 'SV-0034', 'svc-recon-checker', 'Service identity', 'service', 'Service identity · owner not named', 'Owner: not stated'), env: 'Production', area: 'Reconciliation checks', days: 0,
    reason: 'Runs reconciliation checks. (No owner named and no expiry given.)',
    current: [], requested: ['svc.ledger.read'], tray: [], ctx: { purpose: ['svc.ledger.read'] }, sla: 90,
    ideal: { action: 'info', set: ['svc.ledger.read'], env: 'Production', info: ['owner', 'duration'] },
    teach: 'The access is narrow, but a service identity needs a named owner and an expiry. Ask before granting anything.' },
  { id: 'R20', person: person('u6o4s8', 'ST-7788', 'Tamsin Reyes', 'Systems Analysis', 'accounting', 'Systems Analyst', 'Hollis Bright'), env: 'Production', area: 'Identity and Access', days: 365,
    reason: 'Faster if I sort my own access out. I will approve it myself.',
    current: ['iam.request'], requested: ['iam.request', 'iam.grant', 'iam.approve'], tray: [], ctx: { selfApproval: true }, sla: 90,
    ideal: { action: 'reject', set: ['iam.request'], env: 'Production', reject: ['self'], acceptable: ['escalate'] },
    teach: 'Nobody grants or approves their own access. Role administration is for administrators only.' },
  { id: 'R21', person: person('e2a5z1', 'ST-6609', 'Callum Frost', 'Accounts Payable', 'ap_member', 'AP Clerk', 'Lucinda Ford'), env: 'Production', area: 'Payments', days: 0,
    reason: 'Need access.',
    current: ['ap.invoice.enter'], requested: ['ap.invoice.enter', 'pay.release'], tray: [], ctx: {}, sla: 90,
    ideal: { action: 'info', set: ['ap.invoice.enter'], env: 'Production', info: ['reason', 'duration'], acceptable: ['reject'], reject: ['noneed'] },
    teach: 'A vague reason and no end date is not enough for access that moves money. Ask for the business reason and the duration.' },
  { id: 'R22', person: person('y4n7c2', 'ST-8402', 'Winston Achebe', 'Treasury Management Team', 'treasury', 'Treasury Trainee', 'Amara Teague'), env: 'Training', area: 'Treasury', days: 21,
    reason: 'Learn the cash and transfer screens in Training before I join the daily rota.',
    current: [], requested: ['tre.cash.view', 'tre.transfer.prepare'], tray: ['tre.transfer.approve'], ctx: {}, sla: 90,
    ideal: { action: 'approve', set: ['tre.cash.view', 'tre.transfer.prepare'], env: 'Training' }, needs: ['tre.cash.view'],
    teach: 'Preparing transfers in Training, with invented data and a short end date, is exactly right. Approve it as submitted.' },
];
export const REQUEST_BY_ID = Object.fromEntries(REQUESTS.map((r) => [r.id, r])) as Record<string, AccessRequest>;
