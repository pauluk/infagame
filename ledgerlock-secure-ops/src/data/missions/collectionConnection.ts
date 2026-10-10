import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';

const EXPORT = propTarget('debt_recovery', 'export_screen');
const STATION = propTarget('agency_handoff', 'transfer_station');
const RECEIPT = propTarget('agency_handoff', 'receipt_monitor');
const ROUTE = routeTarget('debt_agency_export');

export default makeScenario({
  id: 'collection-connection', order: 3, title: 'The Collection Connection', tagline: 'An agency hand-off carries more data than it should. Share only what is needed.', difficulty: 'Medium',
  theme: 'Responsible data sharing: send the minimum to the approved destination.',
  pointsRoom: 'agency_handoff', incidentRoute: 'debt_agency_export', clock: ['09:00', '11:00', 'Agency file 11:00'], parSeconds: 480,
  alert: { severity: 'Medium', headline: 'Outbound agency hand-off contains an excessive data field', symptoms: ['Export includes a full date-of-birth field', 'Destination looks right but scope was never reviewed', 'Card repayments are unaffected'], impact: 'Sharing more personal data than needed breaks the data-sharing agreement.' },
  briefing: ['The export to the fictional agency includes a field the agency does not need.', 'Inspect the export scope, confirm the destination is the approved fictional agency, remove unnecessary fields, hold the transfer until the corrected file is approved, send it and reconcile the receipt.', 'All debts and people are invented.'],
  evidence: [
    { id: 'ev_export_scope', name: 'Export scope', sourceRoom: 'debt_recovery', requiredPass: 'debt_read_pass', sensitivity: 'Masked debt data', objective: 'p1', pathStep: 'debt_recovery' },
    { id: 'ev_destination', name: 'Destination check', sourceRoom: 'agency_handoff', requiredPass: 'agency_audit_pass', sensitivity: 'Masked manifest (synthetic)', objective: 'p2', pathStep: 'agency_handoff' },
    { id: 'ev_agency_receipt', name: 'Agency delivery receipt', sourceRoom: 'agency_handoff', requiredPass: 'agency_audit_pass', sensitivity: 'Delivery receipt, masked', objective: 'p6', pathStep: 'agency_handoff' },
  ],
  evidencePath: ['debt_recovery', 'agency_handoff'],
  passes: [
    { pass: 'debt_read_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first.' },
    { pass: 'agency_audit_pass', when: st('scope'), hint: 'Inspect the export scope first. It will point at the hand-off.' },
  ],
  required: ['debt_read_pass', 'agency_audit_pass'],
  steps: [
    { id: 'scope', at: EXPORT, tool: 'e', evidence: 'ev_export_scope', status: [[EXPORT, 'suspect']], mark: [['debt_agency_export', 'suspicious']],
      choice: { title: 'Open the export scope', body: 'How do you want to look at the records? Masked is enough to review the fields.', options: [
        { id: 'masked', label: 'Open the masked sample', detail: 'Names, references and amounts masked.', correct: true, flags: ['masked_only'], result: 'Fields: reference, outstanding amount, debtor name (masked), employer name, date_of_birth_full. The last two are not needed by the agency.' },
        { id: 'full', label: 'Open the full records', detail: 'Unmasked synthetic data.', correct: false, completes: true, gain: { protection: -10 }, flags: ['unmasked'], result: 'Opened the full (synthetic) records. You did not need them: masking was enough.' }] } },
    { id: 'destination', at: STATION, tool: 'e', needs: ['scope'], needsMsg: 'Review the export scope first.', evidence: 'ev_destination', gain: { audit: 3 },
      info: { title: 'Agency Transfer Station', rows: [['Destination', 'Fictional Agency Ltd (approved list AGY-01)'], ['Approved', 'Yes: approved destination'], ['Channel', 'Secure link (simulated)'], ['Scope on file', 'Reference, amount, masked name']], body: 'The destination is the fictional approved agency. The scope in the export is wider than the approval.' } },
    { id: 'field', at: EXPORT, tool: 'lens', needs: ['scope'], needsMsg: 'Review the export scope first.',
      choice: { title: 'Forensic Lens: which field caused the hold?', body: 'Compare the export fields with the approved data-sharing scope.', options: [
        { id: 'dob', label: 'date_of_birth_full', detail: 'Full date of birth: not in the approved scope.', correct: true, result: 'Correct: date_of_birth_full is excess personal data and caused the hold.', gain: { audit: 4 } },
        { id: 'amount', label: 'outstanding_amount', detail: 'The agency needs this.', correct: false, result: 'The amount is part of the approved scope.' },
        { id: 'ref', label: 'debt_reference', detail: 'The agency needs this.', correct: false, result: 'The reference is part of the approved scope.' }] } },
    { id: 'remove_fields', at: EXPORT, tool: 'patch', needs: ['scope'], needsMsg: 'Review the export scope first.',
      choice: { title: 'Remove unnecessary fields', body: 'Edit the simulated export mapping.', options: [
        { id: 'excess', label: 'Remove date_of_birth_full and employer_name', detail: 'Keeps reference, amount and masked name.', correct: true, result: 'Export mapping v2.4 now sends only the approved fields.', gain: { protection: 4 } },
        { id: 'amount', label: 'Remove outstanding_amount', detail: 'Breaks the export.', correct: false, result: 'The agency needs the amount. Remove the excess personal fields instead.' },
        { id: 'all', label: 'Remove everything except the reference', detail: 'Too little to be useful.', correct: false, result: 'That is more than needed and the agency could not act on it.' }] }, fx: 'repair', status: [[EXPORT, 'fixed']] },
    { id: 'approve_corrected', at: STATION, tool: 'e', needs: ['remove_fields', 'hold'], needsMsg: 'Hold the transfer and correct the file before approving.',
      choice: { title: 'Approve the corrected file', body: 'Check the corrected simulated export before it is sent.', options: [
        { id: 'ok', label: 'Approve: only approved fields, approved destination', detail: 'Matches AGY-01 scope.', correct: true, result: 'Corrected file approved.', gain: { audit: 3 } },
        { id: 'skip', label: 'Send it without a second look', detail: 'Faster.', correct: false, result: 'A hold lifts only on an approved file. Check it first.' }] } },
    { id: 'reconcile_receipt', at: RECEIPT, tool: 'recon', needs: ['sent', 'receipt'], needsMsg: 'Waiting for the agency delivery receipt. Try again in a moment.', evidence: 'ev_agency_receipt', effect: (a) => { a.flag('reconciledAll'); },
      info: { title: 'Reconciliation: agency receipt vs approved export', rows: [['Source (approved export)', 'Corrected file v2.4, 40 records'], ['Source (receipt)', 'Fictional agency delivery receipt']], compare: { before: [['Original export', '41 records incl. excess fields'], ['Held', '1 transfer']], after: [['Approved export', '40 records, approved fields'], ['Agency receipt', '40 records, approved fields'], ['Difference', 'None']] }, body: 'The receipt matches the approved export exactly.' } },
  ],
  contain: [{ id: 'hold', target: ROUTE, scope: 'narrow', releaseId: 'sent', canRelease: (s) => (s.flags.st_approve_corrected ? true : 'Do not send yet: the corrected file is not approved. Approve it at the Agency Transfer Station first.'),
    cfg: { availability: 3, narrow: 1, effective: true, notes: [{ label: 'Holds', text: 'Only the agency export. Card repayments and other receipts keep processing.', tone: 'good' }, { label: 'Delays', text: 'Agency hand-offs wait until the corrected file is approved.', tone: 'warn' }] } }],
  goals: [
    goal('p1', 'primary', 'Inspect the export scope in Accounts Receivable & Debt Recovery', st('scope'), 'Press E at the Approved Agency Export Screen (C3).'),
    goal('p2', 'primary', 'Confirm the destination is the fictional approved agency', st('destination'), 'Request the Agency Audit Pass, then press E at the Agency Transfer Station (D3).'),
    goal('p3', 'primary', 'Remove unnecessary fields from the simulated export', st('remove_fields'), 'Patch Kit (4) at the export screen.'),
    goal('p4', 'primary', 'Hold the affected transfer until the corrected file is approved', (s) => !!s.flags.st_hold && !!s.flags.st_approve_corrected, 'Quarantine the Debt Agency Export route (3), then approve the corrected file.'),
    goal('p5', 'primary', 'Send the corrected simulated hand-off', st('sent'), 'Release the held route (3 again) once the file is approved.'),
    goal('p6', 'primary', 'Reconcile the agency receipt against the approved export', st('reconcile_receipt'), 'Reconciliation Wand (7) at the Delivery Receipt Monitor.'),
    goal('o1', 'optional', 'Keep card repayments and other debt receipts processing', (s) => !s.flags.collateral),
    goal('o2', 'optional', 'Use only masked records', (s) => !s.flags.unmasked && !!s.flags.masked_only),
    goal('o3', 'optional', 'Identify and explain the field that caused the hold', st('field')),
    goal('s1', 'stretch', 'No wrong answers and no hints', (s) => (s.data.wrong ?? 0) === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 6 minutes', (s) => !!s.flags.st_reconcile_receipt && s.elapsed < 360),
  ],
  setup: (a) => { a.data.receiptAt = 1e9; },
  tick: (a) => {
    const s = a.s;
    if (s.contained['route:card_receipt'] || s.contained['route:agency_receipt'] || s.contained['room:debt_recovery']) a.flag('collateral');
    if (s.flags.st_sent && !s.data.receiptAt_set) { s.data.receiptAt_set = true; s.data.receiptAt = s.elapsed + 12; }
    if (s.flags.st_sent && !s.flags.st_receipt && s.elapsed >= (s.data.receiptAt ?? 1e9)) { a.flag('st_receipt'); a.log('Fictional agency delivery receipt received.', 'good'); a.routeMark('debt_agency_export', 'restored'); }
  },
  debrief: { what: 'The agency export mapping included two fields (full date of birth and employer name) outside the approved data-sharing scope.',
    learn: 'Share the minimum needed. Check the destination and the scope, hold only the affected transfer, fix the mapping, get the corrected file approved and reconcile the receipt.',
    nextStep: () => 'Add a scope check to the export pipeline that blocks fields outside the approved list before any transfer is queued.',
    response: (s) => ['You held only the agency export route; card repayments and other receipts kept processing.', s.flags.unmasked ? 'You opened unmasked records when masked ones were enough.' : 'You used masked records only.', s.flags.st_field ? 'You identified date_of_birth_full as the cause.' : 'You did not use the lens to name the cause.'] },
  script: [['pass', 'debt_read_pass'], ['step', 'scope'], ['pass', 'agency_audit_pass'], ['step', 'destination'], ['step', 'field'], ['step', 'remove_fields'], ['contain', 'hold'], ['step', 'approve_corrected'], ['release', 'hold'], ['wait', 30], ['step', 'reconcile_receipt'], ['report']],
});
