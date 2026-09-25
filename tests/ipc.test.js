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
  const electron = {
    app: {getPath:()=>dir,whenReady:()=>({then:()=>{}}),on:()=>{}},
    ipcMain: {handle:(name,fn)=>handlers.set(name,fn)}
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
  assert.equal((await handlers.get('fs:read-file')({}, 'main.py')).success, false);
  assert.equal((await call('fs:create-file','main.py')).success,true);
  assert.equal((await call('fs:save-file',{relativePath:'main.py',content:'print("safe")'})).success,true);
  assert.equal((await call('fs:read-file','main.py')).content,'print("safe")');
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
    ['fs:rename',{oldPath:'main.py',newPath:'renamed.py'}]
  ]) assert.equal((await call(name,data)).success,false,name);
  assert.equal((await call('fs:read-file','main.py')).content,'print("safe")');
});
