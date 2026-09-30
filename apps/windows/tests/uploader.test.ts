// The main-process uploader (src/main/uploader.ts): originals, then the exact batch, over real loopback HTTP.
// A small Node server stands in for the Backend where a fault is needed; with LC_BACKEND_ROOT (an extracted Backend)
// and LC_PYTHON set, the same jobs also go to the real Backend (tests/backend-host.py, synthetic test authority).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { EVIDENCE, OUT } from '../scripts/ingress-fixtures.ts';
import { frameRequest, type IngressPlan } from '../src/shared/frame-ingress.ts';
import { ackProblem, isUtcTimestamp, uploadRetained, type UploadAuthority, type UploadJob, type UploadOptions, type UploadResult } from '../src/main/uploader.ts';

const FIXTURE = `${OUT}harness-ink.json`;
const meta = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { manifest: string; plan: IngressPlan };
const CAPTURE = path.dirname(`${EVIDENCE}${meta.manifest}`);
const job = (capture_dir = CAPTURE): UploadJob => {
  const text = fs.readFileSync(`${EVIDENCE}${meta.manifest}`, 'utf8').replace(/\r\n/g, '\n');
  return { capture_dir, plan: meta.plan, prepared: frameRequest(text, meta.plan) };
};
const TOKEN = crypto.randomBytes(36).toString('base64url');
const authority = (origin: string, extra: Partial<UploadAuthority> = {}): UploadAuthority => ({
  origin,
  token: TOKEN,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  owner: meta.plan.source,
  incarnation: { device_id: meta.plan.device_id, session_id: meta.plan.session_id, stream_id: meta.plan.stream_id },
  ...extra,
});
/** Every result, whatever it is, is checked not to carry the bearer. */
const upload = async (a: UploadAuthority, j: UploadJob, o?: UploadOptions): Promise<UploadResult> => {
  const result = await uploadRetained(a, j, o);
  assert.equal(JSON.stringify(result).includes(TOKEN), false, 'the token is never in a result');
  return result;
};
/** A copy of the capture folder to change; it and whatever a test puts beside it are removed at the end. */
const copies: string[] = [];
const copyCapture = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-upload-'));
  fs.cpSync(CAPTURE, dir, { recursive: true });
  copies.push(dir);
  return dir;
};
after(() => {
  for (const dir of copies) {
    for (const name of fs.readdirSync(path.dirname(dir)).filter((n) => n.startsWith(path.basename(dir)))) fs.rmSync(path.join(path.dirname(dir), name), { recursive: true, force: true });
  }
});
/** A link to a folder: a junction on Windows (which any account may make), a symbolic link elsewhere. */
const linkDir = (target: string, at: string): void => fs.symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
/** Whether this account may make a symbolic link to a file: Windows allows it only with a privilege or developer mode. */
const fileLinks = ((): boolean => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-upload-'));
  copies.push(dir);
  fs.writeFileSync(path.join(dir, 'a'), 'a');
  try {
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'));
    return true;
  } catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  }
})();
const NO_FILE_LINKS = 'this Windows account may not make symbolic links to files (EPERM); the case runs where it may, as on the hosted Windows runner';
/**
 * Windows only: every byte of `file` locked by an owned helper process (PowerShell opens it for reading, sharing
 * read, write and delete, then FileStream.Lock(0, length)); opening it still succeeds, but every read of it fails
 * (EBUSY in Node, at the read). This is read-denial, not open-denial: the hosted stock Node was shown to open and read
 * a file held with FileShare.None, and to fail at the read under this lock. Returns what releases it: the helper
 * unlocks, closes and ends (killed if it has not ended within 10 s; its end is then awaited 5 s more at most).
 */
async function lockWhole(file: string): Promise<() => Promise<void>> {
  const script = "$f = [System.IO.File]::Open($env:LC_HOLD_FILE, 'Open', 'Read', 'ReadWrite, Delete'); $f.Lock(0, $f.Length); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); [void][Console]::In.ReadLine(); $f.Unlock(0, $f.Length); $f.Close()";
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, LC_HOLD_FILE: file }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  // Its end is observed whatever happens: an exit, or a failure to start (then no exit comes).
  const exited = new Promise<void>((resolve) => {
    helper.once('exit', () => resolve());
    helper.once('error', () => resolve());
  });
  helper.stdin!.on('error', () => undefined); // a helper already gone does not fail the write of its release line
  /** Settles with `value` after `ms`, unless cancelled first (so no timer outlives what it bounds). */
  const within = <T,>(ms: number, value: T): { promise: Promise<T>; cancel: () => void } => {
    let t: NodeJS.Timeout | undefined;
    return { promise: new Promise<T>((resolve) => (t = setTimeout(() => resolve(value), ms))), cancel: () => clearTimeout(t) };
  };
  const release = async (): Promise<void> => {
    helper.stdin!.end('\n');
    const bound = within(10_000, 'late' as const);
    const outcome = await Promise.race([exited.then(() => 'ended' as const), bound.promise]);
    bound.cancel();
    if (outcome === 'late') {
      helper.kill();
      const last = within(5_000, 'late' as const);
      const after = await Promise.race([exited.then(() => 'ended' as const), last.promise]);
      last.cancel();
      assert.equal(after, 'ended', 'the lock helper ended when killed');
    }
  };
  const start = within(30_000, false);
  const held = await Promise.race([
    new Promise<boolean>((resolve) => {
      let out = '';
      helper.stdout!.on('data', (c: Buffer) => {
        out += c.toString();
        if (out.includes('held')) resolve(true);
      });
    }),
    exited.then(() => false),
    start.promise,
  ]);
  start.cancel();
  if (!held) {
    await release();
    throw new Error('the lock helper did not lock the file');
  }
  return release;
}
const digest = (dir: string): string => {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
    const p = path.join(dir, f);
    if (fs.lstatSync(p).isFile()) h.update(f).update(fs.readFileSync(p));
  }
  return h.digest('hex');
};

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
type Fault = (r: Seen, n: number) => 'drop' | 'hold' | { status: number; body?: unknown; raw?: string; headers?: Record<string, string> } | null;
/** A stand-in Backend: receipts and ACKs as the released contract gives them; `fault` decides a request's fate. */
async function standIn(fault: Fault = () => null) {
  const seen: Seen[] = [];
  const held: Array<() => void> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const r = { method: req.method!, url: req.url!, headers: req.headers, body };
      seen.push(r);
      const f = fault(r, seen.length);
      if (f === 'drop') return void req.socket.destroy();
      if (f === 'hold') return void held.push(() => res.end());
      if (f) {
        res.writeHead(f.status, { 'Content-Type': 'application/json', ...(f.headers ?? {}) });
        return void res.end(f.raw ?? (f.body === undefined ? '' : JSON.stringify(f.body)));
      }
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'PUT') {
        const { data_base64: _d, ...receipt } = parsed;
        return void res.end(JSON.stringify({ ...receipt, status: 'bytes_committed' }));
      }
      const b = parsed.batch;
      res.end(JSON.stringify({
        contract_version: '0.2.0', batch_id: b.batch_id, user_id: b.records[0].source.user_id, device_id: b.device_id, session_id: b.session_id, stream_id: b.stream_id,
        acknowledged: b.records.map((r: { record_id: string; sequence: number; artifacts: object[] }) => ({ record_id: r.record_id, sequence: r.sequence, disposition: 'accepted', received_at: '2026-09-30T17:00:00Z', envelope: 'committed', artifacts: r.artifacts.map((a) => ({ ...a, status: 'verified' })) })),
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, seen, held, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) };
}
const batches = (seen: Seen[]) => seen.filter((r) => r.url === '/v2/process/windows-frames:batch');
const puts = (seen: Seen[]) => seen.filter((r) => r.method === 'PUT');
/** A typed error of the released contract, as the Backend gives it: 0.2.4 on the originals route, 0.2.10 on the batch. */
const typed = (status: number, error: string, version: '0.2.4' | '0.2.10' = '0.2.4') => ({ status, body: { contract_version: version, error, retryable: error === 'unavailable' || error === 'dependency_missing' } });
/** What a result says, in one comparable line. */
const shape = (r: UploadResult) => [r.status, 'stage' in r ? r.stage : null, 'in_doubt' in r ? r.in_doubt : undefined, r.originals.length];

test('every original first, each with its exact bytes, then the exact batch with its key; committed only on a corresponding ACK; the token is never in the result', async () => {
  const s = await standIn();
  try {
    const j = job();
    const before = digest(CAPTURE);
    const result = await upload(authority(s.origin), j);
    assert.equal(result.status, 'committed');
    const originals = puts(s.seen);
    assert.equal(originals.length, 7, '4 PNGs and 3 ink originals (shared ones once)');
    assert.equal(s.seen.at(-1)!.url, '/v2/process/windows-frames:batch', 'the batch last');
    for (const r of originals) {
      const u = JSON.parse(r.body);
      const rel = u.kind === 'editable_ink' ? `ink/${u.artifact.sha256}.json` : `frames/${u.artifact.sha256}.png`;
      assert.equal(Buffer.from(u.data_base64, 'base64').equals(fs.readFileSync(path.join(CAPTURE, rel))), true, `${rel}: exact bytes`);
      assert.deepEqual(u.source, meta.plan.source);
      assert.equal(r.url, `/v2/process/originals/${u.artifact.artifact_id}`);
    }
    const [b] = batches(s.seen);
    assert.equal(b!.body, j.prepared.body, 'the exact prepared bytes');
    assert.equal(b!.headers['idempotency-key'], j.prepared.idempotency_key);
    assert.equal(b!.headers['authorization'], `Bearer ${TOKEN}`);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
    assert.equal(digest(CAPTURE), before, 'nothing local changed');
  } finally {
    await s.close();
  }
});

test('an answer lost after the batch was received is sent again as the same bytes with the same key; 503 likewise; still unknown after the bound', async () => {
  const lost = await standIn((r, n) => (r.url.endsWith(':batch') && batches([r]).length && n === 8 ? 'drop' : null));
  try {
    assert.equal((await upload(authority(lost.origin), job(), { pause_ms: 5 })).status, 'committed');
    const [a, b] = batches(lost.seen);
    assert.ok(a && b);
    assert.equal(a.body, b.body);
    assert.equal(a.headers['idempotency-key'], b.headers['idempotency-key']);
  } finally {
    await lost.close();
  }
  let busy = 0;
  const unavailable = await standIn((r) => (r.method === 'PUT' && busy++ === 0 ? { status: 503, body: { contract_version: '0.2.4', error: 'unavailable', retryable: true } } : null));
  try {
    assert.equal((await upload(authority(unavailable.origin), job(), { pause_ms: 5 })).status, 'committed');
    const [first, again] = puts(unavailable.seen);
    assert.equal(first!.body, again!.body, 'the same original again');
  } finally {
    await unavailable.close();
  }
  const never = await standIn((r) => (r.url.endsWith(':batch') ? 'drop' : null));
  try {
    const result = await upload(authority(never.origin), job(), { pause_ms: 5, attempts: 3 });
    assert.equal(result.status, 'unknown');
    assert.equal(result.status === 'unknown' && result.stage, 'batch');
    assert.equal(result.originals.length, 7, 'the originals committed stay committed');
    assert.equal(batches(never.seen).length, 3);
    assert.equal(new Set(batches(never.seen).map((r) => r.body)).size, 1);
  } finally {
    await never.close();
  }
  // The number of sends is bounded whatever the caller asks: 1 to 10, 3 when it is not a whole number.
  for (const [attempts, sends] of [[Infinity, 3], [50, 10], [0, 1]] as const) {
    const s = await standIn((r) => (r.url.endsWith(':batch') ? 'drop' : null));
    try {
      await upload(authority(s.origin), job(), { pause_ms: 0, attempts });
      assert.equal(batches(s.seen).length, sends, `attempts ${attempts}`);
    } finally {
      await s.close();
    }
  }
});

type Ack = { contract_version: string; batch_id: string; user_id: string; device_id: string; session_id: string; stream_id: string; acknowledged: Array<Record<string, unknown> & { artifacts: Array<Record<string, unknown>> }> };
/** The ACK the released Backend gives for a batch: every record committed, every artifact verified. */
const ackFor = (b: { batch_id: string; device_id: string; session_id: string; stream_id: string; records: Array<{ record_id: string; sequence: number; artifacts: object[] }> }): Ack => ({
  contract_version: '0.2.0', batch_id: b.batch_id, user_id: meta.plan.source.user_id, device_id: b.device_id, session_id: b.session_id, stream_id: b.stream_id,
  acknowledged: b.records.map((r) => ({ record_id: r.record_id, sequence: r.sequence, disposition: 'accepted', received_at: '2026-09-30T17:00:00Z', envelope: 'committed', artifacts: r.artifacts.map((a) => ({ ...a, status: 'verified' })) })),
});

test('typed refusals of the released contract end the upload and are not retried', async () => {
  const cases: Array<[string, Fault, string, RegExp]> = [
    ['401 on an original', (r) => (r.method === 'PUT' ? typed(401, 'unauthenticated') : null), 'original', /401 unauthenticated/],
    ['403 after Stop', (r) => (r.method === 'PUT' ? typed(403, 'forbidden') : null), 'original', /403 forbidden/],
    ['422 on an original', (r) => (r.method === 'PUT' ? typed(422, 'invalid_request') : null), 'original', /422 invalid_request/],
    ['capture stopped at the batch', (r) => (r.url.endsWith(':batch') ? typed(409, 'capture_stopped', '0.2.10') : null), 'batch', /409 capture_stopped/],
    ['not found at the batch', (r) => (r.url.endsWith(':batch') ? typed(404, 'not_found', '0.2.10') : null), 'batch', /404 not_found/],
  ];
  for (const [what, fault, stage, why] of cases) {
    const s = await standIn(fault);
    try {
      const result = await upload(authority(s.origin), job(), { pause_ms: 5 });
      assert.equal(result.status, 'refused', what);
      assert.equal(result.status === 'refused' && result.stage, stage, what);
      assert.match(result.status === 'refused' ? result.reason : '', why);
      const hits = stage === 'batch' ? batches(s.seen).length : puts(s.seen).length;
      assert.equal(hits, 1, `${what}: not retried`);
      assert.equal(result.status === 'refused' && result.error, (/\d+ (\w+)/.exec(String(why)) ?? [])[1], 'the released code is kept');
      if (stage === 'original') assert.equal(batches(s.seen).length, 0, 'no batch after a refused original');
    } finally {
      await s.close();
    }
  }
  // 409 dependency_missing is not a refusal: the same job can be sent again later.
  const missing = await standIn((r) => (r.url.endsWith(':batch') ? typed(409, 'dependency_missing', '0.2.10') : null));
  try {
    const result = await upload(authority(missing.origin), job(), { pause_ms: 5 });
    assert.deepEqual([result.status, result.status === 'unknown' && result.stage, batches(missing.seen).length], ['unknown', 'batch', 1]);
  } finally {
    await missing.close();
  }
});

test('an answer that is not believed (a redirect, which is not followed, a 200 that does not correspond, any reply not of the released contract) leaves the send in doubt: the same bytes again, then unknown', async () => {
  const cases: Array<[string, { status: number; body?: unknown; headers?: Record<string, string> }, RegExp]> = [
    ['a redirect', { status: 307, headers: { Location: 'http://127.0.0.1:9/elsewhere' } }, /redirect \(307\), which is not followed/],
    ['a 200 that is not JSON', { status: 200 }, /answered 200, but it is not JSON/],
    ['a 200 that is not its receipt', { status: 200, body: { status: 'bytes_committed' } }, /answered 200, but its receipt is not exactly its original, bytes_committed/],
    ['a 500', { status: 500, body: 'Internal Server Error' }, /answered 500, which is not a reply of the released contract/],
    ['a 403 without the contract version', { status: 403, body: { error: 'forbidden', retryable: false } }, /answered 403, which is not a reply/],
    ['a 403 with a code not released for it', { status: 403, body: { contract_version: '0.2.4', error: 'capture_stopped', retryable: false } }, /answered 403, which is not a reply/],
    ['a 409 claiming to be retryable', { status: 409, body: { contract_version: '0.2.4', error: 'capture_stopped', retryable: true } }, /answered 409, which is not a reply/],
    ['a 403 in another contract version than the route\'s', typed(403, 'forbidden', '0.2.10'), /answered 403, which is not a reply/],
    ['a typed 503', typed(503, 'unavailable'), /answered 503 unavailable/],
  ];
  for (const [what, answer, why] of cases) {
    const s = await standIn((r) => (r.method === 'PUT' ? answer : null));
    try {
      const result = await upload(authority(s.origin), job(), { pause_ms: 1 });
      const first = JSON.parse(s.seen[0]!.body).artifact.artifact_id as string;
      assert.deepEqual(shape(result), ['unknown', 'original', first, 0], what);
      assert.equal(result.status === 'unknown' && result.http_status, answer.status, what);
      assert.match(result.status === 'unknown' ? result.reason : '', why, what);
      assert.equal(puts(s.seen).length, 3, `${what}: the same original sent again, up to the bound`);
      assert.equal(new Set(puts(s.seen).map((r) => r.body)).size, 1, `${what}: the same bytes`);
      assert.equal(batches(s.seen).length, 0);
    } finally {
      await s.close();
    }
  }
  // On the batch, a refusal in the originals route's version is not the batch route's reply either.
  const foreign = await standIn((r) => (r.url.endsWith(':batch') ? typed(409, 'capture_stopped', '0.2.4') : null));
  try {
    const result = await upload(authority(foreign.origin), job(), { pause_ms: 1 });
    assert.deepEqual([...shape(result), batches(foreign.seen).length], ['unknown', 'batch', 'batch', 7, 3]);
  } finally {
    await foreign.close();
  }
  // A first 200 that does not correspond may follow a commit: sent again, the true receipt and ACK are committed.
  const once = new Set<string>();
  const garbled = await standIn((r) => {
    const key = r.method === 'PUT' ? JSON.parse(r.body).artifact.artifact_id : 'batch';
    if (once.has(key) || (r.method === 'PUT' && once.size > 0)) return null;
    once.add(key);
    return { status: 200, body: { garbled: true } };
  });
  try {
    const result = await upload(authority(garbled.origin), job(), { pause_ms: 1 });
    assert.deepEqual(shape(result), ['committed', null, undefined, 7]);
    assert.equal(puts(garbled.seen).length, 8, 'the first original twice');
    assert.equal(garbled.seen[0]!.body, garbled.seen[1]!.body);
  } finally {
    await garbled.close();
  }
  const garbledAck = await standIn((r) => (r.url.endsWith(':batch') && batches(garbledAck.seen).length === 1 ? { status: 200, body: { ...ackFor(JSON.parse(r.body).batch), acknowledged: [] } } : null));
  try {
    const result = await upload(authority(garbledAck.origin), job(), { pause_ms: 1 });
    assert.deepEqual(shape(result), ['committed', null, undefined, 7]);
    const [a, b] = batches(garbledAck.seen);
    assert.deepEqual([a!.body === b!.body, a!.headers['idempotency-key'] === b!.headers['idempotency-key']], [true, true]);
  } finally {
    await garbledAck.close();
  }
});

test('an ACK is believed only when it answers exactly the batch sent; one that does not leaves the batch in doubt', async () => {
  const sent = job().prepared.request;
  const good = () => JSON.parse(JSON.stringify(ackFor(sent.batch))) as Ack;
  assert.equal(ackProblem(sent, good(), meta.plan.source), null);
  const first = (a: Ack) => a.acknowledged[0]!;
  const deviations: Array<[string, (a: Ack) => void]> = [
    ['another contract version', (a) => (a.contract_version = '0.2.1')],
    ['a member the contract does not have', (a) => Object.assign(a, { note: 'x' })],
    ['another batch', (a) => (a.batch_id = 'other-batch')],
    ['another device', (a) => (a.device_id = 'other-device')],
    ['another session', (a) => (a.session_id = 'other-session')],
    ['another stream', (a) => (a.stream_id = 'other-stream')],
    ['another owner', (a) => (a.user_id = 'other-user')],
    ['a record missing', (a) => a.acknowledged.pop()],
    ['a record twice', (a) => (a.acknowledged[3] = a.acknowledged[0]!)],
    ['a record not sent', (a) => (first(a).record_id = 'other-record')],
    ['a shifted sequence', (a) => (first(a).sequence = (first(a).sequence as number) + 1)],
    ['an envelope not committed', (a) => (first(a).envelope = 'pending')],
    ['a disposition not accepted', (a) => (first(a).disposition = 'rejected')],
    ['a received_at that is not a UTC time', (a) => (first(a).received_at = 'not-a-time')],
    ['a received_at on a day that does not exist', (a) => (first(a).received_at = '2026-02-30T17:00:00Z')],
    ['a receipt member the contract does not have', (a) => (first(a).note = 'x')],
    ['one artifact listed twice in place of another', (a) => (first(a).artifacts = [first(a).artifacts[0]!, first(a).artifacts[0]!])],
    ['an artifact missing', (a) => first(a).artifacts.pop()],
    ['an artifact with other bytes', (a) => (first(a).artifacts[1]!.sha256 = '0'.repeat(64))],
    ['an artifact pending', (a) => (first(a).artifacts[1]!.status = 'pending')],
    ['an artifact member the contract does not have', (a) => (first(a).artifacts[0]!.note = 'x')],
  ];
  for (const [what, change] of deviations) {
    const a = good();
    change(a);
    assert.notEqual(ackProblem(sent, a, meta.plan.source), null, what);
  }
  // The released UtcTimestamp: RFC 3339 in UTC, a real date and time, any fraction.
  for (const t of ['2026-09-30T17:00:00Z', '2026-09-30T17:00:00.123456Z', '2024-02-29T00:00:00Z', '2000-02-29T23:59:59.9Z', '2026-09-30t17:00:00Z', '2026-12-31T23:59:59Z']) {
    assert.equal(isUtcTimestamp(t), true, t);
  }
  for (const t of ['2026-02-30T17:00:00Z', '2023-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '0000-01-01T00:00:00Z', '2026-04-31T00:00:00Z', '2026-13-01T00:00:00Z', '2026-00-10T00:00:00Z', '2026-09-00T00:00:00Z', '2026-09-30T24:00:00Z', '2026-09-30T23:60:00Z', '2026-09-30T23:59:60Z', '2026-09-30T17:00:00+00:00', '2026-09-30T17:00:00z', '2026-09-30T17:00Z', '2026-09-30 17:00:00Z', '2026-09-30T17:00:00.Z', 20260930]) {
    assert.equal(isUtcTimestamp(t), false, String(t));
  }
  // Through HTTP: an ACK listing one artifact twice is not believed; the batch is sent again, then in doubt.
  const twice = await standIn((r) => {
    if (!r.url.endsWith(':batch')) return null;
    const a = ackFor(JSON.parse(r.body).batch);
    for (const x of a.acknowledged) x.artifacts = x.artifacts.map(() => x.artifacts[0]!);
    return { status: 200, body: a };
  });
  try {
    const result = await upload(authority(twice.origin), job(), { pause_ms: 1 });
    assert.deepEqual([...shape(result), batches(twice.seen).length], ['unknown', 'batch', 'batch', 7, 3]);
    assert.match(result.status === 'unknown' ? result.reason : '', /the ACK does not answer the batch sent: .*does not list exactly its artifacts/);
  } finally {
    await twice.close();
  }
});

test('an original is counted only on a receipt that is exactly it, bytes_committed; otherwise it is in doubt, and no batch is sent', async () => {
  const receipts: Array<[string, (x: Record<string, unknown>) => unknown]> = [
    ['pending', (x) => ({ ...x, status: 'pending' })],
    ['another artifact', (x) => ({ ...x, artifact: { ...(x['artifact'] as object), sha256: '0'.repeat(64) } })],
    ['another source', (x) => ({ ...x, source: { ...(x['source'] as object), source_version: 2 } })],
    ['another kind', (x) => ({ ...x, kind: 'editable_ink' })],
    ['a member the contract does not have', (x) => ({ ...x, note: 'x' })],
    ['a null source', (x) => ({ ...x, source: null })],
    ['a null artifact', (x) => ({ ...x, artifact: null })],
    ['not an object', () => 'bytes_committed'],
  ];
  for (const [what, make] of receipts) {
    const s = await standIn((r) => {
      if (r.method !== 'PUT') return null;
      const { data_base64: _d, ...x } = JSON.parse(r.body) as Record<string, unknown>;
      return { status: 200, body: make({ ...x, status: 'bytes_committed' }) };
    });
    try {
      const result = await upload(authority(s.origin), job(), { pause_ms: 1 });
      const first = JSON.parse(s.seen[0]!.body).artifact.artifact_id as string;
      assert.deepEqual([...shape(result), puts(s.seen).length, batches(s.seen).length], ['unknown', 'original', first, 0, 3, 0], what);
      assert.match(result.status === 'unknown' ? result.reason : '', /its receipt is not exactly its original, bytes_committed/, what);
    } finally {
      await s.close();
    }
  }
});

test('a send without a believable answer may have arrived: a later refusal, expiry or cancellation leaves it unknown, named in doubt, and not resumed', async () => {
  // The batch answer is lost, then Stop: 409 capture_stopped does not say whether the first send was committed.
  const stopped = await standIn((r) => (r.url.endsWith(':batch') ? (batches([r]).length && stopped.seen.filter((x) => x.url.endsWith(':batch')).length === 1 ? 'drop' : typed(409, 'capture_stopped', '0.2.10')) : null));
  try {
    const result = await upload(authority(stopped.origin), job(), { pause_ms: 5 });
    assert.equal(result.status, 'unknown');
    if (result.status !== 'unknown') return;
    assert.deepEqual([result.stage, result.in_doubt, result.http_status, result.error, result.originals.length, batches(stopped.seen).length], ['batch', 'batch', 409, 'capture_stopped', 7, 2]);
    assert.match(result.reason, /sent without a believable answer, then refused: 409 capture_stopped; whether it arrived is not known, and it is not resumed here/);
  } finally {
    await stopped.close();
  }
  // An original's answer is lost, then 403: unknown at that original, which is not counted as committed.
  const forbidden = await standIn((r, n) => (r.method === 'PUT' ? (n === 1 ? 'drop' : typed(403, 'forbidden')) : null));
  try {
    const result = await upload(authority(forbidden.origin), job(), { pause_ms: 5 });
    const first = JSON.parse(forbidden.seen[0]!.body).artifact.artifact_id as string;
    assert.deepEqual([result.status, result.status === 'unknown' && result.stage, result.status === 'unknown' && result.in_doubt, result.originals, puts(forbidden.seen).length, batches(forbidden.seen).length], ['unknown', 'original', first, [], 2, 0]);
  } finally {
    await forbidden.close();
  }
  // 503, then 403: the 503 did not say the original was not taken, so the outcome stays unknown.
  const busy = await standIn((r, n) => (r.method === 'PUT' ? (n === 1 ? typed(503, 'unavailable') : typed(403, 'forbidden')) : null));
  try {
    const result = await upload(authority(busy.origin), job(), { pause_ms: 1 });
    assert.deepEqual([...shape(result), result.status === 'unknown' && result.error, puts(busy.seen).length], ['unknown', 'original', JSON.parse(busy.seen[0]!.body).artifact.artifact_id, 0, 'forbidden', 2]);
  } finally {
    await busy.close();
  }
  // The batch answer is lost, and the bearer expires before it can be sent again: unknown, not a refusal.
  const late = await standIn((r) => (r.url.endsWith(':batch') ? 'drop' : null));
  try {
    const result = await upload(authority(late.origin), job(), { pause_ms: 5, now: () => (batches(late.seen).length ? Date.now() + 3_600_000 : Date.now()) });
    assert.deepEqual([result.status, result.status === 'unknown' && result.in_doubt, batches(late.seen).length], ['unknown', 'batch', 1]);
    assert.match(result.status === 'unknown' ? result.reason : '', /bearer expired before it could be sent again/);
  } finally {
    await late.close();
  }
  // Cancelled while the batch is being answered: cancelled, with the batch in doubt.
  const control = new AbortController();
  const held = await standIn((r) => (r.url.endsWith(':batch') ? (control.abort(), 'hold') : null));
  try {
    const result = await upload(authority(held.origin), job(), { signal: control.signal });
    assert.deepEqual([result.status, result.status === 'cancelled' && result.stage, result.status === 'cancelled' && result.in_doubt, result.originals.length], ['cancelled', 'batch', 'batch', 7]);
    held.held.forEach((release) => release());
  } finally {
    await held.close();
  }
  // Without an earlier unanswered send, the expiry before a request is a refusal.
  const expiring = await standIn();
  try {
    const result = await upload(authority(expiring.origin), job(), { now: () => (puts(expiring.seen).length ? Date.now() + 3_600_000 : Date.now()) });
    assert.deepEqual([result.status, result.status === 'refused' && result.stage, result.originals.length, puts(expiring.seen).length], ['refused', 'original', 1, 1]);
    assert.match(result.status === 'refused' ? result.reason : '', /bearer has expired/);
  } finally {
    await expiring.close();
  }
});

test('cancellation stops at once: no batch, nothing local removed, the originals already committed listed', async () => {
  const s = await standIn((r, n) => (r.method === 'PUT' && n === 2 ? 'hold' : null));
  try {
    const control = new AbortController();
    const before = digest(CAPTURE);
    const running = upload(authority(s.origin), job(), { signal: control.signal });
    await new Promise<void>((r) => {
      const t = setInterval(() => puts(s.seen).length >= 2 && (clearInterval(t), r()), 5);
    });
    const at = performance.now();
    control.abort();
    const result = await running;
    assert.ok(performance.now() - at < 250, 'at once, not after a retry pause (500 ms by default)');
    assert.deepEqual([result.status, result.status === 'cancelled' && result.stage], ['cancelled', 'original']);
    assert.equal(result.originals.length, 1, 'the one committed before');
    assert.equal(result.status === 'cancelled' && result.in_doubt, JSON.parse(s.seen[1]!.body).artifact.artifact_id, 'the original being sent is in doubt');
    assert.equal(batches(s.seen).length, 0);
    assert.equal(digest(CAPTURE), before);
    s.held.forEach((release) => release());
  } finally {
    await s.close();
  }
  // Cancelled once the last original's receipt has come: no batch is sent.
  const after = await standIn();
  const control = new AbortController();
  const fetched = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await fetched(...args);
    const text = await res.text();
    if (puts(after.seen).length === 7) control.abort();
    return new Response(text, { status: res.status, headers: res.headers });
  };
  try {
    const result = await upload(authority(after.origin), job(), { signal: control.signal });
    assert.deepEqual([result.status, result.status === 'cancelled' && result.stage, result.status === 'cancelled' && result.in_doubt, result.originals.length, batches(after.seen).length], ['cancelled', 'batch', undefined, 7, 0]);
  } finally {
    globalThis.fetch = fetched;
    await after.close();
  }
});

test('an original changed after the check, before it is sent, is refused and never sent', async () => {
  const dir = copyCapture();
  const s = await standIn((r, n) => {
    if (n !== 1) return null;
    const sending = JSON.parse(r.body).artifact.sha256 as string;
    for (const f of fs.readdirSync(path.join(dir, 'ink')).filter((f) => !f.startsWith(sending))) {
      const b = fs.readFileSync(path.join(dir, 'ink', f));
      b[10] = b[10]! ^ 1;
      fs.writeFileSync(path.join(dir, 'ink', f), b);
    }
    return null;
  });
  try {
    const result = await upload(authority(s.origin), job(dir));
    assert.deepEqual([result.status, result.status === 'refused' && result.stage, batches(s.seen).length], ['refused', 'original', 0]);
    assert.match(result.status === 'refused' ? result.reason : '', /does not have its SHA-256; nothing is sent for it/);
    for (const r of puts(s.seen)) {
      const u = JSON.parse(r.body);
      assert.equal(crypto.createHash('sha256').update(Buffer.from(u.data_base64, 'base64')).digest('hex'), u.artifact.sha256, 'only the bytes checked are sent');
    }
  } finally {
    await s.close();
  }
});

test('no text from the network reaches a result: a bearer reflected in an error, in a body that is not JSON, or in a failure', async () => {
  const pieces = (r: UploadResult) => {
    const text = JSON.stringify(r);
    for (let i = 0; i + 12 <= TOKEN.length; i++) assert.equal(text.includes(TOKEN.slice(i, i + 12)), false, 'not even a piece of the bearer');
  };
  const cases: Array<[string, { status: number; body?: unknown; raw?: string }]> = [
    ['a 403 whose error is the bearer', { status: 403, body: { contract_version: '0.2.10', error: TOKEN, retryable: false } }],
    ['a 401 whose error quotes the bearer', { status: 401, body: { contract_version: '0.2.10', error: `unauthenticated ${TOKEN}`, retryable: false } }],
    ['a 200 that is not JSON and quotes the bearer', { status: 200, raw: `{"status": "${TOKEN}` }],
    ['a 500 that is the bearer', { status: 500, raw: TOKEN }],
  ];
  for (const [what, answer] of cases) {
    const s = await standIn((r) => (r.method === 'PUT' ? answer : null));
    try {
      const result = await upload(authority(s.origin), job(), { pause_ms: 1 });
      assert.equal(result.status, 'unknown', what);
      assert.equal('error' in result ? result.error : undefined, undefined, `${what}: no error code that was not released`);
      pieces(result);
    } finally {
      await s.close();
    }
  }
  // A failure whose message and code carry the bearer: only a short, well-formed code is kept.
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Object.assign(new TypeError(`fetch failed ${TOKEN}`), { cause: Object.assign(new Error(TOKEN), { code: TOKEN.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }) });
  };
  try {
    const result = await upload(authority('http://127.0.0.1:9'), job(), { pause_ms: 1 });
    assert.equal(result.status, 'unknown');
    assert.match(result.status === 'unknown' ? result.reason : '', /no answer \(other\)/);
    pieces(result);
  } finally {
    globalThis.fetch = fetched;
  }
});

test('a valid bearer of any allowed length or case never enters a result through a failure code or an error name; the fixed codes are kept', async () => {
  const bearers = [
    'A'.repeat(32),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345_',
    `ECONNRESET${'X'.repeat(31)}`,
    `${'Z'.repeat(40)}_`,
    'AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEf',
    crypto.randomBytes(48).toString('base64url'),
  ];
  const fetched = globalThis.fetch;
  try {
    for (const bearer of bearers) {
      // As a failed request's cause code (and message).
      globalThis.fetch = async () => {
        throw Object.assign(new TypeError(`fetch failed ${bearer}`), { cause: Object.assign(new Error(bearer), { code: bearer }) });
      };
      const failed = await uploadRetained(authority('http://127.0.0.1:9', { token: bearer }), job(), { pause_ms: 0 });
      assert.equal(JSON.stringify(failed).includes(bearer), false, `cause code: ${bearer.length} characters`);
      assert.match(failed.status === 'unknown' ? failed.reason : '', /no answer \(other\)/);
      // As the name of an unexpected local error after the first original was committed.
      globalThis.fetch = fetched;
      const s = await standIn();
      try {
        let calls = 0;
        const errored = await uploadRetained(authority(s.origin, { token: bearer }), job(), { now: () => {
          if (++calls === 3) throw Object.assign(new Error('the clock failed'), { name: bearer });
          return Date.now();
        } });
        assert.equal(JSON.stringify(errored).includes(bearer), false, `error name: ${bearer.length} characters`);
        assert.match(errored.status === 'refused' ? errored.reason : '', /unexpected local error \(other\)/);
        assert.equal(errored.originals.length, 1);
      } finally {
        await s.close();
      }
    }
    // A fixed code is still named.
    globalThis.fetch = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) });
    };
    const reset = await upload(authority('http://127.0.0.1:9'), job(), { pause_ms: 0 });
    assert.match(reset.status === 'unknown' ? reset.reason : '', /no answer \(ECONNRESET\)/);
  } finally {
    globalThis.fetch = fetched;
  }
});

test('the caller\'s objects are copied at the start: changing them while the upload runs changes nothing sent or reported', async () => {
  const j = { ...job(copyCapture()), plan: structuredClone(meta.plan) };
  const a = authority('', { owner: { ...meta.plan.source } });
  const planned = [...new Set(j.prepared.request.batch.records.flatMap((r) => r.artifacts.map((x) => x.artifact_id)))];
  const body = j.prepared.body;
  const s = await standIn((r, n) => {
    if (n !== 1) return null;
    for (const e of j.plan.entries) {
      if (e.kind !== 'frame') continue;
      for (const b of [e.raw, e.composed, e.ink]) if (b) (b.artifact as { artifact_id: string }).artifact_id = 'never-planned';
    }
    Object.assign(j, { capture_dir: '/nonexistent' });
    Object.assign(j.prepared, { body: '{}', idempotency_key: 'other-key' });
    Object.assign(a, { token: `${'x'.repeat(40)}`, origin: 'http://127.0.0.1:9' });
    Object.assign(a.owner, { user_id: 'other-user' });
    return null;
  });
  Object.assign(a, { origin: s.origin });
  try {
    const result = await upload(a, j);
    assert.equal(result.status, 'committed');
    const sent = puts(s.seen).map((r) => JSON.parse(r.body).artifact.artifact_id as string);
    assert.deepEqual([...sent].sort(), [...planned].sort(), 'exactly the planned originals, each once');
    assert.deepEqual(result.originals, sent, 'the originals reported are the ones sent');
    assert.equal(batches(s.seen)[0]!.body, body);
    assert.ok(s.seen.every((r) => r.headers['authorization'] === `Bearer ${TOKEN}` && JSON.parse(r.body).source?.user_id !== 'other-user'));
  } finally {
    await s.close();
  }
});

test('an original swapped at its path after it was checked is not read: the bytes come from the file opened, which must be the file checked', async (t) => {
  // The uploader's own imports of node:fs are rebound for these cases (and restored): a controlled interleaving.
  const cjs = createRequire(import.meta.url)('node:fs') as typeof fs;
  const native = { realpathSync: cjs.realpathSync, openSync: cjs.openSync, readFileSync: cjs.readFileSync, lstatSync: cjs.lstatSync, fstatSync: cjs.fstatSync, closeSync: cjs.closeSync };
  type Case = {
    what: string;
    /** Called with the copy, its first original's path and how many times that path was checked, opened and read. */
    hooks: (dir: string, target: string) => { checked?: (n: number) => void; opening?: (n: number) => void; opened?: (n: number) => void; read?: (n: number) => void; stat?: (st: fs.BigIntStats) => fs.BigIntStats; noFollowOff?: boolean };
    expect: 'refused' | 'committed';
    /** Needs a symbolic link to a file. */
    fileLink?: true;
    /** The file is refused before the interleaving is reached. */
    before?: true;
  };
  let interleaved = false;
  const linkLeaf = (dir: string, target: string) => {
    fs.copyFileSync(target, `${dir}.outside.png`);
    fs.renameSync(target, `${dir}.saved.png`);
    fs.symlinkSync(`${dir}.outside.png`, target);
    interleaved = true;
  };
  const linkFolder = (dir: string) => {
    const frames = path.join(dir, 'frames');
    if (!fs.existsSync(`${dir}.outside-frames`)) fs.cpSync(frames, `${dir}.outside-frames`, { recursive: true });
    fs.renameSync(frames, `${dir}.saved-frames`);
    linkDir(`${dir}.outside-frames`, frames);
    interleaved = true;
  };
  const unlinkFolder = (dir: string) => {
    fs.unlinkSync(path.join(dir, 'frames'));
    fs.renameSync(`${dir}.saved-frames`, path.join(dir, 'frames'));
  };
  let replaced: string | null = null;
  // Each original is checked, opened and read once before anything is sent (n = 1), then again just before its send (n = 2).
  const cases: Case[] = [
    { what: 'a link to an outside copy put in place of the file right after its check', hooks: (dir, t) => ({ checked: (n) => n === 2 && linkLeaf(dir, t) }), expect: 'refused', fileLink: true },
    { what: 'the same, where opening follows links (as on Windows)', hooks: (dir, t) => ({ checked: (n) => n === 2 && linkLeaf(dir, t), noFollowOff: true }), expect: 'refused', fileLink: true },
    { what: 'its folder made a link to an outside copy right after the check', hooks: (dir) => ({ checked: (n) => n === 2 && linkFolder(dir) }), expect: 'refused' },
    { what: 'its folder a link to an outside copy only while it is opened and read', hooks: (dir) => ({ opening: (n) => n === 2 && linkFolder(dir), read: (n) => n === 2 && unlinkFolder(dir) }), expect: 'refused' },
    { what: 'a file with other bytes renamed over its path once it is opened (the bytes read are the file opened)', hooks: (dir, t) => ({ opened: (n) => {
      if (n !== 2) return;
      const other = fs.readFileSync(t);
      other[other.length - 20] = other[other.length - 20]! ^ 1;
      fs.writeFileSync(`${dir}.other.png`, other);
      interleaved = true;
      try {
        fs.renameSync(`${dir}.other.png`, t);
        replaced = 'renamed';
      } catch (error) {
        replaced = (error as NodeJS.ErrnoException).code ?? 'error';
      }
    } }), expect: 'committed' },
    { what: 'the file grown after its check', hooks: (dir, t) => ({ checked: (n) => {
      if (n !== 2) return;
      fs.appendFileSync(t, 'more');
      interleaved = true;
    } }), expect: 'refused' },
    { what: 'a file system that gives no file identity, with its folder made a link outside after the check', hooks: (dir) => ({ checked: (n) => n === 2 && linkFolder(dir), stat: (st) => Object.assign(Object.create(Object.getPrototypeOf(st)), st, { dev: 0n, ino: 0n }) }), expect: 'refused', before: true },
  ];
  for (const c of cases) {
    await t.test(c.what, { skip: c.fileLink && !fileLinks ? NO_FILE_LINKS : false }, async () => {
      interleaved = false;
      const dir = copyCapture();
      const j = job(dir);
      const first = j.plan.entries.find((e) => e.kind === 'frame')!;
      const target = path.join(dir, 'frames', `${first.kind === 'frame' ? first.raw.artifact.sha256 : ''}.png`);
      const h = c.hooks(dir, target);
      const count = { checked: 0, opening: 0, read: 0 };
      let fdOfTarget = -1;
      cjs.realpathSync = Object.assign((p: fs.PathLike, o?: never) => {
        const real = native.realpathSync(p, o);
        if (String(p) === target) h.checked?.(++count.checked);
        return real;
      }, { native: native.realpathSync.native }) as unknown as typeof fs.realpathSync;
      Object.assign(cjs, {
        lstatSync: (p: fs.PathLike, o?: never) => {
          const st = native.lstatSync(p, o);
          return String(p) === target && h.stat && st ? h.stat(st as unknown as fs.BigIntStats) : st;
        },
        fstatSync: (fd: number, o?: never) => {
          const st = native.fstatSync(fd, o);
          return fd === fdOfTarget && h.stat ? h.stat(st as unknown as fs.BigIntStats) : st;
        },
      });
      cjs.openSync = ((p: fs.PathLike, flags: number, mode?: number) => {
        if (String(p) === target) count.opening++;
        if (String(p) === target) h.opening?.(count.opening);
        const fd = native.openSync(p, h.noFollowOff ? flags & ~(fs.constants.O_NOFOLLOW ?? 0) : flags, mode);
        if (String(p) === target) fdOfTarget = fd;
        else if (fd === fdOfTarget) fdOfTarget = -1; // the number was reused by another file
        if (String(p) === target) {
          try {
            h.opened?.(count.opening);
          } catch (error) {
            native.closeSync(fd); // only the handle this wrapper opened
            fdOfTarget = -1;
            throw error;
          }
        }
        return fd;
      }) as typeof fs.openSync;
      cjs.readFileSync = ((p: fs.PathOrFileDescriptor, o?: never) => {
        const data = native.readFileSync(p, o);
        if (p === fdOfTarget) h.read?.(++count.read);
        return data;
      }) as typeof fs.readFileSync;
      syncBuiltinESMExports();
      const s = await standIn();
      try {
        const result = await upload(authority(s.origin), j);
        assert.equal(result.status, c.expect, `${c.what}: ${JSON.stringify(result)}`);
        if (!c.before) assert.equal(interleaved, true, `${c.what}: the interleaving happened`);
        // Where the rename was tried over the open file: POSIX replaces the name; Windows refuses to replace a file while
        // it is open (EPERM, established on Windows Node 24.21), so there the path cannot name another file meanwhile.
        if (c.expect === 'committed') assert.equal(replaced, process.platform === 'win32' ? 'EPERM' : 'renamed', `${c.what}: the replacement was tried`);
        if (c.expect === 'refused') assert.equal(puts(s.seen).length, 0, `${c.what}: nothing sent`);
        for (const r of puts(s.seen)) {
          const u = JSON.parse(r.body);
          assert.equal(crypto.createHash('sha256').update(Buffer.from(u.data_base64, 'base64')).digest('hex'), u.artifact.sha256, `${c.what}: only the bytes checked are sent`);
        }
      } finally {
        Object.assign(cjs, native);
        syncBuiltinESMExports();
        await s.close();
      }
    });
  }
});

test('a pipe put in place of an original after its check is not waited on: it is opened without blocking and refused', { skip: process.platform === 'win32' }, () => {
  // In a child process with a time limit, so that an open that blocks fails here instead of stopping the suite.
  const dir = copyCapture();
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    import crypto from 'node:crypto';
    import { spawnSync } from 'node:child_process';
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    const c = JSON.parse(process.env.LC_PIPE_CASE);
    const { uploadRetained } = await import(c.uploader);
    const { frameRequest } = await import(c.ingress);
    const meta = JSON.parse(fs.readFileSync(c.fixture, 'utf8'));
    const manifest = fs.readFileSync(c.evidence + meta.manifest, 'utf8').replace(/\\r\\n/g, '\\n');
    const job = { capture_dir: c.dir, plan: meta.plan, prepared: frameRequest(manifest, meta.plan) };
    const target = path.join(c.dir, 'frames', meta.plan.entries.find((e) => e.kind === 'frame').raw.artifact.sha256 + '.png');
    const cjs = createRequire(path.join(c.dir, 'x.js'))('node:fs');
    const real = cjs.realpathSync;
    let n = 0;
    cjs.realpathSync = Object.assign((p, o) => {
      const r = real(p, o);
      if (String(p) === target && ++n === 2) {
        fs.renameSync(target, c.dir + '.saved.png');
        if (spawnSync('mkfifo', [target]).status !== 0) throw new Error('mkfifo');
      }
      return r;
    }, { native: real.native });
    syncBuiltinESMExports();
    globalThis.fetch = async () => { throw new Error('nothing is to be sent'); };
    const incarnation = { device_id: meta.plan.device_id, session_id: meta.plan.session_id, stream_id: meta.plan.stream_id };
    const result = await uploadRetained({ origin: 'http://127.0.0.1:9', token: crypto.randomBytes(36).toString('base64url'), expires_at: new Date(Date.now() + 600000).toISOString(), owner: meta.plan.source, incarnation }, job);
    process.stdout.write(JSON.stringify({ swapped: n >= 2, result }));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, LC_PIPE_CASE: JSON.stringify({ dir, fixture: FIXTURE, evidence: EVIDENCE, uploader: new URL('../src/main/uploader.ts', import.meta.url).href, ingress: new URL('../src/shared/frame-ingress.ts', import.meta.url).href }) },
  });
  assert.equal(run.signal, null, `it did not block (stopped by the time limit: ${run.signal}) ${run.stderr}`);
  const out = JSON.parse(run.stdout) as { swapped: boolean; result: UploadResult };
  assert.equal(out.swapped, true);
  assert.deepEqual([out.result.status, 'stage' in out.result && out.result.stage, out.result.originals.length], ['refused', 'original', 0]);
});

test('the options are read once, and an unexpected error after sends still ends in a result with what was committed', async () => {
  let reads = 0;
  const never = await standIn((r) => (r.url.endsWith(':batch') ? 'drop' : null));
  try {
    const options = { pause_ms: 0, get attempts() {
      reads++;
      return reads === 1 ? 5 : Infinity;
    } };
    await upload(authority(never.origin), job(), options);
    assert.deepEqual([reads, batches(never.seen).length], [1, 5]);
  } finally {
    await never.close();
  }
  // The caller's clock fails before the third original: nothing more is sent, the two committed are listed.
  const s = await standIn();
  try {
    let calls = 0;
    const result = await upload(authority(s.origin), job(), { now: () => {
      if (++calls === 4) throw new Error('the clock failed');
      return Date.now();
    } });
    assert.deepEqual([...shape(result), puts(s.seen).length, batches(s.seen).length], ['refused', 'original', undefined, 2, 2, 0]);
    assert.match(result.status === 'refused' ? result.reason : '', /stopped by an unexpected local error \(Error\); nothing more is sent/);
  } finally {
    await s.close();
  }
});

test('nothing is sent unless the origin, bearer, owner, incarnation and every original check out', async (t) => {
  const s = await standIn();
  try {
    const refused = async (a: UploadAuthority, j: UploadJob, why: RegExp, label = String(why)) => {
      const result = await upload(a, j);
      assert.equal(result.status, 'refused', `${label}: ${JSON.stringify(result)}`);
      assert.equal(result.status === 'refused' && result.stage, 'local', label);
      assert.match(result.status === 'refused' ? result.reason : '', why, label);
    };
    const port = new URL(s.origin).port; // the stand-in's own port, so only the scheme or host refuses these
    for (const origin of [`https://127.0.0.1:${port}`, `http://localhost:${port}`, `http://example.com:${port}`, `http://10.0.0.1:${port}`, `http://127.0.0.2:${port}`, `http://0x7f.0.0.1:${port}`, `http://[::ffff:127.0.0.1]:${port}`, 'http://127.0.0.1', 'http://127.0.0.1:80', `http://u:p@127.0.0.1:${port}`, `http://127.0.0.1:${port}/api`, `http://127.0.0.1:${port}?q`, 'not a url']) {
      await refused(authority(origin), job(), origin === 'not a url' ? /not a URL/ : /only an http origin on the loopback interface/, `origin ${origin}`);
    }
    await refused(authority(s.origin, { token: 'short' }), job(), /bearer is malformed/);
    await refused(authority(s.origin, { expires_at: new Date(Date.now() - 1000).toISOString() }), job(), /bearer has expired/);
    for (const expires_at of ['2099-02-30T17:00:00Z', '2099-01-01T00:00:00', '2099-01-01', '2099-01-01T00:00:00+05:00', 'Thu, 01 Jan 2099 00:00:00 GMT']) {
      await refused(authority(s.origin, { expires_at }), job(), /expiry is not a UTC timestamp/, `expiry ${expires_at}`);
    }
    await refused(authority(s.origin, { incarnation: { device_id: 'other', session_id: meta.plan.session_id, stream_id: meta.plan.stream_id } }), job(), /another capture incarnation/);
    await refused(authority(s.origin, { owner: { ...meta.plan.source, source_version: 2 } }), job(), /another owner or source/);
    await refused(authority(s.origin, { token: `${TOKEN}\r\nX-Other: 1` }), job(), /bearer is malformed/);
    const j = job();
    const withRequest = (request: typeof j.prepared.request): UploadJob => ({ ...j, prepared: { ...j.prepared, request, body: JSON.stringify(request) } });
    const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
    type Plan = { idempotency_key: string; entries: Array<Record<string, any>> }; // a copy to change
    const withPlan = (change: (p: Plan) => void): UploadJob => {
      const plan = clone(meta.plan) as unknown as Plan;
      change(plan);
      return { ...j, plan: plan as unknown as IngressPlan };
    };
    await refused(authority(s.origin), { ...j, prepared: { ...j.prepared, body: j.prepared.body.replace(j.prepared.request.batch.batch_id, 'other-batch') } }, /not the prepared request/);
    await refused(authority(s.origin), { ...j, prepared: { ...j.prepared, idempotency_key: 'other-key' } }, /Idempotency-Key is not the plan's, or malformed/);
    await refused(authority(s.origin), { ...withPlan((p) => (p.idempotency_key = 'bad key!')), prepared: { ...j.prepared, idempotency_key: 'bad key!' } }, /Idempotency-Key is not the plan's, or malformed/);
    await refused(authority(s.origin), { ...j, prepared: { ...j.prepared, body: `${j.prepared.body}${' '.repeat(4 * 1024 * 1024)}` } }, /not text of at most 4 MiB/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'] = null)), /artifact example-ink-7e2d667c44839eed of record example-harness-ink-record-1 has no original to send/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'] = p.entries[3]!['ink'])), /is not on record example-harness-ink-record-1/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'].source.source_version = 2)), /belongs to another source/);
    // One artifact ID for two originals: records 1 and 2 name their raw PNGs alike, with other bytes.
    const renamed = clone(j.prepared.request);
    const id = renamed.batch.records[0]!.artifacts[0]!.artifact_id;
    (renamed.batch.records[1]!.artifacts[0] as { artifact_id: string }).artifact_id = id;
    await refused(authority(s.origin), { ...withRequest(renamed), plan: withPlan((p) => {
      p.entries[1]!['raw'].artifact.artifact_id = id;
      p.entries[1]!['composed'].artifact.artifact_id = id;
    }).plan }, /names two originals/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'].kind = 'screen_image')), /is not a retained PNG or editable-ink original/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'].kind = '__proto__')), /is not a retained PNG or editable-ink original/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'].artifact.sha256 = '../../outside')), /is not a retained PNG or editable-ink original/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'].artifact.artifact_id = 'not an identifier \ud800')), /is not a retained PNG or editable-ink original/);
    await refused(authority(s.origin), withPlan((p) => (p.entries[0]!['ink'].artifact.byte_length = 33_554_433)), /is not a retained PNG or editable-ink original/);
    await refused(authority(s.origin), withPlan((p) => (p.entries = [null as never])), /the prepared job is malformed/);
    await refused(authority(s.origin), { ...j, capture_dir: path.relative(process.cwd(), j.capture_dir) }, /not an absolute path that resolves/);
    await refused(authority(s.origin), { ...j, plan: { ...j.plan, entries: [...j.plan.entries], extra: () => 1 } as unknown as IngressPlan }, /not plain data/);
    const ink = (dir: string) => path.join(dir, 'ink', fs.readdirSync(path.join(dir, 'ink'))[0]!);
    /**
     * Makes a file unreadable to this process for real, checks that it is, and returns what releases it (also released
     * when the check fails). On POSIX its permissions are removed: it cannot be opened (EACCES). On Windows, where chmod
     * only sets the read-only attribute, its every byte is locked (lockWhole): it still opens, with its identity and
     * length unchanged, but a read of the opened file fails (EBUSY). Released, it reads back as exactly its bytes.
     */
    const unreadable = async (file: string): Promise<() => void | Promise<void>> => {
      if (process.platform === 'win32') {
        const bytes = fs.readFileSync(file);
        const before = fs.lstatSync(file, { bigint: true });
        const release = await lockWhole(file);
        try {
          const fd = fs.openSync(file, 'r');
          try {
            const opened = fs.fstatSync(fd, { bigint: true });
            assert.deepEqual([opened.dev, opened.ino, opened.size], [before.dev, before.ino, BigInt(bytes.length)], 'precondition: the same file, whole');
            assert.throws(() => fs.readSync(fd, Buffer.alloc(bytes.length), 0, bytes.length, 0), { code: 'EBUSY' }, 'precondition: a read of the opened file is refused');
          } finally {
            fs.closeSync(fd);
          }
        } catch (error) {
          await release();
          throw error;
        }
        return async () => {
          await release();
          assert.deepEqual(fs.readFileSync(file), bytes, 'released: exactly its bytes');
        };
      }
      fs.chmodSync(file, 0o000);
      try {
        assert.throws(() => fs.readFileSync(file), { code: 'EACCES' }, 'precondition: reading the file is refused (so not run as root)');
      } catch (error) {
        fs.chmodSync(file, 0o644);
        throw error;
      }
      return () => fs.chmodSync(file, 0o644);
    };
    type Release = () => void | Promise<void>;
    const changes: Array<[string, (dir: string) => void | Release | Promise<Release>, RegExp, fileLink?: true]> = [
      ['other bytes', (dir) => {
        const f = ink(dir);
        const b = fs.readFileSync(f);
        b[10] = b[10]! ^ 1;
        fs.writeFileSync(f, b);
      }, /does not have its SHA-256/],
      ['cut short', (dir) => fs.writeFileSync(ink(dir), fs.readFileSync(ink(dir)).subarray(0, 50)), /has 50 bytes/],
      ['missing', (dir) => fs.rmSync(ink(dir)), /is not in the capture folder/],
      ['a link to a true copy', (dir) => {
        const f = ink(dir);
        const copy = `${dir}.copy`;
        fs.copyFileSync(f, copy);
        fs.rmSync(f);
        fs.symlinkSync(copy, f);
      }, /is not a regular file/, true],
      // POSIX: it cannot be opened; Windows: it opens, but cannot be read (read-denial, not open-denial).
      ['unreadable', (dir) => unreadable(ink(dir)), process.platform === 'win32' ? /cannot be read/ : /cannot be opened/],
      ['a directory', (dir) => {
        const f = ink(dir);
        fs.rmSync(f);
        fs.mkdirSync(f);
      }, /is not a regular file/],
      ['a folder outside the capture', (dir) => {
        const outside = `${dir}.outside`;
        fs.cpSync(path.join(dir, 'ink'), outside, { recursive: true });
        fs.rmSync(path.join(dir, 'ink'), { recursive: true });
        linkDir(outside, path.join(dir, 'ink'));
      }, /is outside the capture folder/],
    ];
    for (const [what, change, why, fileLink] of changes) {
      await t.test(`an ink original that is ${what}`, { skip: fileLink && !fileLinks ? NO_FILE_LINKS : false }, async () => {
        const dir = copyCapture();
        const release = await change(dir);
        try {
          await refused(authority(s.origin), job(dir), why, `an ink original that is ${what}`);
        } finally {
          if (release) await release();
        }
      });
    }
    assert.equal(s.seen.length, 0, 'nothing was sent');
  } finally {
    await s.close();
  }
});

// ---- the real Backend (synthetic test authority), when available -------------------------------------------------
const BACKEND = process.env['LC_BACKEND_ROOT'];
const PYTHON = process.env['LC_PYTHON'];
/** When set, the real-Backend tests write what they observed there (never the token). */
const EVIDENCE_DIR = process.env['LC_UPLOAD_EVIDENCE_DIR'];
const record = (name: string, value: unknown): void => {
  if (!EVIDENCE_DIR) return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  assert.equal(text.includes(TOKEN), false);
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), text);
};
const real = BACKEND && PYTHON ? test : test.skip;

async function backend(): Promise<{ origin: string; stream: { revision: number }; child: ChildProcess; stop: () => Promise<void> }> {
  const child = spawn(PYTHON!, ['-P', path.join(import.meta.dirname, 'backend-host.py'), '--backend', BACKEND!, '--identities', FIXTURE], { env: { ...process.env, LC_WINDOWS_TEST_TOKEN: TOKEN, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
  const line = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout!.on('data', (c) => {
      out += c;
      if (out.includes('\n')) resolve(out.split('\n')[0]!);
    });
    child.on('exit', (code) => reject(new Error(`the Backend host ended (${code})`)));
  });
  const ready = JSON.parse(line) as { base_url: string; stream: { revision: number } };
  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.stdin!.end();
      child.kill();
    });
  return { origin: ready.base_url, stream: ready.stream, child, stop };
}
/** Stop, as the host would, through the Backend's control route. */
const stopStream = (b: { origin: string; stream: { revision: number } }): Promise<Response> =>
  fetch(`${b.origin}/v2/process/streams/${meta.plan.stream_id}:control`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'test-stop' },
    body: JSON.stringify({ contract_version: '0.2.1', device_id: meta.plan.device_id, session_id: meta.plan.session_id, stream_id: meta.plan.stream_id, expected_revision: b.stream.revision, action: { kind: 'stop', pre_stop_sequence: null } }),
  });
/**
 * An HTTP relay to the real Backend that counts requests and can drop the first batch answer after the Backend
 * committed it (first running `beforeDrop`), or change an answer the Backend gave (`alter`, by request and count).
 */
async function relay(target: string, dropFirstBatch: boolean, beforeDrop: () => Promise<void> = async () => {}, alter: (url: string, n: number, text: string) => string = (_u, _n, text) => text) {
  const seen: string[] = [];
  const truth: Array<{ url: string; text: string }> = []; // the Backend's own answers, before any change
  let dropped = false;
  const server = http.createServer((req, res) => {
    let body = Buffer.alloc(0);
    req.on('data', (c) => (body = Buffer.concat([body, c])));
    req.on('end', async () => {
      seen.push(`${req.method} ${req.url}`);
      const answer = await fetch(`${target}${req.url}`, { method: req.method!, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k)).map(([k, v]) => [k, String(v)])), body: body.length ? body : null, redirect: 'manual' });
      const text = await answer.text();
      truth.push({ url: req.url!, text });
      if (dropFirstBatch && !dropped && req.url!.endsWith(':batch')) {
        dropped = true;
        await beforeDrop();
        return void req.socket.destroy(); // the Backend has committed; the answer is lost
      }
      res.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') ?? 'application/json' });
      res.end(alter(req.url!, seen.filter((x) => x === `${req.method} ${req.url}`).length, text));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, seen, truth, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) };
}

real('the real Backend: the harness-ink originals and batch are committed with a corresponding ACK, the same job again is the same ACK, nothing local changes', { timeout: 60_000 }, async () => {
  const b = await backend();
  try {
    const before = digest(CAPTURE);
    const first = await upload(authority(b.origin), job());
    assert.equal(first.status, 'committed', JSON.stringify(first));
    const again = await upload(authority(b.origin), job());
    assert.equal(again.status, 'committed');
    assert.deepEqual(again.status === 'committed' && again.ack, first.status === 'committed' && first.ack, 'the same key: the same ACK');
    assert.ok(first.status === 'committed' && first.ack.acknowledged.every((r) => r.disposition === 'accepted' && r.artifacts.every((a) => a.status === 'verified')));
    assert.equal(first.status === 'committed' && first.ack.acknowledged.flatMap((r) => r.artifacts).filter((a) => a.media_type === 'application/json').length, 4, 'every frame with its ink original');
    assert.equal(digest(CAPTURE), before);
    record('committed.json', { job: 'harness-ink', body_sha256: crypto.createHash('sha256').update(job().prepared.body).digest('hex'), idempotency_key: job().prepared.idempotency_key, first, same_job_again_same_ack: true, capture_digest_before_and_after: before });
  } finally {
    await b.stop();
    assert.ok(b.child.exitCode !== null || b.child.signalCode !== null, 'the host has ended');
  }
});

real('the real Backend: a batch answer lost after commit is recovered by sending the same bytes and key; changed bytes are never sent; after Stop nothing more is taken', { timeout: 60_000 }, async () => {
  const b = await backend();
  const r = await relay(b.origin, true);
  try {
    const result = await upload(authority(r.origin), job(), { pause_ms: 20 });
    assert.equal(result.status, 'committed');
    assert.equal(r.seen.filter((x) => x.endsWith(':batch')).length, 2);
    assert.ok(result.status === 'committed' && result.ack.acknowledged.every((x) => x.disposition === 'accepted'), 'the replay of the committed batch, not a new one');
    const dir = copyCapture();
    const f = path.join(dir, 'frames', fs.readdirSync(path.join(dir, 'frames'))[0]!);
    const bytes = fs.readFileSync(f);
    bytes[bytes.length - 20] = bytes[bytes.length - 20]! ^ 1;
    fs.writeFileSync(f, bytes);
    const count = r.seen.length;
    const changed = await upload(authority(r.origin), job(dir));
    assert.equal(changed.status, 'refused');
    assert.equal(r.seen.length, count, 'nothing sent');
    // Stop, as the host would; then the same job is refused (not resumed).
    const stop = await stopStream(b);
    assert.equal(stop.status, 200);
    const after = await upload(authority(b.origin), job());
    assert.equal(after.status, 'refused');
    assert.match(after.status === 'refused' ? after.reason : '', /403 forbidden/);
    record('recovery.json', { lost_batch_answer: { relay: r.seen.slice(0, count), result }, changed_bytes: { result: changed, requests_sent: r.seen.length - count }, after_stop: { stop_status: stop.status, result: after } });
  } finally {
    await r.close();
    await b.stop();
    assert.ok(b.child.exitCode !== null || b.child.signalCode !== null, 'the host has ended');
  }
});

real('the real Backend: a batch committed there whose answer is lost, then Stop before it is sent again, is unknown with the batch in doubt, not refused', { timeout: 60_000 }, async () => {
  const b = await backend();
  let stopStatus = 0;
  const r = await relay(b.origin, true, async () => void (stopStatus = (await stopStream(b)).status));
  try {
    const result = await upload(authority(r.origin), job(), { pause_ms: 20 });
    assert.equal(stopStatus, 200);
    assert.equal(result.status, 'unknown', JSON.stringify(result));
    if (result.status !== 'unknown') return;
    assert.deepEqual([result.stage, result.in_doubt, result.http_status, result.error, result.originals.length], ['batch', 'batch', 409, 'capture_stopped', 7]);
    assert.equal(r.seen.filter((x) => x.endsWith(':batch')).length, 2, 'sent again once, then not resumed');
    record('in-doubt.json', { relay: r.seen, stop_status: stopStatus, result });
  } finally {
    await r.close();
    await b.stop();
    assert.ok(b.child.exitCode !== null || b.child.signalCode !== null, 'the host has ended');
  }
});

real('the real Backend: a 200 changed on its way after the Backend committed is not believed; the same bytes again are committed, or the outcome stays unknown and the same job later finds it committed', { timeout: 60_000 }, async () => {
  const garble = (text: string) => text.replace('"bytes_committed"', '"garbled"').replace('"verified"', '"garbled"');
  // Every first answer changed: each original and the batch are sent again as the same bytes and committed.
  const b = await backend();
  const once = await relay(b.origin, false, async () => {}, (url, n, text) => (n === 1 && (url.startsWith('/v2/process/originals/') || url.endsWith(':batch')) ? garble(text) : text));
  let again: UploadResult;
  try {
    again = await upload(authority(once.origin), job(), { pause_ms: 20 });
    assert.equal(again.status, 'committed', JSON.stringify(again));
    assert.deepEqual([once.seen.filter((x) => x.startsWith('PUT')).length, once.seen.filter((x) => x.endsWith(':batch')).length], [14, 2]);
    const [committedFirst] = once.truth.filter((x) => x.url.endsWith(':batch'));
    assert.deepEqual(again.status === 'committed' && again.ack, JSON.parse(committedFirst!.text), 'the ACK believed is the replay of what the first send committed');
  } finally {
    await once.close();
    await b.stop();
    assert.ok(b.child.exitCode !== null || b.child.signalCode !== null, 'the host has ended');
  }
  // On a fresh Backend, every batch answer changed: unknown with the batch in doubt, never refused. The same job sent
  // later is answered with exactly the ACK of the first send (the same received_at): the Backend had committed it.
  const fresh = await backend();
  const always = await relay(fresh.origin, false, async () => {}, (url, _n, text) => (url.endsWith(':batch') ? garble(text) : text));
  try {
    const doubt = await upload(authority(always.origin), job(), { pause_ms: 20 });
    assert.deepEqual(shape(doubt), ['unknown', 'batch', 'batch', 7]);
    assert.equal(always.seen.filter((x) => x.endsWith(':batch')).length, 3);
    const later = await upload(authority(fresh.origin), job());
    assert.equal(later.status, 'committed');
    const [committedFirst] = always.truth.filter((x) => x.url.endsWith(':batch'));
    assert.deepEqual(later.status === 'committed' && later.ack, JSON.parse(committedFirst!.text), 'the Backend had committed the first send');
    record('first-200.json', { every_first_answer_changed: { relay: once.seen, result: again }, every_batch_answer_changed: { relay: always.seen, result: doubt }, same_job_later: { result: later, ack_is_the_first_sends_ack: true } });
  } finally {
    await always.close();
    await fresh.stop();
    assert.ok(fresh.child.exitCode !== null || fresh.child.signalCode !== null, 'the host has ended');
  }
});
