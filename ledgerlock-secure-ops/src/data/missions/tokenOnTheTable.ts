import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';

const AUTH = propTarget('api_gateway', 'auth_terminal');
const GATEWAY = propTarget('api_gateway', 'gateway_console');
const PANEL = propTarget('integration_exchange', 'connection_panel');
const DESK = propTarget('secure_ops', 'access_desk');
const LOGT = propTarget('secure_ops', 'log_terminal');
const INTAKE = routeTarget('service_payment_intake');

export default makeScenario({
  id: 'token-on-the-table', order: 6, title: 'Token on the Table', tagline: 'A token-like value showed up in a log. Rotate it properly, with approval, before the next batch.', difficulty: 'Medium',
  theme: 'Controlled recovery: rotate, update, test and prove the old credential is dead.',
  pointsRoom: 'api_gateway', incidentRoute: 'service_payment_intake', clock: ['10:00', '11:00', 'Next payment batch 11:00'], parSeconds: 480,
  alert: { severity: 'High', headline: 'A synthetic log entry suggests a service credential may be exposed', symptoms: ['Log line shows a token-like value (masked in the evidence view)', 'The affected service feeds the payment intake route', 'No misuse has been seen'], impact: 'If misused, someone could call the payment intake API as the service.' },
  briefing: ['A fictional service credential (svc-remit-gw) may have been written to a log.', 'Locate the service and its dependencies, request a time-limited rotation pass, rotate through the Access Desk workflow, update the dependent connection, test the route and confirm the old token no longer works.', 'The token and log are simulated; the game never handles real credentials.'],
  evidence: [
    { id: 'ev_log', name: 'Synthetic log entry (value masked)', sourceRoom: 'api_gateway', requiredPass: 'api_audit_pass', sensitivity: 'Log with token-like value masked', objective: 'p1', pathStep: 'api_gateway' },
    { id: 'ev_deps', name: 'Service dependencies', sourceRoom: 'integration_exchange', requiredPass: 'integration_audit_pass', sensitivity: 'Routing metadata only', objective: 'p1', pathStep: 'integration_exchange' },
    { id: 'ev_oldtoken', name: 'Old token rejected (simulated 401)', sourceRoom: 'api_gateway', requiredPass: 'api_audit_pass', sensitivity: 'Synthetic auth status', objective: 'p6', pathStep: 'api_gateway' },
  ],
  evidencePath: ['api_gateway', 'integration_exchange'],
  passes: [
    { pass: 'api_audit_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first.' },
    { pass: 'integration_audit_pass', when: st('locate'), hint: 'Locate the affected service first; its dependencies live at the Integration Exchange.' },
    { pass: 'token_rotation_pass', when: st('deps'), hint: 'Check the dependencies first. A time-limited rotation pass is approved once you know what will be affected.' },
  ],
  required: ['api_audit_pass', 'integration_audit_pass'],
  steps: [
    { id: 'locate', at: AUTH, tool: 'scanner', evidence: 'ev_log', status: [[AUTH, 'suspect']], mark: [['service_payment_intake', 'suspicious']], fx: 'scan',
      info: { title: 'Authentication Status Terminal: affected service', rows: [['Service', 'svc-remit-gw'], ['Log line', 'Authorization: tok_••••9f2c (masked)'], ['Used by', 'Payment intake route and a partner remittance link'], ['Credential age', '41 days']], body: 'The credential belongs to svc-remit-gw. Check what depends on it before rotating.' } },
    { id: 'deps', at: PANEL, tool: 'e', needs: ['locate'], needsMsg: 'Locate the affected service first (Signal Scanner at the Authentication Status Terminal).', evidence: 'ev_deps',
      info: { title: 'External Service Connection Panel: dependencies', rows: [['Depends on svc-remit-gw', '1) Payment intake route  2) Partner remittance link'], ['Unaffected', 'Card gateway, debt export, analytics mirror'], ['Rotation impact', 'Brief failure until the dependent connection is updated']], body: 'Only two things depend on this credential. Request the Token Rotation Pass at a reader or the Access Desk.' } },
    { id: 'rotate', at: DESK, tool: 'token', needs: ['deps'], needsPass: 'token_rotation_pass', needsMsg: 'Request the time-limited Token Rotation Pass first (Access Desk > Request).',
      confirm: { title: 'Rotate svc-remit-gw through the Access Desk workflow?', body: 'A new simulated credential is issued and the old one is scheduled for revocation after the dependent connection is updated.', impacts: [{ label: 'Availability', text: 'Payment intake fails briefly until the dependent connection is updated', tone: 'warn' }, { label: 'Unaffected', text: 'Other API connections keep running', tone: 'good' }], confirmLabel: 'Rotate' },
      effect: (a) => { a.hit('rot', 4); a.flag('rotated'); if (a.s.deadlineLeft > 0) a.flag('rotatedBeforeBatch'); a.log('New credential issued for svc-remit-gw (value never displayed).', 'good'); }, gain: { recovery: 4 },
      say: ['Credential rotated', 'The old credential is revoked once the dependent connection uses the new one.', 'good'] },
    { id: 'update_dep', at: PANEL, tool: 'e', needs: ['rotate'], needsMsg: 'Rotate the token first.', effect: (a) => { a.clearHit('rot'); a.flag('depUpdated'); }, gain: { audit: 3 },
      info: { title: 'Dependent connection updated', rows: [['Payment intake route', 'Using the new credential'], ['Partner remittance link', 'Using the new credential']], body: 'Both dependent connections now use the new simulated credential.' } },
    { id: 'test_gateway', at: GATEWAY, tool: 'scanner', needs: ['update_dep'], needsMsg: 'Update the dependent connection before testing.', say: ['API Gateway test passed', 'Authenticated requests succeed with the new credential.', 'good'], fx: 'scan' },
    { id: 'test_route', at: INTAKE, tool: 'scanner', needs: ['update_dep'], needsMsg: 'Update the dependent connection before testing.', mark: [['service_payment_intake', 'restored']], say: ['Downstream route test passed', 'Service payment intake is flowing with the new credential. Other routes were not interrupted.', 'good'], fx: 'sparkle' },
    { id: 'old_rejected', at: AUTH, tool: 'e', needs: ['update_dep'], needsMsg: 'Update the dependent connection first.', evidence: 'ev_oldtoken', effect: (a) => a.flag('reconciledAll'),
      info: { title: 'Old token check (simulation)', rows: [['Old credential', 'Rejected: 401 Unauthorised (simulated)'], ['New credential', 'Accepted']], body: 'The old token is no longer accepted.' } },
    { id: 'redact', at: LOGT, tool: 'e', gain: { protection: 5 }, effect: (a) => a.flag('redacted'),
      info: { title: 'Incident Log Terminal: redaction', rows: [['Entry', 'Authorization: tok_•••• (now fully redacted)']], body: 'The sensitive-looking value was removed from the synthetic log view.' } },
  ],
  goals: [
    goal('p1', 'primary', 'Locate the affected service and check its dependencies', (s) => !!s.flags.st_locate && !!s.flags.st_deps, 'Signal Scanner (1) at the Authentication Status Terminal, then E at the Connection Panel in the Integration Exchange.'),
    goal('p2', 'primary', 'Request an approved, time-limited rotation pass', (s) => !!s.flags.granted_token_rotation_pass, 'Request the Token Rotation Pass at the Access Desk once dependencies are known.'),
    goal('p3', 'primary', 'Rotate the fictional token through the Access Desk workflow', st('rotate'), 'Token Rotation Tool (5) at the Access Desk, then confirm.'),
    goal('p4', 'primary', 'Update the simulated dependent connection', st('update_dep'), 'Press E at the Connection Panel again.'),
    goal('p5', 'primary', 'Test the API Gateway and the downstream finance route', (s) => !!s.flags.st_test_gateway && !!s.flags.st_test_route, 'Signal Scanner (1) on the Gateway Console and on the Service Payment Intake route.'),
    goal('p6', 'primary', 'Confirm the old token is no longer accepted', st('old_rejected'), 'Press E at the Authentication Status Terminal.'),
    goal('o1', 'optional', 'Rotate before the next simulated payment batch', (s) => !!s.flags.rotatedBeforeBatch),
    goal('o2', 'optional', 'Keep unaffected API connections running', (s) => !s.contained['room:api_gateway'] && s.stats.minAvail >= 95),
    goal('o3', 'optional', 'Remove the sensitive-looking value from the synthetic log view', st('redact')),
    goal('s1', 'stretch', 'Finish without the rotation pass expiring and without hints', (s) => !s.flags.expired_token_rotation_pass && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Zero unnecessary actions and every measure above 90%', (s) => s.stats.unnecessary === 0 && s.protection >= 90 && s.integrity >= 90),
  ],
  recordables: [{ id: 'rotation', label: 'Rotation record: old token rejected, new token accepted', when: (s) => !!s.flags.st_old_rejected }],
  debrief: { what: 'A token-like value was written to a log. The affected service credential was rotated under an approved, time-limited pass, dependents were updated and the old token was proven dead.',
    learn: 'Rotate with approval, update every dependent, test the route, prove the old credential no longer works and remove the value from the log view.',
    nextStep: () => 'Add a log filter that masks token-shaped values before they are stored, and rotate service credentials on a schedule.',
    response: (s) => [s.flags.rotatedBeforeBatch ? 'You rotated before the next payment batch.' : 'The next payment batch time had passed.', s.flags.redacted ? 'You redacted the sensitive-looking value from the log view.' : 'The log entry was left unredacted.', 'Unaffected API connections kept running.'] },
  script: [['pass', 'api_audit_pass'], ['step', 'locate'], ['pass', 'integration_audit_pass'], ['step', 'deps'], ['pass', 'token_rotation_pass'], ['step', 'rotate'], ['step', 'update_dep'], ['step', 'test_gateway'], ['step', 'test_route'], ['step', 'old_rejected'], ['step', 'redact'], ['record', 'rotation'], ['report']],
});
