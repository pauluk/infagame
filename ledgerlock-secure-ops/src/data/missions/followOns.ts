import { makeScenario } from './scenario';
import { propTarget } from '../targets';

const t = (time: string, text: string, tone: 'info' | 'good' | 'warn' | 'bad' = 'info') => ({ time, text, tone });

export const bacsAfterDark = makeScenario({
  id: 'bacs-after-dark', title: 'BACS After Dark', tagline: 'A staged payment batch changed after it was approved. Find out why before the run.', difficulty: 'Easy',
  pointsRoom: 'bacs_vault', route: 'supplier_payment_release', clock: ['01:30', '04:00', 'Bank submission 04:00'], parSeconds: 420,
  alert: { severity: 'High', headline: 'Staged batch BF-0412 total differs from the approved total', symptoms: ['File checksum no longer matches the approval record', 'Release is paused automatically', 'Other batches are unaffected'], impact: 'If sent unchecked, a supplier could be paid the wrong amount.' },
  briefing: ['Batch BF-0412 (synthetic) changed after approval. The bank submission is at 04:00.', 'Investigate with read-only passes, then hold only what you must and restore the approved version.', 'All suppliers, amounts and files are invented.'],
  r1: { room: 'bacs_vault', pass: 'bacs_audit_pass', scan: propTarget('bacs_vault', 'staging_cabinet'), scanText: 'The staging cabinet reports a checksum mismatch for BF-0412.', evidenceProp: propTarget('bacs_vault', 'file_terminal'),
    evidence: { id: 'ev_bf_meta', name: 'File metadata BF-0412', sensitivity: 'File metadata only (no payee details)', objective: 'o_e1', pathStep: 'bacs_vault' },
    evidenceRows: [['Approved total', '£164,250.00'], ['Staged total', '£184,250.00'], ['Difference', '+£20,000.00 on one line'], ['Last modified', '01:47 by svc-tidy']], evidenceBody: 'The file was edited at 01:47, after approval, by a maintenance service account. The payment orchestration side should show why.' },
  r2: { room: 'payment_orchestration', pass: 'payment_ops_pass', evidenceProp: propTarget('payment_orchestration', 'release_controls'),
    evidence: { id: 'ev_release_hash', name: 'Release control hash check', sensitivity: 'Batch metadata only', objective: 'o_e2', pathStep: 'payment_orchestration' },
    evidenceRows: [['Approved hash', 'a41f… (approval 22:10)'], ['Staged hash', '9c07… (mismatch)'], ['Cause', 'Tidy-up job edited a staged line'], ['Release', 'Blocked pending review']], evidenceBody: 'A scheduled tidy-up job with too much write access altered a staged line. It looks like a misconfigured job, not an attack.' },
  lens: { steps: [t('22:10', 'Batch BF-0412 approved and staged.', 'good'), t('01:47', 'Scheduled job "batch-tidy" runs with write access to staged files.', 'warn'), t('01:47', 'One line amount is edited. No outside connection, no unusual login.', 'bad'), t('01:48', 'Checksum mismatch pauses release automatically.', 'info')], conclusion: 'A misconfigured maintenance job changed a staged line. Hold only this batch, restore the approved file, and tighten the job.' },
  responseProp: propTarget('payment_orchestration', 'release_controls'),
  responses: [
    { id: 'hold_restore', label: 'Hold batch BF-0412 and restore the approved file from its checkpoint', detail: 'Only this batch waits; others release on time.', narrow: 1, correct: true, result: 'BF-0412 was restored from the approved checkpoint and re-hashed. The maintenance job lost write access. Other batches were not delayed.' },
    { id: 'stop_run', label: 'Stop the whole payment run', detail: 'Safe, but every batch waits.', narrow: 0.3, correct: true, availabilityHit: 25, hitSeconds: 60, result: 'The whole run was paused, then the batch restored and the run resumed. Safe, but every batch was delayed.' },
    { id: 'release_anyway', label: 'Release it: the approval was valid yesterday', detail: 'Skips the mismatch.', narrow: 0, correct: false, integrity: -12, result: 'The checksum rule would block this: an altered file must never be released. Try again.' },
  ],
  outline: { objective: 'Find out why a staged payment batch changed after approval, and release only a verified file.', clues: ['Checksum mismatch on BF-0412', 'Edited at 01:47 by a maintenance service account', 'Release controls hold the batch'], choices: ['Hold only that batch and restore the approved file (narrowest)', 'Stop the whole payment run', 'Release anyway (unsafe)'], success: 'Verified file hash matches approval, other batches released on time.', debrief: 'A misconfigured job changed a staged line; narrow containment kept the run on schedule.' },
  debrief: { what: 'A scheduled tidy-up job with too much write access edited a staged payment line after approval. Release controls caught the checksum mismatch.', learn: 'Approvals should be bound to a hash. Hold only the changed batch, restore from the approved checkpoint, and reduce the job’s privileges.' },
});

export const collectionConnection = makeScenario({
  id: 'collection-connection', title: 'The Collection Connection', tagline: 'An agency export contains a record that looks wrong. Hold only what you must.', difficulty: 'Easy',
  pointsRoom: 'agency_handoff', route: 'debt_agency_export', clock: ['09:00', '11:00', 'Agency file 11:00'], parSeconds: 420,
  alert: { severity: 'Medium', headline: 'Agency export record DR-••31 has a negative amount and no approval', symptoms: ['Delivery receipt shows 1 record rejected', 'The record is marked "approved" but has no approver', 'Other records look fine'], impact: 'A wrong record could contact someone about a debt they do not owe.' },
  briefing: ['Debt record DR-••31 (synthetic) appears in the agency hand-off with a negative amount.', 'Find where the bad value came from and hold only that record.', 'No real debts or people are involved.'],
  r1: { room: 'agency_handoff', pass: 'agency_audit_pass', scan: propTarget('agency_handoff', 'transfer_station'), scanText: 'The transfer station flags one record with a negative amount.', evidenceProp: propTarget('agency_handoff', 'receipt_monitor'),
    evidence: { id: 'ev_manifest', name: 'Transfer manifest and delivery receipt', sensitivity: 'Masked manifest (synthetic)', objective: 'o_e1', pathStep: 'agency_handoff' },
    evidenceRows: [['Records sent', '41'], ['Records rejected by agency', '1 (DR-••31)'], ['Amount on record', '−£312.00 (negative)'], ['Approval', 'missing']], evidenceBody: 'One record has a negative amount and no approval. The export screen in Debt Recovery shows how it was built.' },
  r2: { room: 'debt_recovery', pass: 'debt_read_pass', evidenceProp: propTarget('debt_recovery', 'export_screen'),
    evidence: { id: 'ev_export_map', name: 'Approved export screen', sensitivity: 'Masked debt data', objective: 'o_e2', pathStep: 'debt_recovery' },
    evidenceRows: [['Export mapping', 'v2.3 (changed yesterday)'], ['Sign of credit notes', 'Not flipped (bug)'], ['Approval flag', 'Defaulted to "approved"']], evidenceBody: 'A mapping change did not flip the sign of a credit note and defaulted the approval flag. A software fault.' },
  lens: { steps: [t('Yesterday', 'Export mapping v2.3 deployed.', 'info'), t('08:40', 'A credit note is exported without flipping its sign.', 'warn'), t('08:40', 'Approval flag defaults to "approved".', 'bad'), t('08:55', 'Agency rejects one record.', 'info')], conclusion: 'Mapping bug in the export, not a malicious change. Hold the one record, fix the mapping, re-export.' },
  responseProp: propTarget('debt_recovery', 'export_screen'),
  responses: [
    { id: 'hold_record', label: 'Hold record DR-••31, fix the mapping and re-export only that record', detail: 'All other records stay delivered.', narrow: 1, correct: true, result: 'The record was held, the mapping fixed and the corrected record sent after approval. The other 40 stayed delivered.' },
    { id: 'pause_export', label: 'Pause the whole agency export', detail: 'Safe but delays all records.', narrow: 0.4, correct: true, availabilityHit: 12, hitSeconds: 60, result: 'The export was paused, fixed and resumed. Safe, but every record waited.' },
    { id: 'send_recall', label: 'Leave it and ask the agency to ignore it', detail: 'Hopes for the best.', narrow: 0, correct: false, integrity: -8, result: 'An unapproved record must not leave the building. Try a safer option.' },
  ],
  outline: { objective: 'Find out why an agency export has a suspicious record and fix it without stopping valid exports.', clues: ['Negative amount on one record', 'No approver recorded', 'Export mapping v2.3 changed yesterday'], choices: ['Hold only that record and fix the mapping (narrowest)', 'Pause the whole export', 'Ask the agency to ignore it (unsafe)'], success: 'Corrected record approved and delivered; other records unaffected.', debrief: 'A mapping bug flipped the wrong sign; hold one record, not the whole export.' },
  debrief: { what: 'An export mapping change failed to flip the sign of a credit note and defaulted the approval flag.', learn: 'Controlled hand-offs need an explicit approval, not a default. Hold the single bad record and fix the mapping.' },
});

export const eventStreamTide = makeScenario({
  id: 'event-stream-tide', title: 'Event Stream Tide', tagline: 'A backlog is building. Keep reporting on time without losing data.', difficulty: 'Medium',
  pointsRoom: 'event_stream', route: 'finance_event_mirror', clock: ['08:00', '09:00', 'Morning report 09:00'], parSeconds: 480, freshnessEffect: 'mirrorStuck',
  alert: { severity: 'Medium', headline: 'Event backlog is growing: reporting freshness is rising', symptoms: ['Queue depth 18,400 and climbing', 'Fabric freshness rising', 'No events lost yet'], impact: 'If it continues, the 09:00 finance report will be stale.' },
  briefing: ['Events are arriving faster than they are being consumed. Glitch wisps are piling up in the Event Stream Hall.', 'Find the slow consumer, keep valid events moving and do not lose any.', 'All volumes are synthetic.'],
  r1: { room: 'event_stream', pass: 'event_trace_pass', scan: propTarget('event_stream', 'queue_monitor'), scanText: 'Queue monitor: one consumer lane is far behind the others.', evidenceProp: propTarget('event_stream', 'replay_console'),
    evidence: { id: 'ev_queue_trace', name: 'Queue and consumer trace', sensitivity: 'Event metadata only', objective: 'o_e1', pathStep: 'event_stream' },
    evidenceRows: [['Queue depth', '18,400 and rising'], ['Slow consumer', 'analytics-writer'], ['Stuck message', 'one oversized event retried'], ['Other consumers', 'healthy']], evidenceBody: 'One oversized event keeps failing in the analytics writer and blocks its lane. Check what that does to reporting in Fabric.' },
  r2: { room: 'fabric_platform', pass: 'fabric_observer_pass', evidenceProp: propTarget('fabric_platform', 'pipeline_display'),
    evidence: { id: 'ev_bronze_lag', name: 'Bronze lag', sensitivity: 'Synthetic pipeline status', objective: 'o_e2', pathStep: 'fabric_platform' },
    evidenceRows: [['Bronze freshness', '22 min (should be ~2)'], ['Silver / Gold', 'waiting on Bronze'], ['Dashboard', 'Stale']], evidenceBody: 'Reporting is waiting on the blocked lane. Reroute and fix just that consumer.' },
  lens: { steps: [t('07:41', 'An oversized event arrives.', 'info'), t('07:41', 'analytics-writer rejects it and retries forever.', 'warn'), t('07:50', 'Its lane stops draining; queue depth climbs.', 'bad'), t('07:55', 'Bronze freshness starts rising.', 'warn')], conclusion: 'A poison message blocks one consumer lane. Divert that lane, dead-letter the message, and let the backlog drain.' },
  responseProp: propTarget('event_stream', 'replay_buffer'),
  responses: [
    { id: 'reroute_dlq', label: 'Reroute the blocked lane to a standby consumer and dead-letter the stuck message', detail: 'Everything else keeps flowing; nothing is lost.', narrow: 1, correct: true, result: 'The blocked lane was rerouted, the oversized event parked for review, and the backlog is draining. Nothing was lost.' },
    { id: 'purge_queue', label: 'Purge the whole queue', detail: 'Clears the backlog by deleting it.', narrow: 0, correct: false, integrity: -25, result: 'Purging would delete valid events. Try again.' },
    { id: 'pause_all', label: 'Pause every consumer and drain slowly', detail: 'Safe but slow.', narrow: 0.35, correct: true, availabilityHit: 15, hitSeconds: 60, result: 'Everything was paused and drained one lane at a time. Safe, but reporting stayed late.' },
  ],
  outline: { objective: 'Stop a growing event backlog from making finance reporting stale, without losing events.', clues: ['Queue depth rising', 'One consumer lane stuck on an oversized event', 'Fabric Bronze freshness rising'], choices: ['Reroute the lane and dead-letter the message (narrowest)', 'Pause every consumer', 'Purge the queue (unsafe)'], success: 'Backlog drains, Bronze freshness under 5 minutes, no events lost.', debrief: 'One poison message blocked one lane; rerouting fixed it without data loss.' },
  debrief: { what: 'An oversized event made one consumer retry forever, blocking its lane and backing up reporting.', learn: 'Use dead-letter queues for poison messages, and reroute the blocked lane instead of purging data.' },
});

export const fabricMirror = makeScenario({
  id: 'fabric-mirror', title: 'The Fabric Mirror', tagline: 'Bronze looks fresh but Silver and Gold are stale. Fix the right layer.', difficulty: 'Medium',
  pointsRoom: 'fabric_platform', route: 'finance_event_mirror', clock: ['07:30', '08:30', 'Dashboard refresh 08:30'], parSeconds: 480, freshnessEffect: 'silverLag',
  alert: { severity: 'Medium', headline: 'Dashboard numbers stopped moving: Silver and Gold are stale', symptoms: ['Bronze event counts look normal', 'Silver refresh last succeeded 47 minutes ago', 'Dashboard totals are behind the ledger'], impact: 'Leaders could make decisions on out-of-date numbers.' },
  briefing: ['Raw events keep arriving in Bronze, but the cleaned Silver layer and the Gold reporting tables are stale.', 'Find which layer broke, fix just that layer and verify the dashboard matches the ledger.', 'All pipelines and numbers are synthetic demo data.'],
  r1: { room: 'fabric_platform', pass: 'fabric_observer_pass', scan: propTarget('fabric_platform', 'silver'), scanText: 'The Silver station shows a failed refresh; Bronze is healthy.', evidenceProp: propTarget('fabric_platform', 'pipeline_display'),
    evidence: { id: 'ev_layer_status', name: 'Layer status', sensitivity: 'Synthetic pipeline status', objective: 'o_e1', pathStep: 'fabric_platform' },
    evidenceRows: [['Bronze', 'Fresh (1.4 min)'], ['Silver', 'Stale (47 min), last run failed'], ['Gold', 'Stale (waiting on Silver)'], ['Failure', 'Schema mismatch: new column']], evidenceBody: 'Silver failed on a schema mismatch. The event stream shows where the new field came from.' },
  r2: { room: 'event_stream', pass: 'event_trace_pass', evidenceProp: propTarget('event_stream', 'replay_console'),
    evidence: { id: 'ev_schema_event', name: 'Event schema trace', sensitivity: 'Event metadata only', objective: 'o_e2', pathStep: 'event_stream' },
    evidenceRows: [['New field', 'receipt_channel (added yesterday)'], ['Producer', 'Card Payments notifier'], ['Consumer', 'Silver refresh (mapping not updated)']], evidenceBody: 'A producer added a field that the Silver mapping did not expect. A software fault, not corruption.' },
  lens: { steps: [t('Yesterday', 'Card events gain a new field: receipt_channel.', 'info'), t('06:40', 'Silver refresh fails on the unexpected column.', 'bad'), t('06:45', 'Gold waits on Silver.', 'warn'), t('07:20', 'Dashboard stops updating.', 'warn')], conclusion: 'Schema drift broke Silver. Update the mapping and re-run Silver; Bronze needs no change.' },
  responseProp: propTarget('fabric_platform', 'silver'),
  responses: [
    { id: 'patch_silver', label: 'Update the Silver mapping and re-run Silver only', detail: 'Gold refreshes automatically afterwards.', narrow: 1, correct: true, result: 'The Silver mapping now accepts the new field and Silver was re-run. Gold refreshed after it. Bronze was untouched.' },
    { id: 'rebuild_all', label: 'Rebuild Bronze, Silver and Gold from scratch', detail: 'Works, but reporting is down while it runs.', narrow: 0.3, correct: true, availabilityHit: 14, hitSeconds: 60, result: 'Everything was rebuilt. It worked, but reporting was down for the rebuild.' },
    { id: 'drop_field', label: 'Ask producers to remove the new field', detail: 'Slow and breaks other consumers.', narrow: 0.1, correct: false, integrity: -6, result: 'That blocks other consumers who need the field. Fix the Silver mapping instead.' },
  ],
  outline: { objective: 'Find out why Silver and Gold are stale while Bronze is fresh, and fix only the broken layer.', clues: ['Bronze healthy, Silver failed', 'Schema mismatch on a new field', 'Gold waiting on Silver'], choices: ['Update the Silver mapping and re-run Silver (narrowest)', 'Rebuild every layer', 'Ask producers to remove the field'], success: 'Silver and Gold are fresh and the dashboard matches the ledger.', debrief: 'Schema drift broke one layer; fix that layer.' },
  debrief: { what: 'A new field in the card events made the Silver refresh fail on a schema mismatch, leaving Gold and the dashboard stale.', learn: 'Handle schema drift where it breaks. Verify freshness and totals after the fix.' },
});
