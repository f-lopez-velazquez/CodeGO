const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-electron-'));
const env = { ...process.env, CODEGO_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
const args = [path.join(__dirname, 'electron-smoke.cjs'), '--disable-gpu'];
// The headless test is isolated; production keeps Electron's normal sandbox settings.
if (process.platform === 'linux') args.push('--ozone-platform=headless', '--ozone-override-screen-size=1440,900', '--no-sandbox');
const result = spawnSync(require('electron'), args, { env, stdio: 'inherit', timeout: 60000 });
if (result.error) console.error(result.error);
fs.rmSync(directory, {recursive:true,force:true,maxRetries:5,retryDelay:200});
process.exit(result.status ?? 1);
