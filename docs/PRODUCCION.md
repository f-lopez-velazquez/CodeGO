# Distribución y aceptación

## Descargas públicas

La Release `v1.2.0` contiene instaladores para Linux x64, Windows x64 y macOS Intel/Apple Silicon. No tiene certificados de desarrollador ni notarización de Apple. Windows puede mostrar SmartScreen y macOS puede impedir la apertura por sus políticas de seguridad. En equipos administrados consulta al responsable de TI; no desactives las protecciones del sistema.

La primera apertura bloquea el acceso mientras prepara un entorno aislado. Si no encuentra Python 3.12/3.13 de 64 bits, instala Python 3.13.15 para CodeGO sin modificar el Python del usuario. Después instala 25 librerías versionadas mediante ruedas binarias y ejecuta micropruebas; solo habilita la aplicación tras llegar al 100 %. Python 3.14 no se usa para este entorno porque algunas librerías educativas, entre ellas Pygame, aún pueden intentar compilarse desde código fuente.

## Producción firmada

El workflow `release.yml` exige matriz exitosa, URL HTTPS del acta de aceptación y secretos de firma: `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_CONTENT`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. Almacénalos exclusivamente como secretos de Actions del entorno `production`.

`npm run build:release` falla si faltan los certificados requeridos. Esta protección no se relaja para construir la vista previa. La publicación de una versión firmada debe incluir verificación de la firma del instalador y notarización de macOS.

## Aceptación en el aula

1. Instalar en equipos representativos y ejecutar la comprobación integrada, un programa con dos `input()` y las librerías usadas en clase.
2. Probar Actividad: ejecución, parada, proyectos, guardado/cierre, zoom y consola; sin Entregar ni modificación de Wi-Fi/audio.
3. Configurar un PIN de docente privado con `CODEGO_TEACHER_PIN` (mínimo ocho caracteres). Preparar permisos de administración de red.
4. Probar Examen: desconexión verificada, error seguro si falla, kiosk, incidencia de 12 segundos, excepciones gráficas legítimas y salida autorizada.
5. Verificar restauración de las interfaces modificadas y entrega ZIP con su checksum conservado por el docente.
6. Registrar versión, SHA-256 del instalador, SO, arquitectura, resultado y responsable antes de autorizar evaluaciones reales.

El modo examen necesita supervisión y políticas del sistema operativo. No es un sandbox para código Python y no controla todos los medios de conectividad.
