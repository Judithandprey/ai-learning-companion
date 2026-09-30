// Independent failure characterization for exact Windows candidate 6584ab1.
// Injected VM/I/O only; not an Electron or physical-device acceptance check.
// LC_WINDOWS_REVIEW_ROOT must point at an extraction of that exact commit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
const root = process.env.LC_WINDOWS_REVIEW_ROOT || process.cwd();
const { newDesktopInk, parseDesktopInk } = await import(root + '/apps/windows/src/shared/desktop-ink.ts');
const { addStroke } = await import(root + '/apps/safari-extension/src/ink.ts');
const main=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/main/main.ts','utf8'));
const overlay=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/renderer/overlay.ts','utf8'));
const sha256=s=>createHash('sha256').update(s).digest('hex');
const id='0123456789abcdef';
const display={display_id:'screen1',label:'Display 1',bounds:{x:0,y:0,width:1280,height:800},scale_factor:1};
const original=newDesktopInk(id,sha256(id),'2026-09-30T00:00:00Z',display);
const stroke={id:'s1',input:'pen',display:'screen',points:[[10,10,0,.5],[100,100,20,.5]],created_at:'2026-09-30T00:00:01Z',source:{title:'Display 1',viewport:{width:1280,height:800,dpr:1},scroll:{x:0,y:0}},anchor:null,derived_from:null};
const changed={...original,ink:addStroke(original.ink,stroke,stroke.created_at)};
for(const quitting of [false,true]) {
 let destroyed=false,quitCount=0,savedFiles=new Map();
 const handlers={};
 const renderer={};
 const overlayWindow={isDestroyed:()=>destroyed,destroy:()=>{destroyed=true;delete renderer.recoverable;},webContents:{}};
 const mainCtx=vm.createContext({current:{doc:original,overlay:overlayWindow,opening:null},lastEnd:'stopped by the user',control:null,quitting,app:{quit:()=>quitCount++},notifyControl(){},fromOverlay:()=>true,ipcMain:{on:(name,fn)=>handlers[name]=fn},sha256,parseDesktopInk,isSessionId:v=>/^[0-9a-f]{16}$/.test(v),inkFile:id=>'/ink/'+id+'.json',inkDir:()=>'/ink',existsSync:path=>savedFiles.has(path),readFileSync:path=>savedFiles.get(path),mkdirSync(){},writeFileSync(){throw new Error('EIO: persistent save failure (injected)');},renameSync(){},rmSync(){},process:{pid:123}});
 vm.runInContext(main.slice(main.indexOf('function saveInk('),main.indexOf('/** Offers saved ink')),mainCtx);
 vm.runInContext(main.slice(main.indexOf('function finish('),main.indexOf('const sessionInfo')),mainCtx);
 vm.runInContext(main.slice(main.indexOf("ipcMain.on('lc:stopped'"),main.indexOf('// ---- app')),mainCtx);
 const renderCtx=vm.createContext({doc:changed,lastSaved:original,saveChain:Promise.resolve(),sampling:Promise.resolve(),unsaved:null,saveText:'',now:()=>'',render(){},endCapture(){},Promise,Date,lc:{saveInk:d=>Promise.resolve(mainCtx.saveInk(d)),onStop:fn=>renderer.stop=fn,stopped:reason=>handlers['lc:stopped']({},reason)}});
 renderer.recoverable=changed;
 vm.runInContext(overlay.slice(overlay.indexOf('function save()'),overlay.indexOf('function evidenceFor')),renderCtx);
 vm.runInContext('const saveIfChanged = () => doc === lastSaved ? saveChain : save();',renderCtx);
 vm.runInContext(overlay.slice(overlay.indexOf('lc.onStop('),overlay.indexOf('// Test support')),renderCtx);
 await renderCtx.save();
 assert.equal(renderCtx.doc.ink.visible.length,1);
 assert.match(renderCtx.unsaved,/EIO/);
 renderer.stop('stopped by the user');
 await new Promise(ok=>setImmediate(ok));
 assert.equal(mainCtx.current,null);
 assert.equal(destroyed,true);
 assert.equal(savedFiles.size,0);
 assert.match(mainCtx.lastEnd,/newest ink could not be saved/);
 assert.equal(quitCount,quitting?1:0);
 console.log(JSON.stringify({probe:quitting?'close_after_failed_save':'stop_after_failed_save',actual:{destroyed,session:mainCtx.current,files:savedFiles.size,quitCount,message:mainCtx.lastEnd},failedInvariant:'Newest editable ink has no recoverable retention after Stop/close'}));
}
const evidenceCtx=vm.createContext({raw:{seq:2,at:'2026-09-30T00:00:02Z'},regionOf:()=>({x:0,y:0,width:100,height:100}),fingerprintOf:()=>new Uint8Array(256),fingerprintToBase64:x=>Buffer.from(x).toString('base64')});
vm.runInContext(overlay.slice(overlay.indexOf('function evidenceFor('),overlay.indexOf('// ---- ASK')),evidenceCtx);
const evidence=evidenceCtx.evidenceFor(stroke);
assert.equal(evidence.frame_seq,2);
console.log(JSON.stringify({probe:'stroke_context_taken_at_commit',beginFrame:1,endFrame:2,savedFrame:evidence.frame_seq,savedKeys:Object.keys(evidence),originalImageStored:false}));
