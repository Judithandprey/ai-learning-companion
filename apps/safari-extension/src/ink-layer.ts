// WRITE ink on the page: the tools, the editable document (ink.ts), durable saves through an optional
// store, and whether ink still lines up with the page. Used by page.ts; DOM-dependent.
//
// - The document's identity is a private SHA-256 of the exact address (query and fragment included,
//   credentials never), so different problems on one path never share ink. Only the origin and that
//   fingerprint are stored or reported.
// - Ink is never moved to fit the page. Ink is "aligned" only while the page is seen showing the same
//   content under it as when it was written (anchor evidence: same element fingerprint and position,
//   same media time). Reopened ink, ink over changed content and ink that cannot be checked is drawn
//   dashed and counted in the hint; it is kept, never dropped or re-attached.
// - Every change is saved as the whole document, in order. A stored document that cannot be read, or
//   that another tab extended, is never overwritten: this tab's ink is then saved whole as a separate
//   copy of the page's ink (ink.ts InkCopy), which is listed on reopening and can be shown and edited
//   (never merged or interleaved). A save that fails keeps everything in this tab, says so and offers
//   an export of the document. Ink that is not saved stays in this tab (across address changes and,
//   with a `keep` map from the installer, across a restart of the companion) until the page is left
//   or reloaded.
// - Writing and erasing never ask for an explanation.

import { addStroke, emptyInk, erase, parseCopy, parseInk, redo, stacks, undo, type InkAnchor, type InkCopy, type InkDisplay, type InkDocument, type InkPage, type InkPoint, type InkStroke } from './ink.ts';
import type { PointerKind } from './input-policy.ts';

export type InkStore = {
  /** Where saved ink lives, for the save status. */
  readonly label: string;
  /**
   * The page's stored main document (null when there is none) and its separate copies, as stored;
   * rejects when storage cannot be read.
   */
  load(page: InkPage): Promise<{ readonly main: unknown; readonly copies: ReadonlyArray<unknown> }>;
  /**
   * Saves the whole document as the page's main document, or as the separate `copy`; rejects with the
   * reason when it was not saved. The error's `name` is 'conflict' (with `forkedAt`, the operations
   * both share) when the stored document holds operations this one lacks (another tab saved newer ink).
   * Loads and saves must take effect in the order they are called.
   */
  save(doc: InkDocument, copy?: InkCopy): Promise<void>;
};

/** One pointer sample of a WRITE gesture: viewport and page coordinates, event time and pressure. */
export type InkSample = { readonly x: number; readonly y: number; readonly pageX: number; readonly pageY: number; readonly t: number; readonly pressure: number };

/** What was true when a WRITE gesture began; a gesture that outlives its document is not kept. */
export type InkGesture = {
  readonly generation: number;
  /** Page changes seen so far (opaque content cannot be compared, only known unchanged). */
  readonly changes: number;
  readonly tool: 'pen' | 'eraser';
  readonly display: InkDisplay;
  readonly anchor: InkAnchor | null;
  readonly source: InkStroke['source'];
};

type Status = 'memory' | 'loading' | 'ready' | 'saving' | 'saved' | 'failed' | 'conflict' | 'off';
const UNSAVED: ReadonlyArray<Status> = ['memory', 'saving', 'failed', 'conflict', 'off'];

/** One of a page's saved documents: its main document (`target` null) or a separate copy. */
type Saved = { readonly target: InkCopy | null; readonly ink: InkDocument };
/** What is shown and known for one address. */
type AddressState = {
  ink: InkDocument;
  status: Status;
  reason: string;
  aligned: Map<string, boolean>;
  sources: Map<string, Element>;
  /** Where the shown document is saved: the page's main document (null) or a separate copy. */
  target: InkCopy | null;
  /** False when the stored main document cannot be read: it is then never written. */
  mainWritable: boolean;
  /** Why the page's saved ink could not be loaded (then nothing stored is written); null when it was. */
  loadFailed: string | null;
  /** When the shown document was last known to be stored whole (saved, or opened from storage). */
  storedMark: { readonly at: string; readonly how: 'saved' | 'opened' } | null;
  /** The page's other saved documents, not shown. */
  others: Saved[];
  unreadableCopies: number;
};
/** Unsaved documents of this page kept in the tab, by exact address (never stored or reported). */
export type InkKeep = Map<string, AddressState>;

export type InkLayer = {
  readonly tools: HTMLElement;
  readonly buttons: Readonly<Record<'PEN' | 'ERASER' | 'MOUSE' | 'UNDO' | 'REDO' | 'DISPLAY' | 'COPIES' | 'EXPORT', HTMLButtonElement>>;
  /**
   * Starts a WRITE gesture at a viewport point (switching documents first if the address changed).
   * Null while this page's saved ink loads: the input is then left to the page.
   */
  readonly begin: (clientX: number, clientY: number) => InkGesture | null;
  /** Ends a WRITE gesture: a stroke with the pen tool, an erase with the eraser. */
  readonly finish: (gesture: InkGesture, samples: ReadonlyArray<InkSample>, pointer: PointerKind) => void;
  /** Draws the ink; `live` is the gesture in progress (a stroke, or an erase shown before it is applied). */
  readonly draw: (ctx: CanvasRenderingContext2D, scroll: { x: number; y: number }, live: ReadonlyArray<InkSample> | null) => void;
  /** Whether a pen press may be claimed now (false while loading). */
  readonly ready: () => boolean;
  readonly hint: () => string;
  /** What the user must know outside WRITE: unverified or unsaved ink (empty otherwise). */
  readonly notice: () => string;
  readonly state: () => Record<string, unknown>;
  /** Stops observing the page; unsaved ink stays in the `keep` map for the next companion in this page. */
  readonly destroy: () => void;
};

export const ERASER_RADIUS = 10;

/** A small non-cryptographic fingerprint (cyrb53) for anchor evidence; not a secret. */
function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** The exact address without credentials; the document identity is its SHA-256. */
export function exactAddress(href: string): string {
  const u = new URL(href);
  u.username = '';
  u.password = '';
  return `${u.origin}${u.pathname}${u.search}${u.hash}`;
}

const round = (n: number): number => Math.round(n * 100) / 100;
/** getRandomValues, unlike randomUUID and subtle, also works on pages that are not a secure context. */
const newId = (): string => `stk_${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

const OPAQUE = new Set(['CANVAS', 'IFRAME', 'EMBED', 'OBJECT']);
const HIDDEN_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
const SVG_SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon, image, use, text';
const SVG_GEOMETRY = ['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'transform', 'href', 'xlink:href', 'fill', 'stroke'];

export function createInkLayer(opts: {
  readonly win: Window;
  readonly session: { setMouseWrites(on: boolean): void; readonly mouseWrites: boolean };
  /** Null: ink is kept in this page's memory only (fixtures and previews say so). */
  readonly store: InkStore | null;
  /** Unsaved documents shared with later companions in the same page (default: this layer only). */
  readonly keep?: InkKeep;
  readonly ownElements: () => ReadonlyArray<Element>;
  readonly accepted: (e: Event) => boolean;
  readonly makeButton: (cls: string, glyph: string, label: string) => HTMLButtonElement;
  readonly onChange: () => void;
  readonly onOperation: (op: 'add' | 'erase' | 'undo' | 'redo', revision: number) => void;
}): InkLayer {
  const { win, session, store } = opts;
  const doc = win.document;
  const now = (): string => new Date().toISOString();
  const held: InkKeep = opts.keep ?? new Map();

  let address = '';
  let page: InkPage = { origin: win.location.origin, address_sha256: '' };
  let ink: InkDocument = emptyInk(page);
  let tool: 'pen' | 'eraser' = 'pen';
  let display: InkDisplay = 'content';
  let status: Status = store ? 'loading' : 'memory';
  let statusAt: string | null = null;
  let reason = '';
  let loading = true; // until the first load (started after construction) finishes
  let generation = 0;
  let dropped = false;
  let saveChain: Promise<void> = Promise.resolve();
  /** Saves requested while an earlier save was still running (evidence that the queue was used). */
  let overlappingSaves = 0;
  let destroyed = false;
  /** Alignment key (see keyOf) → the page was seen showing the same content there. Absent: not verified. */
  let aligned = new Map<string, boolean>();
  /** Alignment key → the page element it was last seen on, checked directly (also when off screen). */
  let sources = new Map<string, Element>();
  let target: InkCopy | null = null;
  let mainWritable = true;
  let loadFailed: string | null = null;
  let storedMark: AddressState['storedMark'] = null;
  let others: Saved[] = [];
  let unreadableCopies = 0;
  let exportedAt: string | null = null;

  // ---- tools ---------------------------------------------------------------------------------
  const tools = doc.createElement('span');
  tools.className = 'tools';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Writing tools');
  const buttons = {
    PEN: opts.makeButton('tool-pen', '✎', 'Pen'),
    ERASER: opts.makeButton('tool-eraser', '⌫', 'Eraser: erases only what it passes over'),
    MOUSE: opts.makeButton('tool-mouse text', 'Mouse', 'Mouse writing'),
    UNDO: opts.makeButton('tool-undo', '↶', 'Undo'),
    REDO: opts.makeButton('tool-redo', '↷', 'Redo'),
    DISPLAY: opts.makeButton('tool-display', '⇅', 'Placement of new ink'),
    COPIES: opts.makeButton('tool-copies', '⧉', 'Show another saved copy of this page\'s ink'),
    EXPORT: opts.makeButton('tool-export', '⤓', 'Export this ink as a file'),
  };
  tools.append(...Object.values(buttons));
  const onClick = (b: HTMLButtonElement, fn: () => void): void =>
    b.addEventListener('click', (e) => {
      if (opts.accepted(e)) fn();
    });
  onClick(buttons.PEN, () => {
    tool = 'pen';
    changed();
  });
  onClick(buttons.ERASER, () => {
    tool = 'eraser';
    changed();
  });
  onClick(buttons.MOUSE, () => {
    session.setMouseWrites(!session.mouseWrites);
    changed();
  });
  onClick(buttons.UNDO, () => commit(undo(ink, now()), 'undo'));
  onClick(buttons.REDO, () => commit(redo(ink, now()), 'redo'));
  onClick(buttons.DISPLAY, () => {
    display = display === 'content' ? 'screen' : 'content';
    changed();
  });
  onClick(buttons.COPIES, () => showNextCopy());
  onClick(buttons.EXPORT, () => exportInk());
  const label = (b: HTMLButtonElement, text: string): void => {
    b.setAttribute('aria-label', text);
    b.title = text;
  };
  function changed(): void {
    if (destroyed) return;
    const s = stacks(ink);
    buttons.PEN.setAttribute('aria-pressed', String(tool === 'pen'));
    buttons.ERASER.setAttribute('aria-pressed', String(tool === 'eraser'));
    buttons.MOUSE.setAttribute('aria-pressed', String(session.mouseWrites));
    label(buttons.MOUSE, session.mouseWrites ? 'Mouse writing is on: the mouse writes and erases in Write mode' : 'Mouse writing is off: the mouse operates the page');
    buttons.UNDO.disabled = s.undo.length === 0;
    buttons.REDO.disabled = s.redo.length === 0;
    buttons.DISPLAY.textContent = display === 'content' ? '⇅' : '▣';
    buttons.DISPLAY.setAttribute('aria-pressed', String(display === 'screen'));
    label(buttons.DISPLAY, display === 'content' ? 'New ink follows the page when it scrolls (press: stays on screen)' : 'New ink stays fixed on screen (press: follows the page)');
    buttons.COPIES.hidden = others.length === 0;
    buttons.COPIES.disabled = !(status === 'saved' || status === 'ready');
    label(buttons.COPIES, others.length === 0 ? 'No other saved copy' : `Show ${copyText(others[0]!.target)} (${others.length + 1} saved copies of this page's ink)`);
    buttons.EXPORT.hidden = !(status === 'failed' || status === 'off');
    opts.onChange();
  }

  // ---- saving ------------------------------------------------------------------------------------
  const newCopy = (why: InkCopy['reason'], forkedFrom: string | null, forkedAt: number | null): InkCopy => ({
    id: Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join(''),
    reason: why,
    created_at: now(),
    forked_from: forkedFrom,
    forked_at: forkedAt,
  });
  /**
   * Why a save was refused: `conflict` (another tab saved other ink to that record) and `unreadable`
   * (the stored record cannot be read by this version) keep the work as a separate copy; `failed` is
   * any other failure of storage (quota, transport, commit), which keeps it in the tab and says so.
   */
  type Failure = { readonly kind: 'conflict' | 'unreadable' | 'failed'; readonly forkedAt: number | null; readonly reason: string } | null;
  /** One save, handed to the store at once (the store keeps call order); its outcome never rejects. */
  const saving = (doc: InkDocument, into: InkCopy | null): Promise<Failure> =>
    store!.save(doc, into ?? undefined).then(
      () => null,
      (error: unknown) => {
        const name = error instanceof Error ? error.name : '';
        return {
          kind: name === 'conflict' || name === 'unreadable' ? name : 'failed',
          forkedAt: name === 'conflict' ? ((error as { forkedAt?: number | null }).forkedAt ?? null) : null,
          reason: error instanceof Error ? error.message : String(error),
        };
      },
    );
  const persist = (): void => {
    if (!store || !['ready', 'saving', 'saved', 'failed'].includes(status)) return;
    // Nothing stored is written when it could not be read or loaded: new ink goes to a separate copy.
    if (target === null && (loadFailed !== null || !mainWritable)) target = newCopy(loadFailed !== null ? 'unloaded' : 'unreadable', null, null);
    const snapshot = ink;
    const into = target;
    if (status === 'saving') overlappingSaves += 1;
    status = 'saving';
    const outcome = saving(snapshot, into);
    saveChain = saveChain.then(async () => {
      const failure = await outcome;
      if (!destroyed && snapshot === ink && into === target) {
        if (failure && failure.kind !== 'failed') return keepAsCopy(failure, into);
        status = failure ? 'failed' : 'saved';
        statusAt = now();
        reason = failure?.reason ?? '';
        if (!failure) storedMark = { at: statusAt, how: 'saved' };
      } else {
        // The document moved on (a later change, another address, or Stop): its own later save reports
        // itself, and a document kept in the tab takes the outcome.
        for (const [key, h] of held) if (h.ink === snapshot) settleHeld(key, h, into, failure);
      }
      changed();
    });
  };
  /** The separate copy that keeps a document whose save to `into` was refused (conflict or unreadable record). */
  const copyAfter = (failure: NonNullable<Failure>, into: InkCopy | null): InkCopy =>
    newCopy(failure.kind === 'conflict' ? 'conflict' : 'unreadable', into?.id ?? null, failure.forkedAt);
  /**
   * The outcome of a save of a document kept in the tab, not shown: saved (no longer kept), failed, or
   * refused (conflict, or the record became unreadable), in which case it is saved as a separate copy
   * at once.
   */
  function settleHeld(key: string, h: AddressState, into: InkCopy | null, failure: Failure): void {
    if (!failure) {
      held.delete(key);
      return;
    }
    if (failure.kind === 'failed') {
      Object.assign(h, { status: 'failed', reason: failure.reason });
      return;
    }
    const copy = copyAfter(failure, into);
    Object.assign(h, { target: copy, status: 'saving', reason: failure.reason, mainWritable: h.mainWritable && !(failure.kind === 'unreadable' && into === null) });
    const outcome = saving(h.ink, copy);
    saveChain = saveChain.then(async () => {
      const again = await outcome;
      if (held.get(key) !== h) return; // shown again meanwhile: it reports its own saves
      if (!again) held.delete(key);
      else Object.assign(h, { status: 'failed', reason: again.reason });
    });
  }

  /**
   * The record this tab was saving to refused the document: another tab saved other ink to it, or it
   * can no longer be read by this version. This tab's document is kept whole as a separate copy (the
   * stored record stays as it is; nothing is merged or overwritten), and the other saved documents
   * are listed to show.
   */
  function keepAsCopy(failure: NonNullable<Failure>, into: InkCopy | null): void {
    if (failure.kind === 'unreadable' && into === null) mainWritable = false;
    target = copyAfter(failure, into);
    status = 'ready';
    reason = failure.reason;
    persist();
    changed();
    void listOthers();
  }
  /** Refreshes the page's other saved documents (all but the one shown) from the store. */
  async function listOthers(): Promise<void> {
    if (!store) return;
    const at = generation;
    try {
      const listed = await saveChain.then(() => store.load(page));
      if (at !== generation || destroyed) return;
      const known = readSaved(listed);
      others = known.saved.filter((d) => (d.target?.id ?? null) !== (target?.id ?? null));
      unreadableCopies = known.unreadableCopies;
    } catch {
      // Listing is only for showing other copies; what is shown and saved is unaffected.
    }
    changed();
  }
  /** The page's readable saved documents, main first, then copies newest first. */
  function readSaved(listed: { readonly main: unknown; readonly copies: ReadonlyArray<unknown> }): { saved: Saved[]; mainReadable: boolean; unreadableCopies: number } {
    const main = listed.main === null || listed.main === undefined ? null : parseInk(listed.main, page);
    const copies = listed.copies.map((c) => parseCopy(c, page));
    const readable = copies.flatMap((c) => (c.ok ? [{ target: c.copy, ink: c.doc }] : [])).sort((a, b) => b.target.created_at.localeCompare(a.target.created_at));
    return { saved: [...(main?.ok ? [{ target: null, ink: main.doc }] : []), ...readable], mainReadable: main === null || main.ok, unreadableCopies: copies.length - readable.length };
  }

  const commit = (next: InkDocument, op: 'add' | 'erase' | 'undo' | 'redo'): void => {
    if (next === ink) return; // nothing changed: no operation and no save
    ink = next;
    dropped = false;
    opts.onOperation(op, ink.revision);
    persist();
    changed();
  };

  // ---- anchors and alignment -------------------------------------------------------------------
  const isOwn = (el: Element): boolean => opts.ownElements().some((h) => h === el || h.contains(el));
  /** Elements under a viewport point, topmost first, looking into open shadow roots. */
  const stackAt = (x: number, y: number): Element[] => {
    let stack = doc.elementsFromPoint(x, y).filter((e) => !isOwn(e));
    for (let depth = 0; depth < 5; depth++) {
      const root = stack[0]?.shadowRoot;
      const inner = root ? root.elementsFromPoint(x, y).filter((e) => !stack.includes(e)) : [];
      if (inner.length === 0) break;
      stack = [...inner, ...stack];
    }
    return stack;
  };
  /** SVG text, which has no innerText. */
  const textOf = (el: Element): string => {
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!HIDDEN_TEXT.has(n.parentElement?.tagName ?? '')) parts.push(n.nodeValue ?? '');
    return parts.join(' ');
  };
  const rendered = (el: Element): string => (el instanceof HTMLElement ? el.innerText : textOf(el)).replace(/\s+/g, ' ').trim();
  // Evidence is recomputed only after the page changed (any DOM change clears this cache).
  let evidenceCache = new WeakMap<Element, string>();
  /**
   * Evidence of what an element shows: its tag, source address (images, media), rendered text, the
   * sources of images and media inside it and, for SVG, the geometry of every shape of its drawing.
   * An element without text or source (a shape, a background) adds its background image and the text
   * of the nearest enclosing element that has text (the figure or formula it belongs to).
   */
  const evidence = (el: Element): string => {
    const cached = evidenceCache.get(el);
    if (cached !== undefined) return cached;
    const src = el instanceof HTMLImageElement || el instanceof HTMLMediaElement ? el.currentSrc : '';
    const own = rendered(el);
    const media = Array.from(el.querySelectorAll('img, video, audio'), (m) => (m as HTMLImageElement | HTMLMediaElement).currentSrc).join(' ');
    const svg = el instanceof SVGSVGElement ? el : el instanceof SVGElement ? el.ownerSVGElement : null;
    const geometry = svg ? [svg, ...Array.from(svg.querySelectorAll(SVG_SHAPES))].map((s) => SVG_GEOMETRY.map((n) => s.getAttribute(n) ?? '').join(',')).join(';') : '';
    let context = '';
    if (!own && !src) {
      context = win.getComputedStyle(el).backgroundImage;
      let text = '';
      for (let p = el.parentElement; p && p !== doc.body && p !== doc.documentElement && !text; p = p.parentElement) text = rendered(p);
      context += `|${text}`;
    }
    const value = fingerprint(`${el.tagName}|${src}|${own}|${media}|${geometry}|${context}`);
    evidenceCache.set(el, value);
    return value;
  };
  // Media under an overlay or player chrome is what ink over it is about. Ink in an empty area (a
  // margin) is anchored to the page body. A component whose content is closed to us counts as opaque.
  /** The element each anchor taken in this page was read from. */
  const anchorElement = new WeakMap<InkAnchor, Element>();
  const anchorAt = (clientX: number, clientY: number): InkAnchor | null => {
    const stack = stackAt(clientX, clientY);
    const el = stack.find((e) => e instanceof HTMLMediaElement) ?? stack.find((e) => e !== doc.documentElement && e !== doc.body) ?? doc.body;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // A defined custom element with nothing readable (undefined ones, e.g. MathJax's mjx-*, are plain markup).
    const closedComponent = el.localName.includes('-') && !el.shadowRoot && el.childElementCount === 0 && !(el.textContent ?? '').trim() && el.matches(':defined');
    const anchor: InkAnchor = {
      text_hash: evidence(el),
      rect: { x: round(r.left + win.scrollX), y: round(r.top + win.scrollY), width: round(r.width), height: round(r.height) },
      media_time: el instanceof HTMLMediaElement ? round(el.currentTime) : null,
      opaque: OPAQUE.has(el.tagName) || closedComponent,
    };
    anchorElement.set(anchor, el);
    watchRoot(el);
    return anchor;
  };
  /**
   * Strokes sharing a key share alignment: pieces of an erased stroke keep their stroke's anchor or
   * root. Both placements are checked against what they were written over: content ink must still
   * lie on it, and screen-fixed ink, which stays where it is on screen, must still have it on the page
   * unchanged. Strokes over opaque content never share a key: a new stroke there proves nothing about
   * older ink.
   */
  const keyOf = (s: InkStroke): string => {
    const a = s.anchor;
    return a && !a.opaque ? `a:${a.text_hash}@${a.rect.x},${a.rect.y},${a.rect.width},${a.rect.height}@${a.media_time ?? ''}` : `r:${s.derived_from ?? s.id}`;
  };
  const uncertain = (s: InkStroke): boolean => aligned.get(keyOf(s)) !== true;
  const close = (a: number, b: number): boolean => Math.abs(a - b) < 2;
  /** Whether an element is where the anchor says, looking the same (works off screen too). */
  const shows = (el: Element, a: InkAnchor): boolean => {
    const r = a.rect;
    const b = el.getBoundingClientRect();
    if (!close(b.left + win.scrollX, r.x) || !close(b.top + win.scrollY, r.y) || !close(b.width, r.width) || !close(b.height, r.height)) return false;
    if (evidence(el) !== a.text_hash) return false;
    if (a.media_time !== null) return el instanceof HTMLMediaElement && Math.abs(el.currentTime - a.media_time) <= 0.5;
    return true;
  };
  /**
   * Whether the page still shows what the anchor describes: first on the element it was last seen on
   * (wherever that is now, on screen or not), else on whatever is at the anchor's place on screen.
   * Null only when it was never seen and its place is off screen; a key that was verified, or whose
   * element no longer shows it, is then not verified (never kept verified without being checked).
   */
  const anchored = (a: InkAnchor, key: string): boolean | null => {
    const known = sources.get(key);
    if (known?.isConnected && shows(known, a)) return true;
    const r = a.rect;
    // A point inside both the anchor's rectangle and the viewport (the anchor may be large).
    const x = Math.min(Math.max(win.innerWidth / 2, r.x - win.scrollX + 1), r.x - win.scrollX + r.width - 1);
    const y = Math.min(Math.max(win.innerHeight / 2, r.y - win.scrollY + 1), r.y - win.scrollY + r.height - 1);
    if (x < 0 || y < 0 || x >= win.innerWidth || y >= win.innerHeight) return known || aligned.get(key) === true ? false : null;
    const found = stackAt(x, y).find((el) => shows(el, a));
    if (!found) return false;
    sources.set(key, found);
    watchRoot(found);
    return true;
  };
  /** Set by anything that may have changed what canvas, iframe or embedded content shows. */
  let pageTouched = false;
  /** How many such changes were seen (a gesture compares it from its start to its end). */
  let pageChanges = 0;
  /**
   * Rechecks anchored ink of both placements, on screen or not. The pixels of opaque content cannot be
   * compared: ink over it is verified only until the page may have changed, and never again after that
   * or after a reopen.
   */
  const verifyAlignment = (): boolean => {
    let any = false;
    const set = (key: string, ok: boolean): void => {
      if (aligned.get(key) === ok) return;
      aligned.set(key, ok);
      any = true;
    };
    if (pageTouched) {
      pageTouched = false;
      for (const id of ink.visible) if (ink.strokes[id]!.anchor?.opaque) set(keyOf(ink.strokes[id]!), false);
    }
    const seen = new Set<string>();
    for (const id of ink.visible) {
      const s = ink.strokes[id]!;
      const key = keyOf(s);
      if (!s.anchor || seen.has(key)) continue;
      seen.add(key);
      const ok = anchored(s.anchor, key);
      if (ok === false || (ok === true && !s.anchor.opaque)) set(key, ok);
    }
    return any;
  };
  let alignTimer: ReturnType<typeof setTimeout> | null = null;
  // Throttled, not debounced: a page that keeps changing (animations, captions) is still rechecked.
  const scheduleAlignment = (): void => {
    if (alignTimer) return;
    alignTimer = setTimeout(() => {
      alignTimer = null;
      if (!destroyed && verifyAlignment()) opts.onChange();
    }, 250);
  };
  const touched = (): void => {
    pageTouched = true;
    pageChanges += 1;
    scheduleAlignment();
  };
  const mutations = new MutationObserver((records) => {
    if (records.every((r) => r.target instanceof Element && isOwn(r.target))) return;
    evidenceCache = new WeakMap();
    touched();
  });
  const observed = { subtree: true, childList: true, characterData: true, attributes: true };
  mutations.observe(doc.documentElement, observed);
  // Changes and inner scrolling inside the page's open shadow roots do not reach the document: the
  // roots that ink is anchored into are observed too.
  const roots = new Set<ShadowRoot>();
  function watchRoot(el: Element): void {
    const root = el.getRootNode();
    if (!(root instanceof ShadowRoot) || roots.has(root)) return;
    roots.add(root);
    mutations.observe(root, observed);
    root.addEventListener('scroll', scheduleAlignment, { capture: true, passive: true });
    watchRoot(root.host); // and the roots around it
  }
  // Changes that do not always mutate the DOM. Scrolling (also inside containers, whose scroll events
  // do not bubble) and resizing move content. Media playback, input to the page (on the document, so
  // input this layer's page claims as ink never reaches it), disclosure toggles and late image or font
  // loads may also change what canvas or embedded content shows.
  const moveEvents = ['scroll', 'resize'] as const;
  for (const type of moveEvents) win.addEventListener(type, scheduleAlignment, { capture: true, passive: true });
  const changeEvents = ['timeupdate', 'seeked', 'pause', 'play', 'toggle', 'load', 'input', 'change', 'pointerup', 'keyup', 'wheel'] as const;
  const onPageEvent = (e: Event): void => {
    if (!e.composedPath().some((n) => n instanceof Element && isOwn(n))) touched();
  };
  for (const type of changeEvents) doc.addEventListener(type, onPageEvent, { capture: true, passive: true });
  doc.fonts?.addEventListener('loadingdone', scheduleAlignment);

  // ---- identity and loading ------------------------------------------------------------------
  /** Keeps the document of the address being left, when it has ink that is not saved. */
  const keepUnsaved = (): void => {
    if (address && ink.history.length > 0 && UNSAVED.includes(status)) held.set(address, { ink, status, reason, aligned, sources, target, mainWritable, loadFailed, storedMark, others, unreadableCopies });
  };
  async function load(): Promise<void> {
    const current = ++generation;
    loading = true;
    keepUnsaved();
    address = exactAddress(win.location.href);
    aligned = new Map();
    sources = new Map();
    target = null;
    mainWritable = true;
    loadFailed = null;
    storedMark = null;
    others = [];
    unreadableCopies = 0;
    exportedAt = null;
    page = { origin: win.location.origin, address_sha256: '' };
    ink = emptyInk(page); // nothing written on the previous address is shown on this one
    status = store ? 'loading' : 'memory';
    statusAt = null;
    reason = '';
    changed();
    try {
      const kept = held.get(address);
      if (kept) {
        held.delete(address);
        ink = kept.ink;
        page = ink.page;
        ({ aligned, sources, status, reason, target, mainWritable, loadFailed, storedMark, others, unreadableCopies } = kept);
        verifyAlignment();
        if (status === 'failed' || status === 'saving') persist(); // save it (again) now that this address is back
        return;
      }
      const subtle = globalThis.crypto?.subtle;
      if (!subtle) {
        if (store) {
          status = 'off';
          reason = 'this page is not a secure context, so its address cannot be fingerprinted';
        }
        return;
      }
      const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(address));
      if (current !== generation || destroyed) return;
      page = { ...page, address_sha256: Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('') };
      ink = emptyInk(page);
      if (!store) return;
      let listed: { readonly main: unknown; readonly copies: ReadonlyArray<unknown> };
      try {
        // After this layer's pending saves, so a quick return to an address reads its latest ink.
        listed = await saveChain.then(() => store.load(page));
      } catch (error) {
        if (current !== generation || destroyed) return;
        // What is stored could not be loaded: nothing stored is written; new ink is saved as a separate copy.
        loadFailed = error instanceof Error ? error.message : String(error);
        status = 'ready';
        reason = 'new ink will be saved as a separate copy';
        return;
      }
      if (current !== generation || destroyed) return;
      // The main document is shown, or, when it cannot be read, the newest copy; the others are listed.
      const known = readSaved(listed);
      mainWritable = known.mainReadable;
      unreadableCopies = known.unreadableCopies;
      const [shown, ...rest] = known.saved;
      others = rest;
      if (shown) {
        ({ ink, target } = shown);
        storedMark = { at: now(), how: 'opened' };
      }
      status = 'ready';
      reason = shown ? `reopened ${ink.visible.length} stroke(s)${target ? ` of ${copyText(target)}` : ''}` : mainWritable ? 'nothing saved for this page yet' : 'new ink will be saved as a separate copy';
      verifyAlignment(); // reopened ink is unverified until the page is seen showing the same content
    } finally {
      if (current === generation && !destroyed) {
        loading = false;
        changed();
      }
    }
  }
  /** Shows the next of the page's other saved documents; the shown one (saved) joins the others. */
  function showNextCopy(): void {
    if (others.length === 0 || !(status === 'saved' || status === 'ready')) return;
    const [next, ...rest] = others;
    others = [...rest, { target, ink }];
    ({ ink, target } = next!);
    storedMark = { at: now(), how: 'opened' };
    status = 'ready';
    reason = `showing ${copyText(target)}`;
    aligned = new Map();
    sources = new Map();
    dropped = false;
    verifyAlignment();
    changed();
  }
  let exportRevokes: Array<() => void> = [];
  let exportTimer: ReturnType<typeof setTimeout> | null = null;
  function revokeExports(): void {
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = null;
    for (const revoke of exportRevokes) revoke();
    exportRevokes = [];
  }
  /** Saves the shown document as a file (when it cannot be saved on this device). */
  function exportInk(): void {
    const file = { format: 'lc-web-ink-export/v1', exported_at: now(), not_saved: `${status}: ${reason}`, copy: target, doc: ink };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = `learning-companion-ink-${(page.address_sha256 || 'page').slice(0, 12)}-${now().slice(0, 19).replace(/[-:T]/g, '')}.json`;
    a.click();
    exportRevokes.push(() => URL.revokeObjectURL(url));
    exportTimer ??= setTimeout(revokeExports, 60000); // the download has started well before then
    exportedAt = now();
    changed();
  }

  const checkAddress = (): void => {
    if (!destroyed && exactAddress(win.location.href) !== address) void load();
  };
  const addressTimer = setInterval(checkAddress, 1000);

  // ---- gestures --------------------------------------------------------------------------------------
  const begin = (clientX: number, clientY: number): InkGesture | null => {
    checkAddress();
    if (loading) return null;
    return {
      generation,
      changes: pageChanges,
      tool,
      display,
      anchor: anchorAt(clientX, clientY),
      source: {
        title: doc.title,
        viewport: { width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio || 1 },
        scroll: { x: round(win.scrollX), y: round(win.scrollY) },
      },
    };
  };
  const eraseWith = (from: InkDocument, samples: ReadonlyArray<InkSample>): InkDocument =>
    erase(from, { content: samples.map((s) => [s.pageX, s.pageY] as const), screen: samples.map((s) => [s.x, s.y] as const) }, ERASER_RADIUS, now(), newId);
  const finish = (gesture: InkGesture, samples: ReadonlyArray<InkSample>, pointer: PointerKind): void => {
    if (samples.length === 0) return;
    checkAddress(); // an address change during the gesture is noticed here at the latest
    if (gesture.generation !== generation || loading) {
      // The address changed during the gesture: it belongs to neither document.
      dropped = true;
      return changed();
    }
    if (gesture.tool === 'eraser') return commit(eraseWith(ink, samples), 'erase');
    const first = samples[0]!;
    const content = gesture.display === 'content';
    const stroke: InkStroke = {
      id: newId(),
      input: pointer === 'pen' ? 'pen' : pointer === 'touch' ? 'touch' : 'mouse',
      display: gesture.display,
      points: samples.map((s): InkPoint => [round(content ? s.pageX : s.x), round(content ? s.pageY : s.y), Math.round(s.t - first.t), round(s.pressure)]),
      created_at: now(),
      source: gesture.source,
      anchor: gesture.anchor,
      derived_from: null,
    };
    // The stroke keeps what it began over. It is aligned only if that is still what the page shows now,
    // at its end: a change during the gesture leaves it marked, never silently attached to new content.
    const a = gesture.anchor;
    const key = keyOf(stroke);
    const el = a ? anchorElement.get(a) : undefined;
    if (el) sources.set(key, el); // checked on the element it began over, even if that is now off screen
    aligned.set(key, a === null || (a.opaque ? pageChanges === gesture.changes : anchored(a, key) === true));
    commit(addStroke(ink, stroke, stroke.created_at), 'add');
  };

  // ---- drawing -----------------------------------------------------------------------------------------
  const line = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number, ...unknown[]]>, off: { x: number; y: number }): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x - off.x, y - off.y) : ctx.lineTo(x - off.x, y - off.y)));
    if (pts.length === 1) ctx.lineTo(pts[0]![0] - off.x + 0.1, pts[0]![1] - off.y);
    ctx.stroke();
  };
  // The eraser preview grows with the gesture: only the newest part of the path is applied each time.
  // It is shown only; the erase that is kept is computed once, from the whole path, when it ends.
  let preview: { base: InkDocument; doc: InkDocument; count: number } | null = null;
  const draw = (ctx: CanvasRenderingContext2D, scroll: { x: number; y: number }, live: ReadonlyArray<InkSample> | null): void => {
    let shown = ink;
    if (live !== null && live.length > 0 && tool === 'eraser') {
      if (!preview || preview.base !== ink || live.length < preview.count) preview = { base: ink, doc: ink, count: 0 };
      if (live.length > preview.count) {
        preview.doc = eraseWith(preview.doc, live.slice(Math.max(0, preview.count - 1)));
        preview.count = live.length;
      }
      shown = preview.doc;
    } else {
      preview = null;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of shown.visible) {
      const s = shown.strokes[id]!;
      const unsure = uncertain(s);
      ctx.strokeStyle = s.display === 'screen' ? '#6e3fd1' : '#1c1c1e';
      ctx.globalAlpha = unsure ? 0.5 : 1;
      ctx.setLineDash(unsure ? [6, 5] : []);
      ctx.lineWidth = 2.5;
      line(ctx, s.points, s.display === 'content' ? scroll : { x: 0, y: 0 });
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    if (!live || live.length === 0) return;
    if (preview) {
      // The eraser's path and its tip, so the user sees what it passes over.
      ctx.strokeStyle = 'rgba(255, 69, 58, 0.25)';
      ctx.lineWidth = ERASER_RADIUS * 2;
      line(ctx, live.map((s) => [s.x, s.y] as const), { x: 0, y: 0 });
      const tip = live[live.length - 1]!;
      ctx.strokeStyle = '#ff453a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, ERASER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = display === 'screen' ? '#6e3fd1' : '#1c1c1e';
    ctx.lineWidth = 2.5;
    if (display === 'content') line(ctx, live.map((s) => [s.pageX, s.pageY] as const), scroll);
    else line(ctx, live.map((s) => [s.x, s.y] as const), { x: 0, y: 0 });
  };

  // ---- text ------------------------------------------------------------------------------------------------
  const time = (iso: string): string => new Date(iso).toLocaleTimeString();
  function copyText(c: InkCopy | null): string {
    if (c === null) return "this page's main saved ink";
    const made = `a separate copy made at ${time(c.created_at)}`;
    if (c.reason === 'conflict') return `${made} because another tab or window had saved other ink to ${c.forked_from ? 'the copy this tab was saving to' : "this page's main saved ink"} since this tab opened it`;
    if (c.reason === 'unloaded') return `${made} because this page's saved ink could not be loaded then`;
    return `${made} because ${c.forked_from ? 'the copy this tab was saving to' : "this page's main saved ink"} could not be read by this version`;
  }
  const onlyHere = (): string =>
    `${storedMark ? `changes since ${storedMark.how === 'saved' ? 'the last save' : 'it was opened'} at ${time(storedMark.at)} are` : 'this ink is'} only in this tab until you leave or reload the page; use Export (⤓) to keep a file of the whole ink`;
  const saveText = (): string => {
    switch (status) {
      case 'memory':
        return 'Kept on this page only; not saved.';
      case 'loading':
        return 'Loading saved ink…';
      case 'ready':
        return `Saving to ${store!.label}${target ? ` as ${copyText(target)}` : ''}: ${reason}.`;
      case 'saving':
        return 'Saving…';
      case 'saved':
        return `Saved to ${store!.label} at ${time(statusAt!)}${target ? `, as ${copyText(target)}` : ''}.`;
      case 'failed':
        return `Not saved: ${reason}. So far ${onlyHere()}. Saving is tried again with your next change.`;
      case 'conflict':
        return `Not saved to the main copy: ${reason}. This tab's ink is being saved as a separate copy.`;
      case 'off':
        return `Not saving: ${reason}. So far ${onlyHere()}.`;
    }
  };
  const extraText = (): string => {
    const unsure = ink.visible.filter((id) => uncertain(ink.strokes[id]!)).length;
    const n = others.length;
    return [
      dropped ? 'A stroke made while the page address changed was not kept.' : '',
      unsure > 0 ? `${unsure} stroke(s) dashed: not verified to line up with what the page shows now.` : '',
      n > 0
        ? `${n} other saved cop${n === 1 ? 'y' : 'ies'} of this page's ink kept (${others.map((o) => (o.target === null ? 'the main copy' : o.target.reason === 'conflict' ? 'kept from a conflict' : o.target.reason === 'unloaded' ? 'kept while saved ink could not be loaded' : o.target.forked_from ? 'kept while another copy could not be read' : 'kept while the main copy could not be read')).join('; ')}): ${buttons.COPIES.disabled ? `${n === 1 ? 'it' : 'they'} can be shown once the ink shown now is saved` : `press ⧉ to show ${n === 1 ? 'it' : 'them'} in turn`}.`
        : '',
      mainWritable ? '' : "This page's main saved ink cannot be read by this version; it is left untouched.",
      loadFailed === null ? '' : `This page's saved ink could not be loaded (${loadFailed}); nothing stored was written.`,
      unreadableCopies > 0 ? `${unreadableCopies} stored cop${unreadableCopies === 1 ? 'y' : 'ies'} cannot be read by this version and are left untouched.` : '',
      exportedAt ? `Export started at ${time(exportedAt)}.` : '',
      held.size > 0 ? `Unsaved ink of ${held.size} other address(es) of this page stays in this tab until you leave or reload the page.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  };
  const hint = (): string => {
    const who = session.mouseWrites ? 'Pen and mouse' : 'Pen';
    const what = tool === 'eraser' ? `${who} erase only what they pass over` : `${who} write${session.mouseWrites ? '' : 's (mouse writing off)'}`;
    const where = display === 'content' ? 'new ink follows the page' : 'new ink stays on screen';
    return `${what}; ${where}; fingers navigate. ${saveText()} ${extraText()}`.trim();
  };
  const notice = (): string => {
    const unsaved = ink.history.length > 0 && ['memory', 'failed', 'conflict', 'off'].includes(status);
    return `${unsaved ? saveText() : ''} ${extraText()}`.trim();
  };

  // After construction, so the installer's onChange can already use the returned layer.
  queueMicrotask(() => void load());

  return {
    tools,
    buttons,
    begin,
    finish,
    draw,
    ready: () => !loading,
    hint,
    notice,
    state: () => ({
      page: { ...page },
      hint: hint(),
      status,
      reason,
      revision: ink.revision,
      visible: [...ink.visible],
      strokes: Object.keys(ink.strokes).length,
      history: ink.history.map((op) => op.op),
      undo: stacks(ink).undo.length,
      redo: stacks(ink).redo.length,
      tool,
      display,
      mouseWrites: session.mouseWrites,
      overlappingSaves,
      held: held.size,
      copy: target,
      others: others.map((o) => ({ copy: o.target, visible: o.ink.visible.length, history: o.ink.history.length })),
      mainWritable,
      loadFailed,
      unreadableCopies,
      exportable: !buttons.EXPORT.hidden,
      exportedAt,
      shown: ink.visible.map((id) => {
        const s = ink.strokes[id]!;
        return { id, display: s.display, input: s.input, first: s.points[0], points: s.points.length, derived_from: s.derived_from, uncertain: uncertain(s), anchored: s.anchor !== null, opaque: s.anchor?.opaque ?? false };
      }),
    }),
    destroy: () => {
      if (!loading) keepUnsaved();
      destroyed = true;
      mutations.disconnect();
      clearInterval(addressTimer);
      if (alignTimer) clearTimeout(alignTimer);
      revokeExports();
      for (const type of moveEvents) win.removeEventListener(type, scheduleAlignment, { capture: true });
      for (const root of roots) root.removeEventListener('scroll', scheduleAlignment, { capture: true });
      for (const type of changeEvents) doc.removeEventListener(type, onPageEvent, { capture: true });
      doc.fonts?.removeEventListener('loadingdone', scheduleAlignment);
    },
  };
}
