const $ = id => document.getElementById(id);
const editor = $('code-editor');
const SDK = window.CodeGOSDK;
const course = window.CodeGOCourse;
let user = null;
let state = null;
let revision = 0;
let change = 0;
let savedChange = 0;
let saveTimer;
let saveQueue = Promise.resolve(true);
let homeMode = 'activity';
let running = false;
let warning = false;
let sealing = false;
const evidence = window.CodeGOEvidence.create(window.CodeGOStore);
const record = (type, detail) => { if (project() && !project().locked) window.CodeGOEvidence.record(project(), type, detail); };
const fileReadOnly = () => project()?.locked || sealing || warning || project()?.mode === 'task' && project()?.readOnlyFiles?.includes(project()?.activeFile);
let returnDeadline = 0;
let warningTimer;
const WEB_RETURN_WAIT = 30000;
let textResolver;
let errorLine = 1;
let errorCoach;
let telemetry = new SDK.ForensicTelemetry();
let telemetryProject = null;
let toastTimer;
let navigationAllowed = false;
let navigationQuestion = false;
const tabId = sessionStorage.getItem('codego-tab-id') || crypto.randomUUID();
sessionStorage.setItem('codego-tab-id', tabId);
const draftKey = () => user ? `codego-emergency:${user.uid}:${tabId}` : null;
function preserveEmergencyDraft() {
  if (!state || !user || project().locked) return;
  try { localStorage.setItem(draftKey(), JSON.stringify({ project: project().id, path: project().activeFile, content: project().files[project().activeFile], revision, at: Date.now(), pendingIncident: project().pendingIncident || supervised() })); } catch (_) { /* IndexedDB remains the primary store. */ }
}
function recoverEmergencyDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (!draft || draft.revision < revision - 1 || draft.revision > revision || draft.at <= (state.savedAt || 0)) return;
    const target = state.projects.find(item => item.id === draft.project);
    if (!target || target.locked || typeof draft.content !== 'string' || draft.content.length > 1000000 || !Object.hasOwn(target.files, draft.path)) return;
    if (!(target.mode === 'task' && target.readOnlyFiles?.includes(draft.path))) target.files[draft.path] = draft.content;
    if (target.mode !== 'activity' && draft.pendingIncident) target.pendingIncident = true;
    change++; toast('Se recuperaron los últimos cambios anteriores a la recarga.');
  } catch (_) {}
}
const uuid = () => crypto.randomUUID();
const project = () => state?.projects.find(item => item.id === state.currentProject);
const modeLabels = { activity: 'Modo libre', task: 'Tarea', exam: 'Examen web' };
const safePath = path => typeof path === 'string' && path.length <= 180 && !path.startsWith('/') && !/[\\\x00-\x1f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..' && !['__proto__', 'constructor', 'prototype'].includes(part));
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function selectHomeMode(mode) {
  homeMode = mode;
  document.querySelectorAll('[data-home-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.homeMode === mode)));
  $('home-start').textContent = mode === 'activity' ? 'Abrir modo libre' : mode === 'task' ? 'Iniciar tarea' : 'Preparar examen web';
}
function showHome() {
  $('welcome').hidden = true; $('home-screen').hidden = false; $('app').hidden = true;
  $('home-account').textContent = user.email;
  const count = Object.keys(project().files).length;
  $('home-project-name').textContent = `${project().name} · ${count} ${count === 1 ? 'archivo guardado' : 'archivos guardados'}`;
  selectHomeMode(project().mode === 'activity' ? 'activity' : project().mode);
}
document.querySelectorAll('[data-home-mode]').forEach(button => button.onclick = () => selectHomeMode(button.dataset.homeMode));
$('home-start').onclick = () => openSession(homeMode);
$('home-course').onclick = () => {
  state.lastView = 'workspace'; $('home-screen').hidden = true; $('app').hidden = false;
  renderWorkspace(); setPane('course'); markChanged();
};
$('go-home').onclick = async () => {
  if (running || warning || project().mode !== 'activity' && !project().locked) return toast('Entrega tu actividad antes de volver al inicio.');
  if (!await save()) return;
  state.lastView = 'home'; markChanged(); showHome();
};
$('home-signout').onclick = () => $('signout').click();
document.querySelectorAll('[data-web-version]').forEach(element => { element.textContent = 'v1.6.19'; });
function freshProject(name = 'Mi proyecto') {
  return { id: uuid(), name, files: { 'main.py': '# Tu primer programa\nprint("Hola, Python")\n' }, activeFile: 'main.py', mode: 'activity', locked: false };
}
function markChanged() {
  if (!state || !user) return;
  change++;
  $('save-status').textContent = 'Guardando…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}
async function save() {
  clearTimeout(saveTimer);
  const owner = user?.uid;
  if (!owner || !state) return true;
  const write = async () => {
    if (user?.uid !== owner || !state) return false;
    if (change === savedChange) return true;
    const version = change;
    project().telemetry = { ...telemetry, lastKeystrokeTime: null };
    try {
      await evidence.checkpoint(project());
      const snapshot = structuredClone(state);
      snapshot.revision = revision;
      snapshot.savedAt = Date.now();
      revision = await window.CodeGOStore.save(owner, snapshot);
      savedChange = version;
      state.savedAt = snapshot.savedAt;
      if (change === savedChange) { try { localStorage.removeItem(draftKey()); } catch (_) {} }
      $('save-status').classList.remove('error');
      $('save-status').textContent = change === savedChange ? 'Guardado en este equipo' : 'Guardando…';
      return true;
    } catch (error) {
      $('save-status').textContent = 'No guardado · descarga una copia';
      $('save-status').classList.add('error');
      toast(error.message || 'No hay espacio disponible. Descarga tu proyecto.');
      return false;
    }
  };
  saveQueue = saveQueue.then(write, write);
  return saveQueue;
}
function download(name, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, '_');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function backup() {
  if (!state || sealing || running || warning) return;
  if (project().locked && project().sealedExport) return download(project().name + '.entrega-web.json', project().sealedExport);
  if (project().mode === 'exam') { $('submit').click(); return; }
  try {
    const current = project(), student = structuredClone(state.student), report = telemetry.getReport();
    await evidence.checkpoint(current);
    const snapshot = structuredClone(current);
    delete snapshot.sealedExport;
    const envelope = await evidence.seal({ format: 'codego-project-v2', student, email: user.email, createdAt: new Date().toISOString(), project: snapshot, telemetry: report });
    download(snapshot.name + '.codego-web.json', JSON.stringify(envelope, null, 2));
  } catch (error) { toast('No se pudo firmar la copia: ' + error.message); }
}
function askText(title, initial = '') {
  $('text-dialog-title').textContent = title;
  $('text-input').value = initial;
  $('text-error').textContent = '';
  $('text-dialog').showModal();
  $('text-input').focus();
  $('text-input').select();
  return new Promise(resolve => { textResolver = resolve; });
}
$('text-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = $('text-input').value.trim();
  if (!value) return;
  textResolver?.(value);
  textResolver = null;
  $('text-dialog').close();
});
$('text-dialog').addEventListener('close', () => { textResolver?.(null); textResolver = null; });
function confirmAction(title, message) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-dialog').showModal();
  return new Promise(resolve => $('confirm-dialog').addEventListener('close', () => resolve($('confirm-dialog').returnValue === 'confirm'), { once: true }));
}
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
function setPane(pane) {
  document.querySelector('.workspace').dataset.pane = pane;
  const learning = pane === 'course';
  $('course-pane').hidden = !learning;
  $('pane-splitter').hidden = learning;
  const mobile = matchMedia('(max-width: 720px)').matches;
  $('editor-pane').hidden = learning && !mobile;
  $('terminal-pane').hidden = learning && !mobile;
  document.querySelectorAll('.mobile-tabs button').forEach(button => button.setAttribute('aria-current', button.dataset.pane === pane ? 'page' : 'false'));
  if (learning) renderCourse();
  else learningUI.pauseAnimations();
}
document.querySelectorAll('.mobile-tabs [data-pane]').forEach(button => button.addEventListener('click', () => setPane(button.dataset.pane)));
$('open-course').onclick = () => setPane('course');
$('close-course').onclick = () => setPane('editor');
let paintedCode = null;
function updateEditor() {
  if (paintedCode !== editor.value) {
    paintedCode = editor.value;
    const html = editor.value.length > 200000 || !project()?.activeFile?.endsWith('.py') ? window.CodeGOEditor.escapeHtml(editor.value) : window.CodeGOEditor.highlightPython(editor.value);
    $('code-highlighting').firstElementChild.innerHTML = html + (editor.value.endsWith('\n') ? ' ' : '');
  }
  const count = editor.value.split('\n').length;
  if ($('line-numbers').dataset.count !== String(count)) {
    $('line-numbers').textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
    $('line-numbers').dataset.count = String(count);
  }
  const preceding = editor.value.slice(0, editor.selectionStart).split('\n');
  $('cursor').textContent = `Lín ${preceding.length} · Col ${preceding.at(-1).length + 1}`;
}
function renderProjects() {
  for (const id of ['project-select', 'session-project']) {
    $(id).replaceChildren(...state.projects.map(item => {
      const option = document.createElement('option');
      option.value = item.id; option.textContent = item.name; return option;
    }));
    $(id).value = state.currentProject;
  }
}
function renderFiles() {
  const current = project();
  const root = { dirs: new Map(), files: [] };
  Object.keys(current.files).sort().forEach(path => {
    const parts = path.split('/');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push({ name: parts.at(-1), path });
  });
  function build(node, parent) {
    for (const [name, child] of node.dirs) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = name; details.append(summary); build(child, details); parent.append(details);
    }
    for (const { name, path } of node.files) {
      const button = document.createElement('button');
      button.textContent = name + (current.mode === 'task' && current.readOnlyFiles?.includes(path) ? ' · lectura' : ''); button.title = path; button.classList.toggle('active', path === current.activeFile);
      button.onclick = () => { current.activeFile = path; markChanged(); renderWorkspace(); setPane('editor'); editor.focus(); };
      parent.append(button);
    }
  }
  $('file-list').replaceChildren();
  build(root, $('file-list'));
}
function renderWorkspace() {
  const current = project();
  const exercise = current.exerciseFiles?.[current.activeFile];
  if (exercise) Object.assign(current, exercise);
  if (telemetryProject !== current.id) {
    if (telemetryProject) {
      const previous = state.projects.find(item => item.id === telemetryProject);
      if (previous) previous.telemetry = { ...telemetry, lastKeystrokeTime: null };
    }
    telemetry = Object.assign(new SDK.ForensicTelemetry(), current.telemetry || {});
    telemetryProject = current.id;
  }
  if (!current.files[current.activeFile] && !(current.activeFile in current.files)) current.activeFile = Object.keys(current.files)[0];
  const source = current.files[current.activeFile] || '';
  if (editor.value !== source) editor.value = source;
  editor.readOnly = Boolean(fileReadOnly());
  document.body.dataset.mode = current.mode;
  $('filename').textContent = current.activeFile + (current.mode === 'task' && current.readOnlyFiles?.includes(current.activeFile) ? ' · Solo lectura' : '');
  updateTerminalInput();

  $('workspace-project-label').textContent = current.name;
  $('workspace-language').textContent = current.activeFile.endsWith('.js') ? 'JavaScript' : current.activeFile.endsWith('.py') ? 'Python' : 'Texto';
  $('workspace-student').textContent = state.student.name;
  $('open-session').textContent = modeLabels[current.mode];
  $('submit').hidden = current.mode === 'activity';
  $('submit').disabled = current.mode === 'activity' || current.locked || running || warning || sealing;
  $('run').disabled = running || current.locked || warning || sealing;
  $('new-file').disabled = current.locked || running || warning || sealing;
  $('new-project').disabled = (current.mode !== 'activity' && !current.locked) || running || warning || sealing;
  $('import-project').disabled = (current.mode !== 'activity' && !current.locked) || running || warning || sealing;
  $('project-select').disabled = (current.mode !== 'activity' && !current.locked) || running || warning || sealing;
  $('assignment-summary').hidden = !current.assignment;
  $('assignment-title').textContent = current.assignment?.title || '';
  $('assignment-prompt').textContent = current.assignment?.prompt || '';
  $('storage-location').textContent = `${Object.keys(current.files).length} archivos · en este navegador`;
  renderProjects(); renderFiles(); updateEditor();
  if (current.pendingIncident && !current.locked && !warning && !$('session-dialog').open) {
    warning = true; editor.readOnly = true; startAlarm(); $('focus-dialog').showModal(); resumeCountdown();
  }
}
function recordEditorChange(event) {
  const current = project();
  if (!current || fileReadOnly()) { if (current) editor.value = current.files[current.activeFile]; return; }
  if (editor.value.length > 1000000) {
    editor.value = current.files[current.activeFile]; toast('El editor admite hasta 1 MB por archivo. Divide el proyecto en archivos más pequeños.'); return;
  }
  const otherSize = Object.entries(current.files).reduce((size, [path, source]) => size + (path === current.activeFile ? 0 : source.length), 0);
  if (otherSize + editor.value.length > 5000000) {
    editor.value = current.files[current.activeFile]; toast('El proyecto alcanzó 5 MB. Divide el trabajo en proyectos más pequeños.'); return;
  }
  record('edit', { file: current.activeFile, inputType: event?.inputType || 'typing', previousLength: current.files[current.activeFile]?.length || 0, length: editor.value.length, cursorUTF16: editor.selectionStart, insertedText: String(event?.data || '').slice(0, 512), textTruncated: (event?.data?.length || 0) > 512 });
  current.files[current.activeFile] = editor.value;
  telemetry.recordKeystroke(event?.data?.length || 0);
  updateEditor(); markChanged();
}
editor.addEventListener('input', recordEditorChange);
editor.addEventListener('scroll', () => {
  $('line-numbers').scrollTop = editor.scrollTop;
  $('code-highlighting').scrollTop = editor.scrollTop;
  $('code-highlighting').scrollLeft = editor.scrollLeft;
}, { passive: true });
editor.addEventListener('click', updateEditor);
editor.addEventListener('keyup', updateEditor);
function insertCode(text) {
  if (editor.readOnly) return;
  editor.focus();
  // Native insertion keeps the platform's undo stack on desktop and mobile.
  if (!document.execCommand('insertText', false, text)) {
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    recordEditorChange();
  }
}
editor.addEventListener('keydown', event => {
  if (event.key === 'Tab') { event.preventDefault(); insertCode('    '); }
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    const line = editor.value.slice(0, editor.selectionStart).split('\n').at(-1);
    insertCode('\n' + (line.match(/^ */)?.[0] || '') + (line.trimEnd().endsWith(':') ? '    ' : ''));
  }
});
document.querySelectorAll('[data-key]').forEach(button => {
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.onclick = () => insertCode(button.dataset.key);
});
$('undo').onclick = () => { if (!editor.readOnly) { editor.focus(); document.execCommand('undo'); } };
for (const type of ['copy', 'cut', 'paste', 'drop']) document.addEventListener(type, event => {
  if (!state || project().mode === 'activity' || $('session-dialog').open) return;
  event.preventDefault();
  if (type === 'paste') telemetry.recordPasteAttempt();
  record('clipboard', { action: type, blocked: true, file: project().activeFile }); markChanged();
  toast('En esta modalidad escribe sin copiar ni pegar.');
}, true);
for (const type of ['copy', 'cut', 'paste', 'drop']) editor.addEventListener(type, event => {
  if (event.defaultPrevented) return;
  if (project()?.locked || (project()?.mode !== 'activity')) {
    event.preventDefault();
    if (type === 'paste') telemetry.recordPasteAttempt();
    record('clipboard', { action: type, blocked: true, file: project().activeFile });
    toast('En esta modalidad escribe tu código sin copiar ni pegar.');
  } else if (type === 'paste' || type === 'drop') {
    record('clipboard', { action: type, blocked: false, file: project().activeFile, length: (event.clipboardData?.getData('text/plain') || event.dataTransfer?.getData('text/plain') || '').length, origin: 'No se puede identificar la aplicación de origen.' }); markChanged();
  }
});
editor.addEventListener('beforeinput', event => {
  if (editor.readOnly || (project()?.mode !== 'activity' && /insertFromPaste|insertFromDrop|deleteByCut/.test(event.inputType))) event.preventDefault();
});
$('new-file').onclick = async () => {
  if (project().locked || warning || running) return;
  const path = await askText('Nuevo archivo o subcarpeta', 'ejercicios/main.py');
  if (path === null) return;
  if (!safePath(path) || !/\.(py|txt|csv|json|js|md)$/i.test(path)) return toast('Usa una ruta relativa y una extensión .py, .js, .txt, .csv, .json o .md.');
  if (Object.keys(project().files).length >= 200) return toast('El proyecto admite hasta 200 archivos.');
  if (Object.hasOwn(project().files, path)) return toast('Ya existe un archivo con ese nombre.');
  record('create', { file: path }); project().files[path] = ''; project().activeFile = path; markChanged(); renderWorkspace();
};
$('new-project').onclick = async () => {
  if (project().mode !== 'activity' && !project().locked || running) return;
  const name = await askText('Nombre del proyecto', 'Mi proyecto');
  if (!name) return;
  if (state.projects.filter(item => !item.learningGroup).length >= 20) return toast('Descarga tus proyectos antes de crear más. El límite es 20.');
  const next = freshProject(name); state.projects.push(next); state.currentProject = next.id;
  markChanged(); renderWorkspace();
};
$('project-select').onchange = async () => {
  if (project().mode !== 'activity' && !project().locked || running || warning) return;
  if (!await save()) { $('project-select').value = state.currentProject; return; }
  state.currentProject = $('project-select').value; markChanged(); renderWorkspace();
};
function beginTaskReferences(current) {
  if (Object.keys(current.files).length >= 200) throw new Error('Descarga una copia y reduce el proyecto a menos de 200 archivos antes de iniciar una tarea.');
  current.readOnlyFiles = Object.keys(current.files);
  let path = 'solucion.py', index = 2;
  while (Object.hasOwn(current.files, path)) path = `solucion_${index++}.py`;
  current.files[path] = '# Escribe aquí tu solución. Los archivos anteriores son de consulta.\n'; current.activeFile = path;
}
function openSession(requestedMode = null) {
  if (running || warning || sealing) return toast('Termina la ejecución o el aviso antes de cambiar de modalidad.');
  if (project().mode !== 'activity' && !project().locked) return toast('Entrega la actividad antes de cambiar de modalidad.');
  $('student-name').value = state.student.name || user.displayName || '';
  $('student-id').value = state.student.id || '';
  renderProjects();
  document.querySelector(`input[name=mode][value="${typeof requestedMode === 'string' ? requestedMode : project().locked ? 'activity' : project().mode}"]`).checked = true;
  updateModeDescription();
  $('session-error').textContent = '';
  $('session-dialog').showModal(); $('student-name').focus();
}
$('open-session').onclick = openSession;
function updateModeDescription() {
  const mode = document.querySelector('input[name=mode]:checked').value;
  $('mode-description').textContent = mode === 'activity' ? 'Práctica libre. Puedes copiar, pegar y cambiar de aplicación.' : mode === 'task' ? 'Archivos anteriores en lectura; escribe en una solución nueva. Sin copiar ni pegar. Salir activa un aviso y una espera de 30 s.' : 'Empiezas en blanco. Sin copiar ni pegar; salir activa un aviso y una espera de 30 s. La web no bloquea otras apps ni la red.';
}
let sessionStarting = false;
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', updateModeDescription));
$('session-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (sessionStarting) return;
  state.student = { name: $('student-name').value.trim(), id: $('student-id').value.trim() };
  if (!state.student.name) return;
  const selected = state.projects.find(item => item.id === $('session-project').value);
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'task' && Object.keys(selected.files).length >= 200) return void ($('session-error').textContent = 'Reduce el proyecto a menos de 200 archivos para crear tu solución.');
  if (mode === 'exam' && state.projects.filter(item => !item.learningGroup).length >= 20) return void ($('session-error').textContent = 'Descarga tus proyectos y elimina copias antiguas antes de crear más exámenes.');
  if (selected.locked) return void ($('session-error').textContent = 'Este proyecto ya se entregó. Crea uno nuevo o elige otro proyecto.');
  if (mode !== 'activity') {
    const wasFullscreen = Boolean(document.fullscreenElement);
    const fields = [...$('session-form').querySelectorAll('input, select')];
    sessionStarting = true; $('session-form').querySelector('button[type=submit]').disabled = true;
    fields.forEach(field => { field.disabled = true; });
    let ready;
    try { ready = await prepareSupervision(mode); }
    finally { sessionStarting = false; $('session-form').querySelector('button[type=submit]').disabled = false; fields.forEach(field => { field.disabled = false; }); }
    if (!$('session-dialog').open) { if (!wasFullscreen && document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
    if (!ready) return;
  }
  state.profileConfirmed = true;
  state.lastView = 'workspace';
  $('home-screen').hidden = true; $('app').hidden = false;
  state.currentProject = selected.id;
  if (mode === 'exam') {
    const clean = freshProject(`Examen · ${state.student.name}`);
    clean.files = { 'main.py': '' }; state.projects.push(clean); state.currentProject = clean.id;
  }
  project().mode = mode;
  if (mode === 'task') beginTaskReferences(project());
  else project().readOnlyFiles = [];
  record('session-start', { mode, readOnlyFiles: project().readOnlyFiles, fullscreen: Boolean(document.fullscreenElement), audio: alarmContext?.state || 'unused' });

  telemetry.reset(); telemetryProject = state.currentProject; project().telemetry = { ...telemetry };
  $('session-dialog').close(); markChanged(); renderWorkspace(); setPane('editor'); editor.focus();
});
function appendOutput(text, type = 'stdout') {
  const transcript = $('terminal-transcript');
  const scroller = $('terminal-output');
  const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 50;
  const last = transcript.lastElementChild;
  if (last?.className === `out-${type}` && last.textContent.length < 16000) last.append(document.createTextNode(text));
  else { const span = document.createElement('span'); span.className = `out-${type}`; span.textContent = text; transcript.append(span); }
  while (transcript.textContent.length > 200000 && transcript.childNodes.length > 1) transcript.firstChild.remove();
  if (atBottom) scroller.scrollTop = scroller.scrollHeight;
}
let errorOutput = '';
const terminalInput = $('terminal-stdin-input');
let inputRequest = null;
function updateTerminalInput(focus = false) {
  terminalInput.hidden = !inputRequest;
  terminalInput.disabled = !inputRequest || warning || sealing || Boolean(project()?.locked) || Boolean(engine?.inputSending);
  terminalInput.style.width = `${Math.min(60, Math.max(12, [...terminalInput.value].length + 2))}ch`;
  if (focus && !terminalInput.disabled) {
    terminalInput.focus({ preventScroll: true });
    terminalInput.scrollIntoView({ block: 'nearest' });
  }
}
const engine = new SDK.WebExecutionEngine({
  workerURL: new URL('execution-worker.js?v=stdin-2', import.meta.url).href,
  onOutput: (text, type) => { appendOutput(text, type); if (type === 'stderr') errorOutput = (errorOutput + text).slice(-16000); },
  onInput: request => {
    inputRequest = request; terminalInput.value = '';
    $('terminal-input-status').textContent = request ? 'Python espera tu respuesta. Escribe en la consola y pulsa Enter.' : '';
    if (request) setPane('terminal');
    updateTerminalInput(Boolean(request));
  },
  onFinished: result => { appendOutput(`\n${result.stopped ? 'Detenido' : result.exitCode === 0 ? 'Terminado' : 'Revisa tu código'} · ${result.duration} s\n`, 'system'); }
});
terminalInput.addEventListener('input', () => updateTerminalInput());
terminalInput.addEventListener('keydown', async event => {
  if (event.isComposing || event.keyCode === 229) return;
  const eof = event.ctrlKey && event.key.toLowerCase() === 'd' && !terminalInput.value;
  if (event.key !== 'Enter' && !eof) return;
  event.preventDefault();
  if (terminalInput.disabled || !inputRequest || warning || project().locked) return;
  try {
    const sent = engine.sendInput(terminalInput.value, eof);
    updateTerminalInput();
    await sent;
  } catch (error) { toast(error.message); updateTerminalInput(true); }
});
$('terminal-output').addEventListener('click', () => {
  if (!getSelection()?.toString()) updateTerminalInput(true);
});
terminalInput.addEventListener('beforeinput', event => {
  if (state && project().mode !== 'activity' && /insertFrom(Paste|Drop)|deleteByCut/.test(event.inputType)) event.preventDefault();
});
function explainError(raw) {
  const definitions = [
    [/IndentationError|TabError/, 'Revisa la sangría', 'Usa cuatro espacios dentro de cada bloque y evita mezclar tabuladores.', 'if True:\n    print("Hola")'],
    [/SyntaxError/, 'Revisa la estructura de la línea', 'Comprueba los dos puntos, las comillas y los paréntesis de esta línea y la anterior.', 'for numero in range(3):\n    print(numero)'],
    [/NameError/, 'Python no reconoce ese nombre', 'Define la variable antes de usarla. Revisa mayúsculas y errores de escritura.', 'nombre = "Ana"\nprint(nombre)'],
    [/TypeError/, 'Los tipos de datos no coinciden', 'input() devuelve texto. Convierte con int() o float() antes de calcular.', 'edad = int("18")\nprint(edad + 1)'],
    [/ValueError/, 'No se pudo convertir el valor', 'Comprueba que el texto representa el dato que necesitas.', 'try:\n    numero = int("18")\nexcept ValueError:\n    print("Escribe un entero")'],
    [/ZeroDivisionError/, 'El divisor es cero', 'Comprueba el divisor antes de dividir.', 'total, divisor = 10, 2\nif divisor != 0:\n    print(total / divisor)'],
    [/IndexError/, 'Esa posición no existe', 'Los índices empiezan en 0 y llegan hasta len(lista) - 1.', 'datos = [10, 20]\nprint(datos[0])  # 10'],
    [/KeyError/, 'No existe esa clave', 'Comprueba la clave o usa get() con un valor alternativo.', 'datos = {"nombre": "Ana"}\nprint(datos.get("edad", 0))'],
    [/EOFError/, 'La entrada terminó antes de tiempo', 'Vuelve a ejecutar y responde en la consola cuando Python lo pida. Enter también permite enviar una respuesta vacía.', 'nombre = input("Nombre: ")\nprint("Hola", nombre)'],
    [/ModuleNotFoundError|ImportError/, 'Falta un módulo', 'La web incluye Python básico. Las bibliotecas de escritorio y ventanas gráficas necesitan la app nativa.', 'import math\nprint(math.sqrt(16))']
  ];
  const [, title, message, example] = definitions.find(([pattern]) => pattern.test(raw)) || [null, 'El programa necesita un ajuste', 'Lee la última línea de la consola, corrige una causa y vuelve a ejecutar.', ''];
  const lines = [...raw.matchAll(/File "[^"]+", line (\d+)/g)];
  errorLine = Number(lines.at(-1)?.[1]) || 1;
  $('error-title').textContent = title;
  $('error-message').textContent = message;
  errorCoach?.destroy(); errorCoach = window.createCodeGOErrorCoach({ code: example }); $('error-example').replaceChildren(errorCoach.element);
  $('error-guide').hidden = false;
  $('goto-error').hidden = !lines.length;
}
$('goto-error').onclick = () => {
  setPane('editor'); editor.focus();
  const offset = editor.value.split('\n').slice(0, errorLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
  editor.setSelectionRange(offset, offset); editor.scrollTop = Math.max(0, (errorLine - 4) * 24); updateEditor();
};
async function run(tests = null) {
  if (running || project().locked || warning || sealing) return;
  if (!await save()) return;
  const current = project();
  const filename = current.activeFile;
  const executedSource = current.files[filename];
  const executedFiles = { ...current.files };
  const executedExerciseId = current.exerciseId;
  const executedLessonId = current.lessonId;
  const language = /\.js$/i.test(filename) ? 'javascript' : /\.py$/i.test(filename) ? 'python' : null;
  if (!language) return toast('Abre un archivo Python o JavaScript para ejecutarlo.');
  running = true; renderWorkspace();
  $('stop').hidden = false; $('run').hidden = true; $('error-guide').hidden = true; $('evaluation').hidden = true;
  $('terminal-transcript').replaceChildren(); errorOutput = '';
  setPane('terminal'); telemetry.recordRun();
  try {
    const result = await engine.run(executedSource, language, { filename, files: executedFiles, readOnlyFiles: current.mode === 'task' ? current.readOnlyFiles : [], tests });
    for (const [file, source] of Object.entries(result.generatedFiles || {})) {
      if (!safePath(file) || typeof source !== 'string' || source.length > 1000000) continue;
      if (current.files[file] !== executedFiles[file]) { appendOutput(`No se reemplazó ${file}: lo editaste durante la ejecución.\n`, 'system'); continue; }
      if (!(file in current.files) && Object.keys(current.files).length >= 200 || Object.entries(current.files).reduce((n,[name,text]) => n + (name === file ? 0 : text.length), 0) + source.length > 5000000) { appendOutput('Un archivo generado supera el espacio disponible.\n', 'stderr'); continue; }
      current.files[file] = source;
      window.CodeGOEvidence.record(current, 'python-output-file', { file, length: source.length });
      appendOutput(`Archivo guardado: ${file}\n`, 'system'); markChanged();
    }
    if (result.readOnlyChanges?.length) {
      window.CodeGOEvidence.record(current, 'reference-write-attempt', { files: result.readOnlyChanges });
      appendOutput('Tu programa intentó cambiar archivos de consulta. Se conservaron sus versiones originales. Escribe los resultados en archivos nuevos.\n', 'stderr'); markChanged();
    }
    if (result.omittedFiles) appendOutput('Algunos resultados no se guardaron: se admiten archivos de texto de hasta 1 MB, 200 archivos y 5 MB por proyecto. Para imágenes o archivos mayores usa la app instalable.\n', 'system');
    if (errorOutput) explainError(errorOutput);
    if (result.result) {
      const grade = result.result;
      $('evaluation').replaceChildren();
      const title = document.createElement('strong'); title.textContent = `${grade.passed} de ${grade.total} pruebas superadas`;
      $('evaluation').append(title);
      if (grade.failures.length) {
        const list = document.createElement('ul');
        grade.failures.forEach(failure => { const li = document.createElement('li'); li.textContent = failure; list.append(li); });
        $('evaluation').append(list);
      } else {
        $('evaluation').append(document.createTextNode(' · ¡Bien hecho! Prueba también tus propios casos.'));
        if (executedLessonId) state.progress[executedLessonId] = true;
      }
      current.lastEvaluation = { ...grade, at: new Date().toISOString(), sourceHash: await SDK.computeSHA256(executedSource), filename };
      if (executedExerciseId) {
        state.learning ||= { version: 2, quiz: {}, exercises: {}, assessments: {} };
        const previous = state.learning.exercises[executedExerciseId];
        state.learning.exercises[executedExerciseId] = { ...current.lastEvaluation, passed: grade.passed === grade.total, bestPassed: previous?.bestPassed || previous?.passed || grade.passed === grade.total, attempts: (previous?.attempts || 0) + 1 };
      }
      $('evaluation').hidden = false; markChanged();
    }
  } catch (error) {
    appendOutput(error.message + '\n', error.code === 'CODEGO_RUNTIME_UNAVAILABLE' ? 'system' : 'stderr');
    if (error.code === 'CODEGO_RUNTIME_UNAVAILABLE') {
      $('error-title').textContent = 'La consola no pudo iniciarse';
      $('error-message').textContent = 'Tu código se conserva. Reintenta con Ejecutar; si el navegador bloquea los datos del sitio, permite su almacenamiento.';
      errorCoach?.destroy(); errorCoach = null; $('error-example').replaceChildren();
      $('goto-error').hidden = true; $('error-guide').hidden = false;
    } else explainError(error.message);
  }
  finally { running = false; $('stop').hidden = true; $('run').hidden = false; renderWorkspace(); }
}
$('run').onclick = () => run(project().assignment?.tests || null);
$('stop').onclick = () => engine.stop();
$('clear-terminal').onclick = () => { $('terminal-transcript').replaceChildren(); updateTerminalInput(true); };
window.addEventListener('keydown', event => {
  if (state && ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r' || event.key === 'F5' && (event.ctrlKey || event.shiftKey))) { event.preventDefault(); void guardedNavigation('reload'); return; }
  if (event.key === 'F5' && state && !$('welcome').checkVisibility()) { event.preventDefault(); run(project().assignment?.tests || null); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state) { event.preventDefault(); save(); }
});
$('backup').onclick = backup;
$('submit').onclick = async () => {
  if (project().mode === 'activity' || project().locked || running || warning || sealing) return;
  if (!await confirmAction('Entregar y bloquear', 'Esta es tu entrega definitiva. Ya no podrás editar ningún archivo de este proyecto en CodeGO. Se generará una copia firmada para enviarla al profesor. ¿Confirmas la entrega?')) return;
  if (running || warning || project().locked) return;
  sealing = true; renderWorkspace();
  const current = project();
  try {
    if (!await save()) return;
    await evidence.checkpoint(current);
    record('submission', { mode: current.mode });
    const snapshot = structuredClone(current); snapshot.locked = true; delete snapshot.sealedExport;
    const envelope = await evidence.seal({ format: 'codego-web-submission-v2', platform: 'browser', student: structuredClone(state.student), email: user.email, project: snapshot, telemetry: telemetry.getReport(), createdAt: new Date().toISOString() });
    current.sealedExport = JSON.stringify(envelope, null, 2);
    current.locked = true; markChanged();
    if (!await save()) { current.locked = false; delete current.sealedExport; markChanged(); return; }
    download(current.name + '.entrega-web.json', current.sealedExport);
    stopAlarm();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    toast('Entrega sellada. Conserva la descarga y envíala a tu profesor. Puedes descargarla otra vez desde Cuenta.');
  } catch (error) { toast('No se completó la entrega: ' + error.message); }
  finally { sealing = false; renderWorkspace(); }
};
let alarmContext, alarmTimer, titleTimer, fullscreenRequested = false;
const originalTitle = document.title;
function protectionReady() { return Boolean(document.fullscreenElement && alarmContext?.state === 'running'); }
async function prepareSupervision(mode) {
  let audio, fullscreen;
  try {
    if (!document.documentElement.requestFullscreen || !document.fullscreenEnabled) throw new Error('Este navegador no admite pantalla completa. Usa un navegador compatible para tarea o examen; el modo libre sigue disponible.');
    // Both requests begin inside the same user gesture. There is no OS-volume permission on the web.
    alarmContext ||= new (window.AudioContext || window.webkitAudioContext)();
    alarmContext.onstatechange = () => { if (supervised() && !protectionReady()) { leaveWorkspace('audio-interrupted'); resumeCountdown(); } };
    audio = alarmContext.resume();
    fullscreen = document.fullscreenElement ? Promise.resolve() : document.documentElement.requestFullscreen();
    const outcomes = await Promise.race([Promise.allSettled([audio, fullscreen]), new Promise(resolve => setTimeout(() => resolve(null), 8000))]);
    if (!outcomes || outcomes.some(result => result.status === 'rejected') || !protectionReady()) throw new Error('Permite pantalla completa y reproducción de sonido para iniciar. Comprueba también el volumen del equipo y vuelve a intentar.');
    fullscreenRequested = true;
    alarmTone();
    if (project()) record('capability', { mode, fullscreen: true, audio: alarmContext.state, systemVolume: 'El navegador no puede comprobarlo ni modificarlo.' });
    return true;
  } catch (error) {
    const message = error.message || 'No se pudieron preparar el sonido y la pantalla completa.';
    if ($('session-dialog').open) $('session-error').textContent = message; else toast(message);
    return false;
  }
}
$('restore-protection').onclick = async () => {
  if (await prepareSupervision(project().mode)) { startAlarm(); alarmTone(); resumeCountdown(); }
};
function alarmTone() {
  if (!alarmContext || alarmContext.state !== 'running') return;
  const now = alarmContext.currentTime;
  [660, 880].forEach((frequency, index) => {
    const oscillator = alarmContext.createOscillator(), gain = alarmContext.createGain();
    oscillator.frequency.value = frequency; oscillator.type = 'triangle';
    gain.gain.setValueAtTime(0, now + index * .18); gain.gain.linearRampToValueAtTime(.22, now + index * .18 + .015); gain.gain.exponentialRampToValueAtTime(.001, now + index * .18 + .16);
    oscillator.connect(gain); gain.connect(alarmContext.destination); oscillator.start(now + index * .18); oscillator.stop(now + index * .18 + .18);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
function startAlarm() {
  if (alarmTimer) return;
  document.body.classList.add('supervision-alert');
  $('focus-student').textContent = state?.student?.name || '';
  $('restore-protection').hidden = protectionReady();
  alarmTone(); alarmTimer = setInterval(alarmTone, 1200);
  let visible = true;
  document.title = '⚠ Regresa a CodeGO';
  titleTimer = setInterval(() => { visible = !visible; document.title = visible ? '⚠ Regresa a CodeGO' : originalTitle; }, 1000);
}
function stopAlarm() {
  clearInterval(alarmTimer); clearInterval(titleTimer); alarmTimer = null; titleTimer = null;
  document.body.classList.remove('supervision-alert'); document.title = originalTitle;
}
document.addEventListener('fullscreenchange', () => {
  if (fullscreenRequested && !document.fullscreenElement) { fullscreenRequested = false; returnDeadline = 0; leaveWorkspace('fullscreen-exit'); resumeCountdown(); }
});
// A deadline based on wall-clock time survives background timer throttling on mobile.
function supervised() { return state && project().mode !== 'activity' && !project().locked && !$('session-dialog').open; }
function leaveWorkspace(reason = 'focus-loss') {
  if (!supervised() || warning || sealing) return;
  warning = true; returnDeadline = 0; telemetry.recordBlur();
  project().incidents = (project().incidents || 0) + 1; project().pendingIncident = true; record('incident', { reason }); markChanged(); void save(); startAlarm();
  editor.readOnly = true;
  $('focus-dialog').showModal();
  renderWorkspace();
}
function resumeCountdown() {
  if (!warning || document.hidden || !document.hasFocus()) return;
  $('restore-protection').hidden = protectionReady();
  if (!protectionReady()) { returnDeadline = 0; clearInterval(warningTimer); $('resume').disabled = true; $('resume').textContent = 'Primero restablece la supervisión'; return; }
  if (!returnDeadline) returnDeadline = Date.now() + WEB_RETURN_WAIT;
  clearInterval(warningTimer);
  const tick = () => {
    if (!protectionReady()) { returnDeadline = 0; clearInterval(warningTimer); $('resume').disabled = true; $('resume').textContent = 'Primero restablece la supervisión'; $('restore-protection').hidden = false; return; }
    const remaining = Math.max(0, Math.ceil((returnDeadline - Date.now()) / 1000));
    $('resume').textContent = remaining ? `Espera ${remaining} s` : 'Reanudar actividad';
    $('resume').disabled = remaining > 0;
    if (!remaining) clearInterval(warningTimer);
  };
  tick(); warningTimer = setInterval(tick, 200);
}
$('focus-dialog').addEventListener('cancel', event => event.preventDefault());
$('resume').onclick = () => {
  if (!warning || !returnDeadline || Date.now() < returnDeadline || document.hidden || !document.hasFocus() || !protectionReady()) return;
  warning = false; returnDeadline = 0; clearInterval(warningTimer); project().pendingIncident = false; record('incident-resumed', { waitedSeconds: WEB_RETURN_WAIT / 1000 }); markChanged(); stopAlarm(); $('focus-dialog').close(); renderWorkspace(); updateTerminalInput(Boolean(inputRequest));
};
window.addEventListener('blur', () => {
  if (warning) { returnDeadline = 0; clearInterval(warningTimer); $('resume').disabled = true; $('resume').textContent = 'Espera 30 s'; }
  else leaveWorkspace();
});
window.addEventListener('focus', resumeCountdown);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { preserveEmergencyDraft(); save(); leaveWorkspace(); if (warning) { returnDeadline = 0; clearInterval(warningTimer); $('resume').disabled = true; $('resume').textContent = 'Espera 30 s'; } }
  else resumeCountdown();
});
const learningUI = window.createCodeGOLearning({
  getState: () => state, changed: markChanged, toast, download,
  startExercise: async (exercise, lessonId, assessmentId) => {
    if (running || warning || (project().mode !== 'activity' && !project().locked)) return toast('Entrega tu actividad antes de abrir una práctica.');
    if (!await save()) return;
    const group = lessonId ? `lesson-${lessonId}` : `assessment-${assessmentId}`;
    let target = state.projects.find(item => item.learningGroup === group && !item.locked);
    if (!target) {
      if (state.projects.filter(item => !item.learningGroup).length >= 20) return toast('Descarga una copia de tus proyectos antes de crear más.');
      target = freshProject(lessonId ? course.lessons.find(item => item.id === lessonId).title : exercise.title);
      target.files = {}; target.learningGroup = group;
      state.projects.push(target);
    }
    const path = `${exercise.id}.py`;
    if (!Object.hasOwn(target.files, path)) target.files[path] = exercise.starter;
    target.activeFile = path; target.lessonId = lessonId; target.exerciseId = exercise.id; target.assessmentId = assessmentId;
    target.assignment = { title: exercise.title, prompt: exercise.prompt, tests: exercise.tests };
    target.exerciseFiles ||= {};
    target.exerciseFiles[path] = { lessonId, exerciseId: exercise.id, assessmentId, assignment: target.assignment };
    state.currentProject = target.id;
    state.lastView = 'workspace'; $('home-screen').hidden = true; $('app').hidden = false;
    markChanged(); renderWorkspace(); setPane('editor'); editor.focus();
  }
});
function renderCourse() { learningUI.render(); }
$('verify-delivery').onclick = () => {
  if (running || warning || sealing || project().mode !== 'activity' && !project().locked) return toast('Termina tu actividad antes de revisar una entrega.');
  $('verify-input').click();
};
$('verify-input').onchange = async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file || file.size > 30000000) return toast('El archivo de entrega debe ocupar menos de 30 MB.');
  const container = $('verify-result'); container.replaceChildren();
  try {
    const envelope = JSON.parse(await file.text());
    if (!['codego-web-submission-v2', 'codego-project-v2'].includes(envelope.payload?.format) || !await window.CodeGOEvidence.verify(envelope)) throw new Error('La firma no coincide: el archivo fue modificado o no es una entrega firmada de CodeGO Web.');
    const payload = envelope.payload;
    const files = validateFiles(payload.project?.files);
    const add = (tag, text) => { const el = document.createElement(tag); el.textContent = text; container.append(el); return el; };
    add('strong', 'Firma e integridad comprobadas');
    add('p', `${payload.student?.name || 'Sin nombre'} · ${payload.student?.id || 'Sin matrícula'} · ${payload.email || ''}`);
    add('p', `${modeLabels[payload.project.mode] || 'Proyecto'} · ${payload.createdAt} · ${Object.keys(files).length} archivos`);
    add('p', `Instalación: ${envelope.seal.fingerprint}`);
    add('p', payload.note);
    const events = payload.project.evidence;
    add('p', `${events?.events?.length || 0} registros conservados · ${events?.omitted || 0} registros antiguos resumidos. No se identifica la aplicación de origen del portapapeles.`);
    const select = add('select', ''); select.setAttribute('aria-label', 'Archivo de la entrega');
    for (const name of Object.keys(files)) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
    const preview = add('pre', files[select.value]); preview.className = 'verified-source'; select.onchange = () => { preview.textContent = files[select.value]; };
    const details = add('details', ''); const summary = document.createElement('summary'); summary.textContent = 'Ver actividad registrada'; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(events || {}, null, 2); details.append(summary, pre);
  } catch (error) { const message = document.createElement('p'); message.textContent = error.message; message.setAttribute('role', 'alert'); container.append(message); }
  $('verify-dialog').showModal();
};
$('teacher').onclick = () => {
  if (running || warning || project().mode !== 'activity') return toast('Abre el modo libre para preparar una actividad.');
  $('teacher-dialog').showModal(); $('teacher-name').focus();
};
course.assessments.forEach(assessment => {
  const option = document.createElement('option'); option.value = assessment.id; option.textContent = assessment.title;
  $('teacher-template').append(option);
});
$('teacher-template').onchange = () => {
  const assessment = course.assessments.find(item => item.id === $('teacher-template').value);
  if (!assessment) return;
  $('teacher-name').value = assessment.title; $('teacher-prompt').value = assessment.exercise.prompt;
  $('teacher-starter').value = assessment.exercise.starter; $('teacher-tests').value = JSON.stringify(assessment.exercise.tests, null, 2);
};
$('teacher-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const activity = course.validateAssignment({ format: 'codego-activity-v1', title: $('teacher-name').value, mode: $('teacher-mode').value, prompt: $('teacher-prompt').value, starter: $('teacher-starter').value, tests: JSON.parse($('teacher-tests').value) });
    download(activity.title + '.codego-actividad.json', JSON.stringify(activity, null, 2)); $('teacher-dialog').close();
  } catch (error) { $('teacher-error').textContent = error.message; }
});
$('import-activity').onclick = () => {
  if (running || warning || project().mode !== 'activity') return toast('Entrega la actividad actual antes de abrir otra.');
  $('activity-input').click();
};
$('activity-input').onchange = async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file || file.size > 500000) return toast('La actividad debe ocupar menos de 500 KB.');
  try {
    const activity = course.validateAssignment(JSON.parse(await file.text()));
    if (state.projects.filter(item => !item.learningGroup).length >= 20) throw new Error('Se alcanzó el límite de 20 proyectos.');
    if (!await confirmAction(activity.title, activity.prompt + '\n\nLas pruebas ejecutan Python del autor. Abre solo actividades de tu profesor.')) return;
    if (!await prepareSupervision(activity.mode)) return;
    const next = freshProject(activity.title); next.files = { 'main.py': activity.starter }; next.mode = activity.mode; next.assignment = activity;
    state.projects.push(next); state.currentProject = next.id;
    markChanged(); renderWorkspace(); setPane('editor');
  } catch (error) { toast(error.message); }
};
$('import-project').onclick = async () => {
  if (project().mode !== 'activity' && !project().locked || running || warning) return;
  if (await confirmAction('Abrir archivos o carpeta', 'Continuar abre una carpeta. Cancelar permite elegir archivos o una copia .codego-web.json.')) $('folder-input').click();
  else $('file-input').click();
};
function validateFiles(files) {
  const entries = Object.entries(files || {});
  if (!entries.length || entries.length > 200 || entries.some(([path, text]) => !safePath(path) || typeof text !== 'string' || text.length > 1000000) || JSON.stringify(files).length > 5000000) throw new Error('El proyecto admite hasta 200 archivos de texto, 1 MB por archivo y 5 MB en total.');
  return Object.fromEntries(entries);
}
async function importFiles(event) {
  const files = [...event.target.files]; event.target.value = '';
  if (!files.length || project().mode !== 'activity' || running) return;
  try {
    if (files.length > 200 || files.reduce((total, file) => total + file.size, 0) > 5000000) throw new Error('El límite es 200 archivos y 5 MB por proyecto.');
    let next;
    if (files.length === 1 && files[0].name.endsWith('.codego-web.json')) {
      const backup = JSON.parse(await files[0].text());
      if (backup.payload) {
        if (!await window.CodeGOEvidence.verify(backup)) throw new Error('La firma de la copia no coincide. El archivo fue modificado o no es válido.');
        if (backup.payload.project?.locked || backup.payload.format === 'codego-web-submission-v2') throw new Error('Una entrega sellada se consulta como entrega; no se puede reabrir para editar.');
        backup.format = 'codego-project-v1'; backup.project = backup.payload.project;
      }
      if (backup.format !== 'codego-project-v1') throw new Error('No es una copia de proyecto CodeGO Web.');
      next = freshProject(String(backup.project?.name || 'Proyecto recuperado').slice(0, 120));
      next.files = validateFiles(backup.project?.files);
      if (backup.project?.mode === 'task') { next.mode = 'task'; beginTaskReferences(next); if (!await prepareSupervision('task')) return; }
    } else {
      next = freshProject(files[0].webkitRelativePath?.split('/')[0] || 'Archivos importados');
      const entries = await Promise.all(files.filter(file => /\.(py|js|txt|json|csv|md)$/i.test(file.name)).map(async file => [file.webkitRelativePath?.split('/').slice(1).join('/') || file.name, await file.text()]));
      if (new Set(entries.map(([path]) => path)).size !== entries.length) throw new Error('Hay nombres de archivo duplicados. Importa la carpeta completa.');
      next.files = validateFiles(Object.fromEntries(entries));
    }
    if (state.projects.filter(item => !item.learningGroup).length >= 20) throw new Error('Se alcanzó el límite de 20 proyectos.');
    if (next.mode !== 'task') next.activeFile = Object.keys(next.files).find(path => path.endsWith('.py')) || Object.keys(next.files)[0];
    state.projects.push(next); state.currentProject = next.id; record('import', { files: Object.keys(next.files), note: 'Contenido previo a esta sesión; no acredita que se haya escrito aquí.' }); markChanged(); renderWorkspace(); setPane('editor');
  } catch (error) { toast(error.message); }
}
$('file-input').onchange = importFiles;
$('folder-input').onchange = importFiles;
function updateConnection() {
  $('connection').textContent = navigator.onLine ? 'En línea' : 'Sin conexión · guardado local';
  if (!navigator.onLine && state) toast('Puedes seguir editando. Python necesita haberse cargado antes para ejecutar sin conexión.');
}
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
window.addEventListener('pagehide', () => { preserveEmergencyDraft(); void save(); engine.stop(); });
window.addEventListener('beforeunload', event => {
  if (navigationAllowed) return;
  if (change !== savedChange || supervised()) {
    if (supervised()) { project().pendingIncident = true; record('navigation-attempt', { action: 'browser-close-or-reload' }); markChanged(); }
    preserveEmergencyDraft(); void save(); event.preventDefault(); event.returnValue = '';
  }
});
async function guardedNavigation(action) {
  if (!state || navigationQuestion || sealing || $('confirm-dialog').open) return;
  navigationQuestion = true;
  try {
    preserveEmergencyDraft();
    const message = supervised() ? 'Salir o recargar registra una incidencia. Al regresar deberás restablecer la supervisión y esperar 30 segundos. Tu trabajo se guardará antes de salir.' : 'Se guardarán tus cambios antes de continuar.';
    if (!await confirmAction(action === 'reload' ? '¿Guardar y recargar?' : '¿Guardar y salir de CodeGO?', message)) return;
    if (supervised()) { project().pendingIncident = true; record('navigation-confirmed', { action }); markChanged(); }
    preserveEmergencyDraft();
    if (!await save()) return;
    navigationAllowed = true;
    if (action === 'reload') location.reload(); else history.go(-2);
  } finally { navigationQuestion = false; }
}
// One same-URL history entry catches ordinary Back/swipe gestures; beforeunload
// remains the browser's final protection against jumps beyond that entry.
history.replaceState({ codegoBase: true }, '', location.href);
history.pushState({ codegoGuard: true }, '', location.href);
window.addEventListener('popstate', () => {
  if (navigationAllowed) return;
  history.pushState({ codegoGuard: true }, '', location.href);
  if (state) { preserveEmergencyDraft(); void save(); void guardedNavigation('back'); }
});

const splitter = $('pane-splitter');
function resizeEditor(clientX) {
  const workspace = document.querySelector('.workspace').getBoundingClientRect();
  const explorer = $('files-pane').getBoundingClientRect().width;
  const available = workspace.width - explorer - 6;
  const width = Math.max(180, Math.min(available - 220, clientX - workspace.left - explorer));
  document.querySelector('.workspace').style.setProperty('--editor-width', `${width}px`);
}
splitter.addEventListener('pointerdown', event => { splitter.setPointerCapture(event.pointerId); document.body.classList.add('resizing'); resizeEditor(event.clientX); });
splitter.addEventListener('pointermove', event => { if (splitter.hasPointerCapture(event.pointerId)) resizeEditor(event.clientX); });
splitter.addEventListener('pointerup', event => { splitter.releasePointerCapture(event.pointerId); document.body.classList.remove('resizing'); });
splitter.addEventListener('pointercancel', () => document.body.classList.remove('resizing'));
splitter.addEventListener('keydown', event => {
  if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); resizeEditor(splitter.getBoundingClientRect().left + (event.key === 'ArrowLeft' ? -20 : 20)); }
});
function fitViewport() { document.documentElement.style.setProperty('--app-height', `${Math.round(window.visualViewport?.height || innerHeight)}px`); }
window.visualViewport?.addEventListener('resize', fitViewport, { passive: true });
fitViewport();
// Authentication is verified by Firebase; typing a Google email is never treated as sign-in.
async function initializeAuth() {
  try {
    const [{ initializeApp }, authSDK] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js')
    ]);
    const auth = authSDK.getAuth(initializeApp(window.CODEGO_FIREBASE_CONFIG));
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    const provider = new authSDK.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    authSDK.onAuthStateChanged(auth, async account => {
      if (state && user) { preserveEmergencyDraft(); await save(); }
      engine.stop(); warning = false; clearInterval(warningTimer); stopAlarm();
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      if (!account || !account.emailVerified || !account.providerData.some(item => item.providerId === 'google.com')) {
        user = null; state = null; telemetryProject = null; $('app').hidden = true; $('home-screen').hidden = true; $('welcome').hidden = false;
        $('auth-status').textContent = navigator.onLine ? 'Usa tu cuenta de Google para comenzar.' : 'Conéctate para iniciar sesión.';
        $('google-signin').disabled = false; $('google-signin').textContent = 'Continuar con Google'; return;
      }
      user = account;
      try {
        state = await window.CodeGOStore.load(account.uid);
        if (user?.uid !== account.uid) return;
        if (!state) {
          const initial = freshProject(); state = { projects: [initial], currentProject: initial.id, student: { name: account.displayName || '', id: '' }, progress: {}, revision: 0 };
        }
        revision = state.revision || 0; change = savedChange = 0; recoverEmergencyDraft();
        $('account-email').textContent = account.email;
        $('welcome').hidden = true; $('app').hidden = false;
        renderWorkspace(); updateConnection();
        if (change !== savedChange) void save();
        if (project().mode !== 'activity' && !project().locked && !project().pendingIncident) { leaveWorkspace('session-recovered'); resumeCountdown(); }
        state.progress ||= {};
        state.learning ||= { version: 2, quiz: {}, exercises: {}, assessments: {} };
        if ((!state.profileConfirmed || state.lastView === 'home') && !project().pendingIncident && (project().mode === 'activity' || project().locked)) showHome();
      } catch (error) { $('auth-status').textContent = 'No se pudo abrir el almacenamiento local. Permite el almacenamiento del sitio y vuelve a cargar.'; }
    }, error => { $('auth-status').textContent = 'No se pudo comprobar la sesión. Comprueba la conexión.'; });
    $('google-signin').onclick = async () => {
      $('google-signin').disabled = true; $('auth-status').textContent = '';
      try { await authSDK.signInWithPopup(auth, provider); }
      catch (error) {
        if (error.code === 'auth/popup-blocked') {
          $('auth-status').textContent = 'Permite la ventana de Google para iniciar sesión y vuelve a intentarlo.';
        } else if (error.code === 'auth/unauthorized-domain') $('auth-status').textContent = 'El dominio aún no está autorizado para Google. Contacta al docente.';
        else if (error.code !== 'auth/popup-closed-by-user') $('auth-status').textContent = 'No se pudo iniciar sesión. Comprueba la conexión e inténtalo otra vez.';
      } finally { $('google-signin').disabled = false; }
    };
    $('signout').onclick = async () => {
      if (running || warning || project().mode !== 'activity' && !project().locked) return toast('Entrega la actividad antes de cerrar sesión.');
      if (!await save()) return;
      await authSDK.signOut(auth);
    };
  } catch (error) {
    $('auth-status').textContent = 'No se pudo cargar Google. Comprueba la conexión y vuelve a cargar la página.';
    $('google-signin').textContent = 'Volver a intentar'; $('google-signin').disabled = false;
    $('google-signin').onclick = () => location.reload();
  }
}
if ('serviceWorker' in navigator) {
  try {
    await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(resolve, 2500))]);
  } catch (_) {}
}
initializeAuth();

window.CodeGOViewportMenus.installContext(() => {
  if (!state) return [{ label: 'CodeGO · inicia sesión para trabajar', disabled: true }];
  if (warning || sealing) return [{ label: warning ? 'Actividad en pausa · completa el aviso' : 'Preparando tu entrega', disabled: true }];
  const actions = [
    { label: 'Ejecutar archivo', disabled: running || project().locked, run: () => run(project().assignment?.tests || null) },
    { label: 'Guardar cambios', run: async () => { if (await save()) toast('Cambios guardados en este navegador.'); } },
    { label: 'Ver archivos', run: () => setPane('files') },
    { label: 'Ver consola', run: () => setPane('terminal') }
  ];
  if (project().mode === 'activity') actions.unshift(
    { label: 'Seleccionar todo el código', run: () => { setPane('editor'); editor.focus(); editor.select(); } },
    { label: 'Copiar selección', run: () => navigator.clipboard.writeText(editor.value.slice(editor.selectionStart, editor.selectionEnd)) },
    { label: 'Pegar en el editor', disabled: editor.readOnly, run: async () => insertCode(await navigator.clipboard.readText()) }
  );
  return actions;
}, toast);

if (location.hostname === 'codego-python.web.app' || location.hostname === 'codego-python.firebaseapp.com') document.querySelectorAll('[data-legacy-address]').forEach(element => { element.hidden = false; });
