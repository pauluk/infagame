# Game overview

**Premise.** A fictional modular finance platform is run from a cut-away operations centre. You are a Secure Ops engineer. Incidents arrive as alerts; you investigate across rooms and routes, choose a response, verify it, and report. The aim is not to destroy every threat but to restore safe service with the *narrowest* fix.

**Core loop.** Alert -> read symptoms and impact -> request read-only passes as evidence justifies -> walk to rooms -> scan / lens / retrieve masked evidence -> contain (with an impact preview) -> patch / restore / reconcile / reroute -> verify (route, ledger, Fabric reporting) -> file the report -> debrief and score.

**Trade-offs.** Quarantining a room stops a spread but delays valid work on every route through it. Quarantining one route is narrower. Releasing before the fix lets held duplicates through. Rerouting keeps valid receipts flowing. Careful investigation steps never cost anything: the clock only advances while you play, dialogs pause it, and a relaxed-pace setting halves incident speed.

**HUD.** Service availability, transaction integrity, data protection, payment deadline, Fabric data freshness (with a *Demo data* / *Connected* badge), active incident count and the current objective. Every state also has text and an icon.

**Tone.** Bright, professional, small workplace jokes (log lines, sticky notes, plant descriptions). Bugs are amber, fixable "operational faults"; malware is a distinct coral, spiky, hostile visual state. There are no weapons and no instructions for building malware.

**Scoring (0-100).** 35 transaction integrity restored, 25 valid service kept available (time-weighted average), 20 diagnosis and verification, 10 privacy and containment (narrowness, no needless credential rotation, few unjustified pass requests), 10 time (slow but safe still earns 3/10).

**The Duplicate Ghost (tutorial) flow.** Incident Wall -> Payments Audit Pass -> Card Payments (scan Card Terminal, retrieve masked receipt, Forensic Lens on the Receipt Event Feed, diagnose) -> Event Trace Pass -> Event Stream Hall (replay trace) -> Ledger Read Pass -> Finance Core (masked ledger) -> quarantine only the replay path (optionally reroute valid receipts) -> patch the Settlement Notifier -> restore the Replay Buffer -> reconcile (before/after) -> release and verify the feed -> Fabric Observer Pass -> verify freshness in Fabric Data Platform -> file the report at the Evidence Board. The Evidence Board shows `card_payments -> event_stream -> finance_core -> fabric_platform`. The mission cannot be completed without the four evidence items, the diagnosis, the fix, reconciliation and both verifications.

Every tool has a working result in the tutorial: Scanner (terminal, buffer, route verification), Lens (route timeline), Quarantine (route/room with impact preview and release), Patch (notifier), Token Rotation (notifier: harmless but flagged as unnecessary), Clean Restore (replay buffer), Reconciliation Wand (ledger/AR before-and-after), Flow Rerouter (valid receipts via the Card Receipt route).

**Campaign.** Eight missions and a side-task hub share one engine and one goal: protect the fictional finance service while keeping valid payments, debt receipts and reporting accurate and available. Each mission has primary, optional and stretch objectives; five measures (transaction integrity, service availability, data protection, recovery readiness, audit quality) form Service Confidence, shown on the Control Room wall. See [campaign.md](campaign.md).
