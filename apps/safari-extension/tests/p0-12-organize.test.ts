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

test('INTENT-INK-MODES: both display modes keep their origin and never attach to another problem, source or video moment', () => {
  const content = stroke();
  const screen = stroke({ id: 's2', mode: 'screen', anchor: { ...stroke().anchor, elementId: null } });
  assert.deepEqual(visibility(content, page()), { shown: true, placement: 'with_content' });
  assert.deepEqual(visibility(screen, page()), { shown: true, placement: 'fixed_on_screen' });
  for (const s of [content, screen]) {
    assert.deepEqual(visibility(s, page({ problemId: 'q2' })), { shown: false, notice: 'other_problem' });
    assert.deepEqual(visibility(s, page({ problemVersion: 2 })), { shown: false, notice: 'other_problem' });
    assert.deepEqual(visibility(s, page({ sourceVersion: 4 })), { shown: false, notice: 'source_changed' });
  }
  // Reflow that removes the anchored element: content ink is not re-attached elsewhere; screen ink is unaffected.
  assert.deepEqual(visibility(content, page({ elements: new Set(['stem']) })), { shown: false, notice: 'anchor_missing' });
  assert.deepEqual(visibility(screen, page({ elements: new Set(['stem']) })), { shown: true, placement: 'fixed_on_screen' });
  // Ink written at a video moment shows only at that moment (no object tracking).
  const onVideo = stroke({ id: 's3', anchor: { ...stroke().anchor, elementId: null, mediaPosition: 42 } });
  assert.equal(visibility(onVideo, page({ mediaPosition: 42.2 })).shown, true);
  assert.deepEqual(visibility(onVideo, page({ mediaPosition: 60 })), { shown: false, notice: 'other_video_moment' });
  assert.deepEqual(visibility(onVideo, page({ mediaPosition: null })), { shown: false, notice: 'other_video_moment' });
  // One mode working does not make the other unnecessary: both kinds exist side by side.
  assert.notDeepEqual(visibility(content, page()), visibility(screen, page()));
});

test('share stop: nothing is transmitted after stop, local ink is kept', () => {
  assert.equal(mayTransmit(page()), true);
  const stopped = page({ sharing: 'stopped' });
  assert.equal(mayTransmit(stopped), false);
  assert.equal(stroke().retained, true);
  assert.equal(visibility(stroke(), stopped).shown, true, 'the user still sees their ink after stopping the share');
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

test('INTENT-FAITHFUL-EXPORT: a share sheet is not an import; unknown stays unknown; organizing keeps the user answer and never submits', () => {
  assert.equal(reportExport(['file_prepared']), 'prepared');
  assert.equal(reportExport(['file_prepared', 'share_sheet_opened']), 'shared');
  assert.equal(reportExport(['file_prepared', 'share_sheet_opened', 'share_sheet_completed']), 'pending_import');
  assert.equal(reportExport(['file_prepared', 'share_sheet_opened', 'share_sheet_completed', 'no_response']), 'unknown');
  assert.equal(reportExport(['file_prepared', 'share_sheet_opened', 'share_sheet_completed', 'target_confirmed_import']), 'imported');
  assert.equal(reportExport(['file_prepared', 'error']), 'failed');
  const o = organize(['user derivation ink', 'user final answer'], ['AI layout suggestion']);
  assert.deepEqual(o.userLayers, ['user derivation ink', 'user final answer']);
  assert.deepEqual(o.aiLayers, ['AI layout suggestion']);
  assert.equal(o.aiChangesPreviewed, true);
  assert.equal(o.submitted, false);
});
