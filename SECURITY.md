# Seguridad

Si encuentras una vulnerabilidad, utiliza **Report a vulnerability** en la pestaña Security de este repositorio. No publiques credenciales, expedientes de estudiantes, PIN de docente ni archivos de evaluación en issues públicos.

La versión mantenida es 1.1.x. Las correcciones se documentan en CHANGELOG.md.

## Alcance

CodeGO aísla su renderer, valida IPC y restringe rutas del proyecto. El código Python se ejecuta con los permisos del usuario del sistema; no está aislado en una máquina virtual. Kiosk y el control de Wi-Fi son medidas de supervisión, no una frontera de seguridad del sistema operativo. Ethernet, redes móviles y dispositivos externos requieren políticas propias del aula.

Los archivos ZIP de entrega contienen código y bitácora. Sus hashes permiten detectar cambios respecto a una copia confiable del checksum; no cifran los datos ni constituyen una firma del estudiante.

La vista previa pública no tiene certificado de desarrollador de Windows ni firma Developer ID y notarización de Apple. La ruta de producción firmada permanece separada y exige sus certificados. Nunca incluyas claves de firma en el repositorio.
