# Blue Lantern: Emergency Payment Continuity (implementation plan)

Status: **designed, not yet built.** This plan maps the brief onto the existing engine so it can be built and tested in one pass. Everything is synthetic and simulated: no real banks, providers, credentials or data.

## Fit with the engine

| Brief | Existing piece to reuse | New work |
|---|---|---|
| Playable incident, 07:35 start | `makeScenario` (`src/data/missions/scenario.ts`), `MISSIONS` index, Campaign unlock (open after the tutorial, like the BCP and cyber tracks) | `src/data/missions/blueLantern.ts`, order 15 |
| Assess impact, pause retries, preserve queue | Steps + `contain` (hold the `supplier_payment_release` route, narrow) | queue summary evidence, "retries paused" flag |
| Classify items (unsent, sent, rejected, duplicate, unknown) | Incident Board puzzle types (`match`) | `INC` cards plus the workbench below |
| Governance gate (contract, due diligence, approval) | Pass grants and `confirm` steps | `ProviderRecord` data with a blocking state; escalate-and-hold path scores as correct |
| Emergency Provider Connection panel | `src/ui/` panels (`accessReview.ts` pattern), `openPanel` | new panel `providerConnection.ts` and engine `EmergencyRoute.ts` |
| Manual payment workbench | `dragkit.ts` (drag with keyboard and tap equivalents), `incidentBoard.ts` lanes | new view `paymentWorkbench.ts` |
| Dual review (AP prepares, Treasury checks, independent approver) | Access Review separation-of-duties rules (`catalog.ts` style) | maker, checker and approver identities; a requester can never approve their own batch |
| Reconciliation board | Incident Board `verify` puzzle, `recon` tool | `reconciliation` view with four-way match per item |
| Board columns Triage, Scope, Govern, Configure, Prepare, Dual Review, Simulate Submission, Reconcile, Restore | `KANBAN` in `src/data/incidents/types.ts` (currently 7 columns) | make columns per-incident-set (a `board` field on the mission) so existing missions are unchanged |
| Rooms marked on the map | Fog, incident markers, `Facility` map | affected-room list on the mission; route Secure Ops to AP and Treasury already exists through concourses (keep Payment Orchestration out of the path; a test asserts it) |
| Treasury panel with account cards | none | two masked account cards: Emergency Operations (eligible), Payroll-only (excluded) |

## Rooms and teams

Affected rooms: `payment_orchestration`, `finance_core` (Accounts Payable workstation), `payment_orchestration` Treasury bays, `secure_ops`, `integration_exchange`. Roles on the board: Secure Ops incident lead, Strategic Finance (priorities, scope, duration, exposure limit; never prepares or releases), Accounts Payable (maker), Treasury (checker and release reviewer), Independent approver.

## Data model (new, synthetic)

* `ProviderRecord` for the fictional "Northstar PayLink": contract status, due diligence, approval, verified endpoint label, permitted payment types, data scope, batch and transaction limits, service owner, approvers, start and expiry. States: `valid` or `missing/expired` (the blocked variant is selectable by the scenario seed and is tested).
* `PaymentItem`: invoice A to E exactly as the brief's table, plus status (`unsent | sent | rejected | duplicate | unknown`), supplier-change flag, value.
* `EmergencyRoute`: `inactive | configured | tested | active | expired`, time-limited, auto-returns to inactive; every transition writes to the audit trail.
* `Batch`: maker, checker, approvers, source account, provider, reference, totals, held items.

## Rules to enforce (each gets a unit test)

1. The route cannot be activated unless the provider record is valid, every connection-panel item is reviewed, and the handshake and the no-value test have passed.
2. Maker, checker and releaser are three different people; a requester cannot approve their own request or batch.
3. Payroll-only account can never be selected for supplier payments (blocked with a plain-language reason).
4. Items with changed supplier details, unknown status, duplicates or over-limit values can never enter the batch without the named resolution (independent verification, reconciliation, removal, extra approval).
5. Pending or Unknown acknowledgements are never auto-resent; accepted items become processed only with all four evidence points (AP and batch reference, provider acknowledgement, bank-feed debit, ledger status).
6. If the provider cannot pass governance, the correct outcome is: keep it inactive, preserve the queue, escalate, defer or use only an approved route. This scores full marks.
7. Consequences are visible in the simulation: rushed approval, unverified provider, wrong source account, duplicate resend and unresolved Unknown each apply a named availability, integrity, protection or audit hit with a plain explanation.

## Scoring

Safe prioritisation, approval separation, connection governance, duplicate prevention, accurate reconciliation and audit trail (each with visible penalties, in the style of the Access Review score).

## Build order

1. Data and engine (`ProviderRecord`, `PaymentItem`, `EmergencyRoute`, `Batch`) with unit tests.
2. Mission scenario and board columns; scripted and auto-team playthrough tests (the same harness as the other missions).
3. Panels: Emergency Provider Connection, Treasury account cards, workbench, reconciliation board.
4. Map markers and the route test; docs; end-to-end test; push.

## Blocker at the time of writing

The session's shell was blocked by an automatic safety check, so none of the above could be compiled or tested. It should be built in a session where the shell works.
