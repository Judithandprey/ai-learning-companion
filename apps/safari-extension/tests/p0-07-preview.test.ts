// P0-07 document preview: the DOM-free parts. Exact UTF-8 reading and block splitting,
// the save record (existing v0.1.0 shapes, user-attributed note, separate AI state),
// and the store boundary: the default store saves nothing, and the in-page test double
// behaves like the future backend seam must (idempotent retry, lost answers, validation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DOCUMENT_BYTES, readUtf8Document, splitBlocks } from '../preview/src/document.ts';
import { buildSave, createTestDoubleStore, saveProblems, StoreError, unconnectedStore, type PreviewSave } from '../preview/src/store.ts';
import { buildExplanationRequest, resolveProbeCard } from '../src/explain.ts';
import { freezeSelection } from '../src/anchor.ts';
import { freezeDomSnapshot, type DomSnapshotPayload, type Ids } from '../src/frame.ts';

const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
const SAMPLE =
  '﻿# Eigen notes — 特征值\r\n\r\nLet A be 2×2 with λ₁ = 2, λ₂ = 3.\nThen trace(A²) = λ₁² + λ₂² = 13.\n\n\n' +
  '<script>alert("x")</script> <b>bold?</b> &amp; 🙂 é\n  \t\nLast line without newline';

test('reads UTF-8 exactly, keeping the BOM, CRLF, markup and non-ASCII', async () => {
  const r = await readUtf8Document(enc(SAMPLE), 'notes.md', 1);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.document.text, SAMPLE);
  assert.equal(r.document.byte_length, enc(SAMPLE).byteLength);
  assert.match(r.document.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(new TextEncoder().encode(r.document.text), enc(SAMPLE), 'the text re-encodes to the original bytes');
});

test('refuses invalid UTF-8 and oversized files without guessing or truncating', async () => {
  const bad = await readUtf8Document(new Uint8Array([0x61, 0xff, 0x62]), 'latin1.txt', null);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? '' : bad.reason, /not valid UTF-8/);
  const big = await readUtf8Document(new Uint8Array(MAX_DOCUMENT_BYTES + 1), 'big.txt', null);
  assert.equal(big.ok, false);
  assert.match(big.ok ? '' : big.reason, /Nothing was opened or truncated/);
});

test('blocks join back to the original exactly and separate paragraphs at blank lines', () => {
  const blocks = splitBlocks(SAMPLE);
  assert.equal(blocks.map((b) => b.text).join(''), SAMPLE);
  assert.deepEqual(blocks.map((b) => b.kind), ['paragraph', 'gap', 'paragraph', 'gap', 'paragraph', 'gap', 'paragraph']);
  assert.equal(blocks[2]!.text, 'Let A be 2×2 with λ₁ = 2, λ₂ = 3.\nThen trace(A²) = λ₁² + λ₂² = 13.');
  assert.deepEqual(splitBlocks(''), []);
  assert.equal(splitBlocks('one\r\rtwo').length, 3, 'CR-only line endings split too');
});

let n = 0;
const ids: Ids = { next: (p) => `${p}_${++n}` };
const clock = (): string => '2026-09-29T05:00:00.000Z';

async function savedFixture(store = createTestDoubleStore(ids, clock), note = '  My own question: why 13?  '): Promise<{ store: ReturnType<typeof createTestDoubleStore>; item: PreviewSave }> {
  const doc = await readUtf8Document(enc(SAMPLE), 'notes.md', null);
  assert.ok(doc.ok);
  const source = await store.importDocument(doc.document);
  const snapshot: DomSnapshotPayload = {
    kind: 'dom_snapshot/v1',
    captured_at: clock(),
    page: { origin: 'http://127.0.0.1:4173', path: '/preview/', query_omitted: true },
    document_version: 'view-1',
    viewport: { width: 1280, height: 900, device_pixel_ratio: 1 },
    scroll: { x: 0, y: 0 },
    selection: { text: 'trace(A²)', rect: { x: 100, y: 200, width: 80, height: 20 } },
    context_text: 'Let A be 2×2 with λ₁ = 2, λ₂ = 3. Then trace(A²) = λ₁² + λ₂² = 13.',
    media: null,
    pixels: 'not_captured',
  };
  const frozen = await freezeDomSnapshot(snapshot, store.identity, { source_id: source.source_id, source_version: source.source_version, source_timezone: 'UTC' }, ids);
  const selection = freezeSelection(frozen.frame, { id: ids.next('sel'), bbox: { x: 0.1, y: 0.2, width: 0.06, height: 0.02 }, selectedText: 'trace(A²)', inputMode: 'explicit_text_ask', createdAt: clock() });
  const request = buildExplanationRequest(selection, ids.next('req'), null, 1);
  const card = resolveProbeCard(request, selection, []);
  const item = buildSave({ itemId: ids.next('itm'), source, frame: frozen.frame, frameArtifact: frozen.artifactBytes, selection, request, card, note, identity: store.identity, ids, clock, deviceSequence: 1, timezone: 'UTC' });
  return { store, item };
}

test('the save record keeps the note exactly, attributed to the user, and the AI state separate', async () => {
  const { item } = await savedFixture();
  assert.deepEqual(await saveProblems(item), []);
  assert.equal(item.user_note?.text, '  My own question: why 13?  ');
  assert.equal(item.user_note?.actor, 'user');
  assert.equal(item.user_note?.frame_id, item.frame.frame_id);
  assert.equal(item.card.provenance, 'none', 'no explanation for real content');
  assert.equal(item.card.status, 'unsupported');
  assert.equal(item.frame.representation, 'dom_snapshot');
  const { item: noNote } = await savedFixture(undefined, ' \n\t');
  assert.equal(noNote.user_note, null, 'whitespace alone is not a note');
});

test('the default store registers and saves nothing, and says so', async () => {
  const doc = await readUtf8Document(enc('x'), 'x.txt', null);
  assert.ok(doc.ok);
  await assert.rejects(unconnectedStore.importDocument(doc.document), (e: unknown) => e instanceof StoreError && e.kind === 'not_connected');
  const { item } = await savedFixture();
  await assert.rejects(unconnectedStore.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'not_connected');
  assert.deepEqual(await unconnectedStore.list(), []);
});

test('test double: a rejected save stores nothing; a retry of the same item commits once', async () => {
  const { store, item } = await savedFixture();
  store.failNext('save', 'reject');
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'rejected');
  assert.equal(store.itemCount(), 0);
  assert.equal((await store.save(item)).duplicate, false);
  assert.equal(store.itemCount(), 1);
});

test('test double: a lost answer is an unknown outcome; retrying the same item is idempotent', async () => {
  const { store, item } = await savedFixture();
  store.failNext('save', 'lost_response');
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  assert.equal(store.itemCount(), 1, 'it was applied before the answer was lost');
  const again = await store.save(item);
  assert.equal(again.duplicate, true);
  assert.equal(store.itemCount(), 1, 'no duplicate');
  await assert.rejects(store.save({ ...item, user_note: null }), /different content/, 'the same id with changed content is refused');
});

test('test double: reopening returns the exact original and the saved context, not the page state', async () => {
  const { store, item } = await savedFixture();
  await store.save(item);
  const listed = await store.list();
  assert.deepEqual(listed.map((s) => s.item_id), [item.item_id]);
  const got = await store.get(item.item_id);
  assert.equal(got.document.text, SAMPLE);
  assert.deepEqual(got.item, item);
  assert.match(JSON.parse(got.item.frame_artifact).context_text, /trace\(A²\)/);
});

test('test double: inconsistent or unregistered items are refused', async () => {
  const { store, item } = await savedFixture();
  await assert.rejects(store.save({ ...item, frame_artifact: `${item.frame_artifact} ` }), /content hash/);
  await assert.rejects(store.save({ ...item, selection: { ...item.selection, frame_id: 'frm_other' } }), /not bound to the saved frame/);
  const other = createTestDoubleStore(ids, clock);
  await assert.rejects(other.save(item), /not registered/);
});
