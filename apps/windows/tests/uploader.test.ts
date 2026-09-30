// The main-process uploader (src/main/uploader.ts): originals, then the exact batch, over real loopback HTTP.
// A small Node server stands in for the Backend where a fault is needed; with LC_BACKEND_ROOT (an extracted Backend)
// and LC_PYTHON set, the same jobs also go to the real Backend (tests/backend-host.py, synthetic test authority).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { EVIDENCE, OUT } from '../scripts/ingress-fixtures.ts';
import { frameRequest, type IngressPlan } from '../src/shared/frame-ingress.ts';
import { ackProblem, uploadRetained, type UploadAuthority, type UploadJob, type UploadOptions, type UploadResult } from '../src/main/uploader.ts';

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
/** A copy of the capture folder to change. */
const copyCapture = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-upload-'));
  fs.cpSync(CAPTURE, dir, { recursive: true });
  return dir;
};
const digest = (dir: string): string => {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
    const p = path.join(dir, f);
    if (fs.lstatSync(p).isFile()) h.update(f).update(fs.readFileSync(p));
  }
  return h.digest('hex');
};

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
type Fault = (r: Seen, n: number) => 'drop' | 'hold' | { status: number; body?: unknown; headers?: Record<string, string> } | null;
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
        return void res.end(f.body === undefined ? '' : JSON.stringify(f.body));
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
});

test('refusals end the upload and are not retried; a redirect is refused and not followed; an ACK that does not correspond is not committed', async () => {
  const cases: Array<[string, Fault, string, RegExp]> = [
    ['401 on an original', (r) => (r.method === 'PUT' ? { status: 401, body: { error: 'unauthenticated', retryable: false } } : null), 'original', /401 unauthenticated/],
    ['403 after Stop', (r) => (r.method === 'PUT' ? { status: 403, body: { error: 'forbidden', retryable: false } } : null), 'original', /403 forbidden/],
    ['capture stopped at the batch', (r) => (r.url.endsWith(':batch') ? { status: 409, body: { error: 'capture_stopped', retryable: false } } : null), 'batch', /409 capture_stopped/],
    ['a redirect', (r) => (r.method === 'PUT' ? { status: 307, headers: { Location: 'http://127.0.0.1:9/elsewhere' } } : null), 'original', /redirect \(307\), which is refused/],
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
      if (stage === 'original') assert.equal(batches(s.seen).length, 0, 'no batch after a refused original');
    } finally {
      await s.close();
    }
  }
  // 409 dependency_missing is not a refusal: the same job can be sent again later.
  const missing = await standIn((r) => (r.url.endsWith(':batch') ? { status: 409, body: { error: 'dependency_missing', retryable: true } } : null));
  try {
    const result = await upload(authority(missing.origin), job(), { pause_ms: 5 });
    assert.deepEqual([result.status, result.status === 'unknown' && result.stage, batches(missing.seen).length], ['unknown', 'batch', 1]);
  } finally {
    await missing.close();
  }
});

type Ack = { contract_version: string; batch_id: string; user_id: string; device_id: string; session_id: string; stream_id: string; acknowledged: Array<Record<string, unknown> & { artifacts: Array<Record<string, unknown>> }> };
/** The ACK the released Backend gives for a batch: every record committed, every artifact verified. */
const ackFor = (b: { batch_id: string; device_id: string; session_id: string; stream_id: string; records: Array<{ record_id: string; sequence: number; artifacts: object[] }> }): Ack => ({
  contract_version: '0.2.0', batch_id: b.batch_id, user_id: meta.plan.source.user_id, device_id: b.device_id, session_id: b.session_id, stream_id: b.stream_id,
  acknowledged: b.records.map((r) => ({ record_id: r.record_id, sequence: r.sequence, disposition: 'accepted', received_at: '2026-09-30T17:00:00Z', envelope: 'committed', artifacts: r.artifacts.map((a) => ({ ...a, status: 'verified' })) })),
});

test('an ACK is committed only when it answers exactly the batch sent: each deviation is refused, not retried', async () => {
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
  // Through HTTP: the one-artifact-twice ACK ends the upload refused at the batch, sent once.
  const twice = await standIn((r) => {
    if (!r.url.endsWith(':batch')) return null;
    const a = ackFor(JSON.parse(r.body).batch);
    for (const x of a.acknowledged) x.artifacts = x.artifacts.map(() => x.artifacts[0]!);
    return { status: 200, body: a };
  });
  try {
    const result = await upload(authority(twice.origin), job());
    assert.deepEqual([result.status, result.status === 'refused' && result.stage, batches(twice.seen).length], ['refused', 'batch', 1]);
    assert.match(result.status === 'refused' ? result.reason : '', /does not list exactly its artifacts/);
  } finally {
    await twice.close();
  }
});

test('an original is counted only on a receipt that is exactly it, bytes_committed; otherwise nothing more is sent', async () => {
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
      const result = await upload(authority(s.origin), job());
      assert.deepEqual([result.status, result.status === 'refused' && result.stage, result.originals, puts(s.seen).length, batches(s.seen).length], ['refused', 'original', [], 1, 0], what);
      assert.match(result.status === 'refused' ? result.reason : '', /is not exactly its original, committed/, what);
    } finally {
      await s.close();
    }
  }
});

test('a send that went without an answer may have arrived: a later refusal, expiry or cancellation leaves it unknown, named in doubt, and not resumed', async () => {
  // The batch answer is lost, then Stop: 409 capture_stopped does not say whether the first send was committed.
  const stopped = await standIn((r) => (r.url.endsWith(':batch') ? (batches([r]).length && stopped.seen.filter((x) => x.url.endsWith(':batch')).length === 1 ? 'drop' : { status: 409, body: { error: 'capture_stopped', retryable: false } }) : null));
  try {
    const result = await upload(authority(stopped.origin), job(), { pause_ms: 5 });
    assert.equal(result.status, 'unknown');
    if (result.status !== 'unknown') return;
    assert.deepEqual([result.stage, result.in_doubt, result.http_status, result.error, result.originals.length, batches(stopped.seen).length], ['batch', 'batch', 409, 'capture_stopped', 7, 2]);
    assert.match(result.reason, /sent without an answer, then refused: 409 capture_stopped; whether it arrived is not known, and it is not resumed here/);
  } finally {
    await stopped.close();
  }
  // An original's answer is lost, then 403: unknown at that original, which is not counted as committed.
  const forbidden = await standIn((r, n) => (r.method === 'PUT' ? (n === 1 ? 'drop' : { status: 403, body: { error: 'forbidden', retryable: false } }) : null));
  try {
    const result = await upload(authority(forbidden.origin), job(), { pause_ms: 5 });
    const first = JSON.parse(forbidden.seen[0]!.body).artifact.artifact_id as string;
    assert.deepEqual([result.status, result.status === 'unknown' && result.stage, result.status === 'unknown' && result.in_doubt, result.originals, puts(forbidden.seen).length, batches(forbidden.seen).length], ['unknown', 'original', first, [], 2, 0]);
  } finally {
    await forbidden.close();
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

test('nothing is sent unless the origin, bearer, owner, incarnation and every original check out', async () => {
  const s = await standIn();
  try {
    const refused = async (a: UploadAuthority, j: UploadJob, why: RegExp) => {
      const result = await upload(a, j);
      assert.equal(result.status, 'refused');
      assert.equal(result.status === 'refused' && result.stage, 'local');
      assert.match(result.status === 'refused' ? result.reason : '', why);
    };
    const port = new URL(s.origin).port; // the stand-in's own port, so only the scheme or host refuses these
    for (const origin of [`https://127.0.0.1:${port}`, `http://localhost:${port}`, `http://example.com:${port}`, `http://10.0.0.1:${port}`, `http://127.0.0.2:${port}`, `http://0x7f.0.0.1:${port}`, `http://[::ffff:127.0.0.1]:${port}`, 'http://127.0.0.1', 'http://127.0.0.1:80', `http://u:p@127.0.0.1:${port}`, `http://127.0.0.1:${port}/api`, `http://127.0.0.1:${port}?q`, 'not a url']) {
      await refused(authority(origin), job(), origin === 'not a url' ? /not a URL/ : /only an http origin on the loopback interface/);
    }
    await refused(authority(s.origin, { token: 'short' }), job(), /bearer is malformed/);
    await refused(authority(s.origin, { expires_at: new Date(Date.now() - 1000).toISOString() }), job(), /bearer has expired/);
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
    await refused(authority(s.origin), { ...j, prepared: { ...j.prepared, body: `${j.prepared.body}${' '.repeat(4 * 1024 * 1024)}` } }, /over 4 MiB/);
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
    const ink = (dir: string) => path.join(dir, 'ink', fs.readdirSync(path.join(dir, 'ink'))[0]!);
    const changes: Array<[string, (dir: string) => void, RegExp]> = [
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
      }, /is not a regular file/],
      ['unreadable', (dir) => fs.chmodSync(ink(dir), 0o000), /cannot be read/],
      ['a directory', (dir) => {
        const f = ink(dir);
        fs.rmSync(f);
        fs.mkdirSync(f);
      }, /is not a regular file/],
      ['a folder outside the capture', (dir) => {
        const outside = `${dir}.outside`;
        fs.cpSync(path.join(dir, 'ink'), outside, { recursive: true });
        fs.rmSync(path.join(dir, 'ink'), { recursive: true });
        fs.symlinkSync(outside, path.join(dir, 'ink'));
      }, /is outside the capture folder/],
    ];
    for (const [what, change, why] of changes) {
      const dir = copyCapture();
      change(dir);
      await refused(authority(s.origin), job(dir), why);
      assert.ok(what);
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

async function backend(): Promise<{ origin: string; stream: { revision: number }; child: ChildProcess; stop: () => void }> {
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
  return { origin: ready.base_url, stream: ready.stream, child, stop: () => (child.stdin!.end(), child.kill()) };
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
 * committed it (first running `beforeDrop`).
 */
async function relay(target: string, dropFirstBatch: boolean, beforeDrop: () => Promise<void> = async () => {}) {
  const seen: string[] = [];
  let dropped = false;
  const server = http.createServer((req, res) => {
    let body = Buffer.alloc(0);
    req.on('data', (c) => (body = Buffer.concat([body, c])));
    req.on('end', async () => {
      seen.push(`${req.method} ${req.url}`);
      const answer = await fetch(`${target}${req.url}`, { method: req.method!, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k)).map(([k, v]) => [k, String(v)])), body: body.length ? body : null, redirect: 'manual' });
      const text = await answer.text();
      if (dropFirstBatch && !dropped && req.url!.endsWith(':batch')) {
        dropped = true;
        await beforeDrop();
        return void req.socket.destroy(); // the Backend has committed; the answer is lost
      }
      res.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') ?? 'application/json' });
      res.end(text);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, seen, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) };
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
    b.stop();
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
    b.stop();
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
    b.stop();
  }
});
