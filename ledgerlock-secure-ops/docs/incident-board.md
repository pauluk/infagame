# Incident Board

Press <kbd>I</kbd>, use the **Board** button, or choose *Open the Incident Board* from the Incident Wall. Each mission has three incidents (INC-x01..x03; 25 across the campaign) shown as cards on a seven-column Kanban: **Triage, Investigating, Contained, Fixed, Verified**, plus the puzzle columns.

* Moving a card is **held to the same rules as the game**: a card cannot enter Verifying until the fix is verified, and so on. A refused move leaves the card where it was, shows the unmet prerequisite and costs nothing. Drag the grip, use **Move to...**, or use the keyboard (Space to pick up, arrow keys to choose a column, Space to drop).
* Tactile puzzles (sort, match, sequence, route, identify what is missing) change the **real** game: solving one contains, fixes or verifies the actual thing, through the same `performAction` used by teammates. A wrong answer is explained, not punished.
* Evidence collected in the world moves cards by itself.

Code: `src/data/incidents/*.ts` (data), `src/game/systems/Incidents.ts` (engine), `src/ui/incidentBoard.ts`, `src/ui/dragkit.ts` (pointer drag with keyboard and tap alternatives). Tests: `tests/logic.test.ts` and `tests/e2e-board.mjs`.
