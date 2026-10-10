import type { RoomDef, RoomId } from '../game/types';

export type Wing = 'atrium' | 'data' | 'finance' | 'payments' | 'collections';
export const WING_NAMES: Record<Wing, string> = { atrium: 'Secure Operations Atrium', data: 'Data Wing', finance: 'Finance Operations Wing', payments: 'Payment Rails Wing', collections: 'Collections & Staff Wing' };

export type PropSpec = [key: string, sprite: string, rx: number, ry: number, name: string, desc: string, interactive?: boolean];
export interface RoomSpec { id: RoomId; code: string; name: string; wing: Wing; accent: RoomDef['accent']; blurb: string; props: PropSpec[] }

// Prop cells are room-local, measured from the room's prop origin (see layout.ts). Doors are chosen to keep clear of props.
export const SPECS: RoomSpec[] = [
  { id: 'api_gateway', code: 'A1', name: 'API Gateway', wing: 'data', accent: 'cyan', blurb: 'Incoming requests, authentication status and service connections.', props: [
    ['gateway_console', 'i_console_api', 4, 3, 'Gateway Console', 'Routes authenticated requests to the right service.'],
    ['request_monitor', 'i_terminal_cyan', 7, 1, 'Request Monitor', 'Live request rates and error counts (synthetic).'],
    ['auth_terminal', 'i_terminal_blue', 4, 1, 'Authentication Status Terminal', 'Shows which service credentials are valid and when they rotate.'],
    ['desk', 'd_desk_set', 7, 6, 'Duty Desk', 'A mug reads "I ♥ rate limits".', false],
    ['plant', 'd_plant', 8, 1, 'Fern', 'Nobody remembers who waters it. It thrives anyway.', false],
  ] },
  { id: 'event_stream', code: 'B1', name: 'Event Stream Hall', wing: 'data', accent: 'cyan', blurb: 'Events flowing from systems towards finance modules and analytics.', props: [
    ['queue_monitor', 'i_rack_cyan', 2, 1, 'Queue Monitor', 'Shows how many events wait in each lane.'],
    ['replay_console', 'i_console_event', 7, 1, 'Replay Diagnostic Console', 'Traces repeated events back to their source.'],
    ['replay_buffer', 'i_rack_amber', 8, 1, 'Replay Buffer', 'Keeps recent events so consumers can catch up.'],
    ['consumers', 'i_rack_cyan', 3, 1, 'Consumer Group', 'Services that read events from the stream: lanes, capacity and dead-letter handling.'],
    ['lane_console_a', 'i_console_event', 3, 3, 'Event Lane Console A', 'Lane controls for the first pair of event lanes (synthetic).'],
    ['lane_console_b', 'i_console_event', 6, 4, 'Event Lane Console B', 'Lane controls for the second pair of event lanes (synthetic).'],
    ['lane1', 'd_cable_tray', 2, 5, 'Event Lane 1', 'Events travel along these lanes.', false],
    ['lane2', 'd_cable_tray', 3, 5, 'Event Lane 2', 'Events travel along these lanes.', false],
    ['lane3', 'd_cable_tray', 6, 5, 'Event Lane 3', 'Events travel along these lanes.', false],
    ['lane4', 'd_cable_tray', 7, 5, 'Event Lane 4', 'Events travel along these lanes.', false],
    ['plant', 'd_plant', 8, 6, 'Tall Plant', 'Reaches towards the cable trays.', false],
  ] },
  { id: 'fabric_platform', code: 'C1', name: 'Fabric Data Platform', wing: 'data', accent: 'periwinkle', blurb: 'Bronze, Silver and Gold stations feeding a reporting display.', props: [
    ['fan', 'd_fan', 8, 2, 'Cooling Fan', 'Keeps the medallion layers cool.', false],
    ['bronze', 'i_node_bronze', 2, 1, 'Bronze Station', 'Raw events, landed as they arrive (synthetic).'],
    ['silver', 'i_node_silver', 4, 3, 'Silver Station', 'Cleaned and conformed finance data (synthetic).'],
    ['gold', 'i_node_gold', 8, 1, 'Gold Station', 'Reporting-ready tables (synthetic).'],
    ['pipeline_display', 'i_screen_dashboard', 5, 1, 'Pipeline Status Display', 'Bronze, Silver and Gold pipeline status. Press F for the analytics panel.'],
    ['plant', 'd_plant_small', 8, 6, 'Desk Plant', 'Gold-standard greenery.', false],
  ] },
  { id: 'integration_exchange', code: 'D1', name: 'Integration Exchange', wing: 'payments', accent: 'cyan', blurb: 'Secure transfers between finance modules and external services.', props: [
    ['table', 'd_table', 8, 6, 'Coffee Table', 'Where partner handshakes are rehearsed.', false],
    ['transfer_console_a', 'i_console_integ', 2, 1, 'Secure Transfer Console A', 'Queue of secure transfers (synthetic).'],
    ['transfer_console_b', 'i_console_integ', 6, 1, 'Secure Transfer Console B', 'Second transfer queue.'],
    ['transfer_racks', 'i_rack_violet', 4, 3, 'Secure Transfer Racks', 'The racks every approved external transfer passes through.'],
    ['agency_console', 'i_console_integ', 3, 6, 'Agency Connection Console', 'Status of the approved link to the fictional agency.'],
    ['connection_panel', 'i_rack_violet', 8, 1, 'External Service Connection Panel', 'Status of links to simulated external services.'],
    ['crate', 'd_crate', 2, 6, 'Spare Cable Crate', 'Labelled "definitely cables".', false],
  ] },
  { id: 'service_payments', code: 'A2', name: 'Service Payments', wing: 'finance', accent: 'cyan', blurb: 'Payment request intake and validation.', props: [
    ['laptop', 'd_desk_laptop', 8, 6, 'Hot Desk', 'Somebody left a laptop open on a validation checklist.', false],
    ['intake_terminal', 'i_terminal_cyan', 2, 1, 'Payment Request Intake Terminal', 'Incoming service payment requests (masked).'],
    ['validation_desk', 'i_terminal_cyan', 6, 4, 'Validation Desk', 'Where payment references and amounts are checked by hand when the queue flags them.'],
    ['validation_queue', 'i_rack_cyan', 7, 1, 'Validation Queue', 'Requests waiting for reference and amount checks.'],
    ['desk', 'd_desk_set', 7, 6, 'Shared Desk', 'A sticky note: "Check the reference. Then check it again."', false],
    ['plant', 'd_plant', 2, 6, 'Rubber Plant', 'Decorative. Mostly.', false],
  ] },
  { id: 'finance_core', code: 'B2', name: 'Finance Core', wing: 'finance', accent: 'blue', blurb: 'General Ledger, Accounts Payable and Accounts Receivable.', props: [
    ['shelf', 'd_bookcase2', 8, 1, 'Policy Shelf', 'Binders labelled "Reconciliation: read twice".', false],
    ['gl', 'i_console_ledger', 4, 3, 'General Ledger', 'The single source of truth for postings.'],
    ['ap', 'i_console_payment', 2, 2, 'Accounts Payable', 'Supplier invoices and approved payment batches.'],
    ['recon_screen', 'i_screen_dashboard', 6, 1, 'Reconciliation Screen', 'Expected, received and posted totals side by side (synthetic).'],
    ['ar', 'i_console_debt', 7, 2, 'Accounts Receivable', 'Receipts and amounts owed to the organisation.'],
    ['desk', 'd_desk_set', 7, 6, 'Finance Desk', 'Balanced. As all things should be.', false],
  ] },
  { id: 'payment_orchestration', code: 'C2', name: 'Payment Orchestration', wing: 'payments', accent: 'blue', blurb: 'Payment validation and batch release controls.', props: [
    ['validation_console', 'i_terminal_blue', 2, 1, 'Payment Validation Console', 'Limit and format checks on each batch (synthetic).'],
    ['release_controls', 'i_console_payment', 7, 1, 'Batch Release Controls', 'Approved batches are released from here.'],
    ['batch_rack', 'i_rack_blue', 4, 3, 'Batch Rack', 'Batches queued for the next payment run.'],
    ['plant', 'd_plant_small', 8, 6, 'Bonsai', 'Pruned on a strict schedule.', false],
      ['treasury_ws_a', 'i_terminal_blue', 2, 5, 'Treasury Workstation A', 'Treasury bay: cash positions and payment-run limits (synthetic).'],
    ['treasury_ws_b', 'i_terminal_blue', 3, 5, 'Treasury Workstation B', 'Treasury bay: second approver seat for payment runs.'],
    ] },
  { id: 'bacs_vault', code: 'D2', name: 'BACS Vault', wing: 'payments', accent: 'blue', blurb: 'Locked payment staging cabinet, file metadata and bank responses.', props: [
    ['holder', 'd_itemholder', 8, 1, 'Evidence Tray', 'Holds printed checksums. Very retro.', false],
    ['chest', 'd_chest', 1, 6, 'Spare Chest', 'Empty. The spare keys are in a different room on purpose.', false],
    ['staging_cabinet', 'i_cabinet_secure', 4, 3, 'Locked Payment Staging Cabinet', 'Holds approved outbound payment files. Read-only for auditors.'],
    ['file_terminal', 'i_terminal_blue', 2, 2, 'File Metadata Terminal', 'File sizes, checksums and counts (no payee details).'],
    ['bank_monitor', 'i_screen_alert', 8, 2, 'Bank-Response Monitor', 'Simulated bank responses.'],
    ['case', 'i_case_bacs', 8, 6, 'BACS File Case', 'Carrying case for offline file hand-over (empty).'],
  ] },
  { id: 'secure_ops', code: 'A3', name: 'Secure Operations Atrium', wing: 'atrium', accent: 'amber', blurb: 'The central hub: incident board, facility overview, Access Desk and the Identity & Access Desk.', props: [
    ['lamp', 'd_lamp', 8, 6, 'Floor Lamp', 'Warm light for long incident nights.', false],
    ['coat', 'd_coatrack', 1, 1, 'Coat Rack', 'Three hi-vis jackets. Nobody claims the fourth.', false],
    ['incident_wall', 'i_screen_alert', 2, 1, 'Incident Wall', 'Live alerts for the whole platform. Currently very colourful.'],
    ['evidence_board', 'i_screen_dashboard', 7, 1, 'Evidence Board', 'Pins evidence in the order you collect it.'],
    ['access_desk', 'i_console_ops', 2, 6, 'Access Desk', 'Request fictional, read-only, mission-scoped passes.'],
    ['map_table', 'i_table_map', 7, 6, 'Facility Overview Terminal', 'The building directory: Facility, Systems, Access and Incident views. Press B, or M for the minimap.'],
    ['log_terminal', 'i_terminal_cyan', 4, 6, 'Incident Log Terminal', 'The synthetic incident log: close stale entries and redact sensitive-looking values.'],
    ['identity_desk', 'i_console_ops', 3, 3, 'Identity & Access Desk', 'A staffed terminal for access requests, service access forms and access reviews. A game simulation: every person and permission is fictional.'],
    ['comms_console', 'i_terminal_blue', 5, 6, 'Communications Console', 'Calls to platform teams and the on-call rota (simulated; nothing real is contacted).'],
    ['coffee', 'i_coffee', 8, 1, 'Coffee Machine', 'Powers Secure Ops. Officially "infrastructure".', false],
    ['sofa', 'd_sofa', 1, 6, 'Break Sofa', 'For thinking. Not sleeping.', false],
  ] },
  { id: 'card_payments', code: 'B3', name: 'Card Payments', wing: 'payments', accent: 'mint', blurb: 'Simulated card terminal, settlement monitor and masked receipt log.', props: [
    ['box', 'd_box', 1, 6, 'Spare Terminals Box', 'Sealed. Probably.', false],
    ['card_terminal', 'i_terminal_card', 4, 3, 'Card Terminal (simulated)', 'Simulated terminal that authorises card payments.'],
    ['settlement_monitor', 'i_console_ledger', 7, 1, 'Settlement Monitor', 'Settlement events as they arrive.'],
    ['receipt_log', 'i_terminal_mint', 8, 5, 'Masked Receipt Log', 'Receipts with card numbers masked.'],
    ['notifier', 'i_rack_mint', 7, 6, 'Settlement Notifier', 'Sends a receipt event after each card settlement.'],
    ['plant', 'd_plant', 8, 1, 'Spider Plant', 'Has survived three migrations.', false],
      ['fraud_ws', 'i_terminal_mint', 3, 5, 'Fraud Workstation', 'Fraud bay: reviews flagged card settlements (synthetic).'],
    ] },
  { id: 'debt_recovery', code: 'C3', name: 'Accounts Receivable & Debt Recovery', wing: 'collections', accent: 'violet', blurb: 'Debt reconciliation and approved agency export.', props: [
    ['recon_console', 'i_console_debt', 2, 1, 'Debt Reconciliation Console', 'Matches receipts to debt records (synthetic).'],
    ['receipt_station', 'i_terminal_violet', 4, 3, 'Receipt Station', 'Where agency receipts are matched to the debt records they settle (synthetic).'],
    ['export_screen', 'i_terminal_violet', 8, 1, 'Approved Agency Export Screen', 'Only approved records appear here.'],
    ['records', 'd_bookcase', 2, 6, 'Debt Records Cabinet', 'Synthetic records awaiting recovery action.', false],
    ['plant', 'd_plant_small', 8, 6, 'Peace Lily', 'Hand-off approved. Very calm.', false],
      ['ar_ws_a', 'i_terminal_violet', 6, 5, 'AR Workstation A', 'Accounts Receivable bay: collectors work their queues here (synthetic).'],
    ['ar_ws_b', 'i_terminal_violet', 7, 5, 'AR Workstation B', 'Accounts Receivable bay: the AR manager approves write-offs from this seat.'],
    ] },
  { id: 'agency_handoff', code: 'D3', name: 'Agency Hand-off', wing: 'collections', accent: 'violet', blurb: 'Fictional agency transfer station and delivery receipt monitor.', props: [
    ['transfer_station', 'i_console_debt', 4, 3, 'Agency Transfer Station', 'Controlled hand-off to the fictional agency.'],
    ['receipt_monitor', 'i_terminal_violet', 2, 2, 'Delivery Receipt Monitor', 'Confirms what the agency received.'],
    ['box', 'd_box', 2, 6, 'Outbox', 'Empty. Everything is digital.', false],
    ['plant', 'd_plant', 8, 6, 'Palm', 'Was a gift from a vendor.', false],
      ['fraud_ws', 'i_terminal_violet', 6, 5, 'Fraud Workstation', 'Fraud bay: screens agency hand-offs for suspicious patterns (synthetic).'],
    ] },
  { id: 'audit_gallery', code: 'E1', name: 'Audit Gallery', wing: 'data', accent: 'periwinkle', blurb: 'A read-only gallery of audit trails and evidence exhibits. Nothing here can be changed.', props: [
    ['audit_wall', 'i_screen_dashboard', 2, 1, 'Audit Trail Wall', 'Read-only: every access decision and ledger posting, newest first (synthetic).'],
    ['ledger_exhibit', 'i_console_ledger', 3, 3, 'Ledger Exhibit', 'A frozen copy of last quarter\'s ledger. Look, do not touch.'],
    ['evidence_case', 'i_cabinet_secure', 2, 6, 'Evidence Display Case', 'Closed incident evidence on show (masked, synthetic).'],
    ['bench', 'd_sofa', 4, 6, 'Gallery Bench', 'For quiet reading.', false],
  ] },
  { id: 'payroll_pensions', code: 'E2', name: 'Payroll & Pensions Office', wing: 'collections', accent: 'mint', blurb: 'Staff payroll and pensions. Small office; the most sensitive people data in the building (all synthetic).', props: [
    ['payroll_console', 'i_console_payment', 2, 1, 'Payroll Console', 'Payroll runs and pay-element changes (synthetic).'],
    ['pensions_console', 'i_console_ledger', 5, 1, 'Pensions Console', 'Pension contributions and scheme changes (synthetic).'],
    ['staff_feed', 'i_rack_mint', 6, 3, 'Staff Data Feed', 'Joiners, movers and leavers that drive access reviews.'],
    ['desk', 'd_desk_set', 2, 4, 'Payroll Desk', 'A sticky note: "Payroll and pensions are not the same person."', false],
    ['plant', 'd_plant_small', 5, 5, 'Office Plant', 'Watered on payday.', false],
  ] },
];
/** Workstation bays: small offices or terminals attached to a system room. They are props, not rooms, and sit inside the room that owns them. */
export interface BayDef { id: string; room: RoomId; prop: string; dept: string; roles: string[]; label: string }
export const BAYS: BayDef[] = [
  { id: 'bay:accounting', room: 'finance_core', prop: 'gl', dept: 'Accounting', roles: ['accounting'], label: 'Accounting workstation' },
  { id: 'bay:ap', room: 'finance_core', prop: 'ap', dept: 'Accounts Payable', roles: ['ap_member', 'ap_manager'], label: 'AP workstation' },
  { id: 'bay:treasury_a', room: 'payment_orchestration', prop: 'treasury_ws_a', dept: 'Treasury', roles: ['treasury'], label: 'Treasury workstation A' },
  { id: 'bay:treasury_b', room: 'payment_orchestration', prop: 'treasury_ws_b', dept: 'Treasury', roles: ['treasury'], label: 'Treasury workstation B' },
  { id: 'bay:ar_a', room: 'debt_recovery', prop: 'ar_ws_a', dept: 'Accounts Receivable', roles: ['ar_member'], label: 'AR workstation A' },
  { id: 'bay:ar_b', room: 'debt_recovery', prop: 'ar_ws_b', dept: 'Accounts Receivable', roles: ['ar_manager'], label: 'AR workstation B' },
  { id: 'bay:fraud_card', room: 'card_payments', prop: 'fraud_ws', dept: 'Fraud', roles: ['fraud'], label: 'Fraud workstation (cards)' },
  { id: 'bay:fraud_agency', room: 'agency_handoff', prop: 'fraud_ws', dept: 'Fraud', roles: ['fraud'], label: 'Fraud workstation (agency)' },
];
