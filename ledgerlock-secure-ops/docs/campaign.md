# Campaign, objectives, Service Confidence and badges

**Campaign goal:** protect the fictional finance service while keeping valid payments, debt receipts and reporting accurate and available. Success is measured by safe outcomes and clear evidence, never by how fast you click: time is only 10 of 100 score points, and a slow but safe, verified result is always a positive result.

## Objectives

Every mission has **primary** objectives (required), **optional** objectives (reward careful, skilled play) and **stretch** objectives (replay value). Optional and stretch objectives never block progress. Wrong choices are recoverable (you are told why and can try again), and the mission can always be finished. The *Goals* button (or <kbd>G</kbd>) lists them with live status; the debrief reports them.

## Service Confidence (five measures)

| Measure | What it represents | Moves when |
|---|---|---|
| Transaction integrity | Correct totals, no duplicate or missing simulated transactions | duplicates post (down), reconciliation reverses them (up), purging valid data (down) |
| Service availability | Keeping legitimate finance services running | containments and broad shutdowns (down, only while active) |
| Data protection | Masked data and only the access needed | passes beyond what the mission needs (down), unmasked views (down), revoking unused access (up) |
| Recovery readiness | Safe restore, rollback and recovery verification | verified restores and clean-ups (up), restoring unrelated systems (down) |
| Audit quality | Clear evidence, recorded actions and a verified outcome | evidence retrieved, results recorded, verification (up), unjustified pass requests and rubber-stamped approvals (down) |

The overall figure is `0.6 x mean + 0.4 x weakest measure`, so a high score needs balance: shutting everything down protects integrity but costs availability, and releasing everything unchecked keeps services up but costs integrity (both are covered by tests). It is shown on the **Control Room wall** (a panel above the Incident Wall in Secure Operations Atrium), in the *Confidence* dialog, in the incident alert, on the mission select screen and in every debrief (campaign before -> after, plus that mission's own result). Campaign measures move 60% towards each completed mission's result.

## Missions

| # | Mission | Theme | Primary objectives (summary) |
|---|---|---|---|
| 1 | The Duplicate Ghost (tutorial) | Transaction integrity | find the repeated receipt, trace it through the Event Stream Hall, contain only the replaying route, apply the fix, reconcile Finance Core, verify Fabric freshness |
| 2 | BACS After Dark | Payment integrity | inspect batch and manifest, compare with the approved Finance Core total, quarantine the batch, create a clean replacement, dual approval, bank acknowledgement and reconciliation |
| 3 | The Collection Connection | Responsible data sharing | inspect export scope, confirm the fictional approved agency, remove unnecessary fields, hold then send the corrected file, reconcile the agency receipt |
| 4 | Event Stream Tide | Service continuity | find the delayed point, separate delayed from duplicate events, add capacity or reroute, preserve valid events and reach a safe queue level, compare final counts with the source modules |
| 5 | The Fabric Mirror | Reporting accuracy | follow lineage, find where totals diverge, compare with the Finance Core summary, correct the mapping, rerun only the affected stage, verify Gold and the dashboard |
| 6 | Token on the Table | Controlled recovery | locate the service and dependencies, request a time-limited rotation pass, rotate at the Access Desk, update the dependent connection, test the gateway and route, prove the old token is rejected |
| 7 | The Clean Restore | Recovery readiness | choose a verified clean restore point, check its timestamp and expected data loss, restore in a safe recovery area, compare with the trusted reconciliation, reconnect, confirm |
| 8 | The Root of the Ripple (finale) | Systems thinking | review the Evidence Board, find the common cause (shared template CH-204), inspect the API, event and finance modules, contain the shared route, approved change, test five services, final reconciliation |

Missions unlock in order; the **Operations Floor** side-task hub unlocks with the tutorial. Mission select has *Unlock all missions* (for testers/reviewers) and *Reset campaign progress*. The tutorial has a bespoke simulation; missions 2-8 and the hub run on a declarative scenario engine (`src/data/missions/scenario.ts`): steps bound to a target and a tool, evidence, choices with consequences, containments and timed hooks. Each mission's scripted best-practice path is executed by the test-suite, which asserts the primary goals complete and the report can be filed, and that skipping primary objectives cannot complete a mission.

## Side objectives (Operations Floor, free roam, all optional)

Review an expiring access pass and revoke it (Access Desk) - find a mislabelled integration and update the inventory - test that a clean backup is available (dry-run restore) - check an alert is routed to the correct operations room - verify an event has a source, timestamp and owner - close a stale incident log entry after confirming its resolution. Revoking passes also works in every mission (it raises Data protection).

## Badges

| Badge | Awarded when |
|---|---|
| Precision Over Panic | every containment you used was the narrowest (route or component), with no unneeded containments |
| Least Privilege | the passes you held were all ones the mission needed, with at most one denied request |
| No Lost Events | a backlog was resolved without purging valid events |
| Ledger Listener | all required reconciliations were completed before closing the incident |
| Clean Restore | the restore point was checked before restoring |
| Good Evidence | all evidence collected, audit quality at least 80%, report filed |

## Debrief and replay

Every debrief shows: primary status, optional and stretch results, badges (new ones marked), evidence collected with room, pass and sensitivity, Service Confidence before -> after, routes and services affected by your actions, what happened, your response, the safest next step and what to take away. Completed missions can be replayed to improve optional/stretch goals and badges (best score and best goals are kept).

## Storage

Campaign progress (mission results, goals, badges, side tasks and running measures) is kept in the browser's `localStorage` under `ledgerlock.campaign.v1`. It holds only mission ids, goal ids, evidence ids and numbers. No finance data, credentials or personal data exist in the game, and none are stored.
