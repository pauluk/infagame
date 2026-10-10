// Optional, DISABLED-BY-DEFAULT server-side adapter for a future, separately approved Microsoft Fabric connection.
//   FABRIC_LIVE_ENABLED=true node server/fabricProxy.mjs        (or: npm run fabric-proxy)
//
// * Holds all credentials (read from environment variables only); the browser never sees tokens or secrets.
// * Makes READ-ONLY GET calls to ONE documented Fabric REST endpoint:
//     Job Scheduler - List Item Job Instances
//     GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items/{itemId}/jobs/instances
//     https://learn.microsoft.com/en-us/rest/api/fabric/core/job-scheduler/list-item-job-instances  (verified 2026-10-10;
//     supports service principals; needs Item.Read.All or Item.ReadWrite.All, or the specific item-type read scope)
// * Token acquisition: Microsoft Entra client-credentials flow for the Fabric resource scope.
//   A Fabric admin must enable the tenant setting "Service principals can use Fabric APIs":
//     https://learn.microsoft.com/en-us/rest/api/fabric/articles/identity-support
// * Binds to 127.0.0.1 only. No endpoint accepts input that changes anything.
// If it is not enabled/configured, /health says so and the game stays in "Demo data" mode.
import http from 'node:http';

const env = process.env;
const enabled = env.FABRIC_LIVE_ENABLED === 'true';
const tenant = env.FABRIC_TENANT_ID, clientId = env.FABRIC_CLIENT_ID, secret = env.FABRIC_CLIENT_SECRET, workspace = env.FABRIC_WORKSPACE_ID;
const items = (env.FABRIC_PIPELINE_ITEMS || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [label, id] = s.split(':'); return { label, id }; });
const configured = Boolean(tenant && clientId && secret && workspace && items.length) && ![tenant, clientId, secret, workspace].some((v) => /^0{8}-|replace-me/.test(v || ''));
const port = Number(env.FABRIC_PROXY_PORT || 8787);
const GUID = /^[0-9a-fA-F-]{36}$/;

let token = null;   // { value, exp }
async function getToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const body = new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials', scope: 'https://api.fabric.microsoft.com/.default' });
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!r.ok) throw new Error(`token request failed (${r.status})`);
  const j = await r.json();
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function latestRun(itemId) {
  if (!GUID.test(workspace) || !GUID.test(itemId)) throw new Error('configured IDs must be GUIDs');
  const r = await fetch(`https://api.fabric.microsoft.com/v1/workspaces/${workspace}/items/${itemId}/jobs/instances`, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (!r.ok) throw new Error(`Fabric returned ${r.status}`);
  const j = await r.json();
  const runs = (j.value || []).slice().sort((a, b) => String(b.startTimeUtc).localeCompare(String(a.startTimeUtc)));
  return runs[0] || null;
}

const toIso = (t) => (t ? (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z') : null);
async function snapshot() {
  const stages = [];
  for (const it of items) {
    const run = await latestRun(it.id).catch(() => null);
    const end = toIso(run?.endTimeUtc || run?.startTimeUtc);
    const freshness = end ? Math.max(0, Math.round((Date.now() - Date.parse(end)) / 6000) / 10) : null;
    const id = ['bronze', 'silver', 'gold'].includes(it.label) ? it.label : null;
    if (!id) continue;
    stages.push({ id, name: id[0].toUpperCase() + id.slice(1) + ' pipeline', status: !run ? 'unknown' : run.status === 'Failed' ? 'stale' : run.status === 'Completed' || run.status === 'InProgress' ? 'healthy' : 'delayed', eventCount: null, freshnessMin: freshness, lastRun: end, note: run ? `Last job: ${run.status}` : 'No job instances found' });
  }
  const worst = Math.max(0, ...stages.map((s) => s.freshnessMin ?? 0));
  const bad = stages.some((s) => s.status === 'stale');
  return {
    mode: 'connected', label: 'Connected', asOf: new Date().toISOString(), stages, freshnessMin: worst, processedEvents: null, duplicatesInBronze: null,
    dashboard: { name: 'Reporting (pipeline status only)', status: bad ? 'attention' : stages.length ? 'healthy' : 'unknown', lastRefresh: stages[stages.length - 1]?.lastRun ?? null, note: 'Event counts are not available from job metadata.' },
    notes: ['Read-only job-instance metadata from the approved Fabric workspace.'],
  };
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method !== 'GET') return send(405, { error: 'read-only' });
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/fabric/health') return send(200, { enabled, configured });
  if (path === '/api/fabric/snapshot') {
    if (!enabled || !configured) return send(503, { error: 'Live Fabric mode is not enabled/configured. The game uses demo data.' });
    try { return send(200, await snapshot()); } catch (e) { return send(502, { error: 'Fabric request failed' }); }
  }
  send(404, { error: 'not found' });
});
server.listen(port, '127.0.0.1', () => console.log(`Fabric proxy on http://127.0.0.1:${port} (enabled=${enabled}, configured=${configured}). Browser never receives credentials.`));
