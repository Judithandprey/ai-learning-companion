#!/usr/bin/env node
// The four-action NONVOICE live acceptance driver for product 52be105: offline assembly and checks only. No process,
// native, GUI, account, model or audio calls happen here (prepare-connector runs only a local copy and an import check).
//   prepare <new QA folder>                 a new candidate (runner, steps, live surface, connector configuration)
//   check <candidate.json> <stage receipt>  the saved candidate reproduces from the current sources; its scratch is unused
//   prepare-connector                       the private exact-source 52be105 Backend copy the real connector runs from
//
// Reuse, not a new framework: the runner is byte for byte the reviewed r4 diagnostic runner (Support 184f712; attempt 3
// passed 32/32) with its new work folder and one delta (F3: the frozen admission context and LC_SOURCE_ADMISSION for the
// product launch); the source-admission checker is that runner's own admission code. The steps keep that run's Edge
// identity, display and 16-point admission, control/overlay placement and exact-owned cleanup, and replace its
// AI-disabled parts with the four released actions:
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
  'signin_cleanup.mjs', 'qa_live_ledger.mjs', 'qa_run_tts_candidate.mjs', 'qa_sub_watch.py', 'qa_admission_checker.ps1', 'qa_overlay_predicate.ps1',
  'qa_overlay_fixtures.json', 'qa_overlay_fixture_check.ps1'];
export const names = ['runner.ps1', 'steps.json', 'surface.html', 'sub-live.json', 'admission-checker.ps1', 'admission-live.json'];
// The payloads the product reads through the link folder (named for that one app process); the others sit in the scratch.
export const linkNames = ['sub-live.json', 'admission-live.json'];
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
    // ... and the QA source-admission checker for every capture (F3, Lead interface 4f7d9fa): LC_SOURCE_ADMISSION names
    // its pinned configuration for this process only; the runner freezes the admitted Edge/display context just before.
    { launchApp: true, as: 'app', sub: 'live', admission: 'live' },
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
      // The applicable bucket as the connector selects it (52be105 chatgpt_rpc.py ask): the Codex limit for this model,
      // or the one unnamed bucket; only its spend control or workspace limit stops the run, never another model's bucket.
      const q = a.quota, windows = q ? q.windows || [] : [];
      let applicable = windows.filter(b => b.limit_id === 'codex' && (b.normal_model_slug === null || b.normal_model_slug === a.model));
      if (!applicable.length && windows.length === 1 && windows[0].limit_id === null) applicable = windows.filter(b => b.normal_model_slug === null || b.normal_model_slug === a.model);
      const workspace = ['workspace_owner_credits_depleted', 'workspace_member_credits_depleted', 'workspace_owner_usage_limit_reached', 'workspace_member_usage_limit_reached'];
      if (applicable.length === 1 && (applicable[0].spend_control_reached === true || workspace.includes(applicable[0].rate_limit_reached_type))) throw Error('the server states a spend or workspace limit for this model as reached: the run stops before Start');
      if (document.getElementById('aiOn').disabled) throw Error('the AI session cannot be started from the control window');
      return JSON.stringify({ state: a.state, model: a.model, image_input: true, quota_read: a.quota_read_at !== null, quota_available: q ? q.available : null,
        included_usage_allowed: q ? q.ordinary_usage_allowed : null, included_reached: windows.some(b => !!b.rate_limit_reached_type),
        credits_present: windows.some(b => !!b.credits && (b.credits.has_credits === true || b.credits.unlimited === true)), applicable_buckets: applicable.length, spend_control_reached: false }); })()`, 'account_ready'),
    // The one display as the product lists it (its display_id, bounds and scale), recorded before Start: the checker's
    // arm must name this same display (ledger sourceAdmission).
    ctl(`(async () => { const d = await lc.listDisplays(); if (!Array.isArray(d) || d.length !== 1) throw Error('the product does not list exactly one display');
      return JSON.stringify({ display_id: d[0].display_id, bounds: d[0].bounds, scale_factor: d[0].scale_factor, primary: d[0].primary }); })()`, 'display_choice'),
    { productPlacement: 'control' },
    raise, truth('surface_at_start'), onTop,
    // The Start: the three policy fields set through DevTools (value + input event, not OS typing), the AI box ticked,
    // and the product's own Start click handler (a DOM click). Whether this counts as the actual UI Start is the Lead's call.
    { captureStart: `(() => { const items = document.querySelectorAll('#displays li[role=option]'); if (items.length !== 1) throw Error('display selection is ambiguous'); items[0].click();
      const box = document.getElementById('aiOn'); if (box.disabled) throw Error('the AI session cannot be started'); box.checked = true; box.dispatchEvent(new Event('change'));
      for (const [id, v] of [['aiRequests', ${POLICY.requests}], ['aiMinutes', ${POLICY.minutes}], ['aiInterval', ${POLICY.seconds}]]) { const f = document.getElementById(id); f.value = String(v); f.dispatchEvent(new Event('input', { bubbles: true })); }
      const start = document.getElementById('start'); if (start.disabled) throw Error('capture Start unavailable'); start.click();
      return JSON.stringify({ requests: document.getElementById('aiRequests').value, minutes: document.getElementById('aiMinutes').value, seconds: document.getElementById('aiInterval').value, ai: box.checked }); })()`, as: 'capture_start' },
    { target: 'control', waitEval: `(async () => { const s = await lc.sessionState(); return s.running && !s.starting && !!s.live && s.live.state !== 'starting'; })()`, timeoutMs: 30000 },
    // The production policy as the app took it: exactly the set bounds, one session.
    ctl(`(async () => { const l = ${live};
      if (!l || l.state !== 'on') throw Error('the AI session did not start: ' + (l ? l.state + (l.reason ? ' (' + l.reason + ')' : '') : 'none'));
      const span = Date.parse(l.expires_at) - Date.parse(l.since);
      if (l.max_submissions !== ${POLICY_MS.max_submissions} || l.min_observation_interval_ms !== ${POLICY_MS.min_observation_interval_ms} || Math.abs(span - ${POLICY_MS.max_session_ms}) > 2000) throw Error('the session policy is not 4 / 1 min / 60 s');
      return JSON.stringify({ id: l.id, model: l.model, since: l.since, expires_at: l.expires_at, span_ms: span, max_submissions: l.max_submissions, reserve: l.reserve, min_observation_interval_ms: l.min_observation_interval_ms, used: l.used, out: l.out }); })()`, 'live_policy'),
    // (The first frame is published only after the checker started and admitted arm, pre- and post-acquisition: about
    // 3 s per decision from the accepted diagnostic's admission timings, plus the checker's start; hence 30 s.)
    { target: 'overlay', waitEval: 'typeof __lcOverlay !== "undefined" && __lcOverlay.state().frame !== null', timeoutMs: 30000 },
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
    // (A send waits for its own admission, possibly queued behind an acquisition's two: up to 20 s before it is out.)
    started(2, 20000), ended(45000), settled, card('action2_card'), answered, guard('action2', 2),
    // ACTION 3: the controlled screen change (new cards, same page); the overlay must hold a NEW frame before anything is
    // sent; the scene checked again; then one typed follow-up on the card.
    ov(`(() => { window.__qaFrameBefore = ${newest}; return JSON.stringify(window.__qaFrameBefore); })()`, 'frame_before_change'),
    evalStep('edge', 'window.__qaSurfaceChange()', 'surface_change'), truth('surface_changed'),
    { target: 'overlay', waitEval: `(() => { const n = ${newest}; return n.sha !== null && n.sha !== window.__qaFrameBefore.sha && n.frame !== window.__qaFrameBefore.frame; })()`, timeoutMs: 20000 },
    ov(`JSON.stringify(${newest})`, 'frame_after_change'), onTop,
    ask(QUESTIONS.followup, 'action3_submit'), started(3, 20000), ended(45000), settled, card('action3_card'), answered, guard('action3', 3),
    // ACTION 4: the scene checked right before the frame, one more typed request, and Stop the AI as soon as it is out.
    onTop, ask(QUESTIONS.fence, 'action4_submit'),
    { target: 'control', waitEval: `(async () => { const l = ${live}; return !l || l.state !== 'on' || l.out > 0 || l.used >= 4; })()`, timeoutMs: 20000 },
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

/** The reviewed r4 runner's bytes, rebuilt from the same sources and deltas, naming this run's folder. */
function reviewedRunner(ctx) {
  const built = buildVisibleCandidate(ctx);
  return applyPlacementGeometry(applyPlacementClient(applyAdmissionPoints(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx)))));
}
function liveRunner(ctx) { return applyAdmissionDelta(reviewedRunner(ctx)); }
/** The reviewed runner with this run's folder plus exactly the source-admission delta, or a refusal. */
export function assertReviewedRunner(runner, work) {
  runner = revertAdmissionDelta(runner);
  const reviewed = readFileSync(join(repo, REVIEWED_RUNNER.file));
  if (sha(reviewed) !== REVIEWED_RUNNER.sha256) throw Error('reviewed r4 runner bytes changed');
  const folder = work.split('/').at(-1);
  const text = reviewed.toString('utf8');
  if (text.split(REVIEWED_RUNNER.folder).length !== 2 || runner.split(folder).length !== 2) throw Error('the work folder is named more than once');
  if (text.replace(REVIEWED_RUNNER.folder, folder) !== runner) throw Error('live runner differs from the reviewed r4 runner');
}
// ---- F3: the source-admission checker (Lead interface 4f7d9fa; Web owns the app side in apps/windows) ----
// The checker reuses the reviewed runner's admission byte for byte: these definitions are cut from the emitted runner and
// inserted unchanged into qa_admission_checker.ps1 (which adds only the protocol loop and the frozen context).
const CHECKER_TYPES = ['QaWin', 'QaEdgeSurface', 'QaDisplayAdmissionNative', 'QaPlacementNative'];
// The runner's statement right after its QaWin type: the process works in physical pixels (RootAt's 16 points are
// physical coordinates of the 2560x1600 display); without it the checker would test virtualized logical coordinates.
const CHECKER_FOLLOWING = { QaWin: '[void][QaWin]::SetProcessDPIAware()\n' };
const CHECKER_FUNCTIONS = ['Receive-Message', 'Invoke-Cdp', 'Target-Url', 'Get-Socket', 'Eval', 'ConvertTo-QaUrlKey', 'Get-QaEdgeSocket', 'Assert-QaEdgeSurfacePage',
  'Get-QaOwnedEdgeIds', 'Find-QaEdgeSurface', 'Get-QaEdgeSurfaceWindow', 'Window-Handle', 'New-QaAdmissionEvidence', 'Read-QaDisplaySnapshot', 'Assert-QaDisplayBaseline'];
// The checker's admission is the reviewed Assert-QaSurfaceAdmission with exactly these substitutions (Lead decision
// handoff_1698eb17, handoff_e893ca27): during the capture, at a point ONLY the overlay bound at the admitted arm may be
// drawn above the admitted Edge (also while click-through), and the foreground may be that overlay with Edge at the
// top of the normal band (qa_overlay_predicate.ps1 Test-QaPointAdmitted / Test-QaOverlayForeground); with no binding
// (before arm) the point rule is the reviewed one exactly. Everything else is the reviewed text.
export const CHECKER_ADMISSION_SUBSTITUTIONS = [
  ['function Assert-QaSurfaceAdmission([string]$phase) {', 'function Assert-QaCheckerAdmission([string]$phase) {'],
  ["    if (-not $state.Foreground -or ($state.Bounds -join ',') -ne '0,0,2560,1600') { throw 'owned foreground window does not cover the admitted display' }",
   "    if (-not ($state.Foreground -or (Test-QaOverlayForeground $window $script:qaOverlayBinding $entry)) -or ($state.Bounds -join ',') -ne '0,0,2560,1600') { throw 'owned foreground window does not cover the admitted display' }"],
  ["      if ([QaWin]::RootAt([int]$point[0], [int]$point[1]) -ne $window) { throw 'owned surface lost at a required card or corner point' }",
   "      $root = [QaWin]::RootAt([int]$point[0], [int]$point[1])\n      if (-not (Test-QaPointAdmitted $root $window ([int]$point[0]) ([int]$point[1]) $script:qaOverlayBinding $entry)) { throw 'owned surface lost at a required card or corner point' }"],
  ["    if ($lastWindow.Owner -ne $state.Owner -or -not $lastWindow.Foreground -or ($lastWindow.Bounds -join ',') -ne '0,0,2560,1600') {",
   "    if ($lastWindow.Owner -ne $state.Owner -or -not ($lastWindow.Foreground -or (Test-QaOverlayForeground $window $script:qaOverlayBinding $entry)) -or ($lastWindow.Bounds -join ',') -ne '0,0,2560,1600') {"],
];
/** The checker's admission function, derived from the reviewed one by exactly CHECKER_ADMISSION_SUBSTITUTIONS. */
export function checkerAdmission(runner) {
  const at = runner.indexOf('function Assert-QaSurfaceAdmission([string]$phase) {');
  if (at < 0 || runner.indexOf('function Assert-QaSurfaceAdmission(', at + 1) >= 0) throw Error('reviewed admission not found once');
  let f = runner.slice(at, runner.indexOf('\n}\n', at) + 3);
  for (const [a, b] of CHECKER_ADMISSION_SUBSTITUTIONS) {
    if (f.split(a).length !== 2) throw Error('reviewed admission text changed; checker derivation refused');
    f = f.replace(a, () => b);
  }
  return f;
}
const CHECKER_MARKER = '# @@QA_REVIEWED_ADMISSION_DEFINITIONS@@', PREDICATE_MARKER = '# @@QA_OVERLAY_PREDICATE@@';
/** The ONE exact-overlay predicate, inserted unchanged into the checker and the runner. */
export function overlayPredicate() { return readFileSync(join(here, 'qa_overlay_predicate.ps1'), 'utf8').replace(/\n+$/, '\n'); }
/** The reviewed definitions the checker needs, each cut whole and unchanged from the runner (or a refusal). */
export function checkerDefinitions(runner) {
  const blocks = [], starts = [...runner.matchAll(/^Add-Type @'\n/gm)].map(m => m.index);
  for (const type of CHECKER_TYPES) {
    const found = starts.map(i => runner.slice(i, runner.indexOf("\n'@\n", i) + 4)).filter(b => new RegExp(`public (static |sealed )?class ${type} \\{`).test(b));
    if (found.length !== 1) throw Error(`reviewed type ${type} not found once`);
    const next = CHECKER_FOLLOWING[type], at = runner.indexOf(found[0]) + found[0].length;
    if (next && runner.slice(at, at + next.length) !== next) throw Error(`reviewed statement after ${type} changed`);
    blocks.push(found[0] + (next ?? ''));
  }
  for (const name of CHECKER_FUNCTIONS) {
    const heads = [...runner.matchAll(new RegExp(`^function ${name.replace('-', '\\-')}[ (]`, 'gm'))].map(m => m.index);
    if (heads.length !== 1) throw Error(`reviewed function ${name} not found once`);
    const lineEnd = runner.indexOf('\n', heads[0]), first = runner.slice(heads[0], lineEnd);
    const end = first.trimEnd().endsWith('}') && (first.match(/\{/g) ?? []).length === (first.match(/\}/g) ?? []).length ? lineEnd : runner.indexOf('\n}\n', heads[0]) + 2;
    blocks.push(runner.slice(heads[0], end) + '\n');
  }
  blocks.push(checkerAdmission(runner));
  return blocks.join('\n');
}
/** The frozen checker script: the protocol loop with the reviewed admission definitions inserted at its marker. */
export function admissionChecker(runner) {
  const template = readFileSync(join(here, 'qa_admission_checker.ps1'), 'utf8');
  if (template.split(CHECKER_MARKER).length !== 2 || template.split(PREDICATE_MARKER).length !== 2) throw Error('checker template markers missing or repeated');
  return template.replace(CHECKER_MARKER, () => '# ---- reviewed runner definitions, unchanged (qa_live_candidate.mjs checkerDefinitions) ----\n' + checkerDefinitions(runner) + '# ---- end of reviewed definitions ----')
    .replace(PREDICATE_MARKER, () => overlayPredicate());
}
/**
 * The prepared (not executed) fixture check of the overlay predicate: its four pure functions (OVERLAY_PURE), cut
 * unchanged from qa_overlay_predicate.ps1, inserted into qa_overlay_fixture_check.ps1. No native call; it runs only when
 * the Lead allows it.
 */
export const OVERLAY_PURE = ['Get-QaOverlayBindingFault', 'Get-QaOverlayFault', 'Get-QaStackFault', 'Get-QaNormalTopFault'];
export function overlayFixtureCheck() {
  const template = overlayPredicate(), runner = readFileSync(join(here, 'qa_overlay_fixture_check.ps1'), 'utf8');
  const cut = name => {
    const at = template.indexOf(`function ${name}(`);
    if (at < 0 || template.indexOf(`function ${name}(`, at + 1) >= 0) throw Error(`pure function ${name} not found once`);
    return template.slice(at, template.indexOf('\n}\n', at) + 3);
  };
  const marker = '# @@QA_OVERLAY_PURE_FUNCTIONS@@';
  if (runner.split(marker).length !== 2) throw Error('fixture check marker missing or repeated');
  return runner.replace(marker, () => OVERLAY_PURE.map(cut).join('\n'));
}
const POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
export const ADMISSION_TIMING = { ready_ms: 10000, decision_ms: 5000 };   // the Lead's initial fixed values (4f7d9fa)
/** The pinned checker configuration (lc-windows-source-admission-config/v1): Windows PowerShell and the frozen script. */
export function admissionConfig(work, ctx) {
  return JSON.stringify({ format: 'lc-windows-source-admission-config/v1', checker: { command: POWERSHELL,
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', win(join(work, 'admission-checker.ps1')), '-Context', ctx.linkDir + '\\admission-context.json', '-Log', win(join(work, 'out', 'admission-checker.jsonl'))] },
    ...ADMISSION_TIMING }) + '\n';
}
// The runner's one delta: before the product launch, right after its full admission, freeze the admitted context for the
// checker (the owned Edge process, surface page token and window, DevTools port, display signature) and name the
// checker configuration in LC_SOURCE_ADMISSION for that process only (cleared at start, set inside the launch, removed in
// its finally, like the connector's configuration).
const ADMISSION_CONTEXT_FUNCTION = `function Write-QaAdmissionContext([string]$path) {
  if ($null -eq $script:qaEdgeIdentity -or $null -eq $script:qaDisplayBaseline) { throw 'source admission context is not established' }
  $p = $started['edge']
  if (-not $p -or $p.HasExited -or [uint32]$p.Id -ne $script:qaEdgeIdentity.pid -or $p.StartTime -ne $script:qaEdgeIdentity.start) { throw 'owned Edge changed before the source admission context' }
  if (-not $script:app -or $script:app.HasExited) { throw 'the launched product is unavailable for the source admission context' }
  $context = [ordered]@{ format = 'lc-qa-admission-context/2'; edge_pid = [int]$p.Id; edge_start_ticks = $p.StartTime.Ticks.ToString(); token = [string]$script:qaEdgeIdentity.token
    handle = $script:qaEdgeIdentity.handle.ToInt64().ToString(); surface_url = [string]$script:qaEdgeSurfaceUrl; edge_port = [int]$script:edgePort; display_signature = [string]$script:qaDisplayBaselineSignature
    app_pid = [int]$script:app.Id; app_start_ticks = $script:app.StartTime.Ticks.ToString() }
  $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes(($context | ConvertTo-Json -Compress) + "\`n")
  $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}
`;
function runnerAdmissionDelta() { return [
  ["foreach ($k in @('LC_SUBSCRIPTION_CONNECTOR', 'LC_DEV_CAPTURE_HOST', 'ELECTRON_RUN_AS_NODE')) {", "foreach ($k in @('LC_SUBSCRIPTION_CONNECTOR', 'LC_DEV_CAPTURE_HOST', 'LC_SOURCE_ADMISSION', 'ELECTRON_RUN_AS_NODE')) {"],
  ["function Start-App([string]$key, [string]$link = '', [string]$sub = '') {\n  $linkFile = $null\n  $subFile = $null\n",
   "function Start-App([string]$key, [string]$link = '', [string]$sub = '', [string]$admission = '') {\n  $linkFile = $null\n  $subFile = $null\n  $admissionFile = $null\n" +
   "  if ($admission) {\n    # The QA source-admission checker's pinned configuration, for this app process only (F3).\n    if ($admission -notmatch '^[a-z0-9-]+$' -or -not $LinkDir) { throw \"bad source admission config name $admission\" }\n" +
   "    $admissionFile = Join-Path $LinkDir \"admission-$admission.json\"\n    if (-not (Test-Path -LiteralPath $admissionFile -PathType Leaf)) { throw \"no source admission config $admission\" }\n  }\n"],
  ["  if ($subFile) { $env:LC_SUBSCRIPTION_CONNECTOR = $subFile }\n  try { Assert-QaSurfaceAdmission 'before_product_launch'; $script:app = Start-Process",
   "  if ($subFile) { $env:LC_SUBSCRIPTION_CONNECTOR = $subFile }\n  Remove-Item Env:\\LC_SOURCE_ADMISSION -ErrorAction SilentlyContinue\n  try { Assert-QaSurfaceAdmission 'before_product_launch'; if ($admissionFile) { $env:LC_SOURCE_ADMISSION = $admissionFile }; $script:app = Start-Process"],
  // The frozen context, naming the launched product, once the app is recorded (PID file included): a failed write then
  // fails the step with the app already owned and recorded for the normal cleanup.
  ["  try { Add-Content -Encoding ASCII -Path (Join-Path $OutDir 'app-pids.txt') -Value \"$key $($script:app.Id) $($script:app.StartTime.ToUniversalTime().ToString('o'))\" } catch { }\n}\n",
   "  try { Add-Content -Encoding ASCII -Path (Join-Path $OutDir 'app-pids.txt') -Value \"$key $($script:app.Id) $($script:app.StartTime.ToUniversalTime().ToString('o'))\" } catch { }\n" +
   "  if ($admissionFile) { Write-QaAdmissionContext (Join-Path $LinkDir 'admission-context.json'); $results.processes[$key].admission_context_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $LinkDir 'admission-context.json')).Hash.ToLower() }\n}\n"],
  // The one exact-overlay predicate for the runner's own point consumers (Assert-QaEdgePoints and onTop's PID check).
  ["      $record.owned = ($root -eq $window)\n", "      $record.owned = (Test-QaPointAdmitted $root $window ([int]$point[0]) ([int]$point[1]) $script:qaRunnerOverlayBinding $record)\n"],
  ["        $entry.points = @($step.points).Count\n        Assert-QaEdgePoints $entry $h @($step.points)\n",
   "        $entry.points = @($step.points).Count\n        $script:qaRunnerOverlayBinding = $null\n        if ($script:app -and -not $script:app.HasExited) { $script:qaRunnerOverlayBinding = Get-QaRunnerOverlayBinding }\n        Assert-QaEdgePoints $entry $h @($step.points)\n"],
  ["          if ($at -ne $owner) { $other += ", "          if ($at -ne $owner -and -not ($null -ne $script:qaRunnerOverlayBinding -and (Test-QaPointAdmitted ([QaWin]::RootAt([int]$pt[0], [int]$pt[1])) $h ([int]$pt[0]) ([int]$pt[1]) $script:qaRunnerOverlayBinding $entry))) { $other += "],
  ["Remove-Item Env:\\LC_SUBSCRIPTION_CONNECTOR -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP;", "Remove-Item Env:\\LC_SUBSCRIPTION_CONNECTOR -ErrorAction SilentlyContinue; Remove-Item Env:\\LC_SOURCE_ADMISSION -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP;"],
  ["  if ($subFile) { $results.processes[$key].sub_config_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $subFile).Hash.ToLower() }\n",
   "  if ($subFile) { $results.processes[$key].sub_config_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $subFile).Hash.ToLower() }\n  $results.processes[$key].admission = $admission\n  if ($admissionFile) { $results.processes[$key].admission_config_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $admissionFile).Hash.ToLower() }\n"],
  ["        Start-App ([string]$step.as) ([string]$step.link) ([string]$step.sub)\n", "        Start-App ([string]$step.as) ([string]$step.link) ([string]$step.sub) ([string]$step.admission)\n"],
  ["function Assert-QaSurfaceAdmission([string]$phase) {", ADMISSION_CONTEXT_FUNCTION + overlayPredicate() + RUNNER_BINDING_FUNCTION + "function Assert-QaSurfaceAdmission([string]$phase) {"],
]; }
// The current capture's overlay binding for the runner's own point checks: main's test-only session state
// (source_admission {capture_id, overlay {pid, hwnd}, active}, Lead handoff_e893ca27) must agree with the arm QA's
// checker admitted (its log) and name the launched product; then the one predicate binds it to the launched product's
// native identity. None while no capture is armed: the strict rule applies.
const RUNNER_BINDING_FUNCTION = `$script:qaRunnerOverlayBinding = $null
function Get-QaRunnerOverlayBinding {
  $state = (Eval 'control' "(async () => { const s = await lc.sessionState(); return JSON.stringify(s && s.source_admission ? s.source_admission : null); })()") | ConvertFrom-Json
  if ($null -eq $state -or $state.active -ne $true) { return $null }
  $arms = @(Get-Content -LiteralPath (Join-Path $OutDir 'admission-checker.jsonl') -Encoding UTF8 | ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } | Where-Object { $null -ne $_ -and $_.event -ceq 'decision' -and $_.phase -ceq 'arm' -and $_.verdict -ceq 'allow' })
  if ($arms.Count -ne 1) { throw 'the source-admission checker has no single admitted arm' }
  $arm = $arms[0]
  if ($null -eq $arm.overlay -or $null -eq $state.overlay -or [string]$arm.capture_id -cne [string]$state.capture_id -or [string]$arm.overlay.hwnd -cne [string]$state.overlay.hwnd -or [string]$arm.overlay.pid -cne [string]$state.overlay.pid) { throw 'the current overlay binding differs from the arm the checker admitted' }
  return New-QaOverlayBinding $state.overlay ([uint32]$script:app.Id) $script:app.StartTime.Ticks $script:app (New-QaOverlayExpect ([uint32]$script:app.Id) $script:qaDisplayBaseline.monitor_bounds)
}
`;
/** The live candidate's one runner delta (above), applied to the reviewed bytes; each site must be found exactly once. */
export function applyAdmissionDelta(runner) {
  for (const [from, to] of runnerAdmissionDelta()) {
    if (runner.split(from).length !== 2 || runner.includes(to)) throw Error('runner changed; source admission delta refused');
    runner = runner.replace(from, () => to);
  }
  return runner;
}
export function revertAdmissionDelta(runner) {
  for (const [from, to] of [...runnerAdmissionDelta()].reverse()) {
    if (runner.split(to).length !== 2) throw Error('source admission delta missing or changed');
    runner = runner.replace(to, () => from);
  }
  if (/LC_SOURCE_ADMISSION|Write-QaAdmissionContext|admissionFile|QaOverlay|qaRunnerOverlayBinding/.test(runner)) throw Error('source admission delta left traces');
  return runner;
}
export function connectorConfig() {
  return JSON.stringify({ format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: CONNECTOR.distribution, user: CONNECTOR.user, cd: CONNECTOR.copy, python: CONNECTOR.python },
    state_dir: CONNECTOR.state_dir, codex_bin: CONNECTOR.codex_bin }) + '\n';
}
function payloadFor(ctx, work) {
  const runner = liveRunner(ctx);
  assertReviewedRunner(runner, work);
  return { 'runner.ps1': runner, 'steps.json': JSON.stringify(liveSteps(ctx), null, 2) + '\n', 'surface.html': readFileSync(join(here, 'surface_live.html')), 'sub-live.json': connectorConfig(),
    'admission-checker.ps1': admissionChecker(runner), 'admission-live.json': admissionConfig(work, ctx) };
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
    script_permission: 'A separate, exact, process-only RemoteSigned permission is required for this runner with real subscription use AND for the checker the product starts per capture (Windows PowerShell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File admission-checker.ps1, from admission-live.json); the AI-disabled approvals do not carry over.',
    source_admission: 'F3 (Lead interface 4f7d9fa; decisions handoff_1698eb17, handoff_e893ca27): the product\'s main process starts admission-checker.ps1 once per capture from admission-live.json (LC_SOURCE_ADMISSION, this process only) and asks it at arm, before and after each frame acquisition and before each send; every decision is a fresh full native admission (the reviewed Assert-QaSurfaceAdmission with exactly four substitutions for the exact-overlay passage, and the normal band read on the admitted window with its process revalidated) against the context the runner froze after the launch (Edge, display, launched product), logged before it is answered. The overlay that main names at arm (UNRELEASED protocol field overlay {pid, hwnd}, to be coordinated with Web) is bound to the launched product for the capture; the same predicate (qa_overlay_predicate.ps1) serves the runner onTop point checks via main\'s source_admission session state. UNVERIFIED: no PowerShell ran it natively; about 3 s per decision is inferred from the accepted diagnostic, not measured. Logical ordering only: an OS change between two native observations remains possible. 52be105 does not start the checker; the wrapper refuses every allocation until a reviewed interlock build is named.',
    proposed_native_invocation: { executable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, arguments: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', ...fileArgs], status: 'NOT_ALLOCATED_NOT_EXECUTED', persistent_policy_changes: false },
    capture_prerequisite_mode: 'REAL_SUBSCRIPTION_NONVOICE_GENERATED_SURFACE',
    provider_attempts: 0, native_script_executed: false, display_account_audio_lease: 'NONE',
    execution_block: 'Prepared only. Interim: production 52be105 predates the Lead-assigned app interlock for F3 (frame admission before automatic retention/submission); the live candidate must be regenerated for that reviewed production commit and stage, never run as 52be105. Lead reviews the exact package, the current prerequisites and the decisions it names, then issues a separate exclusive display/account allocation for qa_run_live_candidate.mjs.',
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
