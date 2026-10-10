import { ORIGIN_X, ORIGIN_Y, TILE_H, TILE_W } from '../constants';
import { GRID, ROOM_BY_ID, cellKey, isWalkable } from '../../data/map';
import type { Cell, PassId, RoomId } from '../types';

// screenX = originX + (gridX - gridY) * tileWidth / 2 ; screenY = originY + (gridX + gridY) * tileHeight / 2
export const toScreen = (gx: number, gy: number) => ({ x: ORIGIN_X + ((gx - gy) * TILE_W) / 2, y: ORIGIN_Y + ((gx + gy) * TILE_H) / 2 });
export const toGrid = (sx: number, sy: number) => {
  const a = (sx - ORIGIN_X) / (TILE_W / 2), b = (sy - ORIGIN_Y) / (TILE_H / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
};
/** Depth key: things further down-screen (greater gx+gy) draw in front. */
export const depthOf = (gx: number, gy: number, bias = 0) => (gx + gy) * 10 + bias;

export type Walkable = (x: number, y: number) => boolean;
export const walkableFor = (passes: ReadonlySet<PassId>): Walkable => (x, y) => isWalkable(x, y, passes);

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Breadth-first path, 8-way, no corner cutting. Returns cells after `from`, or null. */
export function findPath(walkable: Walkable, from: Cell, to: Cell, limit = 6000): Cell[] | null {
  const q: Cell[] = [from];
  const prev = new Map<string, Cell | null>([[cellKey(from.x, from.y), null]]);
  let n = 0;
  while (q.length && n++ < limit) {
    const cur = q.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      const out: Cell[] = [];
      for (let p: Cell | null = cur; p; p = prev.get(cellKey(p.x, p.y)) ?? null) out.unshift(p);
      return out.slice(1);
    }
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (prev.has(cellKey(nx, ny)) || !walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cur.x + dx, cur.y) || !walkable(cur.x, cur.y + dy))) continue;
      prev.set(cellKey(nx, ny), cur);
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Nearest walkable cell to a point (spiral search). */
export function nearestWalkable(walkable: Walkable, gx: number, gy: number, maxR = 6): Cell | null {
  const cx = Math.floor(gx), cy = Math.floor(gy);
  for (let r = 0; r <= maxR; r++) {
    let best: Cell | null = null, bd = Infinity;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !walkable(x, y)) continue;
      const d = (x + 0.5 - gx) ** 2 + (y + 0.5 - gy) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Corridor guide to a room: path over corridor cells (open doors count as walkable) from the player's position
 * to the cell just outside the room's nearest reachable door, then inside if the player holds the pass.
 */
export function guideToRoom(from: Cell, room: RoomId, passes: ReadonlySet<PassId>): { path: Cell[]; locked: boolean } | null {
  const r = ROOM_BY_ID[room];
  const walk = walkableFor(passes);
  const targetInside = nearestWalkable(walk, r.x0 + r.w / 2, r.y0 + r.h / 2, 3);
  const start = nearestWalkable(walk, from.x + 0.5, from.y + 0.5, 3) ?? from;
  if (passes.has(r.requiredPass as PassId) && targetInside) {
    const p = findPath(walk, start, targetInside);
    if (p) return { path: p, locked: false };
  }
  // locked: stop in the corridor outside the nearest door of this room
  let best: Cell[] | null = null;
  for (const d of r.doors) {
    const [a, b] = d.cells;
    const out: Cell = d.side === 'n' ? { x: a.x, y: a.y - 1 } : d.side === 's' ? { x: a.x, y: a.y + 1 } : d.side === 'w' ? { x: a.x - 1, y: a.y } : { x: a.x + 1, y: a.y };
    void b;
    const p = findPath(walk, start, out);
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best ? { path: best, locked: true } : null;
}
export { GRID };

/** Reachable cell (by walking) closest to a point: flood fill from `start`, then pick the nearest to (gx, gy). */
export function nearestReachable(walkable: Walkable, start: Cell, gx: number, gy: number, limit = 5000): Cell | null {
  const seen = new Set<string>([cellKey(start.x, start.y)]);
  const q: Cell[] = [start];
  let best: Cell | null = null, bd = Infinity, n = 0;
  while (q.length && n++ < limit) {
    const c = q.shift()!;
    const d = (c.x + 0.5 - gx) ** 2 + (c.y + 0.5 - gy) ** 2;
    if (d < bd) { bd = d; best = c; }
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx, ny = c.y + dy, k = cellKey(nx, ny);
      if (seen.has(k) || !walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(c.x + dx, c.y) || !walkable(c.x, c.y + dy))) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return best;
}
