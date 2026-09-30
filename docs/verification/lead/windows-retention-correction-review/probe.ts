import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { harness, running, plain, deferred } from './correction-review-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { png } from './png.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
const results: unknown[] = [];
const facts = (seq: number) => ({sample_seq:seq,frame_seq:seq,reason:'changed',deferred_samples_not_retained:[],sampled_at:'2026-09-30T12:00:00.000Z',taken_at:'2026-09-30T12:00:00.000Z',monotonic_ms:seq,state:'fresh',gap_ms:null,presented_frames:seq,stream_presented_frames:seq,presentation_ms:null,frame_age_ms:null,raw:{width:8,height:5,pixels_sha256:'f'.repeat(64),change_from_previous_sample:null},composed:null});
const file = (h:any,s:any) => path.join(h.userData,'captures',s.doc.id,'manifest.jsonl');
const lines = (h:any,s:any) => fs.readFileSync(file(h,s),'utf8').trim().split('\n').map(JSON.parse);
const sender=(s:any)=>({sender:s.overlay.webContents});
const retain=async(h:any,s:any,seq:number)=>plain(await h.handlers['lc:retain-frame'](sender(s),facts(seq),png(8,5,seq),null)) as any;
{
 const h=harness(), s=await running(h);
 assert.equal((await retain(h,s,1)).ok,true);
 const prefix=fs.readFileSync(file(h,s));
 h.failWrites.partialAppend=23; h.failWrites.truncate=true;
 assert.equal((await retain(h,s,2)).ok,false);
 assert.equal((await retain(h,s,2)).ok,false);
 h.failWrites.truncate=false;
 assert.equal((await retain(h,s,2)).ok,true);
 const all=lines(h,s);
 assert.equal(fs.readFileSync(file(h,s)).subarray(0,prefix.length).equals(prefix),true);
 assert.deepEqual(all.map(x=>x.kind),['header','retained','unwritten','retained']);
 assert.equal(all[2].count,2); assert.equal(all[3].sample_seq,2);
 results.push({group:'partial append + repair failure + same-sample retry',result:'PASS',kinds:all.map(x=>x.kind),unwritten:2,file:file(h,s)});
}
{
 const clock={now:0}, h=harness(clock), s=await running(h);
 assert.equal((await retain(h,s,1)).ok,true);
 h.end('hard cap probe');
 h.handlers['lc:stopping'](sender(s),[{sample_seq:100,deferred_samples_not_retained:[98,99]}]);
 const alive=[];
 for(let i=1;i<=6;i++) {
   clock.now=i*10000;
   assert.equal((await retain(h,s,i+1)).ok,true); // real retained-frame handler completes work before each timer
   h.fire(10000); alive.push(h.current()!==null);
 }
 assert.deepEqual(alive,[true,true,true,true,true,false]);
 const all=lines(h,s), unfinished=all.find(x=>x.kind==='unfinished');
 assert.deepEqual(unfinished.samples,[100]); assert.deepEqual(unfinished.deferred_samples_not_retained,[98,99]);
 assert.equal(s.overlay.destroyed,true);
 const before=fs.readFileSync(file(h,s));
 assert.equal((await retain(h,s,100)).ok,false);
 assert.equal(before.equals(fs.readFileSync(file(h,s))),true);
 results.push({group:'progress waits and hard cap stops at 60000 ms; late sender refused',result:'PASS',alive,unfinished,file:file(h,s)});
}
{
 const h=harness(),s=await running(h);
 await retain(h,s,1);h.end('torn final end');h.failWrites.partialAppend=23;h.failWrites.truncate=true;
 h.handlers['lc:stopped'](sender(s),null);
 const shown=plain((h.control() as any).sent.filter((x:any)=>x[0]==='lc:retention').at(-1)[1]) as any;
 assert.deepEqual([shown.ended,shown.end_recorded,shown.unwritten],[true,false,0]);
 assert.throws(()=>lines(h,s));
 h.app.emit('before-quit');assert.throws(()=>lines(h,s));
 h.failWrites.truncate=false;h.app.emit('before-quit');
 const all=lines(h,s);assert.deepEqual(all.map(x=>x.kind),['header','retained','ended']);assert.match(all[2].note,/recorded late/);
 results.push({group:'torn ended append stays unconfirmed; before-quit repairs and retries exact end',result:'PASS',shown,kinds:all.map(x=>x.kind),file:file(h,s)});
}
{
 const h=harness(),s=await running(h),page=await overlayPage(h as any,s,{...DEFAULT_RETENTION_POLICY,min_interval_ms:0});
 const gate=deferred<void>();page.encoding.gate=gate.promise;
 await page.review.sample();h.end('encoding refusal at stop');
 await until('Stop delivered',()=>page.review.state().ended);
 assert.equal(page.acks.length,0);
 gate.reject(new Error('review injected encoder failure'));
 await until('encoding failure recorded and Stop acknowledged',()=>page.acks.length===1);
 const all=lines(h,s);
 assert.deepEqual(all.map(x=>x.kind),['header','not_retained','ended']);
 assert.match(all[1].reason,/could not be encoded or sent/);assert.equal(all[1].samples,1);
 assert.deepEqual(page.acks,[null]);assert.equal(h.current(),null);
 results.push({group:'queued PNG encoding fails after Stop; gap recorded before ACK',result:'PASS',notRetained:all[1],acks:page.acks,file:file(h,s)});
}
fs.writeFileSync('/tmp/windows-retention-correction-probe.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
