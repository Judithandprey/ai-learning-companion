// Exact source, controlled local filesystem races, intercepted fetch; no listener/native/provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
const root=process.argv[2];
const {frameRequest}=await import(pathToFileURL(path.join(root,'apps/windows/src/shared/frame-ingress.ts')));
const {uploadRetained}=await import(pathToFileURL(path.join(root,'apps/windows/src/main/uploader.ts')));
const evidence=path.join(root,'docs/verification/web/evidence');
const meta=JSON.parse(fs.readFileSync(path.join(evidence,'windows-frame-ingress/harness-ink.json'),'utf8'));
const capture=path.dirname(path.join(evidence,meta.manifest));
const manifest=fs.readFileSync(path.join(evidence,meta.manifest),'utf8').replace(/\r\n/g,'\n');
const out=fs.mkdtempSync('/tmp/windows-upload-6c4-files-review-probe-data-');
const native={lstatSync:fs.lstatSync,realpathSync:fs.realpathSync,readFileSync:fs.readFileSync};
const baseFetch=globalThis.fetch;
const results=[];
function make(name){
 const dir=path.join(out,name);fs.cpSync(capture,dir,{recursive:true});
 const plan=structuredClone(meta.plan);
 return {capture_dir:dir,plan,prepared:frameRequest(manifest,plan)};
}
const authority={origin:'http://127.0.0.1:41234',token:'synthetic-reviewed-ephemeral-bearer-0123456789',expires_at:'2099-01-01T00:00:00Z',owner:meta.plan.source,incarnation:{device_id:meta.plan.device_id,session_id:meta.plan.session_id,stream_id:meta.plan.stream_id}};
function recordFetch(seen,onPut=()=>{}){
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);seen.push({method:options.method,url:String(url),body});
  if(options.method==='PUT'){
   const actual=Buffer.from(body.data_base64,'base64');
   assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),body.artifact.sha256);
   assert.equal(actual.length,body.artifact.byte_length);
   onPut(seen.length,body);
   const {data_base64,...receipt}=body;
   return new Response(JSON.stringify({...receipt,status:'bytes_committed'}),{status:200});
  }
  const b=body.batch;
  return new Response(JSON.stringify({contract_version:'0.2.0',batch_id:b.batch_id,user_id:b.records[0].source.user_id,device_id:b.device_id,session_id:b.session_id,stream_id:b.stream_id,
   acknowledged:b.records.map(r=>({record_id:r.record_id,sequence:r.sequence,disposition:'accepted',received_at:'2026-09-30T17:00:00Z',envelope:'committed',artifacts:r.artifacts.map(a=>({...a,status:'verified'}))}))}),{status:200});
 };
}
async function run(name,fn){
 try {results.push({name,pass:true,...await fn()});}
 catch(error){results.push({name,pass:false,error:String(error),stack:error.stack});}
 finally {Object.assign(fs,native);syncBuiltinESMExports();globalThis.fetch=baseFetch;}
 console.log(JSON.stringify(results.at(-1)));
}
await run('valid_unchanged_originals',async()=>{
 const j=make('valid'),seen=[];recordFetch(seen);
 const r=await uploadRetained(authority,j);
 assert.equal(r.status,'committed');assert.equal(seen.length,8);
 return {status:r.status,put_count:7,all_sent_hashes_exact:true};
});
for(const kind of ['leaf','parent'])await run('static_outside_'+kind+'_symlink_refused',async()=>{
 const j=make('static-'+kind),seen=[];recordFetch(seen);
 const a=j.plan.entries[0].raw.artifact, target=path.join(j.capture_dir,'frames',a.sha256+'.png');
 if(kind==='leaf'){
  const outside=path.join(out,'outside-static.png');fs.copyFileSync(target,outside);fs.rmSync(target);fs.symlinkSync(outside,target);
 }else{
  const frames=path.join(j.capture_dir,'frames'),outside=path.join(out,'outside-static-frames');fs.renameSync(frames,outside);fs.symlinkSync(outside,frames,'dir');
 }
 const r=await uploadRetained(authority,j);assert.equal(r.status,'refused');assert.equal(r.stage,'local');assert.equal(seen.length,0);
 return {status:r.status,stage:r.stage,request_count:0};
});
for(const kind of ['leaf','parent'])await run('racing_outside_'+kind+'_symlink_is_read_and_uploaded',async()=>{
 const j=make('racing-'+kind),seen=[];recordFetch(seen);
 const a=j.plan.entries[0].raw.artifact, target=path.join(j.capture_dir,'frames',a.sha256+'.png');
 const outside=path.join(out,'outside-racing-'+kind), saved=path.join(out,'saved-racing-'+kind);
 const frames=path.join(j.capture_dir,'frames');
 if(kind==='leaf')fs.copyFileSync(target,outside);else fs.cpSync(frames,outside,{recursive:true});
 let containmentChecks=0,swapped=false,readOutside=false;
 fs.realpathSync=function(p,...args){
  const actual=native.realpathSync(p,...args);
  if(String(p)===j.capture_dir && ++containmentChecks===8){ // 7 preflight originals, then first original's send-time read
   if(kind==='leaf'){fs.renameSync(target,saved);fs.symlinkSync(outside,target);}
   else {fs.renameSync(frames,saved);fs.symlinkSync(outside,frames,'dir');}
   swapped=true;
  }
  return actual;
 };
 fs.readFileSync=function(p,...args){
  const current=swapped && String(p)===target;
  if(current)readOutside=!native.realpathSync(p).startsWith(native.realpathSync(j.capture_dir)+path.sep);
  const bytes=native.readFileSync(p,...args);
  if(current){
   if(kind==='leaf'){fs.unlinkSync(target);fs.renameSync(saved,target);}
   else{fs.unlinkSync(frames);fs.renameSync(saved,frames);}
   swapped=false;
  }
  return bytes;
 };
 syncBuiltinESMExports();
 const r=await uploadRetained(authority,j);
 assert.equal(readOutside,true);assert.equal(r.status,'committed');assert.equal(seen.length,8);
 return {status:r.status,actual_outside_read:true,put_count:7,all_sent_hashes_exact:true,demonstrated_bug:true};
});
await run('binding_identity_mutated_after_preflight_is_sent',async()=>{
 const j=make('binding-mutation'),seen=[];
 const binding=j.plan.entries[0].ink,originalId=binding.artifact.artifact_id,changedId='independent-unplanned-ink';
 const expectedIds=new Set(j.prepared.request.batch.records.flatMap(r=>r.artifacts.map(a=>a.artifact_id)));
 assert(!expectedIds.has(changedId));
 recordFetch(seen,(n)=>{if(n===1)binding.artifact.artifact_id=changedId;});
 const r=await uploadRetained(authority,j);
 const unexpected=seen.filter(x=>x.method==='PUT'&&!expectedIds.has(x.body.artifact.artifact_id));
 assert.equal(unexpected.length,1);assert.equal(unexpected[0].body.artifact.artifact_id,changedId);
 assert(!seen.some(x=>x.method==='PUT'&&x.body.artifact.artifact_id===originalId));
 return {status_with_synthetic_ack:r.status,unexpected_originals:unexpected.map(x=>x.body.artifact.artifact_id),prepared_original_not_sent:originalId,demonstrated_bug:true,backend_success_not_claimed:true};
});
await run('inflight_binding_mutation_reports_unsent_identity_committed',async()=>{
 const j=make('inflight-binding'),seen=[];let originalId;const changedId='independent-never-uploaded-original';
 recordFetch(seen,(n,body)=>{if(n===1){originalId=body.artifact.artifact_id;for(const e of j.plan.entries)if(e.kind==='frame')for(const b of [e.raw,e.composed,e.ink])if(b?.artifact.artifact_id===originalId)b.artifact.artifact_id=changedId;}});
 const r=await uploadRetained(authority,j);
 assert.equal(r.status,'committed');assert(r.originals.includes(changedId));assert(!r.originals.includes(originalId));
 assert(!seen.some(x=>x.method==='PUT'&&x.body.artifact.artifact_id===changedId));
 assert(seen.some(x=>x.method==='PUT'&&x.body.artifact.artifact_id===originalId));
 return {status_with_synthetic_ack:r.status,reported_committed_but_never_put:changedId,actually_put_and_receipted:originalId,demonstrated_bug:true,backend_success_not_claimed:true};
});
await run('later_original_bytes_changed_are_refused',async()=>{
 const j=make('changed-bytes'),seen=[];const a=j.plan.entries[0].ink.artifact;
 recordFetch(seen,(n)=>{if(n===1){const file=path.join(j.capture_dir,'ink',a.sha256+'.json');const data=native.readFileSync(file);data[5]^=1;fs.writeFileSync(file,data);}});
 const r=await uploadRetained(authority,j);assert.equal(r.status,'refused');assert.equal(r.stage,'original');assert.equal(seen.length,1);
 return {status:r.status,request_count:1,no_changed_bytes_sent:true};
});
const report={candidate:'6c4ac03',mode:'filesystem probes with intercepted fetch; no HTTP/backend/native run',probe_data:out,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,checks:results};
fs.writeFileSync('/tmp/windows-upload-6c4-files-review-probes.json',JSON.stringify(report,null,2)+'\n');
process.exitCode=report.failed?1:0;
