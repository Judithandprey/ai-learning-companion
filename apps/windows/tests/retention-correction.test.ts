// Regressions for the lead's retention review of 04caef61 (S1–S3, R1–R2, malformed data), asserting the
// corrected outcomes on the real main.ts (and the whole overlay.ts for R1) with fake Electron and real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as retention from '../src/shared/retention.ts';
import { deferred, harness, plain, running, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { png } from './png.ts';

type S = { overlay: FakeWindow; doc: { id: string }; retention: { policy: unknown } };
const sender = (s: S) => ({ sender: s.overlay.webContents });
const facts = (seq: number, extra: Record<string, unknown> = {}) => ({
  sample_seq: seq,
  frame_seq: seq,
  reason: seq === 1 ? 'first' : 'changed',
  deferred_samples_not_retained: [] as number[],
  sampled_at: '2026-09-30T12:00:00.000Z',
  taken_at: '2026-09-30T12:00:00.000Z',
  monotonic_ms: 1000 * seq,
  state: 'fresh',
  gap_ms: null,
  presented_frames: seq,
  stream_presented_frames: seq,
  presentation_ms: null,
  frame_age_ms: null,
  raw: { width: 8, height: 5, pixels_sha256: 'f'.repeat(64), change_from_previous_sample: null },
  composed: { ink_session: '0123456789abcdef', ink_revision: 0, visible_strokes: 0, ink_marks: { verified: 0, changed: 0, unknown: 0, following_content: 0 }, transformation: 't', pixels_sha256: 'e'.repeat(64), uncommitted_gesture: null, evidence_pending: [] as string[] },
  ...extra,
});
const manifestPath = (h: ReturnType<typeof harness>, s: S): string => path.join(h.userData, 'captures', s.doc.id, 'manifest.jsonl');
/** Every line of the manifest, parsed; throws if any line is not valid JSON. */
const lines = (file: string): Array<Record<string, unknown>> => fs.readFileSync(file, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
/** What the overlay reports at Stop: a retained frame still being written, with the deferred samples it stands for. */
const inFlight = (seq: number, deferredSeqs: number[] = []) => ({ sample_seq: seq, deferred_samples_not_retained: deferredSeqs });
const lastRetention = (h: ReturnType<typeof harness>): Record<string, unknown> => plain((h.control() as FakeWindow).sent.filter((m) => m[0] === 'lc:retention').at(-1)?.[1]) as Record<string, unknown>;

const retainer = (h: ReturnType<typeof harness>, s: S) => async (seq: number, shade: number) => plain(await h.handlers['lc:retain-frame']!(sender(s), facts(seq), png(8, 5, shade), png(8, 5, shade + 1))) as { ok: boolean; retry?: boolean };

test('S1: a torn line left by a partial append (disk full) is cut back at once, so the manifest stays valid even if nothing is appended again', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const retain = retainer(h, s);
  assert.equal((await retain(1, 10)).ok, true);
  h.failWrites.partialAppend = 23; // the next record is cut after 23 bytes, then the disk is full
  const torn = await retain(2, 20);
  assert.deepEqual([torn.ok, torn.retry], [false, true]);
  assert.deepEqual(lines(manifestPath(h, s)).map((l) => l['kind']), ['header', 'retained'], 'cut back at once');
  assert.equal((await retain(3, 30)).ok, true);
  assert.deepEqual(lines(manifestPath(h, s)).map((l) => l['kind']), ['header', 'retained', 'unwritten', 'retained']);
});

test('S1: when cutting the torn line fails too, nothing is acknowledged until it is cut, then every line is valid', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const retain = retainer(h, s);
  assert.equal((await retain(1, 10)).ok, true);
  h.failWrites.truncate = true;
  h.failWrites.partialAppend = 23;
  assert.equal((await retain(2, 20)).ok, false);
  assert.throws(() => lines(manifestPath(h, s)), 'the torn record is on disk');
  assert.equal((await retain(3, 30)).ok, false, 'the repair fails: not acknowledged');
  h.failWrites.truncate = false;
  assert.equal((await retain(4, 40)).ok, true, 'repaired, then appended');
  const all = lines(manifestPath(h, s));
  assert.deepEqual(all.map((l) => l['kind']), ['header', 'retained', 'unwritten', 'retained']);
  assert.equal(all[2]!['count'], 2, 'the torn line and the unrepaired attempt are both counted');
  assert.equal(all[3]!['sample_seq'], 4);
});

test('S2: a Stop whose overlay stops completing work is ended at the bound, and the retained frames still being written are recorded and shown as lost', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean }).ok, true);
  h.end('stopped by the user');
  h.handlers['lc:stopping']!(sender(s), [inFlight(2)]); // sample 2's frame is still being encoded
  h.fire(10_000); // nothing completed since: the bound ends it
  assert.equal(h.current(), null);
  assert.equal(s.overlay.destroyed, true);
  const all = lines(manifestPath(h, s));
  assert.deepEqual(all.map((l) => l['kind']), ['header', 'retained', 'unfinished', 'ended']);
  assert.deepEqual(all[2]!['samples'], [2]);
  assert.match(String(all[2]!['reason']), /pixels are lost/);
  assert.match(String(all[3]!['reason']), /1 frame\(s\) lost/);
  assert.deepEqual(lastRetention(h)['unfinished'], [2], 'shown apart from the ink message');
});

test('S2: while the overlay keeps completing work, the Stop waits for it; the frames written then are not lost', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  h.end('stopped by the user');
  h.handlers['lc:stopping']!(sender(s), [inFlight(1)]);
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean }).ok, true);
  h.fire(10_000); // work completed since the Stop: it waits
  assert.notEqual(h.current(), null);
  h.handlers['lc:stopped']!(sender(s), null);
  assert.equal(h.current(), null);
  assert.deepEqual(lines(manifestPath(h, s)).map((l) => l['kind']), ['header', 'retained', 'ended']);
  assert.equal(lastRetention(h)['unfinished'], null);
});

test('S1: when a failed first append left the whole header and a torn record, both are cut back, so the header is written once', async () => {
  const reference = harness();
  const r = (await running(reference)) as unknown as S;
  await reference.handlers['lc:retain-frame']!(sender(r), facts(1), png(8, 5, 10), png(8, 5, 11));
  const headerBytes = fs.readFileSync(manifestPath(reference, r), 'utf8').indexOf('\n') + 1;
  const h = harness();
  const s = (await running(h)) as unknown as S;
  h.failWrites.partialAppend = headerBytes + 10; // the header line and 10 bytes of the record, then the disk is full
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 10), png(8, 5, 11))) as { ok: boolean }).ok, false);
  assert.equal(fs.readFileSync(manifestPath(h, s)).length, 0, 'the whole header and the torn record are cut back at once');
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(2), png(8, 5, 20), png(8, 5, 21))) as { ok: boolean }).ok, true);
  assert.deepEqual(lines(manifestPath(h, s)).map((l) => l['kind']), ['header', 'unwritten', 'retained']);
});

test('S2: a frame answered before the overlay\'s Stop report reached main is not reported lost', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(2), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean }).ok, true);
  h.end('stopped by the user');
  h.handlers['lc:stopping']!(sender(s), [inFlight(2), inFlight(3)]); // sent before the overlay saw the answer for 2
  h.fire(10_000);
  const all = lines(manifestPath(h, s));
  assert.deepEqual(all.map((l) => l['kind']), ['header', 'retained', 'unfinished', 'ended']);
  assert.deepEqual(all[2]!['samples'], [3]);
});

test('S2: when the overlay\'s process is gone, frames it could not report are recorded and shown as possibly missing', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean }).ok, true);
  s.overlay.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.equal(h.current(), null);
  const all = lines(manifestPath(h, s));
  assert.deepEqual(all.map((l) => l['kind']), ['header', 'retained', 'unfinished', 'ended']);
  assert.deepEqual(all[2]!['samples'], []);
  assert.match(String(all[2]!['reason']), /may be missing/);
  assert.match(String(all[3]!['reason']), /whole-display frames were written \(some may be missing\)/);
  assert.deepEqual(lastRetention(h)['unfinished'], []);
});

test('S2: a forced end before any whole-display frame could be taken writes no retention record', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  h.end('stopped by the user');
  h.fire(10_000);
  assert.equal(h.current(), null);
  assert.equal(fs.existsSync(manifestPath(h, s)), false);
});

test("S2: a lost frame's deferred samples are recorded with it, and deferred steps are recorded at Stop, not after the slow work", { timeout: 5000 }, async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const page = await overlayPage(h, s as never, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  let gate = deferred<void>();
  page.encoding.gate = gate.promise;
  const step = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
  };
  await step(20); // retained, being encoded
  await step(60); // retained, being encoded: the queue is full
  await step(100); // a material step that waits (deferred)
  assert.equal(page.review.retention().deferred, 1);
  gate.resolve();
  await page.review.retention().queue;
  gate = deferred<void>();
  page.encoding.gate = gate.promise;
  await step(140); // retained, standing for the deferred one; its encoding never finishes
  await step(180); // retained; its encoding never finishes either: the queue is full
  await step(220); // deferred
  page.pointer('pointerdown', 1, 10, 10); // a stroke whose save waits for its picture's encoding
  page.pointer('pointermove', 1, 40, 40);
  h.end('stopped by the user');
  await until('the Stop to reach the overlay', () => page.review.state().ended);
  h.fire(10_000);
  assert.equal(h.current(), null);
  const all = lines(manifestPath(h, s));
  const retained = all.filter((l) => l['kind'] === 'retained').map((l) => l['sample_seq'] as number);
  assert.equal(retained.length, 2);
  const b = retained[1]!;
  const unfinished = all.find((l) => l['kind'] === 'unfinished')!;
  assert.deepEqual(unfinished['samples'], [b + 2, b + 3], 'the frames still being encoded');
  assert.deepEqual(unfinished['deferred_samples_not_retained'], [b + 1], 'the deferred step the first of them stood for');
  const waited = all.filter((l) => l['kind'] === 'not_retained' && /when the capture ended/.test(String(l['reason'])));
  assert.deepEqual(waited.map((l) => [l['from_seq'], l['to_seq']]), [[b + 4, b + 4]], 'recorded at Stop, though the ink save never finished');
  gate.resolve();
});

test('S2: malformed overlay messages do not count as completed work, so they do not keep a Stop waiting', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean }).ok, true);
  h.end('stopped by the user');
  h.handlers['lc:observation-gap']!(sender(s), null);
  h.handlers['lc:not-retained']!(sender(s), { from_seq: 5, to_seq: 2, samples: 1, reason: 'x' });
  await h.handlers['lc:retain-frame']!(sender(s), facts(2, { monotonic_ms: Number.NaN }), png(8, 5, 3), png(8, 5, 4));
  await h.handlers['lc:save-ink']!(sender(s), { id: 'nope' }, []);
  h.fire(10_000);
  assert.equal(h.current(), null, 'ended at the first bound');
});

test('a frame larger than the chosen display is refused before its picture is decoded', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const big = facts(1, { raw: { width: 30000, height: 30000, pixels_sha256: 'f'.repeat(64), change_from_previous_sample: null }, composed: null });
  const answer = plain(await h.handlers['lc:retain-frame']!(sender(s), big, png(8, 5, 1), null)) as { ok: boolean; reason: string };
  assert.equal(answer.ok, false);
  assert.match(answer.reason, /larger than the chosen display/);
});

test('S3: when the final ended line cannot be written, the control window says so after the session, and it is written at the next Start', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 1), png(8, 5, 2))) as { ok: boolean }).ok, true);
  h.failWrites.on = true;
  h.end('stopped by the user');
  h.handlers['lc:stopped']!(sender(s), null);
  assert.equal(h.current(), null);
  const shown = lastRetention(h);
  assert.deepEqual([shown['ended'], shown['end_recorded'], shown['unwritten']], [true, false, 0], 'the end is kept to be written, not counted as a lost event');
  h.app.emit('before-quit'); // tried again, failing still
  assert.equal((await h.start('screen:1:0')).ok, true, 'a new session starts; the end is tried again, failing still');
  h.failWrites.on = false;
  const notices = (): number => (h.control() as FakeWindow).sent.filter((m) => m[0] === 'lc:retention').length;
  const before = notices();
  assert.equal((plain(await h.start('screen:1:0')) as { ok: boolean }).ok, false, 'refused (a session is running), but the end is tried again and written');
  assert.equal(notices(), before, "the running session's record stays shown");
  const all = lines(manifestPath(h, s));
  assert.deepEqual(all.map((l) => l['kind']), ['header', 'retained', 'ended'], 'nothing is said missing: only the end was late');
  assert.match(String(all[2]!['note']), /recorded late/);
});

test('R1: a known sampling gap is recorded with its measured duration even when the pixels did not change; a retained gap frame carries gap_ms', { timeout: 5000 }, async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const page = await overlayPage(h, s as never, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  await page.review.sample(); // the first frame
  await page.review.retention().queue;
  await page.review.sameFrameLate(7000); // late by 7 s; the same pixels
  page.scene.shade = 200;
  await page.review.sample(5500); // late by 5.5 s; a material change
  await page.review.retention().queue;
  h.end('stopped by the user');
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  const all = lines(manifestPath(h, s));
  const gaps = all.filter((l) => l['kind'] === 'gap');
  assert.deepEqual(gaps.map((g) => g['gap_ms']), [7000, 5500], 'as measured, whatever the pixels did');
  assert.equal((gaps[1]!['sample_seq'] as number) - (gaps[0]!['sample_seq'] as number), 1, 'one line per gap sample');
  const retainedGap = all.find((l) => l['kind'] === 'retained' && l['state'] === 'gap');
  assert.equal(retainedGap?.['gap_ms'], 5500);
});

test('R2: the header does not claim frame_age_ms equals monotonic_ms minus presentation_ms; the capture latency is unmeasured', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  await h.handlers['lc:retain-frame']!(sender(s), facts(1), png(8, 5, 1), png(8, 5, 2));
  const basis = lines(manifestPath(h, s))[0]!['time_basis'] as Record<string, string>;
  assert.match(basis['frame_age_ms']!, /rounded/);
  assert.match(basis['frame_age_ms']!, /can differ/);
  assert.match(basis['frame_age_ms']!, /latency before presentation is not measured/);
});

test('malformed facts, backwards runs and a truncated PNG are refused and write nothing', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const retain = async (f: unknown, raw: Uint8Array) => plain(await h.handlers['lc:retain-frame']!(sender(s), f, raw, png(8, 5, 2))) as { ok: boolean; reason: string };
  for (const bad of [facts(Number.NaN), facts(2, { frame_seq: -1.5 }), facts(3, { deferred_samples_not_retained: [Infinity, -10] }), facts(4, { sampled_at: undefined }), facts(5, { state: 'gap' })]) {
    assert.match((await retain(bad, png(8, 5, 1))).reason, /malformed/);
  }
  const prefix = png(8, 5, 1).subarray(0, 24);
  assert.match((await retain(facts(6), prefix)).reason, /does not decode completely/);
  h.handlers['lc:not-retained']!(sender(s), { from_seq: 9, to_seq: 3, samples: -4, reason: 'backwards' });
  assert.equal(fs.existsSync(path.join(h.userData, 'captures', s.doc.id, 'frames')), false, 'no picture was written');
  const kinds = fs.existsSync(manifestPath(h, s)) ? lines(manifestPath(h, s)).map((l) => l['kind']) : [];
  assert.deepEqual(kinds, ['header', 'refused'], 'only the truncated picture is recorded (its facts were valid); the rest wrote nothing');
});
