async (page, baseUrl = 'http://127.0.0.1:8765') => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(baseUrl + '/**', route => route.continue());
  await page.goto(baseUrl);
  await page.evaluate(() => { setSessionMode('activity'); enterIdeWorkspace(); });
  await page.waitForTimeout(100);
  // Use a deterministic bridge for renderer behavior; runtime.test.js exercises real Python.
  await page.evaluate(() => {
    window.testWrites = [];
    window.testInputs = [];
    window.electronAPI = {
      saveFile: async data => { window.testWrites.push(data); return { success: true }; },
      runPython: async () => ({ success: true }),
      sendPythonStdin: async value => { window.testInputs.push(value); return { success: true }; },
      killPython: async () => { setTimeout(() => handleExecutionFinished({ exitCode: null, signal: 'SIGKILL', duration: 1 }), 10); return { success: true }; }
    };
  });
  const results = [];
  for (const size of [{width:1440,height:900}, {width:1024,height:700}, {width:768,height:600}, {width:390,height:844}]) {
    await page.setViewportSize(size);
    for (const zoom of size.width < 600 ? [1] : [1,1.4,1.8]) {
      await page.evaluate(value => setAppZoom(value), zoom);
      for (const layout of ['side', 'bottom']) {
        await page.evaluate(value => { state.termLayout = value; DOM.terminalPanel.style.removeProperty('--terminal-size'); updateTerminalLayout(); }, layout);
        const geometry = await page.evaluate(() => {
          const input = DOM.terminalStdinInput.getBoundingClientRect();
          const send = DOM.btnSendStdin.getBoundingClientRect();
          const run = DOM.btnRunCode.getBoundingClientRect();
          return { width: input.width, top: input.top, bottom: input.bottom, right: send.right, runRight: run.right, height: innerHeight, viewport: innerWidth };
        });
        assert(geometry.bottom <= geometry.height + 1 && geometry.top >= 0 && geometry.right <= geometry.viewport + 1 && geometry.width >= 35, `stdin clipped: ${JSON.stringify({size,zoom,layout,geometry})}`);
        assert(geometry.runRight <= geometry.viewport + 1, 'Run control clipped');
        results.push({ ...size, zoom, layout, result: 'pass' });
      }
    }
  }
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(() => { setAppZoom(1); state.termLayout = 'side'; updateTerminalLayout(); });
  assert(await page.locator('#btn-finish-exam').isHidden(), 'Submit visible in activity');
  assert(await page.locator('#btn-finish-exam').isDisabled(), 'Submit enabled in activity');
  await page.locator('#btn-toggle-term-view').click();
  assert(await page.locator('#terminal-panel').isHidden(), 'Collapse failed');
  await page.locator('#btn-run-code').click();
  assert(await page.locator('#terminal-stdin-input').isVisible(), 'Run did not reopen terminal');
  await page.locator('#terminal-stdin-input').fill('José Muñoz');
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
    return {chars:DOM.terminalOutput.textContent.length,nodes:DOM.terminalOutput.childElementCount};
  });
  assert(bounded.chars <= 200000 && bounded.nodes <= 1000, 'Unbounded terminal output');
  await page.locator('#btn-new-file').click();
  assert(await page.locator('#name-dialog').isVisible(), 'Native name dialog missing');
  await page.keyboard.press('Escape');
  assert(await page.locator('#name-dialog').isHidden(), 'Dialog Escape failed');
  await page.evaluate(() => { setTheme('theme-paper'); clearTerminal(); appendTerminalOutput('Nombre: José\n'); });
  const colors = await page.evaluate(() => ({output:getComputedStyle(DOM.terminalOutput).backgroundColor,text:getComputedStyle(DOM.terminalOutput.querySelector('.stdout')).color}));
  assert(colors.output === 'rgb(248, 250, 252)' && colors.text === 'rgb(15, 23, 42)', 'Light terminal theme broken');
  await page.evaluate(() => {
    setTheme('theme-obsidian');
    setSessionMode('exam');
    state.examSessionActive = true;
    sounds.startAlarmSiren = () => {};
    sounds.stopAlarmSiren = () => {};
    handleSecurityViolation({type:'TEST',durationSeconds:2});
  });
  assert(await page.locator('#btn-dismiss-hazard').isDisabled(), 'Alarm can be dismissed immediately');
  await page.waitForTimeout(11000);
  assert(await page.locator('#btn-dismiss-hazard').isDisabled(), 'Alarm unlocks before 12 seconds');
  await page.waitForTimeout(1100);
  assert(await page.locator('#btn-dismiss-hazard').isEnabled(), 'Alarm does not unlock after 12 seconds');
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
