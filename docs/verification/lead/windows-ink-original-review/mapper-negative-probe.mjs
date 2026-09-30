import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = '/tmp/windows-ink-mapper-46dbb90';
const { frameRequest, MappingRefusal } = await import(pathToFileURL(`${root}/apps/windows/src/shared/frame-ingress.ts`));
const folder = `${root}/docs/verification/web/evidence/windows-frame-ingress`;
const metadata = JSON.parse(readFileSync(`${folder}/harness-ink.json`, 'utf8'));
const originalText = readFileSync(`${root}/docs/verification/web/evidence/${metadata.manifest}`, 'utf8');
const plan = metadata.plan;
const first = plan.entries[0];
const one = { ...plan, entries: [structuredClone(first)] };
const rows = originalText.trimEnd().split('\n').map(JSON.parse);
const rowIndex = rows.findIndex(r => r.kind === 'retained' && r.sample_seq === first.sample_seq);
const original = rows[rowIndex].composed.ink_original;
const cases = [
  ['valid', original],
  ['explicit_refusal', { refused: 'synthetic failed original retention' }],
  ['contradictory_refusal_and_retained', { ...original, refused: 'synthetic failed original retention' }],
  ['wrong_hash_path', { ...original, file: 'ink/wrong.json' }],
  ['null', null],
];
const results = [];
for (const [label, ink] of cases) {
  const changed = structuredClone(rows);
  changed[rowIndex].composed.ink_original = ink;
  const text = changed.map(JSON.stringify).join('\n') + '\n';
  const beforePlan = JSON.stringify(one);
  let result;
  try {
    const out = frameRequest(text, one);
    result = { label, outcome: 'accepted', ink_artifacts: out.request.batch.records[0].artifacts.filter(a => a.media_type === 'application/json'), unrepresented: out.unrepresented };
  } catch (e) {
    assert(e instanceof MappingRefusal);
    result = { label, outcome: 'refused', reason: e.message };
  }
  assert.equal(JSON.stringify(one), beforePlan);
  results.push(result);
}
assert.equal(results[0].outcome, 'accepted');
assert.equal(results[1].outcome, 'refused');
assert.equal(results[2].outcome, 'accepted', 'negative finding has changed; review result');
assert.equal(results[3].outcome, 'refused');
assert.equal(results[4].outcome, 'refused');
assert(!results[2].unrepresented.some(s => s.includes('synthetic failed original retention')));
writeFileSync('/tmp/windows-ink-mapper-negative-results.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
