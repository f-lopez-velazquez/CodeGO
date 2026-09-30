const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function execute(command, args, options = {}) {
  return execFileAsync(command, args, { windowsHide: true, timeout: 4000, encoding: 'utf8', ...options });
}

class DisplayGuard {
  constructor({ platform = process.platform, run = execute } = {}) {
    this.platform = platform;
    this.run = run;
    this.previous = null;
    this.method = null;
  }

  async maximize() {
    try {
      if (this.platform === 'linux') {
        const [{ stdout: current }, { stdout: maximum }] = await Promise.all([
          this.run('brightnessctl', ['get']),
          this.run('brightnessctl', ['max'])
        ]);
        const max = Number(String(maximum).trim());
        const value = Number(String(current).trim());
        if (this.previous === null && Number.isFinite(value) && Number.isFinite(max) && max > 0) this.previous = Math.round((value / max) * 100);
        await this.run('brightnessctl', ['set', '100%']);
        this.method = 'brightnessctl';
        return { success: true, method: this.method };
      }
      if (this.platform === 'win32') {
        const getScript = '(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1 -ExpandProperty CurrentBrightness)';
        const { stdout } = await this.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', getScript]);
        const value = Number(String(stdout).trim());
        if (this.previous === null && Number.isFinite(value)) this.previous = value;
        await this.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = 100 } | Out-Null }']);
        this.method = 'windows-wmi';
        return { success: true, method: this.method };
      }
      if (this.platform === 'darwin') {
        const { stdout } = await this.run('brightness', ['-l']);
        const matches = [...String(stdout).matchAll(/brightness\s+([0-9.]+)/gi)];
        const value = Number(matches.at(-1)?.[1]);
        if (this.previous === null && Number.isFinite(value)) this.previous = Math.round(value * 100);
        await this.run('brightness', ['1']);
        this.method = 'mac-brightness';
        return { success: true, method: this.method };
      }
    } catch (_) {}
    return { success: false, method: 'visual-white-fallback' };
  }

  async restore() {
    const value = this.previous;
    const method = this.method;
    this.previous = null;
    this.method = null;
    if (!Number.isFinite(value) || !method) return { success: true, restored: false };
    try {
      if (method === 'brightnessctl') await this.run('brightnessctl', ['set', `${value}%`]);
      if (method === 'windows-wmi') await this.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = ${Math.max(0, Math.min(100, value))} } | Out-Null }`]);
      if (method === 'mac-brightness') await this.run('brightness', [String(Math.max(0, Math.min(100, value)) / 100)]);
      return { success: true, restored: true };
    } catch (_) {
      return { success: false, restored: false };
    }
  }
}

class BrowserGuard {
  constructor({ platform = process.platform, run = execute, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.platform = platform;
    this.run = run;
    this.wait = wait;
  }

  async closeAll() {
    const closed = [];
    if (this.platform === 'win32') {
      const names = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe', 'chromium.exe', 'iexplore.exe', 'arc.exe', 'tor.exe'];
      await Promise.all(names.map(async name => {
        try {
          await this.run('taskkill', ['/IM', name, '/T', '/F']);
          closed.push(name);
        } catch (_) {}
      }));
    } else if (this.platform === 'darwin') {
      const apps = ['Safari', 'Google Chrome', 'Firefox', 'Microsoft Edge', 'Brave Browser', 'Opera', 'Vivaldi', 'Arc', 'Tor Browser'];
      await Promise.all(apps.map(async name => {
        try {
          await this.run('osascript', ['-e', `tell application "${name}" to quit`]);
          closed.push(name);
        } catch (_) {}
      }));
      await this.wait(500);
      await Promise.all(apps.map(async name => {
        try { await this.run('killall', ['-KILL', name]); } catch (_) {}
      }));
    } else {
      const names = ['google-chrome', 'google-chrome-stable', 'chrome', 'chromium', 'chromium-browser', 'firefox', 'firefox-bin', 'brave-browser', 'opera', 'vivaldi-bin', 'tor-browser'];
      await Promise.all(names.map(async name => {
        try {
          await this.run('pkill', ['-TERM', '-x', name]);
          closed.push(name);
        } catch (_) {}
      }));
      await this.wait(500);
      await Promise.all(names.map(async name => {
        try { await this.run('pkill', ['-KILL', '-x', name]); } catch (_) {}
      }));
    }
    return { success: true, closed: [...new Set(closed)] };
  }
}

module.exports = { BrowserGuard, DisplayGuard, execute };
