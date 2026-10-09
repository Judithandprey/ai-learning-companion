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
const overlay = source('apps/windows/src/renderer/overlay.ts', 'd635549922d8fe6d6d1bf53c53e3a31cc8c07a4f3fdd844ed6ae357bc2f8818f');
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
    frameShas: new Map(), evidencePending: [], samples, source: { kind: 'synthetic' },
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
  assert.equal(actual.state, arrival === 'before' ? 'fresh' : 'no_new_frame');
  rows.push({ name: `stream arrival ${arrival} pre-admission`, kind: arrival === 'during' ? 'counterexample' : 'control',
    state: actual.state, offered_stream_new_frame: offers[0], presented_frames: actual.raw.presented_frames,
    retention_input_state: retained[0], required_state: arrival === 'none' ? 'no_new_frame' : 'fresh' });
}

// Conditional delayed-intake witness only: this does not simulate real encoder latency.
const main = source('apps/windows/src/main/main.ts', 'b180468e648839bf08f8507d60510bc9f8f923d921d11dd1ba40af6dc63c1a18');
const admission = between(main, 'const askOf =', '\nfunction retainFrame(');
for (const count of [64, 65]) {
  const session = { ending: false, retention: { id: 'a'.repeat(16) }, display: { bounds: { width: 2, height: 2 }, scale_factor: 1 },
    admission: { checker: { decide: async () => ({ ok: true, ms: 0 }) }, violation: null, ticket: null, admitted: new Map() } };
  const s = { current: session, randomBytes, ADMITTED_MAX: 64,
    isSeq: x => Number.isSafeInteger(x) && x > 0, isObj: x => x !== null && typeof x === 'object' && !Array.isArray(x),
    isHex: (x, n) => typeof x === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(x),
    recordAdmission: () => true, end: () => { session.ending = true; } };
  vm.runInNewContext(admission + '\nglobalThis.review = {admitFrame, sourceOf};', s);
  for (let seq = 1; seq <= count; seq++) {
    const pre = await s.review.admitFrame(session, 'pre', seq, null);
    assert.equal(pre.ok, true);
    const post = await s.review.admitFrame(session, 'post', seq, { ticket: pre.ticket, raw_sha256: 'b'.repeat(64), width: 2, height: 2 });
    assert.equal(post.ok, true);
  }
  const result = s.review.sourceOf(session, 1, 'b'.repeat(64), 2, 2);
  assert.equal(result !== null, count === 64);
  assert.equal(session.ending, count === 65);
  rows.push({ name: `frame 1 intake after ${count} admitted frames`, kind: count === 64 ? 'control' : 'conditional_counterexample',
    all_frames_previously_admitted: true, intake_allowed: result !== null, capture_ending: session.ending,
    limitation: 'Function-level delayed-intake condition; no actual encoding or native timing was measured.' });
}
assert.equal(rows.length, 5);
console.log(JSON.stringify({ source: '9c3beab5d9bfae4ebd295af5a3db5baf99b4038c', controls: 3, counterexamples: 1, conditional_counterexamples: 1, rows }, null, 2));
