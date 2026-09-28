#!/usr/bin/env node
// P0-12 desktop probe (A42/A43 supporting evidence): with trusted CDP input on the
// owned quiz fixture, what can a content script observe when a user answers on a
// website, and how is each change attributed (user / site script / unknown)?
// Also checks that the product's WRITE overlay leaves form answering working.
// Desktop headless Chromium/Edge only; not iPad Safari, Pencil or a real course site.
//
// Usage: node scripts/entries-check.mjs --browser <Windows exe under /mnt> [--out <dir>] [--run <name>]

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './fixture-server.mjs';
import { E, clickAt, drag, runCdp, shot, sleep, tap, typeText, key } from './cdp-harness.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const browser = args.browser;
if (!browser || !browser.startsWith('/mnt/')) {
  console.error('missing --browser <Windows browser executable under /mnt/...>');
  process.exit(2);
}
const run = (args.run ?? `entries-${process.pid}`).replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};

const api = (call) => `window.__lcProbe.fixture.${call}`;
const at = (as, expr) => E(api(expr), as);
const clickEl = (as, selector) => [at(as, `box('${selector}')`), ...clickAt(as)];

function buildSteps(url) {
  return [
    { cdp: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
    { cdp: 'Page.navigate', params: { url } },
    sleep(1200),
    E(`(async () => { for (let i = 0; i < 100 && !(window.__lcProbe && window.__lcProbe.fixture && window.__lcProbe.fixture.frameLayoutsReady() >= 2); i++) await new Promise((r) => setTimeout(r, 100)); return window.__lcProbe.fixture.frameLayoutsReady(); })()`, 'layouts'),
    E('navigator.userAgent', 'ua'),
    shot(`${run}-00-initial`),
    // Single choice: select, change, change back.
    ...clickEl('r5', '#det-5'),
    ...clickEl('r6', '#det-6'),
    ...clickEl('r5b', '#det-5'),
    // Multiple choice: check, check, uncheck.
    ...clickEl('cTrace', '#m-trace'),
    ...clickEl('cSym', '#m-sym'),
    ...clickEl('cSym2', '#m-sym'),
    // Text: type 14, erase one character, type 3.
    ...clickEl('qText', '#q-text'),
    ...typeText('14'),
    ...key('Backspace', 'Backspace', 8),
    ...typeText('3'),
    // A field the site reformats in its own handler: type c, then m.
    ...clickEl('qUnits', '#q-units'),
    ...typeText('c'),
    ...typeText('m'),
    sleep(300),
    ...clickEl('qWhy', '#q-why'),
    ...typeText('sum of squared eigenvalues'),
    ...clickEl('qFormula', '#q-formula'),
    ...typeText('λ₁² + λ₂²'),
    // The site's own drawing canvas.
    at('canvasPath', 'canvasPath()'),
    ...drag('canvasPath', 8, 'mouse'),
    // Web components.
    at('openInput', `shadowPoint('#open-host', '#open-input')`),
    ...clickAt('openInput'),
    ...typeText('yes'),
    // Choices inside the open shadow root.
    at('openYes', `shadowPoint('#open-host', '#open-yes')`),
    ...clickAt('openYes'),
    at('openNo', `shadowPoint('#open-host', '#open-no')`),
    ...clickAt('openNo'),
    at('openSure', `shadowPoint('#open-host', '#open-sure')`),
    ...clickAt('openSure'),
    ...clickEl('closedHost', '#closed-host'),
    ...typeText('no'),
    // A password: typed, then the site shows it as text, then typed again. Never recorded.
    ...clickEl('qPass', '#q-pass'),
    ...typeText('hunter2secret'),
    ...clickEl('showPass', '#site-show-password'),
    ...clickEl('qPass2', '#q-pass'),
    ...typeText('X'),
    sleep(400),
    // Embedded questions (same-origin and cross-origin frames).
    at('fSame', `framePoint('entry-frame-same')`),
    ...clickAt('fSame'),
    ...typeText('2'),
    at('fCross', `framePoint('entry-frame-cross')`),
    ...clickAt('fCross'),
    ...typeText('2'),
    sleep(300),
    E(`(${api('values()')})`, 'valuesAfterUser'),
    // The second click may put the caret mid-text; the X can land anywhere.
    E(`(() => { const v = document.getElementById('q-pass').value; return v.length === 14 && v.replace('X', '') === 'hunter2secret'; })()`, 'passwordTyped'),
    // Diagnostics without the value: length and type of the field.
    E(`(() => { const p = document.getElementById('q-pass'); return { length: p.value.length, type: p.type, focused: document.activeElement === p }; })()`, 'passwordField'),
    // Site behavior: restore a draft by script, grade, reveal the answer.
    ...clickEl('restore', '#site-restore'),
    sleep(500),
    ...clickEl('check', '#site-check'),
    ...clickEl('reveal', '#site-reveal'),
    sleep(300),
    shot(`${run}-01-after-site-feedback`),
    // Product overlay: WRITE with a pen over the stem, then a finger answers a question.
    at('tbWRITE', `toolbar('WRITE')`),
    ...clickAt('tbWRITE'),
    at('stemPath', `sweep('#stem', 'eigenvalues 2 and 3')`),
    ...drag('stemPath', 8, 'pen'),
    at('r1', `box('#det-1')`),
    ...tap('r1'),
    sleep(200),
    E(api('state()'), 'overlayState'),
    E(api('inkEvents()'), 'inkEvents'),
    shot(`${run}-02-write-ink-over-question`),
    at('tbNAV', `toolbar('NAV')`),
    ...clickAt('tbNAV'),
    // Next question: the site changes the problem and clears answers by script.
    ...clickEl('next', '#site-next'),
    sleep(500),
    ...clickEl('r6n', '#det-6'),
    sleep(400),
    E(`(${api('values()')})`, 'valuesFinal'),
    E('window.__lcProbe.entries.records', 'records'),
    E('window.__lcProbe.entries.frameRecords', 'frameRecords'),
    E(api('state()'), 'finalState'),
    shot(`${run}-03-next-question`),
  ];
}

function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed: observed ?? null });
  const recs = v.records ?? [];
  const fr = v.frameRecords ?? [];
  const q1 = recs.filter((r) => r.problem?.id === 'set1-q1');
  const pick = (control, list = q1) => list.filter((r) => r.control === control);
  const brief = (list) => list.map((r) => `${r.kind}:${r.actor}:${r.evidence}${r.after !== undefined ? `=${r.after}` : ''}`);

  const radio = q1.filter((r) => r.entry === 'single-choice').map((r) => `${r.kind}(${r.control})`);
  c('entries.radio_select_change_reselect', 'single choice: select 5, change to 6 (5 deselected via group state), change back (reselect 5), all user-attributed',
    JSON.stringify(radio.slice(0, 5)) === JSON.stringify(['select(#det-5)', 'deselect(#det-5)', 'select(#det-6)', 'deselect(#det-6)', 'reselect(#det-5)']) &&
      q1.filter((r) => r.entry === 'single-choice').slice(0, 5).every((r) => r.actor === 'user') &&
      q1.filter((r) => r.kind === 'deselect').slice(0, 2).every((r) => r.evidence === 'group_state'),
    brief(q1.filter((r) => r.entry === 'single-choice')));

  const multiRecs = q1.filter((r) => r.entry === 'multi-choice' && r.actor === 'user');
  const multi = multiRecs.map((r) => `${r.kind}(${r.control}):${r.before}->${r.after}`);
  c('entries.checkbox_check_uncheck', 'multiple choice: check trace, check symmetric, uncheck symmetric (user), each with correct before/after',
    JSON.stringify(multi) === JSON.stringify(['check(#m-trace):off->on', 'check(#m-sym):off->on', 'uncheck(#m-sym):on->off']), multi);

  const units = pick('#q-units');
  c('entries.site_rewrite_not_merged_into_user_edit', 'a site that reformats the field in its own handler: the user edits keep their own before/after, and the site rewrites are separate unknown-actor records',
    JSON.stringify(units.map((r) => `${r.kind}:${r.actor}:${r.before}->${r.after}`)) === JSON.stringify(['text_edit:user:->c', 'change_without_event:unknown:c->C', 'text_edit:user:C->Cm', 'change_without_event:unknown:Cm->CM']),
    units.map((r) => `${r.kind}:${r.actor}:${r.before}->${r.after}`));

  const openChoices = q1.filter((r) => /^#open-host>#open-(yes|no|sure)$/.test(r.control ?? ''));
  c('entries.open_shadow_choices', 'radio group and checkbox inside an open shadow root are recorded from the composed input event, including the derived deselection',
    JSON.stringify(openChoices.map((r) => `${r.kind}(${r.control.split('>')[1]})`)) === JSON.stringify(['select(#open-yes)', 'deselect(#open-yes)', 'select(#open-no)', 'check(#open-sure)']) && openChoices.every((r) => r.actor === 'user'),
    openChoices.map((r) => `${r.kind}(${r.control}):${r.actor}`));

  const pass = JSON.stringify([...recs, ...fr]);
  c('entries.password_never_recorded', 'a password field is never recorded, also after the site switches it to a visible text field',
    !pass.includes('hunter2') && !pass.includes('q-pass') && v.passwordTyped === true,
    { anyRecordForField: pass.includes('q-pass'), valueLeaked: pass.includes('hunter2'), typedIntoField: v.passwordTyped, field: v.passwordField });

  const text = pick('#q-text').filter((r) => r.kind === 'text_edit');
  c('entries.text_edits_before_after', 'text answer: each edit recorded with before/after and input type (14, erase to 1, then 13)',
    JSON.stringify(text.map((r) => [r.before, r.after, r.inputType])) === JSON.stringify([['', '14', 'insertText'], ['14', '1', 'deleteContentBackward'], ['1', '13', 'insertText']]) && text.every((r) => r.actor === 'user'),
    text.map((r) => [r.before, r.after, r.inputType, r.actor]));

  const why = pick('#q-why').filter((r) => r.kind === 'text_edit');
  const formula = pick('#q-formula').filter((r) => r.kind === 'text_edit');
  c('entries.textarea_and_contenteditable', 'textarea and contenteditable formula edits are readable with their final text',
    why.at(-1)?.after === 'sum of squared eigenvalues' && formula.at(-1)?.after === 'λ₁² + λ₂²', { why: why.at(-1)?.after, formula: formula.at(-1)?.after, formulaInputType: formula.at(-1)?.inputType });

  const strokes = q1.filter((r) => r.kind === 'stroke');
  c('entries.site_canvas_visual_only', 'the site canvas stroke is recorded as visual/pointer-only evidence without content, undo or semantics',
    strokes.length === 1 && strokes[0].access === 'visual_only' && strokes[0].evidence === 'pointer_only' && strokes[0].after === undefined && v.valuesAfterUser?.siteStrokes === 1,
    strokes.map((r) => r.detail));

  const open = q1.filter((r) => r.control === '#open-host>#open-input' && r.kind === 'text_edit');
  c('entries.open_shadow_readable', 'input inside an open shadow root: value readable through composedPath', open.at(-1)?.after === 'yes' && open.at(-1)?.actor === 'user', brief(open));

  const closed = q1.filter((r) => r.control === '#closed-host');
  const leaked = JSON.stringify(recs).includes('"no"');
  c('entries.closed_shadow_opaque', 'input inside a closed shadow root: only an opaque change on the host, no value or control',
    closed.length > 0 && closed.every((r) => r.kind === 'opaque_change' && r.access === 'closed_shadow' && r.after === undefined) && !leaked,
    { records: brief(closed), valueLeaked: leaked });

  const sameF = fr.filter((r) => r.frame === 'frame:http://localhost:4173' && r.control === '#frame-answer');
  const crossF = fr.filter((r) => r.frame === 'frame:http://127.0.0.1:4173' && r.control === '#frame-answer');
  c('entries.frames_observed_from_inside', 'embedded answers are recorded by the observer running inside each frame (same- and cross-origin; this probe does not read frame documents from the top); frame records carry no problem binding because the fixture frame has no problem adapter',
    sameF.at(-1)?.after === '2' && crossF.at(-1)?.after === '2' && !recs.some((r) => r.control === '#frame-answer') && [...sameF, ...crossF].every((r) => r.problem === null),
    { same: brief(sameF), cross: brief(crossF), crossOrigins: [...new Set(crossF.map((r) => r.origin))] });

  const restoreText = pick('#q-text').filter((r) => r.kind === 'change_without_event');
  const traceSite = pick('#m-trace').filter((r) => r.actor === 'site_script');
  const symSite = pick('#m-sym').filter((r) => r.actor === 'site_script');
  // A scripted click inside the handler of a user click happens during a live gesture: its source is 'unknown', never 'user'.
  const invSite = pick('#m-inv');
  c('entries.site_restore_attribution', 'site draft restore: a silent value change is actor unknown; a no-op synthetic change is a site no_value_change; a real synthetic change is a site check (off->on); a scripted click() is a site scripted_activation although its change event claims isTrusted',
    restoreText.at(-1)?.after === '12' && restoreText.at(-1)?.actor === 'unknown' &&
      traceSite.length === 1 && traceSite[0].kind === 'no_value_change' && traceSite[0].evidence === 'untrusted_event' &&
      symSite.length === 1 && symSite[0].kind === 'check' && symSite[0].before === 'off' && symSite[0].after === 'on' &&
      invSite.length === 1 && invSite[0].actor !== 'user' && invSite[0].evidence === 'scripted_activation' && /scripted click/.test(invSite[0].detail ?? ''),
    { restoreText: brief(restoreText), trace: brief(traceSite), sym: symSite.map((r) => `${r.kind}:${r.before}->${r.after}`), inv: invSite.map((r) => ({ kind: r.kind, actor: r.actor, evidence: r.evidence, detail: r.detail })) });

  const fb = q1.filter((r) => r.kind === 'site_feedback');
  c('entries.site_feedback_separate', 'site grading and the site-revealed answer are recorded as site feedback, separate from user input',
    fb.some((r) => /Site grading/.test(r.after ?? '')) && fb.some((r) => /Site answer/.test(r.after ?? '')) && fb.every((r) => r.actor === 'site_script'),
    brief(fb));

  const changed = recs.filter((r) => r.kind === 'problem_changed');
  const q2 = recs.filter((r) => r.problem?.id === 'set1-q2');
  const q2Select = q2.filter((r) => r.control === '#det-6' && r.actor === 'user');
  c('entries.problem_change_rebinds', 'moving to the next question is recorded; later answers bind to the new problem (select, not a reselect of the old one); script-cleared answers stay actor unknown',
    changed.length === 1 && changed[0].before === 'set1-q1@1' && changed[0].after === 'set1-q2@1' && q2Select.length === 1 && q2Select[0].kind === 'select' &&
      q2.filter((r) => r.kind === 'change_without_event').every((r) => r.actor === 'unknown'),
    { changed: changed.map((r) => [r.before, r.after]), q2: brief(q2) });

  const vf = v.valuesFinal ?? {};
  c('entries.observer_never_writes', 'final page values are exactly what the user and the site produced (the observer changed nothing)',
    v.valuesAfterUser?.det === '5' && v.valuesAfterUser?.text === '13' && v.valuesAfterUser?.units === 'CM' && JSON.stringify(v.valuesAfterUser?.multi) === JSON.stringify(['m-trace']) && vf.det === '6' && vf.text === '' && vf.problem === 'set1-q2',
    { afterUser: v.valuesAfterUser, final: vf });

  const os = v.overlayState;
  const r1 = q1.filter((r) => r.control === '#det-1');
  c('entries.write_overlay_keeps_answering', 'with WRITE active and a pen used over the question, a finger tap still answers the question; no explanation request',
    v.inkEvents === 1 && os?.mode === 'WRITE' && os?.penObserved === true && os?.requests === 0 && r1.some((r) => r.kind === 'select' && r.actor === 'user'),
    { ink: v.inkEvents, state: os, det1: brief(r1) });
  return checks;
}

async function main() {
  const url = `http://localhost:${PORT}/fixture/entries.html?run=${encodeURIComponent(run)}`;
  note(`page ${url}`);
  const results = await runCdp({ moduleDir: MODULE, browser, run, outDir, steps: buildSteps(url), note });
  const checks = evaluate(results.values ?? {});
  const summary = { total: checks.length, passed: checks.filter((x) => x.pass).length, failed: checks.filter((x) => !x.pass).map((x) => x.id) };
  const report = {
    kind: 'lc-web-p0-12-entries-check/v1',
    trusted_input: 'Chrome DevTools Protocol Input.* (desktop headless); not iPad/Pencil; not a real course site',
    user_agent: results.values?.ua ?? null,
    summary,
    checks,
    runner_errors: results.errors ?? [],
    failed_steps: (results.steps ?? []).filter((s) => !s.ok),
    screenshots: results.screenshots,
    records: results.values?.records ?? [],
    frame_records: results.values?.frameRecords ?? [],
  };
  writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, `${run}.log`), `${log.join('\n')}\n`);
  note(`entries checks passed ${summary.passed}/${summary.total}; failed: ${summary.failed.join(', ') || 'none'}; runner errors: ${(results.errors ?? []).length}`);
  process.exitCode = summary.failed.length > 0 || (results.errors ?? []).length > 0 ? 1 : 0;
}

main().catch((error) => {
  note(`harness error: ${error?.stack ?? error}`);
  try {
    writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify({ kind: 'lc-web-p0-12-entries-check/v1', run, status: 'harness_error', error: String(error), summary: { passed: 0, failed: ['harness_error'] } }, null, 2)}\n`);
    writeFileSync(join(outDir, `${run}.log`), `${log.join('\n')}\n`);
  } catch {
    // output directory unavailable
  }
  process.exit(3);
});
