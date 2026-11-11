// Real interpreter, Service Worker and local stdin transport; only Google is a fixture.
const { chromium, firefox, webkit } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('webapp');
let leakedInputRequests = 0;
let networkDisabled = false;
const server = http.createServer((request, response) => {
  if (networkDisabled) { request.socket.destroy(); return; }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname.includes('__codego_stdin__/')) leakedInputRequests++;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (path.relative(root, file).startsWith('..')) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});
const fixture = `export const browserLocalPersistence={}; export const getAuth=()=>({}); export const setPersistence=async()=>{};
export class GoogleAuthProvider { setCustomParameters(){} }
export const onAuthStateChanged=(auth,cb)=>setTimeout(()=>cb({uid:'interactive-input',email:'test@example.com',displayName:'Ana',emailVerified:true,providerData:[{providerId:'google.com'}]}),0);
export const signInWithPopup=async()=>{}; export const signOut=async()=>{};`;
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = process.env.CODEGO_WEB_URL || `http://127.0.0.1:${server.address().port}`;
    const name = process.env.CODEGO_WEB_ENGINE || 'chromium';
    browser = await ({ chromium, firefox, webkit })[name].launch({ headless: true, executablePath: process.env.CODEGO_BROWSER_BINARY || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'text/javascript', body: route.request().url().endsWith('firebase-app.js') ? 'export const initializeApp = config => config;' : fixture }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.locator('#home-screen').waitFor();
    await page.locator('#home-start').click(); await page.locator('#session-form button[type=submit]').click();
    const input = page.locator('#terminal-stdin-input');
    const transcript = page.locator('#terminal-transcript');
    async function start(code) {
      await page.locator('#code-editor').fill(code);
      await page.locator('#run').click();
      await page.locator('#stop').waitFor({ state: 'visible' });
    }
    async function answer(prompt, value) {
      await input.waitFor({ state: 'visible', timeout: 120000 });
      await page.waitForFunction(text => document.getElementById('terminal-transcript').textContent.includes(text), prompt);
      await page.waitForFunction(() => !document.getElementById('terminal-stdin-input').disabled);
      assert(await input.evaluate(el => document.activeElement === el), 'Input must receive focus beside the prompt');
      await input.fill(value); await input.press('Enter');
    }
    async function finished() {
      await page.locator('#stop').waitFor({ state: 'hidden', timeout: 120000 });
      assert(await input.isHidden()); assert(await input.isDisabled());
      const result = await transcript.textContent();
      assert(!/Traceback|EOFError|Revisa tu código/.test(result), result);
      return result;
    }
    await start('nombre = input("Nombre: ")\nvacio = input("Opcional: ")\nedad = int(input("Edad: "))\nprint(repr((nombre, vacio, edad)))');
    await answer('Nombre: ', 'José Muñoz 🐍'); await answer('Opcional: ', ''); await answer('Edad: ', '18');
    assert.match(await finished(), /\('José Muñoz 🐍', '', 18\)/);
    assert.match(await transcript.textContent(), /Nombre: José Muñoz 🐍\nOpcional: \nEdad: 18\n/);
    console.log(`${name}: consecutive input, Unicode, empty lines, integers, focus and echo passed.`);

    await start('def preguntar(n):\n    return [input(f"Dato {i}: ") for i in range(n)]\nprint(preguntar(3))');
    for (let i = 0; i < 3; i++) await answer(`Dato ${i}: `, `valor ${i}`);
    assert.match(await finished(), /\['valor 0', 'valor 1', 'valor 2'\]/);
    await start('import sys\nprint("Una línea: ", end="", flush=True)\nprint(repr(sys.stdin.readline()))');
    await answer('Una línea: ', 'café'); assert.match(await finished(), /'café\\n'/);
    await start('import sys\nprint("Hasta EOF:", flush=True)\nprint(repr(sys.stdin.read()))');
    await answer('Hasta EOF:', 'primera');
    await page.waitForFunction(() => document.getElementById('terminal-transcript').textContent.includes('primera\n') && !document.getElementById('terminal-stdin-input').disabled);
    await input.press('Control+d'); assert.match(await finished(), /'primera\\n'/);
    console.log(`${name}: functions, comprehensions, sys.stdin.readline/read and EOF passed.`);

    await start('respuesta = input("Antes de limpiar: ")\nprint("Recibido:", respuesta)');
    await input.waitFor({ state: 'visible' }); await page.locator('#clear-terminal').click();
    assert(await input.isVisible()); await input.fill('sigue'); await input.press('Enter');
    assert.match(await finished(), /Recibido: sigue/);
    await start('input("Espera cancelable: ")'); await input.waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('#stop').click(); await page.locator('#stop').waitFor({ state: 'hidden' });
    assert(await input.isHidden()); assert(await input.isDisabled());
    await start('print("Nueva ejecución:", input("Otra: "))'); await answer('Otra: ', 'limpia');
    assert.match(await finished(), /Nueva ejecución: limpia/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-pane=editor]').click();
    await start('nombre = input("En el celular: ")\nprint("Hola", nombre)');
    await input.waitFor({ state: 'visible' });
    assert.equal(await page.locator('.workspace').getAttribute('data-pane'), 'terminal');
    await input.fill('María');
    await page.setViewportSize({ width: 390, height: 440 }); // available space with a mobile keyboard
    const bounds = await input.boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 440, 'Mobile input must remain inside the visible console');
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: `output/playwright/web-input-mobile-${name}.png` });
    await input.press('Enter'); assert.match(await finished(), /Hola María/);
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log(`${name}: clear, stop, rerun and mobile keyboard layout passed.`);

    // The execution budget excludes time spent waiting for the student, but
    // still stops CPU-bound loops. Use a short budget after warming Python.
    const earlyStop = await page.evaluate(async () => {
      const engine = new CodeGOSDK.WebExecutionEngine();
      let release;
      engine.prepareInput = () => new Promise(resolve => { release = resolve; });
      const pending = engine.run('print("no debe ejecutarse")');
      engine.stop();
      const result = await pending;
      release(); await Promise.resolve();
      return { stopped: result.stopped, workerCreated: Boolean(engine.worker) };
    });
    assert(earlyStop.stopped && !earlyStop.workerCreated, 'Stop must also cancel preparation immediately');
    await page.evaluate(async () => {
      window.budgetOutput = '';
      window.budgetEngine = new CodeGOSDK.WebExecutionEngine({ onOutput: text => { window.budgetOutput += text; } });
      await window.budgetEngine.run('print("warm")');
      window.budgetEngine.timeoutMs = 1000;
      window.budgetResult = window.budgetEngine.run('print(input("Espera: "))');
    });
    await page.waitForFunction(() => Boolean(window.budgetEngine.waiting));
    await page.waitForTimeout(1800);
    assert(await page.evaluate(() => Boolean(window.budgetEngine.pending)), 'Human response time must not consume the execution timeout');
    await page.evaluate(() => window.budgetEngine.sendInput('a tiempo'));
    assert.equal((await page.evaluate(() => window.budgetResult)).exitCode, 0);
    assert((await page.evaluate(() => window.budgetEngine.run('while True: pass'))).stopped, 'CPU timeout must resume after input');
    console.log(`${name}: input wait does not time out; computation still has a bounded runtime.`);

    // Keep the fixture identity consistent in this temporary profile after a real offline reload.
    await page.evaluate(async auth => {
      const cache = await caches.open('codego-runtime-py0277-firebase1270');
      const response = source => new Response(source, { headers: { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' } });
      await cache.put('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js', response('export const initializeApp = config => config;'));
      await cache.put('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js', response(auth));
    }, fixture);
    // Two tabs can run the same program without receiving each other's input.
    await page.locator('#code-editor').fill('print("Solo esta pestaña:", input("Pestaña: "))');
    await page.waitForFunction(() => document.getElementById('save-status').textContent === 'Guardado en este equipo');
    const second = await context.newPage(); await second.goto(url); await second.locator('#app').waitFor();
    await page.locator('#run').click(); await input.waitFor({ state: 'visible' });
    await second.locator('#run').click(); await second.locator('#terminal-stdin-input').waitFor({ state: 'visible', timeout: 120000 });
    await second.locator('#terminal-stdin-input').fill('segunda'); await second.locator('#terminal-stdin-input').press('Enter');
    await second.locator('#stop').waitFor({ state: 'hidden' });
    assert.match(await second.locator('#terminal-transcript').textContent(), /Solo esta pestaña: segunda/);
    assert(await input.isVisible(), 'Another tab must not answer this input');
    // Bring the first page forward to restore focus before answering.
    await page.bringToFront(); await input.fill('primera'); await input.press('Enter');
    const ownOutput = await finished(); assert.match(ownOutput, /Solo esta pestaña: primera/); assert(!ownOutput.includes('segunda'));
    await second.close();
    console.log(`${name}: simultaneous tabs keep separate input channels.`);
    await page.locator('#code-editor').fill('print("Sin internet:", input("Tu respuesta: "))');
    await page.waitForFunction(() => document.getElementById('save-status').textContent === 'Guardado en este equipo');
    // setOffline can reject SW-controlled navigations in Firefox/WebKit before
    // dispatching a fetch event. For local runs also cut the origin transport;
    // this checks a real unavailable server without that emulation shortcut.
    if (name === 'chromium' || process.env.CODEGO_WEB_URL) await context.setOffline(true);
    else {
      networkDisabled = true;
      await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
    }
    await page.reload(); await page.locator('#app').waitFor();
    await page.locator('#run').click(); await answer('Tu respuesta: ', 'sí funciona');
    assert.match(await finished(), /Sin internet: sí funciona/);
    assert.equal(leakedInputRequests, 0, 'Student input must stay in the local Service Worker and never reach Hosting');
    assert.deepEqual(errors, []);
    console.log(`${name}: offline reload, Python input and local-only responses passed.`);
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
