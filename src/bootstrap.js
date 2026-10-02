const path = require('node:path');
const { app } = require('electron');
const appPatch = require('./main/app-patch');
const diagnosticMode = process.argv.some(argument => argument.startsWith('--self-test-report='));

function loadBuiltInApplication() {
  process.env.CODEGO_EFFECTIVE_VERSION = app.getVersion();
  require('./main/main');
}

// Acquire the process lock before touching pending-update metadata. A second
// desktop launch must not look like a crash while the first window is loading.
const ownsSingleInstance = diagnosticMode || app.requestSingleInstanceLock();
if (!ownsSingleInstance) {
  app.quit();
} else {
  process.env.CODEGO_BOOTSTRAP_OWNS_LOCK = '1';
  try {
    const selected = appPatch.resolvePatchForLaunch(app.getPath('userData'));
    if (!selected) {
      loadBuiltInApplication();
    } else {
      process.env.CODEGO_EFFECTIVE_VERSION = selected.version;
      process.env.CODEGO_PATCH_VERSION = selected.version;
      process.env.CODEGO_PATCH_PATH = selected.path;
      require(path.join(selected.path, 'src', 'main', 'main.js'));
    }
  } catch (error) {
    try {
      const metadata = appPatch.readMetadata(app.getPath('userData'));
      if (metadata?.current) appPatch.rollbackPatch(app.getPath('userData'), metadata, error.message);
    } catch (_) {}
    console.error(`codeGO restauró la versión integrada: ${error.message}`);
    loadBuiltInApplication();
  }
}
