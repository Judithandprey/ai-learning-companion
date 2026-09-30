// Bounded retest of WIN-HOST-01/02, exact correction; no Backend, listener, WSL, DB or GUI.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { startHost } from '/tmp/lc-windows-parent-5871981/apps/windows/src/main/capture-host.ts';
import { record } from '/tmp/lc-windows-parent-5871981/apps/windows/tests/host-fixture.ts';

const launch = {kind:'wsl', distribution:'synthetic', user:'synthetic', cd:'/tmp', python:'/unused'};
const startup = record({fresh:true, token:'synthetic-bearer-0123456789abcdef-XYZ', stream_id:'synthetic-stream'});
let requests = 0;
const never = async () => { requests++; throw new Error('No network permitted in this probe'); };
const outcomes = [];

let missingPid, missingCode;
const missing = await startHost(launch, startup, {
  ready_ms:400, end_ms:100, transport:never,
  spawn:(_cmd,_args,options) => {
    const child=spawn('/tmp/lc-deliberately-nonexistent-host-executable',[],options);
    missingPid=child.pid;
    child.on('error',error => { missingCode=error.code; });
    return child;
  },
});
assert.equal(missingPid,undefined);
assert.equal(missingCode,'ENOENT');
assert.deepEqual(missing,{ok:false,reason:'the host could not be started',exit:null,delivered:false});
outcomes.push({case:'actual_spawn_ENOENT',pid:missingPid??null,code:missingCode,result:missing});

let closedPid, closedFirst=false, inputError;
const closed = await startHost(launch,startup,{
  ready_ms:1000,end_ms:1000,transport:never,
  spawn:(_cmd,_args,options) => {
    const child=spawn('/bin/sh',['-c','exec 0<&-; sleep 0.2'],options);
    closedPid=child.pid;
    assert.ok(closedPid);
    child.stdin.on('error',error=>{inputError=error.code;});
    for(let i=0;i<50 && existsSync(`/proc/${closedPid}/fd/0`);i++) spawnSync('/bin/sleep',['0.01']);
    closedFirst=!existsSync(`/proc/${closedPid}/fd/0`);
    return child;
  },
});
assert.equal(closedFirst,true);
assert.equal(inputError,'EPIPE');
assert.deepEqual(closed,{ok:false,reason:'the startup record could not be given to the host',
  exit:{code:0,signal:null,error:null},delivered:false});
assert.equal(existsSync(`/proc/${closedPid}`),false);
outcomes.push({case:'actual_closed_input_EPIPE',pid:closedPid,inputError,closed_before_write:closedFirst,reaped:true,result:closed});

let consumedPid, consumedClosed, observed='', consumedError='';
const consumed = await startHost(launch,startup,{
  ready_ms:1000,end_ms:1000,transport:never,
  spawn:(_cmd,_args,options) => {
    const child=spawn('/bin/sh',['-c','IFS= read -r line || exit 3; printf "read_whole_line\\n"'],options);
    consumedPid=child.pid;
    consumedClosed=new Promise(resolve=>child.once('close',resolve));
    child.stdout.on('data',chunk=>{observed+=chunk;});
    child.stderr.on('data',chunk=>{consumedError+=chunk;});
    return child;
  },
});
await consumedClosed;
assert.equal(consumed.ok,false);
assert.equal(consumed.delivered,true);
assert.ok(observed,JSON.stringify({consumed,stderr:consumedError}));
assert.equal(observed.trim(),'read_whole_line');
assert.equal(existsSync(`/proc/${consumedPid}`),false);
outcomes.push({case:'whole_LF_record_consumed_without_READY',read:observed.trim(),reaped:true,result:consumed});

let pendingPid;
const pending = await startHost(launch,startup,{
  ready_ms:150,end_ms:100,transport:never,
  spawn:(_cmd,_args,options) => {
    const child=spawn('/bin/sh',['-c','exec sleep 10'],options);
    pendingPid=child.pid;
    // Explicit non-protocol control: fill the real pipe so the candidate's write stays pending.
    child.stdin.write(Buffer.alloc(2*1024*1024,0x20));
    return child;
  },
});
assert.equal(pending.ok,false);
assert.equal(pending.delivered,true);
assert.equal(pending.exit?.signal,'SIGTERM');
assert.equal(existsSync(`/proc/${pendingPid}`),false);
outcomes.push({case:'pending_write_deadline',reaped:true,result:pending});

let fifoPath;
const thrown = await startHost({kind:'fifo',python:'/unused',cwd:'/tmp'},startup,{
  transport:never,
  spawn:(_cmd,args) => {fifoPath=args[3];throw new Error('synthetic synchronous spawn failure');},
});
assert.ok(fifoPath);
assert.equal(thrown.ok,false);
assert.equal(thrown.delivered,false);
assert.equal(existsSync(fifoPath),false);
assert.equal(existsSync(dirname(fifoPath)),false);
outcomes.push({case:'synchronous_FIFO_spawn_failure',fifo_removed:true,directory_removed:true,result:thrown});
assert.equal(requests,0);
const receipt={candidate:'5871981524140e3be986268a941d34e99af25bb9',groups_passed:outcomes.length,requests,
  cases:outcomes,boundary:'Real Node child-process pipe failures and synthetic scheduling/capacity controls only. No Backend, DB, network listener, WSL/Windows, GUI or provider.'};
writeFileSync('/tmp/windows-parent-host-correction-probes.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
