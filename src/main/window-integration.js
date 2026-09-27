const { execFileSync } = require('node:child_process');

function isHyprland(environment = process.env) {
  return /hyprland/i.test(`${environment.XDG_CURRENT_DESKTOP || ''} ${environment.XDG_SESSION_DESKTOP || ''}`)
    && Boolean(environment.HYPRLAND_INSTANCE_SIGNATURE);
}

function sourceLikelyOpensGui(source = '') {
  return /(?:^|\n)\s*(?:from\s+(?:pygame|tkinter|turtle|matplotlib(?:\.pyplot)?|cv2|PyQt\d*|PySide\d*|wx|kivy)\b|import\s+[^\n#]*(?:pygame|tkinter|turtle|matplotlib(?:\.pyplot)?|cv2|PyQt\d*|PySide\d*|wx|kivy)\b)/im.test(source);
}

function runHyprctl(args, execute = execFileSync) {
  return execute('hyprctl', args, {
    encoding: 'utf8',
    timeout: 2500,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function activeHyprlandWorkspace(options = {}) {
  const environment = options.environment || process.env;
  if (!isHyprland(environment)) return null;
  try {
    const workspace = JSON.parse(runHyprctl(['-j', 'activeworkspace'], options.execute));
    const value = workspace?.id ?? workspace?.name;
    return /^-?\d+$/.test(String(value)) ? String(value) : null;
  } catch (_) {
    return null;
  }
}

function placeHyprlandWindow(processId, workspace, options = {}) {
  const environment = options.environment || process.env;
  const pid = Number(processId);
  if (!isHyprland(environment) || !Number.isSafeInteger(pid) || pid <= 0 || !/^-?\d+$/.test(String(workspace))) return false;

  const selector = `pid:${pid}`;
  const destination = String(workspace);
  const lua = `return hl.dispatch(hl.dsp.window.move({ workspace = ${JSON.stringify(destination)}, follow = true, window = ${JSON.stringify(selector)} }))`;
  try {
    runHyprctl(['eval', lua], options.execute);
    return true;
  } catch (_) {
    try {
      runHyprctl(['dispatch', 'movetoworkspace', `${destination},${selector}`], options.execute);
      runHyprctl(['dispatch', 'focuswindow', selector], options.execute);
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = { isHyprland, sourceLikelyOpensGui, activeHyprlandWorkspace, placeHyprlandWindow };
