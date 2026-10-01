import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Subscription } from '/tmp/windows-subscription-c977df5-r9d6qty6/apps/windows/src/main/subscription.ts';
import { ACCOUNT, fakeConnectors } from '/tmp/windows-subscription-c977df5-r9d6qty6/apps/windows/tests/subscription-fakes.ts';
const config={launch:{kind:'wsl',distribution:'test',user:'test',cd:'/synthetic',python:'/synthetic/python'},state_dir:null,codex_bin:null} as const;
const f=fakeConnectors(c=>{if(f.made.length===0)c.account=null;});
const s=new Subscription({config,spawn:f.spawn,notify:()=>undefined,openExternal:()=>undefined,request_ms:500,end_ms:10});
const checking=s.check();
const c=f.last();
const id=c.calls[0].id;
// A single child output chunk: queued refresh, successful reply, and an
// over-bound final line. The same child is fenced before promise continuations.
c.stdout.write(JSON.stringify({method:'connection/changed',params:{}})+'\n'+JSON.stringify({id,result:ACCOUNT})+'\n'+'x'.repeat(256*1024+1));
await checking;
await new Promise<void>(resolve=>setImmediate(resolve));
const result={candidate:'c977df5',synthetic_only:true,original_child_exited:c.exited,spawn_count:f.made.length,methods:f.made.map(k=>k.calls.map(x=>x.method)),status:s.status()};
assert.equal(result.spawn_count,2);
assert.equal((result.status as any).state,'signed_in');
writeFileSync('/tmp/windows-subscription-correction-fence-probe.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
await s.quit();
