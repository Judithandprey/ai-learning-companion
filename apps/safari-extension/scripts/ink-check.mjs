#!/usr/bin/env node
// Desktop check of WRITE ink on the original page with the shipped WebExtension (webextension/), in
// Edge headless with the unpacked extension loaded and trusted CDP input on the page.
//
// It follows one learner on a local synthetic course page: explicit WRITE, mouse writing switched on,
// strokes, a partial erase (a screenshot is taken while the eraser moves), undo and redo, an ASK that
// finishes and one that is cancelled (both return to WRITE), more writing, ink that follows the page
// and ink that stays on screen, a reload that reopens the ink for further editing, a reopen after the
// page content changed (marked, not re-attached), other addresses (query, fragment), a save refused
// because another tab saved newer ink, and a stored record that cannot be read (left untouched).
//
// The toolbar press is DevTools Extensions.triggerAction on the page tab (runs the real
// action.onClicked and grants activeTab; not a human click). Harness controls, labelled in the report:
// state is read through the worker (scripting.executeScript in the extension's isolated world),
// rendered pixels are read from a captureVisibleTab image in the worker, and the "other tab" and
// "unreadable" records are written into the extension's IndexedDB by the worker. The page is served
// locally; no course account or site is used. Not Safari, iPad or Pencil evidence.
//
// Usage: node scripts/ink-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <prefix>]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './fixture-server.mjs';
import { E, clickAt, drag, mouse, runCdp, shot, sleep } from './cdp-harness.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.browser || !args.browser.startsWith('/mnt/')) {
  console.error('missing --browser <Windows browser executable under /mnt/...>');
  process.exit(2);
}
const prefix = (args.run ?? 'p0-07-ink').replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};

const COURSE = `http://127.0.0.1:${PORT}/fixture/course.html`;
const SW = (e, as) => ({ swEval: e, as });
const TAB = `(await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]`;
const inPage = (func, as) => SW(`(async () => { const tab = ${TAB}; const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: ${func} }); return r.result; })()`, as);
/** Mode, captures and the ink state of the companion (isolated world; the page cannot reach it). */
const state = (as) => inPage(`() => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); return s && { mode: s.mode, captures: s.captures, last: s.last && { status: s.last.status, inputMode: s.last.inputMode }, ink: s.ink }; }`, as);
const toolbarPoint = (name, as) => inPage(`() => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); const t = s && s.toolbar && s.toolbar[${JSON.stringify(name)}]; return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : null; }`, as);
const press = (name) => [toolbarPoint(name, `tb_${name}`), ...clickAt(`tb_${name}`), sleep(150)];
const toggle = (as) => [{ triggerAction: true, as }, sleep(900)];

/** Summaries of the rendered pixels around named viewport points, from one image of the visible tab. */
const pixels = (pointsFunc, as) =>
  SW(
    `(async () => { const tab = ${TAB}; const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: ${pointsFunc} }); const pts = r.result;
    const url = await chrome.tabs.captureVisibleTab({ format: 'png' }); const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const dpr = bmp.width / pts.width; const out = { dpr };
    const near = (p, q, tol) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;
    for (const [k, v] of Object.entries(pts)) { if (k === 'width') continue; const d = g.getImageData(Math.round(v[0] * dpr) - 3, Math.round(v[1] * dpr) - 3, 7, 7).data; const s = { ink: 0, screenInk: 0, magenta: 0, white: 0 };
      for (let i = 0; i < d.length; i += 4) { const p = [d[i], d[i + 1], d[i + 2]]; if (near(p, [28, 28, 30], 40)) s.ink++; if (near(p, [110, 63, 209], 45)) s.screenInk++; if (near(p, [216, 27, 96], 30)) s.magenta++; if (p.every((x) => x > 235)) s.white++; }
      out[k] = s; }
    return out; })()`,
    as,
  );
const BLOCK_POINTS = `() => { const r = document.getElementById('formula-block').getBoundingClientRect(); const y = r.top + r.height / 2; return { width: innerWidth, aLeft: [r.left + 30, y], aMid: [r.left + r.width / 2, y], aRight: [r.right - 30, y] }; }`;
const MARGIN_POINTS = `() => ({ width: innerWidth, d: [1075, 450] })`;

/** Stored ink records (non-content facts), read in the worker from the extension's IndexedDB. */
const OPEN_DB = `await new Promise((ok, no) => { const r = indexedDB.open('lc-web-ink', 1); r.onupgradeneeded = () => r.result.createObjectStore('pages'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); })`;
const stored = (as) =>
  SW(
    `(async () => { const db = ${OPEN_DB}; const all = await new Promise((ok) => { const tx = db.transaction('pages'); const s = tx.objectStore('pages'); const k = s.getAllKeys(); const v = s.getAll(); tx.oncomplete = () => ok(k.result.map((key, i) => [key, v.result[i]])); }); db.close();
    return all.map(([key, doc]) => { const json = JSON.stringify(doc); return { origin: key.split(' ')[0], sha: key.split(' ')[1], format: doc && doc.format, revision: doc && doc.revision, history: doc && Array.isArray(doc.history) ? doc.history.map((o) => o.op) : null, strokes: doc && doc.strokes ? Object.keys(doc.strokes).length : null, visible: doc && Array.isArray(doc.visible) ? doc.visible.length : null, otherTab: json.includes('stk_othertab'), rawAddressParts: ['fixture/course', 'problem=', 'step-2', 'elsewhere'].some((t) => json.includes(t)) }; }); })()`,
    as,
  );
/** Another tab's save of the page with this fingerprint: one more stroke appended (harness control). */
const otherTabSaves = (as) =>
  SW(
    `(async () => { const tab = ${TAB}; const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: () => globalThis.__lcCompanion.state().ink.page.address_sha256 }); const key = new URL(tab.url).origin + ' ' + r.result;
    const db = ${OPEN_DB}; const done = await new Promise((ok) => { const tx = db.transaction('pages', 'readwrite'); const s = tx.objectStore('pages'); const g = s.get(key); g.onsuccess = () => { const doc = g.result; const first = doc.strokes[doc.visible[0]]; const seq = doc.history[doc.history.length - 1].seq + 1;
      doc.strokes.stk_othertab = { ...first, id: 'stk_othertab', points: first.points.map((p) => [p[0], p[1] + 40, p[2], p[3]]) }; doc.visible.push('stk_othertab'); doc.history.push({ seq, at: new Date().toISOString(), op: 'add', added: ['stk_othertab'], removed: [] }); doc.revision += 1; s.put(doc, key); }; tx.oncomplete = () => ok(true); tx.onerror = () => ok(false); }); db.close(); return done; })()`,
    as,
  );
/** Harness control: the worker answers ink saves only after `ms` (so saves overlap), or normally again (0). */
const delaySaves = (ms, as) =>
  SW(`(() => { if (!globalThis.__lcRealInk) globalThis.__lcRealInk = inkRequest; globalThis.inkRequest = ${ms} === 0 ? globalThis.__lcRealInk : (m, s) => new Promise((ok) => setTimeout(ok, m && m.type === 'lc-ink-save/v1' ? ${ms} : 0)).then(() => globalThis.__lcRealInk(m, s)); return true; })()`, as);
/** An unreadable record stored for course.html?problem=3 before the companion opens it (harness control). */
const unreadableRecord = (as) =>
  SW(
    `(async () => { const address = ${JSON.stringify(`${COURSE}?problem=3`)}; const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address))), (b) => b.toString(16).padStart(2, '0')).join('');
    const db = ${OPEN_DB}; const done = await new Promise((ok) => { const tx = db.transaction('pages', 'readwrite'); tx.objectStore('pages').put({ format: 'something-else', note: 'unreadable on purpose' }, new URL(address).origin + ' ' + sha); tx.oncomplete = () => ok(sha); tx.onerror = () => ok(null); }); db.close(); return done; })()`,
    as,
  );

// ---- paths (viewport points, computed in the page when the step runs) ----------------------------
const path = (body, as) => E(`(() => { const pts = (() => { ${body} })(); const o = {}; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, as);
const across = (id, as, inset = 15) => path(`const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); const y = r.top + r.height / 2; return Array.from({ length: 7 }, (_, k) => [r.left + ${inset} + ((r.width - ${2 * inset}) * k) / 6, y]);`, as);
const down = (id, as) => path(`const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); const x = r.left + r.width / 2; return Array.from({ length: 5 }, (_, k) => [x, r.top + 5 + ((r.height - 10) * k) / 4]);`, as);
const segment = (x0, y0, x1, y1, as) => path(`return Array.from({ length: 5 }, (_, k) => [${x0} + (${x1 - x0} * k) / 4, ${y0} + (${y1 - y0} * k) / 4]);`, as);
const heading = (as, dx = 0) => path(`const r = document.querySelector('h1').getBoundingClientRect(); return Array.from({ length: 5 }, (_, k) => [r.left + 10 + ${dx} + 40 * k, r.top + r.height / 2]);`, as);
const boardText = (as) => path(`const r = document.getElementById('board').getBoundingClientRect(); return Array.from({ length: 5 }, (_, k) => [r.left + 230 + 30 * k, r.top + 130]);`, as);
const phrasePath = (phrase, as) =>
  E(`(() => { const t = document.getElementById('intro').firstChild; const i = t.textContent.indexOf(${JSON.stringify(phrase)}); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + ${JSON.stringify(phrase)}.length); const q = r.getBoundingClientRect(); const o = {}; for (let k = 0; k <= 4; k++) { o['x' + k] = q.left + 1 + ((q.width - 2) * k) / 4; o['y' + k] = q.top + q.height / 2; } return o; })()`, as);
/** The same drag without the pause after it (for back-to-back strokes). */
const quick = (v, n) => drag(v, n, 'mouse').slice(0, -1);

function steps() {
  return [
    { cdp: 'Page.navigate', params: { url: COURSE } },
    sleep(1500),
    ...toggle('started'),
    ...press('WRITE'),
    state('write0'),
    // mouse writing is off by default: the mouse still operates the page
    segment(960, 300, 1150, 300, 'offLine'),
    ...drag('offLine', 4, 'mouse'),
    state('mouseOff'),
    E('(getSelection().removeAllRanges(), true)', 'clearSel'),
    ...press('INK_MOUSE'),
    // stroke A across the board's magenta block, stroke B over the first paragraph
    across('formula-block', 'lineA'),
    ...drag('lineA', 6, 'mouse'),
    across('intro', 'lineB', 40),
    ...drag('lineB', 6, 'mouse'),
    sleep(500),
    state('afterAB'),
    E('({ collapsed: getSelection().isCollapsed, hash: location.hash })', 'pageAfterAB'),
    pixels(BLOCK_POINTS, 'pxA'),
    // NAV never draws, even with mouse writing on
    ...press('NAV'),
    segment(960, 350, 1150, 350, 'navLine'),
    ...drag('navLine', 4, 'mouse'),
    state('navDrag'),
    E('(getSelection().removeAllRanges(), true)', 'clearSel2'),
    ...press('WRITE'),
    // a partial erase across the middle of A; the eraser is photographed while it moves
    ...press('INK_ERASER'),
    down('formula-block', 'eraseA'),
    mouse('mouseMoved', '$eraseA.x0', '$eraseA.y0', { pointerType: 'mouse', buttons: 0 }),
    mouse('mousePressed', '$eraseA.x0', '$eraseA.y0', { pointerType: 'mouse' }),
    mouse('mouseMoved', '$eraseA.x1', '$eraseA.y1', { pointerType: 'mouse', buttons: 1 }),
    mouse('mouseMoved', '$eraseA.x2', '$eraseA.y2', { pointerType: 'mouse', buttons: 1 }),
    mouse('mouseMoved', '$eraseA.x3', '$eraseA.y3', { pointerType: 'mouse', buttons: 1 }),
    sleep(200),
    shot(`${prefix}-1-eraser-moving`),
    mouse('mouseMoved', '$eraseA.x4', '$eraseA.y4', { pointerType: 'mouse', buttons: 1 }),
    mouse('mouseReleased', '$eraseA.x4', '$eraseA.y4', { pointerType: 'mouse' }),
    sleep(500),
    state('erased'),
    pixels(BLOCK_POINTS, 'pxErased'),
    shot(`${prefix}-2-erased`),
    ...press('INK_UNDO'),
    sleep(300),
    state('undone'),
    pixels(BLOCK_POINTS, 'pxUndone'),
    ...press('INK_REDO'),
    sleep(300),
    state('redone'),
    pixels(BLOCK_POINTS, 'pxRedone'),
    ...press('INK_PEN'),
    // ASK from WRITE: a finished text mark returns to WRITE; so does a cancelled ASK
    ...press('ASK'),
    phrasePath('trace(A²)', 'phrase'),
    ...drag('phrase', 4, 'mouse'),
    sleep(1500),
    state('askFinished'),
    ...press('ASK'),
    state('asking'),
    ...press('CANCEL'),
    state('askCancelled'),
    // keep writing: C over the board's formula, D fixed on screen in the right margin
    boardText('lineC'),
    ...drag('lineC', 4, 'mouse'),
    ...press('INK_DISPLAY'),
    segment(1000, 450, 1150, 450, 'lineD'),
    ...drag('lineD', 4, 'mouse'),
    ...press('INK_DISPLAY'),
    sleep(500),
    state('afterCD'),
    E('(window.scrollTo(0, 150), true)', 'scrolled'),
    sleep(500),
    pixels(BLOCK_POINTS, 'pxScrolledBlock'),
    pixels(MARGIN_POINTS, 'pxScrolledMargin'),
    shot(`${prefix}-3-scrolled-content-and-screen`),
    E('(window.scrollTo(0, 0), true)', 'unscrolled'),
    sleep(300),
    stored('storedBeforeReload'),
    // reload: the ink reopens and editing continues
    { cdp: 'Page.reload', params: {} },
    sleep(1500),
    ...toggle('restarted'),
    sleep(400),
    state('reopened'),
    pixels(BLOCK_POINTS, 'pxReopened'),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    ...press('INK_UNDO'),
    sleep(300),
    state('reopenedUndo'),
    ...press('INK_REDO'),
    sleep(300),
    state('reopenedRedo'),
    // three strokes back to back while each save takes 400 ms (harness delay): their saves overlap
    delaySaves(400, 'slowSaves'),
    path(`const r = document.querySelector('h1').getBoundingClientRect(); const y = r.top + r.height / 2; return Array.from({ length: 5 }, (_, k) => [r.left + 10 + 60 * k, y]);`, 'q1'),
    segment(960, 630, 1150, 630, 'q2'),
    segment(960, 660, 1150, 660, 'q3'),
    ...quick('q1', 4),
    ...quick('q2', 4),
    ...quick('q3', 4),
    sleep(2200),
    state('afterBurst'),
    stored('storedAfterBurst'),
    delaySaves(0, 'normalSaves'),
    // the same address with other content: reopened ink is kept but marked, not re-attached
    { cdp: 'Page.reload', params: {} },
    sleep(1500),
    E(`(document.getElementById('intro').textContent = 'Problem 2: find the eigenvectors of B.', document.getElementById('formula-block').setAttribute('y', '70'), true)`, 'contentChanged'),
    ...toggle('restartedChanged'),
    sleep(600),
    state('reopenedChanged'),
    shot(`${prefix}-4-reopened-content-changed`),
    // another query is another document; a fragment change switches documents in place
    { cdp: 'Page.navigate', params: { url: `${COURSE}?problem=2` } },
    sleep(1500),
    ...toggle('startedP2'),
    state('p2Empty'),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    across('formula-block', 'lineF'),
    ...drag('lineF', 6, 'mouse'),
    sleep(500),
    state('p2F'),
    E(`(history.pushState(null, '', location.pathname + location.search + '#step-2'), true)`, 'fragment'),
    sleep(1600),
    state('p2Fragment'),
    across('intro', 'lineG', 40),
    ...drag('lineG', 6, 'mouse'),
    sleep(500),
    state('p2G'),
    E(`(history.replaceState(null, '', location.pathname + location.search), true)`, 'unfragment'),
    sleep(1600),
    state('p2Back'),
    // another tab saved newer ink for this page: this tab's save is refused, both are kept
    otherTabSaves('otherTab'),
    boardText('lineH'),
    ...drag('lineH', 4, 'mouse'),
    sleep(800),
    state('p2Conflict'),
    stored('storedAfterConflict'),
    shot(`${prefix}-5-save-refused`),
    // the unsaved ink stays in this tab when the address changes, and comes back with it
    E(`(history.pushState(null, '', location.pathname + location.search + '#elsewhere'), true)`, 'away'),
    sleep(1600),
    state('p2Away'),
    E(`(history.replaceState(null, '', location.pathname + location.search), true)`, 'backAgain'),
    sleep(1600),
    state('p2Returned'),
    // Stop and a new start in the same page: the unsaved ink is still there
    ...toggle('stopP2'),
    ...toggle('restartP2'),
    sleep(400),
    state('p2Restarted'),
    // a stored record that cannot be read is left untouched; new ink stays on the page only
    unreadableRecord('unreadableSha'),
    { cdp: 'Page.navigate', params: { url: `${COURSE}?problem=3` } },
    sleep(1500),
    ...toggle('startedP3'),
    state('p3Loaded'),
    ...press('WRITE'),
    ...press('INK_MOUSE'),
    across('formula-block', 'lineI'),
    ...drag('lineI', 6, 'mouse'),
    sleep(500),
    state('p3I'),
    // a right-button drag is not writing (menus stay the page's)
    mouse('mouseMoved', 1000, 700, { pointerType: 'mouse', buttons: 0 }),
    mouse('mousePressed', 1000, 700, { pointerType: 'mouse', button: 'right', buttons: 2 }),
    mouse('mouseMoved', 1100, 700, { pointerType: 'mouse', button: 'right', buttons: 2 }),
    mouse('mouseReleased', 1100, 700, { pointerType: 'mouse', button: 'right', buttons: 0 }),
    { cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } },
    { cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } },
    sleep(300),
    state('p3Right'),
    // ink over the playing lecture video: once the video has moved on, it is no longer shown as aligned
    across('lecture-video', 'lineJ', 60),
    ...drag('lineJ', 6, 'mouse'),
    sleep(200),
    state('p3VideoAt'),
    sleep(1800),
    state('p3VideoLater'),
    // INK-A1: a same-address paragraph change marks the content and the screen-fixed ink written over
    // it; ink over the unchanged heading stays aligned (control)
    across('intro', 'lineK', 40),
    ...drag('lineK', 6, 'mouse'),
    ...press('INK_DISPLAY'),
    across('intro', 'lineL', 80),
    ...drag('lineL', 6, 'mouse'),
    heading('lineN', 20),
    ...drag('lineN', 4, 'mouse'),
    ...press('INK_DISPLAY'),
    heading('lineM', 40),
    ...drag('lineM', 4, 'mouse'),
    sleep(400),
    state('a1Before'),
    E(`(document.getElementById('intro').textContent = 'Problem 3: find the determinant of C.', true)`, 'a1Change'),
    sleep(800),
    state('a1After'),
    // INK-A2: the paragraph changes while a stroke over it is being written
    across('intro', 'lineP', 120),
    mouse('mouseMoved', '$lineP.x0', '$lineP.y0', { pointerType: 'mouse', buttons: 0 }),
    mouse('mousePressed', '$lineP.x0', '$lineP.y0', { pointerType: 'mouse' }),
    mouse('mouseMoved', '$lineP.x1', '$lineP.y1', { pointerType: 'mouse', buttons: 1 }),
    mouse('mouseMoved', '$lineP.x2', '$lineP.y2', { pointerType: 'mouse', buttons: 1 }),
    E(`(document.getElementById('intro').textContent = 'Problem 4: find the rank of D.', true)`, 'a2Change'),
    sleep(500),
    mouse('mouseMoved', '$lineP.x3', '$lineP.y3', { pointerType: 'mouse', buttons: 1 }),
    mouse('mouseMoved', '$lineP.x4', '$lineP.y4', { pointerType: 'mouse', buttons: 1 }),
    mouse('mouseReleased', '$lineP.x4', '$lineP.y4', { pointerType: 'mouse' }),
    sleep(600),
    state('a2After'),
    stored('storedFinal'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed });
  const ink = (k) => v[k]?.ink;
  const ids = (k) => new Set(ink(k)?.visible ?? []);
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const shown = (k) => ink(k)?.shown ?? [];

  c('ink.mouse_off_by_default', 'in WRITE the mouse does not write until mouse writing is switched on (it keeps operating the page)',
    v.started === 'ok' && v.write0?.mode === 'WRITE' && ink('write0')?.mouseWrites === false && ink('mouseOff')?.visible.length === 0,
    { mode: v.write0?.mode, mouseWrites: ink('write0')?.mouseWrites, visible: ink('mouseOff')?.visible.length });
  const ab = shown('afterAB');
  c('ink.mouse_writes', 'with mouse writing on, two mouse strokes are two content strokes on the page (rendered over the magenta block), saved on this device; no text selection is made under them',
    ab.length === 2 && ab.every((s) => s.input === 'mouse' && s.display === 'content' && s.anchored) && ink('afterAB')?.status === 'saved' && v.pxA?.aMid?.ink > 0 && v.pageAfterAB?.collapsed === true,
    { shown: ab, status: ink('afterAB')?.status, pixels: v.pxA, page: v.pageAfterAB });
  c('ink.nav_never_draws', 'NAV never draws, even with mouse writing on; returning to WRITE keeps mouse writing on',
    v.navDrag?.mode === 'NAV' && same(ids('navDrag'), ids('afterAB')) && ink('erased')?.mouseWrites === true,
    { mode: v.navDrag?.mode, visible: ink('navDrag')?.visible.length });
  const A = ab[0]?.id;
  const pieces = shown('erased').filter((s) => s.derived_from === A);
  c('ink.partial_erase', 'the eraser removes only what it passes over: A is replaced by two pieces derived from it (the original is kept), the block shows through where it passed, and the rest of A is still drawn',
    A && !ids('erased').has(A) && pieces.length === 2 && ink('erased')?.strokes === 4 && ink('erased')?.history.at(-1) === 'erase' && v.pxErased?.aMid?.ink === 0 && v.pxErased?.aMid?.magenta > 0 && v.pxErased?.aLeft?.ink > 0 && v.pxErased?.aRight?.ink > 0,
    { pieces: pieces.length, strokes: ink('erased')?.strokes, history: ink('erased')?.history, pixels: v.pxErased });
  c('ink.undo_redo', 'undo brings A back whole (drawn again under the eraser path); redo removes that part again',
    ids('undone').has(A) && v.pxUndone?.aMid?.ink > 0 && same(ids('redone'), ids('erased')) && v.pxRedone?.aMid?.ink === 0 && ink('redone')?.redo === 0,
    { undone: ink('undone')?.visible, redone: ink('redone')?.visible, pixels: { undone: v.pxUndone, redone: v.pxRedone } });
  c('ink.ask_returns_to_write', 'an ASK started from WRITE returns to WRITE when it finishes (one capture received) and when it is cancelled; mouse writing stays on',
    v.askFinished?.mode === 'WRITE' && v.askFinished?.captures === 1 && v.askFinished?.last?.inputMode === 'explicit_text_ask' && v.asking?.mode === 'ASK' && v.askCancelled?.mode === 'WRITE' && ink('askCancelled')?.mouseWrites === true,
    { finished: v.askFinished?.mode, captures: v.askFinished?.captures, last: v.askFinished?.last, asking: v.asking?.mode, cancelled: v.askCancelled?.mode });
  const cd = shown('afterCD');
  c('ink.keeps_writing_after_ask', 'writing continues after the ASK: C (content) and D (screen-fixed) are added',
    cd.length === 5 && cd.filter((s) => s.display === 'screen').length === 1 && ink('afterCD')?.history.join(',') === 'add,add,erase,undo,redo,add,add',
    { shown: cd.length, history: ink('afterCD')?.history });
  c('ink.writing_requests_nothing', 'writing, erasing, undo and redo never ask for anything: the only capture is the one ASK mark',
    [v.afterAB, v.erased, v.undone, v.redone].every((s) => s?.captures === 0) && v.afterCD?.captures === 1 && v.afterBurst?.captures === 0,
    { captures: { afterAB: v.afterAB?.captures, erased: v.erased?.captures, afterCD: v.afterCD?.captures, afterBurst: v.afterBurst?.captures } });
  c('ink.content_and_screen_display', 'after scrolling 150 px, content ink moved with the block (still drawn over it) and screen ink stayed at its screen position',
    v.pxScrolledBlock?.aLeft?.ink > 0 && v.pxScrolledMargin?.d?.screenInk > 0,
    { block: v.pxScrolledBlock, margin: v.pxScrolledMargin });
  const before = v.storedBeforeReload?.find((r) => r.sha === ink('afterCD')?.page?.address_sha256);
  const ro = ink('reopened');
  c('ink.reopen_after_reload', 'after a reload and a new start, the same strokes and history come back from this device, drawn where they were',
    v.restarted === 'ok' && same(ids('reopened'), ids('afterCD')) && ro?.history.join(',') === ink('afterCD')?.history.join(',') && ro?.status === 'ready' && /reopened 5 stroke/.test(ro?.reason ?? '') && before?.revision === ink('afterCD')?.revision && v.pxReopened?.aLeft?.ink > 0,
    { visible: ro?.visible.length, history: ro?.history, status: ro?.status, reason: ro?.reason, stored: before });
  c('ink.reopen_alignment', 'reopened on unchanged content: content ink is verified in place, and screen-fixed ink is verified against what it was written over (still on the page, unchanged)',
    shown('reopened').length === 5 && shown('reopened').every((s) => s.uncertain === false),
    { shown: shown('reopened').map((s) => ({ display: s.display, uncertain: s.uncertain })) });
  c('ink.edit_after_reopen', 'editing continues after reopening: undo and redo act on the history from before the reload, and new strokes are saved',
    ink('reopenedUndo')?.visible.length === 4 && ink('reopenedRedo')?.visible.length === 5 && ink('afterBurst')?.visible.length === 8 && ink('afterBurst')?.status === 'saved',
    { undo: ink('reopenedUndo')?.visible.length, redo: ink('reopenedRedo')?.visible.length, afterBurst: ink('afterBurst')?.visible.length, status: ink('afterBurst')?.status });
  const burst = v.storedAfterBurst?.find((r) => r.sha === ink('afterBurst')?.page?.address_sha256);
  c('ink.overlapping_saves', 'three back-to-back strokes while each save takes 400 ms: saves were requested while another was running, and all are stored in order (stored revision and history equal the page’s)',
    v.slowSaves === true && ink('afterBurst')?.overlappingSaves > 0 && burst && burst.revision === ink('afterBurst')?.revision && burst.history.join(',') === ink('afterBurst')?.history.join(','),
    { overlappingSaves: ink('afterBurst')?.overlappingSaves, stored: burst, page: { revision: ink('afterBurst')?.revision, history: ink('afterBurst')?.history } });
  const ch = shown('reopenedChanged');
  const byId = (k, id) => shown(k).find((s) => s.id === id);
  const bId = ab[1]?.id;
  const cId = cd.find((s) => s.display === 'content' && s.derived_from === null && s.id !== bId)?.id;
  const headingId = shown('afterBurst').find((s) => !ids('reopenedRedo').has(s.id))?.id; // the first of the three back-to-back strokes
  const unmoved = shown('afterBurst').every((s) => JSON.stringify(byId('reopenedChanged', s.id)?.first) === JSON.stringify(s.first) && byId('reopenedChanged', s.id)?.points === s.points);
  c('ink.changed_content_marked', 'the same address with changed content: every stroke is kept in place (same points); the pieces of A over the moved block, B over the changed paragraph and C on the board whose block moved are marked unverified, the stroke over the unchanged heading is not; the hint counts the dashed strokes',
    ch.length === 8 && unmoved && pieces.every((p) => byId('reopenedChanged', p.id)?.uncertain === true) && byId('reopenedChanged', bId)?.uncertain === true && cId && byId('reopenedChanged', cId)?.uncertain === true && headingId && byId('reopenedChanged', headingId)?.uncertain === false &&
      new RegExp(`${ch.filter((s) => s.uncertain).length} stroke\\(s\\) dashed`).test(ink('reopenedChanged')?.hint ?? '') && ink('reopenedChanged')?.history.join(',') === ink('afterBurst')?.history.join(','),
    { total: ch.length, unmoved, pieces: pieces.map((p) => byId('reopenedChanged', p.id)?.uncertain), B: byId('reopenedChanged', bId)?.uncertain, C: cId && byId('reopenedChanged', cId)?.uncertain, heading: headingId && byId('reopenedChanged', headingId)?.uncertain, uncertain: ch.filter((s) => s.uncertain).length, hint: ink('reopenedChanged')?.hint });
  const shaMain = ink('afterCD')?.page?.address_sha256;
  c('ink.address_identity', 'another query is another document (empty, other fingerprint); a fragment change switches to that address’s document in place; returning brings back the first one',
    ink('p2Empty')?.visible.length === 0 && ink('p2Empty')?.page?.address_sha256 !== shaMain && ink('p2F')?.visible.length === 1 && ink('p2Fragment')?.visible.length === 0 &&
      ink('p2Fragment')?.page?.address_sha256 !== ink('p2F')?.page?.address_sha256 && ink('p2G')?.status === 'saved' && ink('p2Back')?.visible.length === 1 && ink('p2Back')?.page?.address_sha256 === ink('p2F')?.page?.address_sha256,
    { p2Empty: ink('p2Empty')?.visible.length, p2F: ink('p2F')?.visible.length, p2Fragment: ink('p2Fragment')?.visible.length, p2Back: ink('p2Back')?.visible.length });
  const conflict = v.storedAfterConflict?.find((r) => r.sha === ink('p2Back')?.page?.address_sha256);
  c('ink.save_refused_nothing_overwritten', 'when another tab saved newer ink, this tab’s save is refused as a conflict and the hint says this tab’s new ink cannot be saved and is gone after a reload; this tab keeps its stroke and the other tab’s stored ink is not overwritten',
    v.otherTab === true && ink('p2Conflict')?.status === 'conflict' && /another tab/.test(ink('p2Conflict')?.reason ?? '') && ink('p2Conflict')?.visible.length === 2 && conflict?.otherTab === true && conflict?.history.join(',') === 'add,add' && /cannot be saved/.test(ink('p2Conflict')?.hint ?? '') && /reload/.test(ink('p2Conflict')?.hint ?? ''),
    { status: ink('p2Conflict')?.status, reason: ink('p2Conflict')?.reason, visible: ink('p2Conflict')?.visible.length, stored: conflict, hint: ink('p2Conflict')?.hint });
  c('ink.unsaved_kept_in_tab', 'ink that could not be saved stays in this tab when the address changes (counted in the hint) and comes back, still marked unsaved; it also survives Stop and a new start in the same page',
    ink('p2Away')?.visible.length === 0 && ink('p2Away')?.held === 1 && /other address/.test(ink('p2Away')?.hint ?? '') && ink('p2Returned')?.visible.length === 2 && ink('p2Returned')?.status === 'conflict' && ink('p2Returned')?.held === 0 &&
      v.stopP2 === 'ok' && v.restartP2 === 'ok' && ink('p2Restarted')?.visible.length === 2 && ink('p2Restarted')?.status === 'conflict',
    { away: { visible: ink('p2Away')?.visible.length, held: ink('p2Away')?.held }, returned: { visible: ink('p2Returned')?.visible.length, status: ink('p2Returned')?.status }, restarted: { visible: ink('p2Restarted')?.visible.length, status: ink('p2Restarted')?.status } });
  const bad = v.storedFinal?.find((r) => r.sha === v.unreadableSha);
  c('ink.unreadable_left_untouched', 'a stored record that cannot be read is reported and left untouched; new ink stays on the page only',
    ink('p3Loaded')?.status === 'off' && /could not be used/.test(ink('p3Loaded')?.reason ?? '') && ink('p3I')?.visible.length === 1 && ink('p3I')?.status === 'off' && bad?.format === 'something-else',
    { loaded: { status: ink('p3Loaded')?.status, reason: ink('p3Loaded')?.reason }, afterWrite: ink('p3I')?.visible.length, stored: bad });
  c('ink.right_button_not_writing', 'a right-button drag with mouse writing on writes nothing', ink('p3Right')?.visible.length === ink('p3I')?.visible.length, { before: ink('p3I')?.visible.length, after: ink('p3Right')?.visible.length });
  const j = shown('p3VideoLater').at(-1);
  c('ink.video_moved_on', 'ink written over the playing lecture video is aligned when written and marked unverified once the video has moved on',
    shown('p3VideoAt').length === 2 && shown('p3VideoAt').at(-1)?.uncertain === false && j?.anchored === true && j?.uncertain === true,
    { at: shown('p3VideoAt').at(-1), later: j });
  const fresh = (k, before) => shown(k).filter((s) => !new Set(ink(before)?.visible ?? []).has(s.id));
  const [K, L, N, M] = fresh('a1Before', 'p3VideoLater');
  const now = (k, s) => byId(k, s?.id)?.uncertain;
  c('ink.source_change_marks_both_placements', 'INK-A1: after the paragraph is replaced at the same address, content ink and screen-fixed ink written over it are marked; content and screen-fixed ink over the unchanged heading stay aligned',
    K?.display === 'content' && L?.display === 'screen' && N?.display === 'screen' && M?.display === 'content' && [K, L, N, M].every((s) => s.uncertain === false) &&
      now('a1After', K) === true && now('a1After', L) === true && now('a1After', N) === false && now('a1After', M) === false,
    { before: [K, L, N, M].map((s) => s && { display: s.display, uncertain: s.uncertain }), after: [K, L, N, M].map((s) => now('a1After', s)) });
  const P = fresh('a2After', 'a1After')[0];
  c('ink.change_during_stroke_marked', 'INK-A2: a stroke over the paragraph during which the paragraph changes is kept but marked (not attached to the new text); the heading control stays aligned',
    P?.display === 'content' && P.uncertain === true && now('a2After', M) === false, { stroke: P, control: now('a2After', M) });
  c('ink.no_raw_address_stored', 'stored records carry the origin and a SHA-256 of the exact address, never the path, query or fragment text',
    (v.storedFinal ?? []).length >= 4 && v.storedFinal.every((r) => /^[0-9a-f]{64}$/.test(r.sha) && r.rawAddressParts === false),
    { records: v.storedFinal });
  return checks;
}

const shipped = join(MODULE, 'webextension');
const result = await runCdp({ moduleDir: MODULE, browser: args.browser, run: prefix, outDir, steps: steps(), note, extensionDir: shipped });
const values = result.values ?? {};
const checks = evaluate(values);
const failed = checks.filter((x) => !x.pass).map((x) => x.id);
const report = {
  kind: 'lc-web-ink-check/v1',
  scope:
    'WRITE ink with the shipped WebExtension (apps/safari-extension/webextension) loaded unpacked in Edge headless on Windows via WSL2, on a local synthetic course page, trusted CDP mouse input on the page. ' +
    'Toolbar press made with DevTools Extensions.triggerAction on the page tab (not a human click). Harness controls: state read through the worker; rendered pixels read from a captureVisibleTab image in the worker; the "other tab" and "unreadable" records written into the extension IndexedDB by the worker. ' +
    'Desktop mouse writing only: not Safari, iPad, Pencil or pen-pressure evidence; no course account.',
  browser: values.userAgent ?? null,
  summary: { total: checks.length, passed: checks.length - failed.length, failed },
  checks,
  runner_errors: result.errors ?? [],
  screenshots: result.screenshots ?? [],
  values,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, `${prefix}.log`), `${log.join('\n')}\n`);
note(`ink checks passed ${checks.length - failed.length}/${checks.length}; failed: ${failed.join(', ') || 'none'}; runner errors: ${report.runner_errors.length}`);
process.exitCode = failed.length === 0 && report.runner_errors.length === 0 ? 0 : 1;
