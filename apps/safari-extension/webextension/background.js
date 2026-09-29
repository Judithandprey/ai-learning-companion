// Background of the Learning Companion WebExtension entry (Manifest V3, nonpersistent).
// Plain JavaScript, no build step: Safari (packaged by iOS) and Chromium load this folder as is.
//
// - The toolbar button starts the companion in the current tab's top frame, or stops it when it is
//   already running there. That press is also what grants activeTab for this tab.
// - A capture request from that tab's top frame is answered with one PNG of the visible tab, only
//   while that tab is the visible tab of its window: checked before and after, and discarded when any
//   tab was activated in that window in between (switching away and back). The image is not stored
//   and nothing is sent anywhere.
// - WRITE ink of a page is kept in this extension's own IndexedDB on this device (one document per
//   exact page address, keyed by the page origin and the SHA-256 of that address; the address itself
//   is not stored). A save is accepted only when the new document reads as complete ink of that page
//   and keeps everything already stored: the stored document must read too, its history must be the
//   start of the new one, and every stored stroke must be unchanged. Anything else (another tab saved
//   newer ink, a record this version cannot read) is refused and the stored record is left as is.

// The ink document reader, generated from src/ink.ts (the same code the page uses to read ink).
if (typeof importScripts === 'function') importScripts('ink-format.js');
const inkFormat = globalThis.lcInkFormat;

const api = globalThis.browser ?? globalThis.chrome;
const CAPTURE_MESSAGE = 'lc-capture/v1'; // must match src/extension-content.ts
const STOPPED_MESSAGE = 'lc-stopped/v1'; // must match src/extension-content.ts
const INK_LOAD_MESSAGE = 'lc-ink-load/v1'; // must match src/extension-content.ts
const INK_SAVE_MESSAGE = 'lc-ink-save/v1'; // must match src/extension-content.ts
const TITLE = 'Learning Companion: start or stop on this page';

/** Starts the companion in `tab` (top frame only), or stops it if it is running there. */
async function toggleCompanion(tab) {
  if (!tab || typeof tab.id !== 'number') return 'no_tab';
  if (typeof tab.url === 'string' && !/^https?:\/\//.test(tab.url)) return unsupported(tab.id, 'not a web page');
  const target = { tabId: tab.id, frameIds: [0] };
  try {
    const [running] = await api.scripting.executeScript({
      target,
      func: () => (globalThis.__lcCompanion ? globalThis.__lcCompanion.toggle() : 'absent'),
    });
    if (running && running.result === 'absent') {
      await api.scripting.executeScript({ target, files: ['content.js'] });
      // Only a companion that actually started counts (an injected script can fail on some documents).
      const [check] = await api.scripting.executeScript({ target, func: () => Boolean(globalThis.__lcCompanion) });
      if (!check || check.result !== true) return unsupported(tab.id, 'the companion could not start on this page');
      await show(tab.id, 'ON', TITLE);
      return 'started';
    }
    await show(tab.id, '', TITLE);
    return running ? running.result : 'unknown';
  } catch (error) {
    // Pages the browser does not let extensions script (its own pages, stores, PDFs, ...).
    return unsupported(tab.id, error && error.message ? error.message : String(error));
  }
}

/** A press that cannot start the companion says so on the button (the page itself cannot be used). */
async function unsupported(tabId, why) {
  await show(tabId, '!', `Learning Companion cannot run on this page (${why})`);
  return `unsupported_page: ${why}`;
}

async function show(tabId, badge, title) {
  try {
    await api.action.setBadgeText({ tabId, text: badge });
    await api.action.setTitle({ tabId, title });
  } catch {
    // The badge is only a hint; the in-page panel is the state the user sees.
  }
}

// Tab activations per window and updates (navigation, reload, ...) per tab while this worker runs:
// a capture compares both counts across itself and discards on any change.
const activations = new Map();
const updates = new Map();
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
api.tabs.onActivated.addListener(({ windowId }) => bump(activations, windowId));

/** One PNG of the visible tab for the top frame of `sender.tab`, or why not. */
async function captureFor(sender) {
  const tab = sender && sender.tab;
  if (!tab || typeof tab.id !== 'number' || sender.frameId !== 0 || sender.id !== api.runtime.id) {
    return { ok: false, reason: 'only the companion in the top frame of a tab may ask for a capture' };
  }
  const visible = async () => {
    const [active] = await api.tabs.query({ active: true, windowId: tab.windowId });
    return Boolean(active) && active.id === tab.id;
  };
  if (!(await visible())) return { ok: false, reason: 'this tab is not the visible tab of its window, so it was not captured' };
  const activationsBefore = activations.get(tab.windowId) || 0;
  const updatesBefore = updates.get(tab.id) || 0;
  const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const capturedAt = new Date().toISOString();
  if (!(await visible()) || (activations.get(tab.windowId) || 0) !== activationsBefore) {
    return { ok: false, reason: 'the visible tab changed while capturing, so the image was discarded' };
  }
  if ((updates.get(tab.id) || 0) !== updatesBefore) return { ok: false, reason: 'the tab navigated or changed while capturing, so the image was discarded' };
  return { ok: true, dataUrl, capturedAt };
}

// ---- WRITE ink ----------------------------------------------------------------------------------
let inkDb = null;
const openInk = () =>
  (inkDb ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('lc-web-ink', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pages');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      inkDb = null;
      reject(request.error);
    };
  }));

/** The origin of the companion's top frame that sent `message`, or null for anything else. */
function inkOrigin(sender) {
  if (!sender || sender.id !== api.runtime.id || sender.frameId !== 0 || !sender.tab || typeof sender.url !== 'string') return null;
  const url = new URL(sender.url);
  return /^https?:$/.test(url.protocol) ? url.origin : null;
}
const isSha256 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/**
 * Why saving `next` over `stored` (both complete ink documents) would lose something (`conflict`: the
 * stored history has operations `next` lacks, e.g. another tab saved newer ink), or null when it only
 * adds to it.
 */
function inkConflict(stored, next) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (next.history.length < stored.history.length || !stored.history.every((op, i) => same(op, next.history[i]))) {
    return { reason: 'newer ink for this page was saved in another tab or window; it was not overwritten', conflict: true };
  }
  for (const [id, stroke] of Object.entries(stored.strokes)) {
    if (!same(stroke, next.strokes[id])) return { reason: 'a stored stroke would have been lost; nothing was overwritten', conflict: true };
  }
  return null;
}

async function inkRequest(message, sender) {
  const origin = inkOrigin(sender);
  if (!origin) return { ok: false, reason: 'only the companion in the top frame of a web page may use its ink' };
  const db = await openInk();
  if (message.type === INK_LOAD_MESSAGE) {
    if (!isSha256(message.address_sha256)) return { ok: false, reason: 'not a page address fingerprint' };
    return new Promise((resolve) => {
      const tx = db.transaction('pages', 'readonly');
      const get = tx.objectStore('pages').get(`${origin} ${message.address_sha256}`);
      tx.oncomplete = () => resolve({ ok: true, doc: get.result ?? null });
      tx.onabort = tx.onerror = () => resolve({ ok: false, reason: `the browser could not read it (${tx.error ? tx.error.message : 'aborted'})` });
    });
  }
  const doc = message.doc;
  if (!inkFormat) return { ok: false, reason: 'the ink reader of the extension is missing, so nothing was saved' };
  if (!doc || !doc.page || !isSha256(doc.page.address_sha256)) return { ok: false, reason: 'not an ink document of this page' };
  const page = { origin, address_sha256: doc.page.address_sha256 };
  const incoming = inkFormat.parseInk(doc, page); // also refuses another origin
  if (!incoming.ok) return { ok: false, reason: `not saved: ${incoming.reason}` };
  return new Promise((resolve) => {
    const tx = db.transaction('pages', 'readwrite');
    const pages = tx.objectStore('pages');
    const key = `${origin} ${doc.page.address_sha256}`;
    let answer = { ok: false, reason: 'not saved' };
    const get = pages.get(key);
    get.onsuccess = () => {
      if (get.result !== undefined && !inkFormat.parseInk(get.result, page).ok) {
        answer = { ok: false, reason: 'the ink stored for this page cannot be read by this version, so it was left untouched' };
        return;
      }
      const why = get.result === undefined ? null : inkConflict(get.result, doc);
      if (why) {
        answer = { ok: false, ...why };
        return;
      }
      pages.put(doc, key);
      answer = { ok: true };
    };
    // Saved only when the transaction committed.
    tx.oncomplete = () => resolve(answer);
    tx.onabort = tx.onerror = () => resolve({ ok: false, reason: `the browser did not store it (${tx.error ? tx.error.message : 'aborted'})` });
  });
}

api.action.onClicked.addListener((tab) => {
  toggleCompanion(tab);
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === STOPPED_MESSAGE) {
    // Stopped from the page's panel: clear this tab's badge (only for our own top-frame script).
    if (sender && sender.id === api.runtime.id && sender.frameId === 0 && sender.tab && typeof sender.tab.id === 'number') show(sender.tab.id, '', TITLE);
    return false;
  }
  if (message && (message.type === INK_LOAD_MESSAGE || message.type === INK_SAVE_MESSAGE)) {
    inkRequest(message, sender).then(sendResponse, (error) => sendResponse({ ok: false, reason: error && error.message ? error.message : String(error) }));
    return true;
  }
  if (!message || message.type !== CAPTURE_MESSAGE) return false;
  captureFor(sender).then(sendResponse, (error) => sendResponse({ ok: false, reason: error && error.message ? error.message : String(error) }));
  return true; // answered asynchronously
});

// A navigation replaces the page (and the companion in it): the ON badge must not outlive it.
api.tabs.onUpdated.addListener((tabId, change) => {
  bump(updates, tabId);
  if (change.status === 'loading') show(tabId, '', TITLE);
});
