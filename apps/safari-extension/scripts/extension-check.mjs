#!/usr/bin/env node
// Desktop check of the WebExtension entry (webextension/) on a local course-like page, in Edge
// headless with the unpacked extension loaded and trusted CDP input on the page.
//
// The shipped folder is loaded unchanged (activeTab + scripting only). The toolbar press is made with
// DevTools Extensions.triggerAction on the page's tab, which runs the extension's own action.onClicked
// and grants activeTab as a press would (QA's measured method, 5eb825b); it is not a human click.
// Harness controls, labeled in the report: state is read through the worker (scripting.executeScript in
// the extension's isolated world), and for late-answer cases the harness delays captureVisibleTab
// inside the worker through CDP (test control, not product code).
// The page is a synthetic course page served locally; no course account or site is used. Not Safari,
// iPad or Pencil evidence.
//
// With --public-url, a second run does the same shipped flow on one public learning page (no account):
// toolbar action, ASK, a pen loop around the first rendered formula, and a capture. Its report keeps
// only non-content facts (sizes, hash, geometry, crop colour); page text and title are not recorded.
//
// Usage: node scripts/extension-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <prefix>] [--public-url <https url>]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './fixture-server.mjs';
import { E, clickAt, drag, runCdp, shot, sleep } from './cdp-harness.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.browser || !args.browser.startsWith('/mnt/')) {
  console.error('missing --browser <Windows browser executable under /mnt/...>');
  process.exit(2);
}
const prefix = (args.run ?? 'p0-07-extension').replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};

const SW = (e, as) => ({ swEval: e, as });
const TAB = `(await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]`;
/** The companion's state, read in the extension's isolated world of the page (not reachable by the page). */
const state = (as) => SW(`(async () => { const tab = ${TAB}; const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: () => (globalThis.__lcCompanion ? globalThis.__lcCompanion.state() : null) }); const s = r.result; if (s) delete s.toolbar; return s; })()`, as);
const toolbarPoint = (mode, as) =>
  SW(`(async () => { const tab = ${TAB}; const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, args: [${JSON.stringify(mode)}], func: (m) => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); const t = s && s.toolbar && s.toolbar[m]; return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : null; } }); return r.result; })()`, as);
/** The toolbar press: DevTools Extensions.triggerAction on this page's tab (activeTab granted as by a click). */
const toggle = (as) => [{ triggerAction: true, as }, sleep(700)];
const tryCapture = (as) => SW(`chrome.tabs.captureVisibleTab({ format: 'png' }).then((d) => 'captured ' + d.length, (e) => 'refused: ' + e.message)`, as);
const press = (mode) => [toolbarPoint(mode, `tb${mode}`), ...clickAt(`tb${mode}`)];
const delayCaptures = (ms) => SW(`(() => { const t = chrome.tabs; if (!t.__lcReal) t.__lcReal = t.captureVisibleTab; t.captureVisibleTab = (...a) => new Promise((ok, no) => setTimeout(() => t.__lcReal.apply(t, a).then(ok, no), ${ms})); return true; })()`, `delay${ms}`);
const realCaptures = SW(`(() => { const t = chrome.tabs; if (t.__lcReal) t.captureVisibleTab = t.__lcReal; return true; })()`, 'realCaptures');
const pageHosts = (as) => E(`({ probe: !!document.querySelector('[data-lc-web-probe]'), panel: !!document.querySelector('[data-lc-companion-capture]'), hash: location.hash })`, as);
const stopPoint = (as) =>
  SW(`(async () => { const tab = ${TAB}; const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: () => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); const t = s && s.stopRect; return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : null; } }); return r.result; })()`, as);
const badge = (as) => SW(`(async () => chrome.action.getBadgeText({ tabId: (${TAB}).id }))()`, as);
/** A closed pen loop inside the magenta block of the board (inset 14 px). */
const blockLoop = (as) =>
  E(`(() => { document.getElementById('board').scrollIntoView({ block: 'center' }); const r = document.getElementById('formula-block').getBoundingClientRect(); const i = 14; const pts = [[r.left + i, r.top + i], [r.left + r.width / 2, r.top + i], [r.right - i, r.top + i], [r.right - i, r.top + r.height / 2], [r.right - i, r.bottom - i], [r.left + r.width / 2, r.bottom - i], [r.left + i, r.bottom - i], [r.left + i, r.top + r.height / 2], [r.left + i + 1, r.top + i + 1]]; const o = {}; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, as);
const penLoop = (as) => [blockLoop(as), ...drag(as, 8, 'pen')];
/** A closed pen loop inside the lecture video (inset 30 px). */
const videoLoop = (as) =>
  E(`(() => { const v = document.getElementById('lecture-video'); v.scrollIntoView({ block: 'center' }); const r = v.getBoundingClientRect(); const i = 30; const pts = [[r.left + i, r.top + i], [r.right - i, r.top + i], [r.right - i, r.bottom - i], [r.left + i, r.bottom - i], [r.left + i + 1, r.top + i + 1]]; const o = {}; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, as);
/** Mouse path across a phrase of the intro paragraph (native text selection in ASK). */
const phrasePath = (phrase, as) =>
  E(`(() => { const t = document.getElementById('intro').firstChild; const i = t.textContent.indexOf(${JSON.stringify(phrase)}); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + ${JSON.stringify(phrase)}.length); t.parentElement.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); const o = {}; for (let k = 0; k <= 4; k++) { o['x' + k] = q.left + 1 + ((q.width - 2) * k) / 4; o['y' + k] = q.top + q.height / 2; } return o; })()`, as);

function steps(url) {
  return [
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    pageHosts('beforeStart'),
    tryCapture('captureBeforeAction'),
    ...toggle('started'),
    state('s0'),
    pageHosts('afterStart'),
    // NAV (default): the page's own link still works and nothing is captured
    E(`(() => { const r = document.getElementById('next-part').getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 }; })()`, 'link'),
    ...clickAt('link'),
    sleep(400),
    pageHosts('afterLinkHosts'),
    state('afterLinkState'),
    E(`(history.replaceState(null, '', location.pathname), window.scrollTo(0, 0), true)`, 'back'),
    sleep(300),
    // a region (figure) mark with the pen: one real capture of the visible tab
    ...press('ASK'),
    ...penLoop('loop1'),
    sleep(1500),
    state('region'),
    shot(`${prefix}-1-region-received`),
    // a text mark with the mouse
    ...press('ASK'),
    phrasePath('trace(A²)', 'phrase'),
    ...drag('phrase', 4, 'mouse'),
    sleep(1500),
    state('text'),
    shot(`${prefix}-2-text-received`),
    // a pen loop over the playing lecture video: the capture carries its position
    ...press('ASK'),
    videoLoop('vloop'),
    ...drag('vloop', 4, 'pen'),
    sleep(1500),
    state('video'),
    // a capture that takes too long (delayed by the harness): the UI returns after the timeout and
    // the image that arrives later is discarded, never shown
    delayCaptures(6500),
    ...press('ASK'),
    ...penLoop('loop2'),
    sleep(5600),
    state('timedOut'),
    sleep(1800),
    state('lateDiscarded'),
    delayCaptures(1200),
    // the page changes before the answer arrives: discarded
    ...press('ASK'),
    ...penLoop('loop3'),
    E(`(history.pushState(null, '', location.pathname + '#moved'), true)`, 'moved'),
    sleep(2000),
    state('pageChanged'),
    E(`(history.replaceState(null, '', location.pathname), true)`, 'unmoved'),
    // the page scrolls while the (delayed) image is taken: the region is unknown, no crop
    ...press('ASK'),
    ...penLoop('loop5'),
    E(`(window.scrollBy(0, 60), true)`, 'scrolled'),
    sleep(2000),
    state('scrolledDuring'),
    E(`(window.scrollTo(0, 0), true)`, 'unscrolled'),
    // pinch zoom (emulated page scale): marks and image no longer line up, so the region is unknown
    { cdp: 'Emulation.setPageScaleFactor', params: { pageScaleFactor: 2 } },
    sleep(400),
    E(`({ scale: visualViewport.scale, offsetLeft: visualViewport.offsetLeft, offsetTop: visualViewport.offsetTop })`, 'zoomState'),
    ...press('ASK'),
    ...penLoop('loop6'),
    sleep(2000),
    state('zoomed'),
    { cdp: 'Emulation.setPageScaleFactor', params: { pageScaleFactor: 1 } },
    sleep(400),
    // Stop while an answer is on its way: everything is removed and the answer never shows
    // switching to another tab and back while the (delayed) image is taken: discarded
    ...press('ASK'),
    ...penLoop('loopAway'),
    SW(`(async () => { const tab = ${TAB}; globalThis.__lcBack = tab.id; await chrome.tabs.create({ url: 'about:blank', active: true }); return true; })()`, 'awayTab'),
    sleep(300),
    SW(`(async () => { await chrome.tabs.update(globalThis.__lcBack, { active: true }); return true; })()`, 'backTab'),
    sleep(1800),
    state('tabAway'),
    ...press('ASK'),
    ...penLoop('loop4'),
    ...toggle('stopped'),
    sleep(1300),
    state('afterStop'),
    pageHosts('hostsAfterStop'),
    realCaptures,
    // start again: a fresh companion
    ...toggle('restarted'),
    state('s1'),
    // the panel's Stop with the Pencil while ASK is on: it stops (it is our UI, not a mark)
    ...press('ASK'),
    stopPoint('stopAt'),
    ...clickAt('stopAt', 'pen'),
    sleep(600),
    state('afterPanelStop'),
    pageHosts('hostsAfterPanelStop'),
    badge('badgeAfterPanelStop'),
    ...toggle('startedAfterPanelStop'),
    state('s2'),
    badge('badgeRunning'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

/** Steps for one public page: the same shipped flow around the first rendered formula (or image). */
function publicSteps(url) {
  const formulaLoop = (as) =>
    E(`(() => { const visible = (e) => { const q = e.getBoundingClientRect(); return q.width > 24 && q.height > 12; }; const formula = Array.from(document.querySelectorAll('.mwe-math-element')).find(visible); const el = formula ?? Array.from(document.querySelectorAll('figure img')).find(visible); if (!el) return null; window.__lcMarkedKind = formula ? 'formula' : 'figure'; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const pad = 6; const x0 = r.left - pad, y0 = r.top - pad, x1 = r.right + pad, y1 = r.bottom + pad; const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + 1, y0 + 1]]; const o = {}; pts.forEach(([x, y], k) => { o['x' + k] = x; o['y' + k] = y; }); return o; })()`, as);
  return [
    { cdp: 'Page.navigate', params: { url } },
    sleep(6000),
    tryCapture('publicBefore'),
    ...toggle('publicStarted'),
    state('publicS0'),
    ...press('ASK'),
    formulaLoop('pubLoop'),
    ...drag('pubLoop', 4, 'pen'),
    sleep(2500),
    state('publicMark'),
    E('window.__lcMarkedKind ?? null', 'publicMarkedKind'),
    ...toggle('publicStopped'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

/** Only non-content facts from a public page (no text, title or panel wording). */
function publicFacts(v) {
  const l = v.publicMark?.last;
  return {
    captureBeforeAction: v.publicBefore,
    started: v.publicStarted,
    running: v.publicS0?.running,
    marked: v.publicMarkedKind,
    mark: l && { status: l.status, reason: l.reason, origin: l.page?.origin, inputMode: l.inputMode, image: l.image, geometry: l.geometry, crop: l.crop, cropMean: l.cropMean, cropDarkShare: l.cropDarkShare, times: { markedAt: l.markedAt, requestedAt: l.requestedAt, capturedAt: l.capturedAt, receivedAt: l.receivedAt } },
    stopped: v.publicStopped,
  };
}

function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed });
  const near = (a, b, tol) => Array.isArray(a) && a.every((x, i) => Math.abs(x - b[i]) <= tol);
  c('ext.not_injected_until_invoked', 'the page has no companion until the extension is invoked (no static content script)', v.beforeStart && !v.beforeStart.probe && !v.beforeStart.panel, v.beforeStart);
  c('ext.shipped_permissions_only', 'with the unchanged shipped manifest, capturing is refused before the toolbar action (no activeTab yet)', /^refused/.test(v.captureBeforeAction ?? ''), { captureBeforeAction: v.captureBeforeAction });
  c('ext.invoked_top_frame', 'the toolbar action (DevTools triggerAction) starts the companion in the top frame: toolbar and capture panel, NAV by default',
    v.started === 'ok' && v.s0?.running === true && v.s0?.mode === 'NAV' && v.afterStart?.probe === true && v.afterStart?.panel === true && /Only then is the visible tab captured/.test(v.s0?.panelText ?? ''),
    { started: v.started, mode: v.s0?.mode, hosts: v.afterStart });
  c('ext.navigation_usable', "in NAV the page's own link works and nothing is captured", v.afterLinkHosts?.hash === '#part-2' && v.afterLinkState?.captures === 0 && v.afterLinkState?.last === null,
    { hash: v.afterLinkHosts?.hash, captures: v.afterLinkState?.captures });
  const r = v.region?.last;
  const vp = r?.viewport;
  c('ext.region_capture_real_pixels', 'a pen loop over a figure gives one PNG of the visible tab at device size, its SHA-256, and a crop whose pixels are the figure colour (#d81b60)',
    r?.status === 'received' && r.image && vp && Math.abs(r.image.width - vp.width * vp.device_pixel_ratio) <= 2 && Math.abs(r.image.height - vp.height * vp.device_pixel_ratio) <= 2 &&
      /^[0-9a-f]{64}$/.test(r.image.sha256 ?? '') && r.geometry?.known === true && r.crop && near(r.cropMean, [216, 27, 96], 14) && v.region?.cropShown === true,
    { status: r?.status, reason: r?.reason, image: r?.image, viewport: vp, geometry: r?.geometry, crop: r?.crop, cropMean: r?.cropMean });
  c('ext.region_context', 'the capture carries the context frozen at the mark: address, title, capture after the mark, pen input, no page text under a figure (the image is the evidence)',
    r?.page?.path === '/fixture/course.html' && /Lecture 7/.test(r?.title ?? '') && r?.capturedAt && r.markedAt && r.capturedAt >= r.markedAt && r.inputMode === 'pencil_ask' && r.selectedText === '' && r.media === null,
    { page: r?.page, title: r?.title, markedAt: r?.markedAt, capturedAt: r?.capturedAt, inputMode: r?.inputMode, media: r?.media });
  const vd = v.video?.last;
  c('ext.video_context', 'a pen loop over the playing lecture video: the position frozen at the mark is labelled mark-time metadata, and the position in the (later) image is labelled unknown',
    vd?.status === 'received' && vd.media && vd.media.paused === false && (vd.media.current_time ?? 0) > 0 && /mark-time metadata/.test(v.video?.panelText ?? '') && /Video in the image: position unknown/.test(v.video?.panelText ?? ''),
    { status: vd?.status, reason: vd?.reason, media: vd?.media, atRequest: vd?.mediaAtRequest, atReceipt: vd?.mediaAtReceipt, notes: vd?.notes });
  c('ext.timing_recorded', 'mark, request, image (extension clock) and receipt times are recorded in order',
    r && r.markedAt <= r.requestedAt && r.requestedAt <= r.receivedAt && r.capturedAt && r.capturedAt <= r.receivedAt,
    { markedAt: r?.markedAt, requestedAt: r?.requestedAt, capturedAt: r?.capturedAt, receivedAt: r?.receivedAt });
  const ta = v.tabAway?.last;
  c('ext.tab_away_discards', 'switching to another tab and back while the image is taken discards it', ta?.status === 'failed' && /visible tab changed|tab was hidden/.test(ta?.reason ?? ''), { status: ta?.status, reason: ta?.reason });
  c('ext.returns_to_nav', 'after the mark the mode returns to NAV', v.region?.mode === 'NAV', { mode: v.region?.mode });
  const t = v.text?.last;
  // The crop is the screen as shown: selected words carry the browser's selection highlight.
  c('ext.text_capture', 'a mouse text mark captures too: the selected words and a crop of the real pixels (with the selection highlight the page shows)', t?.status === 'received' && /trace\(A²\)/.test(t.selectedText) && t.inputMode === 'explicit_text_ask' && Array.isArray(t.cropMean) && v.text?.cropShown === true,
    { status: t?.status, selectedText: t?.selectedText, inputMode: t?.inputMode, cropMean: t?.cropMean });
  const to = v.timedOut;
  const ld = v.lateDiscarded;
  c('ext.slow_capture_times_out', 'a capture with no image within 5 s reports that, and the UI comes back', to?.last?.status === 'failed' && /no image within 5 s/.test(to?.last?.reason ?? '') && to?.running === true,
    { status: to?.last?.status, reason: to?.last?.reason });
  c('ext.late_image_discarded', 'the image that arrives after the timeout is discarded (counted), never shown', ld?.retired >= 1 && ld?.last?.status === 'failed' && ld?.last?.image === null && ld?.cropShown === false,
    { retired: ld?.retired, status: ld?.last?.status, image: ld?.last?.image });
  const pc = v.pageChanged?.last;
  c('ext.page_change_discards', 'when the page address changes before the answer arrives, the image is discarded, not shown', pc?.status === 'failed' && /page changed/.test(pc?.reason ?? ''), { status: pc?.status, reason: pc?.reason });
  c('ext.stop_clean', 'Stop (the toolbar action again) removes toolbar and panel at once; an answer still on its way shows nothing', v.stopped === 'ok' && v.afterStop === null && v.hostsAfterStop && !v.hostsAfterStop.probe && !v.hostsAfterStop.panel,
    { stopped: v.stopped, state: v.afterStop, hosts: v.hostsAfterStop });
  c('ext.restart', 'pressing the button again starts a fresh companion', v.restarted === 'ok' && v.s1?.running === true && v.s1?.captures === 0, { restarted: v.restarted, captures: v.s1?.captures });
  const sd = v.scrolledDuring?.last;
  c('ext.scroll_during_capture_unknown', 'when the page scrolls while the image is taken, the image is kept but the region is reported unknown and no crop is shown',
    sd?.status === 'received' && sd.geometry?.known === false && /scrolled, zoomed or resized/.test(sd.geometry?.reason ?? '') && sd.crop === null && v.scrolledDuring?.cropShown === false,
    { status: sd?.status, geometry: sd?.geometry, crop: sd?.crop });
  const zm = v.zoomed?.last;
  c('ext.pinch_zoom_unknown', 'under pinch zoom (emulated page scale 2) the region is reported unknown and no crop is shown',
    v.zoomState?.scale > 1 && zm?.status === 'received' && zm.geometry?.known === false && /pinch-zoomed/.test(zm.geometry?.reason ?? '') && v.zoomed?.cropShown === false,
    { zoomState: v.zoomState, status: zm?.status, reason: zm?.reason, geometry: zm?.geometry });
  c('ext.panel_stop_with_pencil', "a Pencil tap on the panel's Stop while ASK is on stops the companion (not a mark), clears the badge, and the next press starts afresh",
    v.afterPanelStop === null && v.hostsAfterPanelStop && !v.hostsAfterPanelStop.probe && !v.hostsAfterPanelStop.panel && v.badgeAfterPanelStop === '' && v.startedAfterPanelStop === 'ok' && v.s2?.running === true && v.badgeRunning === 'ON',
    { state: v.afterPanelStop, hosts: v.hostsAfterPanelStop, badge: v.badgeAfterPanelStop, next: v.startedAfterPanelStop, badgeRunning: v.badgeRunning });
  return checks;
}

const shipped = join(MODULE, 'webextension');
try {
  const result = await runCdp({ moduleDir: MODULE, browser: args.browser, run: prefix, outDir, steps: steps(`http://127.0.0.1:${PORT}/fixture/course.html`), note, extensionDir: shipped });
  const values = result.values ?? {};
  const checks = evaluate(values);
  let publicReport = null;
  if (args['public-url']) {
    const pub = await runCdp({ moduleDir: MODULE, browser: args.browser, run: `${prefix}-public`, outDir, steps: publicSteps(args['public-url']), note, extensionDir: shipped });
    const facts = publicFacts(pub.values ?? {});
    const m = facts.mark;
    const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed });
    c('ext.public_page_capture', 'on a public learning page, with the shipped flow: refused before the action; after it, a pen loop around a rendered formula gives a PNG of the visible tab, its SHA-256, known geometry and a crop containing dark glyph pixels (not blank)',
      /^refused/.test(facts.captureBeforeAction ?? '') && facts.started === 'ok' && facts.marked === 'formula' && m?.status === 'received' && /^[0-9a-f]{64}$/.test(m.image?.sha256 ?? '') && m.geometry?.known === true && m.crop && (m.cropDarkShare ?? 0) > 0.01,
      facts);
    publicReport = { url_origin: new URL(args['public-url']).origin, url_path: new URL(args['public-url']).pathname, facts, runner_errors: pub.errors ?? [], note: 'Values of this run are not stored: only the non-content facts above.' };
  }
  const failed = checks.filter((x) => !x.pass).map((x) => x.id);
  const runnerErrors = [...(result.errors ?? []), ...(publicReport?.runner_errors ?? [])];
  const report = {
    kind: 'lc-web-extension-entry/v1',
    scope:
      'WebExtension entry (apps/safari-extension/webextension) loaded unpacked in Edge headless on Windows via WSL2, on a local synthetic course page, trusted CDP input on the page. ' +
      'Shipped folder loaded unchanged (activeTab + scripting). Toolbar press made with DevTools Extensions.triggerAction on the page tab (runs the real action.onClicked and grants activeTab; not a human click). Harness controls: state read through the worker; captureVisibleTab delayed inside the worker for late-answer cases. Not Safari, iPad or Pencil evidence; no course account.',
    browser: result.values?.userAgent ?? null,
    shipped_manifest: JSON.parse(readFileSync(join(shipped, 'manifest.json'), 'utf8')),
    summary: { total: checks.length, passed: checks.length - failed.length, failed },
    checks,
    runner_errors: runnerErrors,
    screenshots: result.screenshots ?? [],
    values: result.values ?? {},
    public_page: publicReport,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, `${prefix}.log`), `${log.join('\n')}\n`);
  note(`extension checks passed ${checks.length - failed.length}/${checks.length}; failed: ${failed.join(', ') || 'none'}; runner errors: ${report.runner_errors.length}`);
  process.exitCode = failed.length === 0 && runnerErrors.length === 0 ? 0 : 1;
} finally {
  // nothing to clean up: the shipped folder is used as is
}
