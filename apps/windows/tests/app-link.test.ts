// The app (the real main.ts and overlay.ts under the unit-test fakes) with the development capture link enabled,
// against the released host's own code over a kept in-memory store (tests/host-memory.py): an explicit Start stores
// each retained frame and its editable-ink original through the host, the control window is told, the overlay knows
// storage is on, and Stop ends the stream with nothing sent after it. Without the configuration nothing changes.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { harness, running, plain, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { startHost } from '../src/main/capture-host.ts';
import { loopbackTransport } from '../src/main/loopback-http.ts';
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
