// The main process's session lifecycle, capture grants and kept ink, run as the real main.ts source in a
// sandbox with Electron replaced by small fakes (no windows, no capture). Covers the reviewed failures:
// Stop during Start, two Starts, a grant after Stop, a failing display list, and ink that cannot be written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import vm from 'node:vm';
import * as zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import { addStroke, undo, type InkStroke } from '../../safari-extension/src/ink.ts';
import * as desktopInk from '../src/shared/desktop-ink.ts';
import { fingerprintToBase64 } from '../src/shared/samples.ts';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SOURCE = stripTypeScriptTypes(fs.readFileSync(path.join(HERE, '../src/main/main.ts'), 'utf8'))
  .replace(/^import .*;$/gm, '')
  .replace(/^export /gm, '')
  .replace('dirname(fileURLToPath(import.meta.url))', "'/fake/dist/apps/windows/src/main'");

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};

class FakeWindow extends EventEmitter {
  static all: FakeWindow[] = [];
  destroyed = false;
  sent: unknown[][] = [];
  webContents = Object.assign(new EventEmitter(), { mainFrame: {}, send: (...a: unknown[]) => void this.sent.push(a), setWindowOpenHandler() {} });
  readonly opts: { transparent?: boolean };
  constructor(opts: { transparent?: boolean }) {
    super();
    this.opts = opts;
    FakeWindow.all.push(this);
  }
  get id(): number {
    return FakeWindow.all.indexOf(this) + 1;
  }
  removeMenu() {}
  setAlwaysOnTop() {}
  setContentProtection() {}
  setIgnoreMouseEvents() {}
  setBounds() {}
  show() {}
  showInactive() {}
  isDestroyed() {
    return this.destroyed;
  }
  destroy() {
    this.destroyed = true;
    this.emit('closed');
  }
  loadURL() {
    return Promise.resolve();
  }
}

type Review = {
  start(sourceId: string): Promise<{ ok: boolean; reason?: string }>;
  end(reason: string): void;
  current(): unknown;
  control(): unknown;
  recoveryInfo(): unknown[];
  retryRecovery(id: string): unknown;
  exportRecovery(id: string, file: string): unknown;
  openInk(id: string): unknown;
  inkContexts(id: string): unknown;
};
function harness() {
  FakeWindow.all = [];
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-main-test-'));
  const sources: Array<Promise<unknown[]>> = [];
  const handlers: Record<string, (...a: unknown[]) => unknown> = {};
  const permission: Record<string, (...a: unknown[]) => unknown> = {};
  const failWrites = { on: false, reads: false };
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 }, scaleFactor: 1 };
  const source = { id: 'screen:1:0', display_id: '1', name: 'Display 1', thumbnail: { toDataURL: () => '' } };
  const quits = { n: 0 };
  const app = Object.assign(new EventEmitter(), { requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit: () => void (quits.n += 1), exit() {}, getPath: () => userData, setPath() {} });
  const sandbox = {
    ...fs,
    writeFileSync: (...a: Parameters<typeof fs.writeFileSync>) => {
      if (failWrites.on && String(a[0]).startsWith(userData)) throw new Error('EIO: i/o error (injected)');
      return fs.writeFileSync(...a);
    },
    readFileSync: (...a: Parameters<typeof fs.readFileSync>) => {
      if (failWrites.reads && String(a[0]).includes(`${path.sep}context${path.sep}`)) throw new Error('EIO: i/o error (injected)');
      return fs.readFileSync(...a);
    },
    createHash: crypto.createHash,
    randomBytes: crypto.randomBytes,
    ...path,
    fileURLToPath: url.fileURLToPath,
    pathToFileURL: url.pathToFileURL,
    release: () => '10.0.26200',
    ...desktopInk,
    app,
    BrowserWindow: FakeWindow,
    desktopCapturer: { getSources: () => sources.shift() ?? Promise.resolve([source]) },
    dialog: {},
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => [display], getPrimaryDisplay: () => display }),
    session: { defaultSession: { setPermissionRequestHandler: (f: never) => (permission['request'] = f), setPermissionCheckHandler: (f: never) => (permission['check'] = f), setDisplayMediaRequestHandler: (f: never) => (permission['display'] = f) } },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    Menu: { setApplicationMenu() {} },
    net: {},
    ipcMain: { handle: (n: string, f: never) => (handlers[n] = f), on: (n: string, f: never) => (handlers[n] = f) },
    process: { ...process, env: {} },
    Buffer,
    Response,
    URL,
    console,
    setTimeout: () => 0,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${SOURCE}\nglobalThis.review = { start, end, current: () => current, control: () => control, recoveryInfo, retryRecovery, exportRecovery, inkContexts, openInk };`, sandbox);
  const review = (sandbox as unknown as { review: Review }).review;
  return { ...review, userData, sources, handlers, permission, failWrites, source, quits, liveOverlays: () => FakeWindow.all.filter((w) => w.opts.transparent && !w.destroyed) };
}
type H = ReturnType<typeof harness>;
type Session = { overlay: FakeWindow; ending: boolean; capture: string; doc: desktopInk.DesktopInk };
/** Values from the sandbox, as plain data (its objects have the sandbox's prototypes). */
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
async function running(h: H): Promise<Session> {
  await settle(); // the app starts
  assert.deepEqual(plain(await h.start('screen:1:0')), { ok: true });
  return h.current() as Session;
}
function grantPermission(h: H, s: Session): boolean {
  h.handlers['lc:arm-capture']!({ sender: s.overlay.webContents });
  let granted = false;
  h.permission['request']!(s.overlay.webContents, 'media', (g: boolean) => (granted = g), { isMainFrame: true, mediaTypes: [] });
  return granted;
}

test('Stop while Start is still listing displays cancels it: no session and no overlay', async () => {
  const h = harness();
  await settle();
  const listing = deferred<unknown[]>();
  h.sources.push(listing.promise);
  const starting = h.start('screen:1:0');
  h.end('stopped during Start');
  listing.resolve([h.source]);
  const r = await starting;
  assert.equal(r.ok, false);
  assert.equal(h.current(), null);
  assert.equal(h.liveOverlays().length, 0);
});

test('two Starts at once: one session and one overlay; the other is refused before anything is created', async () => {
  const h = harness();
  await settle();
  const a = deferred<unknown[]>();
  h.sources.push(a.promise);
  const first = h.start('screen:1:0');
  const second = await h.start('screen:1:0');
  assert.equal(second.ok, false);
  a.resolve([h.source]);
  assert.equal((await first).ok, true);
  assert.equal(h.liveOverlays().length, 1);
  h.end('stop');
  assert.ok((h.current() as Session).overlay.sent.some((m) => m[0] === 'lc:stop'), 'the one overlay is asked to stop');
});

test('a display grant whose display list arrives after Stop is refused', async () => {
  const h = harness();
  const s = await running(h);
  assert.equal(grantPermission(h, s), true);
  const listing = deferred<unknown[]>();
  h.sources.push(listing.promise);
  const answers: unknown[] = [];
  const asked = h.permission['display']!({ frame: s.overlay.webContents.mainFrame, videoRequested: true, audioRequested: false }, (r: unknown) => answers.push(r)) as Promise<void>;
  h.end('stopped while the display list was pending');
  listing.resolve([h.source]);
  await asked;
  assert.deepEqual(plain(answers), [{}], 'refused exactly once');
});

test('a failing display list is refused exactly once and ends the session with the reason', async () => {
  const h = harness();
  const s = await running(h);
  grantPermission(h, s);
  h.sources.push(Promise.reject(new Error('enumeration unavailable')));
  const answers: unknown[] = [];
  await h.permission['display']!({ frame: s.overlay.webContents.mainFrame, videoRequested: true, audioRequested: false }, (r: unknown) => answers.push(r));
  assert.deepEqual(plain(answers), [{}]);
  assert.equal(s.ending, true);
  assert.equal(s.capture, 'used');
  const sent = s.overlay.sent.find((m) => m[0] === 'lc:stop');
  assert.match(String(sent?.[1]), /enumeration unavailable/);
});

// A one-pixel PNG as a context picture.
const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const PNG_SHA = crypto.createHash('sha256').update(PNG_BYTES).digest('hex');
function withStroke(doc: desktopInk.DesktopInk): desktopInk.DesktopInk {
  const stroke: InkStroke = { id: 's1', input: 'pen', display: 'screen', points: [[10, 10, 0, 0.5], [90, 10, 20, 0.5]], created_at: '2026-09-30T10:00:00.000Z', source: { title: 'Display 1', viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } }, anchor: null, derived_from: null };
  const context: desktopInk.StrokeContext = { reason: 'writing_started', from_point: 0, frame_seq: 2, frame_taken_at: 't', frame_pixels_sha256: null, region: { x: 0, y: 0, width: 130, height: 58 }, region_px: { x: 0, y: 0, width: 130, height: 58 }, image: { sha256: PNG_SHA, width: 1, height: 1 }, not_observed: desktopInk.NOT_OBSERVED };
  return { ...doc, ink: addStroke(doc.ink, stroke, stroke.created_at), evidence: { s1: { frame_seq: 2, frame_sampled_at: 't', region: { x: 2, y: 2, width: 96, height: 16 }, fingerprint: fingerprintToBase64(new Uint8Array(256).fill(9)), contexts: [context], changes_not_kept: 0 } } };
}

test('ink that cannot be written is kept through Stop and app close, exports with its pictures, and Retry writes it', async () => {
  const h = harness();
  const s = await running(h);
  const doc = withStroke(s.doc);
  const images = [{ sha256: PNG_SHA, bytes: PNG_BYTES }];
  h.failWrites.on = true;
  const saved = h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, JSON.parse(JSON.stringify(doc)), images) as { ok: boolean; reason?: string };
  assert.equal(saved.ok, false);
  assert.match(saved.reason!, /EIO/);
  // Stop: capture ends and the overlay goes, but the newest ink stays in the main process.
  h.end('stopped by the user');
  h.handlers['lc:stopped']!({ sender: s.overlay.webContents }, saved.reason);
  assert.equal(h.current(), null);
  assert.equal(s.overlay.destroyed, true);
  const kept = h.recoveryInfo() as Array<{ id: string; revision: number; exported_to: string | null }>;
  assert.deepEqual(plain(kept.map((k) => [k.id, k.revision])), [[doc.id, 1]]);
  // Closing the app does not drop it.
  let prevented = false;
  (h.control() as FakeWindow).emit('close', { preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
  // Export: one file with the ink and its pictures.
  h.failWrites.on = false;
  const out = path.join(h.userData, 'export.json');
  assert.deepEqual(plain(h.exportRecovery(doc.id, out)), { ok: true, missing: 0 });
  const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(payload.ink.ink.revision, 1);
  assert.deepEqual(Buffer.from(payload.context_pictures_png_base64[PNG_SHA], 'base64'), Buffer.from(PNG_BYTES));
  // Retry writes the ink and its picture; nothing stays kept.
  const retried = h.retryRecovery(doc.id) as { ok: boolean; saved_as: string };
  assert.equal(retried.ok, true);
  assert.equal(retried.saved_as, doc.id);
  const stored = desktopInk.parseDesktopInk(JSON.parse(fs.readFileSync(path.join(h.userData, 'ink', `${doc.id}.json`), 'utf8')), crypto.createHash('sha256').update(doc.id).digest('hex'));
  assert.ok(stored.ok && stored.doc.ink.revision === 1);
  assert.ok(fs.existsSync(path.join(h.userData, 'ink', 'context', `${PNG_SHA}.png`)));
  assert.deepEqual(plain(h.recoveryInfo()), []);
  const reopened = h.inkContexts(doc.id) as { ok: boolean; items: Array<{ picture: string | null; picture_state: string }> };
  assert.equal(reopened.ok, true);
  assert.equal(reopened.items[0]?.picture_state, 'shown');
  prevented = false;
  (h.control() as FakeWindow).emit('close', { preventDefault: () => (prevented = true) });
  assert.equal(prevented, false, 'with nothing kept, the app closes');
});

test('pictures that are not what they claim are not stored, and a missing picture is a gap that never blocks the ink', async () => {
  const h = harness();
  const s = await running(h);
  const doc = JSON.parse(JSON.stringify(withStroke(s.doc)));
  const save = (images: unknown) => h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, doc, images) as { ok: boolean; reason?: string };
  const picture = path.join(h.userData, 'ink', 'context', `${PNG_SHA}.png`);
  assert.equal(save([{ sha256: 'f'.repeat(64), bytes: PNG_BYTES }, { sha256: PNG_SHA, bytes: Uint8Array.from([1, 2, 3]) }]).ok, true, 'the ink is saved');
  assert.equal(fs.existsSync(picture), false, 'neither a picture it does not refer to nor wrong bytes are stored');
  assert.equal((h.inkContexts(doc.id) as { items: Array<{ picture_state: string }> }).items[0]?.picture_state, 'missing');
  assert.equal(save([{ sha256: PNG_SHA, bytes: PNG_BYTES }]).ok, true);
  assert.equal(fs.existsSync(picture), true);
});

// Two one-pixel PNGs that differ.
const PNG2 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));
const PNG2_SHA = crypto.createHash('sha256').update(PNG2).digest('hex');
function withSecondStroke(doc: desktopInk.DesktopInk): desktopInk.DesktopInk {
  const first = doc.evidence['s1']!;
  const stroke: InkStroke = { id: 's2', input: 'pen', display: 'screen', points: [[10, 50, 0, 0.5], [90, 50, 20, 0.5]], created_at: '2026-09-30T10:00:05.000Z', source: { title: 'Display 1', viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } }, anchor: null, derived_from: null };
  const context = { ...first.contexts[0]!, frame_seq: 3, image: { sha256: PNG2_SHA, width: 1, height: 1 } };
  return { ...doc, ink: addStroke(doc.ink, stroke, stroke.created_at), evidence: { ...doc.evidence, s2: { ...first, frame_seq: 3, contexts: [context] } } };
}

test('while writing keeps failing, each picture is received once and kept; Retry writes all of them', async () => {
  const h = harness();
  const s = await running(h);
  const one = withStroke(s.doc);
  const two = withSecondStroke(one);
  const save = (d: desktopInk.DesktopInk, images: unknown[]) => h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, JSON.parse(JSON.stringify(d)), images) as { ok: boolean; pictures_received: string[] };
  h.failWrites.on = true;
  assert.deepEqual(plain([save(one, [{ sha256: PNG_SHA, bytes: PNG_BYTES }]).pictures_received, save(two, [{ sha256: PNG2_SHA, bytes: PNG2 }]).pictures_received]), [[PNG_SHA], [PNG2_SHA]], 'the first picture is not sent again');
  const kept = plain(h.recoveryInfo()) as Array<{ id: string; revision: number }>;
  assert.deepEqual(kept.map((k) => k.revision), [2], 'the newer ink replaces the older kept ink it continues');
  h.failWrites.on = false;
  assert.equal((h.retryRecovery(kept[0]!.id) as { ok: boolean }).ok, true);
  for (const sha of [PNG_SHA, PNG2_SHA]) assert.ok(fs.existsSync(path.join(h.userData, 'ink', 'context', `${sha}.png`)));
});

test('kept ink is never replaced or resolved by ink that does not continue it; its older saved version cannot be opened', async () => {
  const h = harness();
  const s = await running(h);
  const one = withStroke(s.doc);
  const save = (d: desktopInk.DesktopInk, images: unknown[] = []) => h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, JSON.parse(JSON.stringify(d)), images) as { ok: boolean };
  assert.equal(save(one, [{ sha256: PNG_SHA, bytes: PNG_BYTES }]).ok, true);
  h.failWrites.on = true;
  const two = withSecondStroke(one);
  assert.equal(save(two, [{ sha256: PNG2_SHA, bytes: PNG2 }]).ok, false);
  h.failWrites.on = false;
  assert.match(String((h.openInk(one.id) as { reason?: string }).reason), /could not be saved; retry, export or discard/);
  // A different continuation of the saved revision (an undo instead of stroke 2) is saved, but stroke 2 stays kept.
  const other = { ...one, ink: undo(one.ink, 't') };
  assert.equal(save(other).ok, true);
  assert.deepEqual((plain(h.recoveryInfo()) as Array<{ revision: number }>).map((k) => k.revision), [2]);
});

test('an export reads what it can: a picture it cannot read is listed as missing, and a failure reaches the user', async () => {
  const h = harness();
  const s = await running(h);
  const one = withStroke(s.doc);
  const save = (d: desktopInk.DesktopInk, images: unknown[] = []) => h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, JSON.parse(JSON.stringify(d)), images) as { ok: boolean };
  assert.equal(save(one, [{ sha256: PNG_SHA, bytes: PNG_BYTES }]).ok, true);
  h.failWrites.on = true;
  assert.equal(save(withSecondStroke(one), [{ sha256: PNG2_SHA, bytes: PNG2 }]).ok, false);
  h.failWrites.reads = true;
  const out = path.join(os.tmpdir(), `lc-export-${process.pid}.json`);
  const key = (plain(h.recoveryInfo()) as Array<{ id: string }>)[0]!.id;
  assert.deepEqual(plain(h.exportRecovery(key, out)), { ok: true, missing: 1 });
  const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(payload.context_pictures_png_base64), [PNG2_SHA], 'the held picture of the unsaved stroke is exported');
  assert.deepEqual(payload.context_pictures_missing, [PNG_SHA]);
  fs.rmSync(out);
  assert.equal((h.exportRecovery(key, path.join(h.userData, 'no-such-folder', 'x.json')) as { ok: boolean }).ok, false);
});

test('Stop during Start releases it: another Start is not blocked by the cancelled display listing', async () => {
  const h = harness();
  await settle();
  const stalled = deferred<unknown[]>();
  h.sources.push(stalled.promise);
  const first = h.start('screen:1:0');
  h.end('stopped during Start');
  const second = await h.start('screen:1:0');
  assert.equal(second.ok, true);
  stalled.resolve([h.source]);
  assert.equal((await first).ok, false);
  assert.equal(h.liveOverlays().length, 1);
});

test('Retry of ink kept from an earlier session does not take over the running session', async () => {
  const h = harness();
  const s1 = await running(h);
  const kept = withStroke(s1.doc);
  h.failWrites.on = true;
  h.handlers['lc:save-ink']!({ sender: s1.overlay.webContents }, JSON.parse(JSON.stringify(kept)), [{ sha256: PNG_SHA, bytes: PNG_BYTES }]);
  h.end('stopped');
  h.handlers['lc:stopped']!({ sender: s1.overlay.webContents }, 'EIO');
  h.failWrites.on = false;
  assert.equal((await h.start('screen:1:0')).ok, true);
  const s2 = h.current() as Session;
  const mine = withStroke(s2.doc);
  const save2 = () => h.handlers['lc:save-ink']!({ sender: s2.overlay.webContents }, JSON.parse(JSON.stringify(mine)), [{ sha256: PNG_SHA, bytes: PNG_BYTES }]) as { ok: boolean };
  assert.equal(save2().ok, true);
  assert.equal((h.retryRecovery(kept.id) as { ok: boolean }).ok, true);
  assert.equal((h.current() as Session).doc.id, mine.id, 'the running session still saves its own ink');
  assert.equal(save2().ok, true);
});

test('closing the app while Start lists displays cancels it; kept ink still holds the app open', async () => {
  for (const withKept of [false, true]) {
    const h = harness();
    if (withKept) {
      const s = await running(h);
      h.failWrites.on = true;
      h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, JSON.parse(JSON.stringify(withStroke(s.doc))), [{ sha256: PNG_SHA, bytes: PNG_BYTES }]);
      h.end('stopped');
      h.handlers['lc:stopped']!({ sender: s.overlay.webContents }, 'EIO');
      h.failWrites.on = false;
    } else {
      await settle();
    }
    const listing = deferred<unknown[]>();
    h.sources.push(listing.promise);
    const starting = h.start('screen:1:0');
    let prevented = false;
    (h.control() as FakeWindow).emit('close', { preventDefault: () => (prevented = true) });
    listing.resolve([h.source]);
    assert.equal((await starting).ok, false, 'the late listing starts nothing');
    assert.equal(h.current(), null);
    assert.equal(h.liveOverlays().length, 0);
    assert.equal(prevented, withKept, 'only kept ink holds the app open');
    assert.equal(h.quits.n, 0, 'closing does not quit from here: the window closes (or stays for the kept ink)');
    if (withKept) assert.equal((plain(h.recoveryInfo()) as unknown[]).length, 1, 'the kept ink and its choice remain');
  }
});

// Real, distinct one-pixel PNGs.
const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (kind: string, data: Buffer): Buffer => {
  const t = Buffer.from(kind);
  const size = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, crc]);
};
const onePixel = (i: number): Uint8Array => {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(1, 0);
  head.writeUInt32BE(1, 4);
  head[8] = 8;
  head[9] = 6;
  return Uint8Array.from(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(Buffer.from([0, i & 255, i >> 8, 70, 255]))), chunk('IEND', Buffer.alloc(0))]));
};

test('a save receives a bounded batch of pictures and names exactly those; the rest are received by the next saves, none lost', async () => {
  const h = harness();
  const s = await running(h);
  const template = withStroke(s.doc);
  let d: desktopInk.DesktopInk = s.doc;
  const pictures: Array<{ sha256: string; bytes: Uint8Array }> = [];
  for (let i = 0; i < 257; i++) {
    const bytes = onePixel(i);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    const id = `stroke${i}`;
    const stroke = { ...template.ink.strokes['s1']!, id };
    const e = structuredClone(template.evidence['s1']!);
    (e.contexts[0] as { image: unknown }).image = { sha256: sha, width: 1, height: 1 };
    d = { ...d, ink: addStroke(d.ink, stroke, stroke.created_at), evidence: { ...d.evidence, [id]: e } };
    pictures.push({ sha256: sha, bytes });
  }
  const pending = new Map(pictures.map((p) => [p.sha256, p.bytes]));
  let calls = 0;
  while (pending.size > 0 && calls < 10) {
    calls += 1;
    const answer = h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, JSON.parse(JSON.stringify(d)), [...pending].map(([sha256, bytes]) => ({ sha256, bytes }))) as { ok: boolean; pictures_received: string[]; pictures_invalid: string[] };
    assert.equal(answer.ok, true);
    assert.ok(answer.pictures_received.length <= desktopInk.PICTURES_PER_SAVE);
    assert.deepEqual(plain(answer.pictures_invalid), []);
    for (const sha of answer.pictures_received) {
      assert.ok(pending.has(sha), 'only pictures that were sent are named');
      assert.ok(fs.existsSync(path.join(h.userData, 'ink', 'context', `${sha}.png`)), 'a named picture is on disk');
      pending.delete(sha);
    }
  }
  assert.equal(calls, Math.ceil(257 / desktopInk.PICTURES_PER_SAVE));
  assert.equal(pictures.filter((p) => !fs.existsSync(path.join(h.userData, 'ink', 'context', `${p.sha256}.png`))).length, 0);
});
