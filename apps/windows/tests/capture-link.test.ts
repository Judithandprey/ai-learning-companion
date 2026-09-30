// The development capture link (src/main/capture-link.ts): configuration, the test-database DSN rule, the
// coordination record, and, with the released host's own code over a kept in-memory store (host-memory.py), a Start
// that sends retained frames and ink originals, the same job again while live, a lost host, the service stopping the
// stream, Stop, and reconciliation after a restart that sends nothing again.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CaptureLink, readLinkConfig, testDatabaseDsn, type LinkStatus } from '../src/main/capture-link.ts';
import { loopbackTransport } from '../src/main/loopback-http.ts';
import { hostAvailable, memoryLaunch, privateBackend, removeCopies } from './host-fixture.ts';
import { ownHostPid, removeTemps, SESSION, state, temp as linkTemp, until, world as linkWorld, type WorldOptions } from './link-world.ts';

after(removeCopies);
after(removeTemps);
const temp = linkTemp;
/** The world over the released host's own code with a kept in-memory store. */
const world = (o: Omit<WorldOptions, 'launch'> = {}) => linkWorld({ ...o, launch: memoryLaunch(privateBackend()) });

test('the development configuration: off unless named; launch facts and the DSN file path only', () => {
  assert.equal(readLinkConfig({}), null);
  const read = (v: unknown) => () => JSON.stringify(v);
  const wsl = { format: 'lc-windows-dev-capture-host/v1', launch: { kind: 'wsl', distribution: 'Ubuntu', user: 'agentsdock', cd: '/repo', python: '/repo/.venv/bin/python' }, dsn_file: '/x/test-database.dsn' };
  assert.deepEqual(readLinkConfig({ LC_DEV_CAPTURE_HOST: 'c.json' }, read(wsl)), { launch: wsl.launch, dsn_file: wsl.dsn_file });
  const fifo = { ...wsl, launch: { kind: 'fifo', python: '/p', cwd: '/b' } };
  assert.deepEqual(readLinkConfig({ LC_DEV_CAPTURE_HOST: 'c.json' }, read(fifo)), { launch: fifo.launch, dsn_file: wsl.dsn_file });
  for (const bad of [{ ...wsl, format: 'x' }, { ...wsl, launch: { ...wsl.launch, kind: 'ssh' } }, { ...wsl, dsn_file: '' }, { ...wsl, launch: { ...wsl.launch, python: 'a\nb' } }]) {
    assert.match(String((readLinkConfig({ LC_DEV_CAPTURE_HOST: 'c.json' }, read(bad)) as { error?: string }).error), /not valid/);
  }
  assert.match(String((readLinkConfig({ LC_DEV_CAPTURE_HOST: 'c.json' }, () => { throw new Error('missing'); }) as { error?: string }).error), /could not be read/);
});

test('the DSN: only lc_p0_test at one local endpoint, with the test runner\'s bounds', () => {
  const dsn = testDatabaseDsn('host=/home/u/socket port=5433 dbname=lc_p0_test user=u connect_timeout=5');
  assert.equal(dsn, "host='/home/u/socket' port=5433 dbname=lc_p0_test user='u' connect_timeout=5 options='-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000'");
  assert.ok(testDatabaseDsn("host='127.0.0.1' dbname='lc_p0_test'"));
  for (const bad of ['host=/s dbname=other', 'host=db.example.com dbname=lc_p0_test', 'host=/s,/t dbname=lc_p0_test', 'host=/s dbname=lc_p0_test service=x', 'host=/s dbname=lc_p0_test hostaddr=10.0.0.1', 'host=/s dbname=lc_p0_test password=p', 'host=/s dbname=lc_p0_test port=0', 'dbname=lc_p0_test', 'postgresql://u@h/lc_p0_test', 'host=/s dbname=lc_p0_test =x']) {
    assert.equal(testDatabaseDsn(bad), null, bad);
  }
});

test('an unreadable coordination record is left untouched: the link stays off and asks for nothing', () => {
  const userData = temp('lc-link-');
  fs.mkdirSync(path.join(userData, 'capture-host'));
  const file = path.join(userData, 'capture-host', 'coordination.json');
  fs.writeFileSync(file, '{"format":"lc-windows-capture-link/v1","actor":');
  const before = fs.readFileSync(file);
  const statuses: LinkStatus[] = [];
  let launched = false;
  const link = new CaptureLink({ userData, config: { launch: { kind: 'fifo', python: '/nonexistent', cwd: '/' }, dsn_file: '/nonexistent' }, notify: (s) => statuses.push(s), endCapture: () => undefined, readDsn: () => ((launched = true), '') });
  link.begin('capture-x', path.join(userData, 'captures', 'capture-x'));
  assert.equal(launched, false);
  assert.deepEqual(link.status(), { mode: 'unavailable', reason: 'the capture link record could not be read; it is left as it is, and development capture storage is off' });
  assert.deepEqual(fs.readFileSync(file), before);
});

// ---- with the released host's code (kept in-memory store) --------------------------------------------------------
const real = hostAvailable ? test : test.skip;

real('a Start sends every retained line in order: the originals arrive as their exact bytes, the batch is committed; Stop ends it and nothing more is sent', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3); // header and the first two retained frames
  await until('two records stored', () => (link.status() as { stored?: number }).stored === 2);
  w.append(link, 2); // two more frames
  await until('four records stored', () => (link.status() as { stored?: number }).stored === 4);
  const rec = w.record();
  const s = rec.streams[0];
  assert.deepEqual([s.grant, s.registered, s.state.state, s.jobs.map((j: { status: string }) => j.status)], ['consumed', true, 'live', ['committed', 'committed']]);
  // Every original, read back through the host, is the exact file retained on this device.
  const auth = w.requests.find((r) => r.auth)!;
  const puts = w.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/v2/process/originals/'));
  assert.equal(new Set(puts.map((p) => p.path)).size, 7, '4 PNGs and 3 ink originals');
  for (const p of new Set(puts.map((x) => x.path))) {
    const id = p.split('/').pop()!;
    const got = await loopbackTransport({ method: 'GET', url: `${auth.origin}/v2/process/sources/${s.source_id}/versions/1/originals/${id}`, headers: { Authorization: auth.auth! }, body: null });
    assert.equal(got.status, 200, got.text);
    const kind = id.includes('.ink.') ? 'ink' : 'frames';
    const sha = id.split('.').pop()!;
    const local = fs.readFileSync(path.join(w.capture, kind, `${sha}.${kind === 'ink' ? 'json' : 'png'}`));
    const body = JSON.parse(got.text);
    assert.equal(Buffer.from(body.data_base64, 'base64').equals(local), true, `${id}: exact bytes`);
  }
  // No token or DSN in the record.
  const text = fs.readFileSync(path.join(w.userData, 'capture-host', 'coordination.json'), 'utf8');
  assert.equal(text.includes(auth.auth!.slice('Bearer '.length)) || text.includes('test-marker-user') || text.includes(w.storeDir), false);
  // Stop: latched, one Stop written before it is sent, the state read back stopped; then nothing more is sent.
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const stopped = w.record().streams[0];
  assert.deepEqual([stopped.final, stopped.stops.length, stopped.stops[0].outcome, stopped.state.state, stopped.state.pre_stop_sequence], ['stopped', 1, 'stopped', 'stopped', null]);
  const count = w.requests.length;
  w.append(link, 1); // the ended line (and any later event) is not sent
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(w.requests.length, count, 'no request after the Stop');
});

real('a job whose answer is lost is sent again, as the same key and body, while the Start is live; committed once', { timeout: 120_000 }, async () => {
  let dropped = 0;
  const w = world({ fault: (r) => (r.method === 'POST' && r.path.endsWith(':batch') && dropped++ === 0 ? 'drop-answer' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => (link.status() as { stored?: number }).stored === 2);
  const batches = w.requests.filter((r) => r.path.endsWith(':batch'));
  assert.ok(batches.length >= 2);
  assert.equal(new Set(batches.map((b) => b.key)).size, 1, 'the same key');
  const job = w.record().streams[0].jobs[0];
  assert.deepEqual([job.status, job.plan, job.body], ['committed', undefined, undefined], 'settled: its exact body is no longer kept');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('the service stopping the stream ends the local capture too, and nothing more is sent', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => (link.status() as { stored?: number }).stored === 2);
  const s = w.record().streams[0];
  const auth = w.requests.find((r) => r.auth)!;
  // Another control party (here the test, with the same authority) stops the stream.
  const stop = await loopbackTransport({ method: 'POST', url: `${auth.origin}/v2/process/streams/${s.stream_id}:control`, headers: { Authorization: auth.auth!, 'Content-Type': 'application/json', 'Idempotency-Key': 'external-stop' }, body: JSON.stringify({ contract_version: '0.2.1', device_id: s.registration.device_id, session_id: s.registration.session_id, stream_id: s.stream_id, expected_revision: s.state.revision, action: { kind: 'stop', pre_stop_sequence: null } }) });
  assert.equal(stop.status, 200, stop.text);
  w.append(link, 1); // the next retained frame: its send is refused, the state read back is stopped
  await until('the local capture asked to end', () => w.ended.length === 1);
  assert.match(w.ended[0]!, new RegExp(`^${SESSION}: the capture storage service stopped this capture`));
  assert.equal(w.record().streams[0].final, 'stopped');
  link.stopSending(SESSION); // what the app's end() does
  await until('stopped', () => state(link.status()) === 'stopped');
  const count = w.requests.length;
  w.append(link, 1);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(w.requests.length, count);
});

real('after a restart: the earlier stream is reconciled by reads and one Stop; an unknown job stays unknown and nothing is sent again', { timeout: 120_000 }, async () => {
  // The first run: the batch never gets an answer (stays unknown while live), then the app is gone.
  let down = false;
  const w = world({ fault: (r) => (down ? 'refuse' : r.method === 'POST' && r.path.endsWith(':batch') ? 'drop-answer' : null) });
  const first = w.make();
  first.begin(SESSION, w.capture);
  w.append(first, 3);
  await until('the job is in doubt', () => (first.status() as { unknown?: number }).unknown === 2 && w.record().streams[0].jobs[0].status === 'unknown');
  down = true; // the first run can no longer reach anything (its app is gone)
  const hostPid = await ownHostPid(w.requests.find((r) => r.auth)!.origin);
  if (hostPid) process.kill(hostPid, 'SIGKILL');
  await until('the first run gave up', () => state(first.status()) === 'not connected' || state(first.status()) === 'offline');
  // The second run on the same app data: reconciliation only.
  const seen: string[] = [];
  const second = w.make(async (r) => {
    const u = new URL(r.url);
    if (u.pathname !== '/openapi.json') seen.push(`${r.method} ${u.pathname}`);
    return loopbackTransport(r);
  });
  await second.reconcile();
  const s = w.record().streams[0];
  assert.deepEqual([s.final, s.state.state, s.jobs[0].status], ['stopped', 'stopped', 'unknown'], 'stopped; the job still unknown');
  assert.equal(seen.some((x) => x.startsWith('PUT /v2/process/originals') || x.endsWith(':batch') || x.startsWith('PUT /v2/process/display-sources')), false, `nothing resent: ${seen.join(', ')}`);
  assert.deepEqual(seen, [`GET /v2/process/streams/${s.stream_id}`, `POST /v2/process/streams/${s.stream_id}:control`, `GET /v2/process/streams/${s.stream_id}`], 'a read, one Stop, a read');
});


real('a host lost while the Start is live is started again without consent; the stream is still live, so sending continues', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => (link.status() as { stored?: number }).stored === 2);
  const firstOrigin = w.requests.find((r) => r.auth)!.origin;
  const pid = await ownHostPid(firstOrigin);
  assert.ok(pid, 'the host process was found');
  process.kill(pid!, 'SIGKILL');
  await until('connected again', () => w.requests.some((r) => r.origin !== firstOrigin && r.path === '/v2/process/streams'));
  w.append(link, 2);
  await until('stored', () => (link.status() as { stored?: number }).stored === 4);
  const again = w.requests.filter((r) => r.origin !== firstOrigin);
  assert.equal(again[0]!.path, '/v2/process/streams', 'the registration replayed first');
  assert.equal(again[0]!.key, w.record().streams[0].registration_key, 'under its own key');
  assert.equal(again.some((r) => r.path.startsWith('/v2/process/display-sources')), false, 'the source is not created again');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  assert.equal(w.record().streams[0].final, 'stopped');
});

real('a Stop before any host was asked for: latched at once; no stream is made, no host is started, nothing is sent', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  link.stopSending(SESSION); // at once, before the host could be started
  w.append(link, 3);
  await until('stopped', () => state(link.status()) === 'stopped');
  assert.deepEqual(w.requests, [], 'no request at all');
  const file = path.join(w.userData, 'capture-host', 'coordination.json');
  assert.equal(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).streams.length : 0, 0, 'no stream recorded');
});

real('after a restart, a grant still pending is abandoned: never registered without the user\'s Start', { timeout: 120_000 }, async () => {
  // The first run: READY pending, then the registration never gets through (refused connections).
  const w = world({ fault: (r) => (r.path === '/v2/process/streams' ? 'refuse' : null) });
  const first = w.make();
  first.begin(SESSION, w.capture);
  await until('not connected', () => state(first.status()) === 'not connected');
  assert.equal(w.record().streams[0].grant, 'pending');
  first.stopSending(SESSION);
  await until('stopped', () => state(first.status()) === 'stopped');
  // Its record as a crash would have left it (the Stop above marks it abandoned; undo that to test reconciliation).
  const file = path.join(w.userData, 'capture-host', 'coordination.json');
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  rec.streams[0].grant = 'pending';
  rec.streams[0].final = null;
  fs.writeFileSync(file, JSON.stringify(rec));
  const seen: string[] = [];
  const second = w.make(async (r) => {
    const u = new URL(r.url);
    if (u.pathname !== '/openapi.json') seen.push(`${r.method} ${u.pathname}`);
    return loopbackTransport(r);
  });
  await second.reconcile();
  const s = w.record().streams[0];
  assert.deepEqual([s.grant, s.final, s.registered], ['abandoned', 'abandoned', false]);
  assert.deepEqual(seen, [], 'no request at all: the pending grant is not used');
});
