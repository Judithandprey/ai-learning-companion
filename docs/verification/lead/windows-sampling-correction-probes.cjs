// Actual overlay takeSample/tick/endCapture functions with only browser/I/O fakes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const root=process.env.LC_WINDOWS_REVIEW_ROOT;
const text=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/renderer/overlay.ts','utf8'));
const funcs=text.slice(text.indexOf('async function takeSample('),text.indexOf('// ---- pixel evidence'));
const end=text.slice(text.indexOf('function endCapture('),text.indexOf('/** A grid'));
const {sampleState}=require(root+'/apps/windows/src/shared/samples.ts');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function setup({delayBitmap=false,delayHash=false}={}){
 const calls={bitmaps:0,hashes:0,closed:0,samples:[],timers:[],current:0,max:0};const bitmapGate=defer(),hashGate=defer();
 const bitmap={width:100,height:100,close(){calls.closed++}};
 const ctx={sampleState,PERIOD_MS:1000,video:{videoWidth:100},performance:{now:()=>1000},now:()=> '2026-09-30T12:00:00Z',source:{},
  createImageBitmap:async()=>{calls.bitmaps++;calls.current++;calls.max=Math.max(calls.max,calls.current);if(delayBitmap)await bitmapGate.promise;calls.current--;return bitmap},
  pixelsSha:async()=>{calls.hashes++;if(delayHash&&calls.hashes===1)await hashGate.promise;return'hash'},
  grid:()=>new Uint8Array([1]),lumaChange:()=>0,compose:()=>({width:100,height:100}),inkMarks:()=>({verified:0,changed:0,unknown:0,following_content:0}),
  release:b=>b.close(),recheckAlignment(){},noteContextChange(){},render(){},display:{bounds:{width:100,height:100}},
  lc:{sample:s=>calls.samples.push(s),ended(){}},setTimeout:(f,ms)=>calls.timers.push({f,ms})};
 vm.createContext(ctx);
 vm.runInContext('let stream=null,ended=false,endReason="",presented=1,presentedSeen=0,presentedAt=1000,raw=null,doc={id:"ink-1",ink:{revision:1,visible:[]}},prevGrid=null,seq=0,composed=null;const frameShas=new Map(),samples=[];'+funcs+end+'\nglobalThis.api={tick,endCapture,pending:()=>sampling,nextFrame:()=>{presented++;presentedAt=1000},read:()=>({ended,seq,composed,raw})}',ctx);
 return {...ctx.api,calls,bitmapGate,hashGate};
}
(async()=>{
 {
  const h=setup({delayBitmap:true});h.tick();h.tick();await flush();assert.equal(h.calls.bitmaps,1);assert.equal(h.calls.max,1);assert.equal(h.calls.timers.length,0);
  h.bitmapGate.resolve();await h.pending();await flush();assert.equal(h.calls.samples.length,2);assert.deepEqual(h.calls.samples.map(s=>s.seq),[1,2]);assert.equal(h.calls.max,1);
  console.log(JSON.stringify({case:'serialized slow bitmap samples',passed:true,sampleStates:h.calls.samples.map(s=>s.state)}));
 }
 {
  const h=setup({delayBitmap:true});h.tick();await flush();h.endCapture('Stop during bitmap');h.bitmapGate.resolve();await h.pending();
  assert.equal(h.calls.closed,1);assert.equal(h.calls.samples.length,1);assert.equal(h.calls.samples[0].state,'ended');assert.equal(h.calls.samples[0].raw,null);
  for(const timer of h.calls.timers)timer.f();await flush();assert.equal(h.calls.bitmaps,1);
  console.log(JSON.stringify({case:'Stop during bitmap closes late pixels; only ended receipt',passed:true}));
 }
 {
  const h=setup({delayHash:true});h.tick();await flush();assert.equal(h.calls.hashes,1);h.endCapture('Stop during hash');h.hashGate.resolve();await h.pending();
  assert.deepEqual(h.calls.samples.map(s=>s.state),['ended']);assert.equal(h.calls.samples[0].composed,null);
  console.log(JSON.stringify({case:'Stop during hashing suppresses live receipt',passed:true}));
 }
 {
  const h=setup({delayHash:true});h.tick();await flush();h.nextFrame();h.hashGate.resolve();await h.pending();const sample=h.calls.samples[0];
  console.log(JSON.stringify({case:'new video callback while old held bitmap hashes',recordedPresentedFrames:sample.raw.presented_frames,bitmapWasTakenWhenPresented:1,reportedState:sample.state}));
 }
})();
