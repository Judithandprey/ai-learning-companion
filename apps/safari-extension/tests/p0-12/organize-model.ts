// P0-12 TEST-ONLY reference model for the confirmed intent decisions on original-screen
// ink (docs/requirements/intent-and-decisions.md at 44e60ec): INTENT-INK-MODES,
// INTENT-NOTE-CLASSIFICATION (routing only), INTENT-ANSWER-PROMPT,
// INTENT-HOMEWORK-CHOICE, INTENT-FAITHFUL-EXPORT, plus share stop (R59/A44).
// Aligned with the proposed ADR 0002 §4/§7/§8 at 693069a (display behavior during
// playback, scoped share stop, layered export and possible external exposure).
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
  /** Video position when written (the written-at context); null when no video. */
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
  /** Current problem as known from the page; null when it cannot be determined. */
  readonly problemId: string | null;
  readonly problemVersion: number;
  readonly sourceVersion: number;
  readonly elements: ReadonlySet<string>;
  readonly mediaPosition: number | null;
  readonly sharing: 'live' | 'stopped';
};

export type Visibility =
  | {
      readonly shown: true;
      readonly placement: 'with_content' | 'fixed_on_screen';
      /** Written-at video position, shown with the ink; the ink does not become part of later frames. */
      readonly writtenAt: number | null;
    }
  | { readonly shown: false; readonly notice: 'other_problem' | 'problem_uncertain' | 'source_changed' | 'placement_unresolved' };

/** A content transform for video ink exists only for the frame it was written on (engineering default). */
const SAME_FRAME_TOLERANCE_S = 0.5;

/**
 * Where (and whether) a stroke is drawn on the live page. Both modes keep their
 * original anchors and are never silently re-attached to another problem or
 * material version. Screen-fixed ink stays on screen while the same known problem
 * and source continue, including ordinary video playback, and keeps its written-at
 * context. Content-attached ink is drawn only where a valid content transform
 * exists (its element, or its own video frame); there is no video-object tracking,
 * so elsewhere its placement is unresolved and it is hidden with a notice.
 */
export function visibility(s: Stroke, page: Page): Visibility {
  if (page.problemId === null) return { shown: false, notice: 'problem_uncertain' };
  if (s.anchor.problemId !== page.problemId || s.anchor.problemVersion !== page.problemVersion) return { shown: false, notice: 'other_problem' };
  if (s.anchor.sourceVersion !== page.sourceVersion) return { shown: false, notice: 'source_changed' };
  const writtenAt = s.anchor.mediaPosition;
  if (s.mode === 'screen') return { shown: true, placement: 'fixed_on_screen', writtenAt };
  if (s.anchor.elementId !== null && !page.elements.has(s.anchor.elementId)) return { shown: false, notice: 'placement_unresolved' };
  if (writtenAt !== null && (page.mediaPosition === null || Math.abs(page.mediaPosition - writtenAt) > SAME_FRAME_TOLERANCE_S)) {
    return { shown: false, notice: 'placement_unresolved' };
  }
  return { shown: true, placement: 'with_content', writtenAt };
}

// ---- share stop (ADR 0002 §4) ------------------------------------------------------

export type Outgoing =
  /** New capture of the shared path: frames or ink, sent as live. */
  | { readonly kind: 'live_frame' | 'live_ink' }
  /** Already saved original ink/frames, sent later as history. */
  | { readonly kind: 'history'; readonly capturedBeforeStop: boolean; readonly separatelyAuthorized: boolean; readonly labeledAsHistory: boolean };

/**
 * Stopping a share ends new capture and live sending on that path. Local saving of
 * pre-stop originals never stops. Pre-stop history may sync only when separately
 * authorized and verified/labeled as history; it never restarts the share and is
 * never presented as live. This function decides only; it has no side effects.
 */
export function mayTransmit(page: Page, out: Outgoing): { allowed: boolean; reason: string } {
  if (out.kind !== 'history') {
    return page.sharing === 'live' ? { allowed: true, reason: 'live_share' } : { allowed: false, reason: 'share_stopped' };
  }
  if (!out.capturedBeforeStop) return { allowed: false, reason: 'not_pre_stop_original' };
  if (!out.separatelyAuthorized) return { allowed: false, reason: 'history_sync_not_authorized' };
  if (!out.labeledAsHistory) return { allowed: false, reason: 'would_appear_live' };
  return { allowed: true, reason: 'authorized_history' };
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
export function reportExport(events: ReadonlyArray<ExportEvent>): ExportState {
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

export type ExportEvent = 'file_prepared' | 'share_sheet_opened' | 'share_sheet_completed' | 'target_confirmed_import' | 'error' | 'no_response';

/**
 * ADR 0002 §7: help-bearing content that was shared or imported, or whose dispatch
 * may have taken effect with an unknown outcome, is a possible external exposure.
 * Preparation alone, or a failure before anything left the app, is not. Whether the
 * learner actually read it stays unknown unless separately observed.
 */
export function externalExposure(events: ReadonlyArray<ExportEvent>, helpBearing: boolean): { exposure: 'none' | 'possible'; learnerRead: 'unknown' } {
  const left = events.some((e) => e === 'share_sheet_opened' || e === 'share_sheet_completed' || e === 'target_confirmed_import' || e === 'no_response');
  return { exposure: helpBearing && left ? 'possible' : 'none', learnerRead: 'unknown' };
}

// ---- export manifest and confirmation (ADR 0002 §8) -----------------------------

export type AiLayer = {
  readonly id: string;
  /** Layout-only change, a separate addition, or a change to the learner's answer. */
  readonly kind: 'layout' | 'addition' | 'correction';
  /** Current disclosure check for this layer passed at dispatch time. */
  readonly permittedNow: boolean;
};
export type Manifest = { readonly id: string; readonly userLayers: ReadonlyArray<string>; readonly aiLayers: ReadonlyArray<AiLayer> };
export type Confirmation = { readonly manifestId: string; readonly previewedAiLayerIds: ReadonlyArray<string>; readonly scope: 'layout_only' | 'content' };

/**
 * External dispatch of an organized answer. The confirmation is bound to this exact
 * manifest; every exported AI layer must have been in the confirmed preview and must
 * pass the current disclosure check; layout-only consent never covers a correction.
 * Revalidation that changes content means a new manifest id and a new confirmation.
 * Nothing here submits homework.
 */
export function mayDispatch(m: Manifest, c: Confirmation | null): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!c || c.manifestId !== m.id) reasons.push('confirmation_for_other_manifest');
  for (const l of m.aiLayers) {
    if (c && !c.previewedAiLayerIds.includes(l.id)) reasons.push(`layer_not_previewed:${l.id}`);
    if (!l.permittedNow) reasons.push(`layer_not_permitted_now:${l.id}`);
    if (l.kind === 'correction' && c?.scope !== 'content') reasons.push(`correction_needs_content_consent:${l.id}`);
  }
  return { allowed: reasons.length === 0, reasons };
}

/** Organizing preserves the user's answer, derivation and layout; AI changes are separate and previewable. */
export type Organized = { readonly userLayers: ReadonlyArray<string>; readonly aiLayers: ReadonlyArray<string>; readonly aiChangesPreviewed: boolean; readonly submitted: false };

export function organize(userLayers: ReadonlyArray<string>, aiSuggestions: ReadonlyArray<string>): Organized {
  return { userLayers: [...userLayers], aiLayers: [...aiSuggestions], aiChangesPreviewed: aiSuggestions.length > 0, submitted: false };
}
