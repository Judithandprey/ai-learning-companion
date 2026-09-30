import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
const sourcePath = '/tmp/windows-portability-5dc-export/apps/windows/tests/uploader.test.ts';
const source = readFileSync(sourcePath, 'utf8');
const ts = source.slice(source.indexOf('async function holdUnshared('), source.indexOf('\nconst digest =', source.indexOf('async function holdUnshared(')));
const js = stripTypeScriptTypes(ts);
const observations = [];
function setup(killResult = true) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  const timers = [];
  const calls = [];
  child.kill = () => { calls.push('kill'); return killResult; };
  const context = vm.createContext({ Buffer, process: { env: { PATH: '/synthetic-bin' } }, spawn: (...args) => { calls.push(args); return child; }, setTimeout: (cb, ms) => { const t = { cb, ms }; timers.push(t); return t; } });
  const hold = vm.runInContext(js + '\nholdUnshared', context);
  return { child, timers, calls, hold };
}
const drain = async () => { for (let i = 0; i < 8; ++i) await Promise.resolve(); };
test('successful readiness and release leave both 30 s and 10 s timers active', async () => {
  const s = setup();
  const holding = s.hold('/synthetic/capture/ink-originals/example.json');
  s.child.stdout.emit('data', Buffer.from('held\n'));
  const release = await holding;
  s.child.stdin.end = () => { s.child.emit('exit', 0); };
  await release();
  assert.deepEqual(s.timers.map(t => t.ms), [30000, 10000]);
  assert.equal(s.calls[0][0], 'powershell.exe');
  assert.equal(s.calls[0][2].env.LC_HOLD_FILE, '/synthetic/capture/ink-originals/example.json');
  assert.ok(!s.calls[0][1].at(-1).includes('/synthetic/capture'));
  observations.push({ case: 'normal-release', still_registered_timer_ms: s.timers.map(t => t.ms), fixed_command_path_in_env: true });
});
test('asynchronous spawn error has no error handler and throws out of EventEmitter', async () => {
  const s = setup();
  const holding = s.hold('/synthetic/file');
  assert.equal(s.child.listenerCount('error'), 0);
  assert.throws(() => s.child.emit('error', Object.assign(new Error('spawn powershell.exe ENOENT'), { code: 'ENOENT' })), { code: 'ENOENT' });
  // Explicit double cleanup only; a failed real spawn does not promise an exit event.
  s.child.emit('exit', -1);
  await assert.rejects(holding, /did not hold/);
  observations.push({ case: 'spawn-error', error_listener_count: 0, unhandled_ENOENT: true });
});
test('stdin EPIPE also has no error handler', async () => {
  const s = setup();
  const holding = s.hold('/synthetic/file');
  s.child.stdout.emit('data', Buffer.from('held\n'));
  const release = await holding;
  assert.equal(s.child.stdin.listenerCount('error'), 0);
  assert.throws(() => s.child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })), { code: 'EPIPE' });
  s.child.emit('exit', 1);
  await release();
  observations.push({ case: 'stdin-error', error_listener_count: 0, unhandled_EPIPE: true });
});
test('kill false with no exit leaves release pending past its only deadline', async () => {
  const s = setup(false);
  const holding = s.hold('/synthetic/file');
  s.child.stdout.emit('data', Buffer.from('held\n'));
  const release = await holding;
  let settled = false;
  const releasing = release().then(() => { settled = true; });
  s.timers.find(t => t.ms === 10000).cb();
  await drain();
  assert.ok(s.calls.includes('kill'));
  assert.equal(settled, false);
  // There is no new bound after kill. Finish all known timers without emitting exit.
  s.timers.find(t => t.ms === 30000).cb();
  await drain();
  assert.equal(settled, false);
  observations.push({ case: 'kill-no-exit', kill_return: false, release_settled_after_all_deadlines: false, final_exit_wait_unbounded: true });
  s.child.emit('exit', 1);
  await releasing;
});
process.on('exit', () => writeFileSync('/tmp/windows-portability-5dc-helper-probe.json', JSON.stringify({ sourcePath, sourceSha256: createHash('sha256').update(source).digest('hex'), helperSha256: createHash('sha256').update(ts).digest('hex'), scope: 'Exact extracted helper, Linux Node with EventEmitter/clock/spawn doubles; no PowerShell, real child, Windows lock or uploader suite execution.', observations }, null, 2) + '\n'));
