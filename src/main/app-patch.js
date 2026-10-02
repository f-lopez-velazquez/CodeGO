const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Electron treats paths ending in .asar as virtual directories. Update
// packages themselves must be read as ordinary binary files when they are
// hashed, copied or removed, otherwise fs.readFileSync("package.asar") tries
// to open the archive root and reports a misleading ENOENT.
let rawFs = fs;
try { rawFs = require('original-fs'); } catch (_) {}

const SCHEMA = 1;
const PATCH_FILE_PATTERN = /^CodeGO-[0-9A-Za-z._-]+-app\.asar$/;

function patchDirectory(userData) {
  return path.join(userData, 'app-updates');
}

function metadataPath(userData) {
  return path.join(patchDirectory(userData), 'active.json');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(rawFs.readFileSync(filePath)).digest('hex');
}

function cleanVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').replace(/[^0-9A-Za-z._-]/g, '');
}

function readMetadata(userData) {
  try {
    const value = JSON.parse(fs.readFileSync(metadataPath(userData), 'utf8'));
    return value && value.schema === SCHEMA ? value : null;
  } catch (_) {
    return null;
  }
}

function writeMetadata(userData, metadata) {
  const directory = patchDirectory(userData);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = metadataPath(userData);
  const temporary = `${target}.tmp`;
  const backup = `${target}.previous`;
  fs.writeFileSync(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  try { fs.unlinkSync(backup); } catch (_) {}
  let hadPrevious = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      hadPrevious = true;
    }
    fs.renameSync(temporary, target);
    try { fs.unlinkSync(backup); } catch (_) {}
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    if (hadPrevious && !fs.existsSync(target) && fs.existsSync(backup)) {
      try { fs.renameSync(backup, target); } catch (_) {}
    }
    throw error;
  }
  return metadata;
}

function recordFile(userData, record) {
  if (!record || !PATCH_FILE_PATTERN.test(String(record.file || ''))) return null;
  const directory = patchDirectory(userData);
  const candidate = path.resolve(directory, record.file);
  if (path.dirname(candidate) !== path.resolve(directory) || !rawFs.existsSync(candidate)) return null;
  const expected = String(record.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256File(candidate) !== expected) return null;
  return candidate;
}

function rollbackPatch(userData, metadata, reason = 'La actualización no terminó de iniciar.') {
  const failed = metadata?.current || null;
  const previous = metadata?.previous && recordFile(userData, metadata.previous) ? metadata.previous : null;
  const next = {
    schema: SCHEMA,
    current: previous,
    previous: null,
    lastFailure: {
      version: failed?.version || null,
      reason: String(reason).slice(0, 500),
      at: new Date().toISOString()
    }
  };
  writeMetadata(userData, next);
  if (failed?.file && failed.file !== previous?.file && PATCH_FILE_PATTERN.test(failed.file)) {
    try { rawFs.unlinkSync(path.join(patchDirectory(userData), failed.file)); } catch (_) {}
  }
  return next;
}

function resolvePatchForLaunch(userData) {
  let metadata = readMetadata(userData);
  if (!metadata?.current) return null;
  const patchPath = recordFile(userData, metadata.current);
  if (!patchPath) {
    rollbackPatch(userData, metadata, 'El paquete guardado no coincide con su comprobación SHA-256.');
    return null;
  }
  if (metadata.current.pending && metadata.current.attemptedAt) {
    metadata = rollbackPatch(userData, metadata, 'La versión anterior no alcanzó a cargar la interfaz; se restauró automáticamente.');
    if (!metadata.current) return null;
    const restoredPath = recordFile(userData, metadata.current);
    return restoredPath ? { path: restoredPath, version: metadata.current.version, restored: true } : null;
  }
  if (metadata.current.pending) {
    metadata.current.attemptedAt = new Date().toISOString();
    writeMetadata(userData, metadata);
  }
  return { path: patchPath, version: metadata.current.version, pending: Boolean(metadata.current.pending) };
}

function installPatch(userData, sourcePath, { version, sha256 } = {}) {
  const safeVersion = cleanVersion(version);
  if (!safeVersion) throw new Error('La actualización no declara una versión válida.');
  if (!rawFs.existsSync(sourcePath)) throw new Error('El paquete de aplicación descargado no existe.');
  const actualHash = sha256File(sourcePath);
  if (!/^[a-f0-9]{64}$/i.test(String(sha256 || '')) || actualHash !== String(sha256).toLowerCase()) {
    throw new Error('El paquete de aplicación no coincide con su comprobación SHA-256.');
  }

  const directory = patchDirectory(userData);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = `CodeGO-${safeVersion}-app.asar`;
  const target = path.join(directory, file);
  const temporary = `${target}.tmp`;
  try { rawFs.unlinkSync(temporary); } catch (_) {}
  rawFs.copyFileSync(sourcePath, temporary);
  if (sha256File(temporary) !== actualHash) {
    try { rawFs.unlinkSync(temporary); } catch (_) {}
    throw new Error('La copia local de la actualización quedó incompleta.');
  }
  try { rawFs.unlinkSync(target); } catch (_) {}
  rawFs.renameSync(temporary, target);

  const existing = readMetadata(userData);
  const previous = existing?.current && recordFile(userData, existing.current) ? existing.current : null;
  writeMetadata(userData, {
    schema: SCHEMA,
    current: {
      file,
      version: safeVersion,
      sha256: actualHash,
      pending: true,
      attemptedAt: null,
      installedAt: new Date().toISOString()
    },
    previous
  });
  const retained = new Set([file, previous?.file].filter(Boolean));
  for (const entry of fs.readdirSync(directory)) {
    if (PATCH_FILE_PATTERN.test(entry) && !retained.has(entry)) {
      try { rawFs.unlinkSync(path.join(directory, entry)); } catch (_) {}
    }
  }
  return { success: true, path: target, version: safeVersion, sha256: actualHash };
}

function markPatchHealthy(userData, version) {
  const metadata = readMetadata(userData);
  if (!metadata?.current || cleanVersion(metadata.current.version) !== cleanVersion(version)) return false;
  if (!recordFile(userData, metadata.current)) return false;
  metadata.current.pending = false;
  metadata.current.attemptedAt = null;
  metadata.current.healthyAt = new Date().toISOString();
  writeMetadata(userData, metadata);
  return true;
}

module.exports = {
  SCHEMA,
  PATCH_FILE_PATTERN,
  patchDirectory,
  metadataPath,
  sha256File,
  readMetadata,
  writeMetadata,
  resolvePatchForLaunch,
  installPatch,
  markPatchHealthy,
  rollbackPatch
};
