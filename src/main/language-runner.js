const { spawn, execSync, spawnSync, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * Mapeo de extensiones de archivo a lenguajes soportados.
 */
const EXTENSION_MAP = {
  '.py': 'python',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.java': 'java',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.r': 'r',
  '.R': 'r'
};

/**
 * Metadatos de cada lenguaje soportado académicamente.
 */
const LANGUAGE_DEFS = {
  python: {
    id: 'python',
    name: 'Python',
    icon: '🐍',
    extensions: ['.py'],
    defaultFile: 'main.py',
    compiled: false,
    starterCode: '# Programa en Python 3\nnombre = input("¿Cómo te llamas? ")\nprint(f"¡Hola, {nombre}! Bienvenido a CodeGO.")\n'
  },
  c: {
    id: 'c',
    name: 'C',
    icon: '⚙️',
    extensions: ['.c', '.h'],
    defaultFile: 'main.c',
    compiled: true,
    starterCode: '#include <stdio.h>\n\nint main() {\n    char nombre[100];\n    printf("¿Cómo te llamas? ");\n    if (fgets(nombre, sizeof(nombre), stdin) != NULL) {\n        printf("¡Hola, %s! Bienvenido a CodeGO en C.\\n", nombre);\n    }\n    return 0;\n}\n'
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    icon: '⚙️',
    extensions: ['.cpp', '.hpp', '.cc'],
    defaultFile: 'main.cpp',
    compiled: true,
    starterCode: '#include <iostream>\n#include <string>\n\nint main() {\n    std::string nombre;\n    std::cout << "¿Cómo te llamas? ";\n    std::getline(std::cin, nombre);\n    std::cout << "¡Hola, " << nombre << "! Bienvenido a CodeGO en C++." << std::endl;\n    return 0;\n}\n'
  },
  java: {
    id: 'java',
    name: 'Java',
    icon: '☕',
    extensions: ['.java'],
    defaultFile: 'Main.java',
    compiled: true,
    starterCode: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print("¿Cómo te llamas? ");\n        String nombre = scanner.nextLine();\n        System.out.println("¡Hola, " + nombre + "! Bienvenido a CodeGO en Java.");\n    }\n}\n'
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    icon: '🟨',
    extensions: ['.js', '.mjs'],
    defaultFile: 'index.js',
    compiled: false,
    starterCode: 'const readline = require("readline");\n\nconst rl = readline.createInterface({\n  input: process.stdin,\n  output: process.stdout\n});\n\nrl.question("¿Cómo te llamas? ", (nombre) => {\n  console.log(`¡Hola, ${nombre}! Bienvenido a CodeGO en JavaScript.`);\n  rl.close();\n});\n'
  },
  r: {
    id: 'r',
    name: 'R (Estadística)',
    icon: '📊',
    extensions: ['.r', '.R'],
    defaultFile: 'script.R',
    compiled: false,
    starterCode: '# Análisis Estadístico en R\ncat("¿Cómo te llamas? ")\nnombre <- readLines(file("stdin"), n = 1)\ncat(paste0("¡Hola, ", nombre, "! Bienvenido a CodeGO en R.\\n"))\n'
  }
};

/**
 * Detecta el lenguaje de un archivo por su extensión.
 */
function detectLanguage(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'python';
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || 'python';
}

/**
 * Localiza los binarios de ejecución y compilación disponibles en el sistema.
 */
function detectToolchains() {
  const isWin = process.platform === 'win32';
  const whichCmd = isWin ? 'where' : 'which';

  function findExecutable(names) {
    for (const name of names) {
      try {
        const out = execSync(`${whichCmd} ${name}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 1000
        }).trim().split(/\r?\n/)[0];
        if (out && fs.existsSync(out)) return out;
      } catch (_) {}
    }
    return null;
  }

  const toolchains = {
    python: {
      installed: false,
      command: findExecutable(['python3', 'python', 'py']),
      version: ''
    },
    c: {
      installed: false,
      compiler: findExecutable(['gcc', 'clang']),
      version: ''
    },
    cpp: {
      installed: false,
      compiler: findExecutable(['g++', 'clang++', 'gcc']),
      version: ''
    },
    java: {
      installed: false,
      compiler: findExecutable(['javac']),
      runner: findExecutable(['java']),
      version: ''
    },
    javascript: {
      installed: false,
      runner: findExecutable(['node']),
      version: ''
    },
    r: {
      installed: false,
      runner: findExecutable(['Rscript', 'R']),
      version: ''
    }
  };

  // Extraer versiones rápidas
  if (toolchains.python.command) {
    try {
      const v = execSync(`"${toolchains.python.command}" --version`, { encoding: 'utf8', timeout: 1500 }).trim();
      toolchains.python.installed = true;
      toolchains.python.version = v;
    } catch (_) {}
  }

  if (toolchains.c.compiler) {
    try {
      const v = execSync(`"${toolchains.c.compiler}" --version`, { encoding: 'utf8', timeout: 1500 }).split('\n')[0].trim();
      toolchains.c.installed = true;
      toolchains.c.version = v;
    } catch (_) {}
  }

  if (toolchains.cpp.compiler) {
    try {
      const v = execSync(`"${toolchains.cpp.compiler}" --version`, { encoding: 'utf8', timeout: 1500 }).split('\n')[0].trim();
      toolchains.cpp.installed = true;
      toolchains.cpp.version = v;
    } catch (_) {}
  }

  if (toolchains.java.compiler && toolchains.java.runner) {
    try {
      const v = execSync(`"${toolchains.java.runner}" -version 2>&1`, { encoding: 'utf8', timeout: 1500 }).split('\n')[0].trim();
      toolchains.java.installed = true;
      toolchains.java.version = v;
    } catch (_) {}
  }

  if (toolchains.javascript.runner) {
    try {
      const v = execSync(`"${toolchains.javascript.runner}" --version`, { encoding: 'utf8', timeout: 1500 }).trim();
      toolchains.javascript.installed = true;
      toolchains.javascript.version = `Node.js ${v}`;
    } catch (_) {}
  }

  if (toolchains.r.runner) {
    try {
      const v = execSync(`"${toolchains.r.runner}" --version 2>&1`, { encoding: 'utf8', timeout: 1500 }).trim();
      toolchains.r.installed = true;
      toolchains.r.version = v.split('\n')[0];
    } catch (_) {}
  }

  return toolchains;
}

/**
 * Runner políglota para Python, C, C++, Java, JavaScript y R.
 */
class MultiLanguageRunner {
  constructor({ send, onProcess = () => {} }) {
    this.send = send;
    this.onProcess = onProcess;
    this.child = null;
    this.activeLanguage = null;
    this.compiledBinary = null;
  }

  run({ language, filePath, customCommand } = {}) {
    if (this.child) {
      return { success: false, error: 'Ya hay un proceso en ejecución. Detén la ejecución actual antes de iniciar otra.' };
    }

    const lang = language || detectLanguage(filePath);
    this.activeLanguage = lang;
    const started = Date.now();
    const workingDir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    // 1. Compilación para lenguajes compilados (C, C++, Java)
    if (lang === 'c' || lang === 'cpp') {
      const isCpp = lang === 'cpp';
      const compiler = customCommand || (isCpp ? (process.platform === 'win32' ? 'g++.exe' : 'g++') : (process.platform === 'win32' ? 'gcc.exe' : 'gcc'));
      const binaryName = path.basename(filePath, path.extname(filePath)) + (process.platform === 'win32' ? '.exe' : '.bin');
      const binaryPath = path.join(workingDir, binaryName);
      this.compiledBinary = binaryPath;

      this.emitOutput('stdout', `[Compilando ${isCpp ? 'C++' : 'C'} con ${compiler}...]\\n`);

      const compileArgs = ['-O2', '-Wall', filePath, '-o', binaryPath];
      // Añadir soporte estándar C++ moderno o math library en C
      if (isCpp) compileArgs.push('-std=c++17');
      else compileArgs.push('-lm');

      const compileProc = spawnSync(compiler, compileArgs, {
        cwd: workingDir,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 25000
      });

      if (compileProc.stdout) this.emitOutput('stdout', compileProc.stdout);
      if (compileProc.stderr) this.emitOutput('stderr', compileProc.stderr);

      if (compileProc.status !== 0) {
        this.emitFinished({ exitCode: compileProc.status || 1, duration: Number(((Date.now() - started) / 1000).toFixed(2)) });
        return { success: false, error: `Error de compilación en ${isCpp ? 'C++' : 'C'}.` };
      }

      this.emitOutput('stdout', `[Compilación exitosa. Ejecutando...]\\n\\n`);

      // Lanzar ejecutable compilado
      try {
        const child = spawn(binaryPath, [], {
          cwd: workingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true
        });
        return this.attachChild(child, started);
      } catch (err) {
        this.emitOutput('stderr', `No se pudo ejecutar el binario: ${err.message}\\n`);
        this.emitFinished({ exitCode: 1, duration: 0 });
        return { success: false, error: err.message };
      }
    }

    if (lang === 'java') {
      const javac = 'javac';
      const java = 'java';
      const className = path.basename(filePath, '.java');

      this.emitOutput('stdout', `[Compilando Java con javac...]\\n`);
      const compileProc = spawnSync(javac, ['-encoding', 'UTF-8', filePath], {
        cwd: workingDir,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 25000
      });

      if (compileProc.stdout) this.emitOutput('stdout', compileProc.stdout);
      if (compileProc.stderr) this.emitOutput('stderr', compileProc.stderr);

      if (compileProc.status !== 0) {
        this.emitFinished({ exitCode: compileProc.status || 1, duration: Number(((Date.now() - started) / 1000).toFixed(2)) });
        return { success: false, error: 'Error de compilación en Java.' };
      }

      this.emitOutput('stdout', `[Compilación Java exitosa. Ejecutando ${className}...]\\n\\n`);

      try {
        const child = spawn(java, ['-Dfile.encoding=UTF-8', className], {
          cwd: workingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true
        });
        return this.attachChild(child, started);
      } catch (err) {
        this.emitOutput('stderr', `No se pudo ejecutar Java: ${err.message}\\n`);
        this.emitFinished({ exitCode: 1, duration: 0 });
        return { success: false, error: err.message };
      }
    }

    if (lang === 'javascript') {
      const nodeCmd = customCommand || 'node';
      try {
        const child = spawn(nodeCmd, [filePath], {
          cwd: workingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true
        });
        return this.attachChild(child, started);
      } catch (err) {
        this.emitOutput('stderr', `No se pudo iniciar Node.js: ${err.message}\\n`);
        this.emitFinished({ exitCode: 1, duration: 0 });
        return { success: false, error: err.message };
      }
    }

    if (lang === 'r') {
      const rCmd = customCommand || (process.platform === 'win32' ? 'Rscript.exe' : 'Rscript');
      try {
        const child = spawn(rCmd, ['--vanilla', filePath], {
          cwd: workingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true
        });
        return this.attachChild(child, started);
      } catch (err) {
        this.emitOutput('stderr', `No se pudo iniciar R: ${err.message}\\n`);
        this.emitFinished({ exitCode: 1, duration: 0 });
        return { success: false, error: err.message };
      }
    }

    // Default: Python
    const pyCmd = customCommand || (process.platform === 'win32' ? 'python' : 'python3');
    try {
      const environment = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
      delete environment.CODEGO_TEACHER_PIN;
      const child = spawn(pyCmd, ['-u', filePath], {
        cwd: workingDir,
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true
      });
      return this.attachChild(child, started);
    } catch (err) {
      this.emitOutput('stderr', `No se pudo iniciar Python: ${err.message}\\n`);
      this.emitFinished({ exitCode: 1, duration: 0 });
      return { success: false, error: err.message };
    }
  }

  attachChild(child, started) {
    this.child = child;
    this.onProcess(child);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', chunk => this.emitOutput('stdout', chunk));
    child.stderr.on('data', chunk => this.emitOutput('stderr', chunk));

    child.stdin.on('error', () => {});
    child.on('error', error => {
      this.emitOutput('stderr', `Error en proceso: ${error.message}\\n`);
    });

    child.once('close', (exitCode, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.onProcess(null);
      this.emitFinished({
        exitCode,
        signal,
        duration: Number(((Date.now() - started) / 1000).toFixed(2))
      });
    });

    return { success: true };
  }

  emitOutput(type, data) {
    // Emitir en el canal general de código y en python:* para compatibilidad
    this.send(`code:${type}`, data);
    if (this.activeLanguage === 'python') {
      this.send(`python:${type}`, data);
    }
  }

  emitFinished(info) {
    this.send('code:finished', info);
    if (this.activeLanguage === 'python') {
      this.send('python:finished', info);
    }
  }

  stdin(value) {
    const child = this.child;
    if (typeof value !== 'string' || value.length > 65536) {
      return Promise.resolve({ success: false, error: 'Entrada no válida o demasiado larga.' });
    }
    if (!child || child.killed || !child.stdin || !child.stdin.writable || child.stdin.destroyed) {
      return Promise.resolve({ success: false, error: 'No hay proceso interactivo activo.' });
    }
    return new Promise(resolve => {
      child.stdin.write(`${value}\\n`, 'utf8', error => resolve(error
        ? { success: false, error: 'El proceso terminó antes de recibir los datos.' }
        : { success: true }));
    });
  }

  kill() {
    if (!this.child) return { success: false, error: 'No hay proceso que detener.' };
    try {
      let success = false;
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          success = true;
        } catch (_) {
          success = this.child.kill('SIGKILL');
        }
      } else {
        try {
          process.kill(-this.child.pid, 'SIGKILL');
          success = true;
        } catch (_) {
          success = this.child.kill('SIGKILL');
        }
      }
      return success ? { success: true } : { success: false, error: 'No se pudo detener el proceso.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = {
  MultiLanguageRunner,
  detectLanguage,
  detectToolchains,
  LANGUAGE_DEFS,
  EXTENSION_MAP
};
