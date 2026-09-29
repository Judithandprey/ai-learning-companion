#!/usr/bin/env node
// Desktop check of the WebExtension entry (webextension/) on a local course-like page, in Edge
// headless with the unpacked extension loaded and trusted CDP input on the page.
//
// Harness stand-ins, labeled in the report:
// - The harness cannot press the browser's toolbar button, so it calls the service worker's own
//   toggleCompanion(tab) through CDP, and its copy of the manifest adds an <all_urls> host permission
//   in place of the activeTab grant that press gives. (Chromium refuses captureVisibleTab with only a
//   site host permission: "Either the '<all_urls>' or 'activeTab' permission is required.") The
//   shipped manifest is unchanged: activeTab + scripting only.
// - For the late-answer cases it wraps tabs.captureVisibleTab in the worker with a delay (test control
//   through CDP, not product code).
// The page is a synthetic course page served locally; no course account or site is used. Not Safari,
// iPad or Pencil evidence.
//
// Usage: node scripts/extension-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <prefix>]

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const toggle = (as) => SW(`(async () => toggleCompanion(${TAB}))()`, as);
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
    toggle('started'),
    sleep(500),
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
    ...press('ASK'),
    ...penLoop('loop4'),
    toggle('stopped'),
    sleep(2000),
    state('afterStop'),
    pageHosts('hostsAfterStop'),
    realCaptures,
    // start again: a fresh companion
    toggle('restarted'),
    sleep(500),
    state('s1'),
    // the panel's Stop with the Pencil while ASK is on: it stops (it is our UI, not a mark)
    ...press('ASK'),
    stopPoint('stopAt'),
    ...clickAt('stopAt', 'pen'),
    sleep(600),
    state('afterPanelStop'),
    pageHosts('hostsAfterPanelStop'),
    badge('badgeAfterPanelStop'),
    toggle('startedAfterPanelStop'),
    sleep(500),
    state('s2'),
    badge('badgeRunning'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed });
  const near = (a, b, tol) => Array.isArray(a) && a.every((x, i) => Math.abs(x - b[i]) <= tol);
  c('ext.not_injected_until_invoked', 'the page has no companion until the extension is invoked (no static content script)', v.beforeStart && !v.beforeStart.probe && !v.beforeStart.panel, v.beforeStart);
  c('ext.invoked_top_frame', 'invoking the extension starts the companion in the top frame: toolbar and capture panel, NAV by default',
    v.started === 'started' && v.s0?.running === true && v.s0?.mode === 'NAV' && v.afterStart?.probe === true && v.afterStart?.panel === true && /Only then is the visible tab captured/.test(v.s0?.panelText ?? ''),
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
  c('ext.video_context', 'a pen loop over the playing lecture video captures it with the video position frozen at the mark', vd?.status === 'received' && vd.media && vd.media.paused === false && (vd.media.current_time ?? 0) > 0,
    { status: vd?.status, reason: vd?.reason, media: vd?.media, image: vd?.image });
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
  c('ext.stop_clean', 'Stop (the toolbar button again) removes toolbar and panel at once; an answer still on its way shows nothing', v.stopped === 'stopped' && v.afterStop === null && v.hostsAfterStop && !v.hostsAfterStop.probe && !v.hostsAfterStop.panel,
    { stopped: v.stopped, state: v.afterStop, hosts: v.hostsAfterStop });
  c('ext.restart', 'pressing the button again starts a fresh companion', v.restarted === 'started' && v.s1?.running === true && v.s1?.captures === 0, { restarted: v.restarted, captures: v.s1?.captures });
  const sd = v.scrolledDuring?.last;
  c('ext.scroll_during_capture_unknown', 'when the page scrolls while the image is taken, the image is kept but the region is reported unknown and no crop is shown',
    sd?.status === 'received' && sd.geometry?.known === false && /scrolled, zoomed or resized/.test(sd.geometry?.reason ?? '') && sd.crop === null && v.scrolledDuring?.cropShown === false,
    { status: sd?.status, geometry: sd?.geometry, crop: sd?.crop });
  const zm = v.zoomed?.last;
  c('ext.pinch_zoom_unknown', 'under pinch zoom (emulated page scale 2) the region is reported unknown and no crop is shown',
    v.zoomState?.scale > 1 && zm?.status === 'received' && zm.geometry?.known === false && /pinch-zoomed/.test(zm.geometry?.reason ?? '') && v.zoomed?.cropShown === false,
    { zoomState: v.zoomState, status: zm?.status, reason: zm?.reason, geometry: zm?.geometry });
  c('ext.panel_stop_with_pencil', "a Pencil tap on the panel's Stop while ASK is on stops the companion (not a mark), clears the badge, and the next press starts afresh",
    v.afterPanelStop === null && v.hostsAfterPanelStop && !v.hostsAfterPanelStop.probe && !v.hostsAfterPanelStop.panel && v.badgeAfterPanelStop === '' && v.startedAfterPanelStop === 'started' && v.s2?.running === true && v.badgeRunning === 'ON',
    { state: v.afterPanelStop, hosts: v.hostsAfterPanelStop, badge: v.badgeAfterPanelStop, next: v.startedAfterPanelStop, badgeRunning: v.badgeRunning });
  return checks;
}

// The harness copy: the shipped folder plus a localhost host permission (the click stand-in).
const shipped = join(MODULE, 'webextension');
const harness = mkdtempSync(join(tmpdir(), 'lc-webextension-harness-'));
try {
  for (const f of readdirSync(shipped)) writeFileSync(join(harness, f), readFileSync(join(shipped, f)));
  const manifest = JSON.parse(readFileSync(join(shipped, 'manifest.json'), 'utf8'));
  writeFileSync(join(harness, 'manifest.json'), JSON.stringify({ ...manifest, name: `${manifest.name} (check harness)`, host_permissions: ['<all_urls>'] }, null, 2));
  const result = await runCdp({ moduleDir: MODULE, browser: args.browser, run: prefix, outDir, steps: steps(`http://127.0.0.1:${PORT}/fixture/course.html`), note, extensionDir: harness });
  const values = result.values ?? {};
  const checks = evaluate(values);
  const failed = checks.filter((x) => !x.pass).map((x) => x.id);
  const report = {
    kind: 'lc-web-extension-entry/v1',
    scope:
      'WebExtension entry (apps/safari-extension/webextension) loaded unpacked in Edge headless on Windows via WSL2, on a local synthetic course page, trusted CDP input on the page. ' +
      'Harness stand-ins: toggleCompanion called through CDP instead of a toolbar press, with an <all_urls> host permission in the harness copy of the manifest instead of the activeTab grant (Chromium refuses captureVisibleTab with only a site permission); captureVisibleTab delayed by the harness for the late-answer cases. Not Safari, iPad or Pencil evidence; no course account.',
    browser: result.values?.userAgent ?? null,
    shipped_manifest: JSON.parse(readFileSync(join(shipped, 'manifest.json'), 'utf8')),
    summary: { total: checks.length, passed: checks.length - failed.length, failed },
    checks,
    runner_errors: result.errors ?? [],
    screenshots: result.screenshots ?? [],
    values: result.values ?? {},
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, `${prefix}.log`), `${log.join('\n')}\n`);
  note(`extension checks passed ${checks.length - failed.length}/${checks.length}; failed: ${failed.join(', ') || 'none'}; runner errors: ${report.runner_errors.length}`);
  process.exitCode = failed.length === 0 && report.runner_errors.length === 0 ? 0 : 1;
} finally {
  rmSync(harness, { recursive: true, force: true });
}
