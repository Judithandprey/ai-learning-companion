// P0-07 document preview: the real store, backed by the authenticated local preview API
// (document-preview.0.1.0; services/api/PREVIEW.md, `python -m services.api.preview_local`,
// PostgreSQL). The token is entered by the user in the owned page and kept only in this
// closure: never in storage, a URL, a document or a course content script. The identity
// comes from GET /preview/v1/session.
//
// There is no list endpoint, so the page keeps a small local index of note ids (with the
// title and file name as list labels) to reopen them after a refresh or an API restart; the
// originals stay on the server. A note id enters the index as `pending` before its save is
// sent, so a save whose answer was lost is never unreachable: each list asks the API about
// pending ids. Only a valid saved item for that id and user confirms one. A pending id stays
// pending on `not_found` too, since an earlier request may still be committing; only a
// confirmed entry the API later reports gone, or a refused first write, leaves the list.

import type { Identifier, SourceRef, UtcTimestamp } from '../../src/contracts.ts';
import { resolveProbeCard } from '../../src/explain.ts';
import { canonicalJson, sha256Hex, type Clock, type DomSnapshotPayload, type Identity, type Ids } from '../../src/frame.ts';
import { base64ToBytes, bytesToBase64, readUtf8Document, type LocalDocument } from './document.ts';
import { codePoints, StoreError, type PreviewSave, type PreviewStore, type SavedItem, type SavedSummary } from './store.ts';
import { LIMITS, PREVIEW_CONTRACT_VERSION, type DocumentImport, type DocumentSave, type ImportReceipt, type SavedPreview, type SaveReceipt, type SessionInfo } from './wire.ts';

export const DEFAULT_API_ORIGIN = 'http://127.0.0.1:8174';
const INDEX_KEY = 'lc-document-preview-index/v1';

export type ApiStatus = 'disconnected' | 'connecting' | 'connected' | 'expired';

export type ApiStore = PreviewStore & {
  readonly kind: 'api';
  readonly origin: string;
  readonly status: ApiStatus;
  readonly session: SessionInfo | null;
  /** Connects with a token the user entered; resolves to the session or throws StoreError. */
  connect(token: string): Promise<SessionInfo>;
};

type IndexEntry = { user_id: string; note_id: string; title: string; filename: string; state: 'pending' | 'saved'; saved_at: string | null };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NOT_CONNECTED = 'The local preview API is not connected: enter its token and connect. Nothing was sent.';

export function createApiStore(options: {
  readonly origin?: string;
  readonly fetch: typeof fetch;
  /** Where the id index lives (the page's localStorage); null keeps it in memory only. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly timeoutMs?: number;
}): ApiStore {
  const origin = options.origin ?? DEFAULT_API_ORIGIN;
  let token: string | null = null;
  let status: ApiStatus = 'disconnected';
  let session: SessionInfo | null = null;
  // Retries reuse the first request for the same document (same key, same body).
  const pendingImports = new WeakMap<LocalDocument, DocumentImport>();
  const filenames = new Map<string, string>();
  // Saves being sent by this page: a list does not ask about them meanwhile.
  const inFlight = new Set<string>();
  let memoryIndex: IndexEntry[] = [];

  const readIndex = (): IndexEntry[] => {
    let parsed: unknown = memoryIndex;
    if (options.storage) {
      try {
        parsed = JSON.parse(options.storage.getItem(INDEX_KEY) ?? '[]');
      } catch {
        parsed = [];
      }
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is Record<string, unknown> => isObject(e) && typeof e['note_id'] === 'string' && typeof e['user_id'] === 'string')
      .map((e) => ({
        user_id: e['user_id'] as string,
        note_id: e['note_id'] as string,
        title: typeof e['title'] === 'string' ? e['title'] : '',
        filename: typeof e['filename'] === 'string' ? e['filename'] : '',
        state: e['state'] === 'pending' ? 'pending' : 'saved',
        saved_at: typeof e['saved_at'] === 'string' ? e['saved_at'] : null,
      }));
  };
  const writeIndex = (entries: IndexEntry[]): void => {
    memoryIndex = entries;
    options.storage?.setItem(INDEX_KEY, JSON.stringify(entries));
  };
  const findEntry = (user: string, noteId: string): IndexEntry | undefined => readIndex().find((e) => e.user_id === user && e.note_id === noteId);
  const putEntry = (entry: IndexEntry): void => {
    const others = readIndex().filter((e) => !(e.user_id === entry.user_id && e.note_id === entry.note_id));
    const at = readIndex().findIndex((e) => e.user_id === entry.user_id && e.note_id === entry.note_id);
    writeIndex(at < 0 ? [...others, entry] : [...others.slice(0, at), entry, ...others.slice(at)]); // keeps the list order
  };
  const dropEntry = (user: string, noteId: string): void => writeIndex(readIndex().filter((e) => !(e.user_id === user && e.note_id === noteId)));

  const call = async (method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<unknown> => {
    if (!token) throw new StoreError('not_connected', NOT_CONNECTED);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    // One deadline for the whole exchange, reading the body included: headers can arrive
    // while the body stalls, and the page must still settle (a write as unknown).
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new Error('deadline'));
      }, options.timeoutMs ?? 20000);
    });
    deadline.catch(() => undefined);
    try {
      let response: Response;
      try {
        response = await Promise.race([
          options.fetch(`${origin}${path}`, { method, headers, body: body === undefined ? null : JSON.stringify(body), signal: abort.signal, credentials: 'omit', cache: 'no-store' }),
          deadline,
        ]);
      } catch {
        throw new StoreError(
          method === 'POST' ? 'unknown' : 'rejected',
          method === 'POST'
            ? 'No answer from the local preview API (stopped or unreachable); the request may or may not have been applied.'
            : 'The local preview API did not answer (stopped or unreachable).',
        );
      }
      let payload: unknown = null;
      let complete = true;
      try {
        payload = await Promise.race([response.json(), deadline]);
      } catch {
        complete = false; // stalled, cut off or not JSON
      }
      return answer(method, response.status, payload, complete);
    } finally {
      clearTimeout(timer);
    }
  };

  const answer = (method: 'GET' | 'POST', httpStatus: number, payload: unknown, complete: boolean): unknown => {
    if (httpStatus === 200) {
      if (complete) return payload;
      throw new StoreError(
        method === 'POST' ? 'unknown' : 'rejected',
        method === 'POST'
          ? 'The preview API answered, but its answer could not be read completely; the request may or may not have been applied.'
          : 'The preview API answer could not be read completely.',
      );
    }
    if (httpStatus === 401) {
      token = null;
      status = 'expired';
      throw new StoreError('unauthorized', 'The preview API refused the token (expired, or the API restarted with a new one). Reconnect with a current token; this request was not applied and unsaved work is kept.', 'unauthorized');
    }
    const code = isObject(payload) && typeof payload['code'] === 'string' ? payload['code'] : null;
    const shown = code ?? `HTTP ${httpStatus}`;
    // A server-side failure of a write may have raced its commit; only a refusal is known to have applied nothing.
    if (method === 'POST' && httpStatus >= 500) {
      throw new StoreError('unknown', `The preview API failed while handling the request (${shown}); it may or may not have been applied.`, code);
    }
    throw new StoreError('rejected', `The preview API refused the request (${shown}); nothing was applied.`, code);
  };

  const needSession = (): SessionInfo => {
    if (!session || !token) throw new StoreError('not_connected', NOT_CONNECTED);
    return session;
  };

  /** Asks the API about a pending note; only a valid saved item for it confirms it. */
  const resolvePending = async (entry: IndexEntry): Promise<void> => {
    try {
      const found = await call('GET', `/preview/v1/saves/${encodeURIComponent(entry.note_id)}`);
      if (savedPreviewProblems(found, entry.note_id, entry.user_id).length === 0) {
        putEntry({ ...entry, state: 'saved', saved_at: (found as SavedPreview).note.created_at });
      }
    } catch {
      // Not found, refused or no answer: still unknown (an earlier request may still be
      // committing), asked again on the next list. Never dropped here.
    }
  };

  const store: ApiStore = {
    kind: 'api',
    origin,
    get status() {
      return status;
    },
    get session() {
      return session;
    },
    get description() {
      return status === 'connected' && session
        ? `Storage: local preview API ${origin} (PostgreSQL), connected as user ${session.user_id} · device ${session.device_id} · session ${session.session_id}. No AI provider is connected.`
        : status === 'expired'
          ? `Storage: local preview API ${origin}: token refused or expired. Reconnect to save or reopen; unsaved work on this page is kept.`
          : `Storage: local preview API ${origin} is not connected. Enter its token to register, save and reopen documents.`;
    },
    get identity(): Identity {
      return session
        ? { user_id: session.user_id, device_id: session.device_id, session_id: session.session_id, origin: 'local_preview_api' }
        : { user_id: 'not-connected', device_id: 'not-connected', session_id: 'not-connected', origin: 'local_preview_api' };
    },

    async connect(entered: string): Promise<SessionInfo> {
      const previous = session;
      token = entered;
      status = 'connecting';
      try {
        const info = await call('GET', '/preview/v1/session');
        if (!isObject(info) || info['contract_version'] !== PREVIEW_CONTRACT_VERSION || !['user_id', 'device_id', 'session_id'].every((k) => typeof info[k] === 'string' && IDENTIFIER.test(info[k] as string))) {
          throw new StoreError('rejected', 'The preview API answered with an unexpected session shape.');
        }
        const next = info as SessionInfo;
        if (previous && (previous.user_id !== next.user_id || previous.device_id !== next.device_id || previous.session_id !== next.session_id)) {
          throw new StoreError('rejected', 'This token belongs to a different local identity than the one this page was using; items made here could not be saved under it. Nothing was changed.');
        }
        session = next;
        status = 'connected';
        return next;
      } catch (error) {
        token = null;
        status = previous ? 'expired' : 'disconnected';
        if (error instanceof StoreError && error.kind === 'unauthorized') {
          throw new StoreError('unauthorized', 'The preview API refused this token (wrong, expired, or from an earlier start of the API). Nothing was sent or changed.', 'unauthorized');
        }
        throw error;
      }
    },

    async importDocument(document, sourceTimezone) {
      const s = needSession();
      if (codePoints(document.name) < 1 || codePoints(document.name) > LIMITS.filenameMax) {
        throw new StoreError('rejected', `The file name must have 1–${LIMITS.filenameMax} characters for the preview API; rename the file. Nothing was sent.`);
      }
      let body = pendingImports.get(document);
      if (!body || body.device_id !== s.device_id || body.session_id !== s.session_id) {
        body = Object.freeze({
          contract_version: PREVIEW_CONTRACT_VERSION,
          source_id: options.ids.next('src'),
          source_version: 1,
          filename: document.name,
          content_base64: bytesToBase64(new TextEncoder().encode(document.text)),
          sha256: document.sha256,
          device_id: s.device_id,
          session_id: s.session_id,
          source_timezone: sourceTimezone,
          project_id: null,
        });
        pendingImports.set(document, body);
      }
      const receipt = await call('POST', '/preview/v1/documents', body, body.source_id);
      const r = receipt as ImportReceipt;
      if (
        !isObject(receipt) || r.contract_version !== PREVIEW_CONTRACT_VERSION || r.persistence !== 'server_committed' || !isObject(r.source) ||
        r.source.source_id !== body.source_id || r.source.source_version !== 1 || r.source.content_hash !== document.sha256 || r.source.user_id !== s.user_id ||
        r.source.source_timezone !== body.source_timezone
      ) {
        throw new StoreError('unknown', 'The preview API answered the import with an unexpected receipt; retrying is safe.');
      }
      filenames.set(`${r.source.source_id}@1`, r.filename);
      const ref: SourceRef = { user_id: r.source.user_id, source_id: r.source.source_id, source_version: r.source.source_version };
      return ref;
    },

    async save(item) {
      const s = needSession();
      const body: DocumentSave = {
        contract_version: PREVIEW_CONTRACT_VERSION,
        note_id: item.item_id,
        frame: item.frame,
        frame_bytes_base64: bytesToBase64(new TextEncoder().encode(item.frame_artifact)),
        bridge_request: item.bridge_request,
        request: item.request,
        title: item.title,
        request_text: item.request_text,
        user_note: item.user_note,
      };
      // Listed before it is sent, so an answer lost after a commit cannot orphan the note.
      const known = findEntry(s.user_id, item.item_id);
      const label = { user_id: s.user_id, note_id: item.item_id, title: item.title, filename: filenames.get(`${item.source.source_id}@${item.source.source_version}`) ?? '' };
      if (!known) putEntry({ ...label, state: 'pending', saved_at: null });
      inFlight.add(item.item_id);
      let receipt: unknown;
      try {
        receipt = await call('POST', '/preview/v1/saves', body, item.item_id);
      } catch (error) {
        // Known not applied and never tried before: nothing to find later.
        if (!known && error instanceof StoreError && error.kind !== 'unknown') dropEntry(s.user_id, item.item_id);
        throw error;
      } finally {
        inFlight.delete(item.item_id);
      }
      const r = receipt as SaveReceipt;
      if (!isObject(receipt) || r.contract_version !== PREVIEW_CONTRACT_VERSION || r.persistence !== 'server_committed' || r.note_id !== item.item_id || r.revision !== 1 || r.ai_status !== 'provider_unavailable') {
        throw new StoreError('unknown', 'The preview API answered the save with an unexpected receipt; retrying the same item is safe.');
      }
      const confirmed_at: UtcTimestamp = options.clock(); // the receipt carries no server time
      putEntry({ ...label, state: 'saved', saved_at: known?.saved_at ?? confirmed_at });
      return { confirmed_at, duplicate: r.replayed };
    },

    async list(): Promise<ReadonlyArray<SavedSummary>> {
      if (!session || !token) return [];
      const user = session.user_id;
      for (const entry of readIndex()) {
        if (entry.user_id === user && entry.state === 'pending' && !inFlight.has(entry.note_id)) await resolvePending(entry);
      }
      return readIndex()
        .filter((e) => e.user_id === user)
        .map((e) => ({ item_id: e.note_id, saved_at: e.saved_at, document_name: e.filename, title: e.title, pending: e.state === 'pending' }));
    },

    async get(itemId: Identifier): Promise<SavedItem> {
      const s = needSession();
      const entry = findEntry(s.user_id, itemId);
      let payload: unknown;
      try {
        payload = await call('GET', `/preview/v1/saves/${encodeURIComponent(itemId)}`);
      } catch (error) {
        if (error instanceof StoreError && error.code === 'not_found') {
          if (entry?.state === 'pending') {
            throw new StoreError('rejected', 'The preview API has not found this note yet. Its save outcome is still unknown, so it stays listed as not confirmed.', 'not_found');
          }
          if (entry) {
            dropEntry(s.user_id, itemId); // confirmed before, now gone (deleted)
            throw new StoreError('rejected', 'The preview API no longer has this note; it was removed from this list.', 'not_found');
          }
        }
        throw error;
      }
      const problems = savedPreviewProblems(payload, itemId, s.user_id);
      if (problems.length > 0) {
        throw new StoreError('rejected', `The preview API returned a saved item this page cannot accept (${problems.join('; ')}). Nothing is shown from it.`);
      }
      const p = payload as SavedPreview;
      let sourceBytes: Uint8Array<ArrayBuffer>;
      let frameText: string;
      try {
        sourceBytes = base64ToBytes(p.content_base64);
        frameText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(base64ToBytes(p.frame_bytes_base64));
      } catch {
        throw new StoreError('rejected', 'The saved item came back with bytes that are not canonical base64 UTF-8.');
      }
      filenames.set(`${p.source.source_id}@${p.source.source_version}`, p.filename);
      const opened = await readUtf8Document(sourceBytes, p.filename, null);
      if (!opened.ok) throw new StoreError('rejected', `The saved original could not be read back: ${opened.reason}`);
      const selection = p.bridge_request.selection;
      const item: PreviewSave = {
        item_id: itemId,
        source: { user_id: p.source.user_id, source_id: p.source.source_id, source_version: p.source.source_version },
        frame: p.frame,
        frame_artifact: frameText,
        bridge_request: p.bridge_request,
        request: p.request,
        card: resolveProbeCard(p.request, selection, []), // provider unavailable: no explanation, no fixture
        title: p.note.title,
        request_text: p.request_text,
        user_note: p.user_note,
      };
      if (entry?.state === 'pending') putEntry({ ...entry, state: 'saved', saved_at: p.note.created_at }); // now confirmed
      return {
        item,
        committed_at: p.note.created_at,
        document: opened.document,
        observation: p.observation,
        note: p.note,
        verified: { source: opened.document.sha256 === p.source.content_hash, frame: (await sha256Hex(frameText)) === p.frame.content_hash },
      };
    },
  };
  return store;
}

/**
 * The relations a returned SavedPreview must satisfy before this page treats it as the user's
 * saved note: the exact requested note, owned by the current user, committed, with no AI
 * output, and one source / frame / selection / request / observation / user-original note
 * bound together with the exact user text. This mirrors the binding rules of the released
 * validator (packages/contracts/document_preview/validation.py `_frame_context`,
 * `_saved_context`, and v1 `validate_selection_frame`); it is not a schema validator. The two
 * content hashes are reported separately as `verified`. Returns the problems; empty = accepted.
 */
export function savedPreviewProblems(payload: unknown, noteId: string, userId: string): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  const differ = (a: Record<string, unknown>, b: Record<string, unknown>, keys: readonly string[]): string[] => keys.filter((k) => a[k] !== b[k]);
  try {
    if (!isObject(payload)) return ['the answer is not a saved item'];
    const p = payload as SavedPreview;
    for (const name of ['source', 'frame', 'bridge_request', 'request', 'observation', 'note'] as const) {
      if (!isObject(p[name])) return [`the answer has no ${name}`];
    }
    if (!isObject(p.bridge_request.selection)) return ['the answer has no selection'];
    const { source, frame, request, observation: event, note } = p;
    const selection = p.bridge_request.selection;
    const rec = (v: object): Record<string, unknown> => v as Record<string, unknown>;

    // Presence first: the equality checks below would otherwise match a field missing on both sides.
    const id = (v: unknown): boolean => typeof v === 'string' && IDENTIFIER.test(v);
    const text = (v: unknown): boolean => typeof v === 'string';
    const hash = (v: unknown): boolean => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
    const project = (v: unknown): boolean => v === null || id(v);
    need(
      id(frame.user_id) && id(frame.source_id) && Number.isSafeInteger(frame.source_version) && frame.source_version >= 1 && id(frame.frame_id) &&
        id(frame.device_id) && id(frame.session_id) && text(frame.source_timezone) && frame.source_timezone !== '' && text(frame.captured_at) && hash(frame.content_hash),
      'the frame is incomplete',
    );
    need(id(selection.id) && text(selection.selected_text) && text(selection.created_at), 'the selection is incomplete');
    need(id(event.event_id) && text(p.request_text) && text(p.user_note) && text(note.title) && text(p.filename), 'the user text or its records are incomplete');
    need(project(source.project_id) && hash(source.content_hash) && text(source.text) && text(note.created_at), 'the source or note is incomplete');

    need(p.contract_version === PREVIEW_CONTRACT_VERSION && p.persistence === 'server_committed' && p.ai_status === 'provider_unavailable', 'not a committed document-preview.0.1.0 item without AI output');
    need(note.note_id === noteId, 'it is a different note');
    need(source.user_id === userId, 'it belongs to another user');
    need(source.type === 'document' && isObject(source.provenance) && source.provenance.origin === 'user_authorized' && source.provenance.consent_scope === 'learning', 'the source is not a user-authorized document');

    const sourceFrame = differ(rec(source), rec(frame), ['user_id', 'source_id', 'source_version', 'source_timezone']);
    need(sourceFrame.length === 0, `source and frame disagree (${sourceFrame.join(', ')})`);
    const selectionFrame = differ(rec(selection), rec(frame), ['user_id', 'source_id', 'source_version', 'frame_id', 'session_id', 'device_id', 'media_position']);
    need(selectionFrame.length === 0, `selection and frame disagree (${selectionFrame.join(', ')})`);
    need(request.user_id === frame.user_id && request.selection_id === selection.id, 'the request is not bound to the selection');
    need(request.project_id === source.project_id, 'the request and source projects differ');
    need(frame.representation === 'dom_snapshot' && frame.media_position === null, 'the frame is not a document DOM snapshot');

    try {
      const dom = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(base64ToBytes(p.frame_bytes_base64))) as Partial<DomSnapshotPayload>;
      need(dom.captured_at === frame.captured_at && dom.selection?.text === selection.selected_text, 'the DOM context and frame/selection disagree');
    } catch {
      problems.push('the DOM context is not canonical base64 UTF-8 JSON');
    }
    try {
      need(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(base64ToBytes(p.content_base64)) === source.text, 'the source bytes and source text disagree');
    } catch {
      problems.push('the source bytes are not canonical base64 UTF-8');
    }

    const eventFrame = differ(rec(event), rec(frame), ['user_id', 'source_id', 'source_version', 'frame_id', 'device_id', 'session_id', 'source_timezone', 'media_position']);
    need(eventFrame.length === 0, `the observation and frame disagree (${eventFrame.join(', ')})`);
    need(event.captured_at === selection.created_at, 'the observation time is not the selection time');
    need(event.actor === 'user' && event.correction_of === null && event.confidence === 1 && Array.isArray(event.gap_flags) && event.gap_flags.length === 0, 'the observation is not the user\'s own confirmed request');
    need(event.text === p.request_text, 'the observation text is not the request text');

    const segment = { source_id: frame.source_id, source_version: frame.source_version, frame_id: frame.frame_id, media_position: frame.media_position, source_event_ids: [event.event_id] };
    need(note.user_id === source.user_id && note.project_id === source.project_id, 'the note belongs to another user or project');
    need(note.authorship === 'user' && note.kind === 'ai' && note.ink_blob_id === null && note.revision === 1 && note.base_revision === 0, 'the note is not the original user note revision 1');
    need(canonicalJson(note.concept_ids) === '[]' && canonicalJson(note.source_event_ids) === canonicalJson([event.event_id]) && canonicalJson(note.context_segments) === canonicalJson([segment]), 'the note is not bound to this observation and frame');
    const block = Array.isArray(note.blocks) && note.blocks.length === 1 ? note.blocks[0] : undefined;
    need(block !== undefined && block.layer === 'user_original' && block.format === 'text' && block.content === p.user_note, 'the note text is not the single user-original block');
  } catch {
    problems.push('the answer is malformed');
  }
  return problems;
}
