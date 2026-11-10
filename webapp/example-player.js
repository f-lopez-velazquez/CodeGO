/* Interactive teaching player. Traces are generated from Python, never inferred by evaluating student code. */
(function (root) {
  'use strict';
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const initial = { variables: {}, output: '', explanation: 'Primero escribimos el código. Después seguiremos su recorrido, una instrucción a la vez.', stack: ['archivo'], changed: [] };
  root.createCodeGOExamplePlayer = function ({ example, trace, key, autoplay = false, onStart = () => {} }) {
    const card = element('article', undefined, 'example-card example-demo');
    card.dataset.exampleKey = key;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motion.matches;
    let playing = false;
    let destroyed = false;
    let timer = null;
    let step = 0;
    let typed = reduced ? example.code.length : 0;
    let speed = 1;
    let lastCode = '';
    let previousFrame = initial;
    let automaticStarted = false;
    card.addEventListener('click', event => {
      if (event.target.closest('button, input, select, summary')) automaticStarted = true;
    }, true);
    const frames = [initial, ...trace.steps];
    const lines = example.code.split('\n');
    const title = element('header', undefined, 'demo-heading');
    title.append(element('h5', example.title), element('span', 'Python · recorrido guiado', 'demo-badge'));
    const introduction = element('p', example.explanation, 'demo-introduction');
    card.append(title, introduction);

    const toolbar = element('div', undefined, 'demo-toolbar');
    toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Controles del ejemplo');
    function button(action, label, primary = false) {
      const control = element('button', label, primary ? 'primary' : '');
      control.type = 'button'; control.dataset.demoAction = action;
      toolbar.append(control); return control;
    }
    const play = button('play', 'Ver explicación', true);
    const backward = button('previous', 'Anterior');
    const forward = button('next', 'Paso siguiente');
    const restart = button('restart', 'Repetir');
    const finish = button('finish', 'Ver todo');
    const speedLabel = element('label', 'Velocidad', 'demo-speed');
    const speedSelect = element('select'); speedSelect.setAttribute('aria-label', 'Velocidad del ejemplo');
    for (const [value, label] of [[0.5, 'Lenta · 0,5×'], [1, 'Normal · 1×'], [2, 'Rápida · 2×']]) {
      const option = element('option', label); option.value = value; option.selected = value === 1; speedSelect.append(option);
    }
    speedLabel.append(speedSelect); toolbar.append(speedLabel); card.append(toolbar);

    const scene = element('div', undefined, 'demo-scene');
    const codePanel = element('section', undefined, 'demo-code-panel');
    codePanel.append(element('h6', 'Código'));
    const codeSurface = element('div', undefined, 'demo-code'); codeSurface.setAttribute('aria-hidden', 'true');
    const codeRows = lines.map((_, index) => {
      const row = element('div', undefined, 'demo-code-row');
      row.append(element('span', String(index + 1), 'demo-line-number'), element('code', '', 'demo-code-text'));
      codeSurface.append(row); return row;
    });
    codePanel.append(codeSurface);
    const statePanel = element('section', undefined, 'demo-state-panel');
    statePanel.append(element('h6', 'Variables y objetos'));
    const memory = element('div', undefined, 'demo-memory');
    const returned = element('div', undefined, 'demo-return'); returned.hidden = true;
    const aliases = element('div', undefined, 'demo-aliases');
    statePanel.append(memory, aliases, returned); scene.append(codePanel, statePanel); card.append(scene);
    const callstack = element('p', '', 'demo-stack'); callstack.setAttribute('aria-label', 'Recorrido de llamadas'); card.append(callstack);
    const narration = element('div', undefined, 'demo-narration');
    const position = element('strong', 'Preparando el ejemplo');
    const explanation = element('p', initial.explanation);
    narration.append(position, explanation); narration.setAttribute('role', 'status'); narration.setAttribute('aria-live', 'polite'); card.append(narration);
    const timelineLabel = element('label', 'Recorre la ejecución', 'demo-timeline');
    const timeline = element('input'); timeline.type = 'range'; timeline.min = 0; timeline.max = frames.length - 1; timeline.value = 0;
    timeline.setAttribute('aria-label', 'Paso de ejecución del ejemplo'); timelineLabel.append(timeline); card.append(timelineLabel);
    const evaluation = element('p', '', 'demo-evaluation'); evaluation.hidden = true; card.append(evaluation);
    const consolePanel = element('section', undefined, 'demo-console'); consolePanel.append(element('h6', 'Consola'));
    const stdout = element('pre', 'La salida aparecerá al ejecutar las instrucciones.'); consolePanel.append(stdout); card.append(consolePanel);
    const accessible = element('details', undefined, 'demo-static');
    accessible.append(element('summary', 'Leer el código completo sin animación'), element('pre', example.code)); card.append(accessible);
    const outcome = element('details', undefined, 'demo-static'); outcome.append(element('summary', 'Consultar la salida esperada'), element('pre', example.output)); card.append(outcome);
    const motionNote = element('p', 'Movimiento reducido: el código está completo y puedes recorrerlo con Paso siguiente.', 'demo-motion-note'); motionNote.hidden = !reduced; card.append(motionNote);

    function clearTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
    function updateButtons() {
      play.textContent = playing ? 'Pausar' : step === frames.length - 1 ? 'Volver a ver' : step || (typed > 0 && typed < example.code.length) ? 'Continuar' : 'Ver explicación';
      play.setAttribute('aria-pressed', String(playing));
      narration.setAttribute('aria-live', playing ? 'off' : 'polite');
      backward.disabled = step === 0;
      forward.disabled = step === frames.length - 1;
      card.dataset.playing = String(playing);
      card.dataset.phase = typed < example.code.length ? 'typing' : step === frames.length - 1 ? 'finished' : 'execution';
      card.dataset.step = String(step);
    }
    function paintCode() {
      const source = example.code.slice(0, typed);
      const visible = source.split('\n');
      if (source !== lastCode || !codeRows[0].dataset.painted) {
        codeRows.forEach((row, index) => {
          const text = visible[index] || '';
          if (row.dataset.source !== text || !row.dataset.painted) {
            row.lastElementChild.innerHTML = root.CodeGOEditor.highlightPython(text) || ' ';
            row.dataset.source = text; row.dataset.painted = 'true';
          }
          row.classList.toggle('typing', typed < example.code.length && index === visible.length - 1);
        });
        lastCode = source;
      }
      const frame = frames[step];
      codeRows.forEach((row, index) => row.classList.toggle('executing', typed === example.code.length && frame.line === index + 1));
    }
    function paintMemory(frame, animate) {
      const entries = Object.entries(frame.variables);
      if (!entries.length) { memory.replaceChildren(element('p', 'Aún no se ha guardado ningún valor.', 'demo-empty')); aliases.replaceChildren(); return; }
      memory.querySelector('.demo-empty')?.remove();
      const existing = new Map([...memory.children].map(node => [node.dataset.variable, node]));
      for (const [key, value] of entries) {
        let box = existing.get(key);
        const previous = previousFrame.variables[key];
        const changed = JSON.stringify(previous) !== JSON.stringify(value);
        if (!box) { box = element('div', undefined, 'demo-variable'); box.dataset.variable = key; memory.append(box); }
        if (changed || !box.childElementCount) {
          const header = element('div', undefined, 'demo-variable-name');
          header.append(element('strong', value.name), element('small', `${value.type} · ${value.scope}`));
          const content = element('code', value.text, 'demo-variable-value'); box.replaceChildren(header, content);
          if (value.cells?.length) {
            const cells = element('div', undefined, 'demo-cells');
            value.cells.forEach((cell, index) => {
              const item = element('span', cell, 'demo-cell');
              if (animate && previous?.cells?.[index] !== cell) item.classList.add('changed-cell');
              if (value.type === 'list' || value.type === 'tuple') item.dataset.index = index;
              cells.append(item);
            });
            box.append(cells);
          }
          if (value.ref) { const link = element('small', `↳ ${value.ref}`, 'demo-reference'); link.dataset.reference = value.ref; box.append(link); }
        }
        box.querySelector('.demo-value-change')?.remove();
        if (changed && previous && previous.text !== value.text) box.append(element('small', `Antes: ${previous.text} → Ahora: ${value.text}`, 'demo-value-change'));
        box.classList.remove('just-changed');
        if (animate && changed && !reduced) { void box.offsetWidth; box.classList.add('just-changed'); }
        existing.delete(key);
      }
      existing.forEach(box => box.remove());
      aliases.replaceChildren();
      const refs = new Map();
      for (const [,value] of entries) if (value.ref) { if (!refs.has(value.ref)) refs.set(value.ref, []); refs.get(value.ref).push(value.name); }
      for (const [ref,names] of refs) if (names.length > 1) aliases.append(element('p', `${names.join(' y ')} → ${ref} · comparten el mismo objeto`));
    }
    function paintFrame(animate = false) {
      const frame = frames[step];
      paintCode(); paintMemory(frame, animate);
      callstack.textContent = frame.stack.join(' → ');
      position.textContent = step ? `Paso ${step} de ${frames.length - 1} · Línea ${frame.line}` : 'Antes de ejecutar';
      explanation.textContent = frame.explanation;
      if (frame.error) explanation.textContent += ` ${frame.error}`;
      returned.hidden = !frame.returned;
      returned.textContent = frame.returned ? `Retorno → ${frame.returned.text}` : '';
      evaluation.hidden = !frame.evaluation;
      evaluation.textContent = frame.evaluation ? `${frame.evaluation.expression} → ${frame.evaluation.result} → ${frame.evaluation.target}` : '';
      const outputChanged = stdout.textContent !== frame.output;
      stdout.textContent = frame.output || 'La salida aparecerá al ejecutar las instrucciones.';
      consolePanel.classList.toggle('output-changed', animate && outputChanged && Boolean(frame.output) && !reduced);
      timeline.value = step;
      timeline.setAttribute('aria-valuetext', step ? `Paso ${step}: ${frame.explanation}` : 'Antes de ejecutar');
      previousFrame = frame;
      updateButtons();
    }
    function pause() { playing = false; clearTimer(); updateButtons(); }
    function schedule(delay) { clearTimer(); if (playing && !destroyed) timer = setTimeout(tick, delay / speed); }
    function tick() {
      timer = null;
      if (!playing || destroyed || !card.isConnected) return pause();
      if (typed < example.code.length) {
        typed = Math.min(example.code.length, typed + Math.max(1, Math.ceil(example.code.length / 180)));
        paintCode(); updateButtons();
        schedule(typed === example.code.length ? 850 : 28);
      } else if (step < frames.length - 1) {
        step++; paintFrame(true);
        if (step === frames.length - 1) pause(); else schedule(1700);
      } else pause();
    }
    function start() {
      onStart();
      if (step === frames.length - 1) { step = 0; typed = reduced ? example.code.length : 0; paintFrame(); }
      playing = true; updateButtons(); schedule(40);
    }
    play.onclick = () => playing ? pause() : start();
    backward.onclick = () => { pause(); typed = example.code.length; step = Math.max(0, step - 1); paintFrame(true); };
    forward.onclick = () => { pause(); typed = example.code.length; step = Math.min(frames.length - 1, step + 1); paintFrame(true); };
    restart.onclick = () => { pause(); step = 0; typed = reduced ? example.code.length : 0; paintFrame(); start(); };
    finish.onclick = () => { pause(); typed = example.code.length; step = frames.length - 1; paintFrame(); };
    timeline.oninput = () => { automaticStarted = true; pause(); typed = example.code.length; step = Number(timeline.value); paintFrame(); };
    speedSelect.onchange = () => { automaticStarted = true; speed = Number(speedSelect.value); if (playing) schedule(40); };
    function visibilityChanged() { if (document.hidden) pause(); }
    function motionChanged(event) { reduced = event.matches; motionNote.hidden = !reduced; if (reduced) { pause(); typed = example.code.length; paintFrame(); } }
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('blur', pause);
    motion.addEventListener('change', motionChanged);
    let observer;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {
        if (destroyed) return;
        const visible = entries[0].isIntersecting;
        if (!visible) pause();
        else if (autoplay && !automaticStarted && !reduced && !document.hidden) { automaticStarted = true; start(); }
      }, { threshold: 0.15 });
      observer.observe(card);
    }
    paintFrame();
    return {
      element: card, pause,
      destroy() { destroyed = true; pause(); observer?.disconnect(); document.removeEventListener('visibilitychange', visibilityChanged); window.removeEventListener('blur', pause); motion.removeEventListener('change', motionChanged); }
    };
  };
})(globalThis);
