const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const platform = process.platform;
const version = require('../package.json').version;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-install-'));
const files = fs.readdirSync('dist').filter(name => name.startsWith(`CodeGO ExamGuard-${version}-`));
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {stdio: 'inherit', timeout: 180000, env: {...process.env, DEBUG: '', ...extraEnv}});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${path.basename(command)} terminó con código ${result.status}`);
}
function artifact(suffix) {
  const file = files.find(name => name.endsWith(suffix));
  if (!file) throw Error(`Falta artefacto ${suffix}`);
  return path.resolve('dist', file);
}
let executable;
const extraEnv = {};
if (platform === 'win32') {
  const destination = path.join(root, 'CodeGO');
  run(artifact('-setup-x64.exe'), ['/S', `/D=${destination}`]);
  executable = path.join(destination, 'CodeGO ExamGuard.exe');
} else if (platform === 'darwin') {
  const mount = path.join(root, 'volume');
  fs.mkdirSync(mount);
  run('hdiutil', ['attach', artifact('.dmg'), '-nobrowse', '-readonly', '-mountpoint', mount]);
  try {
    run('ditto', [path.join(mount, 'CodeGO ExamGuard.app'), path.join(root, 'CodeGO ExamGuard.app')]);
  } finally {
    run('hdiutil', ['detach', mount]);
  }
  executable = path.join(root, 'CodeGO ExamGuard.app/Contents/MacOS/CodeGO ExamGuard');
} else {
  executable = artifact('.AppImage');
  fs.chmodSync(executable, 0o755);
  extraEnv.APPIMAGE_EXTRACT_AND_RUN = '1';
}
if (!fs.existsSync(executable)) throw Error('El instalador no produjo el ejecutable esperado.');
run(process.execPath, ['scripts/packaged-smoke.cjs'], {...extraEnv, CODEGO_PACKAGED_EXECUTABLE: executable});
fs.writeFileSync(`reports/installer-${platform}-${process.arch}.json`, JSON.stringify({
  success: true, version, platform, arch: process.arch,
  method: platform === 'win32' ? 'NSIS silent installation' : platform === 'darwin' ? 'DMG mount, copy application and detach' : 'AppImage extract and run',
  scope: 'Local installer payload; does not simulate browser quarantine, SmartScreen or Gatekeeper approval',
}, null, 2) + '\n');
console.log('Instalador comprobado con Python real.');
