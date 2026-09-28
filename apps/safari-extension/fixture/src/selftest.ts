// In-page self-test for the owned fixture. It dispatches *synthetic* (untrusted)
// pointer/touch/click events, so it proves what the probe's listeners do with an
// event (claim or pass through, what gets frozen and shown), not native browser
// behavior such as real scrolling, text selection gestures or Pencil input.

import type { DeferredBridge, ProbeHandle } from './common.ts';
import type { FrameState, PageCounters } from './fixture-page.ts';
import type { ProbeEvent } from '../../src/page.ts';
import type { Frame, Selection, ExplanationCard } from '../../src/contracts.ts';

type Check = { id: string; description: string; pass: boolean; observed: unknown };
type Pt = { x: number; y: number };
type AskDetail = { selection?: Selection; frame?: Frame; card?: ExplanationCard; bridge?: { answeredBy: string; response: { status: string; error_code: string | null } }; snapshot_media?: unknown; document_version?: string | null };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const POINTER_IDS: Record<string, number> = { mouse: 1, touch: 11, pen: 21 };

export async function runSelfTest(
  probe: ProbeHandle,
  counters: PageCounters,
  frameStates: Record<string, FrameState>,
  videoInfo: Record<string, unknown>,
  videoReady: Promise<void>,
  bridge: DeferredBridge,
): Promise<void> {
  const params = new URLSearchParams(location.search);
  const stopAfter = params.get('stop');
  const checks: Check[] = [];
  const observations: Record<string, unknown> = {};
  const { session, events } = probe;
  const check = (id: string, description: string, pass: boolean, observed: unknown = null): void => {
    checks.push({ id, description, pass, observed });
  };

  const fire = (type: string, pointerType: string, p: Pt, win: Window = window): boolean => {
    const doc = win.document;
    const target = doc.elementFromPoint(p.x, p.y) ?? doc.body;
    const Ctor = (win as Window & typeof globalThis).PointerEvent;
    const ev = new Ctor(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: POINTER_IDS[pointerType] ?? 99,
      pointerType,
      isPrimary: true,
      clientX: p.x,
      clientY: p.y,
      button: type === 'pointermove' ? -1 : 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pressure: type === 'pointerup' ? 0 : 0.5,
    });
    return target.dispatchEvent(ev);
  };
  const click = (p: Pt, pointerType = '', win: Window = window): boolean => {
    const target = win.document.elementFromPoint(p.x, p.y) ?? win.document.body;
    const Ctor = pointerType ? (win as Window & typeof globalThis).PointerEvent : (win as Window & typeof globalThis).MouseEvent;
    return target.dispatchEvent(new Ctor('click', { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, ...(pointerType ? { pointerType } : {}) }));
  };
  const touchstart = (p: Pt): boolean | 'unsupported' => {
    if (typeof Touch !== 'function') return 'unsupported';
    const target = document.elementFromPoint(p.x, p.y) ?? document.body;
    try {
      const t = new Touch({ identifier: 5, target, clientX: p.x, clientY: p.y });
      return target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, composed: true, touches: [t], changedTouches: [t], targetTouches: [t] }));
    } catch {
      return 'unsupported';
    }
  };
  /** Down, moves, up. Returns whether each phase was left un-prevented. */
  const stroke = (pointerType: string, pts: Pt[], win: Window = window): { down: boolean; moves: boolean; up: boolean } => {
    const down = fire('pointerdown', pointerType, pts[0]!, win);
    let moves = true;
    for (const p of pts.slice(1)) moves = fire('pointermove', pointerType, p, win) && moves;
    const up = fire('pointerup', pointerType, pts[pts.length - 1]!, win);
    return { down, moves, up };
  };
  const line = (a: Pt, b: Pt, n = 12): Pt[] => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
  const ellipse = (c: Pt, rx: number, ry: number, n = 28): Pt[] => Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + rx * Math.cos((i / n) * 2 * Math.PI), y: c.y + ry * Math.sin((i / n) * 2 * Math.PI) }));
  const phraseRect = (root: Element, phrase: string): DOMRect => {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(phrase);
      if (i >= 0) {
        const r = doc.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + phrase.length);
        return r.getBoundingClientRect();
      }
    }
    throw new Error(`phrase not found: ${phrase}`);
  };
  const center = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const sweepOver = (r: DOMRect): Pt[] => line({ x: r.left + 2, y: r.top + r.height / 2 }, { x: r.right - 2, y: r.top + r.height / 2 + 1 });
  const lastAsk = (since: number): (ProbeEvent & { type: 'ask' }) | null => {
    for (let i = events.length - 1; i >= since; i--) {
      const e = events[i]!;
      if (e.type === 'ask') return e;
    }
    return null;
  };
  const waitAsk = async (since: number, ms = 1500): Promise<{ outcome: string; detail: AskDetail } | null> => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const e = lastAsk(since);
      if (e) return { outcome: e.outcome, detail: e.detail as AskDetail };
      await sleep(20);
    }
    return null;
  };
  const eventsSince = (since: number, type: ProbeEvent['type']): ProbeEvent[] => events.slice(since).filter((e) => e.type === type);
  const done = (): boolean => stopAfter !== null && checks.some((c) => c.id.startsWith(stopAfter));
  const selections: Selection[] = [];
  // Independent tally: incremented only where this script deliberately makes a
  // mark that should become an explanation request in the top document.
  let intendedTopSubmissions = 0;

  const finish = async (): Promise<void> => {
    const summary = { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).map((c) => c.id) };
    const report = {
      kind: 'lc-web-probe-selftest/v1',
      synthetic_events: true,
      stop_after: stopAfter,
      environment: { user_agent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, url_path: location.pathname, origin: location.origin },
      summary,
      checks,
      observations,
      counters,
      frame_states: frameStates,
      video: videoInfo,
      explanation_requests: session.explanationRequestCount,
      selections,
      // Every submitted ask with its exact contract objects, for schema validation.
      contract_objects: [
        ...events.filter((e) => e.type === 'ask' && e.outcome === 'submitted').map((e) => ({ scope: 'top', ...(e as ProbeEvent & { type: 'ask' }).detail })),
        ...(((document.getElementById('frame-same') as HTMLIFrameElement | null)?.contentWindow as (Window & typeof globalThis) | null)?.__lcProbe?.events ?? [])
          .filter((e) => e.type === 'ask' && e.outcome === 'submitted')
          .map((e) => ({ scope: 'same_origin_frame', ...(e as ProbeEvent & { type: 'ask' }).detail })),
      ],
      event_counts: events.reduce<Record<string, number>>((acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc), {}),
    };
    const out = document.createElement('pre');
    out.id = 'lc-selftest-results';
    out.hidden = true;
    out.textContent = JSON.stringify(report);
    document.body.append(out);
    try {
      await fetch(`/__selftest?run=${encodeURIComponent(params.get('run') ?? 'manual')}&token=${encodeURIComponent(params.get('token') ?? '')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
    } catch (error) {
      observations['report_post_error'] = String(error);
    }
    document.title = `SELFTEST_DONE ${summary.passed}/${summary.total}`;
  };

  try {
    await videoReady;
    const video = document.getElementById('video') as HTMLVideoElement;
    if (video.src || video.srcObject) {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) resolve();
        else video.addEventListener('loadeddata', () => resolve(), { once: true });
        setTimeout(resolve, 3000);
      });
      try {
        await video.play();
      } catch (error) {
        observations['video_play_error'] = String(error);
      }
      const t0 = performance.now();
      while (video.currentTime < 0.6 && performance.now() - t0 < 3000) await sleep(50);
    }
    observations['video_current_time_at_start'] = video.currentTime;
    window.scrollTo(0, 0);
    await sleep(50);

    const btn = document.getElementById('counter-btn')!;
    const btnPt = center(btn.getBoundingClientRect());

    // ---- 1. NAV: ordinary mouse/touch input passes through ------------------
    let req0 = session.explanationRequestCount;
    check('nav.default', 'probe starts in NAV', session.state.mode === 'NAV', session.state.mode);
    let clicks0 = counters.clicks;
    const navMouse = stroke('mouse', [btnPt]);
    const navMouseClick = click(btnPt, 'mouse');
    const navTouch = stroke('touch', [btnPt]);
    const navTouchStart = touchstart(btnPt);
    const navTouchClick = click(btnPt, 'touch');
    const scrub = document.getElementById('scrub')!.getBoundingClientRect();
    const navScrub = stroke('touch', line({ x: scrub.left + 5, y: scrub.top + scrub.height / 2 }, { x: scrub.left + 200, y: scrub.top + scrub.height / 2 }));
    check('nav.pass_through', 'NAV mouse/touch pointer, touchstart and click events are not prevented', navMouse.down && navMouse.up && navMouseClick && navTouch.down && navTouch.up && navTouchClick && navTouchStart !== false && navScrub.down && navScrub.moves, { navMouse, navMouseClick, navTouch, navTouchStart, navTouchClick, navScrub });
    check('nav.page_handlers_ran', 'page button received both clicks', counters.clicks === clicks0 + 2, { before: clicks0, after: counters.clicks });
    check('nav.no_explanation', 'no explanation request from NAV input', session.explanationRequestCount === req0);

    // ---- 2. WRITE without pen: fingers and mouse keep navigating ------------
    session.press('WRITE');
    clicks0 = counters.clicks;
    const wTouch = stroke('touch', [btnPt]);
    const wTouchClick = click(btnPt, 'touch');
    const wMouse = stroke('mouse', [btnPt]);
    const wMouseClick = click(btnPt, 'mouse');
    check('write.finger_navigates', 'WRITE: touch/mouse events pass through and page clicks work', wTouch.down && wTouchClick && wMouse.down && wMouseClick && counters.clicks === clicks0 + 2, { wTouch, wMouse, clicks: counters.clicks - clicks0 });
    check('write.no_explanation', 'no explanation request from WRITE input', session.explanationRequestCount === req0);

    // ---- 3. explicit finger ASK (no pen observed yet) -----------------------
    session.press('ASK');
    let mark = events.length;
    const pBasis = document.getElementById('p-basis')!;
    const uvRect = phraseRect(pBasis, 'underlying vector');
    const askTouchStart = touchstart(center(uvRect));
    intendedTopSubmissions += 1;
    const fingerAsk = stroke('touch', sweepOver(uvRect));
    let ask = await waitAsk(mark);
    const fingerSel = ask?.detail.selection;
    check('ask.finger_claims', 'finger ASK claims the stroke (pointerdown and touchstart prevented)', !fingerAsk.down && askTouchStart !== true, { fingerAsk, askTouchStart });
    check('ask.finger_selection', 'finger sweep freezes "underlying vector" as explicit_touch_ask', ask?.outcome === 'submitted' && fingerSel?.input_mode === 'explicit_touch_ask' && fingerSel?.selected_text === 'underlying vector', { outcome: ask?.outcome, selected_text: fingerSel?.selected_text, input_mode: fingerSel?.input_mode });
    check('ask.unavailable_card', 'arbitrary text shows provider unavailable (no fabricated explanation)', ask?.detail.card?.status === 'unsupported' && ask?.detail.card?.provenance === 'none' && ask?.detail.card?.audio === false, ask?.detail.card);
    check('ask.restores_write', 'finished ASK returns to WRITE', session.state.mode === 'WRITE', session.state.mode);
    check('ask.bridge_unavailable', 'no native bridge: local bridge_unavailable, nothing stored', ask?.detail.bridge?.answeredBy === 'local' && ask?.detail.bridge?.response.error_code === 'bridge_unavailable', ask?.detail.bridge);
    check('ask.dom_snapshot', 'frame is labeled dom_snapshot, never screen_capture', ask?.detail.frame?.representation === 'dom_snapshot', ask?.detail.frame?.representation);
    if (fingerSel) selections.push(fingerSel);

    // A page click right after a claimed finger mark (new press) still reaches the page.
    clicks0 = counters.clicks;
    const afterMarkPress = stroke('touch', [btnPt]);
    const afterMarkClick = click(btnPt, 'touch');
    check('ask.click_after_mark', 'after a claimed finger mark, the next finger press and click reach the page', afterMarkPress.down && afterMarkClick && counters.clicks === clicks0 + 1, { afterMarkPress, afterMarkClick });

    // A second finger during a finger mark (pinch) aborts the mark: no selection.
    session.press('ASK');
    mark = events.length;
    const pinchA = center(phraseRect(pBasis, 'coordinates'));
    fire('pointerdown', 'touch', pinchA);
    const second = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: 12, pointerType: 'touch', isPrimary: false, clientX: pinchA.x + 80, clientY: pinchA.y + 40 });
    const secondNotPrevented = (document.elementFromPoint(pinchA.x + 80, pinchA.y + 40) ?? document.body).dispatchEvent(second);
    fire('pointerup', 'touch', pinchA);
    await sleep(150);
    check('ask.pinch_aborts_mark', 'a second finger aborts the finger mark (no selection) and is not claimed', eventsSince(mark, 'capture_aborted').length === 1 && eventsSince(mark, 'ask').length === 0 && secondNotPrevented && session.state.mode === 'ASK', { aborted: eventsSince(mark, 'capture_aborted').length, asks: eventsSince(mark, 'ask').length, secondNotPrevented });
    session.cancelAsk();

    // Hidden and display:none text inside a selection never reaches selected_text.
    session.press('ASK');
    mark = events.length;
    const hiddenP = document.getElementById('p-hidden')!;
    const hr = document.createRange();
    hr.selectNodeContents(hiddenP);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(hr);
    intendedTopSubmissions += 1;
    stroke('mouse', [center(phraseRect(hiddenP, 'Visible start'))]);
    ask = await waitAsk(mark);
    getSelection()!.removeAllRanges();
    const hiddenText = ask?.detail.selection?.selected_text ?? '';
    check('safety.hidden_text_excluded', 'hidden/display:none text inside a selection is not captured', ask?.outcome === 'submitted' && hiddenText.includes('Visible start') && hiddenText.includes('visible end') && !/SECRET/.test(hiddenText), { selected: hiddenText });

    // The page itself cannot inject a card: messages from the top window are rejected.
    const before = probe.cardSnapshot();
    mark = events.length;
    window.postMessage({ channel: 'lc-web-probe/v0', type: 'card', provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'eigenvector' }, location.origin);
    window.postMessage({ channel: 'lc-web-probe/v0', type: 'ask_done', askEpoch: session.state.askEpoch }, location.origin);
    await sleep(100);
    const after = probe.cardSnapshot();
    check('security.self_posted_messages_rejected', 'card/ask_done messages posted by the page itself are rejected', eventsSince(mark, 'message_rejected').length === 2 && eventsSince(mark, 'card_relayed').length === 0 && after.body === before.body, { rejected: eventsSince(mark, 'message_rejected') });
    if (done()) return await finish();

    // ---- 4. desktop mouse ASK over a native text selection ------------------
    session.press('ASK');
    mark = events.length;
    const eigenRect = phraseRect(document.getElementById('p-eigen')!, 'eigenvector');
    const sel = getSelection()!;
    sel.removeAllRanges();
    const r = document.createRange();
    const eigenNode = document.getElementById('p-eigen')!.firstChild!;
    const idx = (eigenNode.textContent ?? '').indexOf('eigenvector');
    r.setStart(eigenNode, idx);
    r.setEnd(eigenNode, idx + 'eigenvector'.length);
    sel.addRange(r);
    intendedTopSubmissions += 1;
    const mouseAsk = stroke('mouse', [center(eigenRect)]);
    ask = await waitAsk(mark);
    sel.removeAllRanges();
    check('ask.mouse_text', 'mouse ASK leaves the event to the page and submits the text selection as explicit_text_ask', mouseAsk.down && ask?.outcome === 'submitted' && ask.detail.selection?.input_mode === 'explicit_text_ask', { mouseAsk, outcome: ask?.outcome, input_mode: ask?.detail.selection?.input_mode });
    check('ask.fixture_card', 'exact fixture "eigenvector" v1 gets a labeled fixture card', ask?.detail.card?.status === 'ready' && ask.detail.card.provenance === 'fixture' && ask.detail.card.audio === false, ask?.detail.card);
    if (ask?.detail.selection) selections.push(ask.detail.selection);
    if (done()) return await finish();

    // ---- 5. finger lasso around a board region -------------------------------
    session.press('ASK');
    mark = events.length;
    const board = document.getElementById('board-svg')!.getBoundingClientRect();
    intendedTopSubmissions += 1;
    const lasso = stroke('touch', ellipse({ x: board.left + 110, y: board.top + 50 }, 100, 30));
    ask = await waitAsk(mark);
    const lassoSel = ask?.detail.selection;
    check('ask.lasso_region', 'closed finger loop freezes a polygon region with its board text', !lasso.down && ask?.outcome === 'submitted' && (lassoSel?.polygon?.length ?? 0) >= 3 && /λ/.test(lassoSel?.selected_text ?? ''), { outcome: ask?.outcome, text: lassoSel?.selected_text, points: lassoSel?.polygon?.length, bbox: lassoSel?.bbox });
    if (lassoSel) selections.push(lassoSel);

    // ---- 6. tap on video pixels: no text, adjustable box instead of guessing -
    const vRect = video.getBoundingClientRect();
    session.press('ASK');
    mark = events.length;
    stroke('touch', [{ x: vRect.left + 240, y: vRect.top + 60 }]);
    await sleep(100);
    const adjusts = eventsSince(mark, 'adjust');
    check('ask.ambiguous_adjust', 'a tap without text shows an adjustable box and submits nothing', adjusts.length === 1 && eventsSince(mark, 'ask').length === 0 && session.state.mode === 'ASK', adjusts);
    session.cancelAsk();
    check('ask.cancel_restores', 'cancel returns to the previous mode (WRITE)', session.state.mode === 'WRITE', session.state.mode);

    // ---- 7. region on a playing video: frozen media position and cues -------
    session.press('ASK');
    mark = events.length;
    intendedTopSubmissions += 1;
    stroke('touch', ellipse({ x: vRect.left + 200, y: vRect.top + 80 }, 120, 50));
    ask = await waitAsk(mark);
    const vSel = ask?.detail.selection;
    const media = ask?.detail.snapshot_media as { current_time?: number; active_cues?: string[]; cue_access?: string } | null | undefined;
    await sleep(1200);
    const later = video.currentTime;
    check('media.position_frozen', 'selection keeps media_position from freeze time while playback continues', typeof vSel?.media_position === 'number' && later > (vSel?.media_position ?? 0) + 0.5 && Object.isFrozen(vSel), { media_position: vSel?.media_position, current_time_later: later, paused: video.paused });
    check('media.cues_same_origin', 'same-origin caption cue text is recorded with the frame', media?.cue_access === 'readable' && (media.active_cues?.length ?? 0) > 0, media);
    if (vSel) selections.push(vSel);
    const crossTrack = document.getElementById('track-cross') as HTMLTrackElement;
    observations['cross_origin_track'] = { readyState: crossTrack.readyState, cues: crossTrack.track.cues?.length ?? null, meaning: 'readyState 3 = ERROR (blocked without CORS)' };
    check('media.cues_cross_origin_blocked', 'cross-origin caption track without CORS is not readable', crossTrack.readyState === 3 || (crossTrack.track.cues?.length ?? 0) === 0, observations['cross_origin_track']);

    // ---- 8. DOM-rendered caption word (custom-player style) -------------------
    const cap = document.getElementById('dom-caption')!;
    const capText = cap.textContent ?? '';
    const capWord = capText.split(/\s+/).find((w) => /^[A-Za-z]{4,}$/.test(w));
    if (capWord) {
      session.press('ASK');
      mark = events.length;
      intendedTopSubmissions += 1;
      stroke('touch', [center(phraseRect(cap, capWord))]);
      ask = await waitAsk(mark);
      check('media.dom_caption_word', 'tapping a DOM-rendered caption word selects that word with a media position', ask?.outcome === 'submitted' && ask.detail.selection?.selected_text === capWord && typeof ask.detail.selection?.media_position === 'number', { word: capWord, selected: ask?.detail.selection?.selected_text, media_position: ask?.detail.selection?.media_position });
      if (ask?.detail.selection) selections.push(ask.detail.selection);
    } else {
      check('media.dom_caption_word', 'tapping a DOM-rendered caption word selects that word with a media position', false, { caption: capText });
    }
    if (done()) return await finish();

    // ---- 9. pen: NAV passes, WRITE inks, ASK marks, fingers keep navigating --
    req0 = session.explanationRequestCount;
    session.press('NAV');
    clicks0 = counters.clicks;
    const penNav = stroke('pen', [btnPt]);
    const penNavClick = click(btnPt, 'pen');
    const penNavStroke = stroke('pen', sweepOver(phraseRect(pBasis, 'change of basis')));
    check('pen.nav_pass_through', 'pen in NAV is left to the page', penNav.down && penNavClick && penNavStroke.down && penNavStroke.moves && counters.clicks === clicks0 + 1, { penNav, penNavStroke });
    session.press('WRITE');
    mark = events.length;
    const ink = stroke('pen', line({ x: 40, y: pBasis.getBoundingClientRect().bottom + 4 }, { x: 300, y: pBasis.getBoundingClientRect().bottom + 30 }));
    const inkClick = click(btnPt, 'pen');
    const fingerAfterInk = click(btnPt, 'touch');
    check('pen.write_ink', 'pen in WRITE is claimed as ink; its synthesized click is suppressed', !ink.down && !ink.moves && eventsSince(mark, 'ink').length === 1 && !inkClick, { ink, inkClick });
    check('pen.finger_click_after_ink', 'a finger click right after ink still reaches the page', fingerAfterInk, fingerAfterInk);
    check('pen.no_explanation_nav_write', 'NAV/WRITE pen input created no explanation request', session.explanationRequestCount === req0);

    session.press('ASK');
    mark = events.length;
    const basisRect = phraseRect(pBasis, 'change of basis');
    await sleep(700);
    intendedTopSubmissions += 1;
    const penAsk = stroke('pen', sweepOver(basisRect));
    ask = await waitAsk(mark);
    const v1Sel = ask?.detail.selection;
    check('pen.ask_fixture', 'pen sweep over "change of basis" → pencil_ask, fixture card, back to WRITE', !penAsk.down && v1Sel?.input_mode === 'pencil_ask' && v1Sel.selected_text === 'change of basis' && ask?.detail.card?.provenance === 'fixture' && session.state.mode === 'WRITE', { penAsk, text: v1Sel?.selected_text, card: ask?.detail.card?.status, mode: session.state.mode });
    if (v1Sel) selections.push(v1Sel);

    session.press('ASK');
    mark = events.length;
    await sleep(700);
    clicks0 = counters.clicks;
    const fingerWithPen = stroke('touch', [btnPt]);
    const fingerWithPenStart = touchstart(btnPt);
    const fingerWithPenClick = click(btnPt, 'touch');
    check('pen.fingers_navigate_in_ask', 'once a pen was seen, fingers in ASK operate the page', fingerWithPen.down && fingerWithPenStart !== false && fingerWithPenClick && counters.clicks === clicks0 + 1 && eventsSince(mark, 'ask').length === 0, { fingerWithPen, fingerWithPenStart, clicks: counters.clicks - clicks0 });
    mark = events.length;
    intendedTopSubmissions += 1;
    stroke('pen', [center(phraseRect(document.getElementById('p-eigen')!, 'eigenvector'))]);
    ask = await waitAsk(mark);
    check('pen.tap_word', 'pen tap selects the word under it', ask?.detail.selection?.selected_text === 'eigenvector' && ask.detail.card?.provenance === 'fixture', { text: ask?.detail.selection?.selected_text });
    if (done()) return await finish();

    // ---- 9b. markup-looking page text is selected and quoted as literal text --
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    intendedTopSubmissions += 1;
    stroke('pen', sweepOver(phraseRect(document.getElementById('p-markup')!, 'img src=x onerror')));
    ask = await waitAsk(mark);
    const shown = probe.cardSnapshot();
    check(
      'safety.markup_quoted_as_text',
      'selected markup-like text reaches the card only as literal text: no element created, no script run',
      ask?.outcome === 'submitted' && /img src=x/.test(ask.detail.selection?.selected_text ?? '') && shown.quote.includes('img src=x') && shown.elementCount === 6 && (window as Window & { __xss?: unknown }).__xss === undefined,
      { selected: ask?.detail.selection?.selected_text, quote: shown.quote, cardElements: shown.elementCount },
    );

    // ---- 9c. peer review F1: a cancelled mouse gesture submits nothing -------
    session.press('ASK');
    mark = events.length;
    const reqF1 = session.explanationRequestCount;
    const eigenEl = document.getElementById('p-eigen')!;
    const eNode = eigenEl.firstChild!;
    const eIdx = (eNode.textContent ?? '').indexOf('eigenvector');
    const f1Range = document.createRange();
    f1Range.setStart(eNode, eIdx);
    f1Range.setEnd(eNode, eIdx + 'eigenvector'.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(f1Range);
    const f1Pt = center(phraseRect(eigenEl, 'eigenvector'));
    fire('pointerdown', 'mouse', f1Pt);
    fire('pointercancel', 'mouse', f1Pt);
    await sleep(250);
    getSelection()!.removeAllRanges();
    check('ask.mouse_cancel_submits_nothing', 'mouse down then pointercancel in ASK (with a native text selection) creates no selection or request (peer review F1)', eventsSince(mark, 'ask').length === 0 && session.explanationRequestCount === reqF1 && session.state.mode === 'ASK', { asks: eventsSince(mark, 'ask').length, requests: session.explanationRequestCount - reqF1, mode: session.state.mode });
    session.cancelAsk();

    // ---- 9d. peer review F4: a late answer for an older mark never replaces the newer card
    bridge.hold(true);
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    intendedTopSubmissions += 1;
    stroke('pen', sweepOver(phraseRect(pBasis, 'change of basis')));
    await sleep(150);
    session.press('ASK');
    intendedTopSubmissions += 1;
    stroke('pen', [center(phraseRect(eigenEl, 'eigenvector'))]);
    await sleep(150);
    const heldBoth = bridge.pending();
    bridge.ack(1); // the newer mark (eigenvector) answers first
    await sleep(150);
    const afterNewer = probe.cardSnapshot().quote;
    bridge.ack(0); // the older mark (change of basis) answers late
    await sleep(150);
    const afterLate = probe.cardSnapshot().quote;
    bridge.hold(false);
    const f4Asks = events.slice(mark).filter((e): e is ProbeEvent & { type: 'ask' } => e.type === 'ask');
    const lateAsk = f4Asks.find((e) => (e.detail['selection'] as Selection | undefined)?.selected_text === 'change of basis');
    check(
      'ask.late_bridge_answer_not_presented',
      'with two held bridge requests answered newest-first, the late older answer is kept as evidence but does not replace the newer card (peer review F4; self-test transport, not a native bridge)',
      heldBoth === 2 && afterNewer.includes('eigenvector') && afterLate.includes('eigenvector') && lateAsk?.presented === false && f4Asks.length === 2,
      { heldBoth, afterNewer, afterLate, presented: f4Asks.map((e) => e.presented) },
    );

    // ---- 9e. W-1: explicit dismissal rule (self-test deferred transport) --------
    const askOf = (m: number, text: string): (ProbeEvent & { type: 'ask' }) | undefined =>
      events.slice(m).find((e): e is ProbeEvent & { type: 'ask' } => e.type === 'ask' && (e.detail['selection'] as Selection | undefined)?.selected_text === text);

    // (a) Closing the card before a delayed response retires that request.
    bridge.hold(true);
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    intendedTopSubmissions += 1;
    stroke('pen', sweepOver(phraseRect(pBasis, 'change of basis')));
    await sleep(150);
    const pendingA = probe.cardSnapshot();
    probe.closeCard();
    const afterCloseA = probe.cardSnapshot();
    bridge.ackLatest();
    await sleep(200);
    const lateA = probe.cardSnapshot();
    const askA = askOf(mark, 'change of basis');
    check(
      'dismiss.close_before_delayed_response',
      'W-1: a submission shows its own pending card at once; closing it before the delayed answer retires that request; the answer is kept as evidence (presented:false) and never shown',
      pendingA.pending && !pendingA.hidden && pendingA.badge === 'Preparing' && pendingA.quote.includes('change of basis') &&
        afterCloseA.hidden && lateA.hidden && askA?.outcome === 'submitted' && askA.presented === false,
      { pendingA: { pending: pendingA.pending, badge: pendingA.badge, quote: pendingA.quote }, afterCloseHidden: afterCloseA.hidden, lateHidden: lateA.hidden, presented: askA?.presented },
    );

    // (b) An older card cannot be closed while a newer request is pending: the newer
    // submission replaces it with its own pending card, and the newer answer is shown.
    bridge.hold(false);
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    intendedTopSubmissions += 1;
    stroke('pen', [center(phraseRect(document.getElementById('p-eigen')!, 'eigenvector'))]);
    await waitAsk(mark);
    const olderCard = probe.cardSnapshot();
    bridge.hold(true);
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    intendedTopSubmissions += 1;
    stroke('pen', sweepOver(phraseRect(pBasis, 'change of basis')));
    await sleep(150);
    const whilePending = probe.cardSnapshot();
    bridge.ackLatest();
    await sleep(200);
    const newerShown = probe.cardSnapshot();
    const askB = askOf(mark, 'change of basis');
    bridge.hold(false);
    check(
      'dismiss.older_card_replaced_while_newer_pending',
      'W-1: while a newer request is pending the older card is no longer on screen (replaced by the newer pending card), so it cannot be closed to drop the newer answer; the newer answer is then shown',
      !olderCard.hidden && !olderCard.pending && olderCard.quote.includes('eigenvector') &&
        whilePending.pending && !whilePending.quote.includes('eigenvector') && whilePending.quote.includes('change of basis') &&
        !newerShown.hidden && !newerShown.pending && newerShown.quote.includes('change of basis') && askB?.presented === true,
      { older: olderCard.quote, whilePending: { pending: whilePending.pending, quote: whilePending.quote }, newer: { pending: newerShown.pending, badge: newerShown.badge, quote: newerShown.quote }, presented: askB?.presented },
    );

    // (c) A current delayed response with no dismissal is shown (positive control),
    // and closing a finished card afterwards only hides it.
    check('dismiss.current_response_presented', 'W-1: a delayed answer for the current, undismissed request is presented and replaces its pending card', !newerShown.hidden && newerShown.badge.startsWith('Fixture card') && askB?.presented === true, { badge: newerShown.badge, presented: askB?.presented });
    probe.closeCard();
    check('dismiss.close_finished_card', 'W-1: closing a finished card hides it and leaves no pending state', probe.cardSnapshot().hidden && !probe.cardSnapshot().pending, probe.cardSnapshot());

    // (d) Starting a new ASK retires the pending request and removes its pending card.
    bridge.hold(true);
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    intendedTopSubmissions += 1;
    stroke('pen', [center(phraseRect(document.getElementById('p-eigen')!, 'eigenvector'))]);
    await sleep(150);
    const pendingD = probe.cardSnapshot();
    session.press('ASK');
    const afterNewAsk = probe.cardSnapshot();
    session.cancelAsk();
    bridge.ackLatest();
    await sleep(200);
    const lateD = probe.cardSnapshot();
    const askD = askOf(mark, 'eigenvector');
    bridge.hold(false);
    check(
      'dismiss.new_ask_retires_pending',
      'W-1: starting a new ASK retires the pending request and removes its pending card; the late answer is evidence only',
      pendingD.pending && afterNewAsk.hidden && !afterNewAsk.pending && lateD.hidden && askD?.presented === false,
      { pendingBefore: pendingD.pending, hiddenAfterNewAsk: afterNewAsk.hidden, lateHidden: lateD.hidden, presented: askD?.presented },
    );

    // ---- 10. source version change and anchor immutability ------------------
    session.press('NAV');
    const beforeJson = JSON.stringify(v1Sel);
    click(center(document.getElementById('publish-v2')!.getBoundingClientRect()), 'mouse');
    await sleep(50);
    session.press('ASK');
    mark = events.length;
    const v2Rect = phraseRect(document.getElementById('p-basis')!, 'change of basis');
    intendedTopSubmissions += 1;
    stroke('pen', sweepOver(v2Rect));
    ask = await waitAsk(mark);
    if (ask?.detail.selection) selections.push(ask.detail.selection);
    check('version.v2_new_anchor', 'after the page publishes v2, a new selection is bound to v2 and gets no v1 fixture', ask?.detail.selection?.source_version === 2 && ask.detail.card?.provenance === 'none', { version: ask?.detail.selection?.source_version, card: ask?.detail.card?.status });
    window.scrollTo(0, 400);
    await sleep(100);
    check('version.v1_unchanged', 'the earlier v1 selection is unchanged after the version change and scrolling', JSON.stringify(v1Sel) === beforeJson && v1Sel?.source_version === 1 && Object.isFrozen(v1Sel), { v1: v1Sel?.source_version, scrollY });
    window.scrollTo(0, 0);
    await sleep(100);

    // ---- 11. frames -----------------------------------------------------------
    const sameFrame = document.getElementById('frame-same') as HTMLIFrameElement;
    const crossFrame = document.getElementById('frame-cross') as HTMLIFrameElement;
    let crossAccess = 'accessible';
    try {
      crossAccess = crossFrame.contentDocument ? 'accessible' : 'null_document';
      void crossFrame.contentWindow?.document.title;
    } catch (error) {
      crossAccess = `blocked: ${(error as Error).name}`;
    }
    const sameWin = sameFrame.contentWindow as (Window & typeof globalThis) | null;
    const sameProbe = sameWin?.__lcProbe;
    check('frame.cross_origin_blocked', 'top page cannot read a cross-origin frame document', crossAccess !== 'accessible', crossAccess);
    session.press('ASK');
    await sleep(200);
    check('frame.mode_follows_same', 'same-origin frame probe follows the top ASK mode', sameProbe?.session.state.mode === 'ASK', sameProbe?.session.state.mode);
    const crossOrigin = crossFrame.src ? new URL(crossFrame.src).origin : '';
    check('frame.mode_follows_cross', 'cross-origin frame probe follows the top ASK mode via postMessage', frameStates[crossOrigin]?.mode === 'ASK', frameStates[crossOrigin] ?? null);
    if (sameWin && sameProbe) {
      const projRect = phraseRect(sameWin.document.getElementById('p-proj')!, 'orthogonal projection');
      const fMark = sameProbe.events.length;
      stroke('pen', sweepOver(projRect), sameWin);
      await sleep(400);
      const fAsk = sameProbe.events.slice(fMark).find((e) => e.type === 'ask') as (ProbeEvent & { type: 'ask' }) | undefined;
      const fDetail = fAsk?.detail as AskDetail | undefined;
      check('frame.same_origin_selection', 'pen sweep inside the same-origin frame selects in the frame document (own source, fixture card)', fAsk?.outcome === 'submitted' && fDetail?.selection?.source_id === 'web-probe-fixture-frame' && fDetail.card?.provenance === 'fixture', { outcome: fAsk?.outcome, source: fDetail?.selection?.source_id, text: fDetail?.selection?.selected_text, bbox: fDetail?.selection?.bbox });
      await sleep(200);
      check('frame.ask_done_restores_top', 'the frame reports ASK done and the top returns to NAV', session.state.mode === 'NAV', session.state.mode);
      const relayed = events.filter((e) => e.type === 'card_relayed');
      const topCard = probe.cardSnapshot();
      check('frame.card_rendered_by_top', 'the frame card is rendered by the top document from its own fixture table, not relayed text', relayed.length === 1 && relayed[0]?.type === 'card_relayed' && relayed[0].provenance === 'fixture' && topCard.body.includes('orthogonal projection') && topCard.anchorLine.includes('unauthenticated'), { relayed, topCard });
    }
    observations['cross_origin_frame_input'] = 'Synthetic events cannot be dispatched into a cross-origin frame from the top page; needs trusted input (CDP/manual).';

    // ---- 11b. peer review F2: a frame cannot show a card without a completed, authorized top ASK
    const forge = (sameWin?.__lcProbe as { forgeToParent?: (d: Record<string, unknown>) => void } | undefined)?.forgeToParent;
    if (forge) {
      const forged = { type: 'card', provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'eigenvector' };
      const attempt = async (setup: () => void): Promise<{ reasons: string[]; bodyChanged: boolean; relayed: number }> => {
        setup();
        await sleep(100);
        const before = probe.cardSnapshot().body;
        const m = events.length;
        forge({ type: 'ask_done', askEpoch: session.state.askEpoch });
        forge({ ...forged, askEpoch: session.state.askEpoch });
        await sleep(150);
        return {
          reasons: events.slice(m).filter((e) => e.type === 'message_rejected').map((e) => (e.type === 'message_rejected' ? e.reason : '')),
          bodyChanged: probe.cardSnapshot().body !== before,
          relayed: events.slice(m).filter((e) => e.type === 'card_relayed').length,
        };
      };
      const inNav = await attempt(() => session.press('NAV'));
      const inWrite = await attempt(() => session.press('WRITE'));
      const afterCancel = await attempt(() => {
        session.press('ASK');
        session.cancelAsk();
      });
      const ok = (r: { reasons: string[]; bodyChanged: boolean; relayed: number }): boolean =>
        r.relayed === 0 && !r.bodyChanged && r.reasons.includes('stale_ask_done') && r.reasons.includes('card_without_authorized_frame_ask');
      check('frame.unauthorized_relay_rejected', 'frame-posted ask_done/card in NAV, WRITE and after a cancelled ASK are rejected; no card is shown (peer review F2)', ok(inNav) && ok(inWrite) && ok(afterCancel), { inNav, inWrite, afterCancel });
    } else {
      check('frame.unauthorized_relay_rejected', 'frame-posted ask_done/card in NAV, WRITE and after a cancelled ASK are rejected; no card is shown (peer review F2)', false, 'frame forge hook unavailable');
    }

    // ---- 11c. peer review F3: a confirmed adjust box describes the moment of the mark
    session.press('NAV');
    window.scrollTo(0, 0);
    await sleep(100);
    const basisNow = document.getElementById('p-basis')!;
    const bRect = basisNow.getBoundingClientRect();
    session.press('ASK');
    mark = events.length;
    await sleep(700);
    // A vertical stroke across the line is ambiguous: it opens the adjust box.
    stroke('pen', line({ x: bRect.left + 40, y: bRect.top - 6 }, { x: bRect.left + 46, y: bRect.bottom + 26 }));
    await sleep(100);
    const opened = eventsSince(mark, 'adjust').length;
    const versionAtMark = document.querySelector('meta[name="lc-fixture-source-version"]')!.getAttribute('content');
    const wordsAtMark = (basisNow.textContent ?? '').split(/\s+/).filter(Boolean);
    basisNow.textContent = 'Totally different replacement wording.';
    document.querySelector('meta[name="lc-fixture-source-version"]')!.setAttribute('content', '3');
    await sleep(300);
    intendedTopSubmissions += 1;
    probe.confirmAdjust();
    ask = await waitAsk(mark);
    const f3Sel = ask?.detail.selection;
    const f3Words = (f3Sel?.selected_text ?? '').split(' ').filter(Boolean);
    check(
      'ask.adjust_box_single_moment',
      'page text and version change between mark and confirm; the submitted selection keeps the mark-time version and words (peer review F3)',
      opened === 1 && ask?.outcome === 'submitted' && String(f3Sel?.source_version) === versionAtMark && f3Words.length > 0 && f3Words.every((w) => wordsAtMark.some((m) => m.includes(w))) && !/Totally|replacement/.test(f3Sel?.selected_text ?? '') && (f3Sel?.created_at ?? '') >= (ask?.detail.frame?.captured_at ?? 'z'),
      { opened, versionAtMark, version: f3Sel?.source_version, text: f3Sel?.selected_text, captured_at: ask?.detail.frame?.captured_at, created_at: f3Sel?.created_at },
    );
    if (f3Sel) selections.push(f3Sel);

    // ---- 12. fullscreen and capability observations --------------------------
    const fsErrBefore = videoInfo['fullscreen_container_error'];
    click(center(document.getElementById('fs-container')!.getBoundingClientRect()), 'mouse');
    await sleep(300);
    observations['fullscreen'] = {
      fullscreenEnabled: document.fullscreenEnabled,
      element_after_synthetic_click: document.fullscreenElement?.id ?? null,
      error: videoInfo['fullscreen_container_error'] ?? fsErrBefore ?? null,
      overlay_events: events.filter((e) => e.type === 'fullscreen'),
      note: 'A synthetic click carries no user activation; fullscreen needs trusted input.',
    };
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    let pixelRead = 'not_attempted';
    try {
      canvas.getContext('2d')?.drawImage(video, 0, 0, 16, 16);
      canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
      pixelRead = 'readable (same-origin blob video; the probe does not use pixels)';
    } catch (error) {
      pixelRead = `blocked: ${(error as Error).name}`;
    }
    const d = document as Document & { caretPositionFromPoint?: unknown; caretRangeFromPoint?: unknown };
    observations['apis'] = {
      caretPositionFromPoint: typeof d.caretPositionFromPoint === 'function',
      caretRangeFromPoint: typeof d.caretRangeFromPoint === 'function',
      intl_segmenter: typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function',
      getCoalescedEvents: typeof PointerEvent.prototype.getCoalescedEvents === 'function',
      touch_constructor: typeof Touch === 'function',
      webkitEnterFullscreen: 'webkitEnterFullscreen' in HTMLVideoElement.prototype,
      visualViewport: typeof visualViewport === 'object' && visualViewport !== null,
      media_recorder: typeof MediaRecorder === 'function',
      same_origin_video_pixels: pixelRead,
    };
    check('totals.requests_match_intended_marks', 'explanation requests equal the ASK marks this script deliberately made (none from NAV/WRITE input)', session.explanationRequestCount === intendedTopSubmissions, { requests: session.explanationRequestCount, intended: intendedTopSubmissions });
  } catch (error) {
    check('selftest.exception', 'self-test ran without exceptions', false, String((error as Error)?.stack ?? error));
  }
  await finish();
}
