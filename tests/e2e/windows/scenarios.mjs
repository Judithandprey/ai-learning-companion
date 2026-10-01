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

// ---- QA-WIN-03/04 retest (86d2405) ------------------------------------------------------------------------------------
// The open ASK card as the page shows it: its text, the selected picture (hashed in the page, never exported) and the ink.
const cardRead = (as) => overlay(`(async () => { const src = document.getElementById('crop').src;
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const st = __lcOverlay.state();
  return JSON.stringify({ at: new Date().toISOString(), shown: !document.getElementById('card').hidden, text: document.getElementById('cardText').textContent,
    card_all_text: document.getElementById('card').textContent, crop_chars: src.length, crop_is_png: src.startsWith('data:image/png;base64,'), crop_sha256: h,
    mode: st.mode, revision: st.doc.revision, hint: document.getElementById('hint').textContent }); })()`, as);
const cardShown = { waitEval: "!document.getElementById('card').hidden", target: 'overlay', timeoutMs: 8000 };
// The last status the app notified says storing, with nothing unknown or unsent (a send still waiting for its answer is
// not in any status: the app notifies only when a send returns).
const QUIET = 'l.storing === true && l.unknown === 0 && l.not_sent === 0';
const coordCopy = (to) => ({ copyTree: 'userdata', path: 'capture-host', to, required: false });
const kidsOf = (as) => ({ children: true, as, required: false });
const failSettled = (as) => linkUntil("l.state !== 'connecting' && l.state !== 'idle' && l.state !== 'stopped'", as, 40000);

// QA-WIN-05 (476fd1f): connected and live, no send out, nothing unknown or unsent (the status this candidate notifies
// before and after each send).
const SETTLED5 = "l.state === 'sending' && l.awaiting === false && l.unknown === 0 && l.not_sent === 0";
const panelHidden = (hidden) => edge(`(document.getElementById('qa-live').hidden = ${hidden}, true)`);

// ---- managed-subscription ASK acceptance (ADR 0003): QA's generated surface, its test ink and the ASK selection -------
// surface.html draws twelve cards at these fixed SCREEN positions (DIP); the same numbers are in that page.
const SURFACE = { x: 40, y: 90, cols: 4, rows: 3, w: 190, h: 150, gap: 20 };
const cardRect = (i) => ({ x: SURFACE.x + (i % SURFACE.cols) * (SURFACE.w + SURFACE.gap), y: SURFACE.y + Math.floor(i / SURFACE.cols) * (SURFACE.h + SURFACE.gap), width: SURFACE.w, height: SURFACE.h });
// The test ink: one pen ellipse just inside each chosen card (the digits end about 10 DIP inside it). The ASK selection:
// one ellipse around the whole grid; its region (the stroke's box + 8 DIP) is 17..883 x 72..598 DIP, below the heading.
const circleCard = (i) => { const r = cardRect(i); return ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2 - 7, r.height / 2 - 9, 48); };
const SURFACE_ASK = ellipse(SURFACE.x + (SURFACE.cols * (SURFACE.w + SURFACE.gap) - SURFACE.gap) / 2, SURFACE.y + (SURFACE.rows * (SURFACE.h + SURFACE.gap) - SURFACE.gap) / 2, 425, 255, 60);
const SURFACE_REGION_PX = [17 * 2, 72 * 2, 883 * 2, 598 * 2]; // the ASK region in physical px at scale 2 (checked against the display in the run)
// The page's own account of what it drew (for the harness only). Refused unless the page is the whole visible display
// (no title bar or taskbar) at the display's scale, with every card at its planned screen place.
const surfaceTruth = (as) => edge(`(() => { const t = JSON.parse(window.__qaSurfaceTruth());
  if (!t.fits || !t.full_screen || t.viewport.dpr !== 2 || t.viewport.screen[0] !== 1280 || t.viewport.screen[1] !== 800) throw new Error('the surface is not the whole 1280x800 display at scale 2: ' + JSON.stringify([t.viewport, t.viewport_offset_dip]));
  return JSON.stringify(t); })()`, as);
// Every stroke of the ink is drawn solid (the app draws a stroke dashed while it cannot verify what is under it).
const inkSolid = { waitEval: "(() => { const a = Object.values(__lcOverlay.state().aligned || {}); return a.length > 0 && a.every((x) => x === 'verified'); })()", target: 'overlay', timeoutMs: 15000 };

// ---- managed-subscription ASK: UI driver (app candidate c977df5 and later) --------------------------------------------
// The question QA asks about its surface (no value of the surface in it), and the assistance level that may state it.
export const SURFACE_QUESTION = 'I circled two cards with my pen. Name only those two cards. For each one, write one line: the number written in the card, then the color and the shape next to the number.';
// The control window's subscription section as the page shows it, with the main process's own status.
const subHook = control(`(() => { if (!window.__qaSubHooked) { window.__qaSub = [];
  window.lc.onSub((x) => window.__qaSub.push({ ...x, qa_at: new Date().toISOString() })); window.__qaSubHooked = true; } return true; })()`, 'sub_hooked');
const subNow = (as) => control(`(async () => { const t = (id, text = true) => { const e = document.getElementById(id); return e ? { ...(text ? { text: e.textContent } : {}), hidden: e.hidden || e.closest('[hidden]') !== null, disabled: e.disabled === true } : null; };
  const m = document.getElementById('subModel');
  return JSON.stringify({ at: new Date().toISOString(), s: await window.lc.subState(), section: t('subscription', false), state: t('subState'), quota: t('subQuota'), check: t('subCheck'), login: t('subLogin'),
    login_cancel: t('subLoginCancel'), model_row: t('subModelRow'), options: m ? [...m.options].map((o) => [o.value, o.textContent, o.selected]) : null, ai: document.getElementById('ai').textContent,
    session: document.getElementById('session').textContent }); })()`, as);
const subUntil = (cond, as, ms = 40000) => ({ waitEval: `(async () => { const s = await window.lc.subState(); return s && s.mode === 'managed' && (${cond}) && JSON.stringify({ at: new Date().toISOString(), s }); })()`,
  target: 'control', timeoutMs: ms, as });
const subEvents = (as) => control('JSON.stringify(window.__qaSub || [])', as);
const subCheck = control("document.getElementById('subCheck').click(), true");
// The ASK card. Every change of its badge, status, answer and buttons is logged in the page with its time, so that "the
// question that was just asked ended" is read from what happened after that press, never from an earlier outcome.
const askHook = overlay(`(() => { if (window.__qaAskHooked) return true; const g = (id) => document.getElementById(id); window.__qaAsk = [];
  const snap = () => window.__qaAsk.push({ at: new Date().toISOString(), badge: g('badge').textContent, status: g('askStatus').hidden ? null : g('askStatus').textContent,
    answer_shown: !g('answerBox').hidden, cancel_shown: !g('askCancel').hidden, save_shown: !g('askSave').hidden, form_shown: !g('askForm').hidden, submit_disabled: g('askSubmit').disabled });
  new MutationObserver(snap).observe(g('card'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  snap(); window.__qaAskHooked = true; return true; })()`);
// The selection is retained and the form is ready (the app prefills the question only then).
const formReady = { waitEval: "(() => { const g = (id) => document.getElementById(id); return !g('card').hidden && !g('askForm').hidden && g('question').value.length > 0 && !g('askSubmit').disabled; })()", target: 'overlay', timeoutMs: 15000 };
const askSet = (question, assistance) => overlay(`(() => { const q = document.getElementById('question'); q.value = ${JSON.stringify(question)};
  const r = document.querySelector('input[name="assistance"][value="${assistance}"]'); r.checked = true; window.__qaAskMark = window.__qaAsk.length;
  return JSON.stringify({ question_chars: q.value.length, assistance: document.querySelector('input[name="assistance"]:checked').value }); })()`);
// ONE press of Ask. Nothing in a scenario presses it again for the same question.
const askPress = click('#askSubmit');
// The outcome of the question asked by the last press: after it, the card no longer offers Cancel and shows either the
// answer, or "no answer shown", or "Not sent".
const askOutcome = (as, ms) => ({ waitEval: `(() => { const g = (id) => document.getElementById(id); const since = window.__qaAsk.slice(window.__qaAskMark);
  const st = g('askStatus').hidden ? '' : g('askStatus').textContent;
  const ended = g('askCancel').hidden && !g('askSubmit').disabled && (!g('answerBox').hidden || /no answer shown/.test(g('badge').textContent) || /^Not sent/.test(st));
  return since.length > 0 && ended && JSON.stringify({ at: new Date().toISOString(), badge: g('badge').textContent, status: st }); })()`, target: 'overlay', timeoutMs: ms, as, required: false });
const askWaiting = (as) => ({ waitEval: "(() => { const g = (id) => document.getElementById(id); return !g('askCancel').hidden && JSON.stringify({ at: new Date().toISOString(), badge: g('badge').textContent, status: g('askStatus').textContent }); })()",
  target: 'overlay', timeoutMs: 10000, as, required: false });
// The whole card as shown. The picture is hashed in the page from its own bytes (never exported).
const askRead = (as) => overlay(`(async () => { const g = (id) => document.getElementById(id); const img = g('crop');
  const bytes = img.src.startsWith('data:image/png;base64,') ? Uint8Array.from(atob(img.src.slice(22)), (c) => c.charCodeAt(0)) : null;
  const sha = bytes ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('') : null;
  return JSON.stringify({ at: new Date().toISOString(), card_shown: !g('card').hidden, badge: g('badge').textContent, card_text: g('cardText').textContent,
    status: g('askStatus').hidden ? null : g('askStatus').textContent, answer_shown: !g('answerBox').hidden, answer: g('answerBox').hidden ? null : g('answer').textContent,
    answer_box_text: g('answerBox').hidden ? null : g('answerBox').textContent, answer_child_elements: g('answer').children.length,
    form_shown: !g('askForm').hidden, question: g('question').value, assistance: document.querySelector('input[name="assistance"]:checked')?.value ?? null,
    submit_disabled: g('askSubmit').disabled, cancel_shown: !g('askCancel').hidden, save_shown: !g('askSave').hidden,
    picture: { png_sha256: sha, png_bytes: bytes ? bytes.length : null, width: img.naturalWidth, height: img.naturalHeight },
    mode: __lcOverlay.state().mode, revision: __lcOverlay.state().doc.revision, hint: g('hint').textContent, log: window.__qaAsk || [] }); })()`, as);
// The form must be ready before anything is asked. If it is not, the card as it is shown is read first (so the reason is
// in the results), and then the run stops there.
const formReadyOr = (label) => [{ ...formReady, required: false }, askRead(`form_${label}`), { ...formReady, timeoutMs: 1500 }];
const hashesS = (label) => ({ hashTree: ['ink', 'captures'], frames: false, as: `h_${label}` });
// One more question on the card that is open: set, press once, wait for how it ended, read.
const askOnCard = (label, ms = 20000, assistance = 'explain') => [askSet(SURFACE_QUESTION, assistance), askPress, askOutcome(`${label}_ended`, ms), askRead(label), hashesS(label)];
// A question that the stand-in holds: press, see it waiting, press Cancel, wait for how it ended.
const askThenCancel = (label) => [askSet(SURFACE_QUESTION, 'explain'), askPress, askWaiting(`${label}_waiting`), askRead(`${label}_out`), click('#askCancel'),
  askOutcome(`${label}_ended`, 20000), { sleep: 1500 }, askRead(label), hashesS(label)];
// What the stand-in bridge does, launch by launch and question by question, in the order `subcontrols` asks.
export const FAKE_BRIDGE_SCRIPT = { launches: [
  { asks: [{ do: 'answer', text: 'SYNTHETIC (QA fake bridge: no model, no ChatGPT). First control answer.' }, { do: 'answer', tamper: 'image_sha256' },
           { do: 'error', code: 'quota' }, { do: 'error', code: 'busy' }, { do: 'error', code: 'unsupported_model' }, { do: 'error', code: 'invalid_request' },
           { do: 'error', code: 'failed' }, { do: 'error', code: 'unavailable' },
           { do: 'hold', on_cancel: 'cancelled' }, { do: 'hold', on_cancel: 'late_answer' }, { do: 'hold', on_cancel: 'unconfirmed' },
           { do: 'hold', on_stop: 'late_answer' },
           { do: 'answer', text: 'SYNTHETIC (QA fake bridge: no model, no ChatGPT). Answer in the second capture session.' },
           { do: 'fault', during_read: true }] },
  { asks: [{ do: 'answer', text: 'SYNTHETIC (QA fake bridge: no model, no ChatGPT). Answer from the second bridge start.' }, { do: 'error', code: 'unauthenticated' }] },
] };
// The rehearsal of the real turn's steps with the stand-in: one held-back SYNTHETIC answer that names no card.
export const REHEARSAL_BRIDGE_SCRIPT = { launches: [{ asks: [{ do: 'answer', delay_ms: 3000, text: 'SYNTHETIC (QA fake bridge: no model, no ChatGPT). Rehearsal answer: it names no card.' }] }] };
export const FAKE_ASKS = ['k1_answered', 'k2_tampered', 'k3_quota', 'k4_busy', 'k5_unsupported_model', 'k6_invalid_request', 'k7_failed', 'k8_unavailable',
  'k9_cancel_confirmed', 'k10_cancel_late_answer', 'k11_cancel_unconfirmed', 'k12_stop_in_flight', 'k13_new_session', 'k14_fault', 'k15_after_recheck', 'k16_unauthenticated'];
// Right before a real question: the app still says signed in, with the chosen model taking pictures, no question out, no
// sign-in pending and no usage window used up; the card holds exactly QA's question and level and its Ask is enabled.
const subReadyToAsk = (as) => control(`(async () => { const s = await window.lc.subState(); const full = ((s && s.rate_limits) || []).filter((w) => w.used_percent >= 100).length;
  if (!s || s.mode !== 'managed' || s.state !== 'signed_in' || s.asking !== false || s.login !== 'none' || typeof s.model !== 'string' || !s.models.some((m) => m.id === s.model && m.image_input === true) || full > 0)
    throw new Error('not ready to ask: ' + JSON.stringify(s && { state: s.state, asking: s.asking, login: s.login, model: s.model, usage_windows_full: full }));
  return JSON.stringify({ at: new Date().toISOString(), state: s.state, asking: s.asking, login: s.login, model: s.model, rate_limits: s.rate_limits }); })()`, as);
const cardReadyToAsk = (question, assistance, as) => overlay(`(() => { const g = (id) => document.getElementById(id);
  const now = { question_is_qas: g('question').value === ${JSON.stringify(question)}, assistance: document.querySelector('input[name="assistance"]:checked')?.value ?? null, card: !g('card').hidden, form: !g('askForm').hidden,
    ask_enabled: !g('askSubmit').disabled, cancel_hidden: g('askCancel').hidden, answer_hidden: g('answerBox').hidden, badge: g('badge').textContent };
  if (!now.question_is_qas || now.assistance !== ${JSON.stringify(assistance)} || !now.card || !now.form || !now.ask_enabled || !now.cancel_hidden || !now.answer_hidden || now.badge !== 'Selection · not sent to any AI')
    throw new Error('the card is not ready to ask: ' + JSON.stringify(now));
  return JSON.stringify({ at: new Date().toISOString(), ...now }); })()`, as);
// The ASK selection around the grid, with the pen lifted just after the app took a frame. (The app samples about once a
// second; this candidate refuses a selection as "the selection facts are malformed" when a frame is taken between the
// pen-up and its own request: QA-SUB-01, measured by the `subselect` probe, which keeps the plain gesture. Here the
// pen-up is timed so that a run is not stopped by that defect; if no new frame comes in 5 s the pen lifts anyway.)
const selectSurface = [click('[data-mode=ASK]'), pen(SURFACE_ASK.slice(0, -2), { release: false }), overlay('(window.__qaFrame = __lcOverlay.state().frame, true)'),
  { waitEval: '__lcOverlay.state().frame !== null && __lcOverlay.state().frame !== window.__qaFrame', target: 'overlay', timeoutMs: 5000, required: false },
  pen(SURFACE_ASK.slice(-3), { continue: true }), cardShown];
const QUESTION_FOCUS = "(() => { const q = document.getElementById('question'); return JSON.stringify({ value: q.value, active: document.activeElement === q, has_focus: document.hasFocus(), disabled: q.disabled }); })()";
// Start on the surface with the two circles drawn solid, then the ASK selection and its ready form.
// ... and it must really be what is on the screen: under the centre of every card and the corners of the ASK region the
// top window is QA's Edge window (a page that says "full screen" can be covered by another app's window).
const SURFACE_POINTS_PX = [...Array.from({ length: 12 }, (_, i) => { const r = cardRect(i); return [(r.x + r.width / 2) * 2, (r.y + r.height / 2) * 2]; }),
  [SURFACE_REGION_PX[0] + 8, SURFACE_REGION_PX[1] + 8], [SURFACE_REGION_PX[2] - 8, SURFACE_REGION_PX[1] + 8], [SURFACE_REGION_PX[0] + 8, SURFACE_REGION_PX[3] - 8], [SURFACE_REGION_PX[2] - 8, SURFACE_REGION_PX[3] - 8]];
const surfaceOnTop = { onTop: 'edge', points: SURFACE_POINTS_PX };
const surfaceOpen = [{ window: 'edge', show: 'raise' }, { edgeFullscreen: true, required: false }, { sleep: 2000 }, { window: 'edge', show: 'raise' }, { sleep: 500 }, surfaceOnTop, { cursorOutside: SURFACE_REGION_PX }];
// The picture of the selection (the exact PNG the card shows, which is what an Ask would send) must BE QA's surface, read
// from its own pixels in the page: its size, every card's grey ground at four points, a coloured shape and dark digits
// in every card, white between the cards, and the pen's ring around exactly the cards `rings` (their grid indexes: where
// the harness drew, not a value of the surface). Nothing of the surface's truth is given to the page; which colour each shape has and which cards are ringed is returned for the analysis.
// (Colours are matched loosely: this display's colour profile moves each channel by up to about 50.)
// Fails (and stops the run before any Ask) when another window was captured instead.
const pictureIsSurface = (as, rings) => overlay(`(async () => { const img = document.getElementById('crop'); await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, S = 2, OX = ${SURFACE_REGION_PX[0] / 2}, OY = ${SURFACE_REGION_PX[1] / 2};
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, W, H).data;
  const at = (x, y) => { const i = (Math.round((y - OY) * S) * W + Math.round((x - OX) * S)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const near = (p, q, t) => Math.abs(p[0] - q[0]) <= t && Math.abs(p[1] - q[1]) <= t && Math.abs(p[2] - q[2]) <= t;
  const count = (x0, y0, x1, y1, test) => { let n = 0; for (let y = Math.round((y0 - OY) * S); y < Math.round((y1 - OY) * S); y++) for (let x = Math.round((x0 - OX) * S); x < Math.round((x1 - OX) * S); x++) { const i = (y * W + x) * 4; if (test([d[i], d[i + 1], d[i + 2]])) n++; } return n; };
  const PALETTE = { red: [214, 39, 40], blue: [31, 95, 191], green: [30, 142, 62], orange: [242, 140, 0] }, GROUND = [244, 246, 248], INK = [110, 63, 209], G = ${JSON.stringify(SURFACE)};
  const size_ok = W === ${SURFACE_REGION_PX[2] - SURFACE_REGION_PX[0]} && H === ${SURFACE_REGION_PX[3] - SURFACE_REGION_PX[1]};
  const cards = [], gaps = [];
  if (size_ok) for (let i = 0; i < G.cols * G.rows; i++) { const x = G.x + (i % G.cols) * (G.w + G.gap), y = G.y + Math.floor(i / G.cols) * (G.h + G.gap);
    const ground = [[x + 12, y + 12], [x + G.w - 12, y + 12], [x + 12, y + G.h - 12], [x + G.w - 12, y + G.h - 12]].filter((p) => near(at(p[0], p[1]), GROUND, 10)).length;
    const shape = Object.fromEntries(Object.entries(PALETTE).map(([name, rgb]) => [name, count(x + 22, y + G.h / 2 - 28, x + 78, y + G.h / 2 + 28, (p) => near(p, rgb, 60))]));
    const color = Object.entries(shape).sort((a, b) => b[1] - a[1])[0];
    cards.push({ index: i, ground, shape_color: color[0], shape_px: color[1], digit_px: count(x + 88, y + G.h / 2 - 23, x + 176, y + G.h / 2 + 27, (p) => p[0] < 90 && p[1] < 90 && p[2] < 90),
      ring_px: count(x, y, x + G.w, y + G.h, (p) => near(p, INK, 40)) });
    if (i % G.cols < G.cols - 1) gaps.push(near(at(x + G.w + G.gap / 2, y + G.h / 2), [255, 255, 255], 6));
    if (i < G.cols * (G.rows - 1)) gaps.push(near(at(x + G.w / 2, y + G.h + G.gap / 2), [255, 255, 255], 6)); }
  const ringed = cards.filter((k) => k.ring_px >= 800).map((k) => k.index);
  const ok = size_ok && cards.length === 12 && cards.every((k) => k.ground === 4 && k.shape_px >= 1500 && k.digit_px >= 600 && (k.ring_px >= 800 || k.ring_px <= 40)) && gaps.length === 17 && gaps.every(Boolean) && JSON.stringify(ringed) === ${JSON.stringify(JSON.stringify([...rings].sort((a, b) => a - b)))};
  const out = JSON.stringify({ at: new Date().toISOString(), ok, size: [W, H], size_ok, cards, gaps_white: gaps.filter(Boolean).length, gaps: gaps.length, ringed, rings_wanted: ${JSON.stringify([...rings].sort((a, b) => a - b))} });
  if (!ok) throw new Error("the selected picture is not QA's surface with its ink: " + out);
  return out; })()`, as);

const circleAndSelect = (p, label) => [click('[data-mode=WRITE]'), click('#pen'), pen(circleCard(p.circled[0])), { sleep: 900 }, pen(circleCard(p.circled[1])), ...state(label),
  inkSolid, { cursorOutside: SURFACE_REGION_PX }, surfaceTruth(`surface_truth_${label}`), ...selectSurface, askHook, ...formReadyOr(label), pictureIsSurface(`picture_${label}`, p.circled)];
const selectAgain = (label, rings) => [...selectSurface, askHook, ...formReadyOr(label), pictureIsSurface(`picture_${label}`, rings)];

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

  // The QA-WIN-03/04 retest only (86d2405): every close is a request followed by a wait (nothing is killed), every relaunch
  // (closes: WM_CLOSE to the control window, what its title-bar X sends, for A, C, E and F; the page's own window.close(), the
  // route of the original QA-WIN-03 report, for the no-link control, B, D and G)
  // is of the same profile after the previous process ended by itself, and the header / link line / ASK card are read in
  // each storage state. One isolated fault with a card left open: this run's own test-service host is paused, so one
  // send gets no answer, then resumed. Strokes are DevTools-injected pen events (synthetic).
  parentfix: (p) => [
    ...setup(p), linkHook, linkNow('n_off'), kidsOf('kids_n'),
    { closeApp: true },                                       // control: the app without the development link
    { seedLinkRecord: true, actor: p.actor, as: 'seed' },
    // A. Link configured, never started: the native close (WM_CLOSE to the control window, as its title-bar X does).
    { launchApp: true, as: 'app-idle', link: 'main' }, waitDisplays, linkHook, { sleep: 3000 },
    linkNow('a_idle'), kidsOf('kids_a'), hashesP('a-idle'),
    { closeApp: true, via: 'wm_close' }, hashesP('a-closed'),
    // B. Relaunch (no kill). Start on the visible QA course: storing copy; an ASK card left open through a lost reply and
    //    its recovery; continue writing; Stop; close after Stop.
    { launchApp: true, as: 'app-main', link: 'main' }, waitDisplays, inkHook, linkHook, { sleep: 3000 },
    linkNow('b_idle'), kidsOf('kids_b_idle'),
    { window: 'edge', show: 'front' }, showPanel, { sleep: 1200 }, mark('before-start'), { desktopShot: 'before-start' },
    ...startSession('s1'), linkUntil("l.state === 'sending'", 'b_sending'), kidsOf('kids_b'),
    { sleep: 3500 }, setText('qa-sign', '+'), { sleep: 3500 },
    linkUntil(`${QUIET} && l.stored >= 2`, 'b_storing'), linkNow('b_storing_now'),
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.wave), ...stateP('b-write'),
    click('[data-mode=ASK]'), pen(INK.ask), cardShown, cardRead('card_open'), overlayState('b_card_open'),
    { sleep: 4000 }, hashesP('b-before-pause', true), linkUntil(QUIET, 'b_quiet_before_pause'), linkNow('b_before_pause'),
    // The fault: only this run's host is paused (SIGSTOP by the WSL watcher); one visible change is then retained and sent.
    { hostPause: true, as: 'pause' },
    setText('qa-digit', '8'), mark('paused-change'), { sleep: 8000 },
    linkNow('b_paused_8s'), coordCopy('coord-paused-8s'), cardRead('card_paused'),
    linkUntil("l.state === 'stalled'", 'b_stalled', 205000), linkNow('b_stalled_now'), cardRead('card_stalled'), { desktopShot: 'stalled' },
    coordCopy('coord-stalled'),
    { hostResume: true, as: 'resume' },
    linkUntil(QUIET, 'b_recovered', 60000), linkNow('b_recovered_now'), cardRead('card_recovered'), hashesP('b-recovered', true),
    click('#close'), overlayState('b_card_closed'),
    pen(INK.c1), ...stateP('b-continued'),
    linkUntil(QUIET, 'b_pre_stop'), linkNow('b_pre_stop_now'),
    ...stopSession('b_stopped'), linkUntil("l.state === 'stopped'", 'b_link_stopped', 65000), linkNow('b_stopped_now'), kidsOf('kids_b_stopped'),
    coordCopy('coord-b-stopped'), hashesP('b-stopped', true), linkEvents('b_events'), timeline('b_timeline'), listInk('b_ink'),
    { closeApp: true }, hashesP('b-closed', true),
    // C. Relaunch (no kill). Start, write, then close the control window WHILE capturing (no Stop pressed): WM_CLOSE, and a
    //    second WM_CLOSE to the same window right behind it (a repeated close request while the first is being served).
    { launchApp: true, as: 'app-capturing', link: 'main' }, waitDisplays, inkHook, linkHook, { sleep: 6000 },
    linkNow('c_relaunched'), kidsOf('kids_c_idle'), listInk('c_ink'), hashesP('c-relaunched', true),
    { window: 'edge', show: 'front' },
    ...startSession('s2'), linkUntil("l.state === 'sending'", 'c_sending'), kidsOf('kids_c'),
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.relaunch), ...stateP('c-write'),
    setText('qa-sign', '−'), { sleep: 3500 },
    linkUntil(`${QUIET} && l.stored >= 2`, 'c_storing'), linkNow('c_storing_now'), linkEvents('c_events'), listInk('c_ink_before_close'),
    coordCopy('coord-c-before-close'), hashesP('c-before-close', true),
    { closeApp: true, via: 'wm_close', again: true, waitMs: 95000 }, hashesP('c-closed', true), coordCopy('coord-c-closed'),
    // D. Relaunch (no kill) after the close while capturing: what the app says about that stream; closed without a Start.
    { launchApp: true, as: 'app-after-capturing', link: 'main' }, waitDisplays, inkHook, linkHook, { sleep: 8000 },
    linkNow('d_relaunched'), kidsOf('kids_d'), listInk('d_ink'), hashesP('d-relaunched', true),
    { closeApp: true },
    // E. The test service unavailable (a DSN file naming a socket that does not exist): copy, card, Stop, close after Stop.
    { launchApp: true, as: 'app-unavail', link: 'unavail' }, waitDisplays, inkHook, linkHook, { sleep: 4000 },
    linkNow('e_idle'), kidsOf('kids_e_idle'),
    { window: 'edge', show: 'front' },
    ...startSession('s3'), failSettled('e_fail'), { sleep: 4000 }, linkNow('e_fail_now'), kidsOf('kids_e'),
    click('[data-mode=WRITE]'), click('#pen'), pen(INK.c2), ...stateP('e-write'),
    click('[data-mode=ASK]'), pen(INK.ask), cardShown, cardRead('card_unavail'), linkNow('e_with_card'), click('#close'), overlayState('e_card_closed'),
    ...stopSession('e_stopped'), { sleep: 3000 }, linkNow('e_stopped_now'), linkEvents('e_events'), coordCopy('coord-e-stopped'), hashesP('e-stopped', true),
    { closeApp: true, via: 'wm_close' }, hashesP('e-closed', true),
    // F. Relaunch (no kill), still unavailable: Start, then close WHILE capturing.
    { launchApp: true, as: 'app-unavail-capturing', link: 'unavail' }, waitDisplays, inkHook, linkHook, { sleep: 10000 },
    linkNow('f_relaunched'), kidsOf('kids_f_idle'), linkEvents('f_events_idle'),
    ...startSession('s4'), failSettled('f_fail'), { sleep: 4000 }, linkNow('f_fail_now'), hashesP('f-before-close', true),
    { closeApp: true, via: 'wm_close', waitMs: 95000 }, hashesP('f-closed', true),
    // G. Final relaunch (no kill): the saved ink and the record are still there; close.
    { launchApp: true, as: 'app-final', link: 'unavail' }, waitDisplays, inkHook, linkHook, { sleep: 10000 },
    linkNow('g_relaunched'), kidsOf('kids_g'), listInk('g_ink'), linkEvents('g_events'), coordCopy('coord-final'),
    { closeApp: true }, hashesP('final', true),
  ],

  // QA-WIN-05 changed path only (476fd1f): a send that is out and not yet answered is said as waiting at once, the
  // confirmed counts stay as they were, a real answer raises them, and a Stop during a pending send ends without a live
  // or stored claim. The same isolated fault as in parentfix (this run's own host paused, the connection kept open), but
  // resumed before the app's own 60 s wait ends. No pen input: Start and Stop are DOM clicks, page changes are QA's own.
  // The change made during each pause hides or shows QA's whole panel (720x300 DIP): one paint, far above the app's
  // retention threshold (a first run changed one digit there, and the app rightly kept no frame for it, so nothing was sent).
  parentwin05: (p) => [
    ...setup(p), linkHook, linkNow('n_off'), { closeApp: true },
    { seedLinkRecord: true, actor: p.actor, as: 'seed' },
    { launchApp: true, as: 'app-win05', link: 'main' }, waitDisplays, inkHook, linkHook, { sleep: 3000 },
    linkNow('w_idle'), kidsOf('kids_w_idle'),
    { window: 'edge', show: 'front' }, showPanel, { sleep: 1200 }, mark('before-start'), { desktopShot: 'before-start' },
    ...startSession('s1'), linkUntil("l.state === 'sending'", 'w_sending'), kidsOf('kids_w'),
    { sleep: 3500 }, setText('qa-sign', '+'), { sleep: 3500 },
    linkUntil(`${SETTLED5} && l.stored >= 2`, 'w_confirmed'), { sleep: 2500 }, linkUntil(SETTLED5, 'w_settled'),
    linkNow('w_confirmed_now'), overlayState('w_overlay'), coordCopy('coord-confirmed'),
    // 1. The next send gets no answer (the host is paused, its connection stays open): what the app says, read at once
    //    and again 10 s later, both well inside its 60 s wait.
    { hostPause: true, as: 'pause1' },
    panelHidden(true), mark('pending-change'),
    linkUntil('l.awaiting === true', 'w_awaiting', 20000), linkNow('w_awaiting_now'), coordCopy('coord-awaiting'), { desktopShot: 'awaiting' },
    { sleep: 10000 }, linkNow('w_awaiting_10s'),
    // 2. The host answers again: the real acknowledgement.
    { hostResume: true, as: 'resume1' },
    linkUntil(SETTLED5, 'w_acked', 30000), linkNow('w_acked_now'), linkEvents('w_events_1'), coordCopy('coord-acked'),
    { sleep: 3500 }, linkUntil(SETTLED5, 'w_settled2'), linkNow('w_before_pause2'),
    // 3. Stop while a send is pending: read right after the click, after the app's own 5 s wait for that send, and at the end.
    { hostPause: true, as: 'pause2' },
    panelHidden(false), mark('pending-change-2'),
    linkUntil('l.awaiting === true', 'p_awaiting', 20000), linkNow('p_awaiting_now'),
    control("document.getElementById('stop').click(), true"), linkNow('p_stop_latched'),
    linkUntil("l.state === 'stopping' && l.awaiting === false", 'p_stop_given_up', 15000), linkNow('p_stop_given_up_now'), coordCopy('coord-stop-given-up'),
    { hostResume: true, as: 'resume2' },
    stopped('s1_stopped'), linkUntil("l.state === 'stopped'", 'p_link_stopped', 50000), linkNow('p_stopped_now'), kidsOf('kids_p_stopped'),
    linkEvents('w_events'), timeline('w_timeline'), coordCopy('coord-stopped'), hashesP('stopped', true),
    { closeApp: true, via: 'wm_close' }, hashesP('final', true),
  ],

  // Dry check of QA's generated surface on the real display, with NO link and NO provider: the page fills the screen, the
  // pen circles the chosen card, ASK selects the grid, and the local card shows the composed selection. Run before any
  // real model call, so that no call is spent on a surface or a stroke that does not work.
  surfacecheck: (p) => [
    { edgeStart: p.surfaceUrl, profile: p.edgeProfile, as: 'edge', fullscreen: true },
    ...surfaceOpen,
    waitDisplays,
    control("(async () => (await window.lc.listDisplays()).map(d => ({ label: d.label, primary: d.primary, bounds: d.bounds, scale_factor: d.scale_factor, source_id: d.source_id })))()", 'displays'),
    surfaceTruth('surface_truth'), inkHook, linkHook, linkNow('link_off'),
    mark('before-start'), { desktopShot: 'surface' },
    ...startSession('s1'), { sleep: 3500 }, surfaceTruth('surface_truth_running'),
    click('[data-mode=WRITE]'), click('#pen'), pen(circleCard(p.circled[0])), { sleep: 900 }, pen(circleCard(p.circled[1])), ...state('circled'),
    inkSolid, { cursorOutside: SURFACE_REGION_PX }, surfaceTruth('surface_truth_before_ask'),
    click('[data-mode=ASK]'), pen(SURFACE_ASK), cardShown, pictureIsSurface('picture', p.circled),
    overlay("JSON.stringify({ text: document.getElementById('cardText').textContent, src: document.getElementById('crop').src, revision: __lcOverlay.state().doc.revision })", 'askCard'),
    cardRead('card'), overlayState('card_open'),
    click('#close'), overlayState('card_closed'),
    ...stopSession('stopped'), recoveries('recoveries'), hashes('final', true), timeline('timeline'), listInk('ink'),
    { closeApp: true },
  ],

  // DETERMINISTIC CONTROLS with QA's stand-in bridge (qa_fake_bridge.py named as the connector's launch.python): no Codex,
  // no ChatGPT, no sign-in, no browser, no allowance. Every "answer" is text QA wrote and is marked SYNTHETIC. They show
  // what the app does at its own boundary; they are never evidence of a real model.
  subcontrols: (p) => [
    { edgeStart: p.surfaceUrl, profile: p.edgeProfile, as: 'edge', fullscreen: true }, ...surfaceOpen,
    waitDisplays, surfaceTruth('surface_truth'), subNow('off'), { closeApp: true },
    { launchApp: true, as: 'app-fake', sub: 'fake' }, waitDisplays, inkHook, subHook, { sleep: 2500 },
    subNow('f_not_checked'), kidsOf('kids_not_checked'),
    // Start, write, capture and select with the connection configured but never checked: nothing may start a connector.
    ...startSession('s0'), { sleep: 2500 }, click('[data-mode=WRITE]'), click('#pen'), pen(circleCard(p.circled[0])), ...state('unchecked'),
    ...selectSurface, askHook, ...formReadyOr('unchecked'), pictureIsSurface('picture_unchecked', [p.circled[0]]), askRead('k0_unchecked_card'),
    ...askOnCard('k0_unchecked_ask', 8000), kidsOf('kids_unchecked'), click('#close'), ...stopSession('s0_stopped'),
    // The user's press: Check connection. Only now may the bridge start.
    subCheck, subUntil("s.state !== 'not_checked' && s.state !== 'checking'", 'f_checked'), subNow('f_signed_in'), kidsOf('kids_checked'),
    ...startSession('s1'), { sleep: 2500 }, ...circleAndSelect(p, 'circled'),
    askRead('k_selected'), hashesS('selected'), { sleep: 4000 }, askRead('k_selected_later'),   // selected, not asked: nothing is sent
    ...askOnCard('k1_answered'), ...askOnCard('k2_tampered'), ...askOnCard('k3_quota'), ...askOnCard('k4_busy'), ...askOnCard('k5_unsupported_model'),
    ...askOnCard('k6_invalid_request'), ...askOnCard('k7_failed'), ...askOnCard('k8_unavailable'),
    ...askThenCancel('k9_cancel_confirmed'), ...askThenCancel('k10_cancel_late_answer'), ...askThenCancel('k11_cancel_unconfirmed'),
    // Stop while a question is out: the Stop itself tells the connector; the late answer must not be shown or kept.
    askSet(SURFACE_QUESTION, 'explain'), askPress, askWaiting('k12_waiting'), askRead('k12_out'),
    control("document.getElementById('stop').click(), true"), stopped('s1_stopped'), { sleep: 2500 }, subNow('f_after_stop'), hashesS('k12_stop_in_flight'),
    // A later explicit Start is another capture session: it may ask again.
    ...startSession('s2'), { sleep: 2500 }, ...selectAgain('s2', []),   // a new capture session has new ink: no ring
    ...askOnCard('k13_new_session'),
    // A line longer than the envelope allows while the app's own re-read is out: the child is ended and none is started by the app.
    askSet(SURFACE_QUESTION, 'explain'), askPress, { sleep: 6000 }, subNow('f_after_fault'), kidsOf('kids_after_fault'), { sleep: 6000 }, subNow('f_after_fault_later'),
    askRead('k14_fault'), hashesS('k14_fault'),
    // Only the user's own Check starts a connector again.
    subCheck, subUntil("s.state !== 'checking' && s.state !== 'unavailable'", 'f_rechecked', 30000), subNow('f_rechecked_now'), kidsOf('kids_rechecked'),
    click('#close'), ...selectAgain('s2b', []), ...askOnCard('k15_after_recheck'), ...askOnCard('k16_unauthenticated'), subNow('f_signed_out'),
    ...askOnCard('k17_not_signed_in', 8000),
    click('#close'), ...stopSession('s2_stopped'), subEvents('sub_events'), timeline('timeline'), hashesS('final'),
    { closeApp: true, via: 'wm_close' },
  ],

  // PROBE with QA's stand-in bridge, asking nothing: sixteen plain ASK selections of the same region in one capture
  // session, each closed again (before every second one Check connection is pressed too). For each: whether the question
  // form became ready, what the card said, and when the app took its frames (QA-SUB-01: a selection is refused as "the
  // selection facts are malformed" when a frame is taken between the pen-up and the app's own request).
  subselect: (p) => [
    { edgeStart: p.surfaceUrl, profile: p.edgeProfile, as: 'edge', fullscreen: true }, ...surfaceOpen,
    waitDisplays, surfaceTruth('surface_truth'), { closeApp: true },
    { launchApp: true, as: 'app-fake', sub: 'fake' }, waitDisplays, inkHook, subHook, { sleep: 2500 },
    subCheck, subUntil("s.state !== 'not_checked' && s.state !== 'checking'", 'f_checked'), subNow('f_signed_in'),
    ...startSession('s1'), { sleep: 2500 },
    ...Array.from({ length: 16 }, (_, i) => [...(i % 2 ? [subCheck] : []), click('[data-mode=ASK]'), pen(SURFACE_ASK), cardShown, askHook,
      { ...formReady, timeoutMs: 6000, required: false, as: `ready_${i}` }, ...(i === 0 ? [pictureIsSurface('picture_0', [])] : []), askRead(`sel_${i}`), subNow(`f_sel_${i}`), click('#close'), { sleep: i % 4 === 3 ? 1200 : 150 }]).flat(),
    ...stopSession('s1_stopped'), subEvents('sub_events'), timeline('timeline'), hashesS('final'),
    { closeApp: true, via: 'wm_close' },
  ],

  // The first live step after a release, with the REAL connector and NO question: the user's "Check connection" press and
  // what the app then says; the ASK card's form on a real selection; and whether the question box takes typed text. It
  // never presses Sign in and never presses Ask. If the product is not signed in, the run ends there: the sign-in is the
  // user's own browser step.
  subcheck: (p) => [
    { edgeStart: p.surfaceUrl, profile: p.edgeProfile, as: 'edge', fullscreen: true }, ...surfaceOpen,
    waitDisplays, surfaceTruth('surface_truth'), subNow('off'), { closeApp: true },
    { launchApp: true, as: 'app-real', sub: 'real' }, waitDisplays, inkHook, subHook, { sleep: 2500 },
    subNow('r_not_checked'), kidsOf('kids_not_checked'),
    subCheck, subUntil("s.state !== 'not_checked' && s.state !== 'checking'", 'r_checked', 60000), subNow('r_state'), kidsOf('kids_checked'),
    ...startSession('s1'), { sleep: 2500 }, ...circleAndSelect(p, 'circled'), askRead('r_card'),
    // Typed text, as a user does it: ONE OS mouse click on the question box (made only if the window under that point is
    // this app's), then OS keystrokes, sent only if the overlay then is the foreground window (synthetic OS input, not a
    // physical mouse or keyboard; digits and spaces only, which an input method passes through). Then a diagnostic that is
    // not a user path: QA raises the overlay itself and types again.
    { osClick: '#question', target: 'overlay', window: 'overlay', required: false }, { sleep: 400 },
    overlay(QUESTION_FOCUS, 'r_focus_after_click'),
    { keys: '4207 1935', window: 'overlay', required: false }, { sleep: 600 },
    overlay(QUESTION_FOCUS, 'r_typed'),
    { window: 'overlay', show: 'raise', required: false },
    overlay("(() => { const q = document.getElementById('question'); q.focus(); q.select(); return JSON.stringify({ active: document.activeElement === q, has_focus: document.hasFocus() }); })()", 'r_focus_raised'),
    { keys: '7781 20', window: 'overlay', required: false }, { sleep: 600 },
    overlay(QUESTION_FOCUS, 'r_typed_raised'),
    { cursorBack: true, required: false },
    askRead('r_card_after_typing'), hashesS('r_selected'),
    click('#close'), ...stopSession('s1_stopped'), subNow('r_final'), subEvents('sub_events'), kidsOf('kids_final'),
    { closeApp: true, via: 'wm_close' },
  ],

  // THE ONE REAL IMAGE TURN. run.mjs refuses to build this scenario unless the lead's allocation is acknowledged in the
  // environment (QA_SUB_ALLOW_REAL_TURN=1). It presses Ask exactly once and never again; it never presses Sign in. If the
  // product is not signed in with a model that takes pictures, it stops before Start (a required step fails).
  subask: (p) => [
    { edgeStart: p.surfaceUrl, profile: p.edgeProfile, as: 'edge', fullscreen: true }, ...surfaceOpen,
    waitDisplays, surfaceTruth('surface_truth'), { closeApp: true },
    { launchApp: true, as: 'app-real', sub: 'real' }, waitDisplays, inkHook, subHook, { sleep: 2500 },
    subNow('a_not_checked'), subCheck,
    subUntil("s.state === 'signed_in' && typeof s.model === 'string' && s.models.some((m) => m.id === s.model && m.image_input === true)", 'a_signed_in', 60000),
    ...(p.model ? [control(`(() => { const m = document.getElementById('subModel'); if (![...m.options].some((o) => o.value === ${JSON.stringify(p.model)})) throw new Error('the model is not offered');
      m.value = ${JSON.stringify(p.model)}; m.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`), subUntil(`s.model === ${JSON.stringify(p.model)}`, 'a_model', 10000)] : []),
    subNow('a_state'), kidsOf('kids_checked'), mark('before-start'), { desktopShot: 'surface' },
    ...startSession('s1'), { sleep: 2500 }, ...circleAndSelect(p, 'circled'),
    askRead('a_card'), hashesS('a_selected'),
    askSet(SURFACE_QUESTION, p.assistance), askRead('a_ready'), surfaceTruth('surface_truth_at_ask'), { cursorOutside: SURFACE_REGION_PX },
    // The last gates, at the press: still signed in with that picture model, nothing out, no usage window full; the card
    // holds QA's question and level and can be asked. Each throws, so the run stops here and nothing is asked.
    subReadyToAsk('a_ready_state'), cardReadyToAsk(SURFACE_QUESTION, p.assistance, 'a_ready_card'),
    askPress,                                                    // <- the one real submission
    // From here nothing may stop the run: every step is optional, so that whatever happened is read and kept. The wait
    // is the app's own bound for a question (300 s) and for its cancel (30 s): the outcome read is always the app's own,
    // and QA's later close of the card cannot be what ended the question.
    ...[askWaiting('a_waiting'), askOutcome('a_ended', 340000), askRead('a_after'), hashesS('a_after'), subNow('a_after_state'),
      edge('window.__qaSurfaceTruth()', 'surface_truth_after'), { cursorOutside: SURFACE_REGION_PX }, { sleep: 2000 }, askRead('a_after_2s'),
      click('#close'), overlayState('a_closed'), ...stopSession('s1_stopped'), subNow('a_final'), subEvents('sub_events'), timeline('timeline'), hashesS('final'),
      kidsOf('kids_final')].map((step) => ({ ...step, required: false })),
    { closeApp: true, via: 'wm_close', required: false },
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

// REHEARSAL of the one real turn: exactly the `subask` steps, with QA's stand-in bridge instead of the real connector
// (no Codex, no ChatGPT, no allowance). It shows that the driver's steps, gates and reads work before the allocation is
// spent; its "answer" is SYNTHETIC text and is never real-model evidence.
scenarios.subrehearsal = (p) => scenarios.subask(p).map((step) => (step.launchApp ? { ...step, as: 'app-fake', sub: 'fake' } : step));
