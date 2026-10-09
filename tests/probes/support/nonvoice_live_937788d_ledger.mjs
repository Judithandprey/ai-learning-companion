// Changed-boundary F4/F6 probe. Only synthetic data and exported pure functions; no native or provider calls.
// Run under Node --permission with read access to this script and the exact QA source export only.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.argv[2] ?? '/tmp/support-live-937788d-38tag4s1';
const load = name => import(pathToFileURL(`${root}/tests/e2e/windows/${name}`).href);
for (const [file, pin] of Object.entries({qa_live_ledger: '3558b9bb0da7c7b8e1d39bfb98b440f6a9e631cb2275e02200c02b831b5a12de', qa_run_live_candidate: '3a537fa1df6b1b74311e3146ba7f3ec021d7b64291313d6b2d3504564a68487b'})) assert.equal(createHash('sha256').update(readFileSync(`${root}/tests/e2e/windows/${file}.mjs`)).digest('hex'), pin);
const { buildLedger, fenceVerdict, sourceAdmission } = await load('qa_live_ledger.mjs');
const { judgeMechanics, interlockProduction } = await load('qa_run_live_candidate.mjs');
const { CONNECTOR } = await load('qa_live_candidate.mjs');
assert.equal(interlockProduction, null); // Preserve the execution refusal; never call its execution path.
const choice = { display_id: '3071609112', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 2 };
const mainFrom = lines => lines.filter(d => d.event === 'decision').map(d => ({ kind: 'decision', phase: d.phase, sample_seq: d.sample_seq ?? null, frame_seq: d.frame_seq ?? null, raw_sha256: d.raw_sha256 ?? null, raw_size: d.raw_size ?? null, request_id: d.request_id ?? null, image_sha256: d.image_sha256 ?? null, allowed: d.verdict === 'allow', denied: d.verdict !== 'allow', reason: d.reason ?? null, ms: 1 })).concat([{ kind: 'checker_end', spawned: true, exit_seen: true, code: 0, signal: null, killed: false }]);
const H = 'a'.repeat(64), A = 'a'.repeat(32), B = 'b'.repeat(32), json = JSON.stringify;

function fixture() {
  const steps = [{ as: 'live_policy' }, { stroke: [] }, { as: 'action3_submit' }, { as: 'action4_submit' }];
  const results = { steps: steps.map((_, i) => ({ i: i + 1, ok: true })), values: {
    action1: json({ used: 1, unwritten: 0 }), action2: json({ used: 2, unwritten: 0 }), action3: json({ used: 3, unwritten: 0 }),
    action4_after: json({ used: 3, unwritten: 0 }), action4_stop: json({ out_at_stop: 1 }),
    action3_card: json({ answer: 'prior answer' }), action4_card: json({ answer_hidden: true, answer: '' }),
  } };
  const liveLines = [{ kind: 'started', session_id: 'live-1', used: 0 }, { kind: 'look', session_id: 'live-1', request_id: 'look', image: { sha256: H } },
    { kind: 'looked', session_id: 'live-1', request_id: 'look', text: 'description', used: 1 }, { kind: 'ended', session_id: 'live-1', reason: 'stopped by you', used: 3 },
    { kind: 'settled', session_id: 'live-1', request_id: 'q3', submission: 'not_submitted', used: 3 }];
  const requests = [1, 2, 3].map(n => ({ request_id: `q${n}`, trigger: n === 1 ? 'focus' : 'text_followup',
    live_session_id: 'live-1', submitted_at: `2026-10-09T00:00:0${n}Z`, question: 'Explain the cards', assistance: 'hint', asked_as: 'silent',
    frame: { image: { sha256: H } }, submission: n === 3 ? 'not_submitted' : 'submitted',
    outcome: { status: n === 3 ? 'cancelled' : 'answered' }, shown: n !== 3, presentation: n === 3 ? undefined : 'shown' }));
  const receipts = Object.fromEntries(['look', 'q1', 'q2', 'q3'].map((request_id, i) => [request_id, {
    request_id, input_types: ['text', 'image'], text_bytes: 17, text_sha256: H, image_bytes: 100, image_sha256: H,
    submission: i === 3 ? 'not_submitted' : 'acknowledged', terminal_status: i === 3 ? null : 'completed',
    outcome: i === 3 ? 'not_submitted' : 'completed', produced_item_types: i === 3 ? [] : ['userMessage', 'agentMessage'],
    thread_start_count: Math.min(i + 1, 3), turn_start_count: Math.min(i + 1, 3), actual_model: 'fixture-model',
    thread_id: null, turn_id: null, format: 'lc-subscription-ask-receipt/1', codex_executable: '/fixture/codex',
    codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true, __launch: A,
  }]));
  const checker = [{ event: 'ready' }];
  const decision = fields => ({ event: 'decision', capture_id: '0123456789abcdef', id: checker.length.toString(16).padStart(32, '0'), seq: checker.length, verdict: 'allow', reason: null,
    admission: { accepted: true, at: '2026-10-09T00:00:00Z' }, ...fields });
  checker.push(decision({ phase: 'arm', display: { id: choice.display_id, bounds: choice.bounds, scale_factor: choice.scale_factor }, overlay: {pid: 7, hwnd: '10'} }));
  for (const [i, request_id] of ['look', 'q1', 'q2'].entries()) {
    const frame = { sample_seq: i + 1, frame_seq: i + 1, raw_sha256: H, raw_size: { width: 10, height: 10 } };
    checker.push(decision({ phase: 'pre_acquire', sample_seq: i + 1 }));
    checker.push(decision({ phase: 'post_acquire', ...frame }));
    checker.push(decision({ phase: 'send', ...frame, request_id, image_sha256: H }));
  }
  return { steps, results, liveLines, asks: [{ requests }], receipts, codexSha256: CONNECTOR.codex_sha256, checker };
}
function report(f) {
  const ledger = buildLedger(f), fence = fenceVerdict(ledger, f.liveLines, f.results.values);
  return { launcher: { status: 0 }, steps_ok: true, collect_errors: [], owned_launch_cleanup_confirmed: true,
    connector_left_running: [], connector_watch: { state: 'released', descendants: 1 }, ledger, fence,
    source_admission: sourceAdmission(ledger, f.checker, choice, f.main ?? mainFrom(f.checker)), evidence: { leaks_in_questions: [] } };
}
const rows = [];
function check(name, change, expectation) {
  const f = fixture(); change(f);
  const r = report(f), j = judgeMechanics(r);
  assert.equal(j.passed, expectation !== 'fixed', name);
  rows.push({ name, expectation, mechanical_pass: j.passed, records_complete: r.ledger.records_complete,
    attempts: r.ledger.attempts_used, extras: r.ledger.extra_requests, provider_turns: r.ledger.provider_turns,
    launches: r.ledger.launch_histories, fence: r.fence.verdict, session_identity: r.fence.session_identity,
    phases: r.fence.phases_seen, source_bound: r.source_admission.all_bound,
    main_agrees: r.source_admission.main_record_agrees,
    failed_terms: Object.entries(j.mechanics).filter(([, value]) => !value).map(([key]) => key) });
}
check('one launch cumulative 1,2,3,3', () => {}, 'control');
check('two launches maxima 1+2', f => {
  for (const [rid, n] of [['q1',1],['q2',2],['q3',2]]) Object.assign(f.receipts[rid], {__launch:B,turn_start_count:n});
}, 'control');
check('R1 extra without trigger', f => f.asks[0].requests.push({request_id:'extra-without-trigger',submission:'unknown',outcome:{status:'uncertain'}}), 'fixed');
check('R1 orphan settlement', f => f.liveLines.push({kind:'settled',session_id:'live-1',request_id:'orphan',submission:'unknown'}), 'fixed');
check('R2 extra turn cannot use proven-unsent slot', f => {f.receipts.q2.turn_start_count=4;f.receipts.q3.turn_start_count=4;}, 'fixed');
check('R2 inconsistent separate launches', f => {f.receipts.q2.turn_start_count=2;Object.assign(f.receipts.q3,{__launch:B,turn_start_count:1});}, 'fixed');
check('R3 later conflicting settlement', f => f.liveLines.push({...f.liveLines.at(-1),submission:'submitted'}), 'fixed');
check('R3 missing settlement phase without receipt', f => {delete f.receipts.q3;delete f.liveLines.at(-1).submission;}, 'fixed');
check('R3 different settlement session', f => {f.liveLines.at(-1).session_id='live-2';}, 'fixed');
check('R3 missing ask session with otherwise valid receipt', f => {delete f.asks[0].requests[2].live_session_id;}, 'counterexample');
check('F3 foreign capture on acquisition', f => {f.checker.find(d=>d.phase==='post_acquire').capture_id='fedcba9876543210';}, 'counterexample');
check('F3 explicit contradictory main send verdict', f => {f.main=mainFrom(f.checker); Object.assign(f.main.find(d=>d.phase==='send'),{denied:true,reason:'synthetic refusal'});}, 'counterexample');
check('F3 main sends only (coverage observation)', f => {f.main=mainFrom(f.checker).filter(d=>d.phase==='send');}, 'coverage_observation');
console.log(JSON.stringify({source:'937788ded4e2bff1db8b94dce175a7152e01609d',
 scope:'Independent prior Support fixture, extended only with current required session/display/main-record fields; synthetic objects only. No native/provider call; no allocation override.',
 rows:rows.length,controls:rows.filter(r=>r.expectation==='control').length,
 fixed:rows.filter(r=>r.expectation==='fixed').length,counterexamples:rows.filter(r=>r.expectation==='counterexample').length,
 coverage_observations:rows.filter(r=>r.expectation==='coverage_observation').length,interlockProduction,observations:rows},null,2));
