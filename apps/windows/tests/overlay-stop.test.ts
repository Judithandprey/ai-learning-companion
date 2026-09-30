// The whole overlay.ts, run against the real main.ts (both with Electron, the browser's capture and canvas
// replaced by fakes): once a Stop begins, the overlay takes no new input, the stroke being written before it is
// kept, and the Stop is confirmed only after that is saved. Nothing written on screen disappears.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import * as ink from '../../safari-extension/src/ink.ts';
import * as modes from '../../safari-extension/src/mode.ts';
import * as desktopInk from '../src/shared/desktop-ink.ts';
import * as samples from '../src/shared/samples.ts';
import { deferred, harness, plain, PNG_BYTES, running, type H, type Session } from './main-harness.ts';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const OVERLAY = stripTypeScriptTypes(fs.readFileSync(path.join(HERE, '../src/renderer/overlay.ts'), 'utf8'))
  .replace(/^import .*;$/gm, '')
  .replace('await startCapture();\ntick();', '');
const flush = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};

type Review = {
  mode(m: string): void;
  frame(f: unknown): void;
  endCapture(reason: string): void;
  pending(): Promise<unknown>;
  state(): { doc: desktopInk.DesktopInk; gesture: { points: unknown[] } | null; ended: boolean };
};

/** The overlay page for session `s`, with pointer input into its ink canvas and a gate on PNG encoding. */
async function overlayPage(h: H, s: Session) {
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
      return { drawImage() {}, getImageData: () => ({ data: Uint8ClampedArray.from({ length: 1024 }, (_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4) % 2 ? 200 : 20)) }), setTransform() {}, scale() {}, clearRect() {}, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
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
      return { arrayBuffer: async () => Uint8Array.from(PNG_BYTES).buffer };
    }
  }
  const node = (id: string): FakeNode => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id)!;
  };
  const buttons = ['NAV', 'ASK', 'WRITE'].map((m) => Object.assign(new FakeNode(), { dataset: { mode: m } }));
  const lc = {
    ready: async () => ({ display: s.doc.display, doc: plain(s.doc), source_id: 'screen:1:0', address_sha256: crypto.createHash('sha256').update(s.doc.id).digest('hex') }),
    interactive() {},
    armCapture: async () => true,
    saveInk: async (d: desktopInk.DesktopInk, p: unknown[]) => {
      saves.push(plain(d) as desktopInk.DesktopInk);
      return h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, plain(d), p);
    },
    sample() {},
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
    `(async () => { ${OVERLAY}\nglobalThis.review = { mode: (m) => setMode({ ...mode, mode: m }), frame: (f) => { raw = f; presented = f.presented; presentedAt = f.presentedAt; seq = f.seq; }, endCapture, pending: () => Promise.all([saveChain, encoding, sampling]), state: () => ({ doc, gesture, ended }) }; })()`,
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
  return { review, acks, saves, encoding, pointer, click, hint: () => node('hint').textContent, undoDisabled: () => node('undo').disabled };
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
  await flush();
  assert.deepEqual(page.acks, [], 'the Stop waits for the stroke written before it');
  page.pointer('pointerdown', 2, 70, 70); // a new pen-down while that stroke is being saved
  page.pointer('pointermove', 2, 100, 100);
  assert.equal(page.review.state().gesture, null, 'not accepted: nothing new appears on screen');
  const revision = page.review.state().doc.ink.revision;
  page.click('undo');
  assert.equal(page.review.state().doc.ink.revision, revision, 'undo is not accepted either');
  assert.equal(page.undoDisabled(), true);
  assert.match(page.hint(), /takes no new input/);
  gate.resolve();
  await flush();
  await page.review.pending();
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
