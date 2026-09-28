const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Zoom Controls (Hardware Accelerated WebFrame Zoom)
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),

  // System diagnostics & Package Management
  runSelfTest: () => ipcRenderer.invoke('system:self-test'),
  openSupportPage: () => ipcRenderer.invoke('system:open-support-page'),
  getEnvironmentStatus: () => ipcRenderer.invoke('system:environment-status'),
  prepareEnvironment: (options = {}) => ipcRenderer.invoke('system:prepare-environment', options),
  checkPython: () => ipcRenderer.invoke('system:check-python'),
  checkFullEnvironment: () => ipcRenderer.invoke('system:check-full-environment'),
  installPackage: (packageName) => ipcRenderer.invoke('system:install-package', packageName),
  installRecommendedPackages: () => ipcRenderer.invoke('system:install-all-recommended'),

  // Kiosk & Security
  startKiosk: (studentData) => ipcRenderer.invoke('security:start-kiosk', studentData),
  exitKiosk: (pin) => ipcRenderer.invoke('security:exit-kiosk', pin),
  setInternalInteraction: (active) => ipcRenderer.invoke('security:internal-interaction', active === true),
  beep: () => ipcRenderer.invoke('system:beep'),
  enforceAudio: () => ipcRenderer.invoke('system:enforce-audio'),

  // Wi-Fi Management
  getWifiStatus: () => ipcRenderer.invoke('wifi:get-status'),
  disableWifi: () => ipcRenderer.invoke('wifi:disable'),
  enableWifi: () => ipcRenderer.invoke('wifi:enable'),

  // File System & Workspaces
  listWorkspace: () => ipcRenderer.invoke('fs:list-workspace'),
  readFile: (relativePath) => ipcRenderer.invoke('fs:read-file', relativePath),
  saveFile: (data) => ipcRenderer.invoke('fs:save-file', data),
  createFile: (relativePath) => ipcRenderer.invoke('fs:create-file', relativePath),
  createFolder: (relativePath) => ipcRenderer.invoke('fs:create-folder', relativePath),
  deleteItem: (relativePath) => ipcRenderer.invoke('fs:delete', relativePath),
  renameItem: (data) => ipcRenderer.invoke('fs:rename', data),
  moveItem: (data) => ipcRenderer.invoke('fs:move', data),
  importAssets: () => ipcRenderer.invoke('fs:import-assets'),
  openFolderDialog: () => ipcRenderer.invoke('workspace:open-folder-dialog'),
  restoreWorkspace: (workspacePath) => ipcRenderer.invoke('workspace:restore', workspacePath),
  createProjectDialog: (projectName) => ipcRenderer.invoke('workspace:create-project-dialog', projectName),
  getCurrentWorkspace: () => ipcRenderer.invoke('workspace:get-current'),
  confirmClose: saved => ipcRenderer.invoke('app:confirm-close', saved),
  onBeforeClose: callback => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return () => ipcRenderer.removeListener('app:before-close', handler);
  },
  quitApp: () => ipcRenderer.invoke('app:quit-safe'),
  setFullScreen: (flag) => ipcRenderer.invoke('window:set-fullscreen', flag),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),

  // Multi-Language Code Execution
  runCode: (data) => ipcRenderer.invoke('code:run', data),
  sendCodeStdin: (text) => ipcRenderer.invoke('code:stdin', text),
  killCode: () => ipcRenderer.invoke('code:kill'),
  detectLanguages: () => ipcRenderer.invoke('languages:detect'),

  // Python Execution (Preserved for compatibility)
  runPython: (data) => ipcRenderer.invoke('python:run', data),
  sendPythonStdin: (text) => ipcRenderer.invoke('python:stdin', text),
  killPython: () => ipcRenderer.invoke('python:kill'),

  // Exam & Certified Task Finalization & Verification
  submitExam: (studentData) => ipcRenderer.invoke('exam:submit', studentData),
  submitTask: (payload) => ipcRenderer.invoke('task:submit', payload),
  verifySubmissionFile: (filePath) => ipcRenderer.invoke('submission:verify-file', filePath),
  verifySubmissionBatch: (filePaths) => ipcRenderer.invoke('submission:verify-batch', filePaths),
  openSubmissionFileDialog: () => ipcRenderer.invoke('submission:open-file-dialog'),
  extractSubmissionCode: (filePath) => ipcRenderer.invoke('submission:extract-code', filePath),

  // In-App Auto-Updater
  getCurrentVersion: () => ipcRenderer.invoke('updater:get-current-version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke('updater:download-and-install', payload),
  onUpdateProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },

  // Hardware & Microcontrollers (Arduino, ESP32, Raspberry Pi, etc.)
  listSerialPorts: () => ipcRenderer.invoke('hardware:list-serial-ports'),

  // Event Listeners from Main Process
  onMonitorStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('monitor:status', handler);
    return () => ipcRenderer.removeListener('monitor:status', handler);
  },
  onBlurDetected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('security:blur-detected', handler);
    return () => ipcRenderer.removeListener('security:blur-detected', handler);
  },
  onFocusRegained: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('security:focus-regained', handler);
    return () => ipcRenderer.removeListener('security:focus-regained', handler);
  },
  onPythonGuiActive: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('security:python-gui-active', handler);
    return () => ipcRenderer.removeListener('security:python-gui-active', handler);
  },
  onCloseBlocked: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('security:close-blocked', handler);
    return () => ipcRenderer.removeListener('security:close-blocked', handler);
  },
  onPythonStdout: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('python:stdout', handler);
    return () => ipcRenderer.removeListener('python:stdout', handler);
  },
  onPythonStderr: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('python:stderr', handler);
    return () => ipcRenderer.removeListener('python:stderr', handler);
  },
  onPythonFinished: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('python:finished', handler);
    return () => ipcRenderer.removeListener('python:finished', handler);
  },
  onPythonError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('python:error', handler);
    return () => ipcRenderer.removeListener('python:error', handler);
  },

  // Multi-Language Output Listeners
  onCodeStdout: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('code:stdout', handler);
    return () => ipcRenderer.removeListener('code:stdout', handler);
  },
  onCodeStderr: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('code:stderr', handler);
    return () => ipcRenderer.removeListener('code:stderr', handler);
  },
  onCodeFinished: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('code:finished', handler);
    return () => ipcRenderer.removeListener('code:finished', handler);
  },

  // Pip Installation Listeners
  onPipLog: (callback) => {
    const handler = (event, text) => callback(text);
    ipcRenderer.on('pip:log', handler);
    return () => ipcRenderer.removeListener('pip:log', handler);
  },
  onPipFinished: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('pip:finished', handler);
    return () => ipcRenderer.removeListener('pip:finished', handler);
  },

  // Automated System Setup Listeners
  onSetupProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('setup:progress', handler);
    return () => ipcRenderer.removeListener('setup:progress', handler);
  },
  onSetupFinished: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('setup:finished', handler);
    return () => ipcRenderer.removeListener('setup:finished', handler);
  }
});
