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

// ---- frame-bound ink originals, relaunch and context-picture recovery (8e2094e) -------------------------------------
// hashTree roots inside this run's user data; frames only at the checkpoints that ask for them.
const ROOTS = ['ink', 'captures', 'qa-aside'];
const hashes = (label, frames = false) => ({ hashTree: ROOTS, frames, as: `h_${label}` });
// The ink is settled: saved, no picture pending, no gesture, not saving.
// Also: nothing waits for retention and the latest sample composes this revision, so its retained frame exists.
const settled = (label) => ({ waitEval: `(() => { const s = __lcOverlay.state(); return s.unsaved === null && s.pendingImages === 0 && !s.gesture && s.saveText !== 'Saving…'
  && s.retention.deferred === 0 && s.samples.at(-1)?.composed?.ink_revision === s.doc.revision
  && JSON.stringify({ doc: s.doc, saveText: s.saveText, retention: s.retention }); })()`, target: 'overlay', timeoutMs: 20000, as: `saved_${label}` });
// 3.5 s > the 2 s retention interval + the 1 s sampling period, so each state's revision gets a retained frame.
const state = (label) => [{ sleep: 3500 }, settled(label), mark(label), appView(label), overlayState(label), { snapshot: label }, hashes(label)];
const recoveries = (as) => control('(async () => JSON.stringify(await window.lc.recoveries()))()', as);
const keptButton = (text) => ({ ...control(`([...document.querySelectorAll('#keptList li button')].find((b) => b.textContent === ${JSON.stringify(text)})?.click(), true)`), required: false });
const keptDom = (as) => control(`JSON.stringify({ hidden: document.getElementById('kept').hidden, text: document.getElementById('keptList').textContent,
  buttons: [...document.querySelectorAll('#keptList li button')].map((b) => b.textContent), session: document.getElementById('session').textContent })`, as);
const inkHook = control(`(() => { if (!window.__qaHooked) { window.__qa = []; window.__qaSessions = []; window.__qaMarks = []; window.__qaInkSaved = [];
  window.lc.onSample((s) => window.__qa.push({ ...s, qa_received_at: new Date().toISOString() }));
  window.lc.onSession((s) => window.__qaSessions.push({ ...s, qa_at: new Date().toISOString() }));
  window.lc.onInkSaved(() => window.__qaInkSaved.push(new Date().toISOString())); window.__qaHooked = true; } return true; })()`, 'hooked');
// Pictures view data for the saved session, with each shown picture's own sha256 computed in the page.
const contexts = (as) => control(`(async () => { const r = await window.lc.inkContexts(window.__qaD); if (r.ok) for (const i of r.items) if (i.picture) {
  const b = Uint8Array.from(atob(i.picture.slice(22)), (c) => c.charCodeAt(0));
  i.picture_sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join(''); i.picture = i.picture.length; }
  return JSON.stringify(r); })()`, as);
const timeline = (as) => control('JSON.stringify({ samples: window.__qa, sessions: window.__qaSessions, marks: window.__qaMarks, inkSaved: window.__qaInkSaved })', as);
const startSession = (as) => [control("document.querySelector('#displays li[aria-selected=true]').click(), document.getElementById('start').click(), true"), running(as), overlayReady, { sleep: 2500 }];
// Opens the one saved session through its own Open button (the list must hold exactly that session).
const openSaved = (as) => [control(`(async () => { const s = (await window.lc.listInk()).sessions; if (s.length !== 1) throw new Error('saved sessions: ' + s.length);
  if (window.__qaD && window.__qaD !== s[0].id) throw new Error('another session'); window.__qaD = s[0].id;
  [...document.querySelectorAll('#ink li')[0].querySelectorAll('button')].find((b) => b.textContent === 'Open').click(); return s[0].id; })()`, as),
  { waitEval: "document.getElementById('session').textContent.startsWith('Showing saved ink')", target: 'control', timeoutMs: 10000 }];
const stopSession = (as) => [control("document.getElementById('stop').click(), true"), stopped(as)];
// Stroke geometry (overlay DIP): clear of the cursor (272, 381), the toolbar (top right), the card (bottom right), the taskbar.
const INK = {
  wave: wave(50, 312, 560), check: check(300, 545), line: line(360, 440, 600, 446, 14), erase: line(300, 285, 300, 340, 10),
  ask: ellipse(165, 557, 150, 45), c1: line(45, 487, 230, 487), c2: line(60, 600, 240, 606, 14), relaunch: line(420, 600, 600, 606, 14),
  // The corruption stroke is written twice with identical points over static page content (context crop 192..408 x 598..722).
  same: ellipse(300, 660, 60, 14),
};
const newestContextSha = control(`(async () => { const r = await window.lc.inkContexts(window.__qaD); const n = Math.max(...r.items.map((i) => i.stroke));
  const mine = r.items.filter((i) => i.stroke === n);
  if (mine.length !== 1 || mine[0].reason !== 'writing_started' || mine[0].picture_state !== 'shown') throw new Error('unexpected contexts ' + JSON.stringify(mine.map((i) => [i.reason, i.picture_state])));
  return mine[0].image.sha256; })()`, 'pc_sha');

// ---- the app's development capture link to the local test service (c4c84a5) ----------------------------------------
const ROOTS_P = ['ink', 'captures', 'capture-host'];
const hashesP = (label, frames = false) => ({ hashTree: ROOTS_P, frames, as: `h_${label}` });
const stateP = (label) => [{ sleep: 3500 }, settled(label), mark(label), appView(label), overlayState(label), { snapshot: label }, hashesP(label)];
// Every link status change the control page receives, with its receipt time (read-only IPC events).
const linkHook = control(`(() => { if (!window.__qaLinkHooked) { window.__qaLink = [];
  window.lc.onLink((l) => window.__qaLink.push({ ...l, qa_at: new Date().toISOString() })); window.__qaLinkHooked = true; } return true; })()`, 'link_hooked');
const linkNow = (as) => control(`(async () => JSON.stringify({ at: new Date().toISOString(), l: await window.lc.linkState(), ai: document.getElementById('ai').textContent,
  line: document.getElementById('link').textContent, hidden: document.getElementById('link').hidden, session: document.getElementById('session').textContent }))()`, as);
const linkUntil = (cond, as, ms = 40000) => ({ waitEval: `(async () => { const l = await window.lc.linkState(); return l && l.mode === 'development' && (${cond}) && JSON.stringify({ at: new Date().toISOString(), l }); })()`,
  target: 'control', timeoutMs: ms, as, required: false });
const linkEvents = (as) => control('JSON.stringify(window.__qaLink || [])', as);
const waitDisplays = { waitEval: "document.querySelectorAll('#displays li[role=option]').length > 0", target: 'control', timeoutMs: 20000 };
const showPanel = edge("(document.getElementById('qa-live').hidden = false, true)");
const askOnce = (as) => [click('[data-mode=ASK]'), pen(ellipse(165, 557, 150, 45)),
  { waitEval: "!document.getElementById('card').hidden", target: 'overlay', timeoutMs: 8000 },
  overlay("JSON.stringify({ text: document.getElementById('cardText').textContent, revision: __lcOverlay.state().doc.revision, mode: __lcOverlay.state().mode })", as),
  click('#close')];

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

  // Frame-bound ink originals across the editing loop, a clean exit and relaunch of the saved session, and one controlled
  // context-picture corruption recovery in this run's own fresh profile. Every stroke is DevTools-injected pen input.
  ink: (p) => [
    { edgeStart: p.courseUrl, profile: p.edgeProfile, as: 'edge' },
    { window: 'edge', show: 'front' },
    { sleep: 1500 },
    { waitEval: "document.querySelectorAll('#displays li[role=option]').length > 0", target: 'control', timeoutMs: 20000 },
    control("(async () => (await window.lc.listDisplays()).map(d => ({ label: d.label, primary: d.primary, bounds: d.bounds, scale_factor: d.scale_factor, source_id: d.source_id })))()", 'displays'),
    inkHook, hashes('fresh', true), listInk('ink0'),
    mark('before-start'), { desktopShot: 'before-start' },
    ...startSession('session1'), { sleep: 1500 },
    click('[data-mode=WRITE]'), click('#pen'), overlayState('write_mode'),
    pen(INK.wave), { sleep: 800 }, pen(INK.check), { sleep: 800 }, pen(INK.line),
    ...state('write'),
    click('#eraser'), pen(INK.erase), ...state('erase'),
    click('#undo'), ...state('undo'),
    click('#redo'), ...state('redo'),
    click('#pen'),
    mark('ask-start'),
    click('[data-mode=ASK]'), overlayState('ask'), pen(INK.ask),
    { waitEval: "!document.getElementById('card').hidden", target: 'overlay', timeoutMs: 8000 },
    overlayState('ask_finished'),
    overlay("JSON.stringify({ text: document.getElementById('cardText').textContent, src: document.getElementById('crop').src, revision: __lcOverlay.state().doc.revision })", 'askCard'),
    click('#close'), overlayState('card_closed'),
    click('[data-mode=ASK]'), overlayState('ask2'), click('#cancel'), overlayState('ask_cancelled'),
    ...state('ask-done'),
    // Continue writing; the second stroke is held across a retained frame (uncommitted in the composition), then finished.
    pen(INK.c1), pen(INK.c2.slice(0, 8), { release: false }), { sleep: 3000 }, appView('held'), pen(INK.c2.slice(7), { continue: true }),
    ...state('continued'),
    ...stopSession('stopped1'), recoveries('recoveries1'), { snapshot: 'stopped1' }, hashes('before-close', true), timeline('timeline1'),
    { closeApp: true }, hashes('after-exit', true),
    // Relaunch the same app with the same profile; reopen the saved session and keep editing it.
    { launchApp: true, as: 'app2' },
    { waitEval: "document.querySelectorAll('#displays li[role=option]').length > 0", target: 'control', timeoutMs: 20000 },
    inkHook, hashes('relaunched', true), listInk('ink2'), keptDom('kept_relaunched'),
    { window: 'edge', show: 'front' },
    ...startSession('session2'),
    ...openSaved('opened2'),
    ...state('reopened2'), contexts('contexts_reopened2'),
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.relaunch), ...state('relaunch-edit'),
    // Controlled corruption (TEST entry in this fresh profile only): write the same stroke twice over unchanged content, and
    // between the two replace the first stroke's stored picture with same-length foreign bytes.
    pen(INK.same), ...state('c1'),
    newestContextSha,
    { plantFile: 'ink/context/{value}.png', fromValue: 'pc_sha', fill: 'QA-TEST-CORRUPTION ', as: 'planted' },
    contexts('contexts_planted'), hashes('planted'),
    pen(INK.same), { sleep: 3500 },
    { waitEval: '__lcOverlay.state().unsaved', target: 'overlay', timeoutMs: 20000, as: 'unsaved_c2', required: false },
    overlay("JSON.stringify((() => { const s = __lcOverlay.state(); return { unsaved: s.unsaved, saveText: s.saveText, hint: s.hint, pendingImages: s.pendingImages, doc: s.doc }; })())", 'ov_failed'),
    appView('c2-failed'), recoveries('recoveries_failed'), keptDom('kept_failed'), { snapshot: 'c2-failed' }, hashes('c2-failed'),
    // Retry while the address is still occupied: refused again, the entry untouched.
    keptButton('Retry saving'), { sleep: 2500 }, recoveries('recoveries_retry_occupied'), keptDom('kept_retry_occupied'), hashes('retry-occupied'),
    // Stop with the ink still kept: the app writes its spare copy (the Export payload) into the test-owned temp folder.
    ...stopSession('stopped2'), recoveries('recoveries_stopped2'), keptDom('kept_stopped2'),
    { copyTree: 'apptemp', path: 'Learning Companion unsaved ink', to: 'spare' }, hashes('stopped2'),
    // Move the TEST entry aside inside the profile, then Retry saving.
    { moveAside: 'ink/context/{value}.png', fromValue: 'pc_sha', expectValue: 'planted', to: 'qa-aside', as: 'movedAside', required: false },
    keptButton('Retry saving'),
    { waitEval: '(async () => (await window.lc.recoveries()).length === 0)()', target: 'control', timeoutMs: 15000, required: false },
    recoveries('recoveries_retried'), keptDom('kept_retried'), hashes('retried'), { snapshot: 'retried' }, listInk('ink_retried'),
    // Reopen after the recovery and look at every picture again.
    ...startSession('session3'),
    ...openSaved('opened3'),
    ...state('reopened3'), contexts('contexts_final'),
    ...stopSession('stopped3'), recoveries('recoveries3'), timeline('timeline2'), listInk('inkFinal'),
    { closeApp: true }, hashes('final', true),
  ],

  // One changed-workflow pass of the development capture link (next-qa-task.md): default off; Start on the visible course
  // with automatic retained frames to the local test service; one short ink loop; Stop; relaunch the same profile and
  // reopen; one controlled failure (the test service unavailable). Strokes are DevTools-injected pen events (synthetic).
  parent: (p) => [
    ...setup(p), inkHook, linkHook,
    // 1. Default off (this first launch has no development configuration): capture works locally and nothing is sent.
    linkNow('link_off'), hashesP('off0'), { children: true, as: 'kids_off0', required: false },
    ...startSession('s0'), { sleep: 4500 }, overlayState('off_running'), linkNow('link_off_running'), { children: true, as: 'kids_off1', required: false },
    ...stopSession('s0_stopped'), hashesP('off1'), { closeApp: true },
    // The explicit development configuration, with a QA-minted actor checked pristine in lc_p0_test; nothing before Start.
    { seedLinkRecord: true, actor: p.actor, as: 'seed' },
    { launchApp: true, as: 'app-link', link: 'main' }, waitDisplays, inkHook, linkHook, { sleep: 3000 },
    linkNow('link_idle'), { children: true, as: 'kids_pre', required: false }, hashesP('pre-start'),
    // 2. Start on the visible QA course (no import); visible changes on the page, the QA panel and a second native window.
    { window: 'edge', show: 'front' }, showPanel, { sleep: 1200 }, mark('before-start'), { desktopShot: 'before-start' },
    ...startSession('s1'), linkUntil("l.state === 'sending'", 'link_sending'), { children: true, as: 'kids_s1', required: false },
    { sleep: 3500 }, ...at('c0-start'), linkNow('link_c0'),
    setText('qa-sign', '+'), { sleep: 3500 }, ...at('c1-panel'), linkNow('link_c1'),
    { window: 'console', show: 'front' }, { sleep: 3500 }, ...at('c2-console'), linkNow('link_c2'),
    { window: 'edge', show: 'front' }, { eval: 'scrollBy(0, 420), scrollY', target: 'edge' }, { sleep: 3500 }, ...at('c3-scroll'), linkNow('link_c3'),
    { eval: 'scrollTo(0, 0), scrollY', target: 'edge' }, { sleep: 3500 }, ...at('c4-back'),
    linkUntil('l.stored >= 5 && l.unknown === 0', 'link_after_changes'),
    // 3. One short ink loop; no stroke asks anything; the card says no AI is connected.
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.wave), { sleep: 800 }, pen(INK.check), { sleep: 800 }, pen(INK.line), ...stateP('write'),
    click('#eraser'), pen(INK.erase), ...stateP('erase'), click('#undo'), ...stateP('undo'), click('#redo'), ...stateP('redo'), click('#pen'),
    ...askOnce('askCard'), overlayState('ask_finished'),
    click('[data-mode=ASK]'), overlayState('ask2'), click('#cancel'), overlayState('ask_cancelled'), ...stateP('ask-done'),
    pen(INK.c1), ...stateP('continued'),
    linkUntil('l.unknown === 0 && l.not_sent === 0 && l.stored > 0', 'link_pre_stop'), linkNow('link_pre_stop_now'),
    { copyTree: 'userdata', path: 'capture-host', to: 'coord-pre-stop', required: false },
    // 4. Stop through the app: read the link status immediately after the click (the synchronous latch), then the end.
    control("document.getElementById('stop').click(), true"), linkNow('link_stop_latched'),
    stopped('stopped1'), linkUntil("l.state === 'stopped'", 'link_stopped1', 65000), { children: true, as: 'kids_stopped1', required: false },
    { copyTree: 'userdata', path: 'capture-host', to: 'coord-stopped1', required: false }, hashesP('stopped1', true), { snapshot: 'stopped1' },
    linkEvents('link_events1'), timeline('timeline1'), { closeApp: true }, { endHungApp: true, as: 'hung1' }, hashesP('after-close1', true),
    // 5. Relaunch the same profile: read/control-only recovery (no replay, no fresh consent), then reopen and continue.
    { launchApp: true, as: 'app-relaunch', link: 'main' }, waitDisplays, inkHook, linkHook, { sleep: 10000 },
    linkNow('link_relaunched'), keptDom('kept_relaunched'), { children: true, as: 'kids_relaunch', required: false }, hashesP('relaunched', true),
    { window: 'edge', show: 'front' },
    ...startSession('s2'), linkUntil("l.state === 'sending'", 'link_sending2'), { children: true, as: 'kids_s2', required: false },
    ...openSaved('opened2'), ...stateP('reopened2'),
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.relaunch), ...stateP('reopen-edit'),
    linkUntil('l.stored >= 1 && l.unknown === 0 && l.not_sent === 0', 'link_healthy'),
    ...stopSession('stopped2'), linkUntil("l.state === 'stopped'", 'link_stopped2', 65000), { children: true, as: 'kids_stopped2', required: false },
    { copyTree: 'userdata', path: 'capture-host', to: 'coord-stopped2', required: false }, { snapshot: 'stopped2' },
    linkEvents('link_events2'), timeline('timeline2'), { closeApp: true }, { endHungApp: true, as: 'hung2' }, hashesP('after-close2', true),
    // 6. Controlled failure: the same host pointed at a test service that does not exist (healthy control: steps 2-5).
    { launchApp: true, as: 'app-fail', link: 'unavail' }, waitDisplays, inkHook, linkHook, { sleep: 3000 },
    linkNow('link_fail_idle'), { children: true, as: 'kids_fail_idle', required: false },
    ...startSession('s3'), linkUntil("l.state !== 'connecting' && l.state !== 'idle'", 'link_fail', 40000), { children: true, as: 'kids_fail', required: false },
    { sleep: 4000 }, ...at('f1'), linkNow('link_fail_now'),
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.c2), ...stateP('fail-write'),
    ...askOnce('askFail'), linkNow('link_fail_after_ask'), hashesP('fail', true),
    ...stopSession('stopped3'), { sleep: 3000 }, linkNow('link_fail_stopped'), { children: true, as: 'kids_fail_stopped', required: false },
    { copyTree: 'userdata', path: 'capture-host', to: 'coord-fail', required: false }, linkEvents('link_events3'), timeline('timeline3'),
    { closeApp: true }, { endHungApp: true, as: 'hung3' }, hashesP('final', true),
  ],

  // Diagnostic for the quit that did not end after a linked Stop (run 1 of the parent pass): A) link configured, never
  // started; B) Start on the QA course, Stop, then close. Windows and children are listed before and after each close.
  parentquit: (p) => [
    ...setup(p), { closeApp: true },
    { seedLinkRecord: true, actor: p.actor, as: 'seed' },
    { launchApp: true, as: 'app-a', link: 'main' }, waitDisplays, linkHook, { sleep: 3000 }, linkNow('a_idle'),
    { targets: 'app', as: 'a_targets_before' }, { children: true, as: 'a_kids_before', required: false },
    { closeApp: true }, { targets: 'app', as: 'a_targets_after', required: false }, { children: true, as: 'a_kids_after', required: false },
    { launchApp: true, as: 'app-b', link: 'main' }, waitDisplays, linkHook, { sleep: 3000 }, linkNow('b_idle'),
    { window: 'edge', show: 'front' }, ...startSession('b1'), linkUntil("l.state === 'sending'", 'b_sending'), { sleep: 6000 },
    linkNow('b_before_stop'), ...stopSession('b_stopped'), linkUntil("l.state === 'stopped'", 'b_link_stopped', 65000),
    { sleep: 3000 }, { targets: 'app', as: 'b_targets_before' }, { children: true, as: 'b_kids_before', required: false },
    { closeApp: true }, { targets: 'app', as: 'b_targets_after', required: false }, { children: true, as: 'b_kids_after', required: false },
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
