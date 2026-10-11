# Business-as-usual missions (17 to 20)

No outage and no attacker: a routine shift where the skill is working a checklist carefully, noticing the small thing that is off and choosing a proportionate response. All data is synthetic. Every mission has a judgement call with a plain-language explanation of each wrong answer, optional goals (right first time, shift log, time to spare) and a stretch goal (no hints). Auto and the team can play them.

| # | Mission | Shift | The thing that is off |
|---|---|---|---|
| 17 | **Opening Checks** | 07:30 to 09:00 | Event queue slightly high but falling: log and re-check, do not restart healthy consumers |
| 18 | **Payment Run Day** | 09:00 to 12:00 | One payee changed bank details this morning: hold that payment and verify by the number on file, release the rest with a second approver |
| 19 | **Month-End Close** | 16:00 to 18:00 | A £12.40 receivables difference from a duplicate refund: trace and correct it with evidence, never write it off or plug it |
| 20 | **Leavers and Joiners** | 09:30 to 12:00 | A mover kept an old approval right and a leaver's token is still live: revoke now and review its activity |

They are built with `makeBau` (`src/data/missions/bau.ts`) from a short list of checks (room, component, pass, readings, optional decision). The four missions are in `src/data/missions/bauMissions.ts`. Like every mission they are open from the start.
