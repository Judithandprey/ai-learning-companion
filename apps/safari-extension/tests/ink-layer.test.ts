// WRITE ink in the layer (src/ink-layer.ts) against a minimal DOM double: a page that is one paragraph
// in a body. Alignment (adapted from the lead's review probes for INK-A1/INK-A2 and the off-screen INK-A1
// variant) and keeping every stroke through conflicts, unreadable records and failed saves, with a
// store double that behaves like the background's. Not browser evidence;
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
  getRootNode(): unknown {
    return this;
  }
}
/** A shadow root the paragraph can live in (for the root observation test). */
class ShadowRootDouble {
  host = new El('X-CARD');
  listeners = new Map<string, () => void>();
  addEventListener(type: string, f: () => void): void {
    this.listeners.set(type, f);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
}
const g = globalThis as Record<string, unknown>;
Object.assign(g, { ShadowRoot: ShadowRootDouble, Element: El, HTMLElement: El, HTMLMediaElement: class extends El {}, HTMLImageElement: class extends El {}, SVGElement: class {}, SVGSVGElement: class {}, NodeFilter: { SHOW_TEXT: 4 } });
let observe: (records: Array<{ target: unknown }>) => void = () => {};
const observedTargets: unknown[] = [];
g['MutationObserver'] = class {
  constructor(f: typeof observe) {
    observe = f;
  }
  observe(target: unknown): void {
    observedTargets.push(target);
  }
  disconnect(): void {}
};

const { createInkLayer } = await import('../src/ink-layer.ts');
const { addStroke, copyRecord, emptyInk } = await import('../src/ink.ts');
type Layer = ReturnType<typeof createInkLayer>;
type Store = NonNullable<Parameters<typeof createInkLayer>[0]['store']>;
type Keep = NonNullable<Parameters<typeof createInkLayer>[0]['keep']>;
type Doc = Parameters<Store['save']>[0];
type Copy = NonNullable<Parameters<Store['save']>[1]>;
type Shown = { display: string; uncertain: boolean };

const layers: Layer[] = [];
after(() => layers.forEach((l) => l.destroy())); // also when an assertion failed (the layer polls the address)
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 290)); // past the 250 ms recheck
const samples = [
  { x: 100, y: 100, pageX: 100, pageY: 100, t: 0, pressure: 0.5 },
  { x: 150, y: 100, pageX: 150, pageY: 100, t: 10, pressure: 0.5 },
];

/**
 * A page with one paragraph ("problem A", `height` px tall, or another `tag`) under every point, and a
 * ready layer on it (with an optional store and keep map, as the extension passes them).
 */
async function page({ height = 600, tag = 'P', store = null, keep, root }: { height?: number; tag?: string; store?: Store | null; keep?: Keep; root?: ShadowRootDouble } = {}): Promise<{
  navigate: (hash: string) => void;
  layer: Layer;
  replace: (text: string) => void;
  scroll: (y: number) => void;
  fire: (type: string) => void;
  shown: () => Shown[];
  state: () => Record<string, unknown>;
  created: El[];
}> {
  const paragraph = new El(tag, tag === 'P' ? 'problem A' : '');
  if (root) paragraph.getRootNode = () => root;
  const created: El[] = [];
  paragraph.rect = { ...paragraph.rect, height };
  const body = new El('BODY');
  paragraph.parentElement = body;
  const doc = {
    body,
    documentElement: new El('HTML'),
    title: 'owned synthetic page',
    createElement: (t: string) => {
      const e = new El(t);
      created.push(e);
      return e;
    },
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
    store,
    ...(keep ? { keep } : {}),
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
    navigate: (hash) => {
      win.location = new URL(`https://owned.example/lesson${hash}`);
    },
    shown: () => (layer.state() as { shown: Shown[] }).shown,
    state: () => layer.state(),
    created,
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
  const p = await page({ height: 100 });
  writeBoth(p); // at y 100, inside the paragraph (0..100)
  p.scroll(300); // the paragraph is now above the viewport; screen-fixed ink stays where it is
  p.replace('problem B');
  await settle();
  assert.deepEqual(p.shown().map((s) => [s.display, s.uncertain]), [['content', true], ['screen', true]]);
});

test('INK-A1, off screen, controls: scrolling the unchanged source off screen, or keeping it on screen, leaves the ink aligned', async () => {
  const off = await page({ height: 100 });
  writeBoth(off);
  off.scroll(300);
  observe([{ target: {} }]); // a change elsewhere on the page
  await settle();
  assert.deepEqual(off.shown().map((s) => s.uncertain), [false, false], 'stable scroll: source off screen, unchanged');
  const on = await page({ height: 100 });
  writeBoth(on);
  observe([{ target: {} }]);
  await settle();
  assert.deepEqual(on.shown().map((s) => s.uncertain), [false, false], 'visible positive: source on screen, unchanged');
});

test('ink over opaque content (canvas) survives a scroll off screen, and is unverified after any page change', async () => {
  const p = await page({ height: 100, tag: 'CANVAS' });
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

// ---- keeping every stroke ----------------------------------------------------------------------------
/**
 * A store that behaves like the background's: the main document is replaced only by a document whose
 * history extends it (else a conflict with the shared prefix length); copies are their own records.
 */
function storeDouble(): Store & { main: unknown; copies: Map<string, { copy: Copy; doc: Doc }>; failWith: string | null; failLoad: string | null; delay: number } {
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  const s = {
    label: 'the store double',
    main: null as unknown,
    copies: new Map<string, { copy: Copy; doc: Doc }>(),
    failWith: null as string | null,
    failLoad: null as string | null,
    delay: 0,
    load: async () => {
      if (s.failLoad) throw new Error(s.failLoad);
      return s.listed();
    },
    listed: () => ({ main: s.main === null ? null : structuredClone(s.main), copies: [...s.copies.values()].map(({ copy, doc }) => structuredClone(copyRecord(copy, doc))) }),
    save: async (doc: Doc, copy?: Copy) => {
      if (s.delay) await new Promise((r) => setTimeout(r, s.delay));
      if (s.failWith) throw new Error(s.failWith);
      if (copy) {
        s.copies.set(copy.id, { copy: s.copies.get(copy.id)?.copy ?? copy, doc: structuredClone(doc) });
        return;
      }
      const stored = s.main as Doc | null;
      if (stored && typeof stored === 'object' && Array.isArray(stored.history)) {
        let shared = 0;
        while (shared < stored.history.length && same(stored.history[shared], doc.history[shared])) shared += 1;
        if (shared < stored.history.length) throw Object.assign(new Error('newer ink for this page was saved in another tab or window; it was not overwritten'), { name: 'conflict', forkedAt: shared });
      } else if (stored !== null) {
        throw new Error('the ink stored for this page cannot be read by this version, so it was left untouched');
      }
      s.main = structuredClone(doc);
    },
  };
  return s;
}
const saved = async (): Promise<void> => new Promise((r) => setTimeout(r, 30));
const press = (p: { layer: Layer }, name: 'COPIES' | 'EXPORT' | 'ERASER' | 'UNDO' | 'PEN'): void => (p.layer.buttons[name] as unknown as El).click();
const stroke = (p: { layer: Layer }, y = 100): void => p.layer.finish(p.layer.begin(100, y)!, samples.map((q) => ({ ...q, y, pageY: y })), 'mouse');
type State = { status: string; visible: string[]; history: string[]; copy: Copy | null; others: Array<{ copy: Copy | null; visible: number; history: number }>; mainWritable: boolean; exportable: boolean; hint: string };

test('a conflict keeps this tab\'s ink as a separate copy; after a reload both are there and the copy can be shown and edited', async () => {
  const store = storeDouble();
  const a = await page({ store });
  stroke(a, 100); // A1
  await saved();
  // tab B reopened A1 and saved B1 on top of it
  const b1 = { ...(store.main as Doc).strokes[(store.main as Doc).visible[0]!]!, id: 'stk_tab_b', points: [[100, 300, 0, 0.5], [150, 300, 10, 0.5]] as const };
  store.main = addStroke(store.main as Doc, b1 as never, '2026-09-29T17:00:00.000Z');
  stroke(a, 200); // A2: refused for the main document
  await saved();
  const after = a.state() as State;
  assert.equal(after.status, 'saved');
  assert.equal(after.copy?.reason, 'conflict');
  assert.equal(after.copy?.forked_at, 1, 'the copy shares A1 with the main document');
  assert.equal(after.visible.length, 2, 'A1 and A2 are still shown');
  assert.equal((store.main as Doc).visible.length, 2, 'the main document keeps A1 and B1');
  assert.ok((store.main as Doc).strokes['stk_tab_b'], 'B1 is not overwritten');
  assert.deepEqual([...store.copies.values()][0]!.doc.history.map((o) => o.op), ['add', 'add'], 'A1 and A2 saved whole in the copy, not interleaved');
  assert.equal(after.others.length, 1, 'the other tab\'s main document is listed');
  stroke(a, 250); // later work goes to the copy
  await saved();
  assert.equal([...store.copies.values()][0]!.doc.visible.length, 3);
  // reload: the main document is shown, the copy is listed and can be shown and edited
  const r = await page({ store });
  const reopened = r.state() as State;
  assert.equal(reopened.copy, null);
  assert.equal(reopened.others.length, 1);
  assert.match(reopened.hint, /1 other saved copy of this page's ink kept \(kept from a conflict\)/);
  press(r, 'COPIES');
  const onCopy = r.state() as State;
  assert.equal(onCopy.copy?.reason, 'conflict');
  assert.equal(onCopy.visible.length, 3, 'A1, A2 and the later stroke');
  assert.equal(onCopy.others[0]?.copy, null, 'the main document is listed in turn');
  press(r, 'ERASER');
  r.layer.finish(r.layer.begin(125, 100)!, [{ x: 125, y: 90, pageX: 125, pageY: 90, t: 0, pressure: 0.5 }, { x: 125, y: 110, pageX: 125, pageY: 110, t: 5, pressure: 0.5 }], 'mouse');
  press(r, 'UNDO');
  press(r, 'PEN');
  stroke(r, 350);
  await saved();
  const copyDoc = [...store.copies.values()][0]!.doc;
  assert.deepEqual(copyDoc.history.map((o) => o.op), ['add', 'add', 'add', 'erase', 'undo', 'add'], 'erase, undo and a new stroke saved to the copy');
  assert.ok((store.main as Doc).strokes['stk_tab_b'] && (store.main as Doc).history.length === 2, 'the main document is unchanged');
  const again = await page({ store });
  press(again, 'COPIES');
  assert.deepEqual((again.state() as State).history, ['add', 'add', 'add', 'erase', 'undo', 'add'], 'and reopens with it');
});

test('an unreadable main record is never written; new ink is saved as a separate copy and reopens', async () => {
  const store = storeDouble();
  const raw = { format: 'something-else', note: 'written by another version' };
  store.main = structuredClone(raw);
  const p = await page({ store });
  assert.equal((p.state() as State).mainWritable, false);
  assert.match((p.state() as State).hint, /main saved ink cannot be read by this version; it is left untouched/);
  stroke(p);
  await saved();
  assert.deepEqual(store.main, raw, 'raw record untouched');
  assert.equal((p.state() as State).copy?.reason, 'unreadable');
  assert.equal((p.state() as State).status, 'saved');
  const r = await page({ store });
  assert.equal((r.state() as State).copy?.reason, 'unreadable', 'the copy is shown on reopening');
  assert.equal((r.state() as State).visible.length, 1);
  stroke(r, 200);
  await saved();
  assert.equal([...store.copies.values()][0]!.doc.visible.length, 2);
  assert.deepEqual(store.main, raw);
});

test('a failed save says so, offers an export of the exact document, keeps the ink through Stop, and saves it later', async () => {
  const store = storeDouble();
  const keep: Keep = new Map();
  const p = await page({ store, keep });
  store.failWith = 'the browser did not store it (quota exceeded)';
  stroke(p);
  await saved();
  const failed = p.state() as State;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.exportable, true);
  assert.match(failed.hint, /Not saved: the browser did not store it \(quota exceeded\)\. So far this ink is only in this tab until you leave or reload the page; use Export/);
  press(p, 'EXPORT');
  const link = [...p.created].reverse().find((e) => e.localName === 'a') as unknown as { href: string; download: string };
  assert.match(link.href, /^blob:/);
  assert.match(link.download, /^learning-companion-ink-[0-9a-f]{12}-\d{14}\.json$/);
  p.layer.destroy(); // Stop
  store.failWith = null;
  const r = await page({ store, keep });
  assert.equal((r.state() as State).visible.length, 1, 'the unsaved stroke came back after Stop');
  await saved();
  assert.equal((r.state() as State).status, 'saved', 'and is saved now that saving works');
  assert.equal((store.main as Doc).visible.length, 1);
  assert.equal((r.state() as State).exportable, false);
});

test('an empty page: nothing is listed and nothing is written until a stroke ends', async () => {
  const store = storeDouble();
  const p = await page({ store });
  const s = p.state() as State;
  assert.deepEqual([s.status, s.copy, s.others.length, s.mainWritable, s.exportable], ['ready', null, 0, true, false]);
  assert.equal(store.main, null);
  assert.equal(emptyInk({ origin: 'https://owned.example', address_sha256: 'a'.repeat(64) }).history.length, 0);
});

test('the export is the exact shown document, with its copy description', async () => {
  const store = storeDouble();
  const p = await page({ store });
  stroke(p);
  await saved();
  store.failWith = 'the browser did not store it (quota exceeded)';
  stroke(p, 200);
  await saved();
  const urls = URL as unknown as { createObjectURL: (b: Blob) => string };
  const real = urls.createObjectURL;
  let blob: Blob | null = null;
  urls.createObjectURL = (b: Blob) => ((blob = b), 'blob:test');
  try {
    press(p, 'EXPORT');
  } finally {
    urls.createObjectURL = real;
  }
  const file = JSON.parse(await (blob as unknown as Blob).text());
  const state = p.state() as State;
  assert.equal(file.format, 'lc-web-ink-export/v1');
  assert.deepEqual(file.doc.visible, state.visible);
  assert.deepEqual(file.doc.history.map((o: { op: string }) => o.op), state.history);
  assert.equal(file.copy, null);
  assert.match(state.hint, /changes since the last save at .* are only in this tab/, 'the earlier stroke is saved: only later changes are at risk');
});

test('a conflict answered after the address changed is saved as a copy at once, not only kept in memory', async () => {
  const store = storeDouble();
  const p = await page({ store });
  stroke(p, 100); // A1
  await saved();
  store.main = addStroke(store.main as Doc, { ...(store.main as Doc).strokes[(store.main as Doc).visible[0]!]!, id: 'stk_tab_b' } as never, '2026-09-29T17:00:00.000Z');
  store.delay = 60;
  stroke(p, 200); // A2, its save in flight
  p.navigate('#part-2');
  p.layer.begin(100, 100); // notices the address
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(store.copies.size, 1, 'the copy is written while away');
  const [kept] = [...store.copies.values()];
  assert.equal(kept!.copy.reason, 'conflict');
  assert.equal(kept!.doc.visible.length, 2, 'A1 and A2');
  assert.equal((p.state() as State & { held: number }).held, 0, 'nothing is left only in memory');
});

test('Stop while a refused save is in flight leaves exactly one copy', async () => {
  const store = storeDouble();
  const keep: Keep = new Map();
  const p = await page({ store, keep });
  stroke(p, 100);
  await saved();
  store.main = addStroke(store.main as Doc, { ...(store.main as Doc).strokes[(store.main as Doc).visible[0]!]!, id: 'stk_tab_b' } as never, '2026-09-29T17:00:00.000Z');
  store.delay = 60;
  stroke(p, 200);
  p.layer.destroy(); // Stop
  const r = await page({ store, keep });
  await new Promise((res) => setTimeout(res, 400));
  assert.equal(store.copies.size, 1);
  assert.equal((r.state() as State).copy?.reason, 'conflict');
});

test('when saved ink cannot be loaded, nothing stored is written and the copy says why (not "unreadable")', async () => {
  const store = storeDouble();
  store.failLoad = 'the extension did not answer';
  const p = await page({ store });
  store.failLoad = null;
  const s = p.state() as State & { loadFailed: string | null };
  assert.equal(s.loadFailed, 'the extension did not answer');
  assert.equal(s.mainWritable, true);
  assert.match(s.hint, /could not be loaded \(the extension did not answer\); nothing stored was written/);
  assert.doesNotMatch(s.hint, /cannot be read by this version/);
  stroke(p);
  await saved();
  assert.equal(store.main, null, 'the main record is not written');
  assert.equal((p.state() as State).copy?.reason, 'unloaded');
  const r = await page({ store });
  assert.equal((r.state() as State).copy?.reason, 'unloaded', 'no main record: the copy is shown on reopening');
  assert.match((r.state() as State).hint, /because this page's saved ink could not be loaded then/);
});

test('the layer observes the open shadow root that ink is anchored into, and lets it go on destroy', async () => {
  const root = new ShadowRootDouble();
  observedTargets.length = 0;
  const p = await page({ root });
  stroke(p);
  assert.ok(observedTargets.includes(root), 'the root is observed for changes');
  assert.ok(root.listeners.has('scroll'), 'and for scrolling inside it');
  p.replace('problem B');
  root.listeners.get('scroll')!(); // an inner scroll alone schedules the recheck
  await settle();
  assert.equal(p.shown()[0]!.uncertain, true);
  p.layer.destroy();
  assert.equal(root.listeners.has('scroll'), false, 'removed on destroy');
});
