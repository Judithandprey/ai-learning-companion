import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {harness, running, deferred, withStroke, plain} from '/tmp/lc-windows-ink-original-46dbb90/apps/windows/tests/main-harness.ts';
import {newDesktopInk, parseDesktopInk} from '/tmp/lc-windows-ink-original-46dbb90/apps/windows/src/shared/desktop-ink.ts';
import {DEFAULT_RETENTION_POLICY} from '/tmp/lc-windows-ink-original-46dbb90/apps/windows/src/shared/retention.ts';
import {overlayPage, until} from '/tmp/windows-ink-original-overlay-page-review.ts';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const h=harness(), s=await running(h);
const page=await overlayPage(h,s,{...DEFAULT_RETENTION_POLICY,min_interval_ms:0});
page.pointer('pointerdown',1,100,200);page.pointer('pointermove',1,180,200);page.pointer('pointerup',1,180,200);
await page.review.pending();
const before=JSON.stringify(page.review.state().doc);
const gate=deferred();let captured=false;
const subtle=crypto.webcrypto.subtle;
const realDigest=subtle.digest.bind(subtle);
subtle.digest=function(...args){
 if(!captured){captured=true;return gate.promise.then(()=>realDigest(...args));}
 return realDigest(...args);
};
try {
 const sampling=page.review.sample();
 await until('raw-pixel hash is awaiting gate',()=>captured);
 const newId='fedcba9876543210';
 const opened=withStroke(newDesktopInk(newId,sha(newId),'2026-09-30T12:00:00Z',s.doc.display));
 page.loadForReview(opened);
 await until('the overlay Open callback changed the current document',()=>page.review.state().doc.id===newId);
 gate.resolve();await sampling;await page.review.retention().queue;
 const dir=path.join(h.userData,'captures',s.doc.id);
 const lines=fs.readFileSync(path.join(dir,'manifest.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const first=lines.find(x=>x.kind==='retained');
 const original=fs.readFileSync(path.join(dir,first.composed.ink_original.file));
 assert.equal(original.toString(),before,'exact pre-hash document bytes survive Open');
 assert.equal(first.composed.ink_session,s.doc.id);
 assert.equal(sha(original),first.composed.ink_original.sha256);
 assert.equal(parseDesktopInk(JSON.parse(original),sha(s.doc.id)).ok,true);
 await page.review.sample();await page.review.retention().queue;
 const last=fs.readFileSync(path.join(dir,'manifest.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.kind==='retained').at(-1);
 const later=JSON.parse(fs.readFileSync(path.join(dir,last.composed.ink_original.file),'utf8'));
 assert.equal(later.id,newId);assert.equal(last.composed.ink_session,newId);
 h.end('review done');await until('Stop ACK after both originals',()=>page.acks.length>0);
 console.log(JSON.stringify({result:'PASS',firstInkSession:first.composed.ink_session,secondInkSession:last.composed.ink_session,exactSnapshotBeforePixelHash:true,firstSnapshotStrictlyReadable:true,stopAcknowledged:true,userData:h.userData},null,2));
} finally {subtle.digest=realDigest;gate.resolve();}
