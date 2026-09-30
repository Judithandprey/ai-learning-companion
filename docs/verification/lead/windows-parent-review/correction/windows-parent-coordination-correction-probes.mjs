import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {CaptureLink} from '/tmp/lc-windows-parent-5871981/apps/windows/src/main/capture-link.ts';
import {FakeChild,fakeSpawn,readyFor} from '/tmp/lc-windows-parent-5871981/apps/windows/tests/link-fakes.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lc-coordination-correction-'));
const actor={user_id:'review-user',device_id:'review-device',session_id:'review-session',producer_id:'review-producer'};
const config={launch:{kind:'wsl',distribution:'unused-test',user:'unused-test',cd:'/',python:'/unused'},dsn_file:'/not-read'};
const seed=()=>({format:'lc-windows-capture-link/v1',actor,last_registered_stream:'review-stream',streams:[{capture_session:'capture-review',capture_dir:path.join(root,'capture'),stream_id:'review-stream',source_id:'review-source',registration:{contract_version:'0.2.1',device_id:actor.device_id,session_id:actor.session_id,stream_id:'review-stream',authorization_generation:1,membership_revision:1,continuity:{kind:'initial'}},registration_key:'review-stream.register',grant:'consumed',registered:true,registration_sent:true,state:{revision:1,state:'live',pre_stop_sequence:null,read_at:'2026-09-30T00:00:00.000Z'},source:null,planned_through:0,jobs:[],stops:[],final:null,notes:['原稿 preserved — café']}]});
function fixture(name,mutate,transport){
 const userData=path.join(root,name),file=path.join(userData,'capture-host','coordination.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 const doc=seed();mutate?.(doc);const before=JSON.stringify(doc);fs.writeFileSync(file,before);let dsnReads=0;
 const options={userData,config,notify:()=>{},endCapture:()=>{},readDsn:()=>{dsnReads++;return 'invalid-dsn';},transport,retry_ms:1};
 return {link:new CaptureLink(options),file,before,options,get dsnReads(){return dsnReads;}};
}
const results=[];
{
 const f=fixture('old-compatible-valid-record',d=>delete d.streams[0].registration_sent);
 assert.equal(f.link.status().mode,'development');assert.equal(f.link.status().earlier_unknown,1);
 results.push({case:'compatible_valid_v1_with_optional_registration_sent_absent',pass:true});
}
for(const [name,mutate] of [['null-job',d=>d.streams[0].jobs=[null]],['missing-final',d=>delete d.streams[0].final]]){
 const f=fixture(name,mutate);const status=f.link.status();assert.equal(status.mode,'unavailable');
 await f.link.reconcile();f.link.begin('new-capture',path.join(root,'new-capture'));await Promise.resolve();
 assert.equal(f.dsnReads,0);assert.equal(f.link.snapshot(),null);assert.equal(fs.readFileSync(f.file,'utf8'),f.before);
 results.push({case:`original_C1_${name}_refused_untouched_without_start`,pass:true,status,dsn_reads:f.dsnReads});
}
async function stopCase(kind){
 let f;const sends=[];const writes=[];
 const transport=async r=>{
  const bytes=fs.readFileSync(f.file,'utf8'),saved=JSON.parse(bytes);
  const matching=saved.streams[0].stops.some(s=>s.key===r.headers['Idempotency-Key']&&JSON.stringify(s.body)===r.body);
  sends.push({method:r.method,witness_matches:matching,bytes_on_disk:Buffer.byteLength(bytes)});
  assert.equal(saved.streams[0].notes[0],'原稿 preserved — café');
  return {status:200,text:JSON.stringify({contract_version:'0.2.1',stream_id:'review-stream',revision:2,state:'stopped',pre_stop_sequence:null})};
 };
 f=fixture(kind,null,transport);
 const auth={origin:'http://127.0.0.1:1',token:'not-used-by-fake-transport',expires_at:'2099-01-01T00:00:00Z',owner:{user_id:actor.user_id,source_id:'review-source',source_version:1},incarnation:{device_id:actor.device_id,session_id:actor.session_id,stream_id:'review-stream'}};
 const original=fs.writeSync;let call=0;
 fs.writeSync=(fd,data,...rest)=>{
  const buffer=typeof data==='string'?Buffer.from(data):data;
  if(Buffer.isBuffer(buffer)&&buffer.subarray(0,40).toString().startsWith('{"format":"lc-windows-capture-link/v1"')){
   const offset=typeof data==='string'?0:rest[0],length=typeof data==='string'?buffer.length:rest[1];call++;
   if(kind==='zero-progress'){writes.push({offset,length,written:0});return 0;}
   if(kind==='partial-then-ENOSPC'&&call>1){writes.push({offset,length,error:'ENOSPC'});throw Object.assign(new Error('injected ENOSPC'),{code:'ENOSPC'});}
   const take=kind==='full-write'?length:Math.min(23,length);const n=original(fd,buffer,offset,take);writes.push({offset,length,written:n});return n;
  }
  return original(fd,data,...rest);
 };syncBuiltinESMExports();
 try{await f.link.sendStop(auth,f.link.record.streams[0],async()=>null);}finally{fs.writeSync=original;syncBuiltinESMExports();}
 const failed=kind==='zero-progress'||kind==='partial-then-ENOSPC';
 if(failed){
  assert.deepEqual(sends,[]);assert.equal(fs.readFileSync(f.file,'utf8'),f.before);assert.deepEqual(fs.readdirSync(path.dirname(f.file)),['coordination.json']);
  assert.equal(f.link.status().sends_stopped,true);const reads=f.dsnReads;f.link.begin('new-capture',path.join(root,'new-capture'));await Promise.resolve();assert.equal(f.dsnReads,reads);
 }else{
  assert.equal(sends.filter(s=>s.method==='POST').length,1);assert.equal(sends[0].witness_matches,true);assert.equal(f.link.status().sends_stopped,false);
  assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).streams[0].final,'stopped');
  const reopened=new CaptureLink(f.options);assert.equal(reopened.status().mode,'development');assert.equal(reopened.status().earlier_unknown,0);
 }
 return {case:`C2_${kind}`,pass:true,write_calls:writes.length,first_writes:writes.slice(0,3),requests:sends,previous_file_preserved:failed?fs.readFileSync(f.file,'utf8')===f.before:null,fault:f.link.fault};
}
for(const kind of ['full-write','short-write-utf8','zero-progress','partial-then-ENOSPC'])results.push(await stopCase(kind));
const until=async(predicate,label)=>{const end=Date.now()+7000;while(!predicate()){if(Date.now()>end)throw Error(`timeout: ${label}`);await new Promise(r=>setTimeout(r,5));}};
// Real production-generated registration, source, two batches (committed then unknown), and Stop. Only process/HTTP boundaries are faked.
{
 const userData=path.join(root,'generated'),ink='/tmp/lc-windows-parent-5871981/docs/verification/web/evidence/windows-frame-ingress/harness-ink-capture';
 const lines=fs.readFileSync(path.join(ink,'manifest.jsonl'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(Boolean),session=JSON.parse(lines[0]).capture_session;
 const capture=path.join(userData,'captures',session);fs.mkdirSync(capture,{recursive:true});for(const d of ['frames','ink'])fs.cpSync(path.join(ink,d),path.join(capture,d),{recursive:true});
 const file=path.join(userData,'capture-host','coordination.json'),children=[],snapshots=new Map(),requests=[];let stopped=false,unknownBatch=false;
 const keep=()=>{if(fs.existsSync(file)){const b=fs.readFileSync(file);snapshots.set(createHash('sha256').update(b).digest('hex'),b);}};
 const response=(value,status=200)=>({status,text:JSON.stringify(value)});
 const transport=async r=>{
  const p=new URL(r.url).pathname;if(p==='/openapi.json')return response({},404);
  keep();const doc=JSON.parse(fs.readFileSync(file,'utf8')),s=doc.streams.at(-1);requests.push(`${r.method} ${p}`);
  const state=()=>response({contract_version:'0.2.1',stream_id:s.stream_id,revision:stopped?2:1,state:stopped?'stopped':'live',pre_stop_sequence:null});
  if(p.endsWith(':control')){stopped=true;return state();}
  if(p==='/v2/process/streams'||r.method==='GET')return state();
  if(p.startsWith('/v2/process/display-sources/'))return response({contract_version:'0.2.4',user_id:doc.actor.user_id,source_id:s.source_id,source_version:1});
  const b=JSON.parse(r.body);
  if(p.startsWith('/v2/process/originals/'))return response({contract_version:'0.2.2',source:b.source,kind:b.kind,artifact:b.artifact,status:'bytes_committed'});
  assert.ok(p.endsWith(':batch'),p);
  if(unknownBatch)return response({contract_version:'0.2.10',error:'unavailable',retryable:true},503);
  return response({contract_version:'0.2.0',user_id:doc.actor.user_id,batch_id:b.batch.batch_id,device_id:b.batch.device_id,session_id:b.batch.session_id,stream_id:b.batch.stream_id,
   acknowledged:b.batch.records.map(x=>({record_id:x.record_id,sequence:x.sequence,envelope:'committed',disposition:'accepted',received_at:'2026-09-30T00:00:00Z',artifacts:x.artifacts.map(a=>({...a,status:'verified'}))}))});
 };
 const make=(data,ownTransport=transport)=>new CaptureLink({userData:data,config,notify:()=>{},endCapture:()=>{},readDsn:()=> 'host=/unused dbname=lc_p0_test',transport:ownTransport,retry_ms:10,stop_wait_ms:100,host:{spawn:fakeSpawn(()=>new FakeChild({ready:readyFor}),children).spawn,end_ms:100}});
 const link=make(userData);fs.writeFileSync(path.join(capture,'manifest.jsonl'),lines.slice(0,3).join('\n')+'\n');
 link.begin(session,capture);link.appended(session,fs.statSync(path.join(capture,'manifest.jsonl')).size);
 await until(()=>link.status().stored===2,'first generated batch committed');keep();
 unknownBatch=true;fs.appendFileSync(path.join(capture,'manifest.jsonl'),lines[3]+'\n');link.appended(session,fs.statSync(path.join(capture,'manifest.jsonl')).size);
 await until(()=>link.status().unknown===1&&link.snapshot().streams[0].jobs[1].status==='unknown','second generated batch unknown');keep();
 const unknown=fs.readFileSync(file);link.stopSending(session);await until(()=>link.active===null,'generated Stop');keep();
 assert.equal(link.status().stored,2);assert.equal(link.status().unknown,1);
 let accepted=0;for(const [hash,b] of snapshots){const data=path.join(root,'reload',hash);fs.mkdirSync(path.join(data,'capture-host'),{recursive:true});fs.writeFileSync(path.join(data,'capture-host','coordination.json'),b);assert.equal(make(data).status().mode,'development',hash);accepted++;}
 const recoveryDir=path.join(root,'restart-unknown');fs.mkdirSync(path.join(recoveryDir,'capture-host'),{recursive:true});fs.writeFileSync(path.join(recoveryDir,'capture-host','coordination.json'),unknown);
 const recoveredRequests=[];let recoveredStopped=false;
 const recoveryTransport=async r=>{const p=new URL(r.url).pathname;if(p==='/openapi.json')return response({},404);recoveredRequests.push(`${r.method} ${p}`);if(p.endsWith(':control'))recoveredStopped=true;return response({contract_version:'0.2.1',stream_id:JSON.parse(unknown).streams[0].stream_id,revision:recoveredStopped?2:1,state:recoveredStopped?'stopped':'live',pre_stop_sequence:null});};
 const recovered=make(recoveryDir,recoveryTransport);await recovered.reconcile();
 assert.equal(recovered.status().stored,2);assert.equal(recovered.status().unknown,1);assert.equal(recovered.snapshot().streams[0].final,'stopped');
 assert.deepEqual(recoveredRequests.map(x=>x.split(' ')[0]),['GET','POST','GET']);assert.ok(recoveredRequests[1].endsWith(':control'));
 assert.equal(children.every(c=>c.exited),true);
 results.push({case:'actual_generated_records_reload_and_read_control_only_recovery',pass:true,record_checkpoints_reloaded:accepted,stored:2,unknown:1,final:'stopped',recovery_requests:recoveredRequests,fake_children:children.length,all_fake_children_ended:true});
}
const source='/tmp/lc-windows-parent-5871981/apps/windows/src/main/capture-link.ts';
const report={commit:'5871981524140e3be986268a941d34e99af25bb9',node:process.version,source_sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),temp_directory:root,cases:results.length,all_passed:results.every(x=>x.pass),results,scope:'Unmodified candidate TypeScript, Linux pinned Node, /tmp records and capture copies, in-memory child/transport fakes, injected filesystem writes. No processes, DB, listeners, GUI, provider, native Windows run.'};
fs.writeFileSync('/tmp/windows-parent-coordination-correction-probes.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
