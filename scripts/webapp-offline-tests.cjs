const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.CODEGO_WEB_URL || 'https://codego-ide.web.app/';
// Identity is simulated in an ephemeral browser profile. Shell, SW, storage and Python are real.
const fixture = `export const browserLocalPersistence={};
export const getAuth=()=>({}); export const setPersistence=async()=>{};
export class GoogleAuthProvider { setCustomParameters(){} }
export const onAuthStateChanged=(auth,cb)=>setTimeout(()=>cb({uid:'offline-test',email:'test@example.com',displayName:'Ana',emailVerified:true,providerData:[{providerId:'google.com'}]}),0);
export const signInWithPopup=async()=>{}; export const signOut=async()=>{};`;
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CODEGO_BROWSER_BINARY || undefined, headless: true });
    const context = await browser.newContext();
    await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'text/javascript', body: route.request().url().endsWith('firebase-app.js') ? 'export const initializeApp = config => config;' : fixture }));
    const page = await context.newPage();
    await page.goto(url);
    await page.locator('#home-screen').waitFor();
    await page.locator('#home-start').click();
    await page.locator('#session-dialog').waitFor();
    await page.locator('#session-form button[type=submit]').click();
    await page.locator('#code-editor').fill('print("Python sin red")');
    async function execute() {
      await page.locator('#run').click();
      await page.locator('#stop').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.getElementById('stop').hidden, { timeout: 120000 });
      assert.match(await page.locator('#terminal-transcript').textContent(), /Python sin red/);
    }
    await execute();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // Keep the simulated identity consistent in this ephemeral profile. Playwright
    // routes do not intercept the Service Worker's own network/cache requests.
    await page.evaluate(async authSource => {
      const key = (await caches.keys()).find(name => name.startsWith('codego-runtime-'));
      if (!key) throw new Error('Runtime cache was not created.');
      const cache = await caches.open(key);
      const response = source => new Response(source, { headers: { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' } });
      await cache.put('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js', response('export const initializeApp = config => config;'));
      await cache.put('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js', response(authSource));
    }, fixture);
    await context.setOffline(true);
    await page.reload();
    await page.locator('#app').waitFor();
    assert.equal(await page.locator('#code-editor').inputValue(), 'print("Python sin red")');
    await execute();
    await page.locator('#open-course').click();
    await page.locator('[data-lesson-step=examples]').click();
    const example = page.locator('.example-demo').first();
    await example.locator('[data-demo-action=finish]').click();
    assert.equal((await example.locator('.demo-console pre').textContent()).trim(), require('../webapp/course').lessons[0].examples[0].output.trim());
    await page.locator('#close-course').click();
    await page.locator('#open-session').click();
    await page.locator('input[name=mode][value=task]').check();
    await page.locator('#session-form button[type=submit]').click();
    await page.locator('#code-editor').fill('print("Entrega sin red")');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.locator('#focus-dialog').waitFor();
    await page.waitForFunction(() => document.getElementById('save-status').textContent === 'Guardado en este equipo');
    await page.reload();
    await page.locator('#focus-dialog').waitFor();
    await page.locator('#restore-protection').click();
    await page.waitForFunction(() => document.fullscreenElement !== null);
    assert(await page.locator('#code-editor').evaluate(el => el.readOnly), 'Offline reload keeps the incident locked');
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await page.clock.runFor(29999); assert(await page.locator('#resume').isDisabled());
    await page.clock.runFor(201); await page.locator('#resume').click();
    const downloaded = page.waitForEvent('download');
    await page.locator('#submit').click(); await page.locator('#confirm-dialog button[value=confirm]').click();
    const signedText = fs.readFileSync(await (await downloaded).path(), 'utf8');
    assert(await page.evaluate(value => CodeGOEvidence.verify(value), JSON.parse(signedText)));
    assert(await page.locator('#code-editor').evaluate(el => el.readOnly));
    const reopened = await context.newPage(); await reopened.goto(url); await reopened.locator('#app').waitFor();
    assert(await reopened.locator('#code-editor').evaluate(el => el.readOnly), 'Sealed state survives offline restart');
    assert.equal(await reopened.locator('#code-editor').inputValue(), 'print("Entrega sin red")');
    await reopened.close();
    console.log('Offline: shell, project recovery, real Python and animated teaching examples work after disabling network and reloading; pending incidents survive reload and signed deliveries remain locked after offline restart.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); }
})();
