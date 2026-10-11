import type { IncidentDef } from './types';

const base = { missionId: 'payments-down', kanbanStatus: 'new' as const };

const list: IncidentDef[] = [
  { ...base, incidentId: 'INC-901', title: 'Payment run PR-1600: what must be paid today', severity: 'Critical', sourceRoom: 'payment_orchestration', affectedRouteIds: ['supplier_payment_release'],
    evidenceIds: ['ev_queue', 'ev_priority'],
    evidenceNotes: { ev_queue: '212 payments (£1,204,500.00) are queued and none has been sent. The primary bank link times out on every attempt.', ev_priority: 'Payroll £290,000 has a legal 16:00 deadline, tax £60,400 and rent £32,000 are also due today. £822,100 of supplier payments can wait. The backup route allows £500,000 a day.' },
    keyObjective: 'Invoke the continuity plan for the critical payments',
    prompt: 'Match each group of payments to why it is (or is not) paid today by the backup route. One card does not belong.',
    puzzleType: 'match',
    puzzlePieces: { type: 'match',
      slots: [{ id: 's_law', label: 'A legal deadline today', detail: 'Missing it breaks the law' }, { id: 's_pen', label: 'A penalty starts if late', detail: 'Costs money by the hour' }, { id: 's_con', label: 'A contract date today', detail: 'Missing it breaches a lease' }, { id: 's_wait', label: 'Can safely wait a day', detail: 'No harm in deferring' }],
      pieces: [
        { id: 'p_pay', label: 'Payroll £290,000.00', detail: 'Due 16:00', shape: 'circle', why: 'Paying staff on time is a legal duty: it goes first.' },
        { id: 'p_tax', label: 'Tax £60,400.00', detail: 'Due today', shape: 'square', why: 'Late tax payments attract penalties.' },
        { id: 'p_rent', label: 'Rent £32,000.00', detail: 'Due today', shape: 'diamond', why: 'The lease sets a payment date today.' },
        { id: 'p_sup', label: 'Supplier batch £822,100.00', detail: 'Terms: 30 days', shape: 'hex', why: 'These suppliers are paid on 30-day terms: a day is harmless, and the backup limit could not take them anyway.' },
        { id: 'p_mkt', label: 'Prepaid marketing campaign £12,000.00', detail: 'Optional', shape: 'triangle', why: 'This is not in today\'s critical list: it is not one of the groups to place.' }] },
    correctMatches: { p_pay: 's_law', p_tax: 's_pen', p_rent: 's_con', p_sup: 's_wait' },
    hintText: ['Ask of each group: what happens if it is a day late?', 'Payroll is a legal duty, tax has penalties and rent has a contract date.', 'The big supplier batch is the one that can wait.'],
    clueOrder: ['ev_queue', 'ev_priority'],
    failureFeedback: { default: 'Think about what goes wrong for each group if it is a day late: the law, a penalty, a contract, or nothing.' },
    successFeedback: 'Critical payments are identified and the continuity plan is invoked: payroll, tax and rent by the backup route, the rest deferred.',
    actions: ['step:strategy'], requiredObjectives: ['p3'] },

  { ...base, incidentId: 'INC-902', title: 'Stop blind retries on the failing route', severity: 'High', sourceRoom: 'payment_orchestration', affectedRouteIds: ['supplier_payment_release'],
    evidenceIds: ['ev_link'],
    evidenceNotes: { ev_link: 'The primary link retries every 30 seconds. When the provider fixes the certificate, a burst of retries could send payments twice. The backup link needs manual dual approval.' },
    keyObjective: 'Hold only the failing route so nothing is sent twice',
    prompt: 'Compare what a safe continuity plan expects with the current state. Mark every line that is missing or out of place, then submit.',
    puzzleType: 'missing',
    puzzlePieces: { type: 'missing', expectedTitle: 'A safe continuity plan expects', currentTitle: 'Current state of payment run PR-1600', items: [
      { id: 'retry', label: 'Automatic retries on the failing route', expected: 'Held, so nothing is sent twice', current: 'Retrying every 30 seconds', problem: 'When the link returns, the queued retries could all send at once and pay people twice. Hold the failing route.', okWhy: '' },
      { id: 'limit', label: 'Backup route limit', expected: 'Critical total fits inside the limit', current: '£382,400 against a £500,000 limit', okWhy: 'The critical payments fit comfortably, so no change is needed here.' },
      { id: 'approval', label: 'Second approver on every batch', expected: 'Dual approval stays on', current: 'Dual approval on', okWhy: 'The control is in place. An emergency is a reason to keep it, not drop it.' },
      { id: 'others', label: 'Other payment routes', expected: 'Unaffected', current: 'Card and agency routes working', okWhy: 'Nothing is wrong with them: holding them would stop valid payments.' }] },
    hintText: ['Read each line: does Current match Expected?', 'One line is about what happens when the link comes back.', 'Retries on the failing route are the problem.'],
    clueOrder: ['ev_link'],
    failureFeedback: { default: 'Compare Expected with Current line by line. Which line could cause a duplicate payment?' },
    successFeedback: 'Only the failing primary route is held. The backup route and every other service keep working.',
    actions: ['contain:hold'], requiredObjectives: ['p4'], containTarget: 'route:supplier_payment_release' },

  { ...base, incidentId: 'INC-903', title: 'Send the critical batch by the backup route', severity: 'High', sourceRoom: 'payment_orchestration', affectedRouteIds: ['supplier_payment_release'],
    evidenceIds: ['ev_priority'],
    evidenceNotes: { ev_priority: 'Critical total £382,400 fits inside the £500,000 backup limit. The deferred £822,100 would not.' },
    keyObjective: 'Release the critical batch after a second approver checks it',
    prompt: 'Drag cables so only the critical batch reaches the backup route. The deferred payments stay held; nothing is sent over the phone.',
    puzzleType: 'cable',
    puzzlePieces: { type: 'cable', ports: [
      { id: 'critical', side: 'source', label: 'Batch CR-1 (critical)', detail: '£382,400.00 · payroll, tax, rent' },
      { id: 'deferred', side: 'source', label: 'Deferred payments', detail: '£822,100.00 · supplier terms' },
      { id: 'backup', side: 'dest', label: 'Backup route PL-B', detail: 'dual approval, then the bank' },
      { id: 'hold', side: 'dest', label: 'Hold until the primary returns', detail: 'verified before release' },
      { id: 'phone', side: 'dest', label: 'Phone the bank', detail: 'skips every control' }] },
    validConnections: [['critical', 'backup'], ['deferred', 'hold']],
    hintText: ['Only the critical items fit the backup limit.', 'Deferred payments wait until the primary route is verified.', 'Reading details over the phone is never an option.'],
    clueOrder: ['ev_priority'],
    failureFeedback: { 'deferred>backup': 'The deferred total is over the backup limit: the bank would reject it.', 'critical>phone': 'Never read payment details over the phone: use the approved route.', default: 'Send only the critical batch by the backup route; hold the rest.' },
    successFeedback: 'Batch CR-1 is approved by a second person and sent by the backup route. The deferred payments are held.',
    actions: ['step:activate', 'step:approve'], requiredObjectives: ['p5'] },
];
export default list;
