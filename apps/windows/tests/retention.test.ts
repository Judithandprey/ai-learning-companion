// Whole-display retention: which frames are retained (pure rules), and the real main.ts writing their PNG
// files and manifest lines, within caps, with refusals and gaps recorded and nothing retained deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { changedCells, decideRetention, DEFAULT_RETENTION_POLICY, pngSize, RETENTION_FORMAT } from '../src/shared/retention.ts';
import { harness, plain, running } from './main-harness.ts';
import { png } from './png.ts';

const grid = (v: number, changed = 0): Uint8Array => Uint8Array.from({ length: 2560 }, (_, i) => (i < changed ? v + 50 : v));
const P = { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 2000, heartbeat_ms: 60_000 };

test('retention rules: first frame; unchanged; small changes are a gap; material steps and ink changes, at most once per interval; heartbeat', () => {
  const last = { pixels_sha256: 'a', grid: grid(100), ink_key: 'k1', at_ms: 1000 };
  assert.deepEqual(decideRetention(null, { ...last }, false, P), { retain: true, reason: 'first' });
  assert.deepEqual(decideRetention(last, { ...last, at_ms: 5000 }, false, P), { retain: false, reason: 'unchanged' });
  assert.deepEqual(decideRetention(last, { ...last, pixels_sha256: 'b', grid: grid(100, 1), at_ms: 5000 }, false, P), { retain: false, reason: 'below_threshold' }, 'one cell (a caret) is not material');
  assert.deepEqual(decideRetention(last, { ...last, pixels_sha256: 'b', grid: grid(100, 2), at_ms: 5000 }, false, P), { retain: true, reason: 'changed' });
  assert.deepEqual(decideRetention(last, { ...last, pixels_sha256: 'b', grid: grid(100, 40), at_ms: 2500 }, false, P), { retain: false, reason: 'deferred' }, 'inside the interval');
  assert.deepEqual(decideRetention(last, { ...last, at_ms: 3500 }, true, P), { retain: true, reason: 'deferred' }, 'a deferred step is retained when allowed, even if the screen went back');
  assert.deepEqual(decideRetention(last, { ...last, ink_key: 'k2', at_ms: 3500 }, false, P), { retain: true, reason: 'ink' });
  assert.deepEqual(decideRetention(last, { ...last, pixels_sha256: 'b', grid: grid(100, 1), at_ms: 61_000 }, false, P), { retain: true, reason: 'heartbeat' });
  assert.equal(changedCells(grid(100), grid(100, 7), 4), 7);
});

const facts = (seq: number, w = 8, h = 5) => ({
  sample_seq: seq,
  frame_seq: seq,
  reason: seq === 1 ? 'first' : 'changed',
  deferred_samples_not_retained: [] as number[],
  sampled_at: '2026-09-30T12:00:00.000Z',
  taken_at: '2026-09-30T12:00:00.000Z',
  monotonic_ms: 1000 * seq,
  state: 'fresh',
  gap_ms: null as number | null,
  presented_frames: seq,
  stream_presented_frames: seq,
  presentation_ms: null,
  frame_age_ms: null,
  raw: { width: w, height: h, pixels_sha256: 'f'.repeat(64), change_from_previous_sample: null },
  composed: { ink_session: '0123456789abcdef', ink_revision: 0, visible_strokes: 0, ink_marks: { verified: 0, changed: 0, unknown: 0, following_content: 0 }, transformation: 't', pixels_sha256: 'e'.repeat(64) },
});
const lines = (dir: string): Array<Record<string, unknown>> => fs.readFileSync(path.join(dir, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('main retains a frame as PNG files by file SHA-256, lists it with the facts pinned with it, and records gaps and the end', async () => {
  const h = harness();
  const s = await running(h);
  const sender = { sender: (s as unknown as { overlay: { webContents: unknown } }).overlay.webContents };
  const raw = png(8, 5, 40);
  const composed = png(8, 5, 90);
  assert.deepEqual(plain(await h.handlers['lc:retain-frame']!(sender, facts(1), raw, composed)), { ok: true });
  h.handlers['lc:not-retained']!(sender, { from_seq: 2, to_seq: 4, samples: 3, reason: 'pixels changed less than the material threshold since the last retained frame' });
  h.end('stopped by the user');
  h.handlers['lc:stopped']!(sender, null);
  const dir = path.join(h.userData, 'captures', (s as unknown as { doc: { id: string } }).doc.id);
  const [header, retained, gap, ended] = lines(dir);
  assert.equal(header!['format'], RETENTION_FORMAT);
  assert.equal((header!['source'] as { source_id: string }).source_id, 'screen:1:0');
  for (const [entry, bytes] of [[retained!['raw'], raw], [retained!['composed'], composed]] as const) {
    const e = entry as { file: string; sha256: string; bytes: number; width: number; height: number };
    const onDisk = fs.readFileSync(path.join(dir, e.file));
    assert.deepEqual(Uint8Array.from(onDisk), bytes, 'the exact bytes');
    assert.equal(e.sha256, crypto.createHash('sha256').update(onDisk).digest('hex'));
    assert.equal(e.bytes, onDisk.length);
    assert.deepEqual([e.width, e.height], [8, 5]);
  }
  assert.equal((retained!['raw'] as { pixels_sha256: string }).pixels_sha256, 'f'.repeat(64), 'the RGBA hash is kept apart from the file hash');
  assert.equal(retained!['sample_seq'], 1);
  assert.deepEqual(gap, { kind: 'not_retained', from_seq: 2, to_seq: 4, samples: 3, reason: 'pixels changed less than the material threshold since the last retained frame' });
  assert.equal(ended!['kind'], 'ended');
  assert.deepEqual(pngSize(raw), { width: 8, height: 5 });
});

test('beyond the caps, frames are refused and recorded; nothing retained is deleted; a picture that is not the frame is refused', async () => {
  const h = harness();
  const s = await running(h);
  (s as unknown as { retention: { policy: unknown } }).retention.policy = { ...DEFAULT_RETENTION_POLICY, max_frames: 2 };
  const sender = { sender: (s as unknown as { overlay: { webContents: unknown } }).overlay.webContents };
  const retain = async (seq: number, shade: number) => plain(await h.handlers['lc:retain-frame']!(sender, facts(seq), png(8, 5, shade), png(8, 5, shade + 1))) as { ok: boolean; reason?: string };
  assert.equal((await retain(1, 10)).ok, true);
  assert.equal((await retain(2, 20)).ok, true);
  const third = await retain(3, 30);
  assert.equal(third.ok, false);
  assert.match(third.reason!, /limit of 2 frames/);
  const wrongSize = plain(await h.handlers['lc:retain-frame']!(sender, { ...facts(4), composed: null }, png(4, 4, 1), null)) as { ok: boolean; reason: string };
  assert.match(wrongSize.reason, /a 4×4 PNG for a 8×5 frame/);
  const dir = path.join(h.userData, 'captures', (s as unknown as { doc: { id: string } }).doc.id);
  const all = lines(dir);
  assert.deepEqual(all.map((l) => l['kind']), ['header', 'retained', 'retained', 'refused', 'refused']);
  assert.equal(fs.readdirSync(path.join(dir, 'frames')).length, 4, 'the retained frames stay');
});

test('when writing fails, the frame is refused and said; lines that could not be written are counted in the next that can', async () => {
  const h = harness();
  const s = await running(h);
  const sender = { sender: (s as unknown as { overlay: { webContents: unknown } }).overlay.webContents };
  h.failWrites.on = true;
  const failed = plain(await h.handlers['lc:retain-frame']!(sender, facts(1), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean; reason: string };
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /writing to this device failed/);
  h.failWrites.on = false;
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender, facts(2), png(8, 5, 3), png(8, 5, 4))) as { ok: boolean }).ok, true);
  const dir = path.join(h.userData, 'captures', (s as unknown as { doc: { id: string } }).doc.id);
  assert.deepEqual(lines(dir).map((l) => l['kind']), ['header', 'unwritten', 'retained']);
});

test('the byte cap counts the files actually written; beyond it frames are refused as a limit; malformed facts never write', async () => {
  const h = harness();
  const s = await running(h);
  const first = png(8, 5, 11);
  const firstComposed = png(8, 5, 12);
  (s as unknown as { retention: { policy: unknown } }).retention.policy = { ...DEFAULT_RETENTION_POLICY, max_bytes: first.length + firstComposed.length + 10 };
  const sender = { sender: (s as unknown as { overlay: { webContents: unknown } }).overlay.webContents };
  assert.deepEqual(plain(await h.handlers['lc:retain-frame']!(sender, facts(1), first, firstComposed)), { ok: true });
  const over = plain(await h.handlers['lc:retain-frame']!(sender, facts(2), png(8, 5, 21), png(8, 5, 22))) as { ok: boolean; reason: string; limit?: boolean };
  assert.equal(over.limit, true);
  assert.match(over.reason, /limit of \d+ bytes/);
  const malformed = plain(await h.handlers['lc:retain-frame']!(sender, { ...facts(3), composed: null }, png(8, 5, 31), png(8, 5, 32))) as { ok: boolean; reason: string };
  assert.match(malformed.reason, /^the frame facts are malformed/, 'a composed PNG needs its composed facts');
  const dir = path.join(h.userData, 'captures', (s as unknown as { doc: { id: string } }).doc.id);
  assert.equal(fs.readdirSync(path.join(dir, 'frames')).length, 2);
});
