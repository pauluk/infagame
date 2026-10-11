// Auto keeps going: with Auto-run on, a business-continuity mission plays itself (popups closed, choices made), the debrief
// advances to the next mission, and any click takes the controls back.
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
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); await shot('autorun-fail'); await browser.close(); process.exit(1); };
const S = (fn) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); return (${fn})(sc); })()`);
const until = async (label, fn, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await page.waitForTimeout(400); } await fail('timeout: ' + label); };

await page.addInitScript(() => { try {
  localStorage.setItem('ledgerlock.settings.v1', JSON.stringify({ reducedMotion: true, team: true, autoRun: true, autoDecide: true, tutorial: false }));
  localStorage.setItem('ledgerlock.campaign.v1', JSON.stringify({ version: 1, unlockedAll: true }));
  localStorage.setItem('ledgerlock.seen', '1');
} catch { /* ignore */ } });
await page.goto(URL);
await page.waitForSelector('button[data-a=start]', { timeout: 20000 });
await page.evaluate(() => window.__ledgerlock.startMission('payments-down'));
await page.waitForSelector('#screens button[data-a=ok]', { timeout: 8000 }).then(() => page.click('#screens button[data-a=ok]')).catch(() => {});
await page.waitForSelector('#screens button[data-a=go]', { timeout: 20000 });
const note = await page.textContent('#screens .small[role=status]');
if (!/Auto continues to the shift/.test(note ?? '')) await fail('the briefing should count down by itself: ' + note);
ok('with Auto-run on, the briefing screen counts down and continues by itself');
await page.waitForSelector('#screens button[data-a=go]', { state: 'detached', timeout: 15000 });
await S('(sc)=>{ sc.state.speed = 4; }');
if (!(await S('(sc)=>sc.team.anyAuto()'))) await fail('Auto should be restored from the saved setting');
ok('Auto was restored for the team and the manager from the saved setting');
let closed = 0, last = '';
await until('the mission completes by itself (decisions made, popups closed)', async () => {
  const t = await page.$('#dialog'); if (t) { closed++; }
  return !!(await page.$('#screens .score, #screens .chip.good'));
}, 420000);
const title = await page.textContent('#screens h2, #screens .chip.good').catch(() => '');
ok(`Payments Down completed on Auto (${closed} popup moments seen; none left the game waiting)`);
await shot('autorun-debrief');
const next = await page.textContent('#screens button[data-a=next]').catch(() => null);
if (!next || !next.includes('Rising Water')) await fail('the debrief should offer the next mission: ' + next);
const note2 = await page.textContent('#screens .small[role=status]');
if (!/Auto continues to Rising Water/.test(note2 ?? '')) await fail('the debrief should count down: ' + note2);
ok('the debrief offers Rising Water and counts down to it');
await until('the next mission starts by itself', async () => (await page.evaluate(() => window.__ledgerlock.game.scene.getScene('Facility')?.state?.mission?.id)) === 'rising-water', 60000);
ok('Rising Water started by itself');
await page.waitForSelector('#screens button[data-a=go]', { timeout: 20000 });
await page.mouse.click(5, 5);                                  // a person takes over: the countdown stops
await page.waitForTimeout(1500);
if (!/cancelled/.test((await page.textContent('#screens .small[role=status]')) ?? '')) await fail('a click should cancel the auto-advance');
ok('any click cancels the countdown');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
