// Independent review: execute the unchanged candidate main.ts with fake Electron and /tmp storage.
// The harness copy only adds captured timers and a partial-append filesystem fault.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { harness, running, plain } from './storage-review-harness.ts';
import { png } from './png.ts';

const facts = (seq: number) => ({ sample_seq: seq, frame_seq: seq, reason: 'first', deferred_samples_not_retained: [], sampled_at: '2026-09-30T12:00:00.000Z', taken_at: '2026-09-30T12:00:00.000Z', monotonic_ms: 1000 * seq, state: 'fresh', presented_frames: seq, stream_presented_frames: seq, presentation_ms: null, frame_age_ms: null, raw: { width: 8, height: 5, pixels_sha256: 'f'.repeat(64), change_from_previous_sample: null }, composed: null });
const setup = async () => {
  const h = harness(), s = await running(h);
  const e = { sender: s.overlay.webContents };
  const dir = path.join(h.userData, 'captures', s.doc.id), manifest = path.join(dir, 'manifest.jsonl');
  const retain = (f: unknown, p: Uint8Array = png(8, 5, 10)) => plain(h.handlers['lc:retain-frame']!(e, f, p, null)) as { ok: boolean; reason?: string; retry?: boolean };
  const read = () => fs.readFileSync(manifest, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  return { h, s, e, dir, manifest, retain, read };
};
const out: Record<string, unknown> = {};

{
  const t = await setup();
  assert.equal(t.retain(facts(1)).ok, true);
  t.h.appendFault.bytes = 23;
  const failed = t.retain(facts(2));
  assert.equal(failed.retry, true);
  assert.equal(t.retain(facts(2)).ok, true);
  const raw = fs.readFileSync(t.manifest, 'utf8').trim().split('\n');
  const bad = raw.flatMap((l, i) => { try { JSON.parse(l); return []; } catch { return [{ line: i + 1, text: l }]; } });
  assert.equal(bad.length, 1);
  assert.throws(t.read, SyntaxError);
  out.partial_append = { failed, successful_retry: true, invalid_json_lines: bad, manifest: t.manifest };
}
{
  const t = await setup();
  const f = { sample_seq: NaN, frame_seq: -1.5, deferred_samples_not_retained: [Infinity, -10], raw: { width: 8, height: 5 } };
  const answer = t.retain(f);
  assert.equal(answer.ok, true);
  t.h.handlers['lc:not-retained']!(t.e, { from_seq: -5, to_seq: -10, samples: -10, reason: 'invalid backwards gap' });
  out.malformed_facts = { answer, records: t.read().slice(1), manifest: t.manifest };
}
{
  const t = await setup();
  const truncated = png(8, 5, 10).slice(0, 24);
  const answer = t.retain(facts(1), truncated);
  assert.equal(answer.ok, true);
  assert.equal(t.read()[1].raw.bytes, 24);
  out.truncated_png = { answer, record: t.read()[1], manifest: t.manifest, missing: 'rest of IHDR, CRC, all image data, IEND' };
}
{
  const t = await setup();
  assert.equal(t.retain(facts(1)).ok, true);
  t.h.failWrites.on = true;
  t.h.end('stopped by the user');
  t.h.handlers['lc:stopped']!(t.e, null);
  const c = t.h.control() as { sent: unknown[][] };
  const shown = c.sent.filter(a => a[0] === 'lc:retention').at(-1)?.[1];
  assert.equal(t.h.current(), null);
  assert.equal(t.read().some(l => l.kind === 'ended'), false);
  assert.equal((shown as { unwritten: number }).unwritten, 0);
  out.ended_write_failure = { manifest: t.manifest, disk_kinds: t.read().map(l => l.kind), last_displayed_retention: shown, internal_unwritten: (t.s as unknown as { retention: { unwritten: number } }).retention.unwritten, last_session: c.sent.filter(a => a[0] === 'lc:session').at(-1)?.[1] };
}
{
  const t = await setup();
  assert.equal(t.retain(facts(1)).ok, true);
  // A second renderer encoding is pending; it has not invoked lc:retain-frame or lc:stopped.
  // Main receives the real sample event, then Stop; invoke its actual captured ten-second callback.
  t.h.handlers['lc:sample']!(t.e, { seq: 2, state: 'fresh' });
  t.h.end('stopped by the user');
  const deadline = t.h.timers.find(t => t.ms === 10000);
  assert.ok(deadline); deadline.fn();
  assert.equal(t.s.overlay.isDestroyed(), true);
  assert.equal(t.h.current(), null);
  const late = t.retain(facts(2));
  assert.equal(late.ok, false);
  const c = t.h.control() as { sent: unknown[][] };
  const ended = t.read().at(-1);
  assert.match(ended.reason, /ink was saved/);
  assert.doesNotMatch(ended.reason, /retention|frames|unfinished|unknown|incomplete/);
  assert.deepEqual(t.read().map(l => l.kind), ['header', 'retained', 'ended']);
  out.stop_timeout = { manifest: t.manifest, overlay_destroyed: true, current: null, late_retention: late, ended, last_displayed_retention: c.sent.filter(a => a[0] === 'lc:retention').at(-1)?.[1], last_session: c.sent.filter(a => a[0] === 'lc:session').at(-1)?.[1] };
}
{
  const t = await setup();
  assert.deepEqual(plain(t.h.handlers['lc:retain-frame']!({ sender: {} }, facts(1), png(8,5,1), null)), { ok: false, reason: 'refused' });
  assert.equal(fs.existsSync(t.dir), false);
  t.h.end('stopped by the user');
  assert.equal(t.retain(facts(1)).ok, true, 'pre-stop work can drain before acknowledgment');
  t.h.handlers['lc:stopped']!(t.e, null);
  assert.deepEqual(t.retain(facts(2)), { ok: false, reason: 'refused' });
  assert.deepEqual(t.read().map(l => l.kind), ['header', 'retained', 'ended']);
  out.auth_and_stop_drain = 'PASS: wrong sender refused, ending drain allowed, ended sender refused';
}
fs.writeFileSync('/tmp/windows-retention-storage-probe.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
