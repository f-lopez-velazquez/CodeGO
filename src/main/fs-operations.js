const fs = require('node:fs');
const path = require('node:path');

/**
 * Move a prepared directory into its final location.
 *
 * renameSync is fast and atomic when both paths are on the same filesystem.
 * Linux commonly mounts /tmp separately from the user's home directory, where
 * renameSync fails with EXDEV. In that case copy to a sibling staging path
 * first, then rename locally so an incomplete runtime is never exposed.
 */
function moveDirectory(source, target, { fileSystem = fs, stagingSuffix } = {}) {
  fileSystem.mkdirSync(path.dirname(target), { recursive: true });

  try {
    fileSystem.renameSync(source, target);
    return { method: 'rename' };
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
  }

  const suffix = stagingSuffix || `${process.pid}-${Date.now()}`;
  const staging = `${target}.installing-${suffix}`;
  fileSystem.rmSync(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  try {
    fileSystem.cpSync(source, staging, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
      verbatimSymlinks: true
    });
    fileSystem.renameSync(staging, target);
    fileSystem.rmSync(source, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return { method: 'copy-then-rename' };
  } catch (error) {
    fileSystem.rmSync(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    throw error;
  }
}

module.exports = { moveDirectory };
