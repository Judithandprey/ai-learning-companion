// Lead reproduction against delivered Web commit 4c32e49, not production code.
// Pass the absolute path of that commit's exported disclosure-model.ts.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { initialContext, apply, decide, preferenceKey } = await import(pathToFileURL(process.argv[2]).href);
const binding = { problemId: 'p1', problemVersion: 1, attemptId: 'a1' };
const request = { id: 'old-full', level: 'full_solution', scope: null, origin: 'other_device' };
let context = initialContext('p1', 1, 'a1');
context = apply(context, { type: 'remote_policy', binding, policyVersion: 1, teaching: 'help', request });
context = apply(context, { type: 'disconnect' });
context = apply(context, { type: 'let_me_try' });
context = apply(context, {
  type: 'reconnect', binding, policyVersion: 1, teaching: 'help', request,
  acceptedProvisional: [], acknowledgedClose: false,
});
console.log('unacknowledged reconnect', JSON.stringify({ pendingClose: context.pendingClose, permission: context.permission }));
context = apply(context, { type: 'remote_policy', binding, policyVersion: 2, teaching: 'help', request });
const decision = decide(context, {
  id: 'old-answer', channel: 'card', ...binding, basisRevision: 0,
  requestId: request.id, level: 'full_solution', scope: null,
  preferenceKey: preferenceKey(context), derivedFrom: [],
});
console.log('later policy', JSON.stringify({ pendingClose: context.pendingClose, permission: context.permission, decision }));
assert.equal(decision.present, false, 'an unacknowledged offline refusal must survive another old-request policy');
