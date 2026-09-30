// Independent mapper review: synthetic mutations of exact retained manifests/plans.
// No file decoding, native capture, networking, services, provider or repository writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2] ?? '/tmp/lc-windows-mapper-80da708';
const out = process.argv[3] ?? '/tmp/windows-mapper-review-cases';
fs.mkdirSync(out, { recursive: true });
const { frameRequest, MappingRefusal } = await import(pathToFileURL(path.join(root, 'apps/windows/src/shared/frame-ingress.ts')));
const evidence = path.join(root, 'docs/verification/web/evidence');
const fixture = name => {
  const meta = JSON.parse(fs.readFileSync(path.join(evidence, 'windows-frame-ingress', name+'.json'), 'utf8'));
  return { meta, text: fs.readFileSync(path.join(evidence, meta.manifest), 'utf8').replaceAll('\r\n', '\n') };
};
const native = fixture('native'), harness = fixture('harness');
const parse = text => text.trimEnd().split('\n').map(JSON.parse);
const emit = values => values.map(v => JSON.stringify(v)).join('\n') + '\n';
const selected = native.meta.plan.entries.find(e => e.kind === 'frame' && e.sample_seq === 10);
assert(selected && selected.raw.artifact.sha256 !== selected.composed.artifact.sha256, 'distinct retained composition');
const one = { ...structuredClone(native.meta.plan), entries: [structuredClone(selected)] };
const rawLines = parse(native.text);
const idx = rawLines.findIndex(l => l.kind === 'retained' && l.sample_seq === 10);
function save(name, mapped) {
  fs.writeFileSync(path.join(out, name+'.json'), mapped.body);
  return mapped;
}
function refuse(name, fn, re) {
  assert.throws(fn, e => e instanceof MappingRefusal && re.test(e.message), name);
  console.log(JSON.stringify({ name, result:'refused' }));
}
// Valid paths, deterministic bytes, immutable inputs and all actual declared roles.
for (const [name, value] of [['native',native],['harness',harness]]) {
  const input = JSON.stringify(value.meta.plan);
  const a = save(name, frameRequest(value.text, value.meta.plan));
  assert.equal(a.body, frameRequest(value.text, value.meta.plan).body);
  assert.equal(JSON.stringify(value.meta.plan), input);
  for (const record of a.request.batch.records) {
    assert.deepEqual(record.source, value.meta.plan.source);
    assert.equal(record.surface, 'original_screen_overlay'); assert.equal(record.method, 'visual');
    assert.deepEqual([record.clock, record.observed_at, record.media_position], [null,null,null]);
    if (record.frame_id === null) assert.deepEqual(record.artifacts, []);
  }
  for (const frame of a.request.frames) assert.deepEqual([frame.captured_at, frame.media_position, frame.capture_latency_ms], [null,null,null]);
  console.log(JSON.stringify({ name, result:'valid mapping', records:a.request.batch.records.length, frames:a.request.frames.length, unrepresented:a.unrepresented.length }));
}
// Missing/non-object composed is corruption, not an explicit raw-only retained sample.
for (const [label, replacement] of [['missing',undefined],['array',[]],['false',false],['string','damaged']]) {
  const lines = structuredClone(rawLines);
  if (replacement === undefined) delete lines[idx].composed; else lines[idx].composed = replacement;
  const mapped = save('corrupt-composed-'+label, frameRequest(emit(lines), one));
  assert.equal(mapped.request.frames[0].composed, null);
  assert(!mapped.request.batch.records[0].artifacts.some(a => a.artifact_id === selected.composed.artifact.artifact_id));
  assert(!mapped.unrepresented.some(n => /composed|damaged|malformed|missing/.test(n)));
  console.log(JSON.stringify({ name:'corrupt-composed-'+label, result:'ACCEPTED, distinct composed original omitted', composed:mapped.request.frames[0].composed, artifacts:mapped.request.batch.records[0].artifacts.map(a=>a.artifact_id), unrepresented:mapped.unrepresented }));
}
// In contrast, an explicit null must match an explicit null binding; mismatches are refused.
const rawOnly = structuredClone(rawLines); rawOnly[idx].composed = null;
const rawOnlyPlan = structuredClone(one); rawOnlyPlan.entries[0].composed = null;
assert.equal(save('raw-only',frameRequest(emit(rawOnly),rawOnlyPlan)).request.frames[0].composed,null);
refuse('explicit-null-with-binding',()=>frameRequest(emit(rawOnly),one),/none can be bound/);
// A not_retained run the actual producer rejects is nonetheless translated as real partial coverage.
const runIndex = rawLines.findIndex(l=>l.kind==='not_retained'); assert(runIndex>0);
const badRun = structuredClone(rawLines);
badRun[runIndex] = { ...badRun[runIndex], from_seq:99, to_seq:1, samples:100 };
const coveragePlan = { ...structuredClone(native.meta.plan), entries:[{kind:'coverage',line:runIndex+1,record_id:'bad-run',sequence:1}] };
const badCoverage = save('corrupt-not-retained',frameRequest(emit(badRun),coveragePlan));
assert.equal(badCoverage.request.batch.records[0].evidence.coverage,'partial');
console.log(JSON.stringify({name:'corrupt-not-retained',result:'ACCEPTED impossible producer range', unrepresented:badCoverage.unrepresented}));
// Alias identity, order and source negatives use valid source forms.
const f3 = native.meta.plan.entries.find(e=>e.kind==='frame'&&e.sample_seq===3);
const alias = structuredClone(rawLines), aliasIndex=alias.findIndex(l=>l.kind==='retained'&&l.sample_seq===3);
alias[aliasIndex].composed.pixels_sha256='f'.repeat(64);
refuse('same-file-distinct-ID-pixel-conflict',()=>frameRequest(emit(alias),{...native.meta.plan,entries:[f3]}),/different facts/);
const foreign = structuredClone(one); foreign.entries[0].composed.source.source_version++;
refuse('foreign-composed-source',()=>frameRequest(native.text,foreign),/another source/);
const frames = native.meta.plan.entries.filter(e=>e.kind==='frame');
refuse('reordered-manifest-records',()=>frameRequest(native.text,{...native.meta.plan,entries:[{...frames[1],sequence:1},{...frames[0],sequence:2}]}),/manifest's order/);
refuse('ended-live',()=>frameRequest(native.text,{...one,delivery_mode:'live'}),/only be sent as historical/);
const forcedOnly = parse(harness.text).filter(l=>l.kind!=='ended');
refuse('unfinished-without-ended-live',()=>frameRequest(emit(forcedOnly),{...harness.meta.plan,delivery_mode:'live'}),/only be sent as historical/);
// Known gap facts remain as measured; absence is unknown rather than a derived duration.
const h = frameRequest(harness.text,harness.meta.plan);
assert.equal(h.request.frames.find(f=>f.profile.sample.state==='gap').profile.sample.gap_ms,5500);
assert(h.unrepresented.some(n=>n.includes('7000 ms')));
const unknownGap = structuredClone(rawLines); delete unknownGap[idx].gap_ms; unknownGap[idx].state='gap';
assert.equal(save('unknown-gap',frameRequest(emit(unknownGap),one)).request.frames[0].profile.sample.gap_ms,null);
console.log('PASS diagnostic: valid/rejected controls hold; 4 composed-corruption variants and 1 impossible coverage range reproduce acceptance defects.');
