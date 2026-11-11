const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => String(value).replace(/\\/g, '/').replace(/\/$/, '');
class WorkspaceEvidence {
  constructor(workspace, directory) {
    this.workspace = workspace;
    this.file = path.join(directory, digest(path.resolve(workspace)) + '.json');
    this.readOnly = new Set(); this.baseline = {};
    this.data = { version: 1, events: [], omitted: 0 };
    try { const value = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (value.version === 1 && Array.isArray(value.events)) this.data = { ...value, events: value.events.slice(-500) }; } catch (error) { if (error.code !== 'ENOENT') this.data.historyUnavailable = true; }
    this.queue = Promise.resolve();
  }
  async begin(mode, student) {
    this.mode = mode; this.readOnly.clear(); this.baseline = {};
    if (mode === 'task') {
      let total = 0;
      const walk = async (directory, prefix = '') => {
        for (const item of await fs.promises.readdir(directory, { withFileTypes: true })) {
          if (item.isSymbolicLink()) throw new Error('Retira los enlaces simbólicos antes de iniciar la tarea.');
          const relative = prefix + item.name, absolute = path.join(directory, item.name);
          if (item.isDirectory()) await walk(absolute, relative + '/');
          else if (item.isFile()) {
            const stat = await fs.promises.stat(absolute); total += stat.size;
            if (total > 100 * 1024 * 1024 || this.readOnly.size >= 10000) throw new Error('El proyecto supera 100 MB o 10 000 archivos.');
            this.readOnly.add(relative); this.baseline[relative] = digest(await fs.promises.readFile(absolute));
          }
        }
      };
      await walk(this.workspace);
    }
    this.record('session-start', { mode, student: { name: student?.name || '', id: student?.id || '' }, existingFiles: this.readOnly.size });
    await this.persist();
  }
  protects(relative) {
    if (this.mode !== 'task') return false;
    const key = value => ['win32', 'darwin'].includes(process.platform) ? normalize(value).normalize('NFC').toLowerCase() : normalize(value);
    const name = key(relative);
    return [...this.readOnly].some(file => key(file) === name || key(file).startsWith(name + '/'));
  }
  record(type, detail = {}) {
    this.data.events.push({ at: new Date().toISOString(), type, ...detail });
    if (this.data.events.length > 500) { this.data.omitted += this.data.events.length - 500; this.data.events.splice(0, this.data.events.length - 500); }
  }
  changed(file, before, after) {
    if (before === after) return;
    let start = 0, oldEnd = before.length, newEnd = after.length;
    while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
    while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
    this.record('save', { file: normalize(file), previousHash: digest(before), sha256: digest(after), previousLength: before.length, length: after.length, change: { startUTF16: start, removedCharacters: oldEnd - start, insertedCharacters: newEnd - start, insertedText: after.slice(start, Math.min(newEnd, start + 512)), textTruncated: newEnd - start > 512 } });
  }
  persist() {
    const snapshot = JSON.stringify(this.data);
    this.queue = this.queue.catch(() => {}).then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      await fs.promises.writeFile(temporary, snapshot, { mode: 0o600 });
      await fs.promises.rename(temporary, this.file);
    });
    return this.queue;
  }
  async report() {
    const baselineChanges = [];
    for (const [file, hash] of Object.entries(this.baseline)) {
      try { if (digest(await fs.promises.readFile(path.join(this.workspace, file))) !== hash) baselineChanges.push(file); }
      catch (_) { baselineChanges.push(file); }
    }
    await this.persist();
    return { ...structuredClone(this.data), mode: this.mode || 'activity', platform: process.platform, arch: process.arch, baseline: this.baseline, baselineChanges, note: 'Actividad observada en esta instalación; no acredita autoría exclusiva. Las fechas dependen del reloj local. Los archivos de consulta alterados externamente se enumeran en baselineChanges.' };
  }
}
module.exports = { WorkspaceEvidence };
