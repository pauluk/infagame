import type { MissionApi, MissionDef, Rule } from './types';
import { goal } from './scenario';
import { ROOM_BY_ID } from '../map';
import { propTarget, routeTarget, roomTarget } from '../targets';
import { EVIDENCE } from '../evidence';
import { PASSES } from '../passes';

const TERMINAL = propTarget('card_payments', 'card_terminal');
const NOTIFIER = propTarget('card_payments', 'notifier');
const RECEIPT_LOG = propTarget('card_payments', 'receipt_log');
const REPLAY_CONSOLE = propTarget('event_stream', 'replay_console');
const REPLAY_BUFFER = propTarget('event_stream', 'replay_buffer');
const GL = propTarget('finance_core', 'gl');
const AR = propTarget('finance_core', 'ar');
const PIPELINE = propTarget('fabric_platform', 'pipeline_display');
const WALL = propTarget('secure_ops', 'incident_wall');
const FEED = routeTarget('receipt_event_feed');

const EXPECTED = 128;
const ghostIds = (s: MissionApi['s']) => Object.keys(s.entities).filter((k) => k.startsWith('ghost'));
const at = (room: 'card_payments' | 'event_stream', rx: number, ry: number) => ({ gx: ROOM_BY_ID[room].x0 + rx, gy: ROOM_BY_ID[room].y0 + ry });
const money = (n: number) => '£' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function startDiagnosis(a: MissionApi): void {
  a.dialog({
    type: 'choice', title: 'Diagnosis: what are we dealing with?',
    body: 'Use the Forensic Lens sequence. You can answer again if you choose differently.',
    options: [
      { id: 'bug', label: 'Software bug: retry without an idempotency key', detail: 'A fixable operational fault in the Settlement Notifier.' },
      { id: 'malware', label: 'Malware replaying receipts', detail: 'Hostile code deliberately repeating events.' },
      { id: 'creds', label: 'Exposed service credential', detail: 'Someone using a leaked token to send events.' },
    ],
    onChoose: (id) => {
      if (id === 'bug') {
        a.flag('diagnosed'); a.score('Correct diagnosis: software bug', 'good');
        a.say('Diagnosis confirmed: software bug', 'A retry without an idempotency key. The Patch Kit can fix this. The clue points at the Event Stream Hall: request the Event Trace Pass to see the replay trace.', 'good');
      } else {
        a.say('Not quite', id === 'malware' ? 'No hostile indicators: no odd logins, no outside connections, and the pattern matches a timeout-triggered retry. Read the sequence again.' : 'No credential misuse showed up: every token was valid and normal. The timing points to a retry bug. Read the sequence again.', 'warn', { hint: true });
        startDiagnosis(a);
      }
    },
  });
}

const rules: Rule[] = [
  { tool: 'scanner', target: TERMINAL,
    run: (a) => {
      a.flag('scannedTerminal'); a.status(TERMINAL, 'suspect'); a.status(NOTIFIER, 'suspect');
      a.entity('gremlin', { visible: true });
      a.routeMark('receipt_event_feed', 'suspicious');
      a.clue('c_dup_receipt', 'One receipt appears twice', 'The card terminal shows receipt R-77•• twice, one second apart.');
      a.say('Receipt appears twice', 'Amber warning: one card receipt shows up twice. The Receipt Event Feed is marked suspicious. Retrieve the masked receipt from the Masked Receipt Log (E).', 'warn');
      a.fx('scan', TERMINAL);
    } },
  { tool: 'scanner', target: [REPLAY_BUFFER, roomTarget('event_stream')],
    run: (a) => {
      a.flag('scannedBuffer'); a.status(REPLAY_BUFFER, 'suspect');
      for (const id of ghostIds(a.s)) a.entity(id, { visible: true });
      a.say('Duplicate ghosts revealed', 'The Replay Buffer holds the same receipt ID more than once. The ghosts are now visible on the Receipt Event Feed.', 'warn');
      a.fx('scan', REPLAY_BUFFER);
    } },
  { tool: 'scanner', target: FEED,
    run: (a) => {
      const s = a.s, live = ghostIds(s).length;
      if (s.flags.released && s.flags.patched && s.flags.purged) {
        a.flag('flowVerified'); a.adjust('recovery', 4); a.status(FEED, 'fixed'); a.routeMark('receipt_event_feed', 'restored');
        a.say('Verified: receipts flowing, no duplicates', `Valid receipts are flowing again (${Math.round(a.data.validPosted)} posted). 0 replays on the feed and 0 duplicates in the ledger.`, 'good');
        a.fx('sparkle', FEED);
      } else if (s.contained[FEED]) {
        a.say('Feed is quarantined', 'Replays are held. Valid receipts continue via the Card Receipt route if you reroute them. Fix the cause and clean the buffer first.', 'info');
      } else {
        a.say('Feed is open', live ? `${live} replay(s) are still in the pipeline. Consider quarantining only this feed.` : 'No replays seen right now. Verify again after the fix.', live ? 'warn' : 'info');
      }
    } },
  { tool: 'lens', target: [FEED, NOTIFIER],
    requires: (s) => (!s.flags.scannedTerminal ? 'Scan the Card Terminal first so you know where to look. The Signal Scanner is safe and costs nothing.'
      : !s.evidence.has('ev_masked_receipt') ? 'Retrieve the masked receipt from the Masked Receipt Log (press E at it) so the lens has a receipt ID to follow.' : true),
    run: (a) => {
      a.flag('lensed');
      a.clue('c_timeline', 'Replay fault on the event route', 'Ack timed out at 1 s; the notifier retried without an idempotency key. The replays go to the Event Stream Hall.');
      a.clue('c_points_stream', 'Clue points to the Event Stream Hall', 'Replays are travelling through the event stream. Request the Event Trace Pass.');
      a.routeMark('receipt_event_feed', 'suspicious');
      a.dialog({
        type: 'timeline', title: 'Forensic Lens: sequence for receipt R-77••',
        steps: [
          { time: '14:58:02', text: 'Config change CH-204 lowers the acknowledgement timeout from 5 s to 1 s.', tone: 'info' },
          { time: '15:02:11', text: 'Card settlement completes. Receipt R-77•• (£42.50) published to the Receipt Event Feed.', tone: 'good' },
          { time: '15:02:12', text: 'Acknowledgement is slower than 1 s. The notifier decides it failed.', tone: 'warn' },
          { time: '15:02:12', text: 'The notifier resends R-77•• with no idempotency key. The stream cannot tell it is a repeat.', tone: 'bad' },
          { time: '15:02:13', text: 'Same pattern repeats. No unusual logins, outside connections or credential use.', tone: 'info' },
        ],
        conclusion: 'Likely source: a retry bug in the Settlement Notifier, made visible by the shorter timeout. The replays travel into the Event Stream Hall. This looks like a fault, not an attack.',
        onClose: () => { if (!a.s.flags.diagnosed) startDiagnosis(a); },
      });
    } },
  { tool: 'patch', target: NOTIFIER,
    requires: (s) => (!s.flags.diagnosed ? 'Diagnose first. Use the Forensic Lens on the Receipt Event Feed and decide what you are dealing with.' : true),
    run: (a) => {
      a.flag('patched'); a.status(NOTIFIER, 'fixed'); a.status(TERMINAL, 'ok');
      a.entity('gremlin', { mood: 'fixed', label: 'Retry Gremlin (now polite)' });
      a.fx('repair', NOTIFIER);
      a.clue('c_patch', 'Patch applied', 'The notifier now sends an idempotency key and waits 5 s before retrying.');
      a.say('Patched', 'The notifier now tags each receipt with an idempotency key and waits for the acknowledgement. No new replays will be created. Replays already in the stream still need cleaning.', 'good');
    } },
  { tool: 'restore', target: REPLAY_BUFFER,
    requires: (s) => (!s.flags.patched ? 'Patch the cause first, otherwise the buffer will fill with replays again.'
      : !(s.contained[FEED] || s.contained[roomTarget('event_stream')]) ? 'Contain the replay path first, so nothing moves while the buffer is cleaned.' : true),
    confirm: (s) => ({
      title: 'Restore the Replay Buffer to the 15:00 clean checkpoint?',
      body: 'Replays created after the checkpoint are removed. Valid receipts since 15:00 are replayed from the card journal.',
      impacts: [{ label: 'Removes', text: `${ghostIds(s).length} held duplicate replay(s)`, tone: 'good' }, { label: 'Keeps', text: 'Valid receipts (replayed from the journal)', tone: 'good' }], confirmLabel: 'Restore',
    }),
    run: (a) => {
      for (const id of ghostIds(a.s)) a.removeEntity(id);
      a.flag('purged'); a.status(REPLAY_BUFFER, 'fixed'); a.data.replaysInStream = 0; a.adjust('recovery', 14);
      a.fx('sparkle', REPLAY_BUFFER);
      a.say('Buffer restored', 'Held duplicates were removed. Valid receipts were replayed from the journal and are ready to be released.', 'good');
    } },
  { tool: 'recon', target: [AR, GL, roomTarget('finance_core')],
    requires: (s) => (!s.evidence.has('ev_ledger_check') ? 'Look at the masked ledger entries first (press E at the General Ledger) so you know what to compare.' : true),
    run: (a) => {
      const d = a.data, s = a.s;
      const events = EXPECTED + d.replaysInStream + d.dupPosted;
      const before: [string, string][] = [['Expected receipts', `${EXPECTED} · ${money(5412.6)}`], ['Received events', `${events} (replays included)`], ['Ledger postings', `${EXPECTED + d.dupPosted} · ${money(5412.6 + 42.5 * d.dupPosted)}`]];
      if (!s.flags.patched || !s.flags.purged) {
        a.dialog({ type: 'info', title: 'Reconciliation: not ready', body: 'The fault is still active or replays are still in the buffer. Totals would drift again. Patch the notifier and restore the buffer, then reconcile.', rows: before });
        return a.log('Reconciliation attempted before the fix was complete.', 'warn');
      }
      if (d.dupPosted > 0) {
        a.adjust('integrity', 6 * d.dupPosted, `${d.dupPosted} duplicate posting(s) reversed by journal RJ-0042`);
        d.dupReversed += d.dupPosted; d.dupPosted = 0; a.status(GL, 'ok');
      }
      const after: [string, string][] = [['Expected receipts', `${EXPECTED} · ${money(5412.6)}`], ['Received events', `${EXPECTED} (no replays)`], ['Ledger postings', `${EXPECTED} · ${money(5412.6)}`]];
      a.dialog({ type: 'info', title: 'Reconciliation: duplicate resolved, valid receipts continue', body: d.dupReversed ? `Reversal journal RJ-0042 removed ${d.dupReversed} duplicate posting(s). Valid receipts are still being posted.` : 'No duplicate receipt reached the ledger. Valid receipts continue.', compare: { before, after } });
      a.flag('reconciled'); a.flag('reconciledAll'); a.adjust('recovery', 6); a.adjust('audit', 4); a.fx('sparkle', GL); a.score('Reconciled: totals agree', 'good');
    } },
  { tool: 'token', target: NOTIFIER,
    run: (a) => {
      a.unnecessary(); a.hit('token:notifier', 4, 20);
      a.say('Credential rotated (not needed)', 'The notifier credential was refreshed. The Forensic Lens showed no credential misuse, so this only interrupted the notifier briefly. Harmless, but not the narrowest fix.', 'warn');
    } },
];

const mission: MissionDef = {
  id: 'duplicate-ghost', title: 'The Duplicate Ghost', tagline: 'A card receipt keeps coming back. Find out why, without breaking the ledger.',
  status: 'playable', difficulty: 'Tutorial', startRoom: 'secure_ops', order: 1,
  theme: 'Transaction integrity: catch a duplicate before it posts twice.',
  requiredPasses: ['payments_audit_pass', 'event_trace_pass', 'ledger_read_pass', 'fabric_observer_pass'],
  startClock: 15 * 60, deadlineClock: 16 * 60, deadlineLabel: 'Payment run 16:00', parSeconds: 420,

  goals: [
    goal('p1', 'primary', 'Find the repeated card receipt', (s) => !!s.flags.scannedTerminal && !!s.flags.receiptEvidence, 'Signal Scanner (1) at the Card Terminal, then the Masked Receipt Log.'),
    goal('p2', 'primary', 'Trace it from Card Payments through the Event Stream Hall', (s) => !!s.flags.lensed && !!s.flags.traceEvidence, 'Forensic Lens (2) on the Receipt Event Feed, then the replay trace in the Event Stream Hall.'),
    goal('p3', 'primary', 'Contain only the replaying route', (s) => !!s.flags.contained, 'Quarantine Field (3) on the Receipt Event Feed.'),
    goal('p4', 'primary', 'Apply the simulated fix', (s) => !!s.flags.patched && !!s.flags.purged, 'Patch Kit (4) at the Settlement Notifier and Clean Restore (6) at the Replay Buffer.'),
    goal('p5', 'primary', 'Reconcile Finance Core totals', (s) => !!s.flags.reconciled, 'Reconciliation Wand (7) at Accounts Receivable.'),
    goal('p6', 'primary', 'Verify Fabric data freshness', (s) => !!s.flags.fabricVerified, 'Fabric Observer Pass, then E at the Pipeline Status Display.'),
    goal('o1', 'optional', 'Keep other card receipts moving', (s) => !!s.flags.rerouted || !s.flags.contained),
    goal('o2', 'optional', 'Obtain only the required access passes', (s) => [...s.passes].filter((p) => p !== 'ops_pass').every((p) => (s.mission.requiredPasses ?? []).includes(p)) && s.stats.passDenials === 0),
    goal('o3', 'optional', 'Collect all three evidence items', (s) => ['ev_masked_receipt', 'ev_replay_trace', 'ev_ledger_check'].every((e) => s.evidence.has(e))),
    goal('o4', 'optional', 'Record the final reconciliation result', (s) => !!s.flags.rec_recon_result),
    goal('s1', 'stretch', 'No duplicate ever reaches the ledger', (s) => !!s.flags.reconciled && (s.data.dupReversed ?? 0) === 0 && (s.data.dupPosted ?? 0) === 0),
    goal('s2', 'stretch', 'Finish in under 7 minutes with no hints', (s) => !!s.flags.reconciled && s.elapsed < 420 && s.stats.hintsUsed === 0),
  ],
  recordables: [{ id: 'recon_result', label: 'Final reconciliation: 128 expected / 128 received / 128 posted', when: (s) => !!s.flags.reconciled }],
  bestChoice: { 'Diagnosis: what are we dealing with?': 'bug' },
  nextStep: () => 'Require an idempotency key on every receipt event, and keep the replay path quarantine runbook next to the Settlement Notifier.',
  alert: { severity: 'Medium', headline: 'Receipt count mismatch: card receipt R-77•• seen more than once', points: 'card_payments',
    symptoms: ['Receipt count mismatch between Card Payments and the event stream', 'Accounts Receivable has not flagged a variance yet', 'Valid card receipts are still arriving'],
    impact: 'If duplicates reach the General Ledger, the same card receipt posts twice and transaction integrity falls.' },
  briefing: [
    'A fictional card receipt event (R-77••, a synthetic £42.50) has been replayed. The ledger could post it twice. The alert points at Card Payments.',
    'You only hold an Ops Pass. Request read-only passes at the Access Desk (or a door reader) as evidence points to each room. Passes expire when the mission ends.',
    'Investigate first, contain only the replay path, fix the cause, reconcile, then verify in reporting. Everything here is invented.',
  ],
  evidencePath: ['card_payments', 'event_stream', 'finance_core', 'fabric_platform'],
  evidence: EVIDENCE,
  incidentRoute: 'receipt_event_feed',

  passGrants: {
    payments_audit_pass: { when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first. The alert will point you at the right room.' },
    event_trace_pass: { when: (s) => !!s.flags.lensed, hint: 'No clue points at the Event Stream Hall yet. Trace the replay fault with the Forensic Lens in Card Payments first.' },
    ledger_read_pass: { when: (s) => !!s.flags.traceEvidence, hint: 'Nothing points at the ledger yet. Retrieve the replay trace from the Event Stream Hall first.' },
    fabric_observer_pass: { when: (s) => !!s.flags.reconciled, hint: 'Fix the fault and reconcile first. Then request the Fabric Observer Pass to verify reporting.' },
  },

  setup(a) {
    Object.assign(a.data, { dupPosted: 0, dupReversed: 0, spawned: 0, nextSpawn: 40, replaysInStream: 0, validQueued: 0, validPosted: 128 });
    a.entity('gremlin', { kind: 'bug', label: 'Retry Gremlin', room: 'card_payments', ...at('card_payments', 8, 5), visible: false, mood: 'active' });
  },

  tick(a, dt) {
    const s = a.s, d = a.data;
    if (!s.flags.briefed) return;
    if (!s.flags.patched && d.spawned < 5) {
      d.nextSpawn -= dt;
      if (d.nextSpawn <= 0) {
        d.spawned++; d.nextSpawn = 45; d.replaysInStream++;
        s.setEntity('ghost' + d.spawned, { kind: 'ghost', label: 'R-77•• (replay)', route: 'receipt_event_feed', p: 0, visible: !!s.flags.scannedBuffer });
        if (d.spawned === 1) a.log('Receipt R-77•• was replayed into the event stream.', 'alert');
      }
    }
    const frozen = (p: number) => !!s.contained[FEED] || (!!s.contained[roomTarget('event_stream')] && p > 0.28) || (!!s.contained[roomTarget('card_payments')] && p < 0.28);
    for (const id of ghostIds(s)) {
      const g = s.entities[id];
      const p = g.p ?? 0;
      g.held = frozen(p);
      if (!g.held) g.p = p + dt / 70;
      if ((g.p ?? 0) >= 1) {
        s.removeEntity(id); d.dupPosted++; d.replaysInStream = Math.max(0, d.replaysInStream - 1);
        a.adjust('integrity', -6); a.log(`Duplicate of R-77•• posted to the ledger (${d.dupPosted}). Oops.`, 'bad');
        a.fx('alarm', GL); a.status(GL, 'bad');
      }
    }
    const stopped = !!s.contained[FEED] && !s.contained[FEED].rerouted;
    d.validQueued = stopped ? Math.min(60, d.validQueued + dt * 0.4) : Math.max(0, d.validQueued - dt * 2);
    if (!stopped && !s.contained['route:card_receipt'] && !s.contained['room:card_payments']) d.validPosted += dt * 0.15;
  },

  rules,

  interactions: {
    [WALL]: (a) => {
      a.flag('briefed'); a.score('Read the incident wall', 'info');
      a.dialog({ type: 'alert' });
    },
    [RECEIPT_LOG]: (a) => {
      if (!a.evidence('ev_masked_receipt')) return;
      a.flag('receiptEvidence');
      a.clue('c_masked', 'Masked receipt log', 'R-77•• · £42.50 · card ••••4242 (synthetic) · recorded twice with the same event ID. The second copy followed one second later.');
      a.dialog({ type: 'info', title: 'Masked Receipt Log (read-only, masked)', rows: [['Receipt', 'R-77••'], ['Amount', '£42.50 (synthetic)'], ['Card', '••••4242 (masked)'], ['Occurrences', '2 (same event ID)'], ['Sensitivity', 'Masked card data']],
        body: 'Evidence retrieved. The duplicate was published to the Receipt Event Feed. Use the Forensic Lens on that route (click the flow line) to trace the fault.' });
    },
    [REPLAY_CONSOLE]: (a) => {
      if (!a.evidence('ev_replay_trace')) return;
      a.flag('traceEvidence');
      a.clue('c_trace', 'Replay trace', 'Event R-77•• was delivered 3 times; each copy reached the Finance Core consumer. A possible duplicate posting.');
      a.dialog({ type: 'info', title: 'Replay Diagnostic Console (event metadata only)', rows: [['Event ID', 'R-77••'], ['Deliveries', `${1 + Math.max(0, a.data.replaysInStream)} so far`], ['Consumer', 'Finance Core ledger poster'], ['Idempotency key', 'missing on retries']],
        body: 'One receipt event is being repeated. The trace points to a possible duplicate posting in the ledger: request the Ledger Read Pass to check the masked ledger data.' });
    },
    [GL]: (a) => {
      if (!a.evidence('ev_ledger_check')) return;
      a.flag('ledgerEvidence');
      const d = a.data;
      a.clue('c_ledger', 'Masked ledger entries', `R-77•• appears ${1 + d.dupPosted} time(s) in the ledger.`);
      a.dialog({ type: 'info', title: 'General Ledger (read-only, masked)', rows: [['Receipt R-77••', `${1 + d.dupPosted} posting(s)`], ['Ledger postings', `${EXPECTED + d.dupPosted} receipts`], ['Expected', `${EXPECTED} receipts`], ['Status', d.dupPosted ? 'Duplicate posted: fix, then reconcile' : 'No duplicate yet: contain the replay path before one arrives']],
        body: 'Evidence retrieved. Now contain only the replay path, apply the fix and reconcile.' });
    },
    [PIPELINE]: (a) => {
      const s = a.s;
      if (!(s.flags.released && s.flags.reconciled && s.flags.flowVerified)) {
        s.emit('ui', 'fabric');
        return a.say('Reporting not ready to verify', 'Release the containment, verify the feed with the Signal Scanner, and reconcile first. The panel shows demo data meanwhile.', 'info', { hint: true });
      }
      if (!a.evidence('ev_fabric_freshness')) return;
      a.flag('fabricVerified'); a.adjust('audit', 6); a.fx('sparkle', PIPELINE); a.score('Verified in Fabric', 'good');
      s.emit('ui', 'fabric');
      a.say('Verified in Fabric (demo data)', 'Bronze, Silver and Gold agree on 128 receipts. Freshness is back to normal and the dashboard is healthy.', 'good');
    },
  },

  containment: {
    [FEED]: {
      availability: 3, narrow: 1, effective: true, canReroute: true,
      notes: [
        { label: 'Stops', text: 'Replays can no longer reach the ledger. Other routes keep running.', tone: 'good' },
        { label: 'Delays', text: 'Valid receipt events queue (not lost) unless you reroute them.', tone: 'warn' },
      ],
      onApply: (a) => { a.data.scope ??= 'feed'; a.flag('contained'); a.routeMark('receipt_event_feed', undefined); },
      onRelease: (a) => { a.flag('released'); a.routeMark('receipt_event_feed', 'restored'); },
      onReroute: (a) => a.flag('rerouted'),
      canRelease: (s) => (s.flags.patched && s.flags.purged ? true : 'The fault is not fixed and cleaned yet. Releasing would let held duplicates reach the ledger. Patch the Settlement Notifier and restore the Replay Buffer first.'),
    },
    [roomTarget('event_stream')]: {
      availability: 10, narrow: 0.45, effective: true,
      notes: [
        { label: 'Stops', text: 'Replays cannot leave the hall, but the whole hall is paused.', tone: 'warn' },
        { label: 'Also delays', text: 'The Finance Event Mirror to Fabric and every other event feed. Reporting goes stale.', tone: 'bad' },
      ],
      onApply: (a) => { a.data.scope ??= 'room_es'; a.flag('contained'); },
      onRelease: (a) => a.flag('released'),
      canRelease: (s) => (s.flags.patched && s.flags.purged ? true : 'Patch the Settlement Notifier and restore the Replay Buffer before releasing, or the held duplicates will flow on.'),
    },
    [routeTarget('card_receipt')]: {
      availability: 8, narrow: 0.2,
      notes: [{ label: 'Stops', text: 'Valid card receipts through Accounts Receivable.', tone: 'bad' }, { label: 'Watch out', text: 'This is not the replay path: duplicates still reach the ledger.', tone: 'bad' }],
      onApply: (a) => { a.data.scope ??= 'card_receipt'; }, applyText: 'That route carries valid receipts, not the replays.',
    },
    [roomTarget('card_payments')]: {
      availability: 18, narrow: 0.1,
      notes: [{ label: 'Stops', text: 'All card authorisation and settlement pauses.', tone: 'bad' }, { label: 'Watch out', text: 'Replays already in the stream will still reach the ledger.', tone: 'bad' }],
      onApply: (a) => { a.data.scope ??= 'room_card'; }, applyText: 'That is broad, and replays already in the stream are not affected.',
    },
    [routeTarget('finance_event_mirror')]: {
      availability: 4, narrow: 0.1,
      notes: [{ label: 'Stops', text: 'The analytics mirror to Fabric (reporting goes stale).', tone: 'warn' }, { label: 'Watch out', text: 'It does not stop replays reaching the ledger.', tone: 'bad' }],
      onApply: (a) => { a.data.scope ??= 'mirror'; },
    },
  },

  objectives: [
    { id: 'o_brief', text: 'Read the Incident Wall in Secure Operations Atrium', hint: 'Walk to the Incident Wall (back wall, left) and press E.', done: (s) => !!s.flags.briefed },
    { id: 'o_pass1', text: 'Request the Payments Audit Pass', hint: 'Press E at the Access Desk (front-left of the room) and request the Payments Audit Pass.', done: (s) => s.passes.has('payments_audit_pass') },
    { id: 'o_card', text: 'Walk to Card Payments (B3) through the corridors', hint: 'Leave the atrium by the south door, follow the South Concourse and enter Card Payments (the door on its north wall). Use the minimap (M) to see the route.', done: (s) => !!s.flags.visited_card_payments },
    { id: 'o_scan', text: 'Scan the Card Terminal with the Signal Scanner (1)', hint: 'Select tool 1 and press E at the Card Terminal (simulated).', done: (s) => !!s.flags.scannedTerminal },
    { id: 'o_receipt', text: 'Retrieve the masked receipt', hint: 'Press E at the Masked Receipt Log.', done: (s) => !!s.flags.receiptEvidence },
    { id: 'o_lens', text: 'Trace the replay fault with the Forensic Lens (2)', hint: 'Select tool 2, then click the Receipt Event Feed flow line (or press E at the Settlement Notifier).', done: (s) => !!s.flags.lensed },
    { id: 'o_diag', text: 'Diagnose the fault', hint: 'Answer the diagnosis question. You can retry.', done: (s) => !!s.flags.diagnosed },
    { id: 'o_pass2', text: 'Request the Event Trace Pass', hint: 'At a door reader or the Access Desk. The clue points at the Event Stream Hall (B1).', done: (s) => s.passes.has('event_trace_pass') },
    { id: 'o_trace', text: 'Retrieve the replay trace in the Event Stream Hall', hint: 'Follow the Receipt Event Feed north to B1. Press E at the Replay Diagnostic Console.', done: (s) => !!s.flags.traceEvidence },
    { id: 'o_pass3', text: 'Request the Ledger Read Pass', hint: 'The trace points at a possible duplicate posting in Finance Core (B2).', done: (s) => s.passes.has('ledger_read_pass') },
    { id: 'o_ledger', text: 'Check the masked ledger data in Finance Core', hint: 'Press E at the General Ledger console.', done: (s) => !!s.flags.ledgerEvidence },
    { id: 'o_contain', text: 'Quarantine only the replay path (Receipt Event Feed)', hint: 'Select tool 3, click the Receipt Event Feed line, check the impact preview, confirm.', done: (s) => !!s.flags.containedEffective || !!s.flags.contained },
    { id: 'o_patch', text: 'Patch the Settlement Notifier (4)', hint: 'Back in Card Payments, select tool 4 and press E at the Settlement Notifier.', done: (s) => !!s.flags.patched },
    { id: 'o_restore', text: 'Restore the Replay Buffer to a clean checkpoint (6)', hint: 'In the Event Stream Hall, tool 6 at the Replay Buffer while the feed is contained.', done: (s) => !!s.flags.purged },
    { id: 'o_recon', text: 'Reconcile totals in Finance Core (7)', hint: 'Select tool 7 and press E at the Accounts Receivable or General Ledger console.', done: (s) => !!s.flags.reconciled },
    { id: 'o_release', text: 'Release containment and verify the feed (3, then 1)', hint: 'Tool 3 on the same route releases it; then scan the route with tool 1.', done: (s) => !!s.flags.flowVerified },
    { id: 'o_fabric', text: 'Get the Fabric Observer Pass and verify freshness in Fabric Data Platform', hint: 'Request the pass, walk to C1 and press E at the Pipeline Status Display.', done: (s) => !!s.flags.fabricVerified },
    { id: 'o_report', text: 'Return to Secure Operations Atrium and file the report at the Evidence Board', hint: 'Go back to A3 and press E at the Evidence Board.', done: (s) => !!s.flags.reported },
  ],

  canReport: (s) => {
    const missing = EVIDENCE.filter((e) => !s.evidence.has(e.id));
    if (missing.length) return `Evidence missing: ${missing.map((m) => m.name).join(', ')}.`;
    if (!s.flags.diagnosed) return 'No diagnosis recorded yet.';
    if (!s.flags.patched || !s.flags.purged || !s.flags.reconciled) return 'The fix is not complete: patch, restore the buffer and reconcile.';
    if (!s.flags.flowVerified || !s.flags.fabricVerified) return 'Verify the corrected feed and the Fabric freshness first.';
    return true;
  },
  isComplete: (s) => !!s.flags.reported,
  incidents: (s) => (s.flags.reconciled && s.flags.patched && s.flags.purged ? 0 : 1) + ((s.data.dupPosted ?? 0) > 0 ? 1 : 0),
  scoreInput: (s) => ({
    diagnosed: !!s.flags.diagnosed, verified: !!s.flags.fabricVerified && !!s.flags.flowVerified, reconciled: !!s.flags.reconciled,
    narrow: ({ feed: 1, room_es: 0.45, mirror: 0.1, card_receipt: 0.2, room_card: 0.1 } as Record<string, number>)[s.data.scope as string] ?? 0.5,
    privacyOk: s.stats.unnecessary === 0 && s.stats.passDenials <= 1,
  }),
  debrief: (s) => {
    const d = s.data;
    const scopeText: Record<string, string> = {
      feed: 'You quarantined only the Receipt Event Feed: the narrowest point that protects the ledger. Other routes kept running.',
      room_es: 'You quarantined the whole Event Stream Hall. It protected the ledger but also paused the Fabric mirror and every other feed.',
      card_receipt: 'You first quarantined the Card Receipt route. That is where valid receipts flow, so it did not stop the replays.',
      room_card: 'You quarantined all of Card Payments. That is broad and did not stop replays already in the stream.',
      mirror: 'You first quarantined the Fabric mirror. That made reporting stale and did not stop the replays.',
    };
    return {
      what: 'A configuration change shortened the acknowledgement timeout on the Settlement Notifier. It then retried receipt R-77•• without an idempotency key, so the event stream could not tell the replays were repeats.',
      response: [
        scopeText[d.scope as string] ?? 'You did not need containment: nothing reached the ledger before you fixed the cause.',
        'You requested read-only, masked passes only as evidence pointed to each room, and diagnosed a software fault instead of reaching for an attack response.',
        s.flags.rerouted ? 'You rerouted valid receipts around the contained feed, so they kept posting.' : 'Valid receipts waited in a queue while the feed was held. None were lost.',
        d.dupReversed ? `${d.dupReversed} duplicate posting(s) reached the ledger and were reversed by journal RJ-0042.` : 'No duplicate receipt reached the ledger.',
        'Reporting was verified in Fabric (demo data): Bronze, Silver and Gold agree with the ledger.',
      ],
      learn: 'Idempotency keys let a system recognise a retry. Contain at the narrowest point that stops harm, fix the cause, clean the state, then verify with totals and reporting.',
    };
  },
};
export default mission;
export { PASSES };
