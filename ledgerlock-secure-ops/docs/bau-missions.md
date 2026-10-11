# Business-as-usual missions (17 to 25)

No outage and no attacker: a routine shift where the skill is working a checklist carefully, noticing the small thing that is off and choosing a proportionate response. All data is synthetic. Every mission has a judgement call with a plain-language explanation of each wrong answer, optional goals (right first time, shift log, time to spare) and a stretch goal (no hints). Auto and the team can play them.

| # | Mission | Shift | The thing that is off |
|---|---|---|---|
| 17 | **Opening Checks** | 07:30 to 09:00 | Event queue slightly high but falling: log and re-check, do not restart healthy consumers |
| 18 | **Payment Run Day** | 09:00 to 12:00 | One payee changed bank details this morning: hold that payment and verify by the number on file, release the rest with a second approver |
| 19 | **Month-End Close** | 16:00 to 18:00 | A £12.40 receivables difference from a duplicate refund: trace and correct it with evidence, never write it off or plug it |
| 20 | **Leavers and Joiners** | 09:30 to 12:00 | A mover kept an old approval right and a leaver's token is still live: revoke now and review its activity |
| 21 | **Daily Bank Reconciliation** | 08:30 to 11:00 | A £3,250 receipt matches no single invoice: hold as unallocated with an owner, do not guess or park it in suspense |
| 22 | **Card Chargeback Review** | 10:00 to 12:30 | Disputes cluster on one merchant: respond with evidence and a targeted check, not a blanket block |
| 23 | **Supplier Onboarding** | 09:00 to 11:30 | New supplier's bank details came by email: verify with a call-back on a number you found yourself |
| 24 | **Certificate Watch** | 09:00 to 11:00 | A bank link certificate expires in 12 days: renew in today's window and set a reminder |
| 25 | **Agency Placement** | 13:00 to 16:00 | The debt export carries unapproved personal fields: regenerate from the approved template |

They are built with `makeBau` (`src/data/missions/bau.ts`) from a short list of checks (room, component, pass, readings, optional decision). The four missions are in `src/data/missions/bauMissions.ts`. Like every mission they are open from the start.
