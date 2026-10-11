# Identity & Access Desk: the Access Review game

Everything here is **fictional and synthetic**: people, avatars, roles, accounts, permissions, requests and the mock credentials. Nothing is real, nothing is sent anywhere, and no real person's data or likeness is used.

## Reaching it

Walk to the **Identity & Access Desk** in the Secure Operations Atrium (`prop:secure_ops.identity_desk`) and press <kbd>E</kbd>. The game pauses while the desk is open; <kbd>Esc</kbd> returns to the facility. The review keeps its own audit trail in the browser (`ledgerlock.access.v1`).

## What you do

| Tab | What happens |
|---|---|
| Requests (22) | Each request is an **Access Passport** card: a generated local avatar (synthetic seed, monogram fallback; `src/ui/avatar.ts`), ID, team, manager, environment and the reason given. You see *current* and *requested* permissions side by side, each with a plain-language explanation. |
| Service access | A form for a service identity (three briefs) with mock credentials only. Mistakes (an interactive login, broad scope, no owner, no expiry) are caught with a fix for each. |
| Access review board | Twelve existing access records (RV01-RV12). Keep, remove or add, with the reason. Removing justified access is penalised; keeping stale access is too. |
| Policy guide | The nine segregation-of-duties rules and the role cards. |
| Audit trail | Who asked, what you decided, who approved (or is asked to approve). |
| Score | Four measures with every penalty listed. |

## Roles

Accounting, Treasury, Fraud, Pensions, Payroll, AP members and manager, AR members and manager, Audit (read-only) and Service identity. Each role card lists its responsibilities, the permissions it normally needs and what it must never combine (`ROLES` in `src/data/access/catalog.ts`).

## Actions

Approve, amend (edit the permission set), reject, request more information, or escalate to an independent approver. Every action works with a **mouse drag, the keyboard (Enter/Space then arrows) and touch (tap, then choose)**; drag is never the only way.

## Policy checker and segregation of duties

The checker flags a conflict as soon as a permission set breaks a rule (`conflictsOf`): J1 prepare and approve the same journal, T1 treasury transfer, P1 payroll batch, S1 supplier change plus payment release, W1 write-off, AP1 invoice, A1 approving your own access, U1 audit with write access, V1 service identity with interactive or unrelated access. **Challenge mode** hides the checker so you have to spot them yourself.

## Scoring (per request, 0-100)

| Measure | Max | How it is scored |
|---|---|---|
| Least privilege | 40 | Each unnecessary permission costs by its risk (low, medium, high); each missing necessary permission costs 8; the wrong environment costs 10. |
| Segregation of duties | 30 | 0 if a conflict remains in the access you approve; escalating to the wrong approver (not independent) is -30, to an independent but second-best approver 18. |
| Explanation | 15 | Reasons chosen that justify the decision, minus wrong ones. No reason scores 0 (it would not pass an audit). |
| Timeliness | 15 | Within the target time 15, within double 9, otherwise 4. |

The decision type also caps the score: a poor action fit caps it at 40, an acceptable-but-not-best action at 80; rejecting something that could have been made safe is -15. Verdicts: *Sound decision*, *Partly right* or *Risky decision*, each with the rule explained and a take-away. Penalties are always visible, never silent.

## Where the code is

`src/data/access/{catalog,requests,service}.ts` (data), `src/game/systems/AccessReview.ts` (engine, no DOM), `src/ui/accessReview.ts` (view), `src/ui/avatar.ts`, tests in `tests/logic.test.ts` and `tests/e2e-access.mjs`.
