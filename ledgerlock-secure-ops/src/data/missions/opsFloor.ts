import { goal, makeScenario, st } from './scenario';
import { propTarget } from '../targets';
import { PASSES } from '../passes';
import type { PassId } from '../../game/types';

const WALL = propTarget('secure_ops', 'incident_wall');
const PANEL = propTarget('integration_exchange', 'connection_panel');
const GL = propTarget('finance_core', 'gl');
const EVT = propTarget('event_stream', 'replay_console');
const LOGT = propTarget('secure_ops', 'log_terminal');

export default makeScenario({
  id: 'ops-floor', order: 0, title: 'Operations Floor', tagline: 'Quiet shift: short side tasks that keep the platform tidy. All optional.', difficulty: 'Side tasks',
  theme: 'Good operational habits between incidents.',
  pointsRoom: 'secure_ops', incidentRoute: 'service_payment_intake', clock: ['16:00', '17:00', 'Shift end 17:00'], parSeconds: 600,
  alert: { severity: 'Routine', headline: 'No active incident: routine operations checks', symptoms: ['Two access passes are close to expiry', 'A few housekeeping items are waiting', 'Nothing is on fire (this shift)'], impact: 'Small hygiene tasks prevent the next incident.' },
  briefing: ['This is a free-roam shift with no incident. Complete any of the six optional side tasks around the facility: they build audit quality, data protection and good habits. Nothing here blocks the campaign.', 'Request passes at a reader or the Access Desk as needed (any pass is available on this quiet shift).', 'File the shift report at the Evidence Board when you are done.'],
  evidence: [], evidencePath: [],
  passes: (Object.keys(PASSES) as PassId[]).map((pass) => ({ pass, when: () => true, hint: '' })),
  steps: [
    { id: 'inventory', at: PANEL, tool: 'e', needsPass: 'integration_audit_pass', needsMsg: 'Request the Integration Audit Pass first.', gain: { audit: 4 },
      choice: { title: 'Asset inventory check', body: 'The inventory lists this rack as "Card Gateway (rack 7)", but the panel says "External Service Connection Panel". What do you update?', options: [
        { id: 'inv', label: 'Update the inventory record to "External Service Connection Panel"', detail: 'Fix the record to match the verified device.', correct: true, result: 'Inventory updated. Future alerts will be routed to the right team.' },
        { id: 'label', label: 'Re-label the panel to match the old record', detail: 'Copies the error.', correct: false, result: 'The panel is correct. Fix the inventory, not the hardware.' }] } },
    { id: 'backup_test', at: GL, tool: 'restore', needsPass: 'ledger_read_pass', needsMsg: 'Request the Ledger Read Pass first.',
      confirm: { title: 'Run a dry-run test of the clean backup?', body: 'Verifies the latest backup can be restored. Nothing is changed.', impacts: [{ label: 'Changes', text: 'None (dry run in a sandbox)', tone: 'good' }, { label: 'Result', text: 'A pass/fail verification of the backup', tone: 'good' }] },
      gain: { recovery: 8, audit: 3 }, say: ['Backup verified', 'The 15:00 backup restores cleanly in the sandbox (checksum matches). Recovery readiness improved.', 'good'], fx: 'repair' },
    { id: 'alert_routing', at: WALL, tool: 'e', gain: { audit: 3 },
      choice: { title: 'Alert routing check', body: 'A "card receipt count mismatch" alert fired. Which operations team should receive it?', options: [
        { id: 'card', label: 'Card Services (Card Payments room)', detail: 'Owns the card receipt feed.', correct: true, result: 'Correct: the alert routes to Card Services.' },
        { id: 'debt', label: 'Debt Recovery', detail: 'Owns the agency export.', correct: false, result: 'Debt Recovery does not own card receipts.' },
        { id: 'events', label: 'Nobody: it is informational', detail: 'Ignore.', correct: false, result: 'A receipt count mismatch must reach a team.' }] } },
    { id: 'event_metadata', at: EVT, tool: 'e', needsPass: 'event_trace_pass', needsMsg: 'Request the Event Trace Pass first.', gain: { audit: 3 },
      choice: { title: 'Event metadata check', body: 'Sample event E-5521: source = Card Payments, timestamp = 15:02:11, owner = (blank). What do you do?', options: [
        { id: 'flag', label: 'Flag it: owner is missing, so it cannot be verified', detail: 'An event needs a source, timestamp and owner.', correct: true, result: 'Flagged: event E-5521 lacks an owner. The producer team will add it.' },
        { id: 'ok', label: 'Mark it verified: the other fields are fine', detail: 'Two of three.', correct: false, result: 'All three (source, timestamp, owner) must be present.' }] } },
    { id: 'close_log', at: LOGT, tool: 'e', gain: { audit: 3 },
      choice: { title: 'Stale incident log entry', body: 'INC-0099 was marked "monitoring" yesterday. The ledger summary now shows totals agree. What do you do?', options: [
        { id: 'close', label: 'Confirm the totals agree, then close INC-0099 with a note', detail: 'Evidence first, then close.', correct: true, result: 'INC-0099 closed with a resolution note.' },
        { id: 'blind', label: 'Close it without checking', detail: 'Tidy but unverified.', correct: false, result: 'Close entries only after confirming the resolution.' }] } },
  ],
  goals: [
    goal('revoke_pass', 'optional', 'Review an expiring access pass and revoke it when no longer needed', st('revoke_pass'), 'Open the Access Desk (E) and use Revoke on a pass you no longer need.'),
    goal('inventory', 'optional', 'Find a mislabelled server or integration and update the inventory', st('inventory'), 'Integration Exchange: Connection Panel (needs the Integration Audit Pass).'),
    goal('backup_test', 'optional', 'Test that a clean backup is available', st('backup_test'), 'Clean Restore Beacon (6) at the General Ledger for a dry run.'),
    goal('alert_routing', 'optional', 'Check that an alert is routed to the correct operations room', st('alert_routing'), 'Press E at the Incident Wall.'),
    goal('event_metadata', 'optional', 'Verify that an event has a source, timestamp and owner', st('event_metadata'), 'Event Stream Hall: Replay Diagnostic Console.'),
    goal('close_log', 'optional', 'Close a stale incident log entry after confirming its resolution', st('close_log'), 'Press E at the Incident Log Terminal in Secure Ops Control.'),
    goal('all', 'stretch', 'Complete all six side tasks', (s) => ['revoke_pass', 'inventory', 'backup_test', 'alert_routing', 'event_metadata', 'close_log'].every((k) => !!s.flags['st_' + k])),
  ],
  setup: (a) => {
    a.grantPass('service_audit_pass', 'shift hand-over'); a.grantPass('api_audit_pass', 'shift hand-over');
    a.s.passExpiry['service_audit_pass'] = a.s.elapsed + 240; a.s.passExpiry['api_audit_pass'] = a.s.elapsed + 240;
    a.log('Hand-over note: Service Audit Pass and API Audit Pass are close to expiry. Review them.', 'warn');
  },
  onRevoke: (a) => { a.flag('st_revoke_pass'); a.say('Pass revoked', 'Least privilege restored: you no longer hold access you do not need.', 'good'); },
  incidents: () => 0,
  debrief: { what: 'A quiet shift of routine checks: access review, inventory accuracy, backup testing, alert routing, event metadata and log hygiene.', learn: 'Small habits (revoking unused access, correcting records, testing backups) prevent the next incident.', nextStep: () => 'Schedule a weekly access review and a monthly backup restore test.',
    response: (s) => [`${['revoke_pass', 'inventory', 'backup_test', 'alert_routing', 'event_metadata', 'close_log'].filter((k) => s.flags['st_' + k]).length} of 6 side tasks completed.`] },
  script: [['step', 'alert_routing'], ['step', 'close_log'], ['report']],
});
