const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const appPatch = require('../src/main/app-patch');

const source = path.resolve(process.argv[2] || '');
const version = String(process.argv[3] || '');
const userData = path.resolve(process.argv[4] || '');

app.setPath('userData', userData);
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  try {
    const sha256 = appPatch.sha256File(source);
    appPatch.installPatch(userData, source, { version, sha256 });
    const selected = appPatch.resolvePatchForLaunch(userData);
    if (!selected?.path) throw new Error('El paquete instalado no pudo resolverse para el arranque.');
    const fileTypes = require(path.join(selected.path, 'src', 'main', 'file-types.js'));
    if (typeof fileTypes.classifyWorkspaceFile !== 'function') throw new Error('El paquete no contiene los módulos de la aplicación.');
    if (!appPatch.markPatchHealthy(userData, version)) throw new Error('El paquete no pudo marcarse como saludable.');
    console.log(`Paquete ligero ${version}: arranque ASAR verificado en Electron.`);
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error.message);
    app.exit(1);
  }
});
