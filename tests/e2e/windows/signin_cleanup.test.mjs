// node --test tests/e2e/windows/signin_cleanup.test.mjs   (no Windows, no display: the rule only)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { argv, lookCommand, ownedKind, readLook, releaseOwned, signalCommand } from './signin_cleanup.mjs';

const EXE = 'C:\\T\\lc-electron-44.5.1-win32-x64\\electron.exe';
const STAGE = 'C:\\T\\lc-qa-windows-sub';
const DIR = 'C:\\T\\lc-subscription-signin-abc-check-43000';
const expected = { exe: EXE, app: [STAGE, '--remote-debugging-port=43000', '--remote-debugging-address=127.0.0.1'], checker: [`${DIR}\\qa-check.js`, '--qa-check-port=43000'],
  markers: ['--remote-debugging-port=43000', '--qa-check-port=43000'], notBefore: '1000' };
const app = (pid, over = {}) => ({ pid, created: '2000', exe: EXE, command_line: `"${EXE}" "${STAGE}" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1`, ...over });
const checker = (pid, over = {}) => ({ pid, created: '2100', exe: EXE, command_line: `"${EXE}" ${DIR}\\qa-check.js --qa-check-port=43000`, ...over });
const other = (pid, over = {}) => ({ pid, created: '500', exe: 'C:\\Other\\electron.exe', command_line: '"C:\\Other\\electron.exe" C:\\Other\\app', ...over });

// A small world of processes. `how` says how each ends: selfAfter (sleeps), onClose / onForce (true = at once, a number =
// that many sleeps later), noWindow (a close request finds no window). `at` changes the world at a given sleep count.
// The world's own `signal` validates the identity as the real one does, and records what it really signalled.
function world({ procs = [], listen = [], at = {}, lookFails = () => false, signalThrows = () => false, beforeSignal = null, ownsFolder = true, removeThrows = false, lookMs = 0 } = {}) {
  const calls = { looks: 0, slept: 0, signals: [], closed: [], killed: [], removed: 0 };
  const alive = procs.map(({ p, how = {} }) => ({ p: { ...p }, how: { ...how } }));
  const drop = (entry) => { const i = alive.indexOf(entry); if (i >= 0) alive.splice(i, 1); };
  const w = { alive, drop, calls, listen: [...listen] };
  const deps = {
    look: async () => { calls.looks += 1; if (lookFails(calls)) throw new Error('cannot look'); return { processes: alive.map((e) => ({ ...e.p })), listen: [...w.listen] }; },
    signal: async (identity, how) => {
      if (beforeSignal) beforeSignal(w, identity, how);
      calls.signals.push({ pid: identity.pid, created: identity.created, how });
      if (signalThrows(how)) throw new Error('refused');
      const entry = alive.find((e) => e.p.pid === identity.pid);
      if (!entry) return 'gone';
      if (entry.p.created !== identity.created) return 'stale';
      if (entry.p.exe !== identity.exe || entry.p.command_line !== identity.command_line) return 'unverified';
      const key = `${entry.p.pid}:${entry.p.created}`;
      if (how === 'close') {
        if (entry.how.noWindow) return 'no_window';
        calls.closed.push(key);
        if (entry.how.onClose === true) drop(entry); else if (typeof entry.how.onClose === 'number') entry.how.selfAfter = calls.slept + entry.how.onClose;
      } else {
        calls.killed.push(key);
        if (entry.how.onForce === true) drop(entry); else if (typeof entry.how.onForce === 'number') entry.how.selfAfter = calls.slept + entry.how.onForce;
      }
      return 'signalled';
    },
    sleep: async () => { calls.slept += 1; if (at[calls.slept]) at[calls.slept](w); for (const e of [...alive]) if (e.how.selfAfter !== undefined && calls.slept >= e.how.selfAfter) drop(e); },
    now: () => calls.slept * 500 + calls.looks * lookMs,
    expected, ownsFolder,
    removeFolder: async () => { if (removeThrows) throw new Error('locked'); calls.removed += 1; return true; },
    waitSelfMs: 2000, waitCloseMs: 2000, waitForceMs: 2000, stepMs: 500,
  };
  return { deps, calls, w };
}

// ---- which process is this check's ------------------------------------------------------------------------------------
test('argv follows the Windows rules: program name, quotes, backslashes before a quote, a doubled quote inside quotes', () => {
  assert.deepEqual(argv(`"C:\\a b\\e.exe" "C:\\s t" --x=1  --y`), ['C:\\a b\\e.exe', 'C:\\s t', '--x=1', '--y']);
  assert.deepEqual(argv('e.exe C:\\d\\f.js --p=1'), ['e.exe', 'C:\\d\\f.js', '--p=1']);
  assert.deepEqual(argv('e.exe "C:\\d\\\\" a'), ['e.exe', 'C:\\d\\', 'a']);
  assert.deepEqual(argv('"C:\\d\\\\" a'), ['C:\\d\\\\', 'a']);                       // the program name keeps its backslashes
  assert.deepEqual(argv('e.exe "S""" --p=1 --q'), ['e.exe', 'S" --p=1 --q']);         // one argument to Windows, not three
  assert.deepEqual(argv('e.exe "--qa-check-port=43000"""'), ['e.exe', '--qa-check-port=43000"']);
  assert.deepEqual(argv('e.exe a\\"b "" c'), ['e.exe', 'a"b', '', 'c']);
  assert.deepEqual(argv(''), []);
});

test('the exact launches are owned; the path comparison ignores letter case', () => {
  assert.equal(ownedKind(app(41), expected), 'app');
  assert.equal(ownedKind(checker(42), expected), 'checker');
  assert.equal(ownedKind(app(41, { exe: EXE.toUpperCase(), command_line: `"${EXE}" "${STAGE.toLowerCase()}" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1` }), expected), 'app');
});

test('a longer port that only begins with this check\'s port is not owned and not even doubtful', () => {
  assert.equal(ownedKind(other(77, { created: '2000', command_line: '"C:\\Other\\electron.exe" C:\\OtherApp\\check.js --qa-check-port=430009' }), expected), 'foreign');
  assert.equal(ownedKind(app(78, { command_line: `"${EXE}" "${STAGE}" --remote-debugging-port=430009 --remote-debugging-address=127.0.0.1` }), expected), 'foreign');
  assert.equal(ownedKind(checker(79, { command_line: `"${EXE}" ${DIR}\\qa-check.js --qa-check-port=430009` }), expected), 'foreign');
});

test('this check\'s exact port argument in any other launch is not owned: it is unresolved, never signalled', () => {
  assert.equal(ownedKind(other(77, { created: '2000', command_line: '"C:\\Other\\electron.exe" C:\\OtherApp\\check.js --qa-check-port=43000' }), expected), 'unresolved');   // another runtime
  assert.equal(ownedKind(checker(78, { command_line: `"${EXE}" C:\\OtherApp\\check.js --qa-check-port=43000` }), expected), 'unresolved');                               // another script
  assert.equal(ownedKind(app(79, { command_line: `"${EXE}" "C:\\Other\\stage" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1` }), expected), 'unresolved'); // another app folder
  assert.equal(ownedKind(app(80, { command_line: `"${EXE}" "${STAGE}" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1 --extra` }), expected), 'unresolved');  // one argument more
  assert.equal(ownedKind(app(81, { created: '999' }), expected), 'unresolved');                                                                                           // created before the check began
  assert.equal(ownedKind(app(82, { exe: 'C:\\Other\\electron.exe' }), expected), 'unresolved');                                                                         // exactly these arguments, another runtime
  assert.equal(ownedKind(app(83, { command_line: `"${EXE}" "${STAGE}""" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1` }), expected), 'foreign');   // one argument to Windows: no port argument at all
});

test('the checker as Windows reports it when started from WSL (the bare program name first) is owned', () => {
  assert.equal(ownedKind(checker(42, { command_line: `electron.exe ${DIR}\\qa-check.js --qa-check-port=43000` }), expected), 'checker');
});

test('a child process of an Electron app, and a readable other app, are foreign', () => {
  assert.equal(ownedKind(app(41, { command_line: `"${EXE}" --type=renderer --remote-debugging-port=43000` }), expected), 'foreign');
  assert.equal(ownedKind(other(77), expected), 'foreign');
  assert.equal(ownedKind(other(77, { created: '3000' }), expected), 'foreign');
});

test('an unreadable command line: unresolved if the process was made since the check began (whatever its path looks like), else foreign', () => {
  assert.equal(ownedKind(app(41, { command_line: null }), expected), 'unresolved');
  assert.equal(ownedKind(app(41, { command_line: null, exe: null }), expected), 'unresolved');
  assert.equal(ownedKind(app(41, { command_line: null, exe: 'C:\\T\\LC-ELE~1\\electron.exe' }), expected), 'unresolved');   // the runtime path in another form
  assert.equal(ownedKind(other(77, { created: '3000', command_line: null }), expected), 'unresolved');
  assert.equal(ownedKind(app(41, { command_line: null, created: '999' }), expected), 'foreign');                            // older than the check: not this check's
  assert.equal(ownedKind(app(41, { created: null }), expected), 'unresolved');                                              // no creation time: it cannot be told
  assert.equal(ownedKind(other(77, { created: null }), expected), 'unresolved');
});

test('the commands are built only for a real port and a whole identity, and carry the texts encoded', () => {
  assert.throws(() => lookCommand(80)); assert.throws(() => lookCommand(43000, "x' -or '1"));
  assert.match(lookCommand(43000), /-LocalPort 43000 /);
  assert.throws(() => signalCommand({ pid: 41 }, 'force')); assert.throws(() => signalCommand(app(41), 'kill')); assert.throws(() => signalCommand(app(41, { created: '20x0' }), 'force')); assert.throws(() => signalCommand(app(41, { command_line: null }), 'close')); assert.throws(() => signalCommand(app(41, { command_line: '' }), 'close')); assert.throws(() => signalCommand(app(41, { exe: '' }), 'force'));
  const force = signalCommand(app(41), 'force'), close = signalCommand(app(41), 'close');
  assert.ok(!force.includes(STAGE) && !force.includes('remote-debugging-port'));   // the launch texts are passed as base64, never as shell text
  assert.match(force, /GetProcessById\(41\)/); assert.match(close, /CloseMainWindow/); assert.ok(!close.includes('.Kill()')); assert.ok(!force.includes('CloseMainWindow'));
  for (const text of [force, close]) {   // held first, then read again by that PID, compared character for character, signalled last and once
    const at = ['$null = $p.Handle', 'Get-CimInstance Win32_Process -Filter "ProcessId=41"', "'2000', [StringComparison]::Ordinal", '[string]::Equals($w.ExecutablePath, $exe, [StringComparison]::Ordinal) -or -not [string]::Equals($w.CommandLine, $cl, [StringComparison]::Ordinal)'].map((t) => text.indexOf(t));
    const signalAt = text.search(/\$p\.(Kill|CloseMainWindow)\(\)/);
    assert.ok(at[0] >= 0 && at.every((n, i) => i === 0 || n > at[i - 1]) && signalAt > at.at(-1), JSON.stringify([at, signalAt]));
    assert.equal((text.match(/\$p\.(Kill|CloseMainWindow)\(\)/g) || []).length, 1);
    assert.ok(text.includes("if (-not $w) { 'gone'; exit 0 }; if (-not $w.CreationDate) { 'unverified'; exit 0 };") && text.includes("if (-not $p) { 'unverified'; exit 0 };"));
  }
});

test('the look is read from its one line; anything else is refused', () => {
  const line = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
  assert.deepEqual(readLook(line({ now: '9', processes: [{ pid: 5, created: '7', exe: 'e', command_line: null }], listen: 5 })), { now: '9', processes: [{ pid: 5, created: '7', exe: 'e', command_line: null }], listen: [5] });
  assert.deepEqual(readLook('noise\r\n' + line({ now: '9', processes: [], listen: [] })), { now: '9', processes: [], listen: [] });
  assert.throws(() => readLook(line({ now: 'x', processes: [], listen: [] }))); assert.throws(() => readLook(line({ now: '9', processes: [{ pid: 'a' }], listen: [] }))); assert.throws(() => readLook('not base64 json'));
});

// ---- the rule ---------------------------------------------------------------------------------------------------------
test('nothing of the check is running: exit confirmed, the folder it made is removed, nothing is signalled', async () => {
  const { deps, calls } = world();
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.signals, calls.removed, calls.looks, calls.slept], ['confirmed', 'removed', [], 1, 1, 0]);
});

test('the app ends by itself during the first wait: no signal', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { selfAfter: 2 } }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.signals], ['confirmed', 'removed', []]); assert.deepEqual(r.owned_seen, [{ pid: 41, created: '2000', kind: 'app' }]);
});

test('the app stays: a close request, it ends, and only then is the folder removed', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onClose: true } }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.asked_to_close, r.ended_by_force, calls.killed, calls.removed], ['confirmed', [{ pid: 41, created: '2000' }], [], [], 1]);
});

test('an app that needs time to quit after the close request is waited for, not forced', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onClose: 3 } }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.closed, calls.killed, r.exit, calls.removed], [['41:2000'], [], 'confirmed', 1]);
});

test('the app ignores the close request and the checker has no window: both are ended by force, and only they', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onForce: true } }, { p: checker(42), how: { noWindow: true, onForce: 2 } }, { p: other(77) }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, calls.closed, calls.killed.sort(), r.foreign, calls.removed], ['confirmed', ['41:2000'], ['41:2000', '42:2100'], [77], 1]);
  assert.ok(calls.signals.every((s) => s.pid !== 77));
});

test('the app survives even force: still running is said, and the folder is kept', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41) }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.left_running, r.folder, calls.removed], ['still_running', [{ pid: 41, created: '2000' }], 'kept', 0]); assert.match(r.folder_reason, /not confirmed/);
});

test('the look fails at once: nothing is signalled, nothing is removed, the exit is unknown', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41) }], lookFails: () => true });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.signals, calls.removed], ['unknown', 'kept', [], 0]); assert.match(r.folder_reason, /not known/);
});

test('the look fails in the middle of a wait: nothing is signalled on the earlier answer', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41) }], lookFails: (c) => c.looks === 2 });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.signals, r.exit, calls.removed], [[], 'unknown', 0]);
});

test('the look fails after the close request: no force follows, the folder is kept', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41) }], lookFails: (c) => c.closed.length > 0 });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, calls.closed, calls.killed, calls.removed], ['unknown', ['41:2000'], [], 0]);
});

test('the look fails after force: the exit is unknown and the folder is kept', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onForce: true } }], lookFails: (c) => c.killed.length > 0 });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.removed], ['unknown', 'kept', 0]);
});

test('a folder this check did not make is never removed, even when the exit is confirmed', async () => {
  const { deps, calls } = world({ ownsFolder: false });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.removed], ['confirmed', 'kept', 0]); assert.match(r.folder_reason, /did not make/);
});

test('a process on the port that is not owned is never signalled, and keeps the folder', async () => {
  const { deps, calls } = world({ procs: [{ p: other(77) }], listen: [77] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.not_owned_on_the_port, calls.signals, calls.removed], ['still_running', [77], [], 0]);
});

test('an owned process and a not-owned one on the port together: only the owned one is signalled', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onForce: true } }, { p: other(77) }], listen: [41, 77] });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.closed, calls.killed, r.exit, calls.removed], [['41:2000'], ['41:2000'], 'still_running', 0]); assert.ok(calls.signals.every((s) => s.pid === 41));
});

test('a process that ended by itself is not sent a close request later', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { selfAfter: 2 } }, { p: checker(42), how: { onClose: true } }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.signals, r.exit], [[{ pid: 42, created: '2100', how: 'close' }], 'confirmed']);
});

test('a signal that throws is recorded, the next stage still follows, and the record is returned', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onForce: true } }], signalThrows: (how) => how === 'close' });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.asked_to_close, calls.killed], ['confirmed', [], ['41:2000']]); assert.match(r.errors[0], /close 41/);
  const second = world({ procs: [{ p: app(41) }], signalThrows: (how) => how === 'force' });
  const r2 = await releaseOwned(second.deps);
  assert.deepEqual([r2.exit, r2.ended_by_force, r2.folder], ['still_running', [], 'kept']); assert.match(r2.errors.join(' '), /force 41/);
});

test('a folder that cannot be removed is said, not hidden', async () => {
  const { deps } = world({ removeThrows: true });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder], ['confirmed', 'kept']); assert.match(r.folder_reason, /could not be removed/);
});

test('the waits are wall time: slow looks do not stretch them', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41) }], lookMs: 2000 });   // each look takes 2 s and each wait is 2 s: one look per stage
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, calls.looks, calls.closed, calls.killed], ['still_running', 3, ['41:2000'], ['41:2000']]);
});

// ---- the three observations of the lead's review ----------------------------------------------------------------------
test('(1) the PID is used again by another process before the close request: that process is never signalled', async () => {
  // The app (41, created 2000) ends during the first wait and Windows gives 41 to another program.
  const reuse = (w) => { w.drop(w.alive.find((e) => e.p.pid === 41)); w.alive.push({ p: other(41, { created: '5000' }), how: {} }); };
  const { deps, calls } = world({ procs: [{ p: app(41) }], at: { 2: reuse } });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.signals, calls.closed, calls.killed], [[], [], []]);
  assert.deepEqual([r.exit, r.foreign, r.folder], ['confirmed', [41], 'removed']);   // the remembered process is gone; the newcomer is not this check's
});

test('(1) the PID is used again between the look and the signal: the signal is told the old identity and signals nothing', async () => {
  // The look still shows the app; before the signal lands the app is gone and 41 is another program.
  const swap = (w, identity, how) => { if (how === 'close' && w.alive.some((e) => e.p.pid === 41 && e.p.created === '2000')) { w.drop(w.alive.find((e) => e.p.pid === 41)); w.alive.push({ p: other(41, { created: '5000' }), how: {} }); } };
  const { deps, calls } = world({ procs: [{ p: app(41) }], beforeSignal: swap });
  const r = await releaseOwned(deps);
  assert.deepEqual(calls.signals, [{ pid: 41, created: '2000', how: 'close' }]);     // the identity given is the remembered one, with its creation time
  assert.deepEqual([calls.closed, calls.killed, r.asked_to_close, r.ended_by_force], [[], [], [], []]);
  assert.deepEqual(r.signals, [{ pid: 41, created: '2000', how: 'close', answer: 'stale' }]);
  assert.deepEqual([r.exit, r.foreign], ['confirmed', [41]]);
});

test('(2) a remembered process is still there but its command line can no longer be read, and nothing listens: unknown, nothing signalled, folder kept', async () => {
  const blind = (w) => { w.alive.find((e) => e.p.pid === 41).p.command_line = null; };
  const { deps, calls } = world({ procs: [{ p: app(41) }], at: { 1: blind } });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.signals, calls.removed], ['unknown', 'kept', [], 0]);
  assert.deepEqual([r.not_revalidated, r.left_running], [[{ pid: 41, created: '2000' }], []]); assert.match(r.folder_reason, /not known/);
});

test('(2) the same when the process was never seen readable: a young process of this runtime without a readable command line is unresolved', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41, { command_line: null }) }] });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.unresolved, r.folder, calls.signals, calls.removed], ['unknown', [{ pid: 41, created: '2000' }], 'kept', [], 0]);
});

test('(2) the launch identity changes between the look and the signal: the signal answers unverified and everything stops', async () => {
  const blind = (w, identity, how) => { if (how === 'close') w.alive.find((e) => e.p.pid === 41).p.command_line = null; };
  const { deps, calls } = world({ procs: [{ p: app(41) }, { p: checker(42), how: { noWindow: true } }], beforeSignal: blind });
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.closed, calls.killed, r.exit, r.folder, calls.removed], [[], [], 'unknown', 'kept', 0]);
  assert.deepEqual(calls.signals, [{ pid: 41, created: '2000', how: 'close' }]);     // the checker is not signalled after that either
});

test('(3) another program with a longer port, or another script with the same port, is never signalled', async () => {
  const longer = other(77, { created: '2000', command_line: '"C:\\Other\\electron.exe" C:\\OtherApp\\check.js --qa-check-port=430009' });
  const first = world({ procs: [{ p: app(41), how: { onClose: true } }, { p: longer }] });
  const r1 = await releaseOwned(first.deps);
  assert.deepEqual([r1.exit, r1.foreign, first.calls.closed, first.calls.killed], ['confirmed', [77], ['41:2000'], []]); assert.ok(first.calls.signals.every((s) => s.pid === 41));
  const same = other(78, { created: '2000', command_line: '"C:\\Other\\electron.exe" C:\\OtherApp\\check.js --qa-check-port=43000' });
  const second = world({ procs: [{ p: app(41), how: { onClose: true } }, { p: same }] });
  const r2 = await releaseOwned(second.deps);
  assert.deepEqual([r2.exit, r2.unresolved, second.calls.signals, r2.folder, second.calls.removed], ['unknown', [{ pid: 78, created: '2000' }], [], 'kept', 0]);
});

test('force goes only to what is owned at that look, not to what was owned before', async () => {
  const { deps, calls } = world({ procs: [{ p: app(41), how: { onClose: true } }, { p: checker(42), how: { noWindow: true, onForce: true } }] });
  const r = await releaseOwned(deps);
  assert.deepEqual(calls.signals.filter((s) => s.how === 'force'), [{ pid: 42, created: '2100', how: 'force' }]); assert.equal(r.exit, 'confirmed');
});

test('an unverified answer stops everything, even when the next look is readable again', async () => {
  let first = true;
  const { deps, calls } = world({ procs: [{ p: app(41) }] });
  const real = deps.signal;
  deps.signal = async (identity, how) => { if (first) { first = false; calls.signals.push({ pid: identity.pid, created: identity.created, how }); return 'unverified'; } return real(identity, how); };
  const r = await releaseOwned(deps);
  assert.deepEqual([calls.signals, calls.closed, calls.killed, r.exit, r.folder, calls.removed], [[{ pid: 41, created: '2000', how: 'close' }], [], [], 'unknown', 'kept', 0]);
});

test('a process caught unreadable while it exits is looked at again, not reported at once: gone at the next look is confirmed', async () => {
  const blind = (w) => { w.alive.find((e) => e.p.pid === 41).p.command_line = null; };
  const gone = (w) => { w.drop(w.alive.find((e) => e.p.pid === 41)); };
  const { deps, calls } = world({ procs: [{ p: app(41) }], at: { 1: blind, 2: gone } });
  const r = await releaseOwned(deps);
  assert.deepEqual([r.exit, r.folder, calls.signals, calls.removed], ['confirmed', 'removed', [], 1]);
});
