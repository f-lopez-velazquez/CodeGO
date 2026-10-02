const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const source = path.join(root, 'dist', 'patch', `CodeGO-${version}-app.asar`);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-patch-smoke-'));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_NO_ATTACH_CONSOLE;
const args = [path.join(__dirname, 'app-patch-smoke.cjs'), source, version, userData, '--disable-gpu'];
if (process.platform === 'linux') args.push('--ozone-platform=headless', '--no-sandbox');

try {
  const result = spawnSync(require('electron'), args, { env: environment, stdio: 'inherit', timeout: 30000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
