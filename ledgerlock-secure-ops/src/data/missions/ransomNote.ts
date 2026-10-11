import { goal, makeScenario, st } from './scenario';
import { propTarget, routeTarget } from '../targets';
import { BT, COMMS_BOARD, SEAT, says } from './bronze';

const RECON = propTarget('debt_recovery', 'recon_console');
const EXPORT = propTarget('debt_recovery', 'export_screen');
const TRANSFER = propTarget('agency_handoff', 'transfer_station');
const BACKUP = propTarget('finance_core', 'recon_screen');
const ROUTE = routeTarget('debt_agency_export');

/** Cyber: ransomware in Debt Recovery. Do not pay: cut the spread, decide at Bronze, restore from the backup and reconcile the gap. */
export default makeScenario({
  id: 'ransom-note', order: 13, title: 'Ransom Note', tagline: 'Debt Recovery\'s files are encrypting and a ransom note has appeared. Run Bronze.', difficulty: 'Hard',
  theme: 'Cyber: ransomware. Do not pay, stop the spread, restore from backup and keep collections working.',
  pointsRoom: 'debt_recovery', incidentRoute: 'debt_agency_export', clock: ['03:10', '07:00', 'Agency file cut-off 07:00'], parSeconds: 660,
  alert: { severity: 'Critical', headline: 'Ransomware: Debt Recovery files are being encrypted and a ransom note has appeared', symptoms: ['The reconciliation console shows a ransom note (synthetic)', 'Files with a new extension are growing every minute', 'The agency export route shares a drive with the encrypted folders'], impact: 'Debt records could be lost and the agency file due at 07:00 could not be sent. The spread could reach the Agency Hand-off.' },
  briefing: ['Everything here is synthetic. Ransomware is encrypting files in Debt Recovery.', 'Stop the spread first, then report to Bronze in the BCP Command Centre, hear from the service managers and decide together. Do not pay: restore from the immutable backup, reconcile the gap, and agree the communications.', 'Paying does not guarantee anything, funds crime and is rarely the right answer.'],
  evidence: [
    { id: 'ev_note', name: 'Ransom note (metadata only)', sourceRoom: 'debt_recovery', requiredPass: 'debt_read_pass', sensitivity: 'Note metadata only: no payment details', objective: 'p1', pathStep: 'debt_recovery' },
    { id: 'ev_spread', name: 'File-change telemetry from the agency link', sourceRoom: 'agency_handoff', requiredPass: 'agency_audit_pass', sensitivity: 'Telemetry only', objective: 'p2', pathStep: 'agency_handoff' },
    { id: 'ev_impact', name: 'Collections manager\'s impact report', sourceRoom: 'bcp_command', requiredPass: 'bcp_pass', sensitivity: 'Summary only', objective: 'p3', pathStep: 'bcp_command' },
    { id: 'ev_backup', name: 'Backup and recovery-point status', sourceRoom: 'finance_core', requiredPass: 'ledger_read_pass', sensitivity: 'Status only', objective: 'p5', pathStep: 'finance_core' },
  ],
  evidencePath: ['debt_recovery', 'agency_handoff', 'bcp_command', 'finance_core'],
  passes: [
    { pass: 'debt_read_pass', when: (s) => !!s.flags.briefed, hint: 'Read the Incident Wall first: it points at Debt Recovery.' },
    { pass: 'agency_audit_pass', when: st('note'), hint: 'Read the ransom note metadata first. The shared drive points at the Agency Hand-off.' },
    { pass: 'bcp_pass', when: st('cut'), hint: 'Stop the spread first, then report to Bronze.' },
    { pass: 'ledger_read_pass', when: st('bronze_open'), hint: 'Report to Bronze first. The decision depends on what backup exists.' },
  ],
  required: ['debt_read_pass', 'agency_audit_pass', 'bcp_pass', 'ledger_read_pass'],
  steps: [
    { id: 'note', at: RECON, tool: 'e', evidence: 'ev_note', status: [[RECON, 'bad']], mark: [['debt_agency_export', 'suspicious']],
      info: { title: 'Debt Reconciliation Console: ransom note', rows: [['Note', 'Demands payment for a key (synthetic)'], ['Encrypted', 'About 38,000 files and growing'], ['First seen', '02:58'], ['Backups touched', 'Not yet known']], body: 'This is ransomware. Do not engage with the note. Stop the spread first.' } },
    { id: 'spread', at: TRANSFER, tool: 'e', needs: ['note'], needsMsg: 'Read the ransom note first.', evidence: 'ev_spread', gain: { audit: 3 },
      info: { title: 'Agency Transfer Station: file-change telemetry', rows: [['Debt Recovery share', 'Encrypting'], ['Agency Hand-off share', 'First changes seen at 03:04'], ['Other services', 'No changes']], body: 'The agency share has started to change: cut the link before it spreads.' } },
    { id: 'cut_check', at: EXPORT, tool: 'scanner', needs: ['cut'], needsMsg: 'Cut the export route first.', gain: { recovery: 3 },
      info: { title: 'Approved Agency Export Screen: after the cut', rows: [['Debt Recovery share', 'Still encrypted (isolated)'], ['Agency Hand-off share', 'No further changes'], ['Spread', 'Stopped']], body: 'The spread has stopped at Debt Recovery.' } },
    { id: 'bronze_open', at: BT, tool: 'e', needs: ['cut_check'], needsMsg: 'Stop the spread before you go to Bronze: it is the most urgent thing.',
      meeting: { title: 'Report to Bronze: ransomware in Debt Recovery', body: 'You are at the Bronze table. Say what is happening, what you have stopped and what you need.',
        attendees: (a) => [
          says('security', 'warn', 'Spread stopped at Debt Recovery. I need a decision on the backup and on the note: no engagement with the criminals.'),
          says('collections', 'bad', 'I have 38,000 records encrypted. I need to keep working: can we use last night\'s export lists?'),
          says('payments', 'ok', 'Payments are unaffected. I will stay on stand-by if the agency file slips.'),
          says('data', 'ok', 'Events and reporting are fine. I can provide read-only receipt data from the stream.')],
        options: [
          { id: 'facts', label: 'Report the spread and the cut, say there will be no contact with the criminals, and ask Bronze to back a restore from the immutable backup', detail: 'Keep collections working from the last export lists meanwhile.', correct: true, backers: ['Elena Novak', 'Priyanka Shah'], gain: { audit: 4, recovery: 2 }, result: 'Bronze agrees: no contact, restore from backup, collections to work from the last export lists.', flags: ['bronze_aligned'] },
          { id: 'pay', label: 'Ask Bronze to approve paying the ransom to get the key quickly', detail: 'Fastest way to get files back.', correct: false, backers: [], gain: { protection: -8, audit: -5 }, result: 'Paying does not guarantee a working key, funds crime and may breach sanctions rules. The backup is the answer.' },
          { id: 'wait', label: 'Say you will report later once you know more', detail: 'Avoids a half-story.', correct: false, backers: [], gain: { audit: -4 }, result: 'Bronze needs the facts now, including what is unknown. Report early.' }] } },
    { id: 'impact', at: SEAT.collections, tool: 'e', needs: ['bronze_open'], needsMsg: 'Report to Bronze first.', evidence: 'ev_impact', gain: { audit: 3 },
      info: { title: 'Priyanka Shah: what collections needs', rows: [['Today', 'Work from last night\'s export lists (read-only copies)'], ['Agency file', 'Due 07:00: the backup should be restored by 06:00'], ['Records at risk', 'Receipts since the backup at 02:10 must be re-keyed from bank files'], ['Customer contact', 'Pause outbound letters until restored']], body: 'There is a manual workaround, and a gap of about an hour to reconcile.' } },
    { id: 'backup', at: BACKUP, tool: 'e', needs: ['bronze_open'], needsMsg: 'Report to Bronze first.', evidence: 'ev_backup', gain: { audit: 3 },
      info: { title: 'Reconciliation Screen: backup status', rows: [['Immutable backup', 'Intact: recovery point 02:10'], ['Online backup', 'Encrypted (not usable)'], ['Gap', 'About 50 minutes of receipts']], body: 'The immutable copy is intact. It is the recovery route.' } },
    { id: 'decision', at: BT, tool: 'e', needs: ['backup', 'impact'], needsMsg: 'Gather the collections impact and the backup status first.',
      meeting: { title: 'Bronze decision: how do we recover?', body: 'The immutable backup is intact (02:10). The agency file is due at 07:00.',
        attendees: () => [
          says('security', 'ok', 'Restore from the immutable backup after we confirm the machines are clean. No contact with the criminals.'),
          says('collections', 'warn', 'I can re-key the gap from bank files. Please do not pay anyone.'),
          says('payments', 'ok', 'If the agency file slips, I can hold payments to it for a day.'),
          says('data', 'ok', 'I can give you the receipts from the stream to speed up the re-keying.')],
        options: [
          { id: 'restore', label: 'Restore from the immutable backup, re-post the 50-minute gap from the stream and bank files, and do not contact the criminals', detail: 'Clean, auditable and under your control.', correct: true, backers: ['Elena Novak', 'Priyanka Shah', 'Tomás Reyes'], gain: { recovery: 8, audit: 4 }, result: 'Agreed and logged: restore, reconcile the gap, no contact.' },
          { id: 'pay', label: 'Pay the ransom and use the key', detail: 'Might be faster.', correct: false, backers: [], gain: { protection: -10, audit: -5 }, result: 'No guarantee, funds crime and may be unlawful. You have a good backup.' },
          { id: 'negotiate', label: 'Open a negotiation with the criminals to buy time', detail: 'Delay while the backup is checked.', correct: false, backers: [], gain: { protection: -5, audit: -3 }, result: 'Any contact encourages them and creates risk. You do not need the time.' }] } },
    { id: 'restore', at: RECON, tool: 'restore', needs: ['decision'], needsMsg: 'Agree the recovery with Bronze first.', gain: { recovery: 8 }, status: [[RECON, 'fixed']], fx: 'repair',
      confirm: { title: 'Restore Debt Recovery from the immutable backup (recovery point 02:10)?', body: 'Wipes the encrypted share and restores it from the clean copy. About 50 minutes of receipts will be missing until they are reconciled.', impacts: [{ label: 'Restores', text: 'All debt records as of 02:10', tone: 'good' }, { label: 'Gap', text: 'Receipts since 02:10 to be re-posted', tone: 'warn' }], confirmLabel: 'Restore from backup' } },
    { id: 'reconcile', at: RECON, tool: 'recon', needs: ['restore'], needsMsg: 'Restore first.', gain: { audit: 4 },
      info: { title: 'Reconciliation: the 50-minute gap', rows: [['Source (stream)', 'Receipt events since 02:10'], ['Source (bank files)', 'Receipts since 02:10']], compare: { before: [['Restored records', 'As of 02:10'], ['Receipts in the gap', '412 events']], after: [['Re-posted', '412 of 412'], ['Differences', 'None']] }, body: 'Every receipt in the gap is back, so debts are correct.' } },
    { id: 'comms', at: COMMS_BOARD, tool: 'e', needs: ['decision'], needsMsg: 'Agree the recovery first.',
      meeting: { title: 'Agree communications', body: 'The regulator, the agency, staff and customers all need to hear something. Decide what, and when.',
        attendees: () => [
          says('security', 'ok', 'Notify the regulator within the required window. Tell the agency only what affects them.'),
          says('collections', 'warn', 'Customers have not been affected, so no mass letter: just pause the outbound ones.'),
          says('payments', 'ok', 'Keep the agency informed that their file may be a day late.'),
          says('data', 'ok', 'I will prepare a short factual timeline.')],
        options: [
          { id: 'targeted', label: 'Notify the regulator on time, tell the agency about the possible delay, brief staff and hold customer letters; no comment on the criminals', detail: 'Factual, timely and proportionate.', correct: true, backers: ['Elena Novak', 'Priyanka Shah'], gain: { audit: 5 }, result: 'Communications agreed and timed.' },
          { id: 'quiet', label: 'Say nothing outside the company until it is over', detail: 'Limits the story.', correct: false, backers: [], gain: { audit: -5 }, result: 'There may be a legal duty to notify the regulator. Silence is a risk.' },
          { id: 'public', label: 'Post a public statement naming the attackers', detail: 'Transparency.', correct: false, backers: [], gain: { audit: -3 }, result: 'It is unconfirmed and gives the criminals attention. Keep to facts.' }] } },
    { id: 'verify', at: EXPORT, tool: 'scanner', needs: ['reconcile'], needsMsg: 'Restore and reconcile first.', gain: { recovery: 4 },
      info: { title: 'Approved Agency Export Screen: after the restore', rows: [['Debt Recovery share', 'Restored, no encrypted files'], ['Malware', 'None found after a full scan'], ['Agency file', 'Ready: sent before 07:00']], body: 'Debt Recovery is clean and the agency file is ready.' } },
  ],
  contain: [{ id: 'cut', target: ROUTE, scope: 'narrow', releaseId: 'resumed', canRelease: (s) => (s.flags.st_verify ? true : 'Verify the restored share is clean before reconnecting the agency link.'),
    cfg: { availability: 4, narrow: 0.9, effective: true, canRelease: (s) => (s.flags.st_verify ? true : 'Verify the restored share is clean before reconnecting the agency link.'), notes: [{ label: 'Stops', text: 'The shared drive between Debt Recovery and the Agency Hand-off.', tone: 'good' }, { label: 'Keeps', text: 'Payments, cards, events and reporting.', tone: 'good' }, { label: 'Delays', text: 'The agency export until Debt Recovery is restored.', tone: 'warn' }] } }],
  goals: [
    goal('p1', 'primary', 'Read the ransom note metadata, without engaging with it', st('note'), 'Press E at the Debt Reconciliation Console.'),
    goal('p2', 'primary', 'Find out whether it is spreading, and stop it', (s) => !!s.flags.st_spread && !!s.flags.st_cut, 'Read the Agency Transfer Station, then quarantine the Debt Agency Export route.'),
    goal('p3', 'primary', 'Report to Bronze and hear from collections', (s) => !!s.flags.st_bronze_open && !!s.flags.st_impact, 'BCP Command Centre: the table, then the collections seat.'),
    goal('p4', 'primary', 'Take the recovery decision together: no payment, no contact', st('decision'), 'Bronze Command Table.'),
    goal('p5', 'primary', 'Check the backup and restore Debt Recovery from it', (s) => !!s.flags.st_backup && !!s.flags.st_restore, 'Reconciliation Screen in Finance Core, then Clean Restore (6) at the console.'),
    goal('p6', 'primary', 'Reconcile the gap since the recovery point', st('reconcile'), 'Reconciliation Wand (7) at the console.'),
    goal('p7', 'primary', 'Agree communications', st('comms'), 'Communications Board.'),
    goal('p8', 'primary', 'Verify it is clean and reconnect the agency link', (s) => !!s.flags.st_verify && !!s.flags.st_resumed, 'Scan the export screen, then release the hold.'),
    goal('o1', 'optional', 'Agency file ready before the 07:00 cut-off', (s) => !!s.flags.st_verify && s.deadlineLeft > 0),
    goal('o2', 'optional', 'Make no wrong calls at Bronze', (s) => (s.data.wrong ?? 0) === 0),
    goal('o3', 'optional', 'Record the Bronze decision log', (s) => !!s.flags.rec_bronze_log),
    goal('s1', 'stretch', 'No unjustified pass requests and no hints', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    goal('s2', 'stretch', 'Finish in under 9 minutes with every measure above 85%', (s) => s.elapsed < 540 && s.integrity >= 85 && s.protection >= 85),
  ],
  recordables: [{ id: 'bronze_log', label: 'Bronze decision log: spread stopped, no payment, restore, gap reconciled, notifications', when: (s) => !!s.flags.st_verify }],
  setup: (a) => { a.hit('ransom', 18); },
  tick: (a) => { const s = a.s; if (s.flags.st_cut && !s.flags.st_calm) { a.flag('st_calm'); a.clearHit('ransom'); a.hit('ransom_isolated', 6); } if (s.flags.st_restore && s.data.__restored !== true) { s.data.__restored = true; a.clearHit('ransom_isolated'); } },
  debrief: { what: 'Ransomware encrypted the Debt Recovery share. The link to the agency was cut before it spread, Bronze decided not to pay, and the share was restored from an immutable backup with the gap reconciled.',
    learn: 'Stop the spread first, never pay or negotiate, restore from an immutable backup, reconcile the gap, notify on time and keep the business working with a manual workaround.',
    nextStep: () => 'Keep immutable backups with tested restores, segment the agency share and rehearse a ransomware tabletop each year.',
    response: (s) => [s.flags.st_cut ? 'You stopped the spread before it reached the agency.' : 'The spread was not stopped.', s.flags.st_decision ? 'Bronze decided not to pay and to restore from backup.' : 'No recovery decision was taken.', s.flags.st_reconcile ? 'You reconciled the gap after the restore.' : 'The gap was not reconciled.', (s.data.wrong ?? 0) === 0 ? 'Every Bronze decision was sound.' : `${s.data.wrong} Bronze decision(s) were pushed back.`] },
  script: [['pass', 'debt_read_pass'], ['step', 'note'], ['pass', 'agency_audit_pass'], ['step', 'spread'], ['contain', 'cut'], ['step', 'cut_check'], ['pass', 'bcp_pass'], ['step', 'bronze_open'], ['step', 'impact'], ['pass', 'ledger_read_pass'], ['step', 'backup'], ['step', 'decision'], ['step', 'restore'], ['step', 'reconcile'], ['step', 'comms'], ['step', 'verify'], ['release', 'cut'], ['record', 'bronze_log'], ['report']],
});
