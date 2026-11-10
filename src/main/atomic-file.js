const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Stage beside the destination: a failed write must never truncate the last good source file.
async function writeFileAtomic(filePath, content) {
  const temporary = path.join(path.dirname(filePath), `.codego-${crypto.randomBytes(8).toString('hex')}.tmp`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let handle;
  try {
    const previous = await fs.stat(filePath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    handle = await fs.open(temporary, 'wx', previous ? previous.mode & 0o777 : 0o666);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await fs.rename(temporary, filePath);
  } finally {
    await handle?.close().catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
module.exports = { writeFileAtomic };
