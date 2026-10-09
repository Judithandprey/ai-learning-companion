// Read-only counterexamples for the exact b8f0d9c watcher classifier. Never starts the wrapper.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = process.argv[2];
assert.ok(root, 'pass the immutable QA export directory');
const source = readFileSync(join(root, 'tests/e2e/windows/qa_run_live_candidate.mjs'), 'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'), 'aaa85a7b139acaa113ebd734bff28ab11b64d63d44d8bbc179801e3b2bff8206');
const begin = source.indexOf('export function watchSummary(');
const end = source.indexOf('\n/**', begin);
assert.ok(begin >= 0 && end > begin);
const watchSummary = vm.runInNewContext(source.slice(begin, end).replace('export ', '') + '\nwatchSummary', {
  // All inputs here are valid JSONL, so this parser has the same behavior as parseJsonl.
  parseJsonl: text => text.split('\n').filter(Boolean).map(line => JSON.parse(line)),
});
const cases = [
  { name: 'observed live child remains', events: [{ event: 'appear', pid: 7 }, { event: 'watch_end', remaining: [7] }], actual: 'left_running', required: 'left_running' },
  { name: 'observed lifecycle ended', events: [{ event: 'appear', pid: 7 }, { event: 'exit', pid: 7 }, { event: 'watch_end', remaining: [] }], actual: 'released', required: 'released' },
  { name: 'started but observed no process', events: [{ event: 'watch_start', root_exists: true, already_there: [] }, { event: 'watch_end', remaining: [] }], actual: 'released', required: 'unknown' },
  { name: 'only end record survives', events: [{ event: 'watch_end', remaining: [] }], actual: 'released', required: 'unknown' },
];
const observations = cases.map(c => {
  const value = watchSummary({ readFileSync: () => c.events.map(e => JSON.stringify(e)).join('\n') }, 'synthetic-log', true);
  assert.equal(value.state, c.actual, c.name);
  return { name: c.name, expected_evidence_state: c.required, observed: value, counterexample: c.required !== value.state };
});
assert.equal(observations.filter(x => x.counterexample).length, 2);
console.log(JSON.stringify({ qa_commit: 'b8f0d9c23a0091c76fd2def239f445d1b8d04854', checks: 4, counterexamples: 2,
  interpretation: 'Successful reproduction of two classifier defects; not a product pass or an observed process leak.', observations }, null, 2));
