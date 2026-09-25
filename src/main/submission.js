const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function createSubmission({ workspace, outputDirectory, student, auditLog, version }) {
  const zip = new AdmZip();
  const files = [];
  let total = 0;
  function collect(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix + name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`No se pueden sellar enlaces simbólicos: ${relative}`);
      if (stat.isDirectory()) collect(absolute, relative + '/');
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
    schemaVersion: 1, sistema: `CodeGO ExamGuard ${version}`,
    autor: 'Francisco López Velázquez', by: 'zolvek.com.mx',
    estudiante: student, fechaEntrega: new Date().toISOString(),
    totalIncidencias: auditLog.length, registroDeSeguridad: auditLog, files
  };
  manifest.checksum = sha256(Buffer.from(JSON.stringify(manifest)));
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

function verifySubmission(zipPath) {
  const bytes = fs.readFileSync(zipPath);
  const expected = fs.readFileSync(zipPath + '.sha256', 'utf8').trim().split(/\s+/)[0];
  if (sha256(bytes) !== expected) throw new Error('El SHA-256 del ZIP no coincide.');
  const zip = new AdmZip(bytes);
  const manifest = JSON.parse(zip.readAsText('REPORTE_SEGURIDAD_EXAMEN.json'));
  const { checksum, ...metadata } = manifest;
  if (sha256(Buffer.from(JSON.stringify(metadata))) !== checksum) throw new Error('El manifiesto fue modificado.');
  const entries = zip.getEntries().filter(entry => !entry.isDirectory);
  if (entries.length !== manifest.files.length + 1) throw new Error('Hay archivos inesperados o faltantes.');
  for (const file of manifest.files) {
    const data = zip.readFile('codigo_estudiante/' + file.path);
    if (!data || data.length !== file.size || sha256(data) !== file.sha256) throw new Error(`Archivo modificado: ${file.path}`);
  }
  return { success: true, zipChecksum: expected, files: manifest.files.length };
}
module.exports = { createSubmission, verifySubmission };
