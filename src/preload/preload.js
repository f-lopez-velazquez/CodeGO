const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Zoom Controls (Hardware Accelerated WebFrame Zoom)
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),

  // System diagnostics & Package Management
  runSelfTest: () => ipcRenderer.invoke('system:self-test'),
  checkPython: () => ipcRenderer.invoke('system:check-python'),
  checkFullEnvironment: () => ipcRenderer.invoke('system:check-full-environment'),
  installPackage: (pkgName) => ipcRenderer.invoke('system:install-package', pkgName),
  installAllRecommended: () => ipcRenderer.invoke('system:install-all-recommended'),
  autoInstallAllPrerequisites: () => ipcRenderer.invoke('system:auto-install-all-prerequisites'),

  // Kiosk & Security
  startKiosk: (studentData) => ipcRenderer.invoke('security:start-kiosk', studentData),
  exitKiosk: (pin) => ipcRenderer.invoke('security:exit-kiosk', pin),
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
  openFolderDialog: () => ipcRenderer.invoke('workspace:open-folder-dialog'),
  createProjectDialog: (projectName) => ipcRenderer.invoke('workspace:create-project-dialog', projectName),
  confirmClose: saved => ipcRenderer.invoke('app:confirm-close', saved),
  onBeforeClose: callback => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return () => ipcRenderer.removeListener('app:before-close', handler);
  },
  quitApp: () => ipcRenderer.invoke('app:quit-safe'),
  setFullScreen: (flag) => ipcRenderer.invoke('window:set-fullscreen', flag),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),

  // Python Execution
  runPython: (data) => ipcRenderer.invoke('python:run', data),
  sendPythonStdin: (text) => ipcRenderer.invoke('python:stdin', text),
  killPython: () => ipcRenderer.invoke('python:kill'),

  // Exam Finalization
  submitExam: (studentData) => ipcRenderer.invoke('exam:submit', studentData),

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
