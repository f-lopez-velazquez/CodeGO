const { test } = require('node:test');
const assert = require('node:assert/strict');
const updater = require('../src/main/updater');

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
  assert.equal(updater.findMatchingAsset(assets, 'darwin', 'arm64').name, 'CodeGO-1.0.1-mac-arm64.dmg');

  // Empty or invalid assets
  assert.equal(updater.findMatchingAsset([], 'linux'), null);
  assert.equal(updater.findMatchingAsset(null, 'win32'), null);
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
