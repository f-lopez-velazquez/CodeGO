/**
 * CodeGO ExamGuard - Renderer Application Logic
 * Audio Synthesizer, Anti-Cheat Watchers, Python Execution, Editor & Terminal
 * Package Manager, Zoom System, Themes, Customization, Resizable Splitters
 */

// ==============================================================
// 1. WEB AUDIO API SYNTHESIZER (100% Offline, Native Sound)
// ==============================================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sirenOsc1 = null;
    this.sirenOsc2 = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    this.isSirenPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playCountdownTick(isFinal = false) {
    try {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isFinal ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isFinal ? 1200 : 750, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (isFinal ? 0.4 : 0.15));

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + (isFinal ? 0.4 : 0.15));
    } catch (e) {
      console.warn('Audio tick error:', e);
    }
  }

  startAlarmSiren() {
    if (this.isSirenPlaying) return;
    try {
      this.init();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.isSirenPlaying = true;

      // Sonido de alerta institucional armónico y moderado (no estridente)
      this.sirenOsc1 = this.ctx.createOscillator();
      this.sirenOsc1.type = 'sine';
      this.sirenOsc1.frequency.setValueAtTime(540, this.ctx.currentTime); // Tono armónico base

      this.sirenOsc2 = this.ctx.createOscillator();
      this.sirenOsc2.type = 'sine';
      this.sirenOsc2.frequency.setValueAtTime(680, this.ctx.currentTime); // Tono armónico complementario

      // Modulación suave de pulso (1 pulso cada 1.2 segundos)
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.frequency.setValueAtTime(0.85, this.ctx.currentTime);

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      this.sirenLfo.connect(lfoGain);

      // Ganancia master moderada (audible para el profesor pero agradable y no invasiva)
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.setValueAtTime(0.09, this.ctx.currentTime);

      this.sirenOsc1.connect(this.sirenGain);
      this.sirenOsc2.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);

      this.sirenLfo.start();
      this.sirenOsc1.start();
      this.sirenOsc2.start();
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }

  stopAlarmSiren() {
    if (!this.isSirenPlaying) return;
    try {
      if (this.sirenGain && this.ctx) {
        this.sirenGain.gain.setValueAtTime(this.sirenGain.gain.value, this.ctx.currentTime);
        this.sirenGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
      }
      setTimeout(() => {
        if (this.sirenOsc1) { try { this.sirenOsc1.stop(); } catch (_) {} }
        if (this.sirenOsc2) { try { this.sirenOsc2.stop(); } catch (_) {} }
        if (this.sirenLfo) { try { this.sirenLfo.stop(); } catch (_) {} }
        this.isSirenPlaying = false;
      }, 90);
    } catch (e) {
      this.isSirenPlaying = false;
    }
  }
}

const sounds = new SoundEngine();

// ==============================================================
// 2. STATE MANAGEMENT & ZOOM ENGINE
// ==============================================================
const state = {
  student: {
    name: '',
    id: '',
    subject: ''
  },
  examStartTime: null,
  examTimerInterval: null,
  incidentsCount: 0,
  activeFilePath: 'main.py',
  openTabs: [],
  filesTree: [],
  isRunning: false,
  pythonGuiActive: false,
  pythonInfo: null,
  environmentInfo: null,
  monitorsCount: 1,
  autoSaveTimeout: null,
  zoomFactor: 1.0,
  currentTheme: 'theme-obsidian',
  editorFontSize: 14,
  isWordWrap: false,
  isTermMaximized: false,
  isExamSubmitted: false,
  termLayout: 'side', // 'side' (Default: Side-by-side vertical split) | 'bottom'
  appMode: 'exam', // 'exam' | 'activity'
  examSessionActive: false, // Strictly true only when in an active, unsubmitted exam session
  workspaceSessionActive: false // True during an active IDE workspace session (Exam or Activity)
};

// DOM Elements
const DOM = {
  // Views
  viewLobby: document.getElementById('view-lobby'),
  viewCountdown: document.getElementById('view-countdown'),
  viewIde: document.getElementById('view-ide'),

  // Mode Selection (Lobby)
  modeCardExam: document.getElementById('mode-card-exam'),
  modeCardActivity: document.getElementById('mode-card-activity'),
  startBtnTitle: document.getElementById('start-btn-title'),
  startBtnSubtitle: document.getElementById('start-btn-subtitle'),
  lobbyRulesTitle: document.getElementById('lobby-rules-title'),
  lobbyRulesList: document.getElementById('lobby-rules-list'),

  // Lobby & Validation
  lobbyValidationBanner: document.getElementById('lobby-validation-banner'),
  lobbyValidationText: document.getElementById('lobby-validation-text'),
  studentNameInput: document.getElementById('student-name'),
  studentIdInput: document.getElementById('student-id'),
  examSubjectInput: document.getElementById('exam-subject'),
  btnStartExam: document.getElementById('btn-start-exam'),
  systemStatusIndicator: document.getElementById('system-status-indicator'),
  lobbyPrereqAlert: document.getElementById('lobby-prereq-alert'),
  lobbyAlertMissingText: document.getElementById('lobby-alert-missing-text'),
  btnAutoRepairAll: document.getElementById('btn-auto-repair-all'),
  pythonVerLabel: document.getElementById('python-ver-label'),
  pythonStatusIcon: document.getElementById('python-status-icon'),
  diagVcredist: document.getElementById('diag-vcredist'),
  vcredistStatusLabel: document.getElementById('vcredist-status-label'),
  vcredistStatusIcon: document.getElementById('vcredist-status-icon'),
  packagesCountLabel: document.getElementById('packages-count-label'),
  packagesStatusIcon: document.getElementById('packages-status-icon'),
  btnOpenPkgManagerLobby: document.getElementById('btn-open-pkg-manager-lobby'),
  btnQuickInstallAll: document.getElementById('btn-quick-install-all'),
  monitorsLabel: document.getElementById('monitors-label'),
  monitorsStatusIcon: document.getElementById('monitors-status-icon'),
  btnTestSound: document.getElementById('btn-test-sound'),

  // Auto-Installer Modal
  modalAutoInstaller: document.getElementById('modal-auto-installer'),
  installerCurrentStepLabel: document.getElementById('installer-current-step-label'),
  installerPercentLabel: document.getElementById('installer-percent-label'),
  installerProgressBar: document.getElementById('installer-progress-bar'),
  stepItemVc: document.getElementById('step-item-vc'),
  stepBadgeVc: document.getElementById('step-badge-vc'),
  stepItemPy: document.getElementById('step-item-py'),
  stepBadgePy: document.getElementById('step-badge-py'),
  stepItemVenv: document.getElementById('step-item-venv'),
  stepBadgeVenv: document.getElementById('step-badge-venv'),
  stepItemLibs: document.getElementById('step-item-libs'),
  stepBadgeLibs: document.getElementById('step-badge-libs'),
  installerTerminalOutput: document.getElementById('installer-terminal-output'),
  btnClearInstallerLog: document.getElementById('btn-clear-installer-log'),
  btnCloseAutoInstaller: document.getElementById('btn-close-auto-installer'),
  btnFinishAutoInstaller: document.getElementById('btn-finish-auto-installer'),

  // Countdown
  countdownNumber: document.getElementById('countdown-number'),
  countdownCircle: document.getElementById('countdown-circle'),
  step1: document.getElementById('step-1'),
  step2: document.getElementById('step-2'),
  step3: document.getElementById('step-3'),
  step4: document.getElementById('step-4'),

  // IDE Navbar & Zoom
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  navSubjectLabel: document.getElementById('nav-subject-label'),
  navStudentLabel: document.getElementById('nav-student-label'),
  navModeIndicator: document.getElementById('nav-mode-indicator'),
  navModeText: document.getElementById('nav-mode-text'),
  navWaitingReviewBadge: document.getElementById('nav-waiting-review-badge'),
  examTimerPill: document.getElementById('exam-timer'),
  timerDisplay: document.getElementById('timer-display'),
  activityActionsToolbar: document.getElementById('activity-actions-toolbar'),
  btnActivityOpenFolder: document.getElementById('btn-activity-open-folder'),
  btnActivityNewProject: document.getElementById('btn-activity-new-project'),
  incidentsCounterPill: document.getElementById('incidents-counter-pill'),
  incidentsCounterText: document.getElementById('incidents-counter-text'),
  btnOpenPkgManagerIde: document.getElementById('btn-open-pkg-manager-ide'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),
  zoomLevelLabel: document.getElementById('zoom-level-label'),
  sbZoomBadge: document.getElementById('sb-zoom-badge'),
  sbPkgStatus: document.getElementById('sb-pkg-status'),
  btnThemeMenu: document.getElementById('btn-theme-menu'),
  themeDropdownMenu: document.getElementById('theme-dropdown-menu'),
  btnHelpShortcuts: document.getElementById('btn-help-shortcuts'),
  btnRunCode: document.getElementById('btn-run-code'),
  btnStopCode: document.getElementById('btn-stop-code'),
  btnFinishExam: document.getElementById('btn-finish-exam'),
  btnTeacherUnlock: document.getElementById('btn-teacher-unlock'),

  // Splitters & Layout
  ideMainGrid: document.getElementById('ide-main-grid'),
  sidebarExplorer: document.getElementById('sidebar-explorer'),
  sidebarTitleLabel: document.getElementById('sidebar-title-label'),
  workspaceHintLabel: document.getElementById('workspace-hint-label'),
  splitterVertical: document.getElementById('splitter-vertical'),
  workspaceArea: document.getElementById('workspace-area'),
  splitterHorizontal: document.getElementById('splitter-horizontal'),

  // Explorer
  fileTreeContainer: document.getElementById('file-tree-container'),
  btnNewFile: document.getElementById('btn-new-file'),
  btnNewFolder: document.getElementById('btn-new-folder'),
  btnRefreshFiles: document.getElementById('btn-refresh-files'),

  // Editor
  editorTabsBar: document.getElementById('editor-tabs-bar'),
  btnToggleWrap: document.getElementById('btn-toggle-wrap'),
  btnToggleTermLayout: document.getElementById('btn-toggle-term-layout'),
  btnToggleTermView: document.getElementById('btn-toggle-term-view'),
  termLayoutLabel: document.getElementById('term-layout-label'),
  codeTextarea: document.getElementById('code-textarea'),
  editorHighlighting: document.getElementById('editor-highlighting'),
  highlightingContent: document.getElementById('highlighting-content'),
  editorLineNumbers: document.getElementById('editor-line-numbers'),
  sbCursorPos: document.getElementById('sb-cursor-pos'),
  sbCharsCount: document.getElementById('sb-chars-count'),
  sbSaveStatus: document.getElementById('sb-save-status'),

  // Terminal
  terminalPanel: document.getElementById('terminal-panel'),
  terminalOutput: document.getElementById('terminal-output'),
  termStatusBadge: document.getElementById('term-status-badge'),
  termExecTime: document.getElementById('term-exec-time'),
  btnToggleTermPos: document.getElementById('btn-toggle-term-pos'),
  btnMaximizeTerm: document.getElementById('btn-maximize-term'),
  btnClearTerm: document.getElementById('btn-clear-term'),
  btnCopyTerm: document.getElementById('btn-copy-term'),
  terminalTranscript: document.getElementById('terminal-transcript'),
  terminalStdinInput: document.getElementById('terminal-stdin-input'),

  // Package Manager Modal
  modalPackageManager: document.getElementById('modal-package-manager'),
  btnClosePkgManager: document.getElementById('btn-close-pkg-manager'),
  envPythonPath: document.getElementById('env-python-path'),
  envVcredistRow: document.getElementById('env-vcredist-row'),
  envVcredistStatus: document.getElementById('env-vcredist-status'),
  btnInstallAllRecommended: document.getElementById('btn-install-all-recommended'),
  packagesGridContainer: document.getElementById('packages-grid-container'),
  customPkgInput: document.getElementById('custom-pkg-input'),
  btnInstallCustomPkg: document.getElementById('btn-install-custom-pkg'),
  btnClearPipLog: document.getElementById('btn-clear-pip-log'),
  pipTerminalOutput: document.getElementById('pip-terminal-output'),

  // Modals
  modalShortcuts: document.getElementById('modal-shortcuts'),
  btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),

  modalFocusWarning: document.getElementById('modal-focus-warning'),
  hazardStrobeText: document.getElementById('hazard-strobe-text'),
  hazardTime: document.getElementById('hazard-time'),
  hazardDuration: document.getElementById('hazard-duration'),
  hazardTotalIncidents: document.getElementById('hazard-total-incidents'),
  hazardCountdownPill: document.getElementById('hazard-countdown-pill'),
  hazardCountdownText: document.getElementById('hazard-countdown-text'),
  hazardBtnLabel: document.getElementById('hazard-btn-label'),
  btnDismissHazard: document.getElementById('btn-dismiss-hazard'),

  modalMultimonitor: document.getElementById('modal-multimonitor'),
  lockMonitorsCount: document.getElementById('lock-monitors-count'),

  modalTeacherUnlock: document.getElementById('modal-teacher-unlock'),
  teacherPinInput: document.getElementById('teacher-pin-input'),
  teacherPinError: document.getElementById('teacher-pin-error'),
  btnCancelTeacher: document.getElementById('btn-cancel-teacher'),
  btnConfirmTeacher: document.getElementById('btn-confirm-teacher'),

  modalSubmitExam: document.getElementById('modal-submit-exam'),
  submitTotalTime: document.getElementById('submit-total-time'),
  submitTotalFiles: document.getElementById('submit-total-files'),
  submitTotalIncidents: document.getElementById('submit-total-incidents'),
  btnCancelSubmit: document.getElementById('btn-cancel-submit'),
  btnConfirmSubmit: document.getElementById('btn-confirm-submit'),

  modalSubmissionSuccess: document.getElementById('modal-submission-success'),
  receiptFilename: document.getElementById('receipt-filename'),
  receiptPath: document.getElementById('receipt-path'),
  receiptChecksum: document.getElementById('receipt-checksum'),
  btnReviewSubmittedCode: document.getElementById('btn-review-submitted-code'),
  btnCloseApp: document.getElementById('btn-close-app'),

  // Wi-Fi Supervised Badge
  navWifiBadge: document.getElementById('nav-wifi-badge'),
  wifiStatusText: document.getElementById('wifi-status-text'),

  // Locked Banner & Label
  examLockedBadge: document.getElementById('exam-locked-badge'),
  finishExamLabel: document.getElementById('finish-exam-label'),

  // Post-Submission Toolbar
  postSubmissionToolbar: document.getElementById('post-submission-toolbar'),
  btnOpenWorkspaceFolder: document.getElementById('btn-open-workspace-folder'),
  btnCreateNewProject: document.getElementById('btn-create-new-project'),
  btnViewReceipt: document.getElementById('btn-view-receipt'),
  btnExitExamApp: document.getElementById('btn-exit-exam-app')
};

// ==============================================================
// 2.1 SCREEN SIZE ANALYZER & ADAPTIVE AUTO-FIT
// ==============================================================
function autoFitScreenLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!window.electronAPI?.setZoomFactor && state.zoomFactor !== 1) {
    document.body.style.width = `${w / state.zoomFactor}px`;
    document.body.style.height = `${h / state.zoomFactor}px`;
  } else {
    document.body.style.removeProperty('width');
    document.body.style.removeProperty('height');
  }
  if (w < 1366 || h < 768) {
    document.body.classList.add('screen-compact');
  } else {
    document.body.classList.remove('screen-compact');
  }
}

// ==============================================================
// 2.2 WI-FI REAL-TIME MONITORING
// ==============================================================
let wifiPollInterval = null;

async function updateWifiStatus() {
  if (!window.electronAPI || !window.electronAPI.getWifiStatus) return;
  try {
    const status = await window.electronAPI.getWifiStatus();
    if (DOM.navWifiBadge && DOM.wifiStatusText) {
      if (status.disabled === null || status.known === false) {
        DOM.navWifiBadge.className = 'nav-wifi-badge';
        DOM.wifiStatusText.textContent = 'WIFI: SIN VERIFICAR';
        return;
      }
      if (status.disabled) {
        DOM.navWifiBadge.className = 'nav-wifi-badge wifi-off';
        DOM.wifiStatusText.textContent = 'WIFI: BLOQUEADO';
      } else {
        DOM.navWifiBadge.className = 'nav-wifi-badge wifi-on';
        DOM.wifiStatusText.textContent = state.appMode === 'activity' ? 'WIFI: ACTIVO' : '⚠️ WIFI ACTIVO';

        // ONLY enforce Wi-Fi disconnect and penalty during an active, non-submitted EXAM!
        if (state.examSessionActive && state.appMode === 'exam' && !state.isExamSubmitted) {
          handleSecurityViolation({
            type: 'WIFI_RECONNECTED_ILLEGALLY',
            timestamp: new Date().toLocaleTimeString(),
            durationSeconds: 1.0
          });
          if (window.electronAPI.disableWifi) {
            window.electronAPI.disableWifi();
          }
        }
      }
    }
  } catch (_) {}
}

function startWifiMonitoring() {
  if (wifiPollInterval) clearInterval(wifiPollInterval);
  updateWifiStatus();
  wifiPollInterval = setInterval(updateWifiStatus, 2500);
}

// ==============================================================
// 3. ZOOM & CUSTOMIZATION ENGINE
// ==============================================================
const ZOOM_LEVELS = [0.75, 0.85, 0.9, 1.0, 1.1, 1.25, 1.4, 1.6];

function setAppZoom(factor) {
  factor = Math.min(Math.max(factor, 0.7), 1.8);
  state.zoomFactor = Math.round(factor * 100) / 100;

  const percentage = Math.round(state.zoomFactor * 100);
  DOM.zoomLevelLabel.textContent = `${percentage}%`;
  DOM.sbZoomBadge.textContent = `Zoom: ${percentage}%`;

  if (window.electronAPI && window.electronAPI.setZoomFactor) {
    document.body.style.removeProperty('zoom');
    window.electronAPI.setZoomFactor(state.zoomFactor);
    autoFitScreenLayout();
    requestAnimationFrame(autoFitScreenLayout);
  } else {
    document.body.style.zoom = state.zoomFactor;
    autoFitScreenLayout();
  }
}

function zoomIn() {
  const current = state.zoomFactor;
  const next = ZOOM_LEVELS.find((lvl) => lvl > current + 0.04) || current + 0.1;
  setAppZoom(next);
}

function zoomOut() {
  const current = state.zoomFactor;
  const reversed = [...ZOOM_LEVELS].reverse();
  const next = reversed.find((lvl) => lvl < current - 0.04) || current - 0.1;
  setAppZoom(next);
}

function resetZoom() {
  setAppZoom(1.0);
}

function setTheme(themeName) {
  document.body.classList.remove('theme-obsidian', 'theme-dracula', 'theme-nord', 'theme-monokai', 'theme-paper');
  document.body.classList.add(themeName);
  state.currentTheme = themeName;

  document.querySelectorAll('.theme-opt').forEach((opt) => {
    opt.classList.toggle('active', opt.dataset.theme === themeName);
  });
}

function setEditorFontSize(size) {
  state.editorFontSize = parseInt(size, 10);
  document.documentElement.style.setProperty('--editor-font-size', `${size}px`);

  document.querySelectorAll('.btn-font-size').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === state.editorFontSize);
  });
  if (typeof updateSyntaxHighlighting === 'function') {
    updateSyntaxHighlighting();
  }
}

function toggleWordWrap() {
  state.isWordWrap = !state.isWordWrap;
  const canvas = document.querySelector('.editor-canvas');
  if (canvas) canvas.classList.toggle('word-wrap', state.isWordWrap);
  DOM.codeTextarea.classList.toggle('word-wrap', state.isWordWrap);
  DOM.btnToggleWrap.classList.toggle('active', state.isWordWrap);
  if (typeof syncEditorScroll === 'function') {
    syncEditorScroll();
  }
}

function toggleSidebar() {
  if (window.innerWidth <= 850) DOM.sidebarExplorer.classList.toggle('mobile-open');
  else DOM.sidebarExplorer.classList.toggle('collapsed');
}

function updateTerminalLayout() {
  DOM.workspaceArea.classList.toggle('term-layout-bottom', state.termLayout === 'bottom');
  DOM.workspaceArea.classList.toggle('term-layout-side', state.termLayout === 'side');
  DOM.workspaceArea.classList.toggle('terminal-maximized', state.isTermMaximized);
  DOM.btnMaximizeTerm.setAttribute('aria-pressed', String(state.isTermMaximized));
  DOM.btnMaximizeTerm.title = state.isTermMaximized ? 'Restaurar editor y consola' : 'Maximizar consola';
  DOM.btnMaximizeTerm.setAttribute('aria-label', DOM.btnMaximizeTerm.title);
  DOM.splitterHorizontal.setAttribute('aria-orientation', state.termLayout === 'side' ? 'vertical' : 'horizontal');
  DOM.termLayoutLabel.textContent = state.termLayout === 'side' ? 'Abajo' : 'Lateral';
  syncEditorScroll();
}

function toggleTerminalMaximize() {
  state.isTermMaximized = !state.isTermMaximized;
  DOM.workspaceArea.classList.remove('terminal-collapsed');
  updateTerminalLayout();
}

function toggleTerminalVisibility() {
  DOM.workspaceArea.classList.toggle('terminal-collapsed');
  DOM.btnToggleTermView?.setAttribute('aria-expanded', String(!DOM.workspaceArea.classList.contains('terminal-collapsed')));
}

function toggleTerminalLayout() {
  state.termLayout = state.termLayout === 'side' ? 'bottom' : 'side';
  DOM.terminalPanel.style.removeProperty('--terminal-size');
  updateTerminalLayout();
}

function resizeTerminal(pixels) {
  const rect = DOM.workspaceArea.getBoundingClientRect();
  const total = state.termLayout === 'side' ? rect.width : rect.height;
  const percentage = Math.max(25, Math.min(75, pixels / total * 100));
  DOM.terminalPanel.style.setProperty('--terminal-size', `${percentage}%`);
  DOM.splitterHorizontal.setAttribute('aria-valuenow', String(Math.round(percentage)));
}

function setupSplitters() {
  for (const [splitter, sidebar] of [[DOM.splitterVertical, true], [DOM.splitterHorizontal, false]]) {
    splitter.setAttribute('aria-valuemin', sidebar ? '160' : '25');
    splitter.setAttribute('aria-valuemax', sidebar ? '450' : '75');
    splitter.setAttribute('aria-valuenow', sidebar ? '220' : '44');
    const resizeSidebar = width => {
      const size = Math.max(160, Math.min(width, 450, window.innerWidth * .35));
      DOM.sidebarExplorer.style.flexBasis = `${size}px`;
      DOM.sidebarExplorer.style.width = `${size}px`;
      splitter.setAttribute('aria-valuenow', String(Math.round(size)));
    };
    splitter.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('dragging');
      document.body.classList.add(sidebar || state.termLayout === 'side' ? 'resizing-col' : 'resizing-row');
    });
    splitter.addEventListener('pointermove', event => {
      if (!splitter.hasPointerCapture(event.pointerId)) return;
      if (sidebar) resizeSidebar(event.clientX / (window.electronAPI?.setZoomFactor ? 1 : state.zoomFactor));
      else {
        const rect = DOM.workspaceArea.getBoundingClientRect();
        resizeTerminal(state.termLayout === 'side' ? rect.right - event.clientX : rect.bottom - event.clientY);
      }
    });
    splitter.addEventListener('lostpointercapture', () => {
      splitter.classList.remove('dragging');
      document.body.classList.remove('resizing-col', 'resizing-row');
    });
    splitter.addEventListener('keydown', event => {
      const keys = sidebar || state.termLayout === 'side' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === keys[0] ? -24 : 24;
      if (sidebar) resizeSidebar(DOM.sidebarExplorer.offsetWidth + delta);
      else {
        const rect = DOM.terminalPanel.getBoundingClientRect();
        resizeTerminal((state.termLayout === 'side' ? rect.width : rect.height) - delta);
      }
    });
    splitter.addEventListener('dblclick', () => {
      if (sidebar) resizeSidebar(220);
      else DOM.terminalPanel.style.removeProperty('--terminal-size');
    });
  }
}

// ==============================================================
// 5. PACKAGE MANAGER & ENVIRONMENT DIAGNOSTICS
// ==============================================================
const PKG_CONFIG = {
  pygame: { icon: '🎮', name: 'Pygame', cat: 'games' },
  numpy: { icon: '🔢', name: 'NumPy', cat: 'math' },
  matplotlib: { icon: '📊', name: 'Matplotlib', cat: 'data' },
  pandas: { icon: '🐼', name: 'Pandas', cat: 'data' },
  requests: { icon: '🌐', name: 'Requests', cat: 'net' },
  PIL: { icon: '🖼️', name: 'Pillow (PIL)', cat: 'games' },
  scipy: { icon: '🔬', name: 'SciPy', cat: 'math' },
  seaborn: { icon: '📈', name: 'Seaborn', cat: 'data' },
  openpyxl: { icon: '📑', name: 'OpenPyXL (Excel)', cat: 'data' },
  sympy: { icon: '📐', name: 'SymPy (Álgebra)', cat: 'math' },
  colorama: { icon: '🎨', name: 'Colorama (Consola)', cat: 'net' },
  serial: { icon: '🔌', name: 'PySerial (Arduino / ESP32)', cat: 'hardware' },
  sqlite3: { icon: '🗄️', name: 'SQLite3 (SQL)', cat: 'data' },
  tkinter: { icon: '🖥️', name: 'Tkinter (GUI)', cat: 'games' }
};

async function loadEnvironmentDiagnostics() {
  if (window.electronAPI && window.electronAPI.checkFullEnvironment) {
    try {
      const data = await window.electronAPI.checkFullEnvironment();
      state.environmentInfo = data;
      state.pythonInfo = data.python;
      state.monitorsCount = data.displaysCount;

      // Update Lobby Python status
      const hasPy = data.hasPython;
      DOM.pythonVerLabel.textContent = hasPy ? data.python.version : '⚠️ No instalado';
      DOM.pythonStatusIcon.textContent = hasPy ? '✓' : '!';
      DOM.pythonStatusIcon.className = hasPy ? 'diag-status ok' : 'diag-status warn';
      if (hasPy) {
        if (data.python.isVenv) {
          DOM.envPythonPath.textContent = `Entorno Aislado (exam_env) • ${data.python.version}`;
        } else {
          DOM.envPythonPath.textContent = `Python del Sistema • ${data.python.version}`;
        }
        DOM.envPythonPath.title = data.python.command || '';
      } else {
        DOM.envPythonPath.textContent = '⚠️ No detectado';
        DOM.envPythonPath.title = '';
      }

      // Update Windows VC++ status
      if (data.platform === 'win32') {
        if (DOM.diagVcredist) DOM.diagVcredist.style.display = 'flex';
        DOM.envVcredistRow.style.display = 'flex';
        const vcOk = data.hasVCRedist;
        if (DOM.vcredistStatusLabel) DOM.vcredistStatusLabel.textContent = vcOk ? 'Instalado ✓' : '⚠️ Faltante (2015-2022)';
        if (DOM.vcredistStatusIcon) {
          DOM.vcredistStatusIcon.textContent = vcOk ? '✓' : '!';
          DOM.vcredistStatusIcon.className = vcOk ? 'diag-status ok' : 'diag-status warn';
        }
        DOM.envVcredistStatus.textContent = data.vcRedist.details;
        DOM.envVcredistStatus.className = vcOk ? 'ok' : 'highlight-red';
      } else {
        if (DOM.diagVcredist) DOM.diagVcredist.style.display = 'none';
        DOM.envVcredistRow.style.display = 'none';
      }

      // Update Lobby Packages label (12 recommended packages with hardware)
      const totalRecommended = data.essentialKeys ? data.essentialKeys.length : 12;
      const missingCount = data.missingCount || 0;
      const installedCount = Math.max(0, totalRecommended - missingCount);

      if (missingCount === 0) {
        DOM.packagesCountLabel.textContent = `${totalRecommended}/${totalRecommended} Listas (Pygame, NumPy, SciPy, PySerial...)`;
        DOM.packagesStatusIcon.textContent = '✓';
        DOM.packagesStatusIcon.className = 'diag-status ok';
        DOM.btnQuickInstallAll.classList.add('hidden');
        DOM.sbPkgStatus.textContent = `Librerías: ${totalRecommended}/${totalRecommended} Listas ✓`;
      } else {
        DOM.packagesCountLabel.textContent = `⚠️ ${missingCount} Faltantes (${installedCount}/${totalRecommended})`;
        DOM.packagesStatusIcon.textContent = '!';
        DOM.packagesStatusIcon.className = 'diag-status warn';
        DOM.btnQuickInstallAll.classList.remove('hidden');
        DOM.sbPkgStatus.textContent = `Librerías: ⚠️ ${missingCount} Faltantes`;
      }

      // Check overall system readiness for exam & alert banner
      const hasMissingPrereqs = !hasPy || (data.platform === 'win32' && !data.hasVCRedist) || missingCount > 0;
      if (hasMissingPrereqs) {
        DOM.lobbyPrereqAlert.classList.remove('hidden');
        DOM.lobbyAlertMissingText.textContent = (data.missingComponents && data.missingComponents.length > 0)
          ? data.missingComponents.join(' • ')
          : 'Se requieren componentes adicionales para el examen';
        DOM.systemStatusIndicator.className = 'status-pill error';
        DOM.systemStatusIndicator.textContent = '● Faltan Requisitos';
      } else {
        DOM.lobbyPrereqAlert.classList.add('hidden');
        DOM.systemStatusIndicator.className = 'status-pill ok';
        DOM.systemStatusIndicator.textContent = '● Sistema Listo';
      }

      // Render library cards in modal with current filter
      renderPackagesGrid(data.packages, state.activePkgCategory);

      // Monitors label
      DOM.monitorsLabel.textContent = `${data.displaysCount} detectada(s)`;
      DOM.monitorsStatusIcon.textContent = data.displaysCount > 1 ? '✗' : '✓';
      DOM.monitorsStatusIcon.className = data.displaysCount > 1 ? 'diag-status bad' : 'diag-status ok';

    } catch (err) {
      console.warn('Diagnostics error:', err);
    }
  } else {
    // Mock browser fallback
    DOM.pythonVerLabel.textContent = 'Python 3.14.7 (Nativo)';
    DOM.packagesCountLabel.textContent = '11/11 Listas (Simulador)';
    DOM.sbPkgStatus.textContent = 'Librerías: 11/11 Listas ✓';
    DOM.lobbyPrereqAlert.classList.add('hidden');
  }
}

function renderPackagesGrid(packages, category = 'all') {
  if (!packages) return;
  DOM.packagesGridContainer.innerHTML = '';

  Object.entries(packages).forEach(([key, info]) => {
    const config = PKG_CONFIG[key] || { icon: '📦', name: key, cat: 'other' };

    // Apply category filter if active
    if (category !== 'all' && config.cat !== category) {
      return;
    }

    const card = document.createElement('div');
    card.className = 'pkg-card';

    const isInstalled = info.installed;
    const pillClass = isInstalled ? 'installed' : 'missing';
    const pillText = isInstalled ? `● Instalado (${info.version || 'OK'})` : '○ No instalado';
    const installParam = key === 'PIL' ? 'pillow' : (key === 'serial' ? 'pyserial' : key);

    card.innerHTML = `
      <div class="pkg-card-top">
        <div class="pkg-title-box">
          <span class="pkg-icon">${config.icon}</span>
          <span class="pkg-name">${config.name}</span>
        </div>
        <span class="pkg-pill ${pillClass}">${pillText}</span>
      </div>
      <p class="pkg-desc">${info.desc || ''}</p>
      <div class="pkg-card-action">
        ${isInstalled 
          ? `<span class="btn-pkg-install installed-btn">✓ Listo</span>` 
          : `<button class="btn-pkg-install" data-pkg="${installParam}">+ Instalar</button>`}
      </div>
    `;

    const installBtn = card.querySelector('button[data-pkg]');
    if (installBtn) {
      installBtn.addEventListener('click', () => {
        installSinglePackage(installBtn.dataset.pkg);
      });
    }

    DOM.packagesGridContainer.appendChild(card);
  });
}

async function installSinglePackage(pkgName) {
  if (!window.electronAPI) {
    appendPipLog(`[Simulador] Instalando ${pkgName}... Listo!\n`);
    return;
  }
  appendPipLog(`\n>>> Iniciando instalación de ${pkgName}...\n`);
  DOM.modalPackageManager.classList.remove('hidden');

  await window.electronAPI.installPackage(pkgName);
  await loadEnvironmentDiagnostics();
}

async function installAllRecommendedPackages() {
  if (!window.electronAPI) {
    appendPipLog('[Simulador] Paquete completo de 12 librerías instalado con éxito!\n');
    return;
  }
  DOM.modalPackageManager.classList.remove('hidden');
  DOM.btnInstallAllRecommended.disabled = true;
  DOM.btnInstallAllRecommended.textContent = '⏳ Instalando 12 librerías recomendadas (incluye PySerial)...';

  await window.electronAPI.installAllRecommended();
  await loadEnvironmentDiagnostics();

  DOM.btnInstallAllRecommended.disabled = false;
  DOM.btnInstallAllRecommended.textContent = '⚡ Instalar Todas las Librerías de Examen y Hardware (12 Paquetes)';
}

function appendPipLog(text) {
  const isFirst = DOM.pipTerminalOutput.querySelector('.pip-term-hint');
  if (isFirst) DOM.pipTerminalOutput.innerHTML = '';

  const span = document.createElement('span');
  span.textContent = text;
  DOM.pipTerminalOutput.appendChild(span);
  DOM.pipTerminalOutput.scrollTop = DOM.pipTerminalOutput.scrollHeight;
}

// Auto-Installer Pipeline Helpers
async function startAutoRepairProcess() {
  DOM.modalAutoInstaller.classList.remove('hidden');
  DOM.btnFinishAutoInstaller.classList.add('hidden');
  DOM.installerProgressBar.style.width = '5%';
  DOM.installerPercentLabel.textContent = '5%';
  DOM.installerCurrentStepLabel.textContent = 'Iniciando análisis del sistema y descarga de dependencias...';
  DOM.installerTerminalOutput.innerHTML = '<span class="pip-term-hint">Iniciando asistente de configuración...</span>\n';

  resetAutoInstallerSteps();

  if (window.electronAPI && window.electronAPI.autoInstallAllPrerequisites) {
    try {
      await window.electronAPI.autoInstallAllPrerequisites();
    } catch (e) {
      appendInstallerLog(`\nError en auto-instalador: ${e.message}\n`);
    }
  } else {
    // Simulator fallback
    simulateAutoInstaller();
  }
}

function resetAutoInstallerSteps() {
  const steps = [
    { item: DOM.stepItemVc, badge: DOM.stepBadgeVc },
    { item: DOM.stepItemPy, badge: DOM.stepBadgePy },
    { item: DOM.stepItemVenv, badge: DOM.stepBadgeVenv },
    { item: DOM.stepItemLibs, badge: DOM.stepBadgeLibs }
  ];
  steps.forEach(s => {
    if (s.item && s.badge) {
      s.item.className = 'installer-step-item';
      s.badge.className = 'step-badge pending';
      s.badge.textContent = 'Pendiente';
    }
  });
}

function updateAutoInstallerStep(stepNum, itemEl, badgeEl, currentActiveStep) {
  if (!itemEl || !badgeEl) return;
  if (currentActiveStep > stepNum) {
    itemEl.className = 'installer-step-item done';
    badgeEl.className = 'step-badge done';
    badgeEl.textContent = 'Completado ✓';
  } else if (currentActiveStep === stepNum) {
    itemEl.className = 'installer-step-item active';
    badgeEl.className = 'step-badge active';
    badgeEl.textContent = 'En progreso...';
  } else {
    itemEl.className = 'installer-step-item';
    badgeEl.className = 'step-badge pending';
    badgeEl.textContent = 'Pendiente';
  }
}

function appendInstallerLog(text) {
  const isFirst = DOM.installerTerminalOutput.querySelector('.pip-term-hint');
  if (isFirst) DOM.installerTerminalOutput.innerHTML = '';

  const span = document.createElement('span');
  span.textContent = text;
  DOM.installerTerminalOutput.appendChild(span);
  DOM.installerTerminalOutput.scrollTop = DOM.installerTerminalOutput.scrollHeight;
}

function simulateAutoInstaller() {
  let pct = 10;
  const interval = setInterval(() => {
    pct += 20;
    if (pct > 100) {
      clearInterval(interval);
      DOM.installerProgressBar.style.width = '100%';
      DOM.installerPercentLabel.textContent = '100%';
      DOM.installerCurrentStepLabel.textContent = '¡Entorno 100% Configurado y Validado!';
      DOM.btnFinishAutoInstaller.classList.remove('hidden');
      return;
    }
    DOM.installerProgressBar.style.width = `${pct}%`;
    DOM.installerPercentLabel.textContent = `${pct}%`;
  }, 500);
}

// ==============================================================
// 6. INITIALIZATION
// ==============================================================
async function initApp() {
  autoFitScreenLayout();
  window.addEventListener('resize', autoFitScreenLayout);
  setupEventListeners();
  setupElectronListeners();
  setupSplitters();
  document.querySelectorAll('[data-self-test]').forEach(button => button.addEventListener('click', async () => {
    const output = button.nextElementSibling;
    button.disabled = true;
    output.textContent = 'Comprobando archivos, Python y entrada de datos…';
    try {
      if (!window.electronAPI?.runSelfTest) throw new Error('Abre la aplicación de escritorio para comprobar este equipo.');
      const report = await window.electronAPI.runSelfTest();
      output.textContent = (report.checks || []).map(check => `${check.success ? '✓' : '✗'} ${check.name}${check.detail ? ': ' + check.detail : ''}`).join('\n');
      if (!report.checks) output.textContent = report.error || 'No se pudo completar la comprobación.';
    } catch (error) { output.textContent = error.message; }
    finally { button.disabled = false; }
  }));
  document.querySelectorAll('button[title]').forEach(button => button.setAttribute('aria-label', button.title));
  document.querySelectorAll('.mode-card, .theme-opt').forEach(option => {
    option.tabIndex = 0;
    option.setAttribute('role', 'button');
    option.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); option.click(); }
    });
  });
  setSessionMode(state.appMode);

  // Asegurar siempre pantalla completa al iniciar
  if (window.electronAPI && window.electronAPI.setFullScreen) {
    try {
      await window.electronAPI.setFullScreen(true);
    } catch (_) {}
  }

  await loadEnvironmentDiagnostics();
  startWifiMonitoring();
}

// ==============================================================
// 6.1 SESSION MODE ENGINE (EXAM VS ACTIVITY)
// ==============================================================
function setSessionMode(mode) {
  state.appMode = mode;
  if (mode === 'exam') {
    document.body.classList.remove('mode-activity-active');
    document.body.classList.add('mode-exam-active');
    if (DOM.modeCardExam) DOM.modeCardExam.classList.add('active');
    if (DOM.modeCardActivity) DOM.modeCardActivity.classList.remove('active');
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'INICIAR EXAMEN';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Modo seguro';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.innerHTML = 'DIRECTRICES DEL MODO EXAMEN:';
    if (DOM.lobbyRulesList) {
      DOM.lobbyRulesList.innerHTML = `
        <li><strong>Entorno Aislado:</strong> No hay acceso a proyectos previos ni carpetas externas del sistema.</li>
        <li><strong>Modo Kiosk & Pantalla Completa:</strong> Bloqueo del entorno y supervisión de conectividad.</li>
        <li><strong>Supervisión de Ventana:</strong> El cambio de aplicación o pérdida de foco registra aviso de 12 segundos.</li>
        <li><strong>Entrega Final:</strong> Al entregar, el código queda sellado contra modificación y se genera el archivo auditado.</li>
      `;
    }
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.classList.remove('hidden');
      DOM.btnFinishExam.style.display = 'inline-flex';
      DOM.btnFinishExam.disabled = false;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.add('hidden');
      DOM.activityActionsToolbar.style.display = 'none';
    }
  } else {
    document.body.classList.remove('mode-exam-active');
    document.body.classList.add('mode-activity-active');
    if (DOM.modeCardActivity) DOM.modeCardActivity.classList.add('active');
    if (DOM.modeCardExam) DOM.modeCardExam.classList.remove('active');
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'INICIAR ACTIVIDAD';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Modo libre';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.innerHTML = 'DIRECTRICES DEL MODO ACTIVIDAD:';
    if (DOM.lobbyRulesList) {
      DOM.lobbyRulesList.innerHTML = `
        <li><strong>Gestión de Archivos:</strong> Puedes abrir cualquier carpeta en tu equipo o crear nuevos proyectos en Python.</li>
        <li><strong>Conectividad Libre:</strong> La conexión a red permanece habilitada durante la sesión.</li>
        <li><strong>Supervisión Académica:</strong> Se mantiene supervisión activa; al cambiar de programa se mostrará el aviso correspondiente.</li>
        <li><strong>Ejecución Directa:</strong> Ejecuta tu código las veces que sea necesario (F5 o botón ▶ Ejecutar).</li>
      `;
    }
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.classList.add('hidden');
      DOM.btnFinishExam.style.display = 'none';
      DOM.btnFinishExam.disabled = true;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.remove('hidden');
      DOM.activityActionsToolbar.style.display = 'inline-flex';
    }
  }
}

// ==============================================================
// 7. EVENT LISTENERS SETUP
// ==============================================================
function setupEventListeners() {
  // Mode Selection in Lobby
  if (DOM.modeCardExam) {
    DOM.modeCardExam.addEventListener('click', () => setSessionMode('exam'));
  }
  if (DOM.modeCardActivity) {
    DOM.modeCardActivity.addEventListener('click', () => setSessionMode('activity'));
  }

  // Clear input errors on user typing (guarantees focus is never lost)
  if (DOM.studentNameInput) {
    DOM.studentNameInput.addEventListener('input', () => {
      DOM.studentNameInput.classList.remove('input-field-error');
      if (DOM.lobbyValidationBanner) DOM.lobbyValidationBanner.classList.add('hidden');
    });
  }
  if (DOM.studentIdInput) {
    DOM.studentIdInput.addEventListener('input', () => {
      DOM.studentIdInput.classList.remove('input-field-error');
      if (DOM.lobbyValidationBanner) DOM.lobbyValidationBanner.classList.add('hidden');
    });
  }

  // Activity toolbar actions (open folder, create project)
  if (DOM.btnActivityOpenFolder) {
    DOM.btnActivityOpenFolder.addEventListener('click', handleOpenWorkspaceFolder);
  }
  if (DOM.btnActivityNewProject) {
    DOM.btnActivityNewProject.addEventListener('click', handleCreateNewProject);
  }

  // Global clipboard protections after submission
  document.addEventListener('copy', (e) => {
    if (state.isExamSubmitted) {
      e.preventDefault();
      appendTerminalOutput('🔒 Código protegido contra copia tras la entrega.', 'system');
    }
  });
  document.addEventListener('cut', (e) => {
    if (state.isExamSubmitted) {
      e.preventDefault();
    }
  });
  document.addEventListener('paste', (e) => {
    if (state.isExamSubmitted) {
      e.preventDefault();
    }
  });

  // Test sound button in lobby
  DOM.btnTestSound.addEventListener('click', () => {
    sounds.startAlarmSiren();
    DOM.btnTestSound.textContent = 'Detener';
    setTimeout(() => {
      sounds.stopAlarmSiren();
      DOM.btnTestSound.textContent = 'Probar Sirena';
    }, 1800);
  });

  // Start Exam Button
  DOM.btnStartExam.addEventListener('click', handleStartExamClick);

  // Auto-Repair and Auto-Installer Triggers
  if (DOM.btnAutoRepairAll) {
    DOM.btnAutoRepairAll.addEventListener('click', startAutoRepairProcess);
  }
  if (DOM.btnCloseAutoInstaller) {
    DOM.btnCloseAutoInstaller.addEventListener('click', () => {
      DOM.modalAutoInstaller.classList.add('hidden');
    });
  }
  if (DOM.btnFinishAutoInstaller) {
    DOM.btnFinishAutoInstaller.addEventListener('click', async () => {
      DOM.modalAutoInstaller.classList.add('hidden');
      await loadEnvironmentDiagnostics();
    });
  }
  if (DOM.btnClearInstallerLog) {
    DOM.btnClearInstallerLog.addEventListener('click', () => {
      DOM.installerTerminalOutput.innerHTML = '';
    });
  }

  // Category filter chips in Package Manager
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activePkgCategory = chip.dataset.cat;
      if (state.environmentInfo && state.environmentInfo.packages) {
        renderPackagesGrid(state.environmentInfo.packages, state.activePkgCategory);
      }
    });
  });

  // Quick tag install buttons
  document.querySelectorAll('.btn-quick-tag').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (tag) {
        DOM.customPkgInput.value = tag;
        installSinglePackage(tag);
      }
    });
  });

  // Package Manager Modals & Triggers
  DOM.btnOpenPkgManagerLobby.addEventListener('click', () => DOM.modalPackageManager.classList.remove('hidden'));
  DOM.btnOpenPkgManagerIde.addEventListener('click', () => DOM.modalPackageManager.classList.remove('hidden'));
  DOM.btnClosePkgManager.addEventListener('click', () => DOM.modalPackageManager.classList.add('hidden'));

  DOM.btnQuickInstallAll.addEventListener('click', installAllRecommendedPackages);
  DOM.btnInstallAllRecommended.addEventListener('click', installAllRecommendedPackages);

  DOM.btnInstallCustomPkg.addEventListener('click', () => {
    const pkg = DOM.customPkgInput.value.trim();
    if (pkg) {
      DOM.customPkgInput.value = '';
      installSinglePackage(pkg);
    }
  });

  DOM.customPkgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const pkg = DOM.customPkgInput.value.trim();
      if (pkg) {
        DOM.customPkgInput.value = '';
        installSinglePackage(pkg);
      }
    }
  });

  DOM.btnClearPipLog.addEventListener('click', () => {
    DOM.pipTerminalOutput.innerHTML = '';
  });

  // Zoom Controls Click Handlers
  DOM.btnZoomIn.addEventListener('click', zoomIn);
  DOM.btnZoomOut.addEventListener('click', zoomOut);
  DOM.btnZoomReset.addEventListener('click', resetZoom);

  // Theme Dropdown Toggle & Theme Options
  DOM.btnThemeMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.themeDropdownMenu.classList.toggle('hidden');
  });

  window.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-selector-dropdown')) {
      DOM.themeDropdownMenu.classList.add('hidden');
    }
  });

  document.querySelectorAll('.theme-opt').forEach((opt) => {
    opt.addEventListener('click', () => {
      setTheme(opt.dataset.theme);
    });
  });

  document.querySelectorAll('.btn-font-size').forEach((btn) => {
    btn.addEventListener('click', () => {
      setEditorFontSize(btn.dataset.size);
    });
  });

  // Layout & Panel Toggles
  DOM.btnToggleSidebar.addEventListener('click', toggleSidebar);
  DOM.btnToggleWrap.addEventListener('click', toggleWordWrap);
  if (DOM.btnToggleTermLayout) {
    DOM.btnToggleTermLayout.addEventListener('click', toggleTerminalLayout);
  }
  if (DOM.btnToggleTermPos) {
    DOM.btnToggleTermPos.addEventListener('click', toggleTerminalLayout);
  }
  DOM.btnToggleTermView.addEventListener('click', toggleTerminalVisibility);
  DOM.btnMaximizeTerm.addEventListener('click', toggleTerminalMaximize);

  // Shortcuts Helper Modal
  DOM.btnHelpShortcuts.addEventListener('click', () => DOM.modalShortcuts.classList.remove('hidden'));
  DOM.btnCloseShortcuts.addEventListener('click', () => DOM.modalShortcuts.classList.add('hidden'));

  // Editor Input & Cursor movements
  DOM.codeTextarea.addEventListener('input', handleEditorInput);
  DOM.codeTextarea.addEventListener('keydown', handleEditorKeydown);
  DOM.codeTextarea.addEventListener('keyup', updateCursorStats);
  DOM.codeTextarea.addEventListener('click', updateCursorStats);
  DOM.codeTextarea.addEventListener('scroll', syncEditorScroll);
  DOM.codeTextarea.addEventListener('copy', (e) => {
    if (state.isExamSubmitted) {
      e.preventDefault();
      appendTerminalOutput('🔒 Examen Entregado: Código protegido contra copia.', 'system');
    }
  });
  DOM.codeTextarea.addEventListener('cut', (e) => {
    if (state.isExamSubmitted) {
      e.preventDefault();
    }
  });
  DOM.codeTextarea.addEventListener('paste', (e) => {
    if (state.isExamSubmitted) {
      e.preventDefault();
    }
  });

  // Python Execution Controls
  DOM.btnRunCode.addEventListener('click', runCurrentPythonCode);
  DOM.btnStopCode.addEventListener('click', stopRunningPythonCode);

  // Terminal Actions
  DOM.btnClearTerm.addEventListener('click', clearTerminal);
  DOM.btnCopyTerm.addEventListener('click', copyTerminalOutput);
  DOM.terminalStdinInput.addEventListener('input', resizeTerminalInput);
  DOM.terminalStdinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendTerminalStdin(); }
  });
  DOM.terminalOutput.addEventListener('click', () => {
    if (state.isRunning && !window.getSelection().toString()) {
      focusTerminalInput();
    }
  });

  // Si el programa está esperando datos y el usuario teclea en cualquier parte de la consola/pantalla, enfocar el input
  window.addEventListener('keydown', (e) => {
    if (state.isRunning && !e.isComposing && !e.target.closest('input, textarea, select, button, [contenteditable], .modal-overlay')) {
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        focusTerminalInput();
        DOM.terminalStdinInput.setRangeText(e.key, DOM.terminalStdinInput.selectionStart, DOM.terminalStdinInput.selectionEnd, 'end');
        resizeTerminalInput();
      }
    }
  });

  // Explorer Actions
  DOM.btnNewFile.addEventListener('click', promptNewFile);
  DOM.btnNewFolder.addEventListener('click', promptNewFolder);
  DOM.btnRefreshFiles.addEventListener('click', loadWorkspaceFiles);

  // Modals & Warnings
  DOM.btnDismissHazard.addEventListener('click', dismissHazardWarning);
  DOM.btnTeacherUnlock.addEventListener('click', openTeacherUnlockModal);
  DOM.btnCancelTeacher.addEventListener('click', () => DOM.modalTeacherUnlock.classList.add('hidden'));
  DOM.btnConfirmTeacher.addEventListener('click', handleTeacherUnlockConfirm);

  // Exam Finish / Submission
  DOM.btnFinishExam.addEventListener('click', () => {
    if (state.isExamSubmitted) {
      DOM.modalSubmissionSuccess.classList.remove('hidden');
      return;
    }
    openSubmitExamModal();
  });
  DOM.btnCancelSubmit.addEventListener('click', () => DOM.modalSubmitExam.classList.add('hidden'));
  DOM.btnConfirmSubmit.addEventListener('click', handleExamFinalSubmit);
  if (DOM.btnReviewSubmittedCode) {
    DOM.btnReviewSubmittedCode.addEventListener('click', () => {
      DOM.modalSubmissionSuccess.classList.add('hidden');
    });
  }
  if (DOM.btnOpenWorkspaceFolder) {
    DOM.btnOpenWorkspaceFolder.addEventListener('click', handleOpenWorkspaceFolder);
  }
  if (DOM.btnCreateNewProject) {
    DOM.btnCreateNewProject.addEventListener('click', handleCreateNewProject);
  }
  if (DOM.btnViewReceipt) {
    DOM.btnViewReceipt.addEventListener('click', handleViewReceipt);
  }
  if (DOM.btnExitExamApp) {
    DOM.btnExitExamApp.addEventListener('click', handleExitExamApp);
  }
  DOM.btnCloseApp.addEventListener('click', handleExitExamApp);

  // Global Keyboard Shortcuts (F5: Run, Ctrl+S: Save, Ctrl++/Ctrl-: Zoom, Ctrl+0: Reset, Ctrl+B: Sidebar)
  window.addEventListener('keydown', (e) => {
    // Intercept volume tampering & mute keys so alarms cannot be silenced
    if (state.examSessionActive && state.appMode === 'exam' && (['AudioVolumeMute', 'VolumeMute', 'AudioVolumeDown', 'VolumeDown'].includes(e.key) || e.code === 'AudioVolumeMute' || e.code === 'AudioVolumeDown')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      zoomIn();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      zoomOut();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    if (e.key === 'F1') {
      e.preventDefault();
      DOM.modalShortcuts.classList.toggle('hidden');
    }
    if (e.key === 'F5') {
      e.preventDefault();
      runCurrentPythonCode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
  });

  // Smooth Zoom with Ctrl + Mouse Wheel
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  }, { passive: false });

  // Window Focus / Blur: Immediate detection in active sessions (Exam or Activity)
  window.addEventListener('blur', () => {
    if (state.workspaceSessionActive && !state.isExamSubmitted && !state.isRunning && !state.pythonGuiActive) {
      handleSecurityViolation({
        type: 'WINDOW_BLUR',
        timestamp: new Date().toLocaleTimeString(),
        durationSeconds: 1.0
      });
    }
  });
}

function setupElectronListeners() {
  window.electronAPI?.onBeforeClose?.(async () => {
    const saved = await saveAllFiles();
    if (!saved) alert('No se pudo guardar. La aplicación permanecerá abierta para conservar tus cambios.');
    await window.electronAPI.confirmClose(saved);
  });
  if (!window.electronAPI) return;

  // Pip Log Streaming
  window.electronAPI.onPipLog((chunk) => {
    appendPipLog(chunk);
  });

  window.electronAPI.onPipFinished(() => {
    loadEnvironmentDiagnostics();
  });

  // Automated System Setup & Repair Progress
  window.electronAPI.onSetupProgress((data) => {
    DOM.installerProgressBar.style.width = `${data.percent}%`;
    DOM.installerPercentLabel.textContent = `${data.percent}%`;
    DOM.installerCurrentStepLabel.textContent = data.title;

    updateAutoInstallerStep(1, DOM.stepItemVc, DOM.stepBadgeVc, data.step);
    updateAutoInstallerStep(2, DOM.stepItemPy, DOM.stepBadgePy, data.step);
    updateAutoInstallerStep(3, DOM.stepItemVenv, DOM.stepBadgeVenv, data.step);
    updateAutoInstallerStep(4, DOM.stepItemLibs, DOM.stepBadgeLibs, data.step);

    if (data.log) {
      appendInstallerLog(data.log);
    }
  });

  window.electronAPI.onSetupFinished(async (result) => {
    if (result.success) {
      DOM.installerProgressBar.style.width = '100%';
      DOM.installerPercentLabel.textContent = '100%';
      DOM.installerCurrentStepLabel.textContent = '¡Entorno 100% Configurado y Validado!';
      updateAutoInstallerStep(5, DOM.stepItemLibs, DOM.stepBadgeLibs, 5);
      DOM.btnFinishAutoInstaller.classList.remove('hidden');
      await loadEnvironmentDiagnostics();
    } else {
      DOM.installerCurrentStepLabel.textContent = `Error: ${result.error || 'Fallo en la instalación'}`;
      appendInstallerLog(`\n>>> Error en el proceso: ${result.error}\n`);
    }
  });

  // Monitor count changes
  window.electronAPI.onMonitorStatus((data) => {
    state.monitorsCount = data.count;
    // Only lock screen if in an active EXAM session!
    if (data.isMultiple && state.examSessionActive && state.appMode === 'exam' && !state.isExamSubmitted) {
      DOM.lockMonitorsCount.textContent = `${data.count} pantallas`;
      DOM.modalMultimonitor.classList.remove('hidden');
    } else {
      DOM.modalMultimonitor.classList.add('hidden');
    }
  });

  // Blur detected (student switched away to another application)
  window.electronAPI.onBlurDetected((data) => {
    if (!state.workspaceSessionActive || state.isExamSubmitted) return;
    if (data && data.totalIncidents) state.incidentsCount = data.totalIncidents;
    updateIncidentsDisplay();
    handleSecurityViolation(data || {});
  });

  // Focus regained (student returned to the window)
  window.electronAPI.onFocusRegained((data) => {
    if (!state.workspaceSessionActive || state.isExamSubmitted) return;
    if (data && data.totalIncidents) state.incidentsCount = data.totalIncidents;
    updateIncidentsDisplay();
    handleSecurityViolation(data || {});
  });

  // Python GUI window active (Pygame, Tkinter, Matplotlib, Turtle, OpenCV)
  if (window.electronAPI.onPythonGuiActive) {
    window.electronAPI.onPythonGuiActive((data) => {
      state.pythonGuiActive = true;
      appendTerminalOutput(`\n[Entorno Gráfico]: Ventana externa de Python activa legítimamente.\n`, 'system');
    });
  }

  // Python real-time output streams
  window.electronAPI.onPythonStdout((chunk) => {
    appendTerminalOutput(chunk, 'stdout');

  });

  window.electronAPI.onPythonStderr((chunk) => {
    appendTerminalOutput(chunk, 'stderr');
  });

  window.electronAPI.onPythonFinished((result) => {
    handleExecutionFinished(result);
  });

  window.electronAPI.onPythonError((err) => {
    appendTerminalOutput(`Error de ejecución: ${err}`, 'stderr');
    handleExecutionFinished({ exitCode: 1, duration: 0 });
  });
}

// ==============================================================
// 8. EXAM & ACTIVITY FLOW: START & TRANSITION
// ==============================================================
async function handleStartExamClick() {
  const name = DOM.studentNameInput.value.trim();
  const id = DOM.studentIdInput.value.trim();
  const subject = DOM.examSubjectInput.value.trim() || (state.appMode === 'exam' ? 'Examen de Programación' : 'Actividad Práctica');

  // Clean previous visual error states
  DOM.studentNameInput.classList.remove('input-field-error');
  DOM.studentIdInput.classList.remove('input-field-error');
  if (DOM.lobbyValidationBanner) DOM.lobbyValidationBanner.classList.add('hidden');

  if (!name) {
    DOM.studentNameInput.classList.add('input-field-error');
    if (DOM.lobbyValidationBanner && DOM.lobbyValidationText) {
      DOM.lobbyValidationText.textContent = 'Por favor, ingresa tu Nombre Completo para continuar.';
      DOM.lobbyValidationBanner.classList.remove('hidden');
    }
    DOM.studentNameInput.focus();
    DOM.studentNameInput.select();
    return;
  }

  if (!id) {
    DOM.studentIdInput.classList.add('input-field-error');
    if (DOM.lobbyValidationBanner && DOM.lobbyValidationText) {
      DOM.lobbyValidationText.textContent = 'Por favor, ingresa tu Matrícula o No. de Control para continuar.';
      DOM.lobbyValidationBanner.classList.remove('hidden');
    }
    DOM.studentIdInput.focus();
    DOM.studentIdInput.select();
    return;
  }

  // In Exam Mode: strictly verify single monitor
  if (state.appMode === 'exam' && state.monitorsCount > 1) {
    if (DOM.lobbyValidationBanner && DOM.lobbyValidationText) {
      DOM.lobbyValidationText.textContent = '⚠️ Modo Examen: Se detectaron múltiples pantallas. Desconecta cualquier monitor secundario antes de comenzar.';
      DOM.lobbyValidationBanner.classList.remove('hidden');
    }
    return;
  }

  // Save student info
  state.student.name = name;
  state.student.id = id;
  state.student.subject = subject;
  state.student.mode = state.appMode;

  // Update IDE topbar info
  DOM.navStudentLabel.textContent = `Alumno: ${name} (${id})`;
  DOM.navSubjectLabel.textContent = subject;

  if (state.appMode === 'exam') {
    // Launch countdown sequence for exam with kiosk lock
    await startCountdownSequence();
  } else {
    // Activity Mode: start immediately without kiosk lockdown or anti-cheat triggers
    state.examSessionActive = false;
    if (window.electronAPI && window.electronAPI.startKiosk) {
      const result = await window.electronAPI.startKiosk({ ...state.student, mode: 'activity' });
      if (!result.success) { alert(result.error); return; }
    }
    enterIdeWorkspace();
  }
}

async function startCountdownSequence() {

  // Trigger lockdown in main process immediately for exam
  if (window.electronAPI && window.electronAPI.startKiosk) {
    const result = await window.electronAPI.startKiosk({ ...state.student, mode: 'exam' });
    if (!result.success) { alert(result.error); return; }
  }

  switchView('countdown');
  let remaining = 10;
  const totalCircleOffset = 440; // 2 * PI * 70

  DOM.countdownNumber.textContent = remaining;
  DOM.countdownCircle.style.strokeDashoffset = 0;
  sounds.playCountdownTick(false);

  const countdownInterval = setInterval(() => {
    remaining--;
    DOM.countdownNumber.textContent = remaining;

    // Radial SVG offset animation
    const progress = (10 - remaining) / 10;
    DOM.countdownCircle.style.strokeDashoffset = totalCircleOffset * progress;

    // Steps update
    if (remaining === 8) {
      DOM.step1.classList.remove('active');
      DOM.step2.classList.add('active');
      sounds.playCountdownTick(false);
    } else if (remaining === 5) {
      DOM.step2.classList.remove('active');
      DOM.step3.classList.add('active');
      sounds.playCountdownTick(false);
    } else if (remaining === 2) {
      DOM.step3.classList.remove('active');
      DOM.step4.classList.add('active');
      sounds.playCountdownTick(false);
    } else if (remaining > 0) {
      sounds.playCountdownTick(false);
    }

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      sounds.playCountdownTick(true);
      setTimeout(() => {
        enterIdeWorkspace();
      }, 500);
    }
  }, 1000);
}

function enterIdeWorkspace() {
  switchView('ide');
  state.workspaceSessionActive = true;

  if (state.appMode === 'exam') {
    document.body.classList.remove('mode-activity-active');
    document.body.classList.add('mode-exam-active');
    state.examSessionActive = true; // Security watchdog & kiosk active only in exam mode
    // Mode Exam: Clear & prominent crimson badge, timer visible, finish exam button visible
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-exam';
      DOM.navModeIndicator.title = 'Sesión de Examen Supervisada con Auditoría de Integridad Activa';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = 'MODO EXAMEN SUPERVISADO';
    }
    if (DOM.examTimerPill) {
      DOM.examTimerPill.classList.remove('hidden');
      DOM.examTimerPill.style.display = 'inline-flex';
    }
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.classList.remove('hidden');
      DOM.btnFinishExam.style.display = 'inline-flex';
      DOM.btnFinishExam.disabled = false;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.add('hidden');
      DOM.activityActionsToolbar.style.display = 'none';
    }
    if (DOM.sidebarTitleLabel) {
      DOM.sidebarTitleLabel.textContent = 'ESPACIO DE EXAMEN';
    }
    if (DOM.workspaceHintLabel) {
      DOM.workspaceHintLabel.textContent = 'Entorno seguro de evaluación';
    }

    state.examStartTime = Date.now();
    startExamTimer();
  } else {
    document.body.classList.remove('mode-exam-active');
    document.body.classList.add('mode-activity-active');
    state.examSessionActive = false; // Mode Activity has NO anti-cheat monitoring or timer
    // Mode Activity: Blue badge, NO timer, NO finish button (only run button), project toolbar active
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-activity';
      DOM.navModeIndicator.title = 'Modo Práctica Libre: Sin bloqueos, proyectos y carpetas habilitados';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = 'MODO ACTIVIDAD';
    }
    if (DOM.examTimerPill) {
      DOM.examTimerPill.classList.add('hidden'); // Sin contador
      DOM.examTimerPill.style.display = 'none';
    }
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.classList.add('hidden'); // Solo botón ejecutar, JAMÁS entregar
      DOM.btnFinishExam.style.display = 'none';
      DOM.btnFinishExam.disabled = true;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.remove('hidden');
      DOM.activityActionsToolbar.style.display = 'inline-flex';
    }
    if (DOM.sidebarTitleLabel) {
      DOM.sidebarTitleLabel.textContent = 'PROYECTO';
    }
    if (DOM.workspaceHintLabel) {
      DOM.workspaceHintLabel.textContent = 'Carpetas y proyectos del estudiante';
    }

    if (state.examTimerInterval) {
      clearInterval(state.examTimerInterval);
      state.examTimerInterval = null;
    }
  }

  updateTerminalLayout();

  if (DOM.navWaitingReviewBadge) {
    DOM.navWaitingReviewBadge.classList.add('hidden');
  }

  loadWorkspaceFiles();
  syncEditorScroll();
}

function startExamTimer() {
  if (state.examTimerInterval) clearInterval(state.examTimerInterval);

  state.examTimerInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - state.examStartTime) / 1000);
    const hrs = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsedSeconds % 60).padStart(2, '0');
    DOM.timerDisplay.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function switchView(viewName) {
  DOM.viewLobby.classList.remove('active');
  DOM.viewCountdown.classList.remove('active');
  DOM.viewIde.classList.remove('active');

  if (viewName === 'lobby') {
    DOM.viewLobby.classList.add('active');
    state.examSessionActive = false;
  }
  if (viewName === 'countdown') DOM.viewCountdown.classList.add('active');
  if (viewName === 'ide') DOM.viewIde.classList.add('active');
}

// ==============================================================
// 9. ANTI-CHEAT & SECURITY VIOLATION ENGINE
// ==============================================================
function handleSecurityViolation(incidentData = {}) {
  // Trigger during any active workspace session (Exam or Activity) before final submission
  if (!state.workspaceSessionActive || state.isExamSubmitted) {
    return;
  }

  // If Python process is actively running or GUI window (Pygame/Tkinter/Turtle) is active, do NOT alarm!
  if (state.isRunning || state.pythonGuiActive) {
    console.log('[Supervisión]: Omitiendo aviso porque Python o ventana gráfica está en ejecución.');
    return;
  }

  // If already counting down and modal is visible, update duration without resetting the 12s countdown
  if (state.hazardCountdownInterval && !DOM.modalFocusWarning.classList.contains('hidden')) {
    if (incidentData && incidentData.durationSeconds) {
      DOM.hazardDuration.textContent = `${incidentData.durationSeconds} segundos`;
    }
    return;
  }

  state.incidentsCount++;
  updateIncidentsDisplay();

  const isActivity = state.appMode === 'activity';
  const titleEl = DOM.modalFocusWarning.querySelector('.academic-title');
  const subtitleEl = DOM.modalFocusWarning.querySelector('.academic-subtitle');
  const descEl = DOM.modalFocusWarning.querySelector('.academic-desc');

  if (titleEl) {
    titleEl.textContent = isActivity
      ? 'Aviso de Supervisión'
      : 'Aviso de Integridad';
  }
  if (subtitleEl) {
    subtitleEl.textContent = isActivity
      ? 'CAMBIO DE PROGRAMA DETECTADO'
      : 'CAMBIO DE VENTANA DETECTADO';
  }
  if (descEl) {
    descEl.textContent = 'Se ha detectado una salida del entorno de trabajo. La acción queda registrada.';
  }
  if (DOM.hazardStrobeText) {
    DOM.hazardStrobeText.textContent = isActivity
      ? 'AVISO DE SUPERVISIÓN'
      : 'ALERTA DE EVALUACIÓN';
  }

  // Display Academic Integrity Incident Modal
  DOM.hazardTime.textContent = incidentData.timestamp || new Date().toLocaleTimeString();
  DOM.hazardDuration.textContent = `${incidentData.durationSeconds || 1.0}s`;
  DOM.hazardTotalIncidents.textContent = state.incidentsCount;

  // Preparar temporizador lumínico de 12 segundos para poder reanudar
  let remainingSeconds = 12;
  if (DOM.btnDismissHazard) {
    DOM.btnDismissHazard.disabled = true;
    DOM.btnDismissHazard.classList.remove('ready-to-resume');
    DOM.btnDismissHazard.classList.add('waiting');
  }
  if (DOM.hazardBtnLabel) {
    DOM.hazardBtnLabel.textContent = `Espera ${remainingSeconds}s para reanudar...`;
  }
  if (DOM.hazardCountdownText) {
    DOM.hazardCountdownText.textContent = `${remainingSeconds}s`;
  }

  DOM.modalFocusWarning.classList.remove('hidden');
  DOM.modalFocusWarning.classList.add('hazard-luminescent');
  const box = DOM.modalFocusWarning.querySelector('.modal-academic-warning-box');
  if (box) box.classList.add('luminescent-box');

  // Ensure system audio is active and unmuted
  try {
    if (window.electronAPI && window.electronAPI.enforceAudio) window.electronAPI.enforceAudio();
    if (window.electronAPI && window.electronAPI.beep) window.electronAPI.beep();
  } catch (_) {}

  // Trigger warning sound (armónico, suave, no estridente)
  sounds.startAlarmSiren();

  if (state.hazardCountdownInterval) {
    clearInterval(state.hazardCountdownInterval);
  }

  state.hazardCountdownInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds > 0) {
      if (DOM.hazardCountdownText) {
        DOM.hazardCountdownText.textContent = `${remainingSeconds}s`;
      }
      if (DOM.hazardBtnLabel) {
        DOM.hazardBtnLabel.textContent = `Espera ${remainingSeconds}s para reanudar...`;
      }
    } else {
      clearInterval(state.hazardCountdownInterval);
      state.hazardCountdownInterval = null;
      sounds.stopAlarmSiren();

      // Apagar parpadeo lumínico
      DOM.modalFocusWarning.classList.remove('hazard-luminescent');
      if (box) box.classList.remove('luminescent-box');

      // Habilitar botón de reanudación
      if (DOM.btnDismissHazard) {
        DOM.btnDismissHazard.disabled = false;
        DOM.btnDismissHazard.classList.remove('waiting');
        DOM.btnDismissHazard.classList.add('ready-to-resume');
      }
      if (DOM.hazardCountdownText) {
        DOM.hazardCountdownText.textContent = '0s';
      }
      if (DOM.hazardBtnLabel) {
        DOM.hazardBtnLabel.textContent = isActivity
          ? '✓ Continuar Actividad'
          : '✓ Reanudar Examen';
      }
    }
  }, 1000);
}

function dismissHazardWarning() {
  if (state.hazardCountdownInterval) {
    clearInterval(state.hazardCountdownInterval);
    state.hazardCountdownInterval = null;
  }
  sounds.stopAlarmSiren();
  DOM.modalFocusWarning.classList.remove('hazard-luminescent');
  const box = DOM.modalFocusWarning.querySelector('.modal-academic-warning-box');
  if (box) box.classList.remove('luminescent-box');
  DOM.modalFocusWarning.classList.add('hidden');
}

function updateIncidentsDisplay() {
  if (state.incidentsCount > 0) {
    DOM.incidentsCounterPill.className = 'incidents-pill warn';
    DOM.incidentsCounterText.textContent = `⚠️ ${state.incidentsCount} Incidencia(s)`;
  } else {
    DOM.incidentsCounterPill.className = 'incidents-pill clean';
    DOM.incidentsCounterText.textContent = '0 Incidencias';
  }
}

// ==============================================================
// 10. FILE EXPLORER & WORKSPACE
// ==============================================================
async function loadWorkspaceFiles() {
  if (window.electronAPI) {
    const res = await window.electronAPI.listWorkspace();
    if (res.success) {
      state.filesTree = res.tree;
      renderFileTree(res.tree);

      // Open initial file (main.py)
      if (state.openTabs.length === 0) {
        const firstFile = tree => {
          for (const item of tree) {
            if (item.type === 'file' && item.name.endsWith('.py')) return item.path;
            const nested = item.children && firstFile(item.children);
            if (nested) return nested;
          }
        };
        const initial = res.tree.find(item => item.name === 'main.py' && item.type === 'file')?.path || firstFile(res.tree);
        if (initial) await openFileInEditor(initial);
      }
    }
  } else {
    // Mock files for testing
    const mockTree = [
      { name: 'main.py', path: 'main.py', type: 'file', size: 120 },
      { name: 'juego_pygame.py', path: 'juego_pygame.py', type: 'file', size: 240 }
    ];
    renderFileTree(mockTree);
    if (state.openTabs.length === 0) {
      openFileInEditor('main.py');
    }
  }
}

function renderFileTree(tree, container = DOM.fileTreeContainer, depth = 0) {
  if (depth === 0) container.innerHTML = '';

  tree.forEach((item) => {
    const itemEl = document.createElement('div');
    itemEl.className = `tree-item ${state.activeFilePath === item.path ? 'active' : ''}`;
    itemEl.style.paddingLeft = `${10 + depth * 14}px`;

    let icon = '📄';
    if (item.type === 'directory') {
      icon = '📁';
    } else if (item.name.endsWith('.py')) {
      icon = '🐍';
    } else if (item.name.endsWith('.json')) {
      icon = '📦';
    } else if (item.name.endsWith('.csv') || item.name.endsWith('.data')) {
      icon = '📊';
    }

    itemEl.innerHTML = `
      <div class="tree-item-left">
        <span class="tree-item-icon">${icon}</span>
        <span class="tree-item-name">${escapeHtml(item.name)}</span>
      </div>
      <div class="tree-item-actions">
        <button class="btn-tree-action" title="Eliminar" data-action="delete" data-path="${escapeHtml(item.path)}">🗑️</button>
      </div>
    `;

    // Item click
    itemEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete"]')) return;
      if (item.type === 'file') {
        openFileInEditor(item.path);
      }
    });

    // Delete click
    const deleteBtn = itemEl.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (state.isExamSubmitted) return;
        if (confirm(`¿Eliminar ${item.name}?`)) {
          if (window.electronAPI) {
            if (!await saveAllFiles()) return;
            const result = await window.electronAPI.deleteItem(item.path);
            if (!result.success) { alert(result.error); return; }
            state.openTabs.filter(t => t.path === item.path || t.path.startsWith(item.path + '/')).forEach(t => closeTab(t.path));
            loadWorkspaceFiles();
          }
        }
      });
    }

    container.appendChild(itemEl);

    // Recursively render directories
    if (item.type === 'directory' && item.children) {
      renderFileTree(item.children, container, depth + 1);
    }
  });
}

async function openFileInEditor(relativePath) {
  const request = (state.fileOpenRequest || 0) + 1;
  state.fileOpenRequest = request;

  // Add to tabs if not present
  let tab = state.openTabs.find((t) => t.path === relativePath);
  if (!tab) {
    let content = '';
    if (window.electronAPI) {
      const res = await window.electronAPI.readFile(relativePath);
      if (!res.success) { appendTerminalOutput(`No se pudo abrir ${relativePath}: ${res.error}\n`, 'stderr'); return; }
      if (state.fileOpenRequest !== request) return;
      content = res.content;
    } else {
      content = `# CodeGO ExamGuard - Entorno de Examen\nimport pygame\nimport numpy as np\n\ndef main():\n    print("¡Bienvenido al Examen de Programación!")\n    print("NumPy version:", np.__version__)\n    print("Pygame version:", pygame.__version__)\n    nombre = input("Ingresa tu nombre: ")\n    print(f"Hola {nombre}, entorno verificado.")\n\nif __name__ == "__main__":\n    main()\n`;
    }

    tab = {
      path: relativePath,
      name: relativePath.split(/[/\\]/).pop(),
      content,
      isDirty: false
    };
    state.openTabs.push(tab);
  }

  state.activeFilePath = relativePath;
  renderTabs();
  DOM.codeTextarea.value = tab.content;
  if (state.isExamSubmitted) {
    DOM.codeTextarea.readOnly = true;
    DOM.codeTextarea.classList.add('code-locked');
  } else {
    DOM.codeTextarea.readOnly = false;
    DOM.codeTextarea.classList.remove('code-locked');
  }
  updateLineNumbers();
  updateCursorStats();
  updateSyntaxHighlighting();

  // Highlight active tree item
  document.querySelectorAll('.tree-item').forEach((el) => {
    const isThis = el.querySelector('.tree-item-name')?.textContent === tab.name;
    el.classList.toggle('active', isThis);
  });
}

function renderTabs() {
  DOM.editorTabsBar.innerHTML = '';
  state.openTabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.setAttribute('role', 'tab');
    tabEl.tabIndex = 0;
    tabEl.setAttribute('aria-selected', String(tab.path === state.activeFilePath));
    tabEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFileInEditor(tab.path); } });
    tabEl.className = `editor-tab ${tab.path === state.activeFilePath ? 'active' : ''}`;
    const icon = tab.name.endsWith('.py') ? '🐍' : '📄';
    tabEl.innerHTML = `
      <span class="tab-icon">${icon}</span>
      <span class="tab-name">${escapeHtml(tab.name)}</span>
      <span class="tab-unsaved-dot ${tab.isDirty ? 'visible' : ''}"></span>
    `;

    tabEl.addEventListener('click', () => {
      openFileInEditor(tab.path);
    });

    DOM.editorTabsBar.appendChild(tabEl);
  });
}

function closeTab(relativePath) {
  state.openTabs = state.openTabs.filter((t) => t.path !== relativePath);
  if (state.activeFilePath === relativePath && state.openTabs.length > 0) {
    openFileInEditor(state.openTabs[0].path);
  } else if (state.openTabs.length === 0) {
    DOM.codeTextarea.value = '';
    state.activeFilePath = '';
    renderTabs();
    updateLineNumbers();
    updateSyntaxHighlighting();
  } else {
    renderTabs();
  }
}

function requestName(title, placeholder) {
  return new Promise(resolve => {
    const dialog = document.getElementById('name-dialog');
    const field = document.getElementById('name-dialog-input');
    document.getElementById('name-dialog-title').textContent = title;
    field.value = '';
    field.placeholder = placeholder;
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? field.value.trim() : null), { once: true });
    dialog.showModal();
    field.focus();
  });
}

async function promptNewFile() {
  if (state.isExamSubmitted) {
    alert('El examen ya ha sido entregado. No se permite crear nuevos archivos.');
    return;
  }
  const fileName = await requestName('Nuevo archivo Python', 'solucion.py');
  if (!fileName) return;

  const validName = fileName.endsWith('.py') ? fileName : `${fileName}.py`;
  if (window.electronAPI) {
    const result = await window.electronAPI.createFile(validName);
    if (!result.success) { alert(result.error); return; }
    await loadWorkspaceFiles();
    await openFileInEditor(validName);
  }
}

async function promptNewFolder() {
  if (state.isExamSubmitted) {
    alert('El examen ya ha sido entregado. No se permite crear carpetas.');
    return;
  }
  const folderName = await requestName('Nueva carpeta', 'ejercicios');
  if (!folderName) return;

  if (window.electronAPI) {
    const result = await window.electronAPI.createFolder(folderName);
    if (!result.success) { alert(result.error); return; }
    await loadWorkspaceFiles();
  }
}

// ==============================================================
// 11. CODE EDITOR LOGIC & AUTO-SAVE
// ==============================================================
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function highlightPython(code) {
  if (!code) return '';

  // Regex patterns:
  // 1. Triple-quoted strings
  // 2. Single-quoted strings (supports raw and f-strings)
  // 3. Comments (#...)
  // 4. Decorators (@...)
  // 5. Function/class definitions
  // 6. Booleans & None
  // 7. self & cls
  // 8. Python keywords
  // 9. Standard built-ins
  // 10. Numbers (hex, float, int)
  // 11. Operators
  const tokenRegex = /(?:("""[\s\S]*?"""|'''[\s\S]*?''')|((?:[rfbRFB]{1,2})?"(?:\\[\s\S]|[^"\\])*"|(?:[rfbRFB]{1,2})?'(?:\\[\s\S]|[^'\\])*')|(#.*$)|(@[a-zA-Z_]\w*)|(\b(?:def|class)\s+([a-zA-Z_]\w*))|(\b(?:True|False|None)\b)|(\b(?:self|cls)\b)|(\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b)|(\b(?:abs|all|any|bin|bool|bytearray|bytes|callable|chr|classmethod|compile|complex|delattr|dict|dir|divmod|enumerate|eval|exec|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|isinstance|issubclass|iter|len|list|locals|map|max|memoryview|min|next|object|oct|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|vars|zip)\b)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([+\-*/%&|^~<>!=]=?|==|!=|<=|>=|\/\/|\*\*))/gm;

  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(code.substring(lastIndex, match.index));
    }

    const [
      fullMatch,
      multiString,
      singleString,
      comment,
      decorator,
      defClass,
      fnOrClassName,
      boolVal,
      selfIdent,
      keyword,
      builtin,
      numVal,
      operator
    ] = match;

    if (multiString || singleString) {
      result += `<span class="tok-str">${escapeHtml(fullMatch)}</span>`;
    } else if (comment) {
      result += `<span class="tok-comment">${escapeHtml(fullMatch)}</span>`;
    } else if (decorator) {
      result += `<span class="tok-decorator">${escapeHtml(fullMatch)}</span>`;
    } else if (defClass) {
      const parts = fullMatch.split(/\s+/);
      const kw = parts[0];
      const name = parts.slice(1).join(' ');
      result += `<span class="tok-kw">${escapeHtml(kw)}</span> <span class="tok-fn">${escapeHtml(name)}</span>`;
    } else if (boolVal) {
      result += `<span class="tok-bool">${escapeHtml(fullMatch)}</span>`;
    } else if (selfIdent) {
      result += `<span class="tok-self">${escapeHtml(fullMatch)}</span>`;
    } else if (keyword) {
      result += `<span class="tok-kw">${escapeHtml(fullMatch)}</span>`;
    } else if (builtin) {
      result += `<span class="tok-builtin">${escapeHtml(fullMatch)}</span>`;
    } else if (numVal) {
      result += `<span class="tok-num">${escapeHtml(fullMatch)}</span>`;
    } else if (operator) {
      result += `<span class="tok-op">${escapeHtml(fullMatch)}</span>`;
    } else {
      result += escapeHtml(fullMatch);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.substring(lastIndex));
  }

  return result;
}

function updateSyntaxHighlighting() {
  if (!DOM.highlightingContent || !DOM.codeTextarea) return;
  const code = DOM.codeTextarea.value;
  DOM.highlightingContent.innerHTML = highlightPython(code) + (code.endsWith('\n') ? ' ' : '');
  syncEditorScroll();
}

function handleEditorInput() {
  if (state.isExamSubmitted || state.isSubmitting) return;
  const currentTab = state.openTabs.find((t) => t.path === state.activeFilePath);
  if (currentTab) {
    currentTab.content = DOM.codeTextarea.value;
    currentTab.isDirty = true;
    renderTabs();
  }

  updateLineNumbers();
  updateCursorStats();
  updateSyntaxHighlighting();

  DOM.sbSaveStatus.textContent = 'Guardando cambios...';

  // Debounced auto-save (400ms for safety)
  clearTimeout(state.autoSaveTimeout);
  state.autoSaveTimeout = setTimeout(() => {
    saveAllFiles();
  }, 400);
}

let saveQueue = Promise.resolve();
function saveTab(tab) {
  if (!tab || state.isExamSubmitted) return Promise.resolve(true);
  const content = tab.content;
  const write = async () => {
    try {
      if (!window.electronAPI) throw new Error('Guardado disponible en la aplicación de escritorio.');
      const result = await window.electronAPI.saveFile({ relativePath: tab.path, content });
      if (!result.success) throw new Error(result.error || 'No se pudo guardar el archivo.');
      if (tab.content === content) tab.isDirty = false;
      renderTabs();
      DOM.sbSaveStatus.classList.remove('save-error');
      DOM.sbSaveStatus.textContent = state.openTabs.some(t => t.isDirty) ? 'Cambios pendientes' : 'Todos los cambios guardados';
      return true;
    } catch (error) {
      tab.isDirty = true;
      DOM.sbSaveStatus.classList.add('save-error');
      DOM.sbSaveStatus.textContent = 'No se pudo guardar · Ctrl+S para reintentar';
      DOM.sbSaveStatus.title = error.message;
      renderTabs();
      return false;
    }
  };
  saveQueue = saveQueue.then(write, write);
  return saveQueue;
}
function saveCurrentFile() {
  return saveTab(state.openTabs.find(t => t.path === state.activeFilePath));
}
async function saveAllFiles() {
  clearTimeout(state.autoSaveTimeout);
  const results = await Promise.all(state.openTabs.filter(t => t.isDirty).map(saveTab));
  await saveQueue;
  return results.every(Boolean);
}

function handleEditorKeydown(e) {
  if (state.isExamSubmitted) {
    const allowedNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!allowedNav.includes(e.key)) {
      e.preventDefault();
    }
    return;
  }

  // Support Tab key for 4-space Python indentation
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = DOM.codeTextarea.selectionStart;
    const end = DOM.codeTextarea.selectionEnd;
    const value = DOM.codeTextarea.value;

    DOM.codeTextarea.value = value.substring(0, start) + '    ' + value.substring(end);
    DOM.codeTextarea.selectionStart = DOM.codeTextarea.selectionEnd = start + 4;
    handleEditorInput();
  }

  // Support smart Enter indentation
  if (e.key === 'Enter') {
    const cursorPos = DOM.codeTextarea.selectionStart;
    const value = DOM.codeTextarea.value;
    const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
    const currentLine = value.substring(lineStart, cursorPos);
    const matchIndent = currentLine.match(/^\s*/);
    const baseIndent = matchIndent ? matchIndent[0] : '';
    const extraIndent = currentLine.trim().endsWith(':') ? '    ' : '';

    if (baseIndent || extraIndent) {
      e.preventDefault();
      const insert = '\n' + baseIndent + extraIndent;
      DOM.codeTextarea.value = value.substring(0, cursorPos) + insert + value.substring(cursorPos);
      DOM.codeTextarea.selectionStart = DOM.codeTextarea.selectionEnd = cursorPos + insert.length;
      handleEditorInput();
    }
  }
}

function updateLineNumbers() {
  const lines = DOM.codeTextarea.value.split('\n').length;
  let numbersHtml = '';
  for (let i = 1; i <= lines; i++) {
    numbersHtml += `<div>${i}</div>`;
  }
  DOM.editorLineNumbers.innerHTML = numbersHtml;
}

function updateCursorStats() {
  const cursorPos = DOM.codeTextarea.selectionStart;
  const value = DOM.codeTextarea.value;
  const lines = value.substring(0, cursorPos).split('\n');
  const lineNum = lines.length;
  const colNum = lines[lines.length - 1].length + 1;

  DOM.sbCursorPos.textContent = `Lín ${lineNum}, Col ${colNum}`;
  DOM.sbCharsCount.textContent = `${value.length} caracteres`;
}

function syncEditorScroll() {
  if (DOM.editorHighlighting && DOM.codeTextarea) {
    DOM.editorHighlighting.scrollTop = DOM.codeTextarea.scrollTop;
    DOM.editorHighlighting.scrollLeft = DOM.codeTextarea.scrollLeft;
  }
  if (DOM.editorLineNumbers && DOM.codeTextarea) {
    DOM.editorLineNumbers.scrollTop = DOM.codeTextarea.scrollTop;
  }
}

// ==============================================================
// 12. PYTHON EXECUTION & TERMINAL LOGIC
// ==============================================================
async function runCurrentPythonCode() {
  if (state.isRunning || state.isStarting || state.isSubmitting) return;
  DOM.workspaceArea.classList.remove('terminal-collapsed');
  if (!state.activeFilePath.toLowerCase().endsWith('.py')) {
    appendTerminalOutput('Selecciona un archivo Python (.py) para ejecutar.\n', 'stderr');
    return;
  }
  if (!window.electronAPI) {
    appendTerminalOutput('La vista previa no ejecuta Python. Abre CodeGO de escritorio para ejecutar y guardar.\n', 'system');
    return;
  }
  state.isStarting = true;
  DOM.btnRunCode.disabled = true;
  try {
    if (!state.isExamSubmitted && !await saveAllFiles()) throw new Error('Guarda los cambios antes de ejecutar.');
    state.isRunning = true;
    state.isStopping = false;
    DOM.btnStopCode.disabled = false;
    DOM.btnStopCode.classList.add('active');
    DOM.termStatusBadge.className = 'term-badge running';
    DOM.termStatusBadge.textContent = 'Ejecutando';
    DOM.termExecTime.textContent = '';
    DOM.terminalStdinInput.disabled = false;
    DOM.terminalStdinInput.value = '';
    resizeTerminalInput();
    focusTerminalInput();
    appendTerminalOutput(`Ejecutando ${state.activeFilePath}\n`, 'system');
    const result = await window.electronAPI.runPython({ relativePath: state.activeFilePath });
    if (!result.success) throw new Error(result.error);
  } catch (error) {
    appendTerminalOutput(`No se pudo ejecutar: ${error.message}\n`, 'stderr');
    state.isRunning = true;
    handleExecutionFinished({ exitCode: 1, duration: 0 });
  } finally {
    state.isStarting = false;
    DOM.btnRunCode.disabled = state.isRunning;
  }
}

async function stopRunningPythonCode() {
  if (!state.isRunning || state.isStopping) return;
  state.isStopping = true;
  DOM.btnStopCode.disabled = true;
  try {
    const result = await window.electronAPI.killPython();
    if (!result.success) throw new Error(result.error);
    // Completion comes from process close, after the output streams are drained.
  } catch (error) {
    state.isStopping = false;
    DOM.btnStopCode.disabled = !state.isRunning;
    appendTerminalOutput(`No se pudo detener: ${error.message}\n`, 'stderr');
  }
}

function handleExecutionFinished(result) {
  if (!state.isRunning) return;
  const stopped = state.isStopping || Boolean(result.signal);
  state.isRunning = false;
  state.isStopping = false;
  state.pythonGuiActive = false;
  DOM.btnRunCode.disabled = false;
  DOM.btnStopCode.disabled = true;
  DOM.btnStopCode.classList.remove('active');
  const hadFocus = document.activeElement === DOM.terminalStdinInput;
  DOM.terminalStdinInput.disabled = true;
  DOM.terminalStdinInput.value = '';
  resizeTerminalInput();
  const success = result.exitCode === 0;
  DOM.termStatusBadge.className = `term-badge ${stopped ? 'stopped' : success ? 'success' : 'error'}`;
  DOM.termStatusBadge.textContent = stopped ? 'Detenido' : success ? 'Finalizado' : 'Error';
  DOM.termExecTime.textContent = `${result.duration}s`;
  appendTerminalOutput(stopped ? 'Programa detenido.\n' : success ? `Finalizó sin errores · ${result.duration} s\n` : `Finalizó con código ${result.exitCode}. Revisa el error de arriba.\n`, stopped ? 'system' : success ? 'success' : 'stderr');
  if (hadFocus && !state.isTermMaximized) DOM.codeTextarea.focus({ preventScroll: true });
}

// Keep chunk boundaries invisible and cap the transcript so a print loop cannot grow the DOM forever.
const TERMINAL_LIMIT = 200000;
let terminalCharacters = DOM.terminalTranscript.textContent.length;

function resizeTerminalInput() {
  DOM.terminalStdinInput.style.width = `${Math.max(2, Array.from(DOM.terminalStdinInput.value).length + 1)}ch`;
}

function focusTerminalInput() {
  DOM.terminalOutput.scrollTop = DOM.terminalOutput.scrollHeight;
  DOM.terminalStdinInput.focus({ preventScroll: true });
}

function appendTerminalOutput(text, type = 'stdout') {
  const output = DOM.terminalTranscript;
  const scroller = DOM.terminalOutput;
  const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
  let value = String(text);
  if (value.length > TERMINAL_LIMIT) value = value.slice(-TERMINAL_LIMIT);
  const last = output.lastElementChild;
  if (last && last.dataset.stream === type && (type === 'stdout' || type === 'stderr') && last.textContent.length + value.length < 16000) {
    last.appendChild(document.createTextNode(value));
    last.normalize();
  } else {
    const line = document.createElement(['stdout', 'stderr', 'user-stdin'].includes(type) ? 'span' : 'div');
    line.className = `term-line ${type}`;
    line.dataset.stream = type;
    line.textContent = value;
    output.appendChild(line);
  }
  terminalCharacters += value.length;
  while (output.childElementCount > 1 && (terminalCharacters > TERMINAL_LIMIT || output.childElementCount > 1000)) {
    terminalCharacters -= output.firstElementChild.textContent.length;
    output.firstElementChild.remove();
  }
  if (atBottom) scroller.scrollTop = scroller.scrollHeight;
}

async function sendTerminalStdin() {
  if (!state.isRunning || state.isSendingInput) return;
  const value = DOM.terminalStdinInput.value;
  state.isSendingInput = true;
  // Echo the user's action before Python can emit its next prompt.
  appendTerminalOutput(`${value}\n`, 'user-stdin');
  try {
    const result = await window.electronAPI.sendPythonStdin(value);
    if (!result.success) throw new Error(result.error);
    if (DOM.terminalStdinInput.value === value) DOM.terminalStdinInput.value = '';
    resizeTerminalInput();
    DOM.terminalOutput.scrollTop = DOM.terminalOutput.scrollHeight;
    if (state.isRunning) focusTerminalInput();
  } catch (error) {
    appendTerminalOutput(`No se pudo enviar: ${error.message}\n`, 'stderr');
  } finally {
    state.isSendingInput = false;
  }
}

function clearTerminal() {
  DOM.terminalTranscript.replaceChildren();
  terminalCharacters = 0;
}

async function copyTerminalOutput() {
  try {
    await navigator.clipboard.writeText(DOM.terminalTranscript.innerText);
    DOM.btnCopyTerm.textContent = 'Copiado';
  } catch (_) {
    DOM.btnCopyTerm.textContent = 'Sin permiso';
  }
  setTimeout(() => { DOM.btnCopyTerm.textContent = 'Copiar'; }, 1500);
}

// ==============================================================
// 13. TEACHER EMERGENCY UNLOCK & EXAM SUBMISSION
// ==============================================================
function openTeacherUnlockModal() {
  DOM.teacherPinInput.value = '';
  DOM.teacherPinError.classList.add('hidden');
  DOM.modalTeacherUnlock.classList.remove('hidden');
  DOM.teacherPinInput.focus();
}

async function handleTeacherUnlockConfirm() {
  const pin = DOM.teacherPinInput.value.trim();
  if (!pin) return;

  if (window.electronAPI) {
    const res = await window.electronAPI.exitKiosk(pin);
    if (res.success) {
      DOM.modalTeacherUnlock.classList.add('hidden');
      alert('Modo Kiosk desactivado por autorización docente.');
    } else {
      DOM.teacherPinError.textContent = res.error || 'PIN incorrecto.';
      DOM.teacherPinError.classList.remove('hidden');
    }
  } else {
    DOM.teacherPinError.textContent = 'La autorización docente requiere la aplicación de escritorio.';
    DOM.teacherPinError.classList.remove('hidden');
  }
}

function lockExamEnvironment() {
  state.isExamSubmitted = true;
  state.examSessionActive = false;
  DOM.codeTextarea.readOnly = true;
  DOM.codeTextarea.classList.add('code-locked');
  const editorWrapper = document.querySelector('.editor-wrapper');
  if (editorWrapper) editorWrapper.classList.add('locked');

  // Prominent blinking badge at top waiting for teacher review
  if (DOM.navWaitingReviewBadge) {
    DOM.navWaitingReviewBadge.classList.remove('hidden');
  }

  if (DOM.examLockedBadge) {
    DOM.examLockedBadge.classList.remove('hidden');
  }
  if (DOM.btnFinishExam) {
    DOM.btnFinishExam.classList.add('hidden');
  }
  if (DOM.postSubmissionToolbar) {
    DOM.postSubmissionToolbar.classList.remove('hidden');
  }

  // Disable file creation and deletion
  DOM.btnNewFile.disabled = true;
  DOM.btnNewFolder.disabled = true;

  // Crucial: Keep Run Code enabled so student/teacher can execute and demonstrate!
  DOM.btnRunCode.disabled = false;

  appendTerminalOutput('\n>>> [EXAMEN ENTREGADO DEFINITIVAMENTE - MODO SOLO LECTURA]', 'success');
  appendTerminalOutput('>>> El código ha sido sellado contra modificaciones, copia y pegado.', 'system');
  appendTerminalOutput('>>> Estado: Esperando revisión del profesor en su pupitre.', 'system');
  appendTerminalOutput('>>> La ejecución sigue habilitada con "▶ Ejecutar" (F5) para validación del docente.\n', 'system');
  appendTerminalOutput('>>> Opciones post-entrega habilitadas: Abrir Carpeta, Nuevo Proyecto o Salir.\n', 'system');
}

function openSubmitExamModal() {
  if (state.appMode !== 'exam' || state.isExamSubmitted) return;
  DOM.submitTotalTime.textContent = DOM.timerDisplay.textContent;
  DOM.submitTotalFiles.textContent = state.openTabs.length || 1;

  if (state.incidentsCount === 0) {
    DOM.submitTotalIncidents.textContent = '0 (Examen Limpio ✓)';
    DOM.submitTotalIncidents.className = 'clean';
  } else {
    DOM.submitTotalIncidents.textContent = `${state.incidentsCount} Incidencia(s) Registrada(s)`;
    DOM.submitTotalIncidents.className = 'highlight-red';
  }

  DOM.modalSubmitExam.classList.remove('hidden');
}

async function handleExamFinalSubmit() {
  if (state.appMode !== 'exam' || state.isExamSubmitted || state.isSubmitting) return;
  if (state.isRunning || state.isStarting) { alert('Detén el programa antes de entregar el examen.'); return; }
  state.isSubmitting = true;
  DOM.btnConfirmSubmit.disabled = true;
  DOM.codeTextarea.readOnly = true;
  try {
    if (!await saveAllFiles()) throw new Error('No se pudieron guardar todos los archivos. Reintenta el guardado antes de entregar.');
    if (!window.electronAPI) throw new Error('La entrega está disponible en la aplicación de escritorio.');
    const res = await window.electronAPI.submitExam(state.student);
    if (!res.success) throw new Error(res.error);
    lockExamEnvironment();
    DOM.modalSubmitExam.classList.add('hidden');
    if (state.examTimerInterval) clearInterval(state.examTimerInterval);
    DOM.receiptFilename.textContent = res.fileName;
    DOM.receiptPath.textContent = res.zipPath;
    DOM.receiptChecksum.textContent = res.zipChecksum || res.manifest.checksum;
    DOM.modalSubmissionSuccess.classList.remove('hidden');
    updateWifiStatus();
  } catch (error) {
    DOM.codeTextarea.readOnly = state.isExamSubmitted;
    alert(`No se completó la entrega: ${error.message}`);
  } finally {
    state.isSubmitting = false;
    DOM.btnConfirmSubmit.disabled = false;
  }
}

async function handleOpenWorkspaceFolder() {
  if (state.isRunning || state.isStarting) { appendTerminalOutput('Detén el programa antes de cambiar de proyecto.\n', 'system'); return; }
  if (!await saveAllFiles()) return;
  if (window.electronAPI && window.electronAPI.openFolderDialog) {
    const res = await window.electronAPI.openFolderDialog();
    if (res && res.success) {
      state.isExamSubmitted = false;
      DOM.codeTextarea.readOnly = false;
      DOM.codeTextarea.classList.remove('code-locked');
      const editorWrapper = document.querySelector('.editor-wrapper');
      if (editorWrapper) editorWrapper.classList.remove('locked');
      DOM.examLockedBadge.classList.add('hidden');
      if (DOM.navWaitingReviewBadge) DOM.navWaitingReviewBadge.classList.add('hidden');
      DOM.btnNewFile.disabled = false;
      DOM.btnNewFolder.disabled = false;

      state.openTabs = [];
      state.activeFilePath = '';
      DOM.codeTextarea.value = '';
      renderTabs();
      updateSyntaxHighlighting();
      await loadWorkspaceFiles();
      appendTerminalOutput(`\n>>> [PROYECTO ABIERTO]: ${res.workspacePath}`, 'success');
      appendTerminalOutput('>>> Entorno listo para edición y ejecución.', 'system');
    }
  } else {
    alert('Función disponible en la aplicación de escritorio.');
  }
}

async function handleCreateNewProject() {
  if (state.isRunning || state.isStarting) { appendTerminalOutput('Detén el programa antes de cambiar de proyecto.\n', 'system'); return; }
  if (!await saveAllFiles()) return;
  const projectName = await requestName('Nuevo proyecto Python', 'MiNuevoProyecto');
  if (!projectName || !projectName.trim()) return;

  if (window.electronAPI && window.electronAPI.createProjectDialog) {
    const res = await window.electronAPI.createProjectDialog(projectName.trim());
    if (res && res.success) {
      state.isExamSubmitted = false;
      DOM.codeTextarea.readOnly = false;
      DOM.codeTextarea.classList.remove('code-locked');
      const editorWrapper = document.querySelector('.editor-wrapper');
      if (editorWrapper) editorWrapper.classList.remove('locked');
      DOM.examLockedBadge.classList.add('hidden');
      if (DOM.navWaitingReviewBadge) DOM.navWaitingReviewBadge.classList.add('hidden');
      DOM.btnNewFile.disabled = false;
      DOM.btnNewFolder.disabled = false;

      state.openTabs = [];
      state.activeFilePath = '';
      await loadWorkspaceFiles();
      await openFileInEditor('main.py');
      appendTerminalOutput(`\n>>> [NUEVO PROYECTO CREADO]: ${res.workspacePath}`, 'success');
      appendTerminalOutput('>>> Archivo main.py inicializado y listo para programar.', 'system');
    }
  } else {
    alert('Función disponible en la aplicación de escritorio.');
  }
}

function handleViewReceipt() {
  DOM.modalSubmissionSuccess.classList.remove('hidden');
}

async function handleExitExamApp() {
  if (!await saveAllFiles()) return;
  if (confirm('¿Deseas cerrar y salir de CodeGO?')) {
    if (window.electronAPI && window.electronAPI.quitApp) {
      await window.electronAPI.quitApp();
    } else {
      window.close();
    }
  }
}

// Start Application on Load
document.addEventListener('DOMContentLoaded', initApp);
