const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const url = process.env.CODEGO_WEB_URL || 'https://codego-python.web.app/';
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
    console.log('Offline: shell, project recovery, real Python and animated teaching examples work after disabling network and reloading.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); }
})();
