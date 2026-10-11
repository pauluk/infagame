import type { Tone } from '../game/types';
import { ACCOUNTS, BlueLantern, CLS_LABEL, CONN_ITEMS, DECOY_ENDPOINT, ITEMS, LANE_LABEL, LIMITS, PROVIDER, ROLES, STAGES, money, type BLRole, type Cls, type ConnItem, type Lane, type Result, type Stage } from '../game/systems/BlueLantern';
import type { GameState } from '../game/systems/GameState';
import { sfx } from '../game/systems/Sfx';
import { $, esc } from './dom';
import { enableDrag } from './dragkit';
import { avatarSvg } from './avatar';

export interface BlueHost { state: GameState; toast(html: string, tone?: Tone): void; pause(): void; resume(): void; openMap(): void }
type Tab = Stage | 'board' | 'roles' | 'audit';
const TABS: [Tab, string][] = [['board', 'Pipeline'], ['roles', 'Roles'], ['triage', '1 Triage'], ['scope', '2 Scope'], ['govern', '3 Govern'], ['configure', '4 Configure'], ['prepare', '5 Prepare'], ['review', '6 Dual review'], ['submit', '7 Submit'], ['reconcile', '8 Reconcile'], ['restore', '9 Restore'], ['audit', 'Audit and score']];
const TONE = { good: 'good', warn: 'warn', bad: 'bad', info: 'info' } as const;
const SYSTEMS: [string, string][] = [['orchestration', 'Payment Orchestration system'], ['outbound', 'Outbound supplier payment route'], ['retries', 'Automatic retries on the failed route'], ['ap', 'Accounts Payable system'], ['core', 'Finance Core and the ledger']];

/** Blue Lantern: the emergency payment continuity board. Everything is fictional and simulated; no real secret is ever requested. */
export class BlueLanternView {
  private box: HTMLElement | null = null;
  isOpen = false;
  private tab: Tab = 'board';
  private actorPick: BLRole | 'right' = 'right';
  private last: Result | null = null;
  private affected = new Set<string>();
  private scopeTypes = new Set<string>(); private scopeLimit = false; private scopeHours = 4;
  private cEvidence = new Set<string>(); private resend = false; private pickEndpoint = PROVIDER.endpoint; private pickAccount: 'ops' | 'payroll' = 'ops';
  private cls: Record<string, Cls> = {}; private open1 = new Set<string>();
  constructor(private root: HTMLElement, private host: BlueHost) {}

  private get b() { return BlueLantern.for(this.host.state); }
  open(tab: Tab = 'board'): void {
    this.tab = tab;
    if (!this.isOpen) {
      this.isOpen = true; this.host.pause();
      this.box = document.createElement('div'); this.box.id = 'bluelantern'; this.box.className = 'bp ar bl';
      this.box.addEventListener('click', (e) => this.onClick(e));
      this.box.addEventListener('change', (e) => this.onChange(e));
      this.box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } else e.stopPropagation(); });
      this.root.appendChild(this.box);
      enableDrag(this.box, { handle: '.pcard', drop: '.zone', end: (h, t) => { if (t) this.lane(h.dataset.item!, t.dataset.lane as Lane); } });
    }
    this.render();
  }
  close(): void { if (!this.isOpen) return; this.isOpen = false; this.box?.remove(); this.box = null; this.host.resume(); }

  /** The person doing a job: the right one by default, or whoever the player chose to ask (which the rules may refuse). */
  private who(natural: BLRole): BLRole { return this.actorPick === 'right' ? natural : this.actorPick; }
  private do(r: Result): void { this.last = r; sfx.click(); this.render(); this.host.state.changed(); }
  private chip(t: string, c = '') { return `<span class="chip ${c}">${esc(t)}</span>`; }

  // ------------------------------------------------------------------ render ----
  private render(): void {
    if (!this.box) return;
    const b = this.b, sc = b.scoreboard(), done = STAGES.filter((s) => b.stageDone(s.id)).length;
    const body = this.body(this.tab);
    const fb = this.last ? `<div class="bl-fb ${TONE[this.last.tone]}" role="status" aria-live="polite">${this.last.ok ? '✓' : '⚠'} ${esc(this.last.text)}</div>` : '<div class="bl-fb info" role="status" aria-live="polite">Pick a task, or choose a tab. Every decision is recorded in the audit trail.</div>';
    this.box.innerHTML = `<div class="bp-head"><h2>Blue Lantern <small class="muted">Emergency payment continuity (game simulation: fictional provider, suppliers, accounts and payments only)</small></h2>
      <div class="bp-stats"><span>Stages <b>${done}/${STAGES.length}</b></span><span>Safe-handling <b>${sc.total}</b></span><span>Route <b>${esc(b.d.conn.status)}</b></span><span>Clock <b>${this.host.state.fmtClock()}</b></span></div>
      <div class="bp-head-btns"><button data-a="map" aria-label="Show the affected rooms on the map">Map</button><button class="primary" data-a="close" aria-label="Close the board">Close ✕</button></div></div>
      <div class="bp-tabs" role="tablist" aria-label="Sections">${TABS.map(([t, l]) => `<button role="tab" aria-selected="${this.tab === t}" data-tab="${t}">${l}</button>`).join('')}</div>
      <div class="bl-who"><label>Who is doing this? <select data-actor><option value="right"${this.actorPick === 'right' ? ' selected' : ''}>The right person for the job</option>${(Object.keys(ROLES) as BLRole[]).map((r) => `<option value="${r}"${this.actorPick === r ? ' selected' : ''}>${esc(ROLES[r].person)} · ${esc(ROLES[r].name)}</option>`).join('')}</select></label>
        <span class="small">Choosing the wrong person is allowed, so you can see why the rules exist.</span></div>
      ${fb}<div class="bl-body">${body}</div>`;
  }

  private body(t: Tab): string {
    switch (t) {
      case 'board': return this.boardHtml();
      case 'roles': return this.rolesHtml();
      case 'audit': return this.auditHtml();
      case 'triage': return this.triageHtml();
      case 'scope': return this.scopeHtml();
      case 'govern': return this.governHtml();
      case 'configure': return this.configHtml();
      case 'prepare': return this.prepareHtml();
      case 'review': return this.reviewHtml();
      case 'submit': return this.submitHtml();
      case 'reconcile': return this.reconcileHtml();
      case 'restore': return this.restoreHtml();
    }
  }
  private guard(stage: Stage): string {
    const b = this.b; if (b.d.deferred && !['triage', 'scope', 'govern'].includes(stage)) return '<p class="bl-note">The provider stayed inactive and the payments were deferred, so this step is not needed.</p>';
    const st = STAGES.find((x) => x.id === stage)!, miss = st.deps.filter((d) => !b.stageDone(d));
    return miss.length ? `<p class="bl-note">Waiting for: ${miss.map((m) => STAGES.find((x) => x.id === m)!.title).join(', ')}.</p>` : '';
  }
  private head(stage: Stage): string { const st = STAGES.find((x) => x.id === stage)!; return `<h3>${esc(st.title)} <small class="muted">led by ${esc(ROLES[st.owner].person)} (${esc(ROLES[st.owner].name)})</small></h3><p>${esc(st.what)}</p>${this.guard(stage)}`; }

  // ------------------------------------------------------------------ board and roles ----
  private boardHtml(): string {
    const b = this.b, rows = STAGES.map((s) => {
      const state = b.stageState(s.id), hist = b.d.decisions[s.id] ?? [], c = state === 'done' ? 'good' : state === 'ready' ? 'warn' : state === 'skipped' ? 'info' : '';
      const label = { done: '✓ Done', ready: '● Ready', blocked: '🔒 Blocked', skipped: '— Not needed' }[state];
      return `<details class="mcard bl-card ${state}" ${this.open1.has(s.id) ? 'open' : ''} data-stage="${s.id}"><summary><b>${esc(s.title)}</b> ${this.chip(label, c)} <span class="chip">${esc(ROLES[s.owner].person)} · ${esc(ROLES[s.owner].name)}</span></summary>
        <p class="small">${esc(s.what)}</p><p class="small"><b>Depends on:</b> ${s.deps.length ? s.deps.map((d) => STAGES.find((x) => x.id === d)!.title).join(', ') : 'nothing'} · <b>Evidence:</b> ${hist.length ? hist.length + ' recorded' : 'none yet'}</p>
        ${hist.length ? `<ul class="small bl-hist">${hist.map((h) => `<li><time>${esc(h.t)}</time> <b>${esc(h.role === 'system' ? 'System' : ROLES[h.role].person)}</b>: ${esc(h.text)}</li>`).join('')}</ul>` : '<p class="small muted">No decisions recorded yet.</p>'}
        <button data-tab="${s.id}">Open this task</button></details>`;
    }).join('');
    const aff = this.host.state.mission.affectedRooms ?? [];
    return `<p>The primary payment system failed at 07:35. Accounts Payable, Finance Core and the ledger are up. Work the cards in order: each one opens to show its owner, evidence, status, dependencies and decision history.</p>
      <p class="small">Affected on the map: ${aff.length ? aff.join(', ').replace(/_/g, ' ') : 'none'}. ${b.d.conn.status === 'inactive' ? 'The emergency route is <b>inactive</b>.' : 'The emergency route is <b>' + esc(b.d.conn.status) + '</b>.'}</p><div class="bl-grid">${rows}</div>`;
  }
  private rolesHtml(): string {
    return `<p>Five people, five jobs. <b>One person must never create, approve and release the same payment.</b></p><div class="bl-grid">${(Object.keys(ROLES) as BLRole[]).map((r) => `<div class="mcard"><div class="av">${avatarSvg('bl:' + r, ROLES[r].person, 44)}</div><h3>${esc(ROLES[r].person)}</h3><div class="chip">${esc(ROLES[r].name)}</div><p class="small"><b>Does:</b> ${esc(ROLES[r].does)}</p><p class="small"><b>Never:</b> ${esc(ROLES[r].never)}</p></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ 1 triage ----
  private triageHtml(): string {
    const b = this.b, d = b.d;
    return `${this.head('triage')}<div class="mcard"><h3>What is affected?</h3><p class="small">Tick everything that is down or at risk. Only tick what the evidence shows.</p>
      ${SYSTEMS.map(([k, l]) => `<label class="bl-chk"><input type="checkbox" data-sys="${k}" ${this.affected.has(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
      <div class="row"><button data-act="assess">${d.affected ? '✓ ' : ''}Record the impact assessment</button></div>
      <p class="small">Teams affected: Treasury and Accounts Payable. Rooms: Payment Orchestration, Accounts Payable (Finance Core), Treasury, Secure Ops and the Integration Exchange are marked on the map.</p></div>
      <div class="grid2"><div class="mcard"><h3>Automatic retries</h3><p class="small">The failed route retries every 30 seconds. When it recovers it could re-send uncertain items.</p><button data-act="pause">${d.paused ? '✓ Retries paused' : 'Pause automatic retries'}</button></div>
      <div class="mcard"><h3>The outbound queue</h3><p class="small">Keep it as it is, read-only, for review. Nothing is deleted or resent.</p><button data-act="preserve">${d.preserved ? '✓ Queue preserved' : 'Preserve the queue for review'}</button></div></div>`;
  }

  // ------------------------------------------------------------------ 2 scope ----
  private scopeHtml(): string {
    const b = this.b, d = b.d;
    const rows = ITEMS.map((i) => { const cur = d.classes[i.id]; return `<tr><td><b>${i.id}</b></td><td>${esc(i.supplier)}<div class="small">${esc(i.ref)}</div></td><td>${money(i.value)}</td><td class="small">${esc(i.evidence)}</td><td><select data-cls="${i.id}" aria-label="Classify invoice ${i.id}"><option value="">Choose…</option>${(Object.keys(CLS_LABEL) as Cls[]).map((c) => `<option value="${c}"${(this.cls[i.id] ?? cur) === c ? ' selected' : ''}>${CLS_LABEL[c]}</option>`).join('')}</select> ${cur ? '<span class="chip good">✓</span>' : ''}</td></tr>`; }).join('');
    const types = ['Approved supplier invoices', 'Payroll', 'Tax payments', 'Invoices not yet approved'];
    return `${this.head('scope')}<h4>Separate the queue</h4><table class="t bl-t"><tr><th>#</th><th>Supplier</th><th>Value</th><th>Evidence</th><th>Status</th></tr>${rows}</table>
      <div class="mcard"><h3>Agree the emergency scope <small class="muted">(Strategic Finance)</small></h3><p class="small">Which payment types may go through the contingency route?</p>
      ${types.map((t) => `<label class="bl-chk"><input type="checkbox" data-type="${esc(t)}" ${this.scopeTypes.has(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
      <label class="bl-chk"><input type="checkbox" data-limit ${this.scopeLimit ? 'checked' : ''}> Illustrative exposure limit: ${money(LIMITS.txn)} per payment, ${money(LIMITS.batch)} per batch</label>
      <label class="bl-chk">Duration (hours, 1 to ${LIMITS.hours}): <input type="number" min="1" max="12" value="${this.scopeHours}" data-hours style="width:70px"></label>
      <div class="row"><button data-act="scope">${d.scope.agreed ? '✓ ' : ''}Strategic Finance agrees the scope</button></div>
      <p class="small">Strategic Finance sets priorities, scope, duration and the limit. They never prepare or release payments.</p></div>`;
  }

  // ------------------------------------------------------------------ 3 govern ----
  private governHtml(): string {
    const b = this.b, d = b.d, p = d.provider, g = d.govern;
    const st = (v: string) => this.chip(v === 'valid' ? '✓ Valid' : v === 'expired' ? '✕ Expired' : '✕ Missing', v === 'valid' ? 'good' : 'bad');
    return `${this.head('govern')}<div class="mcard"><h3>${esc(p.name)}</h3>
      <table class="t"><tr><th>Contract (${esc(p.contractRef)})</th><td>${st(p.contract)}</td></tr><tr><th>Supplier due diligence</th><td>${st(p.dueDiligence)}</td></tr><tr><th>Approval to use in an emergency</th><td>${st(p.approval)}</td></tr><tr><th>Service owner</th><td>${esc(p.owner)}</td></tr></table>
      ${g.blocked ? '<div class="bl-fb bad">Activation is BLOCKED. There is no bypass. Escalate it, keep the provider inactive, preserve the queue and defer safely, or use only an already-approved route.</div>' : ''}
      <div class="row"><button data-act="reviewprov">Review the provider record (Strategic Finance)</button>
      <button data-act="stratok">${g.strategic ? '✓ ' : ''}Strategic Finance approves scope and duration</button>
      <button data-act="indok">${g.independent ? '✓ ' : ''}Independent approver approves use of the provider</button></div>
      ${g.blocked ? `<div class="row"><button data-act="escalate">${g.escalated ? '✓ ' : ''}Escalate to the CFO and Procurement</button><button data-act="defer" class="primary">${d.deferred ? '✓ ' : ''}Keep inactive, preserve the queue and defer safely</button></div>` : ''}</div>`;
  }

  // ------------------------------------------------------------------ 4 configure ----
  private configHtml(): string {
    const b = this.b, c = b.d.conn, p = b.d.provider, rv = (i: ConnItem) => c.reviewed.includes(i);
    const extra: Record<string, string> = {
      identity: `<select data-ep aria-label="Endpoint"><option value="${esc(PROVIDER.endpoint)}"${this.pickEndpoint === PROVIDER.endpoint ? ' selected' : ''}>${esc(PROVIDER.endpoint)} (from the approved record)</option><option value="${esc(DECOY_ENDPOINT)}"${this.pickEndpoint === DECOY_ENDPOINT ? ' selected' : ''}>${esc(DECOY_ENDPOINT)} (from an email)</option></select>`,
      account: `<div class="bl-accts">${(['ops', 'payroll'] as const).map((k) => `<label class="bl-acct ${ACCOUNTS[k].eligible ? '' : 'no'}"><input type="radio" name="acct" value="${k}" ${this.pickAccount === k ? 'checked' : ''}> <b>${esc(ACCOUNTS[k].name)}</b><div class="small">${esc(ACCOUNTS[k].mask)} · source account</div><div class="small">${esc(ACCOUNTS[k].note)}</div></label>`).join('')}</div><p class="small">This is the account money leaves. A supplier's own account is a different thing: it belongs to the beneficiary and is never chosen here.</p>`,
      record: `<span class="small">${esc(p.name)}: contract ${esc(p.contract)}, due diligence ${esc(p.dueDiligence)}, approval ${esc(p.approval)}</span>`,
      types: `<span class="small">${esc(p.types.join(', '))} · data scope: ${esc(p.dataScope)}</span>`,
      limits: `<span class="small">${money(LIMITS.txn)} per payment · ${money(LIMITS.batch)} per batch · independent approval from ${money(LIMITS.independentFrom)}</span>`,
      owner: `<span class="small">${esc(p.owner)}; approvers ${esc(p.approvers.join(', '))}</span>`,
      times: `<span class="small">${c.start != null ? `Start ${this.host.state.fmtClock(c.start)} · expires ${this.host.state.fmtClock(c.expires!)} · ${esc(c.reason)}` : `Starts when you record it; expires after ${b.d.scope.hours || LIMITS.hours} hours by itself.`}</span>`,
      test: `<span class="small">Handshake: ${c.handshake ?? 'not run'} · no-value test: ${c.test ?? 'not run'}</span>`,
    };
    return `${this.head('configure')}<div class="mcard"><h3>Emergency Provider Connection <small class="muted">(simulated: no secrets, keys or certificates are ever entered here)</small></h3>
      <p>Status: ${this.chip(c.status, c.status === 'tested' || c.status === 'active' ? 'good' : c.status === 'expired' ? 'bad' : 'warn')}</p>
      ${CONN_ITEMS.filter((i) => i.id !== 'test').map((i) => `<div class="bl-conn ${rv(i.id) ? 'ok' : ''}"><div><b>${rv(i.id) ? '✓' : '○'} ${esc(i.label)}</b></div><div>${extra[i.id]}</div><button data-conn="${i.id}">${rv(i.id) ? 'Reviewed' : 'Review and confirm'}</button></div>`).join('')}
      <div class="bl-conn ${c.test === 'pass' ? 'ok' : ''}"><div><b>${c.test === 'pass' ? '✓' : '○'} ${esc(CONN_ITEMS.find((i) => i.id === 'test')!.label)}</b></div><div>${extra.test}</div>
      <div class="row"><button data-act="handshake">Run sandbox handshake</button><button data-act="novalue">Send no-value test message</button></div></div>
      ${c.handshake ? `<p class="${c.handshake === 'pass' ? 'good' : 'bad'}"><b>Handshake: ${c.handshake === 'pass' ? 'PASS' : 'FAIL'}</b></p>` : ''}${c.test ? `<p class="${c.test === 'pass' ? 'good' : 'bad'}"><b>No-value test: ${c.test === 'pass' ? 'PASS' : 'FAIL'}</b></p>` : ''}</div>`;
  }

  // ------------------------------------------------------------------ 5 prepare ----
  private prepareHtml(): string {
    const b = this.b, d = b.d, cands = ITEMS.filter((i) => i.ideal);
    const card = (i: (typeof ITEMS)[number]) => `<div class="pcard" role="button" tabindex="0" data-item="${i.id}" aria-label="Invoice ${i.id}, ${esc(i.supplier)}, ${money(i.value)}"><div class="pc-top"><b>${i.id} · ${esc(i.supplier)}</b><span>${money(i.value)}</span></div><small>${esc(i.ref)}</small><small>${esc(i.evidence)}</small>
      <label class="small">Move to <select data-lane-pick="${i.id}"><option value="">Choose a lane…</option>${(Object.keys(LANE_LABEL) as Lane[]).map((l) => `<option value="${l}">${LANE_LABEL[l]}</option>`).join('')}</select></label></div>`;
    const lanes = (Object.keys(LANE_LABEL) as Lane[]).map((l) => `<div class="zone ${l === 'eligible' ? 'grant' : 'deny'}" data-lane="${l}"><h4>${LANE_LABEL[l]}</h4>${cands.filter((i) => d.lanes[i.id] === l).map(card).join('') || '<div class="empty small">Drop here</div>'}</div>`).join('');
    const unplaced = cands.filter((i) => !d.lanes[i.id]);
    const sum = b.summary();
    return `${this.head('prepare')}<p class="small">Drag a card into a lane, or use the "Move to" menu. Accounts Payable checks each invoice: approval, supplier details, due date, duplicates and eligibility.</p>
      <div class="bl-tray zone" data-lane=""><h4>To inspect</h4>${unplaced.map(card).join('') || '<div class="empty small">All placed</div>'}</div>
      <div class="bl-lanes">${lanes}</div>
      <div class="mcard"><h3>Supplier verification <small class="muted">(Independent approver)</small></h3><p class="small">Larch &amp; Pine Services changed its payment details three days ago. The independent approver verifies them against the approved supplier record (a call-back to the number on file). Supplier details cannot be changed during the run.</p><button data-act="verifyb">${d.govern.verifiedSuppliers.includes('B') ? '✓ Verified' : 'Verify through the approved supplier record'}</button></div>
      <div class="row"><button class="primary" data-act="batch">${d.batch ? '✓ ' : ''}Accounts Payable prepares the proposed batch</button></div>
      ${sum ? `<p>Proposed batch <b>${esc(sum.ref)}</b>: ${sum.count} item(s), ${money(sum.total)}. Held: ${esc(sum.held.join(', ') || 'none')}.</p>` : ''}`;
  }

  // ------------------------------------------------------------------ 6 review ----
  private reviewHtml(): string {
    const b = this.b, t = b.d.treasury, bt = b.d.batch;
    const chk = (k: string, l: string, on: boolean) => `<div class="bl-conn ${on ? 'ok' : ''}"><div><b>${on ? '✓' : '○'} ${l}</b></div><button data-tcheck="${k}">${on ? 'Checked' : 'Check'}</button></div>`;
    return `${this.head('review')}${bt ? `<p>Batch <b>${esc(bt.ref)}</b> prepared by ${esc(ROLES[bt.maker ?? 'ap'].person)}: ${bt.items.length} item(s), ${money(bt.total)}.</p>` : ''}
      <div class="mcard"><h3>Treasury review <small class="muted">(${esc(ROLES.treasury.person)}, who did not prepare the batch)</small></h3>
      <div class="bl-accts">${(['ops', 'payroll'] as const).map((k) => `<label class="bl-acct ${ACCOUNTS[k].eligible ? '' : 'no'}"><input type="radio" name="tacct" value="${k}" ${t.account === k ? 'checked' : ''}> <b>${esc(ACCOUNTS[k].name)}</b><div class="small">${esc(ACCOUNTS[k].mask)} · ${ACCOUNTS[k].eligible ? 'eligible, subject to the limit and Treasury approval' : 'unavailable for supplier payments'}</div></label>`).join('')}</div>
      <div class="row"><button data-act="tacct">${t.account ? '✓ ' : ''}Confirm the source account</button></div>
      ${chk('funds', 'Funds available cover the batch total', t.funds)}${chk('total', 'Batch total agrees to the AP invoices', t.total)}${chk('limit', `Within ${money(LIMITS.txn)} per payment and ${money(LIMITS.batch)} per batch`, t.limit)}${chk('items', 'Every item is eligible (no changed supplier, unknown, duplicate or over-limit item)', t.items)}${chk('approvals', 'Approval record is complete', t.approvals)}
      <div class="row"><button data-act="tsign" class="primary">${t.signed ? '✓ ' : ''}Treasury signs the release review</button></div></div>
      <div class="mcard"><h3>Independent second approval</h3><p class="small">Needed from ${money(LIMITS.independentFrom)}. The person who requested or prepared it cannot approve it.</p><button data-act="indbatch">${b.stageDone('review') ? '✓ ' : ''}Independent approver gives the second approval</button></div>`;
  }

  // ------------------------------------------------------------------ 7 submit ----
  private submitHtml(): string {
    const b = this.b, d = b.d, sum = b.summary();
    const acks = Object.values(d.acks);
    return `${this.head('submit')}${sum ? `<div class="mcard"><h3>Submission summary</h3><table class="t"><tr><th>Batch reference</th><td>${esc(sum.ref)}</td></tr><tr><th>Items</th><td>${sum.count}</td></tr><tr><th>Total</th><td>${money(sum.total)}</td></tr><tr><th>Held items</th><td>${esc(sum.held.join(', ') || 'none')}</td></tr><tr><th>Source account</th><td>${esc(sum.account)}</td></tr><tr><th>Provider</th><td>${esc(sum.provider)} · ${esc(d.conn.status)}</td></tr><tr><th>Approvers</th><td>${esc(sum.approvers.join('; ') || 'none')}</td></tr></table>
      <label class="bl-chk"><input type="checkbox" data-resend ${this.resend ? 'checked' : ''}> Also include the held items C and D "to be safe" <span class="small">(a mistake: try it and read the consequence)</span></label>
      <div class="row"><button class="primary" data-act="submit">Simulate secure submission</button></div><p class="small">This is a mock secure provider portal. Nothing real is sent and no real money moves.</p></div>` : '<p class="bl-note">There is no approved batch to submit yet.</p>'}
      ${acks.length ? `<h4>Provider acknowledgements (fictional)</h4><table class="t"><tr><th>Item</th><th>Status</th><th>Note</th></tr>${acks.map((a) => `<tr><td>${a.id}</td><td>${this.chip(a.status, a.status === 'Accepted' ? 'good' : a.status === 'Pending' ? 'warn' : 'bad')}</td><td class="small">${esc(a.note)}</td></tr>`).join('')}</table>` : ''}`;
  }

  // ------------------------------------------------------------------ 8 reconcile ----
  private reconcileHtml(): string {
    const b = this.b, d = b.d, rec = Object.entries(d.recon).filter(([k]) => k !== 'C');
    const ev: [string, string, boolean][] = [['bank', 'Bank feed shows no debit for INV-C-2043', true], ['portal', 'Provider portal has no record of INV-C-2043', true], ['orchestration', 'Payment Orchestration log shows it never left the queue', true], ['hunch', 'Meridian Cleaning says they are "fairly sure" they were paid', false], ['icon', 'The queue icon for C is green', false], ['old', 'A copy of last month\'s statement', false]];
    return `${this.head('reconcile')}<table class="t bl-t"><tr><th>Item</th><th>AP + batch ref</th><th>Provider ack</th><th>Bank feed</th><th>Ledger</th><th>Decision</th></tr>
      ${rec.map(([id, r]) => `<tr><td><b>${id}</b></td><td>${r.ap ? '✓ match' : '✕'}</td><td>${this.chip(r.ack ?? '—', r.ack === 'Accepted' ? 'good' : r.ack === 'Pending' ? 'warn' : 'bad')}</td><td>${esc(r.bank)}</td><td>${esc(r.ledger)}</td>
      <td>${r.decision ? this.chip('✓ ' + r.decision, 'good') : `<button data-post="${id}">Post to ledger</button> <button data-rdec="${id}:processed">Mark processed</button> <button data-rdec="${id}:monitor">Monitor, do not resend</button> <button data-rdec="${id}:review">Return to review</button>`}</td></tr>`).join('') || '<tr><td colspan="6">Nothing submitted.</td></tr>'}</table>
      <div class="mcard"><h3>Invoice C: status Unknown</h3><p class="small">It may have been paid, or never sent. Pending and Unknown items are never auto-resent. Choose only evidence that proves what happened.</p>
      ${ev.map(([k, l]) => `<label class="bl-chk"><input type="checkbox" data-cev="${k}" ${this.cEvidence.has(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
      <div class="row"><button data-act="investc">${d.recon.C?.decision === 'requeue' ? '✓ ' : ''}Record the investigation</button></div>
      ${d.recon.C?.decision === 'requeue' ? '<p class="good">Confirmed unsent. It will be re-queued once on the normal route, with approval. It was not resent through the provider.</p>' : ''}</div>
      <p class="small">Rejected items return to the correct review lane; they are not resent as they are.</p>`;
  }

  // ------------------------------------------------------------------ 9 restore ----
  private restoreHtml(): string {
    const r = this.b.d.restore, line = (a: string, on: boolean, l: string) => `<div class="bl-conn ${on ? 'ok' : ''}"><div><b>${on ? '✓' : '○'} ${l}</b></div><button data-rest="${a}">${on ? 'Done' : 'Do this'}</button></div>`;
    return `${this.head('restore')}<div class="mcard">${line('route', r.route, 'Restore the normal payment route')}${line('dup', r.duplicates, 'Check the queue for duplicates before anything is released')}${line('cycle', r.cycle, 'Monitor the next processing cycle (pending items settle)')}${line('off', r.deactivated, 'Disable the emergency connection and record its expiry')}</div>
      <p class="small">Item B (pending) is posted and marked processed once the next cycle accepts it.</p>
      <div class="row"><button data-rest="postb">Post item B to the ledger and mark it processed</button></div>`;
  }

  // ------------------------------------------------------------------ audit ----
  private auditHtml(): string {
    const b = this.b, sc = b.scoreboard();
    return `<h3>Safe-handling score: ${sc.total}/100</h3><div class="bl-grid">${sc.cats.map((c) => `<div class="mcard"><b>${esc(c.label)}</b><div class="pbar"><i style="width:${Math.round((c.points / c.max) * 100)}%"></i></div><span>${c.points}/${c.max}</span>${c.notes.map((n) => `<p class="small">${esc(n)}</p>`).join('')}</div>`).join('')}</div>
      <h3>Audit trail</h3><ul class="bl-hist">${b.d.log.map((l) => `<li class="${l.tone}"><time>${esc(l.t)}</time> <b>${esc(l.role === 'system' ? 'System' : ROLES[l.role].person)}</b>: ${esc(l.text)}</li>`).join('') || '<li class="muted">Nothing recorded yet.</li>'}</ul>`;
  }

  // ------------------------------------------------------------------ events ----
  private lane(id: string, lane: Lane | ''): void { if (!lane) return; this.do(this.b.moveToLane(this.who('ap'), id, lane)); }
  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement & HTMLSelectElement;
    if (t.hasAttribute('data-actor')) { this.actorPick = t.value as BLRole | 'right'; this.render(); return; }
    if (t.dataset.sys) { t.checked ? this.affected.add(t.dataset.sys) : this.affected.delete(t.dataset.sys); return; }
    if (t.dataset.type) { t.checked ? this.scopeTypes.add(t.dataset.type) : this.scopeTypes.delete(t.dataset.type); return; }
    if ('limit' in t.dataset) { this.scopeLimit = (t as HTMLInputElement).checked; return; }
    if ('hours' in t.dataset) { this.scopeHours = Number(t.value) || 1; return; }
    if ('resend' in t.dataset) { this.resend = (t as HTMLInputElement).checked; return; }
    if (t.dataset.cev) { (t as HTMLInputElement).checked ? this.cEvidence.add(t.dataset.cev) : this.cEvidence.delete(t.dataset.cev); return; }
    if ('ep' in t.dataset) { this.pickEndpoint = t.value; return; }
    if (t.getAttribute('name') === 'acct') { this.pickAccount = t.value as 'ops' | 'payroll'; return; }
    if (t.dataset.cls) { const v = t.value as Cls; if (!v) return; this.cls[t.dataset.cls] = v; const r = this.b.classify(this.who('secure_ops'), t.dataset.cls, v); if (!r.ok) delete this.cls[t.dataset.cls]; this.do(r); return; }
    if (t.dataset.lanePick) { this.lane(t.dataset.lanePick, t.value as Lane); return; }
  }
  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement, b = this.b;
    const det = t.closest('details[data-stage]') as HTMLElement | null;
    if (det && t.closest('summary')) { const id = det.dataset.stage!; this.open1.has(id) ? this.open1.delete(id) : this.open1.add(id); return; }
    const btn = t.closest('button') as HTMLButtonElement | null; if (!btn) return;
    const a = btn.dataset.a, act = btn.dataset.act;
    if (a === 'close') return this.close();
    if (a === 'map') { this.host.openMap(); return; }
    if (btn.dataset.tab) { this.tab = btn.dataset.tab as Tab; this.render(); return; }
    if (btn.dataset.conn) { const id = btn.dataset.conn as ConnItem; this.do(b.review(this.who('secure_ops'), id, id === 'identity' ? this.pickEndpoint : id === 'account' ? this.pickAccount : undefined)); return; }
    if (btn.dataset.tcheck) { this.do(b.treasuryCheck(this.who('treasury'), btn.dataset.tcheck as 'funds', undefined)); return; }
    if (btn.dataset.post) { this.do(b.postLedger(this.who('secure_ops'), btn.dataset.post)); return; }
    if (btn.dataset.rdec) { const [id, dec] = btn.dataset.rdec.split(':'); this.do(b.decide(this.who('secure_ops'), id, dec as 'processed')); return; }
    if (btn.dataset.rest) {
      const k = btn.dataset.rest, r = this.who('secure_ops');
      this.do(k === 'route' ? b.restoreRoute(r) : k === 'dup' ? b.checkDuplicates(r) : k === 'cycle' ? b.monitorCycle(r) : k === 'off' ? b.deactivate(r) : (() => { const p = b.postLedger(r, 'B'); return p.ok ? b.decide(r, 'B', 'processed') : p; })());
      return;
    }
    switch (act) {
      case 'assess': this.do(b.setAffected(this.who('secure_ops'), [...this.affected])); break;
      case 'pause': this.do(b.pauseRetries(this.who('secure_ops'))); break;
      case 'preserve': this.do(b.preserveQueue(this.who('secure_ops'))); break;
      case 'scope': this.do(b.agreeScope(this.who('strategic'), [...this.scopeTypes], this.scopeLimit, this.scopeHours)); break;
      case 'reviewprov': this.do(b.reviewProvider(this.who('strategic'))); break;
      case 'stratok': this.do(b.strategicApprove(this.who('strategic'))); break;
      case 'indok': this.do(b.independentApproveScope(this.who('independent'))); break;
      case 'escalate': this.do(b.escalate(this.who('secure_ops'))); break;
      case 'defer': this.do(b.deferSafely(this.who('secure_ops'))); break;
      case 'handshake': this.do(b.handshake(this.who('secure_ops'))); break;
      case 'novalue': this.do(b.noValueTest(this.who('secure_ops'))); break;
      case 'verifyb': this.do(b.verifySupplier(this.who('independent'), 'B')); break;
      case 'batch': this.do(b.prepareBatch(this.who('ap'))); break;
      case 'tacct': { const sel = $(this.box!, 'input[name=tacct]:checked') as HTMLInputElement | null; this.do(b.treasuryCheck(this.who('treasury'), 'account', (sel?.value ?? 'payroll') as 'ops')); break; }
      case 'tsign': this.do(b.treasurySign(this.who('treasury'))); break;
      case 'indbatch': this.do(b.independentApproveBatch(this.who('independent'))); break;
      case 'submit': this.do(b.submit(this.who('secure_ops'), { extra: this.resend ? ['C', 'D'] : [] })); break;
      case 'investc': this.do(b.investigateC(this.who('secure_ops'), [...this.cEvidence])); break;
    }
  }
}
