const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);

class NotificationGuard {
  constructor({ platform = process.platform, environment = process.env } = {}) {
    this.platform = platform;
    this.environment = environment;
    this.restoreAction = null;
  }

  async enable() {
    if (this.restoreAction) return { success: true, alreadyActive: true };
    try {
      if (this.platform === 'win32') {
        const key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings';
        const read = `$p='${key}'; if (Test-Path $p) { $v=(Get-ItemProperty -Path $p -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED; if ($null -eq $v) {'MISSING'} else {$v} } else {'MISSING'}; New-Item -Path $p -Force | Out-Null; Set-ItemProperty -Path $p -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -Type DWord -Value 0`;
        const { stdout } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', read], { windowsHide: true, timeout: 3000 });
        const previous = String(stdout || '').trim().split(/\r?\n/)[0] || 'MISSING';
        this.restoreAction = async () => {
          const command = previous === 'MISSING'
            ? `Remove-ItemProperty -Path '${key}' -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -ErrorAction SilentlyContinue`
            : `Set-ItemProperty -Path '${key}' -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -Type DWord -Value ${Number(previous) || 0}`;
          await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 3000 });
        };
        return { success: true, method: 'windows-notifications' };
      }

      if (this.platform === 'linux' && /gnome/i.test(this.environment.XDG_CURRENT_DESKTOP || '')) {
        const { stdout } = await run('gsettings', ['get', 'org.gnome.desktop.notifications', 'show-banners'], { timeout: 2000 });
        const previous = String(stdout).trim() === 'true';
        await run('gsettings', ['set', 'org.gnome.desktop.notifications', 'show-banners', 'false'], { timeout: 2000 });
        this.restoreAction = () => run('gsettings', ['set', 'org.gnome.desktop.notifications', 'show-banners', String(previous)], { timeout: 2000 });
        return { success: true, method: 'gnome-notifications' };
      }

      if (this.platform === 'linux' && this.environment.HYPRLAND_INSTANCE_SIGNATURE) {
        await run('makoctl', ['mode', '-a', 'do-not-disturb'], { timeout: 2000 });
        this.restoreAction = () => run('makoctl', ['mode', '-r', 'do-not-disturb'], { timeout: 2000 });
        return { success: true, method: 'mako-do-not-disturb' };
      }

      // macOS notifications do not take focus over a screen-saver-level kiosk.
      // Changing Focus from an unsigned app is not a supported public API.
      return { success: true, method: 'kiosk-overlay-protection' };
    } catch (_) {
      this.restoreAction = null;
      return { success: false, method: 'fullscreen-fallback' };
    }
  }

  async restore() {
    const action = this.restoreAction;
    this.restoreAction = null;
    if (!action) return { success: true };
    try {
      await action();
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  }
}

module.exports = { NotificationGuard };
