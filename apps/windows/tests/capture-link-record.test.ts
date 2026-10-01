// The capture link's coordination record (src/main/capture-link.ts) without the Backend: a fake host child (no
// process, no port) and a fake loopback answer. A record read back is used only if every field status, recovery and
// the Stop use is well formed and bound (else it is left byte for byte, and nothing is asked for); a record is written
// whole or not at all (the one before stays), and nothing waiting on that write is sent; after such a fault the
// earlier outcomes stay shown, with further sends stopped.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { CaptureLink, type LinkStatus } from '../src/main/capture-link.ts';
import type { Transport } from '../src/main/loopback-http.ts';
import { ACTOR, FakeChild, fakeService, fakeSpawn, READY_CONSUMED, readyFor, seedRecord, SOURCE, STREAM } from './link-fakes.ts';
import { INK, MANIFEST, SESSION } from './link-world.ts';

const temps: string[] = [];
after(() => temps.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const seed = seedRecord;
type Seed = ReturnType<typeof seed>;
type S = Seed['streams'][number];

/** A link over `doc` (written as given); its host a fake child saying READY consumed; every request recorded. */
function linkOn(doc: unknown, o: { answer?: Transport } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-link-record-'));
  temps.push(userData);
  const file = path.join(userData, 'capture-host', 'coordination.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc));
  const before = fs.readFileSync(file);
  const asked = { dsn: 0 };
  const children: FakeChild[] = [];
  const requests: Array<{ method: string; path: string; key: string | undefined; body: string | null; witnessed: boolean }> = [];
  let stopped = false;
  const transport: Transport = async (r) => {
    const p = new URL(r.url).pathname;
    if (p === '/openapi.json') return { status: 404, text: '{}' };
    // Whether the record on disk, at the moment of dispatch, holds this exact key and body.
    let witnessed = false;
    try {
      const onDisk = JSON.parse(fs.readFileSync(file, 'utf8')) as Seed;
      witnessed = onDisk.streams.some((s) => (s.stops as Array<{ key: string; body: unknown }>).some((x) => x.key === r.headers['Idempotency-Key'] && JSON.stringify(x.body) === r.body));
    } catch {
      witnessed = false;
    }
    requests.push({ method: r.method, path: p, key: r.headers['Idempotency-Key'], body: r.body, witnessed });
    if (o.answer) return o.answer(r);
    if (r.method === 'GET') return { status: 200, text: JSON.stringify({ contract_version: '0.2.1', stream_id: STREAM, revision: stopped ? 2 : 1, state: stopped ? 'stopped' : 'live', pre_stop_sequence: null }) };
    stopped = true;
    return { status: 200, text: JSON.stringify({ contract_version: '0.2.1', stream_id: STREAM, revision: 2, state: 'stopped', pre_stop_sequence: null }) };
  };
  const statuses: LinkStatus[] = [];
  const link = new CaptureLink({
    userData,
    config: { launch: { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' }, dsn_file: '/not-read' },
    notify: (s) => statuses.push(s),
    endCapture: () => undefined,
    readDsn: () => ((asked.dsn += 1), 'host=/nonexistent-socket dbname=lc_p0_test'),
    transport,
    retry_ms: 1,
    host: { spawn: fakeSpawn(() => new FakeChild({ ready: READY_CONSUMED }), children).spawn, end_ms: 200 },
  });
  return { link, file, before, asked, children, requests, statuses };
}

// ---- reading it back -----------------------------------------------------------------------------------------
test('a record as this app writes it is used: its stream not known to be ended is reconciled (read, then one Stop)', async () => {
  const w = linkOn(seed());
  const s = w.link.status();
  assert.deepEqual(s.mode === 'development' && [s.stored, s.unknown, s.earlier_unknown], [2, 1, 1]);
  await w.link.reconcile();
  assert.equal(w.asked.dsn, 1);
  assert.deepEqual(w.requests.map((r) => `${r.method} ${r.path}`), [`GET /v2/process/streams/${STREAM}`, `POST /v2/process/streams/${STREAM}:control`, `GET /v2/process/streams/${STREAM}`]);
  const after = JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed;
  assert.deepEqual([after.streams[0]!.final, after.streams[0]!.jobs[1]!.status], ['stopped', 'unknown'], 'ended; the unknown job stays unknown, never resent');
});

const damaged: Array<[string, (d: Seed, s: S) => void]> = [
  ['a job that is null', (_d, s) => void ((s.jobs as unknown[])[0] = null)],
  ['a stream without its end (final)', (_d, s) => void delete (s as Partial<S>).final],
  ['an end that is not one of the known ends', (_d, s) => void (s.final = 'ended')],
  ['a job whose status is not known', (_d, s) => void ((s.jobs[0] as { status: string }).status = 'done')],
  ['a job without its record count', (_d, s) => void delete (s.jobs[0] as { records?: number }).records],
  ['a job in doubt without its exact body', (_d, s) => void delete (s.jobs[1] as { body?: string }).body],
  ['a job whose body is not the one its hash names', (_d, s) => void ((s.jobs[1] as { body?: string }).body = '{"batch":"other bytes"}')],
  ['a job whose key is not its lines\' key', (_d, s) => void ((s.jobs[0] as { key: string }).key = `${SOURCE}.b9-9`)],
  ['a job past what was planned', (_d, s) => void (s.planned_through = 3)],
  ['a job planned for another stream', (_d, s) => void (((s.jobs[1] as { plan: { stream_id: string } }).plan).stream_id = 'stream-other')],
  ['a registration of another device', (_d, s) => void (s.registration.device_id = 'windows-other')],
  ['a registration key of another stream', (_d, s) => void (s.registration_key = 'stream-other.register')],
  ['a grant that is not one of the known states', (_d, s) => void (s.grant = 'granted')],
  ['a state without its revision', (_d, s) => void delete (s.state as { revision?: number }).revision],
  ['a source of another user', (_d, s) => void (s.source.user_id = 'lc-windows-http-other')],
  ['a Stop under another stream\'s key', (_d, s) => void s.stops.push({ key: 'stream-other.stop.1', body: { contract_version: '0.2.1', device_id: ACTOR.device_id, session_id: ACTOR.session_id, stream_id: STREAM, expected_revision: 1, action: { kind: 'stop', pre_stop_sequence: null } }, outcome: 'unknown' })],
  ['a Stop without its revision', (_d, s) => void s.stops.push({ key: `${STREAM}.stop.1`, body: { contract_version: '0.2.1', device_id: ACTOR.device_id, session_id: ACTOR.session_id, stream_id: STREAM, action: { kind: 'stop', pre_stop_sequence: null } }, outcome: 'unknown' })],
  ['an actor without its device', (d) => void delete (d.actor as Partial<typeof ACTOR>).device_id],
  ['two streams with one identity', (d, s) => void d.streams.push(JSON.parse(JSON.stringify(s)))],
];
for (const [what, damage] of damaged) {
  test(`a damaged record (${what}) is not used: left byte for byte, status unavailable, nothing asked for at restart or Start`, async () => {
    const doc = seed();
    damage(doc, doc.streams[0]!);
    const w = linkOn(doc);
    assert.deepEqual(w.link.status(), { mode: 'unavailable', reason: 'the capture link record could not be read; it is left as it is, and development capture storage is off' });
    await w.link.reconcile();
    w.link.begin('capture-20260930-0002', path.join(os.tmpdir(), 'lc-no-such-capture-2'));
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual([w.asked.dsn, w.children.length, w.requests.length], [0, 0, 0], 'no DSN read, no host, no request');
    assert.deepEqual(fs.readFileSync(w.file), w.before);
  });
}

// ---- writing it ----------------------------------------------------------------------------------------------
/** fs.writeSync (as capture-link.ts has it) replaced for writes of the coordination record while `f` runs. */
async function withRecordWrites(write: (original: typeof fs.writeSync, fd: number, data: Buffer, offset: number, length: number, call: number) => number, f: () => Promise<void>): Promise<void> {
  const original = fs.writeSync;
  let call = 0;
  fs.writeSync = ((fd: number, data: unknown, ...rest: unknown[]) => {
    // Written as bytes (or, as a string, all of it from the start): given to `write` as bytes either way.
    const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.isBuffer(data) ? data : null;
    if (bytes && bytes.subarray(0, 40).toString('utf8').startsWith('{"format":"lc-windows-capture-link/v1"')) {
      return typeof data === 'string' ? write(original, fd, bytes, 0, bytes.length, ++call) : write(original, fd, bytes, rest[0] as number, rest[1] as number, ++call);
    }
    return (original as (...a: unknown[]) => number)(fd, data, ...rest);
  }) as typeof fs.writeSync;
  syncBuiltinESMExports();
  try {
    await f();
  } finally {
    fs.writeSync = original;
    syncBuiltinESMExports();
  }
}

test('short writes are continued until the whole record is written; the Stop is sent only once it is on disk', async () => {
  const w = linkOn(seed());
  const sizes: number[] = [];
  await withRecordWrites((original, fd, data, offset, length) => {
    const n = original(fd, data, offset, Math.min(23, length)); // the file system takes 23 bytes at a time
    sizes.push(n);
    return n;
  }, () => w.link.reconcile());
  assert.ok(sizes.length > 10, 'many short writes');
  const post = w.requests.filter((r) => r.method === 'POST');
  assert.deepEqual(post.map((r) => [r.key, r.witnessed]), [[`${STREAM}.stop.1`, true]], 'its exact key and body were on disk first');
  assert.equal((JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]!.final, 'stopped');
});

for (const [what, write] of [
  ['no progress (0 bytes)', () => 0],
  ['a failure after a partial write', (original: typeof fs.writeSync, fd: number, data: Buffer, offset: number, length: number, call: number) => {
    if (call === 1) return original(fd, data, offset, Math.min(23, length));
    throw Object.assign(new Error('ENOSPC: no space left on device (injected)'), { code: 'ENOSPC' });
  }],
] as const) {
  test(`a record write that fails (${what}): the record before stays byte for byte, the Stop is not sent, and the outcomes stay shown`, async () => {
    const w = linkOn(seed());
    await withRecordWrites(write as never, () => w.link.reconcile());
    assert.deepEqual(w.requests.map((r) => r.method), ['GET'], 'the state was read; no Stop without its witness on disk');
    assert.deepEqual(fs.readFileSync(w.file), w.before, 'the record before is kept, not replaced by part of one');
    assert.deepEqual(fs.readdirSync(path.dirname(w.file)), ['coordination.json'], 'no partial temporary file left');
    const s = w.link.status();
    assert.equal(s.mode, 'development');
    if (s.mode !== 'development') return;
    assert.deepEqual([s.stored, s.unknown, s.earlier_unknown, s.sends_stopped], [2, 1, 1, true], 'what is known of earlier sends stays');
    assert.match(s.detail ?? '', /could not be written, so further sends to the local test capture service have stopped/);
    // A new Start asks for nothing while the record cannot be written.
    const dsnReads = w.asked.dsn;
    w.link.begin('capture-20260930-0002', path.join(os.tmpdir(), 'lc-no-such-capture-2'));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(w.asked.dsn, dsnReads);
  });
}

test('a fault before anything was recorded: nothing was sent, so the link says it is off with the reason', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-link-record-'));
  temps.push(userData);
  const link = new CaptureLink({ userData, config: { launch: { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' }, dsn_file: '/not-read' }, notify: () => undefined, endCapture: () => undefined, readDsn: () => 'host=/nonexistent dbname=lc_p0_test' });
  await withRecordWrites(() => 0, async () => {
    link.begin('capture-20260930-0003', path.join(userData, 'captures', 'c'));
    await new Promise((r) => setTimeout(r, 20));
    link.stopSending('capture-20260930-0003');
    await new Promise((r) => setTimeout(r, 20));
  });
  assert.deepEqual(link.status(), { mode: 'unavailable', reason: 'the capture link record could not be written, so further sends to the local test capture service have stopped' });
  // Its folder is not left behind: at the next start the link is not taken for a used one whose record was lost.
  assert.equal(fs.existsSync(path.join(userData, 'capture-host')), false);
  const next = new CaptureLink({ userData, config: { launch: { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' }, dsn_file: '/not-read' }, notify: () => undefined, endCapture: () => undefined });
  assert.deepEqual([next.status().mode, (next.status() as { state?: string }).state], ['development', 'idle']);
});

// ---- an explicit Start with a fake host --------------------------------------------------------------------
const WSL = { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' } as const;
/**
 * An explicit Start over the harness-ink capture: its host a fake child (READY as the released host says it), its
 * answers the service's (a registration, the display source, the state, a Stop), or `own` where it answers.
 */
function started(o: { own?: (method: string, p: string) => { status: number; text: string } | null; token_life_ms?: number } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-link-record-'));
  temps.push(userData);
  const capture = path.join(userData, 'captures', SESSION);
  fs.mkdirSync(capture, { recursive: true });
  for (const d of ['frames', 'ink']) fs.cpSync(path.join(INK, d), path.join(capture, d), { recursive: true });
  const file = path.join(userData, 'capture-host', 'coordination.json');
  const children: FakeChild[] = [];
  const { transport, requests } = fakeService(file, o.own);
  const link = new CaptureLink({
    userData, config: { launch: WSL, dsn_file: '/not-read' }, notify: () => undefined, endCapture: () => undefined,
    readDsn: () => 'host=/nonexistent-socket dbname=lc_p0_test', transport, retry_ms: 1, stop_wait_ms: 200,
    ...(o.token_life_ms ? { token_life_ms: o.token_life_ms } : {}),
    host: { spawn: fakeSpawn(() => new FakeChild({ ready: readyFor }), children).spawn, end_ms: 200 },
  });
  let written = 0;
  const append = (count: number): void => {
    const lines = MANIFEST.slice(written, written + count);
    written += lines.length;
    fs.appendFileSync(path.join(capture, 'manifest.jsonl'), lines.map((l) => `${l}\n`).join(''));
    link.appended(SESSION, fs.statSync(path.join(capture, 'manifest.jsonl')).size);
  };
  return { link, userData, capture, file, children, requests, append };
}
const until = async (what: string, ok: () => boolean, ms = 5000): Promise<void> => {
  const by = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > by) assert.fail(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};
const stateOf = (l: CaptureLink): string | undefined => (l.status() as { state?: string }).state;

test('after a record-write fault no host is started again and nothing is registered again: the link stays not connected', async () => {
  // Its bearer already expired when the first job is sent (refused here, before sending): that would renew the host.
  const w = started({ token_life_ms: 1 });
  await withRecordWrites((original, fd, data, offset, length) => {
    if (data.includes('"status":"not_sent"')) throw Object.assign(new Error('EIO: i/o error (injected)'), { code: 'EIO' });
    return original(fd, data, offset, length);
  }, async () => {
    w.link.begin(SESSION, w.capture);
    w.append(3);
    await until('the fault', () => (w.link.status() as { sends_stopped?: boolean }).sends_stopped === true && stateOf(w.link) === 'not connected');
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(w.children.length, 1, 'no second host');
    assert.equal(w.requests.filter((r) => r === 'POST /v2/process/streams').length, 1, 'no second registration');
    assert.equal(stateOf(w.link), 'not connected');
  });
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
});

test('a state answer the record could not read back is not written: the registration stays not known, and the record stays readable', async () => {
  const w = started({ own: (method, p) => (method === 'POST' && p === '/v2/process/streams' ? { status: 200, text: JSON.stringify({ contract_version: '0.2.1', stream_id: (JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]!.stream_id, revision: 0, state: 'live', pre_stop_sequence: null }) } : null) });
  w.link.begin(SESSION, w.capture);
  await until('not connected', () => stateOf(w.link) === 'not connected');
  const rec = (JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]!;
  assert.deepEqual([rec.registered, rec.state, rec.notes.at(-1)], [false, null, 'the registration answer is not this stream\'s state']);
  const again = new CaptureLink({ userData: w.userData, config: { launch: WSL, dsn_file: '/not-read' }, notify: () => undefined, endCapture: () => undefined });
  assert.equal(again.status().mode, 'development', 'read back');
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
});
