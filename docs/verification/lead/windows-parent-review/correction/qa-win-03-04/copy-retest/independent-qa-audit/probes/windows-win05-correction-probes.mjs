import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {CaptureLink} from '/tmp/lc-win-win05-d295a51/apps/windows/src/main/capture-link.ts';
import {FakeChild,fakeService,fakeSpawn,readyFor} from '/tmp/lc-win-win05-d295a51/apps/windows/tests/link-fakes.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lc-win05-review-'));
const fixture='/tmp/lc-win-win05-d295a51/docs/verification/web/evidence/windows-frame-ingress/harness-ink-capture';
const lines=fs.readFileSync(path.join(fixture,'manifest.jsonl'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(Boolean);
const session=JSON.parse(lines[0]).capture_session,results=[];
async function until(label,fn,ms=9000){let until=Date.now()+ms;while(Date.now()<until){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('timeout: '+label);}
function ack(r,file){let b=JSON.parse(r.body).batch,actor=JSON.parse(fs.readFileSync(file,'utf8')).actor;return {status:200,text:JSON.stringify({contract_version:'0.2.0',batch_id:b.batch_id,user_id:actor.user_id,device_id:b.device_id,session_id:b.session_id,stream_id:b.stream_id,acknowledged:b.records.map(x=>({record_id:x.record_id,sequence:x.sequence,disposition:'accepted',received_at:'2026-09-30T17:00:00Z',envelope:'committed',artifacts:x.artifacts.map(a=>({...a,status:'verified'}))}))})};}
function make(name,own,observe=()=>{}){
 const dir=path.join(root,name),capture=path.join(dir,'captures',session),file=path.join(dir,'capture-host','coordination.json');fs.mkdirSync(capture,{recursive:true});for(const n of ['frames','ink'])fs.cpSync(path.join(fixture,n),path.join(capture,n),{recursive:true});
 const w={dir,capture,file,children:[],states:[],requests:[],link:null,append(n){fs.writeFileSync(path.join(capture,'manifest.jsonl'),lines.slice(0,n).join('\n')+'\n');this.link.appended(session,fs.statSync(path.join(capture,'manifest.jsonl')).size);}};
 const fake=fakeService(file);
 const transport=async r=>{const p=new URL(r.url).pathname;w.requests.push({method:r.method,path:p,key:r.headers['Idempotency-Key'],body:r.body});const answer=await own(r,p,w);if(answer)return answer;if(p.startsWith('/v2/process/originals/')){const b=JSON.parse(r.body);return {status:200,text:JSON.stringify({contract_version:'0.2.2',source:b.source,kind:b.kind,artifact:b.artifact,status:'bytes_committed'})};}if(p.endsWith(':batch'))return ack(r,file);return fake.transport(r);};
 w.link=new CaptureLink({userData:dir,config:{launch:{kind:'wsl',distribution:'test-only',user:'test-only',cd:'/',python:'/unused'},dsn_file:'/not-read'},readDsn:()=> 'host=/nonexistent dbname=lc_p0_test',notify:s=>{w.states.push(s);observe(s,w);},endCapture:()=>{},transport,retry_ms:40,stop_wait_ms:50,host:{spawn:fakeSpawn(()=>new FakeChild({ready:readyFor}),w.children).spawn,end_ms:100}});
 return w;
}
async function end(w){await w.link.quit(1000);for(const c of w.children)c.exit(1);}
{
 let release,held=0;const at=[];
 const w=make('pending-ack-stop',async(r,p,w)=>{if(!p.endsWith(':batch'))return null;held++;at.push({status:w.states.at(-1),job:JSON.parse(fs.readFileSync(w.file)).streams[0].jobs.at(-1)});await Promise.race([new Promise(res=>release=res),new Promise((_,fail)=>r.signal?.addEventListener('abort',()=>fail(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}))]);return null;});
 try{
 w.link.begin(session,w.capture);w.append(3);await until('first held batch',()=>held===1);
 const before=w.link.status();assert.deepEqual([before.awaiting,before.storing,before.stored,before.unknown],[true,false,0,2]);assert.equal(at[0].status.awaiting,true);
 const req=w.requests.find(x=>x.path.endsWith(':batch'));assert.equal(at[0].job.body,req.body);assert.equal(at[0].job.key,req.key);
 release();await until('ACK confirmed',()=>w.link.status().stored===2&&!w.link.status().awaiting);const confirmed=w.link.status();assert.equal(confirmed.unknown,0);
 w.append(5);await until('second held batch',()=>held===2);const pending=w.link.status();assert.deepEqual([pending.awaiting,pending.storing,pending.stored,pending.unknown],[true,false,2,2]);
 w.link.stopSending(session);const stopping=w.link.status();assert.equal(stopping.storing,false);assert.equal(stopping.awaiting,true);
 await until('bounded Stop',()=>w.link.status().state==='stopped');const stopped=w.link.status();assert.deepEqual([stopped.awaiting,stopped.storing,stopped.stored,stopped.unknown],[false,false,2,2]);release();
 results.push({case:'held_ACK_then_next_pending_Stop',pass:true,before,confirmed,pending,stopping,stopped,exact_job_key_body:true});
 }finally{release?.();await end(w);}
}
{
 const write=fs.writeSync;let fail=false,refused=0,beforeDisk;
 fs.writeSync=function(...args){if(fail)throw Object.assign(new Error('injected full device'),{code:'ENOSPC'});return write.apply(this,args);};syncBuiltinESMExports();
 const w=make('notsent-failed-witness',async(r,p)=>{if(p.startsWith('/v2/process/originals/')){refused++;throw Object.assign(new Error('connection refused'),{code:'ECONNREFUSED'});}return null;},(s,w)=>{if(!fail&&s.not_sent===2&&!s.awaiting){beforeDisk=fs.readFileSync(w.file);fail=true;}});
 try{
 w.link.begin(session,w.capture);w.append(3);await until('retry witness fails',()=>w.link.status().sends_stopped===true);
 const direct=w.link.status(),notified=w.states.at(-1),disk=fs.readFileSync(w.file);assert.equal(refused,3);assert.ok(disk.equals(beforeDisk));assert.equal(direct.awaiting,false);assert.equal(direct.storing,false);assert.equal(direct.not_sent,2);assert.equal(direct.unknown,0);assert.deepEqual(notified,direct,'rollback notification agrees with corrected durable outcome');
 results.push({case:'failed_not_sent_retry_witness_blocks_dispatch',pass:true,upload_attempts:refused,prior_journal_unchanged:true,direct,last_notified:notified,notification_counts_match:direct.not_sent===notified.not_sent&&direct.unknown===notified.unknown});
 }finally{fail=false;fs.writeSync=write;syncBuiltinESMExports();await end(w);}
}
{
 let release,refused=false,seen=null;
 const w=make('refused-held-read',async(r,p,w)=>{if(p.startsWith('/v2/process/originals/')){refused=true;return {status:403,text:JSON.stringify({contract_version:'0.2.4',error:'forbidden',retryable:false})};}if(refused&&r.method==='GET'&&p.startsWith('/v2/process/streams/')&&!seen){seen=w.states.at(-1);await Promise.race([new Promise(res=>release=res),new Promise((_,fail)=>r.signal?.addEventListener('abort',()=>fail(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}))]);}return null;});
 try{w.link.begin(session,w.capture);w.append(3);await until('read held after refusal',()=>seen!==null);assert.deepEqual([seen.awaiting,seen.storing,seen.refused,seen.unknown],[false,false,2,0]);assert.equal(seen.state,'stalled');results.push({case:'refusal_notified_before_followup_read',pass:true,before_read:seen});release();await until('permission ended',()=>w.link.status().state==='ended by the service');}finally{release?.();await end(w);}
}
const report={candidate:'d295a514b531e7fae5ad35df10b4bc10b43bf742',code:'44fbd503bcbc45f4f3b28ff52d78e379ddbaf8c9',node:process.version,temp:root,cases:results.length,results,scope:'Actual source coordinator/uploader, existing fake child, fake transport and copied fixture; no GUI/child/socket/DB/provider.'};fs.writeFileSync('/tmp/windows-win05-correction-probes.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
