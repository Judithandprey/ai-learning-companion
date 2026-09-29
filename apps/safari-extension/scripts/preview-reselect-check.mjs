#!/usr/bin/env node
// Focused desktop check for QA-P07-01 (re-selecting words the unsaved-work guard refused).
// Edge headless, trusted CDP input, the labeled in-page test double (an injected lost answer
// gives the unknown save; the refusal path does not depend on storage). Native pointer, drag
// and selection events are recorded next to the probe's own events, so the cause is observed
// rather than inferred. Flow:
//   1. ASK "trace(A²)", type a note, Save with a lost answer: Outcome unknown.
//   2. NAV -> ASK, drag over "特征值的平方和": refused by the guard (the item and note are kept).
//   3. Retry: saved.
//   4. NAV -> ASK, drag over the SAME refused words: must give a new draft of those words.
//   5. NAV -> ASK, drag over different words ("Markup stays text"), after typing a note on step 4's
//      draft: refused, the typed note kept (guard regression).
//   6. Discard; ASK "Linear algebra notes" (a normal draft), Discard again: those words stay
//      selected in the document. ASK and drag over them again: a new draft, no native text drag.
//   7. Discard; select "Markup stays text" by mouse in NAV (no request), switch to ASK and click the
//      selection without dragging: that existing selection is still what ASK asks about.
//   8. Discard (the words stay selected); ASK and press in the document's left padding beside them,
//      then drag across them: the browser counts that press as on the selection; a new draft results.
//   9. Discard; ASK and click the still-selected words with 2 px of jitter: the whole selection is
//      asked, not a character.
// Not Safari, iPad or Pencil evidence; no API, database or AI provider.
//
// Usage: node scripts/preview-reselect-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <prefix>]

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './fixture-server.mjs';
import { E, clickAt, drag, runCdp, shot, sleep, typeText } from './cdp-harness.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.browser || !args.browser.startsWith('/mnt/')) {
  console.error('missing --browser <Windows browser executable under /mnt/...>');
  process.exit(2);
}
const prefix = (args.run ?? 'p0-07-reselect').replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};

const SAMPLE = [
  '# Linear algebra notes\r\n\r\n',
  'Let A be a 2×2 matrix with eigenvalues λ₁ = 2 and λ₂ = 3.\n',
  'Then trace(A²) = λ₁² + λ₂² = 13.\n\n',
  '特征值的平方和等于 trace(A²)。这是我自己的笔记。\n\n\n',
  'Markup stays text: <b>bold?</b> 🙂\n',
].join('');
const X = 'trace(A²)';
const REFUSED = '特征值的平方和';
const OTHER = 'Markup stays text';
const HEADING = 'Linear algebra notes';

const api = 'window.__lcPreview';
const state = (as) =>
  E(
    `(() => { const s = ${api}.state(); return { selectedText: s.selectedText, notice: s.notice, noteText: s.noteText, saveStatus: s.saveStatus, attempt: s.attempt, buttons: s.buttons, mode: ${api}.session.state.mode, nativeSelection: String(getSelection()), card: s.card && { hidden: s.card.hidden, quote: s.card.quote } }; })()`,
    as,
  );
const center = (selector) => `(() => { const e = document.querySelector('${selector}'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
const click = (selector, as) => [E(center(selector), as), ...clickAt(as)];
const toolbar = (mode) => [E(`(() => { const r = ${api}.probe.toolbarRects()['${mode}']; return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`, `tb${mode}`), ...clickAt(`tb${mode}`)];
/** Mouse path across a phrase; `startDx` moves the press point left of the phrase (e.g. into padding). */
const sweep = (phrase, as, n = 6, startDx = 0) =>
  E(
    `(() => { const w = document.createTreeWalker(document.getElementById('document'), NodeFilter.SHOW_TEXT); for (let t = w.nextNode(); t; t = w.nextNode()) { const i = t.textContent.indexOf(${JSON.stringify(phrase)}); if (i < 0) continue; const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + ${JSON.stringify(phrase)}.length); t.parentElement.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); const out = {}; for (let k = 0; k <= ${n}; k++) { out['x' + k] = q.left + 1 + ((q.width - 2) * k) / ${n}; out['y' + k] = q.top + q.height / 2; } out.x0 -= ${startDx}; return out; } return null; })()`,
    as,
  );
// NAV then ASK, as QA did (ASK is a toggle), then a mouse drag across the phrase.
const askDrag = (phrase, as, n = 4) => [...toolbar('NAV'), ...toolbar('ASK'), sweep(phrase, as, n), ...drag(as, n, 'mouse'), sleep(700)];
/** Records native input and selection events from now on (window capture, after the probe's listeners). */
const record = E(
  `(() => { const rec = []; window.__rec = rec; const on = (target, type) => target.addEventListener(type, (e) => rec.push(type === 'selectionchange' ? { type, selection: String(getSelection()) } : { type, x: Math.round(e.clientX), y: Math.round(e.clientY) }), true); for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'dragstart', 'dragend', 'click']) on(window, t); on(document, 'selectionchange'); return true; })()`,
  'recording',
);
const recorded = (as) => E(`({ native: window.__rec.splice(0), probe: ${api}.events.slice(-4) })`, as);

function steps(url, docPath) {
  return [
    { cdp: 'Page.navigate', params: { url } },
    sleep(1500),
    { files: [docPath], selector: '#open-file' },
    sleep(700),
    // 1. X saved with a lost answer: unknown
    ...askDrag(X, 'pX', 6),
    ...click('#note', 'noteX'),
    ...typeText('My note on X.'),
    E(`${api}.testStore.failNext('save', 'lost_response')`, 'inject'),
    ...click('#save', 'saveX'),
    sleep(400),
    state('xUnknown'),
    // 2. a new selection while X is unknown: refused
    ...askDrag(REFUSED, 'pRefused'),
    state('refused'),
    shot(`${prefix}-1-refused`),
    // 3. Retry: saved
    ...click('#retry-save', 'retry'),
    sleep(400),
    state('retried'),
    shot(`${prefix}-2-retried`),
    // 4. the same refused words again
    record,
    ...askDrag(REFUSED, 'pAgain'),
    recorded('againEvents'),
    state('again'),
    shot(`${prefix}-3-same-words-again`),
    // 5. guard regression: typed words on that draft, then different words are refused
    ...click('#note', 'noteAgain'),
    ...typeText('Typed on the re-selected words.'),
    ...askDrag(OTHER, 'pOther'),
    recorded('otherEvents'),
    state('otherRefused'),
    // 6. a press on words still selected after a normal draft was discarded
    ...click('#discard', 'discard1'),
    ...askDrag(HEADING, 'pHeading'),
    state('headingDraft'),
    ...click('#discard', 'discard2'),
    state('headingDiscarded'),
    ...askDrag(HEADING, 'pHeadingAgain'),
    recorded('headingEvents'),
    state('headingAgain'),
    // 7. click (no drag) in ASK on a selection made in NAV
    ...click('#discard', 'discard3'),
    ...toolbar('NAV'),
    sweep(OTHER, 'pNav', 4),
    ...drag('pNav', 4, 'mouse'),
    sleep(400),
    state('navSelected'),
    ...toolbar('ASK'),
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: '$pNav.x2', y: '$pNav.y2', button: 'none', buttons: 0, pointerType: 'mouse' } },
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: '$pNav.x2', y: '$pNav.y2', button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' } },
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: '$pNav.x2', y: '$pNav.y2', button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' } },
    sleep(700),
    recorded('clickEvents'),
    state('clickAsked'),
    // 8. a press in the left padding beside words still selected, then a drag across them
    ...click('#discard', 'discard4'),
    state('paddingBefore'),
    ...toolbar('NAV'),
    ...toolbar('ASK'),
    sweep(OTHER, 'pPad', 4, 8),
    ...drag('pPad', 4, 'mouse'),
    sleep(700),
    recorded('paddingEvents'),
    state('paddingAsked'),
    // 9. a click with 2 px of jitter on the still-selected words
    ...click('#discard', 'discard5'),
    ...toolbar('NAV'),
    ...toolbar('ASK'),
    E(
      `(() => { const w = document.createTreeWalker(document.getElementById('document'), NodeFilter.SHOW_TEXT); for (let t = w.nextNode(); t; t = w.nextNode()) { const i = t.textContent.indexOf(${JSON.stringify(OTHER)}); if (i < 0) continue; const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + ${JSON.stringify(OTHER)}.length); const q = r.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; return { sx: x, sy: y, ex: x + 2, ey: y }; } return null; })()`,
      'jit',
    ),
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: '$jit.sx', y: '$jit.sy', button: 'none', buttons: 0, pointerType: 'mouse' } },
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: '$jit.sx', y: '$jit.sy', button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' } },
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: '$jit.ex', y: '$jit.ey', button: 'left', buttons: 1, pointerType: 'mouse' } },
    { cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: '$jit.ex', y: '$jit.ey', button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' } },
    sleep(700),
    recorded('jitterEvents'),
    state('jitterAsked'),
    E('navigator.userAgent', 'userAgent'),
  ];
}

function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed });
  c('reselect.setup_unknown', 'setup: X saved with a lost answer shows Outcome unknown', v.xUnknown?.attempt?.status === 'unknown', { saveStatus: v.xUnknown?.saveStatus });
  c('reselect.guard_refuses', 'while X is unknown, a new selection is refused with a notice; X and its note are kept', /not added/.test(v.refused?.notice ?? '') && v.refused?.attempt?.status === 'unknown' && v.refused?.selectedText === X && v.refused?.noteText === 'My note on X.',
    { notice: v.refused?.notice, selectedText: v.refused?.selectedText, nativeSelection: v.refused?.nativeSelection });
  c('reselect.refused_not_left_selected', 'the refused words are not left selected in the document', v.refused?.nativeSelection === '', { nativeSelection: v.refused?.nativeSelection });
  c('reselect.retry_saves', 'Retry saves X', v.retried?.attempt?.status === 'committed', { saveStatus: v.retried?.saveStatus });
  c('reselect.same_words_new_draft', 'after the save, dragging over the SAME refused words in ASK gives a new draft of those words', v.again?.selectedText === REFUSED && v.again?.attempt === null && v.again?.buttons?.save === true,
    { selectedText: v.again?.selectedText, attempt: v.again?.attempt, events: v.againEvents });
  c('reselect.guard_keeps_typed_words', 'with words typed on that draft, a selection of different words is refused and the typed note is kept', /not added/.test(v.otherRefused?.notice ?? '') && v.otherRefused?.selectedText === REFUSED && v.otherRefused?.noteText === 'Typed on the re-selected words.',
    { notice: v.otherRefused?.notice, selectedText: v.otherRefused?.selectedText, noteText: v.otherRefused?.noteText, nativeSelection: v.otherRefused?.nativeSelection });
  const headingNative = (v.headingEvents?.native ?? []).map((e) => e.type);
  c('reselect.press_on_selection_new_mark', 'a press in ASK on words still selected (a normal draft, then Discard) starts a new mark: a new draft of those words, no native text drag',
    v.headingDraft?.selectedText === HEADING && v.headingDiscarded?.nativeSelection === HEADING && v.headingAgain?.selectedText === HEADING && v.headingAgain?.attempt === null && !headingNative.includes('dragstart'),
    { stillSelectedBeforePress: v.headingDiscarded?.nativeSelection, selectedText: v.headingAgain?.selectedText, native: headingNative });
  c('reselect.click_on_existing_selection_asks', 'a click (no drag) in ASK on a selection made in NAV still asks about that selection',
    v.navSelected?.nativeSelection === OTHER && v.navSelected?.selectedText === null && v.clickAsked?.selectedText === OTHER && v.clickAsked?.attempt === null,
    { selectedInNav: v.navSelected?.nativeSelection, draftBeforeAsk: v.navSelected?.selectedText, selectedText: v.clickAsked?.selectedText, probe: v.clickEvents?.probe });
  const paddingNative = (v.paddingEvents?.native ?? []).map((e) => e.type);
  c('reselect.padding_press_on_selection', 'a press in the padding beside words still selected (the browser counts it as on the selection), then a drag across them: a new draft, no native text drag',
    v.paddingBefore?.nativeSelection === OTHER && v.paddingAsked?.selectedText === OTHER && v.paddingAsked?.attempt === null && !paddingNative.includes('dragstart'),
    { stillSelectedBeforePress: v.paddingBefore?.nativeSelection, selectedText: v.paddingAsked?.selectedText, native: paddingNative });
  c('reselect.jitter_click_asks_selection', 'a click with 2 px of jitter on still-selected words asks about the whole selection, not a character',
    v.jitterAsked?.selectedText === OTHER && v.jitterAsked?.attempt === null,
    { selectedText: v.jitterAsked?.selectedText, probe: v.jitterEvents?.probe });
  return checks;
}

const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
const docDir = join(execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim(), `lc-web-reselect-${process.pid}`);
mkdirSync(docDir, { recursive: true });
const docPath = join(docDir, 'reselect-notes.md');
writeFileSync(docPath, SAMPLE, 'utf8');
try {
  const result = await runCdp({
    moduleDir: MODULE,
    browser: args.browser,
    run: prefix,
    outDir,
    steps: steps(`http://127.0.0.1:${PORT}/preview/?store=test-double`, execFileSync('wslpath', ['-w', docPath], { encoding: 'utf8' }).trim()),
    note,
  });
  const checks = evaluate(result.values ?? {});
  const failed = checks.filter((x) => !x.pass).map((x) => x.id);
  const report = {
    kind: 'lc-web-p0-07-reselect/v1',
    scope: 'QA-P07-01 focused check: owned preview page, labeled in-page test double, Edge headless on Windows via WSL2, trusted CDP mouse input. Not Safari, iPad, Pencil, API or database evidence.',
    browser: result.values?.userAgent ?? null,
    summary: { total: checks.length, passed: checks.length - failed.length, failed },
    checks,
    runner_errors: result.errors ?? [],
    screenshots: result.screenshots ?? [],
    values: result.values ?? {},
  };
  writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, `${prefix}.log`), `${log.join('\n')}\n`);
  note(`reselect checks passed ${checks.length - failed.length}/${checks.length}; failed: ${failed.join(', ') || 'none'}; runner errors: ${report.runner_errors.length}`);
  process.exitCode = failed.length === 0 && report.runner_errors.length === 0 ? 0 : 1;
} finally {
  rmSync(docDir, { recursive: true, force: true });
}
