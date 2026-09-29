// Bounded probe of stopChild: a live child, a child already killed by a signal, and a child that
// already exited normally must all be handled without hanging. Exits non-zero on any failure.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { stopChild } from './child.mjs';

const within = (ms, promise) => Promise.race([promise.then(() => 'returned'), new Promise((ok) => setTimeout(() => ok('hung'), ms))]);
const results = [];

const live = spawn('sleep', ['30']);
await once(live, 'spawn');
results.push(['live child stops on SIGINT', await within(5000, stopChild(live, 2000)), live.signalCode]);

const signaled = spawn('sleep', ['30']);
await once(signaled, 'spawn');
signaled.kill('SIGKILL');
await once(signaled, 'exit');
results.push(['already signaled child (exitCode null, signalCode set)', await within(2000, stopChild(signaled)), `${signaled.exitCode}/${signaled.signalCode}`]);

const exited = spawn('true');
await once(exited, 'exit');
results.push(['already exited child (exitCode 0)', await within(2000, stopChild(exited)), `${exited.exitCode}/${exited.signalCode}`]);

results.push(['no child', await within(1000, stopChild(null)), '-']);

let failed = 0;
for (const [name, outcome, detail] of results) {
  const ok = outcome === 'returned';
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${outcome} (${detail})`);
}
process.exit(failed ? 1 : 0);
