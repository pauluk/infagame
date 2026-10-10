// Layout lab: place rooms, route 2-wide corridors between doors, print an ASCII map and corridor lengths.
// Usage: node tools/layout-lab.mjs [--json]   (the chosen layout is then committed as explicit data in src/data/layout.ts)
const W = 64, H = 46;
const R = {};   // id -> {x,y,w,h,code}
const room = (id, x, y, w, h) => (R[id] = { id, x, y, w, h });

// ---- rooms (x0, y0, w, h) including walls ----
room('secure_ops', 26, 20, 13, 11);
room('finance_core', 8, 17, 14, 12);
room('event_stream', 6, 3, 12, 8);
room('fabric_platform', 22, 3, 12, 8);
room('api_gateway', 38, 3, 11, 8);
room('integration_exchange', 52, 8, 10, 9);
room('payment_orchestration', 46, 22, 12, 9);
room('bacs_vault', 54, 35, 9, 8);
room('card_payments', 29, 35, 12, 8);
room('service_payments', 8, 34, 12, 9);
room('debt_recovery', 42, 35, 10, 8);
room('agency_handoff', 54, 22, 0, 0);
delete R.agency_handoff;
room('agency_handoff', 56, 20, 7, 8);
room('payroll_pensions', 16, 31, 8, 7);
room('audit_gallery', 1, 3, 4, 8);

// ---- links: [a, sideA, b, sideB, label]
const LINKS = [
  ['secure_ops', 'w', 'finance_core', 'e', 'atrium-fc'],
  ['secure_ops', 'w', 'payroll_pensions', 'n', 'atrium-pp'],
  ['finance_core', 's', 'service_payments', 'n', 'fc-sp'],
  ['service_payments', 'e', 'payroll_pensions', 'w', 'sp-pp'],
  ['service_payments', 'e', 'payment_orchestration', 'w', 'sp-po'],
  ['payment_orchestration', 'n', 'integration_exchange', 's', 'po-ix'],
  ['integration_exchange', 'w', 'api_gateway', 'e', 'ix-api'],
  ['api_gateway', 's', 'finance_core', 'n', 'api-fc'],
  ['finance_core', 'n', 'event_stream', 's', 'fc-es'],
  ['event_stream', 'e', 'fabric_platform', 'w', 'es-fab'],
  ['fabric_platform', 's', 'finance_core', 'n', 'fab-fc'],
  ['event_stream', 'e', 'api_gateway', 'w', 'es-api'],
  ['finance_core', 's', 'card_payments', 'n', 'fc-card'],
  ['card_payments', 'e', 'payment_orchestration', 's', 'card-po'],
  ['payment_orchestration', 's', 'bacs_vault', 'n', 'po-bacs'],
  ['bacs_vault', 'n', 'integration_exchange', 's', 'bacs-ix'],
  ['finance_core', 's', 'debt_recovery', 'n', 'fc-debt'],
  ['debt_recovery', 'e', 'agency_handoff', 's', 'debt-agency'],
  ['agency_handoff', 'n', 'integration_exchange', 's', 'agency-ix'],
];
const side = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

const grid = Array.from({ length: H }, () => Array(W).fill('.'));
const owner = Array.from({ length: H }, () => Array(W).fill(null));
const ids = Object.keys(R); const sym = (i) => String.fromCharCode(65 + i);
ids.forEach((id, i) => { const r = R[id]; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { grid[y][x] = (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1) ? '#' : sym(i).toLowerCase(); owner[y][x] = id; } });
// overlap + bounds check
for (const a of ids) for (const b of ids) if (a < b) { const p = R[a], q = R[b]; if (p.x < q.x + q.w + 1 && q.x < p.x + p.w + 1 && p.y < q.y + q.h + 1 && q.y < p.y + p.h + 1) console.log('TOO CLOSE / OVERLAP:', a, b); }
for (const id of ids) { const r = R[id]; if (r.x < 1 || r.y < 1 || r.x + r.w > W - 1 || r.y + r.h > H - 1) console.log('OUT OF WORLD:', id); }

// door cell choice: pick the 2-cell door position on the given wall nearest to the other room's centre
function door(a, s, other) {
  const r = R[a], o = R[other], cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if (s === 'n' || s === 's') { const y = s === 'n' ? r.y : r.y + r.h - 1; const lo = r.x + 1, hi = r.x + r.w - 3; let x = Math.round(cx - 1); x = Math.max(lo, Math.min(hi, x)); return { cells: [[x, y], [x + 1, y]], out: [[x, y + side[s][1]], [x + 1, y + side[s][1]]], s }; }
  const x = s === 'w' ? r.x : r.x + r.w - 1; const lo = r.y + 1, hi = r.y + r.h - 3; let y = Math.round(cy - 1); y = Math.max(lo, Math.min(hi, y)); return { cells: [[x, y], [x, y + 1]], out: [[x + side[s][0], y], [x + side[s][0], y + 1]], s };
}
const blocked = (x, y) => x < 0 || y < 0 || x >= W || y >= H || owner[y][x];
// route a 2-wide corridor: BFS on the centre-line of the pair (use the first cell of each door-out pair), width 2 = line + neighbour
function route(da, db) {
  const [sx, sy] = da.out[0], [tx, ty] = db.out[0];
  const horizA = da.s === 'e' || da.s === 'w';
  const ok = (x, y, h) => { for (let k = 0; k < 2; k++) { const xx = x + (h ? 0 : k), yy = y + (h ? k : 0); if (blocked(xx, yy)) return false; } return true; };
  // BFS over cell positions for a 2x2-wide "brush": require the 2x2 block at (x,y) free (corridor width 2)
  const free2 = (x, y) => !blocked(x, y) && !blocked(x + 1, y) && !blocked(x, y + 1) && !blocked(x + 1, y + 1);
  const key = (x, y) => y * 1000 + x, prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]];
  let found = false;
  while (q.length) {
    const [x, y] = q.shift(); if (x === tx && y === ty) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 1 || ny < 1 || nx > W - 3 || ny > H - 3) continue; if (prev.has(key(nx, ny))) continue; if (!(free2(nx, ny) || (nx === tx && ny === ty) || (nx === sx && ny === sy))) continue; prev.set(key(nx, ny), [x, y]); q.push([nx, ny]); }
  }
  if (!found) return null; const path = []; for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) path.unshift(c); void ok; void horizA; return path;
}
const out = [];
for (const [a, sa, b, sb, label] of LINKS) {
  const da = door(a, sa, b), db = door(b, sb, a), p = route(da, db);
  if (!p) { console.log('NO ROUTE', label); continue; }
  out.push({ label, a, sa, b, sb, da, db, path: p });
  for (const [x, y] of p) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const xx = x + dx, yy = y + dy; if (!owner[yy]?.[xx] && grid[yy][xx] === '.') grid[yy][xx] = '+'; }
  for (const d of [da, db]) for (const [x, y] of d.cells) grid[y][x] = 'D';
}
console.log(grid.map((r) => r.join('')).join('\n'));
console.log('\n' + ids.map((id, i) => `${sym(i).toLowerCase()}=${id}`).join('  '));
console.log('\ncorridor lengths:'); for (const o of out) console.log(' ', o.label.padEnd(12), o.path.length);
const long = out.filter((o) => o.path.length > 16); console.log('long (>16):', long.map((o) => o.label + ':' + o.path.length).join(', ') || 'none');
console.log('total corridor cells', out.reduce((n, o) => n + o.path.length, 0));
if (process.argv.includes('--json')) console.log(JSON.stringify({ rooms: R, links: out.map(({ label, a, sa, b, sb, da, db, path }) => ({ label, a, sa, b, sb, da: da.cells, db: db.cells, path })) }));
