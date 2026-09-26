const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createSubmission, createCertifiedTaskSubmission, verifySubmission, extractSubmissionFiles } = require('../src/main/submission');
const { runSelfTest } = require('../src/main/self-test');
const { createWifiControl } = require('../src/main/wifi-control');
const { ensurePythonEnvironment } = require('../src/main/python-environment');

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

test('Certified Task creates signed container with subfolders and verifies HMAC integrity', t => {
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
    version: '1.2.0'
  });

  assert.equal(result.success, true);
  assert.ok(fs.existsSync(result.filePath));

  const verified = verifySubmission(result.filePath);
  assert.equal(verified.success, true);
  assert.equal(verified.authentic, true);
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
