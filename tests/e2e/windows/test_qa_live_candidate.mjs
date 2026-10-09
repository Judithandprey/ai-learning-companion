// Focused offline checks of the four-action nonvoice live driver: the candidate, its steps, the live surface, the ledger
// and the wrapper's refusals. No product, native, account, model or audio call; run with child processes withheld:
//   node --permission --allow-fs-read=$PWD --allow-fs-read=/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-* \
//     --test tests/e2e/windows/test_qa_live_candidate.mjs
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { constants as fsConstants, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Namespace imports: run against an older source (the failures-before check), a missing export fails only its own tests.
import * as candidateModule from './qa_live_candidate.mjs';
import * as ledgerModule from './qa_live_ledger.mjs';

const { ACTIONS, ADMISSION_TIMING, ASSISTANCE, CONNECTOR, POLICY, POLICY_MS, QUESTIONS, REVIEWED_RUNNER, admissionChecker, applyAdmissionDelta, assertReviewedRunner, checkLiveCandidate,
  checkerDefinitions, connectorConfig, linkNames, names, prepareLiveCandidate, revertAdmissionDelta, worstCaseMs, CHECKER_ADMISSION_SUBSTITUTIONS, checkerAdmission, overlayFixtureCheck, overlayPredicate, OVERLAY_PURE } = candidateModule;
const { buildLedger, evidence, fenceVerdict, leaks, parseJsonl, pixelEvidence, sourceAdmission, transport } = ledgerModule;

const identity = JSON.parse(readFileSync(new URL('../../../docs/verification/qa/p0-13-live-0ff325b/stage-identity.json', import.meta.url)));
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
  assert.equal(base.manifest.native_bound_ms, 600000); assert.ok(base.manifest.native_worst_case_ms <= base.manifest.native_bound_ms);   // Lead D6: one fixed bound
  for (const k of ['input_method', 'expected_fence', 'script_permission', 'talk']) assert.equal(typeof base.manifest[k], 'string', k);
  assert.ok(base.manifest.source_files['qa_run_tts_candidate.mjs'] && base.manifest.source_files['qa_sub_watch.py']);
});
test('the runner is the reviewed r4 runner byte for byte, apart from the one work-folder name and the source-admission delta', () => {
  assertReviewedRunner(runner, base.manifest.work);
  const r4 = readFileSync(new URL('../../../' + REVIEWED_RUNNER.file, import.meta.url), 'utf8');
  assert.equal(sha(r4), REVIEWED_RUNNER.sha256);
  assert.equal(r4.replace(REVIEWED_RUNNER.folder, base.manifest.work.split('/').at(-1)), revertAdmissionDelta(runner));
  assert.equal(applyAdmissionDelta(revertAdmissionDelta(runner)), runner);
  assert.throws(() => assertReviewedRunner(revertAdmissionDelta(runner), base.manifest.work), /delta missing/);
  assert.throws(() => assertReviewedRunner(runner.replace("throw 'owned generated surface window changed'", "throw 'x'"), base.manifest.work), /differs/);
  assert.equal(runner.includes('-LinkDir') || /\[string\]\$LinkDir/.test(runner), true);                         // the shared runner already takes it
});
test('the package pins are the Lead\'s staged 0ff325b build (81 files, its tree and entry; native helper, Electron 44.5.1 and Edge as in the accepted diagnostic)', () => {
  const r4 = JSON.parse(readFileSync(new URL('../../../docs/verification/qa/p0-13-tts-52be105/candidate-r4-20261009/candidate.json', import.meta.url)));
  // The Lead's stage manifest, byte for byte as committed at 194986d (its SHA-256 is recorded with the evidence).
  const staged = JSON.parse(readFileSync(new URL('../../../docs/verification/qa/p0-13-live-0ff325b/stage-0ff325b.json', import.meta.url), 'utf8'));
  assert.deepEqual([base.manifest.production_commit, base.manifest.release_commit, base.manifest.stage_tree_sha256, base.manifest.stage_payload_files], [staged.source_commit, '194986dea3e120a3b8806a9e7bb2c06bfefb5cf7', staged.tree_sha256, staged.file_count]);
  assert.equal(base.manifest.stage.split('/').at(-1), staged.name); assert.equal(base.manifest.app_entry.main_sha256, staged.files[staged.entrypoint]);
  assert.equal(base.manifest.app_entry.native_helper_sha256, staged.files['dist/apps/windows/native/NativeSpeech.exe']); assert.equal(base.manifest.app_entry.electron_sha256, staged.runtime_executable_sha256);
  for (const k of ['electron', 'edge', 'appPort', 'edgePort']) assert.equal(base.manifest[k], r4[k], k);
  assert.deepEqual([base.manifest.app_entry.native_helper_sha256, base.manifest.app_entry.electron_sha256, base.manifest.app_entry.package_main], [r4.app_entry.native_helper_sha256, r4.app_entry.electron_sha256, r4.app_entry.package_main]);
  assert.deepEqual([identity.source_commit, identity.tree_sha256, identity.matching_payload_files, identity.entrypoint.sha256, identity.passed], [staged.source_commit, staged.tree_sha256, 81, staged.files[staged.entrypoint], true]);
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
  assert.equal(ACTIONS.length, 4); assert.equal(ASSISTANCE, 'explain');                                               // Lead D1: typed visual-reading requests only
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
  for (const part of ['m.id === a.model', 'spend_control_reached === true', "a.login !== 'none'"]) assert.ok(ready.includes(part), part);
  assert.equal(ready.includes('ordinary_usage_allowed === false'), false);                                          // included use is not all of the allowance (L1)
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
test('the typed requests carry no card value and do not say the cards changed; they select explain, the circle is left at the product\'s hint', () => {
  for (const q of Object.values(QUESTIONS)) { assert.equal(/\d/.test(q), false, q); assert.equal(/chang|new|different/i.test(q), false, q); }
  const circleAt = idx(s => Array.isArray(s.stroke));
  assert.equal(steps.slice(circleAt - 2, circleAt + 8).some(s => evalOf(s).includes('assistance')), false);          // nothing sets the circle's level
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
// The display as the product listed it before Start (display_choice) and as main names it at arm (decimal string id).
const choice = { display_id: '3071609112', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 2, primary: true };
const armDisplay = { id: '3071609112', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 2 };
// Main's own record (Web 48c20c4 admission.jsonl) as main writes it for the decisions in a checker log.
const mainLines = lines => lines.filter(d => d.event === 'decision').map(d => ({ kind: 'decision', phase: d.phase, sample_seq: d.sample_seq ?? null, frame_seq: d.frame_seq ?? null, raw_sha256: d.raw_sha256 ?? null,
  raw_size: d.raw_size ?? null, request_id: d.request_id ?? null, image_sha256: d.image_sha256 ?? null, allowed: d.verdict === 'allow', denied: d.verdict !== 'allow', reason: d.verdict === 'allow' ? null : (d.reason ?? null), ms: 3000 }))
  .concat([{ kind: 'checker_end', spawned: true, exit_seen: true, code: 0, signal: null, killed: false }]);
// Keyed by the capture folder it was read from (the arm's capture id), as the wrapper collects it.
const mainFrom = lines => ({ [lines.find(d => d.phase === 'arm')?.capture_id ?? '0123456789abcdef']: mainLines(lines) });
const admitted = (l, lines, c = choice, m = mainFrom(lines)) => sourceAdmission(l, lines, c, m);
// QA's checker log for a ledger as the checker writes it when every request went out admitted: ready, arm, then for each
// request that may have been sent one acquisition (pre, post) and its send, each with an accepted fresh admission.
function checkerLog(ledger, { skip = [] } = {}) {
  let seq = 0, sample = 0;
  const admitted = phase => ({ phase: 'checker_' + phase, at: `2026-10-09T06:00:${String(10 + seq).padStart(2, '0')}.000Z`, accepted: true, error: null, owned_points: 16 });
  const decision = (phase, extra) => { seq += 1; return { event: 'decision', seq, id: seq.toString(16).padStart(32, '0'), phase, capture_id: '0123456789abcdef', sample_seq: null, frame_seq: null, raw_sha256: null, raw_size: null,
    request_id: null, image_sha256: null, verdict: 'allow', reason: null, admission: admitted(phase), ...extra }; };
  const lines = [{ event: 'ready' }, decision('arm', { display: structuredClone(armDisplay) })];
  for (const s of ledger.slots.filter(x => x.counted && x.request_id && x.submission !== 'not_submitted' && !skip.includes(x.request_id))) {
    sample += 1;
    const frame = { sample_seq: sample, frame_seq: 100 + sample, raw_sha256: sample.toString(16).padStart(64, 'e'), raw_size: { width: 2560, height: 1600 } };
    lines.push(decision('pre_acquire', { sample_seq: sample }), decision('post_acquire', frame), decision('send', { ...frame, request_id: s.request_id, image_sha256: s.image_sha256 }));
  }
  lines.push({ event: 'eof', requests: seq });
  return lines;
}
const stepIndex = as => idx(s => s.as === as) + 1, strokeAt = idx(s => Array.isArray(s.stroke)) + 1;
const ranTo = (n, values = {}) => ({ steps: steps.slice(0, n).map((_, k) => ({ i: k + 1, ok: true })), values });
const look = (rid, sha256) => [{ kind: 'started', session_id: 'live-1' }, { kind: 'look', session_id: 'live-1', request_id: rid, image: { file: `frames/${sha256}.png`, sha256 } }, { kind: 'looked', session_id: 'live-1', request_id: rid, text: 'Cards 4821 and 5532 are visible.' }];
// App records use the product's vocabulary (submitted / not_submitted / unknown); receipts use the connector's.
const entry = (rid, trigger, extra = {}) => ({ request_id: rid, trigger, live_session_id: 'live-1', question: trigger === 'focus' ? null : QUESTIONS.followup, assistance: 'hint', asked_as: 'silent',
  frame: { image: { sha256: 'f' + rid.length }, focus: 'on_this_frame', captured_at: '2026-10-09T06:00:20.000Z' }, submitted_at: `2026-10-09T06:00:${10 + Number(rid.slice(-1))}.000Z`,
  submission: 'submitted', outcome: { status: 'answered' }, shown: true, presentation: 'shown', ...extra });
const receipt = (rid, sha256, extra = {}) => ({ request_id: rid, input_types: ['text', 'image'], image_sha256: sha256, submission: 'acknowledged', outcome: 'completed', produced_item_types: ['userMessage', 'reasoning', 'agentMessage'], codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true, ...extra });
const values = { action1: JSON.stringify({ used: 1, unwritten: 0 }), action2: JSON.stringify({ used: 2 }), action3: JSON.stringify({ used: 3 }), action4_after: JSON.stringify({ used: 3, unwritten: 0 }),
  action3_card: JSON.stringify({ answer: 'A3' }), action4_stop: JSON.stringify({ out_at_stop: 1, used_at_stop: 3 }), action4_card: JSON.stringify({ answer_hidden: true, answer: '' }) };
function happy() {
  const liveLines = [...look('live-1.look.1', 'a1'), { kind: 'ended', session_id: 'live-1', reason: 'stopped by you', used: 3 }, { kind: 'settled', session_id: 'live-1', request_id: 'sel.3', submission: 'not_submitted', used: 3 }];
  const asks = [{ requests: [entry('sel.1', 'focus'), entry('sel.2', 'text_followup'), entry('sel.3', 'text_followup', { question: QUESTIONS.fence, outcome: { status: 'cancelled', uncertain: false }, shown: false, presentation: undefined, submission: 'not_submitted' })] }];
  // One connector launch: its turn/start count is cumulative (1, 2, 3; the unsent fourth adds none).
  const receipts = { 'live-1.look.1': receipt('live-1.look.1', 'a1', { turn_start_count: 1 }), 'sel.1': receipt('sel.1', 'f5', { turn_start_count: 2 }), 'sel.2': receipt('sel.2', 'f5', { turn_start_count: 3 }),
    'sel.3': receipt('sel.3', 'f5', { submission: 'not_submitted', outcome: 'not_submitted', turn_start_count: 3 }) };
  return { liveLines, asks, receipts, results: ranTo(steps.length, { ...values }) };
}
const ledgerOf = h => buildLedger({ steps, ...h, codexSha256: CONNECTOR.codex_sha256 });
test('ledger: all four actions counted once each, the whole picture at the provider boundary for each answered one, the Stop fenced', () => {
  const h = happy(), l = ledgerOf(h);
  assert.equal(l.attempts_used, 4); assert.equal(l.ceiling_ok, true); assert.equal(l.restarted, false); assert.equal(l.retried, false); assert.equal(l.all_silent, true);
  assert.deepEqual(l.slots.map(s => s.counted), [true, true, true, true]); assert.equal(l.app_counted, 3); assert.equal(l.submitted_slots, 3);
  assert.ok(l.slots.slice(0, 3).every(s => s.transport.verdict === 'whole picture at the provider boundary' && s.transport.codex_sha256_matches === true));
  assert.equal(l.slots[3].transport.verdict, 'inputs prepared; not submitted');                                       // a receipt alone is not the picture at the provider
  assert.equal(fenceVerdict(l, h.liveLines, h.results.values).verdict, 'fenced_before_submission');
  // In flight only when the ask record, the settled line and the receipt all say it was sent.
  const inFlight = structuredClone(h); inFlight.asks[0].requests[2].submission = 'submitted'; inFlight.liveLines.at(-1).submission = 'submitted'; inFlight.receipts['sel.3'].submission = 'acknowledged';
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
  const unknown = structuredClone(h); unknown.asks[0].requests[2].submission = 'unknown'; unknown.liveLines.at(-1).submission = 'unknown'; unknown.receipts['sel.3'].submission = 'uncertain';
  assert.equal(verdict(unknown), 'fenced_submission_unknown');
  const noReceipt = structuredClone(h); delete noReceipt.receipts['sel.3'];                                         // a genuinely unsent attempt need not have one
  assert.equal(verdict(noReceipt), 'fenced_before_submission');
});
test('transport: no receipt, another image, no text or image input, or a request not submitted is never the picture at the provider; tools are flagged', () => {
  assert.equal(transport(null, 'a').verdict, 'official image input: not shown (no receipt)');
  assert.equal(transport(receipt('r', 'b'), 'a').verdict, 'official image input: not shown');
  assert.equal(transport({ ...receipt('r', 'a'), input_types: ['text'] }, 'a').verdict, 'official image input: not shown');
  assert.equal(transport({ ...receipt('r', 'a'), input_types: ['image'] }, 'a').verdict, 'official image input: not shown');
  assert.equal(transport({ ...receipt('r', 'a'), submission: 'not_submitted' }, 'a').verdict, 'inputs prepared; not submitted');
  assert.equal(transport({ ...receipt('r', 'a'), submission: 'uncertain' }, 'a').verdict, 'inputs at the boundary; submission unknown (uncertain)');
  assert.equal(transport({ ...receipt('r', 'a'), submission: undefined }, 'a').phase, 'unknown');
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
  const at = Date.parse('2026-10-09T06:10:00Z'), reviewed = base.manifest.production_commit;
  // F3 gate: the reviewed interlock build is 0ff325b (the Lead's integration and stage); a candidate of another build, or
  // another named build, is refused (52be105 never starts the checker).
  assert.equal(wrapper.interlockProduction, '0ff325beadb7c689244610307b6aa16d638fd2e6'); assert.equal(reviewed, wrapper.interlockProduction);
  assert.equal(wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'w'.repeat(64), at), Date.parse('2026-10-09T06:30:00Z'));
  assert.throws(() => wrapper.validateLiveAllocation(goodAllocation(), { ...base.manifest, production_commit: '52be105a148a28e677f83cc4b7077665f2ff372c' }, 'w'.repeat(64), at), /starts the source-admission checker/);
  assert.throws(() => wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'w'.repeat(64), at, 'a'.repeat(40)), /starts the source-admission checker/);
  assert.throws(() => wrapper.validateLiveAllocation({ ...goodAllocation(), state: 'TEMPLATE_NOT_ACTIVE (the wrapper refuses anything but active)' }, base.manifest, 'w'.repeat(64), at), /separate exact Lead-reviewed live allocation required/);   // the inactive template
  for (const [k, v] of [['schema', 'qa-tts-display-allocation/1'], ['mode', 'AI_DISABLED_GENERATED_SURFACE_ONLY'], ['account_access', true], ['voice', true], ['microphone_access', true],
    ['retry', true], ['restart', true], ['max_native_attempts', 2], ['max_real_actions', 5], ['real_actions_already_used', 1], ['native_bound_ms', 1200000], ['native_bound_ms', 300000], ['native_bound_ms', 900000],
    ['exclusive_display', false], ['audio_access', true], ['cleanup_only_after_expiry', false], ['payload_sha256', { ...wrapper.pins, 'steps.json': '0'.repeat(64) }],
    ['native_invocation', { executable: 'powershell.exe', arguments: [] }], ['approval_scope', 'ai_disabled_display_diagnostic'], ['command_approval_ref', 'short'],
    ['command_approval_ref', 'human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44'], ['script_permission_ref', 'approved-two-gates-20261002:571427dcdc434c0f820236892925aedf'],
    ['script_permission_ref', undefined],
    ['policy', { ...POLICY_MS, max_submissions: 12 }], ['connector', { ...CONNECTOR, state_dir: '/tmp/x' }], ['connector', { ...CONNECTOR, codex_bin: '/home/agentsdock/.local/bin/codex' }],
    ['candidate_sha256', '0'.repeat(64)], ['lead_reviewed', false], ['state', 'expired']]) {
    assert.throws(() => wrapper.validateLiveAllocation({ ...goodAllocation(), [k]: v }, base.manifest, 'w'.repeat(64), at, reviewed), Error, k);
  }
  assert.throws(() => wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'x'.repeat(64), at, reviewed));             // another wrapper
  assert.throws(() => wrapper.validateLiveAllocation(goodAllocation(), base.manifest, 'w'.repeat(64), Date.parse('2026-10-09T06:31:00Z'), reviewed), /not currently active/);
  const moved = goodAllocation(); moved.launch_identity.work = '/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-' + '0'.repeat(32);
  assert.throws(() => wrapper.validateLiveAllocation(moved, base.manifest, 'w'.repeat(64), at, reviewed));
  assert.deepEqual(Object.keys(wrapper.pins), names);                                                                   // every payload the product or runner reads is pinned
});
test('wrapper: the connector side refuses a missing or inexact copy, anything running in it, or another codex binary, before any Windows call', () => {
  const codex = Buffer.from('not codex');
  const io = (over = {}) => ({ existsSync: p => p === CONNECTOR.copy, readdirSync: () => ['1', '2', 'self'], readlinkSync: p => (p === '/proc/2/cwd' ? '/home/agentsdock' : '/'), readFileSync: () => codex, ...over });
  const ok = { compareCopy: () => ({ equal: true, files: 280 }), askPathCheck: () => ({ ok: true }), liveImportCheck: () => ({ ok: true }) };
  assert.throws(() => wrapper.connectorAdmission(io({ existsSync: () => false }), ok), /copy is missing/);
  assert.throws(() => wrapper.connectorAdmission(io(), { ...ok, compareCopy: () => ({ equal: false }) }), /not exactly 0ff325b/);
  assert.throws(() => wrapper.connectorAdmission(io({ readlinkSync: () => CONNECTOR.copy + '/services' }), ok), /already runs/);
  assert.throws(() => wrapper.connectorAdmission(io(), { ...ok, liveImportCheck: () => ({ ok: false }) }), /cannot prepare/);
  assert.throws(() => wrapper.connectorAdmission(io(), { ...ok, askPathCheck: () => ({ ok: false }) }), /cannot prepare/);
  assert.throws(() => wrapper.connectorAdmission(io(), ok), /codex binary digest/);
  assert.throws(() => wrapper.connectorAdmission(io(), ok, '/home/someone-else'), /home is not the one/);           // the receipt roots assume this user
  assert.deepEqual(wrapper.processesIn(CONNECTOR.copy, io({ readlinkSync: p => (p === '/proc/1/cwd' ? CONNECTOR.copy : '/') })), [1]);
});

test('wrapper: the mechanical result needs every term, the connector and its children gone, and keeps acceptance NOT_JUDGED', () => {
  const h = happy(), ledger = ledgerOf(h);
  const report = { launcher: { status: 0 }, aborted: null, steps_ok: true, collect_errors: [], owned_launch_cleanup_confirmed: true, connector_left_running: [], connector_watch: { state: 'released', descendants: 1 },
    ledger, fence: fenceVerdict(ledger, h.liveLines, h.results.values), evidence: { leaks_in_questions: [] }, source_admission: admitted(ledger, checkerLog(ledger)) };
  const ok = wrapper.judgeMechanics(report);
  assert.equal(ok.mechanics_passed, true); assert.match(ok.acceptance, /^NOT_JUDGED/);
  for (const [k, v] of [['launcher', { status: 1 }], ['aborted', 'x'], ['steps_ok', false], ['collect_failed', 'x'], ['collect_errors', ['receipts: x']], ['collect_errors', undefined], ['owned_launch_cleanup_confirmed', false], ['connector_left_running', [123]],
    ['connector_watch', { state: 'released', descendants: 0 }], ['source_admission', { all_bound: false }], ['source_admission', undefined],
    ['connector_watch', { state: 'left_running' }], ['connector_watch', { state: 'unknown' }], ['fence', { verdict: 'unknown' }], ['evidence', { leaks_in_questions: [{ value: 4444 }] }], ['evidence', undefined]]) {
    assert.equal(wrapper.judgeMechanics({ ...report, [k]: v }).mechanics_passed, false, k);
  }
  const notAtProvider = structuredClone(ledger); notAtProvider.slots[1].transport.verdict = 'inputs prepared; not submitted';
  assert.equal(wrapper.judgeMechanics({ ...report, ledger: notAtProvider }).mechanics_passed, false);
  const tool = structuredClone(ledger); tool.slots[2].transport.non_plain_items = ['webSearch'];
  assert.equal(wrapper.judgeMechanics({ ...report, ledger: tool }).mechanics_passed, false);
  for (const k of ['ceiling_ok', 'all_silent']) { const x = structuredClone(ledger); x[k] = false; assert.equal(wrapper.judgeMechanics({ ...report, ledger: x }).mechanics_passed, false, k); }
  const restarted = structuredClone(ledger); restarted.restarted = true; assert.equal(wrapper.judgeMechanics({ ...report, ledger: restarted }).mechanics_passed, false);
  const cut = structuredClone(ledger); cut.slots[3] = { slot: 4, state: 'NOT_RUN', counted: false }; assert.equal(wrapper.judgeMechanics({ ...report, ledger: cut }).mechanics_passed, false);
});
test('wrapper: the watch summary is released only with the whole lifecycle observed; anything less is unknown or left running', () => {
  const io = text => ({ readFileSync: () => text });
  assert.deepEqual(wrapper.watchSummary(io(''), 'w', false), { state: 'not_started' });
  const log = (...e) => e.map(x => JSON.stringify(x)).join('\n');
  const begin = { event: 'watch_start', root_exists: true, already_there: [] };
  const life = [{ event: 'appear', pid: 5, start_ticks: 50, role: 'in_root' }, { event: 'appear', pid: 6, start_ticks: 60, role: 'descendant' }, { event: 'exit', pid: 5, start_ticks: 50 }, { event: 'exit', pid: 6, start_ticks: 60 }];
  const full = wrapper.watchSummary(io(log(begin, ...life, { event: 'watch_end', remaining: [] })), 'w', true);
  assert.deepEqual([full.state, full.connector_seen, full.descendants], ['released', true, 1]);
  assert.equal(wrapper.watchSummary(io(log(begin, life[0], life[1], { event: 'watch_end', remaining: [6] })), 'w', true).state, 'left_running');
  for (const [events, why] of [
    [[begin, { event: 'watch_end', remaining: [] }], /never seen/],                                                 // Support: started, observed no process
    [[{ event: 'watch_end', remaining: [] }], /no start/],                                                          // Support: only the end record
    [[...life, { event: 'watch_end', remaining: [] }], /no start/],                                                 // a lifecycle without the start record (readiness unproven)
    [[{ ...begin, root_exists: false }, ...life, { event: 'watch_end', remaining: [] }], /did not start clean/],
    [[{ ...begin, already_there: [3] }, ...life, { event: 'watch_end', remaining: [] }], /did not start clean/],
    [[begin, ...life], /no end/],
    [[begin, life[0], life[1], life[2], { event: 'watch_end', remaining: [] }], /not seen exiting/],               // pid 6 vanished from the record
    [[begin, life[1], life[3], { event: 'watch_end', remaining: [] }], /never seen/],                               // only a descendant
  ]) {
    const r = wrapper.watchSummary(io(log(...events)), 'w', true);
    assert.equal(r.state, 'unknown', String(why)); assert.match(r.note, why);
  }
  assert.match(wrapper.watchSummary(io(log(begin, ...life, { event: 'watch_end', remaining: [] }) + '\n{broken'), 'w', true).note, /unreadable/);
  assert.equal(wrapper.watchSummary({ readFileSync: () => { throw Error('none'); } }, 'w', true).state, 'unknown');
});
test('wrapper: with an exact allocation it still refuses at the connector checks before any Windows call, any folder or any process', async () => {
  const realFs = await import('node:fs');
  const saved = JSON.parse(realFs.readFileSync(new URL('../../../docs/verification/qa/p0-13-live-0ff325b/candidate-nonvoice-05/candidate.json', import.meta.url)));
  const wrapperHash = sha(realFs.readFileSync(new URL('qa_run_live_candidate.mjs', import.meta.url)));
  const record = { ...goodAllocation(), wrapper_sha256: wrapperHash, native_bound_ms: saved.native_bound_ms,
    native_invocation: { executable: saved.proposed_native_invocation.executable, arguments: saved.proposed_native_invocation.arguments },
    launch_identity: { source: saved.production_commit, stage: saved.stage, tree: saved.stage_tree_sha256, work: saved.work, electron: saved.electron, edge: saved.edge, appPort: saved.appPort, edgePort: saved.edgePort } };
  const allocationPath = '/tmp/qa-live-test-allocation.json', bytes = Buffer.from(JSON.stringify(record));
  for (const [checks, codex, why] of [[{ compareCopy: () => ({ equal: false }) }, null, /not exactly 0ff325b/], [{ compareCopy: () => ({ equal: true, files: 280 }), askPathCheck: () => ({ ok: true }), liveImportCheck: () => ({ ok: true }) }, Buffer.from('not codex'), /codex binary digest/]]) {
    const calls = [];
    const fs = { ...realFs, existsSync: p => { calls.push(['exists', p]); return p === CONNECTOR.copy || (!p.startsWith('/tmp/') && !p.startsWith('/mnt/c/') && realFs.existsSync(p)); },
      lstatSync: p => (p === allocationPath ? { isFile: () => true, isSymbolicLink: () => false } : realFs.lstatSync(p)),
      readFileSync: (p, o) => (p === allocationPath ? bytes : p === CONNECTOR.codex_bin ? codex : realFs.readFileSync(p, o)),
      readdirSync: p => (p === '/proc' ? [] : realFs.readdirSync(p)), readlinkSync: () => '/',
      mkdirSync: p => { calls.push(['mkdir', p]); }, writeFileSync: p => { calls.push(['write', p]); } };
    const exec = (file, args) => { calls.push(['exec', file]); if (file === 'python3') return JSON.stringify(identity); throw Error('no Windows in this test'); };
    const injected = { fs, execFileSync: exec, spawnSync: () => { calls.push(['spawnSync']); throw Error('no'); }, spawn: () => { calls.push(['spawn']); throw Error('no'); }, now: () => Date.parse('2026-10-09T06:10:00Z'), checks };
    // Another named build: the exact allocation is refused before the Linux stage check or anything else.
    await assert.rejects(wrapper.runLiveCandidate({ execute: true, out: '/tmp/qa-live-test-out', allocation: allocationPath, allocationSha256: sha(bytes) }, { ...injected, interlock: 'b'.repeat(40) }), /starts the source-admission checker/);
    assert.deepEqual(calls.filter(c => c[0] !== 'exists'), []);
    await assert.rejects(wrapper.runLiveCandidate({ execute: true, out: '/tmp/qa-live-test-out', allocation: allocationPath, allocationSha256: sha(bytes) }, injected), why);
    assert.deepEqual(calls.filter(c => c[0] === 'exec').map(c => c[1]), ['python3']);                                  // the Linux stage check only
    assert.deepEqual(calls.filter(c => ['mkdir', 'write', 'spawn', 'spawnSync'].includes(c[0])), []);
  }
});

// ---- Lead HOLD b63ecdc: L1 (credits beside an exhausted included window) and L2 (a reached Start with missing records) ----
test('L1: the actual account_ready step lets ordinary credits, an exhausted included window and an unknown quota through, and stops on a stated spend control', async () => {
  const text = evalOf(steps[idx(s => s.as === 'account_ready')]);
  const model = { id: 'gpt-6-astra', image_input: true };
  const bucket = over => ({ limit_id: 'codex', normal_model_slug: null, primary: { used_percent: 100, window_duration_mins: 10080, resets_at: '2026-10-12T00:00:00Z' }, secondary: null,
    credits: { has_credits: true, unlimited: false, balance: '100' }, rate_limit_reached_type: null, spend_control_reached: false, individual_limit: null, ...over });
  const state = over => ({ mode: 'managed', state: 'signed_in', plan: 'plus', quota: { available: true, ordinary_usage_allowed: true, windows: [bucket({})] }, quota_read_at: '2026-10-09T07:00:00Z',
    models: [model, { id: 'text-only', image_input: false }], model: model.id, login: 'none', detail: null, asking: false, ...over });
  const run = (sub, aiOff = false) => vm.runInNewContext(text, { lc: { subState: async () => sub }, document: { getElementById: () => ({ disabled: aiOff }) }, JSON, Error, Promise });
  // Through (the server decides): the lead's reproductions and the observed credit-backed situation.
  for (const quota of [
    { available: true, ordinary_usage_allowed: false, windows: [bucket({ rate_limit_reached_type: 'rate_limit_reached' })] },                 // included exhausted, credits
    { available: true, ordinary_usage_allowed: true, windows: [bucket({ rate_limit_reached_type: 'rate_limit_reached' })] },                  // reached marker, credits
    null,                                                                                                                                    // unknown allowance
    { available: false, ordinary_usage_allowed: null, windows: [] },                                                                         // not read
    { available: true, ordinary_usage_allowed: false, windows: [bucket({ credits: null, rate_limit_reached_type: 'rate_limit_reached' })] },  // unknown balance
  ]) {
    const r = JSON.parse(await run(state({ quota })));
    assert.equal(r.spend_control_reached, false); assert.equal(r.image_input, true);
  }
  const facts = JSON.parse(await run(state({ quota: { available: true, ordinary_usage_allowed: false, windows: [bucket({ rate_limit_reached_type: 'rate_limit_reached' })] } })));
  assert.deepEqual([facts.included_usage_allowed, facts.included_reached, facts.credits_present], [false, true, true]);
  // Stopped before Start: an authoritative spend control, and the unchanged account/model gates.
  await assert.rejects(run(state({ quota: { available: true, ordinary_usage_allowed: true, windows: [bucket({ spend_control_reached: true })] } })), /spend or workspace limit/);
  await assert.rejects(run(state({ state: 'signed_out' })), /not signed in/);
  await assert.rejects(run(state({ login: 'waiting' })), /sign-in or a request is pending/);
  await assert.rejects(run(state({ asking: true })), /pending/);
  await assert.rejects(run(state({ model: 'text-only' })), /does not take pictures/);
  await assert.rejects(run(state({ model: null })), /does not take pictures/);
  await assert.rejects(run(state({}), true), /cannot be started/);
});
test('L2: a reached Start whose later records are missing counts the first look as used (unknown); a known pre-Start stop does not', () => {
  const at = stepIndex('capture_start');
  for (const ok of [true, false]) {
    const results = ranTo(at); results.steps.at(-1).ok = ok; if (!ok) results.steps.at(-1).error = 'guarded capture Start failed';
    const l = buildLedger({ steps, results, liveLines: [], asks: [], receipts: {} });                                   // the lead's reproduction (unknown-start-probe.json)
    assert.deepEqual([l.slots[0].state, l.slots[0].counted, l.attempts_used, l.attempts_remaining], ['start_reached_outcome_unknown', true, 1, 3], `capture_start ok=${ok}`);
    assert.deepEqual(l.slots.slice(1).map(s => s.state), ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']);
  }
  const lost = ranTo(at - 1);                                                                                         // the Start step's own entry lost, the session started
  assert.deepEqual(buildLedger({ steps, results: lost, liveLines: [{ kind: 'started' }], asks: [], receipts: {} }).slots[0].state, 'session_started_no_look_recorded');
  const refused = ranTo(at); refused.steps.at(-1).ok = false;
  const r = buildLedger({ steps, results: refused, liveLines: [{ kind: 'not_started', code: 'unauthenticated' }], asks: [], receipts: {} });
  assert.deepEqual([r.slots[0].state, r.slots[0].counted, r.attempts_used], ['NOT_RUN_session_not_started', false, 0]);
  const admission = ranTo(at); admission.steps.at(-1).ok = false; admission.values = { qa_display_admission_011: { phase: 'before_capture_start', accepted: false, error: 'owned surface lost' } };
  const a = buildLedger({ steps, results: admission, liveLines: [], asks: [], receipts: {} });
  assert.deepEqual([a.slots[0].state, a.slots[0].counted, a.attempts_used], ['NOT_RUN_start_not_evaluated', false, 0]);
  assert.deepEqual(buildLedger({ steps, results: ranTo(at - 1), liveLines: [], asks: [], receipts: {} }).attempts_used, 0);   // Start never reached
});
test('D8: raw receipts are written outside the repository; only sanitized fields and an allowlist of generated files are for Git', () => {
  assert.equal(wrapper.rawReceiptsRoot.startsWith(new URL('../../..', import.meta.url).pathname), false);
  assert.match(wrapper.rawReceiptsRoot, /^\/home\/[^/]+\/\.local\/state\/[^/]+$/);                                  // the user's local state, never a checkout
  assert.equal(/\/(Projects|docs|verification|wt-[^/]*|repo)(\/|$)/.test(wrapper.rawReceiptsRoot), false);
  const raw = { 'live-1.look.1': { ...receipt('live-1.look.1', 'a1'), thread_id: 'thr_secret', turn_id: 'turn_secret', codex_executable: '/home/x/codex', format: 'lc-subscription-ask-receipt/1' } };
  const clean = wrapper.sanitizeReceipts(raw)['live-1.look.1'];
  for (const k of ['thread_id', 'turn_id', 'codex_executable']) assert.equal(k in clean, false, k);
  assert.equal(clean.image_sha256, 'a1'); assert.equal(clean.submission, 'acknowledged');
  const tree = { '/o': ['run.json', 'ledger.json', 'receipts-sanitized.json', 'runner-results.json', 'connector-watch.jsonl', 'admission-checker.jsonl', 'runner.stdout.bin', 'captures', 'private', 'preflight-refusal.json'],
    '/o/captures': ['0123abcd'], '/o/captures/0123abcd': ['live.jsonl', 'asks', 'frames'], '/o/captures/0123abcd/asks': ['ask-1.json', 'f.png'], '/o/captures/0123abcd/frames': ['x.png'], '/o/private': ['receipt.json'] };
  const io = { readdirSync: d => tree[d], statSync: p => ({ isDirectory: () => p in tree }) };
  assert.deepEqual(wrapper.publishAllowlist(io, '/o').files, ['admission-checker.jsonl', 'captures/0123abcd/asks/ask-1.json', 'captures/0123abcd/live.jsonl', 'connector-watch.jsonl', 'ledger.json', 'receipts-sanitized.json', 'run.json', 'runner-results.json', 'runner.stdout.bin']);
});

// ---- Support HOLD 38230e1 (F1, F4, F5, F6, receipt reader); F3 is held for the Lead's interlock decision ----
test('F1: the spend/workspace veto reads only the bucket the connector applies to the selected model, as 52be105 chatgpt_rpc.py selects it', async () => {
  const text = evalOf(steps[idx(s => s.as === 'account_ready')]);
  const model = { id: 'gpt-6-astra', image_input: true };
  const b = over => ({ limit_id: 'codex', normal_model_slug: null, primary: null, secondary: null, credits: { has_credits: true, unlimited: false, balance: '5' }, rate_limit_reached_type: null, spend_control_reached: false, individual_limit: null, ...over });
  const run = windows => vm.runInNewContext(text, { lc: { subState: async () => ({ mode: 'managed', state: 'signed_in', quota: { available: true, ordinary_usage_allowed: true, windows }, quota_read_at: 'x',
    models: [model], model: model.id, login: 'none', asking: false }) }, document: { getElementById: () => ({ disabled: false }) }, JSON, Error, Promise });
  const workspace = ['workspace_owner_credits_depleted', 'workspace_member_credits_depleted', 'workspace_owner_usage_limit_reached', 'workspace_member_usage_limit_reached'];
  // Refused: the one applicable bucket (Codex for any model or this one, or the single unnamed bucket) states a spend
  // control or a workspace limit; credits elsewhere do not lift it.
  for (const windows of [[b({ spend_control_reached: true })], [b({ normal_model_slug: model.id, spend_control_reached: true })], [b({ limit_id: null, spend_control_reached: true })],
    [b({ spend_control_reached: true }), b({ normal_model_slug: 'another-model' })], ...workspace.map(code => [b({ rate_limit_reached_type: code })])]) {
    await assert.rejects(run(windows), /spend or workspace limit for this model/, JSON.stringify(windows.map(w => [w.limit_id, w.normal_model_slug, w.spend_control_reached, w.rate_limit_reached_type])));
  }
  // Through (the server decides): another model's bucket, another limit, an ambiguous pair, two unnamed buckets, an
  // included window reached beside credits, an unknown spend state.
  for (const windows of [[b({ normal_model_slug: 'another-model', spend_control_reached: true })], [b({ limit_id: 'other_limit', spend_control_reached: true })],
    [b({ spend_control_reached: true }), b({ normal_model_slug: model.id })], [b({ limit_id: null, spend_control_reached: true }), b({ limit_id: null })],
    [b({ rate_limit_reached_type: 'rate_limit_reached' })], [b({ spend_control_reached: null })], [b({ limit_id: null, normal_model_slug: 'another-model', spend_control_reached: true })]]) {
    const r = JSON.parse(await run(windows));
    assert.equal(r.spend_control_reached, false);
  }
  assert.equal(JSON.parse(await run([b({}), b({ normal_model_slug: 'another-model' })])).applicable_buckets, 1);
});

const reportOf = (h, over = {}) => { const ledger = ledgerOf(h); return { launcher: { status: 0 }, aborted: null, steps_ok: true, collect_errors: [], owned_launch_cleanup_confirmed: true,
  connector_left_running: [], connector_watch: { state: 'released', descendants: 1 }, ledger, fence: fenceVerdict(ledger, h.liveLines, h.results.values), evidence: { leaks_in_questions: [] },
  source_admission: admitted(ledger, checkerLog(ledger)), ...over }; };
test('F4: Support\'s receipt witness cases fail the mechanics; collection, records, tools, digest and provider turns are judged for every action', () => {
  const control = wrapper.judgeMechanics(reportOf(happy()));
  assert.equal(control.mechanics_passed, true, JSON.stringify(control.mechanics));
  const failsOn = (r, term) => { const j = wrapper.judgeMechanics(r); assert.equal(j.mechanics[term], false, term); assert.equal(j.mechanics_passed, false, term); };
  failsOn(reportOf(happy(), { collect_errors: ['receipts: invalid JSON'] }), 'collected');                       // collection_error
  const f4 = happy(); f4.asks[0].requests[2].submission = 'submitted'; f4.liveLines.at(-1).submission = 'submitted'; f4.liveLines.at(-1).used = 4;
  f4.results.values.action4_after = JSON.stringify({ used: 4, unwritten: 0 }); Object.assign(f4.receipts['sel.3'], { submission: 'acknowledged', produced_item_types: ['commandExecution'], turn_start_count: 4 });
  failsOn(reportOf(f4), 'stop_attempt_facts_ok');                                                               // fourth_turn_tool
  assert.equal(reportOf(f4).fence.verdict, 'fenced_in_flight');                                                 // (the fence itself agrees: the tool is what fails)
  const digest = happy(); digest.receipts['sel.1'].codex_sha256 = 'c'.repeat(64);
  failsOn(reportOf(digest), 'whole_picture_at_provider');                                                       // wrong_connector_digest, slot 2
  const bin = happy(); bin.receipts['sel.3'].explicit_bin_override = false;
  failsOn(reportOf(bin), 'stop_attempt_facts_ok');                                                              // the Stop attempt's receipt is judged too
  const five = happy(); five.receipts['sel.2'].turn_start_count = 5;
  failsOn(reportOf(five), 'provider_turns_reconciled');                                                         // five_provider_turns
  const phase = happy(); phase.asks[0].requests[2].submission = 'submitted';
  assert.equal(reportOf(phase).fence.verdict, 'unknown'); failsOn(reportOf(phase), 'fenced');                  // contradictory_fence_phase
  assert.match(transport({ ...receipt('r', 'a'), submission: 'uncertain' }, 'a').verdict, /submission unknown/);  // uncertain_receipt
  // Cumulative counts are never summed within one launch; separate launches add up; a missing count is not zero.
  assert.equal(ledgerOf(happy()).provider_turns, 3);
  const two = happy(); two.receipts['live-1.look.1'].__launch = 'A'; for (const [k, n] of [['sel.1', 1], ['sel.2', 2], ['sel.3', 2]]) Object.assign(two.receipts[k], { __launch: 'B', turn_start_count: n });
  assert.deepEqual([ledgerOf(two).provider_turns, ledgerOf(two).receipt_launches, wrapper.judgeMechanics(reportOf(two)).mechanics_passed], [3, 2, true]);
  const missing = happy(); delete missing.receipts['sel.2'].turn_start_count;
  failsOn(reportOf(missing), 'provider_turns_reconciled');
  const fewer = happy(); fewer.receipts['sel.2'].turn_start_count = 2; fewer.receipts['sel.3'].turn_start_count = 2;   // three sent, two turns recorded
  failsOn(reportOf(fewer), 'provider_turns_reconciled');
  // Incomplete records stay incomplete.
  const broken = happy(); broken.liveLines.push(...parseJsonl('{"kind":"looked"\n[1]'));
  failsOn(reportOf(broken), 'records_complete');
  const noRequests = happy(); noRequests.asks.push({ request_id: 'x' });
  failsOn(reportOf(noRequests), 'records_complete');
  const noId = happy(); noId.asks[0].requests.push({ trigger: 'focus' });
  failsOn(reportOf(noId), 'records_complete');
  // A sent request without a Codex child seen by the watch is not a correlated lifecycle.
  failsOn(reportOf(happy(), { connector_watch: { state: 'released', descendants: 0 } }), 'connector_lifecycle_correlated');
  // The Stop attempt without a receipt passes only if every record says not submitted.
  const unsent = happy(); delete unsent.receipts['sel.3'];
  assert.equal(wrapper.judgeMechanics(reportOf(unsent)).mechanics_passed, true);
  const unsentUnknown = happy(); delete unsentUnknown.receipts['sel.3']; unsentUnknown.asks[0].requests[2].submission = 'unknown'; unsentUnknown.liveLines.at(-1).submission = 'unknown';
  failsOn(reportOf(unsentUnknown), 'stop_attempt_facts_ok');
});

test('F5: the watch must record its own clean start before anything can launch; not ready, it is stopped, a refusal is written and nothing runs', async () => {
  const setup = (text, over = {}) => {
    const calls = [], watcher = { on: (ev, cb) => { if (ev === 'exit') watcher.exit = cb; } };
    const io = { readFileSync: p => { calls.push(['read', p]); if (text === null) throw Error('ENOENT'); return text; },
      writeFileSync: p => { calls.push(['write', p]); if (p.endsWith('connector-watch.stop')) watcher.exit?.(); }, existsSync: () => false, ...over };
    const start = (cmd, args) => { calls.push(['spawn', cmd, ...args]); return watcher; };
    const clock = { slept: 0 };
    return { io, start, calls, clock, sleep: async ms => { clock.slept += ms; } };
  };
  const line = e => JSON.stringify({ event: 'watch_start', root_exists: true, already_there: [], at: '2026-10-09T06:00:00Z', ...e }) + '\n';
  for (const [text, why] of [[null, /no start in time/], ['', /no start in time/], [line({ root_exists: false }), /private copy is missing/], [line({ already_there: [9] }), /already runs/]]) {
    const t = setup(text);
    const w = await wrapper.startWatch(t.io, t.start, t.sleep, '/tmp/qa-live-out');
    assert.equal(w.ready.ready, false); assert.match(w.ready.reason, why);
    assert.deepEqual(t.calls.filter(c => c[0] === 'write').map(c => c[1].split('/').at(-1)), ['connector-watch.stop', 'watch-refusal.json']);
    assert.ok(t.clock.slept <= 5100);                                                                              // bounded
  }
  const t = setup(line({}));
  const w = await wrapper.startWatch(t.io, t.start, t.sleep, '/tmp/qa-live-out');
  assert.deepEqual([w.ready.ready, w.launchesBefore], [true, []]);
  assert.deepEqual(t.calls[0].slice(0, 6), ['spawn', 'python3', new URL('qa_sub_watch.py', import.meta.url).pathname, '--root', CONNECTOR.copy, '--out']);
  assert.equal(t.calls.some(c => c[0] === 'write'), false);
  // The receipt launches already present are listed (names only) while the watch is ready; an odd root refuses.
  const root = '/home/agentsdock/.local/share/LearningCompanion/managed-chatgpt/receipts';
  const listed = setup(line({}), { existsSync: p => p === root, lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }), realpathSync: p => p, readdirSync: () => ['b'.repeat(32), 'a'.repeat(32)] });
  assert.deepEqual((await wrapper.startWatch(listed.io, listed.start, listed.sleep, '/tmp/o')).launchesBefore, ['a'.repeat(32), 'b'.repeat(32)]);
  const linked = setup(line({}), { existsSync: p => p === root, lstatSync: () => ({ isDirectory: () => false, isSymbolicLink: () => true }), realpathSync: () => '/elsewhere', readdirSync: () => [] });
  const lw = await wrapper.startWatch(linked.io, linked.start, linked.sleep, '/tmp/o');
  assert.equal(lw.ready.ready, false); assert.match(lw.ready.reason, /receipts folder/);
  // In the run: the watch is ready before the scratch is taken and before the native launch.
  const src = readFileSync(new URL('qa_run_live_candidate.mjs', import.meta.url), 'utf8'), body = src.slice(src.indexOf('export async function runLiveCandidate('), src.indexOf('export async function startWatch('));
  const order = ['await startWatch(io, start, sleep, out)', 'if (!watch.ready.ready) throw', 'io.mkdirSync(candidate.work, { recursive: false })', 'run(psBin, invocation.arguments'].map(x => body.indexOf(x));
  assert.ok(order.every(i => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), String(order));
  assert.equal(body.includes("start('python3'"), false);                                                          // the only watch start is startWatch's
});

test('receipt reader: only this run\'s new launches, real folders and files, the connector format and this request id, checked before any byte is kept', () => {
  const R = '/state/receipts', A = 'a'.repeat(32), B = 'b'.repeat(32), OLD = 'c'.repeat(32), rid = 'sel.1', rid2 = 'live-1.look.1';
  const nameOf = r => sha(Buffer.from(r, 'utf8')) + '.json';
  const full = (r, over = {}) => Buffer.from(JSON.stringify({ request_id: r, input_types: ['text', 'image'], text_bytes: 10, text_sha256: 'd'.repeat(64), image_bytes: 20, image_sha256: 'e'.repeat(64),
    submission: 'acknowledged', terminal_status: 'completed', outcome: 'completed', produced_item_types: ['userMessage', 'agentMessage'], thread_start_count: 1, turn_start_count: 1, actual_model: 'gpt-6-astra',
    thread_id: 'thr_x', turn_id: 'turn_x', format: 'lc-subscription-ask-receipt/1', codex_executable: '/x/codex', codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true, ...over }));
  const fake = ({ dirs, files = {}, links = [], real = {}, nlink = {} }) => {
    const opened = [], held = new Map(); let next = 3;
    return { opened, existsSync: p => p in dirs, lstatSync: p => ({ isDirectory: () => p in dirs && !links.includes(p), isSymbolicLink: () => links.includes(p) }), realpathSync: p => real[p] ?? p,
      readdirSync: p => dirs[p], openSync: (p, flags) => { opened.push([p, flags]);
        if (links.includes(p)) throw Object.assign(Error('ELOOP'), { code: 'ELOOP' }); if (!(p in files)) throw Object.assign(Error('ENOENT'), { code: 'ENOENT' }); held.set(next, p); return next++; },
      fstatSync: fd => ({ isFile: () => true, nlink: nlink[held.get(fd)] ?? 1, size: files[held.get(fd)].length }), readFileSync: fd => files[held.get(fd)], closeSync: fd => held.delete(fd) };
  };
  const NOFOLLOW = fsConstants.O_NOFOLLOW;
  const good = fake({ dirs: { [R]: [OLD, A], [`${R}/${A}`]: [], [`${R}/${OLD}`]: [] }, files: { [`${R}/${A}/${nameOf(rid)}`]: full(rid), [`${R}/${OLD}/${nameOf(rid2)}`]: full(rid2) } });
  const g = wrapper.readOwnReceipts(good, [OLD], [rid, rid2], R);
  assert.deepEqual([Object.keys(g.receipts), g.errors, g.launches, g.raw.map(x => [x.launch, x.name])], [[rid], [], [A], [[A, nameOf(rid)]]]);
  assert.equal(g.receipts[rid].__launch, A); assert.ok(g.raw[0].bytes.equals(full(rid)));
  assert.ok(good.opened.every(([p, flags]) => p.startsWith(`${R}/${A}/`) && (flags & NOFOLLOW) === NOFOLLOW));       // the earlier launch is never opened; no link followed
  const bad = (spec, rids, why) => { const r = wrapper.readOwnReceipts(fake(spec), [], rids, R); assert.deepEqual([Object.keys(r.receipts), r.raw], [[], []], String(why)); assert.match(r.errors.join(' | '), why); return r; };
  const one = (bytes, extra = {}) => ({ dirs: { [R]: [A], [`${R}/${A}`]: [] }, files: { [`${R}/${A}/${nameOf(rid)}`]: bytes }, ...extra });
  bad(one(full(rid), { real: { [R]: '/elsewhere/receipts' } }), [rid], /not the product's own real folder/);        // the root resolves elsewhere
  bad(one(full(rid), { links: [`${R}/${A}`] }), [rid], /not a real folder/);                                        // a linked launch folder
  bad(one(full(rid), { real: { [`${R}/${A}`]: '/elsewhere/a' } }), [rid], /not a real folder/);
  bad(one(full(rid), { links: [`${R}/${A}/${nameOf(rid)}`] }), [rid], /ELOOP/);                                     // a linked receipt file
  bad(one(full(rid), { nlink: { [`${R}/${A}/${nameOf(rid)}`]: 2 } }), [rid], /single-link/);
  bad(one(Buffer.alloc(16385, 32)), [rid], /16 KiB/);
  bad(one(full('sel.2')), [rid], /this request's receipt/);                                                         // another request's bytes under this name
  bad(one(full(rid, { format: 'other/1' })), [rid], /this request's receipt/);
  bad(one(full(rid, { note: 'extra' })), [rid], /this request's receipt/);
  bad(one(Buffer.from('{not json')), [rid], /JSON/);
  bad({ dirs: { [R]: ['tmp'], [`${R}/tmp`]: [] } }, [rid], /not named as the connector names a launch/);
  const twice = wrapper.readOwnReceipts(fake({ dirs: { [R]: [A, B], [`${R}/${A}`]: [], [`${R}/${B}`]: [] }, files: { [`${R}/${A}/${nameOf(rid)}`]: full(rid), [`${R}/${B}/${nameOf(rid)}`]: full(rid) } }), [], [rid], R);
  assert.deepEqual([twice.raw.length, twice.errors.length], [1, 1]); assert.match(twice.errors[0], /two launches/);
  // The run copies only what the reader admitted.
  const src = readFileSync(new URL('qa_run_live_candidate.mjs', import.meta.url), 'utf8'), collectBody = src.slice(src.indexOf('function collect('));
  assert.ok(collectBody.includes('for (const { launch, name, bytes } of own.raw)')); assert.equal(/regularRead\(file\)|managedState, 'receipts'\)/.test(collectBody), false);
});

// ---- F3 (Lead interface 4f7d9fa): QA's source-admission checker, its configuration, the runner delta and the binding ----
test('F3 checker: the reviewed admission with exactly four overlay substitutions, the one shared predicate, read-only natives, and the Lead protocol', () => {
  const checker = base.payload['admission-checker.ps1'], defs = checkerDefinitions(runner), derived = checkerAdmission(runner), predicate = overlayPredicate();
  assert.equal(checker, admissionChecker(runner)); assert.ok(checker.includes(defs));
  for (const block of defs.replace(derived, '').split(/\n(?=function |Add-Type @')/)) assert.ok(runner.includes(block.trimEnd()), block.slice(0, 60));   // byte for byte from the runner
  assert.equal(/@@QA_(REVIEWED_ADMISSION_DEFINITIONS|OVERLAY_PREDICATE)@@/.test(checker), false);
  // The checker's admission = the reviewed one with exactly the four substitutions (Lead handoff_1698eb17/e893ca27).
  const at = runner.indexOf('function Assert-QaSurfaceAdmission('), admission = runner.slice(at, runner.indexOf('\n}\n', at) + 3);
  assert.ok(checker.includes(derived)); assert.equal(CHECKER_ADMISSION_SUBSTITUTIONS.length, 4);
  let reverted = derived;
  for (const [a, b] of [...CHECKER_ADMISSION_SUBSTITUTIONS].reverse()) { assert.equal(reverted.split(b).length, 2, a.slice(0, 50)); reverted = reverted.replace(b, () => a); }
  assert.equal(reverted, admission);
  assert.equal((checker.match(/^function Assert-QaSurfaceAdmission\(/gm) ?? []).length, 0);
  for (const k of ["'0,0,2560,1600'", '$entry.owned_points++', 'Assert-QaDisplayBaseline $entry.native_final', 'fresh owned browser geometry changed', "throw 'owned surface lost at a required card or corner point'"]) assert.ok(derived.includes(k), k);
  assert.ok(derived.includes("if (-not (Test-QaPointAdmitted $root $window ([int]$point[0]) ([int]$point[1]) $script:qaOverlayBinding $entry)) { throw 'owned surface lost"));
  assert.equal((derived.match(/\((\$state|\$lastWindow)\.Foreground -or \(Test-QaOverlayForeground \$window \$script:qaOverlayBinding \$entry\)\)/g) ?? []).length, 2);
  // ONE predicate: the same bytes in the checker and in the runner.
  assert.ok(checker.includes(predicate) && runner.includes(predicate)); assert.equal(checker.split(predicate).length, 2); assert.equal(runner.split(predicate).length, 2);
  const uncommented = text => text.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
  const code = uncommented(checker.replace(/Add-Type @'[\s\S]*?\n'@\n/g, ''));
  const defined = new Set([...code.matchAll(/^function ([A-Za-z-]+)/gm)].map(m => m[1]));
  for (const name of new Set([...code.matchAll(/\b([A-Z][a-z]+-Qa[A-Za-z]+)\b/g)].map(m => m[1]).concat(['Invoke-Cdp', 'Receive-Message', 'Window-Handle', 'Target-Url', 'Get-Socket', 'Eval']))) assert.ok(defined.has(name), `${name} is defined in the checker`);
  assert.deepEqual([...new Set([...code.matchAll(/\[(Qa\w+)\]::(\w+)/g)].map(m => `${m[1]}.${m[2]}`))].sort(),
    ['QaDisplayAdmissionNative.ReadDisplays', 'QaDisplayAdmissionNative.ReadWindow', 'QaEdgeSurface.Find', 'QaOverlayNative.AboveInNormalBand', 'QaOverlayNative.Read', 'QaOverlayNative.StackAbove',
      'QaPlacementNative.Read', 'QaWin.Find', 'QaWin.GetForegroundWindow', 'QaWin.RootAt', 'QaWin.SetProcessDPIAware']);   // reads only: no raise, input or move
  for (const bad of [/Start-Process/, /Stop-Process/, /Invoke-Expression|\biex\b/i, /EncodedCommand/i, /\.Kill\(/, /Invoke-Item/, /Set-ExecutionPolicy/, /Add-Content|Set-Content|Out-File/, /Remove-Item/, /Send-Cdp/, /dispatch(Mouse|Key|Touch)Event/]) assert.equal(bad.test(code), false, String(bad));
  assert.ok(runner.includes("'@\n[void][QaWin]::SetProcessDPIAware()\n") && checker.includes("'@\n[void][QaWin]::SetProcessDPIAware()\n"));
  assert.ok(checker.indexOf('[void][QaWin]::SetProcessDPIAware()') < checker.indexOf('# ---- start:'));
  const template = readFileSync(new URL('qa_admission_checker.ps1', import.meta.url), 'utf8'), loop = template.slice(template.indexOf('# ---- start:'));
  assert.equal(/\b(Eval|Invoke-Cdp|Get-Socket)\b/.test(loop), false);
  assert.ok(loop.includes(`$qaProtocolOut.WriteLine('{"format":"lc-source-admission/1","ready":true}')`));
  assert.ok(template.includes("$qaReqNames = 'capture_id,display,format,frame_seq,id,image_sha256,overlay,phase,raw_sha256,raw_size,request_id,sample_seq,sent_at,seq'"));
  const replyText = loop.slice(loop.indexOf('$reply = [ordered]@{'), loop.indexOf('$out = $reply'));
  const replyKeys = [...replyText.matchAll(/(\w+) = /g)].map(m => m[1]).filter(k => k !== 'reply');
  assert.deepEqual(replyKeys, ['format', 'id', 'seq', 'phase', 'capture_id', 'display', 'overlay', 'sample_seq', 'frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256', 'verdict', 'reason']);
  for (const k of replyKeys.slice(0, 13)) assert.ok(replyText.includes(`${k} = $r.${k}`), `${k} echoed`);
  assert.ok(loop.indexOf("event = 'decision'") < loop.indexOf('$qaProtocolOut.WriteLine($out)'));
  assert.equal((template.match(/\$qaProtocolOut\.WriteLine\(/g) ?? []).length, 2);
  for (const k of ['AddSeconds(1800)', '$qaState.count -gt 4096', 'GetByteCount($line) -gt 4096', 'exit 2', 'exit 0', "if ($null -ne $qaState.denied) { $reason = 'an earlier decision denied this capture' }"]) assert.ok(loop.includes(k), k);
  assert.equal((loop.match(/Assert-QaCheckerAdmission/g) ?? []).length, 1); assert.ok(loop.includes('$results.values = [ordered]@{}'));
  // One decision: (arm only) bind the named overlay, the band, the admission, the band, the bound overlay revalidated.
  const decide = loop.slice(loop.indexOf("if ($r.phase -ceq 'arm') { $script:qaOverlayBinding = New-QaOverlayBinding"), loop.indexOf("} catch { $reason = 'source admission refused"));
  const order = ["if ($r.phase -ceq 'arm') { $script:qaOverlayBinding = New-QaOverlayBinding $r.overlay $script:qaApp.pid $script:qaApp.start_ticks $script:qaApp.process $script:qaOverlayExpect }",
    '        Assert-QaCheckerBand\n', "$null = Assert-QaCheckerAdmission ('checker_' + $r.phase)", '        Assert-QaCheckerBand\n        # During the capture the bound overlay', 'Get-QaOverlayStateFault $script:qaOverlayBinding'];
  const pos = order.map((k, i) => (i === 3 ? decide.indexOf(k, decide.indexOf(order[2])) : decide.indexOf(k)));
  assert.ok(pos.every(i => i >= 0) && pos.every((i, k) => k === 0 || i > pos[k - 1]), String(pos));
  assert.ok(decide.includes("$held.overlay_handle -cne $script:qaOverlayBinding.hwnd_text)) { throw 'an unbound overlay was accepted' }"));
  assert.ok(decide.includes("if ($null -ne $script:qaOverlayBinding) {\n          $fault = Get-QaOverlayStateFault $script:qaOverlayBinding\n          if ($null -ne $fault) { throw ('the bound overlay changed during the check: ' + $fault) }"));   // every decision during the capture
  // The lineage, order and replay refusals stay (the interface's admitted lineage).
  for (const k of ["'send names no admitted acquisition'", "'post_acquire names no admitted pre_acquire'", "'this request was already admitted for sending'", "'request identity replayed'", "'request sequence did not increase'",
    "'arm display is not the admitted display'", "'arm must be the first and only arm request'", "'another capture'", "'sample sequence did not increase'", "'no admitted arm for this capture'"]) assert.ok(template.includes(k), k);
  assert.equal(/Window-Handle|Get-QaEdgeSurfaceWindow|Assert-QaNormalEdge|OwnedWindows/.test(uncommented(loop)), false);   // no further identity resolution, no title search
  assert.ok(template.includes("if ($r.phase -ceq 'arm') { $script:qaOverlayBinding = $null }"));                       // a denied arm binds nothing
  assert.ok(template.includes("if ($null -ne $r.display -or $null -ne $r.overlay) { return 'only arm carries a display or an overlay' }"));
  assert.ok(template.includes("if (-not (Test-QaCheckerObject $o) -or (Get-QaCheckerNames $o) -cne 'hwnd,pid') { return 'arm overlay is malformed' }"));
  const band = template.slice(template.indexOf('function Assert-QaCheckerBand {'), template.indexOf('\n}\n', template.indexOf('function Assert-QaCheckerBand {')));
  for (const k of ['$p.HasExited -or $p.StartTime -ne $script:qaEdgeIdentity.start', '$g.Owner -ne $script:qaEdgeIdentity.pid', 'if ($m.Topmost -or $m.Minimized)']) assert.ok(band.includes(k), k);
  const ne = runner.slice(runner.indexOf('function Assert-QaNormalEdge('), runner.indexOf('\n}\n', runner.indexOf('function Assert-QaNormalEdge(')));
  assert.ok(ne.includes('if ($snapshot.topmost -or $snapshot.minimized)'));
  for (const k of ["'app_pid,app_start_ticks,display_signature,edge_pid,edge_port,edge_start_ticks,format,handle,surface_url,token'", '$appProcess.StartTime.Ticks -ne [long]$qaContext.app_start_ticks',
    'Get-CimInstance Win32_Process -Filter "ProcessId=$PID"', '[int]$parent[0].ParentProcessId -ne [int]$qaContext.app_pid', '$script:qaOverlayExpect = New-QaOverlayExpect ([uint32]$qaContext.app_pid) $script:qaDisplayBaseline.monitor_bounds']) assert.ok(template.includes(k), k);
  for (const [label, text] of [['checker', checker], ['runner delta', runner.slice(runner.indexOf('function Write-QaAdmissionContext('), runner.indexOf('function Assert-QaSurfaceAdmission('))]]) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      assert.equal(/^\s+-(or|and|xor|band|bor|bxor|eq|ne|ceq|cne|gt|ge|lt|le|match|cmatch|notmatch|like|is|isnot|contains|notcontains|in|notin|f|replace|split|join)\b/i.test(l), false, `${label} line ${i + 1}: ${l.trim().slice(0, 60)}`);
      if (/^\s+-not\b/.test(l)) assert.match(lines[i - 1].trimEnd(), /(-or|-and|\()$/, `${label} line ${i + 1}`);
    });
  }
  assert.ok(template.includes("$idOk = ($d.id -is [string] -and $d.id -cmatch '^[0-9]{1,20}\\z') -or (Test-QaCheckerCount $d.id 0)"));
});
test('F3 configuration and runner delta: the frozen checker and Lead timings; LC_SOURCE_ADMISSION only for the product launch; the context after the launch is recorded; the one predicate in the runner point checks', () => {
  const c = JSON.parse(base.payload['admission-live.json']);
  assert.deepEqual(Object.keys(c), ['format', 'checker', 'ready_ms', 'decision_ms']); assert.deepEqual(Object.keys(c.checker), ['command', 'args']);
  assert.deepEqual([c.format, c.ready_ms, c.decision_ms], ['lc-windows-source-admission-config/v1', 10000, 5000]); assert.deepEqual(ADMISSION_TIMING, { ready_ms: 10000, decision_ms: 5000 });
  assert.equal(c.checker.command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.ok(c.checker.args.length <= 32 && c.checker.args.every(a => typeof a === 'string' && a.length <= 4096 && !/[\0\r\n]/.test(a)));
  const w = base.manifest.work.replace('/mnt/c/', 'C:\\').replaceAll('/', '\\');
  assert.deepEqual(c.checker.args, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', `${w}\\admission-checker.ps1`, '-Context', `${w}\\link\\admission-context.json`, '-Log', `${w}\\out\\admission-checker.jsonl`]);
  assert.deepEqual(linkNames, ['sub-live.json', 'admission-live.json']);
  const launches = steps.filter(s => s.launchApp);
  assert.equal(launches.length, 1); assert.deepEqual([launches[0].sub, launches[0].admission], ['live', 'live']);
  const s0 = runner.indexOf('function Start-App('), start = runner.slice(s0, runner.indexOf('\n}\n', s0) + 2);
  const tryLine = start.split('\n').find(l => l.startsWith('  try { Assert-QaSurfaceAdmission'));
  const order = ["Assert-QaSurfaceAdmission 'before_product_launch'", '$env:LC_SOURCE_ADMISSION = $admissionFile', 'Start-Process'].map(k => tryLine.indexOf(k));
  assert.ok(order.every(i => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), String(order));
  assert.equal(tryLine.includes('Write-QaAdmissionContext'), false);
  assert.ok(start.split('\n').find(l => l.startsWith('  finally {')).includes('Remove-Item Env:\\LC_SOURCE_ADMISSION'));
  // The context (naming the launched product) once the app is recorded, so a failed write leaves it owned and recorded.
  const pids = start.indexOf("app-pids.txt"), ctx = start.indexOf("if ($admissionFile) { Write-QaAdmissionContext (Join-Path $LinkDir 'admission-context.json')");
  assert.ok(pids > 0 && ctx > pids && start.indexOf('$results.processes[$key] = ') < ctx);
  assert.ok(runner.includes("foreach ($k in @('LC_SUBSCRIPTION_CONNECTOR', 'LC_DEV_CAPTURE_HOST', 'LC_SOURCE_ADMISSION', 'ELECTRON_RUN_AS_NODE'))"));
  assert.equal((runner.match(/\$env:LC_SOURCE_ADMISSION = /g) ?? []).length, 1);
  const c0 = runner.indexOf('function Write-QaAdmissionContext('), contextFn = runner.slice(c0, runner.indexOf('\n}\n', c0));
  assert.ok(contextFn.includes('[System.IO.FileMode]::CreateNew') && contextFn.includes("format = 'lc-qa-admission-context/2'"));
  for (const k of ['edge_pid', 'edge_start_ticks', 'token', 'handle', 'surface_url', 'edge_port', 'display_signature', 'app_pid', 'app_start_ticks']) assert.ok(contextFn.includes(`${k} = `), k);
  assert.ok(contextFn.includes('app_start_ticks = $script:app.StartTime.Ticks.ToString()') && contextFn.includes("if (-not $script:app -or $script:app.HasExited) { throw"));   // native creation ticks, not a JS time
  // The runner's own point consumers apply the one predicate with the binding main and the checker agree on.
  assert.ok(runner.includes('      $record.owned = (Test-QaPointAdmitted $root $window ([int]$point[0]) ([int]$point[1]) $script:qaRunnerOverlayBinding $record)\n'));
  assert.ok(runner.includes('          if ($(if ($null -ne $script:qaRunnerOverlayBinding) { -not (Test-QaPointAdmitted ([QaWin]::RootAt([int]$pt[0], [int]$pt[1])) $h ([int]$pt[0]) ([int]$pt[1]) $script:qaRunnerOverlayBinding $entry) } else { $at -ne $owner })) { $other += '));   // every final point when bound (F3-B)
  const ep = runner.slice(runner.indexOf('function Assert-QaEdgePoints('), runner.indexOf('\n}\n', runner.indexOf('function Assert-QaEdgePoints(')));
  assert.ok(ep.indexOf("$overlayFault = Get-QaOverlayStateFault $script:qaRunnerOverlayBinding") > ep.indexOf('$last = Assert-QaNormalEdge $window'));   // after the final Edge re-resolution
  assert.ok(runner.includes('        $script:qaRunnerOverlayBinding = $null\n        if ($script:app -and -not $script:app.HasExited) { $script:qaRunnerOverlayBinding = Get-QaRunnerOverlayBinding }\n        Assert-QaEdgePoints $entry $h @($step.points)\n'));
  const g0 = runner.indexOf('function Get-QaRunnerOverlayBinding {'), bind = runner.slice(g0, runner.indexOf('\n}\n', g0));
  for (const k of ['s && s.source_admission ? s.source_admission : null', "if ($null -eq $state -or $state.active -ne $true) { return $null }", "Join-Path $OutDir 'admission-checker.jsonl'",
    "$_.phase -ceq 'arm' -and $_.verdict -ceq 'allow'", 'if ($arms.Count -ne 1) { throw', '[string]$arm.capture_id -cne [string]$state.capture_id', '[string]$arm.overlay.hwnd -cne [string]$state.overlay.hwnd',
    'New-QaOverlayBinding $state.overlay ([uint32]$script:app.Id) $script:app.StartTime.Ticks $script:app']) assert.ok(bind.includes(k), k);
  assert.equal(/Find\(|title -c?eq|OwnedWindows/.test(bind), false);                                                   // no title search: main's binding, the checker's arm
  // The display the product listed, recorded before Start (the ledger compares the checker's arm with it).
  const choiceAt = idx(s => s.as === 'display_choice'); assert.ok(choiceAt > 0 && choiceAt < idx(s => 'captureStart' in s)); assert.match(evalOf(steps[choiceAt]), /lc\.listDisplays\(\)/);
  assert.equal(/thumbnail/.test(evalOf(steps[choiceAt])), false);
  assert.throws(() => applyAdmissionDelta(runner), /delta refused/);
  assert.deepEqual(names.filter(n => base.manifest.files[n]).length, names.length);
});
test('F3 ledger: every possibly sent request needs an admitted send for its exact PNG naming an acquisition admitted before and after; a deny, a gap or an unrecorded send fails', () => {
  const h = happy(), l = ledgerOf(h);
  const good = admitted(l, checkerLog(l));
  assert.equal(good.all_bound, true, JSON.stringify(good.requests)); assert.deepEqual(good.requests.map(r => r.bound), [true, true, true, null]);
  const log = () => structuredClone(checkerLog(l));
  const fails = (lines, why) => { const r = admitted(l, lines); assert.equal(r.all_bound, false, String(why)); if (why) assert.match(JSON.stringify(r), why); };
  fails(log().slice(1), null);                                                                                          // no ready record
  { const x = log(); Object.assign(x[1], { verdict: 'deny', reason: 'x' }); fails(x, null); }                          // arm denied
  fails(checkerLog(l, { skip: ['sel.2'] }), /no checker send decision/);
  { const x = log(); x.find(d => d.request_id === 'sel.1').image_sha256 = 'f'.repeat(64); fails(x, /another image/); }
  { const x = log(); x.find(d => d.request_id === 'sel.1').raw_sha256 = '0'.repeat(64); fails(x, /no admitted acquisition/); }
  { const x = log(); const k = x.findIndex(d => d.request_id === 'sel.1'); x.splice(k - 2, 1); fails(x, /no admitted check before/); }
  { const x = log(); x.find(d => d.request_id === 'sel.2').admission.accepted = false; fails(x, /not admitted/); }
  { const x = log(); const k = x.findIndex(d => d.request_id === 'sel.1'); [x[k - 1], x[k]] = [x[k], x[k - 1]]; fails(x, /no admitted acquisition/); }
  { const x = log(); x.splice(x.length - 1, 0, { ...x.at(-2), seq: 99, request_id: 'sel.unknown' }); fails(x, /"unrecorded_admitted_sends":\[99\]/); }   // (before QA's end of input)
  { const x = log(); x.splice(3, 0, { ...x[2], seq: 2.5 }); fails(x, null); }                                        // sequence not whole/increasing
  { const x = log(); Object.assign(x[3], { verdict: 'deny', reason: 'source admission refused: owned surface lost' }); fails(x, null); }
  { const x = log(); x.splice(2, 0, { ...x[2], seq: 1.5, sample_seq: 99, verdict: 'deny', reason: 'x' }); x.forEach((d, i) => { if (d.event === 'decision') d.seq = i; });   // a deny no binding needs, allows after it
    fails(x, null); }
  const f = happy(); f.asks[0].requests[2].submission = 'submitted'; f.liveLines.at(-1).submission = 'submitted'; f.receipts['sel.3'].submission = 'acknowledged';
  const lf = ledgerOf(f);
  assert.equal(admitted(lf, checkerLog(l)).all_bound, false); assert.equal(admitted(lf, checkerLog(lf)).all_bound, true);
  const noRequest = buildLedger({ steps, results: ranTo(stepIndex('action3_submit')), liveLines: look('live-1.look.1', 'a1'), asks: [{ requests: [entry('sel.1', 'focus')] }], receipts: {} });
  assert.equal(admitted(noRequest, checkerLog(noRequest)).all_bound, false);
  const src = readFileSync(new URL('qa_run_live_candidate.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("regularRead(join(candidate.work, 'out', 'admission-checker.jsonl'))") && src.includes("report.source_admission = sourceAdmission(report.ledger, checkerLines, read('display_choice'), mainAdmission);"));
  // Main's own admission record must tell the same decisions (Web 48c20c4): its allows are QA allows, QA's allowed sends are its allows, no violation.
  const good2 = log(), cap = '0123456789abcdef', mainOf = (lines, edit) => { const m = mainLines(lines); edit(m); return { [cap]: m }; };
  assert.deepEqual([admitted(l, good2).main_record_agrees, admitted(l, good2).checker_released], [true, true]);
  assert.equal(admitted(l, good2, choice, null).all_bound, false);                                                    // no main record: unknown
  assert.equal(admitted(l, good2, choice, {}).all_bound, false);
  assert.equal(admitted(l, good2, choice, { fedcba9876543210: mainLines(good2) }).all_bound, false);                   // another capture's folder only
  assert.equal(admitted(l, good2, choice, { ...mainFrom(good2), fedcba9876543210: mainLines(good2) }).all_bound, false);   // and a second capture's record
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.push({ kind: 'violation', reason: 'a late answer' }))).all_bound, false);
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.splice(m.findIndex(d => d.phase === 'send'), 0, { ...m.find(d => d.phase === 'send'), request_id: 'sel.never', image_sha256: 'e'.repeat(64) }))).all_bound, false);   // main allowed what QA never did
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.splice(m.findIndex(d => d.phase === 'send' && d.request_id === 'sel.2'), 1))).all_bound, false);   // a QA send main did not record
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.push({ kind: 'note' }))).all_bound, false);           // an unknown record kind
  // The complete trace, in both directions (Lead coverage decision): every phase, in order and number.
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.splice(0, m.length - 1, ...m.filter(d => d.phase === 'send')))).all_bound, false);   // main sends only
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.splice(1, 1))).all_bound, false);                       // a pre_acquire missing in main
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => m.splice(1, 0, { ...m[1] }))).all_bound, false);          // a duplicated record
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => { [m[1], m[2]] = [m[2], m[1]]; })).all_bound, false);      // out of order
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => Object.assign(m.find(d => d.phase === 'send'), { denied: true, reason: 'synthetic refusal' }))).all_bound, false);   // Support F3-D
  assert.equal(admitted(l, good2, choice, mainOf(good2, m => Object.assign(m.find(d => d.phase === 'post_acquire'), { allowed: false, denied: true, reason: 'x' }))).all_bound, false);
  // F3-C: one capture throughout; no cross-capture joining.
  { const x = log(); x.find(d => d.phase === 'post_acquire').capture_id = 'fedcba9876543210'; assert.equal(admitted(l, x, choice, mainFrom(log())).all_bound, false); assert.equal(admitted(l, x).one_capture, false); }
  // The checker's lifecycle: one clean, self-observed exit and QA's log ending after every decision.
  for (const edit of [m => m.pop(), m => Object.assign(m.at(-1), { exit_seen: false }), m => Object.assign(m.at(-1), { killed: true }), m => Object.assign(m.at(-1), { code: 1 }),
    m => Object.assign(m.at(-1), { signal: 'SIGTERM' }), m => m.push({ ...m.at(-1) })]) assert.equal(admitted(l, good2, choice, mainOf(good2, edit)).checker_released, false);
  assert.equal(admitted(l, good2.slice(0, -1)).checker_released, false);                                                // no end of input in QA's log
  assert.equal(admitted(l, [...good2.slice(0, -1), { event: 'eof', requests: 1 }]).checker_released, false);
  assert.ok(src.includes("^captures\\/[0-9a-f]+\\/(live\\.jsonl|admission\\.jsonl|asks"));
  // The arm names the display the product listed before Start: the decimal string, or the same safe integer; nothing else.
  assert.equal(admitted(l, checkerLog(l)).display_matches, true);
  for (const [d, ok] of [[{ ...armDisplay, id: 3071609112 }, true], [{ ...armDisplay, id: '3071609113' }, false], [{ ...armDisplay, id: 3071609112.5 }, false], [{ ...armDisplay, id: null }, false],
    [{ ...armDisplay, id: 2 ** 53 }, false], [{ ...armDisplay, scale_factor: 1.5 }, false], [{ ...armDisplay, bounds: { ...armDisplay.bounds, width: 1279 } }, false]]) {
    const x = log(); x[1].display = d; assert.equal(admitted(l, x).all_bound, ok, JSON.stringify(d));
  }
  assert.equal(admitted(l, checkerLog(l), null).all_bound, false);                                                     // no recorded display choice
});

test('F3 overlay predicate: the pure functions are cut unchanged into the prepared fixture check; every refusal has a negative fixture; read-only native type (not executed)', () => {
  const predicate = overlayPredicate(), fixtures = JSON.parse(readFileSync(new URL('qa_overlay_fixtures.json', import.meta.url), 'utf8'));
  const check = overlayFixtureCheck();
  const cut = name => { const at = predicate.indexOf(`function ${name}(`); return predicate.slice(at, predicate.indexOf('\n}\n', at) + 3); };
  for (const name of OVERLAY_PURE) assert.ok(check.includes(cut(name)), name);
  const code = check.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
  assert.equal(/Add-Type|\[Qa\w+\]::|Get-CimInstance|Get-Process|Start-Process/.test(code), false);
  assert.ok(check.includes('if ($failed -gt 0) { exit 1 }'));                                                          // a failing case fails the check
  const reasons = fn => [...cut(fn).matchAll(/return \(?'([^']+)'/g)].map(m => m[1]);
  const cases = { 'Get-QaOverlayBindingFault': fixtures.binding_cases, 'Get-QaOverlayFault': fixtures.overlay_cases, 'Get-QaStackFault': fixtures.stack_cases, 'Get-QaNormalTopFault': fixtures.normal_top_cases };
  for (const [fn, list] of Object.entries(cases)) {
    for (const r of reasons(fn)) assert.ok(list.some(c => typeof c.fault === 'string' && c.fault.startsWith(r)), `${fn}: a negative fixture for '${r}'`);
    assert.ok(list.some(c => c.fault === null), `${fn}: a passing fixture`);
    for (const c of list) assert.ok(c.fault === null || reasons(fn).some(r => c.fault.startsWith(r)), `${fn}: ${c.name}`);
  }
  assert.deepEqual(fixtures.expect, { owner: 126156, class: 'Chrome_WidgetWin_1', title: 'Learning Companion overlay', bounds: '0,0,2560,1600' });   // the diagnostic's recorded overlay facts
  assert.match(fixtures.status, /NOT EXECUTED/);
  // The pure rules themselves (each fact the Lead named is checked).
  const fault = cut('Get-QaOverlayFault');
  for (const k of ['$f.Owner -ne $expect.owner', '$f.Class -cne $expect.class -or $f.Title -cne $expect.title', '-not $f.Visible -or $f.Minimized', '-not $f.Topmost', "(@($f.Bounds) -join ',') -cne $expect.bounds", '$f.Affinity -ne 17', '$f.Cloaked -ne 0']) assert.ok(fault.includes(k), k);
  const binding = cut('Get-QaOverlayBindingFault');
  for (const k of ["$named.hwnd -cmatch '^[1-9][0-9]{0,19}\\z'", '$named.pid -ne $appPid', '$facts.Owner -ne $appPid', '$facts.Class -cne $expect.class -or $facts.Title -cne $expect.title']) assert.ok(binding.includes(k), k);
  // The native type: read-only entry points, the owner read first and last, error-checked z-order steps, bounded walks.
  const type = predicate.slice(predicate.indexOf('public static class QaOverlayNative {'), predicate.indexOf("'@"));
  assert.deepEqual([...type.matchAll(/extern \w+ (\w+)\(/g)].map(m => m[1]).sort(),
    ['DwmGetWindowAttribute', 'GetClassName', 'GetTopWindow', 'GetWindow', 'GetWindowDisplayAffinity', 'GetWindowLongPtr', 'GetWindowRect', 'GetWindowText', 'GetWindowTextLength', 'GetWindowThreadProcessId', 'IsIconic', 'IsWindowVisible', 'SetLastError', 'SetThreadDpiAwarenessContext']);
  for (const k of ['IntPtr h = GetTopWindow(IntPtr.Zero);', 'if (h == target) return found.ToArray();', "throw new InvalidOperationException(\"the admitted window is not in the z-order\")", 'i < 4096', 'EntryPoint = "GetClassNameW"', 'EntryPoint = "GetWindowTextW"', 'EntryPoint = "GetWindowTextLengthW"', 'EntryPoint = "GetWindowLongPtrW"', '[DllImport("dwmapi.dll")]',
    'if (pid != owner) return f;', 'again != pid) throw', 'h = Step(h, 2);', 'h = Step(h, 3);', 'if (next == IntPtr.Zero && Marshal.GetLastWin32Error() != 0) throw', 'DwmGetWindowAttribute(h, 14, out value, 4) != 0) throw',
    '(ex.ToInt64() & 8) != 0', 'if (!GetWindowDisplayAffinity(h, out affinity)) throw', 'if (h == IntPtr.Zero || TopmostOf(h)) return', 'i < 1024']) assert.ok(type.includes(k), k);
  // The binding is frozen: passage and foreground take only the bound HWND, never a found one.
  for (const k of ['if ($null -eq $binding) { return ($root -eq $edge) }', "if ($root -ne $edge -and $root -ne $binding.hwnd) { $fault = 'a window other than the bound overlay covers the surface' }",
    'if ($null -eq $fault) { $fault = Get-QaOverlayStateFault $binding }', '[QaOverlayNative]::StackAbove($edge, $x, $y)', 'if ($fg -ne $binding.hwnd) { return $false }', '[QaOverlayNative]::AboveInNormalBand($edge)']) assert.ok(predicate.includes(k), k);
  // The composition: the stack fault decides a point, exactly the bound overlay, and the normal-band top decides the foreground.
  const point = cut('Test-QaPointAdmitted');
  assert.ok(point.includes("      $expected = '{0}/{1}/{2}' -f $binding.hwnd_text, $binding.pid, $binding.expect.class"));
  assert.ok(point.includes('      $fault = Get-QaStackFault ([string[]]@($stack | ForEach-Object { Get-QaStackEntry $_ })) $expected'));   // handle, owner and class, not the handle alone (F3-A)
  assert.equal((predicate.match(/if \(GetWindowThreadProcessId\(h, out pid\) == 0 \|\| pid == 0\) throw/g) ?? []).length, 2);   // a failed or zero owner read refuses in both walks
  assert.ok(cut('Get-QaStackFault').includes("if (-not $overlay -or @($above).Count -ne 1 -or $above[0] -cne $overlay) {"));
  assert.ok(cut('Test-QaOverlayForeground').includes('      $fault = Get-QaNormalTopFault $above.Window.ToInt64().ToString()'));
  assert.ok(point.indexOf("if ($null -ne $fault) { $entry.overlay_refused = Get-QaOverlayReason $fault; return $false }") > point.indexOf('$fault = Get-QaStackFault'));
  // The frozen launch identity is checked at binding and at every use (native creation ticks, the exact process).
  assert.ok(cut('New-QaOverlayBinding').includes('$appProcess.HasExited -or $appProcess.StartTime.Ticks -ne $appStartTicks -or [uint32]$appProcess.Id -ne $appPid'));
  assert.ok(cut('Get-QaOverlayStateFault').includes('$binding.process.HasExited -or $binding.process.StartTime.Ticks -ne $binding.start_ticks'));
  assert.ok(cut('Get-QaOverlayStateFault').includes('[QaOverlayNative]::Read($binding.hwnd, [uint32]$binding.pid)'));
  assert.equal(/EnumWindows|OwnedWindows|Find\(|Beneath/.test(predicate.slice(predicate.indexOf("'@\n"))), false);
});

// ---- Support review 5083814 (R1-R5): its exact controls and negative witnesses, with session identities and the display ----
function supportFixture() {
  const H = 'a'.repeat(64), A = 'a'.repeat(32), json = JSON.stringify;
  const stepsF = [{ as: 'live_policy' }, { stroke: [] }, { as: 'action3_submit' }, { as: 'action4_submit' }];
  const results = { steps: stepsF.map((_, i) => ({ i: i + 1, ok: true })), values: {
    action1: json({ used: 1, unwritten: 0 }), action2: json({ used: 2, unwritten: 0 }), action3: json({ used: 3, unwritten: 0 }),
    action4_after: json({ used: 3, unwritten: 0 }), action4_stop: json({ out_at_stop: 1 }), action3_card: json({ answer: 'prior answer' }), action4_card: json({ answer_hidden: true, answer: '' }) } };
  const liveLines = [{ kind: 'started', session_id: 'live-1', used: 0 }, { kind: 'look', session_id: 'live-1', request_id: 'look', image: { sha256: H } },
    { kind: 'looked', session_id: 'live-1', request_id: 'look', text: 'description', used: 1 }, { kind: 'ended', session_id: 'live-1', reason: 'stopped by you', used: 3 },
    { kind: 'settled', session_id: 'live-1', request_id: 'q3', submission: 'not_submitted', used: 3 }];
  const requests = [1, 2, 3].map(n => ({ request_id: `q${n}`, trigger: n === 1 ? 'focus' : 'text_followup', live_session_id: 'live-1', submitted_at: `2026-10-09T00:00:0${n}Z`,
    question: 'Explain the cards', assistance: 'hint', asked_as: 'silent', frame: { image: { sha256: H } }, submission: n === 3 ? 'not_submitted' : 'submitted',
    outcome: { status: n === 3 ? 'cancelled' : 'answered' }, shown: n !== 3, presentation: n === 3 ? undefined : 'shown' }));
  const receipts = Object.fromEntries(['look', 'q1', 'q2', 'q3'].map((request_id, i) => [request_id, { request_id, input_types: ['text', 'image'], text_bytes: 17, text_sha256: H, image_bytes: 100, image_sha256: H,
    submission: i === 3 ? 'not_submitted' : 'acknowledged', terminal_status: i === 3 ? null : 'completed', outcome: i === 3 ? 'not_submitted' : 'completed', produced_item_types: i === 3 ? [] : ['userMessage', 'agentMessage'],
    thread_start_count: Math.min(i + 1, 3), turn_start_count: Math.min(i + 1, 3), actual_model: 'fixture-model', thread_id: null, turn_id: null, format: 'lc-subscription-ask-receipt/1',
    codex_executable: '/fixture/codex', codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true, __launch: A }]));
  const checker = [{ event: 'ready' }];
  const decision = fields => ({ event: 'decision', capture_id: '0123456789abcdef', seq: checker.length, verdict: 'allow', reason: null, admission: { accepted: true, at: '2026-10-09T00:00:00Z' }, ...fields });
  checker.push(decision({ phase: 'arm', display: structuredClone(armDisplay) }));
  for (const [i, request_id] of ['look', 'q1', 'q2'].entries()) {
    const frame = { sample_seq: i + 1, frame_seq: i + 1, raw_sha256: H, raw_size: { width: 10, height: 10 } };
    checker.push(decision({ phase: 'pre_acquire', sample_seq: i + 1 }));
    checker.push(decision({ phase: 'post_acquire', ...frame }));
    checker.push(decision({ phase: 'send', ...frame, request_id, image_sha256: H }));
  }
  checker.push({ event: 'eof', requests: checker.length - 1 });
  return { steps: stepsF, results, liveLines, asks: [{ requests }], receipts, codexSha256: CONNECTOR.codex_sha256, checker };
}
const supportReport = f => { const ledger = buildLedger(f), fence = fenceVerdict(ledger, f.liveLines, f.results.values);
  return { launcher: { status: 0 }, steps_ok: true, collect_errors: [], owned_launch_cleanup_confirmed: true, connector_left_running: [], connector_watch: { state: 'released', descendants: 1 },
    ledger, fence, source_admission: sourceAdmission(ledger, f.checker, choice, mainFrom(f.checker)), evidence: { leaks_in_questions: [] } }; };
test('R1-R3 (Support 5083814): its two controls pass; an unclassified request, unexplained or inconsistent turns, and an ignored or missing phase all fail', () => {
  const judged = f => wrapper.judgeMechanics(supportReport(f));
  assert.equal(judged(supportFixture()).passed, true, JSON.stringify(judged(supportFixture()).mechanics));                                  // control: one launch, cumulative 1,2,3,3
  const two = supportFixture(); for (const [rid, n] of [['q1', 1], ['q2', 2], ['q3', 2]]) Object.assign(two.receipts[rid], { __launch: 'b'.repeat(32), turn_start_count: n });
  assert.equal(judged(two).passed, true); assert.equal(supportReport(two).ledger.provider_turns, 3);                                      // control: two launches 1 + 2
  // R1: an extra request without a known trigger is an extra action and the records are incomplete.
  const extra = supportFixture(); extra.asks[0].requests.push({ request_id: 'extra-without-trigger', submission: 'unknown', outcome: { status: 'uncertain' } });
  const er = supportReport(extra); assert.deepEqual([er.ledger.records_complete, er.ledger.extra_requests, er.ledger.attempts_used], [false, ['extra-without-trigger'], 5]); assert.equal(judged(extra).passed, false);
  const orphan = supportFixture(); orphan.liveLines.push({ kind: 'settled', session_id: 'live-1', request_id: 'never-asked', submission: 'unknown' });
  assert.deepEqual(supportReport(orphan).ledger.extra_requests, ['never-asked']); assert.equal(judged(orphan).passed, false);
  const kind = supportFixture(); kind.liveLines.push({ kind: 'looked_twice', session_id: 'live-1' });
  assert.equal(supportReport(kind).ledger.records_complete, false); assert.equal(judged(kind).passed, false);
  const noTrigger = supportFixture(); noTrigger.asks[0].requests.push({ submission: 'unknown' });                                         // not even an id: still an extra action
  assert.deepEqual(supportReport(noTrigger).ledger.extra_requests, ['unidentified-request-1']);
  // R2: a fourth published turn cannot hide in a request proven unsent; a launch history must explain itself.
  const hidden = supportFixture(); hidden.receipts.q2.turn_start_count = 4; hidden.receipts.q3.turn_start_count = 4;
  assert.equal(supportReport(hidden).ledger.turns_consistent, false); assert.equal(judged(hidden).passed, false);
  const mixed = supportFixture(); mixed.receipts.q2.turn_start_count = 2; Object.assign(mixed.receipts.q3, { __launch: 'b'.repeat(32), turn_start_count: 1 });
  const mr = supportReport(mixed).ledger; assert.deepEqual(mr.launch_histories.map(h => h.consistent), [false, false]); assert.equal(judged(mixed).passed, false);
  const repeated = supportFixture(); repeated.receipts.look.turn_start_count = 3; repeated.receipts.q1.turn_start_count = 3;                // three sent with one count: not three turns
  assert.equal(supportReport(repeated).ledger.launch_histories[0].consistent, false); assert.equal(judged(repeated).passed, false);
  const zero = supportFixture(); zero.receipts.look.turn_start_count = 0;                                                              // a published turn counts at least one
  assert.equal(supportReport(zero).ledger.launch_histories[0].consistent, false);
  // Turns: never above four, and never above the actions that may have been sent (a receipt cannot explain a request the
  // app records as proven unsent).
  const five = supportFixture(); five.asks[0].requests.push({ ...five.asks[0].requests[1], request_id: 'q9', submitted_at: '2026-10-09T00:00:09Z' });
  five.receipts.q3 = { ...five.receipts.q3, submission: 'acknowledged', outcome: 'completed', turn_start_count: 4 }; five.receipts.q9 = { ...five.receipts.q2, request_id: 'q9', turn_start_count: 5 };
  five.asks[0].requests[2].submission = 'submitted'; five.liveLines.at(-1).submission = 'submitted';
  const fl = supportReport(five).ledger; assert.deepEqual([fl.launch_histories[0].consistent, fl.provider_turns, fl.turns_consistent], [true, 5, false]);
  const sentButUnsent = supportFixture(); Object.assign(sentButUnsent.receipts.q3, { submission: 'acknowledged', outcome: 'completed', turn_start_count: 4 });   // the app and settlement say unsent
  const sl = supportReport(sentButUnsent).ledger; assert.deepEqual([sl.launch_histories[0].consistent, sl.possibly_sent, sl.turns_consistent], [true, 3, false]);
  const uncertainOk = supportFixture(); Object.assign(uncertainOk.receipts.q3, { submission: 'uncertain', outcome: 'uncertain', turn_start_count: 4 }); uncertainOk.asks[0].requests[2].submission = 'unknown'; uncertainOk.liveLines.at(-1).submission = 'unknown';
  assert.equal(supportReport(uncertainOk).ledger.turns_consistent, true);                                                               // an uncertain publish may explain a turn
  // R3: every settlement counts, and a missing phase is unknown.
  const conflict = supportFixture(); conflict.liveLines.push({ ...conflict.liveLines.at(-1), submission: 'submitted' });
  assert.equal(supportReport(conflict).fence.verdict, 'unknown'); assert.equal(judged(conflict).passed, false);
  const missing = supportFixture(); delete missing.receipts.q3; delete missing.liveLines.at(-1).submission;
  const mf = supportReport(missing).fence; assert.deepEqual([mf.phase, mf.verdict], ['unknown', 'fenced_submission_unknown']); assert.equal(judged(missing).passed, false);
  const otherSession = supportFixture(); otherSession.liveLines.at(-1).session_id = 'live-2';
  assert.equal(supportReport(otherSession).fence.verdict, 'unknown'); assert.equal(judged(otherSession).passed, false);
  const otherEnd = supportFixture(); otherEnd.liveLines.find(x => x.kind === 'ended').session_id = 'live-2';                            // the session's end of another session
  assert.equal(supportReport(otherEnd).fence.verdict, 'unknown');
  const noSession = supportFixture(); delete noSession.asks[0].requests[2].live_session_id;
  assert.equal(supportReport(noSession).fence.phase, 'unknown');
  // A request-bearing live line without a usable request id makes the records incomplete (it cannot vanish).
  for (const line of [{ kind: 'settled', session_id: 'live-1', status: 'uncertain', submission: 'unknown', used: 3, out: 0 }, { kind: 'settled', session_id: 'live-1', request_id: 5, submission: 'unknown' },
    { kind: 'not_looked', session_id: 'live-1', frame_seq: 2, status: 'uncertain', submission: 'unknown' }, { kind: 'looked', session_id: 'live-1', text: 'x' }]) {
    const f = supportFixture(); f.liveLines.push(line);
    assert.equal(supportReport(f).ledger.records_complete, false, JSON.stringify(line)); assert.equal(judged(f).passed, false);
  }
  const unsentNoReceipt = supportFixture(); delete unsentNoReceipt.receipts.q3;                                                        // genuinely unsent, every app record affirms it
  assert.deepEqual([supportReport(unsentNoReceipt).fence.verdict, judged(unsentNoReceipt).passed], ['fenced_before_submission', true]);
  // Support's coupling case stays refused.
  const coupling = supportFixture(); coupling.asks[0].requests[0].submission = 'not_submitted'; coupling.checker = coupling.checker.filter(d => !(d.phase === 'send' && d.request_id === 'q1'));
  assert.equal(judged(coupling).passed, false);
});
test('R4-R5 (Support 5083814): an exited watcher is not ready; the lifecycle must be ordered; receipt values must be of the writer\'s bounded types before copy, and only typed values are published', async () => {
  const startRecord = { event: 'watch_start', root_exists: true, already_there: [], at: '2026-10-09T00:00:00Z' };
  for (const exited of [false, true]) {
    const child = { on(event, callback) { if (exited && event === 'exit') callback(1); } };
    const w = await wrapper.startWatch({ readFileSync: () => JSON.stringify(startRecord) + '\n', writeFileSync: () => {}, existsSync: () => false }, () => child, async () => {}, '/synthetic/output');
    assert.equal(w.ready.ready, !exited, `exited=${exited}`); if (exited) assert.match(w.ready.reason, /exited before the launch/);
  }
  // Right before the launch the watch is read anew: an exit during the synchronous work since readiness is seen.
  const state = { exited: false, error: null }, watch = { state };
  await wrapper.assertWatchRunning(watch);
  setTimeout(() => { state.exited = true; }, 0); for (let t = Date.now(); Date.now() - t < 20;);                       // the exit arrives while synchronous work runs
  await assert.rejects(wrapper.assertWatchRunning(watch), /no longer running/);
  await assert.rejects(wrapper.assertWatchRunning({ state: { exited: false, error: 'spawn python3 ENOENT' } }), /no longer running/);
  const proc = text => ({ readFileSync: p => { if (p !== '/proc/4321/stat') throw Error('unexpected read ' + p); if (text === null) throw Error('ENOENT'); return text; } });
  await wrapper.assertWatchRunning({ state: { exited: false, error: null, pid: 4321 } }, proc('4321 (python3) S 1 2 3'));               // running
  await assert.rejects(wrapper.assertWatchRunning({ state: { exited: false, error: null, pid: 4321 } }, proc('4321 (python3) Z 1 2 3')), /no longer running/);   // a zombie
  await assert.rejects(wrapper.assertWatchRunning({ state: { exited: false, error: null, pid: 4321 } }, proc(null)), /no longer running/);                       // gone
  const src = readFileSync(new URL('qa_run_live_candidate.mjs', import.meta.url), 'utf8'), body = src.slice(src.indexOf('export async function runLiveCandidate('), src.indexOf('export async function startWatch('));
  const at = body.indexOf('await assertWatchRunning(watch, io);'); assert.ok(at > 0 && at < body.indexOf('report.native_attempts = 1;') && body.indexOf('run(psBin, invocation.arguments') > at);
  const io = events => ({ readFileSync: () => events.map(e => JSON.stringify(e)).join('\n') });
  const a = { event: 'appear', pid: 7, start_ticks: 70, role: 'in_root' }, d = { event: 'appear', pid: 8, start_ticks: 80, role: 'descendant' }, x = e => ({ event: 'exit', pid: e.pid, start_ticks: e.start_ticks });
  const end = { event: 'watch_end', remaining: [] };
  assert.equal(wrapper.watchSummary(io([startRecord, a, d, x(d), x(a), end]), 'w', true).state, 'released');                            // control
  for (const [events, why] of [[[startRecord, x(a), a, end], /exit without an earlier appearance/], [[startRecord, a, a, x(a), end], /repeated/], [[startRecord, a, x(a), x(a), end], /exit without/],
    [[startRecord, a, x(a), end, d], /after the end/], [[a, startRecord, x(a), end], /recorded no start first/], [[startRecord, { ...a, start_ticks: null }, x(a), end], /usable identity/], [[startRecord, { ...a, role: 'other' }, x(a), end], /unknown appearance/]]) {
    const r = wrapper.watchSummary(io(events), 'w', true); assert.equal(r.state, 'unknown', String(why)); assert.match(r.note, why);
  }
  // R5: a receipt is read only if every value has the connector writer's bounded type; the projection stays typed.
  const rid = 'synthetic-request', launch = 'a'.repeat(32);
  const good = { request_id: rid, input_types: ['text', 'image'], text_bytes: 10, text_sha256: 'b'.repeat(64), image_bytes: 20, image_sha256: 'c'.repeat(64), submission: 'acknowledged', terminal_status: 'completed',
    outcome: 'completed', produced_item_types: ['userMessage', 'agentMessage'], thread_start_count: 1, turn_start_count: 1, actual_model: 'review-model', thread_id: 'SYNTHETIC_THREAD', turn_id: 'SYNTHETIC_TURN',
    format: 'lc-subscription-ask-receipt/1', codex_executable: '/synthetic/codex', codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true };
  const read = value => { const bytes = Buffer.from(JSON.stringify(value));
    return wrapper.readOwnReceipts({ existsSync: () => true, lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }), realpathSync: p => p, readdirSync: () => [launch], openSync: () => 9,
      fstatSync: () => ({ isFile: () => true, nlink: 1, size: bytes.length }), readFileSync: () => bytes, closeSync: () => {} }, [], [rid], '/synthetic/receipts'); };
  const ok = read(good); assert.deepEqual([ok.errors, ok.raw.length], [[], 1]);
  const clean = wrapper.sanitizeReceipts(ok.receipts)[rid]; assert.equal('thread_id' in clean || 'turn_id' in clean || 'codex_executable' in clean, false);
  for (const [field, value] of [['actual_model', { thread_id: 'SYNTHETIC_NESTED_THREAD', turn_id: 'SYNTHETIC_NESTED_TURN' }], ['input_types', ['text', 'text']], ['input_types', ['video']], ['produced_item_types', [{ a: 1 }]],
    ['text_bytes', -1], ['image_bytes', 8 * 1024 * 1024 + 1], ['text_sha256', 'B'.repeat(64)], ['turn_start_count', 4097], ['turn_start_count', 1.5], ['thread_start_count', true], ['submission', 'sent'],
    ['terminal_status', 'done'], ['outcome', null], ['actual_model', '-bad'], ['thread_id', { id: 1 }], ['turn_id', 'x\u0007'], ['codex_executable', 'relative/codex'], ['codex_version', 'v0.158'], ['explicit_bin_override', 'true']]) {
    const r = read({ ...good, [field]: value });
    assert.deepEqual([r.raw.length, Object.keys(r.receipts).length], [0, 0], `${field}=${JSON.stringify(value)}`); assert.match(r.errors.join(' | '), new RegExp(`receipt's ${field} is not`), field);
  }
  const nullable = read({ ...good, text_bytes: null, text_sha256: null, terminal_status: null, actual_model: null, thread_id: null, turn_id: null }); assert.deepEqual(nullable.errors, []);
  assert.equal(read({ ...good, text_bytes: null, text_sha256: 'b'.repeat(64) }).raw.length, 0);                                          // a digest without its length
  const projected = wrapper.sanitizeReceipts({ [rid]: { ...good, actual_model: { thread_id: 'X' }, produced_item_types: ['a', { b: 1 }] } })[rid];   // defensive projection
  assert.equal('actual_model' in projected || 'produced_item_types' in projected, false);
});
test('Support c2ee58ae (937788d HOLD): its controls pass; a missing Stop-session link, a foreign capture, a contradictory main verdict and a sends-only main record all fail', () => {
  const judged = f => wrapper.judgeMechanics(supportReport(f));
  const control = supportFixture(); assert.equal(judged(control).passed, true, JSON.stringify(judged(control).mechanics));
  assert.deepEqual([supportReport(control).source_admission.checker_released, supportReport(control).source_admission.one_capture], [true, true]);
  // R3-A: the fourth ask's session link missing (its receipt valid): no successful fence.
  const noLink = supportFixture(); delete noLink.asks[0].requests[2].live_session_id;
  assert.deepEqual([supportReport(noLink).fence.session_identity, supportReport(noLink).fence.verdict, judged(noLink).passed], ['unknown', 'unknown', false]);
  // An unknown provider submission stays an honestly fenced unknown when the session linkage is complete.
  const unknownPhase = supportFixture(); Object.assign(unknownPhase.receipts.q3, { submission: 'uncertain', outcome: 'uncertain' }); unknownPhase.asks[0].requests[2].submission = 'unknown'; unknownPhase.liveLines.at(-1).submission = 'unknown';
  assert.deepEqual([supportReport(unknownPhase).fence.session_identity, supportReport(unknownPhase).fence.verdict], ['same', 'fenced_submission_unknown']);
  // F3-C: a decision of another capture is never joined.
  const foreign = supportFixture(); foreign.checker.find(d => d.phase === 'post_acquire').capture_id = 'fedcba9876543210';
  const fr = supportReport(foreign); fr.source_admission = sourceAdmission(fr.ledger, foreign.checker, choice, mainFrom(supportFixture().checker));
  assert.deepEqual([fr.source_admission.one_capture, fr.source_admission.all_bound, wrapper.judgeMechanics(fr).passed], [false, false, false]);
  // F3-D: main's allow with a denial and a reason is contradictory.
  const contra = supportFixture(), cr = supportReport(contra), m = mainFrom(contra.checker);
  Object.assign(m['0123456789abcdef'].find(d => d.phase === 'send'), { denied: true, reason: 'synthetic refusal' });
  cr.source_admission = sourceAdmission(cr.ledger, contra.checker, choice, m);
  assert.deepEqual([cr.source_admission.main_record_agrees, wrapper.judgeMechanics(cr).passed], [false, false]);
  // Lead coverage decision: a main record of the sends only is not the complete trace.
  const sends = supportFixture(), sr = supportReport(sends), ms = mainFrom(sends.checker);
  ms['0123456789abcdef'] = ms['0123456789abcdef'].filter(d => d.phase === 'send' || d.kind === 'checker_end');
  sr.source_admission = sourceAdmission(sr.ledger, sends.checker, choice, ms);
  assert.deepEqual([sr.source_admission.main_record_agrees, wrapper.judgeMechanics(sr).passed], [false, false]);
  // The checker's lifecycle is a mechanical term: an unseen exit is not released.
  const unseen = supportFixture(), ur = supportReport(unseen), mu = mainFrom(unseen.checker);
  Object.assign(mu['0123456789abcdef'].at(-1), { exit_seen: false, code: null, killed: true });
  ur.source_admission = sourceAdmission(ur.ledger, unseen.checker, choice, mu);
  const uj = wrapper.judgeMechanics(ur); assert.deepEqual([uj.mechanics.checker_lifecycle_released, uj.passed], [false, false]);
});
