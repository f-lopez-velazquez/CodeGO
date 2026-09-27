const { spawn } = require('node:child_process');
const electron = require('electron');

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_NO_ATTACH_CONSOLE;

const child = spawn(electron, ['.'], { env: environment, stdio: 'inherit' });
child.once('error', error => {
  console.error(`No se pudo iniciar codeGO: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});
