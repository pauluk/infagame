import { goal, makeScenario, st } from './scenario';
import { propTarget } from '../targets';

const CAB = propTarget('bacs_vault', 'staging_cabinet');
const FILE = propTarget('bacs_vault', 'file_terminal');
const BANK = propTarget('bacs_vault', 'bank_monitor');
const AP = propTarget('finance_core', 'ap');
const REL = propTarget('payment_orchestration', 'release_controls');
const VAL = propTarget('payment_orchestration', 'validation_console');
const APPROVED = '£164,250.00', STAGED = '£184,250.00';

export default makeScenario({
  id: 'bacs-after-dark', order: 2, title: 'BACS After Dark', tagline: 'A staged payment batch changed after approval. Replace it safely before the cutoff.', difficulty: 'Easy',
  theme: 'Payment integrity: protect what leaves for the bank.',
  pointsRoom: 'bacs_vault', incidentRoute: 'supplier_payment_release', clock: ['01:30', '04:00', 'Payment cutoff 04:00'], parSeconds: 480,
  alert: { severity: 'High', headline: 'Staged BACS batch BF-0412 total differs from the approved total', symptoms: ['File checksum no longer matches the approval record', 'Release paused automatically', 'Other staged batches are unaffected'], impact: 'If sent unchecked, a supplier could be paid the wrong amount.' },
  briefing: ['Batch BF-0412 (synthetic) changed after approval. The payment cutoff is 04:00.', 'Inspect the batch, compare it with Finance Core, quarantine only that batch, create a clean replacement from trusted data, complete dual approval and reconcile the bank acknowledgement.', 'All suppliers, amounts and files are invented.'],
  evidence: [
    { id: 'ev_bf_meta', name: 'Batch BF-0412 file metadata', sourceRoom: 'bacs_vault', requiredPass: 'bacs_audit_pass', sensitivity: 'File metadata only (no payee details)', objective: 'p1', pathStep: 'bacs_vault' },
    { id: 'ev_approved_total', name: 'Approved total (Finance Core)', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked ledger totals', objective: 'p2', pathStep: 'finance_core' },
    { id: 'ev_dual', name: 'Dual-approval record', sourceRoom: 'payment_orchestration', requiredPass: 'payment_ops_pass', sensitivity: 'Approval metadata only', objective: 'p5', pathStep: 'payment_orchestration' },
    { id: 'ev_ack', name: 'Simulated bank acknowledgement', sourceRoom: 'bacs_vault', requiredPass: 'bacs_audit_pass', sensitivity: 'Simulated bank-response status', objective: 'p6', pathStep: 'bacs_vault' },
  ],
  evidencePath: ['bacs_vault', 'finance_core', 'payment_orchestration'],
  passes: [
    { pass: 'bacs_audit_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first: it points at the BACS Vault.' },
    { pass: 'ledger_read_pass', when: st('manifest'), hint: 'Inspect the batch and its manifest first. The totals will point at Finance Core.' },
    { pass: 'payment_ops_pass', when: st('compare'), hint: 'Compare the staged total with Finance Core first. The mismatch points at payment release.' },
  ],
  required: ['bacs_audit_pass', 'ledger_read_pass', 'payment_ops_pass'],
  steps: [
    { id: 'inspect_batch', at: FILE, tool: 'e', evidence: 'ev_bf_meta', status: [[CAB, 'suspect']], mark: [['supplier_payment_release', 'suspicious']],
      info: { title: 'File Metadata Terminal (metadata only)', rows: [['Batch', 'BF-0412'], ['Approved at', '22:10 (hash a41f…)'], ['Staged hash', '9c07… (mismatch)'], ['Last modified', '01:47 by svc-tidy'], ['Lines', '212 (1 edited)']], body: 'The file changed after approval. Open the staging cabinet manifest next.' } },
    { id: 'manifest', at: CAB, tool: 'e', needs: ['inspect_batch'], needsMsg: 'Inspect the batch metadata at the File Metadata Terminal first.', gain: { audit: 3 },
      info: { title: 'Simulated manifest BF-0412', rows: [['Line 14', 'Supplier •••• · £20,000.00 more than approved'], ['Other lines', 'Unchanged'], ['Staged total', STAGED]], body: 'One line was edited. Compare the totals with Finance Core.' } },
    { id: 'compare', at: AP, tool: 'recon', needs: ['manifest'], needsMsg: 'Inspect the manifest first so you know the staged total.', evidence: 'ev_approved_total', gain: { audit: 4 },
      info: { title: 'Comparison: staged vs approved total', rows: [['Source (staged)', 'BACS Vault manifest BF-0412'], ['Source (approved)', 'Finance Core Accounts Payable approval 22:10']], compare: { before: [['Approved (Finance Core)', APPROVED], ['Staged (BACS Vault)', STAGED], ['Difference', '+£20,000.00']], after: [['Replacement needed', 'Yes: restore from trusted data'], ['Other batches', 'Unaffected']] }, body: 'The staged total is higher than the approved total.' } },
    { id: 'replacement', at: CAB, tool: 'restore', needs: ['quarantine', 'compare'], needsMsg: 'Quarantine the affected batch first, and compare it with Finance Core.', gain: { recovery: 10, integrity: 0 },
      confirm: { title: 'Create a clean replacement BF-0412R from trusted data?', body: 'Rebuilds the batch from the approved 22:10 data. The edited file stays quarantined as evidence.', impacts: [{ label: 'Creates', text: 'Replacement with the approved total (£164,250.00)', tone: 'good' }, { label: 'Keeps', text: 'The edited file, quarantined, for review', tone: 'good' }] },
      status: [[CAB, 'fixed']], fx: 'repair', effect: (a) => { a.flag('verifiedPoint'); a.flag('restored'); }, say: ['Clean replacement created', 'BF-0412R matches the approved hash and total.', 'good'] },
    { id: 'approver1', at: REL, tool: 'e', needs: ['replacement'], needsMsg: 'Create the clean replacement before approvals.',
      choice: { title: 'First approver: Finance approver', body: 'Approve BF-0412R for release?', options: [
        { id: 'ok', label: `Approve: hash matches and total is ${APPROVED}`, detail: 'Checked against Finance Core.', correct: true, result: 'First approval recorded.' },
        { id: 'skip', label: 'Approve without checking the hash', detail: 'Faster.', correct: false, gain: { audit: -6 }, result: 'Approvals must check the hash and the total.' }] } },
    { id: 'approver2', at: VAL, tool: 'e', needs: ['approver1'], needsMsg: 'The first approver must approve before the second.', evidence: 'ev_dual',
      choice: { title: 'Second approver: Payment operations', body: 'Independently confirm BF-0412R.', options: [
        { id: 'ok', label: 'Approve: independent check passed', detail: 'Hash, total and line count match.', correct: true, result: 'Dual-approval checkpoint complete.' },
        { id: 'rubber', label: 'Rubber-stamp: the first approver already said yes', detail: 'Skips the independent check.', correct: false, gain: { audit: -6 }, result: 'The second approver must check independently.' }] } },
    { id: 'release', at: REL, tool: 'e', needs: ['approver2'], needsMsg: 'Both approvers must approve before release.', mark: [['supplier_payment_release', 'restored']],
      effect: (a) => { a.data.ackAt = a.s.elapsed + 14; a.log('Batch BF-0412R released to the simulated bank. Waiting for the acknowledgement.', 'info'); },
      info: { title: 'Released to the simulated bank', rows: [['Batch', 'BF-0412R'], ['Total', APPROVED], ['Status', 'Awaiting simulated acknowledgement']], body: 'The bank sends an acknowledgement shortly. Watch the Bank-Response Monitor.' } },
    { id: 'ack_check', at: BANK, tool: 'recon', needs: ['release', 'ack'], needsMsg: 'Waiting for the simulated bank acknowledgement. Try again in a moment.', evidence: 'ev_ack', gain: { audit: 4, integrity: 0 },
      effect: (a) => a.flag('reconciledAll'),
      info: { title: 'Reconciliation: bank acknowledgement', rows: [['Source (sent)', 'Payment Orchestration release record'], ['Source (received)', 'Simulated bank ACK-0412R']], compare: { before: [['Sent', APPROVED], ['Staged edit', STAGED]], after: [['Acknowledged', APPROVED], ['Difference', 'None']] }, body: 'The acknowledgement matches the approved total. Reconciled.' } },
    { id: 'ack_seen', at: BANK, tool: 'e', needs: ['release'], needsMsg: 'Nothing to see yet: release the batch first.', info: { title: 'Bank-Response Monitor', rows: [['Status', 'Waiting for acknowledgement']], body: 'Use the Reconciliation Wand (7) once the acknowledgement arrives.' } },
  ],
  contain: [{ id: 'quarantine', target: CAB, scope: 'narrow', cfg: { availability: 2, narrow: 1, effective: true, notes: [{ label: 'Holds', text: 'Only batch BF-0412. Unrelated batches stay available.', tone: 'good' }, { label: 'Delays', text: 'This batch cannot release until replaced.', tone: 'warn' }] } }],
  goals: [
    goal('p1', 'primary', 'Inspect the batch and its simulated manifest', (s) => !!s.flags.st_inspect_batch && !!s.flags.st_manifest, 'Press E at the File Metadata Terminal, then the Locked Payment Staging Cabinet in the BACS Vault.'),
    goal('p2', 'primary', 'Compare the staged total with the approved Finance Core total', st('compare'), 'Use the Reconciliation Wand (7) at Accounts Payable in Finance Core.'),
    goal('p3', 'primary', 'Quarantine the affected batch without cancelling unrelated work', st('quarantine'), 'Select the Quarantine Field (3) and the staging cabinet, then confirm the preview.'),
    goal('p4', 'primary', 'Create a clean replacement from trusted simulated data', st('replacement'), 'Use the Clean Restore Beacon (6) on the staging cabinet.'),
    goal('p5', 'primary', 'Complete the dual-approval checkpoint', (s) => !!s.flags.st_approver1 && !!s.flags.st_approver2, 'Approve at Release Controls, then independently at the Payment Validation Console (Payment Orchestration).'),
    goal('p6', 'primary', 'Receive a simulated bank acknowledgement and reconcile the result', st('ack_check'), 'Release the batch, wait for the acknowledgement, then reconcile (7) at the Bank-Response Monitor.'),
    goal('o1', 'optional', 'Finish before the displayed payment cutoff', (s) => !!s.flags.st_ack_check && s.deadlineLeft > 0),
    goal('o2', 'optional', 'Keep unrelated payment batches available', (s) => !s.contained['route:supplier_payment_release'] && !s.contained['room:bacs_vault'] && s.stats.minAvail >= 95),
    goal('o3', 'optional', 'Record the source and outcome of every comparison', (s) => !!s.flags.rec_compares),
    goal('s1', 'stretch', 'No unjustified pass requests and no hints', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 6 minutes with every measure above 90%', (s) => s.elapsed < 360 && s.integrity >= 90 && s.protection >= 90),
  ],
  recordables: [{ id: 'compares', label: 'Both comparisons (staged vs approved, sent vs acknowledged), with sources and outcomes', when: (s) => !!s.flags.st_compare && !!s.flags.st_ack_check }],
  setup: (a) => { a.data.ackAt = 1e9; },
  tick: (a) => { const s = a.s; if (s.flags.st_release && !s.flags.st_ack && s.elapsed >= (s.data.ackAt ?? 1e9)) { a.flag('st_ack'); a.log('Simulated bank acknowledgement ACK-0412R received.', 'good'); a.fx('sparkle', BANK); } },
  debrief: { what: 'A scheduled tidy-up job with too much write access edited one staged payment line after approval. The checksum rule paused release automatically.',
    learn: 'Approvals should be bound to a hash. Quarantine only the changed batch, rebuild it from trusted data, get two independent approvals and reconcile the bank acknowledgement.',
    nextStep: () => 'Bind approvals to the file hash so any later edit blocks release, and remove write access from the tidy-up job.',
    response: (s) => [s.data.scope === 'narrow' ? 'You quarantined only batch BF-0412, so unrelated batches stayed available.' : 'You did not need to contain more than the affected batch.', s.flags.st_ack_check ? 'The bank acknowledgement matched the approved total.' : 'The acknowledgement was not reconciled.', s.deadlineLeft > 0 ? 'You finished before the payment cutoff.' : 'The payment cutoff was missed: check how long each detour took.'] },
  script: [['pass', 'bacs_audit_pass'], ['step', 'inspect_batch'], ['step', 'manifest'], ['pass', 'ledger_read_pass'], ['step', 'compare'], ['contain', 'quarantine'], ['step', 'replacement'], ['pass', 'payment_ops_pass'], ['step', 'approver1'], ['step', 'approver2'], ['step', 'release'], ['wait', 30], ['step', 'ack_check'], ['record', 'compares'], ['report']],
});
