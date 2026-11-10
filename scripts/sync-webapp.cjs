const fs = require('node:fs');
const path = require('node:path');
// Publish the very same implementation under the existing product website.
const source = path.resolve(__dirname, '../webapp');
const target = path.resolve(__dirname, '../website/codego/webapp');
fs.cpSync(source, target, { recursive: true });
console.log('Webapp del sitio sincronizada con webapp/.');
