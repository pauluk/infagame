// Server-side adapter for JEV (TypeSafe AI "System One" model). Shared by the Vercel function (api/jev.js) and the Vite dev/preview server.
//
// * The API key is read from the environment variable TYPESAFE_API_KEY on the SERVER only. It is never sent to the browser,
//   never logged, and never echoed in a response.
// * This is NOT an open proxy: the browser can only ask for the two question templates below (a choice and a yes/no check),
//   with size-limited text. Nothing the browser sends is forwarded as a raw request.
// * Endpoint, headers and field names follow the TypeSafe docs (POST https://api.typesafe.ai/v1/systemone, Bearer auth,
//   body { state, model, questions }, answers keyed by question name): https://docs.typesafe.ai/api.md
// * JEV is advisory: the game's rules never depend on it, and every failure just means "no second opinion".
const DEFAULT_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const LIMITS = { text: 1800, context: 4000, options: 6, label: 240 };
const hits = new Map();                                    // best-effort per-IP limiter (serverless instances are short-lived)

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const rateLimited = (ip) => {
  const now = Date.now(), win = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  win.push(now); hits.set(ip, win);
  if (hits.size > 500) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 250) break; }
  return win.length > 30;
};

/** Builds the upstream request for one of the allowed templates, or returns an error string. */
export function buildRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'bad_request' };
  const context = clip(body.context, LIMITS.context);
  if (body.kind === 'decision') {
    const opts = Array.isArray(body.options) ? body.options.slice(0, LIMITS.options) : [];
    if (opts.length < 2 || opts.some((o) => !o || typeof o.id !== 'string')) return { error: 'bad_request' };
    const criteria = Object.fromEntries(opts.map((o) => [clip(o.id, 40), `${clip(o.label, LIMITS.label)}: ${clip(o.detail, LIMITS.label)}`]));
    return {
      payload: {
        model: MODEL,
        state: `A fictional finance-operations incident (all data is synthetic).\n\nEVIDENCE SO FAR:\n${context || '(none yet)'}\n\nDECISION: ${clip(body.title, 200)}\n${clip(body.body, LIMITS.text)}`,
        questions: { best: { type: 'choice', instructions: 'Which option is the best-practice response? Prefer the narrowest safe action that the evidence supports, least privilege, and keeping valid services running.', criteria } },
      },
      pick: (a) => ({ choice: a.best?.choice, confidence: a.best?.confidence, probabilities: a.best?.probabilities }),
    };
  }
  if (body.kind === 'supports') {
    const claim = clip(body.claim, 400);
    if (!claim) return { error: 'bad_request' };
    return {
      payload: {
        model: MODEL,
        state: `A fictional finance-operations incident (all data is synthetic).\n\nEVIDENCE:\n${context || '(none)'}`,
        questions: { supported: { type: 'noul', instructions: `Does the evidence support this statement? "${claim}"` } },
      },
      pick: (a) => ({ supported: a.supported?.noul }),
    };
  }
  return { error: 'bad_request' };
}

/**
 * @param {{ method: string, body?: unknown, ip?: string, env?: Record<string,string|undefined>, fetchImpl?: typeof fetch }} req
 * @returns {Promise<{ status: number, json: object }>}
 */
export async function handleJev({ method, body, ip = 'unknown', env = process.env, fetchImpl = fetch }) {
  const key = env.TYPESAFE_API_KEY, ready = Boolean(key && key.trim() && !/^replace-me$/i.test(key.trim()));
  if (method === 'GET') return { status: 200, json: { configured: ready, model: MODEL } };
  if (method !== 'POST') return { status: 405, json: { error: 'method_not_allowed' } };
  if (!ready) return { status: 503, json: { error: 'not_configured' } };
  if (rateLimited(ip)) return { status: 429, json: { error: 'rate_limited' } };
  const built = buildRequest(body);
  if (built.error) return { status: 400, json: { error: built.error } };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetchImpl(env.TYPESAFE_API_URL || DEFAULT_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(built.payload),
    });
    if (!r.ok) return { status: r.status === 429 || r.status === 529 ? 429 : 502, json: { error: r.status === 401 ? 'key_rejected' : 'upstream_error' } };
    const j = await r.json();
    return { status: 200, json: { ...built.pick(j.answers ?? {}), model: j.model } };
  } catch {
    return { status: 502, json: { error: 'unreachable' } };
  } finally { clearTimeout(timer); }
}
