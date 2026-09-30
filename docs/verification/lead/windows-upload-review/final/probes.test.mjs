// Exact f21b2c3 final correction review. Only injected fetch; no listener, Backend, native UI or provider.
// Adapted into a NEW file from the preserved 6c4ac03 lead probe. Not a server-commit claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { frameRequest } from '/tmp/lc-windows-uploader-f21/apps/windows/src/shared/frame-ingress.ts';
import { ackProblem, isUtcTimestamp, uploadRetained } from '/tmp/lc-windows-uploader-f21/apps/windows/src/main/uploader.ts';
const root = '/tmp/lc-windows-uploader-f21';
const evidence = root + '/docs/verification/web/evidence/';
const fixture = JSON.parse(readFileSync(evidence + 'windows-frame-ingress/harness-ink.json', 'utf8'));
const token = 'synthetic-review-token-only-0123456789abcdef';
const job = () => ({capture_dir: dirname(evidence + fixture.manifest), plan: structuredClone(fixture.plan), prepared: frameRequest(readFileSync(evidence + fixture.manifest, 'utf8').replace(/\r\n/g, '\n'), fixture.plan)});
const authority = () => ({origin: 'http://127.0.0.1:51234', token, expires_at: '2099-01-01T00:00:00Z', owner: fixture.plan.source, incarnation: {device_id: fixture.plan.device_id, session_id: fixture.plan.session_id, stream_id: fixture.plan.stream_id}});
const ackFor = b => ({contract_version: '0.2.0', batch_id: b.batch_id, user_id: b.records[0].source.user_id, device_id: b.device_id, session_id: b.session_id, stream_id: b.stream_id, acknowledged: b.records.map(r => ({record_id: r.record_id, sequence: r.sequence, disposition: 'accepted', received_at: '2026-09-30T17:00:00Z', envelope: 'committed', artifacts: r.artifacts.map(a => ({...a, status: 'verified'}))}))});
const response = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const typed = (status, error, version = '0.2.4') => response(status, {contract_version: version, error, retryable: ['dependency_missing', 'unavailable'].includes(error)});
const normal = (url, init) => {
  const parsed = JSON.parse(init.body);
  if (init.method === 'PUT') {const {data_base64, ...receipt} = parsed; return response(200, {...receipt, status: 'bytes_committed'});}
  return response(200, ackFor(parsed.batch));
};
const findings = [];
function note(name, value) {findings.push({name, ...value}); writeFileSync('/tmp/windows-uploader-f21-probes.json', JSON.stringify(findings, null, 2) + '\n');}
async function run(fetcher, opts = {}, a = authority(), j = job()) {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {seen.push({url, method: init.method, body: init.body, key: init.headers['Idempotency-Key']}); return fetcher(url, init, seen);};
  try {return {result: await uploadRetained(a, j, {pause_ms: 0, ...opts}), seen};}
  finally {globalThis.fetch = originalFetch;}
}
const summary = ({result, seen}) => ({status: result.status, stage: result.stage ?? null, in_doubt: result.in_doubt ?? null, originals: result.originals.length, requests: seen.length, http_status: result.http_status ?? null, error: result.error ?? null});
function identical(a, b) {assert.equal(a.body, b.body); assert.equal(a.key, b.key); assert.equal(a.url, b.url);}

test('control: seven exact originals then corresponding ACK commit', async () => {
  const out = await run(normal);
  assert.equal(out.result.status, 'committed'); assert.equal(out.result.originals.length, 7); assert.equal(out.seen.length, 8);
  note('valid_control', summary(out));
});
test('corrected: reflected response bodies are unknown and content-free', async () => {
  for (const answer of [() => response(403, {error: 'server reflection ' + token}), () => response(403, {contract_version: '0.2.4', error: token, retryable: false}), () => new Response(token, {status: 500}), () => new Response(token, {status: 200})]) {
    const out = await run(answer); assert.equal(out.result.status, 'unknown'); assert.ok(out.result.in_doubt); assert.equal(out.seen.length, 3); assert.equal(out.result.error, undefined); assert.ok(!JSON.stringify(out.result).includes(token));
  }
  note('response_body_redaction', {cases: 4, bounded_requests_each: 3, pass: true});
});
test('corrected: first wrong ACK stays unknown, then valid retry resolves exactly', async () => {
  const corrupt = (url, init) => {if (init.method === 'PUT') return normal(url, init); const a = ackFor(JSON.parse(init.body).batch); a.batch_id = 'different-batch'; return response(200, a);};
  const out = await run(corrupt); assert.equal(out.result.status, 'unknown'); assert.equal(out.result.in_doubt, 'batch'); assert.equal(out.result.originals.length, 7); assert.equal(out.seen.length, 10); identical(out.seen[7], out.seen[8]); identical(out.seen[8], out.seen[9]);
  let batches = 0;
  const recovered = await run((url, init) => init.method === 'POST' && ++batches === 1 ? corrupt(url, init) : normal(url, init));
  assert.equal(recovered.result.status, 'committed'); assert.equal(recovered.seen.length, 9); identical(recovered.seen[7], recovered.seen[8]);
  note('first_200_wrong_ack', {...summary(out), retry_can_resolve: true});
});
test('corrected: first wrong original receipt stays unknown, no batch; typed refusal cannot erase doubt', async () => {
  const corrupt = (url, init) => {const {data_base64, ...receipt} = JSON.parse(init.body); return response(200, {...receipt, status: 'pending'});};
  const out = await run(corrupt); assert.equal(out.result.status, 'unknown'); assert.ok(out.result.in_doubt); assert.equal(out.result.originals.length, 0); assert.equal(out.seen.length, 3); identical(out.seen[0], out.seen[1]);
  const refused = await run((url, init, seen) => seen.length === 1 ? corrupt(url, init) : typed(403, 'forbidden'));
  assert.equal(refused.result.status, 'unknown'); assert.equal(refused.result.in_doubt, out.result.in_doubt); assert.equal(refused.result.error, 'forbidden'); assert.equal(refused.seen.length, 2);
  note('first_200_wrong_original', {...summary(out), subsequent_refusal_preserves_doubt: true});
});
test('corrected: 503 followed by capture_stopped preserves batch doubt and exact retry', async () => {
  let batches = 0;
  const out = await run((url, init) => init.method === 'PUT' ? normal(url, init) : ++batches === 1 ? typed(503, 'unavailable', '0.2.10') : typed(409, 'capture_stopped', '0.2.10'));
  assert.equal(out.result.status, 'unknown'); assert.equal(out.result.in_doubt, 'batch'); assert.equal(out.result.http_status, 409); assert.equal(out.result.error, 'capture_stopped'); assert.equal(out.seen.length, 9); identical(out.seen[7], out.seen[8]);
  note('503_then_409', summary(out));
});
test('typed error boundary: closed route version/status/retryable and dependency_missing', async () => {
  const variants = [
    [403, {contract_version: '0.2.10', error: 'forbidden', retryable: false}],
    [403, {contract_version: '0.2.4', error: 'forbidden', retryable: true}],
    [403, {contract_version: '0.2.4', error: 'forbidden', retryable: false, text: token}],
    [403, {contract_version: '0.2.4', error: 'capture_stopped', retryable: false}],
    [500, {contract_version: '0.2.4', error: 'unavailable', retryable: true}],
  ];
  for (const [status, body] of variants) {const out = await run(() => response(status, body)); assert.equal(out.result.status, 'unknown'); assert.ok(out.result.in_doubt); assert.equal(out.seen.length, 3);}
  const valid = await run(() => typed(403, 'forbidden')); assert.equal(valid.result.status, 'refused'); assert.equal(valid.seen.length, 1); assert.equal(valid.result.in_doubt, undefined);
  const missing = await run(() => typed(409, 'dependency_missing')); assert.equal(missing.result.status, 'unknown'); assert.equal(missing.result.in_doubt, undefined); assert.equal(missing.seen.length, 1);
  note('typed_error_boundary', {unknown_cases: variants.length, valid_refusal: summary(valid), dependency_missing: summary(missing)});
});
test('corrected: real-calendar ACK and expiry boundaries', async () => {
  const dates = ['2026-02-30T17:00:00Z', '1900-02-29T00:00:00Z', '0000-01-01T00:00:00Z', '2026-09-30T24:00:00Z', '2026-09-30T00:00:60Z', '2026-09-30T00:00:00z', '2026-09-30T00:00:00+00:00'];
  const validDates = ['2000-02-29T23:59:59.123456789Z', '0001-01-01T00:00:00Z', '0099-01-01t00:00:00Z', '9999-12-31T23:59:59Z'];
  const j = job();
  for (const t of [...dates, ...validDates]) {const ack = ackFor(j.prepared.request.batch); ack.acknowledged[0].received_at = t; assert.equal(isUtcTimestamp(t), validDates.includes(t)); assert.equal(ackProblem(j.prepared.request, ack, fixture.plan.source) === null, validDates.includes(t));}
  for (const t of dates) {const out = await run(normal, {}, {...authority(), expires_at: t}); assert.equal(out.result.status, 'refused'); assert.equal(out.result.stage, 'local'); assert.equal(out.seen.length, 0);}
  const exact = Date.parse('2099-01-01T00:00:00Z');
  const expired = await run(normal, {now: () => exact}); assert.equal(expired.result.status, 'refused'); assert.equal(expired.seen.length, 0);
  let n = 0; const during = await run(() => typed(503, 'unavailable'), {now: () => ++n >= 3 ? exact : exact - 1});
  assert.equal(during.result.status, 'unknown'); assert.ok(during.result.in_doubt); assert.equal(during.seen.length, 1);
  note('timestamp_boundary', {dates: [...dates, ...validDates].map(t => ({value: t, valid: isUtcTimestamp(t)})), expires_at_equality_refused: true, expiry_after_uncertainty: summary(during)});
});
test('control: ACK closed identity/artifacts/sequence and verified-only', () => {
  const j = job();
  const cases = [a => a.acknowledged.push(a.acknowledged[0]), a => a.acknowledged[0].sequence++, a => a.acknowledged[0].artifacts[0].status = 'pending', a => a.acknowledged[0].artifacts[0].sha256 = '0'.repeat(64), a => a.acknowledged[0].received_at = null, a => a.acknowledged[0].extra = true, a => a.user_id = 'foreign'];
  for (const mutate of cases) {const ack = ackFor(j.prepared.request.batch); mutate(ack); assert.notEqual(ackProblem(j.prepared.request, ack, fixture.plan.source), null);}
  note('ack_closed_boundaries', {cases: cases.length, pass: true});
});
test('control: in-flight abort and retry-pause abort retain uncertainty; no next send', async () => {
  const abort = new AbortController();
  const out = await run((url, init) => new Promise((resolve, reject) => {init.signal.addEventListener('abort', () => reject(new Error('synthetic abort')), {once: true}); queueMicrotask(() => abort.abort());}), {signal: abort.signal});
  assert.equal(out.result.status, 'cancelled'); assert.ok(out.result.in_doubt); assert.equal(out.seen.length, 1);
  const pause = new AbortController();
  const paused = await run(() => {setTimeout(() => pause.abort(), 5); return typed(503, 'unavailable');}, {signal: pause.signal, pause_ms: 1000});
  assert.equal(paused.result.status, 'cancelled'); assert.ok(paused.result.in_doubt); assert.equal(paused.seen.length, 1);
  const before = new AbortController(); before.abort(); const untouched = await run(normal, {signal: before.signal}); assert.equal(untouched.result.status, 'cancelled'); assert.equal(untouched.seen.length, 0);
  note('cancellation_controls', {in_flight: summary(out), retry_pause: summary(paused), preflight: summary(untouched)});
});
test('control: lost answer then typed403 retains unknown; later separate call refusal does not assert historical absence', async () => {
  const lost = await run((url, init, seen) => {if (seen.length === 1) throw new Error('synthetic lost answer'); return typed(403, 'forbidden');});
  assert.equal(lost.result.status, 'unknown'); assert.ok(lost.result.in_doubt); assert.equal(lost.seen.length, 2); identical(lost.seen[0], lost.seen[1]);
  const later = await run(() => typed(403, 'forbidden')); assert.equal(later.result.status, 'refused'); assert.equal(later.result.in_doubt, undefined); assert.equal(later.seen.length, 1);
  note('call_scope_limit', {first_call: summary(lost), later_call: summary(later), requirement: 'Future trusted parent must keep first-call doubt; no historical absence inferred.'});
});
test('control: later caller mutation cannot change authority, body, retry key or acknowledged IDs', async () => {
  const a = authority(), j = job(), baseline = structuredClone(j.prepared);
  const out = await run((url, init, seen) => {if (seen.length === 1) {a.token = 'mutated'; a.owner = {user_id: 'foreign', source_id: 'foreign', source_version: 'foreign'}; j.prepared.body = '{}'; j.prepared.idempotency_key = 'different'; j.plan.entries[0].record_id = 'changed';} return normal(url, init);}, {}, a, j);
  assert.equal(out.result.status, 'committed'); assert.equal(out.seen.at(-1).body, baseline.body); assert.equal(out.seen.at(-1).key, baseline.idempotency_key);
  note('owned_inputs_control', {...summary(out), exact_batch: true});
});
test('redaction edge: a short code-shaped bearer must not survive a fetch cause.code', async () => {
  // Same fault-injection seam as owner's redaction test, but 32 accepted characters rather than its >41-char token.
  // This is NOT evidence that actual Node fetch can derive cause.code from an HTTP response or leak a real token.
  const shortToken = 'SYNTHETICREVIEWBEARERONLYABCDEFG';
  assert.equal(shortToken.length, 32);
  const out = await run(() => {throw new TypeError('fetch failed', {cause: Object.assign(new Error('synthetic'), {code: shortToken})});}, {attempts: 1}, {...authority(), token: shortToken});
  const leaks = JSON.stringify(out.result).includes(shortToken);
  note('short_code_redaction_edge', {...summary(out), token_in_result: leaks, boundary: 'Injected fetch exception; native Node transport origin for such code NOT established.'});
  assert.equal(leaks, false, 'a supported 32-character bearer survives the short-code shape filter');
});

// Narrow additional correction control: arbitrary local Error.name, with and without earlier doubt.
test('correction: arbitrary error.name is content-free; partial receipts and prior doubt survive; fixed diagnostics remain', async () => {
  const bearer = 'SYNTHETICREVIEWBEARERONLYABCDEFG';
  const results = [];
  for (const uncertain of [false, true]) {
    let calls = 0;
    const out = await run(uncertain ? () => {throw new TypeError('synthetic connection loss');} : normal,
      {now: () => {if (++calls === 3) throw Object.assign(new Error('synthetic local failure'), {name: bearer}); return Date.parse('2026-09-30T17:00:00Z');}},
      {...authority(), token: bearer});
    assert.equal(JSON.stringify(out.result).includes(bearer), false);
    assert.match(out.result.reason, /unexpected local error \(other\)/);
    assert.equal(out.result.status, uncertain ? 'unknown' : 'refused');
    assert.equal(out.result.originals.length, uncertain ? 0 : 1);
    assert.equal(Boolean(out.result.in_doubt), uncertain);
    assert.equal(out.seen.length, 1);
    results.push({...summary(out), arbitrary_name_redacted: true});
  }
  const known = await run(() => {throw new TypeError('synthetic connection loss', {cause: {code: 'ECONNRESET'}});}, {attempts: 1});
  assert.equal(known.result.status, 'unknown'); assert.match(known.result.reason, /no answer \(ECONNRESET\)/);
  let calls = 0;
  const knownName = await run(normal, {now: () => {if (++calls === 3) throw new RangeError('synthetic local failure'); return Date.parse('2026-09-30T17:00:00Z');}});
  assert.equal(knownName.result.status, 'refused'); assert.equal(knownName.result.originals.length, 1); assert.match(knownName.result.reason, /unexpected local error \(RangeError\)/);
  note('local_error_name_and_fixed_controls', {cases: results, fixed_cause_code_preserved: true, fixed_error_name_preserved: true});
});
