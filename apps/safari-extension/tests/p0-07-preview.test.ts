// P0-07 document preview: the DOM-free parts. Exact UTF-8 reading and block splitting,
// the save record (existing v0.1.0 shapes plus the user's own title, request and note,
// AI state separate), limits, the in-page test double, and the API store's use of the
// document-preview.0.1.0 wire. The API store runs here against `fakeApi`, a small
// in-test stand-in for the server: it shows what the client sends and how it reads
// answers, not that the real API or PostgreSQL behave this way (see preview-check.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, bytesToBase64, MAX_DOCUMENT_BYTES, readUtf8Document, splitBlocks, type LocalDocument } from '../preview/src/document.ts';
import { buildSave, codePoints, createTestDoubleStore, limitProblems, saveProblems, StoreError, suggestTitle, type PreviewSave, type PreviewStore, type TestDoubleStore } from '../preview/src/store.ts';
import { createApiStore } from '../preview/src/api-store.ts';
import { buildBridgeRequest } from '../src/bridge.ts';
import { buildExplanationRequest, resolveProbeCard } from '../src/explain.ts';
import { freezeSelection } from '../src/anchor.ts';
import { freezeDomSnapshot, sha256Hex, type DomSnapshotPayload, type Ids } from '../src/frame.ts';

const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
const SAMPLE =
  '﻿# Eigen notes — 特征值\r\n\r\nLet A be 2×2 with λ₁ = 2, λ₂ = 3.\nThen trace(A²) = λ₁² + λ₂² = 13.\n\n\n' +
  '<script>alert("x")</script> <b>bold?</b> &amp; 🙂 é\n  \t\nLast line without newline';

test('reads UTF-8 exactly, keeping the BOM, CRLF, markup and non-ASCII', async () => {
  const r = await readUtf8Document(enc(SAMPLE), 'notes.md', 1);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.document.text, SAMPLE);
  assert.equal(r.document.byte_length, enc(SAMPLE).byteLength);
  assert.match(r.document.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(new TextEncoder().encode(r.document.text), enc(SAMPLE), 'the text re-encodes to the original bytes');
});

test('refuses invalid UTF-8, NUL and oversized files without guessing or truncating', async () => {
  const bad = await readUtf8Document(new Uint8Array([0x61, 0xff, 0x62]), 'latin1.txt', null);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? '' : bad.reason, /not valid UTF-8/);
  const nul = await readUtf8Document(enc('a\u0000b'), 'nul.txt', null);
  assert.match(nul.ok ? '' : nul.reason, /NUL/);
  const big = await readUtf8Document(new Uint8Array(MAX_DOCUMENT_BYTES + 1), 'big.txt', null);
  assert.equal(big.ok, false);
  assert.match(big.ok ? '' : big.reason, /Nothing was opened or truncated/);
  const limit = await readUtf8Document(new Uint8Array(MAX_DOCUMENT_BYTES).fill(0x61), 'limit.txt', null);
  assert.equal(limit.ok, true, 'exactly 2 MiB opens');
});

test('blocks join back to the original exactly and separate paragraphs at blank lines', () => {
  const blocks = splitBlocks(SAMPLE);
  assert.equal(blocks.map((b) => b.text).join(''), SAMPLE);
  assert.deepEqual(blocks.map((b) => b.kind), ['paragraph', 'gap', 'paragraph', 'gap', 'paragraph', 'gap', 'paragraph']);
  assert.equal(blocks[2]!.text, 'Let A be 2×2 with λ₁ = 2, λ₂ = 3.\nThen trace(A²) = λ₁² + λ₂² = 13.');
  assert.deepEqual(splitBlocks(''), []);
  assert.equal(splitBlocks('one\r\rtwo').length, 3, 'CR-only line endings split too');
});

test('base64 is standard and canonical, and round-trips exact bytes', () => {
  const bytes = enc(SAMPLE);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  assert.equal(bytesToBase64(enc('ab')), 'YWI=');
  assert.throws(() => base64ToBytes('YWJ='), /canonical/, 'non-zero padding bits are refused');
  assert.throws(() => base64ToBytes('YW I='));
  const large = new Uint8Array(300000).map((_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(large)), large, 'chunked encoding of a large buffer');
});

let n = 0;
const ids: Ids = { next: (p) => `${p}_${++n}` };
const clock = (): string => '2026-09-29T05:00:00.000Z';

async function savedFixture<S extends PreviewStore>(
  store: S,
  text: { title?: string; requestText?: string; userNote?: string } = {},
): Promise<{ store: S; item: PreviewSave; doc: LocalDocument }> {
  const opened = await readUtf8Document(enc(SAMPLE), 'notes.md', null);
  assert.ok(opened.ok);
  const source = await store.importDocument(opened.document, 'UTC');
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
  const item = buildSave({
    itemId: ids.next('note'),
    source,
    frame: frozen.frame,
    frameArtifact: frozen.artifactBytes,
    bridgeRequest: buildBridgeRequest(selection, ids.next('brq')),
    request,
    card: resolveProbeCard(request, selection, []),
    title: text.title ?? suggestTitle(selection.selected_text),
    requestText: text.requestText ?? '  My own question: why 13?  ',
    userNote: text.userNote ?? '我的笔记\r\nline two ',
  });
  return { store, item, doc: opened.document };
}
const doubleFixture = (): Promise<{ store: TestDoubleStore; item: PreviewSave; doc: LocalDocument }> => savedFixture(createTestDoubleStore(ids, clock));

test("the save record keeps the user's words exactly and the AI state separate", async () => {
  const { item } = await doubleFixture();
  assert.deepEqual(await saveProblems(item), []);
  assert.equal(item.request_text, '  My own question: why 13?  ');
  assert.equal(item.user_note, '我的笔记\r\nline two ');
  assert.equal(item.title, 'trace(A²)');
  assert.equal(item.request.selection_id, item.bridge_request.selection.id);
  assert.equal(item.card.provenance, 'none', 'no explanation for real content');
  assert.equal(item.card.status, 'unsupported');
  assert.equal(item.frame.representation, 'dom_snapshot');
  assert.equal(suggestTitle('   '), 'Selected region');
  assert.equal(codePoints(suggestTitle('🙂'.repeat(200))), 81, 'a long selection suggests 80 characters and an ellipsis');
});

test('limits are checked in code points and nothing is shortened', async () => {
  const { item } = await doubleFixture();
  const at = (patch: Partial<PreviewSave>): string => limitProblems({ ...item, ...patch }).join('; ');
  assert.equal(at({ title: '🙂'.repeat(300), request_text: '🙂'.repeat(65536), user_note: 'x'.repeat(65536) }), '', '300 / 65,536 code points are allowed');
  assert.match(at({ title: '' }), /title/);
  assert.match(at({ title: ' \t' }), /title/);
  assert.match(at({ title: 'x'.repeat(301) }), /title/);
  assert.match(at({ request_text: 'x'.repeat(65537) }), /request/);
  assert.match(at({ user_note: '🙂'.repeat(65537) }), /note/);
  assert.match(at({ user_note: 'a\u0000b' }), /NUL/);
  assert.match(at({ frame_artifact: 'x'.repeat(1024 * 1024 + 1) }), /1 MiB/);
});

test('test double: a rejected save stores nothing; a retry of the same item commits once', async () => {
  const { store, item } = await doubleFixture();
  store.failNext('save', 'reject');
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'rejected');
  assert.equal(store.itemCount(), 0);
  assert.equal((await store.save(item)).duplicate, false);
  assert.equal(store.itemCount(), 1);
});

test('test double: a lost answer is an unknown outcome; retrying the same item is idempotent', async () => {
  const { store, item } = await doubleFixture();
  store.failNext('save', 'lost_response');
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  assert.equal(store.itemCount(), 1, 'it was applied before the answer was lost');
  const again = await store.save(item);
  assert.equal(again.duplicate, true);
  assert.equal(store.itemCount(), 1, 'no duplicate');
  await assert.rejects(store.save({ ...item, user_note: 'changed' }), /different content/, 'the same id with changed content is refused');
});

test('test double: reopening returns the exact original and the saved context, not the page state', async () => {
  const { store, item } = await doubleFixture();
  await store.save(item);
  const listed = await store.list();
  assert.deepEqual(listed.map((s) => s.item_id), [item.item_id]);
  const got = await store.get(item.item_id);
  assert.equal(got.document.text, SAMPLE);
  assert.deepEqual(got.item, item);
  assert.deepEqual(got.verified, { source: true, frame: true });
  assert.match(JSON.parse(got.item.frame_artifact).context_text, /trace\(A²\)/);
});

test('test double: inconsistent or unregistered items are refused', async () => {
  const { store, item } = await doubleFixture();
  await assert.rejects(store.save({ ...item, frame_artifact: `${item.frame_artifact} ` }), /content hash/);
  const moved = { ...item.bridge_request, selection: { ...item.bridge_request.selection, frame_id: 'frm_other' } };
  await assert.rejects(store.save({ ...item, bridge_request: moved }), /not bound to the saved frame/);
  const other = createTestDoubleStore(ids, clock);
  await assert.rejects(other.save(item), /not registered/);
});

// ---- API store against an in-test stand-in for the server ---------------------------------

const TOKEN = 'T'.repeat(40);
type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };

/** In-test stand-in for the preview API: records calls, applies idempotency by key+body. */
function fakeApi(identity = { user_id: 'usr_a', device_id: 'dev_a', session_id: 'ses_a' }) {
  const calls: Call[] = [];
  const replay = new Map<string, { body: string; response: unknown }>();
  const sources = new Map<string, Record<string, unknown>>();
  const saves = new Map<string, Record<string, unknown>>();
  let token = TOKEN;
  // Test controls: the next POST is applied and then its answer lost; the next call gets this status.
  const control = { loseNextAnswer: false, dropNextRequest: false, nextStatus: 0, tamperFrame: false };
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(String(url));
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const method = init.method ?? 'GET';
    calls.push({ method, path: u.pathname, headers, body });
    if (control.nextStatus) {
      const status = control.nextStatus;
      control.nextStatus = 0;
      return json(status, { contract_version: 'document-preview.0.1.0', code: status === 409 ? 'conflict' : 'unavailable' });
    }
    if (headers['Authorization'] !== `Bearer ${token}`) return json(401, { contract_version: 'document-preview.0.1.0', code: 'unauthorized' });
    if (control.dropNextRequest) {
      control.dropNextRequest = false;
      throw new TypeError('Failed to fetch'); // never reached the server
    }
    const answer = (status: number, response: unknown): Response => {
      if (control.loseNextAnswer) {
        control.loseNextAnswer = false;
        throw new TypeError('Failed to fetch');
      }
      return json(status, response);
    };
    if (method === 'GET' && u.pathname === '/preview/v1/session') return json(200, { contract_version: 'document-preview.0.1.0', ...identity, authorization_generation: 1, membership_revision: 1, project_id: null });
    if (method === 'POST') {
      const key = `${u.pathname}|${headers['Idempotency-Key']}`;
      const previous = replay.get(key);
      if (previous) return previous.body === init.body ? answer(200, { ...(previous.response as object), replayed: true }) : json(409, { contract_version: 'document-preview.0.1.0', code: 'conflict' });
      let response: Record<string, unknown>;
      if (u.pathname === '/preview/v1/documents') {
        const source = { user_id: identity.user_id, source_id: body.source_id, source_version: body.source_version, content_hash: body.sha256, source_timezone: body.source_timezone };
        sources.set(body.source_id, { ...source, content_base64: body.content_base64, filename: body.filename });
        response = { contract_version: 'document-preview.0.1.0', source, filename: body.filename, persistence: 'server_committed', replayed: false };
      } else {
        saves.set(body.note_id, body);
        response = { contract_version: 'document-preview.0.1.0', note_id: body.note_id, revision: 1, persistence: 'server_committed', replayed: false, ai_status: 'provider_unavailable' };
      }
      replay.set(key, { body: String(init.body), response });
      return answer(200, response);
    }
    const noteId = decodeURIComponent(u.pathname.slice('/preview/v1/saves/'.length));
    const saved = saves.get(noteId);
    if (!saved) return json(404, { contract_version: 'document-preview.0.1.0', code: 'not_found' });
    const selection = (saved['bridge_request'] as { selection: { source_id: string } }).selection;
    const source = sources.get(selection.source_id)!;
    const frameBytes = control.tamperFrame ? bytesToBase64(enc('{}')) : saved['frame_bytes_base64'];
    return json(200, {
      contract_version: 'document-preview.0.1.0',
      source: { user_id: source['user_id'], source_id: source['source_id'], source_version: source['source_version'], content_hash: source['content_hash'] },
      filename: source['filename'],
      content_base64: source['content_base64'],
      frame: saved['frame'],
      frame_bytes_base64: frameBytes,
      bridge_request: saved['bridge_request'],
      request: saved['request'],
      observation: { event_id: 'evt_1', actor: 'user', text: saved['request_text'] },
      note: { note_id: noteId, title: saved['title'], revision: 1, authorship: 'user', created_at: '2026-09-29T05:01:00.000Z', blocks: [{ id: 'blk_1', layer: 'user_original', format: 'text', content: saved['user_note'] }] },
      request_text: saved['request_text'],
      user_note: saved['user_note'],
      persistence: 'server_committed',
      ai_status: 'provider_unavailable',
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls, control, setToken: (t: string) => (token = t) };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const apiStore = (api: ReturnType<typeof fakeApi>, storage = memoryStorage()) =>
  createApiStore({ fetch: api.fetch, storage, ids, clock, timeoutMs: 1000 });

test('API store: nothing is sent before connecting; the identity comes from GET session; the token is never stored', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  const doc = await readUtf8Document(enc('x'), 'x.txt', null);
  assert.ok(doc.ok);
  await assert.rejects(store.importDocument(doc.document, 'UTC'), (e: unknown) => e instanceof StoreError && e.kind === 'not_connected');
  assert.equal(api.calls.length, 0);
  assert.equal(store.identity.user_id, 'not-connected');
  await assert.rejects(store.connect('wrong-token-wrong-token-wrong-token'), (e: unknown) => e instanceof StoreError && e.kind === 'unauthorized');
  assert.equal(store.status, 'disconnected');
  const session = await store.connect(TOKEN);
  assert.deepEqual([store.status, session.user_id, store.identity.origin], ['connected', 'usr_a', 'local_preview_api']);
  assert.equal(api.calls.at(-1)!.headers['Authorization'], `Bearer ${TOKEN}`);
  await savedFixture(store).then(({ store: s, item }) => s.save(item));
  assert.ok(![...storage.data.values()].some((v) => v.includes(TOKEN)), 'the token is not in storage');
  assert.ok(!api.calls.some((c) => c.path.includes(TOKEN) || JSON.stringify(c.body ?? '').includes(TOKEN)), 'the token is only in the header');
});

test('API store: import and save send the exact wire bodies; a lost answer is unknown and the retry repeats them', async () => {
  const api = fakeApi();
  const store = apiStore(api);
  await store.connect(TOKEN);
  const opened = await readUtf8Document(enc(SAMPLE), 'notes.md', null);
  assert.ok(opened.ok);
  api.control.loseNextAnswer = true;
  await assert.rejects(store.importDocument(opened.document, 'Asia/Shanghai'), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  const source = await store.importDocument(opened.document, 'Asia/Shanghai');
  const imports = api.calls.filter((c) => c.path === '/preview/v1/documents');
  assert.equal(imports.length, 2);
  assert.deepEqual(imports[0]!.body, imports[1]!.body, 'the retry sends the same body');
  assert.equal(imports[0]!.headers['Idempotency-Key'], imports[1]!.headers['Idempotency-Key']);
  const body = imports[0]!.body as Record<string, unknown>;
  assert.deepEqual(base64ToBytes(body['content_base64'] as string), enc(SAMPLE), 'the complete original bytes, BOM and CRLF included');
  assert.equal(body['sha256'], opened.document.sha256);
  assert.deepEqual([body['device_id'], body['session_id'], body['source_version'], body['source_timezone'], body['project_id']], ['dev_a', 'ses_a', 1, 'Asia/Shanghai', null]);
  assert.equal(source.source_id, body['source_id']);

  const { item } = await savedFixture(store);
  api.control.loseNextAnswer = true;
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  const again = await store.save(item);
  assert.equal(again.duplicate, true, 'the server replayed the first commit');
  const saves = api.calls.filter((c) => c.path === '/preview/v1/saves');
  assert.equal(saves.length, 2);
  assert.deepEqual(saves[0]!.body, saves[1]!.body);
  assert.equal(saves[0]!.headers['Idempotency-Key'], item.item_id);
  const save = saves[0]!.body as Record<string, unknown>;
  assert.equal(new TextDecoder().decode(base64ToBytes(save['frame_bytes_base64'] as string)), item.frame_artifact, 'the exact frozen DOM bytes');
  assert.equal(await sha256Hex(item.frame_artifact), item.frame.content_hash);
  assert.deepEqual([save['request_text'], save['user_note'], save['title']], [item.request_text, item.user_note, item.title]);
  assert.deepEqual(save['bridge_request'], item.bridge_request);
  assert.deepEqual(save['request'], item.request);
  assert.equal((await store.list()).length, 1, 'listed once');
});

test('API store: refusals, server failures and an expired token are reported distinctly', async () => {
  const api = fakeApi();
  const store = apiStore(api);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.nextStatus = 409;
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'rejected' && /conflict/.test(e.message));
  api.control.nextStatus = 503;
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unknown', 'a server failure on a write may have committed');
  api.setToken('N'.repeat(40)); // API restarted with a new token
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unauthorized');
  assert.equal(store.status, 'expired');
  const before = api.calls.length;
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'not_connected');
  assert.equal(api.calls.length, before, 'nothing is sent without a token');
  await store.connect('N'.repeat(40));
  assert.equal((await store.save(item)).duplicate, false, 'the retry after reconnecting commits');
});

test('API store: a token for a different identity is refused once the page has one', async () => {
  const a = fakeApi();
  const b = fakeApi({ user_id: 'usr_b', device_id: 'dev_b', session_id: 'ses_b' });
  let target = a;
  const store = createApiStore({ fetch: (u, i) => target.fetch(u, i), storage: null, ids, clock });
  await store.connect(TOKEN);
  target = b;
  await assert.rejects(store.connect(TOKEN), /different local identity/);
  assert.equal(store.identity.user_id, 'usr_a', 'records made on this page keep their identity');
  assert.equal(store.status, 'expired', 'reconnect with a token for the same identity');
});

test('API store: reopening reads the originals back from the server and checks their hashes', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item, doc } = await savedFixture(store);
  await store.save(item);

  // A new page (refresh): same browser index, new store, reconnect.
  const fresh = apiStore(api, storage);
  assert.deepEqual(await fresh.list(), [], 'nothing is listed before connecting');
  await fresh.connect(TOKEN);
  const [summary] = await fresh.list();
  assert.deepEqual([summary!.item_id, summary!.title, summary!.document_name], [item.item_id, item.title, 'notes.md']);
  const got = await fresh.get(item.item_id);
  assert.equal(got.document.text, SAMPLE);
  assert.equal(got.document.sha256, doc.sha256);
  assert.equal(got.item.frame_artifact, item.frame_artifact);
  assert.deepEqual([got.item.request_text, got.item.user_note, got.item.title], [item.request_text, item.user_note, item.title]);
  assert.deepEqual(got.item.bridge_request, item.bridge_request);
  assert.equal(got.item.card.provenance, 'none');
  assert.deepEqual(got.verified, { source: true, frame: true });
  assert.equal(got.note?.authorship, 'user');
  assert.equal(got.committed_at, '2026-09-29T05:01:00.000Z', 'the note revision time, not the receipt time');

  api.control.tamperFrame = true;
  assert.equal((await fresh.get(item.item_id)).verified.frame, false, 'a frame that does not match its hash is reported');
  await assert.rejects(fresh.get('note_missing'), (e: unknown) => e instanceof StoreError && e.kind === 'rejected' && /not_found/.test(e.message));
});

test('API store: a note id is listed before its save is sent, so a lost answer cannot orphan a commit', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item: committed } = await savedFixture(store);
  const { item: neverArrived } = await savedFixture(store);
  const { item: refused } = await savedFixture(store);
  api.control.loseNextAnswer = true; // committed, answer lost
  await assert.rejects(store.save(committed), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  api.control.dropNextRequest = true; // never reached the server
  await assert.rejects(store.save(neverArrived), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  api.control.nextStatus = 409; // refused: known not applied, first try
  await assert.rejects(store.save(refused), (e: unknown) => e instanceof StoreError && e.kind === 'rejected');

  // The page is reloaded (or the user discards both unknown items); a fresh store reconnects.
  const fresh = apiStore(api, storage);
  await fresh.connect(TOKEN);
  const listed = await fresh.list();
  assert.deepEqual(
    listed.map((e) => [e.item_id, e.pending, e.saved_at]),
    [[committed.item_id, false, '2026-09-29T05:01:00.000Z']],
    'the committed note is found and listed with its server time; the one that never arrived and the refused one are not listed',
  );
});

test('API store: a refused retry after an unknown outcome keeps the note listed until checked', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.loseNextAnswer = true;
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unknown');
  api.setToken('N'.repeat(40));
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unauthorized');
  const fresh = apiStore(api, storage);
  await fresh.connect('N'.repeat(40));
  assert.deepEqual((await fresh.list()).map((e) => [e.item_id, e.pending]), [[item.item_id, false]], 'still reachable, and found saved');
});

test('API store: pending ids that cannot be checked stay pending; a note the API does not have is pruned on reopen', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.dropNextRequest = true;
  await assert.rejects(store.save(item));
  api.control.nextStatus = 503; // the check itself fails: the outcome is still unknown
  assert.deepEqual((await store.list()).map((e) => [e.item_id, e.pending, e.saved_at]), [[item.item_id, true, null]]);
  await assert.rejects(store.get(item.item_id), (e: unknown) => e instanceof StoreError && e.code === 'not_found');
  assert.deepEqual(await store.list(), [], 'pruned');
});
