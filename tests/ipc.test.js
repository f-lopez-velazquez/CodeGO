const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

test('IPC rejects escaped paths and protects sealed files without touching OS controls', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codego-ipc-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const handlers = new Map();
  const filename = path.resolve(__dirname, '../src/main/main.js');
  const realRequire = createRequire(filename);
  const revealed = [];
  const electron = {
    app: {getPath:()=>dir,whenReady:()=>({then:()=>{}}),on:()=>{},requestSingleInstanceLock:()=>true,quit:()=>{}},
    ipcMain: {handle:(name,fn)=>handlers.set(name,fn)},
    shell: {showItemInFolder:filePath=>revealed.push(filePath),openPath:async filePath=>{revealed.push(filePath);return '';}}
  };
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : realRequire(name),
    __dirname:path.dirname(filename),process,console,Buffer,URL,setTimeout,clearTimeout,setInterval,clearInterval
  });
  vm.runInContext(fs.readFileSync(filename,'utf8'),context);
  vm.runInContext('setupIpcHandlers();',context);
  vm.runInContext('mainWindow = { webContents: { mainFrame: {} } };',context);
  const sender = vm.runInContext('mainWindow.webContents',context);
  const event = {sender,senderFrame:sender.mainFrame};
  const call = (name,data) => handlers.get(name)(event,data);
  const workspace = path.join(dir, 'exam_workspace');
  const initialWorkspace = await call('workspace:get-current');
  assert.equal(initialWorkspace.selected, false);
  assert.deepEqual(JSON.parse(JSON.stringify((await call('fs:list-workspace')).tree)), []);
  assert.equal((await handlers.get('fs:read-file')({}, 'main.py')).success, false);
  assert.equal((await call('fs:create-file','main.py')).success,true);
  assert.equal((await call('fs:save-file',{relativePath:'main.py',content:'print("safe")'})).success,true);
  assert.equal((await call('fs:read-file','main.py')).content,'print("safe")');
  assert.equal((await call('fs:create-folder','ejercicios')).success,true);
  const moved = await call('fs:move',{sourcePath:'main.py',targetDirectory:'ejercicios'});
  assert.deepEqual(JSON.parse(JSON.stringify(moved)), {success:true,oldPath:'main.py',path:'ejercicios/main.py'});
  assert.equal((await call('fs:read-file','ejercicios/main.py')).content,'print("safe")');
  assert.equal((await call('fs:move',{sourcePath:'ejercicios',targetDirectory:'ejercicios'})).success,false);
  assert.equal((await call('fs:move',{sourcePath:'ejercicios/main.py',targetDirectory:''})).success,true);
  const renamed = await call('fs:rename',{oldPath:'main.py',newPath:'programa.py'});
  assert.deepEqual(JSON.parse(JSON.stringify(renamed)), {success:true,oldPath:'main.py',path:'programa.py'});
  assert.equal((await call('fs:rename',{oldPath:'programa.py',newPath:'otra/programa.py'})).success,false);
  assert.equal((await call('fs:rename',{oldPath:'programa.py',newPath:'main.py'})).success,true);
  fs.writeFileSync(path.join(workspace,'muestra.png'), Buffer.from([137,80,78,71]));
  const preview = await call('fs:preview-file','muestra.png');
  assert.equal(preview.success,true);
  assert.equal(preview.kind,'image');
  assert.match(preview.dataUrl,/^data:image\/png;base64,/);
  assert.equal((await call('fs:preview-file','main.py')).success,false);
  assert.equal((await call('fs:reveal-item','main.py')).success,true);
  // macOS exposes /var through the canonical /private/var path. The workspace
  // guard intentionally resolves links before revealing an item.
  assert.equal(revealed.at(-1),path.join(fs.realpathSync(workspace),'main.py'));
  vm.runInContext('mainWindow.isDestroyed = () => true;', context);
  assert.equal((await call('fs:read-file','main.py')).success, false);
  vm.runInContext('mainWindow.isDestroyed = () => false;', context);
  assert.equal((await call('fs:delete','.')).success,false);
  assert.equal((await call('python:run',{relativePath:'../../escape.py',code:'print("bad")'})).success,false);
  assert.equal((await call('fs:save-file',{relativePath:'../outside.py',content:'bad'})).success,false);
  assert.equal(fs.existsSync(path.join(dir,'outside.py')),false);
  vm.runInContext('workspaceSealed = true;',context);
  for (const [name,data] of [
    ['fs:save-file',{relativePath:'main.py',content:'modified'}],
    ['fs:create-file','other.py'],['fs:create-folder','other'],['fs:delete','main.py'],
    ['fs:rename',{oldPath:'main.py',newPath:'renamed.py'}],
    ['fs:move',{sourcePath:'main.py',targetDirectory:'ejercicios'}]
  ]) assert.equal((await call(name,data)).success,false,name);
  assert.equal((await call('fs:read-file','main.py')).content,'print("safe")');
  const restoredDirectory = path.join(dir, 'proyecto-restaurado');
  fs.mkdirSync(restoredDirectory);
  const restored = await call('workspace:restore', restoredDirectory);
  assert.equal(restored.success, true);
  assert.equal(restored.workspacePath, restoredDirectory);
  assert.equal((await call('workspace:get-current')).workspacePath, restoredDirectory);
  const unavailable = await call('workspace:restore', path.join(dir, 'proyecto-inexistente'));
  assert.equal(unavailable.success, false);
  assert.equal(unavailable.missing, true);
});
