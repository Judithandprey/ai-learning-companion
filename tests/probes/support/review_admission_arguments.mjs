// Exact-commit offline review only. Run under Node --permission without child-process permission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2]);
const wrapper = join(root, 'tests/e2e/windows/qa_run_tts_candidate.mjs');
assert.equal(createHash('sha256').update(readFileSync(wrapper)).digest('hex'),
  '9f3bc94052246981b9f554823400df4882acdc0906f34b916e7036b952ff7e3f');
const { ttsAdmissionScope, ttsLaunchRelevance } = await import(pathToFileURL(wrapper));
const candidate = JSON.parse(readFileSync(join(root,
  'docs/verification/qa/p0-13-tts-52be105/candidate-admission-20261008/candidate.json')));
const scope = ttsAdmissionScope(candidate);
const cases = [
  ['absolute_app_control', 'electron.exe "C:\\Other\\Application"', false],
  ['relative_app_control', 'electron.exe .', true],
  ['split_profile_then_relative_app', 'electron.exe --user-data-dir C:\\Other\\Profile .', true],
  ['split_require_then_relative_app', 'electron.exe --require C:\\Other\\preload.cjs .', true],
  ['split_option_without_established_app', 'electron.exe --user-data-dir C:\\Other\\Profile', true],
];
const results = cases.map(([name, command_line, expectedRelevant]) => {
  const reason = ttsLaunchRelevance({ pid: 123, created: '5', exe: candidate.electron, command_line }, scope);
  return { name, synthetic_command: command_line, expected_relevant: expectedRelevant,
    actual_reason: reason, matches_required_boundary: (reason !== null) === expectedRelevant };
});
console.log(JSON.stringify({ candidate: '78d6de0f1e1b92113d0829a1f88be6fb84ae96f8',
  native_executions: 0, interpretation: 'An option value does not establish an unambiguous absolute application identity.',
  results }, null, 2));
process.exitCode = results.every(r => r.matches_required_boundary) ? 0 : 1;
