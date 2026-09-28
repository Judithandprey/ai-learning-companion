// QA 06: liveness of an unsynced close across leave/return. Usage: node ack-while-away.mjs <model.ts>
import { pathToFileURL } from 'node:url';
const { initialContext, apply, decide, preferenceKey } = await import(pathToFileURL(process.argv[2]).href);
const P1 = { problemId: 'p1', problemVersion: 1, attemptId: 'a1' }, P2 = { problemId: 'p2', problemVersion: 1, attemptId: 'a2' };
const it = (c, requestId) => ({ id: 'x', channel: 'card', ...P1, basisRevision: c.attemptRevision, requestId, level: 'full_solution', scope: null, preferenceKey: preferenceKey(c), derivedFrom: [] });
const sol = { id: 'rr-sol', level: 'full_solution', scope: null, origin: 'other_device' };
const later = { id: 'rr-later', level: 'full_solution', scope: null, origin: 'other_device' };
const base = [{ type: 'enter_problem', ...P1 }, { type: 'remote_policy', binding: P1, policyVersion: 1, teaching: 'help', request: sol },
  { type: 'disconnect' }, { type: 'let_me_try' }, { type: 'enter_problem', ...P2 },
  { type: 'reconnect', binding: P2, policyVersion: 1, teaching: 'explore', request: null, acceptedProvisional: [], acknowledgedClose: true },
  // server applies the p1 close and acknowledges it while the user is on p2
  { type: 'remote_policy', binding: P1, policyVersion: 2, teaching: 'explore', request: null, acknowledgedClose: true },
  { type: 'enter_problem', ...P1 }];
const run = (evs) => evs.reduce((c, e) => apply(c, e), initialContext('p0', 1, 'a0'));
let c = run(base);
console.log('after return to p1:', JSON.stringify({ pendingClose: c.pendingClose, policyVersion: c.policyVersion }));
c = apply(c, { type: 'remote_policy', binding: P1, policyVersion: 3, teaching: 'help', request: later });
console.log('ack only once (while away), later explicit iPhone request v3 without ack flag:', JSON.stringify(decide(c, it(c, 'rr-later'))), 'pendingClose', c.pendingClose);
c = run([...base, { type: 'remote_policy', binding: P1, policyVersion: 3, teaching: 'help', request: later, acknowledgedClose: true }]);
console.log('control: ack repeated on v3:', JSON.stringify(decide(c, it(c, 'rr-later'))), 'pendingClose', c.pendingClose);
