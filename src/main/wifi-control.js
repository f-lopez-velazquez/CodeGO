const { execFileSync, execFile } = require('node:child_process');
const executeFile = require('node:util').promisify(execFile);

function createWifiControl({ platform = process.platform, execute = execFileSync, executeAsync = executeFile } = {}) {
  let changed = null;
  const run = (command, args) => execute(command, args, { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore','pipe','pipe'], env: {...process.env, LC_ALL: 'C'} }).trim();
  const powershell = script => run('powershell.exe', ['-NoProfile','-NonInteractive','-Command', '$ErrorActionPreference="Stop"; ' + script]);
  const wifiAdapters = 'Get-NetAdapter -Physical | Where-Object { $_.NdisPhysicalMedium -in @(1,9) }';
  const adapterQuery = `$a = @(${wifiAdapters} | Select-Object ifIndex,Status); ConvertTo-Json -InputObject $a -Compress`;
  const parseWindows = raw => {
    const adapters = JSON.parse(raw || '[]');
    const enabled = adapters.filter(a => a.Status !== 'Disabled').map(a => Number(a.ifIndex));
    if (!enabled.every(Number.isInteger)) throw new Error('Adaptador no válido.');
    return { known: true, disabled: enabled.length === 0, adapters: enabled };
  };
  let pendingInspection;
  function inspectAsync() {
    if (platform !== 'win32') return Promise.resolve(inspect());
    // PowerShell can take seconds to start. Polling must not freeze IPC or queue processes.
    if (!pendingInspection) pendingInspection = executeAsync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; ' + adapterQuery],
      { encoding: 'utf8', timeout: 5000, windowsHide: true })
      .then(result => parseWindows(result.stdout.trim()))
      .catch(error => ({ known: false, disabled: null, error: error.message }))
      .finally(() => { pendingInspection = null; });
    return pendingInspection;
  }
  function inspect() {
    try {
      if (platform === 'linux') {
        const state = run('nmcli', ['radio','wifi']);
        if (!['enabled','disabled'].includes(state)) throw new Error('Estado de radio desconocido.');
        return { known: true, disabled: state === 'disabled', adapters: state === 'enabled' ? ['wifi'] : [] };
      }
      if (platform === 'win32') {
        return parseWindows(powershell(adapterQuery));
      }
      if (platform === 'darwin') {
        const ports = run('networksetup', ['-listallhardwareports']);
        const devices = [...ports.matchAll(/Hardware Port: (?:Wi-Fi|AirPort)\r?\nDevice: ([\w.-]+)/g)].map(m => m[1]);
        const enabled = [];
        for (const device of devices) {
          const value = run('networksetup', ['-getairportpower', device]);
          if (!/: (On|Off)$/.test(value)) throw new Error('Estado de radio desconocido.');
          if (value.endsWith(': On')) enabled.push(device);
        }
        return { known: true, disabled: enabled.length === 0, adapters: enabled };
      }
      throw new Error('Control Wi-Fi no disponible en este sistema.');
    } catch (error) { return { known: false, disabled: null, error: error.message }; }
  }
  function change(adapters, enable) {
    if (platform === 'linux') run('nmcli', ['radio','wifi',enable ? 'on' : 'off']);
    else if (platform === 'darwin') for (const device of adapters) run('networksetup', ['-setairportpower',device,enable ? 'on' : 'off']);
    else if (platform === 'win32') for (const id of adapters) powershell(`Get-NetAdapter | Where-Object { $_.ifIndex -eq ${id} } | ${enable ? 'Enable' : 'Disable'}-NetAdapter -Confirm:$false`);
  }
  function disable() {
    const before = inspect();
    if (!before.known) return {success:false,error:'No se puede verificar Wi-Fi. Comprueba permisos y herramientas del sistema.'};
    if (before.disabled) return {success:true};
    changed ??= before.adapters;
    try {
      change(before.adapters, false);
      const after = inspect();
      if (!after.known || !after.disabled) throw new Error('No se confirmó la desconexión Wi-Fi.');
      return {success:true};
    } catch (error) { return {success:false,error:error.message}; }
  }
  function restore() {
    if (!changed) return {success:true};
    try { change(changed, true); changed = null; return {success:true}; }
    catch (error) { return {success:false,error:error.message}; }
  }
  return { inspect, inspectAsync, disable, restore };
}
module.exports = { createWifiControl };
