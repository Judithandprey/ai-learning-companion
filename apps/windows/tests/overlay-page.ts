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
import * as placement from '../src/shared/placement.ts';
import * as voiceRules from '../src/shared/voice.ts';
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
  /** The overlay's recent samples, as reported. */
  samples(): Array<{ seq: number; composed: { ink_marks: { verified: number; changed: number; unknown: number; following_content: number } } | null }>;
  /** The ASK card, when shown. */
  card(): { text: string; image: boolean } | null;
};

type Luma = { width: number; height: number; luma: Uint8Array };
/** The source rectangle (sx, sy, sw, sh) of `src` drawn over a cw×ch canvas, read back at (x, y, w, h), area-averaged. */
function averaged(src: Luma, [sx, sy, sw, sh]: number[], cw: number, ch: number, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  const [fx, fy] = [sw! / cw, sh! / ch];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [ax, ay] = [sx! + (x + i) * fx, sy! + (y + j) * fy];
      const [bx, by] = [ax + fx, ay + fy];
      let t = 0;
      for (let py = Math.floor(ay); py < Math.ceil(by); py++) {
        for (let px = Math.floor(ax); px < Math.ceil(bx); px++) {
          const v = src.luma[Math.min(src.height - 1, Math.max(0, py)) * src.width + Math.min(src.width - 1, Math.max(0, px))]!;
          t += v * (Math.min(bx, px + 1) - Math.max(ax, px)) * (Math.min(by, py + 1) - Math.max(ay, py));
        }
      }
      const at = (j * w + i) * 4;
      data[at] = data[at + 1] = data[at + 2] = Math.round(t / (fx * fy));
      data[at + 3] = 255;
    }
  }
  return data;
}

/** The overlay page for session `s`, with pointer input into its ink canvas and a gate on PNG encoding. */
export async function overlayPage(h: H, s: Session, policy?: retention.RetentionPolicy, options: { /** A stand-in voice is connected to the main process (the product connects none in this build); 'silent': one that only synthesizes. */ voice?: boolean | 'silent' } = {}) {
  /**
   * What the fake screen shows: every pixel's shade (grids, hashes and fingerprints read it), or, when a test sets
   * `luma`, that grayscale 1280×800 screen: each frame taken keeps its own pixels, and canvases read back the area
   * average of what was drawn into them, so local changes and separately pinned frames are real.
   */
  const scene = { shade: 20, luma: null as Uint8Array | null, exactPng: false };
  if (policy) (s as unknown as { retention: { policy: retention.RetentionPolicy } }).retention.policy = policy; // the main process enforces the same
  const nodes = new Map<string, FakeNode>();
  const events = new Map<string, (...a: unknown[]) => void>();
  const acks: Array<string | null> = [];
  const saves: desktopInk.DesktopInk[] = [];
  const encoding = { gate: null as Promise<void> | null };
  /** What the page asked of the main process about taking the pointer (NAV passes clicks through unless over a surface). */
  const interactive: boolean[] = [];
  /**
   * A stand-in for a voice connected to the main process (`options.voice`; the product connects none in this
   * build): what the main process handed over to be said, each with the way a test ends it, and how often it was
   * told to stop or was ended. Nothing is played.
   */
  const voice = { spoken: [] as Array<{ text: string; rate: number; culture: string; end: (spoken?: boolean) => void }>, cancels: 0, disposed: 0, broken: false };
  if (options.voice) {
    h.connectVoice({
      audible: options.voice !== 'silent',
      say: (text: string, rate: number, culture: string) => {
        if (voice.broken) throw new Error('the voice failed (stand-in)');
        return new Promise<boolean>((end) => void voice.spoken.push({ text, rate, culture, end: (spoken = true) => end(spoken) }));
      },
      stop: () => {
        voice.cancels += 1;
        if (voice.broken) throw new Error('the voice failed to stop (stand-in)');
      },
      dispose: async () => void (voice.disposed += 1),
    });
  }
  class FakeNode {
    id = '';
    width = 1280;
    height = 800;
    /** The size of this element as laid out (a surface), for getBoundingClientRect. */
    boxWidth = 300;
    boxHeight = 50;
    readonly vars = new Map<string, string>();
    readonly attrs = new Map<string, string>();
    readonly captured = new Set<number>();
    /** How this element was brought into view, each time (the card scrolls to what just came). */
    readonly revealed: string[] = [];
    scrollIntoView(o?: { block?: string }) {
      this.revealed.push(o?.block ?? 'start');
    }
    style = { setProperty: (k: string, v: string) => void this.vars.set(k, v), getPropertyValue: (k: string) => this.vars.get(k) ?? '' };
    hidden = true;
    disabled = false;
    textContent = '';
    value = '';
    checked = false;
    dataset = {};
    handlers = new Map<string, (e: unknown) => void>();
    /** What was last drawn into this canvas: the source and its rectangle. */
    drawn: { src: Partial<Luma> & { drawn?: FakeNode['drawn']; shade?: number }; rect: number[] } | null = null;
    constructor(w = 1280, hh = 800) {
      this.width = w;
      this.height = hh;
    }
    getContext() {
      return {
        drawImage: (src: FakeNode['drawn'] extends infer D ? (D extends { src: infer S } ? S : never) : never, ...a: number[]) => {
          // As Chromium: a closed bitmap, or a canvas with no size, cannot be drawn.
          if (src.width === 0 || src.height === 0) throw new Error('InvalidStateError: the image source is closed or has no size');
          this.drawn = { src, rect: a.length === 8 ? a.slice(0, 4) : [0, 0, src.width ?? this.width, src.height ?? this.height] };
        },
        getImageData: (x: number, y: number, w: number, h: number) => {
          // A frame with pixels (drawn directly, or through a composed canvas drawn from it) reads back its pixels.
          const d = this.drawn;
          const src = d?.src.luma ? d.src : d?.src.drawn?.src.luma ? d.src.drawn.src : null;
          if (d && src) return { data: averaged(src as Luma, d.rect, this.width, this.height, x, y, w, h) };
          return { data: Uint8ClampedArray.from({ length: (w * h <= 4096 ? w * h : 256) * 4 }, (_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4) % 2 ? 200 : scene.shade)) };
        },
        setTransform() {},
        scale() {},
        clearRect() {},
        setLineDash() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        imageSmoothingQuality: 'low',
      };
    }
    addEventListener(n: string, f: (e: unknown) => void) {
      this.handlers.set(n, f);
    }
    setAttribute(k: string, v: string) {
      this.attrs.set(k, v);
    }
    getAttribute(k: string) {
      return this.attrs.get(k) ?? null;
    }
    setPointerCapture(id: number) {
      this.captured.add(id);
    }
    releasePointerCapture(id: number) {
      this.captured.delete(id);
    }
    hasPointerCapture(id: number) {
      return this.captured.has(id);
    }
    /** As the style sheet lays a surface out: its corner at the fractions of the free room in the usable area. */
    getBoundingClientRect() {
      const px = (k: string): number => Number.parseFloat(root.vars.get(k) ?? '0');
      const f = (k: string): number => Number(this.vars.get(k) ?? '0');
      // (a surface is never larger than the area: max-width and max-height in the style sheet)
      const width = Math.min(this.boxWidth, px('--aw'));
      const height = Math.min(this.boxHeight, px('--ah'));
      const left = px('--ax') + f('--fx') * (px('--aw') - width);
      const top = px('--ay') + f('--fy') * (px('--ah') - height);
      return { left, top, width, height, right: left + width, bottom: top + height };
    }
    closest(selector: string) {
      if (selector === '#toolbar') return this.id === 'toolbar' ? this : null;
      if (selector === '#card:not([hidden])') return this.id === 'card' && !this.hidden ? this : null;
      return null;
    }
    async convertToBlob() {
      if (encoding.gate) await encoding.gate;
      // Whole-frame canvases give a PNG of their size (retention checks it); small ones the context picture.
      // `exactPng` (ASK selections): a small canvas too gives a PNG of its own size.
      // What the screen showed in the frame that was drawn into this canvas (directly, or through a composed one).
      const shade = this.drawn?.src.shade ?? this.drawn?.src.drawn?.src.shade ?? scene.shade;
      const bytes = this.width >= 1280 || scene.exactPng ? png(this.width, this.height, shade) : PNG_BYTES;
      return { arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    }
  }
  const node = (id: string): FakeNode => {
    if (!nodes.has(id)) nodes.set(id, Object.assign(new FakeNode(), { id }));
    return nodes.get(id)!;
  };
  const root = new FakeNode();
  node('toolbar').hidden = false;
  Object.assign(node('card'), { boxWidth: 360, boxHeight: 200 });
  const documentHandlers = new Map<string, (e: unknown) => void>();
  /** The surface under a point, as the page would find it (the toolbar, or the card when it is shown). */
  const surfaceAt = (x: number, y: number): FakeNode | null =>
    [node('toolbar'), node('card')].find((n) => {
      const b = n.getBoundingClientRect();
      return !n.hidden && x >= b.left && x < b.right && y >= b.top && y < b.bottom;
    }) ?? null;
  const buttons = ['NAV', 'ASK', 'WRITE'].map((m) => Object.assign(new FakeNode(), { dataset: { mode: m } }));
  const radios = ['hint', 'explain', 'full_solution'].map((v, i) => Object.assign(new FakeNode(), { value: v, checked: i === 0 }));
  const lc = {
    ready: async () => ({ ...(plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { work_area: unknown; places: unknown; speech_rate: number; voice: unknown }), display: s.doc.display, doc: plain(s.doc), source_id: 'screen:1:0', address_sha256: crypto.createHash('sha256').update(s.doc.id).digest('hex'), retention_policy: policy, ...(plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { development: boolean; subscription: boolean }) }),
    interactive: (on: boolean) => void interactive.push(on),
    place: async (surface: string, place: unknown) => plain(await h.handlers['lc:place']!({ sender: s.overlay.webContents }, surface, plain(place))),
    speechRate: async (rate: number) => plain(await h.handlers['lc:speech-rate']!({ sender: s.overlay.webContents }, rate)),
    onWorkArea: (f: (...a: unknown[]) => void) => events.set('work-area', f),
    talk: (on: boolean, muted: boolean) => void h.handlers['lc:talk']!({ sender: s.overlay.webContents }, on, muted),
    say: async (id: string, request: string, at: number) => plain(await h.handlers['lc:say']!({ sender: s.overlay.webContents }, id, request, at)),
    hush: () => void h.handlers['lc:hush']!({ sender: s.overlay.webContents }),
    armCapture: async () => true,
    saveInk: async (d: desktopInk.DesktopInk, p: unknown[]) => {
      saves.push(plain(d) as desktopInk.DesktopInk);
      return h.handlers['lc:save-ink']!({ sender: s.overlay.webContents }, plain(d), p);
    },
    sample() {},
    retainFrame: async (facts: unknown, raw: Uint8Array, composed: Uint8Array | null, ink: Uint8Array | null) => h.handlers['lc:retain-frame']!({ sender: s.overlay.webContents }, facts, raw, composed, ink),
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
    // ASK with the subscription: as over IPC (bytes cross as Uint8Array, the rest as plain data).
    askSelection: async (facts: unknown, png: Uint8Array, inkBytes: Uint8Array) => plain(await h.handlers['lc:ask-selection']!({ sender: s.overlay.webContents }, plain(facts), Uint8Array.from(png), Uint8Array.from(inkBytes))),
    askSubmit: async (id: string, question: string, assistance: string) => {
      const answer = plain(await h.handlers['lc:ask-submit']!({ sender: s.overlay.webContents }, id, question, assistance));
      await submitAck; // the main process has answered; a test may hold its answer back on the way to the overlay
      return answer;
    },
    askCancel: (id: string) => void h.handlers['lc:ask-cancel']!({ sender: s.overlay.webContents }, id),
    askClosed: () => void h.handlers['lc:ask-closed']!({ sender: s.overlay.webContents }),
    askPresented: async (id: string, request: string, shown: boolean) => plain(await h.handlers['lc:ask-presented']!({ sender: s.overlay.webContents }, id, request, shown)),
    askSave: async (id: string) => plain(await h.handlers['lc:ask-save']!({ sender: s.overlay.webContents }, id)),
    onAskResult: (f: (...a: unknown[]) => void) => events.set('ask-result', f),
    loadResult() {},
  };
  // A frame as the overlay takes it: what the screen shows then; closed, its size reads as 0 (as an ImageBitmap's does).
  const frame = () => ({ width: 1280, height: 800, shade: scene.shade, ...(scene.luma ? { luma: scene.luma } : {}), close() { this.width = this.height = 0; } });
  const sandbox = {
    ...ink,
    ...modes,
    ...desktopInk,
    ...samples,
    ...retention,
    ...placement,
    ...voiceRules,
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
    createImageBitmap: async () => frame(),
    document: { getElementById: node, createElement: () => ({ videoWidth: 1280, requestVideoFrameCallback() {} }), querySelectorAll: (q: string) => (q.includes('assistance') ? radios : buttons), querySelector: (q: string) => (q.includes('assistance') ? radios.find((r) => r.checked) ?? null : null), addEventListener: (n: string, f: (e: unknown) => void) => void documentHandlers.set(n, f), elementFromPoint: surfaceAt, documentElement: root },
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
    `(async () => { ${OVERLAY}\nglobalThis.review = { mode: (m) => setMode({ ...mode, mode: m }), frame: (f) => { raw = f; presented = f.presented; presentedAt = f.presentedAt; seq = f.seq; }, endCapture, pending: () => Promise.all([saveChain, encoding, sampling]), state: () => ({ doc, gesture, ended }), sample: (late = 0) => { presented += 1; return (sampling = sampling.then(() => takeSample(late))); }, sameFrameLate: (late) => (sampling = sampling.then(() => takeSample(late))), retention: () => ({ ...__lcOverlay.state().retention, pinned: pins.size, queue: retention }), aligned: () => __lcOverlay.state().aligned, samples: () => __lcOverlay.state().samples, card: () => __lcOverlay.state().card }; })()`,
    sandbox,
  );
  const review = (sandbox as unknown as { review: Review }).review;
  review.frame({ bitmap: frame(), seq: 1, at: '2026-09-30T12:00:00.000Z', presented: 1, presentedAt: performance.now() });
  let submitAck: Promise<void> = Promise.resolve();
  /** Holds the answers to lc:ask-submit back from the overlay until the returned function is called. */
  const holdSubmitAck = (): (() => void) => {
    let release = (): void => undefined;
    submitAck = new Promise((r) => (release = r));
    return release;
  };
  review.mode('WRITE');
  // lc:stop from the main process reaches the overlay's Stop handler, as over IPC.
  const send = s.overlay.webContents.send;
  s.overlay.webContents.send = (...args: unknown[]) => {
    send(...args);
    if (args[0] === 'lc:stop') queueMicrotask(() => events.get('stop')!(...args.slice(1)));
    if (args[0] === 'lc:work-area') queueMicrotask(() => events.get('work-area')!(...(plain(args.slice(1)) as unknown[])));
    if (args[0] === 'lc:ask-result') queueMicrotask(() => events.get('ask-result')!(...(plain(args.slice(1)) as unknown[])));
  };
  let t = 0;
  const pointer = (name: string, id = 1, x = 10, y = 10): void => node('ink').handlers.get(name)!({ pointerId: id, isPrimary: true, pointerType: 'pen', button: 0, buttons: 1, clientX: x, clientY: y, timeStamp: (t += 10), pressure: 0.5 });
  const click = (id: string): void => node(id).handlers.get('click')!({});
  /** The card's ASK parts, as shown. */
  const ask = () => ({ badge: node('badge').textContent, form: !node('askForm').hidden, submit: !node('askSubmit').disabled, cancel: !node('askCancel').hidden, status: node('askStatus').hidden ? null : node('askStatus').textContent, answer: node('answerBox').hidden ? null : node('answer').textContent, save: !node('askSave').hidden });
  /** A press on a mode button, as the user's (the mode before is remembered, as in the app). */
  const press = (m: string): void => buttons.find((b) => b.dataset.mode === m)!.handlers.get('click')!({});
  const choose = (assistance: string): void => radios.forEach((r) => void (r.checked = r.value === assistance));
  /** A pointer event on a surface's handle (or any element), and a mouse move over the page. */
  const on = (id: string, name: string, e: { pointerId?: number; x?: number; y?: number; pointerType?: string; button?: number; key?: string; primary?: boolean } = {}): boolean => {
    let prevented = false;
    node(id).handlers.get(name)!({ pointerId: e.pointerId ?? 7, isPrimary: e.primary ?? true, pointerType: e.pointerType ?? 'mouse', button: e.button ?? 0, clientX: e.x ?? 0, clientY: e.y ?? 0, key: e.key ?? '', preventDefault: () => void (prevented = true) });
    return prevented;
  };
  const mouseMove = (x: number, y: number): void => documentHandlers.get('mousemove')?.({ clientX: x, clientY: y });
  /** Where a surface is, as laid out, and the rest of what a test reads of the movable surfaces and the talk controls. */
  const box = (id: string) => node(id).getBoundingClientRect();
  const talkLabel = (): string | null => node('talk').getAttribute('aria-label');
  const talkState = () => ({ controls: !node('talkControls').hidden, talk: node('talk').getAttribute('aria-pressed') === 'true', muted: node('mute').getAttribute('aria-pressed') === 'true', mute: !node('mute').hidden, interrupt: !node('interrupt').hidden, rate: node('rate').hidden ? null : node('rate').textContent, status: node('talkStatus').hidden ? null : node('talkStatus').textContent });
  return { on, mouseMove, box, node, root, interactive, voice, talkState, talkLabel, /** From now the stand-in voice throws when asked to say or to stop. */ breakVoice: () => void (voice.broken = true), review, scene, acks, saves, encoding, pointer, click, hint: () => node('hint').textContent, undoDisabled: () => node('undo').disabled, userData: h.userData, captureId: s.doc.id, ask, choose, press, holdSubmitAck, question: (text: string) => void (node('question').value = text) };
}

