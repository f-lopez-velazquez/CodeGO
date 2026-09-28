# Despliegue de CodeGO ExamGuard Offline (Sin Conexión a Internet)

Este documento describe cómo preparar aulas de cómputo, laboratorios escolares y computadoras personales para operar **100% desconectadas de internet** con los **5 lenguajes académicos**:
- 🐍 **Python 3** (con NumPy, Pandas, Matplotlib, PySerial, etc.)
- ⚙️ **C / C++** (GCC, G++, Make, CMake, STL)
- ☕ **Java** (OpenJDK 17 / 21, Java SE, Scanner, Streams)
- 🟨 **JavaScript** (Node.js LTS, npm, V8 Engine)
- 📊 **R** (Rscript, R Base, paquetes estadísticos)

---

## 1. Instalación en Linux (Ubuntu, Debian, Fedora, Arch)

Para instalar y dejar listos todos los compiladores y dependencias en cualquier máquina Linux antes del examen:

```bash
# Otorgar permisos de ejecución
chmod +x scripts/setup-languages-linux.sh

# Instalación completa desatendida de los 5 lenguajes
./scripts/setup-languages-linux.sh --all

# O seleccionar lenguajes de forma interactiva
./scripts/setup-languages-linux.sh
```

---

## 2. Instalación en Windows 10 / 11

En una consola de PowerShell con privilegios de Administrador:

```powershell
# Ejecutar instalador para todos los lenguajes
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup-languages-win.ps1 -All

# O de forma interactiva eligiendo qué lenguajes activar
.\scripts\setup-languages-win.ps1
```

---

## 3. Preparación de Memoria USB Offline para Aulas

Para llevar CodeGO y todos los compiladores en una memoria USB e instalarlos en computadoras sin acceso a internet:
1. Copia el ejecutable de **CodeGO** (`CodeGO.AppImage` en Linux o `CodeGO.exe` en Windows).
2. Ejecuta el script de preparación para verificar que todos los binarios estén presentes en `build/offline/`.
3. Al iniciar el examen, CodeGO detectará automáticamente los compiladores locales y bloqueará las interfaces de red para garantizar la integridad académica.

---

## 4. WebApp y SDK para Entornos Virtuales y CognaGo

Para instituciones que imparten cursos a distancia o desean certificar entregas de tareas remotamente:
- La WebApp de CodeGO (`webapp/index.html`) se ejecuta enteramente en el navegador del alumno.
- Utiliza WebAssembly (Pyodide para Python, JS V8 Sandbox, C++ Algorithmic Engine) para ejecutar código localmente sin necesidad de servidores de compilación.
- Incluye el SDK `webapp/codego-sdk.js` con telemetría anti-plagio, firma WebCrypto HMAC-SHA256 y generación automática del `CERTIFICADO_DOCENTE.html`.
