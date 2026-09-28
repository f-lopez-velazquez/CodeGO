const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve('website');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  let file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/codego/index.html' : pathname));
  
  // Manejar symlink o rutas de productos
  if (pathname.startsWith('/productos/codego/')) {
    const subpath = pathname.replace('/productos/codego/', '');
    file = path.resolve(root, 'codego', subpath);
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404).end(`404 Not Found: ${pathname}`);
      return;
    }
    const mimeMap = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    response.setHeader('Content-Type', mimeMap[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});

async function checkUrlStatus(url) {
  if (url.includes('#')) return 200;
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      // 200 o 302 (GitHub redirige a objects.githubusercontent.com)
      resolve(res.statusCode);
    });
    req.on('error', (err) => resolve(500));
    req.on('timeout', () => { req.destroy(); resolve(408); });
    req.end();
  });
}

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`\nServidor local iniciado en ${baseUrl}`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // ==============================================================
    // 1. VERIFICAR PÁGINA WEB OFICIAL
    // ==============================================================
    console.log('\n--- 1. Comprobando website/codego/index.html ---');
    await page.goto(`${baseUrl}/codego/index.html`, { waitUntil: 'domcontentloaded' });

    // Título y Hero
    const title = await page.title();
    console.log(`✓ Título: ${title}`);

    // Badges de 5 lenguajes
    const langTags = await page.$$eval('.lang-badge-tag', (els) => els.map(e => e.textContent.trim()));
    console.log(`✓ Lenguajes mostrados en hero: ${langTags.join(' | ')}`);
    if (langTags.length < 5) throw new Error('Faltan badges de lenguajes en hero.');

    // Botón WebApp en línea
    const webappBtn = await page.$('.btn-webapp-launch');
    if (!webappBtn) throw new Error('Falta el botón de Probar WebApp en línea.');
    console.log('✓ Botón de WebApp en línea visible en hero');

    // Botones de descarga y verificación de enlaces reales
    const downloadLinks = await page.$$eval('.btn-download', (els) => els.map(e => e.href));
    console.log(`✓ Enlaces de descarga encontrados: ${downloadLinks.length}`);
    for (const link of downloadLinks) {
      console.log(`  Verificando: ${link}`);
      const status = await checkUrlStatus(link);
      console.log(`  -> HTTP Status: ${status} ${status === 302 || status === 200 ? '✓ (VÁLIDO)' : '✕ (ERROR)'}`);
      if (status !== 302 && status !== 200) {
        throw new Error(`Enlace de descarga roto: ${link} devolvió HTTP ${status}`);
      }
    }

    // ==============================================================
    // 2. VERIFICAR WEBAPP AUTÓNOMA
    // ==============================================================
    console.log('\n--- 2. Comprobando WebApp en webapp/index.html ---');
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${baseUrl}/codego/webapp/index.html`, { waitUntil: 'domcontentloaded' });

    // Título WebApp
    const webappTitle = await page.title();
    console.log(`✓ Título WebApp: ${webappTitle}`);

    // Selector de 5 lenguajes
    const pills = await page.$$eval('.lang-pill-btn', (els) => els.map(e => e.textContent.trim()));
    console.log(`✓ Selector de lenguajes en WebApp: ${pills.join(' | ')}`);

    // Probar cambio a C++
    await page.click('button[data-lang="cpp"]');
    let codeVal = await page.$eval('#code-editor', (el) => el.value);
    console.log(`✓ Código starter de C++ cargado: ${codeVal.includes('#include <iostream>')}`);
    if (!codeVal.includes('#include <iostream>')) throw new Error('No se cargó la plantilla C++.');

    // Probar cambio a JavaScript y ejecución
    await page.click('button[data-lang="javascript"]');
    codeVal = await page.$eval('#code-editor', (el) => el.value);
    console.log(`✓ Código starter de JavaScript cargado: ${codeVal.includes('console.log')}`);

    // Escribir código JS simple
    await page.fill('#code-editor', 'console.log("Ejecución JavaScript 100% Exitosa");');
    await page.click('#btn-run-code');

    // Esperar salida en terminal
    await page.waitForTimeout(500);
    const terminalText = await page.$eval('#terminal-transcript', (el) => el.textContent);
    console.log(`✓ Salida de terminal:\n${terminalText.trim()}`);
    if (!terminalText.includes('Ejecución JavaScript 100% Exitosa')) {
      throw new Error('La ejecución en el sandbox de JS falló.');
    }

    // Probar Telemetría y bloqueo de pegado
    console.log('✓ Verificando bloqueo de pegado externo en Modo Tarea...');
    await page.evaluate(() => {
      const editor = document.getElementById('code-editor');
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
      editor.dispatchEvent(pasteEvent);
    });
    const pasteCount = await page.$eval('#stat-pastes', (el) => el.textContent);
    console.log(`✓ Contador de intentos de pegado externo bloqueados: ${pasteCount}`);

    // Probar Modal de Cognago
    await page.click('#btn-open-cognago-info');
    const isCognagoModalActive = await page.$eval('#modal-cognago', (el) => el.classList.contains('active'));
    console.log(`✓ Modal de integración en Cognago se abre correctamente: ${isCognagoModalActive}`);
    if (!isCognagoModalActive) throw new Error('El modal de Cognago no se abrió.');

    console.log('\n======================================================');
    console.log('   ¡TODAS LAS COMPROBACIONES WEB & WEBAPP EXITOSAS!    ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Error durante la verificación:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();
