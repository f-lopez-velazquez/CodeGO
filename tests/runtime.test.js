const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PythonRunner } = require('../src/main/python-runner');
const { resolveWorkspacePath } = require('../src/main/workspace-path');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function runtime(t, code, onOutput = () => {}) {
  const dir = fixture(t);
  const file = path.join(dir, 'main.py');
  fs.writeFileSync(file, code);
  const events = [];
  let complete;
  const finished = new Promise(resolve => { complete = resolve; });
  const runner = new PythonRunner({ send(channel, data) {
    events.push({ channel, data });
    if (channel === 'python:finished') complete(data);
    else onOutput(channel, data, runner);
  } });
  t.after(() => runner.kill());
  return { runner, file, events, finished };
}
const python = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

test('Python accepts consecutive input(), including empty and accented values', { timeout: 10000 }, async t => {
  let pending = '';
  const replies = ['José Muñoz', '', '18'];
  const r = runtime(t, 'a=input("Nombre: ")\nb=input("Opcional: ")\nc=input("Edad: ")\nprint(repr((a,b,c)))', (channel, chunk, runner) => {
    if (channel !== 'python:stdout') return;
    pending += chunk;
    if (pending.endsWith(': ')) { pending = ''; void runner.stdin(replies.shift()); }
  });
  assert.equal(r.runner.run(python, r.file).success, true);
  assert.equal((await r.finished).exitCode, 0);
  const output = r.events.filter(e => e.channel === 'python:stdout').map(e => e.data).join('');
  assert.match(output, /\('José Muñoz', '', '18'\)/);
  assert.equal(r.events.filter(e => e.channel === 'python:finished').length, 1);
  assert.equal((await r.runner.stdin('late')).success, false);
});

test('Stop keeps ownership until close and allows a clean restart', { timeout: 10000 }, async t => {
  const r = runtime(t, 'import time\nprint("ready")\ntime.sleep(30)', (channel, chunk, runner) => {
    if (channel === 'python:stdout') {
      assert.equal(runner.kill().success, true);
      assert.equal(runner.run(python, r.file).success, false);
    }
  });
  assert.equal(r.runner.run(python, r.file).success, true);
  assert.equal(r.runner.run(python, r.file).success, false);
  const stopped = await r.finished;
  assert(stopped.signal === 'SIGKILL' || stopped.exitCode !== 0);
  assert.equal(r.runner.child, null);
  fs.writeFileSync(r.file, 'print("restarted")');
  const done = new Promise(resolve => { r.runner.send = (channel, data) => { if (channel === 'python:finished') resolve(data); }; });
  assert.equal(r.runner.run(python, r.file).success, true);
  assert.equal((await done).exitCode, 0);
});

test('Python errors and missing executables complete without leaving a stuck process', { timeout: 10000 }, async t => {
  const r = runtime(t, 'raise ValueError("prueba")');
  r.runner.run(python, r.file);
  assert.equal((await r.finished).exitCode, 1);
  assert.match(r.events.filter(e => e.channel === 'python:stderr').map(e => e.data).join(''), /ValueError: prueba/);
  const missing = runtime(t, '');
  missing.runner.run(path.join(path.dirname(missing.file), 'missing-python'), missing.file);
  assert.notEqual((await missing.finished).exitCode, 0);
  assert.equal(missing.runner.child, null);
  assert.equal(missing.events.filter(e => e.channel === 'python:finished').length, 1);
});

test('UTF-8 output survives byte boundaries', { timeout: 10000 }, async t => {
  const r = runtime(t, 'import os, time\nfor b in "áñ🐍".encode():\n os.write(1, bytes([b]))\n time.sleep(0.01)');
  r.runner.run(python, r.file);
  await r.finished;
  assert.equal(r.events.filter(e => e.channel === 'python:stdout').map(e => e.data).join(''), 'áñ🐍');
});

test('Workspace rejects traversal, sibling prefixes, root deletion and external links', t => {
  const dir = fixture(t);
  const root = path.join(dir, 'project');
  const sibling = path.join(dir, 'project-other');
  fs.mkdirSync(root); fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling, 'secret.py'), '');
  assert.equal(resolveWorkspacePath(root, 'nuevo/main.py'), path.join(fs.realpathSync(root), 'nuevo/main.py'));
  for (const bad of ['', '.', '..', '../project-other/secret.py', path.join(sibling, 'secret.py')]) {
    assert.throws(() => resolveWorkspacePath(root, bad));
  }
  fs.symlinkSync(sibling, path.join(root, 'link'), 'junction');
  assert.throws(() => resolveWorkspacePath(root, 'link/secret.py'));
  assert.throws(() => resolveWorkspacePath(root, 'link/new.py'));
});
