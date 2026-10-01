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

  playFeedback(kind = 'info') {
    try {
      this.init();
      const tones = {
        info: [520],
        save: [620, 820],
        success: [540, 760],
        warning: [430, 360],
        error: [260, 210]
      };
      const frequencies = tones[kind] || tones.info;
      frequencies.forEach((frequency, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = this.ctx.currentTime + index * 0.065;
        osc.type = kind === 'error' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === 'error' ? 0.045 : 0.025, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.13);
      });
    } catch (_) {}
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
      lfoGain.connect(this.sirenGain.gain);

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
      const osc1 = this.sirenOsc1;
      const osc2 = this.sirenOsc2;
      const lfo = this.sirenLfo;
      const gain = this.sirenGain;
      this.isSirenPlaying = false;
      this.sirenOsc1 = this.sirenOsc2 = this.sirenLfo = this.sirenGain = null;
      if (gain && this.ctx) {
        gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
      }
      setTimeout(() => {
        if (osc1) { try { osc1.stop(); } catch (_) {} }
        if (osc2) { try { osc2.stop(); } catch (_) {} }
        if (lfo) { try { lfo.stop(); } catch (_) {} }
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
    subject: '',
    examId: ''
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
  workspaceTreeInitialized: false,
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
  hazardCountdownInterval: null,
  hazardAudioInterval: null,
  hazardAwaitingReturn: false,
  monitorViolationActive: false,
  editorErrorLine: null,
  runtimeErrorLocation: null,
  setupTipInterval: null,
  setupTipIndex: 0,
  selectedLanguage: 'python',
  detectedToolchains: null,
  examInitialFile: '',
  returnHomeAfterUnlock: false,
  syntaxDiagnosticTimer: null,
  syntaxDiagnosticGeneration: 0,
  syntaxDiagnosticLine: null,
  syntaxDiagnosticColumn: null,
  syntaxDiagnosticResult: null,
  lastSavedAt: null,
  lastSaveSoundAt: 0,
  indentGuideStyle: localStorage.getItem('codego_indent_guides') || 'subtle',
  pendingTeacherPin: '',
  teacherPinManaged: false
};

// DOM Elements
const DOM = {
  // Views
  viewStartup: document.getElementById('view-startup'),
  startupStatus: document.getElementById('startup-status'),
  viewLobby: document.getElementById('view-lobby'),
  viewCountdown: document.getElementById('view-countdown'),
  viewIde: document.getElementById('view-ide'),

  // Mode & Language Selection (Lobby)
  modeCardExam: document.getElementById('mode-card-exam'),
  modeCardTask: document.getElementById('mode-card-task'),
  modeCardActivity: document.getElementById('mode-card-activity'),
  languageSelect: document.getElementById('language-select'),
  languageSelectionHelp: document.getElementById('language-selection-help'),
  btnOpenOfflineManager: document.getElementById('btn-open-offline-manager'),
  btnOpenOfflineManagerMenu: document.getElementById('btn-open-offline-manager-menu'),
  modalOfflineLanguages: document.getElementById('modal-offline-languages'),
  btnCloseOfflineModal: document.getElementById('btn-close-offline-modal'),
  btnCloseOfflineManagerConfirm: document.getElementById('btn-close-offline-manager-confirm'),
  offlineLangsGrid: document.getElementById('offline-langs-grid'),
  btnTestCompilers: document.getElementById('btn-test-compilers'),
  btnCopyOfflineCmd: document.getElementById('btn-copy-offline-cmd'),
  offlineScriptCmdText: document.getElementById('offline-script-cmd-text'),
  navActiveLangBadge: document.getElementById('nav-active-lang-badge'),
  navActiveLangIcon: document.getElementById('nav-active-lang-icon'),
  navActiveLangText: document.getElementById('nav-active-lang-text'),
  startBtnTitle: document.getElementById('start-btn-title'),
  startBtnSubtitle: document.getElementById('start-btn-subtitle'),
  lobbyRulesTitle: document.getElementById('lobby-rules-title'),
  lobbyRulesList: document.getElementById('lobby-rules-list'),
  btnVerifyTaskLobby: document.getElementById('btn-verify-task-lobby'),

  // Lobby & Validation
  lobbyValidationBanner: document.getElementById('lobby-validation-banner'),
  lobbyValidationText: document.getElementById('lobby-validation-text'),
  lobbyAppVersion: document.getElementById('lobby-app-version'),
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
  btnUpdateIde: document.getElementById('btn-update-ide'),
  updateIdeLabel: document.getElementById('update-ide-label'),
  modalReleaseNotes: document.getElementById('modal-release-notes'),
  modalReleaseNotesTitle: document.getElementById('modal-release-notes-title'),
  modalReleaseNotesBody: document.getElementById('modal-release-notes-body'),
  btnCloseReleaseNotes: document.getElementById('btn-close-release-notes'),
  btnModalInstallUpdate: document.getElementById('btn-modal-install-update'),
  studentNameInput: document.getElementById('student-name'),
  studentIdInput: document.getElementById('student-id'),
  examSubjectInput: document.getElementById('exam-subject'),
  examIdInput: document.getElementById('exam-id'),
  examTeacherPinInput: document.getElementById('exam-teacher-pin'),
  examTeacherPinConfirmInput: document.getElementById('exam-teacher-pin-confirm'),
  examPinSetup: document.getElementById('exam-pin-setup'),
  examPinHelp: document.getElementById('exam-pin-help'),
  projectPicker: document.getElementById('project-picker'),
  btnGoHome: document.getElementById('btn-go-home'),
  btnLobbyOpenFolder: document.getElementById('btn-lobby-open-folder'),
  btnLobbyNewProject: document.getElementById('btn-lobby-new-project'),
  workspaceSelectionStatus: document.getElementById('workspace-selection-status'),
  btnRevealSelectedWorkspace: document.getElementById('btn-reveal-selected-workspace'),
  recentProjects: document.getElementById('recent-projects'),
  recentProjectList: document.getElementById('recent-project-list'),
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
  setupErrorCommandWrap: document.getElementById('setup-error-command-wrap'),
  setupErrorCommand: document.getElementById('setup-error-command'),
  btnCopySetupCommand: document.getElementById('btn-copy-setup-command'),
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
  btnRevealWorkspace: document.getElementById('btn-reveal-workspace'),
  btnRevealWorkspaceSidebar: document.getElementById('btn-reveal-workspace-sidebar'),
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
  stopCodeLabel: document.getElementById('stop-code-label'),
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
  btnIndentGuides: document.getElementById('btn-indent-guides'),
  btnToggleTermLayout: document.getElementById('btn-toggle-term-layout'),
  btnToggleTermView: document.getElementById('btn-toggle-term-view'),
  termLayoutLabel: document.getElementById('term-layout-label'),
  codeTextarea: document.getElementById('code-textarea'),
  editorHighlighting: document.getElementById('editor-highlighting'),
  highlightingContent: document.getElementById('highlighting-content'),
  editorIndentGuides: document.getElementById('editor-indent-guides'),
  editorLineNumbers: document.getElementById('editor-line-numbers'),
  editorDiagnostic: document.getElementById('editor-diagnostic'),
  editorDiagnosticIcon: document.getElementById('editor-diagnostic-icon'),
  editorDiagnosticTitle: document.getElementById('editor-diagnostic-title'),
  editorDiagnosticHint: document.getElementById('editor-diagnostic-hint'),
  btnEditorDiagnosticLine: document.getElementById('btn-editor-diagnostic-line'),
  btnEditorDiagnosticHelp: document.getElementById('btn-editor-diagnostic-help'),
  sbCursorPos: document.getElementById('sb-cursor-pos'),
  sbCharsCount: document.getElementById('sb-chars-count'),
  sbSaveStatus: document.getElementById('sb-save-status'),
  sbIndentStatus: document.getElementById('sb-indent-status'),
  sessionPolicyBadge: document.getElementById('session-policy-badge'),

  // Application feedback
  appDialog: document.getElementById('app-dialog'),
  appDialogIcon: document.getElementById('app-dialog-icon'),
  appDialogKicker: document.getElementById('app-dialog-kicker'),
  appDialogTitle: document.getElementById('app-dialog-title'),
  appDialogMessage: document.getElementById('app-dialog-message'),
  appDialogFieldWrap: document.getElementById('app-dialog-field-wrap'),
  appDialogFieldLabel: document.getElementById('app-dialog-field-label'),
  appDialogInput: document.getElementById('app-dialog-input'),
  appDialogSelectWrap: document.getElementById('app-dialog-select-wrap'),
  appDialogSelectLabel: document.getElementById('app-dialog-select-label'),
  appDialogSelect: document.getElementById('app-dialog-select'),
  appDialogCancel: document.getElementById('app-dialog-cancel'),
  appDialogConfirm: document.getElementById('app-dialog-confirm'),
  toastRegion: document.getElementById('toast-region'),

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
  runtimeErrorExampleWrap: document.getElementById('runtime-error-example-wrap'),
  runtimeErrorExample: document.getElementById('runtime-error-example'),
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
  verifierBatchSummary: document.getElementById('verifier-batch-summary'),
  batchVerifiedCount: document.getElementById('batch-verified-count'),
  batchFlaggedCount: document.getElementById('batch-flagged-count'),
  batchErrorCount: document.getElementById('batch-error-count'),
  batchComparisonList: document.getElementById('batch-comparison-list'),
  batchSubmissionList: document.getElementById('batch-submission-list'),
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
  gradeReceiptPanel: document.getElementById('grade-receipt-panel'),
  gradeTeacher: document.getElementById('grade-teacher'),
  gradeValue: document.getElementById('grade-value'),
  gradeFeedback: document.getElementById('grade-feedback'),
  btnSaveGradeReceipt: document.getElementById('btn-save-grade-receipt'),
  gradeReceiptStatus: document.getElementById('grade-receipt-status'),
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

let appDialogQueue = Promise.resolve();

function showToast(message, kind = 'info', duration = 2600) {
  if (!DOM.toastRegion || !message) return;
  const toast = document.createElement('div');
  toast.className = `app-toast ${kind}`;
  toast.textContent = message;
  DOM.toastRegion.appendChild(toast);
  while (DOM.toastRegion.childElementCount > 3) DOM.toastRegion.firstElementChild?.remove();
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 180);
  }, duration);
}

function openAppDialog(options = {}) {
  const run = () => new Promise(resolve => {
    const {
      title = 'Información',
      message = '',
      kind = 'info',
      confirmLabel = 'Aceptar',
      cancelLabel = '',
      inputLabel = '',
      inputValue = '',
      inputPlaceholder = '',
      selectLabel = '',
      selectOptions = []
    } = options;
    const dialog = DOM.appDialog;
    if (!dialog) return resolve({ confirmed: true, value: inputValue });
    const previousFocus = document.activeElement;
    state.isInternalModalOpen = true;
    dialog.dataset.kind = kind;
    DOM.appDialogIcon.textContent = kind === 'danger' ? '!' : kind === 'warning' ? '!' : kind === 'success' ? '✓' : 'i';
    DOM.appDialogKicker.textContent = kind === 'danger' ? 'Atención' : kind === 'warning' ? 'Revisa esto' : 'codeGO';
    DOM.appDialogTitle.textContent = title;
    DOM.appDialogMessage.textContent = message;
    DOM.appDialogConfirm.textContent = confirmLabel;
    DOM.appDialogCancel.textContent = cancelLabel || 'Cancelar';
    DOM.appDialogCancel.classList.toggle('hidden', !cancelLabel);
    DOM.appDialogFieldWrap.classList.toggle('hidden', !inputLabel);
    DOM.appDialogFieldLabel.textContent = inputLabel || '';
    DOM.appDialogInput.value = inputValue;
    DOM.appDialogInput.placeholder = inputPlaceholder;
    DOM.appDialogSelectWrap.classList.toggle('hidden', !selectOptions.length);
    DOM.appDialogSelectLabel.textContent = selectLabel || 'Selecciona una opción';
    DOM.appDialogSelect.replaceChildren(...selectOptions.map(option => {
      const element = document.createElement('option');
      element.value = typeof option === 'string' ? option : option.value;
      element.textContent = typeof option === 'string' ? option : option.label;
      return element;
    }));
    dialog.returnValue = '';

    let settled = false;
    const finish = confirmed => {
      if (settled) return;
      settled = true;
      state.isInternalModalOpen = false;
      DOM.appDialogCancel.onclick = null;
      dialog.querySelector('form').onsubmit = null;
      const value = selectOptions.length ? DOM.appDialogSelect.value : DOM.appDialogInput.value.trim();
      if (confirmed) sounds.playFeedback(kind === 'danger' ? 'warning' : kind);
      requestAnimationFrame(() => {
        if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
      });
      resolve({ confirmed, value });
    };
    const closeHandler = () => finish(dialog.returnValue === 'confirm');
    const cancelHandler = () => {
      dialog.returnValue = 'cancel';
      dialog.close();
    };
    const submitHandler = event => {
      if (inputLabel && !DOM.appDialogInput.value.trim()) {
        event.preventDefault();
        DOM.appDialogInput.focus();
        DOM.appDialogInput.classList.add('input-field-error');
        return;
      }
      dialog.returnValue = 'confirm';
    };
    dialog.addEventListener('close', closeHandler, { once: true });
    DOM.appDialogCancel.onclick = cancelHandler;
    dialog.querySelector('form').onsubmit = submitHandler;
    dialog.showModal();
    requestAnimationFrame(() => (inputLabel ? DOM.appDialogInput : selectOptions.length ? DOM.appDialogSelect : DOM.appDialogConfirm).focus());
  });
  const pending = appDialogQueue.then(run, run);
  appDialogQueue = pending.catch(() => {});
  return pending;
}

async function showNotice(message, options = {}) {
  return openAppDialog({ title: options.title || 'codeGO', message, kind: options.kind || 'info', confirmLabel: options.confirmLabel || 'Entendido' });
}

async function askConfirmation(message, options = {}) {
  const result = await openAppDialog({
    title: options.title || 'Confirmar acción',
    message,
    kind: options.kind || 'warning',
    confirmLabel: options.confirmLabel || 'Continuar',
    cancelLabel: options.cancelLabel || 'Cancelar'
  });
  return result.confirmed;
}

async function requestText(title, placeholder, options = {}) {
  const result = await openAppDialog({
    title,
    message: options.message || '',
    kind: options.kind || 'info',
    confirmLabel: options.confirmLabel || 'Crear',
    cancelLabel: 'Cancelar',
    inputLabel: options.label || 'Nombre',
    inputValue: options.value || '',
    inputPlaceholder: placeholder || ''
  });
  return result.confirmed ? result.value : null;
}

async function focusEditorReliably() {
  if (!DOM.viewIde?.classList.contains('active') || isWorkspaceLocked() || state.isSubmitting) return false;
  applyEditorLockState(false);
  if (!isInternalModalOpen()) DOM.codeTextarea?.focus({ preventScroll: true });
  try { await window.electronAPI?.focusEditorWindow?.(); } catch (_) {}
  const token = (state.editorFocusRequest || 0) + 1;
  state.editorFocusRequest = token;
  [0, 40, 120].forEach(delay => setTimeout(() => {
    if (state.editorFocusRequest !== token || !DOM.viewIde?.classList.contains('active') || isInternalModalOpen()) return;
    if (DOM.terminalStdinInput && !DOM.terminalStdinInput.disabled && document.activeElement === DOM.terminalStdinInput) return;
    DOM.codeTextarea?.focus({ preventScroll: true });
  }, delay));
  return true;
}

async function revealWorkspaceInSystem() {
  const result = await window.electronAPI?.revealCurrentWorkspace?.();
  if (!result?.success) {
    await showNotice(result?.error || 'No se pudo abrir la carpeta del proyecto.', { title: 'No se pudo mostrar la carpeta', kind: 'warning' });
    return false;
  }
  showToast('Proyecto abierto en el explorador de archivos del sistema.', 'success');
  return true;
}

// ==============================================================
// 2.1 SCREEN SIZE ANALYZER & ADAPTIVE AUTO-FIT
// ==============================================================
function autoFitScreenLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const density = window.devicePixelRatio || 1;
  if (!window.electronAPI?.setZoomFactor && state.zoomFactor !== 1) {
    document.body.style.width = `${w / state.zoomFactor}px`;
    document.body.style.height = `${h / state.zoomFactor}px`;
  } else {
    document.body.style.removeProperty('width');
    document.body.style.removeProperty('height');
  }
  document.body.classList.toggle('screen-compact', w < 1366 || h < 768);
  document.body.classList.toggle('screen-dense', w < 1500 || h < 820 || density >= 1.25);
  document.body.classList.toggle('screen-narrow', w < 1180);
  document.body.classList.toggle('screen-short', h < 680);
  document.documentElement.style.setProperty('--viewport-width', `${w}px`);
  document.documentElement.style.setProperty('--viewport-height', `${h}px`);
  document.documentElement.style.setProperty('--device-scale', String(density));
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

function applyIndentGuidePreference(style = 'subtle') {
  const accepted = ['subtle', 'visible', 'off'];
  state.indentGuideStyle = accepted.includes(style) ? style : 'subtle';
  document.body.classList.remove('indent-guides-subtle', 'indent-guides-visible', 'indent-guides-off');
  document.body.classList.add(`indent-guides-${state.indentGuideStyle}`);
  const labels = { subtle: 'Guías: sutiles', visible: 'Guías: visibles', off: 'Guías: ocultas' };
  if (DOM.btnIndentGuides) {
    DOM.btnIndentGuides.textContent = labels[state.indentGuideStyle];
    DOM.btnIndentGuides.setAttribute('aria-label', `Guías de sangría: ${labels[state.indentGuideStyle].split(': ')[1]}`);
  }
  localStorage.setItem('codego_indent_guides', state.indentGuideStyle);
}

function cycleIndentGuidePreference() {
  const order = ['subtle', 'visible', 'off'];
  applyIndentGuidePreference(order[(order.indexOf(state.indentGuideStyle) + 1) % order.length]);
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
  pygame:    { icon: 'PG', name: 'Pygame',               cat: 'games'    },
  numpy:     { icon: 'NP', name: 'NumPy',                cat: 'math'     },
  matplotlib:{ icon: 'MP', name: 'Matplotlib',           cat: 'data'     },
  pandas:    { icon: 'PD', name: 'Pandas',               cat: 'data'     },
  requests:  { icon: 'RQ', name: 'Requests',             cat: 'net'      },
  PIL:       { icon: 'PL', name: 'Pillow (PIL)',         cat: 'games'    },
  scipy:     { icon: 'SP', name: 'SciPy',                cat: 'math'     },
  seaborn:   { icon: 'SB', name: 'Seaborn',              cat: 'data'     },
  openpyxl:  { icon: 'XL', name: 'OpenPyXL (Excel)',     cat: 'data'     },
  sympy:     { icon: 'SY', name: 'SymPy (Álgebra)',      cat: 'math'     },
  colorama:  { icon: 'CL', name: 'Colorama (Consola)',   cat: 'net'      },
  // --- Hardware: Arduino / ESP32 / Microcontroladores ---
  serial:    { icon: 'SR', name: 'PySerial (Arduino / ESP32)',  cat: 'hardware' },
  esptool:   { icon: 'ES', name: 'ESPTool (Flash ESP32/ESP8266)', cat: 'hardware' },
  pyfirmata2:{ icon: 'PF', name: 'PyFirmata2 (Arduino Firmata)', cat: 'hardware' },
  usb:       { icon: 'US', name: 'PyUSB (USB directo)',  cat: 'hardware' },
  // --- Raspberry Pi / SBC ---
  smbus2:    { icon: 'I2', name: 'SMBus2 (I2C / RPi)',  cat: 'hardware' },
  gpiozero:  { icon: 'GP', name: 'GPIOZero (RPi GPIO)', cat: 'hardware' },
  board:     { icon: 'BL', name: 'Adafruit Blinka (CircuitPython)', cat: 'hardware' },
  // --- Machine Learning y Visión ---
  sklearn:   { icon: 'ML', name: 'Scikit-learn (ML)',   cat: 'math'     },
  cv2:       { icon: 'CV', name: 'OpenCV (Visión)',     cat: 'math'     },
  // --- Web y Redes ---
  websockets:{ icon: 'WS', name: 'WebSockets (IoT)',    cat: 'net'      },
  flask:     { icon: 'FL', name: 'Flask (Servidor Web)', cat: 'net'     },
  httpx:     { icon: 'HX', name: 'HTTPX (HTTP moderno)', cat: 'net'     },
  // --- Utilidades educativas ---
  tqdm:      { icon: 'TD', name: 'TQDM (Progreso)',     cat: 'net'      },
  rich:      { icon: 'RI', name: 'Rich (Terminal)', cat: 'net'   },
  qrcode:    { icon: 'QR', name: 'QRCode (Códigos QR)', cat: 'data'    },
  cryptography:{ icon: 'CR', name: 'Cryptography (Cifrado)', cat: 'net' },
  pydantic:  { icon: 'PY', name: 'Pydantic (Validación)', cat: 'data'  },
  // --- Sistema (built-in) ---
  sqlite3:   { icon: 'SQ', name: 'SQLite3 (SQL)',       cat: 'data'     },
  tkinter:   { icon: 'TK', name: 'Tkinter (GUI)',       cat: 'games'    },
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
    const config = PKG_CONFIG[key] || { icon: key.slice(0, 2).toUpperCase(), name: key, cat: 'other' };

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

async function openOfflineLanguagesManager() {
  if (DOM.modalOfflineLanguages) {
    DOM.modalOfflineLanguages.classList.remove('hidden');
    state.isInternalModalOpen = true;
    await renderOfflineLanguagesGrid();
  }
}

async function renderOfflineLanguagesGrid() {
  if (!DOM.offlineLangsGrid) return;
  DOM.offlineLangsGrid.innerHTML = '<div style="padding:18px; text-align:center; color:#8b949e;">Detectando compiladores y herramientas locales...</div>';

  let toolchains = null;
  if (window.electronAPI && window.electronAPI.detectLanguages) {
    try {
      toolchains = await window.electronAPI.detectLanguages();
      state.detectedToolchains = toolchains;
    } catch (e) {
      console.error('Error detectando compiladores:', e);
    }
  }

  const langs = [
    {
      id: 'python',
      name: 'Python 3',
      icon: '🐍',
      desc: 'Intérprete Python 3, bibliotecas científicas (NumPy, Matplotlib, Pandas) y hardware/IoT (PySerial, Esptool).',
      info: toolchains?.python,
      cmd: toolchains?.python?.command,
      ver: toolchains?.python?.version
    },
    {
      id: 'cpp',
      name: 'C / C++ (GNU GCC & G++)',
      icon: '⚙️',
      desc: 'Compilador nativo GNU GCC/G++, CMake, Make y bibliotecas estándar STL (iostream, vector, cmath, algorithm).',
      info: toolchains?.cpp,
      cmd: toolchains?.cpp?.compiler,
      ver: toolchains?.cpp?.version
    },
    {
      id: 'java',
      name: 'Java (OpenJDK)',
      icon: '☕',
      desc: 'Entorno de desarrollo Java JDK (javac compiler, java runtime, Scanner, colecciones y Streams).',
      info: toolchains?.java,
      cmd: toolchains?.java?.compiler || toolchains?.java?.runner,
      ver: toolchains?.java?.version
    },
    {
      id: 'javascript',
      name: 'JavaScript (Node.js)',
      icon: '🟨',
      desc: 'Motor V8 de ejecución de JavaScript en consola y scripts con módulos estándar (Node.js LTS).',
      info: toolchains?.javascript,
      cmd: toolchains?.javascript?.runner,
      ver: toolchains?.javascript?.version
    },
    {
      id: 'r',
      name: 'R (Estadística)',
      icon: '📊',
      desc: 'Entorno estadístico y numérico con dataframes, gráficos y computación científica.',
      info: toolchains?.r,
      cmd: toolchains?.r?.runner,
      ver: toolchains?.r?.version
    }
  ];

  let html = '';
  langs.forEach(item => {
    const isInstalled = item.info ? Boolean(item.info.installed) : false;
    const badgeClass = isInstalled ? 'ok' : 'missing';
    const badgeText = isInstalled ? `✓ Listo ${item.ver ? '(' + item.ver + ')' : ''}` : '⚠️ No detectado';
    const pathText = item.cmd ? `<span style="font-family:monospace; font-size:11px; color:#58a6ff;">${escapeHtml(item.cmd)}</span>` : '<span style="color:#f85149; font-size:11px;">Ejecutable no encontrado en PATH del sistema</span>';

    html += `
      <div class="offline-lang-item">
        <div class="lang-item-left">
          <span class="lang-item-icon">${item.icon}</span>
          <div class="lang-item-info">
            <span class="lang-item-name">${item.name}</span>
            <span class="lang-item-detail">${item.desc}</span>
            <div style="margin-top:4px;">${pathText}</div>
          </div>
        </div>
        <div>
          <span class="lang-item-badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>
    `;
  });

  DOM.offlineLangsGrid.innerHTML = html;

  if (DOM.offlineScriptCmdText) {
    const isWin = navigator.platform.toLowerCase().includes('win');
    DOM.offlineScriptCmdText.textContent = isWin
      ? '.\\scripts\\setup-languages-win.ps1 -All'
      : './scripts/setup-languages-linux.sh --all';
  }
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
  if (DOM.setupErrorCommandWrap && DOM.setupErrorCommand) {
    DOM.setupErrorCommandWrap.classList.toggle('hidden', !safe.command);
    DOM.setupErrorCommand.textContent = safe.command || '';
  }
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
  applyIndentGuidePreference(state.indentGuideStyle);
  checkAndDisplayLastSession();
  if (DOM.startupStatus) DOM.startupStatus.textContent = 'Cargando la interfaz y leyendo la configuración local…';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const timeoutValue = (promise, ms, fallback) => Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
  const [environmentStatus, , recoveryStatus, pinPolicy] = await Promise.all([
    window.electronAPI?.getEnvironmentStatus
      ? timeoutValue(window.electronAPI.getEnvironmentStatus(), 8000, { ready: false, pending: true })
      : { ready: true },
    timeoutValue(loadVisibleAppVersion(), 2500, null),
    window.electronAPI?.getRecoveryStatus
      ? timeoutValue(window.electronAPI.getRecoveryStatus(), 2500, { success: false })
      : { success: false },
    window.electronAPI?.getTeacherPinPolicy
      ? timeoutValue(window.electronAPI.getTeacherPinPolicy(), 2500, { managed: false })
      : { managed: false }
  ]);
  state.teacherPinManaged = pinPolicy?.managed === true;
  DOM.examPinSetup?.classList.toggle('managed-pin', state.teacherPinManaged);
  if (state.teacherPinManaged && DOM.examPinHelp) DOM.examPinHelp.textContent = 'El PIN de salida está administrado por esta institución.';
  state.environmentReady = environmentStatus?.ready === true;
  switchView('lobby');
  if (recoveryStatus?.interruptedExam) {
    const interrupted = recoveryStatus.interruptedExam;
    await showNotice(
      `La sesión ${interrupted.examId ? `\u201c${interrupted.examId}\u201d ` : ''}terminó sin una entrega ni una salida autorizada. El profesor debe revisar esta incidencia antes de comenzar otra evaluación.`,
      { title: 'Examen interrumpido', kind: 'danger', confirmLabel: 'Entendido' }
    );
    await window.electronAPI.acknowledgeRecovery?.();
  }
  if (!state.environmentReady) {
    setTimeout(() => void startAutoRepairProcess(), 0);
  } else {
    setTimeout(() => void loadEnvironmentDiagnostics(), 0);
  }
  // Network work never blocks the first interactive screen.
  setTimeout(() => void checkUpdatesSilently(), 900);
  startWifiMonitoring();
  window.addEventListener('online', () => window.electronAPI?.checkAndInstallUpdates?.());
}

const RECENT_PROJECTS_KEY = 'codego_recent_projects';
const MAX_RECENT_PROJECTS = 3;

function readRecentProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(project => project
      && project.appMode !== 'exam'
      && typeof project.workspacePath === 'string'
      && project.workspacePath.trim());
  } catch (_) {
    return [];
  }
}

function writeRecentProjects(projects) {
  try {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects.slice(0, MAX_RECENT_PROJECTS)));
  } catch (_) {}
}

function removeRecentProject(workspacePath) {
  writeRecentProjects(readRecentProjects().filter(project => project.workspacePath !== workspacePath));
  renderRecentProjects();
}

function rememberRecentProject() {
  if (!state.workspacePath || state.appMode === 'exam') return;
  const current = {
    workspacePath: state.workspacePath,
    workspaceName: state.workspaceName || state.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto',
    studentName: DOM.studentNameInput?.value.trim() || state.studentName || '',
    studentId: DOM.studentIdInput?.value.trim() || state.studentId || '',
    examSubject: DOM.examSubjectInput?.value.trim() || state.examSubject || 'Programación en Python',
    appMode: state.appMode || 'activity',
    lastOpenedAt: Date.now()
  };
  const projects = readRecentProjects().filter(project => project.workspacePath !== current.workspacePath);
  writeRecentProjects([current, ...projects]);
  renderRecentProjects();
}

function applySavedProjectDetails(project) {
  if (project.studentName && DOM.studentNameInput) DOM.studentNameInput.value = project.studentName;
  if (project.studentId && DOM.studentIdInput) DOM.studentIdInput.value = project.studentId;
  if (project.examSubject && DOM.examSubjectInput) DOM.examSubjectInput.value = project.examSubject;
  setSessionMode(project.appMode || 'activity');
}

async function openSavedProject(project, triggerButton = null) {
  if (!project?.workspacePath || project.appMode === 'exam' || !window.electronAPI?.restoreWorkspace) {
    showLobbyValidation('No se pudo abrir el proyecto guardado. Elige una carpeta para continuar.');
    return false;
  }
  applySavedProjectDetails(project);
  const previousLabel = triggerButton?.innerHTML;
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = 'Abriendo…';
  }
  try {
    const restored = await window.electronAPI.restoreWorkspace(project.workspacePath);
    if (!setWorkspaceSelection(restored)) {
      removeRecentProject(project.workspacePath);
      showLobbyValidation(restored?.error || 'La carpeta guardada ya no está disponible. Elige otra carpeta.');
      return false;
    }
    await handleStartExamClick();
    return true;
  } catch (error) {
    showLobbyValidation(error.message || 'No se pudo abrir el proyecto guardado.');
    return false;
  } finally {
    if (triggerButton && triggerButton.isConnected) {
      triggerButton.disabled = false;
      triggerButton.innerHTML = previousLabel;
    }
  }
}

function showLobbyValidation(message) {
  if (!DOM.lobbyValidationBanner || !DOM.lobbyValidationText) return;
  DOM.lobbyValidationText.textContent = message;
  DOM.lobbyValidationBanner.classList.remove('hidden');
}

function renderRecentProjects() {
  if (!DOM.recentProjects || !DOM.recentProjectList) return;
  const projects = readRecentProjects().slice(0, MAX_RECENT_PROJECTS);
  DOM.recentProjectList.replaceChildren();
  DOM.recentProjects.classList.toggle('hidden', projects.length === 0);
  projects.forEach(project => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-project-btn';
    button.title = project.workspacePath;
    const name = document.createElement('strong');
    name.textContent = project.workspaceName || project.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto';
    const subject = document.createElement('small');
    subject.textContent = project.examSubject || 'Programación en Python';
    button.append(name, subject);
    button.addEventListener('click', () => openSavedProject(project, button));
    DOM.recentProjectList.appendChild(button);
  });
}

function checkAndDisplayLastSession() {
  renderRecentProjects();
  try {
    const raw = localStorage.getItem('codego_last_session');
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session) return;
    if (session.appMode === 'exam') {
      localStorage.removeItem('codego_last_session');
      return;
    }

    if (session.workspacePath && !readRecentProjects().some(project => project.workspacePath === session.workspacePath)) {
      writeRecentProjects([{
        workspacePath: session.workspacePath,
        workspaceName: session.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto',
        studentName: session.studentName || '',
        studentId: session.studentId || '',
        examSubject: session.examSubject || 'Programación en Python',
        appMode: session.appMode || 'activity',
        lastOpenedAt: Date.now()
      }, ...readRecentProjects()]);
      renderRecentProjects();
    }

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
      setSessionMode(session.appMode || 'activity');
      const modeLabel = session.appMode === 'task'
        ? 'TAREA EN CURSO'
        : (session.appMode === 'activity' ? 'Actividad en curso' : 'Examen en curso');
      if (DOM.continueModeBadge) DOM.continueModeBadge.textContent = modeLabel;
      if (DOM.continueTimeLabel) DOM.continueTimeLabel.textContent = `Guardado: ${session.lastSavedDate || 'Recientemente'}`;
      if (DOM.continueSubjectTitle) DOM.continueSubjectTitle.textContent = `Materia: ${session.examSubject || 'Programación en Python'}`;
      if (DOM.continueFileLabel) DOM.continueFileLabel.textContent = `Proyecto anterior: ${session.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto'}`;
      DOM.lobbyContinueCard.classList.remove('hidden');

      if (DOM.btnContinueLastSession) {
        DOM.btnContinueLastSession.onclick = () => openSavedProject(session, DOM.btnContinueLastSession);
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
        <li><strong>Espacio limpio:</strong> codeGO crea un archivo vacío y aislado con tu nombre y el ID del examen.</li>
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
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'Iniciar tarea / actividad';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Trabajo supervisado';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.textContent = 'Durante la tarea o actividad';
    if (DOM.lobbyRulesList) {
      DOM.lobbyRulesList.innerHTML = `
        <li><strong>Edición flexible:</strong> Puedes copiar, cortar y pegar mientras desarrollas tu tarea.</li>
        <li><strong>Supervisión:</strong> Cada salida del programa queda registrada y requiere una espera de 12 segundos al regresar.</li>
        <li><strong>Registro de actividad:</strong> Se conservan el tiempo de edición y las pruebas ejecutadas como contexto para el docente.</li>
        <li><strong>Entrega verificable:</strong> Genera un contenedor .codego firmado con Ed25519 para comprobar su integridad.</li>
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
      DOM.activityActionsToolbar.classList.remove('hidden');
      DOM.activityActionsToolbar.style.display = 'inline-flex';
    }
  } else {
    document.body.classList.add('mode-activity-active');
    if (DOM.startBtnTitle) DOM.startBtnTitle.textContent = 'Abrir modo libre';
    if (DOM.startBtnSubtitle) DOM.startBtnSubtitle.textContent = 'Sin supervisión';
    if (DOM.lobbyRulesTitle) DOM.lobbyRulesTitle.textContent = 'En modo libre';
    if (DOM.lobbyRulesList) {
      DOM.lobbyRulesList.innerHTML = `
        <li><strong>Gestión de Archivos:</strong> Puedes abrir cualquier carpeta en tu equipo o crear nuevos proyectos en Python.</li>
        <li><strong>Conectividad Libre:</strong> La conexión a red permanece habilitada durante la sesión.</li>
        <li><strong>Trabajo libre:</strong> Puedes cambiar de programa y consultar materiales sin generar incidencias.</li>
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
  DOM.examIdInput?.addEventListener('input', () => {
    DOM.examIdInput.classList.remove('input-field-error');
    DOM.lobbyValidationBanner?.classList.add('hidden');
  });
  DOM.btnCopySetupCommand?.addEventListener('click', async () => {
    const command = DOM.setupErrorCommand?.textContent || '';
    if (!command) return;
    await navigator.clipboard.writeText(command);
    DOM.btnCopySetupCommand.textContent = 'Copiado';
    setTimeout(() => { DOM.btnCopySetupCommand.textContent = 'Copiar comando'; }, 1600);
  });
  DOM.btnGoHome?.addEventListener('click', handleGoHome);
  DOM.btnUpdateIde?.addEventListener('click', handleStartUpdate);
  DOM.btnSaveGradeReceipt?.addEventListener('click', handleSaveGradeReceipt);

  // Activity toolbar actions (open folder, create project)
  if (DOM.btnActivityOpenFolder) {
    DOM.btnActivityOpenFolder.addEventListener('click', handleOpenWorkspaceFolder);
  }
  if (DOM.btnActivityNewProject) {
    DOM.btnActivityNewProject.addEventListener('click', handleCreateNewProject);
  }
  DOM.btnRevealWorkspace?.addEventListener('click', revealWorkspaceInSystem);
  DOM.btnRevealWorkspaceSidebar?.addEventListener('click', revealWorkspaceInSystem);
  DOM.btnRevealSelectedWorkspace?.addEventListener('click', revealWorkspaceInSystem);

  // A finished delivery remains read-only. A task keeps normal clipboard
  // behavior throughout editing and is restricted only after it is sealed.
  document.addEventListener('copy', (e) => {
    if (isWorkspaceLocked()) {
      e.preventDefault();
      appendTerminalOutput('La entrega sellada está protegida contra cambios y copia.', 'system');
    }
  });
  document.addEventListener('cut', (e) => {
    if (isWorkspaceLocked()) e.preventDefault();
  });
  document.addEventListener('paste', (e) => {
    if (isWorkspaceLocked()) e.preventDefault();
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
  document.querySelectorAll('[data-support-link]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await window.electronAPI?.openSupportPage?.();
        if (result && !result.success) showNotice(result.error);
      } finally {
        button.disabled = false;
      }
    });
  });
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
  DOM.btnCloseRuntimeError?.addEventListener('click', () => {
    DOM.modalRuntimeError.classList.add('hidden');
    DOM.codeTextarea?.focus({ preventScroll: true });
  });
  DOM.btnRuntimeErrorLine?.addEventListener('click', () => {
    if (state.runtimeErrorLocation?.line) goToEditorLine(state.runtimeErrorLocation.line, state.runtimeErrorLocation.column);
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

  DOM.languageSelect?.addEventListener('change', () => {
    state.selectedLanguage = DOM.languageSelect.value;
    const help = {
      python: 'Python está listo para trabajar sin conexión.',
      cpp: 'C y C++ usan el compilador disponible en este equipo.',
      java: 'Java usa el JDK disponible en este equipo.',
      javascript: 'JavaScript usa Node.js en este equipo.',
      r: 'R usa el entorno instalado en este equipo.'
    };
    if (DOM.languageSelectionHelp) DOM.languageSelectionHelp.textContent = help[state.selectedLanguage] || '';
    updateActiveLanguageBadge();
    sounds.playFeedback('info');
  });

  // Offline Environments Manager Modal Handlers
  DOM.btnOpenOfflineManager?.addEventListener('click', openOfflineLanguagesManager);
  DOM.btnOpenOfflineManagerMenu?.addEventListener('click', openOfflineLanguagesManager);
  DOM.btnCloseOfflineModal?.addEventListener('click', () => {
    DOM.modalOfflineLanguages?.classList.add('hidden');
    state.isInternalModalOpen = false;
  });
  DOM.btnCloseOfflineManagerConfirm?.addEventListener('click', () => {
    DOM.modalOfflineLanguages?.classList.add('hidden');
    state.isInternalModalOpen = false;
  });
  DOM.modalOfflineLanguages?.addEventListener('click', (e) => {
    if (e.target === DOM.modalOfflineLanguages) {
      DOM.modalOfflineLanguages.classList.add('hidden');
      state.isInternalModalOpen = false;
    }
  });

  DOM.btnCopyOfflineCmd?.addEventListener('click', () => {
    const cmd = DOM.offlineScriptCmdText?.textContent || '';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cmd);
      DOM.btnCopyOfflineCmd.textContent = '¡Copiado!';
      setTimeout(() => { if (DOM.btnCopyOfflineCmd) DOM.btnCopyOfflineCmd.textContent = 'Copiar'; }, 2000);
    }
  });

  DOM.btnTestCompilers?.addEventListener('click', async () => {
    DOM.btnTestCompilers.disabled = true;
    DOM.btnTestCompilers.textContent = 'Probando...';
    try {
      await renderOfflineLanguagesGrid();
      showNotice('✓ Comprobación de compiladores finalizada.');
    } finally {
      DOM.btnTestCompilers.disabled = false;
      DOM.btnTestCompilers.textContent = '🧪 Probar Compiladores';
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
  DOM.btnIndentGuides?.addEventListener('click', cycleIndentGuidePreference);
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
    if (isWorkspaceLocked()) {
      e.preventDefault();
    }
  });
  DOM.codeTextarea.addEventListener('cut', (e) => {
    if (isWorkspaceLocked()) {
      e.preventDefault();
    }
  });
  DOM.codeTextarea.addEventListener('paste', (e) => {
    if (isWorkspaceLocked()) {
      e.preventDefault();
      return;
    }
  });

  // Python Execution Controls
  DOM.btnRunCode.addEventListener('click', runCurrentPythonCode);
  DOM.btnStopCode.addEventListener('click', stopRunningPythonCode);
  DOM.btnEditorDiagnosticLine?.addEventListener('click', () => goToEditorLine(state.syntaxDiagnosticLine, state.syntaxDiagnosticColumn));
  DOM.btnEditorDiagnosticHelp?.addEventListener('click', showSyntaxDiagnosticHelp);

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
    // Media keys remain available during ordinary work. They are intercepted
    // only while the classroom alarm is actually sounding.
    if (sounds.isSirenPlaying && (state.appMode === 'exam' || state.appMode === 'task') && (['AudioVolumeMute', 'VolumeMute', 'AudioVolumeDown', 'VolumeDown'].includes(e.key) || e.code === 'AudioVolumeMute' || e.code === 'AudioVolumeDown')) {
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
    if (e.key === 'F8' && state.syntaxDiagnosticLine) {
      e.preventDefault();
      goToEditorLine(state.syntaxDiagnosticLine, state.syntaxDiagnosticColumn);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentFile({ manual: true });
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
      if (DOM.modalOfflineLanguages && !DOM.modalOfflineLanguages.classList.contains('hidden')) {
        DOM.modalOfflineLanguages.classList.add('hidden');
        state.isInternalModalOpen = false;
      }
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
    if (!saved) showNotice('No se pudo guardar. La aplicación permanecerá abierta para conservar tus cambios.');
    await window.electronAPI.confirmClose(saved);
  });
  if (!window.electronAPI) return;

  window.electronAPI.onUpdateState?.((payload) => {
    renderAutomaticUpdateState(payload);
  });

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
    const currentDisplay = data.displays?.find(display => display.isPrimary) || data.displays?.[0];
    if (currentDisplay) {
      document.documentElement.style.setProperty('--display-scale', String(currentDisplay.scaleFactor || 1));
      document.body.dataset.displayProfile = `${currentDisplay.workArea?.width || currentDisplay.bounds?.width || 'unknown'}x${currentDisplay.workArea?.height || currentDisplay.bounds?.height || 'unknown'}`;
    }
    // Multiple displays become part of the same repeatable warning state.
    if (data.isMultiple && state.examSessionActive && state.appMode === 'exam' && !state.isExamSubmitted) {
      DOM.lockMonitorsCount.textContent = `${data.count} pantallas`;
      DOM.modalMultimonitor.classList.add('hidden');
      if (!state.monitorViolationActive) {
        state.monitorViolationActive = true;
        handleSecurityViolation({ type: 'MULTIPLE_DISPLAYS', phase: 'away', timestamp: new Date().toLocaleTimeString() });
      }
    } else {
      DOM.modalMultimonitor.classList.add('hidden');
      if (state.monitorViolationActive) {
        state.monitorViolationActive = false;
        handleSecurityViolation({ type: 'MULTIPLE_DISPLAYS_RESOLVED', phase: 'returned', durationSeconds: 0 });
      }
    }
  });

  // Blur detected (student switched away to another application)
  window.electronAPI.onBlurDetected((data) => {
    if (!state.workspaceSessionActive || state.isExamSubmitted) return;
    handleSecurityViolation(data || {});
  });

  // Focus regained (student returned to the window)
  window.electronAPI.onFocusRegained((data) => {
    if (!state.workspaceSessionActive || state.isExamSubmitted) return;
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
  const nextPath = result.workspacePath || '';
  const changedWorkspace = Boolean(state.workspacePath && nextPath && state.workspacePath !== nextPath);
  if (changedWorkspace) {
    state.openTabs = [];
    state.activeFilePath = '';
    if (DOM.codeTextarea) DOM.codeTextarea.value = '';
    renderTabs();
    updateEditorEmptyState();
  }
  state.workspaceSelected = true;
  state.workspacePath = nextPath;
  state.workspaceName = result.workspaceName || state.workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Proyecto';
  state.collapsedFolders = new Set();
  state.workspaceTreeInitialized = false;
  if (DOM.workspaceSelectionStatus) {
    DOM.workspaceSelectionStatus.textContent = `Seleccionado: ${state.workspaceName}`;
    DOM.workspaceSelectionStatus.title = state.workspacePath;
    DOM.workspaceSelectionStatus.classList.add('selected');
  }
  DOM.btnRevealSelectedWorkspace?.classList.remove('hidden');
  if (DOM.lobbyValidationBanner) DOM.lobbyValidationBanner.classList.add('hidden');
  if (state.appMode !== 'exam') rememberRecentProject();
  return true;
}

function isWorkspaceLocked() {
  return (state.appMode === 'exam' && state.isExamSubmitted)
    || (state.appMode === 'task' && state.isTaskSubmitted);
}

function applyEditorLockState(locked = isWorkspaceLocked()) {
  if (!DOM.codeTextarea) return;
  DOM.codeTextarea.readOnly = locked;
  DOM.codeTextarea.classList.toggle('code-locked', locked);
  document.querySelector('.editor-wrapper')?.classList.toggle('locked', locked);
  if (DOM.btnNewFile) DOM.btnNewFile.disabled = locked;
  if (DOM.btnNewFolder) DOM.btnNewFolder.disabled = locked;
}

function prepareNewWorkspaceSession() {
  state.isExamSubmitted = false;
  state.isTaskSubmitted = false;
  state.isSubmitting = false;
  state.editorErrorLine = null;
  state.runtimeErrorLocation = null;
  applyEditorLockState(false);
  DOM.examLockedBadge?.classList.add('hidden');
  DOM.navWaitingReviewBadge?.classList.add('hidden');
  DOM.postSubmissionToolbar?.classList.add('hidden');
}

async function chooseWorkspaceFolder() {
  if (!window.electronAPI?.openFolderDialog) {
    showNotice('La selección de carpetas está disponible en la aplicación de escritorio.');
    return null;
  }
  const result = await window.electronAPI.openFolderDialog();
  return setWorkspaceSelection(result) ? result : null;
}

async function createBlankWorkspace() {
  const projectName = await requestName('Nombre del proyecto', 'Mi proyecto');
  if (!projectName) return null;
  if (!window.electronAPI?.createProjectDialog) {
    showNotice('La creación de proyectos está disponible en la aplicación de escritorio.');
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
  const examId = DOM.examIdInput?.value.trim() || '';
  const teacherPin = DOM.examTeacherPinInput?.value.trim() || '';
  const teacherPinConfirm = DOM.examTeacherPinConfirmInput?.value.trim() || '';

  // Clean previous visual error states
  DOM.studentNameInput.classList.remove('input-field-error');
  DOM.studentIdInput.classList.remove('input-field-error');
  DOM.examIdInput?.classList.remove('input-field-error');
  DOM.examTeacherPinInput?.classList.remove('input-field-error');
  DOM.examTeacherPinConfirmInput?.classList.remove('input-field-error');
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

  if (state.appMode === 'exam' && !examId) {
    DOM.examIdInput?.classList.add('input-field-error');
    if (DOM.lobbyValidationBanner && DOM.lobbyValidationText) {
      DOM.lobbyValidationText.textContent = 'Escribe el ID que el profesor dictó para este examen.';
      DOM.lobbyValidationBanner.classList.remove('hidden');
    }
    DOM.examIdInput?.focus();
    return;
  }

  if (state.appMode === 'exam' && !state.teacherPinManaged && (!/^\d{4,12}$/.test(teacherPin) || teacherPin !== teacherPinConfirm)) {
    DOM.examTeacherPinInput?.classList.add('input-field-error');
    DOM.examTeacherPinConfirmInput?.classList.add('input-field-error');
    showLobbyValidation(!/^\d{4,12}$/.test(teacherPin)
      ? 'El profesor debe definir un PIN de 4 a 12 dígitos antes de iniciar.'
      : 'La confirmación del PIN no coincide.');
    DOM.examTeacherPinInput?.focus();
    return;
  }

  if (state.appMode !== 'exam' && !state.workspaceSelected) {
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
  state.student.examId = examId;
  state.student.language = state.selectedLanguage;
  state.student.mode = state.appMode;
  state.pendingTeacherPin = state.appMode === 'exam' ? teacherPin : '';
  prepareNewWorkspaceSession();

  // Update IDE topbar info
  DOM.navStudentLabel.textContent = `Alumno: ${name} (${id})`;
  DOM.navSubjectLabel.textContent = subject;

  if (state.appMode === 'exam') {
    const confirmed = await askConfirmation(
      'Guarda primero cualquier trabajo externo. Al iniciar, codeGO cerrará navegadores, asistentes de IA y editores conocidos, desconectará la red y activará la supervisión.',
      { title: 'Iniciar examen supervisado', kind: 'danger', confirmLabel: 'Iniciar examen' }
    );
    if (!confirmed) return;
    // Launch countdown sequence for exam with kiosk lock
    await startCountdownSequence();
  } else if (state.appMode === 'task') {
    // Task Mode: regular desktop editing with a signed delivery and session metrics.
    if (window.electronAPI && window.electronAPI.startKiosk) {
      const result = await window.electronAPI.startKiosk({ ...state.student, mode: 'task' });
      if (!result.success) { showNotice(result.error); return; }
    }
    enterIdeWorkspace();
  } else {
    // Activity Mode: start immediately without kiosk lockdown or anti-cheat triggers
    state.examSessionActive = false;
    if (window.electronAPI && window.electronAPI.startKiosk) {
      const result = await window.electronAPI.startKiosk({ ...state.student, mode: 'activity' });
      if (!result.success) { showNotice(result.error); return; }
    }
    enterIdeWorkspace();
  }
}

async function startCountdownSequence() {

  // Trigger lockdown in main process immediately for exam
  if (window.electronAPI && window.electronAPI.startKiosk) {
    const result = await window.electronAPI.startKiosk({ ...state.student, mode: 'exam', teacherPin: state.pendingTeacherPin });
    state.pendingTeacherPin = '';
    if (!result.success) { showNotice(result.error); return; }
    if (DOM.examTeacherPinInput) DOM.examTeacherPinInput.value = '';
    if (DOM.examTeacherPinConfirmInput) DOM.examTeacherPinConfirmInput.value = '';
    setWorkspaceSelection(result);
    state.examInitialFile = result.initialFile || '';
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
  state.isSubmitting = false;
  applyEditorLockState();
  if (DOM.lobbyUpdateBanner) DOM.lobbyUpdateBanner.classList.add('hidden');
  handleCloseReleaseNotes();

  if (state.appMode === 'exam') {
    document.body.classList.remove('mode-activity-active', 'mode-task-active');
    document.body.classList.add('mode-exam-active');
    state.examSessionActive = true; // Security watchdog & kiosk active only in exam mode
    if (DOM.sessionPolicyBadge) DOM.sessionPolicyBadge.textContent = 'Examen supervisado';
    // Mode Exam: Clear & prominent crimson badge, timer visible, finish exam button visible
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-exam';
      DOM.navModeIndicator.title = 'Sesión de Examen Supervisada con Auditoría de Integridad Activa';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = state.student.examId ? `Examen · ${state.student.examId}` : 'Examen supervisado';
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
    state.examSessionActive = true;
    if (DOM.sessionPolicyBadge) DOM.sessionPolicyBadge.textContent = 'Supervisión activa';
    if (DOM.navModeIndicator) {
      DOM.navModeIndicator.className = 'nav-mode-indicator mode-task';
      DOM.navModeIndicator.title = 'Tarea con entrega firmada y registro de actividad';
    }
    if (DOM.navModeText) {
      DOM.navModeText.textContent = 'Tarea / actividad supervisada';
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
      DOM.activityActionsToolbar.classList.remove('hidden');
      DOM.activityActionsToolbar.style.display = 'inline-flex';
    }
    if (DOM.sidebarTitleLabel) {
      DOM.sidebarTitleLabel.textContent = 'ESPACIO DE TAREA';
    }
    if (DOM.workspaceHintLabel) {
      DOM.workspaceHintLabel.textContent = 'Edición flexible con entrega verificable';
    }

    state.examStartTime = Date.now();
    state.taskTelemetry.lastKeystrokeTime = Date.now();
    startExamTimer();
  } else {
    document.body.classList.remove('mode-exam-active', 'mode-task-active');
    document.body.classList.add('mode-activity-active');
    state.examSessionActive = false; // Mode Activity has NO anti-cheat monitoring or timer
    if (DOM.sessionPolicyBadge) DOM.sessionPolicyBadge.textContent = 'Modo libre';
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

  loadWorkspaceFiles().then(async () => {
    if (state.appMode === 'exam' && state.examInitialFile) {
      await openFileInEditor(state.examInitialFile);
    } else if (state.activeFilePath && state.openTabs.some(tab => tab.path === state.activeFilePath)) {
      await openFileInEditor(state.activeFilePath);
    }
    await focusEditorReliably();
  });
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
  DOM.viewStartup?.classList.remove('active');
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
  const internalModalIds = [
    'modal-offline-languages',
    'modal-package-manager',
    'modal-auto-installer',
    'modal-shortcuts',
    'modal-runtime-error',
    'modal-teacher-unlock',
    'modal-submit-exam',
    'modal-submission-success',
    'modal-task-submit',
    'modal-verify-submission',
    'modal-release-notes',
    'app-dialog'
  ];
  return internalModalIds.some(id => {
    const el = document.getElementById(id);
    if (el instanceof HTMLDialogElement) return el.open;
    return el && !el.classList.contains('hidden');
  });
}

// ==============================================================
// 9. ANTI-CHEAT & SECURITY VIOLATION ENGINE
// ==============================================================
function clearHazardTimers() {
  if (state.hazardCountdownInterval) clearInterval(state.hazardCountdownInterval);
  if (state.hazardAudioInterval) clearInterval(state.hazardAudioInterval);
  state.hazardCountdownInterval = null;
  state.hazardAudioInterval = null;
}

function beginHazardCountdown() {
  let remainingSeconds = 12;
  state.hazardAwaitingReturn = false;
  sounds.stopAlarmSiren();
  // Keep the OS volume guard active during the complete mandatory wait.
  window.electronAPI?.setAlarmActive?.(true);
  clearHazardTimers();
  sounds.playCountdownTick(false);
  state.hazardAudioInterval = setInterval(() => sounds.playCountdownTick(false), 1000);

  if (DOM.btnDismissHazard) {
    DOM.btnDismissHazard.disabled = true;
    DOM.btnDismissHazard.classList.remove('ready-to-resume');
    DOM.btnDismissHazard.classList.add('waiting');
  }

  const renderRemaining = () => {
    if (DOM.hazardCountdownText) DOM.hazardCountdownText.textContent = `${remainingSeconds}s`;
    if (DOM.hazardBtnLabel) DOM.hazardBtnLabel.textContent = `Espera ${remainingSeconds}s para reanudar...`;
  };
  renderRemaining();

  state.hazardCountdownInterval = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds > 0) {
      renderRemaining();
      return;
    }

    clearHazardTimers();
    sounds.playCountdownTick(true);
    window.electronAPI?.setAlarmActive?.(false);
    DOM.modalFocusWarning.classList.remove('hazard-luminescent');
    DOM.modalFocusWarning.querySelector('.modal-academic-warning-box')?.classList.remove('luminescent-box');

    if (DOM.btnDismissHazard) {
      DOM.btnDismissHazard.disabled = false;
      DOM.btnDismissHazard.classList.remove('waiting');
      DOM.btnDismissHazard.classList.add('ready-to-resume');
    }
    if (DOM.hazardCountdownText) DOM.hazardCountdownText.textContent = '0s';
    if (DOM.hazardBtnLabel) DOM.hazardBtnLabel.textContent = state.appMode === 'task' ? 'Reanudar tarea / actividad' : 'Reanudar examen';
  }, 1000);
}

function handleSecurityViolation(incidentData = {}) {
  if (state.appMode === 'activity' || !state.workspaceSessionActive || state.isExamSubmitted || state.isTaskSubmitted) return;

  const isReturned = incidentData.phase === 'returned';
  const warningVisible = !DOM.modalFocusWarning.classList.contains('hidden');

  if (isReturned) {
    if (!warningVisible || !state.hazardAwaitingReturn) return;
    if (incidentData.durationSeconds) DOM.hazardDuration.textContent = `${incidentData.durationSeconds} segundos`;
    beginHazardCountdown();
    return;
  }

  // Leaving again during the countdown always restarts the loud phase. Custom
  // codeGO dialogs remain supervised because they are part of the same window.
  clearHazardTimers();
  sounds.stopAlarmSiren();

  const reportedIncidents = Number(incidentData.totalIncidents);
  if (Number.isFinite(reportedIncidents) && reportedIncidents >= 0) {
    state.incidentsCount = Math.max(state.incidentsCount, reportedIncidents);
  } else {
    state.incidentsCount += 1;
  }
  updateIncidentsDisplay();

  const isTask = state.appMode === 'task';
  const titleEl = DOM.modalFocusWarning.querySelector('.academic-title');
  const subtitleEl = DOM.modalFocusWarning.querySelector('.academic-subtitle');
  const descEl = DOM.modalFocusWarning.querySelector('.academic-desc');
  if (titleEl) titleEl.textContent = isTask ? 'Aviso de supervisión' : 'Aviso de integridad';
  if (subtitleEl) subtitleEl.textContent = 'REGRESA A CODEGO';
  if (descEl) descEl.textContent = 'La alarma permanecerá activa hasta regresar. Al volver comenzará la espera obligatoria de 12 segundos.';
  if (DOM.hazardStrobeText) DOM.hazardStrobeText.textContent = isTask ? 'AVISO DE SUPERVISIÓN' : 'ALERTA DE EVALUACIÓN';

  DOM.hazardTime.textContent = incidentData.timestamp || new Date().toLocaleTimeString();
  DOM.hazardDuration.textContent = 'Fuera del entorno';
  DOM.hazardTotalIncidents.textContent = state.incidentsCount;
  if (DOM.hazardCountdownText) DOM.hazardCountdownText.textContent = '—';
  if (DOM.hazardBtnLabel) DOM.hazardBtnLabel.textContent = 'Regresa a codeGO para iniciar la cuenta';
  if (DOM.btnDismissHazard) {
    DOM.btnDismissHazard.disabled = true;
    DOM.btnDismissHazard.classList.remove('ready-to-resume');
    DOM.btnDismissHazard.classList.add('waiting');
  }

  state.hazardAwaitingReturn = true;
  DOM.modalFocusWarning.classList.remove('hidden');
  DOM.modalFocusWarning.classList.add('hazard-luminescent');
  DOM.modalFocusWarning.querySelector('.modal-academic-warning-box')?.classList.add('luminescent-box');
  window.electronAPI?.setAlarmActive?.(true);
  sounds.startAlarmSiren();
}

function dismissHazardWarning() {
  clearHazardTimers();
  state.hazardAwaitingReturn = false;
  window.electronAPI?.setAlarmActive?.(false);
  sounds.stopAlarmSiren();
  DOM.modalFocusWarning.classList.remove('hazard-luminescent');
  DOM.modalFocusWarning.querySelector('.modal-academic-warning-box')?.classList.remove('luminescent-box');
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
      if (!state.workspaceTreeInitialized) {
        state.collapsedFolders = new Set(workspaceFolderPaths(res.tree));
        state.workspaceTreeInitialized = true;
      }
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
    html += `<span class="crumb-sep">/</span><span class="crumb-folder">${escapeHtml(part)}</span>`;
  }
  if (fileName) html += `<span class="crumb-sep">/</span><span class="crumb-file" id="crumb-current-file">${escapeHtml(fileName)}</span>`;
  DOM.navBreadcrumbs.innerHTML = html;
}

function wireTreeDragSource(element, itemPath, itemType) {
  element.draggable = !isWorkspaceLocked();
  element.dataset.path = itemPath;
  element.dataset.itemType = itemType;
  element.addEventListener('dragstart', event => {
    if (isWorkspaceLocked()) { event.preventDefault(); return; }
    window.electronAPI?.setInternalInteraction?.(true).catch(() => {});
    state.draggedTreeItem = { path: itemPath, type: itemType };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemPath);
    requestAnimationFrame(() => element.classList.add('is-dragging'));
  });
  element.addEventListener('dragend', () => {
    window.electronAPI?.setInternalInteraction?.(false).catch(() => {});
    state.draggedTreeItem = null;
    element.classList.remove('is-dragging');
    document.querySelectorAll('.tree-drop-target').forEach(target => target.classList.remove('tree-drop-target'));
    DOM.fileTreeContainer?.classList.remove('tree-root-drop-target');
  });
}

function wireFolderDropTarget(element, targetDirectory) {
  element.addEventListener('dragover', event => {
    if (!state.draggedTreeItem || isWorkspaceLocked()) return;
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
  if (!window.electronAPI?.moveItem || isWorkspaceLocked()) return;
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

function workspaceFolderPaths(tree = state.filesTree, paths = []) {
  for (const item of tree || []) {
    if (item.type !== 'directory') continue;
    const folderPath = String(item.path || '').replace(/\\/g, '/');
    paths.push(folderPath);
    workspaceFolderPaths(item.children, paths);
  }
  return paths;
}

async function chooseAndMoveWorkspaceItem(sourcePath) {
  const available = workspaceFolderPaths().filter(folder => folder !== sourcePath && !folder.startsWith(`${sourcePath}/`));
  const response = await openAppDialog({
    title: 'Mover dentro del proyecto',
    message: `Elige el destino de “${sourcePath}”.`,
    confirmLabel: 'Mover aquí',
    cancelLabel: 'Cancelar',
    selectLabel: 'Carpeta de destino',
    selectOptions: [{ value: '', label: 'Raíz del proyecto' }, ...available.map(folder => ({ value: folder, label: folder }))]
  });
  if (!response.confirmed) return;
  const targetDirectory = response.value;
  await moveWorkspaceItem(sourcePath, targetDirectory);
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
          <button class="btn-tree-subaction" title="Crear archivo en esta carpeta" aria-label="Crear archivo en ${escapeHtml(item.name)}" data-action="new-file-in-folder" data-path="${escapeHtml(itemPath)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
          <button class="btn-tree-subaction" title="Crear subcarpeta" aria-label="Crear subcarpeta en ${escapeHtml(item.name)}" data-action="new-subfolder-in-folder" data-path="${escapeHtml(itemPath)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7h6l2 2h9v10h-17z"/><path d="M12 12v5M9.5 14.5h5"/></svg></button>
          <button class="btn-tree-subaction" title="Mover carpeta" aria-label="Mover ${escapeHtml(item.name)}" data-action="move-folder" data-path="${escapeHtml(itemPath)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 8l4 4-4 4"/></svg></button>
          <button class="btn-tree-subaction danger" title="Eliminar carpeta" aria-label="Eliminar ${escapeHtml(item.name)}" data-action="delete-folder" data-path="${escapeHtml(itemPath)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg></button>
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
          if (isWorkspaceLocked()) return;
          const fileName = await requestText('Nuevo archivo', 'helper.py', { message: `Se creará dentro de ${item.name}.`, label: 'Nombre del archivo' });
          if (fileName && fileName.trim()) {
            const cleanName = fileName.trim().replace(/^\/+/, '');
            const fullPath = `${itemPath}/${cleanName}`;
            if (window.electronAPI) {
              const res = await window.electronAPI.createFile(fullPath);
              if (!res.success) { showNotice(res.error); return; }
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
          if (isWorkspaceLocked()) return;
          const folderName = await requestText('Nueva subcarpeta', 'componentes', { message: `Se creará dentro de ${item.name}.`, label: 'Nombre de la carpeta' });
          if (folderName && folderName.trim()) {
            const cleanName = folderName.trim().replace(/^\/+/, '');
            const fullPath = `${itemPath}/${cleanName}`;
            if (window.electronAPI) {
              const res = await window.electronAPI.createFolder(fullPath);
              if (!res.success) { showNotice(res.error); return; }
              state.collapsedFolders.delete(itemPath);
              await loadWorkspaceFiles();
            }
          }
        });
      }

      const deleteFolderBtn = folderEl.querySelector('[data-action="delete-folder"]');
      const moveFolderBtn = folderEl.querySelector('[data-action="move-folder"]');
      moveFolderBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chooseAndMoveWorkspaceItem(itemPath);
      });
      if (deleteFolderBtn) {
        deleteFolderBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (isWorkspaceLocked()) return;
          if (await askConfirmation(`Se eliminará la carpeta “${item.name}” y todo su contenido.`, { title: 'Eliminar carpeta', kind: 'danger', confirmLabel: 'Eliminar' })) {
            if (window.electronAPI) {
              if (!await saveAllFiles()) return;
              const res = await window.electronAPI.deleteItem(itemPath);
              if (!res.success) { showNotice(res.error); return; }
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
          <button class="btn-tree-action" title="Mover archivo" aria-label="Mover ${escapeHtml(item.name)}" data-action="move" data-path="${escapeHtml(itemPath)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 8l4 4-4 4"/></svg></button>
          <button class="btn-tree-action danger" title="Eliminar archivo" aria-label="Eliminar ${escapeHtml(item.name)}" data-action="delete" data-path="${escapeHtml(itemPath)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg></button>
        </div>
      `;

      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('.btn-tree-action')) return;
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
      itemEl.querySelector('[data-action="move"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chooseAndMoveWorkspaceItem(itemPath);
      });
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (isWorkspaceLocked()) return;
          if (await askConfirmation(`Se eliminará “${item.name}” del proyecto.`, { title: 'Eliminar archivo', kind: 'danger', confirmLabel: 'Eliminar' })) {
            if (window.electronAPI) {
              if (!await saveAllFiles()) return;
              const result = await window.electronAPI.deleteItem(itemPath);
              if (!result.success) { showNotice(result.error); return; }
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
  applyEditorLockState();
  updateLineNumbers();
  updateCursorStats();
  updateSyntaxHighlighting();
  updateBreadcrumbs(relativePath);
  updateActiveLanguageBadge();

  // Highlight active tree item
  document.querySelectorAll('.tree-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === relativePath.replace(/\\/g, '/'));
  });

  // Opening a file is also a navigation action. Returning focus here prevents
  // the lobby/recent-project button from retaining the keyboard after re-entry.
  await focusEditorReliably();
}

function renderTabs() {
  DOM.editorTabsBar.innerHTML = '';
  state.openTabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.setAttribute('role', 'tab');
    tabEl.tabIndex = 0;
    tabEl.setAttribute('aria-selected', String(tab.path === state.activeFilePath));
    tabEl.title = tab.path;
    tabEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFileInEditor(tab.path); } });
    tabEl.className = `editor-tab ${tab.path === state.activeFilePath ? 'active' : ''}`;
    
    const ext = tab.name.split('.').pop().toLowerCase();
    let icon = 'TXT';
    if (ext === 'py') icon = 'PY';
    else if (['cpp', 'c', 'h', 'hpp', 'cc'].includes(ext)) icon = 'C++';
    else if (ext === 'java') icon = 'JAVA';
    else if (['js', 'mjs', 'cjs'].includes(ext)) icon = 'JS';
    else if (ext === 'r') icon = 'R';

    tabEl.innerHTML = `
      <span class="tab-file-badge">${icon}</span>
      <span class="tab-name">${escapeHtml(tab.name)}</span>
      <span class="tab-unsaved-dot ${tab.isDirty ? 'visible' : ''}"></span>
      <button type="button" class="tab-close" aria-label="Cerrar ${escapeHtml(tab.name)}" title="Cerrar pestaña">×</button>
    `;

    tabEl.addEventListener('click', () => {
      openFileInEditor(tab.path);
    });
    tabEl.querySelector('.tab-close')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (tab.isDirty && !await askConfirmation(`Los cambios de “${tab.name}” se guardarán antes de cerrar la pestaña.`, { title: 'Cerrar pestaña', confirmLabel: 'Guardar y cerrar' })) return;
      if (tab.isDirty && !await saveAllFiles()) return;
      closeTab(tab.path);
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
  return requestText(title, placeholder, { label: 'Nombre' });
}

async function promptNewFile() {
  if (isWorkspaceLocked()) {
    showNotice('Esta entrega está sellada. Inicia una nueva sesión para crear archivos.');
    return;
  }
  const currentLang = state.selectedLanguage || 'python';
  const exts = { python: '.py', cpp: '.cpp', java: '.java', javascript: '.js', r: '.R' };
  const ext = exts[currentLang] || '.py';
  const placeholder = `solucion${ext}`;

  const fileName = await requestName(`Nuevo archivo (${currentLang.toUpperCase()})`, placeholder);
  if (!fileName) return;

  const validName = fileName.includes('.') ? fileName : `${fileName}${ext}`;
  if (window.electronAPI) {
    const result = await window.electronAPI.createFile(validName);
    if (!result.success) { showNotice(result.error); return; }
    await loadWorkspaceFiles();
    await openFileInEditor(validName);
  }
}

async function promptNewFolder() {
  if (isWorkspaceLocked()) {
    showNotice('Esta entrega está sellada. Inicia una nueva sesión para crear carpetas.');
    return;
  }
  const folderName = await requestName('Nueva carpeta', 'ejercicios');
  if (!folderName) return;

  if (window.electronAPI) {
    const result = await window.electronAPI.createFolder(folderName);
    if (!result.success) { showNotice(result.error); return; }
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

function highlightCpp(code) {
  if (!code) return '';
  const tokenRegex = /(?:\/\*[\s\S]*?\*\/|\/\/.*$)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|(#\s*(?:include|define|ifdef|ifndef|endif|pragma|if|elif|else)(?:<[^>]+>|.*)?$)|(\b(?:int|float|double|char|void|bool|auto|const|static|struct|class|enum|union|if|else|for|while|do|switch|case|default|break|continue|return|goto|sizeof|typedef|template|typename|public|protected|private|virtual|friend|inline|namespace|using|try|catch|throw|new|delete|nullptr|true|false)\b)|(\b(?:std|cout|cin|cerr|endl|string|vector|map|set|pair|make_pair|push_back|size|printf|scanf|malloc|free|memcpy|memset)\b)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(->|::|<<|>>|&&|\|\||==|!=|<=|>=|[+\-*/%&|^~<>!=]=?|[+\-*/%&|^~<>!=])/gm;

  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) result += escapeHtml(code.substring(lastIndex, match.index));
    const [fullMatch, comment, str, preprocessor, keyword, builtin, numVal, operator] = match;
    if (comment) result += `<span class="tok-comment">${escapeHtml(fullMatch)}</span>`;
    else if (str) result += `<span class="tok-str">${escapeHtml(fullMatch)}</span>`;
    else if (preprocessor) result += `<span class="tok-decorator">${escapeHtml(fullMatch)}</span>`;
    else if (keyword) result += `<span class="tok-kw">${escapeHtml(fullMatch)}</span>`;
    else if (builtin) result += `<span class="tok-builtin">${escapeHtml(fullMatch)}</span>`;
    else if (numVal) result += `<span class="tok-num">${escapeHtml(fullMatch)}</span>`;
    else if (operator) result += `<span class="tok-op">${escapeHtml(fullMatch)}</span>`;
    else result += escapeHtml(fullMatch);
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < code.length) result += escapeHtml(code.substring(lastIndex));
  return result;
}

function highlightJava(code) {
  if (!code) return '';
  const tokenRegex = /(?:\/\*[\s\S]*?\*\/|\/\/.*$)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|(@[a-zA-Z_]\w*)|(\b(?:public|protected|private|static|final|abstract|class|interface|enum|extends|implements|native|synchronized|transient|volatile|strictfp|void|boolean|byte|char|short|int|long|float|double|if|else|switch|case|default|while|do|for|break|continue|return|throw|throws|try|catch|finally|new|this|super|instanceof|assert|package|import|null|true|false)\b)|(\b(?:System|out|println|print|Scanner|String|Integer|Double|Boolean|List|ArrayList|Map|HashMap|Set|HashSet|Math|Arrays|Collections|Exception|Throwable|Thread|Runnable)\b)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(->|&&|\|\||==|!=|<=|>=|[+\-*/%&|^~<>!=]=?|[+\-*/%&|^~<>!=])/gm;

  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) result += escapeHtml(code.substring(lastIndex, match.index));
    const [fullMatch, comment, str, annotation, keyword, builtin, numVal, operator] = match;
    if (comment) result += `<span class="tok-comment">${escapeHtml(fullMatch)}</span>`;
    else if (str) result += `<span class="tok-str">${escapeHtml(fullMatch)}</span>`;
    else if (annotation) result += `<span class="tok-decorator">${escapeHtml(fullMatch)}</span>`;
    else if (keyword) result += `<span class="tok-kw">${escapeHtml(fullMatch)}</span>`;
    else if (builtin) result += `<span class="tok-builtin">${escapeHtml(fullMatch)}</span>`;
    else if (numVal) result += `<span class="tok-num">${escapeHtml(fullMatch)}</span>`;
    else if (operator) result += `<span class="tok-op">${escapeHtml(fullMatch)}</span>`;
    else result += escapeHtml(fullMatch);
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < code.length) result += escapeHtml(code.substring(lastIndex));
  return result;
}

function highlightJS(code) {
  if (!code) return '';
  const tokenRegex = /(?:\/\*[\s\S]*?\*\/|\/\/.*$)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|(\b(?:const|let|var|function|async|await|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|class|extends|new|this|super|import|export|from|default|typeof|instanceof|void|delete|in|of|yield|null|undefined|true|false|NaN|Infinity)\b)|(\b(?:console|log|error|warn|info|Math|JSON|Promise|Array|Object|String|Number|Boolean|Date|RegExp|Map|Set|parseInt|parseFloat|setTimeout|setInterval|clearTimeout|clearInterval|document|window|process|require)\b)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%&|^~<>!=]=?|[+\-*/%&|^~<>!=])/gm;

  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) result += escapeHtml(code.substring(lastIndex, match.index));
    const [fullMatch, comment, str, keyword, builtin, numVal, operator] = match;
    if (comment) result += `<span class="tok-comment">${escapeHtml(fullMatch)}</span>`;
    else if (str) result += `<span class="tok-str">${escapeHtml(fullMatch)}</span>`;
    else if (keyword) result += `<span class="tok-kw">${escapeHtml(fullMatch)}</span>`;
    else if (builtin) result += `<span class="tok-builtin">${escapeHtml(fullMatch)}</span>`;
    else if (numVal) result += `<span class="tok-num">${escapeHtml(fullMatch)}</span>`;
    else if (operator) result += `<span class="tok-op">${escapeHtml(fullMatch)}</span>`;
    else result += escapeHtml(fullMatch);
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < code.length) result += escapeHtml(code.substring(lastIndex));
  return result;
}

function highlightR(code) {
  if (!code) return '';
  const tokenRegex = /(#.*$)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|(\b(?:if|else|repeat|while|function|for|in|next|break|TRUE|FALSE|NULL|NA|Inf|NaN)\b)|(\b(?:c|cat|print|paste|paste0|readLines|scan|read\.csv|write\.csv|data\.frame|matrix|list|vector|length|dim|names|head|tail|summary|plot|hist|mean|median|sd|var|sum|min|max|seq|rep|which|subset|apply|lapply|sapply|file)\b)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(<-|<<-|->|->>|%in%|%[*%]|==|!=|<=|>=|<|>|&&|\|\||&|\||!|\+|-|\*|\/|\^|%%|%\/%)/gm;

  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) result += escapeHtml(code.substring(lastIndex, match.index));
    const [fullMatch, comment, str, keyword, builtin, numVal, operator] = match;
    if (comment) result += `<span class="tok-comment">${escapeHtml(fullMatch)}</span>`;
    else if (str) result += `<span class="tok-str">${escapeHtml(fullMatch)}</span>`;
    else if (keyword) result += `<span class="tok-kw">${escapeHtml(fullMatch)}</span>`;
    else if (builtin) result += `<span class="tok-builtin">${escapeHtml(fullMatch)}</span>`;
    else if (numVal) result += `<span class="tok-num">${escapeHtml(fullMatch)}</span>`;
    else if (operator) result += `<span class="tok-op">${escapeHtml(fullMatch)}</span>`;
    else result += escapeHtml(fullMatch);
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < code.length) result += escapeHtml(code.substring(lastIndex));
  return result;
}

function getActiveLanguage() {
  if (state.activeFilePath) {
    const ext = state.activeFilePath.split('.').pop().toLowerCase();
    if (ext === 'py') return 'python';
    if (['cpp', 'c', 'h', 'hpp', 'cc'].includes(ext)) return 'cpp';
    if (ext === 'java') return 'java';
    if (['js', 'mjs', 'cjs'].includes(ext)) return 'javascript';
    if (ext === 'r') return 'r';
  }
  return state.selectedLanguage || 'python';
}

function highlightCode(code, lang = 'python') {
  switch (lang) {
    case 'cpp':
    case 'c':
      return highlightCpp(code);
    case 'java':
      return highlightJava(code);
    case 'javascript':
    case 'js':
      return highlightJS(code);
    case 'r':
      return highlightR(code);
    case 'python':
    case 'py':
    default:
      return highlightPython(code);
  }
}

function updateActiveLanguageBadge() {
  const lang = getActiveLanguage();
  const defs = {
    python: { name: 'Python', icon: '🐍' },
    cpp: { name: 'C / C++', icon: '⚙️' },
    java: { name: 'Java', icon: '☕' },
    javascript: { name: 'JavaScript', icon: '🟨' },
    r: { name: 'R', icon: '📊' }
  };
  const def = defs[lang] || { name: lang.toUpperCase(), icon: '📄' };
  if (DOM.navActiveLangBadge) {
    if (DOM.navActiveLangIcon) DOM.navActiveLangIcon.textContent = def.icon;
    if (DOM.navActiveLangText) DOM.navActiveLangText.textContent = def.name;
    DOM.navActiveLangBadge.title = `Lenguaje activo: ${def.name}`;
  }
}

function updateSyntaxHighlighting() {
  if (!DOM.highlightingContent || !DOM.codeTextarea) return;
  const code = DOM.codeTextarea.value;
  const lang = getActiveLanguage();
  DOM.highlightingContent.innerHTML = highlightCode(code, lang) + (code.endsWith('\n') ? ' ' : '');
  updateIndentGuides();
  scheduleSyntaxDiagnostic();
  syncEditorScroll();
}

function updateIndentGuides() {
  if (!DOM.editorIndentGuides || !DOM.codeTextarea) return;
  const cursorLine = DOM.codeTextarea.value.slice(0, DOM.codeTextarea.selectionStart).split('\n').length - 1;
  const lines = DOM.codeTextarea.value.split('\n');
  const indentation = lines.map(line => {
    const leading = (line.match(/^[ \t]*/) || [''])[0];
    const spaces = [...leading].reduce((total, character) => total + (character === '\t' ? 4 : 1), 0);
    return {
      spaces,
      levels: Math.ceil(spaces / 4),
      mixed: leading.includes('\t'),
      partial: spaces % 4 !== 0,
      blank: line.trim() === ''
    };
  });
  // Continue a guide through blank lines only when the surrounding code stays
  // inside the same block. This makes the block structure readable at a glance.
  indentation.forEach((info, index) => {
    if (!info.blank || info.levels) return;
    let previous = 0;
    let next = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (!indentation[i].blank) { previous = indentation[i].levels; break; }
    }
    for (let i = index + 1; i < indentation.length; i += 1) {
      if (!indentation[i].blank) { next = indentation[i].levels; break; }
    }
    info.levels = Math.min(previous, next);
  });
  const cursorLevel = indentation[cursorLine]?.levels || 0;
  DOM.editorIndentGuides.innerHTML = indentation.map((info, index) => {
    const guides = Array.from({ length: Math.min(info.levels, 40) }, (_, levelIndex) => {
      const level = levelIndex + 1;
      const classes = ['indent-guide-level'];
      if (level <= cursorLevel) classes.push('active-scope');
      if (level === info.levels && info.partial) classes.push('partial');
      if (level === info.levels && info.mixed) classes.push('mixed');
      return `<span class="${classes.join(' ')}" data-level="${level}"></span>`;
    }).join('');
    return `<div class="indent-guide-line${index === cursorLine ? ' current' : ''}">${guides}</div>`;
  }).join('');
}

function hideSyntaxDiagnostic() {
  state.syntaxDiagnosticLine = null;
  state.syntaxDiagnosticColumn = null;
  state.syntaxDiagnosticResult = null;
  DOM.editorDiagnostic?.classList.add('hidden');
  DOM.editorDiagnostic?.classList.remove('error');
  DOM.btnEditorDiagnosticLine?.classList.add('hidden');
  DOM.btnEditorDiagnosticHelp?.classList.add('hidden');
}

function scheduleSyntaxDiagnostic() {
  clearTimeout(state.syntaxDiagnosticTimer);
  const source = DOM.codeTextarea?.value || '';
  if (!source.trim() || getActiveLanguage() !== 'python' || !window.electronAPI?.diagnoseCode) {
    hideSyntaxDiagnostic();
    return;
  }
  const generation = ++state.syntaxDiagnosticGeneration;
  state.syntaxDiagnosticTimer = setTimeout(async () => {
    const result = await window.electronAPI.diagnoseCode({ language: 'python', source, relativePath: state.activeFilePath }).catch(() => null);
    if (!result || generation !== state.syntaxDiagnosticGeneration || DOM.codeTextarea.value !== source) return;
    if (result.unavailable) {
      hideSyntaxDiagnostic();
      return;
    }
    DOM.editorDiagnostic?.classList.remove('hidden');
    if (result.success) {
      state.syntaxDiagnosticLine = null;
      state.syntaxDiagnosticColumn = null;
      state.syntaxDiagnosticResult = null;
      if (state.editorErrorLine && !state.isRunning) state.editorErrorLine = null;
      DOM.editorDiagnostic?.classList.remove('error');
      if (DOM.editorDiagnosticIcon) DOM.editorDiagnosticIcon.textContent = '✓';
      if (DOM.editorDiagnosticTitle) DOM.editorDiagnosticTitle.textContent = 'Sintaxis correcta';
      if (DOM.editorDiagnosticHint) DOM.editorDiagnosticHint.textContent = 'Python puede interpretar la estructura del archivo.';
      DOM.btnEditorDiagnosticLine?.classList.add('hidden');
      DOM.btnEditorDiagnosticHelp?.classList.add('hidden');
    } else {
      state.syntaxDiagnosticLine = Number(result.line) || 1;
      state.syntaxDiagnosticColumn = Number(result.column) || 1;
      state.syntaxDiagnosticResult = result;
      state.editorErrorLine = state.syntaxDiagnosticLine;
      DOM.editorDiagnostic?.classList.add('error');
      if (DOM.editorDiagnosticIcon) DOM.editorDiagnosticIcon.textContent = '!';
      if (DOM.editorDiagnosticTitle) DOM.editorDiagnosticTitle.textContent = result.title || 'Revisa la sintaxis';
      if (DOM.editorDiagnosticHint) DOM.editorDiagnosticHint.textContent = result.hint || result.message || 'Python encontró una estructura incompleta.';
      if (DOM.btnEditorDiagnosticLine) {
        DOM.btnEditorDiagnosticLine.textContent = `Línea ${state.syntaxDiagnosticLine}:${state.syntaxDiagnosticColumn}`;
        DOM.btnEditorDiagnosticLine.classList.remove('hidden');
      }
      DOM.btnEditorDiagnosticHelp?.classList.remove('hidden');
    }
    updateLineNumbers();
  }, 450);
}

function handleEditorInput() {
  if (isWorkspaceLocked() || state.isSubmitting) return;
  const currentTab = state.openTabs.find((t) => t.path === state.activeFilePath);
  if (currentTab) {
    currentTab.content = DOM.codeTextarea.value;
    currentTab.isDirty = true;
    renderTabs();
  }

  updateLineNumbers();
  updateCursorStats();
  updateSyntaxHighlighting();

  DOM.sbSaveStatus.classList.remove('is-saved', 'save-error');
  DOM.sbSaveStatus.classList.add('is-saving');
  DOM.sbSaveStatus.textContent = 'Guardando cambios…';
  DOM.sbSaveStatus.title = 'codeGO guarda el proyecto automáticamente';

  // Debounced auto-save (400ms for safety)
  clearTimeout(state.autoSaveTimeout);
  state.autoSaveTimeout = setTimeout(() => {
    saveAllFiles();
  }, 400);
}

let saveQueue = Promise.resolve();
function saveTab(tab, options = {}) {
  if (!tab || isWorkspaceLocked()) return Promise.resolve(true);
  const content = tab.content;
  const write = async () => {
    try {
      if (!window.electronAPI) throw new Error('Guardado disponible en la aplicación de escritorio.');
      const result = await window.electronAPI.saveFile({ relativePath: tab.path, content });
      if (!result.success) throw new Error(result.error || 'No se pudo guardar el archivo.');
      if (tab.content === content) tab.isDirty = false;
      renderTabs();
      const hasPendingChanges = state.openTabs.some(t => t.isDirty);
      DOM.sbSaveStatus.classList.remove('save-error', 'is-saving');
      DOM.sbSaveStatus.classList.toggle('is-saved', !hasPendingChanges);
      if (hasPendingChanges) {
        DOM.sbSaveStatus.textContent = 'Cambios pendientes';
      } else {
        state.lastSavedAt = new Date();
        const time = state.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        DOM.sbSaveStatus.textContent = `Guardado · ${time}`;
        DOM.sbSaveStatus.title = `Última versión guardada: ${state.lastSavedAt.toLocaleString()}`;
        const now = Date.now();
        if (options.manual || now - state.lastSaveSoundAt > 8000) {
          sounds.playFeedback('save');
          state.lastSaveSoundAt = now;
        }
        if (options.manual) showToast(`“${tab.name}” guardado a las ${time}.`, 'success');
      }
      return true;
    } catch (error) {
      tab.isDirty = true;
      DOM.sbSaveStatus.classList.remove('is-saving', 'is-saved');
      DOM.sbSaveStatus.classList.add('save-error');
      DOM.sbSaveStatus.textContent = 'No se pudo guardar · Ctrl+S para reintentar';
      DOM.sbSaveStatus.title = error.message;
      sounds.playFeedback('error');
      showToast(`No se pudo guardar “${tab.name}”. ${error.message}`, 'error', 4200);
      renderTabs();
      return false;
    }
  };
  saveQueue = saveQueue.then(write, write);
  return saveQueue;
}
function saveCurrentFile(options = {}) {
  return saveTab(state.openTabs.find(t => t.path === state.activeFilePath), options);
}
async function saveAllFiles() {
  clearTimeout(state.autoSaveTimeout);
  const results = await Promise.all(state.openTabs.filter(t => t.isDirty).map(tab => saveTab(tab)));
  await saveQueue;
  saveLastSession();
  return results.every(Boolean);
}

function saveLastSession() {
  try {
    if (state.appMode === 'exam') return;
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
    rememberRecentProject();
  } catch (_) {}
}

function handleEditorKeydown(e) {
  if (isWorkspaceLocked()) {
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
  const currentLine = lines[lines.length - 1];
  const leading = (currentLine.match(/^[ \t]*/) || [''])[0];
  const spaces = [...leading].reduce((total, character) => total + (character === '\t' ? 4 : 1), 0);
  if (DOM.sbIndentStatus) {
    const needsAttention = leading.includes('\t') || spaces % 4 !== 0;
    DOM.sbIndentStatus.classList.toggle('indent-warning', needsAttention);
    if (leading.includes('\t')) DOM.sbIndentStatus.textContent = 'Sangría mixta · usa espacios';
    else if (spaces % 4) DOM.sbIndentStatus.textContent = `Sangría incompleta · ${spaces} espacios`;
    else DOM.sbIndentStatus.textContent = `Sangría: nivel ${spaces / 4} · 4 espacios`;
  }
  updateIndentGuides();
}

function syncEditorScroll() {
  if (DOM.editorHighlighting && DOM.codeTextarea) {
    DOM.editorHighlighting.scrollTop = DOM.codeTextarea.scrollTop;
    DOM.editorHighlighting.scrollLeft = DOM.codeTextarea.scrollLeft;
  }
  if (DOM.editorLineNumbers && DOM.codeTextarea) {
    DOM.editorLineNumbers.scrollTop = DOM.codeTextarea.scrollTop;
  }
  if (DOM.editorIndentGuides && DOM.codeTextarea) {
    DOM.editorIndentGuides.scrollTop = DOM.codeTextarea.scrollTop;
    DOM.editorIndentGuides.scrollLeft = DOM.codeTextarea.scrollLeft;
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
    if (!isWorkspaceLocked() && !await saveAllFiles()) throw new Error('Guarda los cambios antes de ejecutar.');
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
  if (!state.isRunning) return;
  const forcing = state.isStopping;
  state.isStopping = true;
  DOM.btnStopCode.disabled = false;
  if (DOM.stopCodeLabel) DOM.stopCodeLabel.textContent = forcing ? 'Forzando…' : 'Deteniendo…';
  try {
    const result = forcing
      ? await window.electronAPI.forceKillCode()
      : await window.electronAPI.killPython();
    if (!result.success) throw new Error(result.error);
    // Completion comes from process close, after the output streams are drained.
    setTimeout(async () => {
      if (!state.isStopping) return;
      await window.electronAPI.forceKillCode?.().catch(() => null);
      setTimeout(() => {
        if (state.isStopping) handleExecutionFinished({ exitCode: null, signal: 'SIGKILL', duration: 0 });
      }, 900);
    }, 650);
  } catch (error) {
    appendTerminalOutput(`Reintentando detención forzada: ${error.message}\n`, 'system');
    const forced = await window.electronAPI.forceKillCode?.().catch(() => ({ success: false }));
    if (!forced?.success) {
      state.isStopping = false;
      DOM.btnStopCode.disabled = false;
      if (DOM.stopCodeLabel) DOM.stopCodeLabel.textContent = 'Detener';
    }
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
  if (DOM.stopCodeLabel) DOM.stopCodeLabel.textContent = 'Detener';
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
  const text = String(raw || '');
  const quoted = pattern => text.match(pattern)?.[1] || '';
  const missingName = quoted(/NameError:\s+name ['"]([^'"]+)['"] is not defined/i);
  if (missingName) return {
    title: `“${missingName}” no está definido`,
    explanation: `Python llegó a ${missingName}, pero todavía no conoce una variable, función o importación con ese nombre. Los nombres distinguen mayúsculas y minúsculas.`,
    actions: [`Busca dónde debería definirse ${missingName}.`, 'Comprueba que se ejecute esa definición antes de la línea marcada.', 'Compara cuidadosamente mayúsculas, minúsculas y ortografía.'],
    example: `${missingName} = "Ana"\nprint(${missingName})`
  };
  const missingModule = quoted(/(?:ModuleNotFoundError|ImportError):.*?['"]([^'"]+)['"]/i);
  if (missingModule) return {
    title: `No se encontró “${missingModule}”`,
    explanation: `El entorno activo no pudo importar ${missingModule}. Puede ser un nombre incorrecto, un archivo local ausente o una librería aún no instalada.`,
    actions: [`Confirma que el import diga exactamente ${missingModule}.`, 'Si es un archivo tuyo, comprueba que esté dentro del proyecto.', 'Si es una librería, abre Librerías y búscala por su nombre de paquete fuera de un examen.'],
    example: `import ${missingModule.split('.')[0]}`
  };
  const missingFile = quoted(/FileNotFoundError:.*?['"]([^'"]+)['"]/i);
  if (missingFile) return {
    title: `No se encontró el archivo “${missingFile}”`,
    explanation: 'Python busca las rutas relativas desde la carpeta del proyecto. El nombre, la extensión o una carpeta intermedia no coincide.',
    actions: ['Comprueba el recurso en el explorador de la izquierda.', 'Respeta exactamente mayúsculas, minúsculas y extensión.', 'Construye la ruta desde __file__ para que funcione igual en Windows, macOS y Linux.'],
    example: 'from pathlib import Path\nbase = Path(__file__).resolve().parent\nruta = base / "recursos" / "imagen.png"'
  };
  const invalidNumber = quoted(/ValueError: invalid literal for int\(\).*?['"]([^'"]*)['"]/i);
  if (invalidNumber) return {
    title: `“${invalidNumber}” no se puede convertir a entero`,
    explanation: 'int() recibió texto que no representa un número entero válido.',
    actions: ['Revisa qué escribió el usuario antes de llamar int().', 'Valida la entrada con try/except ValueError.', 'Decide qué mensaje mostrar y si debes pedir el dato otra vez.'],
    example: 'try:\n    edad = int(input("Edad: "))\nexcept ValueError:\n    print("Escribe un número entero")'
  };
  const rules = [
    [/IndentationError|TabError/, 'La sangría no es consistente', 'Python usa la sangría para saber qué instrucciones pertenecen a cada bloque.', ['Pulsa el botón para ir a la línea marcada.', 'Usa Mayús+Tab para sacar la línea y Tab para aplicar exactamente 4 espacios.', 'Alinea las líneas del mismo bloque con la misma guía vertical.'], 'if condicion:\n    print("Dentro del bloque")'],
    [/SyntaxError/, 'Hay una instrucción escrita de forma inválida', 'La marca ^ señala dónde Python dejó de entender la estructura; la causa también puede estar en la línea anterior.', ['Revisa la palabra o símbolo sobre ^.', 'Comprueba cierres, comas y dos puntos en esta línea y la anterior.', 'Corrige una sola causa y vuelve a ejecutar.'], 'if condicion:\n    print("Estructura completa")'],
    [/ModuleNotFoundError|ImportError/, 'Python no pudo cargar una librería', 'El nombre del import puede estar mal escrito o el paquete no pertenece al entorno preparado.', ['Copia exactamente el nombre mostrado después de No module named.', 'Abre Librerías para comprobar o instalar el paquete fuera de una sesión de examen.', 'Si es un módulo propio, confirma que su archivo esté en el proyecto.'], 'import nombre_del_paquete'],
    [/FileNotFoundError/, 'No se encontró un archivo', 'La ruta escrita no apunta a un recurso existente desde la carpeta del proyecto.', ['Confirma nombre, extensión y mayúsculas.', 'Usa una carpeta recursos dentro del proyecto.', 'Construye rutas portátiles con pathlib.'], 'from pathlib import Path\nruta = Path(__file__).resolve().parent / "archivo.txt"'],
    [/PermissionError|Access is denied/, 'El sistema negó acceso', 'El archivo o puerto puede estar abierto en otro programa o protegido por el sistema.', ['Cierra aplicaciones que usen el archivo o puerto.', 'Trabaja dentro de la carpeta del proyecto.', 'En Linux, confirma que tu usuario pertenezca al grupo que administra el puerto serial.'], 'with open("datos.txt", "w", encoding="utf-8") as archivo:\n    archivo.write("Listo")'],
    [/SerialException|could not open port|ClearCommError/, 'No se pudo abrir el puerto de la placa', 'Otro programa usa el puerto, la placa se desconectó o falta permiso o controlador.', ['Cierra Arduino IDE y otros monitores seriales.', 'Reconecta la placa y vuelve a detectar el puerto.', 'Consulta Arduino en Ayuda si el sistema niega permisos.'], 'import serial\nplaca = serial.Serial("COM3", 9600, timeout=1)'],
    [/NameError/, 'Se usó un nombre que no existe', 'La variable o función no fue definida antes de usarse.', ['Compara el nombre con su definición.', 'Asegúrate de asignarlo antes de esta línea.', 'Revisa mayúsculas y minúsculas.'], 'nombre = "Ana"\nprint(nombre)'],
    [/TypeError/, 'La operación recibió un tipo de dato incorrecto', 'La operación combina valores incompatibles o la función recibió argumentos incorrectos.', ['Lee al final del error cuáles tipos participaron.', 'Comprueba cada valor con type() si no es evidente.', 'Convierte solo cuando el significado del dato lo permita.'], 'edad = int(input("Edad: "))\nprint("Tienes " + str(edad) + " años")'],
    [/ValueError/, 'El dato tiene el formato equivocado', 'El tipo de operación es válido, pero el contenido recibido no puede procesarse así.', ['Revisa el valor de entrada.', 'Valídalo antes de convertir.', 'Usa try/except para ofrecer otra oportunidad al usuario.'], 'try:\n    numero = int(input("Número: "))\nexcept ValueError:\n    print("Entrada no válida")'],
    [/UnboundLocalError/, 'La variable local se usó antes de recibir un valor', 'Dentro de la función existe una ruta que llega a la variable sin haberla asignado.', ['Busca todas las ramas if/else de la función.', 'Asigna un valor inicial antes de las ramas.', 'Prefiere pasar valores como argumentos y devolver el resultado.'], 'def calcular(condicion):\n    resultado = 0\n    if condicion:\n        resultado = 10\n    return resultado'],
    [/AttributeError/, 'El objeto no ofrece ese método o atributo', 'El valor situado a la izquierda del punto no tiene el nombre solicitado.', ['Comprueba el objeto con type().', 'Revisa la ortografía del método.', 'Confirma que no sustituiste el objeto con otro valor.'], 'print(type(objeto))'],
    [/IndexError/, 'La posición no existe en la lista', 'El índice está fuera del rango disponible.', ['Compara el índice con len(lista).', 'Recuerda que el primer elemento usa índice 0.', 'Recorre directamente los elementos con for cuando no necesites el índice.'], 'for elemento in lista:\n    print(elemento)'],
    [/KeyError/, 'La clave no existe en el diccionario', 'El diccionario no contiene la clave solicitada.', ['Muestra diccionario.keys() para ver las claves.', 'Comprueba con if clave in diccionario.', 'Usa .get() cuando tenga sentido un valor por defecto.'], 'valor = datos.get("clave", "valor por defecto")'],
    [/ZeroDivisionError/, 'Se intentó dividir entre cero', 'El divisor llegó a cero y la división no está definida.', ['Comprueba el divisor antes de operar.', 'Decide qué debe ocurrir cuando sea cero.', 'Muestra un mensaje claro o pide otro valor.'], 'if divisor != 0:\n    resultado = dividendo / divisor'],
    [/RecursionError/, 'La función no alcanzó su caso base', 'La función siguió llamándose hasta que Python la detuvo para proteger el equipo.', ['Identifica el caso que debe terminar la recursión.', 'Comprueba que cada llamada se acerque a ese caso.', 'Prueba con valores pequeños.'], 'def cuenta(numero):\n    if numero <= 0:\n        return\n    cuenta(numero - 1)'],
    [/MemoryError/, 'El programa solicitó demasiada memoria', 'Una colección, archivo o ciclo crece más de lo que el equipo puede mantener.', ['Detén el crecimiento de datos dentro del ciclo.', 'Procesa archivos grandes por partes.', 'Revisa si una condición de salida nunca se cumple.'], 'with open("datos.txt", encoding="utf-8") as archivo:\n    for linea in archivo:\n        procesar(linea)'],
    [/UnicodeDecodeError|UnicodeEncodeError/, 'El texto usa otra codificación', 'Los bytes del archivo no coinciden con la codificación elegida.', ['Prueba primero UTF-8.', 'Confirma la codificación en el programa que creó el archivo.', 'Evita ignorar errores si los datos son importantes.'], 'with open("datos.txt", encoding="utf-8") as archivo:\n    texto = archivo.read()'],
    [/EOFError/, 'Python esperaba una entrada y no la recibió', 'input() quedó sin respuesta porque terminó la entrada del programa.', ['Ejecuta de nuevo.', 'Escribe la respuesta en la misma línea de la terminal.', 'Pulsa Enter para enviarla.'], 'nombre = input("Nombre: ")'],
    [/pygame\.error/, 'Pygame no pudo abrir un recurso o dispositivo', 'La imagen, sonido, formato o dispositivo no está disponible como se solicitó.', ['Revisa la ruta y formato del recurso.', 'Inicializa pygame antes de usar sus módulos.', 'Construye la ruta desde __file__ para que sea portátil.'], 'from pathlib import Path\nruta = Path(__file__).resolve().parent / "recursos" / "imagen.png"\nimagen = pygame.image.load(ruta)']
  ];
  const match = rules.find(([pattern]) => pattern.test(raw));
  return match
    ? { title: match[1], explanation: match[2], actions: match[3], example: match[4] || '' }
    : { title: 'El programa terminó con un error', explanation: 'La última línea indica el tipo de problema y las líneas File muestran cómo llegó Python hasta él.', actions: ['Abre la última línea que pertenezca a tu archivo.', 'Lee el tipo y el mensaje de la última línea.', 'Corrige una causa a la vez y vuelve a ejecutar con F5.'], example: '' };
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

function goToEditorLine(lineNumber, columnNumber = null) {
  const lines = DOM.codeTextarea.value.split('\n');
  const line = Math.max(1, Math.min(Number(lineNumber) || 1, lines.length));
  let start = 0;
  for (let index = 1; index < line; index += 1) start += lines[index - 1].length + 1;
  const lineLength = lines[line - 1].length;
  const column = columnNumber == null ? null : Math.max(1, Math.min(Number(columnNumber) || 1, lineLength + 1));
  const selectionStart = column == null ? start : start + column - 1;
  const end = column == null ? start + lineLength : Math.min(start + lineLength, selectionStart + 1);
  state.editorErrorLine = line;
  updateLineNumbers();
  DOM.modalRuntimeError.classList.add('hidden');
  DOM.codeTextarea.focus({ preventScroll: true });
  DOM.codeTextarea.setSelectionRange(selectionStart, end);
  const lineHeight = parseFloat(getComputedStyle(DOM.codeTextarea).lineHeight) || 22;
  DOM.codeTextarea.scrollTop = Math.max(0, (line - 3) * lineHeight);
  syncEditorScroll();
  updateCursorStats();
}

function renderRuntimeErrorGuide(guide, location, raw) {
  state.runtimeErrorLocation = location;
  state.editorErrorLine = location?.line || null;
  updateLineNumbers();
  DOM.runtimeErrorTitle.textContent = guide.title;
  DOM.runtimeErrorExplanation.textContent = guide.explanation;
  DOM.runtimeErrorRaw.textContent = raw;
  DOM.runtimeErrorLocation.classList.toggle('hidden', !location?.line);
  if (location?.line) {
    const columnLabel = location.column ? `:${location.column}` : '';
    DOM.runtimeErrorLocationLabel.textContent = `${location.file} · Línea ${location.line}${columnLabel} · ${location.type}`;
    DOM.btnRuntimeErrorLine.textContent = `Ir a la línea ${location.line}`;
  }
  DOM.runtimeErrorActions.replaceChildren(...guide.actions.map(action => {
    const item = document.createElement('li');
    item.textContent = action;
    return item;
  }));
  if (DOM.runtimeErrorExampleWrap && DOM.runtimeErrorExample) {
    DOM.runtimeErrorExampleWrap.classList.toggle('hidden', !guide.example);
    DOM.runtimeErrorExample.textContent = guide.example || '';
  }
  DOM.modalRuntimeError.classList.remove('hidden');
  DOM.btnCloseRuntimeError.focus();
}

function showSyntaxDiagnosticHelp() {
  const result = state.syntaxDiagnosticResult;
  if (!result) return;
  const location = {
    file: state.activeFilePath || 'archivo.py',
    line: Number(result.line) || 1,
    column: Number(result.column) || 1,
    type: 'SyntaxError',
    message: result.message || ''
  };
  renderRuntimeErrorGuide({
    title: result.title || 'Revisa la sintaxis',
    explanation: result.hint || result.message || 'Python no pudo interpretar esta instrucción.',
    actions: result.actions || ['Revisa la línea marcada y la anterior.', 'Corrige una causa y vuelve a comprobar.'],
    example: result.example || ''
  }, location, `${location.type}: ${location.message}\n${result.sourceLine || ''}`.trim());
}

function showRuntimeError(raw) {
  const guide = explainPythonError(raw);
  const location = parsePythonLocation(raw);
  renderRuntimeErrorGuide(guide, location, raw);
}

// Keep chunk boundaries invisible and cap the transcript so a print loop cannot grow the DOM forever.
const TERMINAL_LIMIT = 200000;
let terminalCharacters = DOM.terminalTranscript.textContent.length;

function resizeTerminalInput() {
  DOM.terminalStdinInput.style.width = `${Math.max(2, Array.from(DOM.terminalStdinInput.value).length + 1)}ch`;
}

function focusTerminalInput() {
  DOM.terminalStdinInput.focus({ preventScroll: true });
  // Read the final layout after focus. Browser zoom and a side/bottom layout
  // change can invalidate the scrollHeight measured before the input receives
  // focus, leaving the caret just below the visible terminal.
  DOM.terminalOutput.scrollTop = DOM.terminalOutput.scrollHeight;
  DOM.terminalStdinInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  DOM.terminalOutput.scrollTop = DOM.terminalOutput.scrollHeight;
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
      if (state.returnHomeAfterUnlock) {
        state.returnHomeAfterUnlock = false;
        state.workspaceSessionActive = false;
        switchView('lobby');
        renderRecentProjects();
      } else {
        showNotice('Modo Kiosk desactivado por autorización docente.');
      }
    } else {
      DOM.teacherPinError.textContent = res.error || 'PIN incorrecto.';
      DOM.teacherPinError.classList.remove('hidden');
    }
  } else {
    DOM.teacherPinError.textContent = 'La autorización docente requiere la aplicación de escritorio.';
    DOM.teacherPinError.classList.remove('hidden');
  }
}

async function handleGoHome() {
  if (state.isRunning) {
    showNotice('Detén el programa en ejecución antes de volver al inicio.');
    return;
  }
  if (state.appMode === 'exam' && !state.isExamSubmitted) {
    const proceed = await askConfirmation('Salir al inicio interrumpe el examen y queda registrado. Solicita al profesor que autorice la salida con su PIN.', { title: 'Examen en curso', kind: 'danger', confirmLabel: 'Solicitar salida' });
    if (!proceed) return;
    state.returnHomeAfterUnlock = true;
    openTeacherUnlockModal();
    return;
  }
  const message = state.appMode === 'task' && !state.isTaskSubmitted
    ? 'La tarea aún no se ha entregado. Los archivos se guardarán y podrás continuar después. ¿Volver al inicio?'
    : 'Se guardará el proyecto actual. ¿Volver al inicio?';
  if (!await askConfirmation(message, { title: 'Volver al inicio', confirmLabel: 'Guardar y volver' }) || !await saveAllFiles()) return;
  await window.electronAPI?.endSession?.();
  rememberRecentProject();
  state.workspaceSessionActive = false;
  switchView('lobby');
  renderRecentProjects();
}

function lockExamEnvironment() {
  const taskDelivery = state.appMode === 'task';
  if (taskDelivery) state.isTaskSubmitted = true;
  else state.isExamSubmitted = true;
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

  appendTerminalOutput(`\n${taskDelivery ? 'Tarea certificada' : 'Examen'} entregad${taskDelivery ? 'a' : 'o'}. El código queda disponible en modo de lectura.`, 'success');
  appendTerminalOutput(taskDelivery
    ? '>>> La entrega fue firmada para detectar cualquier modificación posterior.'
    : '>>> El código ha sido sellado contra modificaciones y acciones de portapapeles.', 'system');
  appendTerminalOutput('>>> Estado: listo para la revisión docente.', 'system');
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
  if (state.isRunning || state.isStarting) { showNotice('Detén el programa antes de entregar el examen.'); return; }
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
    showNotice(`No se completó la entrega: ${error.message}`);
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

  DOM.taskSubmitPastes.textContent = 'Permitido';
  DOM.taskSubmitPastes.className = 'clean';

  DOM.taskSubmitRuns.textContent = `${state.taskTelemetry.runsCount || 0} pruebas`;

  DOM.taskSubmitIncidents.textContent = 'Ed25519 · listo para firmar';
  DOM.taskSubmitIncidents.className = 'clean';

  DOM.modalTaskSubmit.classList.remove('hidden');
}

async function handleTaskFinalSubmit() {
  if (state.appMode !== 'task' || state.isTaskSubmitted || state.isSubmitting) return;
  if (state.isRunning || state.isStarting) { showNotice('Detén el programa antes de entregar la tarea.'); return; }
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
    DOM.receiptChecksum.textContent = res.checksum;
    DOM.modalSubmissionSuccess.classList.remove('hidden');

    appendTerminalOutput(`\nTarea certificada guardada correctamente.`, 'success');
    appendTerminalOutput(`>>> Archivo generado: ${res.fileName}`, 'system');
    appendTerminalOutput(`>>> Sello criptográfico Ed25519: ${res.officialSeal ? 'Generado' : 'Compatible'}`, 'system');
    appendTerminalOutput(`>>> Entrega este archivo .codego a tu profesor para comprobar su integridad.\n`, 'system');
  } catch (error) {
    DOM.codeTextarea.readOnly = state.isTaskSubmitted;
    showNotice(`No se completó la entrega de la tarea: ${error.message}`);
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
  if (DOM.verifierBatchSummary) DOM.verifierBatchSummary.classList.add('hidden');
  if (DOM.btnExtractSubmissionCode) DOM.btnExtractSubmissionCode.classList.add('hidden');
  if (DOM.btnRunSubmissionCode) DOM.btnRunSubmissionCode.classList.add('hidden');
  if (DOM.modalVerifySubmission) DOM.modalVerifySubmission.classList.remove('hidden');
}

async function handleSelectSubmissionFile() {
  if (!window.electronAPI?.openSubmissionFileDialog) return;
  const res = await window.electronAPI.openSubmissionFileDialog();
  if (res?.filePaths?.length > 1) {
    await verifyFilesByPath(res.filePaths);
  } else if (res && res.filePath) {
    await verifyFileByPath(res.filePath);
  }
}

async function verifyFilesByPath(filePaths) {
  if (!window.electronAPI?.verifySubmissionBatch || !filePaths?.length) return;
  if (DOM.verifierStatusBadge) {
    DOM.verifierStatusBadge.className = 'badge-status-waiting';
    DOM.verifierStatusBadge.textContent = `Comparando ${filePaths.length} entregas…`;
  }
  const result = await window.electronAPI.verifySubmissionBatch(filePaths);
  if (!result?.success) {
    if (DOM.verifierStatusBadge) {
      DOM.verifierStatusBadge.className = 'badge-status-tampered';
      DOM.verifierStatusBadge.textContent = 'No se completó la revisión';
    }
    return;
  }
  renderBatchVerification(result);
  if (result.submissions[0]) {
    state.currentVerifiedFile = result.submissions[0].filePath;
    showVerifiedSubmission(result.submissions[0]);
  }
}

function renderBatchVerification(result) {
  DOM.verifierBatchSummary?.classList.remove('hidden');
  if (DOM.batchVerifiedCount) DOM.batchVerifiedCount.textContent = result.verifiedCount;
  if (DOM.batchFlaggedCount) DOM.batchFlaggedCount.textContent = result.flaggedCount;
  if (DOM.batchErrorCount) DOM.batchErrorCount.textContent = result.errorCount;
  if (DOM.verifierStatusBadge) {
    DOM.verifierStatusBadge.className = result.flaggedCount || result.errorCount ? 'badge-status-review' : 'badge-status-valid';
    DOM.verifierStatusBadge.textContent = result.flaggedCount || result.errorCount
      ? `${result.verifiedCount} verificadas · requiere revisión`
      : `✓ ${result.verifiedCount} entregas sin coincidencias`;
  }

  if (DOM.batchComparisonList) {
    DOM.batchComparisonList.replaceChildren();
    if (!result.comparisons.length) {
      const clean = document.createElement('p');
      clean.className = 'batch-clean-message';
      clean.textContent = 'No se encontraron duplicados ni similitudes relevantes entre los códigos.';
      DOM.batchComparisonList.appendChild(clean);
    }
    result.comparisons.forEach(comparison => {
      const row = document.createElement('div');
      row.className = `batch-comparison ${comparison.classification}`;
      const label = comparison.classification === 'archivo_duplicado'
        ? 'Mismo archivo entregado'
        : comparison.classification === 'codigo_identico'
          ? 'Código equivalente'
          : comparison.classification === 'similitud_alta' ? 'Similitud alta' : 'Revisar similitud';
      row.innerHTML = `<div><strong></strong><span></span></div><b></b>`;
      row.querySelector('strong').textContent = `${comparison.leftStudent} · ${comparison.rightStudent}`;
      row.querySelector('span').textContent = label;
      row.querySelector('b').textContent = `${comparison.percentage}%`;
      DOM.batchComparisonList.appendChild(row);
    });
  }

  if (DOM.batchSubmissionList) {
    DOM.batchSubmissionList.replaceChildren();
    result.submissions.forEach(submission => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'batch-submission-row';
      button.innerHTML = '<span><strong></strong><small></small></span><b></b>';
      button.querySelector('strong').textContent = submission.student?.name || submission.fileName;
      button.querySelector('small').textContent = `${submission.student?.id || 'Sin matrícula'} · ${submission.files} archivo(s)`;
      button.querySelector('b').textContent = submission.officialSealValid ? 'Sello Ed25519' : 'Sello compatible';
      button.addEventListener('click', () => {
        state.currentVerifiedFile = submission.filePath;
        showVerifiedSubmission(submission);
      });
      DOM.batchSubmissionList.appendChild(button);
    });
    result.errors.forEach(item => {
      const row = document.createElement('div');
      row.className = 'batch-submission-error';
      row.textContent = `${item.fileName}: ${item.error}`;
      DOM.batchSubmissionList.appendChild(row);
    });
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
    showNotice('Error al verificar archivo: ' + res.error);
    return;
  }

  state.currentVerifiedFile = filePath;
  showVerifiedSubmission(res);
}

function showVerifiedSubmission(res) {
  state.verifiedSubmissionData = res;
  if (DOM.verifierResultContainer) DOM.verifierResultContainer.classList.remove('hidden');
  if (DOM.btnExtractSubmissionCode) DOM.btnExtractSubmissionCode.classList.remove('hidden');
  if (DOM.btnRunSubmissionCode) DOM.btnRunSubmissionCode.classList.remove('hidden');
  DOM.gradeReceiptPanel?.classList.toggle('hidden', res.mode !== 'exam');
  if (DOM.gradeReceiptStatus) DOM.gradeReceiptStatus.textContent = '';

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
      if (DOM.verifHmacText) DOM.verifHmacText.textContent = res.officialSealValid ? 'Sello de integridad Ed25519 verificado' : 'Sello compatible verificado';
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
  if (DOM.verifDate) DOM.verifDate.textContent = 'Fecha: ' + (res.date ? new Date(res.date).toLocaleString() : '--');
  if (DOM.verifOs) DOM.verifOs.textContent = 'Sello: ' + (res.sealFingerprint || 'compatible');

  // Telemetry
  const tel = res.telemetry || {};
  if (DOM.verifKeystrokes) DOM.verifKeystrokes.textContent = (tel.keystrokesCount || tel.keystrokes || 0).toLocaleString();
  if (DOM.verifCharacters) DOM.verifCharacters.textContent = (tel.charactersTyped || tel.charactersWritten || 0).toLocaleString();
  if (DOM.verifPastes) DOM.verifPastes.textContent = 'Permitido';
  if (DOM.verifPastesSub) {
    DOM.verifPastesSub.textContent = 'Edición libre durante la tarea';
    DOM.verifPastesSub.style.color = '#8ea3b7';
  }
  if (DOM.verifEditingTime) DOM.verifEditingTime.textContent = formatTime(Math.round(tel.activeTypingSeconds || tel.activeEditingSeconds || 0));
  if (DOM.verifRuns) DOM.verifRuns.textContent = (tel.runsCount || 0) + ' veces';
  if (DOM.verifIncidents) DOM.verifIncidents.textContent = res.officialSealValid ? 'Verificado' : 'Compatible';

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

async function handleSaveGradeReceipt() {
  if (!state.currentVerifiedFile || !window.electronAPI?.gradeSubmission) return;
  const teacher = DOM.gradeTeacher?.value.trim();
  const grade = DOM.gradeValue?.value.trim();
  if (!teacher || !grade) {
    DOM.gradeReceiptStatus.textContent = 'Escribe el docente y la calificación.';
    return;
  }
  DOM.btnSaveGradeReceipt.disabled = true;
  DOM.gradeReceiptStatus.textContent = 'Generando huella firmada…';
  const result = await window.electronAPI.gradeSubmission({
    filePath: state.currentVerifiedFile,
    teacher,
    grade,
    feedback: DOM.gradeFeedback?.value.trim() || ''
  });
  DOM.btnSaveGradeReceipt.disabled = false;
  if (result?.success) DOM.gradeReceiptStatus.textContent = `Huella guardada: ${result.receiptPath}`;
  else if (!result?.canceled) DOM.gradeReceiptStatus.textContent = result?.error || 'No se pudo guardar la huella.';
}

async function handleExtractSubmissionCode() {
  if (!state.currentVerifiedFile || !window.electronAPI?.extractSubmissionCode) return;
  const res = await window.electronAPI.extractSubmissionCode(state.currentVerifiedFile);
  if (res && res.success) {
    showNotice(`Archivos extraídos con éxito en:\n${res.targetDir}`);
  } else if (res && !res.canceled) {
    showNotice(`Error al extraer archivos: ${res.error}`);
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
    const paths = Array.from(files || []).map(file => file.path).filter(Boolean);
    if (paths.length > 1) verifyFilesByPath(paths);
    else if (paths.length === 1) verifyFileByPath(paths[0]);
  });
}

async function handleOpenWorkspaceFolder() {
  if (state.isRunning || state.isStarting) { appendTerminalOutput('Detén el programa antes de cambiar de proyecto.\n', 'system'); return; }
  if (!await saveAllFiles()) return;
  if (window.electronAPI && window.electronAPI.openFolderDialog) {
    const res = await window.electronAPI.openFolderDialog();
    if (res && res.success) {
      setWorkspaceSelection(res);
      prepareNewWorkspaceSession();

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
    showNotice('Función disponible en la aplicación de escritorio.');
  }
}

async function handleCreateNewProject() {
  if (state.isRunning || state.isStarting) { appendTerminalOutput('Detén el programa antes de cambiar de proyecto.\n', 'system'); return; }
  if (!await saveAllFiles()) return;
  if (window.electronAPI && window.electronAPI.createProjectDialog) {
    const res = await createBlankWorkspace();
    if (res && res.success) {
      prepareNewWorkspaceSession();

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
    showNotice('Función disponible en la aplicación de escritorio.');
  }
}

function handleViewReceipt() {
  DOM.modalSubmissionSuccess.classList.remove('hidden');
}

async function handleExitExamApp() {
  if (!await saveAllFiles()) return;
  if (await askConfirmation('¿Deseas cerrar y salir de codeGO?', { title: 'Cerrar codeGO', confirmLabel: 'Cerrar aplicación' })) {
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
async function loadVisibleAppVersion() {
  if (!DOM.lobbyAppVersion || !window.electronAPI?.getCurrentVersion) return;
  try {
    const result = await window.electronAPI.getCurrentVersion();
    if (result?.success && result.version) {
      DOM.lobbyAppVersion.textContent = `v${result.version}`;
      DOM.lobbyAppVersion.title = `Versión instalada ${result.version}`;
    }
  } catch (_) {}
}

function renderAutomaticUpdateState(payload = {}) {
  const updateInfo = payload.update;
  if (updateInfo?.latestVersion) {
    state.availableUpdate = updateInfo;
    displayUpdateBanner(updateInfo);
  }

  if (!DOM.lobbyUpdateBanner) return;
  const status = payload.status || 'idle';
  if (['idle', 'current', 'offline'].includes(status) && !updateInfo) {
    DOM.lobbyUpdateBanner.classList.add('hidden');
    DOM.btnUpdateIde?.classList.add('hidden');
    return;
  }

  if (['downloading', 'ready', 'deferred', 'installing', 'error'].includes(status)) {
    DOM.lobbyUpdateBanner.classList.remove('hidden');
    DOM.updateProgressContainer?.classList.remove('hidden');
  }
  const percent = Math.max(0, Math.min(100, Number(payload.percent || 0)));
  if (DOM.updateProgressFill) DOM.updateProgressFill.style.width = `${percent}%`;

  const statusCopy = {
    downloading: [`Descargando v${payload.latestVersion || updateInfo?.latestVersion || ''} (${percent}%)...`, payload.totalBytes > 0 ? `${(payload.downloadedBytes / 1024 / 1024).toFixed(1)} MB de ${(payload.totalBytes / 1024 / 1024).toFixed(1)} MB` : 'La descarga continúa en segundo plano.'],
    ready: ['Actualización preparada', 'CodeGO se reiniciará para completar la instalación.'],
    deferred: ['Actualización preparada', payload.message || 'Se instalará al terminar la sesión actual.'],
    installing: ['Instalando actualización...', 'CodeGO se reiniciará automáticamente.'],
    error: ['No se completó la actualización', payload.error || 'CodeGO volverá a intentarlo automáticamente.']
  };
  const copy = statusCopy[status];
  if (copy) {
    if (DOM.updateProgressText) DOM.updateProgressText.textContent = copy[0];
    if (DOM.updateProgressDetail) DOM.updateProgressDetail.textContent = copy[1];
  }
  const locked = ['downloading', 'installing'].includes(status);
  if (DOM.btnUpdateNow) {
    DOM.btnUpdateNow.disabled = locked;
    DOM.btnUpdateNow.textContent = status === 'deferred' ? 'Se instalará al terminar' : status === 'ready' ? 'Reiniciar ahora' : 'Actualizar';
  }
}

async function checkUpdatesSilently() {
  if (!window.electronAPI?.getUpdateState) return;
  try {
    const status = await window.electronAPI.getUpdateState();
    if (status?.success) renderAutomaticUpdateState(status);
  } catch (_) {}
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
  if (DOM.btnUpdateIde) {
    DOM.btnUpdateIde.classList.remove('hidden');
    DOM.btnUpdateIde.title = `Actualizar a codeGO ${updateInfo.latestVersion}`;
  }
  if (DOM.updateIdeLabel) DOM.updateIdeLabel.textContent = `v${updateInfo.latestVersion}`;
}

async function handleManualCheckUpdates() {
  if (!window.electronAPI || !window.electronAPI.checkForUpdates) {
    showNotice('Función de actualización disponible en la versión de escritorio instalada.');
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
        showNotice(`✓ codeGO está actualizado.\n\nLa versión instalada (v${res.currentVersion}) es la más reciente.`);
      }
    } else {
      showNotice(`No se pudo verificar actualizaciones:\n${res?.error || 'Verifica tu conexión a internet.'}`);
    }
  } catch (err) {
    showNotice(`Error al buscar actualizaciones: ${err.message}`);
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
      showNotice('No se encontró un instalador automático para este sistema operativo.');
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
        showNotice(`La actualización se descargó exitosamente en:\n${res.path}`);
      }
    } else {
      throw new Error(res?.error || 'Error al descargar o aplicar la actualización.');
    }
  } catch (err) {
    showNotice(`No se pudo completar la actualización automática:\n${err.message}`);
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
