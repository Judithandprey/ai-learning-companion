// Content script of the WebExtension entry: the companion on the course page already in use, with no
// import step. The extension injects this script into the top frame of the current http(s) tab only
// when the user presses its toolbar button (activeTab), and a second press stops it.
//
// It reuses the probe's NAV / ASK / WRITE modes, gestures and anchors unchanged. Each ASK mark asks
// the extension for one screenshot of the visible tab (PNG) and shows what was actually received:
// capture time, image size and SHA-256, and the marked region cut from those pixels, next to the
// page context frozen at the mark (address, title, viewport, selection, video position).
//
// There is no AI interpretation (no provider) and no fixture card, and nothing leaves the device.
// The page is not registered as an archive source, so no source record is made. Answers that arrive
// after a newer mark, after Stop or after the page changed are discarded and counted.
//
// WRITE ink is saved on this device by the extension (its own IndexedDB, see background.js), one
// editable document per exact page address; reopening the page with the companion shows it again.

import { installProbe, type ProbeMark } from './page.ts';
import type { InkKeep, InkStore } from './ink-layer.ts';
import { mediaUnder } from './dom-capture.ts';
import { ProbeSession } from './session.ts';
import { unavailableTransport } from './bridge.ts';
import { randomIds, systemClock, type Identity, type MediaState } from './frame.ts';
import { cropBox, dispatchWhenLive, LatestOnly, readPngDataUrl, regionChange, sameView, viewGeometry, type Geometry, type RegionSample, type ViewState } from './capture-evidence.ts';
import type { PixelRect } from './anchor.ts';

type Messaging = { runtime: { sendMessage(message: unknown): Promise<unknown> } };
type CaptureAnswer = { ok: true; dataUrl: string; capturedAt: string } | { ok: false; reason: string };

/** The message the background answers with one PNG of the visible tab (see webextension/background.js). */
export const CAPTURE_MESSAGE = 'lc-capture/v1';
/** Tells the background the companion stopped in this tab (it clears the button's badge). */
export const STOPPED_MESSAGE = 'lc-stopped/v1';
/** Load and save of the page's WRITE ink document (answered by background.js). */
export const INK_LOAD_MESSAGE = 'lc-ink-load/v1';
export const INK_SAVE_MESSAGE = 'lc-ink-save/v1';

type InkAnswer = { ok: true; doc?: unknown; copies?: unknown[] } | { ok: false; reason: string; conflict?: boolean; forked_at?: number };
/**
 * Loads and saves run one at a time, in the order asked, through a queue kept in this extension's
 * isolated world of the page, so a companion restarted in the same page reads after the saves of the
 * one it replaced.
 */
function inkStore(extension: Messaging, queue: { tail: Promise<unknown> }): InkStore {
  const ask = (message: Record<string, unknown>): Promise<InkAnswer & { ok: true }> => {
    const run = queue.tail.then(async () => {
      const answer = (await extension.runtime.sendMessage(message)) as InkAnswer | undefined;
      if (!answer) throw new Error('the extension did not answer');
      if (!answer.ok) throw Object.assign(new Error(answer.reason), { name: answer.conflict ? 'conflict' : 'Error', forkedAt: answer.forked_at ?? null });
      return answer;
    });
    queue.tail = run.catch(() => undefined);
    return run;
  };
  return {
    label: 'this device (extension storage)',
    load: async (page) => {
      const answer = await ask({ type: INK_LOAD_MESSAGE, address_sha256: page.address_sha256 });
      return { main: answer.doc ?? null, copies: Array.isArray(answer.copies) ? answer.copies : [] };
    },
    save: async (doc, copy) => void (await ask({ type: INK_SAVE_MESSAGE, doc, ...(copy ? { copy } : {}) })),
  };
}

/** The chrome is hidden while a capture is pending, so a capture that hangs must not keep it hidden. */
export const CAPTURE_TIMEOUT_MS = 5000;

type CaptureRecord = {
  readonly ticket: number;
  status: 'capturing' | 'received' | 'failed';
  readonly markedAt: string;
  readonly page: ProbeMark['snapshot']['page'];
  readonly title: string;
  readonly viewport: ProbeMark['snapshot']['viewport'];
  readonly scroll: ProbeMark['snapshot']['scroll'];
  readonly rect: PixelRect;
  /** Where the marked content was when the capture was requested (the crop uses this). */
  readonly rectNow: PixelRect;
  readonly view: ViewState;
  readonly inputMode: ProbeMark['inputMode'];
  readonly selectedText: string;
  readonly media: MediaState | null;
  readonly notes: string[];
  /** Content clock when the capture was requested and when its answer arrived. */
  requestedAt: string | null;
  receivedAt: string | null;
  /** Extension clock when captureVisibleTab returned (the image was taken before this). */
  capturedAt: string | null;
  /** The video under the mark when the capture was requested and when the answer arrived. */
  mediaAtRequest: MediaState | null;
  mediaAtReceipt: MediaState | null;
  /** Page content updates (DOM nodes/text) observed while the capture was in flight. */
  pageUpdates: number;
  image: { width: number; height: number; sha256: string | null } | null;
  geometry: Geometry | null;
  crop: PixelRect | null;
  cropMean: [number, number, number] | null;
  /** Share of crop pixels darker than mid-grey (ink, glyphs): a content-free sign the crop is not blank. */
  cropDarkShare: number | null;
  reason: string;
};

const PANEL_CSS = `
:host { all: initial; position: fixed; left: 12px; bottom: 12px; z-index: 2147483646; }
.panel { width: min(340px, calc(100vw - 24px)); max-height: 60vh; overflow: auto; padding: 10px 12px; border-radius: 12px;
  background: #fff; color: #1c1c1e; font: 12px/1.4 -apple-system, system-ui, sans-serif; box-shadow: 0 4px 18px rgba(0,0,0,.25); }
.head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #1b7a2b; }
.head .grow { flex: 1; }
button { all: unset; cursor: pointer; padding: 2px 8px; border-radius: 6px; background: #e5e5ea; font-weight: 500; }
.status { margin: 6px 0 4px; }
.status.bad { color: #b00020; }
.line { margin: 1px 0; color: #3a3a3c; word-break: break-word; }
.note { margin: 4px 0 0; color: #8e5b00; }
canvas { display: block; margin: 6px 0; max-width: 100%; border: 1px solid #d1d1d6; }
[hidden] { display: none !important; }
`;

/** Never written into any record: no source is registered, so the probe freezes no frames. */
const LOCAL_IDENTITY: Identity = Object.freeze({ user_id: 'extension-local', device_id: 'extension-local', session_id: 'extension-local', origin: 'synthetic_probe' });

const frames = (n: number): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number): void => {
      if (left === 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });

/**
 * Whether a capture may still be requested after the paint wait: only a still-current mark, not
 * stopped, not timed out, on the same, visible page. Every condition fences the request itself.
 */
export function requestStillLive(s: { readonly current: boolean; readonly stopped: boolean; readonly timedOut: boolean; readonly hidden: boolean; readonly sameAddress: boolean }): boolean {
  return s.current && !s.stopped && !s.timedOut && !s.hidden && s.sameAddress;
}

/**
 * The video position shown in the image is unknown: the image was taken after the mark, and the
 * position observed at the request and at the receipt (reported as such) does not establish which
 * frame the image holds (a seek and return could happen in between).
 */
function videoInImage(r: { mediaAtRequest: MediaState | null; mediaAtReceipt: MediaState | null }): string {
  const seen = (m: MediaState | null): string => (m === null ? 'no video' : `${m.current_time === null ? 'position unknown' : `${m.current_time.toFixed(2)} s`}, ${m.paused ? 'paused' : 'playing'}`);
  return `Video in the image: position unknown (observed at the request: ${seen(r.mediaAtRequest)}; at the receipt: ${seen(r.mediaAtReceipt)}).`;
}

const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

function start(extension: Messaging, inkQueue: { tail: Promise<unknown> }, inkKeep: InkKeep): { stop: () => void; stopButton: HTMLButtonElement; state: () => unknown } {
  const doc = document;
  const tracker = new LatestOnly();
  let record: CaptureRecord | null = null;
  let captures = 0;
  let stopped = false;

  // ---- evidence panel (closed shadow root, text only) ----------------------------------
  // A plain element, not a custom tag: a page that defines a tag name first could reach a closed root.
  const panelHost = doc.createElement('div');
  panelHost.dataset['lcCompanionCapture'] = '';
  const root = panelHost.attachShadow({ mode: 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(PANEL_CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = PANEL_CSS;
    root.append(style);
  }
  const panel = doc.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Learning companion: screen captures');
  const head = doc.createElement('div');
  head.className = 'head';
  const dot = doc.createElement('span');
  dot.className = 'dot';
  const title = doc.createElement('span');
  title.className = 'grow';
  title.textContent = 'Learning companion: on';
  const stopButton = doc.createElement('button');
  stopButton.type = 'button';
  stopButton.textContent = 'Stop';
  stopButton.setAttribute('aria-label', 'Stop the learning companion on this page');
  head.append(dot, title, stopButton);
  const status = doc.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const details = doc.createElement('div');
  // Replaced by a fresh canvas for each accepted capture, so a late decode cannot repaint it.
  let canvas = doc.createElement('canvas');
  canvas.hidden = true;
  const retiredLine = doc.createElement('p');
  retiredLine.className = 'line';
  const aiNote = doc.createElement('p');
  aiNote.className = 'note';
  aiNote.textContent =
    'One snapshot for this mark only: not continuous observation of the screen, and no AI interpretation (no provider is connected). The image stays in this tab; nothing was sent or stored.';
  panel.append(head, status, details, canvas, retiredLine, aiNote);
  root.append(panel);
  doc.documentElement.append(panelHost);

  const line = (text: string): HTMLParagraphElement => {
    const p = doc.createElement('p');
    p.className = 'line';
    p.textContent = text; // page text and titles are untrusted: text only
    return p;
  };

  const render = (): void => {
    if (!record) {
      status.textContent = 'Press ? (Ask), then mark a formula, figure or words. Only then is the visible tab captured.';
      status.className = 'status';
      details.replaceChildren();
    } else {
      const r = record;
      status.textContent =
        r.status === 'capturing'
          ? 'Capturing the visible tab…'
          : r.status === 'received'
            ? `Snapshot of the visible tab received at ${r.receivedAt ?? '(time unknown)'} (not live).`
            : `Not captured: ${r.reason}`;
      status.className = `status ${r.status === 'failed' ? 'bad' : ''}`;
      const lines = [
        line(`Marked at ${r.markedAt} (${r.inputMode}); capture requested at ${r.requestedAt ?? '…'}${r.capturedAt ? `; image taken before ${r.capturedAt} (extension clock)` : ''}${r.receivedAt ? `; received at ${r.receivedAt}` : ''}. The image is from after the mark, not from the moment of the stroke.`),
        line(`Page: ${r.page.origin}${r.page.path}${r.page.query_omitted ? ' (query omitted)' : ''}`),
        line(`Title: ${r.title || '(none)'}`),
        line(`Viewport ${r.viewport.width}×${r.viewport.height} CSS px at ${r.viewport.device_pixel_ratio}×, scrolled to ${Math.round(r.scroll.x)},${Math.round(r.scroll.y)}; mark ${Math.round(r.rect.x)},${Math.round(r.rect.y)} ${Math.round(r.rect.width)}×${Math.round(r.rect.height)}.`),
        line(r.selectedText ? `Text under the mark: “${r.selectedText.slice(0, 200)}${r.selectedText.length > 200 ? '…' : ''}”` : 'No page text under the mark: the image is the evidence.'),
      ];
      if (r.media) {
        lines.push(line(`Video at the mark (mark-time metadata): ${r.media.current_time === null ? 'position unknown' : `${r.media.current_time.toFixed(1)} s`}, ${r.media.paused ? 'paused' : 'playing'}${r.media.active_cues.length ? `; captions: “${r.media.active_cues.join(' / ')}”` : ''}.`));
        if (r.status === 'received') lines.push(line(videoInImage(r)));
      }
      if (r.image) lines.push(line(`Image: PNG ${r.image.width}×${r.image.height}, SHA-256 ${r.image.sha256 ? `${r.image.sha256.slice(0, 16)}…` : 'unavailable on this page'}.`));
      if (r.geometry && !r.geometry.known) lines.push(line(`Region: unknown (${r.geometry.reason}); no crop is shown.`));
      else if (r.image && !r.crop) lines.push(line('Region: outside the captured image; no crop is shown.'));
      for (const n of r.notes) lines.push(line(n));
      details.replaceChildren(...lines);
    }
    canvas.hidden = !(record && record.crop && record.status === 'received');
    retiredLine.textContent = tracker.retired > 0 ? `Late answers discarded: ${tracker.retired}.` : '';
  };

  // ---- probe (existing modes, gestures and anchors) -----------------------------------------
  const session = new ProbeSession({
    identity: LOCAL_IDENTITY,
    ids: randomIds,
    clock: systemClock,
    transport: unavailableTransport,
    fixtures: [], // real pages never get fixture text
    resolveSource: () => null, // this page is not registered with the archive: nothing is stored
    projectId: null,
    knowledgeProfileVersion: 1,
  });
  const probe = installProbe({
    win: window,
    session,
    documentVersion: () => null,
    role: 'top',
    peerOrigins: [],
    onMark: (mark) => void capture(mark),
    ownElements: [panelHost], // the panel's Stop is our UI: a pen or finger tap on it is never a mark
    inkStore: inkStore(extension, inkQueue),
    inkKeep, // unsaved ink survives Stop and a new start in this page
    unregisteredMessage: () => 'This page is not connected to the companion archive, so nothing was stored or explained. See the capture panel for the screen image and its status.',
  });

  // The panel is hidden with the probe's chrome while a capture is taken.
  let panelHides = 0;
  const hidePanel = (): (() => void) => {
    panelHides += 1;
    panelHost.style.visibility = 'hidden';
    let undone = false;
    return () => {
      if (undone) return;
      undone = true;
      panelHides -= 1;
      if (panelHides === 0) panelHost.style.visibility = '';
    };
  };

  const viewState = (): ViewState => {
    const vv = window.visualViewport;
    return {
      width: doc.documentElement.clientWidth || window.innerWidth,
      height: doc.documentElement.clientHeight || window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      zoom: vv ? { scale: vv.scale, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop } : null,
    };
  };

  const ours = (el: Element): boolean => el === panelHost || el === probe.host || panelHost.contains(el) || probe.host.contains(el);
  /** Sample points of a rectangle: its centre and inner corners. */
  const samplePoints = (r: PixelRect): Array<[number, number]> => {
    const inset = (v: number, size: number): number => v + Math.min(4, size / 2);
    return [
      [r.x + r.width / 2, r.y + r.height / 2],
      [inset(r.x, r.width), inset(r.y, r.height)],
      [r.x + r.width - Math.min(4, r.width / 2), inset(r.y, r.height)],
      [inset(r.x, r.width), r.y + r.height - Math.min(4, r.height / 2)],
      [r.x + r.width - Math.min(4, r.width / 2), r.y + r.height - Math.min(4, r.height / 2)],
    ];
  };
  /**
   * A page element's shadow root: an open one, or a closed one where the browser lets the extension
   * see it (chrome.dom.openOrClosedShadowRoot in Chromium; read at each call). Null otherwise.
   */
  const shadowOf = (el: Element): ShadowRoot | null => {
    const dom = (globalThis as { chrome?: { dom?: { openOrClosedShadowRoot?: (e: HTMLElement) => ShadowRoot | null } } }).chrome?.dom;
    return el.shadowRoot ?? (el instanceof HTMLElement ? (dom?.openOrClosedShadowRoot?.(el) ?? null) : null);
  };
  /** The topmost page element at a viewport point, ignoring our own UI and looking into the page's shadow roots. */
  const pageTopAt = (x: number, y: number): Element | null => {
    let top = doc.elementsFromPoint(x, y).find((el) => !ours(el)) ?? null;
    for (let depth = 0; top && depth < 8; depth++) {
      const root = shadowOf(top);
      const inner = root?.elementsFromPoint(x, y).find((el) => root.contains(el));
      if (!inner) break;
      top = inner;
    }
    return top;
  };
  /** The parent in the composed (rendered) tree: the slot a node is shown in, else its parent or its root's host. */
  const flatParent = (n: Node): Node | null => {
    const slot = n instanceof Element || n instanceof Text ? n.assignedSlot : null;
    if (slot) return slot;
    const p = n.parentNode;
    return p instanceof ShadowRoot ? p.host : p;
  };
  /** Whether `outer` holds `el` in the composed tree (across shadow roots and slots). */
  const holdsComposed = (outer: Node, el: Node): boolean => {
    for (let n: Node | null = el; n; n = flatParent(n)) if (n === outer) return true;
    return false;
  };
  /** The shadow roots `el` is shown through: its own tree's root and those of every slot and host above it. */
  const rootsAbove = (el: Node): ShadowRoot[] => {
    const roots = new Set<ShadowRoot>();
    for (let n: Node | null = el; n; n = flatParent(n)) {
      const root = n.getRootNode();
      if (root instanceof ShadowRoot) roots.add(root);
    }
    return [...roots];
  };
  /** Whether an embedded frame shows anywhere in the rectangle (centre and inner corners), ignoring our own UI. */
  const frameUnder = (r: PixelRect): boolean =>
    samplePoints(r).some(([x, y]) => {
      const top = pageTopAt(x, y);
      return top !== null && /^(IFRAME|FRAME|EMBED|OBJECT)$/.test(top.tagName);
    });
  /**
   * A page component under the rectangle whose inside this browser does not let us see: a defined
   * custom element hit on its own box, whose shadow root (if any) is closed to the extension. Undefined
   * hyphenated tags (e.g. MathJax's mjx-*) are plain markup, not components.
   */
  const closedUnder = (r: PixelRect): string | null => {
    for (const [x, y] of samplePoints(r)) {
      const top = pageTopAt(x, y);
      if (top && top.localName.includes('-') && top.matches(':defined') && !shadowOf(top)) return top.localName;
    }
    return null;
  };

  /**
   * Watches the marked region from the mark to the final presentation. The image shows the screen at
   * some moment in that window, so the region is known only if it never moved: no scroll of the page
   * or of a container holding the marked content, no resize or zoom, and at every sample point the
   * same element at the same place (another element on top, or the marked one moved, is a change).
   * Checked at every animation frame (every frame the image could come from), on each scroll or
   * resize, and after every page change; a change that is undone later still counts. Open shadow roots
   * of the page on the way to the marked content are watched as well (their changes and inner scrolls
   * do not reach the document), including closed ones the browser lets the extension see; other closed
   * roots and embedded frames cannot be, and say so (see capture).
   */
  const watchRegion = (r: PixelRect): { moved: () => string | null; stop: () => void; roots: ShadowRoot[] } => {
    const points = samplePoints(r);
    const sample = (): RegionSample[] =>
      points.map(([x, y]) => {
        const element = pageTopAt(x, y);
        const b = element?.getBoundingClientRect();
        return { element, rect: b ? { x: b.left, y: b.top, width: b.width, height: b.height } : null };
      });
    const view = viewState();
    const atMark = sample();
    const roots = [...new Set(atMark.flatMap((s) => (s.element instanceof Node ? rootsAbove(s.element) : [])))];
    let reason: string | null = null;
    const check = (): void => {
      if (reason !== null) return;
      if (!sameView(view, viewState())) reason = 'the page scrolled, zoomed or resized';
      else reason = regionChange(atMark, sample());
    };
    // A scroll of the page, or of a container of the marked content, moves it even if it scrolls back
    // before the next check; other containers scrolling are only a reason to check.
    const onScroll = (e: Event): void => {
      const t = e.target;
      const holds = t === doc || t === doc.documentElement || t === doc.body || (t instanceof Element && atMark.some((s) => s.element instanceof Node && holdsComposed(t, s.element)));
      if (holds) reason ??= 'the page scrolled';
      else check();
    };
    const onResize = (): void => {
      reason ??= 'the page was resized or zoomed';
    };
    let frame = requestAnimationFrame(function tick() {
      check();
      frame = requestAnimationFrame(tick);
    });
    const changes = new MutationObserver((records) => {
      if (records.some((m) => !(m.target instanceof Element && ours(m.target)))) check();
    });
    for (const target of [doc.documentElement, ...roots]) changes.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
    for (const root of roots) root.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('scroll', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return {
      roots,
      moved: () => {
        check();
        return reason;
      },
      stop: () => {
        cancelAnimationFrame(frame);
        changes.disconnect();
        for (const root of roots) root.removeEventListener('scroll', onScroll, { capture: true });
        window.removeEventListener('scroll', onScroll, { capture: true });
        window.removeEventListener('resize', onResize);
        window.visualViewport?.removeEventListener('scroll', onResize);
        window.visualViewport?.removeEventListener('resize', onResize);
      },
    };
  };

  const fail = (current: CaptureRecord, reason: string): void => {
    current.status = 'failed';
    current.reason = reason;
    render();
  };

  async function capture(mark: ProbeMark): Promise<void> {
    if (stopped) return;
    // From the mark on (synchronously with it) until the final presentation.
    const watch = watchRegion(mark.rectNow);
    try {
      await captureWatched(mark, watch);
    } finally {
      watch.stop();
    }
  }

  async function captureWatched(mark: ProbeMark, watch: { moved: () => string | null; roots: ShadowRoot[] }): Promise<void> {
    const ticket = tracker.issue();
    const notes: string[] = [];
    if (frameUnder(mark.rectNow)) notes.push('The mark covers an embedded frame: its pixels are in the image, but its text cannot be read from this page, and movement inside it cannot be watched, so the crop may not show what was marked if it moved (unknown).');
    const closed = closedUnder(mark.rectNow);
    if (closed) notes.push(`The mark covers a page component (<${closed}>) that shows nothing the companion can read: its inside may be in a closed shadow root, where movement cannot be watched, so the crop may not show what was marked if it moved (unknown).`);
    if (doc.fullscreenElement) notes.push('Fullscreen was on: whether the image matches the page is unverified.');
    const adjusted = mark.rectNow.x !== mark.rect.x || mark.rectNow.y !== mark.rect.y;
    if (adjusted) notes.push('The box was confirmed after the page moved: the region is where the box was at confirmation.');
    const view = viewState(); // frozen now, synchronously with the request
    const addressAtRequest = location.href;
    const current: CaptureRecord = {
      ticket,
      status: 'capturing',
      markedAt: mark.snapshot.captured_at,
      page: mark.snapshot.page,
      title: doc.title,
      viewport: mark.snapshot.viewport,
      scroll: mark.snapshot.scroll,
      rect: mark.rect,
      rectNow: mark.rectNow,
      view,
      inputMode: mark.inputMode,
      selectedText: mark.snapshot.selection.text,
      media: mark.snapshot.media,
      notes,
      requestedAt: null,
      receivedAt: null,
      capturedAt: null,
      mediaAtRequest: null,
      mediaAtReceipt: null,
      pageUpdates: 0,
      image: null,
      geometry: null,
      crop: null,
      cropMean: null,
      cropDarkShare: null,
      reason: '',
    };
    record = current;
    // A mark confirmed later (adjust box) must still be on the page it was made on.
    if (location.origin !== mark.snapshot.page.origin || location.pathname !== mark.snapshot.page.path) {
      tracker.accept(ticket);
      return fail(current, 'the page changed between the mark and its confirmation, so nothing was captured');
    }
    render();
    // Watch the capture window: page content updates, and the tab being hidden (switched away).
    let hiddenDuring = doc.hidden;
    const onVisibility = (): void => {
      if (doc.hidden) hiddenDuring = true;
    };
    doc.addEventListener('visibilitychange', onVisibility);
    const updates = new MutationObserver((records) => {
      current.pageUpdates += records.filter((m) => !(m.target instanceof Element && ours(m.target))).length;
    });
    for (const target of [doc.documentElement, ...watch.roots]) updates.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
    current.requestedAt = new Date().toISOString();
    current.mediaAtRequest = mediaUnder(doc, mark.rectNow);
    const showProbe = probe.hideChrome();
    const showPanel = hidePanel();
    let answer: CaptureAnswer;
    let timedOut = false;
    const timeout = new Promise<CaptureAnswer>((resolve) =>
      setTimeout(() => {
        timedOut = true;
        resolve({ ok: false, reason: `no image within ${CAPTURE_TIMEOUT_MS / 1000} s; an image arriving later is discarded` });
      }, CAPTURE_TIMEOUT_MS),
    );
    try {
      // The timeout also covers the paint wait: a hidden tab stops animation frames.
      const request = (async (): Promise<CaptureAnswer> => {
        // Fence the request itself: after the paint wait, only a still-current mark on the same,
        // visible page is sent (Stop, a newer mark or the timeout during the wait sends nothing).
        const live = (): boolean =>
          requestStillLive({ current: tracker.isCurrent(ticket), stopped, timedOut, hidden: doc.hidden, sameAddress: location.href === addressAtRequest });
        const sent = await dispatchWhenLive(
          () => frames(2), // let the page paint without our chrome first
          live,
          async () => ({ reply: extension.runtime.sendMessage({ type: CAPTURE_MESSAGE }) as Promise<CaptureAnswer> }),
        );
        if (sent === null) return { ok: false, reason: 'the mark was stopped, replaced or the page changed before the capture was requested; nothing was captured' };
        const pending = sent.reply;
        // An image that arrives after the timeout is never shown, only counted.
        pending.then(
          () => {
            if (!timedOut) return;
            tracker.discard();
            if (!stopped) render();
          },
          () => undefined,
        );
        return pending;
      })();
      answer = await Promise.race([request, timeout]);
    } catch (error) {
      answer = { ok: false, reason: `the extension did not answer (${error instanceof Error ? error.message : String(error)})` };
    } finally {
      showProbe();
      showPanel();
    }
    current.receivedAt = new Date().toISOString();
    current.mediaAtReceipt = mediaUnder(doc, mark.rectNow);
    current.pageUpdates += updates.takeRecords().filter((m) => !(m.target instanceof Element && ours(m.target))).length;
    updates.disconnect();
    doc.removeEventListener('visibilitychange', onVisibility);
    if (!tracker.accept(ticket)) return render(); // a newer mark, or Stop: retired
    if (location.href !== addressAtRequest) return fail(current, 'the page changed before the image arrived, so it was discarded');
    if (hiddenDuring || doc.hidden) return fail(current, 'the tab was hidden during the capture (switched away), so the image was discarded');
    if (!answer || typeof answer !== 'object' || !('ok' in answer) || !answer.ok) {
      return fail(current, answer && typeof answer === 'object' && 'reason' in answer && typeof answer.reason === 'string' ? answer.reason : 'the extension gave no usable answer');
    }
    const png = readPngDataUrl(answer.dataUrl);
    if (!png.ok) return fail(current, png.reason);
    captures += 1;
    const { image } = png;
    const digest = globalThis.crypto?.subtle ? hex(await crypto.subtle.digest('SHA-256', image.bytes)) : null;
    const unknownRegion = (why: string): Geometry => ({ known: false, reason: `${why} while the image was taken, so where the mark lies in it is unknown` });
    let geometry = viewGeometry(image, view, viewState());
    const movedAtReceipt = watch.moved();
    if (geometry.known && movedAtReceipt) geometry = unknownRegion(movedAtReceipt);
    let crop = cropBox(current.rectNow, geometry, image);
    let cropMean: [number, number, number] | null = null;
    let cropDarkShare: number | null = null;
    const fresh = doc.createElement('canvas');
    fresh.setAttribute('aria-label', 'The marked region, cut from the received screen image');
    if (crop) {
      const bitmap = await createImageBitmap(new Blob([image.bytes], { type: 'image/png' }), crop.x, crop.y, crop.width, crop.height);
      const shown = Math.min(1, 316 / crop.width, 200 / crop.height);
      fresh.width = Math.max(1, Math.round(crop.width * shown));
      fresh.height = Math.max(1, Math.round(crop.height * shown));
      fresh.getContext('2d')?.drawImage(bitmap, 0, 0, fresh.width, fresh.height);
      // The average colour of the cut region, from the received pixels (lets a check confirm them).
      const full = doc.createElement('canvas');
      full.width = crop.width;
      full.height = crop.height;
      const fctx = full.getContext('2d');
      if (fctx) {
        fctx.drawImage(bitmap, 0, 0);
        const px = fctx.getImageData(0, 0, crop.width, crop.height).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let dark = 0;
        const n = px.length / 4;
        for (let i = 0; i < px.length; i += 4) {
          r += px[i]!;
          g += px[i + 1]!;
          b += px[i + 2]!;
          if (0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]! < 128) dark += 1;
        }
        cropMean = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        cropDarkShare = Math.round((dark / n) * 1000) / 1000;
      }
      bitmap.close();
    }
    // Revalidate at the final presentation, after every await (decoding took time too).
    if (!tracker.accept(ticket)) return render(); // stopped or superseded while checking the image
    if (location.href !== addressAtRequest) return fail(current, 'the page changed before the image could be shown, so it was discarded');
    if (hiddenDuring || doc.hidden) return fail(current, 'the tab was hidden before the image could be shown, so it was discarded');
    const viewFinal = viewState();
    const finalGeometry = viewGeometry(image, view, viewFinal);
    const movedFinal = watch.moved();
    if (geometry.known && (!finalGeometry.known || movedFinal)) {
      // The view or the marked content changed while the image was prepared: region unknown, no crop.
      geometry = finalGeometry.known ? unknownRegion(movedFinal!) : finalGeometry;
      crop = null;
    }
    if (current.pageUpdates > 0) current.notes.push(`The page changed while the image was taken (${current.pageUpdates} change${current.pageUpdates === 1 ? '' : 's'} observed, including style changes); the image, and any crop, may show those changes rather than what was marked.`);
    fresh.hidden = crop === null;
    canvas.replaceWith(fresh);
    canvas = fresh;
    current.status = 'received';
    current.capturedAt = answer.capturedAt;
    current.image = { width: image.width, height: image.height, sha256: digest };
    current.geometry = geometry;
    current.crop = crop;
    current.cropMean = cropMean;
    current.cropDarkShare = cropDarkShare;
    render();
  }

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    tracker.stop();
    probe.uninstall();
    panelHost.remove();
  };

  render();
  return {
    stop,
    stopButton,
    state: () => ({
      running: !stopped,
      mode: session.state.mode,
      captures,
      retired: tracker.retired,
      status: status.textContent,
      last: record && {
        status: record.status,
        reason: record.reason,
        markedAt: record.markedAt,
        capturedAt: record.capturedAt,
        requestedAt: record.requestedAt,
        receivedAt: record.receivedAt,
        mediaAtRequest: record.mediaAtRequest,
        mediaAtReceipt: record.mediaAtReceipt,
        pageUpdates: record.pageUpdates,
        page: record.page,
        title: record.title,
        viewport: record.viewport,
        rect: record.rect,
        rectNow: record.rectNow,
        view: record.view,
        inputMode: record.inputMode,
        selectedText: record.selectedText,
        media: record.media,
        notes: record.notes,
        image: record.image,
        geometry: record.geometry,
        crop: record.crop,
        cropMean: record.cropMean,
        cropDarkShare: record.cropDarkShare,
      },
      panelText: panel.textContent,
      cropShown: !canvas.hidden && canvas.isConnected,
      // Reachable only from the extension (its isolated world), e.g. to press controls with real input.
      toolbar: stopped ? null : probe.toolbarRects(),
      ink: stopped ? null : probe.inkState(),
      stopRect: stopped ? null : (({ x, y, width, height }) => ({ x, y, width, height }))(stopButton.getBoundingClientRect()),
    }),
  };
}

// ---- entry: one companion per tab; the toolbar button toggles it (see webextension/background.js) ----
type Handle = { toggle: () => 'stopped'; state: () => unknown };
const scope = globalThis as typeof globalThis & { __lcCompanion?: Handle; __lcInkQueue?: { tail: Promise<unknown> }; __lcInkKeep?: InkKeep; browser?: Messaging; chrome?: Messaging };
const extension = scope.browser?.runtime ? scope.browser : scope.chrome;
if (!scope.__lcCompanion && extension?.runtime) {
  const companion = start(extension, (scope.__lcInkQueue ??= { tail: Promise.resolve() }), (scope.__lcInkKeep ??= new Map()));
  // Both ways of stopping (the panel's Stop and the toolbar button) end here: the handle goes away,
  // so the next button press starts afresh, and the background clears the badge.
  const shutdown = (): 'stopped' => {
    companion.stop();
    if (scope.__lcCompanion === handle) delete scope.__lcCompanion;
    extension.runtime.sendMessage({ type: STOPPED_MESSAGE }).catch(() => undefined);
    return 'stopped';
  };
  const handle: Handle = { toggle: shutdown, state: companion.state };
  scope.__lcCompanion = handle;
  companion.stopButton.addEventListener('click', (e) => {
    if (e.isTrusted) shutdown();
  });
}
