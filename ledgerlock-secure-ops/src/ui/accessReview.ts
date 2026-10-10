import type { Tone } from '../game/types';
import { ENVS, ENV_NOTE, PERM, ROLES, SOD_RULES, type Env } from '../data/access/catalog';
import { APPROVERS, INFO_ITEMS, REJECT_REASONS, REQUESTS, type AccessRequest, type Action } from '../data/access/requests';
import { NO_OWNER, OWNERS, REVIEW_RECORDS, SCOPES, SERVICE_ACTIONS, SERVICE_APPROVERS, SERVICE_BRIEFS, TARGETS, type ReviewVerdict } from '../data/access/service';
import { AccessSession, actionLabel, flagsFor, rationaleFor, type Decision, type Result, type ServiceForm } from '../game/systems/AccessReview';
import { sfx } from '../game/systems/Sfx';
import { $, $$, esc } from './dom';
import { enableDrag } from './dragkit';
import { avatarSvg } from './avatar';

export interface AccessHost { toast(html: string, tone?: Tone): void; pause(): void; resume(): void }
type Tab = 'requests' | 'service' | 'board' | 'policy' | 'audit' | 'score';
interface Work { grant: Set<string>; env: Env; action: Action | null; rejectWhy: Set<string>; info: Set<string>; escalateTo: string; reasons: Set<string>; openedAt: number }
const RISK_ICON = { high: '▲ High risk', medium: '◆ Medium risk', low: '● Low risk' } as const;
const STATUS_ICON = { correct: '✓', partly: '◐', risky: '✕' } as const;

/** One session lives for the page: decisions, the audit trail and the score carry on between visits to the desk. */
const session = new AccessSession();

/** Identity & Access Desk: the Access Review mini-game (fictional staff, permissions and approvals). */
export class AccessReviewView {
  private box: HTMLElement | null = null;
  isOpen = false;
  private tab: Tab = 'requests';
  private reqId = REQUESTS[0].id;
  private work: Record<string, Work> = {};
  private checker = true;
  private svcId = SERVICE_BRIEFS[0].id;
  private svcForm: Record<string, ServiceForm> = {};
  private svcResult: Record<string, ReturnType<AccessSession['submitService']>> = {};
  private recId = REVIEW_RECORDS[0].id;
  private addPick: Record<string, string> = {};
  private recResult: Record<string, ReturnType<AccessSession['review']>> = {};
  private live = '';
  private focusKey = '';

  constructor(private root: HTMLElement, private host: AccessHost) {}

  open(tab: Tab = 'requests'): void {
    this.tab = tab;
    if (!this.isOpen) {
      this.isOpen = true; this.host.pause();
      this.box = document.createElement('div'); this.box.id = 'access'; this.box.className = 'bp ar';
      this.box.addEventListener('click', (e) => this.onClick(e));
      this.box.addEventListener('change', (e) => this.onChange(e));
      this.box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } else e.stopPropagation(); });
      this.root.appendChild(this.box);
      enableDrag(this.box, { handle: '.pcard', drop: '.zone', end: (h, t) => { if (t) this.moveCard(h.dataset.perm!, t.dataset.zone as 'grant' | 'deny'); } });
    }
    this.render();
  }
  close(): void { if (!this.isOpen) return; this.isOpen = false; this.box?.remove(); this.box = null; this.host.resume(); }

  private get req(): AccessRequest { return REQUESTS.find((r) => r.id === this.reqId)!; }
  private w(id = this.reqId): Work {
    return (this.work[id] ??= { grant: new Set(REQUESTS.find((r) => r.id === id)!.requested), env: REQUESTS.find((r) => r.id === id)!.env, action: null, rejectWhy: new Set(), info: new Set(), escalateTo: 'indep_mgr', reasons: new Set(), openedAt: Date.now() });
  }

  // ---------------------------------------------------------------- render ----
  private render(): void {
    if (!this.box) return;
    const sum = session.summary();
    const tabs: [Tab, string][] = [['requests', 'Access requests'], ['service', 'Service access form'], ['board', 'Access review board'], ['policy', 'Policy guide'], ['audit', 'Audit trail'], ['score', 'Score']];
    const body = this.tab === 'requests' ? this.requestsHtml() : this.tab === 'service' ? this.serviceHtml() : this.tab === 'board' ? this.boardHtml() : this.tab === 'policy' ? this.policyHtml() : this.tab === 'audit' ? this.auditHtml() : this.scoreHtml();
    this.box.innerHTML = `<div class="bp-head"><h2>Identity &amp; Access Desk <small class="muted">Access Review (game simulation: fictional staff, permissions and approvals only)</small></h2>
      <div class="bp-stats"><span>Score <b>${sum.total}</b></span><span>Requests <b>${sum.requests}/${sum.of}</b></span><span>Service forms <b>${sum.services}</b></span><span>Reviews <b>${sum.reviews}</b></span></div>
      <div class="bp-head-btns"><button class="primary" data-a="close" aria-label="Close the desk">Close ✕</button></div></div>
      <div class="bp-tabs" role="tablist" aria-label="Sections">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${this.tab === t}" data-tab="${t}">${l}</button>`).join('')}</div>
      <div class="ar-body">${body}</div><div class="sr-only" role="status" aria-live="polite">${esc(this.live)}</div>`;
    this.live = '';
    if (this.focusKey) ($(this.box, this.focusKey) as HTMLElement | null)?.focus();
  }

  private chip(t: string, c = '') { return `<span class="chip ${c}">${t}</span>`; }

  // ---------------------------------------------------------------- requests ----
  private requestsHtml(): string {
    const queue = REQUESTS.map((r) => { const d = session.decisions[r.id]; return `<button class="qitem${r.id === this.reqId ? ' on' : ''}" data-req="${r.id}" aria-pressed="${r.id === this.reqId}"><span class="av">${avatarSvg(r.person.seed, r.person.name, 34)}</span><span><b>${esc(r.person.name)}</b><small>${esc(r.id)} · ${esc(r.person.team)}</small></span><span class="env ${r.env.toLowerCase()}">${r.env[0]}</span>${d ? `<span class="done ${d.r.verdict}" title="${esc(d.r.headline)}">${STATUS_ICON[d.r.verdict]}</span>` : ''}</button>`; }).join('');
    return `<nav class="ar-queue" aria-label="Request queue"><small class="muted">${REQUESTS.length} requests. Env: T = Training, T = Test, P = Production (colour and letter).</small>${queue}</nav><section class="ar-main">${this.reviewHtml()}</section>`;
  }

  private permCard(id: string, zone: 'grant' | 'deny', r: AccessRequest, conflict: Set<string>, locked: boolean): string {
    const p = PERM[id], cur = r.current.includes(id), req = r.requested.includes(id);
    const tag = cur ? '<span class="tag cur">Has now</span>' : req ? '<span class="tag add">＋ Requested</span>' : '<span class="tag opt">Available</span>';
    return `<button class="pcard risk-${p.risk}${conflict.has(id) ? ' conflict' : ''}" data-perm="${id}" data-zone="${zone}" ${locked ? 'disabled' : ''} aria-label="${esc(p.label)}. ${RISK_ICON[p.risk]}. ${esc(p.what)} ${zone === 'grant' ? 'Granted. Press to move to Not granted.' : 'Not granted. Press to grant.'}">
      <span class="pc-top"><b>${esc(p.label)}</b>${tag}</span><span class="pc-chips"><span class="chip risk-${p.risk}">${RISK_ICON[p.risk]}</span><span class="chip">${esc(p.kind)}</span>${conflict.has(id) ? '<span class="chip bad">⚠ conflict</span>' : ''}</span>
      <small>${esc(p.what)}</small><small class="sys">${esc(p.system)} · ${esc(p.room)}</small></button>`;
  }

  private reviewHtml(): string {
    const r = this.req, w = this.w(), done = session.decisions[r.id], role = ROLES[r.person.role], locked = !!done;
    const ctx = { role: r.person.role, ...r.ctx }, finalSet = [...w.grant];
    const flags = flagsFor(r, finalSet, w.env), conflictPerms = new Set(flags.filter((f) => f.type === 'sod' || f.type === 'self').flatMap((f) => f.perms));
    const all = [...new Set([...r.requested, ...r.current, ...r.tray])], grant = all.filter((p) => w.grant.has(p)), deny = all.filter((p) => !w.grant.has(p));
    const removed = r.current.filter((p) => !r.requested.includes(p));
    const rat = rationaleFor(r);
    void ctx;
    const passport = `<div class="passport env-${r.env.toLowerCase()}" aria-label="Access passport"><div class="pp-av">${avatarSvg(r.person.seed, r.person.name, 96)}</div>
      <div class="pp-main"><div class="pp-top"><span class="pp-badge">ACCESS PASSPORT · FICTIONAL</span><span class="pp-id">${esc(r.person.staffId)}</span></div>
        <h3>${esc(r.person.name)}</h3><div class="pp-sub">${esc(r.person.title)} · ${esc(r.person.team)}</div>
        <dl><dt>Manager</dt><dd>${esc(r.person.manager)}</dd><dt>Area</dt><dd>${esc(r.area)}</dd><dt>Duration</dt><dd>${r.days ? `${r.days} days` : '<b class="bad">not stated</b>'}</dd><dt>Status</dt><dd>${esc(done ? done.r.status : 'Pending your review')}</dd></dl>
        <div class="pp-env"><span class="env ${r.env.toLowerCase()}">${r.env}</span> <small>${esc(ENV_NOTE[r.env])}</small></div></div></div>
      <div class="pp-reason"><b>Business reason</b><p>“${esc(r.reason)}”</p>${r.limit ? `<small>Stated approval limit: ${esc(r.limit)}</small>` : ''}</div>`;
    const roleCard = `<div class="rolecard"><h4>Role: ${esc(role.team)} (${esc(role.seat)})</h4><ul>${role.responsibilities.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p><b>Normally holds:</b> ${role.allowed.map((p) => `<span class="chip">${esc(PERM[p].label)}</span>`).join(' ')}</p><p class="never"><b>Never:</b> ${esc(role.never)}</p></div>`;
    const compare = `<div class="compare"><div><h4>Current access</h4>${r.current.length ? r.current.map((p) => `<div class="crow">${esc(PERM[p].label)}${removed.includes(p) ? ' <span class="tag rem">− dropped in request</span>' : ''}</div>`).join('') : '<div class="crow muted">Nothing yet</div>'}</div>
      <div><h4>Requested access</h4>${r.requested.map((p) => `<div class="crow${r.current.includes(p) ? '' : ' add'}">${r.current.includes(p) ? '' : '＋ '}${esc(PERM[p].label)} <span class="chip risk-${PERM[p].risk}">${RISK_ICON[PERM[p].risk]}</span></div>`).join('')}</div></div>`;
    const builder = `<div class="builder"><div class="zone grant" data-zone="grant" aria-label="Access to grant"><h4>✓ Grant (${grant.length})</h4>${grant.map((p) => this.permCard(p, 'grant', r, conflictPerms, locked)).join('') || '<div class="empty">Nothing granted</div>'}</div>
      <div class="zone deny" data-zone="deny" aria-label="Access not granted"><h4>✕ Do not grant (${deny.length})</h4>${deny.map((p) => this.permCard(p, 'deny', r, conflictPerms, locked)).join('') || '<div class="empty">Nothing held back</div>'}</div></div>
      <p class="small">Drag cards between the two columns, or press a card to move it. Cards in the second column include extra permissions you could add if the job needs them.</p>`;
    const checker = `<div class="checker"><label class="chk"><input type="checkbox" data-checker ${this.checker ? 'checked' : ''}> Policy checker</label>${this.checker ? (flags.length ? `<ul>${flags.map((f) => `<li class="flag ${f.type}"><b>${{ sod: '⚠ Conflict', self: '⚠ Own access', role: '◆ Role mismatch', gap: '○ Possible gap', env: '▣ Environment', duration: '⏱ Duration', vague: '? Vague' }[f.type]}</b> ${esc(f.text)}</li>`).join('')}</ul>` : '<p class="ok">✓ No flags: this set fits the role and has no conflicts.</p>') : '<p class="small">Hidden. Turning the checker off is the challenge mode: you must spot the issues yourself.</p>'}</div>`;
    const actions = (['approve', 'amend', 'reject', 'info', 'escalate'] as Action[]).map((a) => `<label class="act${w.action === a ? ' on' : ''}"><input type="radio" name="act" data-act="${a}" ${w.action === a ? 'checked' : ''} ${locked ? 'disabled' : ''}> <b>${actionLabel(a)}</b><small>${{ approve: 'Grant exactly what was requested.', amend: 'Grant the set in the Grant column (and the environment chosen).', reject: 'Refuse it, with a reason.', info: 'Ask for what is missing before deciding.', escalate: 'Route it to an independent approver.' }[a]}</small></label>`).join('');
    const extra = w.action === 'amend' ? `<div class="sub"><label>Environment <select data-env ${locked ? 'disabled' : ''}>${ENVS.map((e) => `<option ${e === w.env ? 'selected' : ''}>${e}</option>`).join('')}</select></label></div>`
      : w.action === 'reject' ? `<div class="sub"><b>Reject because:</b>${REJECT_REASONS.map((x) => `<label class="chk"><input type="checkbox" data-rej="${x.id}" ${w.rejectWhy.has(x.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${esc(x.label)}</label>`).join('')}</div>`
      : w.action === 'info' ? `<div class="sub"><b>Ask for:</b>${INFO_ITEMS.map((x) => `<label class="chk"><input type="checkbox" data-info="${x.id}" ${w.info.has(x.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${esc(x.label)}</label>`).join('')}</div>`
      : w.action === 'escalate' ? `<div class="sub"><label>Send to <select data-esc ${locked ? 'disabled' : ''}>${APPROVERS.map((x) => `<option value="${x.id}" ${x.id === w.escalateTo ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label></div>` : '';
    const why = w.action ? `<div class="why"><b>Why? Tick every statement that justifies your decision.</b>${rat.map((x) => `<label class="chk"><input type="checkbox" data-why="${x.id}" ${w.reasons.has(x.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${esc(x.text)}</label>`).join('')}</div>` : '';
    const submit = locked ? '' : `<div class="row"><button class="primary" data-submit ${w.action ? '' : 'disabled'}>Submit decision</button><small class="muted">${w.action ? `Target ${r.sla}s · ${Math.round((Date.now() - w.openedAt) / 1000)}s so far` : 'Choose an action first.'}</small></div>`;
    return `${passport}${roleCard}${compare}<h4>Decide what to grant</h4>${builder}${checker}<h4>Your decision</h4><div class="acts" role="radiogroup" aria-label="Decision">${actions}</div>${extra}${why}${submit}${done ? this.resultHtml(r, done.r) : ''}`;
  }

  private resultHtml(r: AccessRequest, res: Result): string {
    const sum = res.parts.map((p) => `<div class="pbar"><span>${esc(p.label)}</span><div class="bar2"><i style="width:${(p.points / p.max) * 100}%"></i></div><b>${p.points}/${p.max}</b><small>${esc(p.note)}</small></div>`).join('');
    return `<div class="result ${res.verdict}" role="region" aria-label="Decision result"><h3>${STATUS_ICON[res.verdict]} ${esc(res.headline)} · ${res.score}/100</h3>${sum}
      ${res.penalties.length ? `<h4>Penalties (so you can see why)</h4><ul class="pen">${res.penalties.map((p) => `<li>${esc(p.text)} <b>${p.points}</b></li>`).join('')}</ul>` : ''}
      ${res.right.length ? `<h4>What was right</h4><ul class="rt">${res.right.map((x) => `<li>✓ ${esc(x)}</li>`).join('')}</ul>` : ''}${res.risky.length ? `<h4>What was risky</h4><ul class="rk">${res.risky.map((x) => `<li>⚠ ${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="teach"><b>Take-away:</b> ${esc(res.teach)}</p>
      <h4>Final approved access (${esc(res.env)})</h4><div class="final">${res.finalSet.length ? res.finalSet.map((p) => `<span class="chip risk-${PERM[p].risk}">${esc(PERM[p].label)}</span>`).join(' ') : '<span class="muted">No new access approved.</span>'}</div>
      <p class="small">Recorded in the audit trail. ${esc(res.status)}.</p><div class="row"><button data-nextreq class="primary">Next request →</button></div></div>`;
  }

  // ---------------------------------------------------------------- service form ----
  private serviceHtml(): string {
    const b = SERVICE_BRIEFS.find((x) => x.id === this.svcId)!;
    const f = (this.svcForm[b.id] ??= { name: '', owner: NO_OWNER, purpose: '', target: TARGETS[0], env: 'Test', actions: [], scope: SCOPES[3], days: 0, approver: SERVICE_APPROVERS[2], reviewDays: 0 });
    const res = this.svcResult[b.id];
    const opt = (list: string[], v: string) => list.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    return `<section class="ar-main wide"><div class="row"><b>Brief:</b>${SERVICE_BRIEFS.map((x) => `<button data-brief="${x.id}" aria-pressed="${x.id === b.id}">${esc(x.title)}</button>`).join('')}</div>
      <div class="rolecard"><h4>${esc(b.title)}</h4><p>${esc(b.story)}</p><p class="small">🔒 Mock credentials only. The game never shows or stores a real secret: the form issues a placeholder such as <code>svc-••••-••••</code>. Never paste a real password or key into this game.</p></div>
      <form class="sform" data-sform onsubmit="return false">
        <label>Service name<input data-sf="name" value="${esc(f.name)}" placeholder="svc-something" maxlength="40" autocomplete="off"></label>
        <label>Owner<select data-sf="owner">${opt([NO_OWNER, ...OWNERS], f.owner)}</select></label>
        <label>Purpose<select data-sf="purpose">${opt(['', b.purpose, 'Run any job the owner needs', 'Support the finance team'], f.purpose)}</select></label>
        <label>Target system<select data-sf="target">${opt(TARGETS, f.target)}</select></label>
        <label>Environment<select data-sf="env">${opt([...ENVS], f.env)}</select></label>
        <label>Data scope<select data-sf="scope">${opt(SCOPES, f.scope)}</select></label>
        <fieldset><legend>Permitted actions</legend>${SERVICE_ACTIONS.map((a) => `<label class="chk"><input type="checkbox" data-sfa="${a.id}" ${f.actions.includes(a.id) ? 'checked' : ''}> ${esc(a.label)}</label>`).join('')}</fieldset>
        <label>Expiry (days from today)<input type="number" data-sf="days" min="0" max="730" value="${f.days}"></label>
        <label>Approver<select data-sf="approver">${opt(SERVICE_APPROVERS, f.approver)}</select></label>
        <label>Review date (days from today)<input type="number" data-sf="reviewDays" min="0" max="730" value="${f.reviewDays}"></label>
        <div class="row"><button class="primary" data-sfsubmit>Submit for approval</button></div></form>
      ${res ? `<div class="result ${res.score === 100 ? 'correct' : res.score >= 60 ? 'partly' : 'risky'}"><h3>${res.score === 100 ? '✓ Approved' : 'Returned for changes'} · ${res.score}/100</h3><ul class="checks">${res.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✕'} ${esc(c.text)}${c.ok ? '' : `<small>${esc(c.fix)}</small>`}</li>`).join('')}</ul></div>` : ''}</section>`;
  }

  // ---------------------------------------------------------------- review board ----
  private boardHtml(): string {
    const rec = REVIEW_RECORDS.find((x) => x.id === this.recId)!, done = this.recResult[rec.id] ?? (session.reviews[rec.id] ? undefined : undefined);
    const role = ROLES[rec.who.role as keyof typeof ROLES];
    const list = REVIEW_RECORDS.map((x) => { const d = session.reviews[x.id]; return `<button class="qitem${x.id === this.recId ? ' on' : ''}" data-rec="${x.id}" aria-pressed="${x.id === this.recId}"><span class="av">${avatarSvg(x.who.seed, x.who.name, 34)}</span><span><b>${esc(x.who.name)}</b><small>${esc(PERM[x.perm].label)} · ${esc(x.env)}</small></span>${x.overdueDays > 90 ? '<span class="chip warn" title="Review is overdue">overdue</span>' : ''}${d ? `<span class="done ${d.ok ? 'correct' : 'risky'}">${d.ok ? '✓' : '✕'}</span>` : ''}</button>`; }).join('');
    const roleAllowed = role ? role.allowed.filter((p) => p !== rec.perm) : [];
    return `<nav class="ar-queue" aria-label="Access records"><small class="muted">Find access that is stale, excessive, conflicting or orphaned, and keep what is justified.</small>${list}</nav>
      <section class="ar-main"><div class="passport"><div class="pp-av">${avatarSvg(rec.who.seed, rec.who.name, 80)}</div><div class="pp-main"><div class="pp-top"><span class="pp-badge">ACCESS RECORD · FICTIONAL</span><span class="pp-id">${esc(rec.who.staffId)}</span></div><h3>${esc(rec.who.name)}</h3><div class="pp-sub">${esc(rec.who.title)} · ${esc(rec.who.team)}</div>
        <dl><dt>Permission</dt><dd><b>${esc(PERM[rec.perm].label)}</b> <span class="chip risk-${PERM[rec.perm].risk}">${RISK_ICON[PERM[rec.perm].risk]}</span></dd><dt>Environment</dt><dd><span class="env ${rec.env.toLowerCase()}">${rec.env}</span></dd><dt>Person status</dt><dd>${rec.status === 'active' ? 'Active' : rec.status === 'left' ? '<b class="bad">Left the company</b>' : '<b class="warn">Moved to another team</b>'}</dd>
        <dt>Last used</dt><dd>${rec.lastUsedDays} days ago</dd><dt>Requested by</dt><dd>${esc(rec.requestedBy)}</dd><dt>Approved by</dt><dd>${rec.approvedBy ? esc(rec.approvedBy) : '<b class="bad">nobody</b>'}</dd><dt>Review</dt><dd>${rec.overdueDays ? `<b class="warn">${rec.overdueDays} days overdue</b>` : 'On time'}</dd></dl></div></div>
        <div class="rolecard"><h4>Compare with the role: ${esc(rec.role)}</h4>${role ? `<p><b>Normally holds:</b> ${role.allowed.map((p) => `<span class="chip ${p === rec.perm ? 'on' : ''}">${esc(PERM[p].label)}</span>`).join(' ')}</p><p class="never"><b>Never:</b> ${esc(role.never)}</p>` : ''}<p class="small">${esc(PERM[rec.perm].what)}</p></div>
        ${this.recResult[rec.id] ? `<div class="result ${this.recResult[rec.id].ok ? 'correct' : 'risky'}"><h3>${this.recResult[rec.id].ok ? '✓ Good call' : '⚠ Not quite'} · ${this.recResult[rec.id].points}/100</h3><p>${esc(this.recResult[rec.id].text)}</p><div class="row"><button class="primary" data-nextrec>Next record →</button></div></div>` : `<div class="acts"><h4>What do you do?</h4>
          <button data-rv="keep">Keep: it is justified</button><button data-rv="remove">Remove this access</button><button data-rv="independent">Send for independent review</button>
          <div class="row"><label>Add a missing least-privilege permission <select data-addpick><option value="">choose…</option>${[...roleAllowed, ...(rec.addPerm && !roleAllowed.includes(rec.addPerm) ? [rec.addPerm] : [])].map((p) => `<option value="${p}" ${this.addPick[rec.id] === p ? 'selected' : ''}>${esc(PERM[p].label)}</option>`).join('')}</select></label><button data-rv="add" ${this.addPick[rec.id] ? '' : 'disabled'}>Add it</button></div></div>`}
        ${done ? '' : ''}</section>`;
  }

  // ---------------------------------------------------------------- guide, audit, score ----
  private policyHtml(): string {
    return `<section class="ar-main wide"><h3>Policy guide: segregation of duties</h3><p>Segregation of duties means no single person can both start something risky and approve or release it. These rules are used in every request.</p>
      <div class="rules">${SOD_RULES.map((r) => `<div class="rule"><b>${r.id}</b><div><h4>${esc(r.title)}</h4><p>${esc(r.why)}</p><p class="safe"><b>Safeguard:</b> ${esc(r.safeguard)}</p></div></div>`).join('')}</div>
      <h3>Environments</h3><ul>${ENVS.map((e) => `<li><span class="env ${e.toLowerCase()}">${e}</span> ${esc(ENV_NOTE[e])}</li>`).join('')}</ul>
      <h3>Roles</h3><div class="rolegrid">${Object.values(ROLES).map((r) => `<div class="rolecard"><h4>${esc(r.team)} · ${esc(r.seat)}</h4><p>${esc(r.responsibilities.join('; '))}.</p><p class="never"><b>Never:</b> ${esc(r.never)}</p></div>`).join('')}</div>
      <h3>How you are scored</h3><p>Each decision: <b>40</b> least privilege (not too much, not too little, right environment), <b>30</b> segregation of duties, <b>15</b> explanation (the reasons you tick) and <b>15</b> timeliness. Unnecessary privilege and unreviewed high-risk access are penalised, and every penalty shows its reason.</p></section>`;
  }
  private auditHtml(): string {
    const rows = [...session.audit].reverse().map((a) => `<tr><td>${esc(a.t)}</td><td>${esc(a.kind)}</td><td>${esc(a.subject)}</td><td>${esc(a.requestedBy)}</td><td>${esc(a.decision)}</td><td>${esc(a.approvedBy)}</td><td>${esc(a.detail)}</td><td>${a.score}</td></tr>`).join('');
    return `<section class="ar-main wide"><h3>Audit trail (fictional)</h3>${rows ? `<div class="scroll"><table class="t"><tr><th>Time</th><th>Type</th><th>Subject</th><th>Requested by</th><th>Decision</th><th>Approved by</th><th>Detail</th><th>Score</th></tr>${rows}</table></div>` : '<p>No decisions yet. Every decision you make is recorded here with who asked and who approved.</p>'}</section>`;
  }
  private scoreHtml(): string {
    const s = session.summary();
    return `<section class="ar-main wide"><h3>Score: ${s.total}/100</h3><p>${s.requests} of ${s.of} requests decided, ${s.services} service form(s), ${s.reviews} access review(s).</p>
      ${Object.entries(s.byPart).map(([k, v]) => `<div class="pbar"><span>${esc(k)}</span><div class="bar2"><i style="width:${v}%"></i></div><b>${v}%</b></div>`).join('')}
      <h4>Penalties</h4>${s.penalties.length ? `<ul class="pen">${s.penalties.map((p) => `<li>${esc(p.text)} <b>${p.points}</b></li>`).join('')}</ul>` : '<p>No penalties.</p>'}
      <p class="small">Unreviewed high-risk requests and records count against you, so work the high-risk ones first.</p><div class="row"><button data-reset>Start a fresh session</button></div></section>`;
  }

  // ---------------------------------------------------------------- actions ----
  private moveCard(perm: string, to: 'grant' | 'deny'): void {
    if (session.decisions[this.reqId]) return;
    const w = this.w(); to === 'grant' ? w.grant.add(perm) : w.grant.delete(perm);
    this.live = `${PERM[perm].label} ${to === 'grant' ? 'granted' : 'not granted'}.`; sfx.click(); this.focusKey = `[data-perm="${perm}"]`; this.render();
  }
  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement, q = (a: string) => t.closest<HTMLElement>(`[${a}]`);
    if (q('data-a')?.dataset.a === 'close') return this.close();
    const tab = q('data-tab'); if (tab) { this.tab = tab.dataset.tab as Tab; this.focusKey = ''; return this.render(); }
    const rq = q('data-req'); if (rq) { this.reqId = rq.dataset.req!; this.w().openedAt = this.work[this.reqId].openedAt; this.focusKey = ''; return this.render(); }
    const pc = q('data-perm'); if (pc && !(pc as HTMLButtonElement).disabled) return this.moveCard(pc.dataset.perm!, pc.dataset.zone === 'grant' ? 'deny' : 'grant');
    if (q('data-submit')) return this.submit();
    if (q('data-nextreq')) { const i = REQUESTS.findIndex((r) => r.id === this.reqId); const nxt = REQUESTS.slice(i + 1).concat(REQUESTS.slice(0, i)).find((r) => !session.decisions[r.id]) ?? REQUESTS[(i + 1) % REQUESTS.length]; this.reqId = nxt.id; this.w(); this.focusKey = ''; return this.render(); }
    const brief = q('data-brief'); if (brief) { this.svcId = brief.dataset.brief!; return this.render(); }
    if (q('data-sfsubmit')) { const b = SERVICE_BRIEFS.find((x) => x.id === this.svcId)!; this.svcResult[b.id] = session.submitService(b, this.svcForm[b.id]); this.live = `Score ${this.svcResult[b.id].score}.`; return this.render(); }
    const rec = q('data-rec'); if (rec) { this.recId = rec.dataset.rec!; return this.render(); }
    const rv = q('data-rv'); if (rv) { const r = REVIEW_RECORDS.find((x) => x.id === this.recId)!; const verdict = rv.dataset.rv as ReviewVerdict; this.recResult[r.id] = session.review(r, { verdict, addPerm: verdict === 'add' ? this.addPick[r.id] : undefined }); this.live = this.recResult[r.id].text; return this.render(); }
    if (q('data-nextrec')) { const i = REVIEW_RECORDS.findIndex((r) => r.id === this.recId); this.recId = (REVIEW_RECORDS.slice(i + 1).concat(REVIEW_RECORDS.slice(0, i)).find((r) => !session.reviews[r.id]) ?? REVIEW_RECORDS[(i + 1) % REVIEW_RECORDS.length]).id; return this.render(); }
    if (q('data-reset')) { for (const k of Object.keys(session.decisions)) delete session.decisions[k]; for (const k of Object.keys(session.services)) delete session.services[k]; for (const k of Object.keys(session.reviews)) delete session.reviews[k]; this.work = {}; this.svcResult = {}; this.recResult = {}; return this.render(); }
  }
  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement & HTMLSelectElement, d = t.dataset, w = this.w();
    if (d.checker !== undefined) { this.checker = t.checked; return this.render(); }
    if (d.act) { w.action = d.act as Action; this.focusKey = `[data-act="${d.act}"]`; return this.render(); }
    if (d.env !== undefined) { w.env = t.value as Env; return this.render(); }
    if (d.rej) { t.checked ? w.rejectWhy.add(d.rej) : w.rejectWhy.delete(d.rej); return; }
    if (d.info) { t.checked ? w.info.add(d.info) : w.info.delete(d.info); return; }
    if (d.esc !== undefined) { w.escalateTo = t.value; return; }
    if (d.why) { t.checked ? w.reasons.add(d.why) : w.reasons.delete(d.why); return; }
    if (d.sf) { const f = this.svcForm[this.svcId]; (f as unknown as Record<string, unknown>)[d.sf] = ['days', 'reviewDays'].includes(d.sf) ? Number(t.value) : t.value; return; }
    if (d.sfa) { const f = this.svcForm[this.svcId]; f.actions = t.checked ? [...new Set([...f.actions, d.sfa])] : f.actions.filter((x) => x !== d.sfa); return; }
    if (d.addpick !== undefined) { this.addPick[this.recId] = t.value; return this.render(); }
  }
  private submit(): void {
    const r = this.req, w = this.w(); if (!w.action || session.decisions[r.id]) return;
    const dec: Decision = { action: w.action, set: [...w.grant], env: w.env, rejectWhy: [...w.rejectWhy], info: [...w.info], escalateTo: w.action === 'escalate' ? w.escalateTo : undefined, reasons: [...w.reasons].filter((x) => !x.startsWith('rej:') && !x.startsWith('info:')), seconds: (Date.now() - w.openedAt) / 1000 };
    for (const x of w.reasons) { if (x.startsWith('rej:')) dec.rejectWhy.push(x.slice(4)); if (x.startsWith('info:')) dec.info.push(x.slice(5)); }
    const res = session.decide(r, dec); sfx[res.verdict === 'correct' ? 'good' : res.verdict === 'partly' ? 'click' : 'warn']();
    this.live = `${res.headline}. Score ${res.score}.`; this.focusKey = ''; this.render();
    $(this.box!, '.result')?.scrollIntoView({ block: 'nearest' });
  }
  /** Used by tests and the e2e. */
  get state() { return { session, reqId: this.reqId }; }
}
void $$;
