// Adapted from windows_admission_9c3beab_frame_state.mjs: final pins, new IPC holding facts and expected fixes; added malformed/unknown holding checks.
// Synthetic function-level checks of the final overlay sampler and main admission cache.
// Source functions are unchanged; video, ink, storage and checker decisions are memory fakes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

const root = process.argv[2];
assert.ok(root, 'pass the immutable final-source export');
function source(path, hash) {
  const bytes = readFileSync(join(root, path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  return stripTypeScriptTypes(bytes.toString());
}
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'exact source anchors');
  return text.slice(a, b);
}
const overlay = source('apps/windows/src/renderer/overlay.ts', '39001b3c5deb3c352173f49814b1fabbca0c91e4e044b389dd0a74da56ffb7cd');
const sampleModule = source('apps/windows/src/shared/samples.ts', 'a9851c58e68b09507649fd7b024c73ad304b80e9f237d53c69da153741605946');
const sampler = between(sampleModule, 'export function sampleState(', '\n/** A region').replace('export ', '')
  + between(overlay, 'async function takeSample(', '\nlet sampling');
const rows = [];

for (const arrival of ['before', 'during', 'none']) {
  const samples = [], offers = [], retained = [];
  const s = {
    presented: arrival === 'before' ? 1 : 0, presentedSeen: 0, presentedAt: 0,
    ended: false, PERIOD_MS: 1000, seq: 0, raw: null, video: { videoWidth: 2 }, admission: true,
    grabbedSeq: 0, startsWaiting: 0, prevGrid: null, composed: null, gesture: null,
    using: new Map(), frameShas: new Map(), evidencePending: [], samples, source: { kind: 'synthetic' },
    doc: { id: 'synthetic-ink', ink: { revision: 0, visible: [], strokes: {} } },
    display: { bounds: { width: 2 } }, performance: { now: () => 10 }, TextEncoder,
    lookOwed: () => null, sessionNow: () => 'synthetic-live', now: () => '2026-10-09T00:00:00.000Z',
    createImageBitmap: async () => ({ width: 2, height: 2, close() {} }),
    pixelsSha: async () => 'b'.repeat(64), release() {}, recheckAlignment() {}, noteContextChange() {},
    grid: () => [1], compose: () => ({}), inkMarks: () => ({}),
    considerRetention: sample => { retained.push(sample.state); return true; },
    offerLook: (_held, _kept, newFrame) => offers.push(newFrame), render() {},
    lc: {
      admitFrame: async phase => {
        if (phase === 'pre' && arrival === 'during') s.presented = 1;
        return { ok: true, ticket: 'synthetic-ticket' };
      },
      observationGap() {}, sample() {},
    },
  };
  vm.runInNewContext(sampler + '\nglobalThis.take = takeSample;', s);
  await s.take(0);
  assert.equal(samples.length, 1);
  const actual = samples[0];
  assert.equal(actual.raw.presented_frames, arrival === 'none' ? 0 : 1);
  assert.equal(offers[0], arrival !== 'none');
  assert.equal(actual.state, arrival === 'none' ? 'no_new_frame' : 'fresh');
  rows.push({ name: `stream arrival ${arrival} pre-admission`, kind: arrival === 'during' ? 'fixed_regression' : 'control',
    state: actual.state, offered_stream_new_frame: offers[0], presented_frames: actual.raw.presented_frames,
    retention_input_state: retained[0], required_state: arrival === 'none' ? 'no_new_frame' : 'fresh' });
}

// Main's corrected holding-list lifetime and exact intake gate, all synthetic.
const main = source('apps/windows/src/main/main.ts', '078aa8067ffd5f54a83704158d86ba6de4597d6fd271d3ed090c38fb06ffeb84');
const admission = between(main, 'const sameMembers =', '\nfunction retainFrame(');
function admissionContext() {
  const calls = [];
  const session = { ending: false, retention: { id: 'a'.repeat(16) }, display: { bounds: { width: 2, height: 2 }, scale_factor: 1 },
    admission: { checker: { failure: null, decide: async ask => { calls.push(ask.phase); return { ok: true, ms: 0 }; } }, violation: null, ticket: null, admitted: new Map() } };
  const s = { current: session, randomBytes, HOLDING_MAX: 16,
    isSeq: x => Number.isSafeInteger(x) && x > 0, isObj: x => x !== null && typeof x === 'object' && !Array.isArray(x),
    isHex: (x, n) => typeof x === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(x),
    recordAdmission: () => true, end: () => { session.ending = true; } };
  vm.runInNewContext(admission + '\nglobalThis.review = {admitFrame, sourceOf};', s);
  return { s, session, calls };
}
for (const count of [64, 65]) {
  const { s, session } = admissionContext();
  for (let seq = 1; seq <= count; seq++) {
    const pre = await s.review.admitFrame(session, 'pre', seq, { holding: seq > 1 ? [1] : [] });
    assert.equal(pre.ok, true);
    assert.equal((await s.review.admitFrame(session, 'post', seq, { ticket: pre.ticket, raw_sha256: 'b'.repeat(64), width: 2, height: 2 })).ok, true);
  }
  assert.ok(s.review.sourceOf(session, 1, 'b'.repeat(64), 2, 2));
  assert.equal(session.ending, false);
  assert.equal(session.admission.admitted.size, 2);
  rows.push({ name: `held frame 1 intake after ${count} admissions`, kind: count === 64 ? 'control' : 'fixed_regression', intake_allowed: true, capture_ending: false, retained_admissions: 2 });
  if (count === 65) {
    assert.equal((await s.review.admitFrame(session, 'pre', 66, { holding: [] })).ok, true);
    assert.equal(s.review.sourceOf(session, 1, 'b'.repeat(64), 2, 2), null);
    assert.equal(session.ending, true);
    rows.push({ name: 'explicitly retired frame cannot be used again', kind: 'control', intake_allowed: false, capture_ending: true });
  }
}
for (const [name, facts] of [
  ['missing list', null], ['non-list', { holding: 3 }], ['future identity', { holding: [8] }],
  ['current identity', { holding: [7] }], ['extra member', { holding: [], extra: 1 }],
  ['invalid identity type', { holding: ['1'] }], ['over 16 members', { holding: Array.from({length:17}, (_, i) => i + 1) }],
]) {
  const { s, session, calls } = admissionContext();
  const seq = name === 'over 16 members' ? 100 : 7;
  assert.equal((await s.review.admitFrame(session, 'pre', seq, facts)).ok, false);
  assert.equal(session.ending, true);
  assert.equal(calls.length, 0);
  rows.push({ name, kind: 'control', pre_allowed: false, checker_requests: 0, capture_ending: true });
}
// Earlier is not necessarily admitted. This is the remaining requested unknown-list boundary.
{
  const { s, session, calls } = admissionContext();
  const pre = await s.review.admitFrame(session, 'pre', 7, { holding: [1] });
  assert.equal(pre.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(session.admission.admitted.has(1), false, 'the unknown list does not mint an admission');
  const endingAtPre = session.ending;
  assert.equal(endingAtPre, false);
  assert.equal(s.review.sourceOf(session, 1, 'b'.repeat(64), 2, 2), null);
  assert.equal(session.ending, true, 'actual unknown frame intake still refuses');
  rows.push({ name: 'unadmitted earlier ID accepted in holding', kind: 'counterexample', pre_allowed: true,
    checker_requests: 1, capture_ending_at_pre: endingAtPre, admission_minted: false, unknown_intake_allowed: false,
    requirement: 'Unknown holding identities should refuse before a checker request, not merely at subsequent use.' });
}
assert.equal(rows.length, 14);
console.log(JSON.stringify({ source: '477890829c4afe880a151f3ce151b98b97405414',
  controls: rows.filter(r => r.kind === 'control').length, fixed_regressions: 2, counterexamples: 1, rows }, null, 2));
