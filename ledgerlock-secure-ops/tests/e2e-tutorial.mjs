// Tutorial mode e2e: start from the title screen, check the coach card, beacon and tool highlight, and that the coach advances.
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
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); if (SHOTS) await page.screenshot({ path: SHOTS + '/tut-fail.png' }); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(150); };

await page.goto(URL);
await page.waitForSelector('button[data-a=tutorial]', { timeout: 20000 });
await page.click('button[data-a=tutorial]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');          // how to play
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]');
if (!(await page.$eval('#b-tut', (e) => e.checked))) await fail('briefing should show tutorial mode ticked');
await page.click('#screens button[data-a=go]'); await page.waitForTimeout(800);
await page.waitForSelector('#coach:not(.hidden)');
let txt = await page.textContent('#coach');
if (!txt.includes('step 1 of') || !txt.includes('Read the Incident Wall') || !txt.includes('Why:')) await fail('coach step 1: ' + txt);
if (!(await S('(sc)=>sc.state.tutorial && sc.coachTargets.includes("prop:secure_ops.incident_wall")'))) await fail('beacon not on the Incident Wall');
if (SHOTS) await page.screenshot({ path: SHOTS + '/t1-coach.png' });
ok('coach card shows step, instruction and reason, with a beacon on the Incident Wall');
// "Show me" works
await page.click('#coach button[data-c=show]'); await page.waitForTimeout(700);
ok('"Show me" pans to the target');
// do step 1 for real
await page.evaluate(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); sc.__near = (id) => sc.inRange(id).ok && !sc.to && !sc.path.length; sc.__cell = (id) => { const p = sc.targetPos(id); const g = sc.toGridPublic(p.x, p.y); return { x: Math.floor(g.gx), y: Math.floor(g.gy) }; }; });
async function walkNear(t) { await S('(sc,t)=>sc.walkTo(sc.__cell(t))', t); for (let i = 0; i < 200; i++) { if (await S('(sc,t)=>sc.__near(t)', t)) return; await page.waitForTimeout(150); } await fail('walk ' + t); }
await walkNear('prop:secure_ops.incident_wall'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.incident_wall'); await key('e');
await page.click('#dialog button[data-a=ok]'); await page.waitForTimeout(400);
txt = await page.textContent('#coach');
if (!txt.includes('step 2 of') || !txt.includes('Payments Audit Pass')) await fail('coach did not advance: ' + txt);
ok('coach advances after the step is done');
await walkNear('prop:secure_ops.access_desk'); await S('(sc,t)=>sc.selectTarget(t)', 'prop:secure_ops.access_desk'); await key('e');
await page.click('#dialog button[data-req=payments_audit_pass]'); await page.waitForTimeout(200); await page.click('#dialog button[data-a=ok]');
await S('(sc)=>sc.walkTo({x: 25, y: 32})');
for (let i = 0; i < 160 && !(await S('(sc)=>!!sc.state.flags.visited_card_payments')); i++) await page.waitForTimeout(150);
await page.waitForTimeout(300);
await key('2'); await page.waitForTimeout(300);   // the scanner is the default tool, so pick another to see the prompt
txt = await page.textContent('#coach');
if (!txt.includes('Signal Scanner') || !txt.includes('press 1')) await fail('coach should ask for the Signal Scanner: ' + txt);
if ((await page.$$('.tool.coach')).length !== 1) await fail('coached tool not highlighted');
await key('1'); await page.waitForTimeout(300);
if (!(await page.textContent('#coach')).includes('selected')) await fail('coach should confirm tool selected');
if (SHOTS) await page.screenshot({ path: SHOTS + '/t2-tool.png' });
ok('coach names the tool, highlights it in the belt and confirms when selected');
// free hints: a premature action gives a hint that is not counted
await S('(sc,t)=>sc.selectTarget(t)', 'route:receipt_event_feed'); await key('2'); await key('e'); await page.waitForTimeout(300);
if ((await S('(sc)=>sc.state.stats.hintsUsed')) !== 0) await fail('hints should be free in tutorial mode');
ok('hints are free in tutorial mode');
// turn off from the coach
await page.click('#coach button[data-c=off]'); await page.waitForTimeout(400);
if (!(await page.$eval('#coach', (e) => e.classList.contains('hidden')))) await fail('coach should hide when turned off');
if ((await S('(sc)=>sc.state.tutorial')) !== false) await fail('state.tutorial should be off');
ok('tutorial mode can be turned off from the coach');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
