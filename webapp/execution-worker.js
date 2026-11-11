/* One isolated runtime. The owner can terminate this worker even inside an infinite loop. */
'use strict';
let python;
let outputBudget = 200000;
let pending = { stdout: '', stderr: '' };
let pendingCount = 0;
let flushTimer;
function flush() {
  clearTimeout(flushTimer);
  for (const type of ['stdout', 'stderr']) {
    if (pending[type]) postMessage({ type: 'output', stream: type, text: pending[type] });
    pending[type] = '';
  }
  pendingCount = 0;
}
function output(text, type = 'stdout') {
  if (outputBudget <= 0) return;
  const value = String(text).slice(0, outputBudget);
  outputBudget -= value.length;
  pending[type] += value;
  pendingCount += value.length;
  if (pendingCount >= 8192) flush();
  else if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 40);
  if (!outputBudget) { pending.stderr += '\nSalida limitada a 200 000 caracteres. Detén el programa si no termina.\n'; flush(); }
}
onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  const started = Date.now();
  outputBudget = 200000;
  const inputs = [...(data.stdin || [])];
  let exitCode = 0;
  let result;
  let generatedFiles = {}, readOnlyChanges = [], omittedFiles = 0;
  try {
    if (data.language === 'python') {
      if (!python) {
        postMessage({ type: 'status', text: 'Preparando Python. La primera carga necesita internet…' });
        importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
        python = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' });
      }
      const decoderOut = new TextDecoder();
      const decoderErr = new TextDecoder();
      python.setStdout({ write: bytes => { output(decoderOut.decode(bytes, { stream: true })); return bytes.length; } });
      python.setStderr({ write: bytes => { output(decoderErr.decode(bytes, { stream: true }), 'stderr'); return bytes.length; } });
      python.setStdin({ stdin: () => inputs.shift() });
      const globals = python.toPy({ __name__: '__main__' });
      try {
        if (data.files) {
          await python.runPythonAsync("import os, shutil, sys, importlib\nos.chdir('/')\nshutil.rmtree('/codego', ignore_errors=True)\nfor key, module in list(sys.modules.items()):\n    if str(getattr(module, '__file__', '')).startswith('/codego/'):\n        del sys.modules[key]\nimportlib.invalidate_caches()");
          // Files are relative to a fresh project root; no paths outside it are accepted.
          python.FS.mkdirTree('/codego');
          python.FS.chdir('/codego');
          await python.runPythonAsync("import sys\nif '/codego' not in sys.path: sys.path.insert(0, '/codego')");
          for (const [name, content] of Object.entries(data.files)) {
            if (!name || name.startsWith('/') || name.split('/').some(part => !part || part === '..' || part === '.')) continue;
            const parent = name.slice(0, name.lastIndexOf('/'));
            if (name.includes('/')) python.FS.mkdirTree('/codego/' + parent);
            python.FS.writeFile('/codego/' + name, content);
          }
        }
        await python.runPythonAsync(data.code, { globals, filename: data.filename || 'main.py' });
        if (data.tests) {
          const failures = [];
          for (const test of data.tests) {
            try { await python.runPythonAsync(test.check, { globals }); }
            catch (_) { failures.push(test.feedback); }
          }
          result = { total: data.tests.length, passed: data.tests.length - failures.length, failures };
        }
      } finally { globals.destroy(); }
    } else if (data.language === 'javascript') {
      const consoleProxy = Object.fromEntries(['log', 'warn', 'error'].map(name => [name, (...values) => output(values.map(value => typeof value === 'object' ? JSON.stringify(value) : String(value)).join(' ') + '\n', name === 'error' ? 'stderr' : 'stdout')]));
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction('console', 'prompt', data.code)(consoleProxy, () => inputs.shift() ?? null);
    } else {
      throw new Error('Este lenguaje necesita el motor nativo de CodeGO. Descarga la aplicación de escritorio.');
    }
  } catch (error) { exitCode = 1; output(String(error.message || error) + '\n', 'stderr'); }
  if (data.language === 'python' && python && data.files) {
    let total = 0, count = 0, entries = 0;
    const seen = new Set();
    const walk = (directory, prefix = '', depth = 0) => {
      if (depth > 16) { omittedFiles++; return; }
      for (const name of python.FS.readdir(directory)) {
        if (name === '.' || name === '..' || name === '__pycache__') continue;
        if (++entries > 2000) { omittedFiles++; return; }
        const relative = prefix + name, absolute = directory + '/' + name;
        if (name.includes('\\') || !name || name === '__proto__' || name === 'constructor' || name === 'prototype') { omittedFiles++; continue; }
        const stat = python.FS.lstat(absolute);
        if (python.FS.isDir(stat.mode)) walk(absolute, relative + '/', depth + 1);
        else if (python.FS.isFile(stat.mode)) {
          seen.add(relative); count++; total += stat.size;
          if (count > 200 || total > 5000000 || stat.size > 1000000 || !/\.(py|txt|csv|json|js|md)$/i.test(name)) { omittedFiles++; continue; }
          try {
            const source = new TextDecoder('utf-8', { fatal: true }).decode(python.FS.readFile(absolute));
            if (data.readOnlyFiles?.includes(relative) && source !== data.files[relative]) readOnlyChanges.push(relative);
            else if (source !== data.files[relative]) generatedFiles[relative] = source;
          } catch (_) { omittedFiles++; }
        }
      }
    };
    try { walk('/codego'); for (const name of data.readOnlyFiles || []) if (!seen.has(name)) readOnlyChanges.push(name); }
    catch (_) { omittedFiles++; }
  }
  flush();
  flushTimer = null;
  postMessage({ type: 'finished', exitCode, duration: Number(((Date.now() - started) / 1000).toFixed(2)), result, generatedFiles, readOnlyChanges, omittedFiles });
};
