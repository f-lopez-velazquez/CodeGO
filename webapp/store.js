/* Commit whole project snapshots in one IndexedDB transaction; preserve the last snapshot on failure. */
(function (root) {
  'use strict';
  let connection;
  function database() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('codego-workspaces', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Cierra otras pestañas de CodeGO para actualizar el almacenamiento.'));
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  async function transaction(uid, value, write = false) {
    if (!uid) throw new Error('Inicia sesión antes de abrir un proyecto.');
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('snapshots');
      const request = store.get(uid);
      let result;
      let conflict;
      request.onsuccess = () => {
        if (!write) { result = request.result; return; }
        const currentRevision = request.result?.revision || 0;
        if ((value.revision || 0) !== currentRevision) {
          conflict = new Error('Otra pestaña guardó cambios. Descarga una copia antes de recargar para evitar sobrescribirlos.');
          tx.abort();
          return;
        }
        result = currentRevision + 1;
        store.put({ ...value, revision: result }, uid);
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(conflict || tx.error || new Error('No hay espacio para guardar. Descarga una copia.'));
    });
  }
  async function installationIdentity(value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('snapshots');
      const request = store.get('__codego_installation_identity_v1');
      let result;
      request.onsuccess = () => { result = request.result || value; if (!request.result && value) store.put(value, '__codego_installation_identity_v1'); };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo conservar la identidad de esta instalación.'));
    });
  }
  root.CodeGOStore = { loadIdentity: () => installationIdentity(), saveIdentity: value => installationIdentity(value), load: uid => transaction(uid), save: (uid, value) => transaction(uid, value, true) };
})(window);
