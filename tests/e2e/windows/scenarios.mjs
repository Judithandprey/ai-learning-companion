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
const stopped = (as) => ({ waitEval: '(async () => { const s = await window.lc.sessionState(); return !s.running && !s.starting ? JSON.stringify(s) : false })()', target: 'control', timeoutMs: 20000, as });
const overlayReady = { waitEval: "document.readyState === 'complete'", target: 'overlay', timeoutMs: 15000 };
const listInk = (as) => control('(async () => JSON.stringify(await window.lc.listInk()))()', as);

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
    { eval: 'scrollTo(0, 0), scrollY', target: 'edge' }, { sleep: 3500 }, mark('ink-back'), overlayState('ink_back'),
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
