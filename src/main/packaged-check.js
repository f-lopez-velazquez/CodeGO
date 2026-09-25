const fs = require('node:fs');
const path = require('node:path');
const { runSelfTest } = require('./self-test');

async function runPackagedCheck({ window, command, directory, version, reportPath, packaged }) {
  const report = await runSelfTest({ command, directory, version });
  console.info('CodeGO: Python comprobado.');
  report.packaged = packaged === true;
  // Hidden windows may expose current DOM geometry but retain an old compositor frame.
  window.showInactive();
  const bounded = async (promise, label, timeout = 15000) => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Sin respuesta: ${label}`)), timeout);
      })]);
    } finally { clearTimeout(timer); }
  };
  const evaluate = code => bounded(window.webContents.executeJavaScript(code), code);
  const waitFor = async code => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (await evaluate(code)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('La interfaz no respondió: ' + code);
  };
  try {
    await waitFor("typeof state !== 'undefined' && Boolean(window.electronAPI)");
    console.info('CodeGO: puente disponible.');
    await evaluate("setSessionMode('activity'); enterIdeWorkspace();");
    console.info('CodeGO: espacio de trabajo abierto.');
    await waitFor("state.activeFilePath === 'main.py'");
    const checks = await evaluate(`({credits: document.body.textContent.includes('by zolvek.com.mx') && document.body.textContent.includes('Programado por Francisco López Velázquez.'), isolated: !window.require, activity: getComputedStyle(DOM.btnFinishExam).display === 'none' && DOM.btnFinishExam.disabled})`);
    report.checks.push({ name: 'Créditos y aislamiento del renderer', success: checks.credits && checks.isolated && checks.activity });
    for (const zoom of [1, 1.4, 1.8]) {
      await evaluate(`setAppZoom(${zoom})`);
      await new Promise(resolve => setTimeout(resolve, 120));
      for (const layout of ['side', 'bottom']) {
        await evaluate(`state.termLayout='${layout}'; updateTerminalLayout();`);
        const visible = await evaluate(`(()=>{const r=DOM.terminalStdinInput.getBoundingClientRect();return r.bottom<=innerHeight+1 && r.width>=35;})()`);
        report.checks.push({ name: `Entrada visible: ${layout}, zoom ${zoom}`, success: visible });
      }
    }
    console.info('CodeGO: geometrías comprobadas.');
    await evaluate("setAppZoom(1); state.termLayout='side'; updateTerminalLayout(); runCurrentPythonCode();");
    await waitFor("DOM.terminalOutput.textContent.includes('Ingresa tu nombre:')");
    await evaluate("DOM.terminalStdinInput.value='José Muñoz'; sendTerminalStdin();");
    await waitFor("!state.isRunning");
    const output = await evaluate("DOM.terminalOutput.textContent");
    console.info('CodeGO: ejecución interactiva comprobada.');
    report.checks.push({ name: 'Preload, IPC y Python del paquete', success: output.includes('Hola José Muñoz') && !output.includes('No se pudo ejecutar') });
    const screenshotPath = reportPath.replace(/\.json$/i, '') + '.png';
    // requestAnimationFrame may stop when another native window occludes the app.
    await new Promise(resolve => setTimeout(resolve, 150));
    if (!fs.existsSync(path.dirname(screenshotPath))) fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, (await bounded(window.webContents.capturePage(), 'captura de pantalla')).toPNG());
  } catch (error) { report.checks.push({ name: 'Interfaz empaquetada', success: false, detail: error.message }); }
  report.success = report.checks.every(check => check.success);
  if (!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}
module.exports = { runPackagedCheck };
