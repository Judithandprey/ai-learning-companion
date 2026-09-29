// QA steps for the integrated capture + editable ink pass (QA_SCENARIO=ink), on the owned synthetic
// course page served on 4184. Driven by run.mjs; checked by analyze_ink.py.
//
// Every product action is real CDP input on the page (mouse, CDP pen: not Apple Pencil, or CDP touch
// emulation: not a real finger) and every toolbar press is a click on the product's own button.
// Harness controls, labelled in the evidence:
//   - worker reads: companion state (isolated world), the extension's own IndexedDB (read-only helpers
//     never create or change a store), a runtime.onMessage spy that records message types only;
//   - DevTools DOM search reads the product's card inside its closed shadow root (read-only);
//   - forged test doubles: an unreadable record put before a page loads it, and a record corrupted after
//     load (both via the worker's IndexedDB);
//   - page-content changes (text, pushState/replaceState, scrollTo, pausing the page's video) are
//     harness-issued main-world edits, not gestures; reload/navigation are CDP Page.reload/navigate;
//   - tab B is created and tabs are switched from the worker (chrome.tabs.create/update); two
//     same-address tabs are told apart for the DevTools action invocation by giving tab B a temporary
//     title, restored straight after.

/** Margin geometry of the owned page at 1246x903: the column x 950-1190 is blank page. */
const Y1 = 300, Y2 = 380, Y5 = 460, XL = 960, XR = 1180, XCROSS = 1070, XERASE = 1000;
const INTRO = 'Let A be a 2×2 matrix with eigenvalues λ₁ = 2 and λ₂ = 3. Then trace(A²) = λ₁² + λ₂² = 13.';
const CAPTION = 'Board: the characteristic polynomial (a figure, not selectable text).';

export function inkSteps(h) {
  const { E, SW, sleep, shot, state, press, trigger, capLog, PAGE, A, B, mouse } = h;
  const line = (x0, y0, x1, y1, n = 8) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  /** One stroke through literal points with trusted CDP input; `other` sends it to a second page. */
  const stroke = (pts, pointerType, other, settle = 350) => {
    const on = other ? { other } : {};
    const pen = pointerType === 'pen' ? { force: 0.5 } : {};
    const [x0, y0] = pts[0];
    const [xn, yn] = pts[pts.length - 1];
    return [
      { ...mouse('mouseMoved', x0, y0, { pointerType, buttons: 0 }), ...on },
      { ...mouse('mousePressed', x0, y0, { pointerType, ...pen }), ...on },
      ...pts.slice(1).map(([x, y]) => ({ ...mouse('mouseMoved', x, y, { pointerType, button: 'left', buttons: 1, ...pen }), ...on })),
      { ...mouse('mouseReleased', xn, yn, { pointerType }), ...on },
      sleep(settle),
    ];
  };
  /** A slow one-finger drag with CDP touch emulation (not a real finger); it rests before lifting so no fling follows. */
  const fingerDrag = (pts) => {
    const [xn, yn] = pts[pts.length - 1];
    return [
      { cdp: 'Input.dispatchTouchEvent', params: { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] } },
      ...pts.slice(1).flatMap(([x, y]) => [{ cdp: 'Input.dispatchTouchEvent', params: { type: 'touchMove', touchPoints: [{ x, y }] } }, sleep(40)]),
      sleep(300),
      { cdp: 'Input.dispatchTouchEvent', params: { type: 'touchMove', touchPoints: [{ x: xn, y: yn }] } },
      sleep(300),
      { cdp: 'Input.dispatchTouchEvent', params: { type: 'touchEnd', touchPoints: [] } },
      sleep(800),
    ];
  };
  const ink = (as, tab = A) => state(as, tab);
  const card = (as) => ({ domSearch: 'section.card', as });
  /** Page-side pointer counter (the page's own listeners): proves input reached the page. */
  const pointerCounter = (as) => E(`(window.__qaPointer = { down: 0, up: 0 }, window.__qaPointerOn || (window.__qaPointerOn = true, addEventListener('pointerdown', () => window.__qaPointer.down++, true), addEventListener('pointerup', () => window.__qaPointer.up++, true)), true)`, as);
  const pointerRead = (as) => E(`({ pointer: window.__qaPointer, selection: String(getSelection() || '').length, hosts: !!document.querySelector('[data-lc-web-probe],[data-lc-companion-capture]') })`, as);
  const OPEN_RO = `new Promise((ok, no) => { const r = indexedDB.open('lc-web-ink'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); })`;
  /** All stored ink documents, read natively in the worker (never creates or changes a store), with the product's parser result. */
  const idb = (as) => SW(`(async () => { const db = await ${OPEN_RO}; if (!db.objectStoreNames.contains('pages')) { db.close(); return []; }
    const rows = await new Promise((ok, no) => { const tx = db.transaction('pages', 'readonly'); const s = tx.objectStore('pages'); const k = s.getAllKeys(), v = s.getAll(); tx.oncomplete = () => ok(k.result.map((key, i) => ({ key, doc: v.result[i] }))); tx.onerror = () => no(tx.error); });
    db.close(); return rows.map(({ key, doc }) => { const [origin, sha] = key.split(' '); let parse; try { parse = lcInkFormat.parseInk(doc, { origin, address_sha256: sha }); parse = { ok: parse.ok, reason: parse.reason || null }; } catch (e) { parse = { ok: false, reason: 'threw ' + e.message }; } return { key, parse, json: JSON.stringify(doc) }; }); })()`, as);
  const keyOf = (address) => `new URL(${JSON.stringify(address)}).origin + ' ' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(${JSON.stringify(address)}))), (b) => b.toString(16).padStart(2, '0')).join('')`;
  /** FORGED TEST DOUBLE: put `value` under the key of `address` in the extension's own store. */
  const forge = (address, value, as) => SW(`(async () => { const key = ${keyOf(address)}; const value = ${value}; const db = await ${OPEN_RO};
    await new Promise((ok, no) => { const tx = db.transaction('pages', 'readwrite'); tx.objectStore('pages').put(value, key); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); db.close(); return key; })()`, as);
  /** FORGED TEST DOUBLE: replace the stored record of `address` by applying `edit(doc)` to it. */
  const corrupt = (address, edit, as) => SW(`(async () => { const key = ${keyOf(address)}; const db = await ${OPEN_RO};
    await new Promise((ok, no) => { const tx = db.transaction('pages', 'readwrite'); const s = tx.objectStore('pages'); const g = s.get(key); g.onsuccess = () => s.put((${edit})(g.result), key); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); db.close(); return key; })()`, as);
  const spyInstall = SW(`(() => { if (globalThis.__qaMsgs) return 'already'; globalThis.__qaMsgs = []; chrome.runtime.onMessage.addListener((m, sender) => { globalThis.__qaMsgs.push({ type: m && m.type, at: new Date().toISOString(), tab: sender && sender.tab ? sender.tab.id : null }); return false; }); return 'installed'; })()`, 'spy');
  const spyRead = (as) => SW(`(() => { const all = globalThis.__qaMsgs || null; if (!all) return { lost: true }; const q = globalThis.__qaMsgRead || 0; globalThis.__qaMsgRead = all.length; return { total: all.length, entries: all.slice(q) }; })()`, as);
  const scrollTo = (y, as) => E(`(window.scrollTo(0, ${y}), scrollY)`, as);
  const setIntro = (text, as) => E(`(document.getElementById('intro').firstChild.textContent = ${JSON.stringify(text)}, true)`, as);
  const SRC = `${PAGE}?qa=ink-source`;
  const STEP2 = `${PAGE}?qa=ink-step-2`;
  const BAD = `${PAGE}?qa=ink-unreadable`;
  const LATE = `${PAGE}?qa=ink-corrupt-after-load`;
  const CONF = `${PAGE}?qa=ink-conflict`;

  return [
    // ===== I: the core flow on the original page =====
    { cdp: 'Page.navigate', params: { url: PAGE } },
    sleep(1500),
    h.installWrapper,
    spyInstall,
    ...trigger('started'),
    SW(`(async () => (globalThis.__qaA = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id))()`, 'tabA'),
    sleep(600),
    ink('i0'),
    pointerCounter('counter0'),
    // NAV (the default state): pen and mouse drags reach the page and draw nothing
    ...stroke(line(XL, Y1, XR, Y1), 'pen'),
    ...stroke(line(XL, Y2, XR, Y2), 'mouse'),
    pointerRead('navPointer'),
    ink('iNav'),
    // explicit WRITE; mouse writing is off by default: a mouse drag draws nothing
    ...press('WRITE'),
    ink('iWrite'),
    ...stroke(line(XL, Y2, XR, Y2), 'mouse'),
    ink('iMouseOff'),
    // the pen writes (CDP pen): stroke S1
    ...stroke(line(XL, Y1, XR, Y1), 'pen'),
    ink('iS1'),
    // a finger drag in WRITE (CDP touch emulation) draws nothing and scrolls the page; vertical, because a
    // horizontal touch swipe is the browser's own back/forward gesture
    { cdp: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 1 } },
    ...fingerDrag(line(1070, 620, 1070, 470, 12)),
    { cdp: 'Emulation.setTouchEmulationEnabled', params: { enabled: false } },
    E(`({ scrollY, href: location.href })`, 'fingerScroll'),
    ink('iFinger'),
    scrollTo(0, 'fingerUnscroll'),
    sleep(1000),
    E(`scrollY`, 'fingerSettled'),
    // explicitly enable mouse writing; S2 with the mouse
    ...press('INK_MOUSE'),
    ink('iMouseOn'),
    ...stroke(line(XL, Y2, XR, Y2), 'mouse'),
    // S3: screen-fixed placement, crossing S2 (later stroke, drawn on top)
    ...press('INK_DISPLAY'),
    ...stroke(line(XCROSS, Y2 - 40, XCROSS, Y2 + 40), 'mouse'),
    ...press('INK_DISPLAY'),
    sleep(400),
    ink('iDraft'),
    idb('dbDraft'),
    shot('ink-01-draft'),
    // erase only part of S2 (away from the crossing)
    ...press('INK_ERASER'),
    ...stroke(line(XERASE, Y2 - 22, XERASE, Y2 + 22, 6), 'mouse'),
    sleep(300),
    ink('iErased'),
    idb('dbErased'),
    shot('ink-02-erased'),
    ...press('INK_UNDO'),
    sleep(300),
    ink('iUndo'),
    shot('ink-03-undo'),
    ...press('INK_REDO'),
    sleep(300),
    ink('iRedo'),
    idb('dbRedo'),
    card('cardWriting'),
    shot('ink-04-redo'),
    capLog('logWriting'),
    spyRead('msgWriting'),
    // ASK from WRITE (screen-fixed placement active, eraser tool) and finish it: a pen loop around S1
    ...press('INK_DISPLAY'),
    ink('iBeforeAsk'),
    ...press('ASK'),
    ink('iAsk'),
    ...stroke([[XL - 10, Y1 - 25], [XR + 10, Y1 - 25], [XR + 10, Y1 + 25], [XL - 10, Y1 + 25], [XL - 9, Y1 - 24]], 'pen'),
    sleep(900),
    ink('iAskFinished'),
    card('cardAsk'),
    capLog('logAsk'),
    spyRead('msgAsk'),
    shot('ink-05-ask-finished'),
    // ASK cancelled with Cancel, then ASK cancelled by pressing ASK again: back to WRITE each time
    ...press('ASK'),
    ink('iAsk2'),
    ...press('CANCEL'),
    ink('iCancelled'),
    ...press('ASK'),
    ink('iAsk3'),
    ...press('ASK'),
    ink('iCancelled2'),
    capLog('logCancel'),
    spyRead('msgCancel'),
    // continue writing in the restored WRITE: content placement, pen tool, mouse stroke S5
    ...press('INK_DISPLAY'),
    ...press('INK_PEN'),
    ...stroke(line(XL, Y5, XR, Y5), 'mouse'),
    ink('iS5'),
    card('cardAfterWriting'),
    // the NAV button: pen and mouse reach the page and draw nothing; WRITE comes back as it was
    ...press('NAV'),
    ink('iNavButton'),
    pointerCounter('counter1'),
    ...stroke(line(XL, 540, XR, 540), 'pen'),
    ...stroke(line(XL, 560, XR, 560), 'mouse'),
    pointerRead('navButtonPointer'),
    ink('iNavDrawn'),
    ...press('WRITE'),
    ink('iWriteAgain'),
    // placements: content ink follows the page, screen ink stays
    shot('ink-06-before-scroll'),
    scrollTo(150, 'scrolled'),
    sleep(500),
    ink('iScrolled'),
    shot('ink-07-scrolled'),
    scrollTo(0, 'unscrolled'),
    sleep(500),
    idb('dbBeforeReload'),
    capLog('logBeforeReload'),
    spyRead('msgBeforeReload'),
    // save, reload, reopen, edit the reopened originals
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('restartedAfterReload'),
    sleep(800),
    ink('iReopened'),
    shot('ink-08-reopened'),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    ...press('INK_ERASER'),
    ...stroke(line(1100, Y5 - 22, 1100, Y5 + 22, 6), 'mouse'),
    sleep(300),
    ink('iReopenErased'),
    ...press('INK_UNDO'),
    sleep(300),
    ink('iReopenUndo'),
    ...press('INK_PEN'),
    ...stroke(line(XL, 540, XR, 540), 'mouse'),
    ink('iReopenAdded'),
    card('cardReopened'),
    idb('dbAfterEdit'),
    shot('ink-09-reopen-edited'),
    // same-document address change: the ink of another address is not shown there; it comes back
    E(`(history.pushState(null, '', ${JSON.stringify(STEP2)}), location.href)`, 'step2Href'),
    sleep(1500),
    ink('iStep2'),
    ...stroke(line(XL, 620, XR, 620), 'mouse'),
    ink('iStep2Drawn'),
    E(`(history.replaceState(null, '', ${JSON.stringify(PAGE)}), location.href)`, 'step1Href'),
    sleep(1500),
    ink('iStep1Back'),
    idb('dbSteps'),
    // Stop from WRITE (the action again): the ink layer goes away with the toolbar; input reaches the page
    ...trigger('stoppedInWrite'),
    E(`({ probe: !!document.querySelector('[data-lc-web-probe]'), panel: !!document.querySelector('[data-lc-companion-capture]') })`, 'hostsAfterWriteStop'),
    SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, func: () => (globalThis.__lcCompanion ? 'running' : 'absent') }); return r.result; })()`, 'handleAfterWriteStop'),
    pointerCounter('counter2'),
    ...stroke(line(XL, 600, XR, 600), 'pen'),
    ...stroke(line(XL, 640, XR, 640), 'mouse'),
    pointerRead('stoppedPointer'),
    shot('ink-10-stopped-in-write'),
    ...trigger('restartedAfterWriteStop'),
    sleep(800),
    ink('iRestarted'),
    idb('dbAfterStop'),
    capLog('logReopen'),
    spyRead('msgReopen'),

    // ===== S: current source changes make ink unverified; originals stay =====
    { cdp: 'Page.navigate', params: { url: SRC } },
    sleep(1500),
    E(`(document.getElementById('lecture-video').pause(), document.getElementById('lecture-video').paused)`, 'videoPaused'),
    ...trigger('srcStarted'),
    sleep(800),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    E(`(() => { const r = document.getElementById('intro').getBoundingClientRect(); const h = document.querySelector('h1').getBoundingClientRect(); const c = document.querySelector('figcaption').getBoundingClientRect(); return { intro: [r.left, r.top, r.width, r.height], h1: [h.left, h.top, h.width, h.height], caption: [c.left, c.top, c.width, c.height] }; })()`, 'srcGeo'),
    // U1 content over the intro text; U2 screen-fixed over the heading; U3 content in the blank margin
    ...stroke(line(60, 162, 360, 162), 'mouse'),
    ...press('INK_DISPLAY'),
    ...stroke(line(40, 100, 300, 100), 'mouse'),
    ...press('INK_DISPLAY'),
    ...stroke(line(XL, 250, XR, 250), 'mouse'),
    sleep(400),
    ink('sDrawn'),
    idb('dbSrcDrawn'),
    shot('ink-11-source-drawn'),
    // control: a plain scroll and back keeps everything solid
    scrollTo(60, 'srcScroll'),
    sleep(500),
    scrollTo(0, 'srcUnscroll'),
    sleep(500),
    ink('sScrollControl'),
    // visible change of the intro text (same address)
    setIntro('QA replaced this paragraph with different text at the same address.', 'srcChanged'),
    sleep(900),
    ink('sChanged'),
    idb('dbSrcChanged'),
    shot('ink-12-source-changed'),
    // revert: current content matches again, so the ink is solid again (control)
    setIntro(INTRO, 'srcReverted'),
    sleep(900),
    ink('sReverted'),
    // change during a held stroke over the caption (no other stroke uses it; the video is paused),
    // read straight after release; then a control stroke drawn over the changed caption
    { ...mouse('mouseMoved', 60, 382, { pointerType: 'mouse', buttons: 0 }) },
    { ...mouse('mousePressed', 60, 382, { pointerType: 'mouse' }) },
    { ...mouse('mouseMoved', 120, 382, { pointerType: 'mouse', button: 'left', buttons: 1 }) },
    E(`(document.querySelector('figcaption').textContent = 'QA changed the caption while the stroke was held.', true)`, 'srcHeldChange'),
    sleep(300),
    { ...mouse('mouseMoved', 180, 382, { pointerType: 'mouse', button: 'left', buttons: 1 }) },
    { ...mouse('mouseMoved', 240, 382, { pointerType: 'mouse', button: 'left', buttons: 1 }) },
    { ...mouse('mouseReleased', 240, 382, { pointerType: 'mouse' }) },
    sleep(120),
    ink('sHeld'),
    ...stroke(line(60, 380, 300, 380), 'mouse', undefined, 120),
    ink('sHeldControl'),
    E(`(document.querySelector('figcaption').textContent = ${JSON.stringify(CAPTION)}, true)`, 'srcCaptionReverted'),
    sleep(900),
    ink('sHeldReverted'),
    // off-screen changes: scroll the heading and intro out of view, change the heading, then the intro
    scrollTo(500, 'srcAway'),
    sleep(600),
    ink('sAwayUnchanged'),
    E(`(document.querySelector('h1').textContent = 'QA changed the heading while it was off screen', true)`, 'srcOffChange'),
    sleep(900),
    ink('sAwayChanged'),
    setIntro('QA changed the intro while it was off screen.', 'srcOffChange2'),
    sleep(900),
    ink('sAwayChanged2'),
    shot('ink-13-offscreen-changed'),
    scrollTo(0, 'srcBack'),
    sleep(900),
    ink('sBack'),
    idb('dbSrcEnd'),
    shot('ink-14-source-back'),
    // reopen: the page is static again, so reopened originals verify against it
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('srcReopened'),
    sleep(900),
    ink('sReopened'),
    idb('dbSrcReopened'),
    // reopen over changed content (the intro edited before the start): the reopened ink is unverified
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    setIntro('QA edited this paragraph before the companion was started.', 'srcPreEdited'),
    ...trigger('srcReopenedChanged'),
    sleep(900),
    ink('sReopenedChanged'),
    capLog('logSource'),
    spyRead('msgSource'),

    // ===== U: unreadable stored ink is preserved =====
    forge(BAD, `{ format: 'not-lc-web-ink', note: 'QA forged unreadable record' }`, 'forgedKey'),
    idb('dbForged'),
    { cdp: 'Page.navigate', params: { url: BAD } },
    sleep(1500),
    ...trigger('badStarted'),
    sleep(900),
    ink('bLoaded'),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    ...stroke(line(XL, Y1, XR, Y1), 'mouse'),
    ink('bDrawn'),
    idb('dbBadAfter'),
    // corrupted after load (forged): the next saves are refused and the record is left as it is
    { cdp: 'Page.navigate', params: { url: LATE } },
    sleep(1500),
    ...trigger('lateStarted'),
    sleep(900),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    ...stroke(line(XL, Y1, XR, Y1), 'mouse'),
    ink('lSaved'),
    corrupt(LATE, `(doc) => ({ ...doc, format: 'broken-by-qa' })`, 'corruptedKey'),
    idb('dbCorrupted'),
    ...stroke(line(XL, Y2, XR, Y2), 'mouse'),
    ink('lAfterCorrupt'),
    ...stroke(line(XL, Y5, XR, Y5), 'mouse'),
    ink('lRetry'),
    // Stop and restart with this unsaved ink: it is kept in the tab and comes back
    ...trigger('lateStopped'),
    ...trigger('lateRestarted'),
    sleep(900),
    ink('lKept'),
    idb('dbLateAfter'),

    // ===== C: two real tabs on one address =====
    { cdp: 'Page.navigate', params: { url: CONF } },
    sleep(1500),
    ...trigger('confStartedA'),
    sleep(900),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    ...stroke(line(XL, Y1, XR, Y1), 'mouse'),
    ink('cA1'),
    SW(`(async () => (globalThis.__qaB = (await chrome.tabs.create({ url: ${JSON.stringify(CONF)}, active: true })).id))()`, 'tabB'),
    sleep(1800),
    { eval: `(document.title = 'qa-tab-b', document.title)`, as: 'titledB', other: CONF },
    sleep(400),
    { triggerAction: true, as: 'confStartedB', url: CONF, title: 'qa-tab-b' },
    sleep(900),
    { eval: `(document.title = ${JSON.stringify('Linear Algebra · Lecture 7: Eigenvalues (synthetic course page)')}, document.title)`, as: 'untitledB', other: CONF },
    ink('cB0', B),
    ...h.pressOn('WRITE', B, CONF),
    ...h.pressOn('INK_MOUSE', B, CONF),
    ...stroke(line(XL, Y2, XR, Y2), 'mouse', CONF),
    ink('cB1', B),
    idb('dbConfB'),
    SW(`chrome.tabs.update(${A}, { active: true }).then(() => true)`, 'backToA'),
    sleep(800),
    ...stroke(line(XL, Y5, XR, Y5), 'mouse'),
    ink('cA2'),
    idb('dbConfAfterA'),
    SW(`chrome.tabs.remove(${B}).then(() => true)`, 'closedB'),
    sleep(500),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('confReloadedA'),
    sleep(900),
    ink('cAReopened'),
    capLog('logConflict'),
    spyRead('msgConflict'),
    E('navigator.userAgent', 'userAgent'),
  ];
}
