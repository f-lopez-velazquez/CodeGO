const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Linux desktop sessions can export Electron development variables globally.
 * A small launcher keeps those variables from turning the packaged application
 * into a plain Node process and records non-user-facing Chromium messages.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    const product = context.packager.appInfo?.productFilename || 'codeGO';
    const appPath = path.join(context.appOutDir, `${product}.app`);
    // Ad-hoc signing keeps the embedded Python and native wheels under one
    // coherent code signature. Public distribution still needs Apple
    // Developer ID + notarization to remove the first-launch Gatekeeper step.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
    return;
  }
  if (context.electronPlatformName !== 'linux') return;

  const executableName = context.packager.executableName
    || context.packager.platformSpecificBuildOptions?.executableName
    || context.packager.appInfo?.name
    || 'codego-examguard';
  const launcherPath = path.join(context.appOutDir, executableName);
  const binaryPath = `${launcherPath}-bin`;
  if (!fs.existsSync(launcherPath)) throw new Error(`No se encontró el ejecutable Linux: ${launcherPath}`);

  fs.rmSync(binaryPath, { force: true });
  fs.renameSync(launcherPath, binaryPath);
  const script = `#!/bin/sh
set -eu

unset ELECTRON_RUN_AS_NODE
unset ELECTRON_NO_ATTACH_CONSOLE

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for argument in "$@"; do
  case "$argument" in
    --self-test-report=*) exec "$APP_DIR/${executableName}-bin" "$@" ;;
  esac
done

if [ "\${CODEGO_DEBUG:-0}" = "1" ]; then
  exec "$APP_DIR/${executableName}-bin" "$@"
fi

STATE_ROOT=\${XDG_STATE_HOME:-"\${HOME:-/tmp}/.local/state"}
LOG_DIR="$STATE_ROOT/codego"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR=/tmp
exec "$APP_DIR/${executableName}-bin" "$@" >>"$LOG_DIR/codego.log" 2>&1
`;
  fs.writeFileSync(launcherPath, script, { mode: 0o755 });
  fs.chmodSync(launcherPath, 0o755);
}
