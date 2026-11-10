const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function walk(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir,item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(js|cjs)$/.test(item.name)) {
      const moduleScript = file === path.join('webapp', 'app.js');
      const result = moduleScript
        ? spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file), stdio: ['pipe', 'inherit', 'inherit'] })
        : spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const dir of ['src','scripts','tests','webapp']) walk(dir);
console.log('Sintaxis verificada.');
