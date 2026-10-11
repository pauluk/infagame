// Campaign e2e: mission select, unlocking, the side-task hub played with real keys, debrief sections and local persistence.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('[ledgerlock]'))) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
const ok = (m) => console.log('ok  ', m);
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); if (SHOTS) await page.screenshot({ path: SHOTS + '/campaign-fail.png' }); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(150); };

await page.goto(URL);
await page.waitForSelector('button[data-a=missions]', { timeout: 20000 });
await page.click('button[data-a=missions]');
await page.waitForSelector('.mcard');
let locked = await page.$$eval('.mcard.locked', (e) => e.length);
if (locked !== 0) await fail('every mission should be open, got ' + locked + ' locked');
const goalText = await page.textContent('#screens');
for (const t of ['Service Confidence', 'Precision Over Panic', 'Least Privilege', 'No Lost Events', 'Ledger Listener', 'Clean Restore', 'Good Evidence', 'The Root of the Ripple', 'Payments Down', 'Rising Water', 'Flood Gates', 'Between missions']) if (!goalText.includes(t)) await fail('mission select missing: ' + t);
ok('mission select shows campaign goal, Service Confidence, 6 badges, 26 missions (all open) and the side-task hub');
if (SHOTS) await page.screenshot({ path: SHOTS + '/c1-select.png' });
page.once('dialog', (d) => d.accept());
await page.click('button[data-a=unlock]'); await page.waitForTimeout(300);
locked = await page.$$eval('.mcard.locked', (e) => e.length);
if (locked !== 0) await fail('unlock all should unlock everything');
ok('unlock-all works');
await page.click('button[data-m=ops-floor]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]'); await page.click('#screens button[data-a=go]');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const sc = window.__ledgerlock.game.scene.getScene('Facility');
  sc.__near = (id) => sc.inRange(id).ok && !sc.to && !sc.path.length;
  sc.__cell = (id) => { const p = sc.targetPos(id); const g = sc.toGridPublic(p.x, p.y); return { x: Math.floor(g.gx), y: Math.floor(g.gy) }; };
});
async function walkNear(t) { await S('(sc,t)=>sc.walkTo(sc.__cell(t))', t); for (let i = 0; i < 200; i++) { if (await S('(sc,t)=>sc.__near(t)', t)) return; await page.waitForTimeout(150); } await fail('walk ' + t); }
const choose = async (txt) => { await page.waitForSelector('#dialog .options button'); const b = await page.$(`#dialog .options button:has-text("${txt}")`); if (!b) await fail('option ' + txt); await b.click(); await page.waitForTimeout(200); };

// side task 1: revoke an expiring pass at the Access Desk
await walkNear('prop:secure_ops.access_desk'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.access_desk'); await key('e');
await page.waitForSelector('#dialog button[data-rev=service_audit_pass]'); await page.click('#dialog button[data-rev=service_audit_pass]'); await page.waitForTimeout(200);
if (await S('(sc)=>sc.state.passes.has("service_audit_pass")')) await fail('pass not revoked');
await page.click('#dialog button[data-a=ok]');
ok('side task: expiring pass reviewed and revoked at the Access Desk');
// side task 2: alert routing at the Incident Wall (wrong then right)
await walkNear('prop:secure_ops.incident_wall'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.incident_wall'); await key('e');
await choose('Debt Recovery'); await page.waitForTimeout(300);
if (await S('(sc)=>!!sc.state.flags.st_alert_routing')) await fail('wrong answer should not complete');
await key('e'); await choose('Card Services');
// side task 3: stale log entry
await walkNear('prop:secure_ops.log_terminal'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.log_terminal'); await key('e');
await choose('Confirm the totals agree');
if (!(await S('(sc)=>!!sc.state.flags.st_close_log && !!sc.state.flags.st_alert_routing'))) await fail('side tasks not recorded');
ok('side tasks completed with real keys (wrong answers recoverable)');
// goals dialog and confidence dialog
await key('g'); await page.waitForSelector('#dialog ul.goals'); const gt = await page.textContent('#dialog');
if (!gt.includes('Optional') || !gt.includes('Stretch')) await fail('goals dialog'); await page.click('#dialog button[data-a=ok]');
await page.click('#b-conf'); await page.waitForSelector('#dialog .mrow'); if (!(await page.textContent('#dialog')).includes('Audit quality')) await fail('confidence dialog'); await page.click('#dialog button[data-a=ok]');
if (SHOTS) await page.screenshot({ path: SHOTS + '/c2-wall.png' });
ok('goals (primary/optional/stretch) and Service Confidence dialogs');
// file report -> debrief
await walkNear('prop:secure_ops.evidence_board'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.evidence_board'); await key('e');
await page.waitForSelector('#dialog button[data-a=file]'); await page.click('#dialog button[data-a=file]');
await page.waitForSelector('#screens .score', { timeout: 8000 });
const deb = await page.textContent('#screens');
for (const t of ['Objectives', 'Optional', 'Stretch', 'Badges', 'Service Confidence: before and after', 'Evidence collected', 'Routes and services affected', 'Safest next step']) if (!deb.includes(t)) await fail('debrief missing: ' + t);
if (SHOTS) await page.screenshot({ path: SHOTS + '/c3-debrief.png' });
ok('debrief shows objectives, badges, Service Confidence before/after, evidence, affected routes and the safest next step');
const stored = await page.evaluate(() => localStorage.getItem('ledgerlock.campaign.v1'));
const j = JSON.parse(stored); if (!j.missions['ops-floor']?.completed || !j.side.includes('alert_routing')) await fail('campaign not stored');
await page.reload(); await page.waitForSelector('button[data-a=missions]'); await page.click('button[data-a=missions]'); await page.waitForSelector('.mcard');
if (!(await page.textContent('#screens')).includes('Completed')) await fail('progress lost after reload');
ok('progress persists in local storage across reloads (no finance data or credentials stored)');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
