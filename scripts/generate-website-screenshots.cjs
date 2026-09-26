const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PythonRunner } = require('../src/main/python-runner');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-screenshots-'));
app.setPath('userData', path.join(dir, 'user-data'));
app.disableHardwareAcceleration();

const python = process.platform === 'win32' ? 'python' : 'python3';
const sampleCode = `# Proyecto: Control de Sensores e Integración de Hardware
import time
try:
    import serial
    print("🔌 Conectando con placa Arduino / ESP32 en /dev/ttyUSB0...")
except ImportError:
    print("Modo de simulación activa.")

def leer_sensor(pin_id):
    """Detecta pulsación de botón en protoboard o periférico"""
    return f"Señal recibida en PIN {pin_id}: Estado ALTO"

nombre = input("Ingresa tu nombre: ")
print(f"Bienvenido a CodeGO, {nombre}!")
materia = input("Materia o actividad: ")
print(f"Iniciando práctica para: {materia}...")
print(leer_sensor(4))
print("Sistema listo. Ejecución completada con éxito.")
`;

fs.writeFileSync(path.join(dir, 'main.py'), sampleCode);
let window, runner;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = script => window.webContents.executeJavaScript(script);

app.whenReady().then(async () => {
  try {
    const fixtureHandlers = {
      'window:set-fullscreen': () => ({ success: true }),
      'system:self-test': () => ({ success: true, details: 'Entorno 100% validado' }),
      'wifi:get-status': () => ({ disabled: false }),
      'system:check-full-environment': () => ({
        hasPython: true,
        python: { command: '/usr/bin/python3', version: 'Python 3.12.8', isVenv: true },
        platform: process.platform,
        displaysCount: 1,
        missingCount: 0,
        essentialKeys: ['pygame', 'numpy', 'matplotlib', 'pandas', 'requests', 'PIL', 'scipy', 'seaborn', 'openpyxl', 'sympy', 'colorama', 'serial'],
        packages: {
          pygame: { installed: true, version: '2.6.1', desc: 'Motor de juegos y gráficos 2D' },
          numpy: { installed: true, version: '2.2.0', desc: 'Cálculo numérico y álgebra de matrices' },
          matplotlib: { installed: true, version: '3.10.0', desc: 'Gráficas, diagramas y visualización' },
          pandas: { installed: true, version: '2.2.3', desc: 'Análisis de datos y DataFrames' },
          requests: { installed: true, version: '2.32.3', desc: 'Peticiones HTTP, APIs REST y web' },
          PIL: { installed: true, version: '11.0.0', desc: 'Procesamiento de imágenes (Pillow)' },
          scipy: { installed: true, version: '1.14.1', desc: 'Algoritmos científicos y optimización' },
          seaborn: { installed: true, version: '0.13.2', desc: 'Visualización estadística avanzada' },
          openpyxl: { installed: true, version: '3.1.5', desc: 'Lectura y escritura de hojas Excel' },
          sympy: { installed: true, version: '1.13.3', desc: 'Matemáticas simbólicas y álgebra' },
          colorama: { installed: true, version: '0.4.6', desc: 'Colores y estilos de terminal' },
          serial: { installed: true, version: '3.5', desc: 'Comunicación serial con Arduino / ESP32 (PySerial)' },
          sqlite3: { installed: true, version: '3.45.1', desc: 'Base de datos SQL estándar' },
          tkinter: { installed: true, version: '8.6', desc: 'Interfaces gráficas de usuario (GUI)' }
        }
      }),
      'wifi:disable': () => ({ success: true }),
      'wifi:restore': () => ({ success: true }),
      'task:submit': () => ({ success: true, filePath: '/tmp/tarea.codego', fileName: 'TAREA_Robotica.codego' }),
      'submission:open-file-dialog': () => ({ success: true, filePath: '/tmp/TAREA_Robotica_FranciscoLopez.codego' }),
      'submission:verify-file': () => ({
        success: true,
        authentic: true,
        mode: 'task',
        fileName: 'TAREA_Robotica_FranciscoLopez.codego',
        student: { name: 'Francisco López Velázquez', subject: 'Robótica y Sensores', id: '2026-FLV' },
        telemetry: {
          keystrokesCount: 1450,
          charactersTyped: 1200,
          activeTypingSeconds: 1800,
          externalPasteAttempts: 0,
          pythonRunsCount: 4,
          focusIncidentsCount: 0
        },
        date: '2026-09-26T10:30:00.000Z',
        files: 3,
        fileList: [
          { path: 'main.py', size: 840, content: sampleCode },
          { path: 'sensores/calibracion.py', size: 420, content: 'def calibrar_puerto(puerto):\n    print(f"Calibrando {puerto}...")\n    return True\n' },
          { path: 'sensores/puerto_serial.py', size: 310, content: 'import serial\ndef conectar():\n    return serial.Serial("/dev/ttyUSB0", 9600)\n' }
        ]
      }),
      'submission:extract-code': () => ({ success: true, extractedCount: 3, targetDirectory: '/home/docente/tareas/' }),
      'fs:list-workspace': () => ({
        success: true,
        tree: [
          { name: 'main.py', path: 'main.py', type: 'file' },
          {
            name: 'sensores',
            path: 'sensores',
            type: 'folder',
            children: [
              { name: 'calibracion.py', path: 'sensores/calibracion.py', type: 'file' },
              { name: 'puerto_serial.py', path: 'sensores/puerto_serial.py', type: 'file' }
            ]
          },
          {
            name: 'datos',
            path: 'datos',
            type: 'folder',
            children: [
              { name: 'muestras.csv', path: 'datos/muestras.csv', type: 'file' }
            ]
          }
        ]
      }),
      'fs:read-file': (_, name) => ({ success: true, content: fs.readFileSync(path.join(dir, name), 'utf8') }),
      'fs:save-file': (_, data) => { fs.writeFileSync(path.join(dir, data.relativePath), data.content); return { success: true }; },
      'python:run': (_, data) => runner.run(python, path.join(dir, data.relativePath)),
      'python:stdin': (_, value) => runner.stdin(value),
      'python:kill': () => runner.kill(),
      'system:enforce-audio': () => ({ success: true }),
      'system:beep': () => ({ success: true }),
      'hardware:list-serial-ports': () => ({
        success: true,
        ports: [
          { path: '/dev/ttyUSB0', name: 'ttyUSB0', description: 'Arduino Uno (CH340 Serial)' },
          { path: '/dev/ttyACM0', name: 'ttyACM0', description: 'ESP32 NodeMCU DevKit' }
        ]
      })
    };

    for (const [channel, handler] of Object.entries(fixtureHandlers)) {
      ipcMain.handle(channel, handler);
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    console.log(`Display resolution: ${screenW}x${screenH}`);

    window = new BrowserWindow({
      show: true,
      width: 1280,
      height: 720,
      frame: false,
      fullscreen: true,
      webPreferences: {
        preload: path.resolve(__dirname, '../src/preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    window.webContents.on('console-message', (e, level, message) => console.log('Renderer console:', message));

    runner = new PythonRunner({ send: (channel, data) => window.webContents.send(channel, data) });
    await window.loadFile(path.resolve(__dirname, '../src/renderer/index.html'));
    await sleep(1200);
    console.log('Window size after fullscreen load:', window.getSize(), (await window.webContents.capturePage()).getSize());

    const outDir = path.resolve(__dirname, '../website/codego');
    fs.mkdirSync(outDir, { recursive: true });

    // 1. CAPTURA: HOME / LOBBY (CON SELECTOR DE 3 MODOS Y BOTÓN DE VERIFICACIÓN DOCENTE)
    console.log('Capturando Home / Lobby...');
    await evaluate("loadEnvironmentDiagnostics();");
    await sleep(400);
    const homeBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-lobby.png'), homeBuffer);

    // 2. CAPTURA: GESTOR DE LIBRERÍAS Y HARDWARE
    console.log('Capturando Gestor de Librerías y Hardware...');
    await evaluate("DOM.modalPackageManager.classList.remove('hidden'); loadEnvironmentDiagnostics();");
    await sleep(500);
    const packagesBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-packages.png'), packagesBuffer);
    await evaluate("DOM.modalPackageManager.classList.add('hidden');");

    // 3. CAPTURA: HERRAMIENTA FORENSE DE VERIFICACIÓN DOCENTE
    console.log('Capturando Verificador Forense para Docentes...');
    await evaluate(`
      openVerifySubmissionModal();
      verifyFileByPath('/tmp/TAREA_Robotica_FranciscoLopez.codego');
    `);
    await sleep(600);
    const verifierBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-verificador.png'), verifierBuffer);
    await evaluate("if (DOM.modalVerifySubmission) DOM.modalVerifySubmission.classList.add('hidden');");

    // 4. CAPTURA: IDE WORKSPACE CON ÁRBOL DE CARPETAS Y BREADCRUMBS (MODO ACTIVIDAD)
    console.log('Capturando IDE Workspace (Modo Actividad)...');
    await evaluate(`
      setSessionMode('activity');
      DOM.navSubjectLabel.textContent = 'Robótica & Python';
      DOM.navStudentLabel.textContent = 'Francisco López';
      enterIdeWorkspace();
      DOM.terminalPanel.style.setProperty('--terminal-size', '44%');
      updateBreadcrumbs('sensores/calibracion.py');
    `);
    await sleep(700);
    await evaluate(`
      DOM.terminalTranscript.innerHTML = '';
      appendTerminalOutput("Tu programa, paso a paso.\\nEjecuta con F5. Escribe en esta terminal y pulsa Enter cuando Python pida datos.\\n");
      appendTerminalOutput(">>> Ejecutando main.py...\\n🔌 Conectando con placa Arduino / ESP32 en /dev/ttyUSB0...\\nIngresa tu nombre: Francisco López\\nBienvenido a CodeGO, Francisco López!\\nMateria o actividad: Robótica y Sensores\\nIniciando práctica para: Robótica y Sensores...\\nSeñal recibida en PIN 4: Estado ALTO\\nSistema listo. Ejecución completada con éxito.\\n[Proceso terminado con código 0 (0.8s)]\\n");
      if (DOM.terminalStdinInput) DOM.terminalStdinInput.disabled = true;
    `);
    await sleep(500);
    const ideBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-ide.png'), ideBuffer);

    // 5. CAPTURA: MODO TAREA CERTIFICADA (CON BOTÓN ENTREGAR TAREA CERTIFICADA Y BREADCRUMBS)
    console.log('Capturando Modo Tarea Certificada...');
    await evaluate(`
      setSessionMode('task');
      DOM.navSubjectLabel.textContent = 'Tarea 1: Algoritmos de Sensores';
      DOM.navStudentLabel.textContent = 'Francisco López';
      enterIdeWorkspace();
      DOM.terminalPanel.style.setProperty('--terminal-size', '44%');
      updateBreadcrumbs('main.py');
    `);
    await sleep(600);
    const taskBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-task.png'), taskBuffer);

    // 6. CAPTURA: ALERTA ESTROBOSCÓPICA DOCENTE DE 12 SEGUNDOS
    console.log('Capturando Alerta Estroboscópica Docente...');
    await evaluate("handleSecurityViolation({ timestamp: '10:30:15', durationSeconds: 12.0 });");
    await sleep(500);
    const alertBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-alerta.png'), alertBuffer);
    await evaluate("DOM.modalFocusWarning.classList.add('hidden');");

    // 7. CAPTURA: MODO EXAMEN BLINDADO (CON TEMPORIZADOR Y BOTÓN ENTREGAR)
    console.log('Capturando Modo Examen Blindado...');
    await evaluate(`
      setSessionMode('exam');
      DOM.navSubjectLabel.textContent = 'Examen Final de Programación';
      DOM.navStudentLabel.textContent = 'Francisco López';
      enterIdeWorkspace();
      DOM.terminalPanel.style.setProperty('--terminal-size', '44%');
      DOM.timerDisplay.textContent = '00:35:12';
    `);
    await sleep(600);
    const examBuffer = (await window.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(outDir, 'codego-examen.png'), examBuffer);

    console.log('✓ Todas las capturas generadas con éxito en website/codego/');
    app.exit(0);
  } catch (err) {
    console.error('Error generando capturas:', err);
    app.exit(1);
  }
});
