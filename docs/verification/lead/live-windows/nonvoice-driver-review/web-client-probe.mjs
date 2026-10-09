// Exact-source client review, in-process streams only. No real child, native API or account.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
assert.ok(root);
const source = `${root}/apps/windows/src/main/source-admission.ts`;
const { SourceChecker, readAdmissionConfig } = await import(pathToFileURL(source));
const { fakeCheckers } = await import(pathToFileURL(`${root}/apps/windows/tests/admission-fakes.ts`));
const config = { command: '/synthetic/checker', args: [], ready_ms: 1000, decision_ms: 100 };
const ask = { phase: 'pre_acquire', capture_id: '0123456789abcdef', display: null, overlay: null,
  sample_seq: 1, frame_seq: null, raw_sha256: null, raw_size: null, request_id: null, image_sha256: null };
const tick = () => new Promise(r => setImmediate(r));
const block = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const observations = [];
async function decide(name, delay) {
  const f = fakeCheckers(c => { c.mode = 'hold'; });
  const c = new SourceChecker({ config, spawn: f.spawn, endMs: 10 });
  assert.equal(await c.open(), null);
  const pending = c.decide(ask);
  await tick();
  if (delay) block(delay); // response callback runs after elapsed deadline, before timer callback
  f.last().reply(f.last().waiting());
  const result = await pending;
  observations.push({ name, result, expected_allowed: delay === 0 });
  assert.equal(result.ok, true, 'frozen candidate outcome');
  if (delay) assert.ok(result.ms >= config.decision_ms);
  await c.close();
}
await decide('within-deadline control', 0);
await decide('reply after deadline before delayed timer callback', 150);
for (const delayed of [false, true]) {
  const f = fakeCheckers(c => { c.autoReady = false; });
  const c = new SourceChecker({ config, spawn: f.spawn, endMs: 10 });
  const pending = c.open();
  if (delayed) block(1050);
  f.last().write(`${delayed ? '' : '\uFEFF'}{"format":"lc-source-admission/1","ready":true}`);
  const result = await pending;
  assert.equal(result, null, 'frozen candidate accepts ready');
  observations.push({ name: delayed ? 'ready after deadline before delayed timer callback' : 'BOM-prefixed ready accepted', result, expected_ready: false });
  await c.close();
}
const conf = { format: 'lc-windows-source-admission-config/v1', checker: { command: config.command, args: [] }, ready_ms: 1000, decision_ms: 100 };
const bomConfig = readAdmissionConfig({ LC_SOURCE_ADMISSION: 'synthetic' }, () => '\uFEFF' + JSON.stringify(conf));
assert.ok(bomConfig.error);
observations.push({ name: 'BOM-prefixed config rejection control', refused: true });
console.log(JSON.stringify({ source_commit: '48c20c410dc49c7805fa775013501222116cd2b3',
  source_sha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
  scope: 'In-memory child/streams; bounded event-loop stalls; no Windows, native, account, provider or actual process spawn.', observations }, null, 2));
