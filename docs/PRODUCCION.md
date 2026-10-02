# Distribución y aceptación

## Descargas públicas

La Release `v1.6.7` contiene instaladores autónomos para Linux x64, Windows x64 y macOS Intel/Apple Silicon. No tiene certificados comerciales ni notarización de Apple. Windows puede mostrar SmartScreen y macOS puede impedir la primera apertura. En macOS mueve la aplicación a `/Applications` y usa `xattr -dr com.apple.quarantine "/Applications/codeGO.app" && open "/Applications/codeGO.app"` si Gatekeeper conserva la cuarentena. En equipos administrados consulta al responsable de TI.

La primera apertura bloquea el acceso mientras extrae Python 3.13.15 y 28 librerías desde el propio instalador. Primero verifica tamaño y SHA-256 de cada archivo, después instala únicamente desde el almacén local y ejecuta micropruebas; solo habilita la aplicación tras llegar al 100 %. El proceso no modifica el Python del usuario y no necesita internet. Las operaciones transitorias se reintentan automáticamente; la preparación puede reanudarse conservando paquetes completos o reconstruirse en una ubicación alternativa dentro del perfil. Ambas rutas conservan proyectos y entregas. Si un componente falta, fue alterado o el sistema impide escribir, CodeGO muestra un diagnóstico y conserva el bloqueo.

Con la aplicación abierta, el proceso principal comprueba GitHub al inicio y cada 30 minutos aunque la ventana esté en segundo plano. Descarga el instalador compatible, exige el tamaño y digest SHA-256 publicados y pospone cualquier reinicio hasta que no exista sesión, preparación ni programa en ejecución. Windows ejecuta la actualización NSIS silenciosa; Linux sustituye el AppImage de usuario de forma atómica; macOS sustituye la aplicación desde el ZIP y usa `~/Applications` cuando `/Applications` no es escribible. Linux y macOS conservan temporalmente una copia `.previous` para recuperación. La comprobación no es un servicio del sistema cuando codeGO está cerrado.

## Producción firmada

El workflow `release.yml` exige matriz exitosa, construye el runtime y las ruedas en el sistema nativo, prueba el paquete y publica checksums y procedencia. Los certificados opcionales deben almacenarse exclusivamente como secretos de Actions del entorno `production`.

La publicación actual es verificable por SHA-256 pero no está firmada comercialmente. Una distribución firmada debe añadir verificación Authenticode del instalador y notarización de macOS.

## Aceptación en el aula

1. Instalar en equipos representativos y ejecutar la comprobación integrada, un programa con dos `input()` y las librerías usadas en clase.
2. Probar Actividad: ejecución, parada, proyectos, guardado/cierre, zoom y consola; sin Entregar ni modificación de Wi-Fi/audio.
3. El docente define y confirma un PIN de 4 a 12 dígitos antes de iniciar cada examen. En equipos administrados se puede imponer uno mediante el secreto `CODEGO_TEACHER_PIN`. Preparar permisos de administración de red.
4. Probar Examen: introducir el ID dictado, confirmar el archivo inicial vacío, desconexión verificada, kiosk, alarma hasta el regreso, espera posterior de 12 segundos, excepciones gráficas legítimas y salida autorizada.
5. Verificar restauración de las interfaces modificadas y entrega ZIP con su checksum conservado por el docente.
6. Registrar versión, SHA-256 del instalador, SO, arquitectura, resultado y responsable antes de autorizar evaluaciones reales.

El modo examen necesita supervisión y políticas del sistema operativo. Una aplicación ejecutada con permisos de usuario no puede impedir que un administrador del equipo termine su proceso ni emitir una alarma después de haber sido terminada. codeGO conserva un marcador local durante el examen y denuncia en el siguiente arranque cualquier cierre sin entrega o salida autorizada. No sustituye las cuentas restringidas, la administración del aula ni una política institucional de evaluación.
