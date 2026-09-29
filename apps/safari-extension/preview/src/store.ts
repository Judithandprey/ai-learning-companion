// P0-07 document preview: the replaceable boundary to storage. A save carries what
// document-preview.0.1.0 `DocumentSave` carries (the frozen Frame and its exact DOM
// bytes, the BridgeRequest and ExplanationRequest unchanged, the user's title, request
// text and note) plus the source it belongs to and the local AI state for display.
//
// Stores:
// - `createApiStore()` (api-store.ts), the default: the authenticated local preview API
//   on PostgreSQL. Until the user connects it, nothing can be registered or saved.
// - `createTestDoubleStore()`, only with `?store=test-double`: an in-memory stand-in held
//   by the page, labeled on screen as not persistent, for exercising the UI.

import type { BridgeRequest, ExplanationCard, ExplanationRequest, Frame, Identifier, NoteRevision, Observation, SourceRef, UtcTimestamp } from '../../src/contracts.ts';
import { canonicalJson, sha256Hex, type Clock, type Identity, type Ids } from '../../src/frame.ts';
import { sha256OfBytes, type LocalDocument } from './document.ts';
import { LIMITS } from './wire.ts';

/** One saved selection. `item_id` is the note id: chosen once and reused by every retry. */
export type PreviewSave = {
  readonly item_id: Identifier;
  readonly source: SourceRef;
  readonly frame: Frame;
  /** Exact DOM-snapshot bytes whose SHA-256 is `frame.content_hash` (context is truncated; no pixels). */
  readonly frame_artifact: string;
  readonly bridge_request: BridgeRequest;
  readonly request: ExplanationRequest;
  /** AI state shown locally (provider unavailable). Not user content, and not sent. */
  readonly card: ExplanationCard;
  readonly title: string;
  /** The user's own request text and note, exactly as typed. */
  readonly request_text: string;
  readonly user_note: string;
};

export type SavedSummary = {
  readonly item_id: Identifier;
  /** Null while the save's outcome is not confirmed (`pending`). */
  readonly saved_at: UtcTimestamp | null;
  readonly document_name: string;
  readonly title: string;
  /** A save was sent but its commit is not confirmed yet; the store checks again on each list. */
  readonly pending: boolean;
};

export type SavedItem = {
  readonly item: PreviewSave;
  readonly committed_at: UtcTimestamp;
  /** The complete original the item's source refers to. */
  readonly document: LocalDocument;
  /** Records the server created for the user's text (API store only). */
  readonly observation: Observation | null;
  readonly note: NoteRevision | null;
  /** What the client checked on the returned bytes. */
  readonly verified: { readonly source: boolean; readonly frame: boolean };
};

export type StoreErrorKind =
  /** No storage is connected: nothing was sent, nothing saved. */
  | 'not_connected'
  /** The token was refused (expired, or the API restarted with a new one): nothing was applied. Reconnect and retry. */
  | 'unauthorized'
  /** The store refused the request: nothing was saved. */
  | 'rejected'
  /** The request may or may not have been applied (e.g. no answer); retrying the same item is safe. */
  | 'unknown';

export class StoreError extends Error {
  readonly kind: StoreErrorKind;
  /** The API's error code when it gave one (e.g. `not_found`). */
  readonly code: string | null;
  constructor(kind: StoreErrorKind, message: string, code: string | null = null) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

export type PreviewStore = {
  readonly kind: 'api' | 'test_double';
  /** Shown on screen so nobody mistakes the storage state. */
  readonly description: string;
  /** Who the records belong to; never supplied by page content. */
  readonly identity: Identity;
  /**
   * Registers the complete original as a source version in `sourceTimezone` (every later frame of
   * this source must use the same zone). A retry for the same document reuses its request.
   */
  importDocument(document: LocalDocument, sourceTimezone: string): Promise<SourceRef>;
  /** Resolves only once the store confirmed the commit; `confirmed_at` is when that confirmation arrived. */
  save(item: PreviewSave): Promise<{ readonly confirmed_at: UtcTimestamp; readonly duplicate: boolean }>;
  list(): Promise<ReadonlyArray<SavedSummary>>;
  get(itemId: Identifier): Promise<SavedItem>;
};

/** Length in Unicode code points, as the contract's JSON Schema counts it. */
export const codePoints = (s: string): number => [...s].length;

/** Title suggested from the selection; the user may edit it. */
export const suggestTitle = (selectedText: string): string => {
  const t = [...selectedText.replace(/\s+/g, ' ').trim()];
  return t.length === 0 ? 'Selected region' : t.length > 80 ? `${t.slice(0, 80).join('')}…` : t.join('');
};

export function buildSave(args: {
  readonly itemId: Identifier;
  readonly source: SourceRef;
  readonly frame: Frame;
  readonly frameArtifact: string;
  readonly bridgeRequest: BridgeRequest;
  readonly request: ExplanationRequest;
  readonly card: ExplanationCard;
  readonly title: string;
  readonly requestText: string;
  readonly userNote: string;
}): PreviewSave {
  return Object.freeze({
    item_id: args.itemId,
    source: args.source,
    frame: args.frame,
    frame_artifact: args.frameArtifact,
    bridge_request: args.bridgeRequest,
    request: args.request,
    card: args.card,
    title: args.title,
    request_text: args.requestText, // exactly as typed, never trimmed or rewritten
    user_note: args.userNote,
  });
}

/** The contract's limits; a save outside them is not sent (and nothing is truncated). */
export function limitProblems(item: Pick<PreviewSave, 'title' | 'request_text' | 'user_note' | 'frame_artifact' | 'bridge_request'>): string[] {
  const p: string[] = [];
  const title = codePoints(item.title);
  if (title < LIMITS.titleMin || title > LIMITS.titleMax || item.title.trim().length === 0) p.push(`the title needs 1–${LIMITS.titleMax} characters`);
  if (codePoints(item.request_text) > LIMITS.textMax) p.push(`the request is longer than ${LIMITS.textMax} characters`);
  if (codePoints(item.user_note) > LIMITS.textMax) p.push(`the note is longer than ${LIMITS.textMax} characters`);
  if (codePoints(item.bridge_request.selection.selected_text) > LIMITS.textMax) p.push(`the selection is longer than ${LIMITS.textMax} characters`);
  if (new TextEncoder().encode(item.frame_artifact).byteLength > LIMITS.domBytes) p.push('the selection-time context is larger than 1 MiB');
  if ([item.title, item.request_text, item.user_note].some((s) => s.includes('\u0000'))) p.push('a NUL character is not accepted');
  return p;
}

/** Consistency checks a real store also has to make; returns the problems found. */
export async function saveProblems(item: PreviewSave): Promise<string[]> {
  const p = limitProblems(item);
  const { source, frame, bridge_request: bridge, request, card } = item;
  const selection = bridge.selection;
  const same = (x: { source_id: string; source_version: number }): boolean => x.source_id === source.source_id && x.source_version === source.source_version;
  if (!same(frame) || !same(selection)) p.push('records name a different source or version');
  if (frame.user_id !== source.user_id || selection.user_id !== source.user_id || request.user_id !== source.user_id) p.push('records belong to a different user');
  if (selection.frame_id !== frame.frame_id) p.push('the selection is not bound to the saved frame');
  if (request.selection_id !== selection.id || card.selection_id !== selection.id || card.request_id !== request.request_id) p.push('request or card does not belong to the selection');
  if ((await sha256Hex(item.frame_artifact)) !== frame.content_hash) p.push('frame artifact does not match its content hash');
  return p;
}

type FailMode = 'reject' | 'lost_response';

export type TestDoubleStore = PreviewStore & {
  /** Test control: the next call of `op` fails; `lost_response` applies the call first, then loses the answer. */
  failNext(op: 'importDocument' | 'save' | 'get', mode: FailMode): void;
  /** Items held, for checks only. */
  readonly itemCount: () => number;
};

/** In-memory stand-in for UI tests. Not persistent; see the file header. */
export function createTestDoubleStore(ids: Ids, clock: Clock): TestDoubleStore {
  const identity: Identity = Object.freeze({ user_id: 'test-double-user', session_id: 'test-double-session', device_id: 'test-double-device', origin: 'synthetic_probe' });
  const sources = new Map<string, { ref: SourceRef; document: LocalDocument }>();
  const items = new Map<string, { item: PreviewSave; committed_at: UtcTimestamp; key: string }>();
  const failures = new Map<string, FailMode>();
  const guard = async <T>(op: string, apply: () => Promise<T>): Promise<T> => {
    const mode = failures.get(op);
    failures.delete(op);
    if (mode === 'reject') throw new StoreError('rejected', `The test double refused ${op} (injected failure).`);
    const result = await apply();
    if (mode === 'lost_response') throw new StoreError('unknown', `The answer to ${op} was lost (injected); it may have been applied.`);
    return result;
  };
  const refKey = (r: SourceRef): string => `${r.user_id}/${r.source_id}@${r.source_version}`;
  return {
    kind: 'test_double',
    description: "Storage: TEST DOUBLE held in this page's memory only. It is not persistent storage; closing or reloading the page loses it.",
    identity,
    failNext: (op, mode) => failures.set(op, mode),
    itemCount: () => items.size,
    importDocument: (document) =>
      guard('importDocument', async () => {
        for (const s of sources.values()) if (s.document === document) return s.ref;
        const ref: SourceRef = Object.freeze({ user_id: identity.user_id, source_id: ids.next('src'), source_version: 1 });
        sources.set(refKey(ref), { ref, document });
        return ref;
      }),
    save: (item) =>
      guard('save', async () => {
        if (!sources.has(refKey(item.source))) throw new StoreError('rejected', 'The item names a source that is not registered.');
        const problems = await saveProblems(item);
        if (problems.length > 0) throw new StoreError('rejected', `The item is inconsistent: ${problems.join('; ')}.`);
        const key = canonicalJson(item);
        const existing = items.get(item.item_id);
        if (existing) {
          if (existing.key !== key) throw new StoreError('rejected', 'This item id was already saved with different content.');
          return { confirmed_at: existing.committed_at, duplicate: true };
        }
        const committed_at = clock();
        items.set(item.item_id, { item, committed_at, key });
        return { confirmed_at: committed_at, duplicate: false };
      }),
    list: async () =>
      [...items.values()].map(({ item, committed_at }) => ({
        item_id: item.item_id,
        saved_at: committed_at,
        document_name: sources.get(refKey(item.source))?.document.name ?? '(unknown document)',
        title: item.title,
        pending: false,
      })),
    get: (itemId) =>
      guard('get', async () => {
        const found = items.get(itemId);
        const source = found ? sources.get(refKey(found.item.source)) : undefined;
        if (!found || !source) throw new StoreError('rejected', 'No saved item with this id.');
        const { item, committed_at } = found;
        const verified = {
          source: (await sha256OfBytes(new TextEncoder().encode(source.document.text))) === source.document.sha256,
          frame: (await sha256Hex(item.frame_artifact)) === item.frame.content_hash,
        };
        return { item, committed_at, document: source.document, observation: null, note: null, verified };
      }),
  };
}
