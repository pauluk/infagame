import { PALETTE } from '../game/constants';
import type { DialogSpec, PassId, RoomId, ToolId, Tone } from '../game/types';
import type { GameState } from '../game/systems/GameState';
import type { MissionRunner } from '../game/systems/MissionRunner';
import type { SceneApi } from '../game/sceneApi';
import { settings } from '../game/systems/Settings';
import { sfx } from '../game/systems/Sfx';
import { bgInterval, bgTimeout, bgClear } from '../background';
import { computeScore } from '../game/systems/Scoring';
import { TOOLS, TOOL_BY_ID } from '../data/tools';
import { CAMPAIGN_GOAL, CAMPAIGN_MISSIONS, MISSIONS, MISSION_BY_ID } from '../data/missions';
import { BADGES, campaign } from '../game/systems/Campaign';
import { MEASURE_KEYS, MEASURE_LABEL, confidenceWord, measuresOf, overallConfidence, type Measures } from '../game/systems/Confidence';
import { PASSES } from '../data/passes';
import { DOOR_BY_ID, FAC_H, FAC_W, FAC_X0, FAC_Y0, GRID, LINKS, LINK_BY_ID, LINK_RULES, ROOMS, ROOM_BY_ID, EXTERNAL_BY_ID, EXTERNALS, doorInfo } from '../data/map';
import { isKnown } from '../game/systems/Fog';
import { avatarSvg } from './avatar';
import { ROUTES, ROUTE_BY_ID, STATE_LABEL, routePoints } from '../data/routes';
import { describeTarget } from '../data/targets';
import { app } from '../app';
import { $, $$, el, esc, toneIcon } from './dom';
import { loadToolIcons } from './icons';
import { COACH } from '../data/coach';
import { TeamPanel } from './teamPanel';
import { BlueprintView } from './blueprint';
import { IncidentBoardView } from './incidentBoard';
import { AccessReviewView } from './accessReview';
import { BlueLanternView } from './blueLantern';
import { IncidentBoard } from '../game/systems/Incidents';
import { jev, type JevChoice } from '../integrations/jev/JevClient';
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
  private lastInput = 0;
  private inputBound = false;
  private pauseOpen = false;
  private teamPanel: TeamPanel | null = null;
  blueprint: BlueprintView | null = null;
  board: IncidentBoardView | null = null;
  access: AccessReviewView | null = null;
  blue: BlueLanternView | null = null;
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
          <button data-a="tutorial">\u2691 Tutorial Mode <small style="opacity:.8">(guided coaching on The Duplicate Ghost)</small></button>
          <button data-a="manager">\u{1F465} Manager Mode <small style="opacity:.8">(lead a team of three, or put them on Auto)</small></button>
          <button data-a="missions">Mission Select</button>
          <button data-a="howto">How to Play</button>
          <button data-a="audio">Audio</button>
          <button data-a="access">Accessibility</button>
        </div>
        <p class="ext-note" style="margin-top:14px">Sound effects are generated in your browser and only play after you interact. Art: Quaternius, Kenney and Poly Haven (CC0), rendered with Blender. See ATTRIBUTION.md.</p>
      </div>`, 'clear');
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      if (a === 'start') this.startMission(this.nextMission().id);
      if (a === 'tutorial') { settings.set('tutorial', true); this.startMission('duplicate-ghost'); }
      if (a === 'manager') { settings.set('team', true); this.startMission(this.nextMission().id); }
      if (a === 'missions') this.showMissionSelect();
      if (a === 'howto') this.showHowTo(() => this.showTitle());
      if (a === 'audio') this.showSettings('audio', () => this.showTitle());
      if (a === 'access') this.showSettings('access', () => this.showTitle());
    });
    (s.querySelector('button.primary') as HTMLElement).focus();
  }

  /** The first unlocked campaign mission that is not yet completed (or the tutorial). */
  nextMission() {
    return CAMPAIGN_MISSIONS.find((m) => !campaign.isCompleted(m.id) && campaign.isUnlocked(m, MISSIONS)) ?? CAMPAIGN_MISSIONS[0];
  }

  private measureBars(m: Measures, before?: Measures): string {
    return MEASURE_KEYS.map((k) => {
      const L = MEASURE_LABEL[k]; const d = before ? m[k] - before[k] : 0;
      return `<div class="mrow" title="${esc(L.what)}"><span>${L.icon} ${esc(L.name)}</span><div class="bar2"><i style="width:${m[k]}%"></i></div><b>${m[k]}%</b>${before ? `<small>${d > 0 ? '▲ +' + d : d < 0 ? '▼ ' + d : '• 0'}</small>` : ''}</div>`;
    }).join('');
  }
  private badgeShelf(earned: string[], fresh: string[] = []): string {
    return `<div class="badges">${BADGES.map((b) => `<span class="badge ${earned.includes(b.id) ? 'got' : ''}" title="${esc(b.text)}">${b.icon} ${esc(b.name)}${fresh.includes(b.id) ? ' <b>NEW</b>' : ''}<small>${earned.includes(b.id) ? '✓ earned' : esc(b.text)}</small></span>`).join('')}</div>`;
  }

  showMissionSelect(): void {
    const cm = campaign.data.measures;
    const card = (m: (typeof MISSIONS)[number]) => {
      const rec = campaign.data.missions[m.id]; const unlocked = campaign.isUnlocked(m, MISSIONS);
      const prim = m.goals.filter((g) => g.kind === 'primary'), opt = m.goals.filter((g) => g.kind === 'optional'), str = m.goals.filter((g) => g.kind === 'stretch');
      const prev = m.order === 9 || m.order === 12 || m.order === 15 || m.order === 16 ? MISSION_BY_ID['duplicate-ghost'] : CAMPAIGN_MISSIONS.find((x) => x.order === m.order - 1);
      const status = rec?.completed ? `<span class="chip good">✓ Completed · best ${rec.best}/100</span>` : unlocked ? '<span class="chip info">Available</span>' : `<span class="chip warn">🔒 Locked: complete ${esc(prev?.title ?? 'the tutorial')}</span>`;
      return `<div class="mcard ${unlocked ? '' : 'locked'}"><h3>${m.order ? m.order + '. ' : ''}${esc(m.title)} ${status}</h3><div class="small">${esc(m.tagline)}</div><div class="small"><i>${esc(m.theme)}</i></div>
        ${prim.length ? `<div class="small"><b>Primary objectives (${rec ? rec.primary.length : 0}/${prim.length})</b><ul>${prim.map((g) => `<li>${rec?.primary.includes(g.id) ? '✓' : '○'} ${esc(g.text)}</li>`).join('')}</ul></div>` : ''}
        <div class="small"><b>Optional</b> ${rec ? rec.optional.length : 0}/${opt.length} · <b>Stretch</b> ${rec ? rec.stretch.length : 0}/${str.length}${rec?.badges.length ? ' · ' + rec.badges.map((b) => BADGES.find((x) => x.id === b)?.icon ?? '').join(' ') : ''}</div>
        <button class="primary" data-m="${m.id}" ${unlocked ? '' : 'disabled'}>${rec?.completed ? 'Replay (improve optional goals and badges)' : 'Play'}</button></div>`;
    };
    const s = this.showScreen(`<div class="card wide"><h2>Campaign</h2><p><b>Goal:</b> ${esc(CAMPAIGN_GOAL)}</p>
      <div class="grid2"><div class="mcard"><h3>Service Confidence <span class="chip info">${campaign.overall()}% · ${confidenceWord(campaign.overall())}</span></h3>${this.measureBars(cm)}<div class="small">A high score needs balance: the weakest measure pulls it down.</div></div>
      <div class="mcard"><h3>Badges</h3>${this.badgeShelf(campaign.data.badges)}<div class="small">Side tasks done: ${campaign.data.side.length}/6</div></div></div>
      <h3 style="margin-top:14px">Missions</h3><div class="grid2">${CAMPAIGN_MISSIONS.map(card).join('')}</div>
      <h3 style="margin-top:14px">Between missions</h3><div class="grid2">${MISSIONS.filter((m) => m.order === 0).map(card).join('')}</div>
      <div class="row" style="margin-top:12px"><button data-a="back">← Back</button><button data-a="unlock" title="For testers: unlock every mission">Unlock all missions</button><button data-a="reset" class="danger">Reset campaign progress</button></div>
      <p class="ext-note">Progress is stored only in this browser (local storage) and contains no finance data or credentials.</p></div>`);
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return; sfx.click();
      if (b.dataset.m) this.startMission(b.dataset.m);
      else if (b.dataset.a === 'back') this.showTitle();
      else if (b.dataset.a === 'unlock') { campaign.unlockAll(); this.showMissionSelect(); }
      else if (b.dataset.a === 'reset') { if (confirm('Reset all campaign progress, badges and side tasks on this device?')) { campaign.reset(); this.showMissionSelect(); } }
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
    if (this.state) this.autoAdvance(s, 'button[data-a="ok"]', 4, 'the briefing');
  }

  showSettings(focus: 'audio' | 'access' | 'all', back: () => void): void {
    const d = settings.data;
    const sw = (id: string, label: string, small: string, on: boolean) => `<div class="sw"><label for="${id}">${label}<small>${small}</small></label><input id="${id}" type="checkbox" ${on ? 'checked' : ''} style="width:22px;height:22px"></div>`;
    const audio = `<h3>Audio</h3>${sw('s-mute', 'Mute sound effects', 'Short synthesised beeps. Nothing plays until you interact.', d.muted)}`;
    const access = `<h3>Accessibility</h3>
      ${sw('s-motion', 'Reduced motion', 'Stops pulses, shakes and bobbing. Route direction stays visible with arrows.', d.reducedMotion)}
      ${sw('s-tut', 'Tutorial mode', 'Guided coaching: a step-by-step coach, a beacon on the target, free hints and slower incidents. Stretch goals are not counted.', d.tutorial)}
      <div class="sw"><label for="s-jev">JEV second opinions (AI)<small id="jev-state">Checking the server\u2026</small></label><input id="s-jev" type="checkbox" ${d.jev ? 'checked' : ''} style="width:22px;height:22px"></div>
      ${sw('s-team', 'Manager mode', 'Three teammates join the shift. You order them (or put them on Auto). Applies to the current and later missions.', d.team)}
      ${sw('s-run', 'Auto keeps going', 'Once Auto is on it stays on from mission to mission, and the briefing and debrief screens continue by themselves. Any click or key press stops it.', d.autoRun)}
      ${sw('s-decide', 'Auto makes the calls', 'Teammates and Auto-play pick the best-practice answer to a choice or confirmation instead of asking you.', d.autoDecide)}
      ${sw('s-relaxed', 'Relaxed pace', 'Incidents progress at half speed.', d.relaxed)}
      ${sw('s-large', 'Larger text', 'Increases interface text size.', d.largeText)}
      <div class="sw"><label for="s-touch">Touch controls<small>On-screen pad and action buttons.</small></label><select id="s-touch" style="font:inherit;padding:6px;background:#132136;color:inherit;border:1px solid var(--line);border-radius:6px"><option value="auto">Auto</option><option value="on">Always on</option><option value="off">Off</option></select></div>`;
    const s = this.showScreen(`<div class="card"><h2>${focus === 'audio' ? 'Audio' : focus === 'access' ? 'Accessibility' : 'Settings'}</h2>${focus !== 'access' ? audio : ''}${focus !== 'audio' ? access : ''}<div class="row" style="margin-top:12px"><button class="primary" data-a="back">Done</button></div></div>`);
    const q = (id: string) => s.querySelector('#' + id) as HTMLInputElement | null;
    q('s-mute')?.addEventListener('change', (e) => settings.set('muted', (e.target as HTMLInputElement).checked));
    q('s-motion')?.addEventListener('change', (e) => settings.set('reducedMotion', (e.target as HTMLInputElement).checked));
    q('s-tut')?.addEventListener('change', (e) => settings.set('tutorial', (e.target as HTMLInputElement).checked));
    const refreshJev = () => {
      const box = q('s-jev'), note = s.querySelector('#jev-state'); if (!box || !note) return;
      const text: Record<string, string> = { ready: 'JEV (TypeSafe AI) is available. When on, you can ask it for a second opinion on a decision, and teammates on Auto consult it (acting alone only when it is confident). It is advice only.', not_configured: 'Not set up on this server: the owner needs to add TYPESAFE_API_KEY. The game works the same without it.', unavailable: 'The JEV service could not be reached. The game works the same without it.', checking: 'Checking the server\u2026', unknown: 'Checking the server\u2026' };
      note.textContent = text[jev.status]; box.disabled = jev.status !== 'ready'; if (jev.status !== 'ready') box.checked = false;
    };
    refreshJev(); jev.on('change', refreshJev); void jev.check();
    q('s-jev')?.addEventListener('change', (e) => settings.set('jev', (e.target as HTMLInputElement).checked));
    q('s-team')?.addEventListener('change', (e) => settings.set('team', (e.target as HTMLInputElement).checked));
    q('s-run')?.addEventListener('change', (e) => settings.set('autoRun', (e.target as HTMLInputElement).checked));
    q('s-decide')?.addEventListener('change', (e) => settings.set('autoDecide', (e.target as HTMLInputElement).checked));
    q('s-relaxed')?.addEventListener('change', (e) => settings.set('relaxed', (e.target as HTMLInputElement).checked));
    q('s-large')?.addEventListener('change', (e) => settings.set('largeText', (e.target as HTMLInputElement).checked));
    const t = s.querySelector('#s-touch') as HTMLSelectElement | null; if (t) { t.value = d.touch; t.addEventListener('change', () => settings.set('touch', t.value as 'auto' | 'on' | 'off')); }
    $(s, 'button.primary')!.addEventListener('click', () => { sfx.click(); back(); });
  }

  // ===================================================================== mission lifecycle ====
  startMission(id: string): void {
    const mission = MISSION_BY_ID[id]; if (!mission || !app.game) return;
    if (!campaign.isUnlocked(mission, MISSIONS)) { this.showMissionSelect(); return; }
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
    if (!this.inputBound) { this.inputBound = true; for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => { this.lastInput = performance.now(); }, true); }
    state.tutorial = settings.data.tutorial;
    this.buildHud();
    this.unsub.push(
      state.on('change', () => { this.dirty = true; }),
      state.on('result', (r) => { this.toast(`<b>${esc(r.title)}</b> ${esc(r.text)}`, r.tone); this.renderInspect(); sfx[r.tone === 'good' ? 'good' : r.tone === 'warn' ? 'warn' : r.tone === 'bad' ? 'bad' : 'click'](); }),
      state.on('log', () => this.renderLog()),
      state.on('dialog', (d) => this.openDialog(d)),
      state.on('pass', (e) => { this.renderMinimap(); this.renderInspect(); if (e.granted) this.toast(`<b>${esc(PASSES[e.pass].name)}</b> granted`, 'good'); }),
      state.on('ui', (k) => this.openPanel(k)),
    );
    this.mmTimer = window.setInterval(() => { this.renderMinimap(); if (this.dirty) { this.dirty = false; this.renderHud(); this.renderInspect(); } this.teamPanel?.tick(); }, 100);
    this.fabTimer = window.setInterval(() => void this.refreshFabric(), 2500);
    void this.refreshFabric();
    this.renderHud(); this.renderBelt(); this.renderInspect(); this.renderLog(); this.applySettings();
    state.speed = 1; scene.team.setCrew(settings.data.team);
    this.blue = new BlueLanternView(this.root, { state, toast: (h, t) => this.toast(h, t), pause: () => { state.paused = true; }, resume: () => { if (!this.pauseOpen && !this.dialogOpen) state.paused = false; }, openMap: () => { this.blue?.close(); this.blueprint?.open('incident'); } });
    this.access = new AccessReviewView(this.root, { toast: (h, t) => this.toast(h, t), pause: () => { state.paused = true; }, resume: () => { if (!this.pauseOpen && !this.dialogOpen) state.paused = false; } });
    this.board = new IncidentBoardView(this.root, { state, runner, scene, toast: (h, t) => this.toast(h, t), pause: () => { state.paused = true; }, resume: () => { if (!this.pauseOpen && !this.dialogOpen) state.paused = false; }, openMap: () => this.blueprint?.open('incident'), openDialog: (d) => this.openDialog(d) });
    this.blueprint = new BlueprintView(this.root, { state, runner, scene, openBoard: () => this.board?.open(), toast: (h, t) => this.toast(h, t), pause: () => { state.paused = true; }, resume: () => { if (!this.pauseOpen && !this.dialogOpen) state.paused = false; } });
    this.teamPanel = new TeamPanel($(this.hud!, '#team')!, $(this.hud!, '#b-team')!, state, scene, { openDialog: (d) => this.openDialog(d), toast: (h, t) => this.toast(h, t) });
    const begin = () => this.showBriefing();
    let seen = false; try { seen = !!localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
    state.paused = true;
    if (seen) begin(); else this.showHowTo(begin);
  }

  detachMission(): void {
    this.unsub.forEach((u) => u()); this.unsub = [];
    clearInterval(this.mmTimer); clearInterval(this.fabTimer); this.blueprint?.close(); this.blueprint = null; this.board?.close(); this.board = null; this.access?.close(); this.access = null; this.blue?.close(); this.blue = null; this.teamPanel = null; document.body.classList.remove('team-open');
    this.hud?.remove(); this.hud = null; this.state = null; this.runner = null; this.scene = null; this.dialogOpen = false; this.pauseOpen = false;
    $(this.root, '#dialog')?.remove(); $(this.root, '#panelmodal')?.remove();
  }

  private showBriefing(): void {
    const st = this.state!; const m = st.mission;
    // first ever run of the tutorial mission: switch coaching on (the player can untick it right here)
    try { if (m.order === 1 && !campaign.isCompleted(m.id) && !localStorage.getItem('ledgerlock.tutorialPrompted')) { localStorage.setItem('ledgerlock.tutorialPrompted', '1'); settings.set('tutorial', true); } } catch { /* ignore */ }
    const s = this.showScreen(`<div class="card"><div class="chip warn">${esc(m.alert.severity)} severity · Incident briefing</div>
      <h2 style="margin-top:8px">${esc(m.title)}</h2>
      <div class="sub">${esc(m.alert.headline)}</div>
      <p><b>Symptoms</b></p><ul>${m.alert.symptoms.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p><b>Likely impact:</b> ${esc(m.alert.impact)}</p>
      <p><b>Points at:</b> ${esc(ROOM_BY_ID[m.alert.points].name)} (${esc(ROOM_BY_ID[m.alert.points].code)})</p>
      ${m.briefing.map((b) => `<p>${esc(b)}</p>`).join('')}
      <div class="sw"><label for="b-tut">Tutorial mode (guided coaching)<small>A coach explains each step and points at the target. Hints are free and incidents run slower.</small></label><input id="b-tut" type="checkbox" ${settings.data.tutorial ? 'checked' : ''} style="width:22px;height:22px"></div>
      <div class="sw"><label for="b-team">Manager mode (lead a team)<small>Three teammates join you. Order them, or put anyone (including yourself) on Auto. Auto-play shows a mission being solved: stretch goals are earned by hand.</small></label><input id="b-team" type="checkbox" ${settings.data.team ? 'checked' : ''} style="width:22px;height:22px"></div>
      ${jev.status === 'ready' ? `<div class="sw"><label for="b-jev">JEV second opinions (AI)<small>Ask JEV (TypeSafe AI) for advice on a decision. It never decides for you unless you let Auto act on it.</small></label><input id="b-jev" type="checkbox" ${settings.data.jev ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''}
      <div class="row" style="margin-top:12px"><button class="primary" data-a="go">Begin investigation</button><button data-a="how">How to play</button></div></div>`);
    (s.querySelector('#b-tut') as HTMLInputElement).addEventListener('change', (e) => settings.set('tutorial', (e.target as HTMLInputElement).checked));
    (s.querySelector('#b-jev') as HTMLInputElement | null)?.addEventListener('change', (e) => settings.set('jev', (e.target as HTMLInputElement).checked));
    (s.querySelector('#b-team') as HTMLInputElement).addEventListener('change', (e) => { settings.set('team', (e.target as HTMLInputElement).checked); this.scene?.team.setCrew(settings.data.team); });
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      if (a === 'go') { this.clearScreen(); st.paused = false; st.log('Shift started. Coffee status: optimistic.', 'info'); }
      if (a === 'how') this.showHowTo(() => this.showBriefing());
    });
    ($(s, 'button.primary') as HTMLElement).focus();
    this.autoAdvance(s, 'button[data-a="go"]', 5, 'the shift');
  }

  openGoals(): void { if (this.state && !this.dialogOpen && !this.pauseOpen) this.openDialog({ type: 'goals' }); }

  togglePause(): void {
    if (!this.state || this.dialogOpen) return;
    if (this.blueprint?.isOpen) { this.blueprint.close(); return; }
    if (this.board?.isOpen) { this.board.close(); return; }
    if (this.access?.isOpen) { this.access.close(); return; }
    if (this.blue?.isOpen) { this.blue.close(); return; }
    if (this.pauseOpen) { this.pauseOpen = false; this.clearScreen(); this.state.paused = false; return; }
    this.pauseOpen = true; this.state.paused = true;
    const s = this.showScreen(`<div class="card"><h2>Paused</h2><p>The incident clock is stopped.</p>
      <div class="menu"><button class="primary" data-a="resume">Resume</button><button data-a="restart">Restart mission</button><button data-a="tutorial">Tutorial mode: ${settings.data.tutorial ? 'ON (turn off)' : 'OFF (turn on)'}</button><button data-a="team">Manager mode: ${settings.data.team ? 'ON (send the team home)' : 'OFF (call the team in)'}</button><button data-a="howto">How to Play</button><button data-a="settings">Audio and accessibility</button><button data-a="missions">Mission Select</button><button data-a="title">Quit to title</button></div></div>`);
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      const mid = this.state!.mission.id;
      if (a === 'resume') this.togglePause();
      if (a === 'restart') { this.pauseOpen = false; this.startMission(mid); }
      if (a === 'tutorial') { settings.set('tutorial', !settings.data.tutorial); this.pauseOpen = false; this.togglePause(); }
      if (a === 'team') { settings.set('team', !settings.data.team); this.scene?.team.setCrew(settings.data.team); this.pauseOpen = false; this.togglePause(); }
      if (a === 'howto') this.showHowTo(() => { this.pauseOpen = false; this.togglePause(); });
      if (a === 'settings') this.showSettings('all', () => { this.pauseOpen = false; this.togglePause(); });
      if (a === 'missions') { this.pauseOpen = false; this.leaveMissionVisuals(); this.showMissionSelect(); }
      if (a === 'title') { this.pauseOpen = false; this.showTitle(); }
    });
    ($(s, 'button.primary') as HTMLElement).focus();
  }

  showDebrief(state: GameState): void {
    sfx.win();
    const out = campaign.recordResult(state);
    const m = state.mission, score = out.score;
    const deb = m.debrief(state);
    const sm = app.game!.scene; sm.getScenes(true).forEach((sc) => sm.stop(sc.scene.key)); sm.start('Debrief');
    this.detachMission();
    const goalRows = (kind: 'primary' | 'optional' | 'stretch') => m.goals.filter((g) => g.kind === kind).map((g) => `<li>${g.done(state) ? '<span class="chip good">✓ Done</span>' : `<span class="chip ${kind === 'primary' ? 'bad' : ''}">${kind === 'primary' ? '✕ Missed' : '○ Not this time'}</span>`} ${esc(g.text)}</li>`).join('');
    const affected = Object.entries(state.affected);
    const nm = (id: string) => describeTarget(id)?.name ?? id;
    const next = MISSIONS.filter((x) => x.order > 0).find((x) => x.order === m.order + 1);
    const evRows = m.evidence.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(ROOM_BY_ID[e.sourceRoom].name)}</td><td>${esc(PASSES[e.requiredPass].name)}</td><td>${esc(e.sensitivity)}</td><td>${state.evidence.has(e.id) ? '<span class="chip good">✓ Collected</span>' : '<span class="chip">○ Missing</span>'}</td></tr>`).join('');
    const s = this.showScreen(`<div class="card wide"><div class="row" style="align-items:flex-start;gap:20px">
      <div style="flex:1;min-width:280px"><div class="chip good">Mission complete</div>${state.tutorial ? ' <span class="chip info">Tutorial mode: stretch goals not counted</span>' : ''}${state.stats.jevCalls ? ` <span class="chip info">JEV consulted ${state.stats.jevCalls} time(s)${state.stats.jevFollowed ? `, followed ${state.stats.jevFollowed}` : ''}</span>` : ''}${state.stats.effort ? ` <span class="chip info">Team effort ${state.stats.effort}${state.stats.effort > 100 ? ` (${Math.round(state.stats.effort - 100)} over budget)` : ' of 100'}${state.stats.breaks ? `, ${state.stats.breaks} break(s)` : ''}</span>` : ''}${state.stats.autoActions ? ` <span class="chip info">Auto did ${state.stats.autoActions} action(s)${state.stats.orders ? `, you ordered ${state.stats.orders}` : ''}: stretch goals not counted</span>` : state.stats.orders ? ` <span class="chip info">Manager mode: you ordered ${state.stats.orders} action(s)</span>` : ''}<h2 style="margin-top:6px">${esc(m.title)}: debrief</h2>
        ${m.order === 0 ? `<div class="score">${m.goals.filter((g) => g.kind === 'optional' && g.done(state)).length}<span style="font-size:.35em;opacity:.8"> / 6 side tasks</span></div><div class="sub">Operations hygiene</div><p>Small habits prevent the next incident. Nothing here affects campaign progress.</p>` : `<div class="score">${score.total}<span style="font-size:.35em;opacity:.8"> / 100</span></div><div class="sub">${esc(score.rating)}</div><p>${esc(score.message)}</p>`}
        <h3>Objectives</h3><div class="small"><b>Primary</b></div><ul class="goals">${goalRows('primary') || '<li>None: this is a free-roam shift.</li>'}</ul>
        <div class="small"><b>Optional</b> (${m.goals.filter((g) => g.kind === 'optional' && g.done(state)).length}/${m.goals.filter((g) => g.kind === 'optional').length})</div><ul class="goals">${goalRows('optional')}</ul>
        <div class="small"><b>Stretch</b></div><ul class="goals">${goalRows('stretch')}</ul>
        <h3>Badges</h3>${this.badgeShelf(out.badges.concat(campaign.data.badges.filter((b) => !out.badges.includes(b))), out.newBadges)}
        <table class="t" style="margin-top:8px">${(m.order === 0 ? [] : score.parts).map((p) => `<tr><td>${esc(p.label)}<div class="bar2"><i style="width:${(p.points / p.max) * 100}%"></i></div><div class="small" style="opacity:.75">${esc(p.note)}</div></td><td style="white-space:nowrap"><b>${p.points}</b> / ${p.max}</td></tr>`).join('')}</table></div>
      <div style="flex:1;min-width:280px"><h3>What happened</h3><p>${esc(deb.what)}</p><h3>Your response</h3><ul>${deb.response.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <h3>Service Confidence: before and after</h3><div class="small">Campaign measures before → after this mission (this mission's own result in brackets). Overall <b>${overallConfidence(out.before)}%</b> → <b>${overallConfidence(out.after)}%</b> (${confidenceWord(overallConfidence(out.after))}).</div>
        ${this.measureBars(out.after, out.before)}<div class="small">Mission result: ${MEASURE_KEYS.map((k) => `${MEASURE_LABEL[k].name} ${out.final[k]}%`).join(' · ')}</div>
        <h3>Evidence collected</h3>${m.evidence.length ? `<table class="t"><tr><th>Evidence</th><th>Source room</th><th>Pass</th><th>Sensitivity</th><th></th></tr>${evRows}</table>` : '<p>No evidence items on a free-roam shift.</p>'}
        <h3>Routes and services affected by your actions</h3><ul>${affected.length ? affected.map(([id, st]) => `<li>${esc(nm(id))}: <b>${esc(st)}</b></li>`).join('') : '<li>None: no route or room was held.</li>'}${Object.keys(state.contained).length ? '<li>Containments still active: ' + Object.keys(state.contained).map((c) => esc(nm(c))).join(', ') + '</li>' : ''}</ul>
        <h3>Safest next step</h3><p>${esc(m.nextStep(state))}</p><h3>What to take away</h3><p>${esc(deb.learn)}</p></div></div>
      <div class="row" style="margin-top:10px"><button class="primary" data-a="${next ? 'next' : 'missions'}">${next ? `Next: ${esc(next.title)}` : 'Campaign overview'}</button><button data-a="again">Replay mission</button><button data-a="missions">Mission Select</button><button data-a="title">Title</button></div></div>`);
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a; if (!a) return; sfx.click();
      if (a === 'again') this.startMission(m.id);
      if (a === 'next' && next) this.startMission(next.id);
      if (a === 'missions') { this.leaveMissionVisuals(); this.showMissionSelect(); }
      if (a === 'title') this.showTitle();
    });
    if (next) this.autoAdvance(s, 'button[data-a="next"]', 10, next.title);
  }

  // ===================================================================== HUD ====
  private buildHud(): void {
    const hud = el('div', { id: 'hudroot' }, `
      <div id="hud"><div class="hud-row" id="meters"></div><div class="hud-row"><div id="objective" role="status" aria-live="polite"></div>
        <div class="hud-btns"><button id="b-goals" title="Objectives and goals (G)">\u2691 Goals</button><button id="b-conf" title="Service Confidence">\u2630 Confidence</button><button id="b-board" title="Secure Ops Incident Board (I)">\u{1F4CB} Board</button><button id="b-blueprint" title="Facility map and systems blueprint (B)">\u{1F5FA} Blueprint</button><button id="b-map" title="Minimap (M)">▦ Map</button><button id="b-fabric" title="Fabric panel (F)">◈ Fabric</button><button id="b-log" title="Incident log (L)">☰ Log</button><button id="b-jev" class="hidden" title="JEV second opinions (AI) on or off" aria-pressed="false">JEV</button><button id="b-team" title="Team and Auto-play (T)">\u23F5 Auto</button><button id="b-routes" title="Toggle route overlay (R)" aria-pressed="true">⤳ Routes</button><button id="b-mute" title="Mute sound">♪</button><button id="b-pause" title="Pause (Esc)">⏸</button></div></div></div>
      <div id="tooltip"></div><div id="coach" class="hidden" role="region" aria-label="Tutorial coach"></div><div id="team" class="hidden" role="region" aria-label="Team and Auto-play"></div>
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
    $(hud, '#b-goals')!.onclick = () => this.state && this.openDialog({ type: 'goals' });
    $(hud, '#b-conf')!.onclick = () => this.state && this.openDialog({ type: 'confidence' });
    $(hud, '#b-board')!.onclick = () => this.openPanel('board');
    $(hud, '#b-blueprint')!.onclick = () => this.openPanel('blueprint');
    $(hud, '#b-map')!.onclick = () => this.openPanel('map');
    $(hud, '#b-fabric')!.onclick = () => this.openPanel('fabric');
    $(hud, '#b-log')!.onclick = () => this.openPanel('log');
    $(hud, '#b-pause')!.onclick = () => this.togglePause();
    $(hud, '#b-mute')!.onclick = () => settings.set('muted', !settings.data.muted);
    $(hud, '#b-jev')!.onclick = () => settings.set('jev', !settings.data.jev);
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
    const syncJev = () => { const b = $(hud, '#b-jev'); if (!b) return; b.classList.toggle('hidden', jev.status !== 'ready'); b.setAttribute('aria-pressed', String(settings.data.jev)); b.classList.toggle('on', settings.data.jev); b.textContent = settings.data.jev ? 'JEV \u2713' : 'JEV'; };
    jev.on('change', syncJev); void jev.check(); syncJev();
    settings.on('change', () => { syncJev(); if (this.state) { this.state.tutorial = settings.data.tutorial; this.scene?.team?.setCrew(settings.data.team); this.dirty = true; } const b = $(hud, '#b-mute'); if (b) b.textContent = settings.data.muted ? '♪✕' : '♪'; });
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
      : `<div><div class="n">All guided steps done</div><div class="t">Great work. File the report at the Evidence Board.</div></div>`;
    $(hud, '#b-hint')?.addEventListener('click', () => { this.hintOpen = !this.hintOpen; this.renderHud(); });
    const cb = $(hud, '#b-conf'); if (cb) cb.textContent = `\u2630 Confidence ${overallConfidence(measuresOf(st))}%`;
    const pm = $(hud, '#b-routes'); if (pm) pm.setAttribute('aria-pressed', String(this.scene?.routesVisible() ?? true));
    this.renderPasses();
    this.renderCoach();
  }
  private hintOpen = true;

  /** Tutorial mode: coach card (what to do, why it matters, which tool) and a beacon on the target. */
  private renderCoach(): void {
    const st = this.state, hud = this.hud; if (!st || !hud) return;
    const box = $(hud, '#coach')!, tip = $(hud, '#tooltip');
    const on = st.tutorial && !st.complete;
    box.classList.toggle('hidden', !on); tip?.classList.toggle('hidden', on);
    document.body.classList.toggle('tutorial-on', on);
    if (!on) { this.scene?.setCoachTargets([]); this.coachSig = ''; $$(hud, '.tool.coach').forEach((b) => b.classList.remove('coach')); return; }
    const objs = this.runner!.objectives(); const idx = objs.findIndex((o) => !o.done); const cur = idx >= 0 ? objs[idx] : null;
    const entry = cur ? COACH[st.mission.id]?.[cur.id] : undefined;
    let tg = entry?.target; if (typeof tg === 'function') tg = tg(st) ?? undefined;
    const targets = tg ? (Array.isArray(tg) ? tg : [tg]) : [];
    const tool = entry?.tool ? TOOL_BY_ID[entry.tool] : null;
    const sig = `${cur?.id}|${targets.join(',')}|${tool?.id}|${st.selectedTool}`;
    if (sig === this.coachSig) return;
    this.coachSig = sig;
    this.scene?.setCoachTargets(targets);
    $$(hud, '.tool').forEach((b) => b.classList.toggle('coach', !!tool && b.dataset.t === tool.id));
    const need = tool && st.selectedTool !== tool.id;
    box.innerHTML = cur ? `<div class="n">Tutorial \u00B7 step ${idx + 1} of ${objs.length}</div><div class="t">${esc(cur.text)}</div>
      <div class="c"><b>Do this:</b> ${esc(cur.hint)}</div>
      <div class="c"><b>Why:</b> ${esc(entry?.why ?? 'Follow the hint, then check the Goals list (G) to see how this fits the mission.')}</div>
      ${tool ? `<div class="c"><b>Tool:</b> <kbd>${tool.key}</kbd> ${esc(tool.name)} ${need ? '<span class="chip warn">press ' + tool.key + ' to select it</span>' : '<span class="chip good">\u2713 selected: press E near the target</span>'}</div>` : ''}
      <div class="row">${targets.length ? '<button data-c="show">Show me</button>' : ''}<button data-c="off">Turn tutorial mode off</button></div>`
      : `<div class="n">Tutorial complete</div><div class="t">All steps done. File the report at the Evidence Board.</div>`;
    $$(box, 'button').forEach((b) => (b.onclick = () => {
      sfx.click();
      if (b.dataset.c === 'off') settings.set('tutorial', false);
      if (b.dataset.c === 'show' && targets[0]) {
        this.scene?.focusOn(targets[0]);
        const t = describeTarget(targets[0]); const room = t?.room?.id ?? (t?.prop ? t.prop.room : undefined);
        if (room) this.guide(room as RoomId);
        setTimeout(() => this.scene?.returnToPlayer(), 2600);
      }
    }));
  }
  private coachSig = '';

  private renderBelt(): void {
    const belt = this.hud && $(this.hud, '#belt'); if (!belt || !this.state) return;
    belt.innerHTML = TOOLS.map((t) => `<button class="tool" data-t="${t.id}" aria-pressed="${this.state!.selectedTool === t.id}" aria-label="${t.key}: ${esc(t.name)}. ${esc(t.blurb)}"><span class="k">${t.key}</span>${this.icons[t.sprite] ? `<img alt="" src="${this.icons[t.sprite]}">` : `<span class="glyph">${t.icon}</span>`}<span class="nm">${esc(t.short)}</span></button>`).join('');
    $$(belt, '.tool').forEach((b) => (b.onclick = () => this.selectTool(b.dataset.t as ToolId)));
    this.renderTooltip();
    this.coachSig = ''; this.renderCoach();
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
    const sc2 = this.scene!;
    // a teammate: look at them
    const mate = sc2.team.crewOn ? sc2.team.crew.find((m) => Math.hypot((m.pos.x * sc + ox - px), (m.pos.y * sc + oy - py)) < 12) : undefined;
    if (mate) { sfx.click(); sc2.focusMember(mate.id); this.toast(`Showing <b>${esc(mate.name)}</b>: ${esc(mate.note)}`, 'info'); return; }
    const room = ROOMS.find((q) => gx >= q.x0 && gx < q.x0 + q.w && gy >= q.y0 && gy < q.y0 + q.h);
    sfx.click();
    if (room) { sc2.selectTarget('room:' + room.id); this.mmSelected = room.id; const r = sc2.setWaypoint('room:' + room.id); if (!r.ok) this.toast(esc(r.note), 'warn'); else this.toast(esc(r.note), 'info'); return; }
    if (GRID.kind[Math.floor(gy)]?.[Math.floor(gx)] === 'corridor') { sc2.walkTo({ x: Math.floor(gx), y: Math.floor(gy) }); this.toast('Walking there.', 'info'); }
  }

  private renderMinimap(): void {
    const st = this.state, cv = this.hud && ($(this.hud, '#mm') as HTMLCanvasElement | null); if (!st || !cv) return;
    const ctx = cv.getContext('2d')!; const { sc, ox, oy } = this.mmGeom();
    ctx.clearRect(0, 0, 520, 400); ctx.fillStyle = PALETTE.navy; ctx.fillRect(0, 0, 520, 400);
    // corridors
    ctx.fillStyle = '#2a4062'; for (const l of LINKS) for (const c of l.corridor) ctx.fillRect(c.x * sc + ox, c.y * sc + oy, c.w * sc, c.h * sc);
    for (const e of EXTERNALS) { ctx.fillStyle = '#1A2B43'; ctx.strokeStyle = COLOR_HEX[e.color]; ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.fillRect(e.x * sc + ox, e.y * sc + oy, e.w * sc, e.h * sc); ctx.strokeRect(e.x * sc + ox, e.y * sc + oy, e.w * sc, e.h * sc); ctx.setLineDash([]); }
    // rooms
    ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of ROOMS) {
      const has = st.passes.has(r.requiredPass), x = r.x0 * sc + ox, y = r.y0 * sc + oy, w = r.w * sc, h = r.h * sc, known = isKnown(st, r.id);
      if (!known) { ctx.fillStyle = '#16243b'; ctx.fillRect(x, y, w, h); ctx.lineWidth = 2; ctx.strokeStyle = '#34517f'; ctx.strokeRect(x, y, w, h); continue; }
      ctx.fillStyle = has ? 'rgba(157,227,177,0.16)' : 'rgba(11,20,36,0.75)'; ctx.fillRect(x, y, w, h);
      ctx.lineWidth = this.mmSelected === r.id ? 4 : 2; ctx.strokeStyle = this.mmSelected === r.id ? '#fff' : COLOR_HEX[r.accent]; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = PALETTE.white; ctx.font = `bold ${Math.min(15, Math.max(9, w / 5))}px system-ui`; ctx.fillText(r.code, x + w / 2, y + h / 2 - 5);
      ctx.font = `${Math.min(12, Math.max(8, w / 6))}px system-ui`; ctx.fillText(has ? '✓ open' : '🔒', x + w / 2, y + h / 2 + 8);
    }
    // doors: shape as well as colour (open = circle, locked = square, sealed = diamond, disabled = hollow square)
    for (const r of ROOMS) for (const d of r.doors) {
      const di = doorInfo(d, st.passes).status;
      for (const c of d.cells) {
        const cx = (c.x + 0.5) * sc + ox, cy = (c.y + 0.5) * sc + oy, q = Math.max(2.5, sc * 0.45);
        ctx.beginPath();
        if (di === 'open') { ctx.fillStyle = PALETTE.mint; ctx.arc(cx, cy, q, 0, 6.3); ctx.fill(); }
        else if (di === 'locked') { ctx.fillStyle = PALETTE.amber; ctx.fillRect(cx - q, cy - q, q * 2, q * 2); }
        else if (di === 'sealed') { ctx.fillStyle = PALETTE.coral; ctx.moveTo(cx, cy - q * 1.3); ctx.lineTo(cx + q * 1.3, cy); ctx.lineTo(cx, cy + q * 1.3); ctx.lineTo(cx - q * 1.3, cy); ctx.fill(); }
        else { ctx.strokeStyle = '#9fb4d6'; ctx.lineWidth = 2; ctx.strokeRect(cx - q, cy - q, q * 2, q * 2); }
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
    // teammates (Manager mode): coloured dots with their initial
    if (this.scene?.team.crewOn) for (const m of this.scene.team.crew) {
      const mx = m.pos.x * sc + ox, my = m.pos.y * sc + oy, hex = '#' + m.color.toString(16).padStart(6, '0');
      ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(mx, my, 7, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#0B1424'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#0B1424'; ctx.font = 'bold 9px system-ui'; ctx.fillText(m.name[0], mx, my + 0.5);
      if (m.phase === 'blocked' || (m.pending && !m.pending.resolved)) { ctx.fillStyle = PALETTE.amber; ctx.font = 'bold 12px system-ui'; ctx.fillText('!', mx + 9, my - 8); }
    }
    // player
    const px = st.player.x * sc + ox, py = st.player.y * sc + oy;
    ctx.fillStyle = PALETTE.cyan; ctx.beginPath(); ctx.arc(px, py, 8, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = PALETTE.white; ctx.font = 'bold 11px system-ui'; ctx.fillText('YOU', px, py - 15); ctx.font = 'bold 15px system-ui';
    cv.title = 'Click a room or corridor to walk there (never a teleport). Click a teammate to look at them.';
  }

  private renderPasses(): void {
    const st = this.state, box = this.hud && $(this.hud, '#passes'); if (!st || !box) return;
    box.innerHTML = '<span class="chip" style="font-size:.7em">Passes:</span>' + Object.values(PASSES).filter((p) => st.passes.has(p.id) || (p.id !== 'maintenance_pass' && p.id !== 'courier_pass')).map((p) => `<span class="chip ${st.passes.has(p.id) ? 'good' : ''}" title="${esc(p.scope)}">${st.passes.has(p.id) ? '✓' : '🔒'} ${esc(p.name.replace(' Pass', ''))}</span>`).join('');
  }

  // ===================================================================== log ====
  private renderLog(): void {
    const st = this.state, box = this.hud && $(this.hud, '#logpanel'); if (!st || !box) return;
    box.innerHTML = `<h3>Incident log</h3><ul>${st.logEntries.slice(-40).reverse().map((e) => `<li class="${e.tone}"><time>${e.t}</time>${toneIcon(e.tone)} ${esc(e.text)}</li>`).join('')}</ul>`;
  }

  // ===================================================================== panels ====
  openPanel(kind: 'map' | 'log' | 'fabric' | 'blueprint' | 'board' | 'access'): void {
    if (!this.hud || !this.state) return;
    if (kind === 'access') { if (this.dialogOpen || this.pauseOpen || this.blueprint?.isOpen || this.board?.isOpen) return; this.access?.open(); return; }
    if (kind === 'board') {
      if (this.dialogOpen || this.pauseOpen || this.blueprint?.isOpen) return;
      if (this.state.mission.id.startsWith('blue-lantern')) { if (this.blue?.isOpen) this.blue.close(); else this.blue?.open('board'); return; }
      this.board?.toggle(); return;
    }
    if (kind === 'blueprint') { if (this.dialogOpen || this.pauseOpen) return; this.blueprint?.toggle(); return; }
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
    if (d.type === 'emergency') { sfx.click(); this.blue?.open(d.tab as 'board'); return; }
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
        const canJev = jev.enabled && !!this.state;
        card(`<h2>${esc(d.title)}</h2><p>${esc(d.body)}</p><div class="options">${d.options.map((o) => `<button data-o="${o.id}"><b>${esc(o.label)}</b><small>${esc(o.detail)}</small><span class="jv" data-jv="${o.id}"></span></button>`).join('')}</div>
          ${canJev ? '<div class="jevrow"><button data-j="ask">Ask JEV for a second opinion</button><span id="jev-note" class="small" role="status" aria-live="polite"></span></div>' : ''}`);
        let lean: JevChoice | null = null;
        wrap.onclick = async (e) => {
          const t = e.target as HTMLElement, btn = t.closest('button');
          if (btn?.dataset.j === 'ask') {
            const note = $(wrap, '#jev-note')!; (btn as HTMLButtonElement).disabled = true; note.textContent = 'JEV is thinking…';
            lean = await jev.decide(this.state!, d.title, d.body, d.options);
            (btn as HTMLButtonElement).disabled = false;
            if (!lean) { note.textContent = 'JEV could not be reached. The choice is yours (the game works the same without it).'; return; }
            const name = d.options.find((o) => o.id === lean!.choice)?.label ?? lean.choice;
            note.innerHTML = `JEV leans to <b>${esc(name)}</b> (${Math.round(lean.confidence * 100)}% sure). Advice only: you decide, and a wrong answer here costs nothing.`;
            for (const o of d.options) { const sp = $(wrap, `[data-jv="${o.id}"]`); if (sp) sp.textContent = `JEV: ${Math.round((lean.probabilities[o.id] ?? 0) * 100)}%${o.id === lean.choice ? ' \u2605 leans here' : ''}`; }
            return;
          }
          const o = btn?.dataset.o; if (o) close(() => { if (lean && lean.choice === o) this.state!.stats.jevFollowed++; d.onChoose(o); });
        };
        break;
      }
      case 'meeting': {
        const ST = { ok: ['good', '✓ Steady'], warn: ['warn', '⚠ Under strain'], bad: ['bad', '✕ Down'] } as const;
        card(`<div class="chip warn">BCP Command Centre · Bronze team</div><h2 style="margin-top:6px">${esc(d.title)}</h2><p>${esc(d.body)}</p>
          <div class="meet-grid" aria-label="Service managers at the table">${d.attendees.map((a) => `<div class="att ${ST[a.status][0]}"><div class="av">${avatarSvg('bronze:' + a.name, a.name, 44)}</div><div><b>${esc(a.name)}</b> <span class="chip ${ST[a.status][0]}">${ST[a.status][1]}</span><div class="small">${esc(a.role)} · ${esc(a.service)}</div><p class="says">“${esc(a.says)}”</p></div></div>`).join('')}</div>
          <h3>Decision for the Bronze team</h3><div class="options">${d.options.map((o) => `<button data-o="${o.id}"><b>${esc(o.label)}</b><small>${esc(o.detail)}</small>${o.backers?.length ? `<small class="backers">Backed by: ${o.backers.map(esc).join(', ')}</small>` : ''}</button>`).join('')}</div>
          <p class="small">Decisions are recorded in the log with the time and the owner. Pick the one the evidence supports, not the one most people lean towards.</p>`, 'wide');
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
        card(`<div class="chip bad">❗ ${esc(m.alert.severity)} severity alert</div><h2 style="margin-top:6px">${esc(m.alert.headline)}</h2><ul>${m.alert.symptoms.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p><b>Likely impact:</b> ${esc(m.alert.impact)}</p><p><b>Points at:</b> ${esc(ROOM_BY_ID[m.alert.points].name)} (${esc(ROOM_BY_ID[m.alert.points].code)}). You hold an Ops Pass: request read-only passes at the Access Desk or a door reader as evidence points to each room.</p>
          <h3>Service Confidence</h3>${this.measureBars(measuresOf(st))}<div class="row"><button class="primary" data-a="ok">Understood</button>${IncidentBoard.for(st, this.runner!).defs.length ? '<button data-a="board">Open the Incident Board</button>' : ''}<button data-a="goals">Goals</button></div>`);
        wrap.onclick = (e) => { const a = (e.target as HTMLElement).dataset.a; if (a === 'ok') close(); else if (a === 'goals') { close(); this.openDialog({ type: 'goals' }); } else if (a === 'board') { close(); this.board?.open(); } };
        break;
      }
      case 'confidence': {
        const m = measuresOf(st), o = overallConfidence(m);
        card(`<div class="chip info">Control Room wall</div><h2 style="margin-top:6px">Service Confidence: ${o}% (${confidenceWord(o)})</h2><p class="small">Five measures. A high score needs balance: shutting everything down protects integrity but costs availability; releasing everything unchecked keeps services up but costs integrity.</p>${this.measureBars(m)}<p class="small">Campaign so far: ${campaign.overall()}%.</p><div class="row"><button class="primary" data-a="ok">Close</button></div>`);
        wrap.onclick = (e) => { if ((e.target as HTMLElement).dataset.a === 'ok') close(); };
        break;
      }
      case 'goals': {
        const m = st.mission; const kinds: ['primary' | 'optional' | 'stretch', string][] = [['primary', 'Primary (required to complete)'], ['optional', 'Optional (reward careful, skilled play; never blocks)'], ['stretch', 'Stretch (replay value)']];
        card(`<h2>${esc(m.title)}: goals</h2>${kinds.map(([k, label]) => { const gs = m.goals.filter((g) => g.kind === k); return gs.length ? `<h3>${label}</h3><ul class="goals">${gs.map((g) => `<li>${g.done(st) ? '<span class="chip good">\u2713</span>' : '<span class="chip">\u25CB</span>'} ${esc(g.text)}</li>`).join('')}</ul>` : ''; }).join('')}<p class="small">You can recover from mistakes and still finish. Optional and stretch goals can be improved on replay.</p><div class="row"><button class="primary" data-a="ok">Close</button></div>`, 'wide');
        wrap.onclick = (e) => { if ((e.target as HTMLElement).dataset.a === 'ok') close(); };
        break;
      }
      case 'access': this.paintAccess(wrap, d.readerRoom, close, d.door); break;
      case 'board': this.paintBoard(wrap, close); break;
    }
    if (d.type !== 'access' && d.type !== 'board') focusPrimary();
    this.autoResolve(d, wrap);
    wrap.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); close(); } });
  }

  /**
   * Auto keeps the game moving: when Auto is on and nobody has touched the keyboard or mouse for a moment, popups that only
   * ask for acknowledgement are closed, and choices and confirmations are answered with the best-practice option (when
   * "Auto makes the calls" is on). A person who is interacting is never overridden.
   */
  private autoResolve(d: DialogSpec, wrap: HTMLElement): void {
    const team = this.scene?.team; if (!team?.anyAuto() || d.type === 'access') return;
    const decides = d.type === 'choice' || d.type === 'confirm' || d.type === 'meeting';
    if (decides && !settings.data.autoDecide) return;
    if (performance.now() - this.lastInput < 2500) return;
    const seen = this.lastInput;
    bgTimeout(() => {
      if (!wrap.isConnected || this.lastInput !== seen || !this.state) return;
      let btn: HTMLElement | null = null;
      if (d.type === 'choice' || d.type === 'meeting') { const best = this.state.mission.bestChoice?.[d.title] ?? d.options[0].id; btn = wrap.querySelector(`[data-o="${best}"]`); }
      else btn = wrap.querySelector('[data-a="ok"]') ?? wrap.querySelector('button.primary');
      if (!btn) return;
      const title = 'title' in d ? d.title : d.type === 'alert' ? 'Alert' : d.type === 'goals' ? 'Goals' : 'Update';
      btn.click(); this.toast(`Auto continued: <b>${esc(title)}</b>`, 'info');
    }, decides ? 1800 : 1300);
  }
  /** With Auto-run on, move past a briefing or debrief screen by itself after a short pause (any input cancels it). */
  private autoAdvance(screen: HTMLElement, selector: string, seconds: number, what: string): void {
    if (!settings.data.autoRun || performance.now() - this.lastInput < 1500) return;      // a screen the person just asked for stays put
    const btn = screen.querySelector(selector) as HTMLElement | null; if (!btn) return;
    const note = el('div', { class: 'small', role: 'status' }, ''); note.style.marginTop = '8px'; (screen.querySelector('.card') ?? screen).appendChild(note);
    const seen = this.lastInput; let left = seconds;
    const tick = () => {
      if (!screen.isConnected || this.lastInput !== seen) { bgClear(h); if (screen.isConnected) note.textContent = 'Auto-advance cancelled: you took over.'; return; }
      note.textContent = `Auto continues to ${what} in ${left}s. Click or press any key to stay here.`;
      if (left-- <= 0) { bgClear(h); btn.click(); }
    };
    const h = bgInterval(tick, 1000); tick();
  }

  private paintAccess(wrap: HTMLElement, readerRoom: RoomId | undefined, close: (a?: () => void) => void, doorId?: string): void {
    const st = this.state!, runner = this.runner!;
    const rows = (ids: PassId[]) => ids.map((id) => {
      const p = PASSES[id], has = st.passes.has(id);
      return `<tr><td><b>${esc(p.name)}</b><div class="small">${esc(ROOM_BY_ID[p.room].name)} · ${esc(p.scope)}</div></td><td>${has ? '<span class="chip good">✓ Issued</span>' : '<span class="chip warn">🔒 Not held</span>'}</td><td>${has ? (id === 'ops_pass' ? '' : `<button data-rev="${id}" title="Revoke access you no longer need (least privilege)">Revoke</button>`) : `<button data-req="${id}">Request</button>`}</td></tr>`;
    }).join('');
    const door = doorId ? DOOR_BY_ID[doorId] : undefined, di = door ? doorInfo(door, st.passes) : null, rule = door ? LINK_RULES[door.link] : undefined;
    const ids = readerRoom ? [ROOM_BY_ID[readerRoom].requiredPass, ...(rule?.lock ? [rule.lock] : [])] : (Object.keys(PASSES) as PassId[]);
    const ICON = { open: '✓ Open', locked: '\u{1F512} Locked', sealed: '◆ Sealed by an incident', disabled: '⏸ Temporarily disabled' } as const;
    const doorLine = door && di ? `<p class="doorstate ${di.status}" role="status"><b>${ICON[di.status]}</b>: ${esc(di.reason)}.${LINK_BY_ID[door.link].kind === 'maintenance' ? ' <span class="small">This is an optional maintenance shortcut: every required room can be reached the long way round.</span>' : ''}</p>` : '';
    const last = st.latestResult && (st.latestResult.title.includes('Pass') || st.latestResult.title.includes('Request') || st.latestResult.title.includes('granted')) ? `<div class="toast ${st.latestResult.tone}" style="margin:8px 0">${toneIcon(st.latestResult.tone)} <b>${esc(st.latestResult.title)}</b> ${esc(st.latestResult.text)}</div>` : '';
    wrap.innerHTML = `<div class="card wide" role="dialog" aria-modal="true"><div class="chip info">${readerRoom ? 'Door access reader' : 'Access Desk'}</div><h2 style="margin-top:6px">${readerRoom ? esc(ROOM_BY_ID[readerRoom].name) : 'Request a pass'}</h2>
      ${doorLine}<p class="small">Passes are fictional, read-only and expire when the mission ends. A request is approved only when current evidence justifies it. There is no bypass: if it is denied, the hint says what to find first.</p>${last}
      <table class="t">${rows(ids)}</table><div class="row"><button class="primary" data-a="ok">Close</button></div></div>`;
    wrap.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      if (b.dataset.req) { runner.requestPass(b.dataset.req as PassId, readerRoom ? 'reader' : 'desk'); this.paintAccess(wrap, readerRoom, close, doorId); }
      else if (b.dataset.rev) { runner.revoke(b.dataset.rev as PassId); this.paintAccess(wrap, readerRoom, close, doorId); }
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
      ${(m.recordables ?? []).length ? `<h3>Record results (audit quality)</h3><ul class="goals">${(m.recordables ?? []).map((r) => `<li>${st.recordsMade.includes(r.id) ? '<span class="chip good">\u2713 Recorded</span>' : r.when(st) ? `<button data-rec="${r.id}">Record</button>` : '<span class="chip">\u25CB Not ready</span>'} ${esc(r.label)}</li>`).join('')}</ul>` : ''}
      ${(st.data.priorCount ?? 0) > 0 ? `<p class="small">Evidence from earlier missions on this board: ${st.data.priorCount} item(s).</p>` : ''}
      <p class="small">${ready === true ? 'Everything needed is in place. Filing closes the incident.' : esc(ready)}</p>
      <div class="row"><button class="primary" data-a="file" ${ready === true ? '' : 'aria-disabled="true"'}>File incident report</button><button data-a="ok">Close</button></div></div>`;
    wrap.onclick = (e) => {
      const rec = (e.target as HTMLElement).dataset.rec;
      if (rec) { runner.record(rec); this.paintBoard(wrap, close); return; }
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'ok') close();
      if (a === 'file') { if (ready === true) close(() => runner.fileReport()); else runner.api.say('Report not ready', String(ready), 'warn', { hint: true }); }
    };
  }
}
export { FAC_H, GRID };
