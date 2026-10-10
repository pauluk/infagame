import { goal, makeScenario, st } from './scenario';
import { propTarget } from '../targets';

const DISPLAY = propTarget('fabric_platform', 'pipeline_display');
const SILVER = propTarget('fabric_platform', 'silver');
const GL = propTarget('finance_core', 'gl');

export default makeScenario({
  id: 'fabric-mirror', order: 5, title: 'The Fabric Mirror', tagline: 'Bronze looks fresh but Silver and Gold are wrong. Follow the lineage, fix one stage.', difficulty: 'Medium',
  theme: 'Reporting accuracy: dashboards must match the ledger.',
  pointsRoom: 'fabric_platform', incidentRoute: 'finance_event_mirror', clock: ['07:30', '08:30', 'Dashboard refresh 08:30'], parSeconds: 480,
  alert: { severity: 'Medium', headline: 'Dashboard numbers stopped moving and no longer match the ledger', symptoms: ['Bronze event counts look normal', 'Silver last refreshed 47 minutes ago', 'Gold and the dashboard are behind'], impact: 'Leaders could make decisions on out-of-date or inconsistent numbers.' },
  briefing: ['Raw events keep arriving in Bronze, but a Silver or Gold output is stale or inconsistent.', 'Follow the data lineage, find where the sample totals diverge, compare with Finance Core, correct the mapping, rerun only the affected stage and verify the dashboard.', 'All pipelines and figures are synthetic demo data (Demo data badge).'],
  evidence: [
    { id: 'ev_lineage', name: 'Data lineage', sourceRoom: 'fabric_platform', requiredPass: 'fabric_observer_pass', sensitivity: 'Synthetic pipeline status', objective: 'p1', pathStep: 'fabric_platform' },
    { id: 'ev_recon_summary', name: 'Finance Core reconciliation summary', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Masked reconciliation summary', objective: 'p3', pathStep: 'finance_core' },
    { id: 'ev_after', name: 'Gold output and dashboard after fix', sourceRoom: 'fabric_platform', requiredPass: 'fabric_observer_pass', sensitivity: 'Synthetic pipeline status', objective: 'p6', pathStep: 'fabric_platform' },
  ],
  evidencePath: ['fabric_platform', 'finance_core'],
  passes: [
    { pass: 'fabric_observer_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first.' },
    { pass: 'ledger_read_pass', when: st('diverge'), hint: 'Find the stage where totals diverge first; then compare with Finance Core.' },
  ],
  required: ['fabric_observer_pass', 'ledger_read_pass'],
  steps: [
    { id: 'lineage', at: DISPLAY, tool: 'e', evidence: 'ev_lineage', mark: [['finance_event_mirror', 'suspicious']],
      info: { title: 'Pipeline Status Display: lineage view (demo data)', rows: [['Bronze (raw)', '128 receipts · £5,412.60 · fresh (1.4 min)'], ['Silver (clean)', '124 receipts · £5,201.40 · STALE (47 min)'], ['Gold (reporting)', '124 receipts · £5,201.40 · stale'], ['Dashboard', 'Behind the ledger'], ['Silver failure', 'Schema mismatch: new column receipt_channel']], body: 'Totals fall between Bronze and Silver. Decide where they diverge.' },
      effect: (a) => a.flag('lineageViewed') },
    { id: 'diverge', at: SILVER, tool: 'e', needs: ['lineage'], needsMsg: 'Follow the lineage at the Pipeline Status Display first: do not guess.',
      choice: { title: 'Where do the sample totals first diverge?', body: 'Use the lineage you just read.', options: [
        { id: 'silver', label: 'Silver (the first stage that is short)', detail: 'Bronze 128 → Silver 124.', correct: true, result: 'Silver is where totals first diverge. Gold only inherits it.', gain: { audit: 4 }, flags: ['explainedByLineage'] },
        { id: 'bronze', label: 'Bronze', detail: 'Raw events.', correct: false, result: 'Bronze matches the ledger, so the divergence is later.' },
        { id: 'gold', label: 'Gold', detail: 'Reporting tables.', correct: false, result: 'Gold matches Silver, so it only inherits the problem.' }] } },
    { id: 'compare', at: GL, tool: 'recon', needs: ['diverge'], needsMsg: 'Identify the diverging stage first.', evidence: 'ev_recon_summary', gain: { audit: 3 },
      info: { title: 'Comparison: Finance Core summary vs Fabric', rows: [['Source (ledger)', 'Finance Core reconciliation summary'], ['Source (Fabric)', 'Silver and Gold sample totals']], compare: { before: [['Finance Core', '128 receipts · £5,412.60'], ['Bronze', '128 receipts · £5,412.60'], ['Silver', '124 receipts · £5,201.40']], after: [['Short by', '4 receipts · £211.20'], ['Cause', 'Rows with new column dropped'], ['Fix location', 'Silver mapping only']] }, body: 'Bronze matches the ledger. Silver drops 4 rows.' } },
    { id: 'fix_mapping', at: SILVER, tool: 'patch', needs: ['compare'], needsMsg: 'Compare with the Finance Core summary first.',
      choice: { title: 'Correct the transformation', body: 'The new field receipt_channel is breaking the Silver mapping.', options: [
        { id: 'map', label: 'Update the Silver mapping to accept receipt_channel', detail: 'Fix where it breaks.', correct: true, result: 'The Silver mapping now accepts the new column.', gain: { integrity: 0, audit: 2 } },
        { id: 'drop', label: 'Ask producers to remove the new field', detail: 'Slow; breaks other consumers.', correct: false, result: 'Other consumers need that field. Fix the Silver mapping instead.' }] }, fx: 'repair' },
    { id: 'rerun', at: SILVER, tool: 'restore', needs: ['fix_mapping'], needsMsg: 'Correct the mapping before rerunning.',
      choice: { title: 'Rerun the pipeline', body: 'Which stages do you rerun?', options: [
        { id: 'silver', label: 'Rerun Silver only (Gold refreshes after it)', detail: 'Bronze and other stages stay available.', correct: true, result: 'Silver reran from the Bronze checkpoint and Gold refreshed. Bronze was untouched.', gain: { recovery: 10 }, flags: ['onlyAffected'] },
        { id: 'all', label: 'Rebuild Bronze, Silver and Gold', detail: 'Works but reporting is down while it runs.', correct: false, completes: true, hit: 14, hitSeconds: 60, gain: { recovery: 2 }, flags: ['rebuiltAll'], result: 'Everything was rebuilt. It worked, but unaffected stages were taken down too.' }] },
      effect: (a) => { a.data.silverLag = 0; a.data.bronzeLag = 0; a.flag('restored'); } },
    { id: 'verify', at: DISPLAY, tool: 'e', needs: ['rerun'], needsMsg: 'Rerun the affected stage first.', evidence: 'ev_after', gain: { audit: 4 }, mark: [['finance_event_mirror', 'restored']], fx: 'sparkle',
      effect: (a) => { a.flag('reconciledAll'); a.s.emit('ui', 'fabric'); },
      info: { title: 'Verified: Gold output and dashboard (demo data)', rows: [['Gold', '128 receipts · £5,412.60 (matches Finance Core)'], ['Silver', 'Fresh'], ['Dashboard', 'Fresh and consistent']], body: 'Bronze, Silver and Gold agree with the ledger.' } },
  ],
  goals: [
    goal('p1', 'primary', 'Follow the data lineage from Bronze to the affected report', st('lineage'), 'Press E at the Pipeline Status Display in the Fabric Data Platform (C1).'),
    goal('p2', 'primary', 'Identify the stage where the sample totals diverge', st('diverge'), 'Press E at the Silver station and answer.'),
    goal('p3', 'primary', 'Compare the result with the Finance Core reconciliation summary', st('compare'), 'Request the Ledger Read Pass, then Reconciliation Wand (7) at the General Ledger.'),
    goal('p4', 'primary', 'Correct the simulated mapping or transformation', st('fix_mapping'), 'Patch Kit (4) at the Silver station.'),
    goal('p5', 'primary', 'Rerun only the affected stage', st('rerun'), 'Clean Restore Beacon (6) at the Silver station.'),
    goal('p6', 'primary', 'Verify that the Gold output and dashboard are fresh and consistent', st('verify'), 'Press E at the Pipeline Status Display again.'),
    goal('o1', 'optional', 'Keep unaffected Fabric stages available', (s) => !s.flags.rebuiltAll && s.stats.minAvail >= 95),
    goal('o2', 'optional', 'Record the before-and-after totals', (s) => !!s.flags.rec_totals),
    goal('o3', 'optional', 'Explain the issue using the lineage view rather than guessing', (s) => !!s.flags.explainedByLineage && (s.data.wrong ?? 0) === 0),
    goal('s1', 'stretch', 'No wrong answers and no hints', (s) => (s.data.wrong ?? 0) === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 5 minutes', (s) => !!s.flags.st_verify && s.elapsed < 300),
  ],
  recordables: [{ id: 'totals', label: 'Before and after totals (Bronze 128 / Silver 124 → Silver 128 / Gold 128)', when: (s) => !!s.flags.st_verify }],
  setup: (a) => { a.data.silverLag = 46; a.data.bronzeLag = 0; },
  debrief: { what: 'A new field in the card events made the Silver refresh drop four rows on a schema mismatch, leaving Gold and the dashboard stale and short.',
    learn: 'Follow lineage to the first stage where totals diverge, compare with the ledger, fix that stage and rerun only it. Do not guess and do not rebuild everything.',
    nextStep: () => 'Add a schema-drift check to the Silver mapping so unexpected columns raise an alert instead of silently dropping rows.',
    response: (s) => [s.flags.onlyAffected ? 'You reran Silver only; other stages stayed available.' : 'You rebuilt every stage, which took unaffected stages down too.', s.flags.explainedByLineage ? 'You used the lineage view to find the stage.' : 'You did not rely on the lineage view.', 'You compared the result with the Finance Core reconciliation summary before fixing.'] },
  script: [['pass', 'fabric_observer_pass'], ['step', 'lineage'], ['step', 'diverge'], ['pass', 'ledger_read_pass'], ['step', 'compare'], ['step', 'fix_mapping'], ['step', 'rerun'], ['step', 'verify'], ['record', 'totals'], ['report']],
});
