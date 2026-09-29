// QA 06: concrete effect of surviving mutants MA/MB. Usage: node survivors.mjs <model.ts>
import { pathToFileURL } from 'node:url';
const { initialContext, apply, decide, preferenceKey } = await import(pathToFileURL(process.argv[2]).href);
const B = { problemId: 'p1', problemVersion: 1, attemptId: 'a1' };
const it = (c, id, level, requestId) => ({ id, channel: 'card', ...B, basisRevision: c.attemptRevision, requestId, level, scope: null, preferenceKey: preferenceKey(c), derivedFrom: [] });
const run = (evs) => evs.reduce((c, e) => apply(c, e), apply(initialContext('p0', 1, 'a0'), { type: 'enter_problem', ...B }));
const sol = { id: 'rr-sol', level: 'full_solution', scope: null, origin: 'other_device' };
// MA: steps of trace later-explicit-request-after-unsynced-close up to the v2 stale snapshot, then re-check a full solution under r-mine.
let c = run([{ type: 'remote_policy', binding: B, policyVersion: 1, teaching: 'help', request: sol }, { type: 'disconnect' }, { type: 'let_me_try' },
  { type: 'reconnect', binding: B, policyVersion: 1, teaching: 'help', request: sol, acceptedProvisional: [], acknowledgedClose: false },
  { type: 'request', request: { id: 'r-mine', level: 'key_concept', scope: null, origin: 'this_device' } },
  { type: 'remote_policy', binding: B, policyVersion: 2, teaching: 'help', request: sol }]);
console.log('MA-effect full solution under r-mine after stale v2:', JSON.stringify(decide(c, it(c, 'stale-sol', 'full_solution', 'r-mine'))), 'permission', c.permission.level);
// MB: trace provisional-request-accepted-on-reconnect, then a full solution under the accepted key_concept request.
c = run([{ type: 'disconnect' }, { type: 'request', request: { id: 'r-offline', level: 'key_concept', scope: null, origin: 'this_device' } },
  { type: 'reconnect', binding: B, policyVersion: 3, teaching: 'help', request: null, acceptedProvisional: ['r-offline'], acknowledgedClose: false }]);
console.log('MB-effect full solution under accepted key_concept request:', JSON.stringify(decide(c, it(c, 'x', 'full_solution', 'r-offline'))), 'permission', c.permission.level);
