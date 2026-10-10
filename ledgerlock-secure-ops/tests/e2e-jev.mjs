// JEV e2e against a LOCAL MOCK of the TypeSafe API (no real key or network is used).
// Checks: not-configured state, the Settings switch, "Ask JEV" on a real decision dialog, and that the key never reaches the browser.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const KEY = 'test-key-not-real-123';
const seen = [];
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    seen.push({ auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ model: 'jev-1.13.0', answers: { best: { type: 'choice', choice: 'bug', confidence: 0.93, probabilities: { bug: 0.93, malware: 0.04, creds: 0.03 } } }, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
}).listen(8799, '127.0.0.1');
const serve = (port, env) => spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { env: { ...process.env, ...env }, stdio: 'ignore' });
const withKey = serve(4180, { TYPESAFE_API_KEY: KEY, TYPESAFE_API_URL: 'http://127.0.0.1:8799/v1/systemone' });
const noKey = serve(4181, { TYPESAFE_API_KEY: '' });
await new Promise((r) => setTimeout(r, 3500));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const done = async (code) => { await browser.close(); mock.close(); withKey.kill(); noKey.kill(); process.exit(code); };
const ok = (m) => console.log('ok  ', m);
const fail = async (m) => { console.error('FAIL:', m); await done(1); };
const errors = [];

// ---- 1. no key on the server: the switch is disabled with an explanation
{
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4181/'); await page.waitForSelector('button[data-a=access]');
  await page.click('button[data-a=access]'); await page.waitForSelector('#s-jev');
  await page.waitForFunction(() => document.querySelector('#jev-state').textContent.includes('TYPESAFE_API_KEY'), null, { timeout: 8000 });
  if (!(await page.$eval('#s-jev', (e) => e.disabled))) await fail('switch should be disabled without a server key');
  ok('no server key: JEV switch is disabled and says to add TYPESAFE_API_KEY');
  await page.close();
}
// ---- 2. key on the server (mock upstream)
const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const bodies = []; page.on('response', async (r) => { if (r.url().includes('/api/jev')) { try { bodies.push(await r.text()); } catch { /* ignore */ } } });
await page.goto('http://localhost:4180/'); await page.waitForSelector('button[data-a=access]');
await page.click('button[data-a=access]'); await page.waitForSelector('#s-jev:not([disabled])', { timeout: 8000 });
await page.check('#s-jev'); ok('with a server key: the JEV switch is enabled and can be turned on');
await page.click('#screens button.primary');                      // Done
await page.click('button[data-a=start]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#b-jev'); if (!(await page.$eval('#b-jev', (e) => e.checked))) await fail('briefing checkbox should reflect the setting');
await page.click('#screens button[data-a=go]'); await page.waitForTimeout(500);
const hud = await page.$eval('#hudroot #b-jev', (e) => ({ hidden: e.classList.contains('hidden'), text: e.textContent }));
if (hud.hidden || !hud.text.includes('JEV')) await fail('HUD should show the JEV chip');
ok('HUD shows a JEV chip, on');
// reach the diagnosis decision through the real lens interaction
await page.evaluate(() => {
  const sc = window.__ledgerlock.game.scene.getScene('Facility'), s = sc.state;
  Object.assign(s.flags, { briefed: true, scannedTerminal: true, receiptEvidence: true }); s.evidence.add('ev_masked_receipt');
  s.addClue('c_dup_receipt', 'One receipt appears twice', 'The card terminal shows receipt R-77 twice, one second apart.');
  s.selectedTool = 'lens'; sc.runner.interact('route:receipt_event_feed');
});
await page.waitForSelector('#dialog button[data-a=ok]'); await page.click('#dialog button[data-a=ok]');
await page.waitForSelector('#dialog [data-j=ask]');
await page.click('#dialog [data-j=ask]');
await page.waitForFunction(() => document.querySelector('#jev-note').textContent.includes('leans to'), null, { timeout: 8000 });
const note = await page.textContent('#jev-note');
if (!note.includes('Software bug') || !note.includes('93%')) await fail('unexpected note: ' + note);
ok('Ask JEV on a real decision: ' + note.slice(0, 70) + '…');
if (!(await page.$eval('[data-jv=bug]', (e) => e.textContent.includes('93%')))) await fail('per-option probability missing');
const req = seen[0];
if (req.auth !== 'Bearer ' + KEY) await fail('server should send Bearer auth upstream');
if (req.body.model !== 'jev-latest' || req.body.questions.best.type !== 'choice') await fail('unexpected upstream request');
if (!req.body.state.includes('One receipt appears twice')) await fail('clues should be in the state: ' + req.body.state);
ok('server called the (mock) System One endpoint with the key as a Bearer header and the clues as state');
const html = await page.content();
if (html.includes(KEY) || bodies.join('').includes(KEY)) await fail('the key must never reach the browser');
ok('the key never appears in the page or in any response the browser saw');
await page.click('#dialog [data-o=bug]'); await page.waitForTimeout(500);
if (!(await page.evaluate(() => window.__ledgerlock.game.scene.getScene('Facility').state.flags.diagnosed))) await fail('choosing should diagnose');
ok('choosing the answer works as normal (JEV is advice only)');
if (errors.filter((e) => !e.includes('GPU stall')).length) { console.error(errors.join('\n')); await done(2); }
ok('no console errors');
await done(0);
