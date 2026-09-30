// The WindowsFrame 0.2.9 / WindowsFrameBatchRequest 0.2.10 mapping (src/shared/frame-ingress.ts): the committed
// fixtures are exactly what it emits from the retained manifests; facts are carried unchanged; events without an
// image are honest coverage; everything the contracts cannot carry is refused visibly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASES, EVIDENCE, OUT, build } from '../scripts/ingress-fixtures.ts';
import { frameRequest, MappingRefusal, MAX_ORIGINAL_BYTES, readManifest, type IngressPlan, type PlanEntry } from '../src/shared/frame-ingress.ts';

const fixture = (name: string) => JSON.parse(readFileSync(`${OUT}${name}.json`, 'utf8')) as { manifest: string; plan: IngressPlan; unrepresented: string[] };
const manifestOf = (name: string): string => readFileSync(`${EVIDENCE}${fixture(name).manifest}`, 'utf8').replace(/\r\n/g, '\n');
const refused = (fn: () => unknown, why: RegExp): void => assert.throws(fn, (e: unknown) => e instanceof MappingRefusal && why.test(e.message));
/** The native plan with its entries changed. */
const nativeWith = (change: (entries: PlanEntry[]) => PlanEntry[], extra: Partial<IngressPlan> = {}): IngressPlan => {
  const plan = fixture('native').plan;
  return { ...plan, ...extra, entries: change(structuredClone(plan.entries) as PlanEntry[]) };
};
const lineOf = (text: string, n: number): Record<string, unknown> => JSON.parse(text.split('\n')[n - 1]!) as Record<string, unknown>;
const withLine = (text: string, n: number, value: unknown): string => text.split('\n').map((l, i) => (i === n - 1 ? JSON.stringify(value) : l)).join('\n');

test('the committed fixtures are exactly what the mapping emits from the retained manifests', () => {
  for (const o of CASES) {
    const { meta, body } = build(o);
    assert.equal(body, readFileSync(`${OUT}${o.name}.body.json`, 'utf8'), `${o.name} body`);
    assert.deepEqual(JSON.parse(JSON.stringify(meta)), fixture(o.name), `${o.name} plan and unrepresented facts`);
  }
});

test('each retained sample keeps its facts exactly as retained: sample, held and stream counts, rounding, images and composition', () => {
  const text = manifestOf('native');
  const { request } = frameRequest(text, fixture('native').plan);
  const retained = readManifest(text).filter((l) => l.kind === 'retained');
  assert.equal(request.frames.length, retained.length);
  const header = lineOf(text, 1);
  for (const [i, frame] of request.frames.entries()) {
    const r = retained[i]!.value as Record<string, any>;
    const { sample } = frame.profile;
    for (const k of ['sample_seq', 'frame_seq', 'reason', 'deferred_samples_not_retained', 'sampled_at', 'taken_at', 'monotonic_ms', 'state', 'gap_ms', 'presented_frames', 'stream_presented_frames', 'presentation_ms', 'frame_age_ms']) {
      assert.deepEqual((sample as Record<string, unknown>)[k], r[k], `sample ${r['sample_seq']} ${k}`);
    }
    assert.equal(sample.change_from_previous_sample, r['raw']['change_from_previous_sample']);
    assert.deepEqual([frame.raw.width, frame.raw.height, frame.raw.pixels_sha256, frame.raw.native_file, frame.raw.artifact.sha256, frame.raw.artifact.byte_length], [r['raw']['width'], r['raw']['height'], r['raw']['pixels_sha256'], r['raw']['file'], r['raw']['sha256'], r['raw']['bytes']]);
    const c = frame.composed!;
    assert.deepEqual([c.ink_session, c.ink_revision, c.visible_strokes, c.ink_marks, c.transformation, c.image.pixels_sha256, c.image.artifact.sha256], [r['composed']['ink_session'], r['composed']['ink_revision'], r['composed']['visible_strokes'], r['composed']['ink_marks'], r['composed']['transformation'], r['composed']['pixels_sha256'], r['composed']['sha256']]);
    assert.deepEqual(frame.profile.source_at_start, header['source']);
    assert.equal(frame.profile.capture_session, header['capture_session']);
    assert.deepEqual([frame.captured_at, frame.media_position, frame.capture_latency_ms], [null, null, null], 'no capture UTC, playhead or latency is made up');
  }
});

test('identities are the caller\'s, never the native labels or file names', () => {
  const plan = fixture('native').plan;
  const { request } = frameRequest(manifestOf('native'), plan);
  for (const r of request.batch.records) assert.deepEqual(r.source, plan.source);
  for (const f of request.frames) {
    assert.deepEqual([f.device_id, f.session_id, f.stream_id], [plan.device_id, plan.session_id, plan.stream_id]);
    assert.match(f.raw.artifact.artifact_id, /^example-png-/);
  }
  assert.deepEqual(request.batch.records.map((r) => [r.record_id, r.sequence]), plan.entries.map((e) => [e.record_id, e.sequence]), 'in the plan\'s order');
});

test('raw and composed stay apart: one shared original, two identities for the same file, distinct files, and the separate editable ink', () => {
  const { request } = frameRequest(manifestOf('native'), fixture('native').plan);
  const artifactsOf = (seq: number) => request.batch.records.find((r) => r.frame_id === `example-native-frame-${seq}`)!.artifacts;
  assert.equal(artifactsOf(1).length, 1, 'the same file bound once is one original');
  assert.deepEqual(artifactsOf(3).map((a) => a.sha256), [artifactsOf(3)[0]!.sha256, artifactsOf(3)[0]!.sha256], 'the same file under two archive identities is two originals');
  assert.deepEqual(artifactsOf(10).map((a) => a.media_type), ['image/png', 'image/png', 'application/json'], 'raw, composed and the editable ink');
  const f3 = request.frames.find((f) => f.profile.sample.sample_seq === 3)!;
  assert.notEqual(f3.raw.artifact.artifact_id, f3.composed!.image.artifact.artifact_id);
});

test('a raw-only retained sample maps with no composition, and needs no composed binding', () => {
  const text = manifestOf('native');
  const line = lineOf(text, 2);
  const rawOnly = withLine(text, 2, { ...line, composed: null });
  const plan = nativeWith((e) => [{ ...(e[0] as Extract<PlanEntry, { kind: 'frame' }>), composed: null }]);
  assert.equal(frameRequest(rawOnly, plan).request.frames[0]!.composed, null);
  refused(() => frameRequest(rawOnly, nativeWith((e) => [e[0]!])), /no composed image was retained/);
  refused(() => frameRequest(text, plan), /needs its original binding/);
});

test('known gaps keep their measured duration; older lines without one map to null, never inferred', () => {
  const { request } = frameRequest(manifestOf('harness'), fixture('harness').plan);
  const gapFrame = request.frames.find((f) => f.profile.sample.state === 'gap')!;
  assert.equal(gapFrame.profile.sample.gap_ms, 5500);
  const text = manifestOf('native');
  const old = lineOf(text, 2);
  delete old['gap_ms'];
  assert.equal(frameRequest(withLine(text, 2, old), nativeWith((e) => [e[0]!])).request.frames[0]!.profile.sample.gap_ms, null);
  refused(() => frameRequest(withLine(text, 2, { ...old, gap_ms: 12.5 }), nativeWith((e) => [e[0]!])), /gap duration is malformed/);
});

test('events without an image become frameless coverage, with what coverage cannot carry listed', () => {
  const plan = fixture('harness').plan;
  const out = frameRequest(manifestOf('harness'), plan);
  const byLine = new Map(plan.entries.flatMap((e) => (e.kind === 'coverage' ? [[e.line, out.request.batch.records.find((r) => r.record_id === e.record_id)!]] : [])));
  const kinds = readManifest(manifestOf('harness'));
  const expect: Record<string, [string, string[]]> = { gap: ['unknown', ['unknown']], unwritten: ['unknown', ['missing_events']], unfinished: ['partial', ['sample_only']] };
  for (const [line, r] of byLine) {
    const kind = kinds[line - 1]!.kind;
    assert.deepEqual([r.evidence.coverage, r.evidence.limitations], expect[kind], kind);
    assert.deepEqual([r.frame_id, r.artifacts, r.observed_at, r.clock, r.media_position, r.evidence.missing_sequences], [null, [], null, null, null, []], `${kind}: no image, clock or invented history`);
  }
  assert.ok(out.unrepresented.some((n) => /ran 7000 ms late/.test(n)));
  assert.ok(out.unrepresented.some((n) => /frames of samples \[7\].*pixels are lost/.test(n)));
  const native = frameRequest(manifestOf('native'), fixture('native').plan);
  const partial = native.request.batch.records.filter((r) => r.frame_id === null).map((r) => [r.evidence.coverage, r.evidence.limitations]);
  assert.deepEqual(partial, [['partial', ['sample_only']], ['partial', ['sample_only']], ['partial', ['sample_only']]], 'a refusal and a run not retained: observed, not kept');
  assert.ok(native.unrepresented.some((n) => /session ended at .*not a Process record/.test(n)));
});

test('the end is not a record, a retained sample is not coverage, and an ended session is never sent as live', () => {
  const text = manifestOf('native');
  const endLine = readManifest(text).find((l) => l.kind === 'ended')!.line;
  refused(() => frameRequest(text, nativeWith((e) => [{ kind: 'coverage', line: endLine, record_id: 'r', sequence: 1 }])), /end of a session is not a Process record/);
  refused(() => frameRequest(text, nativeWith((e) => [{ kind: 'coverage', line: 2, record_id: 'r', sequence: 1 }])), /mapped as a frame/);
  refused(() => frameRequest(text, nativeWith((e) => e, { delivery_mode: 'live' })), /only be sent as historical/);
  const running = text.split('\n').filter((l) => !l.includes('"kind":"ended"')).join('\n');
  assert.equal(frameRequest(running, nativeWith((e) => e.slice(0, 2), { delivery_mode: 'live' })).request.batch.delivery_mode, 'live', 'while it runs');
});

test('a body over 4 MiB is refused (one retained sample standing for very many deferred samples); nothing is dropped', () => {
  const text = manifestOf('native');
  const line = lineOf(text, 2) as Record<string, any>;
  const many = withLine(text, 2, { ...line, sample_seq: 800_000, frame_seq: 800_000, deferred_samples_not_retained: Array.from({ length: 700_000 }, (_, i) => i + 1) });
  refused(() => frameRequest(many, nativeWith((e) => [{ ...(e[0] as Extract<PlanEntry, { kind: 'frame' }>), sample_seq: 800_000 }])), /over the 4194304-byte limit.*a single record over the limit cannot be sent/);
});

test('a session whose manifest shows a forced end (unfinished), even without its ended line, is never sent as live', () => {
  const text = manifestOf('harness').split('\n').filter((l) => !l.includes('"kind":"ended"')).join('\n');
  const plan = fixture('harness').plan;
  refused(() => frameRequest(text, { ...plan, delivery_mode: 'live' }), /only be sent as historical/);
});

test('bindings must be of exactly the retained file, of this source and kind; originals over 32 MiB are refused whole', () => {
  const text = manifestOf('native');
  const first = (change: (e: Extract<PlanEntry, { kind: 'frame' }>) => PlanEntry) => nativeWith((e) => [change(e[0] as Extract<PlanEntry, { kind: 'frame' }>)]);
  refused(() => frameRequest(text, first((e) => ({ ...e, raw: { ...e.raw, artifact: { ...e.raw.artifact, byte_length: e.raw.artifact.byte_length + 1 } } }))), /not of the retained file/);
  refused(() => frameRequest(text, first((e) => ({ ...e, raw: { ...e.raw, source: { ...e.raw.source, source_version: 2 } } }))), /another source/);
  refused(() => frameRequest(text, first((e) => ({ ...e, raw: { ...e.raw, kind: 'editable_ink' } }))), /screen_image OriginalArtifactBinding/);
  refused(() => frameRequest(text, first((e) => ({ ...e, ink: { ...e.raw, kind: 'editable_ink' } }))), /editable ink original is JSON/);
  refused(() => frameRequest(text, first((e) => ({ ...e, ink: { ...e.raw, kind: 'editable_ink', artifact: { ...e.raw.artifact, artifact_id: 'ink', media_type: 'application/json', byte_length: MAX_ORIGINAL_BYTES + 1 } } }))), /editable ink: the original is 33554433 bytes, over/);
  const line = lineOf(text, 2) as Record<string, any>;
  const big = withLine(text, 2, { ...line, raw: { ...line.raw, bytes: MAX_ORIGINAL_BYTES + 1 } });
  refused(() => frameRequest(big, first((e) => ({ ...e, raw: { ...e.raw, artifact: { ...e.raw.artifact, byte_length: MAX_ORIGINAL_BYTES + 1 } } }))), /over the 33554432-byte original limit; it stays on this device, whole/);
});

test('identities must be well formed and unique; one frame ID names one frame; an artifact ID names one original', () => {
  const text = manifestOf('native');
  refused(() => frameRequest(text, nativeWith((e) => e, { batch_id: 'no spaces' })), /batch ID is not an identifier/);
  refused(() => frameRequest(text, nativeWith((e) => [e[0]!, { ...e[1]!, sequence: e[0]!.sequence }])), /unique in a batch/);
  refused(() => frameRequest(text, nativeWith((e) => [e[0]!, { ...e[1]!, record_id: e[0]!.record_id }])), /unique in a batch/);
  const [a, b] = [0, 1].map((i) => fixture('native').plan.entries.filter((x) => x.kind === 'frame')[i] as Extract<PlanEntry, { kind: 'frame' }>);
  refused(() => frameRequest(text, nativeWith(() => [a!, { ...b!, frame_id: a!.frame_id }])), /names two different frames/);
  refused(() => frameRequest(text, nativeWith(() => [a!, { ...b!, raw: { ...b!.raw, artifact: { ...b!.raw.artifact, artifact_id: a!.raw.artifact.artifact_id } } }])), /names two different originals/);
  refused(() => frameRequest(text, nativeWith(() => [a!, { ...a!, record_id: 'again', sequence: 99 }])), /each line once/);
  refused(() => frameRequest(text, nativeWith(() => [{ ...b!, sequence: 1 }, { ...a!, sequence: 2 }])), /follow the manifest's order/);
  refused(() => frameRequest(text, nativeWith(() => [{ ...a!, sequence: 5 }, { ...b!, sequence: 4 }])), /rising Process sequences/);
  refused(() => frameRequest(text, nativeWith(() => Array.from({ length: 101 }, (_, i) => ({ ...a!, record_id: `r${i}`, sequence: i + 1 })))), /1 to 100 records/);
  refused(() => frameRequest(text, nativeWith((e) => e, { capture_session: 'another' })), /not of the capture session/);
});

test('a torn or damaged manifest, or malformed facts, are refused as a whole; the inputs are not changed', () => {
  const text = manifestOf('native');
  const plan = fixture('native').plan;
  const before = structuredClone(plan);
  refused(() => frameRequest(text.replace('\n', '\n{"kind":"retai\n'), plan), /line 2 is not whole JSON/);
  // A torn last line (an append cut short by a crash) is unknown coverage; the lines before it still map.
  const torn = `${text}{"kind":"retai`;
  const tornLine = torn.split('\n').length;
  const withTorn = frameRequest(torn, { ...plan, entries: [...plan.entries, { kind: 'coverage', line: tornLine, record_id: 'torn-tail', sequence: 99 }] });
  assert.deepEqual([withTorn.request.batch.records.at(-1)!.evidence.coverage, withTorn.request.batch.records.at(-1)!.evidence.limitations], ['unknown', ['missing_events']]);
  assert.ok(withTorn.unrepresented.some((n) => /cut short/.test(n)));
  const line = lineOf(text, 2) as Record<string, any>;
  const one = nativeWith((e) => [e[0]!]);
  refused(() => frameRequest(withLine(text, 2, { ...line, presentation_ms: null }), one), /presentation facts are malformed/);
  refused(() => frameRequest(withLine(text, 2, { ...line, composed: { ...line.composed, visible_strokes: 3 } }), one), /ink marks do not account/);
  refused(() => frameRequest(withLine(text, 2, { ...line, frame_seq: line.sample_seq + 1 }), one), /ordinal is malformed/);
  refused(() => frameRequest(withLine(text, 2, { ...line, raw: { ...line.raw, file: 'frames/other.png' } }), one), /does not name its SHA-256/);
  for (const bad of ['2026-02-30T00:00:00.000Z', '2026-01-01T24:00:00.000Z', '0000-01-01T00:00:00.000Z']) refused(() => frameRequest(withLine(text, 2, { ...line, sampled_at: bad }), one), /sample times are malformed/);
  const header = lineOf(text, 1) as Record<string, any>;
  refused(() => frameRequest(withLine(text, 1, { ...header, source: { ...header.source, scale_factor: 1e300 } }), one), /header source is malformed/);
  refused(() => frameRequest(withLine(text, 1, { ...header, source: { ...header.source, bounds: { ...header.source.bounds, width: 2 ** 60 } } }), one), /bounds are malformed/);
  refused(() => frameRequest(withLine(text, 1, { ...header, source: { ...header.source, label: 'screen \ud800' } }), one), /lone UTF-16 surrogate/);
  frameRequest(text, plan);
  assert.deepEqual(plan, before);
});

// The lead's review of 80da708 (docs/verification/lead/windows-mapper-review at f276dad).
const sample10 = (): { text: string; line: number; plan: IngressPlan } => {
  const text = manifestOf('native');
  const line = readManifest(text).find((l) => l.kind === 'retained' && l.value['sample_seq'] === 10)!.line;
  const entry = fixture('native').plan.entries.find((e) => e.kind === 'frame' && e.sample_seq === 10)!;
  return { text, line, plan: nativeWith(() => [entry]) };
};

test('a retained composition that is missing or not an object is refused, never read as raw-only; explicit null stays raw-only', () => {
  const { text, line, plan } = sample10();
  const value = lineOf(text, line) as Record<string, any>;
  assert.notEqual(value.raw.sha256, value.composed.sha256, 'distinct raw and composed originals');
  const { composed: _drop, ...missing } = value;
  for (const [what, changed] of [['missing', missing], ['a string', { ...value, composed: 'frames/x.png' }], ['an array', { ...value, composed: [] }], ['false', { ...value, composed: false }]] as const) {
    refused(() => frameRequest(withLine(text, line, changed), plan), /composition is neither an object nor null/);
    assert.ok(what);
  }
  const ok = frameRequest(text, plan);
  assert.equal(ok.request.batch.records[0]!.artifacts.filter((a) => a.media_type === 'image/png').length, 2, 'both originals kept when valid');
});

test('coverage lines must hold what the producer writes; impossible facts are refused, not repaired', () => {
  const text = manifestOf('native');
  const nr = readManifest(text).find((l) => l.kind === 'not_retained')!;
  const entry = fixture('native').plan.entries.find((e) => e.kind === 'coverage' && e.line === nr.line)!;
  const one = nativeWith(() => [entry]);
  assert.equal(frameRequest(text, one).request.batch.records[0]!.evidence.coverage, 'partial', 'the valid run maps');
  for (const bad of [{ from_seq: 99, to_seq: 1, samples: 100 }, { from_seq: 8, to_seq: 8, samples: 2 }, { reason: 7 }]) {
    refused(() => frameRequest(withLine(text, nr.line, { ...nr.value, ...bad }), one), /impossible for the producer/);
  }
  const rf = readManifest(text).find((l) => l.kind === 'refused')!;
  const rfEntry = nativeWith(() => [fixture('native').plan.entries.find((e) => e.kind === 'coverage' && e.line === rf.line)!]);
  for (const bad of [{ deferred_samples_not_retained: [rf.value['sample_seq']] }, { frame_seq: (rf.value['sample_seq'] as number) + 1 }, { reason: null }]) {
    refused(() => frameRequest(withLine(text, rf.line, { ...rf.value, ...bad }), rfEntry), /refusal does not hold what the producer writes/);
  }
  const harness = manifestOf('harness');
  const lines = readManifest(harness);
  const hplan = fixture('harness').plan;
  const entryFor = (kind: string) => {
    const l = lines.find((x) => x.kind === kind)!;
    return { l, plan: { ...hplan, entries: [hplan.entries.find((e) => e.kind === 'coverage' && e.line === l.line)!] } };
  };
  const gap = entryFor('gap');
  for (const bad of [{ gap_ms: 0 }, { gap_ms: -5 }, { sampled_at: 'never' }, { reason: undefined }]) refused(() => frameRequest(withLine(harness, gap.l.line, { ...gap.l.value, ...bad }), gap.plan), /gap does not hold/);
  assert.equal(frameRequest(withLine(harness, gap.l.line, { ...gap.l.value, gap_ms: 7000.5 }), gap.plan).request.batch.records.length, 1, 'a fractional duration is a fact the producer may write (it is not sent)');
  const unfinished = entryFor('unfinished');
  refused(() => frameRequest(withLine(harness, unfinished.l.line, { ...unfinished.l.value, samples: [9, 7] }), unfinished.plan), /unfinished record does not hold/);
  const unwritten = entryFor('unwritten');
  refused(() => frameRequest(withLine(harness, unwritten.l.line, { ...unwritten.l.value, reason: undefined }), unwritten.plan), /unwritten count does not hold/);
});

test('every record is an external_app visual pixel observation; WindowsFrame keeps raw, composed and ink facts', () => {
  for (const name of ['native', 'harness']) {
    const { request } = frameRequest(manifestOf(name), fixture(name).plan);
    assert.ok(request.batch.records.every((r) => r.surface === 'external_app' && r.method === 'visual' && r.evidence.kind === 'coverage'));
    assert.ok(request.frames.every((f) => f.composed === null || (typeof f.composed.ink_revision === 'number' && f.composed.transformation.length > 0)));
  }
});

test('the source must be exactly a SourceRef: extra members are refused, never copied into the closed wire', () => {
  const plan = fixture('native').plan;
  refused(() => frameRequest(manifestOf('native'), { ...plan, source: { ...plan.source, source_timezone: 'UTC' } as never }), /members beyond SourceRef \(source_timezone\)/);
  const { request } = frameRequest(manifestOf('native'), plan);
  for (const s of [...request.batch.records.map((r) => r.source), ...request.frames.map((f) => f.source)]) assert.deepEqual(Object.keys(s).sort(), ['source_id', 'source_version', 'user_id']);
});

test('a missing or falsy binding in the plan never turns a retained composition raw-only, nor drops the ink', () => {
  const { text, plan } = sample10();
  const entry = plan.entries[0] as Extract<PlanEntry, { kind: 'frame' }>;
  const { composed: _c, ...noComposed } = entry;
  for (const bad of [noComposed, { ...entry, composed: undefined }, { ...entry, composed: false }, { ...entry, composed: 0 }, { ...entry, composed: '' }]) {
    refused(() => frameRequest(text, { ...plan, entries: [bad as never] }), /composed binding is neither an OriginalArtifactBinding nor null/);
  }
  const { ink: _i, ...noInk } = entry;
  for (const bad of [noInk, { ...entry, ink: false }, { ...entry, ink: '' }]) {
    refused(() => frameRequest(text, { ...plan, entries: [bad as never] }), /editable-ink binding is neither/);
  }
});

test('an unfinished record holds deferred samples only for lost frames, each before the last lost one', () => {
  const harness = manifestOf('harness');
  const l = readManifest(harness).find((x) => x.kind === 'unfinished')!;
  const hplan = fixture('harness').plan;
  const plan = { ...hplan, entries: [hplan.entries.find((e) => e.kind === 'coverage' && e.line === l.line)!] };
  for (const bad of [{ samples: [], deferred_samples_not_retained: [3] }, { samples: [7], deferred_samples_not_retained: [9] }]) {
    refused(() => frameRequest(withLine(harness, l.line, { ...l.value, ...bad }), plan), /unfinished record does not hold/);
  }
  assert.equal(frameRequest(withLine(harness, l.line, { ...l.value, samples: [7], deferred_samples_not_retained: [5, 6] }), plan).request.batch.records.length, 1);
});

test('only a cut-short last line is torn: a written line of kind "torn" is not coverage', () => {
  const text = manifestOf('native');
  const lines = text.split('\n');
  const n = lines.length - 1; // the ended line, replaced by a whole line of kind 'torn'
  const written = withLine(text, n, { kind: 'torn' });
  const plan = fixture('native').plan;
  refused(() => frameRequest(written, { ...plan, entries: [{ kind: 'coverage', line: n, record_id: 'r', sequence: 1 }] }), /has no coverage meaning/);
});

test('an editable-ink binding must be the ink original retained with its own composition; a refused one takes no binding; old manifests stay unknown', () => {
  const text = manifestOf('harness-ink');
  const plan = fixture('harness-ink').plan;
  const out = frameRequest(text, plan);
  assert.equal(out.request.batch.records.filter((r) => r.artifacts.some((a) => a.media_type === 'application/json')).length, 4, 'every frame carries its own ink original');
  const first = plan.entries[0] as Extract<PlanEntry, { kind: 'frame' }>;
  const one = (entry: PlanEntry) => ({ ...plan, entries: [entry] });
  // Another frame's original (a later document) in place of this one's.
  const later = plan.entries.at(-1) as Extract<PlanEntry, { kind: 'frame' }>;
  refused(() => frameRequest(text, one({ ...first, ink: later.ink })), /not the ink original retained with this composition/);
  // Retained, not bound: said.
  assert.ok(frameRequest(text, one({ ...first, ink: null })).unrepresented.some((n) => /ink original retained with this composition \(ink\/[0-9a-f]{64}\.json, ink revision 0\) is not bound/.test(n)));
  // Recorded as refused: no binding.
  const line = readManifest(text).find((l) => l.kind === 'retained' && l.value['sample_seq'] === first.sample_seq)!;
  const composed = line.value['composed'] as Record<string, unknown>;
  const refusedLine = withLine(text, line.line, { ...line.value, composed: { ...composed, ink_original: { refused: 'the ink document is not UTF-8 JSON' } } });
  refused(() => frameRequest(refusedLine, one(first)), /no ink original was retained with this composition \(the ink document is not UTF-8 JSON\); a later document is never bound/);
  assert.ok(frameRequest(refusedLine, one({ ...first, ink: null })).request);
  // Malformed.
  for (const bad of [null, { file: 'ink/x.json', sha256: 'a'.repeat(64), bytes: 3 }, { refused: 1 }]) {
    refused(() => frameRequest(withLine(text, line.line, { ...line.value, composed: { ...composed, ink_original: bad } }), one(first)), /ink original record is malformed/);
  }
  // A line written before ink originals were kept: the binding is the caller's, unchecked, and said.
  const { ink_original: _gone, ...older } = composed;
  assert.ok(frameRequest(withLine(text, line.line, { ...line.value, composed: older }), one(first)).unrepresented.some((n) => /predates retained ink originals/.test(n)));
});

test('a gesture in progress and evidence still being made are said, since the wire cannot carry them', () => {
  const text = manifestOf('harness-ink');
  const plan = fixture('harness-ink').plan;
  assert.ok(frameRequest(text, plan).unrepresented.some((n) => /an ink gesture \(2 point\(s\)\) was in progress; it is in neither the composition nor the ink original/.test(n)));
  const line = readManifest(text).find((l) => l.kind === 'retained' && l.value['sample_seq'] === (plan.entries[1] as Extract<PlanEntry, { kind: 'frame' }>).sample_seq)!;
  const composed = line.value['composed'] as Record<string, unknown>;
  const pending = withLine(text, line.line, { ...line.value, composed: { ...composed, evidence_pending: ['stk_x'] } });
  assert.ok(frameRequest(pending, { ...plan, entries: [plan.entries[1]!] }).unrepresented.some((n) => /stroke\(s\) stk_x was still being made .* pending, not failed/.test(n)));
});

test('an ink binding with the retained SHA-256 but another length, or on a raw-only frame, is refused; a refused original is said even with no visible strokes; malformed gesture or pending facts are refused', () => {
  const text = manifestOf('harness-ink');
  const plan = fixture('harness-ink').plan;
  const first = plan.entries[0] as Extract<PlanEntry, { kind: 'frame' }>;
  const one = (entry: PlanEntry) => ({ ...plan, entries: [entry] });
  refused(() => frameRequest(text, one({ ...first, ink: { ...first.ink!, artifact: { ...first.ink!.artifact, byte_length: first.ink!.artifact.byte_length + 1 } } })), /not the ink original retained with this composition/);
  const line = readManifest(text).find((l) => l.kind === 'retained' && l.value['sample_seq'] === first.sample_seq)!;
  const rawOnly = withLine(text, line.line, { ...line.value, composed: null });
  refused(() => frameRequest(rawOnly, one({ ...first, composed: null })), /has no composition, so no editable ink to bind/);
  const composed = line.value['composed'] as Record<string, unknown>;
  assert.equal(composed['visible_strokes'], 0);
  const refusedLine = withLine(text, line.line, { ...line.value, composed: { ...composed, ink_original: { refused: 'the ink document is not bytes' } } });
  assert.ok(frameRequest(refusedLine, one({ ...first, ink: null })).unrepresented.some((n) => /no ink original was retained with this composition \(the ink document is not bytes\)/.test(n)));
  for (const bad of [{ uncommitted_gesture: { kind: 'draw', points: 1 } }, { uncommitted_gesture: 'ink' }, { evidence_pending: [3] }, { evidence_pending: 'stk' }]) {
    refused(() => frameRequest(withLine(text, line.line, { ...line.value, composed: { ...composed, ...bad } }), one(first)), /(is|are) malformed/);
  }
});

test('ink_original is exactly one of the two shapes main writes: retained {file, sha256, bytes} or refused {refused}', () => {
  const text = manifestOf('harness-ink');
  const plan = fixture('harness-ink').plan;
  const first = plan.entries[0] as Extract<PlanEntry, { kind: 'frame' }>;
  const line = readManifest(text).find((l) => l.kind === 'retained' && l.value['sample_seq'] === first.sample_seq)!;
  const composed = line.value['composed'] as Record<string, any>;
  const retained = composed['ink_original'];
  for (const bad of [{ ...retained, refused: 'the ink document is not bytes' }, { ...retained, note: 'x' }, { refused: 'x', file: retained.file }, { refused: '' }, { file: retained.file, sha256: retained.sha256 }]) {
    for (const ink of [first.ink, null]) {
      refused(() => frameRequest(withLine(text, line.line, { ...line.value, composed: { ...composed, ink_original: bad } }), { ...plan, entries: [{ ...first, ink }] }), /ink original record is malformed/);
    }
  }
});
