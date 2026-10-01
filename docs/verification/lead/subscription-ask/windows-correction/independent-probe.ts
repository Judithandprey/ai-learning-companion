import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Subscription } from '/tmp/windows-subscription-c977df5-r9d6qty6/apps/windows/src/main/subscription.ts';
import { ACCOUNT, fakeConnectors } from '/tmp/windows-subscription-c977df5-r9d6qty6/apps/windows/tests/subscription-fakes.ts';

const config = { launch: {kind:'wsl', distribution:'test', user:'test', cd:'/synthetic', python:'/synthetic/python'}, state_dir:null, codex_bin:null } as const;
const results: Record<string, unknown>[] = [];
const tick = () => new Promise<void>(r => setImmediate(r));
const create = () => {
  const f = fakeConnectors();
  const s = new Subscription({config, spawn:f.spawn, notify:()=>undefined, openExternal:()=>undefined, request_ms:500, ask_ms:500, end_ms:10});
  return {s,f};
};
const req = () => ({ request_id:'ask-0123456789abcdef.1', question:'What is this?', assistance:'hint', image:{png_base64:'iVBORw0KGgo=',sha256:'a'.repeat(64),width:40,height:20}, context:{capture_session_id:'0123456789abcdef',frame_seq:7,frame_captured_at:'2026-10-01T05:00:00.000Z',frame_width:2560,frame_height:1600,display:{id:'1',bounds:{x:-1280,y:0,width:1280,height:800},scale_factor:2},region_dip:{x:10,y:10,width:20,height:10},region_px:{x:20,y:20,width:40,height:20},ink_revision:3,ink_sha256:'b'.repeat(64),source_url:null,source_version:null,media_position:null} }) as const;

// Valid Backend protocol sequence: connection/read snapshots signed_out, then
// login completes while that read is still waiting on model/list.
{
  const {s,f}=create();
  await s.login();
  const c=f.last();
  c.account=null;
  const pending=s.check();
  const read=c.calls.at(-1)!;
  assert.equal(read.method,'connection/read');
  c.event('connection/changed',{});
  c.event('connection/login/completed',{login_id:'login-1',success:true,error:null});
  c.account=ACCOUNT;
  c.reply(read.id,{auth:{state:'signed_out',mode:null,plan:null},rate_limits:null,models:[]});
  await pending; await tick();
  const observed={status:s.status(), reads:c.count('connection/read')};
  assert.equal(observed.reads,2);
  assert.equal((observed.status as any).state,'signed_in');
  results.push({probe:'login_success_during_connection_read', fixed:true, observed, expected:'An account-change/login-completed event queues a fresh read; stale signed_out is not the final state.'});
  await s.quit();
}

// Reject a missing/malformed confirmation field instead of turning it into a
// claim that remote processing stopped. No real provider is involved.
for (const receipt of [{}, null, {cancelled:true,uncertain:'unknown'}, {cancelled:false,uncertain:false}]) {
  const {s,f}=create(); await s.check();
  const c=f.last(); const q=req(); const pending=s.ask(q);
  c.stdin.removeAllListeners('data');
  let cancelId='';
  c.stdin.on('data',(b:Buffer)=>{const m=JSON.parse(b.toString()); if(m.method==='ask/cancel')cancelId=m.id;});
  s.cancel(q.request_id);
  assert.ok(cancelId);
  c.reply(cancelId,receipt); c.fail(c.asks().at(-1)!.id,'cancelled');
  const observed=await pending;
  assert.deepEqual(observed,{status:'cancelled',uncertain:true});
  results.push({probe:'non_confirmation_cancel_receipt',receipt,observed,fixed:true,expected:'uncertain:true unless the method-specific receipt confirms interruption.'});
  await s.quit();
}

// An overlong reply fences input, but process reaping must still settle the
// exit promise. The synthetic child exits immediately on EOF.
{
  const {s,f}=create(); await s.check(); const c=f.last();
  let killCalls=0; const originalKill=c.kill.bind(c);
  c.kill=()=>{killCalls++;return originalKill();};
  c.stdout.write('x'.repeat(256*1024+1));
  await new Promise(r=>setTimeout(r,50));
  assert.equal(c.exited,true); assert.equal(killCalls,0);
  results.push({probe:'oversize_line_exit_settlement',fixed:true,observed:{already_exited:c.exited,kill_calls_after_exit:killCalls,state:(s.status() as any).state},expected:'Resolve exited even after protocol fence, with no timeout/kill of an already exited child.'});
  await s.quit();
}
writeFileSync('/tmp/windows-subscription-correction-independent-probe.json',JSON.stringify({candidate:'c977df5',synthetic_only:true,results},null,2));
console.log(JSON.stringify({synthetic_only:true,probes:results.length,results}));
