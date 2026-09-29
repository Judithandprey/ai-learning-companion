#!/usr/bin/env node
// P0-07 desktop operation check of the document preview (owned page, early fallback).
// Trusted CDP input on Edge headless (Windows side, via cdp-runner.ps1): the real
// file chooser result (DOM.setFileInputFiles) opens a real UTF-8 file from disk,
// a mouse drag selects text in ASK mode, text and the token are typed, and buttons
// are clicked. Three runs:
//   - default page, no API running and no token: nothing can be registered or saved;
//   - `?store=test-double`: the labeled in-page test double exercises failed save,
//     retry, an unknown outcome, close, a UI rebuild from the store and reopen;
//   - the real local preview API (document-preview.0.1.0) at the released backend
//     commit, on the dedicated local PostgreSQL test database: connect, save, API
//     stopped during a save, restart with a new token, reconnect, page reload, API
//     restart, reopen, plus a direct server readback. Stop/restart happen at set
//     points through the check server's /__control endpoint (never in the launcher).
// Secrets: the test database DSN and the per-run tokens go only into the API
// process environment and the browser steps file (deleted with the run's temporary
// profile); the report and log record neither. The API run needs the local test
// database handoff; without it the run is reported BLOCKED, never as a pass.
// Desktop headless only; not Safari, iPad or Pencil evidence; no AI provider.
//
// Usage: node scripts/preview-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <prefix>]

import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './fixture-server.mjs';
import { E, clickAt, drag, runCdp, shot, sleep, typeText } from './cdp-harness.mjs';
import { API_COMMIT, newToken, prepareApi } from './preview-api.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const browser = args.browser;
if (!browser || !browser.startsWith('/mnt/')) {
  console.error('missing --browser <Windows browser executable under /mnt/...>');
  process.exit(2);
}
const prefix = (args.run ?? 'p0-07-preview').replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
let redact = (text) => String(text);
const note = (line) => {
  const safe = redact(line);
  log.push(`${new Date().toISOString()} ${safe}`);
  console.log(safe);
};

// A real, non-fixture study document: BOM, CRLF and LF lines, blank-line paragraphs,
// markup that must stay inert, Chinese, math symbols, an emoji and a combining accent.
const SAMPLE = [
  '﻿# Linear algebra notes — 线性代数笔记\r\n',
  '\r\n',
  'Let A be a 2×2 matrix with eigenvalues λ₁ = 2 and λ₂ = 3.\n',
  'Then trace(A²) = λ₁² + λ₂² = 13, because A² has eigenvalues λ₁² and λ₂².\n',
  '\n',
  '特征值的平方和等于 trace(A²)。这是我自己的笔记，不是课程原文。\n',
  '\n\n',
  'Markup stays text: <script>window.__pwned = 1</script> <img src=x onerror="window.__pwned = 2"> <b>bold?</b> &amp; 🙂 café (café)\n',
  '\t- last line without a newline',
].join('');
const BAD = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]); // "café" in Latin-1: not UTF-8
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// The user's own words typed in the real API run (exact text is compared on readback).
const REQUEST_1 = 'Why is trace(A²) = 13?  为什么？ ';
const NOTE_1 = 'My note: λ₁² + λ₂² = 4 + 9.\nSecond line 🙂';
const NOTE_2 = 'Typed while the API was stopped. 我的笔记 ';

const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
const docDirUnix = join(execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim(), `lc-web-preview-docs-${process.pid}`);
const toWin = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();

const api = 'window.__lcPreview';
/** Full page state plus the SHA-256 of the rendered document text, computed in the page. */
const state = (as) =>
  E(
    `(async () => { const s = ${api}.state(); const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.renderedText)); return { ...s, renderedText: undefined, renderedSha: Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join(''), pwned: window.__pwned ?? null, storeKind: ${api}.store.kind, itemCount: ${api}.testStore ? ${api}.testStore.itemCount() : null }; })()`,
    as,
  );
/** Polls the page state until `cond` (an expression over `s`) holds; returns whether it did. */
const waitFor = (cond, as, ms = 25000) =>
  E(`(async () => { const end = Date.now() + ${ms}; for (;;) { const s = ${api}.state(); if (${cond}) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 100)); } })()`, as);
const center = (selector) => `(() => { const e = document.querySelector('${selector}'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
const toolbar = (mode) => [E(`(() => { const r = ${api}.probe.toolbarRects()['${mode}']; return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`, `tb${mode}`), ...clickAt(`tb${mode}`)];
/** Mouse path across a phrase inside the document text (native text selection). */
const sweep = (phrase, as, n = 6) =>
  E(
    `(() => { const doc = document.getElementById('document'); const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); for (let t = w.nextNode(); t; t = w.nextNode()) { const i = t.textContent.indexOf(${JSON.stringify(phrase)}); if (i < 0) continue; const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + ${JSON.stringify(phrase)}.length); t.parentElement.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); const out = {}; for (let k = 0; k <= ${n}; k++) { out['x' + k] = q.left + 1 + ((q.width - 2) * k) / ${n}; out['y' + k] = q.top + q.height / 2; } return out; } return null; })()`,
    as,
  );
const click = (selector, as) => [E(center(selector), as), ...clickAt(as)];
const open = (winPath) => [{ files: [winPath], selector: '#open-file' }, sleep(700)];
const ask = (phrase, as, n) => [...toolbar('ASK'), sweep(phrase, as, n), ...drag(as, n, 'mouse'), sleep(700)];

function unconnectedSteps(url, goodPath, badPath) {
  return [
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    state('u0'),
    ...open(badPath),
    state('uBad'),
    ...open(goodPath),
    state('uOpened'),
    shot(`${prefix}-unconnected-00-opened`),
    ...ask('trace(A²)', 'uPath', 6),
    state('uAsk'),
    shot(`${prefix}-unconnected-01-ask`),
  ];
}

function testDoubleSteps(url, goodPath) {
  return [
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    state('t0'),
    ...open(goodPath),
    state('tOpened'),
    // 1. explicit ASK: native mouse selection in the document
    ...ask('trace(A²)', 'tPath', 6),
    state('tAsk'),
    shot(`${prefix}-test-double-00-ask`),
    // 2. the user's own note, then a save the store refuses, then a retry
    ...click('#note', 'noteBox'),
    ...typeText('Why is it 13?  我的问题：为什么是 13？\nSecond line.'),
    // before the first save: a second ASK must not replace the selection or clear the typed note
    ...ask('eigenvalues', 'tPathDraft', 4),
    state('tDraftKept'),
    E(`${api}.testStore.failNext('save', 'reject')`, 'inject1'),
    ...click('#save', 'saveBtn'),
    sleep(400),
    state('tFailed'),
    shot(`${prefix}-test-double-01-save-failed`),
    // a new selection while the item is unsaved is not added (the unsaved item is kept for retry)
    ...ask('eigenvalues', 'tPathBlocked', 4),
    state('tBlocked'),
    ...click('#retry-save', 'retryBtn'),
    sleep(400),
    state('tCommitted'),
    // 3. a second selection whose save answer is lost: unknown, then an idempotent retry
    ...ask('特征值的平方和', 'tPath2', 4),
    state('tAsk2'),
    ...click('#note', 'noteBox2'),
    ...typeText('Chinese sentence, my own words.'),
    E(`${api}.testStore.failNext('save', 'lost_response')`, 'inject2'),
    ...click('#save', 'saveBtn2'),
    sleep(400),
    state('tUnknown'),
    shot(`${prefix}-test-double-02-outcome-unknown`),
    ...click('#retry-save', 'retryBtn2'),
    sleep(400),
    state('tCommitted2'),
    // 4. close, rebuild the UI from the same store, reopen the first item
    ...click('#close-doc', 'closeBtn'),
    sleep(300),
    state('tClosed'),
    E(`${api}.restartUi()`, 'restart'),
    sleep(500),
    state('tRestarted'),
    ...click('ul.saved li:nth-child(1) button', 'reopenBtn'),
    sleep(700),
    state('tReopened'),
    shot(`${prefix}-test-double-03-reopened`),
  ];
}

/**
 * Real API run. `t` holds the per-run tokens; `ctl(action)` is the check server's
 * control URL that stops or restarts the API process at that point of the run.
 */
function apiSteps(url, goodPath, t, ctl) {
  const connect = (token, as) => [...click('#api-token', `${as}Field`), ...typeText(token), ...click('#connect', `${as}Btn`), waitFor(`s.api.status !== 'connecting'`, `${as}Done`), sleep(300)];
  const control = (action, as) => E(`fetch(${JSON.stringify(ctl(action))}, { method: 'POST' }).then((r) => r.status)`, as);
  const settled = (as) => waitFor(`s.attempt && s.attempt.status !== 'saving'`, as);
  // After an API restart, wait until this browser reaches it again (any answer; 2 s per try). Through the
  // Windows-to-WSL loopback relay the first request after a restart once went unanswered for the page's
  // whole 20 s timeout; the page reported that correctly as unknown, but the check needs a fixed sequence.
  const reachable = (as) =>
    E(
      `(async () => { const start = Date.now(); for (let tries = 1; Date.now() - start < 30000; tries++) { const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 2000); try { await fetch('http://127.0.0.1:8174/openapi.json', { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: abort.signal }); return { ok: true, tries, ms: Date.now() - start }; } catch { await new Promise((r) => setTimeout(r, 250)); } finally { clearTimeout(timer); } } return { ok: false, ms: Date.now() - start }; })()`,
      as,
    );
  // Where could the token be found by the page, its storage or its address? Only booleans are recorded.
  const scan = (token, as) =>
    E(
      `(() => { const t = ${JSON.stringify(token)}; const field = document.getElementById('api-token'); return { dom: document.documentElement.outerHTML.includes(t), field: field.value.includes(t), url: location.href.includes(t), localStorage: JSON.stringify(Object.entries(localStorage)).includes(t), sessionStorage: JSON.stringify(Object.entries(sessionStorage)).includes(t), cookie: document.cookie.includes(t), pageState: JSON.stringify(${api}.state()).includes(t), history: history.length > 0 && location.href.includes(t) }; })()`,
      as,
    );
  return [
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    state('a0'),
    // A document opened before connecting is not registered; nothing is sent.
    ...open(goodPath),
    state('aOpened'),
    ...connect(t.wrong, 'cWrong'),
    state('aWrong'),
    ...connect(t.first, 'c1'),
    waitFor(`s.sourceState === 'registered' || s.sourceState === 'failed'`, 'regDone'),
    state('aConnected'),
    scan(t.first, 'scan1'),
    shot(`${prefix}-api-00-connected`),
    // Item 1: ASK, the user's own request and note, save.
    ...ask('trace(A²)', 'aPath1', 6),
    state('aAsk'),
    ...click('#request-text', 'rqBox'),
    ...typeText(REQUEST_1),
    ...click('#note', 'ntBox'),
    ...typeText(NOTE_1),
    ...click('#save', 'save1'),
    settled('save1Done'),
    state('aSaved1'),
    shot(`${prefix}-api-01-saved`),
    // The identical request again through the page's own store (as a retry after a lost answer would send it).
    E(`(async () => { const p = ${api}.attemptPayload(); if (!p) return null; try { const r = await ${api}.store.save(p); return { note: p.item_id, duplicate: r.duplicate }; } catch (e) { return { note: p.item_id, error: String(e.message) }; } })()`, 'replay1'),
    // Item 2: the API process is stopped before the save is sent.
    ...ask('特征值的平方和', 'aPath2', 4),
    ...click('#note', 'ntBox2'),
    ...typeText(NOTE_2),
    control('stop', 'ctlStop'),
    ...click('#save', 'save2'),
    settled('save2Done'),
    state('aUnknown'),
    shot(`${prefix}-api-02-outcome-unknown`),
    // The API restarts with a new token: the retry is refused (401), the user reconnects and retries.
    control('start-second', 'ctlStart2'),
    reachable('reach2'),
    ...click('#retry-save', 'retry1'),
    settled('retry1Done'),
    state('aExpired'),
    ...connect(t.second, 'c2'),
    state('aReconnected'),
    ...click('#retry-save', 'retry2'),
    settled('retry2Done'),
    state('aSaved2'),
    scan(t.second, 'scan2'),
    // Reload the page (the token is gone with it), restart the API again, reconnect, reopen.
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    state('aReloaded'),
    control('restart-third', 'ctlRestart3'),
    reachable('reach3'),
    ...connect(t.second, 'cOld'),
    state('aOldToken'),
    ...connect(t.third, 'c3'),
    sleep(500),
    state('aListed'),
    ...click('ul.saved li:nth-child(1) button', 'reopen1'),
    waitFor(`s.document && s.document.reopened`, 'reopen1Done'),
    state('aReopened1'),
    shot(`${prefix}-api-03-reopened-after-restart`),
    ...click('ul.saved li:nth-child(2) button', 'reopen2'),
    sleep(1200),
    state('aReopened2'),
    scan(t.third, 'scan3'),
  ];
}

function evaluate(u, t, expected) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed: observed ?? null });
  const inert = (s) => s && s.pwned === null && s.renderedTags.every((tag) => tag === 'p' || tag === 'div');

  // Default page: the real API store, not connected (no API running, no token).
  c('preview.default_real_store_unconnected', 'the default page uses the real API store (not the test double), says it is not connected and lists nothing',
    u.u0?.storeKind === 'api' && u.u0?.api?.status === 'disconnected' && /not connected/.test(u.u0?.storeStatus ?? '') && u.u0?.savedItems.length === 0, { storeKind: u.u0?.storeKind, storeStatus: u.u0?.storeStatus });
  c('preview.invalid_utf8_refused', 'a Latin-1 file is refused as not UTF-8; nothing is opened or guessed', /not valid UTF-8/.test(u.uBad?.openStatus ?? '') && u.uBad?.document === null, { openStatus: u.uBad?.openStatus });
  c('preview.opens_exact_original', 'a real UTF-8 file opens; its SHA-256 and the SHA-256 of the rendered text both equal the file bytes (BOM, CRLF, markup, non-ASCII kept)',
    u.uOpened?.document?.sha256 === expected.sha && u.uOpened?.renderedSha === expected.sha && u.uOpened?.document?.byte_length === expected.bytes,
    { document: u.uOpened?.document, renderedSha: u.uOpened?.renderedSha, expected });
  c('preview.markup_inert', 'markup in the document is rendered as text: only p/div elements, no script ran, no handler fired', inert(u.uOpened), { tags: u.uOpened?.renderedTags, pwned: u.uOpened?.pwned });
  c('preview.unconnected_not_registered', 'registration fails honestly (API not connected) and nothing can be saved',
    u.uOpened?.sourceState === 'failed' && /not connected/.test(u.uOpened?.sourceStatus ?? '') && u.uOpened?.buttons.save === false, { sourceStatus: u.uOpened?.sourceStatus });
  c('preview.unconnected_ask_submits_nothing', 'an explicit ASK selection on an unregistered document submits nothing and the card says why',
    u.uAsk?.card?.badge === 'Source not registered' && /not registered/.test(u.uAsk?.card?.body ?? '') && u.uAsk?.selectedText === null,
    { card: u.uAsk?.card, selectedText: u.uAsk?.selectedText });

  // Test double: save, retry, unknown outcome, close, rebuild, reopen.
  c('preview.test_double_labeled', 'the test double is opt-in and says it is not persistent storage', t.t0?.storeKind === 'test_double' && /TEST DOUBLE/.test(t.t0?.storeStatus ?? ''), { storeKind: t.t0?.storeKind });
  c('preview.registered_source', 'the opened document is registered as a source version', t.tOpened?.sourceState === 'registered' && /^src_/.test(t.tOpened?.source?.source_id ?? ''), { source: t.tOpened?.source });
  c('preview.ask_request_state', 'a mouse selection in ASK mode shows the selected text and the request state: no explanation, provider not connected (no fixture text)',
    /trace/.test(t.tAsk?.selectedText ?? '') && /no explanation generated/.test(t.tAsk?.requestState ?? '') && t.tAsk?.card?.badge === 'Provider unavailable',
    { selectedText: t.tAsk?.selectedText, requestState: t.tAsk?.requestState, card: t.tAsk?.card });
  c('preview.typed_note_kept_on_new_ask', 'before the first save, a second ASK is not added: the typed note and its selection stay, Close stays disabled, and the page says why (lead review of 9c1d070)',
    t.tDraftKept?.noteText === 'Why is it 13?  我的问题：为什么是 13？\nSecond line.' && /trace/.test(t.tDraftKept?.selectedText ?? '') && /save or discard your typed words/.test(t.tDraftKept?.notice ?? '') &&
      t.tDraftKept?.buttons.close === false && t.tDraftKept?.buttons.save === true && t.tDraftKept?.attempt === null && t.tDraftKept?.card?.hidden === true,
    { noteText: t.tDraftKept?.noteText, selectedText: t.tDraftKept?.selectedText, notice: t.tDraftKept?.notice, buttons: t.tDraftKept?.buttons, cardHidden: t.tDraftKept?.card?.hidden });
  c('preview.failed_save_honest', 'a refused save shows "Not saved", offers retry, stores nothing and keeps the document open',
    t.tFailed?.attempt?.status === 'failed' && /^Not saved/.test(t.tFailed?.saveStatus ?? '') && t.tFailed?.buttons.retry && !t.tFailed?.buttons.close && t.tFailed?.itemCount === 0,
    { saveStatus: t.tFailed?.saveStatus, buttons: t.tFailed?.buttons, itemCount: t.tFailed?.itemCount });
  c('preview.unsaved_item_kept', 'a new selection while an item is unsaved is not added; the unsaved item and its retry stay',
    /not added/.test(t.tBlocked?.notice ?? '') && t.tBlocked?.attempt?.item_id === t.tFailed?.attempt?.item_id && t.tBlocked?.buttons.retry && /trace/.test(t.tBlocked?.selectedText ?? ''),
    { notice: t.tBlocked?.notice, selectedText: t.tBlocked?.selectedText, attempt: t.tBlocked?.attempt });
  c('preview.retry_commits', 'retry of the same item commits it once', t.tCommitted?.attempt?.status === 'committed' && t.tCommitted?.itemCount === 1 && t.tCommitted?.attempt?.item_id === t.tFailed?.attempt?.item_id,
    { saveStatus: t.tCommitted?.saveStatus, itemCount: t.tCommitted?.itemCount });
  c('preview.unknown_then_idempotent', 'a lost answer shows an unknown outcome; retry reports the existing item and makes no duplicate',
    t.tUnknown?.attempt?.status === 'unknown' && /Outcome unknown/.test(t.tUnknown?.saveStatus ?? '') && t.tCommitted2?.attempt?.status === 'committed' && /no duplicate made/.test(t.tCommitted2?.saveStatus ?? '') && t.tCommitted2?.itemCount === 2,
    { unknown: t.tUnknown?.saveStatus, committed: t.tCommitted2?.saveStatus, itemCount: t.tCommitted2?.itemCount });
  c('preview.close_clears_view', 'closing the document clears it; the saved items stay listed', t.tClosed?.document === null && t.tClosed?.savedItems.length === 2, { savedItems: t.tClosed?.savedItems });
  c('preview.rebuild_lists_from_store', 'a UI rebuilt from the same store lists both items (store state, not page state)', t.tRestarted?.document === null && t.tRestarted?.savedItems.length === 2, { savedItems: t.tRestarted?.savedItems });
  const re = t.tReopened;
  c('preview.reopen_exact', 'reopen shows the stored original (SHA-256 of rendered text equals the file), its registered source, the saved selection, context and the note exactly as typed, with the AI state separate',
    re?.document?.reopened === true && re?.renderedSha === expected.sha && /match their SHA-256/.test(re?.openStatus ?? '') && /reopened from storage/.test(re?.sourceStatus ?? '') &&
      re?.source?.source_id === t.tOpened?.source?.source_id && (re?.reopened ?? '').includes('Why is it 13?  我的问题：为什么是 13？\nSecond line.') && /trace/.test(re?.reopened ?? '') && /provider unavailable/.test(re?.reopened ?? '') && inert(re),
    { openStatus: re?.openStatus, sourceStatus: re?.sourceStatus, renderedSha: re?.renderedSha, reopened: re?.reopened });
  return checks;
}

function evaluateApi(a, expected, identity, direct) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed: observed ?? null });
  const sameIdentity = (s) => s?.api?.session && s.api.session.user_id === identity.user_id && s.api.session.device_id === identity.device_id && s.api.session.session_id === identity.session_id;
  const noLeak = (scan) => scan && Object.values(scan).every((v) => v === false);
  const id1 = a.aSaved1?.attempt?.item_id;
  const id2 = a.aUnknown?.attempt?.item_id;

  c('preview.api.default_not_connected', 'the default page starts with the real API store, disconnected, and asks for the token to list items',
    a.a0?.storeKind === 'api' && a.a0?.api?.status === 'disconnected' && /Connect the local preview API/.test(a.a0?.savedStatus ?? ''), { api: a.a0?.api, savedStatus: a.a0?.savedStatus });
  c('preview.api.nothing_before_connect', 'a document opened before connecting is not registered ("not connected"; nothing sent)',
    a.aOpened?.sourceState === 'failed' && /not connected/.test(a.aOpened?.sourceStatus ?? ''), { sourceStatus: a.aOpened?.sourceStatus });
  c('preview.api.wrong_token_refused', 'a wrong token is refused by the API and the page stays disconnected',
    a.aWrong?.api?.status === 'disconnected' && /Not connected: .*refused/.test(a.aWrong?.api?.message ?? ''), { api: a.aWrong?.api });
  c('preview.api.identity_from_session', 'connecting reads the identity from GET /preview/v1/session and registers the already open document under it',
    a.aConnected?.api?.status === 'connected' && sameIdentity(a.aConnected) && a.aConnected?.sourceState === 'registered' && a.aConnected?.source?.user_id === identity.user_id,
    { api: a.aConnected?.api, source: a.aConnected?.source });
  c('preview.api.token_not_exposed', 'the token is found in none of: DOM, token field after connecting, address, localStorage, sessionStorage, cookies, page state (after each of three connections)',
    noLeak(a.scan1) && noLeak(a.scan2) && noLeak(a.scan3), { scan1: a.scan1, scan2: a.scan2, scan3: a.scan3 });
  c('preview.api.ask_request_state', 'an explicit ASK mouse selection shows the request with no explanation (provider unavailable) and suggests the title from the selection',
    /trace/.test(a.aAsk?.selectedText ?? '') && a.aAsk?.card?.badge === 'Provider unavailable' && a.aAsk?.title === 'trace(A²)', { selectedText: a.aAsk?.selectedText, card: a.aAsk?.card, title: a.aAsk?.title });
  c('preview.api.saved_server_committed', 'Save shows saved only after the API answers persistence server_committed',
    a.aSaved1?.attempt?.status === 'committed' && /server_committed/.test(a.aSaved1?.saveStatus ?? ''), { saveStatus: a.aSaved1?.saveStatus });
  c('preview.api.stopped_is_unknown', 'with the API process stopped, the save is "Outcome unknown" (not saved, not failed), the typed note stays, Retry is offered and Close is blocked',
    a.aUnknown?.attempt?.status === 'unknown' && /Outcome unknown/.test(a.aUnknown?.saveStatus ?? '') && a.aUnknown?.noteText === NOTE_2 && a.aUnknown?.buttons.retry && !a.aUnknown?.buttons.close,
    { saveStatus: a.aUnknown?.saveStatus, noteText: a.aUnknown?.noteText, buttons: a.aUnknown?.buttons });
  c('preview.api.saved_replay_no_duplicate', 'sending the identical save request again returns the API replay of the first commit (duplicate: true), not a second note',
    a.replay1?.note === id1 && a.replay1?.duplicate === true, { replay: a.replay1 });
  c('preview.api.reauth_after_restart', 'after the API restarts with a new token, the retry is refused (401); the outcome stays unknown (the first attempt could have committed) and the page asks to reconnect; reconnecting keeps the same identity and the retry of the same note commits',
    a.aExpired?.attempt?.status === 'unknown' && /Outcome still unknown: .*This retry was not applied: .*token/.test(a.aExpired?.saveStatus ?? '') && a.aExpired?.api?.status === 'expired' &&
      a.aReconnected?.api?.status === 'connected' && sameIdentity(a.aReconnected) && a.aSaved2?.attempt?.status === 'committed' && a.aSaved2?.attempt?.item_id === id2,
    { reachableAfterRestart: a.reach2, expired: a.aExpired?.saveStatus, api: a.aExpired?.api?.status, committed: a.aSaved2?.saveStatus });
  c('preview.api.reload_forgets_token', 'after a page reload the token is gone: disconnected, nothing listed until the user connects',
    a.aReloaded?.api?.status === 'disconnected' && a.aReloaded?.savedItems.length === 0 && /Connect/.test(a.aReloaded?.savedStatus ?? ''), { api: a.aReloaded?.api, savedStatus: a.aReloaded?.savedStatus });
  c('preview.api.old_token_refused', 'after another API restart the previous token is refused',
    a.aOldToken?.api?.status === 'disconnected' && /refused/.test(a.aOldToken?.api?.message ?? ''), { reachableAfterRestart: a.reach3, api: a.aOldToken?.api });
  c('preview.api.lists_saved_ids', "after reconnecting, both saved notes are listed from this browser's id list (no list endpoint)",
    a.aListed?.api?.status === 'connected' && JSON.stringify(a.aListed?.savedItems) === JSON.stringify([id1, id2]), { savedItems: a.aListed?.savedItems, expected: [id1, id2] });
  const r1 = a.aReopened1 ?? {};
  const t1 = r1.reopened ?? '';
  c('preview.api.reopen_exact_after_restart', 'item 1 (saved by API process 1) reopens from API process 3 after a page reload: the exact original (file SHA-256, rendered SHA-256, hash verified), the same source, selection, context, title, request and note exactly as typed, the note labeled a user note, AI state separate',
    r1.document?.reopened === true && r1.document?.sha256 === expected.sha && r1.renderedSha === expected.sha && /match their SHA-256/.test(r1.openStatus ?? '') &&
      r1.source?.source_id === a.aConnected?.source?.source_id && t1.includes(REQUEST_1) && t1.includes(NOTE_1) && t1.includes('trace(A²)') && /a user note, not an AI response/.test(t1) &&
      /authorship user/.test(t1) && /provider unavailable/.test(t1) && r1.pwned === null,
    { openStatus: r1.openStatus, sourceStatus: r1.sourceStatus, renderedSha: r1.renderedSha, reopened: t1 });
  const t2 = a.aReopened2?.reopened ?? '';
  c('preview.api.reopen_second', 'item 2 (retried after the stop) reopens with its note exactly as typed, on the same source',
    a.aReopened2?.document?.sha256 === expected.sha && t2.includes(NOTE_2) && a.aReopened2?.source?.source_id === a.aConnected?.source?.source_id, { reopened: t2 });
  const d1 = direct?.item1;
  const d2 = direct?.item2;
  const bytes = (b64) => Buffer.from(b64 ?? '', 'base64');
  c('preview.api.server_readback_direct', 'read directly from the API (outside the browser): full source bytes equal the file, DOM bytes hash to the frame hash, user text exact, provider_unavailable, note authorship user',
    d1?.status === 200 && sha(bytes(d1.body.content_base64)) === expected.sha && sha(bytes(d1.body.frame_bytes_base64)) === d1.body.frame.content_hash &&
      d1.body.request_text === REQUEST_1 && d1.body.user_note === NOTE_1 && d1.body.ai_status === 'provider_unavailable' && d1.body.note.authorship === 'user' &&
      d2?.status === 200 && d2.body.user_note === NOTE_2 && d2.body.request_text === '' && sha(bytes(d2.body.content_base64)) === expected.sha,
    {
      item1: d1 ? { status: d1.status, source: d1.body && { ...d1.body.source, text: `(${d1.body.source.text.length} UTF-16 units; bytes compared above)` }, filename: d1.body?.filename, frame_hash: d1.body?.frame?.content_hash, note: d1.body && { kind: d1.body.note.kind, authorship: d1.body.note.authorship, revision: d1.body.note.revision, title: d1.body.note.title }, observation_actor: d1.body?.observation?.actor } : null,
      item2: d2 ? { status: d2.status } : null,
    });
  return checks;
}

async function runApi(base, goodWin, expected) {
  const control = randomBytes(16).toString('hex');
  const prepared = await prepareApi({ moduleDir: MODULE, uiOrigin: `http://127.0.0.1:${PORT}`, note });
  if ('blocked' in prepared) return { blocked: prepared.blocked };
  redact = prepared.redact;
  const t = { wrong: newToken(), first: newToken(), second: newToken(), third: newToken() };
  Object.values(t).forEach(prepared.addSecret);
  try {
    await prepared.start(t.first);
    const actions = {
      stop: () => prepared.stop(),
      'start-second': () => prepared.start(t.second),
      'restart-third': async () => {
        await prepared.stop();
        await prepared.start(t.third);
      },
    };
    const result = await runCdp({
      moduleDir: MODULE,
      browser,
      run: `${prefix}-api`,
      outDir,
      steps: apiSteps(base, goodWin, t, (action) => `/__control/${action}?token=${control}`),
      note,
      server: {
        controlToken: control,
        control: async (action) => {
          note(`control: ${action}`);
          if (!actions[action]) throw new Error(`unknown action ${action}`);
          await actions[action]();
        },
      },
    });
    const values = result.values ?? {};
    const direct = {
      item1: values.aSaved1?.attempt ? await prepared.readback(values.aSaved1.attempt.item_id, t.third) : null,
      item2: values.aUnknown?.attempt ? await prepared.readback(values.aUnknown.attempt.item_id, t.third) : null,
    };
    return { result, checks: evaluateApi(values, expected, prepared.identity, direct), identity: prepared.identity, database: prepared.database, hostKind: prepared.hostKind };
  } finally {
    await prepared.close();
  }
}

async function main() {
  mkdirSync(docDirUnix, { recursive: true });
  const good = join(docDirUnix, 'linear-algebra-notes.md');
  const bad = join(docDirUnix, 'latin1-notes.txt');
  writeFileSync(good, SAMPLE, 'utf8');
  writeFileSync(bad, BAD);
  const expected = { sha: sha(Buffer.from(SAMPLE, 'utf8')), bytes: Buffer.byteLength(SAMPLE, 'utf8') };
  const base = `http://127.0.0.1:${PORT}/preview/`;
  note(`document ${good} (${expected.bytes} bytes, sha256 ${expected.sha})`);
  try {
    const u = await runCdp({ moduleDir: MODULE, browser, run: `${prefix}-unconnected`, outDir, steps: unconnectedSteps(base, toWin(good), toWin(bad)), note });
    const t = await runCdp({ moduleDir: MODULE, browser, run: `${prefix}-test-double`, outDir, steps: testDoubleSteps(`${base}?store=test-double`, toWin(good)), note });
    const a = await runApi(base, toWin(good), expected);
    const checks = [
      ...evaluate(u.values ?? {}, t.values ?? {}, expected),
      ...(a.blocked
        ? [{ id: 'preview.api.run', description: 'real local preview API run', pass: false, status: 'blocked', observed: { reason: a.blocked } }]
        : a.checks),
    ];
    const failed = checks.filter((x) => !x.pass).map((x) => x.id);
    const runnerErrors = [...(u.errors ?? []), ...(t.errors ?? []), ...(a.result?.errors ?? [])];
    const report = {
      kind: 'lc-web-p0-07-preview/v1',
      scope:
        'Owned desktop page (early fallback), Edge headless on Windows via WSL2, trusted CDP input. Runs: default page with no API; the labeled in-page test double (page memory, not persistence); ' +
        `the real local preview API (document-preview.0.1.0, backend ${API_COMMIT}) on the dedicated local PostgreSQL test database, with API process stop/restart and a page reload. ` +
        'Not Safari, iPad, Pencil, a course page or an AI provider; token expiry by time was not waited for (a restarted API with a new token gives the same 401 path).',
      document: { name: 'linear-algebra-notes.md', ...expected },
      api: a.blocked
        ? { status: 'blocked', reason: a.blocked }
        : { status: 'ran', backend_commit: API_COMMIT, identity: a.identity, database: a.database, database_host: a.hostKind, dsn: 'not recorded' },
      summary: { total: checks.length, passed: checks.length - failed.length, failed },
      checks,
      runner_errors: runnerErrors,
      screenshots: [...(u.screenshots ?? []), ...(t.screenshots ?? []), ...(a.result?.screenshots ?? [])],
      values: { unconnected: u.values ?? {}, test_double: t.values ?? {}, api: a.result?.values ?? {} },
    };
    writeFileSync(join(outDir, `${prefix}.json`), `${redact(JSON.stringify(report, null, 2))}\n`);
    writeFileSync(join(outDir, `${prefix}.log`), `${log.join('\n')}\n`);
    note(`preview checks passed ${checks.length - failed.length}/${checks.length}; failed: ${failed.join(', ') || 'none'}; runner errors: ${runnerErrors.length}${a.blocked ? `; API run BLOCKED: ${a.blocked}` : ''}`);
    process.exitCode = failed.length === 0 && runnerErrors.length === 0 ? 0 : 1;
  } finally {
    rmSync(docDirUnix, { recursive: true, force: true });
  }
}

await main();
