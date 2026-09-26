#!/usr/bin/env node
/**
 * publish-release.cjs
 * Publica los instaladores de v1.0.0 en GitHub Releases usando gh CLI.
 * Uso: node scripts/publish-release.cjs [--dry-run]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const VERSION = '1.0.0';
const TAG = `v${VERSION}`;
const DIST = path.join(__dirname, '..', 'dist');
const DRY_RUN = process.argv.includes('--dry-run');

const RELEASE_NOTES = `# CodeGO ExamGuard v${VERSION} — Versión Oficial

## ¿Qué es CodeGO ExamGuard?
Entorno educativo de Python multiplataforma con tres modos especializados:

- **🛡️ Modo Examen Blindado**: Kiosk, desconexión Wi-Fi, alerta estroboscópica de 12 s, entrega ZIP con sello SHA-256.
- **📦 Modo Tarea Certificada**: Bloqueo de copia/pegado, telemetría forense, entrega \`.codego\` firmada con HMAC-SHA256.
- **📘 Modo Actividad Libre**: Editor completo con árbol jerárquico de carpetas y consola interactiva.

## Novedades en v${VERSION}
- ✅ Instaladores oficiales para Windows, macOS y Linux
- ✅ Python y todas las dependencias se instalan automáticamente al primer inicio
- ✅ Soporte para hardware: Arduino, ESP32, Raspberry Pi (pyserial, smbus2, etc.)
- ✅ Árbol de carpetas jerárquico mejorado con navegación por subcarpetas
- ✅ Sistema de Modo Tarea Certificada (.codego) con HMAC-SHA256
- ✅ Anti-trampas mejorado: alerta estroboscópica visible a distancia
- ✅ Auto-guardado, resolución dinámica y soporte multimonitor
- ✅ Consola interactiva con \`input()\` en línea

## Instalación
### Windows
Descarga \`CodeGO-${VERSION}-setup-x64.exe\` y ejecuta como administrador.

### macOS
Descarga \`CodeGO-${VERSION}-mac-x64.zip\`, descomprime y arrastra a Aplicaciones.

### Linux
\`\`\`bash
chmod +x CodeGO-${VERSION}-linux-x86_64.AppImage
./CodeGO-${VERSION}-linux-x86_64.AppImage
\`\`\`

## Checksums SHA-256
Ver \`SHA256SUMS.txt\` adjunto.

---
© 2026 Francisco López Velázquez · [zolvek.com.mx](https://zolvek.com.mx)
`;

// Files to upload
const ASSETS = [
  // Linux
  `CodeGO-${VERSION}-linux-x86_64.AppImage`,
  `CodeGO-${VERSION}-linux-x64.tar.gz`,
  // Windows
  `CodeGO-${VERSION}-setup-x64.exe`,
  `CodeGO-${VERSION}-portable-x64.exe`,
  // macOS
  `CodeGO-${VERSION}-mac-x64.zip`,
].filter(name => {
  const full = path.join(DIST, name);
  const exists = fs.existsSync(full);
  if (!exists) console.warn(`⚠ Not found (skipping): ${name}`);
  return exists;
});

function run(cmd) {
  console.log(`▶ ${cmd}`);
  if (!DRY_RUN) {
    try {
      return execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } catch (e) {
      console.error(`✗ Command failed: ${e.message}`);
      process.exit(1);
    }
  }
}

async function main() {
  console.log(`\n🚀 CodeGO ExamGuard — Publicando ${TAG} en GitHub Releases\n`);
  if (DRY_RUN) console.log('📋 DRY RUN — no se ejecutarán comandos reales\n');

  // Generate SHA256 checksums
  console.log('📝 Generando SHA256SUMS.txt...');
  const sha256lines = ASSETS.map(name => {
    try {
      const hash = execSync(`sha256sum "${path.join(DIST, name)}"`, { encoding: 'utf8' });
      return hash.replace(path.join(DIST, '') + '/', '').trim();
    } catch {
      return `(error) ${name}`;
    }
  });
  const sha256path = path.join(DIST, 'SHA256SUMS.txt');
  if (!DRY_RUN) fs.writeFileSync(sha256path, sha256lines.join('\n') + '\n');
  console.log('SHA256SUMS.txt generado');
  ASSETS.push('SHA256SUMS.txt');

  // Check if release already exists
  try {
    const existing = execSync(`gh release view ${TAG} --json tagName 2>/dev/null`, { encoding: 'utf8' });
    if (existing) {
      console.log(`⚠ El release ${TAG} ya existe. Se subirán/actualizarán los assets.`);
      // Upload assets to existing release
      for (const name of ASSETS) {
        const full = path.join(DIST, name);
        if (fs.existsSync(full)) {
          run(`gh release upload ${TAG} "${full}" --clobber`);
        }
      }
      console.log(`\n✅ Assets actualizados en: https://github.com/f-lopez-velazquez/CodeGO/releases/tag/${TAG}`);
      return;
    }
  } catch (_) {
    // Release doesn't exist, create it
  }

  // Write release notes to temp file
  const notesPath = '/tmp/codego-release-notes.md';
  if (!DRY_RUN) fs.writeFileSync(notesPath, RELEASE_NOTES);

  // Create release
  const assetsArgs = ASSETS.map(name => `"${path.join(DIST, name)}"`).join(' ');
  run(`gh release create ${TAG} ${assetsArgs} --title "CodeGO ExamGuard v${VERSION} — Versión Oficial" --notes-file "${notesPath}" --latest`);

  console.log(`\n✅ Release publicado: https://github.com/f-lopez-velazquez/CodeGO/releases/tag/${TAG}`);
}

main().catch(err => { console.error(err); process.exit(1); });
