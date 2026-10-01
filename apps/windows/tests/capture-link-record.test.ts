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
import { controlPage } from './control-page.ts';

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
function started(o: { own?: Parameters<typeof fakeService>[1]; hold?: Parameters<typeof fakeService>[2]; token_life_ms?: number } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-link-record-'));
  temps.push(userData);
  const capture = path.join(userData, 'captures', SESSION);
  fs.mkdirSync(capture, { recursive: true });
  for (const d of ['frames', 'ink']) fs.cpSync(path.join(INK, d), path.join(capture, d), { recursive: true });
  const file = path.join(userData, 'capture-host', 'coordination.json');
  const children: FakeChild[] = [];
  const { transport, requests } = fakeService(file, o.own, o.hold);
  const said: LinkStatus[] = [];
  const link = new CaptureLink({
    userData, config: { launch: WSL, dsn_file: '/not-read' }, notify: (s) => void said.push(s), endCapture: () => undefined,
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
  return { link, userData, capture, file, children, requests, append, said };
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

/** Any text saying, as a fact, that frames are (being) stored. */
const CLAIMS = /(are|is) (also )?(being )?stored|also (being )?stored in/;

// QA-WIN-05.
test('a service that holds its connection and does not answer: the wait is said before it begins (pending, not stored, not "not stored"); a Stop during it keeps every fact', async () => {
  // The first upload request is held: nothing is answered until released (never, here: the Stop cancels it).
  const seen: Array<{ at: string; last: LinkStatus | undefined }> = [];
  let w!: ReturnType<typeof started>;
  w = started({ hold: (method, p) => {
    if (method !== 'PUT' || !p.startsWith('/v2/process/originals/')) return null;
    seen.push({ at: `${method} ${p}`, last: w.said.at(-1) }); // what the app had said when the request reached the service
    return new Promise<void>(() => undefined);
  } });
  const shown = (s: LinkStatus): string => {
    const p = controlPage();
    p.showLink(s);
    return `${p.nodes['ai']!.textContent}\n${p.nodes['link']!.textContent}`;
  };
  w.link.begin(SESSION, w.capture);
  await until('live', () => stateOf(w.link) === 'sending');
  const live = w.link.status();
  assert.deepEqual(live.mode === 'development' && [live.storing, live.awaiting, live.stored, live.unknown], [true, false, 0, 0], 'live, nothing sent yet');
  w.append(3);
  await until('the first upload request reached the service', () => seen.length === 1);
  // No gap: the status said before the request left already says a send is out.
  const before = seen[0]!.last!;
  assert.deepEqual(before.mode === 'development' && [before.state, before.awaiting, before.storing, before.stored, before.unknown], ['sending', true, false, 0, 2]);
  // While it waits (the service says nothing), the same holds, and the texts claim nothing.
  await new Promise((r) => setTimeout(r, 150));
  const waiting = w.link.status();
  assert.deepEqual(waiting.mode === 'development' && [waiting.state, waiting.awaiting, waiting.storing, waiting.stored, waiting.unknown], ['sending', true, false, 0, 2]);
  assert.equal(w.said.at(-1), before, 'nothing else was said meanwhile');
  assert.doesNotMatch(shown(waiting), CLAIMS);
  assert.doesNotMatch(shown(waiting), /not stored|not storing/);
  assert.match(shown(waiting), /are also sent to a local test capture service on it\. A record counts as stored only once that service confirms it[\s\S]*Capture storage \(development\): sending: waiting for the service to confirm\. 0 record\(s\) stored; 2 not known whether stored\. AI: not connected\.$/);
  // The Stop: latched at once; the send out is cancelled at the bound and stays in doubt; nothing is lost or made up.
  const from = w.said.length;
  w.link.stopSending(SESSION);
  assert.deepEqual([stateOf(w.link), (w.link.status() as { storing: boolean }).storing], ['stopping', false]);
  await until('stopped', () => stateOf(w.link) === 'stopped');
  const end = w.link.status();
  assert.deepEqual(end.mode === 'development' && [end.awaiting, end.storing, end.stored, end.unknown], [false, false, 0, 2], 'still not known; nothing counted as stored');
  assert.equal(w.said.slice(from).some((s) => s.mode === 'development' && s.storing), false);
  const afterStop = w.said.slice(from).flatMap((s) => (s.mode === 'development' ? [[s.state, s.awaiting] as const] : []));
  assert.deepEqual(afterStop[0], ['stopping', true], 'the send is still out when the Stop begins, and that is said');
  assert.deepEqual(afterStop.at(-1), ['stopped', false]);
  assert.deepEqual(afterStop.filter(([st]) => st === 'stopped').map(([, awaiting]) => awaiting).includes(true), false, 'no send is out once it was cancelled');
  const job = (JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]!.jobs[0] as { status: string; key: string; body?: string; body_sha256?: string };
  assert.deepEqual([job.status, typeof job.body, sha(job.body!) === job.body_sha256], ['unknown', 'string', true], 'its exact key and body are kept');
  assert.equal(w.requests.filter((r) => r.startsWith('PUT /v2/process/originals/')).length, 1, 'one request went out; nothing was sent again after the Stop');
});

test('every upload request leaves only after the app has said a send is out, on retries too; between sends none is out', async () => {
  // Every upload is answered 503: the same job is tried again and again.
  const atRequest: Array<LinkStatus | undefined> = [];
  let w!: ReturnType<typeof started>;
  w = started({ hold: (method, p) => {
    if (p.startsWith('/v2/process/originals/') || p.endsWith(':batch')) atRequest.push(w.said.at(-1));
    return null;
  } });
  w.link.begin(SESSION, w.capture);
  w.append(3);
  await until('several tries', () => atRequest.length >= 7); // more than two whole uploads (three tries each)
  assert.deepEqual(atRequest.map((s) => s?.mode === 'development' && s.awaiting), atRequest.map(() => true), 'said before each request');
  assert.equal(atRequest.some((s) => s?.mode === 'development' && s.storing), false);
  // After each unanswered upload, and before the next one leaves: stalled, nothing out, the counts unchanged.
  const between = w.said.filter((s) => s.mode === 'development' && s.state === 'stalled' && !s.awaiting);
  assert.equal(between.length >= 2, true);
  assert.equal(between.every((s) => s.mode === 'development' && s.stored === 0 && s.unknown + s.not_sent === 2), true);
  const retry = atRequest.at(-1)!;
  assert.deepEqual(retry.mode === 'development' && [retry.state, retry.awaiting, retry.stored, retry.unknown + retry.not_sent], ['stalled', true, 0, 2], 'a retry out: still not confirmed, still counted');
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
  const last = w.said.at(-1)!;
  assert.equal(last.mode === 'development' && last.awaiting, false);
});

test('a job known not sent, sent again to a service that does not answer: written and counted as not known while it is out, never as "not sent"', async () => {
  // The first three requests are refused connections (nothing was sent: the job is not_sent); the next is held.
  let refused = 0;
  const atHeld: Array<{ last: LinkStatus | undefined; recorded: string }> = [];
  let w!: ReturnType<typeof started>;
  w = started({ hold: (method, p) => {
    if (!p.startsWith('/v2/process/originals/')) return null;
    if (refused++ < 3) return Promise.reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    atHeld.push({ last: w.said.at(-1), recorded: ((JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]!.jobs[0] as { status: string }).status });
    return new Promise<void>(() => undefined);
  } });
  w.link.begin(SESSION, w.capture);
  w.append(3);
  await until('known not sent', () => w.said.some((s) => s.mode === 'development' && s.not_sent === 2 && !s.awaiting));
  await until('sent again, and held', () => atHeld.length === 1);
  const out = atHeld[0]!;
  assert.equal(out.recorded, 'sending', 'written as being sent before it left');
  assert.deepEqual(out.last?.mode === 'development' && [out.last.awaiting, out.last.unknown, out.last.not_sent, out.last.stored], [true, 2, 0, 0], 'counted as not known while it is out');
  const p = controlPage();
  p.showLink(w.link.status());
  assert.doesNotMatch(p.nodes['link']!.textContent, /not sent/);
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
  const end = w.link.status();
  assert.deepEqual(end.mode === 'development' && [end.unknown, end.not_sent, end.stored], [2, 0, 0], 'cancelled while out: it may have arrived, so it stays not known');
});

test('a job known not sent whose resend cannot be written first is not sent, and is said as it is: still not sent, further sends stopped', async () => {
  // Three refused connections make the job not_sent. The next write, the resend's "being sent", then fails.
  let refused = 0;
  const w = started({ hold: (_method, p) => (p.startsWith('/v2/process/originals/') ? (refused++, Promise.reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))) : null) });
  const recorded = (): string | undefined => (fs.existsSync(w.file) ? ((JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]?.jobs[0] as { status: string } | undefined)?.status : undefined);
  let failed = 0;
  await withRecordWrites((original, fd, data, offset, length) => {
    if (refused >= 3 && data.includes('"status":"sending"')) {
      failed += 1;
      throw Object.assign(new Error('ENOSPC: no space left on device (injected)'), { code: 'ENOSPC' });
    }
    return original(fd, data, offset, length);
  }, async () => {
    w.link.begin(SESSION, w.capture);
    w.append(3);
    await until('the fault', () => (w.link.status() as { sends_stopped?: boolean }).sends_stopped === true);
    await new Promise((r) => setTimeout(r, 100));
  });
  assert.deepEqual([refused, failed], [3, 1], 'no request after the failed write');
  assert.equal(recorded(), 'not_sent', 'the record before stays: the job is not sent');
  // What was said last is what is so: not sent (not "not known"), further sends stopped, nothing out.
  const now = w.link.status();
  assert.deepEqual(w.said.at(-1), now, 'the last notification is the status');
  assert.deepEqual(now.mode === 'development' && [now.state, now.unknown, now.not_sent, now.stored, now.awaiting, now.storing, now.sends_stopped], ['not connected', 0, 2, 0, false, false, true]);
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
});

test('a send the service refuses is said at once, before the state read that follows (another wait)', async () => {
  // The first original is refused (a typed 403); the state read that follows is held.
  const atRead: Array<LinkStatus | undefined> = [];
  let release!: () => void;
  let w!: ReturnType<typeof started>;
  w = started({
    own: (method, p) => (method === 'PUT' && p.startsWith('/v2/process/originals/') ? { status: 403, text: JSON.stringify({ contract_version: '0.2.4', error: 'forbidden', retryable: false }) } : null),
    hold: (method, p) => {
      if (method !== 'GET' || !p.startsWith('/v2/process/streams/') || atRead.length > 0) return null; // the first read only
      atRead.push(w.said.at(-1));
      return new Promise<void>((r) => (release = r));
    },
  });
  w.link.begin(SESSION, w.capture);
  w.append(3);
  await until('the state read is out', () => atRead.length === 1);
  const said = atRead[0]!;
  assert.deepEqual(said.mode === 'development' && [said.state, said.awaiting, said.storing, said.refused, said.unknown, said.detail], ['stalled', false, false, 2, 0, 'the service refused the last send; its state is being read']);
  const now = w.link.status();
  assert.deepEqual(now.mode === 'development' && [now.awaiting, now.storing], [false, false], 'read directly, too');
  release();
  await until('ended by the service', () => stateOf(w.link) === 'ended by the service');
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
});

// W-COPY-02.
test('a job in doubt set aside leaves nothing to send, and that is not an answer: storage stays not confirmed, its outcome not known', async () => {
  // The service takes each original (a receipt) and answers no batch.
  const w = started({ own: (method, p, body) => {
    if (method !== 'PUT' || !p.startsWith('/v2/process/originals/')) return null;
    const b = JSON.parse(body!) as { source: unknown; kind: string; artifact: unknown };
    return { status: 200, text: JSON.stringify({ contract_version: '0.2.2', source: b.source, kind: b.kind, artifact: b.artifact, status: 'bytes_committed' }) };
  } });
  const header = (): string => {
    const p = controlPage();
    p.showLink(w.link.status());
    return `${p.nodes['ai']!.textContent}\n${p.nodes['link']!.textContent}`;
  };
  const job = () => (JSON.parse(fs.readFileSync(w.file, 'utf8')) as Seed).streams[0]?.jobs[0] as { status: string; stuck?: boolean } | undefined;
  w.link.begin(SESSION, w.capture);
  w.append(3);
  await until('a batch not answered', () => stateOf(w.link) === 'stalled' && job()?.status === 'unknown');
  assert.equal((w.link.status() as { storing: boolean }).storing, false);
  // Its original goes from this device: the job cannot be sent again as recorded, and is set aside (still not known).
  fs.rmSync(path.join(w.capture, 'frames', `${(JSON.parse(MANIFEST[1]!) as { raw: { sha256: string } }).raw.sha256}.png`));
  await until('set aside', () => job()?.stuck === true);
  const batches = w.requests.filter((r) => r.endsWith(':batch')).length;
  await new Promise((r) => setTimeout(r, 100)); // nothing left to send
  assert.equal(w.requests.filter((r) => r.endsWith(':batch')).length, batches, 'the job set aside is not sent again');
  const s = w.link.status();
  assert.equal(s.mode, 'development');
  if (s.mode !== 'development') return;
  assert.deepEqual([s.state, s.storing, s.stored, s.unknown], ['stalled', false, 0, 2], 'no send was answered: not storing, and its outcome stays not known');
  assert.match(s.detail ?? '', /storage of the last send is not confirmed; it stays not confirmed until the service confirms a later send/);
  assert.doesNotMatch(header(), CLAIMS);
  assert.match(header(), /Whether a local test capture service on it is storing them now is not confirmed[\s\S]*Capture storage \(development\): storage not confirmed now \(the frames are kept on this device\)\. 0 record\(s\) stored; 2 not known whether stored/);
  // The host is lost and the link connects again: a connection is not an answered send either.
  const from = w.said.length;
  w.children.at(-1)!.exit(1);
  await until('connected again', () => w.children.length === 2 && w.said.slice(from).some((x) => x.mode === 'development' && x.state === 'stalled'));
  assert.deepEqual(w.said.slice(from).filter((x) => x.mode === 'development' && x.storing), [], 'connected again with no send answered: storing is never said');
  w.link.stopSending(SESSION);
  await until('stopped', () => stateOf(w.link) === 'stopped');
  assert.deepEqual([(w.link.status() as { storing: boolean }).storing, (w.link.status() as { unknown: number }).unknown], [false, 2], 'the Stop keeps it not known');
});
