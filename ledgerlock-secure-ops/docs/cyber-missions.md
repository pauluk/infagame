# Cyber missions (12 to 14) and the BCP Command Centre

Three cyber incidents that open after the tutorial. Everything is synthetic (people, hosts, addresses, ransom notes), nothing real is contacted and no real malware exists.

| # | Mission | Kind | Good response |
|---|---|---|---|
| 12 | **Quiet Malware** | Malware beaconing from an Accounts Payable workstation | Report facts (not guesses) to Bronze, isolate only AP-07, block the beacon address, decide recovery together, rebuild the host **and** reset the exposed credentials, agree communications, stand down with a lessons-learned review. |
| 13 | **Ransom Note** | Ransomware in Debt Recovery | Stop the spread to the agency first, never pay or negotiate, restore from the immutable backup, reconcile the 50-minute gap, notify on time, keep collections working from the last export lists. |
| 14 | **Worm in the Wires** | A self-spreading virus from an email attachment | Isolate the infected segment, find the entry point, close the filter gap, reimage only infected hosts, protect the payroll file with a clean-laptop plan, tell staff what to do rather than who to blame. |

## BCP Command Centre (Bronze)

Room `bcp_command` (F1, its own wing), reached from the West Concourse side; it needs the **BCP Command Pass**. It holds a situation wall, a communications board, the **Bronze Command Table** and a seat for each fictional service manager: Amara Okoye (Payments), Tomás Reyes (Data & Analytics), Priyanka Shah (Collections) and Elena Novak (Information Security).

In each cyber mission the manager goes there to:

* **Report and update** at the Bronze table: a meeting popup shows each service manager's live status and what they say, then the team decides. Every option shows who backs it; the best option is the one the evidence supports, not the one most people lean towards. Wrong choices are explained rather than punished silently.
* **Gather information**: sit at a manager's seat to get their assessment, which is evidence the mission needs.
* **Agree communications** at the communications board: what is said, to whom and when.
* **Stand down** Bronze at the end (mission 12) with a lessons-learned review.

On Auto, the team agrees the best-practice decision itself and reports it.

## Code

`src/data/missions/bronze.ts` (roster and furniture), `quietMalware.ts`, `ransomNote.ts`, `wormInTheWires.ts`, board tasks in `src/data/incidents/`, the `meeting` dialog (`src/game/types.ts`, `src/ui/ui.ts`, `scenario.ts` step field `meeting`). Unlocking: `CYBER_FIRST` in `src/game/systems/Campaign.ts`.
