// P0-07 document preview page (owned page, early desktop fallback). The user connects
// the local preview API with its token, opens a local UTF-8 document, marks text with
// the existing explicit ASK interaction, sees the request state, adds a title, their
// own request and note, saves, closes and reopens the saved item from the API. No
// explanation is generated for real content: the provider is not connected, and no
// fixture text is used. All document text is rendered through textContent only, so
// markup in a document stays inert text.

import { ProbeSession, type AskOutcome, type SessionConfig } from '../../src/session.ts';
import { installProbe, type ProbeEvent, type ProbeInstall } from '../../src/page.ts';
import { unavailableTransport } from '../../src/bridge.ts';
import { randomIds, systemClock, type DomSnapshotPayload, type SourceBinding } from '../../src/frame.ts';
import type { SourceRef } from '../../src/contracts.ts';
import { quoteOf } from '../../src/explain.ts';
import { readUtf8Document, splitBlocks, type LocalDocument } from './document.ts';
import { createApiStore, type ApiStore } from './api-store.ts';
import { buildSave, createTestDoubleStore, limitProblems, StoreError, suggestTitle, type PreviewSave, type PreviewStore, type SavedItem, type TestDoubleStore } from './store.ts';

type Submitted = Extract<AskOutcome, { status: 'submitted' }>;

type OpenDoc = {
  readonly document: LocalDocument;
  /** Distinguishes each opened view; a mark captured on an earlier view is never bound to this one. */
  readonly key: string;
  source: SourceRef | null;
  /** The source's time zone, fixed at registration; every frame of this source uses it. */
  readonly timezone: string;
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
const labeled = <T extends HTMLElement>(text: string, field: T, id: string): { label: HTMLLabelElement; field: T } => {
  const label = el('label', 'field', text);
  field.id = id;
  label.append(field);
  return { label, field };
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
  /** The current save attempt's exact payload (checks resend it to observe the API's replay). */
  readonly attemptPayload: () => PreviewSave | null;
  /** Plain-text view of the page state for checks. Never contains the token. */
  readonly state: () => Record<string, unknown>;
  readonly unmount: () => void;
};

export function mount(app: HTMLElement, store: PreviewStore, storeStatus: HTMLElement | null = null): PreviewHandle {
  const api: ApiStore | null = store.kind === 'api' ? (store as ApiStore) : null;
  let current: OpenDoc | null = null;
  let draft: Submitted | null = null;
  let suggested = '';
  let attempt: Attempt | null = null;
  let unboundReason = '';
  let connectMessage = '';
  let views = 0;
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

  // Connection to the local preview API (API store only). The token is read from the
  // field once, the field is cleared, and the token lives only inside the store.
  const connectPanel = el('section', 'panel');
  connectPanel.setAttribute('aria-label', 'Local preview API');
  const apiStatus = el('p', 'status');
  apiStatus.id = 'api-status';
  apiStatus.setAttribute('role', 'status');
  const tokenInput = el('input');
  tokenInput.type = 'password';
  tokenInput.autocomplete = 'off';
  tokenInput.spellcheck = false;
  const token = labeled('Token ', tokenInput, 'api-token');
  const connectBtn = button('Connect', 'connect');
  const connectRow = el('div', 'row');
  connectRow.append(token.label, connectBtn);
  connectPanel.append(
    el('h2', undefined, 'Local preview API'),
    apiStatus,
    connectRow,
    el('p', 'meta', "The token the API was started with (LC_PREVIEW_TOKEN). It stays in this page's memory only: not in the address, storage or any document, and it is gone after a reload."),
  );
  connectPanel.hidden = api === null;

  const requestPanel = el('section', 'panel');
  requestPanel.setAttribute('aria-label', 'Selection and request');
  const selQuote = el('p', 'quote');
  const selContext = el('p', 'context');
  const reqState = el('p', 'status');
  const selNotice = el('p', 'status bad');
  const titleField = labeled('Title', el('input'), 'title');
  titleField.field.type = 'text';
  const requestField = labeled('Your question or request (optional; saved as your own words, exactly as typed)', el('textarea'), 'request-text');
  const noteField = labeled('Your note (optional; saved as your user note, exactly as typed)', el('textarea'), 'note');
  const titleInput = titleField.field;
  const requestInput = requestField.field;
  const note = noteField.field;
  const fields = el('div');
  fields.append(titleField.label, requestField.label, noteField.label);
  const saveBtn = button('Save', 'save');
  const retryBtn = button('Retry save', 'retry-save');
  const discardBtn = button('Discard unsaved selection', 'discard');
  const limitStatus = el('p', 'status bad');
  limitStatus.id = 'limit-status';
  const saveStatus = el('p', 'status');
  saveStatus.id = 'save-status';
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  const saveRow = el('div', 'row');
  saveRow.append(saveBtn, retryBtn, discardBtn);
  requestPanel.append(el('h2', undefined, 'Selection and request'), selQuote, selContext, reqState, selNotice, fields, saveRow, limitStatus, saveStatus);

  const savedPanel = el('section', 'panel');
  savedPanel.setAttribute('aria-label', 'Saved items');
  const savedStatus = el('p', 'status');
  const savedList = el('ul', 'saved');
  savedPanel.append(el('h2', undefined, 'Saved items'), savedStatus, savedList);
  side.append(connectPanel, requestPanel, savedPanel);
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
    else return Object.freeze({ source_id: current.source.source_id, source_version: current.source.source_version, source_timezone: current.timezone });
    return null;
  };
  const sessionConfig: SessionConfig = {
    // Read at each ASK: the API identity is known only after connecting.
    get identity() {
      return store.identity;
    },
    ids: randomIds,
    clock: systemClock,
    transport: unavailableTransport,
    fixtures: [], // real documents never get fixture text
    resolveSource,
    projectId: null,
    knowledgeProfileVersion: 1,
  };
  const session = new ProbeSession(sessionConfig);
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
            : 'Your new selection was not added: save or discard your typed words first (they are kept).';
        probe.closeCard(); // the card would describe the selection that was not added
        return;
      }
      selNotice.textContent = '';
      draft = outcome;
      attempt = null;
      suggested = suggestTitle(outcome.selection.selected_text);
      clearFields(suggested);
      render();
    },
    unregisteredMessage: () => unboundReason,
    bridgeNote: 'Saving is separate from this card: see the save status in the side panel.',
  });

  // ---- rendering ---------------------------------------------------------------------
  const clearFields = (title: string): void => {
    titleInput.value = title;
    requestInput.value = '';
    note.value = '';
    limitStatus.textContent = '';
  };
  const typed = (): boolean => requestInput.value.trim().length > 0 || note.value.trim().length > 0 || titleInput.value !== suggested;
  const unsaved = (): boolean => (attempt !== null && attempt.status !== 'committed') || (draft !== null && typed());
  const render = (): void => {
    if (storeStatus) storeStatus.textContent = store.description;
    if (api) {
      apiStatus.textContent = connectMessage || api.description;
      apiStatus.className = `status ${api.status === 'connected' ? 'ok' : api.status === 'connecting' ? '' : 'bad'}`;
      connectRow.hidden = api.status === 'connected';
      connectBtn.disabled = api.status === 'connecting';
    }
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
    const selection = shown?.bridge_request.selection ?? draft?.selection ?? null;
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
    const locked = attempt !== null && attempt.status !== 'committed';
    for (const f of [titleInput, requestInput, note]) f.readOnly = locked;
    fields.hidden = draft === null && !locked;
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
    if (api && api.status !== 'connected') {
      savedStatus.textContent = 'Connect the local preview API to list and reopen saved items.';
      savedList.replaceChildren();
      return;
    }
    try {
      const items = await store.list();
      const where = api ? " (from this browser's list of saved note ids; the originals are read from the API)" : '';
      const unconfirmed = items.filter((it) => it.pending).length;
      const counts = `${items.length - unconfirmed} saved item(s)${unconfirmed > 0 ? `, ${unconfirmed} not confirmed` : ''}`;
      savedStatus.textContent = items.length === 0 ? `No saved items yet${where}.` : `${counts}${where}.`;
      savedList.replaceChildren(
        ...items.map((it) => {
          const li = el('li');
          const when = it.pending
            ? 'save not confirmed: not found so far, outcome still unknown (checked again each time this list is shown)'
            : `saved ${it.saved_at ?? '(time not recorded)'}`;
          li.append(el('span', it.pending ? 'pending' : undefined, `${it.title} · ${it.document_name} · ${when} `));
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

  // ---- connect, open, register, save, close, reopen -----------------------------------------
  const connect = async (): Promise<void> => {
    if (!api) return;
    const entered = tokenInput.value;
    tokenInput.value = ''; // the field never keeps the token
    if (entered.length === 0) return;
    connectMessage = '';
    render();
    try {
      await api.connect(entered);
    } catch (error) {
      connectMessage = `Not connected: ${(error as Error).message}`;
    }
    render();
    void refreshSaved();
    if (api.status === 'connected' && current && current.sourceState === 'failed' && current.reopened === null) void register(current);
  };
  connectBtn.addEventListener('click', () => void connect());
  tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void connect();
  });

  const register = async (view: OpenDoc): Promise<void> => {
    view.sourceState = 'registering';
    render();
    try {
      const ref = await store.importDocument(view.document, view.timezone);
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
    const view: OpenDoc = {
      document: doc,
      key: `view-${views}`,
      source: reopened?.item.source ?? null,
      timezone: reopened?.item.frame.source_timezone ?? timezone(),
      sourceState: reopened ? 'registered' : 'registering',
      sourceMessage: '',
      reopened,
    };
    current = view;
    draft = null;
    attempt = null;
    suggested = '';
    clearFields('');
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
    if (unsaved()) {
      openStatus.textContent = 'Not opened: save, retry or discard the unsaved selection first.';
      return;
    }
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
    // Once an outcome is unknown it stays unknown until a receipt arrives: a later refusal
    // says only that the retry was not applied, not that the first attempt was not.
    const wasUnknown = a.status === 'unknown';
    a.status = 'saving';
    a.message = 'Saving…';
    render();
    try {
      const r = await store.save(a.payload);
      a.status = 'committed';
      const by = store.kind === 'api' ? 'the local preview API confirmed server_committed' : 'the TEST DOUBLE (not persistent) accepted it';
      a.message = `Saved: ${by} at ${r.confirmed_at}${r.duplicate ? '; it already had this item, no duplicate made' : ''} · note ${a.payload.item_id}`;
      draft = null;
      suggested = '';
      clearFields('');
      void refreshSaved();
    } catch (error) {
      const e = error instanceof StoreError ? error : new StoreError('unknown', String(error));
      a.status = e.kind === 'unknown' || wasUnknown ? 'unknown' : 'failed';
      const retry = `Retry is safe (same note ${a.payload.item_id}, no duplicate).`;
      a.message =
        e.kind === 'unknown'
          ? `Outcome unknown: ${e.message} ${retry}`
          : wasUnknown
            ? `Outcome still unknown: the earlier attempt may already be saved. This retry was not applied: ${e.message} ${retry}`
            : e.kind === 'unauthorized'
              ? `Not saved: ${e.message} Then press Retry save.`
              : `Not saved: ${e.message}`;
    }
    render();
  };

  saveBtn.addEventListener('click', () => {
    if (!draft || !current?.source || attempt) return;
    const payload = buildSave({
      itemId: randomIds.next('note'),
      source: current.source,
      frame: draft.frozen.frame,
      frameArtifact: draft.frozen.artifactBytes,
      bridgeRequest: draft.bridgeRequest,
      request: draft.request,
      card: draft.card,
      title: titleInput.value,
      requestText: requestInput.value,
      userNote: note.value,
    });
    const problems = limitProblems(payload);
    if (problems.length > 0) {
      limitStatus.textContent = `Not sent: ${problems.join('; ')}. Nothing was shortened; edit and save again.`;
      return;
    }
    limitStatus.textContent = '';
    attempt = { payload, status: 'saving', message: '' };
    void sendSave(attempt);
  });
  retryBtn.addEventListener('click', () => {
    if (attempt && (attempt.status === 'failed' || attempt.status === 'unknown')) void sendSave(attempt);
  });
  discardBtn.addEventListener('click', () => {
    // Explicit user choice only. An unknown outcome may already be saved: the store listed its
    // note id before sending, and re-reading the list asks the API whether it exists.
    const wasUnknown = attempt?.status === 'unknown';
    attempt = null;
    draft = null;
    suggested = '';
    clearFields('');
    render();
    if (wasUnknown) void refreshSaved();
  });
  for (const f of [titleInput, requestInput, note]) f.addEventListener('input', render);
  retryRegister.addEventListener('click', () => {
    if (current && current.sourceState === 'failed') void register(current);
  });
  closeBtn.addEventListener('click', () => {
    if (unsaved()) return;
    current = null;
    draft = null;
    attempt = null;
    suggested = '';
    clearFields('');
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
      render();
      void refreshSaved(); // a note the API no longer has is dropped from the list
      return;
    }
    if (unsaved()) {
      // Words were typed or a save started while the item was being read: keep them.
      openStatus.textContent = 'Not reopened: save, retry or discard the unsaved selection first.';
      return;
    }
    const { item, verified } = saved;
    const intact = verified.source && verified.frame;
    openStatus.textContent = `Reopened ${saved.document.name} from storage. ${
      intact ? 'The returned original and selection-time context match their SHA-256.' : `WARNING: returned bytes do not match their SHA-256 (original ${verified.source ? 'ok' : 'MISMATCH'}, context ${verified.frame ? 'ok' : 'MISMATCH'}).`
    }`;
    openStatus.className = `status ${intact ? '' : 'bad'}`;
    show(saved.document, saved);
    const noteRecord = saved.note ? ` · note ${saved.note.note_id} revision ${saved.note.revision}, authorship ${saved.note.authorship}` : '';
    reopenedInfo.replaceChildren(
      el('h2', undefined, 'Saved item'),
      el('p', 'meta', 'Title (yours):'),
      el('p', 'note', item.title),
      el('p', 'quote', quoteOf(item.bridge_request.selection.selected_text)),
      el('p', 'meta', `Frame ${item.frame.frame_id} · ${item.frame.representation} (no pixels) · captured ${item.frame.captured_at} · saved ${saved.committed_at}`),
      el('p', 'context', `Context at selection time: ${contextOf(item.frame_artifact)}`),
      el('p', 'meta', 'Your question or request (your own words, exactly as typed):'),
      el('p', 'note', item.request_text || '(none)'),
      el('p', 'meta', `Your note (a user note, not an AI response and not ink${noteRecord}):`),
      el('p', 'note', item.user_note || '(none)'),
      el('p', 'meta', `AI (kept separately): request ${item.request.request_id} · ${item.card.provenance === 'none' ? 'provider unavailable: no explanation generated' : item.card.status}`),
    );
    probe.closeCard();
    render();
    void refreshSaved(); // a pending id this reopen confirmed now shows as saved
  };

  const onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (unsaved()) e.preventDefault();
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  render();
  void refreshSaved();

  const state = (): Record<string, unknown> => ({
    storeStatus: store.description,
    api: api ? { status: api.status, session: api.session, message: apiStatus.textContent } : null,
    document: current ? { name: current.document.name, sha256: current.document.sha256, byte_length: current.document.byte_length, key: current.key, reopened: current.reopened !== null } : null,
    source: current?.source ?? null,
    sourceState: current?.sourceState ?? null,
    sourceStatus: sourceStatus.textContent,
    openStatus: openStatus.textContent,
    renderedText: Array.from(documentView.children, (c) => c.textContent ?? '').join(''),
    renderedElements: documentView.querySelectorAll('*').length,
    renderedTags: [...new Set(Array.from(documentView.querySelectorAll('*'), (n) => n.localName))],
    selectedText: attempt?.payload.bridge_request.selection.selected_text ?? draft?.selection.selected_text ?? null,
    requestState: reqState.textContent,
    notice: selNotice.textContent,
    title: titleInput.value,
    requestText: requestInput.value,
    noteText: note.value,
    limitStatus: limitStatus.textContent,
    saveStatus: saveStatus.textContent,
    attempt: attempt ? { status: attempt.status, item_id: attempt.payload.item_id } : null,
    buttons: { save: !saveBtn.disabled, retry: !retryBtn.hidden, discard: !discardBtn.hidden, close: !closeBtn.disabled, retryRegister: !retryRegister.hidden },
    savedStatus: savedStatus.textContent,
    savedItems: Array.from(savedList.querySelectorAll('button'), (b) => b.dataset['item']),
    reopened: reopenedInfo.textContent,
    card: probe.cardSnapshot(),
  });

  return {
    store,
    events,
    probe,
    session,
    attemptPayload: () => attempt?.payload ?? null,
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
  // The real API store is the default; the in-memory test double is opt-in and labeled.
  const testStore = new URLSearchParams(location.search).get('store') === 'test-double' ? createTestDoubleStore(randomIds, systemClock) : null;
  const storage = ((): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const store: PreviewStore = testStore ?? createApiStore({ fetch: window.fetch.bind(window), storage, ids: randomIds, clock: systemClock });
  const status = document.getElementById('store-status');
  status?.classList.toggle('test-double', testStore !== null);
  const start = (): void => {
    const handle = mount(app, store, status);
    // Test-double hooks: its failures can be injected, and the UI can be rebuilt from the
    // same store object (not a page reload or API restart).
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
