import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';
import { campaign } from '../../game/systems/Campaign';

const BOARD = propTarget('secure_ops', 'evidence_board');
const API = propTarget('api_gateway', 'gateway_console');
const EVT = propTarget('event_stream', 'replay_console');
const GL = propTarget('finance_core', 'gl');
const SHARED = routeTarget('service_payment_intake');
const TEST_ROUTES: [id: string, route: string, label: string][] = [['test_intake', 'service_payment_intake', 'service payments'], ['test_card', 'card_receipt', 'card receipts'], ['test_bacs', 'supplier_payment_release', 'BACS metadata'], ['test_debt', 'debt_agency_export', 'debt hand-off'], ['test_fabric', 'finance_event_mirror', 'Fabric reporting']];

export default makeScenario({
  id: 'root-of-the-ripple', order: 8, title: 'The Root of the Ripple', tagline: 'Campaign finale: find the one shared cause behind the earlier incidents.', difficulty: 'Hard',
  theme: 'Systems thinking: fix the shared cause through an approved change and prove every service.',
  pointsRoom: 'api_gateway', incidentRoute: 'service_payment_intake', clock: ['12:00', '13:30', 'Release window 13:30'], parSeconds: 720,
  alert: { severity: 'High', headline: 'Several finance routes show the same retry and timeout symptoms', symptoms: ['Service payments, card receipts and events show retry storms', 'All traced back to a recent shared configuration change', 'No single room is at fault'], impact: 'Until the shared cause is fixed, more routes can fail in the same way.' },
  briefing: ['Earlier incidents left evidence of a shared configuration problem affecting more than one route.', 'Review the Evidence Board, identify the common cause, inspect the API, event and finance modules, contain the affected shared route (not the facility), correct the configuration through an approved change, test five services and complete a final reconciliation.', 'Everything is simulated.'],
  evidence: [
    { id: 'ev_api_cfg', name: 'API gateway timeout template', sourceRoom: 'api_gateway', requiredPass: 'api_audit_pass', sensitivity: 'Configuration metadata', objective: 'p2', pathStep: 'api_gateway' },
    { id: 'ev_event_cfg', name: 'Event consumer retry policy', sourceRoom: 'event_stream', requiredPass: 'event_trace_pass', sensitivity: 'Event metadata only', objective: 'p2', pathStep: 'event_stream' },
    { id: 'ev_fin_cfg', name: 'Finance module posting policy', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked ledger data', objective: 'p2', pathStep: 'finance_core' },
  ],
  evidencePath: ['api_gateway', 'event_stream', 'finance_core'],
  passes: [
    { pass: 'api_audit_pass', when: st('review_board'), hint: 'Review the Evidence Board and identify the common cause first.' },
    { pass: 'event_trace_pass', when: st('inspect_api'), hint: 'Inspect the API module first; the configuration points at the event stream.' },
    { pass: 'ledger_read_pass', when: st('inspect_event'), hint: 'Inspect the event module first; the policy points at the ledger.' },
  ],
  required: ['api_audit_pass', 'event_trace_pass', 'ledger_read_pass'],
  steps: [
    { id: 'review_board', at: BOARD, tool: 'e',
      choice: { title: 'Evidence Board: what is the common cause?', body: (a) => `Evidence from earlier shifts: ${(a.data.priorCount ?? 0)} item(s) collected. Symptoms: retries without idempotency keys, shortened timeouts, drifting totals. What links them?`, options: [
        { id: 'template', label: 'A shared timeout-and-retry configuration template (change CH-204) applied to many services', detail: 'Same change, many routes.', correct: true, result: 'Correct: change CH-204 shortened timeouts and enabled retries without idempotency keys across several services.', gain: { audit: 5 } },
        { id: 'firmware', label: 'A card terminal firmware bug', detail: 'Only explains card receipts.', correct: false, result: 'That would not explain the API, event and finance symptoms.' },
        { id: 'schema', label: 'A Fabric schema change', detail: 'Only explains reporting.', correct: false, result: 'Fabric is downstream: it only shows the symptoms.' }] },
      effect: (a) => a.flag('commonCause') },
    { id: 'inspect_api', at: API, tool: 'e', needs: ['review_board'], needsMsg: 'Review the Evidence Board first.', evidence: 'ev_api_cfg',
      info: { title: 'API Gateway Console (configuration metadata)', rows: [['Template', 'CH-204 (applied yesterday)'], ['Auth timeout', '1 s (was 5 s)'], ['Retries', '3, no idempotency key']], body: 'The API gateway uses the shared template. Now the event module.' } },
    { id: 'inspect_event', at: EVT, tool: 'e', needs: ['inspect_api'], needsMsg: 'Inspect the API module first.', evidence: 'ev_event_cfg',
      info: { title: 'Replay Diagnostic Console (event metadata)', rows: [['Template', 'CH-204'], ['Consumer timeout', '1 s (was 5 s)'], ['Retries', '3, no idempotency key']], body: 'The event consumers use the same template.' } },
    { id: 'inspect_fin', at: GL, tool: 'e', needs: ['inspect_event'], needsMsg: 'Inspect the event module first.', evidence: 'ev_fin_cfg',
      info: { title: 'General Ledger (masked, configuration)', rows: [['Template', 'CH-204'], ['Posting retry', 'Enabled without idempotency key']], body: 'The finance posting module shares it too: one cause, many routes.' } },
    { id: 'change', at: API, tool: 'patch', needs: ['inspect_fin', 'contain'], needsMsg: 'Inspect all three modules and contain the shared route first.',
      choice: { title: 'Correct the configuration through an approved change', body: 'Choose how to fix the shared template.', options: [
        { id: 'approved', label: 'Raise timeouts to 5 s and require idempotency keys, via approved change CR-205 (peer-reviewed)', detail: 'Proper change record, rollback plan.', correct: true, result: 'Approved change CR-205 applied to the shared template. A rollback plan is recorded.', gain: { audit: 5, recovery: 6 } },
        { id: 'direct', label: 'Edit production configuration directly (no approval)', detail: 'Fast.', correct: false, gain: { audit: -8 }, result: 'Unreviewed production edits are not allowed. Use an approved change.' },
        { id: 'noretry', label: 'Disable retries everywhere', detail: 'Blunt.', correct: false, gain: { integrity: -4 }, result: 'Disabling all retries would drop valid events and payments. Fix the template instead.' }] }, fx: 'repair' },
    ...TEST_ROUTES.map(([id, route, label]) => ({ id, at: routeTarget(route), tool: 'scanner' as const, needs: id === 'test_intake' ? ['change', 'reconnect'] : ['change'], needsMsg: id === 'test_intake' ? 'Apply the approved change and release the shared route first.' : 'Apply the approved change first.', fx: 'scan' as const, say: [`Test passed: ${label}`, `${label[0].toUpperCase() + label.slice(1)} is healthy with the corrected configuration.`, 'good'] as [string, string, 'good'] })),
    { id: 'final_recon', at: GL, tool: 'recon', needs: TEST_ROUTES.map((r) => r[0]), needsMsg: 'Test all five services first.', effect: (a) => { a.flag('reconciledAll'); a.flag('noDiffs'); },
      info: { title: 'Final reconciliation', rows: [['Sources', 'Finance Core, Payment Orchestration, Card Payments, Debt Recovery, Fabric']], compare: { before: [['Retry storms', 'Duplicate and delayed events across 5 routes']], after: [['Service payments', 'Totals agree'], ['Card receipts', 'Totals agree'], ['BACS metadata', 'Hashes agree'], ['Debt hand-off', 'Receipts agree'], ['Fabric reporting', 'Gold agrees with ledger'], ['Unexplained differences', 'None']] }, body: 'Everything reconciles with no unexplained differences.' } },
  ],
  contain: [{ id: 'contain', target: SHARED, scope: 'narrow', releaseId: 'reconnect', canRelease: (s) => (s.flags.st_change ? true : 'The shared configuration is not corrected yet. Releasing now would restart the retry storm.'),
    cfg: { availability: 3, narrow: 1, effective: true, notes: [{ label: 'Holds', text: 'Only the shared Service Payment Intake route, not the facility.', tone: 'good' }, { label: 'Delays', text: 'New service payment requests queue (not lost).', tone: 'warn' }] } }],
  goals: [
    goal('p1', 'primary', 'Review the Evidence Board and identify the common cause', st('review_board'), 'Press E at the Evidence Board in Secure Ops Control.'),
    goal('p2', 'primary', 'Inspect the linked API, event and finance modules', (s) => !!s.flags.st_inspect_api && !!s.flags.st_inspect_event && !!s.flags.st_inspect_fin, 'Request each pass as the evidence points, then press E at the gateway console, replay console and general ledger.'),
    goal('p3', 'primary', 'Contain the affected shared route without shutting down the facility', st('contain'), 'Quarantine Field (3) on the Service Payment Intake route only.'),
    goal('p4', 'primary', 'Correct the simulated configuration through an approved change', st('change'), 'Patch Kit (4) at the API Gateway Console.'),
    goal('p5', 'primary', 'Test service payments, card receipts, BACS metadata, debt hand-off and Fabric reporting', (s) => TEST_ROUTES.every(([id]) => !!s.flags['st_' + id]), 'Release the shared route, then Signal Scanner (1) on each of the five routes.'),
    goal('p6', 'primary', 'Complete a final reconciliation', st('final_recon'), 'Reconciliation Wand (7) at the General Ledger. Then file the debrief on the Evidence Board.'),
    goal('o1', 'optional', 'Use least-privilege access throughout', (s) => [...s.passes].filter((p) => p !== 'ops_pass').every((p) => (s.mission.requiredPasses ?? []).includes(p)) && s.stats.passDenials === 0),
    goal('o2', 'optional', 'Keep all unaffected services available', (s) => s.stats.minAvail >= 95 && Object.keys(s.contained).every((k) => k === SHARED)),
    goal('o3', 'optional', 'Collect the full evidence chain from earlier missions', (s) => (s.data.priorCount ?? 0) >= 18),
    goal('o4', 'optional', 'Complete the final verification with no unexplained differences', (s) => !!s.flags.noDiffs && s.integrity >= 95),
    goal('s1', 'stretch', 'No hints, no wrong answers', (s) => s.stats.hintsUsed === 0 && (s.data.wrong ?? 0) === 0),
    goal('s2', 'stretch', 'Service Confidence measures all above 90%', (s) => s.integrity >= 90 && s.protection >= 90 && s.recovery >= 85 && s.audit >= 90 && s.stats.minAvail >= 90),
  ],
  recordables: [{ id: 'chain', label: 'Evidence chain: shared template CH-204 → API → event → finance, fixed by approved change CR-205', when: (s) => !!s.flags.st_final_recon }],
  setup: (a) => { a.data.priorCount = campaign.priorEvidence('root-of-the-ripple').length; },
  debrief: { what: 'A shared configuration template (CH-204) shortened timeouts and enabled retries without idempotency keys across the API gateway, the event consumers and the finance posting module, which is why unrelated incidents looked similar.',
    learn: 'When incidents rhyme, look for the shared cause. Contain only the shared route, fix it through an approved change, test every service that used the template and reconcile.',
    nextStep: () => 'Add idempotency keys and per-service timeout reviews to the template, and require peer review for any shared configuration change.',
    response: (s) => ['You identified a shared configuration as the common cause.', 'You contained only the Service Payment Intake route, not the facility.', s.flags.noDiffs ? 'The final reconciliation showed no unexplained differences.' : 'The final reconciliation was incomplete.'] },
  script: [['step', 'review_board'], ['pass', 'api_audit_pass'], ['step', 'inspect_api'], ['pass', 'event_trace_pass'], ['step', 'inspect_event'], ['pass', 'ledger_read_pass'], ['step', 'inspect_fin'], ['contain', 'contain'], ['step', 'change'], ['release', 'contain'], ['step', 'test_intake'], ['step', 'test_card'], ['step', 'test_bacs'], ['step', 'test_debt'], ['step', 'test_fabric'], ['step', 'final_recon'], ['record', 'chain'], ['report']],
});
