# 🧭 CodeGO ExamGuard - Guía CLI Rápida

Consulta el documento principal de arquitectura técnica y reglas para asistentes y agentes CLI en [AGENTS.md](AGENTS.md).

### Resumen de Intervención Segura:
1. **Modo Actividad**: Jamás mostrar botones de entrega (`#btn-finish-exam` y `#btn-submit-task` ocultos con `display: none !important;`).
2. **Modo Tarea Certificada**: Kiosk activo, anti-copia/pega estricto de código externo, telemetría continua de tipeo y firma criptográfica HMAC-SHA256 (`.codego`).
3. **Manejo de Carpetas**: Soporte recursivo de subcarpetas en todos los SOs, con árbol colapsable y barra de breadcrumbs.
4. **Terminal e Input**: La entrada se dibuja junto al prompt de Python dentro de `.terminal-output`, sin barra separada. Mantener `min-height: 0` y comprobar también los límites de la ventana contra la pantalla con escalado del SO.
5. **Pantalla Completa**: Siempre activa por defecto.
6. **Alerta**: Duración estricta de 12 segundos lumínica estroboscópica (`hazard-teacher-beacon`) con audio suave.
7. **Verificación**: Siempre ejecutar `node -c src/main/main.js && node -c src/main/submission.js && node -c src/preload/preload.js && node -c src/renderer/app.js` y `npm test`.
8. **Diseño Minimalista**: Cero saturación visual, sin muros de texto, paleta oscura sobria (#0f131d), lobby compacto en una sola pantalla y watchdog anti-mute en todos los modos.
