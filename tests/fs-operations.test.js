const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { moveDirectory } = require('../src/main/fs-operations');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-move-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Runtime directory moves directly when source and target share a filesystem', t => {
  const root = fixture(t);
  const source = path.join(root, 'source');
  const target = path.join(root, 'profile', 'python313');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'python'), 'runtime');

  assert.deepEqual(moveDirectory(source, target), { method: 'rename' });
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.readFileSync(path.join(target, 'python'), 'utf8'), 'runtime');
});

test('EXDEV falls back to a complete copy inside the destination filesystem', t => {
  const root = fixture(t);
  const source = path.join(root, 'temporary', 'python');
  const target = path.join(root, 'profile', 'python313');
  fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
  const executable = path.join(source, 'bin', 'python3');
  fs.writeFileSync(executable, '#!/bin/sh\n');
  fs.chmodSync(executable, 0o755);

  let simulated = false;
  const fileSystem = {
    ...fs,
    renameSync(from, to) {
      if (!simulated && from === source && to === target) {
        simulated = true;
        const error = new Error('cross-device link not permitted');
        error.code = 'EXDEV';
        throw error;
      }
      return fs.renameSync(from, to);
    }
  };

  assert.deepEqual(moveDirectory(source, target, { fileSystem, stagingSuffix: 'test' }), { method: 'copy-then-rename' });
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.readFileSync(path.join(target, 'bin', 'python3'), 'utf8'), '#!/bin/sh\n');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(target, 'bin', 'python3')).mode & 0o111, 0o111);
  assert.equal(fs.existsSync(`${target}.installing-test`), false);
});

test('Move failures other than EXDEV are not hidden', t => {
  const root = fixture(t);
  const source = path.join(root, 'missing');
  const target = path.join(root, 'profile', 'python313');
  assert.throws(() => moveDirectory(source, target), error => error.code === 'ENOENT');
});
