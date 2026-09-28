// QA 06 adversarial probe of the P0-12 TEST-ONLY disclosure model at 71f1389.
// Usage: node probes/adversarial.mjs [path-to-disclosure-model.ts]
import { pathToFileURL } from 'node:url';
const modelPath = process.argv[2] ?? new URL('../apps/safari-extension/tests/p0-12/disclosure-model.ts', import.meta.url).pathname;
const { initialContext, apply, decide, preferenceKey, cacheHit } = await import(pathToFileURL(modelPath).href);

const B = { problemId: 'p1', problemVersion: 1, attemptId: 'a1' };
const R = (id, level, origin = 'other_device', scope = null) => ({ id, level, scope, origin });
const item = (ctx, id, level, requestId, channel = 'card', extra = {}) => ({
  id, channel, ...B, basisRevision: ctx.attemptRevision, requestId, level, scope: null,
  preferenceKey: preferenceKey(ctx), derivedFrom: [], ...extra,
});
const run = (events) => events.reduce((c, e) => apply(c, e), apply(initialContext('p0', 1, 'a0'), { type: 'enter_problem', ...B }));
const show = (name, ctx, it, want) => {
  const d = decide(ctx, it);
  const ok = d.present === want;
  console.log(`${ok ? 'HELD ' : 'FAIL '} ${name}: present=${d.present} reason=${d.reason} expected=${want} | pendingClose=${ctx.pendingClose} policyVersion=${ctx.policyVersion} active=${ctx.activeRequest?.id ?? null}@${ctx.activeRequest?.level ?? '-'} permission=${ctx.permission.level}`);
  return ok;
};
const remote = (v, request, extra = {}) => ({ type: 'remote_policy', binding: B, policyVersion: v, teaching: request ? 'help' : 'explore', request, ...extra });
const reconnect = (v, request, extra = {}) => ({ type: 'reconnect', binding: B, policyVersion: v, teaching: request ? 'help' : 'explore', request, acceptedProvisional: [], acknowledgedClose: false, ...extra });

const sol = R('rr-sol', 'full_solution');

// S1: "let me try" said while connected (not yet reflected in any server version),
// brief disconnect, reconnect snapshot at the SAME version the device already had
// before saying it. That snapshot cannot contain the close.
let c = run([remote(1, sol), { type: 'let_me_try' }, { type: 'disconnect' }, reconnect(1, sol)]);
show('S1 connected let_me_try, reconnect with same pre-close version v1', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);

// S1b: same, but the connected close is in flight and a newer server version (ordered before the close arrived) still carries the old request.
c = run([remote(1, sol), { type: 'let_me_try' }, remote(2, sol)]);
show('S1b connected let_me_try in flight, newer v2 still carrying old request', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);

// S1c: user lowers help on this device while connected ("just a hint"), brief disconnect, same-version reconnect.
c = run([remote(1, sol), { type: 'request', request: R('r-mine', 'key_concept', 'this_device') }, { type: 'disconnect' }, reconnect(1, sol)]);
show('S1c connected lower request, reconnect same v1: old full solution', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);

// Control for S1: same sequence with the close said OFFLINE is blocked (the lead's fix).
c = run([remote(1, sol), { type: 'disconnect' }, { type: 'let_me_try' }, reconnect(1, sol)]);
show('S1-control offline let_me_try, reconnect same v1', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);

// S2: offline explicit full-solution request accepted at reconnect, but the SAME snapshot
// says teaching=explore / request=null (e.g. "let me try" on the iPhone ordered after it).
c = run([{ type: 'disconnect' }, { type: 'request', request: R('r-off', 'full_solution', 'this_device') }, reconnect(5, null, { acceptedProvisional: ['r-off'] })]);
show('S2 accepted provisional, snapshot v5 says explore/request=null', c, item(c, 'off', 'full_solution', 'r-off'), false);
c = apply(c, remote(5, null));
show('S2 ...and a v5 resync cannot correct it', c, item(c, 'off', 'full_solution', 'r-off'), false);
console.log('     S2 teaching after snapshot(explore):', c.teaching);

// S3 (liveness): unsynced close; connected later local request; server echoes it (accepted) without the ack flag;
// then an explicit, causally later full-solution request from the iPhone.
c = run([remote(1, sol), { type: 'disconnect' }, { type: 'let_me_try' }, reconnect(1, sol),
  { type: 'request', request: R('r-mine', 'key_concept', 'this_device') },
  remote(2, R('r-mine', 'key_concept', 'this_device')),
  remote(3, R('rr-later', 'full_solution'))]);
show('S3 server accepted later connected request, then later iPhone full-solution request (liveness)', c, item(c, 'later', 'full_solution', 'rr-later'), true);

// S4: late remote help request (made on the iPhone before it saw the iPad retraction) arriving after the retraction.
c = run([remote(1, R('rr-hint', 'key_concept')), { type: 'let_me_try' }, remote(2, null), remote(3, R('rr-late', 'full_solution'))]);
show('S4 late unordered iPhone request after connected retraction (no causal field exists)', c, item(c, 'late', 'full_solution', 'rr-late'), false);

// ---- checks expected to HOLD ------------------------------------------------
// H1: pause/erase/wrong_step/time never escalate after "let me try".
c = run([remote(1, sol), { type: 'let_me_try' }, { type: 'pause' }, { type: 'erase' }, { type: 'wrong_step' }, { type: 'time_passes' }]);
show('H1 let_me_try then pause/erase/wrong_step/time', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);
// H2: unknown order kept restrictive: offline close, reconnect no ack, v2/v3 carrying old request, foreign snapshot with ack, older ack.
c = run([remote(1, sol), { type: 'disconnect' }, { type: 'let_me_try' }, reconnect(1, sol), remote(2, sol), remote(3, sol, { acknowledgedClose: false }),
  { type: 'remote_policy', binding: { problemId: 'p2', problemVersion: 1, attemptId: 'a2' }, policyVersion: 99, teaching: 'help', request: sol, acknowledgedClose: true }, remote(2, sol, { acknowledgedClose: true })]);
show('H2 unacked close vs newer/foreign/older-ack snapshots', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);
// H3: leave/return while offline and while connected.
c = run([remote(1, sol), { type: 'disconnect' }, { type: 'let_me_try' }, { type: 'enter_problem', problemId: 'p2', problemVersion: 1, attemptId: 'a2' }, { type: 'enter_problem', ...B }, reconnect(2, sol),
  { type: 'enter_problem', problemId: 'p3', problemVersion: 1, attemptId: 'a3' }, { type: 'enter_problem', ...B }, remote(3, sol)]);
show('H3 leave/return (offline then connected), newer snapshot with old request', c, item(c, 'sol', 'full_solution', 'rr-sol'), false);
// H4: only acknowledgement / causally-later request lifts refusal; then explicit solution is honored.
c = apply(c, remote(4, R('rr-new', 'full_solution'), { acknowledgedClose: true }));
show('H4 ack + causally later explicit full solution is honored (liveness)', c, item(c, 'new', 'full_solution', 'rr-new'), true);
// H5: explicit local solution request honored while close unacked (liveness), on screen only while offline.
c = run([remote(1, sol), { type: 'disconnect' }, { type: 'let_me_try' }, { type: 'request', request: R('r-full', 'full_solution', 'this_device') }, { type: 'voice_mode', mode: 'discussion' }]);
show('H5 offline explicit full solution on card', c, item(c, 'f', 'full_solution', 'r-full'), true);
show('H5 ...but not as voice while offline', c, item(c, 'fv', 'full_solution', 'r-full', 'voice'), false);
show('H5 ...nor as a notification preview', c, item(c, 'fn', 'full_solution', 'r-full', 'notification'), false);
// H6: stale cache: full solution cached, "let me try", hint request -> no hit; correction -> no hit at old revision.
c = run([{ type: 'request', request: R('r-sol', 'full_solution', 'this_device') }]);
const cached = [item(c, 'cached-sol', 'full_solution', 'r-sol'), item(c, 'cached-hint-title', 'key_concept', 'r-sol', 'title', { derivedFrom: ['full_solution'] })];
c = run([{ type: 'request', request: R('r-sol', 'full_solution', 'this_device') }, { type: 'let_me_try' }, { type: 'request', request: R('r-hint', 'key_concept', 'this_device') }]);
const hit = cacheHit(c, c.activeRequest, cached);
console.log(`${hit ? 'NOTE ' : 'HELD '} H6 cache after let_me_try + key_concept request: hit=${hit?.id ?? null}${hit ? ` decide=${JSON.stringify(decide(c, hit))}` : ''}`);
c = apply(c, { type: 'attempt_revised', revision: 1 });
console.log(`HELD? H6b cache after correction: hit=${cacheHit(c, { ...c.activeRequest, level: 'full_solution' }, cached)?.id ?? null}`);
