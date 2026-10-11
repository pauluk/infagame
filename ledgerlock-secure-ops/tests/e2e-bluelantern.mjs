// Blue Lantern end to end: the whole emergency payment run is worked by hand through the real board (every control, every stage).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const SP = SHOTS ? SHOTS + '/' : '/dev/null/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { localStorage.setItem('ledgerlock.settings.v1', JSON.stringify({ reducedMotion: true, team: false, autoRun: false, autoDecide: false, tutorial: false })); localStorage.setItem('ledgerlock.campaign.v1', JSON.stringify({ version: 1, unlockedAll: true })); localStorage.setItem('ledgerlock.seen', '1'); });
await page.goto(URL); await page.waitForSelector('button[data-a=start]');
await page.evaluate((m) => window.__ledgerlock.startMission(m), 'blue-lantern');
await page.waitForTimeout(800);
const sc = () => page.evaluate(() => 0);
// dismiss briefing if showing
for (const sel of ['button[data-a=go]', 'button[data-a=ok]', 'button.primary']) { const b = await page.$(`#screens ${sel}`); if (b) { await b.click(); await page.waitForTimeout(300); } }
await page.evaluate(() => { const s = window.__ledgerlock.game.scene.getScene('Facility'); s.state.flags.briefed = true; });
await page.click('#b-board'); await page.waitForTimeout(500);
if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
const out = [];
const click = async (sel) => { const e = await page.$(sel); if (!e) { out.push('missing ' + sel); return false; } try { await e.click({ timeout: 4000 }); } catch (err) { out.push('click failed ' + sel + ' ' + String(err).slice(0, 80));  return false; } await page.waitForTimeout(120); return true; };
const tab = async (t) => click(`#bluelantern [data-tab=${t}]`);
// triage
await tab('triage'); for (const k of ['orchestration', 'outbound', 'retries']) await page.check(`[data-sys=${k}]`);
await click('[data-act=assess]'); await click('[data-act=pause]'); await click('[data-act=preserve]');
if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
// scope
await tab('scope');
for (const [id, v] of [['A','unsent'],['B','unsent'],['C','unknown'],['D','duplicate'],['E','unsent'],['F','sent'],['G','rejected']]) await page.selectOption(`[data-cls=${id}]`, v);
await page.check('[data-type="Approved supplier invoices"]'); await page.check('[data-limit]');
await click('[data-act=scope]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('govern'); await click('[data-act=reviewprov]'); await click('[data-act=stratok]'); await click('[data-act=indok]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('configure'); for (const k of ['record','identity','types','account','limits','owner','times']) await click(`[data-conn=${k}]`);
await click('[data-act=handshake]'); await click('[data-act=novalue]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('prepare'); await click('[data-act=verifyb]');
for (const [id, l] of [['A','eligible'],['B','eligible'],['C','hold_reconcile'],['D','hold_duplicate'],['E','escalate']]) await page.selectOption(`[data-lane-pick=${id}]`, l);
await click('[data-act=batch]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('review'); await page.check('input[name=tacct][value=ops]'); await click('[data-act=tacct]'); for (const k of ['funds','total','limit','items','approvals']) await click(`[data-tcheck=${k}]`); await click('[data-act=tsign]'); await click('[data-act=indbatch]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('submit'); await click('[data-act=submit]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('reconcile'); await click('[data-post="A"]'); await click('[data-rdec="A:processed"]'); await click('[data-rdec="B:monitor"]');
for (const k of ['bank','portal','orchestration']) await page.check(`[data-cev=${k}]`); await click('[data-act=investc]'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('restore'); for (const k of ['route','dup','cycle','postb','off']) await click(`[data-rest=${k}]`); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('audit'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
await tab('board'); if (SHOTS) await page.screenshot({ path: SP + 'bl.png' });
const st = await page.evaluate(() => { const s = window.__ledgerlock.game.scene.getScene('Facility').state; return Object.keys(s.flags).filter((k) => k.startsWith('bl_')); });
const want = ['bl_triage','bl_scope','bl_govern','bl_configure','bl_prepare','bl_review','bl_submit','bl_reconcile','bl_restore'];
const missing = want.filter((k) => !st.includes(k));
console.log(missing.length || out.length || errors.length ? 'FAIL' : 'PASS', JSON.stringify({ missing, out, errors }));
process.exitCode = missing.length || out.length || errors.length ? 1 : 0;
await browser.close();
