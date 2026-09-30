// Bounded synthetic IPC + real Linux filesystem review; no Electron/native launch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]??'/tmp/lc-windows-context-bb676';
const {harness,running,withStroke,plain,PNG_BYTES,PNG_SHA}=await import(pathToFileURL(`${root}/apps/windows/tests/main-harness.ts`));
const {forkDesktopInk,parseDesktopInk}=await import(pathToFileURL(`${root}/apps/windows/src/shared/desktop-ink.ts`));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const results=[];
async function setup(){
 const h=harness(),s=await running(h),empty=structuredClone(s.doc),doc=withStroke(s.doc);
 const picture=path.join(h.userData,'ink','context',`${PNG_SHA}.png`);
 const ink=path.join(h.userData,'ink',`${doc.id}.json`);
 const save=(d=doc,pictures=[{sha256:PNG_SHA,bytes:PNG_BYTES}])=>plain(h.handlers['lc:save-ink']({sender:s.overlay.webContents},structuredClone(d),pictures));
 const exportTo=(label)=>{const file=path.join(h.userData,`${label}.json`);const answer=plain(h.exportRecovery(doc.id,file));assert.equal(answer.ok,true);return {answer,payload:JSON.parse(fs.readFileSync(file,'utf8'))};};
 return {h,s,empty,doc,picture,ink,save,exportTo};
}
const goodPicture=payload=>{assert.equal(sha(Buffer.from(payload.context_pictures_png_base64[PNG_SHA],'base64')),PNG_SHA);assert.deepEqual(payload.context_pictures_missing,[]);};
// New held bytes at an occupied address survive pruning, Stop, repeated failure, export, then retry/reopen.
{
 const x=await setup();fs.mkdirSync(path.dirname(x.picture),{recursive:true});
 const bad=Buffer.from(PNG_BYTES);bad[bad.length-6]^=1;fs.writeFileSync(x.picture,bad);
 const st=fs.lstatSync(x.picture),answer=x.save();
 assert.equal(answer.ok,false,'occupied address must refuse save; baseline e7bdbde wrongly returns true');
 assert.deepEqual(answer.pictures_received,[PNG_SHA]);assert.match(answer.reason,/left untouched.*Move it away, then Retry/);
 assert.equal(fs.existsSync(x.ink),false);
 const copyId='fedcba9876543210',copy=forkDesktopInk(x.empty,copyId,sha(copyId),'2026-09-30T12:00:00.000Z');
 assert.equal(x.save(copy,[]).ok,true); // invokes pruneHeld while a separate recovery still needs the good picture
 assert.equal(plain(x.h.retryRecovery(x.doc.id)).ok,false);
 x.h.end('review Stop');x.h.handlers['lc:stopped']({sender:x.s.overlay.webContents},null);
 assert.equal(x.h.current(),null);
 const spare=JSON.parse(fs.readFileSync(path.join(x.h.userData,'Learning Companion unsaved ink',`${x.doc.id}.json`),'utf8'));
 goodPicture(spare);assert.deepEqual(spare.ink,JSON.parse(JSON.stringify(x.doc)));
 const exported=x.exportTo('manual-export');goodPicture(exported.payload);assert.deepEqual(exported.payload.ink,spare.ink);
 assert.deepEqual(fs.readFileSync(x.picture),bad);const now=fs.lstatSync(x.picture);assert.deepEqual([now.ino,now.mtimeMs],[st.ino,st.mtimeMs]);
 const moved=`${x.picture}.unexpected-preserved`;fs.renameSync(x.picture,moved);
 const retry=plain(x.h.retryRecovery(x.doc.id));assert.equal(retry.ok,true);assert.deepEqual(fs.readFileSync(moved),bad);
 assert.deepEqual(fs.readFileSync(x.picture),Buffer.from(PNG_BYTES));
 const saved=JSON.parse(fs.readFileSync(x.ink,'utf8'));assert.deepEqual(saved,JSON.parse(JSON.stringify(x.doc)));
 assert.equal(parseDesktopInk(saved,x.doc.ink.page.address_sha256).ok,true);
 const fresh=await running(x.h),opening=x.h.openInk(x.doc.id);
 const load=fresh.overlay.sent.find(([event])=>event==='lc:load-doc');assert(load);
 x.h.handlers['lc:load-result']({sender:fresh.overlay.webContents},{id:x.doc.id,ok:true});
 assert.equal(plain(await opening).ok,true);assert.deepEqual(plain(x.h.current().doc),saved);
 results.push({case:'occupied address survives prune/Stop/spare/export; repeated failure then move/retry/reopen',result:'PASS',save:answer,retry,userData:x.h.userData});
}
// Real read EACCES: a good received picture remains held and exportable; recover after access returns.
{
 const x=await setup();assert.equal(x.save().ok,true);fs.chmodSync(x.picture,0);
 let answer,exported;
 try {
  answer=x.save();assert.equal(answer.ok,false);assert.match(answer.reason,/writing to this device failed.*EACCES/);
  const copyId='1234567890abcdef',copy=forkDesktopInk(x.empty,copyId,sha(copyId),'2026-09-30T12:00:00.000Z');
  assert.equal(x.save(copy,[]).ok,true);
  exported=x.exportTo('read-failure-export');goodPicture(exported.payload);
 } finally {fs.chmodSync(x.picture,0o600);}
 assert.equal(plain(x.h.retryRecovery(x.doc.id)).ok,true);
 assert.equal(plain(x.h.inkContexts(x.doc.id)).items[0].picture_state,'shown');
 results.push({case:'actual read EACCES preserves held picture through prune/export/retry',result:'PASS',save:answer,userData:x.h.userData});
}
// After a successful save has released the held copy, never export or display another file as that image.
{
 const x=await setup();assert.equal(x.save().ok,true);
 const bad=Buffer.from(PNG_BYTES);bad[5]^=1;fs.writeFileSync(x.picture,bad);
 assert.equal(plain(x.h.inkContexts(x.doc.id)).items[0].picture_state,'changed on disk');
 x.h.failWrites.on=true;assert.equal(x.save(x.doc,[]).ok,false);x.h.failWrites.on=false;
 const exported=x.exportTo('disk-only-corruption');
 assert.equal(exported.answer.missing,1);assert.equal(exported.payload.context_pictures_png_base64[PNG_SHA],undefined);
 assert.deepEqual(exported.payload.context_pictures_missing,[PNG_SHA]);
 assert.deepEqual(exported.payload.context_pictures_not_matching.map(x=>x.sha256),[PNG_SHA]);
 assert.deepEqual(fs.readFileSync(x.picture),bad);
 const donor=path.join(x.h.userData,'donor.png');fs.writeFileSync(donor,PNG_BYTES);fs.unlinkSync(x.picture);fs.symlinkSync(donor,x.picture);
 const state=plain(x.h.inkContexts(x.doc.id)).items[0];assert.equal(state.picture_state,'not a file');assert.equal(state.picture,null);
 const linkExport=x.exportTo('disk-only-link');assert.equal(linkExport.answer.missing,1);assert.equal(linkExport.payload.context_pictures_png_base64[PNG_SHA],undefined);
 assert.equal(fs.lstatSync(x.picture).isSymbolicLink(),true);assert.deepEqual(fs.readFileSync(donor),Buffer.from(PNG_BYTES));
 results.push({case:'no held copy: corrupt file and even a valid-target symlink are omitted, reported and untouched',result:'PASS',userData:x.h.userData});
}
fs.writeFileSync('/tmp/windows-context-bb676-probe-results.json',JSON.stringify({root,results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
console.log(`PASS ${results.length} independent scenario groups. Existing real main.ts harness; fake Electron, real Linux files.`);
