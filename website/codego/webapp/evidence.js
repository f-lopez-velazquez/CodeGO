/* An installation identity, not a hardware identifier or proof of authorship. */
(function (root) {
  'use strict';
  const bytes = text => new TextEncoder().encode(text);
  const hex = buffer => Array.from(new Uint8Array(buffer), n => n.toString(16).padStart(2, '0')).join('');
  const hash = async text => hex(await crypto.subtle.digest('SHA-256', bytes(text)));
  const base64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const unbase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  const MAX_EVENTS = 500;
  function record(project, type, detail = {}) {
    const evidence = project.evidence ||= { events: [], omitted: 0, fileHashes: {} };
    evidence.events ||= [];
    const event = { at: new Date().toISOString(), type, ...detail };
    const last = evidence.events.at(-1);
    if (type === 'edit' && last?.type === type && last.file === detail.file && Date.parse(event.at) - Date.parse(last.at) < 1000) {
      last.at = event.at; last.changes = (last.changes || 1) + 1; last.length = detail.length; last.cursorUTF16 = detail.cursorUTF16; last.inputType = detail.inputType; last.insertedText = String(last.insertedText || '') + String(detail.insertedText || ''); last.textTruncated ||= detail.textTruncated || last.insertedText.length > 512; last.insertedText = last.insertedText.slice(0,512); last.note = 'Grupo de edición: texto insertado, sin reconstrucción completa de borrados.';
    } else evidence.events.push(event);
    if (evidence.events.length > MAX_EVENTS) { evidence.omitted = (evidence.omitted || 0) + evidence.events.length - MAX_EVENTS; evidence.events.splice(0, evidence.events.length - MAX_EVENTS); }
  }
  function create(store) {
    let identityPromise;
    const identity = () => identityPromise ||= (async () => {
      let pair = await store.loadIdentity();
      if (!pair) {
        pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
        pair = await store.saveIdentity(pair); // The first tab wins atomically.
      }
      const publicKey = base64(await crypto.subtle.exportKey('spki', pair.publicKey));
      return { ...pair, publicKeySPKI: publicKey, fingerprint: (await hash(publicKey)).slice(0, 24).toUpperCase() };
    })().catch(error => { identityPromise = null; throw error; });
    async function checkpoint(project) {
      const evidence = project.evidence ||= { events: [], omitted: 0, fileHashes: {} };
      evidence.fileHashes ||= {};
      for (const [file, source] of Object.entries(project.files)) {
        const sha256 = await hash(source);
        if (evidence.fileHashes[file] !== sha256) {
          record(project, 'checkpoint', { file, previousHash: evidence.fileHashes[file] || null, sha256, length: source.length });
          evidence.fileHashes[file] = sha256;
        }
      }
    }
    async function seal(payload) {
      const device = await identity();
      const body = { ...payload, installation: { fingerprint: device.fingerprint, scope: 'Este navegador y perfil. Borrar sus datos crea otra identidad.', platform: navigator.platform, language: navigator.language }, note: 'La firma detecta cambios y vincula la copia a una instalación. El reloj, la actividad y el nombre son locales; no prueban autoría ni identidad física.' };
      const canonical = JSON.stringify(body);
      const signature = base64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.privateKey, bytes(canonical)));
      return { payload: body, sha256: await hash(canonical), seal: { algorithm: 'ECDSA-P256-SHA256', publicKey: device.publicKeySPKI, fingerprint: device.fingerprint, signature } };
    }
    return { identity, checkpoint, seal };
  }
  async function verify(envelope) {
    try {
      const { payload, seal, sha256 } = envelope;
      if (seal?.algorithm !== 'ECDSA-P256-SHA256' || (await hash(seal.publicKey)).slice(0,24).toUpperCase() !== seal.fingerprint || payload.installation?.fingerprint !== seal.fingerprint) return false;
      const canonical = JSON.stringify(payload);
      if (await hash(canonical) !== sha256) return false;
      const key = await crypto.subtle.importKey('spki', unbase64(seal.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unbase64(seal.signature), bytes(canonical));
    } catch (_) { return false; }
  }
  const api = { create, record, verify, hash, MAX_EVENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CodeGOEvidence = api;
})(globalThis);
