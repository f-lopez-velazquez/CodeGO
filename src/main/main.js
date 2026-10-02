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
  createGradeReceipt,
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
const { sourceLikelyOpensGui, activeHyprlandWorkspace, placeHyprlandWindow, focusMacProcess } = require('./window-integration');
const { createFocusGuard } = require('./focus-guard');
const { MultiLanguageRunner, detectLanguage, detectToolchains, LANGUAGE_DEFS } = require('./language-runner');
const updater = require('./updater');
const appPatch = require('./app-patch');
const { NotificationGuard } = require('./notification-guard');
const { BrowserGuard, DisplayGuard } = require('./session-guards');
const { diagnosePython } = require('./syntax-diagnostics');
const wifiControl = createWifiControl();
const notificationGuard = new NotificationGuard();
const browserGuard = new BrowserGuard();
const displayGuard = new DisplayGuard();

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
const ownsSingleInstance = diagnosticMode || process.env.CODEGO_BOOTSTRAP_OWNS_LOCK === '1' || app.requestSingleInstanceLock();
if (!ownsSingleInstance) app.quit();
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
let pythonForegroundTimer = null;
let pythonForeignFocusActive = false;
let pythonForeignFocusSamples = 0;
let supervisedBlurTimer = null;
let supervisedAlertSent = false;
let fullscreenRetryTimer = null;
let lastFullscreenRequestAt = 0;

function requestProtectedFullscreen({ force = false, focus = false } = {}) {
  if (diagnosticMode || protectedWindowTemporarilyReleased || !mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isFullScreen()) {
    if (focus) mainWindow.focus();
    return true;
  }
  const now = Date.now();
  // Wayland compositors emit intermediate leave events while negotiating a
  // surface. Repeating setFullScreen during that transition causes visible
  // resize loops, especially on Hyprland.
  if (!force && now - lastFullscreenRequestAt < 1500) return false;
  lastFullscreenRequestAt = now;
  mainWindow.setFullScreen(true);
  if (focus) mainWindow.focus();
  return true;
}

function releaseWindowForFreeMode({ focus = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  clearTimeout(fullscreenRetryTimer);
  fullscreenRetryTimer = null;
  protectedWindowTemporarilyReleased = false;
  try {
    mainWindow.setAlwaysOnTop(false);
    if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
    const maximizeNormally = () => {
      if (mainWindow && !mainWindow.isDestroyed() && activeSessionMode === 'activity' && !mainWindow.isFullScreen()) {
        mainWindow.maximize();
      }
    };
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      setTimeout(maximizeNormally, 180);
    } else maximizeNormally();
    // Free practice behaves like a normal maximized desktop application. It
    // must never reclaim focus when the student opens another program.
    if (focus) restoreRendererKeyboardFocus();
    return true;
  } catch (_) {
    return false;
  }
}

function restoreRendererKeyboardFocus() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
    // Wayland may acknowledge the surface first and assign keyboard focus on
    // the following compositor frame. A short second pass is enough and does
    // not renegotiate fullscreen, avoiding the Hyprland resize loop.
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (activeSessionMode === 'activity' && !mainWindow.isFocused()) return;
      mainWindow.focus();
      mainWindow.webContents.focus();
    }, 90);
    return true;
  } catch (_) {
    return false;
  }
}

function clearPythonWindowTimers() {
  pythonWindowTimers.forEach(clearTimeout);
  pythonWindowTimers = [];
  clearInterval(pythonForegroundTimer);
  pythonForegroundTimer = null;
  pythonForeignFocusActive = false;
  pythonForeignFocusSamples = 0;
}

function clearSupervisedBlurTimer() {
  clearTimeout(supervisedBlurTimer);
  supervisedBlurTimer = null;
}

async function foregroundProcessId() {
  try {
    if (process.platform === 'linux' && process.env.HYPRLAND_INSTANCE_SIGNATURE) {
      const { stdout } = await executeFile('hyprctl', ['-j', 'activewindow'], { timeout: 1800, windowsHide: true });
      return Number(JSON.parse(stdout)?.pid) || null;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await executeFile('osascript', ['-e', 'tell application "System Events" to get unix id of first application process whose frontmost is true'], { timeout: 1800 });
      return Number(String(stdout).trim()) || null;
    }
    if (process.platform === 'win32') {
      const script = 'Add-Type -TypeDefinition \"using System; using System.Runtime.InteropServices; public class FG { [DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\\"user32.dll\\\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid); }\"; $p=0; [FG]::GetWindowThreadProcessId([FG]::GetForegroundWindow(), [ref]$p) | Out-Null; $p';
      const { stdout } = await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 2500, windowsHide: true });
      return Number(String(stdout).trim()) || null;
    }
  } catch (_) {}
  return null;
}

function sendPythonForegroundReturn() {
  if (!pythonForeignFocusActive || !mainWindow || mainWindow.isDestroyed()) return;
  pythonForeignFocusActive = false;
  pythonForeignFocusSamples = 0;
  mainWindow.webContents.send('security:focus-regained', {
    phase: 'returned',
    mode: activeSessionMode,
    durationSeconds: 0,
    totalIncidents: securityAuditLog.filter(entry => entry.type === 'UNAUTHORIZED_FOREGROUND_APP').length
  });
}

function startPythonForegroundWatch(child) {
  clearInterval(pythonForegroundTimer);
  pythonForegroundTimer = setInterval(async () => {
    if (!activePythonGuiExpected || activeProcess !== child || child.killed || !['exam', 'task'].includes(activeSessionMode)) return;
    if (mainWindow?.isFocused()) {
      sendPythonForegroundReturn();
      return;
    }
    const foregroundPid = await foregroundProcessId();
    if (!foregroundPid) return;
    if (foregroundPid === child.pid) {
      sendPythonForegroundReturn();
      return;
    }
    pythonForeignFocusSamples += 1;
    if (pythonForeignFocusSamples < 2 || pythonForeignFocusActive) return;
    pythonForeignFocusActive = true;
    const incident = logSecurityIncident('UNAUTHORIZED_FOREGROUND_APP', { foregroundPid, pythonPid: child.pid, mode: activeSessionMode });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('security:blur-detected', {
        incident,
        phase: 'away',
        mode: activeSessionMode,
        timestamp: new Date().toLocaleTimeString(),
        totalIncidents: securityAuditLog.filter(entry => entry.type === 'UNAUTHORIZED_FOREGROUND_APP').length
      });
      if (activeSessionMode === 'exam') {
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    }
  }, 900);
  pythonForegroundTimer.unref?.();
}

function restoreMainWindowAfterPython() {
  clearPythonWindowTimers();
  if (!mainWindow || mainWindow.isDestroyed() || !protectedWindowTemporarilyReleased) return;
  protectedWindowTemporarilyReleased = false;
  try {
    if (activeSessionMode === 'exam') {
      mainWindow.setKiosk(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.focus();
    } else if (activeSessionMode === 'task') {
      requestProtectedFullscreen({ force: true, focus: true });
    } else {
      releaseWindowForFreeMode();
    }
  } catch (_) {}
}

function prepareMainWindowForPythonGui(child) {
  if (!activePythonGuiExpected || !child?.pid || !mainWindow || mainWindow.isDestroyed()) return;
  // Native learning windows (Pygame, Tkinter, Turtle, Matplotlib) need a real
  // desktop surface. Pause fullscreen enforcement only while that child lives,
  // then restore codeGO automatically when it exits or is stopped.
  protectedWindowTemporarilyReleased = true;
  try {
    mainWindow.setAlwaysOnTop(false);
    if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
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
  if (process.platform === 'darwin') {
    // Pygame/SDL creates a second native application surface. macOS can leave
    // it behind Electron's former fullscreen Space unless that exact child is
    // promoted after the surface appears.
    [240, 600, 1200, 2200].forEach(delay => {
      pythonWindowTimers.push(setTimeout(() => {
        if (activeProcess === child && !child.killed) focusMacProcess(child.pid);
      }, delay));
    });
  }
  startPythonForegroundWatch(child);
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
const multiLanguageRunner = new MultiLanguageRunner({
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
let lastReportedMonitorCount = null;
const managedTeacherPin = String(process.env.CODEGO_TEACHER_PIN || '').trim();
let activeTeacherPin = managedTeacherPin || null;

// Dynamic student workspace directory (supports opening & creating projects)
let currentWorkspace = path.join(app.getPath('userData'), 'exam_workspace');
if (!fs.existsSync(currentWorkspace)) {
  fs.mkdirSync(currentWorkspace, { recursive: true });
}
const defaultWorkspace = currentWorkspace;
let workspaceExplicitlySelected = diagnosticMode;
let workspaceSealed = false;
const activeExamMarkerPath = path.join(app.getPath('userData'), 'active-exam-session.json');

function writeActiveExamMarker(student = {}) {
  const record = {
    examId: String(student.examId || ''),
    studentName: String(student.name || ''),
    studentId: String(student.id || ''),
    startedAt: new Date().toISOString(),
    version: currentAppVersion()
  };
  fs.writeFileSync(`${activeExamMarkerPath}.tmp`, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.renameSync(`${activeExamMarkerPath}.tmp`, activeExamMarkerPath);
}

function clearActiveExamMarker() {
  try { fs.unlinkSync(activeExamMarkerPath); } catch (_) {}
}

function readActiveExamMarker() {
  try { return JSON.parse(fs.readFileSync(activeExamMarkerPath, 'utf8')); }
  catch (_) { return null; }
}

const AUTOMATIC_UPDATE_INTERVAL_MS = 30 * 60 * 1000;
let automaticUpdateTimer = null;
let automaticUpdateStartTimer = null;
let updateDownloadBusy = false;
let updateApplyBusy = false;
let availableUpdateInfo = null;
let stagedUpdatePath = null;
let updateState = {
  status: 'idle',
  currentVersion: process.env.CODEGO_EFFECTIVE_VERSION || (typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0'),
  automatic: true
};

function currentAppVersion() {
  return process.env.CODEGO_EFFECTIVE_VERSION || (typeof app.getVersion === 'function' ? app.getVersion() : updateState.currentVersion || '0.0.0');
}

function publicUpdateState() {
  return {
    ...updateState,
    currentVersion: currentAppVersion(),
    update: availableUpdateInfo ? {
      currentVersion: availableUpdateInfo.currentVersion,
      latestVersion: availableUpdateInfo.latestVersion,
      releaseName: availableUpdateInfo.releaseName,
      releaseNotes: availableUpdateInfo.releaseNotes,
      releaseUrl: availableUpdateInfo.releaseUrl,
      publishedAt: availableUpdateInfo.publishedAt,
      asset: availableUpdateInfo.asset
    } : null
  };
}

function setUpdateState(status, detail = {}) {
  updateState = { status, automatic: true, ...detail };
  const payload = publicUpdateState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:state', payload);
  return payload;
}

function updateCanRestartNow() {
  return !diagnosticMode && app.isPackaged && !activeSessionMode && !isKioskActive && !installationBusy && !activeProcess;
}

async function applyStagedUpdate() {
  if (!stagedUpdatePath || !availableUpdateInfo?.asset) return { success: false, error: 'No hay una actualización preparada.' };
  if (updateApplyBusy) return { success: false, deferred: true, error: 'La actualización ya se está aplicando.' };
  if (!updateCanRestartNow()) {
    setUpdateState('deferred', { latestVersion: availableUpdateInfo.latestVersion, message: 'Se instalará al terminar la sesión actual.' });
    return { success: true, deferred: true };
  }

  updateApplyBusy = true;
  try {
    setUpdateState('installing', { latestVersion: availableUpdateInfo.latestVersion, percent: 100 });
    if (availableUpdateInfo.asset.kind === 'app-patch' || updater.findAppPatchAsset([availableUpdateInfo.asset])) {
      const expectedHash = updater.normalizeDigest(availableUpdateInfo.asset.digest);
      const installed = appPatch.installPatch(app.getPath('userData'), stagedUpdatePath, {
        version: availableUpdateInfo.latestVersion,
        sha256: expectedHash
      });
      allowWindowClose = true;
      app.relaunch({ args: process.argv.slice(1).filter(argument => argument !== '--updated').concat('--updated') });
      setTimeout(() => app.quit(), 120);
      return { success: true, action: 'restarting', automatic: true, lightweight: true, path: installed.path };
    }
    const userIcon = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '512x512', 'apps', 'codego.png');
    const result = updater.launchInstaller(stagedUpdatePath, process.platform, {
      currentExecutable: process.execPath,
      appImagePath: process.env.APPIMAGE,
      homeDirectory: os.homedir(),
      iconPath: userIcon
    });
    if (result.action === 'restarting') {
      allowWindowClose = true;
      setTimeout(() => app.quit(), 120);
    }
    return { success: true, ...result };
  } catch (error) {
    setUpdateState('error', { latestVersion: availableUpdateInfo.latestVersion, error: error.message });
    return { success: false, error: error.message };
  } finally {
    updateApplyBusy = false;
  }
}

async function checkAndStageAutomaticUpdate({ installWhenReady = true, force = false } = {}) {
  if (diagnosticMode) return { success: true, hasUpdate: false, currentVersion: currentAppVersion() };
  if (updateDownloadBusy) return { success: true, busy: true, ...publicUpdateState() };
  if (!force && ['ready', 'deferred', 'installing'].includes(updateState.status) && stagedUpdatePath) {
    if (installWhenReady) setTimeout(() => void applyStagedUpdate(), 250);
    return { success: true, hasUpdate: true, ...publicUpdateState() };
  }

  updateDownloadBusy = true;
  try {
    setUpdateState('checking');
    const info = await updater.checkForUpdates({ currentVersion: currentAppVersion(), timeoutMs: 12000 });
    if (!info.success) {
      setUpdateState('offline', { error: info.error });
      return info;
    }
    if (!info.hasUpdate) {
      availableUpdateInfo = null;
      stagedUpdatePath = null;
      setUpdateState('current', { latestVersion: currentAppVersion() });
      return info;
    }

    availableUpdateInfo = info;
    setUpdateState('available', { latestVersion: info.latestVersion, releaseName: info.releaseName });
    if (!info.asset?.downloadUrl) {
      const error = 'La versión publicada no incluye un instalador compatible con este equipo.';
      setUpdateState('error', { latestVersion: info.latestVersion, error });
      return { ...info, success: false, error };
    }
    if (!updater.normalizeDigest(info.asset.digest)) {
      const error = 'El instalador publicado no incluye una firma SHA-256 verificable.';
      setUpdateState('error', { latestVersion: info.latestVersion, error });
      return { ...info, success: false, error };
    }

    if (!app.isPackaged) return info;
    const updateDirectory = path.join(app.getPath('userData'), 'updates', `v${info.latestVersion}`);
    fs.mkdirSync(updateDirectory, { recursive: true });
    const cleanName = info.asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destination = path.join(updateDirectory, cleanName);
    let validExisting = false;
    try {
      updater.verifyDownloadedAsset(destination, info.asset);
      validExisting = true;
    } catch (_) {}

    if (!validExisting) {
      const partial = `${destination}.part`;
      try { fs.unlinkSync(partial); } catch (_) {}
      setUpdateState('downloading', { latestVersion: info.latestVersion, percent: 0 });
      await updater.downloadAssetWithProgress(info.asset.downloadUrl, partial, progress => {
        setUpdateState('downloading', { latestVersion: info.latestVersion, ...progress });
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:progress', progress);
      }, info.asset);
      try { fs.unlinkSync(destination); } catch (_) {}
      fs.renameSync(partial, destination);
    }

    updater.verifyDownloadedAsset(destination, info.asset);
    stagedUpdatePath = destination;
    setUpdateState(updateCanRestartNow() ? 'ready' : 'deferred', {
      latestVersion: info.latestVersion,
      percent: 100,
      message: updateCanRestartNow() ? 'Actualización lista para instalar.' : 'Se instalará al terminar la sesión actual.'
    });
    if (installWhenReady) setTimeout(() => void applyStagedUpdate(), 1200);
    return { ...info, status: updateState.status, prepared: true };
  } catch (error) {
    setUpdateState('error', { latestVersion: availableUpdateInfo?.latestVersion, error: error.message });
    return { success: false, hasUpdate: Boolean(availableUpdateInfo), error: error.message };
  } finally {
    updateDownloadBusy = false;
  }
}

function scheduleAutomaticUpdates() {
  if (diagnosticMode) return;
  clearTimeout(automaticUpdateStartTimer);
  clearInterval(automaticUpdateTimer);
  automaticUpdateStartTimer = setTimeout(() => void checkAndStageAutomaticUpdate({ installWhenReady: true }), 12000);
  automaticUpdateTimer = setInterval(() => void checkAndStageAutomaticUpdate({ installWhenReady: true }), AUTOMATIC_UPDATE_INTERVAL_MS);
  automaticUpdateTimer.unref?.();
}

function safeExamName(value, fallback) {
  const cleaned = String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

function createFreshExamWorkspace(studentData = {}) {
  const student = safeExamName(studentData.name, 'Alumno');
  const examId = safeExamName(studentData.examId, 'Examen');
  const sessionId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const examRoot = path.join(app.getPath('userData'), 'exam_sessions', examId);
  fs.mkdirSync(examRoot, { recursive: true });
  const root = path.join(examRoot, `${student}-${sessionId}`);
  fs.mkdirSync(root, { recursive: false });
  const extensions = { python: 'py', cpp: 'cpp', java: 'java', javascript: 'js', r: 'R' };
  const extension = extensions[studentData.language] || 'py';
  const initialFile = `${student}_${examId}.${extension}`;
  fs.writeFileSync(path.join(root, initialFile), '', { encoding: 'utf8', flag: 'wx' });
  currentWorkspace = root;
  workspaceExplicitlySelected = true;
  workspaceSealed = false;
  return { workspacePath: root, workspaceName: `Examen ${studentData.examId || examId}`, initialFile };
}

// ==============================================================
// HARDWARE/OS AUDIO ANTI-MUTE WATCHDOG & WI-FI ENFORCEMENT
// ==============================================================
let audioWatchdogInterval = null;
let audioEnforcementInFlight = false;
let lastAudioEnforcementAt = 0;

function runAudioCommand(command, args, done) {
  execFile(command, args, { windowsHide: true, timeout: 2500 }, error => done(!error));
}

function enforceSystemAudioUnmute(targetVolume = 1, raiseFully = false) {
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
    const presses = raiseFully ? 50 : 1;
    const psCmd = `$wscript = New-Object -ComObject WScript.Shell; 1..${presses} | ForEach-Object { $wscript.SendKeys([char]175) }`;
    runAudioCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], finish);
  } else if (platform === 'darwin') {
    runAudioCommand('osascript', ['-e', `set volume output volume ${Math.round(targetVolume * 100)}`], finish);
  } else {
    finish();
  }
}

function startAudioWatchdog() {
  stopAudioWatchdog();
  void displayGuard.maximize();
  enforceSystemAudioUnmute(1, true);
  for (const accelerator of ['VolumeMute', 'VolumeDown']) {
    try {
      globalShortcut.register(accelerator, () => {
        enforceSystemAudioUnmute(1, true);
        logSecurityIncident('ALARM_AUDIO_KEY_BLOCKED', { accelerator });
      });
    } catch (_) {}
  }
  audioWatchdogInterval = setInterval(() => {
    if (activeSessionMode === 'exam' || activeSessionMode === 'task') {
      enforceSystemAudioUnmute(1);
    }
  }, 1000);
}

function stopAudioWatchdog() {
  if (audioWatchdogInterval) {
    clearInterval(audioWatchdogInterval);
    audioWatchdogInterval = null;
  }
  for (const accelerator of ['VolumeMute', 'VolumeDown']) {
    try { globalShortcut.unregister(accelerator); } catch (_) {}
  }
  void displayGuard.restore();
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

function inspectPythonPackagesAsync(pythonCmd) {
  return new Promise(resolve => {
    const child = spawn(pythonCmd, ['-I', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONNOUSERSITE: '1', PYGAME_HIDE_SUPPORT_PROMPT: '1' }
    });
    let stdout = '';
    let settled = false;
    let timer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-2_000_000); });
    child.on('error', () => finish({}));
    child.on('close', code => {
      if (code !== 0) return finish({});
      try { finish(environmentSetup.parseResult(stdout)); }
      catch (_) { finish({}); }
    });
    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      finish({});
    }, 180000);
    child.stdin.end(environmentSetup.inspectScript());
  });
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

function reportProtectedAttempt(type, details = {}) {
  const incident = logSecurityIncident(type, details);
  if (!mainWindow || mainWindow.isDestroyed() || activeSessionMode !== 'exam') return incident;
  const payload = {
    incident,
    phase: 'away',
    mode: activeSessionMode,
    timestamp: new Date().toLocaleTimeString(),
    totalIncidents: securityAuditLog.filter(entry => /ATTEMPT|WINDOW_BLUR|MULTIPLE_DISPLAYS/.test(entry.type)).length
  };
  mainWindow.webContents.send('security:blur-detected', payload);
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || activeSessionMode !== 'exam' || !mainWindow.isFocused()) return;
    mainWindow.webContents.send('security:focus-regained', { ...payload, phase: 'returned', durationSeconds: 0.3 });
  }, 300);
  return incident;
}

function createMainWindow() {
  // Screen metrics are in device-independent pixels, including OS display scaling.
  const { workAreaSize } = screen.getPrimaryDisplay();
  const appIconPath = path.join(__dirname, '../../build/icon.png');
  mainWindow = new BrowserWindow({
    icon: appIconPath,
    width: Math.min(1440, workAreaSize.width),
    height: Math.min(900, workAreaSize.height),
    minWidth: Math.min(640, workAreaSize.width),
    minHeight: Math.min(360, workAreaSize.height),
    // Let Electron request the compositor mode once, before mapping the
    // surface. Calling maximize + fullscreen after showing creates a resize
    // feedback loop on Wayland/Hyprland.
    fullscreen: !diagnosticMode,
    show: false,
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
      // Alarm audio and the return-to-app state machine must keep running when
      // the window loses focus.
      backgroundThrottling: false,
      devTools: false // DevTools disabled for security
    }
  });

  if (!diagnosticMode) {
    mainWindow.once('ready-to-show', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.show();
      mainWindow.focus();
    });
  }

  // Only supervised sessions enforce fullscreen. Free practice is a regular
  // maximized application and must allow Alt+Tab, workspaces and other apps.
  mainWindow.on('leave-full-screen', () => {
    if (diagnosticMode || protectedWindowTemporarilyReleased || !mainWindow || mainWindow.isDestroyed()) return;
    if (!['exam', 'task'].includes(activeSessionMode)) return;
    clearTimeout(fullscreenRetryTimer);
    fullscreenRetryTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || protectedWindowTemporarilyReleased) return;
      requestProtectedFullscreen({ force: activeSessionMode === 'exam' });
    }, activeSessionMode === 'exam' ? 250 : 1600);
  });

  if (process.env.CODEGO_PATCH_VERSION) {
    mainWindow.webContents.once('did-finish-load', () => {
      appPatch.markPatchHealthy(app.getPath('userData'), process.env.CODEGO_PATCH_VERSION);
    });
  }
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('blur', () => {
    const pythonWindow = Boolean(activePythonGuiExpected && activeProcess && !activeProcess.killed);
    if (activeSessionMode === 'activity') return;
    const focusSupervisionActive = activeSessionMode === 'exam' || activeSessionMode === 'task';
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

    clearSupervisedBlurTimer();
    supervisedAlertSent = false;
    const modeAtBlur = activeSessionMode;
    // Native dialogs are explicitly guarded above. This short confirmation
    // window filters transient focus hand-offs from OS notification banners
    // and compositor animation without hiding a real application switch.
    supervisedBlurTimer = setTimeout(() => {
      supervisedBlurTimer = null;
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused() || activeSessionMode !== modeAtBlur) return;
      supervisedAlertSent = true;
      const incident = logSecurityIncident('WINDOW_BLUR', {
        mode: activeSessionMode,
        message: activeSessionMode === 'exam'
          ? 'Se detectó cambio de ventana durante el examen.'
          : 'Se detectó cambio de ventana durante la actividad.',
        timestamp: new Date().toLocaleTimeString()
      });
      mainWindow.webContents.send('security:blur-detected', {
        incident,
        phase: 'away',
        mode: activeSessionMode,
        totalIncidents: securityAuditLog.filter(entry => entry.type === 'WINDOW_BLUR').length,
        durationSeconds: 1.0
      });
    }, 650);
  });

  mainWindow.on('focus', () => {
    if (activeSessionMode === 'activity') return;
    const focusSupervisionActive = activeSessionMode === 'exam' || activeSessionMode === 'task';
    const decision = focusGuard.focus({ sessionActive: focusSupervisionActive });
    if (!decision.violation) return;
    const alertWasSent = supervisedAlertSent;
    clearSupervisedBlurTimer();
    supervisedAlertSent = false;
    if (!alertWasSent) return;
    const durationSeconds = decision.durationSeconds.toFixed(1);

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
        phase: 'returned',
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
    reportProtectedAttempt('UNAUTHORIZED_WINDOW_OPEN_ATTEMPT', {});
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
      reportProtectedAttempt('DEVTOOLS_SHORTCUT_BLOCKED', { key: input.key });
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
      reportProtectedAttempt('ALT_TAB_ATTEMPT', {});
    }

    // Alt+F4 block attempt
    if (input.alt && input.key === 'F4') {
      event.preventDefault();
      reportProtectedAttempt('ALT_F4_ATTEMPT', {});
    }
  });

  mainWindow.on('close', (event) => {
    if (isKioskActive) {
      event.preventDefault();
      reportProtectedAttempt('WINDOW_CLOSE_ATTEMPT', {});
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

    if (count > 1 && isKioskActive && count !== lastReportedMonitorCount) {
      logSecurityIncident('MULTIPLE_DISPLAYS_DETECTED', { count });
    }

    mainWindow.webContents.send('monitor:status', {
      count,
      isMultiple: count > 1 && isKioskActive,
      displays: displays.map((d, i) => ({
        id: d.id,
        label: `Pantalla ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
        isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor
      }))
    });
    lastReportedMonitorCount = count;
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
    return runSelfTest({ command: resolvePythonBinary().command, directory: app.getPath('userData'), version: currentAppVersion() });
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
    const packages = await inspectPythonPackagesAsync(pythonInfo.command);

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
    const requestedMode = studentData?.mode || 'exam';
    const safeStudentData = { ...(studentData || {}) };
    delete safeStudentData.teacherPin;
    if (requestedMode !== 'exam' && !workspaceExplicitlySelected && !diagnosticMode) return { success: false, error: 'Elige una carpeta de proyecto o crea un proyecto vacío antes de iniciar.' };
    workspaceSealed = false;
    focusGuard.reset();
    clearSupervisedBlurTimer();
    supervisedAlertSent = false;
    const isActivity = studentData && studentData.mode === 'activity';

    if (isActivity) {
      isKioskActive = false;
      activeSessionMode = 'activity';
      securityAuditLog = [];
      await notificationGuard.restore();
      stopAudioWatchdog();
      logSecurityIncident('ACTIVITY_MODE_STARTED', {
        student: safeStudentData,
        startTime: new Date().toISOString()
      });

      if (mainWindow) {
        globalShortcut.unregisterAll();
        releaseWindowForFreeMode({ focus: true });
      }

      return { success: true, mode: 'activity' };
    }

    if (studentData && studentData.mode === 'task') {
      isKioskActive = false;
      activeSessionMode = 'task';
      securityAuditLog = [];
      await notificationGuard.enable();
      if (!fs.existsSync(currentWorkspace)) {
        fs.mkdirSync(currentWorkspace, { recursive: true });
      }
      logSecurityIncident('TASK_MODE_STARTED', {
        student: safeStudentData,
        startTime: new Date().toISOString()
      });

      if (mainWindow) {
        if (mainWindow.isKiosk()) mainWindow.setKiosk(false);
        requestProtectedFullscreen();
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
        restoreRendererKeyboardFocus();
      }

      return { success: true, mode: 'task' };
    }

    if (!studentData?.examId || !String(studentData.examId).trim()) return { success: false, error: 'Escribe el ID dictado por el profesor.' };
    const requestedTeacherPin = managedTeacherPin || String(studentData?.teacherPin || '').trim();
    if (!/^\d{4,12}$/.test(requestedTeacherPin)) {
      return { success: false, error: 'El profesor debe definir un PIN de 4 a 12 dígitos antes de iniciar el examen.' };
    }
    activeTeacherPin = requestedTeacherPin;

    // Each exam gets a new private directory. Previous projects are never
    // mounted into the exam session and the initial source file is blank.
    const examWorkspace = createFreshExamWorkspace(safeStudentData);
    const browserResult = await browserGuard.closeAll();

    const wifiResult = disableSystemWifi();
    if (!wifiResult.success) {
      enableSystemWifi();
      return { success: false, error: `No se inició el examen: ${wifiResult.error}` };
    }
    isKioskActive = true;
    activeSessionMode = 'exam';
    writeActiveExamMarker(safeStudentData);
    await notificationGuard.enable();
    securityAuditLog = []; // Reset for this student session

    // Wi-Fi was verified before activating the protected session.
    logSecurityIncident('EXAM_STARTED', {
      student: safeStudentData,
      browsersClosed: browserResult.closed,
      startTime: new Date().toISOString()
    });

    if (mainWindow) {
      mainWindow.setMenu(null);
      mainWindow.setMenuBarVisibility(false);
      mainWindow.setKiosk(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');

      // Register system-level shortcuts to capture keys and prevent silencing alarms
      try {
        const forbiddenKeys = ['Alt+Tab', 'Super', 'Alt+F4', 'F11'];
        globalShortcut.registerAll(forbiddenKeys, () => {
          try { shell.beep(); } catch (_) {}
          logSecurityIncident('GLOBAL_SHORTCUT_INTERCEPTED', {});
        });
      } catch (err) {
        console.warn('Global shortcuts registration note:', err);
      }
      restoreRendererKeyboardFocus();
    }

    return { success: true, mode: 'exam', ...examWorkspace };
  });

  // Exit Kiosk Mode (Requires Teacher PIN)
  handle('security:exit-kiosk', async (event, enteredPin) => {
    if (String(enteredPin || '') === activeTeacherPin) {
      isKioskActive = false;
      activeSessionMode = null;
      activeTeacherPin = managedTeacherPin || null;
      clearActiveExamMarker();
      focusGuard.reset();
      stopAudioWatchdog();
      await notificationGuard.restore();
      enableSystemWifi();

      if (mainWindow) {
        mainWindow.setKiosk(false);
        requestProtectedFullscreen({ force: true });
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
        restoreRendererKeyboardFocus();
      }
      logSecurityIncident('TEACHER_UNLOCK_SUCCESSFUL', { pinEntered: true });
      setTimeout(() => void applyStagedUpdate(), 1500);
      return { success: true };
    } else {
      logSecurityIncident('TEACHER_UNLOCK_FAILED_WRONG_PIN', { pinLength: String(enteredPin || '').length });
      return { success: false, error: 'PIN de profesor incorrecto.' };
    }
  });

  handle('security:end-session', async () => {
    if (activeSessionMode === 'exam' && isKioskActive) {
      return { success: false, error: 'La salida del examen requiere autorización docente.' };
    }
    activeSessionMode = null;
    focusGuard.reset();
    clearSupervisedBlurTimer();
    supervisedAlertSent = false;
    stopAudioWatchdog();
    await notificationGuard.restore();
    globalShortcut.unregisterAll();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
      requestProtectedFullscreen({ force: true });
      restoreRendererKeyboardFocus();
    }
    setTimeout(() => void applyStagedUpdate(), 1500);
    return { success: true };
  });

  handle('security:get-recovery-status', async () => {
    const interruptedExam = readActiveExamMarker();
    return { success: true, interruptedExam };
  });

  handle('security:get-pin-policy', async () => ({ success: true, managed: Boolean(managedTeacherPin) }));

  handle('security:acknowledge-recovery', async () => {
    clearActiveExamMarker();
    return { success: true };
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
      enforceSystemAudioUnmute(1, true);
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  });

  handle('system:set-alarm-active', async (event, active) => {
    if (active === true && (activeSessionMode === 'exam' || activeSessionMode === 'task')) {
      startAudioWatchdog();
      return { success: true, active: true };
    }
    stopAudioWatchdog();
    return { success: true, active: false };
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

  handle('workspace:reveal-current', async () => {
    if (!workspaceExplicitlySelected || !currentWorkspace) {
      return { success: false, error: 'Abre un proyecto antes de mostrar su carpeta.' };
    }
    if (activeSessionMode === 'exam' && isKioskActive) {
      return { success: false, error: 'El explorador de archivos no está disponible durante un examen.' };
    }
    try {
      const error = await shell.openPath(currentWorkspace);
      return error ? { success: false, error } : { success: true, workspacePath: currentWorkspace };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  handle('window:focus-editor', async () => ({ success: restoreRendererKeyboardFocus() }));

  // Window Screen Controls
  handle('window:set-fullscreen', async (event, flag) => {
    if (diagnosticMode) return { success: true };
    if (activeSessionMode === 'activity' && flag === false) {
      return { success: releaseWindowForFreeMode(), isFullScreen: false };
    }
    if (flag === false) return { success: false, error: 'La sesión supervisada trabaja en pantalla completa.' };
    if (mainWindow && !mainWindow.isDestroyed()) {
      requestProtectedFullscreen();
      return { success: true, isFullScreen: mainWindow.isFullScreen() };
    }
    return { success: false };
  });

  handle('window:maximize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (activeSessionMode === 'activity') {
        return { success: releaseWindowForFreeMode(), isFullScreen: false };
      }
      requestProtectedFullscreen();
      return { success: true };
    }
    return { success: false };
  });

  // Safe App Exit (Unmutes and re-enables Wi-Fi before closing)
  handle('app:quit-safe', async () => {
    if (isKioskActive) return { success: false, error: 'Se requiere autorización docente para salir.' };
    allowWindowClose = true;
    closeRequestPending = false;
    activeSessionMode = null;
    focusGuard.reset();
    clearSupervisedBlurTimer();
    supervisedAlertSent = false;
    stopAudioWatchdog();
    await notificationGuard.restore();
    globalShortcut.unregisterAll();
    enableSystemWifi();
    pythonRunner.kill();
    app.quit();
    return { success: true };
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

  handle('fs:preview-file', async (event, relativePath) => {
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      const stat = await fs.promises.stat(safePath);
      if (!stat.isFile()) throw new Error('Selecciona una imagen o un archivo de audio.');
      const fileType = classifyWorkspaceFile(safePath);
      if (!['image', 'audio'].includes(fileType.kind)) {
        return { success: false, error: 'La vista previa está disponible para imágenes y audio.' };
      }
      const maximumBytes = fileType.kind === 'image' ? 30 * 1024 * 1024 : 60 * 1024 * 1024;
      if (stat.size > maximumBytes) {
        return { success: false, error: `El recurso supera el límite de vista previa de ${maximumBytes / 1024 / 1024} MB.` };
      }
      const mimeTypes = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
        '.flac': 'audio/flac', '.m4a': 'audio/mp4'
      };
      const mime = mimeTypes[path.extname(safePath).toLowerCase()];
      if (!mime) return { success: false, error: 'Este formato no admite vista previa.' };
      const dataUrl = `data:${mime};base64,${(await fs.promises.readFile(safePath)).toString('base64')}`;
      return {
        success: true,
        kind: fileType.kind,
        mime,
        dataUrl,
        name: path.basename(safePath),
        size: stat.size
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  handle('fs:reveal-item', async (event, relativePath) => {
    if (activeSessionMode === 'exam') {
      return { success: false, error: 'El explorador del sistema no está disponible durante un examen.' };
    }
    try {
      const safePath = resolveWorkspacePath(currentWorkspace, relativePath);
      if (!fs.existsSync(safePath)) throw new Error('El archivo o carpeta ya no existe.');
      if (fs.statSync(safePath).isDirectory()) {
        const error = await shell.openPath(safePath);
        return error ? { success: false, error } : { success: true };
      }
      shell.showItemInFolder(safePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  handle('fs:import-assets', async () => {
    if (workspaceSealed) return { success: false, error: 'El espacio de trabajo entregado es de solo lectura.' };
    const selected = await withNativeDialog(() => dialog.showOpenDialog(mainWindow, {
      title: 'Agregar recursos al proyecto',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Recursos educativos', extensions: ['pdf','png','jpg','jpeg','gif','bmp','webp','svg','wav','mp3','ogg','flac','m4a','csv','tsv','json','txt','xlsx'] },
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
      const normalizedOld = String(oldPath || '').replace(/\\/g, '/');
      const normalizedNew = String(newPath || '').replace(/\\/g, '/');
      if (normalizedOld.split('/').slice(0, -1).join('/') !== normalizedNew.split('/').slice(0, -1).join('/')) {
        throw new Error('Para cambiar de carpeta, utiliza la opción Mover.');
      }
      const newName = normalizedNew.split('/').pop() || '';
      if (!newName.trim() || newName === '.' || newName === '..' || /[\\/\0]/.test(newName)) {
        throw new Error('Escribe un nombre válido sin diagonales.');
      }
      const safeOld = resolveWorkspacePath(currentWorkspace, oldPath);
      const safeNew = resolveWorkspacePath(currentWorkspace, newPath);
      if (!fs.existsSync(safeOld)) throw new Error('El archivo o carpeta ya no existe.');
      if (safeOld === safeNew) return { success: true, oldPath: normalizedOld, path: normalizedNew };
      const isCaseOnlyRename = safeOld.toLocaleLowerCase('en-US') === safeNew.toLocaleLowerCase('en-US');
      if (fs.existsSync(safeNew) && !isCaseOnlyRename) throw new Error(`Ya existe “${newName}” en esta carpeta.`);
      if (fs.existsSync(safeNew) && isCaseOnlyRename) {
        const temporary = path.join(path.dirname(safeOld), `.codego-rename-${process.pid}-${Date.now()}`);
        fs.renameSync(safeOld, temporary);
        try { fs.renameSync(temporary, safeNew); }
        catch (error) {
          try { fs.renameSync(temporary, safeOld); } catch (_) {}
          throw error;
        }
      } else {
        fs.renameSync(safeOld, safeNew);
      }
      return { success: true, oldPath: normalizedOld, path: normalizedNew };
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

  // Multi-Language Code Execution
  handle('code:run', async (event, { relativePath, language } = {}) => {
    try {
      const filePath = resolveWorkspacePath(currentWorkspace, relativePath);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error('El archivo seleccionado no existe.');
      }
      const lang = language || detectLanguage(filePath);
      if (lang === 'python') {
        if (!environmentReady && !diagnosticMode) return { success: false, error: 'El entorno de Python todavía no está preparado o verificado.' };
        const source = fs.readFileSync(filePath, 'utf8');
        activePythonGuiExpected = sourceLikelyOpensGui(source);
        activePythonWorkspace = activePythonGuiExpected ? activeHyprlandWorkspace() : null;
        const result = pythonRunner.run(resolvePythonBinary().command, filePath);
        if (!result.success) {
          activePythonGuiExpected = false;
          activePythonWorkspace = null;
        }
        return result;
      }
      return multiLanguageRunner.run({ filePath, language: lang });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  handle('code:stdin', (event, value) => {
    if (multiLanguageRunner.child) return multiLanguageRunner.stdin(value);
    return pythonRunner.stdin(value);
  });

  handle('code:kill', () => {
    if (multiLanguageRunner.child) return multiLanguageRunner.kill();
    return pythonRunner.kill();
  });

  handle('languages:detect', async () => {
    return {
      success: true,
      toolchains: detectToolchains(),
      languages: LANGUAGE_DEFS
    };
  });

  // Python Code Execution (Preserved with smart polyglot fallback)
  handle('python:run', async (event, { relativePath }) => {
    try {
      const filePath = resolveWorkspacePath(currentWorkspace, relativePath);
      const lang = detectLanguage(filePath);
      if (lang !== 'python') {
        return multiLanguageRunner.run({ filePath, language: lang });
      }
      if (!environmentReady && !diagnosticMode) return { success: false, error: 'El entorno de Python todavía no está preparado o verificado.' };
      if (!fs.statSync(filePath).isFile()) throw new Error('El archivo no existe.');
      const source = fs.readFileSync(filePath, 'utf8');
      activePythonGuiExpected = sourceLikelyOpensGui(source);
      activePythonWorkspace = activePythonGuiExpected ? activeHyprlandWorkspace() : null;
      const result = pythonRunner.run(resolvePythonBinary().command, filePath, { workingDirectory: currentWorkspace });
      if (!result.success) {
        activePythonGuiExpected = false;
        activePythonWorkspace = null;
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  handle('python:stdin', (event, value) => {
    if (multiLanguageRunner.child) return multiLanguageRunner.stdin(value);
    return pythonRunner.stdin(value);
  });
  handle('python:kill', () => {
    if (multiLanguageRunner.child) return multiLanguageRunner.kill();
    return pythonRunner.kill();
  });

  handle('code:force-kill', () => {
    const results = [];
    if (multiLanguageRunner.child) results.push(multiLanguageRunner.kill());
    if (pythonRunner.child) results.push(pythonRunner.kill());
    if (activeProcess?.pid) {
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(activeProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 4000 });
        else {
          try { process.kill(-activeProcess.pid, 'SIGKILL'); } catch (_) {}
          try { process.kill(activeProcess.pid, 'SIGKILL'); } catch (_) {}
        }
        results.push({ success: true });
      } catch (_) {}
    }
    return { success: results.some(result => result?.success) || !activeProcess };
  });

  handle('code:diagnose', async (event, payload = {}) => {
    if (payload.language !== 'python') return { success: true, unsupported: true };
    return diagnosePython(resolvePythonBinary().command, payload.source, payload.relativePath || 'archivo.py');
  });

  // Final Exam Submission & Package Creation
  handle('exam:submit', async (event, studentData) => {
    if (activeProcess) return { success: false, error: 'Detén Python antes de entregar.' };
    if (workspaceSealed) return { success: false, error: 'El examen ya fue entregado.' };
    try {
      const result = createSubmission({ workspace: currentWorkspace, outputDirectory: path.join(app.getPath('userData'), 'exam_submissions'), student: studentData, auditLog: securityAuditLog, version: currentAppVersion() });
      workspaceSealed = true;

      // Release kiosk mode and re-enable Wi-Fi after submission
      isKioskActive = false;
      activeSessionMode = null;
      clearActiveExamMarker();
      stopAudioWatchdog();
      await notificationGuard.restore();
      enableSystemWifi();

      if (mainWindow) {
        mainWindow.setKiosk(false);
        requestProtectedFullscreen({ force: true });
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
      }

      setTimeout(() => void applyStagedUpdate(), 1500);

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
        version: currentAppVersion(),
        signingIdentity: ensureSigningIdentity(path.join(app.getPath('userData'), 'identity'))
      });

      workspaceSealed = true;

      // Release kiosk mode and unregister shortcuts after task submission
      isKioskActive = false;
      activeSessionMode = null;
      stopAudioWatchdog();
      await notificationGuard.restore();
      if (mainWindow) {
        mainWindow.setKiosk(false);
        requestProtectedFullscreen({ force: true });
        mainWindow.setAlwaysOnTop(false);
        globalShortcut.unregisterAll();
      }

      setTimeout(() => void applyStagedUpdate(), 1500);

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

  handle('submission:grade', async (event, payload = {}) => {
    try {
      const submissionPath = payload.filePath;
      if (!submissionPath || !fs.existsSync(submissionPath)) return { success: false, error: 'No se encontró la entrega seleccionada.' };
      const defaultName = `${path.basename(submissionPath, path.extname(submissionPath))}.calificacion.codego.json`;
      const { canceled, filePath } = await withNativeDialog(() => dialog.showSaveDialog(mainWindow, {
        title: 'Guardar huella de examen calificado',
        defaultPath: path.join(path.dirname(submissionPath), defaultName),
        filters: [{ name: 'Huella de calificación codeGO', extensions: ['json'] }]
      }));
      if (canceled || !filePath) return { canceled: true };
      return createGradeReceipt({
        submissionPath,
        outputPath: filePath,
        teacher: payload.teacher,
        grade: payload.grade,
        feedback: payload.feedback,
        signingIdentity: ensureSigningIdentity(path.join(app.getPath('userData'), 'teacher-identity'))
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // In-App Auto-Updater Handlers (Lobby Only)
  handle('updater:get-current-version', async () => {
    return { success: true, version: currentAppVersion() };
  });

  handle('updater:get-state', async () => ({ success: true, ...publicUpdateState() }));

  handle('updater:check-and-install', async () => checkAndStageAutomaticUpdate({ installWhenReady: true, force: true }));

  handle('updater:check', async () => {
    const info = await updater.checkForUpdates({ currentVersion: currentAppVersion(), timeoutMs: 12000 });
    if (info.success && info.hasUpdate) {
      availableUpdateInfo = info;
      setUpdateState('available', { latestVersion: info.latestVersion, releaseName: info.releaseName });
    } else if (info.success) {
      setUpdateState('current', { latestVersion: currentAppVersion() });
    }
    return info;
  });

  handle('updater:download-and-install', async () => {
    if (activeSessionMode || isKioskActive) {
      return { success: true, deferred: true, error: 'La actualización se instalará automáticamente al terminar esta sesión.' };
    }
    const prepared = await checkAndStageAutomaticUpdate({ installWhenReady: false, force: !stagedUpdatePath });
    if (!prepared.success) return prepared;
    return applyStagedUpdate();
  });
}

app.whenReady().then(async () => {
  if (!ownsSingleInstance) return;
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
      const report = await runPackagedCheck({ window: mainWindow, command: resolvePythonBinary().command, directory: diagnosticDirectory, version: currentAppVersion(), packaged: app.isPackaged, reportPath: path.resolve(packagedReportArgument.slice('--self-test-report='.length)) });
      clearTimeout(watchdog);
      mainWindow.destroy();
      try { fs.rmSync(diagnosticDirectory, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
      app.exit(report.success ? 0 : 1);
    } catch (error) { console.error(error.message); app.exit(1); }
    return;
  }

  scheduleAutomaticUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  restoreRendererKeyboardFocus();
});

app.on('will-quit', () => {
  clearTimeout(automaticUpdateStartTimer);
  clearInterval(automaticUpdateTimer);
  clearTimeout(fullscreenRetryTimer);
  clearSupervisedBlurTimer();
  pythonRunner.kill();
  stopAudioWatchdog();
  void notificationGuard.restore();
  enableSystemWifi();
});

app.on('window-all-closed', () => {
  stopAudioWatchdog();
  void notificationGuard.restore();
  enableSystemWifi();
  if (process.platform !== 'darwin') app.quit();
});
