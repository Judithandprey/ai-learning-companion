// Pure source/helper observations only. No process launch, query, signal or deletion.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {argv,ownedKind,releaseOwned,signalCommand} from '/tmp/qa-launcher-b583969-29vnve7i/tests/e2e/windows/signin_cleanup.mjs';
const root='/tmp/qa-launcher-b583969-29vnve7i/tests/e2e/windows';
const E='C:\\T\\electron.exe',S='C:\\T\\stage',D='C:\\T\\check-43000';
const expected={exe:E,app:[S,'--remote-debugging-port=43000','--remote-debugging-address=127.0.0.1'],checker:[D+'\\qa-check.js','--qa-check-port=43000'],markers:['--remote-debugging-port=43000','--qa-check-port=43000'],notBefore:'1000'};
const p={pid:741,created:'2000',exe:E,command_line:`"${E}" "${S}" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1`};
const results=[];
{
 let looks=0,removed=false;const attempted=[],actuallySignalled=[];
 const replacement={pid:p.pid,created:'3000',exe:'C:\\Other\\electron.exe',command_line:'other.exe other-app'};
 const r=await releaseOwned({look:async()=>({processes:++looks===1?[p]:[replacement],listen:[]}),signal:async(identity,how)=>{attempted.push({identity,how});if(identity.created!==replacement.created)return 'stale';actuallySignalled.push(identity);return 'signalled';},sleep:async()=>{},now:()=>0,expected,ownsFolder:true,removeFolder:async()=>{removed=true;return true;},waitSelfMs:0,waitCloseMs:0,waitForceMs:0});
 assert.equal(attempted[0].identity.created,p.created);assert.deepEqual(actuallySignalled,[]);assert.equal(r.signals[0].answer,'stale');
 results.push({case:'prior1_pid_reuse',fixed:true,signals_to_replacement:0,signal_identity_has_creation:true,exit:r.exit,removed});
}
for(const neverSeen of [false,true]) {
 let n=0,clock=0,removed=false;const signals=[];
 const r=await releaseOwned({look:async()=>({processes:[!neverSeen&&n++===0?p:{...p,command_line:null}],listen:[]}),signal:async(...a)=>{signals.push(a);return 'signalled';},sleep:async()=>{clock++;},now:()=>clock,expected,ownsFolder:true,removeFolder:async()=>{removed=true;return true;},waitSelfMs:2,waitCloseMs:0,waitForceMs:0,stepMs:1});
 assert.equal(r.exit,'unknown');assert.equal(removed,false);assert.equal(signals.length,0);
 results.push({case:neverSeen?'never_seen_unreadable':'prior2_remembered_unreadable',fixed:true,exit:r.exit,removed,signals:signals.length});
}
{
 const longer={...p,exe:'C:\\Other\\electron.exe',command_line:'"C:\\Other\\electron.exe" "C:\\Other\\check.js" --qa-check-port=430009'};
 const same={...longer,command_line:longer.command_line.replace('430009','43000')};
 assert.equal(ownedKind(longer,expected),'foreign');assert.equal(ownedKind(same,expected),'unresolved');
 results.push({case:'prior3_exact_executable_and_argv_boundary',fixed:true,longer_port:ownedKind(longer,expected),same_port_other_executable:ownedKind(same,expected)});
}
{
 const command=signalCommand(p,'force');
 const hold=command.indexOf('$null = $p.Handle');const reread=command.indexOf('Get-CimInstance');const ordinal=command.lastIndexOf('[StringComparison]::Ordinal');const kill=command.indexOf('$p.Kill()');
 assert.ok(hold>=0&&reread>hold&&ordinal>reread&&kill>ordinal&&!command.includes('taskkill'));
 results.push({case:'held_handle_then_ordinal_reread',passed:true,order:[hold,reread,ordinal,kill],runtime_executed:false});
}
{
 const source=readFileSync(root+'/signin_launcher.mjs','utf8');
 const expr=source.match(/processes: (seen\.processes\.filter\([^\n]+\)) \};/)[1];
 const filter=new Function('seen','argv',`return ${expr};`);
 const changed={...p,command_line:p.command_line+' --type=renderer'};
 async function run(filtered){let n=0,clock=0,removed=false;const signals=[];const r=await releaseOwned({look:async()=>{const seen={processes:[n++===0?p:changed],listen:[]};return {...seen,processes:filtered?filter(seen,argv):seen.processes};},signal:async(...a)=>{signals.push(a);return 'signalled';},sleep:async()=>{clock++;},now:()=>clock,expected,ownsFolder:true,removeFolder:async()=>{removed=true;return true;},waitSelfMs:2,waitCloseMs:0,waitForceMs:0,stepMs:1});return {exit:r.exit,removed,signals:signals.length,not_revalidated:r.not_revalidated};}
 const actual=await run(true),unfiltered=await run(false);
 assert.equal(actual.exit,'confirmed');assert.equal(actual.removed,true);assert.equal(unfiltered.exit,'unknown');assert.equal(unfiltered.removed,false);
 results.push({case:'caller_drops_remembered_identity_on_changed_type_argument',reproduced:true,simulated_process_still_alive:true,same_pid_and_creation:true,actual_launcher_filter:actual,helper_with_full_snapshot:unfiltered,process_metadata_mutation_simulated:true});
}
const r={code:'b583969',scope:'pure exact-source helper and extracted caller filter; no Windows/process/filesystem cleanup operations',results};writeFileSync('/tmp/qa-launcher-identity-correction-probe.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
