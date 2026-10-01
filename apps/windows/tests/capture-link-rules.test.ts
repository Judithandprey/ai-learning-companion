// The capture link's rules, one by one, with the released host's own code over a kept in-memory store (host-memory.py,
// which also records each startup's consent and stream, never its token): consent only at the user's Start; a Stop
// written before it is sent, the same key and body again, delivered even when the host is gone or its bearer expiring;
// a registration without an answer settled by a read, never abandoned while it may be live; a later refusal never
// erasing an unknown outcome; the service's 403 ending the local capture; a record that cannot be written or was lost;
// whole lines only; a job in doubt that cannot be resent set aside once.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CaptureLink } from '../src/main/capture-link.ts';
import { loopbackTransport } from '../src/main/loopback-http.ts';
import { hostAvailable, memoryLaunch, privateBackend, removeCopies } from './host-fixture.ts';
import { MANIFEST, ownHostPid, removeTemps, SESSION, state, temp, until, world as linkWorld, type WorldOptions } from './link-world.ts';

after(removeCopies);
after(removeTemps);
const real = hostAvailable ? test : test.skip;
const world = (o: Omit<WorldOptions, 'launch'> = {}) => linkWorld({ ...o, launch: memoryLaunch(privateBackend()) });
const stored = (link: CaptureLink): number => (link.status() as { stored?: number }).stored ?? 0;
const quiet = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

real('consent: fresh only for the user\'s Start; every other host (a lost host, a renewal, a restart) is started without it', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  const pid = await ownHostPid(w.requests.find((r) => r.auth)!.origin);
  process.kill(pid!, 'SIGKILL');
  await until('connected again', () => w.startups().length === 2 && state(link.status()) === 'sending');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const second = w.make();
  await second.reconcile();
  const s = w.record().streams[0];
  assert.deepEqual(w.startups().map((x) => x.fresh_consent), [true, false], 'the Start, then the lost host; the stopped stream needs no host at the restart');
  assert.equal(w.startups().every((x) => x.stream_id === s.stream_id), true);
});

real('a registration whose answer is lost is settled by a read at the Stop: live on the service, so it is registered and stopped (never abandoned); the next Start follows it', { timeout: 120_000 }, async () => {
  let dropRegistration = true;
  const w = world({ fault: (r) => (dropRegistration && r.method === 'POST' && r.path === '/v2/process/streams' ? 'drop-answer' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  await until('not connected', () => state(link.status()) === 'not connected');
  assert.deepEqual([w.record().streams[0].registered, w.record().streams[0].registration_sent], [false, true]);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const a = w.record().streams[0];
  assert.deepEqual([a.registered, a.grant, a.final, a.stops.length], [true, 'consumed', 'stopped', 1], 'read back as live, then stopped');
  assert.equal(w.record().last_registered_stream, a.stream_id, 'the lineage names it');
  // The next Start names it as its predecessor, and registers.
  dropRegistration = false;
  link.begin('second-capture-session', w.capture);
  await until('the second stream registered', () => w.record().streams[1]?.registered === true);
  const b = w.record().streams[1];
  assert.deepEqual(b.registration.continuity, { kind: 'restart', previous_stream_id: a.stream_id, gap: 'unknown' });
  link.stopSending('second-capture-session');
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('a Stop landing while the host is still starting: nothing is registered after it; the pending grant is abandoned', { timeout: 120_000 }, async () => {
  const w = world();
  fs.writeFileSync(path.join(w.storeDir, 'slow'), '1.5'); // the host takes 1.5 s before READY
  const link = w.make();
  link.begin(SESSION, w.capture);
  await until('the host was asked', () => w.startups().length === 1, 10_000);
  link.stopSending(SESSION); // after the startup record was delivered, before READY
  await until('stopped', () => state(link.status()) === 'stopped');
  const s = w.record().streams[0];
  assert.deepEqual([s.registered, s.registration_sent ?? false, s.grant, s.final], [false, false, 'abandoned', 'abandoned']);
  assert.equal(w.requests.some((r) => r.path === '/v2/process/streams'), false, 'never registered');
});

real('the Stop: written before its dispatch, the same key and body again when its answer is lost; a batch in flight past the bound is cancelled and stays in doubt', { timeout: 120_000 }, async () => {
  let dropStop = true;
  let holdBatch = false;
  const persisted: boolean[] = [];
  const w = world({ fault: (r) => {
    if (r.method === 'POST' && r.path.endsWith(':control')) {
      const rec = w.record().streams[0];
      const body = JSON.parse(r.body!);
      persisted.push(rec.stops.some((x: { key: string; body: unknown }) => JSON.stringify(x.body) === JSON.stringify(body)));
      if (dropStop) return (dropStop = false), 'drop-answer';
    }
    if (holdBatch && r.path.endsWith(':batch')) return { delay: 4000 };
    return null;
  } });
  const link = w.make(undefined, { stop_wait_ms: 1000 });
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  holdBatch = true;
  w.append(link, 1); // a batch whose answer is held past the Stop's bound
  await until('the batch in flight', () => w.requests.filter((r) => r.path.endsWith(':batch')).length === 2);
  const began = Date.now();
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const s = w.record().streams[0];
  const controls = w.requests.filter((r) => r.path.endsWith(':control'));
  assert.deepEqual(persisted, [true, true], 'each dispatch was already written');
  assert.equal(controls.length, 2);
  assert.equal(new Set(controls.map((c) => c.key)).size, 1, 'the same key again');
  assert.deepEqual([s.stops.length, s.stops[0].outcome, s.final], [1, 'stopped', 'stopped']);
  const held = s.jobs.find((j: { from: number }) => j.from === 4);
  assert.deepEqual([held.status, held.in_doubt], ['unknown', 'batch'], 'cancelled at the bound: in doubt, not known');
  assert.ok(Date.now() - began < 20_000);
});

real('a Stop when the bearer is about to expire or the host is gone: a host started without consent delivers it', { timeout: 120_000 }, async () => {
  // Bearer: 4 s, renewed when under a minute is left, so the Stop is sent through a new host.
  const w = world();
  const link = w.make(undefined, { token_life_ms: 4000 });
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  assert.deepEqual([w.record().streams[0].final, w.startups().map((x) => x.fresh_consent)], ['stopped', [true, false]]);
  // Host lost three times: offline after two reconnects; the Stop still reaches the stream.
  const v = world();
  const second = v.make();
  second.begin(SESSION, v.capture);
  v.append(second, 3);
  await until('stored', () => stored(second) === 2);
  for (let k = 0; k < 3; k++) {
    const origins = new Set(v.requests.map((r) => r.origin));
    const pid = await ownHostPid([...origins].at(-1)!);
    if (pid) process.kill(pid, 'SIGKILL');
    await until(`loss ${k + 1} handled`, () => (k < 2 ? v.startups().length === k + 2 && state(second.status()) === 'sending' : state(second.status()) === 'offline'), 30_000);
  }
  second.stopSending(SESSION);
  await until('stopped', () => state(second.status()) === 'stopped');
  assert.equal(v.record().streams[0].final, 'stopped');
  assert.deepEqual(v.startups().map((x) => x.fresh_consent), [true, false, false, false], 'two reconnects and the Stop\'s host, all without consent');
});

real('a later refusal never erases an unknown outcome: the job stays in doubt when the service then stops the stream', { timeout: 120_000 }, async () => {
  const w = world({ fault: (r) => (r.path.endsWith(':batch') ? 'drop-answer' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('in doubt', () => w.record().streams[0]?.jobs[0]?.status === 'unknown');
  const s = w.record().streams[0];
  const auth = w.requests.find((r) => r.auth)!;
  const stop = await loopbackTransport({ method: 'POST', url: `${auth.origin}/v2/process/streams/${s.stream_id}:control`, headers: { Authorization: auth.auth!, 'Content-Type': 'application/json', 'Idempotency-Key': 'external-stop' }, body: JSON.stringify({ contract_version: '0.2.1', device_id: s.registration.device_id, session_id: s.registration.session_id, stream_id: s.stream_id, expected_revision: s.state.revision, action: { kind: 'stop', pre_stop_sequence: null } }) });
  assert.equal(stop.status, 200);
  await until('the service ended it', () => w.ended.length === 1);
  const job = w.record().streams[0].jobs[0];
  assert.deepEqual([job.status, job.in_doubt], ['unknown', 'batch']);
  assert.ok((job.later ?? []).length > 0, 'the refusal is noted, not taken as the outcome');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('the service refusing this capture\'s authority (403) ends the local capture; nothing more is sent', { timeout: 120_000 }, async () => {
  let forbid = false;
  const w = world({ fault: (r) => (forbid && (r.path.endsWith(':batch') || r.path.startsWith('/v2/process/originals') || (r.method === 'GET' && r.path.startsWith('/v2/process/streams/'))) ? 'forbid' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  forbid = true;
  w.append(link, 1);
  await until('the local capture asked to end', () => w.ended.length === 1);
  assert.match(w.ended[0]!, /refused this capture's authority/);
  assert.equal(state(link.status()), 'ended by the service');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const count = w.requests.filter((r) => r.path.endsWith(':batch') || r.path.startsWith('/v2/process/originals')).length;
  w.append(link, 1);
  await quiet(300);
  assert.equal(w.requests.filter((r) => r.path.endsWith(':batch') || r.path.startsWith('/v2/process/originals')).length, count);
});

real('only whole lines the app acknowledged are read: lines past the acknowledged bytes are never planned', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  const acknowledged = fs.statSync(path.join(w.capture, 'manifest.jsonl')).size;
  fs.appendFileSync(path.join(w.capture, 'manifest.jsonl'), `${MANIFEST[3]}\n${MANIFEST[4]}\n`); // written, not acknowledged
  link.appended(SESSION, acknowledged); // what the app says is whole
  await quiet(500);
  assert.equal(w.record().streams[0].planned_through, 3);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('a job in doubt whose original is gone from this device is set aside once (still not known); later lines are still sent', { timeout: 120_000 }, async () => {
  let drop = true;
  const w = world({ fault: (r) => (drop && r.path.endsWith(':batch') ? 'drop-answer' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('in doubt', () => w.record().streams[0]?.jobs[0]?.status === 'unknown');
  const first = JSON.parse(MANIFEST[1]!);
  fs.rmSync(path.join(w.capture, 'frames', `${first.raw.sha256}.png`)); // before any resend can be answered
  await until('set aside', () => w.record().streams[0]?.jobs[0]?.stuck === true);
  drop = false;
  w.append(link, 2);
  await until('the next lines stored', () => stored(link) === 2);
  const job = w.record().streams[0].jobs[0];
  assert.deepEqual([job.status, job.stuck, (job.later ?? []).length], ['unknown', true, 1], 'said once');
  assert.match((link.status() as { detail: string }).detail, /in doubt cannot be sent again from this device/);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('the record cannot be written: nothing more is sent, the Stop is not sent unwritten, the host is still ended, and a new Start asks for nothing', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  const origin = w.requests.find((r) => r.auth)!.origin;
  const pid = await ownHostPid(origin);
  fs.chmodSync(path.join(w.userData, 'capture-host'), 0o500);
  try {
    link.stopSending(SESSION);
    await until('stopped', () => state(link.status()) === 'stopped' || (link.status() as { mode: string }).mode === 'unavailable', 30_000);
    assert.equal(w.requests.some((r) => r.path.endsWith(':control')), false, 'no Stop sent that was not written first');
    await until('its host ended', () => pid === null || !fs.existsSync(`/proc/${pid}`), 15_000);
    const before = w.requests.length;
    link.begin(SESSION, w.capture); // does not throw, asks for nothing
    await quiet(300);
    assert.equal(w.requests.length, before);
    assert.match(JSON.stringify(link.status()), /could not be written/);
  } finally {
    fs.chmodSync(path.join(w.userData, 'capture-host'), 0o700);
  }
});

test('a record that was lost (its folder is there, the file is not) keeps the link off: no new actor, no grant', () => {
  const userData = temp('lc-link-');
  fs.mkdirSync(path.join(userData, 'capture-host'));
  let asked = false;
  const link = new CaptureLink({ userData, config: { launch: { kind: 'fifo', python: '/nonexistent', cwd: '/' }, dsn_file: '/nonexistent' }, notify: () => undefined, endCapture: () => undefined, readDsn: () => ((asked = true), '') });
  link.begin('capture-x', path.join(userData, 'captures', 'capture-x'));
  assert.equal(asked, false);
  assert.equal(fs.existsSync(path.join(userData, 'capture-host', 'coordination.json')), false);
  assert.match(JSON.stringify(link.status()), /record is missing/);
});

real('a Start whose host was never started (its DSN refused) is known to have no grant: abandoned at the Stop, not an unknown to reconcile', { timeout: 60_000 }, async () => {
  const w = world();
  fs.writeFileSync(w.dsnFile, 'host=/nonexistent dbname=another_database');
  const link = w.make();
  link.begin(SESSION, w.capture);
  await until('not connected', () => state(link.status()) === 'not connected');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const s = w.record().streams[0];
  assert.deepEqual([s.grant, s.final], ['abandoned', 'abandoned']);
  assert.equal((link.status() as { earlier_unknown: number }).earlier_unknown, 0);
  assert.equal(w.startups().length, 0, 'no host was ever asked');
});

real('one Stop per revision: a Stop whose outcome was lost is sent again later (at the next Start) under the same key', { timeout: 120_000 }, async () => {
  let lose = false;
  // The Stop never reaches the service (refused connections), so the stream stays live until it is sent again.
  const w = world({ fault: (r) => (lose && (r.path.endsWith(':control') || (r.method === 'GET' && r.path.startsWith('/v2/process/streams/'))) ? 'refuse' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  lose = true;
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  const a = w.record().streams[0];
  assert.deepEqual([a.final, a.stops.length, a.stops[0].outcome], [null, 1, 'unknown']);
  lose = false;
  link.begin('second-capture-session', w.capture); // settles the first stream first
  await until('the first stream stopped', () => w.record().streams[0].final === 'stopped', 60_000);
  const keys = new Set(w.requests.filter((r) => r.path === `/v2/process/streams/${a.stream_id}:control`).map((r) => r.key));
  assert.deepEqual([...keys], [a.stops[0].key], 'the same key');
  assert.equal(w.record().streams[0].stops.length, 1);
  link.stopSending('second-capture-session');
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('READY said pending but the port was never reached: the grant is known pending and abandoned at the Stop; the next Start registers', { timeout: 120_000 }, async () => {
  let first: string | null = null;
  const w = world({ fault: (r) => (r.path === '/openapi.json' && (first === null || first === 'refusing') ? ((first = 'refusing'), 'refuse') : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  await until('not connected', () => state(link.status()) === 'not connected', 30_000);
  first = 'done';
  assert.equal(w.record().streams[0].grant, 'pending');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
  assert.deepEqual([w.record().streams[0].grant, w.record().streams[0].final], ['abandoned', 'abandoned']);
  link.begin('second-capture-session', w.capture);
  await until('the next stream registered', () => w.record().streams[1]?.registered === true, 60_000);
  assert.equal((link.status() as { earlier_unknown: number }).earlier_unknown, 0);
  link.stopSending('second-capture-session');
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('a manifest not yet written when the link is ready is not a lasting fault: once lines are stored the status says nothing of it', { timeout: 120_000 }, async () => {
  const w = world();
  const link = w.make();
  link.begin(SESSION, w.capture);
  await until('sending', () => state(link.status()) === 'sending');
  link.appended(SESSION, 0); // no manifest yet
  await quiet(200);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  assert.equal((link.status() as { detail: string | null }).detail, null);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
});

real('sends that get no answer: the link says it is not storing now (the same job is tried again), and storing again once one is answered', { timeout: 120_000 }, async () => {
  let dropped = 0;
  // One whole upload (its three tries of the batch) gets no answer; the next is answered.
  const w = world({ fault: (r) => (r.method === 'POST' && r.path.endsWith(':batch') && dropped++ < 3 ? 'drop-answer' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => stored(link) === 2);
  const said = w.statuses.flatMap((s) => (s.mode === 'development' ? [[s.state, s.storing] as const] : []));
  assert.equal(said.some(([st, storing]) => st === 'stalled' && storing === false), true, 'not storing while the send went unanswered');
  assert.equal(said.some(([st, storing]) => st !== 'sending' && storing), false, 'storing is only ever said of a live, answered stream');
  assert.equal(w.statuses.some((s) => s.mode === 'development' && s.state === 'stalled' && s.stored === 2), false, 'storing again from the answer on');
  const now = link.status();
  assert.deepEqual(now.mode === 'development' && [now.state, now.storing, now.detail], ['sending', true, null], 'answered again: storing');
  assert.equal(new Set(w.requests.filter((r) => r.path.endsWith(':batch')).map((r) => r.key)).size, 1, 'the same key throughout');
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped');
});
