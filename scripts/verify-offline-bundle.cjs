#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const executeFile = promisify(execFile);
const setup = require('../src/main/environment-setup');
const { locateOfflineBundle, verifyOfflineBundle } = require('../src/main/offline-bundle');

(async () => {
  const bundle = locateOfflineBundle(path.resolve('build'));
  if (!bundle) throw new Error(`No se encontró el paquete autónomo para ${process.platform}-${process.arch}.`);
  const verified = verifyOfflineBundle(bundle);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-offline-verify-'));
  try {
    const extracted = path.join(temporary, 'runtime');
    fs.mkdirSync(extracted);
    await executeFile(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', verified.runtimeArchive, '-C', extracted], { timeout: 240000, windowsHide: true });
    const python = path.join(extracted, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
    const progress = [];
    const result = await setup.prepareEnvironment({
      directory: path.join(temporary, 'environment'),
      wheelhouse: verified.wheelhouse,
      selectInterpreter: () => setup.selectPython([python]),
      onProgress: (percent, title) => { if (title) { progress.push({ percent, title }); console.log(`${percent ?? '-'}% ${title}`); } }
    });
    if (!result.success || result.source !== 'offline-bundle') throw new Error('La preparación usó una fuente distinta al paquete autónomo.');
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync(path.join('reports', `offline-${process.platform}-${process.arch}.json`), `${JSON.stringify({ success: true, version: require('../package.json').version, platform: process.platform, arch: process.arch, files: bundle.manifest.files.length, packages: setup.PACKAGES.length, checks: result.checks, progress }, null, 2)}\n`);
    console.log(`Paquete autónomo comprobado: ${setup.PACKAGES.length} librerías y ${result.checks.length} micropruebas.`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
