// Adapted from windows_admission_9c3beab_latched_failure.mjs: final pins, holding declaration and fixed-case expectations only.
// SYNTHETIC ONLY. Run exact exported SourceChecker and main consumer functions against
// in-memory pipes, storage and connector. No native code, child, network or disk writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.argv[2];
assert.ok(root, 'pass the immutable 4778908 export');
const base = join(root, 'apps/windows/src/main');
const pins = {
  'main.ts': '078aa8067ffd5f54a83704158d86ba6de4597d6fd271d3ed090c38fb06ffeb84',
  'source-admission.ts': 'e7ab238fa98b53116f4c0d6acaa2ed14a871be1299fc20c7cf018509d4c43602',
};
for (const [name, hash] of Object.entries(pins))
  assert.equal(createHash('sha256').update(readFileSync(join(base, name))).digest('hex'), hash);
const source = stripTypeScriptTypes(readFileSync(join(base, 'main.ts'), 'utf8'));
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'exact source extraction anchors');
  return source.slice(a, b);
}
const consumers = between('const sameMembers =', '\nfunction retainFrame(')
  + between('async function sendTurn(', '\n/**\n * A frame kept as a material step');
const { SourceChecker } = await import(pathToFileURL(join(base, 'source-admission.ts')));
const turnLoop = () => new Promise(resolve => setImmediate(resolve));
const rows = [];

async function scenario(name, phase, response) {
  const child = new EventEmitter();
  child.pid = 987654; // synthetic identity, never inspected or signalled
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.kill = () => { throw new Error('the fake must exit on input close'); };
  child.stdin.on('finish', () => setImmediate(() => child.emit('exit', 0, null)));
  const requests = [];
  child.stdin.on('data', bytes => {
    const request = JSON.parse(bytes.toString());
    requests.push(request);
    const { sent_at, ...echo } = request;
    const line = JSON.stringify({ ...echo, verdict: response === 'deny' ? 'deny' : 'allow', reason: null });
    // One data chunk: the consumer cannot claim that the second line arrived after its send.
    child.stdout.write(response === 'replay' ? `${line}\n${line}\n` : `${line}\n`);
  });
  const checker = new SourceChecker({
    config: { command: '/synthetic/not-executed', args: [], ready_ms: 1000, decision_ms: 1000 },
    spawn: () => { setImmediate(() => child.stdout.write('{"format":"lc-source-admission/1","ready":true}\n')); return child; },
    endMs: 50,
  });
  const records = [], calls = [], ends = [];
  const live = { ended: null, out: 0, used: 0, id: 'synthetic-live' };
  const s = {
    ending: false, live, retention: { id: 'a'.repeat(16) },
    display: { bounds: { width: 2, height: 2 }, scale_factor: 1 },
    admission: { checker, ticket: { sample_seq: 1, ticket: 'ticket' }, admitted: new Map(), violation: null },
  };
  const sandbox = {
    current: s, randomBytes, HOLDING_MAX: 16,
    isSeq: x => Number.isSafeInteger(x) && x > 0,
    isObj: x => x !== null && typeof x === 'object' && !Array.isArray(x),
    isHex: (x, n) => typeof x === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(x),
    recordAdmission: (_s, row) => { records.push(row); return true; },
    end: reason => { s.ending = true; live.ended = reason; ends.push(reason); },
    notifyLive: () => {}, appendLive: () => {}, suspends: () => false,
    endLive: (_s, l, reason) => { l.ended = reason; },
    subscription: { turn: async t => { calls.push({ request_id: t.request_id, failure_at_call: checker.failure, ending_at_call: s.ending }); return { status: 'answered', submission: 'acknowledged' }; } },
  };
  vm.runInNewContext(consumers + '\nglobalThis.review = {sendTurn, admitFrame, violate};', sandbox);
  checker.onFailure = why => sandbox.review.violate(s, why);
  try {
    assert.equal(await checker.open(), null);
    const frame = { source: { capture_id: s.retention.id, sample_seq: 1, frame_seq: 1, raw_sha256: 'b'.repeat(64), width: 2, height: 2 } };
    const turn = { request_id: 'synthetic-request', image: { sha256: 'c'.repeat(64) }, context: { frame_seq: 7, ink_revision: 0, ink_sha256: null }, trigger: 'focus' };
    const result = phase === 'send'
      ? await sandbox.review.sendTurn(s, live, turn, frame)
      : await sandbox.review.admitFrame(s, 'post', 1, { ticket: 'ticket', raw_sha256: 'b'.repeat(64), width: 2, height: 2 });
    const atReturn = { failure: checker.failure, ending: s.ending, calls: calls.length, admitted: s.admission.admitted.has(1) };
    await turnLoop();
    const row = { name, phase, response, result, at_return: atReturn, connector_calls: calls, ended_after_notification: s.ending, decisions: records.filter(x => x.kind === 'decision').map(x => ({ phase: x.phase, allowed: x.allowed })) };
    assert.equal(requests.length, 1);
    if (response === 'allow') { assert.equal(calls.length, 1); assert.equal(checker.failure, null); assert.equal(s.ending, false); }
    if (response === 'deny') { assert.equal(calls.length, 0); assert.equal(s.ending, true); }
    if (response === 'replay') {
      assert.match(atReturn.failure, /answered a request again/);
      assert.equal(s.ending, true, 'the eventual callback does stop the capture');
      if (phase === 'send') { assert.equal(calls.length, 0); assert.equal(result.submission, 'not_submitted'); }
      else { assert.equal(result.ok, false); assert.equal(atReturn.admitted, false); }
      assert.equal(atReturn.ending, true, 'failure fences before the consumer returns');
    }
    rows.push(row);
  } finally { await checker.close(); }
}

await scenario('single allow is delivered', 'send', 'allow');
await scenario('deny fences the connector', 'send', 'deny');
await scenario('known replay failure fences connector', 'send', 'replay');
await scenario('known replay failure rejects acquired frame', 'post_acquire', 'replay');
assert.equal(rows.length, 4);
console.log(JSON.stringify({ source: '477890829c4afe880a151f3ce151b98b97405414', controls: 2, fixed_regressions: 2,
  scope: 'Actual checker and extracted main consumers; in-memory boundary stubs; no full Electron/native/provider execution.', rows }, null, 2));
