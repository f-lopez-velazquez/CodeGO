async (page, baseUrl = 'http://127.0.0.1:8765') => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(baseUrl + '/**', route => route.continue());
  await page.clock.install();
  await page.goto(baseUrl);
  await page.evaluate(() => {
    setSessionMode('activity');
    state.workspaceSelected = true;
    state.workspaceName = 'Proyecto de prueba';
    enterIdeWorkspace();
    state.openTabs = [{ path: 'main.py', name: 'main.py', content: '', isDirty: false }];
    state.activeFilePath = 'main.py';
    renderTabs();
    updateEditorEmptyState();
  });
  await page.waitForTimeout(100);
  // Use a deterministic bridge for renderer behavior; runtime.test.js exercises real Python.
  await page.evaluate(() => {
    DOM.terminalStdinInput.disabled = false;
    appendTerminalOutput('línea\n'.repeat(150));
    window.testWrites = [];
    window.testInputs = [];
    window.electronAPI = {
      saveFile: async data => { window.testWrites.push(data); return { success: true }; },
      runPython: async () => ({ success: true }),
      sendPythonStdin: async value => { window.testInputs.push(value); return { success: true }; },
      killPython: async () => { setTimeout(() => handleExecutionFinished({ exitCode: null, signal: 'SIGKILL', duration: 1 }), 10); return { success: true }; },
      setInternalInteraction: async active => { (window.testInternalInteractions ||= []).push(active); return { success: true }; }
    };
  });
  const dragSupervision = await page.evaluate(async () => {
    const item = document.createElement('div');
    document.body.appendChild(item);
    wireTreeDragSource(item, 'main.py', 'file');
    const dataTransfer = new DataTransfer();
    item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    item.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
    await Promise.resolve();
    item.remove();
    return window.testInternalInteractions;
  });
  assert(JSON.stringify(dragSupervision) === '[true,false]', `File drag was not marked as an internal operation: ${JSON.stringify(dragSupervision)}`);
  await page.setViewportSize({width:1024,height:480});
  await page.evaluate(() => {
    state.environmentSetupRequired = true;
    state.environmentReady = false;
    document.body.classList.add('environment-setup-required');
    DOM.modalAutoInstaller.classList.remove('hidden');
    DOM.btnCloseAutoInstaller.classList.add('hidden');
    DOM.btnFinishAutoInstaller.classList.add('hidden');
  });
  await page.keyboard.press('Escape');
  assert(await page.locator('#modal-auto-installer').isVisible(), 'Mandatory first-launch setup closed with Escape');
  assert(await page.locator('#btn-close-auto-installer').isHidden() && await page.locator('#btn-finish-auto-installer').isHidden(), 'Setup grants access before completion');
  await page.locator('.auto-installer-card').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const setupGeometry = await page.locator('.auto-installer-card').boundingBox();
  assert(setupGeometry && setupGeometry.y >= 0 && setupGeometry.y + setupGeometry.height <= 480, `Setup dialog clipped: ${JSON.stringify(setupGeometry)}`);
  const setupCredits = await page.locator('.setup-credits').boundingBox();
  assert(setupCredits && setupCredits.y >= 0 && setupCredits.y + setupCredits.height <= 480, `Setup actions or credits unreachable: ${JSON.stringify(setupCredits)}`);
  await page.evaluate(() => showSetupDiagnostic({ code: 'CG-SETUP-105', title: 'Librería incompleta', summary: 'Prueba', actions: ['Reintentar'], detail: 'pip test' }));
  assert(await page.locator('#setup-error-panel').isVisible(), 'Structured setup error is not visible');
  await page.evaluate(() => {
    window.repairStrategies = [];
    window.electronAPI.prepareEnvironment = async options => {
      window.repairStrategies.push(options.strategy);
      return { success: false, error: 'simulated recovery failure' };
    };
    DOM.btnCloseAutoInstaller.classList.remove('hidden');
    DOM.btnRebuildEnvironment.classList.remove('hidden');
  });
  assert(await page.locator('#btn-close-auto-installer').isVisible(), 'Resume recovery action is not visible');
  assert(await page.locator('#btn-rebuild-environment').isVisible(), 'Alternative rebuild action is not visible');
  await page.locator('#btn-rebuild-environment').click();
  await page.waitForFunction(() => window.repairStrategies.includes('rebuild'));
  await page.locator('#btn-close-auto-installer').click();
  await page.waitForFunction(() => window.repairStrategies.includes('resume'));
  await page.evaluate(() => {
    state.isInternalModalOpen = false;
    state.environmentSetupRequired = false;
    state.environmentReady = true;
    document.body.classList.remove('environment-setup-required');
    DOM.modalAutoInstaller.classList.add('hidden');
  });
  const results = [];
  for (const size of [{width:1440,height:900}, {width:1024,height:700}, {width:768,height:600}, {width:390,height:844}, {width:1280,height:600}, {width:1024,height:480}]) {
    await page.setViewportSize(size);
    for (const zoom of size.width < 600 ? [1] : [1,1.4,1.8]) {
      await page.evaluate(value => setAppZoom(value), zoom);
      for (const layout of ['side', 'bottom']) {
        await page.evaluate(value => { state.termLayout = value; DOM.terminalPanel.style.removeProperty('--terminal-size'); updateTerminalLayout(); }, layout);
        await page.evaluate(() => focusTerminalInput());
        // CSS zoom and a flex-direction change settle on the next layout frame
        // in Chromium. Measure the interface once the user-visible frame exists,
        // rather than during the transient geometry between both operations.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const geometry = await page.evaluate(() => {
          const input = DOM.terminalStdinInput.getBoundingClientRect();
          const status = document.querySelector('.editor-statusbar').getBoundingClientRect();
          const footer = document.querySelector('.sidebar-footer').getBoundingClientRect();
          const output = DOM.terminalOutput.getBoundingClientRect();
          const run = DOM.btnRunCode.getBoundingClientRect();
          return { width: input.width, top: input.top, bottom: input.bottom, right: input.right, statusBottom: status.bottom, footerBottom: footer.bottom, outputBottom: output.bottom, runRight: run.right, height: innerHeight, viewport: innerWidth };
        });
        assert(geometry.bottom <= geometry.height + 1 && geometry.top >= 0 && geometry.right <= geometry.viewport + 1 && geometry.width >= 10, `stdin clipped: ${JSON.stringify({size,zoom,layout,geometry})}`);
        assert(Math.max(geometry.statusBottom, geometry.footerBottom, geometry.outputBottom) <= geometry.height + 1, `Footer clipped: ${JSON.stringify({size,zoom,layout,geometry})}`);
        assert(geometry.runRight <= geometry.viewport + 1, 'Run control clipped');
        results.push({ ...size, zoom, layout, result: 'pass' });
      }
    }
  }
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(() => { setAppZoom(1); state.termLayout = 'side'; updateTerminalLayout(); });
  assert(await page.locator('#btn-finish-exam').isHidden(), 'Submit visible in activity');
  assert(await page.locator('#btn-finish-exam').isDisabled(), 'Submit enabled in activity');
  await page.locator('#btn-help-shortcuts').click();
  await page.locator('#help-search').fill('Arduino');
  assert(await page.locator('.help-topic:not([hidden])').count() >= 1, 'Help search cannot find Arduino guidance');
  await page.locator('#btn-close-shortcuts').click();
  await page.evaluate(() => showRuntimeError('Traceback\n  File "main.py", line 1\npimport pygame\nSyntaxError: invalid syntax'));
  assert(await page.locator('#modal-runtime-error').isVisible(), 'Python error guide is not shown');
  assert((await page.locator('#runtime-error-title').innerText()).includes('instrucción'), 'Syntax error was not classified');
  assert((await page.locator('#runtime-error-location-label').innerText()).includes('Línea 1'), 'Python line was not detected');
  await page.locator('#btn-runtime-error-line').click();
  assert(await page.locator('.editor-line-numbers .has-error').count() === 1, 'Python error line was not highlighted');
  await page.evaluate(() => showRuntimeError('  File "main.py", line 2\n    print(1)\nIndentationError: unexpected indent'));
  assert((await page.locator('#runtime-error-title').innerText()).includes('sangría'), 'Indentation error was not classified');
  await page.locator('#btn-close-runtime-error').click();
  const editorPairs = await page.evaluate(() => {
    DOM.codeTextarea.value = 'print';
    DOM.codeTextarea.setSelectionRange(5, 5);
    DOM.codeTextarea.dispatchEvent(new KeyboardEvent('keydown', { key: '(', bubbles: true, cancelable: true }));
    const paired = DOM.codeTextarea.value === 'print()' && DOM.codeTextarea.selectionStart === 6;
    DOM.codeTextarea.dispatchEvent(new KeyboardEvent('keydown', { key: ')', bubbles: true, cancelable: true }));
    const skipped = DOM.codeTextarea.value === 'print()' && DOM.codeTextarea.selectionStart === 7;
    DOM.codeTextarea.value = '""';
    DOM.codeTextarea.setSelectionRange(1, 1);
    DOM.codeTextarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    const removed = DOM.codeTextarea.value === '';
    return { paired, skipped, removed };
  });
  assert(editorPairs.paired && editorPairs.skipped && editorPairs.removed, `Editor pairs failed: ${JSON.stringify(editorPairs)}`);
  await page.locator('#btn-toggle-term-view').click();
  assert(await page.locator('#terminal-panel').isHidden(), 'Collapse failed');
  await page.locator('#btn-run-code').click();
  assert(await page.locator('#terminal-stdin-input').isVisible(), 'Run did not reopen terminal');
  await page.evaluate(() => { clearTerminal(); appendTerminalOutput('¿Cómo te llamas? '); });
  await page.locator('#terminal-stdin-input').fill('José Muñoz');
  const inline = await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(DOM.terminalTranscript.lastChild); const prompt = range.getBoundingClientRect(); const input = DOM.terminalStdinInput.getBoundingClientRect(); return Math.abs(prompt.top - input.top) < 6 && input.left >= prompt.right - 2 && DOM.terminalOutput.contains(DOM.terminalStdinInput); });
  assert(inline, 'Input is not on the Python prompt line');
  await page.locator('#terminal-stdin-input').press('Enter');
  await page.locator('#terminal-stdin-input').press('Enter');
  assert(await page.evaluate(() => JSON.stringify(testInputs) === '["José Muñoz",""]'), 'stdin content lost');
  await page.locator('#code-textarea').focus();
  await page.evaluate(() => { appendTerminalOutput('Hola ', 'stdout'); appendTerminalOutput('mundo\n', 'stdout'); });
  assert(await page.locator('#code-textarea').evaluate(e => e === document.activeElement), 'stdout stole editor focus');
  assert((await page.locator('#terminal-output').innerText()).includes('Hola mundo'), 'Chunk boundaries created a line break');
  await page.locator('#btn-clear-term').click();
  assert(await page.locator('#term-status-badge').innerText() === 'Ejecutando', 'Clear reset running state');
  await page.locator('#btn-stop-code').click();
  await page.waitForFunction(() => document.querySelector('#terminal-stdin-input').disabled, null, { timeout: 5000 });
  assert(await page.locator('#terminal-stdin-input').isDisabled(), 'stdin enabled after stop');
  assert(await page.locator('#term-status-badge').innerText() === 'Detenido', 'Stop reported as error');
  await page.locator('#btn-maximize-term').click();
  assert(await page.locator('#editor-pane-box').isHidden(), 'Maximize failed');
  await page.locator('#btn-maximize-term').click();
  assert(await page.locator('#editor-pane-box').isVisible(), 'Restore failed');
  const before = await page.locator('#terminal-panel').boundingBox();
  await page.locator('#splitter-horizontal').focus();
  await page.keyboard.press('ArrowLeft');
  const after = await page.locator('#terminal-panel').boundingBox();
  assert(after.width > before.width, 'Keyboard resize failed');
  await page.locator('#btn-toggle-term-pos').click();
  const bottomBefore = await page.locator('#terminal-panel').boundingBox();
  await page.locator('#splitter-horizontal').focus();
  await page.keyboard.press('ArrowUp');
  assert((await page.locator('#terminal-panel').boundingBox()).height > bottomBefore.height, 'Bottom resize failed');
  const saves = await page.evaluate(async () => {
    state.openTabs = [{path:'uno.py',name:'uno.py',content:'1',isDirty:true},{path:'dos.py',name:'dos.py',content:'2',isDirty:true}];
    state.activeFilePath = 'dos.py';
    await saveAllFiles();
    const allSaved = state.openTabs.every(t => !t.isDirty) && testWrites.some(w => w.relativePath === 'uno.py');
    electronAPI.saveFile = async () => ({success:false,error:'Disco lleno'});
    state.openTabs[1].isDirty = true;
    const failure = await saveAllFiles();
    const retained = state.openTabs[1].isDirty;
    let release;
    electronAPI.saveFile = () => new Promise(resolve => { release = resolve; });
    const pending = saveCurrentFile();
    await Promise.resolve();
    state.openTabs[1].content = '3';
    release({success:true});
    await pending;
    const newerDirty = state.openTabs[1].isDirty;
    electronAPI.saveFile = async () => ({success:true});
    await saveAllFiles();
    return {allSaved,failure,retained,newerDirty};
  });
  assert(saves.allSaved && !saves.failure && saves.retained && saves.newerDirty, `Save regression: ${JSON.stringify(saves)}`);
  const bounded = await page.evaluate(() => {
    clearTerminal();
    for (let i=0;i<2000;i++) appendTerminalOutput('x'.repeat(1000) + '\n');
    return {chars:DOM.terminalTranscript.textContent.length,nodes:DOM.terminalTranscript.childElementCount};
  });
  assert(bounded.chars <= 200000 && bounded.nodes <= 1000, 'Unbounded terminal output');
  await page.locator('#btn-new-file').click();
  assert(await page.locator('#name-dialog').isVisible(), 'Native name dialog missing');
  await page.keyboard.press('Escape');
  assert(await page.locator('#name-dialog').isHidden(), 'Dialog Escape failed');
  await page.evaluate(() => { setTheme('theme-paper'); clearTerminal(); appendTerminalOutput('Nombre: José\n'); });
  const colors = await page.evaluate(() => ({output:getComputedStyle(DOM.terminalOutput).backgroundColor,text:getComputedStyle(DOM.terminalOutput.querySelector('.stdout')).color}));
  assert(colors.output === 'rgb(248, 250, 252)' && colors.text === 'rgb(15, 23, 42)', 'Light terminal theme broken');
  // Freeze browser time so runner load cannot move the 11,999 ms assertion past 12 s.
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const taskWarningSuppressed = await page.evaluate(() => {
    setSessionMode('task');
    state.workspaceSessionActive = true;
    handleSecurityViolation({type:'TEST_TASK',durationSeconds:2});
    return DOM.modalFocusWarning.classList.contains('hidden');
  });
  assert(taskWarningSuppressed, 'Task mode must never show the focus warning');
  await page.evaluate(() => {
    setTheme('theme-obsidian');
    setSessionMode('exam');
    state.examSessionActive = true;
    sounds.startAlarmSiren = () => {};
    sounds.stopAlarmSiren = () => {};
    handleSecurityViolation({type:'TEST',durationSeconds:2});
  });
  const beacon = await page.locator('#modal-focus-warning').evaluate(element => {
    const overlay = getComputedStyle(element);
    const card = getComputedStyle(element.querySelector('.modal-academic-warning-box'));
    return {
      animation: overlay.animationName,
      duration: overlay.animationDuration,
      backdrop: overlay.backdropFilter,
      cardAnimation: card.animationName
    };
  });
  assert(beacon.animation.includes('hazard-teacher-beacon'), `Strong warning beacon missing: ${JSON.stringify(beacon)}`);
  assert(beacon.duration === '0.7s' && beacon.backdrop === 'none' && beacon.cardAnimation === 'none', `Warning beacon is not lightweight: ${JSON.stringify(beacon)}`);
  assert(await page.locator('#btn-dismiss-hazard').isDisabled(), 'Alarm can be dismissed immediately');
  await page.clock.runFor(11999);
  assert(await page.locator('#btn-dismiss-hazard').isDisabled(), 'Alarm unlocks before 12 seconds');
  await page.clock.runFor(1);
  assert(await page.locator('#btn-dismiss-hazard').isEnabled(), 'Alarm does not unlock after 12 seconds');
  await page.clock.resume();
  await page.locator('#btn-dismiss-hazard').click();
  const submission = await page.evaluate(async () => {
    window.alert = () => {};
    electronAPI.submitExam = async () => ({success:false,error:'Disco lleno'});
    await handleExamFinalSubmit();
    const recoverable = !state.isExamSubmitted && !DOM.codeTextarea.readOnly;
    electronAPI.submitExam = async () => ({success:true,fileName:'exam.zip',zipPath:'/test/exam.zip',manifest:{checksum:'test'}});
    await handleExamFinalSubmit();
    return {recoverable,locked:state.isExamSubmitted && DOM.codeTextarea.readOnly};
  });
  assert(submission.recoverable && submission.locked, 'Submission did not handle failure/success correctly');
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { viewports: results, checks: 'stdin, streams, focus, stop, layout, resizing, saves, bounded output, dialog, light theme, 12-second alarm, submission', errors };
}
