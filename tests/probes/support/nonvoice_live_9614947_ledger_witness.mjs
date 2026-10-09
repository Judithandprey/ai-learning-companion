// Changed-boundary F4/F6 probe. Only synthetic data and exported pure functions; no native or provider calls.
// Run under Node --permission with read access to this script and the exact QA source export only.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.argv[2] ?? '/tmp/support-live-9614947-vdt2ebrh';
const load = name => import(pathToFileURL(`${root}/tests/e2e/windows/${name}`).href);
const { buildLedger, fenceVerdict, sourceAdmission } = await load('qa_live_ledger.mjs');
const { judgeMechanics, interlockProduction } = await load('qa_run_live_candidate.mjs');
const { CONNECTOR } = await load('qa_live_candidate.mjs');
assert.equal(interlockProduction, null); // Preserve the execution refusal; never call its execution path.
const H = 'a'.repeat(64), A = 'a'.repeat(32), B = 'b'.repeat(32), json = JSON.stringify;

function fixture() {
  const steps = [{ as: 'live_policy' }, { stroke: [] }, { as: 'action3_submit' }, { as: 'action4_submit' }];
  const results = { steps: steps.map((_, i) => ({ i: i + 1, ok: true })), values: {
    action1: json({ used: 1, unwritten: 0 }), action2: json({ used: 2, unwritten: 0 }), action3: json({ used: 3, unwritten: 0 }),
    action4_after: json({ used: 3, unwritten: 0 }), action4_stop: json({ out_at_stop: 1 }),
    action3_card: json({ answer: 'prior answer' }), action4_card: json({ answer_hidden: true, answer: '' }),
  } };
  const liveLines = [{ kind: 'started', used: 0 }, { kind: 'look', request_id: 'look', image: { sha256: H } },
    { kind: 'looked', request_id: 'look', text: 'description', used: 1 }, { kind: 'ended', reason: 'stopped by you', used: 3 },
    { kind: 'settled', request_id: 'q3', submission: 'not_submitted', used: 3 }];
  const requests = [1, 2, 3].map(n => ({ request_id: `q${n}`, trigger: n === 1 ? 'focus' : 'text_followup',
    submitted_at: `2026-10-09T00:00:0${n}Z`, question: 'Explain the cards', assistance: 'hint', asked_as: 'silent',
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
  const decision = fields => ({ event: 'decision', seq: checker.length, verdict: 'allow', reason: null,
    admission: { accepted: true, at: '2026-10-09T00:00:00Z' }, ...fields });
  checker.push(decision({ phase: 'arm' }));
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
    source_admission: sourceAdmission(ledger, f.checker), evidence: { leaks_in_questions: [] } };
}
let controls = 0, negativeInputs = 0;
function show(name, f, control = false) {
  const r = report(f), j = judgeMechanics(r);
  if (control) { assert.equal(j.passed, true, name); controls++; } else negativeInputs++;
  console.log(json({ case: name, control, passed: j.passed, records_complete: r.ledger.records_complete,
    attempts: r.ledger.attempts_used, extras: r.ledger.extra_requests, provider_turns: r.ledger.provider_turns,
    sent_receipts: r.ledger.sent_receipts, launches: r.ledger.receipt_launches, fence: r.fence.verdict,
    phases: r.fence.phases_seen, source_bound: r.source_admission.all_bound,
    failed_terms: Object.entries(j.mechanics).filter(([, value]) => !value).map(([key]) => key) }));
}
show('control_one_launch_cumulative_1_2_3_3', fixture(), true);
const two = fixture();
for (const [rid, n] of [['q1', 1], ['q2', 2], ['q3', 2]]) Object.assign(two.receipts[rid], { __launch: B, turn_start_count: n });
show('control_two_launches_maxima_1_plus_2', two, true);

const extra = fixture();
extra.asks[0].requests.push({ request_id: 'extra-without-trigger', submission: 'unknown', outcome: { status: 'uncertain' } });
show('extra_request_without_trigger_omitted', extra);

const conflict = fixture();
conflict.liveLines.push({ ...conflict.liveLines.at(-1), submission: 'submitted' });
show('second_settlement_conflict_ignored', conflict);

const missing = fixture();
delete missing.receipts.q3;
delete missing.liveLines.at(-1).submission;
show('no_receipt_missing_settlement_phase', missing);

const hiddenTurn = fixture();
hiddenTurn.receipts.q2.turn_start_count = 4;
hiddenTurn.receipts.q3.turn_start_count = 4;
show('four_provider_turns_three_sent_one_proven_unsent', hiddenTurn);

const mixed = fixture();
mixed.receipts.q2.turn_start_count = 2;
Object.assign(mixed.receipts.q3, { __launch: B, turn_start_count: 1 });
show('launch_A_three_sent_max2_launch_B_unsent_max1', mixed);

const coupling = fixture();
coupling.asks[0].requests[0].submission = 'not_submitted';
coupling.checker = coupling.checker.filter(d => !(d.phase === 'send' && d.request_id === 'q1'));
show('sent_receipt_app_unsent_missing_source_send', coupling);
assert.equal(controls, 2);
assert.equal(negativeInputs, 6);
console.log(json({ controls, negative_inputs: negativeInputs, interlockProduction }));
