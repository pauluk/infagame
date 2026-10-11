import { makeBau, type Check } from './bau';

const A = { audit: 2 };
const good = (result: string) => ({ correct: true, result, gain: { audit: 3 } });
const bad = (result: string, audit = -3) => ({ correct: false, result, gain: { audit } });

/** 17. Opening Checks: the morning health sweep. */
export const openingChecks = makeBau({
  id: 'bau-opening-checks', order: 17, title: 'Opening Checks', tagline: 'The 07:30 health sweep. Nothing is broken; one number is a little off.', theme: 'Business as usual: the morning health sweep.',
  clock: ['07:30', '09:00', 'Business opens 09:00'], parSeconds: 300, points: 'api_gateway', route: 'receipt_event_feed',
  alert: { headline: 'Opening checks for the payments platform', symptoms: ['Overnight batch finished', 'No open incidents', 'Five checks on today\'s list'], impact: 'None yet. The point of the sweep is to keep it that way.' },
  briefing: ['Work the checklist in order: the API gateway, the event stream, the data pipeline, card settlement and the bank response monitor. Read each, compare it with what is normal, and decide only when something needs deciding.', 'Good checking is proportionate: do not restart things that are merely slow, and do not ignore a trend because today is quiet.'],
  checks: [
    { id: 'gateway', room: 'api_gateway', prop: 'request_monitor', pass: 'api_audit_pass', title: 'API Gateway request monitor', evidence: 'ev', sens: 'Counts and latency only', goal: 'Check the API gateway is healthy',
      rows: [['Requests, last hour', '18,420 (normal 17,000 to 20,000)'], ['Error rate', '0.2% (normal under 0.5%)'], ['Median latency', '84 ms (normal 70 to 100 ms)']], body: 'Healthy: everything is inside its normal band.' },
    { id: 'stream', room: 'event_stream', prop: 'queue_monitor', pass: 'event_trace_pass', title: 'Event stream queue monitor', evidence: 'ev', sens: 'Queue depth only', goal: 'Check the event stream and decide what to do about the queue depth',
      rows: [['Queue depth', '1,900 (normal under 1,500)'], ['Oldest event', '2 min 10 s'], ['Consumers', '4 of 4 running'], ['Trend', 'Falling since 07:10']],
      body: 'The queue is a little above normal, but it is draining and every consumer is running.',
      decide: { title: 'The event queue is a little high: what do you do?', body: 'It is draining on its own.', options: [
        { id: 'watch', label: 'Log it and re-check in ten minutes', detail: 'Proportionate: it is falling and every consumer is healthy.', ...good('Logged, with a re-check noted. No change was needed.') },
        { id: 'restart', label: 'Restart the consumers to clear it faster', detail: 'Faster, in theory.', ...bad('Restarting healthy consumers risks duplicate or missed events for a queue that is already draining. Leave it and watch.', -4) },
        { id: 'ignore', label: 'Ignore it: it is only a number', detail: 'Saves time.', ...bad('A falling trend is good news, but nothing was recorded and nobody will re-check. Log it.') }] } },
    { id: 'pipeline', room: 'fabric_platform', prop: 'pipeline_display', pass: 'fabric_observer_pass', title: 'Fabric pipeline status display', evidence: 'ev', sens: 'Pipeline status only', goal: 'Check the data pipeline is fresh',
      rows: [['Bronze to Silver to Gold', 'All three stages complete'], ['Freshness', '3.1 minutes (normal under 8)'], ['Rows rejected', '0']], body: 'Reporting data is fresh and complete.' },
    { id: 'settle', room: 'card_payments', prop: 'settlement_monitor', pass: 'payments_audit_pass', title: 'Card settlement monitor', evidence: 'ev', sens: 'Totals only', goal: 'Check overnight card settlement agrees',
      rows: [['Settled overnight', '£412,880.00 across 3,611 payments'], ['Settlement file total', '£412,880.00'], ['Difference', 'None']], body: 'Settlement agrees with the file.' },
    { id: 'bank', room: 'bacs_vault', prop: 'bank_monitor', pass: 'bacs_audit_pass', title: 'Bank-response monitor', evidence: 'ev', sens: 'Response status only', goal: 'Check the bank acknowledged yesterday\'s file',
      rows: [['Yesterday\'s file', 'Acknowledged 18:42'], ['Rejections', '0'], ['Today\'s file', 'Scheduled 11:00']], body: 'All clear. Sign off the sweep and file the log.' },
  ] as Check[], log: 'Opening checks log: each reading, the queue-depth judgement and the re-check time',
  debrief: { what: 'A routine opening sweep of the payments platform. One reading, the event queue depth, was slightly high but falling.', learn: 'Routine checking is about proportion: compare with normal, look at the trend, change nothing that is healthy and write down what you saw so the next person can compare.', next: 'Agree an alert threshold for the queue depth so the next person does not have to judge it by eye.' },
});

/** 18. Payment Run Day. */
export const paymentRun = makeBau({
  id: 'bau-payment-run', order: 18, title: 'Payment Run Day', tagline: 'The weekly supplier run. One payee has changed bank details this morning.', theme: 'Business as usual: a controlled supplier payment run.',
  clock: ['09:00', '12:00', 'Run released 12:00'], parSeconds: 420, points: 'service_payments', route: 'supplier_payment_release', difficulty: 'Medium',
  alert: { headline: 'Weekly supplier payment run RUN-2210', symptoms: ['214 invoices approved for payment', 'Batch total within the daily limit', 'Release due at 12:00'], impact: 'Late payment annoys suppliers. A wrong payment is much harder to undo.' },
  briefing: ['You are the run controller. Check the requests, the validation results, release the batch with a second approver and confirm the bank acknowledged it.', 'The control is the same on a quiet day as a busy one: one person prepares, a different person approves.'],
  checks: [
    { id: 'intake', room: 'service_payments', prop: 'intake_terminal', pass: 'service_audit_pass', title: 'Payment request intake terminal', evidence: 'ev', sens: 'Counts only', goal: 'Check the run intake is complete',
      rows: [['Invoices approved', '214'], ['Total', '£236,410.00'], ['Awaiting approval (excluded)', '9'], ['Duplicates found', '0']], body: 'Intake is complete. Unapproved invoices are correctly excluded.' },
    { id: 'validate', room: 'payment_orchestration', prop: 'validation_console', pass: 'payment_ops_pass', title: 'Payment validation console', evidence: 'ev', sens: 'Validation results, masked', goal: 'Resolve the flagged payee before release',
      rows: [['Validated', '213 of 214'], ['Flagged', '1: payee bank details changed at 08:12 today'], ['Changed by', 'A supplier portal request (not the usual finance route)'], ['Run total', '£236,410.00']],
      body: 'One payee is flagged. It is £7,860.00 of the run.',
      decide: { title: 'One payee changed bank details this morning: what do you do?', body: 'The change came through the supplier portal and has not been confirmed.', options: [
        { id: 'hold', label: 'Hold that payment, verify the change by calling the number on file, release the rest', detail: 'Independent verification; the other 213 payments go on time.', ...good('The payment is held for verification; the other 213 are released on time.') },
        { id: 'release', label: 'Release everything: the portal says it is genuine', detail: 'Keeps the run whole.', ...bad('A last-minute bank detail change is the classic invoice-redirection fraud. Verify it independently before any money moves.', -8) },
        { id: 'cancel', label: 'Cancel the whole run until it is sorted out', detail: 'Zero risk.', ...bad('That pays 213 suppliers late for the sake of one. Hold the one payment, not the run.', -3) }] } },
    { id: 'release', room: 'payment_orchestration', prop: 'release_controls', pass: 'payment_ops_pass', title: 'Batch release controls', evidence: 'ev', sens: 'Approval status only', goal: 'Release the run with a second approver',
      rows: [['Prepared by', 'Run controller'], ['Second approver', 'Treasury (a different person)'], ['Batch total', '£228,550.00 (the held payment excluded)'], ['Daily limit', '£500,000.00']], body: 'The batch is within the limit and has two different people on it. Released.' },
    { id: 'ack', room: 'bacs_vault', prop: 'bank_monitor', pass: 'bacs_audit_pass', title: 'Bank-response monitor', evidence: 'ev', sens: 'Response status only', goal: 'Confirm the bank acknowledged the run',
      rows: [['Sent', '£228,550.00 (213 payments)'], ['Acknowledged', '£228,550.00'], ['Difference', 'None'], ['Held payment', 'Pending supplier verification']], body: 'Acknowledged in full. The held payment goes in the next run once verified.' },
  ] as Check[], log: 'Run log: totals, the held payee and why, the two approvers and the bank acknowledgement',
  debrief: { what: 'A weekly supplier run in which one payee\'s bank details changed on the morning of the run.', learn: 'Hold the one suspicious payment, never the whole run, never release it on the strength of the channel it arrived by, and keep two different people on the release.', next: 'Add a cooling-off period for bank detail changes so they cannot reach a run on the same day.' },
});

/** 19. Month-End Close. */
export const monthEnd = makeBau({
  id: 'bau-month-end', order: 19, title: 'Month-End Close', tagline: 'Reconcile the ledger to the sub-ledgers. A £12.40 difference will not go away on its own.', theme: 'Business as usual: month-end reconciliation.',
  clock: ['16:00', '18:00', 'Ledger locks 18:00'], parSeconds: 420, points: 'finance_core', route: 'ledger_reconciliation', difficulty: 'Medium',
  alert: { headline: 'Month-end close: ledger to sub-ledger reconciliation', symptoms: ['Close window opens 16:00', 'Ledger locks at 18:00', 'Three reconciliations to sign off'], impact: 'An unexplained difference that is written off is an unexplained difference nobody can ever look at again.' },
  briefing: ['Reconcile the General Ledger to Accounts Payable and Accounts Receivable, then the debt recovery ledger. Differences are not errors to be hidden: each one needs an explanation and an owner.'],
  checks: [
    { id: 'gl', room: 'finance_core', prop: 'gl', pass: 'ledger_read_pass', title: 'General Ledger control totals', evidence: 'ev', sens: 'Masked totals only', goal: 'Read the General Ledger control totals',
      rows: [['Payables control', '£1,284,300.10'], ['Receivables control', '£2,046,910.55'], ['Journals posted', '1,208']], body: 'These are the totals to agree the sub-ledgers to.' },
    { id: 'ap', room: 'finance_core', prop: 'ap', pass: 'ledger_read_pass', title: 'Accounts Payable ledger', evidence: 'ev', sens: 'Masked totals only', goal: 'Reconcile Accounts Payable to the ledger',
      rows: [['Sub-ledger total', '£1,284,300.10'], ['Control account', '£1,284,300.10'], ['Difference', 'None']], body: 'Payables agrees exactly.' },
    { id: 'recon', room: 'finance_core', prop: 'recon_screen', pass: 'ledger_read_pass', title: 'Reconciliation screen: receivables', evidence: 'ev', sens: 'Masked differences only', goal: 'Resolve the receivables difference properly',
      rows: [['Sub-ledger total', '£2,046,898.15'], ['Control account', '£2,046,910.55'], ['Difference', '£12.40'], ['Likely cause', 'A card refund posted twice in the sub-ledger on the 27th (found by matching amounts)']],
      body: 'The difference is small, and the cause can be traced.',
      decide: { title: 'A £12.40 difference remains: what do you do?', body: 'The ledger locks in under two hours.', options: [
        { id: 'trace', label: 'Correct the duplicate refund with a journal that cites the evidence, and record the cause', detail: 'Small, but explained and auditable.', ...good('The duplicate refund is corrected by a journal with its evidence attached.') },
        { id: 'writeoff', label: 'Write it off as immaterial', detail: 'Quick, and it is only £12.40.', ...bad('Write-offs hide the cause: the same duplicate could be happening on larger refunds. Trace and correct it.', -4) },
        { id: 'plug', label: 'Post a balancing journal to a suspense account', detail: 'Makes the totals agree.', ...bad('A plug makes the numbers agree without explaining them, and is exactly what auditors look for.', -6) }] } },
    { id: 'debt', room: 'debt_recovery', prop: 'recon_console', pass: 'debt_read_pass', title: 'Debt reconciliation console', evidence: 'ev', sens: 'Masked totals only', goal: 'Reconcile debt recovery receipts to the ledger',
      rows: [['Receipts per debt ledger', '£48,205.00'], ['Receipts posted to the ledger', '£48,205.00'], ['Difference', 'None']], body: 'Debt recovery agrees. The close can be signed off.' },
  ] as Check[], log: 'Close log: each reconciliation, the £12.40 cause and the correcting journal',
  debrief: { what: 'A month-end close with one small receivables difference caused by a duplicate card refund.', learn: 'Never write off or plug a difference you have not explained. Small differences are often the early sign of a repeated fault.', next: 'Add an automatic duplicate-refund check to the card feed so it is caught the day it happens.' },
});

/** 20. Leavers and Joiners. */
export const leaversJoiners = makeBau({
  id: 'bau-leavers-joiners', order: 20, title: 'Leavers and Joiners', tagline: 'People move on, and their access should too. One leaver\'s token is still live.', theme: 'Business as usual: joiners, movers and leavers.',
  clock: ['09:30', '12:00', 'Access review due 12:00'], parSeconds: 420, points: 'payroll_pensions', route: 'expense_payment', difficulty: 'Medium',
  alert: { headline: 'Weekly joiners, movers and leavers check', symptoms: ['Two joiners, one mover and one leaver this week', 'Access should match the new role, and nothing more', 'Leaver left on Friday'], impact: 'Access that outlives a job is one of the most common ways a quiet breach starts.' },
  briefing: ['Compare the HR feed with what people can actually do: joiners get what their role needs, movers lose what their old role needed, leavers lose everything the day they leave.'],
  checks: [
    { id: 'feed', room: 'payroll_pensions', prop: 'staff_feed', pass: 'staff_office_pass', title: 'Staff data feed (masked)', evidence: 'ev', sens: 'Role changes only, no pay data', goal: 'Read this week\'s joiners, movers and leavers',
      rows: [['Joiners', '2 (Accounts Payable, Treasury)'], ['Mover', '1 (Expenses to Accounts Payable)'], ['Leaver', '1 (left Friday, was an AP approver)']], body: 'Four changes. Each needs its access checked.' },
    { id: 'policy', room: 'expense_claims', prop: 'policy_checker', pass: 'expense_audit_pass', title: 'Expense policy checker', evidence: 'ev', sens: 'Approval rights only', goal: 'Check the mover has lost their old approval rights',
      rows: [['Mover', 'Now in Accounts Payable'], ['Still approves expense claims', 'Yes (the old right was never removed)'], ['Separation of duties', 'Conflict: AP and expense approval']], body: 'The mover kept an approval right that now conflicts with the new job.' },
    { id: 'token', room: 'api_gateway', prop: 'auth_terminal', pass: 'api_audit_pass', title: 'Authentication status terminal', evidence: 'ev', sens: 'Token status only', goal: 'Deal with the leaver\'s live token',
      rows: [['Leaver\'s AP token', 'Still active, last used Saturday 21:04'], ['Approvals made with it since leaving', 'None'], ['Owner', 'The leaver (left Friday)']],
      body: 'The leaver\'s token is still active and was used after they left.',
      decide: { title: 'The leaver\'s token is still live: what do you do?', body: 'It was used on Saturday night, after they left.', options: [
        { id: 'revoke', label: 'Revoke it now, review what it touched, and tell the security lead', detail: 'Same-day removal and a look at the activity.', ...good('The token is revoked, its Saturday activity reviewed (read-only lookups) and security informed.') },
        { id: 'monday', label: 'Revoke it on Monday with the other leaver tasks', detail: 'Batches the work.', ...bad('Every hour a leaver\'s token stays live is an hour of unexplained access. Revoke it now.', -6) },
        { id: 'leave', label: 'Leave it: nothing was approved with it', detail: 'No harm done.', ...bad('Unexplained use after leaving is a finding in itself. Revoke it and review the activity.', -6) }] } },
    { id: 'queue', room: 'expense_claims', prop: 'approval_queue', pass: 'expense_audit_pass', title: 'Manager approval queue', evidence: 'ev', sens: 'Queue counts only', goal: 'Confirm nothing is waiting on a person who has left',
      rows: [['Claims waiting', '6'], ['Waiting on the leaver', '2 (to be reassigned)'], ['Reassigned to', 'The AP manager']], body: 'Both stranded claims are reassigned. The review can be filed.' },
  ] as Check[], log: 'Access review log: each change, what was removed and the revoked token',
  debrief: { what: 'The weekly joiners, movers and leavers check found a mover who kept an old approval right and a leaver whose token was still live.', learn: 'Access follows the job, not the person: remove old rights when someone moves, remove everything the day someone leaves and always look at what a stale credential did.', next: 'Link the HR leaver feed to automatic token revocation so removal does not depend on a weekly check.' },
});
