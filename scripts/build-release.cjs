const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const platform = process.platform;
const version = require('../package.json').version;
function requireVariables(names) {
  for (const name of names) if (!process.env[name]) throw new Error(`Falta ${name}; no se generarán instaladores de producción sin firma.`);
}
if (platform === 'win32') requireVariables(['CSC_LINK','CSC_KEY_PASSWORD']);
if (platform === 'darwin') requireVariables(['CSC_LINK','CSC_KEY_PASSWORD','APPLE_API_KEY','APPLE_API_KEY_ID','APPLE_API_ISSUER']);
if (!['linux','win32','darwin'].includes(platform)) throw new Error('Plataforma de compilación no admitida.');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('La etiqueta debe coincidir con la versión de package.json.');
const args = ['--publish','never'];
if (platform === 'linux') args.push('--linux','AppImage','tar.gz');
if (platform === 'win32') args.push('--win','nsis','portable','-c.win.forceCodeSigning=true');
if (platform === 'darwin') args.push('--mac','dmg','zip','-c.mac.forceCodeSigning=true','-c.mac.notarize=true');
const result = spawnSync(process.execPath,[require.resolve('electron-builder/cli.js'),...args],{stdio:'inherit',env:{...process.env,DEBUG:''}});
if (result.status !== 0) process.exit(result.status || 1);
const files = fs.readdirSync('dist').filter(name=>name.includes(`-${version}-`) && /\.(AppImage|tar\.gz|exe|dmg|zip)$/.test(name));
if (!files.length) throw new Error('No se generaron artefactos de esta versión.');
const checksums = files.sort().map(name=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join('dist',name))).digest('hex')}  ${name}`).join('\n')+'\n';
fs.writeFileSync(`dist/SHA256SUMS-${platform}-${process.arch}.txt`,checksums);
