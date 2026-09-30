// Scheduling/control for the failure probe: actual child and actual Node Socket EPIPE,
// with an error listener to show the safe behavior. No host/service/DB is run.
import { spawn, spawnSync } from 'node:child_process';
const c = spawn('/bin/sh', ['-c', 'exec 0<&-; sleep 0.2'], {stdio:['pipe','pipe','pipe']});
const facts = {pid:c.pid, child_error:null, stdin_error:null, child_exit:null, schedule:null};
c.on('error', e => { facts.child_error = e.code; });
c.stdin.on('error', e => { facts.stdin_error = e.code; });
const delay = spawnSync('/bin/sleep', ['0.05']);
facts.schedule = {status:delay.status, error:delay.error?.code ?? null};
c.stdin.write('synthetic\n');
c.on('exit', (code, signal) => {
  facts.child_exit = {code, signal};
  console.log(JSON.stringify(facts,null,2));
  if (!facts.pid || facts.child_error || facts.stdin_error !== 'EPIPE' || code !== 0) process.exitCode = 1;
});
