const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('webapp');
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : decodeURIComponent(name)));
  if (path.relative(root, file).startsWith('..')) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'text/plain');
    response.end(data);
  });
});
// Only identity-provider responses are fixtures. Project storage and Python execute for real.
const authFixture = `let observer;
const account = { uid: 'test-student', email: 'alumna@example.com', displayName: 'Ana', emailVerified: true, providerData: [{ providerId: 'google.com' }] };
export const browserLocalPersistence = {};
export const getAuth = () => ({});
export const setPersistence = async () => {};
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (auth, callback) => { observer = callback; setTimeout(() => callback(localStorage.getItem('test-auth') ? account : null), 0); };
export const signInWithPopup = async () => { localStorage.setItem('test-auth', 'yes'); observer(account); };
export const signOut = async () => { localStorage.removeItem('test-auth'); observer(null); };`;
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CODEGO_BROWSER_BINARY || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'text/javascript', body: route.request().url().endsWith('firebase-app.js') ? 'export const initializeApp = config => config;' : authFixture }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await page.locator('#home-screen').waitFor();
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.waitForFunction(() => [...document.querySelectorAll('#home-screen img')].every(image => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: 'output/playwright/webapp-home-1615.png' });
    await page.locator('#home-start').click();
    await page.locator('#session-dialog').waitFor();
    await page.locator('#student-id').fill('A-01');
    await page.locator('#student-id').press('Enter');
    await page.locator('#session-dialog').waitFor({ state: 'hidden' });
    assert(await page.locator('#submit').isHidden(), 'Free mode must hide delivery');
    assert(await page.locator('#submit').isDisabled());
    await page.locator('#code-editor').fill('nombre = input("Nombre: ")\nprint("Hola", nombre)\n');
    await page.locator('#stdin').evaluate(el => { el.parentElement.open = true; });
    await page.locator('#stdin').fill('Ana');
    await page.waitForFunction(() => document.getElementById('save-status').textContent === 'Guardado en este equipo');
    await page.reload();
    await page.locator('#app').waitFor();
    assert.equal(await page.locator('#code-editor').inputValue(), 'nombre = input("Nombre: ")\nprint("Hola", nombre)\n');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.getElementById('stop').hidden, { timeout: 120000 });
    assert.match(await page.locator('#terminal-transcript').textContent(), /Hola Ana/);
    await page.locator('#code-editor').fill('while True:\n    print("hola")\n');
    await page.locator('#run').click();
    await page.locator('#stop').click();
    await page.locator('#stop').waitFor({ state: 'hidden' });
    await page.locator('#open-course').click();
    await page.locator('[data-lesson-step=quiz]').click();
    const question = page.locator('.quiz-question').first();
    await question.locator('input[value="0"]').check();
    await question.getByRole('button', { name: 'Comprobar respuesta' }).click();
    assert.match(await question.locator('.quiz-feedback').textContent(), /Revisa tu respuesta/);
    await question.locator('input[value="1"]').check();
    await question.getByRole('button', { name: 'Comprobar respuesta' }).click();
    assert.match(await question.locator('.quiz-feedback').textContent(), /Correcto/);
    await page.locator('[data-lesson-step=practice]').click();
    await page.getByRole('button', { name: 'Practicar este ejercicio' }).first().click();
    await page.locator('#code-editor').fill('nombre = "Ana"\nedad = 18\nprint(nombre, edad)\n');
    await page.locator('#run').click();
    await page.locator('#evaluation').waitFor({ state: 'visible', timeout: 120000 });
    assert.match(await page.locator('#evaluation').textContent(), /2 de 2/);
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/webapp-desktop.png' });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      if (width < 720) {
        await page.locator('.mobile-tabs [data-pane=editor]').click();
        assert(await page.locator('#code-editor').isVisible());
        await page.screenshot({ path: `output/playwright/webapp-${width}.png` });
        await page.locator('.mobile-tabs [data-pane=files]').click();
        assert(await page.locator('#file-list').isVisible());
        await page.locator('.mobile-tabs [data-pane=course]').click();
        assert(await page.locator('#lesson-content').isVisible());
        await page.locator('[data-lesson-step=examples]').click();
        assert.equal(await page.locator('.example-card').count(), 2);
        await page.screenshot({ path: `output/playwright/webapp-course-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#learning-assessments').click();
    assert.equal(await page.locator('#lesson-content .quiz-question').count(), 12);
    assert(await page.getByRole('button', { name: 'Calificar mis respuestas' }).isVisible());
    const questions = require('../webapp/course').assessmentQuestions(require('../webapp/course').assessments[0]);
    for (let index = 0; index < questions.length; index++) await page.locator(`#lesson-content input[name="assessment-${index}"][value="${questions[index].answer}"]`).check();
    await page.getByRole('button', { name: 'Calificar mis respuestas' }).click();
    assert.match(await page.locator('#assessment-result').textContent(), /100%/);
    await page.screenshot({ path: 'output/playwright/webapp-assessment.png' });
    await page.locator('#close-course').click();
    await page.locator('#open-session').click();
    await page.locator('input[name=mode][value=task]').check();
    await page.locator('#session-form button[type=submit]').click();
    const pasteAllowed = await page.locator('#code-editor').evaluate(el => el.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true })));
    assert.equal(pasteAllowed, false, 'Task must block paste');
    // Deadline tests use controlled page time, independent of background browser throttling.
    await page.clock.install();
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await page.locator('#focus-dialog').waitFor();
    await page.clock.runFor(11999);
    assert(await page.locator('#resume').isDisabled());
    await page.clock.runFor(201);
    assert(await page.locator('#resume').isEnabled());
    await page.locator('#resume').click();
    assert(await page.locator('#focus-dialog').isHidden());
    const revisionProtection = await page.evaluate(async () => {
      const snapshot = await CodeGOStore.load('test-student');
      await CodeGOStore.save('test-student', snapshot);
      try { await CodeGOStore.save('test-student', snapshot); return false; }
      catch (error) { return /Otra pestaña/.test(error.message); }
    });
    assert(revisionProtection, 'An old tab must not overwrite a newer revision');
    assert.deepEqual(errors, []);
    console.log('Web: Google fixture, IndexedDB recovery, real Python input, stop, course assessment, mobile panes, clipboard and 12-second deadline passed.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); server.close(); }
})();
