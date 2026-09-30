import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { CaptureLink } from '/tmp/lc-windows-parent-d6ef68a/apps/windows/src/main/capture-link.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-coordination-probes-'));
const actor = { user_id: 'review-user', device_id: 'review-device', session_id: 'review-session', producer_id: 'review-producer' };
const seed = () => ({format:'lc-windows-capture-link/v1', actor, last_registered_stream:'review-stream', streams:[{
 capture_session:'capture-review', capture_dir:path.join(root,'capture'), stream_id:'review-stream',source_id:'review-source',
 registration:{contract_version:'0.2.1',device_id:actor.device_id,session_id:actor.session_id,stream_id:'review-stream',authorization_generation:1,membership_revision:1,continuity:{kind:'initial'}},
 registration_key:'review-stream.register', grant:'consumed', registered:true, registration_sent:true,
 state:{revision:1,state:'live',pre_stop_sequence:null,read_at:'2026-09-30T00:00:00.000Z'}, source:null,
 planned_through:0,jobs:[],stops:[],final:null,notes:[]
}]});
const fixtures=[];
function fixture(name, mutation, transport) {
 const userData=path.join(root,name), file=path.join(userData,'capture-host','coordination.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const doc=seed(); mutation?.(doc); const before=JSON.stringify(doc); fs.writeFileSync(file,before);
 let dsnReads=0;
 const link=new CaptureLink({userData, config:{launch:{kind:'fifo',python:'/not-launched',cwd:'/'},dsn_file:'/not-read'},
  notify:()=>{},endCapture:()=>{},readDsn:()=>{dsnReads++;return 'not-a-valid-dsn';},transport,retry_ms:1});
 const result={name,file,link,doc,before,get dsnReads(){return dsnReads;}};fixtures.push(result);return result;
}
const results=[];
{
 const f=fixture('valid-state-control');
 assert.equal(f.link.status().earlier_unknown,1);
 assert.equal(f.link.status().unknown,0);
 results.push({case:'valid_state_positive_control',pass:true,status:f.link.status()});
}
{
 const f=fixture('damaged-null-job',d=>d.streams[0].jobs=[null]);
 let caught;try{f.link.status();}catch(e){caught={name:e.name,message:e.message};}
 assert.equal(caught?.name,'TypeError');
 assert.equal(fs.readFileSync(f.file,'utf8'),f.before);
 results.push({case:'well_formed_json_null_job_accepted_then_status_throws',reproduced:true,error:caught,record_unchanged:true});
}
{
 const f=fixture('damaged-final-omitted',d=>delete d.streams[0].final);
 const before=f.link.status();
 assert.equal(before.mode,'development');assert.equal(before.earlier_unknown,0);
 await f.link.reconcile();assert.equal(f.dsnReads,0);
 f.link.begin('new-capture',path.join(root,'new-capture'));
 // Await the actual public begin's connection work; the invalid DSN prevents any child, pipe or HTTP action.
 await f.link.active.connecting;
 const after=fs.readFileSync(f.file,'utf8');const saved=JSON.parse(after);
 assert.notEqual(after,f.before);assert.equal(saved.streams.length,2);assert.equal(f.dsnReads,1);
 results.push({case:'missing_final_skips_reconciliation_and_new_start_overwrites_damaged_record',reproduced:true,
  loaded_status:before,reconciliation_dsn_reads:0,begin_dsn_reads:f.dsnReads,stored_streams:saved.streams.length,
  old_stream_final_present:Object.hasOwn(saved.streams[0],'final'),record_unchanged:false,host_launched:false});
}
async function stopCase(short) {
 let f;const sends=[];
 const transport=async r=>{
  const bytes=fs.readFileSync(f.file,'utf8');let saved=null;try{saved=JSON.parse(bytes);}catch{}
  sends.push({method:r.method,path:new URL(r.url).pathname,bytes_on_disk:Buffer.byteLength(bytes),json_valid:saved!==null,
   stop_witness_matches:saved?.streams[0]?.stops.some(s=>s.key===r.headers['Idempotency-Key']&&JSON.stringify(s.body)===r.body)??false});
  return {status:200,text:JSON.stringify({contract_version:'0.2.1',stream_id:'review-stream',revision:2,state:'stopped',pre_stop_sequence:null})};
 };
 f=fixture(short?'short-write-stop':'complete-write-stop',null,transport);
 const authority={origin:'http://127.0.0.1:1',token:'local-unused-marker',expires_at:'2099-01-01T00:00:00Z',owner:{user_id:actor.user_id,source_id:'review-source',source_version:1},incarnation:{device_id:actor.device_id,session_id:actor.session_id,stream_id:'review-stream'}};
 const original=fs.writeSync;const writes=[];
 if(short){
  fs.writeSync=(fd,data,...args)=>{
   if(typeof data==='string'&&data.startsWith('{"format":"lc-windows-capture-link/v1"')){
    const written=original(fd,data.slice(0,23),...args);writes.push({requested:Buffer.byteLength(data),written});return written;
   }
   return original(fd,data,...args);
  };syncBuiltinESMExports();
 }
 try{
  // Runtime method seam: exercise the unmodified production Stop -> save -> transport path without launching a host.
  await f.link.sendStop(authority,f.link.record.streams[0],async()=>null);
 }finally{fs.writeSync=original;syncBuiltinESMExports();}
 assert.equal(sends.filter(s=>s.method==='POST').length,1);
 if(short){assert.equal(sends[0].json_valid,false);assert.equal(sends[0].stop_witness_matches,false);assert.equal(f.link.fault,null);}
 else{assert.equal(sends[0].json_valid,true);assert.equal(sends[0].stop_witness_matches,true);}
 return {case:short?'short_write_renamed_then_stop_dispatched_without_durable_witness':'complete_write_stop_positive_control',reproduced:short,pass:!short,writes,sends,persistence_fault:f.link.fault};
}
results.push(await stopCase(false));results.push(await stopCase(true));
const source='/tmp/lc-windows-parent-d6ef68a/apps/windows/src/main/capture-link.ts';
const report={commit:'d6ef68a03bc3e18569d1b4a85dc20f09b7717dff',node:process.version,source,source_sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
 scope:'Actual unchanged TypeScript on Linux Node; isolated temporary records, fake in-process HTTP response boundary, injected short write. No child/DB/listener/provider/GUI.',temp_directory:root,cases:results.length,results};
fs.writeFileSync('/tmp/windows-parent-coordination-review-probes.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
