// Exact 57dab9721f3cc76830fc386edd754a54cc054ecb. No Electron launch.
// Main source is executed by the candidate's small Electron fakes; assertions here are independent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { stripTypeScriptTypes } from 'node:module';
import { harness, running, withStroke, PNG_BYTES, PNG_SHA, plain } from './windows-ink-correction-harness.ts';
const root=process.env.LC_WINDOWS_REVIEW_ROOT;
if (!root) throw new Error('Set LC_WINDOWS_REVIEW_ROOT to exact 57dab97 export');
const overlay=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/renderer/overlay.ts','utf8'));
const { newDesktopInk, parseDesktopInk, MAX_CONTEXTS, NOT_OBSERVED, contextImages }=await import(root+'/apps/windows/src/shared/desktop-ink.ts');
const { addStroke }=await import(root+'/apps/safari-extension/src/ink.ts');
const samples=await import(root+'/apps/windows/src/shared/samples.ts');
const sha256=x=>createHash('sha256').update(x).digest('hex');
const slice=(begin,end)=>{assert.ok(overlay.includes(begin)&&overlay.includes(end));return overlay.slice(overlay.indexOf(begin),overlay.indexOf(end));};
const tick=()=>new Promise(r=>setImmediate(r));
const outputs=[];
const report=(group,observed)=>{outputs.push({group,...observed});console.log(JSON.stringify(outputs.at(-1)));};

for(const action of ['stop','overlay-close','app-close']){
 const h=harness(), s=await running(h), original=plain(withStroke(s.doc));
 h.failWrites.on=true;
 const save=h.handlers['lc:save-ink']({sender:s.overlay.webContents},original,[{sha256:PNG_SHA,bytes:PNG_BYTES}]);
 assert.equal(save.ok,false); assert.match(save.reason,/EIO/);
 let prevented=false;
 if(action==='stop')h.end('stop');
 else (action==='overlay-close'?s.overlay:h.control()).emit('close',{preventDefault(){prevented=true;}});
 if(action!=='stop')assert.ok(prevented);
 h.handlers['lc:stopped']({sender:s.overlay.webContents},save.reason);
 assert.equal(h.current(),null);assert.equal(h.recoveryInfo().length,1);
 prevented=false;h.control().emit('close',{preventDefault(){prevented=true;}});assert.ok(prevented);
 h.failWrites.on=false;
 const file=path.join(h.userData,'independent-export.json');
 assert.deepEqual(plain(h.exportRecovery(original.id,file)),{ok:true,missing:0});
 const exported=JSON.parse(fs.readFileSync(file));assert.deepEqual(exported.ink,original);
 assert.equal(sha256(Buffer.from(exported.context_pictures_png_base64[PNG_SHA],'base64')),PNG_SHA);
 assert.equal(h.retryRecovery(original.id).ok,true);
 const reread=JSON.parse(fs.readFileSync(path.join(h.userData,'ink',original.id+'.json')));
 assert.deepEqual(reread,original);assert.equal(h.inkContexts(original.id).items[0].picture_state,'shown');
 fs.unlinkSync(path.join(h.userData,'ink','context',PNG_SHA+'.png'));
 assert.equal(h.inkContexts(original.id).items[0].picture_state,'missing');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.userData,'ink',original.id+'.json'))),original);
 report('EIO '+action,{retained:true,exportExact:true,retryExact:true,missingOriginalExplicit:true});
}

// Stop with a live stroke: run the actual callback, not a rewritten lifecycle.
{
 const h=harness(),s=await running(h);let callback,stopped,saveCalls=0;
 const ctx=vm.createContext({doc:s.doc,lastSaved:s.doc,saveChain:Promise.resolve(),sampling:Promise.resolve(),unsaved:null,
  gesture:{kind:'ink',points:[[10,10,0,.5],[40,40,30,.5]],open:true},
  save(){saveCalls++;return Promise.resolve();},endCapture(){},
  lc:{onStop:f=>callback=f,stopped:reason=>{stopped=reason;h.handlers['lc:stopped']({sender:s.overlay.webContents},reason);}}});
 vm.runInContext('const saveIfChanged=()=>doc===lastSaved?saveChain:save();\n'+slice('lc.onStop(','// Test support'),ctx);
 h.end('stop while pen is down');callback('stop while pen is down');await tick();
 assert.equal(s.overlay.destroyed,true);assert.equal(stopped,null);assert.equal(saveCalls,0);
 assert.equal(h.recoveryInfo().length,0);assert.equal(ctx.gesture.points.length,2);
 report('active stroke Stop',{blocker:true,pointsDiscarded:2,overlayDestroyed:true,saveCalls,recoveryCount:0,reportedUnsaved:stopped});
}

// Capture dataflow: start context must retain frame 1 and the next written segment frame 2.
class FakeCanvas{
 constructor(width,height){this.width=width;this.height=height;this.draws=[];this.context={drawImage:(...a)=>this.draws.push(a),getImageData:()=>({data:this.draws[0][0].pixels}),scale(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};}
 getContext(){return this.context;}
}
{
 const mk=(seq,luma)=>({seq,at:'t'+seq,presented:seq,bitmap:{width:1280,height:800,pixels:Uint8ClampedArray.from({length:1024},(_,i)=>i%4===3?255:(Math.floor(i/4)%2?luma:0)),close(){}}});
 const first=mk(1,200),second=mk(2,80);
 const g={kind:'ink',points:[[40,40,0,.5]],contexts:[{frame:first,from_point:0,reason:'writing_started'}],changesNotKept:0,open:true};
 const ctx=vm.createContext({...samples,MAX_CONTEXTS,NOT_OBSERVED,MAX_CROP_PIXELS:4_000_000,SAME_PIXELS:.06,raw:second,gesture:g,frameShas:new Map([[1,'a'.repeat(64)],[2,'b'.repeat(64)]]),display:{bounds:{x:0,y:0,width:1280,height:800}},OffscreenCanvas:FakeCanvas,pin(){},unpin(){}});
 vm.runInContext(slice('const regionOf =','const aligned ='),ctx);
 ctx.noteContextChange();g.points.push([80,80,30,.5]);
 const made=ctx.strokeEvidence(g);
 assert.deepEqual(plain(made.evidence.contexts.map(c=>[c.frame_seq,c.from_point])),[[1,0],[2,1]]);
 assert.equal(made.evidence.frame_seq,1);
 assert.equal(made.crops[0].draws[0][0],first.bitmap);assert.equal(made.crops[1].draws[0][0],second.bitmap);
 assert.ok(made.crops.every(c=>c.width>16&&c.height>16));
 assert.deepEqual(plain(made.evidence.contexts[0].not_observed),[...NOT_OBSERVED]);
 report('stroke starting and changed crop',{frames:[1,2],crops:made.crops.map(c=>[c.width,c.height]),unknownsPreserved:true,limit:'canvas draw dataflow only, no physical capture'});
}

// Actual composition and ASK path: block PNG encoding while the next sample changes alignment.
{
 const h=harness(),s=await running(h),doc=withStroke(s.doc),nodes={};let releaseBlob;
 const strokes=[];
 class DrawingCanvas extends FakeCanvas{
  constructor(w,h){super(w,h);this.context.setLineDash=d=>this.dashes=d;this.context.stroke=()=>strokes.push([...this.dashes]);}
  convertToBlob(){return new Promise(r=>releaseBlob=r);}
 }
 const ctx=vm.createContext({display:s.doc.display,doc,raw:{bitmap:{width:1280,height:800},seq:2,at:'2026-09-30T00:00:00Z'},ended:false,
  aligned:new Map([['s1','unknown']]),mode:{mode:'ASK',askEpoch:1},OffscreenCanvas:DrawingCanvas,
  FileReader:class{readAsDataURL(){this.result='data:image/png;base64,fake';this.onload();}},
  $:id=>nodes[id]??=( {} ),setMode(){},reduceMode:()=>({state:{}}),...samples});
 vm.runInContext(slice('function compose(','/**\n * One sample.')+slice('const unsure =','// ---- ink')+slice('function line(','let gesture')+slice('const regionOf =','function fingerprintOf(')+slice('const dashedNote =','// ---- modes'),ctx);
 for(const [placement,alignment] of [['screen','unknown'],['screen','changed'],['content','verified']]){
  doc.ink.strokes.s1.display=placement;ctx.aligned.set('s1',alignment);strokes.length=0;
  ctx.compose(ctx.raw.bitmap,doc.ink);assert.deepEqual(strokes,[[7,5]]);
 }
 report('composed uncertainty drawing',{unknownDashed:true,changedDashed:true,contentFollowingDashed:true});
 doc.ink.strokes.s1.display='screen';ctx.aligned.set('s1','unknown');strokes.length=0;
 // Unknown must be dashed in the actual composited pixels.
 const ask=ctx.finishAsk([[10,10,0,.5],[50,50,20,.5]]);
 assert.deepEqual(strokes,[[7,5]]);
 ctx.aligned.set('s1','verified');releaseBlob({});await ask;
 assert.ok(!nodes.cardText.textContent.includes('drawn dashed'));
 report('ASK uncertainty snapshot',{blocker:true,imageStrokeDashes:strokes,alignmentWhenDrawn:'unknown',alignmentWhileEncoding:'verified',cardClaimsNoUncertainty:!nodes.cardText.textContent.includes('drawn dashed')});
}
// A backlog of context encodes is submitted together because save() waits for contextsSettled().
// Use genuine distinct 1x1 RGBA PNGs, not malformed payloads.
{
 const crc32=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(kind,data)=>{const t=Buffer.from(kind),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([size,t,data,crc]);};
 const png=i=>{const head=Buffer.alloc(13);head.writeUInt32BE(1,0);head.writeUInt32BE(1,4);head[8]=8;head[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(Buffer.from([0,i&255,i>>8,70,255]))),chunk('IEND',Buffer.alloc(0))]);};
 const h=harness(),s=await running(h),template=plain(withStroke(s.doc));let d=plain(s.doc);const pictures=[];
 for(let i=0;i<257;i++){
  const bytes=Uint8Array.from(png(i)),sha=sha256(bytes),id='stroke'+i,stroke={...template.ink.strokes.s1,id};
  const e=structuredClone(template.evidence.s1);e.contexts[0].image.sha256=sha;
  d={...d,ink:addStroke(d.ink,stroke,stroke.created_at),evidence:{...d.evidence,[id]:e}};
  pictures.push({sha256:sha,bytes});
 }
 assert.equal(parseDesktopInk(d,sha256(d.id)).ok,true);
 const saved=h.handlers['lc:save-ink']({sender:s.overlay.webContents},d,pictures);
 assert.deepEqual(plain(saved),{ok:true,received:true});
 const missing=contextImages(d).filter(sha=>!fs.existsSync(path.join(h.userData,'ink','context',sha+'.png')));
 assert.equal(missing.length,1);
 const ctx=vm.createContext({doc:d,lastSaved:null,saveChain:Promise.resolve(),saveText:'',unsaved:null,contextImages,pendingImages:new Map(pictures.map(p=>[p.sha256,p.bytes])),contextsSettled:async()=>{},lc:{saveInk:async()=>saved},render(){}});
 vm.runInContext(slice('function save()','// ---- ASK'),ctx);await ctx.save();
 assert.equal(ctx.pendingImages.size,0);
 report('context picture receipt cap',{blocker:true,offeredPictures:257,storedPictures:256,reply:plain(saved),rendererStillHolds:ctx.pendingImages.size,discardedOriginalSha:missing[0]});
}
fs.writeFileSync('/tmp/windows-ink-independent-results.json',JSON.stringify(outputs,null,2)+'\n');
