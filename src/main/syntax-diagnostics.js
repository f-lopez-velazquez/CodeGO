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
    [/expected ':'/i, {
      title: 'Faltan dos puntos',
      hint: 'Agrega : al final de la instrucción que abre el bloque.',
      actions: ['Ve al final de la línea marcada.', 'Agrega : después de la condición o encabezado.', 'Comprueba que la línea siguiente tenga 4 espacios.'],
      example: 'if edad >= 18:\n    print("Mayor de edad")'
    }],
    [/expected an indented block/i, {
      title: 'Falta indentar el bloque',
      hint: 'La primera instrucción del bloque debe comenzar con 4 espacios.',
      actions: ['Coloca el cursor al inicio de la línea marcada.', 'Pulsa Tab una vez para agregar 4 espacios.', 'Mantén alineadas las instrucciones que pertenecen al mismo bloque.'],
      example: 'for numero in range(3):\n    print(numero)'
    }],
    [/unexpected indent/i, {
      title: 'La línea tiene sangría de más',
      hint: 'Esta línea está más adentro que el bloque que Python esperaba.',
      actions: ['Selecciona la línea marcada.', 'Pulsa Mayús+Tab para quitar un nivel.', 'Alinéala con las instrucciones del mismo bloque.'],
      example: 'nombre = "Ana"\nprint(nombre)'
    }],
    [/unindent does not match|inconsistent use of tabs and spaces/i, {
      title: 'La sangría no coincide',
      hint: 'Hay tabuladores mezclados con espacios o un nivel incompleto.',
      actions: ['Selecciona las líneas del bloque.', 'Pulsa Mayús+Tab hasta alinearlas y después Tab para aplicar niveles de 4 espacios.', 'Evita combinar la tecla Tab del sistema con espacios pegados desde otro editor.'],
      example: 'if activo:\n    print("Listo")\n    guardar()'
    }],
    [/was never closed|unmatched|closing parenthesis .* does not match/i, {
      title: 'Falta cerrar un símbolo',
      hint: 'Un paréntesis, corchete o llave quedó abierto o se cerró con otro símbolo.',
      actions: ['Revisa el símbolo señalado y la línea anterior.', 'Cuenta cada apertura y su cierre correspondiente.', 'Coloca el cursor junto al símbolo: codeGO completa el par automáticamente.'],
      example: 'datos = [1, 2, 3]\nprint(datos)'
    }],
    [/unterminated string|EOL while scanning string/i, {
      title: 'La cadena quedó abierta',
      hint: 'Un texto empezó con comillas, pero no tiene el cierre correspondiente.',
      actions: ['Busca la primera comilla de la línea marcada.', 'Agrega la misma comilla al final del texto.', 'Si el texto contiene comillas, usa el otro tipo o antepón una barra invertida.'],
      example: 'mensaje = "Hola, mundo"\nprint(mensaje)'
    }],
    [/perhaps you forgot a comma|invalid syntax.*comma/i, {
      title: 'Puede faltar una coma',
      hint: 'Python encontró dos valores seguidos donde esperaba una separación.',
      actions: ['Revisa los argumentos o elementos de la línea marcada.', 'Agrega una coma entre cada valor.', 'Comprueba también que los paréntesis estén completos.'],
      example: 'print("Nombre:", nombre)'
    }],
    [/maybe you meant '=='|cannot assign to expression/i, {
      title: 'Usa == para comparar',
      hint: 'El signo = asigna un valor; una condición normalmente necesita ==.',
      actions: ['Si estás comparando dos valores, cambia = por ==.', 'Si estás asignando, deja una variable válida a la izquierda.', 'Vuelve a leer la condición completa antes de ejecutar.'],
      example: 'if respuesta == "sí":\n    print("Continuar")'
    }],
    [/cannot assign/i, {
      title: 'La asignación no es válida',
      hint: 'A la izquierda de = debe haber una variable o posición que pueda recibir el valor.',
      actions: ['Mueve el nombre de la variable a la izquierda de =.', 'Usa == si tu intención era comparar.', 'Evita asignar directamente al resultado de una función.'],
      example: 'resultado = calcular()'
    }],
    [/invalid decimal literal/i, {
      title: 'El nombre o número no es válido',
      hint: 'Una variable no puede comenzar con número ni un número contener letras sin separación.',
      actions: ['Haz que el nombre comience con una letra o _.', 'Separa el número de cualquier palabra u operador.', 'Usa nombres como alumno1 en lugar de 1alumno.'],
      example: 'alumno1 = "Ana"'
    }],
    [/invalid character/i, {
      title: 'Hay un carácter no válido',
      hint: 'La línea contiene un símbolo tipográfico que Python no reconoce como código.',
      actions: ['Borra y vuelve a escribir el símbolo señalado.', 'Cambia comillas curvas por comillas rectas.', 'Cambia guiones largos por el signo - del teclado.'],
      example: 'mensaje = "Texto con comillas rectas"'
    }],
    [/invalid syntax/i, {
      title: 'Python no reconoce esta instrucción',
      hint: 'Hay una palabra mal escrita o falta un separador cerca de la marca ^.',
      actions: ['Revisa la palabra situada sobre la marca ^.', 'Comprueba también la línea anterior: puede tener un cierre pendiente.', 'Verifica import, if, for, while, def y los dos puntos finales.'],
      example: 'import pygame\n\nif condicion:\n    print("Listo")'
    }]
  ];
  const match = rules.find(([pattern]) => pattern.test(message));
  return match
    ? { ...match[1] }
    : {
        title: 'Revisa la sintaxis',
        hint: message || 'Python no pudo interpretar esta parte del código.',
        actions: ['Revisa la línea marcada y la inmediatamente anterior.', 'Corrige una sola causa y vuelve a comprobar.', 'Usa F8 para regresar a la ubicación del problema.'],
        example: ''
      };
}

function diagnosePython(command, source, filename = 'archivo.py', { timeoutMs = 5000 } = {}) {
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
        if (!result.success) {
          Object.assign(result, explainSyntaxMessage(result.message));
          result.sourceLine = source.split(/\r?\n/)[Math.max(0, (Number(result.line) || 1) - 1)] || '';
        }
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
