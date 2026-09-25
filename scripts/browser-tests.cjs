const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve('src/renderer');
const server = http.createServer((request,response) => {
  const pathname = new URL(request.url,'http://localhost').pathname;
  const file = path.resolve(root,'.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const relative = path.relative(root,file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
  fs.readFile(file,(error,data)=> {
    if(error) { response.writeHead(404).end(); return; }
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});
(async()=> {
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({headless:true, executablePath:process.env.CODEGO_BROWSER_BINARY || undefined});
    const page = await browser.newPage();
    const run = vm.runInThisContext(fs.readFileSync('tests/browser-regression.js','utf8'));
    const result = await run(page,`http://127.0.0.1:${server.address().port}`);
    fs.mkdirSync('reports',{recursive:true});
    fs.writeFileSync('reports/browser.json',JSON.stringify({success:true,version:require('../package.json').version,...result},null,2));
    console.log(`Interfaz: ${result.viewports.length} combinaciones verificadas, ${result.errors.length} errores.`);
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { await browser?.close(); server.close(); }
})();
