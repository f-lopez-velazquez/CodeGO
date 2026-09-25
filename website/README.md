# Página de descarga

HTML y CSS nativos, sin compilación, dependencias de frontend, formularios ni credenciales. La captura corresponde a una ejecución de prueba con datos ficticios.

La carpeta `codego/` se publica en `https://zolvek.com.mx/productos/codego` y `https://zolvek-mx.web.app/codego/`. El dominio canónico es zolvek.com.mx. El sitio corporativo conserva sus demás rutas.

Para verla localmente, desde esta carpeta:

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080/codego/`. Los enlaces apuntan a archivos versionados de GitHub Releases: antes de cambiar una versión, publica y comprueba los ocho archivos y sus checksums. La página distingue la vista previa sin certificados de la distribución de producción firmada.

Validación visual: 320, 390, 768, 1024 y 1440 píxeles; sin desbordamiento horizontal, recursos cargados, enlaces de sección y preguntas desplegables operables con teclado. Los cuatro botones principales y cuatro alternativas se comprueban contra los activos publicados.
