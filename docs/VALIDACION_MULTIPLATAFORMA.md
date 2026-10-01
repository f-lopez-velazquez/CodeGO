# Compatibilidad comprobable

El flujo público [Verify CodeGO](https://github.com/f-lopez-velazquez/CodeGO/actions/workflows/verify.yml) verifica el código de cada revisión. El flujo [Build public preview installers](https://github.com/f-lopez-velazquez/CodeGO/actions/workflows/preview.yml) repite la matriz antes de generar las descargas.

| Entorno nativo | Arquitectura | Python |
| --- | --- | --- |
| Ubuntu 22.04 | x64 | 3.12 |
| Ubuntu 24.04 | x64 | 3.13 |
| Windows Server 2022 | x64 | 3.12 |
| Windows Server 2022 | x64 | 3.13 |
| macOS 14 | Apple Silicon / ARM64 | 3.12 |
| macOS 15 | Intel / x64 | 3.13 |

Cada trabajo ejecuta las pruebas unitarias/de integración, 32 combinaciones de navegador, Electron con Python real, auditoría de dependencias y 15 comprobaciones del paquete compilado. Otros tres trabajos reproducen una primera apertura limpia en Windows, Ubuntu y macOS. La construcción 1.6.6 genera además el runtime y almacén de 28 librerías en cada SO, los incorpora al instalador y vuelve a probar el paquete. Los artefactos conservan reportes JSON y capturas durante 30 días. La Release conserva checksums y procedencia.

Se comprobó además el paquete 1.1.0 en una VM local Windows 11 x64. La preparación automática 1.2.0 se verifica en los runners nativos indicados. Esa imagen de pruebas no es una certificación de todas las ediciones de Windows. Los registros de la VM se conservan fuera del repositorio público para no exponer rutas del equipo local.

## Lo que cubren las pruebas

Entrada `input()` con UTF-8, ejecuciones repetidas, geometría de la consola con diferentes tamaños/zoom, guardado, archivos, IPC, validación de rutas, comprobación del equipo y arranque del paquete nativo. El flujo de construcción verifica además la instalación silenciosa NSIS de Windows, el AppImage con extracción y ejecución en Linux y el DMG montado, copiado y desmontado en macOS. Estas pruebas no reproducen las advertencias de descarga del navegador, SmartScreen ni la aprobación de Gatekeeper. No automatizan todos los asistentes gráficos.

## Límites

Los runners no reproducen las políticas de cada escuela, tarjetas Wi-Fi, firmware, antivirus, audio, monitores múltiples ni ventanas de todas las librerías Python. Estos casos requieren aceptación en los equipos del aula. La compatibilidad corresponde a las versiones y arquitecturas indicadas; no existe una garantía universal para cualquier SO.

Android, iOS, ChromeOS, Windows ARM y Linux ARM no tienen instaladores validados en esta versión.

## Preparación autónoma 1.6.6

CodeGO usa un Python 3.13.15 privado incluido en cada instalador. Antes de extraerlo verifica el manifiesto y SHA-256 de todos los componentes; instala 28 librerías solo desde ruedas locales, ejecuta `pip check` y supera micropruebas de Pygame, Tk, imágenes, gráficas, cálculo, datos, Excel, SQLite, recursos binarios relativos, serial virtual, HTTP, cifrado y entrada UTF-8. La creación del entorno, cada paquete y las micropruebas tienen reintentos acotados. Después de agotar la recuperación automática, la interfaz ofrece reanudar desde lo completado o reconstruir el runtime dentro del perfil para evitar montajes temporales y restos incompletos.

## Actualización y publicación autónomas 1.6.6

La publicación se considera aprobada cuando los cuatro sistemas de construcción terminan correctamente; cada instalador indica su commit de origen en los archivos `provenance-*.json` de la Release. La ejecución exacta queda enlazada desde la Release y el historial público de Actions. Las pruebas unitarias simulan la sustitución con copia anterior en Linux, el instalador silencioso en Windows y la extracción y sustitución del paquete en macOS. El inicio real se comprueba también en Hyprland para confirmar que la ventana no alterna entre tamaños al negociar la pantalla completa.

En Omarchy/Hyprland se reprodujo la oscilación cuando coexistían dos procesos de codeGO que intentaban ocupar la pantalla completa. La versión 1.6.6 adquiere un bloqueo de instancia única: una segunda apertura entrega el foco a la ventana existente y termina sin crear otra superficie. El AppImage se validó además con los dos monitores y factores de escala del equipo de prueba; la evidencia resumida está en [`verification/hyprland-1.6.6.json`](verification/hyprland-1.6.6.json).

## Regresión 1.1.1: pantalla e input integrado

El mínimo anterior de 1024 × 700 píxeles lógicos podía exceder pantallas con escalado del SO. Ahora el tamaño inicial se limita al área útil y el mínimo se reduce. Se comprueban los límites de la ventana contra los de la pantalla, además del pie del editor y los créditos; no basta con medir la entrada contra `innerHeight`.

La entrada se dibuja junto al prompt dentro de la salida y comparte su desplazamiento. Se comprueban respuestas consecutivas, vacías y con acentos, foco, limpiar durante la ejecución y escritura en la misma línea del prompt. El paquete Linux se ejecuta además con pantalla 1280 × 720 y escalado nativo 150 % (854 × 480 píxeles lógicos), con zoom de interfaz hasta 180 %.

[Validación y nuevos instaladores 1.1.1](https://github.com/f-lopez-velazquez/CodeGO/actions/runs/36187008301).
