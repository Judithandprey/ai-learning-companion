// P0-12 TEST-ONLY reference model for the confirmed intent decisions on original-screen
// ink (docs/requirements/intent-and-decisions.md at 44e60ec): INTENT-INK-MODES,
// INTENT-NOTE-CLASSIFICATION (routing only), INTENT-ANSWER-PROMPT,
// INTENT-HOMEWORK-CHOICE, INTENT-FAITHFUL-EXPORT, plus share stop (R59/A44).
// Placeholder names; not a contract, not runtime code, and it says nothing about
// classification quality or real platform capability.

export type DisplayMode = 'content' | 'screen';
export type Purpose = 'note' | 'draft' | 'final_answer' | 'unknown';

export type Anchor = {
  readonly problemId: string;
  readonly problemVersion: number;
  readonly sourceVersion: number;
  /** Page element the stroke was written over (content mode); null when none. */
  readonly elementId: string | null;
  /** Video position when written; null when no video. */
  readonly mediaPosition: number | null;
};

export type Stroke = {
  readonly id: string;
  readonly mode: DisplayMode;
  readonly anchor: Anchor;
  readonly purpose: Purpose;
  /** Every purpose decision, oldest first; corrections never erase earlier ones. */
  readonly purposeHistory: ReadonlyArray<{ readonly purpose: Purpose; readonly by: 'ai' | 'user'; readonly basis: string }>;
  /** The original ink is never deleted by classification or routing. */
  readonly retained: true;
};

export type Page = {
  readonly problemId: string;
  readonly problemVersion: number;
  readonly sourceVersion: number;
  readonly elements: ReadonlySet<string>;
  readonly mediaPosition: number | null;
  readonly sharing: 'live' | 'stopped';
};

export type Visibility =
  | { readonly shown: true; readonly placement: 'with_content' | 'fixed_on_screen' }
  | { readonly shown: false; readonly notice: 'other_problem' | 'source_changed' | 'anchor_missing' | 'other_video_moment' };

const MEDIA_TOLERANCE_S = 0.5;

/**
 * Where (and whether) a stroke is drawn on the live page. Both modes keep their
 * origin; neither may silently attach to another problem, source version or video moment.
 */
export function visibility(s: Stroke, page: Page): Visibility {
  if (s.anchor.problemId !== page.problemId || s.anchor.problemVersion !== page.problemVersion) return { shown: false, notice: 'other_problem' };
  if (s.anchor.sourceVersion !== page.sourceVersion) return { shown: false, notice: 'source_changed' };
  if (s.anchor.mediaPosition !== null && (page.mediaPosition === null || Math.abs(page.mediaPosition - s.anchor.mediaPosition) > MEDIA_TOLERANCE_S)) {
    // No object tracking in video: ink for a video moment shows only at that moment.
    return { shown: false, notice: 'other_video_moment' };
  }
  if (s.mode === 'content') {
    if (s.anchor.elementId !== null && !page.elements.has(s.anchor.elementId)) return { shown: false, notice: 'anchor_missing' };
    return { shown: true, placement: 'with_content' };
  }
  return { shown: true, placement: 'fixed_on_screen' };
}

/** Live frames and ink leave the device only while sharing is live. Local saving never stops. */
export function mayTransmit(page: Page): boolean {
  return page.sharing === 'live';
}

// ---- purpose and routing ---------------------------------------------------------

export type Classification = { readonly purpose: Purpose; readonly confident: boolean; readonly basis: string };

export function classify(s: Stroke, c: Classification): { stroke: Stroke; clarify: boolean } {
  const purpose = c.confident ? c.purpose : 'unknown';
  return { stroke: { ...s, purpose, purposeHistory: [...s.purposeHistory, { purpose, by: 'ai', basis: c.basis }] }, clarify: !c.confident };
}

export function correct(s: Stroke, purpose: Purpose, basis: string): Stroke {
  return { ...s, purpose, purposeHistory: [...s.purposeHistory, { purpose, by: 'user', basis }] };
}

/** Notes go into the Notability flow; drafts stay in the process archive; final answers wait for the user's choice. */
export function route(s: Stroke): 'notability_flow' | 'process_archive_only' | 'await_answer_prompt' | 'await_clarification' {
  switch (s.purpose) {
    case 'note':
      return 'notability_flow';
    case 'draft':
      return 'process_archive_only';
    case 'final_answer':
      return 'await_answer_prompt';
    case 'unknown':
      return 'await_clarification';
  }
}

// ---- finished-answer prompt ------------------------------------------------------

export type AnswerSignal = 'finished_confident' | 'finished_unsure' | 'pause' | 'left_screen' | 'answer_correct' | 'still_editing' | 'switched_problem';

export type PromptState = { readonly asked: boolean; readonly declined: boolean; readonly problemId: string };

export type PromptDecision = 'ask_organize' | 'ask_done_and_organize_once' | 'no_prompt';

/**
 * INTENT-ANSWER-PROMPT: ask promptly when the on-screen answer is finished; when unsure, one
 * combined question; pausing, leaving or a correct answer alone are not "finished"; a
 * declined prompt is not repeated for the same problem.
 */
export function answerPrompt(state: PromptState, signal: AnswerSignal, problemId: string): { decision: PromptDecision; state: PromptState } {
  const s = state.problemId === problemId ? state : { asked: false, declined: false, problemId };
  if (s.declined || s.asked) return { decision: 'no_prompt', state: s };
  if (signal === 'finished_confident') return { decision: 'ask_organize', state: { ...s, asked: true } };
  if (signal === 'finished_unsure') return { decision: 'ask_done_and_organize_once', state: { ...s, asked: true } };
  return { decision: 'no_prompt', state: s };
}

export function decline(state: PromptState): PromptState {
  return { ...state, declined: true };
}

// ---- destinations and export states ---------------------------------------------

export type Capabilities = {
  readonly notabilityShare: boolean;
  /** Assignment material matched from an authorized source (e.g. bCourses): exact, ambiguous or none. */
  readonly homeworkDocument: 'matched' | 'ambiguous' | 'none';
};

export type Option = 'notability_homework' | 'homework_document' | 'confirm_which_assignment' | 'preview' | 'not_now';

/** Only paths that actually exist are offered; submission is never an option. */
export function destinationOptions(c: Capabilities): Option[] {
  const out: Option[] = [];
  if (c.notabilityShare) out.push('notability_homework');
  if (c.homeworkDocument === 'matched') out.push('homework_document');
  if (c.homeworkDocument === 'ambiguous') out.push('confirm_which_assignment');
  out.push('preview', 'not_now');
  return out;
}

export type ExportState = 'prepared' | 'shared' | 'pending_import' | 'imported' | 'failed' | 'unknown';

/** "imported" requires evidence from the target; a share sheet only proves "shared". */
export function reportExport(events: ReadonlyArray<'file_prepared' | 'share_sheet_opened' | 'share_sheet_completed' | 'target_confirmed_import' | 'error' | 'no_response'>): ExportState {
  let state: ExportState = 'prepared';
  for (const e of events) {
    if (e === 'file_prepared') state = 'prepared';
    else if (e === 'share_sheet_opened') state = 'shared';
    else if (e === 'share_sheet_completed') state = 'pending_import';
    else if (e === 'target_confirmed_import') state = 'imported';
    else if (e === 'error') state = 'failed';
    else if (e === 'no_response' && state !== 'imported') state = 'unknown';
  }
  return state;
}

/** Organizing preserves the user's answer, derivation and layout; AI changes are separate and previewable. */
export type Organized = { readonly userLayers: ReadonlyArray<string>; readonly aiLayers: ReadonlyArray<string>; readonly aiChangesPreviewed: boolean; readonly submitted: false };

export function organize(userLayers: ReadonlyArray<string>, aiSuggestions: ReadonlyArray<string>): Organized {
  return { userLayers: [...userLayers], aiLayers: [...aiSuggestions], aiChangesPreviewed: aiSuggestions.length > 0, submitted: false };
}
