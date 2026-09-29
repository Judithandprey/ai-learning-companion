// Page layer of the probe: icon toolbar, explicit ASK capture, WRITE ink, the
// adjustable box for ambiguous marks and the silent card. Ordinary input is
// never intercepted; see input-policy.ts. All text is rendered via textContent.
// Only trusted (user-generated) input events are acted on.

import { isIdentifier, type PixelPoint, type PixelRect } from './anchor.ts';
import { classifyStroke } from './gesture.ts';
import { cardView, PROVIDER_UNAVAILABLE_TEXT, quoteOf } from './explain.ts';
import { pointerKindOf, selectionInputMode, type InputDecision, type PointerKind } from './input-policy.ts';
import type { Mode } from './mode.ts';
import { captureMarkState, captureSnapshot, currentTextSelection, snapshotFromMark, textAlong, textInRegion, wordAt, type MarkState, type TextHit } from './dom-capture.ts';
import type { DomSnapshotPayload } from './frame.ts';
import type { AskOutcome, ProbeSession } from './session.ts';
import type { Selection } from './contracts.ts';

export const CHANNEL = 'lc-web-probe/v0';

export type OverlayState = 'visible' | 'hidden_unrenderable_fullscreen' | 'restored';

export type ProbeEvent =
  | { readonly type: 'mode'; readonly mode: Mode; readonly askEpoch: number }
  | { readonly type: 'input'; readonly pointer: PointerKind; readonly decision: InputDecision; readonly eventType: string }
  | { readonly type: 'ask'; readonly outcome: AskOutcome['status']; readonly presented: boolean; readonly detail: Record<string, unknown> }
  | { readonly type: 'adjust'; readonly reason: string }
  | { readonly type: 'ink'; readonly points: number }
  | { readonly type: 'capture_aborted'; readonly reason: 'multi_touch' }
  | { readonly type: 'card_relayed'; readonly origin: string; readonly provenance: 'fixture' | 'none' }
  | { readonly type: 'message_rejected'; readonly reason: string }
  | { readonly type: 'fullscreen'; readonly element: string | null; readonly overlay: OverlayState; readonly forcedNav: boolean };

export type ProbeOptions = {
  readonly win: Window;
  readonly session: ProbeSession;
  readonly documentVersion: () => string | null;
  /**
   * `frame` follows the mode of its parent through postMessage from `peerOrigins`.
   * This window messaging is a fixture stand-in: page scripts of a peer origin
   * can post the same messages. A real extension must carry mode and results
   * through extension messaging (background ↔ frameId), which pages cannot forge.
   */
  readonly role: 'top' | 'frame';
  readonly peerOrigins: ReadonlyArray<string>;
  readonly onEvent?: (event: ProbeEvent) => void;
  /**
   * Owned pages that keep what was marked (e.g. the document preview) receive the full
   * outcome, including the frozen snapshot bytes, and whether it is still the current one.
   */
  readonly onOutcome?: (outcome: AskOutcome, current: boolean) => void;
  /** Card body when the mark could not be bound to a registered source (default: probe wording). */
  readonly unregisteredMessage?: () => string;
  /** Replaces the native-bridge line on the card where the bridge is not the storage path. */
  readonly bridgeNote?: string;
  /** Test-only: also act on synthetic (untrusted) events. Never enabled for real pages. */
  readonly acceptSyntheticEvents?: boolean;
};

const CSS = `
:host { all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; }
.toolbar { position: fixed; top: 12px; right: 12px; display: flex; gap: 6px; align-items: center;
  padding: 6px; border-radius: 14px; background: rgba(28,28,30,.86); color: #fff; font: 13px/1.3 -apple-system, system-ui, sans-serif;
  z-index: 2147483647; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
.toolbar button { all: unset; box-sizing: border-box; min-width: 40px; height: 40px; border-radius: 10px; text-align: center;
  font-size: 20px; cursor: pointer; color: #fff; }
.toolbar button[aria-pressed="true"] { background: #0a84ff; }
.toolbar button:focus-visible { outline: 2px solid #64d2ff; }
.toolbar .cancel { font-size: 13px; padding: 0 10px; background: rgba(255,255,255,.15); }
.hint { max-width: 220px; font-size: 12px; opacity: .9; padding: 0 4px; }
.frame-indicator { position: fixed; top: 4px; right: 4px; display: flex; gap: 6px; align-items: center; padding: 3px 6px;
  border-radius: 8px; background: rgba(10,132,255,.92); color: #fff; font: 12px/1.2 -apple-system, system-ui, sans-serif; z-index: 2147483647; }
.frame-indicator button { all: unset; cursor: pointer; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.25); }
[hidden] { display: none !important; }
canvas.ink { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
.card { position: fixed; right: 12px; bottom: 12px; width: min(360px, calc(100vw - 24px)); max-height: 45vh; overflow: auto;
  background: #fff; color: #1c1c1e; border-radius: 14px; padding: 12px 14px; z-index: 2147483646;
  font: 14px/1.45 -apple-system, system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
.card .badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: #8e5b00; }
.card .badge.none { color: #b00020; }
.card.pending .badge { color: #636366; }
.card .body { margin: 6px 0; white-space: pre-wrap; }
.card .quote { margin: 4px 0; font-size: 12px; color: #3a3a3c; white-space: pre-wrap; word-break: break-word; }
.card .meta { font-size: 11px; color: #636366; margin: 2px 0; word-break: break-all; }
.card .close { all: unset; position: absolute; top: 6px; right: 10px; cursor: pointer; font-size: 18px; color: #636366; }
.anchor { position: absolute; border: 2px dashed #0a84ff; border-radius: 4px; pointer-events: none; z-index: 2147483644; }
.adjust { position: absolute; border: 2px solid #ff9f0a; background: rgba(255,159,10,.08); z-index: 2147483646; touch-action: none; cursor: move; }
.adjust .handle { position: absolute; right: -10px; bottom: -10px; width: 20px; height: 20px; border-radius: 10px; background: #ff9f0a; cursor: nwse-resize; }
.adjust .actions { position: absolute; left: 0; top: calc(100% + 6px); display: flex; gap: 6px; }
.adjust .actions button { all: unset; background: #1c1c1e; color: #fff; border-radius: 8px; padding: 6px 10px; font: 13px system-ui, sans-serif; cursor: pointer; }
`;

type CardText = {
  readonly unavailable: boolean;
  readonly badge: string;
  readonly body: string;
  readonly quote: string;
  readonly anchorLine: string;
  readonly bridgeLine: string;
};

/** What a frame may relay about its card: identifiers and enums, never display text. */
type CardRelay = {
  readonly provenance: 'fixture' | 'none';
  readonly source_id: string;
  readonly source_version: number;
  readonly selected_text: string;
};

function parseCardRelay(data: Record<string, unknown>): CardRelay | null {
  const { provenance, source_id: sourceId, source_version: version, selected_text: text } = data;
  if (provenance !== 'fixture' && provenance !== 'none') return null;
  if (!isIdentifier(sourceId) || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return null;
  if (typeof text !== 'string' || text.length > 2000) return null;
  return { provenance, source_id: sourceId, source_version: version, selected_text: text };
}

const ICONS: Record<Mode, { glyph: string; label: string }> = {
  NAV: { glyph: '✋', label: 'Navigate: page works normally' },
  ASK: { glyph: '?', label: 'Ask: mark something to explain silently' },
  WRITE: { glyph: '✎', label: 'Write: pen writes notes, fingers navigate' },
};

type Capture = {
  readonly pointerId: number;
  readonly pointer: PointerKind;
  readonly decision: InputDecision;
  readonly askEpoch: number;
  readonly points: PixelPoint[];
  /** Page-coordinate points for ink so strokes stay with the content. */
  readonly pagePoints: PixelPoint[];
};

/** Elements whose children are not rendered, so the overlay cannot appear inside them. */
function canHostOverlay(el: Element): boolean {
  return !(
    el instanceof HTMLVideoElement ||
    el instanceof HTMLIFrameElement ||
    el instanceof HTMLImageElement ||
    el instanceof HTMLCanvasElement ||
    el instanceof HTMLEmbedElement ||
    el instanceof HTMLObjectElement
  );
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export type CardSnapshot = { hidden: boolean; pending: boolean; badge: string; body: string; quote: string; anchorLine: string; bridgeLine: string; elementCount: number };

export type ProbeInstall = {
  readonly host: HTMLElement;
  readonly uninstall: () => void;
  /** For the installer only (tests); the page cannot reach into the closed shadow root. */
  readonly toolbarRects: () => Record<string, { x: number; y: number; width: number; height: number }>;
  /** For the installer only (tests): the rendered card as plain text. */
  readonly cardSnapshot: () => CardSnapshot;
  /** For the installer only (tests): the same action as the adjust box's confirm button. */
  readonly confirmAdjust: () => void;
  /** For the installer only (tests): the same action as the card's close button. */
  readonly closeCard: () => void;
};

export function installProbe(options: ProbeOptions): ProbeInstall {
  const { win, session } = options;
  const doc = win.document;
  const emit = (e: ProbeEvent): void => options.onEvent?.(e);
  const accepted = (e: Event): boolean => e.isTrusted || options.acceptSyntheticEvents === true;

  const host = doc.createElement('lc-web-probe');
  const root = host.attachShadow({ mode: 'closed' });
  // Constructable stylesheets are not inline <style> elements, so a page's
  // style-src policy does not block them; fall back to <style> where missing.
  let styled = false;
  try {
    const sheet = new (win as Window & typeof globalThis).CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    styled = true;
  } catch {
    styled = false;
  }
  if (!styled) {
    const style = el(doc, 'style');
    style.textContent = CSS;
    root.append(style);
  }

  // Toolbar (top document only; frames follow the parent's mode).
  const toolbar = el(doc, 'div', 'toolbar');
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Learning companion input mode');
  const buttons = new Map<Mode, HTMLButtonElement>();
  for (const mode of ['NAV', 'ASK', 'WRITE'] as const) {
    const b = el(doc, 'button', `mode-${mode.toLowerCase()}`, ICONS[mode].glyph);
    b.type = 'button';
    b.setAttribute('aria-label', ICONS[mode].label);
    b.title = ICONS[mode].label;
    b.dataset['mode'] = mode;
    b.addEventListener('click', (e) => {
      if (accepted(e)) session.press(mode);
    });
    buttons.set(mode, b);
    toolbar.append(b);
  }
  const hint = el(doc, 'span', 'hint');
  const cancel = el(doc, 'button', 'cancel', 'Cancel');
  cancel.type = 'button';
  cancel.setAttribute('aria-label', 'Cancel ask and return to the previous mode');
  cancel.addEventListener('click', (e) => {
    if (accepted(e)) session.cancelAsk();
  });
  toolbar.append(hint, cancel);
  if (options.role === 'frame') toolbar.hidden = true;

  // In a frame, any mode other than NAV is visible and can be left from inside.
  const frameIndicator = el(doc, 'div', 'frame-indicator');
  frameIndicator.hidden = true;
  const frameIndicatorText = el(doc, 'span');
  const frameCancel = el(doc, 'button', undefined, 'Cancel');
  frameCancel.type = 'button';
  frameCancel.setAttribute('aria-label', 'Leave ask mode');
  frameIndicator.append(frameIndicatorText, frameCancel);

  const canvas = el(doc, 'canvas', 'ink');
  const ctx = canvas.getContext('2d');

  const card = el(doc, 'section', 'card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Silent explanation card');
  card.hidden = true;
  const badge = el(doc, 'div', 'badge');
  const body = el(doc, 'p', 'body');
  const quote = el(doc, 'p', 'quote');
  const anchorLine = el(doc, 'p', 'meta');
  const bridgeLine = el(doc, 'p', 'meta');
  const close = el(doc, 'button', 'close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close card');
  card.append(badge, body, quote, anchorLine, bridgeLine, close);

  // Positions inside the host: the host sits at the origin of the document (or of
  // the fullscreen element), so host coordinates move with that content.
  const toHost = (r: PixelRect): PixelRect => {
    const o = host.getBoundingClientRect();
    return { x: r.x - o.left, y: r.y - o.top, width: r.width, height: r.height };
  };
  const place = (node: HTMLElement, r: PixelRect): void => {
    node.style.left = `${r.x}px`;
    node.style.top = `${r.y}px`;
    node.style.width = `${r.width}px`;
    node.style.height = `${r.height}px`;
  };

  // On-page highlight only. The frozen Selection keeps frame coordinates; this box
  // re-measures from the live range after reflow, and hides if that text is gone.
  const anchorBox = el(doc, 'div', 'anchor');
  anchorBox.hidden = true;
  let highlight: { range: Range | null; hostRect: PixelRect } | null = null;
  const placeHighlight = (): void => {
    if (!highlight) {
      anchorBox.hidden = true;
      return;
    }
    let r = highlight.hostRect;
    if (highlight.range) {
      if (!highlight.range.startContainer.isConnected || !highlight.range.endContainer.isConnected) {
        anchorBox.hidden = true;
        return;
      }
      const rects = Array.from(highlight.range.getClientRects());
      if (rects.length > 0) {
        const x0 = Math.min(...rects.map((q) => q.left));
        const y0 = Math.min(...rects.map((q) => q.top));
        r = toHost({ x: x0, y: y0, width: Math.max(...rects.map((q) => q.right)) - x0, height: Math.max(...rects.map((q) => q.bottom)) - y0 });
      }
    }
    anchorBox.hidden = false;
    place(anchorBox, r);
  };
  // Closing dismisses the submission the card shows. Because every top-document
  // submission shows its own pending card at once, the only request that can still
  // be pending here is the one on the card, so retiring the current generation
  // retires exactly that request (its late answer stays evidence, presented:false).
  const closeCard = (): void => {
    card.hidden = true;
    pendingCardGen = null;
    highlight = null;
    placeHighlight();
    presentGen += 1;
    frameAsk = null;
  };
  close.addEventListener('click', closeCard);

  const adjust = el(doc, 'div', 'adjust');
  adjust.hidden = true;
  adjust.setAttribute('role', 'dialog');
  adjust.setAttribute('aria-label', 'Adjust the selection box, then confirm');
  const handle = el(doc, 'div', 'handle');
  const actions = el(doc, 'div', 'actions');
  const confirmBtn = el(doc, 'button', 'confirm', 'Explain this box');
  const discardBtn = el(doc, 'button', 'discard', 'Redraw');
  confirmBtn.type = 'button';
  discardBtn.type = 'button';
  actions.append(confirmBtn, discardBtn);
  adjust.append(handle, actions);

  root.append(canvas, anchorBox, adjust, card, toolbar, frameIndicator);
  doc.documentElement.append(host);

  // ---- ink canvas --------------------------------------------------------
  const inkStrokes: PixelPoint[][] = [];
  let transient: PixelPoint[] | null = null;
  const resizeCanvas = (): void => {
    const dpr = win.devicePixelRatio || 1;
    canvas.width = Math.round(win.innerWidth * dpr);
    canvas.height = Math.round(win.innerHeight * dpr);
    canvas.style.width = `${win.innerWidth}px`;
    canvas.style.height = `${win.innerHeight}px`;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const strokePath = (pts: ReadonlyArray<PixelPoint>, offset: PixelPoint, color: string): void => {
    if (!ctx || pts.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x - offset.x, p.y - offset.y) : ctx.lineTo(p.x - offset.x, p.y - offset.y)));
    ctx.stroke();
  };
  function redraw(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
    const scroll = { x: win.scrollX, y: win.scrollY };
    for (const s of inkStrokes) strokePath(s, scroll, '#1c1c1e');
    if (transient) strokePath(transient, { x: 0, y: 0 }, '#0a84ff');
  }
  resizeCanvas();

  // ---- capture state (declared before the mode UI clears it) -----------------
  let active: Capture | null = null;
  let pendingText: { pointerId: number; askEpoch: number } | null = null;
  // The click a browser may synthesize right after a claimed mark: only that
  // pointer type, only once, never in NAV, and never past the next press.
  let suppressClick: { until: number; pointer: PointerKind } | null = null;
  const abortCapture = (): void => {
    if (!active) return;
    if (active.decision === 'ink_capture') inkStrokes.pop();
    active = null;
    transient = null;
    redraw();
  };

  // ---- frame messaging ---------------------------------------------------------
  /** Top-document ASK epoch as last announced to this frame. */
  let parentAskEpoch = -1;
  // Presentation generation. Dismissal rule (P0-02 W-1), deliberately conservative:
  // - The card belongs to one submission at a time. A new top-document submission
  //   immediately replaces the card with its own pending card.
  // - A result is shown only while its submission is still the latest one. A newer
  //   submission, starting a new ASK, or closing its card retires it; the retired
  //   answer is kept as evidence (presented:false) but never shown late.
  // So an older card can never be closed while a newer request is pending, and a
  // close never drops an answer the user did not dismiss.
  let presentGen = 0;
  /** Generation whose pending card is on screen; null when the card shows anything else. */
  let pendingCardGen: number | null = null;
  let lastAskEpochSeen = session.state.askEpoch;
  // Top document only: the one frame ASK that was actually completed inside the
  // top page's current authorized ASK; its card may be shown once.
  let frameAsk: { epoch: number; source: MessageEventSource } | null = null;
  const isChildFrame = (source: MessageEventSource | null): boolean => {
    if (!source || source === win) return false;
    for (let i = 0; i < win.frames.length; i++) if (win.frames[i] === source) return true;
    return false;
  };
  const postToParent = (message: Record<string, unknown>): void => {
    if (options.role !== 'frame' || win.parent === win) return;
    for (const origin of options.peerOrigins) {
      try {
        win.parent.postMessage({ channel: CHANNEL, ...message }, origin);
      } catch {
        // parent of another origin
      }
    }
  };
  const broadcastMode = (): void => {
    if (options.role !== 'top') return;
    const message = { channel: CHANNEL, type: 'mode', mode: session.state.mode, askEpoch: session.state.askEpoch, penObserved: session.penObserved };
    for (let i = 0; i < win.frames.length; i++) {
      for (const origin of options.peerOrigins) {
        try {
          win.frames[i]!.postMessage(message, origin);
        } catch {
          // A frame of another origin simply does not receive it.
        }
      }
    }
  };
  let penShared = false;
  const sharePen = (): void => {
    if (penShared || !session.penObserved) return;
    penShared = true;
    if (options.role === 'frame') postToParent({ type: 'pen_observed' });
    else broadcastMode();
  };

  // ---- mode UI -------------------------------------------------------------
  const HINTS: Record<Mode, string> = {
    NAV: '',
    ASK: 'Tap a word, sweep a sentence, or circle a region.',
    WRITE: 'Pen writes; fingers keep navigating.',
  };
  const renderMode = (): void => {
    const { mode, askEpoch } = session.state;
    for (const [m, b] of buttons) b.setAttribute('aria-pressed', String(m === mode));
    hint.textContent = mode === 'ASK' && !session.penObserved ? 'Draw with your finger or pen: tap a word, sweep a sentence, or circle a region.' : HINTS[mode];
    cancel.hidden = mode !== 'ASK';
    if (mode !== 'ASK') adjust.hidden = true;
    if (mode === 'NAV') {
      suppressClick = null;
      abortCapture();
    }
    if (mode === 'ASK' && askEpoch !== lastAskEpochSeen) {
      presentGen += 1;
      frameAsk = null;
      // The pending request was just retired; its pending card must not linger.
      if (pendingCardGen !== null) {
        card.hidden = true;
        pendingCardGen = null;
      }
    }
    lastAskEpochSeen = askEpoch;
    if (options.role === 'frame') {
      frameIndicator.hidden = mode === 'NAV';
      frameIndicatorText.textContent = mode === 'ASK' ? 'Ask mode (set by the page toolbar)' : 'Write mode: pen writes';
      frameCancel.hidden = mode !== 'ASK';
    }
    emit({ type: 'mode', mode, askEpoch });
    broadcastMode();
  };
  const unsubscribe = session.subscribe(renderMode);
  renderMode();
  frameCancel.addEventListener('click', (e) => {
    if (!accepted(e)) return;
    session.cancelAsk();
    // A cancel ends the top ASK too, but it is not a completion: no card follows.
    postToParent({ type: 'ask_cancelled', askEpoch: parentAskEpoch });
  });

  const onMessage = (e: MessageEvent): void => {
    if (!options.peerOrigins.includes(e.origin)) return;
    const data = e.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || data['channel'] !== CHANNEL) return;
    const type = data['type'];
    if (options.role === 'frame') {
      if (e.source !== win.parent || type !== 'mode') return;
      const mode = data['mode'];
      if (mode !== 'NAV' && mode !== 'ASK' && mode !== 'WRITE') return;
      if (typeof data['askEpoch'] === 'number') parentAskEpoch = data['askEpoch'];
      if (data['penObserved'] === true) session.notePenObserved();
      if (session.state.mode !== mode) session.press(mode);
      return;
    }
    // Top document: only messages from its own child frames count.
    if (!isChildFrame(e.source)) {
      emit({ type: 'message_rejected', reason: 'not_a_child_frame' });
      return;
    }
    if (type === 'ask_cancelled') {
      if (session.state.mode === 'ASK' && data['askEpoch'] === session.state.askEpoch) session.cancelAsk();
      frameAsk = null;
    } else if (type === 'pen_observed') {
      session.notePenObserved();
      sharePen();
      broadcastMode();
    } else if (type === 'ask_done') {
      if (session.state.mode === 'ASK' && data['askEpoch'] === session.state.askEpoch && e.source) {
        frameAsk = { epoch: session.state.askEpoch, source: e.source };
        session.cancelAsk(); // restores the previous mode; the frame issued its own request
      } else {
        emit({ type: 'message_rejected', reason: 'stale_ask_done' });
      }
    } else if (type === 'card') {
      const relay = parseCardRelay(data);
      if (!relay) {
        emit({ type: 'message_rejected', reason: 'bad_card_relay' });
        return;
      }
      // Only the frame that completed the current authorized ASK may show one card
      // for it; NAV, WRITE, a cancelled ASK or a newer ASK leave nothing to answer.
      const authorized = frameAsk !== null && frameAsk.source === e.source && data['askEpoch'] === frameAsk.epoch && session.state.askEpoch === frameAsk.epoch;
      if (!authorized) {
        emit({ type: 'message_rejected', reason: 'card_without_authorized_frame_ask' });
        return;
      }
      frameAsk = null;
      // The top renders its own text: a fixture card only for an exact fixture it
      // knows itself, otherwise "provider unavailable". No relayed display text.
      const fixture = relay.provenance === 'fixture' ? session.fixtureText(relay.source_id, relay.source_version, relay.selected_text) : null;
      renderCard({
        unavailable: fixture === null,
        badge: fixture === null ? 'Provider unavailable' : 'Fixture card · synthetic test content, not a model explanation',
        body: fixture ?? PROVIDER_UNAVAILABLE_TEXT,
        quote: quoteOf(relay.selected_text),
        anchorLine: `From an embedded frame (${e.origin}; unauthenticated window message in this probe) · ${relay.source_id} v${relay.source_version}`,
        bridgeLine: 'Bridge: bridge_unavailable (answered locally) — selection not stored',
      });
      emit({ type: 'card_relayed', origin: e.origin, provenance: fixture === null ? 'none' : 'fixture' });
    }
  };
  win.addEventListener('message', onMessage);

  // ---- submission and card ---------------------------------------------------
  const renderCard = (text: CardText): void => {
    card.hidden = false;
    pendingCardGen = null;
    card.classList.remove('pending');
    badge.className = text.unavailable ? 'badge none' : 'badge';
    badge.textContent = text.badge;
    body.textContent = text.body;
    quote.textContent = text.quote;
    anchorLine.textContent = text.anchorLine;
    bridgeLine.textContent = text.bridgeLine;
  };
  const cardText = (outcome: AskOutcome): CardText | null => {
    if (outcome.status === 'not_in_ask') return null;
    if (outcome.status !== 'submitted') {
      return {
        unavailable: true,
        badge: outcome.status === 'source_unregistered' ? 'Source not registered' : 'No selection',
        body:
          outcome.status === 'source_unregistered'
            ? (options.unregisteredMessage?.() ?? 'This page is not a registered source in the probe, so nothing was submitted or explained.')
            : 'The mark did not cover any part of the page.',
        quote: '',
        anchorLine: '',
        bridgeLine: '',
      };
    }
    const view = cardView(outcome.card, outcome.selection);
    const b = outcome.bridge;
    return {
      unavailable: outcome.card.provenance === 'none',
      badge: view.badge,
      body: view.body,
      quote: view.quote,
      anchorLine: `${view.anchorLine} · ${outcome.frozen.frame.representation} (no pixels)`,
      bridgeLine:
        options.bridgeNote ??
        (b.answeredBy === 'local'
          ? `Bridge: ${b.response.error_code ?? b.response.status} (answered locally) — selection not stored`
          : `Bridge: ${b.response.status}${b.response.error_code ? ` (${b.response.error_code})` : ''} — acceptance only, not persistence`),
    };
  };
  const showCard = (outcome: AskOutcome, hostRect: PixelRect, range: Range | null, epochAtSubmit: number): void => {
    const text = cardText(outcome);
    if (!text) return;
    if (outcome.status === 'submitted') {
      highlight = { range, hostRect };
      placeHighlight();
    }
    // A frame is usually too small for the card; the top document renders it.
    if (options.role === 'frame' && win.parent !== win) {
      if (outcome.status === 'submitted') {
        postToParent({
          type: 'card',
          askEpoch: epochAtSubmit,
          provenance: outcome.card.provenance === 'fixture' ? 'fixture' : 'none',
          source_id: outcome.selection.source_id,
          source_version: outcome.selection.source_version,
          selected_text: outcome.selection.selected_text.slice(0, 2000),
        });
      } else {
        renderCard(text);
      }
      return;
    }
    renderCard(text);
  };

  /** Pending card for a just-submitted mark: honest status only, no explanation. */
  const showPending = (gen: number, selectedText: string): void => {
    highlight = null;
    placeHighlight();
    renderCard({
      unavailable: false,
      badge: 'Preparing',
      body: 'Preparing a silent card for this selection. Nothing has been explained yet.',
      quote: quoteOf(selectedText),
      anchorLine: 'Waiting for the frozen frame and the bridge answer.',
      bridgeLine: '',
    });
    card.classList.add('pending');
    pendingCardGen = gen;
  };
  const clearPending = (gen: number): void => {
    if (pendingCardGen !== gen) return;
    card.hidden = true;
    pendingCardGen = null;
  };

  /** Live snapshot, taken synchronously at the end of a direct mark. */
  const liveSnapshot = (rect: PixelRect, text: string, container: Element | null): DomSnapshotPayload =>
    captureSnapshot(win, rect, text, container, options.documentVersion(), session.now());

  const submit = (
    askEpoch: number,
    inputMode: Selection['input_mode'],
    rect: PixelRect,
    polygon: ReadonlyArray<PixelPoint> | null,
    snapshot: DomSnapshotPayload,
    highlightHostRect: PixelRect,
    range: Range | null = null,
  ): void => {
    const gen = ++presentGen;
    const epochAtSubmit = parentAskEpoch;
    // Frames render no pending or result card of their own (the top renders completed relays
    // only); a frame still shows its own status card for source_unregistered and empty_geometry.
    if (options.role === 'top') showPending(gen, snapshot.selection.text);
    void session
      .submitAsk({ askEpoch, inputMode, rect, ...(polygon ? { polygon } : {}), snapshot })
      .then((outcome) => {
        // Checked after the last await (hashing and the bridge).
        const current = gen === presentGen;
        emit({
          type: 'ask',
          outcome: outcome.status,
          presented: current && outcome.status !== 'not_in_ask',
          detail:
            outcome.status === 'submitted'
              ? {
                  selection: outcome.selection,
                  frame: outcome.frozen.frame,
                  request: outcome.request,
                  card: outcome.card,
                  bridge_request: outcome.bridgeRequest,
                  bridge: outcome.bridge,
                  snapshot_media: snapshot.media,
                  document_version: snapshot.document_version,
                }
              : { document_version: snapshot.document_version },
        });
        // A frame reports completion first, then its card, both tied to the top ASK it acted in.
        if (outcome.status === 'submitted' || outcome.status === 'source_unregistered') postToParent({ type: 'ask_done', askEpoch: epochAtSubmit });
        if (current) showCard(outcome, highlightHostRect, range, epochAtSubmit);
        // After the card is shown, so an owned page may also withdraw it.
        options.onOutcome?.(outcome, current);
        // Nothing to show (e.g. the ASK was cancelled while hashing): remove the pending card.
        clearPending(gen);
      })
      .catch((error: unknown) => {
        emit({ type: 'ask', outcome: 'empty_geometry', presented: false, detail: { error: String(error) } });
        clearPending(gen);
      });
  };

  // ---- adjustable box for ambiguous marks ------------------------------------
  // The box lives in host coordinates so it stays on the marked content while
  // scrolling. The whole source state (words, page version, video time and cues,
  // viewport) is frozen when the mark is made; confirming later submits exactly
  // that moment, never a mix of the mark and the confirm.
  let adjustEpoch = -1;
  let adjustMode: Selection['input_mode'] = 'pencil_ask';
  let adjustRect: PixelRect = { x: 0, y: 0, width: 0, height: 0 };
  let adjustMark: MarkState | null = null;
  let adjustHostOrigin: PixelPoint = { x: 0, y: 0 };
  const showAdjust = (rect: PixelRect, inputMode: Selection['input_mode'], askEpoch: number, reason: string): void => {
    const minW = 60;
    const minH = 32;
    const viewportRect = {
      x: rect.x - Math.max(0, (minW - rect.width) / 2),
      y: rect.y - Math.max(0, (minH - rect.height) / 2),
      width: Math.max(minW, rect.width),
      height: Math.max(minH, rect.height),
    };
    const o = host.getBoundingClientRect();
    adjustHostOrigin = { x: o.left, y: o.top };
    adjustMark = captureMarkState(win, host, options.documentVersion(), session.now());
    adjustRect = toHost(viewportRect);
    adjustEpoch = askEpoch;
    adjustMode = inputMode;
    adjust.hidden = false;
    place(adjust, adjustRect);
    emit({ type: 'adjust', reason });
  };
  let drag: { id: number; kind: 'move' | 'resize'; start: PixelPoint; rect: PixelRect } | null = null;
  const beginDrag = (kind: 'move' | 'resize') => (e: PointerEvent): void => {
    if (!accepted(e)) return;
    e.preventDefault();
    e.stopPropagation();
    drag = { id: e.pointerId, kind, start: { x: e.clientX, y: e.clientY }, rect: adjustRect };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  handle.addEventListener('pointerdown', beginDrag('resize'));
  adjust.addEventListener('pointerdown', (e) => {
    if (e.target === adjust) beginDrag('move')(e);
  });
  const onDrag = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id || !accepted(e)) return;
    const dx = e.clientX - drag.start.x;
    const dy = e.clientY - drag.start.y;
    adjustRect =
      drag.kind === 'move'
        ? { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }
        : { ...drag.rect, width: Math.max(20, drag.rect.width + dx), height: Math.max(20, drag.rect.height + dy) };
    place(adjust, adjustRect);
  };
  adjust.addEventListener('pointermove', onDrag);
  adjust.addEventListener('pointerup', () => (drag = null));
  adjust.addEventListener('pointercancel', () => (drag = null));
  const confirmAdjust = (): void => {
    if (!adjustMark) return;
    adjust.hidden = true;
    // The adjusted box expressed in the viewport as it was at the mark.
    const atMark = { x: adjustRect.x + adjustHostOrigin.x, y: adjustRect.y + adjustHostOrigin.y, width: adjustRect.width, height: adjustRect.height };
    const snapshot = snapshotFromMark(adjustMark, atMark);
    adjustMark = null;
    submit(adjustEpoch, adjustMode, atMark, null, snapshot, adjustRect);
  };
  confirmBtn.addEventListener('click', (e) => {
    if (accepted(e)) confirmAdjust();
  });
  discardBtn.addEventListener('click', () => {
    adjust.hidden = true;
    adjustMark = null;
  });

  // ---- capture of explicit ASK marks and WRITE ink ---------------------------
  const isOwn = (e: Event): boolean => e.composedPath().includes(host);

  const resolveAsk = (c: Capture): void => {
    const inputMode = selectionInputMode(c.pointer, c.decision);
    if (!inputMode) return;
    const gesture = classifyStroke(c.points);
    if (!gesture) return;
    let hit: TextHit | null = null;
    switch (gesture.kind) {
      case 'tap':
        hit = wordAt(doc, gesture.point, host);
        if (hit) return submit(c.askEpoch, inputMode, hit.rect, null, liveSnapshot(hit.rect, hit.text, hit.container), toHost(hit.rect), hit.range);
        return showAdjust({ x: gesture.point.x - 80, y: gesture.point.y - 45, width: 160, height: 90 }, inputMode, c.askEpoch, 'tap_without_text');
      case 'sweep':
        hit = textAlong(doc, c.points[0]!, c.points[c.points.length - 1]!, host);
        if (hit) return submit(c.askEpoch, inputMode, hit.rect, null, liveSnapshot(hit.rect, hit.text, hit.container), toHost(hit.rect), hit.range);
        return showAdjust({ ...gesture.rect, y: gesture.rect.y - 16, height: gesture.rect.height + 32 }, inputMode, c.askEpoch, 'sweep_without_text');
      case 'lasso': {
        const region = textInRegion(doc, gesture.rect, gesture.points, host);
        return submit(c.askEpoch, inputMode, gesture.rect, gesture.points, liveSnapshot(gesture.rect, region.text, region.container), toHost(gesture.rect));
      }
      case 'ambiguous':
        return showAdjust(gesture.rect, inputMode, c.askEpoch, gesture.reason);
    }
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!accepted(e)) return;
    suppressClick = null; // a new press: any earlier synthesized click has fired or never will
    const pointer = pointerKindOf(e.pointerType);
    // A second finger during a finger mark means a pinch or other gesture: drop the mark.
    if (!e.isPrimary && active && active.pointer === 'touch') {
      abortCapture();
      emit({ type: 'capture_aborted', reason: 'multi_touch' });
      return;
    }
    const decision = session.classify(pointer, isOwn(e) ? 'own_ui' : 'page');
    sharePen();
    emit({ type: 'input', pointer, decision, eventType: e.type });
    if (decision === 'pass_through') return;
    if (decision === 'ask_observe_text') {
      pendingText = { pointerId: e.pointerId, askEpoch: session.state.askEpoch };
      return; // the page keeps the mouse; native text selection happens normally
    }
    // Ink cannot be shown while the page-coordinate canvas is hidden (fullscreen).
    if (decision === 'ink_capture' && canvas.hidden) return;
    if (!e.isPrimary || active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const p = { x: e.clientX, y: e.clientY };
    active = { pointerId: e.pointerId, pointer, decision, askEpoch: session.state.askEpoch, points: [p], pagePoints: [{ x: p.x + win.scrollX, y: p.y + win.scrollY }] };
    transient = decision === 'ask_capture' ? active.points : null;
    if (decision === 'ink_capture') inkStrokes.push(active.pagePoints);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!accepted(e) || !active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length > 0 ? events : [e]) {
      active.points.push({ x: ev.clientX, y: ev.clientY });
      active.pagePoints.push({ x: ev.clientX + win.scrollX, y: ev.clientY + win.scrollY });
    }
    redraw();
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (!accepted(e)) return;
    // An aborted gesture submits nothing, whatever kind of mark it was.
    if (e.type === 'pointercancel') {
      if (pendingText && e.pointerId === pendingText.pointerId) pendingText = null;
      if (active && e.pointerId === active.pointerId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        abortCapture();
      }
      return;
    }
    if (pendingText && e.pointerId === pendingText.pointerId) {
      const { askEpoch } = pendingText;
      pendingText = null;
      const hit = currentTextSelection(win, host);
      if (hit && session.state.mode === 'ASK' && session.state.askEpoch === askEpoch) {
        submit(askEpoch, 'explicit_text_ask', hit.rect, null, liveSnapshot(hit.rect, hit.text, hit.container), toHost(hit.rect), hit.range);
      }
      return;
    }
    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const c = active;
    active = null;
    transient = null;
    suppressClick = { until: e.timeStamp + 600, pointer: c.pointer };
    redraw();
    if (c.decision === 'ink_capture') {
      emit({ type: 'ink', points: c.pagePoints.length });
      return;
    }
    if (session.state.mode === 'ASK' && session.state.askEpoch === c.askEpoch) resolveAsk(c);
  };
  const onClick = (e: MouseEvent): void => {
    if (!suppressClick || isOwn(e)) return;
    const s = suppressClick;
    suppressClick = null;
    if (session.state.mode === 'NAV' || e.timeStamp > s.until) return;
    // Only a click reporting the claimed pointer type is the synthesized one.
    const pointerType = (e as MouseEvent & { pointerType?: string }).pointerType;
    if (pointerType && pointerKindOf(pointerType) === s.pointer) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const onTouch = (e: TouchEvent): void => {
    if (!accepted(e) || isOwn(e)) return;
    // More than one finger is a pinch/zoom/scroll gesture: never claim it.
    if (e.touches.length > 1) {
      if (active && active.pointer === 'touch') {
        abortCapture();
        emit({ type: 'capture_aborted', reason: 'multi_touch' });
      }
      return;
    }
    // WebKit reports Apple Pencil touches as touchType "stylus"; stop pen scrolling only while a mark is being claimed.
    const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus');
    const mode = session.state.mode;
    const claimFinger = mode === 'ASK' && !session.penObserved && !stylus;
    const claimPen = stylus && (mode === 'ASK' || (mode === 'WRITE' && !canvas.hidden));
    if (claimFinger || claimPen) e.preventDefault();
  };
  const onScroll = (): void => redraw();
  const onResize = (): void => {
    resizeCanvas();
    placeHighlight();
  };

  const cap = { capture: true, passive: false } as const;
  win.addEventListener('pointerdown', onPointerDown, cap);
  win.addEventListener('pointermove', onPointerMove, cap);
  win.addEventListener('pointerup', onPointerUp, cap);
  win.addEventListener('pointercancel', onPointerUp, cap);
  win.addEventListener('click', onClick, cap);
  win.addEventListener('touchstart', onTouch, cap);
  win.addEventListener('touchmove', onTouch, cap);
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onResize, { passive: true });

  // ---- fullscreen ------------------------------------------------------------
  const onFullscreen = (): void => {
    const d = doc as Document & { webkitFullscreenElement?: Element | null };
    const fs = doc.fullscreenElement ?? d.webkitFullscreenElement ?? null;
    // Probe ink is in page coordinates, which do not apply inside a fullscreen element.
    canvas.hidden = fs !== null;
    // A pending adjust box was measured in the previous layout.
    adjust.hidden = true;
    adjustMark = null;
    if (!fs) {
      doc.documentElement.append(host);
      emit({ type: 'fullscreen', element: null, overlay: 'restored', forcedNav: false });
    } else if (!canHostOverlay(fs)) {
      // Children of video/iframe/replaced elements are not rendered: no toolbar,
      // no Cancel and no card can appear, so no input may be claimed either.
      const forcedNav = session.state.mode !== 'NAV';
      if (forcedNav) session.press('NAV');
      emit({ type: 'fullscreen', element: fs.tagName.toLowerCase(), overlay: 'hidden_unrenderable_fullscreen', forcedNav });
    } else {
      fs.append(host);
      emit({ type: 'fullscreen', element: fs.tagName.toLowerCase(), overlay: 'visible', forcedNav: false });
    }
    placeHighlight();
  };
  doc.addEventListener('fullscreenchange', onFullscreen);
  doc.addEventListener('webkitfullscreenchange', onFullscreen);

  const uninstall = (): void => {
    unsubscribe();
    win.removeEventListener('message', onMessage);
    win.removeEventListener('pointerdown', onPointerDown, cap);
    win.removeEventListener('pointermove', onPointerMove, cap);
    win.removeEventListener('pointerup', onPointerUp, cap);
    win.removeEventListener('pointercancel', onPointerUp, cap);
    win.removeEventListener('click', onClick, cap);
    win.removeEventListener('touchstart', onTouch, cap);
    win.removeEventListener('touchmove', onTouch, cap);
    win.removeEventListener('scroll', onScroll);
    win.removeEventListener('resize', onResize);
    doc.removeEventListener('fullscreenchange', onFullscreen);
    doc.removeEventListener('webkitfullscreenchange', onFullscreen);
    host.remove();
  };
  const toolbarRects = (): Record<string, { x: number; y: number; width: number; height: number }> => {
    const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const [m, b] of buttons) {
      const r = b.getBoundingClientRect();
      out[m] = { x: r.left, y: r.top, width: r.width, height: r.height };
    }
    const c = cancel.getBoundingClientRect();
    out['CANCEL'] = { x: c.left, y: c.top, width: c.width, height: c.height };
    const k = confirmBtn.getBoundingClientRect();
    out['CONFIRM'] = { x: k.left, y: k.top, width: k.width, height: k.height };
    return out;
  };
  const cardSnapshot = (): CardSnapshot => ({
    hidden: card.hidden === true,
    pending: pendingCardGen !== null,
    badge: badge.textContent ?? '',
    body: body.textContent ?? '',
    quote: quote.textContent ?? '',
    anchorLine: anchorLine.textContent ?? '',
    bridgeLine: bridgeLine.textContent ?? '',
    elementCount: card.querySelectorAll('*').length,
  });
  return { host, uninstall, toolbarRects, cardSnapshot, confirmAdjust, closeCard };
}
