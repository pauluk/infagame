import { PALETTE } from '../game/constants';
import type { DialogSpec, PassId, RoomId, ToolId, Tone } from '../game/types';
import type { GameState } from '../game/systems/GameState';
import type { MissionRunner } from '../game/systems/MissionRunner';
import type { SceneApi } from '../game/sceneApi';
import { settings } from '../game/systems/Settings';
import { sfx } from '../game/systems/Sfx';
import { computeScore } from '../game/systems/Scoring';
import { TOOLS, TOOL_BY_ID } from '../data/tools';
import { MISSIONS, MISSION_BY_ID } from '../data/missions';
import { PASSES } from '../data/passes';
import { FAC_H, FAC_W, FAC_X0, FAC_Y0, GRID, ROOMS, ROOM_BY_ID, EXTERNAL_BY_ID, EXTERNALS } from '../data/map';
import { ROUTES, ROUTE_BY_ID, STATE_LABEL, routePoints } from '../data/routes';
import { describeTarget } from '../data/targets';
import { app } from '../app';
import { $, $$, el, esc, toneIcon } from './dom';
import { loadToolIcons } from './icons';
import type { FabricSnapshot } from '../integrations/fabric';

const SEEN_KEY = 'ledgerlock.tutorialSeen';
const nameOf = (id: string) => (ROOM_BY_ID[id as RoomId]?.name ?? (id.startsWith('prop:') ? describeTarget(id)?.name : EXTERNAL_BY_ID[id] ? `${EXTERNAL_BY_ID[id].name} (simulated external service)` : id));
const COLOR_HEX = PALETTE as Record<string, string>;

export class UI {
  private screen: HTMLElement;
  private hud: HTMLElement | null = null;
  private state: GameState | null = null;
  private runner: MissionRunner | null = null;
  private scene: SceneApi | null = null;
  private icons: Record<string, string> = {};
  private unsub: (() => void)[] = [];
  private dialogOpen = false;
  private pauseOpen = false;
  private panelOpen: string | null = null;
  private dirty = false;
  private mmTimer = 0;
  private fabTimer = 0;
  private guidePath: { x: number; y: number }[] = [];
  private guideUntil = 0;
  private mmSelected: RoomId | null = null;

  constructor(private root: HTMLElement) {
    this.screen = el('div', { id: 'screens' });
    root.appendChild(this.screen);
    this.applySettings();
    settings.on('change', () => this.applySettings());
    loadToolIcons(TOOLS.map((t) => t.sprite)).then((i) => { this.icons = i; this.renderBelt(); });
    window.addEventListener('resize', () => this.applySettings());
  }

  // ===================================================================== settings ====
  private applySettings(): void {
    const d = settings.data;
    document.body.classList.toggle('reduce-motion', d.reducedMotion);
    document.body.classList.toggle('large-text', d.largeText);
    const touch = d.touch === 'on' || (d.touch === 'auto' && matchMedia('(pointer: coarse)').matches);
    document.body.classList.toggle('phone-simple', window.innerWidth < 560);
    document.body.classList.toggle('touch-on', touch);
    $(this.root, '#touch')?.classList.toggle('hidden', !touch);
  }

  // ===================================================================== screens ====
  private showScreen(html: string, cls = ''): HTMLElement {
    this.screen.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    return this.screen.firstElementChild as HTMLElement;
  }
  private clearScreen(): void { this.screen.innerHTML = ''; }

  showTitle(initial = false): void {
    if (!initial) this.leaveMissionVisuals();
    const s = this.showScreen(`
      <div class="card">
        <h1>LedgerLock: <span style="color:var(--cyan)">Secure Ops</span></h1>
        <div class="sub">A lightly humorous isometric incident game. Fictional finance platform. All data is synthetic.</div>
        <p>You are a Secure Ops engineer. Walk the facility, follow the flow of money and events, investigate, contain with care, and keep valid services running.</p>
        <div class="menu">
          <button class="primary" data-a="start">▶ Start Shift <small style="opacity:.8">(The Duplicate Ghost, tutorial)</small></button>
          <button data-a="missions">Mission Select</button>
          <button data-a="howto">How to Play</button>
          <button data-a="audio">Audio</button>
          <button data-a="access">Accessibility</button>
        </div>
        <p class="ext-note" style="margin-top:14px">Sound effects are generated in your browser and only play after you interact. Art: Quaternius, Kenney and Poly Haven (CC0), rendered with Blender. See ATTRIBUTION.md.</p>
      </div>`, 'clear');
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      if (a === 'start') this.startMission('duplicate-ghost');
      if (a === 'missions') this.showMissionSelect();
      if (a === 'howto') this.showHowTo(() => this.showTitle());
      if (a === 'audio') this.showSettings('audio', () => this.showTitle());
      if (a === 'access') this.showSettings('access', () => this.showTitle());
    });
    (s.querySelector('button.primary') as HTMLElement).focus();
  }

  showMissionSelect(): void {
    const cards = MISSIONS.map((m) => {
      const o = m.outline;
      return `<div class="mcard"><h3>${esc(m.title)} <span class="chip ${m.status === 'playable' ? 'good' : 'info'}">${m.id === 'duplicate-ghost' ? 'Tutorial · full' : 'Playable · simplified'}</span></h3>
        <div class="small">${esc(m.tagline)}</div>
        ${o ? `<div class="small"><b>Objective:</b> ${esc(o.objective)}</div><div class="small"><b>Clues:</b><ul>${o.clues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
        <div class="small"><b>Response choices:</b><ul>${o.choices.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
        <div class="small"><b>Success:</b> ${esc(o.success)}</div>` : `<div class="small">About 5 minutes. Movement, passes, evidence, scanning, containment, patching, reconciliation and verification.</div>`}
        <button class="primary" data-m="${m.id}">Play</button></div>`;
    }).join('');
    const s = this.showScreen(`<div class="card wide"><h2>Mission Select</h2><div class="grid2">${cards}</div><div class="row" style="margin-top:12px"><button data-a="back">← Back</button></div></div>`);
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return; sfx.click();
      if (b.dataset.m) this.startMission(b.dataset.m); else if (b.dataset.a === 'back') this.showTitle();
    });
  }

  showHowTo(next: () => void): void {
    const s = this.showScreen(`<div class="card wide"><h2>How to Play</h2>
      <div class="grid2">
        <div class="mcard"><h3>Move</h3><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys walk across the diamond grid (screen-relative). Click the floor to walk there. On touch screens use the on-screen pad.</p><p class="small">Doors lock until you hold the room's pass. Locked rooms never block the corridors.</p></div>
        <div class="mcard"><h3>Interact</h3><p><kbd>E</kbd> uses the selected tool on the nearest highlighted object. Click an object, flow line or room to inspect it. Door readers show which pass a room needs and let you request it.</p></div>
        <div class="mcard"><h3>Tools</h3><p>Keys <kbd>1</kbd>–<kbd>8</kbd> select a tool: Scanner, Lens, Quarantine, Patch, Token Rotation, Restore, Reconcile, Reroute. Disruptive actions show an impact preview first.</p></div>
        <div class="mcard"><h3>Map and camera</h3><p><kbd>M</kbd> minimap (click a room for a corridor guide), <kbd>R</kbd> route overlay, <kbd>F</kbd> Fabric panel, <kbd>L</kbd> log, <kbd>C</kbd> return to player, wheel or <kbd>+</kbd>/<kbd>−</kbd> zoom, drag to pan.</p><p><kbd>Esc</kbd> pauses.</p></div>
      </div>
      <p class="small">Goal: find the narrowest safe fix, verify it, and keep valid finance services flowing. Cyan = API and events, blue = outbound payments, mint = card and recovery, violet = debt and agency, periwinkle = Fabric analytics, amber = needs investigation, coral = confirmed threat. Every status also has a label and icon.</p>
      <div class="row"><button class="primary" data-a="ok">Got it</button></div></div>`);
    s.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) { sfx.click(); try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } next(); } });
    ($(s, 'button.primary') as HTMLElement).focus();
  }

  showSettings(focus: 'audio' | 'access' | 'all', back: () => void): void {
    const d = settings.data;
    const sw = (id: string, label: string, small: string, on: boolean) => `<div class="sw"><label for="${id}">${label}<small>${small}</small></label><input id="${id}" type="checkbox" ${on ? 'checked' : ''} style="width:22px;height:22px"></div>`;
    const audio = `<h3>Audio</h3>${sw('s-mute', 'Mute sound effects', 'Short synthesised beeps. Nothing plays until you interact.', d.muted)}`;
    const access = `<h3>Accessibility</h3>
      ${sw('s-motion', 'Reduced motion', 'Stops pulses, shakes and bobbing. Route direction stays visible with arrows.', d.reducedMotion)}
      ${sw('s-relaxed', 'Relaxed pace', 'Incidents progress at half speed.', d.relaxed)}
      ${sw('s-large', 'Larger text', 'Increases interface text size.', d.largeText)}
      <div class="sw"><label for="s-touch">Touch controls<small>On-screen pad and action buttons.</small></label><select id="s-touch" style="font:inherit;padding:6px;background:#132136;color:inherit;border:1px solid var(--line);border-radius:6px"><option value="auto">Auto</option><option value="on">Always on</option><option value="off">Off</option></select></div>`;
    const s = this.showScreen(`<div class="card"><h2>${focus === 'audio' ? 'Audio' : focus === 'access' ? 'Accessibility' : 'Settings'}</h2>${focus !== 'access' ? audio : ''}${focus !== 'audio' ? access : ''}<div class="row" style="margin-top:12px"><button class="primary" data-a="back">Done</button></div></div>`);
    const q = (id: string) => s.querySelector('#' + id) as HTMLInputElement | null;
    q('s-mute')?.addEventListener('change', (e) => settings.set('muted', (e.target as HTMLInputElement).checked));
    q('s-motion')?.addEventListener('change', (e) => settings.set('reducedMotion', (e.target as HTMLInputElement).checked));
    q('s-relaxed')?.addEventListener('change', (e) => settings.set('relaxed', (e.target as HTMLInputElement).checked));
    q('s-large')?.addEventListener('change', (e) => settings.set('largeText', (e.target as HTMLInputElement).checked));
    const t = s.querySelector('#s-touch') as HTMLSelectElement | null; if (t) { t.value = d.touch; t.addEventListener('change', () => settings.set('touch', t.value as 'auto' | 'on' | 'off')); }
    $(s, 'button.primary')!.addEventListener('click', () => { sfx.click(); back(); });
  }

  // ===================================================================== mission lifecycle ====
  startMission(id: string): void {
    const mission = MISSION_BY_ID[id]; if (!mission || !app.game) return;
    this.clearScreen();
    const sm = app.game.scene;
    sm.getScenes(true).forEach((sc) => sm.stop(sc.scene.key));
    sm.start('Facility', { mission, relaxed: settings.data.relaxed });
  }

  private leaveMissionVisuals(): void {
    this.detachMission();
    const sm = app.game?.scene; if (!sm || sm.isActive('Boot')) return;      // Boot starts the Menu itself once art is loaded
    sm.getScenes(true).forEach((sc) => { if (sc.scene.key !== 'Menu') sm.stop(sc.scene.key); });
    if (!sm.isActive('Menu')) sm.start('Menu');
  }

  attachMission(state: GameState, runner: MissionRunner, scene: SceneApi): void {
    this.detachMission();
    this.state = state; this.runner = runner; this.scene = scene;
    this.buildHud();
    this.unsub.push(
      state.on('change', () => { this.dirty = true; }),
      state.on('result', (r) => { this.toast(`<b>${esc(r.title)}</b> ${esc(r.text)}`, r.tone); this.renderInspect(); sfx[r.tone === 'good' ? 'good' : r.tone === 'warn' ? 'warn' : r.tone === 'bad' ? 'bad' : 'click'](); }),
      state.on('log', () => this.renderLog()),
      state.on('dialog', (d) => this.openDialog(d)),
      state.on('pass', (e) => { this.renderMinimap(); this.renderInspect(); if (e.granted) this.toast(`<b>${esc(PASSES[e.pass].name)}</b> granted`, 'good'); }),
      state.on('ui', (k) => this.openPanel(k)),
    );
    this.mmTimer = window.setInterval(() => { this.renderMinimap(); if (this.dirty) { this.dirty = false; this.renderHud(); this.renderInspect(); } }, 100);
    this.fabTimer = window.setInterval(() => void this.refreshFabric(), 2500);
    void this.refreshFabric();
    this.renderHud(); this.renderBelt(); this.renderInspect(); this.renderLog(); this.applySettings();
    const begin = () => this.showBriefing();
    let seen = false; try { seen = !!localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
    state.paused = true;
    if (seen) begin(); else this.showHowTo(begin);
  }

  detachMission(): void {
    this.unsub.forEach((u) => u()); this.unsub = [];
    clearInterval(this.mmTimer); clearInterval(this.fabTimer);
    this.hud?.remove(); this.hud = null; this.state = null; this.runner = null; this.scene = null; this.dialogOpen = false; this.pauseOpen = false;
    $(this.root, '#dialog')?.remove(); $(this.root, '#panelmodal')?.remove();
  }

  private showBriefing(): void {
    const st = this.state!; const m = st.mission;
    const s = this.showScreen(`<div class="card"><div class="chip warn">${esc(m.alert.severity)} severity · Incident briefing</div>
      <h2 style="margin-top:8px">${esc(m.title)}</h2>
      <div class="sub">${esc(m.alert.headline)}</div>
      <p><b>Symptoms</b></p><ul>${m.alert.symptoms.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p><b>Likely impact:</b> ${esc(m.alert.impact)}</p>
      <p><b>Points at:</b> ${esc(ROOM_BY_ID[m.alert.points].name)} (${esc(ROOM_BY_ID[m.alert.points].code)})</p>
      ${m.briefing.map((b) => `<p>${esc(b)}</p>`).join('')}
      <div class="row" style="margin-top:12px"><button class="primary" data-a="go">Begin investigation</button><button data-a="how">How to play</button></div></div>`);
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      if (a === 'go') { this.clearScreen(); st.paused = false; st.log('Shift started. Coffee status: optimistic.', 'info'); }
      if (a === 'how') this.showHowTo(() => this.showBriefing());
    });
    ($(s, 'button.primary') as HTMLElement).focus();
  }

  togglePause(): void {
    if (!this.state || this.dialogOpen) return;
    if (this.pauseOpen) { this.pauseOpen = false; this.clearScreen(); this.state.paused = false; return; }
    this.pauseOpen = true; this.state.paused = true;
    const s = this.showScreen(`<div class="card"><h2>Paused</h2><p>The incident clock is stopped.</p>
      <div class="menu"><button class="primary" data-a="resume">Resume</button><button data-a="restart">Restart mission</button><button data-a="howto">How to Play</button><button data-a="settings">Audio and accessibility</button><button data-a="missions">Mission Select</button><button data-a="title">Quit to title</button></div></div>`);
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      const mid = this.state!.mission.id;
      if (a === 'resume') this.togglePause();
      if (a === 'restart') { this.pauseOpen = false; this.startMission(mid); }
      if (a === 'howto') this.showHowTo(() => { this.pauseOpen = false; this.togglePause(); });
      if (a === 'settings') this.showSettings('all', () => { this.pauseOpen = false; this.togglePause(); });
      if (a === 'missions') { this.pauseOpen = false; this.leaveMissionVisuals(); this.showMissionSelect(); }
      if (a === 'title') { this.pauseOpen = false; this.showTitle(); }
    });
    ($(s, 'button.primary') as HTMLElement).focus();
  }

  showDebrief(state: GameState): void {
    sfx.win();
    const score = computeScore(state);
    const deb = state.mission.debrief(state);
    const sm = app.game!.scene; sm.getScenes(true).forEach((sc) => sm.stop(sc.scene.key)); sm.start('Debrief');
    this.detachMission();
    const s = this.showScreen(`<div class="card wide"><div class="row" style="align-items:flex-start;gap:20px">
      <div style="flex:1;min-width:260px"><div class="chip good">Mission complete</div><h2 style="margin-top:6px">${esc(state.mission.title)}: debrief</h2>
        <div class="score">${score.total}<span style="font-size:.35em;opacity:.8"> / 100</span></div><div class="sub">${esc(score.rating)}</div><p>${esc(score.message)}</p>
        <table class="t">${score.parts.map((p) => `<tr><td>${esc(p.label)}<div class="bar2"><i style="width:${(p.points / p.max) * 100}%"></i></div><div class="small" style="opacity:.75">${esc(p.note)}</div></td><td style="white-space:nowrap"><b>${p.points}</b> / ${p.max}</td></tr>`).join('')}</table></div>
      <div style="flex:1;min-width:260px"><h3>What happened</h3><p>${esc(deb.what)}</p><h3>Your response</h3><ul>${deb.response.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <h3>Effect on service</h3><table class="t"><tr><th>Measure</th><th>Result</th></tr>
          <tr><td>Service availability</td><td>average ${Math.round(state.stats.availSum / Math.max(1, state.stats.availTime))}%, lowest ${state.stats.minAvail}%</td></tr>
          <tr><td>Transaction integrity</td><td>${state.integrity}% at the end</td></tr><tr><td>Data protection</td><td>${state.protection}% (masked, read-only evidence only)</td></tr>
          <tr><td>Passes used</td><td>${[...state.passes].filter((p) => p !== 'ops_pass').map((p) => esc(PASSES[p].name)).join(', ') || 'none'} (expired now)</td></tr></table>
        <h3>What to take away</h3><p>${esc(deb.learn)}</p></div></div>
      <div class="row" style="margin-top:10px"><button class="primary" data-a="again">Replay mission</button><button data-a="missions">Mission Select</button><button data-a="title">Title</button></div></div>`);
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      if (a === 'again') this.startMission(state.mission.id); if (a === 'missions') { this.leaveMissionVisuals(); this.showMissionSelect(); } if (a === 'title') this.showTitle();
    });
  }

  // ===================================================================== HUD ====
  private buildHud(): void {
    const hud = el('div', { id: 'hudroot' }, `
      <div id="hud"><div class="hud-row" id="meters"></div><div class="hud-row"><div id="objective" role="status" aria-live="polite"></div>
        <div class="hud-btns"><button id="b-map" title="Minimap (M)">▦ Map</button><button id="b-fabric" title="Fabric panel (F)">◈ Fabric</button><button id="b-log" title="Incident log (L)">☰ Log</button><button id="b-routes" title="Toggle route overlay (R)" aria-pressed="true">⤳ Routes</button><button id="b-mute" title="Mute sound">♪</button><button id="b-pause" title="Pause (Esc)">⏸</button></div></div></div>
      <div id="tooltip"></div>
      <div id="belt" role="toolbar" aria-label="Tool belt"></div>
      <div id="inspect" class="open"></div>
      <div id="minimap-wrap"><canvas id="mm" width="520" height="400" aria-label="Facility minimap"></canvas>
        <div class="mm-btns"><button id="mm-ret" title="Return camera to player (C)">⌖ Return to player</button><button id="mm-zi">+</button><button id="mm-zo">−</button></div>
        <div id="passes"></div><div id="legend"></div></div>
      <div id="toasts" aria-live="polite"></div>
      <div id="logpanel" class="hidden"></div>
      <div id="touch"><div class="dpad"><span></span><button data-d="-1,-1" aria-label="Move up">↑</button><span></span><button data-d="-1,1" aria-label="Move left">←</button><span></span><button data-d="1,-1" aria-label="Move right">→</button><span></span><button data-d="1,1" aria-label="Move down">↓</button><span></span></div>
        <div class="act"><button class="primary" id="t-e" aria-label="Interact">E</button><button id="t-esc" aria-label="Pause">⏸</button></div></div>`);
    this.root.appendChild(hud); this.hud = hud;
    $(hud, '#b-map')!.onclick = () => this.openPanel('map');
    $(hud, '#b-fabric')!.onclick = () => this.openPanel('fabric');
    $(hud, '#b-log')!.onclick = () => this.openPanel('log');
    $(hud, '#b-pause')!.onclick = () => this.togglePause();
    $(hud, '#b-mute')!.onclick = () => settings.set('muted', !settings.data.muted);
    $(hud, '#b-routes')!.onclick = (e) => { const v = !this.scene!.routesVisible(); this.scene!.setRoutesVisible(v); (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(v)); };
    $(hud, '#mm-ret')!.onclick = () => this.scene!.returnToPlayer();
    $(hud, '#mm-zi')!.onclick = () => this.scene!.zoomBy(0.2);
    $(hud, '#mm-zo')!.onclick = () => this.scene!.zoomBy(-0.2);
    $(hud, '#t-e')!.addEventListener('pointerdown', (e) => { e.preventDefault(); this.scene!.useTool(); });
    $(hud, '#t-esc')!.onclick = () => this.togglePause();
    $$(hud, '.dpad button').forEach((b) => {
      const [dx, dy] = b.dataset.d!.split(',').map(Number);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.scene!.setTouchDir(dx, dy); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => this.scene!.setTouchDir(0, 0));
    });
    $(hud, '#mm')!.addEventListener('click', (e) => this.minimapClick(e as MouseEvent));
    $(hud, '#legend')!.innerHTML = [['cyan', 'API / events'], ['blue', 'Outbound payments'], ['mint', 'Card / return'], ['violet', 'Debt / agency'], ['periwinkle', 'Fabric analytics'], ['amber', 'Needs investigation'], ['coral', 'Confirmed threat']].map(([c, l]) => `<span><i style="background:${COLOR_HEX[c]}"></i>${l}</span>`).join('');
    settings.on('change', () => { const b = $(hud, '#b-mute'); if (b) b.textContent = settings.data.muted ? '♪✕' : '♪'; });
    this.applySettings();
  }

  toast(html: string, tone: Tone = 'info'): void {
    const box = $(this.root, '#toasts'); if (!box) return;
    const t = el('div', { class: `toast ${tone}` }, `${toneIcon(tone)} ${html}`);
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild!.remove();
    setTimeout(() => t.remove(), tone === 'good' ? 5500 : 7500);
  }

  private meter(id: string, icon: string, label: string, valText: string, pct: number, level: 'ok' | 'warn' | 'bad', extra = ''): string {
    const lvl = level === 'bad' ? 'bad' : level === 'warn' ? 'warn' : '';
    return `<div class="meter ${lvl}" id="m-${id}"><div class="top"><span aria-hidden="true">${icon}</span><span>${label}</span><span class="val">${valText}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><div class="state">${level === 'bad' ? '✕ Critical' : level === 'warn' ? '⚠ Watch' : '✓ OK'} ${extra}</div></div>`;
  }

  private renderHud(): void {
    const st = this.state, hud = this.hud; if (!st || !hud) return;
    const lv = (v: number, w = 85, b = 60): 'ok' | 'warn' | 'bad' => (v < b ? 'bad' : v < w ? 'warn' : 'ok');
    const left = st.deadlineLeft, mission = st.mission;
    const dl = left >= 0 ? `${Math.floor(left)} min` : 'LATE';
    const snap = st.fabricSnapshot;
    const fresh = st.freshness;
    const badge = snap ? (snap.mode === 'demo' ? '<span class="badge-demo">Demo data</span>' : '<span class="badge-live">Connected</span>') : '<span class="badge-demo">Demo data</span>';
    $(hud, '#meters')!.innerHTML =
      this.meter('av', '⚡', 'Service availability', st.availability + '%', st.availability, lv(st.availability, 90, 75)) +
      this.meter('in', '⚖', 'Transaction integrity', st.integrity + '%', st.integrity, lv(st.integrity, 99, 90)) +
      this.meter('pr', '⛨', 'Data protection', st.protection + '%', st.protection, lv(st.protection, 95, 80)) +
      this.meter('dl', '⏱', 'Payment deadline', dl, Math.max(0, (left / (mission.deadlineClock - mission.startClock)) * 100), left < 0 ? 'bad' : left < 10 ? 'warn' : 'ok', `<br>${esc(mission.deadlineLabel)} · ${st.fmtClock()}`) +
      this.meter('fr', '◔', 'Fabric freshness', fresh.toFixed(1) + ' min', 100 - fresh * 4, fresh > 20 ? 'bad' : fresh > 8 ? 'warn' : 'ok', badge) +
      this.meter('ic', '⚠', 'Active incidents', String(st.incidents), st.incidents ? 40 : 100, st.incidents > 1 ? 'bad' : st.incidents ? 'warn' : 'ok', st.incidents ? '(unresolved)' : '(clear)');
    const objs = this.runner!.objectives(); const cur = objs.find((o) => !o.done); const done = objs.filter((o) => o.done).length;
    const showHint = this.hintOpen;
    $(hud, '#objective')!.innerHTML = cur
      ? `<div><div class="n">Objective ${done + 1} of ${objs.length}</div><div class="t">${esc(cur.text)}</div>${showHint ? `<div class="h">→ ${esc(cur.hint)}</div>` : ''}</div><button id="b-hint">${showHint ? 'Hide hint' : 'Hint'}</button>`
      : `<div><div class="n">All objectives done</div><div class="t">Great work.</div></div>`;
    $(hud, '#b-hint')?.addEventListener('click', () => { this.hintOpen = !this.hintOpen; this.renderHud(); });
    const pm = $(hud, '#b-routes'); if (pm) pm.setAttribute('aria-pressed', String(this.scene?.routesVisible() ?? true));
    this.renderPasses();
  }
  private hintOpen = true;

  private renderBelt(): void {
    const belt = this.hud && $(this.hud, '#belt'); if (!belt || !this.state) return;
    belt.innerHTML = TOOLS.map((t) => `<button class="tool" data-t="${t.id}" aria-pressed="${this.state!.selectedTool === t.id}" aria-label="${t.key}: ${esc(t.name)}. ${esc(t.blurb)}"><span class="k">${t.key}</span>${this.icons[t.sprite] ? `<img alt="" src="${this.icons[t.sprite]}">` : `<span class="glyph">${t.icon}</span>`}<span class="nm">${esc(t.short)}</span></button>`).join('');
    $$(belt, '.tool').forEach((b) => (b.onclick = () => this.selectTool(b.dataset.t as ToolId)));
    this.renderTooltip();
  }
  selectTool(id: ToolId): void {
    if (!this.state) return;
    this.state.selectedTool = id; sfx.click(); this.renderBelt(); this.renderInspect(); this.state.changed();
  }
  private renderTooltip(): void {
    const tip = this.hud && $(this.hud, '#tooltip'); if (!tip || !this.state) return;
    const t = TOOL_BY_ID[this.state.selectedTool];
    tip.innerHTML = `<b>${t.key} · ${esc(t.name)}</b>: ${esc(t.blurb)} <span style="opacity:.8">${esc(t.why)}</span> Press <kbd>E</kbd> to use.`;
  }

  // ===================================================================== inspect panel ====
  private statusChip(s?: string): string {
    if (!s) return '<span class="chip">○ Not scanned</span>';
    return ({ suspect: '<span class="chip warn">⚠ Needs investigation</span>', bad: '<span class="chip bad">✕ Confirmed fault</span>', ok: '<span class="chip good">✓ Looks healthy</span>', fixed: '<span class="chip good">✓ Fixed</span>' } as Record<string, string>)[s];
  }

  private renderInspect(): void {
    const st = this.state, box = this.hud && $(this.hud, '#inspect'); if (!st || !box) return;
    this.renderTooltip();
    const t = describeTarget(st.selectedTarget);
    let html = '';
    const tool = TOOL_BY_ID[st.selectedTool];
    if (!t) {
      html = `<h3>Inspect</h3><p>Click an object, a flow line or a room. <kbd>E</kbd> uses <b>${esc(tool.name)}</b> on whatever you stand next to.</p>`;
    } else if (t.route) {
      const r = t.route, state = st.routeStates[r.id] ?? 'healthy', L = STATE_LABEL[state];
      const stateChip = `<span class="chip ${state === 'quarantined' ? 'bad' : state === 'suspicious' || state === 'delayed' ? 'warn' : 'good'}">${L.icon} ${L.label}</span>`;
      html = `<h3>${esc(r.name)}</h3><div class="row"><span class="chip info">Route</span>${stateChip}</div><p>${esc(r.desc)}</p>
        <dl><dt>Source</dt><dd>${esc(nameOf(r.hops[0]))}</dd><dt>Destination</dt><dd>${esc(nameOf(r.hops[r.hops.length - 1]))}</dd><dt>Path</dt><dd>${r.hops.map((h) => esc(nameOf(h))).join(' → ')}</dd><dt>Owner</dt><dd>${esc(r.owner)}</dd><dt>If disrupted</dt><dd>${esc(r.impact)}</dd></dl>
        <div class="row"><button class="primary" data-act="use">Use ${esc(tool.short)} (E)</button><button data-act="focus">Show on map</button></div>`;
    } else if (t.door) {
      const room = t.room!, pass = PASSES[room.requiredPass], has = st.passes.has(room.requiredPass);
      html = `<h3>${esc(t.name)}</h3><div class="row"><span class="chip ${has ? 'good' : 'warn'}">${has ? '✓ Pass held: door open' : '🔒 Locked'}</span></div>
        <dl><dt>Required pass</dt><dd>${esc(pass.name)}</dd><dt>Scope</dt><dd>${esc(pass.scope)}</dd></dl><p>Passes are fictional, read-only, mission-scoped and expire when the mission ends.</p>
        <div class="row"><button class="primary" data-act="use">Open reader (E)</button></div>`;
    } else if (t.room) {
      const room = t.room, pass = PASSES[room.requiredPass], has = st.passes.has(room.requiredPass);
      html = `<h3>${esc(room.name)} <small>(${room.code})</small></h3><div class="row"><span class="chip info">Room</span><span class="chip ${has ? 'good' : 'warn'}">${has ? '✓ Open' : '🔒 Locked'}</span></div><p>${esc(room.blurb)}</p>
        <dl><dt>Pass</dt><dd>${esc(pass.name)}</dd><dt>Scope</dt><dd>${esc(pass.scope)}</dd></dl>
        <div class="row"><button data-act="guide">Guide me there</button><button class="primary" data-act="use">Use ${esc(tool.short)} (E)</button></div>`;
    } else if (t.prop) {
      html = `<h3>${esc(t.name)}</h3><div class="row"><span class="chip info">${t.prop.interactive ? 'Interactive' : 'Decoration'}</span>${t.prop.interactive ? this.statusChip(st.status[t.id]) : ''}</div><p>${esc(t.desc)}</p>
        ${t.prop.interactive ? `<div class="row"><button class="primary" data-act="use">Use ${esc(tool.short)} (E)</button></div>` : ''}`;
    } else if (t.ext) {
      html = `<h3>${esc(t.name)}</h3><div class="row"><span class="chip warn">Simulated external service</span></div><p>${esc(t.desc)}</p><p class="small">The game never sends real payments or connects to a real organisation.</p>`;
    }
    const r = st.latestResult;
    if (r) html += `<div class="res ${r.tone}"><b>${toneIcon(r.tone)} ${esc(r.title)}</b>${esc(r.text)}</div>`;
    box.innerHTML = html;
    box.dataset.empty = t ? '0' : '1';
    $$(box, 'button[data-act]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.act; sfx.click();
      if (a === 'use') this.scene!.useTool();
      if (a === 'focus' && st.selectedTarget) this.scene!.focusOn(st.selectedTarget);
      if (a === 'guide' && t?.room) this.guide(t.room.id);
    }));
  }

  // ===================================================================== minimap ====
  private guide(room: RoomId): void {
    this.mmSelected = room;
    const g = this.scene!.guideToRoom(room);
    if (g) { this.guidePath = g.path.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 })); this.guideUntil = performance.now() + 14000; if (g.locked) this.toast(`<b>${esc(ROOM_BY_ID[room].name)}</b> is locked: the guide leads to its door. Request the ${esc(PASSES[ROOM_BY_ID[room].requiredPass].name)} at the reader.`, 'warn'); }
    else this.toast('No corridor route found.', 'warn');
    this.renderMinimap();
  }

  private mmGeom() { const sc = 520 / (FAC_W + 2); return { sc, ox: -(FAC_X0 - 1) * sc, oy: -(FAC_Y0 - 1) * sc + 6 }; }
  private minimapClick(e: MouseEvent): void {
    const c = e.currentTarget as HTMLCanvasElement, r = c.getBoundingClientRect();
    const { sc, ox, oy } = this.mmGeom();
    const px = ((e.clientX - r.left) / r.width) * 520, py = ((e.clientY - r.top) / r.height) * 400;
    const gx = (px - ox) / sc, gy = (py - oy) / sc;
    const room = ROOMS.find((q) => gx >= q.x0 && gx < q.x0 + q.w && gy >= q.y0 && gy < q.y0 + q.h);
    if (room) { sfx.click(); this.scene!.selectTarget('room:' + room.id); this.guide(room.id); }
  }

  private renderMinimap(): void {
    const st = this.state, cv = this.hud && ($(this.hud, '#mm') as HTMLCanvasElement | null); if (!st || !cv) return;
    const ctx = cv.getContext('2d')!; const { sc, ox, oy } = this.mmGeom();
    ctx.clearRect(0, 0, 520, 400); ctx.fillStyle = PALETTE.navy; ctx.fillRect(0, 0, 520, 400);
    // corridors
    ctx.fillStyle = '#2a4062'; ctx.fillRect(FAC_X0 * sc + ox, FAC_Y0 * sc + oy, FAC_W * sc, FAC_H * sc);
    for (const e of EXTERNALS) { ctx.fillStyle = '#1A2B43'; ctx.strokeStyle = COLOR_HEX[e.color]; ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.fillRect(e.x * sc + ox, e.y * sc + oy, e.w * sc, e.h * sc); ctx.strokeRect(e.x * sc + ox, e.y * sc + oy, e.w * sc, e.h * sc); ctx.setLineDash([]); }
    // rooms
    ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of ROOMS) {
      const has = st.passes.has(r.requiredPass), x = r.x0 * sc + ox, y = r.y0 * sc + oy, w = r.w * sc, h = r.h * sc;
      ctx.fillStyle = has ? 'rgba(157,227,177,0.16)' : 'rgba(11,20,36,0.75)'; ctx.fillRect(x, y, w, h);
      ctx.lineWidth = this.mmSelected === r.id ? 4 : 2; ctx.strokeStyle = this.mmSelected === r.id ? '#fff' : COLOR_HEX[r.accent]; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = PALETTE.white; ctx.fillText(r.code, x + w / 2, y + h / 2 - 6);
      ctx.font = '12px system-ui'; ctx.fillText(has ? '✓ open' : '🔒', x + w / 2, y + h / 2 + 11); ctx.font = 'bold 15px system-ui';
      for (const d of r.doors) for (const c of d.cells) {
        ctx.fillStyle = has ? PALETTE.mint : PALETTE.coral;
        if (has) { ctx.beginPath(); ctx.arc((c.x + 0.5) * sc + ox, (c.y + 0.5) * sc + oy, 3, 0, 6.3); ctx.fill(); } else ctx.fillRect((c.x + 0.1) * sc + ox, (c.y + 0.1) * sc + oy, sc * 0.8, sc * 0.8);
      }
    }
    // incident route
    const ir = st.mission.incidentRoute && ROUTE_BY_ID[st.mission.incidentRoute];
    if (ir) {
      const pts = routePoints(ir); const state = st.routeStates[ir.id];
      ctx.strokeStyle = state === 'quarantined' ? PALETTE.coral : PALETTE.amber; ctx.lineWidth = 4; ctx.setLineDash([8, 5]); ctx.lineDashOffset = -performance.now() / 60;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * sc + ox, y * sc + oy) : ctx.moveTo(x * sc + ox, y * sc + oy))); ctx.stroke(); ctx.setLineDash([]);
    }
    // guide
    if (performance.now() < this.guideUntil && this.guidePath.length) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([2, 4]); ctx.beginPath();
      this.guidePath.forEach((p, i) => (i ? ctx.lineTo(p.x * sc + ox, p.y * sc + oy) : ctx.moveTo(p.x * sc + ox, p.y * sc + oy))); ctx.stroke(); ctx.setLineDash([]);
    }
    // player
    const px = st.player.x * sc + ox, py = st.player.y * sc + oy;
    ctx.fillStyle = PALETTE.cyan; ctx.beginPath(); ctx.arc(px, py, 8, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = PALETTE.white; ctx.font = 'bold 11px system-ui'; ctx.fillText('YOU', px, py - 15); ctx.font = 'bold 15px system-ui';
    cv.title = 'Click a room to show its corridor route (no teleport)';
  }

  private renderPasses(): void {
    const st = this.state, box = this.hud && $(this.hud, '#passes'); if (!st || !box) return;
    box.innerHTML = '<span class="chip" style="font-size:.7em">Passes:</span>' + Object.values(PASSES).map((p) => `<span class="chip ${st.passes.has(p.id) ? 'good' : ''}" title="${esc(p.scope)}">${st.passes.has(p.id) ? '✓' : '🔒'} ${esc(p.name.replace(' Pass', ''))}</span>`).join('');
  }

  // ===================================================================== log ====
  private renderLog(): void {
    const st = this.state, box = this.hud && $(this.hud, '#logpanel'); if (!st || !box) return;
    box.innerHTML = `<h3>Incident log</h3><ul>${st.logEntries.slice(-40).reverse().map((e) => `<li class="${e.tone}"><time>${e.t}</time>${toneIcon(e.tone)} ${esc(e.text)}</li>`).join('')}</ul>`;
  }

  // ===================================================================== panels ====
  openPanel(kind: 'map' | 'log' | 'fabric'): void {
    if (!this.hud || !this.state) return;
    if (kind === 'log') { $(this.hud, '#logpanel')!.classList.toggle('hidden'); return; }
    if (kind === 'map') { const w = $(this.hud, '#minimap-wrap')!; if (document.body.classList.contains('phone-simple')) w.classList.toggle('force-open'); else w.classList.toggle('hidden'); return; }
    if (kind === 'fabric') this.showFabricPanel();
  }

  private async refreshFabric(): Promise<void> {
    const st = this.state; if (!st) return;
    const ctx = {
      elapsedMin: st.elapsed / 8,
      mirrorPaused: !!(st.contained['route:finance_event_mirror'] || st.contained['room:event_stream'] || st.contained['room:fabric_platform'] || st.data.mirrorStuck),
      duplicatesInBronze: st.flags.purged ? 0 : (st.data.spawned ?? 0),
      verified: !!st.flags.fabricVerified,
      extraLag: { bronze: st.data.bronzeLag ?? 0, silver: st.data.silverLag ?? 0, gold: st.data.silverLag ?? 0 },
    };
    const snap = await app.fabric.snapshot(ctx);
    if (this.state !== st) return;
    st.fabricSnapshot = snap; st.freshness = snap.freshnessMin; st.changed();
    if ($(this.root, '#panelmodal [data-fabric]')) this.paintFabric(snap);
  }

  private showFabricPanel(): void {
    if (!this.state || $(this.root, '#panelmodal')) return;
    const m = el('div', { id: 'panelmodal', class: 'screen' }, `<div class="card" data-fabric><div class="row"><h2 style="margin:0">Fabric Data Platform: analytics panel</h2><span id="fabbadge"></span><button style="margin-left:auto" data-a="close">Close</button></div><div id="fabbody"></div></div>`);
    this.root.appendChild(m);
    m.addEventListener('click', (e) => { if ((e.target as HTMLElement).dataset.a === 'close' || e.target === m) m.remove(); });
    if (this.state.fabricSnapshot) this.paintFabric(this.state.fabricSnapshot);
    void this.refreshFabric();
  }
  private paintFabric(s: FabricSnapshot): void {
    const badge = $(this.root, '#fabbadge'), body = $(this.root, '#fabbody'); if (!badge || !body) return;
    badge.innerHTML = s.mode === 'demo' ? '<span class="badge-demo" title="Synthetic data generated locally. Not connected to Microsoft Fabric.">Demo data</span>' : '<span class="badge-live">Connected</span>';
    const stIcon = (x: string) => (x === 'healthy' ? '✓ Healthy' : x === 'delayed' ? '⏸ Delayed' : x === 'stale' ? '⚠ Stale' : x === 'attention' ? '⚠ Needs attention' : '? Unknown');
    body.innerHTML = `<p class="small">Bronze → Silver → Gold feed the reporting display. ${s.mode === 'demo' ? 'All figures are simulated for the game.' : 'Read-only pipeline status from the approved server-side connection.'}</p>
      ${s.stages.map((g) => `<div class="stage"><div><b>${esc(g.name)}</b><div class="ext-note">${esc(g.note ?? '')}</div></div><div><div class="bar2"><i style="width:${Math.max(4, 100 - (g.freshnessMin ?? 0) * 4)}%"></i></div><div class="ext-note">Freshness ${g.freshnessMin ?? 'n/a'} min · ${g.eventCount === null ? 'event count n/a' : g.eventCount.toLocaleString('en-GB') + ' events'}</div></div><div class="chip ${g.status === 'healthy' ? 'good' : 'warn'}">${stIcon(g.status)}</div></div>`).join('')}
      <table class="t"><tr><th>Dashboard</th><td>${esc(s.dashboard.name)}</td></tr><tr><th>Status</th><td><span class="chip ${s.dashboard.status === 'healthy' ? 'good' : 'warn'}">${stIcon(s.dashboard.status)}</span> ${esc(s.dashboard.note)}</td></tr>
      <tr><th>Processed events</th><td>${s.processedEvents === null ? 'n/a' : s.processedEvents.toLocaleString('en-GB')}</td></tr><tr><th>Replays in Bronze</th><td>${s.duplicatesInBronze ?? 'n/a'}</td></tr><tr><th>Worst freshness</th><td>${s.freshnessMin} min</td></tr></table>
      <p class="ext-note">${s.notes.map(esc).join(' ')}</p>`;
  }

  // ===================================================================== dialogs ====
  private closeDialog(): void { $(this.root, '#dialog')?.remove(); this.dialogOpen = false; if (this.state && !this.pauseOpen) this.state.paused = false; }

  private openDialog(d: DialogSpec): void {
    const st = this.state, runner = this.runner; if (!st || !runner) return;
    $(this.root, '#dialog')?.remove();
    const wrap = el('div', { id: 'dialog', class: 'screen' }); this.root.appendChild(wrap);
    this.dialogOpen = true; st.paused = true;
    const card = (html: string, cls = '') => { wrap.innerHTML = `<div class="card ${cls}" role="dialog" aria-modal="true">${html}</div>`; };
    const close = (after?: () => void) => { this.closeDialog(); after?.(); };
    const focusPrimary = () => ($(wrap, 'button.primary') ?? $(wrap, 'button'))?.focus();
    sfx.click();
    switch (d.type) {
      case 'confirm': {
        card(`<div class="chip warn">Impact preview</div><h2 style="margin-top:6px">${esc(d.title)}</h2><p>${esc(d.body)}</p>${d.why ? `<p class="small" style="opacity:.85">Why this tool: ${esc(d.why)}</p>` : ''}
          <div class="impact">${d.impacts.map((i) => `<div class="l">${esc(i.label)}</div><div class="v ${i.tone}">${toneIcon(i.tone)} ${esc(i.text)}</div>`).join('')}</div>
          <div class="row"><button class="primary" data-a="ok">${esc(d.confirmLabel)}</button><button data-a="no">Cancel (no penalty)</button></div>`);
        wrap.onclick = (e) => { const a = (e.target as HTMLElement).dataset.a; if (a === 'ok') close(d.onConfirm); else if (a === 'no') close(); };
        break;
      }
      case 'timeline': {
        card(`<div class="chip info">Forensic Lens</div><h2 style="margin-top:6px">${esc(d.title)}</h2><ul class="tl">${d.steps.map((s) => `<li class="${s.tone}"><time>${esc(s.time)}</time>${esc(s.text)}</li>`).join('')}</ul><p><b>${esc(d.conclusion)}</b></p><div class="row"><button class="primary" data-a="ok">Continue</button></div>`, 'wide');
        wrap.onclick = (e) => { if ((e.target as HTMLElement).dataset.a === 'ok') close(d.onClose); };
        break;
      }
      case 'choice': {
        card(`<h2>${esc(d.title)}</h2><p>${esc(d.body)}</p><div class="options">${d.options.map((o) => `<button data-o="${o.id}"><b>${esc(o.label)}</b><small>${esc(o.detail)}</small></button>`).join('')}</div>`);
        wrap.onclick = (e) => { const o = (e.target as HTMLElement).closest('button')?.dataset.o; if (o) close(() => d.onChoose(o)); };
        break;
      }
      case 'info': {
        const rows = d.rows ? `<table class="t">${d.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : '';
        const cmp = d.compare ? `<div class="grid2"><div class="mcard"><h3>Before</h3><table class="t">${d.compare.before.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></div><div class="mcard" style="border-color:var(--mint)"><h3>✓ After</h3><table class="t">${d.compare.after.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></div></div>` : '';
        card(`<h2>${esc(d.title)}</h2>${rows}${cmp}<p>${esc(d.body)}</p><div class="row"><button class="primary" data-a="ok">Close</button></div>`, d.compare ? 'wide' : '');
        wrap.onclick = (e) => { if ((e.target as HTMLElement).dataset.a === 'ok') close(); };
        break;
      }
      case 'alert': {
        const m = st.mission;
        card(`<div class="chip bad">❗ ${esc(m.alert.severity)} severity alert</div><h2 style="margin-top:6px">${esc(m.alert.headline)}</h2><ul>${m.alert.symptoms.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p><b>Likely impact:</b> ${esc(m.alert.impact)}</p><p><b>Points at:</b> ${esc(ROOM_BY_ID[m.alert.points].name)} (${esc(ROOM_BY_ID[m.alert.points].code)}). You only hold an Ops Pass: request the Payments Audit Pass at the Access Desk.</p><div class="row"><button class="primary" data-a="ok">Understood</button></div>`);
        wrap.onclick = (e) => { if ((e.target as HTMLElement).dataset.a === 'ok') close(); };
        break;
      }
      case 'access': this.paintAccess(wrap, d.readerRoom, close); break;
      case 'board': this.paintBoard(wrap, close); break;
    }
    if (d.type !== 'access' && d.type !== 'board') focusPrimary();
    wrap.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); close(); } });
  }

  private paintAccess(wrap: HTMLElement, readerRoom: RoomId | undefined, close: (a?: () => void) => void): void {
    const st = this.state!, runner = this.runner!;
    const rows = (ids: PassId[]) => ids.map((id) => {
      const p = PASSES[id], has = st.passes.has(id);
      return `<tr><td><b>${esc(p.name)}</b><div class="small">${esc(ROOM_BY_ID[p.room].name)} · ${esc(p.scope)}</div></td><td>${has ? '<span class="chip good">✓ Issued</span>' : '<span class="chip warn">🔒 Not held</span>'}</td><td>${has ? '' : `<button data-req="${id}">Request</button>`}</td></tr>`;
    }).join('');
    const ids = readerRoom ? [ROOM_BY_ID[readerRoom].requiredPass] : (Object.keys(PASSES) as PassId[]);
    const last = st.latestResult && (st.latestResult.title.includes('Pass') || st.latestResult.title.includes('Request') || st.latestResult.title.includes('granted')) ? `<div class="toast ${st.latestResult.tone}" style="margin:8px 0">${toneIcon(st.latestResult.tone)} <b>${esc(st.latestResult.title)}</b> ${esc(st.latestResult.text)}</div>` : '';
    wrap.innerHTML = `<div class="card wide" role="dialog" aria-modal="true"><div class="chip info">${readerRoom ? 'Door access reader' : 'Access Desk'}</div><h2 style="margin-top:6px">${readerRoom ? esc(ROOM_BY_ID[readerRoom].name) : 'Request a pass'}</h2>
      <p class="small">Passes are fictional, read-only and expire when the mission ends. A request is approved only when current evidence justifies it. There is no bypass: if it is denied, the hint says what to find first.</p>${last}
      <table class="t">${rows(ids)}</table><div class="row"><button class="primary" data-a="ok">Close</button></div></div>`;
    wrap.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      if (b.dataset.req) { runner.requestPass(b.dataset.req as PassId, readerRoom ? 'reader' : 'desk'); this.paintAccess(wrap, readerRoom, close); }
      else if (b.dataset.a === 'ok') close();
    };
  }

  private paintBoard(wrap: HTMLElement, close: (a?: () => void) => void): void {
    const st = this.state!, m = st.mission, runner = this.runner!;
    const path = m.evidencePath.map((r, i) => {
      const ev = m.evidence.find((e) => e.pathStep === r);
      const got = ev ? st.evidence.has(ev.id) : false;
      return `<div class="node ${got ? 'got' : ''}"><b>${esc(ROOM_BY_ID[r].code)} · ${esc(ROOM_BY_ID[r].name)}</b><small>${got ? '✓ ' + esc(ev!.name) : '○ evidence not collected'}</small></div>${i < m.evidencePath.length - 1 ? '<span aria-hidden="true">→</span>' : ''}`;
    }).join('');
    const ready = m.canReport(st);
    wrap.innerHTML = `<div class="card wide" role="dialog" aria-modal="true"><div class="chip info">Evidence Board</div><h2 style="margin-top:6px">Evidence path</h2><div class="path">${path}</div>
      <table class="t"><tr><th>Evidence</th><th>Room</th><th>Pass</th><th>Sensitivity</th><th>Status</th></tr>${m.evidence.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(ROOM_BY_ID[e.sourceRoom].name)}</td><td>${esc(PASSES[e.requiredPass].name)}</td><td>${esc(e.sensitivity)}</td><td>${st.evidence.has(e.id) ? '<span class="chip good">✓ Collected</span>' : '<span class="chip">○ Missing</span>'}</td></tr>`).join('')}</table>
      <p class="small">${ready === true ? 'Everything needed is in place. Filing closes the incident.' : esc(ready)}</p>
      <div class="row"><button class="primary" data-a="file" ${ready === true ? '' : 'aria-disabled="true"'}>File incident report</button><button data-a="ok">Close</button></div></div>`;
    wrap.onclick = (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'ok') close();
      if (a === 'file') { if (ready === true) close(() => runner.fileReport()); else runner.api.say('Report not ready', String(ready), 'warn', { hint: true }); }
    };
  }
}
export { FAC_H, GRID };
