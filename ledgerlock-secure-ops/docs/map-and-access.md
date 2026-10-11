# Map, corridors, doors and access

The facility is an **explicit graph**. Rooms and corridor junctions are nodes, corridors are edges, and every door belongs to exactly one corridor. The walk grid, the minimap, the in-game doors and readers, the Facility Map, the incident markers and the system overlays are all generated from the same data, so they cannot disagree.

| File | What it holds |
|---|---|
| `src/data/layout.ts` | **Generated, then committed as data.** Room rectangles, corridor junctions ("concourses"), and every link with its door cells, reader cell and corridor rectangles. Nothing is inferred from screen position. |
| `src/data/rooms.ts` | Room specs (id, code, name, wing, props) and the workstation bays. |
| `src/data/map.ts` | Builds `ROOMS`, `DOORS`, `GRID`, the door-state model (`doorInfo`, `linkInfo`, `LINK_RULES`, `GATE`) and `isWalkable`. |
| `src/data/facilityGraph.ts` | The graph API: `CORRIDORS`, `neighbours`, `nodeRoute`, `LOOPS`, `locate`, equipment, ports, system diagrams. |
| `src/game/systems/Fog.ts` | What the player has discovered (`isKnown`). |
| `tools/layout-lab.mts` | The authoring tool that places doors clear of props, routes 2-wide corridors that never touch another link, and emits `layout.ts` (`npx vite-node tools/layout-lab.mts --emit`). |

## Layout

World 92 x 57 cells; projection `screenX = originX + (gx - gy) * 24`, `screenY = originY + (gx + gy) * 12` (`Grid.ts`). Fifteen rooms of **different sizes** (6 x 9 up to 14 x 12) sit in an irregular arrangement around the central **Secure Operations Atrium**, joined by short corridors (2 cells wide) and eight **concourses** (4 x 4 open plazas where corridors meet). The map only shows corridors that exist: there is no continuous floor around the rooms.

Wings (the twelve core rooms keep their ids and codes; workstations are small bays inside system rooms, not rooms):

| Wing | Rooms |
|---|---|
| Atrium | `secure_ops` A3 Secure Operations Atrium: spawn, Incident Wall (Incident Board), Facility Overview Terminal, Access Desk, **Identity & Access Desk**. Five exits. |
| Data | `api_gateway` A1, `event_stream` B1, `fabric_platform` C1, `audit_gallery` E1 (read-only gallery) |
| Finance operations | `finance_core` B2 (Accounting and AP workstations), `service_payments` A2, `expense_claims` E3 (the route `expense_payment`: Expense Claims, Payroll & Pensions, Payment Orchestration, BACS Vault, bank) |
| Payment rails | `payment_orchestration` C2 (Treasury workstations), `card_payments` B3 (Fraud workstation), `bacs_vault` D2, `integration_exchange` D1 |
| Collections and staff | `debt_recovery` C3 (AR workstations), `agency_handoff` D3 (Fraud workstation), `payroll_pensions` E2 (Payroll & Pensions office) |

## The graph

* **Concourse links.** Each room opens onto at least one concourse. Concourses are open ground, so reaching a room never means walking *through* a locked room. The test suite asserts every concourse door is reachable holding only the `ops_pass`, and that every room is reachable from the atrium without crossing another room.
* **Direct links** join two rooms and form the required loops (walking one means crossing the room at the far end, so it needs that room's pass).
* **Loops** (`LOOPS` in `facilityGraph.ts`, each asserted to be a real cycle): Operations (atrium, Finance Core, Event Stream, Fabric), Data (Event Stream, Fabric, API Gateway, closed by the Event Stream to API Gateway **cross-link**), Payment (atrium, Card Payments, BACS Vault, Payment Orchestration), Collections (Payment Orchestration, Agency Hand-off, Debt Recovery, BACS Vault), Staff access (atrium, Payroll & Pensions, Service Payments, Finance Core).
* **Optional maintenance corridors** (three), never needed for any objective: the *conduit shortcut* (Event Stream to API Gateway; starts locked until the Maintenance Pass), the *courier lift* (Integration Exchange to Agency Hand-off; needs a Courier Approval and is sealed during an incident there) and the *back-office shortcut* (Service Payments to Card Payments; temporarily disabled for the first six game minutes and sealed during incidents in either room).
* **A blocked door never strands an objective.** Only maintenance corridors can be sealed, disabled or locked, and the tests assert that with every one of them blocked, every room, start room, incident room and evidence room of every mission is still reachable.

## Doors

A door has one of four states, always with a reason (and the pass or approval it needs):

| State | Shown as | Meaning |
|---|---|---|
| open | green circle, "Open" | You can walk through. |
| locked | orange square, "Locked" | Needs a pass: the room's own pass, or for a maintenance corridor the Maintenance Pass or Courier Approval. |
| incident-sealed | red diamond, "Sealed by incident" | An uncontained incident beside the corridor's rooms has sealed it (optional corridors only). Contain the incident to reopen. |
| temporarily disabled | grey dotted square, "Temporarily disabled" | Scheduled maintenance; it returns by itself. |

The state is computed by `doorInfo(door, passes)` (corridor first, then the room's pass), used by `isWalkable`, the scene's door and reader sprites, the minimap, the Facility Map and the reader dialog. Door ids are stable: `door:<room>.<neighbour>`, for example `door:card_payments.js` (the south concourse). The legend uses shapes and words as well as colour (Okabe-Ito palette).

## Discovery

Visited rooms are revealed. So are your start room, the incident room (the wall names it), and rooms where you collected evidence. Everything else is drawn as a dark **silhouette** with no name or equipment, in the game, the minimap and the map.

## Map views

Press <kbd>B</kbd> (or use the Facility Overview Terminal in the atrium): **Facility** (rooms, corridors, doors, loop highlight), **Systems** (data flows, kept separate from corridors), **Access** (the pass each room needs, door states, workstation bays) and **Incident** (incident room, evidence rooms, the corridor route to it, or the same incident on a system diagram), plus the per-room **Room blueprint**. Select a room, a door or a corridor for its details; **Set waypoint** walks you there (never a teleport).

## Access readers and passes

Every room is restricted. A door cell is walkable only if the player holds that room's pass; **a locked room never blocks travel between rooms** (concourses are open ground) and there is no bypass mechanic. An access reader on the wall beside each door shows the required pass, its scope, the lock state and a *Request* button.

| Room | Pass | Scope |
|---|---|---|
| secure_ops | ops_pass | Control Room and common corridors |
| expense_claims | expense_audit_pass | Read-only, masked expense-claim metadata (optional) |
| audit_gallery | audit_gallery_pass | Read-only access to the audit exhibits (optional) |
| payroll_pensions | staff_office_pass | Escorted entry to the Payroll & Pensions office (optional) |
| service_payments | service_audit_pass | Read-only, masked payment-request evidence |
| api_gateway | api_audit_pass | Read-only request and authentication metadata |
| card_payments | payments_audit_pass | Read-only, masked card-receipt evidence |
| event_stream | event_trace_pass | Read-only event metadata and replay trace |
| finance_core | ledger_read_pass | Read-only, masked ledger and reconciliation data |
| payment_orchestration | payment_ops_pass | Read-only batch and queue metadata |
| bacs_vault | bacs_audit_pass | Read-only file metadata and simulated bank-response status |
| debt_recovery | debt_read_pass | Read-only masked debt and receipt evidence |
| agency_handoff | agency_audit_pass | Read-only transfer manifest and delivery receipt |
| fabric_platform | fabric_observer_pass | Read-only synthetic Bronze/Silver/Gold pipeline status |
| integration_exchange | integration_audit_pass | Read-only transfer status and routing metadata |

Two further passes open optional corridors only and never cost Data protection: `maintenance_pass` and `courier_pass`. Passes can also be **revoked** from the Access Desk (least privilege; raises Data protection). Mission 6 adds one special pass, `token_rotation_pass`: a time-limited approval (12 game minutes) that opens no door and is needed to rotate the simulated token at the Access Desk. Requesting a pass a mission does not need costs Data protection.

Passes are fictional, mission-scoped and read-only; `GameState.passes` is created per mission, so they expire when the mission ends. A request is granted only when the mission's `passGrants` rule says current evidence justifies it; otherwise the player sees a denial and a hint. Evidence retrieval also checks the pass, so nothing can be read remotely.

## Routes (overlay, not walls)

`service_payment_intake`, `supplier_payment_release`, `bank_response_reconciliation`, `card_receipt`, `debt_agency_export`, `agency_receipt`, `finance_event_mirror`, plus one mission-specific addition, `receipt_event_feed` (the replay path through the Event Stream Hall). Each has hops (rooms, props or external nodes), a colour, a pulse speed and a state (`healthy | delayed | suspicious | quarantined | rerouted | restored`) that changes the line style, pulses, icon and label. Quarantining a route changes only that route; quarantining a room marks the routes passing through it `delayed`. External nodes (bank, card network, fictional agency, reporting display) are labelled *simulated external service*.

## Minimap

Rooms with codes, door states (circle open, square locked, diamond sealed, hollow square disabled), the player, undiscovered rooms as silhouettes, held passes (chips), the active incident route, and corridor guides. Clicking a room highlights the corridor path (and stops at the door if the room is locked) without teleporting. Camera follow, zoom limits and "Return to player" are in the HUD.

## Teammates on the map

In Manager mode the minimap and the Facility, Access and Incident map views show each teammate as a coloured dot with their initial (an amber ! when they are stuck or waiting for a decision). Click a room or a corridor on the minimap to walk there (never a teleport; locked rooms take you to their door), or click a teammate to put the camera on them.
