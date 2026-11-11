/* Reference examples only: this player never executes or rewrites the student's code. */
(function (root) {
  'use strict';
  root.createCodeGOErrorCoach = function ({ code, hint = 'Fíjate en los nombres, los signos y la sangría. Después prueba la idea en tu programa.' }) {
    const element = document.createElement('section'); element.className = 'error-coach';
    const label = document.createElement('strong'); label.textContent = 'Vamos paso a paso';
    const description = document.createElement('p'); description.textContent = 'Ejemplo de referencia · adapta la idea a tu código.';
    const pre = document.createElement('pre'); pre.setAttribute('aria-label', 'Código del ejemplo');
    const note = document.createElement('p'); note.className = 'coach-hint'; note.textContent = hint;
    const controls = document.createElement('div'); controls.className = 'coach-controls';
    const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Ver cómo se escribe';
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Siguiente línea';
    const all = document.createElement('button'); all.type = 'button'; all.textContent = 'Ver completo';
    controls.append(play, next, all); element.append(label, description, pre, controls, note);
    code = String(code || '').slice(0, 12000);
    let cursor = 0, timer = null, destroyed = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function paint() { pre.textContent = code.slice(0, cursor); play.textContent = timer ? 'Pausar' : cursor >= code.length ? 'Repetir ejemplo' : 'Ver cómo se escribe'; }
    function pause() { clearInterval(timer); timer = null; paint(); }
    function finish() { pause(); cursor = code.length; paint(); }
    function tick() { if (destroyed || document.hidden || !element.isConnected || !element.checkVisibility()) return pause(); cursor = Math.min(code.length, cursor + 2); paint(); if (cursor === code.length) pause(); }
    play.onclick = () => { if (timer) return pause(); if (cursor >= code.length) cursor = 0; if (reduced.matches) return finish(); timer = setInterval(tick, 24); paint(); };
    next.onclick = () => { pause(); const end = code.indexOf('\n', cursor); cursor = end === -1 ? code.length : end + 1; paint(); };
    all.onclick = finish;
    const onHidden = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onHidden); window.addEventListener('blur', pause); reduced.addEventListener('change', finish);
    if (reduced.matches) finish(); else { cursor = Math.min(code.length, code.indexOf('\n') + 1 || code.length); paint(); }
    return { element, pause, destroy() { destroyed = true; pause(); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('blur', pause); reduced.removeEventListener('change', finish); } };
  };
})(globalThis);
