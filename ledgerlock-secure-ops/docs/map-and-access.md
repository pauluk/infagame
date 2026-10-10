# Map, corridors, doors and access

All of this is data: `src/data/map.ts` (rooms, doors, readers, grid), `src/data/passes.ts` (pass access map), `src/data/routes.ts` (routes), `src/data/evidence.ts` (tutorial evidence). Mission logic, route overlays, room interactions and the minimap all use the same stable IDs.

## Grid

`screenX = originX + (gridX - gridY) * 48 / 2`, `screenY = originY + (gridX + gridY) * 24 / 2` (`src/game/systems/Grid.ts`). Sprites are depth-sorted by `gridX + gridY` of their ground point. Rooms are 10 x 8 cells (the outer ring is wall; interior 8 x 6). Corridors are 2 cells wide and surround every room, so corridors are continuous. World size 64 x 46 cells.

## Rooms

`api_gateway A1`, `event_stream B1`, `fabric_platform C1`, `integration_exchange D1`, `service_payments A2`, `finance_core B2`, `payment_orchestration C2`, `bacs_vault D2`, `secure_ops A3`, `card_payments B3`, `debt_recovery C3`, `agency_handoff D3`. Props per room are listed in `SPECS` in `map.ts` (e.g. B1: queue monitor, replay diagnostic console, replay buffer, event lanes).

## Physical connections (17)

Door pairs: east/west (A1-B1, B1-C1, C1-D1, A2-B2, B2-C2, C2-D2, A3-B3, B3-C3, C3-D3) and north/south (A1-A2, B1-B2, C1-C2, D1-D2, A2-A3, B2-B3, C2-C3, D2-D3). Each connection gives one 2-cell door in each room, opening onto the corridor between them. The test suite asserts all 17 pairs and that every door is reachable through corridors holding only the `ops_pass`.

## Access readers and passes

Every room is restricted. A door cell is walkable only if the player holds that room's pass; interiors are only reachable through doors, so **a locked room never blocks corridor travel** and there is no bypass mechanic. An access reader on the wall beside each door shows the required pass, its scope, the lock state and a *Request* button.

| Room | Pass | Scope |
|---|---|---|
| secure_ops | ops_pass | Control Room and common corridors |
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

Passes can also be **revoked** from the Access Desk (least privilege; raises Data protection). Mission 6 adds one special pass, `token_rotation_pass`: a time-limited approval (12 game minutes) that opens no door and is needed to rotate the simulated token at the Access Desk. Requesting a pass a mission does not need costs Data protection.

Passes are fictional, mission-scoped and read-only; `GameState.passes` is created per mission, so they expire when the mission ends. A request is granted only when the mission's `passGrants` rule says current evidence justifies it; otherwise the player sees a denial and a hint. Evidence retrieval also checks the pass, so nothing can be read remotely.

## Routes (overlay, not walls)

`service_payment_intake`, `supplier_payment_release`, `bank_response_reconciliation`, `card_receipt`, `debt_agency_export`, `agency_receipt`, `finance_event_mirror`, plus one mission-specific addition, `receipt_event_feed` (the replay path through the Event Stream Hall). Each has hops (rooms, props or external nodes), a colour, a pulse speed and a state (`healthy | delayed | suspicious | quarantined | rerouted | restored`) that changes the line style, pulses, icon and label. Quarantining a route changes only that route; quarantining a room marks the routes passing through it `delayed`. External nodes (bank, card network, fictional agency, reporting display) are labelled *simulated external service*.

## Minimap

Rooms with codes, open/locked doors, the player, available corridors, held passes (chips), the active incident route, and corridor guides. Clicking a room highlights the corridor path (and stops at the door if the room is locked) without teleporting. Camera follow, zoom limits and "Return to player" are in the HUD.
