const path = require('node:path');

const TEXT_EXTENSIONS = new Set(['.py', '.pyw', '.txt', '.md', '.json', '.jsonl', '.csv', '.tsv', '.xml', '.html', '.css', '.js', '.mjs', '.cjs', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.sql']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a']);

function classifyWorkspaceFile(fileName) {
  const extension = path.extname(String(fileName)).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return { kind: extension === '.py' || extension === '.pyw' ? 'python' : 'text', editable: true };
  if (IMAGE_EXTENSIONS.has(extension)) return { kind: 'image', editable: extension === '.svg' };
  if (AUDIO_EXTENSIONS.has(extension)) return { kind: 'audio', editable: false };
  return { kind: 'binary', editable: false };
}

module.exports = { classifyWorkspaceFile, TEXT_EXTENSIONS, IMAGE_EXTENSIONS, AUDIO_EXTENSIONS };
