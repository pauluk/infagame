# Blue Lantern: Emergency Payment Continuity

Missions 15 (**Blue Lantern**) and 16 (**Blue Lantern: The Gap**). Everything is fictional and simulated: the provider (Northstar PayLink), suppliers, accounts and payments are synthetic, the connection and submission are mock, and the game never asks for a password, key, certificate, bank detail or any other secret.

## The incident

Payment Orchestration fails at 07:35, before a supplier run. Accounts Payable, Finance Core and the ledger stay up. Some queued items are unsent, some were sent without an acknowledgement. Strategic Finance is considering a limited emergency run through the contingency provider, whose contract is approved but whose connection was never configured.

## Roles (maker, checker, approver kept apart)

| Person | Role | Does | Never |
|---|---|---|---|
| You | Secure Ops incident lead | Coordinates, records evidence, verifies the connection against the approved record, monitors the route, submits | Approves or prepares |
| Hannah Cole | Strategic Finance | Priorities, scope, duration, exposure limit | Prepares or releases payments |
| Dana Whitfield | Accounts Payable | Checks invoices, prepares the batch | Checks her own batch |
| Rohan Mehta | Treasury | Source account, funds, total vs limit, independent release review | Prepares the batch |
| Imani Clarke | Independent approver | Second approval over the threshold, supplier verification | Approves a request they made |

The "Who is doing this?" selector lets you ask the wrong person on purpose: the rules refuse, explain why, and approvals attempted at the wrong desk cost points.

## The board (open it with the Board button, or at any desk)

Pipeline cards: Triage, Scope, Govern, Configure, Prepare, Dual Review, Simulate Submission, Reconcile, Restore. Each card opens to show owner, evidence, status, dependencies and the decision history. Desks: Communications Console (triage, restore), Bronze table (scope), Collections seat (govern), Connection Panel (configure, submit), AP desk (prepare, reconcile), Treasury Workstation A (review). Affected rooms are marked ✖ on the map: Payment Orchestration (Treasury bays), Finance Core (AP), Secure Ops, Integration Exchange. Secure Ops reaches the AP and Treasury work areas through the concourses.

## Rules (each has a unit test in `tests/logic.test.ts`)

1. The route cannot be configured before governance passes, the handshake needs every connection item reviewed, and the no-value test needs the handshake. It is only active during the approved window and returns to inactive by itself.
2. Each person may do only their own job; wrong-desk approvals are penalised; Treasury cannot sign a rushed review.
3. The Payroll-only account can never be the source for supplier payments.
4. Changed-supplier, unknown-status, duplicate and over-limit invoices cannot enter the batch without the named resolution.
5. Pending and Unknown are never auto-resent; processed needs the AP and batch reference, provider acknowledgement, bank debit and ledger status; the normal route is not restored before reconciliation.
6. If the provider fails governance (Blue Lantern: The Gap), the correct outcome is: escalate, keep it inactive, preserve the queue, defer. It scores full marks for connection governance.
7. Consequences are visible: rushed approval, unverified endpoint, wrong account, duplicate resend and an unresolved Unknown each cost points with a plain-language explanation.

## Scoring

Safe prioritisation 20, approval separation 20, connection governance 20, duplicate prevention 15, accurate reconciliation 15, audit trail 10. The audit tab shows each measure, every penalty and the full audit trail.

## Code map

* `src/game/systems/BlueLantern.ts`: the rule engine (no DOM), `solve(stage)` is the best path used by Auto, teammates and the tests.
* `src/data/missions/blueLantern.ts`: the two missions (steps open the emergency board through `StepSpec.emergency`).
* `src/ui/blueLantern.ts`: the board (pipeline, workbench with drag and a menu alternative, connection panel, treasury accounts, reconciliation, restore, audit).
