// QA P0-13/P0-07 original-page component pass: the shipped WebExtension entry, unchanged, in a fresh
// headless Edge profile, on a synthetic owned course page (controlled lifecycle cases) and on one
// current public learning page. Desktop Edge only: not Safari, iPad, Pencil, AI or either core gate.
//
// Invocation: DevTools Extensions.triggerAction on the page's tab runs the extension's own
// action.onClicked and grants activeTab (QA-measured, 5eb825b); it is not a human toolbar click.
// Harness instrumentation, labeled in the evidence:
//   - chrome.tabs.captureVisibleTab is wrapped inside the extension's worker. The wrapper passes
//     every call through and records when it ran, which tab was active and the PNG it returned. For
//     the stand-in cases only, it waits before and/or after the real capture ("timing stand-in"),
//     so a user action can land inside the capture window. Real-timing cases use no wait.
//   - Companion state is read through the worker (scripting.executeScript, the extension's isolated
//     world); the page cannot reach it.
//   - One case sends the product's own capture message from tab A's top frame (isolated world) to
//     exercise the real background fence directly; it is labeled "harness-issued request".
//
// Usage: QA_SOURCE=<exact copy with built dist> QA_BASELINE=<sha> LC_WEB_FIXTURE_PORT=4184 \
//          [QA_SCENARIO=pass|repro] node run.mjs <raw output dir (outside the repo)>
//   pass (default): the component pass (owned page, then the public page).
//   repro: the two region findings again, an attribute-only layout shift, and real-timing attempts
//          (no stand-in) at scroll-away-and-back and at a style shift after the mark (owned page only).
// Refuses to run unless the copy equals the commit (provenance.py), the generated extension is
// current (build-webextension.mjs --check) and port 4184 is free. Never uses 4173/8174.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect as connectSocket } from 'node:net';
import { join } from 'node:path';

const SOURCE = process.env.QA_SOURCE;
const BASELINE = process.env.QA_BASELINE;
const OUT = process.argv[2];
const HERE = new URL('.', import.meta.url).pathname;
const WORKTREE = new URL('../../../..', import.meta.url).pathname;
if (!SOURCE || !BASELINE || !OUT) throw new Error('QA_SOURCE, QA_BASELINE and an output dir are required');
if (process.env.LC_WEB_FIXTURE_PORT !== '4184') throw new Error('LC_WEB_FIXTURE_PORT must be 4184 (QA-owned)');
const MODULE = join(SOURCE, 'apps/safari-extension');
const NODE = process.execPath;
const EDGE = '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PUBLIC_URL = 'https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors';
const PORT = 4184;
mkdirSync(OUT, { recursive: true });
for (const f of ['raw.json', 'raw-repro.json']) if (existsSync(join(OUT, f)) && ((process.env.QA_SCENARIO ?? 'pass') === 'repro') === (f === 'raw-repro.json')) throw new Error(`${f} exists in ${OUT}; use a new output dir (runs are never overwritten)`);

const log = [];
let redactions = [];
const redact = (text) => redactions.reduce((s, r) => s.split(r).join('%TEMP%'), String(text));
const note = (line) => { const safe = redact(line); log.push(`${new Date().toISOString()} ${safe}`); console.log(safe); };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const busy = (port) => new Promise((ok) => { const s = connectSocket({ host: '127.0.0.1', port }, () => { s.destroy(); ok(true); }); s.on('error', () => ok(false)); });

// ---- preconditions ---------------------------------------------------------------------------------
const provenance = JSON.parse(execFileSync('python3', [join(HERE, '../preview_recovery/provenance.py'), WORKTREE, BASELINE, SOURCE, 'apps/safari-extension'], { encoding: 'utf8' }));
if (provenance.mismatches.length) throw new Error(`copy differs from ${BASELINE}: ${provenance.mismatches.slice(0, 5)}`);
const generated = execFileSync(NODE, ['scripts/build-webextension.mjs', '--check'], { cwd: MODULE, encoding: 'utf8' }).trim();
if (await busy(PORT)) throw new Error(`port ${PORT} is in use; refusing to run`);
const windowsListeners = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-NetTCPConnection -State Listen -LocalPort ${PORT} -ErrorAction SilentlyContinue | Measure-Object).Count`], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
if (windowsListeners !== '0') throw new Error(`port ${PORT} is in use on the Windows side; refusing to run`);
const shipped = join(MODULE, 'webextension');
const shippedFiles = Object.fromEntries(readdirSync(shipped).sort().map((f) => [f, sha(readFileSync(join(shipped, f)))]));
const tracked = execFileSync('git', ['-C', WORKTREE, 'ls-tree', '--name-only', BASELINE, 'apps/safari-extension/webextension/'], { encoding: 'utf8' }).trim().split('\n').map((p) => p.split('/').pop()).sort();
if (JSON.stringify(tracked) !== JSON.stringify(Object.keys(shippedFiles))) throw new Error(`shipped folder files ${Object.keys(shippedFiles)} differ from the tracked set ${tracked}`);
const harness = Object.fromEntries(['run.mjs', 'qa-cdp-runner.ps1', 'analyze.py'].map((f) => [f, sha(readFileSync(join(HERE, f)))]));
note(`baseline ${provenance.commit}; ${provenance.files_checked} files match; ${generated.split('\n').length} generated files current; port ${PORT} free`);

const { E, clickAt, drag, shot, sleep } = await import(join(MODULE, 'scripts/cdp-harness.mjs'));
const { startFixtureServer, PORT: FIXTURE_PORT } = await import(join(MODULE, 'scripts/fixture-server.mjs'));
if (FIXTURE_PORT !== PORT) throw new Error(`fixture server port ${FIXTURE_PORT} is not ${PORT}`);

// ---- step builders -------------------------------------------------------------------------------
const SW = (e, as) => ({ swEval: e, as });
const A = 'globalThis.__qaA';
const B = 'globalThis.__qaB';
const trigger = (as, url) => [{ triggerAction: true, as, ...(url ? { url } : {}) }, sleep(700)];
/** Companion state in tab `tab` (isolated world), without toolbar geometry. */
const state = (as, tab = A) => SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${tab}, frameIds: [0] }, func: () => (globalThis.__lcCompanion ? globalThis.__lcCompanion.state() : null) }); const s = r.result; if (s) delete s.toolbar; return s; })()`, as);
const toolbarPoint = (mode, as) => SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, args: [${JSON.stringify(mode)}], func: (m) => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); const t = s && s.toolbar && s.toolbar[m]; return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : null; } }); return r.result; })()`, as);
const press = (mode) => [toolbarPoint(mode, `tb${mode}`), ...clickAt(`tb${mode}`)];
const stopPoint = (as) => SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, func: () => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); const t = s && s.stopRect; return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : null; } }); return r.result; })()`, as);
const hosts = (as) => E(`({ probe: !!document.querySelector('[data-lc-web-probe]'), panel: !!document.querySelector('[data-lc-companion-capture]'), href: location.href, scrollY: scrollY, hidden: document.hidden })`, as);
const badge = (as, tab = A) => SW(`chrome.action.getBadgeText({ tabId: ${tab} })`, as);
const realTry = (as) => SW(`chrome.tabs.captureVisibleTab({ format: 'png' }).then((d) => 'captured ' + d.length, (e) => 'refused: ' + e.message)`, as);
/** Pass-through wrapper of captureVisibleTab in the worker (see the header). */
const installWrapper = SW(`(() => { const t = chrome.tabs; if (t.__qaReal) return 'already'; const real = t.captureVisibleTab.bind(t); t.__qaReal = real; const q = globalThis.__qa = { log: [], read: 0, before: 0, after: 0 };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  t.captureVisibleTab = async (...a) => { const e = { n: q.log.length + 1, calledAt: new Date().toISOString(), before: q.before, after: q.after }; q.log.push(e);
    if (q.before) await wait(q.before);
    const [act] = await t.query({ active: true, lastFocusedWindow: true }); e.activeAtCapture = act ? act.id : null; e.activeUrlAtCapture = act ? act.url : null; e.captureStartedAt = new Date().toISOString();
    try { const d = await real(...a); e.capturedAt = new Date().toISOString(); e.ok = true; e.dataUrl = d; if (q.after) await wait(q.after);
      const [back] = await t.query({ active: true, lastFocusedWindow: true }); e.activeAtReturn = back ? back.id : null; e.returnedAt = new Date().toISOString(); return d; }
    catch (err) { e.ok = false; e.error = String((err && err.message) || err); throw err; } };
  return 'installed'; })()`, 'wrapper');
const delays = (before, after) => SW(`(globalThis.__qa.before = ${before}, globalThis.__qa.after = ${after}, true)`, `delay_${before}_${after}`);
/** The wrapper records since the last read (with the PNG data URLs). */
const capLog = (as) => SW(`(() => { const q = globalThis.__qa; if (!q) return { lost: true }; const out = q.log.slice(q.read); q.read = q.log.length; return { total: q.log.length, entries: out }; })()`, as);
const activate = (tab, as) => SW(`chrome.tabs.update(${tab}, { active: true }).then(() => new Date().toISOString())`, as);
const now = (as) => SW(`new Date().toISOString()`, as);
/** The product's own capture message, sent by the harness from tab A's top frame (isolated world). */
const harnessRequest = `chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, func: async () => { const r = await chrome.runtime.sendMessage({ type: 'lc-capture/v1' }); return r && { ok: r.ok, reason: r.reason || null, length: r.dataUrl ? r.dataUrl.length : 0 }; } }).then((x) => x[0].result, (e) => 'error: ' + e.message)`;
const geo = (sel, as) => E(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e ? e.getBoundingClientRect() : null; return { rect: r && { x: r.left, y: r.top, width: r.width, height: r.height }, dpr: devicePixelRatio, scrollX, scrollY, clientW: document.documentElement.clientWidth, clientH: document.documentElement.clientHeight }; })()`, as);
const loopAround = (sel, inset, as) => E(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const i = ${inset}; const x0 = r.left + i, y0 = r.top + i, x1 = r.right - i, y1 = r.bottom - i; const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + 1, y0 + 1]]; const o = {}; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, as);
/** A closed pen loop inside the board's magenta block; `settle` false leaves out the trailing wait. */
const penBlock = (as, settle = true) => { const d = drag(as, 4, 'pen'); return [loopAround('#formula-block', 14, as), ...(settle ? d : d.slice(0, -1))]; };
const wheel = (dy, as) => [{ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 640, y: 500, deltaX: 0, deltaY: dy, pointerType: 'mouse' } }, sleep(600), E('scrollY', as)];

// ---- run 1: owned synthetic course page (controlled lifecycle cases) --------------------------------
const PAGE = `http://127.0.0.1:${PORT}/fixture/course.html`;
const PAGE_B = `${PAGE}?qa=tab-b`;
const PAGE_NAV = `${PAGE}?qa=navigated`;
function fixtureSteps() {
  return [
    // F0 not a web page: the action refuses and says so on the button
    ...trigger('actionOnBlank'),
    SW(`(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id)()`, 'blankTab'),
    SW(`(async () => { const id = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id; return { badge: await chrome.action.getBadgeText({ tabId: id }), title: await chrome.action.getTitle({ tabId: id }) }; })()`, 'blankBadge'),
    // F1 the original page; no capture before the action; then the action
    { cdp: 'Page.navigate', params: { url: PAGE } },
    sleep(1500),
    hosts('beforeStart'),
    realTry('captureBeforeAction'),
    installWrapper,
    ...trigger('started'),
    SW(`(async () => (globalThis.__qaA = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id))()`, 'tabA'),
    state('s0'),
    hosts('afterStart'),
    badge('badgeOn'),
    shot('qa-f1-started'),
    // F2 NAV: the page's own link and wheel scrolling work; nothing is captured
    E(`(() => { const r = document.getElementById('next-part').getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 }; })()`, 'link'),
    ...clickAt('link'),
    sleep(400),
    hosts('afterLink'),
    E(`(history.replaceState(null, '', location.pathname), window.scrollTo(0, 0), true)`, 'reset1'),
    sleep(300),
    ...wheel(400, 'afterWheel'),
    E(`(window.scrollTo(0, 0), scrollY)`, 'reset2'),
    sleep(300),
    capLog('logNav'),
    // F3 one region mark over the figure, real timing
    ...press('ASK'),
    geo('#formula-block', 'geoRegion'),
    ...penBlock('loopRegion'),
    sleep(1500),
    state('region'),
    capLog('logRegion'),
    shot('qa-f3-region'),
    // F3b same-document navigation after a received snapshot: it stays labelled old, with its own page
    E(`(history.pushState(null, '', location.pathname + '?qa=spa'), location.href)`, 'spaHref'),
    sleep(400),
    state('afterSpa'),
    E(`(history.replaceState(null, '', location.pathname), location.href)`, 'spaBack'),
    sleep(300),
    // F4 a mark over the playing lecture video, real timing (media labels)
    ...press('ASK'),
    E(`(() => { const v = document.getElementById('lecture-video'); v.scrollIntoView({ block: 'center' }); const r = v.getBoundingClientRect(); const i = 30; const pts = [[r.left + i, r.top + i], [r.right - i, r.top + i], [r.right - i, r.bottom - i], [r.left + i, r.bottom - i], [r.left + i + 1, r.top + i + 1]]; const o = {}; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, 'vloop'),
    ...drag('vloop', 4, 'pen'),
    sleep(1500),
    state('video'),
    capLog('logVideo'),
    E(`(window.scrollTo(0, 0), true)`, 'reset3'),
    sleep(300),
    // F5 scroll right after the mark, real timing (no stand-in)
    ...press('ASK'),
    ...penBlock('loopRealScroll', false),
    E(`(window.scrollBy(0, 120), scrollY)`, 'realScrollY'),
    sleep(1500),
    state('realScroll'),
    capLog('logRealScroll'),
    E(`(window.scrollTo(0, 0), true)`, 'reset4'),
    sleep(300),
    // F6 scroll away and back inside the capture window (timing stand-in: 700 ms before, 1600 ms after)
    delays(700, 1600),
    ...press('ASK'),
    geo('#formula-block', 'geoScrollAba'),
    ...penBlock('loopScrollAba', false),
    E(`(window.scrollBy(0, 300), scrollY)`, 'abaScrolledTo'),
    sleep(1200),
    E(`(window.scrollBy(0, -300), scrollY)`, 'abaScrolledBack'),
    sleep(2200),
    state('scrollAba'),
    capLog('logScrollAba'),
    // F7 same-address content change that moves the marked content (stand-in 700/1600)
    ...press('ASK'),
    geo('#formula-block', 'geoShift'),
    ...penBlock('loopShift', false),
    E(`(() => { const d = document.createElement('div'); d.id = 'qa-shift'; d.style.height = '300px'; d.style.background = '#ffffff'; document.body.prepend(d); return { scrollY, blockTop: document.getElementById('formula-block').getBoundingClientRect().top }; })()`, 'shifted'),
    sleep(2600),
    state('contentShift'),
    capLog('logShift'),
    E(`(document.getElementById('qa-shift').remove(), window.scrollTo(0, 0), true)`, 'unshift'),
    sleep(300),
    // F8 resize during the capture window (stand-in 700/1600; DevTools metrics override)
    ...press('ASK'),
    ...penBlock('loopResize', false),
    { cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false } },
    E(`({ w: innerWidth, h: innerHeight })`, 'resizedTo'),
    sleep(2600),
    state('resized'),
    capLog('logResize'),
    { cdp: 'Emulation.clearDeviceMetricsOverride', params: {} },
    sleep(500),
    E(`(window.scrollTo(0, 0), { w: innerWidth, h: innerHeight })`, 'unresized'),
    // F9 tab A -> B -> A with B also granted (the companion started there by its own action)
    delays(0, 0),
    SW(`(async () => (globalThis.__qaB = (await chrome.tabs.create({ url: ${JSON.stringify(PAGE_B)}, active: true })).id))()`, 'tabB'),
    sleep(1800),
    ...trigger('startedOnB', PAGE_B),
    state('sB', B),
    activate(A, 'backToA0'),
    sleep(600),
    hosts('aVisibleAgain'),
    // F9a harness-issued request, stable tab (positive control of the direct path)
    SW(harnessRequest, 'bgStable'),
    capLog('logBgStable'),
    // F9b harness-issued request with A -> B -> A inside the capture window (stand-in 700/1600)
    delays(700, 1600),
    SW(`(globalThis.__qaReq = ${harnessRequest}, new Date().toISOString())`, 'bgAbaStarted'),
    sleep(250),
    activate(B, 'bgToB'),
    sleep(1000),
    activate(A, 'bgBackToA'),
    SW(`globalThis.__qaReq`, 'bgAba'),
    capLog('logBgAba'),
    sleep(400),
    // F9d harness-issued request with a same-document address change inside the capture window (stand-in)
    SW(`(globalThis.__qaReq = ${harnessRequest}, new Date().toISOString())`, 'bgNavStarted'),
    sleep(250),
    E(`(history.pushState(null, '', location.pathname + '?qa=spa2'), location.href)`, 'bgNavPushed'),
    SW(`globalThis.__qaReq`, 'bgNav'),
    capLog('logBgNav'),
    E(`(history.replaceState(null, '', location.pathname), location.href)`, 'bgNavBack'),
    sleep(400),
    // F9c the product flow: a mark on A, then A -> B -> A inside the capture window
    ...press('ASK'),
    ...penBlock('loopTabAba', false),
    sleep(300),
    activate(B, 'toB'),
    sleep(1000),
    activate(A, 'backToA'),
    sleep(2200),
    state('tabAba'),
    capLog('logTabAba'),
    shot('qa-f9-tab-aba'),
    SW(`chrome.tabs.remove(${B}).then(() => true)`, 'closedB'),
    sleep(400),
    // F10 a real navigation of the tab while a capture is in flight (stand-in 700/1600)
    ...press('ASK'),
    ...penBlock('loopNav', false),
    sleep(300),
    { cdp: 'Page.navigate', params: { url: PAGE_NAV } },
    sleep(2800),
    hosts('afterNav'),
    state('stateAfterNav'),
    badge('badgeAfterNav'),
    capLog('logNav2'),
    // F11 Stop (the action again) while a capture is in flight; then one normal action restarts
    ...trigger('startedAfterNav'),
    state('s3'),
    ...press('ASK'),
    ...penBlock('loopStop', false),
    sleep(300),
    now('stopPressedAt'),
    ...trigger('stopInFlight'),
    sleep(2400),
    hosts('afterStopInFlight'),
    state('stateAfterStop'),
    badge('badgeAfterStop'),
    capLog('logStopInFlight'),
    delays(0, 0),
    ...trigger('restarted'),
    state('s4'),
    ...press('ASK'),
    ...penBlock('loopRestart'),
    sleep(1500),
    state('afterRestart'),
    capLog('logRestart'),
    shot('qa-f11-restarted'),
    // F12 the panel's Stop with a trusted mouse click; restart; after a final Stop nothing captures
    stopPoint('stopAt'),
    ...clickAt('stopAt'),
    sleep(600),
    hosts('afterPanelStop'),
    state('stateAfterPanelStop'),
    badge('badgeAfterPanelStop'),
    ...trigger('restartedAfterPanelStop'),
    state('s5'),
    ...trigger('finalStop'),
    sleep(500),
    E(`(window.__qaPointer = { down: 0, up: 0 }, addEventListener('pointerdown', () => window.__qaPointer.down++, true), addEventListener('pointerup', () => window.__qaPointer.up++, true), true)`, 'pointerCounter'),
    ...penBlock('loopAfterStop'),
    E(`({ pointer: window.__qaPointer, hosts: !!document.querySelector('[data-lc-web-probe],[data-lc-companion-capture]') })`, 'pageAfterStop'),
    sleep(800),
    capLog('logAfterStop'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

// ---- run 2: one current public learning page ------------------------------------------------------
function publicSteps() {
  const pick = (kind, as) => E(`(() => { const ok = (e) => { const q = e.getBoundingClientRect(); return q.width > ${kind === 'formula' ? 24 : 80} && q.height > ${kind === 'formula' ? 12 : 80}; };
    const el = Array.from(document.querySelectorAll(${JSON.stringify(kind === 'formula' ? '#mw-content-text .mwe-math-element' : '#mw-content-text figure img')})).find(ok); if (!el) return null;
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const pad = 6; const x0 = r.left - pad, y0 = r.top - pad, x1 = r.right + pad, y1 = r.bottom + pad;
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + 1, y0 + 1]]; const o = { el: { x: r.left, y: r.top, width: r.width, height: r.height }, scrollY, dpr: devicePixelRatio }; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, as);
  return [
    { cdp: 'Page.navigate', params: { url: PUBLIC_URL } },
    sleep(6000),
    E(`({ href: location.href, title: document.title })`, 'pubPage'),
    hosts('pubBefore'),
    realTry('pubCaptureBefore'),
    installWrapper,
    ...trigger('pubStarted'),
    SW(`(async () => (globalThis.__qaA = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id))()`, 'pubTab'),
    state('pubS0'),
    hosts('pubAfterStart'),
    // NAV: wheel scrolling and an in-page link work; nothing is captured
    ...wheel(900, 'pubAfterWheel'),
    E(`(() => { const a = Array.from(document.querySelectorAll('#mw-content-text a[href^="#"]')).find((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.top > 80 && r.bottom < innerHeight - 80 && r.left > 400 && r.right < innerWidth - 40; }); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: a.getAttribute('href'), scrollY }; })()`, 'pubLink'),
    ...clickAt('pubLink'),
    sleep(800),
    E(`({ hash: decodeURIComponent(location.hash), scrollY })`, 'pubAfterLink'),
    E(`(history.replaceState(null, '', location.pathname), window.scrollTo(0, 0), true)`, 'pubReset'),
    sleep(500),
    capLog('pubLogNav'),
    // a formula, then a figure, each one mark (real timing)
    ...press('ASK'),
    pick('formula', 'pubFormulaLoop'),
    ...drag('pubFormulaLoop', 4, 'pen'),
    sleep(2500),
    state('pubFormula'),
    capLog('pubLogFormula'),
    shot('qa-p-formula'),
    ...press('ASK'),
    pick('figure', 'pubFigureLoop'),
    ...drag('pubFigureLoop', 4, 'pen'),
    sleep(2500),
    state('pubFigure'),
    capLog('pubLogFigure'),
    shot('qa-p-figure'),
    // Stop, then one normal action restarts
    ...trigger('pubStopped'),
    hosts('pubAfterStop'),
    badge('pubBadgeAfterStop'),
    ...wheel(300, 'pubWheelAfterStop'),
    ...trigger('pubRestarted'),
    state('pubS1'),
    ...press('ASK'),
    pick('formula', 'pubFormulaLoop2'),
    ...drag('pubFormulaLoop2', 4, 'pen'),
    sleep(2500),
    state('pubAfterRestart'),
    capLog('pubLogRestart'),
    shot('qa-p-restart'),
    ...trigger('pubFinalStop'),
    hosts('pubAfterFinalStop'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

// ---- runner (QA copy of the candidate's cdp-runner.ps1; one added step option) ---------------------
async function runSteps(run, steps, shotsDir) {
  const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
  const tempUnix = execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim();
  redactions = [winTemp, tempUnix, winTemp.replace(/\\/g, '\\\\')];
  const work = join(tempUnix, `lc-qa-${run}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'out'), { recursive: true });
  mkdirSync(join(work, 'extension'), { recursive: true });
  const toWin = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
  for (const f of readdirSync(shipped)) writeFileSync(join(work, 'extension', f), readFileSync(join(shipped, f)));
  const copied = Object.fromEntries(readdirSync(join(work, 'extension')).sort().map((f) => [f, sha(readFileSync(join(work, 'extension', f)))]));
  if (JSON.stringify(copied) !== JSON.stringify(shippedFiles)) throw new Error('the loaded extension copy differs from the shipped folder');
  writeFileSync(join(work, 'qa-cdp-runner.ps1'), readFileSync(join(HERE, 'qa-cdp-runner.ps1')));
  writeFileSync(join(work, 'steps.json'), JSON.stringify(steps));
  const server = await startFixtureServer(MODULE, { log: note });
  let code = null;
  try {
    const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-cdp-runner.ps1')), '-Browser', toWin(EDGE),
      '-ProfileDir', toWin(join(work, 'profile')), '-StepsFile', toWin(join(work, 'steps.json')), '-OutDir', toWin(join(work, 'out')), '-ExtensionDir', toWin(join(work, 'extension'))];
    note(`run ${run}: fresh profile, unchanged shipped extension, ${steps.length} steps`);
    code = await new Promise((ok) => {
      const child = spawn('powershell.exe', psArgs, { cwd: '/mnt/c', stdio: ['ignore', 'pipe', 'pipe'] });
      for (const [stream, label] of [[child.stdout, 'ps'], [child.stderr, 'ps err']]) {
        let rest = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => { const parts = (rest + chunk).split(/\r?\n/); rest = parts.pop() ?? ''; parts.filter((l) => l.trim()).forEach((l) => note(`${label}: ${l.trim()}`)); });
      }
      const timer = setTimeout(() => child.kill(), 420000);
      child.on('exit', (c) => { clearTimeout(timer); ok(c); });
    });
    note(`run ${run}: runner exit ${code}`);
    const results = JSON.parse(readFileSync(join(work, 'out', 'cdp-results.json'), 'utf8').replace(/^﻿/, ''));
    mkdirSync(shotsDir, { recursive: true });
    results.screenshots = (results.screenshots ?? []).map((file) => {
      const name = String(file).split('\\').pop();
      writeFileSync(join(shotsDir, name), readFileSync(join(work, 'out', name)));
      return name;
    });
    return JSON.parse(redact(JSON.stringify({ ...results, runner_exit: code, steps_sha256: sha(Buffer.from(JSON.stringify(steps))) })));
  } finally {
    await server.close();
    const pidFile = join(work, 'out', 'browser.pid');
    if (code !== 0 && existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf8').replace(/[^0-9]/g, '');
      if (pid) spawnSync('taskkill.exe', ['/F', '/T', '/FI', `PID eq ${pid}`, '/FI', 'IMAGENAME eq msedge.exe'], { cwd: '/mnt/c', stdio: 'ignore' });
    }
    for (let i = 0; i < 5 && existsSync(work); i++) {
      try { rmSync(work, { recursive: true, force: true }); } catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    note(existsSync(work) ? `WARNING: temporary profile of ${run} not removed` : `run ${run}: temporary profile removed`);
  }
}

// ---- repro: the region findings again, plus variants (owned page only) ---------------------------
function reproSteps() {
  const attempt = (i, gap, hold) => [
    ...press('ASK'),
    ...penBlock(`rtLoop${i}`, false),
    ...(gap ? [sleep(gap)] : []),
    E(`(window.scrollBy(0, 300), scrollY)`, `rtAway${i}`),
    ...(hold ? [sleep(hold)] : []),
    E(`(window.scrollBy(0, -300), scrollY)`, `rtBack${i}`),
    sleep(900),
    state(`rt${i}`),
    capLog(`rtLog${i}`),
  ];
  const gaps = [0, 0, 10, 10, 20, 20, 30, 30, 40, 40, 0, 10, 20, 30, 40];
  const holds = [0, 20, 0, 20, 0, 20, 0, 20, 0, 20, 40, 40, 40, 40, 40];
  return [
    { cdp: 'Page.navigate', params: { url: PAGE } },
    sleep(1500),
    installWrapper,
    ...trigger('started'),
    SW(`(async () => (globalThis.__qaA = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id))()`, 'tabA'),
    // R1 scroll away and back inside the window (stand-in 700/1600), repeated
    delays(700, 1600),
    ...press('ASK'),
    geo('#formula-block', 'geoScrollAba'),
    ...penBlock('loopScrollAba', false),
    E(`(window.scrollBy(0, 300), scrollY)`, 'abaScrolledTo'),
    sleep(1200),
    E(`(window.scrollBy(0, -300), scrollY)`, 'abaScrolledBack'),
    sleep(2200),
    state('scrollAba'),
    capLog('logScrollAba'),
    // R2 content inserted above the mark (stand-in), repeated
    ...press('ASK'),
    ...penBlock('loopShift', false),
    E(`(() => { const d = document.createElement('div'); d.id = 'qa-shift'; d.style.height = '300px'; d.style.background = '#ffffff'; document.body.prepend(d); return { scrollY, blockTop: document.getElementById('formula-block').getBoundingClientRect().top }; })()`, 'shifted'),
    sleep(2600),
    state('contentShift'),
    capLog('logShift'),
    E(`(document.getElementById('qa-shift').remove(), window.scrollTo(0, 0), true)`, 'unshift'),
    sleep(300),
    // R3 an attribute-only layout shift (a style change above the mark, no node or text change; stand-in)
    ...press('ASK'),
    ...penBlock('loopStyle', false),
    E(`(() => { document.getElementById('intro').style.paddingTop = '300px'; return { scrollY, blockTop: document.getElementById('formula-block').getBoundingClientRect().top }; })()`, 'styleShifted'),
    sleep(2600),
    state('styleShift'),
    capLog('logStyle'),
    E(`(document.getElementById('intro').style.paddingTop = '', window.scrollTo(0, 0), true)`, 'unstyle'),
    sleep(300),
    // R4 real timing, no stand-in: scroll away and back right after the mark, several spacings
    delays(0, 0),
    ...gaps.flatMap((gap, i) => attempt(i, gap, holds[i])),
    // R5 real timing, no stand-in: a style change above the mark right after it (one way, then undone)
    E(`(window.scrollTo(0, 0), true)`, 'reset5'),
    ...[0, 0, 10, 20, 30].flatMap((gap, i) => [
      ...press('ASK'),
      ...penBlock(`rsLoop${i}`, false),
      ...(gap ? [sleep(gap)] : []),
      E(`(document.getElementById('intro').style.paddingTop = '300px', document.getElementById('formula-block').getBoundingClientRect().top)`, `rsShift${i}`),
      sleep(900),
      state(`rs${i}`),
      capLog(`rsLog${i}`),
      E(`(document.getElementById('intro').style.paddingTop = '', window.scrollTo(0, 0), true)`, `rsUndo${i}`),
      sleep(300),
    ]),
    E('navigator.userAgent', 'userAgent'),
  ];
}

const hex = randomBytes(3).toString('hex');
const startedAt = new Date().toISOString();
if ((process.env.QA_SCENARIO ?? 'pass') === 'repro') {
  const repro = await runSteps(`origpage-repro-${hex}`, reproSteps(), join(OUT, 'shots-repro'));
  writeFileSync(join(OUT, 'raw-repro.json'), JSON.stringify({ kind: 'qa-original-page-repro/v1', baseline: provenance.commit, provenance, generated_check: generated,
    shipped_files: shippedFiles, harness, port: PORT, started_at: startedAt, finished_at: new Date().toISOString(), repro }));
  writeFileSync(join(OUT, 'run-repro.log'), `${log.join('\n')}\n`);
  note(`repro raw results written; errors ${repro.errors?.length ?? '?'}`);
  process.exit(repro.runner_exit === 0 && !(repro.errors ?? []).length ? 0 : 1);
}
const fixture = await runSteps(`origpage-fixture-${hex}`, fixtureSteps(), join(OUT, 'shots-fixture'));
const publicPage = await runSteps(`origpage-public-${hex}`, publicSteps(), join(OUT, 'shots-public'));
writeFileSync(join(OUT, 'raw.json'), JSON.stringify({
  kind: 'qa-original-page-component/v1', baseline: provenance.commit, provenance, generated_check: generated, shipped_files: shippedFiles, harness,
  shipped_manifest: JSON.parse(readFileSync(join(shipped, 'manifest.json'), 'utf8')), port: PORT, public_url: PUBLIC_URL, started_at: startedAt,
  finished_at: new Date().toISOString(), fixture, public: publicPage,
}));
writeFileSync(join(OUT, 'run.log'), `${log.join('\n')}\n`);
note(`raw results written; fixture errors ${fixture.errors?.length ?? '?'}, public errors ${publicPage.errors?.length ?? '?'}`);
process.exitCode = [fixture, publicPage].every((r) => r.runner_exit === 0 && !(r.errors ?? []).length) ? 0 : 1;
