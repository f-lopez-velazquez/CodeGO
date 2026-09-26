const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell } = require('electron');

/**
 * Parsea una versión semver limpia [major, minor, patch].
 */
function parseSemver(v) {
  if (!v || typeof v !== 'string') return [0, 0, 0];
  const cleaned = v.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

/**
 * Determina si la versión remota es estrictamente más nueva que la local.
 */
function isNewerVersion(current, remote) {
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [rMaj, rMin, rPat] = parseSemver(remote);
  if (rMaj > cMaj) return true;
  if (rMaj < cMaj) return false;
  if (rMin > cMin) return true;
  if (rMin < cMin) return false;
  return rPat > cPat;
}

/**
 * Encuentra el asset instalable correspondiente al sistema operativo y arquitectura.
 */
function findMatchingAsset(assets, platform = process.platform, arch = process.arch) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  if (platform === 'win32') {
    // Preferir instalador setup x64 sobre versión portable
    return assets.find(a => a.name.includes('-setup-') && a.name.endsWith('.exe')) ||
           assets.find(a => a.name.endsWith('.exe')) || null;
  }

  if (platform === 'linux') {
    // Preferir AppImage x86_64
    return assets.find(a => a.name.includes('linux-x86_64') && a.name.endsWith('.AppImage')) ||
           assets.find(a => a.name.endsWith('.AppImage')) ||
           assets.find(a => a.name.includes('linux') && a.name.endsWith('.tar.gz')) || null;
  }

  if (platform === 'darwin') {
    // Preferir DMG si existe, o ZIP
    return assets.find(a => a.name.endsWith('.dmg')) ||
           assets.find(a => a.name.includes('mac') && a.name.endsWith('.zip')) || null;
  }

  return null;
}

/**
 * Consulta la API de GitHub Releases para la última versión publicada.
 */
function checkForUpdates({
  currentVersion = '1.0.0',
  repoOwner = 'f-lopez-velazquez',
  repoName = 'CodeGO',
  timeoutMs = 7000
} = {}) {
  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
    const req = https.get(url, {
      headers: {
        'User-Agent': `CodeGO-ExamGuard/${currentVersion}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return resolve({
            success: false,
            hasUpdate: false,
            currentVersion,
            error: `GitHub API respondió con código ${res.statusCode}`
          });
        }

        try {
          const release = JSON.parse(data);
          const rawTag = release.tag_name || '';
          const latestVersion = rawTag.replace(/^v/i, '');
          const hasUpdate = isNewerVersion(currentVersion, latestVersion);
          const matchingAsset = findMatchingAsset(release.assets || []);

          resolve({
            success: true,
            hasUpdate,
            currentVersion,
            latestVersion,
            releaseName: release.name || `Versión ${rawTag}`,
            releaseNotes: release.body || '',
            releaseUrl: release.html_url || `https://github.com/${repoOwner}/${repoName}/releases/latest`,
            publishedAt: release.published_at,
            asset: matchingAsset ? {
              name: matchingAsset.name,
              downloadUrl: matchingAsset.browser_download_url,
              sizeBytes: matchingAsset.size
            } : null
          });
        } catch (e) {
          resolve({
            success: false,
            hasUpdate: false,
            currentVersion,
            error: `Error al procesar respuesta de GitHub: ${e.message}`
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        hasUpdate: false,
        currentVersion,
        error: `Error de red: ${err.message}`
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({
        success: false,
        hasUpdate: false,
        currentVersion,
        error: 'Tiempo de espera agotado al consultar actualizaciones.'
      });
    });
  });
}

/**
 * Descarga el archivo de actualización con seguimiento de redirecciones y reporte de progreso.
 */
function downloadAssetWithProgress(downloadUrl, destPath, onProgress, maxSizeBytes = 500 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 10) {
        return reject(new Error('Demasiadas redirecciones HTTP al descargar actualización.'));
      }
      if (!currentUrl.startsWith('https://')) {
        return reject(new Error('La descarga requiere HTTPS.'));
      }

      const req = https.get(currentUrl, {
        headers: {
          'User-Agent': 'CodeGO-ExamGuard-Updater'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const urlObj = new URL(currentUrl);
            nextUrl = new URL(nextUrl, urlObj).href;
          }
          res.resume();
          return get(nextUrl, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Error HTTP al descargar: ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxSizeBytes) {
            req.destroy(new Error(`La descarga superó el límite máximo de ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`));
          }
          if (onProgress) {
            const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
            onProgress({
              percent,
              downloadedBytes,
              totalBytes
            });
          }
        });

        res.pipe(fileStream);

        res.on('error', (err) => {
          fileStream.destroy();
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });

        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destPath));
        });

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });
      });

      req.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });

      req.setTimeout(60000, () => {
        req.destroy(new Error('La conexión de descarga se interrumpió por inactividad.'));
      });
    }

    get(downloadUrl);
  });
}

/**
 * Ejecuta o aplica el instalador descargado según el sistema operativo.
 */
function launchInstaller(filePath, platform = process.platform) {
  if (!fs.existsSync(filePath)) {
    throw new Error('El instalador no existe en la ruta especificada.');
  }

  if (platform === 'win32') {
    // Windows: Ejecutar el instalador setup.exe y salir
    const child = spawn(filePath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { success: true, action: 'restarting' };
  }

  if (platform === 'linux') {
    // Asignar permisos de ejecución al archivo
    fs.chmodSync(filePath, 0o755);

    // Si estamos ejecutando desde un AppImage, lanzar el nuevo y salir
    if (process.env.APPIMAGE) {
      const child = spawn(filePath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return { success: true, action: 'restarting' };
    }

    // Si es modo desarrollo o paquete sin AppImage env, abrir la carpeta contenedora
    shell.showItemInFolder(filePath);
    return { success: true, action: 'downloaded', path: filePath };
  }

  if (platform === 'darwin') {
    // macOS: Abrir el archivo (.dmg o .zip) para que el usuario o el sistema proceda
    shell.openPath(filePath);
    return { success: true, action: 'opened', path: filePath };
  }

  return { success: true, action: 'unknown' };
}

module.exports = {
  parseSemver,
  isNewerVersion,
  findMatchingAsset,
  checkForUpdates,
  downloadAssetWithProgress,
  launchInstaller
};
