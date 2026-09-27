# Cambios

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
