import type { GameState } from '../game/systems/GameState';
import type { ToolId } from '../game/types';
import { propTarget, readerTarget, roomTarget, routeTarget } from './targets';

/** Tutorial-mode coaching for a guided step: where to look, which tool to use and why it matters. */
export interface CoachEntry {
  target?: string | string[] | ((s: GameState) => string | string[] | null);
  tool?: ToolId;
  why: string;
}
const FEED = routeTarget('receipt_event_feed');
const R = (room: string, side: string) => readerTarget(`door:${room}.${side}`);

/** Coaching for The Duplicate Ghost, keyed by objective id. Other missions fall back to the objective's own hint. */
export const COACH: Record<string, Record<string, CoachEntry>> = {
  'duplicate-ghost': {
    o_brief: { target: propTarget('secure_ops', 'incident_wall'), why: 'Every shift starts by reading the alert. It tells you what is wrong, how serious it is and which room to look at first.' },
    o_pass1: { target: propTarget('secure_ops', 'access_desk'), why: 'You only hold an Ops Pass. Rooms hold sensitive (masked) data, so you request a read-only, mission-scoped pass only when evidence points at a room. That is least privilege.' },
    o_card: { target: roomTarget('card_payments'), why: 'Follow the corridors (click the room on the minimap for a guide). Locked rooms never block the corridors, and your pass opens the door.' },
    o_scan: { target: propTarget('card_payments', 'card_terminal'), tool: 'scanner', why: 'The Signal Scanner is safe and costs nothing. Scanning first tells you what is broken and, just as useful, what is healthy.' },
    o_receipt: { target: propTarget('card_payments', 'receipt_log'), why: 'Evidence is retrieved from the room itself and is masked: you see enough to investigate without seeing real card data.' },
    o_lens: { target: FEED, tool: 'lens', why: 'The Forensic Lens shows the order of events. Click the flow line (or stand near it) to see where the repeat started and why.' },
    o_diag: { why: 'Diagnose before you act. The evidence shows a timeout-triggered retry (a software bug), not malware or a leaked credential. A wrong answer here costs nothing.' },
    o_pass2: { target: R('event_stream', 's'), why: 'The clue now points at the Event Stream Hall. Use a door reader: it shows the pass, its scope, and lets you request it.' },
    o_trace: { target: propTarget('event_stream', 'replay_console'), why: 'The replay trace confirms the same receipt event was delivered more than once and shows which consumer posts it to the ledger.' },
    o_pass3: { target: R('finance_core', 'n'), why: 'The trace suggests a possible duplicate posting, which lives in the ledger. Request the Ledger Read Pass for masked ledger data.' },
    o_ledger: { target: propTarget('finance_core', 'gl'), why: 'Checking the masked ledger tells you whether a duplicate has already posted, which decides how urgent containment is.' },
    o_contain: { target: FEED, tool: 'quarantine', why: 'Contain only the replay path. The preview tells you the cost before you commit: valid receipts queue (not lost), and every other route keeps running. The narrowest safe fix scores best.' },
    o_patch: { target: propTarget('card_payments', 'notifier'), tool: 'patch', why: 'The Patch Kit fixes the cause (a retry without an idempotency key). It needs a diagnosis first.' },
    o_restore: { target: propTarget('event_stream', 'replay_buffer'), tool: 'restore', why: 'Replays already inside the stream must be removed. Restoring the buffer to a clean checkpoint keeps valid receipts (they are replayed from the card journal).' },
    o_recon: { target: propTarget('finance_core', 'ar'), tool: 'recon', why: 'The Reconciliation Wand compares expected receipts, received events and ledger postings, and shows a clear before-and-after.' },
    o_release: { target: FEED, tool: 'quarantine', why: 'Release the containment only once the cause is fixed and cleaned, then scan the route (tool 1) to prove valid receipts flow and no duplicate remains.' },
    o_fabric: { target: (s) => (s.passes.has('fabric_observer_pass') ? propTarget('fabric_platform', 'pipeline_display') : R('fabric_platform', 's')), why: 'Reporting must match the ledger too. Verify freshness and the dashboard in the Fabric room (demo data).' },
    o_report: { target: propTarget('secure_ops', 'evidence_board'), why: 'File the report on the Evidence Board. It shows the evidence path from Card Payments to Fabric, and it is what the debrief is built from.' },
  },
};
