// P0-12 test-only cases for the confirmed intent decisions (44e60ec intent-and-decisions.md §3/§4).
// They pin the planned behavior of the web path; they do not measure classification quality,
// real overlay capture or real Notability import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerPrompt,
  classify,
  correct,
  decline,
  destinationOptions,
  externalExposure,
  mayDispatch,
  mayTransmit,
  organize,
  reportExport,
  route,
  visibility,
  type Page,
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

test('INTENT-ANSWER-PROMPT: ask once when finished; pauses and correctness are not completion; a refusal is not repeated', () => {
  let st: PromptState = { asked: false, declined: false, problemId: 'q1' };
  for (const sig of ['pause', 'left_screen', 'answer_correct', 'still_editing', 'switched_problem'] as const) {
    const r = answerPrompt(st, sig, 'q1');
    assert.equal(r.decision, 'no_prompt', sig);
    st = r.state;
  }
  let r = answerPrompt(st, 'finished_confident', 'q1');
  assert.equal(r.decision, 'ask_organize');
  r = answerPrompt(r.state, 'finished_confident', 'q1');
  assert.equal(r.decision, 'no_prompt', 'asked once');
  st = decline(r.state);
  assert.equal(answerPrompt(st, 'finished_confident', 'q1').decision, 'no_prompt', 'no repeat after refusal');
  assert.equal(answerPrompt(st, 'finished_unsure', 'q2').decision, 'ask_done_and_organize_once', 'a new problem may be asked; unsure → one combined question');
});

test('INTENT-HOMEWORK-CHOICE: only actually available destinations; ambiguity is confirmed; never a submit option', () => {
  assert.deepEqual(destinationOptions({ notabilityShare: true, homeworkDocument: 'matched' }), ['notability_homework', 'homework_document', 'preview', 'not_now']);
  assert.deepEqual(destinationOptions({ notabilityShare: false, homeworkDocument: 'ambiguous' }), ['confirm_which_assignment', 'preview', 'not_now']);
  assert.deepEqual(destinationOptions({ notabilityShare: false, homeworkDocument: 'none' }), ['preview', 'not_now']);
  for (const opts of [destinationOptions({ notabilityShare: true, homeworkDocument: 'matched' })]) assert.ok(!opts.some((o) => /submit/.test(o)));
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
  // Import evidence without any dispatch is not accepted.
  assert.equal(reportExport(['prepared', 'panel_opened', 'target_import_confirmed']).everImported, false);
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
