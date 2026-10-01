// The app (the real main.ts and overlay.ts under the unit-test fakes) with the development capture link enabled,
// against the released host's own code over a kept in-memory store (tests/host-memory.py): an explicit Start stores
// each retained frame and its editable-ink original through the host, the control window is told, the overlay knows
// storage is on, and Stop ends the stream with nothing sent after it. Without the configuration nothing changes.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { deferred, harness, running, plain, quitLinks, settle, type FakeWindow } from './main-harness.ts';
import { FakeChild, fakeService, fakeSpawn, readyFor, seedRecord } from './link-fakes.ts';
import { controlPage } from './control-page.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { startHost } from '../src/main/capture-host.ts';
import { loopbackTransport, type Transport } from '../src/main/loopback-http.ts';
import { hostAvailable, memoryLaunch, newToken, privateBackend, record, removeCopies } from './host-fixture.ts';

after(() => fakeChildren.splice(0).forEach((c) => c.exit(1))); // first: a fake host a failed test left waiting
after(quitLinks); // before the Backend copies go: a link's host runs from one
after(removeCopies);
const temps: string[] = [];
after(() => temps.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const temp = (prefix: string): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
};
const real = hostAvailable ? test : test.skip;
type Said = { mode: string; state?: string; stored?: number; unknown?: number; storing?: boolean };

test('without the development configuration the link is off: no status, and the overlay is told nothing is stored', async () => {
  const h = harness();
  const s = await running(h);
  const ready = plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { development: boolean };
  assert.equal(ready.development, false);
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
  const ready = plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { development: boolean };
  assert.equal(ready.development, true, 'the overlay is told the development link is on (never whether it is storing: that changes)');
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
  assert.equal(said()?.storing, true, 'storing now');
  assert.match(await askCard(page), CARD_DEVELOPMENT);
  const captures = path.join(h.userData, 'captures');
  const capture = path.join(captures, fs.readdirSync(captures)[0]!);
  const coordination = JSON.parse(fs.readFileSync(path.join(h.userData, 'capture-host', 'coordination.json'), 'utf8'));
  const stream = coordination.streams[0];
  assert.deepEqual([stream.capture_session, stream.grant, stream.registered, stream.state.state], [path.basename(capture), 'consumed', true, 'live']);
  // Stop: the stream is stopped; later lines (the ended line) are not sent.
  h.end('stopped by the test');
  await until('the overlay confirmed the Stop', () => page.acks.length > 0, 5000);
  await until('the link stopped', () => said()?.state === 'stopped', 30_000);
  assert.equal(said()?.storing, false, 'no longer storing');
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

/**
 * The app with its link on (the released host's own code, kept in-memory store), every request of its link recorded.
 * `lose`: whether the answer to a request is lost after the host answered it.
 */
function app(lose: (r: { method: string; path: string }) => boolean = () => false) {
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
    const answer = await loopbackTransport(r);
    if (lose({ method: r.method, path: u.pathname })) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    return answer;
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

real('an ASK card left open while storing is lost and then recovers is never untrue: it does not say whether frames are being stored; the control window does', { timeout: 120_000 }, async () => {
  let lost = 0;
  let losing = false;
  // One whole upload (its three tries of the batch) loses its answers; the next is answered.
  const w = app((r) => losing && r.method === 'POST' && r.path.endsWith(':batch') && lost++ < 3);
  const s = await running(w.h);
  const { page, step } = await frames(w.h, s);
  const header = (): string => {
    const p = controlPage();
    p.showLink(w.said());
    return p.nodes['ai']!.textContent;
  };
  await step(20);
  await until('storing', () => w.said()?.storing === true && (w.said()?.stored ?? 0) >= 1, 30_000);
  assert.match(header(), LIVE_HEADER);
  const card = await askCard(page, true); // left open
  assert.match(card, CARD_DEVELOPMENT);
  assert.doesNotMatch(card, CLAIMS_STORAGE);
  // Loss: the next upload gets no answer.
  losing = true;
  const before = w.said()?.stored ?? 0;
  await step(60);
  await until('storage not confirmed', () => w.said()?.state === 'stalled', 30_000);
  assert.equal(w.said()?.storing, false);
  assert.doesNotMatch(header(), CLAIMS_STORAGE);
  assert.deepEqual(plain(page.review.card()), { text: card, image: true }, 'the open card is unchanged, and still true');
  // Recovery: the same job is answered.
  await until('storing again', () => w.said()?.storing === true && (w.said()?.stored ?? 0) > before, 30_000);
  assert.match(header(), LIVE_HEADER);
  assert.deepEqual(plain(page.review.card()), { text: card, image: true }, 'unchanged again, and still true');
  page.click('close');
  w.h.end('stopped by the test');
  await until('the link stopped', () => w.said()?.state === 'stopped', 30_000);
});

const fakeChildren: FakeChild[] = [];
/**
 * The app with its link on and a fake host child (no process, no port), made by `child`. Its requests are answered
 * by a stand-in for the service when `service` is set (registration, source, state, Stop; uploads 503 unless `own`
 * answers them); otherwise no request is expected.
 */
function appWithFakeHost(child: () => FakeChild, service?: { own?: Parameters<typeof fakeService>[1] }) {
  const dsnFile = path.join(temp('lc-dsn-'), 'test-database.dsn');
  fs.writeFileSync(dsnFile, 'host=/nonexistent-socket dbname=lc_p0_test');
  const configFile = path.join(temp('lc-config-'), 'dev-capture-host.json');
  fs.writeFileSync(configFile, JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', launch: { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' }, dsn_file: dsnFile }));
  const children: FakeChild[] = [];
  const noRequest: Transport = async () => {
    throw new Error('no request is made here');
  };
  const made = (): FakeChild => {
    const c = child();
    fakeChildren.push(c);
    return c;
  };
  let transport = noRequest;
  const h = harness({ env: { LC_DEV_CAPTURE_HOST: configFile }, link: { host: { spawn: fakeSpawn(made, children).spawn, ready_ms: 60_000, end_ms: 200 }, transport: (r) => transport(r), retry_ms: 20, stop_wait_ms: 500 } });
  const fake = service ? fakeService(path.join(h.userData, 'capture-host', 'coordination.json'), service.own) : null;
  if (fake) transport = fake.transport;
  const said = (): Said & { detail?: string | null } | undefined => {
    const last = (h.control() as unknown as FakeWindow).sent.filter((m) => m[0] === 'lc:link').at(-1)?.[1];
    return last === undefined ? undefined : (plain(last) as Said);
  };
  /** The control window's header and link line for what the app said last (or, before it said anything, says when asked). */
  const shown = (): string => {
    const p = controlPage();
    p.showLink(said() ?? plain(h.handlers['lc:link-state']!({ sender: (h.control() as unknown as FakeWindow).webContents })));
    return `${p.nodes['ai']!.textContent}\n${p.nodes['link']!.textContent}`;
  };
  return { h, children, said, shown, requests: fake?.requests ?? [] };
}
/** An ASK circle on the overlay page; the card's text (the card is then closed). */
async function askCard(page: Awaited<ReturnType<typeof frames>>['page'], leaveOpen = false): Promise<string> {
  page.review.mode('ASK');
  page.pointer('pointerdown', 2, 190, 95);
  for (const [x, y] of [[400, 95], [400, 125], [190, 125]] as const) page.pointer('pointermove', 2, x, y);
  page.pointer('pointerup', 2, 192, 97);
  await until('the ASK card', () => page.review.card() !== null);
  const text = page.review.card()!.text;
  if (!leaveOpen) page.click('close');
  return text;
}
/** The header with a live stream: frames are sent; stored is only what the service confirmed. */
const LIVE_HEADER = /are also sent to a local test capture service on it\. A record counts as stored only once that service confirms it/;
/** Any text saying frames are stored (as a fact, now): what must not be said while they are not. */
const CLAIMS_STORAGE = /(are|is) (also )?(being )?stored|also (being )?stored in a local test capture service/;
/** The ASK card with the link on: what the service may do, and where its state is; nothing that can change after. */
const CARD_DEVELOPMENT = /^No AI is connected: this selection was not sent to any AI\. \(Development mode: a local test capture service on this device may also store the whole-display frames kept here, only while it is connected and answering; the control window shows whether it is storing now\.\)\n/;

// QA-WIN-03. The harness's app.quit() behaves as Electron's: a quit asked for while will-quit is being delivered is
// ignored, and a prevented quit is dropped.
test('closing the app with the link on and nothing to stop: the app really quits (the quit is asked again in a later task, not while will-quit is delivered)', { timeout: 30_000 }, async () => {
  const { h, children } = appWithFakeHost(() => new FakeChild({ ready: null }));
  await settle(); // the app starts; no Start
  h.app.quit(); // as the control window closing does
  assert.equal(h.quits.n, 0, 'held for the link\'s stop');
  await until('the app quit', () => h.quits.n === 1, 5000);
  assert.deepEqual([h.quits.ignored, children.length], [0, 0], 'no quit was asked while one was under way; no host was ever started');
});

test('quitting while the link is still stopping: every quit waits for that one stop; the app quits once, after it settled', { timeout: 30_000 }, async () => {
  // A host that takes its record and says nothing until told: the Start stays connecting.
  const { h, children } = appWithFakeHost(() => new FakeChild({ ready: null, hold: true }));
  await running(h);
  await until('the host has its record', () => children[0]?.input.endsWith('\n') === true, 5000);
  h.app.quit();
  await settle();
  await new Promise((r) => setImmediate(r));
  h.app.quit(); // a second quit (another window closing, say) while the first is pending
  await settle();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([h.quits.n, h.quits.ignored], [0, 0], 'both quits wait; the app has not quit yet');
  children[0]!.exit(0); // the host ends without READY: the Stop can now finish
  await until('the app quit, once', () => h.quits.n === 1, 5000);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([h.quits.n, h.quits.ignored, children.length], [1, 0, 1]);
});

// QA-WIN-04.
test('a service that is not available: the link line, the header and the ASK card all say nothing is being stored now', { timeout: 30_000 }, async () => {
  const { h, children, said, shown } = appWithFakeHost(() => new FakeChild({ ready: null, hold: true }));
  // Before any Start: configured, and nothing is promised.
  await settle();
  assert.doesNotMatch(shown(), CLAIMS_STORAGE);
  assert.match(shown(), /Capture storage \(development\): not connected yet \(a connection is tried when you press Start\)\. 0 record\(s\) stored/);
  const s = await running(h);
  const { page } = await frames(h, s);
  // Connecting (the host has its record and has not answered): configured, but not storing.
  await until('the host has its record', () => children[0]?.input.endsWith('\n') === true, 5000);
  assert.deepEqual([said()?.state, said()?.storing], ['connecting', false]);
  const early = await askCard(page);
  assert.doesNotMatch(early, CLAIMS_STORAGE, 'while connecting');
  assert.match(early, CARD_DEVELOPMENT, 'nothing is promised either way while a connection may still be made');
  // The host ends without READY, as with a service that is not available.
  children[0]!.stderr.write('{"format":"lc-desktop-capture-host-error-v1","error":"unavailable"}\n');
  await settle();
  children[0]!.exit(1);
  await until('not connected', () => said()?.state === 'not connected', 5000);
  assert.deepEqual([said()?.storing, said()?.stored, said()?.detail], [false, 0, 'the host ended without READY (unavailable)']);
  const card = await askCard(page);
  assert.match(card, CARD_DEVELOPMENT);
  assert.doesNotMatch(card, CLAIMS_STORAGE);
  assert.doesNotMatch(shown(), CLAIMS_STORAGE);
  assert.match(shown(), /A local test capture service on it is not storing them now; its state, and the latest capture's counts, are below[\s\S]*not connected \(the frames stay on this device\)\. 0 record\(s\) stored/);
  h.end('stopped by the test');
  await until('stopped', () => said()?.state === 'stopped', 5000);
  assert.doesNotMatch(shown(), CLAIMS_STORAGE, 'nor after the Stop');
});

test('the texts follow the link as it changes: storing only while the stream is live and answered, not while a send goes unanswered, nor once the Stop has begun; an ASK card left open is never made untrue', { timeout: 30_000 }, async () => {
  // A host that says READY, and a service that registers the stream and its source and then answers no upload.
  const { h, said, shown } = appWithFakeHost(() => new FakeChild({ ready: readyFor }), {});
  const s = await running(h);
  const { page, step } = await frames(h, s);
  // Live, nothing retained yet: storing, with no false error about a manifest not yet made.
  await until('live', () => said()?.state === 'sending', 5000);
  assert.deepEqual([said()?.storing, said()?.detail], [true, null]);
  assert.match(shown(), /are also sent to a local test capture service on it\. A record counts as stored only once that service confirms it; the counts are below[\s\S]*Capture storage \(development\): connected: frames are sent as they are kept\. 0 record\(s\) stored\. AI: not connected\.$/);
  assert.doesNotMatch(shown(), CLAIMS_STORAGE, 'even live, nothing says frames are being stored: only what the service confirmed is counted');
  // An ASK card made now, and left open (W-COPY-01): it says nothing of whether frames are being stored.
  const card = await askCard(page, true);
  assert.match(card, CARD_DEVELOPMENT);
  assert.doesNotMatch(card, CLAIMS_STORAGE);
  // A frame is retained; its upload is not answered (503): storage is not confirmed, and the control window says so.
  await step(20);
  await until('a send not answered', () => said()?.state === 'stalled', 10_000);
  assert.deepEqual([said()?.storing, said()?.stored], [false, 0]);
  assert.doesNotMatch(shown(), CLAIMS_STORAGE);
  assert.match(shown(), /Whether a local test capture service on it is storing them now is not confirmed[\s\S]*Capture storage \(development\): storage not confirmed now \(the frames are kept on this device\)\. 0 record\(s\) stored;[\s\S]*storage of the last send is not confirmed \(no answer, or the service said to send it again later\); the same record\(s\) are tried again\. AI: not connected\.$/);
  // The card still open is the same card (its picture, region, frame, time and ink line), and still true.
  assert.deepEqual(plain(page.review.card()), { text: card, image: true });
  page.click('close');
  assert.match(await askCard(page), CARD_DEVELOPMENT, 'and a card made now says the same');
  // The Stop: from its first moment nothing says frames are being stored.
  const states: Array<[string | undefined, boolean | undefined]> = [];
  const control = h.control() as unknown as FakeWindow;
  const from = control.sent.length;
  h.end('stopped by the test');
  await until('stopped', () => said()?.state === 'stopped', 10_000);
  for (const m of control.sent.slice(from)) if (m[0] === 'lc:link') states.push([(m[1] as Said).state, (m[1] as Said).storing]);
  assert.equal(states.some(([state]) => state === 'stopping'), true);
  assert.equal(states.every(([, storing]) => storing === false), true, 'never storing once the Stop has begun');
});

test('a Stop while frames are being stored: from its first moment nothing says they are', { timeout: 30_000 }, async () => {
  const { h, said } = appWithFakeHost(() => new FakeChild({ ready: readyFor }), {});
  await running(h);
  await until('live', () => said()?.storing === true, 5000);
  const control = h.control() as unknown as FakeWindow;
  const from = control.sent.length;
  h.end('stopped by the test');
  await until('stopped', () => said()?.state === 'stopped', 10_000);
  const after = control.sent.slice(from).filter((m) => m[0] === 'lc:link').map((m) => [(m[1] as Said).state, (m[1] as Said).storing]);
  assert.deepEqual(after[0], ['stopping', false]);
  assert.equal(after.every(([, storing]) => storing === false), true);
});

(process.platform === 'win32' ? test.skip : test)('after a record-write fault, a new Start is not said to be storing; the control window then keeps the earlier outcome', { timeout: 30_000 }, async () => {
  const configFile = path.join(temp('lc-config-'), 'dev-capture-host.json');
  fs.writeFileSync(configFile, JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', launch: { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/', python: '/unused' }, dsn_file: '/not-read' }));
  const h = harness({ env: { LC_DEV_CAPTURE_HOST: configFile }, link: { readDsn: () => 'host=/nonexistent-socket dbname=lc_p0_test' } });
  // An earlier stream, ended, with two records stored and one not known (written before the app reads it).
  const doc = seedRecord();
  Object.assign(doc.streams[0]!, { final: 'stopped', state: { ...doc.streams[0]!.state, state: 'stopped' } });
  const dir = path.join(h.userData, 'capture-host');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'coordination.json'), JSON.stringify(doc));
  fs.chmodSync(dir, 0o500); // its record can no longer be written
  try {
    await running(h);
    const said = (): Record<string, unknown> | undefined => plain((h.control() as unknown as FakeWindow).sent.filter((m) => m[0] === 'lc:link').at(-1)?.[1]) as Record<string, unknown> | undefined;
    await until('the fault is said', () => said()?.['sends_stopped'] === true, 5000);
    assert.deepEqual([said()?.['mode'], said()?.['storing'], said()?.['stored'], said()?.['unknown']], ['development', false, 0, 0], 'not storing; this Start\'s own counts: nothing');
    const p = controlPage();
    p.showLink(said());
    assert.doesNotMatch(p.nodes['ai']!.textContent, CLAIMS_STORAGE);
    h.end('stopped by the test');
    await until('stopped', () => said()?.['state'] === 'stopped', 5000);
    assert.deepEqual([said()?.['mode'], said()?.['stored'], said()?.['unknown'], said()?.['sends_stopped']], ['development', 2, 1, true], 'then the last recorded outcome, as before the fault');
  } finally {
    fs.chmodSync(dir, 0o700);
  }
});
