import Phaser from 'phaser';
import { C, PALETTE, TILE_H, TILE_W, type PaletteKey } from '../constants';
import { ATLAS_GROUPS, hasFrame, makeImage } from '../art';
import { depthOf, findPath, guideToRoom, nearestReachable, nearestWalkable, toGrid, toScreen, walkableFor } from '../systems/Grid';
import { reachRange } from '../systems/Reach';
import { jev } from '../../integrations/jev/JevClient';
import { standFor } from '../systems/Reach';
import { TeamController, type ExternalBody, type Member } from '../systems/Team';
import { FlowRenderer } from '../systems/FlowRenderer';
import { GameState } from '../systems/GameState';
import { MissionRunner } from '../systems/MissionRunner';
import { settings } from '../systems/Settings';
import { sfx } from '../systems/Sfx';
import { ENTRANCE, EXTERNALS, GRID, ROOMS, ROOM_BY_ID, WORLD_H, WORLD_W, doorInfo, roomAt } from '../../data/map';
import { isKnown } from '../systems/Fog';
import { PASSES } from '../../data/passes';
import { ROUTES, ROUTE_BY_ID, pointAt, routePoints, routeRooms } from '../../data/routes';
import { TOOL_BY_ID } from '../../data/tools';
import { describeTarget } from '../../data/targets';
import type { MissionDef } from '../../data/missions/types';
import type { Cell, DoorDef, PropDef, RoomDef, RoomId } from '../types';
import type { SceneApi } from '../sceneApi';
import { app } from '../../app';
import { MEASURE_KEYS, MEASURE_LABEL, confidenceWord, measuresOf, overallConfidence } from '../systems/Confidence';

type Facing = 'se' | 'sw' | 'nw' | 'ne';
type Pose = 'idle' | 'walk' | 'scan' | 'repair' | 'success';
const POSE_FRAMES: Record<Pose, number> = { idle: 2, walk: 8, scan: 4, repair: 4, success: 4 };
const POSE_FPS: Record<Pose, number> = { idle: 1.6, walk: 13, scan: 6, repair: 5, success: 7 };
const SPEED = 5.4;             // cells / second
const mix = (a: number, b: number, t: number) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t);
};

export class FacilityScene extends Phaser.Scene implements SceneApi {
  state!: GameState;
  runner!: MissionRunner;
  private flow!: FlowRenderer;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: Phaser.GameObjects.Image;
  private pos = { x: 0, y: 0 };
  private from: Cell = { x: 0, y: 0 };
  private to: Cell | null = null;
  private prog = 0;
  private path: Cell[] = [];
  private facing: Facing = 'se';
  private pose: Pose = 'idle';
  private poseUntil = 0;
  private touchDir = { x: 0, y: 0 };
  private autoApproach: string | null = null;
  private followPlayer = true;
  private dragging = false;
  private lastBump = 0;
  private prompt!: Phaser.GameObjects.Text;
  private promptTarget: string | null = null;
  private doorSprites = new Map<string, Phaser.GameObjects.Image>();
  private readerSprites = new Map<string, Phaser.GameObjects.Image>();
  private roomLabels = new Map<RoomId, Phaser.GameObjects.Text>();
  /** Everything that belongs to a room, so undiscovered rooms can be drawn as silhouettes. */
  private roomObjs = new Map<RoomId, { floors: { img: Phaser.GameObjects.Image; tint: number | null }[]; walls: Phaser.GameObjects.Image[]; props: Phaser.GameObjects.Image[] }>();
  private fogSig = '';
  private water!: Phaser.GameObjects.Graphics;
  private fogG!: Phaser.GameObjects.Graphics;
  private waterLabels = new Map<RoomId, Phaser.GameObjects.Text>();
  private objsOf(id: RoomId) { let o = this.roomObjs.get(id); if (!o) { o = { floors: [], walls: [], props: [] }; this.roomObjs.set(id, o); } return o; }
  private walls: { img: Phaser.GameObjects.Image; gx: number; gy: number }[] = [];
  private propSprites = new Map<string, Phaser.GameObjects.Image>();
  private statusLabels = new Map<string, Phaser.GameObjects.Text>();
  private entitySprites = new Map<string, { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private barriers = new Map<string, Phaser.GameObjects.Image>();
  private guide!: Phaser.GameObjects.Graphics;
  private guideUntil = 0;
  private guideCells: Cell[] = [];
  private highlight!: Phaser.GameObjects.Graphics;
  private coach!: Phaser.GameObjects.Graphics;
  private coachTargets: string[] = [];
  team!: TeamController;
  private waypoint: { cell: Cell; label: string } | null = null;
  private flash: { ids: string[]; until: number } = { ids: [], until: 0 };
  private crewSprites = new Map<string, { img: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Graphics }>();
  private wallBoard!: Phaser.GameObjects.Text;
  private wallSig = '';
  private unsub: (() => void)[] = [];
  private closing = false;
  private entityCache = new Map<string, string>();

  constructor() { super('Facility'); }

  init(data: { mission: MissionDef; relaxed?: boolean }): void {
    // Phaser re-uses this scene object when a mission is restarted or the next one begins: start from a clean slate
    this.closing = false; this.fogSig = ''; this.wallSig = ''; this.waypoint = null; this.flash = { ids: [], until: 0 };
    this.to = null; this.path = []; this.prog = 0; this.dragging = false; this.autoApproach = null; this.followPlayer = true; this.guideUntil = 0; this.guideCells = []; this.coachTargets = [];
    this.walls = []; this.unsub = [];
    for (const m of [this.doorSprites, this.readerSprites, this.roomLabels, this.roomObjs, this.waterLabels, this.propSprites, this.statusLabels, this.entitySprites, this.barriers, this.crewSprites, this.entityCache] as Map<unknown, unknown>[]) m.clear();
    this.state = new GameState(data.mission, data.relaxed ?? settings.data.relaxed);
    this.state.tutorial = settings.data.tutorial;
    this.runner = new MissionRunner(this.state);
  }

  // ------------------------------------------------------------------ world construction ----
  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.navy);
    this.buildFloors();
    this.buildWallsAndDoors();
    this.buildProps();
    this.buildExternals();
    this.buildLabels();
    this.flow = new FlowRenderer(this);
    this.guide = this.add.graphics().setDepth(19000);
    this.highlight = this.add.graphics().setDepth(19500);
    this.water = this.add.graphics().setDepth(9000);
    this.fogG = this.add.graphics().setDepth(-9000);
    this.coach = this.add.graphics().setDepth(21800);
    this.buildPlayer();
    this.buildTeam();
    this.buildInput();
    this.buildCamera();
    // Service Confidence summary on the Control Room wall (above the Incident Wall screen)
    const wp = this.state.mission.startRoom === 'secure_ops' ? ROOM_BY_ID.secure_ops.props.find((p) => p.key === 'incident_wall') : undefined;
    const ws = wp ? this.S(wp.gx + 0.5, wp.gy + 0.5) : { x: 0, y: 0 };
    this.wallBoard = this.add.text(ws.x, ws.y - 92, '', { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '8px', color: PALETTE.white, backgroundColor: 'rgba(11,20,36,0.92)', padding: { x: 4, y: 3 }, align: 'left' }).setOrigin(0.5, 1).setDepth(15500).setResolution(3);
    this.prompt = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: PALETTE.navy, backgroundColor: PALETTE.amber, padding: { x: 5, y: 2 } }).setOrigin(0.5, 1).setDepth(21000).setResolution(2).setVisible(false);

    this.runner.start();
    this.unsub.push(
      this.state.on('fx', (e) => this.playFx(e.type, e.target)),
      this.state.on('pass', () => this.refreshAccess()),
      this.state.on('change', () => this.syncVisuals()),
      this.state.on('ui', (k) => app.ui?.openPanel(k)),
    );
    this.refreshAccess();
    this.syncVisuals();
    app.ui?.attachMission(this.state, this.runner, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.closing = true; this.unsub.forEach((u) => u()); app.ui?.detachMission(); });
  }

  private S = (gx: number, gy: number) => toScreen(gx, gy);

  private buildFloors(): void {
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      const k = GRID.kind[y][x];
      if (k === 'void') continue;
      const room = GRID.roomOf[y][x];
      let frame = 'floor_corridor';
      if (k === 'room') frame = (x + y) % 2 ? 'floor_a' : 'floor_b';
      else if (k === 'door') frame = 'floor_door';
      else if (k === 'wall') continue;                       // wall sprites include their own floor slab
      const p = this.S(x + 0.5, y + 0.5);
      const img = makeImage(this, 'environment', frame, p.x, p.y).setDepth(-10000 + x + y);
      img.setScale(img.scaleX * 1.035);
      let tint: number | null = null;
      if (k === 'room' && room) { tint = mix(0xffffff, C[ROOM_BY_ID[room].accent], 0.22); img.setTint(tint); }
      if (room) this.objsOf(room).floors.push({ img, tint });
    }
  }

  private buildWallsAndDoors(): void {
    for (const r of ROOMS) {
      const x1 = r.x0 + r.w - 1, y1 = r.y0 + r.h - 1;
      const add = (x: number, y: number, frame: string, bias = 1) => {
        const p = this.S(x + 0.5, y + 0.5);
        const img = makeImage(this, 'environment', frame, p.x, p.y).setDepth(depthOf(x + 0.5, y + 0.5, bias));
        this.walls.push({ img, gx: x + 0.5, gy: y + 0.5 });
        this.objsOf(r.id).walls.push(img);
      };
      for (let x = r.x0; x <= x1; x++) {
        for (const y of [r.y0, y1]) {
          if (GRID.kind[y][x] !== 'wall') continue;
          const corner = x === r.x0 || x === x1;
          if (y === r.y0) add(x, y, corner ? 'pillar' : (x - r.x0) % 3 === 0 ? 'wall_n_window' : 'wall_n_band');
          else add(x, y, corner ? 'pillar' : 'wall_s_low');
        }
      }
      for (let y = r.y0 + 1; y < y1; y++) {
        if (GRID.kind[y][r.x0] === 'wall') add(r.x0, y, (y - r.y0) % 3 === 0 ? 'wall_w_window' : 'wall_w_band');
        if (GRID.kind[y][x1] === 'wall') add(x1, y, 'wall_e_low');
      }
      for (const d of r.doors) this.addDoor(d);
    }
    // facility entrance gate: decorative, on open ground outside the atrium's south-east corner
    const e = this.S(ENTRANCE.x + 1.5, ENTRANCE.y + 0.5);
    makeImage(this, 'environment', 'entrance_gate', e.x, e.y).setDepth(depthOf(ENTRANCE.x + 1.5, ENTRANCE.y + 0.5, 1));
    this.add.text(e.x, e.y - 74, 'FACILITY ENTRANCE', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: PALETTE.navy, backgroundColor: PALETTE.cyan, padding: { x: 4, y: 1 } }).setOrigin(0.5).setDepth(15000).setResolution(2);
  }

  private doorAnchor(d: DoorDef): { gx: number; gy: number } {
    const [a, b] = d.cells;
    const cx = (a.x + b.x) / 2 + 0.5, cy = (a.y + b.y) / 2 + 0.5;
    return { gx: cx, gy: cy };
  }
  private doorFrame(d: DoorDef, open: boolean): string {
    const st = open ? 'open' : 'closed';
    return d.side === 'n' ? `door_n_${st}` : d.side === 'w' ? `door_w_${st}` : d.side === 's' ? `gate_s_${st}` : `gate_e_${st}`;
  }
  private addDoor(d: DoorDef): void {
    const a = this.doorAnchor(d), p = this.S(a.gx, a.gy);
    const img = makeImage(this, 'environment', this.doorFrame(d, false), p.x, p.y).setDepth(depthOf(a.gx, a.gy, 2));
    this.doorSprites.set(d.id, img);
    const rp = this.S(d.readerCell.x + 0.5, d.readerCell.y + 0.5);
    const rd = makeImage(this, 'environment', 'reader', rp.x, rp.y).setDepth(depthOf(d.readerCell.x + 0.5, d.readerCell.y + 0.5, 3));
    this.readerSprites.set(d.id, rd);
  }

  private refreshAccess(): void {
    const passes = this.state.passes;
    for (const r of ROOMS) {
      const open = passes.has(r.requiredPass);
      for (const d of r.doors) {
        const st = doorInfo(d, passes).status, isOpen = st === 'open';
        const spr = this.doorSprites.get(d.id), rd = this.readerSprites.get(d.id);
        const frame = this.doorFrame(d, isOpen);
        if (spr && hasFrame(this, 'environment', frame)) spr.setFrame(frame);
        spr?.setTint(st === 'sealed' ? 0xff7183 : st === 'disabled' ? 0x8a94a6 : 0xffffff);
        if (rd && hasFrame(this, 'environment', isOpen ? 'reader_ok' : 'reader')) rd.setFrame(isOpen ? 'reader_ok' : 'reader');
      }
      const lbl = this.roomLabels.get(r.id);
      if (lbl) lbl.setText(this.roomLabelText(r, open));
    }
    this.applyFog();
  }
  /** Undiscovered rooms are silhouettes: dark floor and walls, no equipment, no name. */
  private applyFog(): void {
    const sig = ROOMS.map((r) => (isKnown(this.state, r.id) ? 1 : 0)).join('');
    if (sig === this.fogSig) return;
    this.fogSig = sig;
    for (const r of ROOMS) {
      const known = isKnown(this.state, r.id), o = this.roomObjs.get(r.id); if (!o) continue;
      for (const f of o.floors) { if (known) { f.tint === null ? f.img.clearTint() : f.img.setTint(f.tint); f.img.setAlpha(1); } else f.img.setTint(0x16243b).setAlpha(0.95); }
      for (const w of o.walls) w.setVisible(known);                // an undiscovered room is a flat dark footprint, not a block of tall walls
      for (const p of o.props) p.setVisible(known);
      this.roomLabels.get(r.id)?.setVisible(known);
      for (const p of r.props) { const t = this.statusLabels.get(p.id); if (t && !known) t.setVisible(false); }
    }
    // data routes only show once every room they pass through is discovered
    this.flow.hidden = new Set(ROUTES.filter((q) => routeRooms(q).some((id) => !isKnown(this.state, id))).map((q) => q.id));
    this.fogG.clear();
    for (const r of ROOMS) if (!isKnown(this.state, r.id)) {
      const pts = [[r.x0, r.y0], [r.x0 + r.w, r.y0], [r.x0 + r.w, r.y0 + r.h], [r.x0, r.y0 + r.h]].map(([x, y]) => this.S(x, y));
      this.fogG.fillStyle(0x0f1b2e, 1).fillPoints(pts.map((q) => new Phaser.Geom.Point(q.x, q.y)), true).lineStyle(2, 0x34517f, 0.9).strokePoints(pts.map((q) => new Phaser.Geom.Point(q.x, q.y)), true);
    }
  }
  private roomLabelText(r: RoomDef, open: boolean): string {
    return `${r.code} · ${r.name}\n${open ? '✓ open' : '🔒 needs ' + PASSES[r.requiredPass].name}`;
  }

  private buildProps(): void {
    for (const r of ROOMS) for (const p of r.props) {
      const s = this.S(p.gx + 0.5, p.gy + 0.5);
      const img = makeImage(this, 'props', p.sprite, s.x, s.y).setDepth(depthOf(p.gx + 0.5, p.gy + 0.5, 2));
      this.propSprites.set(p.id, img); this.objsOf(r.id).props.push(img);
    }
  }

  private buildExternals(): void {
    for (const e of EXTERNALS) {
      const s = this.S(e.x + 1.5, e.y + 1.5);
      makeImage(this, 'environment', e.sprite, s.x, s.y).setDepth(depthOf(e.x + 1.5, e.y + 1.5, 1));
      this.add.text(s.x, s.y - 92, `${e.name.toUpperCase()}\nsimulated external service`, { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: PALETTE.white, backgroundColor: 'rgba(26,43,67,0.92)', padding: { x: 4, y: 2 }, align: 'center' }).setOrigin(0.5).setDepth(15000).setResolution(2);
    }
  }

  private buildLabels(): void {
    for (const r of ROOMS) {
      const s = this.S(r.x0 + r.w / 2, r.y0 + 0.2);
      const t = this.add.text(s.x, s.y - 34, this.roomLabelText(r, r.requiredPass === 'ops_pass'), {
        fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: PALETTE.white, backgroundColor: 'rgba(11,20,36,0.88)', padding: { x: 4, y: 2 }, align: 'center',
      }).setOrigin(0.5, 1).setDepth(15000).setResolution(2);
      this.roomLabels.set(r.id, t);
    }
  }

  private buildPlayer(): void {
    const start = ROOM_BY_ID[this.state.mission.startRoom];
    const spawn = nearestWalkable(walkableFor(this.state.passes), start.x0 + start.w / 2, start.y0 + start.h / 2, 5) ?? { x: start.x0 + 5, y: start.y0 + 4 };
    this.from = { x: spawn.x, y: spawn.y };
    this.pos = { x: this.from.x + 0.5, y: this.from.y + 0.5 };
    const s = this.S(this.pos.x, this.pos.y);
    this.player = makeImage(this, 'characters', 'eng_se_idle_0', s.x, s.y);
  }

  /** Team (Manager mode) and Auto-play share one controller; the player's avatar is driven through this body when Auto-play is on. */
  private buildTeam(): void {
    const room = ROOM_BY_ID[this.state.mission.startRoom], walk = walkableFor(this.state.passes);
    const spawn = [0, 1, 2, 3].map((i) => nearestWalkable(walk, room.x0 + room.w / 2 - 3 + i * 2, room.y0 + room.h / 2 + 1, 5) ?? this.from);
    const body: ExternalBody = {
      cell: () => this.to ?? this.from, pos: () => this.pos,
      walkTo: (c) => this.walkTo(c), idle: () => !this.to && !this.path.length,
      cancel: () => { this.path = []; }, pose: (t) => this.setPoseFor(t),
    };
    this.team = new TeamController(this.state, this.runner, { team: settings.data.team, spawn, body, autoDecide: () => settings.data.autoDecide, onAuto: (any) => { if (settings.data.autoRun !== any && !this.closing) settings.set('autoRun', any); },
      jevOn: () => jev.enabled,
      advise: async (spec) => { const r = await jev.decide(this.state, spec.title, spec.body, spec.options); return r ? { id: r.choice, confidence: r.confidence } : null; } });
    this.unsub.push(() => this.team.dispose());
    if (settings.data.autoRun) this.team.setAllAuto(true);          // Auto keeps going across missions until someone switches it off
    for (const m of this.team.members) {
      if (m.external) continue;
      const img = makeImage(this, 'characters', 'eng_se_idle_0', 0, 0).setTint(m.color);
      const ring = this.add.graphics().setDepth(1);
      const tag = this.add.text(0, 0, m.name, { fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: '#0b1424', backgroundColor: '#' + m.color.toString(16).padStart(6, '0'), padding: { x: 3, y: 1 } }).setOrigin(0.5, 1).setResolution(3);
      this.crewSprites.set(m.id, { img, tag, ring });
    }
  }
  /** The manager takes the controls back: manual movement stops the player's own Auto-play. */
  private takeOver(): void { if (this.team?.you.auto) { this.team.setAuto('you', false); this.team.recall('you'); app.ui?.toast('You have the controls again. Auto-play is off.', 'info'); } }
  focusMember(id: string): void {
    const m = this.team.member(id); if (!m) return;
    if (m.external) return this.returnToPlayer();
    const p = this.S(m.pos.x, m.pos.y);
    this.followPlayer = false; this.cameras.main.stopFollow(); this.cameras.main.pan(p.x, p.y, 450, 'Sine.easeInOut');
  }
  /** A disaster in a room (flag `flood_<room>`): a rippling water layer over the floor and a warning label until it is cleared. */
  private drawWater(time: number): void {
    const g = this.water; g.clear();
    for (const r of ROOMS) {
      const on = !!this.state.flags['flood_' + r.id];
      const lbl = this.waterLabels.get(r.id);
      if (!on) { lbl?.setVisible(false); continue; }
      const k = settings.data.reducedMotion ? 0 : 1, wave = 0.06 * Math.sin(time / 500) * k;
      const pts = [[r.x0 + 1, r.y0 + 1], [r.x0 + r.w - 1, r.y0 + 1], [r.x0 + r.w - 1, r.y0 + r.h - 1], [r.x0 + 1, r.y0 + r.h - 1]].map(([x, y]) => this.S(x, y));
      g.fillStyle(0x2f9bd8, 0.42 + wave).fillPoints(pts.map((p) => new Phaser.Geom.Point(p.x, p.y)), true);
      g.lineStyle(2, 0x9fe3ff, 0.7).strokePoints(pts.map((p) => new Phaser.Geom.Point(p.x, p.y)), true);
      for (let i = 1; i < 6; i++) { const a = this.S(r.x0 + 1, r.y0 + 1 + (i * (r.h - 2)) / 6 + wave * 4), b = this.S(r.x0 + r.w - 1, r.y0 + 1 + (i * (r.h - 2)) / 6 + wave * 4); g.lineStyle(1, 0xcdf3ff, 0.35).lineBetween(a.x, a.y, b.x, b.y); }
      let t = lbl; const c = this.S(r.x0 + r.w / 2, r.y0 + r.h / 2);
      if (!t) { t = this.add.text(c.x, c.y - 40, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#0b1424', backgroundColor: '#9fe3ff', padding: { x: 5, y: 2 }, fontStyle: 'bold' }).setOrigin(0.5).setDepth(15200).setResolution(2); this.waterLabels.set(r.id, t); }
      t.setText(this.state.flags.st_safety ? '≈ FLOODED · power isolated · keep out' : '≈ FLOODING · live power · keep out').setVisible(true).setPosition(c.x, c.y - 40);
    }
  }

  private syncTeam(time: number): void {
    const on = this.team.crewOn;
    for (const [id, sp] of this.crewSprites) {
      const m = this.team.member(id) as Member;
      sp.img.setVisible(on); sp.tag.setVisible(on); sp.ring.setVisible(on);
      if (!on) continue;
      const pose: Pose = m.phase === 'walking' ? 'walk' : m.phase === 'working' ? (m.task?.tool === 'patch' ? 'repair' : 'scan') : m.phase === 'waiting' || m.phase === 'blocked' ? 'idle' : 'idle';
      const idx = Math.floor((time / 1000) * POSE_FPS[pose] + m.pos.x * 3) % POSE_FRAMES[pose];
      const frame = `eng_${m.facing}_${pose}_${idx}`;
      if (hasFrame(this, 'characters', frame) && sp.img.frame.name !== frame) sp.img.setFrame(frame);
      const s = this.S(m.pos.x, m.pos.y);
      sp.img.setPosition(s.x, s.y).setDepth(depthOf(m.pos.x, m.pos.y, 3));
      sp.tag.setPosition(s.x, s.y - 74).setDepth(depthOf(m.pos.x, m.pos.y, 4)).setText(m.name + (m.pending && !m.pending.resolved ? ' ?' : m.phase === 'blocked' ? ' !' : m.auto ? ' ⟳' : ''));
      sp.ring.clear().lineStyle(2, m.color, 0.9).strokeEllipse(s.x, s.y + 2, 30, 14).setDepth(depthOf(m.pos.x, m.pos.y, 1));
    }
  }

  private buildInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE');
    kb.on('keydown-E', () => { if (!this.state.paused) this.useTool(); });
    kb.on('keydown-ESC', () => app.ui?.togglePause());
    TOOLS_KEYS.forEach((id, i) => kb.on('keydown-' + (i + 1 === 1 ? 'ONE' : i + 1 === 2 ? 'TWO' : i + 1 === 3 ? 'THREE' : i + 1 === 4 ? 'FOUR' : i + 1 === 5 ? 'FIVE' : i + 1 === 6 ? 'SIX' : i + 1 === 7 ? 'SEVEN' : 'EIGHT'), () => { if (!this.state.paused) app.ui?.selectTool(id); }));
    kb.on('keydown-M', () => app.ui?.openPanel('map'));
    kb.on('keydown-F', () => app.ui?.openPanel('fabric'));
    kb.on('keydown-L', () => app.ui?.openPanel('log'));
    kb.on('keydown-R', () => this.setRoutesVisible(!this.flow.visible));
    kb.on('keydown-C', () => this.returnToPlayer());
    kb.on('keydown-I', () => (document.getElementById('b-board') as HTMLElement | null)?.click());
    kb.on('keydown-B', () => (document.getElementById('b-blueprint') as HTMLElement | null)?.click());
    kb.on('keydown-T', () => (document.getElementById('b-team') as HTMLElement | null)?.click());
    kb.on('keydown-G', () => { if (!this.state.paused) app.ui?.openGoals(); });
    kb.on('keydown-PLUS', () => this.zoomBy(0.15));
    kb.on('keydown-MINUS', () => this.zoomBy(-0.15));

    let down: { x: number; y: number; cx: number; cy: number } | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) down = { x: p.x, y: p.y, cx: this.cameras.main.scrollX, cy: this.cameras.main.scrollY }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!down || !p.isDown) return;
      const dx = p.x - down.x, dy = p.y - down.y;
      if (!this.dragging && Math.hypot(dx, dy) > 8) { this.dragging = true; this.followPlayer = false; this.cameras.main.stopFollow(); }
      if (this.dragging) { const z = this.cameras.main.zoom; this.cameras.main.setScroll(down.cx - dx / z, down.cy - dy / z); }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0 && down && !this.dragging && !this.state.paused) this.handleClick(p.worldX, p.worldY);
      down = null; this.dragging = false;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -0.1 : 0.1));
  }

  private buildCamera(): void {
    const cam = this.cameras.main;
    const w = (WORLD_W + WORLD_H) * (TILE_W / 2) + 480, h = (WORLD_W + WORLD_H) * (TILE_H / 2) + 520;
    cam.setBounds(0, 0, w, h);
    cam.setZoom(this.scale.width < 700 ? 1.2 : 1.6);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);
  }

  // ------------------------------------------------------------------ SceneApi ----
  selectTarget(id: string | null): void { this.state.selectedTarget = id; this.state.changed(); }
  returnToPlayer(): void { this.followPlayer = true; this.cameras.main.startFollow(this.player, true, 0.12, 0.12); }
  zoomBy(d: number): void { const cam = this.cameras.main; cam.setZoom(Phaser.Math.Clamp(cam.zoom + d, 0.55, 3)); }
  setTouchDir(dx: number, dy: number): void { this.touchDir = { x: dx, y: dy }; }
  walkTo(cell: Cell): void {
    const walk = walkableFor(this.state.passes);
    const start = this.to ?? this.from;
    const goal = nearestReachable(walk, start, cell.x + 0.5, cell.y + 0.5);
    if (!goal) return;
    const p = findPath(walk, start, goal);
    if (p) { this.path = p; this.autoApproach = null; }
  }
  guideToRoom(room: RoomId) {
    const g = guideToRoom(this.from, room, this.state.passes);
    if (g) { this.guideCells = g.path; this.guideUntil = this.time.now + 14000; }
    return g;
  }
  setCoachTargets(ids: string[]): void { this.coachTargets = ids; }
  /** Pulse a beacon on these targets for a few seconds (used by the map and blueprint to show "this one"). */
  flashTargets(ids: string[], ms = 6000): void { this.flash = { ids, until: this.time.now + ms }; }
  /** Walk (never teleport) to the nearest place from which `target` can be used. Locked rooms: walk to the corridor outside the door. */
  setWaypoint(target: string): { ok: boolean; note: string } {
    const t = describeTarget(target); if (!t) return { ok: false, note: 'That place is not on the map.' };
    const from = this.to ?? this.from, passes = this.state.passes;
    let cell: Cell | null = null, locked = false;
    const st = standFor(target, from, passes);
    if (st) cell = st.goal;
    else {
      const room = t.room?.id ?? t.prop?.room ?? (t.route ? routeRooms(t.route)[0] : t.door?.room);
      const g = room ? guideToRoom(from, room, passes) : null;
      if (g?.path.length) { cell = g.path[g.path.length - 1]; locked = g.locked; this.guideCells = g.path; this.guideUntil = this.time.now + 14000; }
    }
    if (!cell) return { ok: false, note: `There is no walkable way to ${t.name} from here.` };
    this.takeOver();
    this.waypoint = { cell, label: t.name }; this.walkTo(cell); this.returnToPlayer();
    return { ok: true, note: locked ? `${t.name} is locked for you. Walking to the corridor outside its door: the door reader shows which pass opens it.` : `Walking to ${t.name}.` };
  }
  clearWaypoint(): void { this.waypoint = null; this.path = []; }
  setRoutesVisible(v: boolean): void { this.flow.setVisible(v); }
  routesVisible(): boolean { return this.flow.visible; }
  focusOn(target: string): void {
    const pos = this.targetPos(target); if (!pos) return;
    this.followPlayer = false; this.cameras.main.stopFollow(); this.cameras.main.pan(pos.x, pos.y, 500, 'Sine.easeInOut');
  }

  // ------------------------------------------------------------------ targets, range and interaction ----
  /** Test/debug helper: world pixel -> grid coordinates. */
  toGridPublic(x: number, y: number) { return toGrid(x, y); }
  targetPos(id: string): { x: number; y: number } | null {
    const t = describeTarget(id); if (!t) return null;
    if (t.prop) return this.S(t.prop.gx + 0.5, t.prop.gy + 0.5);
    if (t.door) return this.S(t.door.readerCell.x + 0.5, t.door.readerCell.y + 0.5);
    if (t.room) return this.S(t.room.x0 + t.room.w / 2, t.room.y0 + t.room.h / 2);
    if (t.ext) return this.S(t.ext.x + 1.5, t.ext.y + 1.5);
    if (t.route) { const m = this.flow.routeMid(t.route.id); return { x: m[0], y: m[1] }; }
    return null;
  }

  /** Is the player close enough to use `id`? Returns a hint when not. */
  inRange(id: string): { ok: boolean; hint?: string } { return reachRange(id, this.pos.x, this.pos.y); }

  private nearestInteractable(): string | null {
    let best: { id: string; d: number } | null = null;
    for (const r of ROOMS) {
      for (const p of r.props) {
        if (!p.interactive) continue;
        const d = Math.hypot(p.gx + 0.5 - this.pos.x, p.gy + 0.5 - this.pos.y);
        if (d <= 2.3 && (!best || d < best.d)) best = { id: p.id, d };
      }
      for (const dr of r.doors) {
        const d = Math.hypot(dr.readerCell.x + 0.5 - this.pos.x, dr.readerCell.y + 0.5 - this.pos.y);
        if (d <= 2.6 && (!best || d < best.d - 0.6)) best = { id: 'reader:' + dr.id, d };
      }
    }
    return best?.id ?? null;
  }

  useTool(): void {
    const st = this.state;
    if (st.complete) return;
    const tool = TOOL_BY_ID[st.selectedTool];
    let target: string | null = null;
    const sel = st.selectedTarget;
    const needsArea = tool.id === 'quarantine' || tool.id === 'reroute';
    if (sel) {
      const kind = sel.split(':')[0];
      if (!needsArea || kind === 'room' || kind === 'route') target = sel;
    }
    if (!target) target = needsArea ? null : this.nearestInteractable();
    if (!target) {
      if (needsArea) this.runner.api.say('Pick a room or route', 'Click a flow line or the room floor to select it, then use the tool.', 'info', { hint: true });
      else this.runner.api.say('Nothing in reach', 'Walk up to a console, rack or door reader and press E. Click an object to select it.', 'info', { hint: true });
      return;
    }
    const r = this.inRange(target);
    if (!r.ok) {
      this.runner.api.say('Too far away', r.hint ?? 'Walk closer.', 'warn', { hint: true });
      this.approach(target);
      return;
    }
    this.setPoseFor(tool.id);
    this.runner.interact(target);
    sfx.click();
  }

  private approach(target: string): void {
    const pos = this.targetPos(target); if (!pos) return;
    const g = toGrid(pos.x, pos.y);
    this.walkTo({ x: Math.floor(g.gx), y: Math.floor(g.gy) });
  }

  private handleClick(wx: number, wy: number): void {
    // props, readers, externals first; then routes; then the floor (select room + walk)
    let best: { id: string; d: number } | null = null;
    const consider = (id: string, x: number, y: number, r: number) => { const d = Math.hypot(wx - x, wy - y); if (d <= r && (!best || d < best.d)) best = { id, d }; };
    for (const room of ROOMS) {
      for (const p of room.props) { const s = this.S(p.gx + 0.5, p.gy + 0.5); consider(p.id, s.x, s.y - 14, 24); }
      for (const d of room.doors) { const s = this.S(d.readerCell.x + 0.5, d.readerCell.y + 0.5); consider('reader:' + d.id, s.x, s.y - 14, 18); }
    }
    for (const e of EXTERNALS) { const s = this.S(e.x + 1.5, e.y + 1.5); consider('ext:' + e.id, s.x, s.y - 20, 44); }
    if (!best && this.flow.visible) { const h = this.flow.hit(wx, wy); if (h && h.d <= 10) best = { id: 'route:' + h.id, d: h.d }; }
    if (best) { this.selectTarget((best as { id: string }).id); sfx.click(); return; }
    const g = toGrid(wx, wy), cx = Math.floor(g.gx), cy = Math.floor(g.gy);
    const room = roomAt(cx, cy);
    if (room) this.selectTarget('room:' + room.id); else this.selectTarget(null);
    if (GRID.kind[cy]?.[cx] && GRID.kind[cy][cx] !== 'void') { this.takeOver(); this.walkTo({ x: cx, y: cy }); }
  }

  // ------------------------------------------------------------------ player ----
  private setPoseFor(tool: string): void {
    const now = this.time.now;
    this.pose = tool === 'patch' ? 'repair' : tool === 'restore' || tool === 'recon' ? 'scan' : 'scan';
    this.poseUntil = now + (this.pose === 'repair' ? 1500 : 1100);
  }

  private readDir(): { x: number; y: number } {
    const k = this.keys;
    let dx = 0, dy = 0;
    if (k.W.isDown || k.UP.isDown) { dx -= 1; dy -= 1; }          // screen up
    if (k.S.isDown || k.DOWN.isDown) { dx += 1; dy += 1; }        // screen down
    if (k.A.isDown || k.LEFT.isDown) { dx -= 1; dy += 1; }        // screen left
    if (k.D.isDown || k.RIGHT.isDown) { dx += 1; dy -= 1; }       // screen right
    dx += this.touchDir.x; dy += this.touchDir.y;
    return { x: Math.sign(dx), y: Math.sign(dy) };
  }

  private canStep(c: Cell, dx: number, dy: number, walk: (x: number, y: number) => boolean): boolean {
    if (!walk(c.x + dx, c.y + dy)) return false;
    if (dx && dy && (!walk(c.x + dx, c.y) || !walk(c.x, c.y + dy))) return false;
    return true;
  }

  private facingFor(dx: number, dy: number): Facing {
    if (dx === 1 && dy === 0) return 'se'; if (dx === 0 && dy === 1) return 'sw'; if (dx === -1 && dy === 0) return 'nw'; if (dx === 0 && dy === -1) return 'ne';
    if (dx === 1 && dy === 1) return 'se'; if (dx === -1 && dy === -1) return 'nw'; if (dx === 1 && dy === -1) return 'ne'; return 'sw';
  }

  private bump(dx: number, dy: number): void {
    const now = this.time.now; if (now - this.lastBump < 1800) return;
    const tx = this.from.x + dx, ty = this.from.y + dy;
    const door = GRID.doorOf.get(tx + ',' + ty);
    if (door && !this.state.passes.has(ROOM_BY_ID[door.room].requiredPass)) {
      this.lastBump = now;
      const pass = PASSES[ROOM_BY_ID[door.room].requiredPass];
      app.ui?.toast(`${ROOM_BY_ID[door.room].name} is locked. It needs the ${pass.name}: use the door reader (E) to see how to request it.`, 'warn');
    }
  }

  private updatePlayer(dt: number, time: number): void {
    const walk = walkableFor(this.state.passes);
    const input = this.readDir();
    if ((input.x || input.y) && this.team.you.auto) this.takeOver();
    if ((input.x || input.y) && this.path.length) { this.path = []; this.autoApproach = null; }
    let moving = false;
    if (!this.to) {
      let step: { x: number; y: number } | null = null;
      if (input.x || input.y) {
        const tries: [number, number][] = [[input.x, input.y]];
        if (input.x && input.y) tries.push([input.x, 0], [0, input.y]);      // slide along walls
        for (const [dx, dy] of tries) if ((dx || dy) && this.canStep(this.from, dx, dy, walk)) { step = { x: dx, y: dy }; break; }
        if (!step) this.bump(input.x, input.y);
        this.facing = this.facingFor(input.x || 0, input.y || 0);
      } else if (this.path.length) {
        const nxt = this.path[0];
        const dx = nxt.x - this.from.x, dy = nxt.y - this.from.y;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && this.canStep(this.from, dx, dy, walk)) { step = { x: dx, y: dy }; this.path.shift(); }
        else this.path = [];
      }
      if (step) { this.to = { x: this.from.x + step.x, y: this.from.y + step.y }; this.prog = 0; this.facing = this.facingFor(step.x, step.y); }
    }
    if (this.to) {
      moving = true;
      const len = Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y);
      this.prog += (SPEED * dt) / len;
      if (this.prog >= 1) { this.from = this.to; this.to = null; this.prog = 0; this.pos = { x: this.from.x + 0.5, y: this.from.y + 0.5 }; }
      else this.pos = { x: this.from.x + 0.5 + (this.to.x - this.from.x) * this.prog, y: this.from.y + 0.5 + (this.to.y - this.from.y) * this.prog };
    }
    if (!moving && this.autoApproach && !this.path.length) this.autoApproach = null;
    // pose
    let pose: Pose = moving ? 'walk' : 'idle';
    if (time < this.poseUntil && !moving) pose = this.pose;
    const frames = POSE_FRAMES[pose];
    const idx = Math.floor((time / 1000) * POSE_FPS[pose]) % frames;
    const frame = `eng_${this.facing}_${pose}_${idx}`;
    if (hasFrame(this, 'characters', frame)) { if (this.player.frame.name !== frame) this.player.setFrame(frame); }
    const s = this.S(this.pos.x, this.pos.y);
    this.player.setPosition(s.x, s.y).setDepth(depthOf(this.pos.x, this.pos.y, 3));
    // state
    const room = roomAt(Math.floor(this.pos.x), Math.floor(this.pos.y));
    const interior = GRID.kind[Math.floor(this.pos.y)]?.[Math.floor(this.pos.x)] === 'room' ? room : null;
    if ((room?.id ?? null) !== this.state.player.room) { this.state.player.room = room?.id ?? null; this.runner.onEnterRoom(interior?.id ?? null); this.state.changed(); }
    else if (interior) this.runner.onEnterRoom(interior.id);
    this.state.player.x = this.pos.x; this.state.player.y = this.pos.y;
  }

  private playFx(type: string, target: string): void {
    const reduced = settings.data.reducedMotion;
    const pos = this.targetPos(target); if (!pos) return;
    const t = this.time.now;
    if (type === 'scan') { this.pose = 'scan'; this.poseUntil = t + 1200; sfx.scan(); }
    if (type === 'repair') { this.pose = 'repair'; this.poseUntil = t + 1500; }
    if (type === 'sparkle' || type === 'release') { this.pose = 'success'; this.poseUntil = t + 1200; sfx.good(); }
    if (type === 'alarm') sfx.bad();
    if (type === 'pass') sfx.pass();
    const frameFor: Record<string, string> = { scan: 'fx_scan_ring', sparkle: 'fx_success', release: 'fx_success', repair: 'fx_repair', alarm: 'fx_light_coral', pass: 'fx_light_mint', barrier: 'fx_quarantine_coral' };
    const fx = makeImage(this, 'effects', frameFor[type] ?? 'fx_success', pos.x, pos.y).setDepth(21500);
    if (type === 'barrier') { this.syncBarriers(); fx.destroy(); return; }
    if (reduced) { this.time.delayedCall(700, () => fx.destroy()); return; }
    const s0 = fx.scale;
    fx.setScale(s0 * 0.4).setAlpha(1);
    this.tweens.add({ targets: fx, scale: s0 * (type === 'scan' ? 1.8 : 1.2), alpha: 0, duration: type === 'scan' ? 900 : 1200, onComplete: () => fx.destroy() });
    if (type === 'alarm') this.cameras.main.shake(180, 0.002);
  }

  private syncBarriers(): void {
    const want = new Set(Object.keys(this.state.contained));
    for (const [id, img] of this.barriers) if (!want.has(id)) { img.destroy(); this.barriers.delete(id); }
    for (const id of want) {
      if (this.barriers.has(id)) continue;
      const pos = this.targetPos(id); if (!pos) continue;
      const img = makeImage(this, 'effects', id.startsWith('room:') ? 'fx_quarantine_amber' : 'fx_quarantine_coral', pos.x, pos.y).setDepth(21400);
      if (id.startsWith('room:')) img.setScale(img.scale * 3);
      img.setAlpha(0.9);
      this.barriers.set(id, img);
    }
  }

  // ------------------------------------------------------------------ per-frame sync ----
  private syncVisuals(): void {
    this.syncBarriers();
    this.updateWallBoard();
    // status badges above props
    for (const r of ROOMS) for (const p of r.props) {
      const st = this.state.status[p.id];
      let t = this.statusLabels.get(p.id);
      if (!st) { t?.setVisible(false); continue; }
      if (!t) {
        const s = this.S(p.gx + 0.5, p.gy + 0.5);
        t = this.add.text(s.x, s.y - 74, '', { fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: PALETTE.navy, padding: { x: 4, y: 1 }, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(16000).setResolution(2);
        this.statusLabels.set(p.id, t);
      }
      const map = { suspect: ['⚠ CHECK', PALETTE.amber], bad: ['✕ FAULT', PALETTE.coral], ok: ['✓ OK', PALETTE.mint], fixed: ['✓ FIXED', PALETTE.mint] } as const;
      t.setText(map[st][0]).setBackgroundColor(map[st][1]).setVisible(true);
    }
    this.flow.updateLabels(this.state.routeStates, this.state.selectedTarget);
    this.refreshAccessLabelsOnly();
  }
  private refreshAccessLabelsOnly(): void { this.applyFog(); }

  /** Service Confidence on the Control Room wall: five measures plus the balanced overall score (text and bars, not colour only). */
  private updateWallBoard(): void {
    if (!this.wallBoard) return;
    const m = measuresOf(this.state), o = overallConfidence(m);
    const bar = (v: number) => '\u2588'.repeat(Math.round(v / 10)) + '\u2591'.repeat(10 - Math.round(v / 10));
    const text = `SERVICE CONFIDENCE ${o}% ${confidenceWord(o).toUpperCase()}\n` + MEASURE_KEYS.map((k) => `${MEASURE_LABEL[k].name.slice(0, 11).padEnd(11)} ${bar(m[k])} ${String(m[k]).padStart(3)}`).join('\n');
    if (text !== this.wallSig) { this.wallSig = text; this.wallBoard.setText(text); }
  }

  private syncEntities(time: number): void {
    const reduced = settings.data.reducedMotion;
    const seen = new Set<string>();
    for (const e of Object.values(this.state.entities)) {
      seen.add(e.id);
      let rec = this.entitySprites.get(e.id);
      if (!rec) {
        const frame = e.kind === 'bug' ? 'bug_gremlin' : e.kind === 'ghost' ? 'ghost_receipt' : e.kind === 'malware' ? 'malware_spike' : e.kind === 'wisp' ? 'wisp' : 'corrupt_file';
        const img = makeImage(this, 'effects', frame, 0, 0);
        const label = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: PALETTE.navy, padding: { x: 3, y: 1 }, fontStyle: 'bold' }).setOrigin(0.5, 1).setResolution(2);
        rec = { img, label }; this.entitySprites.set(e.id, rec);
      }
      const { img, label } = rec;
      let gx = e.gx !== undefined ? e.gx + 0.5 : 0, gy = e.gy !== undefined ? e.gy + 0.5 : 0;
      if (e.route) { const rt = ROUTE_BY_ID[e.route]; const pts = routePoints(rt); const p = pointAt(pts, e.p ?? 0); gx = p.x; gy = p.y; }
      const s = this.S(gx, gy);
      const bob = reduced ? 0 : Math.sin(time / 260 + e.id.length) * 3;
      img.setPosition(s.x, s.y + bob).setDepth(depthOf(gx, gy, 4)).setVisible(e.visible);
      if (e.kind === 'bug' && e.mood === 'fixed' && hasFrame(this, 'effects', 'bug_fixed')) img.setFrame('bug_fixed');
      const tag = e.kind === 'bug' ? (e.mood === 'fixed' ? '✓ FIXED BUG' : '⚠ BUG (fixable fault)') : e.kind === 'ghost' ? (e.held ? '▣ REPLAY HELD' : '⚠ REPLAY') : e.kind === 'malware' ? '✕ MALWARE' : '⚠ ISSUE';
      const col = e.kind === 'malware' ? PALETTE.coral : e.mood === 'fixed' || e.held ? PALETTE.mint : PALETTE.amber;
      const sig = `${tag}|${e.label}|${col}`;
      if (this.entityCache.get(e.id) !== sig) { this.entityCache.set(e.id, sig); label.setText(`${tag}\n${e.label}`).setBackgroundColor(col); }
      label.setPosition(s.x, s.y - 52 + bob).setDepth(16000).setVisible(e.visible);
      img.setTint(e.held ? 0xbbbbbb : 0xffffff);
    }
    for (const [id, rec] of this.entitySprites) if (!seen.has(id)) { rec.img.destroy(); rec.label.destroy(); this.entitySprites.delete(id); this.entityCache.delete(id); }
  }

  override update(time: number, delta: number): void {
    if (this.closing || !this.sys.isActive()) return;
    const dt = Math.min(0.05, delta / 1000);
    if (!this.state.paused) {
      const k = this.state.speed;
      this.runner.tick(dt); this.team.update(dt * k);
      this.updatePlayer(this.team.you.auto ? dt * k : dt, time);
    }
    this.syncTeam(time);
    this.syncEntities(time);
    this.drawWater(time);
    const rerouted = new Set(Object.entries(this.state.contained).filter(([, c]) => c.rerouted).map(([k]) => k.replace('route:', '')));
    this.flow.draw(time, this.state.routeStates, this.state.selectedTarget, settings.data.reducedMotion, rerouted);
    this.updatePrompt();
    this.updateHighlight(time);
    this.fadeWalls();
    this.drawGuide(time);
    this.drawCoach(time);
    if (this.state.complete && !this.state.flags._debriefed) { this.state.flags._debriefed = true; this.time.delayedCall(1800, () => app.openDebrief(this.state)); }
  }

  private updatePrompt(): void {
    const target = this.state.paused ? null : this.nearestInteractable();
    this.promptTarget = target;
    if (!target) { this.prompt.setVisible(false); return; }
    const pos = this.targetPos(target), t = describeTarget(target)!;
    if (!pos) { this.prompt.setVisible(false); return; }
    this.prompt.setText(`E · ${t.name}`).setPosition(pos.x, pos.y - (t.kind === 'reader' ? 40 : 96)).setVisible(true);
  }

  private updateHighlight(time: number): void {
    const g = this.highlight; g.clear();
    const id = this.state.selectedTarget; if (!id) return;
    const t = describeTarget(id); if (!t) return;
    const pulse = settings.data.reducedMotion ? 0.8 : 0.55 + 0.35 * Math.sin(time / 220);
    if (t.prop) { const s = this.S(t.prop.gx + 0.5, t.prop.gy + 0.5); this.diamond(g, s.x, s.y, 1.05, C.white, pulse); }
    else if (t.door) { const s = this.S(t.door.readerCell.x + 0.5, t.door.readerCell.y + 0.5); this.diamond(g, s.x, s.y, 0.9, C.white, pulse); }
    else if (t.room) {
      const r = t.room; const a = this.S(r.x0, r.y0), b = this.S(r.x0 + r.w, r.y0), c = this.S(r.x0 + r.w, r.y0 + r.h), d = this.S(r.x0, r.y0 + r.h);
      g.lineStyle(3, C.white, pulse).beginPath().moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).lineTo(d.x, d.y).closePath().strokePath();
    }
  }
  private diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, k: number, col: number, a: number): void {
    const w = (TILE_W / 2) * k, h = (TILE_H / 2) * k;
    g.lineStyle(2.5, col, a).beginPath().moveTo(x, y - h).lineTo(x + w, y).lineTo(x, y + h).lineTo(x - w, y).closePath().strokePath();
  }

  private fadeWalls(): void {
    const px = this.pos.x, py = this.pos.y;
    for (const w of this.walls) {
      const behind = w.gx + w.gy > px + py - 0.1 && Math.hypot(w.gx - px, w.gy - py) < 3.2;
      const dx = w.gx - px, dy = w.gy - py;
      const near = behind && dx >= -0.6 && dy >= -0.6 && (dx < 0.4 || dy < 0.4);
      w.img.setAlpha(near ? 0.4 : 1);
    }
  }

  /** Tutorial-mode beacon: a bouncing arrow and a pulsing ring on the coached target(s). */
  private drawCoach(time: number): void {
    const g = this.coach; g.clear();
    const reduced = settings.data.reducedMotion;
    if (this.waypoint) {
      const w = this.waypoint, s = this.S(w.cell.x + 0.5, w.cell.y + 0.5), k = reduced ? 1 : 1 + 0.15 * Math.sin(time / 200);
      g.lineStyle(3, C.cyan, 0.95).beginPath().moveTo(s.x, s.y - 12 * k).lineTo(s.x + 24 * k, s.y).lineTo(s.x, s.y + 12 * k).lineTo(s.x - 24 * k, s.y).closePath().strokePath();
      g.lineStyle(2, C.cyan, 0.8).lineBetween(s.x, s.y, s.x, s.y - 60).strokeCircle(s.x, s.y - 64, 5);
      const pc = { x: Math.floor(this.pos.x), y: Math.floor(this.pos.y) };
      if (!this.to && !this.path.length) { const near = Math.abs(pc.x - w.cell.x) <= 1 && Math.abs(pc.y - w.cell.y) <= 1; this.waypoint = null; if (near) app.ui?.toast(`Arrived: ${w.label}.`, 'good'); }
    }
    const ids = [...(this.state.tutorial ? this.coachTargets : []), ...(this.time.now < this.flash.until ? this.flash.ids : [])];
    if (!ids.length) return;
    for (const id of ids) {
      const pos = this.targetPos(id); if (!pos) continue;
      const t = describeTarget(id);
      const bob = reduced ? 0 : Math.sin(time / 180) * 5, ring = reduced ? 1 : 1 + 0.12 * Math.sin(time / 220);
      const top = pos.y - (t?.prop ? 78 : t?.door ? 52 : 40) + bob;
      g.fillStyle(0x0b1424, 0.95).fillTriangle(pos.x - 11, top - 20, pos.x + 11, top - 20, pos.x, top + 2);
      g.fillStyle(C.amber, 1).fillTriangle(pos.x - 8, top - 18, pos.x + 8, top - 18, pos.x, top - 2);
      if (t?.room) {
        const r = t.room, a = this.S(r.x0, r.y0), b = this.S(r.x0 + r.w, r.y0), c = this.S(r.x0 + r.w, r.y0 + r.h), d = this.S(r.x0, r.y0 + r.h);
        g.lineStyle(3, C.amber, 0.9).beginPath().moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).lineTo(d.x, d.y).closePath().strokePath();
      } else if (t?.route) {
        g.lineStyle(3, C.amber, 0.9).strokeCircle(pos.x, pos.y, 14 * ring);
      } else {
        const w = (TILE_W / 2) * 1.15 * ring, h = (TILE_H / 2) * 1.15 * ring, y0 = pos.y;
        g.lineStyle(3, C.amber, 0.95).beginPath().moveTo(pos.x, y0 - h).lineTo(pos.x + w, y0).lineTo(pos.x, y0 + h).lineTo(pos.x - w, y0).closePath().strokePath();
      }
    }
  }

  private drawGuide(time: number): void {
    const g = this.guide; g.clear();
    if (time > this.guideUntil || !this.guideCells.length) return;
    const blink = settings.data.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(time / 180);
    for (let i = 0; i < this.guideCells.length; i += 1) {
      const c = this.guideCells[i], s = this.S(c.x + 0.5, c.y + 0.5);
      g.fillStyle(C.amber, 0.85 * blink).fillCircle(s.x, s.y, 3);
    }
  }
}

const TOOLS_KEYS = ['scanner', 'lens', 'quarantine', 'patch', 'token', 'restore', 'recon', 'reroute'] as const;
export type { PropDef, PaletteKey };
export { ATLAS_GROUPS };
