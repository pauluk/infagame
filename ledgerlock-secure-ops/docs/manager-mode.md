# Manager mode: questions, actions, decisions, resource and effort

You manage the team by **asking**, **ordering** and **deciding**; the resource and effort of every choice is visible before and after.

* **Effort** (100 per shift for the team): every action has a base cost (scan 4, lens 6, patch 9, restore 9, reconcile 8, token rotation 8, quarantine 10, reroute 8, pass 3, record 3, report 5; walking costs a little). A specialist does their own work at base cost; anyone else pays 1.5x, rounded up. Cost lines sit on every suggest, send and read button, and the Team panel shows the budget.
* **Focus** per teammate: it falls as they work. At 35 they are *Tired* (work takes 1.5x as long); at 8 they are *Exhausted*. **Break** sends them to rest until 75; idle teammates recover slowly. A member on Auto takes their own break when focus drops below 15.
* **Questions** (Ask buttons): *Status*, *What do you recommend?*, *What is blocking you?*, *How are you feeling?* Answers are plain-language and use real state.
* **Decisions**: when a teammate reaches a choice they post it as *Needs your call* and wait, unless you ticked *Let the team make the calls* (they then pick the best-practice answer, and may ask JEV for a second opinion if it is on; see `docs/jev.md`).
* **Debrief** shows team effort, breaks, orders, Auto actions and JEV use. Stretch goals are not counted if Auto did any work.

Code: `src/game/systems/Team.ts` (`effortCost`, `fatigueOf`, `quote`, `question`, `rest`), `src/ui/teamPanel.ts`. Tests: the *manager mode* describe block in `tests/logic.test.ts` and `tests/e2e-team.mjs`.

## Auto keeps going

* **Auto makes the calls by default.** A member on Auto answers choices and confirmations with the best-practice option (untick *Auto makes the calls* in Settings or the Team panel to be asked instead).
* **Popups are closed for you.** While Auto is on and you have not touched the mouse or keyboard for a moment, informational popups (alerts, goals, results) close after a second or so, and choices and confirmations are answered. A toast says what was done. Anything you click yourself is never overridden.
* **Auto-run** (Settings, *Auto keeps going*; switched on automatically the first time you use Auto): Auto stays on from one mission to the next. The briefing continues after 5 seconds and the debrief moves to the next mission after 10, with a visible countdown. Any click or key press cancels it, and taking over your avatar switches your own Auto off.
* **Watchdog.** If nothing has advanced for 40 game seconds, everyone forgets old failures and tries again (the log says so).
