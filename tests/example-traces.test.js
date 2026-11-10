const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const curriculum = require('../webapp/course');
const { examples } = require('../webapp/example-traces');

test('Every animation matches its source and finishes with the documented Python output', () => {
  let count = 0;
  for (const lesson of curriculum.lessons) for (const [index, example] of lesson.examples.entries()) {
    const key = `${lesson.id}:${index}`;
    const trace = examples[key];
    assert(trace, `Missing trace: ${key}`);
    assert.equal(trace.sourceHash, createHash('sha256').update(example.code).digest('hex'), `Regenerate the trace for ${key}`);
    assert.equal(trace.output, example.output.trim());
    assert.equal(trace.steps.at(-1).output.trim(), example.output.trim());
    assert(trace.steps.length > 0 && trace.steps.length <= 180);
    for (const frame of trace.steps) {
      assert(frame.line >= 1 && frame.line <= example.code.split('\n').length, key);
      assert(frame.explanation && frame.stack.length > 0);
      assert(Object.keys(frame.variables).length <= 16);
      assert(!/0x[0-9a-f]{8,}|\/home\/|\\Users\\/.test(JSON.stringify(frame)), `Trace exposes interpreter internals: ${key}`);
    }
    count++;
  }
  assert.equal(count, 40);
});

test('Teaching traces preserve real loop accumulation, aliases and function returns', () => {
  const accumulator = examples['for-loops:0'].steps.map(frame => frame.variables['global:total']?.text).filter(Boolean);
  assert(accumulator.includes('0') && accumulator.includes('1') && accumulator.includes('3') && accumulator.includes('6'));
  const alias = examples['lists:0'].steps.at(-1).variables;
  assert.equal(alias['global:a'].ref, alias['global:b'].ref);
  assert.deepEqual(alias['global:a'].cells, ['1', '2', '3']);
  const calls = examples['functions:0'].steps;
  assert(calls.some(frame => frame.kind === 'call' && frame.variables['local:doble:n']?.text === '3'));
  assert(calls.some(frame => frame.returned?.text === '6'));
  assert(calls.some(frame => frame.returned?.text === '8'));
  assert.equal(calls.at(-1).output.trim(), '14');
  const scopes = examples['scope:0'].steps;
  assert(scopes.some(frame => frame.variables['global:x']?.text === '10' && frame.variables['local:obtener:x']?.text === '3'));
});
