// The whole overlay.ts, run against the real main.ts (both with Electron, the browser's capture and canvas
// replaced by fakes), for tests: the page, pointer input into its ink canvas, a controllable screen shade and a
// gate on PNG encoding.
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import * as ink from '../../safari-extension/src/ink.ts';
import * as modes from '../../safari-extension/src/mode.ts';
import * as desktopInk from '../src/shared/desktop-ink.ts';
import * as samples from '../src/shared/samples.ts';
import * as retention from '../src/shared/retention.ts';
import { plain, PNG_BYTES, type H, type Session } from './main-harness.ts';
import { png } from './png.ts';
import { appSource, replaceOnce } from './source.ts';

// The page is started by the test (no capture): its own startup lines must be there to be left out.
const OVERLAY = replaceOnce(appSource('src/renderer/overlay.ts').replace(/^import .*;$/gm, ''), 'await startCapture();\ntick();', '');
/** Waits until `done()` holds, within `ms`; the reason is in the failure otherwise. */
export async function until(what: string, done: () => boolean, ms = 3000): Promise<void> {
  const stop = Date.now() + ms;
  while (!done()) {
    if (Date.now() > stop) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

export type Review = {
  mode(m: string): void;
  frame(f: unknown): void;
  endCapture(reason: string): void;
  pending(): Promise<unknown>;
  state(): { doc: desktopInk.DesktopInk; gesture: { points: unknown[] } | null; ended: boolean };
  sample(late?: number): Promise<void>;
  /** A sample that finds no new frame, taken `late` ms after it was due. */
  sameFrameLate(late: number): Promise<void>;
  retention(): { retained: number; refused: number; deferred: number; pinned: number; queue: Promise<void> };
  /** Each visible stroke's alignment as drawn. */
  aligned(): Record<string, string>;
};

/** The overlay page for session `s`, with pointer input into its ink canvas and a gate on PNG encoding. */
export async function overlayPage(h: H, s: Session, policy?: retention.RetentionPolicy) {
  /** What the fake screen shows: every pixel's shade (grids, hashes and fingerprints read it). */
  const scene = { shade: 20 };
  if (policy) (s as unknown as { retention: { policy: retention.RetentionPolicy } }).retention.policy = policy; // the main process enforces the same
  const nodes = new Map<string, FakeNode>();
  const events = new Map<string, (...a: unknown[]) => void>();
  const acks: Array<string | null> = [];
  const saves: desktopInk.DesktopInk[] = [];
  const encoding = { gate: null as Promise<void> | null };
  class FakeNode {
    width = 1280;
    height = 800;
    hidden = true;
    disabled = false;
    textContent = '';
    dataset = {};
    handlers = new Map<string, (e: unknown) => void>();
    constructor(w = 1280, hh = 800) {
      this.width = w;
      this.height = hh;
    }
    getContext() {
      return { drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: Uint8ClampedArray.from({ length: (w * h <= 4096 ? w * h : 256) * 4 }, (_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4) % 2 ? 200 : scene.shade)) }), setTransform() {}, scale() {}, clearRect() {}, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, imageSmoothingQuality: 'low' };
    }
    addEventListener(n: string, f: (e: unknown) => void) {
      this.handlers.set(n, f);
    }
    setAttribute() {}
    setPointerCapture() {}
    closest() {
      return null;
    }
    async convertToBlob() {
      if (encoding.gate) await encoding.gate;
      // Whole-frame canvases give a PNG of their size (retention checks it); small ones the context picture.
      const bytes = this.width >= 1280 ? png(this.width, this.height, 90) : PNG_BYTES;
      return { arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    }
  }
  const node = (id: string): FakeNode => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id)!;
  };
  const buttons = ['NAV', 'ASK', 'WRITE'].map((m) => Object.assign(new FakeNode(), { dataset: { mode: m } }));
  const lc = {
    ready: async () => ({ display: s.doc.display, doc: plain(s.doc), source_id: 'screen:1:0', address_sha256: crypto.createHash('sha256').update(s.doc.id).digest('hex'), retention_policy: policy }),
    interactive() {},
    armCapture: async () => true,
    saveInk: async (d: desktopInk.DesktopInk, p: unknown[]) => {
      saves.push(plain(d) as desktopInk.DesktopInk);
      return h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, plain(d), p);
    },
    sample() {},
    retainFrame: async (facts: unknown, raw: Uint8Array, composed: Uint8Array | null) => h.handlers['lc:retain-frame']!({ sender: s.overlay.webContents }, facts, raw, composed),
    notRetained: (run: unknown) => h.handlers['lc:not-retained']!({ sender: s.overlay.webContents }, run),
    observationGap: (gap: unknown) => h.handlers['lc:observation-gap']!({ sender: s.overlay.webContents }, gap),
    stopping: (pending: unknown) => h.handlers['lc:stopping']!({ sender: s.overlay.webContents }, pending),
    ended: (r: string) => h.handlers['lc:capture-ended']!({ sender: s.overlay.webContents }, r),
    stopped: (r: string | null) => {
      acks.push(r);
      h.handlers['lc:stopped']!({ sender: s.overlay.webContents }, r);
    },
    onStop: (f: (...a: unknown[]) => void) => events.set('stop', f),
    onLoadDoc: (f: (...a: unknown[]) => void) => events.set('load', f),
    loadResult() {},
  };
  const frame = { width: 1280, height: 800, close() {} };
  const sandbox = {
    ...ink,
    ...modes,
    ...desktopInk,
    ...samples,
    ...retention,
    lc,
    crypto: crypto.webcrypto,
    TextEncoder,
    Uint8Array,
    Uint8ClampedArray,
    ArrayBuffer,
    Date,
    Map,
    Set,
    Promise,
    console,
    performance,
    OffscreenCanvas: FakeNode,
    createImageBitmap: async () => frame,
    document: { getElementById: node, createElement: () => ({ videoWidth: 1280, requestVideoFrameCallback() {} }), querySelectorAll: () => buttons, addEventListener() {}, elementFromPoint: () => null },
    window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {} },
    setTimeout() {},
    FileReader: class {
      result = 'data:image/png;base64,';
      onload = (): void => {};
      readAsDataURL() {
        this.onload();
      }
    },
    btoa: (x: string) => Buffer.from(x, 'binary').toString('base64'),
    atob: (x: string) => Buffer.from(x, 'base64').toString('binary'),
  };
  vm.createContext(sandbox);
  await vm.runInContext(
    `(async () => { ${OVERLAY}\nglobalThis.review = { mode: (m) => setMode({ ...mode, mode: m }), frame: (f) => { raw = f; presented = f.presented; presentedAt = f.presentedAt; seq = f.seq; }, endCapture, pending: () => Promise.all([saveChain, encoding, sampling]), state: () => ({ doc, gesture, ended }), sample: (late = 0) => { presented += 1; return (sampling = sampling.then(() => takeSample(late))); }, sameFrameLate: (late) => (sampling = sampling.then(() => takeSample(late))), retention: () => ({ ...__lcOverlay.state().retention, pinned: pins.size, queue: retention }), aligned: () => __lcOverlay.state().aligned }; })()`,
    sandbox,
  );
  const review = (sandbox as unknown as { review: Review }).review;
  review.frame({ bitmap: frame, seq: 1, at: '2026-09-30T12:00:00.000Z', presented: 1, presentedAt: performance.now() });
  review.mode('WRITE');
  // lc:stop from the main process reaches the overlay's Stop handler, as over IPC.
  const send = s.overlay.webContents.send;
  s.overlay.webContents.send = (...args: unknown[]) => {
    send(...args);
    if (args[0] === 'lc:stop') queueMicrotask(() => events.get('stop')!(...args.slice(1)));
  };
  let t = 0;
  const pointer = (name: string, id = 1, x = 10, y = 10): void => node('ink').handlers.get(name)!({ pointerId: id, isPrimary: true, pointerType: 'pen', button: 0, buttons: 1, clientX: x, clientY: y, timeStamp: (t += 10), pressure: 0.5 });
  const click = (id: string): void => node(id).handlers.get('click')!({});
  return { review, scene, acks, saves, encoding, pointer, click, hint: () => node('hint').textContent, undoDisabled: () => node('undo').disabled, userData: h.userData, captureId: s.doc.id };
}

