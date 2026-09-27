const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const CODEGO_HMAC_SECRET = 'CodeGO-Certified-Academic-Integrity-v1.2-Zolvek-FranciscoLopezVelazquez';

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def',
  'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'True', 'try', 'while', 'with', 'yield'
]);

function ensureSigningIdentity(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const privatePath = path.join(directory, 'task-signing-private.pem');
  const publicPath = path.join(directory, 'task-signing-public.pem');
  if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath)) {
    const pair = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    fs.writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
    fs.writeFileSync(publicPath, pair.publicKey, { mode: 0o644 });
  }
  const privateKey = fs.readFileSync(privatePath, 'utf8');
  const publicKey = fs.readFileSync(publicPath, 'utf8');
  return {
    privateKey,
    publicKey,
    fingerprint: sha256(Buffer.from(publicKey)).slice(0, 24).toUpperCase()
  };
}

function signWithIdentity(payload, identity) {
  if (!identity?.privateKey || !identity?.publicKey) return null;
  return {
    algorithm: 'Ed25519',
    publicKey: identity.publicKey,
    fingerprint: identity.fingerprint || sha256(Buffer.from(identity.publicKey)).slice(0, 24).toUpperCase(),
    signature: crypto.sign(null, Buffer.from(payload), identity.privateKey).toString('base64')
  };
}

function verifyIdentitySignature(payload, seal) {
  if (!seal?.publicKey || !seal?.signature || seal.algorithm !== 'Ed25519') return false;
  const expectedFingerprint = sha256(Buffer.from(seal.publicKey)).slice(0, 24).toUpperCase();
  if (seal.fingerprint !== expectedFingerprint) return false;
  return crypto.verify(null, Buffer.from(payload), seal.publicKey, Buffer.from(seal.signature, 'base64'));
}

function normalizePythonForSimilarity(source) {
  const withoutComments = String(source || '').replace(/(^|\s)#.*$/gm, '$1');
  const tokens = withoutComments.match(/(?:'''[\s\S]*?'''|\"\"\"[\s\S]*?\"\"\"|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|[A-Za-z_]\w*|\d+(?:\.\d+)?|==|!=|<=|>=|:=|\*\*|\/\/|[-+*/%@<>=:()[\]{},.])/g) || [];
  return tokens.map(token => {
    if (/^['\"]/.test(token)) return 'STR';
    if (/^\d/.test(token)) return 'NUM';
    if (/^[A-Za-z_]\w*$/.test(token) && !PYTHON_KEYWORDS.has(token)) return 'ID';
    return token;
  });
}

function submissionFingerprint(fileList) {
  const python = fileList
    .filter(file => file.path.toLowerCase().endsWith('.py'))
    .sort((a, b) => a.path.localeCompare(b.path))
    .flatMap(file => normalizePythonForSimilarity(file.content));
  return { tokens: python, hash: sha256(Buffer.from(python.join(' '))) };
}

function tokenShingles(tokens, size = 7) {
  const values = new Set();
  if (tokens.length < size) {
    if (tokens.length) values.add(tokens.join(' '));
    return values;
  }
  for (let index = 0; index <= tokens.length - size; index += 1) {
    values.add(tokens.slice(index, index + size).join(' '));
  }
  return values;
}

function similarityScore(leftTokens, rightTokens) {
  const left = tokenShingles(leftTokens);
  const right = tokenShingles(rightTokens);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

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
  <title>Certificado oficial de tarea codeGO — ${safeStr(student.name || 'Estudiante')}</title>
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
        <p style="margin:4px 0 0;font-size:13px;color:#a0aec0;">Tarea académica certificada por codeGO · zolvek.com.mx</p>
      </div>
      <div class="badge">✓ SELLO CRIPTOGRÁFICO CODEGO</div>
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
      <div class="meta-box"><div class="meta-label">Pegados Externos</div><div class="meta-val ${(tel.externalPasteAttempts || 0) === 0 ? 'metric-ok' : 'metric-warn'}">${tel.externalPasteAttempts || 0} (100% escrito en codeGO)</div></div>
      <div class="meta-box"><div class="meta-label">Tiempo Activo de Edición</div><div class="meta-val">${activeMinutes} min (${tel.activeTypingSeconds || 0}s)</div></div>
      <div class="meta-box"><div class="meta-label">Ejecuciones de Prueba</div><div class="meta-val">${tel.runsCount || 0} ejecuciones nativas</div></div>
      <div class="meta-box"><div class="meta-label">Intentos bloqueados</div><div class="meta-val ${(tel.externalPasteAttempts || 0) === 0 ? 'metric-ok' : 'metric-warn'}">${tel.externalPasteAttempts || 0} eventos de portapapeles</div></div>
      <div class="meta-box"><div class="meta-label">Identidad del equipo</div><div class="meta-val" style="font-family:monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;">${safeStr(manifest.officialSeal?.fingerprint || (manifest.signatureHMAC || '').substring(0, 24))}</div></div>
    </div>

    <h3 style="margin-top:28px;margin-bottom:8px;font-size:15px;color:#fff;">Archivos de Código Entregados (${files.length})</h3>
    ${filesHtml}

    <div class="footer">
      Documento auditado por <strong>${safeStr(manifest.sistema || 'codeGO')}</strong> · Desarrollado por Francisco López Velázquez · <a href="https://zolvek.com.mx" style="color:#63b3ed;">zolvek.com.mx</a>
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
    schemaVersion: 1, tipoEntrega: 'examen', sistema: `codeGO ${version}`,
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

function createCertifiedTaskSubmission({ workspace, outputDirectory, customFilePath, student, telemetry = {}, version, signingIdentity }) {
  if (!signingIdentity?.privateKey || !signingIdentity?.publicKey) {
    throw new Error('No se pudo crear la identidad criptográfica necesaria para sellar la tarea.');
  }
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
    schemaVersion: 3,
    submissionId: crypto.randomUUID(),
    tipoEntrega: 'tarea_certificada',
    sistema: `codeGO ${version}`,
    plataforma: process.platform,
    autorSoftware: 'Francisco López Velázquez · zolvek.com.mx',
    estudiante: {
      name: student.name || 'Estudiante',
      id: student.id || '',
      subject: student.subject || 'Tarea Python'
    },
    fechaEntrega: new Date().toISOString(),
    telemetria: {
      keystrokesCount: Number(telemetry.keystrokesCount || telemetry.keystrokes || 0),
      charactersTyped: Number(telemetry.charactersTyped || telemetry.charactersWritten || 0),
      backspacesCount: Number(telemetry.backspacesCount || 0),
      activeTypingSeconds: Number(telemetry.activeTypingSeconds || telemetry.activeEditingSeconds || 0),
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
    submissionId: manifest.submissionId,
    estudiante: manifest.estudiante,
    telemetria: manifest.telemetria,
    files: manifest.files,
    fecha: manifest.fechaEntrega
  };
  const canonicalPayload = JSON.stringify(payloadToSign);
  manifest.checksum = sha256(Buffer.from(canonicalPayload));
  manifest.officialSeal = signWithIdentity(canonicalPayload, signingIdentity);

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
    officialSeal: manifest.officialSeal,
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
      ...(manifest.submissionId ? { submissionId: manifest.submissionId } : {}),
      estudiante: manifest.estudiante,
      telemetria: manifest.telemetria,
      files: manifest.files,
      fecha: manifest.fechaEntrega
    };
    const canonicalPayload = JSON.stringify(payloadToSign);
    const expectedChecksum = sha256(Buffer.from(canonicalPayload));
    if (manifest.checksum !== expectedChecksum) {
      throw new Error('El contenido del certificado ha sido alterado manualmente.');
    }
    const legacyValid = verifyManifestSignature(expectedChecksum, manifest.signatureHMAC);
    const officialSealValid = manifest.officialSeal ? verifyIdentitySignature(canonicalPayload, manifest.officialSeal) : false;
    const validSignature = Number(manifest.schemaVersion || 0) >= 3 ? officialSealValid : legacyValid;
    if (!validSignature) {
      throw new Error('Firma digital no válida. El archivo no fue generado legítimamente por codeGO.');
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
      officialSealValid,
      sealFingerprint: manifest.officialSeal?.fingerprint || null,
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
    throw new Error('El archivo no contiene un reporte ni certificado válido de codeGO.');
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

function analyzeSubmissionBatch(filePaths) {
  const submissions = [];
  const errors = [];

  for (const filePath of [...new Set(filePaths || [])]) {
    try {
      const verified = verifySubmission(filePath);
      const fingerprint = submissionFingerprint(verified.fileList || []);
      submissions.push({
        filePath,
        fileName: verified.fileName,
        authentic: verified.authentic,
        officialSealValid: Boolean(verified.officialSealValid),
        sealFingerprint: verified.sealFingerprint || null,
        submissionId: verified.manifest?.submissionId || null,
        student: verified.student || {},
        telemetry: verified.telemetry || {},
        mode: verified.mode,
        date: verified.date,
        files: verified.files,
        fileList: verified.fileList,
        sourceFingerprint: fingerprint.hash,
        _tokens: fingerprint.tokens
      });
    } catch (error) {
      errors.push({ filePath, fileName: path.basename(filePath), error: error.message });
    }
  }

  const comparisons = [];
  for (let leftIndex = 0; leftIndex < submissions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < submissions.length; rightIndex += 1) {
      const left = submissions[leftIndex];
      const right = submissions[rightIndex];
      const duplicateContainer = Boolean(left.submissionId && left.submissionId === right.submissionId);
      const exactCode = Boolean(left.sourceFingerprint && left.sourceFingerprint === right.sourceFingerprint);
      const score = exactCode ? 1 : similarityScore(left._tokens, right._tokens);
      if (duplicateContainer || exactCode || score >= 0.55) {
        comparisons.push({
          leftIndex,
          rightIndex,
          leftStudent: left.student.name || left.fileName,
          rightStudent: right.student.name || right.fileName,
          score: Number(score.toFixed(3)),
          percentage: Math.round(score * 100),
          classification: duplicateContainer ? 'archivo_duplicado' : exactCode ? 'codigo_identico' : score >= 0.78 ? 'similitud_alta' : 'revisar',
          duplicateContainer,
          exactCode
        });
      }
    }
  }

  comparisons.sort((left, right) => Number(right.duplicateContainer) - Number(left.duplicateContainer) || right.score - left.score);
  const cleanSubmissions = submissions.map(({ _tokens, ...submission }) => submission);
  const flaggedIndexes = new Set(comparisons.filter(item => item.classification !== 'revisar').flatMap(item => [item.leftIndex, item.rightIndex]));
  return {
    success: true,
    totalFiles: (filePaths || []).length,
    verifiedCount: cleanSubmissions.length,
    errorCount: errors.length,
    flaggedCount: flaggedIndexes.size,
    submissions: cleanSubmissions,
    comparisons,
    errors
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
  analyzeSubmissionBatch,
  extractSubmissionFiles,
  ensureSigningIdentity,
  normalizePythonForSimilarity,
  similarityScore,
  signManifest,
  verifyManifestSignature
};
