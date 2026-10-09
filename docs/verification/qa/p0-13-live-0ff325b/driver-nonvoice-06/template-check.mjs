// Pure check of the inactive allocation template against the wrapper's own validator. No allocation, approval or lease:
// the Lead-owned fields are filled only in memory, to show every other field already matches exactly.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { candidateHash, validateLiveAllocation } from '../../../../../tests/e2e/windows/qa_run_live_candidate.mjs';
import { CONNECTOR } from '../../../../../tests/e2e/windows/qa_live_candidate.mjs';

const read = rel => readFileSync(new URL(rel, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const wrapperHash = sha(read('../../../../../tests/e2e/windows/qa_run_live_candidate.mjs'));
const candidateBytes = read('../candidate-nonvoice-06/candidate.json'), candidate = JSON.parse(candidateBytes);
const templateBytes = read('allocation.template.json'), template = JSON.parse(templateBytes);
const previous = JSON.parse(read('../driver-nonvoice-05/allocation.template.json'));
// The fields only the Lead's exact review can set; synthetic values, valid for one synthetic instant.
const leadOwned = { state: 'active', lead_reviewed: true, allocation_id: 'synthetic-template-check', command_approval_ref: 'synthetic:not-an-approval',
  script_permission_ref: 'synthetic:not-a-permission', valid_from_utc: '2026-10-09T00:00:00Z', valid_until_utc: '2026-10-09T00:10:00Z' };
const at = Date.parse('2026-10-09T00:05:00Z');
const verdict = record => { try { validateLiveAllocation(record, candidate, wrapperHash, at); return 'accepted'; } catch (error) { return `refused: ${error.message}`; } };
const cases = {
  saved_template: verdict(template),
  template_with_lead_fields_in_memory: verdict({ ...template, ...leadOwned }),
  candidate_05_template_with_lead_fields: verdict({ ...previous, ...leadOwned }),
  candidate_05_template_with_lead_fields_and_06_hashes: verdict({ ...previous, ...leadOwned, wrapper_sha256: wrapperHash, candidate_sha256: candidateHash }),
};
const differs = Object.keys({ ...template, ...leadOwned }).filter(k => JSON.stringify(template[k]) !== JSON.stringify({ ...template, ...leadOwned }[k]));
console.log(JSON.stringify({
  kind: 'qa-live-allocation-template-check/v1', template_sha256: sha(templateBytes), candidate_sha256: sha(candidateBytes), wrapper_sha256: wrapperHash,
  template_matches: { wrapper: template.wrapper_sha256 === wrapperHash, candidate: template.candidate_sha256 === candidateHash && candidateHash === sha(candidateBytes),
    connector: JSON.stringify(template.connector) === JSON.stringify(CONNECTOR), connector_commit: template.connector.commit, copy_label: template.connector.copy },
  lead_owned_fields_filled_in_memory: differs, cases,
  allocation_prepared: false, lease: 'NONE', run_live_candidate_called: false,
  limitation: 'Pure validator only: the template stays inactive. The filled object exists only in this process and is not an allocation, approval or lease.',
}, null, 2));
process.exitCode = cases.saved_template.startsWith('refused') && cases.template_with_lead_fields_in_memory === 'accepted'
  && cases.candidate_05_template_with_lead_fields_and_06_hashes.startsWith('refused') ? 0 : 1;
