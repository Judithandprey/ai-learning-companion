// QA steps for the bounded ink recovery + export retest (QA_SCENARIO=recovery), on the owned synthetic
// course page served on 4184. Driven by run.mjs; checked by analyze_recovery.py.
//
// Product actions are real CDP input (mouse strokes, clicks on the product's own buttons) and the
// extension's own action (DevTools Extensions.triggerAction on the active tab). Harness controls,
// labelled in the evidence:
//   - worker reads of companion state and of the in-tab keep map (isolated world), and native
//     IndexedDB reads through the product's own parseInk/parseCopy (a read never creates a store);
//   - FORGED records: an unreadable main before load, a main/copy made unreadable after load;
//   - a HELD real IndexedDB readwrite transaction from the worker (with the forgery inside it), so the
//     product's save waits behind it and its refusal arrives after Stop or an address change;
//   - an INJECTED transaction failure: a put wrapper in the worker that aborts the real transaction;
//   - a focused IR2 message probe from the tab's isolated world (real sender);
//   - Browser.setDownloadBehavior 'allow' into the run's own folder for real Export downloads;
//   - tab B created/switched from the worker and given a temporary title for the action invocation;
//   - pushState/replaceState and CDP reload/navigate.

const Y1 = 300, Y2 = 380, Y3 = 460, Y4 = 540, Y5 = 620, XL = 960, XR = 1180;

export function recoverySteps(h) {
  const { E, SW, sleep, shot, state, press, trigger, PAGE, A, B, mouse, toolbarPoint, clickAt, capLog } = h;
  const line = (x0, y0, x1, y1, n = 8) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  const stroke = (pts, other, settle = 450) => {
    const on = other ? { other } : {};
    const [x0, y0] = pts[0];
    const [xn, yn] = pts[pts.length - 1];
    return [
      { ...mouse('mouseMoved', x0, y0, { pointerType: 'mouse', buttons: 0 }), ...on },
      { ...mouse('mousePressed', x0, y0, { pointerType: 'mouse' }), ...on },
      ...pts.slice(1).map(([x, y]) => ({ ...mouse('mouseMoved', x, y, { pointerType: 'mouse', button: 'left', buttons: 1 }), ...on })),
      { ...mouse('mouseReleased', xn, yn, { pointerType: 'mouse' }), ...on },
      sleep(settle),
    ];
  };
  const row = (y, other, settle) => stroke(line(XL, y, XR, y), other, settle);
  const eraseAt = (x, y) => stroke(line(x, y - 22, x, y + 22, 6));
  const ink = (as, tab = A) => state(as, tab);
  const writeMouse = [...press('WRITE'), ...press('INK_MOUSE')];
  const OPEN = `new Promise((ok) => { const r = indexedDB.open('lc-web-ink'); r.onupgradeneeded = () => r.transaction.abort(); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); })`;
  const keyOf = (address) => `new URL(${JSON.stringify(address)}).origin + ' ' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(${JSON.stringify(address)}))), (b) => b.toString(16).padStart(2, '0')).join('')`;
  /** Every stored record (main and copies), read natively and parsed with the product's own reader. */
  const idb = (as) => SW(`(async () => { const db = await ${OPEN}; if (!db) return { absent: true }; if (!db.objectStoreNames.contains('pages')) { db.close(); return { noStore: true }; }
    const rows = await new Promise((ok, no) => { const out = []; const tx = db.transaction('pages', 'readonly'); const c = tx.objectStore('pages').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ key: cur.key, value: cur.value }); cur.continue(); } }; tx.oncomplete = () => ok(out); tx.onerror = () => no(tx.error); });
    db.close();
    return rows.map(({ key, value }) => { const m = /^(\\S+) ([0-9a-f]{64})(?: #([0-9a-f]{16}))?$/.exec(key); const page = m ? { origin: m[1], address_sha256: m[2] } : null; let parse;
      try { if (m && m[3]) { const r = lcInkFormat.parseCopy(value, page); parse = { ok: !!r.ok, reason: r.reason || null, copyId: r.ok && r.copy ? r.copy.id : null }; } else { const r = lcInkFormat.parseInk(value, page); parse = { ok: !!r.ok, reason: r.reason || null }; } } catch (e) { parse = { ok: false, reason: 'threw ' + e.message }; }
      return { key, sha: m ? m[2] : null, copyId: m ? (m[3] || null) : null, parse, keys: value && typeof value === 'object' ? Object.keys(value).sort() : null, json: JSON.stringify(value) }; }); })()`, as);
  /** FORGED: put `value` as the main record of `address` before the page loads it. */
  const forgeMain = (address, value, as) => SW(`(async () => { const key = ${keyOf(address)}; const db = await ${OPEN}; await new Promise((ok, no) => { const tx = db.transaction('pages', 'readwrite'); tx.objectStore('pages').put(${value}, key); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); db.close(); return key; })()`, as);
  /** FORGED: make the stored main record of `address` unreadable after the page loaded it ('incomplete'). */
  const corruptMain = (address, as) => SW(`(async () => { const key = ${keyOf(address)}; const db = await ${OPEN}; await new Promise((ok, no) => { const tx = db.transaction('pages', 'readwrite'); const s = tx.objectStore('pages'); const g = s.get(key); g.onsuccess = () => s.put({ ...g.result, revision: g.result.revision + 1 }, key); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); db.close(); return key; })()`, as);
  /** FORGED: make the copy the tab is writing to unreadable after load (forked_at -1 fails the copy check). */
  const corruptTargetCopy = (as) => SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, func: () => { const s = globalThis.__lcCompanion && globalThis.__lcCompanion.state(); return s && s.ink && s.ink.copy ? { id: s.ink.copy.id, sha: s.ink.page.address_sha256, origin: s.ink.page.origin } : null; } }); const t = r.result; if (!t) return 'no copy';
    const key = t.origin + ' ' + t.sha + ' #' + t.id; const db = await ${OPEN}; await new Promise((ok, no) => { const tx = db.transaction('pages', 'readwrite'); const s = tx.objectStore('pages'); const g = s.get(key); g.onsuccess = () => s.put({ ...g.result, forked_at: -1 }, key); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); db.close(); return key; })()`, as);
  /** HELD real transaction: corrupt the main record inside a readwrite transaction kept open until released. */
  const holdCorrupt = (address, as) => SW(`(async () => { const key = ${keyOf(address)}; globalThis.__qaHold = true; globalThis.__qaHoldDone = null; const db = await ${OPEN}; const tx = db.transaction('pages', 'readwrite'); const s = tx.objectStore('pages');
    const g = s.get(key); g.onsuccess = () => { s.put({ ...g.result, revision: g.result.revision + 1 }, key); const spin = () => { if (globalThis.__qaHold) s.get('qa-hold-spin').onsuccess = spin; }; spin(); };
    tx.oncomplete = () => { globalThis.__qaHoldDone = new Date().toISOString(); db.close(); }; globalThis.__qaHoldStarted = new Date().toISOString(); return key; })()`, as);
  const release = (as) => SW(`(globalThis.__qaHold = false, new Promise((r) => setTimeout(() => r({ released: new Date().toISOString(), started: globalThis.__qaHoldStarted, done: globalThis.__qaHoldDone }), 400)))`, as);
  /** INJECTED failure: while the flag is on, every put aborts its (real) transaction after queueing. */
  const abortPuts = (on, as) => SW(`(() => { const P = IDBObjectStore.prototype; if (!P.__qaPut) { P.__qaPut = P.put; P.put = function (...a) { const r = P.__qaPut.apply(this, a); if (globalThis.__qaAbortPuts) { try { this.transaction.abort(); } catch (e) { globalThis.__qaAbortError = String(e); } } return r; }; } globalThis.__qaAbortPuts = ${on}; return globalThis.__qaAbortPuts; })()`, as);
  const keep = (as) => SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, func: () => { const m = globalThis.__lcInkKeep; if (!m) return null; return Array.from(m.values()).map((h) => ({ status: h.status, reason: h.reason || null, copy: h.target ? { id: h.target.id, reason: h.target.reason, forked_from: h.target.forked_from } : null, mainWritable: h.mainWritable, visible: h.ink && h.ink.visible ? h.ink.visible.length : null })); } }); return r.result; })()`, as);
  const now = (as) => SW(`new Date().toISOString()`, as);
  const spyInstall = SW(`(() => { if (globalThis.__qaMsgs) return 'already'; globalThis.__qaMsgs = []; chrome.runtime.onMessage.addListener((m, sender) => { globalThis.__qaMsgs.push({ type: m && m.type, at: new Date().toISOString() }); return false; }); return 'installed'; })()`, 'spy');
  const spyAll = (as) => SW(`(globalThis.__qaMsgs ? { total: globalThis.__qaMsgs.length, types: Array.from(new Set(globalThis.__qaMsgs.map((m) => m.type))) } : { lost: true })`, as);
  /** The toolbar hint the user actually sees (rendered text in the probe's closed shadow root). */
  const hintSeen = (as) => ({ domSearch: 'span.hint', as });
  const dir = (as) => ({ dirList: 'dl', as });
  const where = (as) => E(`({ href: location.href, probe: !!document.querySelector('[data-lc-web-probe]') })`, as);
  const CONF = `${PAGE}?qa=rec-conflict`;
  const BAD = `${PAGE}?qa=rec-unreadable-at-load`;
  const LATE = `${PAGE}?qa=rec-unreadable-after-load`;
  const STOPA = `${PAGE}?qa=rec-late-stop`;
  const ADDR = `${PAGE}?qa=rec-late-address`;
  const FAIL = `${PAGE}?qa=rec-commit-failure`;
  const FAILC = `${PAGE}?qa=rec-fallback-failure`;
  const IR2 = `${PAGE}?qa=rec-ir2`;
  const TITLE = 'Linear Algebra · Lecture 7: Eigenvalues (synthetic course page)';
  const ir2Probe = (id, as) => SW(`(async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: ${A}, frameIds: [0] }, args: [${JSON.stringify(id)}], func: async (id) => {
      const s = globalThis.__lcCompanion.state(); const sha = s.ink.page.address_sha256;
      const loaded = await chrome.runtime.sendMessage({ type: 'lc-ink-load/v1', address_sha256: sha });
      const copy = { id, reason: 'conflict', created_at: new Date().toISOString(), forked_from: null, forked_at: 0, kind: 'lc-web-ink/v1', doc: { format: 'x' }, extra: 1 };
      const answer = await chrome.runtime.sendMessage({ type: 'lc-ink-save/v1', doc: loaded.doc, copy });
      return { loadedOk: !!(loaded && loaded.ok && loaded.doc), sent: { ...copy, doc: '{format:x}' }, answer }; } }); return r.result; })()`, as);

  return [
    { cdpBrowser: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: '%QA_DOWNLOADS%', eventsEnabled: false }, as: 'downloadBehavior' },
    h.installWrapper,
    spyInstall,

    // ===== C: ordinary conflict between two real tabs; the refused work is kept, reopened and edited =====
    { cdp: 'Page.navigate', params: { url: CONF } },
    sleep(1500),
    ...trigger('cStarted'),
    SW(`(async () => (globalThis.__qaA = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id))()`, 'tabA'),
    sleep(600),
    ...writeMouse,
    ...row(Y1),
    ink('cA1'),
    SW(`(async () => (globalThis.__qaB = (await chrome.tabs.create({ url: ${JSON.stringify(CONF)}, active: true })).id))()`, 'tabB'),
    sleep(1800),
    { eval: `(document.title = 'qa-tab-b', document.title)`, as: 'titledB', other: CONF },
    sleep(400),
    { triggerAction: true, as: 'cStartedB', url: CONF, title: 'qa-tab-b' },
    sleep(900),
    { eval: `(document.title = ${JSON.stringify(TITLE)}, document.title)`, as: 'untitledB', other: CONF },
    ink('cB0', B),
    ...h.pressOn('WRITE', B, CONF),
    ...h.pressOn('INK_MOUSE', B, CONF),
    ...row(Y2, CONF),
    ink('cB1', B),
    SW(`chrome.tabs.update(${A}, { active: true }).then(() => true)`, 'backToA'),
    sleep(800),
    ...row(Y3, undefined, 900),
    ink('cA2'),
    ...row(Y4),
    ink('cA3'),
    idb('dbConf1'),
    shot('rec-01-conflict-copy'),
    SW(`chrome.tabs.remove(${B}).then(() => true)`, 'closedB'),
    sleep(500),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('cReloaded'),
    sleep(900),
    ink('cReopen'),
    shot('rec-02-reopen-main'),
    ...writeMouse,
    ...press('INK_COPIES'),
    sleep(900),
    ink('cShowCopy'),
    shot('rec-03-copy-shown'),
    ...press('INK_ERASER'),
    ...eraseAt(1000, Y3),
    ...press('INK_PEN'),
    ...row(Y5),
    ink('cEdited'),
    idb('dbConf2'),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('cReloaded2'),
    sleep(900),
    ink('cReopen2'),
    ...press('WRITE'),
    ...press('INK_COPIES'),
    sleep(900),
    ink('cShowCopy2'),

    // ===== U: unreadable at load (FORGED before the page opens it) =====
    forgeMain(BAD, `{ format: 'not-lc-web-ink', note: 'QA forged unreadable record' }`, 'badKey'),
    idb('dbBad0'),
    { cdp: 'Page.navigate', params: { url: BAD } },
    sleep(1500),
    ...trigger('bStarted'),
    sleep(900),
    ink('bLoaded'),
    ...writeMouse,
    ...row(Y1),
    ink('bDrawn'),
    idb('dbBad1'),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('bReloaded'),
    sleep(900),
    ink('bReopen'),
    ...writeMouse,
    ...row(Y2),
    ink('bEdited'),
    idb('dbBad2'),

    // ===== L: main, then copy, made unreadable AFTER load (FORGED) =====
    { cdp: 'Page.navigate', params: { url: LATE } },
    sleep(1500),
    ...trigger('lStarted'),
    sleep(900),
    ...writeMouse,
    ...row(Y1),
    ink('lSaved'),
    corruptMain(LATE, 'lateMainKey'),
    idb('dbLate0'),
    ...row(Y2, undefined, 900),
    ink('lAfterMain'),
    idb('dbLate1'),
    shot('rec-04-main-unreadable-after-load'),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('lReloaded'),
    sleep(900),
    ink('lReopen'),
    ...writeMouse,
    ...press('INK_ERASER'),
    ...eraseAt(1000, Y1),
    ...press('INK_PEN'),
    ...row(Y3),
    ink('lEdited'),
    idb('dbLate2'),
    corruptTargetCopy('lateCopyKey'),
    idb('dbLate3'),
    ...row(Y4, undefined, 900),
    ink('lAfterCopy'),
    idb('dbLate4'),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('lReloaded2'),
    sleep(900),
    ink('lReopen2'),
    ...writeMouse,
    ...row(Y5),
    ink('lEdited2'),
    idb('dbLate5'),
    shot('rec-05-copy-unreadable-after-load'),

    // ===== S: the refusal arrives after Stop (HELD real transaction) =====
    { cdp: 'Page.navigate', params: { url: STOPA } },
    sleep(1500),
    ...trigger('sStarted'),
    sleep(900),
    ...writeMouse,
    ...row(Y1),
    ink('sSaved'),
    idb('dbStop0'),
    holdCorrupt(STOPA, 'stopHold'),
    sleep(200),
    ...row(Y2, undefined, 300),
    ink('sPending'),
    now('sStopAt'),
    ...trigger('sStopped'),
    ink('sAfterStop'),
    keep('sKeepPending'),
    release('stopReleased'),
    sleep(1800),
    keep('sKeepAfter'),
    idb('dbStop1'),
    ...trigger('sRestarted'),
    sleep(900),
    ink('sReopen'),

    // ===== A: the refusal arrives after an address change (HELD real transaction) =====
    { cdp: 'Page.navigate', params: { url: ADDR } },
    sleep(1500),
    ...trigger('aStarted'),
    sleep(900),
    ...writeMouse,
    ...row(Y1),
    ink('aSaved'),
    idb('dbAddr0'),
    holdCorrupt(ADDR, 'addrHold'),
    sleep(200),
    ...row(Y2, undefined, 300),
    ink('aPending'),
    now('aPushAt'),
    E(`(history.pushState(null, '', ${JSON.stringify(`${ADDR}-away`)}), location.href)`, 'aAwayHref'),
    sleep(1400),
    ink('aAway'),
    keep('aKeepPending'),
    release('addrReleased'),
    sleep(1800),
    keep('aKeepAfter'),
    ink('aAwayAfter'),
    hintSeen('aAwayHintSeen'),
    idb('dbAddr1'),
    E(`(history.replaceState(null, '', ${JSON.stringify(ADDR)}), location.href)`, 'aBackHref'),
    sleep(1600),
    ink('aBack'),

    // ===== F: INJECTED transaction failure; real Export downloads =====
    { cdp: 'Page.navigate', params: { url: FAIL } },
    sleep(1500),
    ...trigger('fStarted'),
    sleep(900),
    ...writeMouse,
    ...row(Y1),
    ink('fSaved'),
    idb('dbFail0'),
    abortPuts(true, 'abortOn'),
    ...row(Y2, undefined, 900),
    ink('fFailed'),
    idb('dbFail1'),
    shot('rec-06-failed-export-shown'),
    ...press('INK_EXPORT'),
    now('export0At'),
    sleep(2500),
    dir('dlAfterExport0'),
    where('fAfterExport0'),
    ink('fExported'),
    toolbarPoint('INK_EXPORT', 'tbExportStop'),
    now('exportStopClickAt'),
    ...clickAt('tbExportStop').slice(0, -1),
    { triggerAction: true, as: 'fStoppedAfterExport' },
    now('stopExportAt'),
    sleep(700),
    ink('fAfterStop'),
    sleep(1800),
    dir('dlAfterStopExport'),
    keep('fKeepAfterStop'),
    ...trigger('fRestarted'),
    sleep(1200),
    ink('fRestored'),
    ...press('WRITE'),
    ink('fRestoredWrite'),
    ...press('INK_EXPORT'),
    now('export1At'),
    sleep(58600),
    ...press('INK_EXPORT'),
    now('export2At'),
    sleep(3000),
    dir('dlAfterDeadline'),
    where('fAfterDeadline'),
    abortPuts(false, 'abortOff'),
    ...press('INK_MOUSE'),
    ...row(Y3, undefined, 900),
    ink('fRecovered'),
    idb('dbFail2'),

    // ===== FC: unreadable main + the fallback copy's commit fails (FORGED + INJECTED) =====
    { cdp: 'Page.navigate', params: { url: FAILC } },
    sleep(1500),
    ...trigger('gStarted'),
    sleep(900),
    ...writeMouse,
    ...row(Y1),
    ink('gSaved'),
    corruptMain(FAILC, 'fcMainKey'),
    idb('dbFc0'),
    abortPuts(true, 'abortOn2'),
    ...row(Y2, undefined, 1200),
    ink('gFailed'),
    idb('dbFc1'),
    abortPuts(false, 'abortOff2'),
    ...row(Y3, undefined, 1200),
    ink('gRecovered'),
    idb('dbFc2'),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('gReloaded'),
    sleep(900),
    ink('gReopen'),

    // ===== IR2: a malformed copy description with extra keys, real sender (focused probe) =====
    { cdp: 'Page.navigate', params: { url: IR2 } },
    sleep(1500),
    ...trigger('iStarted'),
    sleep(900),
    ...writeMouse,
    ...row(Y1),
    ink('iSaved'),
    ir2Probe('00112233445566aa', 'ir2Extra'),
    idb('dbIr2Mid'),
    ir2Probe('ABCDEF0123456789', 'ir2Upper'),
    idb('dbIr2'),
    { cdp: 'Page.reload', params: {} },
    sleep(1800),
    ...trigger('iReloaded'),
    sleep(900),
    ink('iReopen'),
    capLog('capturesAll'),
    spyAll('messagesAll'),
    E('navigator.userAgent', 'userAgent'),
  ];
}
