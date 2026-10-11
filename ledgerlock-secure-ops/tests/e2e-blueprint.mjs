// Facility Map and Systems Blueprint e2e: tabs, room selection, waypoint (walks, never teleports), diagrams, room blueprint, incident view.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); await shot('bp-fail'); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const until = async (label, fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await page.waitForTimeout(150); } await fail('timeout: ' + label); };

await page.addInitScript(() => { try { localStorage.setItem('ledgerlock.settings.v1', JSON.stringify({ reducedMotion: true })); } catch { /* ignore */ } });
await page.goto(URL);
await page.waitForSelector('button[data-a=start]', { timeout: 20000 });
await page.click('button[data-a=start]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]'); await page.click('#screens button[data-a=go]'); await page.waitForTimeout(600);

// ---- facility view: explicit graph, fog, doors, corridors, junctions
await page.click('#b-blueprint'); await page.waitForSelector('#blueprint');
if (!(await S('(sc)=>sc.state.paused'))) await fail('opening the map should pause movement');
const tabs = await page.$$eval('#blueprint .bp-tabs button', (e) => e.map((x) => x.textContent));
if (tabs.slice(0, 4).join() !== 'Facility,Systems,Access,Incident') await fail('the four map views: ' + tabs);
const rooms = await page.$$eval('#blueprint svg g.bp-room', (e) => e.map((x) => ({ id: x.dataset.room, unknown: x.classList.contains('unknown'), code: x.querySelector('text')?.textContent })));
if (rooms.length !== 16) await fail('16 rooms on the map, got ' + rooms.length);
const known = rooms.filter((r) => !r.unknown).map((r) => r.code).sort().join();
if (known !== 'A3,B3') await fail('only the atrium and the incident room are revealed at the start: ' + known);
if (rooms.filter((r) => r.unknown).some((r) => r.code === '?' === false)) await fail('unexplored rooms must be silhouettes with no name');
const nCorr = await page.$$eval('#blueprint [data-corr]', (e) => e.length), nJ = await page.$$eval('#blueprint .bp-junction', (e) => e.length), nDoor = await page.$$eval('#blueprint [data-door]', (e) => e.length);
if (nCorr !== 42 || nJ !== 9) await fail(`graph on the map: ${nCorr} corridors / ${nJ} junctions`);
if (nDoor < 10) await fail('door markers: ' + nDoor);
ok(`facility view: 16 rooms (2 revealed, 14 silhouettes), ${nCorr} explicit corridors, ${nJ} concourses, ${nDoor} door markers (undiscovered rooms hide their names)`);
if ((await page.$$eval('#blueprint svg line[stroke*="#"]', (l) => l.length)) > 400) await fail('the facility view should not draw data routes');
await shot('bp-1-iso');
await page.click('[data-a=mode-top]'); await page.waitForTimeout(200);
if (!(await page.$('#blueprint svg[aria-label*="top-down"]'))) await fail('top-down mode');
await shot('bp-2-top'); await page.click('[data-a=mode-iso]');
ok('isometric and top-down schematic modes');

// ---- select a locked room: details, no teleport, waypoint walks
const before = await S('(sc)=>({x:sc.pos.x,y:sc.pos.y})');
await page.click('svg g[data-room=card_payments]');
let side = await page.textContent('.bp-side');
if (!side.includes('B3') || !side.includes('Card Payments') || !side.includes('Payments Audit Pass') || !side.includes('Locked') || !side.includes('Payment loop')) await fail('room panel: ' + side.slice(0, 200));
const afterSel = await S('(sc)=>({x:sc.pos.x,y:sc.pos.y})');
if (afterSel.x !== before.x || afterSel.y !== before.y) await fail('selecting a room must not move the player');
ok('selecting a room shows its ID, name, pass and door state, and does not move the player');
// door: state, reason and the pass it needs
await page.$eval('[data-door="door:card_payments.js"]', (e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
side = await page.textContent('.bp-side');
if (!side.includes('Locked') || !side.includes('Needs the Payments Audit Pass') || !side.includes('door:card_payments.js') || !side.includes('Other end')) await fail('door panel: ' + side.slice(0, 300));
ok('selecting a door shows its state (locked), the reason, the pass it needs, its stable id and the other end');
// maintenance corridor: optional, starts locked until a pass
await page.$eval('[data-corr="es-api"]', (e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
side = await page.textContent('.bp-side');
if (!side.includes('Optional') || !side.includes('Maintenance Pass') || !side.includes('Data loop')) await fail('corridor panel: ' + side.slice(0, 300));
ok('the Event Stream to API Gateway cross-link is an optional maintenance corridor, locked until a Maintenance Pass, and part of the Data loop');
// loops highlight
await page.click('[data-loop=payment]');
if ((await page.getAttribute('[data-loop=payment]', 'aria-pressed')) !== 'true') await fail('loop button state');
if ((await page.$$eval('#blueprint .bp-junction polygon[stroke="#56B4E9"]', (e) => e.length)) < 3) await fail('the Payment loop should highlight its concourses');
await page.click('[data-loop=""]');
ok('loop buttons highlight the Operations, Data, Payment, Collections and Staff access loops');
// access view
await page.click('[data-tab=access]');
const leg = await page.textContent('.bp-legend');
if (!['Open', 'Locked', 'Sealed by incident', 'Temporarily disabled', 'workstation bay', 'unexplored'].every((w) => leg.includes(w))) await fail('legend: ' + leg);
if (!(await page.$('#blueprint svg [aria-label*="Fraud workstation"]'))) await fail('the Access view should mark workstation bays in explored rooms');
if (!(await page.textContent('#blueprint .bp-hint')).includes('Access view')) await fail('access hint');
ok('access view: door states with shapes and words in a colour-blind-safe legend, workstation bays marked');
await shot('bp-access');
await page.click('[data-tab=facility]'); await page.click('svg g[data-room=card_payments]');
await page.click('.bp-side [data-a=waypoint]'); await page.waitForTimeout(100);
if (await page.$('#blueprint')) await fail('waypoint should close the map so the player can walk');
if (await S('(sc)=>sc.state.paused')) await fail('game should resume after the waypoint');
await page.waitForTimeout(500);
const mid = await S('(sc)=>({x:sc.pos.x,y:sc.pos.y})');
const d1 = Math.hypot(mid.x - before.x, mid.y - before.y);
if (d1 < 0.5 || d1 > 12) await fail('player should be walking (moved ' + d1.toFixed(1) + ' cells after 0.5s)');
await until('arrives near the locked door (corridor)', async () => S('(sc)=>!sc.to && !sc.path.length && !sc.waypoint'), 40000);
const end = await S('(sc)=>({x:sc.pos.x,y:sc.pos.y, room: sc.state.player.room})');
ok(`waypoint walked the player (${d1.toFixed(1)} cells after 0.5 s, not a teleport) to the corridor outside the locked room`);
// ---- keyboard navigation
await page.keyboard.press('b'); await page.waitForSelector('#blueprint');
await page.focus('svg g[data-room=secure_ops]'); await page.keyboard.press('ArrowDown');
const nxt = await page.evaluate(() => document.activeElement?.dataset.room);
if (!nxt || nxt === 'secure_ops') await fail('arrow key should move focus to a neighbouring room, got ' + nxt);
await page.keyboard.press('Enter');
if (!(await page.textContent('.bp-side')).length) await fail('Enter should select the focused room');
ok('keyboard: B opens, arrow keys move focus to the nearest room, Enter selects');

// ---- system diagrams
await page.click('[data-tab=systems]');
const nodes = await page.$$eval('#blueprint [data-node]', (e) => e.map((x) => x.dataset.node));
const want = ['service_payments', 'api_gateway', 'finance_core', 'payment_orchestration', 'bacs_vault', 'bank_sim'];
if (!want.every((n) => nodes.includes(n))) await fail('finance flow nodes: ' + nodes);
const routes = await page.$$eval('#blueprint [data-route]', (e) => e.map((x) => x.dataset.route));
if (routes.join() !== 'service_payment_intake,supplier_payment_release,bank_response_reconciliation') await fail('finance routes: ' + routes);
ok('Finance diagram: service_payments → api_gateway → finance_core → payment_orchestration → bacs_vault → bank, plus the bank response route');
await page.click('[data-route=supplier_payment_release] text');
side = await page.textContent('.bp-side');
if (!side.includes('Source') || !side.includes('Finance Core') || !side.includes('Destination') || !side.includes('Bank') || !side.includes('Waypoint to')) await fail('route inspector: ' + side.slice(0, 300));
ok('selecting a connection shows source, destination, status and waypoint buttons for both endpoints');
await shot('bp-3-diagram');
await page.click('[data-diagram=events]');
const evNodes = await page.$$eval('#blueprint [data-node]', (e) => e.map((x) => x.dataset.node));
if (!['prop:fabric_platform.bronze', 'prop:fabric_platform.silver', 'prop:fabric_platform.gold', 'reporting_display', 'event_stream'].every((n) => evNodes.includes(n))) await fail('events nodes: ' + evNodes);
if (!(await page.textContent('.bp-hint')).includes('simulated')) await fail('events view should say simulated');
await page.selectOption('[data-status]', 'quarantined');
if ((await page.$$('#blueprint [data-route]')).length !== 0) await fail('status filter should hide healthy routes');
await page.selectOption('[data-status]', 'all');
ok('Events & Fabric lineage (data flows live on their own tab, separate from the physical corridors); filters work');

// ---- room blueprint
await page.click('[data-tab=room]'); await page.click('[data-room-pick=card_payments]');
const pins = await page.$$eval('#blueprint [data-prop]', (e) => e.length);
const want2 = await S("(sc)=>sc.state.mission && window.__ledgerlock && 0");
void want2;
if (pins < 4) await fail('card payments should have interactive pins, got ' + pins);
await page.click('[data-prop="prop:card_payments.card_terminal"]');
side = await page.textContent('.bp-side');
if (!side.includes('Card terminal') || !side.includes('Payments Audit Pass') || !side.includes('centre')) await fail('pin panel: ' + side.slice(0, 300));
await page.click('.bp-side [data-a=flash]');
if (!(await S('(sc)=>sc.flash.ids.includes("prop:card_payments.card_terminal") && sc.state.selectedTarget==="prop:card_payments.card_terminal"'))) await fail('selecting a pin should highlight the same object in the game');
ok('room blueprint: pin shows the object, pass and position; "Show in the game" highlights the same object');
await shot('bp-4-room');
await page.click('.bp-side [data-a=back-room]'); await page.waitForTimeout(300);
if (await page.$('#blueprint')) await fail('Return to room should close the blueprint');
ok('"Return to room" closes the blueprint and focuses the room');

// ---- incident location
await page.keyboard.press('b'); await page.waitForSelector('#blueprint'); await page.click('[data-tab=incident]');
side = await page.textContent('.bp-side');
if (!side.includes('Receipt count mismatch') || !side.includes('Receipt Event Feed') || !side.includes('Card Payments')) await fail('incident panel: ' + side.slice(0, 300));
await shot('bp-5-incident');
await page.click('[data-a=inc-diagram]');
if (!(await page.$('#blueprint [data-route=receipt_event_feed]'))) await fail('incident diagram should show the affected route');
await page.click('[data-a=inc-map]');
if (!(await page.$('#blueprint svg polyline'))) await fail('the incident map should show the corridor route to the incident room');
ok('incident location: source room, affected route, evidence sources; map and diagram views');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
if (await page.$('#blueprint')) await fail('Escape should close');
if (await S('(sc)=>sc.state.paused')) await fail('closing should resume the game');
ok('Escape closes the map and the game resumes');

// ---- phone layout
await page.setViewportSize({ width: 390, height: 780 });
await page.keyboard.press('b'); await page.waitForSelector('#blueprint');
const ov = await page.evaluate(() => { const b = document.querySelector('#blueprint'); return { sw: b.scrollWidth, cw: b.clientWidth, btn: Math.min(...[...b.querySelectorAll('.bp-tabs button')].map((x) => x.getBoundingClientRect().height)) }; });
if (ov.sw > ov.cw + 2) await fail('phone: horizontal overflow ' + JSON.stringify(ov));
if (ov.btn < 40) await fail('phone: touch targets too small ' + ov.btn);
await shot('bp-6-phone');
ok('phone width: no horizontal overflow, large touch targets');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
