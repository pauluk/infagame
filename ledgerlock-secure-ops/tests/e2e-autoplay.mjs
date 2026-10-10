// Solo Auto-play e2e: the player's own avatar follows the playbook, and any manual movement hands control back.
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
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); await shot('auto-fail'); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const until = async (label, fn, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await page.waitForTimeout(250); } await fail('timeout: ' + label); };

await page.goto(URL);
await page.waitForSelector('button[data-a=start]', { timeout: 20000 });
await page.click('button[data-a=start]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]');
await page.click('#screens button[data-a=go]'); await page.waitForTimeout(600);
if (await page.$eval('#team', (e) => !e.classList.contains('hidden'))) { /* open by default on wide screens */ } else await page.click('#b-team');
const cards = await page.$$eval('#team .tm', (e) => e.length);
if (cards !== 1) await fail('solo mode should show only the player card, got ' + cards);
ok('Auto-play panel shows one card (no teammates in solo mode)');
await page.evaluate(() => document.querySelector('#team input[data-t=decide-all]').click());
await page.click('#team .tm[data-m=you] input[data-t=auto]');
await page.click('#team button[data-n="4"]');
const p0 = await S('(sc)=>({x:sc.pos.x,y:sc.pos.y})');
await until('avatar walks and acts on its own', async () => S('(sc)=>!!sc.state.flags.scannedTerminal'));
const p1 = await S('(sc)=>({x:sc.pos.x,y:sc.pos.y, room: sc.state.player.room, passes: [...sc.state.passes]})');
if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 5) await fail('avatar did not move');
if (!p1.passes.includes('payments_audit_pass')) await fail('auto should have requested the Payments Audit Pass at the desk');
ok(`Auto-play walked the avatar to ${p1.room}, requested the pass and scanned the card terminal`);
await shot('auto-1-running');
// manual movement takes over
await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
await page.waitForTimeout(400);
if (await S('(sc)=>sc.team.you.auto')) await fail('moving by hand should switch Auto-play off');
if (await page.$eval('#team .tm[data-m=you] input[data-t=auto]', (e) => e.checked)) await fail('Auto checkbox should be cleared');
ok('moving by hand took the controls back and switched Auto-play off');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
