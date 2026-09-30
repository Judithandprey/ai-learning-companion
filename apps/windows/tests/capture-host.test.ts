// The host supervisor (src/main/capture-host.ts) with the released host's own code (in-memory store), from a private
// copy of the Backend: the startup record goes only to the child's input, READY and reachability, the host's own
// Host/Origin guard, end of input, and killing only this child when it does not end.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { startHost, type HostLaunch } from '../src/main/capture-host.ts';
import { loopbackTransport, type Transport } from '../src/main/loopback-http.ts';
import { ACTOR, hostAvailable, memoryLaunch, newToken, privateBackend, record, registration, removeCopies } from './host-fixture.ts';

const real = hostAvailable ? test : test.skip;
after(removeCopies);
const call = (origin: string, token: string, method: 'GET' | 'PUT' | 'POST', path: string, body: unknown, key?: string) =>
  loopbackTransport({ method, url: `${origin}${path}`, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === null ? null : JSON.stringify(body) });

real('a Start: the record goes only to the child\'s input; READY pending; the port answers; the stream registers and its source is created; the end of input ends the host', { timeout: 60_000 }, async () => {
  const root = privateBackend();
  const token = newToken();
  const dsn = 'host=/nonexistent dbname=lc_p0_test user=secret-dsn-marker';
  const started = await startHost(memoryLaunch(root), record({ fresh: true, token, stream_id: 'stream-a', dsn }));
  assert.equal(started.ok, true, started.ok ? '' : started.reason);
  if (!started.ok) return;
  const h = started.host;
  assert.equal(h.start_status, 'pending');
  assert.match(h.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  // Neither the token nor the DSN is in the child's argv or environment.
  if (process.platform === 'linux' && h.pid) {
    for (const f of ['cmdline', 'environ']) {
      const text: string = fs.readFileSync(`/proc/${h.pid}/${f}`, 'latin1');
      assert.equal(text.includes(token) || text.includes('secret-dsn-marker'), false, f);
    }
    assert.deepEqual(fs.readFileSync(`/proc/${h.pid}/cmdline`, 'latin1').split('\0').filter(Boolean).slice(1), ['-m', 'lc_test_memory_host']);
  }
  const reg = await call(h.origin, token, 'POST', '/v2/process/streams', registration('stream-a'), 'stream-a.register');
  assert.equal(reg.status, 200, reg.text);
  assert.equal(JSON.parse(reg.text).state, 'live');
  const src = await call(h.origin, token, 'PUT', '/v2/process/display-sources/src-a', { contract_version: '0.2.4', source_id: 'src-a', stream_id: 'stream-a', project_id: null, source_timezone: 'UTC' });
  assert.equal(src.status, 200, src.text);
  assert.deepEqual([JSON.parse(src.text).user_id, JSON.parse(src.text).source_version], [ACTOR.user_id, 1]);
  // The host's own guard: an Origin header is refused (the app's transport never sends one).
  const withOrigin = await loopbackTransport({ method: 'GET', url: `${h.origin}/v2/process/streams/stream-a`, headers: { Authorization: `Bearer ${token}`, Origin: 'https://example.com' }, body: null });
  assert.equal(withOrigin.status, 403);
  const state = await call(h.origin, token, 'GET', '/v2/process/streams/stream-a', null);
  assert.equal(state.status, 200);
  const end = await h.end();
  assert.deepEqual([end.ended, end.exit?.code, end.exit?.error], [true, 0, null]);
});

real('no READY: a malformed record, or no grant without fresh consent, ends the host with its fixed error and nothing else', { timeout: 60_000 }, async () => {
  const root = privateBackend();
  const bad = { ...record({ fresh: true, token: newToken(), stream_id: 'stream-b' }), extra: 1 } as unknown as ReturnType<typeof record>;
  const a = await startHost(memoryLaunch(root), bad);
  assert.deepEqual([a.ok, !a.ok && a.exit?.error], [false, 'invalid_startup']);
  assert.match(!a.ok ? a.reason : '', /ended without READY \(invalid_startup\)/);
  const b = await startHost(memoryLaunch(root), record({ fresh: false, token: newToken(), stream_id: 'stream-b' }));
  assert.deepEqual([b.ok, !b.ok && b.exit?.error], [false, 'unavailable'], 'a pristine store has no grant to reconcile: never granted here');
});

real('the port is waited for without resending anything; a port that answers as something else is not the host', { timeout: 60_000 }, async () => {
  const root = privateBackend();
  let refused = 0;
  const seen: string[] = [];
  const transport: Transport = async (r) => {
    seen.push(`${r.method} ${new URL(r.url).pathname}`);
    if (refused < 3) {
      refused += 1;
      throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    }
    return loopbackTransport(r);
  };
  const started = await startHost(memoryLaunch(root), record({ fresh: true, token: newToken(), stream_id: 'stream-c' }), { transport });
  assert.equal(started.ok, true);
  assert.deepEqual(seen, Array(4).fill('GET /openapi.json'), 'only the side-effect-free probe, until it answered');
  if (started.ok) assert.equal((await started.host.end()).ended, true);
  const other = await startHost(memoryLaunch(root), record({ fresh: true, token: newToken(), stream_id: 'stream-d' }), { transport: async () => ({ status: 200, text: '{}' }) });
  assert.deepEqual([other.ok, !other.ok && other.reason], [false, 'the host\'s port answered 200, not as the host']);
  assert.equal(other.ok || other.exit?.code, 0, 'and it was ended by the end of its input');
});

real('a host that does not end at the end of its input is killed, this child alone, and that is said', { timeout: 60_000 }, async () => {
  const root = privateBackend();
  const started = await startHost(memoryLaunch(root, 'lc_test_stubborn_host'), record({ fresh: true, token: newToken(), stream_id: 'stream-e' }), { end_ms: 500 });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const end = await started.host.end();
  assert.equal(end.ended, false);
  assert.match(end.note, /did not end at the end of its input and was killed/);
  assert.equal(end.exit !== null, true);
});

real('no libpq setting reaches the host: PGHOSTADDR, PGSERVICE and the rest are not in its environment', { timeout: 60_000 }, async () => {
  if (process.platform !== 'linux') return;
  const root = privateBackend();
  const saved = { ...process.env };
  Object.assign(process.env, { PGHOSTADDR: '203.0.113.9', PGSERVICE: 'elsewhere', PGHOST: '/elsewhere', PGDATABASE: 'other' });
  try {
    const started = await startHost(memoryLaunch(root), record({ fresh: true, token: newToken(), stream_id: 'stream-pg' }));
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const environ = fs.readFileSync(`/proc/${started.host.pid}/environ`, 'latin1').split('\0');
    assert.deepEqual(environ.filter((e) => /^PG/i.test(e)), []);
    await started.host.end();
  } finally {
    for (const k of ['PGHOSTADDR', 'PGSERVICE', 'PGHOST', 'PGDATABASE']) if (!(k in saved)) delete process.env[k];
  }
});

real('a host that ends right after READY: its input pipe is closed too (no descriptor left open)', { timeout: 60_000 }, async () => {
  if (process.platform !== 'linux') return;
  const root = privateBackend();
  const inputs = () => fs.readdirSync('/proc/self/fd').filter((fd) => {
    try {
      return /lc-host-.*input/.test(fs.readlinkSync(`/proc/self/fd/${fd}`));
    } catch {
      return false;
    }
  }).length;
  const before = inputs();
  for (let k = 0; k < 3; k++) {
    const started = await startHost(memoryLaunch(root, 'lc_test_brief_host'), record({ fresh: true, token: newToken(), stream_id: 'stream-brief' }), { reach_ms: 3000 });
    assert.equal(started.ok, false);
  }
  assert.equal(inputs(), before);
});

real('a host that writes on after READY is ended; one killed is never said to have ended by itself', { timeout: 60_000 }, async () => {
  const root = privateBackend();
  const started = await startHost(memoryLaunch(root, 'lc_test_flood_host'), record({ fresh: true, token: newToken(), stream_id: 'stream-flood' }), { end_ms: 1000 });
  if (started.ok) {
    const end = await started.host.end();
    assert.equal(end.ended, false);
    assert.match(end.note, /did not end at the end of its input and was killed/);
  } else {
    assert.match(started.reason, /more than its READY line|port/);
  }
});

// ---- startup failures with real child processes (no Backend): never thrown, bounded, and truthful about delivery ----
const wsl: HostLaunch = { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' };
const noNetwork: Transport = async () => {
  throw new Error('no request is made in these cases');
};
const posix = process.platform === 'win32' ? test.skip : test;
const linux = process.platform === 'linux' ? test : test.skip;

test('no process at all (its program missing): refused at once as not started, and the record known not delivered', async () => {
  const missing = path.join(os.tmpdir(), `lc-no-such-host-${process.pid}`, 'host.exe');
  const started = await startHost(wsl, record({ fresh: true, token: newToken(), stream_id: 'stream-none' }), {
    ready_ms: 2000, end_ms: 200, transport: noNetwork,
    spawn: ((_c: string, _a: string[], o: object) => spawn(missing, [], o)) as never,
  });
  assert.deepEqual(started, { ok: false, reason: 'the host could not be started', exit: null, delivered: false });
});

linux('a child that closed its input before the record: the write fails (EPIPE) inside the start, not as an uncaught error; the child is reaped; no whole record passed', async () => {
  let pid: number | undefined;
  let inputClosed = false;
  const started = await startHost(wsl, record({ fresh: true, token: newToken(), stream_id: 'stream-closed' }), {
    ready_ms: 5000, end_ms: 3000, transport: noNetwork,
    spawn: ((_c: string, _a: string[], o: object) => {
      const child = spawn('/bin/sh', ['-c', 'exec 0<&-; sleep 0.3'], o);
      pid = child.pid;
      // Held until the child has really closed its input (its descriptor 0 gone), so the write meets a closed pipe.
      for (let n = 0; n < 150 && fs.existsSync(`/proc/${pid}/fd/0`); n++) spawnSync('sleep', ['0.02']);
      inputClosed = !fs.existsSync(`/proc/${pid}/fd/0`);
      return child;
    }) as never,
  });
  assert.equal(inputClosed, true, 'the child had closed its input before the record was written');
  assert.equal(started.ok, false);
  if (started.ok) return;
  assert.deepEqual([started.reason, started.delivered], ['the startup record could not be given to the host', false]);
  assert.deepEqual(started.exit, { code: 0, signal: null, error: null }, 'the child ended on its own and was reaped');
  assert.equal(fs.existsSync(`/proc/${pid}`), false);
});

posix('a started child that takes the record and ends without READY: whether a grant exists stays not known (delivered)', async () => {
  const started = await startHost(wsl, record({ fresh: true, token: newToken(), stream_id: 'stream-brief' }), {
    ready_ms: 5000, end_ms: 3000, transport: noNetwork,
    spawn: ((_c: string, _a: string[], o: object) => spawn('/bin/sh', ['-c', 'sleep 0.3'], o)) as never,
  });
  assert.equal(started.ok, false);
  if (started.ok) return;
  assert.deepEqual([started.reason, started.delivered], ['the host ended without READY', true]);
});

posix('a record write still pending at the READY bound (the child never reads): it may yet complete, so delivered; the child is ended', async () => {
  const started = await startHost(wsl, record({ fresh: true, token: newToken(), stream_id: 'stream-pending' }), {
    ready_ms: 500, end_ms: 200, transport: noNetwork,
    spawn: ((_c: string, _a: string[], o: object) => {
      const child = spawn('/bin/sh', ['-c', 'exec sleep 10'], o);
      child.stdin!.write(Buffer.alloc(2 * 1024 * 1024, 0x20)); // its input already full: the record's write waits
      return child;
    }) as never,
  });
  assert.equal(started.ok, false);
  if (started.ok) return;
  assert.deepEqual([started.reason, started.delivered], ['the startup record could not be given to the host', true]);
  assert.equal(started.exit?.signal, 'SIGTERM', 'it did not end at the end of its input and was killed, this child alone');
});
