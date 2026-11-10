const fs = require('node:fs/promises');
const path = require('node:path');
const { classifyWorkspaceFile } = require('./file-types');

// Keep disk I/O off Electron's event loop. Never follow links or scan dependencies.
const EXCLUDED = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'exam_env']);
async function listWorkspaceTree(root, { maxEntries = 3000, maxDepth = 20 } = {}) {
  let count = 0;
  const warnings = new Set();
  async function scan(directory, relative = '', depth = 0) {
    if (depth > maxDepth) { warnings.add('Algunas carpetas exceden la profundidad de exploración.'); return []; }
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (!relative) throw error;
      warnings.add(`No se pudo leer ${relative}. Comprueba los permisos.`);
      return [];
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const tree = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink() || EXCLUDED.has(entry.name) || /^\.codego-.*\.tmp$/.test(entry.name)) continue;
      if (count >= maxEntries) { warnings.add(`Se muestran hasta ${maxEntries} elementos. Abre una carpeta de proyecto más específica.`); break; }
      count++;
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        tree.push({ name: entry.name, path: relativePath, type: 'directory', children: await scan(path.join(directory, entry.name), relativePath, depth + 1) });
      } else if (entry.isFile()) {
        tree.push({ name: entry.name, path: relativePath, type: 'file', ...classifyWorkspaceFile(entry.name) });
      }
    }
    return tree;
  }
  return { tree: await scan(root), warnings: [...warnings], count };
}
module.exports = { listWorkspaceTree };
