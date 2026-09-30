// Review probes: actual candidate uploader with injected fetch only. No socket/HTTP host/native/provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { frameRequest } from '/tmp/windows-upload-6c4-export/apps/windows/src/shared/frame-ingress.ts';
import { ackProblem,uploadRetained } from '/tmp/windows-upload-6c4-export/apps/windows/src/main/uploader.ts';
const root='/tmp/windows-upload-6c4-export';
const evidence=root+'/docs/verification/web/evidence/';
const fixture=JSON.parse(readFileSync(evidence+'windows-frame-ingress/harness-ink.json','utf8'));
const token='synthetic-review-token-only-0123456789abcdef';
const job=()=>({capture_dir:dirname(evidence+fixture.manifest),plan:structuredClone(fixture.plan),prepared:frameRequest(readFileSync(evidence+fixture.manifest,'utf8').replace(/\r\n/g,'\n'),fixture.plan)});
const authority=()=>({origin:'http://127.0.0.1:51234',token,expires_at:'2099-01-01T00:00:00Z',owner:fixture.plan.source,incarnation:{device_id:fixture.plan.device_id,session_id:fixture.plan.session_id,stream_id:fixture.plan.stream_id}});
const ackFor=b=>({contract_version:'0.2.0',batch_id:b.batch_id,user_id:b.records[0].source.user_id,device_id:b.device_id,session_id:b.session_id,stream_id:b.stream_id,acknowledged:b.records.map(r=>({record_id:r.record_id,sequence:r.sequence,disposition:'accepted',received_at:'2026-09-30T17:00:00Z',envelope:'committed',artifacts:r.artifacts.map(a=>({...a,status:'verified'}))}))});
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const normal=(url,init)=>{
 const parsed=JSON.parse(init.body);
 if(init.method==='PUT'){const {data_base64,...receipt}=parsed;return response(200,{...receipt,status:'bytes_committed'});}
 return response(200,ackFor(parsed.batch));
};
const originalFetch=globalThis.fetch;
const findings=[];
async function run(name,fetcher,opts={}){
 const seen=[];globalThis.fetch=async(url,init)=>{seen.push({url,method:init.method,body:init.body,key:init.headers['Idempotency-Key']});return fetcher(url,init,seen);};
 try{const result=await uploadRetained(authority(),job(),{pause_ms:0,...opts});return {result,seen};}
 finally{globalThis.fetch=originalFetch;}
}
function note(name,data){findings.push({name,...data});writeFileSync('/tmp/windows-upload-6c4-probe-results.json',JSON.stringify(findings,null,2)+'\n');}
test('control: seven original receipts then exact batch ACK commit',async()=>{
 const {result,seen}=await run('control',normal);assert.equal(result.status,'committed');assert.equal(result.originals.length,7);assert.equal(seen.length,8);
 note('control',{observed:'committed',originals:7,requests:8});
});
test('reproduction: reflected bearer in HTTP error leaks through returned result',async()=>{
 const {result,seen}=await run('token',(url,init)=>response(403,{error:'server reflection '+token}));
 assert.equal(result.status,'refused');assert.equal(JSON.stringify(result).includes(token),true);
 note('token_reflection',{observed:result.status,requests:seen.length,token_in_reason:result.reason.includes(token),token_in_error:result.error.includes(token),token_value_omitted:true});
});
test('reproduction: first 200 wrong ACK is labelled refused rather than uncertain',async()=>{
 const {result,seen}=await run('ack',(url,init)=>{if(init.method==='PUT')return normal(url,init);const a=ackFor(JSON.parse(init.body).batch);a.batch_id='different-batch';return response(200,a);});
 assert.equal(result.status,'refused');assert.equal(result.stage,'batch');assert.equal(result.in_doubt,undefined);
 note('first_200_wrong_ack',{observed:result.status,stage:result.stage,in_doubt:result.in_doubt??null,requests:seen.length,reason:result.reason,server_commit_not_executed:'fake fetch only; real Backend mutation delegated to lead'});
});
test('reproduction: first 200 wrong original receipt is labelled refused',async()=>{
 const {result,seen}=await run('receipt',(url,init)=>{const {data_base64,...receipt}=JSON.parse(init.body);return response(200,{...receipt,status:'pending'});});
 assert.equal(result.status,'refused');assert.equal(result.stage,'original');assert.equal(result.in_doubt,undefined);
 note('first_200_wrong_receipt',{observed:result.status,stage:result.stage,in_doubt:result.in_doubt??null,requests:seen.length,originals:result.originals.length});
});
test('reproduction: 503 unknown history is lost when next batch response is capture_stopped',async()=>{
 let batch=0;const {result,seen}=await run('503',(url,init)=>init.method==='PUT'?normal(url,init):response(++batch===1?503:409,{error:batch===1?'unavailable':'capture_stopped'}));
 assert.equal(result.status,'refused');assert.equal(result.http_status,409);assert.equal(result.in_doubt,undefined);
 note('503_then_409',{observed:result.status,in_doubt:result.in_doubt??null,batch_sends:batch,request_bodies_equal:seen[7].body===seen[8].body,reason:result.reason});
});
test('reproduction: Date.parse-normalized non-date is accepted as ACK received_at',()=>{
 const j=job();const a=ackFor(j.prepared.request.batch);a.acknowledged[0].received_at='2026-02-30T17:00:00Z';
 assert.equal(ackProblem(j.prepared.request,a,fixture.plan.source),null);
 note('invalid_utc_date',{received_at:a.acknowledged[0].received_at,uploader_ack_problem:null});
});
test('control: in-flight abort remains cancelled with original in doubt',async()=>{
 const controller=new AbortController();const {result,seen}=await run('abort',(url,init)=>new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new Error('synthetic abort')),{once:true});queueMicrotask(()=>controller.abort());}),{signal:controller.signal});
 assert.equal(result.status,'cancelled');assert.equal(result.stage,'original');assert.ok(result.in_doubt);assert.equal(seen.length,1);
 note('abort_control',{observed:result.status,stage:result.stage,in_doubt:result.in_doubt,requests:seen.length});
});
test('control: lost answer then403 remains unknown and preserves exact request bytes',async()=>{
 let n=0;const {result,seen}=await run('lost',(url,init)=>{if(++n===1)throw new Error('synthetic lost answer');return response(403,{error:'forbidden'});});
 assert.equal(result.status,'unknown');assert.ok(result.in_doubt);assert.equal(seen[0].body,seen[1].body);
 note('lost_answer_control',{observed:result.status,in_doubt:result.in_doubt,requests:seen.length,request_bodies_equal:true});
});
