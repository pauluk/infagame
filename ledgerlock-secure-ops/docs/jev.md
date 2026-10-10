# JEV (TypeSafe AI) in LedgerLock

JEV is TypeSafe AI's "System One" model (https://docs.typesafe.ai). It does not write text: it answers typed questions (a choice, a score or a yes/no) against a state and returns probabilities with a confidence. That fits an incident game well: a second opinion on a decision, with a measure of how sure it is.

## What it does in the game
- **Ask JEV** on any decision dialog (for example the diagnosis): JEV shows the option it leans to, its confidence and a percentage per option. It is advice only. You decide, and a wrong answer still costs nothing.
- **Teammates (Manager mode) and Auto-play**: when JEV is on, a decision goes to JEV first. A teammate acts on JEV's answer on their own only if **Auto may make the calls** *and* JEV is at least 75% sure. Otherwise they put the question in the Team panel with JEV's lean ("Not sure enough to act alone: your call"). If JEV is unreachable and Auto may decide, they use the playbook answer.
- The debrief says how many times JEV was consulted and followed. JEV never changes the rules or the score directly.

## Turning it on
- **Settings**: "JEV second opinions (AI)". The switch is disabled, with a reason, until the server has a key.
- The briefing screen and the HUD ("JEV" chip) also toggle it once the server has a key.

## Setup (server side only)
| Variable | Where | Notes |
|---|---|---|
| `TYPESAFE_API_KEY` | Vercel project > Settings > Environment Variables (Production, Preview), and a git-ignored `.env` for `npm run dev` | The only required setting. Never prefixed `VITE_`, so it can never reach the browser bundle. |
| `TYPESAFE_API_URL` | tests only | Points the proxy at a mock instead of `https://api.typesafe.ai/v1/systemone`. |

Redeploy after adding the variable.

## Architecture and safety
- Browser -> `GET/POST /api/jev` (our own endpoint) -> `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer $TYPESAFE_API_KEY`.
- `server/jevHandler.mjs` is shared by the Vercel function (`api/jev.js`) and the Vite dev/preview server. It holds the key, never logs or returns it, accepts only two fixed question templates (`decision` = a *choice* question, `supports` = a yes/no *noul* question) with size-limited text, rate-limits per IP (best effort), times out after 8 s and turns every failure into a generic error.
- What is sent: the mission's alert text, the clue and evidence names the player has found and the decision's own text. All of it is synthetic game data.
- Failure is always safe: no key, an outage or a rate limit simply means no second opinion.

## Verification status
- Unit tests cover the request shape, Bearer auth, input limits, safe errors, and the teammate confidence gate.
- `tests/e2e-jev.mjs` runs the real UI against a **local mock** of the TypeSafe endpoint.
- It has **not** been run against the live TypeSafe service (no key was available here), so response parsing follows the documented schema (`answers.<name>.choice / confidence / probabilities / noul`) but is unconfirmed live.
