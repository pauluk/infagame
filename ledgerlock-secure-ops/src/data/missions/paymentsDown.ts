import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';

const QUEUE = propTarget('payment_orchestration', 'batch_rack');
const REL = propTarget('payment_orchestration', 'release_controls');
const VAL = propTarget('payment_orchestration', 'validation_console');
const LINK = propTarget('integration_exchange', 'connection_panel');
const AP = propTarget('finance_core', 'ap');
const COMMS = propTarget('secure_ops', 'comms_console');
const BANK = propTarget('bacs_vault', 'bank_monitor');
const ROUTE = routeTarget('supplier_payment_release');

/** Business continuity: the payment run cannot reach the (simulated) bank. Invoke the continuity plan, pay what must be paid, then recover and resume. */
export default makeScenario({
  id: 'payments-down', order: 9, title: 'Payments Down', tagline: 'The payment run cannot reach the bank and payroll is due. Invoke the continuity plan.', difficulty: 'Medium',
  theme: 'Business continuity: keep critical payments flowing while the main route is down.',
  pointsRoom: 'payment_orchestration', incidentRoute: 'supplier_payment_release', clock: ['14:00', '16:00', 'Payroll cutoff 16:00'], parSeconds: 540,
  alert: { severity: 'Critical', headline: 'Payment run PR-1600 cannot reach the bank: payroll is due at 16:00', symptoms: ['Primary bank link reports a timeout on every send', '212 payments queued, none sent', 'Payroll, tax and rent are in the queue with a 16:00 cutoff'], impact: 'If nothing changes, staff are paid late and tax penalties start. Retrying blindly could send duplicates once the link returns.' },
  briefing: ['This is a business continuity incident (all data is synthetic). The primary bank link is down and a payment run is stuck.', 'Work out what is affected, decide what MUST be paid today, invoke the payments continuity plan, hold the failing route so retries do not duplicate, pay the critical items by the backup route with a second approver, keep people informed, then recover and resume.', 'Good continuity work protects the most important payments first, keeps every control in place and records the decisions.'],
  evidence: [
    { id: 'ev_queue', name: 'Payment run PR-1600 queue summary', sourceRoom: 'payment_orchestration', requiredPass: 'payment_ops_pass', sensitivity: 'Batch counts and totals only (no payee details)', objective: 'p1', pathStep: 'payment_orchestration' },
    { id: 'ev_link', name: 'Bank link status (primary and backup)', sourceRoom: 'integration_exchange', requiredPass: 'integration_audit_pass', sensitivity: 'Link status and limits only', objective: 'p1', pathStep: 'integration_exchange' },
    { id: 'ev_priority', name: 'Critical payment list (masked)', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked categories and totals', objective: 'p2', pathStep: 'finance_core' },
    { id: 'ev_ack', name: 'Simulated bank acknowledgement (backup route)', sourceRoom: 'bacs_vault', requiredPass: 'bacs_audit_pass', sensitivity: 'Simulated bank-response status', objective: 'p7', pathStep: 'bacs_vault' },
  ],
  evidencePath: ['payment_orchestration', 'integration_exchange', 'finance_core', 'bacs_vault'],
  passes: [
    { pass: 'payment_ops_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first: it points at Payment Orchestration.' },
    { pass: 'integration_audit_pass', when: st('queue'), hint: 'Read the queue summary first. It says the bank connection is timing out, which points at the Integration Exchange.' },
    { pass: 'ledger_read_pass', when: st('link'), hint: 'Find out which links are up first. Then Finance Core tells you which payments are critical.' },
    { pass: 'bacs_audit_pass', when: st('activate'), hint: 'Activate the backup route first; the vault shows what the bank acknowledged.' },
  ],
  required: ['payment_ops_pass', 'integration_audit_pass', 'ledger_read_pass', 'bacs_audit_pass'],
  steps: [
    { id: 'queue', at: QUEUE, tool: 'e', evidence: 'ev_queue', status: [[QUEUE, 'suspect']], mark: [['supplier_payment_release', 'suspicious']],
      info: { title: 'Batch Rack: payment run PR-1600', rows: [['Payments queued', '212'], ['Total', '£1,204,500.00'], ['Sent', '0'], ['Oldest waiting', '2 h 10 min'], ['Last send result', 'Timeout (bank link PL-A)']], body: 'Nothing has left. Find out why: check the bank link at the Integration Exchange.' } },
    { id: 'link', at: LINK, tool: 'scanner', needs: ['queue'], needsMsg: 'Read the queue summary first so you know what is stuck.', evidence: 'ev_link', gain: { audit: 3 },
      info: { title: 'External Service Connection Panel (simulated)', rows: [['Primary link PL-A', 'DOWN: provider certificate expired (simulated)'], ['Backup link PL-B', 'UP: limit £500,000 per day, manual dual approval'], ['Provider estimate', 'About 40 minutes'], ['Retry behaviour', 'Auto-retry every 30 s (risk of duplicates when PL-A returns)']], body: 'The main route is down for a while, but a backup route exists with a limit.' } },
    { id: 'priority', at: AP, tool: 'e', needs: ['link'], needsMsg: 'Find out which links are up first.', evidence: 'ev_priority', gain: { audit: 3 },
      info: { title: 'Accounts Payable: critical payments today (masked)', rows: [['Payroll', '£290,000.00 (legal deadline 16:00)'], ['Tax', '£60,400.00'], ['Rent', '£32,000.00'], ['Critical total', '£382,400.00 (within the £500,000 backup limit)'], ['Deferrable', '£822,100.00 (can wait until tomorrow)']], body: 'The critical items fit inside the backup limit. The rest can wait.' } },
    { id: 'strategy', at: COMMS, tool: 'e', needs: ['priority'], needsMsg: 'Work out what is critical before you choose a plan.',
      choice: { title: 'Continuity decision: how do we keep paying?', body: 'The primary link is down for about 40 minutes. Payroll is due at 16:00. The backup link has a £500,000 limit.', options: [
        { id: 'plan', label: 'Invoke the payments continuity plan: pay the critical items on the backup route, defer the rest', detail: 'Payroll, tax and rent (£382,400) go by PL-B with dual approval.', correct: true, gain: { recovery: 8, audit: 4 }, result: 'Continuity plan invoked. Critical payments first, everything else deferred.', flags: ['bcp_invoked'] },
        { id: 'wait', label: 'Wait for the provider to fix the link', detail: 'No extra work, and no extra risk.', correct: false, gain: { recovery: -4 }, result: 'The fix is about 40 minutes away with no guarantee. Payroll is due at 16:00. You need a plan, not hope.' },
        { id: 'all', label: 'Send all 212 payments on the backup route', detail: 'Everything goes out today.', correct: false, gain: { audit: -3 }, result: '£1,204,500 is over the £500,000 backup limit: the bank would reject it. Prioritise.' },
        { id: 'phone', label: 'Phone the bank and read out the payroll details', detail: 'Fast, and no systems needed.', correct: false, gain: { protection: -8, audit: -6 }, result: 'Reading payment details over the phone bypasses every control and leaks data. Use the approved backup route.' }] } },
    { id: 'activate', at: REL, tool: 'e', needs: ['strategy', 'hold'], needsMsg: 'Invoke the plan and hold the failing primary route first.', gain: { recovery: 6 }, status: [[REL, 'fixed']],
      confirm: { title: 'Switch the critical payments to the backup route (PL-B)?', body: 'Creates batch CR-1 with payroll, tax and rent (£382,400.00) for the backup link. The deferred £822,100.00 stays held.', impacts: [{ label: 'Pays', text: 'Payroll, tax and rent by 16:00', tone: 'good' }, { label: 'Defers', text: '£822,100.00 until the primary link returns', tone: 'warn' }, { label: 'Controls', text: 'Dual approval still required', tone: 'good' }], confirmLabel: 'Activate the backup route' },
      effect: (a) => { a.flag('bcp_active'); a.clearHit('bank_down'); a.hit('degraded', 10); a.data.ackAt = a.s.elapsed + 14; a.data.linkAt = a.s.elapsed + 40; a.log('Backup route PL-B active for batch CR-1. Waiting for approvals and the bank acknowledgement.', 'info'); },
      say: ['Backup route active', 'Batch CR-1 is ready for dual approval.', 'good'] },
    { id: 'approve', at: VAL, tool: 'e', needs: ['activate'], needsMsg: 'Activate the backup route to create the batch first.',
      choice: { title: 'Independent approval of batch CR-1', body: 'A second approver checks the backup batch before it is sent.', options: [
        { id: 'ok', label: 'Approve: total £382,400.00 matches the critical list and the payees are unchanged', detail: 'Checked against Accounts Payable.', correct: true, gain: { audit: 3 }, result: 'Approved by a second person. Batch CR-1 sent by the backup route.' },
        { id: 'skip', label: 'Skip the second approval: it is an emergency', detail: 'Faster.', correct: false, gain: { audit: -6, protection: -4 }, result: 'Emergencies are exactly when fraud tries to slip through. The second approval stays.' }] } },
    { id: 'comms', at: COMMS, tool: 'e', needs: ['activate'], needsMsg: 'Tell people once you know what the plan is.',
      choice: { title: 'Stakeholder update', body: 'Staff, suppliers and the finance director are asking what is happening.', options: [
        { id: 'honest', label: 'Send a short, accurate update: what is affected, what is being paid first, when the next update is', detail: 'Payroll will be paid on time; other payments may be a day late; next update in 30 minutes.', correct: true, gain: { audit: 3, recovery: 2 }, result: 'People know what to expect and when to hear more.' },
        { id: 'silent', label: 'Say nothing until it is all fixed', detail: 'Avoids confusing anyone.', correct: false, gain: { audit: -2 }, result: 'Silence breeds rumours. Say what is known, what is being done and when you will update.' },
        { id: 'fine', label: 'Tell everyone it is all fine', detail: 'Calms things down.', correct: false, gain: { audit: -5 }, result: 'That is not true: some payments will be late. Never reassure people with something that is not accurate.' }] } },
    { id: 'ack_check', at: BANK, tool: 'recon', needs: ['approve', 'ack'], needsMsg: 'Waiting for the simulated bank acknowledgement. Try again in a moment.', evidence: 'ev_ack', gain: { audit: 4 },
      info: { title: 'Reconciliation: backup route acknowledgement', rows: [['Source (sent)', 'Payment Orchestration batch CR-1'], ['Source (received)', 'Simulated bank ACK-CR1']], compare: { before: [['Sent', '£382,400.00'], ['Payments', '3 groups (payroll, tax, rent)']], after: [['Acknowledged', '£382,400.00'], ['Difference', 'None']] }, body: 'Payroll, tax and rent are acknowledged before the cutoff.' } },
    { id: 'ack_seen', at: BANK, tool: 'e', needs: ['approve'], needsMsg: 'Nothing to see yet: approve and send batch CR-1 first.', info: { title: 'Bank-Response Monitor', rows: [['Status', 'Waiting for acknowledgement']], body: 'Use the Reconciliation Wand (7) once the acknowledgement arrives.' } },
    { id: 'verify_primary', at: LINK, tool: 'scanner', needs: ['link_up'], needsMsg: 'The provider has not restored the primary link yet. Keep the hold in place.', gain: { recovery: 4 },
      info: { title: 'Primary link PL-A restored', rows: [['PL-A', 'UP (certificate renewed by the provider)'], ['Test payment £0.01', 'Accepted and acknowledged'], ['Backup link PL-B', 'Idle']], body: 'The main route works again. Release the hold only after this check.' } },
    { id: 'final_recon', at: QUEUE, tool: 'recon', needs: ['resumed'], needsMsg: 'Release the hold on the primary route first.', gain: { audit: 4, integrity: 0 }, effect: (a) => { a.flag('reconciledAll'); a.clearHit('degraded'); },
      info: { title: 'Reconciliation: deferred payments', rows: [['Source (queued)', 'PR-1600 deferred items'], ['Source (sent)', 'Primary link PL-A with idempotency keys']], compare: { before: [['Deferred', '£822,100.00'], ['Already paid by backup', '£382,400.00']], after: [['Sent by primary', '£822,100.00'], ['Duplicates', '0']] }, body: 'Every payment went exactly once. Normal service is restored.' } },
  ],
  contain: [{ id: 'hold', target: ROUTE, scope: 'narrow', releaseId: 'resumed', canRelease: (s) => (s.flags.st_verify_primary ? true : 'Verify that the primary link is working again before releasing the hold.'),
    cfg: { availability: 4, narrow: 0.9, effective: true, canRelease: (s) => (s.flags.st_verify_primary ? true : 'Verify that the primary link is working again before releasing the hold.'), notes: [{ label: 'Stops', text: 'Blind retries on the failing primary route, so nothing is sent twice.', tone: 'good' }, { label: 'Keeps', text: 'The backup route and every other service.', tone: 'good' }, { label: 'Delays', text: 'Deferred payments until the primary route is verified.', tone: 'warn' }] } }],
  goals: [
    goal('p1', 'primary', 'Assess the impact: the stuck payment run and the state of both bank links', (s) => !!s.flags.st_queue && !!s.flags.st_link, 'Read the Batch Rack, then scan the connection panel in the Integration Exchange.'),
    goal('p2', 'primary', 'Identify the critical payments that must be paid today', st('priority'), 'Press E at Accounts Payable in Finance Core.'),
    goal('p3', 'primary', 'Invoke the payments continuity plan', st('strategy'), 'Press E at the Communications Console in the atrium and choose the plan.'),
    goal('p4', 'primary', 'Hold the failing primary route so retries cannot duplicate payments', st('hold'), 'Select the Quarantine Field (3) and the Supplier Payment Release route.'),
    goal('p5', 'primary', 'Pay the critical items by the backup route with a second approver', (s) => !!s.flags.st_activate && !!s.flags.st_approve, 'Release Controls, then the Payment Validation Console.'),
    goal('p6', 'primary', 'Tell stakeholders accurately what is happening', st('comms'), 'Communications Console in the atrium.'),
    goal('p7', 'primary', 'Confirm the bank acknowledged the critical payments', st('ack_check'), 'Reconciliation Wand (7) at the Bank-Response Monitor once the acknowledgement arrives.'),
    goal('p8', 'primary', 'Verify the primary link, release the hold and clear the deferred payments exactly once', st('final_recon'), 'Scan the connection panel, release the hold, then reconcile at the Batch Rack.'),
    goal('o1', 'optional', 'Critical payments acknowledged before the 16:00 cutoff', (s) => !!s.flags.st_ack_check && s.deadlineLeft > 0),
    goal('o2', 'optional', 'Make no wrong continuity calls', (s) => (s.data.wrong ?? 0) === 0),
    goal('o3', 'optional', 'Record the decision log (impact, priorities, plan, approvals, communications, recovery)', (s) => !!s.flags.rec_bcp_log),
    goal('s1', 'stretch', 'No unjustified pass requests and no hints', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 7 minutes with every measure above 85%', (s) => s.elapsed < 420 && s.integrity >= 85 && s.protection >= 85),
  ],
  recordables: [{ id: 'bcp_log', label: 'Continuity decision log: impact, critical list, plan, approvals, communications, recovery', when: (s) => !!s.flags.st_final_recon }],
  setup: (a) => { a.data.ackAt = 1e9; a.data.linkAt = 1e9; a.hit('bank_down', 30); },
  tick: (a) => {
    const s = a.s;
    if (s.flags.st_activate && !s.flags.st_ack && s.elapsed >= (s.data.ackAt ?? 1e9)) { a.flag('st_ack'); a.log('Simulated bank acknowledgement ACK-CR1 received for batch CR-1.', 'good'); a.fx('sparkle', BANK); }
    if (s.flags.st_activate && !s.flags.st_link_up && s.elapsed >= (s.data.linkAt ?? 1e9)) { a.flag('st_link_up'); a.log('The provider reports the primary link PL-A is back. Verify it before resuming.', 'good'); a.fx('sparkle', LINK); }
  },
  debrief: { what: 'The provider\'s certificate expired, so the primary bank link failed with a payroll run waiting. The continuity plan protected the critical payments while the main route was repaired.',
    learn: 'Continuity is about priorities: decide what must happen first, keep every control (including a second approver) in an emergency, stop blind retries, communicate honestly, and verify before you return to normal.',
    nextStep: () => 'Add certificate-expiry alerts for every bank link and rehearse the backup route quarterly so the plan is familiar before it is needed.',
    response: (s) => [s.flags.st_strategy ? 'You invoked the continuity plan and paid the critical items first.' : 'The continuity plan was not invoked.', s.flags.st_ack_check ? 'The bank acknowledged the critical payments.' : 'The critical payments were not confirmed.', s.deadlineLeft > 0 ? 'Payroll was on time.' : 'The 16:00 cutoff was missed.', (s.data.wrong ?? 0) === 0 ? 'Every continuity call was sound.' : `${s.data.wrong} continuity call(s) needed a second try.`] },
  script: [['pass', 'payment_ops_pass'], ['step', 'queue'], ['pass', 'integration_audit_pass'], ['step', 'link'], ['pass', 'ledger_read_pass'], ['step', 'priority'], ['step', 'strategy'], ['contain', 'hold'], ['step', 'activate'], ['step', 'approve'], ['step', 'comms'], ['pass', 'bacs_audit_pass'], ['wait', 40], ['step', 'ack_check'], ['step', 'verify_primary'], ['release', 'hold'], ['step', 'final_recon'], ['record', 'bcp_log'], ['report']],
});
