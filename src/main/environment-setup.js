const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runSelfTest } = require('./self-test');

// One manifest drives installation, diagnostics and the readiness check.
const PACKAGES = [
  ['pygame','pygame','2.6.1'], ['numpy','numpy','2.5.3'], ['matplotlib','matplotlib','3.11.2'],
  ['pandas','pandas','3.0.6'], ['requests','requests','2.34.2'], ['pillow','PIL','12.3.0'],
  ['scipy','scipy','1.18.1'], ['seaborn','seaborn','0.13.2'], ['openpyxl','openpyxl','3.1.5'],
  ['sympy','sympy','1.14.0'], ['colorama','colorama','0.4.6'], ['pyserial','serial','3.5'],
  ['pyfirmata2','pyfirmata2','2.5.1'], ['pyusb','usb','1.3.1'], ['scikit-learn','sklearn','1.9.1'],
  ['opencv-python-headless','cv2','5.0.0.93'], ['websockets','websockets','17.1'], ['flask','flask','3.1.3'],
  ['httpx','httpx','0.28.1'], ['tqdm','tqdm','4.70.1'], ['rich','rich','15.0.0'], ['qrcode','qrcode','8.2'],
  ['cryptography','cryptography','48.0.1'], ['python-dotenv','dotenv','1.2.3'], ['pydantic','pydantic','2.13.5'],
  ['esptool','esptool','5.4.0'], ['smbus2','smbus2','0.6.1'], ['gpiozero','gpiozero','2.0.1.post3']
].map(([distribution,module,version]) => ({distribution,module,version}));
const OPTIONAL_HARDWARE = ['adafruit-blinka'];
const PROBE = 'import sys,struct,json; print(json.dumps({"executable":sys.executable,"major":sys.version_info.major,"minor":sys.version_info.minor,"bits":struct.calcsize("P")*8,"version":sys.version.split()[0]}))';
function compatible(info) { return info.major === 3 && [12,13].includes(info.minor) && info.bits === 64; }
function pythonPath(directory, platform=process.platform) { return path.join(directory, platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3'); }
function readyPath(directory) { return path.join(directory, 'ready.json'); }
function environmentStatus(directory) {
  const marker = readyPath(directory);
  try {
    const report = JSON.parse(fs.readFileSync(marker, 'utf8'));
    const packagesMatch = PACKAGES.every(item => report.packages?.[item.module]?.version === item.version);
    const commandExists = typeof report.command === 'string' && fs.existsSync(report.command);
    return { ready: report.schema === 2 && packagesMatch && commandExists, command: report.command, report };
  } catch (_) {
    return { ready: false, command: null, report: null };
  }
}
function cleanEnv(extra={}) {
  const env={...process.env, PYTHONIOENCODING:'utf-8', PYTHONNOUSERSITE:'1', PYGAME_HIDE_SUPPORT_PROMPT:'1', ...extra};
  for (const key of ['PYTHONHOME','PYTHONPATH','CODEGO_TEACHER_PIN','PIP_TARGET','PIP_PREFIX','PIP_USER']) delete env[key];
  return env;
}
function run(command,args,{timeout=120000,onLog=()=>{},env={},input}={}) {
  return new Promise((resolve,reject)=>{
    let child, output='', tail='', settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(output);};
    const timer=setTimeout(()=>{child?.kill();finish(new Error(`Tiempo agotado (${Math.round(timeout/1000)} s): ${args.slice(0,3).join(' ')}. Revisa la conexión y vuelve a intentar.`));},timeout);
    try {
      child=spawn(command,args,{windowsHide:true,env:cleanEnv(env),stdio:['pipe','pipe','pipe']});
      child.stdin.on('error',()=>{});
      const capture=(data)=>{const text=data.toString();output=(output+text).slice(-2000000);tail=(tail+text).slice(-3000);onLog(text);};
      child.stdout.on('data',capture); child.stderr.on('data',capture);
      child.once('error',error=>finish(error));
      child.once('close',code=>finish(code===0?null:new Error(`Proceso terminó con código ${code}. ${tail}`)));
      child.stdin.end(input);
    } catch(error){finish(error);}
  });
}
function parseResult(output) { const line=output.trim().split(/\r?\n/).reverse().find(line=>line.startsWith('{')); if(!line)throw Error('El intérprete no devolvió un diagnóstico válido.'); return JSON.parse(line); }
function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
async function retryOperation(operation,{attempts=3,delayMs=750,onRetry=()=>{},shouldRetry=()=>true}={}) {
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++) {
    try { return await operation({attempt,attempts}); }
    catch(error) {
      lastError=error;
      if(attempt>=attempts||!shouldRetry(error))throw error;
      onRetry({attempt,nextAttempt:attempt+1,attempts,error});
      await wait(delayMs*attempt);
    }
  }
  throw lastError;
}
async function probe(command,execute=run) { return parseResult(await execute(command,['-I','-c',PROBE],{timeout:15000})); }
async function selectPython(candidates,execute=run) {
  for(const item of candidates) {
    try {
      const {command,args=[]}=typeof item==='string'?{command:item}:item;
      const info=parseResult(await execute(command,[...args,'-I','-c',PROBE],{timeout:15000}));
      if(compatible(info))return info; // Resolve py.exe to a concrete executable, never its default alias.
    } catch(_) {}
  }
  return null;
}
function inspectScript() { return `import importlib, importlib.metadata, json, sys\nresult={}\nfor dist,mod,version in ${JSON.stringify(PACKAGES.map(p=>[p.distribution,p.module,p.version]))}:\n try:\n  actual=importlib.metadata.version(dist)\n  platform_limited = mod == "smbus2" and sys.platform == "win32"\n  if not platform_limited:\n   importlib.import_module(mod)\n  result[mod]={"installed":actual==version,"version":actual,"desc":dist,"platform_limited":platform_limited}\n except Exception as e:\n  result[mod]={"installed":False,"version":None,"desc":dist,"error":str(e)}\nprint(json.dumps(result))\n`; }
const MICROTESTS = `import io, json, tempfile, pathlib, sqlite3, tkinter
import numpy as np, pandas as pd, scipy.linalg, sympy, pygame, cv2, serial, requests, httpx, qrcode
from PIL import Image
from openpyxl import Workbook, load_workbook
from sklearn.linear_model import LinearRegression
from flask import Flask
from cryptography.fernet import Fernet
from pydantic import BaseModel
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
checks=[]
def check(name,fn):
 fn(); checks.append(name)
def numeric():
 assert np.dot([1,2],[3,4])==11
 assert pd.DataFrame({'a':[1,2]}).a.sum()==3
 assert round(scipy.linalg.det([[1,0],[0,2]]))==2
 assert sympy.diff(sympy.Symbol('x')**2)==2*sympy.Symbol('x')
 assert round(LinearRegression().fit([[0],[1]],[0,2]).predict([[2]])[0])==4
check('Cálculo, datos y aprendizaje automático',numeric)
def graphics():
 pygame.display.init(); pygame.display.set_mode((32,32)); pygame.display.get_surface().fill((0,120,0)); pygame.display.flip(); pygame.display.quit()
 image=Image.new('RGB',(4,4)); buf=io.BytesIO(); image.save(buf,format='PNG'); assert len(buf.getvalue())>0
 assert cv2.cvtColor(np.zeros((2,2,3),dtype=np.uint8),cv2.COLOR_BGR2GRAY).shape==(2,2)
 fig=plt.figure(); plt.plot([0,1],[0,1]); fig.savefig(io.BytesIO(),format='png'); plt.close(fig)
 qrcode.make('CodeGO').save(io.BytesIO(),format='PNG')
 assert tkinter.Tcl().eval('expr {2 + 3}')=='5'
check('Pygame, imágenes, gráficas y Tcl/Tk',graphics)
def datafiles():
 with tempfile.TemporaryDirectory() as directory:
  p=pathlib.Path(directory)/'prueba.xlsx'; book=Workbook(); book.active['A1']='José'; book.save(p); loaded=load_workbook(p); assert loaded.active['A1'].value=='José'; loaded.close()
 with sqlite3.connect(':memory:') as db: assert db.execute('select 2 + 3').fetchone()[0]==5
check('Excel, SQLite y archivos temporales',datafiles)
def serialtest():
 with serial.serial_for_url('loop://',timeout=2) as port:
  port.write(b'CodeGO'); assert port.read(6)==b'CodeGO'
check('Puerto serial virtual',serialtest)
def web():
 app=Flask('codego-test'); app.add_url_rule('/test',view_func=lambda:'ok'); assert app.test_client().get('/test').data==b'ok'
 assert requests.Request('GET','https://example.invalid').prepare().method=='GET'
 with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,text='ok'))) as client: assert client.get('https://example.invalid').text=='ok'
 key=Fernet.generate_key(); f=Fernet(key); assert f.decrypt(f.encrypt(b'ok'))==b'ok'
 class Example(BaseModel):
  value:int
 assert Example(value='3').value==3
check('HTTP local, validación y cifrado',web)
print(json.dumps({'success':True,'checks':checks}))
`;
async function verifyEnvironment(python,{execute=run,directory,onProgress=()=>{},selfTest=runSelfTest}={}) {
  const info=await probe(python,execute);
  if(!compatible(info))throw Error('Se requiere Python 3.12 o 3.13 de 64 bits para estas librerías.');
  onProgress(92,'Comprobando todas las importaciones…');
  const packages=parseResult(await execute(python,['-I','-'],{input:inspectScript(),timeout:180000}));
  const missing=PACKAGES.filter(p=>!packages[p.module]?.installed);
  if(missing.length)throw Error('Librerías pendientes o incompatibles: '+missing.map(p=>p.distribution).join(', '));
  await execute(python,['-I','-m','pip','check'],{timeout:60000});
  onProgress(96,'Micropruebas: gráficos, cálculo, archivos y comunicación…');
  const micro=parseResult(await execute(python,['-I','-'],{input:MICROTESTS,timeout:120000,env:{SDL_VIDEODRIVER:'dummy',SDL_AUDIODRIVER:'dummy',MPLBACKEND:'Agg'}}));
  const report=await selfTest({command:python,directory});
  if(!micro.success||!report.success)throw Error('Falló la comprobación del equipo: '+JSON.stringify(report.checks));
  return {python:info,packages,checks:[...micro.checks,...report.checks.filter(c=>c.success).map(c=>c.name)]};
}
async function prepareEnvironment({directory,selectInterpreter,execute=run,onProgress=()=>{},selfTest=runSelfTest,wheelhouse=null}) {
  fs.mkdirSync(directory,{recursive:true});
  const marker=readyPath(directory);
  fs.rmSync(marker,{force:true});
  onProgress(5,'Buscando Python compatible…');
  const base=await selectInterpreter();
  if(!base||!compatible(base))throw Error('Instala Python 3.12 o 3.13 de 64 bits con pip, venv y Tk. Python 3.14 no es compatible con esta batería.');
  const venv=path.join(directory,`py${base.major}${base.minor}`);
  const python=pythonPath(venv);
  onProgress(25,'Preparando el entorno aislado…');
  let valid=false;
  try {valid=compatible(await probe(python,execute));} catch(_){}
  const progressLog=text=>onProgress(null,null,text);
  if(!valid)await retryOperation(async ({attempt})=>{
    if(attempt>1)fs.rmSync(venv,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    await execute(base.executable,['-I','-m','venv',venv],{timeout:180000});
  },{attempts:2,delayMs:900,onRetry:({nextAttempt,error})=>onProgress(25,`Reintentando entorno aislado (${nextAttempt}/2)…`,`>>> La creación del entorno se interrumpió: ${error.message}\n>>> CodeGO limpiará el intento incompleto y continuará automáticamente.\n`)});
  const offline = Boolean(wheelhouse);
  if (offline && (!fs.existsSync(wheelhouse) || !fs.statSync(wheelhouse).isDirectory())) throw Error('No se encontró el almacén interno de librerías.');
  if (!offline) {
    await execute(python,['-I','-m','pip','--isolated','install','--index-url','https://pypi.org/simple','--only-binary=:all:','--disable-pip-version-check','--timeout','30','--retries','2','--upgrade','pip'],{timeout:180000,onLog:progressLog});
  }
  const packageSourceArgs = offline
    ? ['--no-index','--find-links',wheelhouse]
    : ['--index-url','https://pypi.org/simple','--timeout','30','--retries','2'];
  for(let i=0;i<PACKAGES.length;i++) {
    const p=PACKAGES[i];
    const percent=30+Math.floor(i/PACKAGES.length*58);
    onProgress(percent,`Librería ${i+1}/${PACKAGES.length}: ${p.distribution}`);
    // Wheels only: no compiler/toolchain needed and no silent source fallback.
    try { await retryOperation(()=>execute(python,['-I','-m','pip','--isolated','install',...packageSourceArgs,'--only-binary=:all:','--disable-pip-version-check',`${p.distribution}==${p.version}`],{timeout:300000,onLog:progressLog}),{
      attempts:3,
      delayMs:1000,
      onRetry:({nextAttempt,error})=>onProgress(percent,`Recuperando ${p.distribution} (${nextAttempt}/3)…`,`>>> ${p.distribution} se interrumpió: ${error.message}\n>>> Reintentando automáticamente sin perder las librerías completadas.\n`)
    }); }
    catch(error){throw Error(`No se completó ${p.distribution}. ${error.message}`);}
  }
  const report=await retryOperation(()=>verifyEnvironment(python,{execute,directory,onProgress,selfTest}),{
    attempts:2,
    delayMs:1000,
    onRetry:({nextAttempt,error})=>onProgress(92,`Repitiendo micropruebas (${nextAttempt}/2)…`,`>>> Una comprobación no terminó: ${error.message}\n>>> CodeGO repetirá la validación completa.\n`)
  });
  fs.writeFileSync(marker,JSON.stringify({schema:2,completedAt:new Date().toISOString(),command:python,source:offline?'offline-bundle':'online-repair',...report},null,2));
  onProgress(100,offline?'Entorno autónomo listo. Todas las micropruebas pasaron.':'Entorno listo. Todas las micropruebas pasaron.');
  return {success:true,command:python,source:offline?'offline-bundle':'online-repair',...report};
}
module.exports={PACKAGES,OPTIONAL_HARDWARE,PROBE,compatible,probe,selectPython,pythonPath,readyPath,environmentStatus,run,inspectScript,parseResult,retryOperation,verifyEnvironment,prepareEnvironment};
