// Manager mode and Auto-play e2e: start from the title screen, order a teammate by hand, answer a decision, then put everyone on Auto.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); await shot('team-fail'); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const until = async (label, fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await page.waitForTimeout(250); } await fail('timeout: ' + label); };

await page.goto(URL);
await page.waitForSelector('button[data-a=manager]', { timeout: 20000 });
await page.click('button[data-a=manager]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');          // how to play
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]');
if (!(await page.$eval('#b-team', (e) => e.checked))) await fail('briefing should show Manager mode ticked');
await page.click('#screens button[data-a=go]'); await page.waitForTimeout(800);
await page.waitForSelector('#team:not(.hidden)');
const cards = await page.$$eval('#team .tm', (e) => e.map((x) => x.querySelector('b').textContent));
if (cards.join() !== 'You,Priya,Marcus,Lena') await fail('expected four cards, got ' + cards);
ok('Manager mode: panel lists You, Priya, Marcus and Lena');
if (!(await S('(sc)=>sc.team.crewOn && sc.crewSprites.size===3'))) await fail('crew sprites missing');
await shot('team-1-panel');

// --- a manual order: Priya reads the Incident Wall
await page.click('#team .tm[data-m=priya] button[data-t=more]');
await S('(sc)=>sc.selectTarget("prop:secure_ops.incident_wall")'); await page.waitForTimeout(300);
await page.click('#team .tm[data-m=priya] button[data-t=read]');
await until('Priya briefs', async () => S('(sc)=>!!sc.state.flags.briefed'), 20000);
if ((await S('(sc)=>sc.state.stats.orders')) !== 1) await fail('order not counted');
ok('manual order: Priya walked to the Incident Wall and read it (the manager did not move)');
await shot('team-2-order');

// --- Priya on Auto with decisions left to the manager: she asks before confirming/choosing
await page.click('#team .tm[data-m=lena] input[data-t=auto]');           // Lena requests the pass
await page.click('#team .tm[data-m=priya] input[data-t=auto]');
await page.click('#team button[data-n="4"]');
await until('a decision arrives', async () => (await page.$('#team .it.decision')) !== null, 120000);
const title = await page.$eval('#team .it.decision', (e) => e.textContent);
ok('a teammate asked for a decision: ' + title.slice(0, 70));
await shot('team-3-decision');
await page.click('#team .it.decision button[data-t=decide]');
await page.waitForSelector('#dialog');
if (await page.$('#dialog button[data-a=ok]')) await page.click('#dialog button[data-a=ok]');
await page.click('#dialog button[data-o=bug]');
ok('manager answered through the Decide button');
await page.waitForTimeout(600);
if (!(await S('(sc)=>!!sc.state.flags.diagnosed'))) await fail('the manager answer should have diagnosed the bug');

// --- everyone on Auto, with the calls left to the team: the shift finishes by itself
await page.evaluate(() => document.querySelector('#team input[data-t=decide-all]').click());
await page.click('#team button[data-t=allauto]');
await S('(sc)=>{ sc.state.paused=false }');
await until('shift completes', async () => S('(sc)=>sc.state.complete'), 240000);
const st = await S('(sc)=>({auto:sc.state.stats.autoActions, orders:sc.state.stats.orders, primary: sc.state.mission.goals.filter(g=>g.kind==="primary"&&g.done(sc.state)).length})');
if (st.primary !== 6) await fail('primary goals ' + st.primary);
ok(`the team finished the tutorial on Auto (${st.auto} auto actions, ${st.orders} order)`);
await page.waitForSelector('#screens .card.wide', { timeout: 15000 });
const chip = (await page.$$eval('#screens .chip.info', (e) => e.map((x) => x.textContent))).join(' | ');
if (!chip.includes('Auto did')) await fail('debrief should say Auto did the work: ' + chip);
ok('debrief says stretch goals are not counted: ' + chip.trim());
await shot('team-4-debrief');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
