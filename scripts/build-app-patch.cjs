const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const outputDirectory = path.resolve(process.argv[2] || path.join(root, 'dist', 'patch'));
const staging = path.join(root, 'dist', '.app-patch-staging');
const filename = `CodeGO-${pkg.version}-app.asar`;
const output = path.join(outputDirectory, filename);

async function main() {
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  fs.cpSync(path.join(root, 'src'), path.join(staging, 'src'), { recursive: true });
  fs.mkdirSync(path.join(staging, 'build'), { recursive: true });
  fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(staging, 'build', 'icon.png'));
  fs.copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'));
  fs.mkdirSync(path.join(staging, 'node_modules'), { recursive: true });
  fs.cpSync(path.join(root, 'node_modules', 'adm-zip'), path.join(staging, 'node_modules', 'adm-zip'), { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  await asar.createPackage(staging, output);
  const data = fs.readFileSync(output);
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  fs.writeFileSync(`${output}.sha256`, `${digest}  ${filename}\n`);
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`${filename}: ${(data.length / 1024 / 1024).toFixed(2)} MB · sha256:${digest}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
