const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function ensurePythonEnvironment({ command, directory, platform = process.platform, execute = execFileSync }) {
  const python = path.join(directory, platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3');
  if (!fs.existsSync(python)) {
    execute(command, ['-m', 'venv', directory], { timeout: 120000, windowsHide: true, stdio: 'pipe' });
  }
  if (!fs.existsSync(python)) throw new Error('No se pudo crear el entorno virtual. Instala el módulo venv de Python y vuelve a intentarlo.');
  execute(python, ['-m', 'pip', '--version'], { timeout: 15000, windowsHide: true, stdio: 'pipe' });
  return python;
}

module.exports = { ensurePythonEnvironment };
