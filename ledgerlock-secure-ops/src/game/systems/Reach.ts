import { ROOM_BY_ID, roomAt } from '../../data/map';
import { routePoints, routeRooms } from '../../data/routes';
import { describeTarget } from '../../data/targets';
import type { Cell, PassId } from '../types';
import { findPath, nearestReachable, walkableFor } from './Grid';

/** Is a character at (px, py) (grid units) close enough to use `id`? Returns a hint when not. */
export function reachRange(id: string, px: number, py: number): { ok: boolean; hint?: string } {
  const t = describeTarget(id); if (!t) return { ok: false };
  if (t.prop) return Math.hypot(t.prop.gx + 0.5 - px, t.prop.gy + 0.5 - py) <= 2.3 ? { ok: true } : { ok: false, hint: `Walk closer to the ${t.name}.` };
  if (t.door) return Math.hypot(t.door.readerCell.x + 0.5 - px, t.door.readerCell.y + 0.5 - py) <= 3 ? { ok: true } : { ok: false, hint: 'Walk up to the door reader.' };
  if (t.ext) return { ok: true };
  if (t.room) { const here = roomAt(Math.floor(px), Math.floor(py)); return here?.id === t.room.id ? { ok: true } : { ok: false, hint: `Go to ${t.room.name} first.` }; }
  if (t.route) {
    const here = roomAt(Math.floor(px), Math.floor(py))?.id;
    const rooms = routeRooms(t.route);
    if (here && rooms.includes(here)) return { ok: true };
    const pts = routePoints(t.route);
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const tt = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy)));
    }
    return best <= 2.6 ? { ok: true } : { ok: false, hint: `Stand in ${rooms.map((r) => ROOM_BY_ID[r].name).join(', ')} or next to the route.` };
  }
  return { ok: false };
}

/** A cell a character can walk to (with these passes) from which `id` is in range, plus the path there. */
export function standFor(id: string, from: Cell, passes: ReadonlySet<PassId>): { goal: Cell; path: Cell[] } | null {
  const t = describeTarget(id); if (!t) return null;
  if (t.ext) return { goal: from, path: [] };
  const walk = walkableFor(passes);
  const pts: [number, number][] = [];
  if (t.prop) pts.push([t.prop.gx + 0.5, t.prop.gy + 0.5]);
  else if (t.door) pts.push([t.door.readerCell.x + 0.5, t.door.readerCell.y + 0.5]);
  else if (t.room) pts.push([t.room.x0 + t.room.w / 2, t.room.y0 + t.room.h / 2]);
  else if (t.route) {
    for (const r of routeRooms(t.route)) { const rm = ROOM_BY_ID[r]; pts.push([rm.x0 + rm.w / 2, rm.y0 + rm.h / 2]); }
    const rp = routePoints(t.route);
    for (let i = 0; i < rp.length; i++) { pts.push([rp[i][0], rp[i][1]]); if (i) pts.push([(rp[i][0] + rp[i - 1][0]) / 2, (rp[i][1] + rp[i - 1][1]) / 2]); }
  }
  for (const [gx, gy] of pts) {
    const goal = nearestReachable(walk, from, gx, gy);
    if (!goal || !reachRange(id, goal.x + 0.5, goal.y + 0.5).ok) continue;
    if (goal.x === from.x && goal.y === from.y) return { goal, path: [] };
    const path = findPath(walk, from, goal);
    if (path) return { goal, path };
  }
  return null;
}

/** May a character holding `passes` get to the place where `id` can be used? Returns the missing pass id otherwise. */
export function accessFor(id: string, passes: ReadonlySet<PassId>): true | PassId {
  const t = describeTarget(id); if (!t) return true;
  if (t.prop || t.room) { const need = ROOM_BY_ID[(t.prop?.room ?? t.room!.id)].requiredPass; return passes.has(need) ? true : need; }
  // routes can be worked from the corridor beside them, so no room pass is implied
  return true;
}
