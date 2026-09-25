# 🧭 CodeGO ExamGuard - Guía CLI Rápida

Consulta el documento principal de arquitectura técnica y reglas para asistentes y agentes CLI en [AGENTS.md](AGENTS.md).

### Resumen de Intervención Segura:
1. **Modo Actividad**: Jamás mostrar el botón de entrega.
2. **Terminal e Input**: La entrada se dibuja junto al prompt de Python dentro de `.terminal-output`, sin barra separada. Mantener `min-height: 0` y comprobar también los límites de la ventana contra la pantalla con escalado del SO.
3. **Pantalla Completa**: Siempre activa por defecto.
4. **Alerta**: Duración estricta de 12 segundos lumínica parpadeante con audio suave.
5. **Verificación**: Siempre ejecutar `node -c src/main/main.js && node -c src/preload/preload.js && node -c src/renderer/app.js` antes de compilar.
