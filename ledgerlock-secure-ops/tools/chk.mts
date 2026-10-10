import { GRID, ROOMS, ROOM_BY_ID, LINKS, isWalkable, DOORS, EXTERNALS, ENTRANCE, cellKey } from '/home/user/infagame/ledgerlock-secure-ops/src/data/map';
import { PASSES } from '/home/user/infagame/ledgerlock-secure-ops/src/data/passes';
const all = new Set(Object.keys(PASSES));
// flood fill from atrium centre with all passes
const a = ROOM_BY_ID.secure_ops; const start = [a.x0 + 6, a.y0 + 5];
const seen = new Set<string>([cellKey(start[0], start[1])]); const q = [start];
while (q.length) { const [x, y] = q.shift()!; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, ny = y+dy, k = cellKey(nx, ny); if (seen.has(k) || !isWalkable(nx, ny, all)) continue; seen.add(k); q.push([nx, ny]); } }
const reached = new Set<string>(); for (const r of ROOMS) { for (let y = r.y0+1; y < r.y0+r.h-1; y++) for (let x = r.x0+1; x < r.x0+r.w-1; x++) if (seen.has(cellKey(x,y))) reached.add(r.id); }
console.log('rooms reached', reached.size, '/', ROOMS.length, ROOMS.filter(r => !reached.has(r.id)).map(r => r.id));
// props on non-interior cells / overlapping
for (const r of ROOMS) for (const p of r.props) { const k = GRID.kind[p.gy][p.gx]; if (k !== 'room') console.log('PROP OFF FLOOR', p.id, k); }
// props unreachable from the atrium
for (const r of ROOMS) for (const p of r.props) if (p.interactive) { let ok = false; for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) if (seen.has(cellKey(p.gx+dx,p.gy+dy))) ok = true; if (!ok) console.log('PROP UNREACHABLE', p.id); }
console.log('entrance', ENTRANCE, GRID.kind[ENTRANCE.y][ENTRANCE.x], GRID.kind[ENTRANCE.y][ENTRANCE.x+2]);
for (const e of EXTERNALS) { let bad = false; for (let y = e.y; y < e.y+e.h; y++) for (let x = e.x; x < e.x+e.w; x++) if (GRID.kind[y]?.[x] !== 'void') bad = true; console.log('external', e.id, e.x, e.y, bad ? 'OVERLAPS' : 'ok'); }
// door cell sanity: door.link corridor outside cell walkable
for (const d of DOORS) { const out = d.side === 'n' ? [0,-1] : d.side === 's' ? [0,1] : d.side === 'w' ? [-1,0] : [1,0]; for (const c of d.cells) { const k = GRID.kind[c.y + out[1]]?.[c.x + out[0]]; const inside = GRID.kind[c.y - out[1]]?.[c.x - out[0]]; if (k !== 'corridor' || inside !== 'room') console.log('DOOR ODD', d.id, k, inside); } }
