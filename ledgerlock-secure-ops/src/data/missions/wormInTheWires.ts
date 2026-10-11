import { goal, makeScenario, st } from './scenario';
import { propTarget } from '../targets';
import { BT, COMMS_BOARD, SEAT, says } from './bronze';

const INTAKE = propTarget('service_payments', 'intake_terminal');
const PAYROLL = propTarget('payroll_pensions', 'payroll_console');
const FILTER = propTarget('api_gateway', 'request_monitor');

/** Cyber: a self-spreading virus arrives by email attachment. Contain the segment, close the filter gap, clean the hosts and agree communications. */
export default makeScenario({
  id: 'worm-in-the-wires', order: 14, title: 'Worm in the Wires', tagline: 'A virus is spreading from an email attachment towards payroll. Run Bronze.', difficulty: 'Medium',
  theme: 'Cyber: virus. Contain the spread, close the gap that let it in, clean and communicate.',
  pointsRoom: 'service_payments', incidentRoute: 'service_payment_intake', clock: ['08:30', '11:00', 'Payroll file due 11:00'], parSeconds: 600,
  alert: { severity: 'High', headline: 'A self-spreading virus is moving between workstations from an email attachment', symptoms: ['Three workstations run the same unknown file', 'Copies appear in a shared folder every few minutes', 'The mail filter delivered 212 messages with the same attachment'], impact: 'The payroll workstation is next on its path. The payroll file is due at 11:00.' },
  briefing: ['Everything here is synthetic. A virus arrived as an email attachment and copies itself across shared folders.', 'Find where it started and where it is going, isolate the infected segment, report to Bronze in the BCP Command Centre (hear the service managers, then decide together), close the filter gap, clean the hosts and agree what is communicated.', 'The payroll file is due at 11:00: protect it without shutting everything down.'],
  evidence: [
    { id: 'ev_attach', name: 'Attachment analysis (hash and behaviour)', sourceRoom: 'service_payments', requiredPass: 'service_audit_pass', sensitivity: 'File hash and behaviour only', objective: 'p1', pathStep: 'service_payments' },
    { id: 'ev_spread', name: 'Infected host list', sourceRoom: 'payroll_pensions', requiredPass: 'staff_office_pass', sensitivity: 'Host names only (no staff data)', objective: 'p2', pathStep: 'payroll_pensions' },
    { id: 'ev_filter', name: 'Mail-filter log', sourceRoom: 'api_gateway', requiredPass: 'api_audit_pass', sensitivity: 'Message counts and hashes only', objective: 'p3', pathStep: 'api_gateway' },
    { id: 'ev_impact', name: 'Payments manager\'s impact report', sourceRoom: 'bcp_command', requiredPass: 'bcp_pass', sensitivity: 'Summary only', objective: 'p4', pathStep: 'bcp_command' },
  ],
  evidencePath: ['service_payments', 'payroll_pensions', 'api_gateway', 'bcp_command'],
  passes: [
    { pass: 'service_audit_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first: it points at the payment-request intake.' },
    { pass: 'staff_office_pass', when: st('attach'), hint: 'Analyse the attachment first. It copies itself towards the payroll office.' },
    { pass: 'api_audit_pass', when: st('spread'), hint: 'Find out how far it has spread first. The filter log explains how it got in.' },
    { pass: 'bcp_pass', when: st('isolate'), hint: 'Isolate the infected segment first, then report to Bronze.' },
  ],
  required: ['service_audit_pass', 'staff_office_pass', 'api_audit_pass', 'bcp_pass'],
  steps: [
    { id: 'attach', at: INTAKE, tool: 'e', evidence: 'ev_attach', status: [[INTAKE, 'bad']], mark: [['service_payment_intake', 'suspicious']],
      info: { title: 'Payment Request Intake Terminal: the attachment', rows: [['File', 'invoice_7731.xls.exe (synthetic)'], ['Behaviour', 'Copies itself to shared folders every 5 minutes'], ['Opened by', '3 users since 08:12'], ['Known signature', 'None yet']], body: 'A virus: it spreads on its own. Find out how far.' } },
    { id: 'spread', at: PAYROLL, tool: 'e', needs: ['attach'], needsMsg: 'Analyse the attachment first.', evidence: 'ev_spread', gain: { audit: 3 },
      info: { title: 'Payroll Console: infected hosts', rows: [['Infected', 'SP-03, SP-09, PP-02 (payroll workstation)'], ['Next on its path', 'The payroll file share'], ['Payroll file', 'Not yet encrypted or altered']], body: 'It has reached the payroll workstation. Isolate the segment now.' } },
    { id: 'filter', at: FILTER, tool: 'scanner', needs: ['spread'], needsMsg: 'See how far it has spread first.', evidence: 'ev_filter', gain: { audit: 3 },
      info: { title: 'Request Monitor: mail-filter log', rows: [['Messages delivered with the file', '212'], ['Opened', '3'], ['Why delivered', 'No signature, and double extensions are allowed']], body: 'The filter let it through. Close the gap after Bronze agrees.' } },
    { id: 'bronze_open', at: BT, tool: 'e', needs: ['isolate'], needsMsg: 'Isolate the infected segment first: it is the most urgent step.',
      meeting: { title: 'Report to Bronze: a spreading virus', body: 'You are at the Bronze table. Say what is happening, what is isolated and what you need.',
        attendees: (a) => [
          says('security', 'warn', a.s.flags.st_signature ? 'Signature added; I will sweep every host.' : 'Three hosts and one file path. I need a signature and the other 209 messages quarantined.'),
          says('payments', 'warn', 'The payroll file is due at 11:00. I can prepare it on a clean laptop in the BCP room if the workstation stays isolated.'),
          says('data', 'ok', 'Reporting is unaffected. I can lock the shared folders read-only.'),
          says('collections', 'ok', 'Collections is on a different network. No sign of it.')],
        options: [
          { id: 'facts', label: 'Report the three hosts and the path to payroll, confirm the segment is isolated, and ask for a filter signature and a clean-laptop payroll plan', detail: 'Narrow and practical.', correct: true, backers: ['Elena Novak', 'Amara Okoye'], gain: { audit: 4, recovery: 2 }, result: 'Bronze agrees: keep the segment isolated, add the signature and prepare payroll on a clean laptop.', flags: ['bronze_aligned'] },
          { id: 'ignore', label: 'Say it is contained and ask nothing of Bronze', detail: 'No fuss.', correct: false, backers: [], gain: { audit: -4 }, result: 'It is isolated, not removed, and the mail filter is still open. Bronze needs the full picture.' },
          { id: 'all', label: 'Ask Bronze to shut down every office system until it is cleared', detail: 'Safest.', correct: false, backers: [], gain: { recovery: -4, audit: -2 }, result: 'Only one segment is affected. A full shutdown would stop payroll and everything else.' }] } },
    { id: 'impact', at: SEAT.payments, tool: 'e', needs: ['bronze_open'], needsMsg: 'Report to Bronze first.', evidence: 'ev_impact', gain: { audit: 3 },
      info: { title: 'Amara Okoye: payroll plan', rows: [['Payroll file', 'Due 11:00'], ['Plan', 'Prepare on a clean laptop from the last good timesheets'], ['Check', 'Two-person review before sending'], ['If it slips', 'An emergency payment run for the lowest paid first']], body: 'There is a workable plan that does not depend on the infected hosts.' } },
    { id: 'signature', at: FILTER, tool: 'patch', needs: ['bronze_open', 'filter'], needsMsg: 'Report to Bronze and read the filter log first.', gain: { protection: 6 }, status: [[FILTER, 'fixed']], fx: 'repair',
      confirm: { title: 'Add the signature and quarantine the 209 unopened messages?', body: 'Adds the file hash and the double-extension rule to the filter and pulls the messages from every inbox.', impacts: [{ label: 'Blocks', text: 'The attachment and double extensions', tone: 'good' }, { label: 'Keeps', text: 'All other mail', tone: 'good' }], confirmLabel: 'Add the signature' },
      effect: (a) => { a.data.quietAt = a.s.elapsed + 14; a.log('Filter updated: the attachment is blocked and 209 messages are quarantined.', 'good'); } },
    { id: 'decision', at: BT, tool: 'e', needs: ['signature', 'impact'], needsMsg: 'Gather the payments plan and close the filter gap first.',
      meeting: { title: 'Bronze decision: how do we clean up?', body: 'Three hosts are infected and isolated. Payroll is due at 11:00.',
        attendees: () => [
          says('security', 'ok', 'Reimage the three hosts from the clean image and sweep the rest with the new signature.'),
          says('payments', 'ok', 'I will do payroll on a clean laptop with a two-person review.'),
          says('data', 'ok', 'Shared folders are read-only until the sweep is done.'),
          says('collections', 'ok', 'No impact for us.')],
        options: [
          { id: 'targeted', label: 'Reimage the three hosts, sweep every host with the signature, and prepare payroll on a clean laptop with two-person review', detail: 'Cleans what is dirty and keeps payroll safe.', correct: true, backers: ['Elena Novak', 'Amara Okoye', 'Tomás Reyes'], gain: { recovery: 6, audit: 3 }, result: 'Agreed and logged: reimage, sweep, clean-laptop payroll.' },
          { id: 'run', label: 'Run payroll from the payroll workstation once the antivirus says it is fine', detail: 'No change to the process.', correct: false, backers: [], gain: { protection: -8, audit: -3 }, result: 'An infected host must not produce a payroll file. Use the clean laptop.' },
          { id: 'shutdown', label: 'Shut down all office systems and rebuild everything', detail: 'Removes all doubt.', correct: false, backers: [], gain: { recovery: -5 }, result: 'Out of proportion: only three hosts are affected.' }] } },
    { id: 'reimage', at: PAYROLL, tool: 'restore', needs: ['decision'], needsMsg: 'Agree the clean-up with Bronze first.', gain: { recovery: 6 }, status: [[PAYROLL, 'fixed']], fx: 'repair',
      confirm: { title: 'Reimage SP-03, SP-09 and PP-02 from the clean image?', body: 'Wipes the three infected workstations and reinstalls them from the signed image. Their files come from backup after a scan.', impacts: [{ label: 'Rebuilds', text: 'Three hosts only', tone: 'good' }, { label: 'Keeps', text: 'Every other workstation in service', tone: 'good' }], confirmLabel: 'Reimage the three hosts' } },
    { id: 'comms', at: COMMS_BOARD, tool: 'e', needs: ['decision'], needsMsg: 'Agree the clean-up first.',
      meeting: { title: 'Agree communications', body: 'Staff need to know not to open the attachment, and payroll staff need to know about the plan.',
        attendees: () => [
          says('security', 'ok', 'A short all-staff notice: do not open the attachment, report if you did.'),
          says('payments', 'ok', 'Payroll staff need the plan and the two-person review.'),
          says('data', 'ok', 'I will keep the folders read-only until you tell me.'),
          says('collections', 'ok', 'Fine: keep it short.')],
        options: [
          { id: 'notice', label: 'Send a short all-staff notice, brief payroll staff on the plan and tell the data protection officer', detail: 'Clear, calm and specific.', correct: true, backers: ['Elena Novak', 'Amara Okoye'], gain: { audit: 4 }, result: 'Communications agreed.' },
          { id: 'blame', label: 'Name the three users who opened the attachment in the all-staff notice', detail: 'Makes the point.', correct: false, backers: [], gain: { audit: -4 }, result: 'Blame discourages reporting. Say what to do, not who did it.' },
          { id: 'none', label: 'Send nothing: it will only worry people', detail: 'Avoids alarm.', correct: false, backers: [], gain: { audit: -4 }, result: 'Staff must know not to open the attachment.' }] } },
    { id: 'verify', at: PAYROLL, tool: 'scanner', needs: ['quiet', 'reimage'], needsMsg: 'Wait for the reimage and a quiet period before declaring it clean.', gain: { recovery: 4 },
      info: { title: 'Signal Scanner: after the clean-up', rows: [['Reimaged hosts', 'SP-03, SP-09, PP-02: clean'], ['Sweep', 'No copies on any other host'], ['Shared folders', 'No new copies for 10 minutes'], ['Payroll file', 'Prepared on a clean laptop, two-person review done']], body: 'The virus is gone and payroll is safe.' } },
  ],
  contain: [{ id: 'isolate', target: PAYROLL, scope: 'narrow', releaseId: 'resumed', canRelease: (s) => (s.flags.st_verify ? true : 'Verify the hosts are clean before reconnecting the segment.'),
    cfg: { availability: 3, narrow: 0.9, effective: true, canRelease: (s) => (s.flags.st_verify ? true : 'Verify the hosts are clean before reconnecting the segment.'), notes: [{ label: 'Isolates', text: 'The infected segment (three workstations).', tone: 'good' }, { label: 'Keeps', text: 'Everything outside the segment.', tone: 'good' }] } }],
  goals: [
    goal('p1', 'primary', 'Analyse the attachment', st('attach'), 'Press E at the Payment Request Intake Terminal.'),
    goal('p2', 'primary', 'Find how far it has spread', st('spread'), 'Press E at the Payroll Console.'),
    goal('p3', 'primary', 'Understand how it got in', st('filter'), 'Signal Scanner (1) at the Request Monitor in the API Gateway.'),
    goal('p4', 'primary', 'Isolate the infected segment and report to Bronze', (s) => !!s.flags.st_isolate && !!s.flags.st_bronze_open && !!s.flags.st_impact, 'Quarantine Field (3) at the payroll console, then the BCP Command Centre.'),
    goal('p5', 'primary', 'Close the filter gap', st('signature'), 'Patch Kit (4) at the Request Monitor.'),
    goal('p6', 'primary', 'Take the clean-up decision together and reimage the hosts', (s) => !!s.flags.st_decision && !!s.flags.st_reimage, 'Bronze Command Table, then Clean Restore (6).'),
    goal('p7', 'primary', 'Agree communications', st('comms'), 'Communications Board.'),
    goal('p8', 'primary', 'Verify it is clean and reconnect the segment', (s) => !!s.flags.st_verify && !!s.flags.st_resumed, 'Scan the payroll console, then release the isolation.'),
    goal('o1', 'optional', 'Payroll safe before the 11:00 file', (s) => !!s.flags.st_verify && s.deadlineLeft > 0),
    goal('o2', 'optional', 'Make no wrong calls at Bronze', (s) => (s.data.wrong ?? 0) === 0),
    goal('o3', 'optional', 'Record the Bronze decision log', (s) => !!s.flags.rec_bronze_log),
    goal('s1', 'stretch', 'No unjustified pass requests and no hints', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 8 minutes with every measure above 85%', (s) => s.elapsed < 480 && s.integrity >= 85 && s.protection >= 85),
  ],
  recordables: [{ id: 'bronze_log', label: 'Bronze decision log: isolation, signature, clean-up, payroll plan, communications', when: (s) => !!s.flags.st_verify }],
  setup: (a) => { a.data.quietAt = 1e9; a.hit('virus', 12); },
  tick: (a) => { const s = a.s; if (s.flags.st_isolate && !s.flags.st_cleared) { a.flag('st_cleared'); a.clearHit('virus'); a.hit('virus_isolated', 4); } if (s.flags.st_signature && !s.flags.st_quiet && s.elapsed >= (s.data.quietAt ?? 1e9)) { a.flag('st_quiet'); a.clearHit('virus_isolated'); a.log('No new copies in ten minutes.', 'good'); } },
  debrief: { what: 'A virus arrived as an email attachment the filter did not know. It copied itself to a shared folder and towards payroll. The segment was isolated, Bronze decided on a narrow clean-up and payroll was prepared on a clean laptop.',
    learn: 'Isolate the segment first, find the entry point, close it, clean only what is infected and keep the critical process (payroll) running on a clean path. Tell staff what to do, not who to blame.',
    nextStep: () => 'Block double extensions, add behaviour-based filtering and keep a tested clean-laptop plan for payroll.',
    response: (s) => [s.flags.st_isolate ? 'You isolated the infected segment.' : 'The segment was not isolated.', s.flags.st_signature ? 'You closed the filter gap.' : 'The filter gap is still open.', s.flags.st_reimage ? 'You reimaged only the infected hosts.' : 'The hosts were not cleaned.', (s.data.wrong ?? 0) === 0 ? 'Every Bronze decision was sound.' : `${s.data.wrong} Bronze decision(s) were pushed back.`] },
  script: [['pass', 'service_audit_pass'], ['step', 'attach'], ['pass', 'staff_office_pass'], ['step', 'spread'], ['pass', 'api_audit_pass'], ['step', 'filter'], ['contain', 'isolate'], ['pass', 'bcp_pass'], ['step', 'bronze_open'], ['step', 'impact'], ['step', 'signature'], ['step', 'decision'], ['step', 'reimage'], ['step', 'comms'], ['wait', 20], ['step', 'verify'], ['release', 'isolate'], ['record', 'bronze_log'], ['report']],
});
