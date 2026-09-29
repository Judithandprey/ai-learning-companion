// P0-12 test-only cases for the confirmed intent decisions (44e60ec intent-and-decisions.md §3/§4).
// They pin the planned behavior of the web path; they do not measure classification quality,
// real overlay capture or real Notability import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerPrompt,
  initialPromptState,
  classify,
  correct,
  decline,
  destinationOptions,
  externalExposure,
  mayDispatch,
  mayTransmit,
  organize,
  reopen,
  reportExport,
  route,
  visibility,
  type Page,
  type ExportEvent,
  type PromptState,
  type Stroke,
} from './p0-12/organize-model.ts';

const page = (over: Partial<Page> = {}): Page => ({
  problemId: 'q1',
  problemVersion: 1,
  sourceVersion: 3,
  elements: new Set(['stem', 'part-a']),
  mediaPosition: null,
  sharing: 'live',
  ...over,
});
const stroke = (over: Partial<Stroke> = {}): Stroke => ({
  id: 's1',
  mode: 'content',
  anchor: { problemId: 'q1', problemVersion: 1, sourceVersion: 3, elementId: 'part-a', mediaPosition: null },
  purpose: 'unknown',
  purposeHistory: [],
  retained: true,
  ...over,
});

test('INTENT-INK-MODES: both display modes keep their origin and never attach to another problem or material version', () => {
  const content = stroke();
  const screen = stroke({ id: 's2', mode: 'screen', anchor: { ...stroke().anchor, elementId: null } });
  assert.deepEqual(visibility(content, page()), { shown: true, placement: 'with_content', writtenAt: null });
  assert.deepEqual(visibility(screen, page()), { shown: true, placement: 'fixed_on_screen', writtenAt: null });
  for (const s of [content, screen]) {
    assert.deepEqual(visibility(s, page({ problemId: 'q2' })), { shown: false, notice: 'other_problem' });
    assert.deepEqual(visibility(s, page({ problemVersion: 2 })), { shown: false, notice: 'other_problem' });
    assert.deepEqual(visibility(s, page({ sourceVersion: 4 })), { shown: false, notice: 'source_changed' });
    assert.deepEqual(visibility(s, page({ problemId: null })), { shown: false, notice: 'problem_uncertain' });
  }
  // Reflow that removes the anchored element: content ink is not re-attached elsewhere; screen ink is unaffected.
  assert.deepEqual(visibility(content, page({ elements: new Set(['stem']) })), { shown: false, notice: 'placement_unresolved' });
  assert.deepEqual(visibility(screen, page({ elements: new Set(['stem']) })), { shown: true, placement: 'fixed_on_screen', writtenAt: null });
  // One mode working does not make the other unnecessary: both kinds exist side by side.
  assert.notDeepEqual(visibility(content, page()), visibility(screen, page()));
});

test('INTENT-INK-MODES contrast 1: continuous playback of the same known problem and source', () => {
  // Written at 42 s over the video; playback continues through later frames of the same lecture problem.
  const screen = stroke({ id: 'fixed', mode: 'screen', anchor: { ...stroke().anchor, elementId: null, mediaPosition: 42 } });
  const content = stroke({ id: 'attached', anchor: { ...stroke().anchor, elementId: null, mediaPosition: 42 } });
  for (const t of [42, 43, 50, 120, 600]) {
    // Screen-fixed scratch stays and keeps showing its written-at context; it does not vanish every tick.
    assert.deepEqual(visibility(screen, page({ mediaPosition: t })), { shown: true, placement: 'fixed_on_screen', writtenAt: 42 }, `screen @${t}`);
  }
  // Content-attached ink needs a valid transform: only its own frame; no video-object tracking.
  assert.deepEqual(visibility(content, page({ mediaPosition: 42.2 })), { shown: true, placement: 'with_content', writtenAt: 42 });
  assert.deepEqual(visibility(content, page({ mediaPosition: 60 })), { shown: false, notice: 'placement_unresolved' });
  assert.deepEqual(visibility(content, page({ mediaPosition: null })), { shown: false, notice: 'placement_unresolved' });
});

test('INTENT-INK-MODES contrast 2: an actual question change during the same video', () => {
  const screen = stroke({ id: 'fixed', mode: 'screen', anchor: { ...stroke().anchor, elementId: null, mediaPosition: 42 } });
  const content = stroke({ id: 'attached', anchor: { ...stroke().anchor, elementId: null, mediaPosition: 42 } });
  // Same video keeps playing, but the lecture moves to question q2 (or the page cannot tell which question it is).
  for (const s of [screen, content]) {
    assert.deepEqual(visibility(s, page({ problemId: 'q2', mediaPosition: 95 })), { shown: false, notice: 'other_problem' });
    assert.deepEqual(visibility(s, page({ problemId: null, mediaPosition: 95 })), { shown: false, notice: 'problem_uncertain' });
    // Its original anchor is untouched, so returning to q1 shows it again with its written-at context.
    assert.equal(s.anchor.problemId, 'q1');
  }
  assert.deepEqual(visibility(screen, page({ problemId: 'q1', mediaPosition: 44 })), { shown: true, placement: 'fixed_on_screen', writtenAt: 42 });
});

test('share stop: ends new live frames and ink on that path; pre-stop originals are kept and sync only as authorized history', () => {
  const live = page();
  const stopped = page({ sharing: 'stopped' });
  for (const kind of ['live_frame', 'live_ink'] as const) {
    assert.deepEqual(mayTransmit(live, { kind }), { allowed: true, reason: 'live_share' });
    assert.deepEqual(mayTransmit(stopped, { kind }), { allowed: false, reason: 'share_stopped' });
  }
  const history = { kind: 'history' as const, capturedBeforeStop: true, separatelyAuthorized: true, labeledAsHistory: true };
  assert.deepEqual(mayTransmit(stopped, history), { allowed: true, reason: 'authorized_history' });
  assert.deepEqual(mayTransmit(stopped, { ...history, separatelyAuthorized: false }), { allowed: false, reason: 'history_sync_not_authorized' });
  assert.deepEqual(mayTransmit(stopped, { ...history, labeledAsHistory: false }), { allowed: false, reason: 'would_appear_live' });
  assert.deepEqual(mayTransmit(stopped, { ...history, capturedBeforeStop: false }), { allowed: false, reason: 'not_pre_stop_original' });
  // Deciding never restarts sharing; the user still sees and keeps their ink.
  assert.equal(stopped.sharing, 'stopped');
  assert.equal(stroke().retained, true);
  assert.equal(visibility(stroke(), stopped).shown, true);
});

test('INTENT-NOTE-CLASSIFICATION: routing by purpose, correction keeps history, display mode does not decide purpose', () => {
  const asNote = classify(stroke({ mode: 'screen' }), { purpose: 'note', confident: true, basis: 'lecture slide, no problem open' });
  assert.equal(asNote.clarify, false);
  assert.equal(route(asNote.stroke), 'notability_flow');
  const asDraft = classify(stroke(), { purpose: 'draft', confident: true, basis: 'problem open, arithmetic' });
  assert.equal(route(asDraft.stroke), 'process_archive_only');
  const unsure = classify(stroke(), { purpose: 'note', confident: false, basis: 'mixed' });
  assert.equal(unsure.clarify, true);
  assert.equal(route(unsure.stroke), 'await_clarification');
  const corrected = correct(asNote.stroke, 'draft', 'user: "this is scratch work"');
  assert.equal(route(corrected), 'process_archive_only');
  assert.deepEqual(corrected.purposeHistory.map((h) => `${h.by}:${h.purpose}`), ['ai:note', 'user:draft']);
  assert.equal(corrected.retained, true, 'reclassification never deletes the original ink');
  assert.equal(route(correct(asDraft.stroke, 'final_answer', 'user finished')), 'await_answer_prompt');
});

test('ORG-9: a later AI classification never replaces the user\'s explicit purpose; a confident different one is asked about', () => {
  const s0: Stroke = { id: 's9', mode: 'screen', anchor: { problemId: 'q1', problemVersion: 1, sourceVersion: 1, elementId: null, mediaPosition: null }, purpose: 'unknown', purposeHistory: [], retained: true };
  const draft = correct(classify(s0, { purpose: 'note', confident: true, basis: 'lecture' }).stroke, 'draft', 'user: scratch');
  const ai = classify(draft, { purpose: 'final_answer', confident: true, basis: 'boxed result' });
  assert.equal(ai.stroke.purpose, 'draft');
  assert.equal(ai.clarify, true, 'a confident different classification is asked about, not applied');
  const again = classify(ai.stroke, { purpose: 'note', confident: true, basis: 'lecture again' });
  assert.equal(again.stroke.purpose, 'draft', 'still the user\'s purpose after further AI entries');
  assert.equal(again.clarify, true, 'a new, different suggestion is asked about once');
  assert.equal(classify(again.stroke, { purpose: 'final_answer', confident: true, basis: 'boxed again' }).clarify, false, 'the same suggestion is not asked again');
  // After the user answered by keeping their purpose, the same suggestion is not asked again (re-review of 8d67aaa).
  const answered = correct(ai.stroke, 'draft', 'user: still scratch');
  assert.equal(classify(answered, { purpose: 'final_answer', confident: true, basis: 'next pass' }).clarify, false);
  // Unsure: one minimal clarification, not one per pass.
  const u1 = classify(s0, { purpose: 'note', confident: false, basis: 'ambiguous' });
  const u2 = classify(u1.stroke, { purpose: 'note', confident: false, basis: 'still ambiguous' });
  assert.deepEqual([u1.clarify, u2.clarify, route(u2.stroke)], [true, false, 'await_clarification']);
  assert.equal(classify(again.stroke, { purpose: 'draft', confident: true, basis: 'agrees' }).clarify, false);
  assert.deepEqual(again.stroke.purposeHistory.map((h) => h.by), ['ai', 'user', 'ai', 'ai'], 'every classification and correction is kept');
  assert.equal(correct(again.stroke, 'final_answer', 'user finished').purpose, 'final_answer', 'the user can change it');
});

test('INTENT-ANSWER-PROMPT: ask once when finished; pauses and correctness are not completion; a refusal is not repeated', () => {
  let st: PromptState = initialPromptState;
  for (const sig of ['pause', 'left_screen', 'answer_correct', 'still_editing', 'switched_problem'] as const) {
    const r = answerPrompt(st, sig, 'q1');
    assert.equal(r.decision, 'no_prompt', sig);
    st = r.state;
  }
  let r = answerPrompt(st, 'finished_confident', 'q1');
  assert.equal(r.decision, 'ask_organize');
  const q1Prompt = r.promptId!;
  r = answerPrompt(r.state, 'finished_confident', 'q1');
  assert.equal(r.decision, 'no_prompt', 'asked once');
  st = decline(r.state, q1Prompt, 'ipad#1');
  assert.equal(answerPrompt(st, 'finished_confident', 'q1').decision, 'no_prompt', 'no repeat after refusal');
  assert.equal(answerPrompt(st, 'finished_unsure', 'q2').decision, 'ask_done_and_organize_once', 'a new problem may be asked; unsure → one combined question');
});

test('ORG-1: a refusal is bound to its question; a delayed refusal never suppresses another question', () => {
  // QA P1: declining Q1, visiting Q2 and coming back does not ask Q1 again.
  let r = answerPrompt(initialPromptState, 'finished_confident', 'q1');
  let st = decline(r.state, r.promptId!, 'ipad#1');
  st = answerPrompt(st, 'pause', 'q2').state;
  assert.equal(answerPrompt(st, 'finished_confident', 'q1').decision, 'no_prompt', 'Q1 refusal survives a visit to Q2');
  // QA P2: the Q1 refusal arrives after the user moved to Q2; it stays Q1 evidence and Q2 is still asked.
  r = answerPrompt(initialPromptState, 'finished_confident', 'q1');
  const q1Prompt = r.promptId!;
  st = answerPrompt(r.state, 'pause', 'q2').state;
  st = decline(st, q1Prompt, 'ipad#1');
  const q2 = answerPrompt(st, 'finished_confident', 'q2');
  assert.equal(q2.decision, 'ask_organize', 'a delayed Q1 refusal does not suppress Q2');
  assert.equal(answerPrompt(q2.state, 'finished_confident', 'q1').decision, 'no_prompt', 'the Q1 refusal is kept');
  // The Q1 refusal arrives after Q2's own prompt was shown: only Q1 is declined.
  r = answerPrompt(initialPromptState, 'finished_confident', 'q1');
  const first = r.promptId!;
  const q2Shown = answerPrompt(r.state, 'finished_confident', 'q2');
  st = decline(q2Shown.state, first, 'ipad#1');
  assert.deepEqual(st.questions.q1?.refusals, ['ipad#1']);
  assert.deepEqual(st.questions.q2?.refusals, [], 'Q2 was not declined');
  assert.equal(reopen(st, 'q2', []).allowed, true);
  // A refusal naming a prompt that was never shown changes nothing.
  assert.deepEqual(decline(initialPromptState, 'q9#1', 'ipad#1'), initialPromptState);
});

test('ORG-1: only a causally later explicit reopening supersedes a refusal; unknown order keeps it', () => {
  const r = answerPrompt(initialPromptState, 'finished_confident', 'q1');
  const st = decline(r.state, r.promptId!, 'ipad#1');
  // A reopening that did not see the refusal (e.g. from another device) has an unknown order.
  assert.deepEqual(reopen(st, 'q1', []), { allowed: false, state: st });
  assert.equal(reopen(st, 'q1', ['iphone#4']).allowed, false, 'naming another refusal is not causal evidence');
  const later = reopen(st, 'q1', ['ipad#1']);
  assert.equal(later.allowed, true);
  assert.deepEqual(later.state.questions.q1?.refusals, [], 'the causal reopening clears the refusal it saw');
  assert.equal(reopen(later.state, 'q1', []).allowed, true);
  assert.equal(answerPrompt(later.state, 'finished_confident', 'q1').decision, 'no_prompt', 'reopening is the user organizing, not a repeated prompt');
  // A question never declined may always be organized on request.
  assert.equal(reopen(initialPromptState, 'q2', []).allowed, true);
});

test('ORG-1: refusals carry their own identity, so arrival order never decides (review of 7ee1217)', () => {
  const r = answerPrompt(initialPromptState, 'finished_confident', 'q1');
  const p = r.promptId!;
  // R1 (iPad) and R2 (a stale menu on the iPhone) refuse the same prompt; x reopens having seen only R1.
  const r1 = decline(r.state, p, 'ipad#1');
  const r1r2x = reopen(decline(r1, p, 'iphone#7'), 'q1', ['ipad#1']);
  const r1xr2 = decline(reopen(r1, 'q1', ['ipad#1']).state, p, 'iphone#7');
  assert.equal(r1r2x.allowed, false, 'R2 was not seen: order unknown, refusal kept');
  assert.deepEqual(r1r2x.state.questions.q1?.refusals, ['ipad#1', 'iphone#7']);
  assert.deepEqual(r1xr2.questions.q1?.refusals, ['iphone#7'], 'either arrival order ends with R2 retained');
  // A replay of R1 after the causal reopening is recognized and ignored.
  const reopened = reopen(r1, 'q1', ['ipad#1']).state;
  assert.deepEqual(decline(reopened, p, 'ipad#1'), reopened);
  // A reopening that saw both refusals: either arrival order of R2 ends with no refusal in force (re-review of 8d67aaa).
  const both = ['ipad#1', 'iphone#7'];
  const r2First = reopen(decline(r1, p, 'iphone#7'), 'q1', both);
  const r2Late = decline(reopen(r1, 'q1', both).state, p, 'iphone#7');
  assert.equal(r2First.allowed, true);
  assert.deepEqual(r2First.state.questions.q1?.refusals, []);
  assert.deepEqual(r2Late.questions.q1?.refusals, [], 'a named refusal delivered after the reopening stays superseded');
  // One device: the reopening that names its own refusal is delivered first.
  const early = reopen(r.state, 'q1', ['ipad#1']);
  assert.equal(early.allowed, true);
  const late = decline(early.state, p, 'ipad#1');
  assert.deepEqual(late.questions.q1?.refusals, []);
  assert.equal(reopen(late, 'q1', []).allowed, true);
});

test('INTENT-HOMEWORK-CHOICE: only actually available destinations; ambiguity is confirmed; never a submit option', () => {
  assert.deepEqual(destinationOptions({ notabilityShare: true, homeworkDocument: 'matched' }), ['notability_homework', 'homework_document', 'preview', 'not_now']);
  assert.deepEqual(destinationOptions({ notabilityShare: false, homeworkDocument: 'ambiguous' }), ['confirm_which_assignment', 'preview', 'not_now']);
  assert.deepEqual(destinationOptions({ notabilityShare: false, homeworkDocument: 'none' }), ['preview', 'not_now']);
  // Never a submit option, for every capability combination (QA ORG-13).
  for (const notabilityShare of [true, false]) {
    for (const homeworkDocument of ['matched', 'ambiguous', 'none'] as const) {
      const opts = destinationOptions({ notabilityShare, homeworkDocument });
      assert.ok(!opts.some((o) => /submit/i.test(o)), `${notabilityShare}/${homeworkDocument}`);
      assert.deepEqual(opts.slice(-2), ['preview', 'not_now']);
    }
  }
});

test('INTENT-FAITHFUL-EXPORT: opening a panel is local; shared needs dispatch; imported needs target evidence; organizing never submits', () => {
  assert.deepEqual(reportExport(['prepared']).attempts, ['prepared']);
  // Opening the share panel is only a local fact.
  const opened = reportExport(['prepared', 'panel_opened']);
  assert.deepEqual([opened.latest, opened.everShared, opened.everDispatched], ['panel_open', false, false]);
  assert.equal(reportExport(['prepared', 'panel_opened', 'cancelled_before_dispatch']).latest, 'cancelled');
  assert.equal(reportExport(['prepared', 'failed_before_dispatch']).latest, 'failed_before_dispatch');
  // A generic timeout without dispatch evidence manufactures nothing.
  const timedOut = reportExport(['prepared', 'panel_opened', 'no_response']);
  assert.deepEqual([timedOut.latest, timedOut.everDispatched], ['panel_open', false]);
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started']).latest, 'dispatching');
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown']).latest, 'dispatch_unknown');
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started', 'no_response']).latest, 'dispatch_unknown');
  const shared = reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed']);
  assert.deepEqual([shared.latest, shared.everShared, shared.everImported], ['shared_pending_import', true, false]);
  const imported = reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'target_import_confirmed']);
  assert.deepEqual([imported.latest, imported.everImported], ['imported', true]);
  // Import evidence without any dispatch is not accepted as an import.
  assert.equal(reportExport(['prepared', 'panel_opened', 'target_import_confirmed']).everImported, false);
  // An unknown outcome is never reported as shared or imported (QA ORG-11).
  for (const events of [['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown'], ['prepared', 'panel_opened', 'dispatch_started', 'no_response'], ['prepared', 'panel_opened', 'target_import_confirmed']] as const) {
    const u = reportExport(events);
    assert.deepEqual([u.everShared, u.everImported, u.everExternalEffect], [false, false, true], events.join(','));
  }
  const o = organize(['user derivation ink', 'user final answer'], ['AI layout suggestion']);
  assert.deepEqual(o.userLayers, ['user derivation ink', 'user final answer']);
  assert.deepEqual(o.aiLayers, ['AI layout suggestion']);
  assert.equal(o.aiChangesPreviewed, true);
  assert.equal(o.submitted, false);
});

test('INTENT-FAITHFUL-EXPORT: reopening keeps earlier outcomes; the latest attempt is reported separately', () => {
  // prepared applies to the initial attempt; a reopen starts a new attempt.
  const r = reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'panel_opened', 'cancelled_before_dispatch']);
  assert.deepEqual(r.attempts, ['shared_pending_import', 'cancelled']);
  assert.deepEqual([r.latest, r.everShared, r.everDispatched], ['cancelled', true, true]);
  const r2 = reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'target_import_confirmed', 'panel_opened', 'failed_before_dispatch']);
  assert.deepEqual([r2.attempts, r2.everImported], [['imported', 'failed_before_dispatch'], true]);
  // A late cancel or failure event cannot undo a dispatch in the same attempt.
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'cancelled_before_dispatch']).latest, 'shared_pending_import');
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started', 'failed_before_dispatch']).latest, 'dispatching');
});

test('ORG-3: effect evidence without, or reordered against, a local dispatch is kept; missing dispatch is not proof of none', () => {
  const cases: Array<[ReadonlyArray<ExportEvent>, string, boolean, boolean]> = [
    // [events, latest, everShared, everImported]
    [['prepared', 'panel_opened', 'dispatch_completed'], 'shared_pending_import', true, false],
    [['prepared', 'panel_opened', 'target_import_confirmed'], 'effect_unverified', false, false],
    [['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_started'], 'dispatching', false, false],
    [['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_completed'], 'shared_pending_import', true, false],
    [['prepared', 'panel_opened', 'failed_before_dispatch', 'dispatch_completed'], 'shared_pending_import', true, false],
    [['prepared', 'panel_opened', 'failed_before_dispatch', 'dispatch_outcome_unknown'], 'dispatch_unknown', false, false],
    [['prepared', 'panel_opened', 'dispatch_completed', 'dispatch_started'], 'shared_pending_import', true, false],
    [['dispatch_completed'], 'shared_pending_import', true, false],
  ];
  for (const [events, latest, shared, imported] of cases) {
    const r = reportExport(events);
    assert.deepEqual([r.latest, r.everShared, r.everImported, r.everExternalEffect], [latest, shared, imported, true], events.join(','));
    assert.deepEqual(externalExposure(events, true), { exposure: 'possible', learnerRead: 'unknown' }, events.join(','));
  }
  // An unknown outcome is resolved only by later evidence for the same attempt (QA ORG-12).
  const unknownThenDelivered = reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown', 'dispatch_completed']);
  assert.deepEqual([unknownThenDelivered.latest, unknownThenDelivered.everShared], ['shared_pending_import', true]);
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown', 'target_import_confirmed']).latest, 'imported');
  assert.equal(reportExport(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown', 'cancelled_before_dispatch']).latest, 'dispatch_unknown', 'a late cancel does not resolve an unknown outcome');
  // An unverified import report never becomes an import, even when repeated; a chained one after delivery does.
  assert.equal(reportExport(['prepared', 'panel_opened', 'target_import_confirmed', 'target_import_confirmed']).everImported, false);
  assert.equal(reportExport(['prepared', 'panel_opened', 'target_import_confirmed', 'dispatch_completed', 'target_import_confirmed']).latest, 'imported');
  // A late local cancel or failure never erases an unverified effect report (review of 7ee1217).
  for (const late of ['cancelled_before_dispatch', 'failed_before_dispatch'] as const) {
    const events: ExportEvent[] = ['prepared', 'panel_opened', 'target_import_confirmed', late];
    assert.deepEqual([reportExport(events).latest, externalExposure(events, true).exposure], ['effect_unverified', 'possible'], late);
  }
  // Dispatch evidence after an unverified report counts as dispatch, and a later import report is chained.
  const afterUnverified = reportExport(['prepared', 'panel_opened', 'target_import_confirmed', 'dispatch_started']);
  assert.deepEqual([afterUnverified.latest, afterUnverified.everDispatched], ['dispatching', true]);
  assert.equal(reportExport(['prepared', 'panel_opened', 'target_import_confirmed', 'dispatch_started', 'target_import_confirmed']).latest, 'imported');
  assert.equal(reportExport(['prepared', 'panel_opened', 'target_import_confirmed', 'dispatch_outcome_unknown']).latest, 'dispatch_unknown');
  // Late or reordered events never lower a stronger outcome of the same attempt.
  for (const [events, latest] of [
    [['prepared', 'panel_opened', 'dispatch_started', 'target_import_confirmed', 'dispatch_completed'], 'imported'],
    [['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'dispatch_outcome_unknown'], 'shared_pending_import'],
    [['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'target_import_confirmed', 'no_response'], 'imported'],
    [['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'target_import_confirmed', 'dispatch_outcome_unknown'], 'imported'],
  ] as Array<[ExportEvent[], string]>) {
    assert.equal(reportExport(events).latest, latest, events.join(','));
  }
  // An unverified effect ends its attempt: opening the panel again starts a new one.
  assert.deepEqual(reportExport(['prepared', 'panel_opened', 'target_import_confirmed', 'panel_opened', 'cancelled_before_dispatch']).attempts, ['effect_unverified', 'cancelled']);
  // Still no effect from local-only facts.
  for (const events of [['prepared', 'panel_opened'], ['prepared', 'panel_opened', 'no_response'], ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'no_response']] as const) {
    assert.deepEqual(externalExposure(events, true), { exposure: 'none', learnerRead: 'unknown' }, events.join(','));
  }
});

test('ADR 0002 §8: export dispatch is bound to the exact confirmed manifest and its previewed, currently permitted AI layers', () => {
  const m = { id: 'mf-2', userLayers: ['derivation', 'answer'], aiLayers: [{ id: 'L1', kind: 'layout' as const, permittedNow: true }, { id: 'L2', kind: 'addition' as const, permittedNow: true }] };
  assert.deepEqual(mayDispatch(m, { manifestId: 'mf-2', previewedAiLayerIds: ['L1', 'L2'], scope: 'layout_only' }), { allowed: true, reasons: [] });
  // An old approval for a regenerated manifest does not carry over.
  assert.equal(mayDispatch(m, { manifestId: 'mf-1', previewedAiLayerIds: ['L1', 'L2'], scope: 'content' }).allowed, false);
  assert.equal(mayDispatch(m, null).allowed, false);
  // A layer hidden from the preview cannot silently remain in the export.
  assert.deepEqual(mayDispatch(m, { manifestId: 'mf-2', previewedAiLayerIds: ['L1'], scope: 'layout_only' }).reasons, ['layer_not_previewed:L2']);
  // Current disclosure check per layer, at dispatch time.
  const blocked = { ...m, aiLayers: [{ id: 'L2', kind: 'addition' as const, permittedNow: false }] };
  assert.deepEqual(mayDispatch(blocked, { manifestId: 'mf-2', previewedAiLayerIds: ['L2'], scope: 'content' }).reasons, ['layer_not_permitted_now:L2']);
  // Layout-only consent never covers a change to the learner's answer.
  const corr = { ...m, aiLayers: [{ id: 'C1', kind: 'correction' as const, permittedNow: true }] };
  assert.deepEqual(mayDispatch(corr, { manifestId: 'mf-2', previewedAiLayerIds: ['C1'], scope: 'layout_only' }).reasons, ['correction_needs_content_consent:C1']);
  assert.equal(mayDispatch(corr, { manifestId: 'mf-2', previewedAiLayerIds: ['C1'], scope: 'content' }).allowed, true);
});

test('ORG-10: every layer kind needs the current disclosure check and the confirmed preview', () => {
  for (const kind of ['layout', 'addition', 'correction'] as const) {
    const m = { id: 'mf-3', userLayers: ['answer'], aiLayers: [{ id: 'X', kind, permittedNow: false }] };
    assert.ok(mayDispatch(m, { manifestId: 'mf-3', previewedAiLayerIds: ['X'], scope: 'content' }).reasons.includes('layer_not_permitted_now:X'), `${kind} not permitted now`);
    const ok = { ...m, aiLayers: [{ id: 'X', kind, permittedNow: true }] };
    assert.ok(mayDispatch(ok, { manifestId: 'mf-3', previewedAiLayerIds: [], scope: 'content' }).reasons.includes('layer_not_previewed:X'), `${kind} not previewed`);
    assert.deepEqual(mayDispatch(ok, { manifestId: 'mf-3', previewedAiLayerIds: ['X'], scope: 'content' }), { allowed: true, reasons: [] }, `${kind} allowed`);
  }
});

test('ADR 0002 §7: possible external exposure only from a (possibly) effective dispatch of help; reading stays unknown', () => {
  const none = { exposure: 'none', learnerRead: 'unknown' };
  const possible = { exposure: 'possible', learnerRead: 'unknown' };
  assert.deepEqual(externalExposure(['prepared'], true), none);
  assert.deepEqual(externalExposure(['prepared', 'panel_opened'], true), none, 'opening a panel is not dispatch');
  assert.deepEqual(externalExposure(['prepared', 'panel_opened', 'cancelled_before_dispatch'], true), none);
  assert.deepEqual(externalExposure(['prepared', 'failed_before_dispatch'], true), none);
  assert.deepEqual(externalExposure(['prepared', 'panel_opened', 'no_response'], true), none, 'a timeout without dispatch evidence');
  for (const ev of [['dispatch_started'], ['dispatch_started', 'dispatch_outcome_unknown'], ['dispatch_started', 'dispatch_completed'], ['dispatch_started', 'dispatch_completed', 'target_import_confirmed']] as const) {
    assert.deepEqual(externalExposure(['prepared', 'panel_opened', ...ev], true), possible, ev.join(','));
    assert.deepEqual(externalExposure(['prepared', 'panel_opened', ...ev], false), none, `no help: ${ev.join(',')}`);
  }
  // An earlier shared attempt stays an exposure after a later cancelled reopen.
  assert.deepEqual(externalExposure(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'panel_opened', 'cancelled_before_dispatch'], true), possible);
});
