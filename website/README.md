# Página de descarga

HTML y CSS nativos, sin compilación, dependencias de frontend, formularios ni credenciales. La captura corresponde a una ejecución de prueba con datos ficticios.

La carpeta `codego/` se publica en `https://zolvek.com.mx/productos/codego` y `https://zolvek.web.app/productos/codego`. El dominio canónico es zolvek.com.mx. El sitio corporativo conserva sus demás rutas.

Para verla localmente, desde esta carpeta:

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080/codego/`. Los enlaces apuntan a archivos versionados de GitHub Releases: antes de cambiar una versión, publica y comprueba los ocho archivos y sus checksums. La página distingue la vista previa sin certificados de la distribución de producción firmada.

Validación visual: 320, 390, 768, 1024 y 1440 píxeles; sin desbordamiento horizontal, recursos cargados, enlaces de sección y preguntas desplegables operables con teclado. Los enlaces de descarga se comprueban contra los activos publicados.

La subcarpeta `codego/webapp/` contiene la app autenticada. Su fuente canónica es `../webapp/`; se sincroniza con `node scripts/sync-webapp.cjs`. La app independiente se publica también en https://codego-python.web.app mediante el `firebase.json` de la raíz. El sitio de descarga conserva su hosting anterior.
