const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Polyfill Web Crypto API for Node.js test environment if needed
if (!global.crypto) {
  global.crypto = require('node:crypto').webcrypto;
}

test('CodeGO Web SDK: exports, security hashing and multi-language definitions', async () => {
  const sdkPath = path.resolve(__dirname, '../webapp/codego-sdk.js');
  assert.ok(fs.existsSync(sdkPath), 'codego-sdk.js debe existir');

  // Load SDK via require
  const CodeGOSDK = require(sdkPath);
  assert.ok(CodeGOSDK, 'CodeGOSDK debe exportarse');
  assert.ok(CodeGOSDK.SUPPORTED_LANGUAGES, 'SUPPORTED_LANGUAGES debe estar presente');

  // Check 5 languages
  const langs = Object.keys(CodeGOSDK.SUPPORTED_LANGUAGES);
  assert.ok(langs.includes('python'), 'Python debe estar soportado');
  assert.ok(langs.includes('cpp'), 'C++ debe estar soportado');
  assert.ok(langs.includes('java'), 'Java debe estar soportado');
  assert.ok(langs.includes('javascript'), 'JavaScript debe estar soportado');
  assert.ok(langs.includes('r'), 'R debe estar soportado');

  // SHA-256 verification
  const hash = await CodeGOSDK.computeSHA256('print("Hello CodeGO")');
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64, 'SHA-256 debe tener 64 caracteres hexadecimales');

  // HMAC-SHA256 verification
  const hmac = await CodeGOSDK.computeHMACSHA256('Payload de prueba del estudiante');
  assert.equal(typeof hmac, 'string');
  assert.equal(hmac.length, 64, 'HMAC-SHA256 debe tener 64 caracteres');

  // Telemetry Tracker
  const telemetry = new CodeGOSDK.ForensicTelemetry();
  telemetry.recordKeystroke(5);
  telemetry.recordKeystroke(10);
  telemetry.recordPasteAttempt();
  telemetry.recordRun();

  const report = telemetry.getReport();
  assert.equal(report.keystrokes, 2);
  assert.equal(report.charactersWritten, 15);
  assert.equal(report.externalPasteAttempts, 1);
  assert.equal(report.runsCount, 1);

  // Certificate HTML Generator
  const certHtml = await CodeGOSDK.generateCertificateHTML({
    student: { name: 'Ana Gómez', id: '2026-ALG-05' },
    subject: 'Algoritmos y Estructuras de Datos',
    language: 'cpp',
    code: '#include <iostream>\nint main() { return 0; }',
    telemetry: report,
    hmacSignature: hmac
  });

  assert.ok(certHtml.includes('CERTIFICADO DIGITAL DE AUTORÍA'), 'El certificado HTML debe contener el título');
  assert.ok(certHtml.includes('Ana Gómez'), 'El certificado debe contener el nombre del estudiante');
  assert.ok(certHtml.includes(hmac), 'El certificado debe contener el sello HMAC');
  assert.ok(certHtml.includes('CPP'), 'El certificado debe contener el lenguaje');
});
