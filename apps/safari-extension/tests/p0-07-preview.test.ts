// P0-07 document preview: the DOM-free parts. Exact UTF-8 reading and block splitting,
// the save record (existing v0.1.0 shapes plus the user's own title, request and note,
// AI state separate), limits, the in-page test double, and the API store's use of the
// document-preview.0.1.0 wire. The API store runs here against `fakeApi`, a small
// in-test stand-in for the server: it shows what the client sends and how it reads
// answers, not that the real API or PostgreSQL behave this way (see preview-check.mjs).
// Its saved items are built the way the released server builds them (services/api/preview.py),
// and the released contract example is checked as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { base64ToBytes, bytesToBase64, MAX_DOCUMENT_BYTES, readUtf8Document, splitBlocks, type LocalDocument } from '../preview/src/document.ts';
import { buildSave, codePoints, createTestDoubleStore, limitProblems, saveProblems, StoreError, suggestTitle, type PreviewSave, type PreviewStore, type TestDoubleStore } from '../preview/src/store.ts';
import { createApiStore, savedPreviewProblems } from '../preview/src/api-store.ts';
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
const V = 'document-preview.0.1.0';
type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };
type Json = Record<string, any>;

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** Headers arrive, then the body never ends and ignores any abort (stricter than a real fetch). */
const stalled = (): Response => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'content-type': 'application/json' } });
/** A successful answer cut off halfway through its JSON. */
const truncated = (body: unknown): Response => {
  const text = JSON.stringify(body);
  return new Response(text.slice(0, Math.floor(text.length / 2)), { status: 200, headers: { 'content-type': 'application/json' } });
};

/**
 * In-test stand-in for the preview API: records calls, applies idempotency by key + body, and
 * builds saved items as the released server does (source snapshot, observation, note revision 1).
 */
function fakeApi(identity = { user_id: 'usr_a', device_id: 'dev_a', session_id: 'ses_a' }) {
  const calls: Call[] = [];
  const replay = new Map<string, { body: string; response: unknown }>();
  const sources = new Map<string, Json>();
  const saves = new Map<string, Json>();
  const deferred: Json[] = [];
  let token = TOKEN;
  let sequence = 0;
  const control = {
    /** The next POST is applied, then its answer is lost. */
    loseNextAnswer: false,
    /** The next request never reaches the server. */
    dropNextRequest: false,
    /** The next save arrives slowly: not applied yet, the page sees no answer; `commitDeferred` applies it. */
    deferNextSave: false,
    /** The next call gets this HTTP status. */
    nextStatus: 0,
    /** The next answer's body: stalls after the headers, or is cut off. */
    nextBody: 'normal' as 'normal' | 'stalled' | 'truncated',
    /** Rewrites the next saved item returned by GET. */
    rewriteNextGet: null as ((saved: Json) => unknown) | null,
  };
  const deliver = (status: number, body: unknown): Response => {
    const mode = control.nextBody;
    control.nextBody = 'normal';
    return mode === 'stalled' ? stalled() : mode === 'truncated' ? truncated(body) : json(status, body);
  };
  const apply = (body: Json): void => {
    const source = sources.get(body['bridge_request'].selection.source_id)!;
    const frame = body['frame'];
    const eventId = `evt_${++sequence}`;
    const event = {
      user_id: frame.user_id, source_id: frame.source_id, source_version: frame.source_version, device_id: frame.device_id, session_id: frame.session_id,
      source_timezone: frame.source_timezone, frame_id: frame.frame_id, media_position: frame.media_position, event_id: eventId, device_sequence: sequence,
      captured_at: body['bridge_request'].selection.created_at, received_at: '2026-09-29T05:01:00.000Z', actor: 'user', text: body['request_text'],
      confidence: 1, gap_flags: [], correction_of: null,
    };
    const note = {
      user_id: identity.user_id, note_id: body['note_id'], kind: 'ai', project_id: source['snapshot'].project_id, concept_ids: [], title: body['title'],
      blocks: [{ id: `blk_${sequence}`, layer: 'user_original', format: 'text', content: body['user_note'] }], ink_blob_id: null,
      context_segments: [{ source_id: frame.source_id, source_version: frame.source_version, frame_id: frame.frame_id, media_position: frame.media_position, source_event_ids: [eventId] }],
      source_event_ids: [eventId], revision: 1, base_revision: 0, authorship: 'user', created_at: '2026-09-29T05:01:00.000Z',
    };
    saves.set(body['note_id'], { body, event, note });
  };
  const fetch = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(String(url));
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const method = init.method ?? 'GET';
    calls.push({ method, path: u.pathname, headers, body });
    if (control.nextStatus) {
      const status = control.nextStatus;
      control.nextStatus = 0;
      return json(status, { contract_version: V, code: status === 409 ? 'conflict' : 'unavailable' });
    }
    if (headers['Authorization'] !== `Bearer ${token}`) return json(401, { contract_version: V, code: 'unauthorized' });
    if (control.dropNextRequest) {
      control.dropNextRequest = false;
      throw new TypeError('Failed to fetch'); // never reached the server
    }
    const answer = (response: unknown): Response => {
      if (control.loseNextAnswer) {
        control.loseNextAnswer = false;
        throw new TypeError('Failed to fetch');
      }
      return deliver(200, response);
    };
    if (method === 'GET' && u.pathname === '/preview/v1/session') return json(200, { contract_version: V, ...identity, authorization_generation: 1, membership_revision: 1, project_id: null });
    if (method === 'POST') {
      const key = `${u.pathname}|${headers['Idempotency-Key']}`;
      const previous = replay.get(key);
      if (previous) return previous.body === init.body ? answer({ ...(previous.response as object), replayed: true }) : json(409, { contract_version: V, code: 'conflict' });
      if (u.pathname === '/preview/v1/saves' && control.deferNextSave) {
        control.deferNextSave = false;
        deferred.push(body);
        throw new TypeError('Failed to fetch'); // still in transit; committed later
      }
      let response: Json;
      if (u.pathname === '/preview/v1/documents') {
        const url = `urn:learning-companion:document:${identity.user_id}:${body.source_id}`;
        const snapshot = {
          user_id: identity.user_id, source_id: body.source_id, source_version: body.source_version, project_id: body.project_id, type: 'document',
          original_url: url, canonical_url: url, connection_id: null, access_status: 'ready', content_hash: body.sha256, fetched_at: '2026-09-29T05:00:30.000Z',
          source_timezone: body.source_timezone, locator_schema: 'source-frame-v1', text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(base64ToBytes(body.content_base64)), // BOM kept, as Python's decode keeps it
          provenance: { origin: 'user_authorized', consent_scope: 'learning', attribution: `Imported by authenticated local user ${identity.user_id}`, license: 'User-provided; rights not independently verified' },
        };
        sources.set(body.source_id, { snapshot, content_base64: body.content_base64, filename: body.filename });
        response = { contract_version: V, source: snapshot, filename: body.filename, persistence: 'server_committed', replayed: false };
      } else {
        apply(body);
        response = { contract_version: V, note_id: body.note_id, revision: 1, persistence: 'server_committed', replayed: false, ai_status: 'provider_unavailable' };
      }
      replay.set(key, { body: String(init.body), response });
      return answer(response);
    }
    const noteId = decodeURIComponent(u.pathname.slice('/preview/v1/saves/'.length));
    const saved = saves.get(noteId);
    if (!saved) return json(404, { contract_version: V, code: 'not_found' });
    const source = sources.get(saved['body'].bridge_request.selection.source_id)!;
    const item: Json = {
      contract_version: V, source: source['snapshot'], filename: source['filename'], content_base64: source['content_base64'],
      frame: saved['body'].frame, frame_bytes_base64: saved['body'].frame_bytes_base64, bridge_request: saved['body'].bridge_request, request: saved['body'].request,
      observation: saved['event'], note: saved['note'], request_text: saved['event'].text, user_note: saved['note'].blocks[0].content,
      ai_status: 'provider_unavailable', persistence: 'server_committed',
    };
    const rewrite = control.rewriteNextGet;
    control.rewriteNextGet = null;
    return deliver(200, rewrite ? rewrite(structuredClone(item)) : item);
  };
  return {
    fetch: fetch as typeof globalThis.fetch,
    calls,
    control,
    setToken: (t: string) => (token = t),
    commitDeferred: () => deferred.splice(0).forEach(apply),
    forget: (noteId: string) => saves.delete(noteId),
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const apiStore = (api: ReturnType<typeof fakeApi>, storage = memoryStorage(), timeoutMs = 1000) => createApiStore({ fetch: api.fetch, storage, ids, clock, timeoutMs });
const listed = async (store: PreviewStore) => (await store.list()).map((e) => [e.item_id, e.pending, e.saved_at]);
const kind = (k: string) => (e: unknown) => e instanceof StoreError && e.kind === k;

test('API store: nothing is sent before connecting; the identity comes from GET session; the token is never stored', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  const doc = await readUtf8Document(enc('x'), 'x.txt', null);
  assert.ok(doc.ok);
  await assert.rejects(store.importDocument(doc.document, 'UTC'), kind('not_connected'));
  assert.equal(api.calls.length, 0);
  assert.equal(store.identity.user_id, 'not-connected');
  await assert.rejects(store.connect('wrong-token-wrong-token-wrong-token'), kind('unauthorized'));
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
  await assert.rejects(store.importDocument(opened.document, 'Asia/Shanghai'), kind('unknown'));
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
  await assert.rejects(store.save(item), kind('unknown'));
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
  await assert.rejects(store.save(item), kind('unknown'), 'a server failure on a write may have committed');
  api.setToken('N'.repeat(40)); // API restarted with a new token
  await assert.rejects(store.save(item), kind('unauthorized'));
  assert.equal(store.status, 'expired');
  const before = api.calls.length;
  await assert.rejects(store.save(item), kind('not_connected'));
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

  // Same DOM content in different bytes: every binding holds, only the hash check fails.
  api.control.rewriteNextGet = (saved) => ({ ...saved, frame_bytes_base64: bytesToBase64(enc(JSON.stringify(JSON.parse(item.frame_artifact), null, 1))) });
  assert.deepEqual((await fresh.get(item.item_id)).verified, { source: true, frame: false }, 'a frame whose bytes do not match its hash is reported');
  await assert.rejects(fresh.get('note_missing'), (e: unknown) => e instanceof StoreError && e.kind === 'rejected' && e.code === 'not_found');
});

// ---- timeout through the response body (lead review of 096cac1, finding 1) -----------------

test('API store: a save whose answer headers arrive but whose body stalls settles as unknown within the deadline, keeping its id and retry', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage, 30);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.nextBody = 'stalled'; // applied on the server; its answer never finishes
  const started = Date.now();
  let outcome: unknown = 'still waiting';
  let settledAfter = -1;
  void store.save(item).then(
    () => (outcome = 'saved'),
    (e: unknown) => {
      outcome = e instanceof StoreError ? e.kind : String(e);
      settledAfter = Date.now() - started;
    },
  );
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(outcome, 'unknown', 'settled as unknown, not left saving');
  assert.ok(settledAfter >= 25 && settledAfter < 250, `settled at the 30 ms deadline (after ${settledAfter} ms)`);
  assert.deepEqual(await listed(store), [[item.item_id, false, '2026-09-29T05:01:00.000Z']], 'its id stayed listed; the next list found the commit');
  const sent = api.calls.filter((c) => c.path === '/preview/v1/saves');
  const retry = await store.save(item);
  assert.equal(retry.duplicate, true, 'the retry is the same request (replayed, no duplicate)');
  const both = api.calls.filter((c) => c.path === '/preview/v1/saves');
  assert.deepEqual(both.at(-1)!.body, sent[0]!.body);
  assert.equal(both.at(-1)!.headers['Idempotency-Key'], item.item_id);
});

test('API store: a cut-off answer is unknown for a write and not an answer for a read', async () => {
  const api = fakeApi();
  const store = apiStore(api, memoryStorage(), 200);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.nextBody = 'truncated';
  await assert.rejects(store.save(item), (e: unknown) => e instanceof StoreError && e.kind === 'unknown' && /could not be read completely/.test(e.message));
  api.control.nextBody = 'truncated';
  await assert.rejects(store.get(item.item_id), kind('rejected'));
  api.control.nextBody = 'stalled';
  await assert.rejects(store.get(item.item_id), kind('rejected'), 'a stalled read settles too');
  api.control.nextBody = 'truncated';
  const opened = await readUtf8Document(enc('another document'), 'b.txt', null);
  assert.ok(opened.ok);
  await assert.rejects(store.importDocument(opened.document, 'UTC'), kind('unknown'));
});

// ---- pending ids: confirmed only by a valid item; 404 does not prune (lead review, finding 2 and addendum) ----

test('API store: a note id is listed before its save is sent, so a lost answer cannot orphan a commit', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item: committed } = await savedFixture(store);
  const { item: neverArrived } = await savedFixture(store);
  const { item: refused } = await savedFixture(store);
  api.control.loseNextAnswer = true; // committed, answer lost
  await assert.rejects(store.save(committed), kind('unknown'));
  api.control.dropNextRequest = true; // never reached the server
  await assert.rejects(store.save(neverArrived), kind('unknown'));
  api.control.nextStatus = 409; // refused: known not applied, first try
  await assert.rejects(store.save(refused), kind('rejected'));

  // The page is reloaded (or the user discards both unknown items); a fresh store reconnects.
  const fresh = apiStore(api, storage);
  await fresh.connect(TOKEN);
  assert.deepEqual(
    await listed(fresh),
    [
      [committed.item_id, false, '2026-09-29T05:01:00.000Z'],
      [neverArrived.item_id, true, null],
    ],
    'the commit is found with its server time; the one not found stays unconfirmed (it may still arrive); the refused first write is not listed',
  );
});

test('API store: a pending id not found yet is kept, and confirmed when its slower request commits (pending 404 → later 200)', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.deferNextSave = true; // still in transit when the page gives up waiting
  await assert.rejects(store.save(item), kind('unknown'));
  assert.deepEqual(await listed(store), [[item.item_id, true, null]], 'list: 404 keeps it pending');
  await assert.rejects(store.get(item.item_id), (e: unknown) => e instanceof StoreError && e.code === 'not_found' && /still unknown/.test(e.message));
  assert.deepEqual(await listed(store), [[item.item_id, true, null]], 'reopen: 404 keeps it pending too');
  // The page is reloaded before the commit: a fresh store over the same index still lists it.
  const fresh = apiStore(api, storage);
  await fresh.connect(TOKEN);
  assert.deepEqual(await listed(fresh), [[item.item_id, true, null]], 'after a reload: still listed as unconfirmed');
  api.commitDeferred(); // the earlier request commits now
  assert.deepEqual(await listed(fresh), [[item.item_id, false, '2026-09-29T05:01:00.000Z']], 'then it is found and confirmed');
  assert.equal((await fresh.get(item.item_id)).item.user_note, item.user_note, 'and reopens');
});

test('API store: a refused retry after an unknown outcome keeps the note listed until checked', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.loseNextAnswer = true;
  await assert.rejects(store.save(item), kind('unknown'));
  api.setToken('N'.repeat(40));
  await assert.rejects(store.save(item), kind('unauthorized'));
  const fresh = apiStore(api, storage);
  await fresh.connect('N'.repeat(40));
  assert.deepEqual((await fresh.list()).map((e) => [e.item_id, e.pending]), [[item.item_id, false]], 'still reachable, and found saved');
});

test('API store: only a confirmed note that the API reports gone is pruned', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  await store.save(item);
  assert.deepEqual(await listed(store), [[item.item_id, false, '2026-09-29T05:00:00.000Z']]);
  api.control.nextStatus = 503; // a failed read changes nothing
  await assert.rejects(store.get(item.item_id), kind('rejected'));
  assert.deepEqual(await listed(store), [[item.item_id, false, '2026-09-29T05:00:00.000Z']]);
  api.forget(item.item_id); // deleted on the server after it was confirmed
  await assert.rejects(store.get(item.item_id), (e: unknown) => e instanceof StoreError && e.code === 'not_found' && /no longer has/.test(e.message));
  assert.deepEqual(await store.list(), [], 'pruned');
});

test('API store: an invalid or incomplete successful answer never confirms a pending id', async () => {
  const api = fakeApi();
  const storage = memoryStorage();
  const store = apiStore(api, storage);
  await store.connect(TOKEN);
  const { item } = await savedFixture(store);
  api.control.loseNextAnswer = true;
  await assert.rejects(store.save(item), kind('unknown'));
  const cases: Array<[string, (s: Json) => unknown]> = [
    ['200 null', () => null],
    ['another note', (s) => ({ ...s, note: { ...s['note'], note_id: 'note_other' } })],
    ['another owner', (s) => ({ ...s, source: { ...s['source'], user_id: 'usr_other' } })],
  ];
  for (const [label, rewrite] of cases) {
    api.control.rewriteNextGet = rewrite;
    assert.deepEqual(await listed(store), [[item.item_id, true, null]], `${label}: still pending`);
  }
  api.control.nextBody = 'truncated';
  assert.deepEqual(await listed(store), [[item.item_id, true, null]], 'truncated JSON: still pending');
  assert.deepEqual(await listed(store), [[item.item_id, false, '2026-09-29T05:01:00.000Z']], 'a valid answer confirms it');
});

// ---- the released contract example and isolated binding mutations (lead review, finding 2) ----

/** Read the released contract's canonical examples, without a second fixture copy. */
const EXAMPLES_FILE = new URL('../../../packages/contracts/document_preview/examples.json', import.meta.url);
const EXAMPLES_BYTES = readFileSync(EXAMPLES_FILE);
const RELEASED: Json = JSON.parse(new TextDecoder().decode(EXAMPLES_BYTES))['SavedPreview'];

test('the examples read are the released document-preview examples (git blob b53cee62)', () => {
  const blob = createHash('sha1').update(`blob ${EXAMPLES_BYTES.length}\0`).update(EXAMPLES_BYTES).digest('hex');
  assert.equal(blob, 'b53cee6236653fba0ced6f62c59e74251566c85b');
});

/** A store connected as the example's user whose save answer is lost, then GET answers `respond()`. */
async function exampleStore(respond: () => unknown) {
  const session = { contract_version: V, user_id: RELEASED['source'].user_id, device_id: RELEASED['frame'].device_id, session_id: RELEASED['frame'].session_id, authorization_generation: 1, membership_revision: 1, project_id: null };
  const store = createApiStore({
    ids,
    clock,
    storage: null,
    fetch: async (url, init) => {
      if (String(url).endsWith('/session')) return json(200, session);
      if (init?.method === 'POST') throw new TypeError('Failed to fetch');
      return json(200, respond());
    },
  });
  await store.connect(TOKEN);
  const item: PreviewSave = {
    item_id: RELEASED['note'].note_id, source: { user_id: RELEASED['source'].user_id, source_id: RELEASED['source'].source_id, source_version: RELEASED['source'].source_version },
    frame: RELEASED['frame'], frame_artifact: new TextDecoder().decode(base64ToBytes(RELEASED['frame_bytes_base64'])), bridge_request: RELEASED['bridge_request'], request: RELEASED['request'],
    card: resolveProbeCard(RELEASED['request'], RELEASED['bridge_request'].selection, []), title: RELEASED['note'].title, request_text: RELEASED['request_text'], user_note: RELEASED['user_note'],
  };
  await assert.rejects(store.save(item), kind('unknown')); // listed as pending
  return store;
}

test('API store: the released SavedPreview example is accepted, confirmed and verified', async () => {
  assert.deepEqual(savedPreviewProblems(RELEASED, RELEASED['note'].note_id, RELEASED['source'].user_id), []);
  const store = await exampleStore(() => RELEASED);
  assert.deepEqual((await store.list()).map((e) => e.pending), [false], 'confirmed');
  const got = await store.get(RELEASED['note'].note_id);
  assert.deepEqual(got.verified, { source: true, frame: true });
  assert.equal(got.item.user_note, RELEASED['user_note']);
});

test('API store: each isolated binding mutation of the released example is refused on reopen and never confirms a pending id', async () => {
  // Each case changes one relation and must be caught by its own check (the expected problem), so
  // removing any one check fails this test.
  const mutations: Array<[string, (p: Json) => void, RegExp]> = [
    // the lead's three
    ['frame.source_id', (p) => (p['frame'].source_id = 'source_other'), /selection and frame disagree \(source_id\)/],
    ['note.user_id', (p) => (p['note'].user_id = 'user_other'), /the note belongs to another user/],
    ['observation.actor', (p) => (p['observation'].actor = 'assistant'), /not the user's own confirmed request/],
    // the answer itself
    ['contract_version', (p) => (p['contract_version'] = 'document-preview.0.2.0'), /not a committed document-preview/],
    ['persistence', (p) => (p['persistence'] = 'pending'), /not a committed document-preview/],
    ['ai_status', (p) => (p['ai_status'] = 'generated'), /not a committed document-preview/],
    ['note.note_id', (p) => (p['note'].note_id = 'note_other'), /a different note/],
    ['source.provenance.origin', (p) => (p['source'].provenance.origin = 'fetched'), /not a user-authorized document/],
    // source / frame / selection / request
    ['source.source_id', (p) => (p['source'].source_id = 'source_other'), /source and frame disagree \(source_id\)/],
    ['source.source_timezone', (p) => (p['source'].source_timezone = 'Europe/Paris'), /source and frame disagree \(source_timezone\)/],
    ['selection.frame_id', (p) => (p['bridge_request'].selection.frame_id = 'frame_other'), /selection and frame disagree \(frame_id\)/],
    ['request.selection_id', (p) => (p['request'].selection_id = 'sel_other'), /the request is not bound to the selection/],
    ['request.project_id', (p) => (p['request'].project_id = 'project_other'), /the request and source projects differ/],
    ['frame.captured_at', (p) => (p['frame'].captured_at = '2020-01-01T00:00:00Z'), /the DOM context and frame\/selection disagree/],
    ['source.text', (p) => (p['source'].text = `${p['source'].text} `), /the source bytes and source text disagree/],
    // observation
    ['observation.device_id', (p) => (p['observation'].device_id = 'device_other'), /the observation and frame disagree \(device_id\)/],
    ['observation.captured_at', (p) => (p['observation'].captured_at = '2020-01-01T00:00:00Z'), /the observation time is not the selection time/],
    ['observation.text', (p) => (p['observation'].text = 'changed'), /the observation text is not the request text/],
    // note
    ['note.authorship', (p) => (p['note'].authorship = 'assistant'), /not the original user note revision 1/],
    ['note.revision', (p) => (p['note'].revision = 2), /not the original user note revision 1/],
    ['note.context_segments frame', (p) => (p['note'].context_segments[0].frame_id = 'frame_other'), /the note is not bound to this observation and frame/],
    ['note block content', (p) => (p['note'].blocks[0].content = 'changed'), /the note text is not the single user-original block/],
    ['note block layer', (p) => (p['note'].blocks[0].layer = 'ai_supplement'), /the note text is not the single user-original block/],
    // missing on both sides (would match each other without the presence checks)
    ['user note absent', (p) => ((p['user_note'] = null), (p['note'].blocks[0].content = null)), /the user text or its records are incomplete/],
    ['request text absent', (p) => ((p['request_text'] = null), (p['observation'].text = null)), /the user text or its records are incomplete/],
    ['event id absent', (p) => (delete p['observation'].event_id, (p['note'].source_event_ids = []), (p['note'].context_segments[0].source_event_ids = [])), /the user text or its records are incomplete/],
    ['source id absent everywhere', (p) => [p['source'], p['frame'], p['bridge_request'].selection, p['observation'], p['note'].context_segments[0]].forEach((r) => delete r.source_id), /the frame is incomplete/],
    ['selection id absent', (p) => (delete p['bridge_request'].selection.id, delete p['request'].selection_id), /the selection is incomplete/],
    ['project absent everywhere', (p) => [p['source'], p['request'], p['note']].forEach((r) => delete r.project_id), /the source or note is incomplete/],
    ['frame.representation', (p) => (p['frame'].representation = 'image'), /the frame is not a document DOM snapshot/],
  ];
  for (const [label, mutate, expected] of mutations) {
    const bad = structuredClone(RELEASED);
    mutate(bad);
    const problems = savedPreviewProblems(bad, RELEASED['note'].note_id, RELEASED['source'].user_id).join('; ');
    assert.match(problems, expected, `${label}: its own check fires`);
    const store = await exampleStore(() => bad);
    assert.deepEqual((await store.list()).map((e) => e.pending), [true], `${label}: not confirmed`);
    await assert.rejects(store.get(RELEASED['note'].note_id), kind('rejected'), `${label}: refused on reopen`);
  }
});

test('API store: a consistent item of another owner is refused only by the current-owner check', () => {
  const other = JSON.parse(JSON.stringify(RELEASED).replaceAll(`"${RELEASED['source'].user_id}"`, '"usr_other"'));
  assert.equal(other['source'].user_id, 'usr_other');
  assert.deepEqual(savedPreviewProblems(other, RELEASED['note'].note_id, RELEASED['source'].user_id), ['it belongs to another user']);
  assert.deepEqual(savedPreviewProblems(other, RELEASED['note'].note_id, 'usr_other'), [], 'and accepted for that owner');
});
