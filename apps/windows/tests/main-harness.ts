// The real main.ts source run in a vm with Electron replaced by small fakes (no windows, no capture), for tests.
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { addStroke, type InkStroke } from '../../safari-extension/src/ink.ts';
import * as desktopInk from '../src/shared/desktop-ink.ts';
import { fingerprintToBase64 } from '../src/shared/samples.ts';
import * as retention from '../src/shared/retention.ts';
import { CaptureLink, readLinkConfig, type LinkOptions } from '../src/main/capture-link.ts';
import { readConnectorConfig, Subscription, type SubscriptionOptions } from '../src/main/subscription.ts';
import { toFramePixels } from '../src/shared/samples.ts';
import { ASSISTANCE, contextProblem, PNG_MAX_BYTES, questionOf } from '../src/shared/subscription-ask.ts';
import { appSource } from './source.ts';

export const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const SOURCE = appSource('src/main/main.ts')
  .replace(/^import .*;$/gm, '')
  .replace(/^export /gm, '')
  .replace('dirname(fileURLToPath(import.meta.url))', "'/fake/dist/apps/windows/src/main'");

const links: CaptureLink[] = [];
const subscriptions: Subscription[] = [];
/** Every capture link and subscription connector an app under test made is stopped (its child ended), even after a failed test. */
export const quitLinks = async (): Promise<void> => void (await Promise.all([...links.splice(0).map((l) => l.quit(10_000)), ...subscriptions.splice(0).map((x) => x.quit())]));

/** App data folders of the apps under test (they hold retained pictures): removed when the test process ends. */
const appData: string[] = [];
process.on('exit', () => {
  for (const d of appData) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // still in use (Windows): left for the system's own cleanup of the temporary folder
    }
  }
});

export type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
export const deferred = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};

export class FakeWindow extends EventEmitter {
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

export type Review = {
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
/**
 * `env`: the app's environment (empty by default: the development capture link stays off). `link`: options added to
 * the app's own capture link (a recording transport, shorter bounds), for tests.
 */
export function harness(options: { env?: Record<string, string>; link?: Partial<LinkOptions>; subscription?: Partial<SubscriptionOptions>; /** For one test: the subscription layer forgets to cancel (the app's own fence must still hold). */ leakySubscription?: boolean } = {}) {
  FakeWindow.all = [];
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-main-test-'));
  appData.push(userData);
  const sources: Array<Promise<unknown[]>> = [];
  const handlers: Record<string, (...a: unknown[]) => unknown> = {};
  const permission: Record<string, (...a: unknown[]) => unknown> = {};
  /** on: every write fails; reads: context pictures cannot be read; partialAppend: the next append writes N bytes, then fails; truncate: truncating fails. */
  const failWrites = { on: false, reads: false, partialAppend: 0, truncate: false };
  const timers: Array<{ f: () => void; ms: number }> = [];
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 }, scaleFactor: 1 };
  const source = { id: 'screen:1:0', display_id: '1', name: 'Display 1', thumbnail: { toDataURL: () => '' } };
  /** n: times the app really quit (its will-quit not prevented). ignored: quits asked for while one was under way. */
  const quits = { n: 0, ignored: 0 };
  /** Addresses the app opened in the user's browser. */
  const opened: string[] = [];
  // app.quit() as Electron's Browser::Quit does it (no window is ever open here when it is called): a quit asked for
  // while one is under way is ignored; will-quit is delivered, and if it is prevented the quit is dropped. Electron
  // clears its "quitting" state only after that event's handlers and the microtasks they queued have run, so it is
  // cleared here in a later task.
  let quitting = false;
  const events = new EventEmitter();
  const app = Object.assign(events, {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit: (): void => {
      if (quitting) return void (quits.ignored += 1);
      quitting = true;
      let prevented = false;
      events.emit('will-quit', { preventDefault: () => void (prevented = true) });
      if (prevented) return void setImmediate(() => void (quitting = false));
      quits.n += 1; // the app is gone: nothing later quits it again
    },
    exit() {},
    getPath: () => userData,
    setPath() {},
  });
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
    ...retention,
    appendFileSync: (...a: Parameters<typeof fs.appendFileSync>) => {
      if (failWrites.on && String(a[0]).startsWith(userData)) throw new Error('EIO: i/o error (injected)');
      if (failWrites.partialAppend > 0) {
        const n = failWrites.partialAppend;
        failWrites.partialAppend = 0;
        fs.appendFileSync(a[0], String(a[1]).slice(0, n));
        throw new Error('ENOSPC: no space left on device (injected after a partial write)');
      }
      return fs.appendFileSync(...a);
    },
    truncateSync: (...a: Parameters<typeof fs.truncateSync>) => {
      if (failWrites.truncate) throw new Error('EIO: i/o error (injected truncate)');
      return fs.truncateSync(...a);
    },
    // A stand-in for Electron's decoder: a PNG decodes when its IHDR size is readable and it ends with IEND.
    nativeImage: {
      createFromBuffer: (b: Buffer) => {
        const size = retention.pngSize(Uint8Array.from(b));
        const complete = size !== null && b.length >= 12 && b.subarray(b.length - 8, b.length - 4).toString('latin1') === 'IEND';
        return { isEmpty: () => !complete, getSize: () => size ?? { width: 0, height: 0 } };
      },
    },
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
    process: { ...process, env: options.env ?? {} },
    CaptureLink: class extends CaptureLink {
      constructor(o: LinkOptions) {
        super({ ...o, ...options.link });
        links.push(this);
      }
    },
    readLinkConfig,
    // The managed subscription: the app's own class, with a test's connector child in place of the real one.
    Subscription: class extends Subscription {
      constructor(o: SubscriptionOptions) {
        super({ ...o, ...options.subscription });
        subscriptions.push(this);
        if (options.leakySubscription) {
          this.cancel = () => undefined;
          this.stopSession = () => undefined;
        }
      }
    },
    readConnectorConfig,
    toFramePixels,
    ASSISTANCE,
    contextProblem,
    PNG_MAX_BYTES,
    questionOf,
    shell: { openExternal: async (url: string) => void opened.push(url) },
    Buffer,
    Response,
    URL,
    TextDecoder,
    console,
    setTimeout: (f: () => void, ms: number) => void timers.push({ f, ms }),
    setImmediate,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${SOURCE}\nglobalThis.review = { start, end, current: () => current, control: () => control, recoveryInfo, retryRecovery, exportRecovery, inkContexts, openInk };`, sandbox);
  const review = (sandbox as unknown as { review: Review }).review;
  /** Runs the timers set so far with this delay (as if that much time had passed for them). */
  const fire = (ms: number): void => {
    for (const t of timers.splice(0).filter((x) => (x.ms === ms ? true : (timers.push(x), false)))) t.f();
  };
  return { ...review, app, userData, sources, handlers, permission, failWrites, source, quits, opened, fire, liveOverlays: () => FakeWindow.all.filter((w) => w.opts.transparent && !w.destroyed) };
}
export type H = ReturnType<typeof harness>;
export type Session = { overlay: FakeWindow; ending: boolean; capture: string; doc: desktopInk.DesktopInk };
/** Values from the sandbox, as plain data (its objects have the sandbox's prototypes). */
export const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
export async function running(h: H): Promise<Session> {
  await settle(); // the app starts
  assert.deepEqual(plain(await h.start('screen:1:0')), { ok: true });
  return h.current() as Session;
}
export function grantPermission(h: H, s: Session): boolean {
  h.handlers['lc:arm-capture']!({ sender: s.overlay.webContents });
  let granted = false;
  h.permission['request']!(s.overlay.webContents, 'media', (g: boolean) => (granted = g), { isMainFrame: true, mediaTypes: [] });
  return granted;
}


// A one-pixel PNG as a context picture.
export const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
export const PNG_SHA = crypto.createHash('sha256').update(PNG_BYTES).digest('hex');
export function withStroke(doc: desktopInk.DesktopInk): desktopInk.DesktopInk {
  const stroke: InkStroke = { id: 's1', input: 'pen', display: 'screen', points: [[10, 10, 0, 0.5], [90, 10, 20, 0.5]], created_at: '2026-09-30T10:00:00.000Z', source: { title: 'Display 1', viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } }, anchor: null, derived_from: null };
  const context: desktopInk.StrokeContext = { reason: 'writing_started', from_point: 0, frame_seq: 2, frame_taken_at: 't', frame_pixels_sha256: null, region: { x: 0, y: 0, width: 130, height: 58 }, region_px: { x: 0, y: 0, width: 130, height: 58 }, image: { sha256: PNG_SHA, width: 1, height: 1 }, not_observed: desktopInk.NOT_OBSERVED };
  return { ...doc, ink: addStroke(doc.ink, stroke, stroke.created_at), evidence: { s1: { frame_seq: 2, frame_sampled_at: 't', region: { x: 2, y: 2, width: 96, height: 16 }, fingerprint: fingerprintToBase64(new Uint8Array(256).fill(9)), contexts: [context], changes_not_kept: 0 } } };
}

