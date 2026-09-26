const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const CODEGO_HMAC_SECRET = 'CodeGO-Certified-Academic-Integrity-v1.2-Zolvek-FranciscoLopezVelazquez';

function signManifest(data) {
  const hmac = crypto.createHmac('sha256', CODEGO_HMAC_SECRET);
  hmac.update(typeof data === 'string' ? data : JSON.stringify(data));
  return hmac.digest('hex');
}

function verifyManifestSignature(data, signature) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = signManifest(data);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

function generateTeacherHtmlCertificate({ student, manifest, files }) {
  const safeStr = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tel = manifest.telemetria || {};
  const dateFormatted = new Date(manifest.fechaEntrega || Date.now()).toLocaleString('es-MX', { timeZoneName: 'short' });
  const activeMinutes = Math.round((tel.activeTypingSeconds || 0) / 60);

  const filesHtml = files.map(f => `
    <div style="margin-top:16px;border:1px solid #2d3748;border-radius:8px;overflow:hidden;">
      <div style="background:#1a202c;padding:8px 12px;font-family:monospace;font-size:12px;color:#90cdf4;display:flex;justify-content:space-between;">
        <span>📄 ${safeStr(f.path)}</span>
        <span>SHA-256: ${safeStr(f.sha256.substring(0, 16))}... (${f.size} B)</span>
      </div>
      <pre style="margin:0;padding:12px;background:#0d1117;color:#e2e8f0;font-size:12px;overflow-x:auto;max-height:360px;"><code>${safeStr(f.content)}</code></pre>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Certificado Oficial de Tarea CodeGO — ${safeStr(student.name || 'Estudiante')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #080b12; color: #e2e8f0; margin: 0; padding: 24px; line-height: 1.5; }
    .card { max-width: 860px; margin: 0 auto; background: #0f1422; border: 1px solid #2b354f; border-radius: 14px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; background: rgba(56, 161, 105, 0.15); border: 1px solid #38a169; color: #48bb78; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin: 20px 0; }
    .meta-box { background: #171e31; border: 1px solid #232d47; border-radius: 8px; padding: 12px; }
    .meta-label { font-size: 11px; text-transform: uppercase; color: #a0aec0; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-val { font-size: 15px; font-weight: 600; color: #fff; }
    .metric-ok { color: #48bb78; }
    .metric-warn { color: #f56565; }
    .footer { margin-top: 32px; font-size: 11px; color: #718096; text-align: center; border-top: 1px solid #232d47; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h1 style="margin:0;font-size:22px;color:#fff;">Certificado de Autenticidad de Tarea</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#a0aec0;">CodeGO Certified Academic Task · zolvek.com.mx</p>
      </div>
      <div class="badge">✓ FIRMA DIGITAL CODEGO VÁLIDA</div>
    </div>

    <div class="meta-grid">
      <div class="meta-box"><div class="meta-label">Estudiante</div><div class="meta-val">${safeStr(student.name || 'Sin nombre')}</div></div>
      <div class="meta-box"><div class="meta-label">Matrícula / ID</div><div class="meta-val">${safeStr(student.id || 'N/A')}</div></div>
      <div class="meta-box"><div class="meta-label">Materia / Actividad</div><div class="meta-val">${safeStr(student.subject || 'Tarea Python')}</div></div>
      <div class="meta-box"><div class="meta-label">Fecha y Hora</div><div class="meta-val">${safeStr(dateFormatted)}</div></div>
    </div>

    <h3 style="margin-top:24px;margin-bottom:12px;font-size:15px;color:#90cdf4;">Auditoría Forense de Autoría & Integridad</h3>
    <div class="meta-grid">
      <div class="meta-box"><div class="meta-label">Pulsaciones de Tecla</div><div class="meta-val metric-ok">${tel.keystrokesCount || 0} pulsaciones</div></div>
      <div class="meta-box"><div class="meta-label">Pegados Externos</div><div class="meta-val ${(tel.externalPasteAttempts || 0) === 0 ? 'metric-ok' : 'metric-warn'}">${tel.externalPasteAttempts || 0} (100% Escrito en CodeGO)</div></div>
      <div class="meta-box"><div class="meta-label">Tiempo Activo de Edición</div><div class="meta-val">${activeMinutes} min (${tel.activeTypingSeconds || 0}s)</div></div>
      <div class="meta-box"><div class="meta-label">Ejecuciones de Prueba</div><div class="meta-val">${tel.runsCount || 0} ejecuciones nativas</div></div>
      <div class="meta-box"><div class="meta-label">Alertas de Cambio de Ventana</div><div class="meta-val ${(tel.incidentsCount || 0) === 0 ? 'metric-ok' : 'metric-warn'}">${tel.incidentsCount || 0} incidencias</div></div>
      <div class="meta-box"><div class="meta-label">Sello HMAC-SHA256</div><div class="meta-val" style="font-family:monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;">${safeStr((manifest.signatureHMAC || '').substring(0, 24))}...</div></div>
    </div>

    <h3 style="margin-top:28px;margin-bottom:8px;font-size:15px;color:#fff;">Archivos de Código Entregados (${files.length})</h3>
    ${filesHtml}

    <div class="footer">
      Documento auditado por <strong>CodeGO ${safeStr(manifest.sistema || '')}</strong> · Desarrollado por Francisco López Velázquez · <a href="https://zolvek.com.mx" style="color:#63b3ed;">zolvek.com.mx</a>
    </div>
  </div>
</body>
</html>`;
}

function createSubmission({ workspace, outputDirectory, student, auditLog, version }) {
  const zip = new AdmZip();
  const files = [];
  let total = 0;
  function collect(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = (prefix ? prefix + '/' : '') + name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`No se pueden sellar enlaces simbólicos: ${relative}`);
      if (stat.isDirectory()) collect(absolute, relative);
      else if (stat.isFile()) {
        total += stat.size;
        if (total > 100 * 1024 * 1024 || files.length >= 10000) throw new Error('La entrega supera 100 MB o 10 000 archivos.');
        const bytes = fs.readFileSync(absolute);
        files.push({ path: relative, size: bytes.length, sha256: sha256(bytes) });
        zip.addFile('codigo_estudiante/' + relative, bytes);
      } else throw new Error(`Tipo de archivo no admitido: ${relative}`);
    }
  }
  collect(workspace);
  const manifest = {
    schemaVersion: 1, tipoEntrega: 'examen', sistema: `CodeGO ExamGuard ${version}`,
    autor: 'Francisco López Velázquez', by: 'zolvek.com.mx',
    estudiante: student, fechaEntrega: new Date().toISOString(),
    totalIncidencias: auditLog.length, registroDeSeguridad: auditLog, files
  };
  manifest.checksum = sha256(Buffer.from(JSON.stringify(manifest)));
  manifest.signatureHMAC = signManifest(manifest.checksum);
  zip.addFile('REPORTE_SEGURIDAD_EXAMEN.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  const safeId = String(student.id || 'alumno').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const fileName = `EXAMEN_${safeId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.zip`;
  fs.mkdirSync(outputDirectory, { recursive: true });
  const zipPath = path.join(outputDirectory, fileName);
  const bytes = zip.toBuffer();
  const zipChecksum = sha256(bytes);
  const temporary = zipPath + '.tmp';
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, zipPath);
    fs.writeFileSync(zipPath + '.sha256', `${zipChecksum}  ${fileName}\n`, { mode: 0o600 });
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { success: true, fileName, zipPath, zipChecksum, totalIncidents: auditLog.length, manifest };
}

function createCertifiedTaskSubmission({ workspace, outputDirectory, customFilePath, student, telemetry = {}, version }) {
  const zip = new AdmZip();
  const files = [];
  const filesWithContent = [];
  let total = 0;

  function collect(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = (prefix ? prefix + '/' : '') + name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`No se pueden sellar enlaces simbólicos: ${relative}`);
      if (stat.isDirectory()) collect(absolute, relative);
      else if (stat.isFile()) {
        total += stat.size;
        if (total > 100 * 1024 * 1024 || files.length >= 10000) throw new Error('La entrega supera 100 MB o 10 000 archivos.');
        const bytes = fs.readFileSync(absolute);
        const fileSha = sha256(bytes);
        files.push({ path: relative, size: bytes.length, sha256: fileSha });
        filesWithContent.push({ path: relative, size: bytes.length, sha256: fileSha, content: bytes.toString('utf-8') });
        zip.addFile('codigo_estudiante/' + relative, bytes);
      }
    }
  }

  collect(workspace);

  const manifest = {
    schemaVersion: 2,
    tipoEntrega: 'tarea_certificada',
    sistema: `CodeGO ${version}`,
    plataforma: process.platform,
    autorSoftware: 'Francisco López Velázquez · zolvek.com.mx',
    estudiante: {
      name: student.name || 'Estudiante',
      id: student.id || '',
      subject: student.subject || 'Tarea Python'
    },
    fechaEntrega: new Date().toISOString(),
    telemetria: {
      keystrokesCount: Number(telemetry.keystrokesCount || 0),
      charactersTyped: Number(telemetry.charactersTyped || 0),
      backspacesCount: Number(telemetry.backspacesCount || 0),
      activeTypingSeconds: Number(telemetry.activeTypingSeconds || 0),
      totalSessionSeconds: Number(telemetry.totalSessionSeconds || 0),
      externalPasteAttempts: Number(telemetry.externalPasteAttempts || 0),
      runsCount: Number(telemetry.runsCount || 0),
      runsHistory: Array.isArray(telemetry.runsHistory) ? telemetry.runsHistory : [],
      incidentsCount: Number(telemetry.incidentsCount || 0),
      incidents: Array.isArray(telemetry.incidents) ? telemetry.incidents : []
    },
    files
  };

  // Sign the canonical telemetry & file hashes
  const payloadToSign = {
    estudiante: manifest.estudiante,
    telemetria: manifest.telemetria,
    files: manifest.files,
    fecha: manifest.fechaEntrega
  };
  manifest.checksum = sha256(Buffer.from(JSON.stringify(payloadToSign)));
  manifest.signatureHMAC = signManifest(manifest.checksum);

  zip.addFile('CERTIFICADO_CODEGO.json', Buffer.from(JSON.stringify(manifest, null, 2)));

  // Generate visual HTML certificate for the teacher
  const htmlCert = generateTeacherHtmlCertificate({ student: manifest.estudiante, manifest, files: filesWithContent });
  zip.addFile('CERTIFICADO_DOCENTE.html', Buffer.from(htmlCert, 'utf-8'));

  const safeStudent = String(student.name || 'alumno').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const safeSubject = String(student.subject || 'tarea').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const defaultFileName = `TAREA_${safeSubject}_${safeStudent}_${Date.now()}.codego`;

  const finalPath = customFilePath || path.join(outputDirectory || workspace, defaultFileName);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });

  const bytes = zip.toBuffer();
  fs.writeFileSync(finalPath, bytes);

  const containerSha = sha256(bytes);
  fs.writeFileSync(finalPath + '.sha256', `${containerSha}  ${path.basename(finalPath)}\n`);

  return {
    success: true,
    fileName: path.basename(finalPath),
    filePath: finalPath,
    fileSize: bytes.length,
    checksum: manifest.checksum,
    signatureHMAC: manifest.signatureHMAC,
    zipChecksum: containerSha,
    manifest
  };
}

function verifySubmission(zipPath) {
  const bytes = fs.readFileSync(zipPath);
  const shaFile = zipPath + '.sha256';
  let zipChecksum = null;
  if (fs.existsSync(shaFile)) {
    const expected = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
    if (sha256(bytes) !== expected) throw new Error('El SHA-256 del archivo no coincide con el sello.');
    zipChecksum = expected;
  }

  const zip = new AdmZip(bytes);

  // Check if it is a Certified Task (.codego)
  const taskManifestEntry = zip.getEntry('CERTIFICADO_CODEGO.json');
  if (taskManifestEntry) {
    const manifest = JSON.parse(zip.readAsText(taskManifestEntry));
    const payloadToSign = {
      estudiante: manifest.estudiante,
      telemetria: manifest.telemetria,
      files: manifest.files,
      fecha: manifest.fechaEntrega
    };
    const expectedChecksum = sha256(Buffer.from(JSON.stringify(payloadToSign)));
    if (manifest.checksum !== expectedChecksum) {
      throw new Error('El contenido del certificado ha sido alterado manualmente.');
    }
    if (!verifyManifestSignature(expectedChecksum, manifest.signatureHMAC)) {
      throw new Error('Firma digital no válida. El archivo no fue generado legítimamente por CodeGO.');
    }

    const files = [];
    for (const f of manifest.files) {
      const fileData = zip.readFile('codigo_estudiante/' + f.path);
      if (!fileData) {
        throw new Error(`Falta el archivo ${f.path} en el contenedor.`);
      }
      if (sha256(fileData) !== f.sha256) {
        throw new Error(`El archivo ${f.path} ha sido modificado externamente.`);
      }
      files.push({
        path: f.path,
        size: f.size,
        sha256: f.sha256,
        content: fileData.toString('utf-8')
      });
    }

    return {
      success: true,
      authentic: true,
      mode: 'task',
      fileName: path.basename(zipPath),
      zipChecksum,
      manifest,
      student: manifest.estudiante,
      telemetry: manifest.telemetria,
      date: manifest.fechaEntrega,
      files: files.length,
      fileList: files
    };
  }

  // Otherwise, treat as Exam Submission (.zip)
  const examManifestEntry = zip.getEntry('REPORTE_SEGURIDAD_EXAMEN.json');
  if (!examManifestEntry) {
    throw new Error('El archivo no contiene un reporte ni certificado válido de CodeGO.');
  }

  const manifest = JSON.parse(zip.readAsText(examManifestEntry));
  const { checksum, signatureHMAC, ...metadata } = manifest;
  const expectedManifestChecksum = sha256(Buffer.from(JSON.stringify(metadata)));
  if (manifest.checksum !== expectedManifestChecksum) {
    throw new Error('El manifiesto del examen fue modificado.');
  }

  const files = [];
  for (const file of manifest.files) {
    const data = zip.readFile('codigo_estudiante/' + file.path);
    if (!data || data.length !== file.size || sha256(data) !== file.sha256) {
      throw new Error(`Archivo modificado: ${file.path}`);
    }
    files.push({
      path: file.path,
      size: file.size,
      sha256: file.sha256,
      content: data.toString('utf-8')
    });
  }

  return {
    success: true,
    authentic: true,
    mode: 'exam',
    fileName: path.basename(zipPath),
    zipChecksum,
    files: manifest.files.length,
    manifest,
    student: manifest.estudiante,
    auditLog: manifest.registroDeSeguridad || [],
    date: manifest.fechaEntrega,
    fileList: files
  };
}

function extractSubmissionFiles(zipPath, targetDirectory) {
  const bytes = fs.readFileSync(zipPath);
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  fs.mkdirSync(targetDirectory, { recursive: true });

  let extractedCount = 0;
  for (const entry of entries) {
    if (entry.entryName.startsWith('codigo_estudiante/') && !entry.isDirectory) {
      const rel = entry.entryName.slice('codigo_estudiante/'.length);
      const dest = path.join(targetDirectory, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
      extractedCount++;
    }
  }
  return { success: true, extractedCount, targetDirectory };
}

module.exports = {
  createSubmission,
  createCertifiedTaskSubmission,
  verifySubmission,
  extractSubmissionFiles,
  signManifest,
  verifyManifestSignature
};
