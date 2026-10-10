import { ENV_NOTE, PERM, RISK_WEIGHT, ROLES, conflictsOf, type Env } from '../../data/access/catalog';
import { APPROVERS, INFO_ITEMS, REJECT_REASONS, REQUESTS, REQUEST_BY_ID, type AccessRequest, type Action } from '../../data/access/requests';
import { REVIEW_RECORDS, SERVICE_ACTIONS, SERVICE_BRIEFS, NO_OWNER, type ReviewRecord, type ReviewVerdict, type ServiceBrief } from '../../data/access/service';

/** Access Review rules: flags, scoring and the audit trail. Pure logic (no DOM). All people and permissions are fictional. */
const label = (id: string) => PERM[id]?.label ?? id;
const approverLabel = (id: string) => APPROVERS.find((a) => a.id === id)?.label ?? id;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export interface Flag { type: 'sod' | 'role' | 'gap' | 'env' | 'self' | 'duration' | 'vague'; text: string; perms: string[]; rule?: string }
/** What the policy checker shows beside a request: conflicts, role mismatch, a possible gap, environment and duration notes. */
export function flagsFor(req: AccessRequest, set: Iterable<string> = req.requested, env: Env = req.env): Flag[] {
  const s = [...set], role = ROLES[req.person.role], ctx = { role: req.person.role, ...req.ctx }, out: Flag[] = [];
  for (const c of conflictsOf(s, ctx)) out.push({ type: c.rule.id === 'A1' ? 'self' : 'sod', rule: c.rule.id, perms: c.perms, text: `${c.rule.id}: ${c.rule.title}. ${c.rule.why}` });
  for (const p of s) if (!role.allowed.includes(p) && !s.every((x) => x === p) && !out.some((f) => f.perms.includes(p) && f.type === 'sod')) out.push({ type: 'role', perms: [p], text: `${label(p)} is not normally part of the ${role.team} role (${role.never})` });
  for (const p of req.needs ?? []) if (!s.includes(p)) out.push({ type: 'gap', perms: [p], text: `The business reason describes work that needs "${label(p)}", which is not in the set.` });
  if (req.ideal.env !== env) out.push({ type: 'env', perms: [], text: `Environment: ${env} was requested, but the reason describes ${req.ideal.env.toLowerCase()} use. ${ENV_NOTE[env]}` });
  if (req.days === 0) out.push({ type: 'duration', perms: [], text: 'No end date or duration was given.' });
  else if (req.days > 365) out.push({ type: 'duration', perms: [], text: 'Longer than a year without a review date.' });
  if (req.reason.length < 20) out.push({ type: 'vague', perms: [], text: 'The business reason is too vague to judge.' });
  return out;
}

export interface Rationale { id: string; text: string; correct: boolean }
const DECOYS = ['Their job title is senior, so the access is probably fine.', 'Approving quickly is better than checking everything.', 'It is only temporary, so the risk does not matter.', 'Other people in the team already have it.', 'The requester asked politely and says it is urgent.'];
/** "Why?" statements for a decision: the ones that justify the best answer, mixed with plausible but wrong ones. */
export function rationaleFor(req: AccessRequest): Rationale[] {
  const i = req.ideal, role = ROLES[req.person.role], ctx = { role: req.person.role, ...req.ctx };
  const out: Rationale[] = [];
  const confl = conflictsOf(req.requested, ctx);
  const why = (p: string) => { const c = confl.find((x) => x.perms.includes(p)); return c ? `${c.rule.id}: ${c.rule.title}` : `not part of the ${role.team} role`; };
  for (const p of req.requested.filter((x) => !i.set.includes(x) && !req.current.includes(x))) out.push({ id: `rm:${p}`, text: `Remove "${label(p)}": ${why(p)}.`, correct: i.action === 'amend' });
  for (const p of req.current.filter((x) => !i.set.includes(x))) out.push({ id: `rm:${p}`, text: `Remove "${label(p)}": ${why(p)}.`, correct: i.action === 'amend' });
  for (const p of i.set.filter((x) => !req.requested.includes(x))) out.push({ id: `add:${p}`, text: `Add "${label(p)}": the business reason describes work that needs it.`, correct: true });
  if (i.env !== req.env) out.push({ id: 'env', text: `Use ${i.env}: ${ENV_NOTE[i.env]}`, correct: true });
  if (i.action === 'approve') out.push({ id: 'fits', text: 'Every permission fits the role and nothing conflicts: approving as submitted is least privilege.', correct: true });
  if (i.action === 'escalate') out.push({ id: 'esc', text: `Send it to ${approverLabel(i.escalateTo ?? 'indep_mgr')}: ${confl[0] ? confl[0].rule.safeguard : 'the amount is above the stated limit, so a second approver is required'}.`, correct: true });
  if (i.action === 'info') for (const x of i.info ?? []) out.push({ id: `info:${x}`, text: `Ask for ${INFO_ITEMS.find((q) => q.id === x)?.label.toLowerCase()}.`, correct: true });
  if (i.action === 'reject' || i.acceptable?.includes('reject')) for (const x of i.reject ?? []) out.push({ id: `rej:${x}`, text: REJECT_REASONS.find((q) => q.id === x)?.label ?? x, correct: i.action === 'reject' });
  if (!out.some((o) => o.correct)) out.push({ id: 'fits', text: 'The request fits the role, so no change is needed.', correct: true });
  const decoys = [...DECOYS].sort((a, b) => hash(req.id + a) - hash(req.id + b)).slice(0, 3).map((t, k) => ({ id: `x${k}`, text: t, correct: false }));
  return [...out, ...decoys].sort((a, b) => hash(req.id + a.id) - hash(req.id + b.id));
}

export interface Decision { action: Action; set: string[]; env: Env; rejectWhy: string[]; info: string[]; escalateTo?: string; reasons: string[]; seconds: number }
export interface Part { label: string; points: number; max: number; note: string }
export interface Result {
  score: number; verdict: 'correct' | 'partly' | 'risky'; headline: string; parts: Part[]; penalties: { text: string; points: number }[];
  right: string[]; risky: string[]; finalSet: string[]; env: Env; actionFit: 'best' | 'acceptable' | 'wrong'; teach: string; status: string;
}
const ACTION_LABEL: Record<Action, string> = { approve: 'Approve as submitted', amend: 'Amend to least privilege', reject: 'Reject', info: 'Request more information', escalate: 'Send for independent approval' };
export const actionLabel = (a: Action) => ACTION_LABEL[a];

export function evaluate(req: AccessRequest, d: Decision): Result {
  const i = req.ideal, ctx = { role: req.person.role, ...req.ctx };
  const grants = d.action === 'approve' || d.action === 'amend';
  const finalSet = d.action === 'approve' ? [...req.requested] : d.action === 'amend' ? [...new Set(d.set)] : [...req.current];
  const env = d.action === 'amend' ? d.env : req.env;
  const fit: Result['actionFit'] = d.action === i.action ? 'best' : i.acceptable?.includes(d.action) ? 'acceptable' : 'wrong';
  const right: string[] = [], risky: string[] = [], penalties: Result['penalties'] = [];
  // ---- least privilege (40)
  let lp = 40;
  const excess = grants ? finalSet.filter((p) => !i.set.includes(p)) : [];
  const missing = i.action === 'amend' || i.action === 'approve' ? i.set.filter((p) => !finalSet.includes(p) && !(grants ? false : req.current.includes(p))) : [];
  for (const p of excess) { const w = RISK_WEIGHT[PERM[p]?.risk ?? 'medium']; lp -= w; penalties.push({ text: `Unnecessary privilege: "${label(p)}" (${PERM[p]?.risk ?? 'medium'} risk) was granted but the job does not need it.`, points: -w }); risky.push(`"${label(p)}" is more access than the job needs.`); }
  for (const p of missing) { lp -= 8; penalties.push({ text: `Missing necessary access: "${label(p)}" was needed for the stated work${grants ? '' : ' and was not granted'}.`, points: -8 }); risky.push(`"${label(p)}" is needed for the work but is not in the final set.`); }
  if (grants && env !== i.env) { lp -= 10; penalties.push({ text: `Wrong environment: ${env} instead of ${i.env}.`, points: -10 }); risky.push(`${env} is the wrong environment here: ${ENV_NOTE[i.env]}`); }
  if (!excess.length && !missing.length && (!grants || env === i.env)) right.push(grants ? 'The final access set is exactly what the job needs.' : 'No unnecessary privilege was granted.');
  lp = Math.max(0, lp);
  // ---- segregation of duties (30)
  let sod = 30;
  const residual = conflictsOf(grants ? finalSet : req.requested, ctx);
  if (grants && residual.length) { sod = 0; for (const c of residual) { penalties.push({ text: `Segregation of duties: ${c.rule.id} ${c.rule.title} remains in the access you approved.`, points: -30 }); risky.push(`${c.rule.id}: ${c.rule.title}. Safeguard: ${c.rule.safeguard}`); } }
  else if (d.action === 'escalate') {
    const ok = d.escalateTo === i.escalateTo || (i.action !== 'escalate' && !!d.escalateTo && !['self', 'line_mgr'].includes(d.escalateTo));
    const independent = !!d.escalateTo && !['self', 'line_mgr'].includes(d.escalateTo);
    sod = ok ? 30 : independent ? 18 : 0;
    if (ok) right.push(`Sending it to ${approverLabel(d.escalateTo!)} is the right safeguard.`);
    else if (independent) risky.push(`${approverLabel(d.escalateTo!)} is independent, but ${approverLabel(i.escalateTo ?? 'indep_mgr')} is the better fit here.`);
    else { penalties.push({ text: `The approver you chose (${approverLabel(d.escalateTo ?? 'none')}) is not independent of the requester.`, points: -30 }); risky.push('An approver who is not independent does not fix a conflict.'); }
  } else if (!residual.length || !grants) right.push(residual.length ? 'The conflict was kept out of the final access.' : 'No segregation-of-duties conflict remains.');
  // ---- explanation (15)
  const rat = rationaleFor(req), correct = rat.filter((r) => r.correct), picked = new Set([...d.reasons, ...d.rejectWhy.map((x) => `rej:${x}`), ...d.info.map((x) => `info:${x}`)]);
  const hit = correct.filter((r) => picked.has(r.id)).length, wrong = [...picked].filter((x) => !correct.some((r) => r.id === x)).length;
  const expl = picked.size ? Math.round(15 * Math.max(0, (hit - wrong * 0.7) / Math.max(1, correct.length))) : 0;
  if (!picked.size) risky.push('No reason was given for the decision: every decision needs one for the audit trail.');
  else if (wrong) risky.push(`${wrong} of the reasons you chose do not justify the decision.`);
  else if (hit === correct.length) right.push('Your reasons cover everything that justifies the decision.');
  // ---- timeliness (15)
  const sla = req.sla, time = d.seconds <= sla ? 15 : d.seconds <= sla * 2 ? 9 : 4;
  if (time < 15) risky.push(`Decided in ${Math.round(d.seconds)}s: the target was ${sla}s. Slow reviews leave people blocked or access open.`); else right.push(`Decided within the ${sla}s target.`);
  // ---- action fit
  let score = lp + sod + expl + time;
  if (d.action === 'reject' && i.action !== 'reject' && !i.acceptable?.includes('reject')) { penalties.push({ text: 'Rejected a request that could have been made safe: the person is blocked from legitimate work.', points: -15 }); }
  if (fit === 'wrong') { score = Math.min(score, 40); risky.push(`${ACTION_LABEL[d.action]} is not the best response here. Best: ${ACTION_LABEL[i.action]}.`); }
  else if (fit === 'acceptable') { score = Math.min(score, 80); risky.push(`${ACTION_LABEL[d.action]} is acceptable, but ${ACTION_LABEL[i.action]} is better.`); }
  else right.push(`${ACTION_LABEL[d.action]} is the best response.`);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: Result['verdict'] = score >= 85 && fit === 'best' ? 'correct' : score >= 55 ? 'partly' : 'risky';
  const status = d.action === 'approve' ? 'Approved as submitted' : d.action === 'amend' ? 'Approved (amended)' : d.action === 'reject' ? 'Rejected' : d.action === 'info' ? 'Waiting for information' : `Awaiting ${approverLabel(d.escalateTo ?? 'indep_mgr')}`;
  return { score, verdict, headline: verdict === 'correct' ? 'Sound decision' : verdict === 'partly' ? 'Partly right' : 'Risky decision', parts: [
    { label: 'Least privilege', points: lp, max: 40, note: excess.length || missing.length ? 'See the penalties.' : 'Just enough access.' },
    { label: 'Segregation of duties', points: sod, max: 30, note: sod === 30 ? 'No conflict left unmanaged.' : 'A conflict was not handled safely.' },
    { label: 'Explanation', points: expl, max: 15, note: picked.size ? `${hit} of ${correct.length} justifying reasons chosen.` : 'No reason given.' },
    { label: 'Timeliness', points: time, max: 15, note: `${Math.round(d.seconds)}s of ${sla}s.` }], penalties, right, risky, finalSet, env, actionFit: fit, teach: req.teach, status };
}

// ------------------------------------------------------------------------------------------------ service access form ----
export interface ServiceForm { name: string; owner: string; purpose: string; target: string; env: Env; actions: string[]; scope: string; days: number; approver: string; reviewDays: number }
export interface Check { ok: boolean; text: string; fix: string }
export function checkService(b: ServiceBrief, f: ServiceForm): { score: number; checks: Check[] } {
  const bad = f.actions.filter((a) => !b.allowed.includes(a)), miss = b.required.filter((a) => !f.actions.includes(a));
  const checks: Check[] = [
    { ok: /^svc-[a-z0-9-]{3,}$/.test(f.name), text: 'Service name is a clear, non-personal service ID (svc-...)', fix: 'Name it svc- followed by what it does. Never a person’s name.' },
    { ok: f.owner !== NO_OWNER && !!f.owner, text: 'A named owner is accountable for the service', fix: 'Every service identity needs a named owner.' },
    { ok: f.purpose === b.purpose, text: 'Purpose states the one job the service does', fix: `The brief describes: "${b.purpose}".` },
    { ok: f.target === b.target, text: 'Target system matches the purpose', fix: `This job works with ${b.target}.` },
    { ok: f.env === b.env, text: `Environment is ${b.env}`, fix: `The brief says ${b.env}.` },
    { ok: !bad.length && !miss.length, text: 'Permitted actions are only what the purpose needs', fix: bad.length ? `Remove: ${bad.map((a) => SERVICE_ACTIONS.find((x) => x.id === a)?.label).join(', ')}.` : `Add: ${miss.map((a) => SERVICE_ACTIONS.find((x) => x.id === a)?.label).join(', ')}.` },
    { ok: !f.actions.includes('svc.interactive'), text: 'No interactive login: nobody can sign in as the service', fix: 'A service identity is non-interactive.' },
    { ok: f.scope === b.scope, text: 'Data scope is the narrowest that works', fix: `Use "${b.scope}".` },
    { ok: f.days > 0 && f.days <= b.maxDays, text: `Expiry is set and no more than ${b.maxDays} days away`, fix: `Choose an expiry between 1 and ${b.maxDays} days.` },
    { ok: !!f.approver && f.approver !== 'The service owner (same person)' && f.approver !== 'Nobody: auto-approve', text: 'Approver is independent of the owner', fix: 'The owner cannot approve their own service. Choose an independent manager or the system owner.' },
    { ok: f.reviewDays > 0 && f.reviewDays < f.days, text: 'A review date comes before the expiry', fix: 'Set a review date earlier than the expiry.' },
  ];
  return { score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100), checks };
}

// ------------------------------------------------------------------------------------------------ access review board ----
export interface ReviewDecision { verdict: ReviewVerdict; addPerm?: string }
export function evaluateReview(r: ReviewRecord, d: ReviewDecision): { points: number; ok: boolean; text: string; penalty?: string } {
  if (d.verdict === r.ideal && (r.ideal !== 'add' || d.addPerm === r.addPerm)) return { points: 100, ok: true, text: r.note + ' ' + r.why };
  if (d.verdict === 'add' && r.ideal === 'add') return { points: 40, ok: false, text: `Right idea, wrong permission: the missing least-privilege permission is "${label(r.addPerm!)}". ${r.why}` };
  if (d.verdict === 'independent' && r.ideal === 'remove') return { points: 60, ok: false, text: `Sending it for independent review is safe but slow: the evidence already justifies removal. ${r.why}` };
  if (d.verdict === 'keep' && r.ideal !== 'keep') return { points: 0, ok: false, text: `Keeping it leaves ${r.issue} access in place. ${r.why}`, penalty: `Left ${r.issue} access (${label(r.perm)}) in place for ${r.who.name}.` };
  if (d.verdict === 'remove' && r.ideal === 'keep') return { points: 0, ok: false, text: `Removing it would stop legitimate work. ${r.why}`, penalty: `Removed justified access (${label(r.perm)}) from ${r.who.name}.` };
  return { points: 30, ok: false, text: `Not the best response. Expected: ${r.ideal === 'independent' ? 'send for independent review' : r.ideal}. ${r.why}` };
}

// ------------------------------------------------------------------------------------------------ session, audit trail, persistence ----
export interface AuditEntry { n: number; t: string; kind: 'request' | 'service' | 'review'; subject: string; requestedBy: string; decision: string; approvedBy: string; detail: string; score: number }
const KEY = 'ledgerlock.access.v1';

export class AccessSession {
  decisions: Record<string, { d: Decision; r: Result }> = {};
  services: Record<string, { f: ServiceForm; score: number }> = {};
  reviews: Record<string, { d: ReviewDecision; points: number; ok: boolean; penalty?: string }> = {};
  audit: AuditEntry[] = [];
  private n = 0;
  readonly started = Date.now();
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    try { const raw = storage?.getItem(KEY); if (raw) { const j = JSON.parse(raw); if (Array.isArray(j.audit)) { this.audit = j.audit.slice(-60); this.n = this.audit.reduce((m: number, a: AuditEntry) => Math.max(m, a.n), 0); } } } catch { /* ignore */ }
  }
  private clock() { const m = 9 * 60 + Math.floor((Date.now() - this.started) / 60000) + this.n; return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  private save() { try { this.storage?.setItem(KEY, JSON.stringify({ audit: this.audit.slice(-60) })); } catch { /* storage unavailable */ } }
  private log(e: Omit<AuditEntry, 'n' | 't'>) { this.audit.push({ ...e, n: ++this.n, t: this.clock() }); this.save(); }

  decide(req: AccessRequest, d: Decision): Result {
    const r = evaluate(req, d); this.decisions[req.id] = { d, r };
    const set = r.finalSet.map((p) => label(p)).join(', ') || 'no access';
    this.log({ kind: 'request', subject: `${req.id} ${req.person.name} (${req.person.team}) · ${req.env}`, requestedBy: req.person.name, decision: r.status, approvedBy: d.action === 'approve' || d.action === 'amend' ? 'You (Access Reviewer)' : d.action === 'escalate' ? 'Pending: ' + approverLabel(d.escalateTo ?? '') : 'Not approved', detail: `Final access: ${set}. ${ACTION_LABEL[d.action]}.`, score: r.score });
    return r;
  }
  submitService(b: ServiceBrief, f: ServiceForm) {
    const res = checkService(b, f); this.services[b.id] = { f, score: res.score };
    this.log({ kind: 'service', subject: `${b.id} ${f.name || '(unnamed service)'} · ${f.env}`, requestedBy: f.owner, decision: res.score === 100 ? 'Approved' : 'Returned for changes', approvedBy: res.score === 100 ? f.approver : 'Not approved', detail: `${res.checks.filter((c) => c.ok).length} of ${res.checks.length} checks passed.`, score: res.score });
    return res;
  }
  review(r: ReviewRecord, d: ReviewDecision) {
    const res = evaluateReview(r, d); this.reviews[r.id] = { d, points: res.points, ok: res.ok, penalty: res.penalty };
    this.log({ kind: 'review', subject: `${r.id} ${r.who.name} · ${label(r.perm)}`, requestedBy: r.requestedBy, decision: d.verdict === 'keep' ? 'Kept' : d.verdict === 'remove' ? 'Removed' : d.verdict === 'add' ? `Added ${label(d.addPerm ?? '')}` : 'Sent for independent review', approvedBy: r.approvedBy ?? 'nobody (never approved)', detail: res.text, score: res.points });
    return res;
  }

  /** Overall score with visible reasons. High-risk access left unreviewed is penalised, not hidden. */
  summary() {
    const reqs = REQUESTS.map((q) => this.decisions[q.id]), done = reqs.filter(Boolean) as { d: Decision; r: Result }[];
    const parts = { lp: 0, sod: 0, expl: 0, time: 0 };
    for (const x of done) { parts.lp += x.r.parts[0].points; parts.sod += x.r.parts[1].points; parts.expl += x.r.parts[2].points; parts.time += x.r.parts[3].points; }
    const n = Math.max(1, done.length);
    const per = (v: number, max: number) => Math.round((v / n / max) * 100);
    const penalties: { text: string; points: number }[] = [];
    const unreviewedReq = REQUESTS.filter((q) => !this.decisions[q.id] && q.requested.some((p) => PERM[p]?.risk === 'high'));
    if (unreviewedReq.length) penalties.push({ text: `${unreviewedReq.length} request(s) with high-risk permissions were never reviewed: ${unreviewedReq.map((q) => q.id).join(', ')}.`, points: -Math.min(20, unreviewedReq.length * 3) });
    const unreviewedRec = REVIEW_RECORDS.filter((r) => !this.reviews[r.id] && r.ideal !== 'keep' && PERM[r.perm]?.risk === 'high');
    if (unreviewedRec.length && Object.keys(this.reviews).length) penalties.push({ text: `${unreviewedRec.length} high-risk access record(s) were left unreviewed: ${unreviewedRec.map((r) => r.id).join(', ')}.`, points: -Math.min(15, unreviewedRec.length * 3) });
    for (const r of Object.values(this.reviews)) if (r.penalty) penalties.push({ text: r.penalty, points: -5 });
    const avgReq = done.length ? done.reduce((a, x) => a + x.r.score, 0) / done.length : 0;
    const avgSvc = Object.values(this.services).length ? Object.values(this.services).reduce((a, x) => a + x.score, 0) / Object.values(this.services).length : null;
    const avgRev = Object.values(this.reviews).length ? Object.values(this.reviews).reduce((a, x) => a + x.points, 0) / Object.values(this.reviews).length : null;
    const comps = [done.length ? avgReq : null, avgSvc, avgRev].filter((x): x is number => x !== null);
    const base = comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : 0;
    const total = Math.max(0, Math.min(100, Math.round(base + penalties.reduce((a, p) => a + p.points, 0))));
    return { total, requests: done.length, of: REQUESTS.length, byPart: { 'Least privilege': per(parts.lp, 40), 'Segregation of duties': per(parts.sod, 30), Explanations: per(parts.expl, 15), Timeliness: per(parts.time, 15) }, penalties, services: Object.keys(this.services).length, reviews: Object.keys(this.reviews).length };
  }
}
export { REQUESTS, REQUEST_BY_ID, REVIEW_RECORDS, SERVICE_BRIEFS };
