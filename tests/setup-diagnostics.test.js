const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupDiagnostic } = require('../src/main/setup-diagnostics');

test('Setup diagnostics turn technical failures into stable actionable codes', () => {
  assert.equal(setupDiagnostic(new Error('ENOSPC: no space left')).code, 'CG-SETUP-102');
  assert.equal(setupDiagnostic(new Error('SHA-256 mismatch')).code, 'CG-SETUP-101');
  const pip = setupDiagnostic(new Error('pip no matching distribution'), { offlineAvailable: true });
  assert.equal(pip.code, 'CG-SETUP-105');
  assert.match(pip.actions.join(' '), /no se requiere conexión/i);
  assert.equal(setupDiagnostic(new Error('ECONNRESET timeout')).code, 'CG-SETUP-107');
});
