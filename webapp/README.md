# CodeGO Web

HTML/CSS/JavaScript sin compilación. Registro Google con Firebase Auth; proyectos por cuenta y navegador con IndexedDB. Python corre en un worker con Pyodide; JavaScript también se ejecuta fuera del hilo de interfaz. La primera carga de Google y del motor requiere conexión. El trabajo no se sincroniza a un servidor.

- Desarrollo: `python3 -m http.server 8080`, abrir `/webapp/`.
- Validación: `npm run check`, `npm test`, `npm run test:webapp`, `npm run test:examples`.
- Copia para el sitio corporativo: `node scripts/sync-webapp.cjs`.
- Publicación: `npx firebase-tools deploy --only hosting:codego-python --project zolvek-mx`.

El modo libre permite copiar y pegar y oculta/deshabilita Entregar. Tarea y examen web bloquean el portapapeles del editor y registran salidas con espera de 12 s. La web no controla aplicaciones o red del sistema. Sus reportes SHA-256 no equivalen a las entregas Ed25519 nativas. Entradas para `input()` se preparan en consola antes de ejecutar.

El curso incluye 20 lecciones, 40 ejemplos, 60 preguntas, 40 ejercicios con pruebas y pistas, y cuatro evaluaciones integradoras. Cuenta → Crear actividad permite al docente compartir ejercicios en JSON. Cuenta → Abrir actividad permite resolverlos. La evaluación es local y orientativa; no hay calificación institucional en servidor.

Ver `docs/PLATAFORMAS-Y-RECUPERACION.md` en el repositorio para recuperación, límites y verificaciones. Incrementar el nombre de caché en `sw.js` cuando se publique una nueva versión; la actualización compatible se activa tras precargar sus archivos y se utiliza al recargar la página.


Los 40 ejemplos incluyen escritura progresiva, línea actual, variables, referencias compartidas, llamadas y consola. Las trazas se generan desde Python real con `npm run build:examples`. Si cambia el código de un ejemplo, hay que regenerarlas; las pruebas comprueban el hash del código y la salida esperada. El reproductor permite pausar, avanzar, retroceder, ajustar velocidad y ver todo sin esperar. Respeta movimiento reducido y libera sus temporizadores al salir de la lección. No ejecuta código del alumno para generar las animaciones.
