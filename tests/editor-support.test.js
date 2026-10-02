const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ProcessOutputBuffer } = require('../src/main/process-output-buffer');
const { BrowserGuard, DisplayGuard } = require('../src/main/session-guards');
const { diagnosePython, explainSyntaxMessage } = require('../src/main/syntax-diagnostics');

test('Editor diagnostics parse Python and translate common syntax guidance', async () => {
  const python = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  assert.equal((await diagnosePython(python, 'for i in range(3):\n    print(i)\n', 'bien.py')).success, true);
  const missingColon = await diagnosePython(python, 'for i in range(3)\n    print(i)\n', 'error.py');
  assert.equal(missingColon.success, false);
  assert.equal(missingColon.line, 1);
  assert.match(`${missingColon.title} ${missingColon.hint}`, /dos puntos|:/i);
  assert.equal(missingColon.sourceLine, 'for i in range(3)');
  assert(missingColon.actions.length >= 3);
  assert.match(missingColon.example, /for|if/);
  assert.match(explainSyntaxMessage('expected an indented block').hint, /4 espacios/i);
  assert.match(explainSyntaxMessage("invalid syntax. Perhaps you forgot a comma?").title, /coma/i);
  assert.match(explainSyntaxMessage("cannot assign to expression here. Maybe you meant '==' instead of '='?").example, /==/);
});

test('Output buffer bounds a print flood and reports omitted output', () => {
  const events = [];
  const buffer = new ProcessOutputBuffer({ send: (channel, data) => events.push({ channel, data }), intervalMs: 1000, maxChunk: 16, maxPending: 32 });
  buffer.write('python:stdout', 'x'.repeat(500));
  buffer.close();
  assert(events.length < 10);
  assert.match(events.map(event => event.data).join(''), /limitó 468 caracteres/);
});

test('Display guard maximizes and restores Linux brightness without shell commands', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'get') return { stdout: '40\n' };
    if (args[0] === 'max') return { stdout: '100\n' };
    return { stdout: '' };
  };
  const guard = new DisplayGuard({ platform: 'linux', run });
  assert.equal((await guard.maximize()).success, true);
  assert.equal((await guard.restore()).restored, true);
  assert.deepEqual(calls.at(-1), ['brightnessctl', ['set', '40%']]);
});

test('Display guard preserves a valid zero-percent starting brightness', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'get') return { stdout: '0\n' };
    if (args[0] === 'max') return { stdout: '100\n' };
    return { stdout: '' };
  };
  const guard = new DisplayGuard({ platform: 'linux', run });
  await guard.maximize();
  await guard.maximize();
  assert.equal((await guard.restore()).restored, true);
  assert.deepEqual(calls.at(-1), ['brightnessctl', ['set', '0%']]);
});

test('Browser guard closes known browsers only through fixed executable arguments', async () => {
  const calls = [];
  const guard = new BrowserGuard({
    platform: 'linux',
    run: async (command, args) => { calls.push([command, args]); return { stdout: '' }; },
    wait: async () => {}
  });
  const result = await guard.closeAll();
  assert.equal(result.success, true);
  assert(result.closed.includes('firefox'));
  assert(calls.every(([command, args]) => command === 'pkill' && ['-TERM', '-KILL'].includes(args[0]) && args[1] === '-x'));
  assert(calls.some(([, args]) => args[0] === '-TERM' && args.includes('firefox')));
  assert(calls.some(([, args]) => args[0] === '-KILL' && args.includes('firefox')));
  assert(calls.some(([, args]) => args.includes('cursor')));
  assert(calls.some(([, args]) => args.includes('chatgpt')));
  assert(!calls.some(([, args]) => args.includes('codego-examguard')));
});

test('Desktop startup delegates fullscreen to one debounced main-process path', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
  assert.match(main, /fullscreen:\s*!diagnosticMode/);
  assert.equal((main.match(/mainWindow\.setFullScreen\(true\)/g) || []).length, 1);
  assert.equal((main.match(/mainWindow\.maximize\(\)/g) || []).length, 1);
  assert.doesNotMatch(renderer, /await window\.electronAPI\.setFullScreen\(true\)/);
  assert.match(main, /requestSingleInstanceLock\(\)/);
  assert.match(main, /app\.on\('second-instance'/);
});

test('Lobby always contains a runtime-backed version label', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
  assert.match(html, /id="lobby-app-version"/);
  assert.match(renderer, /getCurrentVersion/);
  assert.match(renderer, /lobbyAppVersion\.textContent/);
});

test('Startup, adaptive lobby and editor guide preferences are explicit', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
  assert.match(html, /id="view-startup"[^>]*class="view-container active"/);
  assert.match(html, /id="exam-teacher-pin"/);
  assert.match(html, /id="exam-teacher-pin-confirm"/);
  assert.match(html, /class="language-inline"/);
  assert.match(renderer, /screen-dense/);
  assert.match(renderer, /indentGuideStyle/);
  assert.match(css, /indent-guides-off/);
  assert.match(css, /66%, 100% \{ background-color: #00c853; \}/);
});

test('Free mode releases desktop restrictions and never supervises focus', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
  assert.match(main, /function releaseWindowForFreeMode[\s\S]*setAlwaysOnTop\(false\)[\s\S]*setFullScreen\(false\)[\s\S]*maximize\(\)/);
  assert.match(main, /mainWindow\.on\('blur'[\s\S]*activeSessionMode === 'activity'\) return/);
  assert.match(main, /leave-full-screen'[\s\S]*!\['exam', 'task'\]\.includes\(activeSessionMode\)/);
  assert.match(main, /isActivity[\s\S]*stopAudioWatchdog\(\)[\s\S]*releaseWindowForFreeMode\(\{ focus: true \}\)/);
  assert.doesNotMatch(main, /FREE_MODE_WINDOW_(?:EXIT|RETURN)/);
  assert.match(renderer, /state\.appMode === 'activity'\) return/);
  assert.doesNotMatch(renderer, /incidentData\.passive/);
});

test('Safe quit authorizes the native close handler before quitting', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.match(main, /handle\('app:quit-safe'[\s\S]*allowWindowClose = true;[\s\S]*app\.quit\(\);[\s\S]*success: true/);
});

test('Supervised focus changes debounce transient OS focus hand-offs', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.match(main, /supervisedBlurTimer = setTimeout/);
  assert.match(main, /mainWindow\.isFocused\(\)/);
  assert.match(main, /}, 650\);/);
});
