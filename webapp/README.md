# CodeGO Web

HTML/CSS/JavaScript sin compilación. Registro Google con Firebase Auth; proyectos por cuenta y navegador con IndexedDB. Python corre en un worker con Pyodide; JavaScript también se ejecuta fuera del hilo de interfaz. La primera carga de Google y del motor requiere conexión. El trabajo no se sincroniza a un servidor.

- Desarrollo: `python3 -m http.server 8080`, abrir `/webapp/`.
- Validación: `npm run check`, `npm test`, `npm run test:webapp`, `npm run test:examples`.
- Copia para el sitio corporativo: `node scripts/sync-webapp.cjs`.
- Publicación: `npx firebase-tools deploy --only hosting:codego-ide,hosting:codego-python --project zolvek-mx`.

El modo libre permite copiar y pegar y oculta/deshabilita Entregar. Tarea y examen web bloquean copiar, cortar, pegar y arrastrar texto y registran salidas con espera de 30 s. La web no controla aplicaciones o red del sistema. Las entregas web v2 llevan SHA-256 y firma ECDSA P-256 con una clave privada no exportable conservada en IndexedDB; las nativas usan Ed25519. Ambas detectan cambios, sin demostrar autoría.

`input()` funciona dentro de la consola: ejecutar, responder junto a la pregunta y pulsar Enter. Admite varias preguntas, respuestas vacías, Unicode, bucles y lectura con `sys.stdin`. Ctrl+D con el campo vacío envía fin de entrada. Limpiar conserva la entrada activa; Detener termina incluso un programa que espera una respuesta. La espera humana no consume el límite de ejecución. En móvil la consola se abre al pedir datos y el teclado ofrece Enviar. Funciona sin conexión después de la primera carga del motor y la app.

El canal de entrada usa solicitudes síncronas solo dentro del worker de ejecución, interceptadas por el Service Worker local; las respuestas no se envían a Hosting ni se cachean. Cada ejecución tiene un identificador aleatorio; los canales caducan y se liberan al terminar. No requiere SharedArrayBuffer ni cambiar los encabezados que permiten iniciar sesión con Google. Requiere HTTPS o localhost y Service Workers habilitados. `npm run test:webapp:input` comprueba Python real, entrada interactiva, aislamiento entre pestañas y recarga sin red; `CODEGO_WEB_ENGINE=firefox` o `webkit` permite repetirla con otros motores.

La conexión confirma el protocolo con el SW activo mediante MessageChannel y le pide adoptar la página con `clients.claim()`. Así se recupera una recarga forzada, que puede dejar `controller` en `null` aunque ya exista un SW activo. Si hay una versión anterior, se actualiza y conecta sin borrar proyectos ni pedir otra recarga. App, SDK y worker de ejecución usan URLs con versión para evitar mezclar un intérprete antiguo con la interfaz nueva. Las navegaciones buscan HTML reciente en red y conservan la copia local como alternativa sin conexión. `npm run test:webapp:recovery` reproduce el fallo con una recarga forzada real de Chromium, una caché de ejecución antigua y un SW anterior.

El curso incluye 20 lecciones, 40 ejemplos, 60 preguntas, 40 ejercicios con pruebas y pistas, y cuatro evaluaciones integradoras. Cuenta → Crear actividad permite al docente compartir ejercicios en JSON. Cuenta → Abrir actividad permite resolverlos. La evaluación es local y orientativa; no hay calificación institucional en servidor.

Ver `docs/PLATAFORMAS-Y-RECUPERACION.md` en el repositorio para recuperación, límites y verificaciones. Incrementar el nombre de caché en `sw.js` cuando se publique una nueva versión; la actualización compatible se activa tras precargar sus archivos y se utiliza al recargar la página.


Los 40 ejemplos incluyen escritura progresiva, línea actual, variables, referencias compartidas, llamadas y consola. Las trazas se generan desde Python real con `npm run build:examples`. Si cambia el código de un ejemplo, hay que regenerarlas; las pruebas comprueban el hash del código y la salida esperada. El reproductor permite pausar, avanzar, retroceder, ajustar velocidad y ver todo sin esperar. Respeta movimiento reducido y libera sus temporizadores al salir de la lección. No ejecuta código del alumno para generar las animaciones.

En tarea, los archivos previos son de consulta y se crea una solución editable. La entrega definitiva bloquea todo el proyecto tras una advertencia explícita. Cuenta → Descargar proyecto genera una copia firmada; en examen esta acción pasa por Entregar. Descargar de nuevo una entrega conserva exactamente sus bytes. Cuenta → Revisar entrega firmada comprueba la firma y permite leer el código y el historial. El verificador de escritorio acepta también estos JSON.

El curso tiene misiones consecutivas, XP por logros únicos, niveles y una zona de repaso. Los errores de ejecución incorporan ejemplos de referencia con escritura progresiva, controles por línea y movimiento reducido. Las prácticas no son exámenes certificados de freeCodeCamp.

La evidencia contiene nombre registrado, correo de la cuenta, fecha local, modo, hashes de archivos, eventos de edición y acciones de portapapeles (permitidas o bloqueadas). Conserva hasta 500 eventos, indicando los omitidos. La identidad identifica esta instalación del navegador; borrar sus datos la reinicia. No identifica el número de serie del equipo ni la app desde la que se copió.

Sin red funcionan proyectos, curso, Python previamente cargado, firma, verificación y entrega. La primera autenticación y descarga de Python necesitan internet. Las incidencias pendientes sobreviven una recarga y exigen 30 segundos completos al regresar. Las librerías fijadas se conservan al actualizar la interfaz. El navegador o el SO pueden eliminar caché por falta de espacio. Los archivos de texto generados por Python se añaden al proyecto dentro de sus límites; imágenes, audio y resultados de mayor tamaño requieren la app nativa.

Desde 1.6.17 la dirección principal es https://codego-ide.web.app/. La anterior sigue operativa para recuperar trabajo del almacenamiento de aquel dominio; cambiar de dirección no transfiere IndexedDB ni la identidad de instalación. Descargar las copias antes de migrar.

Tarea y examen exigen comprobar audio y pantalla completa al iniciar. Un rechazo bloquea el inicio; si se pierden después, el proyecto queda bloqueado hasta restablecer ambos y completar 30 segundos desde el regreso. No existe permiso web para controlar el volumen del sistema. Se usa señal roja/blanca de pantalla completa, limitada a 2 destellos/s y desactivada si el SO solicita movimiento reducido. La app no ofrece un botón opcional de audio. El clic derecho abre acciones propias, y los menús se ajustan al viewport.

El guardado continúa en IndexedDB; un borrador síncrono de emergencia protege la edición activa al recargar o abandonar. Se valida revisión, fecha y bloqueo antes de recuperarlo. No se sobreescribe una entrega ni un archivo de consulta con el borrador.
