const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyWorkspaceFile } = require('../src/main/file-types');

test('Workspace files distinguish editable code from binary learning assets', () => {
  assert.deepEqual(classifyWorkspaceFile('main.py'), { kind: 'python', editable: true });
  assert.deepEqual(classifyWorkspaceFile('datos.csv'), { kind: 'text', editable: true });
  assert.deepEqual(classifyWorkspaceFile('recursos/nave.png'), { kind: 'image', editable: false });
  assert.deepEqual(classifyWorkspaceFile('recursos/salto.wav'), { kind: 'audio', editable: false });
  assert.deepEqual(classifyWorkspaceFile('modelo.xlsx'), { kind: 'binary', editable: false });
});
