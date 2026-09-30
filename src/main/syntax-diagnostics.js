const { spawn } = require('node:child_process');

const PYTHON_AST_CHECK = [
  'import ast,json,sys',
  'source=sys.stdin.read()',
  'try:',
  ' ast.parse(source, filename=sys.argv[1] if len(sys.argv)>1 else "archivo.py")',
  ' print(json.dumps({"success":True}))',
  'except SyntaxError as e:',
  ' print(json.dumps({"success":False,"message":e.msg,"line":e.lineno,"column":e.offset,"endLine":getattr(e,"end_lineno",None),"endColumn":getattr(e,"end_offset",None)}))'
].join('\n');

function explainSyntaxMessage(message = '') {
  const rules = [
    [/expected ':'/i, ['Faltan dos puntos', 'Agrega : al final de la instrucción.']],
    [/expected an indented block/i, ['Falta indentar el bloque', 'La línea siguiente debe comenzar con 4 espacios.']],
    [/unexpected indent/i, ['La línea tiene sangría de más', 'Alinéala con el bloque al que pertenece.']],
    [/unindent does not match|inconsistent use of tabs and spaces/i, ['La sangría no coincide', 'Usa únicamente grupos de 4 espacios.']],
    [/was never closed|unmatched/i, ['Falta cerrar un símbolo', 'Comprueba paréntesis, corchetes y llaves en esta línea y la anterior.']],
    [/unterminated string|EOL while scanning string/i, ['La cadena quedó abierta', 'Agrega la comilla de cierre correspondiente.']],
    [/invalid syntax/i, ['Python no reconoce esta instrucción', 'Revisa palabras reservadas, dos puntos y la línea anterior.']],
    [/cannot assign/i, ['El destino de la asignación no es válido', 'Coloca una variable válida a la izquierda del signo =.']]
  ];
  const match = rules.find(([pattern]) => pattern.test(message));
  return match ? { title: match[1][0], hint: match[1][1] } : { title: 'Revisa la sintaxis', hint: message || 'Python no pudo interpretar esta parte del código.' };
}

function diagnosePython(command, source, filename = 'archivo.py', { timeoutMs = 2500 } = {}) {
  if (typeof source !== 'string' || source.length > 2_000_000) return Promise.resolve({ success: false, unavailable: true, message: 'El archivo es demasiado grande para el diagnóstico inmediato.' });
  return new Promise(resolve => {
    let output = '';
    let errorOutput = '';
    let settled = false;
    const child = spawn(command, ['-I', '-c', PYTHON_AST_CHECK, filename], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      finish({ success: false, unavailable: true, message: 'El diagnóstico tardó demasiado.' });
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errorOutput += chunk; });
    child.on('error', error => finish({ success: false, unavailable: true, message: error.message }));
    child.on('close', () => {
      try {
        const result = JSON.parse(output.trim());
        if (!result.success) Object.assign(result, explainSyntaxMessage(result.message));
        finish(result);
      } catch (_) {
        finish({ success: false, unavailable: true, message: errorOutput.trim() || 'No se pudo comprobar la sintaxis.' });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(source, 'utf8');
  });
}

module.exports = { diagnosePython, explainSyntaxMessage };
