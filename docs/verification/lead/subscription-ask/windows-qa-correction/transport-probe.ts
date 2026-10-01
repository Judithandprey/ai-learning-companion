import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Subscription } from '/tmp/web-qa-subscription-0fae135-f7laoj0o/apps/windows/src/main/subscription.ts';
import { ACCOUNT, fakeConnectors } from '/tmp/web-qa-subscription-0fae135-f7laoj0o/apps/windows/tests/subscription-fakes.ts';
const config={launch:{kind:'wsl',distribution:'test',user:'test',cd:'/synthetic',python:'/synthetic/python'},state_dir:null,codex_bin:null} as const;
const tick=()=>new Promise<void>(r=>setImmediate(r));
const make=()=>{const f=fakeConnectors();const s=new Subscription({config,spawn:f.spawn,notify:()=>undefined,openExternal:()=>undefined,request_ms:30,ask_ms:200,end_ms:20,change_window_ms:1});return {s,f};};
const results:any[]=[];
const request={request_id:'ask-review-1',question:'Synthetic test?',assistance:'hint',image:{png_base64:'iVBORw0KGgo=',sha256:'a'.repeat(64),width:40,height:20},context:{capture_session_id:'session-review',frame_seq:1,frame_captured_at:null,frame_width:200,frame_height:100,display:{id:'display',bounds:{x:0,y:0,width:200,height:100},scale_factor:1},region_dip:{x:0,y:0,width:40,height:20},region_px:{x:0,y:0,width:40,height:20},ink_revision:null,ink_sha256:null,source_url:null,source_version:null,media_position:null}} as const;

{
 const {s,f}=make();await s.check();const c=f.last();
 c.onCall=call=>{if(call.method==='connection/read')c.event('connection/changed',{});};
 await s.check();assert.equal((s.status() as any).state,'unknown');const reads=c.count('connection/read');
 c.onCall=()=>undefined;await new Promise(r=>setTimeout(r,5));c.event('connection/changed',{});await tick();assert.equal(c.count('connection/read'),reads);
 await s.login();c.manual.add('connection/login/cancel');const cancel=s.cancelLogin();await cancel;
 assert.equal((s.status() as any).login,'waiting');assert.match((s.status() as any).detail,/not confirmed/);
 const denied=await s.ask(request);assert.equal(denied.status,'refused');assert.equal(c.asks().length,0);
 c.event('connection/login/completed',{login_id:'login-1',success:true,error:null});await tick();
 assert.equal((s.status() as any).state,'signed_in');assert.equal((s.status() as any).login,'none');assert.equal(c.count('connection/read'),reads+1);
 const old=c.calls.findLast(x=>x.method==='connection/login/cancel')!;c.reply(old.id,{});await tick();assert.equal((s.status() as any).login,'none');
 results.push({case:'latched_budget_pending_cancel_timeout_success',passed:true,children:f.made.length,asks:c.asks().length,read_count:c.count('connection/read'),final_state:(s.status() as any).state});await s.quit();
}
{
 const {s,f}=make();await s.check();const c=f.last();const done=s.ask(request);c.fail(c.asks()[0].id,'cancelled');const outcome=await done;
 assert.deepEqual(outcome,{status:'cancelled',uncertain:false});
 results.push({case:'disclosed_unsolicited_cancel',reproduced:true,cancel_requests:c.count('ask/cancel'),outcome});await s.quit();
}
{
 const {s,f}=make();await s.check();const c=f.last();c.account=null;const checking=s.check();const id=c.calls.at(-1)!.id;
 c.stdout.write(JSON.stringify({method:'connection/changed',params:{}})+'\n'+JSON.stringify({id,result:ACCOUNT})+'\n'+'x'.repeat(256*1024+1));await checking;await tick();
 assert.equal(f.made.length,1);assert.equal((s.status() as any).state,'unavailable');
 results.push({case:'prior_same_chunk_fence',passed:true,children:1,state:(s.status() as any).state});await s.quit();
}
writeFileSync('/tmp/web-qa-subscription-transport-probe.json',JSON.stringify({candidate:'0fae1350464de1dcd408f076316192d3840d35cb',synthetic_only:true,results},null,2));console.log(JSON.stringify(results));
