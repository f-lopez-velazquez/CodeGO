# Cambios

## 1.6.6 · Ventanas gráficas y supervisión cómoda

- Pygame, Tkinter y otras ventanas gráficas se promueven al frente en macOS después de abandonar el espacio de pantalla completa de Electron.
- Python ejecuta desde la raíz del proyecto, con UTF-8 y variables SDL portátiles, para que recursos relativos y comportamiento coincidan con el espacio de trabajo del editor.
- Modo libre registra un contador pasivo de salidas sin mostrar alarma ni alterar las notificaciones del sistema.
- Examen y tarea filtran transferencias de foco menores a 650 ms producidas por el compositor o avisos del sistema, manteniendo la alarma repetible ante cambios reales de aplicación.
- La barra del editor incorpora una salida visible; un examen activo conserva la autorización mediante PIN del docente.
- La construcción macOS recupera volúmenes DMG temporales ocupados y reintenta el empaquetado de forma acotada.

## 1.6.5 · Inicio inmediato y supervisión repetible

- Muestra una pantalla de arranque desde el primer cuadro y mueve las comprobaciones largas a procesos asíncronos para que Windows, macOS y Linux no interpreten la preparación como un bloqueo.
- Impide abrir dos instancias de codeGO a la vez; esto elimina la competencia de pantalla completa que provocaba temblor en Hyprland y otros gestores de ventanas.
- Integra el selector de lenguaje dentro del formulario y adapta la barra superior a la resolución, altura, escala y densidad reales de la pantalla.
- Permite elegir guías de sangría sutiles, visibles u ocultas; elimina el rectángulo vertical del bloque activo.
- Redefine las modalidades: Examen blindado, Tarea/Actividad supervisada con portapapeles y entrega, y Libre sin supervisión ni entrega.
- Reproduce y registra cada salida supervisada, incluso con un diálogo de codeGO abierto; una nueva salida durante la espera reinicia los 12 segundos completos.
- Alterna la señal del aula entre rojo, blanco y verde, mantiene el control de audio durante la espera y trata un monitor adicional como una incidencia recuperable.
- El profesor define y confirma el PIN de salida al iniciar cada examen. Ya no existe un PIN predeterminado visible o implícito.
- Registra una sesión de examen interrumpida para mostrarla al siguiente arranque si el proceso fue terminado sin entrega ni salida autorizada.
- Oculta en examen los gestores y acciones que abren otros flujos, cierra navegadores, editores y asistentes conocidos al iniciar, e incorpora PDF a los recursos educativos importables.

## 1.6.4 · Foco estable y feedback de escritorio

- Recupera el teclado a nivel de la ventana Electron y del editor al volver a un proyecto, incluida la negociación de foco de Wayland/Hyprland.
- Sustituye los avisos de Chromium por diálogos propios de codeGO, sin casillas para ocultar futuros mensajes ni estilos ajenos a la aplicación.
- Muestra el guardado en curso, la hora exacta de la última versión guardada, avisos breves y sonidos discretos de confirmación o error.
- Simplifica la selección de lenguaje en el inicio con un control compacto y una explicación breve del entorno activo.
- Abre el proyecto actual en el explorador de archivos propio de Windows, macOS o Linux desde el inicio y el editor.
- Mantiene las carpetas colapsadas al abrir un proyecto y usa un selector visual de destino para mover archivos sin escribir rutas manualmente.
- Amplía la comprobación del paquete para exigir que el editor vuelva editable y con foco después del recorrido Inicio → proyecto.

## 1.6.3 · Edición continua y ayuda precisa

- Recupera automáticamente el foco y la edición del archivo activo al volver desde Inicio, sin exigir una ejecución previa.
- Centraliza los estados editable y sellado para evitar que una entrega o proyecto anterior bloquee otro espacio de trabajo.
- Limpia pestañas al cambiar de carpeta y conserva la pestaña activa al reabrir el mismo proyecto.
- Refina la navegación del IDE con rutas, pestañas, selección y estados de foco más claros, sin animaciones de pantalla que provoquen destellos.
- Mejora las guías de sangría por nivel, mantiene su continuidad en líneas vacías, destaca el bloque activo y señala tabuladores o niveles incompletos.
- Muestra el nivel de sangría actual en la barra de estado y conserva Tab, Mayús+Tab, pares automáticos y navegación precisa por línea y columna.
- Amplía los diagnósticos de sintaxis y ejecución con causas específicas, tres pasos de corrección y ejemplos válidos para los errores frecuentes de Python.
- Añade una prueba de regresión del recorrido Inicio → mismo proyecto → edición inmediata, además de comprobaciones visuales de guías y ayuda contextual.

## 1.6.2 · Actualizaciones automáticas y pantalla estable

- Muestra siempre la versión instalada en el inicio y comunica de forma discreta el estado de una actualización.
- Comprueba versiones desde el proceso principal al abrir y cada 30 minutos, incluso cuando la ventana está en segundo plano.
- Descarga la versión adecuada para Windows, macOS o Linux, verifica tamaño y SHA-256 y la instala automáticamente cuando no hay una sesión ni un programa en ejecución.
- Conserva una copia de la versión anterior durante la sustitución en Linux y macOS y recupera esa copia si la operación falla.
- Evita el temblor de la ventana en Wayland/Hyprland al solicitar pantalla completa una sola vez antes de mostrarla y limitar los reintentos del compositor.
- Añade pruebas de reemplazo atómico en Linux, instalación silenciosa en Windows, sustitución del paquete en macOS y estabilidad de pantalla completa.

## 1.6.1 · Editor guiado y supervisión resistente

- Añade guías de sangría reales por nivel, navegación con `F8` y comprobación de sintaxis Python en vivo con explicaciones concretas en español.
- Protege la interfaz frente a programas que imprimen salida sin límite mediante lotes acotados, sin perder la capacidad de detener la ejecución.
- Refuerza `Detener`: termina el grupo completo del proceso, ofrece una segunda detención forzada y recupera la interfaz aun si el proceso no confirma su cierre.
- Cierra navegadores conocidos al iniciar un examen con una fase normal y otra forzada en Linux y macOS; Windows termina el árbol completo del navegador.
- Eleva el brillo y el volumen únicamente durante una alarma, bloquea bajar o silenciar el audio mientras está activa y restaura el brillo anterior al terminar.
- Acelera la baliza docente a una alternancia roja y blanca de 0.36 segundos, visible a distancia y sin filtros gráficos costosos.
- Mantiene codeGO a pantalla completa y libera temporalmente el escritorio para Pygame, Tkinter, Turtle y Matplotlib; la aplicación vuelve a pantalla completa al terminar.
- Amplía las pruebas nativas con ciclos infinitos, procesos hijos, inundación de salida, diagnósticos de sintaxis, brillo y cierre de navegadores.

## 1.6.0 · Exámenes aislados y ejecución resistente

- Elimina el ajuste periódico de volumen durante el trabajo normal; el sistema solo protege el audio mientras una alarma de supervisión está activa.
- Mantiene la alarma hasta que el alumno regresa a codeGO y comienza entonces la espera obligatoria de 12 segundos.
- Termina el árbol completo del proceso en Windows, macOS y Linux para detener ciclos infinitos y ventanas o procesos hijos.
- Crea cada examen en un espacio nuevo, sin archivos antiguos, con un archivo vacío nombrado a partir del alumno y el ID dictado por el docente.
- Añade pestañas cerrables, carpetas inicialmente colapsadas, regreso seguro al inicio y un indicador de modo con el ID del examen.
- Suspende avisos del sistema cuando la plataforma ofrece un mecanismo seguro y restaura la configuración al terminar la sesión.
- Permite generar una huella Ed25519 de examen calificado vinculada al SHA-256 exacto de la entrega.
- Mejora el diagnóstico de macOS con un comando copiable para retirar la cuarentena de toda la aplicación y firma de forma ad hoc sus componentes internos.
- Amplía las explicaciones de errores de Python y añade recuperación visual si un proceso tarda en confirmar su terminación.
- Mantiene visible el acceso a una nueva versión en el editor una vez detectada y repite la comprobación de actualizaciones durante el día.

## 1.5.2 · Proyectos recientes y edición flexible

- Muestra hasta tres proyectos recientes en el inicio y los abre directamente, con su modo y datos de sesión, sin volver a pedir una carpeta.
- Permite copiar, cortar, pegar y arrastrar texto en Modo Tarea durante la edición.
- Describe el sello Ed25519 de forma precisa: comprueba la integridad de la entrega y conserva métricas de sesión como contexto para el docente.
- Comprueba que el inicio completo, incluida la lista de recientes, no se desborde en pantallas de 1280 × 600.

## 1.5.1 · Inicio ordenado y reanudación directa

- Reorganiza el inicio en una navegación vertical clara, amplía los campos de identificación y mueve las acciones secundarias a un menú de herramientas.
- Mantiene todos los controles accesibles en pantalla completa con escalado del sistema y distribuciones lógicas desde 1280 × 600.
- Restaura directamente la carpeta guardada al pulsar `Continuar`, sin volver a mostrar el selector del sistema.
- Detecta carpetas movidas o eliminadas y permite elegir otra sin dejar el inicio bloqueado.
- Mantiene la ventana principal maximizada cuando el sistema abandona la pantalla completa.

## 1.5.0 · Identidad oficial y revisión docente por grupo

- Incorpora la identidad oficial de codeGO al inicio, la aplicación y los instaladores, con una composición más clara y adaptable.
- Separa Tarea certificada del examen: elimina kiosk, vigilancia de foco, audio forzado y alertas; mantiene bloqueadas las acciones de copiar, cortar y pegar.
- Firma cada tarea con Ed25519 mediante una identidad local protegida y conserva la validación de archivos con SHA-256.
- Permite seleccionar o arrastrar todas las entregas de un grupo y señala archivos duplicados, código equivalente y similitud estructural para revisión docente.
- Acelera la baliza exclusiva de supervisión a una alternancia sólida roja y blanca de 0.7 segundos durante los 12 segundos reglamentarios.
- Renueva el inicio, los diálogos, el explorador, el editor y la consola con una jerarquía académica más clara y superficies sobrias.

## 1.4.2 · Rendimiento, supervisión precisa e identidad propia

- Evita alertas falsas al mover archivos o recuperar foco después de una operación interna.
- Registra una sola incidencia por salida real y mantiene las excepciones para ventanas gráficas de Python.
- Sustituye los comandos de audio bloqueantes por comprobaciones asíncronas y reduce su frecuencia.
- Conserva aceleración gráfica en Wayland/Hyprland con Vulkan desactivado y ofrece `CODEGO_SOFTWARE_RENDERING=1` como alternativa.
- Renueva el logotipo con una ruta circular, avance y un indicador de terminal propios de codeGO.
- Refuerza la señal docente con alternancia sólida roja y blanca durante 12 segundos, sin desenfoques ni sombras animadas costosas.

## 1.4.1 · Interfaz refinada y organización accesible

- Sustituye los iconos emoji del inicio, explorador y gestor de librerías por un sistema SVG y abreviaturas consistentes entre sistemas operativos.
- Mantiene la entrada de Python visible después de cambios de zoom o distribución y espera a que Chromium termine el ajuste antes de comprobar su geometría.
- Añade una acción accesible para mover archivos y carpetas, además del arrastre, con validación del destino y conservación de pestañas abiertas.
- Mejora nombres accesibles, foco de teclado y acciones del explorador.
- Incorpora un enlace secundario y discreto para apoyar el desarrollo desde la pantalla de inicio.

## 1.4.0 · Proyectos reales y explorador reorganizado

- El inicio exige abrir una carpeta existente o crear un proyecto vacío antes de entrar al editor; las sesiones nuevas ya no generan ni abren `main.py` automáticamente.
- Permite mover archivos y carpetas mediante arrastre, con soporte para subcarpetas, destino raíz, pestañas abiertas y movimientos entre volúmenes.
- Agrega un estado vacío claro al editor con acciones para crear el primer archivo o cambiar de carpeta.
- Conecta el gestor de librerías con el Python privado verificado de codeGO, admite instalación por nombre y muestra el progreso sin cerrar la ventana.
- Hace visible `Limpiar consola`, añade el atajo `Ctrl/Cmd + L` y conserva el estado de una ejecución activa al limpiar.
- Renueva logotipo, jerarquía, paleta, explorador, gestor de librerías y estados de foco con una presentación académica sobria y adaptable.
- Simplifica el nombre público de la aplicación a `codeGO` y conserva los créditos de zolvek.com.mx y Francisco López Velázquez.
- Amplía las pruebas nativas con movimientos de archivos, proyecto vacío, escalado hasta 180 % y ejecución interactiva real.

## 1.3.3 · Ventanas gráficas, ayuda de Python y experiencia de aula

- Inicia correctamente en Omarchy y otras sesiones Linux que exportan variables de desarrollo de Electron; el paquete limpia esas variables y conserva un registro técnico silencioso.
- Reduce avisos del sistema gráfico en Wayland y añade integración con Hyprland 0.55 o posterior para abrir Pygame, Tkinter, Turtle y otras ventanas gráficas en el espacio de trabajo activo.
- Libera temporalmente la pantalla para mostrar la ventana gráfica del programa y restaura la sesión protegida al terminar.
- Convierte las trazas de Python en explicaciones claras, detecta el archivo y la línea, la resalta y permite saltar directamente al código.
- Agrega pares automáticos de paréntesis, corchetes, llaves y comillas, borrado de pares, salto sobre cierres y sangría o desangría de bloques.
- Rediseña la preparación inicial con lenguaje para estudiantes y docentes, consejos rotativos, detalles técnicos plegados y una composición que funciona en pantallas pequeñas y con escalado alto.
- Sustituye colores, nombres y mensajes de estética técnica o lúdica por una interfaz académica sobria y mantiene los créditos de Zolvek y Francisco López Velázquez.
- Amplía las pruebas de producción con el arranque Linux bajo `ELECTRON_RUN_AS_NODE=1`, integración de ventanas de Hyprland, navegación a errores y edición asistida.

## 1.3.2 · Recuperación automática de la preparación

- Reintenta automáticamente la creación del entorno, cada librería y las micropruebas ante interrupciones transitorias.
- Reanuda desde los paquetes completados sin borrar el avance ni requerir internet.
- Agrega `Reconstruir entorno` como segunda ruta de reparación: sustituye únicamente Python y las librerías internas, conserva proyectos y entregas, y extrae dentro del perfil para evitar restricciones de directorios temporales.
- Mantiene visibles las acciones de recuperación en pantallas pequeñas y muestra diagnósticos estables cuando se agotan los intentos.

## 1.3.1 · Preparación compatible con particiones separadas

- Corrige `CG-SETUP-106` en Linux cuando `/tmp` y el perfil del usuario están en sistemas de archivos distintos.
- El runtime incluido usa una copia verificada hacia una ruta temporal del destino y una sustitución local segura cuando `rename` devuelve `EXDEV`.
- Conserva permisos ejecutables, enlaces simbólicos y marcas de tiempo del Python privado.

## 1.3.0 · Aula autónoma, ayuda y recursos

- Instaladores autosuficientes con Python 3.13, ruedas binarias y Visual C++ para Windows incluidos; la preparación inicial funciona sin internet.
- Verificación SHA-256 de todos los componentes internos antes de extraer o instalar.
- 28 librerías base; se agregan esptool, SMBus2 y GPIO Zero al soporte incluido de PySerial, PyFirmata2 y PyUSB.
- Diagnósticos `CG-SETUP` con causa, acciones y detalle técnico; el editor permanece bloqueado ante cualquier fallo.
- Ventana didáctica para errores frecuentes de Python con soluciones concretas y traceback original.
- Centro de ayuda con buscador para preparación, terminal, recursos, rutas portátiles, Arduino/ESP32, modos y atajos.
- Importación segura de imágenes, sonidos y datos a `recursos/`; el editor no interpreta ni guarda binarios como texto.
- Workflow de publicación idempotente: actualiza una Release existente y excluye evidencia interna de sus assets.

## 1.2.0 · Preparación automática verificada

- Primera apertura bloqueada hasta preparar un Python 3.13 aislado y completar el 100 % del proceso.
- Python 3.14 se rechaza para evitar compilaciones incompatibles de Pygame; en Windows se instala automáticamente Python 3.13.15 con firma y SHA-256 verificados.
- Runtime portátil automático para Linux y macOS cuando el equipo no tiene Python 3.12/3.13 compatible.
- 25 librerías con versiones fijas y ruedas binarias; instalación individual para identificar y reintentar fallos sin reiniciar todo el proceso.
- Micropruebas reales de cálculo, datos, gráficos, Pygame, Tk, Excel, SQLite, serial virtual, HTTP, cifrado e `input()` UTF-8.
- Validación limpia de primera apertura en CI para Windows, Ubuntu y macOS, además de la matriz nativa existente.

## 1.1.1 · Terminal integrada y pantallas con escalado

- Escritura directamente junto al prompt de Python, sin campo ni botón de envío separado.
- Ventana limitada al área útil del monitor; elimina el mínimo que recortaba el pie en pantallas escaladas.
- Pie del editor y créditos incluidos en las pruebas; comprobación del paquete con pantalla 1280 × 720 al 150 % y zoom hasta 180 %.
- 32 combinaciones de navegador y pruebas nativas con dos respuestas consecutivas.

## 1.1.0 · Vista previa pública

- Consola interactiva con entrada visible al cambiar tamaño y zoom; soporte de acentos y respuestas vacías.
- Guardado secuencial antes de ejecutar, entregar y cerrar normalmente.
- Modos Actividad y Examen separados, con créditos de Zolvek y Francisco López Velázquez.
- Validación de rutas e IPC, renderer aislado, comprobación del equipo y verificación SHA-256 de entregas.
- Restauración de las interfaces Wi-Fi modificadas, inicio de examen condicionado a desconexión comprobada y PIN sin valor predeterminado.
- Pruebas nativas en seis combinaciones de SO/Python y paquetes para Linux x64, Windows x64 y macOS Intel/Apple Silicon.
- Distribución pública sin certificados de desarrollador; firma y notarización de producción pendientes.
