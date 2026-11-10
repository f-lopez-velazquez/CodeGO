const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { listWorkspaceTree } = require('../src/main/workspace-tree');
const { writeFileAtomic } = require('../src/main/atomic-file');

test('Explorer bounds large projects, excludes dependencies and does not follow links', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codego-tree-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'src'));
  await fs.mkdir(path.join(directory, 'node_modules'));
  await fs.writeFile(path.join(directory, 'node_modules', 'ignored.js'), '');
  await fs.writeFile(path.join(directory, 'src', 'main.py'), 'print(1)');
  await Promise.all(Array.from({ length: 60 }, (_, i) => fs.writeFile(path.join(directory, `file-${i}.py`), '')));
  if (process.platform !== 'win32') await fs.symlink(directory, path.join(directory, 'loop'));
  const result = await listWorkspaceTree(directory, { maxEntries: 10 });
  assert.equal(result.count, 10);
  assert(result.warnings.length > 0);
  assert(!result.tree.some(item => item.name === 'node_modules' || item.name === 'loop'));
  assert.equal(result.tree[0].children[0].path, 'src/main.py');
});

test('Explorer reports inaccessible roots and excessive nesting without hanging', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codego-depth-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'a/b/c'), { recursive: true });
  const result = await listWorkspaceTree(directory, { maxDepth: 1 });
  assert(result.warnings.some(warning => /profundidad/.test(warning)));
  await assert.rejects(listWorkspaceTree(path.join(directory, 'missing')));
});

test('Atomic save replaces a source file and preserves it if staging fails', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codego-save-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'main.py');
  await writeFileAtomic(file, 'print("José")');
  assert.equal(await fs.readFile(file, 'utf8'), 'print("José")');
  await assert.rejects(writeFileAtomic(file, Symbol('invalid')));
  assert.equal(await fs.readFile(file, 'utf8'), 'print("José")');
  assert.deepEqual(await fs.readdir(directory), ['main.py']);
});
