const { app, BrowserWindow, screen, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn, execSync, execFileSync, execFile, exec } = require('child_process');
const executeFile = require('node:util').promisify(execFile);
const crypto = require('crypto');
const { resolveWorkspacePath } = require('./workspace-path');
const { PythonRunner } = require('./python-runner');
const { createSubmission } = require('./submission');
const { runSelfTest } = require('./self-test');
const { createWifiControl } = require('./wifi-control');
const { ensurePythonEnvironment } = require('./python-environment');
const wifiControl = createWifiControl();

const packagedReportArgument = process.argv.find(argument => argument.startsWith('--self-test-report='));
const diagnosticMode = Boolean(packagedReportArgument);
let diagnosticDirectory;
if (diagnosticMode) {
  app.disableHardwareAcceleration();
  diagnosticDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-packaged-'));
  app.setPath('userData', diagnosticDirectory);
}

// Download helper with automatic HTTP 301/302 redirect tracking
function downloadFileWithRedirects(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 10) {
        return reject(new Error('Demasiadas redirecciones HTTP al descargar.'));
      }
      if (!currentUrl.startsWith('https://')) return reject(new Error('La descarga requiere HTTPS.'));
      const request = https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const urlObj = new URL(currentUrl);
            nextUrl = new URL(nextUrl, urlObj).href;
          }
          res.resume();
          return get(nextUrl, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Error HTTP al descargar: ${res.statusCode}`));
        }
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > 150 * 1024 * 1024) request.destroy(new Error('La descarga supera 150 MB.'));
          if (totalBytes > 0 && onProgress) {
            const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            onProgress(percent, downloadedBytes, totalBytes);
          }
        });
        res.pipe(fileStream);
        res.on('error', err => { fileStream.destroy(); fs.unlink(destPath, () => {}); reject(err); });
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destPath));
        });
        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
      request.setTimeout(30000, () => request.destroy(new Error('La descarga no respondió en 30 segundos.')));
    }
    get(url);
  });
}


let mainWindow = null;
let activeProcess = null;
let allowWindowClose = false;
let closeRequestPending = false;
let isNativeDialogActive = false;
async function withNativeDialog(fn) {
  isNativeDialogActive = true;
  try {
    return await fn();
  } finally {
    setTimeout(() => {
      isNativeDialogActive = false;
    }, 600);
  }
}
const pythonRunner = new PythonRunner({
  send: (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
    if (channel === 'python:finished' && isKioskActive && mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {}
    }
  },
  onProcess: child => {
    activeProcess = child;
    if (child && isKioskActive && mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.setAlwaysOnTop(false); } catch (_) {}
    }
  }
});
let activePipProcess = null;
let installationBusy = false;
let isKioskActive = false;
let activeSessionMode = null; // 'exam', 'activity', or null
let blurStartTime = null;
let securityAuditLog = [];
let monitorWatchdogTimer = null;
const teacherPin = process.env.CODEGO_TEACHER_PIN || '';

// Dynamic student workspace directory (supports opening & creating projects)
let currentWorkspace = path.join(app.getPath('userData'), 'exam_workspace');
if (!fs.existsSync(currentWorkspace)) {
  fs.mkdirSync(currentWorkspace, { recursive: true });
}
const defaultWorkspace = currentWorkspace;
let workspaceSealed = false;

// ==============================================================
// HARDWARE/OS AUDIO ANTI-MUTE WATCHDOG & WI-FI ENFORCEMENT
// ==============================================================
let audioWatchdogInterval = null;

function enforceSystemAudioUnmute(targetVolume = 0.85) {
  const platform = process.platform;
  if (platform === 'linux') {
    // PipeWire / WirePlumber
    try { execSync(`wpctl set-mute @DEFAULT_AUDIO_SINK@ 0 && wpctl set-volume @DEFAULT_AUDIO_SINK@ ${targetVolume}`, { stdio: 'ignore' }); } catch (_) {}
    // PulseAudio
    try { execSync(`pactl set-sink-mute @DEFAULT_SINK@ 0 && pactl set-sink-volume @DEFAULT_SINK@ ${Math.round(targetVolume * 100)}%`, { stdio: 'ignore' }); } catch (_) {}
    // ALSA
    try { execSync(`amixer set Master unmute ${Math.round(targetVolume * 100)}%`, { stdio: 'ignore' }); } catch (_) {}
  } else if (platform === 'win32') {
    try {
      const psCmd = `$wscript = New-Object -ComObject WScript.Shell; $wscript.SendKeys([char]175); $wscript.SendKeys([char]175)`;
      exec(`powershell -NoProfile -Command "${psCmd}"`, () => {});
    } catch (_) {}
  } else if (platform === 'darwin') {
    try { execSync(`osascript -e "set volume output volume ${Math.round(targetVolume * 100)}"`, { stdio: 'ignore' }); } catch (_) {}
  }
}

function startAudioWatchdog() {
  stopAudioWatchdog();
  enforceSystemAudioUnmute(0.85);
  audioWatchdogInterval = setInterval(() => {
    if (activeSessionMode) {
      enforceSystemAudioUnmute(0.85);
    }
  }, 1000);
}

function stopAudioWatchdog() {
  if (audioWatchdogInterval) {
    clearInterval(audioWatchdogInterval);
    audioWatchdogInterval = null;
  }
}

function disableSystemWifi() { return wifiControl.disable(); }
function enableSystemWifi() { return wifiControl.restore(); }
function getSystemWifiStatus() { return wifiControl.inspectAsync(); }

// Helper to reliably find or create the isolated exam virtual environment directory
function resolveVenvDirectory() {
  const isWin = process.platform === 'win32';
  const pySubpath = isWin ? 'Scripts/python.exe' : 'bin/python3';

  const candidateDirs = [
    // 1. Current working dir
    path.resolve(process.cwd(), 'exam_env'),
    // 2. Relative to main.js (__dirname is src/main)
    path.resolve(__dirname, '../../exam_env'),
    // 3. User data directory (standard for installed app)
    path.join(app.getPath('userData'), 'exam_env'),
    // 4. Executable parent directory (portable mode)
    path.join(path.dirname(process.execPath), 'exam_env'),
    // Each installation resolves its own environment; no developer-specific paths.
  ];

  for (const cand of candidateDirs) {
    if (cand && fs.existsSync(cand) && fs.existsSync(path.join(cand, pySubpath))) {
      return cand;
    }
  }

  // Fallback to local or user venv
  return fs.existsSync(path.resolve(process.cwd(), 'exam_env'))
    ? path.resolve(process.cwd(), 'exam_env')
    : path.join(app.getPath('userData'), 'exam_env');
}

// Dedicated isolated exam virtual environment path
const localVenvPath = path.resolve(process.cwd(), 'exam_env');
const userVenvPath = path.join(app.getPath('userData'), 'exam_env');

// Initial sample file if workspace is empty
const initialFile = path.join(defaultWorkspace, 'main.py');
if (!fs.existsSync(initialFile)) {
  fs.writeFileSync(
    initialFile,
    `# ================================================\n# CodeGO ExamGuard - Entorno de Examen Seguro\n# Escribe tu solución aquí\n# ================================================\n\ndef main():\n    print("¡Bienvenido al Examen de Programación!")\n    nombre = input("Ingresa tu nombre: ")\n    print(f"Hola {nombre}, tu entorno está funcionando correctamente.")\n\nif __name__ == "__main__":\n    main()\n`,
    'utf-8'
  );
}

function resolvePythonBinary() {
  const isWin = process.platform === 'win32';
  const venvBinaryName = isWin ? 'Scripts/python.exe' : 'bin/python3';
  const pipBinaryName = isWin ? 'Scripts/pip.exe' : 'bin/pip';

  // 1. Check resolved venv directory
  const venvDir = resolveVenvDirectory();
  const venvPy = path.join(venvDir, venvBinaryName);
  if (fs.existsSync(venvPy)) {
    try {
      const ver = execFileSync(venvPy, ['--version'], { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      return {
        installed: true,
        command: venvPy,
        version: ver,
        pip: path.join(venvDir, pipBinaryName),
        isVenv: true,
        venvDir
      };
    } catch (_) {}
  }

  // 2. Check local project venv (exam_env)
  const localPy = path.join(localVenvPath, venvBinaryName);
  if (fs.existsSync(localPy)) {
    try {
      const ver = execFileSync(localPy, ['--version'], { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      return {
        installed: true,
        command: localPy,
        version: ver,
        pip: path.join(localVenvPath, pipBinaryName),
        isVenv: true,
        venvDir: localVenvPath
      };
    } catch (_) {}
  }

  // 3. Check user data venv (exam_env)
  const userPy = path.join(userVenvPath, venvBinaryName);
  if (fs.existsSync(userPy)) {
    try {
      const ver = execFileSync(userPy, ['--version'], { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      return {
        installed: true,
        command: userPy,
        version: ver,
        pip: path.join(userVenvPath, pipBinaryName),
        isVenv: true,
        venvDir: userVenvPath
      };
    } catch (_) {}
  }

  // 4. Fallback to system Python binaries
  const possibleCommands = isWin
    ? [
        path.join(app.getPath('userData'), 'python313', 'python.exe'),
        'python.exe',
        'py.exe',
        'python3.exe',
        'C:\\Program Files\\Python312\\python.exe',
        'C:\\Program Files\\Python311\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe'
      ]
    : ['python3', 'python'];

  for (const cmd of possibleCommands) {
    try {
      const output = execFileSync(cmd, ['--version'], { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      return {
        installed: true,
        command: cmd,
        version: output,
        pip: isWin ? 'pip.exe' : 'pip',
        isVenv: false,
        venvDir: null
      };
    } catch (e) {
      // Continue searching
    }
  }

  // 5. Default fallback (Not installed)
  return {
    installed: false,
    command: isWin ? 'python' : 'python3',
    version: 'No detectado',
    pip: 'pip',
    isVenv: false,
    venvDir: null
  };
}

// Windows Visual C++ Redistributable check
function checkWindowsVCRedist() {
  if (process.platform !== 'win32') {
    return { installed: true, details: 'No requerido en Linux/macOS' };
  }
  try {
    const regCheck = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64" /v Installed', {
      stdio: ['pipe', 'pipe', 'pipe']
    }).toString();
    if (regCheck.includes('0x1')) {
      return { installed: true, details: 'Visual C++ 2015-2022 (x64) detectado' };
    }
  } catch (_) {}

  try {
    const regCheck32 = execSync('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64" /v Installed', {
      stdio: ['pipe', 'pipe', 'pipe']
    }).toString();
    if (regCheck32.includes('0x1')) {
      return { installed: true, details: 'Visual C++ 2015-2022 (WOW64) detectado' };
    }
  } catch (_) {}

  const sys32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  if (fs.existsSync(path.join(sys32, 'vcruntime140.dll')) || fs.existsSync(path.join(sys32, 'vcruntime140_1.dll'))) {
    return { installed: true, details: 'vcruntime140.dll detectado en System32' };
  }

  return {
    installed: false,
    details: 'Visual C++ 2015-2022 faltante (necesario para Pygame/NumPy en Windows)'
  };
}

// Inspect installed packages in Python
function inspectPythonPackages(pythonCmd) {
  const code = `
import os, sys, warnings, json
os.environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"
warnings.filterwarnings("ignore")

packages = {
    "pygame": "Motor de juegos y gráficos 2D",
    "numpy": "Cálculo numérico y álgebra de matrices",
    "matplotlib": "Gráficas, diagramas y visualización",
    "pandas": "Análisis de datos y DataFrames",
    "requests": "Peticiones HTTP, APIs REST y web",
    "PIL": "Procesamiento de imágenes (Pillow)",
    "scipy": "Algoritmos científicos y optimización",
    "seaborn": "Visualización estadística avanzada",
    "openpyxl": "Lectura y escritura de hojas Excel",
    "sympy": "Matemáticas simbólicas y álgebra",
    "colorama": "Colores y estilos de terminal",
    "serial": "Comunicación serial con Arduino, ESP32 y periféricos (pyserial)",
    "sqlite3": "Base de datos SQL estándar",
    "tkinter": "Interfaces gráficas de usuario (GUI)"
}
result = {}
for p, desc in packages.items():
    try:
        mod = __import__(p)
        ver = getattr(mod, "__version__", "instalado")
        result[p] = {"installed": True, "version": str(ver), "desc": desc}
    except Exception as e:
        result[p] = {"installed": False, "version": None, "desc": desc}

print("___CODEGO_PACKAGES_START___")
print(json.dumps(result))
print("___CODEGO_PACKAGES_END___")
`;

  const startTag = '___CODEGO_PACKAGES_START___';
  const endTag = '___CODEGO_PACKAGES_END___';

  // Method 1: In-memory via stdin with execFileSync
  try {
    const raw = execFileSync(pythonCmd, ['-'], {
      input: code,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000
    });
    const s = raw.indexOf(startTag);
    const e = raw.indexOf(endTag);
    if (s !== -1 && e !== -1) {
      return JSON.parse(raw.substring(s + startTag.length, e).trim());
    }
  } catch (err) {
    // Method 2 fallback: Temporary script file (if stdin piping is unavailable)
    try {
      const tempScript = path.join(os.tmpdir(), `codego_inspect_${Date.now()}.py`);
      fs.writeFileSync(tempScript, code, 'utf-8');
      const raw = execFileSync(pythonCmd, [tempScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000
      }).toString();
      try { fs.unlinkSync(tempScript); } catch (_) {}
      const s = raw.indexOf(startTag);
      const e = raw.indexOf(endTag);
      if (s !== -1 && e !== -1) {
        return JSON.parse(raw.substring(s + startTag.length, e).trim());
      }
    } catch (e2) {
      console.warn('inspectPythonPackages fallback error:', e2.message);
    }
  }

  // Comprehensive fallback inspection
  return {
    pygame: { installed: false, version: null, desc: 'Motor de juegos y gráficos 2D' },
    numpy: { installed: false, version: null, desc: 'Cálculo numérico y matrices' },
    matplotlib: { installed: false, version: null, desc: 'Gráficas y visualización' },
    pandas: { installed: false, version: null, desc: 'Análisis de datos y DataFrames' },
    requests: { installed: false, version: null, desc: 'Peticiones HTTP y APIs' },
    PIL: { installed: false, version: null, desc: 'Procesamiento de imágenes (Pillow)' },
    scipy: { installed: false, version: null, desc: 'Algoritmos científicos y optimización' },
    seaborn: { installed: false, version: null, desc: 'Visualización estadística avanzada' },
    openpyxl: { installed: false, version: null, desc: 'Lectura y escritura de hojas Excel' },
    sympy: { installed: false, version: null, desc: 'Matemáticas simbólicas y álgebra' },
    colorama: { installed: false, version: null, desc: 'Colores y estilos de terminal' },
    serial: { installed: false, version: null, desc: 'Comunicación serial con Arduino, ESP32 y periféricos' },
    sqlite3: { installed: false, version: null, desc: 'Base de datos SQL estándar' },
    tkinter: { installed: false, version: null, desc: 'Interfaces gráficas de usuario' }
  };
}

function logSecurityIncident(type, details) {
  const incident = {
    id: securityAuditLog.length + 1,
    type,
    timestamp: new Date().toISOString(),
    details: details || {}
  };
  securityAuditLog.push(incident);
  console.warn(`[SECURITY INCIDENT #${incident.id}] ${type}:`, details);
  return incident;
}

function createMainWindow() {
  // Screen metrics are in device-independent pixels, including OS display scaling.
  const { workAreaSize } = screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    width: Math.min(1440, workAreaSize.width),
    height: Math.min(900, workAreaSize.height),
    minWidth: Math.min(640, workAreaSize.width),
    minHeight: Math.min(360, workAreaSize.height),
    fullscreen: !diagnosticMode, // La sesión normal siempre inicia en pantalla completa
    show: !diagnosticMode,
    frame: !diagnosticMode,
    autoHideMenuBar: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      safeDialogs: true,
      backgroundThrottling: !diagnosticMode,
      devTools: false // DevTools disabled for security
    }
  });

  if (!diagnosticMode) {
    mainWindow.maximize();
    mainWindow.setFullScreen(true);
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Handle window focus and blur for supervision (active in both Exam and Activity sessions)
  let blurWhilePythonRunning = false;

  mainWindow.on('blur', () => {
    // Only detect blur when a session is active in the workspace (Exam, Task or Activity)
    if (!activeSessionMode) return;

    // Check if a native OS dialog is active (e.g. Open Folder, Save Task, Verify Certificate)
    if (isNativeDialogActive) return;

    // Check if pip package installation or system auto-install is active
    if (activePipProcess || installationBusy) return;

    // Check if Python child process is actively running (e.g. Pygame, Tkinter, Matplotlib, Turtle, OpenCV window)
    if (activeProcess && !activeProcess.killed) {
      blurWhilePythonRunning = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('security:python-gui-active', {
          message: 'Ventana gráfica de Python (Pygame/GUI) activa legítimamente.'
        });
      }
      return; // Do NOT trigger alarm or penalize student!
    }

    blurWhilePythonRunning = false;
    blurStartTime = Date.now();
    enforceSystemAudioUnmute(0.95);

    const incident = logSecurityIncident('WINDOW_BLUR', {
      mode: activeSessionMode,
      message: activeSessionMode === 'exam'
        ? 'Se detectó cambio de ventana durante el examen.'
        : 'Se detectó cambio de ventana durante la actividad.',
      timestamp: new Date().toLocaleTimeString()
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('security:blur-detected', {
        incident,
        mode: activeSessionMode,
        totalIncidents: securityAuditLog.length,
        durationSeconds: 1.0
      });
    }
  });

  mainWindow.on('focus', () => {
    // Only handle refocus when a session is active
    if (!activeSessionMode) return;

    // If focus was lost to a Python GUI window and returned, ignore penalty
    if (blurWhilePythonRunning) {
      blurWhilePythonRunning = false;
      return;
    }

    const durationSeconds = blurStartTime
      ? ((Date.now() - blurStartTime) / 1000).toFixed(1)
      : '1.0';
    blurStartTime = null;

    enforceSystemAudioUnmute(0.95);
    try { shell.beep(); } catch (_) {}

    const incident = logSecurityIncident('WINDOW_REFOCUS', {
      mode: activeSessionMode,
      message: activeSessionMode === 'exam'
        ? `El estudiante regresó al examen tras ${durationSeconds} segundos fuera.`
        : `El estudiante regresó a la actividad tras ${durationSeconds} segundos fuera.`,
      durationSeconds: parseFloat(durationSeconds)
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('security:focus-regained', {
        incident,
        durationSeconds: parseFloat(durationSeconds),
        totalIncidents: securityAuditLog.length,
        mode: activeSessionMode
      });
    }
  });

  // Block navigation
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      e.preventDefault();
      logSecurityIncident('UNAUTHORIZED_NAVIGATION_ATTEMPT', { url });
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
  mainWindow.webContents.session.setPermissionCheckHandler((_contents, permission) => permission === 'clipboard-sanitized-write');

  mainWindow.webContents.setWindowOpenHandler(() => {
    logSecurityIncident('UNAUTHORIZED_WINDOW_OPEN_ATTEMPT', {});
    return { action: 'deny' };
  });

  // Block DevTools shortcuts and reloading
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!isKioskActive) return;

    // F12 or Ctrl+Shift+I or Cmd+Alt+I
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      (input.meta && input.alt && input.key.toLowerCase() === 'i')
    ) {
      event.preventDefault();
      logSecurityIncident('DEVTOOLS_SHORTCUT_BLOCKED', { key: input.key });
    }

    // Ctrl+R or F5 (handled for code execution instead of page reload)
    if (
      (input.control && input.key.toLowerCase() === 'r') ||
      (input.meta && input.key.toLowerCase() === 'r')
    ) {
      event.preventDefault();
    }

    // Alt+Tab / Super key block attempt
    if (input.alt && input.key === 'Tab') {
      event.preventDefault();
      logSecurityIncident('ALT_TAB_ATTEMPT', {});
    }

    // Alt+F4 block attempt
    if (input.alt && input.key === 'F4') {
      event.preventDefault();
      logSecurityIncident('ALT_F4_ATTEMPT', {});
    }
  });

  mainWindow.on('close', (event) => {
    if (isKioskActive) {
      event.preventDefault();
      logSecurityIncident('WINDOW_CLOSE_ATTEMPT', {});
      mainWindow.webContents.send('security:close-blocked', {});
      return;
    }
    if (!allowWindowClose) {
      event.preventDefault();
      if (!closeRequestPending) {
        closeRequestPending = true;
        mainWindow.webContents.send('app:before-close');
      }
    }
  });

  // Start multi-monitor watchdog
  startMonitorWatchdog();
}

function startMonitorWatchdog() {
  if (monitorWatchdogTimer) clearInterval(monitorWatchdogTimer);

  const check = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const displays = screen.getAllDisplays();
    const count = displays.length;

    if (count > 1 && isKioskActive) {
      logSecurityIncident('MULTIPLE_DISPLAYS_DETECTED', { count });
    }

    mainWindow.webContents.send('monitor:status', {
      count,
      isMultiple: count > 1 && isKioskActive,
      displays: displays.map((d, i) => ({
        id: d.id,
        label: `Pantalla ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
        isPrimary: d.bounds.x === 0 && d.bounds.y === 0
      }))
    });
  };

  screen.on('display-added', check);
  screen.on('display-removed', check);
  screen.on('display-metrics-changed', check);

  // Poll every 2 seconds
  monitorWatchdogTimer = setInterval(check, 2000);
}

// IPC Handlers
function setupIpcHandlers() {
  const handle = (channel, callback) => ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || mainWindow.isDestroyed?.() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      return { success: false, error: 'Origen IPC no autorizado.' };
    }
    if (diagnosticMode && /^(security:|wifi:(enable|disable)|system:(beep|enforce-audio|install|auto-install)|exam:)/.test(channel)) return { success: false, error: 'Acción excluida de la comprobación no destructiva.' };
    if (/^system:(install|auto-install)/.test(channel)) {
      if (installationBusy) return { success: false, error: 'Ya hay una instalación en progreso.' };
      installationBusy = true;
      try { return await callback(event, ...args); }
      catch (error) { return { success: false, error: error.message }; }
      finally { installationBusy = false; }
    }
    return callback(event, ...args);
  });
  handle('app:confirm-close', async (_event, saved) => {
    closeRequestPending = false;
    if (isKioskActive || saved !== true) return { success: false };
    allowWindowClose = true;
    pythonRunner.kill();
    app.quit();
    return { success: true };
  });
  handle('system:self-test', async () => {
    if (isKioskActive || activeProcess) return { success: false, checks: [{ name: 'Disponibilidad', success: false, detail: 'Detén Python y termina el examen antes de comprobar el equipo.' }] };
    return runSelfTest({ command: resolvePythonBinary().command, directory: app.getPath('userData'), version: app.getVersion() });
  });
  // Comprehensive Python & Environment Diagnostics
  handle('system:check-full-environment', async () => {
    const pythonInfo = resolvePythonBinary();
    const displays = screen.getAllDisplays();
    const vcRedist = checkWindowsVCRedist();
    const packages = inspectPythonPackages(pythonInfo.command);

    const essentialKeys = [
      // Fundamentales
      'pygame', 'numpy', 'matplotlib', 'pandas', 'requests', 'PIL',
      'scipy', 'seaborn', 'openpyxl', 'sympy', 'colorama',
      // Hardware: Arduino / ESP32 / Microcontroladores
      'serial', 'esptool', 'pyfirmata2', 'usb',
      // Raspberry Pi / SBC
      'smbus2', 'gpiozero', 'board',
      // Machine Learning y Visión
      'sklearn', 'cv2',
      // Web y Redes
      'websockets', 'flask', 'httpx',
      // Utilities educativas
      'tqdm', 'rich', 'qrcode', 'cryptography', 'pydantic',
    ];
    const missingKeys = essentialKeys.filter((k) => !packages[k] || !packages[k].installed);

    const hasPython = Boolean(pythonInfo.installed && !pythonInfo.version.includes('No detectado'));
    const hasVCRedist = Boolean(vcRedist.installed);
    const hasAllLibraries = missingKeys.length === 0;
    const isSingleMonitor = displays.length === 1;
    const isSystemReady = hasPython && hasVCRedist && hasAllLibraries && isSingleMonitor;

    const missingComponents = [];
    if (!hasVCRedist) missingComponents.push('Microsoft Visual C++ 2015-2022');
    if (!hasPython) missingComponents.push('Python 3');
    if (!hasAllLibraries) missingComponents.push(`${missingKeys.length} librería(s) de examen`);

    return {
      python: pythonInfo,
      hasPython,
      vcRedist,
      hasVCRedist,
      packages,
      essentialKeys,
      missingCount: missingKeys.length,
      missingKeys,
      hasAllLibraries,
      missingComponents,
      isSystemReady,
      displaysCount: displays.length,
      isSingleMonitor,
      platform: process.platform,
      arch: process.arch,
      workspacePath: defaultWorkspace,
      venvPath: pythonInfo.venvDir || resolveVenvDirectory()
    };
  });

  // Legacy check python handler
  handle('system:check-python', async () => {
    const pythonInfo = resolvePythonBinary();
    const displays = screen.getAllDisplays();
    return {
      python: pythonInfo,
      displaysCount: displays.length,
      platform: process.platform,
      arch: process.arch,
      workspacePath: defaultWorkspace
    };
  });

  // Automated All-in-One Installer & Repair Pipeline
  handle('system:auto-install-all-prerequisites', async () => {
    if (isKioskActive || workspaceSealed) return { success: false, error: 'Las instalaciones se realizan fuera del examen.' };
    function emitProgress(step, totalSteps, title, percent, log) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('setup:progress', {
          step,
          totalSteps,
          title,
          percent,
          log: log || ''
        });
      }
    }

    const installerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-install-'));
    try {
      const isWin = process.platform === 'win32';
      const isLinux = process.platform === 'linux';

      // ---------------------------------------------------------------
      // ETAPA 1: Visual C++ Redistributable (Crítico en Windows)
      // ---------------------------------------------------------------
      if (isWin) {
        const vc = checkWindowsVCRedist();
        if (!vc.installed) {
          emitProgress(1, 4, 'Descargando Microsoft Visual C++ 2015-2022 (x64)...', 10, '>>> [1/4] Descargando vc_redist.x64.exe desde Microsoft...\n');
          const vcDest = path.join(installerDirectory, 'vc_redist.x64.exe');
          await downloadFileWithRedirects('https://aka.ms/vs/17/release/vc_redist.x64.exe', vcDest, (pct) => {
            emitProgress(1, 4, `Descargando Visual C++ Redistributable (${pct}%)...`, 10 + Math.round(pct * 0.15));
          });

          emitProgress(1, 4, 'Instalando Visual C++ en segundo plano...', 25, '>>> [1/4] Ejecutando instalación silenciosa de Visual C++...\n');
          const signatureScript = '$s=Get-AuthenticodeSignature -LiteralPath $env:CODEGO_INSTALLER; if ($s.Status -ne "Valid" -or $s.SignerCertificate.Subject -notmatch "Microsoft Corporation") { throw "Firma Microsoft no válida" }';
          await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', signatureScript], { timeout: 60000, windowsHide: true, env: {...process.env, CODEGO_INSTALLER: vcDest} });
          try { await executeFile(vcDest, ['/install','/quiet','/norestart'], { timeout: 600000, windowsHide: true }); }
          catch (error) { if (error.code !== 3010) throw error; }
          if (!checkWindowsVCRedist().installed) throw new Error('No se pudo verificar Visual C++ después de instalarlo.');
          emitProgress(1, 4, 'Visual C++ 2015-2022 instalado ✓', 30, '>>> [1/4] Visual C++ instalado con éxito.\n');
        } else {
          emitProgress(1, 4, 'Visual C++ 2015-2022 ya verificado ✓', 30, '>>> [1/4] Visual C++ ya está presente en el sistema.\n');
        }
      } else {
        emitProgress(1, 4, 'Visual C++ no requerido en este sistema ✓', 30, '>>> [1/4] Entorno Unix/Linux detectado. No requiere Visual C++ de Windows.\n');
      }

      // ---------------------------------------------------------------
      // ETAPA 2: Python 3
      // ---------------------------------------------------------------
      let pythonInfo = resolvePythonBinary();
      if (!pythonInfo.installed) {
        if (isWin) {
          emitProgress(2, 4, 'Descargando Python 3.13.15 Oficial (64-bit)...', 35, '>>> [2/4] Descargando Python 3.13.15 desde python.org...\n');
          const pyDest = path.join(installerDirectory, 'python_installer.exe');
          await downloadFileWithRedirects('https://www.python.org/ftp/python/3.13.15/python-3.13.15-amd64.exe', pyDest, (pct) => {
            emitProgress(2, 4, `Descargando instalador de Python (${pct}%)...`, 35 + Math.round(pct * 0.15));
          });

          emitProgress(2, 4, 'Instalando Python (Configurando PATH y pip)...', 50, '>>> [2/4] Ejecutando instalador silencioso de Python 3.13...\n');
          const expectedHash = 'edec09c4853aeae9ac36efb8c9f95b6b8e2fee65eee56d9767a8b7c69c574403';
          if (crypto.createHash('sha256').update(fs.readFileSync(pyDest)).digest('hex') !== expectedHash) throw new Error('El instalador de Python no coincide con el SHA-256 oficial.');
          const installPath = path.join(app.getPath('userData'), 'python313');
          await executeFile(pyDest, ['/quiet','InstallAllUsers=0','PrependPath=0','Include_test=0','Include_pip=1',`TargetDir=${installPath}`], { timeout: 600000, windowsHide: true });
          process.env.PATH = `${installPath};${path.join(installPath, 'Scripts')};${process.env.PATH}`;
          pythonInfo = resolvePythonBinary();
          if (!pythonInfo.installed) throw new Error('No se pudo verificar Python después de instalarlo.');
          emitProgress(2, 4, 'Python 3 instalado y configurado ✓', 55, '>>> [2/4] Python 3.13 instalado con éxito.\n');
        } else if (isLinux) {
          emitProgress(2, 4, 'Instalando Python 3 en Linux...', 40, '>>> [2/4] Intentando instalar python3 mediante gestor del sistema...\n');
          try {
            await executeFile('pkexec', ['apt-get','update'], { timeout: 300000 });
            await executeFile('pkexec', ['apt-get','install','-y','python3','python3-pip','python3-venv','python3-tk','build-essential'], { timeout: 600000 });
          } catch (e) {
            emitProgress(2, 4, 'Verificando Python en el sistema...', 50, `Nota Linux: ${e.message}\n`);
          }
          pythonInfo = resolvePythonBinary();
        }
      } else {
        emitProgress(2, 4, `Python detectado (${pythonInfo.version}) ✓`, 55, `>>> [2/4] Intérprete Python verificado: ${pythonInfo.command}\n`);
      }

      // ---------------------------------------------------------------
      // ETAPA 3: Entorno Virtual Aislado (exam_env)
      // ---------------------------------------------------------------
      emitProgress(3, 4, 'Configurando entorno virtual aislado (exam_env)...', 60, '>>> [3/4] Preparando el entorno virtual exam_env...\n');
      const targetVenv = resolveVenvDirectory();
      if (!pythonInfo.installed) throw new Error('Python no está disponible. Instala Python 3 antes de continuar.');
      const execPy = ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
      emitProgress(3, 4, 'Entorno virtual configurado ✓', 70, `>>> [3/4] Entorno virtual listo en: ${targetVenv}\n`);

      // ---------------------------------------------------------------
      // ETAPA 4: Instalar librerías completas — básicas, avanzadas, hardware y microcontroladores
      // ---------------------------------------------------------------
      const allPackages = [
        // --- Librerías fundamentales de Python ---
        'pygame', 'numpy', 'matplotlib', 'pandas', 'requests', 'pillow',
        'scipy', 'seaborn', 'openpyxl', 'sympy', 'colorama', 'pyserial',
        // --- Arduino / ESP32 / Microcontroladores ---
        'esptool',          // Flashear ESP32 / ESP8266 desde Python
        'pyfirmata2',       // Control de Arduino via protocolo Firmata
        'pyusb',            // Comunicación USB directa con microcontroladores
        // --- Raspberry Pi y hardware SBC ---
        'smbus2',           // I2C / SMBus para Raspberry Pi y sensores
        'gpiozero',         // GPIO de Raspberry Pi (compatible Linux)
        'adafruit-blinka',  // Capa de compatibilidad CircuitPython/Adafruit
        // --- Machine Learning y ciencia de datos ---
        'scikit-learn',     // ML: clasificación, regresión, clustering
        'opencv-python-headless', // Visión por computadora (sin GUI)
        // --- Redes, web y APIs ---
        'websockets',       // WebSockets para IoT y comunicación en tiempo real
        'flask',            // Servidor web ligero para proyectos Python
        'httpx',            // Cliente HTTP moderno (alternativa a requests)
        // --- Utilities educativas ---
        'tqdm',             // Barras de progreso en terminal
        'rich',             // Salida de terminal con colores y tablas
        'qrcode',           // Generación de códigos QR
        'cryptography',     // Cifrado y seguridad (HMAC, AES, etc.)
        'python-dotenv',    // Variables de entorno para proyectos
        'pydantic',         // Validación de datos (muy usado en proyectos modernos)
      ];

      emitProgress(4, 4, `Instalando ${allPackages.length} librerías para exámenes, hardware y microcontroladores...`, 75, `>>> [4/4] Instalando paquete completo (${allPackages.length} librerías):\n    ${allPackages.join(', ')}\n\n`);

      const pipArgs = ['-m', 'pip', 'install', '--upgrade', ...allPackages];

      const pipExitCode = await new Promise((resolve) => {
        const proc = spawn(execPy, pipArgs);
        proc.stdout.on('data', (d) => {
          emitProgress(4, 4, 'Instalando librerías con pip...', 85, d.toString());
        });
        proc.stderr.on('data', (d) => {
          emitProgress(4, 4, 'Instalando librerías con pip...', 85, d.toString());
        });
        proc.on('close', (code) => {
          resolve(code);
        });
        proc.on('error', (err) => {
          emitProgress(4, 4, 'Error al ejecutar pip', 85, `Error: ${err.message}\n`);
          resolve(-1);
        });
      });

      if (pipExitCode !== 0) throw new Error(`pip terminó con código ${pipExitCode}. Revisa el registro y vuelve a intentarlo.`);
      emitProgress(4, 4, '¡Entorno y Librerías 100% Configurados! ✓', 100, `\n======================================================\n>>> ¡ÉXITO! Python 3 y ${allPackages.length} librerías instaladas:\n    Incluye: numpy, pandas, matplotlib, pygame, pyserial, esptool, smbus2, gpiozero, scikit-learn, opencv, flask y más.\n    ✅ Listas para exámenes, tareas, Arduino, ESP32 y Raspberry Pi.\n======================================================\n`);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('setup:finished', { success: true });
      }

      return { success: true };
    } catch (err) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('setup:finished', { success: false, error: err.message });
      }
      return { success: false, error: err.message };
    } finally {
      fs.rmSync(installerDirectory, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  // Install a specific Python package via pip
  handle('system:install-package', async (event, packageName) => {
    if (isKioskActive || workspaceSealed) return { success: false, error: 'Las instalaciones se realizan fuera del examen.' };
    if (activePipProcess) {
      return { success: false, error: 'Ya hay una instalación de pip en progreso.' };
    }

    if (typeof packageName !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:==[a-zA-Z0-9.+_-]+)?$/.test(packageName)) return { success: false, error: 'Indica un nombre de paquete válido, opcionalmente con ==versión.' };
    const pkgToInstall = packageName === 'PIL' ? 'pillow' : (packageName === 'serial' ? 'pyserial' : packageName);
    const pythonInfo = resolvePythonBinary();
    const isWin = process.platform === 'win32';
    const targetVenv = resolveVenvDirectory();

    if (!pythonInfo.installed) return { success: false, error: 'Instala Python 3 antes de añadir librerías.' };
    const execPy = ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
    const pipArgs = ['-m', 'pip', 'install', pkgToInstall];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip:log', `\n>>> Descargando e instalando librería: ${pkgToInstall}...\n`);
    }

    return new Promise((resolve) => {
      try {
        activePipProcess = spawn(execPy, pipArgs);

        activePipProcess.stdout.on('data', (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', data.toString());
          }
        });

        activePipProcess.stderr.on('data', (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', data.toString());
          }
        });

        activePipProcess.on('close', (code) => {
          activePipProcess = null;
          const success = code === 0;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:finished', {
              packageName: pkgToInstall,
              success,
              code
            });
          }
          resolve({ success, code });
        });

        activePipProcess.on('error', (err) => {
          activePipProcess = null;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', `Error al ejecutar pip: ${err.message}\n`);
          }
          resolve({ success: false, error: err.message });
        });
      } catch (e) {
        activePipProcess = null;
        resolve({ success: false, error: e.message });
      }
    });
  });

  // Batch install all 12 recommended libraries (including hardware pyserial)
  handle('system:install-all-recommended', async () => {
    if (isKioskActive || workspaceSealed) return { success: false, error: 'Las instalaciones se realizan fuera del examen.' };
    if (activePipProcess) {
      return { success: false, error: 'Ya hay una instalación de pip en progreso.' };
    }

    const recommended = [
      'pygame', 'numpy', 'matplotlib', 'pandas', 'requests', 'pillow',
      'scipy', 'seaborn', 'openpyxl', 'sympy', 'colorama', 'pyserial'
    ];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip:log', `\n======================================================\n`);
      mainWindow.webContents.send('pip:log', `>>> Instalando paquete completo de 12 librerías para exámenes y hardware...\n`);
      mainWindow.webContents.send('pip:log', `    (${recommended.join(', ')})\n`);
      mainWindow.webContents.send('pip:log', `======================================================\n`);
    }

    const pythonInfo = resolvePythonBinary();
    const isWin = process.platform === 'win32';
    const targetVenv = resolveVenvDirectory();

    // Create venv if needed
    if (!pythonInfo.installed) return { success: false, error: 'Instala Python 3 antes de añadir librerías.' };
    const execPy = ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
    const pipArgs = ['-m', 'pip', 'install', ...recommended];

    return new Promise((resolve) => {
      try {
        activePipProcess = spawn(execPy, pipArgs);

        activePipProcess.stdout.on('data', (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', data.toString());
          }
        });

        activePipProcess.stderr.on('data', (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', data.toString());
          }
        });

        activePipProcess.on('close', (code) => {
          activePipProcess = null;
          const success = code === 0;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', success ? `\n>>> ¡Todas las 12 librerías se instalaron exitosamente! ✓\n` : `\n>>> Finalizado con código de salida: ${code}\n`);
            mainWindow.webContents.send('pip:finished', {
              packageName: 'all',
              success,
              code
            });
          }
          resolve({ success, code });
        });

        activePipProcess.on('error', (err) => {
          activePipProcess = null;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:log', `Error al ejecutar pip: ${err.message}\n`);
          }
          resolve({ success: false, error: err.message });
        });
      } catch (e) {
        activePipProcess = null;
        resolve({ success: false, error: e.message });
      }
    });
  });

  // Enumerar puertos de hardware y microcontroladores (Arduino, ESP32, Raspberry Pi, etc.)
  handle('hardware:list-serial-ports', async () => {
    const ports = [];
    // 1. Intentar vía Python con pyserial si está disponible
    try {
      const pythonInfo = resolvePythonBinary();
      if (pythonInfo.installed) {
        const targetVenv = resolveVenvDirectory();
        const execPy = ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
        const pyCode = `import json, sys
try:
    import serial.tools.list_ports
    comports = serial.tools.list_ports.comports()
    data = []
    for p in comports:
        data.append({
            "path": p.device,
            "name": p.name or p.device,
            "description": p.description or "",
            "hwid": p.hwid or "",
            "manufacturer": getattr(p, "manufacturer", "") or "",
            "vendorId": getattr(p, "vid", None),
            "productId": getattr(p, "pid", None)
        })
    print("___SERIAL_DATA_START___" + json.dumps(data) + "___SERIAL_DATA_END___")
except Exception:
    print("___SERIAL_DATA_START___[]___SERIAL_DATA_END___")
`;
        const raw = execFileSync(execPy, ['-c', pyCode], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 4000
        });
        const s = raw.indexOf('___SERIAL_DATA_START___');
        const e = raw.indexOf('___SERIAL_DATA_END___');
        if (s !== -1 && e !== -1) {
          const jsonStr = raw.substring(s + '___SERIAL_DATA_START___'.length, e).trim();
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return { success: true, ports: parsed };
          }
        }
      }
    } catch (_) {}

    // 2. Fallback nativo según el Sistema Operativo
    try {
      if (process.platform === 'linux') {
        const devFiles = fs.readdirSync('/dev');
        devFiles.forEach(file => {
          if (file.startsWith('ttyUSB') || file.startsWith('ttyACM') || file.startsWith('ttyAMA') || file.startsWith('rfcomm')) {
            ports.push({
              path: `/dev/${file}`,
              name: file,
              description: file.startsWith('ttyUSB') ? 'Dispositivo Serial USB (Arduino / ESP32)' : 'Puerto Serial / Microcontrolador',
              hwid: `/dev/${file}`,
              manufacturer: 'USB-Serial Controller'
            });
          }
        });
      } else if (process.platform === 'darwin') {
        const devFiles = fs.readdirSync('/dev');
        devFiles.forEach(file => {
          if (file.startsWith('cu.usb') || file.startsWith('tty.usb') || file.startsWith('cu.wch') || file.startsWith('cu.SLAB')) {
            ports.push({
              path: `/dev/${file}`,
              name: file,
              description: 'Dispositivo Serial USB / Placa de desarrollo',
              hwid: `/dev/${file}`,
              manufacturer: 'USB-Serial'
            });
          }
        });
      } else if (process.platform === 'win32') {
        try {
          const output = execSync('powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"', {
            encoding: 'utf-8',
            timeout: 3000
          });
          const lines = output.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          lines.forEach(com => {
            ports.push({
              path: com,
              name: com,
              description: `Puerto Serial (${com})`,
              hwid: com,
              manufacturer: 'COM Port'
            });
          });
        } catch (_) {}
      }
    } catch (_) {}

    return { success: true, ports };
  });

  // Start Kiosk Lockdown or Activity Mode
  handle('security:start-kiosk', async (event, studentData) => {
    if (isKioskActive) return { success: false, error: 'El examen ya está activo.' };
    workspaceSealed = false;
    const isActivity = studentData && studentData.mode === 'activity';

    if (isActivity) {
      isKioskActive = false;
      activeSessionMode = 'activity';
      startAudioWatchdog();
      logSecurityIncident('ACTIVITY_MODE_STARTED', {
        student: studentData,
        startTime: new Date().toISOString()
      });

      if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
        try {
          globalShortcut.registerAll(['VolumeMute', 'VolumeDown'], () => {
            enforceSystemAudioUnmute(0.95);
          });
        } catch (_) {}
      }

      return { success: true, mode: 'activity' };
    }

    if (studentData && studentData.mode === 'task') {
      isKioskActive = true;
      activeSessionMode = 'task';
      currentWorkspace = defaultWorkspace;
      if (!fs.existsSync(currentWorkspace)) {
        fs.mkdirSync(currentWorkspace, { recursive: true });
      }
      startAudioWatchdog();
      logSecurityIncident('TASK_MODE_STARTED', {
        student: studentData,
        startTime: new Date().toISOString()
      });

      if (mainWindow) {
        mainWindow.setMenu(null);
        mainWindow.setMenuBarVisibility(false);
        mainWindow.setFullScreen(true);
        mainWindow.setKiosk(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');

        try {
          const forbiddenKeys = ['Alt+Tab', 'Super', 'Alt+F4', 'F11', 'VolumeMute', 'VolumeDown'];
          globalShortcut.registerAll(forbiddenKeys, () => {
            enforceSystemAudioUnmute(0.95);
            try { shell.beep(); } catch (_) {}
            logSecurityIncident('GLOBAL_SHORTCUT_INTERCEPTED', {});
          });
        } catch (err) {
          console.warn('Global shortcuts registration note in task mode:', err);
        }
      }

      return { success: true, mode: 'task' };
    }

    if (teacherPin.length < 8 || teacherPin === 'PROF1234') return { success: false, error: 'El docente debe configurar CODEGO_TEACHER_PIN con al menos 8 caracteres antes de iniciar el examen. Consulta la guía de instalación.' };

    // Exam Mode: Strictly isolate workspace to clean exam folder
    currentWorkspace = defaultWorkspace;
    if (!fs.existsSync(currentWorkspace)) {
      fs.mkdirSync(currentWorkspace, { recursive: true });
    }

    const wifiResult = disableSystemWifi();
    if (!wifiResult.success) {
      enableSystemWifi();
      return { success: false, error: `No se inició el examen: ${wifiResult.error}` };
    }
    isKioskActive = true;
    activeSessionMode = 'exam';
    securityAuditLog = []; // Reset for this student session

    // Wi-Fi was verified before activating the protected session.
    startAudioWatchdog();

    logSecurityIncident('EXAM_STARTED', {
      student: studentData,
      startTime: new Date().toISOString()
    });

    if (mainWindow) {
      mainWindow.setMenu(null);
      mainWindow.setMenuBarVisibility(false);
      mainWindow.setFullScreen(true);
      mainWindow.setKiosk(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');

      // Register system-level shortcuts to capture keys and prevent silencing alarms
      try {
        const forbiddenKeys = ['Alt+Tab', 'Super', 'Alt+F4', 'F11', 'VolumeMute', 'VolumeDown'];
        globalShortcut.registerAll(forbiddenKeys, () => {
          enforceSystemAudioUnmute(0.95);
          try { shell.beep(); } catch (_) {}
          logSecurityIncident('GLOBAL_SHORTCUT_INTERCEPTED', {});
        });
      } catch (err) {
        console.warn('Global shortcuts registration note:', err);
      }
    }

    return { success: true, mode: 'exam' };
  });

  // Exit Kiosk Mode (Requires Teacher PIN)
  handle('security:exit-kiosk', async (event, enteredPin) => {
    if (enteredPin === teacherPin) {
      isKioskActive = false;
      activeSessionMode = null;
      stopAudioWatchdog();
      enableSystemWifi();

      if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
      }
      logSecurityIncident('TEACHER_UNLOCK_SUCCESSFUL', { pinEntered: true });
      return { success: true };
    } else {
      logSecurityIncident('TEACHER_UNLOCK_FAILED_WRONG_PIN', { enteredPin });
      return { success: false, error: 'PIN de profesor incorrecto.' };
    }
  });

  // Native Hardware/OS Speaker Beep + Forced Unmute
  handle('system:beep', async () => {
    try {
      enforceSystemAudioUnmute(0.95);
      shell.beep();
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  });

  handle('system:enforce-audio', async () => {
    try {
      enforceSystemAudioUnmute(0.90);
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  });

  // Wi-Fi Status and Control Handlers
  handle('wifi:get-status', async () => getSystemWifiStatus());
  handle('wifi:disable', async () => {
    disableSystemWifi();
    return getSystemWifiStatus();
  });
  handle('wifi:enable', async () => {
    if (isKioskActive) return { success: false, error: 'La red está bloqueada durante el examen.' };
    enableSystemWifi();
    return getSystemWifiStatus();
  });

  // Workspace Folder Management (Open existing project / Create new project anywhere)
  handle('workspace:open-folder-dialog', async () => {
    if (activeProcess) return { success: false, error: 'Detén Python antes de cambiar de proyecto.' };
    if (isKioskActive) {
      return { success: false, error: 'Acceso a carpetas del sistema bloqueado durante la sesión de examen.' };
    }
    const res = await withNativeDialog(() => dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Abrir Carpeta o Proyecto de Python'
    }));
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { canceled: true };
    }
    currentWorkspace = res.filePaths[0];
    workspaceSealed = false;
    return { success: true, workspacePath: currentWorkspace };
  });

  handle('workspace:create-project-dialog', async (event, projectName) => {
    if (activeProcess) return { success: false, error: 'Detén Python antes de cambiar de proyecto.' };
    if (isKioskActive) {
      return { success: false, error: 'Creación de proyectos externos bloqueada durante la sesión de examen.' };
    }
    const res = await withNativeDialog(() => dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Seleccionar Carpeta Dónde Crear el Nuevo Proyecto'
    }));
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { canceled: true };
    }
    const parentDir = res.filePaths[0];
    const safeName = (projectName || 'Proyecto_Python').replace(/[/\\?%*:|"<>]/g, '_');
    const projectDir = path.join(parentDir, safeName);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    const mainFile = path.join(projectDir, 'main.py');
    if (!fs.existsSync(mainFile)) {
      fs.writeFileSync(mainFile, '# Proyecto Python - CodeGO\n\ndef main():\n    print("¡Proyecto iniciado exitosamente!")\n\nif __name__ == "__main__":\n    main()\n', 'utf-8');
    }
    currentWorkspace = projectDir;
    workspaceSealed = false;
    return { success: true, workspacePath: currentWorkspace, mainFile: 'main.py' };
  });

  // Window Screen Controls
  handle('window:set-fullscreen', async (event, flag) => {
    if (diagnosticMode) return { success: true };
    if (isKioskActive && flag === false) return { success: false, error: 'Pantalla completa obligatoria durante el examen.' };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(flag !== false);
      return { success: true, isFullScreen: mainWindow.isFullScreen() };
    }
    return { success: false };
  });

  handle('window:maximize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize();
      mainWindow.setFullScreen(true);
      return { success: true };
    }
    return { success: false };
  });

  // Safe App Exit (Unmutes and re-enables Wi-Fi before closing)
  handle('app:quit-safe', async () => {
    if (isKioskActive) return { success: false, error: 'Se requiere autorización docente para salir.' };
    stopAudioWatchdog();
    enableSystemWifi();
    app.quit();
  });

  // File System Operations (Dynamic currentWorkspace with enhanced cross-platform subfolder support)
  handle('fs:list-workspace', async () => {
    function scanDir(dir, relative = '') {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      const result = [];

      for (const item of items) {
        const itemRelative = (relative ? relative + '/' : '') + item.name;
        const itemFull = path.join(dir, item.name);

        if (item.isDirectory()) {
          result.push({
            name: item.name,
            path: itemRelative,
            type: 'directory',
            children: scanDir(itemFull, itemRelative)
          });
        } else {
          result.push({
            name: item.name,
            path: itemRelative,
            type: 'file',
            size: fs.statSync(itemFull).size
          });
        }
      }
      return result;
    }

    try {
      const tree = scanDir(currentWorkspace);
      return { success: true, tree, rootPath: currentWorkspace };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:read-file', async (event, relativePath) => {
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      const content = fs.readFileSync(safePath, 'utf-8');
      return { success: true, content, path: relativePath.replace(/\\/g, '/') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:save-file', async (event, { relativePath, content }) => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, content, 'utf-8');
      return { success: true, path: relativePath.replace(/\\/g, '/') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:create-file', async (event, relativePath) => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      if (!fs.existsSync(safePath)) {
        fs.writeFileSync(safePath, '', 'utf-8');
      }
      return { success: true, path: relativePath.replace(/\\/g, '/') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:create-folder', async (event, relativePath) => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      if (!fs.existsSync(safePath)) {
        fs.mkdirSync(safePath, { recursive: true });
      }
      return { success: true, path: relativePath.replace(/\\/g, '/') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:delete', async (event, relativePath) => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      if (fs.existsSync(safePath)) {
        fs.rmSync(safePath, { recursive: true, force: true });
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:rename', async (event, { oldPath, newPath }) => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    try {
      const safeOld = resolveWorkspacePath(currentWorkspace, oldPath);
      const safeNew = resolveWorkspacePath(currentWorkspace, newPath);
      fs.mkdirSync(path.dirname(safeNew), { recursive: true });
      fs.renameSync(safeOld, safeNew);
      return { success: true, path: newPath.replace(/\\/g, '/') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Python Code Execution
  handle('python:run', async (event, { relativePath }) => {
    try {
      const filePath = resolveWorkspacePath(currentWorkspace, relativePath);
      if (path.extname(filePath).toLowerCase() !== '.py') throw new Error('Selecciona un archivo Python (.py).');
      if (!fs.statSync(filePath).isFile()) throw new Error('El archivo no existe.');
      return pythonRunner.run(resolvePythonBinary().command, filePath);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  handle('python:stdin', (event, value) => pythonRunner.stdin(value));
  handle('python:kill', () => pythonRunner.kill());

  // Final Exam Submission & Package Creation
  handle('exam:submit', async (event, studentData) => {
    if (activeProcess) return { success: false, error: 'Detén Python antes de entregar.' };
    if (workspaceSealed) return { success: false, error: 'El examen ya fue entregado.' };
    try {
      const result = createSubmission({ workspace: currentWorkspace, outputDirectory: path.join(app.getPath('userData'), 'exam_submissions'), student: studentData, auditLog: securityAuditLog, version: app.getVersion() });
      workspaceSealed = true;

      // Release kiosk mode and re-enable Wi-Fi after submission
      isKioskActive = false;
      activeSessionMode = null;
      stopAudioWatchdog();
      enableSystemWifi();

      if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
      }

      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Certified Task Submission & Signing
  handle('task:submit', async (event, submissionData) => {
    if (activeProcess) return { success: false, error: 'Detén la ejecución de Python antes de entregar la tarea.' };
    if (workspaceSealed) return { success: false, error: 'La tarea ya fue entregada.' };
    try {
      const { student, telemetry } = submissionData || {};
      const safeStudent = String(student?.name || 'alumno').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      const safeSubject = String(student?.subject || 'tarea').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      const defaultName = `TAREA_${safeSubject}_${safeStudent}.codego`;

      let customPath = null;
      if (mainWindow) {
        const { canceled, filePath } = await withNativeDialog(() => dialog.showSaveDialog(mainWindow, {
          title: 'Guardar Archivo de Tarea Certificada CodeGO',
          defaultPath: path.join(app.getPath('downloads'), defaultName),
          filters: [
            { name: 'Archivo de Tarea CodeGO (*.codego)', extensions: ['codego'] },
            { name: 'Archivo ZIP (*.zip)', extensions: ['zip'] },
            { name: 'Todos los archivos', extensions: ['*'] }
          ]
        }));
        if (canceled || !filePath) return { success: false, canceled: true };
        customPath = filePath;
      }

      const result = createCertifiedTaskSubmission({
        workspace: currentWorkspace,
        customFilePath: customPath,
        outputDirectory: app.getPath('downloads'),
        student: student || {},
        telemetry: telemetry || {},
        version: app.getVersion()
      });

      workspaceSealed = true;

      // Release kiosk mode and unregister shortcuts after task submission
      isKioskActive = false;
      activeSessionMode = null;
      stopAudioWatchdog();
      if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
      }

      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Teacher Forensic Verifier IPC Handlers
  handle('submission:open-file-dialog', async () => {
    if (!mainWindow) return { canceled: true };
    const { canceled, filePaths } = await withNativeDialog(() => dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar Archivo de Tarea o Examen CodeGO (.codego / .zip)',
      properties: ['openFile'],
      filters: [
        { name: 'Archivos CodeGO (*.codego, *.zip)', extensions: ['codego', 'zip'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    }));
    if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
    return { success: true, filePath: filePaths[0] };
  });

  handle('submission:verify-file', async (event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, authentic: false, error: 'El archivo no existe o no se especificó ruta.' };
      }
      return verifySubmission(filePath);
    } catch (e) {
      return { success: false, authentic: false, error: e.message };
    }
  });

  handle('submission:extract-code', async (event, { filePath }) => {
    try {
      if (!mainWindow) return { canceled: true };
      const { canceled, filePaths } = await withNativeDialog(() => dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de destino para extraer el código entregado',
        properties: ['openDirectory', 'createDirectory']
      }));
      if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
      return extractSubmissionFiles(filePath, filePaths[0]);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

async function autoEnsureLibrariesInstalled() {
  if (diagnosticMode) return;
  try {
    const pythonInfo = resolvePythonBinary();
    if (!pythonInfo.installed) return;
    const targetVenv = resolveVenvDirectory();
    const execPy = ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
    const packages = inspectPythonPackages(execPy);
    const missing = [
      'pygame', 'numpy', 'scipy', 'matplotlib', 'pandas', 'pillow',
      'seaborn', 'openpyxl', 'sympy', 'colorama', 'pyserial', 'requests'
    ].filter(k => {
      const checkKey = k === 'pyserial' ? 'serial' : (k === 'pillow' ? 'PIL' : k);
      return !packages[checkKey] || !packages[checkKey].installed;
    });
    if (missing.length > 0) {
      installationBusy = true;
      const proc = spawn(execPy, ['-m', 'pip', 'install', '--upgrade', ...missing], { windowsHide: true });
      proc.on('close', (code) => {
        installationBusy = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pip:finished');
        }
      });
      proc.on('error', () => {
        installationBusy = false;
      });
    }
  } catch (err) {
    installationBusy = false;
  }
}

app.whenReady().then(async () => {
  setupIpcHandlers();
  createMainWindow();
  setTimeout(autoEnsureLibrariesInstalled, 1500);
  if (diagnosticMode) {
    console.info('CodeGO: iniciando comprobación del paquete.');
    const watchdog = setTimeout(() => { console.error('La comprobación del paquete excedió 60 segundos.'); app.exit(1); }, 60000);
    try {
      const { runPackagedCheck } = require('./packaged-check');
      await new Promise((resolve, reject) => {
        mainWindow.webContents.once('did-finish-load', resolve);
        mainWindow.webContents.once('did-fail-load', (_event, code, message) => reject(new Error(`${code}: ${message}`)));
      });
      console.info('CodeGO: interfaz cargada.');
      const report = await runPackagedCheck({ window: mainWindow, command: resolvePythonBinary().command, directory: diagnosticDirectory, version: app.getVersion(), packaged: app.isPackaged, reportPath: path.resolve(packagedReportArgument.slice('--self-test-report='.length)) });
      clearTimeout(watchdog);
      mainWindow.destroy();
      try { fs.rmSync(diagnosticDirectory, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
      app.exit(report.success ? 0 : 1);
    } catch (error) { console.error(error.message); app.exit(1); }
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('will-quit', () => {
  pythonRunner.kill();
  stopAudioWatchdog();
  enableSystemWifi();
});

app.on('window-all-closed', () => {
  stopAudioWatchdog();
  enableSystemWifi();
  if (process.platform !== 'darwin') app.quit();
});
