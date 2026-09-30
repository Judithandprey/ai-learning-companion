// The editable ink original retained with each composed frame: the exact ink document the composition was drawn
// from, taken with it, checked with the ink parser and written as ink/<sha256>.json next to the frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as retention from '../src/shared/retention.ts';
import { newDesktopInk, parseDesktopInk, type DesktopInk } from '../src/shared/desktop-ink.ts';
import { deferred, harness, plain, running, withStroke, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { png } from './png.ts';

type S = { overlay: FakeWindow; doc: DesktopInk; retention: { policy: retention.RetentionPolicy } };
const sender = (s: S) => ({ sender: s.overlay.webContents });
const sha = (b: Uint8Array | string): string => crypto.createHash('sha256').update(b).digest('hex');
const bytesOf = (doc: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(doc));
/** Facts of a composed sample drawn from `doc`. */
const facts = (seq: number, doc: DesktopInk) => ({
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
  composed: { ink_session: doc.id, ink_revision: doc.ink.revision, visible_strokes: doc.ink.visible.length, ink_marks: { verified: 0, changed: 0, unknown: doc.ink.visible.length, following_content: 0 }, transformation: 't', pixels_sha256: 'e'.repeat(64), uncommitted_gesture: null, evidence_pending: [] as string[] },
});
const capture = (h: ReturnType<typeof harness>, s: S) => path.join(h.userData, 'captures', s.doc.id);
const manifest = (h: ReturnType<typeof harness>, s: S): Array<Record<string, any>> =>
  fs.readFileSync(path.join(capture(h, s), 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const retain = async (h: ReturnType<typeof harness>, s: S, seq: number, doc: DesktopInk, ink: unknown, shade = seq * 10) =>
  plain(await h.handlers['lc:retain-frame']!(sender(s), facts(seq, doc), png(8, 5, shade), png(8, 5, shade + 1), ink)) as { ok: boolean; reason?: string; retry?: boolean; limit?: boolean };

test('the ink document of a composition is written as its exact bytes, read back strictly, and shared by frames drawn from the same document', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  const bytes = bytesOf(doc);
  assert.equal((await retain(h, s, 1, doc, bytes)).ok, true);
  assert.equal((await retain(h, s, 2, doc, bytes)).ok, true);
  const [, one, two] = manifest(h, s);
  assert.deepEqual(one!.composed.ink_original, { file: `ink/${sha(bytes)}.json`, sha256: sha(bytes), bytes: bytes.length });
  assert.deepEqual(two!.composed.ink_original, one!.composed.ink_original, 'the same document, the same original');
  const stored = fs.readFileSync(path.join(capture(h, s), one!.composed.ink_original.file));
  assert.deepEqual(new Uint8Array(stored), bytes, 'exact bytes');
  const read = parseDesktopInk(JSON.parse(stored.toString('utf8')), doc.ink.page.address_sha256);
  assert.ok(read.ok && read.doc.ink.revision === 1 && read.doc.ink.history.length === 1);
  assert.equal(fs.readdirSync(path.join(capture(h, s), 'ink')).length, 1);
});

test('an ink document that is not the one composed, not readable, missing or over 32 MiB is refused for the ink only: the frame is retained and the reason recorded', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  const cases: Array<[unknown, RegExp]> = [
    [bytesOf(s.doc), /not the one composed/], // revision 0, composed from revision 1
    [new TextEncoder().encode('{"not": "ink"'), /not UTF-8 JSON/],
    [bytesOf({ ...doc, format: 'x' }), /does not read back/],
    [null, /sent no ink document/],
    [new Uint8Array(33_554_433), /over the 33554432-byte original limit/],
  ];
  for (const [i, [ink, why]] of cases.entries()) {
    assert.equal((await retain(h, s, i + 1, doc, ink)).ok, true, 'the frame is retained');
    const line = manifest(h, s).at(-1)!;
    assert.match(line.composed.ink_original.refused, why);
    assert.deepEqual(Object.keys(line.composed.ink_original), ['refused']);
  }
  assert.equal(fs.existsSync(path.join(capture(h, s), 'ink')), false, 'no ink original written');
  const answer = plain(await h.handlers['lc:retain-frame']!(sender(s), { ...facts(9, doc), composed: null }, png(8, 5, 1), null, bytesOf(doc))) as { ok: boolean; reason: string };
  assert.match(answer.reason, /an ink document came without a composed picture/);
});

test('a storage failure refuses the whole frame (retried), and the byte cap counts the ink original', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  const bytes = bytesOf(doc);
  assert.equal((await retain(h, s, 1, doc, bytes)).ok, true); // the manifest exists, so the next failure is about files
  h.failWrites.on = true;
  const failed = await retain(h, s, 2, { ...doc, ink: { ...doc.ink } }, bytesOf({ ...doc, created_at: 'later' }), 50);
  assert.deepEqual([failed.ok, failed.retry], [false, true]);
  h.failWrites.on = false;
  assert.equal(fs.readdirSync(path.join(capture(h, s), 'ink')).length, 1, 'only the first original');
  // The cap: the pictures alone would fit, with the ink original they do not.
  const h2 = harness();
  const s2 = (await running(h2)) as unknown as S;
  const pictures = png(8, 5, 10).length + png(8, 5, 11).length;
  s2.retention.policy = { ...retention.DEFAULT_RETENTION_POLICY, max_bytes: pictures + 10 };
  const d2 = withStroke(s2.doc);
  const capped = await retain(h2, s2, 1, d2, bytesOf(d2), 10);
  assert.deepEqual([capped.ok, capped.limit], [false, true]);
  assert.match(capped.reason!, /retention limit of \d+ bytes/);
});

test('a frame whose encoding is delayed keeps the ink it was composed from, through later writing, partial erase, undo and redo; the saved ink keeps all of it', { timeout: 15000 }, async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const page = await overlayPage(h, s as never, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const stroke = (id: number, y: number): void => {
    page.pointer('pointerdown', id, 100, y);
    for (const x of [140, 180, 220]) page.pointer('pointermove', id, x, y);
    page.pointer('pointerup', id, 220, y);
  };
  stroke(1, 200);
  await page.review.pending();
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  page.scene.shade = 90;
  await page.review.sample(); // composed with revision 1; its encoding waits
  stroke(2, 260);
  page.click('eraser');
  page.pointer('pointerdown', 3, 160, 190);
  page.pointer('pointermove', 3, 160, 210);
  page.pointer('pointerup', 3, 160, 210);
  page.click('pen');
  page.click('undo');
  page.click('redo');
  gate.resolve();
  page.encoding.gate = null;
  await page.review.retention().queue;
  await page.review.pending();
  h.end('stopped by the test');
  await until('the Stop confirmed', () => page.acks.length > 0, 5000);
  const line = manifest(h, s).find((l) => l['kind'] === 'retained' && l.composed.ink_revision === 1)!;
  const file = fs.readFileSync(path.join(capture(h, s), line.composed.ink_original.file));
  assert.equal(sha(file), line.composed.ink_original.sha256, 'the manifest names exactly these bytes');
  const original = JSON.parse(file.toString('utf8')) as DesktopInk;
  assert.deepEqual([original.ink.revision, original.ink.history.map((o) => o.op)], [1, ['add']], 'the ink it was drawn from, not the later document');
  const saved = JSON.parse(fs.readFileSync(path.join(h.userData, 'ink', `${original.id}.json`), 'utf8')) as DesktopInk;
  const reread = parseDesktopInk(saved, original.ink.page.address_sha256);
  assert.ok(reread.ok, 'the saved ink reopens strictly');
  assert.deepEqual(saved.ink.history.map((o) => o.op), ['add', 'add', 'erase', 'undo', 'redo'], 'every edit kept, with the partial erase and its undo and redo');
  assert.ok(parseDesktopInk(original, original.ink.page.address_sha256).ok, 'the retained original reopens strictly too');
});

test('what the composition does not hold is said: a stroke still being written, and strokes whose evidence was still being made', { timeout: 15000 }, async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const page = await overlayPage(h, s as never, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const gate = deferred<void>();
  page.encoding.gate = gate.promise; // the stroke's context picture waits
  page.pointer('pointerdown', 1, 100, 200);
  page.pointer('pointermove', 1, 180, 200);
  page.pointer('pointerup', 1, 180, 200);
  page.pointer('pointerdown', 2, 100, 300); // a second stroke, still being written
  page.pointer('pointermove', 2, 150, 300);
  page.scene.shade = 120;
  await page.review.sample();
  gate.resolve();
  page.encoding.gate = null;
  page.pointer('pointerup', 2, 150, 300);
  await page.review.retention().queue;
  await page.review.pending();
  h.end('stopped by the test');
  await until('the Stop confirmed', () => page.acks.length > 0, 5000);
  const line = manifest(h, s).find((l) => l['kind'] === 'retained' && l.composed.visible_strokes === 1)!;
  assert.deepEqual(line.composed.uncommitted_gesture, { kind: 'ink', points: 2 });
  const original = JSON.parse(fs.readFileSync(path.join(capture(h, s), line.composed.ink_original.file), 'utf8')) as DesktopInk;
  const [id] = original.ink.visible;
  assert.deepEqual(line.composed.evidence_pending, [id]);
  assert.equal(original.ink.visible.length, 1, 'the stroke still being written is not in it');
  assert.equal(original.evidence[id!]?.contexts[0]?.image, null, 'its picture was still being made then (pending, not failed)');
});

test('Stop writes a queued frame and its ink original before it is confirmed; a frame lost at the Stop bound leaves no ink original', { timeout: 15000 }, async () => {
  for (const forced of [false, true]) {
    const h = harness();
    const s = (await running(h)) as unknown as S;
    const page = await overlayPage(h, s as never, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
    page.pointer('pointerdown', 1, 100, 200);
    page.pointer('pointermove', 1, 180, 200);
    page.pointer('pointerup', 1, 180, 200);
    await page.review.pending();
    const gate = deferred<void>();
    page.encoding.gate = gate.promise;
    page.scene.shade = 150;
    await page.review.sample();
    h.end('stopped by the test');
    await until('the Stop to reach the overlay', () => page.review.state().ended);
    if (forced) h.fire(10_000);
    else gate.resolve();
    if (!forced) await until('the Stop confirmed', () => page.acks.length > 0, 5000);
    const kinds = manifest(h, s).map((l) => l['kind']);
    if (forced) {
      assert.deepEqual(kinds, ['header', 'unfinished', 'ended']);
      assert.equal(fs.existsSync(path.join(capture(h, s), 'ink')), false);
      gate.resolve();
    } else {
      assert.deepEqual(kinds, ['header', 'retained', 'ended']);
      const line = manifest(h, s)[1]!;
      assert.equal(fs.existsSync(path.join(capture(h, s), line.composed.ink_original.file)), true);
    }
  }
});

test('an empty document composes and is retained too (a frame before any ink)', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const empty = newDesktopInk(s.doc.id, s.doc.ink.page.address_sha256, s.doc.created_at, s.doc.display);
  assert.equal((await retain(h, s, 1, empty, bytesOf(empty))).ok, true);
  assert.equal(manifest(h, s)[1]!.composed.ink_original.bytes, bytesOf(empty).length);
});

test('when only the ink original cannot be written, the whole frame is refused (retried) and nothing is listed without its files; it is written once storage is back', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  assert.equal((await retain(h, s, 1, doc, bytesOf(doc))).ok, true);
  const inkDir = path.join(capture(h, s), 'ink');
  fs.rmSync(inkDir, { recursive: true });
  fs.writeFileSync(inkDir, 'the ink folder is blocked by the test');
  const later = { ...doc, created_at: '2026-09-30T12:00:01.000Z' };
  const blocked = await retain(h, s, 2, later, bytesOf(later), 50);
  assert.deepEqual([blocked.ok, blocked.retry], [false, true]);
  assert.match(blocked.reason!, /writing to this device failed/);
  assert.deepEqual(manifest(h, s).map((l) => l['kind']), ['header', 'retained', 'refused']);
  fs.rmSync(inkDir);
  assert.equal((await retain(h, s, 3, later, bytesOf(later), 50)).ok, true);
  const line = manifest(h, s).at(-1)!;
  assert.equal(line['kind'], 'retained');
  assert.equal(fs.existsSync(path.join(capture(h, s), line.composed.ink_original.file)), true);
});

test('an ink document of another session, or with other visible strokes than composed, is not the one composed', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  const other = withStroke(newDesktopInk('fedcba9876543210', sha('fedcba9876543210'), s.doc.created_at, s.doc.display));
  assert.equal((await retain(h, s, 1, doc, bytesOf(other))).ok, true);
  assert.match(manifest(h, s).at(-1)!.composed.ink_original.refused, /not the one composed/);
  const claims = facts(2, doc);
  const twoVisible = { ...claims, composed: { ...claims.composed, visible_strokes: 2, ink_marks: { verified: 0, changed: 0, unknown: 2, following_content: 0 } } };
  assert.equal((plain(await h.handlers['lc:retain-frame']!(sender(s), twoVisible, png(8, 5, 20), png(8, 5, 21), bytesOf(doc))) as { ok: boolean }).ok, true);
  assert.match(manifest(h, s).at(-1)!.composed.ink_original.refused, /not the one composed/);
});

test('the gesture in progress and the strokes with evidence pending are checked facts', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  for (const [composed, why] of [[{ uncommitted_gesture: { kind: 'draw', points: 1 } }, /gesture in progress is malformed/], [{ uncommitted_gesture: { kind: 'ink', points: -1 } }, /gesture in progress is malformed/], [{ evidence_pending: [''] }, /evidence pending are malformed/], [{ evidence_pending: 'stk' }, /evidence pending are malformed/]] as const) {
    const f = facts(1, doc);
    const answer = plain(await h.handlers['lc:retain-frame']!(sender(s), { ...f, composed: { ...f.composed, ...composed } }, png(8, 5, 1), png(8, 5, 2), bytesOf(doc))) as { ok: boolean; reason: string };
    assert.match(answer.reason, why);
  }
});

test('evidence pending: a stroke with no evidence entry yet, or with pictures still being encoded; cleared once made; a picture that could not be made is not pending', { timeout: 15000 }, async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const page = await overlayPage(h, s as never, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const stroke = (id: number, y: number): void => {
    page.pointer('pointerdown', id, 100, y);
    page.pointer('pointermove', id, 180, y);
    page.pointer('pointerup', id, 180, y);
  };
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  stroke(1, 200); // its picture waits
  stroke(2, 260); // its evidence waits behind the first stroke's picture
  page.scene.shade = 70;
  await page.review.sample();
  gate.resolve();
  page.encoding.gate = null;
  await page.review.retention().queue;
  await page.review.pending();
  page.scene.shade = 110;
  await page.review.sample();
  await page.review.retention().queue;
  // A third stroke whose picture cannot be made.
  const failing = Promise.reject(new Error('cannot encode'));
  failing.catch(() => undefined);
  page.encoding.gate = failing;
  stroke(3, 320);
  await page.review.pending().catch(() => undefined);
  page.encoding.gate = null;
  page.scene.shade = 150;
  await page.review.sample();
  await page.review.retention().queue;
  h.end('stopped by the test');
  await until('the Stop confirmed', () => page.acks.length > 0, 5000);
  const lines = manifest(h, s).filter((l) => l['kind'] === 'retained');
  const read = (l: Record<string, any>) => JSON.parse(fs.readFileSync(path.join(capture(h, s), l.composed.ink_original.file), 'utf8')) as DesktopInk;
  const [first, second, third] = lines.map((l) => ({ line: l, doc: read(l) }));
  const [a, b] = first!.doc.ink.visible;
  assert.deepEqual(first!.line.composed.evidence_pending, [a, b].sort());
  assert.equal(first!.doc.evidence[a!]?.contexts[0]?.image, null, 'the first: evidence made, its picture still being encoded');
  assert.equal(Object.hasOwn(first!.doc.evidence, b!), false, 'the second: no evidence entry yet');
  assert.deepEqual(second!.line.composed.evidence_pending, [], 'cleared once made');
  assert.notEqual(second!.doc.evidence[b!]?.contexts[0]?.image, null);
  const c = third!.doc.ink.visible.find((id) => id !== a && id !== b)!;
  assert.deepEqual(third!.line.composed.evidence_pending, [], 'a picture that could not be made is not pending');
  assert.equal(third!.doc.evidence[c]?.contexts[0]?.image, null, 'its null means it could not be made');
});
