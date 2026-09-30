// The live planner (src/shared/capture-plan.ts): whole manifest lines after the last one planned, one record per event,
// identities derived from manifest facts, splits, unsendable lines, and nothing live once the session shows its end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EVIDENCE } from '../scripts/ingress-fixtures.ts';
import { planNext, identities, MAX_SOURCE_ID, type StreamFacts } from '../src/shared/capture-plan.ts';
import { uploadRetained } from '../src/main/uploader.ts';
import type { Transport } from '../src/main/loopback-http.ts';

const read = (name: string): string => fs.readFileSync(path.join(EVIDENCE, 'windows-frame-ingress', name, 'manifest.jsonl'), 'utf8').replace(/\r\n/g, '\n');
const cut = (text: string, lines: number): string => text.split('\n').slice(0, lines).join('\n') + '\n';
const INK = read('harness-ink-capture');
const PLAIN = read('harness-capture');
const session = (text: string): string => JSON.parse(text.split('\n')[0]!).capture_session;
const facts = (text: string): StreamFacts => ({ device_id: 'dev-1', session_id: 'sess-1', stream_id: 'stream-1', source: { user_id: 'lc-windows-http-0123456789abcdef0123456789abcdef', source_id: 'src-0123456789abcdef01234567', source_version: 1 }, capture_session: session(text) });

test('whole lines after the last planned become one record each, with identities from manifest facts', () => {
  const text = cut(INK, 5); // header and four retained frames, before the end
  const f = facts(text);
  const p = planNext(text, f, 0);
  assert.equal(p.kind, 'job');
  if (p.kind !== 'job') return;
  const id = identities(f.source.source_id);
  assert.deepEqual([p.from_line, p.through_line, p.plan.batch_id, p.plan.idempotency_key, p.plan.delivery_mode], [2, 5, id.batch(2, 5), id.batch(2, 5), 'live']);
  assert.deepEqual(p.plan.entries.map((e) => [e.kind, e.record_id, e.sequence]), [2, 3, 4, 5].map((l) => ['frame', id.record(l), l]));
  for (const e of p.plan.entries) {
    if (e.kind !== 'frame') continue;
    const line = JSON.parse(text.split('\n')[e.sequence - 1]!);
    assert.equal(e.frame_id, id.frame(line.sample_seq));
    assert.equal(e.raw.artifact.artifact_id, id.png(line.raw.sha256));
    assert.equal(e.composed?.artifact.artifact_id, id.png(line.composed.sha256));
    assert.deepEqual(e.ink?.artifact, { artifact_id: id.ink(line.composed.ink_original.sha256), sha256: line.composed.ink_original.sha256, byte_length: line.composed.ink_original.bytes, media_type: 'application/json' });
  }
  assert.equal(JSON.parse(p.prepared.body).batch.records.length, 4);
  // The same lines always give the same identities and the same bytes.
  const again = planNext(text, f, 0);
  assert.equal(again.kind === 'job' && again.prepared.body, p.prepared.body);
  assert.ok(id.png('f'.repeat(64)).length <= 128 && 'src-0123456789abcdef01234567'.length <= MAX_SOURCE_ID);
});

test('a batch holds at most the record limit; the next starts after it; then nothing is new', () => {
  const text = cut(INK, 5);
  const f = facts(text);
  const a = planNext(text, f, 0, 2);
  assert.deepEqual(a.kind === 'job' && [a.from_line, a.through_line], [2, 3]);
  const b = planNext(text, f, 3, 2);
  assert.deepEqual(b.kind === 'job' && [b.from_line, b.through_line], [4, 5]);
  assert.deepEqual(planNext(text, f, 5, 2), { kind: 'none' });
});

test('other events become coverage records; nothing is planned live once the manifest shows the end', () => {
  const text = cut(PLAIN, 7); // before the unfinished line
  const p = planNext(text, facts(text), 0);
  assert.deepEqual(p.kind === 'job' && p.plan.entries.map((e) => [e.kind, e.sequence]), [['frame', 2], ['coverage', 3], ['coverage', 4], ['frame', 5], ['coverage', 6], ['frame', 7]]);
  assert.deepEqual(planNext(PLAIN, facts(PLAIN), 0), { kind: 'ended', line: 8 }, 'unfinished shows the end');
  assert.deepEqual(planNext(INK, facts(INK), 0), { kind: 'ended', line: 6 });
  assert.deepEqual(planNext(INK, facts(INK), 5), { kind: 'ended', line: 6 });
});

test('a line the mapper cannot map is split off and unsendable; the lines around it are still planned', () => {
  const lines = cut(INK, 5).split('\n');
  const third = JSON.parse(lines[2]!);
  third.raw.bytes = 40_000_000; // over the 32 MiB original limit
  lines[2] = JSON.stringify(third);
  const text = lines.join('\n');
  const f = facts(text);
  const first = planNext(text, f, 0);
  assert.deepEqual(first.kind === 'job' && [first.from_line, first.through_line], [2, 2]);
  const second = planNext(text, f, 2);
  assert.equal(second.kind, 'unsendable');
  assert.match(second.kind === 'unsendable' ? `${second.line} ${second.reason}` : '', /^3 .*limit/);
  const third2 = planNext(text, f, 3);
  assert.deepEqual(third2.kind === 'job' && [third2.from_line, third2.through_line], [4, 5]);
});

test('a torn last line is not read, and another session\'s manifest is refused', () => {
  const text = cut(INK, 3) + '{"kind":"retained","sample_se';
  const p = planNext(text, facts(text), 0);
  assert.deepEqual(p.kind === 'job' && [p.from_line, p.through_line], [2, 3]);
  assert.throws(() => planNext(cut(INK, 5), { ...facts(INK), capture_session: 'other' }, 0), /not of the capture session/);
});

test('a planned batch is what the uploader sends: its originals are the retained files, and it is committed on its ACK', async () => {
  const text = cut(INK, 5);
  const f = facts(text);
  const p = planNext(text, f, 0);
  if (p.kind !== 'job') return assert.fail(p.kind);
  const sent: string[] = [];
  const transport: Transport = async (r) => {
    const body = JSON.parse(r.body ?? 'null');
    sent.push(`${r.method} ${new URL(r.url).pathname}`);
    if (r.method === 'PUT') {
      const { data_base64: _d, ...receipt } = body;
      return { status: 200, text: JSON.stringify({ ...receipt, status: 'bytes_committed' }) };
    }
    const b = body.batch;
    return { status: 200, text: JSON.stringify({ contract_version: '0.2.0', batch_id: b.batch_id, user_id: f.source.user_id, device_id: b.device_id, session_id: b.session_id, stream_id: b.stream_id, acknowledged: b.records.map((x: { record_id: string; sequence: number; artifacts: object[] }) => ({ record_id: x.record_id, sequence: x.sequence, disposition: 'accepted', received_at: '2026-09-30T17:00:00Z', envelope: 'committed', artifacts: x.artifacts.map((a) => ({ ...a, status: 'verified' })) })) }) };
  };
  const capture = path.join(EVIDENCE, 'windows-frame-ingress', 'harness-ink-capture');
  const result = await uploadRetained({ origin: 'http://127.0.0.1:9', token: 'a'.repeat(40), expires_at: new Date(Date.now() + 600_000).toISOString(), owner: f.source, incarnation: { device_id: f.device_id, session_id: f.session_id, stream_id: f.stream_id } }, { capture_dir: capture, plan: p.plan, prepared: p.prepared }, { transport });
  assert.equal(result.status, 'committed', JSON.stringify(result));
  assert.equal(sent.filter((x) => x.startsWith('PUT')).length, 7, '4 PNGs and 3 ink originals, each once');
  assert.equal(sent.at(-1), 'POST /v2/process/windows-frames:batch');
});
