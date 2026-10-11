# Business-continuity missions (9 to 11)

A second track of three missions about keeping the (fictional) service running through a failure or a disaster. They open after the tutorial and follow on in order. All people, payments and systems are synthetic.

| # | Mission | Kind | The situation | What good looks like |
|---|---|---|---|---|
| 9 | **Payments Down** | Business continuity (payments failure) | The primary bank link is down 2 hours before a payroll cutoff, with 212 payments queued. | Assess impact, identify the **critical** payments (payroll, tax, rent), **invoke the continuity plan** (pay them by the backup route, defer the rest), **hold the failing route** so retries cannot duplicate, keep **dual approval** in an emergency, tell people honestly, verify the primary link and reconcile. |
| 10 | **Rising Water** | Disaster recovery (flood in a room) | A burst pipe floods the Event Stream Hall. The room shows rippling water and a warning label until facilities clear it. | **People first** (isolate power, nobody enters), stop writes into the wet hall, check the **RTO** (30 min) and **RPO** (2 min), **fail over** to the Site B replica, prove nothing was lost, update stakeholders, inspect after the all-clear, rebuild the damaged lanes, verify, **fail back**. |
| 11 | **Flood Gates** | Service continuity (flood of requests) | A partner's retry loop floods the API Gateway at 40 times normal traffic. | Find the source, choose a **proportionate** response (limit the one noisy key, reserve a payment lane), tell the partner without sharing raw payloads, verify traffic is normal and prove **no duplicate postings**, then lift the throttle. |

Each mission has a continuity decision with wrong answers that are explained rather than punished, a recordable decision log, optional and stretch goals, and three Incident Board tasks (matching, spotting what is missing, cabling, or choosing proof).

## Code

`src/data/missions/{paymentsDown,risingWater,floodGates}.ts` (declarative scenarios on `makeScenario`), `src/data/incidents/*.ts` (board tasks INC-901..903, INC-1001..1003, INC-1101..1103). The flood is real state: a `flood_<room>` flag drawn by the scene (`drawWater`) and an availability hit that clears when the incident is resolved. Unlocking: `BCP_FIRST` in `src/game/systems/Campaign.ts`.
