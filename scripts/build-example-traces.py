"""Generate bounded, deterministic teaching traces from trusted bundled examples.

No student code is processed here. Animation data is generated at build time so
lessons can explain Python offline without starting another browser interpreter.
"""
import ast
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types

ROOT = Path(__file__).resolve().parent.parent
MAX_STEPS = 180


def trace_example(example, key):
    code = example['code']
    filename = f'<codego-example:{key}>'
    tree = ast.parse(code, filename=filename)
    statements = {}
    for item in ast.walk(tree):
        if isinstance(item, ast.stmt):
            prior = statements.get(item.lineno)
            if prior is None or item.col_offset > prior.col_offset:
                statements[item.lineno] = item
    output = io.StringIO()
    scope = {'__name__': '__main__'}
    pending = {}
    object_ids = {}
    retained_objects = []
    frames = []
    previous_variables = {}
    previous_output = ''

    def reference(value):
        address = id(value)
        if address not in object_ids:
            object_ids[address] = f'objeto {len(object_ids) + 1}'
            retained_objects.append(value)
        return object_ids[address]

    def value_info(value, depth=0):
        kind = type(value).__name__
        if isinstance(value, types.ModuleType):
            return {'type': 'módulo', 'text': value.__name__}
        if isinstance(value, types.FunctionType):
            return {'type': 'función', 'text': value.__name__ + '()'}
        if isinstance(value, type):
            return {'type': 'clase', 'text': value.__name__}
        if value is None or isinstance(value, (str, bool, int, float)):
            return {'type': kind, 'text': repr(value)[:240]}
        if isinstance(value, io.IOBase):
            return {'type': 'archivo' if hasattr(value, 'name') else 'flujo de texto', 'text': 'cerrado' if value.closed else 'abierto', 'ref': reference(value)}
        if depth > 2:
            return {'type': kind, 'text': f'<{kind}>'}
        if isinstance(value, (list, tuple, set, frozenset)):
            entries = list(value)
            if isinstance(value, (set, frozenset)):
                entries.sort(key=repr)
            cells = [value_info(v, depth + 1)['text'] for v in entries[:12]]
            text = repr(value)
            if isinstance(value, (set, frozenset)):
                text = '{' + ', '.join(repr(item) for item in entries) + '}' if entries else 'set()'
                if isinstance(value, frozenset): text = f'frozenset({text})'
            result = {'type': kind, 'text': text[:240], 'cells': cells, 'length': len(entries)}
            if isinstance(value, (list, set)):
                result['ref'] = reference(value)
            return result
        if isinstance(value, dict):
            entries = list(value.items())
            return {'type': 'dict', 'text': repr(value)[:240], 'ref': reference(value),
                    'cells': [f'{repr(k)}: {value_info(v, depth + 1)["text"]}' for k, v in entries[:12]], 'length': len(entries)}
        if hasattr(value, '__dict__') and not isinstance(value, types.ModuleType):
            attrs = {name: value_info(v, depth + 1)['text'] for name, v in vars(value).items() if not name.startswith('_')}
            return {'type': kind, 'text': kind, 'ref': reference(value), 'cells': [f'{k} = {v}' for k, v in attrs.items()]}
        return {'type': kind, 'text': 'flujo de texto' if isinstance(value, io.IOBase) else f'<{kind}>'}

    def label(frame):
        name = frame.f_code.co_name
        return {'<module>': 'archivo', '<listcomp>': 'comprensión', '<dictcomp>': 'comprensión', '<setcomp>': 'comprensión', '__init__': '__init__'}.get(name, name)

    def variables(frame):
        result = {}
        for name, value in frame.f_globals.items():
            if not name.startswith('_') and not isinstance(value, types.ModuleType):
                result['global:' + name] = {'name': name, 'scope': 'archivo', **value_info(value)}
        if frame.f_locals is not frame.f_globals:
            for name, value in frame.f_locals.items():
                if name.startswith('.') or name.startswith('_'):
                    continue
                result[f'local:{frame.f_code.co_name}:{name}'] = {'name': name, 'scope': label(frame), **value_info(value)}
        return dict(list(result.items())[:16])

    def source(item):
        return ast.get_source_segment(code, item) or ''

    def description(line, values, next_line=None, returned=None, event='line'):
        item = statements.get(line)
        if event == 'call':
            return 'Entramos en este bloque. Los parámetros reciben los argumentos de la llamada.'
        if event == 'exception':
            return 'Esta operación produce una excepción. Observa cómo el bloque except decide qué hacer.'
        if isinstance(item, (ast.Assign, ast.AnnAssign)):
            targets = item.targets if isinstance(item, ast.Assign) else [item.target]
            names = ', '.join(source(target) for target in targets)
            return f'Se calcula la expresión de la derecha y se asigna su resultado a {names}.'
        if isinstance(item, ast.AugAssign):
            return f'Actualizamos {source(item.target)} usando el valor que ya tenía. Compara el estado anterior y el nuevo.'
        if isinstance(item, (ast.For, ast.While)):
            inside = next_line is not None and any(node.lineno <= next_line <= getattr(node, 'end_lineno', node.lineno) for node in item.body)
            if isinstance(item, ast.For):
                return f'Hay otro elemento: se guarda en {source(item.target)} y entramos al cuerpo del bucle.' if inside else 'No quedan elementos por recorrer. El programa continúa después del bucle.'
            return f'La condición {source(item.test)} es verdadera: repetimos el cuerpo.' if inside else f'La condición {source(item.test)} ya es falsa: el bucle termina.'
        if isinstance(item, ast.If):
            inside = next_line is not None and any(node.lineno <= next_line <= getattr(node, 'end_lineno', node.lineno) for node in item.body)
            return f'La condición {source(item.test)} es {"verdadera: seguimos esta rama" if inside else "falsa: buscamos la alternativa o continuamos"}.'
        if isinstance(item, ast.FunctionDef):
            return f'Definimos {item.name}(). Su cuerpo se ejecutará cuando se llame a la función.'
        if isinstance(item, ast.ClassDef):
            return f'Preparamos la clase {item.name}, que describe los datos y métodos de sus objetos.'
        if isinstance(item, ast.Return) or event == 'return':
            return f'La función devuelve {value_info(returned)["text"]} al punto donde fue llamada.'
        if isinstance(item, ast.Expr) and isinstance(item.value, ast.Call):
            call = source(item.value.func)
            if call == 'print':
                return 'print() toma el resultado de sus argumentos y lo agrega a la consola.'
            if isinstance(item.value.func, ast.Attribute) and item.value.func.attr in ('append', 'subir', 'agregar'):
                return f'{call}() modifica el objeto. Los nombres que comparten su referencia observan el mismo cambio.'
            return f'Ejecutamos {call}(). Observa su efecto antes de avanzar.'
        if isinstance(item, ast.Try):
            return 'Entramos en try. Si una operación falla, se buscará un except compatible.'
        if isinstance(item, ast.With):
            return 'Abrimos el recurso con with; se cerrará automáticamente al salir de este bloque.'
        if isinstance(item, (ast.Import, ast.ImportFrom)):
            return 'Importamos una herramienta para poder usarla en las siguientes instrucciones.'
        if isinstance(item, ast.Break):
            return 'break termina el bucle actual; no se ejecutan más vueltas.'
        return 'Sigue la instrucción resaltada y compara las variables y la consola.'

    def record(frame, line, kind='line', next_line=None, returned=None, error=None):
        nonlocal previous_variables, previous_output
        if len(frames) >= MAX_STEPS:
            raise RuntimeError(f'Example exceeds teaching trace budget: {key}')
        values = variables(frame)
        changed = [name for name, value in values.items() if value != previous_variables.get(name)]
        removed = [name for name in previous_variables if name not in values]
        stack = []
        parent = frame
        while parent:
            if parent.f_code.co_filename == filename:
                stack.append(label(parent))
            parent = parent.f_back
        step = {'line': line, 'kind': kind, 'scope': label(frame),
                'stack': list(reversed(stack)), 'variables': values, 'changed': changed, 'removed': removed,
                'output': output.getvalue(), 'explanation': description(line, values, next_line, returned, kind)}
        step['outputAdded'] = step['output'][len(previous_output):]
        previous_output = step['output']
        item = statements.get(line)
        target = item.targets[0] if isinstance(item, ast.Assign) and len(item.targets) == 1 else item.target if isinstance(item, (ast.AnnAssign, ast.AugAssign)) else None
        if isinstance(target, ast.Name):
            candidates = [value for value in values.values() if value['name'] == target.id]
            if candidates:
                expression = source(item) if isinstance(item, ast.AugAssign) else source(item.value)
                step['evaluation'] = {'expression': expression, 'target': target.id, 'result': candidates[-1]['text']}
        if kind == 'return':
            step['returned'] = value_info(returned)
        if error:
            step['error'] = error
        frames.append(step)
        previous_variables = values

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != filename:
            return None
        identity = id(frame)
        if event == 'call' and frame.f_code.co_name != '<module>':
            declaration = statements.get(frame.f_code.co_firstlineno)
            record(frame, frame.f_lineno, 'block' if isinstance(declaration, ast.ClassDef) else 'call')
        elif event == 'line':
            if identity in pending:
                record(frame, pending[identity], next_line=frame.f_lineno)
            pending[identity] = frame.f_lineno
        elif event == 'exception':
            error_type, value, _ = arg
            record(frame, frame.f_lineno, 'exception', error=f'{error_type.__name__}: {value}')
        elif event == 'return':
            line = pending.pop(identity, None)
            if line:
                declaration = statements.get(frame.f_code.co_firstlineno)
                kind = 'line' if frame.f_code.co_name == '<module>' else 'class-ready' if isinstance(declaration, ast.ClassDef) else 'return'
                record(frame, line, kind, returned=arg)
        return tracer

    with contextlib.redirect_stdout(output):
        sys.settrace(tracer)
        try:
            exec(compile(tree, filename, 'exec'), scope)
        finally:
            sys.settrace(None)
    actual = output.getvalue().strip()
    if actual != example['output'].strip():
        raise AssertionError(f'{key}: expected {example["output"]!r}, got {actual!r}')
    return {'sourceHash': hashlib.sha256(code.encode()).hexdigest(), 'steps': frames, 'output': actual}


def main():
    raw = subprocess.check_output(['node', '-e', 'process.stdout.write(JSON.stringify(require("./webapp/course-content")))'], cwd=ROOT)
    content = json.loads(raw)
    traces = {}
    original_cwd = os.getcwd()
    with tempfile.TemporaryDirectory(prefix='codego-teaching-') as directory:
        os.chdir(directory)
        try:
            for lesson in content['lessons']:
                for index, example in enumerate(lesson['examples']):
                    key = f'{lesson["id"]}:{index}'
                    traces[key] = trace_example(example, key)
        finally:
            os.chdir(original_cwd)
    result = {'schema': 1, 'examples': traces}
    target = ROOT / 'webapp' / 'example-traces.js'
    target.write_text('/* Generated from real Python execution by scripts/build-example-traces.py. */\n'
                      '(function(root){ const traces = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n'
                      'if (typeof module !== "undefined" && module.exports) module.exports = traces; else root.CodeGOExampleTraces = traces;\n})(globalThis);\n', encoding='utf-8')
    print(f'{len(traces)} examples, {sum(len(trace["steps"]) for trace in traces.values())} Python steps; {target.stat().st_size / 1024:.0f} KB.')


if __name__ == '__main__':
    main()
