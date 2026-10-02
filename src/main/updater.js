const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const electron = require('electron');
const shell = electron && typeof electron === 'object' ? electron.shell : null;

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
    return assets.find(a => /linux-(x64|x86_64)/.test(a.name) && a.name.endsWith('.AppImage')) ||
           assets.find(a => a.name.endsWith('.AppImage')) ||
           assets.find(a => a.name.includes('linux') && a.name.endsWith('.tar.gz')) || null;
  }

  if (platform === 'darwin') {
    const target = arch === 'arm64' ? 'arm64' : 'x64';
    // ZIP can be staged and replaced automatically. A DMG always requires a
    // manual Finder flow, so it remains only as a compatibility fallback.
    return assets.find(a => a.name.includes(`mac-${target}`) && a.name.endsWith('.zip')) ||
           assets.find(a => a.name.includes(`mac-${target}`) && a.name.endsWith('.dmg')) || null;
  }

  return null;
}

function findAppPatchAsset(assets) {
  if (!Array.isArray(assets)) return null;
  return assets.find(asset => /^CodeGO-[0-9A-Za-z._-]+-app\.asar$/.test(String(asset?.name || ''))) || null;
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
          const releaseAssets = release.assets || [];
          const nativeAsset = findMatchingAsset(releaseAssets);
          const appPatchAsset = findAppPatchAsset(releaseAssets);
          const matchingAsset = appPatchAsset || nativeAsset;

          const assetRecord = asset => asset ? {
            name: asset.name,
            downloadUrl: asset.browser_download_url,
            sizeBytes: asset.size,
            digest: asset.digest || null,
            kind: asset === appPatchAsset ? 'app-patch' : 'native-installer'
          } : null;

          resolve({
            success: true,
            hasUpdate,
            currentVersion,
            latestVersion,
            releaseName: release.name || `Versión ${rawTag}`,
            releaseNotes: release.body || '',
            releaseUrl: release.html_url || `https://github.com/${repoOwner}/${repoName}/releases/latest`,
            publishedAt: release.published_at,
            asset: assetRecord(matchingAsset),
            fallbackAsset: matchingAsset === appPatchAsset ? assetRecord(nativeAsset) : null
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
function normalizeDigest(value) {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(String(value || '').trim());
  return match ? match[1].toLowerCase() : null;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyDownloadedAsset(filePath, { digest = null, sizeBytes = 0 } = {}) {
  if (!fs.existsSync(filePath)) throw new Error('La actualización descargada no existe.');
  const actualSize = fs.statSync(filePath).size;
  if (sizeBytes > 0 && actualSize !== Number(sizeBytes)) {
    throw new Error(`La actualización está incompleta (${actualSize} de ${sizeBytes} bytes).`);
  }
  const expectedHash = normalizeDigest(digest);
  const actualHash = sha256File(filePath);
  if (expectedHash && actualHash !== expectedHash) {
    throw new Error('La actualización no coincide con la firma SHA-256 publicada.');
  }
  return { success: true, sizeBytes: actualSize, sha256: actualHash };
}

function removePartialDownload(filePath) {
  try { fs.unlinkSync(filePath); } catch (_) {}
}

function downloadAssetAttempt(downloadUrl, destPath, onProgress, options = {}) {
  const maxSizeBytes = options.maxSizeBytes || 1024 * 1024 * 1024;
  const request = options.request || https.get;
  const timeoutMs = options.timeoutMs || 60000;
  let lastProgressPercent = -1;
  let lastProgressAt = 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    let fileStream = null;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      fileStream?.destroy();
      removePartialDownload(destPath);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 10) return fail(new Error('Demasiadas redirecciones HTTP al descargar actualización.'));
      if (!currentUrl.startsWith('https://')) return fail(new Error('La descarga requiere HTTPS.'));

      let req;
      try {
        req = request(currentUrl, {
          headers: { 'User-Agent': 'CodeGO-ExamGuard-Updater' }
        }, (res) => {
          if (settled) {
            res.resume?.();
            return;
          }
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).href;
            res.resume();
            get(nextUrl, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            fail(new Error(`Error HTTP al descargar: ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          if (totalBytes > maxSizeBytes) {
            res.resume();
            fail(new Error(`La actualización supera el límite de ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`));
            return;
          }

          let downloadedBytes = 0;
          fileStream = fs.createWriteStream(destPath, { flags: 'w' });
          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (downloadedBytes > maxSizeBytes) {
              req.destroy(new Error(`La descarga superó el límite máximo de ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`));
              return;
            }
            if (!onProgress) return;
            const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
            const now = Date.now();
            if (percent !== lastProgressPercent || now - lastProgressAt >= 500) {
              lastProgressPercent = percent;
              lastProgressAt = now;
              onProgress({ percent, downloadedBytes, totalBytes });
            }
          });
          res.once('aborted', () => fail(new Error('La conexión cerró la descarga antes de completarla.')));
          res.once('error', fail);
          fileStream.once('error', fail);
          fileStream.once('finish', () => {
            fileStream.close(() => {
              if (settled) return;
              try {
                verifyDownloadedAsset(destPath, options);
                settled = true;
                resolve(destPath);
              } catch (error) {
                fail(error);
              }
            });
          });
          res.pipe(fileStream);
        });
      } catch (error) {
        fail(error);
        return;
      }

      req.once('error', fail);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('La conexión de descarga se interrumpió por inactividad.'));
      });
    }

    get(downloadUrl);
  });
}

function shouldRetryDownload(error) {
  const message = String(error?.message || error);
  if (/requiere HTTPS|Demasiadas redirecciones|supera el límite/i.test(message)) return false;
  if (/Error HTTP.*\b(400|401|403|404|405|410|422)\b/i.test(message)) return false;
  return true;
}

async function downloadAssetWithProgress(downloadUrl, destPath, onProgress, options = {}) {
  if (typeof options === 'number') options = { maxSizeBytes: options };
  const maxAttempts = Math.max(1, Math.min(5, Number(options.maxAttempts) || 3));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 700);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    removePartialDownload(destPath);
    if (onProgress) onProgress({
      percent: 0,
      downloadedBytes: 0,
      totalBytes: Number(options.sizeBytes) || 0,
      attempt,
      maxAttempts,
      retrying: attempt > 1
    });
    try {
      return await downloadAssetAttempt(downloadUrl, destPath, onProgress, options);
    } catch (error) {
      lastError = error;
      removePartialDownload(destPath);
      if (attempt >= maxAttempts || !shouldRetryDownload(error)) break;
      if (onProgress) onProgress({
        percent: 0,
        downloadedBytes: 0,
        totalBytes: Number(options.sizeBytes) || 0,
        attempt: attempt + 1,
        maxAttempts,
        retrying: true,
        retryReason: error.message
      });
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  const suffix = maxAttempts > 1 && shouldRetryDownload(lastError)
    ? ` Se intentó descargar ${maxAttempts} veces sin modificar la instalación actual.`
    : '';
  throw new Error(`${lastError?.message || 'No se pudo descargar la actualización.'}${suffix}`);
}

/**
 * Sustituye un ejecutable de forma atómica y conserva una copia recuperable.
 */
function replaceFileAtomically(sourcePath, targetPath, mode = 0o755) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const stagedPath = `${targetPath}.update`;
  const backupPath = `${targetPath}.previous`;
  try { fs.unlinkSync(stagedPath); } catch (_) {}
  fs.copyFileSync(sourcePath, stagedPath);
  fs.chmodSync(stagedPath, mode);
  try { fs.unlinkSync(backupPath); } catch (_) {}
  let hadPrevious = false;
  try {
    if (fs.existsSync(targetPath)) {
      fs.renameSync(targetPath, backupPath);
      hadPrevious = true;
    }
    fs.renameSync(stagedPath, targetPath);
  } catch (error) {
    try { fs.unlinkSync(stagedPath); } catch (_) {}
    if (hadPrevious && !fs.existsSync(targetPath) && fs.existsSync(backupPath)) {
      try { fs.renameSync(backupPath, targetPath); } catch (_) {}
    }
    throw error;
  }
  return { targetPath, backupPath: hadPrevious ? backupPath : null };
}

function writeLinuxDesktopEntry(targetPath, homeDirectory, iconPath = '') {
  const applications = path.join(homeDirectory, '.local', 'share', 'applications');
  fs.mkdirSync(applications, { recursive: true });
  // Keep the launcher name used by the Linux installer. Reusing it prevents a
  // second codeGO entry from appearing after the first automatic update.
  const entryPath = path.join(applications, 'codego-examguard.desktop');
  const iconLine = iconPath && fs.existsSync(iconPath) ? `Icon=${iconPath}\n` : '';
  fs.writeFileSync(entryPath, [
    '[Desktop Entry]',
    'Type=Application',
    'Name=codeGO',
    'Comment=Entorno educativo de programación',
    `Exec=${targetPath}`,
    iconLine.trimEnd(),
    'Terminal=false',
    'Categories=Education;Development;IDE;',
    ''
  ].filter(Boolean).join('\n'));
  try { fs.chmodSync(entryPath, 0o755); } catch (_) {}
}

function writableLinuxTarget(preferredTarget, homeDirectory) {
  const userTarget = path.join(homeDirectory, '.local', 'bin', 'codego');
  if (!preferredTarget) return userTarget;
  try {
    const parent = path.dirname(preferredTarget);
    fs.mkdirSync(parent, { recursive: true });
    fs.accessSync(parent, fs.constants.W_OK);
    if (fs.existsSync(preferredTarget)) fs.accessSync(preferredTarget, fs.constants.W_OK);
    return preferredTarget;
  } catch (_) {
    return userTarget;
  }
}

function resolveMacBundle(executablePath) {
  let cursor = path.resolve(executablePath || process.execPath);
  while (cursor !== path.dirname(cursor)) {
    if (cursor.toLowerCase().endsWith('.app')) return cursor;
    cursor = path.dirname(cursor);
  }
  return null;
}

function firstAppBundle(directory) {
  const pending = [directory];
  while (pending.length) {
    const current = pending.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory() && entry.name.toLowerCase().endsWith('.app')) return candidate;
      if (entry.isDirectory()) pending.push(candidate);
    }
  }
  return null;
}

/**
 * Aplica el instalador descargado según el sistema operativo.
 * Las dependencias se pueden inyectar para probar el flujo sin abrir procesos.
 */
function launchInstaller(filePath, platform = process.platform, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error('El instalador no existe en la ruta especificada.');
  }

  const spawnProcess = options.spawnProcess || spawn;
  const executeSync = options.execFileSync || execFileSync;
  const homeDirectory = options.homeDirectory || os.homedir();

  if (platform === 'win32') {
    // NSIS acepta /S para actualizar la instalación del usuario sin asistentes.
    const child = spawnProcess(filePath, ['/S'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    return { success: true, action: 'restarting', automatic: true };
  }

  if (platform === 'linux') {
    const preferredTarget = options.appImagePath || process.env.APPIMAGE;
    // A system-wide AppImage can be read-only for the student. In that case
    // install the verified update in the user profile and point the launcher
    // there, without requesting administrator privileges.
    const targetPath = writableLinuxTarget(preferredTarget, homeDirectory);
    replaceFileAtomically(filePath, targetPath);
    writeLinuxDesktopEntry(targetPath, homeDirectory, options.iconPath);
    const child = spawnProcess(targetPath, ['--updated'], { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true, action: 'restarting', automatic: true, path: targetPath };
  }

  if (platform === 'darwin') {
    if (!filePath.toLowerCase().endsWith('.zip')) {
      if (shell?.openPath) shell.openPath(filePath);
      return { success: true, action: 'opened', automatic: false, path: filePath };
    }
    const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-mac-update-'));
    executeSync('/usr/bin/ditto', ['-x', '-k', filePath, extractionRoot], { stdio: 'ignore' });
    const extractedBundle = firstAppBundle(extractionRoot);
    if (!extractedBundle) throw new Error('El paquete de macOS no contiene codeGO.app.');

    const currentBundle = resolveMacBundle(options.currentExecutable || process.execPath);
    let targetBundle = currentBundle;
    if (!targetBundle) targetBundle = path.join(homeDirectory, 'Applications', 'codeGO.app');
    try {
      fs.accessSync(path.dirname(targetBundle), fs.constants.W_OK);
    } catch (_) {
      targetBundle = path.join(homeDirectory, 'Applications', 'codeGO.app');
    }
    fs.mkdirSync(path.dirname(targetBundle), { recursive: true });
    const backupBundle = `${targetBundle}.previous`;
    const stagedBundle = `${targetBundle}.update`;
    try { fs.rmSync(backupBundle, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(stagedBundle, { recursive: true, force: true }); } catch (_) {}
    fs.cpSync(extractedBundle, stagedBundle, { recursive: true, preserveTimestamps: true });
    if (fs.existsSync(targetBundle)) fs.renameSync(targetBundle, backupBundle);
    try {
      fs.renameSync(stagedBundle, targetBundle);
    } catch (error) {
      try { fs.rmSync(stagedBundle, { recursive: true, force: true }); } catch (_) {}
      if (!fs.existsSync(targetBundle) && fs.existsSync(backupBundle)) fs.renameSync(backupBundle, targetBundle);
      throw error;
    }
    try { fs.rmSync(extractionRoot, { recursive: true, force: true }); } catch (_) {}
    const child = spawnProcess('/usr/bin/open', ['-n', targetBundle], { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true, action: 'restarting', automatic: true, path: targetBundle };
  }

  return { success: true, action: 'unknown' };
}

module.exports = {
  parseSemver,
  isNewerVersion,
  findMatchingAsset,
  findAppPatchAsset,
  checkForUpdates,
  downloadAssetWithProgress,
  normalizeDigest,
  sha256File,
  verifyDownloadedAsset,
  replaceFileAtomically,
  writableLinuxTarget,
  resolveMacBundle,
  launchInstaller
};
