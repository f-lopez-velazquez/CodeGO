#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { PACKAGES } = require('../src/main/environment-setup');

const RELEASE = '20260924';
const PYTHON = {
  'win32-x64': ['cpython-3.13.15+20260924-x86_64-pc-windows-msvc-install_only_stripped.tar.gz', 'e42fa944748a50e9ff481cbb817ef8a6e3da6fbcf0cf6f29b554e1acb8c7384d'],
  'darwin-arm64': ['cpython-3.13.15+20260924-aarch64-apple-darwin-install_only_stripped.tar.gz', '064afb7c2fc0bbf511d886288adf98696af5105e36c138cdf2c199c0146fcf68'],
  'darwin-x64': ['cpython-3.13.15+20260924-x86_64-apple-darwin-install_only_stripped.tar.gz', '327814efd865a0b6a99c149b12a261e9d0ad409183515c745d41bda2d07282e9'],
  'linux-x64': ['cpython-3.13.15+20260924-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz', 'd0b640eed27fbdd6f5f2bd33444aee53df2c8863f8b2a96f4094717411e3de9c']
};
const VC_REDIST_SHA256 = 'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b';
const ESPTOOL_SDIST_SHA256 = 'fd756598db0a26c9975fa18511b08687c54bf2ce7322ede80cf1f5117dad1f50';
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'build', 'offline');
const key = `${process.platform}-${process.arch}`;
const runtime = PYTHON[key];
if (!runtime) throw new Error(`No hay paquete autónomo definido para ${key}.`);

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error(`Demasiadas redirecciones: ${url}`));
    const request = https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return download(new URL(response.headers.location, url).href, destination, redirects + 1).then(resolve, reject);
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`HTTP ${response.statusCode}: ${url}`)); }
      const temporary = `${destination}.part`;
      const output = fs.createWriteStream(temporary);
      response.pipe(output);
      output.on('finish', () => output.close(() => { fs.renameSync(temporary, destination); resolve(); }));
      output.on('error', reject);
    });
    request.setTimeout(60000, () => request.destroy(new Error(`Tiempo agotado: ${url}`)));
    request.on('error', reject);
  });
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`Falló ${command} (${result.status ?? result.error?.message}).`);
}

(async () => {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'wheels'), { recursive: true });
  fs.writeFileSync(path.join(target, '.gitkeep'), '');
  const archive = path.join(target, 'python-runtime.tar.gz');
  const source = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(runtime[0])}`;
  console.log(`Descargando Python autónomo para ${key}...`);
  await download(source, archive);
  if (hash(archive) !== runtime[1]) throw new Error('El SHA-256 del runtime de Python no coincide.');

  const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-offline-'));
  try {
    run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', archive, '-C', extract]);
    const python = path.join(extract, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
    const esptoolSource = path.join(target, 'esptool-5.4.0.tar.gz');
    await download('https://files.pythonhosted.org/packages/source/e/esptool/esptool-5.4.0.tar.gz', esptoolSource);
    if (hash(esptoolSource) !== ESPTOOL_SDIST_SHA256) throw new Error('El SHA-256 del código fuente fijado de esptool no coincide.');
    // esptool publishes source only. Build its universal wheel once in CI; end-user machines never compile.
    run(python, ['-I', '-m', 'pip', 'wheel', '--wheel-dir', path.join(target, 'wheels'), '--only-binary=:all:', '--disable-pip-version-check', esptoolSource]);
    fs.unlinkSync(esptoolSource);
    const binaryPackages = PACKAGES.filter(item => item.distribution !== 'esptool');
    run(python, ['-I', '-m', 'pip', 'download', '--dest', path.join(target, 'wheels'), '--only-binary=:all:', '--disable-pip-version-check', ...binaryPackages.map(item => `${item.distribution}==${item.version}`)]);
  } finally {
    fs.rmSync(extract, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  let vcRedist = null;
  if (process.platform === 'win32') {
    const vcFile = path.join(target, 'vc_redist.x64.exe');
    await download('https://aka.ms/vs/17/release/vc_redist.x64.exe', vcFile);
    if (hash(vcFile) !== VC_REDIST_SHA256) throw new Error('Microsoft actualizó VC++ Redistributable. Revisa y fija el nuevo SHA-256 antes de publicar.');
    vcRedist = { file: path.basename(vcFile), sha256: hash(vcFile) };
  }

  const files = [];
  function collect(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'manifest.json' || entry.name === '.gitkeep') continue;
      const absolute = path.join(directory, entry.name);
      const nested = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) collect(absolute, nested);
      else files.push({ path: nested, size: fs.statSync(absolute).size, sha256: hash(absolute) });
    }
  }
  collect(target);
  const manifest = {
    schema: 1,
    version: require('../package.json').version,
    platform: process.platform,
    arch: process.arch,
    generatedAt: new Date().toISOString(),
    runtime: { file: 'python-runtime.tar.gz', version: '3.13.15', sha256: runtime[1], source },
    wheelhouse: 'wheels',
    packages: PACKAGES,
    vcRedist,
    files
  };
  fs.writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Paquete autónomo listo: ${files.length} archivos, ${(files.reduce((sum, file) => sum + file.size, 0) / 1048576).toFixed(1)} MiB.`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
