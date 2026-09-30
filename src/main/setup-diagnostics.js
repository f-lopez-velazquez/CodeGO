function setupDiagnostic(error, { offlineAvailable = false } = {}) {
  const detail = String(error?.message || error || 'Error desconocido').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const lower = detail.toLowerCase();
  const diagnostic = {
    code: 'CG-SETUP-900',
    title: 'No se pudo terminar la preparación',
    summary: 'codeGO mantuvo bloqueado el editor para evitar un entorno incompleto.',
    actions: ['Pulsa Reintentar preparación para continuar desde lo completado.', 'Si persiste, usa Reconstruir entorno; no elimina proyectos ni entregas.'],
    detail,
    offlineAvailable
  };
  if (process.platform === 'darwin' && /quarantine|notar|developer|damaged|killed|operation not permitted|python/.test(lower)) {
    return {
      ...diagnostic,
      code: 'CG-SETUP-108',
      title: 'macOS bloqueó un componente incluido',
      summary: 'Gatekeeper conservó la cuarentena en codeGO o en su Python privado.',
      actions: ['Mueve codeGO a Aplicaciones.', 'Copia el comando mostrado, pégalo en Terminal y vuelve a abrir codeGO.'],
      command: 'xattr -dr com.apple.quarantine "/Applications/codeGO.app" && open "/Applications/codeGO.app"'
    };
  }
  if (/sha-?256|firma|manifiesto|corrupt|falta un componente autónomo/.test(lower)) {
    return { ...diagnostic, code: 'CG-SETUP-101', title: 'El instalador está incompleto o dañado', summary: 'Un archivo interno no coincide con la copia verificada.', actions: ['Descarga nuevamente el instalador oficial desde zolvek.com.mx.', 'Elimina la copia anterior antes de volver a instalar.'] };
  }
  if (/enospc|espacio|disk|no space/.test(lower)) {
    return { ...diagnostic, code: 'CG-SETUP-102', title: 'No hay espacio suficiente', summary: 'codeGO necesita espacio para extraer Python y las librerías educativas.', actions: ['Libera al menos 5 GB en la unidad del perfil del usuario.', 'Pulsa Reintentar preparación.'] };
  }
  if (/eacces|eperm|access.*denied|permiso|antivirus/.test(lower)) {
    const windows = process.platform === 'win32';
    return { ...diagnostic, code: 'CG-SETUP-103', title: windows ? 'Windows o el antivirus bloqueó un archivo' : 'El sistema bloqueó un archivo', summary: 'codeGO no pudo escribir o ejecutar un componente de su entorno aislado.', actions: windows ? ['Abre Seguridad de Windows > Protección contra virus > Historial de protección.', 'Permite el elemento de codeGO, abre la aplicación desde tu cuenta normal y pulsa Reintentar.'] : ['Comprueba los permisos de tu perfil de usuario.', 'Abre codeGO desde tu cuenta normal y pulsa Reintentar.'] };
  }
  if (/visual c\+\+|vc_redist|3010/.test(lower)) {
    return { ...diagnostic, code: 'CG-SETUP-104', title: 'Visual C++ necesita atención', summary: 'Windows no confirmó el componente nativo requerido por algunas librerías.', actions: ['Reinicia Windows si el instalador lo solicitó.', 'Abre codeGO y pulsa Reintentar preparación.'] };
  }
  if (/pip|wheel|librería|dependenc|no matching distribution/.test(lower)) {
    return { ...diagnostic, code: 'CG-SETUP-105', title: 'Una librería no pudo instalarse', summary: offlineAvailable ? 'La rueda binaria incluida no pudo instalarse después de los reintentos automáticos.' : 'La descarga o instalación de una librería no terminó.', actions: offlineAvailable ? ['Comprueba que el antivirus no haya puesto archivos de codeGO en cuarentena.', 'Pulsa Reintentar para reanudar o Reconstruir entorno para comenzar con un runtime limpio.'] : ['Comprueba la conexión a internet.', 'Pulsa Reintentar preparación.'] };
  }
  if (/python|intérprete|runtime|venv/.test(lower)) {
    return { ...diagnostic, code: 'CG-SETUP-106', title: 'Python no pudo prepararse', summary: offlineAvailable ? 'El Python privado incluido no pudo extraerse o iniciarse después de la recuperación automática.' : 'No se encontró un Python compatible y no se pudo obtener el runtime privado.', actions: offlineAvailable ? ['Comprueba espacio libre y permisos en tu perfil de usuario.', 'Usa Reconstruir entorno para extraer Python directamente dentro de tu perfil.'] : ['Conéctate a internet para completar la reparación.', 'Pulsa Reintentar preparación.'] };
  }
  if (/timeout|tiempo agotado|enotfound|econn|http|red|conexi/.test(lower)) {
    return { ...diagnostic, code: 'CG-SETUP-107', title: 'La reparación en línea no respondió', summary: 'No se pudo completar una descarga de respaldo.', actions: ['Comprueba internet, proxy y fecha/hora del equipo.', 'Vuelve a intentar o instala la edición autónoma completa.'] };
  }
  return diagnostic;
}

module.exports = { setupDiagnostic };
