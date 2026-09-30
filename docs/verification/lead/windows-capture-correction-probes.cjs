// Independent corrected success assertions over exact main/renderer handlers.
// Extends the retained original VM probe; no Electron, desktop or native capture.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {stripTypeScriptTypes} = require('node:module');
const root = process.env.LC_WINDOWS_REVIEW_ROOT;
const original = fs.readFileSync(require('node:path').join(__dirname, 'windows-capture-review.cjs'),'utf8');
let base = original.slice(0, original.indexOf('(async()=>{'));
base = base.replace('const windows=[], timers=[], sources=[];', 'const windows=[], timers=[], sources=[], loads=[]; let quitCalls=0;');
base = base.replace('loadURL(){return Promise.resolve()}', 'loadURL(){return (this.opts.transparent ? loads.shift() : undefined) || Promise.resolve()}');
base = base.replace('quit(){},getPath:', 'quit(){quitCalls++},getPath:');
base = base.replace('return { ...sandbox.review,windows,timers,sources,permission,handlers,sourceItem };', 'return { ...sandbox.review,windows,timers,sources,permission,handlers,sourceItem,loads,quitCalls:()=>quitCalls,starting:()=>vm.runInContext("starting",sandbox),keepUnresolved:()=>vm.runInContext("recoveries",sandbox).set("prior-session", {key:"prior-session", exported_to:null}) };');
const loader = {require,process,console,Response};
vm.createContext(loader);
vm.runInContext(base+'\nglobalThis.harnessForReview=harness;',loader);
const harness = loader.harnessForReview;
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve()};
const plain=v=>JSON.parse(JSON.stringify(v));
const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const fresh=async()=>{const h=harness();await flush();return h};
const running=async()=>{const h=await fresh();assert.equal((await h.start('screen:1:0')).ok,true);return h};
function arm(h){const s=h.current();assert.equal(h.handlers['lc:arm-capture']({sender:s.overlay.webContents}),true);let g;h.permission.request(s.overlay.webContents,'media',x=>g=x,{isMainFrame:true,mediaTypes:[]});assert.equal(g,true);return s}
function ask(h,s,answers){return h.permission.display({frame:s.overlay.webContents.mainFrame,videoRequested:true,audioRequested:false},v=>answers.push(v))}
function fire(h,ms){for(const t of h.timers.filter(t=>t.n===ms))t.f()}

test('pending Start Stop and double Start cannot revive or orphan',async()=>{
 const h=await fresh(),d=defer();h.sources.push(d.promise);const p=h.start('screen:1:0');
 assert.equal((await h.start('screen:1:0')).ok,false);h.end('user Stop');d.resolve([h.sourceItem]);
 assert.equal((await p).ok,false);assert.equal(h.current(),null);assert.equal(h.windows.filter(w=>w.opts.transparent).length,0);
});
test('late cancelled Start rejection preserves a newer pending Start',async()=>{
 const h=await fresh(),a=defer(),b=defer();h.sources.push(a.promise,b.promise);const p=h.start('screen:1:0');h.end('Stop');
 const q=h.start('screen:1:0');a.reject(Error('old enumeration fails'));
 assert.equal((await p).ok,false);assert.notEqual(h.starting(),null);assert.equal((await h.start('screen:1:0')).ok,false);
 b.resolve([h.sourceItem]);assert.equal((await q).ok,true);assert.equal(h.windows.filter(w=>w.opts.transparent&&!w.destroyed).length,1);
});
test('initial listing rejection releases Start for a fresh attempt',async()=>{
 const h=await fresh();h.sources.push(Promise.reject(Error('enumeration unavailable')));assert.equal((await h.start('screen:1:0')).ok,false);
 assert.equal(h.current(),null);assert.equal(h.starting(),null);assert.equal((await h.start('screen:1:0')).ok,true);
});
test('display grant timeout denies once and bounds session cleanup',async()=>{
 const h=await running(),s=arm(h),listing=defer(),answers=[];h.sources.push(listing.promise);const pending=ask(h,s,answers);
 fire(h,5000);await pending;assert.deepEqual(plain(answers),[{}]);assert.equal(s.ending,true);
 listing.resolve([h.sourceItem]);await flush();assert.equal(answers.length,1);fire(h,10000);assert.equal(h.current(),null);assert.equal(s.overlay.destroyed,true);
});
test('display list rejection denies once and bounds cleanup',async()=>{
 const h=await running(),s=arm(h),answers=[];h.sources.push(Promise.reject(Error('rejected listing')));await ask(h,s,answers);
 assert.deepEqual(plain(answers),[{}]);assert.equal(s.ending,true);fire(h,10000);assert.equal(h.current(),null);assert.equal(s.overlay.destroyed,true);
});
test('late display grant after Stop cannot attach to a new session',async()=>{
 const h=await running(),s=arm(h),listing=defer(),answers=[];h.sources.push(listing.promise);const pending=ask(h,s,answers);
 h.end('Stop');h.handlers['lc:stopped']({sender:s.overlay.webContents},null);assert.equal((await h.start('screen:1:0')).ok,true);const newer=h.current();
 listing.resolve([h.sourceItem]);await pending;assert.deepEqual(plain(answers),[{}]);fire(h,3000);fire(h,5000);fire(h,10000);
 assert.equal(h.current(),newer);assert.equal(newer.ending,false);
});
test('load rejection closes allocated session and permits retry',async()=>{
 const h=await fresh(),load=defer();h.loads.push(load.promise);const p=h.start('screen:1:0');await flush();const s=h.current();
 load.reject(Error('load failed'));assert.equal((await p).ok,false);assert.equal(h.current(),null);assert.equal(s.overlay.destroyed,true);
 assert.equal((await h.start('screen:1:0')).ok,true);
});
test('Stop during overlay load prevents show and later authority',async()=>{
 const h=await fresh(),load=defer();h.loads.push(load.promise);const p=h.start('screen:1:0');await flush();const s=h.current();h.end('Stop while loading');
 assert.equal(h.handlers['lc:arm-capture']({sender:s.overlay.webContents}),false);load.resolve();assert.equal((await p).ok,false);
 assert.equal(h.current(),null);assert.equal(s.overlay.shown,false);assert.equal(s.overlay.destroyed,true);
});
test('control close during overlay load stops and cleans current session',async()=>{
 const h=await fresh(),load=defer();h.loads.push(load.promise);const p=h.start('screen:1:0');await flush();const s=h.current();let prevented=false;
 h.control().emit('close',{preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(s.ending,true);
 load.resolve();assert.equal((await p).ok,false);assert.equal(h.current(),null);assert.equal(s.overlay.destroyed,true);assert.equal(h.quitCalls(),1);
});
test('late failed load from old session leaves newer session alive',async()=>{
 const h=await fresh(),load=defer();h.loads.push(load.promise);const p=h.start('screen:1:0');await flush();const old=h.current();h.end('Stop');fire(h,10000);
 assert.equal((await h.start('screen:1:0')).ok,true);const newer=h.current();load.reject(Error('old load failed'));assert.equal((await p).ok,false);
 assert.equal(h.current(),newer);assert.equal(newer.ending,false);assert.equal(old.overlay.destroyed,true);
});

const overlay=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/renderer/overlay.ts','utf8'));
const functions=overlay.slice(overlay.indexOf('async function startCapture('),overlay.indexOf('/** A grid of the frame'));
function renderer(arm,media){
 const calls={requested:0,stops:0,played:0,samples:[]};
 const ctx={lc:{armCapture:()=>arm,ended(){}},navigator:{mediaDevices:{getDisplayMedia:()=>{calls.requested++;return media}}},video:{srcObject:null,requestVideoFrameCallback(){},play:async()=>{calls.played++}},onFrame(){},takeSample:async()=>{},render(){},Promise};
 vm.createContext(ctx);vm.runInContext('let stream=null,ended=false,endReason="",sampling=Promise.resolve();'+functions+'\nglobalThis.api={startCapture,endCapture,state:()=>({ended,hasStream:!!stream,shown:!!video.srcObject})}',ctx);
 const track={getSettings:()=>({displaySurface:'monitor'}),addEventListener(){},stop(){calls.stops++}};
 return {...ctx.api,calls,stream:{getVideoTracks:()=>[track],getAudioTracks:()=>[],getTracks:()=>[track]}};
}
test('actually pending media stream is stopped once without playing after Stop',async()=>{
 const media=defer(),r=renderer(Promise.resolve(true),media.promise),p=r.startCapture();await flush();assert.equal(r.calls.requested,1);
 r.endCapture('Stop pending grant');media.resolve(r.stream);await p;assert.equal(r.calls.stops,1);assert.equal(r.calls.played,0);assert.deepEqual(plain(r.state()),{ended:true,hasStream:false,shown:false});
});
test('late arm permission after Stop makes no media request',async()=>{
 const arm=defer(),r=renderer(arm.promise,Promise.resolve(null)),p=r.startCapture();r.endCapture('Stop before arm');arm.resolve(true);await p;
 assert.equal(r.calls.requested,0);assert.equal(r.calls.played,0);
});

// Characterization only: closes the control while the initial display listing is pending.
// A mock quit deliberately records the request without terminating JS, as needed to expose late work.
async function pendingCloseObservation(unsaved=false){
 const h=await fresh(),listing=defer();h.sources.push(listing.promise);const p=h.start('screen:1:0');let prevented=false;
 if(unsaved)h.keepUnresolved();
 const control=h.control();control.emit('close',{preventDefault(){prevented=true}});if(!prevented)control.destroy();
 listing.resolve([h.sourceItem]);const result=await p;
 return {case:'control-close-pending-initial-list',priorUnresolvedInk:unsaved,closePrevented:prevented,quitCalls:h.quitCalls(),result:plain(result),current:!!h.current(),overlayShown:!!h.current()?.overlay.shown};
}
(async()=>{
 let failed=0;
 for(const {name,fn} of (process.env.LC_REVIEW_CLOSE_ONLY?[]:tests)){try{await fn();console.log(JSON.stringify({name,result:'pass'}))}catch(e){failed++;console.log(JSON.stringify({name,result:'FAIL',error:String(e.stack)}))}}
 console.log(JSON.stringify(await pendingCloseObservation()));
 console.log(JSON.stringify(await pendingCloseObservation(true)));
 console.log(JSON.stringify({passed:(process.env.LC_REVIEW_CLOSE_ONLY?0:tests.length)-failed,failed}));process.exitCode=failed?1:0;
})();
