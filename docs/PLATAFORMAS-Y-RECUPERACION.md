# CodeGO: plataformas, recuperación y evaluación

Implementación de noviembre de 2026. Los cambios de escritorio están en el código fuente y requieren distribuir una actualización de la aplicación; publicar la web no actualiza los instaladores.

## Inicio y trabajo diario

El escritorio abre en modo libre. La pantalla inicial pide elegir la modalidad; el botón de entrada abre un diálogo centrado con nombre, matrícula, actividad y carpeta. Enter confirma el formulario y Escape lo cierra. La carpeta predeterminada es `<userData>/projects/Mi proyecto`, dentro del perfil del usuario de Electron, independiente de permisos de administrador. Una selección explícita se recuerda en `workspace-preference.json`. Si desaparece una unidad externa o una carpeta, el inicio conserva un proyecto local utilizable.

Continuar y Recientes restauran la ruta y vuelven a leer el archivo activo y hasta diez pestañas desde disco. No recuperan el código de una copia antigua guardada en localStorage. Los exámenes conservan sus espacios aislados y no entran en Recientes. No se importa automáticamente el antiguo `exam_workspace`: puede contener material de evaluación. Se puede abrir explícitamente para recuperar una práctica anterior.

El explorador realiza E/S asíncrona, limita el árbol a 3000 elementos y 20 niveles, excluye dependencias y enlaces simbólicos y presenta un aviso si omite contenido. Una carpeta cerrada no construye sus filas descendientes. Las búsquedas de red fuera de un examen se espacian a 30 segundos y no se superponen.

El guardado nativo escribe un temporal junto al destino, sincroniza los datos y reemplaza el archivo. Un error de escritura conserva la versión anterior y mantiene la pestaña pendiente. El resaltado y las guías evitan trabajo repetido; por encima de 200 000 caracteres se utiliza texto sin resaltado para contener el coste del editor.

## Modalidades

| Modalidad | Escritorio | Navegador |
|---|---|---|
| Libre | Carpeta local, copiar/pegar, sin supervisión ni entregas | Proyecto por cuenta en IndexedDB, copiar/pegar, sin supervisión ni entregas |
| Tarea | Carpeta como en libre; sin copiar/cortar/pegar en el espacio de trabajo; foco supervisado; entrega Ed25519 | Proyecto local; escritura directa; registro de salidas y espera de 12 s; descarga JSON con SHA-256 |
| Examen | Workspace limpio; controles nativos existentes de kiosk, audio y red; entrega auditada | Proyecto/actividad web; escritura directa; registro de salidas y espera de 12 s; sin control del SO |

El navegador no puede cerrar aplicaciones ajenas, bloquear cambios de aplicación, apagar Wi-Fi ni comprobar todas las pantallas. Los resultados y la telemetría web son información local modificable por quien controla el navegador. SHA-256 comprueba contenido, no autoría. El reporte web se identifica como `codego-web-submission-v1` y no se presenta como una entrega `.codego` Ed25519.

El comportamiento web es una alternativa de práctica/evaluación orientativa. No ofrece paridad con el examen blindado nativo. Las ventanas de Pygame, Tkinter y otras bibliotecas de escritorio requieren la aplicación instalada. La web ejecuta Python y JavaScript; ya no anuncia como exitosas ejecuciones simuladas de C++, Java o R. `input()` web usa respuestas preparadas, una por línea, en la consola antes de ejecutar; la terminal nativa conserva su entrada interactiva junto al prompt.

## Cuenta, publicación y datos

Firebase: proyecto existente `zolvek-mx`; sitio separado `codego-python`. Los nombres `codego` y `code-go` estaban reservados por otros proyectos. Se añadieron únicamente los dominios `codego-python.web.app` y `codego-python.firebaseapp.com` al proveedor Google ya habilitado y a los referentes permitidos de la clave pública existente; se conservaron los demás dominios, restricciones y reglas de Firestore. No se publicaron otros sitios.

Google verifica la cuenta: escribir un correo no inicia sesión. Se utiliza persistencia de Firebase Auth en el navegador. Una sesión previamente verificada puede conservarse sin conexión; un primer registro requiere red. En equipos compartidos, cada cuenta tiene una clave de almacenamiento diferente. Cerrar sesión no elimina las copias locales. Un usuario con acceso al perfil del navegador puede inspeccionarlas; no son almacenamiento cifrado ni una medida contra el propietario del dispositivo.

El proyecto no se sincroniza en la nube. Cambiar de equipo requiere descargar `*.codego-web.json` e importarlo en el otro navegador. Borrar datos del sitio, usar navegación privada, perder el dispositivo o la expulsión de almacenamiento de iOS puede eliminar la copia local. La interfaz identifica dónde se guarda y permite descargarla. Las revisiones de IndexedDB evitan que dos pestañas sobrescriban silenciosamente los cambios de la otra.

Para publicar únicamente este sitio: `npx firebase-tools deploy --only hosting:codego-python --project zolvek-mx`. Antes, ejecutar `node scripts/sync-webapp.cjs`; la copia bajo `website/codego/webapp/` conserva la misma implementación para la ruta corporativa. La publicación en Firebase desde este repositorio no despliega las demás rutas del sitio corporativo.

## Curso y actividades

Veinte lecciones de Python en cinco unidades: primeros pasos, decisiones y repetición, colecciones, funciones y calidad, datos y proyectos. Incluye 40 ejemplos con salida explicada, 60 preguntas de comprensión, 40 ejercicios y cuatro evaluaciones integradoras con 48 preguntas adicionales y 23 comprobaciones prácticas. Explicaciones y ejercicios originales en español, vinculados a bloques existentes del currículo público de freeCodeCamp. La licencia de referencia se incluye en `webapp/licenses/freeCodeCamp.txt`; no se usa su marca como acreditación.

Cada ejercicio ejecuta pruebas reales de Python y devuelve pistas por caso fallido. El resultado se asocia al hash del código efectivamente ejecutado. El progreso se guarda por cuenta y equipo. Un docente puede crear tareas o exámenes web, escribir código inicial, definir de 1 a 30 comprobaciones Python y descargar un JSON para compartir. El alumno importa el archivo, resuelve, prueba y entrega un reporte descargable. Las pruebas son visibles y la calificación es orientativa; no existe un panel institucional ni registro de calificaciones en servidor.

## Escenarios y respuesta

| Situación | Respuesta implementada / límite |
|---|---|
| Carpeta enorme, dependencias o bucle de enlaces | Recorrido asíncrono y acotado, exclusiones y aviso; no sigue enlaces |
| Unidad externa desconectada | Ruta anterior no utilizable: se ofrece carpeta predeterminada o selección explícita |
| Permiso denegado en subcarpeta | Se conserva el resto del árbol y se informa de la subcarpeta |
| Disco lleno o fallo de escritura nativo | El temporal no reemplaza el archivo anterior; cambios pendientes y reintento |
| Cuota de IndexedDB / modo privado | Aviso de guardado fallido; no se afirma que se guardó; descarga de respaldo |
| Dos pestañas de una cuenta | La revisión obsoleta falla; se pide descargar copia antes de recargar |
| Recarga o cierre accidental | IndexedDB conserva el último commit; se solicita confirmar si hay cambios pendientes |
| Corte de energía durante edición | Se recupera el último guardado completado. No se promete recuperar las últimas pulsaciones aún pendientes |
| Pérdida de internet | Edición/guardado locales continúan; shell y motor ya descargados se sirven desde caché |
| Primera ejecución web sin red | Se informa del motor no disponible; el código queda guardado |
| Red vuelve | Puede reintentarse la ejecución; no se envía automáticamente una entrega al profesor |
| Caché incompleta o eliminada por el SO | El motor puede requerir red de nuevo; no se promete disponibilidad offline permanente |
| Bucle infinito / salida masiva | Worker terminable y salida acotada a 200 000 caracteres; límite de ejecución de 120 s |
| Respuestas insuficientes para input() | EOFError explicado con un ejemplo y la ubicación de Entradas |
| Código con error | Explicación en español, ejemplo y salto a la línea; traceback original disponible |
| Cambio de app en tarea/examen web | Incidencia y cuenta de 12 s desde el regreso, reiniciada al salir de nuevo |
| Teclado móvil, rotación o pantalla angosta | Un panel por vez, navegación inferior, altura del viewport visual y teclas de símbolos/sangría |
| Entrega descargada | Proyecto sellado localmente; el alumno conserva y envía el archivo al docente |
| Descargas bloqueadas o canceladas por el usuario | No hay confirmación de recepción del docente. Una descarga local no equivale a envío ni a aceptación |
| Chrome/Safari bloquea Google | Mensaje para permitir la ventana; no se sustituye por un correo sin verificar |
| Importación inválida, rutas externas o demasiado contenido | Validación antes de agregar el nuevo proyecto; el trabajo actual se conserva |

## Verificación y pendientes reales

Se ejecutan pruebas unitarias, IPC, Python nativo y de navegador. La identidad en las pruebas de interacción se simula; nunca se registra a un usuario real mediante automatización. La configuración real de Firebase se inspeccionó por API; la pantalla pública carga sin errores y el botón abre `accounts.google.com` tras autorizar el nuevo dominio en la clave pública. La prueba offline del sitio publicado ejecutó Python, deshabilitó la red, recargó la página, recuperó el proyecto y volvió a ejecutar Python desde caché.

La prueba de WebKit de este entorno no puede arrancar por falta de `libicudata.so.74`. No se afirma haber probado Safari/iOS reales ni Windows de gama baja. Tampoco se midió una reducción porcentual de CPU/RAM. Antes de una distribución institucional hay que realizar pruebas nativas en Windows, macOS y Linux, con drivers, escalado, IME, antivirus, cierres inesperados y políticas del centro; y pruebas en dispositivos Android/iOS reales. Ninguna matriz finita garantiza prever cualquier imprevisto.

Resultados locales: `npm run check`, 79 pruebas de `npm test`, `npm run test:electron`, 32 combinaciones de `npm run test:browser`, `npm run test:webapp` y `npm run test:webapp:offline` satisfactorios. Para este equipo, las pruebas de navegador se ejecutaron con `CODEGO_BROWSER_BINARY=/usr/bin/chromium`. Capturas en `output/playwright/` (artefactos locales excluidos de Git).


## Actualización 1.6.15

La pantalla instalada 1.6.14 indicaba correctamente la versión publicada: los cambios de la sesión anterior aún no tenían release. La 1.6.15 se distribuye como actualización ASAR para las bases compatibles 1.6.13/1.6.14; no cambia Electron, Python ni las dependencias nativas. El instalador base sigue identificado con su propia versión.

La web utiliza la marca y el lobby del escritorio, explorador, archivo activo, resaltado alineado con el cursor, paneles redimensionables y consola. En móvil ofrece navegación inferior, símbolos y sangría, selector de lecciones, una sección de aprendizaje por paso y altura ajustada al teclado mediante VisualViewport. No se afirma paridad de controles nativos.

El currículo ampliado tiene 20 lecciones en cinco unidades, 40 ejemplos, 60 preguntas de comprensión, 40 ejercicios y cuatro evaluaciones de 12 preguntas más retos integradores. El progreso de comprensión se distingue de la práctica. Los ejercicios de una lección conservan archivos y pruebas independientes. Las soluciones de referencia están en tests/fixtures, fuera de los archivos publicados; los ejemplos y los 44 retos se ejecutan con Python real en las pruebas.


## Ejemplos animados de aprendizaje

Los 40 ejemplos se recorren con escritura progresiva, resaltado de la línea actual, explicación de la instrucción, estado anterior/nuevo de las variables, celdas de colecciones, referencias compartidas, pila de llamadas, retorno y consola. Los 236 pasos se obtienen de ejecuciones reales con `sys.settrace` mediante `scripts/build-example-traces.py`. La traza estática evita iniciar otro intérprete al consultar una explicación y funciona sin red cuando la aplicación está en caché.

La animación tiene pausa, avance/retroceso, repetición, velocidad, barra de pasos y salto al resultado completo. Solo un ejemplo se reproduce a la vez. Se pausa al salir de la vista, desplazarlo fuera de pantalla, ocultar la pestaña o perder el foco; los temporizadores se liberan al cambiar de lección. Con movimiento reducido, el código se presenta completo y el recorrido manual sigue disponible. La escritura no envía avisos al lector de pantalla por carácter y la reproducción automática evita acumular narraciones habladas.

La explicación es una ejecución grabada del ejemplo incluido, no un depurador general de cualquier código del alumno. Cambiar el ejemplo exige regenerar la traza; sus pruebas verifican el SHA-256 del código, la salida real, la acumulación de bucles, el alcance de variables, las referencias compartidas y los retornos. Esta entrega modifica el curso web; el instalable accede al mismo curso desde su enlace y no requiere otro paquete nativo.
