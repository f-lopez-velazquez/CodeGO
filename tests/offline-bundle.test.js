const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { locateOfflineBundle, verifyOfflineBundle, sha256 } = require('../src/main/offline-bundle');

test('Offline bundle validates platform, paths and SHA-256 before extraction', t => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-bundle-'));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  const offline = path.join(resources, 'offline');
  const wheels = path.join(offline, 'wheels');
  fs.mkdirSync(wheels, { recursive: true });
  fs.writeFileSync(path.join(offline, 'runtime.tar.gz'), 'python');
  fs.writeFileSync(path.join(wheels, 'demo.whl'), 'wheel');
  const files = ['runtime.tar.gz', 'wheels/demo.whl'].map(relative => {
    const file = path.join(offline, ...relative.split('/'));
    return { path: relative, size: fs.statSync(file).size, sha256: sha256(file) };
  });
  fs.writeFileSync(path.join(offline, 'manifest.json'), JSON.stringify({ schema: 1, platform: process.platform, arch: process.arch, runtime: { file: 'runtime.tar.gz' }, wheelhouse: 'wheels', files }));
  const bundle = locateOfflineBundle(resources);
  assert.ok(bundle);
  assert.equal(verifyOfflineBundle(bundle).wheelhouse, wheels);
  fs.appendFileSync(path.join(wheels, 'demo.whl'), 'tampered');
  assert.throws(() => verifyOfflineBundle(bundle), /SHA-256/);
});
