// Reproduce an existing Chrome session after a reload that bypasses its SW.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('webapp');
const fixture = `export const browserLocalPersistence={};export const getAuth=()=>({});export const setPersistence=async()=>{};
export class GoogleAuthProvider{setCustomParameters(){}}
export const onAuthStateChanged=(auth,cb)=>setTimeout(()=>cb({uid:'recovery-test',email:'test@example.com',displayName:'Ana',emailVerified:true,providerData:[{providerId:'google.com'}]}),0);
export const signInWithPopup=async()=>{};export const signOut=async()=>{};`;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/legacy-sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    return response.end("self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));");
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (path.relative(root, file).startsWith('..')) return response.writeHead(403).end();
  fs.readFile(file, (error, content) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    response.end(content);
  });
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = process.env.CODEGO_WEB_URL || `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CODEGO_BROWSER_BINARY || undefined });
    const context = await browser.newContext();
    await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'text/javascript', body: route.request().url().endsWith('firebase-app.js') ? 'export const initializeApp=config=>config;' : fixture }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.locator('#home-screen').waitFor();
    await page.locator('#home-start').click(); await page.locator('#session-form button[type=submit]').click();
    const source = '# Tu primer programa\nprint("Hola, Python")\nx = input("ingrese: ")\nprint("recibido:", x)';
    await page.locator('#code-editor').fill(source);
    await page.waitForFunction(() => document.getElementById('save-status').textContent === 'Guardado en este equipo');
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const before = await page.evaluate(() => CodeGOStore.load('recovery-test'));
    const cdp = await context.newCDPSession(page);
    await Promise.all([page.waitForEvent('load'), cdp.send('Page.reload', { ignoreCache: true })]);
    await page.locator('#app').waitFor();
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null, 'The fixture must reproduce an uncontrolled page with an existing registration');
    assert(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).active)));
    assert.equal(await page.locator('#code-editor').inputValue(), source);
    await page.locator('#run').click();
    if (process.env.CODEGO_EXPECT_OLD_FAILURE) {
      await page.waitForFunction(() => document.getElementById('terminal-transcript').textContent.includes('Recarga CodeGO para activar'), null, { timeout: 20000 });
      console.log('Reproduced: existing active SW + uncontrolled reload leaves input stuck asking for another reload.');
      return;
    }
    await page.locator('#terminal-stdin-input').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('#terminal-stdin-input').fill('José'); await page.locator('#terminal-stdin-input').press('Enter');
    await page.locator('#stop').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#terminal-transcript').textContent(), /recibido: José/);
    // An old unversioned execution worker must never be mixed into this UI.
    await page.evaluate(async () => {
      const shell = (await caches.keys()).find(name => name.startsWith('codego-shell-'));
      const cache = await caches.open(shell);
      await cache.put(new URL('execution-worker.js', location.href), new Response('onmessage=()=>postMessage({type:"finished",exitCode:1,duration:0});', { headers: { 'Content-Type': 'text/javascript' } }));
    });
    await page.reload(); await page.locator('#app').waitFor();
    await page.locator('#run').click();
    await page.locator('#terminal-stdin-input').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('#terminal-stdin-input').fill('versión correcta'); await page.locator('#terminal-stdin-input').press('Enter');
    await page.locator('#stop').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#terminal-transcript').textContent(), /recibido: versión correcta/);
    if (!process.env.CODEGO_WEB_URL) {
      await page.evaluate(() => navigator.serviceWorker.register('legacy-sw.js', { scope: '/' }));
      await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/legacy-sw.js'));
      await page.locator('#run').click();
      await page.locator('#terminal-stdin-input').waitFor({ state: 'visible', timeout: 120000 });
      await page.locator('#terminal-stdin-input').fill('actualizado'); await page.locator('#terminal-stdin-input').press('Enter');
      await page.locator('#stop').waitFor({ state: 'hidden' });
      assert.match(await page.locator('#terminal-transcript').textContent(), /recibido: actualizado/);
      assert(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL.endsWith('/sw.js')));
    }
    await page.evaluate(() => {
      window.originalRegister = navigator.serviceWorker.register;
      navigator.serviceWorker.register = async () => { throw new DOMException('Registro bloqueado', 'SecurityError'); };
    });
    await page.locator('#run').click(); await page.locator('#stop').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#error-title').textContent(), 'La consola no pudo iniciarse');
    assert.equal((await page.locator('#error-example').textContent()).trim(), '');
    assert.equal(await page.locator('#code-editor').inputValue(), source);
    await page.evaluate(() => { navigator.serviceWorker.register = window.originalRegister; });
    await page.locator('#run').click();
    await page.locator('#terminal-stdin-input').waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('#terminal-stdin-input').fill('reintento'); await page.locator('#terminal-stdin-input').press('Enter');
    await page.locator('#stop').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#terminal-transcript').textContent(), /recibido: reintento/);
    const after = await page.evaluate(() => CodeGOStore.load('recovery-test'));
    assert.equal(after.currentProject, before.currentProject);
    assert.deepEqual(after.projects.map(project => project.files), before.projects.map(project => project.files));
    assert.deepEqual(errors, []);
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/web-stdin-recovered.png' });
    console.log('Recovery: force reload reconnects stdin, old execution cache is bypassed, an old SW upgrades automatically, and account/projects/code survive unchanged.');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
