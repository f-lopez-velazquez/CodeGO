const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const updater = require('../src/main/updater');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-updater-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Updater: parseSemver extracts [major, minor, patch] correctly', () => {
  assert.deepEqual(updater.parseSemver('1.0.0'), [1, 0, 0]);
  assert.deepEqual(updater.parseSemver('v1.2.3'), [1, 2, 3]);
  assert.deepEqual(updater.parseSemver('V2.10.4-beta.1'), [2, 10, 4]);
  assert.deepEqual(updater.parseSemver(''), [0, 0, 0]);
  assert.deepEqual(updater.parseSemver(null), [0, 0, 0]);
});

test('Updater: isNewerVersion compares versions correctly', () => {
  // Minor / Patch upgrades
  assert.equal(updater.isNewerVersion('1.0.0', '1.0.1'), true);
  assert.equal(updater.isNewerVersion('1.0.0', '1.1.0'), true);
  assert.equal(updater.isNewerVersion('1.0.0', '2.0.0'), true);
  assert.equal(updater.isNewerVersion('v1.0.0', 'v1.0.1'), true);

  // Equal versions
  assert.equal(updater.isNewerVersion('1.0.0', '1.0.0'), false);
  assert.equal(updater.isNewerVersion('v1.0.0', '1.0.0'), false);

  // Downgrades or older remote
  assert.equal(updater.isNewerVersion('1.2.0', '1.1.9'), false);
  assert.equal(updater.isNewerVersion('2.0.0', '1.9.9'), false);
  assert.equal(updater.isNewerVersion('1.0.1', '1.0.0'), false);
});

test('Updater: findMatchingAsset detects correct OS binary', () => {
  const assets = [
    { name: 'CodeGO-1.0.1-linux-x64.tar.gz', size: 110000000, browser_download_url: 'https://example.com/tar' },
    { name: 'CodeGO-1.0.1-linux-x86_64.AppImage', size: 120000000, browser_download_url: 'https://example.com/appimage' },
    { name: 'CodeGO-1.0.1-mac-arm64.dmg', size: 340000000, browser_download_url: 'https://example.com/macarm' },
    { name: 'CodeGO-1.0.1-mac-arm64.zip', size: 339000000, browser_download_url: 'https://example.com/macarmzip' },
    { name: 'CodeGO-1.0.1-mac-x64.zip', size: 360000000, browser_download_url: 'https://example.com/maczip' },
    { name: 'CodeGO-1.0.1-portable-x64.exe', size: 105000000, browser_download_url: 'https://example.com/portable' },
    { name: 'CodeGO-1.0.1-setup-x64.exe', size: 106000000, browser_download_url: 'https://example.com/setup' },
    { name: 'SHA256SUMS.txt', size: 500, browser_download_url: 'https://example.com/sha' }
  ];

  // Windows: prefers setup .exe
  const winAsset = updater.findMatchingAsset(assets, 'win32');
  assert.ok(winAsset);
  assert.equal(winAsset.name, 'CodeGO-1.0.1-setup-x64.exe');

  // Linux: prefers AppImage
  const linuxAsset = updater.findMatchingAsset(assets, 'linux');
  assert.ok(linuxAsset);
  assert.equal(linuxAsset.name, 'CodeGO-1.0.1-linux-x86_64.AppImage');

  // macOS: prefers zip/dmg
  const macAsset = updater.findMatchingAsset(assets, 'darwin', 'x64');
  assert.ok(macAsset);
  assert.equal(macAsset.name, 'CodeGO-1.0.1-mac-x64.zip');
  assert.equal(updater.findMatchingAsset(assets, 'darwin', 'arm64').name, 'CodeGO-1.0.1-mac-arm64.zip');

  // Empty or invalid assets
  assert.equal(updater.findMatchingAsset([], 'linux'), null);
  assert.equal(updater.findMatchingAsset(null, 'win32'), null);
});

test('Updater: validates the published size and SHA-256 before installation', t => {
  const directory = temporary(t);
  const file = path.join(directory, 'CodeGO.AppImage');
  fs.writeFileSync(file, 'actualización comprobada');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const result = updater.verifyDownloadedAsset(file, { sizeBytes: fs.statSync(file).size, digest: `sha256:${digest}` });
  assert.equal(result.success, true);
  assert.equal(result.sha256, digest);
  assert.throws(() => updater.verifyDownloadedAsset(file, { digest: `sha256:${'0'.repeat(64)}` }), /SHA-256/);
  assert.throws(() => updater.verifyDownloadedAsset(file, { sizeBytes: 1 }), /incompleta/);
});

test('Updater: Linux atomically replaces the installed AppImage and restarts it', t => {
  const directory = temporary(t);
  const home = path.join(directory, 'home');
  const target = path.join(home, '.local', 'bin', 'codego');
  const update = path.join(directory, 'CodeGO-new.AppImage');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'versión anterior');
  fs.writeFileSync(update, 'versión nueva');
  const calls = [];
  const result = updater.launchInstaller(update, 'linux', {
    appImagePath: target,
    homeDirectory: home,
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return { unref() {} };
    }
  });
  assert.equal(result.automatic, true);
  assert.equal(fs.readFileSync(target, 'utf8'), 'versión nueva');
  assert.equal(fs.readFileSync(`${target}.previous`, 'utf8'), 'versión anterior');
  assert.equal(calls[0].command, target);
  assert.deepEqual(calls[0].args, ['--updated']);
  const desktopEntry = path.join(home, '.local', 'share', 'applications', 'codego-examguard.desktop');
  assert.match(fs.readFileSync(desktopEntry, 'utf8'), /Exec=.*codego/);
  assert.equal(fs.statSync(desktopEntry).mode & 0o111, 0o111);
});

test('Updater: Linux falls back to the user profile when the AppImage is not writable', t => {
  const directory = temporary(t);
  const home = path.join(directory, 'home');
  const update = path.join(directory, 'CodeGO-new.AppImage');
  fs.writeFileSync(update, 'versión nueva');
  const originalAccess = fs.accessSync;
  t.mock.method(fs, 'accessSync', (candidate, mode) => {
    if (candidate === '/opt/codego' || candidate === '/opt') throw new Error('EACCES');
    return originalAccess(candidate, mode);
  });
  const calls = [];
  const result = updater.launchInstaller(update, 'linux', {
    appImagePath: '/opt/codego',
    homeDirectory: home,
    spawnProcess: (command, args) => {
      calls.push({ command, args });
      return { unref() {} };
    }
  });
  const userTarget = path.join(home, '.local', 'bin', 'codego');
  assert.equal(result.path, userTarget);
  assert.equal(fs.readFileSync(userTarget, 'utf8'), 'versión nueva');
  assert.equal(calls[0].command, userTarget);
});

test('Updater: Windows launches the verified NSIS package silently', t => {
  const directory = temporary(t);
  const installer = path.join(directory, 'CodeGO-setup.exe');
  fs.writeFileSync(installer, 'installer');
  const calls = [];
  const result = updater.launchInstaller(installer, 'win32', {
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return { unref() {} };
    }
  });
  assert.equal(result.automatic, true);
  assert.deepEqual(calls[0].args, ['/S']);
  assert.equal(calls[0].options.windowsHide, true);
});

test('Updater: macOS stages the ZIP beside the app and preserves a rollback bundle', t => {
  const directory = temporary(t);
  const home = path.join(directory, 'home');
  const target = path.join(home, 'Applications', 'codeGO.app');
  const executable = path.join(target, 'Contents', 'MacOS', 'codeGO');
  const archive = path.join(directory, 'CodeGO-mac.zip');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'anterior');
  fs.writeFileSync(archive, 'zip simulado');
  const calls = [];
  const result = updater.launchInstaller(archive, 'darwin', {
    currentExecutable: executable,
    homeDirectory: home,
    execFileSync: (_command, args) => {
      const extracted = path.join(args.at(-1), 'codeGO.app', 'Contents', 'MacOS');
      fs.mkdirSync(extracted, { recursive: true });
      fs.writeFileSync(path.join(extracted, 'codeGO'), 'nueva');
    },
    spawnProcess: (command, args) => {
      calls.push({ command, args });
      return { unref() {} };
    }
  });
  assert.equal(result.automatic, true);
  assert.equal(fs.readFileSync(path.join(target, 'Contents', 'MacOS', 'codeGO'), 'utf8'), 'nueva');
  assert.equal(fs.readFileSync(path.join(`${target}.previous`, 'Contents', 'MacOS', 'codeGO'), 'utf8'), 'anterior');
  assert.deepEqual(calls[0], { command: '/usr/bin/open', args: ['-n', target] });
});

test('Updater: checkForUpdates handles offline or invalid repository gracefully', async () => {
  const result = await updater.checkForUpdates({
    currentVersion: '1.0.0',
    repoOwner: 'non-existent-user-12345',
    repoName: 'non-existent-repo-99999',
    timeoutMs: 1500
  });

  assert.equal(result.hasUpdate, false);
  assert.equal(result.currentVersion, '1.0.0');
});
