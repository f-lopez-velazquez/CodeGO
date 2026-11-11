/**
 * CodeGO Web SDK & Cognago Integration Core
 * Entorno de aprendizaje, lógica de programación y certificación remota de autoría.
 *
 * Soporta ejecución cliente multi-lenguaje (Python, JavaScript, C/C++, R)
 * con telemetría forense anti-plagio, firma criptográfica WebCrypto HMAC-SHA256
 * y generación de contenedores auditables .codego y certificados HTML.
 *
 * @author Francisco López Velázquez
 * @license MIT
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CodeGOSDK = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Configuración y metadatos de los lenguajes soportados
  const SUPPORTED_LANGUAGES = {
    python: {
      id: 'python',
      name: 'Python',
      icon: '🐍',
      ext: '.py',
      defaultFile: 'main.py',
      starter: '# Código en Python 3\nnombre = input("¿Cuál es tu nombre? ")\nprint(f"¡Hola, {nombre}! Bienvenido a CodeGO Web.")\n'
    },
    javascript: {
      id: 'javascript',
      name: 'JavaScript',
      icon: '🟨',
      ext: '.js',
      defaultFile: 'index.js',
      starter: '// Código en JavaScript\nconst nombre = prompt("¿Cuál es tu nombre?") || "Estudiante";\nconsole.log(`¡Hola, ${nombre}! Bienvenido a CodeGO Web.`);\n'
    },
    cpp: {
      id: 'cpp',
      name: 'C / C++',
      icon: '⚙️',
      ext: '.cpp',
      defaultFile: 'main.cpp',
      starter: '// Código en C++\n#include <iostream>\n#include <string>\n\nint main() {\n    std::string nombre;\n    std::cout << "¿Cuál es tu nombre? ";\n    std::getline(std::cin, nombre);\n    std::cout << "¡Hola, " << nombre << "! Bienvenido a CodeGO en C++." << std::endl;\n    return 0;\n}\n'
    },
    java: {
      id: 'java',
      name: 'Java',
      icon: '☕',
      ext: '.java',
      defaultFile: 'Main.java',
      starter: '// Código en Java\nimport java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("¿Cuál es tu nombre? ");\n        String nombre = sc.nextLine();\n        System.out.println("¡Hola, " + nombre + "! Bienvenido a CodeGO en Java.");\n    }\n}\n'
    },
    r: {
      id: 'r',
      name: 'R (Estadística)',
      icon: '📊',
      ext: '.R',
      defaultFile: 'script.R',
      starter: '# Código en R\ncat("¿Cuál es tu nombre? ")\nnombre <- readLines(file("stdin"), n = 1)\ncat(paste0("¡Hola, ", nombre, "! Bienvenido a CodeGO en R.\\n"))\n'
    }
  };

  /**
   * Genera un sello criptográfico HMAC-SHA256 usando Web Crypto API.
   */
  async function computeHMACSHA256(message, secret = 'codego-cognago-master-seal-2026') {
    if (!crypto || !crypto.subtle) {
      throw new Error('Web Crypto API no disponible en este navegador.');
    }
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Calcula el hash SHA-256 de una cadena de texto.
   */
  async function computeSHA256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Clase de telemetría forense para auditar actividad del estudiante.
   */
  class ForensicTelemetry {
    constructor() {
      this.reset();
    }

    reset() {
      this.startTime = Date.now();
      this.keystrokes = 0;
      this.charactersWritten = 0;
      this.externalPasteAttempts = 0;
      this.runsCount = 0;
      this.blurIncidents = [];
      this.lastKeystrokeTime = null;
      this.activeEditingSeconds = 0;
    }

    recordKeystroke(charDelta = 1) {
      const now = Date.now();
      this.keystrokes++;
      if (charDelta > 0) this.charactersWritten += charDelta;
      if (this.lastKeystrokeTime) {
        const diff = (now - this.lastKeystrokeTime) / 1000;
        if (diff < 4) {
          this.activeEditingSeconds += diff;
        }
      }
      this.lastKeystrokeTime = now;
    }

    recordPasteAttempt() {
      this.externalPasteAttempts++;
    }

    recordRun() {
      this.runsCount++;
    }

    recordBlur(durationSeconds = 0) {
      if (this.blurIncidents.length >= 1000) this.blurIncidents.shift();
      this.blurIncidents.push({
        timestamp: new Date().toISOString(),
        duration: durationSeconds
      });
    }

    getReport() {
      const totalSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
      return {
        keystrokes: this.keystrokes,
        charactersWritten: this.charactersWritten,
        externalPasteAttempts: this.externalPasteAttempts,
        runsCount: this.runsCount,
        blurCount: this.blurIncidents.length,
        totalTimeSeconds: totalSeconds,
        activeEditingSeconds: Math.round(this.activeEditingSeconds),
        wordsPerMinute: Math.round((this.charactersWritten / 5) / (Math.max(1, this.activeEditingSeconds) / 60))
      };
    }
  }

  /**
   * Motor de ejecución en el navegador (WebAssembly & JS Sandbox).
   */
  class WebExecutionEngine {
    constructor({ onOutput, onFinished, onInput, workerURL, timeoutMs = 120000 } = {}) {
      this.onOutput = onOutput || (() => {});
      this.onFinished = onFinished || (() => {});
      this.onInput = onInput || (() => {});
      const base = typeof document !== 'undefined' ? document.currentScript?.src || document.baseURI : undefined;
      this.workerURL = workerURL || (base ? new URL('execution-worker.js', base).href : 'execution-worker.js');
      this.timeoutMs = timeoutMs;
      this.pending = null;
      this.inputURL = base ? new URL('__codego_stdin__/', this.workerURL).href : null;
    }
    async prepareInput() {
      if (!navigator.serviceWorker) throw new Error('Este navegador no permite la consola interactiva. Abre CodeGO con HTTPS y permite su almacenamiento.');
      let timeout;
      try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('No se preparó la consola. Recarga CodeGO y vuelve a ejecutar.')), 10000); })]); }
      finally { clearTimeout(timeout); }
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve, reject) => {
          const ready = () => { if (navigator.serviceWorker.controller) { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', ready); resolve(); } };
          const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', ready); reject(new Error('Recarga CodeGO para activar la consola interactiva.')); }, 10000);
          navigator.serviceWorker.addEventListener('controllerchange', ready); ready();
        });
      }
      const response = await fetch(this.inputURL + 'ready', { cache: 'no-store' });
      const protocol = response.ok ? await response.json().catch(() => null) : null;
      if (protocol?.protocol !== 1) throw new Error('Hay una actualización de la consola. Recarga CodeGO para usarla.');
    }
    pauseBudget() {
      clearTimeout(this.timer);
      if (this.budgetStarted != null) this.remainingMs = Math.max(0, this.remainingMs - (performance.now() - this.budgetStarted));
      this.budgetStarted = null;
    }
    resumeBudget() {
      this.pauseBudget();
      this.budgetStarted = performance.now();
      this.timer = setTimeout(() => this.stop('Tiempo máximo de ejecución alcanzado.'), this.remainingMs);
    }
    run(code, language = 'python', options = {}) {
      if (this.pending) return Promise.reject(new Error('Ya hay un programa en ejecución.'));
      const runId = crypto.randomUUID();
      const completion = new Promise((resolve, reject) => { this.pending = { resolve, reject, runId }; });
      void (async () => { try {
          await this.prepareInput();
          if (this.pending?.runId !== runId) return;
          // Reuse the warm interpreter. Globals and mounted files reset on each run.
          if (!this.worker) this.worker = new Worker(this.workerURL);
          this.remainingMs = this.timeoutMs;
          this.resumeBudget();
          this.worker.onmessage = ({ data }) => {
            if (this.pending?.runId !== runId) return;
            if (data.type === 'output') this.onOutput(data.text, data.stream);
            else if (data.type === 'status') this.onOutput(data.text + '\n', 'system');
            else if (data.type === 'input') {
              this.pauseBudget(); this.waiting = { sequence: data.sequence, runId }; this.inputSending = false; this.onInput(this.waiting);
            } else if (data.type === 'input-consumed') {
              if (this.waiting?.sequence === data.sequence) { this.waiting = null; this.inputSending = false; this.onInput(null); this.resumeBudget(); }
            }
            else if (data.type === 'finished') this.finish(data);
          };
          this.worker.onerror = () => {
            this.onOutput('No se pudo cargar el motor. Comprueba la conexión y vuelve a ejecutar.\n', 'stderr');
            this.finish({ exitCode: 1, duration: 0 });
          };
          this.worker.postMessage({ ...options, type: 'run', code, language, runId, inputURL: this.inputURL });
      } catch (error) {
          if (this.pending?.runId !== runId) return;
          this.worker?.terminate();
          this.worker = null;
          clearTimeout(this.timer);
          const { reject } = this.pending;
          this.pending = null;
          reject(error);
      } })();
      return completion;
    }
    async sendInput(value, eof = false) {
      const waiting = this.waiting;
      if (!waiting || this.inputSending || !this.pending) return false;
      if (typeof value !== 'string' || value.length > 65536) throw new Error('La respuesta debe tener como máximo 65 536 caracteres.');
      this.inputSending = true;
      try {
        const response = await fetch(`${this.inputURL}${waiting.runId}/${waiting.sequence}`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value, eof }) });
        if (!response.ok) throw new Error('No se pudo enviar la respuesta. Inténtalo otra vez.');
        return true;
      } catch (error) { if (this.waiting === waiting) this.inputSending = false; throw error; }
    }
    finish(result) {
      if (!this.pending) return;
      const { resolve, runId } = this.pending;
      this.pending = null;
      this.pauseBudget();
      this.waiting = null; this.inputSending = false; this.onInput(null);
      void fetch(`${this.inputURL}${runId}/cancel`, { method: 'POST', cache: 'no-store' }).catch(() => {});
      if (result.stopped || result.exitCode === 1) { this.worker?.terminate(); this.worker = null; }
      this.onFinished(result);
      resolve(result);
    }
    stop(message = 'Ejecución detenida.') {
      if (!this.pending) return;
      this.onOutput(message + '\n', 'system');
      this.finish({ exitCode: 130, duration: 0, stopped: true });
    }
  }

  /**
   * Generador de Certificados HTML de actividad local.
   */
  async function generateCertificateHTML({ student, subject, language, code, telemetry, hmacSignature }) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    student = { name: escape(student?.name), id: escape(student?.id) };
    subject = escape(subject);
    language = escape(language);
    hmacSignature = escape(hmacSignature);
    telemetry = Object.fromEntries(['charactersWritten', 'keystrokes', 'externalPasteAttempts', 'activeEditingSeconds', 'runsCount', 'wordsPerMinute'].map(key => [key, Math.max(0, Number(telemetry?.[key]) || 0)]));
    const codeHash = await computeSHA256(code);
    const dateFormatted = new Date().toLocaleString('es-MX', {
      dateStyle: 'full',
      timeStyle: 'medium'
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Reporte de actividad — ${student.name || 'Estudiante'} | CodeGO ExamGuard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #080b12; color: #f0f6fc; margin: 0; padding: 40px 20px; }
    .cert-box { max-width: 840px; margin: 0 auto; background: #0d121c; border: 1px solid rgba(88,166,255,0.3); border-radius: 16px; padding: 36px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
    .cert-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(63,185,80,0.15); border: 1px solid #3fb950; color: #3fb950; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px; }
    h1 { font-size: 26px; margin: 18px 0 8px; color: #fff; }
    .subtitle { color: #8b949e; font-size: 14px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; }
    .card-label { font-size: 11px; text-transform: uppercase; color: #8b949e; margin-bottom: 4px; }
    .card-val { font-size: 17px; font-weight: 700; color: #58a6ff; }
    .code-container { background: #05080f; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px; font-family: monospace; font-size: 13px; overflow-x: auto; white-space: pre; margin-top: 20px; max-height: 400px; color: #e6edf3; }
    .signature-bar { background: rgba(88,166,255,0.06); border: 1px solid rgba(88,166,255,0.2); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; margin-top: 24px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="cert-box">
    <div class="cert-badge">✓ REPORTE DE ACTIVIDAD WEB</div>
    <h1>${student.name || 'Estudiante'} (${student.id || 'N/A'})</h1>
    <p class="subtitle">Materia: <strong>${subject || 'Programación'}</strong> · Lenguaje: <strong>${language.toUpperCase()}</strong> · Emitido: ${dateFormatted}</p>

    <div class="grid">
      <div class="card"><div class="card-label">Caracteres Tipeados</div><div class="card-val">${telemetry.charactersWritten}</div></div>
      <div class="card"><div class="card-label">Pulsaciones de Tecla</div><div class="card-val">${telemetry.keystrokes}</div></div>
      <div class="card"><div class="card-label">Pegados Externos</div><div class="card-val" style="color: ${telemetry.externalPasteAttempts === 0 ? '#3fb950' : '#f85149'};">${telemetry.externalPasteAttempts} intentos</div></div>
      <div class="card"><div class="card-label">Tiempo Activo</div><div class="card-val">${Math.round(telemetry.activeEditingSeconds)} s</div></div>
      <div class="card"><div class="card-label">Ejecuciones de Prueba</div><div class="card-val">${telemetry.runsCount}</div></div>
      <div class="card"><div class="card-label">Velocidad Promedio</div><div class="card-val">${telemetry.wordsPerMinute} PPM</div></div>
    </div>

    <div class="signature-bar">
      <div><strong>Sello Criptográfico HMAC-SHA256:</strong></div>
      <div>${hmacSignature}</div>
      <p>Reporte local: la clave HMAC es pública. Este archivo no acredita autoría ni equivale a una entrega Ed25519 de escritorio.</p>
      <div style="margin-top: 6px;"><strong>Hash SHA-256 del Código:</strong> ${codeHash}</div>
    </div>

    <h3 style="margin-top: 28px; font-size: 16px;">Código Fuente Auditado:</h3>
    <div class="code-container">${escape(code)}</div>
  </div>
</body>
</html>`;
  }

  /**
   * Crea y monta un entorno completo de CodeGO en cualquier contenedor web.
   */
  function createCodeGOEnvironment(config = {}) {
    const container = typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;

    if (!container) {
      throw new Error(`Contenedor CodeGO no encontrado: ${config.container}`);
    }

    const language = Object.hasOwn(SUPPORTED_LANGUAGES, config.language) ? config.language : 'python';
    const mode = ['activity', 'task', 'exam'].includes(config.mode) ? config.mode : 'activity'; // 'task' | 'exam' | 'activity'
    const student = config.student || { name: 'Estudiante', id: '0001' };
    const subject = config.subject || 'Lógica de Programación';
    const onSubmission = config.onSubmission || (() => {});

    const telemetry = new ForensicTelemetry();
    const html = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    let currentCode = config.initialCode || SUPPORTED_LANGUAGES[language]?.starter || '';

    // Renderizar interfaz
    container.innerHTML = `
      <div class="codego-embed-wrapper" style="display:flex; flex-direction:column; height:100%; min-height:480px; background:#0d121c; color:#f0f6fc; font-family:sans-serif; border:1px solid rgba(88,166,255,0.2); border-radius:12px; overflow:hidden;">
        <div class="codego-embed-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:#080b12; border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:15px; color:#58a6ff;">Code<span style="color:#fff;">GO</span> Web</span>
            <span style="font-size:11px; padding:2px 8px; background:rgba(88,166,255,0.1); border:1px solid rgba(88,166,255,0.3); border-radius:999px; color:#58a6ff;">${SUPPORTED_LANGUAGES[language]?.name || language}</span>
            <span style="font-size:11px; padding:2px 8px; background:rgba(63,185,80,0.1); border:1px solid #3fb950; border-radius:999px; color:#3fb950;">${mode.toUpperCase()}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="codego-btn-run" style="background:#3fb950; color:#080b12; border:none; padding:6px 14px; border-radius:6px; font-weight:700; cursor:pointer; font-size:12px;">▶ Ejecutar</button>
            ${mode !== 'activity' ? '<button class="codego-btn-submit" style="background:#58a6ff; color:#080b12; border:none; padding:6px 14px; border-radius:6px; font-weight:700; cursor:pointer; font-size:12px;">Entregar reporte</button>' : ''}
          </div>
        </div>
        <div class="codego-embed-body" style="display:flex; flex:1; min-height:0;">
          <div style="flex:1; display:flex; flex-direction:column; border-right:1px solid rgba(255,255,255,0.08);">
            <textarea class="codego-editor" style="flex:1; width:100%; border:none; background:#0a0e17; color:#e6edf3; font-family:monospace; font-size:13px; padding:14px; box-sizing:border-box; resize:none; outline:none;" spellcheck="false">${html(currentCode)}</textarea>
          </div>
          <div style="width:40%; display:flex; flex-direction:column; background:#05080f;">
            <div style="padding:6px 12px; background:rgba(255,255,255,0.03); font-size:11px; text-transform:uppercase; color:#8b949e; border-bottom:1px solid rgba(255,255,255,0.06);">Terminal Interactiva</div>
            <pre class="codego-terminal" style="flex:1; margin:0; padding:12px; font-family:monospace; font-size:12px; color:#58a6ff; overflow-y:auto; white-space:pre-wrap;"></pre>
          </div>
        </div>
      </div>
    `;

    const editorEl = container.querySelector('.codego-editor');
    const termEl = container.querySelector('.codego-terminal');
    const btnRun = container.querySelector('.codego-btn-run');
    const btnSubmit = container.querySelector('.codego-btn-submit');

    const engine = new WebExecutionEngine({
      onOutput: (text, type) => {
        termEl.textContent = (termEl.textContent + text).slice(-200000);
        termEl.scrollTop = termEl.scrollHeight;
      },
      onFinished: (res) => {
        termEl.textContent += `\n[Proceso terminado con código ${res.exitCode} (${res.duration}s)]\n`;
        termEl.scrollTop = termEl.scrollHeight;
      }
    });

    // Auditoría de teclado y bloqueo de pegado
    editorEl.addEventListener('input', (e) => {
      currentCode = editorEl.value;
      telemetry.recordKeystroke(e.data ? e.data.length : 1);
    });

    if (mode !== 'activity') {
      ['copy', 'cut', 'paste', 'drop'].forEach(type => editorEl.addEventListener(type, event => {
        event.preventDefault();
        if (type === 'paste') telemetry.recordPasteAttempt();
      }));
      editorEl.addEventListener('beforeinput', event => {
        if (/insertFromPaste|insertFromDrop|deleteByCut/.test(event.inputType)) event.preventDefault();
      });
    }

    btnRun.addEventListener('click', () => {
      telemetry.recordRun();
      termEl.textContent = '';
      btnRun.disabled = true;
      engine.run(currentCode, language).catch(error => { termEl.textContent += error.message; }).finally(() => { btnRun.disabled = false; });
    });

    if (btnSubmit) {
      btnSubmit.addEventListener('click', async () => {
        if (!confirm('¿Deseas sellar y entregar esta tarea con reporte de actividad?')) return;
        const report = telemetry.getReport();
        const seal = await computeHMACSHA256(currentCode + JSON.stringify(report));
        const certHtml = await generateCertificateHTML({
          student,
          subject,
          language,
          code: currentCode,
          telemetry: report,
          hmacSignature: seal
        });

        // Disparar callback
        onSubmission({
          student,
          subject,
          language,
          code: currentCode,
          telemetry: report,
          hmacSignature: seal,
          certificateHTML: certHtml
        });

        alert(`✓ Tarea entregada con éxito.\nSello digital generado: ${seal.slice(0, 16)}...`);
      });
    }

    return {
      getCode: () => currentCode,
      setCode: (newCode) => {
        currentCode = newCode;
        editorEl.value = newCode;
      },
      getTelemetry: () => telemetry.getReport(),
      run: () => btnRun.click(),
      stop: () => engine.stop(),
      destroy: () => { engine.stop(); engine.worker?.terminate(); container.replaceChildren(); }
    };
  }

  return {
    SUPPORTED_LANGUAGES,
    computeHMACSHA256,
    computeSHA256,
    generateCertificateHTML,
    ForensicTelemetry,
    WebExecutionEngine,
    createCodeGOEnvironment
  };
}));
