const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('webapp');
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="site.css"><main style="max-width:880px;padding:16px;margin:auto" id="lesson-content"></main><script src="course-content.js"></script><script src="course.js"></script><script src="editor.js"></script><script src="example-traces.js"></script><script src="example-player.js"></script><script>
let player;
window.showExample = (key = 'for-loops:0', autoplay = false) => {
  player?.destroy();
  const [lessonId,index] = key.split(':');
  const example = CodeGOCourse.lessons.find(lesson => lesson.id === lessonId).examples[Number(index)];
  player = createCodeGOExamplePlayer({ key, example, trace: CodeGOExampleTraces.examples[key], autoplay });
  document.getElementById('lesson-content').replaceChildren(player.element);
};
showExample();
</script></html>`;
const server = http.createServer((request, response) => {
  const route = new URL(request.url, 'http://localhost').pathname;
  if (route === '/') return response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  const file = path.resolve(root, '.' + route);
  if (path.relative(root, file).startsWith('..')) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'text/plain' }).end(data);
  });
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: process.env.CODEGO_BROWSER_BINARY || undefined });
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const demo = page.locator('.example-demo');
    const control = action => demo.locator(`[data-demo-action="${action}"]`);
    await control('play').click(); await page.clock.runFor(200);
    assert.equal(await demo.getAttribute('data-phase'), 'typing');
    const partial = await demo.locator('.demo-code-text').allTextContents();
    assert(partial.join('').trim().length > 0 && partial.join('').trim().length < 60, 'Typing must reveal characters gradually');
    await control('play').click(); await page.clock.runFor(3000);
    assert.deepEqual(await demo.locator('.demo-code-text').allTextContents(), partial, 'Pause must freeze the typewriter');
    await control('next').click();
    assert.equal(await demo.getAttribute('data-step'), '1');
    assert.equal(await demo.locator('.demo-code-row.executing').count(), 1);
    await control('finish').click();
    assert.equal((await demo.locator('.demo-console pre').textContent()).trim(), '6');
    assert(await control('next').isDisabled());
    await control('previous').click(); assert(!(await control('next').isDisabled()));
    await demo.locator('input[type=range]').fill('0');
    assert.equal(await demo.getAttribute('data-step'), '0');
    await demo.locator('select').selectOption('2');
    await control('play').click(); await page.clock.runFor(20000);
    assert.equal(await demo.getAttribute('data-phase'), 'finished');
    assert.equal(await demo.getAttribute('data-playing'), 'false');

    await page.evaluate(() => showExample('lists:0')); await control('finish').click();
    const refs = await demo.locator('.demo-reference').allTextContents();
    assert(refs.length === 2 && refs[0] === refs[1], 'Shared lists must keep the same object reference');
    assert.match(await demo.locator('.demo-aliases').textContent(), /a y b.*comparten/);
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/animated-aliases-desktop.png' });
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => showExample('for-loops:0')); await control('finish').click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      await page.screenshot({ path: `output/playwright/animated-example-${width}.png` });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => showExample('functions:0'));
    assert.equal(await demo.getAttribute('data-phase'), 'execution');
    assert.equal(await demo.getAttribute('data-playing'), 'false');
    assert(await demo.locator('.demo-motion-note').isVisible());
    await control('next').click(); assert.equal(await demo.getAttribute('data-step'), '1');
    await control('finish').click(); assert.equal((await demo.locator('.demo-console pre').textContent()).trim(), '14');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await control('restart').click();
    await page.evaluate(() => showExample('strings:0')); await page.clock.runFor(20000);
    assert.equal(await demo.getAttribute('data-playing'), 'false', 'Changing examples must dispose the old timer');
    assert.equal(await demo.getAttribute('data-step'), '0');
    await page.evaluate(() => { showExample('for-loops:0', true); document.querySelector('[data-demo-action=finish]').click(); });
    await page.clock.runFor(500);
    assert.equal(await demo.getAttribute('data-phase'), 'finished', 'Manual controls must override autoplay before the visibility callback');
    assert.equal(await demo.getAttribute('data-playing'), 'false');
    assert.deepEqual(errors, []);
    console.log('Animated examples: typewriter, pause, steps, timeline, replay, speed, aliases, reduced motion and disposal passed at 320/390/768/1366.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { await browser?.close(); server.close(); }
})();
