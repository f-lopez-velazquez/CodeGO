const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const rendererRoot = path.resolve('src/renderer');
const output = path.resolve('docs/verification');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(rendererRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (path.relative(rendererRoot, file).startsWith('..')) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'lobby-current.png') });
    await page.evaluate(() => {
      document.body.classList.add('environment-setup-required');
      DOM.modalAutoInstaller.classList.remove('hidden');
      DOM.installerProgressBar.style.width = '67%';
      DOM.installerPercentLabel.textContent = '67%';
      DOM.installerCurrentStepLabel.textContent = setupProgressLabel(3);
      updateAutoInstallerStep(1, DOM.stepItemVc, DOM.stepBadgeVc, 3);
      updateAutoInstallerStep(2, DOM.stepItemPy, DOM.stepBadgePy, 3);
      updateAutoInstallerStep(3, DOM.stepItemVenv, DOM.stepBadgeVenv, 3);
      updateAutoInstallerStep(4, DOM.stepItemLibs, DOM.stepBadgeLibs, 3);
    });
    await page.screenshot({ path: path.join(output, 'setup-current.png') });
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.screenshot({ path: path.join(output, 'setup-current-compact.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      document.body.classList.remove('environment-setup-required');
      DOM.modalAutoInstaller.classList.add('hidden');
      setSessionMode('activity');
      state.workspaceSelected = true;
      state.workspaceName = 'Fundamentos';
      enterIdeWorkspace();
      DOM.navSubjectLabel.textContent = 'Fundamentos de programación';
      DOM.navStudentLabel.textContent = 'Práctica guiada';
      state.openTabs = [{ path: 'main.py', name: 'main.py', content: '', isDirty: false }];
      state.activeFilePath = 'main.py';
      renderTabs();
      updateEditorEmptyState();
      state.filesTree = [
        { name: 'ejercicios', path: 'ejercicios', type: 'directory', children: [
          { name: 'condicionales.py', path: 'ejercicios/condicionales.py', type: 'file', editable: true }
        ]},
        { name: 'main.py', path: 'main.py', type: 'file', editable: true },
        { name: 'recursos', path: 'recursos', type: 'directory', children: [] }
      ];
      renderFileTree(state.filesTree);
      DOM.codeTextarea.value = 'nombre = input("¿Cómo te llamas? ")\nprint(f"Hola, {nombre}")\n';
      handleEditorInput();
      clearTerminal();
      appendTerminalOutput('Ejecutando main.py\n', 'system');
      appendTerminalOutput('¿Cómo te llamas? ', 'stdout');
      DOM.terminalStdinInput.disabled = false;
      DOM.terminalStdinInput.value = 'Ana';
      resizeTerminalInput();
    });
    await page.screenshot({ path: path.join(output, 'ide-current.png') });
    await page.evaluate(() => {
      sounds.startAlarmSiren = () => {};
      sounds.stopAlarmSiren = () => {};
      state.workspaceSessionActive = true;
      handleSecurityViolation({ timestamp: '10:24:18', durationSeconds: 2.4, totalIncidents: 1 });
      DOM.modalFocusWarning.style.animationPlayState = 'paused';
      DOM.modalFocusWarning.style.animationDelay = '-0.1s';
    });
    await page.screenshot({ path: path.join(output, 'warning-current.png') });
    console.log(`Capturas guardadas en ${output}`);
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
