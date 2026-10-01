const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const {
  createSubmission,
  createCertifiedTaskSubmission,
  verifySubmission,
  analyzeSubmissionBatch,
  extractSubmissionFiles,
  createGradeReceipt,
  ensureSigningIdentity
} = require('../src/main/submission');
const { runSelfTest } = require('../src/main/self-test');
const { createWifiControl } = require('../src/main/wifi-control');
const { ensurePythonEnvironment } = require('../src/main/python-environment');
const { createFocusGuard } = require('../src/main/focus-guard');
const environmentSetup = require('../src/main/environment-setup');

test('Renderer owns feedback dialogs and restores editor focus through Electron', () => {
  const renderer = fs.readFileSync(path.resolve(__dirname, '../src/renderer/app.js'), 'utf8');
  const markup = fs.readFileSync(path.resolve(__dirname, '../src/renderer/index.html'), 'utf8');
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/main.js'), 'utf8');
  assert.doesNotMatch(renderer, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.match(markup, /id="app-dialog"/);
  assert.match(markup, /id="toast-region"/);
  assert.match(markup, /id="language-select"/);
  assert.match(main, /window:focus-editor/);
  assert.match(main, /workspace:reveal-current/);
  assert.match(main, /active-exam-session\.json/);
  assert.match(main, /security:get-recovery-status/);
  assert.match(main, /const managedTeacherPin/);
  assert.doesNotMatch(main, /CODEGO_TEACHER_PIN \|\| ['"]1234['"]/);
});

test('Focus guard ignores internal file moves and focus events without a recorded exit', () => {
  let clock = 1000;
  const guard = createFocusGuard({ now: () => clock, internalGraceMs: 500, maximumInternalMs: 5000 });

  assert.equal(guard.focus({ sessionActive: true }).violation, false);
  guard.setInternalInteraction(true);
  assert.equal(guard.blur({ sessionActive: true }).reason, 'internal-interaction');
  clock += 300;
  guard.setInternalInteraction(false);
  assert.equal(guard.focus({ sessionActive: true }).violation, false);

  clock += 600;
  assert.equal(guard.focus({ sessionActive: true }).reason, 'no-recorded-blur');
});

test('Focus guard records one real application exit and preserves Python GUI exceptions', () => {
  let clock = 5000;
  const guard = createFocusGuard({ now: () => clock });

  assert.equal(guard.blur({ sessionActive: true, pythonWindow: true }).reason, 'python-window');
  assert.equal(guard.focus({ sessionActive: true }).violation, false);

  const blur = guard.blur({ sessionActive: true });
  assert.equal(blur.violation, true);
  clock += 2750;
  const focus = guard.focus({ sessionActive: true });
  assert.equal(focus.violation, true);
  assert.equal(focus.durationSeconds, 2.75);
  assert.equal(guard.focus({ sessionActive: true }).violation, false);
});

test('Interrupted setup operations recover automatically and preserve their retry limit', async () => {
  let attempts = 0;
  const retries = [];
  const value = await environmentSetup.retryOperation(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error(`interrupción ${attempts}`);
    return 'recuperado';
  }, {
    attempts: 3,
    delayMs: 0,
    onRetry: event => retries.push(event.nextAttempt)
  });
  assert.equal(value, 'recuperado');
  assert.equal(attempts, 3);
  assert.deepEqual(retries, [2, 3]);

  attempts = 0;
  await assert.rejects(() => environmentSetup.retryOperation(async () => {
    attempts += 1;
    throw new Error('falla persistente');
  }, { attempts: 2, delayMs: 0 }), /falla persistente/);
  assert.equal(attempts, 2);
});

test('Python selection rejects 3.14 and resolves a compatible 64-bit interpreter', async () => {
  const calls = [];
  const execute = async (command, args) => {
    calls.push([command, args]);
    const minor = command === 'python-3.14' ? 14 : 13;
    return JSON.stringify({ executable: `/runtime/python-${minor}`, major: 3, minor, bits: 64, version: `3.${minor}.0` }) + '\n';
  };
  const selected = await environmentSetup.selectPython(['python-3.14', 'python-3.13'], execute);
  assert.equal(selected.minor, 13);
  assert.equal(selected.executable, '/runtime/python-13');
  assert.equal(calls.length, 2);
});

test('Preparation uses pinned wheels and writes readiness only after microtests', async t => {
  const directory = temporary(t);
  const calls = [];
  let interruptedPackageRecovered = false;
  const execute = async (command, args, options = {}) => {
    const input = options.input || '';
    calls.push({ command, args, input });
    if (args.includes('-c') && command.startsWith(directory) && !fs.existsSync(command)) throw new Error('missing');
    if (args.includes('-m') && args.includes('venv')) {
      const executable = environmentSetup.pythonPath(args.at(-1));
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, 'test');
      return '';
    }
    if (args.includes('install') && args.includes(`${environmentSetup.PACKAGES[0].distribution}==${environmentSetup.PACKAGES[0].version}`) && !interruptedPackageRecovered) {
      interruptedPackageRecovered = true;
      throw new Error('interrupción transitoria simulada');
    }
    if (input.includes('importlib.metadata')) {
      return JSON.stringify(Object.fromEntries(environmentSetup.PACKAGES.map(item => [item.module, { installed: true, version: item.version, desc: item.distribution }]))) + '\n';
    }
    if (input.includes('Micropruebas') || input.includes("checks=[]")) return JSON.stringify({ success: true, checks: ['microtest'] }) + '\n';
    if (args.includes('-c')) return JSON.stringify({ executable: command, major: 3, minor: 13, bits: 64, version: '3.13.15' }) + '\n';
    return '';
  };
  const result = await environmentSetup.prepareEnvironment({
    directory,
    selectInterpreter: async () => ({ executable: 'python-3.13', major: 3, minor: 13, bits: 64, version: '3.13.15' }),
    execute,
    selfTest: async () => ({ success: true, checks: [{ name: 'stdin UTF-8', success: true }] })
  });
  assert.equal(result.success, true);
  assert.equal(interruptedPackageRecovered, true);
  assert.equal(environmentSetup.environmentStatus(directory).ready, true);
  const installs = calls.filter(call => call.args.includes('install') && call.args.some(arg => /^.+==.+$/.test(arg)));
  assert.equal(installs.length, environmentSetup.PACKAGES.length + 1);
  assert.ok(installs.every(call => call.args.includes('--only-binary=:all:')));
  for (const item of environmentSetup.PACKAGES) {
    assert.ok(installs.some(call => call.args.includes(`${item.distribution}==${item.version}`)), item.distribution);
  }
});

test('Preparation leaves the application locked when Python is incompatible', async t => {
  const directory = temporary(t);
  await assert.rejects(() => environmentSetup.prepareEnvironment({
    directory,
    selectInterpreter: async () => ({ executable: 'python-3.14', major: 3, minor: 14, bits: 64, version: '3.14.7' }),
    execute: async () => ''
  }), /3\.12 o 3\.13/);
  assert.equal(environmentSetup.environmentStatus(directory).ready, false);
});

test('Offline preparation installs only from the verified wheelhouse', async t => {
  const directory = temporary(t);
  const wheelhouse = path.join(directory, 'ruedas');
  fs.mkdirSync(wheelhouse);
  const calls = [];
  const execute = async (command, args, options = {}) => {
    calls.push({ command, args });
    if (args.includes('-c') && command.startsWith(directory) && !fs.existsSync(command)) throw new Error('missing');
    if (args.includes('venv')) {
      const executable = environmentSetup.pythonPath(args.at(-1));
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, 'test');
    }
    if ((options.input || '').includes('importlib.metadata')) return JSON.stringify(Object.fromEntries(environmentSetup.PACKAGES.map(item => [item.module, { installed: true, version: item.version }]))) + '\n';
    if ((options.input || '').includes('checks=[]')) return JSON.stringify({ success: true, checks: ['offline'] }) + '\n';
    if (args.includes('-c')) return JSON.stringify({ executable: command, major: 3, minor: 13, bits: 64, version: '3.13.15' }) + '\n';
    return '';
  };
  const result = await environmentSetup.prepareEnvironment({ directory, wheelhouse, selectInterpreter: async () => ({ executable: 'python-3.13', major: 3, minor: 13, bits: 64, version: '3.13.15' }), execute, selfTest: async () => ({ success: true, checks: [] }) });
  assert.equal(result.source, 'offline-bundle');
  const installs = calls.filter(call => call.args.includes('install'));
  assert.equal(installs.length, environmentSetup.PACKAGES.length);
  assert.ok(installs.every(call => call.args.includes('--no-index') && call.args.includes(wheelhouse)));
  assert.ok(installs.every(call => !call.args.includes('https://pypi.org/simple')));
});

test('Windows validates the installed SMBus package without importing Unix fcntl', () => {
  const script = environmentSetup.inspectScript();
  assert.match(script, /mod == "smbus2" and sys\.platform == "win32"/);
  assert.match(script, /if not platform_limited/);
});

test('Failed virtual environment never falls back to system pip', t => {
  const directory = path.join(temporary(t), 'entorno con acentos á');
  const calls = [];
  assert.throws(() => ensurePythonEnvironment({command:'python3',directory,execute:(...args)=>calls.push(args)}), /entorno virtual/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ['-m','venv',directory]);
});

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-production-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true,maxRetries:5,retryDelay:100}));
  return root;
}
test('Submission includes real hashes and detects ZIP tampering', t => {
  const root = temporary(t), workspace = path.join(root, 'project');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'solución.py'), 'print("José")');
  const result = createSubmission({workspace,outputDirectory:path.join(root,'out'),student:{id:'../José'},auditLog:[],version:'test'});
  assert.match(result.zipChecksum, /^[a-f0-9]{64}$/);
  assert.equal(verifySubmission(result.zipPath).files,1);
  assert.equal(result.manifest.autor,'Francisco López Velázquez');
  fs.appendFileSync(result.zipPath, 'tampering');
  assert.throws(()=>verifySubmission(result.zipPath), /SHA-256/);
});

test('A graded exam leaves an Ed25519 receipt bound to the exact submission', t => {
  const root = temporary(t), workspace = path.join(root, 'exam');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'Ana_EX-4.py'), 'print("respuesta")');
  const submission = createSubmission({
    workspace,
    outputDirectory: path.join(root, 'out'),
    student: { name: 'Ana', id: 'A-10', examId: 'EX-4' },
    auditLog: [],
    version: 'test'
  });
  const identity = ensureSigningIdentity(path.join(root, 'teacher'));
  const graded = createGradeReceipt({
    submissionPath: submission.zipPath,
    teacher: 'Profesora Rivera',
    grade: '9.5/10',
    feedback: 'Correcto',
    signingIdentity: identity
  });
  const receipt = JSON.parse(fs.readFileSync(graded.receiptPath, 'utf8'));
  const { seal, ...payload } = receipt;
  assert.equal(receipt.examId, 'EX-4');
  assert.equal(receipt.submissionSha256, submission.zipChecksum);
  assert.equal(crypto.verify(null, Buffer.from(JSON.stringify(payload)), seal.publicKey, Buffer.from(seal.signature, 'base64')), true);
});

test('Certified Task creates an Ed25519-sealed container with subfolders and verifies integrity', t => {
  const root = temporary(t), workspace = path.join(root, 'student-project');
  fs.mkdirSync(path.join(workspace, 'subcarpeta'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'main.py'), 'import subcarpeta.helper\nprint("Hola Tarea")');
  fs.writeFileSync(path.join(workspace, 'subcarpeta', 'helper.py'), 'def sumar(a,b): return a+b');

  const telemetry = {
    keystrokesCount: 1450,
    charactersTyped: 1200,
    activeTypingSeconds: 1800,
    externalPasteAttempts: 0,
    runsCount: 5,
    incidentsCount: 0
  };

  const result = createCertifiedTaskSubmission({
    workspace,
    outputDirectory: path.join(root, 'out'),
    student: { name: 'Francisco López', id: '12345', subject: 'Robótica' },
    telemetry,
    version: '1.0.0',
    signingIdentity: ensureSigningIdentity(path.join(root, 'identity'))
  });

  assert.equal(result.success, true);
  assert.ok(fs.existsSync(result.filePath));

  const verified = verifySubmission(result.filePath);
  assert.equal(verified.success, true);
  assert.equal(verified.authentic, true);
  assert.equal(verified.officialSealValid, true);
  assert.match(verified.sealFingerprint, /^[A-F0-9]{24}$/);
  assert.equal(verified.mode, 'task');
  assert.equal(verified.files, 2);
  assert.equal(verified.student.name, 'Francisco López');
  assert.equal(verified.telemetry.keystrokesCount, 1450);
  assert.equal(verified.telemetry.externalPasteAttempts, 0);

  // Test extraction with subfolders
  const extractDir = path.join(root, 'extracted');
  const extracted = extractSubmissionFiles(result.filePath, extractDir);
  assert.equal(extracted.extractedCount, 2);
  assert.ok(fs.existsSync(path.join(extractDir, 'main.py')));
  assert.ok(fs.existsSync(path.join(extractDir, 'subcarpeta', 'helper.py')));

  // Test tampering with .codego container
  const tamperedFile = path.join(root, 'tampered.codego');
  fs.copyFileSync(result.filePath, tamperedFile);
  fs.copyFileSync(result.filePath + '.sha256', tamperedFile + '.sha256');
  fs.appendFileSync(tamperedFile, 'injected_tampering');
  assert.throws(() => verifySubmission(tamperedFile), /SHA-256|corrupto|dañado/);

  const forgedSealFile = path.join(root, 'forged-seal.codego');
  const forgedZip = new AdmZip(result.filePath);
  const certificate = JSON.parse(forgedZip.readAsText('CERTIFICADO_CODEGO.json'));
  const signature = certificate.officialSeal.signature;
  certificate.officialSeal.signature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  forgedZip.updateFile('CERTIFICADO_CODEGO.json', Buffer.from(JSON.stringify(certificate, null, 2)));
  forgedZip.writeZip(forgedSealFile);
  assert.throws(() => verifySubmission(forgedSealFile), /Firma digital no válida/);
});

test('Teacher batch review detects duplicated and structurally similar Python submissions', t => {
  const root = temporary(t);
  const identity = ensureSigningIdentity(path.join(root, 'identity'));
  const createTask = (folder, name, code) => {
    const workspace = path.join(root, folder);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'main.py'), code);
    return createCertifiedTaskSubmission({
      workspace,
      outputDirectory: path.join(root, 'out'),
      student: { name, id: folder, subject: 'Fundamentos' },
      telemetry: { keystrokes: 80, charactersWritten: code.length },
      version: 'test',
      signingIdentity: identity
    });
  };
  const first = createTask('ana', 'Ana', 'total = 0\nfor numero in range(10):\n    total += numero\nprint(total)\n');
  const second = createTask('luis', 'Luis', 'suma = 0\nfor valor in range(10):\n    suma += valor\nprint(suma)\n');
  const third = createTask('maria', 'María', 'def saludar(nombre):\n    return f"Hola {nombre}"\nprint(saludar("Mundo"))\n');

  const report = analyzeSubmissionBatch([first.filePath, second.filePath, third.filePath]);
  assert.equal(report.verifiedCount, 3);
  assert.equal(report.errorCount, 0);
  assert.ok(report.comparisons.some(item => item.leftStudent === 'Ana' && item.rightStudent === 'Luis' && item.percentage >= 78));
  assert.ok(report.flaggedCount >= 2);
});
test('Self-test runs real Python stdin, UTF-8 and workspace writes without leftovers', {timeout:15000}, async t => {
  const directory = temporary(t);
  const command = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const report = await runSelfTest({command,directory});
  assert.equal(report.success,true,JSON.stringify(report));
  assert.deepEqual(fs.readdirSync(directory),[]);
});
test('Self-test reports missing Python instead of claiming compatibility', {timeout:15000}, async t => {
  const directory = temporary(t);
  const report = await runSelfTest({command:path.join(directory,'missing-python'),directory});
  assert.equal(report.success,false);
});
test('Wi-Fi: unknown state is never reported as blocked; activity cleanup does nothing', () => {
  let calls = 0;
  const wifi = createWifiControl({platform:'linux',execute:()=>{calls++;throw new Error('Unavailable');}});
  assert.equal(wifi.inspect().disabled,null);
  assert.equal(wifi.disable().success,false);
  wifi.restore();
  assert.equal(calls,2);
});
test('Wi-Fi: restores only the radio state changed by this exam', () => {
  let state = 'enabled'; const calls=[];
  const wifi = createWifiControl({platform:'linux',execute:(_cmd,args)=>{calls.push(args); if(args[2]) state=args[2]==='on'?'enabled':'disabled'; return state;}});
  assert.equal(wifi.disable().success,true);
  assert.equal(state,'disabled');
  wifi.restore(); assert.equal(state,'enabled');
  state='disabled';calls.length=0;
  wifi.disable();wifi.restore();
  assert.equal(state,'disabled');
  assert.equal(calls.length,1);
});
test('Windows Wi-Fi checks adapter status rather than translated connection strings', () => {
  const wifi = createWifiControl({platform:'win32',execute:()=>JSON.stringify([{ifIndex:7,Status:'Disconnected'}])});
  assert.equal(wifi.inspect().disabled,false);
  const off = createWifiControl({platform:'win32',execute:()=>JSON.stringify([{ifIndex:7,Status:'Disabled'}])});
  assert.equal(off.inspect().disabled,true);
});
test('Windows Wi-Fi polling stays asynchronous and shares concurrent requests', async () => {
  let complete, calls = 0;
  const wifi = createWifiControl({platform:'win32',executeAsync:()=>{
    calls++;
    return new Promise(resolve => { complete = resolve; });
  }});
  const first = wifi.inspectAsync();
  const second = wifi.inspectAsync();
  assert.equal(first, second);
  assert.equal(calls, 1);
  await new Promise(resolve => setImmediate(resolve));
  complete({stdout: JSON.stringify([{ifIndex:7,Status:'Disconnected'}])});
  assert.equal((await first).disabled, false);
  const failed = createWifiControl({platform:'win32',executeAsync:async()=>{throw new Error('Timeout');}});
  assert.equal((await failed.inspectAsync()).disabled, null);
});
test('macOS Wi-Fi finds the actual interface instead of assuming en0', () => {
  const wifi = createWifiControl({platform:'darwin',execute:(_cmd,args)=>args[0]==='-listallhardwareports'?'Hardware Port: Wi-Fi\nDevice: en7\nEthernet Address: 00':'Wi-Fi Power (en7): Off'});
  assert.equal(wifi.inspect().disabled,true);
});
