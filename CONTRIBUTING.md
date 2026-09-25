# Contribuir a CodeGO

Describe el problema, el sistema operativo, la arquitectura y los pasos para reproducirlo. Usa ejemplos ficticios sin información personal. Para problemas de seguridad sigue SECURITY.md.

Usa Node.js de `.nvmrc`, Python 3.12 o 3.13 y los comandos del README. Antes de abrir una propuesta ejecuta `npm run verify`; si cambias integración nativa, compila con `npm run build:dir` y ejecuta `npm run test:packaged`.

Mantén HTML, CSS y JavaScript nativo. Conserva la entrada de consola visible, el modo actividad sin botón de entrega, la distribución inicial editor/consola lado a lado y la alerta de examen de 12 segundos. Añade una prueba de regresión cuando cambies estos comportamientos.

Las propuestas se revisan con pruebas nativas en Linux, Windows y macOS. No incluyas `node_modules`, entornos Python, entregas de estudiantes, reportes locales ni instaladores en Git: los binarios se distribuyen mediante Releases.
