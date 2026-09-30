// Step lists for qa-electron-runner.ps1. Coordinates are overlay CSS pixels (= display DIP, 1280×800 here).
const control = (expr, as) => ({ eval: expr, target: 'control', ...(as ? { as } : {}) });
const overlay = (expr, as) => ({ eval: expr, target: 'overlay', ...(as ? { as } : {}) });

// Geometry for injected strokes (overlay CSS px = DIP).
const line = (x1, y1, x2, y2, n = 12) => Array.from({ length: n + 1 }, (_, i) => [Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n)]);
const wave = (x1, y, x2, amp = 6, n = 24) => Array.from({ length: n + 1 }, (_, i) => [Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y + amp * Math.sin(i / 2))]);
const check = (x, y) => [[x, y], [x + 8, y + 10], [x + 16, y + 20], [x + 26, y + 6], [x + 36, y - 8], [x + 46, y - 22]];
const ellipse = (cx, cy, rx, ry, n = 36) => Array.from({ length: n + 1 }, (_, i) => [Math.round(cx + rx * Math.cos((2 * Math.PI * i) / n)), Math.round(cy + ry * Math.sin((2 * Math.PI * i) / n))]);

// Observations (read-only DOM / the control page's own IPC) and DOM clicks (not physical input).
const click = (selector) => ({ eval: `document.querySelector(${JSON.stringify(selector)}).click(), true`, target: 'overlay' });
const overlayState = (as, required = true) => ({ eval: `JSON.stringify({
  mode: [...document.querySelectorAll('[data-mode]')].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.mode ?? null,
  tool: document.getElementById('pen').getAttribute('aria-pressed') === 'true' ? 'pen' : document.getElementById('eraser').getAttribute('aria-pressed') === 'true' ? 'eraser' : null,
  mouse: document.getElementById('mouse').getAttribute('aria-pressed'),
  hint: document.getElementById('hint').textContent,
  card: !document.getElementById('card').hidden,
  cancel: !document.getElementById('cancel').hidden,
  disabled: [...document.querySelectorAll('#toolbar button')].filter((b) => b.disabled).length })`, target: 'overlay', as: `ov_${as}`, required });
const hook = control(`(() => { if (!window.__qaHooked) { window.__qa = []; window.__qaSessions = []; window.__qaMarks = [];
  window.lc.onSample((s) => window.__qa.push({ ...s, qa_received_at: new Date().toISOString() }));
  window.lc.onSession((s) => window.__qaSessions.push({ ...s, qa_at: new Date().toISOString() }));
  window.__qaHooked = true; } return true; })()`, 'hooked');
const mark = (label) => control(`(window.__qaMarks.push({ label: ${JSON.stringify(label)}, samples: window.__qa.length, at: new Date().toISOString() }), true)`);
const running = (as) => ({ waitEval: '(async () => { const s = await window.lc.sessionState(); return s.running && !s.starting ? JSON.stringify(s) : false })()', target: 'control', timeoutMs: 20000, as });
// A Stop now waits for the overlay's saves and retained frames (bounded at 60 s by the app).
const stopped = (as) => ({ waitEval: '(async () => { const s = await window.lc.sessionState(); return !s.running && !s.starting ? JSON.stringify(s) : false })()', target: 'control', timeoutMs: 70000, as });
const overlayReady = { waitEval: "document.readyState === 'complete'", target: 'overlay', timeoutMs: 15000 };
const listInk = (as) => control('(async () => JSON.stringify(await window.lc.listInk()))()', as);

// ---- QA-WIN-01 retest at 55478f0 -----------------------------------------------------------------------------
// The app's own report of each visible stroke (its self-test hook __lcOverlay: labelled as the app's claim and
// cross-checked against QA's screenshots and the app's retained composed frames), plus the latest sample.
const appView = (as) => overlay(`JSON.stringify((() => { const st = __lcOverlay.state(); const s = st.samples.at(-1);
  return { aligned: st.aligned, alignment: __lcOverlay.alignment(), doc: st.doc, pinned: st.pinned, hint: st.hint, gesture: st.gesture,
    last: s ? { seq: s.seq, sampled_at: s.sampled_at, state: s.state, raw: s.raw && { pixels_sha256: s.raw.pixels_sha256 },
      composed: s.composed && { ink_session: s.composed.ink_session, ink_revision: s.composed.ink_revision, ink_marks: s.composed.ink_marks, pixels_sha256: s.composed.pixels_sha256 } } : null }; })())`, `app_${as}`);
const at = (label) => [mark(label), { desktopShot: label }, appView(label)];
const edge = (expr, as) => ({ eval: expr, target: 'edge', ...(as ? { as } : {}) });
// One page change in QA's panel; every change also advances a tick far from all strokes, so a new frame is
// sampled even when the value under a stroke repeats.
const setText = (id, text) => edge(`(document.getElementById(${JSON.stringify(id)}).textContent = ${JSON.stringify(text)},
  window.__qaTick = (window.__qaTick || 0) + 1, document.getElementById('qa-tick').textContent = 't' + window.__qaTick, true)`);
const pen = (points, extra = {}) => ({ stroke: points, pointerType: 'pen', ...extra });
// Panel geometry: viewport CSS px + (0, 23) DIP is the screen position (measured from the 061efe2 screenshots and
// re-measured in each run from the 'panel' screenshot). Glyph boxes (screen DIP): sign 102..132 x 85..121,
// digit 122..152 x 145..181, cross 122..152 x 205..241, step 152..192 x 265..301, still text from 422 x 145..181,
// tick at 642 x 315 (outside every stroke region, which is the stroke's box + 8 DIP).
const RETEST = {
  still: ellipse(492, 163, 78, 24), sign: ellipse(117, 103, 22, 16), digit: ellipse(137, 163, 22, 16),
  crossA: [[100, 223], [110, 212], [120, 234], [130, 212], [140, 234], [150, 212]],
  crossB: [[150, 212], [160, 234], [170, 212], [180, 234], [190, 223]],
  cap: Array.from({ length: 32 }, (_, i) => [[155, 165, 175, 185, 189, 180, 170, 160][i % 8], i % 2 ? 296 : 270]),
  // Seven changes fill the 8 contexts; beyond the cap: 8 (counted), 8 (repeat), 9 (counted), 9 (repeat), 8 (return, counted), 0 (counted).
  capValues: ['1', '2', '3', '4', '5', '6', '7', '8', '8', '9', '9', '8', '0'],
};
const retest = () => [
  { window: 'edge', show: 'front' },
  edge(`(document.getElementById('qa-live').hidden = false, JSON.stringify({ view: { sx: screenX, sy: screenY, ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, scrollY },
    rects: Object.fromEntries(['qa-live', 'qa-sign', 'qa-digit', 'qa-cross', 'qa-step', 'qa-tick'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, [r.x, r.y, r.width, r.height]]; })) }))`, 'panelGeom'),
  { sleep: 1200 }, { desktopShot: 'panel' },
  control('(async () => (window.__qaIds = (await window.lc.listInk()).sessions.map((s) => s.id), JSON.stringify(window.__qaIds)))()', 'idsBefore4'),
  control("document.getElementById('start').click(), true"),
  running('session4'), overlayReady, { sleep: 2500 },
  click('[data-mode=WRITE]'), click('#pen'), overlayState('write4'),
  // A control stroke over text that never changes, and one stroke each over the sign and the digit.
  pen(RETEST.still), { sleep: 900 }, pen(RETEST.sign), { sleep: 900 }, pen(RETEST.digit), { sleep: 3500 },
  ...at('s4-before'),
  setText('qa-sign', '+'), { sleep: 3500 }, ...at('s4-sign-after'),
  // ASK while the sign stroke is changed: the card's note counts the strokes drawn dashed.
  click('[data-mode=ASK]'), pen(ellipse(127, 133, 60, 55)),
  { waitEval: "!document.getElementById('card').hidden", target: 'overlay', timeoutMs: 8000 },
  overlay("JSON.stringify({ text: document.getElementById('cardText').textContent, src: document.getElementById('crop').src, aligned: __lcOverlay.state().aligned, mode: __lcOverlay.state().mode })", 'askCard4'),
  click('#close'), overlayState('card4_closed'),
  setText('qa-sign', '−'), { sleep: 3500 }, ...at('s4-sign-reverted'),
  setText('qa-digit', '8'), { sleep: 3500 }, ...at('s4-digit-after'),
  setText('qa-digit', '3'), { sleep: 3500 }, ...at('s4-digit-reverted'),
  // Writing across a changed frame: pen down over "2", the page changes to "7" while the pen is held, writing continues.
  pen(RETEST.crossA, { release: false }), { sleep: 2500 }, mark('s4-cross-start'),
  setText('qa-cross', '7'), { sleep: 2500 }, mark('s4-cross-changed'), { desktopShot: 's4-cross-changed' },
  pen(RETEST.crossB, { continue: true }), { sleep: 3500 }, ...at('s4-cross-released'),
  setText('qa-cross', '2'), { sleep: 3500 }, ...at('s4-cross-reverted'),
  // The context cap: one held stroke over the step value; two points are written after each sampled change.
  pen(RETEST.cap.slice(0, 4), { release: false }), { sleep: 2500 }, mark('s4-cap-start'),
  ...RETEST.capValues.flatMap((v, i) => [setText('qa-step', v), { sleep: 2500 }, mark(`s4-cap-${i + 1}-${v}`), appView(`s4-cap-${i + 1}`),
    pen(RETEST.cap.slice(3 + 2 * i, 6 + 2 * i), { continue: true, release: false })]),
  pen(RETEST.cap.slice(29, 32), { continue: true }), { sleep: 3500 }, ...at('s4-cap-released'),
  { snapshot: 's4-before-stop' },
  control("document.getElementById('stop').click(), true"), stopped('stopped4'),
  control('(async () => JSON.stringify(await window.lc.recoveries()))()', 'recoveries4'),
  { snapshot: 'stopped4' }, mark('stopped4'),
  // Reopen the saved session-4 ink in a new session (the control page's own Open button for that entry).
  control("document.getElementById('start').click(), true"),
  running('session5'), overlayReady, { sleep: 2500 },
  control(`(async () => { const s = (await window.lc.listInk()).sessions; const i = s.findIndex((x) => !window.__qaIds.includes(x.id)); window.__qaOpened = s[i].id;
    [...document.querySelectorAll('#ink li')[i].querySelectorAll('button')].find((x) => x.textContent === 'Open').click(); return s[i].id; })()`, 'opened4Id'),
  { waitEval: "document.getElementById('session').textContent.startsWith('Showing saved ink')", target: 'control', timeoutMs: 10000, as: 'opened4' },
  { sleep: 3500 }, ...at('s5-reopened'), overlayState('reopened4'), { snapshot: 'reopened4' },
  control(`(async () => { const r = await window.lc.inkContexts(window.__qaOpened); if (r.ok) r.items = r.items.map((c) => ({ ...c, picture: c.picture ? c.picture.length : null })); return JSON.stringify(r); })()`, 'contexts4'),
  setText('qa-digit', '8'), { sleep: 3500 }, ...at('s5-digit-after'),
  setText('qa-digit', '3'), { sleep: 3500 }, ...at('s5-digit-reverted'),
  control("document.getElementById('stop').click(), true"), stopped('stopped5'),
  control('(async () => JSON.stringify(await window.lc.recoveries()))()', 'recoveries5'),
  { snapshot: 'stopped5' }, mark('stopped5'),
];

const setup = ({ courseUrl, notes, edgeProfile }) => [
  { consoleStart: notes, title: 'QA Lecture 7 notes', as: 'console' },
  { window: 'console', show: 'maximize' },
  { edgeStart: courseUrl, profile: edgeProfile, as: 'edge' },
  { window: 'edge', show: 'front' },
  { sleep: 1500 },
  { waitEval: "document.querySelectorAll('#displays li[role=option]').length > 0", target: 'control', timeoutMs: 20000 },
  control("(async () => (await window.lc.listDisplays()).map(d => ({ label: d.label, primary: d.primary, bounds: d.bounds, scale_factor: d.scale_factor, source_id: d.source_id })))()", 'displays'),
];

export const scenarios = {
  full: (p) => [
    ...setup(p),
    hook,
    mark('before-start'),
    { desktopShot: 'before-start' },
    // Start on the course page that is already visible: choose the display, press Start. No import.
    control("document.querySelector('#displays li[aria-selected=true]').click(), document.getElementById('start').click(), true", 'startClicked'),
    running('session1'),
    overlayReady,
    { sleep: 4000 },
    mark('edge-static'), { desktopShot: 'edge-static' },
    // Navigate: another real native window, back, scroll to new content, back to the top, then stay still.
    { window: 'console', show: 'front' }, { sleep: 3000 }, mark('console-front'), { desktopShot: 'console-front' },
    { window: 'edge', show: 'front' }, { sleep: 3000 }, mark('edge-back'),
    { eval: 'scrollBy(0, 420), scrollY', target: 'edge', as: 'scrolled' }, { sleep: 3000 }, mark('edge-scrolled'), { desktopShot: 'edge-scrolled' },
    { eval: 'scrollTo(0, 0), scrollY', target: 'edge' }, { sleep: 3500 }, mark('edge-top'),
    { desktopShot: 'idle-a' }, { sleep: 4000 }, mark('idle'), { desktopShot: 'idle-b' },
    overlayState('nav'),
    // WRITE: a mouse drag with Mouse off draws nothing; then Mouse on and a short draft.
    click('[data-mode=WRITE]'), overlayState('write'),
    { stroke: line(60, 470, 250, 470), pointerType: 'mouse' }, { sleep: 500 }, overlayState('mouse_off'), { snapshot: 'mouse-off' },
    click('#mouse'), overlayState('mouse_on'),
    { stroke: wave(50, 312, 560), pointerType: 'mouse' }, { sleep: 800 },
    { stroke: check(300, 545), pointerType: 'mouse' }, { sleep: 800 },
    { stroke: line(90, 392, 320, 398, 14), pointerType: 'pen' }, { sleep: 1800 },
    { snapshot: 'draft' }, mark('draft'), { desktopShot: 'draft' },
    // Partial erase across the first stroke, then undo and redo.
    click('#eraser'), { stroke: line(300, 285, 300, 340, 10), pointerType: 'mouse' }, { sleep: 900 }, { snapshot: 'erase' }, overlayState('erase'),
    click('#undo'), { sleep: 900 }, { snapshot: 'undo' },
    click('#redo'), { sleep: 900 }, { snapshot: 'redo' },
    click('#pen'),
    // ASK: circle a region -> card, back to WRITE; ASK again and Cancel -> WRITE.
    click('[data-mode=ASK]'), overlayState('ask'),
    { stroke: ellipse(165, 557, 150, 45), pointerType: 'mouse' },
    { waitEval: "!document.getElementById('card').hidden", target: 'overlay', timeoutMs: 8000 },
    overlayState('ask_finished'),
    overlay("JSON.stringify({ text: document.getElementById('cardText').textContent, src: document.getElementById('crop').src })", 'askCard'),
    click('#close'), overlayState('card_closed'),
    click('[data-mode=ASK]'), overlayState('ask2'), click('#cancel'), overlayState('ask_cancelled'),
    // Continue writing.
    { stroke: line(45, 487, 230, 487), pointerType: 'mouse' }, { sleep: 1800 }, { snapshot: 'continued' }, mark('continued'),
    // Alignment under real content movement: scroll the course page under the ink, then back.
    { eval: 'scrollBy(0, 300), scrollY', target: 'edge' }, { sleep: 3000 }, mark('ink-scrolled'), overlayState('ink_scrolled'),
    { desktopShot: 'ink-scrolled' }, appView('ink-scrolled'),
    { eval: 'scrollTo(0, 0), scrollY', target: 'edge' }, { sleep: 3500 }, mark('ink-back'), overlayState('ink_back'), appView('ink-back'),
    listInk('ink1'),
    // Stop while a long pen stroke is still being written (its context picture is large, so its save takes
    // longer), with a new pen stroke sent right behind the Stop click, without waiting (raceStop).
    { stroke: line(30, 70, 1180, 720, 16), pointerType: 'pen', release: false },
    { raceStop: line(80, 700, 400, 705, 12), pointerType: 'pen', releaseFirst: [1180, 720] },
    stopped('stopped1'),
    control('(async () => JSON.stringify(await window.lc.recoveries()))()', 'recoveries1'),
    { snapshot: 'stopped' }, mark('stopped'),
    // Reopen the saved ink in a new session and keep editing it.
    control("document.getElementById('start').click(), true"),
    running('session2'), overlayReady, { sleep: 2500 },
    control("(() => { const b = [...document.querySelectorAll('#ink li button')].find((x) => x.textContent === 'Open' && !x.disabled); b.click(); return true; })()"),
    { waitEval: "document.getElementById('session').textContent.startsWith('Showing saved ink')", target: 'control', timeoutMs: 10000, as: 'opened' },
    { sleep: 1500 }, overlayState('reopened'), { snapshot: 'reopened' },
    click('[data-mode=WRITE]'), click('#mouse'), click('#undo'), { sleep: 900 },
    { stroke: line(45, 330, 200, 330, 10), pointerType: 'mouse' }, { sleep: 1800 }, { snapshot: 'reopen-edit' },
    // W-I8 shape: a long stroke is lifted (its save starts), then Stop and a new pen stroke right behind it.
    { stroke: line(30, 80, 1170, 730, 16), pointerType: 'pen' },
    { raceStop: line(90, 690, 420, 694, 12), pointerType: 'pen' },
    stopped('stopped2'),
    control('(async () => JSON.stringify(await window.lc.recoveries()))()', 'recoveries2'),
    { snapshot: 'stopped2' },
    // Focused Start regressions through the control page's own calls (what the buttons invoke).
    control("(async () => { const d = (await window.lc.listDisplays()).find((x) => x.primary).source_id; return JSON.stringify(await Promise.all([window.lc.start(d), window.lc.start(d)])); })()", 'doubleStart'),
    running('session3'), { targets: 'app', as: 'targetsDouble' },
    control('(async () => { await window.lc.stop(); return true; })()'), stopped('stopped3'),
    control("(async () => { const d = (await window.lc.listDisplays()).find((x) => x.primary).source_id; const p = window.lc.start(d); await window.lc.stop(); const r = await p; await new Promise((res) => setTimeout(res, 1500)); return JSON.stringify({ r, state: await window.lc.sessionState() }); })()", 'stopDuringStart'),
    { targets: 'app', as: 'targetsAfterCancel' },
    ...retest(),
    control('JSON.stringify({ samples: window.__qa, sessions: window.__qaSessions, marks: window.__qaMarks })', 'timeline'),
    listInk('inkFinal'),
    { closeApp: true },
  ],

  smoke: (p) => [
    ...setup(p).slice(0, 5),
    { sleep: 4000 },
    { targets: 'app', as: 'appTargets' },
    { eval: "JSON.stringify({ href: location.href, n: document.querySelectorAll('#displays li').length, html: document.getElementById('displays').innerHTML.slice(0, 200) })", target: 'control', as: 'controlDom', required: false },
    ...setup(p).slice(5),
    control('(async () => window.lc.sessionState())()', 'state0'),
    { eval: 'JSON.stringify({ w: innerWidth, h: innerHeight, y: scrollY, title: document.title })', target: 'edge', as: 'edgeView' },
    { desktopShot: 'smoke-edge' },
    { window: 'console', show: 'front' },
    { sleep: 800 },
    { desktopShot: 'smoke-console' },
    { window: 'edge', show: 'front' },
    { sleep: 800 },
    { desktopShot: 'smoke-edge2' },
    { closeApp: true },
  ],
};
