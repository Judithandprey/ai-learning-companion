// The owned run (tests/owned-host-run.py only; skipped otherwise): the development capture link through the released
// foreground host (services.api.desktop_local, its real PostgreSQL store) on the dedicated test database, one
// pristine actor per case (checked absent first, removed afterwards by the wrapper). Evidence holds no token or DSN.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CaptureLink, testDatabaseDsn } from '../src/main/capture-link.ts';
import { startHost, type HostLaunch } from '../src/main/capture-host.ts';
import { loopbackTransport } from '../src/main/loopback-http.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { harness, plain, running, type FakeWindow } from './main-harness.ts';
import { overlayPage } from './overlay-page.ts';
import { newToken, record } from './host-fixture.ts';
import { ownHostPid, removeTemps, SESSION, state, temp, until, world } from './link-world.ts';

/** `wsl`: run from Windows, launching the host through wsl.exe (the development route); the rest from WSL/Linux. */
type Run = { actors: Record<string, string>; dsn_file: string; backend: string; python: string; evidence: string; wsl?: { distribution: string; user: string } };
const spec = process.env['LC_OWNED_RUN'] ?? (process.env['LC_OWNED_RUN_FILE'] ? fs.readFileSync(process.env['LC_OWNED_RUN_FILE'], 'utf8') : null);
const run: Run | null = spec ? (JSON.parse(spec) as Run) : null;
const owned = run ? test : test.skip;
/** Cases that find or end the host process through /proc run where that is (WSL/Linux), not from Windows. */
const ownedWithProc = run && process.platform === 'linux' ? test : test.skip;
after(removeTemps);
const launch = (): HostLaunch => (run!.wsl ? { kind: 'wsl', distribution: run!.wsl.distribution, user: run!.wsl.user, cd: run!.backend, python: run!.python } : { kind: 'fifo', python: run!.python, cwd: run!.backend });
const evidence = (name: string, value: unknown): void => {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const dsn = fs.readFileSync(run!.dsn_file, 'utf8');
  const host = /host=('?)([^\s']+)\1/.exec(dsn)?.[2] ?? '<none>';
  assert.equal(text.includes(host) || text.includes('Bearer '), false, 'no DSN or bearer in evidence');
  fs.writeFileSync(path.join(run!.evidence, `${name}.json`), text);
};
const requestsOf = (w: ReturnType<typeof world>) => w.requests.map((r) => `${r.method} ${r.path}${r.key ? ` [${r.key}]` : ''}`);
/** The host child's argv and environment hold neither the token nor the DSN. */
const secretsAbsent = async (origin: string, token: string): Promise<boolean> => {
  const pid = await ownHostPid(origin);
  assert.ok(pid, 'the host process was found');
  const dsn = fs.readFileSync(run!.dsn_file, 'utf8').trim();
  const host = /host=('?)([^\s']+)\1/.exec(dsn)?.[2] ?? dsn;
  for (const f of ['cmdline', 'environ']) {
    const text = fs.readFileSync(`/proc/${pid}/${f}`, 'latin1');
    if (text.includes(token) || text.includes(host)) return false;
  }
  return true;
};

owned('the app: an explicit Start stores two changing retained frames and an ink original as exact bytes through the released host; Stop ends the stream and nothing more is sent', { timeout: 300_000 }, async () => {
  const configFile = path.join(temp('lc-config-'), 'dev-capture-host.json');
  fs.writeFileSync(configFile, JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', launch: launch(), dsn_file: run!.dsn_file }));
  const h = harness({ env: { LC_DEV_CAPTURE_HOST: configFile } });
  // The pristine actor of this case, before the app first reads its record.
  fs.mkdirSync(path.join(h.userData, 'capture-host'), { recursive: true });
  fs.writeFileSync(path.join(h.userData, 'capture-host', 'coordination.json'), JSON.stringify({ format: 'lc-windows-capture-link/v1', actor: { user_id: run!.actors['app'], device_id: 'windows-owned-app', session_id: 'learning-owned-app', producer_id: 'windows-app-owned-app' }, last_registered_stream: null, streams: [] }));
  const s = await running(h);
  const said = () => plain((h.control() as unknown as FakeWindow).sent.filter((m) => m[0] === 'lc:link').at(-1)?.[1]) as { state?: string; stored?: number } | undefined;
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const step = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.retention().queue;
  };
  await step(20);
  page.pointer('pointerdown', 1, 100, 200);
  for (const x of [140, 180, 220]) page.pointer('pointermove', 1, x, 200);
  page.pointer('pointerup', 1, 220, 200);
  await page.review.pending();
  await step(60);
  await until('two records stored', () => (said()?.stored ?? 0) >= 2, 60_000);
  h.end('stopped by the owned run');
  await until('the overlay confirmed the Stop', () => page.acks.length > 0, 5000);
  await until('the link stopped', () => said()?.state === 'stopped', 60_000);
  const captures = path.join(h.userData, 'captures');
  const capture = path.join(captures, fs.readdirSync(captures)[0]!);
  const coordination = JSON.parse(fs.readFileSync(path.join(h.userData, 'capture-host', 'coordination.json'), 'utf8'));
  const stream = coordination.streams[0];
  const manifest = fs.readFileSync(path.join(capture, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([stream.final, stream.stops.length, stream.stops[0].outcome], ['stopped', 1, 'stopped']);
  assert.ok(stream.planned_through < manifest.length, 'the ended line, after the Stop, was never planned');
  // Read back through a host for the same actor and stream, without consent (reads only).
  const token = newToken();
  const reader = await startHost(launch(), { ...record({ fresh: false, token, stream_id: stream.stream_id, dsn: testDatabaseDsn(fs.readFileSync(run!.dsn_file, 'utf8'))! }), ...coordination.actor, registration: stream.registration });
  assert.equal(reader.ok, true, reader.ok ? '' : reader.reason);
  if (!reader.ok) return;
  const checked: Array<{ id: string; bytes: number; exact: boolean }> = [];
  try {
    const retained = manifest.filter((l) => l.kind === 'retained');
    assert.ok(retained.length >= 2 && retained[0].raw.sha256 !== retained[1].raw.sha256, 'two changing frames');
    const originals = new Map<string, string>();
    for (const l of retained) {
      originals.set(`${stream.source_id}.png.${l.raw.sha256}`, path.join(capture, 'frames', `${l.raw.sha256}.png`));
      if (l.composed) originals.set(`${stream.source_id}.png.${l.composed.sha256}`, path.join(capture, 'frames', `${l.composed.sha256}.png`));
      if (l.composed?.ink_original?.sha256) originals.set(`${stream.source_id}.ink.${l.composed.ink_original.sha256}`, path.join(capture, 'ink', `${l.composed.ink_original.sha256}.json`));
    }
    assert.ok([...originals.keys()].some((k) => k.includes('.ink.')), 'an ink original among them');
    for (const [id, file] of originals) {
      const got = await loopbackTransport({ method: 'GET', url: `${reader.host.origin}/v2/process/sources/${stream.source_id}/versions/1/originals/${id}`, headers: { Authorization: `Bearer ${token}` }, body: null });
      assert.equal(got.status, 200, `${id}: ${got.status}`);
      const local = fs.readFileSync(file);
      const exact = Buffer.from(JSON.parse(got.text).data_base64, 'base64').equals(local);
      checked.push({ id, bytes: local.length, exact });
      assert.equal(exact, true, `${id}: exact bytes`);
    }
  } finally {
    const end = await reader.host.end();
    assert.equal(end.ended, true);
  }
  evidence(run!.wsl ? 'app-windows' : 'app', { runtime: { node: process.version, electron: process.versions['electron'] ?? null, platform: process.platform, host_launch: launch().kind }, stream_id: stream.stream_id, source_id: stream.source_id, jobs: stream.jobs.map((j: { key: string; status: string; records: number }) => [j.key, j.status, j.records]), stops: stream.stops.map((x: { key: string; outcome: string }) => [x.key, x.outcome]), final: stream.final, state: stream.state, manifest_kinds: manifest.map((l) => l.kind), planned_through: stream.planned_through, originals_read_back: checked });
});

ownedWithProc('a lost batch answer: the same key and body again while live, committed once; the host holds no secret in its argv or environment', { timeout: 300_000 }, async () => {
  let dropped = 0;
  const w = world({ launch: launch(), dsnFile: run!.dsn_file, actor: run!.actors['lost-answer']!, fault: (r) => (r.method === 'POST' && r.path.endsWith(':batch') && dropped++ === 0 ? 'drop-answer' : null) });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => (link.status() as { stored?: number }).stored === 2, 60_000);
  const auth = w.requests.find((r) => r.auth)!;
  const clean = await secretsAbsent(auth.origin, auth.auth!.slice('Bearer '.length));
  assert.equal(clean, true, 'no token or DSN in the host\'s argv or environment');
  const batches = w.requests.filter((r) => r.path.endsWith(':batch'));
  assert.equal(new Set(batches.map((b) => b.key)).size, 1);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped', 60_000);
  const s = w.record().streams[0];
  evidence('lost-answer', { requests: requestsOf(w), jobs: s.jobs.map((j: { key: string; status: string }) => [j.key, j.status]), final: s.final, secrets_in_host_argv_or_environment: !clean });
});

ownedWithProc('a host lost while live is started again without consent; the stream is still live, so sending continues', { timeout: 300_000 }, async () => {
  const w = world({ launch: launch(), dsnFile: run!.dsn_file, actor: run!.actors['lost-host']! });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => (link.status() as { stored?: number }).stored === 2, 60_000);
  const first = w.requests.find((r) => r.auth)!.origin;
  const pid = await ownHostPid(first);
  assert.ok(pid);
  process.kill(pid!, 'SIGKILL');
  await until('connected again', () => w.requests.some((r) => r.origin !== first && r.path === '/v2/process/streams'), 60_000);
  w.append(link, 2);
  await until('stored', () => (link.status() as { stored?: number }).stored === 4, 60_000);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped', 60_000);
  const s = w.record().streams[0];
  assert.equal(s.final, 'stopped');
  evidence('lost-host', { requests: requestsOf(w), hosts: [...new Set(w.requests.map((r) => r.origin))].length, jobs: s.jobs.map((j: { key: string; status: string }) => [j.key, j.status]), final: s.final, notes: s.notes });
});

ownedWithProc('after a restart: reads and one Stop; the unknown job stays unknown and nothing is sent again', { timeout: 300_000 }, async () => {
  let down = false;
  const w = world({ launch: launch(), dsnFile: run!.dsn_file, actor: run!.actors['restart']!, fault: (r) => (down ? 'refuse' : r.method === 'POST' && r.path.endsWith(':batch') ? 'drop-answer' : null) });
  const first = w.make();
  first.begin(SESSION, w.capture);
  w.append(first, 3);
  await until('the job is in doubt', () => w.record().streams[0]?.jobs[0]?.status === 'unknown', 60_000);
  down = true;
  const pid = await ownHostPid(w.requests.find((r) => r.auth)!.origin);
  if (pid) process.kill(pid, 'SIGKILL');
  await until('the first run gave up', () => ['not connected', 'offline'].includes(state(first.status())), 60_000);
  const seen: string[] = [];
  const second = w.make(async (r) => {
    const u = new URL(r.url);
    if (u.pathname !== '/openapi.json') seen.push(`${r.method} ${u.pathname}`);
    return loopbackTransport(r);
  });
  await second.reconcile();
  const s = w.record().streams[0];
  assert.deepEqual([s.final, s.state.state, s.jobs[0].status], ['stopped', 'stopped', 'unknown']);
  assert.deepEqual(seen, [`GET /v2/process/streams/${s.stream_id}`, `POST /v2/process/streams/${s.stream_id}:control`, `GET /v2/process/streams/${s.stream_id}`], 'a read, one Stop, a read');
  evidence('restart', { first_run_requests: requestsOf(w), second_run_requests: seen, unknown_job: { key: s.jobs[0].key, status: s.jobs[0].status, in_doubt: s.jobs[0].in_doubt }, final: s.final, state: s.state });
});

ownedWithProc('the service stopping the stream ends the local capture too; nothing more is sent', { timeout: 300_000 }, async () => {
  const w = world({ launch: launch(), dsnFile: run!.dsn_file, actor: run!.actors['service-stop']! });
  const link = w.make();
  link.begin(SESSION, w.capture);
  w.append(link, 3);
  await until('stored', () => (link.status() as { stored?: number }).stored === 2, 60_000);
  const s = w.record().streams[0];
  const auth = w.requests.find((r) => r.auth)!;
  const stop = await loopbackTransport({ method: 'POST', url: `${auth.origin}/v2/process/streams/${s.stream_id}:control`, headers: { Authorization: auth.auth!, 'Content-Type': 'application/json', 'Idempotency-Key': 'owned-external-stop' }, body: JSON.stringify({ contract_version: '0.2.1', device_id: s.registration.device_id, session_id: s.registration.session_id, stream_id: s.stream_id, expected_revision: s.state.revision, action: { kind: 'stop', pre_stop_sequence: null } }) });
  assert.equal(stop.status, 200);
  w.append(link, 1);
  await until('the local capture asked to end', () => w.ended.length === 1, 60_000);
  link.stopSending(SESSION);
  await until('stopped', () => state(link.status()) === 'stopped', 60_000);
  const count = w.requests.length;
  w.append(link, 1);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(w.requests.length, count);
  evidence('service-stop', { requests: requestsOf(w), ended: w.ended, final: w.record().streams[0].final });
});
