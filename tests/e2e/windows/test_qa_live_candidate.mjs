// Focused offline checks of the four-action nonvoice live driver: the candidate, its steps, the live surface, the ledger
// and the wrapper's refusals. No product, native, account, model or audio call; run with child processes withheld:
//   node --permission --allow-fs-read=$PWD --allow-fs-read=/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-* \
//     --test tests/e2e/windows/test_qa_live_candidate.mjs
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { ACTIONS, ASSISTANCE, CONNECTOR, POLICY, POLICY_MS, QUESTIONS, REVIEWED_RUNNER, assertReviewedRunner, checkLiveCandidate, connectorConfig, names, prepareLiveCandidate } from './qa_live_candidate.mjs';
import { buildLedger, evidence, fenceVerdict, leaks, parseJsonl, pixelEvidence, transport } from './qa_live_ledger.mjs';
import { worstCaseMs } from './qa_live_candidate.mjs';

const identity = JSON.parse(readFileSync(new URL('../../../docs/verification/qa/p0-13-tts-52be105/stage-identity.json', import.meta.url)));
const base = prepareLiveCandidate();
const steps = JSON.parse(base.payload['steps.json']);
const runner = base.payload['runner.ps1'];
const sha = b => createHash('sha256').update(b).digest('hex');
const idx = pred => steps.findIndex(pred);
const evalOf = s => s.eval ?? s.waitEval ?? s.captureStart ?? '';

// ---- the candidate ----
test('the candidate is offline-only, reproduces from the sources, and its scratch is unused', () => {
  const r = checkLiveCandidate(base.manifest, base.payload, identity);
  assert.equal(r.identity_passed, true); assert.equal(r.scratch_unused, true); assert.equal(r.execution_admitted, false); assert.equal(r.provider_attempts, 0);
  assert.equal(base.manifest.execution_authorized, false); assert.equal(base.manifest.proposed_native_invocation.status, 'NOT_ALLOCATED_NOT_EXECUTED');
  assert.equal(base.manifest.display_account_audio_lease, 'NONE');
  assert.deepEqual(Object.keys(base.payload).sort(), names.slice().sort());
  // A used scratch is reported apart: the payload still reproduces (unlike the diagnostic's check, which then refused).
  assert.equal(checkLiveCandidate(base.manifest, base.payload, identity, { scratchExists: () => true }).scratch_unused, false);
  for (const mutate of [m => { m.execution_authorized = true; }, m => { m.connector = { ...m.connector, codex_bin: '/x' }; }, m => { m.files['steps.json'] = '0'.repeat(64); }, m => { m.policy_ms = { ...m.policy_ms, max_submissions: 5 }; }]) {
    const m = structuredClone(base.manifest); mutate(m);
    assert.throws(() => checkLiveCandidate(m, base.payload, identity));
  }
  assert.throws(() => checkLiveCandidate(base.manifest, { ...base.payload, 'steps.json': base.payload['steps.json'].replace('"live"', '"fake"') }, identity));
  assert.throws(() => checkLiveCandidate(base.manifest, base.payload, { ...identity, tree_sha256: '0'.repeat(64) }));
  assert.equal(base.manifest.native_worst_case_ms, worstCaseMs(steps)); assert.ok(base.manifest.native_worst_case_ms > 300000);
  for (const k of ['input_method', 'expected_fence', 'script_permission', 'talk']) assert.equal(typeof base.manifest[k], 'string', k);
  assert.ok(base.manifest.source_files['qa_run_tts_candidate.mjs'] && base.manifest.source_files['qa_sub_watch.py']);
});
test('the runner is the reviewed r4 runner byte for byte, apart from the one work-folder name', () => {
  assertReviewedRunner(runner, base.manifest.work);
  const r4 = readFileSync(new URL('../../../' + REVIEWED_RUNNER.file, import.meta.url), 'utf8');
  assert.equal(sha(r4), REVIEWED_RUNNER.sha256);
  assert.equal(r4.replace(REVIEWED_RUNNER.folder, base.manifest.work.split('/').at(-1)), runner);
  assert.throws(() => assertReviewedRunner(runner.replace("throw 'owned generated surface window changed'", "throw 'x'"), base.manifest.work), /differs/);
  assert.equal(runner.includes('-LinkDir') || /\[string\]\$LinkDir/.test(runner), true);                         // the shared runner already takes it
});
test('the package pins are the accepted diagnostic\'s (52be105, its 77-file tree, Electron 44.5.1, Edge)', () => {
  const r4 = JSON.parse(readFileSync(new URL('../../../docs/verification/qa/p0-13-tts-52be105/candidate-r4-20261009/candidate.json', import.meta.url)));
  for (const k of ['production_commit', 'release_commit', 'stage', 'stage_tree_sha256', 'electron', 'edge', 'appPort', 'edgePort']) assert.equal(base.manifest[k], r4[k], k);
  assert.deepEqual(base.manifest.app_entry, r4.app_entry);
  assert.deepEqual(base.manifest.edgeArgs.slice(1, -1), r4.edgeArgs.slice(1, -1));
  const args = base.manifest.proposed_native_invocation.arguments;
  assert.deepEqual(args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned']);
  assert.equal(args[args.indexOf('-LinkDir') + 1], base.manifest.work.replace('/mnt/c/', 'C:\\').replaceAll('/', '\\') + '\\link');
});
test('the connector configuration is the trusted real one: the exact private 52be105 copy, the pinned codex binary, the product\'s own state', () => {
  const c = JSON.parse(base.payload['sub-live.json']);
  assert.equal(base.payload['sub-live.json'], connectorConfig());
  assert.deepEqual(c, { format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: 'Ubuntu', user: 'agentsdock', cd: CONNECTOR.copy, python: CONNECTOR.python }, state_dir: null, codex_bin: CONNECTOR.codex_bin });
  assert.match(CONNECTOR.copy, /subscription-source-52be105a148a$/); assert.equal(CONNECTOR.commit, base.manifest.production_commit);
  assert.match(CONNECTOR.codex_bin, /0\.158\.0-x86_64-unknown-linux-musl\/bin\/codex$/);
  assert.equal(/fake|bridge|stand-in/i.test(base.payload['sub-live.json']), false);
});

// ---- the steps ----
test('the steps hold exactly the four released actions, the actual UI Start once, and nothing fake, restarted or signed in', () => {
  const all = JSON.stringify(steps);
  assert.equal(steps.filter(s => s.launchApp).length, 1); assert.equal(steps.find(s => s.launchApp).sub, 'live');
  for (const k of ['link', 'hostPause', 'hostResume', 'plantFile', 'moveAside', 'endHungApp', 'consoleStart', 'seedLinkRecord', 'osClick', 'keys', 'raceStop', 'dragHandle']) assert.equal(steps.some(s => k in s), false, k);
  for (const word of ['subLogin', 'liveStart', 'subModel', 'talkControls', 'interrupt', 'askCancel\').click', 'sub-fake']) assert.equal(all.includes(word), false, word);
  assert.equal(steps.filter(s => 'captureStart' in s).length, 1);                                                  // Start once; never again
  assert.deepEqual(steps.filter(s => evalOf(s).includes("getElementById('start')")).map(s => Object.keys(s)[0]), ['captureStart']);   // #start only in captureStart
  assert.equal(steps.filter(s => evalOf(s).includes("getElementById('subCheck')")).length, 1);                      // Check connection once
  assert.equal(steps.filter(s => Array.isArray(s.stroke)).length, 1);                                                 // one circle
  assert.equal(steps.filter(s => evalOf(s).includes('send.click()')).length, 2);                                      // two typed requests
  assert.equal(steps.filter(s => evalOf(s).includes("getElementById('liveStop')")).length, 1);                       // one Stop the AI
  const start = steps.find(s => 'captureStart' in s).captureStart;
  for (const [id, v] of [['aiRequests', POLICY.requests], ['aiMinutes', POLICY.minutes], ['aiInterval', POLICY.seconds]]) assert.ok(start.includes(`['${id}', ${v}]`), id);
  assert.ok(start.includes('box.checked = true') && start.includes('start.click()'));
  assert.deepEqual(POLICY_MS, { max_submissions: 4, max_session_ms: 60000, min_observation_interval_ms: 60000 });
  assert.equal(ACTIONS.length, 4); assert.equal(ASSISTANCE, 'hint');
});
test('every action is bracketed: assigned only while the session is on with the exact count, and a stop leaves the rest NOT_RUN', () => {
  const g = n => idx(s => s.as === `action${n}`);
  const order = [idx(s => s.as === 'live_policy'), g(1), idx(s => Array.isArray(s.stroke)), g(2), idx(s => s.as === 'surface_change'), idx(s => s.as === 'action3_submit'), g(3), idx(s => s.as === 'action4_submit'), idx(s => s.as === 'action4_stop'), idx(s => s.as === 'action4_after')];
  for (let k = 1; k < order.length; k++) assert.ok(order[k] > order[k - 1] && order[k - 1] >= 0, `order ${k}`);
  for (const n of [1, 2, 3]) {
    const text = steps[g(n)].eval;
    assert.ok(text.includes("l.state !== 'on'") && text.includes(`l.used !== ${n}`) && text.includes('l.out !== 0'), `guard ${n}`);
    assert.ok(text.includes('NOT_RUN') && text.includes('throw Error'));
    assert.notEqual(steps[g(n)].required, false);                                                                     // a failed guard stops the run
  }
  // The next action's trigger comes only after the previous guard, and every trigger is followed by started/ended waits.
  assert.ok(idx(s => Array.isArray(s.stroke)) > g(1) && idx(s => s.as === 'action3_submit') > g(2) && idx(s => s.as === 'action4_submit') > g(3));
  for (const trigger of [idx(s => Array.isArray(s.stroke)), idx(s => s.as === 'action3_submit')]) {
    assert.ok(steps[trigger + 1].waitEval.includes('l.out > 0')); assert.ok(steps[trigger + 2].waitEval.includes('l.out === 0'));
  }
  // An answered action needs a shown answer before its guard; Stop is pressed only once the request is out.
  for (const n of [2, 3]) assert.ok(evalOf(steps[g(n) - 1]).includes('no answer is shown on the card'));
  assert.ok(steps[idx(s => s.as === 'action4_stop') - 1].waitEval.includes('l.out > 0'));
  // Before Start: a selected model without pictures, a reached quota, a pending sign-in stop the run; Talk off is checked.
  const ready = evalOf(steps[idx(s => s.as === 'account_ready')]);
  for (const part of ['m.id === a.model', 'ordinary_usage_allowed === false', 'rate_limit_reached_type', 'spend_control_reached === true', "a.login !== 'none'"]) assert.ok(ready.includes(part), part);
  assert.ok(evalOf(steps[idx(s => s.as === 'overlay_ready')]).includes("getAttribute('aria-pressed') === 'true'"));
  // An answered action must show a NEW answer (an unsent request leaves the earlier one up).
  assert.ok(steps.filter(s => evalOf(s).includes('send.click()')).every(s => evalOf(s).includes('window.__qaAnswerBefore =')));
  assert.equal(steps.filter(s => evalOf(s).includes("a === (window.__qaAnswerBefore ?? '')")).length, 2);
  // The 16-point scene check comes right before every frame QA causes to be sent: Start (the look's), the circle, the
  // follow-up after the change, the fence request. Inside the session it is not preceded by a raise.
  for (const k of [idx(s => 'captureStart' in s), idx(s => Array.isArray(s.stroke)) - 1, idx(s => s.as === 'action3_submit'), idx(s => s.as === 'action4_submit')]) assert.ok(steps[k - 1].onTop, `scene check before step ${k + 1}`);
  const live = steps.slice(idx(s => s.as === 'live_policy'), idx(s => s.as === 'action4_stop'));
  assert.equal(live.filter(s => s.window).length, 0);                                                                  // no raise inside the session
  // The follow-up waits for a NEW overlay frame after the change before anything is sent.
  const fresh = idx(s => s.as === 'surface_changed') + 1;
  assert.ok(steps[fresh].target === 'overlay' && steps[fresh].waitEval.includes('__qaFrameBefore.sha') && steps[fresh].waitEval.includes('__qaFrameBefore.frame'));
  assert.ok(idx(s => s.as === 'frame_before_change') < idx(s => s.as === 'surface_change'));
  // The look wait also ends on a missed look; Stop waits for the out request to settle before the late-answer window.
  assert.ok(steps[idx(s => s.as === 'action1') - 1].waitEval.includes('l.missed !== null'));
  const stopAt = idx(s => s.as === 'action4_stop');
  assert.ok(steps[stopAt + 2].waitEval.includes('l.out === 0') && steps[stopAt + 3].sleep === 5000);
  // Wind-down checks are recorded but do not stop the capture's end.
  for (const s of steps.slice(idx(s => s.as === 'action4_card') + 1, idx(s => s.as === 'stop_pressed'))) assert.equal(s.required, false);
  for (const k of ['closeApp', 'edgeClose']) assert.equal(steps.find(s => k in s).required, false);
});
test('the typed requests carry no card value, and the help level is the product default', () => {
  for (const q of Object.values(QUESTIONS)) assert.equal(/\d/.test(q), false, q);
  for (const s of steps.filter(s => evalOf(s).includes('send.click()'))) {
    assert.ok(evalOf(s).includes(`[value=${ASSISTANCE}]`));
    assert.ok(Object.values(QUESTIONS).some(q => evalOf(s).includes(JSON.stringify(q))));
  }
});
test('the live surface changes its cards in place: new values never shown before, same page, same geometry, same truth format', () => {
  const html = readFileSync(new URL('surface_live.html', import.meta.url), 'utf8'), plain = readFileSync(new URL('surface.html', import.meta.url), 'utf8');
  assert.equal(sha(html), base.manifest.files['surface.html']);
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => noop };
  const window = { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 800, screenX: 0, screenY: 0, devicePixelRatio: 2 };
  const ctx = vm.createContext({ window, screen: { width: 1280, height: 800 }, document: { getElementById: () => canvas, documentElement: { innerText: '' }, title: 'QA test surface' },
    location: { search: '', hash: '' }, crypto: webcrypto, Uint32Array, Math, Date, JSON, Set, Object, String, addEventListener: () => {} });
  Object.assign(ctx, window);
  vm.runInContext(script, ctx);
  const before = JSON.parse(ctx.window.__qaSurfaceTruth());
  assert.equal(ctx.window.__qaSurfaceChange(), 1);
  const after = JSON.parse(ctx.window.__qaSurfaceTruth());
  assert.equal(before.format, 'qa-subscription-surface/2'); assert.equal(after.format, before.format);
  assert.equal(after.cards.length, 12); assert.equal(after.changes, 1);
  assert.deepEqual(after.cards.map(c => c.rect_dip), before.cards.map(c => c.rect_dip));
  const old = new Set(before.cards.map(c => c.number));
  assert.ok(after.cards.every(c => !old.has(c.number) && c.number >= 1000 && c.number <= 9999));
  assert.equal(new Set(after.cards.map(c => c.number)).size, 12);
  assert.equal(after.fits && after.full_screen, true);
  // Fifty more changes: never a value shown before, never a value the request metadata holds.
  const seen = new Set([...old, ...after.cards.map(c => c.number)]), reserved = [1280, 1504, 1600, 2560, new Date().getUTCFullYear(), new Date().getUTCFullYear() + 1];
  for (let k = 0; k < 50; k++) { ctx.window.__qaSurfaceChange(); for (const c of JSON.parse(ctx.window.__qaSurfaceTruth()).cards) { assert.ok(!seen.has(c.number) && !reserved.includes(c.number)); seen.add(c.number); } }
  // The only differences from the accepted surface: the in-place generation, the change hook, its comment, the count.
  assert.ok(html.includes('window.__qaSurfaceChange = ') && !plain.includes('__qaSurfaceChange'));
  for (const kept of ['const GRID = { x: 40, y: 90, cols: 4, rows: 3, w: 190, h: 150, gap: 20 };', "const SHAPES = ['square', 'triangle', 'star', 'heart', 'diamond'];", 'function draw() {', 'window.__qaSurfaceTruth = () => {'])
    assert.ok(html.includes(kept) && plain.includes(kept), kept);
});

// ---- the ledger ----
const stepIndex = as => idx(s => s.as === as) + 1, strokeAt = idx(s => Array.isArray(s.stroke)) + 1;
const ranTo = (n, values = {}) => ({ steps: steps.slice(0, n).map((_, k) => ({ i: k + 1, ok: true })), values });
const look = (rid, sha256) => [{ kind: 'started', session_id: 'live-1' }, { kind: 'look', request_id: rid, image: { file: `frames/${sha256}.png`, sha256 } }, { kind: 'looked', request_id: rid, text: 'Cards 4821 and 5532 are visible.' }];
// App records use the product's vocabulary (submitted / not_submitted / unknown); receipts use the connector's.
const entry = (rid, trigger, extra = {}) => ({ request_id: rid, trigger, question: trigger === 'focus' ? null : QUESTIONS.followup, assistance: 'hint', asked_as: 'silent',
  frame: { image: { sha256: 'f' + rid.length }, focus: 'on_this_frame', captured_at: '2026-10-09T06:00:20.000Z' }, submitted_at: `2026-10-09T06:00:${10 + Number(rid.slice(-1))}.000Z`,
  submission: 'submitted', outcome: { status: 'answered' }, shown: true, presentation: 'shown', ...extra });
const receipt = (rid, sha256, extra = {}) => ({ request_id: rid, input_types: ['text', 'image'], image_sha256: sha256, submission: 'acknowledged', outcome: 'completed', produced_item_types: ['userMessage', 'reasoning', 'agentMessage'], codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true, ...extra });
const values = { action1: JSON.stringify({ used: 1, unwritten: 0 }), action2: JSON.stringify({ used: 2 }), action3: JSON.stringify({ used: 3 }), action4_after: JSON.stringify({ used: 3, unwritten: 0 }),
  action3_card: JSON.stringify({ answer: 'A3' }), action4_stop: JSON.stringify({ out_at_stop: 1, used_at_stop: 3 }), action4_card: JSON.stringify({ answer_hidden: true, answer: '' }) };
function happy() {
  const liveLines = [...look('live-1.look.1', 'a1'), { kind: 'ended', reason: 'stopped by you', used: 3 }, { kind: 'settled', request_id: 'sel.3', submission: 'not_submitted', used: 3 }];
  const asks = [{ requests: [entry('sel.1', 'focus'), entry('sel.2', 'text_followup'), entry('sel.3', 'text_followup', { question: QUESTIONS.fence, outcome: { status: 'cancelled', uncertain: false }, shown: false, presentation: undefined, submission: 'not_submitted' })] }];
  const receipts = { 'live-1.look.1': receipt('live-1.look.1', 'a1'), 'sel.1': receipt('sel.1', 'f5'), 'sel.2': receipt('sel.2', 'f5'), 'sel.3': receipt('sel.3', 'f5', { submission: 'not_submitted', outcome: 'not_submitted' }) };
  return { liveLines, asks, receipts, results: ranTo(steps.length, { ...values }) };
}
const ledgerOf = h => buildLedger({ steps, ...h, codexSha256: CONNECTOR.codex_sha256 });
test('ledger: all four actions counted once each, the whole picture at the provider boundary for each answered one, the Stop fenced', () => {
  const h = happy(), l = ledgerOf(h);
  assert.equal(l.attempts_used, 4); assert.equal(l.ceiling_ok, true); assert.equal(l.restarted, false); assert.equal(l.retried, false); assert.equal(l.all_silent, true);
  assert.deepEqual(l.slots.map(s => s.counted), [true, true, true, true]); assert.equal(l.app_counted, 3); assert.equal(l.submitted_slots, 3);
  assert.ok(l.slots.slice(0, 3).every(s => s.transport.verdict === 'whole picture at the provider boundary' && s.transport.codex_sha256_matches === true));
  assert.equal(l.slots[3].transport.verdict, 'inputs prepared; not submitted (not_submitted)');                       // a receipt alone is not the picture at the provider
  assert.equal(fenceVerdict(l, h.liveLines, h.results.values).verdict, 'fenced_before_submission');
  const inFlight = structuredClone(h); inFlight.asks[0].requests[2].submission = 'submitted';
  assert.equal(fenceVerdict(ledgerOf(inFlight), inFlight.liveLines, inFlight.results.values).verdict, 'fenced_in_flight');
});
test('ledger: unknown and proven not_submitted outcomes count; failed triggers count but are named; a session that never started counts nothing', () => {
  const h = happy();
  h.asks[0].requests[0] = entry('sel.1', 'focus', { submission: 'not_submitted', outcome: { status: 'refused', code: 'busy', submission: 'not_submitted' }, shown: false });
  h.asks[0].requests[1] = entry('sel.2', 'text_followup', { submission: 'unknown', outcome: { status: 'uncertain' }, shown: false });
  const l = ledgerOf(h);
  assert.equal(l.attempts_used, 4);
  assert.deepEqual([l.slots[1].state, l.slots[1].submission, l.slots[1].counted], ['refused', 'not_submitted', true]);
  assert.deepEqual([l.slots[2].state, l.slots[2].submission, l.slots[2].counted], ['uncertain', 'unknown', true]);
  // A trigger that ran with no record of a request still uses its slot; one that failed before acting is named so.
  const none = buildLedger({ steps, results: ranTo(stepIndex('action3_submit')), liveLines: look('live-1.look.1', 'a1'), asks: [{ requests: [entry('sel.1', 'focus')] }], receipts: {} });
  assert.deepEqual(none.slots.map(s => s.state), ['looked', 'answered', 'assigned_no_request_recorded', 'NOT_RUN']); assert.equal(none.attempts_used, 3);
  const failed = ranTo(stepIndex('action3_submit')); failed.steps.at(-1).ok = false; failed.steps.at(-1).error = 'Send is unavailable';
  const f = buildLedger({ steps, results: failed, liveLines: look('live-1.look.1', 'a1'), asks: [{ requests: [entry('sel.1', 'focus')] }], receipts: {} });
  assert.deepEqual([f.slots[2].state, f.slots[2].counted, f.slots[2].trigger_error], ['trigger_failed_before_action', true, 'Send is unavailable']);
  const notStarted = ranTo(stepIndex('live_policy')); notStarted.steps.at(-1).ok = false;
  const ns = buildLedger({ steps, results: notStarted, liveLines: [{ kind: 'not_started', code: 'unauthenticated' }], asks: [], receipts: {} });
  assert.deepEqual(ns.slots.map(s => s.state), ['NOT_RUN_session_not_started', 'NOT_RUN', 'NOT_RUN', 'NOT_RUN']); assert.equal(ns.attempts_used, 0);
});
test('ledger: a session that ended before an action leaves it and every later one NOT_RUN; extra requests, restarts and a disagreeing app count are flagged', () => {
  const h = happy();
  const cut = buildLedger({ steps, results: ranTo(stepIndex('action2') - 1), liveLines: look('live-1.look.1', 'a1'), asks: [{ requests: [entry('sel.1', 'focus')] }], receipts: h.receipts });
  assert.deepEqual(cut.slots.map(s => s.state), ['looked', 'answered', 'NOT_RUN', 'NOT_RUN']); assert.equal(cut.attempts_used, 2);
  assert.equal(fenceVerdict(cut, look('live-1.look.1', 'a1'), {}).verdict, 'NOT_RUN');
  const early = buildLedger({ steps, results: ranTo(strokeAt - 1), liveLines: look('live-1.look.1', 'a1'), asks: [], receipts: {} });
  assert.deepEqual(early.slots.map(s => s.state), ['looked', 'NOT_RUN', 'NOT_RUN', 'NOT_RUN']); assert.equal(early.attempts_used, 1);
  const refusedThenStarted = ledgerOf({ ...h, liveLines: [{ kind: 'not_started', code: 'busy' }, ...h.liveLines] });
  assert.equal(refusedThenStarted.restarted, true); assert.equal(refusedThenStarted.start_attempts, 2);               // a second Start after a refused one
  const extra = ledgerOf({ ...h, liveLines: [...h.liveLines, { kind: 'started' }, { kind: 'look', request_id: 'live-2.look.1', image: { sha256: 'b' } }] });
  assert.equal(extra.attempts_used, 5); assert.equal(extra.ceiling_ok, false); assert.equal(extra.restarted, true); assert.equal(extra.retried, true);
  const extraTyped = structuredClone(h); extraTyped.asks[0].requests.push(entry('sel.4', 'text_followup'));
  assert.deepEqual([ledgerOf(extraTyped).extra_requests, ledgerOf(extraTyped).ceiling_ok], [['sel.4'], false]);
  const extraFocus = structuredClone(h); extraFocus.asks.push({ requests: [entry('sel.9', 'focus')] });
  assert.deepEqual(ledgerOf(extraFocus).extra_requests, ['sel.9']);
  // The app counted more than the ledger's submitted slots (an unrecorded look), or a live line was not written.
  const more = { ...h, results: ranTo(steps.length, { ...values, action4_after: JSON.stringify({ used: 4, unwritten: 0 }) }) };
  assert.equal(ledgerOf(more).ceiling_ok, false);
  const unwritten = { ...h, results: ranTo(steps.length, { ...values, action4_after: JSON.stringify({ used: 3, unwritten: 1 }) }) };
  assert.equal(ledgerOf(unwritten).ceiling_ok, false);
  const spoken = structuredClone(h); spoken.asks[0].requests[1].asked_as = 'spoken';
  assert.equal(ledgerOf(spoken).all_silent, false);
});
test('fence: needs Stop by the user with the request out and settling after it, nothing shown or sent later; otherwise unknown or not fenced', () => {
  const h = happy(), v = h.results.values;
  const verdict = (x, vals = v) => fenceVerdict(ledgerOf(x), x.liveLines, vals).verdict;
  const shown = structuredClone(h); shown.asks[0].requests[2].shown = true;
  assert.equal(verdict(shown), 'not_fenced');
  assert.equal(verdict(h, { ...v, action4_card: JSON.stringify({ answer_hidden: false, answer: 'a late answer' }) }), 'not_fenced');    // the actual card
  const late = { ...h, liveLines: [...h.liveLines, { kind: 'looked', request_id: 'live-1.look.2', text: 'x' }] };
  assert.equal(verdict(late), 'not_fenced');
  const another = structuredClone(h); another.asks[0].requests.push(entry('sel.4', 'text_followup'));
  assert.equal(verdict(another), 'not_fenced');
  assert.equal(verdict(h, { ...v, action4_stop: JSON.stringify({ out_at_stop: 0 }) }), 'unknown');                     // nothing was out at Stop
  const noSettle = { ...h, liveLines: h.liveLines.filter(l => l.kind !== 'settled') };
  assert.equal(verdict(noSettle), 'unknown');
  const expired = { ...h, liveLines: h.liveLines.map(x => x.kind === 'ended' ? { ...x, reason: 'this session\'s time is over' } : x) };
  assert.equal(verdict(expired), 'unknown');
  const unrecorded = structuredClone(h); unrecorded.asks[0].requests[2].outcome = null;
  assert.equal(verdict(unrecorded), 'unknown');
  const answered = structuredClone(h); answered.asks[0].requests[2].outcome = { status: 'answered' }; answered.asks[0].requests[2].presentation = 'unconfirmed';
  assert.equal(verdict(answered), 'unknown');
  const unknown = structuredClone(h); unknown.asks[0].requests[2].submission = 'unknown';
  assert.equal(verdict(unknown), 'fenced_submission_unknown');
});
test('transport: no receipt, another image, no text or image input, or a request not submitted is never the picture at the provider; tools are flagged', () => {
  assert.equal(transport(null, 'a').verdict, 'official image input: not shown (no receipt)');
  assert.equal(transport(receipt('r', 'b'), 'a').verdict, 'official image input: not shown');
  assert.equal(transport({ ...receipt('r', 'a'), input_types: ['text'] }, 'a').verdict, 'official image input: not shown');
  assert.equal(transport({ ...receipt('r', 'a'), input_types: ['image'] }, 'a').verdict, 'official image input: not shown');
  assert.equal(transport({ ...receipt('r', 'a'), submission: 'not_submitted' }, 'a').verdict, 'inputs prepared; not submitted (not_submitted)');
  assert.equal(transport({ ...receipt('r', 'a'), submission: 'uncertain' }, 'a').verdict, 'inputs prepared; not submitted (uncertain)');
  assert.equal(transport(receipt('r', 'a'), 'a').verdict, 'whole picture at the provider boundary');
  assert.deepEqual(transport({ ...receipt('r', 'a'), produced_item_types: ['userMessage', 'commandExecution'] }, 'a').non_plain_items, ['commandExecution']);
  assert.equal(transport({ ...receipt('r', 'a'), codex_sha256: 'x' }, 'a', { codexSha256: CONNECTOR.codex_sha256 }).codex_sha256_matches, false);
});
test('pixel rules: only values new after the change and absent from earlier AI text prove fresh pixels; formatted values are read; a question with a value is a leak', () => {
  const before = { cards: [1111, 2222, 3333].map(number => ({ number })) }, after = { cards: [4444, 5555, 6666, 7070].map(number => ({ number })), generated_at: '2026-10-09T06:00:15.000Z' };
  const e = pixelEvidence('Top row: 4444, 5555, and earlier 2222; maybe 7777.', { now: [4444, 5555, 6666], before: [1111, 2222, 3333], earlierText: ['I saw 5555 before?'] });
  assert.deepEqual(e.fresh_only_in_new_pixels, [4444]); assert.deepEqual(e.from_earlier_screen, [2222]); assert.deepEqual(e.not_on_any_screen, [7777]); assert.deepEqual(e.also_in_earlier_ai_text, [5555]);
  assert.equal(e.matcher, 'fresh_pixel_values_named'); assert.equal(e.hedged, true);
  assert.deepEqual(pixelEvidence('It reads 4,444 then ５５５５ and 6 666.', { now: [4444, 5555, 6666] }).current, [4444, 5555, 6666]);
  assert.deepEqual(pixelEvidence('4444 5555', { now: [4444, 5555] }).named, [4444, 5555]);                           // two values, never one
  assert.equal(pixelEvidence('no numbers here', { now: [4444] }).matcher, 'no_current_value_named');
  assert.deepEqual(leaks(['Read 4444 please', QUESTIONS.followup], [before, after]), [{ text: 0, value: 4444 }]);
  assert.deepEqual(leaks(Object.values(QUESTIONS), [before, after]), []);
  const h = happy(), l = ledgerOf(h);
  const ev = evidence({ ledger: l, liveLines: h.liveLines, cards: { action2: { answer: 'Look at 4821.' }, action3: { answer: '4444 5555 6666 7070' } }, truthBefore: { cards: [4821, 5532].map(number => ({ number })) }, truthAfter: after });
  assert.deepEqual(ev.action1.current, [4821, 5532]); assert.equal(ev.action2.matcher, 'current_values_named_not_pixel_only');
  assert.deepEqual(ev.action3.fresh_only_in_new_pixels, [4444, 5555, 6666, 7070]); assert.deepEqual(ev.action3.top_row_named, [4444, 5555, 6666, 7070]);
  assert.equal(ev.action3.frame_after_change, true); assert.deepEqual(ev.leaks_in_questions, []); assert.match(ev.acceptance, /^NOT_JUDGED/);
  // Action 3 naming an old value or one an earlier AI text already gave is never fresh-pixel proof.
  const old = evidence({ ledger: l, liveLines: h.liveLines, cards: { action2: { answer: 'Maybe 4444.' }, action3: { answer: '4821, 4444 and 5555' } }, truthBefore: { cards: [4821, 5532].map(number => ({ number })) }, truthAfter: after });
  assert.deepEqual(old.action3.from_earlier_screen, [4821]); assert.deepEqual(old.action3.also_in_earlier_ai_text, [4444]); assert.deepEqual(old.action3.fresh_only_in_new_pixels, [5555]);
  const stale = evidence({ ledger: l, liveLines: h.liveLines, cards: {}, truthBefore: null, truthAfter: { ...after, generated_at: '2026-10-09T06:00:30.000Z' } });
  assert.equal(stale.action3.frame_after_change, false);
  assert.deepEqual(parseJsonl('{"kind":"a"}\n\nnot json\nnull\n[1]\n'), [{ kind: 'a' }, { kind: 'unreadable_line' }, { kind: 'unreadable_line' }, { kind: 'unreadable_line' }]);
});

// ---- the wrapper: no accidental live execution ----
const wrapper = await import('./qa_run_live_candidate.mjs');
const spies = () => { const calls = []; return { calls, fs: { existsSync: p => { calls.push(['existsSync', p]); return false; } }, execFileSync: (...a) => { calls.push(['execFileSync', a[0]]); throw Error('no process in this test'); },
  spawnSync: (...a) => { calls.push(['spawnSync', a[0]]); throw Error('no process in this test'); }, spawn: (...a) => { calls.push(['spawn', a[0]]); throw Error('no process in this test'); } }; };
test('wrapper: nothing runs without --execute, a new evidence folder and an independently supplied allocation hash', async () => {
  const s = spies();
  await assert.rejects(wrapper.runLiveCandidate({}, s), /explicit --execute/);
  await assert.rejects(wrapper.runLiveCandidate({ execute: true, out: '/home/elsewhere/x', allocation: '/tmp/a.json', allocationSha256: 'a'.repeat(64) }, s), /new QA evidence folder/);
  await assert.rejects(wrapper.runLiveCandidate({ execute: true, out: '/tmp/qa-live-never-made', allocation: '/home/x/a.json', allocationSha256: 'a'.repeat(64) }, s), /allocation file\/hash/);
  await assert.rejects(wrapper.runLiveCandidate({ execute: true, out: '/tmp/qa-live-never-made', allocation: '/tmp/a.json', allocationSha256: 'short' }, s), /allocation file\/hash/);
  assert.deepEqual(s.calls.filter(c => c[0] !== 'existsSync'), []);                                                   // no process of any kind
  assert.deepEqual(s.calls.map(c => c[1]), ['/tmp/qa-live-never-made', '/tmp/qa-live-never-made']);                   // only the new folder was looked at
});
const goodAllocation = () => ({ schema: 'qa-live-nonvoice-allocation/1', state: 'active', lead_reviewed: true, mode: 'REAL_SUBSCRIPTION_NONVOICE_GENERATED_SURFACE', exclusive_display: true,
  account_access: 'official_managed_lock_through_the_product', audio_access: false, microphone_access: false, voice: false, max_native_attempts: 1, retry: false, restart: false,
  policy: { ...POLICY_MS }, max_real_actions: 4, real_actions_already_used: 0, cleanup_only_after_expiry: true, native_bound_ms: 600000, allocation_id: 'lc-live-nonvoice-test-01',
  approval_scope: 'real_subscription_nonvoice_four_actions', command_approval_ref: 'lead-review:test', script_permission_ref: 'human-script-permission:test', wrapper_sha256: 'w'.repeat(64), candidate_sha256: wrapper.candidateHash, payload_sha256: { ...wrapper.pins }, connector: { ...CONNECTOR },
  native_invocation: { executable: base.manifest.proposed_native_invocation.executable, arguments: base.manifest.proposed_native_invocation.arguments },
  launch_identity: { source: base.manifest.production_commit, stage: base.manifest.stage, tree: base.manifest.stage_tree_sha256, work: base.manifest.work, electron: base.manifest.electron, edge: base.manifest.edge, appPort: base.manifest.appPort, edgePort: base.manifest.edgePort },
  valid_from_utc: '2026-10-09T06:00:00Z', valid_until_utc: '2026-10-09T06:30:00Z' });
test('wrapper: only an exact, active live allocation bound to the four-action bounds, no voice, no retry or restart, is accepted', () => {
  const at = Date.parse('2026-10-09T06:10:00Z');
  assert.equal(wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'w'.repeat(64), at), Date.parse('2026-10-09T06:30:00Z'));
  for (const [k, v] of [['schema', 'qa-tts-display-allocation/1'], ['mode', 'AI_DISABLED_GENERATED_SURFACE_ONLY'], ['account_access', true], ['voice', true], ['microphone_access', true],
    ['retry', true], ['restart', true], ['max_native_attempts', 2], ['max_real_actions', 5], ['real_actions_already_used', 1], ['native_bound_ms', 1200000], ['native_bound_ms', 300000],
    ['exclusive_display', false], ['audio_access', true], ['cleanup_only_after_expiry', false], ['payload_sha256', { ...wrapper.pins, 'steps.json': '0'.repeat(64) }],
    ['native_invocation', { executable: 'powershell.exe', arguments: [] }], ['approval_scope', 'ai_disabled_display_diagnostic'], ['command_approval_ref', 'short'],
    ['command_approval_ref', 'human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44'], ['script_permission_ref', 'approved-two-gates-20261002:571427dcdc434c0f820236892925aedf'],
    ['script_permission_ref', undefined],
    ['policy', { ...POLICY_MS, max_submissions: 12 }], ['connector', { ...CONNECTOR, state_dir: '/tmp/x' }], ['connector', { ...CONNECTOR, codex_bin: '/home/agentsdock/.local/bin/codex' }],
    ['candidate_sha256', '0'.repeat(64)], ['lead_reviewed', false], ['state', 'expired']]) {
    assert.throws(() => wrapper.validateLiveAllocation({ ...goodAllocation(), [k]: v }, base.manifest, 'w'.repeat(64), at), Error, k);
  }
  assert.throws(() => wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'x'.repeat(64), at));                       // another wrapper
  assert.throws(() => wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'w'.repeat(64), Date.parse('2026-10-09T06:31:00Z')), /not currently active/);
  const moved = goodAllocation(); moved.launch_identity.work = '/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-' + '0'.repeat(32);
  assert.throws(() => wrapper.validateLiveAllocation(moved, base.manifest, 'w'.repeat(64), at));
});
test('wrapper: the connector side refuses a missing or inexact copy, anything running in it, or another codex binary, before any Windows call', () => {
  const codex = Buffer.from('not codex');
  const io = (over = {}) => ({ existsSync: p => p === CONNECTOR.copy, readdirSync: () => ['1', '2', 'self'], readlinkSync: p => (p === '/proc/2/cwd' ? '/home/agentsdock' : '/'), readFileSync: () => codex, ...over });
  const ok = { compareCopy: () => ({ equal: true, files: 280 }), askPathCheck: () => ({ ok: true }), liveImportCheck: () => ({ ok: true }) };
  assert.throws(() => wrapper.connectorAdmission(io({ existsSync: () => false }), ok), /copy is missing/);
  assert.throws(() => wrapper.connectorAdmission(io(), { ...ok, compareCopy: () => ({ equal: false }) }), /not exactly 52be105/);
  assert.throws(() => wrapper.connectorAdmission(io({ readlinkSync: () => CONNECTOR.copy + '/services' }), ok), /already runs/);
  assert.throws(() => wrapper.connectorAdmission(io(), { ...ok, liveImportCheck: () => ({ ok: false }) }), /cannot prepare/);
  assert.throws(() => wrapper.connectorAdmission(io(), { ...ok, askPathCheck: () => ({ ok: false }) }), /cannot prepare/);
  assert.throws(() => wrapper.connectorAdmission(io(), ok), /codex binary digest/);
  assert.deepEqual(wrapper.processesIn(CONNECTOR.copy, io({ readlinkSync: p => (p === '/proc/1/cwd' ? CONNECTOR.copy : '/') })), [1]);
});

test('wrapper: the mechanical result needs every term, the connector and its children gone, and keeps acceptance NOT_JUDGED', () => {
  const h = happy(), ledger = ledgerOf(h);
  const report = { launcher: { status: 0 }, aborted: null, steps_ok: true, owned_launch_cleanup_confirmed: true, connector_left_running: [], connector_watch: { state: 'released' },
    ledger, fence: fenceVerdict(ledger, h.liveLines, h.results.values), evidence: { leaks_in_questions: [] } };
  const ok = wrapper.judgeMechanics(report);
  assert.equal(ok.mechanics_passed, true); assert.match(ok.acceptance, /^NOT_JUDGED/);
  for (const [k, v] of [['launcher', { status: 1 }], ['aborted', 'x'], ['steps_ok', false], ['collect_failed', 'x'], ['owned_launch_cleanup_confirmed', false], ['connector_left_running', [123]],
    ['connector_watch', { state: 'left_running' }], ['connector_watch', { state: 'unknown' }], ['fence', { verdict: 'unknown' }], ['evidence', { leaks_in_questions: [{ value: 4444 }] }], ['evidence', undefined]]) {
    assert.equal(wrapper.judgeMechanics({ ...report, [k]: v }).mechanics_passed, false, k);
  }
  const notAtProvider = structuredClone(ledger); notAtProvider.slots[1].transport.verdict = 'inputs prepared; not submitted (not_submitted)';
  assert.equal(wrapper.judgeMechanics({ ...report, ledger: notAtProvider }).mechanics_passed, false);
  const tool = structuredClone(ledger); tool.slots[2].transport.non_plain_items = ['webSearch'];
  assert.equal(wrapper.judgeMechanics({ ...report, ledger: tool }).mechanics_passed, false);
  for (const k of ['ceiling_ok', 'all_silent']) { const x = structuredClone(ledger); x[k] = false; assert.equal(wrapper.judgeMechanics({ ...report, ledger: x }).mechanics_passed, false, k); }
  const restarted = structuredClone(ledger); restarted.restarted = true; assert.equal(wrapper.judgeMechanics({ ...report, ledger: restarted }).mechanics_passed, false);
  const cut = structuredClone(ledger); cut.slots[3] = { slot: 4, state: 'NOT_RUN', counted: false }; assert.equal(wrapper.judgeMechanics({ ...report, ledger: cut }).mechanics_passed, false);
});
test('wrapper: the watch summary sees the connector and every descendant; a missing end or log is unknown, never released', () => {
  const io = text => ({ readFileSync: () => text });
  assert.deepEqual(wrapper.watchSummary(io(''), 'w', false), { state: 'not_started' });
  const log = (...e) => e.map(x => JSON.stringify(x)).join('\n');
  assert.equal(wrapper.watchSummary(io(log({ event: 'watch_start' }, { event: 'appear', pid: 5, role: 'in_root' }, { event: 'appear', pid: 6, role: 'descendant' }, { event: 'exit', pid: 5 }, { event: 'exit', pid: 6 }, { event: 'watch_end', remaining: [] })), 'w', true).state, 'released');
  assert.deepEqual(wrapper.watchSummary(io(log({ event: 'appear', pid: 6, role: 'descendant' }, { event: 'watch_end', remaining: [6] })), 'w', true), { state: 'left_running', appeared: 1, remaining: [6] });
  assert.equal(wrapper.watchSummary(io(log({ event: 'appear', pid: 6 })), 'w', true).state, 'unknown');
  assert.equal(wrapper.watchSummary({ readFileSync: () => { throw Error('none'); } }, 'w', true).state, 'unknown');
});
test('wrapper: with an exact allocation it still refuses at the connector checks before any Windows call, any folder or any process', async () => {
  const realFs = await import('node:fs');
  const saved = JSON.parse(realFs.readFileSync(new URL('../../../docs/verification/qa/p0-13-live-52be105/candidate-nonvoice-01/candidate.json', import.meta.url)));
  const wrapperHash = sha(realFs.readFileSync(new URL('qa_run_live_candidate.mjs', import.meta.url)));
  const record = { ...goodAllocation(), wrapper_sha256: wrapperHash, native_bound_ms: saved.native_worst_case_ms,
    native_invocation: { executable: saved.proposed_native_invocation.executable, arguments: saved.proposed_native_invocation.arguments },
    launch_identity: { source: saved.production_commit, stage: saved.stage, tree: saved.stage_tree_sha256, work: saved.work, electron: saved.electron, edge: saved.edge, appPort: saved.appPort, edgePort: saved.edgePort } };
  const allocationPath = '/tmp/qa-live-test-allocation.json', bytes = Buffer.from(JSON.stringify(record));
  for (const [checks, codex, why] of [[{ compareCopy: () => ({ equal: false }) }, null, /not exactly 52be105/], [{ compareCopy: () => ({ equal: true, files: 280 }), askPathCheck: () => ({ ok: true }), liveImportCheck: () => ({ ok: true }) }, Buffer.from('not codex'), /codex binary digest/]]) {
    const calls = [];
    const fs = { ...realFs, existsSync: p => { calls.push(['exists', p]); return p === CONNECTOR.copy || (!p.startsWith('/tmp/') && !p.startsWith('/mnt/c/') && realFs.existsSync(p)); },
      lstatSync: p => (p === allocationPath ? { isFile: () => true, isSymbolicLink: () => false } : realFs.lstatSync(p)),
      readFileSync: (p, o) => (p === allocationPath ? bytes : p === CONNECTOR.codex_bin ? codex : realFs.readFileSync(p, o)),
      readdirSync: p => (p === '/proc' ? [] : realFs.readdirSync(p)), readlinkSync: () => '/',
      mkdirSync: p => { calls.push(['mkdir', p]); }, writeFileSync: p => { calls.push(['write', p]); } };
    const exec = (file, args) => { calls.push(['exec', file]); if (file === 'python3') return JSON.stringify(identity); throw Error('no Windows in this test'); };
    await assert.rejects(wrapper.runLiveCandidate({ execute: true, out: '/tmp/qa-live-test-out', allocation: allocationPath, allocationSha256: sha(bytes) },
      { fs, execFileSync: exec, spawnSync: () => { calls.push(['spawnSync']); throw Error('no'); }, spawn: () => { calls.push(['spawn']); throw Error('no'); }, now: () => Date.parse('2026-10-09T06:10:00Z'), checks }), why);
    assert.deepEqual(calls.filter(c => c[0] === 'exec').map(c => c[1]), ['python3']);                                  // the Linux stage check only
    assert.deepEqual(calls.filter(c => ['mkdir', 'write', 'spawn', 'spawnSync'].includes(c[0])), []);
  }
});
