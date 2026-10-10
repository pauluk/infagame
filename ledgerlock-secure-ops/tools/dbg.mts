import { GameState } from '../src/game/systems/GameState';
import { MissionRunner } from '../src/game/systems/MissionRunner';
import { MISSIONS } from '../src/data/missions';
import { ROOM_BY_ID } from '../src/data/map';
import { nearestWalkable, walkableFor } from '../src/game/systems/Grid';
import { TeamController } from '../src/game/systems/Team';
const m = MISSIONS[1];
const s = new GameState(m); const run = new MissionRunner(s); run.start(); s.flags.briefed = true;
const r = ROOM_BY_ID[m.startRoom], walk = walkableFor(s.passes);
const spawn = [0,1,2,3].map((i) => nearestWalkable(walk, r.x0 + 2 + i * 2, r.y0 + 4, 4)!);
console.log('spawn', JSON.stringify(spawn), m.title, m.startRoom);
let me = { x: spawn[0].x + 0.5, y: spawn[0].y + 0.5 };
const body: any = { cell: () => ({ x: Math.floor(me.x), y: Math.floor(me.y) }), pos: () => me, walkTo: (c: any) => { me = { x: c.x + 0.5, y: c.y + 0.5 }; }, idle: () => true, cancel: () => {}, pose: () => {} };
const team = new TeamController(s, run, { team: true, spawn, body, autoDecide: () => true });
const modal: any[] = []; s.on('dialog', (d: any) => modal.push(d));
for (const mem of team.members) team.setAuto(mem.id, true);
for (let t = 0; t < 9600 && !s.complete; t++) {
  run.tick(0.25); team.update(0.25);
  for (const it of team.inbox) if (!it.resolved && it.kind === 'decision') { const sp = it.spec as any; if (sp.type === 'choice') sp.onChoose(sp.options[0].id); else sp.onConfirm(); }
  while (modal.length) { const d = modal.shift(); if (d.type === 'choice') d.onChoose(d.options[0].id); else if (d.type === 'confirm') d.onConfirm(); else if (d.type === 'timeline' && d.onClose) d.onClose(); }
  if (t % 800 === 0) console.log(t / 4, team.members.map((x: any) => `${x.id}:${x.phase}:${x.task?.id ?? ''}@${x.pos.x.toFixed(0)},${x.pos.y.toFixed(0)}`).join(' | '));
}
console.log('complete', s.complete, s.logEntries.slice(-8).map((l: any) => l.text));
