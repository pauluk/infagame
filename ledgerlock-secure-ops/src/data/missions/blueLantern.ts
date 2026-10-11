import { goal, makeScenario, st, type ScenarioSpec, type StepSpec } from './scenario';
import { propTarget } from '../targets';
import { BlueLantern, LIMITS, money } from '../../game/systems/BlueLantern';
import { BT, SEAT } from './bronze';
import type { GameState } from '../../game/systems/GameState';

const COMMS = propTarget('secure_ops', 'comms_console');
const PORTAL = propTarget('integration_exchange', 'connection_panel');
const AP = propTarget('finance_core', 'ap');
const TREAS = propTarget('payment_orchestration', 'treasury_ws_a');
const bl = (s: GameState) => BlueLantern.for(s);

const em = (stage: string, role: string, title: string): StepSpec['emergency'] => ({ role, tab: stage, title });
const FAIL_BRIEF = 'Everything in this scenario is fictional and simulated: no real bank, provider, account or secret is involved, and the game never asks for one.';

/**
 * Blue Lantern: the primary payment system is down before a supplier run. A fictional contingency provider (Northstar PayLink)
 * exists under an approved contract, but its connection is not configured. Run the emergency payment continuity process with
 * separated duties, or, when the provider cannot pass governance, hold the line and defer safely.
 */
function build(variant: 'normal' | 'gap'): ScenarioSpec {
  const gap = variant === 'gap';
  const steps: StepSpec[] = [
    { id: 'triage', at: COMMS, tool: 'e', evidence: 'ev_queue', emergency: em('triage', 'secure_ops', 'Triage: what is affected?') },
    { id: 'scope', at: BT, tool: 'e', needs: ['triage'], needsMsg: 'Triage first: assess what is affected and pause the retries.', emergency: em('scope', 'strategic', 'Scope: classify the queue and agree the emergency scope') },
    { id: 'govern', at: SEAT.collections, tool: 'e', needs: ['scope'], needsMsg: 'Agree the scope with Strategic Finance first.', emergency: em('govern', 'strategic', 'Govern: is the provider approved to be used?') },
  ];
  if (!gap) steps.push(
    { id: 'configure', at: PORTAL, tool: 'e', needs: ['govern'], needsMsg: 'Governance must pass before the connection is configured.', emergency: em('configure', 'secure_ops', 'Configure: Emergency Provider Connection') },
    { id: 'prepare', at: AP, tool: 'e', needs: ['configure'], needsMsg: 'The connection must be configured and tested first.', emergency: em('prepare', 'ap', 'Prepare: Accounts Payable batch workbench') },
    { id: 'review', at: TREAS, tool: 'e', needs: ['prepare'], needsMsg: 'Accounts Payable prepares the batch first.', emergency: em('review', 'treasury', 'Dual review: Treasury and the independent approver') },
    { id: 'submit', at: PORTAL, tool: 'e', needs: ['review'], needsMsg: 'The batch must pass dual review first.', emergency: em('submit', 'secure_ops', 'Simulate secure submission') },
    { id: 'reconcile', at: AP, tool: 'e', needs: ['submit'], needsMsg: 'Submit the batch and read the acknowledgements first.', emergency: em('reconcile', 'secure_ops', 'Reconcile acknowledgements, the AP batch, the bank feed and the ledger') },
    { id: 'restore', at: COMMS, tool: 'e', needs: ['reconcile'], needsMsg: 'Finish the reconciliation before restoring the normal route.', emergency: em('restore', 'secure_ops', 'Restore the normal route and stand down') },
  );
  const primary = gap
    ? [
      goal('p1', 'primary', 'Assess what is affected, pause automatic retries and preserve the queue', st('triage'), 'Communications Console in the atrium.'),
      goal('p2', 'primary', 'Classify every queued payment and agree the emergency scope', st('scope'), 'The Bronze Command Table in the BCP Command Centre.'),
      goal('p3', 'primary', 'Find the provider governance gap, escalate it, keep the provider inactive and defer safely', (s) => !!s.flags.bl_deferred, 'Check the provider record at the Collections seat; escalate; defer.'),
    ]
    : [
      goal('p1', 'primary', 'Assess what is affected, pause automatic retries and preserve the queue', st('triage'), 'Communications Console in the atrium.'),
      goal('p2', 'primary', 'Classify every queued payment and agree the emergency scope', st('scope'), 'The Bronze Command Table.'),
      goal('p3', 'primary', 'Pass governance: contract, due diligence and two approvals', st('govern'), 'The Collections seat in the BCP Command Centre.'),
      goal('p4', 'primary', 'Configure the emergency connection, run the handshake and the no-value test', st('configure'), 'External Service Connection Panel.'),
      goal('p5', 'primary', 'Accounts Payable prepares a safe batch; risky items stay in Hold for Review', st('prepare'), 'Accounts Payable desk in Finance Core.'),
      goal('p6', 'primary', 'Treasury and the independent approver review the batch', st('review'), 'Treasury Workstation A.'),
      goal('p7', 'primary', 'Simulate the secure submission and read the acknowledgements', st('submit'), 'External Service Connection Panel.'),
      goal('p8', 'primary', 'Reconcile every item without resending anything uncertain', st('reconcile'), 'Accounts Payable desk.'),
      goal('p9', 'primary', 'Restore the normal route and deactivate the emergency connection', st('restore'), 'Communications Console.'),
    ];
  return {
    id: gap ? 'blue-lantern-gap' : 'blue-lantern', order: gap ? 16 : 15, title: gap ? 'Blue Lantern: The Gap' : 'Blue Lantern', difficulty: gap ? 'Hard' : 'Hard',
    tagline: gap ? 'The contingency provider\'s paperwork has lapsed. Hold the line.' : 'The payment system fails before the supplier run. Use the contingency provider, by the book.',
    theme: 'Emergency payment continuity: separated duties, governed connections, no duplicates.',
    pointsRoom: 'payment_orchestration', incidentRoute: 'supplier_payment_release', clock: ['07:35', '12:00', 'Supplier run 12:00'], parSeconds: gap ? 420 : 1200,
    affectedRooms: ['payment_orchestration', 'finance_core', 'secure_ops', 'integration_exchange'],
    blue: variant,
    alert: { severity: 'Critical', headline: 'Payment Orchestration failed at 07:35, before the supplier payment run', symptoms: ['The primary payment system is down; Accounts Payable, Finance Core and the ledger are up', 'Some queued items are unsent, some may have been sent without an acknowledgement', gap ? 'Northstar PayLink is the contingency provider, but its approval paperwork needs checking' : 'Northstar PayLink (fictional) is under an approved contract, but its connection has never been configured'], impact: 'Suppliers are not paid on time. Resending everything blindly could pay some invoices twice.' },
    briefing: [
      FAIL_BRIEF,
      'The primary payment system failed at 07:35. Strategic Finance is considering a limited emergency run through Northstar PayLink. Do not assume every queued payment is safe to resend.',
      gap ? 'Check the provider\'s record before anything else. If the contract, due diligence or approval is missing or expired, you must not activate it: escalate, keep the queue safe and defer. That is the right answer.' : 'You are the Secure Ops incident lead. You coordinate and record evidence; Strategic Finance sets scope; Accounts Payable prepares; Treasury reviews; an independent approver gives the second approval. No one creates, approves and releases the same payment.',
    ],
    evidence: [{ id: 'ev_queue', name: 'Outbound queue summary (counts only)', sourceRoom: 'secure_ops', requiredPass: 'ops_pass', sensitivity: 'Counts and status only (no payee details)', objective: 'p1', pathStep: 'secure_ops' }],
    evidencePath: ['secure_ops', 'bcp_command', ...(gap ? [] : ['integration_exchange' as const, 'finance_core' as const, 'payment_orchestration' as const])],
    passes: [
      { pass: 'bcp_pass', when: st('triage'), hint: 'Triage first: the Bronze team convenes once the impact is known.' },
      ...(gap ? [] : [
        { pass: 'integration_audit_pass' as const, when: st('govern'), hint: 'Governance must pass before you touch the provider connection.' },
        { pass: 'ledger_read_pass' as const, when: st('configure'), hint: 'Configure and test the connection first; then Accounts Payable prepares the batch.' },
        { pass: 'payment_ops_pass' as const, when: st('prepare'), hint: 'Accounts Payable prepares the batch first; then Treasury reviews it.' },
      ]),
    ],
    required: gap ? ['bcp_pass'] : ['bcp_pass', 'integration_audit_pass', 'ledger_read_pass', 'payment_ops_pass'],
    steps,
    goals: [
      ...primary,
      goal('o1', 'optional', 'No consequence recorded: every control was respected', (s) => bl(s).d.penalties.length === 0),
      goal('o2', 'optional', 'Safe-handling score of at least 90', (s) => bl(s).scoreboard().total >= 90),
      goal('o3', 'optional', 'Record the emergency decision log', (s) => !!s.flags.rec_bl_log),
      goal('s1', 'stretch', 'No hints and no unjustified pass requests', (s) => s.stats.passDenials === 0 && s.stats.hintsUsed === 0),
    ],
    recordables: [{ id: 'bl_log', label: 'Emergency payment decision log: scope, approvals, batch, acknowledgements, reconciliation, deactivation', when: (s) => (gap ? !!s.flags.bl_deferred : !!s.flags.st_restore) }],
    setup: (a) => { a.hit('pay_down', 35); a.routeMark('supplier_payment_release', 'suspicious'); },
    tick: (a) => { if (a.s.flags.st_restore) a.clearHit('pay_down'); },
    incidents: (s) => (s.flags.reported ? 0 : 1),
    narrow: () => 0.9,
    debrief: {
      what: gap
        ? 'Payment Orchestration failed before the supplier run and the contingency provider\'s approval paperwork had lapsed.'
        : 'Payment Orchestration failed before the supplier run. A contingency provider was available under an approved contract, but its connection was never configured.',
      learn: 'Continuity pressure is exactly when controls get skipped. Keep the maker, checker and approver apart, never trust a connection you have not verified against the approved record, never resend what you cannot prove was unsent, and when governance is missing, the safe answer is to hold and escalate.',
      response: (s) => {
        const b = bl(s), sc = b.scoreboard();
        return [
          gap ? (b.d.deferred ? 'You found the governance gap, escalated it, kept the provider inactive and deferred safely.' : 'The governance gap was not resolved.') : (s.flags.st_restore ? 'The emergency run was completed, reconciled and the connection deactivated.' : 'The emergency run was not completed.'),
          `Safe-handling score ${sc.total}/100. ${sc.cats.map((c) => `${c.label} ${c.points}/${c.max}`).join(', ')}.`,
          b.d.penalties.length ? `${b.d.penalties.length} control issue(s): ${b.d.penalties.slice(0, 3).map((p) => p.text).join(' ')}` : 'No control was bypassed.',
          `Limits used: ${money(LIMITS.txn)} per payment, ${money(LIMITS.batch)} per batch, ${LIMITS.hours} hours.`,
        ];
      },
      nextStep: () => 'Rehearse this runbook quarterly, keep provider due diligence in date before you need it, and agree the emergency limits and approvers in peacetime.',
    },
    script: gap
      ? [['step', 'triage'], ['pass', 'bcp_pass'], ['step', 'scope'], ['step', 'govern'], ['record', 'bl_log'], ['report']]
      : [['step', 'triage'], ['pass', 'bcp_pass'], ['step', 'scope'], ['step', 'govern'], ['pass', 'integration_audit_pass'], ['step', 'configure'], ['pass', 'ledger_read_pass'], ['step', 'prepare'], ['pass', 'payment_ops_pass'], ['step', 'review'], ['step', 'submit'], ['step', 'reconcile'], ['step', 'restore'], ['record', 'bl_log'], ['report']],
  };
}
export const blueLantern = makeScenario(build('normal'));
export const blueLanternGap = makeScenario(build('gap'));
export default blueLantern;
