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
let returnDeadline = 0;
let warningTimer;
let textResolver;
let errorLine = 1;
let telemetry = new SDK.ForensicTelemetry();
let telemetryProject = null;
let toastTimer;
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
document.querySelectorAll('[data-web-version]').forEach(element => { element.textContent = 'v1.6.15'; });
function freshProject(name = 'Mi proyecto') {
  return { id: uuid(), name, files: { 'main.py': '# Tu primer programa\nprint("Hola, Python")\n' }, activeFile: 'main.py', mode: 'activity', stdin: '', locked: false };
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
    const snapshot = structuredClone(state);
    snapshot.revision = revision;
    try {
      revision = await window.CodeGOStore.save(owner, snapshot);
      savedChange = version;
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
function backup() {
  if (!state) return;
  download(project().name + '.codego-web.json', JSON.stringify({ format: 'codego-project-v1', project: project() }, null, 2));
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
      button.textContent = name; button.title = path; button.classList.toggle('active', path === current.activeFile);
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
  editor.readOnly = current.locked || warning;
  $('stdin').value = current.stdin || '';
  $('filename').textContent = current.activeFile;
  $('workspace-project-label').textContent = current.name;
  $('workspace-student').textContent = state.student.name;
  $('open-session').textContent = modeLabels[current.mode];
  $('submit').hidden = current.mode === 'activity';
  $('submit').disabled = current.mode === 'activity' || current.locked || running || warning;
  $('run').disabled = running || current.locked || warning;
  $('new-file').disabled = current.locked || running || warning;
  $('new-project').disabled = (current.mode !== 'activity' && !current.locked) || running || warning;
  $('import-project').disabled = (current.mode !== 'activity' && !current.locked) || running || warning;
  $('project-select').disabled = (current.mode !== 'activity' && !current.locked) || running || warning;
  $('assignment-summary').hidden = !current.assignment;
  $('assignment-title').textContent = current.assignment?.title || '';
  $('assignment-prompt').textContent = current.assignment?.prompt || '';
  $('storage-location').textContent = `${Object.keys(current.files).length} archivos · en este navegador`;
  renderProjects(); renderFiles(); updateEditor();
}
function recordEditorChange(event) {
  const current = project();
  if (!current || current.locked || warning) return;
  if (editor.value.length > 1000000) {
    editor.value = current.files[current.activeFile]; toast('El editor admite hasta 1 MB por archivo. Divide el proyecto en archivos más pequeños.'); return;
  }
  const otherSize = Object.entries(current.files).reduce((size, [path, source]) => size + (path === current.activeFile ? 0 : source.length), 0);
  if (otherSize + editor.value.length > 5000000) {
    editor.value = current.files[current.activeFile]; toast('El proyecto alcanzó 5 MB. Divide el trabajo en proyectos más pequeños.'); return;
  }
  current.files[current.activeFile] = editor.value;
  if (current.mode !== 'activity') telemetry.recordKeystroke(event?.data?.length || 0);
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
for (const type of ['copy', 'cut', 'paste', 'drop']) editor.addEventListener(type, event => {
  if (project()?.locked || (project()?.mode !== 'activity')) {
    event.preventDefault();
    if (type === 'paste') telemetry.recordPasteAttempt();
    toast('En esta modalidad escribe tu código sin copiar ni pegar.');
  }
});
editor.addEventListener('beforeinput', event => {
  if (editor.readOnly || (project()?.mode !== 'activity' && /insertFromPaste|insertFromDrop|deleteByCut/.test(event.inputType))) event.preventDefault();
});
$('stdin').addEventListener('input', () => { project().stdin = $('stdin').value; markChanged(); });
$('new-file').onclick = async () => {
  if (project().locked || warning || running) return;
  const path = await askText('Nuevo archivo o subcarpeta', 'ejercicios/main.py');
  if (path === null) return;
  if (!safePath(path) || !/\.(py|txt|csv|json|js|md)$/i.test(path)) return toast('Usa una ruta relativa y una extensión .py, .js, .txt, .csv, .json o .md.');
  if (Object.keys(project().files).length >= 200) return toast('El proyecto admite hasta 200 archivos.');
  if (Object.hasOwn(project().files, path)) return toast('Ya existe un archivo con ese nombre.');
  project().files[path] = ''; project().activeFile = path; markChanged(); renderWorkspace();
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
function openSession(requestedMode = null) {
  if (running || warning) return toast('Termina la ejecución o el aviso antes de cambiar de modalidad.');
  if (project().mode !== 'activity' && !project().locked) return toast('Entrega la actividad antes de cambiar de modalidad.');
  $('student-name').value = state.student.name || user.displayName || '';
  $('student-id').value = state.student.id || '';
  renderProjects();
  document.querySelector(`input[name=mode][value="${typeof requestedMode === 'string' ? requestedMode : project().locked ? 'activity' : project().mode}"]`).checked = true;
  updateModeDescription();
  $('session-dialog').showModal(); $('student-name').focus();
}
$('open-session').onclick = openSession;
function updateModeDescription() {
  const mode = document.querySelector('input[name=mode]:checked').value;
  $('mode-description').textContent = mode === 'activity' ? 'Práctica libre. Puedes copiar, pegar y cambiar de aplicación.' : `${mode === 'exam' ? 'Examen' : 'Tarea'}: sin copiar ni pegar. Salir de la ventana registra una incidencia y exige 12 segundos al volver. La web no bloquea otras apps ni la red.`;
}
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', updateModeDescription));
$('session-form').addEventListener('submit', async event => {
  event.preventDefault();
  state.student = { name: $('student-name').value.trim(), id: $('student-id').value.trim() };
  if (!state.student.name) return;
  const selected = state.projects.find(item => item.id === $('session-project').value);
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (selected.locked) return void ($('session-error').textContent = 'Este proyecto ya se entregó. Crea uno nuevo o elige otro proyecto.');
  state.profileConfirmed = true;
  state.lastView = 'workspace';
  $('home-screen').hidden = true; $('app').hidden = false;
  state.currentProject = selected.id;
  if (mode === 'exam') {
    const clean = freshProject(`Examen · ${state.student.name}`);
    clean.files = { 'main.py': '' }; state.projects.push(clean); state.currentProject = clean.id;
  }
  project().mode = mode;
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
const engine = new SDK.WebExecutionEngine({
  workerURL: new URL('execution-worker.js', import.meta.url).href,
  onOutput: (text, type) => { appendOutput(text, type); if (type === 'stderr') errorOutput = (errorOutput + text).slice(-16000); },
  onFinished: result => { appendOutput(`\n${result.stopped ? 'Detenido' : result.exitCode === 0 ? 'Terminado' : 'Revisa tu código'} · ${result.duration} s\n`, 'system'); }
});
function explainError(raw) {
  const definitions = [
    [/IndentationError|TabError/, 'Revisa la sangría', 'Usa cuatro espacios dentro de cada bloque y evita mezclar tabuladores.', 'if True:\n    print("Hola")'],
    [/SyntaxError/, 'Revisa la estructura de la línea', 'Comprueba los dos puntos, las comillas y los paréntesis de esta línea y la anterior.', 'for numero in range(3):\n    print(numero)'],
    [/NameError/, 'Python no reconoce ese nombre', 'Define la variable antes de usarla. Revisa mayúsculas y errores de escritura.', 'nombre = "Ana"\nprint(nombre)'],
    [/TypeError/, 'Los tipos de datos no coinciden', 'input() devuelve texto. Convierte con int() o float() antes de calcular.', 'edad = int("18")\nprint(edad + 1)'],
    [/ValueError/, 'No se pudo convertir el valor', 'Comprueba que el texto representa el dato que necesitas.', 'try:\n    numero = int("18")\nexcept ValueError:\n    print("Escribe un entero")'],
    [/ZeroDivisionError/, 'El divisor es cero', 'Comprueba el divisor antes de dividir.', 'if divisor != 0:\n    resultado = total / divisor'],
    [/IndexError/, 'Esa posición no existe', 'Los índices empiezan en 0 y llegan hasta len(lista) - 1.', 'datos = [10, 20]\nprint(datos[0])  # 10'],
    [/KeyError/, 'No existe esa clave', 'Comprueba la clave o usa get() con un valor alternativo.', 'datos = {"nombre": "Ana"}\nprint(datos.get("edad", 0))'],
    [/EOFError/, 'Falta una respuesta para input()', 'Abre Entradas para input(), escribe una respuesta por línea y vuelve a ejecutar.', 'nombre = input("Nombre: ")\n# En Entradas escribe: Ana'],
    [/ModuleNotFoundError|ImportError/, 'Falta un módulo', 'La web incluye Python básico. Las bibliotecas de escritorio y ventanas gráficas necesitan la app nativa.', 'import math\nprint(math.sqrt(16))']
  ];
  const [, title, message, example] = definitions.find(([pattern]) => pattern.test(raw)) || [null, 'El programa necesita un ajuste', 'Lee la última línea de la consola, corrige una causa y vuelve a ejecutar.', ''];
  const lines = [...raw.matchAll(/File "[^"]+", line (\d+)/g)];
  errorLine = Number(lines.at(-1)?.[1]) || 1;
  $('error-title').textContent = title;
  $('error-message').textContent = message;
  $('error-example').textContent = example;
  $('error-guide').hidden = false;
  $('goto-error').hidden = !lines.length;
}
$('goto-error').onclick = () => {
  setPane('editor'); editor.focus();
  const offset = editor.value.split('\n').slice(0, errorLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
  editor.setSelectionRange(offset, offset); editor.scrollTop = Math.max(0, (errorLine - 4) * 24); updateEditor();
};
async function run(tests = null) {
  if (running || project().locked || warning) return;
  if (!await save()) return;
  const current = project();
  const filename = current.activeFile;
  const executedSource = current.files[filename];
  const executedExerciseId = current.exerciseId;
  const executedLessonId = current.lessonId;
  const language = /\.js$/i.test(filename) ? 'javascript' : /\.py$/i.test(filename) ? 'python' : null;
  if (!language) return toast('Abre un archivo Python o JavaScript para ejecutarlo.');
  running = true; renderWorkspace();
  $('stop').hidden = false; $('run').hidden = true; $('error-guide').hidden = true; $('evaluation').hidden = true;
  $('terminal-transcript').replaceChildren(); errorOutput = '';
  setPane('terminal'); telemetry.recordRun();
  try {
    const result = await engine.run(executedSource, language, { filename, files: current.files, stdin: current.stdin ? current.stdin.split('\n') : [], tests });
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
        state.learning.exercises[executedExerciseId] = { ...current.lastEvaluation, passed: grade.passed === grade.total, attempts: (previous?.attempts || 0) + 1 };
      }
      $('evaluation').hidden = false; markChanged();
    }
  } catch (error) { appendOutput(error.message + '\n', 'stderr'); explainError(error.message); }
  finally { running = false; $('stop').hidden = true; $('run').hidden = false; renderWorkspace(); }
}
$('run').onclick = () => run(project().assignment?.tests || null);
$('stop').onclick = () => engine.stop();
$('clear-terminal').onclick = () => { $('terminal-transcript').replaceChildren(); };
window.addEventListener('keydown', event => {
  if (event.key === 'F5' && state && !$('welcome').checkVisibility()) { event.preventDefault(); run(project().assignment?.tests || null); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state) { event.preventDefault(); save(); }
});
$('backup').onclick = backup;
$('submit').onclick = async () => {
  if (project().mode === 'activity' || project().locked || running || warning) return;
  if (!await confirmAction('Entregar actividad', 'Se descargará tu trabajo y el proyecto quedará sellado en este navegador.')) return;
  if (!await save()) return;
  const current = project();
  const payload = { format: 'codego-web-submission-v1', platform: 'browser', student: state.student, email: user.email, project: structuredClone(current), telemetry: telemetry.getReport(), createdAt: new Date().toISOString(), verification: 'SHA-256 detecta cambios; no acredita autoría ni equivale al sello Ed25519 de escritorio.' };
  const canonical = JSON.stringify(payload);
  const envelope = { payload, sha256: await SDK.computeSHA256(canonical) };
  download(current.name + '.entrega-web.json', JSON.stringify(envelope, null, 2));
  current.locked = true; markChanged(); await save(); renderWorkspace();
  toast('Entrega descargada. Conserva el archivo y envíalo a tu profesor.');
};
// A deadline based on wall-clock time survives background timer throttling on mobile.
function supervised() { return state && project().mode !== 'activity' && !project().locked && !$('session-dialog').open; }
function leaveWorkspace() {
  if (!supervised() || warning || document.querySelector('dialog[open]')) return;
  warning = true; returnDeadline = 0; telemetry.recordBlur();
  project().incidents = (project().incidents || 0) + 1; markChanged();
  editor.readOnly = true;
  $('focus-dialog').showModal();
  renderWorkspace();
}
function resumeCountdown() {
  if (!warning || document.hidden || !document.hasFocus()) return;
  if (!returnDeadline) returnDeadline = Date.now() + 12000;
  clearInterval(warningTimer);
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((returnDeadline - Date.now()) / 1000));
    $('resume').textContent = remaining ? `Espera ${remaining} s` : 'Reanudar actividad';
    $('resume').disabled = remaining > 0;
    if (!remaining) clearInterval(warningTimer);
  };
  tick(); warningTimer = setInterval(tick, 200);
}
$('focus-dialog').addEventListener('cancel', event => event.preventDefault());
$('resume').onclick = () => {
  if (!warning || !returnDeadline || Date.now() < returnDeadline || document.hidden || !document.hasFocus()) return;
  warning = false; returnDeadline = 0; clearInterval(warningTimer); $('focus-dialog').close(); renderWorkspace();
};
window.addEventListener('blur', () => {
  if (warning) { returnDeadline = 0; clearInterval(warningTimer); $('resume').disabled = true; $('resume').textContent = 'Espera 12 s'; }
  else leaveWorkspace();
});
window.addEventListener('focus', resumeCountdown);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); leaveWorkspace(); if (warning) { returnDeadline = 0; clearInterval(warningTimer); $('resume').disabled = true; $('resume').textContent = 'Espera 12 s'; } }
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
      if (backup.format !== 'codego-project-v1') throw new Error('No es una copia de proyecto CodeGO Web.');
      next = freshProject(String(backup.project?.name || 'Proyecto recuperado').slice(0, 120));
      next.files = validateFiles(backup.project?.files);
    } else {
      next = freshProject(files[0].webkitRelativePath?.split('/')[0] || 'Archivos importados');
      const entries = await Promise.all(files.filter(file => /\.(py|js|txt|json|csv|md)$/i.test(file.name)).map(async file => [file.webkitRelativePath?.split('/').slice(1).join('/') || file.name, await file.text()]));
      if (new Set(entries.map(([path]) => path)).size !== entries.length) throw new Error('Hay nombres de archivo duplicados. Importa la carpeta completa.');
      next.files = validateFiles(Object.fromEntries(entries));
    }
    if (state.projects.filter(item => !item.learningGroup).length >= 20) throw new Error('Se alcanzó el límite de 20 proyectos.');
    next.activeFile = Object.keys(next.files).find(path => path.endsWith('.py')) || Object.keys(next.files)[0];
    state.projects.push(next); state.currentProject = next.id; markChanged(); renderWorkspace(); setPane('editor');
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
window.addEventListener('pagehide', () => { save(); engine.stop(); });
window.addEventListener('beforeunload', event => { if (change !== savedChange) { event.preventDefault(); event.returnValue = ''; } });
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
      engine.stop(); warning = false; clearInterval(warningTimer);
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
        revision = state.revision || 0; change = savedChange = 0;
        $('account-email').textContent = account.email;
        $('welcome').hidden = true; $('app').hidden = false;
        renderWorkspace(); updateConnection();
        state.progress ||= {};
        state.learning ||= { version: 2, quiz: {}, exercises: {}, assessments: {} };
        if (!state.profileConfirmed || state.lastView === 'home') showHome();
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
    await navigator.serviceWorker.register('sw.js');
    await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(resolve, 2500))]);
  } catch (_) {}
}
initializeAuth();
