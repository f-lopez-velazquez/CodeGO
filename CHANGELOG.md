# Cambios

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
