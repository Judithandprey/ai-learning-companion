// A test's source check, the app's side of lc-source-admission/1 (src/main/source-admission.ts): the trusted
// configuration, the checker child and every decision. SYNTHETIC: the checker is a stand-in over in-process streams;
// no Windows, display or native check is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAdmissionConfig, SourceChecker, type AdmissionAsk, type AdmissionConfig } from '../src/main/source-admission.ts';
import { echo, fakeCheckers, type FakeChecker } from './admission-fakes.ts';

const CONFIG: AdmissionConfig = { command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoProfile', '-File', 'C:\\qa\\checker.ps1'], ready_ms: 5000, decision_ms: 5000 };
const ASK: AdmissionAsk = { phase: 'pre_acquire', capture_id: '0123456789abcdef', display: null, overlay: null, sample_seq: 7, frame_seq: null, raw_sha256: null, raw_size: null, request_id: null, image_sha256: null };
const settle = (): Promise<void> => new Promise((done) => setImmediate(done));
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
/** A checker that is started and ready, with its stand-in. */
async function ready(config: Partial<AdmissionConfig> = {}, configure?: (c: FakeChecker) => void) {
  const f = fakeCheckers(configure);
  const checker = new SourceChecker({ config: { ...CONFIG, ...config }, spawn: f.spawn, endMs: 50 });
  const told: string[] = [];
  checker.onFailure = (why) => void told.push(why);
  assert.equal(await checker.open(), null);
  return { checker, c: f.last(), told };
}

test('the configuration: only LC_SOURCE_ADMISSION names it; read in its exact shape (an absolute executable, at most 32 fixed arguments, bounded times); else not usable', () => {
  const file = (v: unknown) => () => JSON.stringify(v);
  const good = { format: 'lc-windows-source-admission-config/v1', checker: { command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-File', 'C:\\qa\\checker.ps1'] }, ready_ms: 10000, decision_ms: 5000 };
  assert.equal(readAdmissionConfig({}, file(good)), null, 'unset: the product as it is');
  assert.deepEqual(readAdmissionConfig({ LC_SOURCE_ADMISSION: 'x' }, file(good)), { command: good.checker.command, args: good.checker.args, ready_ms: 10000, decision_ms: 5000 });
  const notValid = { error: 'the source check configured for this test is not valid' };
  assert.deepEqual(readAdmissionConfig({ LC_SOURCE_ADMISSION: 'x' }, () => { throw new Error('ENOENT'); }), { error: 'the source check configured for this test could not be read' });
  assert.deepEqual(readAdmissionConfig({ LC_SOURCE_ADMISSION: 'x' }, () => '{'), { error: 'the source check configured for this test could not be read' });
  assert.deepEqual(readAdmissionConfig({ LC_SOURCE_ADMISSION: '' }, file(good)), { error: 'the source check configured for this test could not be read' }, 'set but empty is not "off"');
  for (const bad of [
    { ...good, format: 'other' },
    { ...good, extra: 1 },
    { ...good, checker: { ...good.checker, env: {} } },
    { ...good, checker: { command: 'powershell.exe', args: [] } }, // looked up on PATH: never
    { ...good, checker: { command: '.\\checker.exe', args: [] } },
    { ...good, checker: { command: 'C:\\x.exe', args: 'a b' } },
    { ...good, checker: { command: 'C:\\x.exe', args: ['a\nb'] } },
    { ...good, checker: { command: 'C:\\x.exe', args: [''] } },
    { ...good, checker: { command: 'C:\\x.exe', args: Array.from({ length: 33 }, () => 'a') } },
    { ...good, checker: { command: 'C:\\x.exe', args: ['a'.repeat(4097)] } },
    { ...good, ready_ms: 999 },
    { ...good, ready_ms: 120001 },
    { ...good, decision_ms: 99 },
    { ...good, decision_ms: 30001 },
    { ...good, decision_ms: 5000.5 },
    { ...good, decision_ms: '5000' },
    [good],
    null,
  ]) assert.deepEqual(readAdmissionConfig({ LC_SOURCE_ADMISSION: 'x' }, file(bad)), notValid, JSON.stringify(bad).slice(0, 120));
  // The bounds are ceilings of the parser: their ends are readable.
  assert.equal((readAdmissionConfig({ LC_SOURCE_ADMISSION: 'x' }, file({ ...good, ready_ms: 120000, decision_ms: 100 })) as AdmissionConfig).decision_ms, 100);
});

test('the checker is run as configured, directly (no shell), hidden, with pipes and without the app\'s LC_ settings; it must begin with its ready line, in time', async () => {
  const f = fakeCheckers();
  process.env['LC_SOURCE_ADMISSION'] = 'C:\\secret\\config.json';
  try {
    const checker = new SourceChecker({ config: CONFIG, spawn: f.spawn, endMs: 50 });
    assert.equal(await checker.open(), null);
    assert.equal(await checker.open(), null, 'started once');
    assert.equal(f.made.length, 1);
    const sp = f.last().spawned!;
    assert.deepEqual([sp.command, sp.args, sp.options['shell'], sp.options['windowsHide'], sp.options['stdio']], [CONFIG.command, CONFIG.args, false, true, ['pipe', 'pipe', 'ignore']]);
    assert.equal(Object.keys(sp.options['env'] as object).some((k) => /^LC_/i.test(k)), false, 'no LC_ setting reaches it');
    await checker.close();
  } finally {
    delete process.env['LC_SOURCE_ADMISSION'];
  }
  // Something else first, no ready line in time, or its end before it: not ready, and nothing is ever allowed.
  for (const [what, configure, expect] of [
    ['another line first', (c: FakeChecker) => { c.autoReady = false; setImmediate(() => c.write('{"format":"lc-source-admission/1","ready":false}')); }, 'the source check did not begin with its ready line'],
    ['not JSON', (c: FakeChecker) => { c.autoReady = false; setImmediate(() => c.write('ready')); }, 'the source check wrote a line that is not JSON'],
    ['no ready line', (c: FakeChecker) => void (c.autoReady = false), 'the source check was not ready within 1000 ms'],
    ['its end', (c: FakeChecker) => { c.autoReady = false; setImmediate(() => c.exit(1)); }, null],
  ] as const) {
    const g = fakeCheckers(configure);
    const checker = new SourceChecker({ config: { ...CONFIG, ready_ms: 1000 }, spawn: g.spawn, endMs: 50 });
    const problem = await checker.open();
    if (expect) assert.equal(problem, expect, what);
    else assert.match(problem ?? '', /^the source check (ended|closed its output)$/, what);
    const d = await checker.decide(ASK);
    assert.deepEqual([d.ok, g.last().requests.length], [false, 0], `${what}: nothing is asked of it`);
    await checker.close();
  }
  // A spawn that throws: not started.
  const thrower = new SourceChecker({ config: CONFIG, spawn: (() => { throw new Error('ENOENT'); }) as never });
  assert.equal(await thrower.open(), 'the source check could not be started');
});

test('a decision: one request at a time, each written when its turn comes with its own id and sequence, answered by its exact echo; only "allow" goes on', async () => {
  const { checker, c, told } = await ready({}, (x) => void (x.mode = 'hold'));
  const first = checker.decide(ASK);
  const second = checker.decide({ ...ASK, phase: 'post_acquire', frame_seq: 7, raw_sha256: 'a'.repeat(64), raw_size: { width: 1280, height: 800 } });
  await settle();
  assert.equal(c.requests.length, 1, 'the second waits for the first\'s answer');
  const r1 = c.waiting();
  assert.match(r1.id, /^[0-9a-f]{32}$/);
  assert.deepEqual({ ...r1, id: 'x', sent_at: 'y' }, { format: 'lc-source-admission/1', id: 'x', seq: 1, phase: 'pre_acquire', capture_id: '0123456789abcdef', display: null, overlay: null, sample_seq: 7, frame_seq: null, raw_sha256: null, raw_size: null, request_id: null, image_sha256: null, sent_at: 'y' });
  c.reply(r1);
  assert.equal((await first).ok, true);
  await settle();
  const r2 = c.waiting();
  assert.deepEqual([r2.seq, r2.phase, r2.frame_seq, r2.raw_size, r2.id === r1.id, Date.parse(r2['sent_at'] as string) >= Date.parse(r1['sent_at'] as string)], [2, 'post_acquire', 7, { width: 1280, height: 800 }, false, true]);
  c.reply(r2);
  assert.equal((await second).ok, true);
  // A request whose purpose no longer holds when its turn comes is withdrawn: not written, not a failure.
  const held = checker.decide(ASK);
  const withdrawn = checker.decide(ASK, () => false);
  await settle();
  c.reply(c.waiting());
  assert.equal((await held).ok, true);
  assert.deepEqual(await withdrawn, { ok: false, reason: 'what it was for no longer held when its turn came', denied: false, written: false, withdrawn: true, ms: 0 });
  assert.deepEqual([c.requests.length, checker.failure, told], [3, null, []]);
  // A denial: said with its reason, latched; nothing more is asked of it, and its input is ended.
  const denied = checker.decide({ ...ASK, phase: 'send', request_id: 'ask-1.1', image_sha256: 'b'.repeat(64) });
  await settle();
  c.reply(c.waiting(), { verdict: 'deny', reason: 'the owned window does not cover the display' });
  const d = await denied;
  await settle(); // (told after what waited took its own answer)
  assert.deepEqual([d.ok, !d.ok && d.denied, !d.ok && d.reason], [false, true, 'the source check refused sending a request (the owned window does not cover the display)']);
  assert.deepEqual(told, ['the source check refused sending a request (the owned window does not cover the display)']);
  const after = await checker.decide(ASK);
  await settle();
  assert.deepEqual([after.ok, c.requests.length, c.inputEnded], [false, 4, true]);
  await checker.close();
});

test('an answer that is not exactly the waiting request\'s is a failure, latched: another echo, missing or extra members, a malformed verdict or reason, another id, an answer given again, none waiting, too long', async () => {
  const cases: Array<[string, (c: FakeChecker) => void, RegExp]> = [];
  for (const k of ['format', 'id', 'seq', 'phase', 'capture_id', 'display', 'overlay', 'sample_seq', 'frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256']) {
    cases.push([`its ${k}`, (c) => c.reply(c.waiting(), { [k]: k === 'display' ? { id: '2' } : k === 'overlay' ? { pid: 1, hwnd: '2' } : k === 'raw_size' ? { width: 1, height: 1 } : k === 'seq' || k === 'sample_seq' || k === 'frame_seq' ? 99 : 'other' }), new RegExp(`not to the request that is waiting \\(${k}\\)|answered a request again|when no request was waiting`)]);
  }
  cases.push(
    ['a missing member', (c) => { const r = { ...echo(c.waiting()), verdict: 'allow' }; c.write(JSON.stringify(r)); }, /does not have exactly its members/],
    ['an extra member', (c) => c.reply(c.waiting(), { cached: true }), /does not have exactly its members/],
    ['sent_at echoed too', (c) => c.reply(c.waiting(), { sent_at: c.waiting()['sent_at'] }), /does not have exactly its members/],
    ['a verdict that is not one', (c) => c.reply(c.waiting(), { verdict: 'ALLOW' }), /verdict is malformed/],
    ['a long reason', (c) => c.reply(c.waiting(), { reason: 'r'.repeat(301) }), /reason is malformed/],
    ['a reason with a control character', (c) => c.reply(c.waiting(), { reason: 'a\u0007b' }), /reason is malformed/],
    ['not an object', (c) => c.write('[1]'), /not an object/],
    ['not JSON', (c) => c.write('allow'), /not JSON/],
    ['too long', (c) => c.write(`{"pad":"${'x'.repeat(5000)}"}`), /too long/],
  );
  for (const [what, answer, reason] of cases) {
    const { checker, c, told } = await ready({}, (x) => void (x.mode = 'hold'));
    const d = checker.decide(ASK);
    await settle();
    answer(c);
    const got = await d;
    assert.equal(got.ok, false, what);
    assert.match(!got.ok ? got.reason : '', reason, what);
    await settle();
    assert.equal(told.length, 1, `${what}: told once`);
    assert.equal((await checker.decide(ASK)).ok, false, `${what}: latched`);
    assert.equal(c.requests.length, 1, `${what}: nothing more is asked`);
    await checker.close();
  }
  // An answer given again (a replay), after the first was taken: a failure, even with nothing waiting.
  const { checker, c, told } = await ready({}, (x) => void (x.mode = 'hold'));
  const d = checker.decide(ASK);
  await settle();
  const r = c.waiting();
  c.reply(r);
  assert.equal((await d).ok, true);
  c.reply(r);
  await settle();
  assert.deepEqual([checker.failure, told], ['the source check answered a request again', ['the source check answered a request again']]);
  // An answer with nothing waiting, never asked for.
  const other = await ready({}, (x) => void (x.mode = 'hold'));
  other.c.write(JSON.stringify({ ...echo({ ...r, id: 'f'.repeat(32) }), verdict: 'allow', reason: null }));
  await settle();
  assert.equal(other.checker.failure, 'the source check answered when no request was waiting');
  await checker.close();
  await other.checker.close();
});

test('no answer in time is a failure: the late answer is not read; the checker\'s own end, or its output closing, while it is needed is a failure too; too many waiting is a failure', async () => {
  const { checker, c, told } = await ready({ decision_ms: 100 }, (x) => void (x.mode = 'hold'));
  const d = checker.decide(ASK);
  const queued = checker.decide(ASK);
  await settle();
  const r = c.waiting();
  const t0 = Date.now();
  const got = await d;
  assert.ok(Date.now() - t0 >= 90, 'its bound starts when it is written');
  assert.deepEqual([got.ok, !got.ok && got.reason], [false, 'the source check did not answer within 100 ms']);
  assert.equal((await queued).ok, false, 'what waited behind it is refused without being written');
  c.reply(r, { verdict: 'allow' }); // late: not new authority
  await settle();
  await settle();
  assert.deepEqual([checker.failure, told, c.requests.length], ['the source check did not answer within 100 ms', ['the source check did not answer within 100 ms'], 1]);
  await checker.close();
  // Its end while a decision is out.
  const e = await ready({}, (x) => void (x.mode = 'hold'));
  const out = e.checker.decide(ASK);
  await settle();
  e.c.exit(3);
  const ended = await out;
  assert.equal(ended.ok, false);
  assert.match(!ended.ok ? ended.reason : '', /^the source check (ended|closed its output)$/);
  await settle();
  assert.equal(e.told.length, 1, 'told at once, not only at the next decision');
  // Its end between decisions: told at once.
  const between = await ready();
  between.c.exit(0);
  await settle();
  await settle();
  assert.equal(between.told.length, 1);
  // More than eight waiting behind one that is out.
  const many = await ready({}, (x) => void (x.mode = 'hold'));
  const all = Array.from({ length: 9 }, () => many.checker.decide(ASK));
  const tenth = await many.checker.decide(ASK);
  assert.deepEqual([tenth.ok, many.checker.failure], [false, 'too many source-check decisions were waiting']);
  assert.equal((await Promise.all(all)).every((x) => !x.ok), true);
  await many.checker.close();
});

test('the end of a checker at its capture\'s end: its input is ended; if it does not end, this child alone is killed; an end that is not seen is said as that; its own end then is no failure to report', async () => {
  const { checker, c, told } = await ready();
  assert.deepEqual(await checker.close(), { spawned: true, exit_seen: true, code: 0, signal: null, killed: false });
  assert.deepEqual([c.inputEnded, c.kills, told], [true, 0, []], 'an intentional end is not told as a failure');
  assert.equal(await checker.close().then((x) => x.exit_seen), true, 'once');
  assert.equal((await checker.decide(ASK)).ok, false, 'nothing is allowed after it');
  // It ignores the end of its input: killed (it alone), after the bound.
  const stubborn = await ready({}, (x) => void (x.ignoresEnd = true));
  assert.deepEqual(await stubborn.checker.close(), { spawned: true, exit_seen: true, code: null, signal: 'SIGTERM', killed: true });
  assert.equal(stubborn.c.kills, 1);
  // Not even a kill ends it: its end is not seen, and not said to be one.
  const gone = await ready({}, (x) => {
    x.ignoresEnd = true;
    x.kill = () => ((x.kills += 1), true);
  });
  const t0 = Date.now();
  assert.deepEqual(await gone.checker.close(), { spawned: true, exit_seen: false, code: null, signal: null, killed: true });
  assert.ok(Date.now() - t0 < 4000);
  // A late answer to a request that was out when it was ended is not read.
  const late = await ready({}, (x) => void (x.mode = 'hold'));
  const d = late.checker.decide(ASK);
  await settle();
  const r = late.c.waiting();
  const closing = late.checker.close();
  late.c.reply(r);
  const got = await d;
  assert.deepEqual([got.ok, !got.ok && got.reason, late.told], [false, 'the source check of this capture was ended', []]);
  await closing;
  await wait(1);
});

test('an answer is compared by value: members of an echoed object in another order are the same answer; a line that is not UTF-8 is a failure (nothing is replaced); a character split between two writes is read whole', async () => {
  const { checker, c, told } = await ready({}, (x) => void (x.mode = 'hold'));
  const d = checker.decide({ ...ASK, phase: 'arm', sample_seq: null, display: { id: '2779098405', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 2 }, overlay: { pid: 4242, hwnd: '263418' } });
  await settle();
  const r = c.waiting();
  // (as a checker that rebuilt the objects writes them: members sorted)
  c.reply(r, { display: { scale_factor: 2, id: '2779098405', bounds: { y: 0, x: 0, height: 800, width: 1280 } }, overlay: { hwnd: '263418', pid: 4242 } });
  assert.equal((await d).ok, true);
  const p = checker.decide({ ...ASK, phase: 'post_acquire', frame_seq: 7, raw_sha256: 'a'.repeat(64), raw_size: { width: 1280, height: 800 } });
  await settle();
  c.reply(c.waiting(), { raw_size: { height: 800, width: 1280 } });
  assert.equal((await p).ok, true);
  // A reason with a two-byte character, written in two pieces that split it: one line, read whole.
  const q = checker.decide(ASK);
  await settle();
  const line = Buffer.from(`${JSON.stringify({ ...echo(c.waiting()), verdict: 'deny', reason: 'Fenster verdeckt: é' })}\n`, 'utf8');
  const cut = line.indexOf(Buffer.from('é', 'utf8')) + 1;
  c.stdout.write(line.subarray(0, cut));
  await settle();
  c.stdout.write(line.subarray(cut));
  const got = await q;
  assert.deepEqual([got.ok, !got.ok && got.reason], [false, 'the source check refused taking a frame (Fenster verdeckt: é)']);
  assert.deepEqual(told, [], 'told only after its turn (below)');
  await settle();
  assert.equal(told.length, 1);
  await checker.close();
  // Not UTF-8 (a code-page byte): a failure, never an "allow" with a replaced character.
  const bad = await ready({}, (x) => void (x.mode = 'hold'));
  const b = bad.checker.decide(ASK);
  await settle();
  const text = JSON.stringify({ ...echo(bad.c.waiting()), verdict: 'allow', reason: 'XX' });
  const bytes = Buffer.from(`${text}\n`, 'utf8');
  bytes[bytes.indexOf(0x58) + 1] = 0xb0; // 'X°X' in Windows-1252
  bad.c.stdout.write(bytes);
  const g = await b;
  assert.deepEqual([g.ok, !g.ok && g.reason], [false, 'the source check wrote a line that is not UTF-8']);
  await bad.checker.close();
});

test('a decision waiting its turn is written only then: its sent_at and its bound start at its write; one refused here after a failure is marked as never written', async () => {
  const { checker, c } = await ready({ decision_ms: 300 }, (x) => void (x.mode = 'hold'));
  const d1 = checker.decide(ASK);
  const d2 = checker.decide({ ...ASK, sample_seq: 8 });
  await settle();
  await wait(200);
  const answeredAt = Date.now();
  c.reply(c.waiting());
  assert.equal((await d1).ok, true);
  await settle();
  const r2 = c.waiting();
  assert.equal(r2.sample_seq, 8);
  assert.ok(Date.parse(r2['sent_at'] as string) >= answeredAt - 5, 'its time is its write, not when it was asked for');
  await wait(150); // 350 ms after it was asked for, 150 ms after its write: still within its own bound
  c.reply(r2);
  assert.equal((await d2).ok, true);
  // After a denial, what waited behind it is refused here, unwritten.
  const d3 = checker.decide(ASK);
  const d4 = checker.decide(ASK);
  await settle();
  c.reply(c.waiting(), { verdict: 'deny' });
  const [x3, x4] = [await d3, await d4];
  assert.deepEqual([!x3.ok && x3.written, !x4.ok && x4.written, c.requests.length], [true, false, 3]);
  await checker.close();
});

test('the checker\'s exit alone, or its output\'s end alone, is a failure told at once; a checker that cannot be started is said as never started, and is not waited for; nothing is started after its end', async () => {
  const exitOnly = await ready();
  exitOnly.c.emit('exit', 0, null); // (its output still open)
  await settle();
  await settle();
  assert.deepEqual([exitOnly.checker.failure, exitOnly.told], ['the source check ended', ['the source check ended']]);
  const eofOnly = await ready();
  eofOnly.c.stdout.end(); // (it still runs)
  await settle();
  await settle();
  assert.deepEqual([eofOnly.checker.failure, eofOnly.told], ['the source check closed its output', ['the source check closed its output']]);
  await exitOnly.checker.close();
  await eofOnly.checker.close();
  // A command that does not exist (a real spawn: nothing runs): not started, its end not waited for, nothing killed.
  const missing = new SourceChecker({ config: { ...CONFIG, command: '/nonexistent/lc-source-checker' } });
  assert.equal(await missing.open(), 'the source check could not be started, or failed');
  const t0 = Date.now();
  assert.deepEqual(await missing.close(), { spawned: false, exit_seen: false, code: null, signal: null, killed: false });
  assert.ok(Date.now() - t0 < 500, 'not waited for');
  // Ended before it was started: it is never started.
  const f = fakeCheckers();
  const never = new SourceChecker({ config: CONFIG, spawn: f.spawn });
  assert.deepEqual(await never.close(), { spawned: false, exit_seen: false, code: null, signal: null, killed: false });
  assert.equal(await never.open(), 'the source check of this capture was ended');
  assert.equal(f.made.length, 0);
});

test('a failure followed at once by this app ending the checker is not told as a failure (the end is this app\'s own)', async () => {
  const { checker, c, told } = await ready();
  c.exit(5);
  for (let i = 0; i < 5; i += 1) await Promise.resolve(); // its end is seen (the notice is still to go out)
  assert.equal(checker.failure, 'the source check ended');
  const closing = checker.close(); // before the notice of its end has gone out
  await settle();
  await settle();
  await closing;
  assert.deepEqual(told, []);
});

test('late is late at its receipt: an answer after its bound, or a ready line after its bound, is refused even when the event loop was held up so its timer had not run yet; in time is still accepted; a byte-order mark before the ready line is refused', async () => {
  /** Holds up this thread (and so the event loop) for `ms`. */
  const hold = (ms: number): void => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (const [what, held, ok] of [['in time', 0, true], ['after its bound, before its timer ran', 150, false]] as const) {
    const { checker, c, told } = await ready({ decision_ms: 100 }, (x) => void (x.mode = 'hold'));
    const d = checker.decide(ASK);
    await settle();
    const r = c.waiting();
    if (held) hold(held); // (the answer is read before the timer that would have refused it)
    c.reply(r);
    const got = await d;
    assert.deepEqual([got.ok, !got.ok && got.reason], ok ? [true, false] : [false, 'the source check did not answer within 100 ms'], what);
    await settle();
    assert.equal(told.length, ok ? 0 : 1, what);
    await checker.close();
  }
  for (const [what, held, line, expect] of [
    ['in time', 0, '{"format":"lc-source-admission/1","ready":true}', null],
    ['after its bound, before its timer ran', 1050, '{"format":"lc-source-admission/1","ready":true}', 'the source check was not ready within 1000 ms'],
    ['with a byte-order mark', 0, '﻿{"format":"lc-source-admission/1","ready":true}', 'the source check wrote a byte-order mark'],
  ] as const) {
    const f = fakeCheckers((x) => void (x.autoReady = false));
    const checker = new SourceChecker({ config: { ...CONFIG, ready_ms: 1000 }, spawn: f.spawn, endMs: 50 });
    const opening = checker.open();
    if (held) hold(held);
    f.last().write(line);
    assert.equal(await opening, expect, what);
    await checker.close();
  }
});
