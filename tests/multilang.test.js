const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MultiLanguageRunner, detectLanguage, detectToolchains, LANGUAGE_DEFS } = require('../src/main/language-runner');

function createTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-lang-test-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });
  return dir;
}

test('MultiLanguageRunner: language detection works accurately', () => {
  assert.equal(detectLanguage('main.py'), 'python');
  assert.equal(detectLanguage('sensor.c'), 'c');
  assert.equal(detectLanguage('header.h'), 'c');
  assert.equal(detectLanguage('matrix.cpp'), 'cpp');
  assert.equal(detectLanguage('App.java'), 'java');
  assert.equal(detectLanguage('server.js'), 'javascript');
  assert.equal(detectLanguage('analysis.R'), 'r');
  assert.equal(detectLanguage('script.r'), 'r');
  assert.equal(detectLanguage('unknown.xyz'), 'python');
});

test('MultiLanguageRunner: metadata definitions are complete for all 6 academic languages', () => {
  const expected = ['python', 'c', 'cpp', 'java', 'javascript', 'r'];
  for (const lang of expected) {
    assert.ok(LANGUAGE_DEFS[lang], `Falta definición de lenguaje para ${lang}`);
    assert.ok(LANGUAGE_DEFS[lang].name);
    assert.ok(LANGUAGE_DEFS[lang].icon);
    assert.ok(LANGUAGE_DEFS[lang].starterCode);
    assert.ok(LANGUAGE_DEFS[lang].defaultFile);
  }
});

test('MultiLanguageRunner: runs JavaScript file and captures output', async t => {
  const dir = createTempDir(t);
  const file = path.join(dir, 'test.js');
  fs.writeFileSync(file, 'console.log("HELLO_JAVASCRIPT_CODEGO");\n');

  const events = [];
  let finishResolve;
  const finished = new Promise(resolve => { finishResolve = resolve; });

  const runner = new MultiLanguageRunner({
    send(channel, data) {
      events.push({ channel, data });
      if (channel === 'code:finished') finishResolve(data);
    }
  });

  t.after(() => runner.kill());

  const runResult = runner.run({ filePath: file });
  assert.equal(runResult.success, true);

  const done = await finished;
  assert.equal(done.exitCode, 0);

  const stdout = events.filter(e => e.channel === 'code:stdout').map(e => e.data).join('');
  assert.match(stdout, /HELLO_JAVASCRIPT_CODEGO/);
});

test('MultiLanguageRunner: runs C++ file when g++ is installed', async t => {
  const toolchains = detectToolchains();
  if (!toolchains.cpp.installed) {
    t.skip('g++ no está instalado en este entorno.');
    return;
  }

  const dir = createTempDir(t);
  const file = path.join(dir, 'test.cpp');
  fs.writeFileSync(file, '#include <iostream>\nint main() { std::cout << "HELLO_CPP_CODEGO" << std::endl; return 0; }\n');

  const events = [];
  let finishResolve;
  const finished = new Promise(resolve => { finishResolve = resolve; });

  const runner = new MultiLanguageRunner({
    send(channel, data) {
      events.push({ channel, data });
      if (channel === 'code:finished') finishResolve(data);
    }
  });

  t.after(() => runner.kill());

  const runResult = runner.run({ filePath: file });
  assert.equal(runResult.success, true);

  const done = await finished;
  assert.equal(done.exitCode, 0);

  const stdout = events.filter(e => e.channel === 'code:stdout').map(e => e.data).join('');
  assert.match(stdout, /HELLO_CPP_CODEGO/);
});

test('MultiLanguageRunner: runs Java file when javac/java are installed', async t => {
  const toolchains = detectToolchains();
  if (!toolchains.java.installed) {
    t.skip('Java JDK no está instalado en este entorno.');
    return;
  }

  const dir = createTempDir(t);
  const file = path.join(dir, 'Main.java');
  fs.writeFileSync(file, 'public class Main { public static void main(String[] args) { System.out.println("HELLO_JAVA_CODEGO"); } }\n');

  const events = [];
  let finishResolve;
  const finished = new Promise(resolve => { finishResolve = resolve; });

  const runner = new MultiLanguageRunner({
    send(channel, data) {
      events.push({ channel, data });
      if (channel === 'code:finished') finishResolve(data);
    }
  });

  t.after(() => runner.kill());

  const runResult = runner.run({ filePath: file });
  assert.equal(runResult.success, true);

  const done = await finished;
  assert.equal(done.exitCode, 0);

  const stdout = events.filter(e => e.channel === 'code:stdout').map(e => e.data).join('');
  assert.match(stdout, /HELLO_JAVA_CODEGO/);
});
