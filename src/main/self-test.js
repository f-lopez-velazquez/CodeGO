const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PythonRunner } = require('./python-runner');

async function runSelfTest({ command, directory, version = 'development' }) {
  const report = { schemaVersion: 1, version, platform: process.platform, arch: process.arch, osRelease: os.release(), electron: process.versions.electron || null, timestamp: new Date().toISOString(), checks: [] };
  report.checks.push({ name: 'Plataforma de escritorio', success: ['win32', 'linux', 'darwin'].includes(process.platform) && ['x64', 'arm64'].includes(process.arch) });
  let temporary;
  try {
    temporary = fs.mkdtempSync(path.join(directory, '.codego-comprobacion-'));
    const file = path.join(temporary, 'prueba con acentos.py');
    const code = 'nombre = input("CODEGO_INPUT:")\nprint("CODEGO_OK:" + nombre)\n';
    fs.writeFileSync(file, code, 'utf8');
    if (fs.readFileSync(file, 'utf8') !== code) throw new Error('No coincide el archivo guardado.');
    report.checks.push({ name: 'Crear, guardar y leer archivos', success: true });
    const python = await new Promise(resolve => {
      let output = '', errors = '', replied = false, settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const runner = new PythonRunner({ send(channel, data) {
        if (channel === 'python:stdout') {
          output += data;
          if (!replied && output.includes('CODEGO_INPUT:')) { replied = true; void runner.stdin('José Muñoz'); }
        } else if (channel === 'python:stderr') errors += data;
        else if (channel === 'python:finished') finish({ success: data.exitCode === 0 && output.includes('CODEGO_OK:José Muñoz'), detail: errors.slice(0, 500) });
      } });
      const timer = setTimeout(() => { runner.kill(); finish({ success: false, detail: 'Python no respondió en 10 segundos.' }); }, 10000);
      const start = runner.run(command, file);
      if (!start.success) finish({ success: false, detail: start.error });
    });
    report.checks.push({ name: 'Python: input(), salida y UTF-8', ...python });
  } catch (error) {
    report.checks.push({ name: 'Comprobación local', success: false, detail: error.message });
  } finally {
    if (temporary) {
      try { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) { report.checks.push({ name: 'Limpieza de prueba', success: false, detail: error.message }); }
    }
  }
  report.success = report.checks.every(check => check.success);
  return report;
}
module.exports = { runSelfTest };
