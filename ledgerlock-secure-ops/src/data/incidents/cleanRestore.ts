import type { IncidentDef } from './types';

const base = { missionId: 'clean-restore', kanbanStatus: 'new' as const };

const list: IncidentDef[] = [
  { ...base, incidentId: 'INC-701', title: 'Choose a verified clean restore point', severity: 'High', sourceRoom: 'finance_core', affectedRouteIds: ['card_receipt'],
    evidenceIds: ['ev_fault'],
    evidenceNotes: { ev_fault: 'Accounts Receivable began drifting at 14:10. The other modules are healthy. Targets: recovery point 5 minutes, back by 14:40.' },
    keyObjective: 'Match each restore point to its timestamp and integrity status',
    prompt: 'The fault began at 14:10 and the recovery point target is 5 minutes. Drag each restore point onto the group it belongs to.',
    puzzleType: 'match',
    puzzlePieces: { type: 'match',
      slots: [{ id: 'clean', label: 'Safe to restore from', detail: 'Before the fault, verified, within the 5 minute target' }, { id: 'after', label: 'After the fault began', detail: 'Could carry the corruption' }, { id: 'old', label: 'Verified but too old', detail: 'Misses the recovery point target' }],
      pieces: [
        { id: 'a', label: '14:07 · checksum VERIFIED', detail: 'expected data loss about 3 minutes', shape: 'circle', why: 'It is before the 14:10 fault, verified, and within the 5 minute target.' },
        { id: 'b', label: '14:11 · checksum NOT verified', detail: 'expected data loss about 1 minute', shape: 'diamond', why: 'It was taken after the fault began and is not verified: it could carry the corruption.' },
        { id: 'c', label: '09:00 · checksum VERIFIED', detail: 'expected data loss about 5 hours', shape: 'square', why: 'It is safe but five hours old: it misses the 5 minute target and loses a lot of data.' },
        { id: 'd', label: '02:00 nightly · checksum VERIFIED', detail: 'expected data loss about 12 hours', shape: 'hex', why: 'It is safe but twelve hours old: far outside the 5 minute target.' },
        { id: 'e', label: 'General Ledger snapshot · 14:00', detail: 'a different module', shape: 'triangle', why: 'That belongs to the General Ledger, which is healthy: only Accounts Receivable is restored.' }] },
    correctMatches: { a: 'clean', b: 'after', c: 'old', d: 'old' },
    hintText: ['The fault began at 14:10. Which points are before it?', 'Of those, which is verified and recent enough for a 5 minute target?', '14:07 is the only verified point inside the target.'],
    clueOrder: ['ev_fault'],
    failureFeedback: { default: 'Compare each point with the 14:10 fault time, its checksum status and the 5 minute target.' },
    successFeedback: 'Restore point 14:07 is chosen and its timestamp and expected data loss (about 3 minutes) are checked.',
    actions: ['step:choose_point', 'step:check_point'], requiredObjectives: ['p1', 'p2'] },

  { ...base, incidentId: 'INC-702', title: 'What is missing from the restore?', severity: 'High', sourceRoom: 'finance_core', affectedRouteIds: ['card_receipt'],
    evidenceIds: ['ev_fault', 'ev_restorepoint'],
    evidenceNotes: { ev_fault: 'Only Accounts Receivable is affected.', ev_restorepoint: 'Point 14:07 is verified, before the fault, and within the recovery point target.' },
    keyObjective: 'Restore in a safe area and validate before reconnecting',
    prompt: 'Compare a safe restore with what is in place now. Mark every step that is missing or out of place.',
    puzzleType: 'missing',
    puzzlePieces: { type: 'missing', expectedTitle: 'A safe restore needs', currentTitle: 'Right now', items: [
      { id: 'iso', label: 'Safe recovery area', expected: 'AR isolated from live receipts', current: 'AR is still connected to live receipts', problem: 'Restoring into a live module could overwrite good postings: isolate only AR first.', okWhy: '' },
      { id: 'point', label: 'Verified restore point', expected: 'Verified, before the fault', current: '14:07, checksum verified', okWhy: 'The restore point is verified: nothing is missing here.' },
      { id: 'check', label: 'Timestamp and data loss checked', expected: 'Checked against the target', current: 'Checked: about 3 minutes', okWhy: 'That check is done.' },
      { id: 'valid', label: 'Restored totals validated before reconnecting', expected: 'Compared with the 14:00 trusted reconciliation', current: 'Not done yet', problem: 'If the module reconnects without checking, drifting totals could return to live service.', okWhy: '' },
      { id: 'others', label: 'Other modules', expected: 'Untouched', current: 'Untouched', okWhy: 'Restoring unrelated modules only adds risk: they are healthy.' }] },
    hintText: ['Read each step: is it in place?', 'Two steps are not: one before the restore, one before reconnecting.', 'The safe recovery area and the totals validation.'],
    clueOrder: ['ev_fault', 'ev_restorepoint'],
    failureFeedback: { default: 'Compare what a safe restore needs with what is in place.' },
    successFeedback: 'AR is isolated in a safe recovery area, restored to 14:07, and the restored totals match the 14:00 trusted reconciliation (£5,412.60).',
    actions: ['contain:isolate', 'step:restore', 'step:compare_totals'], requiredObjectives: ['p3', 'p4'], containTarget: 'prop:finance_core.ar' },

  { ...base, incidentId: 'INC-703', title: 'Put the recovered module back on its approved route', severity: 'Medium', sourceRoom: 'finance_core', affectedRouteIds: ['card_receipt'],
    evidenceIds: ['ev_validation'],
    evidenceNotes: { ev_validation: 'Restored AR totals equal the latest trusted reconciliation, so the module is safe to reconnect.' },
    keyObjective: 'Reconnect the validated module, then confirm service and integrity',
    prompt: 'Only the validated, recovered module may rejoin the route. The corrupted copy must never reconnect.',
    puzzleType: 'cable',
    puzzlePieces: { type: 'cable', ports: [
      { id: 'ar_ok', side: 'source', label: 'Recovered AR module', detail: 'totals match 14:00 · £5,412.60' },
      { id: 'ar_old', side: 'source', label: 'Corrupted AR copy', detail: 'drifting totals' },
      { id: 'card', side: 'dest', label: 'Card Receipt route', detail: 'approved route through Accounts Receivable' },
      { id: 'archive', side: 'dest', label: 'Forensic archive', detail: 'kept for the investigation' },
      { id: 'bacs', side: 'dest', label: 'Supplier Payment Release', detail: 'a different route' }] },
    validConnections: [['ar_ok', 'card'], ['ar_old', 'archive']],
    hintText: ['Which copy has validated totals?', 'AR belongs on the Card Receipt route.', 'Recovered → Card Receipt route. Corrupted copy → Forensic archive.'],
    clueOrder: ['ev_validation'],
    failureFeedback: { 'ar_old>card': 'The corrupted copy must never reconnect: its totals drift.', 'ar_ok>bacs': 'Accounts Receivable belongs on the Card Receipt route, not on supplier payments.', 'ar_ok>archive': 'The recovered module is the one to reconnect, not to archive.', 'ar_old>bacs': 'The corrupted copy must not join any live route.', default: 'Which copy has validated totals, and which route is it approved for?' },
    successFeedback: 'The recovered module is back on the Card Receipt route; availability and integrity are confirmed.',
    actions: ['release:isolate', 'step:confirm'], requiredObjectives: ['p5', 'p6'], routeStateOnSuccess: { routeId: 'card_receipt', state: 'restored' } },
];
export default list;
