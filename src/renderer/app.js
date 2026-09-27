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
  activeFilePath: '',
  openTabs: [],
  filesTree: [],
  workspaceSelected: false,
  workspacePath: '',
  workspaceName: '',
  draggedTreeItem: null,
  isRunning: false,
  pythonGuiActive: false,
  pythonInfo: null,
  environmentInfo: null,
  environmentReady: false,
  environmentSetupRequired: false,
  monitorsCount: 1,
  autoSaveTimeout: null,
  zoomFactor: 1.0,
  currentTheme: 'theme-obsidian',
  editorFontSize: 14,
  isWordWrap: false,
  isTermMaximized: false,
  isExamSubmitted: false,
  isTaskSubmitted: false,
  collapsedFolders: new Set(),
  taskTelemetry: {
    keystrokes: 0,
    charactersWritten: 0,
    externalPasteAttempts: 0,
    runsCount: 0,
    activeEditingSeconds: 0,
    lastKeystrokeTime: null
  },
  currentVerifiedFile: null,
  verifiedSubmissionData: null,
  termLayout: 'side', // 'side' (Default: Side-by-side vertical split) | 'bottom'
  appMode: 'exam', // 'exam' | 'task' | 'activity'
  examSessionActive: false, // Strictly true only when in an active, unsubmitted exam session
  workspaceSessionActive: false, // True during an active IDE workspace session (Exam, Task or Activity)
  isInternalModalOpen: false,
  availableUpdate: null,
  isUpdating: false,
  executionError: '',
  editorErrorLine: null,
  runtimeErrorLocation: null,
  setupTipInterval: null,
  setupTipIndex: 0
};

// DOM Elements
const DOM = {
  // Views
  viewLobby: document.getElementById('view-lobby'),
  viewCountdown: document.getElementById('view-countdown'),
  viewIde: document.getElementById('view-ide'),

  // Mode Selection (Lobby)
  modeCardExam: document.getElementById('mode-card-exam'),
  modeCardTask: document.getElementById('mode-card-task'),
  modeCardActivity: document.getElementById('mode-card-activity'),
  startBtnTitle: document.getElementById('start-btn-title'),
  startBtnSubtitle: document.getElementById('start-btn-subtitle'),
  lobbyRulesTitle: document.getElementById('lobby-rules-title'),
  lobbyRulesList: document.getElementById('lobby-rules-list'),
  btnVerifyTaskLobby: document.getElementById('btn-verify-task-lobby'),

  // Lobby & Validation
  lobbyValidationBanner: document.getElementById('lobby-validation-banner'),
  lobbyValidationText: document.getElementById('lobby-validation-text'),
  lobbyUpdateBanner: document.getElementById('lobby-update-banner'),
  updateBannerTitle: document.getElementById('update-banner-title'),
  updateBannerDesc: document.getElementById('update-banner-desc'),
  btnUpdateViewNotes: document.getElementById('btn-update-view-notes'),
  btnUpdateNow: document.getElementById('btn-update-now'),
  btnUpdateDismiss: document.getElementById('btn-update-dismiss'),
  updateProgressContainer: document.getElementById('update-progress-container'),
  updateProgressFill: document.getElementById('update-progress-fill'),
  updateProgressText: document.getElementById('update-progress-text'),
  updateProgressDetail: document.getElementById('update-progress-detail'),
  btnCheckUpdatesLobby: document.getElementById('btn-check-updates-lobby'),
  modalReleaseNotes: document.getElementById('modal-release-notes'),
  modalReleaseNotesTitle: document.getElementById('modal-release-notes-title'),
  modalReleaseNotesBody: document.getElementById('modal-release-notes-body'),
  btnCloseReleaseNotes: document.getElementById('btn-close-release-notes'),
  btnModalInstallUpdate: document.getElementById('btn-modal-install-update'),
  studentNameInput: document.getElementById('student-name'),
  studentIdInput: document.getElementById('student-id'),
  examSubjectInput: document.getElementById('exam-subject'),
  btnLobbyOpenFolder: document.getElementById('btn-lobby-open-folder'),
  btnLobbyNewProject: document.getElementById('btn-lobby-new-project'),
  workspaceSelectionStatus: document.getElementById('workspace-selection-status'),
  lobbyContinueCard: document.getElementById('lobby-continue-card'),
  continueModeBadge: document.getElementById('continue-mode-badge'),
  continueTimeLabel: document.getElementById('continue-time-label'),
  continueSubjectTitle: document.getElementById('continue-subject-title'),
  continueFileLabel: document.getElementById('continue-file-label'),
  btnContinueLastSession: document.getElementById('btn-continue-last-session'),
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
  btnHelpLobby: document.getElementById('btn-help-lobby'),

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
  btnRebuildEnvironment: document.getElementById('btn-rebuild-environment'),
  btnFinishAutoInstaller: document.getElementById('btn-finish-auto-installer'),
  setupErrorPanel: document.getElementById('setup-error-panel'),
  setupErrorTitle: document.getElementById('setup-error-title'),
  setupErrorCode: document.getElementById('setup-error-code'),
  setupErrorSummary: document.getElementById('setup-error-summary'),
  setupErrorActions: document.getElementById('setup-error-actions'),
  setupErrorDetail: document.getElementById('setup-error-detail'),
  setupInsightTitle: document.getElementById('setup-insight-title'),
  setupInsightCopy: document.getElementById('setup-insight-copy'),

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
  btnSubmitTask: document.getElementById('btn-submit-task'),
  btnVerifySubmissionIde: document.getElementById('btn-verify-submission-ide'),
  btnTeacherUnlock: document.getElementById('btn-teacher-unlock'),
  navBreadcrumbs: document.getElementById('nav-breadcrumbs'),
  crumbCurrentFile: document.getElementById('crumb-current-file'),

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
  btnImportAssets: document.getElementById('btn-import-assets'),
  btnRefreshFiles: document.getElementById('btn-refresh-files'),
  explorerDropHint: document.getElementById('explorer-drop-hint'),

  // Editor
  editorTabsBar: document.getElementById('editor-tabs-bar'),
  editorEmptyState: document.getElementById('editor-empty-state'),
  btnEmptyNewFile: document.getElementById('btn-empty-new-file'),
  btnEmptyOpenFolder: document.getElementById('btn-empty-open-folder'),
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
  helpSearch: document.getElementById('help-search'),
  helpTopics: document.getElementById('help-topics'),
  helpEmpty: document.getElementById('help-empty'),
  modalRuntimeError: document.getElementById('modal-runtime-error'),
  runtimeErrorTitle: document.getElementById('runtime-error-title'),
  runtimeErrorExplanation: document.getElementById('runtime-error-explanation'),
  runtimeErrorActions: document.getElementById('runtime-error-actions'),
  runtimeErrorRaw: document.getElementById('runtime-error-raw'),
  runtimeErrorLocation: document.getElementById('runtime-error-location'),
  runtimeErrorLocationLabel: document.getElementById('runtime-error-location-label'),
  btnRuntimeErrorLine: document.getElementById('btn-runtime-error-line'),
  btnCloseRuntimeError: document.getElementById('btn-close-runtime-error'),
  btnRuntimeErrorHelp: document.getElementById('btn-runtime-error-help'),

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

  // Modal de Entrega de Tarea Certificada
  modalTaskSubmit: document.getElementById('modal-task-submit'),
  taskSubmitTotalTime: document.getElementById('task-submit-total-time'),
  taskSubmitKeystrokes: document.getElementById('task-submit-keystrokes'),
  taskSubmitCharacters: document.getElementById('task-submit-characters'),
  taskSubmitPastes: document.getElementById('task-submit-pastes'),
  taskSubmitRuns: document.getElementById('task-submit-runs'),
  taskSubmitIncidents: document.getElementById('task-submit-incidents'),
  btnCancelTaskSubmit: document.getElementById('btn-cancel-task-submit'),
  btnConfirmTaskSubmit: document.getElementById('btn-confirm-task-submit'),

  // Modal Verificador Forense Docente
  modalVerifySubmission: document.getElementById('modal-verify-submission'),
  verifierStatusBadge: document.getElementById('verifier-status-badge'),
  verifierDropzone: document.getElementById('verifier-dropzone'),
  btnSelectSubmissionFile: document.getElementById('btn-select-submission-file'),
  verifierResultContainer: document.getElementById('verifier-result-container'),
  verifStudentName: document.getElementById('verif-student-name'),
  verifStudentId: document.getElementById('verif-student-id'),
  verifSubject: document.getElementById('verif-subject'),
  verifDate: document.getElementById('verif-date'),
  verifOs: document.getElementById('verif-os'),
  verifHmacBadge: document.getElementById('verif-hmac-badge'),
  verifHmacText: document.getElementById('verif-hmac-text'),
  verifKeystrokes: document.getElementById('verif-keystrokes'),
  verifCharacters: document.getElementById('verif-characters'),
  verifPastes: document.getElementById('verif-pastes'),
  verifPastesSub: document.getElementById('verif-pastes-sub'),
  verifEditingTime: document.getElementById('verif-editing-time'),
  verifRuns: document.getElementById('verif-runs'),
  verifIncidents: document.getElementById('verif-incidents'),
  verifFilesTabs: document.getElementById('verif-files-tabs'),
  verifCodeDisplay: document.getElementById('verif-code-display'),
  verifCodeContent: document.getElementById('verif-code-content'),
  btnExtractSubmissionCode: document.getElementById('btn-extract-submission-code'),
  btnRunSubmissionCode: document.getElementById('btn-run-submission-code'),
  btnCloseVerifySubmission: document.getElementById('btn-close-verify-submission'),

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
        DOM.wifiStatusText.textContent = 'Red sin verificar';
        return;
      }
      if (status.disabled) {
        DOM.navWifiBadge.className = 'nav-wifi-badge wifi-off';
        DOM.wifiStatusText.textContent = 'Red desconectada';
      } else {
        DOM.navWifiBadge.className = 'nav-wifi-badge wifi-on';
        DOM.wifiStatusText.textContent = state.appMode === 'activity' ? 'Red activa' : 'Red activa';

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
  // --- Fundamentales ---
  pygame:    { icon: '🎮', name: 'Pygame',               cat: 'games'    },
  numpy:     { icon: '🔢', name: 'NumPy',                cat: 'math'     },
  matplotlib:{ icon: '📊', name: 'Matplotlib',           cat: 'data'     },
  pandas:    { icon: '🐼', name: 'Pandas',               cat: 'data'     },
  requests:  { icon: '🌐', name: 'Requests',             cat: 'net'      },
  PIL:       { icon: '🖼️', name: 'Pillow (PIL)',         cat: 'games'    },
  scipy:     { icon: '🔬', name: 'SciPy',                cat: 'math'     },
  seaborn:   { icon: '📈', name: 'Seaborn',              cat: 'data'     },
  openpyxl:  { icon: '📑', name: 'OpenPyXL (Excel)',     cat: 'data'     },
  sympy:     { icon: '📐', name: 'SymPy (Álgebra)',      cat: 'math'     },
  colorama:  { icon: '🎨', name: 'Colorama (Consola)',   cat: 'net'      },
  // --- Hardware: Arduino / ESP32 / Microcontroladores ---
  serial:    { icon: '🔌', name: 'PySerial (Arduino / ESP32)',  cat: 'hardware' },
  esptool:   { icon: '⚡', name: 'ESPTool (Flash ESP32/ESP8266)', cat: 'hardware' },
  pyfirmata2:{ icon: '🤖', name: 'PyFirmata2 (Arduino Firmata)', cat: 'hardware' },
  usb:       { icon: '🔗', name: 'PyUSB (USB directo)',  cat: 'hardware' },
  // --- Raspberry Pi / SBC ---
  smbus2:    { icon: '🍓', name: 'SMBus2 (I2C / RPi)',  cat: 'hardware' },
  gpiozero:  { icon: '🍓', name: 'GPIOZero (RPi GPIO)', cat: 'hardware' },
  board:     { icon: '🔧', name: 'Adafruit Blinka (CircuitPython)', cat: 'hardware' },
  // --- Machine Learning y Visión ---
  sklearn:   { icon: '🧠', name: 'Scikit-learn (ML)',   cat: 'math'     },
  cv2:       { icon: '👁️', name: 'OpenCV (Visión)',     cat: 'math'     },
  // --- Web y Redes ---
  websockets:{ icon: '🔄', name: 'WebSockets (IoT)',    cat: 'net'      },
  flask:     { icon: '🍶', name: 'Flask (Servidor Web)', cat: 'net'     },
  httpx:     { icon: '🌐', name: 'HTTPX (HTTP moderno)', cat: 'net'     },
  // --- Utilidades educativas ---
  tqdm:      { icon: '⏳', name: 'TQDM (Progreso)',     cat: 'net'      },
  rich:      { icon: '✨', name: 'Rich (Terminal bonita)', cat: 'net'   },
  qrcode:    { icon: '📱', name: 'QRCode (Códigos QR)', cat: 'data'    },
  cryptography:{ icon: '🔒', name: 'Cryptography (Cifrado)', cat: 'net' },
  pydantic:  { icon: '📋', name: 'Pydantic (Validación)', cat: 'data'  },
  // --- Sistema (built-in) ---
  sqlite3:   { icon: '🗄️', name: 'SQLite3 (SQL)',       cat: 'data'     },
  tkinter:   { icon: '🖥️', name: 'Tkinter (GUI)',       cat: 'games'    },
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

      // Update Lobby package count from the verified runtime manifest.
      const totalRecommended = data.essentialKeys ? data.essentialKeys.length : 25;
      const missingCount = data.missingCount || 0;
      const installedCount = Math.max(0, totalRecommended - missingCount);

      if (missingCount === 0) {
        DOM.packagesCountLabel.textContent = `${totalRecommended}/${totalRecommended} Listas (NumPy, PySerial, ESP32, RPi, ML...)`;
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
  if (!window.electronAPI?.installPackage) {
    appendPipLog(`[Vista previa] ${pkgName} se instalaría en el entorno privado de codeGO.\n`);
    return;
  }
  const normalized = String(pkgName || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:==[a-zA-Z0-9.+_-]+)?$/.test(normalized)) {
    appendPipLog('Escribe un nombre válido, por ejemplo: flask o flask==3.1.3.\n');
    DOM.customPkgInput?.focus();
    return;
  }
  DOM.btnInstallCustomPkg.disabled = true;
  DOM.customPkgInput.disabled = true;
  DOM.btnInstallCustomPkg.textContent = 'Instalando…';
  appendPipLog(`\nPreparando ${normalized}…\n`);
  try {
    const result = await window.electronAPI.installPackage(normalized);
    if (result.success) {
      appendPipLog(`\n${normalized} quedó disponible en codeGO. ✓\n`);
      await loadEnvironmentDiagnostics();
    } else {
      appendPipLog(`\nNo se pudo instalar ${normalized}: ${result.error || `pip terminó con código ${result.code}`}\n`);
    }
  } finally {
    DOM.btnInstallCustomPkg.disabled = false;
    DOM.customPkgInput.disabled = false;
    DOM.btnInstallCustomPkg.textContent = 'Instalar';
  }
}

async function installAllRecommendedPackages() {
  if (!window.electronAPI?.installRecommendedPackages) {
    appendPipLog('[Vista previa] Las herramientas incluidas están listas.\n');
    return;
  }
  DOM.btnInstallAllRecommended.disabled = true;
  DOM.btnInstallAllRecommended.textContent = 'Verificando…';
  appendPipLog('\nComprobando las herramientas incluidas…\n');
  try {
    const result = await window.electronAPI.installRecommendedPackages();
    appendPipLog(result.success
      ? '\nLas herramientas incluidas están listas. ✓\n'
      : `\nNo se pudo completar la comprobación: ${result.error || `código ${result.code}`}\n`);
    await loadEnvironmentDiagnostics();
  } finally {
    DOM.btnInstallAllRecommended.disabled = false;
    DOM.btnInstallAllRecommended.textContent = 'Verificar herramientas incluidas';
  }
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
const SETUP_INSIGHTS = [
  ['Tus proyectos siguen siendo tuyos', 'codeGO guarda tu trabajo en este equipo y no reemplaza la configuración de Python que ya tengas.'],
  ['Una terminal fácil de entender', 'Cuando Python pida un dato, podrás escribirlo junto al mensaje del programa, en la misma consola.'],
  ['El mismo entorno para todo el grupo', 'Las herramientas incluidas ayudan a que una práctica se comporte igual en cada equipo compatible.'],
  ['Ventanas gráficas siempre a la vista', 'codeGO acompaña las ventanas de Pygame y otras interfaces para que no tengas que buscarlas.'],
  ['Errores que ayudan a aprender', 'Si algo falla, codeGO explica la causa, indica la línea y propone pasos claros para corregirla.'],
  ['Preparado para proyectos físicos', 'El entorno incluye herramientas para comunicarte con Arduino, ESP32 y otros dispositivos seriales.']
];

function rotateSetupInsight() {
  if (!DOM.setupInsightTitle || !DOM.setupInsightCopy) return;
  const [title, copy] = SETUP_INSIGHTS[state.setupTipIndex % SETUP_INSIGHTS.length];
  DOM.setupInsightTitle.textContent = title;
  DOM.setupInsightCopy.textContent = copy;
  state.setupTipIndex += 1;
}

function startSetupInsights() {
  clearInterval(state.setupTipInterval);
  state.setupTipIndex = 0;
  rotateSetupInsight();
  state.setupTipInterval = setInterval(rotateSetupInsight, 6000);
}

function stopSetupInsights() {
  clearInterval(state.setupTipInterval);
  state.setupTipInterval = null;
}

function setupProgressLabel(step) {
  return {
    1: 'Comprobando la compatibilidad del equipo…',
    2: 'Preparando el motor de Python incluido…',
    3: 'Configurando las herramientas educativas…',
    4: 'Realizando la comprobación final…'
  }[step] || 'Preparando codeGO…';
}

async function startAutoRepairProcess({ strategy = 'resume' } = {}) {
  state.isInternalModalOpen = true;
  state.environmentSetupRequired = true;
  state.environmentReady = false;
  document.body.classList.add('environment-setup-required');
  DOM.modalAutoInstaller.classList.remove('hidden');
  DOM.btnFinishAutoInstaller.classList.add('hidden');
  DOM.btnCloseAutoInstaller.classList.add('hidden');
  DOM.btnRebuildEnvironment?.classList.add('hidden');
  DOM.setupErrorPanel?.classList.add('hidden');
  DOM.installerProgressBar.style.width = '5%';
  DOM.installerPercentLabel.textContent = '5%';
  DOM.installerCurrentStepLabel.textContent = 'Comprobando la compatibilidad del equipo…';
  DOM.installerTerminalOutput.innerHTML = '<span class="pip-term-hint">Comenzando la preparación…</span>\n';
  startSetupInsights();

  resetAutoInstallerSteps();

  if (window.electronAPI?.prepareEnvironment) {
    try {
      const result = await window.electronAPI.prepareEnvironment({ strategy });
      if (!result.success) {
        DOM.btnCloseAutoInstaller.textContent = 'Reintentar preparación';
        DOM.btnCloseAutoInstaller.classList.remove('hidden');
        DOM.btnRebuildEnvironment?.classList.remove('hidden');
      }
    } catch (e) {
      appendInstallerLog(`\nError en auto-instalador: ${e.message}\n`);
      DOM.installerCurrentStepLabel.textContent = 'No se completó la preparación';
      DOM.btnCloseAutoInstaller.textContent = 'Reintentar preparación';
      DOM.btnCloseAutoInstaller.classList.remove('hidden');
      DOM.btnRebuildEnvironment?.classList.remove('hidden');
    }
  } else {
    // Simulator fallback
    simulateAutoInstaller();
  }
}

function showSetupDiagnostic(diagnostic, fallbackError = '') {
  const safe = diagnostic || {
    code: 'CG-SETUP-900',
    title: 'No se pudo terminar la preparación',
    summary: 'codeGO mantuvo bloqueado el editor para evitar un entorno incompleto.',
    actions: ['Pulsa Reintentar preparación.'],
    detail: fallbackError
  };
  DOM.setupErrorTitle.textContent = safe.title;
  DOM.setupErrorCode.textContent = safe.code;
  DOM.setupErrorSummary.textContent = safe.summary;
  DOM.setupErrorActions.replaceChildren(...(safe.actions || []).map(action => {
    const item = document.createElement('li');
    item.textContent = action;
    return item;
  }));
  DOM.setupErrorDetail.textContent = `${safe.code}\n${safe.detail || fallbackError || 'Sin detalle adicional.'}`;
  DOM.setupErrorPanel.classList.remove('hidden');
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
      DOM.installerCurrentStepLabel.textContent = 'codeGO está listo para comenzar';
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
  checkAndDisplayLastSession();

  // Asegurar siempre pantalla completa al iniciar
  if (window.electronAPI && window.electronAPI.setFullScreen) {
    try {
      await window.electronAPI.setFullScreen(true);
    } catch (_) {}
  }

  if (window.electronAPI?.getEnvironmentStatus) {
    const status = await window.electronAPI.getEnvironmentStatus();
    state.environmentReady = status.ready === true;
    if (!state.environmentReady) {
      await startAutoRepairProcess();
      return;
    }
  } else {
    state.environmentReady = true;
  }

  await loadEnvironmentDiagnostics();
  startWifiMonitoring();
  checkUpdatesSilently();
}

function checkAndDisplayLastSession() {
  try {
    const raw = localStorage.getItem('codego_last_session');
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session) return;

    if (session.studentName && DOM.studentNameInput && !DOM.studentNameInput.value) {
      DOM.studentNameInput.value = session.studentName;
    }
    if (session.studentId && DOM.studentIdInput && !DOM.studentIdInput.value) {
      DOM.studentIdInput.value = session.studentId;
    }
    if (session.examSubject && DOM.examSubjectInput) {
      DOM.examSubjectInput.value = session.examSubject;
    }

    if (DOM.lobbyContinueCard && session.workspacePath) {
      const modeLabel = session.appMode === 'task'
        ? 'TAREA EN CURSO'
        : (session.appMode === 'activity' ? 'Actividad en curso' : 'Examen en curso');
      if (DOM.continueModeBadge) DOM.continueModeBadge.textContent = modeLabel;
      if (DOM.continueTimeLabel) DOM.continueTimeLabel.textContent = `Guardado: ${session.lastSavedDate || 'Recientemente'}`;
      if (DOM.continueSubjectTitle) DOM.continueSubjectTitle.textContent = `Materia: ${session.examSubject || 'Programación en Python'}`;
      if (DOM.continueFileLabel) DOM.continueFileLabel.textContent = `Proyecto anterior: ${session.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto'}`;
      DOM.lobbyContinueCard.classList.remove('hidden');

      if (DOM.btnContinueLastSession) {
        DOM.btnContinueLastSession.onclick = async () => {
          setSessionMode(session.appMode || 'activity');
          const selected = await chooseWorkspaceFolder();
          if (selected) await handleStartExamClick();
        };
      }
    }
  } catch (_) {}
}

// ==============================================================
// 6.1 SESSION MODE ENGINE (EXAM VS ACTIVITY)
// ==============================================================
function setSessionMode(mode) {
  state.appMode = mode;
  document.body.classList.remove('mode-exam-active', 'mode-task-active', 'mode-activity-active');
  if (DOM.modeCardExam) DOM.modeCardExam.classList.toggle('active', mode === 'exam');
  if (DOM.modeCardTask) DOM.modeCardTask.classList.toggle('active', mode === 'task');
  if (DOM.modeCardActivity) DOM.modeCardActivity.classList.toggle('active', mode === 'activity');

  if (mode === 'exam') {
    document.body.classList.add('mode-exam-active');
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'Iniciar examen';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Modo seguro';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.textContent = 'Durante el examen';
    if (DOM.lobbyRulesList) {
      DOM.lobbyRulesList.innerHTML = `
        <li><strong>Carpeta definida:</strong> La sesión utiliza únicamente la carpeta elegida antes de comenzar.</li>
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
    if (DOM.btnSubmitTask) {
      DOM.btnSubmitTask.classList.add('hidden');
      DOM.btnSubmitTask.style.display = 'none';
      DOM.btnSubmitTask.disabled = true;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.add('hidden');
      DOM.activityActionsToolbar.style.display = 'none';
    }
  } else if (mode === 'task') {
    document.body.classList.add('mode-task-active');
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'INICIAR TAREA';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Modo certificado anti-copia';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.textContent = 'Durante la tarea certificada';
    if (DOM.lobbyRulesList) {
      DOM.lobbyRulesList.innerHTML = `
        <li><strong>Registro de autoría:</strong> El código debe escribirse en codeGO para conservar un historial claro del trabajo.</li>
        <li><strong>Supervisión y Modo Seguro:</strong> Bloquea la apertura de otras aplicaciones o navegadores con alarma de 12s.</li>
        <li><strong>Telemetría de Pulsaciones:</strong> Se auditan teclas pulsadas, tiempo de edición activo y pruebas realizadas.</li>
        <li><strong>Certificado Criptográfico .codego:</strong> Genera un contenedor sellado con firma digital HMAC-SHA256 para el docente.</li>
      `;
    }
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.classList.add('hidden');
      DOM.btnFinishExam.style.display = 'none';
      DOM.btnFinishExam.disabled = true;
    }
    if (DOM.btnSubmitTask) {
      DOM.btnSubmitTask.classList.remove('hidden');
      DOM.btnSubmitTask.style.display = 'inline-flex';
      DOM.btnSubmitTask.disabled = false;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.add('hidden');
      DOM.activityActionsToolbar.style.display = 'none';
    }
  } else {
    document.body.classList.add('mode-activity-active');
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'Iniciar actividad';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Modo libre';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.textContent = 'Durante la actividad';
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
    if (DOM.btnSubmitTask) {
      DOM.btnSubmitTask.classList.add('hidden');
      DOM.btnSubmitTask.style.display = 'none';
      DOM.btnSubmitTask.disabled = true;
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
  if (DOM.modeCardTask) {
    DOM.modeCardTask.addEventListener('click', () => setSessionMode('task'));
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
      return;
    }
    if (state.appMode === 'task' && !e.target.closest('#teacher-pin-input, #custom-pkg-input')) {
      e.preventDefault();
      state.taskTelemetry.externalPasteAttempts++;
      showPasteBlockedToast();
      return;
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
  DOM.btnLobbyOpenFolder?.addEventListener('click', chooseWorkspaceFolder);
  DOM.btnLobbyNewProject?.addEventListener('click', createBlankWorkspace);

  // Auto-Repair and Auto-Installer Triggers
  if (DOM.btnAutoRepairAll) {
    DOM.btnAutoRepairAll.addEventListener('click', startAutoRepairProcess);
  }
  if (DOM.btnCloseAutoInstaller) {
    DOM.btnCloseAutoInstaller.addEventListener('click', () => startAutoRepairProcess({ strategy: 'resume' }));
  }
  if (DOM.btnRebuildEnvironment) {
    DOM.btnRebuildEnvironment.addEventListener('click', () => startAutoRepairProcess({ strategy: 'rebuild' }));
  }
  if (DOM.btnFinishAutoInstaller) {
    DOM.btnFinishAutoInstaller.addEventListener('click', async () => {
      DOM.modalAutoInstaller.classList.add('hidden');
      state.isInternalModalOpen = false;
      state.environmentSetupRequired = false;
      state.environmentReady = true;
      stopSetupInsights();
      document.body.classList.remove('environment-setup-required');
      await loadEnvironmentDiagnostics();
      startWifiMonitoring();
      checkUpdatesSilently();
    });
  }

  const openHelpCenter = () => {
    DOM.modalShortcuts.classList.remove('hidden');
    requestAnimationFrame(() => DOM.helpSearch?.focus());
  };
  DOM.btnHelpLobby?.addEventListener('click', openHelpCenter);
  DOM.helpSearch?.addEventListener('input', () => {
    const query = DOM.helpSearch.value.trim().toLocaleLowerCase('es');
    let visible = 0;
    DOM.helpTopics.querySelectorAll('.help-topic').forEach(topic => {
      const match = !query || topic.textContent.toLocaleLowerCase('es').includes(query);
      topic.hidden = !match;
      if (match) visible += 1;
    });
    DOM.helpEmpty.classList.toggle('hidden', visible > 0);
  });
  DOM.btnCloseRuntimeError?.addEventListener('click', () => DOM.modalRuntimeError.classList.add('hidden'));
  DOM.btnRuntimeErrorLine?.addEventListener('click', () => {
    if (state.runtimeErrorLocation?.line) goToEditorLine(state.runtimeErrorLocation.line);
  });
  DOM.btnRuntimeErrorHelp?.addEventListener('click', () => {
    DOM.modalRuntimeError.classList.add('hidden');
    openHelpCenter();
  });
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

  // In-App Auto-Updater Event Listeners
  if (DOM.btnCheckUpdatesLobby) {
    DOM.btnCheckUpdatesLobby.addEventListener('click', handleManualCheckUpdates);
  }
  if (DOM.btnUpdateViewNotes) {
    DOM.btnUpdateViewNotes.addEventListener('click', handleShowReleaseNotes);
  }
  if (DOM.btnCloseReleaseNotes) {
    DOM.btnCloseReleaseNotes.addEventListener('click', handleCloseReleaseNotes);
  }
  if (DOM.btnUpdateDismiss) {
    DOM.btnUpdateDismiss.addEventListener('click', () => {
      if (DOM.lobbyUpdateBanner) DOM.lobbyUpdateBanner.classList.add('hidden');
    });
  }
  if (DOM.btnUpdateNow) {
    DOM.btnUpdateNow.addEventListener('click', handleStartUpdate);
  }
  if (DOM.btnModalInstallUpdate) {
    DOM.btnModalInstallUpdate.addEventListener('click', handleStartUpdate);
  }

  // Package Manager Modals & Triggers
  DOM.btnOpenPkgManagerLobby.addEventListener('click', () => {
    state.isInternalModalOpen = true;
    DOM.modalPackageManager.classList.remove('hidden');
    renderPackagesGrid(state.environmentInfo?.packages, state.activePkgCategory);
  });
  DOM.btnOpenPkgManagerIde.addEventListener('click', () => {
    state.isInternalModalOpen = true;
    DOM.modalPackageManager.classList.remove('hidden');
    renderPackagesGrid(state.environmentInfo?.packages, state.activePkgCategory);
  });
  DOM.btnClosePkgManager.addEventListener('click', () => {
    DOM.modalPackageManager.classList.add('hidden');
    state.isInternalModalOpen = false;
  });
  DOM.modalPackageManager.addEventListener('click', (e) => {
    if (e.target === DOM.modalPackageManager) {
      DOM.modalPackageManager.classList.add('hidden');
      state.isInternalModalOpen = false;
    }
  });

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
  DOM.btnHelpShortcuts.addEventListener('click', openHelpCenter);
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
      return;
    }
    if (state.appMode === 'task') {
      e.preventDefault();
      state.taskTelemetry.externalPasteAttempts++;
      showPasteBlockedToast();
      return;
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
  DOM.btnEmptyNewFile?.addEventListener('click', promptNewFile);
  DOM.btnEmptyOpenFolder?.addEventListener('click', handleOpenWorkspaceFolder);
  DOM.btnNewFolder.addEventListener('click', promptNewFolder);
  DOM.btnImportAssets?.addEventListener('click', async () => {
    if (!window.electronAPI?.importAssets) return;
    const result = await window.electronAPI.importAssets();
    if (result.success) {
      await loadWorkspaceFiles();
      appendTerminalOutput(`Recursos agregados:\n${result.imported.map(file => `  ${file}`).join('\n')}\n`, 'system');
    } else if (!result.canceled) appendTerminalOutput(`No se pudieron agregar recursos: ${result.error}\n`, 'stderr');
  });
  DOM.btnRefreshFiles.addEventListener('click', loadWorkspaceFiles);
  DOM.fileTreeContainer?.addEventListener('dragover', event => {
    if (!state.draggedTreeItem || event.target.closest('.tree-folder')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    DOM.fileTreeContainer.classList.add('tree-root-drop-target');
  });
  DOM.fileTreeContainer?.addEventListener('dragleave', event => {
    if (!DOM.fileTreeContainer.contains(event.relatedTarget)) DOM.fileTreeContainer.classList.remove('tree-root-drop-target');
  });
  DOM.fileTreeContainer?.addEventListener('drop', async event => {
    if (event.target.closest('.tree-folder')) return;
    event.preventDefault();
    DOM.fileTreeContainer.classList.remove('tree-root-drop-target');
    const sourcePath = state.draggedTreeItem?.path || event.dataTransfer.getData('text/plain');
    if (sourcePath) await moveWorkspaceItem(sourcePath, '');
  });

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

  // Task Finish / Submission
  if (DOM.btnSubmitTask) {
    DOM.btnSubmitTask.addEventListener('click', () => {
      if (state.isTaskSubmitted) {
        DOM.modalSubmissionSuccess.classList.remove('hidden');
        return;
      }
      openSubmitTaskModal();
    });
  }
  if (DOM.btnCancelTaskSubmit) {
    DOM.btnCancelTaskSubmit.addEventListener('click', () => DOM.modalTaskSubmit.classList.add('hidden'));
  }
  if (DOM.btnConfirmTaskSubmit) {
    DOM.btnConfirmTaskSubmit.addEventListener('click', handleTaskFinalSubmit);
  }

  // Teacher Forensic Verifier
  if (DOM.btnVerifyTaskLobby) {
    DOM.btnVerifyTaskLobby.addEventListener('click', openVerifySubmissionModal);
  }
  if (DOM.btnVerifySubmissionIde) {
    DOM.btnVerifySubmissionIde.addEventListener('click', openVerifySubmissionModal);
  }
  if (DOM.btnCloseVerifySubmission) {
    DOM.btnCloseVerifySubmission.addEventListener('click', () => DOM.modalVerifySubmission.classList.add('hidden'));
  }
  if (DOM.btnSelectSubmissionFile) {
    DOM.btnSelectSubmissionFile.addEventListener('click', handleSelectSubmissionFile);
  }
  if (DOM.btnExtractSubmissionCode) {
    DOM.btnExtractSubmissionCode.addEventListener('click', handleExtractSubmissionCode);
  }
  if (DOM.btnRunSubmissionCode) {
    DOM.btnRunSubmissionCode.addEventListener('click', handleRunSubmissionCode);
  }
  setupVerifierDragAndDrop();

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
    if (state.examSessionActive && (state.appMode === 'exam' || state.appMode === 'task') && (['AudioVolumeMute', 'VolumeMute', 'AudioVolumeDown', 'VolumeDown'].includes(e.key) || e.code === 'AudioVolumeMute' || e.code === 'AudioVolumeDown')) {
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && state.workspaceSessionActive) {
      e.preventDefault();
      clearTerminal();
      DOM.terminalOutput?.focus();
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

  // Close any internal open modals with Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.modalPackageManager && !DOM.modalPackageManager.classList.contains('hidden')) {
        DOM.modalPackageManager.classList.add('hidden');
        state.isInternalModalOpen = false;
      }
      if (DOM.modalAutoInstaller && !DOM.modalAutoInstaller.classList.contains('hidden')) {
        if (!state.environmentSetupRequired) {
          DOM.modalAutoInstaller.classList.add('hidden');
          state.isInternalModalOpen = false;
        }
      }
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
    DOM.installerCurrentStepLabel.textContent = setupProgressLabel(data.step);

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
      DOM.setupErrorPanel?.classList.add('hidden');
      DOM.installerProgressBar.style.width = '100%';
      DOM.installerPercentLabel.textContent = '100%';
      DOM.installerCurrentStepLabel.textContent = 'codeGO está listo para comenzar';
      updateAutoInstallerStep(4, DOM.stepItemLibs, DOM.stepBadgeLibs, 5);
      DOM.btnCloseAutoInstaller.classList.add('hidden');
      DOM.btnRebuildEnvironment?.classList.add('hidden');
      DOM.btnFinishAutoInstaller.classList.remove('hidden');
      state.environmentReady = true;
      stopSetupInsights();
      await loadEnvironmentDiagnostics();
    } else {
      state.environmentReady = false;
      DOM.installerCurrentStepLabel.textContent = result.diagnostic?.title || 'No se completó la preparación';
      appendInstallerLog(`\n>>> Error en el proceso: ${result.error}\n`);
      showSetupDiagnostic(result.diagnostic, result.error);
      DOM.btnCloseAutoInstaller.textContent = 'Reintentar preparación';
      DOM.btnCloseAutoInstaller.classList.remove('hidden');
      DOM.btnRebuildEnvironment?.classList.remove('hidden');
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
      appendTerminalOutput(`\n${data?.message || 'La ventana gráfica de tu programa está abierta.'}\n`, 'system');
    });
  }

  // Python real-time output streams
  window.electronAPI.onPythonStdout((chunk) => {
    appendTerminalOutput(chunk, 'stdout');

  });

  window.electronAPI.onPythonStderr((chunk) => {
    state.executionError = (state.executionError + chunk).slice(-24000);
    appendTerminalOutput(chunk, 'stderr');
  });

  window.electronAPI.onPythonFinished((result) => {
    handleExecutionFinished(result);
  });

  window.electronAPI.onPythonError((err) => {
    state.executionError = String(err);
    appendTerminalOutput(`Error de ejecución: ${err}`, 'stderr');
    handleExecutionFinished({ exitCode: 1, duration: 0 });
  });
}

// ==============================================================
// 8. EXAM & ACTIVITY FLOW: START & TRANSITION
// ==============================================================
function setWorkspaceSelection(result) {
  if (!result?.success) return false;
  state.workspaceSelected = true;
  state.workspacePath = result.workspacePath || '';
  state.workspaceName = result.workspaceName || state.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto';
  if (DOM.workspaceSelectionStatus) {
    DOM.workspaceSelectionStatus.textContent = `Seleccionado: ${state.workspaceName}`;
    DOM.workspaceSelectionStatus.title = state.workspacePath;
    DOM.workspaceSelectionStatus.classList.add('selected');
  }
  if (DOM.lobbyValidationBanner) DOM.lobbyValidationBanner.classList.add('hidden');
  return true;
}

async function chooseWorkspaceFolder() {
  if (!window.electronAPI?.openFolderDialog) {
    alert('La selección de carpetas está disponible en la aplicación de escritorio.');
    return null;
  }
  const result = await window.electronAPI.openFolderDialog();
  return setWorkspaceSelection(result) ? result : null;
}

async function createBlankWorkspace() {
  const projectName = await requestName('Nombre del proyecto', 'Mi proyecto');
  if (!projectName) return null;
  if (!window.electronAPI?.createProjectDialog) {
    alert('La creación de proyectos está disponible en la aplicación de escritorio.');
    return null;
  }
  const result = await window.electronAPI.createProjectDialog(projectName);
  return setWorkspaceSelection(result) ? result : null;
}

async function handleStartExamClick() {
  if (!state.environmentReady && window.electronAPI?.getEnvironmentStatus) {
    await startAutoRepairProcess();
    return;
  }
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

  if (!state.workspaceSelected) {
    if (DOM.lobbyValidationBanner && DOM.lobbyValidationText) {
      DOM.lobbyValidationText.textContent = 'Elige una carpeta existente o crea un proyecto en blanco para continuar.';
      DOM.lobbyValidationBanner.classList.remove('hidden');
    }
    DOM.btnLobbyOpenFolder?.focus();
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
  } else if (state.appMode === 'task') {
    // Task Mode: start with kiosk lockdown and anti-cheat tracking
    if (window.electronAPI && window.electronAPI.startKiosk) {
      const result = await window.electronAPI.startKiosk({ ...state.student, mode: 'task' });
      if (!result.success) { alert(result.error); return; }
    }
    enterIdeWorkspace();
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
  if (DOM.lobbyUpdateBanner) DOM.lobbyUpdateBanner.classList.add('hidden');
  handleCloseReleaseNotes();

  if (state.appMode === 'exam') {
    document.body.classList.remove('mode-activity-active', 'mode-task-active');
    document.body.classList.add('mode-exam-active');
    state.examSessionActive = true; // Security watchdog & kiosk active only in exam mode
    // Mode Exam: Clear & prominent crimson badge, timer visible, finish exam button visible
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-exam';
      DOM.navModeIndicator.title = 'Sesión de Examen Supervisada con Auditoría de Integridad Activa';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = 'Examen supervisado';
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
    if (DOM.btnSubmitTask) {
      DOM.btnSubmitTask.classList.add('hidden');
      DOM.btnSubmitTask.style.display = 'none';
      DOM.btnSubmitTask.disabled = true;
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
  } else if (state.appMode === 'task') {
    document.body.classList.remove('mode-activity-active', 'mode-exam-active');
    document.body.classList.add('mode-task-active');
    state.examSessionActive = true; // Kiosk & watchdog active to prevent opening other programs
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-task';
      DOM.navModeIndicator.title = 'Sesión de Tarea Certificada con Auditoría Forense y Bloqueo Anti-Copia';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = 'Tarea certificada';
    }
    if (DOM.examTimerPill) {
      DOM.examTimerPill.classList.remove('hidden');
      DOM.examTimerPill.style.display = 'inline-flex';
    }
    if (DOM.btnFinishExam) {
      DOM.btnFinishExam.classList.add('hidden');
      DOM.btnFinishExam.style.display = 'none';
      DOM.btnFinishExam.disabled = true;
    }
    if (DOM.btnSubmitTask) {
      DOM.btnSubmitTask.classList.remove('hidden');
      DOM.btnSubmitTask.style.display = 'inline-flex';
      DOM.btnSubmitTask.disabled = false;
    }
    if (DOM.activityActionsToolbar) {
      DOM.activityActionsToolbar.classList.add('hidden');
      DOM.activityActionsToolbar.style.display = 'none';
    }
    if (DOM.sidebarTitleLabel) {
      DOM.sidebarTitleLabel.textContent = 'ESPACIO DE TAREA';
    }
    if (DOM.workspaceHintLabel) {
      DOM.workspaceHintLabel.textContent = 'Entorno de tarea con certificación de autoría';
    }

    state.examStartTime = Date.now();
    state.taskTelemetry.lastKeystrokeTime = Date.now();
    startExamTimer();
  } else {
    document.body.classList.remove('mode-exam-active', 'mode-task-active');
    document.body.classList.add('mode-activity-active');
    state.examSessionActive = false; // Mode Activity has NO anti-cheat monitoring or timer
    // Mode Activity: Blue badge, NO timer, NO finish button (only run button), project toolbar active
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-activity';
      DOM.navModeIndicator.title = 'Modo Práctica Libre: Sin bloqueos, proyectos y carpetas habilitados';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = 'Actividad libre';
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
    if (DOM.btnSubmitTask) {
      DOM.btnSubmitTask.classList.add('hidden');
      DOM.btnSubmitTask.style.display = 'none';
      DOM.btnSubmitTask.disabled = true;
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

function isInternalModalOpen() {
  if (state.isInternalModalOpen) return true;
  const internalModalIds = [
    'modal-package-manager',
    'modal-auto-installer',
    'modal-shortcuts',
    'modal-runtime-error',
    'modal-teacher-unlock',
    'modal-submit-exam',
    'modal-submission-success',
    'modal-task-submit',
    'modal-verify-submission'
  ];
  return internalModalIds.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

// ==============================================================
// 9. ANTI-CHEAT & SECURITY VIOLATION ENGINE
// ==============================================================
function handleSecurityViolation(incidentData = {}) {
  // Trigger during any active workspace session (Exam or Activity) before final submission
  if (!state.workspaceSessionActive || state.isExamSubmitted) {
    return;
  }

  // If any internal modal (Package Manager, Auto Installer, Verifier, etc.) is open, do NOT alarm!
  if (isInternalModalOpen()) {
    console.log('[Supervisión]: Omitiendo aviso porque hay un diálogo interno del entorno abierto.');
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
      updateEditorEmptyState();
    }
  } else {
    state.filesTree = [];
    renderFileTree([]);
    updateEditorEmptyState();
  }
}

function updateEditorEmptyState() {
  const isEmpty = state.openTabs.length === 0;
  DOM.editorEmptyState?.classList.toggle('hidden', !isEmpty);
  DOM.codeTextarea?.classList.toggle('editor-has-no-file', isEmpty);
  DOM.editorHighlighting?.classList.toggle('editor-has-no-file', isEmpty);
  DOM.editorLineNumbers?.classList.toggle('editor-has-no-file', isEmpty);
  if (isEmpty) updateBreadcrumbs('');
}

function updateBreadcrumbs(relativePath) {
  if (!DOM.navBreadcrumbs) return;
  const normalized = (relativePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const fileName = parts.pop() || '';

  let html = `<span class="crumb-root">${escapeHtml(state.workspaceName || 'Proyecto')}</span>`;
  for (const part of parts) {
    html += `<span class="crumb-sep">/</span><span class="crumb-folder">📁 ${escapeHtml(part)}</span>`;
  }
  if (fileName) html += `<span class="crumb-sep">/</span><span class="crumb-file" id="crumb-current-file">${escapeHtml(fileName)}</span>`;
  DOM.navBreadcrumbs.innerHTML = html;
}

function wireTreeDragSource(element, itemPath, itemType) {
  element.draggable = !state.isExamSubmitted;
  element.dataset.path = itemPath;
  element.dataset.itemType = itemType;
  element.addEventListener('dragstart', event => {
    if (state.isExamSubmitted) { event.preventDefault(); return; }
    state.draggedTreeItem = { path: itemPath, type: itemType };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemPath);
    requestAnimationFrame(() => element.classList.add('is-dragging'));
  });
  element.addEventListener('dragend', () => {
    state.draggedTreeItem = null;
    element.classList.remove('is-dragging');
    document.querySelectorAll('.tree-drop-target').forEach(target => target.classList.remove('tree-drop-target'));
    DOM.fileTreeContainer?.classList.remove('tree-root-drop-target');
  });
}

function wireFolderDropTarget(element, targetDirectory) {
  element.addEventListener('dragover', event => {
    if (!state.draggedTreeItem || state.isExamSubmitted) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    element.classList.add('tree-drop-target');
  });
  element.addEventListener('dragleave', event => {
    if (!element.contains(event.relatedTarget)) element.classList.remove('tree-drop-target');
  });
  element.addEventListener('drop', async event => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove('tree-drop-target');
    const sourcePath = state.draggedTreeItem?.path || event.dataTransfer.getData('text/plain');
    if (sourcePath) await moveWorkspaceItem(sourcePath, targetDirectory);
  });
}

async function moveWorkspaceItem(sourcePath, targetDirectory = '') {
  if (!window.electronAPI?.moveItem || state.isExamSubmitted) return;
  if (!await saveAllFiles()) return;
  const result = await window.electronAPI.moveItem({ sourcePath, targetDirectory });
  if (!result.success) {
    appendTerminalOutput(`No se pudo mover el elemento: ${result.error}\n`, 'stderr');
    return;
  }
  const remapPath = current => current === result.oldPath || current.startsWith(`${result.oldPath}/`)
    ? result.path + current.slice(result.oldPath.length)
    : current;
  state.openTabs.forEach(tab => {
    tab.path = remapPath(tab.path);
    tab.name = tab.path.split('/').pop();
  });
  state.activeFilePath = remapPath(state.activeFilePath);
  state.collapsedFolders.delete(targetDirectory);
  renderTabs();
  if (state.activeFilePath) updateBreadcrumbs(state.activeFilePath);
  await loadWorkspaceFiles();
  appendTerminalOutput(`Movido a ${result.path}\n`, 'system');
}

function renderFileTree(tree, container = DOM.fileTreeContainer, depth = 0) {
  if (depth === 0) {
    container.innerHTML = '';
    container.classList.toggle('is-empty', tree.length === 0);
    if (tree.length === 0) {
      container.innerHTML = '<div class="tree-empty"><strong>Carpeta vacía</strong><span>Crea un archivo o agrega una carpeta.</span></div>';
    }
  }

  tree.forEach((item) => {
    const itemPath = (item.path || '').replace(/\\/g, '/');
    const isDir = item.type === 'directory';

    if (isDir) {
      const folderWrap = document.createElement('div');
      folderWrap.className = 'tree-folder-group';

      const isCollapsed = state.collapsedFolders.has(itemPath);
      const folderEl = document.createElement('div');
      folderEl.className = `tree-folder ${isCollapsed ? 'collapsed' : 'expanded'}`;
      folderEl.tabIndex = 0;
      folderEl.setAttribute('role', 'treeitem');
      folderEl.setAttribute('aria-expanded', String(!isCollapsed));
      folderEl.style.paddingLeft = `${8 + depth * 14}px`;
      wireTreeDragSource(folderEl, itemPath, 'directory');
      wireFolderDropTarget(folderEl, itemPath);

      folderEl.innerHTML = `
        <div class="tree-folder-left">
          <span class="folder-toggle-icon">›</span>
          <svg class="tree-folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z"/><path d="M3.5 8.5v-3h6l2 3"/></svg>
          <span class="folder-name">${escapeHtml(item.name)}</span>
        </div>
        <div class="tree-folder-actions">
          <button class="btn-tree-subaction" title="Crear archivo en esta carpeta" data-action="new-file-in-folder" data-path="${escapeHtml(itemPath)}">+</button>
          <button class="btn-tree-subaction" title="Crear subcarpeta en esta carpeta" data-action="new-subfolder-in-folder" data-path="${escapeHtml(itemPath)}">📁+</button>
          <button class="btn-tree-subaction" title="Eliminar carpeta" data-action="delete-folder" data-path="${escapeHtml(itemPath)}">🗑️</button>
        </div>
      `;

      // Click to toggle folder expand/collapse
      folderEl.addEventListener('click', (e) => {
        if (e.target.closest('.btn-tree-subaction')) return;
        if (state.collapsedFolders.has(itemPath)) {
          state.collapsedFolders.delete(itemPath);
        } else {
          state.collapsedFolders.add(itemPath);
        }
        renderFileTree(state.filesTree || tree);
      });
      folderEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        folderEl.click();
      });

      // Actions within this directory
      const newFileBtn = folderEl.querySelector('[data-action="new-file-in-folder"]');
      if (newFileBtn) {
        newFileBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (state.isExamSubmitted) return;
          const fileName = prompt(`Crear archivo dentro de ${item.name}/:\nEjemplo: helper.py`);
          if (fileName && fileName.trim()) {
            const cleanName = fileName.trim().replace(/^\/+/, '');
            const fullPath = `${itemPath}/${cleanName}`;
            if (window.electronAPI) {
              const res = await window.electronAPI.createFile(fullPath);
              if (!res.success) { alert(res.error); return; }
              state.collapsedFolders.delete(itemPath);
              await loadWorkspaceFiles();
              await openFileInEditor(fullPath);
            }
          }
        });
      }

      const newFolderBtn = folderEl.querySelector('[data-action="new-subfolder-in-folder"]');
      if (newFolderBtn) {
        newFolderBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (state.isExamSubmitted) return;
          const folderName = prompt(`Crear subcarpeta dentro de ${item.name}/:\nEjemplo: componentes`);
          if (folderName && folderName.trim()) {
            const cleanName = folderName.trim().replace(/^\/+/, '');
            const fullPath = `${itemPath}/${cleanName}`;
            if (window.electronAPI) {
              const res = await window.electronAPI.createFolder(fullPath);
              if (!res.success) { alert(res.error); return; }
              state.collapsedFolders.delete(itemPath);
              await loadWorkspaceFiles();
            }
          }
        });
      }

      const deleteFolderBtn = folderEl.querySelector('[data-action="delete-folder"]');
      if (deleteFolderBtn) {
        deleteFolderBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (state.isExamSubmitted) return;
          if (confirm(`¿Eliminar la carpeta "${item.name}" y todos sus archivos?`)) {
            if (window.electronAPI) {
              if (!await saveAllFiles()) return;
              const res = await window.electronAPI.deleteItem(itemPath);
              if (!res.success) { alert(res.error); return; }
              state.openTabs.filter(t => t.path === itemPath || t.path.startsWith(itemPath + '/')).forEach(t => closeTab(t.path));
              loadWorkspaceFiles();
            }
          }
        });
      }

      folderWrap.appendChild(folderEl);

      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'tree-folder-children';
      if (isCollapsed) {
        childrenWrap.style.display = 'none';
      }

      if (item.children && item.children.length > 0) {
        renderFileTree(item.children, childrenWrap, depth + 1);
      }
      folderWrap.appendChild(childrenWrap);
      container.appendChild(folderWrap);

    } else {
      // File item
      const itemEl = document.createElement('div');
      itemEl.className = `tree-item ${state.activeFilePath === itemPath ? 'active' : ''}`;
      itemEl.tabIndex = 0;
      itemEl.setAttribute('role', 'treeitem');
      itemEl.style.paddingLeft = `${10 + depth * 14}px`;
      wireTreeDragSource(itemEl, itemPath, 'file');

      let iconLabel = item.kind === 'image' ? 'IMG' : item.kind === 'audio' ? 'AUD' : item.kind === 'binary' ? 'BIN' : 'TXT';
      let iconClass = item.kind || 'text';
      if (item.name.endsWith('.py')) {
        iconLabel = 'PY';
        iconClass = 'python';
      } else if (item.name.endsWith('.json')) {
        iconLabel = '{}';
        iconClass = 'json';
      } else if (item.name.endsWith('.csv') || item.name.endsWith('.data')) {
        iconLabel = 'CSV';
        iconClass = 'data';
      }

      itemEl.innerHTML = `
        <div class="tree-item-left">
          <span class="file-type-badge ${iconClass}" aria-hidden="true">${iconLabel}</span>
          <span class="tree-item-name">${escapeHtml(item.name)}</span>
        </div>
        <div class="tree-item-actions">
          <button class="btn-tree-action" title="Eliminar" data-action="delete" data-path="${escapeHtml(itemPath)}">🗑️</button>
        </div>
      `;

      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete"]')) return;
        if (item.editable === false) {
          appendTerminalOutput(`${itemPath} es un recurso ${item.kind}. Python puede usarlo mediante una ruta relativa; no se abrirá como texto.\n`, 'system');
          return;
        }
        openFileInEditor(itemPath);
      });
      itemEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        itemEl.click();
      });

      const deleteBtn = itemEl.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (state.isExamSubmitted) return;
          if (confirm(`¿Eliminar ${item.name}?`)) {
            if (window.electronAPI) {
              if (!await saveAllFiles()) return;
              const result = await window.electronAPI.deleteItem(itemPath);
              if (!result.success) { alert(result.error); return; }
              closeTab(itemPath);
              loadWorkspaceFiles();
            }
          }
        });
      }

      container.appendChild(itemEl);
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
      content = '';
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
  updateEditorEmptyState();
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
  updateBreadcrumbs(relativePath);

  // Highlight active tree item
  document.querySelectorAll('.tree-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === relativePath.replace(/\\/g, '/'));
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
    const icon = tab.name.endsWith('.py') ? 'PY' : 'TXT';
    tabEl.innerHTML = `
      <span class="tab-file-badge">${icon}</span>
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
    updateEditorEmptyState();
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
  saveLastSession();
  return results.every(Boolean);
}

function saveLastSession() {
  try {
    const session = {
      studentName: DOM.studentNameInput?.value?.trim() || state.studentName || '',
      studentId: DOM.studentIdInput?.value?.trim() || state.studentId || '',
      examSubject: DOM.examSubjectInput?.value?.trim() || state.examSubject || '',
      appMode: state.appMode || 'activity',
      workspacePath: state.workspacePath || null,
      activeFilePath: state.activeFilePath || '',
      openTabs: state.openTabs?.map(t => ({ path: t.path, title: t.title })) || [],
      lastSavedDate: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + new Date().toLocaleDateString()
    };
    localStorage.setItem('codego_last_session', JSON.stringify(session));
  } catch (_) {}
}

function handleEditorKeydown(e) {
  if (state.isExamSubmitted) {
    const allowedNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!allowedNav.includes(e.key)) {
      e.preventDefault();
    }
    return;
  }

  // Telemetry: count keystrokes and track active typing seconds
  if (state.appMode === 'task' || state.appMode === 'exam') {
    state.taskTelemetry.keystrokes++;
    const now = Date.now();
    if (state.taskTelemetry.lastKeystrokeTime) {
      const diff = (now - state.taskTelemetry.lastKeystrokeTime) / 1000;
      if (diff > 0 && diff < 6) {
        state.taskTelemetry.activeEditingSeconds += diff;
      }
    }
    state.taskTelemetry.lastKeystrokeTime = now;
  }

  const editor = DOM.codeTextarea;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;

  // Indent or outdent the current line or complete selection with four spaces.
  if (e.key === 'Tab') {
    e.preventDefault();
    const blockStart = value.lastIndexOf('\n', start - 1) + 1;
    const selectionEndsAtLineStart = end > start && value[end - 1] === '\n';
    const blockEnd = selectionEndsAtLineStart ? end - 1 : (value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end));
    const block = value.slice(blockStart, blockEnd);
    const lines = block.split('\n');
    let transformed;
    let newStart;
    let newEnd;
    if (e.shiftKey) {
      const removed = lines.map(line => (line.match(/^(?: {1,4}|\t)/) || [''])[0].length);
      transformed = lines.map((line, index) => line.slice(removed[index])).join('\n');
      newStart = Math.max(blockStart, start - removed[0]);
      newEnd = Math.max(newStart, end - removed.reduce((sum, count) => sum + count, 0));
    } else {
      transformed = lines.map(line => `    ${line}`).join('\n');
      newStart = start + 4;
      newEnd = end + (4 * lines.length);
    }
    editor.value = value.slice(0, blockStart) + transformed + value.slice(blockEnd);
    editor.setSelectionRange(newStart, newEnd);
    handleEditorInput();
    return;
  }

  const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
  const closing = new Set(Object.values(pairs));
  if (pairs[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (start === end && value[start] === e.key && (e.key === '"' || e.key === "'")) {
      e.preventDefault();
      editor.setSelectionRange(start + 1, start + 1);
      updateCursorStats();
      return;
    }
    if ((e.key === '"' || e.key === "'") && value[start - 1] === '\\') return;
    e.preventDefault();
    const selected = value.slice(start, end);
    editor.value = value.slice(0, start) + e.key + selected + pairs[e.key] + value.slice(end);
    if (selected) editor.setSelectionRange(start + 1, end + 1);
    else editor.setSelectionRange(start + 1, start + 1);
    handleEditorInput();
    return;
  }

  if (closing.has(e.key) && start === end && value[start] === e.key) {
    e.preventDefault();
    editor.setSelectionRange(start + 1, start + 1);
    updateCursorStats();
    return;
  }

  if (e.key === 'Backspace' && start === end && start > 0 && pairs[value[start - 1]] === value[start]) {
    e.preventDefault();
    editor.value = value.slice(0, start - 1) + value.slice(start + 1);
    editor.setSelectionRange(start - 1, start - 1);
    handleEditorInput();
    return;
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
      return;
    }
  }
}

function showPasteBlockedToast() {
  let toast = document.getElementById('paste-blocked-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'paste-blocked-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, #1e1b4b, #312e81);
      border: 1px solid #818cf8;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      z-index: 10000;
      font-size: 0.85rem;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: opacity 0.3s ease, transform 0.3s ease;
      max-width: 380px;
    `;
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span aria-hidden="true">Aviso</span><div><strong>No se puede pegar durante una tarea certificada</strong><br><span>Escribe el código en codeGO para conservar el registro de autoría.</span></div>`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  try { sounds.playCountdownTick(true); } catch (_) {}
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 4500);
}

function updateLineNumbers() {
  const lines = DOM.codeTextarea.value.split('\n').length;
  let numbersHtml = '';
  for (let i = 1; i <= lines; i++) {
    numbersHtml += `<div${state.editorErrorLine === i ? ' class="has-error" title="Python encontró el problema en esta línea"' : ''}>${i}</div>`;
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
    appendTerminalOutput('La vista previa no ejecuta Python. Abre codeGO de escritorio para ejecutar y guardar.\n', 'system');
    return;
  }
  state.isStarting = true;
  DOM.btnRunCode.disabled = true;
  try {
    if (!state.isExamSubmitted && !await saveAllFiles()) throw new Error('Guarda los cambios antes de ejecutar.');
    state.isRunning = true;
    state.executionError = '';
    state.editorErrorLine = null;
    state.runtimeErrorLocation = null;
    updateLineNumbers();
    state.isStopping = false;
    if (state.appMode === 'task') {
      state.taskTelemetry.runsCount++;
    }
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
    if (!result.success) {
      state.executionError = `File "${state.activeFilePath}", line 1\nRuntimeError: ${result.error}`;
      throw new Error(result.error);
    }
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
  if (!stopped && !success && state.executionError) showRuntimeError(state.executionError);
  if (hadFocus && !state.isTermMaximized) DOM.codeTextarea.focus({ preventScroll: true });
}

function explainPythonError(raw) {
  const rules = [
    [/IndentationError|TabError/, 'La sangría no es consistente', 'Python usa los espacios para saber qué instrucciones pertenecen a cada bloque.', ['Ve a la última línea indicada por Python.', 'Alinea el bloque con 4 espacios y evita mezclar tabuladores.']],
    [/SyntaxError/, 'Hay una instrucción escrita de forma inválida', 'Suele faltar un paréntesis, dos puntos o comillas, o hay una palabra de Python mal escrita.', ['Revisa la línea marcada con ^ y también la anterior.', 'Comprueba palabras como import, if, for, while y que cada paréntesis tenga cierre.']],
    [/ModuleNotFoundError|ImportError/, 'Python no pudo cargar una librería', 'El nombre del import puede estar mal escrito o el paquete no pertenece al entorno preparado.', ['Copia exactamente el nombre mostrado después de No module named.', 'Abre Paquetes para comprobar o instalar la librería fuera de una sesión de examen.']],
    [/FileNotFoundError/, 'No se encontró un archivo', 'La ruta escrita no apunta a un recurso existente desde la carpeta del programa.', ['Confirma el nombre, extensión y mayúsculas del archivo.', 'Usa Path(__file__).resolve().parent para construir rutas portátiles.']],
    [/PermissionError|Access is denied/, 'El sistema negó acceso', 'El archivo o puerto puede estar abierto en otro programa o protegido por el sistema.', ['Cierra aplicaciones que usen el archivo o el puerto serial.', 'Guarda dentro de la carpeta del proyecto y vuelve a ejecutar.']],
    [/SerialException|could not open port|ClearCommError/, 'No se pudo abrir el puerto de la placa', 'Otro programa usa el puerto, la placa se desconectó o falta permiso o controlador.', ['Cierra Arduino IDE y otros monitores seriales.', 'Reconecta la placa, confirma el puerto y consulta Arduino en Ayuda.']],
    [/NameError/, 'Se usó un nombre que no existe', 'La variable o función no fue definida antes de usarla, o cambia entre mayúsculas y minúsculas.', ['Compara el nombre con su definición.', 'Asegúrate de asignarlo antes de esta línea.']],
    [/TypeError/, 'La operación recibió un tipo de dato incorrecto', 'Por ejemplo, se intentó sumar texto y números o llamar una función con argumentos incorrectos.', ['Lee la última línea para identificar los tipos.', 'Convierte el dato con int(), float() o str() cuando corresponda.']],
    [/IndexError|KeyError/, 'El elemento solicitado no existe', 'El índice rebasa una lista o la clave no aparece en el diccionario.', ['Imprime len(lista) o diccionario.keys() antes de acceder.', 'Valida la existencia del elemento con una condición.']],
    [/ZeroDivisionError/, 'Se intentó dividir entre cero', 'El divisor llegó a cero durante la ejecución.', ['Comprueba el divisor antes de operar.', 'Decide qué resultado debe producir tu programa cuando sea cero.']],
    [/pygame\.error/, 'Pygame no pudo abrir un recurso o dispositivo', 'La imagen, sonido, formato o dispositivo gráfico no está disponible como se solicitó.', ['Revisa la ruta y el formato del recurso.', 'Inicializa pygame y el módulo correspondiente antes de usarlo.']]
  ];
  const match = rules.find(([pattern]) => pattern.test(raw));
  return match
    ? { title: match[1], explanation: match[2], actions: match[3] }
    : { title: 'El programa terminó con un error', explanation: 'La última línea del mensaje indica el tipo de problema; las líneas anteriores muestran el camino hasta él.', actions: ['Busca la última referencia a tu archivo .py y abre esa línea.', 'Corrige una causa a la vez y vuelve a ejecutar con F5.'] };
}

function parsePythonLocation(raw) {
  const locations = [...String(raw).matchAll(/File ["']([^"']+)["'], line (\d+)/g)];
  const lastLocation = locations.at(-1);
  const finalError = [...String(raw).matchAll(/^([A-Za-z_][\w.]*(?:Error|Exception)):\s*(.*)$/gm)].at(-1);
  if (!lastLocation && !finalError) return null;
  return {
    file: lastLocation?.[1]?.split(/[\\/]/).pop() || state.activeFilePath,
    line: lastLocation ? Number(lastLocation[2]) : null,
    type: finalError?.[1] || 'Error de Python',
    message: finalError?.[2] || ''
  };
}

function goToEditorLine(lineNumber) {
  const lines = DOM.codeTextarea.value.split('\n');
  const line = Math.max(1, Math.min(Number(lineNumber) || 1, lines.length));
  let start = 0;
  for (let index = 1; index < line; index += 1) start += lines[index - 1].length + 1;
  const end = start + lines[line - 1].length;
  state.editorErrorLine = line;
  updateLineNumbers();
  DOM.modalRuntimeError.classList.add('hidden');
  DOM.codeTextarea.focus({ preventScroll: true });
  DOM.codeTextarea.setSelectionRange(start, end);
  const lineHeight = parseFloat(getComputedStyle(DOM.codeTextarea).lineHeight) || 22;
  DOM.codeTextarea.scrollTop = Math.max(0, (line - 3) * lineHeight);
  syncEditorScroll();
  updateCursorStats();
}

function showRuntimeError(raw) {
  const guide = explainPythonError(raw);
  const location = parsePythonLocation(raw);
  state.runtimeErrorLocation = location;
  state.editorErrorLine = location?.line || null;
  updateLineNumbers();
  DOM.runtimeErrorTitle.textContent = guide.title;
  DOM.runtimeErrorExplanation.textContent = guide.explanation;
  DOM.runtimeErrorRaw.textContent = raw;
  DOM.runtimeErrorLocation.classList.toggle('hidden', !location?.line);
  if (location?.line) {
    DOM.runtimeErrorLocationLabel.textContent = `${location.file} · Línea ${location.line} · ${location.type}`;
    DOM.btnRuntimeErrorLine.textContent = `Ir a la línea ${location.line}`;
  }
  DOM.runtimeErrorActions.replaceChildren(...guide.actions.map(action => {
    const item = document.createElement('li');
    item.textContent = action;
    return item;
  }));
  DOM.modalRuntimeError.classList.remove('hidden');
  DOM.btnCloseRuntimeError.focus();
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

  appendTerminalOutput('\nExamen entregado. El código queda disponible en modo de lectura.', 'success');
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

function openSubmitTaskModal() {
  if (state.appMode !== 'task' || state.isTaskSubmitted) return;
  DOM.taskSubmitTotalTime.textContent = DOM.timerDisplay.textContent;
  DOM.taskSubmitKeystrokes.textContent = (state.taskTelemetry.keystrokes || 0).toLocaleString();
  DOM.taskSubmitCharacters.textContent = (DOM.codeTextarea.value.length || 0).toLocaleString();

  if (state.taskTelemetry.externalPasteAttempts === 0) {
    DOM.taskSubmitPastes.textContent = '0 (100% escrito a mano ✓)';
    DOM.taskSubmitPastes.className = 'clean';
  } else {
    DOM.taskSubmitPastes.textContent = `${state.taskTelemetry.externalPasteAttempts} intentos bloqueados`;
    DOM.taskSubmitPastes.className = 'highlight-red';
  }

  DOM.taskSubmitRuns.textContent = `${state.taskTelemetry.runsCount || 0} pruebas`;

  if (state.incidentsCount === 0) {
    DOM.taskSubmitIncidents.textContent = '0 (Sesión limpia ✓)';
    DOM.taskSubmitIncidents.className = 'clean';
  } else {
    DOM.taskSubmitIncidents.textContent = `${state.incidentsCount} salida(s) de foco`;
    DOM.taskSubmitIncidents.className = 'highlight-red';
  }

  DOM.modalTaskSubmit.classList.remove('hidden');
}

async function handleTaskFinalSubmit() {
  if (state.appMode !== 'task' || state.isTaskSubmitted || state.isSubmitting) return;
  if (state.isRunning || state.isStarting) { alert('Detén el programa antes de entregar la tarea.'); return; }
  state.isSubmitting = true;
  DOM.btnConfirmTaskSubmit.disabled = true;
  DOM.codeTextarea.readOnly = true;
  try {
    if (!await saveAllFiles()) throw new Error('No se pudieron guardar todos los archivos. Reintenta antes de entregar.');
    if (!window.electronAPI) throw new Error('La entrega está disponible en la aplicación de escritorio.');
    const res = await window.electronAPI.submitTask({
      student: state.student,
      telemetry: state.taskTelemetry,
      incidentsCount: state.incidentsCount
    });
    if (!res.success) throw new Error(res.error);

    state.isTaskSubmitted = true;
    lockExamEnvironment();
    DOM.modalTaskSubmit.classList.add('hidden');
    if (state.examTimerInterval) clearInterval(state.examTimerInterval);
    DOM.receiptFilename.textContent = res.fileName;
    DOM.receiptPath.textContent = res.filePath;
    DOM.receiptChecksum.textContent = res.sha256;
    DOM.modalSubmissionSuccess.classList.remove('hidden');

    appendTerminalOutput(`\nTarea certificada guardada correctamente.`, 'success');
    appendTerminalOutput(`>>> Archivo generado: ${res.fileName}`, 'system');
    appendTerminalOutput(`>>> Firma Digital HMAC-SHA256: ${res.manifest?.signature ? 'Válida' : 'Generada'}`, 'system');
    appendTerminalOutput(`>>> Entrega este archivo .codego a tu profesor para certificar tu autoría.\n`, 'system');
  } catch (error) {
    DOM.codeTextarea.readOnly = state.isTaskSubmitted;
    alert(`No se completó la entrega de la tarea: ${error.message}`);
  } finally {
    state.isSubmitting = false;
    DOM.btnConfirmTaskSubmit.disabled = false;
  }
}

function openVerifySubmissionModal() {
  state.currentVerifiedFile = null;
  state.verifiedSubmissionData = null;
  if (DOM.verifierStatusBadge) {
    DOM.verifierStatusBadge.className = 'badge-status-waiting';
    DOM.verifierStatusBadge.textContent = 'Esperando archivo';
  }
  if (DOM.verifierResultContainer) DOM.verifierResultContainer.classList.add('hidden');
  if (DOM.btnExtractSubmissionCode) DOM.btnExtractSubmissionCode.classList.add('hidden');
  if (DOM.btnRunSubmissionCode) DOM.btnRunSubmissionCode.classList.add('hidden');
  if (DOM.modalVerifySubmission) DOM.modalVerifySubmission.classList.remove('hidden');
}

async function handleSelectSubmissionFile() {
  if (!window.electronAPI?.openSubmissionFileDialog) return;
  const res = await window.electronAPI.openSubmissionFileDialog();
  if (res && res.filePath) {
    await verifyFileByPath(res.filePath);
  }
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

async function verifyFileByPath(filePath) {
  if (!window.electronAPI?.verifySubmissionFile) return;
  if (DOM.verifierStatusBadge) {
    DOM.verifierStatusBadge.className = 'badge-status-waiting';
    DOM.verifierStatusBadge.textContent = 'Verificando firma criptográfica...';
  }

  const res = await window.electronAPI.verifySubmissionFile(filePath);
  if (!res.success) {
    if (DOM.verifierStatusBadge) {
      DOM.verifierStatusBadge.className = 'badge-status-tampered';
      DOM.verifierStatusBadge.textContent = 'ERROR / ARCHIVO DAÑADO';
    }
    alert('Error al verificar archivo: ' + res.error);
    return;
  }

  state.currentVerifiedFile = filePath;
  state.verifiedSubmissionData = res;
  if (DOM.verifierResultContainer) DOM.verifierResultContainer.classList.remove('hidden');
  if (DOM.btnExtractSubmissionCode) DOM.btnExtractSubmissionCode.classList.remove('hidden');
  if (DOM.btnRunSubmissionCode) DOM.btnRunSubmissionCode.classList.remove('hidden');

  // Authentic badge & banner
  if (DOM.verifierStatusBadge) {
    if (res.authentic) {
      DOM.verifierStatusBadge.className = 'badge-status-valid';
      DOM.verifierStatusBadge.textContent = '✓ AUTÉNTICO (Firma Válida)';
      if (DOM.verifHmacBadge) {
        DOM.verifHmacBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        DOM.verifHmacBadge.style.color = '#34d399';
        DOM.verifHmacBadge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      }
      if (DOM.verifHmacText) DOM.verifHmacText.textContent = 'Firma Criptográfica HMAC-SHA256 Verificada';
    } else {
      DOM.verifierStatusBadge.className = 'badge-status-tampered';
      DOM.verifierStatusBadge.textContent = '⚠️ ADULTERADO O SIN FIRMA';
      if (DOM.verifHmacBadge) {
        DOM.verifHmacBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        DOM.verifHmacBadge.style.color = '#f87171';
        DOM.verifHmacBadge.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      }
      if (DOM.verifHmacText) DOM.verifHmacText.textContent = '¡Firma no válida o archivo adulterado!';
    }
  }

  // Student header
  if (DOM.verifStudentName) DOM.verifStudentName.textContent = res.student?.name || 'Estudiante Desconocido';
  if (DOM.verifStudentId) DOM.verifStudentId.textContent = 'Matrícula: ' + (res.student?.id || '--');
  if (DOM.verifSubject) DOM.verifSubject.textContent = 'Materia: ' + (res.student?.subject || '--');
  if (DOM.verifDate) DOM.verifDate.textContent = 'Fecha: ' + (res.timestamp ? new Date(res.timestamp).toLocaleString() : '--');
  if (DOM.verifOs) DOM.verifOs.textContent = 'SO: ' + (res.platform || '--');

  // Telemetry
  const tel = res.telemetry || {};
  if (DOM.verifKeystrokes) DOM.verifKeystrokes.textContent = (tel.keystrokes || 0).toLocaleString();
  if (DOM.verifCharacters) DOM.verifCharacters.textContent = (tel.charactersWritten || 0).toLocaleString();
  if (DOM.verifPastes) DOM.verifPastes.textContent = tel.externalPasteAttempts || 0;
  if (DOM.verifPastesSub) {
    if (tel.externalPasteAttempts === 0) {
      DOM.verifPastesSub.textContent = '✓ 100% hecho en codeGO';
      DOM.verifPastesSub.style.color = '#34d399';
    } else {
      DOM.verifPastesSub.textContent = '⚠️ Intentos de pegado detectados';
      DOM.verifPastesSub.style.color = '#f87171';
    }
  }
  if (DOM.verifEditingTime) DOM.verifEditingTime.textContent = formatTime(Math.round(tel.activeEditingSeconds || 0));
  if (DOM.verifRuns) DOM.verifRuns.textContent = (tel.runsCount || 0) + ' veces';
  if (DOM.verifIncidents) DOM.verifIncidents.textContent = (res.incidentsCount || 0) + ' faltas';

  // Files list
  if (DOM.verifFilesTabs) {
    DOM.verifFilesTabs.innerHTML = '';
    if (res.fileList && res.fileList.length > 0) {
      res.fileList.forEach((file, index) => {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = `verif-file-tab ${index === 0 ? 'active' : ''}`;
        tabBtn.textContent = file.path;
        tabBtn.addEventListener('click', () => {
          DOM.verifFilesTabs.querySelectorAll('.verif-file-tab').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
          if (DOM.verifCodeContent) DOM.verifCodeContent.textContent = file.content || '(Archivo vacío)';
        });
        DOM.verifFilesTabs.appendChild(tabBtn);
      });
      if (DOM.verifCodeContent) DOM.verifCodeContent.textContent = res.fileList[0].content || '(Archivo vacío)';
    } else {
      if (DOM.verifCodeContent) DOM.verifCodeContent.textContent = '(Sin archivos de código legibles)';
    }
  }
}

async function handleExtractSubmissionCode() {
  if (!state.currentVerifiedFile || !window.electronAPI?.extractSubmissionCode) return;
  const res = await window.electronAPI.extractSubmissionCode(state.currentVerifiedFile);
  if (res && res.success) {
    alert(`Archivos extraídos con éxito en:\n${res.targetDir}`);
  } else if (res && !res.canceled) {
    alert(`Error al extraer archivos: ${res.error}`);
  }
}

async function handleRunSubmissionCode() {
  if (!state.verifiedSubmissionData?.fileList) return;
  const activeTab = DOM.verifFilesTabs?.querySelector('.verif-file-tab.active');
  const path = activeTab ? activeTab.textContent : state.verifiedSubmissionData.fileList[0]?.path;
  const fileObj = state.verifiedSubmissionData.fileList.find(f => f.path === path) || state.verifiedSubmissionData.fileList[0];
  if (!fileObj) return;

  DOM.modalVerifySubmission.classList.add('hidden');
  appendTerminalOutput(`\n>>> [VERIFICACIÓN DOCENTE]: Ejecutando ${fileObj.path} del alumno ${state.verifiedSubmissionData.student?.name}...\n`, 'system');
  if (window.electronAPI?.runPython) {
    await window.electronAPI.runPython({ code: fileObj.content, fileName: fileObj.path });
  }
}

function setupVerifierDragAndDrop() {
  if (!DOM.verifierDropzone) return;
  ['dragenter', 'dragover'].forEach(name => {
    DOM.verifierDropzone.addEventListener(name, (e) => {
      e.preventDefault();
      DOM.verifierDropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(name => {
    DOM.verifierDropzone.addEventListener(name, (e) => {
      e.preventDefault();
      DOM.verifierDropzone.classList.remove('dragover');
    });
  });
  DOM.verifierDropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      verifyFileByPath(file.path);
    }
  });
}

async function handleOpenWorkspaceFolder() {
  if (state.isRunning || state.isStarting) { appendTerminalOutput('Detén el programa antes de cambiar de proyecto.\n', 'system'); return; }
  if (!await saveAllFiles()) return;
  if (window.electronAPI && window.electronAPI.openFolderDialog) {
    const res = await window.electronAPI.openFolderDialog();
    if (res && res.success) {
      setWorkspaceSelection(res);
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
      updateEditorEmptyState();
      appendTerminalOutput(`\nProyecto abierto: ${res.workspaceName || res.workspacePath}\n`, 'success');
      appendTerminalOutput('Elige un archivo del panel izquierdo o crea uno nuevo.\n', 'system');
    }
  } else {
    alert('Función disponible en la aplicación de escritorio.');
  }
}

async function handleCreateNewProject() {
  if (state.isRunning || state.isStarting) { appendTerminalOutput('Detén el programa antes de cambiar de proyecto.\n', 'system'); return; }
  if (!await saveAllFiles()) return;
  if (window.electronAPI && window.electronAPI.createProjectDialog) {
    const res = await createBlankWorkspace();
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
      await loadWorkspaceFiles();
      updateSyntaxHighlighting();
      updateEditorEmptyState();
      appendTerminalOutput(`\nProyecto creado: ${res.workspaceName || res.workspacePath}\n`, 'success');
      appendTerminalOutput('El proyecto está vacío. Crea tu primer archivo cuando quieras.\n', 'system');
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
  if (confirm('¿Deseas cerrar y salir de codeGO?')) {
    if (window.electronAPI && window.electronAPI.quitApp) {
      await window.electronAPI.quitApp();
    } else {
      window.close();
    }
  }
}

// -----------------------------------------------------------------------------
// IN-APP AUTO-UPDATER
// -----------------------------------------------------------------------------
async function checkUpdatesSilently() {
  if (!window.electronAPI || !window.electronAPI.checkForUpdates) return;
  if (state.examSessionActive || state.workspaceSessionActive) return;

  try {
    const res = await window.electronAPI.checkForUpdates();
    if (res && res.success && res.hasUpdate) {
      state.availableUpdate = res;
      displayUpdateBanner(res);
    }
  } catch (_) {
    // Falla silenciosa si no hay conexión
  }
}

function displayUpdateBanner(updateInfo) {
  if (!DOM.lobbyUpdateBanner) return;
  if (DOM.updateBannerTitle) {
    DOM.updateBannerTitle.textContent = `Nueva versión disponible: v${updateInfo.latestVersion}`;
  }
  if (DOM.updateBannerDesc) {
    DOM.updateBannerDesc.textContent = updateInfo.releaseName || 'Hay mejoras y correcciones listas para instalar.';
  }
  DOM.lobbyUpdateBanner.classList.remove('hidden');
}

async function handleManualCheckUpdates() {
  if (!window.electronAPI || !window.electronAPI.checkForUpdates) {
    alert('Función de actualización disponible en la versión de escritorio instalada.');
    return;
  }
  if (DOM.btnCheckUpdatesLobby) {
    DOM.btnCheckUpdatesLobby.disabled = true;
    DOM.btnCheckUpdatesLobby.textContent = 'Buscando...';
  }

  try {
    const res = await window.electronAPI.checkForUpdates();
    if (res && res.success) {
      if (res.hasUpdate) {
        state.availableUpdate = res;
        displayUpdateBanner(res);
      } else {
        alert(`✓ codeGO está actualizado.\n\nLa versión instalada (v${res.currentVersion}) es la más reciente.`);
      }
    } else {
      alert(`No se pudo verificar actualizaciones:\n${res?.error || 'Verifica tu conexión a internet.'}`);
    }
  } catch (err) {
    alert(`Error al buscar actualizaciones: ${err.message}`);
  } finally {
    if (DOM.btnCheckUpdatesLobby) {
      DOM.btnCheckUpdatesLobby.disabled = false;
      DOM.btnCheckUpdatesLobby.textContent = 'Actualizaciones';
    }
  }
}

function handleShowReleaseNotes() {
  if (!state.availableUpdate) return;
  if (DOM.modalReleaseNotesTitle) {
    DOM.modalReleaseNotesTitle.textContent = state.availableUpdate.releaseName || `Novedades de v${state.availableUpdate.latestVersion}`;
  }
  if (DOM.modalReleaseNotesBody) {
    DOM.modalReleaseNotesBody.textContent = state.availableUpdate.releaseNotes || 'Correcciones de estabilidad, seguridad y mejoras generales.';
  }
  if (DOM.modalReleaseNotes) {
    DOM.modalReleaseNotes.classList.remove('hidden');
    state.isInternalModalOpen = true;
  }
}

function handleCloseReleaseNotes() {
  if (DOM.modalReleaseNotes) {
    DOM.modalReleaseNotes.classList.add('hidden');
    state.isInternalModalOpen = false;
  }
}

async function handleStartUpdate() {
  if (!state.availableUpdate || !state.availableUpdate.asset) {
    if (state.availableUpdate && state.availableUpdate.releaseUrl) {
      window.open(state.availableUpdate.releaseUrl, '_blank');
    } else {
      alert('No se encontró un instalador automático para este sistema operativo.');
    }
    return;
  }

  if (state.isUpdating) return;
  state.isUpdating = true;

  handleCloseReleaseNotes();

  if (DOM.lobbyUpdateBanner) DOM.lobbyUpdateBanner.classList.remove('hidden');
  if (DOM.btnUpdateNow) DOM.btnUpdateNow.disabled = true;
  if (DOM.btnUpdateViewNotes) DOM.btnUpdateViewNotes.disabled = true;
  if (DOM.btnUpdateDismiss) DOM.btnUpdateDismiss.disabled = true;
  if (DOM.updateProgressContainer) DOM.updateProgressContainer.classList.remove('hidden');
  if (DOM.updateProgressFill) DOM.updateProgressFill.style.width = '0%';
  if (DOM.updateProgressText) DOM.updateProgressText.textContent = 'Iniciando descarga...';
  if (DOM.updateProgressDetail) DOM.updateProgressDetail.textContent = 'Conectando con GitHub...';

  let removeProgressListener = null;
  if (window.electronAPI.onUpdateProgress) {
    removeProgressListener = window.electronAPI.onUpdateProgress((progress) => {
      if (DOM.updateProgressFill) {
        DOM.updateProgressFill.style.width = `${progress.percent}%`;
      }
      if (DOM.updateProgressText) {
        DOM.updateProgressText.textContent = `Descargando actualización (${progress.percent}%)...`;
      }
      if (DOM.updateProgressDetail && progress.totalBytes > 0) {
        const currentMB = (progress.downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMB = (progress.totalBytes / 1024 / 1024).toFixed(1);
        DOM.updateProgressDetail.textContent = `${currentMB} MB de ${totalMB} MB`;
      }
    });
  }

  try {
    const res = await window.electronAPI.downloadAndInstallUpdate({
      downloadUrl: state.availableUpdate.asset.downloadUrl,
      assetName: state.availableUpdate.asset.name
    });

    if (res && res.success) {
      if (DOM.updateProgressText) {
        DOM.updateProgressText.textContent = '¡Descarga completada! Aplicando actualización...';
      }
      if (DOM.updateProgressDetail) {
        DOM.updateProgressDetail.textContent = 'Reiniciando codeGO...';
      }
      if (res.action === 'downloaded') {
        alert(`La actualización se descargó exitosamente en:\n${res.path}`);
      }
    } else {
      throw new Error(res?.error || 'Error al descargar o aplicar la actualización.');
    }
  } catch (err) {
    alert(`No se pudo completar la actualización automática:\n${err.message}`);
    if (DOM.btnUpdateNow) DOM.btnUpdateNow.disabled = false;
    if (DOM.btnUpdateViewNotes) DOM.btnUpdateViewNotes.disabled = false;
    if (DOM.btnUpdateDismiss) DOM.btnUpdateDismiss.disabled = false;
    if (DOM.updateProgressText) DOM.updateProgressText.textContent = 'Error al actualizar.';
    if (DOM.updateProgressDetail) DOM.updateProgressDetail.textContent = 'Puedes reintentar más tarde.';
  } finally {
    state.isUpdating = false;
    if (removeProgressListener) removeProgressListener();
  }
}

// Start Application on Load
document.addEventListener('DOMContentLoaded', initApp);
