'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'build', 'icon.svg');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-icons-'));
const sizes = [16, 32, 64, 128, 256, 512, 1024];

function render(size, destination) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), source, '-o', destination]);
}

function icnsChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
}

try {
  const pngFiles = new Map();
  for (const size of sizes) {
    const pngPath = path.join(temporaryDirectory, `${size}.png`);
    render(size, pngPath);
    pngFiles.set(size, pngPath);
  }

  fs.copyFileSync(pngFiles.get(512), path.join(root, 'build', 'icon.png'));
  fs.copyFileSync(pngFiles.get(64), path.join(root, 'src', 'renderer', 'assets', 'favicon.png'));
  fs.copyFileSync(pngFiles.get(512), path.join(root, 'src', 'renderer', 'assets', 'logo.png'));
  for (const size of [32, 64, 128, 256]) {
    fs.copyFileSync(pngFiles.get(size), path.join(root, 'build', 'icons', `${size}x${size}.png`));
  }

  execFileSync('magick', [16, 32, 48, 64, 128, 256].flatMap(size => {
    const pngPath = pngFiles.get(size);
    if (pngPath) return [pngPath];
    const rendered = path.join(temporaryDirectory, `${size}.png`);
    render(size, rendered);
    return [rendered];
  }).concat(path.join(root, 'build', 'icon.ico')));

  const icnsTypes = new Map([
    [16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'],
    [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']
  ]);
  const chunks = sizes.map(size => icnsChunk(icnsTypes.get(size), fs.readFileSync(pngFiles.get(size))));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  fs.writeFileSync(path.join(root, 'build', 'icon.icns'), Buffer.concat([header, body]));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
