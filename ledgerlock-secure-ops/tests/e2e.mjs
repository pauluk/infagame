// End-to-end playthrough of "The Duplicate Ghost" in a real browser (Playwright + Chromium).
//   npm run build && npm run preview &   then:   node tests/e2e.mjs [http://localhost:4173/] [screenshots-dir]
// Movement uses the same click-to-move path as the mouse; tools are selected with the number keys and used with E.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('[ledgerlock]'))) errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
const fail = async (msg) => { console.error('FAIL:', msg); if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail.png` }); console.error(errors.join('\n')); await browser.close(); process.exit(1); };
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };

const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const flag = (k) => S('(sc,a)=>!!sc.state.flags[a]', k);
const dialog = async (sel, timeout = 4000) => page.waitForSelector('#dialog ' + sel, { timeout });
const clickDialog = async (sel) => { await dialog(sel); await page.click('#dialog ' + sel); await page.waitForTimeout(150); };
const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(120); };

async function walkNear(target, maxMs = 25000) {
  await S(`(sc,t)=>{ const m = window.__ledgerlock; const d = (id)=>{ return null }; return 0 }`, target);
  await S(`(sc,t)=>{ const info = sc.__targetCell(t); sc.walkTo(info); }`, target);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const arrived = await S(`(sc,t)=>sc.__near(t)`, target);
    if (arrived) return;
    await page.waitForTimeout(150);
  }
  await fail('could not walk near ' + target);
}

await page.goto(URL);
await page.waitForSelector('button[data-a=start]', { timeout: 20000 });
await page.waitForTimeout(1200);
await shot('01-title');
await page.click('button[data-a=start]');
await page.waitForSelector('#screens button.primary', { timeout: 10000 });
await page.click('#screens button.primary');          // how to play (first run) or briefing
if (await page.$('#screens button[data-a=go]') === null) await page.waitForSelector('#screens button[data-a=go]', { timeout: 5000 }).catch(() => {});
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]');
await shot('02-briefing');
await page.click('#screens button[data-a=go]');
await page.waitForTimeout(600);
ok('mission started from title');

// test hooks exposed only to this script
await page.evaluate(() => {
  const sc = window.__ledgerlock.game.scene.getScene('Facility');
  sc.__targetCell = (id) => { const p = sc.targetPos(id); const g = sc.toGridPublic(p.x, p.y); return { x: Math.floor(g.gx), y: Math.floor(g.gy) }; };
  sc.__near = (id) => sc.inRange(id).ok && !sc.to && !sc.path.length;
});

// 1. incident wall
await walkNear('prop:secure_ops.incident_wall');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.incident_wall');
await key('e'); await clickDialog('button[data-a=ok]');
if (!(await flag('briefed'))) await fail('wall did not brief');
ok('read incident wall');

// locked door check: card_payments door must not be enterable yet
const locked = await S(`(sc)=>{ const r = window.__ledgerlock; return !sc.state.passes.has('payments_audit_pass'); }`);
if (!locked) await fail('payments pass should not be held yet');

// 2. access desk -> request payments pass (also test a denied request first)
await walkNear('prop:secure_ops.access_desk');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.access_desk');
await key('e'); await dialog('table.t');
await page.click('#dialog button[data-req=ledger_read_pass]');
await page.waitForTimeout(200);
if ((await S('(sc)=>sc.state.passes.has("ledger_read_pass")'))) await fail('ledger pass should be denied at this stage');
ok('premature pass request denied with hint');
await page.click('#dialog button[data-req=payments_audit_pass]');
await page.waitForTimeout(200);
if (!(await S('(sc)=>sc.state.passes.has("payments_audit_pass")'))) await fail('payments pass not granted');
await page.click('#dialog button[data-a=ok]');
ok('Payments Audit Pass granted');

// 3. walk to card payments through corridors
await S('(sc)=>sc.walkTo({x: 20 + 5, y: 28 + 4})');   // inside B3
for (let i = 0; i < 160 && !(await flag('visited_card_payments')); i++) await page.waitForTimeout(150);
if (!(await flag('visited_card_payments'))) await fail('did not reach card payments');
ok('walked to Card Payments through corridors');
await shot('03-card-room');

// 4. scan card terminal
await walkNear('prop:card_payments.card_terminal');
await key('1');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:card_payments.card_terminal');
await key('e');
if (!(await flag('scannedTerminal'))) await fail('terminal scan failed');
ok('scanner revealed duplicate receipt');
// 5. receipt log evidence
await walkNear('prop:card_payments.receipt_log');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:card_payments.receipt_log');
await key('e'); await clickDialog('button[data-a=ok]');
if (!(await flag('receiptEvidence'))) await fail('receipt evidence');
ok('masked receipt retrieved');
// 6. lens on route
await key('2');
await S('(sc,t)=>sc.selectTarget(t)', 'route:receipt_event_feed');
await key('e'); await clickDialog('button[data-a=ok]');       // timeline continue
await dialog('.options button[data-o=malware]');
await page.click('#dialog button[data-o=malware]');            // wrong diagnosis first: gentle feedback
await dialog('.options button[data-o=bug]');
await page.click('#dialog button[data-o=bug]');
await page.waitForTimeout(200);
if (!(await flag('diagnosed'))) await fail('diagnosis');
ok('lens + diagnosis (wrong answer retried)');
await shot('04-route');

// 7. event trace pass at the card room reader, then event stream
const readerFor = (room, side) => `reader:door:${room}.${side}`;
await walkNear(readerFor('event_stream', 's'));
await S('(sc,t)=>sc.selectTarget(t)', readerFor('event_stream', 's'));
await key('e'); await dialog('table.t');
await page.click('#dialog button[data-req=event_trace_pass]'); await page.waitForTimeout(200);
await page.click('#dialog button[data-a=ok]');
if (!(await S('(sc)=>sc.state.passes.has("event_trace_pass")'))) await fail('event trace pass');
ok('Event Trace Pass granted at door reader');
await S('(sc)=>sc.walkTo({x: 20 + 5, y: 8 + 4})');
for (let i = 0; i < 200 && !(await flag('visited_event_stream')); i++) await page.waitForTimeout(150);
if (!(await flag('visited_event_stream'))) await fail('did not reach event stream');
ok('walked to Event Stream Hall');
await walkNear('prop:event_stream.replay_console');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:event_stream.replay_console');
await key('e'); await clickDialog('button[data-a=ok]');
if (!(await flag('traceEvidence'))) await fail('trace evidence');
ok('replay trace retrieved');
// 8. ledger pass at the event stream south door reader
await walkNear(readerFor('finance_core', 'n'));
await S('(sc,t)=>sc.selectTarget(t)', readerFor('finance_core', 'n'));
await key('e'); await dialog('table.t');
await page.click('#dialog button[data-req=ledger_read_pass]'); await page.waitForTimeout(200);
await page.click('#dialog button[data-a=ok]');
if (!(await S('(sc)=>sc.state.passes.has("ledger_read_pass")'))) await fail('ledger pass');
await S('(sc)=>sc.walkTo({x: 20 + 5, y: 18 + 4})');
for (let i = 0; i < 200 && !(await flag('visited_finance_core')); i++) await page.waitForTimeout(150);
await walkNear('prop:finance_core.gl');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:finance_core.gl');
await key('e'); await clickDialog('button[data-a=ok]');
if (!(await flag('ledgerEvidence'))) await fail('ledger evidence');
ok('masked ledger data checked in Finance Core');
await shot('05-finance');

// 9. contain only the replay path (preview dialog shown first)
await key('3');
await S('(sc,t)=>sc.selectTarget(t)', 'route:receipt_event_feed');
await key('e'); await dialog('.impact');
await shot('06-impact-preview');
await page.click('#dialog button.primary'); await page.waitForTimeout(200);
const states = await S('(sc)=>sc.state.routeStates');
if (states.receipt_event_feed !== 'quarantined') await fail('feed not quarantined: ' + JSON.stringify(states));
for (const [k, v] of Object.entries(states)) if (k !== 'receipt_event_feed' && v !== 'healthy' && v !== 'suspicious') await fail('unrelated route affected: ' + k + '=' + v);
ok('replay path quarantined; unrelated routes unaffected');
await key('8'); await key('e'); await clickDialog('button.primary'); await page.waitForTimeout(150);
if ((await S('(sc)=>sc.state.routeStates.receipt_event_feed')) !== 'rerouted') await fail('reroute');
ok('valid receipts rerouted via Card Receipt route');
await shot('07-rerouted');

// 10. patch in card payments
await S('(sc)=>sc.walkTo({x: 20 + 5, y: 28 + 4})');
for (let i = 0; i < 200 && (await S('(sc)=>sc.state.player.room')) !== 'card_payments'; i++) await page.waitForTimeout(150);
await walkNear('prop:card_payments.notifier');
await key('4'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:card_payments.notifier'); await key('e');
if (!(await flag('patched'))) await fail('patch');
ok('patched Settlement Notifier');
// 11. restore buffer
await S('(sc)=>sc.walkTo({x: 20 + 5, y: 8 + 4})');
for (let i = 0; i < 220 && (await S('(sc)=>sc.state.player.room')) !== 'event_stream'; i++) await page.waitForTimeout(150);
await walkNear('prop:event_stream.replay_buffer');
await key('6'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:event_stream.replay_buffer'); await key('e');
await clickDialog('button.primary'); await page.waitForTimeout(150);
if (!(await flag('purged'))) await fail('restore');
ok('replay buffer restored to clean checkpoint');
// 12. reconcile
await S('(sc)=>sc.walkTo({x: 20 + 5, y: 18 + 4})');
for (let i = 0; i < 220 && (await S('(sc)=>sc.state.player.room')) !== 'finance_core'; i++) await page.waitForTimeout(150);
await walkNear('prop:finance_core.ar');
await key('7'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:finance_core.ar'); await key('e');
await dialog('.mcard');
await shot('08-reconcile');
await clickDialog('button[data-a=ok]');
if (!(await flag('reconciled'))) await fail('reconcile');
ok('reconciliation: before/after shown, duplicate resolved');
// 13. release + verify
await key('3'); await S('(sc,t)=>sc.selectTarget(t)', 'route:receipt_event_feed'); await key('e'); await clickDialog('button.primary');
if (!(await flag('released'))) await fail('release');
await key('1'); await key('e');
if (!(await flag('flowVerified'))) await fail('flow verify');
ok('containment released; feed verified (valid receipts flowing, no duplicates)');
// 14. fabric pass + verify
await walkNear(readerFor('fabric_platform', 's'));
await S('(sc,t)=>sc.selectTarget(t)', readerFor('fabric_platform', 's'));
await key('e'); await dialog('table.t');
await page.click('#dialog button[data-req=fabric_observer_pass]'); await page.waitForTimeout(200);
await page.click('#dialog button[data-a=ok]');
if (!(await S('(sc)=>sc.state.passes.has("fabric_observer_pass")'))) await fail('fabric pass');
await S('(sc)=>sc.walkTo({x: 32 + 5, y: 8 + 4})');
for (let i = 0; i < 260 && (await S('(sc)=>sc.state.player.room')) !== 'fabric_platform'; i++) await page.waitForTimeout(150);
await walkNear('prop:fabric_platform.pipeline_display');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:fabric_platform.pipeline_display'); await key('e');
await page.waitForTimeout(300);
if (!(await flag('fabricVerified'))) await fail('fabric verify');
await shot('09-fabric');
ok('verified in Fabric room (demo data badge visible)');
const badge = await page.$('#panelmodal .badge-demo'); if (!badge) await fail('Demo data badge missing');
await page.click('#panelmodal button[data-a=close]');
// 15. back to secure ops, file report
await S('(sc)=>sc.walkTo({x: 8 + 5, y: 28 + 4})');
for (let i = 0; i < 300 && (await S('(sc)=>sc.state.player.room')) !== 'secure_ops'; i++) await page.waitForTimeout(150);
await walkNear('prop:secure_ops.evidence_board');
await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.evidence_board'); await key('e');
await dialog('.path'); await shot('10-evidence-board');
await page.click('#dialog button[data-a=file]');
await page.waitForSelector('#screens .score', { timeout: 8000 });
await shot('11-debrief');
const score = await page.textContent('#screens .score');
ok('debrief shown, score ' + score);
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error('Console problems:\n' + bad.join('\n')); await browser.close(); process.exit(2); }
ok('no browser console errors or placeholder-art warnings');
await browser.close();
