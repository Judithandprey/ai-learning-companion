// WRITE ink alignment in the layer (src/ink-layer.ts) against a minimal DOM double: a page that is one
// paragraph in a body. Adapted from the lead's review probes for INK-A1/INK-A2 and the off-screen INK-A1
// variant. Not browser evidence;
// scripts/ink-check.mjs covers the real page.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

class El {
  tagName: string;
  localName: string;
  innerText: string;
  textContent: string;
  childElementCount = 0;
  shadowRoot = null;
  isConnected = true;
  parentElement: El | null = null;
  disabled = false;
  title = '';
  className = '';
  rect = { left: 0, top: 0, width: 800, height: 600 };
  listeners = new Map<string, (e: unknown) => void>();
  constructor(tag = 'DIV', text = '') {
    this.tagName = tag;
    this.localName = tag.toLowerCase();
    this.innerText = text;
    this.textContent = text;
  }
  setAttribute(): void {}
  append(): void {}
  contains(e: unknown): boolean {
    return e === this;
  }
  querySelectorAll(): El[] {
    return [];
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect;
  }
  addEventListener(type: string, f: (e: unknown) => void): void {
    this.listeners.set(type, f);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  click(): void {
    this.listeners.get('click')?.({});
  }
}
const g = globalThis as Record<string, unknown>;
Object.assign(g, { Element: El, HTMLElement: El, HTMLMediaElement: class extends El {}, HTMLImageElement: class extends El {}, SVGElement: class {}, SVGSVGElement: class {}, NodeFilter: { SHOW_TEXT: 4 } });
let observe: (records: Array<{ target: unknown }>) => void = () => {};
g['MutationObserver'] = class {
  constructor(f: typeof observe) {
    observe = f;
  }
  observe(): void {}
  disconnect(): void {}
};

const { createInkLayer } = await import('../src/ink-layer.ts');
type Layer = ReturnType<typeof createInkLayer>;
type Shown = { display: string; uncertain: boolean };

const layers: Layer[] = [];
after(() => layers.forEach((l) => l.destroy())); // also when an assertion failed (the layer polls the address)
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 290)); // past the 250 ms recheck
const samples = [
  { x: 100, y: 100, pageX: 100, pageY: 100, t: 0, pressure: 0.5 },
  { x: 150, y: 100, pageX: 150, pageY: 100, t: 10, pressure: 0.5 },
];

/** A page with one paragraph ("problem A", `height` px tall, or another `tag`) under every point, and a ready layer on it. */
async function page(height = 600, tag = 'P'): Promise<{ layer: Layer; replace: (text: string) => void; scroll: (y: number) => void; fire: (type: string) => void; shown: () => Shown[] }> {
  const paragraph = new El(tag, tag === 'P' ? 'problem A' : '');
  paragraph.rect = { ...paragraph.rect, height };
  const body = new El('BODY');
  paragraph.parentElement = body;
  const doc = {
    body,
    documentElement: new El('HTML'),
    title: 'owned synthetic page',
    createElement: (t: string) => new El(t),
    elementsFromPoint: () => [paragraph, body],
    addEventListener(): void {},
    removeEventListener(): void {},
    fonts: { addEventListener(): void {}, removeEventListener(): void {} },
  };
  const listeners = new Map<string, () => void>();
  const win = {
    document: doc,
    location: new URL('https://owned.example/lesson'),
    innerWidth: 800,
    innerHeight: 600,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    addEventListener(type: string, f: () => void): void {
      listeners.set(type, f);
    },
    removeEventListener(): void {},
    getComputedStyle: () => ({ backgroundImage: 'none' }),
  };
  let mouseWrites = false;
  const layer = createInkLayer({
    win: win as unknown as Window,
    session: { setMouseWrites: (v: boolean) => (mouseWrites = v), get mouseWrites() { return mouseWrites; } },
    store: null,
    ownElements: () => [],
    accepted: () => true,
    makeButton: () => new El('BUTTON') as unknown as HTMLButtonElement,
    onChange: () => {},
    onOperation: () => {},
  });
  layers.push(layer);
  for (let i = 0; i < 20 && !layer.ready(); i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(layer.ready(), true);
  return {
    layer,
    replace: (text) => {
      paragraph.innerText = text;
      paragraph.textContent = text;
      observe([{ target: paragraph }]);
    },
    scroll: (y) => {
      win.scrollY = y;
      paragraph.rect = { ...paragraph.rect, top: -y };
    },
    fire: (type) => listeners.get(type)?.(),
    shown: () => (layer.state() as { shown: Shown[] }).shown,
  };
}
/** One content stroke, then one screen-fixed stroke, over the paragraph. */
const writeBoth = (p: Awaited<ReturnType<typeof page>>): void => {
  p.layer.finish(p.layer.begin(100, 100)!, samples, 'mouse');
  (p.layer.buttons.DISPLAY as unknown as El).click();
  p.layer.finish(p.layer.begin(100, 100)!, samples, 'mouse');
};

test('INK-A1: after the paragraph is replaced at the same address, both content and screen-fixed ink are marked', async () => {
  const p = await page();
  writeBoth(p);
  p.replace('problem B');
  await settle();
  assert.deepEqual(p.shown().map((s) => [s.display, s.uncertain]), [['content', true], ['screen', true]]);
});

test('INK-A1 control: with the page unchanged, or only scrolled, both stay aligned', async () => {
  const p = await page();
  writeBoth(p);
  observe([{ target: {} }]); // a page change elsewhere
  await settle();
  assert.deepEqual(p.shown().map((s) => s.uncertain), [false, false], 'unchanged page');
  p.scroll(50); // content ink follows, screen ink stays; the paragraph is still there, unchanged
  observe([{ target: {} }]);
  await settle();
  assert.deepEqual(p.shown().map((s) => s.uncertain), [false, false], 'scrolled only');
});

test('INK-A1, off screen: a source that was scrolled off screen and then replaced no longer verifies the ink over it', async () => {
  const p = await page(100);
  writeBoth(p); // at y 100, inside the paragraph (0..100)
  p.scroll(300); // the paragraph is now above the viewport; screen-fixed ink stays where it is
  p.replace('problem B');
  await settle();
  assert.deepEqual(p.shown().map((s) => [s.display, s.uncertain]), [['content', true], ['screen', true]]);
});

test('INK-A1, off screen, controls: scrolling the unchanged source off screen, or keeping it on screen, leaves the ink aligned', async () => {
  const off = await page(100);
  writeBoth(off);
  off.scroll(300);
  observe([{ target: {} }]); // a change elsewhere on the page
  await settle();
  assert.deepEqual(off.shown().map((s) => s.uncertain), [false, false], 'stable scroll: source off screen, unchanged');
  const on = await page(100);
  writeBoth(on);
  observe([{ target: {} }]);
  await settle();
  assert.deepEqual(on.shown().map((s) => s.uncertain), [false, false], 'visible positive: source on screen, unchanged');
});

test('ink over opaque content (canvas) survives a scroll off screen, and is unverified after any page change', async () => {
  const p = await page(100, 'CANVAS');
  writeBoth(p);
  p.scroll(300);
  p.fire('scroll'); // only moved: its pixels cannot be compared, but nothing suggests they changed
  await settle();
  assert.deepEqual(p.shown().map((s) => s.uncertain), [false, false], 'scrolled off screen');
  observe([{ target: {} }]); // any page change: canvas content may have changed
  await settle();
  assert.deepEqual(p.shown().map((s) => s.uncertain), [true, true], 'after a page change');
});

test('INK-A2: content that changes while a stroke is being written leaves that stroke marked', async () => {
  const p = await page();
  const gesture = p.layer.begin(100, 100)!;
  p.replace('problem B');
  await settle();
  p.layer.finish(gesture, samples, 'mouse');
  assert.equal(p.shown()[0]!.uncertain, true, 'marked at once');
  await settle();
  assert.equal(p.shown()[0]!.uncertain, true, 'and still marked after the next recheck');
});

test('INK-A2 control: a stroke over unchanged content is aligned when it ends', async () => {
  const p = await page();
  const gesture = p.layer.begin(100, 100)!;
  await settle();
  p.layer.finish(gesture, samples, 'mouse');
  await settle();
  assert.equal(p.shown()[0]!.uncertain, false);
});
