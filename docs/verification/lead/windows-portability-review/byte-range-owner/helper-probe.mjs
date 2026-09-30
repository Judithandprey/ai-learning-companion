import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
const sourcePath = '/tmp/windows-byte-range-7626321-export/apps/windows/tests/uploader.test.ts';
const source = readFileSync(sourcePath, 'utf8');
const helper = source.slice(source.indexOf('async function lockWhole('), source.indexOf('\nconst digest =', source.indexOf('async function lockWhole(')));
const js = stripTypeScriptTypes(helper);
const observations = [];
function setup() {
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  let kills = 0;
  child.kill = () => { ++kills; return true; };
  const timers = [];
  const context = vm.createContext({ assert, Buffer, process: { env: {} }, spawn: () => child,
    setTimeout: (cb, ms) => { const t = { cb, ms, active: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.active = false; } });
  const lock = vm.runInContext(js + '\nlockWhole', context);
  const fire = ms => { const t = timers.find(t => t.ms === ms && t.active); assert.ok(t, `active ${ms} deadline exists`); t.active = false; t.cb(); };
  return { child, timers, lock, fire, get kills() { return kills; } };
}
const drain = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
const ready = async s => { const pending = s.lock('/synthetic/original'); s.child.stdout.emit('data', Buffer.from('held\n')); return await pending; };
test('normal readiness and release cancel both deadline timers', async () => {
  const s = setup(); const release = await ready(s);
  s.child.stdin.end = () => s.child.emit('exit', 0, null);
  await release();
  assert.deepEqual(s.timers.map(t => [t.ms,t.active]), [[30000,false],[10000,false]]);
  observations.push({ case: 'normal', all_timers_cancelled: true, release_resolved_after_exit: true });
});
test('failure to spawn rejects readiness without an uncaught child error or live timer', async () => {
  const s = setup(); s.child.pid = undefined;
  const pending = s.lock('/synthetic/original');
  s.child.emit('error', Object.assign(new Error('missing executable'), { code: 'ENOENT' }));
  await assert.rejects(pending, /did not lock/);
  assert.equal(s.timers.filter(t => t.active).length,0);
  observations.push({ case: 'spawn-ENOENT', fails_readiness: true, all_timers_cancelled: true });
});
test('kill with no error and no exit reaches final deadline and fails', async () => {
  const s = setup(); const release = await ready(s);
  const pending = release(); const rejection = assert.rejects(pending, /ended when killed/);
  s.fire(10000); await drain(); assert.equal(s.kills,1);
  s.fire(5000); await rejection;
  assert.equal(s.timers.filter(t=>t.active).length,0);
  observations.push({ case: 'no-exit', final_5000ms_deadline_rejects: true });
});
test('post-spawn kill error is currently treated as helper exit', async () => {
  const s = setup(); const release = await ready(s);
  let exitObserved = false; s.child.on('exit',()=> { exitObserved = true; });
  s.child.kill = () => { s.child.emit('error', Object.assign(new Error('kill denied'), { code: 'EPERM' })); return false; };
  const pending = release();
  s.fire(10000); await pending;
  assert.equal(exitObserved,false);
  assert.equal(s.timers.filter(t=>t.active).length,0);
  observations.push({ case: 'kill-EPERM', release_resolved: true, exit_observed: false, live_pid: s.child.pid, finding: 'post-spawn error must not certify child exit' });
});
process.on('exit',()=>writeFileSync('/tmp/windows-byte-range-owner-helper-probe.json',JSON.stringify({ sourcePath, sourceSha256:createHash('sha256').update(source).digest('hex'), helperSha256:createHash('sha256').update(helper).digest('hex'), scope:'Exact extracted source, Linux Node with EventEmitter/spawn/manual clock doubles. No PowerShell, child process, Windows lock or uploader execution.', observations },null,2)+'\n'));
