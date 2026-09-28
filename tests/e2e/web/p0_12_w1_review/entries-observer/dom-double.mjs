// Minimal DOM/event doubles for driving fixture/src/entry-observer.ts in Node.
// Not browser evidence: event order/isTrusted values are set by the scenario,
// following the repo's own Edge evidence (p0-12-edge-entries.json) where noted.

const kebab = (k) => String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Selector subset: comma lists of [tag|*][ [attr] | [attr="v"] ]*
function matchesCompound(el, sel) {
  sel = sel.trim();
  const m = /^([a-zA-Z*][a-zA-Z0-9-]*)?((?:\[[^\]]+\])*)$/.exec(sel);
  if (!m) throw new Error(`unsupported selector ${sel}`);
  const [, tag, attrs] = m;
  if (tag && tag !== '*' && el.localName !== tag.toLowerCase()) return false;
  for (const a of attrs.match(/\[[^\]]+\]/g) ?? []) {
    const am = /^\[([a-zA-Z0-9_-]+)(?:="((?:[^"\\]|\\.)*)")?\]$/.exec(a);
    if (!am) throw new Error(`unsupported attr selector ${a}`);
    const [, name, val] = am;
    if (!el.hasAttribute(name)) return false;
    if (val !== undefined && el.getAttribute(name) !== val.replace(/\\(.)/g, '$1')) return false;
  }
  return true;
}
const matches = (el, sel) => sel.split(',').some((s) => matchesCompound(el, s));

export class Node0 {
  constructor() { this.parentNode = null; this.childNodes = []; }
  getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n; }
  contains(o) { for (let n = o; n; n = n.parentNode) if (n === this) return true; return false; }
  append(...ns) { for (const n of ns) { const c = typeof n === 'string' ? new Text0(n) : n; c.parentNode = this; this.childNodes.push(c); } return this; }
  get parentElement() { return this.parentNode instanceof globalThis.Element ? this.parentNode : null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.childNodes) if (c instanceof globalThis.Element) { if (matches(c, sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = []; if (v) this.append(String(v)); }
}
export class Text0 extends Node0 {
  constructor(t) { super(); this.data = t; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = v; }
}
export class ShadowRoot extends Node0 { constructor(host, mode) { super(); this.host = host; this.mode = mode; } }
export class Document0 extends Node0 {}
export class Element extends Node0 {
  constructor(tag, attrs = {}) {
    super();
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    this._shadow = null;
    const self = this;
    this.dataset = new Proxy({}, {
      get: (_t, k) => (typeof k === 'string' && self.attrs.has(`data-${kebab(k)}`) ? self.attrs.get(`data-${kebab(k)}`) : undefined),
      set: (_t, k, v) => { self.attrs.set(`data-${kebab(k)}`, String(v)); return true; },
    });
  }
  get id() { return this.attrs.get('id') ?? ''; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  hasAttribute(n) { return this.attrs.has(n); }
  removeAttribute(n) { this.attrs.delete(n); }
  attachShadow({ mode }) { this._shadow = new ShadowRoot(this, mode); return this._shadow; }
  get shadowRoot() { return this._shadow && this._shadow.mode === 'open' ? this._shadow : null; }
  matches(sel) { return matches(this, sel); }
  closest(sel) { for (let n = this; n instanceof Element; n = n.parentNode) if (matches(n, sel)) return n; return null; }
}
export class HTMLElement extends Element {
  get isContentEditable() {
    for (let n = this; n instanceof Element; n = n.parentNode) {
      const v = n.getAttribute('contenteditable');
      if (v === null) continue;
      return v === '' || v === 'true' || v === 'plaintext-only';
    }
    return false;
  }
}
const TYPES = ['text', 'radio', 'checkbox', 'password', 'hidden', 'file', 'email', 'search', 'tel', 'url', 'number', 'range', 'submit'];
export class HTMLInputElement extends HTMLElement {
  constructor(attrs = {}) { super('input', attrs); this._value = attrs.value ?? ''; this.checked = 'checked' in attrs; }
  get type() { const t = (this.getAttribute('type') ?? 'text').toLowerCase(); return TYPES.includes(t) ? t : 'text'; }
  set type(v) { this.setAttribute('type', v); }
  get name() { return this.getAttribute('name') ?? ''; }
  get value() { return this.type === 'radio' || this.type === 'checkbox' ? (this.getAttribute('value') ?? 'on') : this._value; }
  set value(v) { if (this.type === 'radio' || this.type === 'checkbox') this.setAttribute('value', v); else this._value = String(v); }
  get form() { return this.closest('form'); }
}
export class HTMLTextAreaElement extends HTMLElement {
  constructor(attrs = {}) { super('textarea', attrs); this.value = ''; }
}
export class HTMLSelectElement extends HTMLElement {
  constructor(attrs = {}) { super('select', attrs); this.value = ''; }
}
export class HTMLFormElement extends HTMLElement {
  constructor(attrs = {}) { super('form', attrs); this.submissions = 0; }
  requestSubmit() { this.submissions += 1; }
}
export class HTMLCanvasElement extends HTMLElement {
  // HTML spec: the first getContext() fixes the canvas context mode; a different
  // type afterwards returns null, and transferControlToOffscreen() then throws.
  constructor(attrs = {}) { super('canvas', attrs); this.contextMode = 'none'; this.getContextCalls = []; }
  getContext(type) {
    this.getContextCalls.push(type);
    if (this.contextMode === 'none') { this.contextMode = type; this._ctx = { type, getImageData: () => ({ data: [0, 0, 0, 0] }) }; return this._ctx; }
    return this.contextMode === type ? this._ctx : null;
  }
  transferControlToOffscreen() { if (this.contextMode !== 'none') throw new Error('InvalidStateError: canvas already has a rendering context'); this.contextMode = 'offscreen'; return {}; }
}

export class Event0 {
  constructor(type, init = {}) { this.type = type; this.isTrusted = init.isTrusted ?? false; this.composed = init.composed ?? false; this._path = []; Object.assign(this, init.extra ?? {}); }
  composedPath() { return this._path; }
}
export class InputEvent extends Event0 { constructor(type, init = {}) { super(type, init); this.inputType = init.inputType ?? ''; } }
export class PointerEvent extends Event0 {}
export class MouseEvent extends Event0 {}

export class MutationObserver0 {
  static instances = [];
  constructor(cb) { this.cb = cb; this.options = null; MutationObserver0.instances.push(this); }
  observe(_t, options) { this.options = options; }
  disconnect() { this.cb = null; }
}

export function installGlobals() {
  Object.assign(globalThis, {
    Element, HTMLElement, HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, HTMLCanvasElement, HTMLFormElement,
    ShadowRoot, InputEvent, PointerEvent, MouseEvent, MutationObserver: MutationObserver0,
    CSS: { escape: (s) => String(s).replace(/["\\]/g, '\\$&') },
  });
}

/** Path seen by a window capture listener: closed shadow internals are hidden (retargeted to the host). */
function windowPath(target) {
  let path = [];
  for (let n = target; n; ) {
    path.push(n);
    if (n instanceof ShadowRoot) {
      if (n.mode === 'closed') path = [n.host];
      n = n.host;
      if (path.at(-1) !== n) path.push(n);
      n = n.parentNode;
      continue;
    }
    n = n.parentNode;
  }
  return path;
}
const inShadow = (t) => { for (let n = t; n; n = n.parentNode) if (n instanceof ShadowRoot) return true; return false; };

export function makeWindow() {
  const listeners = new Map();
  const doc = new Document0();
  const html = new HTMLElement('html');
  const body = new HTMLElement('body');
  html.append(body);
  doc.append(html);
  doc.documentElement = html;
  doc.body = body;
  let poll = null;
  const win = {
    document: doc,
    navigator: { userActivation: { isActive: false } },
    addEventListener(t, fn) { const a = listeners.get(t) ?? []; a.push(fn); listeners.set(t, a); },
    removeEventListener(t, fn) { listeners.set(t, (listeners.get(t) ?? []).filter((f) => f !== fn)); },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    setInterval(fn) { poll = fn; return 1; },
    clearInterval() { poll = null; },
    listenerCount: () => [...listeners.values()].reduce((n, a) => n + a.length, 0),
  };
  const dispatch = (ev, target) => {
    if (!ev.composed && inShadow(target)) return; // non-composed events stop at the shadow root
    ev._path = [...windowPath(target), doc, win];
    for (const fn of listeners.get(ev.type) ?? []) fn(ev);
  };
  const mo = () => MutationObserver0.instances.at(-1);
  return {
    win, doc, body, dispatch,
    poll: () => poll?.(),
    mutate: (records) => mo().cb?.(records.map((r) => ({ addedNodes: [], ...r })), mo()),
    moOptions: () => mo().options,
    /** A real user click on a choice: state changes, then trusted click, input (composed) and change. */
    userClick(input, { trusted = true, inputTrusted = true } = {}) {
      if (input.type === 'checkbox') input.checked = !input.checked;
      else if (input.type === 'radio') {
        const root = input.getRootNode();
        for (const r of root.querySelectorAll('input')) if (r.type === 'radio' && r.name === input.name && r !== input && r.form === input.form) r.checked = false; // HTML: group = same tree + same form owner + same name
        input.checked = true;
      }
      dispatch(new MouseEvent('click', { isTrusted: trusted, composed: true }), input);
      dispatch(new InputEvent('input', { isTrusted: inputTrusted, composed: true }), input);
      dispatch(new Event0('change', { isTrusted: inputTrusted, composed: false }), input);
    },
    /** el.click() from page script: untrusted click; its activation input/change reported isTrusted=true in Edge 154 (evidence seq 27). */
    scriptClick(input) { this.userClick(input, { trusted: false, inputTrusted: true }); },
    userType(el, next, inputType = 'insertText') {
      dispatch(new InputEvent('beforeinput', { isTrusted: true, composed: true, inputType }), el);
      if ('value' in el && !(el instanceof HTMLElement && el.isContentEditable)) el.value = next; else el.textContent = next;
      dispatch(new InputEvent('input', { isTrusted: true, composed: true, inputType }), el);
    },
    pointer(type, target, x, y, trusted = true) { dispatch(new PointerEvent(type, { isTrusted: trusted, composed: true, extra: { clientX: x, clientY: y, pointerId: 1 } }), target); },
  };
}
