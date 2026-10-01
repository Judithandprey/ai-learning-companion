// Pure exact-source helper/predicate probes. No process launch/inspection/termination.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {releaseOwned} from './qa-signin-cleanup-85d79e6/signin_cleanup.mjs';
const results=[];
{
 let looks=0, current='owned', removed=false;const actions=[];
 const r=await releaseOwned({
  look:async()=>{looks++;if(looks===1){current='unrelated replacement PID';return{owned:[741],others:[]};}return{owned:[],others:[]};},
  askToClose:async pid=>actions.push({pid,current,action:'PID-only taskkill'}),endByForce:async()=>{},sleep:async()=>{},now:()=>0,
  ownsFolder:true,removeFolder:async()=>{removed=true;return true;},waitSelfMs:0,waitCloseMs:0,waitForceMs:0,
 });
 assert.equal(actions[0].current,'unrelated replacement PID');
 results.push({case:'PID reused after ownership query before action',actions,exit:r.exit,folder_removed:removed,proves:'act receives stale numeric PID without a new identity check'});
}
{
 let looks=0,clock=0,removed=false,originalStillAlive=true;const actions=[];
 const r=await releaseOwned({
  look:async()=>++looks===1?{owned:[742],others:[],foreign:[]}:{owned:[],others:[],foreign:[742]},
  askToClose:async pid=>actions.push(pid),endByForce:async pid=>actions.push(pid),sleep:async()=>{clock++;},now:()=>clock,
  ownsFolder:true,removeFolder:async()=>{removed=true;return true;},waitSelfMs:2,waitCloseMs:0,waitForceMs:0,stepMs:1,
 });
 assert.equal(r.exit,'confirmed');assert.equal(removed,true);assert.equal(actions.length,0);
 results.push({case:'previously owned process becomes unreadable/no listener, classified foreign by caller',originalStillAlive,exit:r.exit,folder_removed:removed,actions});
}
{
 const source=readFileSync('/tmp/qa-signin-cleanup-85d79e6/signin_launcher.mjs','utf8');
 const matches=[...source.matchAll(/\.Contains\('([^']*\$\{port\}[^']*)'\)/g)].map(x=>x[1].replace('${port}','43000'));
 assert.deepEqual(matches,['--remote-debugging-port=43000 ','--qa-check-port=43000']);
 const unrelated='"C:\\OtherApp\\electron.exe" "C:\\OtherApp\\check.js" --qa-check-port=430009';
 const admitted=matches.some(x=>unrelated.includes(x));assert.equal(admitted,true);
 results.push({case:'unrelated executable/script and longer marker value match exact caller Contains predicate',needles:matches,unrelated_command:unrelated,classified_owned:admitted});
}
writeFileSync('/tmp/qa-signin-cleanup-probe.json',JSON.stringify({scope:'Pure source/helper simulation, not Windows runtime',results},null,2)+'\n');
console.log(JSON.stringify({observations:results.length,all_reproduced:true,results},null,2));
