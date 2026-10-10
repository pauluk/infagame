# Controls

| Input | Action |
|---|---|
| W A S D / arrow keys | Move; directions are screen-relative (W = up the screen). Two keys give the four grid axes. |
| Click floor | Walk there (shortest path through corridors; locked rooms are not entered). |
| E | Use the selected tool on the nearest highlighted object, or on the selected target. |
| 1-8 | Select tool (the brief requires 1-4; 5-8 are Token Rotation, Clean Restore, Reconciliation Wand, Flow Rerouter) |
| Click object / flow line / reader / room | Select and inspect (source, destination, status, impact for routes; pass, scope and lock state for doors) |
| M / F / L / R / G | Minimap, Fabric panel, incident log, route overlay, goals (primary / optional / stretch) |
| Mouse wheel, + / -, drag | Zoom (0.55x-3x) and pan; C or "Return to player" re-centres |
| Esc | Pause menu |

**Touch.** Auto-enabled on coarse-pointer devices (Settings -> Accessibility -> Touch controls: Auto / Always on / Off): an on-screen pad, an **E** button and a pause button. Tap objects to select; tap the floor to walk. At phone widths (< 560 px) the HUD is simplified (fewer meters, the minimap and inspect panel collapse).

**Tutorial.** A short "How to Play" card is shown the first time a mission starts and is always available from the title and pause menus.

## Tutorial mode
Optional coaching layer (`src/data/coach.ts`, `renderCoach` in `src/ui/ui.ts`). Setting: `tutorial` in `ledgerlock.settings.v1`. Free hints, 0.6x clock speed, stretch goals excluded from campaign results. Browser check: `tests/e2e-tutorial.mjs`.

## Manager mode and Auto-play
Team panel (**T**): *Team on duty* calls in Priya (investigator), Marcus (containment) and Lena (records and access). Open a card to give an order: **▶ suggested task**, **Use <tool> → <selected target>**, or **Read / use**. **Auto** per member; **Everyone on Auto**; **1× 2× 4×** while Auto runs. *Let the team make the calls* answers choices and confirmations for you; otherwise they appear under messages as "Needs your call". Moving or clicking yourself stops your own Auto-play. Auto does the work: stretch goals do not count for that run.
Implementation: `src/game/systems/Playbook.ts` (per-mission playbooks), `Team.ts` (controller), `Reach.ts` (standing cells and range), `src/ui/teamPanel.ts`. Browser checks: `tests/e2e-team.mjs`, `tests/e2e-autoplay.mjs`.
