// Public previews are explicitly separate from the signed production workflow.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const version = require('../package.json').version;
const platform = process.platform;
const arch = process.arch;
const expected = platform === 'linux' ? ['AppImage', 'tar.gz'] : platform === 'win32' ? ['setup', 'portable'] : ['dmg', 'zip'];
fs.mkdirSync('downloads', {recursive: true});
const files = fs.readdirSync('dist').filter(name => name.startsWith(`CodeGO ExamGuard-${version}-`) && /\.(AppImage|tar\.gz|exe|dmg|zip)$/.test(name));
if (files.length !== expected.length || expected.some(type => !files.some(name => name.includes(type)))) throw Error('Faltan instaladores esperados.');
const checksums = [];
for (const file of files.sort()) {
  const name = file.replace('CodeGO ExamGuard', 'CodeGO').replace('-x86_64.', '-x64.');
  const data = fs.readFileSync(path.join('dist', file));
  fs.writeFileSync(path.join('downloads', name), data);
  checksums.push(`${crypto.createHash('sha256').update(data).digest('hex')}  ${name}`);
}
const evidence = JSON.parse(fs.readFileSync(`reports/packaged-${platform}-${arch}.json`, 'utf8'));
if (!evidence.success || !evidence.packaged || evidence.version !== version) throw Error('Falta comprobación exitosa del paquete.');
fs.writeFileSync(`downloads/SHA256SUMS-${platform}-${arch}.txt`, checksums.join('\n') + '\n');
fs.writeFileSync(`downloads/provenance-${platform}-${arch}.json`, JSON.stringify({
  version, platform, arch, commit: process.env.GITHUB_SHA || null,
  workflow: process.env.GITHUB_RUN_ID || null,
  distribution: 'public-preview', developerSigned: false, notarized: false,
  packagedChecks: evidence.checks,
}, null, 2) + '\n');
