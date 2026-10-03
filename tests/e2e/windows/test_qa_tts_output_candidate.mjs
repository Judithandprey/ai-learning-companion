// Focused offline identity/admission mutations only; no product or native calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertReviewedPlacement, checkTtsCandidate, prepareTtsCandidate } from './qa_tts_output_candidate.mjs';

if (!process.env.LC_QA_TTS_STATIC_RECEIPT) throw Error('explicit saved static stage receipt required');
const identity = JSON.parse(readFileSync(process.env.LC_QA_TTS_STATIC_RECEIPT));
const base = prepareTtsCandidate();
const fresh = () => ({ manifest: structuredClone(base.manifest), payload: { ...base.payload }, identity: structuredClone(identity) });
const accepts = v => checkTtsCandidate(v.manifest, v.payload, v.identity);
function rejects(name, mutate) { test(name, () => { const v = fresh(); mutate(v); assert.throws(() => accepts(v)); }); }

test('valid new-package descriptor admits identity only, with no execution path', () => {
  const result = accepts(fresh());
  assert.equal(result.identity_passed, true);
  assert.equal(result.execution_admitted, false);
  assert.equal(result.native_executed, false);
  assert.equal(result.provider_attempts, 0);
  const steps = JSON.parse(base.payload['steps.json']);
  assert.equal(steps.length, 32);
  assert.equal(steps.filter(s => s.onTop === 'edge').length, 3);
  assert.ok(steps.filter(s => s.onTop === 'edge').every(s => s.points.length === 16));
  assert.ok(steps.findIndex(s => s.productPlacement === 'control') < steps.findIndex(s => s.captureStart));
  assert.equal(base.manifest.app_entry.app_arguments.length, 1);
});
rejects('manifest execution flag cannot activate execution', v => { v.manifest.execution_authorized = true; });
rejects('historical approval cannot be rebound', v => { v.manifest.prior_approval_rebound_to_this_candidate = true; });
rejects('old package is rejected', v => { v.manifest.stage = v.manifest.stage.replace('tts-52be105', 'live-1755153'); });
rejects('wrong entry or launch argument is rejected', v => { v.manifest.app_entry.app_arguments.push('--unexpected'); });
rejects('altered planned PowerShell arguments are rejected', v => { v.manifest.proposed_native_invocation.arguments[3] = 'Bypass'; });
rejects('wrong source pin is rejected', v => { v.manifest.source_files['qa_edge_placement.ps1'] = '0'.repeat(64); });
rejects('missing placement step is rejected', v => { const s = JSON.parse(v.payload['steps.json']); v.payload['steps.json'] = JSON.stringify(s.filter(x => x.productPlacement !== 'control')); });
rejects('historical runner mixture is rejected', v => { v.payload['runner.ps1'] = readFileSync('docs/verification/qa/p0-13-live-1755153/edge-placement-offline/candidate/runner.ps1'); });
rejects('changed surface is rejected', v => { v.payload['surface.html'] = Buffer.from('different source'); });
rejects('missing package file receipt is rejected', v => { delete v.identity.file_sha256['package.json']; });
rejects('extra package file receipt is rejected', v => { v.identity.unexpected_files.push('extra'); });
rejects('altered package file receipt is rejected', v => { v.identity.file_sha256['package.json'] = '0'.repeat(64); });
rejects('different compiled helper is rejected', v => { v.identity.native_executable_sha256 = '0'.repeat(64); });
rejects('different Electron bytes are rejected', v => { v.identity.electron_runtime.file_sha256['electron.exe'] = '0'.repeat(64); });
test('a same-length change to the reviewed physical point set is rejected', () => {
  const built = { runner: base.payload['runner.ps1'], steps: JSON.parse(base.payload['steps.json']) };
  built.steps.find(s => s.onTop === 'edge').points[0][0] += 1;
  assert.throws(() => assertReviewedPlacement(base.manifest, built));
});
