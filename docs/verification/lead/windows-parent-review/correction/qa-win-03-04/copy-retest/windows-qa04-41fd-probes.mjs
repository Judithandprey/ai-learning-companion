import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {harness,running,plain,quitLinks} from '/tmp/lc-win-copyfix-41fd2cb/apps/windows/tests/main-harness.ts';
import {overlayPage,until} from '/tmp/lc-win-copyfix-41fd2cb/apps/windows/tests/overlay-page.ts';
import {controlPage} from '/tmp/lc-win-copyfix-41fd2cb/apps/windows/tests/control-page.ts';
import {FakeChild,fakeSpawn,fakeService,readyFor} from '/tmp/lc-win-copyfix-41fd2cb/apps/windows/tests/link-fakes.ts';
import {CaptureLink} from '/tmp/lc-win-copyfix-41fd2cb/apps/windows/src/main/capture-link.ts';
import {DEFAULT_RETENTION_POLICY} from '/tmp/lc-win-copyfix-41fd2cb/apps/windows/src/shared/retention.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lc-qa04-review-'));
const config={format:'lc-windows-dev-capture-host/v1',launch:{kind:'wsl',distribution:'test-only',user:'test-only',cd:'/',python:'/unused'},dsn_file:path.join(root,'dsn')};
fs.writeFileSync(config.dsn_file,'host=/nonexistent dbname=lc_p0_test');
const configFile=path.join(root,'config.json');fs.writeFileSync(configFile,JSON.stringify(config));
const results=[];const children=[];
async function ask(page){page.review.mode('ASK');page.pointer('pointerdown',2,190,95);for(const [x,y] of [[400,95],[400,125],[190,125]])page.pointer('pointermove',2,x,y);page.pointer('pointerup',2,192,97);await until('ASK card',()=>page.review.card()!==null);return page.review.card().text;}
try{
 let transport=async()=>{throw Error('not initialized');};
 const h=harness({env:{LC_DEV_CAPTURE_HOST:configFile},link:{host:{spawn:fakeSpawn(()=>new FakeChild({ready:readyFor}),children).spawn,end_ms:100},transport:r=>transport(r),retry_ms:20,stop_wait_ms:100}});
 const f=fakeService(path.join(h.userData,'capture-host','coordination.json'));transport=f.transport;
 const s=await running(h),page=await overlayPage(h,s,{...DEFAULT_RETENTION_POLICY,min_interval_ms:0});
 const said=()=>plain(h.control().sent.filter(m=>m[0]==='lc:link').at(-1)?.[1]);
 await until('connected',()=>said()?.storing===true,5000);
 const before=await ask(page);const oldCard=plain(page.review.card());assert.match(before,/may also store/);assert.doesNotMatch(before,/are also being stored|is not storing frames now/);
 page.scene.shade=20;await page.review.sample();await page.review.retention().queue;
 await until('stalled',()=>said()?.state==='stalled',10000);
 const after=page.review.card().text;const c=controlPage();c.showLink(said());
 assert.equal(said().storing,false);
 assert.equal(after,before);assert.deepEqual(plain(page.review.card()),oldCard);assert.doesNotMatch(after,/are also being stored|is not storing frames now/);assert.doesNotMatch(c.nodes.ai.textContent,/are also being stored/);
 page.click('close');const fresh=await ask(page);assert.match(fresh,/may also store/);assert.equal(fresh.split('\n')[0],before.split('\n')[0]);
 results.push({case:'W_COPY_01_open_card_stays_conditional_through_stall',pass:true,status:said(),old_card:after,new_card:fresh,control_header:c.nodes.ai.textContent});
 h.end('probe stop');await until('stopped',()=>said()?.state==='stopped',5000);
 assert.equal(said().storing,false);assert.ok(said().unknown>0);
 results.push({case:'Stop_retains_unknown_and_storing_false_control',pass:true,status:said()});
 await quitLinks();
}finally{for(const child of children)child.exit(1);}
{
 const userData=path.join(root,'stuck-original'),ink='/tmp/lc-win-copyfix-41fd2cb/docs/verification/web/evidence/windows-frame-ingress/harness-ink-capture';
 const lines=fs.readFileSync(path.join(ink,'manifest.jsonl'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(Boolean),session=JSON.parse(lines[0]).capture_session;
 const capture=path.join(userData,'captures',session);fs.mkdirSync(capture,{recursive:true});for(const d of ['frames','ink'])fs.cpSync(path.join(ink,d),path.join(capture,d),{recursive:true});
 fs.writeFileSync(path.join(capture,'manifest.jsonl'),lines.slice(0,3).join('\n')+'\n');
 const file=path.join(userData,'capture-host','coordination.json'),fake=fakeService(file),requests=[];let answering=false;const lostBatches=[];let ackCount=0;
 const t=async r=>{const p=new URL(r.url).pathname;requests.push(p);
  if(p.startsWith('/v2/process/originals/')){const b=JSON.parse(r.body);return {status:200,text:JSON.stringify({contract_version:'0.2.2',source:b.source,kind:b.kind,artifact:b.artifact,status:'bytes_committed'})};}
  if(p.endsWith(':batch')){
   const batch=JSON.parse(r.body).batch;
   if(!answering){lostBatches.push(batch.batch_id);throw Object.assign(new Error('socket hang up'),{code:'ECONNRESET'});}
   const record=JSON.parse(fs.readFileSync(file,'utf8'));
   const ack={contract_version:'0.2.0',batch_id:batch.batch_id,user_id:record.actor.user_id,device_id:batch.device_id,session_id:batch.session_id,stream_id:batch.stream_id,acknowledged:batch.records.map(x=>({record_id:x.record_id,sequence:x.sequence,disposition:'accepted',received_at:'2026-09-30T17:00:00Z',envelope:'committed',artifacts:x.artifacts.map(a=>({...a,status:'verified'}))}))};
   ackCount++;return {status:200,text:JSON.stringify(ack)};
  }
  return fake.transport(r);
 };
 const ch=[];const link=new CaptureLink({userData,config,notify:()=>{},endCapture:()=>{},readDsn:()=> 'host=/nonexistent dbname=lc_p0_test',transport:t,retry_ms:100,stop_wait_ms:100,host:{spawn:fakeSpawn(()=>new FakeChild({ready:readyFor}),ch).spawn,end_ms:100}});
 try{
  link.begin(session,capture);link.appended(session,fs.statSync(path.join(capture,'manifest.jsonl')).size);
  await until('initial unknown/stalled',()=>link.status().state==='stalled',8000);
  const before=link.status();assert.equal(before.stored,0);assert.equal(before.storing,false);
  const raw=JSON.parse(lines[1]).raw;fs.unlinkSync(path.join(capture,'frames',raw.sha256+'.png'));
  await until('unknown set aside',()=>link.snapshot().streams[0].jobs[0].stuck===true,8000);
  await until('queue-empty state applied',()=>link.status().detail?.includes('once a later send is answered'),3000);
  const after=link.status(),page=controlPage();page.showLink(after);
  assert.equal(after.stored,0);assert.equal(after.unknown,2);assert.equal(after.state,'stalled');assert.equal(after.storing,false);assert.doesNotMatch(page.nodes.ai.textContent,/are also being stored/);assert.equal(ackCount,0);
  results.push({case:'W_COPY_02_empty_queue_keeps_stalled_after_stuck_unknown',pass:true,before,after,control_header:page.nodes.ai.textContent,batch_attempts:requests.filter(p=>p.endsWith(':batch')).length});
  const controlLine=page.nodes.link.textContent;assert.doesNotMatch(controlLine,/the last send was not stored/);assert.doesNotMatch(before.detail,/the last send was not stored/);
  assert.match(before.detail,/storage of the last send is not confirmed/);assert.match(after.detail,/storage of the last send is not confirmed/);assert.match(controlLine,/not known whether stored[\s\S]*storage of the last send is not confirmed/);
  results.push({case:'lost_reply_remains_unknown_and_is_said_not_confirmed',pass:true,before_detail:before.detail,after_detail:after.detail,control_line:controlLine,transport_error:'ECONNRESET',lost_batch_attempts:lostBatches.length,successful_ack_count:ackCount,persisted_job:{status:link.snapshot().streams[0].jobs[0].status,in_doubt:link.snapshot().streams[0].jobs[0].in_doubt,stuck:link.snapshot().streams[0].jobs[0].stuck}});
  answering=true;fs.writeFileSync(path.join(capture,'manifest.jsonl'),lines.slice(0,5).join('\n')+'\n');link.appended(session,fs.statSync(path.join(capture,'manifest.jsonl')).size);
  await until('later fresh records ACK',()=>link.status().stored===2,8000);
  const recovered=link.status();assert.equal(recovered.storing,true);assert.equal(recovered.unknown,2);assert.equal(recovered.state,'sending');assert.ok(ackCount>0);
  const first=link.snapshot().streams[0].jobs[0];assert.equal(first.status,'unknown');assert.equal(first.stuck,true);
  results.push({case:'later_exact_ACK_restores_storing_without_changing_prior_unknown',pass:true,status:recovered,successful_ack_count:ackCount});
  link.stopSending(session);await until('second stopped',()=>link.status().state==='stopped',5000);
 }finally{await link.quit(1000);for(const child of ch)child.exit(1);}
}
const report={candidate:'41fd2cb2845c8139f9ec5a326d38ebf593e290f9',code_commit:'41fd2cb2845c8139f9ec5a326d38ebf593e290f9',node:process.version,temp_directory:root,cases:results.length,results,scope:'Exact exported main/renderer/coordinator through existing Node VM/browser/Electron and child/transport fakes. No real GUI/child/socket/DB/provider.'};
fs.writeFileSync('/tmp/windows-qa04-41fd-probes.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
