// QA 06: does a correction (attempt_revised) survive leaving and returning to the attempt?
// Plan rule 1 / rule 10 / A34: help and cache answers must match the current revision.
// Usage: node probes/revision-return.mjs [model.ts]
import { pathToFileURL } from 'node:url';
const modelPath = process.argv[2] ?? '/tmp/qa-0c0/work/web-disclosure/apps/safari-extension/tests/p0-12/disclosure-model.ts';
const { initialContext, apply, decide, preferenceKey, cacheHit } = await import(pathToFileURL(modelPath).href);
const P1 = { problemId: 'p1', problemVersion: 1, attemptId: 'a1' };
const P2 = { problemId: 'p2', problemVersion: 1, attemptId: 'a2' };
const item = (c, id, level, requestId, extra = {}) => ({ id, channel: 'card', ...P1, basisRevision: c.attemptRevision, requestId, level, scope: null, preferenceKey: preferenceKey(c), derivedFrom: [], ...extra });
const run = (evs, c0 = initialContext('p0', 1, 'a0')) => evs.reduce((c, e) => apply(c, e), c0);

// (1) own hint cached at revision 0, correction, leave and return, ask for a hint again
let c = run([{ type: 'enter_problem', ...P1 }, { type: 'request', request: { id: 'r1', level: 'key_concept', scope: null, origin: 'this_device' } }]);
const hint0 = item(c, 'hint-rev0', 'key_concept', 'r1');
console.log('rev at generation:', c.attemptRevision, 'present:', JSON.stringify(decide(c, hint0)));
c = apply(c, { type: 'attempt_revised', revision: 1 });
console.log('after correction (rev 1): present:', JSON.stringify(decide(c, hint0)));
c = apply(c, { type: 'request', request: { id: 'r2', level: 'key_concept', scope: null, origin: 'this_device' } });
console.log('same visit, new hint request r2: cacheHit =', cacheHit(c, c.activeRequest, [hint0])?.id ?? null);
c = apply(c, { type: 'enter_problem', ...P2 });
c = apply(c, { type: 'enter_problem', ...P1 });
console.log('after leave/return: ctx.attemptRevision =', c.attemptRevision, '(the attempt was last corrected to revision 1)');
c = apply(c, { type: 'request', request: { id: 'r3', level: 'key_concept', scope: null, origin: 'this_device' } });
const hit = cacheHit(c, c.activeRequest, [hint0]);
console.log('after return, new hint request r3: cacheHit =', hit?.id ?? null, hit ? 'decide=' + JSON.stringify(decide(c, hit)) : '');

// (2) other-device request stays current at the server; its rev-0 card after a correction and leave/return
c = run([{ type: 'enter_problem', ...P1 }, { type: 'remote_policy', binding: P1, policyVersion: 1, teaching: 'help', request: { id: 'rr', level: 'full_solution', scope: null, origin: 'other_device' } }]);
const sol0 = item(c, 'sol-rev0', 'full_solution', 'rr');
c = apply(c, { type: 'attempt_revised', revision: 1 });
console.log('\n(2) other-device card from rev 0 after correction:', JSON.stringify(decide(c, sol0)));
c = run([{ type: 'enter_problem', ...P2 }, { type: 'enter_problem', ...P1 }, { type: 'remote_policy', binding: P1, policyVersion: 2, teaching: 'help', request: { id: 'rr', level: 'full_solution', scope: null, origin: 'other_device' } }], c);
console.log('(2) after leave/return and server v2 still naming rr: rev =', c.attemptRevision, 'pre-correction card:', JSON.stringify(decide(c, sol0)));

// (3) new_attempt and back
c = run([{ type: 'enter_problem', ...P1 }, { type: 'request', request: { id: 'q1', level: 'step_check', scope: 's1', origin: 'this_device' } }]);
const chk0 = item(c, 'chk-rev0', 'step_check', 'q1', { scope: 's1' });
c = run([{ type: 'attempt_revised', revision: 3 }, { type: 'new_attempt', attemptId: 'a9' }, { type: 'new_attempt', attemptId: 'a1' }, { type: 'request', request: { id: 'q2', level: 'step_check', scope: 's1', origin: 'this_device' } }], c);
const hit3 = cacheHit(c, c.activeRequest, [chk0]);
console.log('\n(3) step check cached at rev 0, corrected to rev 3, new_attempt a9 and back to a1: rev =', c.attemptRevision, 'cacheHit =', hit3?.id ?? null, hit3 ? JSON.stringify(decide(c, hit3)) : '');
