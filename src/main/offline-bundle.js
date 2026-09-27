const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function locateOfflineBundle(resourcesPath, { platform = process.platform, arch = process.arch } = {}) {
  const candidates = [
    resourcesPath && path.join(resourcesPath, 'offline'),
    path.resolve(__dirname, '../../build/offline')
  ].filter(Boolean);
  for (const directory of candidates) {
    const manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.schema !== 1 || manifest.platform !== platform || manifest.arch !== arch) continue;
      return { directory, manifest, manifestPath };
    } catch (_) {}
  }
  return null;
}

function verifyOfflineBundle(bundle, { onFile = () => {} } = {}) {
  if (!bundle?.directory || !bundle?.manifest) throw new Error('El paquete autónomo no tiene un manifiesto válido.');
  const { directory, manifest } = bundle;
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!files.length || !manifest.runtime?.file || !manifest.wheelhouse) throw new Error('El manifiesto autónomo está incompleto.');
  for (let index = 0; index < files.length; index += 1) {
    const expected = files[index];
    const relative = String(expected.path || '').replace(/\\/g, '/');
    if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) throw new Error('El paquete autónomo contiene una ruta no válida.');
    const file = path.join(directory, ...relative.split('/'));
    if (!fs.existsSync(file)) throw new Error(`Falta un componente autónomo: ${relative}.`);
    const size = fs.statSync(file).size;
    if (size !== expected.size || sha256(file) !== expected.sha256) throw new Error(`Falló la verificación SHA-256 de ${relative}.`);
    onFile({ index: index + 1, total: files.length, relative, size });
  }
  return {
    runtimeArchive: path.join(directory, manifest.runtime.file),
    wheelhouse: path.join(directory, manifest.wheelhouse),
    vcRedist: manifest.vcRedist ? path.join(directory, manifest.vcRedist.file) : null,
    manifest
  };
}

module.exports = { locateOfflineBundle, verifyOfflineBundle, sha256 };
