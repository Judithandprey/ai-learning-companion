// The overlay's sampling and ASK functions, run as the real overlay.ts source with canvas, capture and I/O
// replaced by fakes: the held image's frame facts stay its own, and an ASK card keeps the uncertainty that
// was drawn into its picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { appSource } from './source.ts';
import * as samples from '../src/shared/samples.ts';

const OVERLAY = appSource('src/renderer/overlay.ts');
const slice = (from: string, to: string): string => {
  assert.ok(OVERLAY.includes(from) && OVERLAY.includes(to), `${from} … ${to}`);
  return OVERLAY.slice(OVERLAY.indexOf(from), OVERLAY.indexOf(to));
};
const deferred = <T>(): { promise: Promise<T>; resolve: (v: T) => void } => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("a sample reports the held image's own frame count and age; frames arriving while it is hashed are stream progress only", { timeout: 3000 }, async () => {
  const hashGate = deferred<void>();
  const sent: Array<{ raw: { presented_frames: number; stream_presented_frames: number; frame_age_ms: number } | null }> = [];
  let clock = 1000;
  let hashes = 0;
  const ctx = {
    ...samples,
    PERIOD_MS: 1000,
    video: { videoWidth: 100 },
    performance: { now: () => clock },
    now: () => '2026-09-30T12:00:00Z',
    source: {},
    createImageBitmap: async () => ({ width: 100, height: 100, close() {} }),
    pixelsSha: async () => {
      hashes += 1;
      if (hashes === 1) await hashGate.promise;
      return 'h'.repeat(64);
    },
    grid: () => new Uint8Array([1]),
    compose: () => ({ width: 100, height: 100 }),
    inkMarks: () => ({ verified: 0, changed: 0, unknown: 0, following_content: 0 }),
    release() {},
    recheckAlignment() {},
    noteContextChange() {},
    considerRetention() {},
    render() {},
    display: { bounds: { width: 100, height: 100 } },
    lc: { sample: (s: never) => void sent.push(s), ended() {} },
    setTimeout: () => 0,
    TextEncoder,
  };
  vm.createContext(ctx);
  vm.runInContext(
    `let stream = null, ended = false, endReason = '', presented = 1, presentedSeen = 0, presentedAt = 1000, raw = null, doc = { id: 'ink-1', ink: { revision: 0, visible: [], strokes: {} } }, prevGrid = null, seq = 0, composed = null, gesture = null; const frameShas = new Map(), samples = [], evidencePending = new Set();\n` +
      slice('async function takeSample(', '// ---- pixel evidence') +
      `\nglobalThis.t = { tick, pending: () => sampling, newFrame: (at) => { presented += 1; presentedAt = at; } };`,
    ctx,
  );
  const t = (ctx as unknown as { t: { tick(): void; pending(): Promise<void>; newFrame(at: number): void } }).t;
  t.tick();
  await flush();
  clock = 1400;
  t.newFrame(1300); // a newer frame is presented while the held (older) image is being hashed
  hashGate.resolve();
  await t.pending();
  const raw = sent[0]!.raw!;
  assert.equal(raw.presented_frames, 1, 'the held image was taken when 1 frame had been presented');
  assert.equal(raw.stream_presented_frames, 2, 'the newer frame is only stream progress');
  assert.equal(raw.frame_age_ms, 400, "the held image's age, not the newer frame's (100)");
});

test('an ASK card keeps the uncertainty drawn into its picture, even if alignment changes while the picture is encoded', { timeout: 3000 }, async () => {
  const dashes: number[][] = [];
  let finishEncoding!: (b: unknown) => void;
  class Canvas {
    width: number;
    height: number;
    lineDash: number[] = [];
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        drawImage() {},
        scale() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke: () => void dashes.push([...this.lineDash]),
        setLineDash: (d: number[]) => void (this.lineDash = d),
      };
    }
    convertToBlob() {
      return new Promise((r) => (finishEncoding = r));
    }
  }
  const nodes: Record<string, { textContent?: string; hidden?: boolean; src?: string }> = {};
  const stroke = { id: 's1', display: 'screen', points: [[10, 10, 0, 0.5], [50, 50, 20, 0.5]] };
  const ctx = {
    ...samples,
    display: { label: 'Display 1', bounds: { x: 0, y: 0, width: 1280, height: 800 } },
    development: false,
    subscription: false,
    asked: null,
    cardSeq: 0,
    talkNote: '',
    interrupt() {},
    renderTalk() {},
    lc: { onAskResult() {}, onLive() {} },
    TextEncoder,
    document: { querySelectorAll: () => [] },
    doc: { id: 'ink-1', ink: { revision: 1, visible: ['s1'], strokes: { s1: stroke } } },
    raw: { bitmap: { width: 1280, height: 800 }, seq: 2, at: '2026-09-30T12:00:00Z' },
    ended: false,
    aligned: new Map([['s1', 'unknown']]),
    mode: { mode: 'ASK', askEpoch: 1 },
    OffscreenCanvas: Canvas,
    FileReader: class {
      result = 'data:image/png;base64,';
      onload: () => void = () => {};
      readAsDataURL() {
        this.onload();
      }
    },
    $: (id: string) => (nodes[id] ??= {}),
    setMode() {},
    reduceMode: () => ({ state: {} }),
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice('function compose(', '/**\n * One sample.') + slice('const regionOf =', 'function fingerprintOf(') + slice('const unsure =', '// ---- ink') + slice('function line(', 'let gesture') + slice('const dashedNote =', '// ---- modes') + '\nglobalThis.t = { finishAsk };',
    ctx,
  );
  const asking = (ctx as unknown as { t: { finishAsk(p: unknown): Promise<void> } }).t.finishAsk([[10, 10, 0, 0.5], [60, 60, 30, 0.5]]);
  assert.deepEqual(dashes, [[7, 5]], 'the picture shows the stroke dashed (alignment unknown)');
  ctx.aligned.set('s1', 'verified'); // a newer sample verifies it while the picture is encoded
  finishEncoding({});
  await asking;
  assert.match(nodes['cardText']?.textContent ?? '', /1 of your strokes are drawn dashed/, 'the card states what its picture shows');
});

/** The real overlay save() with the main process replaced by `saveInk`. */
function overlaySave(pictures: Map<string, Uint8Array>, saveInk: (d: unknown, batch: Array<{ sha256: string }>) => unknown) {
  const doc = { id: 'ink-1', ink: { revision: 1 }, evidence: {} };
  const ctx = {
    doc,
    lastSaved: null as unknown,
    saveChain: Promise.resolve(),
    saveText: '',
    unsaved: null as string | null,
    pendingImages: pictures,
    contextImages: () => [...pictures.keys()].sort(),
    contextsSettled: async () => {},
    PICTURES_PER_SAVE: 64,
    PICTURE_BYTES_PER_SAVE: 48 * 1024 * 1024,
    lc: { saveInk: async (d: unknown, batch: Array<{ sha256: string }>) => saveInk(d, batch) },
    render() {},
  };
  const every = [...pictures.keys()].sort();
  ctx.contextImages = () => every; // the document refers to all of them
  vm.createContext(ctx);
  vm.runInContext(slice('function save()', '// ---- ASK') + '\nglobalThis.t = { save };', ctx);
  return { ctx, save: (ctx as unknown as { t: { save(): Promise<void> } }).t.save };
}
const names = (n: number): Map<string, Uint8Array> => new Map(Array.from({ length: n }, (_, i) => [String(i).padStart(64, '0'), new Uint8Array([i & 255])]));

test('the overlay sends pictures in bounded batches and lets go only of those named as received or invalid', { timeout: 3000 }, async () => {
  const pictures = names(150);
  const batches: number[] = [];
  const { ctx, save } = overlaySave(pictures, (_d, batch) => {
    batches.push(batch.length);
    const received = batch.slice(0, 60).map((p) => p.sha256); // the main process takes fewer than it was sent
    const invalid = batch.length > 60 ? [batch[60]!.sha256] : [];
    return { ok: true, pictures_received: received, pictures_invalid: invalid };
  });
  await save();
  assert.ok(batches.every((n) => n <= 64), 'bounded batches');
  assert.equal(pictures.size, 0, 'every picture was received (or refused as invalid) over several saves');
  assert.equal(ctx.unsaved, null);
  assert.equal(ctx.lastSaved, ctx.doc);
});

test('pictures the main process does not receive stay in the overlay, and the ink stays marked not saved', { timeout: 3000 }, async () => {
  const pictures = names(3);
  let calls = 0;
  const { ctx, save } = overlaySave(pictures, () => {
    calls += 1;
    return { ok: true, pictures_received: [], pictures_invalid: [] };
  });
  await save();
  assert.equal(calls, 1, 'no progress: no endless resending');
  assert.equal(pictures.size, 3, 'kept, to be sent with the next save or at Stop');
  assert.match(String(ctx.unsaved), /3 context picture\(s\) are not saved yet/);
  assert.equal(ctx.lastSaved, null, 'so Stop and Open see unsaved ink');
});
