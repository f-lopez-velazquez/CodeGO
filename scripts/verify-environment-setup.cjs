const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const setup = require('../src/main/environment-setup');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-clean-setup-'));
  const candidate = process.env.CODEGO_TEST_PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
  try {
    const result = await setup.prepareEnvironment({
      directory: root,
      selectInterpreter: () => setup.selectPython([candidate]),
      onProgress: (percent, title, log) => {
        if (title) process.stdout.write(`[${String(percent ?? '').padStart(3)}%] ${title}\n`);
        if (log && process.env.CODEGO_VERBOSE_SETUP === '1') process.stdout.write(log);
      }
    });
    const status = setup.environmentStatus(root);
    if (!result.success || !status.ready) throw new Error('El marcador final no confirmó un entorno listo.');
    const reportDirectory = path.resolve('reports');
    fs.mkdirSync(reportDirectory, { recursive: true });
    const reportPath = path.join(reportDirectory, `environment-${process.platform}-${process.arch}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({
      success: true,
      platform: process.platform,
      arch: process.arch,
      python: {
        version: result.python.version,
        major: result.python.major,
        minor: result.python.minor,
        bits: result.python.bits
      },
      packageCount: Object.keys(result.packages).length,
      checks: result.checks
    }, null, 2));
    console.log(`Preparación limpia verificada: ${reportPath}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
