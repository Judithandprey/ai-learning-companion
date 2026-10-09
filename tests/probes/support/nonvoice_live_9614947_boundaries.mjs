// Exact-source, offline boundary review. All watcher/receipt I/O below is in memory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.argv[2];
assert.ok(root, 'pass the immutable QA export');
const base = join(root, 'tests/e2e/windows');
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(readFileSync(join(base, 'qa_run_live_candidate.mjs'))), 'ddbd65f80720f5cb109906e4d01aa3f3dd93c40f2beac8519fa7fd645c83d2cd');
assert.equal(hash(readFileSync(join(base, 'qa_live_candidate.mjs'))), 'acef02e13ded078bc172843a7a1b9a65ac6c0beec38e3f6ac3b073b9d61053a5');
const w = await import(pathToFileURL(join(base, 'qa_run_live_candidate.mjs')));
const { CONNECTOR } = await import(pathToFileURL(join(base, 'qa_live_candidate.mjs')));
const steps = JSON.parse(readFileSync(join(root, 'docs/verification/qa/p0-13-live-52be105/candidate-nonvoice-03/steps.json')));
const observations = [];
const record = (name, kind, facts) => observations.push({ name, kind, ...facts });

// The public/default allocation path stays refused; never call runLiveCandidate or override its gate.
assert.equal(w.interlockProduction, null);
assert.throws(() => w.validateLiveAllocation({}, { production_commit: CONNECTOR.commit }, '', Date.now()), /does not pin a reviewed production/);
record('interim execution gate', 'control', { refused: true });

const accountReady = steps.find(s => s.as === 'account_ready').eval;
const model = 'review-model';
const bucket = over => ({ limit_id: 'codex', normal_model_slug: null, spend_control_reached: false, rate_limit_reached_type: null,
  credits: { has_credits: true, unlimited: false, balance: '100' }, ...over });
const quotaCases = [
  ['unrelated spend bucket plus included exhaustion', [bucket({ normal_model_slug: 'another-model', spend_control_reached: true }), bucket({ rate_limit_reached_type: 'rate_limit_reached' })], true],
  ['applicable spend cannot borrow unrelated credits', [bucket({ spend_control_reached: true, credits: null }), bucket({ normal_model_slug: 'another-model' })], false],
  ['single unnamed applicable workspace restriction', [bucket({ limit_id: null, normal_model_slug: model, rate_limit_reached_type: 'workspace_member_usage_limit_reached' })], false],
  ['unrelated limit restriction', [bucket({ limit_id: 'another-limit', spend_control_reached: true })], true],
];
for (const [name, windows, allowed] of quotaCases) {
  const state = { mode: 'managed', state: 'signed_in', login: 'none', asking: false, model, models: [{ id: model, image_input: true }],
    quota_read_at: 'synthetic', quota: { available: true, ordinary_usage_allowed: false, windows } };
  const result = await vm.runInNewContext(accountReady, { lc: { subState: async () => state }, document: { getElementById: () => ({ disabled: false }) } })
    .then(() => ({ allowed: true }), e => ({ allowed: false, error: e.message }));
  assert.equal(result.allowed, allowed, name);
  record(name, 'control', result);
}

const startRecord = { event: 'watch_start', root_exists: true, already_there: [], at: '2026-10-09T00:00:00Z' };
// Event callbacks run before readiness is read: the fake represents a watcher that exited after writing start.
for (const alreadyExited of [false, true]) {
  const fakeChild = { on(event, callback) { if (alreadyExited && event === 'exit') callback(1); } };
  const io = { readFileSync: () => JSON.stringify(startRecord) + '\n', existsSync: () => false };
  const watch = await w.startWatch(io, () => fakeChild, async () => {}, '/synthetic/output');
  assert.equal(watch.ready.ready, true);
  assert.equal(watch.state.exited, alreadyExited);
  record(alreadyExited ? 'exited watcher is still launch-ready' : 'running watcher readiness control', alreadyExited ? 'counterexample' : 'control',
    { ready: watch.ready.ready, exited: watch.state.exited, required_ready: !alreadyExited });
}
const life = [startRecord,
  { event: 'exit', pid: 7, start_ticks: 70, role: 'in_root' },
  { event: 'appear', pid: 7, start_ticks: 70, role: 'in_root', name: 'python3' },
  { event: 'watch_end', remaining: [] }];
const summary = w.watchSummary({ readFileSync: () => life.map(e => JSON.stringify(e)).join('\n') }, 'synthetic', true);
assert.equal(summary.state, 'released');
record('exit before appearance is accepted as released', 'counterexample', { observed: summary, required_state: 'unknown' });

const receiptRoot = '/synthetic/receipts', launch = 'a'.repeat(32), rid = 'synthetic-request';
const receipt = {
  request_id: rid, input_types: ['text', 'image'], text_bytes: 10, text_sha256: 'b'.repeat(64), image_bytes: 20, image_sha256: 'c'.repeat(64),
  submission: 'acknowledged', terminal_status: 'completed', outcome: 'completed', produced_item_types: ['userMessage', 'agentMessage'],
  thread_start_count: 1, turn_start_count: 1, actual_model: model, thread_id: 'SYNTHETIC_THREAD', turn_id: 'SYNTHETIC_TURN',
  format: 'lc-subscription-ask-receipt/1', codex_executable: '/synthetic/codex', codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true,
};
function readReceipt(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  const io = { existsSync: () => true, lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }), realpathSync: p => p,
    readdirSync: () => [launch], openSync: () => 9, fstatSync: () => ({ isFile: () => true, nlink: 1, size: bytes.length }),
    readFileSync: () => bytes, closeSync: () => {} };
  return w.readOwnReceipts(io, [], [rid], receiptRoot);
}
const good = readReceipt(receipt);
assert.equal(good.errors.length, 0);
assert.equal(good.raw.length, 1);
const sanitized = w.sanitizeReceipts(good.receipts)[rid];
assert.equal('thread_id' in sanitized || 'turn_id' in sanitized || 'codex_executable' in sanitized, false);
record('well-formed receipt projection', 'control', { admitted: true, top_level_private_fields_omitted: true });
const wrongId = readReceipt({ ...receipt, request_id: 'another-request' });
assert.equal(wrongId.raw.length, 0);
assert.equal(wrongId.errors.length, 1);
record('wrong request identity', 'control', { admitted: false });
const malformed = readReceipt({ ...receipt, actual_model: { thread_id: 'SYNTHETIC_NESTED_THREAD', turn_id: 'SYNTHETIC_NESTED_TURN' } });
assert.equal(malformed.errors.length, 0);
const publicValue = w.sanitizeReceipts(malformed.receipts)[rid].actual_model;
assert.equal(publicValue.thread_id, 'SYNTHETIC_NESTED_THREAD');
record('malformed receipt value survives public projection', 'counterexample', { reader_errors: malformed.errors, copied_receipts: malformed.raw.length,
  sanitized_actual_model: publicValue, required: 'Reject malformed field types before admitting/copying; sanitized metadata must remain typed.' });

console.log(JSON.stringify({ source: '9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b',
  scope: 'Synthetic objects only, no native/private-state/provider operation; wrapper execution gate never bypassed.',
  assertions: observations.length, controls: observations.filter(x => x.kind === 'control').length,
  counterexamples: observations.filter(x => x.kind === 'counterexample').length, observations }, null, 2));
