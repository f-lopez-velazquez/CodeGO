const { app, BrowserWindow, screen, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn, execSync, execFileSync, execFile } = require('child_process');
const executeFile = require('node:util').promisify(execFile);
const crypto = require('crypto');
const { resolveWorkspacePath } = require('./workspace-path');
const { PythonRunner } = require('./python-runner');
const {
  createSubmission,
  createCertifiedTaskSubmission,
  verifySubmission,
  analyzeSubmissionBatch,
  extractSubmissionFiles,
  ensureSigningIdentity
} = require('./submission');
const { runSelfTest } = require('./self-test');
const { createWifiControl } = require('./wifi-control');
const { ensurePythonEnvironment } = require('./python-environment');
const environmentSetup = require('./environment-setup');
const { locateOfflineBundle, verifyOfflineBundle } = require('./offline-bundle');
const { setupDiagnostic } = require('./setup-diagnostics');
const { classifyWorkspaceFile } = require('./file-types');
const { moveDirectory } = require('./fs-operations');
const { sourceLikelyOpensGui, activeHyprlandWorkspace, placeHyprlandWindow } = require('./window-integration');
const { createFocusGuard } = require('./focus-guard');
const updater = require('./updater');
const wifiControl = createWifiControl();

// Native Wayland keeps GPU compositing for a responsive editor. Vulkan remains
// disabled because some Mesa/Hyprland combinations report noisy startup errors;
// CODEGO_SOFTWARE_RENDERING=1 is an explicit fallback for incompatible drivers.
if (app.commandLine && process.platform === 'linux' && (process.env.WAYLAND_DISPLAY || /wayland/i.test(process.env.XDG_SESSION_TYPE || ''))) {
  if (process.env.CODEGO_SOFTWARE_RENDERING === '1') app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-vulkan');
  app.commandLine.appendSwitch('disable-features', 'Vulkan,VulkanFromANGLE');
  app.commandLine.appendSwitch('use-angle', 'gl');
}

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
let activePythonGuiExpected = false;
let activePythonWorkspace = null;
let protectedWindowTemporarilyReleased = false;
let pythonWindowTimers = [];

function clearPythonWindowTimers() {
  pythonWindowTimers.forEach(clearTimeout);
  pythonWindowTimers = [];
}

function restoreMainWindowAfterPython() {
  clearPythonWindowTimers();
  if (!mainWindow || mainWindow.isDestroyed() || !protectedWindowTemporarilyReleased) return;
  protectedWindowTemporarilyReleased = false;
  if (activeSessionMode === 'exam') {
    try {
      mainWindow.setFullScreen(true);
      mainWindow.setKiosk(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.focus();
    } catch (_) {}
  }
}

function prepareMainWindowForPythonGui(child) {
  if (!activePythonGuiExpected || !child?.pid || !mainWindow || mainWindow.isDestroyed()) return;
  protectedWindowTemporarilyReleased = activeSessionMode === 'exam';
  try {
    mainWindow.setAlwaysOnTop(false);
    if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    mainWindow.maximize();
  } catch (_) {}

  mainWindow.webContents.send('security:python-gui-active', {
    message: 'Abriendo la ventana gráfica junto a codeGO.'
  });
  if (activePythonWorkspace) {
    [180, 450, 900, 1600, 2600].forEach(delay => {
      pythonWindowTimers.push(setTimeout(() => {
        if (activeProcess === child && !child.killed) placeHyprlandWindow(child.pid, activePythonWorkspace);
      }, delay));
    });
  }
}

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
  },
  onProcess: child => {
    activeProcess = child;
    if (child) {
      prepareMainWindowForPythonGui(child);
    } else {
      restoreMainWindowAfterPython();
      activePythonGuiExpected = false;
      activePythonWorkspace = null;
    }
  }
});
let activePipProcess = null;
let installationBusy = false;
const preparedEnvironmentDirectory = path.join(app.getPath('userData'), 'codego-runtime');
let environmentReady = diagnosticMode || environmentSetup.environmentStatus(preparedEnvironmentDirectory).ready;
let isKioskActive = false;
let activeSessionMode = null; // 'exam', 'activity', or null
const focusGuard = createFocusGuard();
let securityAuditLog = [];
let monitorWatchdogTimer = null;
const teacherPin = process.env.CODEGO_TEACHER_PIN || '';

// Dynamic student workspace directory (supports opening & creating projects)
let currentWorkspace = path.join(app.getPath('userData'), 'exam_workspace');
if (!fs.existsSync(currentWorkspace)) {
  fs.mkdirSync(currentWorkspace, { recursive: true });
}
const defaultWorkspace = currentWorkspace;
let workspaceExplicitlySelected = diagnosticMode;
let workspaceSealed = false;

// ==============================================================
// HARDWARE/OS AUDIO ANTI-MUTE WATCHDOG & WI-FI ENFORCEMENT
// ==============================================================
let audioWatchdogInterval = null;
let audioEnforcementInFlight = false;
let lastAudioEnforcementAt = 0;

function runAudioCommand(command, args, done) {
  execFile(command, args, { windowsHide: true, timeout: 2500 }, error => done(!error));
}

function enforceSystemAudioUnmute(targetVolume = 0.85) {
  const currentTime = Date.now();
  if (audioEnforcementInFlight || currentTime - lastAudioEnforcementAt < 1200) return;
  audioEnforcementInFlight = true;
  lastAudioEnforcementAt = currentTime;
  const finish = () => { audioEnforcementInFlight = false; };
  const platform = process.platform;
  if (platform === 'linux') {
    runAudioCommand('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', '0'], success => {
      if (success) return runAudioCommand('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', String(targetVolume)], finish);
      runAudioCommand('pactl', ['set-sink-mute', '@DEFAULT_SINK@', '0'], pulseSuccess => {
        if (pulseSuccess) return runAudioCommand('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${Math.round(targetVolume * 100)}%`], finish);
        runAudioCommand('amixer', ['set', 'Master', 'unmute', `${Math.round(targetVolume * 100)}%`], finish);
      });
    });
  } else if (platform === 'win32') {
    const psCmd = '$wscript = New-Object -ComObject WScript.Shell; $wscript.SendKeys([char]175); $wscript.SendKeys([char]175)';
    runAudioCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], finish);
  } else if (platform === 'darwin') {
    runAudioCommand('osascript', ['-e', `set volume output volume ${Math.round(targetVolume * 100)}`], finish);
  } else {
    finish();
  }
}

function startAudioWatchdog() {
  stopAudioWatchdog();
  enforceSystemAudioUnmute(0.85);
  audioWatchdogInterval = setInterval(() => {
    if (activeSessionMode) {
      enforceSystemAudioUnmute(0.85);
    }
  }, 4000);
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

function resolvePythonBinary() {
  const isWin = process.platform === 'win32';
  const venvBinaryName = isWin ? 'Scripts/python.exe' : 'bin/python3';
  const pipBinaryName = isWin ? 'Scripts/pip.exe' : 'bin/pip';

  // The verified CodeGO runtime always wins over PATH and old project venvs.
  const prepared = environmentSetup.environmentStatus(preparedEnvironmentDirectory);
  if (prepared.ready) {
    const venvDir = path.dirname(path.dirname(prepared.command));
    return {
      installed: true,
      command: prepared.command,
      version: prepared.report.python.version,
      pip: path.join(venvDir, pipBinaryName),
      isVenv: true,
      venvDir,
      verified: true
    };
  }

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
  try {
    const raw = execFileSync(pythonCmd, ['-I', '-'], {
      input: environmentSetup.inspectScript(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180000,
      env: { ...process.env, PYTHONNOUSERSITE: '1', PYGAME_HIDE_SUPPORT_PROMPT: '1' }
    });
    return environmentSetup.parseResult(raw);
  } catch (error) {
    console.warn('No se pudo inspeccionar el manifiesto completo:', error.message);
  }
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

  // codeGO is designed as a focused, full-workspace application. If the
  // operating system leaves fullscreen, keep the window maximized so native
  // scaling never exposes an unsupported floating-window layout.
  mainWindow.on('leave-full-screen', () => {
    if (diagnosticMode || !mainWindow || mainWindow.isDestroyed()) return;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) mainWindow.maximize();
    }, 0);
  });
  mainWindow.on('unmaximize', () => {
    if (diagnosticMode || protectedWindowTemporarilyReleased || !mainWindow || mainWindow.isDestroyed()) return;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.maximize();
    }, 0);
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('blur', () => {
    const pythonWindow = Boolean(activePythonGuiExpected && activeProcess && !activeProcess.killed);
    const focusSupervisionActive = activeSessionMode === 'exam' || activeSessionMode === 'activity';
    const decision = focusGuard.blur({
      sessionActive: focusSupervisionActive,
      ignored: isNativeDialogActive || Boolean(activePipProcess) || installationBusy,
      pythonWindow
    });
    if (!decision.violation) {
      if (decision.reason === 'python-window' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('security:python-gui-active', {
          message: 'La ventana gráfica de tu programa está activa.'
        });
      }
      return;
    }

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
        totalIncidents: securityAuditLog.filter(entry => entry.type === 'WINDOW_BLUR').length,
        durationSeconds: 1.0
      });
    }
  });

  mainWindow.on('focus', () => {
    const focusSupervisionActive = activeSessionMode === 'exam' || activeSessionMode === 'activity';
    const decision = focusGuard.focus({ sessionActive: focusSupervisionActive });
    if (!decision.violation) return;
    const durationSeconds = decision.durationSeconds.toFixed(1);

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
        totalIncidents: securityAuditLog.filter(entry => entry.type === 'WINDOW_BLUR').length,
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

function sendSetupEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

const PORTABLE_PYTHON_RELEASE = '20260924';
const PORTABLE_PYTHON = {
  'win32-x64': {
    file: 'cpython-3.13.15+20260924-x86_64-pc-windows-msvc-install_only_stripped.tar.gz',
    sha256: 'e42fa944748a50e9ff481cbb817ef8a6e3da6fbcf0cf6f29b554e1acb8c7384d'
  },
  'darwin-arm64': {
    file: 'cpython-3.13.15+20260924-aarch64-apple-darwin-install_only_stripped.tar.gz',
    sha256: '064afb7c2fc0bbf511d886288adf98696af5105e36c138cdf2c199c0146fcf68'
  },
  'darwin-x64': {
    file: 'cpython-3.13.15+20260924-x86_64-apple-darwin-install_only_stripped.tar.gz',
    sha256: '327814efd865a0b6a99c149b12a261e9d0ad409183515c745d41bda2d07282e9'
  },
  'linux-arm64': {
    file: 'cpython-3.13.15+20260924-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz',
    sha256: '5ad58156cbec94e5643c13caa792e92df72a23f33d3a6425d4cbff5c4b7a040c'
  },
  'linux-x64': {
    file: 'cpython-3.13.15+20260924-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
    sha256: 'd0b640eed27fbdd6f5f2bd33444aee53df2c8863f8b2a96f4094717411e3de9c'
  }
};

function ensurePreparationDiskSpace(directory, minimumBytes = 5 * 1024 ** 3) {
  if (typeof fs.statfsSync !== 'function') return;
  const stats = fs.statfsSync(directory);
  const available = Number(stats.bavail) * Number(stats.bsize);
  if (available < minimumBytes) throw new Error(`Espacio insuficiente: hay ${(available / 1024 ** 3).toFixed(1)} GB disponibles y se requieren al menos 5 GB.`);
}

async function installBundledPython(verifiedBundle, onProgress, { stagingBase = os.tmpdir() } = {}) {
  fs.mkdirSync(stagingBase, { recursive: true });
  const directory = fs.mkdtempSync(path.join(stagingBase, '.codego-python-offline-'));
  try {
    const extractDirectory = path.join(directory, 'extract');
    fs.mkdirSync(extractDirectory);
    onProgress(14, 'Extrayendo Python 3.13 incluido…', '>>> Python 3.13.15 se instalará desde el paquete local verificado. No se necesita internet.\n');
    await executeFile(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', verifiedBundle.runtimeArchive, '-C', extractDirectory], { timeout: 240000, windowsHide: true });
    const extracted = path.join(extractDirectory, 'python');
    const executable = path.join(extracted, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
    const selected = await environmentSetup.selectPython([executable]);
    if (!selected) throw new Error('El runtime Python incluido no superó la comprobación de 64 bits.');
    const target = path.join(app.getPath('userData'), 'python313');
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    moveDirectory(extracted, target);
    return environmentSetup.selectPython([path.join(target, process.platform === 'win32' ? 'python.exe' : 'bin/python3')]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function installPortablePython(onProgress) {
  const artifact = PORTABLE_PYTHON[`${process.platform}-${process.arch}`];
  if (!artifact) throw new Error(`No existe un runtime automático para ${process.platform} ${process.arch}.`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-python-'));
  try {
    const archive = path.join(directory, artifact.file);
    const extractDirectory = path.join(directory, 'extract');
    fs.mkdirSync(extractDirectory);
    const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PORTABLE_PYTHON_RELEASE}/${encodeURIComponent(artifact.file)}`;
    onProgress(8, 'Descargando Python 3.13.15 portátil…', 'No se encontró Python 3.12/3.13 compatible; codeGO preparará su propio entorno aislado.\n');
    await downloadFileWithRedirects(url, archive, percent => onProgress(8 + Math.round(percent * 0.08), `Descargando Python compatible (${percent} %)…`));
    const actual = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (actual !== artifact.sha256) throw new Error('El runtime portátil de Python no coincide con el SHA-256 publicado.');
    onProgress(18, 'Instalando Python compatible para codeGO…');
    await executeFile(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', archive, '-C', extractDirectory], { timeout: 180000, windowsHide: true });
    const extracted = path.join(extractDirectory, 'python');
    const executable = path.join(extracted, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
    const selected = await environmentSetup.selectPython([executable]);
    if (!selected) throw new Error('El runtime se descargó, pero no superó la validación de Python 3.13 de 64 bits.');
    const target = path.join(app.getPath('userData'), 'python313');
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 });
    moveDirectory(extracted, target);
    return environmentSetup.selectPython([path.join(target, process.platform === 'win32' ? 'python.exe' : 'bin/python3')]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function findCompatiblePython(onProgress, verifiedBundle = null, { stagingBase = os.tmpdir() } = {}) {
  const managed = path.join(app.getPath('userData'), 'python313', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
  const managedPython = await environmentSetup.selectPython([managed]);
  if (managedPython) return managedPython;
  if (verifiedBundle) return installBundledPython(verifiedBundle, onProgress, { stagingBase });
  const candidates = process.platform === 'win32'
    ? [managed, { command: 'py.exe', args: ['-3.13'] }, { command: 'py.exe', args: ['-3.12'] }, 'python3.13.exe', 'python3.12.exe', 'python.exe']
    : [managed, 'python3.13', 'python3.12', 'python3'];
  let selected = await environmentSetup.selectPython(candidates);
  if (selected) return selected;
  if (process.platform !== 'win32') return installPortablePython(onProgress);

  const installerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-python-'));
  try {
    const installer = path.join(installerDirectory, 'python-3.13.15-amd64.exe');
    onProgress(8, 'Descargando Python 3.13.15 de 64 bits…', 'Python 3.14 detectado: se instalará un entorno 3.13 compatible sin modificarlo.\n');
    await downloadFileWithRedirects('https://www.python.org/ftp/python/3.13.15/python-3.13.15-amd64.exe', installer, percent => {
      onProgress(8 + Math.round(percent * 0.08), `Descargando Python compatible (${percent} %)…`);
    });
    const expected = 'edec09c4853aeae9ac36efb8c9f95b6b8e2fee65eee56d9767a8b7c69c574403';
    const actual = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
    if (actual !== expected) throw new Error('El instalador de Python no coincide con el SHA-256 oficial.');
    const signatureScript = '$s=Get-AuthenticodeSignature -LiteralPath $env:CODEGO_INSTALLER; if ($s.Status -ne "Valid" -or $s.SignerCertificate.Subject -notmatch "Python Software Foundation") { throw "Firma de Python no válida" }';
    await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', signatureScript], { timeout: 60000, windowsHide: true, env: { ...process.env, CODEGO_INSTALLER: installer } });
    onProgress(18, 'Instalando Python compatible para codeGO…');
    const target = path.join(app.getPath('userData'), 'python313');
    await executeFile(installer, ['/quiet', 'InstallAllUsers=0', 'PrependPath=0', 'Include_test=0', 'Include_pip=1', 'Include_tcltk=1', 'Include_launcher=0', `TargetDir=${target}`], { timeout: 600000, windowsHide: true });
    selected = await environmentSetup.selectPython([path.join(target, 'python.exe')]);
    if (!selected) throw new Error('Python terminó de instalarse, pero codeGO no pudo validar Python 3.13 de 64 bits.');
    return selected;
  } finally {
    fs.rmSync(installerDirectory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function automaticSetupRetryAllowed(error) {
  const detail = String(error?.message || error || '').toLowerCase();
  return !/enospc|no space|espacio insuficiente|eacces|eperm|access.*denied|sha-?256|firma.*no válida|manifiesto|corrupt/.test(detail);
}

function resetInternalEnvironment() {
  const userData = app.getPath('userData');
  const targets = [preparedEnvironmentDirectory, path.join(userData, 'python313')];
  for (const target of targets) fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  for (const name of fs.readdirSync(userData)) {
    if (/^(?:python313|codego-runtime)\.installing-/.test(name)) {
      fs.rmSync(path.join(userData, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
}

async function prepareAppEnvironment({ strategy = 'resume', automaticAttempt = 1 } = {}) {
  if (isKioskActive || workspaceSealed) return { success: false, error: 'La preparación se realiza antes de iniciar una sesión.' };
  environmentReady = false;
  let lastPercent = 0;
  let lastTitle = 'Preparando el entorno…';
  const progress = (percent, title, log = '') => {
    if (percent !== null && percent !== undefined && Number.isFinite(Number(percent))) {
      lastPercent = Math.max(0, Math.min(100, Number(percent)));
    }
    if (title) lastTitle = title;
    const value = lastPercent;
    const step = value < 18 ? 1 : value < 30 ? 2 : value < 91 ? 3 : 4;
    sendSetupEvent('setup:progress', { step, totalSteps: 4, title: lastTitle, percent: value, log });
  };
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    ensurePreparationDiskSpace(app.getPath('userData'));
    const locatedBundle = locateOfflineBundle(process.resourcesPath);
    let verifiedBundle = null;
    if (locatedBundle) {
      progress(2, 'Verificando componentes autónomos…', '>>> Comprobando SHA-256 de Python y todas las librerías incluidas.\n');
      verifiedBundle = verifyOfflineBundle(locatedBundle, {
        onFile: ({ index, total, relative }) => progress(2 + Math.round(index / total * 8), `Verificando paquete local ${index}/${total}…`, `Verificado: ${relative}\n`)
      });
    }
    if (strategy === 'rebuild' && automaticAttempt === 1) {
      progress(11, 'Reconstruyendo el entorno interno…', '>>> Reparación completa: se reemplazarán únicamente Python y las librerías internas. Tus proyectos y entregas se conservarán.\n');
      resetInternalEnvironment();
    }
    if (process.platform === 'win32') {
      const vc = checkWindowsVCRedist();
      if (!vc.installed) {
        progress(2, 'Preparando Microsoft Visual C++…');
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-vc-'));
        try {
          const installer = path.join(directory, 'vc_redist.x64.exe');
          if (verifiedBundle?.vcRedist) {
            fs.copyFileSync(verifiedBundle.vcRedist, installer);
            progress(11, 'Instalando Microsoft Visual C++ incluido…');
          } else {
            await downloadFileWithRedirects('https://aka.ms/vs/17/release/vc_redist.x64.exe', installer, percent => progress(2 + Math.round(percent * 0.04), `Descargando Visual C++ (${percent} %)…`));
          }
          const signatureScript = '$s=Get-AuthenticodeSignature -LiteralPath $env:CODEGO_INSTALLER; if ($s.Status -ne "Valid" -or $s.SignerCertificate.Subject -notmatch "Microsoft Corporation") { throw "Firma Microsoft no válida" }';
          await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', signatureScript], { timeout: 60000, windowsHide: true, env: { ...process.env, CODEGO_INSTALLER: installer } });
          try { await executeFile(installer, ['/install', '/quiet', '/norestart'], { timeout: 600000, windowsHide: true }); }
          catch (error) { if (error.code !== 3010) throw error; }
          if (!checkWindowsVCRedist().installed) throw new Error('Visual C++ no pudo verificarse después de instalarlo.');
        } finally {
          fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
        }
      }
    }
    const result = await environmentSetup.prepareEnvironment({
      directory: preparedEnvironmentDirectory,
      selectInterpreter: () => findCompatiblePython(progress, verifiedBundle, {
        // The alternative repair extracts beside the final destination. This
        // avoids temporary mounts, cross-device moves and restrictive /tmp.
        stagingBase: strategy === 'rebuild' ? app.getPath('userData') : os.tmpdir()
      }),
      onProgress: progress,
      wheelhouse: verifiedBundle?.wheelhouse || null
    });
    environmentReady = true;
    sendSetupEvent('setup:finished', { success: true, report: result });
    return result;
  } catch (error) {
    if (automaticAttempt < 2 && automaticSetupRetryAllowed(error)) {
      progress(lastPercent, 'Recuperación automática en curso…', `>>> El intento ${automaticAttempt}/2 se interrumpió: ${error.message}\n>>> codeGO conservará lo completado y reanudará en 2 segundos.\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return prepareAppEnvironment({ strategy, automaticAttempt: automaticAttempt + 1 });
    }
    const offlineAvailable = Boolean(locateOfflineBundle(process.resourcesPath));
    const diagnostic = setupDiagnostic(error, { offlineAvailable });
    sendSetupEvent('setup:finished', { success: false, error: diagnostic.detail, diagnostic });
    return { success: false, error: diagnostic.detail, diagnostic };
  }
}

// IPC Handlers
function setupIpcHandlers() {
  const handle = (channel, callback) => ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || mainWindow.isDestroyed?.() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      return { success: false, error: 'Origen IPC no autorizado.' };
    }
    if (diagnosticMode && /^(security:|wifi:(enable|disable)|system:(beep|enforce-audio|install|auto-install)|exam:)/.test(channel)) return { success: false, error: 'Acción excluida de la comprobación no destructiva.' };
    if (/^system:(install|auto-install|prepare-environment)/.test(channel)) {
      if (installationBusy) return { success: false, error: 'Ya hay una instalación en progreso.' };
      installationBusy = true;
      try { return await callback(event, ...args); }
      catch (error) { return { success: false, error: error.message }; }
      finally { installationBusy = false; }
    }
    return callback(event, ...args);
  });
  handle('security:internal-interaction', async (_event, active) => {
    focusGuard.setInternalInteraction(active === true);
    return { success: true };
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
  handle('system:open-support-page', async () => {
    if (isKioskActive || activeSessionMode) return { success: false, error: 'Disponible desde la pantalla de inicio.' };
    await shell.openExternal('https://paypal.me/FranciscoLopezVzqz');
    return { success: true };
  });
  handle('system:environment-status', async () => {
    const status = environmentSetup.environmentStatus(preparedEnvironmentDirectory);
    environmentReady = diagnosticMode || status.ready;
    return { success: true, ready: environmentReady, command: status.command, report: status.report };
  });
  handle('system:prepare-environment', async (_event, options = {}) => prepareAppEnvironment({
    strategy: options?.strategy === 'rebuild' ? 'rebuild' : 'resume'
  }));
  // Comprehensive Python & Environment Diagnostics
  handle('system:check-full-environment', async () => {
    const pythonInfo = resolvePythonBinary();
    const displays = screen.getAllDisplays();
    const vcRedist = checkWindowsVCRedist();
    const packages = inspectPythonPackages(pythonInfo.command);

    const essentialKeys = environmentSetup.PACKAGES.map(item => item.module);
    const missingKeys = essentialKeys.filter((k) => !packages[k] || !packages[k].installed);

    const hasPython = Boolean(pythonInfo.installed && !pythonInfo.version.includes('No detectado'));
    const hasVCRedist = Boolean(vcRedist.installed);
    const hasAllLibraries = missingKeys.length === 0;
    const isSingleMonitor = displays.length === 1;
    const isSystemReady = hasPython && hasVCRedist && hasAllLibraries && environmentReady;

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
  handle('system:legacy-auto-install-all-prerequisites', async () => {
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
    const targetVenv = resolveVenvDirectory();

    if (!pythonInfo.installed) return { success: false, error: 'Instala Python 3 antes de añadir librerías.' };
    const execPy = pythonInfo.verified
      ? pythonInfo.command
      : ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
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

  // Repair the complete, versioned educational package in the private runtime.
  handle('system:install-all-recommended', async () => {
    if (isKioskActive || workspaceSealed) return { success: false, error: 'Las instalaciones se realizan fuera del examen.' };
    if (activePipProcess) {
      return { success: false, error: 'Ya hay una instalación de pip en progreso.' };
    }

    const recommended = environmentSetup.PACKAGES.map(item => `${item.distribution}==${item.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip:log', `\n======================================================\n`);
      mainWindow.webContents.send('pip:log', `>>> Verificando el paquete completo de ${environmentSetup.PACKAGES.length} librerías para programación y hardware...\n`);
      mainWindow.webContents.send('pip:log', '    Se conservarán las versiones comprobadas para este equipo.\n');
      mainWindow.webContents.send('pip:log', `======================================================\n`);
    }

    const pythonInfo = resolvePythonBinary();
    const targetVenv = resolveVenvDirectory();

    // Create venv if needed
    if (!pythonInfo.installed) return { success: false, error: 'Instala Python 3 antes de añadir librerías.' };
    const execPy = pythonInfo.verified
      ? pythonInfo.command
      : ensurePythonEnvironment({ command: pythonInfo.command, directory: targetVenv });
    let verifiedBundle = null;
    const locatedBundle = locateOfflineBundle(process.resourcesPath);
    if (locatedBundle) {
      try { verifiedBundle = verifyOfflineBundle(locatedBundle); }
      catch (error) { return { success: false, error: `El paquete local no superó la comprobación: ${error.message}` }; }
    }
    const pipArgs = ['-m', 'pip', 'install', '--only-binary=:all:'];
    if (verifiedBundle?.wheelhouse) pipArgs.push('--no-index', '--find-links', verifiedBundle.wheelhouse);
    pipArgs.push(...recommended);

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
            mainWindow.webContents.send('pip:log', success ? `\n>>> ¡Las ${environmentSetup.PACKAGES.length} librerías se verificaron correctamente! ✓\n` : `\n>>> Finalizado con código de salida: ${code}\n`);
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
        const execPy = pythonInfo.verified
          ? pythonInfo.command
          : ensurePythonEnvironment({ command: pythonInfo.command, directory: resolveVenvDirectory() });
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
            return { success: true, ports: parsed, source: 'pyserial', guidance: null };
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

    let guidance = null;
    if (!ports.length) {
      guidance = process.platform === 'linux'
        ? 'No se detectó una placa. Reconecta el USB; si aparece /dev/ttyACM* o /dev/ttyUSB* pero no abre, agrega el usuario al grupo dialout y vuelve a iniciar sesión.'
        : process.platform === 'win32'
          ? 'No se detectó un puerto COM. Reconecta la placa y revisa Administrador de dispositivos; placas CH340/CP210x pueden requerir el controlador del fabricante.'
          : 'No se detectó una placa. Reconecta el USB, autoriza el accesorio si macOS lo solicita y cierra cualquier Monitor Serial abierto.';
    }
    return { success: true, ports, source: 'operating-system', guidance };
  });

  // Start Kiosk Lockdown or Activity Mode
  handle('security:start-kiosk', async (event, studentData) => {
    if (!environmentReady && !diagnosticMode) return { success: false, error: 'Termina la preparación y las micropruebas del equipo antes de iniciar.' };
    if (isKioskActive) return { success: false, error: 'El examen ya está activo.' };
    if (!workspaceExplicitlySelected && !diagnosticMode) return { success: false, error: 'Elige una carpeta de proyecto o crea un proyecto vacío antes de iniciar.' };
    workspaceSealed = false;
    focusGuard.reset();
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
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.maximize();
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
      isKioskActive = false;
      activeSessionMode = 'task';
      if (!fs.existsSync(currentWorkspace)) {
        fs.mkdirSync(currentWorkspace, { recursive: true });
      }
      logSecurityIncident('TASK_MODE_STARTED', {
        student: studentData,
        startTime: new Date().toISOString()
      });

      if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.maximize();
        globalShortcut.unregisterAll();
      }

      return { success: true, mode: 'task' };
    }

    if (teacherPin.length < 8 || teacherPin === 'PROF1234') return { success: false, error: 'El docente debe configurar CODEGO_TEACHER_PIN con al menos 8 caracteres antes de iniciar el examen. Consulta la guía de instalación.' };

    // Exam Mode: Strictly isolate workspace to clean exam folder
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
      focusGuard.reset();
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
    workspaceExplicitlySelected = true;
    workspaceSealed = false;
    return { success: true, workspacePath: currentWorkspace, workspaceName: path.basename(currentWorkspace) };
  });

  handle('workspace:restore', async (event, savedWorkspacePath) => {
    if (activeProcess) return { success: false, error: 'Detén Python antes de cambiar de proyecto.' };
    if (isKioskActive) return { success: false, error: 'No se puede cambiar el proyecto durante un examen.' };
    if (typeof savedWorkspacePath !== 'string' || !savedWorkspacePath.trim()) {
      return { success: false, error: 'La sesión guardada no contiene una carpeta válida.' };
    }
    const restoredPath = path.resolve(savedWorkspacePath.trim());
    try {
      if (!fs.statSync(restoredPath).isDirectory()) {
        return { success: false, missing: true, error: 'La carpeta guardada ya no está disponible.' };
      }
    } catch (_) {
      return { success: false, missing: true, error: 'La carpeta guardada ya no existe o no se puede abrir.' };
    }
    currentWorkspace = restoredPath;
    workspaceExplicitlySelected = true;
    workspaceSealed = false;
    return { success: true, workspacePath: currentWorkspace, workspaceName: path.basename(currentWorkspace) };
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
    currentWorkspace = projectDir;
    workspaceExplicitlySelected = true;
    workspaceSealed = false;
    return { success: true, workspacePath: currentWorkspace, workspaceName: path.basename(currentWorkspace), empty: fs.readdirSync(currentWorkspace).length === 0 };
  });

  handle('workspace:get-current', async () => ({
    selected: workspaceExplicitlySelected,
    workspacePath: workspaceExplicitlySelected ? currentWorkspace : null,
    workspaceName: workspaceExplicitlySelected ? path.basename(currentWorkspace) : null
  }));

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
          const fileType = classifyWorkspaceFile(item.name);
          result.push({
            name: item.name,
            path: itemRelative,
            type: 'file',
            size: fs.statSync(itemFull).size,
            ...fileType
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
      const fileType = classifyWorkspaceFile(safePath);
      if (!fileType.editable) return { success: false, binary: true, kind: fileType.kind, error: 'Este recurso es binario. Python puede usarlo, pero el editor de texto no lo abrirá para evitar dañarlo.' };
      if (fs.statSync(safePath).size > 5 * 1024 * 1024) return { success: false, error: 'El archivo supera 5 MB y no se abrirá en el editor de texto.' };
      const content = fs.readFileSync(safePath, 'utf-8');
      return { success: true, content, path: relativePath.replace(/\\/g, '/') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  handle('fs:import-assets', async () => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    const selected = await withNativeDialog(() => dialog.showOpenDialog(mainWindow, {
      title: 'Agregar recursos al proyecto',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Recursos educativos', extensions: ['png','jpg','jpeg','gif','bmp','webp','svg','wav','mp3','ogg','flac','m4a','csv','tsv','json','txt','xlsx'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    }));
    if (selected.canceled || !selected.filePaths.length) return { success: false, canceled: true };
    const resources = path.join(currentWorkspace, 'recursos');
    fs.mkdirSync(resources, { recursive: true });
    const imported = [];
    for (const source of selected.filePaths) {
      let name = path.basename(source);
      const extension = path.extname(name);
      const stem = path.basename(name, extension);
      let target = path.join(resources, name);
      let suffix = 2;
      while (fs.existsSync(target)) {
        name = `${stem}-${suffix}${extension}`;
        target = path.join(resources, name);
        suffix += 1;
      }
      fs.copyFileSync(source, target);
      imported.push(`recursos/${name}`);
    }
    return { success: true, imported };
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

  handle('fs:move', async (event, { sourcePath, targetDirectory = '' }) => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    try {
      const safeSource = resolveWorkspacePath(currentWorkspace, sourcePath);
      if (!fs.existsSync(safeSource)) throw new Error('El archivo o carpeta ya no existe.');
      const targetRoot = targetDirectory
        ? resolveWorkspacePath(currentWorkspace, targetDirectory)
        : fs.realpathSync(currentWorkspace);
      if (!fs.statSync(targetRoot).isDirectory()) throw new Error('El destino debe ser una carpeta.');
      const safeDestination = path.join(targetRoot, path.basename(safeSource));
      const sourceReal = fs.realpathSync(safeSource);
      const targetReal = fs.realpathSync(targetRoot);
      if (sourceReal === targetReal || targetReal.startsWith(`${sourceReal}${path.sep}`)) {
        throw new Error('No puedes mover una carpeta dentro de sí misma.');
      }
      if (path.dirname(safeSource) === targetRoot) throw new Error('El elemento ya está en esa carpeta.');
      if (fs.existsSync(safeDestination)) throw new Error(`Ya existe “${path.basename(safeSource)}” en la carpeta de destino.`);
      try {
        fs.renameSync(safeSource, safeDestination);
      } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        fs.cpSync(safeSource, safeDestination, { recursive: true, errorOnExist: true });
        fs.rmSync(safeSource, { recursive: true, force: true });
      }
      const relativeDestination = path.relative(fs.realpathSync(currentWorkspace), safeDestination).split(path.sep).join('/');
      return { success: true, oldPath: sourcePath.replace(/\\/g, '/'), path: relativeDestination };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Python Code Execution
  handle('python:run', async (event, { relativePath }) => {
    if (!environmentReady && !diagnosticMode) return { success: false, error: 'El entorno de Python todavía no está preparado o verificado.' };
    try {
      const filePath = resolveWorkspacePath(currentWorkspace, relativePath);
      if (path.extname(filePath).toLowerCase() !== '.py') throw new Error('Selecciona un archivo Python (.py).');
      if (!fs.statSync(filePath).isFile()) throw new Error('El archivo no existe.');
      const source = fs.readFileSync(filePath, 'utf8');
      activePythonGuiExpected = sourceLikelyOpensGui(source);
      activePythonWorkspace = activePythonGuiExpected ? activeHyprlandWorkspace() : null;
      const result = pythonRunner.run(resolvePythonBinary().command, filePath);
      if (!result.success) {
        activePythonGuiExpected = false;
        activePythonWorkspace = null;
      }
      return result;
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
          title: 'Guardar tarea certificada de codeGO',
          defaultPath: path.join(app.getPath('downloads'), defaultName),
          filters: [
            { name: 'Tarea de codeGO (*.codego)', extensions: ['codego'] },
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
        version: app.getVersion(),
        signingIdentity: ensureSigningIdentity(path.join(app.getPath('userData'), 'identity'))
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
      title: 'Seleccionar tarea o examen de codeGO (.codego / .zip)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Archivos de codeGO (*.codego, *.zip)', extensions: ['codego', 'zip'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    }));
    if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
    return { success: true, filePath: filePaths[0], filePaths };
  });

  handle('submission:verify-batch', async (event, filePaths) => {
    try {
      const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
      if (!paths.length) return { success: false, error: 'Selecciona al menos una entrega.' };
      return analyzeSubmissionBatch(paths);
    } catch (e) {
      return { success: false, error: e.message };
    }
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

  handle('submission:extract-code', async (event, payload) => {
    try {
      const filePath = typeof payload === 'string' ? payload : payload?.filePath;
      if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'No se encontró la entrega seleccionada.' };
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

  // In-App Auto-Updater Handlers (Lobby Only)
  handle('updater:get-current-version', async () => {
    return { success: true, version: app.getVersion() };
  });

  handle('updater:check', async () => {
    if (isKioskActive || activeSessionMode === 'exam' || activeSessionMode === 'task') {
      return { success: false, error: 'Comprobación de actualizaciones deshabilitada durante exámenes y tareas.' };
    }
    return updater.checkForUpdates({ currentVersion: app.getVersion() });
  });

  let updateDownloadBusy = false;
  handle('updater:download-and-install', async (event, { downloadUrl, assetName } = {}) => {
    if (isKioskActive || activeSessionMode === 'exam' || activeSessionMode === 'task') {
      return { success: false, error: 'Actualizaciones deshabilitadas durante exámenes y tareas.' };
    }
    if (updateDownloadBusy) {
      return { success: false, error: 'Ya hay una descarga de actualización en curso.' };
    }
    if (!downloadUrl) {
      return { success: false, error: 'No se proporcionó una URL de descarga válida.' };
    }

    updateDownloadBusy = true;
    try {
      const tempDir = app.getPath('temp');
      const cleanName = (assetName || 'CodeGO-Update').replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = path.join(tempDir, cleanName);

      await updater.downloadAssetWithProgress(downloadUrl, destPath, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:progress', progress);
        }
      });

      const result = updater.launchInstaller(destPath);
      if (result.action === 'restarting') {
        setTimeout(() => {
          app.quit();
        }, 800);
      }
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      updateDownloadBusy = false;
    }
  });
}

app.whenReady().then(async () => {
  setupIpcHandlers();
  createMainWindow();
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
