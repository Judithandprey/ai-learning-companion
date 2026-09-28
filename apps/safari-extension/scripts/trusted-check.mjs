#!/usr/bin/env node
// Foreground-only desktop check with *trusted* input (Chrome DevTools Protocol
// Input.* events) against the owned fixture: real clicks, wheel/touch scrolling,
// pinch, native mouse text selection, pen-type pointer events, fullscreen with
// user activation, and input inside a cross-origin frame. Desktop headless
// Chromium/Edge only; it is not iPad Safari, Apple Pencil or device evidence.
//
// On WSL with a Windows browser the CDP client runs as a PowerShell script on the
// Windows side (cdp-runner.ps1), because WSL cannot reach the browser's loopback
// debugging port under NAT networking.
//
// Usage: node scripts/trusted-check.mjs --browser <windows exe path under /mnt> [--out <dir>] [--run <name>]

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, startFixtureServer } from './fixture-server.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const browser = args.browser;
if (!browser || !browser.startsWith('/mnt/')) {
  console.error('missing --browser <Windows browser executable under /mnt/...>');
  process.exit(2);
}
const run = (args.run ?? `trusted-${process.pid}`).replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};

// ---- step builders -----------------------------------------------------------
const E = (expr, as) => ({ eval: expr, as });
const sleep = (ms) => ({ sleep: ms });
const shot = (label) => ({ screenshot: label });
const api = (call) => `window.__lcProbe.fixture.${call}`;
const state = (as) => E(api('state()'), as);
const mouse = (type, x, y, extra = {}) => ({
  cdp: 'Input.dispatchMouseEvent',
  params: { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse', ...extra },
});
const clickAt = (v, pointerType = 'mouse') => [
  mouse('mouseMoved', `$${v}.x`, `$${v}.y`, { pointerType, buttons: 0 }),
  mouse('mousePressed', `$${v}.x`, `$${v}.y`, { pointerType }),
  mouse('mouseReleased', `$${v}.x`, `$${v}.y`, { pointerType }),
  sleep(120),
];
/** Press-move-release along a stored path {x0..xn,y0..yn}. */
const drag = (v, n, pointerType) => [
  mouse('mouseMoved', `$${v}.x0`, `$${v}.y0`, { pointerType, buttons: 0 }),
  mouse('mousePressed', `$${v}.x0`, `$${v}.y0`, { pointerType, ...(pointerType === 'pen' ? { force: 0.5 } : {}) }),
  ...Array.from({ length: n }, (_, i) => mouse('mouseMoved', `$${v}.x${i + 1}`, `$${v}.y${i + 1}`, { pointerType, button: 'left', buttons: 1, ...(pointerType === 'pen' ? { force: 0.5 } : {}) })),
  mouse('mouseReleased', `$${v}.x${n}`, `$${v}.y${n}`, { pointerType }),
  sleep(250),
];
const touch = (type, pts) => ({ cdp: 'Input.dispatchTouchEvent', params: { type, touchPoints: pts } });
const tap = (v) => [touch('touchStart', [{ x: `$${v}.x`, y: `$${v}.y` }]), touch('touchEnd', []), sleep(250)];
const touchDrag = (v, n) => [
  touch('touchStart', [{ x: `$${v}.x0`, y: `$${v}.y0` }]),
  ...Array.from({ length: n }, (_, i) => touch('touchMove', [{ x: `$${v}.x${i + 1}`, y: `$${v}.y${i + 1}` }])),
  touch('touchEnd', []),
  sleep(250),
];
const VDRAG = { x0: 700, y0: 800, x1: 700, y1: 740, x2: 700, y2: 680, x3: 700, y3: 620, x4: 700, y4: 560, x5: 700, y5: 500, x6: 700, y6: 440 };
// Waits out fling momentum, reading the settled offset (stored as `as`).
const settle = (as) =>
  E(`(async () => { let last = -1, same = 0; for (let i = 0; i < 60 && same < 4; i++) { await new Promise((r) => setTimeout(r, 100)); same = scrollY === last ? same + 1 : 0; last = scrollY; } return { scrollY }; })()`, as);
const rawTouchScroll = () => [E(`(${JSON.stringify(VDRAG)})`, 'vdrag'), ...touchDrag('vdrag', 6), settle(null)];
/** scrollTo(0,0) after momentum has stopped, then confirm it stayed there. */
const toTop = () => [settle(null), E('window.scrollTo(0, 0), 0', null), settle(null)];
const btnClick = (pointerType = 'mouse') => [E(api(`point('#counter-btn')`), 'btn'), ...clickAt('btn', pointerType)];
const btnTap = () => [E(api(`point('#counter-btn')`), 'btn'), ...tap('btn')];
const toolbar = (mode) => [E(api(`toolbar('${mode}')`), `tb${mode}`), ...clickAt(`tb${mode}`)];

function buildSteps(url, controlUrl, cspUrl) {
  const controlState = (as) => E('({ scrollY, visualScale: visualViewport ? visualViewport.scale : null })', as);
  return [
    { cdp: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
    // Control: the same gestures on a page without the probe, to separate
    // environment limits from probe behavior.
    { cdp: 'Page.navigate', params: { url: controlUrl } },
    sleep(1200),
    { cdp: 'Input.synthesizeScrollGesture', params: { x: 600, y: 700, yDistance: -300, gestureSourceType: 'touch', speed: 1200 } },
    sleep(400),
    controlState('controlTouchScroll'),
    ...toTop(),
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 400, y: 500, deltaX: 0, deltaY: 300, pointerType: 'mouse' } },
    sleep(400),
    controlState('controlWheel'),
    ...toTop(),
    { cdp: 'Input.synthesizePinchGesture', params: { x: 500, y: 400, scaleFactor: 1.6, gestureSourceType: 'touch' } },
    sleep(500),
    controlState('controlPinch'),
    ...toTop(),
    ...rawTouchScroll(),
    controlState('controlRawTouch'),
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    E(
      `(async () => {
        for (let i = 0; i < 300 && !(window.__lcProbe && window.__lcProbe.videoInfo && window.__lcProbe.videoInfo.status !== 'pending'); i++) await new Promise((r) => setTimeout(r, 100));
        await window.__lcProbe.videoReady;
        const v = document.getElementById('video');
        try { await v.play(); } catch (e) {}
        await new Promise((r) => setTimeout(r, 800));
        return window.__lcProbe.fixture.state();
      })()`,
      'ready',
    ),
    E(api(`point('#counter-btn')`), 'btn'),
    E('navigator.userAgent', 'ua'),
    shot(`${run}-00-initial`),

    // 1. NAV: trusted mouse, wheel, touch tap/scroll, native text selection, scrub drag
    ...btnClick(),
    state('navMouseClick'),
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 400, y: 500, deltaX: 0, deltaY: 300, pointerType: 'mouse' } },
    sleep(400),
    state('navWheel'),
    ...toTop(),
    ...btnTap(),
    state('navTouchTap'),
    { cdp: 'Input.synthesizeScrollGesture', params: { x: 600, y: 700, yDistance: -300, gestureSourceType: 'touch', speed: 1200 } },
    sleep(300),
    state('navTouchScroll'),
    ...toTop(),
    ...rawTouchScroll(),
    state('navRawTouch'),
    ...toTop(),
    E(api(`sweep('#p-basis', 'change of basis')`), 'basis'),
    ...drag('basis', 8, 'mouse'),
    state('navMouseSelect'),
    E('getSelection().removeAllRanges(), 0', null),
    E(`(() => { const r = document.getElementById('scrub').getBoundingClientRect(); return { x0: r.left + 4, y0: r.top + r.height / 2, x1: r.left + 60, y1: r.top + r.height / 2, x2: r.left + 160, y2: r.top + r.height / 2 }; })()`, 'scrub'),
    ...drag('scrub', 2, 'mouse'),
    state('navScrub'),

    // 2. WRITE via the real toolbar: mouse and fingers keep operating the page
    ...toolbar('WRITE'),
    state('writeMode'),
    ...btnClick(),
    ...btnTap(),
    ...rawTouchScroll(),
    state('writeFingerMouse'),
    ...toTop(),

    // 3. explicit finger ASK (no pen seen yet)
    ...toolbar('ASK'),
    state('askEntered'),
    // Page-script (untrusted) pen events must be ignored: no mark, no pen presence.
    E(`(() => { const q = window.__lcProbe.fixture.point('#p-basis', 'underlying vector'); const t = document.elementFromPoint(q.x, q.y); const mk = (type, x) => new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 77, pointerType: 'pen', isPrimary: true, clientX: x, clientY: q.y, buttons: type === 'pointerup' ? 0 : 1 }); const r = [t.dispatchEvent(mk('pointerdown', q.left + 2)), t.dispatchEvent(mk('pointermove', (q.left + q.right) / 2)), t.dispatchEvent(mk('pointerup', q.right - 2))]; return { notPrevented: r.every(Boolean) ? 1 : 0 }; })()`, 'syntheticPen'),
    sleep(300),
    state('afterSynthetic'),
    // A vertical finger drag in finger-ASK is claimed (the page must not scroll) and is ambiguous.
    ...rawTouchScroll(),
    state('fingerVerticalInAsk'),
    E(api(`eventsOf('adjust').length`), 'adjustCount'),
    // A real finger sweep over text.
    E(api(`sweep('#p-basis', 'underlying vector')`), 'uv'),
    ...touchDrag('uv', 8),
    sleep(300),
    state('fingerAskState'),
    E(api('lastAsk()'), 'fingerAsk'),
    shot(`${run}-01-finger-ask-unavailable`),

    // 4. desktop mouse ASK: native drag selection of the fixture word
    ...toolbar('ASK'),
    E(api(`sweep('#p-eigen', 'eigenvector')`), 'eig'),
    ...drag('eig', 8, 'mouse'),
    sleep(300),
    state('mouseAskState'),
    E(api('lastAsk()'), 'mouseAsk'),
    shot(`${run}-02-mouse-ask-fixture`),
    E('getSelection().removeAllRanges(), 0', null),

    // 5. pen: WRITE ink, NAV pass-through, ASK sweep, fingers navigate after pen
    E(api(`sweep('#p-markup', 'Literal markup text')`), 'inkPath'),
    ...drag('inkPath', 8, 'pen'),
    state('penInk'),
    E(api(`eventsOf('ink').length`), 'inkEvents'),
    ...btnClick(),
    state('mouseAfterInk'),
    ...toolbar('NAV'),
    ...btnClick('pen'),
    state('penNavClick'),
    ...toolbar('ASK'),
    E(api(`sweep('#p-basis', 'change of basis')`), 'basis2'),
    ...drag('basis2', 8, 'pen'),
    sleep(300),
    state('penAskState'),
    E(api('lastAsk()'), 'penAsk'),
    shot(`${run}-03-pen-ask-fixture`),
    ...toolbar('ASK'),
    ...btnTap(),
    state('fingerInAskWithPen'),
    ...rawTouchScroll(),
    state('fingerScrollInAskWithPen'),
    ...toTop(),
    E(api(`toolbar('CANCEL')`), 'tbCANCEL'),
    ...clickAt('tbCANCEL'),
    state('afterCancel'),

    // 5b. a pen seen in the top document also makes fingers navigate inside frames
    E(`(async () => { document.getElementById('frame-same').scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 400)); return 0; })()`, null),
    ...toolbar('ASK'),
    sleep(300),
    E(api(`sameFramePoint('#frame-btn')`), 'frameBtn'),
    ...tap('frameBtn'),
    sleep(300),
    E('window.__lcProbe.frameStates[location.origin]', 'sameFrameAfterTap'),
    ...toolbar('ASK'),
    state('afterFrameTap'),
    ...toTop(),

    // 5c. a pen tap on video pixels opens the adjustable box; confirming 1.5 s later
    //     must keep the media position of the moment of the mark
    E(`(async () => { const v = document.getElementById('video'); v.currentTime = 0; try { await v.play(); } catch (e) {} await new Promise((r) => setTimeout(r, 600)); v.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 300)); return 0; })()`, null),
    ...toolbar('ASK'),
    E(`(() => { const r = document.getElementById('video').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60 }; })()`, 'videoTop'),
    ...clickAt('videoTop', 'pen'),
    E(`({ t: document.getElementById('video').currentTime })`, 'tMark'),
    sleep(1500),
    E(api(`toolbar('CONFIRM')`), 'tbCONFIRM'),
    E(`({ t: document.getElementById('video').currentTime })`, 'tConfirm'),
    ...clickAt('tbCONFIRM'),
    sleep(400),
    E(api('lastAsk()'), 'adjustAsk'),
    ...toTop(),

    // 6. fullscreen of a player container (trusted click = user activation)
    E(api(`point('#fs-container')`), 'fsBtn'),
    ...clickAt('fsBtn'),
    sleep(800),
    state('fsBox'),
    E(api(`eventsOf('fullscreen')`), 'fsEvents1'),
    E(api(`toolbar('ASK')`), 'tbInFs'),
    shot(`${run}-04-fullscreen-container`),
    ...toolbar('ASK'),
    E(api(`ellipse('#video', 16, 0.3, 0.25)`), 'vidLoop'),
    // A pen was already seen, so fingers navigate; the region is marked with the pen.
    ...drag('vidLoop', 16, 'pen'),
    sleep(400),
    E(api('lastAsk()'), 'fsAsk'),
    shot(`${run}-05-fullscreen-ask`),
    E('document.exitFullscreen().then(() => 0, (e) => String(e))', 'exitFs1'),
    sleep(600),

    // 7. fullscreen of the <video> element itself, entered while in ASK
    ...toolbar('ASK'),
    E(api('lastAsk()'), 'beforeFsVideo'),
    E(api(`point('#fs-video')`), 'fsVidBtn'),
    ...clickAt('fsVidBtn'),
    sleep(800),
    state('fsVideo'),
    E(api(`eventsOf('fullscreen')`), 'fsEvents2'),
    E(api(`point('#video')`), 'vidCenter'),
    ...clickAt('vidCenter', 'pen'),
    sleep(300),
    E(api('lastAsk()'), 'afterFsVideoPen'),
    shot(`${run}-06-fullscreen-video`),
    E('document.exitFullscreen().then(() => 0, (e) => String(e))', 'exitFs2'),
    sleep(600),

    // 8. input inside the cross-origin frame
    E(`(async () => { document.getElementById('frame-cross').scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 400)); return ${api('state()')}; })()`, 'frameScrolled'),
    ...toolbar('ASK'),
    sleep(300),
    E(api(`frameSweep('frame-cross', ${api('otherOrigin')})`), 'frameProj'),
    ...drag('frameProj', 8, 'pen'),
    sleep(500),
    E(`window.__lcProbe.frameStates[${api('otherOrigin')}]`, 'crossFrameState'),
    state('afterFrameAsk'),
    E(api(`eventsOf('card_relayed')`), 'relayed'),
    shot(`${run}-07-cross-frame-ask`),

    // 9. pinch zoom in NAV
    ...toTop(),
    { cdp: 'Input.synthesizePinchGesture', params: { x: 500, y: 400, scaleFactor: 1.6, gestureSourceType: 'touch' } },
    sleep(500),
    state('pinch'),
    E(`(() => { const a = window.__lcProbe.events.filter((e) => e.type === 'ask'); return { asks: a.length, outcomes: a.map((e) => e.outcome), inputs: window.__lcProbe.events.filter((e) => e.type === 'input').length }; })()`, 'final'),

    // 10. strict page CSP (no inline style/script): the probe must still render and work
    { cdp: 'Page.navigate', params: { url: cspUrl } },
    sleep(1500),
    state('cspInitial'),
    E(api(`toolbar('NAV')`), 'cspTbNav'),
    ...toolbar('ASK'),
    E(api(`sweep('#p-csp', 'eigenvector')`), 'cspWord'),
    ...drag('cspWord', 8, 'mouse'),
    sleep(300),
    state('cspAfterAsk'),
    E(api(`point('#csp-btn')`), 'cspBtn'),
    ...clickAt('cspBtn'),
    state('cspAfterClick'),
    shot(`${run}-08-strict-csp-unregistered`),
  ];
}

// ---- evaluation --------------------------------------------------------------
/** Marks in buildSteps that should each create one top-page explanation request. */
const INTENDED_TOP_SUBMISSIONS = 5;
function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed: observed ?? null });
  // Environment observation: recorded, never counted as a probe pass or failure.
  const env = (id, description, supported, observed) => checks.push({ id, description, pass: null, status: supported ? 'environment_supported' : 'environment_unsupported', observed: observed ?? null });
  // Probe check that is only meaningful when the control shows the environment can do it.
  const gated = (id, description, envOk, pass, observed) =>
    envOk ? c(id, description, pass, observed) : checks.push({ id, description, pass: null, status: 'not_verifiable_in_environment', observed: observed ?? null });
  const s0 = v.ready;
  c('setup.ready', 'fixture loaded with a synthetic video in NAV', s0 && s0.mode === 'NAV' && s0.requests === 0, s0);
  c('nav.mouse_click', 'trusted mouse click reaches the page button in NAV', v.navMouseClick?.counters.clicks === (s0?.counters.clicks ?? 0) + 1, v.navMouseClick?.counters.clicks);
  c('nav.wheel_scroll', 'trusted wheel scrolls the page in NAV', v.navWheel?.scrollY > 0, v.navWheel?.scrollY);
  c('nav.touch_tap', 'trusted finger tap clicks the page button in NAV', v.navTouchTap?.counters.clicks === (v.navMouseClick?.counters.clicks ?? 0) + 1, v.navTouchTap?.counters.clicks);
  const envTouchScroll = v.controlTouchScroll?.scrollY > 0;
  const envPinch = (v.controlPinch?.visualScale ?? 1) > 1.05;
  c('control.wheel_scroll', 'control page (no probe): wheel scroll works in this environment', v.controlWheel?.scrollY > 0, v.controlWheel);
  env('control.touch_scroll', 'control page (no probe): synthesized touch scroll gesture scrolls', envTouchScroll, v.controlTouchScroll);
  env('control.pinch', 'control page (no probe): synthesized pinch zooms the visual viewport', envPinch, v.controlPinch);
  gated('nav.touch_scroll', 'trusted finger scroll gesture scrolls the page in NAV', envTouchScroll, v.navTouchScroll?.scrollY > 0, v.navTouchScroll?.scrollY);
  const envRawTouch = v.controlRawTouch?.scrollY > 0;
  env('control.raw_touch_drag', 'control page (no probe): raw touchStart/Move/End drag scrolls', envRawTouch, v.controlRawTouch);
  gated('nav.raw_touch_drag', 'a raw finger drag scrolls the page in NAV', envRawTouch, v.navRawTouch?.scrollY > 0 && v.navRawTouch?.requests === 0, v.navRawTouch && { scrollY: v.navRawTouch.scrollY, requests: v.navRawTouch.requests });
  c('nav.mouse_select_no_ai', 'native mouse text selection in NAV works and requests nothing', (v.navMouseSelect?.selection ?? '').includes('change') && v.navMouseSelect?.requests === 0, v.navMouseSelect && { selection: v.navMouseSelect.selection, requests: v.navMouseSelect.requests });
  c('nav.scrub_drag', 'trusted drag on the progress slider changes it in NAV', v.navScrub?.counters.scrubInputs > 0 && v.navScrub?.requests === 0, v.navScrub?.counters.scrubInputs);
  c('write.toolbar', 'WRITE entered through the real toolbar button', v.writeMode?.mode === 'WRITE', v.writeMode?.mode);
  const wClicks = (v.writeFingerMouse?.counters.clicks ?? 0) - (v.writeMode?.counters.clicks ?? 0);
  c('write.fingers_mouse_navigate', 'in WRITE, mouse click and finger tap still operate the page', wClicks === 2 && v.writeFingerMouse?.requests === 0, { clicks: wClicks });
  gated('write.finger_scroll', 'in WRITE, a raw finger drag still scrolls the page', envRawTouch, v.writeFingerMouse?.scrollY > 0, v.writeFingerMouse?.scrollY);
  c('ask.toolbar', 'ASK entered through the real toolbar button', v.askEntered?.mode === 'ASK', v.askEntered?.mode);
  c('security.synthetic_events_ignored', 'page-script (untrusted) pen events are neither claimed nor counted as a pen', v.syntheticPen?.notPrevented === 1 && v.afterSynthetic?.penObserved === false && v.afterSynthetic?.requests === 0 && v.afterSynthetic?.mode === 'ASK', { synthetic: v.syntheticPen, after: v.afterSynthetic && { penObserved: v.afterSynthetic.penObserved, requests: v.afterSynthetic.requests } });
  gated('ask.finger_vertical_claimed', 'a vertical finger drag in finger-ASK is claimed (no scroll) and shown as an adjustable box', envRawTouch, v.fingerVerticalInAsk?.scrollY === 0 && v.adjustCount === 1 && v.fingerVerticalInAsk?.requests === 0, v.fingerVerticalInAsk && { scrollY: v.fingerVerticalInAsk.scrollY, adjust: v.adjustCount });
  c('ask.finger_trusted', 'a real finger sweep in ASK (no pen seen) selects "underlying vector"', v.fingerAsk?.input_mode === 'explicit_touch_ask' && v.fingerAsk?.selected_text === 'underlying vector', { ask: v.fingerAsk });
  c('ask.finger_unavailable_card', 'arbitrary text → provider unavailable, silent, restores WRITE', v.fingerAsk?.provenance === 'none' && v.fingerAsk?.audio === false && v.fingerAskState?.mode === 'WRITE', { card: v.fingerAsk?.card_status, mode: v.fingerAskState?.mode });
  c('ask.mouse_native_select', 'native mouse drag selection in ASK → explicit_text_ask fixture card', v.mouseAsk?.input_mode === 'explicit_text_ask' && v.mouseAsk?.selected_text === 'eigenvector' && v.mouseAsk?.provenance === 'fixture', v.mouseAsk);
  c('pen.write_ink', 'trusted pen drag in WRITE is ink: no text selection and no request', v.inkEvents === 1 && (v.penInk?.selection ?? '') === '' && v.penInk?.requests === v.mouseAskState?.requests, { ink: v.inkEvents, selection: v.penInk?.selection, requests: v.penInk?.requests });
  c('pen.mouse_after_ink', 'mouse click right after ink still reaches the page', v.mouseAfterInk?.counters.clicks === (v.penInk?.counters.clicks ?? 0) + 1, v.mouseAfterInk?.counters.clicks);
  c('pen.nav_click', 'trusted pen click in NAV reaches the page', v.penNavClick?.counters.clicks === (v.mouseAfterInk?.counters.clicks ?? 0) + 1 && v.penNavClick?.mode === 'NAV', v.penNavClick?.counters.clicks);
  c('pen.ask_fixture', 'trusted pen sweep in ASK → pencil_ask fixture card, returns to NAV', v.penAsk?.input_mode === 'pencil_ask' && v.penAsk?.selected_text === 'change of basis' && v.penAsk?.provenance === 'fixture' && v.penAskState?.mode === 'NAV', { ask: v.penAsk, mode: v.penAskState?.mode });
  c('pen.fingers_navigate_in_ask', 'after a pen is seen, a finger tap in ASK clicks the page and requests nothing', v.fingerInAskWithPen?.counters.clicks === (v.penAskState?.counters.clicks ?? 0) + 1 && v.fingerInAskWithPen?.requests === v.penAskState?.requests && v.fingerInAskWithPen?.mode === 'ASK', { clicks: v.fingerInAskWithPen?.counters.clicks, mode: v.fingerInAskWithPen?.mode });
  gated('pen.finger_scroll_in_ask', 'after a pen is seen, a raw finger drag in ASK scrolls the page and requests nothing', envRawTouch, v.fingerScrollInAskWithPen?.scrollY > 0 && v.fingerScrollInAskWithPen?.mode === 'ASK' && v.fingerScrollInAskWithPen?.requests === v.fingerInAskWithPen?.requests, v.fingerScrollInAskWithPen && { scrollY: v.fingerScrollInAskWithPen.scrollY, mode: v.fingerScrollInAskWithPen.mode });
  c('ask.cancel_button', 'the real Cancel button leaves ASK', v.afterCancel?.mode === 'NAV', v.afterCancel?.mode);
  const fs1 = (v.fsEvents1 ?? []).slice(-1)[0];
  c('fullscreen.container_overlay', 'fullscreen of a player container keeps the toolbar visible (overlay moved into it)', v.fsBox?.fullscreen === 'player-box' && fs1?.overlay === 'visible' && v.tbInFs?.visible === 1, { fullscreen: v.fsBox?.fullscreen, event: fs1, toolbar: v.tbInFs });
  c('fullscreen.container_ask', 'ASK over the video in container fullscreen freezes a media position and no hidden page text', v.fsAsk?.outcome === 'submitted' && typeof v.fsAsk?.media_position === 'number' && !/algebra|synthetic|probe/i.test(v.fsAsk?.selected_text ?? ''), v.fsAsk);
  const fs2 = (v.fsEvents2 ?? []).slice(-1)[0];
  c('fullscreen.video_element_unsupported', 'fullscreen of the <video> element: overlay cannot render, ASK is ended (NAV) and a pen tap on the video is not claimed', v.fsVideo?.fullscreen === 'video' && fs2?.overlay === 'hidden_unrenderable_fullscreen' && fs2?.forcedNav === true && v.fsVideo?.mode === 'NAV' && v.afterFsVideoPen?.asks === v.beforeFsVideo?.asks, { fullscreen: v.fsVideo?.fullscreen, event: fs2, mode: v.fsVideo?.mode, asks: [v.beforeFsVideo?.asks, v.afterFsVideoPen?.asks] });
  const am = v.adjustAsk?.media_position;
  c('ask.adjust_freezes_mark_time', 'confirming the adjustable box later keeps the video position of the mark, not of the confirm', v.adjustAsk?.outcome === 'submitted' && typeof am === 'number' && Math.abs(am - v.tMark?.t) < 0.35 && v.tConfirm?.t - am > 1.0, { media_position: am, at_mark: v.tMark?.t, at_confirm: v.tConfirm?.t });
  const sf = v.sameFrameAfterTap;
  c('frame.pen_shared_fingers_navigate', 'after a pen in the top document, a finger tap inside a frame in ASK clicks the frame button and creates no request', sf?.mode === 'ASK' && sf?.clicks === 1 && sf?.last_ask === null && sf?.explanation_requests === 0, sf && { mode: sf.mode, clicks: sf.clicks, requests: sf.explanation_requests, last_ask: sf.last_ask });
  const cf = v.crossFrameState;
  c('frame.cross_origin_trusted', 'trusted pen sweep inside the cross-origin frame is handled by that frame\'s probe with its own source', cf?.last_ask?.status === 'submitted' && cf?.last_ask?.source_id === 'web-probe-fixture-frame' && cf?.last_ask?.provenance === 'fixture', cf?.last_ask);
  c('frame.card_relayed', 'the frame\'s card is rendered by the top document from its own fixture table and the top returns to NAV', (v.relayed ?? []).length === 1 && v.relayed[0]?.provenance === 'fixture' && v.afterFrameAsk?.mode === 'NAV', { relayed: v.relayed, mode: v.afterFrameAsk?.mode });
  gated('nav.pinch_zoom', 'trusted pinch zooms the visual viewport in NAV', envPinch, (v.pinch?.visualScale ?? 1) > 1.05, { scale: v.pinch?.visualScale });
  c('nav.pinch_no_request', 'a pinch gesture in NAV requests nothing', v.pinch?.requests === v.afterFrameAsk?.requests, { requests: v.pinch?.requests });
  c('totals.requests_match_intended_marks', `top-page explanation requests equal the ${INTENDED_TOP_SUBMISSIONS} deliberate ASK marks (finger sweep, mouse selection, pen sweep, confirmed adjust box, fullscreen-container loop)`, v.pinch?.requests === INTENDED_TOP_SUBMISSIONS, { requests: v.pinch?.requests, intended: INTENDED_TOP_SUBMISSIONS, outcomes: v.final?.outcomes });
  const ci = v.cspInitial;
  c('csp.renders', 'under a strict page CSP the probe host is positioned and the toolbar has its styled size', ci?.host_position === 'absolute' && v.cspTbNav?.width === 40 && v.cspTbNav?.height === 40, { host: ci?.host_position, toolbar: v.cspTbNav, violations: ci?.violations });
  c('csp.no_violations', 'the probe causes no CSP violation reports', (v.cspAfterClick?.violations ?? ['missing']).length === 0, v.cspAfterClick?.violations);
  c('csp.unregistered_source', 'ASK on an unregistered page ends as source_unregistered without a request and returns to NAV', JSON.stringify(v.cspAfterAsk?.asks) === '["source_unregistered"]' && v.cspAfterAsk?.requests === 0 && v.cspAfterAsk?.mode === 'NAV', v.cspAfterAsk);
  c('csp.page_click', 'the CSP page button still receives a trusted click', v.cspAfterClick?.clicks === 1, v.cspAfterClick?.clicks);
  return checks;
}

// ---- run -----------------------------------------------------------------------
async function main() {
  mkdirSync(outDir, { recursive: true });
  // A failed run must never leave an earlier run's passing evidence in place.
  for (const f of readdirSync(outDir)) {
    if (f === `${run}.json` || f === `${run}.log` || (f.startsWith(`${run}-`) && f.endsWith('.png'))) rmSync(join(outDir, f), { force: true });
  }
  const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
  const tempUnix = execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim();
  const work = join(tempUnix, `lc-web-trusted-${run}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'out'), { recursive: true });
  try {
    await runIn(work);
  } finally {
    // Always stop the browser and remove its temporary profile, also on failures.
    const pidFile = join(work, 'out', 'browser.pid');
    if (existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf8').replace(/[^0-9]/g, '');
      if (pid) spawnSync('taskkill.exe', ['/PID', pid, '/T', '/F'], { cwd: '/mnt/c', stdio: 'ignore' });
    }
    for (let i = 0; i < 5 && existsSync(work); i++) {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (existsSync(work)) note(`WARNING: could not remove ${work}`);
  }
}

async function runIn(work) {
  const toWin = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
  // copyFile can fail with EPERM on the Windows drive mount; write the bytes instead.
  writeFileSync(join(work, 'cdp-runner.ps1'), readFileSync(join(MODULE, 'scripts', 'cdp-runner.ps1')));
  const url = `http://localhost:${PORT}/fixture/index.html?run=${encodeURIComponent(run)}`;
  const controlUrl = `http://localhost:${PORT}/fixture/control.html`;
  const cspUrl = `http://localhost:${PORT}/fixture/csp.html`;
  writeFileSync(join(work, 'steps.json'), JSON.stringify(buildSteps(url, controlUrl, cspUrl)));

  const server = await startFixtureServer(MODULE, { log: note });
  note(`server on http://127.0.0.1:${PORT}; page ${url}`);
  const psArgs = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'cdp-runner.ps1')),
    '-Browser', toWin(browser), '-ProfileDir', toWin(join(work, 'profile')), '-StepsFile', toWin(join(work, 'steps.json')), '-OutDir', toWin(join(work, 'out')),
  ];
  note(`powershell.exe ${psArgs.join(' ')}`);
  const code = await new Promise((ok) => {
    const child = spawn('powershell.exe', psArgs, { cwd: '/mnt/c', stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => note(`ps: ${String(d).trim()}`));
    child.stderr.on('data', (d) => note(`ps err: ${String(d).trim()}`));
    const timer = setTimeout(() => child.kill(), 240000);
    child.on('exit', (c) => {
      clearTimeout(timer);
      ok(c);
    });
  });
  await server.close();
  note(`runner exit code ${code}`);

  const resultsFile = join(work, 'out', 'cdp-results.json');
  if (!existsSync(resultsFile)) throw new Error('no cdp-results.json');
  const raw = readFileSync(resultsFile, 'utf8').replace(/^﻿/, '');
  const results = JSON.parse(raw);
  const checks = evaluate(results.values ?? {});
  const summary = {
    total: checks.length,
    passed: checks.filter((x) => x.status === 'pass').length,
    failed: checks.filter((x) => x.status === 'fail').map((x) => x.id),
    not_verifiable: checks.filter((x) => x.status === 'not_verifiable_in_environment').map((x) => x.id),
    environment: checks.filter((x) => x.status.startsWith('environment_')).map((x) => `${x.id}=${x.status}`),
  };
  const screenshots = [];
  for (const file of results.screenshots ?? []) {
    const name = String(file).split('\\').pop();
    const src = join(work, 'out', name);
    if (existsSync(src)) {
      copyFileSync(src, join(outDir, name));
      screenshots.push(name);
    }
  }
  const report = {
    kind: 'lc-web-probe-trusted-check/v1',
    trusted_input: 'Chrome DevTools Protocol Input.* (desktop headless); not iPad/Pencil',
    browser: browser,
    user_agent: results.values?.ua ?? null,
    summary,
    checks,
    runner_errors: results.errors ?? [],
    failed_steps: (results.steps ?? []).filter((s) => !s.ok),
    screenshots,
    values: results.values,
  };
  writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, `${run}.log`), `${log.join('\n')}\n`);
  note(`trusted checks passed ${summary.passed}; failed: ${summary.failed.join(', ') || 'none'}; not verifiable here: ${summary.not_verifiable.join(', ') || 'none'}; environment: ${summary.environment.join(', ')}; runner errors: ${(results.errors ?? []).length}`);
  process.exitCode = summary.failed.length > 0 || (results.errors ?? []).length > 0 ? 1 : 0;
}

main().catch((error) => {
  note(`harness error: ${error?.stack ?? error}`);
  try {
    writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify({ kind: 'lc-web-probe-trusted-check/v1', run, status: 'harness_error', error: String(error), summary: { passed: 0, failed: ['harness_error'] } }, null, 2)}\n`);
    writeFileSync(join(outDir, `${run}.log`), `${log.join('\n')}\n`);
  } catch {
    // output directory unavailable
  }
  process.exit(3);
});
