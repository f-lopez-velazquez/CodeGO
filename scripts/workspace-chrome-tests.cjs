/* Verify the visible workspace, including menus at actual layout/zoom boundaries. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../src/renderer');
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => { if (error) return response.writeHead(404).end(); response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream'); response.end(data); });
});
(async () => {
  let browser, count = 0;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: process.env.CODEGO_BROWSER_BINARY || undefined });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof enterIdeWorkspace === 'function');
    await page.evaluate(async () => {
      window.electronAPI = { listWorkspace: async () => ({ success: true, tree: [{ name: 'Test.py', path: 'Test.py', type: 'file', editable: true }] }), readFile: async () => ({ success: true, content: 'print("hola)\n' }), diagnoseCode: async () => ({ success: false, line: 1, column: 7, title: 'La cadena quedó abierta', hint: 'El texto necesita una comilla de cierre.', example: 'print("hola")', actions: ['Cierra las comillas.'] }), saveFile: async () => ({ success: true }), recordWorkspaceEvent: async () => ({ success: true }), setInternalInteraction: async () => ({ success: true }) };
      state.environmentReady = true; state.workspaceSelected = true; state.workspaceName = 'Documentos'; state.workspacePath = '/proyectos/Documentos';
      state.student = { name: 'Francisco López Velázquez', id: '0202', subject: 'Programación: cadenas, variables y decisiones', examId: 'PARCIAL-3-2026', mode: 'activity' };
      DOM.navStudentLabel.textContent = state.student.name + ' · ' + state.student.id; DOM.navSubjectLabel.textContent = state.student.subject;
      setSessionMode('activity'); enterIdeWorkspace(); await openFileInEditor('Test.py');
      scheduleSyntaxDiagnostic();
    });
    await page.locator('#editor-diagnostic').waitFor({ state: 'visible' });
    fs.mkdirSync('output/playwright', { recursive: true });
    async function bounds(selector) {
      await page.locator(selector).waitFor({ state: 'visible' });
      const box = await page.locator(selector).boundingBox();
      assert(box, `${selector} is not visible`);
      const size = page.viewportSize();
      assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `${selector} clipped: ${JSON.stringify({ box, size })}`);
      return box;
    }
    for (const mode of ['activity', 'task', 'exam']) {
      await page.evaluate(mode => { setSessionMode(mode); state.student.mode = mode; enterIdeWorkspace(); }, mode);
      for (const width of [1440, 1024, 768, 390]) for (const zoom of width < 600 ? [1] : [1, 1.4, 1.8]) {
        await page.setViewportSize({ width, height: width < 600 ? 740 : 700 });
        await page.evaluate(zoom => setAppZoom(zoom), zoom);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const headerOverlap = await page.evaluate(() => { const nodes = ['.nav-left','.nav-center','.nav-right'].map(q => document.querySelector('.workspace-header '+q).getBoundingClientRect()); return nodes.some((a,i) => nodes.slice(i+1).some(b => a.left < b.right-1 && a.right > b.left+1 && a.top < b.bottom-1 && a.bottom > b.top+1)); });
        assert.equal(headerOverlap, false, `Header groups overlap: ${mode}/${width}/${zoom}`);
        await bounds('.workspace-header'); await bounds('#btn-run-code'); await bounds('#workspace-tools-menu > summary');
        const label = await page.locator('#nav-mode-text').textContent();
        assert.equal(label, { activity: 'Modo libre', task: 'Tarea', exam: 'Examen' }[mode]);
        const overlaps = await page.evaluate(() => {
          const elements = [...document.querySelectorAll('.workspace-header .nav-right > button, .workspace-header .nav-right > details')].filter(el => el.checkVisibility()).map(el => ({ id: el.id, r: el.getBoundingClientRect() }));
          return elements.some((a, i) => elements.slice(i + 1).some(b => a.r.left < b.r.right - 1 && a.r.right > b.r.left + 1 && a.r.top < b.r.bottom - 1 && a.r.bottom > b.r.top + 1));
        });
        assert.equal(overlaps, false, `Header overlaps: ${mode}/${width}/${zoom}`);
        if (mode === 'activity') { assert(await page.locator('#btn-finish-exam').isHidden()); assert(await page.locator('#btn-submit-task').isHidden()); assert(await page.locator('#btn-finish-exam').isDisabled()); assert(await page.locator('#btn-submit-task').isDisabled()); }
        else { await bounds(mode === 'exam' ? '#btn-finish-exam' : '#btn-submit-task'); assert(await page.locator('#btn-export-workspace').isHidden()); }
        await page.locator('#workspace-tools-menu > summary').click();
        await bounds('#workspace-tools-panel');
        if (mode !== 'exam') {
          const pkg = page.locator('#btn-open-pkg-manager-ide'); await pkg.scrollIntoViewIfNeeded();
          assert(await pkg.isVisible(), 'Library tools remain available in compact layouts');
          const geometry = await pkg.evaluate(el => { const text = el.querySelector('span'); return { label: text.getBoundingClientRect().height, font: parseFloat(getComputedStyle(text).lineHeight) * el.getBoundingClientRect().width / el.offsetWidth, width: el.getBoundingClientRect().width }; });
          assert(geometry.width > 120 && geometry.label <= geometry.font * 1.5, `Menu text broken into letters: ${JSON.stringify(geometry)}`);
          await page.locator('#btn-theme-menu').click();
          assert(await page.locator('#theme-dropdown-menu').isVisible()); await bounds('#workspace-tools-panel');
          await page.locator('.theme-opt[data-theme="theme-paper"]').click();
          assert(await page.locator('#workspace-tools-panel').isVisible(), 'Appearance selections stay in their menu');
          await page.locator('.theme-opt[data-theme="theme-obsidian"]').click();
          await page.locator('#btn-theme-menu').click();
        }
        await page.keyboard.press('Escape');
        await page.locator('#workspace-tools-panel').waitFor({ state: 'hidden' });
        await page.locator('#workspace-session-menu > summary').click();
        await bounds('#workspace-session-panel');
        assert.match(await page.locator('#workspace-session-panel').textContent(), /Francisco López Velázquez/);
        await page.keyboard.press('Escape');
        await page.locator('.terminal-options-menu > summary').click(); await bounds('.terminal-quick-actions'); await page.keyboard.press('Escape');
        if (await page.locator('.explorer-options-menu > summary').isVisible()) { await page.locator('.explorer-options-menu > summary').click(); await bounds('.explorer-quick-actions'); await page.keyboard.press('Escape'); }
        if (await page.locator('#editor-diagnostic').isVisible()) {
          await bounds('#btn-editor-diagnostic-help'); await bounds('#btn-editor-diagnostic-line');
          const diagnosticSize = await page.locator('#editor-diagnostic').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
          assert(diagnosticSize.content <= diagnosticSize.width + 1, 'Error actions must not overflow the editor');
        }
        if (zoom === 1 && [1440, 390].includes(width)) await page.screenshot({ path: `output/playwright/workspace-${mode}-${width}-1618.png` });
        count++;
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { setAppZoom(1); setSessionMode('task'); enterIdeWorkspace(); lockExamEnvironment(); });
    assert(await page.locator('#btn-submit-task').isHidden()); assert(await page.locator('#btn-finish-exam').isHidden());
    await bounds('#btn-export-workspace'); await bounds('#nav-waiting-review-badge');
    await page.screenshot({ path: 'output/playwright/workspace-sealed-1618.png' });
    await page.evaluate(() => { setSessionMode('activity'); state.isTaskSubmitted = false; state.isExamSubmitted = false; enterIdeWorkspace(); clearTerminal(); });
    await page.locator('#workspace-tools-menu > summary').click(); await page.locator('#btn-open-pkg-manager-ide').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/workspace-tools-1618.png' }); await page.keyboard.press('Escape');
    await page.locator('#btn-export-workspace').hover();
    await page.locator('#codego-tooltip').waitFor({ state: 'visible' }); await bounds('#codego-tooltip');
    const tip = await page.locator('#codego-tooltip').boundingBox(); assert(tip.width <= 282 && tip.height <= 80, 'Tooltips must be compact and bounded');
    assert.equal(await page.locator('#btn-export-workspace').getAttribute('title'), null, 'Native oversized tooltip suppressed');
    await page.keyboard.press('Escape'); await page.locator('#codego-tooltip').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`Workspace: ${count} mode/viewport/zoom combinations; header overlap, readable labels, full session details, appearance, bounded menus and tooltips passed.`);
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
