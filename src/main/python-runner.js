const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const { ProcessOutputBuffer } = require('./process-output-buffer');

class PythonRunner {
  constructor({ send, onProcess = () => {} }) {
    this.send = send;
    this.onProcess = onProcess;
    this.child = null;
    this.outputBuffer = null;
  }

  run(command, filePath, options = {}) {
    if (this.child) return { success: false, error: 'Ya hay un proceso de Python en ejecución.' };
    const started = Date.now();
    try {
      const requestedDirectory = options.workingDirectory && path.resolve(options.workingDirectory);
      const workingDirectory = requestedDirectory || path.dirname(filePath);
      const environment = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYGAME_HIDE_SUPPORT_PROMPT: '1',
        SDL_VIDEO_CENTERED: '1',
        SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: '0',
        CODEGO_PROJECT_ROOT: workingDirectory
      };
      delete environment.CODEGO_TEACHER_PIN;
      delete environment.ELECTRON_RUN_AS_NODE;
      const child = spawn(command, ['-u', filePath], {
        cwd: workingDirectory,
        env: environment,
        detached: process.platform !== 'win32',
        windowsHide: true
      });
      this.child = child;
      const outputBuffer = new ProcessOutputBuffer({ send: this.send });
      this.outputBuffer = outputBuffer;
      this.onProcess(child);
      // Stream decoders preserve accented characters split between OS buffers.
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => outputBuffer.write('python:stdout', chunk));
      child.stderr.on('data', chunk => outputBuffer.write('python:stderr', chunk));
      // EPIPE can arrive asynchronously after Python exits; never crash Electron.
      child.stdin.on('error', () => {});
      child.on('error', error => {
        this.send('python:stderr', `No se pudo iniciar Python: ${error.message}\n`);
      });
      child.once('close', (exitCode, signal) => {
        if (this.child !== child) return;
        outputBuffer.close();
        if (this.outputBuffer === outputBuffer) this.outputBuffer = null;
        this.child = null;
        this.onProcess(null);
        this.send('python:finished', { exitCode, signal, duration: Number(((Date.now() - started) / 1000).toFixed(2)) });
      });
      return { success: true };
    } catch (error) {
      this.child = null;
      this.onProcess(null);
      return { success: false, error: error.message };
    }
  }

  stdin(value) {
    const child = this.child;
    if (typeof value !== 'string' || value.length > 65536) return Promise.resolve({ success: false, error: 'Entrada no válida o demasiado larga.' });
    if (!child || child.killed || !child.stdin.writable || child.stdin.destroyed) {
      return Promise.resolve({ success: false, error: 'No hay proceso interactivo activo.' });
    }
    return new Promise(resolve => {
      child.stdin.write(`${value}\n`, 'utf8', error => resolve(error
        ? { success: false, error: 'Python terminó antes de recibir los datos.' }
        : { success: true }));
    });
  }

  kill() {
    if (!this.child) return { success: false, error: 'No hay proceso que detener.' };
    try {
      const pid = this.child.pid;
      let success = false;
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 4000 });
        success = true;
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
          success = true;
        } catch (_) {
          success = this.child.kill('SIGKILL');
        }
        try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      }
      try { this.child.stdin.destroy(); } catch (_) {}
      // Keep the process owned until close; a new run must not race the old close event.
      return success ? { success: true } : { success: false, error: 'No se pudo detener el proceso.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
module.exports = { PythonRunner };
