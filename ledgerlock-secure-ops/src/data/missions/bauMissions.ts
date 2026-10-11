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

/** 21. Daily Bank Reconciliation. */
export const bankRec = makeBau({
  id: 'bau-bank-rec', order: 21, title: 'Daily Bank Reconciliation', tagline: 'Match the bank file to the ledger. One receipt has no owner.', theme: 'Business as usual: the daily bank reconciliation.',
  clock: ['08:30', '11:00', 'Cash position due 11:00'], parSeconds: 360, points: 'bacs_vault', route: 'bank_response', difficulty: 'Medium',
  alert: { headline: 'Daily bank reconciliation', symptoms: ['Yesterday\'s bank file has arrived', 'The cash position is due to Treasury at 11:00', 'One receipt could not be matched automatically'], impact: 'Cash that cannot be explained cannot be relied on.' },
  briefing: ['Check the file arrived and is complete, read the bank responses, then reconcile the receipts to the ledger. Unmatched items are investigated, not parked.'],
  checks: [
    { id: 'file', room: 'bacs_vault', prop: 'file_terminal', pass: 'bacs_audit_pass', title: 'File metadata terminal', evidence: 'ev', sens: 'File metadata only', goal: 'Check yesterday\'s bank file is complete',
      rows: [['File', 'Received 06:12, one copy'], ['Records', '1,904 (trailer says 1,904)'], ['Checksum', 'Valid']], body: 'Complete, single and intact.' },
    { id: 'resp', room: 'bacs_vault', prop: 'bank_monitor', pass: 'bacs_audit_pass', title: 'Bank-response monitor', evidence: 'ev', sens: 'Response status only', goal: 'Read the bank responses',
      rows: [['Payments accepted', '1,901'], ['Payments rejected', '3 (invalid account format)'], ['Rejected value', '£1,140.00']], body: 'Three rejections need a corrected payment, not a resend of the same one.' },
    { id: 'match', room: 'finance_core', prop: 'recon_screen', pass: 'ledger_read_pass', title: 'Reconciliation screen: receipts', evidence: 'ev', sens: 'Masked amounts only', goal: 'Resolve the unmatched receipt properly',
      rows: [['Receipts matched', '1,903 of 1,904'], ['Unmatched', '£3,250.00, reference "INV 2209 PART"'], ['Candidates', 'Two open invoices of £1,600.00 and £1,650.00 from the same customer']],
      body: 'The unmatched receipt looks like a part-payment covering two invoices.',
      decide: { title: 'A £3,250.00 receipt does not match one invoice: what do you do?', body: 'The cash position is due at 11:00.', options: [
        { id: 'inv', label: 'Hold it as unallocated, ask the customer and Accounts Receivable to confirm, then allocate with evidence', detail: 'Shown honestly in the cash position as unallocated.', ...good('Held as unallocated with an owner and a question. The cash position shows it honestly.') },
        { id: 'guess', label: 'Allocate it to the larger invoice so it clears', detail: 'Tidy.', ...bad('Guessing the allocation can leave the wrong invoice marked paid and the customer chased for money they sent. Confirm first.', -4) },
        { id: 'suspense', label: 'Post it to suspense and move on', detail: 'It is out of the way.', ...bad('Suspense with no owner or date becomes permanent. Hold it as unallocated with a named person.', -3) }] } },
    { id: 'cash', room: 'finance_core', prop: 'gl', pass: 'ledger_read_pass', title: 'General Ledger cash account', evidence: 'ev', sens: 'Masked totals only', goal: 'Agree the cash position to the ledger',
      rows: [['Bank balance per file', '£6,482,115.40'], ['Ledger cash', '£6,478,865.40'], ['Reconciling items', '£3,250.00 unallocated receipt']], body: 'The only difference is the unallocated receipt, which is explained and owned. Send the cash position.' },
  ] as Check[], log: 'Bank rec log: file checks, the three rejections, the unallocated receipt and its owner',
  debrief: { what: 'A routine daily reconciliation with one receipt that matched no single invoice.', learn: 'Show cash honestly: an unallocated receipt with an owner is better than a tidy guess or an anonymous suspense balance.', next: 'Ask Accounts Receivable to add a remittance reference rule for part-payments.' },
});

/** 22. Card Chargeback Review. */
export const chargebacks = makeBau({
  id: 'bau-chargebacks', order: 22, title: 'Card Chargeback Review', tagline: 'A spike in disputes on one merchant. Block the pattern, not the customers.', theme: 'Business as usual: card disputes and fraud signals.',
  clock: ['10:00', '12:30', 'Dispute cut-off 12:30'], parSeconds: 360, points: 'card_payments', route: 'card_settlement', difficulty: 'Medium',
  alert: { headline: 'Card dispute review', symptoms: ['Disputes up on one merchant', 'Cut-off for responding to the card scheme is 12:30', 'No sign of a platform fault'], impact: 'Late responses lose disputes by default; over-blocking loses good customers.' },
  briefing: ['Read the dispute pattern, check it against settlement, and respond in proportion. Everything is masked: you never need a full card number.'],
  checks: [
    { id: 'log', room: 'card_payments', prop: 'receipt_log', pass: 'payments_audit_pass', title: 'Masked receipt log', evidence: 'ev', sens: 'Masked receipts only', goal: 'Read the dispute pattern',
      rows: [['Disputes today', '19 (normal 3 to 5)'], ['Merchant', 'All on one online merchant'], ['Card numbers', 'Masked, 17 distinct cards'], ['Common factor', 'One shipping address pattern']], body: 'A cluster on one merchant with a shared shipping pattern.' },
    { id: 'settle', room: 'card_payments', prop: 'settlement_monitor', pass: 'payments_audit_pass', title: 'Settlement monitor', evidence: 'ev', sens: 'Totals only', goal: 'Respond to the pattern in proportion',
      rows: [['Exposure on disputed items', '£4,210.00'], ['Merchant share of volume', '3%'], ['Other merchants', 'Normal']],
      body: 'The cluster is real but small and contained to one merchant.',
      decide: { title: 'Disputes cluster on one merchant: what is the proportionate response?', body: 'The scheme response deadline is 12:30.', options: [
        { id: 'target', label: 'Respond to the disputes with evidence, add a velocity check on that merchant\'s shipping pattern and monitor', detail: 'Targets the pattern, leaves everyone else alone.', ...good('Evidence filed on time, a targeted check added and the merchant watched.') },
        { id: 'blockall', label: 'Block all card payments until it is understood', detail: 'Zero fraud.', ...bad('Blocking every card stops 97% of good customers to deal with 3% of volume. Target the pattern.', -5) },
        { id: 'ignore', label: 'Let the disputes lapse: it is only £4,210', detail: 'Saves effort.', ...bad('Defaulting on disputes loses them all and signals the merchant is easy to attack. Respond on time.', -3) }] } },
    { id: 'notify', room: 'card_payments', prop: 'notifier', pass: 'payments_audit_pass', title: 'Settlement notifier', evidence: 'ev', sens: 'Notification status only', goal: 'Confirm the right people were told',
      rows: [['Merchant risk team', 'Notified 10:42'], ['Scheme response', 'Queued for 12:00'], ['Customer messages', 'None sent (no confirmed fraud)']], body: 'The right teams know and no customer was alarmed without cause.' },
  ] as Check[], log: 'Dispute log: the pattern, exposure, the targeted check and the response time',
  debrief: { what: 'A cluster of disputes on one merchant, contained and responded to in proportion.', learn: 'Fraud response is targeting: respond to the pattern with evidence and a narrow control, never a blanket block.', next: 'Add the shipping-pattern check to the standing fraud rules.' },
});

/** 23. Supplier Onboarding. */
export const supplierOnboarding = makeBau({
  id: 'bau-supplier-onboarding', order: 23, title: 'Supplier Onboarding', tagline: 'A new supplier needs paying this week. Its paperwork has one gap.', theme: 'Business as usual: setting up a new supplier safely.',
  clock: ['09:00', '11:30', 'Run cut-off 11:30'], parSeconds: 360, points: 'service_payments', route: 'supplier_payment_release', difficulty: 'Medium',
  alert: { headline: 'New supplier: Alder Mill Packaging (fictional)', symptoms: ['First invoice due this week', 'Bank details supplied by email', 'Company number does not match the invoice name'], impact: 'A new supplier is the easiest way to get a fraudulent payee onto the system.' },
  briefing: ['Set up the supplier through the normal route: check who they are, verify the bank details independently and only then let a payment run reach them.'],
  checks: [
    { id: 'request', room: 'service_payments', prop: 'intake_terminal', pass: 'service_audit_pass', title: 'Supplier set-up request', evidence: 'ev', sens: 'Set-up details only, masked', goal: 'Read the supplier set-up request',
      rows: [['Supplier', 'Alder Mill Packaging'], ['Requested by', 'A budget holder (not Procurement)'], ['Bank details', 'Supplied by email, unverified'], ['Registered name on record', 'Alder Mill Packaging Holdings Ltd']], body: 'The name differs slightly from the registered company and the details are unverified.' },
    { id: 'verify', room: 'service_payments', prop: 'validation_desk', pass: 'service_audit_pass', title: 'Validation desk', evidence: 'ev', sens: 'Check results only', goal: 'Verify the supplier before they can be paid',
      rows: [['Company check', 'Registered, active, trading 6 years'], ['Name match', 'Holdings parent; trading name confirmed by the registry'], ['Bank details', 'Not yet verified'], ['Sanctions screen', 'Clear']],
      body: 'The company is genuine. Only the bank details remain.',
      decide: { title: 'The bank details came by email: how do you verify them?', body: 'The first invoice is due this week.', options: [
        { id: 'callback', label: 'Call back on the number from the company registry, confirm the details and record who you spoke to', detail: 'Independent of the email.', ...good('Verified through an independent channel and the call is recorded.') },
        { id: 'reply', label: 'Reply to the email asking them to confirm', detail: 'Quick.', ...bad('Asking the sender to confirm their own email proves nothing. Use a number you found independently.', -6) },
        { id: 'trust', label: 'Trust it: the budget holder knows them', detail: 'Saves time.', ...bad('Someone knowing the supplier is not verification, and this is the usual route for redirection fraud.', -5) }] } },
    { id: 'queue', room: 'service_payments', prop: 'validation_queue', pass: 'service_audit_pass', title: 'Validation queue', evidence: 'ev', sens: 'Queue status only', goal: 'Confirm the supplier is released only after verification',
      rows: [['Supplier status', 'Verified, awaiting second-person approval'], ['Set up by', 'Accounts Payable'], ['Approved by', 'A different person in Procurement'], ['First payment', 'In this week\'s run']], body: 'Two different people, a verified payee and a payment in the normal run.' },
  ] as Check[], log: 'Onboarding log: the checks, the call-back and the two people on the set-up',
  debrief: { what: 'Onboarding a genuine new supplier whose bank details arrived by email.', learn: 'Check who they are, verify bank details through a channel you found yourself, and keep set-up and approval with different people.', next: 'Make verified call-back a mandatory step in the supplier set-up form.' },
});

/** 24. Certificate Watch. */
export const certWatch = makeBau({
  id: 'bau-certificate-watch', order: 24, title: 'Certificate Watch', tagline: 'A bank link certificate expires in twelve days. Quiet now, loud later.', theme: 'Business as usual: expiry watch.',
  clock: ['09:00', '11:00', 'Change window 11:00'], parSeconds: 300, points: 'integration_exchange', route: 'supplier_payment_release', difficulty: 'Easy',
  alert: { headline: 'Weekly certificate and token expiry check', symptoms: ['One bank link certificate expires in 12 days', 'Last year a similar expiry stopped a payroll run', 'A change window opens at 11:00'], impact: 'Expiries are boring until they are an outage.' },
  briefing: ['Check what is about to expire and act while it is cheap. The expired certificate that stopped the payment run in Payments Down is the reason this check exists.'],
  checks: [
    { id: 'links', room: 'integration_exchange', prop: 'connection_panel', pass: 'integration_audit_pass', title: 'External service connection panel', evidence: 'ev', sens: 'Link status and expiry only', goal: 'Find what is about to expire and decide how to renew it',
      rows: [['Primary bank link PL-A', 'Certificate expires in 12 days'], ['Backup link PL-B', 'Certificate expires in 140 days'], ['Agency link', 'Expires in 96 days']],
      body: 'One certificate needs renewing soon.',
      decide: { title: 'The primary bank link certificate expires in 12 days: what do you do?', body: 'A change window opens at 11:00 today; the next is in ten days.', options: [
        { id: 'renew', label: 'Raise the renewal now, use today\'s change window and put a reminder on the shared calendar', detail: 'Cheap and early, with a fallback if it fails.', ...good('Renewal booked into today\'s window, with a calendar reminder and ten days of slack.') },
        { id: 'wait', label: 'Wait until the last week: it is not urgent', detail: 'Other priorities.', ...bad('Leaving it to the last week removes any slack if the renewal fails or the provider is slow. Do it while it is cheap.', -4) },
        { id: 'bypass', label: 'Switch to the backup link and forget the primary', detail: 'Avoids the renewal.', ...bad('That leaves one link, no fallback and an expired certificate waiting to catch someone out later.', -4) }] } },
    { id: 'tokens', room: 'api_gateway', prop: 'auth_terminal', pass: 'api_audit_pass', title: 'Authentication status terminal', evidence: 'ev', sens: 'Token expiry only', goal: 'Check service token expiries',
      rows: [['Service tokens expiring within 30 days', '2'], ['Owners', 'Both have a named owner'], ['Rotation scheduled', 'Yes, both']], body: 'Both have owners and a rotation booked.' },
    { id: 'record', room: 'integration_exchange', prop: 'agency_console', pass: 'integration_audit_pass', title: 'Agency connection console', evidence: 'ev', sens: 'Link status only', goal: 'Confirm the agency link is healthy and recorded',
      rows: [['Agency link', 'Up, last transfer acknowledged'], ['Certificate', 'Valid for 96 days'], ['Expiry on the calendar', 'Yes']], body: 'Healthy and on the expiry calendar. File the log.' },
  ] as Check[], log: 'Expiry log: each certificate and token, the renewal booking and the reminder',
  debrief: { what: 'A weekly expiry check found a bank link certificate twelve days from expiring.', learn: 'Renew early, in a normal change window, with slack and a reminder. An expiry caught in week one is a ticket; in the last hour it is an outage.', next: 'Automate expiry alerts at 60, 30 and 14 days.' },
});

/** 25. Agency Placement. */
export const agencyPlacement = makeBau({
  id: 'bau-agency-placement', order: 25, title: 'Agency Placement', tagline: 'The monthly debt placement file. Send what the agency needs, nothing more.', theme: 'Business as usual: the monthly agency placement.',
  clock: ['13:00', '16:00', 'File due 16:00'], parSeconds: 360, points: 'debt_recovery', route: 'debt_agency_export', difficulty: 'Medium',
  alert: { headline: 'Monthly debt placement to the collections agency', symptoms: ['148 accounts to place', 'The file is due at 16:00', 'The draft file includes more fields than last month'], impact: 'Sending extra personal data is a privacy breach even when the agency is trusted.' },
  briefing: ['Check the placement list, check the export contains only the approved fields, send it and confirm the agency received exactly what you sent.'],
  checks: [
    { id: 'list', room: 'debt_recovery', prop: 'recon_console', pass: 'debt_read_pass', title: 'Debt reconciliation console', evidence: 'ev', sens: 'Masked counts only', goal: 'Confirm the placement list is correct',
      rows: [['Accounts to place', '148'], ['Past the placement date', '148'], ['Disputed or on a payment plan (excluded)', '6']], body: 'The six disputed accounts are correctly excluded.' },
    { id: 'export', room: 'debt_recovery', prop: 'export_screen', pass: 'debt_read_pass', title: 'Approved agency export screen', evidence: 'ev', sens: 'Field list only', goal: 'Trim the export to the approved fields',
      rows: [['Approved fields', 'Reference, name, balance, due date'], ['Draft file also contains', 'Date of birth, employer, a free-text notes column'], ['Last month', 'Approved fields only']],
      body: 'The draft file contains fields the agency is not approved to receive.',
      decide: { title: 'The draft export has extra personal fields: what do you do?', body: 'The file is due at 16:00.', options: [
        { id: 'trim', label: 'Remove the extra fields, regenerate the file from the approved template and log the change', detail: 'Minimum data; the file is on time.', ...good('The file is regenerated from the approved template, with a note of what was removed and why.') },
        { id: 'send', label: 'Send it: more detail helps them collect', detail: 'Might recover more.', ...bad('The agency is only approved for four fields. Extra personal data is a breach however useful it might be.', -8) },
        { id: 'delay', label: 'Cancel this month\'s placement until it is fixed', detail: 'Safe.', ...bad('The fix takes minutes. Cancelling delays collection for 142 accounts when you only needed to remove three columns.', -3) }] } },
    { id: 'receipt', room: 'agency_handoff', prop: 'receipt_monitor', pass: 'agency_audit_pass', title: 'Delivery receipt monitor', evidence: 'ev', sens: 'Receipt status only', goal: 'Confirm the agency received exactly what was sent',
      rows: [['Sent', '142 accounts, 4 fields'], ['Acknowledged', '142 accounts'], ['Difference', 'None']], body: 'The agency acknowledged the same 142 accounts. Placement complete.' },
  ] as Check[], log: 'Placement log: counts, exclusions, the fields removed and the agency acknowledgement',
  debrief: { what: 'The monthly debt placement, where the draft export carried fields the agency was not approved to receive.', learn: 'Data minimisation is a routine control: send only what is approved, fix the file rather than the deadline, and confirm what was received.', next: 'Lock the export to the approved template so extra fields cannot be added by mistake.' },
});
