# Microsoft Fabric: demo mode and optional live mode

## Demo mode (default, offline)

`DemoFabricAdapter` generates synthetic Bronze/Silver/Gold status, event counts, freshness and dashboard state. It reacts to the simulation (e.g. a paused Finance Event Mirror makes freshness rise and the dashboard go stale; replayed events appear in Bronze until the buffer is restored). The UI always shows a **Demo data** badge. Nothing is sent anywhere.

## Interface

`src/integrations/fabric/FabricDataProvider.ts` defines `FabricSnapshot` (stages, freshness, processed events, dashboard) and `FabricDataProvider { getSnapshot(ctx), isAvailable() }`. `FabricService` (`index.ts`) uses demo unless `VITE_FABRIC_MODE=live` *and* the proxy's `/api/fabric/health` says `enabled` and `configured`; any failure falls back to demo.

## Live mode (disabled by default, needs separate approval)

Live mode is for a future, approved, **read-only** connection. It is not enabled in this repository and was not tested (no tenant or credentials were available).

1. A Fabric administrator must enable the tenant setting **Service principals can use Fabric APIs** ([identity support](https://learn.microsoft.com/en-us/rest/api/fabric/articles/identity-support)) and grant an app registration read access to the workspace.
2. Copy `.env.example` to `.env` (git-ignored) and set `FABRIC_LIVE_ENABLED=true`, `FABRIC_TENANT_ID`, `FABRIC_CLIENT_ID`, `FABRIC_CLIENT_SECRET`, `FABRIC_WORKSPACE_ID`, `FABRIC_PIPELINE_ITEMS=bronze:<itemId>,silver:<itemId>,gold:<itemId>` and `VITE_FABRIC_MODE=live`.
3. Run `npm run fabric-proxy` (reads the environment; Node does not auto-load `.env`, so export the variables or use `node --env-file=.env server/fabricProxy.mjs`) and `npm run dev` (Vite proxies `/api/fabric` to `127.0.0.1:8787`).

The proxy binds to 127.0.0.1, accepts only `GET`, keeps the token in server memory, and never returns credentials. It uses exactly one Fabric endpoint, verified against current Microsoft documentation on 2026-10-10:

* **Job Scheduler - List Item Job Instances**: `GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items/{itemId}/jobs/instances` ([reference](https://learn.microsoft.com/en-us/rest/api/fabric/core/job-scheduler/list-item-job-instances)). Supports service principals; required scope `Item.Read.All` (or `Item.ReadWrite.All`, or the item-type read scope). Fields used: `status`, `startTimeUtc`, `endTimeUtc`.

Token acquisition uses the Microsoft Entra client-credentials flow with the Fabric resource's `/.default` scope (`https://api.fabric.microsoft.com/.default`), the standard convention for app-only tokens; confirm it against your tenant's setup before relying on it.

What live mode can and cannot show: job status and *freshness* (time since the last job end) per stage. It cannot supply event counts or duplicate counts (job metadata has no such fields), so those show `n/a`. The badge reads **Connected** only when real data was returned; otherwise **Demo data**. No movement or route logic depends on Fabric or any external service.
