const fs = require('node:fs');
const path = require('node:path');

// Check path components, not string prefixes; also reject links escaping the workspace.
function resolveWorkspacePath(workspace, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error('Indica una ruta relativa dentro del proyecto.');
  }
  const root = fs.realpathSync(workspace);
  const target = path.resolve(root, relativePath);
  const contains = candidate => {
    const relative = path.relative(root, candidate);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  if (target === root || !contains(target)) throw new Error('Acceso no permitido fuera del espacio de trabajo.');
  let ancestor = target;
  while (!fs.existsSync(ancestor)) {
    // Broken links must not be treated as new regular files.
    try { if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Enlace simbólico no válido.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    ancestor = path.dirname(ancestor);
  }
  if (!contains(fs.realpathSync(ancestor))) throw new Error('El enlace sale del espacio de trabajo.');
  return target;
}
module.exports = { resolveWorkspacePath };
