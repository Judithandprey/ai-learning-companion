import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
const repo='/home/agentsdock/Projects/learning-companion/repo';
const root='/tmp/lc-win-qafix-70cb7e8';
const current=fs.readFileSync(root+'/apps/windows/src/main/main.ts','utf8');
const old=fs.readFileSync('/tmp/windows-qa03-old-main.ts','utf8');
const harness=fs.readFileSync(root+'/apps/windows/tests/main-harness.ts','utf8');
const appSlice=harness.slice(harness.indexOf('  const quits ='),harness.indexOf('  const sandbox ='));
const observations=[];
function gate(source,link) {
  const start=source.indexOf('let linkQuitting:');
  const end=source.indexOf('\n});',start)+5;
  assert.ok(start>=0&&end>start);
  const context={EventEmitter,setImmediate,link,userData:'/tmp/not-used'};
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(appSlice+'\n'+source.slice(start,end)+'\nglobalThis.inspect={app,quits};'),context);
  return context.inspect;
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function flush(){for(let i=0;i<5;i++)await turn();}
for(const [name,source,expected] of [['old_5871981',old,{n:0,ignored:1}],['corrected_5cd0bec',current,{n:1,ignored:0}]]) {
 test(name+': already-settled idle link',async()=>{
  let calls=0;
  const g=gate(source,{quit:bound=>{assert.equal(bound,20000);calls++;return Promise.resolve();}});
  g.app.quit(); await flush();
  assert.deepEqual({...g.quits},expected);assert.equal(calls,1);
  observations.push({case:name+'_idle',quit_calls:calls,...g.quits});
 });
}
for(const completion of ['resolve','reject'])test('corrected: repeated quit waits for one pending '+completion,async()=>{
 let settle,calls=0;
 const pending=new Promise((resolve,reject)=>settle=()=>completion==='resolve'?resolve():reject(new Error('synthetic shutdown failure')));
 const g=gate(current,{quit:bound=>{assert.equal(bound,20000);calls++;return pending;}});
 g.app.quit();await flush();g.app.quit();await flush();
 assert.deepEqual({...g.quits},{n:0,ignored:0});assert.equal(calls,1);
 settle();await flush();assert.deepEqual({...g.quits},{n:1,ignored:0});assert.equal(calls,1);
 observations.push({case:'pending_'+completion,quit_calls:calls,...g.quits});
});
test('corrected: disconnected app exits without link shutdown',async()=>{
 const g=gate(current,null);g.app.quit();await flush();
 assert.deepEqual({...g.quits},{n:1,ignored:0});observations.push({case:'no_link',...g.quits});
});
test('original Stop, finish, unsaved ink and control-close guards remain byte identical',()=>{
 const spans=[['/** Ends the session:','// ---- whole-display retention'],["  control.on('close',",'  await control.loadURL']];
 for(const [a,b]of spans){assert.ok(old.includes(a)&&current.includes(a)&&old.includes(b)&&current.includes(b));assert.equal(current.slice(current.indexOf(a),current.indexOf(b)),old.slice(old.indexOf(a),old.indexOf(b)));}
 observations.push({case:'unchanged_local_stop_and_ink_guards',spans:spans.length,byte_identical:true});
});
after(()=>fs.writeFileSync('/tmp/windows-qa03-quit-probes.json',JSON.stringify({candidate:'5cd0bec87db7a1f0989ab8e7f0ed702261dbccf2',evidence_commit:'70cb7e872e1cc7826d5b108ccc006b758d3cfb70',scope:'Linux exact production callback with candidate Electron-event model; no native app/host/DB/service; old failure is model observation supported separately by author runtime receipt',observations},null,2)+'\n'));
