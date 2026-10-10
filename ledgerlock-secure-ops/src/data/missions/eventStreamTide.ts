import { goal, makeScenario, st } from './scenario';
import { propTarget } from '../targets';
import { ROOM_BY_ID } from '../map';

const QUEUE = propTarget('event_stream', 'queue_monitor');
const CONSOLE = propTarget('event_stream', 'replay_console');
const CONSUMERS = propTarget('event_stream', 'consumers');
const GL = propTarget('finance_core', 'gl');
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

export default makeScenario({
  id: 'event-stream-tide', order: 4, title: 'Event Stream Tide', tagline: 'The stream is falling behind. Clear the backlog without losing a single valid event.', difficulty: 'Medium',
  theme: 'Service continuity: keep valid events flowing and counted once.',
  pointsRoom: 'event_stream', incidentRoute: 'finance_event_mirror', clock: ['08:00', '09:00', 'Morning report 09:00'], parSeconds: 480,
  alert: { severity: 'Medium', headline: 'Event backlog is growing: reporting freshness is rising', symptoms: ['Queue depth 18,400 and climbing', 'Payment and reconciliation events still arriving', 'Fabric freshness is rising'], impact: 'If it continues, the 09:00 finance report will be stale and events could be lost.' },
  briefing: ['Events arrive faster than they are consumed. Glitch wisps are piling up in the Event Stream Hall.', 'Find the delay, separate delayed events from duplicates, add capacity or reroute, preserve every valid event, bring the queue to a safe level and compare final counts with Finance Core.', 'All volumes are synthetic.'],
  evidence: [
    { id: 'ev_queue', name: 'Queue and consumer trace', sourceRoom: 'event_stream', requiredPass: 'event_trace_pass', sensitivity: 'Event metadata only', objective: 'p1', pathStep: 'event_stream' },
    { id: 'ev_dupes', name: 'Delayed vs duplicate classification', sourceRoom: 'event_stream', requiredPass: 'event_trace_pass', sensitivity: 'Event metadata only', objective: 'p2', pathStep: 'event_stream' },
    { id: 'ev_counts', name: 'Final event counts vs source modules', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked ledger counts', objective: 'p6', pathStep: 'finance_core' },
  ],
  evidencePath: ['event_stream', 'finance_core'],
  passes: [
    { pass: 'event_trace_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first.' },
    { pass: 'ledger_read_pass', when: st('classify'), hint: 'Classify the events first. You will compare counts with Finance Core after the fix.' },
  ],
  required: ['event_trace_pass', 'ledger_read_pass'],
  steps: [
    { id: 'find_delay', at: QUEUE, tool: 'scanner', evidence: 'ev_queue', status: [[QUEUE, 'suspect']], mark: [['finance_event_mirror', 'suspicious']], fx: 'scan',
      effect: (a) => { for (const id of ['wisp1', 'wisp2', 'wisp3']) a.entity(id, { visible: true }); },
      info: { title: 'Queue Monitor: delayed point found', rows: [['Delayed point', 'Lane 3: analytics-writer consumer'], ['Queue depth', '18,400 and rising'], ['Other lanes', 'Healthy']], body: 'One consumer lane is far behind the others. Use the Forensic Lens at the Replay Diagnostic Console to see which events are delayed and which are duplicates.' } },
    { id: 'classify', at: CONSOLE, tool: 'lens', needs: ['find_delay'], needsMsg: 'Find the delayed point first with the Signal Scanner at the Queue Monitor.', evidence: 'ev_dupes',
      choice: { title: 'Which events are delayed, and which are duplicates?', body: 'Lane 3 holds 18,462 events. 62 share an event ID with an earlier event (retries).', options: [
        { id: 'right', label: '18,400 valid delayed events; 62 duplicate retries (same event ID) to de-duplicate', detail: 'Preserve the valid ones, drop only the repeats.', correct: true, result: 'Correct: 18,400 valid delayed, 62 duplicates counted once.', gain: { audit: 4 } },
        { id: 'alldup', label: 'All 18,462 are duplicates', detail: 'Clear the lane.', correct: false, result: 'Most are valid events waiting to be processed. Discarding them would lose data.' },
        { id: 'allvalid', label: 'All are valid: process them all as they are', detail: 'Ignore the retries.', correct: false, result: 'Processing the 62 retries would count events twice.' }] } },
    { id: 'capacity', at: CONSUMERS, tool: 'patch', needs: ['classify'], needsMsg: 'Work out which events are delayed and which are duplicates first.',
      choice: { title: 'Restore processing capacity', body: 'Choose how to clear the delay. Valid events must not be discarded.', options: [
        { id: 'capacity', label: 'Add consumer capacity and de-duplicate by event ID', detail: 'Two extra consumers on lane 3; retries dropped by ID.', correct: true, result: 'Two extra consumers started. The backlog is draining and nothing valid was dropped.' },
        { id: 'reroute', label: 'Reroute lane 3 to a standby consumer group', detail: 'Narrow reroute; other lanes untouched.', correct: true, result: 'Lane 3 now uses the standby group. The backlog is draining and nothing valid was dropped.' },
        { id: 'isolate', label: 'Isolate the whole Event Stream Hall and drain slowly', detail: 'Safe but broad.', correct: false, completes: true, hit: 20, hitSeconds: 60, flags: ['isolated'], result: 'The whole stream was paused and drained. It worked, but every route through the hall was delayed.' },
        { id: 'purge', label: 'Purge the queue so it looks clear', detail: 'Deletes the backlog.', correct: false, gain: { integrity: -25 }, flags: ['lostEvents'], result: 'Purging would delete valid events. The backlog is only "clear" because data was dropped.' }] },
      effect: (a) => { a.flag('draining'); }, status: [[CONSUMERS, 'fixed']], fx: 'repair' },
    { id: 'compare_counts', at: GL, tool: 'recon', needs: ['safe_level'], needsMsg: 'Wait until the queue has dropped to a safe level, then compare the final counts.', evidence: 'ev_counts',
      effect: (a) => { if (!a.s.flags.lostEvents) { a.flag('noLostEvents'); a.flag('reconciledAll'); } },
      info: (a) => { const lost = !!a.s.flags.lostEvents; return { title: 'Reconciliation: stream counts vs source finance modules', rows: [['Source (modules)', 'Finance Core, Payment Orchestration, Card Payments emitted counts'], ['Source (stream)', 'Event Stream Hall delivered counts']], compare: { before: [['Backlog', '18,400 delayed events'], ['Retries', '62 duplicate events']], after: [['Modules emitted', '24,512'], ['Stream delivered', lost ? '24,512 − data purged' : '24,512'], ['Counted twice', '0 (62 retries removed)'], ['Lost', lost ? 'VALID EVENTS LOST (purged)' : '0']] }, body: lost ? 'Valid events were purged earlier, so the counts cannot fully reconcile. Restore them from the journal in a real incident.' : 'Every valid event arrived exactly once.' }; } },
  ],
  goals: [
    goal('p1', 'primary', 'Find the delayed point in the event route', st('find_delay'), 'Signal Scanner (1) at the Queue Monitor in the Event Stream Hall (B1).'),
    goal('p2', 'primary', 'Determine which events are delayed and which are duplicates', st('classify'), 'Forensic Lens (2) at the Replay Diagnostic Console.'),
    goal('p3', 'primary', 'Increase processing capacity or reroute traffic', st('capacity'), 'Patch Kit (4) at the Consumer Group rack.'),
    goal('p4', 'primary', 'Preserve valid events and bring the queue to a safe level', (s) => !!s.flags.st_safe_level, 'Wait while the backlog drains. Do not purge it.'),
    goal('p5', 'primary', 'Compare the final event counts with the source finance modules', st('compare_counts'), 'Reconciliation Wand (7) at the General Ledger console (needs the Ledger Read Pass).'),
    goal('o1', 'optional', 'Keep high-priority payment events moving', (s) => !s.flags.collateral),
    goal('o2', 'optional', 'Resolve the delay without isolating the whole stream', (s) => !s.flags.isolated && !s.contained['room:event_stream']),
    goal('o3', 'optional', 'Confirm no valid events were lost or counted twice', (s) => !!s.flags.st_compare_counts && !s.flags.lostEvents),
    goal('s1', 'stretch', 'Never let availability fall below 95%', (s) => s.stats.minAvail >= 95),
    goal('s2', 'stretch', 'Clear the backlog in under 5 minutes with no hints', (s) => !!s.flags.st_safe_level && s.elapsed < 300 && s.stats.hintsUsed === 0),
  ],
  setup: (a) => {
    Object.assign(a.data, { queue: 18400, mirrorStuck: true, bronzeLag: 14 });
    for (let i = 1; i <= 3; i++) a.entity('wisp' + i, { kind: 'wisp', label: 'Backlog wisp', room: 'event_stream', gx: ROOM_BY_ID.event_stream.x0 + 3 + i * 2, gy: ROOM_BY_ID.event_stream.y0 + 3 + (i % 2), visible: false });
  },
  tick: (a, dt) => {
    const s = a.s, d = a.data;
    if (s.contained['route:service_payment_intake'] || s.contained['route:supplier_payment_release'] || s.contained['route:card_receipt']) a.flag('collateral');
    if (!s.flags.briefed) return;
    if (!s.flags.st_capacity) d.queue += dt * 50;
    else if (!s.flags.st_safe_level) {
      d.queue = Math.max(350, d.queue - dt * 900);
      if (d.queue < 1000) { a.flag('st_safe_level'); d.mirrorStuck = false; d.bronzeLag = 0; for (const id of ['wisp1', 'wisp2', 'wisp3']) a.removeEntity(id); a.routeMark('finance_event_mirror', 'restored'); a.log('Queue is back to a safe level.', 'good'); a.fx('sparkle', QUEUE); }
    }
    if (!s.flags.st_safe_level) d.bronzeLag = Math.min(40, d.queue / 1300);
  },
  debrief: { what: 'A consumer lane stalled and a burst of retries piled up behind it, so events arrived faster than they were processed.',
    learn: 'Separate delayed valid events from duplicates, add capacity or reroute only the stalled lane, never purge valid events to make a queue look clear, and compare final counts with the source modules.',
    nextStep: () => 'Add an alert on consumer lag per lane and a dead-letter queue so one stalled lane cannot back up the whole stream.',
    response: (s) => [s.flags.isolated ? 'You isolated the whole stream: safe, but every route through it was delayed.' : 'You resolved the delay without isolating the whole stream.', s.flags.lostEvents ? 'You purged valid events: the queue looked clear but data was lost.' : 'No valid events were lost or counted twice.', `Queue depth at the end: ${fmt(s.data.queue ?? 0)}.`] },
  script: [['pass', 'event_trace_pass'], ['step', 'find_delay'], ['step', 'classify'], ['step', 'capacity'], ['wait', 40], ['pass', 'ledger_read_pass'], ['step', 'compare_counts'], ['report']],
});
