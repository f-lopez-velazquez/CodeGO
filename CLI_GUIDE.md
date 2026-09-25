# 🧭 CodeGO ExamGuard - Guía CLI Rápida

Consulta el documento principal de arquitectura técnica y reglas para asistentes y agentes CLI en [AGENTS.md](AGENTS.md).

### Resumen de Intervención Segura:
1. **Modo Actividad**: Jamás mostrar el botón de entrega.
2. **Terminal e Input**: La barra de entrada debe permanecer anclada con `min-height: 0` en `.terminal-output` y `height: 48px` en `.terminal-input-bar`.
3. **Pantalla Completa**: Siempre activa por defecto.
4. **Alerta**: Duración estricta de 12 segundos lumínica parpadeante con audio suave.
5. **Verificación**: Siempre ejecutar `node -c src/main/main.js && node -c src/preload/preload.js && node -c src/renderer/app.js` antes de compilar.
