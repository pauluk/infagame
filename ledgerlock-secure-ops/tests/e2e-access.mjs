// Identity & Access Desk e2e: opened from the atrium desk; passport, drag/keyboard permission cards, decisions, scoring, audit trail, service form, review board.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3]; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
const ok = (m) => console.log('ok  ', m);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const fail = async (m) => { console.error('FAIL:', m, errors.join('\n')); await shot('access-fail'); await browser.close(); process.exit(1); };
const S = (fn, arg) => page.evaluate(`(() => { const sc = window.__ledgerlock.game.scene.getScene('Facility'); const a = ${JSON.stringify(arg ?? null)}; return (${fn})(sc, a); })()`);
const txt = (sel) => page.textContent(sel);
const drag = async (from, to) => {
  await page.locator(from).first().scrollIntoViewIfNeeded();
  const a = await page.locator(from).first().boundingBox(), b = await page.locator(to).first().boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 }); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(120);
};
const pickReasons = async (re) => { for (const l of await page.$$('.why label')) { const t = await l.textContent(); if (re.test(t)) await (await l.$('input')).check(); } };

await page.addInitScript(() => { try { localStorage.setItem('ledgerlock.settings.v1', JSON.stringify({ reducedMotion: true })); localStorage.removeItem('ledgerlock.access.v1'); } catch { /* ignore */ } });
await page.goto(URL);
await page.waitForSelector('button[data-a=start]', { timeout: 20000 });
await page.click('button[data-a=start]');
await page.waitForSelector('#screens button.primary'); await page.click('#screens button.primary');
if (await page.$('#screens button[data-a=ok]')) await page.click('#screens button[data-a=ok]');
await page.waitForSelector('#screens button[data-a=go]'); await page.click('#screens button[data-a=go]'); await page.waitForTimeout(500);

// ---- reachable from the Secure Operations room: select the desk, stand next to it, press E
await S('(sc)=>{ sc.selectTarget("prop:secure_ops.identity_desk"); }');
if (!(await S('(sc)=>sc.inRange("prop:secure_ops.identity_desk").ok'))) await fail('the Identity & Access Desk should be within reach of the spawn point');
await page.keyboard.press('e');
await page.waitForSelector('#access');
if (!(await S('(sc)=>sc.state.paused'))) await fail('should pause');
ok('the Identity & Access Desk opens with E from the Secure Operations room, and play pauses');
const queue = await page.$$eval('.qitem', (e) => e.length);
if (queue !== 22) await fail('queue length ' + queue);

// ---- passport
if (!(await page.$('.passport .pp-av svg'))) await fail('avatar missing');
const pass = await txt('.passport');
for (const w of ['Marisol Vance', 'ST-4102', 'Accounting', 'Hollis Bright', 'Test', 'FICTIONAL', 'Business reason']) if (!(pass + (await txt('.pp-reason'))).includes(w)) await fail('passport should show ' + w);
const svg = await page.$eval('.passport .pp-av', (e) => e.innerHTML);
if (/https?:\/\/(?!www\.w3\.org)/.test(svg) || /<image|<script/.test(svg)) await fail('avatar must be self-contained');
ok('Access Passport: generated local avatar, fictional staff ID, name, team, manager, reason, environment and status');
if (!(await txt('.rolecard')).includes('Prepares journals for review') || !(await txt('.rolecard')).includes('Never')) await fail('role explanation');
if (!(await txt('.compare')).includes('Post journals')) await fail('compare columns');
if (!(await txt('.checker')).includes('Role mismatch')) await fail('policy checker should flag the excess permission: ' + (await txt('.checker')));
if (!(await txt('.pcard[data-perm="jnl.post"]')).includes('Push a reviewed journal into the ledger')) await fail('plain-language permission explanation');
ok('role explained; current vs requested shown; the policy checker flags the excess permission; every permission card explains itself');
await shot('access-1-passport');

// ---- amend: drag the excess card out (mouse), then do the rest by keyboard; explain; submit
await drag('.pcard[data-perm="jnl.post"]', '.zone.deny');
if ((await page.$$('.zone.grant .pcard')).length !== 2) await fail('drag should move the card to Do not grant');
await page.focus('.pcard[data-perm="gl.report"]'); await page.keyboard.press('Enter');             // keyboard: grant it
if ((await page.$$('.zone.grant .pcard')).length !== 3) await fail('keyboard should grant a card');
await page.focus('.pcard[data-perm="gl.report"]'); await page.keyboard.press('Enter');
if ((await page.$$('.zone.grant .pcard')).length !== 2) await fail('keyboard should move it back');
ok('permission cards move by mouse drag, and by keyboard (Enter) as well');
await page.check('[data-act=amend]'); await pickReasons(/Remove "Post journals"/);
await page.click('[data-submit]'); await page.waitForSelector('.result');
let res = await txt('.result');
if (!res.includes('Sound decision') || !res.includes('Amended') && !res.includes('amended') && !res.includes('Approved (amended)')) await fail('R01 result: ' + res.slice(0, 200));
if (!res.includes('Take-away') || !res.includes('Posting changes the ledger')) await fail('explanation of what was correct');
ok('R01 amended to least privilege: sound decision, a take-away, the final approved set and a score breakdown');
await shot('access-2-result');

// ---- a senior title does not excuse a conflict (R02): approving as submitted is shown to be risky, with the safeguard
await page.click('.qitem[data-req=R02]');
if (!(await txt('.checker')).includes('J1')) await fail('R02 should flag J1');
await page.check('[data-act=approve]'); await pickReasons(/senior|politely/); await page.click('[data-submit]'); await page.waitForSelector('.result');
res = await txt('.result');
if (!res.includes('Risky decision') || !res.includes('J1') || !res.includes('Safeguard') || !res.includes('Segregation of duties')) await fail('R02 result: ' + res.slice(0, 300));
ok('R02: approving a conflict because the job title is senior is marked risky; the rule and its safeguard are explained, and the penalty is visible');

// ---- add a justified missing permission (R14)
await page.click('.qitem[data-req=R14]');
if (!(await txt('.checker')).includes('Possible gap')) await fail('R14 should flag a possible gap');
await page.click('.zone.deny .pcard[data-perm="ar.case.work"]');
if (!(await page.$('.zone.grant .pcard[data-perm="ar.case.work"]'))) await fail('should add the missing permission');
await page.check('[data-act=amend]'); await pickReasons(/Add "Work collection cases"/); await page.click('[data-submit]'); await page.waitForSelector('.result');
if (!(await txt('.result')).includes('Sound decision')) await fail('R14 result');
ok('R14: adding the justified missing permission is rewarded');

// ---- independent approval (R12)
await page.click('.qitem[data-req=R12]');
await page.check('[data-act=escalate]'); await page.selectOption('[data-esc]', 'ap_indep'); await pickReasons(/Send it to/);
await page.click('[data-submit]'); await page.waitForSelector('.result');
res = await txt('.result');
if (!res.includes('Sound decision') || !res.includes('right safeguard')) await fail('R12 result: ' + res.slice(0, 250));
ok('R12: routing to an independent approver is the right safeguard (not silently approving the conflict)');

// ---- reject self-approval (R20), request more information (R19)
await page.click('.qitem[data-req=R20]');
await page.check('[data-act=reject]'); await page.check('[data-rej=self]'); await pickReasons(/own access|approve or grant/);
await page.click('[data-submit]'); await page.waitForSelector('.result'); if (!(await txt('.result')).includes('Sound decision')) await fail('R20 result');
await page.click('.qitem[data-req=R19]');
await page.check('[data-act=info]'); await page.check('[data-info=owner]'); await page.check('[data-info=duration]'); await pickReasons(/Ask for/);
await page.click('[data-submit]'); await page.waitForSelector('.result'); if (!(await txt('.result')).includes('Sound decision')) await fail('R19 result: ' + (await txt('.result')).slice(0, 200));
ok('R20 rejected (self-approval) and R19 sent back for an owner and an expiry');

// ---- audit trail
await page.click('[data-tab=audit]');
const audit = await txt('.ar-main');
for (const w of ['Marisol Vance', 'Approved (amended)', 'Pending: An independent Accounts Payable approver', 'Tamsin Reyes', 'Rejected', 'Waiting for information', 'Mateo Ibarra']) if (!audit.includes(w)) await fail('audit trail should include ' + w);
ok('audit trail records who asked, the decision and who approved (or is asked to approve)');

// ---- service form
await page.click('[data-tab=service]');
await page.click('[data-sfsubmit]'); await page.waitForSelector('.result');
if (!(await txt('.result')).includes('Returned for changes')) await fail('an empty form must be returned');
await page.fill('[data-sf=name]', 'svc-fabric-loader'); await page.selectOption('[data-sf=owner]', 'Data Platform lead');
await page.selectOption('[data-sf=purpose]', 'Land event metadata in Fabric Bronze'); await page.selectOption('[data-sf=target]', 'Fabric Bronze landing zone'); await page.selectOption('[data-sf=env]', 'Production');
await page.selectOption('[data-sf=scope]', 'Masked event metadata only'); await page.check('[data-sfa="svc.events.read"]'); await page.check('[data-sfa="svc.fabric.write"]'); await page.check('[data-sfa="svc.interactive"]');
await page.fill('[data-sf=days]', '60'); await page.selectOption('[data-sf=approver]', 'Independent manager'); await page.fill('[data-sf=reviewDays]', '30');
await page.click('[data-sfsubmit]'); res = await txt('.result');
if (!res.includes('No interactive login') || !res.includes('Returned for changes')) await fail('interactive login should be caught: ' + res.slice(0, 200));
await page.uncheck('[data-sfa="svc.interactive"]'); await page.click('[data-sfsubmit]');
if (!(await txt('.result')).includes('Approved · 100')) await fail('a correct form should be approved: ' + (await txt('.result')).slice(0, 200));
if (!(await txt('.sform')).includes('Mock credentials') && !(await txt('.ar-main')).includes('Mock credentials only')) await fail('mock credentials note');
ok('service access form: mistakes are caught with fixes (an interactive login is refused); the corrected form is approved; mock credentials only');
await shot('access-3-service');

// ---- access review board
await page.click('[data-tab=board]');
await page.click('[data-rec=RV02]'); if (!(await txt('.ar-main')).includes('410 days ago')) await fail('record details');
await page.click('[data-rv=remove]'); if (!(await txt('.result')).includes('Good call')) await fail('removing stale access'); await page.click('[data-nextrec]');
await page.click('[data-rec=RV01]'); await page.click('[data-rv=remove]'); res = await txt('.result');
if (!res.includes('Not quite') || !res.includes('legitimate work')) await fail('removing justified access: ' + res.slice(0, 200));
await page.click('[data-rec=RV06]'); await page.selectOption('[data-addpick]', 'ar.case.work'); await page.click('[data-rv=add]'); if (!(await txt('.result')).includes('Good call')) await fail('adding the missing permission');
await page.click('[data-rec=RV03]'); const rc = await txt('.ar-main'); if (!rc.includes('Linnea Berg') || !rc.includes('Approved by')) await fail('who requested and approved');
await page.click('[data-rv=independent]'); if (!(await txt('.result')).includes('Good call')) await fail('independent review for a conflict');
ok('access review board: stale access removed, justified access kept (removing it is penalised), a missing permission added, a conflict sent for independent review; requester and approver shown');

// ---- guide and score
await page.click('[data-tab=policy]'); if ((await page.$$('.rule')).length !== 9) await fail('9 policy rules');
const guide = await txt('.ar-main'); for (const w of ['Prepare and approve the same journal', 'Change a supplier or beneficiary', 'own access', 'Audit access', 'Service identity']) if (!guide.includes(w)) await fail('guide should include ' + w);
await page.click('[data-tab=score]'); const score = await txt('.ar-main');
if (!score.includes('Penalties') || !score.includes('Unnecessary') && !score.includes('never reviewed') && !score.includes('Removed justified access')) await fail('score should explain penalties: ' + score.slice(0, 400));
ok('policy guide lists the segregation-of-duties rules; the score shows its penalties with reasons');
await shot('access-4-score');

// ---- challenge mode and phone layout
await page.click('[data-tab=requests]'); await page.uncheck('[data-checker]'); if (!(await txt('.checker')).includes('challenge mode')) await fail('challenge mode');
await page.setViewportSize({ width: 390, height: 800 });
const ov = await page.evaluate(() => { const b = document.querySelector('#access'); return { sw: b.scrollWidth, cw: b.clientWidth, btn: Math.min(...[...b.querySelectorAll('.pcard, .act')].map((x) => x.getBoundingClientRect().height)) }; });
if (ov.sw > ov.cw + 2) await fail('phone overflow ' + JSON.stringify(ov)); if (ov.btn < 44) await fail('phone touch targets ' + ov.btn);
await shot('access-5-phone');
ok('challenge mode hides the checker; phone width: no horizontal overflow and large touch targets');
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
if (await page.$('#access')) await fail('Escape should close'); if (await S('(sc)=>sc.state.paused')) await fail('should resume');
ok('Escape returns to the facility');
const bad = errors.filter((e) => !e.includes('GPU stall') && !e.includes('swiftshader') && !e.includes('GroupMarker'));
if (bad.length) { console.error(bad.join('\n')); await browser.close(); process.exit(2); }
ok('no console errors');
await browser.close();
