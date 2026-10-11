import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';

const GATE = propTarget('api_gateway', 'gateway_console');
const MON = propTarget('api_gateway', 'request_monitor');
const AUTH = propTarget('api_gateway', 'auth_terminal');
const GL = propTarget('finance_core', 'gl');
const COMMS = propTarget('secure_ops', 'comms_console');
const INTAKE = routeTarget('service_payment_intake');

/** A flood of requests at the API Gateway: contain it narrowly, keep payments flowing, recover and check nothing was duplicated. */
export default makeScenario({
  id: 'flood-gates', order: 11, title: 'Flood Gates', tagline: 'Requests are flooding the API Gateway. Keep payment traffic flowing.', difficulty: 'Medium',
  theme: 'Service continuity: throttle the flood, protect the important traffic, keep every control.',
  pointsRoom: 'api_gateway', incidentRoute: 'service_payment_intake', clock: ['10:30', '12:00', 'Lunch-hour payment peak 12:00'], parSeconds: 480,
  alert: { severity: 'High', headline: 'API Gateway request rate is 40 times normal and payment requests are timing out', symptoms: ['41,800 requests a minute against a normal 1,050', 'Most traffic comes from a single client key', 'Valid payment requests wait six minutes or fail'], impact: 'Valid service payments fail during the lunch peak, and retries could create duplicates.' },
  briefing: ['A flood of requests is hitting the API Gateway (all synthetic). Real payment requests are being crowded out.', 'Find the source, choose a response that keeps valid traffic flowing, throttle only the source, tell the partner, then check no payment was duplicated.', 'Blocking everything protects the gateway but breaks the service. Scaling without limits hides the problem and costs money.'],
  evidence: [
    { id: 'ev_rate', name: 'Gateway request-rate and error metrics', sourceRoom: 'api_gateway', requiredPass: 'api_audit_pass', sensitivity: 'Request metadata only', objective: 'p1', pathStep: 'api_gateway' },
    { id: 'ev_pattern', name: 'Masked sample of the flooding requests', sourceRoom: 'service_payments', requiredPass: 'service_audit_pass', sensitivity: 'Masked request samples', objective: 'p2', pathStep: 'service_payments' },
    { id: 'ev_dup', name: 'Duplicate requests against ledger postings', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked totals', objective: 'p7', pathStep: 'finance_core' },
  ],
  evidencePath: ['api_gateway', 'service_payments', 'finance_core'],
  passes: [
    { pass: 'api_audit_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first: it points at the API Gateway.' },
    { pass: 'service_audit_pass', when: st('rate'), hint: 'Read the gateway metrics first. They point at what the requests contain.' },
    { pass: 'ledger_read_pass', when: st('verify'), hint: 'Check the gateway has calmed down first. Then Finance Core shows whether anything was duplicated.' },
  ],
  required: ['api_audit_pass', 'service_audit_pass', 'ledger_read_pass'],
  steps: [
    { id: 'rate', at: GATE, tool: 'e', evidence: 'ev_rate', status: [[GATE, 'suspect']], mark: [['service_payment_intake', 'suspicious']],
      info: { title: 'Gateway Console: request metrics', rows: [['Requests per minute', '41,800 (normal 1,050)'], ['From client key ck-77', '92%'], ['Error rate', '38%'], ['Payment requests waiting', '6 minutes']], body: 'One client key is responsible. Look at what it is sending.' } },
    { id: 'pattern', at: [propTarget('service_payments', 'validation_queue'), INTAKE], tool: 'lens', needs: ['rate'], needsMsg: 'Read the gateway metrics first.', evidence: 'ev_pattern', gain: { audit: 3 },
      info: { title: 'Forensic Lens: the flood', rows: [['Source', 'ck-77: a partner test integration (synthetic)'], ['Behaviour', 'Retries every 200 ms with no back-off'], ['Duplicates', '4 of 5 requests repeat the same payment reference'], ['Intent', 'A bug, not an attack']], body: 'A retry loop is flooding the gateway. The same payment references repeat.' } },
    { id: 'strategy', at: MON, tool: 'e', needs: ['pattern'], needsMsg: 'Understand the pattern before you choose a response.',
      choice: { title: 'Response to the request flood', body: 'A partner retry loop is crowding out valid payment traffic at the lunch peak.', options: [
        { id: 'throttle', label: 'Rate-limit only the noisy client key, reserve capacity for payment traffic, and tell the partner', detail: 'Everyone else keeps working.', correct: true, gain: { recovery: 6, audit: 3 }, result: 'Targeted throttle chosen: the source is limited and valid traffic is protected.' },
        { id: 'blockall', label: 'Block all external traffic until it stops', detail: 'Stops the flood at once.', correct: false, gain: { recovery: -3, integrity: -4 }, result: 'That stops the flood and every valid payment too. Limit the source, not the service.' },
        { id: 'scale', label: 'Scale the gateway up without limits and serve everything', detail: 'Nobody is blocked.', correct: false, completes: true, gain: { recovery: -2, audit: -2 }, result: 'It works for now, but the retry loop keeps burning money and duplicates keep arriving.' },
        { id: 'wait', label: 'Wait: it will burn itself out', detail: 'No action needed.', correct: false, gain: { integrity: -5 }, result: 'The loop does not stop by itself, and the lunch peak is coming.' }] } },
    { id: 'rule', at: GATE, tool: 'patch', needs: ['strategy', 'throttle'], needsMsg: 'Choose the response and hold the noisy key first.', gain: { recovery: 6 }, status: [[GATE, 'fixed']], fx: 'repair',
      confirm: { title: 'Apply a 50 requests a minute limit to ck-77 and a priority lane for payment traffic?', body: 'A rule for one client key. Payment requests from every other key go through a reserved lane.', impacts: [{ label: 'Limits', text: 'Only ck-77', tone: 'good' }, { label: 'Protects', text: 'Valid payment requests from everyone else', tone: 'good' }, { label: 'Keeps', text: 'The gateway running at normal size', tone: 'good' }], confirmLabel: 'Apply the rule' },
      effect: (a) => { a.data.calmAt = a.s.elapsed + 20; a.log('Rate limit and priority lane applied.', 'good'); } },
    { id: 'partner', at: COMMS, tool: 'e', needs: ['rule'], needsMsg: 'Apply the rule before you contact the partner.',
      choice: { title: 'Message to the partner', body: 'The partner\'s test integration caused the flood.', options: [
        { id: 'help', label: 'Tell them what we saw, how we limited it and ask them to add back-off and idempotency keys', detail: 'Cooperative and specific. No key or payload in the message.', correct: true, gain: { audit: 3 }, result: 'The partner knows what to fix and nothing sensitive was shared.' },
        { id: 'paste', label: 'Email them the full request log including the raw payloads', detail: 'Shows exactly what happened.', correct: false, gain: { protection: -8, audit: -3 }, result: 'Raw payloads can contain personal data. Share the pattern, not the payloads.' },
        { id: 'cut', label: 'Cut the partner off permanently', detail: 'Solves it forever.', correct: false, gain: { recovery: -2 }, result: 'It is a bug, not an attack. A permanent cut-off is out of proportion.' }] } },
    { id: 'verify', at: GATE, tool: 'scanner', needs: ['calm'], needsMsg: 'Traffic has not settled yet. Give the rule a few seconds.', gain: { recovery: 4 },
      info: { title: 'Gateway Console: after the limit', rows: [['Requests per minute', '1,120'], ['Error rate', '0.4%'], ['Payment requests waiting', 'None'], ['ck-77', 'Limited to 50 per minute']], body: 'Traffic is back to normal and payment requests flow.' } },
    { id: 'dedupe', at: GL, tool: 'recon', needs: ['verify'], needsMsg: 'Verify the gateway is calm first.', evidence: 'ev_dup', gain: { audit: 4 }, effect: (a) => a.flag('reconciledAll'),
      info: { title: 'Reconciliation: duplicates against postings', rows: [['Source (gateway)', 'Requests received by ck-77'], ['Source (ledger)', 'Finance Core postings']], compare: { before: [['Duplicate requests', '31,200'], ['Valid payments received', '412']], after: [['Duplicate postings', '0 (idempotency keys held)'], ['Valid payments posted', '412']] }, body: 'No payment was posted twice. The service is whole.' } },
  ],
  contain: [{ id: 'throttle', target: AUTH, scope: 'narrow', releaseId: 'throttle_lifted', canRelease: (s) => (s.flags.st_dedupe ? true : 'Check that nothing was duplicated before lifting the emergency throttle.'),
    cfg: { availability: 1, narrow: 1, effective: true, canRelease: (s) => (s.flags.st_dedupe ? true : 'Check that nothing was duplicated before lifting the emergency throttle.'), notes: [{ label: 'Limits', text: 'Only the client key ck-77.', tone: 'good' }, { label: 'Keeps', text: 'Every other client and all payment traffic.', tone: 'good' }] } }],
  goals: [
    goal('p1', 'primary', 'Find the source of the flood in the gateway metrics', st('rate'), 'Press E at the Gateway Console in the API Gateway.'),
    goal('p2', 'primary', 'Understand what the flooding requests are', st('pattern'), 'Forensic Lens (2) on the Service Payment Intake flow.'),
    goal('p3', 'primary', 'Choose a proportionate response', st('strategy'), 'Request Monitor in the API Gateway.'),
    goal('p4', 'primary', 'Throttle only the noisy client key', st('throttle'), 'Select the Quarantine Field (3) and the Authentication Status Terminal.'),
    goal('p5', 'primary', 'Apply the rate limit and the payment priority lane', st('rule'), 'Patch Kit (4) at the Gateway Console.'),
    goal('p6', 'primary', 'Tell the partner without sharing sensitive data', st('partner'), 'Communications Console in the atrium.'),
    goal('p7', 'primary', 'Verify traffic is normal and no payment was duplicated, then lift the throttle', (s) => !!s.flags.st_verify && !!s.flags.st_dedupe && !!s.flags.st_throttle_lifted, 'Scan the gateway, reconcile at the General Ledger, then release the throttle.'),
    goal('o1', 'optional', 'Calm the flood before the lunch peak', (s) => !!s.flags.st_verify && s.deadlineLeft > 0),
    goal('o2', 'optional', 'Keep valid payment traffic available throughout', (s) => s.stats.minAvail >= 85),
    goal('o3', 'optional', 'Record the response log', (s) => !!s.flags.rec_flood_log),
    goal('s1', 'stretch', 'No unjustified pass requests and no hints', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 6 minutes with every measure above 85%', (s) => s.elapsed < 360 && s.integrity >= 85 && s.protection >= 85),
  ],
  recordables: [{ id: 'flood_log', label: 'Response log: source, response chosen, limit applied, duplicates checked', when: (s) => !!s.flags.st_dedupe }],
  setup: (a) => { a.data.calmAt = 1e9; a.hit('flood_load', 20); },
  tick: (a) => {
    const s = a.s;
    if (s.flags.st_throttle && !s.flags.st_rule) a.hit('flood_load', 6);
    if (s.flags.st_rule && !s.flags.st_calm && s.elapsed >= (s.data.calmAt ?? 1e9)) { a.flag('st_calm'); a.clearHit('flood_load'); a.log('Gateway traffic is back to about 1,100 requests a minute.', 'good'); a.fx('sparkle', GATE); }
  },
  debrief: { what: 'A partner test integration retried without back-off and flooded the API Gateway. A targeted limit protected valid payments, and the idempotency check proved nothing was posted twice.',
    learn: 'Limit the source, not the service. Reserve capacity for what matters, share patterns not payloads, and always check for duplicates after a flood of retries.',
    nextStep: () => 'Add per-client rate limits by default, require back-off in partner contracts and alert on a single client above 50% of traffic.',
    response: (s) => [s.flags.st_throttle ? 'You throttled only the noisy key.' : 'The noisy key was not throttled.', s.flags.st_verify ? 'Traffic returned to normal.' : 'Traffic was not confirmed as normal.', s.flags.st_dedupe ? 'No payment was duplicated.' : 'Duplicates were not checked.', (s.data.wrong ?? 0) === 0 ? 'Every call was proportionate.' : `${s.data.wrong} call(s) needed a second try.`] },
  script: [['pass', 'api_audit_pass'], ['step', 'rate'], ['pass', 'service_audit_pass'], ['step', 'pattern'], ['step', 'strategy'], ['contain', 'throttle'], ['step', 'rule'], ['step', 'partner'], ['wait', 20], ['step', 'verify'], ['pass', 'ledger_read_pass'], ['step', 'dedupe'], ['release', 'throttle'], ['record', 'flood_log'], ['report']],
});
