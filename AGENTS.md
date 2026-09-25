# 🛡️ CodeGO ExamGuard - Guía Técnica para Agentes y Desarrolladores CLI

> **Propósito de este archivo**: Esta guía documenta la arquitectura completa, convenciones de seguridad, flujo de datos y directrices inviolables de **CodeGO ExamGuard** para que cualquier asistente de inteligencia artificial, agente de código o desarrollador CLI pueda intervenir el proyecto de forma segura, práctica y sin introducir regresiones.

---

## 1. Visión General del Proyecto

**CodeGO ExamGuard** es un entorno de desarrollo educativo y supervisión académica de Python multiplataforma (Linux, Windows, macOS), construido sobre **Electron**, **Vanilla JavaScript**, **CSS Puro** y un **Motor de Ejecución Nativo de Python**.

La aplicación opera bajo **dos modalidades totalmente diferenciadas**:

1. **🛡️ MODO EXAMEN BLINDADO**:
   - **Objetivo**: Evaluación supervisada con integridad académica estricta.
   - **Modo Kiosk**: La ventana se fija en pantalla completa y primer plano absoluto (`setKiosk(true)`, `setAlwaysOnTop(true)`).
   - **Desconexión Wi-Fi**: Deshabilita automáticamente las interfaces de red al iniciar y las restaura al entregar o con PIN de docente.
   - **Watchdog de Audio Anti-Mute**: Impide que el estudiante silencie el equipo para ocultar alarmas.
   - **Alerta Lumínica de 12 Segundos**: Si el estudiante cambia de ventana o pierde el foco, se registra una incidencia, se activa un halo lumínico parpadeante y un aviso auditivo armónico que dura **12 segundos exactos** antes de permitir reanudar.
   - **Excepciones legítimas**: NO se alarma si se abren ventanas gráficas de Python (Pygame, Tkinter, Turtle, Matplotlib).
   - **Entrega Sellada**: Al presionar "Entregar", el código se bloquea contra modificación, copia y pegado, y se empaqueta en un archivo ZIP auditado.

2. **📘 MODO ACTIVIDAD / TAREA**:
   - **Objetivo**: Práctica libre en clase o casa, sin restricciones de seguridad.
   - **Regla Inviolable**: **EL BOTÓN DE ENTREGAR EXAMEN NUNCA DEBE APARECER** (ni visible ni habilitado). Solo debe mostrarse el botón `▶ Ejecutar`.
   - **Gestión de Archivos**: Permite abrir carpetas del equipo (`Abrir Carpeta`) y crear nuevos proyectos (`Nuevo Proyecto`).
   - **Conectividad Libre**: El Wi-Fi permanece activo y no se ejecutan alarmas de cambio de ventana.

---

## 2. Arquitectura de Archivos y Componentes

```
CodeGO/
├── src/
│   ├── main/
│   │   └── main.js           # Proceso Principal de Electron (Kiosk, Wi-Fi, Audio Watchdog, IPC, Python Spawn)
│   ├── preload/
│   │   └── preload.js        # Puente Seguro contextBridge (Aislamiento de contexto, API expuesta)
│   └── renderer/
│       ├── index.html        # Estructura del DOM (Lobby, Countdown, IDE, Modales)
│       ├── styles.css        # Sistema de Diseño, Temas, Splitters, Responsividad y Reglas de Visibilidad
│       └── app.js            # Lógica del Renderer (Web Audio API, Terminal Interactiva, Auto-Save, Highlighting)
├── build/                    # Recursos de empaquetado e iconos
├── dist/                     # Binarios generados (AppImage, deb, exe)
├── package.json              # Dependencias y scripts de compilación
├── AGENTS.md                 # Este documento de arquitectura para agentes CLI
└── CLI_GUIDE.md              # Enlace/Copia de referencia rápida
```

---

## 3. Canales IPC (Inter-Process Communication)

Todos los canales IPC se comunican de forma segura a través de `window.electronAPI` definido en `src/preload/preload.js`:

| Canal IPC | Dirección | Descripción |
| :--- | :--- | :--- |
| `security:start-kiosk` | Renderer ➔ Main | Inicia la sesión. Configura modo examen (kiosk + wifi off) o actividad (modo libre). |
| `security:exit-kiosk` | Renderer ➔ Main | Desbloquea el kiosk con PIN maestro del docente (`1234` por defecto). |
| `python:run` | Renderer ➔ Main | Ejecuta el archivo Python activo con unbuffered stdout (`python -u`). |
| `python:stdin` | Renderer ➔ Main | Envía texto al `stdin` del proceso de Python cuando hay un `input()`. |
| `python:kill` | Renderer ➔ Main | Envía `SIGKILL` al proceso Python en ejecución. |
| `python:stdout` | Main ➔ Renderer | Emite fragmentos de texto estándar en tiempo real. |
| `python:stderr` | Main ➔ Renderer | Emite errores y trazas de excepción de Python. |
| `python:finished` | Main ➔ Renderer | Notifica fin de proceso con código de salida y duración en segundos. |
| `wifi:get-status` | Renderer ➔ Main | Consulta el estado real de la red Wi-Fi (nmcli, netsh, etc.). |
| `window:set-fullscreen` | Renderer ➔ Main | Controla el modo pantalla completa de la ventana principal. |
| `fs:list-workspace` | Renderer ➔ Main | Lista recursivamente los archivos del workspace activo. |
| `fs:save-file` | Renderer ➔ Main | Guarda el contenido del archivo abierto en disco. |
| `exam:submit` | Renderer ➔ Main | Empaqueta el código y bitácora en ZIP con sello SHA-256. |

---

## 4. Consola y Terminal Interactiva (`input()`)

La petición del usuario de septiembre de 2026 sustituye la barra separada anterior: la respuesta se escribe **dentro de la terminal, junto al prompt de Python**.

1. `.terminal-panel` mantiene flex vertical, `min-height: 0` y overflow oculto. `.terminal-output` es la única superficie desplazable, con `flex: 1 1 0` y `min-height: 0`.
2. `#terminal-transcript` contiene la salida; `#terminal-stdin-input` es un control nativo sin borde ni fondo, dibujado inmediatamente después en la misma línea. No agregar una barra inferior ni botón de envío separado.
3. Enter envía stdin y conserva el eco junto al prompt. Limpiar borra únicamente la transcripción, nunca el control activo. Al terminar, el cursor de entrada se oculta.
4. El tamaño inicial y mínimo de BrowserWindow deben caber en las dimensiones lógicas del monitor. Probar escalado del SO además de zoom de la aplicación, y verificar también los créditos y el pie del editor.

---

## 5. Reglas Inviolables para Modificar Código

Cualquier CLI o agente debe verificar estrictamente las siguientes reglas antes de confirmar cambios:

1. **Ocultamiento del Botón de Entregar en Modo Actividad**:
   - `styles.css` contiene:
     ```css
     body.mode-activity-active #btn-finish-exam,
     body.mode-activity-active .exam-only-btn { display: none !important; }
     ```
   - En `app.js`, tanto `setSessionMode('activity')` como `enterIdeWorkspace()` deben agregar `mode-activity-active` al `body` y fijar `DOM.btnFinishExam.style.display = 'none'`. **Nunca elimines estas protecciones**.
2. **Pantalla Completa por Defecto**:
   - La ventana principal debe iniciar maximizada y en pantalla completa (`fullscreen: true`).
3. **Distribución Vertical (Lado a Lado)**:
   - Editor a la izquierda y terminal a la derecha con divisor redimensionable vertical (`splitter-horizontal` con `col-resize`).
4. **Alerta de Incidencias de 12 Segundos**:
   - El temporizador de 12 segundos debe completarse antes de habilitar el botón de reanudar examen.
5. **No usar frameworks pesados**:
   - Mantener el diseño en HTML semántico, CSS puro y JavaScript moderno nativo.

---

## 6. Comandos de Compilación y Validación

- **Verificar sintaxis JavaScript**:
  ```bash
  node -c src/main/main.js && node -c src/preload/preload.js && node -c src/renderer/app.js
  ```
- **Ejecutar en modo desarrollo**:
  ```bash
  npm start
  ```
- **Compilar AppImage para Linux**:
  ```bash
  npx electron-builder --linux AppImage
  ```
- **Probar el ejecutable generado**:
  ```bash
  ./CodeGO.AppImage
  ```
