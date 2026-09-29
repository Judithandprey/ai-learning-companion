// Minimal DOM/event doubles (adapted from docs/verification/learning/p0-02-r2-peer-probes.mjs)
// driving the real installProbe from <W1_ROOT>/apps/safari-extension/src. Not browser evidence.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.W1_ROOT ?? '/tmp/qa-71f/work/w1-dismissal';
const src = (f) => pathToFileURL(path.join(ROOT, 'apps/safari-extension', f)).href;
const { installProbe, CHANNEL } = await import(src('src/page.ts'));
const { ProbeSession } = await import(src('src/session.ts'));
const { unavailableTransport } = await import(src('src/bridge.ts'));
const { FIXTURE_EXPLANATIONS, SYNTHETIC_IDENTITY, resolveFixtureSource } = await import(src('src/fixture-data.ts'));
const { counterIds } = await import(src('tests/helpers.ts'));
export { CHANNEL };

export const ORIGIN = 'http://localhost:4173';
class Target {
  listeners = new Map();
  addEventListener(k, fn) { const fs = this.listeners.get(k) ?? []; fs.push(fn); this.listeners.set(k, fs); }
  removeEventListener(k, fn) { this.listeners.set(k, (this.listeners.get(k) ?? []).filter((f) => f !== fn)); }
  fire(type, values = {}) {
    for (const f of this.listeners.get(type) ?? [])
      f({ type, isTrusted: false, timeStamp: 0, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {}, composedPath() { return []; }, ...values });
  }
}
class ElementDouble extends Target {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.style = {}; this.dataset = {}; this.children = []; this.hidden = false; this.textContent = ''; this.isConnected = true; this.className = '';
    const self = this;
    this.classList = {
      add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
    };
  }
  setAttribute() {}
  append(...nodes) { this.children.push(...nodes); }
  attachShadow() { return new ElementDouble('shadow'); }
  getContext() { return null; }
  getBoundingClientRect() { return this.tagName === 'LC-WEB-PROBE' ? { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } : { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
  getClientRects() { return [this.getBoundingClientRect()]; }
  contains(node) { return this === node || this.children.some((n) => n === node || n.contains?.(node)); }
  closest(selector) { return selector.startsWith('script,') ? null : this; }
  querySelectorAll() { return this.children.flatMap((n) => [n, ...(n.querySelectorAll?.('*') ?? [])]); }
  remove() {}
}
globalThis.HTMLElement = ElementDouble;
for (const n of ['HTMLVideoElement', 'HTMLIFrameElement', 'HTMLImageElement', 'HTMLCanvasElement', 'HTMLEmbedElement', 'HTMLObjectElement'])
  globalThis[n] = class extends ElementDouble {};
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.HTMLMediaElement = { HAVE_NOTHING: 0 };
export const tick = () => new Promise((r) => setTimeout(r, 15));

/** Controllable deferred native transport: every send waits until answered. */
export function deferred() {
  const waiting = [];
  return {
    waiting,
    transport: { kind: 'native', send: (request) => new Promise((resolve, reject) => waiting.push({ request, resolve, reject })) },
    ack(i) { const w = waiting[i]; w.resolve({ contract_version: '0.1.0', request_id: w.request.request_id, status: 'accepted', error_code: null }); },
  };
}

/** Gate on crypto.subtle.digest so the hashing window of submitAsk can be held open. */
export function digestGate() {
  const original = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const held = [];
  let on = false;
  globalThis.crypto.subtle.digest = (...args) => (on ? new Promise((res) => held.push(() => res(original(...args)))) : original(...args));
  return {
    hold(v) { on = v; },
    releaseAll() { while (held.length) held.shift()(); },
    held,
    restore() { globalThis.crypto.subtle.digest = original; },
  };
}

export function setup({ role = 'top', transport = unavailableTransport, parent = null, text = 'change of basis' } = {}) {
  const doc = new Target(), win = new Target(), nodes = [];
  const sel = { rect: { x: 100, y: 200, left: 100, top: 200, right: 400, bottom: 240, width: 300, height: 40 }, text };
  doc.documentElement = new ElementDouble('html'); doc.documentElement.clientWidth = 1000; doc.documentElement.clientHeight = 800;
  const block = new ElementDouble('p'); block.innerText = 'A change of basis changes coordinates.';
  const node = { nodeType: 3, get textContent() { return sel.text; }, parentElement: block, isConnected: true };
  doc.body = block;
  doc.fullscreenElement = null;
  doc.createElement = (tag) => { const e = new ElementDouble(tag); nodes.push(e); return e; };
  const range = () => ({ commonAncestorContainer: node, startContainer: node, endContainer: node, startOffset: 0, endOffset: sel.text.length,
    getClientRects: () => [sel.rect], getBoundingClientRect: () => sel.rect, cloneRange: range, setStart() {}, setEnd() {} });
  doc.createRange = range;
  doc.createTreeWalker = () => { let used = false; return { nextNode() { if (used) return null; used = true; return node; } }; };
  doc.elementFromPoint = () => block;
  const video = new globalThis.HTMLVideoElement('video');
  Object.assign(video, { getBoundingClientRect: () => sel.rect, querySelectorAll: () => [], textTracks: [], readyState: 2, currentSrc: 'synthetic.webm', srcObject: null, error: null, currentTime: 10, paused: false });
  doc.querySelectorAll = (tag) => (tag === 'video' ? [video] : []);
  const child = { postMessage() {} };
  Object.assign(win, { document: doc, frames: [child], devicePixelRatio: 1, innerWidth: 1000, innerHeight: 800, scrollX: 0, scrollY: 0,
    location: { href: `${ORIGIN}/fixture/index.html` }, CSSStyleSheet: class { replaceSync() {} },
    getSelection: () => ({ isCollapsed: false, rangeCount: 1, getRangeAt: range }) });
  win.parent = parent ?? win;
  let version = '1';
  const session = new ProbeSession({ identity: SYNTHETIC_IDENTITY, ids: counterIds(), clock: () => new Date().toISOString(), transport,
    fixtures: FIXTURE_EXPLANATIONS, resolveSource: resolveFixtureSource, projectId: null, knowledgeProfileVersion: 1 });
  const events = [];
  const ui = installProbe({ win, session, documentVersion: () => version, role, peerOrigins: [ORIGIN], acceptSyntheticEvents: true, onEvent: (e) => events.push(e) });
  const card = nodes.find((n) => n.className.split(' ').includes('card'));
  // Explicit desktop text ASK: mouse down/up over the current text selection.
  const markText = (t) => { if (t !== undefined) sel.text = t; win.fire('pointerdown', { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 120, clientY: 220 }); win.fire('pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 120, clientY: 220 }); };
  const pen = (pts) => { const [a, ...rest] = pts; win.fire('pointerdown', { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: a.x, clientY: a.y }); for (const q of rest) win.fire('pointermove', { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: q.x, clientY: q.y }); const z = pts.at(-1); win.fire('pointerup', { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: z.x, clientY: z.y }); };
  const clickClose = () => nodes.find((n) => n.className === 'close').fire('click');
  const clickConfirm = () => nodes.find((n) => n.className === 'confirm').fire('click');
  const anchor = nodes.find((n) => n.className === 'anchor');
  const snap = () => ({ ...ui.cardSnapshot(), pendingClass: card.classList.contains('pending'), anchorHidden: anchor.hidden });
  const asks = () => events.filter((e) => e.type === 'ask');
  const msg = (source, type, extra = {}) => win.fire('message', { source, origin: ORIGIN, data: { channel: CHANNEL, type, ...extra } });
  return { win, doc, session, ui, child, events, nodes, node, video, sel, card, markText, pen, clickClose, clickConfirm, snap, asks, msg, setVersion: (v) => (version = v) };
}
export const brief = (s) => ({ hidden: s.hidden, pending: s.pending, pendingClass: s.pendingClass, anchorHidden: s.anchorHidden, badge: s.badge, quote: s.quote });
export const askBrief = (a) => ({ outcome: a.outcome, presented: a.presented, text: a.detail?.selection?.selected_text ?? null });
