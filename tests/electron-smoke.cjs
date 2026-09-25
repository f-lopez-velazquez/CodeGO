// Runs the real preload, renderer and Python runner with an isolated temporary workspace.
// OS lockdown, network and audio handlers are deliberately stubbed in this test harness.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PythonRunner } = require('../src/main/python-runner');
const dir = process.env.CODEGO_TEST_DIRECTORY || fs.mkdtempSync(path.join(os.tmpdir(), 'codego-electron-'));
app.setPath('userData', path.join(dir, 'user-data'));
app.disableHardwareAcceleration();
const python = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const code = 'nombre = input("¿Cómo te llamas? ")\nprint(f"Hola, {nombre}.")\nedad = input("¿Cuántos años tienes? ")\nprint(f"Tienes {edad} años. ¡Listo!")\n';
fs.writeFileSync(path.join(dir, 'main.py'), code);
let window, runner;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = script => window.webContents.executeJavaScript(script);
async function waitFor(script) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await evaluate(script)) return; await sleep(50); }
  throw new Error(`Timed out: ${script}`);
}
app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const fixtureHandlers = {
      'window:set-fullscreen': () => ({success:true}),
      'system:self-test': () => require('../src/main/self-test').runSelfTest({command:python,directory:dir}),
      'wifi:get-status': () => ({disabled:false}),
      'system:check-full-environment': () => ({hasPython:true,python:{command:python,version:'Python 3',isVenv:false},platform:process.platform,displaysCount:1,missingCount:0,packages:{}}),
      'fs:list-workspace': () => ({success:true,tree:[{name:'main.py',path:'main.py',type:'file'}]}),
      'fs:read-file': (_, name) => ({success:true,content:fs.readFileSync(path.join(dir,name),'utf8')}),
      'fs:save-file': (_, data) => { fs.writeFileSync(path.join(dir,data.relativePath),data.content); return {success:true}; },
      'python:run': (_, data) => runner.run(python,path.join(dir,data.relativePath)),
      'python:stdin': (_, value) => runner.stdin(value),
      'python:kill': () => runner.kill()
    };
    for (const [channel, handler] of Object.entries(fixtureHandlers)) ipcMain.handle(channel, handler);
    window = new BrowserWindow({show:true,width:1280,height:800,frame:false,webPreferences:{preload:path.resolve(__dirname,'../src/preload/preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    runner = new PythonRunner({send:(channel,data)=>window.webContents.send(channel,data)});
    await window.loadFile(path.resolve(__dirname,'../src/renderer/index.html'));
    await evaluate("setSessionMode('activity'); DOM.navSubjectLabel.textContent='Entrada y salida'; DOM.navStudentLabel.textContent='Práctica de Python'; enterIdeWorkspace();");
    await waitFor("state.activeFilePath === 'main.py'");
    assert.equal(await evaluate('Boolean(window.electronAPI && !window.require)'), true);
    assert.equal(await evaluate("document.body.textContent.includes('Programado por Francisco López Velázquez.')"), true);
    assert.equal((await evaluate('window.electronAPI.runSelfTest()')).success, true);
    const geometry = [];
    for (const zoom of [1,1.4,1.8]) {
      await evaluate(`setAppZoom(${zoom})`);
      await sleep(100);
      for (const layout of ['side','bottom']) {
        await evaluate(`state.termLayout='${layout}'; updateTerminalLayout();`);
        const result = await evaluate(`(()=>{const r=DOM.terminalStdinInput.getBoundingClientRect();return {zoom:${zoom},layout:'${layout}',bottom:r.bottom,width:r.width,viewport:innerHeight};})()`);
        assert(result.bottom <= result.viewport + 1 && result.width >= 35, JSON.stringify(result));
        geometry.push(result);
      }
    }
    await evaluate("setAppZoom(1);state.termLayout='side';updateTerminalLayout();runCurrentPythonCode();");
    await waitFor("DOM.terminalOutput.textContent.includes('¿Cómo te llamas?')");
    assert.equal(await evaluate('document.activeElement === DOM.terminalStdinInput'), true);
    await evaluate("DOM.terminalStdinInput.value='José Muñoz';sendTerminalStdin();");
    await waitFor("DOM.terminalOutput.textContent.includes('¿Cuántos años tienes?')");
    await sleep(200);
    const screenshotDir = path.resolve(__dirname,'../docs/verification');
    fs.mkdirSync(screenshotDir,{recursive:true});
    fs.writeFileSync(path.join(screenshotDir,'electron-input.png'),(await window.webContents.capturePage()).toPNG());
    await evaluate("DOM.terminalStdinInput.value='18';sendTerminalStdin();");
    await waitFor('!state.isRunning');
    assert.match(await evaluate('DOM.terminalOutput.textContent'), /Hola, José Muñoz\./);
    assert.match(await evaluate('DOM.terminalOutput.textContent'), /Tienes 18 años/);
    assert.equal(await evaluate('DOM.terminalStdinInput.disabled'), true);
    assert.equal(await evaluate("getComputedStyle(DOM.btnFinishExam).display === 'none' && DOM.btnFinishExam.disabled"), true);
    await sleep(100);
    fs.writeFileSync(path.join(screenshotDir,'electron-finished.png'),(await window.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({result:'PASS',checks:'Real Electron preload + Python input/output + native zoom + activity restrictions',geometry},null,2));
    assert.equal(await evaluate("DOM.terminalOutput.textContent.indexOf('❯ José Muñoz') < DOM.terminalOutput.textContent.indexOf('Hola, José Muñoz.')"), true);
  } catch (error) {
    console.error(error);
    runner?.kill();
    exitCode = 1;
  } finally {
    window?.destroy();
    app.exit(exitCode);
  }
});
