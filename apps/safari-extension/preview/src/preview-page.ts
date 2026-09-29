// P0-07 document preview page (owned page, early desktop fallback). The user opens
// a local UTF-8 document, marks text with the existing explicit ASK interaction,
// sees the request state, adds their own note, saves, closes and reopens the saved
// item from storage. No explanation is generated for real content: the provider is
// not connected, and no fixture text is used. All document text is rendered through
// textContent only, so markup in a document stays inert text.

import { ProbeSession, type AskOutcome } from '../../src/session.ts';
import { installProbe, type ProbeEvent, type ProbeInstall } from '../../src/page.ts';
import { unavailableTransport } from '../../src/bridge.ts';
import { randomIds, systemClock, type DomSnapshotPayload, type SourceBinding } from '../../src/frame.ts';
import type { SourceRef } from '../../src/contracts.ts';
import { quoteOf } from '../../src/explain.ts';
import { readUtf8Document, sha256OfBytes, splitBlocks, type LocalDocument } from './document.ts';
import { buildSave, createTestDoubleStore, StoreError, unconnectedStore, type PreviewSave, type PreviewStore, type SavedItem, type TestDoubleStore } from './store.ts';

type Submitted = Extract<AskOutcome, { status: 'submitted' }>;

type OpenDoc = {
  readonly document: LocalDocument;
  /** Distinguishes each opened view; a mark captured on an earlier view is never bound to this one. */
  readonly key: string;
  source: SourceRef | null;
  sourceState: 'registering' | 'registered' | 'failed';
  sourceMessage: string;
  /** Set when the document was reopened from storage rather than opened from a file. */
  readonly reopened: SavedItem | null;
};

type Attempt = { readonly payload: PreviewSave; status: 'saving' | 'committed' | 'failed' | 'unknown'; message: string };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const button = (text: string, id: string): HTMLButtonElement => {
  const b = el('button', undefined, text);
  b.type = 'button';
  b.id = id;
  return b;
};
const timezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const contextOf = (artifact: string): string => {
  try {
    const parsed = JSON.parse(artifact) as Partial<DomSnapshotPayload>;
    return typeof parsed.context_text === 'string' ? parsed.context_text : '';
  } catch {
    return '';
  }
};

export type PreviewHandle = {
  readonly store: PreviewStore;
  readonly events: ProbeEvent[];
  readonly probe: ProbeInstall;
  readonly session: ProbeSession;
  /** Plain-text view of the page state for checks. */
  readonly state: () => Record<string, unknown>;
  readonly unmount: () => void;
};

export function mount(app: HTMLElement, store: PreviewStore): PreviewHandle {
  let current: OpenDoc | null = null;
  let draft: Submitted | null = null;
  let attempt: Attempt | null = null;
  let unboundReason = '';
  let views = 0;
  let deviceSequence = 0;
  const events: ProbeEvent[] = [];

  // ---- layout -----------------------------------------------------------------
  const docPanel = el('section', 'panel');
  docPanel.setAttribute('aria-label', 'Document');
  const openLabel = el('label', 'open', 'Open a UTF-8 document… ');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.id = 'open-file';
  fileInput.accept = '.txt,.md,.markdown,.csv,.tsv,.json,.tex,.html,.htm,text/*';
  openLabel.append(fileInput);
  const closeBtn = button('Close document', 'close-doc');
  const openStatus = el('p', 'status');
  openStatus.setAttribute('role', 'status');
  const docMeta = el('p', 'meta');
  const sourceStatus = el('p', 'status');
  sourceStatus.setAttribute('role', 'status');
  const retryRegister = button('Retry registering', 'retry-register');
  const reopenedInfo = el('div');
  reopenedInfo.id = 'reopened';
  const documentView = el('article');
  documentView.id = 'document';
  documentView.setAttribute('aria-label', 'Document text');
  docPanel.append(el('div', 'row'), openStatus, docMeta, sourceStatus, reopenedInfo, documentView);
  docPanel.firstElementChild!.append(openLabel, closeBtn, retryRegister);

  const side = el('div', 'side');
  const requestPanel = el('section', 'panel');
  requestPanel.setAttribute('aria-label', 'Selection and request');
  const selQuote = el('p', 'quote');
  const selContext = el('p', 'context');
  const reqState = el('p', 'status');
  const selNotice = el('p', 'status bad');
  const noteLabel = el('label', undefined, 'Your note or question (saved as your own words, exactly as typed)');
  const note = el('textarea');
  note.id = 'note';
  noteLabel.append(note);
  const saveBtn = button('Save', 'save');
  const retryBtn = button('Retry save', 'retry-save');
  const discardBtn = button('Discard unsaved selection', 'discard');
  const saveStatus = el('p', 'status');
  saveStatus.id = 'save-status';
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  const saveRow = el('div', 'row');
  saveRow.append(saveBtn, retryBtn, discardBtn);
  requestPanel.append(el('h2', undefined, 'Selection and request'), selQuote, selContext, reqState, selNotice, noteLabel, saveRow, saveStatus);

  const savedPanel = el('section', 'panel');
  savedPanel.setAttribute('aria-label', 'Saved items');
  const savedStatus = el('p', 'status');
  const savedList = el('ul', 'saved');
  savedPanel.append(el('h2', undefined, 'Saved items'), savedStatus, savedList);
  side.append(requestPanel, savedPanel);
  app.replaceChildren(docPanel, side);

  // ---- probe (explicit NAV / ASK / WRITE and the silent card) ----------------------
  const insideDocument = (snapshot: DomSnapshotPayload): boolean => {
    // Called synchronously with the mark, so the layout is the one the user marked on.
    const r = documentView.getBoundingClientRect();
    const s = snapshot.selection.rect;
    const cx = s.x + s.width / 2 + snapshot.scroll.x;
    const cy = s.y + s.height / 2 + snapshot.scroll.y;
    return cx >= r.left + window.scrollX && cx <= r.right + window.scrollX && cy >= r.top + window.scrollY && cy <= r.bottom + window.scrollY;
  };
  const resolveSource = (snapshot: DomSnapshotPayload): SourceBinding | null => {
    if (!current) unboundReason = 'No document is open, so nothing was submitted or explained.';
    else if (snapshot.document_version !== current.key) unboundReason = 'The document changed while you were marking, so nothing was submitted.';
    else if (!insideDocument(snapshot)) unboundReason = 'The mark is outside the document text, so nothing was submitted.';
    else if (!current.source)
      unboundReason =
        current.sourceState === 'registering'
          ? 'The document is still being registered; mark again in a moment. Nothing was submitted.'
          : `Nothing was submitted or explained: the document is not registered. ${current.sourceMessage}`;
    else return Object.freeze({ source_id: current.source.source_id, source_version: current.source.source_version, source_timezone: timezone() });
    return null;
  };
  const session = new ProbeSession({
    identity: store.identity,
    ids: randomIds,
    clock: systemClock,
    transport: unavailableTransport,
    fixtures: [], // real documents never get fixture text
    resolveSource,
    projectId: null,
    knowledgeProfileVersion: 1,
  });
  const probe = installProbe({
    win: window,
    session,
    documentVersion: () => current?.key ?? null,
    role: 'top',
    peerOrigins: [],
    onEvent: (e) => events.push(e),
    onOutcome: (outcome, isCurrent) => {
      if (!isCurrent || outcome.status !== 'submitted' || !current?.source) return;
      if (outcome.selection.source_id !== current.source.source_id || outcome.selection.source_version !== current.source.source_version) return;
      // Same guard as Close/Open/Reopen: never overwrite typed words or an unconfirmed save,
      // and never bind them to a different selection. The user saves or discards explicitly.
      if (unsaved()) {
        selNotice.textContent =
          attempt && attempt.status !== 'committed'
            ? 'Your new selection was not added: retry or discard the unsaved item first.'
            : 'Your new selection was not added: save or discard your note first (it is kept).';
        probe.closeCard(); // the card would describe the selection that was not added
        return;
      }
      selNotice.textContent = '';
      draft = outcome;
      attempt = null;
      note.value = '';
      render();
    },
    unregisteredMessage: () => unboundReason,
    bridgeNote: 'Saving is separate from this card: see the save status in the side panel.',
  });

  // ---- rendering ---------------------------------------------------------------------
  const unsaved = (): boolean => (attempt !== null && attempt.status !== 'committed') || (draft !== null && note.value.trim().length > 0);
  const render = (): void => {
    const open = current !== null;
    closeBtn.disabled = !open || unsaved();
    closeBtn.title = unsaved() ? 'Save, retry or discard the unsaved selection first.' : '';
    fileInput.disabled = unsaved();
    docMeta.textContent = current
      ? `${current.document.name} · ${current.document.byte_length} bytes · UTF-8 · SHA-256 ${current.document.sha256.slice(0, 16)}…`
      : 'No document open.';
    retryRegister.hidden = current?.sourceState !== 'failed' || current.reopened !== null;
    if (!current) sourceStatus.textContent = '';
    else if (current.sourceState === 'registered' && current.source)
      sourceStatus.textContent = `Source ${current.source.source_id} v${current.source.source_version} · ${current.reopened ? 'reopened from storage (not reimported)' : 'registered'}`;
    else if (current.sourceState === 'registering') sourceStatus.textContent = 'Registering the complete original…';
    else sourceStatus.textContent = `Not registered: ${current.sourceMessage}`;
    sourceStatus.className = `status ${current?.sourceState === 'failed' ? 'bad' : current?.sourceState === 'registered' ? 'ok' : ''}`;

    const shown = attempt?.payload ?? null;
    const selection = shown?.selection ?? draft?.selection ?? null;
    const artifact = shown?.frame_artifact ?? draft?.frozen.artifactBytes ?? null;
    const card = shown?.card ?? draft?.card ?? null;
    selQuote.textContent = selection ? quoteOf(selection.selected_text) : 'Nothing selected. Press ? (Ask) in the toolbar, then select text in the document.';
    selContext.textContent = artifact
      ? `Context at selection time (DOM snapshot of the paragraph, first 1,000 characters; the complete original is kept separately): ${contextOf(artifact)}`
      : '';
    selContext.hidden = artifact === null;
    if (selection && card) {
      reqState.textContent =
        card.provenance === 'none'
          ? `Request ${card.request_id}: no explanation generated. The explanation provider is not connected.`
          : `Request ${card.request_id}: ${card.status}.`;
      reqState.className = 'status warn';
    } else {
      reqState.textContent = '';
    }
    if (attempt === null || attempt.status === 'committed') selNotice.textContent = '';
    note.readOnly = attempt !== null && attempt.status !== 'committed';
    noteLabel.hidden = draft === null && (attempt === null || attempt.status === 'committed');
    saveBtn.disabled = draft === null || attempt !== null;
    retryBtn.hidden = attempt === null || attempt.status === 'committed' || attempt.status === 'saving';
    discardBtn.hidden = !((draft !== null && attempt === null) || (attempt !== null && attempt.status !== 'committed' && attempt.status !== 'saving'));
    if (!attempt) {
      saveStatus.textContent = draft ? 'Not saved yet.' : '';
      saveStatus.className = 'status';
    } else {
      saveStatus.textContent = attempt.message;
      saveStatus.className = `status ${attempt.status === 'committed' ? 'ok' : attempt.status === 'saving' ? '' : attempt.status === 'unknown' ? 'warn' : 'bad'}`;
    }
  };

  const renderDocument = (doc: LocalDocument): void => {
    documentView.replaceChildren(
      ...splitBlocks(doc.text).map((b) => {
        const node = b.kind === 'gap' ? el('div', 'gap') : el('p');
        node.textContent = b.text; // text only: markup in the file stays inert
        return node;
      }),
    );
  };

  const refreshSaved = async (): Promise<void> => {
    if (store.kind === 'unconnected') {
      savedStatus.textContent = 'Nothing can be saved or reopened: storage is not connected.';
      savedList.replaceChildren();
      return;
    }
    try {
      const items = await store.list();
      savedStatus.textContent = items.length === 0 ? 'No saved items yet.' : `${items.length} saved item(s).`;
      savedList.replaceChildren(
        ...items.map((it) => {
          const li = el('li');
          li.append(el('span', undefined, `${it.document_name} · ${quoteOf(it.selected_text)} · saved ${it.committed_at} `));
          const b = button('Reopen', `reopen-${it.item_id}`);
          b.dataset['item'] = it.item_id;
          b.addEventListener('click', () => void reopen(it.item_id));
          li.append(b);
          return li;
        }),
      );
    } catch (error) {
      savedStatus.textContent = `Could not list saved items: ${(error as Error).message}`;
    }
  };

  // ---- open, register, save, close, reopen -------------------------------------------------
  const register = async (view: OpenDoc): Promise<void> => {
    view.sourceState = 'registering';
    render();
    try {
      const ref = await store.importDocument(view.document);
      if (current !== view) return;
      view.source = ref;
      view.sourceState = 'registered';
    } catch (error) {
      if (current !== view) return;
      view.sourceState = 'failed';
      view.sourceMessage = error instanceof StoreError ? error.message : `registration failed: ${String(error)}`;
    }
    render();
  };

  const show = (doc: LocalDocument, reopened: SavedItem | null): OpenDoc => {
    views += 1;
    const view: OpenDoc = { document: doc, key: `view-${views}`, source: reopened?.item.source ?? null, sourceState: reopened ? 'registered' : 'registering', sourceMessage: '', reopened };
    current = view;
    draft = null;
    attempt = null;
    note.value = '';
    renderDocument(doc);
    return view;
  };

  const onFile = async (): Promise<void> => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (unsaved()) {
      openStatus.textContent = 'Not opened: save, retry or discard the unsaved selection first.';
      return;
    }
    const result = await readUtf8Document(new Uint8Array(await file.arrayBuffer()), file.name, Number.isFinite(file.lastModified) ? file.lastModified : null);
    if (!result.ok) {
      openStatus.textContent = `Not opened: ${result.reason}`;
      openStatus.className = 'status bad';
      return;
    }
    openStatus.textContent = `Opened ${file.name}. The complete original is kept exactly as read.`;
    openStatus.className = 'status';
    reopenedInfo.replaceChildren();
    const view = show(result.document, null);
    await register(view);
  };
  fileInput.addEventListener('change', () => void onFile());

  const sendSave = async (a: Attempt): Promise<void> => {
    a.status = 'saving';
    a.message = 'Saving…';
    render();
    try {
      const r = await store.save(a.payload);
      a.status = 'committed';
      a.message = `Saved (committed ${r.committed_at}${r.duplicate ? '; the store already had this item, no duplicate made' : ''}) · item ${a.payload.item_id}`;
      draft = null;
      note.value = '';
      void refreshSaved();
    } catch (error) {
      const e = error instanceof StoreError ? error : new StoreError('unknown', String(error));
      a.status = e.kind === 'unknown' ? 'unknown' : 'failed';
      a.message =
        e.kind === 'unknown'
          ? `Outcome unknown: ${e.message} Retry is safe (same item ${a.payload.item_id}, no duplicate).`
          : `Not saved: ${e.message}`;
    }
    render();
  };

  saveBtn.addEventListener('click', () => {
    if (!draft || !current?.source || attempt) return;
    deviceSequence += 1;
    const payload = buildSave({
      itemId: randomIds.next('itm'),
      source: current.source,
      frame: draft.frozen.frame,
      frameArtifact: draft.frozen.artifactBytes,
      selection: draft.selection,
      request: draft.request,
      card: draft.card,
      note: note.value,
      identity: store.identity,
      ids: randomIds,
      clock: systemClock,
      deviceSequence,
      timezone: timezone(),
    });
    attempt = { payload, status: 'saving', message: '' };
    void sendSave(attempt);
  });
  retryBtn.addEventListener('click', () => {
    if (attempt && (attempt.status === 'failed' || attempt.status === 'unknown')) void sendSave(attempt);
  });
  discardBtn.addEventListener('click', () => {
    // Explicit user choice only. An unknown outcome may already be saved: the list is
    // re-read so it shows up there if so.
    const wasUnknown = attempt?.status === 'unknown';
    attempt = null;
    draft = null;
    note.value = '';
    render();
    if (wasUnknown) void refreshSaved();
  });
  note.addEventListener('input', render);
  retryRegister.addEventListener('click', () => {
    if (current && current.sourceState === 'failed') void register(current);
  });
  closeBtn.addEventListener('click', () => {
    if (unsaved()) return;
    current = null;
    draft = null;
    attempt = null;
    note.value = '';
    documentView.replaceChildren();
    reopenedInfo.replaceChildren();
    openStatus.textContent = 'Document closed. Saved items can be reopened from storage.';
    probe.closeCard();
    render();
  });

  const reopen = async (itemId: string): Promise<void> => {
    if (unsaved()) {
      openStatus.textContent = 'Not reopened: save, retry or discard the unsaved selection first.';
      return;
    }
    let saved: SavedItem;
    try {
      saved = await store.get(itemId);
    } catch (error) {
      openStatus.textContent = `Could not reopen: ${(error as Error).message}`;
      openStatus.className = 'status bad';
      return;
    }
    const verified = (await sha256OfBytes(new TextEncoder().encode(saved.document.text))) === saved.document.sha256;
    openStatus.textContent = `Reopened ${saved.document.name} from storage. ${verified ? 'The stored original matches its SHA-256.' : 'WARNING: the stored original does not match its SHA-256.'}`;
    openStatus.className = `status ${verified ? '' : 'bad'}`;
    show(saved.document, saved);
    const { item } = saved;
    reopenedInfo.replaceChildren(
      el('h2', undefined, 'Saved selection'),
      el('p', 'quote', quoteOf(item.selection.selected_text)),
      el('p', 'meta', `Frame ${item.frame.frame_id} · ${item.frame.representation} (no pixels) · captured ${item.frame.captured_at} · committed ${saved.committed_at}`),
      el('p', 'context', `Context at selection time: ${contextOf(item.frame_artifact)}`),
      el('p', 'meta', `Your note (${item.user_note ? `event ${item.user_note.event_id}` : 'none'}):`),
      el('p', 'note', item.user_note?.text ?? '(no note)'),
      el('p', 'meta', `AI (kept separately): request ${item.request.request_id} · ${item.card.provenance === 'none' ? 'no explanation generated; provider not connected' : item.card.status}`),
    );
    probe.closeCard();
    render();
  };

  const onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (unsaved()) e.preventDefault();
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  render();
  void refreshSaved();

  const state = (): Record<string, unknown> => ({
    document: current ? { name: current.document.name, sha256: current.document.sha256, byte_length: current.document.byte_length, key: current.key, reopened: current.reopened !== null } : null,
    source: current?.source ?? null,
    sourceState: current?.sourceState ?? null,
    sourceStatus: sourceStatus.textContent,
    openStatus: openStatus.textContent,
    renderedText: Array.from(documentView.children, (c) => c.textContent ?? '').join(''),
    renderedElements: documentView.querySelectorAll('*').length,
    renderedTags: [...new Set(Array.from(documentView.querySelectorAll('*'), (n) => n.localName))],
    selectedText: attempt?.payload.selection.selected_text ?? draft?.selection.selected_text ?? null,
    requestState: reqState.textContent,
    notice: selNotice.textContent,
    noteText: note.value,
    saveStatus: saveStatus.textContent,
    attempt: attempt ? { status: attempt.status, item_id: attempt.payload.item_id } : null,
    buttons: { save: !saveBtn.disabled, retry: !retryBtn.hidden, discard: !discardBtn.hidden, close: !closeBtn.disabled, retryRegister: !retryRegister.hidden },
    savedItems: Array.from(savedList.querySelectorAll('button'), (b) => b.dataset['item']),
    reopened: reopenedInfo.textContent,
    card: probe.cardSnapshot(),
  });

  return {
    store,
    events,
    probe,
    session,
    state,
    unmount: () => {
      probe.uninstall();
      window.removeEventListener('beforeunload', onBeforeUnload);
      app.replaceChildren();
    },
  };
}

// ---- page start ------------------------------------------------------------------------
declare global {
  interface Window {
    __lcPreview?: PreviewHandle & { readonly testStore: TestDoubleStore | null; readonly restartUi: (() => void) | null };
  }
}

const app = document.getElementById('app');
if (app) {
  // The test double is opt-in and labeled; the default is honestly unconnected.
  const testStore = new URLSearchParams(location.search).get('store') === 'test-double' ? createTestDoubleStore(randomIds, systemClock) : null;
  const store: PreviewStore = testStore ?? unconnectedStore;
  const status = document.getElementById('store-status');
  if (status) {
    status.textContent = store.description;
    status.classList.toggle('test-double', testStore !== null);
  }
  const start = (): void => {
    const handle = mount(app, store);
    // Test hooks exist only with the test double: its failures can be injected, and the UI
    // can be rebuilt from the store (the same store object; not a page reload or API restart).
    window.__lcPreview = {
      ...handle,
      testStore,
      restartUi: testStore
        ? () => {
            handle.unmount();
            start();
          }
        : null,
    };
  };
  start();
}
