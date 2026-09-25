const { spawn } = require('node:child_process');
const path = require('node:path');

class PythonRunner {
  constructor({ send, onProcess = () => {} }) {
    this.send = send;
    this.onProcess = onProcess;
    this.child = null;
  }

  run(command, filePath) {
    if (this.child) return { success: false, error: 'Ya hay un proceso de Python en ejecución.' };
    const started = Date.now();
    try {
      const environment = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
      delete environment.CODEGO_TEACHER_PIN;
      const child = spawn(command, ['-u', filePath], {
        cwd: path.dirname(filePath),
        env: environment
      });
      this.child = child;
      this.onProcess(child);
      // Stream decoders preserve accented characters split between OS buffers.
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => this.send('python:stdout', chunk));
      child.stderr.on('data', chunk => this.send('python:stderr', chunk));
      // EPIPE can arrive asynchronously after Python exits; never crash Electron.
      child.stdin.on('error', () => {});
      child.on('error', error => {
        this.send('python:stderr', `No se pudo iniciar Python: ${error.message}\n`);
      });
      child.once('close', (exitCode, signal) => {
        if (this.child !== child) return;
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
      const success = this.child.kill('SIGKILL');
      // Keep the process owned until close; a new run must not race the old close event.
      return success ? { success: true } : { success: false, error: 'No se pudo detener el proceso.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
module.exports = { PythonRunner };
