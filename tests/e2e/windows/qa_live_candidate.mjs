#!/usr/bin/env node
// The four-action NONVOICE live acceptance driver for product 52be105: offline assembly and checks only. No process,
// native, GUI, account, model or audio calls happen here (prepare-connector runs only a local copy and an import check).
//   prepare <new QA folder>                 a new candidate (runner, steps, live surface, connector configuration)
//   check <candidate.json> <stage receipt>  the saved candidate reproduces from the current sources; its scratch is unused
//   prepare-connector                       the private exact-source 52be105 Backend copy the real connector runs from
//
// Reuse, not a new framework: the runner is byte for byte the reviewed r4 diagnostic runner (Support 184f712; attempt 3
// passed 32/32), only its new work folder differs. The steps keep that run's Edge identity, display and 16-point admission,
// control/overlay placement and exact-owned cleanup, and replace its AI-disabled parts with the four released actions:
//   1 the first unattended whole-screen observation (it happens by itself after the actual UI Start);
//   2 one circle in ASK mode: the app asks for a hint by itself (no Ask press, no typed text);
//   3 one typed follow-up on the card after a controlled screen change (new cards, same page);
//   4 one more typed request, and Stop the AI while it is out (the Stop/fence attempt).
// One real session with the actual UI policy 4 requests / 1 minute / 60 s between unattended looks. Every action is
// bracketed by guards: a session that ended, an outcome that is not a plain answer, or a count that is not exactly one
// more stops the run there (required eval), and every later action stays NOT_RUN. Nothing is retried or restarted.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';
import { applyAdmissionPoints, applyEdgeIdentity, applyPlacementClient, applyPlacementGeometry, applyScopedAdmission } from './qa_tts_output_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
// The exact package (the same pins as the accepted diagnostic, qa_tts_output_candidate.mjs; a test compares them).
const source = '52be105a148a28e677f83cc4b7077665f2ff372c';
const release = 'ad7bd72a8e902b366fbbb71d90f530c18043a251';
const stage = '/mnt/c/Users/ROG/AppData/Local/Temp/lc-windows-tts-52be105';
const tree = '531943a83d3572ca9c686c7d8cd62bd88da5b0401b84050487722b8e87a02669';
const entry = '9969b8afa2b3f3df82d3733c5d6e8adec5c34393af49d2d10c88704d68982128';
const helper = '21c7bed3fedcdefdccc2f45b799bfebb417df7a56f44f656523d303e7b349e10';
const runtime = '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa';
const electron = String.raw`C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe`;
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
// The reviewed runner this candidate reuses unchanged (r4, attempt 3/3 passed) and the folder its bytes name.
export const REVIEWED_RUNNER = { file: 'docs/verification/qa/p0-13-tts-52be105/candidate-r4-20261009/runner.ps1',
  sha256: 'd6640e6c8f24b51dc87feb12f8ce83832c7a6c28c380de8f0b02d1eb644b28c2', folder: 'lc-qa-tts-output-27f0531f6f574cf2b67b1f650525e89d' };
// The real connector, as one trusted configuration for this one app process (LC_SUBSCRIPTION_CONNECTOR): the exact-source
// 52be105 Backend copy, the repository's Python, the pinned codex binary (the default launcher resolves to 0.160, which
// the released gate refuses), and the product's own managed state (state_dir null: where the user signs in; QA never
// opens it). The connector admits codex only by its sha256; the wrapper checks it again before the launch.
export const CONNECTOR = {
  commit: source, copy: '/home/agentsdock/.local/share/lc-qa/subscription-source-52be105a148a',
  python: '/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python',
  codex_bin: '/home/agentsdock/.codex/packages/standalone/releases/0.158.0-x86_64-unknown-linux-musl/bin/codex',
  codex_sha256: '167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9',
  state_dir: null, distribution: 'Ubuntu', user: 'agentsdock',
};
// The real test's own bounds (request-budget.json live allocation), set in the control window's three fields.
export const POLICY = { requests: 4, minutes: 1, seconds: 60 };
export const POLICY_MS = { max_submissions: 4, max_session_ms: 60000, min_observation_interval_ms: 60000 };
export const ACTIONS = ['unattended whole-screen observation', 'automatic focus response', 'typed follow-up after controlled screen change', 'Stop/fence attempt'];
// Fixed before the run, with no card values in them (the values exist only as pixels), and not telling the model that the
// cards changed (Lead D9, b63ecdc).
export const QUESTIONS = {
  followup: 'Please read the four-digit numbers on the cards in the top row, from left to right.',
  fence: 'Please also read the four-digit numbers on the cards in the bottom row.',
};
// The help level for the two typed visual-reading requests: 'explain', selected on the card as a user would (Lead D1,
// b63ecdc: they ask to read generated pixels, not to solve a learner's problem; recorded as a test override). The
// automatic circle request stays hint-first: the product itself caps it and the driver never touches its level.
export const ASSISTANCE = 'explain';
export const CIRCLE_ASSISTANCE = 'hint (the product\'s own cap for a circle without words)';
// One fixed outer bound for the native run: setup, the 60 s session and cleanup (Lead D6). Not an execution approval.
export const NATIVE_BOUND_MS = 600000;
const sourceNames = ['qa_live_candidate.mjs', 'qa_tts_output_candidate.mjs', 'qa_visible_candidate.mjs', 'qa_edge_placement.ps1', 'qa_display_admission.ps1',
  'qa-electron-runner.ps1', 'qa_tts_stage_check.py', 'qa_live_stage_check.py', 'surface_live.html', 'sub_copy.mjs', 'qa_sub_copy_check.py', 'qa_live_copy_check.py',
  'signin_cleanup.mjs', 'qa_live_ledger.mjs', 'qa_run_tts_candidate.mjs', 'qa_sub_watch.py'];
export const names = ['runner.ps1', 'steps.json', 'surface.html', 'sub-live.json'];
const sha = data => createHash('sha256').update(data).digest('hex');
const win = p => {
  if (!p.startsWith('/mnt/c/') || /['\r\n]/.test(p)) throw Error('unexpected Windows path');
  return 'C:\\' + p.slice(7).replaceAll('/', '\\');
};
const workPattern = /^\/mnt\/c\/Users\/ROG\/AppData\/Local\/Temp\/lc-qa-live-nonvoice-[0-9a-f]{32}$/;
function context(work) {
  const appPort = 43123, edgePort = 45123, profile = win(join(work, 'edge-profile'));
  const surfaceUrl = 'file:///' + win(join(work, 'surface.html')).replaceAll('\\', '/');
  const edgeArgs = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-features=Translate,msTranslate,TranslateUI,MediaRouter,OptimizationHints', '--lang=en-US', `--remote-debugging-port=${edgePort}`, '--remote-debugging-address=127.0.0.1', '--start-fullscreen', `--app=${surfaceUrl}`];
  return { appPort, edgePort, profile, surfaceUrl, edgeArgs, edgePlacement: true, linkDir: win(join(work, 'link')) };
}

// ---- the steps ----
const evalStep = (target, text, as, extra = {}) => ({ target, eval: text, ...(as ? { as } : {}), ...extra });
const ctl = (s, as) => evalStep('control', s, as), ov = (s, as) => evalStep('overlay', s, as);
const truth = (as, extra) => evalStep('edge', `(() => { const t = JSON.parse(window.__qaSurfaceTruth()); if (!t.fits || !t.full_screen || t.viewport.dpr !== 2 || t.viewport.screen[0] !== 1280 || t.viewport.screen[1] !== 800) throw Error('generated surface geometry unavailable'); return JSON.stringify(t); })()`, as, extra);
const points = Array.from({ length: 12 }, (_, i) => [(40 + i % 4 * 210 + 95) * 2, (90 + Math.floor(i / 4) * 170 + 75) * 2]);
const onTop = { onTop: 'edge', points: [...points, [20, 20], [2540, 20], [20, 1580], [2540, 1580]] };
const raise = { window: 'edge', show: 'raise' };
const circle = Array.from({ length: 41 }, (_, i) => [135 + 90 * Math.cos(i * Math.PI / 20), 165 + 65 * Math.sin(i * Math.PI / 20)]);
// The AI session as the app reports it (counts and states only). A guard throws: the runner stops at that step.
const live = '(await lc.sessionState()).live';
const guard = (as, n, extra = '') => ctl(`(async () => { const l = ${live};
  if (!l || l.state !== 'on') throw Error('the AI session is no longer on (' + (l ? l.state + (l.ended ? ': ' + l.ended : '') : 'none') + '): the remaining actions stay NOT_RUN');
  if (l.out !== 0) throw Error('a request is still out');
  if (l.used !== ${n}) throw Error('the session counted ' + l.used + ' request(s), not ${n}: the run stops (no retry)');
  ${extra}
  return JSON.stringify({ used: l.used, out: l.out, max_submissions: l.max_submissions, reserve: l.reserve, expires_at: l.expires_at, seen: l.seen, missed: l.missed, paused: l.paused, frames: l.frames, unwritten: l.unwritten, at: new Date().toISOString() }); })()`, as);
const started = (n, ms) => ({ target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.state !== 'on' || l.out > 0 || l.used >= ${n}; })()`, timeoutMs: ms });
const ended = ms => ({ target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.state !== 'on' || l.out === 0; })()`, timeoutMs: ms });
// The card as shown: the answer text (when one is shown) and the status line, with the request still out or not.
const card = as => ov(`JSON.stringify({ card_hidden: document.getElementById('card').hidden, answer_hidden: document.getElementById('answerBox').hidden,
  answer: document.getElementById('answer').textContent, status: document.getElementById('askStatus').textContent, cancel_hidden: document.getElementById('askCancel').hidden,
  mode: __lcOverlay.state().mode, at: new Date().toISOString() })`, as);
// The request has settled on the card (nothing out; an answer or a status shown), then the card is read, then a NEW answer
// must be shown: a refused, cancelled, unknown or unsent request (which leaves the earlier answer up) stops the run.
const settled = { target: 'overlay', waitEval: "document.getElementById('askCancel').hidden && (!document.getElementById('answerBox').hidden || document.getElementById('askStatus').textContent.trim().length > 0)", timeoutMs: 10000 };
const answered = ov("(() => { const a = document.getElementById('answer').textContent; if (document.getElementById('answerBox').hidden || !a.trim()) throw Error('no answer is shown on the card: the run stops (no retry)'); if (a === (window.__qaAnswerBefore ?? '')) throw Error('the card still shows the earlier answer: the request was not answered'); return true; })()");
const ask = (question, as) => ov(`(() => { const q = document.getElementById('question'), send = document.getElementById('askSubmit');
  if (document.getElementById('card').hidden || !q || !send) throw Error('the card cannot take a typed request now');
  const level = document.querySelector('input[name=assistance][value=${ASSISTANCE}]');
  if (!level) throw Error('help level unavailable');
  level.checked = true; level.dispatchEvent(new Event('change', { bubbles: true }));
  q.value = ${JSON.stringify(question)}; q.dispatchEvent(new Event('input', { bubbles: true }));
  if (send.disabled || send.hidden) throw Error('Send is unavailable');
  window.__qaAnswerBefore = document.getElementById('answer').textContent;
  send.click(); return JSON.stringify({ question_chars: q.value.length, level: '${ASSISTANCE}', at: new Date().toISOString() }); })()`, as);
// The overlay's newest captured frame (its sequence and pixel hash), for the freshness wait after the screen change.
const newest = "(() => { const s = __lcOverlay.state(), r = [...s.samples].reverse().find(x => x.raw); return { frame: s.frame, sha: r ? r.raw.pixels_sha256 : null }; })()";
// Wind-down checks after the AI stopped: recorded (a failure fails the run), but the capture is still ended and closed.
const after = step => ({ ...step, required: false });

export function liveSteps({ surfaceUrl, profile }) {
  return [
    // The generated surface, owned and identified, full screen, the only thing on the display (as in the accepted run).
    { edgeStart: surfaceUrl, profile, as: 'edge', fullscreen: true }, raise, { edgeFullscreen: true }, truth('surface_before'), onTop,
    // The product, with the real connector named for this process only.
    { launchApp: true, as: 'app', sub: 'live' },
    { target: 'control', waitEval: 'document.querySelectorAll("#displays li[role=option]").length === 1', timeoutMs: 15000 },
    ctl(`(async () => { const a = await lc.subState(), l = await lc.linkState(), s = await lc.sessionState();
      if (a.mode !== 'managed') throw Error('the trusted connector configuration was not taken: ' + a.mode + (a.reason ? ' (' + a.reason + ')' : ''));
      if (l.mode !== 'off') throw Error('the development capture link is on');
      if (s.running) throw Error('a capture is already running');
      return JSON.stringify({ mode: a.mode, state: a.state, login: a.login }); })()`, 'connector_configured'),
    // Check connection, once: the app's own account read (the official managed lock). No sign-in, no polling of the account.
    ctl("(() => { const b = document.getElementById('subCheck'); if (b.hidden || b.disabled) throw Error('Check connection unavailable'); b.click(); return true; })()", 'check_pressed'),
    { target: 'control', waitEval: "(async () => { const a = await lc.subState(); return a.mode !== 'managed' || (a.state !== 'checking' && a.state !== 'not_checked'); })()", timeoutMs: 45000 },
    // Stop before Start on: not signed in, a pending sign-in or request, a selected model that takes no picture, or a
    // spend control the server states as reached (an authoritative stop). An exhausted INCLUDED window is not all of the
    // allowance: ordinary credits can still serve requests (the actual credit-backed image result, 91e72fe), and an unknown
    // quota is not zero. Neither stops the run; the server stays authoritative, with no retry, reset credit or billing change.
    ctl(`(async () => { const a = await lc.subState();
      if (a.mode !== 'managed' || a.state !== 'signed_in') throw Error('not signed in (' + (a.state ?? a.mode) + '): the run stops here; signing in is the user\\'s own step');
      if (a.login !== 'none' || a.asking) throw Error('a sign-in or a request is pending');
      const chosen = (a.models || []).find(m => m.id === a.model);
      if (!chosen || !chosen.image_input) throw Error('the selected model does not take pictures');
      const q = a.quota, windows = q ? q.windows || [] : [];
      if (windows.some(b => b.spend_control_reached === true)) throw Error('the server states a spend control as reached: the run stops before Start');
      if (document.getElementById('aiOn').disabled) throw Error('the AI session cannot be started from the control window');
      return JSON.stringify({ state: a.state, model: a.model, image_input: true, quota_read: a.quota_read_at !== null, quota_available: q ? q.available : null,
        included_usage_allowed: q ? q.ordinary_usage_allowed : null, included_reached: windows.some(b => !!b.rate_limit_reached_type),
        credits_present: windows.some(b => !!b.credits && (b.credits.has_credits === true || b.credits.unlimited === true)), spend_control_reached: false }); })()`, 'account_ready'),
    { productPlacement: 'control' },
    raise, truth('surface_at_start'), onTop,
    // The Start: the three policy fields set through DevTools (value + input event, not OS typing), the AI box ticked,
    // and the product's own Start click handler (a DOM click). Whether this counts as the actual UI Start is the Lead's call.
    { captureStart: `(() => { const items = document.querySelectorAll('#displays li[role=option]'); if (items.length !== 1) throw Error('display selection is ambiguous'); items[0].click();
      const box = document.getElementById('aiOn'); if (box.disabled) throw Error('the AI session cannot be started'); box.checked = true; box.dispatchEvent(new Event('change'));
      for (const [id, v] of [['aiRequests', ${POLICY.requests}], ['aiMinutes', ${POLICY.minutes}], ['aiInterval', ${POLICY.seconds}]]) { const f = document.getElementById(id); f.value = String(v); f.dispatchEvent(new Event('input', { bubbles: true })); }
      const start = document.getElementById('start'); if (start.disabled) throw Error('capture Start unavailable'); start.click();
      return JSON.stringify({ requests: document.getElementById('aiRequests').value, minutes: document.getElementById('aiMinutes').value, seconds: document.getElementById('aiInterval').value, ai: box.checked }); })()`, as: 'capture_start' },
    { target: 'control', waitEval: `(async () => { const s = await lc.sessionState(); return s.running && !s.starting && !!s.live && s.live.state !== 'starting'; })()`, timeoutMs: 20000 },
    // The production policy as the app took it: exactly the set bounds, one session.
    ctl(`(async () => { const l = ${live};
      if (!l || l.state !== 'on') throw Error('the AI session did not start: ' + (l ? l.state + (l.reason ? ' (' + l.reason + ')' : '') : 'none'));
      const span = Date.parse(l.expires_at) - Date.parse(l.since);
      if (l.max_submissions !== ${POLICY_MS.max_submissions} || l.min_observation_interval_ms !== ${POLICY_MS.min_observation_interval_ms} || Math.abs(span - ${POLICY_MS.max_session_ms}) > 2000) throw Error('the session policy is not 4 / 1 min / 60 s');
      return JSON.stringify({ id: l.id, model: l.model, since: l.since, expires_at: l.expires_at, span_ms: span, max_submissions: l.max_submissions, reserve: l.reserve, min_observation_interval_ms: l.min_observation_interval_ms, used: l.used, out: l.out }); })()`, 'live_policy'),
    { target: 'overlay', waitEval: 'typeof __lcOverlay !== "undefined" && __lcOverlay.state().frame !== null', timeoutMs: 15000 },
    { productPlacement: 'overlay' },
    // Talk is off (nothing is read aloud; requests go out as silent) and no card is up.
    ov("(() => { if (document.getElementById('talk').getAttribute('aria-pressed') === 'true') throw Error('Talk is on'); if (!document.getElementById('card').hidden) throw Error('a card is up before any circle'); return JSON.stringify({ talk: 'off', card_hidden: true }); })()", 'overlay_ready'),
    // ACTION 1: the unattended whole-screen look happens by itself (never shown on a card, by design). The wait also ends on
    // a look that was missed or refused, so the guard can stop the run with the app's own reason.
    { target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.state !== 'on' || (l.out === 0 && (l.seen !== null || l.missed !== null)); })()`, timeoutMs: 45000 },
    guard('action1', 1, "if (l.seen === null) throw Error('no look was completed: ' + (l.missed ?? 'unknown'));"),
    ov("(() => { if (!document.getElementById('card').hidden) throw Error('a card appeared without a circle or a question'); return JSON.stringify({ card_hidden: true, mode: __lcOverlay.state().mode }); })()", 'action1_card'),
    // ACTION 2: the scene checked right before the circle's whole frame, then one circle in ASK mode around card 0; the
    // app asks for a hint by itself (no Ask press, no typed text).
    onTop,
    ov("document.querySelector('[data-mode=ASK]').click(), true"), { stroke: circle, pointerType: 'pen' },
    started(2, 10000), ended(45000), settled, card('action2_card'), answered, guard('action2', 2),
    // ACTION 3: the controlled screen change (new cards, same page); the overlay must hold a NEW frame before anything is
    // sent; the scene checked again; then one typed follow-up on the card.
    ov(`(() => { window.__qaFrameBefore = ${newest}; return JSON.stringify(window.__qaFrameBefore); })()`, 'frame_before_change'),
    evalStep('edge', 'window.__qaSurfaceChange()', 'surface_change'), truth('surface_changed'),
    { target: 'overlay', waitEval: `(() => { const n = ${newest}; return n.sha !== null && n.sha !== window.__qaFrameBefore.sha && n.frame !== window.__qaFrameBefore.frame; })()`, timeoutMs: 6000 },
    ov(`JSON.stringify(${newest})`, 'frame_after_change'), onTop,
    ask(QUESTIONS.followup, 'action3_submit'), started(3, 10000), ended(45000), settled, card('action3_card'), answered, guard('action3', 3),
    // ACTION 4: the scene checked right before the frame, one more typed request, and Stop the AI as soon as it is out.
    onTop, ask(QUESTIONS.fence, 'action4_submit'),
    { target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.state !== 'on' || l.out > 0 || l.used >= 4; })()`, timeoutMs: 10000 },
    ctl(`(async () => { const l = ${live}; const b = document.getElementById('liveStop'); if (b.hidden || b.disabled) throw Error('Stop the AI unavailable');
      b.click(); return JSON.stringify({ out_at_stop: l ? l.out : null, used_at_stop: l ? l.used : null, state_at_stop: l ? l.state : null, at: new Date().toISOString() }); })()`, 'action4_stop'),
    { target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.state === 'ended' || l.state === 'off'; })()`, timeoutMs: 20000 },
    // The interrupted request settles within the connector's own bound (8 s); then 5 s in which a late answer would show.
    { target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.out === 0; })()`, timeoutMs: 20000 },
    { sleep: 5000 },
    ctl(`(async () => { const l = ${live}; if (l && l.state === 'on') throw Error('the AI session is still on after Stop');
      if (l && l.out !== 0) throw Error('a request is still out after Stop'); if (l && l.used > 4) throw Error('more than four requests counted');
      return JSON.stringify({ state: l && l.state, ended: l && l.ended, used: l && l.used, out: l && l.out, unwritten: l && l.unwritten, at: new Date().toISOString() }); })()`, 'action4_after'),
    card('action4_card'),
    // Wind-down (no AI request): the surface checked once more, the capture ended, the app and Edge closed.
    after(raise), truth('surface_after', { required: false }), after(onTop),
    ctl("document.getElementById('stop').click(), true", 'stop_pressed'),
    { target: 'control', waitEval: '(async () => !(await lc.sessionState()).running)()', timeoutMs: 20000 },
    { closeApp: true, via: 'wm_close', waitMs: 8000, required: false }, { edgeClose: true, required: false },
  ];
}
/**
 * The longest the steps can take before the runner itself ends (every wait to its timeout, and about what each other
 * step took in the accepted diagnostic): the native bound must not cut the runner off before its own cleanup.
 */
export function worstCaseMs(steps) {
  const fixed = { edgeStart: 6000, window: 6000, edgeFullscreen: 12000, onTop: 6000, productPlacement: 6000, launchApp: 6000, captureStart: 5000, stroke: 3000, edgeClose: 3000 };
  return steps.reduce((sum, s) => sum + (s.waitEval ? s.timeoutMs ?? 15000 : s.sleep ?? (s.closeApp ? (s.waitMs ?? 3000) + 2000 : Object.keys(fixed).find(k => k in s) ? fixed[Object.keys(fixed).find(k => k in s)] : 1000)), 0) + 30000;   // + the runner's start-up and finally
}

/** The runner: the reviewed r4 runner's bytes, rebuilt from the same sources and deltas, naming this run's folder. */
function liveRunner(ctx) {
  const built = buildVisibleCandidate(ctx);
  return applyPlacementGeometry(applyPlacementClient(applyAdmissionPoints(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx)))));
}
/** The reviewed runner with this run's folder, or a refusal: the live candidate changes no runner byte. */
export function assertReviewedRunner(runner, work) {
  const reviewed = readFileSync(join(repo, REVIEWED_RUNNER.file));
  if (sha(reviewed) !== REVIEWED_RUNNER.sha256) throw Error('reviewed r4 runner bytes changed');
  const folder = work.split('/').at(-1);
  const text = reviewed.toString('utf8');
  if (text.split(REVIEWED_RUNNER.folder).length !== 2 || runner.split(folder).length !== 2) throw Error('the work folder is named more than once');
  if (text.replace(REVIEWED_RUNNER.folder, folder) !== runner) throw Error('live runner differs from the reviewed r4 runner');
}
export function connectorConfig() {
  return JSON.stringify({ format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: CONNECTOR.distribution, user: CONNECTOR.user, cd: CONNECTOR.copy, python: CONNECTOR.python },
    state_dir: CONNECTOR.state_dir, codex_bin: CONNECTOR.codex_bin }) + '\n';
}
function payloadFor(ctx, work) {
  const runner = liveRunner(ctx);
  assertReviewedRunner(runner, work);
  return { 'runner.ps1': runner, 'steps.json': JSON.stringify(liveSteps(ctx), null, 2) + '\n', 'surface.html': readFileSync(join(here, 'surface_live.html')), 'sub-live.json': connectorConfig() };
}
function manifestFor(work) {
  const ctx = context(work), payload = payloadFor(ctx, work);
  if (worstCaseMs(liveSteps(ctx)) > NATIVE_BOUND_MS) throw Error('the steps can outlast the fixed native bound');
  const fileArgs = ['-File', win(join(work, 'runner.ps1')), '-Electron', electron, '-Stage', win(stage), '-UserData', win(join(work, 'userdata')), '-StepsFile', win(join(work, 'steps.json')), '-OutDir', win(join(work, 'out')), '-Edge', edge, '-AppTemp', win(join(work, 'apptemp')), '-LinkDir', ctx.linkDir];
  const manifest = {
    kind: 'qa-live-nonvoice-offline-candidate/v1', prepared_only: true, execution_authorized: false,
    production_commit: source, release_commit: release, reviewed_runner: REVIEWED_RUNNER,
    work, stage, stage_payload_files: 77, stage_tree_sha256: tree, ...ctx, electron, edge,
    files: Object.fromEntries(Object.entries(payload).map(([n, bytes]) => [n, sha(bytes)])),
    source_files: Object.fromEntries(sourceNames.map(n => [n, sha(readFileSync(join(here, n)))])),
    app_entry: { executable: electron, app_arguments: [win(stage)], package_main: 'dist/apps/windows/src/main/main.js', main_sha256: entry, native_helper_sha256: helper, electron_sha256: runtime },
    connector: CONNECTOR, policy: POLICY, policy_ms: POLICY_MS, actions: ACTIONS, questions: QUESTIONS, assistance: ASSISTANCE,
    talk: 'off: the product default at every Start, checked on the overlay before the first action; asked_as must stay silent',
    input_method: 'NONPHYSICAL (Lead D2): inside the product windows only, DevTools DOM value + input event for the three policy fields, the question and the help level; DOM clicks for Check connection, Start, ASK, Send and Stop the AI (the product\'s own handlers); CDP pen events for the circle. No OS typing, mouse, pen or keyboard.',
    circle_assistance: CIRCLE_ASSISTANCE, assistance_override: 'explain for the two typed visual-reading requests only (Lead D1, b63ecdc); recorded as a test override',
    stop_scope: 'Stop the AI (#liveStop) fences the AI requests; the capture keeps running until the wind-down capture Stop (Lead D3)',
    native_bound_ms: NATIVE_BOUND_MS, lead_decisions: 'docs/verification/lead/live-windows/nonvoice-driver-review/README.md at b63ecdc (D1-D10)',
    expected_fence: 'Stop is clicked as soon as the 4th request is out; the connector usually has not written turn/start yet, so the likely verdict is fenced_before_submission. Fencing a turn already at the provider would need a different trigger (a Lead decision).',
    native_worst_case_ms: worstCaseMs(liveSteps(ctx)),
    raw_receipts: 'Kept outside the repository (~/.local/state/lc-qa-live/<run>/receipts, 0700); only an allowlisted, sanitized set of generated evidence is for Git (Lead D8).',
    script_permission: 'A separate, exact, process-only RemoteSigned permission for this runner with real subscription use is required; the AI-disabled approvals do not carry over.',
    proposed_native_invocation: { executable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, arguments: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', ...fileArgs], status: 'NOT_ALLOCATED_NOT_EXECUTED', persistent_policy_changes: false },
    capture_prerequisite_mode: 'REAL_SUBSCRIPTION_NONVOICE_GENERATED_SURFACE',
    provider_attempts: 0, native_script_executed: false, display_account_audio_lease: 'NONE',
    execution_block: 'Prepared only. Lead reviews this exact package, the current prerequisites and the decisions it names, then issues a separate exclusive display/account allocation for qa_run_live_candidate.mjs.',
  };
  return { manifest, payload };
}
export function prepareLiveCandidate(work = stage.replace(/lc-windows-tts-52be105$/, 'lc-qa-live-nonvoice-' + randomUUID().replaceAll('-', ''))) {
  if (!workPattern.test(work) || existsSync(work)) throw Error('new uncreated live scratch required');
  return manifestFor(work);
}
/** Whether a saved candidate is exactly what the current sources make, and its scratch is still unused (separately). */
export function checkLiveCandidate(manifest, payload, identity, { scratchExists = existsSync } = {}) {
  if (manifest.kind !== 'qa-live-nonvoice-offline-candidate/v1' || manifest.production_commit !== source || manifest.release_commit !== release
      || manifest.stage !== stage || manifest.stage_tree_sha256 !== tree || manifest.execution_authorized !== false || manifest.prepared_only !== true
      || manifest.display_account_audio_lease !== 'NONE' || manifest.native_script_executed !== false || manifest.provider_attempts !== 0
      || !workPattern.test(manifest.work ?? '')) throw Error('exact offline-only live manifest required');
  const expected = manifestFor(manifest.work);
  if (JSON.stringify(manifest) !== JSON.stringify(expected.manifest)) throw Error('candidate metadata or source pins changed');
  if (Object.keys(payload).sort().join() !== names.slice().sort().join()) throw Error('exact four candidate payloads required');
  for (const name of names) if (sha(payload[name]) !== manifest.files[name] || sha(payload[name]) !== sha(expected.payload[name])) throw Error('candidate payload changed');
  if (identity?.kind !== 'qa-tts-static-file-identity/v1' || identity.passed !== true || identity.source_commit !== source || identity.release_commit !== release
      || identity.stage !== stage || identity.tree_sha256 !== tree || identity.matching_payload_files !== 77 || identity.actual_payload_files !== 77
      || identity.entrypoint?.sha256 !== entry || identity.native_executable_sha256 !== helper || identity.electron_runtime?.file_sha256?.['electron.exe'] !== runtime
      || identity.app_or_helper_launched !== false || identity.windows_process_invoked !== false || identity.provider_requests !== 0
      || identity.stage_or_runtime_modified !== false
      || !['missing_files', 'unexpected_files', 'nonregular_entries', 'differing_files'].every(k => Array.isArray(identity[k]) && identity[k].length === 0)) throw Error('matching static package receipt required');
  return { kind: 'qa-live-offline-admission/v1', identity_passed: true, scratch_unused: !scratchExists(manifest.work), execution_admitted: false, native_executed: false,
    provider_attempts: 0, source_commit: source, stage_tree_sha256: tree, runner_sha256: manifest.files['runner.ps1'], steps: JSON.parse(payload['steps.json']).length,
    limitation: 'Saved point-in-time static receipt and candidate identity only; not a live launch gate, account state, resource lease or acceptance.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, path, receipt, extra] = process.argv.slice(2);
  if (mode === 'prepare' && path && !receipt && !extra) {
    const out = resolve(path);
    if (existsSync(out) || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p))) throw Error('new QA evidence or /tmp folder required');
    const { manifest, payload } = prepareLiveCandidate();
    mkdirSync(out, { recursive: true, mode: 0o700 });
    for (const [name, bytes] of Object.entries(payload)) writeFileSync(join(out, name), bytes);
    writeFileSync(join(out, 'candidate.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ prepared: true, execution_authorized: false, out, files: manifest.files }));
  } else if (mode === 'check' && path && receipt && !extra) {
    const folder = dirname(resolve(path)), manifest = JSON.parse(readFileSync(path));
    console.log(JSON.stringify(checkLiveCandidate(manifest, Object.fromEntries(names.map(n => [n, readFileSync(join(folder, n))])), JSON.parse(readFileSync(receipt))), null, 2));
  } else if (mode === 'prepare-connector' && !path) {
    const { makeCopy, compareCopy, askPathCheck } = await import('./sub_copy.mjs');
    const { liveImportCheck } = await import('./qa_live_ledger.mjs');
    if (!existsSync(CONNECTOR.copy)) makeCopy(CONNECTOR.commit, CONNECTOR.copy);
    const same = compareCopy(CONNECTOR.commit, CONNECTOR.copy);
    const ask = askPathCheck(CONNECTOR.python, CONNECTOR.copy), livePath = liveImportCheck(CONNECTOR.python, CONNECTOR.copy);
    console.log(JSON.stringify({ copy: CONNECTOR.copy, commit: CONNECTOR.commit, equal: same.equal, files: same.files, missing: same.missing.length, differing: same.differing.length, extra: same.extra.length, ask_path: ask, live_path: livePath }, null, 1));
    process.exitCode = same.equal && ask.ok && livePath.ok ? 0 : 1;
  } else throw Error('use prepare <new QA folder>, check <candidate.json> <static receipt> or prepare-connector; execution is the separate allocated wrapper');
}
