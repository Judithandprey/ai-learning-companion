// Exact-candidate supervisor probes. Only harmless owned child processes; no host/service/DB.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { startHost } from '/tmp/lc-windows-parent-d6ef68a/apps/windows/src/main/capture-host.ts';
import { record } from '/tmp/lc-windows-parent-d6ef68a/apps/windows/tests/host-fixture.ts';

const launch = {kind:'wsl', distribution:'synthetic', user:'synthetic', cd:'/tmp', python:'/unused'};
const startup = record({fresh:true, token:'synthetic-bearer-0123456789abcdef-XYZ', stream_id:'synthetic-stream'});
const never = async () => { throw new Error('No network permitted in this probe'); };
if (process.argv[2] === 'closed-input') {
  const result = await startHost(launch, startup, {
    ready_ms:300, end_ms:10, transport:never,
    spawn:(_cmd, _args, options) => {
      // Give a real child time to close its read end before the supervisor writes.
      // This merely controls scheduling; ChildProcess.stdin and its EPIPE are real Node.
      const child = spawn('/bin/sh', ['-c','exec 0<&-; sleep 0.2'], options);
      spawnSync('/bin/sleep', ['0.05']);
      return child;
    },
  });
  console.log(JSON.stringify({case:'closed-input', result}));
} else {
  const noSpawn = await startHost(launch, startup, {
    ready_ms:200, end_ms:10, transport:never,
    spawn:(_cmd, _args, options) => spawn('/tmp/lc-deliberately-nonexistent-host-executable', [], options),
  });
  const broken = spawnSync(process.execPath, [import.meta.filename, 'closed-input'], {encoding:'utf8', timeout:2000});
  const receipt = {
    candidate:'d6ef68a03bc3e18569d1b4a85dc20f09b7717dff',
    no_spawn:{expected_delivered:false, actual:noSpawn},
    closed_input:{expected:'bounded HostStart failure, no uncaught exception', exit_status:broken.status,
      stdout:broken.stdout, stderr:broken.stderr, harness_error:broken.error?.code ?? null},
    boundary:'Exact candidate startHost with actual Node child-process failures; synthetic record and scheduling. No Windows/WSL or Backend execution.',
  };
  writeFileSync('/tmp/windows-parent-host-probes.json', JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
}
