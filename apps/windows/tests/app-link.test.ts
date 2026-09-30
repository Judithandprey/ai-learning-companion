// The app (the real main.ts and overlay.ts under the unit-test fakes) with the development capture link enabled,
// against the released host's own code over a kept in-memory store (tests/host-memory.py): an explicit Start stores
// each retained frame and its editable-ink original through the host, the control window is told, the overlay knows
// storage is on, and Stop ends the stream with nothing sent after it. Without the configuration nothing changes.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { deferred, harness, running, plain, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { startHost } from '../src/main/capture-host.ts';
import { loopbackTransport, type Transport } from '../src/main/loopback-http.ts';
import { hostAvailable, memoryLaunch, newToken, privateBackend, record, removeCopies } from './host-fixture.ts';

after(removeCopies);
const temps: string[] = [];
after(() => temps.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const temp = (prefix: string): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
};
const real = hostAvailable ? test : test.skip;
type Said = { mode: string; state?: string; stored?: number; unknown?: number };

test('without the development configuration the link is off: no status, and the overlay is told nothing is stored', async () => {
  const h = harness();
  const s = await running(h);
  const ready = plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { stored: boolean };
  assert.equal(ready.stored, false);
  assert.deepEqual(plain(await h.handlers['lc:link-state']!({ sender: (h.control() as unknown as FakeWindow).webContents })), { mode: 'off' });
  assert.equal((h.control() as unknown as FakeWindow).sent.some((m) => m[0] === 'lc:link'), false);
});

real('with it: an explicit Start stores each retained frame and its ink original as exact bytes through the host; Stop ends the stream and nothing more is sent', { timeout: 120_000 }, async () => {
  const root = privateBackend();
  const storeDir = temp('lc-store-');
  const dsnFile = path.join(temp('lc-dsn-'), 'test-database.dsn');
  fs.writeFileSync(dsnFile, `host=${storeDir} port=5432 dbname=lc_p0_test user=test connect_timeout=5`);
  const configFile = path.join(temp('lc-config-'), 'dev-capture-host.json');
  fs.writeFileSync(configFile, JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', launch: memoryLaunch(root), dsn_file: dsnFile }));
  const h = harness({ env: { LC_DEV_CAPTURE_HOST: configFile } });
  const s = await running(h);
  const said = (): Said | undefined => plain((h.control() as unknown as FakeWindow).sent.filter((m) => m[0] === 'lc:link').at(-1)?.[1]) as Said | undefined;
  const ready = plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { stored: boolean };
  assert.equal(ready.stored, true, 'the overlay is told storage is on');
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const step = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.retention().queue;
  };
  await step(20); // a first frame, before any ink
  page.pointer('pointerdown', 1, 100, 200);
  for (const x of [140, 180, 220]) page.pointer('pointermove', 1, x, 200);
  page.pointer('pointerup', 1, 220, 200);
  await page.review.pending();
  await step(60); // a changed frame, drawn with that ink: its ink original is retained with it
  await until('two records stored', () => (said()?.stored ?? 0) >= 2, 30_000);
  const captures = path.join(h.userData, 'captures');
  const capture = path.join(captures, fs.readdirSync(captures)[0]!);
  const coordination = JSON.parse(fs.readFileSync(path.join(h.userData, 'capture-host', 'coordination.json'), 'utf8'));
  const stream = coordination.streams[0];
  assert.deepEqual([stream.capture_session, stream.grant, stream.registered, stream.state.state], [path.basename(capture), 'consumed', true, 'live']);
  // Stop: the stream is stopped; later lines (the ended line) are not sent.
  h.end('stopped by the test');
  await until('the overlay confirmed the Stop', () => page.acks.length > 0, 5000);
  await until('the link stopped', () => said()?.state === 'stopped', 30_000);
  const after = JSON.parse(fs.readFileSync(path.join(h.userData, 'capture-host', 'coordination.json'), 'utf8')).streams[0];
  assert.deepEqual([after.final, after.stops.length, after.stops[0].outcome, after.jobs.every((j: { status: string }) => j.status === 'committed')], ['stopped', 1, 'stopped', true]);
  const manifest = fs.readFileSync(path.join(capture, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(manifest.at(-1).kind, 'ended');
  assert.equal(after.planned_through < manifest.length, true, 'the ended line (after the Stop) was never planned');
  // Read back through a host for the same actor and stream (no consent: reads only): every original, exact bytes.
  const token = newToken();
  const reader = await startHost(memoryLaunch(root), { ...record({ fresh: false, token, stream_id: stream.stream_id, dsn: `host=${storeDir} dbname=lc_p0_test` }), ...coordination.actor, registration: stream.registration });
  assert.equal(reader.ok, true, reader.ok ? '' : reader.reason);
  if (!reader.ok) return;
  try {
    const retained = manifest.filter((l) => l.kind === 'retained');
    assert.ok(retained.length >= 2, 'two changing frames retained');
    assert.notEqual(retained[0].raw.sha256, retained[1].raw.sha256, 'they differ');
    const inked = retained.filter((l) => l.composed?.ink_original?.sha256);
    assert.ok(inked.length >= 1, 'an ink original retained with a frame');
    const originals = new Map<string, string>();
    for (const l of retained) {
      originals.set(`${stream.source_id}.png.${l.raw.sha256}`, path.join(capture, 'frames', `${l.raw.sha256}.png`));
      if (l.composed) originals.set(`${stream.source_id}.png.${l.composed.sha256}`, path.join(capture, 'frames', `${l.composed.sha256}.png`));
      if (l.composed?.ink_original?.sha256) originals.set(`${stream.source_id}.ink.${l.composed.ink_original.sha256}`, path.join(capture, 'ink', `${l.composed.ink_original.sha256}.json`));
    }
    for (const [id, file] of originals) {
      const got = await loopbackTransport({ method: 'GET', url: `${reader.host.origin}/v2/process/sources/${stream.source_id}/versions/1/originals/${id}`, headers: { Authorization: `Bearer ${token}` }, body: null });
      assert.equal(got.status, 200, `${id}: ${got.text}`);
      assert.equal(Buffer.from(JSON.parse(got.text).data_base64, 'base64').equals(fs.readFileSync(file)), true, `${id}: exact bytes`);
    }
  } finally {
    await reader.host.end();
  }
});

/** The app with its link on (the released host's own code, kept in-memory store), every request of its link recorded. */
function app() {
  const root = privateBackend();
  const storeDir = temp('lc-store-');
  const dsnFile = path.join(temp('lc-dsn-'), 'test-database.dsn');
  fs.writeFileSync(dsnFile, `host=${storeDir} port=5432 dbname=lc_p0_test user=test connect_timeout=5`);
  const configFile = path.join(temp('lc-config-'), 'dev-capture-host.json');
  fs.writeFileSync(configFile, JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', launch: memoryLaunch(root), dsn_file: dsnFile }));
  const requests: Array<{ method: string; path: string; key: string | undefined; auth: string | undefined; origin: string }> = [];
  const transport: Transport = async (r) => {
    const u = new URL(r.url);
    if (u.pathname !== '/openapi.json') requests.push({ method: r.method, path: u.pathname, key: r.headers['Idempotency-Key'], auth: r.headers['Authorization'], origin: u.origin });
    return loopbackTransport(r);
  };
  const h = harness({ env: { LC_DEV_CAPTURE_HOST: configFile }, link: { transport, retry_ms: 50, stop_wait_ms: 2000 } });
  const said = (): Said | undefined => plain((h.control() as unknown as FakeWindow).sent.filter((m) => m[0] === 'lc:link').at(-1)?.[1]) as Said | undefined;
  const record = () => JSON.parse(fs.readFileSync(path.join(h.userData, 'capture-host', 'coordination.json'), 'utf8'));
  const manifest = () => {
    const captures = path.join(h.userData, 'captures');
    return fs.readFileSync(path.join(captures, fs.readdirSync(captures)[0]!, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  };
  return { h, requests, said, record, manifest };
}
async function frames(h: ReturnType<typeof harness>, s: Awaited<ReturnType<typeof running>>) {
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const step = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.retention().queue;
  };
  return { page, step };
}

real('the app\'s Stop latches the link at once: a frame retained while the Stop waits is kept on this device, never sent', { timeout: 120_000 }, async () => {
  const w = app();
  const s = await running(w.h);
  const { page, step } = await frames(w.h, s);
  await step(20);
  await step(60);
  await until('two records stored', () => (w.said()?.stored ?? 0) >= 2, 30_000);
  const planned = w.record().streams[0].planned_through;
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  page.scene.shade = 100;
  await page.review.sample(); // a changed frame, its encoding held back
  w.h.end('stopped by the test'); // the Stop begins while it is held
  gate.resolve();
  page.encoding.gate = null;
  await until('the overlay confirmed the Stop', () => page.acks.length > 0, 5000);
  await until('the link stopped', () => w.said()?.state === 'stopped', 30_000);
  const kinds = w.manifest().map((l) => l.kind);
  assert.equal(kinds.filter((k) => k === 'retained').length, 3, 'the held frame was retained on this device');
  assert.equal(w.record().streams[0].planned_through, planned, 'and never planned');
  assert.equal(w.requests.filter((r) => r.path.endsWith(':batch')).length, 1, 'no batch after the Stop');
});

real('however the session ends: the overlay gone (finish without end) stops the stream too', { timeout: 120_000 }, async () => {
  const w = app();
  const s = await running(w.h);
  const { step } = await frames(w.h, s);
  await step(20);
  await step(60);
  await until('two records stored', () => (w.said()?.stored ?? 0) >= 2, 30_000);
  s.overlay.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  await until('the link stopped', () => w.said()?.state === 'stopped', 30_000);
  assert.equal(w.record().streams[0].final, 'stopped');
});

real('the service stopping the stream ends the app\'s own capture session (its end, its ended line), and nothing more is sent', { timeout: 120_000 }, async () => {
  const w = app();
  const s = await running(w.h);
  const { page, step } = await frames(w.h, s);
  await step(20);
  await step(60);
  await until('two records stored', () => (w.said()?.stored ?? 0) >= 2, 30_000);
  const st = w.record().streams[0];
  const auth = w.requests.find((r) => r.auth)!;
  const stop = await loopbackTransport({ method: 'POST', url: `${auth.origin}/v2/process/streams/${st.stream_id}:control`, headers: { Authorization: auth.auth!, 'Content-Type': 'application/json', 'Idempotency-Key': 'external-stop' }, body: JSON.stringify({ contract_version: '0.2.1', device_id: st.registration.device_id, session_id: st.registration.session_id, stream_id: st.stream_id, expected_revision: st.state.revision, action: { kind: 'stop', pre_stop_sequence: null } }) });
  assert.equal(stop.status, 200);
  await step(140); // the next frame: its send is refused, the state is read back stopped
  await until('the overlay was told to stop', () => page.acks.length > 0, 30_000);
  await until('the session ended', () => w.h.current() === null, 30_000);
  const last = w.manifest().at(-1);
  assert.equal(last.kind, 'ended');
  assert.match(last.reason, /the capture storage service stopped this capture/);
  await until('the link stopped', () => w.said()?.state === 'stopped', 30_000);
  const count = w.requests.length;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(w.requests.length, count, 'nothing more is sent');
});

real('a link that cannot write its record does not break the app\'s Start: the capture runs on this device, and the control window says why', { timeout: 60_000 }, async () => {
  const w = app();
  // The app's own folders are there; the link's folder cannot be made.
  for (const d of ['captures', 'ink']) fs.mkdirSync(path.join(w.h.userData, d), { recursive: true });
  fs.chmodSync(w.h.userData, 0o555);
  try {
    const s = await running(w.h); // asserts the Start succeeded
    const { step } = await frames(w.h, s);
    await step(20);
    await until('the link says it cannot write', () => /could not be written/.test(JSON.stringify(w.said() ?? {})), 10_000);
    assert.equal(w.manifest().filter((l) => l.kind === 'retained').length, 1, 'the frame is retained on this device');
    assert.equal(w.requests.length, 0, 'nothing was asked of any host');
    w.h.end('stopped by the test');
  } finally {
    fs.chmodSync(w.h.userData, 0o755);
  }
});
