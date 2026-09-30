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
import { EventEmitter } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
const ROOT = process.env.LC_WINDOWS_REVIEW_ROOT;
if (!ROOT) throw new Error('Set LC_WINDOWS_REVIEW_ROOT to exact 57dab97 export');
const { addStroke, undo } = await import(url.pathToFileURL(path.join(ROOT, 'apps/safari-extension/src/ink.ts')).href);
import type { InkStroke } from '../../../apps/safari-extension/src/ink.ts';
const desktopInk = await import(url.pathToFileURL(path.join(ROOT, 'apps/windows/src/shared/desktop-ink.ts')).href);
const { fingerprintToBase64 } = await import(url.pathToFileURL(path.join(ROOT, 'apps/windows/src/shared/samples.ts')).href);

const HERE = path.join(ROOT, 'apps/windows/tests');
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
  const app = Object.assign(new EventEmitter(), { requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {}, exit() {}, getPath: () => userData, setPath() {} });
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
  return { ...review, userData, sources, handlers, permission, failWrites, source, liveOverlays: () => FakeWindow.all.filter((w) => w.opts.transparent && !w.destroyed) };
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

// A one-pixel PNG as a context picture.
const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const PNG_SHA = crypto.createHash('sha256').update(PNG_BYTES).digest('hex');
function withStroke(doc: desktopInk.DesktopInk): desktopInk.DesktopInk {
  const stroke: InkStroke = { id: 's1', input: 'pen', display: 'screen', points: [[10, 10, 0, 0.5], [90, 10, 20, 0.5]], created_at: '2026-09-30T10:00:00.000Z', source: { title: 'Display 1', viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } }, anchor: null, derived_from: null };
  const context: desktopInk.StrokeContext = { reason: 'writing_started', from_point: 0, frame_seq: 2, frame_taken_at: 't', frame_pixels_sha256: null, region: { x: 0, y: 0, width: 130, height: 58 }, region_px: { x: 0, y: 0, width: 130, height: 58 }, image: { sha256: PNG_SHA, width: 1, height: 1 }, not_observed: desktopInk.NOT_OBSERVED };
  return { ...doc, ink: addStroke(doc.ink, stroke, stroke.created_at), evidence: { s1: { frame_seq: 2, frame_sampled_at: 't', region: { x: 2, y: 2, width: 96, height: 16 }, fingerprint: fingerprintToBase64(new Uint8Array(256).fill(9)), contexts: [context], changes_not_kept: 0 } } };
}


export { harness, running, withStroke, PNG_BYTES, PNG_SHA, plain };
