// The whole overlay.ts, run against the real main.ts (both with Electron, the browser's capture and canvas
// replaced by fakes): once a Stop begins, the overlay takes no new input, the stroke being written before it is
// kept, and the Stop is confirmed only after that is saved. Nothing written on screen disappears.
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import { appSource, replaceOnce } from './source.ts';
import * as ink from '../../safari-extension/src/ink.ts';
import * as modes from '../../safari-extension/src/mode.ts';
import * as desktopInk from '../src/shared/desktop-ink.ts';
import * as samples from '../src/shared/samples.ts';
import * as retention from '../src/shared/retention.ts';
import { deferred, harness, plain, PNG_BYTES, running, type H, type Session } from './main-harness.ts';
import { png } from './png.ts';

// The page is started by the test (no capture): its own startup lines must be there to be left out.
const OVERLAY = replaceOnce(appSource('src/renderer/overlay.ts').replace(/^import .*;$/gm, ''), 'await startCapture();\ntick();', '');
/** Waits until `done()` holds, within `ms`; the reason is in the failure otherwise. */
async function until(what: string, done: () => boolean, ms = 3000): Promise<void> {
  const stop = Date.now() + ms;
  while (!done()) {
    if (Date.now() > stop) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

type Review = {
  mode(m: string): void;
  frame(f: unknown): void;
  endCapture(reason: string): void;
  pending(): Promise<unknown>;
  state(): { doc: desktopInk.DesktopInk; gesture: { points: unknown[] } | null; ended: boolean };
  sample(): Promise<void>;
  retention(): { retained: number; refused: number; deferred: number; pinned: number; queue: Promise<void> };
};

/** The overlay page for session `s`, with pointer input into its ink canvas and a gate on PNG encoding. */
async function overlayPage(h: H, s: Session, policy?: retention.RetentionPolicy) {
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
      return { drawImage() {}, getImageData: () => ({ data: Uint8ClampedArray.from({ length: 1024 }, (_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4) % 2 ? 200 : scene.shade)) }), setTransform() {}, scale() {}, clearRect() {}, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, imageSmoothingQuality: 'low' };
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
    `(async () => { ${OVERLAY}\nglobalThis.review = { mode: (m) => setMode({ ...mode, mode: m }), frame: (f) => { raw = f; presented = f.presented; presentedAt = f.presentedAt; seq = f.seq; }, endCapture, pending: () => Promise.all([saveChain, encoding, sampling]), state: () => ({ doc, gesture, ended }), sample: () => { presented += 1; return (sampling = sampling.then(() => takeSample(0))); }, retention: () => ({ ...__lcOverlay.state().retention, pinned: pins.size, queue: retention }) }; })()`,
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

test('after Stop begins, no new writing is accepted; the stroke written before it is kept and saved before the Stop is confirmed', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  page.pointer('pointerdown', 1, 10, 10);
  page.pointer('pointermove', 1, 40, 40);
  h.end('stopped by the user');
  await until('the Stop to reach the overlay', () => page.review.state().ended);
  await until('the stroke to be committed', () => page.review.state().doc.ink.revision === 1);
  assert.deepEqual(page.acks, [], 'the Stop waits for the stroke written before it (its picture is still being encoded)');
  page.pointer('pointerdown', 2, 70, 70); // a new pen-down while that stroke is being saved
  page.pointer('pointermove', 2, 100, 100);
  assert.equal(page.review.state().gesture, null, 'not accepted: nothing new appears on screen');
  const revision = page.review.state().doc.ink.revision;
  page.click('undo');
  assert.equal(page.review.state().doc.ink.revision, revision, 'undo is not accepted either');
  assert.equal(page.undoDisabled(), true);
  assert.match(page.hint(), /takes no new input/);
  gate.resolve();
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  assert.deepEqual(page.acks, [null], 'confirmed, with nothing unsaved');
  assert.equal(s.overlay.destroyed, true);
  const saved = page.saves.at(-1)!;
  assert.equal(saved.ink.visible.length, 1, 'the stroke written before the Stop');
  assert.deepEqual(plain(saved.ink.strokes[saved.ink.visible[0]!]!.points), [[10, 10, 0, 0.5], [40, 40, 10, 0.5]]);
  assert.equal(saved.evidence[saved.ink.visible[0]!]?.contexts[0]?.image !== null, true, 'with its context picture');
  assert.equal((plain(h.recoveryInfo()) as unknown[]).length, 0);
});

test('when the capture ends by itself, new writing is refused at once, before the Stop arrives', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  page.review.endCapture('Windows stopped delivering this display');
  page.pointer('pointerdown', 1, 10, 10);
  page.pointer('pointermove', 1, 40, 40);
  assert.equal(page.review.state().gesture, null);
  assert.equal(page.review.state().doc.ink.revision, 0);
});

test('a whole-display frame queued for retention when Stop comes is still written, before the Stop is confirmed and the end is recorded', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  await page.review.sample(); // the first frame: retained, its PNGs still being encoded
  h.end('stopped by the user');
  await until('the Stop to reach the overlay', () => page.review.state().ended);
  assert.deepEqual(page.acks, [], 'the Stop waits for the frame observed before it');
  gate.resolve();
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  const manifest = fs.readFileSync(path.join(page.userData, 'captures', page.captureId, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; raw?: { file: string; width: number } });
  assert.deepEqual(manifest.map((l) => l.kind), ['header', 'retained', 'ended']);
  const retained = manifest[1]!;
  assert.equal(retained.raw!.width, 1280);
  assert.ok(fs.existsSync(path.join(page.userData, 'captures', page.captureId, retained.raw!.file)));
});

const manifestOf = (page: { userData: string; captureId: string }): Array<Record<string, unknown>> =>
  fs.readFileSync(path.join(page.userData, 'captures', page.captureId, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

test('retention on the real overlay: material steps are retained; past the limit each later step is recorded once; nothing stays pinned', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0, max_frames: 2 });
  for (const shade of [20, 120, 60]) {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.retention().queue;
  }
  page.scene.shade = 180; // a material step past the limit
  await page.review.sample();
  await page.review.sample(); // unchanged since: nothing more
  page.scene.shade = 240; // another step past the limit
  await page.review.sample();
  h.end('stopped by the user');
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  const kinds = manifestOf(page).map((l) => `${l['kind']}${l['kind'] === 'not_retained' ? `:${l['samples']}` : ''}`);
  assert.deepEqual(kinds, ['header', 'retained', 'retained', 'refused', 'not_retained:2', 'ended'], 'the two later steps, once each; no endless deferral');
  assert.match(String(manifestOf(page).find((l) => l['kind'] === 'not_retained')!['reason']), /retention limit of 2 frames/);
  assert.equal(page.review.retention().pinned, 0);
});

test('retention on the real overlay: a frame refused because writing failed is retried once writing works, carrying what it stood for', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.shade = 20;
  await page.review.sample();
  await page.review.retention().queue;
  h.failWrites.on = true;
  page.scene.shade = 120;
  await page.review.sample();
  await page.review.retention().queue;
  assert.equal(page.review.retention().refused, 1);
  h.failWrites.on = false;
  await page.review.sample(); // the same screen: tried again
  await page.review.retention().queue;
  const retained = manifestOf(page).filter((l) => l['kind'] === 'retained');
  assert.equal(retained.length, 2, 'the step is retained on the retry');
  assert.equal(page.review.retention().pinned, 0);
});
