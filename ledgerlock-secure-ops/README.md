# LedgerLock: Secure Ops

A lightly humorous, single-player **isometric security-operations game** set in a fictional finance platform. You are a Secure Ops engineer: walk the facility, follow money and event routes, investigate software faults, contain with care, and keep valid services running. It is a diagnostic and recovery game: there is no combat, and there is no real malware, real payment data or real organisation in it.

* Phaser 3.90.0 + TypeScript + Vite 7. Fixed-camera 2:1 isometric view (48 x 24 px cells).
* All art is **rendered in Blender** from free CC0 models (Quaternius, Kenney, Poly Haven) and shipped as optimised atlases. No `.blend` files or external assets are loaded at runtime.
* Fully playable offline. Microsoft Fabric appears as a **Demo data** panel; a live adapter exists but is disabled by default.

![status](https://img.shields.io/badge/mission-The%20Duplicate%20Ghost%20playable-37D7D0)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build
npm run preview    # serve the production build on http://localhost:4173
npm run test       # 62 logic tests (map, passes, routes, every mission's scripted path, campaign storage, badges, scoring, Fabric demo adapter)
npm run typecheck  # tsc --noEmit
npm run test:e2e   # real-browser playthrough of the tutorial (needs `npm run preview` running and Playwright); also tests/e2e-campaign.mjs
npm run assets:render   # OPTIONAL: re-render all sprites with Blender (see docs/art-pipeline.md)
```

Requires Node 20+ (developed on Node 22). `npm run assets:render` additionally needs Blender 4.x and Python 3 with Pillow.

## How to play

1. **Start Shift** (title) -> read the briefing. You begin in **Secure Operations Atrium (A3)** holding only an `ops_pass`.
2. Doors are locked until you hold the room's **read-only, mission-scoped pass**. Request passes at the **Access Desk** or at any **door reader** (press <kbd>E</kbd> next to it). Requests are approved only when evidence justifies them; otherwise you get a clear denial and a hint. There is no bypass.
3. Walk the corridors, scan, retrieve masked evidence, trace the event order, **contain only what you must**, patch, restore, reconcile, then verify (including in the Fabric room) and file the report on the **Evidence Board** back in Secure Operations Atrium.
4. The debrief scores you out of 100 (35 integrity, 25 availability, 20 diagnosis and verification, 10 privacy and containment, 10 time) and shows the campaign Service Confidence before and after. A safe, verified result is always a positive result, and a broad shutdown is recoverable.

### Controls

| Input | Action |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrow keys | Move (screen-relative, 8 directions). Click the floor to walk there. |
| <kbd>E</kbd> | Use the selected tool on the nearest highlighted object (or on the selected target). Opens door readers, the Access Desk and the Evidence Board. |
| <kbd>1</kbd>-<kbd>8</kbd> | Select tool: Scanner, Lens, Quarantine, Patch, Token Rotation, Clean Restore, Reconcile, Reroute |
| Mouse click | Select/inspect an object, flow line, door reader or room. Click a minimap room for a corridor guide (no teleport). |
| <kbd>M</kbd> / <kbd>F</kbd> / <kbd>L</kbd> / <kbd>R</kbd> | Minimap / Fabric panel / incident log / route overlay |
| Wheel, <kbd>+</kbd> <kbd>-</kbd>, drag, <kbd>C</kbd> | Zoom (0.55-3x), pan, return camera to player |
| <kbd>Esc</kbd> | Pause (resume, restart mission, how to play, audio/accessibility, quit) |
| Touch | On-screen pad and **E** button (auto-shown on touch devices; Settings -> Touch controls). Phone widths use a simplified HUD. |

Accessibility: mute, **reduced motion** (no pulses/shakes/bobbing; route direction stays visible via arrows), relaxed pace (half-speed incidents), larger text. Status is never colour-only: every state has a label, icon or shape.

### Tutorial mode
Pick **Tutorial Mode** on the title screen (or tick it in the briefing, Settings or the pause menu). A coach card shows the current step, what to do, why it matters and which tool to use; a bouncing arrow marks the target and the tool belt highlights the tool. Hints are free, the clock runs slower, and stretch goals are not counted while it is on. It switches on automatically the first time you open Duplicate Ghost and can be turned off at any time.
(Coaching is written for Duplicate Ghost; other missions show the normal guidance.)

### Manager mode and Auto-play
- **Manager mode** (title screen, briefing, Settings, pause menu or the Team panel): three teammates join you, each with a role. **Priya** investigates (scanner, lens, evidence), **Marcus** contains and fixes (quarantine, patch, restore, reroute) and **Lena** handles passes, reconciliation, records and the report. You order them: open a card, pick a tool on the belt and a target on the map, press **Use ... →** (or **Read / use**), or press the **▶ suggested** button for their next task. They walk the real corridors, need the same passes, and use the same tools and rules you do.
- **Auto**: every card (including **You**) has an Auto switch. A member on Auto picks the next ready task for their role, and covers for others after a short pause. Your own Auto-play walks your avatar through the playbook; **move or click yourself to take the controls back**. A **1× / 2× / 4×** speed control is there while anything is on Auto.
- **Decisions stay yours by default.** When a teammate reaches a choice or a confirmation (a diagnosis, a containment) they post it in the Team panel's messages ("Needs your call") and wait. Tick *Let the team make the calls* to let them pick the best-practice answer. Evidence and findings they collect arrive as messages you can open.
- **Stuck teammates** say why (a pass the clue does not yet justify, a step that comes first) instead of guessing.
- Fairness: stretch goals are earned by hand, so they are not counted for any run in which Auto did an action (shown in the debrief). Everything else is scored normally.
- Keyboard: **T** shows or hides the panel.

### JEV second opinions (optional)
Turn on **JEV** in Settings (it needs `TYPESAFE_API_KEY` on the server) to ask TypeSafe AI's JEV model for a second opinion on a decision; teammates on Auto consult it too and only act alone when it is confident. See `docs/jev.md`.

## Campaign and missions

**Campaign goal:** protect the fictional finance service while keeping valid payments, debt receipts and reporting accurate and available. Progress is measured by safe outcomes and clear evidence (see `docs/campaign.md`).

* Eight missions: **The Duplicate Ghost** (tutorial), **BACS After Dark**, **The Collection Connection**, **Event Stream Tide**, **The Fabric Mirror**, **Token on the Table**, **The Clean Restore** and the finale **The Root of the Ripple**, plus the free-roam **Operations Floor** with six optional side tasks.
* Every mission has primary, optional and stretch objectives; optional objectives never block progress and mistakes are recoverable.
* Five campaign measures (transaction integrity, service availability, data protection, recovery readiness, audit quality) combine into **Service Confidence**, shown on the Control Room wall and in every debrief. Six badges reward good habits (Precision Over Panic, Least Privilege, No Lost Events, Ledger Listener, Clean Restore, Good Evidence).
* Debriefs show objective status, evidence and its sources, Service Confidence before/after, routes affected and the safest next step. Completed missions can be replayed. Progress lives only in your browser's local storage.
* The tutorial has a bespoke simulation; missions 2-8 run on the declarative scenario engine (`src/data/missions/scenario.ts`). Add a mission by writing a `MissionDef` / `ScenarioSpec` and listing it in `src/data/missions/index.ts`. Game state (`GameState`) and rules (`MissionRunner`) contain no Phaser/DOM code.

## Facility map

4 x 3 rooms, each about 10 x 8 cells, joined by a continuous 2-cell corridor system (see `docs/map-and-access.md`):

| | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| North | A1 API Gateway | B1 Event Stream Hall | C1 Fabric Data Platform | D1 Integration Exchange |
| Middle | A2 Service Payments | B2 Finance Core | C2 Payment Orchestration | D2 BACS Vault |
| South | A3 Secure Operations Atrium | B3 Card Payments | C3 Accounts Receivable & Debt Recovery | D3 Agency Hand-off |

Finance routes (cyan/blue/mint/violet/periwinkle pulses with direction arrows, labels and live states `healthy, delayed, suspicious, quarantined, rerouted, restored`) are a **separate overlay**: they never block movement. Simulated bank, card network, fictional agency and reporting display sit just outside the facility, labelled *simulated external service*.

## Project structure

```
src/game/            Phaser setup, scenes (boot/menu/facility/debrief), systems (state, mission runner, grid, flow overlay, scoring), art loader
src/data/            typed map, passes, routes, evidence, tools and mission definitions
src/integrations/    fabric/  FabricDataProvider, DemoFabricAdapter (default), LiveFabricAdapter (disabled by default)
src/ui/              DOM HUD, dialogs, minimap, screens (accessible HTML over the Phaser canvas)
server/              fabricProxy.mjs  optional server-side Fabric adapter (holds credentials; read-only)
public/assets/       rendered atlases: environment/ props/ characters/ effects/ ui/ (PNG + JSON)
blender/source/      ledgerlock_facility.blend  (master scene; editable source)
blender/scripts/     import_assets.py, build_facility.py, render_sprites.py, sprite_jobs.py, pack_atlas.py, make_attribution.py
blender/source-assets/vendor/   the unpacked third-party sources actually used, with their licence files
tests/               vitest logic tests and the Playwright end-to-end playthrough
docs/                game overview, controls, map and access, art pipeline, Fabric setup
ATTRIBUTION.md  asset-manifest.json  .env.example  .gitignore
```

## Art pipeline and licences (short version)

Sources (all **CC0 1.0**, verified on each pack page and in its licence file; see `ATTRIBUTION.md` and `asset-manifest.json`):

* [Quaternius Modular SciFi MegaKit](https://quaternius.com/packs/modularscifimegakit.html) (Standard, free): 24 floor/wall/door/column/prop pieces, restyled into a finance-tech office look.
* [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) + [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) (Standard, free): the Secure Ops engineer, retargeted by bone name (idle, walk, interact/scan, kneeling repair, celebration), with workwear, teal jacket, tool belt, shoulder kit, ID badge and cap added in Blender. 4 facings x 22 frames.
* [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit): desks, chairs, cabinets, plants, sofa, coffee machine and more (18 items).
* [Poly Haven](https://polyhaven.com): `anti_skid_tiles` (corridor floor texture) and `blue_photo_studio` HDRI (render-time lighting only, not shipped).
* Modelled for this project in Blender: racks, consoles, card terminal, BACS case, secure cabinet, Fabric Bronze/Silver/Gold nodes, bugs, malware, effects, tool icons.

Rerender everything with one command (Blender 4.x + Pillow): `npm run assets:render` (set `BLENDER=/path/to/blender` if it is not on `PATH`). Details and the camera maths are in `docs/art-pipeline.md`. The rendered atlases are committed, so you do **not** need Blender to run or build the game. If an atlas ever fails to load, the game generates flat, clearly-placeholder shapes and logs a console warning rather than pretending a render exists.

## Microsoft Fabric (optional)

The Fabric room and analytics panel (**F**) show synthetic Bronze/Silver/Gold status, event counts, freshness and dashboard state from `DemoFabricAdapter`, labelled **Demo data**. A separate `LiveFabricAdapter` is **off by default**. Live mode needs separate approval and configuration: a server-side proxy (`npm run fabric-proxy`) holds the credentials from environment variables (see `.env.example`; real `.env` files are git-ignored) and makes read-only calls to one documented Fabric REST endpoint. Nothing secret reaches the browser, and if anything is missing the game stays in demo mode. See `docs/fabric-setup.md`.

## Verification status

What was actually run in this repository (2026-10-10, Linux, Node 22, Blender 4.5.9 LTS headless):

* Assets were downloaded from the official Quaternius (via its itch.io free-download flow), Kenney and Poly Haven pages and licences checked; **191 sprites were rendered with Blender Cycles** and packed into 5 atlases.
* `npm run build`, `npm run typecheck` and `npm run test` (21 tests) pass.
* `tests/e2e.mjs` plays the tutorial from the title screen to the debrief in headless Chromium (software WebGL) and asserts the console is clean.
* Not tested: real GPU rendering, Safari/Firefox, physical touch devices (touch controls were built but only exercised through emulation of pointer events), and the live Fabric adapter (no tenant or credentials were available; it is untested by design).
