// P0-07 document preview: the replaceable boundary to storage. Records use the
// existing v0.1.0 shapes (SourceRef, Frame, Selection, ExplanationRequest,
// ExplanationCard, Observation); no new shared fields are introduced here.
//
// Two stores exist today:
// - `unconnectedStore`, the default: nothing can be registered or saved, and the UI
//   says so. It never pretends to persist.
// - `createTestDoubleStore()`, only when the page is opened with `?store=test-double`:
//   an in-memory stand-in held by this page. It is not persistent storage and is
//   labeled as such on screen. It exists to exercise the save/retry/reopen UI until
//   the backend's committed preview ingest/save/readback contract is supplied; the
//   real transport then replaces it behind the same interface. Credentials for that
//   transport stay with the local owned page/launcher, never in a course content script.

import type { ExplanationCard, ExplanationRequest, Frame, Identifier, Observation, Selection, SourceRef, UtcTimestamp } from '../../src/contracts.ts';
import { canonicalJson, sha256Hex, type Clock, type Identity, type Ids } from '../../src/frame.ts';
import type { LocalDocument } from './document.ts';

/** One saved selection: the context at selection time, the user's own words, and the AI state kept separately. */
export type PreviewSave = {
  /** Chosen once per save attempt and reused for every retry, so a retry cannot duplicate the item. */
  readonly item_id: Identifier;
  readonly source: SourceRef;
  readonly frame: Frame;
  /** Exact DOM-snapshot bytes whose SHA-256 is `frame.content_hash` (context is truncated; no pixels). */
  readonly frame_artifact: string;
  readonly selection: Selection;
  readonly request: ExplanationRequest;
  /** AI state at save time (here: provider unavailable), separate from user-authored content. */
  readonly card: ExplanationCard;
  /** What the user typed, attributed to the user, exactly as typed; null when nothing was typed. */
  readonly user_note: Observation | null;
};

export type SavedSummary = { readonly item_id: Identifier; readonly committed_at: UtcTimestamp; readonly document_name: string; readonly selected_text: string };

export type SavedItem = {
  readonly item: PreviewSave;
  readonly committed_at: UtcTimestamp;
  /** The complete original the item's source refers to, as stored at import. */
  readonly document: LocalDocument;
};

export type StoreErrorKind =
  /** No storage is connected: nothing was sent, nothing saved. */
  | 'not_connected'
  /** The store refused the request: nothing was saved. */
  | 'rejected'
  /** The request may or may not have been applied (e.g. the answer was lost); retrying the same item is safe. */
  | 'unknown';

export class StoreError extends Error {
  readonly kind: StoreErrorKind;
  constructor(kind: StoreErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type PreviewStore = {
  readonly kind: 'unconnected' | 'test_double';
  /** Shown on screen so nobody mistakes the storage state. */
  readonly description: string;
  /** Who the records belong to; never supplied by page content. */
  readonly identity: Identity;
  /** Registers the complete original as a source version. */
  importDocument(document: LocalDocument): Promise<SourceRef>;
  save(item: PreviewSave): Promise<{ readonly committed_at: UtcTimestamp; readonly duplicate: boolean }>;
  list(): Promise<ReadonlyArray<SavedSummary>>;
  get(itemId: Identifier): Promise<SavedItem>;
};

const notConnected = (): never => {
  throw new StoreError('not_connected', 'Storage is not connected: nothing was registered or saved.');
};

export const unconnectedStore: PreviewStore = Object.freeze({
  kind: 'unconnected' as const,
  description: 'Storage: not connected. Documents are shown but cannot be registered, saved or reopened.',
  identity: Object.freeze({ user_id: 'unconnected-preview-user', session_id: 'unconnected-preview-session', device_id: 'unconnected-preview-device', origin: 'synthetic_probe' as const }),
  importDocument: async () => notConnected(),
  save: async () => notConnected(),
  list: async () => [],
  get: async () => notConnected(),
});

/** Builds the save record from an explanation outcome and what the user typed. */
export function buildSave(args: {
  readonly itemId: Identifier;
  readonly source: SourceRef;
  readonly frame: Frame;
  readonly frameArtifact: string;
  readonly selection: Selection;
  readonly request: ExplanationRequest;
  readonly card: ExplanationCard;
  readonly note: string;
  readonly identity: Identity;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly deviceSequence: number;
  readonly timezone: string;
}): PreviewSave {
  const { frame, selection, note } = args;
  const userNote: Observation | null =
    note.trim().length === 0
      ? null
      : Object.freeze({
          user_id: args.identity.user_id,
          source_id: selection.source_id,
          source_version: selection.source_version,
          event_id: args.ids.next('evt'),
          device_id: args.identity.device_id,
          device_sequence: args.deviceSequence,
          session_id: args.identity.session_id,
          captured_at: args.clock(),
          received_at: null,
          source_timezone: args.timezone,
          actor: 'user',
          text: note, // exactly as typed, not trimmed or rewritten
          frame_id: frame.frame_id,
          media_position: frame.media_position,
          confidence: 1,
          gap_flags: [],
          correction_of: null,
        });
  return Object.freeze({
    item_id: args.itemId,
    source: args.source,
    frame,
    frame_artifact: args.frameArtifact,
    selection,
    request: args.request,
    card: args.card,
    user_note: userNote,
  });
}

/** Consistency checks a real store also has to make; returns the problems found. */
export async function saveProblems(item: PreviewSave): Promise<string[]> {
  const p: string[] = [];
  const { source, frame, selection, request, card, user_note: note } = item;
  const same = (x: { source_id: string; source_version: number }): boolean => x.source_id === source.source_id && x.source_version === source.source_version;
  if (!same(frame) || !same(selection) || (note && !same(note))) p.push('records name a different source or version');
  if (frame.user_id !== source.user_id || selection.user_id !== source.user_id || request.user_id !== source.user_id || (note && note.user_id !== source.user_id)) p.push('records belong to a different user');
  if (selection.frame_id !== frame.frame_id || (note && note.frame_id !== frame.frame_id)) p.push('selection or note is not bound to the saved frame');
  if (request.selection_id !== selection.id || card.selection_id !== selection.id || card.request_id !== request.request_id) p.push('request or card does not belong to the selection');
  if (note && note.actor !== 'user') p.push('the note is not attributed to the user');
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

/** In-memory stand-in for the future backend seam. Not persistent; see the file header. */
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
        // The same bytes under the same name register once.
        for (const s of sources.values()) if (s.document.sha256 === document.sha256 && s.document.name === document.name) return s.ref;
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
          return { committed_at: existing.committed_at, duplicate: true };
        }
        const committed_at = clock();
        items.set(item.item_id, { item, committed_at, key });
        return { committed_at, duplicate: false };
      }),
    list: async () =>
      [...items.values()].map(({ item, committed_at }) => ({
        item_id: item.item_id,
        committed_at,
        document_name: sources.get(refKey(item.source))?.document.name ?? '(unknown document)',
        selected_text: item.selection.selected_text,
      })),
    get: (itemId) =>
      guard('get', async () => {
        const found = items.get(itemId);
        const source = found ? sources.get(refKey(found.item.source)) : undefined;
        if (!found || !source) throw new StoreError('rejected', 'No saved item with this id.');
        return { item: found.item, committed_at: found.committed_at, document: source.document };
      }),
  };
}
