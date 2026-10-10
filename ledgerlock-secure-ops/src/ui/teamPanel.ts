import type { DialogSpec, Tone } from '../game/types';
import type { GameState } from '../game/systems/GameState';
import type { SceneApi } from '../game/sceneApi';
import type { InboxItem, Member } from '../game/systems/Team';
import { settings } from '../game/systems/Settings';
import { sfx } from '../game/systems/Sfx';
import { TOOL_BY_ID } from '../data/tools';
import { describeTarget } from '../data/targets';
import { $$, esc } from './dom';

interface Host { openDialog(d: DialogSpec): void; toast(html: string, tone?: Tone): void }

/** Manager mode and Auto-play panel: the crew, their orders, Auto switches, speed and the message inbox. */
export class TeamPanel {
  private open: boolean;
  private more: string | null = null;
  private sig = '';
  private seen = 0;

  constructor(private box: HTMLElement, private btn: HTMLElement, private state: GameState, private scene: SceneApi, private host: Host) {
    this.open = settings.data.team || window.innerWidth > 1000;
    btn.onclick = () => { this.open = !this.open; this.sig = ''; this.tick(); };
    this.box.addEventListener('click', (e) => this.onClick(e));
    this.box.addEventListener('change', (e) => this.onChange(e));
    this.tick();
  }

  private get team() { return this.scene.team; }

  /** Called a few times a second: re-render only when something visible changed. */
  tick(): void {
    const t = this.team, s = this.state;
    if (!t) return;
    if (s.speed > 1 && !t.anyAuto()) s.speed = 1;                                  // fast-forward only makes sense while Auto is running
    for (const it of [...t.inbox].reverse()) if (it.id > this.seen) {
      this.seen = it.id;
      if (it.kind === 'decision') { this.host.toast(`<b>${esc(it.member)} needs your call:</b> ${esc(it.title)}. Open the Team panel.`, 'warn'); sfx.warn(); this.open = true; }
      else if (it.kind === 'alert') { this.host.toast(`<b>${esc(it.title)}.</b> ${esc(it.text ?? '')}`, 'warn'); }
    }
    const crewOn = t.crewOn;
    const pending = t.inbox.filter((i) => i.kind === 'decision' && !i.resolved).length;
    this.btn.classList.toggle('on', t.anyAuto() || crewOn);
    this.btn.innerHTML = `${crewOn ? '\u{1F465} Team' : '⏵ Auto'}${pending ? ` <span class="badge">${pending}</span>` : ''}`;
    this.box.classList.toggle('hidden', !this.open || s.complete);
    document.body.classList.toggle('team-open', this.open && !s.complete);
    if (!this.open) return;
    const sug = t.crew.map((m) => t.suggestion(m)?.id ?? '-').join(',');
    const sig = [crewOn, s.speed, settings.data.autoDecide, this.more, s.selectedTool, s.selectedTarget, sug, t.members.map((m) => `${m.id}${m.auto}${m.phase}${m.note}`).join('|'), t.inbox.map((i) => i.id + (i.resolved ? 'x' : '') + (i.text?.length ?? 0)).slice(0, 8).join(',')].join(';');
    if (sig === this.sig) return;
    this.sig = sig; this.render();
  }

  private render(): void {
    const t = this.team, s = this.state, crewOn = t.crewOn;
    const members = crewOn ? t.members : t.members.slice(0, 1);
    const inbox = t.inbox.filter((i) => !i.resolved).slice(0, 5);
    const card = (m: Member) => {
      const crew = m.id !== 'you', ext = this.more === m.id;
      const sug = crew ? t.suggestion(m) : null;
      const sel = s.selectedTarget, tg = sel ? describeTarget(sel) : null, tool = TOOL_BY_ID[s.selectedTool];
      const pend = m.pending && !m.pending.resolved;
      return `<div class="tm ${m.phase}${pend ? ' ask' : ''}" data-m="${m.id}">
        <i class="dot" style="background:#${m.color.toString(16).padStart(6, '0')}"></i>
        <div class="who"><b>${esc(m.name)}</b> <small>${esc(m.title)}</small><div class="st">${esc(m.note)}</div></div>
        <label class="auto" title="Auto: ${crew ? m.name + ' picks the next best task and carries it out' : 'your avatar follows the playbook; move or click to take over'}"><input type="checkbox" data-t="auto" ${m.auto ? 'checked' : ''}> Auto</label>
        <button data-t="more" aria-expanded="${ext}" title="Orders">${ext ? '▴' : '▾'}</button>
        ${ext ? `<div class="ord">
          ${crew ? `<button data-t="sugg" ${sug ? '' : 'disabled'} title="Give ${esc(m.name)} the next task for their role">▶ ${sug ? esc(sug.label) : 'Nothing ready for them'}</button>
          <button data-t="send" ${tg ? '' : 'disabled'} title="Select a tool on the belt and a target on the map first">Use ${esc(tool.name)} → ${tg ? esc(tg.name) : 'select a target'}</button>
          <button data-t="read" ${tg && tg.kind !== 'room' && tg.kind !== 'route' ? '' : 'disabled'}>Read / use (no tool) → ${tg ? esc(tg.name) : '…'}</button>` : ''}
          <span class="row"><button data-t="look">Look</button><button data-t="stop">Stop</button></span></div>` : ''}
      </div>`;
    };
    const item = (i: InboxItem) => `<div class="it ${i.kind}" data-i="${i.id}"><div><b>${esc(i.member)}:</b> ${esc(i.title)}${i.text ? `<small>${esc(i.text.length > 140 ? i.text.slice(0, 137) + '…' : i.text)}</small>` : ''}</div>
      ${i.kind === 'decision' ? '<button class="primary" data-t="decide">Decide</button>' : i.spec ? '<button data-t="view">View</button>' : ''}<button data-t="dis" aria-label="Dismiss">×</button></div>`;
    this.box.innerHTML = `<div class="th"><b>${crewOn ? 'Team' : 'Auto-play'}</b><span class="spd" role="group" aria-label="Speed">${[1, 2, 4].map((n) => `<button data-t="speed" data-n="${n}" aria-pressed="${s.speed === n}">${n}×</button>`).join('')}</span><button data-t="close" aria-label="Hide panel">×</button></div>
      <label class="sw2"><input type="checkbox" data-t="crew" ${crewOn ? 'checked' : ''}> Team on duty (Manager mode)</label>
      <label class="sw2"><input type="checkbox" data-t="decide-all" ${settings.data.autoDecide ? 'checked' : ''}> ${crewOn ? 'Let the team make the calls' : 'Let Auto-play make the calls'}</label>
      ${crewOn ? `<div class="row"><button data-t="allauto">Everyone on Auto</button><button data-t="allstop">Everyone stop</button></div>` : ''}
      <div class="ib">${inbox.length ? inbox.map(item).join('') : '<small class="muted">No messages. Teammates ask here when a choice is yours to make.</small>'}</div>
      ${members.map(card).join('')}
      <small class="muted">${s.stats.autoActions ? `Auto has done ${s.stats.autoActions} action(s): stretch goals are not counted this run.` : 'Stretch goals are earned by hand: they are not counted if Auto does any of the work.'}</small>`;
    $$(this.box, 'button, input').forEach((b) => b.setAttribute('tabindex', '0'));
  }

  private memberOf(el: HTMLElement): Member | undefined { const id = el.closest<HTMLElement>('.tm')?.dataset.m; return id ? this.team.member(id) : undefined; }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement, k = el.dataset.t; if (!k) return;
    sfx.click();
    if (k === 'auto') { const m = this.memberOf(el); if (m) { this.team.setAuto(m.id, el.checked); if (m.id === 'you' && el.checked) this.scene.returnToPlayer(); } }
    if (k === 'crew') { settings.set('team', el.checked); this.team.setCrew(el.checked); }
    if (k === 'decide-all') settings.set('autoDecide', el.checked);
    this.sig = ''; this.tick();
  }

  private onClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('button'); if (!b || b.tagName !== 'BUTTON') return;
    const k = b.dataset.t; if (!k) return;
    const t = this.team, s = this.state, m = this.memberOf(b);
    sfx.click();
    switch (k) {
      case 'close': this.open = false; break;
      case 'speed': s.speed = Number(b.dataset.n) || 1; break;
      case 'more': if (m) this.more = this.more === m.id ? null : m.id; break;
      case 'look': if (m) this.scene.focusMember(m.id); setTimeout(() => this.scene.returnToPlayer(), 2600); break;
      case 'stop': if (m) t.recall(m.id); break;
      case 'allauto': t.setAllAuto(true); break;
      case 'allstop': t.setAllAuto(false); for (const x of t.crew) t.recall(x.id); break;
      case 'sugg': { const a = m && t.suggestion(m); if (m && a) { const err = t.order(m.id, { actionId: a.id }); if (err) this.host.toast(esc(err), 'warn'); } break; }
      case 'send': case 'read': {
        if (!m || !s.selectedTarget) break;
        const err = t.order(m.id, { tool: k === 'read' ? 'e' : s.selectedTool, target: s.selectedTarget });
        if (err) this.host.toast(esc(err), 'warn'); else this.host.toast(`<b>${esc(m.name)}</b> is on it.`, 'good');
        break;
      }
      case 'decide': case 'view': case 'dis': {
        const id = Number(b.closest<HTMLElement>('.it')?.dataset.i), it = t.inbox.find((x) => x.id === id); if (!it) break;
        if (k === 'dis') t.dismiss(id);
        else if (it.spec) this.host.openDialog(it.spec);
        break;
      }
    }
    this.sig = ''; this.tick();
  }
}
