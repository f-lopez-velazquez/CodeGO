const { verifySubmission } = require('../src/main/submission');
try {
  if (!process.argv[2]) throw new Error('Uso: npm run verify:submission -- /ruta/entrega.codego (también ZIP o entrega-web.json)');
  console.log(JSON.stringify(verifySubmission(process.argv[2]), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
