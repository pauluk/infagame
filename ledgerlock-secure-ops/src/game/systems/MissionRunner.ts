import type { PassId, RoomId, ToolId, Tone } from '../types';
import type { ContainmentCfg, MissionApi } from '../../data/missions/types';
import { describeTarget, type TargetInfo } from '../../data/targets';
import { TOOL_BY_ID } from '../../data/tools';
import { PASSES } from '../../data/passes';
import { ROUTES, routeRooms } from '../../data/routes';
import { ROOM_BY_ID } from '../../data/map';
import type { GameState } from './GameState';

const matches = (spec: string | string[] | ((id: string) => boolean), id: string) =>
  typeof spec === 'function' ? spec(id) : Array.isArray(spec) ? spec.includes(id) : spec === id;

/** Runs a data-driven mission against a GameState. Contains no rendering code. */
export class MissionRunner {
  readonly m;
  readonly api: MissionApi;
  private timeScale: number;

  constructor(public s: GameState) {
    this.m = s.mission;
    this.timeScale = s.relaxed ? 0.5 : 1;
    this.api = this.makeApi();
  }

  start(): void {
    this.m.setup?.(this.api);
    this.s.log(`Incident opened: ${this.m.alert.headline}`, 'alert');
    this.recompute();
  }

  private makeApi(): MissionApi {
    const s = this.s, runner = this;
    return {
      s, data: s.data,
      flag: (k, v = true) => s.setFlag(k, v),
      has: (k) => !!s.flags[k],
      say(title, text, tone = 'info', extra = {}) {
        s.latestResult = { title, text, tone, hint: extra.hint };
        if (extra.hint) s.stats.hintsUsed++;
        s.emit('result', s.latestResult);
        s.log(`${title}: ${text}`, tone);
        s.changed();
      },
      clue(id, label, text) { if (s.addClue(id, label, text)) s.log(`Clue found: ${label}`, 'clue'); },
      evidence(id) {
        const ev = runner.m.evidence.find((e) => e.id === id);
        if (!ev) return false;
        if (!s.passes.has(ev.requiredPass)) {
          this.say('Access denied', `${ev.name} needs the ${PASSES[ev.requiredPass].name}.`, 'warn', { hint: true });
          return false;
        }
        if (!s.evidence.has(id)) {
          s.evidence.add(id);
          s.log(`Evidence retrieved: ${ev.name} (${ev.sensitivity})`, 'clue');
          s.score(`Evidence: ${ev.name}`, 'good');
          s.changed();
        }
        return true;
      },
      status: (t, st) => s.setStatus(t, st),
      adjust: (metric, d, why) => {
        s.adjust(metric, d);
        if (why) s.log(`${metric === 'integrity' ? 'Transaction integrity' : 'Data protection'} ${d > 0 ? '+' : ''}${d}%: ${why}`, d < 0 ? 'warn' : 'good');
      },
      hit(key, availability, seconds) { s.hits[key] = { availability, until: seconds ? s.elapsed + seconds : undefined }; s.changed(); },
      entity: (id, patch) => s.setEntity(id, patch),
      removeEntity: (id) => s.removeEntity(id),
      fx: (type, target) => s.emit('fx', { type, target }),
      dialog: (spec) => s.emit('dialog', spec),
      log: (t, tone) => s.log(t, tone),
      unnecessary: () => { s.stats.unnecessary++; },
      contain(target) { s.contained[target] = { rerouted: false, since: s.elapsed }; runner.recompute(); s.emit('fx', { type: 'barrier', target }); },
      release(target) { delete s.contained[target]; runner.recompute(); s.emit('fx', { type: 'release', target }); },
      isContained: (t) => !!s.contained[t],
      routeMark(routeId, state) { s.routeMarks[routeId] = state; runner.recompute(); },
      score: (label, tone, points) => s.score(label, tone, points),
    };
  }

  // ---------- simulation ----------
  tick(dtReal: number): void {
    const s = this.s;
    if (s.paused || s.complete) return;
    const dt = dtReal * this.timeScale;
    s.elapsed += dt;
    for (const [k, h] of Object.entries(s.hits)) if (h.until && s.elapsed >= h.until) delete s.hits[k];
    this.m.tick?.(this.api, dt);
    this.recompute();
    s.stats.availSum += s.availability * dt;
    s.stats.availTime += dt;
    s.stats.minAvail = Math.min(s.stats.minAvail, s.availability);
  }

  containmentFor(target: string): ContainmentCfg & { unneeded?: boolean } {
    const cfg = this.m.containment[target];
    if (cfg) return cfg;
    const kind = target.split(':')[0];
    return { availability: kind === 'room' ? 10 : 3, narrow: 0, notes: [{ text: 'No evidence of the incident here. This would pause valid work for no benefit.', tone: 'warn' }], unneeded: true };
  }

  recompute(): void {
    const s = this.s;
    for (const [target, c] of Object.entries(s.contained)) {
      s.hits['contain:' + target] = { availability: this.containmentFor(target).availability * (c.rerouted ? 0.3 : 1) };
    }
    for (const k of Object.keys(s.hits)) if (k.startsWith('contain:') && !s.contained[k.slice(8)]) delete s.hits[k];
    // route states: quarantining one route never touches unrelated routes; a contained room delays the routes through it
    const containedRooms = Object.keys(s.contained).filter((k) => k.startsWith('room:')).map((k) => k.slice(5) as RoomId);
    for (const r of ROUTES) {
      const c = s.contained['route:' + r.id];
      if (c) s.routeStates[r.id] = c.rerouted ? 'rerouted' : 'quarantined';
      else if (routeRooms(r).some((room) => containedRooms.includes(room))) s.routeStates[r.id] = 'delayed';
      else s.routeStates[r.id] = s.routeMarks[r.id] ?? 'healthy';
    }
    s.incidents = this.m.incidents(s);
    s.changed();
  }

  objectives() { return this.m.objectives.map((o) => ({ id: o.id, text: o.text, hint: o.hint, done: !!o.done(this.s) })); }
  currentObjective() { return this.objectives().find((o) => !o.done) ?? null; }

  checkComplete(): void {
    const s = this.s;
    if (!s.complete && this.m.isComplete(s)) { s.complete = true; s.log('Shift report filed. Incident closed.', 'good'); s.emit('complete', s); }
  }

  // ---------- passes ----------
  requestPass(pass: PassId, via: 'desk' | 'reader'): void {
    const s = this.s, def = PASSES[pass], a = this.api;
    if (s.passes.has(pass)) return a.say('Pass already issued', `${def.name}: ${def.scope}.`, 'info');
    const grant = this.m.passGrants[pass];
    if (grant && grant.when(s)) {
      s.passes.add(pass);
      s.emit('pass', { pass, granted: true });
      a.fx('pass', `room:${def.room}`);
      s.log(`Pass granted (${via === 'desk' ? 'Access Desk' : 'door reader'}): ${def.name}. Read-only, mission-scoped, expires at debrief.`, 'good');
      s.score(`Pass: ${def.name}`, 'good');
      a.say('Pass granted', `${def.name}: ${def.scope}. It expires when this mission ends.`, 'good');
    } else {
      s.stats.passDenials++;
      s.emit('pass', { pass, granted: false });
      const hint = grant?.hint ?? `No current evidence points at ${ROOM_BY_ID[def.room].name}. Request this pass when a clue does. ${def.hint}`;
      s.log(`Pass request denied: ${def.name}.`, 'warn');
      a.say('Request denied', hint, 'warn', { hint: true });
    }
    s.changed();
  }

  // ---------- interaction ----------
  /** E / click on a target with the currently selected tool. Proximity is enforced by the caller (the scene). */
  interact(targetId: string): void {
    const s = this.s, a = this.api;
    const t = describeTarget(targetId);
    if (!t || s.complete) return;
    const tool = TOOL_BY_ID[s.selectedTool];
    s.stats.toolUses++;
    if (tool.id === 'quarantine') return this.quarantine(t);
    if (tool.id === 'reroute') return this.reroute(t);
    const rule = this.m.rules.find((r) => r.tool === tool.id && matches(r.target, targetId));
    if (rule) {
      const block = rule.requires?.(s);
      if (typeof block === 'string') return a.say('Not just yet', block, 'warn', { hint: true });
      const go = () => { rule.run(a, t); this.checkComplete(); };
      const conf = rule.confirm?.(s);
      if (conf) a.dialog({ type: 'confirm', title: conf.title, body: conf.body, why: tool.why, impacts: conf.impacts, confirmLabel: conf.confirmLabel ?? 'Go ahead', onConfirm: go });
      else go();
      return;
    }
    const inter = this.m.interactions?.[targetId];
    if (inter) { inter(a, t); this.checkComplete(); return; }
    if (this.baseInteraction(t)) return;
    this.fallback(tool.id, t);
  }

  /** Interaction that needs no tool (E on readers, desk, board, plain props). */
  inspect(targetId: string): void {
    const s = this.s, t = describeTarget(targetId);
    if (!t) return;
    const inter = this.m.interactions?.[targetId];
    if (inter) { inter(this.api, t); this.checkComplete(); return; }
    if (this.baseInteraction(t)) return;
    this.api.say(t.name, t.desc, 'info');
    void s;
  }

  private baseInteraction(t: TargetInfo): boolean {
    const a = this.api;
    if (t.kind === 'reader' && t.door) { a.dialog({ type: 'access', readerRoom: t.door.room }); return true; }
    if (t.id === 'prop:secure_ops.access_desk') { a.dialog({ type: 'access' }); return true; }
    if (t.id === 'prop:secure_ops.evidence_board') { a.dialog({ type: 'board' }); return true; }
    if (t.id === 'prop:secure_ops.map_table') { this.s.emit('ui', 'map'); return true; }
    if (t.id === 'prop:secure_ops.coffee') { a.say('Coffee Machine', 'You pour a coffee. The incident log notes: "Morale +3%." (Not a real metric.)', 'info'); return true; }
    if (t.kind === 'ext') { a.say(t.name, `${t.desc} This is a simulated external service: the game never sends real payments.`, 'info'); return true; }
    if (t.kind === 'prop' && !t.prop!.interactive) { a.say(t.name, t.prop!.desc, 'info'); return true; }
    return false;
  }

  private fallback(tool: ToolId, t: TargetInfo): void {
    const a = this.api, s = this.s;
    switch (tool) {
      case 'scanner':
        if (!s.status[t.id]) s.setStatus(t.id, 'ok');
        return a.say(`${t.name}: no anomalies`, 'Signal Scanner shows normal activity here. Ruling things out is useful too.', 'good');
      case 'lens': return a.say(`${t.name}: routine history`, 'The event sequence here looks ordinary. Nothing points to a source of the incident.', 'info');
      case 'patch': return a.say('Nothing to patch', 'Patch Kit needs an identified software fault. Scan and investigate first.', 'info');
      case 'token':
        a.unnecessary(); a.hit('token:' + t.id, 4, 20);
        return a.say('Credential rotated', `A simulated credential near ${t.name} was refreshed. No exposure was suspected, so this briefly interrupted a service for no gain.`, 'warn');
      case 'restore': return a.say('No restore needed', `${t.name} has no known-bad state. A restore here would only add risk.`, 'info');
      case 'recon': return a.say('Totals agree', `Expected and received totals match for ${t.name}. (Simulated check.)`, 'good');
      default: return a.say('No effect', 'That tool does nothing here.', 'info');
    }
  }

  private quarantine(t: TargetInfo): void {
    const a = this.api, s = this.s;
    if (t.kind !== 'room' && t.kind !== 'route') return a.say('Pick a room or route', 'Quarantine Field works on a room or a route. Click a flow line or the room floor to select it.', 'info', { hint: true });
    const cfg = this.containmentFor(t.id);
    if (s.contained[t.id]) {
      const block = cfg.canRelease?.(s);
      if (typeof block === 'string') return a.say('Not safe to release yet', block, 'warn', { hint: true });
      return a.dialog({
        type: 'confirm', title: `Release containment on ${t.name}?`, body: 'Normal flow resumes immediately.', why: 'Releasing restores availability. Do it once the cause is fixed and verified.',
        impacts: [{ label: 'Service availability', text: 'Recovers', tone: 'good' }], confirmLabel: 'Release',
        onConfirm: () => { a.release(t.id); cfg.onRelease?.(a); a.say('Containment released', `${t.name} is flowing again.`, 'good'); this.checkComplete(); },
      });
    }
    a.dialog({
      type: 'confirm', title: `Contain ${t.name}?`, body: 'Preview of what this will do before you commit:', why: TOOL_BY_ID.quarantine.why,
      impacts: [{ label: 'Service availability', text: `−${cfg.availability}% while contained`, tone: cfg.availability >= 8 ? 'bad' : 'warn' },
        ...cfg.notes.map((n) => ({ label: n.label ?? 'Note', text: n.text, tone: (n.tone ?? 'info') as Tone }))],
      confirmLabel: 'Contain',
      onConfirm: () => {
        if ((cfg as { unneeded?: boolean }).unneeded) a.unnecessary();
        a.contain(t.id); cfg.onApply?.(a);
        s.score(`Contained ${t.name}`, cfg.effective ? 'good' : 'warn');
        a.say('Containment active', `${t.name} is contained.${cfg.applyText ? ' ' + cfg.applyText : ''}`, cfg.effective ? 'good' : 'warn');
        this.checkComplete();
      },
    });
  }

  private reroute(t: TargetInfo): void {
    const a = this.api, s = this.s;
    if (t.kind !== 'route') return a.say('Pick a route', 'Flow Rerouter works on a contained route. Click a flow line.', 'info', { hint: true });
    const c = s.contained[t.id];
    if (!c) return a.say('Nothing to route around', 'Flow Rerouter helps once a route is contained. Contain it first, then reroute valid traffic.', 'info', { hint: true });
    if (c.rerouted) return a.say('Already rerouted', 'Valid traffic is already using the alternate route.', 'info');
    const cfg = this.containmentFor(t.id);
    if (!cfg.canReroute) return a.say('No safe alternate route', `There is no verified alternate route for ${t.name}.`, 'info');
    a.dialog({
      type: 'confirm', title: `Reroute valid traffic around ${t.name}?`, body: 'Legitimate receipt events will use the Card Receipt route (via Accounts Receivable) while the replay path stays contained.',
      why: TOOL_BY_ID.reroute.why,
      impacts: [{ label: 'Service availability', text: 'Most of the loss is recovered', tone: 'good' }, { label: 'Safety', text: 'The Card Receipt route de-duplicates by receipt ID', tone: 'good' }],
      confirmLabel: 'Reroute',
      onConfirm: () => { c.rerouted = true; this.recompute(); cfg.onReroute?.(a); a.fx('sparkle', t.id); s.score('Rerouted valid receipts', 'good'); a.say('Traffic rerouted', 'Valid receipts now flow via the Card Receipt route and keep posting on time.', 'good'); this.checkComplete(); },
    });
  }

  /** Evidence Board "File report". */
  fileReport(): void {
    const s = this.s;
    const ok = this.m.canReport(s);
    if (ok !== true) { this.api.say('Report not ready', ok, 'warn', { hint: true }); return; }
    s.setFlag('reported'); this.checkComplete();
  }

  /** Called by the scene whenever the player's room changes. */
  onEnterRoom(room: RoomId | null): void {
    if (!room) return;
    this.s.setFlag('visited_' + room);
  }
}
