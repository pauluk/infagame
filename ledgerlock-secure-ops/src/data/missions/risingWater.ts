import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';

const COMMS = propTarget('secure_ops', 'comms_console');
const PIPE = propTarget('fabric_platform', 'pipeline_display');
const SILVER = propTarget('fabric_platform', 'silver');
const GL = propTarget('finance_core', 'gl');
const QMON = propTarget('event_stream', 'queue_monitor');
const LANEB = propTarget('event_stream', 'lane_console_b');
const REPLAY = propTarget('event_stream', 'replay_console');
const MIRROR = routeTarget('finance_event_mirror');

/** Disaster recovery: water in the Event Stream Hall. Safety first, then fail over, rebuild and fail back. */
export default makeScenario({
  id: 'rising-water', order: 10, title: 'Rising Water', tagline: 'A pipe has burst above the Event Stream Hall. Keep people safe and the events flowing.', difficulty: 'Hard',
  theme: 'Disaster recovery: safety first, fail over, rebuild, fail back.',
  pointsRoom: 'event_stream', incidentRoute: 'finance_event_mirror', clock: ['02:10', '06:00', 'Morning reporting 06:00'], parSeconds: 600,
  alert: { severity: 'Critical', headline: 'Flood sensors in the Event Stream Hall: water rising, racks at risk', symptoms: ['Four leak sensors report water, 6 cm and rising', 'Lanes 3 and 4 sit at floor level', 'Finance events still write into the hall'], impact: 'People could be hurt, the hall could be lost and finance events and reporting would stop until it is rebuilt.' },
  briefing: ['This is a disaster recovery incident (everything here is synthetic). Water is entering the Event Stream Hall from a burst pipe.', 'People come first: do not send anyone into a flooded room with live power. Then protect the data, move the event stream to the standby copy at Site B, check nothing was lost, keep people informed, and only fail back once the hall is dry, repaired and verified.', 'Disaster recovery has two numbers: how long you can be down (RTO, 30 minutes here) and how much data you can lose (RPO, 2 minutes).'],
  evidence: [
    { id: 'ev_telemetry', name: 'Facilities leak-sensor readings', sourceRoom: 'secure_ops', requiredPass: 'ops_pass', sensitivity: 'Sensor readings only', objective: 'p1', pathStep: 'secure_ops' },
    { id: 'ev_dependency', name: 'Event stream dependencies and the DR replica status', sourceRoom: 'fabric_platform', requiredPass: 'fabric_observer_pass', sensitivity: 'Synthetic lineage and lag metrics', objective: 'p3', pathStep: 'fabric_platform' },
    { id: 'ev_rpo', name: 'Replica versus ledger event counts', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked totals', objective: 'p5', pathStep: 'finance_core' },
    { id: 'ev_damage', name: 'Lane health after the water', sourceRoom: 'event_stream', requiredPass: 'event_trace_pass', sensitivity: 'Lane health metadata', objective: 'p7', pathStep: 'event_stream' },
  ],
  evidencePath: ['secure_ops', 'fabric_platform', 'finance_core', 'event_stream'],
  passes: [
    { pass: 'fabric_observer_pass', when: st('safety'), hint: 'Make the hall safe first. Then the Fabric platform shows what depends on it.' },
    { pass: 'ledger_read_pass', when: st('failover'), hint: 'Fail over first, then check in Finance Core that nothing was lost.' },
    { pass: 'event_trace_pass', when: st('dry'), hint: 'The hall is not safe to enter yet. Wait for facilities to report it dry.' },
  ],
  required: ['fabric_observer_pass', 'ledger_read_pass', 'event_trace_pass'],
  steps: [
    { id: 'sensors', at: COMMS, tool: 'e', evidence: 'ev_telemetry', mark: [['finance_event_mirror', 'suspicious']],
      info: { title: 'Facilities call: leak sensors', rows: [['Sensors L1 to L4', 'Water 6 cm and rising'], ['Lanes 3 and 4', 'At floor level'], ['UPS tray 2', 'Wet'], ['People in the hall', 'None'], ['Power to the hall', 'Live']], body: 'The hall is flooding with live power on. Nobody should go in.' } },
    { id: 'safety', at: COMMS, tool: 'e', needs: ['sensors'], needsMsg: 'Find out what the sensors say first.', status: [[QMON, 'bad']],
      choice: { title: 'Safety first: what happens to the hall?', body: 'Water is rising around live equipment. Nobody is inside.', options: [
        { id: 'isolate', label: 'Cut power to the hall, keep everyone out and ask facilities to pump it', detail: 'Remote isolation from the atrium. Equipment stays off until it is dry.', correct: true, gain: { protection: 4, recovery: 4 }, result: 'Power is isolated and the hall is closed. Facilities start pumping.', flags: ['isolated'] },
        { id: 'rescue', label: 'Send an engineer in to carry the racks to higher ground', detail: 'Saves the hardware.', correct: false, gain: { protection: -10 }, result: 'Never enter a flooded room with live power. People are always more important than equipment.' },
        { id: 'ignore', label: 'Treat it as a false alarm and keep watching', detail: 'Avoids a fuss.', correct: false, gain: { integrity: -6 }, result: 'Four sensors agree and the water is rising. This is not a false alarm.' },
        { id: 'lane', label: 'Switch off only lane 4', detail: 'A small step.', correct: false, gain: { protection: -4 }, result: 'The water will reach the other lanes. Isolate the whole hall.' }] },
      effect: (a) => { a.data.dryAt = a.s.elapsed + 50; } },
    { id: 'lineage', at: PIPE, tool: 'e', needs: ['safety'], needsMsg: 'Make the hall safe first.', evidence: 'ev_dependency', gain: { audit: 3 },
      info: { title: 'Pipeline Status Display: what depends on the hall', rows: [['Event Stream Hall', 'Feeds Fabric Bronze, then Silver and Gold, then reporting'], ['DR replica (Site B)', 'Standby, lag 90 seconds (within the 2 minute RPO)'], ['Promote the replica', 'About 10 minutes (within the 30 minute RTO)'], ['Rebuilding the hall', 'Hours']], body: 'Failing over to the standby meets both targets. Waiting for the hall does not.' } },
    { id: 'drdecision', at: PIPE, tool: 'e', needs: ['lineage'], needsMsg: 'Read what depends on the hall first.',
      choice: { title: 'Recovery strategy for the event stream', body: 'RTO 30 minutes, RPO 2 minutes. The standby replica at Site B lags by 90 seconds.', options: [
        { id: 'failover', label: 'Fail over the consumers to the Site B replica now', detail: 'About 10 minutes. At most 90 seconds of events to replay.', correct: true, gain: { recovery: 8, audit: 3 }, result: 'Fail over chosen: meets the RTO and the RPO.', flags: ['dr_chosen'] },
        { id: 'wait', label: 'Wait until the hall is dry and restart in place', detail: 'No migration risk.', correct: false, gain: { recovery: -5 }, result: 'Drying and repairing takes hours: reporting would miss 06:00 and the RTO would be broken.' },
        { id: 'rebuild', label: 'Rebuild the stream from scratch on a new cluster', detail: 'Clean start.', correct: false, gain: { integrity: -6 }, result: 'A rebuild loses the events in flight and takes far too long. Use the replica.' },
        { id: 'partial', label: 'Fail over only the finance lanes and drop the analytics lanes', detail: 'Quicker and smaller.', correct: false, completes: true, gain: { recovery: 1, audit: -2 }, result: 'Finance is safe, but analytics events are dropped. It works, with a cost.' }] } },
    { id: 'failover', at: SILVER, tool: 'e', needs: ['drdecision', 'stopwrites'], needsMsg: 'Choose the strategy and stop the writes into the wet hall first.', status: [[SILVER, 'fixed']], gain: { recovery: 6 },
      confirm: { title: 'Promote the Site B replica and move the consumers?', body: 'Event consumers switch to Site B. The ledger mirror writes there. The wet hall stays isolated.', impacts: [{ label: 'Restores', text: 'Finance events and reporting within the RTO', tone: 'good' }, { label: 'Replays', text: 'Up to 90 seconds of events from the finance journal', tone: 'good' }, { label: 'Risk', text: 'Site B has no second copy until the hall returns', tone: 'warn' }], confirmLabel: 'Fail over to Site B' },
      effect: (a) => { a.flag('failed_over'); a.clearHit('flood'); a.hit('degraded', 8); a.log('Event consumers are running from the Site B replica.', 'good'); },
      say: ['Failed over', 'Events flow from Site B. The hall can dry out without pressure.', 'good'] },
    { id: 'rpo', at: GL, tool: 'recon', needs: ['failover'], needsMsg: 'Fail over first, then check nothing was lost.', evidence: 'ev_rpo', gain: { audit: 4 },
      info: { title: 'Reconciliation: replica against the ledger', rows: [['Source (replica)', 'Site B event count'], ['Source (ledger)', 'Finance Core postings']], compare: { before: [['Replica events', '118,361'], ['Ledger postings', '118,402'], ['Gap', '41 events (the 90 second lag)']], after: [['After replay from the journal', '118,402'], ['Gap', '0']] }, body: 'Nothing was lost: the 41 events were replayed. The RPO was met.' } },
    { id: 'comms', at: COMMS, tool: 'e', needs: ['failover'], needsMsg: 'Update people once the plan is under way.',
      choice: { title: 'Stakeholder update', body: 'Operations, the finance director and the regulator liaison want to know.', options: [
        { id: 'honest', label: 'Send a short, accurate update: safe, failed over, nothing lost, next update at the half hour', detail: 'No blame, no guesses, a time for the next update.', correct: true, gain: { audit: 3, recovery: 2 }, result: 'People know the situation and when to expect more.' },
        { id: 'silent', label: 'Wait until the hall is fully repaired before saying anything', detail: 'One message, when it is all over.', correct: false, gain: { audit: -2 }, result: 'Hours of silence during a flood. Update people early and regularly.' },
        { id: 'blame', label: 'Tell people the building contractor caused it', detail: 'Explains the cause.', correct: false, gain: { audit: -4 }, result: 'The cause is not established, and blame is not an update. Stick to facts.' }] } },
    { id: 'inspect', at: QMON, tool: 'e', needs: ['dry'], needsMsg: 'Facilities have not cleared the hall yet. It is not safe to enter.', evidence: 'ev_damage', gain: { audit: 3 },
      info: { title: 'Queue Monitor: lane health after the water', rows: [['Lanes 1 and 2', 'Dry and healthy'], ['Lanes 3 and 4', 'Failed (water damage)'], ['UPS tray 2', 'Replace'], ['Power', 'Still isolated']], body: 'Two lanes must be rebuilt before the hall can come back.' } },
    { id: 'rebuild', at: LANEB, tool: 'restore', needs: ['inspect', 'failover'], needsMsg: 'Inspect the damage and fail over before rebuilding.', status: [[LANEB, 'fixed']], fx: 'repair', gain: { recovery: 6 },
      confirm: { title: 'Rebuild lanes 3 and 4 from the Site B copy?', body: 'Replaces the failed lanes on new hardware and re-seeds them from the standby copy. Lanes 1 and 2 are untouched.', impacts: [{ label: 'Rebuilds', text: 'Lanes 3 and 4 only', tone: 'good' }, { label: 'Keeps', text: 'Lanes 1 and 2 and everything running at Site B', tone: 'good' }], confirmLabel: 'Rebuild the lanes' },
      effect: (a) => a.flag('rebuilt') },
    { id: 'verify_lanes', at: REPLAY, tool: 'recon', needs: ['rebuild'], needsMsg: 'Rebuild the lanes first.', gain: { audit: 4 }, effect: (a) => a.flag('verified_hall'),
      info: { title: 'Reconciliation: rebuilt hall against Site B', rows: [['Source (hall)', 'Rebuilt lanes 1 to 4'], ['Source (Site B)', 'Replica event counts']], compare: { before: [['Hall lanes', 'Re-seeded'], ['Site B', 'Live']], after: [['Event counts', 'Match'], ['Order and keys', 'Match']] }, body: 'The hall is a faithful copy. It is safe to fail back.' } },
    { id: 'failback', at: SILVER, tool: 'e', needs: ['resumed'], needsMsg: 'Release the hold on the mirror (after verifying the hall) before failing back.', gain: { recovery: 4 },
      confirm: { title: 'Fail back to the Event Stream Hall?', body: 'Moves consumers back to the rebuilt hall in a quiet moment. Site B stays as the standby.', impacts: [{ label: 'Restores', text: 'Normal operation and a second copy', tone: 'good' }], confirmLabel: 'Fail back' },
      effect: (a) => { a.flag('reconciledAll'); a.clearHit('degraded'); a.log('Consumers are back on the Event Stream Hall. Site B is the standby again.', 'good'); },
      info: { title: 'Failed back', rows: [['Primary', 'Event Stream Hall (rebuilt)'], ['Standby', 'Site B replica'], ['RTO achieved', 'Within 30 minutes'], ['Data lost', '0 events']], body: 'Normal operation, with the standby back in place.' } },
  ],
  contain: [{ id: 'stopwrites', target: MIRROR, scope: 'narrow', releaseId: 'resumed', canRelease: (s) => (s.flags.st_verify_lanes ? true : 'Verify that the rebuilt hall matches Site B before restarting the mirror.'),
    cfg: { availability: 8, narrow: 0.8, effective: true, canRelease: (s) => (s.flags.st_verify_lanes ? true : 'Verify that the rebuilt hall matches Site B before restarting the mirror.'), notes: [{ label: 'Stops', text: 'Finance events being written into the flooded hall.', tone: 'good' }, { label: 'Keeps', text: 'Card, bank and agency routes, which do not use the hall.', tone: 'good' }, { label: 'Delays', text: 'Reporting freshness until the failover.', tone: 'warn' }] } }],
  goals: [
    goal('p1', 'primary', 'Read the facilities telemetry and understand the flood', st('sensors'), 'Press E at the Communications Console in the atrium.'),
    goal('p2', 'primary', 'Put people first: isolate and close the hall', st('safety'), 'Choose the safe option at the Communications Console. Nobody enters the flooded hall.'),
    goal('p3', 'primary', 'Find what depends on the hall and the state of the DR replica', st('lineage'), 'Press E at the Pipeline Status Display in Fabric.'),
    goal('p4', 'primary', 'Stop writes into the wet hall and fail over to Site B within the RTO', (s) => !!s.flags.st_stopwrites && !!s.flags.st_failover, 'Quarantine the Finance Event Mirror route, then confirm the failover at the Silver Station.'),
    goal('p5', 'primary', 'Prove no data was lost (RPO)', st('rpo'), 'Reconciliation Wand (7) at the General Ledger.'),
    goal('p6', 'primary', 'Keep stakeholders informed', st('comms'), 'Communications Console in the atrium.'),
    goal('p7', 'primary', 'Inspect the damage once facilities clear the hall, and rebuild lanes 3 and 4', (s) => !!s.flags.st_inspect && !!s.flags.st_rebuild, 'Wait for the all-clear, then Queue Monitor and Lane Console B.'),
    goal('p8', 'primary', 'Verify the rebuilt hall, restart the mirror and fail back', (s) => !!s.flags.st_verify_lanes && !!s.flags.st_failback, 'Reconcile at the Replay Console, release the hold, then fail back at the Silver Station.'),
    goal('o1', 'optional', 'Fail over inside the 30 minute RTO', (s) => !!s.flags.st_failover && s.elapsed < 240),
    goal('o2', 'optional', 'Make no wrong disaster-recovery calls', (s) => (s.data.wrong ?? 0) === 0),
    goal('o3', 'optional', 'Record the recovery log (RTO, RPO, decisions)', (s) => !!s.flags.rec_dr_log),
    goal('s1', 'stretch', 'No unjustified pass requests and no hints', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 8 minutes with every measure above 85%', (s) => s.elapsed < 480 && s.integrity >= 85 && s.protection >= 85),
  ],
  recordables: [{ id: 'dr_log', label: 'Disaster recovery log: telemetry, safety decision, RTO and RPO achieved, rebuild and fail-back', when: (s) => !!s.flags.st_failback }],
  setup: (a) => { a.data.dryAt = 1e9; a.flag('flood_event_stream'); a.hit('flood', 30); },
  tick: (a) => {
    const s = a.s;
    if (s.flags.st_safety && !s.flags.st_dry && s.elapsed >= (s.data.dryAt ?? 1e9)) { a.flag('st_dry'); a.flag('flood_event_stream', false); a.log('Facilities report: the pumps have cleared the Event Stream Hall. It is safe to inspect.', 'good'); a.fx('sparkle', QMON); }
  },
  debrief: { what: 'A burst pipe flooded the Event Stream Hall. Power was isolated, the event stream failed over to the Site B replica, the hall was dried and rebuilt, and the stream failed back.',
    learn: 'In a disaster, people come first, then data. Decide against the RTO and RPO, fail over rather than wait, prove nothing was lost, communicate early, and only fail back once the primary is verified.',
    nextStep: () => 'Move the standby replica to a lag of under 30 seconds, add water sensors under the pipes and rehearse a fail-over drill twice a year.',
    response: (s) => [s.flags.st_safety ? 'You made the hall safe before anything else.' : 'The hall was not made safe.', s.flags.st_failover ? 'You failed over to Site B.' : 'No fail-over happened.', s.flags.st_rpo ? 'You proved no events were lost.' : 'You did not prove nothing was lost.', s.flags.st_failback ? 'You failed back only after the rebuilt hall was verified.' : 'The fail-back was not completed.'] },
  script: [['step', 'sensors'], ['step', 'safety'], ['contain', 'stopwrites'], ['pass', 'fabric_observer_pass'], ['step', 'lineage'], ['step', 'drdecision'], ['step', 'failover'], ['pass', 'ledger_read_pass'], ['step', 'rpo'], ['step', 'comms'], ['wait', 55], ['pass', 'event_trace_pass'], ['step', 'inspect'], ['step', 'rebuild'], ['step', 'verify_lanes'], ['release', 'stopwrites'], ['step', 'failback'], ['record', 'dr_log'], ['report']],
});
