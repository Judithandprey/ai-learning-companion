// Reads what the user marked from the live DOM and freezes it synchronously
// into a snapshot payload. Only structure and state are read: no pixels, form
// values, cookies or storage.

import { unionRects, type PixelPoint, type PixelRect } from './anchor.ts';
import { snapshotLocation, type DomSnapshotPayload, type MediaState } from './frame.ts';

const CONTEXT_LIMIT = 1000;

type Caret = { node: Node; offset: number };

function caretAt(doc: Document, x: number, y: number): Caret | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
  }
  return null;
}

function isOwnUi(node: Node, host: Element): boolean {
  return host.contains(node);
}

function wordBounds(text: string, offset: number): [number, number] | null {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    for (const seg of new Segmenter(undefined, { granularity: 'word' }).segment(text)) {
      const end = seg.index + seg.segment.length;
      if (seg.isWordLike && offset >= seg.index && offset <= end) return [seg.index, end];
    }
    return null;
  }
  let start = offset;
  let end = offset;
  while (start > 0 && /\w/.test(text[start - 1]!)) start--;
  while (end < text.length && /\w/.test(text[end]!)) end++;
  return end > start ? [start, end] : null;
}

/** Verifies the caret really lies under the point (caret APIs snap to the nearest text). */
function rangeContainsPoint(range: Range, point: PixelPoint, slack = 2): boolean {
  return Array.from(range.getClientRects()).some(
    (r) => point.x >= r.left - slack && point.x <= r.right + slack && point.y >= r.top - slack && point.y <= r.bottom + slack,
  );
}

export type TextHit = {
  readonly text: string;
  readonly rect: PixelRect;
  readonly container: Element | null;
  /** Live range, used only to keep the on-page highlight aligned after reflow. */
  readonly range: Range;
};

/** Word under a tap, or null when no text is there (video, image, canvas...). */
export function wordAt(doc: Document, point: PixelPoint, host: Element): TextHit | null {
  const caret = caretAt(doc, point.x, point.y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE || isOwnUi(caret.node, host)) return null;
  const text = caret.node.textContent ?? '';
  const bounds = wordBounds(text, caret.offset);
  if (!bounds) return null;
  const range = doc.createRange();
  range.setStart(caret.node, bounds[0]);
  range.setEnd(caret.node, bounds[1]);
  if (!rangeContainsPoint(range, point)) return null;
  return hitFromRange(range);
}

/** Text between the two ends of a sweep, expanded to whole words. */
export function textAlong(doc: Document, from: PixelPoint, to: PixelPoint, host: Element): TextHit | null {
  const a = caretAt(doc, from.x, from.y);
  const b = caretAt(doc, to.x, to.y);
  if (!a || !b || a.node.nodeType !== Node.TEXT_NODE || b.node.nodeType !== Node.TEXT_NODE) return null;
  if (isOwnUi(a.node, host) || isOwnUi(b.node, host)) return null;
  const range = doc.createRange();
  const forward = a.node === b.node ? a.offset <= b.offset : Boolean(a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const [s, e] = forward ? [a, b] : [b, a];
  const sb = wordBounds(s.node.textContent ?? '', s.offset);
  const eb = wordBounds(e.node.textContent ?? '', e.offset);
  range.setStart(s.node, sb ? sb[0] : s.offset);
  range.setEnd(e.node, eb ? eb[1] : e.offset);
  if (range.collapsed) return null;
  return hitFromRange(range);
}

const NON_RENDERED = 'script,style,noscript,template,[hidden]';

/** True for text whose parent is not rendered (script/style/hidden/display:none). */
function unrendered(node: Node): boolean {
  const parent = node.parentElement;
  return !parent || parent.closest(NON_RENDERED) !== null || parent.getClientRects().length === 0;
}

/**
 * Rendered text inside a range. Range.toString() would also return the text of
 * scripts, styles and hidden elements, which must not reach the selection.
 */
export function renderedRangeText(range: Range): string {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) {
    return unrendered(root) ? '' : (root.textContent ?? '').slice(range.startOffset, range.endOffset);
  }
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n) || unrendered(n)) continue;
    const text = n.textContent ?? '';
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : text.length;
    parts.push(text.slice(start, end));
  }
  return parts.join('');
}

export function hitFromRange(range: Range): TextHit | null {
  const rect = unionRects(Array.from(range.getClientRects(), (r) => ({ x: r.left, y: r.top, width: r.width, height: r.height })));
  if (!rect) return null;
  const node = range.commonAncestorContainer;
  const container = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const text = renderedRangeText(range);
  if (text.trim() === '') return null;
  return { text, rect, container, range: range.cloneRange() };
}

/** Current non-empty page text selection outside the probe UI (desktop explicit text ASK). */
export function currentTextSelection(win: Window, host: Element): TextHit | null {
  const sel = win.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (isOwnUi(range.commonAncestorContainer, host)) return null;
  return hitFromRange(range);
}

function pointInPolygon(p: PixelPoint, poly: ReadonlyArray<PixelPoint>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** True when the element hit-tested at the point is the text's parent (or inside/around it). */
function visibleAt(doc: Document, parent: Element, p: PixelPoint): boolean {
  const top = doc.elementFromPoint(p.x, p.y);
  return top !== null && (top === parent || parent.contains(top) || top.contains(parent));
}

/**
 * Words whose centers fall inside a region (lasso polygon or box) and are
 * actually visible there: text covered by other content, or laid out behind a
 * fullscreen element, is excluded by hit-testing.
 */
export function textInRegion(doc: Document, rect: PixelRect, polygon: ReadonlyArray<PixelPoint> | null, host: Element): { text: string; container: Element | null } {
  const inRegion = (p: PixelPoint): boolean =>
    polygon ? pointInPolygon(p, polygon) : p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  const fullscreen = doc.fullscreenElement ?? (doc as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ?? null;
  const walker = doc.createTreeWalker(fullscreen ?? doc.body, NodeFilter.SHOW_TEXT);
  const words: string[] = [];
  let container: Element | null = null;
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (isOwnUi(node, host)) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(NON_RENDERED)) continue;
    const text = node.textContent ?? '';
    const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    const segments = Segmenter
      ? Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(text)).filter((s) => s.isWordLike)
      : Array.from(text.matchAll(/\S+/g), (m) => ({ index: m.index ?? 0, segment: m[0] }));
    for (const seg of segments) {
      range.setStart(node, seg.index);
      range.setEnd(node, seg.index + seg.segment.length);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (inRegion(mid) && visibleAt(doc, parent, mid)) {
        words.push(seg.segment);
        container ??= parent;
      }
    }
  }
  return { text: words.join(' '), container };
}

function overlap(a: PixelRect, b: DOMRect): number {
  const w = Math.min(a.x + a.width, b.right) - Math.max(a.x, b.left);
  const h = Math.min(a.y + a.height, b.bottom) - Math.max(a.y, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** State of the video under the selection, including caption cues readable from the page. */
export function mediaUnder(doc: Document, rect: PixelRect): MediaState | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of Array.from(doc.querySelectorAll('video'))) {
    const area = overlap(rect, v.getBoundingClientRect());
    if (area > bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best ? mediaState(best) : null;
}

function mediaState(best: HTMLVideoElement): MediaState {
  const cues: string[] = [];
  let access: MediaState['cue_access'] = 'none';
  const trackEls = Array.from(best.querySelectorAll('track'));
  for (let i = 0; i < best.textTracks.length; i++) {
    const track = best.textTracks[i]!;
    if (track.mode === 'disabled') continue;
    const el = trackEls.find((t) => t.track === track);
    if (el && el.readyState === 3) {
      if (access === 'none') access = 'blocked';
      continue;
    }
    const active = track.activeCues;
    if (!active) continue;
    access = 'readable';
    for (let c = 0; c < active.length; c++) {
      const cue = active[c] as TextTrackCue & { text?: string };
      if (typeof cue.text === 'string') cues.push(cue.text);
    }
  }
  // Without loaded media the element's currentTime (0) is not a real position.
  const loaded = best.readyState !== HTMLMediaElement.HAVE_NOTHING && (best.currentSrc !== '' || best.srcObject !== null) && best.error === null;
  const t = best.currentTime;
  return { current_time: loaded && Number.isFinite(t) && t >= 0 ? t : null, paused: best.paused, active_cues: cues, cue_access: access };
}

function contextOf(container: Element | null): string {
  const block = container?.closest('p,li,figure,figcaption,section,article,td,blockquote,h1,h2,h3,h4,div') ?? null;
  if (!block) return '';
  // innerText is rendered text only (no script/style/hidden content).
  const text = block instanceof HTMLElement ? block.innerText : (block.textContent ?? '');
  return text.replace(/\s+/g, ' ').trim().slice(0, CONTEXT_LIMIT);
}

/**
 * Builds the snapshot synchronously; nothing here awaits. `media` may carry a
 * state frozen earlier (the moment of the mark, for the adjust-box path).
 */
export function captureSnapshot(win: Window, rect: PixelRect, text: string, container: Element | null, documentVersion: string | null, capturedAt: string): DomSnapshotPayload {
  const doc = win.document;
  const width = doc.documentElement.clientWidth || win.innerWidth;
  const height = doc.documentElement.clientHeight || win.innerHeight;
  return {
    kind: 'dom_snapshot/v1',
    captured_at: capturedAt,
    page: snapshotLocation(win.location.href),
    document_version: documentVersion,
    viewport: { width, height, device_pixel_ratio: win.devicePixelRatio || 1 },
    scroll: { x: win.scrollX, y: win.scrollY },
    selection: { text, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } },
    context_text: contextOf(container),
    media: mediaUnder(doc, rect),
    pixels: 'not_captured',
  };
}

type MarkWord = { readonly text: string; readonly cx: number; readonly cy: number; readonly block: number };

/**
 * Everything an adjustable box may later need, read synchronously at the moment
 * of the mark: visible words with their positions, block context, each video's
 * state and position, page version, viewport and scroll. Confirming the box later
 * builds the snapshot only from this, so text, version, media time and captions
 * all describe the same moment even if the page or playback changed meanwhile.
 */
export type MarkState = {
  readonly capturedAt: string;
  readonly page: DomSnapshotPayload['page'];
  readonly documentVersion: string | null;
  readonly viewport: DomSnapshotPayload['viewport'];
  readonly scroll: DomSnapshotPayload['scroll'];
  readonly words: ReadonlyArray<MarkWord>;
  readonly blocks: ReadonlyArray<string>;
  readonly videos: ReadonlyArray<{ readonly rect: PixelRect; readonly state: MediaState }>;
};

export function captureMarkState(win: Window, host: Element, documentVersion: string | null, capturedAt: string): MarkState {
  const doc = win.document;
  const width = doc.documentElement.clientWidth || win.innerWidth;
  const height = doc.documentElement.clientHeight || win.innerHeight;
  const fullscreen = doc.fullscreenElement ?? (doc as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ?? null;
  const words: MarkWord[] = [];
  const blockIndex = new Map<Element, number>();
  const blocks: string[] = [];
  const walker = doc.createTreeWalker(fullscreen ?? doc.body, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (isOwnUi(node, host)) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(NON_RENDERED)) continue;
    const text = node.textContent ?? '';
    const segments = Segmenter
      ? Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(text)).filter((s) => s.isWordLike)
      : Array.from(text.matchAll(/\S+/g), (m) => ({ index: m.index ?? 0, segment: m[0] }));
    for (const seg of segments) {
      range.setStart(node, seg.index);
      range.setEnd(node, seg.index + seg.segment.length);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > width || cy > height || !visibleAt(doc, parent, { x: cx, y: cy })) continue;
      const block = parent.closest('p,li,figure,figcaption,section,article,td,blockquote,h1,h2,h3,h4,div') ?? parent;
      let b = blockIndex.get(block);
      if (b === undefined) {
        b = blocks.length;
        blockIndex.set(block, b);
        blocks.push(contextOf(parent));
      }
      words.push({ text: seg.segment, cx, cy, block: b });
    }
  }
  const videos = Array.from(doc.querySelectorAll('video')).map((v) => {
    const r = v.getBoundingClientRect();
    return { rect: { x: r.left, y: r.top, width: r.width, height: r.height }, state: mediaState(v) };
  });
  return Object.freeze({
    capturedAt,
    page: snapshotLocation(win.location.href),
    documentVersion,
    viewport: { width, height, device_pixel_ratio: win.devicePixelRatio || 1 },
    scroll: { x: win.scrollX, y: win.scrollY },
    words: Object.freeze(words),
    blocks: Object.freeze(blocks),
    videos: Object.freeze(videos),
  });
}

/** Snapshot of a region as it was at the mark (rect in mark-time viewport coordinates). */
export function snapshotFromMark(mark: MarkState, rect: PixelRect): DomSnapshotPayload {
  const inside = mark.words.filter((w) => w.cx >= rect.x && w.cx <= rect.x + rect.width && w.cy >= rect.y && w.cy <= rect.y + rect.height);
  let media: MediaState | null = null;
  let bestArea = 0;
  for (const v of mark.videos) {
    const w = Math.min(rect.x + rect.width, v.rect.x + v.rect.width) - Math.max(rect.x, v.rect.x);
    const h = Math.min(rect.y + rect.height, v.rect.y + v.rect.height) - Math.max(rect.y, v.rect.y);
    const area = w > 0 && h > 0 ? w * h : 0;
    if (area > bestArea) {
      bestArea = area;
      media = v.state;
    }
  }
  return {
    kind: 'dom_snapshot/v1',
    captured_at: mark.capturedAt,
    page: mark.page,
    document_version: mark.documentVersion,
    viewport: mark.viewport,
    scroll: mark.scroll,
    selection: { text: inside.map((w) => w.text).join(' '), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } },
    context_text: inside.length > 0 ? (mark.blocks[inside[0]!.block] ?? '') : '',
    media,
    pixels: 'not_captured',
  };
}
