// node --test tests/e2e/windows/signin_cleanup.test.mjs   (no Windows, no display: the rule only)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseOwned } from './signin_cleanup.mjs';

// A small world: owned PIDs with how they end; the calls made are recorded. Time is the number of sleeps and looks.
function world({ owned = {}, others = [], lookFails = () => false, ownsFolder = true, removeThrows = false, askThrows = false, forceThrows = false, lookMs = 0 } = {}) {
  const calls = { looks: 0, asked: [], forced: [], removed: 0, slept: 0 };
  const alive = new Map(Object.entries(owned).map(([pid, how]) => [Number(pid), { ...how }]));
  const deps = {
    look: async () => { calls.looks += 1; if (lookFails(calls)) throw new Error('cannot look'); return { owned: [...alive.keys()], others: [...others] }; },
    // onAsk / onForce: true = gone at once; a number = gone that many sleeps later (an app that takes time to quit).
    askToClose: async (pid) => { calls.asked.push(pid); if (askThrows) throw new Error('refused'); const how = alive.get(pid); if (how?.onAsk === true) alive.delete(pid); else if (typeof how?.onAsk === 'number') how.selfAfter = calls.slept + how.onAsk; },
    endByForce: async (pid) => { calls.forced.push(pid); if (forceThrows) throw new Error('not found'); const how = alive.get(pid); if (how?.onForce === true) alive.delete(pid); else if (typeof how?.onForce === 'number') how.selfAfter = calls.slept + how.onForce; },
    sleep: async () => { calls.slept += 1; for (const [pid, how] of alive) if (how.selfAfter !== undefined && calls.slept >= how.selfAfter) alive.delete(pid); },
    now: () => calls.slept * 500 + calls.looks * lookMs,
    ownsFolder,
    removeFolder: async () => { if (removeThrows) throw new Error('locked'); calls.removed += 1; return true; },
    waitSelfMs: 2000, waitCloseMs: 2000, waitForceMs: 2000, stepMs: 500,
  };
  return { deps, calls };
}

test('nothing of the check is running: exit confirmed, the folder it made is removed, nothing is ended', async () => {
  const { deps, calls } = world();
  const r = await releaseOwned(deps);
  assert.equal(r.exit, 'confirmed'); assert.equal(r.folder, 'removed'); assert.deepEqual([calls.asked, calls.forced, calls.removed], [[], [], 1]);
});

test('the app ends by itself during the first wait: no close request, no force', async () => {
  const { deps, calls } = world({ owned: { 41: { selfAfter: 2 } } });
  const r = await releaseOwned(deps);
  assert.equal(r.exit, 'confirmed'); assert.deepEqual(r.owned_seen, [41]); assert.deepEqual([calls.asked, calls.forced], [[], []]); assert.equal(r.folder, 'removed');
});

test('the app stays: it is asked to close, ends, and only then is the folder removed', async () => {
  const { deps, calls } = world({ owned: { 41: { onAsk: true } } });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.asked_to_close, r.ended_by_force, r.owned_seen], ['confirmed', [41], [], [41]]); assert.equal(calls.removed, 1);
});

test('the app ignores the close request: it is ended by force, owned PIDs only', async () => {
  const { deps, calls } = world({ owned: { 41: { onForce: true }, 42: { onAsk: true } } });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.asked_to_close, r.ended_by_force], ['confirmed', [41, 42], [41]]); assert.deepEqual(calls.forced, [41]); assert.equal(r.folder, 'removed');
});

test('the app survives even force: still running is said, and the folder is kept', async () => {
  const { deps, calls } = world({ owned: { 41: {} } });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.left_running, r.folder], ['still_running', [41], 'kept']); assert.equal(calls.removed, 0); assert.match(r.folder_reason, /not confirmed/);
});

test('the look fails at once: nothing is ended, nothing is removed, the exit is unknown', async () => {
  const { deps, calls } = world({ owned: { 41: {} }, lookFails: () => true });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.asked, calls.forced, calls.removed], ['unknown', 'kept', [], [], 0]); assert.match(r.folder_reason, /not known/); assert.equal(r.errors.length, 1);
});

test('the look fails after the close request: no force follows, the folder is kept', async () => {
  const { deps, calls } = world({ owned: { 41: {} }, lookFails: (c) => c.asked.length > 0 });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.asked_to_close, calls.forced, calls.removed], ['unknown', [41], [], 0]);
});

test('the look fails in the middle of a wait: nothing is ended on the earlier answer', async () => {
  const { deps, calls } = world({ owned: { 41: {} }, lookFails: (c) => c.looks === 2 });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.asked, calls.forced, r.exit, calls.removed], [[], [], 'unknown', 0]);
});

test('the look fails after force: the exit is unknown and the folder is kept', async () => {
  const { deps, calls } = world({ owned: { 41: { onForce: true } }, lookFails: (c) => c.forced.length > 0 });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.removed], ['unknown', 'kept', 0]);
});

test('a folder this check did not make is never removed, even when the exit is confirmed', async () => {
  const { deps, calls } = world({ ownsFolder: false });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.removed], ['confirmed', 'kept', 0]); assert.match(r.folder_reason, /did not make/);
});

test('a process on the port that is not owned is never ended, and keeps the folder', async () => {
  const { deps, calls } = world({ others: [77] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.not_owned_on_the_port, calls.asked, calls.forced, calls.removed], ['still_running', [77], [], [], 0]);
});

test('an owned process and a not-owned one on the port together: only the owned one is asked and ended', async () => {
  const { deps, calls } = world({ owned: { 41: { onForce: true } }, others: [77] });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.asked, calls.forced, r.exit, calls.removed], [[41], [41], 'still_running', 0]);
});

test('a process that ended by itself is not sent a close request later', async () => {
  const { deps, calls } = world({ owned: { 41: { selfAfter: 2 }, 42: { onAsk: true } } });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.asked, calls.forced, r.exit], [[42], [], 'confirmed']);
});

test('a close request that throws is recorded and force still follows', async () => {
  const { deps } = world({ owned: { 41: { onForce: true } }, askThrows: true });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.asked_to_close, r.ended_by_force], ['confirmed', [], [41]]); assert.match(r.errors[0], /close request 41/);
});

test('an end call that throws is recorded, and the record is still returned', async () => {
  const { deps } = world({ owned: { 41: {} }, forceThrows: true });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.ended_by_force, r.folder], ['still_running', [], 'kept']); assert.match(r.errors.join(' '), /end 41/);
});

test('a folder that cannot be removed is said, not hidden', async () => {
  const { deps } = world({ removeThrows: true });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder], ['confirmed', 'kept']); assert.match(r.folder_reason, /could not be removed/);
});

test('the waits are wall time: slow looks do not stretch them', async () => {
  // Each look takes 2 s and each wait is 2 s: one look per stage, three looks in all.
  const { deps, calls } = world({ owned: { 41: {} }, lookMs: 2000 });
  const r = await releaseOwned(deps);
  assert.equal(r.exit, 'still_running'); assert.equal(calls.looks, 3); assert.deepEqual([calls.asked, calls.forced], [[41], [41]]);
});

test('an app that needs time to quit after the close request is waited for, not forced', async () => {
  const { deps, calls } = world({ owned: { 41: { onAsk: 3 } } });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.asked, calls.forced, r.exit, calls.removed], [[41], [], 'confirmed', 1]);
});

test('the same with a not-owned process on the port: the wait still runs, nothing is forced, the folder is kept', async () => {
  const { deps, calls } = world({ owned: { 41: { onAsk: 3 } }, others: [77] });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.asked, calls.forced, r.exit, calls.removed], [[41], [], 'still_running', 0]);
});

test('a process that needs time to end after force is waited for before the exit is said', async () => {
  const { deps, calls } = world({ owned: { 41: { onForce: 3 } } });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.forced, r.exit, calls.removed], [[41], 'confirmed', 1]);
});

test('nothing owned: one look is enough, no waiting', async () => {
  const { deps, calls } = world();
  await releaseOwned(deps);
  assert.deepEqual([calls.looks, calls.slept], [1, 0]);
});
