import type { ToolDef, ToolId } from '../game/types';

export const TOOLS: ToolDef[] = [
  { id: 'scanner', key: 1, name: 'Signal Scanner', icon: '◎', sprite: 'tool_scanner', short: 'Scan', blurb: 'Highlights suspicious or broken components and routes.', why: 'Safe and non-disruptive. Use it first to see what needs a closer look.' },
  { id: 'lens', key: 2, name: 'Forensic Lens', icon: '⌕', sprite: 'tool_lens', short: 'Lens', blurb: 'Reveals clues and the order of events.', why: 'Safe. Tells you what happened, in order, so you can choose the narrowest fix.' },
  { id: 'quarantine', key: 3, name: 'Quarantine Field', icon: '▣', sprite: 'tool_quarantine', short: 'Contain', blurb: 'Isolates one selected room or route. Use again to release.', why: 'Stops an issue spreading, but can delay valid work. Choose the smallest area that works.' },
  { id: 'patch', key: 4, name: 'Patch Kit', icon: '⚒', sprite: 'tool_patch', short: 'Patch', blurb: 'Applies a fix after the fault has been diagnosed.', why: 'Fixes the cause of a software bug. Needs a diagnosis first.' },
  { id: 'token', key: 5, name: 'Token Rotation Tool', icon: '↻', sprite: 'tool_token', short: 'Rotate', blurb: 'Refreshes a simulated service credential.', why: 'For suspected credential exposure. Briefly interrupts whatever uses that credential.' },
  { id: 'restore', key: 6, name: 'Clean Restore Beacon', icon: '✓', sprite: 'tool_restore', short: 'Restore', blurb: 'Restores a simulated system to a verified clean checkpoint.', why: 'Removes bad state. Valid items after the checkpoint are replayed from journals.' },
  { id: 'recon', key: 7, name: 'Reconciliation Wand', icon: '≡', sprite: 'tool_recon', short: 'Reconcile', blurb: 'Compares expected and received totals.', why: 'Proves whether totals agree and corrects any variance with a journal.' },
  { id: 'reroute', key: 8, name: 'Flow Rerouter', icon: '⇄', sprite: 'tool_reroute', short: 'Reroute', blurb: 'Sends legitimate traffic along an alternate route.', why: 'Keeps valid work moving while a route stays contained.' },
];
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;
