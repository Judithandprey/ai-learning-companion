#!/usr/bin/env node
// P0-07 desktop operation check of the document preview (owned page, early fallback).
// Trusted CDP input on Edge headless (Windows side, via cdp-runner.ps1): the real
// file chooser result (DOM.setFileInputFiles) opens a real UTF-8 file from disk,
// a mouse drag selects text in ASK mode, the note is typed, and buttons are clicked.
// Two runs:
//   - default page: storage is not connected, so nothing can be registered or saved;
//   - `?store=test-double`: the labeled in-page test double exercises failed save,
//     retry, an unknown outcome, close, a UI rebuild from the store and reopen.
// The test double is not persistent storage; no backend, database or API restart is
// involved. Desktop headless only; not Safari, iPad or Pencil evidence.
//
// Usage: node scripts/preview-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <prefix>]

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './fixture-server.mjs';
import { E, clickAt, drag, runCdp, shot, sleep, typeText } from './cdp-harness.mjs';

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
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
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
    ...toolbar('ASK'),
    sweep('trace(A²)', 'uPath'),
    ...drag('uPath', 6, 'mouse'),
    sleep(600),
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
    ...toolbar('ASK'),
    sweep('trace(A²)', 'tPath'),
    ...drag('tPath', 6, 'mouse'),
    sleep(700),
    state('tAsk'),
    shot(`${prefix}-test-double-00-ask`),
    // 2. the user's own note, then a save the store refuses, then a retry
    ...click('#note', 'noteBox'),
    ...typeText('Why is it 13?  我的问题：为什么是 13？\nSecond line.'),
    // before the first save: a second ASK must not replace the selection or clear the typed note
    ...toolbar('ASK'),
    sweep('eigenvalues', 'tPathDraft', 4),
    ...drag('tPathDraft', 4, 'mouse'),
    sleep(600),
    state('tDraftKept'),
    E(`${api}.testStore.failNext('save', 'reject')`, 'inject1'),
    ...click('#save', 'saveBtn'),
    sleep(400),
    state('tFailed'),
    shot(`${prefix}-test-double-01-save-failed`),
    // a new selection while the item is unsaved is not added (the unsaved item is kept for retry)
    ...toolbar('ASK'),
    sweep('eigenvalues', 'tPathBlocked', 4),
    ...drag('tPathBlocked', 4, 'mouse'),
    sleep(600),
    state('tBlocked'),
    ...click('#retry-save', 'retryBtn'),
    sleep(400),
    state('tCommitted'),
    // 3. a second selection whose save answer is lost: unknown, then an idempotent retry
    ...toolbar('ASK'),
    sweep('特征值的平方和', 'tPath2', 4),
    ...drag('tPath2', 4, 'mouse'),
    sleep(700),
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
    E(`(() => { const b = document.querySelector('ul.saved button'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`, 'reopenBtn'),
    ...clickAt('reopenBtn'),
    sleep(700),
    state('tReopened'),
    shot(`${prefix}-test-double-03-reopened`),
  ];
}

function evaluate(u, t, expected) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed: observed ?? null });
  const inert = (s) => s && s.pwned === null && s.renderedTags.every((tag) => tag === 'p' || tag === 'div');

  // Default page: storage not connected.
  c('preview.unconnected_says_so', 'the default page states that storage is not connected and lists nothing', u.u0?.storeKind === 'unconnected' && u.u0?.savedItems.length === 0, { storeKind: u.u0?.storeKind });
  c('preview.invalid_utf8_refused', 'a Latin-1 file is refused as not UTF-8; nothing is opened or guessed', /not valid UTF-8/.test(u.uBad?.openStatus ?? '') && u.uBad?.document === null, { openStatus: u.uBad?.openStatus });
  c('preview.opens_exact_original', 'a real UTF-8 file opens; its SHA-256 and the SHA-256 of the rendered text both equal the file bytes (BOM, CRLF, markup, non-ASCII kept)',
    u.uOpened?.document?.sha256 === expected.sha && u.uOpened?.renderedSha === expected.sha && u.uOpened?.document?.byte_length === expected.bytes,
    { document: u.uOpened?.document, renderedSha: u.uOpened?.renderedSha, expected });
  c('preview.markup_inert', 'markup in the document is rendered as text: only p/div elements, no script ran, no handler fired', inert(u.uOpened), { tags: u.uOpened?.renderedTags, pwned: u.uOpened?.pwned });
  c('preview.unconnected_not_registered', 'registration fails honestly (storage not connected) and nothing can be saved',
    u.uOpened?.sourceState === 'failed' && /not connected/.test(u.uOpened?.sourceStatus ?? '') && u.uOpened?.buttons.save === false, { sourceStatus: u.uOpened?.sourceStatus });
  c('preview.unconnected_ask_submits_nothing', 'an explicit ASK selection on an unregistered document submits nothing and the card says why',
    u.uAsk?.card?.badge === 'Source not registered' && /not registered/.test(u.uAsk?.card?.body ?? '') && u.uAsk?.selectedText === null,
    { card: u.uAsk?.card, selectedText: u.uAsk?.selectedText });

  // Test double: save, retry, unknown outcome, close, rebuild, reopen.
  c('preview.test_double_labeled', 'the test double is opt-in and says it is not persistent storage', t.t0?.storeKind === 'test_double', { storeKind: t.t0?.storeKind });
  c('preview.registered_source', 'the opened document is registered as a source version', t.tOpened?.sourceState === 'registered' && /^src_/.test(t.tOpened?.source?.source_id ?? ''), { source: t.tOpened?.source });
  c('preview.ask_request_state', 'a mouse selection in ASK mode shows the selected text and the request state: no explanation, provider not connected (no fixture text)',
    /trace/.test(t.tAsk?.selectedText ?? '') && /no explanation generated/.test(t.tAsk?.requestState ?? '') && t.tAsk?.card?.badge === 'Provider unavailable',
    { selectedText: t.tAsk?.selectedText, requestState: t.tAsk?.requestState, card: t.tAsk?.card });
  c('preview.typed_note_kept_on_new_ask', 'before the first save, a second ASK is not added: the typed note and its selection stay, Close stays disabled, and the page says why (lead review of 9c1d070)',
    t.tDraftKept?.noteText === 'Why is it 13?  我的问题：为什么是 13？\nSecond line.' && /trace/.test(t.tDraftKept?.selectedText ?? '') && /save or discard your note/.test(t.tDraftKept?.notice ?? '') &&
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
    re?.document?.reopened === true && re?.renderedSha === expected.sha && /matches its SHA-256/.test(re?.openStatus ?? '') && /reopened from storage/.test(re?.sourceStatus ?? '') &&
      re?.source?.source_id === t.tOpened?.source?.source_id && /Why is it 13\?  我的问题：为什么是 13？\nSecond line\./.test(re?.reopened ?? '') && /trace/.test(re?.reopened ?? '') && /provider not connected/.test(re?.reopened ?? '') && inert(re),
    { openStatus: re?.openStatus, sourceStatus: re?.sourceStatus, renderedSha: re?.renderedSha, reopened: re?.reopened });
  return checks;
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
    const checks = evaluate(u.values ?? {}, t.values ?? {}, expected);
    const failed = checks.filter((x) => !x.pass).map((x) => x.id);
    const runnerErrors = [...(u.errors ?? []), ...(t.errors ?? [])];
    const report = {
      kind: 'lc-web-p0-07-preview/v0',
      scope: 'Owned desktop page (early fallback), Edge headless on Windows via WSL2, trusted CDP input. The test-double store is page memory, not persistence; no backend, database, API restart, Safari, iPad, Pencil or AI provider.',
      document: { name: 'linear-algebra-notes.md', ...expected },
      summary: { total: checks.length, passed: checks.length - failed.length, failed },
      checks,
      runner_errors: runnerErrors,
      screenshots: [...(u.screenshots ?? []), ...(t.screenshots ?? [])],
      values: { unconnected: u.values ?? {}, test_double: t.values ?? {} },
    };
    writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(outDir, `${prefix}.log`), `${log.join('\n')}\n`);
    note(`preview checks passed ${checks.length - failed.length}/${checks.length}; failed: ${failed.join(', ') || 'none'}; runner errors: ${runnerErrors.length}`);
    process.exitCode = failed.length === 0 && runnerErrors.length === 0 ? 0 : 1;
  } finally {
    rmSync(docDirUnix, { recursive: true, force: true });
  }
}

await main();
