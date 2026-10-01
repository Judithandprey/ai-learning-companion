import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Subscription, CONNECTOR_END_MS } from '/tmp/web-known-0b42bbc-ybn6rsu7/apps/windows/src/main/subscription.ts';
import { fakeConnectors, ACCOUNT } from '/tmp/web-known-0b42bbc-ybn6rsu7/apps/windows/tests/subscription-fakes.ts';

const config = {launch:{kind:'wsl',distribution:'synthetic',user:'synthetic',cd:'/synthetic',python:'/synthetic/python'},state_dir:null,codex_bin:null} as const;
const tick = () => new Promise<void>(r => setImmediate(r));
const request = {request_id:'review-1',question:'Synthetic?',assistance:'hint',image:{png_base64:'iVBORw0KGgo=',sha256:'a'.repeat(64),width:40,height:20},context:{capture_session_id:'session-review',frame_seq:1,frame_captured_at:null,frame_width:200,frame_height:100,display:{id:'display',bounds:{x:0,y:0,width:200,height:100},scale_factor:1},region_dip:{x:0,y:0,width:40,height:20},region_px:{x:0,y:0,width:40,height:20},ink_revision:null,ink_sha256:null,source_url:null,source_version:null,media_position:null}} as const;
const results: object[] = [];

for (const mode of ['unsolicited', 'cancel', 'stop'] as const) {
  const f = fakeConnectors();
  const s = new Subscription({config,spawn:f.spawn,notify:()=>undefined,openExternal:()=>undefined,request_ms:100,ask_ms:300,end_ms:10});
  await s.check();
  const c = f.last();
  const done = s.ask(request);
  if (mode === 'unsolicited') c.fail(c.asks()[0].id,'cancelled');
  else if (mode === 'cancel') s.cancel(request.request_id);
  else s.stopSession(request.context.capture_session_id);
  const outcome = await done;
  assert.deepEqual(outcome,{status:'cancelled',uncertain:mode==='unsolicited'});
  c.answer('Late synthetic response must not become a new submission or output');
  await tick();
  if (mode === 'stop') assert.equal((await s.ask({...request,request_id:'review-2'})).status,'refused');
  assert.equal(c.asks().length,1);
  assert.equal(f.made.length,1);
  results.push({case:`cancel_${mode}`,passed:true,outcome,asks:c.asks().length,children:f.made.length});
  await s.quit();
}

{
  const f = fakeConnectors(c => { c.endDelayMs = 60000; });
  const said: any[] = [];
  const s = new Subscription({config,spawn:f.spawn,notify:x=>said.push(x),openExternal:()=>undefined,request_ms:100,end_ms:10});
  await s.check();
  const first = f.last();
  let kills = 0;
  first.kill = () => { kills++; return true; };
  first.stdout.write('x'.repeat(256*1024+1));
  // Let the second fake's own forced exit settle before the first stuck shim's
  // timeout. The older child's late status must not change the new connection.
  await s.check();
  const second = f.last();
  second.stdout.write('x'.repeat(256*1024+1));
  await s.quit();
  assert.equal(kills,1);
  assert.equal(f.made.length,2);
  assert.match((s.status() as any).detail,/shim did not end either/);
  await s.check();
  const third = f.last();
  third.endDelayMs = 0;
  assert.equal((s.status() as any).state,'signed_in');
  assert.match((s.status() as any).detail,/shim did not end either/);
  const reads = third.count('connection/read');
  first.exit(0);
  first.stdout.write(JSON.stringify({method:'connection/changed',params:{}})+'\n'+JSON.stringify({id:'r1',result:ACCOUNT})+'\n');
  await tick();
  assert.equal((s.status() as any).state,'signed_in');
  assert.match((s.status() as any).detail,/shim was ended, which does not show/);
  assert.equal(third.count('connection/read'),reads);
  assert.equal(f.made.length,3);
  assert.equal(f.made.reduce((sum,c)=>sum+c.asks().length,0),0);
  await s.quit();
  assert.match((s.status() as any).detail,/shim was ended, which does not show/);
  results.push({case:'out_of_order_children_late_exit_no_stale_account_or_replay',passed:true,children:f.made.length,asks:0,late_status:said.at(-1)});
}
assert.equal(CONNECTOR_END_MS,10000);
writeFileSync('/tmp/web-known-followup-probe.json',JSON.stringify({candidate:'0b42bbc1088cf48f2c8daf4dcf4b3ea885a566c5',synthetic_only:true,default_end_ms:CONNECTOR_END_MS,results},null,2));
console.log(JSON.stringify({passed:results.length,default_end_ms:CONNECTOR_END_MS}));
