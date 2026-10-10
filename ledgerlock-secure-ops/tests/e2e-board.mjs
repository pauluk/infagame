// Incident Board e2e: Kanban (drag, Move to..., keyboard), prerequisites, and the four puzzle types changing the real game.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); await shot('board-fail'); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const txt = (sel) => page.textContent(sel);
const R = async (code) => { await S(code); await closeDialogs(); };
const closeDialogs = async () => { for (let i = 0; i < 6; i++) { await page.waitForTimeout(120); const b = await page.$('#dialog [data-a=ok]'); if (!b) break; await b.click(); } };
const drag = async (from, to) => {
  await page.locator(from).first().scrollIntoViewIfNeeded(); await page.locator(to).first().scrollIntoViewIfNeeded(); await page.locator(from).first().scrollIntoViewIfNeeded();
  const a = await page.locator(from).first().boundingBox(), b = await page.locator(to).first().boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 14, a.y + a.height / 2 + 14, { steps: 4 }); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(150);
};

await page.addInitScript(() => { try { localStorage.setItem('ledgerlock.settings.v1', JSON.stringify({ reducedMotion: true })); } catch { /* ignore */ } });
await page.goto(URL);
await page.waitForSelector('button[data-a=start]', { timeout: 20000 });
await page.click('button[data-a=start]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]'); await page.click('#screens button[data-a=go]'); await page.waitForTimeout(500);

// ---- open from the Control Room wall (E at the Incident Wall -> alert -> Open the Incident Board)
await S('(sc)=>{ sc.runner.interact("prop:secure_ops.incident_wall"); }');
await page.waitForSelector('#dialog [data-a=board]'); await page.click('#dialog [data-a=board]');
await page.waitForSelector('#iboard');
if (!(await S('(sc)=>sc.state.paused'))) await fail('opening the board should pause movement');
const cols = await page.$$eval('#iboard .kcol h3', (e) => e.map((x) => x.firstChild.textContent.trim()));
if (cols.join() !== 'New,Triage,Investigating,Contained,Fixing,Verifying,Closed') await fail('columns: ' + cols);
// the wall interaction briefed the shift, so the cards have moved to Triage
const inTriage = await page.$$eval('#iboard .kcol:nth-child(2) [data-card]', (e) => e.map((x) => x.dataset.card));
if (inTriage.join() !== 'INC-101,INC-102,INC-103') await fail('cards after briefing: ' + inTriage);
ok('opened from the Incident Wall; 7 columns; the 3 incidents are in Triage once the shift is briefed');
await shot('board-1-kanban');

// ---- prerequisites: cannot skip, cannot close by dragging
await page.selectOption('[data-moveto="INC-101"]', 'closed');
let card = await txt('[data-card="INC-101"]');
if (!(await page.$('#iboard [data-card="INC-101"]')) || (await S('(sc)=>sc.state.data.board.kanban["INC-101"].status')) !== 'triage') await fail('closing by Move to... must be refused');
if (!card.includes('To move to Investigating: Collect evidence: Masked receipt log') && !card.includes('Collect evidence')) await fail('card should show the unmet prerequisite: ' + card);
ok('Move to… refused: the card stays in Triage and shows the unmet prerequisite');
await page.focus('[data-card="INC-102"]'); await page.keyboard.press(' '); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press(' ');
if ((await S('(sc)=>sc.state.data.board.kanban["INC-102"].status')) !== 'triage') await fail('keyboard move past the prerequisites should be refused');
ok('keyboard move (Space, arrows, Space) is held to the same rules');
await drag('[data-grip="INC-103"]', '.kcards[data-col="verifying"]');
if ((await S('(sc)=>sc.state.data.board.kanban["INC-103"].status')) !== 'triage') await fail('dragging to Verifying should be refused');
ok('dragging a card to Verifying is refused too');

// ---- do the real investigation steps for the first incident (passes by the real request path)
await R(`(sc)=>{ const r = sc.runner, s = sc.state;
  r.requestPass('payments_audit_pass','desk');
  s.selectedTool='scanner'; r.interact('prop:card_payments.card_terminal'); r.inspect('prop:card_payments.receipt_log'); }`);
await closeDialogs();
// the open board re-renders on interaction
await page.click('[data-a=back]').catch(() => {});
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.keyboard.press('i'); await page.waitForSelector('#iboard');
if ((await S('(sc)=>sc.state.data.board.kanban["INC-101"].status')) !== 'investigating') await fail('INC-101 should have moved to Investigating by itself');
if (!(await page.$('.kcol:nth-child(3) [data-card="INC-101"]'))) await fail('INC-101 should show in the Investigating column');
ok('collecting evidence moved INC-101 to Investigating on its own');

// ---- MATCH puzzle (INC-101): mouse drag, tap-tap and keyboard all work; a wrong card explains itself
await page.click('[data-open="INC-101"]'); await page.waitForSelector('.pz.match');
const panelTitles = await page.$$eval('#iboard .ib-panel > h3', (e) => e.map((x) => x.textContent.trim()));
if (panelTitles.join() !== 'Evidence,Match the parts,Objectives') await fail('three panels: ' + panelTitles);
await drag('[data-piece="a"]', '[data-slot="replay"]');
let msg = await txt('.pz-msg');
if (!msg.includes('first delivery')) await fail('wrong placement should explain: ' + msg);
if ((await page.$$('.slot[data-slot="replay"] .piece')).length !== 0) await fail('the wrong card must spring back');
if ((await S('(sc)=>sc.state.integrity')) !== 100) await fail('no penalty for a wrong move');
ok('dragging the original onto "Replay" is refused with a plain explanation; the card springs back; no penalty');
await drag('[data-piece="b"]', '[data-slot="replay"]');
if ((await page.$$('.slot[data-slot="replay"] .piece')).length !== 1) await fail('drag should place the repeat');
await page.click('[data-piece="a"]'); await page.click('[data-slot="orig"]');                                // tap, then tap
if ((await page.$$('.slot[data-slot="orig"] .piece')).length !== 1) await fail('tap-tap should place');
await page.focus('[data-piece="c"]'); await page.keyboard.press('Enter'); await page.focus('[data-slot="valid"]'); await page.keyboard.press('Enter');   // keyboard
await page.focus('[data-piece="d"]'); await page.keyboard.press('Enter'); await page.focus('[data-slot="valid"]'); await page.keyboard.press('Enter');
await page.waitForSelector('.pz-done');
if (!(await S('(sc)=>sc.state.flags.lensed && sc.state.flags.diagnosed'))) await fail('solving INC-101 should run the lens + diagnosis for real');
if ((await S('(sc)=>sc.state.routeStates.receipt_event_feed')) !== 'suspicious') await fail('route should be marked suspicious');
if (!(await page.textContent('.ib-log')).includes('task completed')) await fail('activity log should record it');
ok('INC-101 solved by mouse drag + tap + keyboard: the game now has the diagnosis, the route is marked, the log says so');
await shot('board-2-match-done');

// ---- hints
await page.click('[data-a=back]'); await page.click('[data-open="INC-102"]');
if (!(await page.textContent('.pz-locked')).includes('Not ready yet')) await fail('INC-102 should be locked until the trace and ledger are checked');
const lockText = await txt('.pz-locked');
if (!lockText.includes('Collect evidence') || !lockText.includes('Inspect General Ledger')) await fail('blockers should name what is needed: ' + lockText);
ok('INC-102 is locked and names what it is waiting for (evidence and the earlier step), with waypoints');
await R(`(sc)=>{ const r = sc.runner, s = sc.state;
  r.requestPass('event_trace_pass','desk'); r.inspect('prop:event_stream.replay_console'); r.requestPass('ledger_read_pass','desk'); r.inspect('prop:finance_core.gl'); }`);
await page.click('[data-a=back]'); await page.click('[data-open="INC-102"]'); await page.waitForSelector('.pz.cable');
await page.click('[data-hint]'); if (!(await txt('.hintline')).includes('Hint 1/3')) await fail('hint 1');
await page.click('[data-clue]'); await page.waitForSelector('.ev.hl');
ok('Hint and "Show me the next clue" work (clue is highlighted in the evidence panel)');
await page.check('[data-guided]'); await page.waitForSelector('.guide'); await page.uncheck('[data-guided]');
ok('guided mode highlights the next step');

// ---- CABLE puzzle (INC-102)
await drag('[data-port="replay"]', '[data-port="ledger"]');
msg = await txt('.pz-msg');
if (!/twice|duplicate/i.test(msg)) await fail('wrong cable should explain: ' + msg);
if ((await S('(sc)=>sc.state.data.board.puzzles["INC-102"].connections.length')) !== 0) await fail('the refused cable must not be made');
await drag('[data-port="valid"]', '[data-port="card"]');
if (!(await page.$('.cables path'))) await fail('a made cable should be drawn');
await page.click('[data-port="replay"]'); await page.click('[data-port="hold"]');                 // pick, then connect
await page.waitForSelector('.pz-done');
const g = await S('(sc)=>({c:!!sc.state.flags.contained, r:!!sc.state.flags.rerouted, route: sc.state.routeStates.receipt_event_feed})');
if (!g.c || !g.r || g.route !== 'rerouted') await fail('cable board should contain and reroute: ' + JSON.stringify(g));
ok('INC-102: the wrong cable is explained and refused; the safe route changed the real route (replay held, valid receipts rerouted)');
await page.click('[data-a=back]');
const st102 = await S('(sc)=>sc.state.data.board.kanban["INC-102"].status');
if (st102 !== 'fixing') await fail('INC-102 should be in Fixing, is ' + st102);
await page.selectOption('[data-moveto="INC-102"]', 'verifying');
if ((await S('(sc)=>sc.state.data.board.kanban["INC-102"].status')) !== 'fixing') await fail('Verifying must wait for the fix');
if (!(await page.textContent('[data-card="INC-102"]')).includes('Apply the fix')) await fail('card should say the fix is missing');
ok('INC-102 is in Fixing and cannot reach Verifying until the notifier is patched and the buffer restored');
await shot('board-3-fixing');
// the world fix (what teammates or the player do)
await R(`(sc)=>{ const r = sc.runner, s = sc.state; s.selectedTool='patch'; r.interact('prop:card_payments.notifier'); s.selectedTool='restore'; r.interact('prop:event_stream.replay_buffer'); }`);
await page.click('[data-moveto="INC-102"]').catch(() => {});
await page.selectOption('[data-moveto="INC-102"]', 'verifying');
await page.waitForTimeout(100);
if ((await S('(sc)=>sc.state.data.board.kanban["INC-102"].status')) !== 'verifying') await fail('after the fix the card may move to Verifying');
ok('after the fix is applied the card can move to Verifying');

// ---- VERIFY puzzle (INC-103)
await page.click('[data-open="INC-103"]'); await page.waitForSelector('.pz.verify');
await page.click('[data-select="x1"]'); await page.click('[data-submit]');
msg = await txt('.pz-msg');
if (!msg.includes('contained, not that it is safe')) await fail('wrong evidence should explain: ' + msg);
for (const id of ['x1', 'c1', 'c2', 'c3']) await page.click(`[data-select="${id}"]`);
await page.click('[data-submit]'); await page.waitForSelector('.pz-done');
const v = await S('(sc)=>({rec:!!sc.state.flags.reconciled, rel:!!sc.state.flags.released, fv:!!sc.state.flags.flowVerified, route: sc.state.routeStates.receipt_event_feed, contained: Object.keys(sc.state.contained).length})');
if (!v.rec || !v.rel || !v.fv || v.route !== 'restored' || v.contained !== 0) await fail('verify should reconcile, release and verify: ' + JSON.stringify(v));
ok('INC-103: weak evidence is explained; picking the proof reconciles, releases the route and verifies the feed for real');
await shot('board-4-verify-done');
await page.click('[data-a=back]');
await page.selectOption('[data-moveto="INC-103"]', 'closed');
if ((await S('(sc)=>sc.state.data.board.kanban["INC-103"].status')) !== 'closed') await fail('INC-103 should close once verified');
ok('INC-103 closes only once its verification objective is complete');

// ---- return to the facility and resume
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
if (await page.$('#iboard')) await fail('Escape should close the board');
if (await S('(sc)=>sc.state.paused')) await fail('closing should resume the game');
ok('Escape returns to the facility and resumes play');

// ---- MISSING puzzle in a campaign mission (BACS)
await page.evaluate(() => window.__ledgerlock.startMission('bacs-after-dark'));
await page.waitForSelector('#screens button[data-a=go]'); await page.click('#screens button[data-a=go]'); await page.waitForTimeout(400);
await R(`(sc)=>{ const r = sc.runner, s = sc.state; r.api.flag('briefed'); r.requestPass('bacs_audit_pass','desk'); r.inspect('prop:bacs_vault.file_terminal'); r.inspect('prop:bacs_vault.staging_cabinet'); r.requestPass('ledger_read_pass','desk'); }`);
await page.keyboard.press('i'); await page.waitForSelector('#iboard');
await page.click('[data-open="INC-201"]'); await page.waitForSelector('.pz.match');
for (const [p, sl] of [['p_hash', 's_hash'], ['p_line', 's_line'], ['p_who', 's_who'], ['p_same', 's_same']]) { await page.click(`[data-piece="${p}"]`); await page.click(`[data-slot="${sl}"]`); }
await page.waitForSelector('.pz-done');
if (!(await S('(sc)=>!!sc.state.flags.st_compare'))) await fail('INC-201 should have done the comparison for real');
await page.click('[data-a=back]'); await page.click('[data-open="INC-202"]'); await page.waitForSelector('.pz.missing');
await page.click('[data-mark="first"]'); await page.click('[data-mark="hash"]'); await page.click('[data-submit]');
msg = await txt('.pz-msg');
if (!msg.includes('First approval')) await fail('wrong finding should be explained: ' + msg);
await page.click('[data-mark="first"]'); await page.click('[data-mark="second"]'); await page.click('[data-submit]'); await page.waitForSelector('.pz-done');
const q = await S('(sc)=>({held: Object.keys(sc.state.contained), rep: !!sc.state.flags.st_replacement})');
if (!q.rep || !q.held.some((k) => k.includes('staging_cabinet'))) await fail('missing-item task should hold and rebuild the batch: ' + JSON.stringify(q));
ok('BACS: "identify what is missing" explains a wrong finding, then holds and rebuilds only the affected batch');
await shot('board-5-missing-done');

// ---- phone layout
await page.setViewportSize({ width: 390, height: 800 });
await page.click('[data-a=back]'); await page.waitForTimeout(100);
const ov = await page.evaluate(() => { const b = document.querySelector('#iboard'); return { sw: b.scrollWidth, cw: b.clientWidth, btn: Math.min(...[...b.querySelectorAll('.kc-btns button, .kc-btns select, .grip')].map((x) => x.getBoundingClientRect().height)) }; });
if (ov.btn < 38) await fail('phone: touch targets too small ' + ov.btn);
await shot('board-6-phone');
ok('phone width: large touch targets');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
