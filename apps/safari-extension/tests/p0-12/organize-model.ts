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
  const history = [...s.purposeHistory, { purpose, by: 'ai' as const, basis: c.basis }];
  // The user's explicit purpose stands until the user changes it (QA ORG-9): a later AI
  // classification is kept as a suggestion, and a confident different one is asked about.
  if (s.purposeHistory.some((h) => h.by === 'user')) return { stroke: { ...s, purposeHistory: history }, clarify: c.confident && c.purpose !== s.purpose };
  return { stroke: { ...s, purpose, purposeHistory: history }, clarify: !c.confident };
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

/**
 * Per question: the prompt actually shown (its id) and the prompt the user declined. A refusal
 * is scoped to its question and survives visiting other questions, edits and retries.
 */
export type PromptState = {
  readonly questions: Readonly<Record<string, { readonly shown: string | null; readonly declined: string | null }>>;
  readonly shownCount: number;
};

export const initialPromptState: PromptState = { questions: {}, shownCount: 0 };

export type PromptDecision = 'ask_organize' | 'ask_done_and_organize_once' | 'no_prompt';

/**
 * INTENT-ANSWER-PROMPT: ask promptly when the on-screen answer is finished; when unsure, one
 * combined question; pausing, leaving or a correct answer alone are not "finished"; a
 * question already asked or declined is not asked again. The returned prompt id names what
 * a later refusal or reopening refers to.
 */
export function answerPrompt(state: PromptState, signal: AnswerSignal, problemId: string): { decision: PromptDecision; state: PromptState; promptId: string | null } {
  const q = state.questions[problemId] ?? { shown: null, declined: null };
  if (q.shown || q.declined || (signal !== 'finished_confident' && signal !== 'finished_unsure')) return { decision: 'no_prompt', state, promptId: null };
  const promptId = `${problemId}#${state.shownCount + 1}`;
  const next: PromptState = { questions: { ...state.questions, [problemId]: { ...q, shown: promptId } }, shownCount: state.shownCount + 1 };
  return { decision: signal === 'finished_confident' ? 'ask_organize' : 'ask_done_and_organize_once', state: next, promptId };
}

const questionOf = (state: PromptState, promptId: string): string | undefined =>
  Object.keys(state.questions).find((k) => state.questions[k]!.shown === promptId);

/**
 * The user declined the prompt `promptId`. It stays evidence for that prompt's question even
 * when it arrives after the user moved on; it never touches another question. A refusal of a
 * prompt that was never shown is ignored.
 */
export function decline(state: PromptState, promptId: string): PromptState {
  const k = questionOf(state, promptId);
  return k ? { ...state, questions: { ...state.questions, [k]: { ...state.questions[k]!, declined: promptId } } } : state;
}

/**
 * The user explicitly asks to organize the question again. Only a reopening that is causally
 * later than the refusal (it names the refusal it saw) supersedes it; with an unknown order
 * the refusal is kept. Nothing here organizes or submits anything by itself.
 */
export function reopen(state: PromptState, problemId: string, sawDeclined: string | null): { allowed: boolean; state: PromptState } {
  const q = state.questions[problemId];
  if (!q?.declined) return { allowed: true, state };
  if (q.declined !== sawDeclined) return { allowed: false, state };
  return { allowed: true, state: { ...state, questions: { ...state.questions, [problemId]: { ...q, declined: null } } } };
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

/**
 * Export events, one sequence per note/manifest. `prepared` starts the initial attempt;
 * opening the panel again after an attempt ended starts a new attempt (a reopen).
 * - `panel_opened`: the share panel is shown locally. This is not evidence of dispatch.
 * - `cancelled_before_dispatch` / `failed_before_dispatch`: ended with no external effect.
 * - `dispatch_started`: evidence that a target was handed the content.
 * - `dispatch_completed`: the share system reports delivery to the chosen target.
 * - `dispatch_outcome_unknown`: after dispatch started, no result arrived.
 * - `target_import_confirmed`: the target itself shows the import (A46 evidence).
 * - `no_response`: a generic timeout. Before any dispatch evidence it creates no external effect.
 *
 * Local events can be missing or reordered. Evidence of an external effect is never discarded:
 * a delivery report, an unknown outcome or a dispatch start raises the attempt even without a
 * local `dispatch_started` or after a local cancel or failure. An import report that is not
 * chained to a dispatch of this attempt is a possible external effect, not a verified import.
 */
export type ExportEvent =
  | 'prepared'
  | 'panel_opened'
  | 'cancelled_before_dispatch'
  | 'failed_before_dispatch'
  | 'dispatch_started'
  | 'dispatch_completed'
  | 'dispatch_outcome_unknown'
  | 'target_import_confirmed'
  | 'no_response';

export type AttemptState =
  | 'prepared'
  | 'panel_open'
  | 'cancelled'
  | 'failed_before_dispatch'
  | 'dispatching'
  | 'shared_pending_import'
  | 'dispatch_unknown'
  | 'imported'
  /** Import evidence with no dispatch of this attempt: a possible external effect, outcome unverified. */
  | 'effect_unverified';

const PRE_DISPATCH: ReadonlySet<AttemptState> = new Set(['prepared', 'panel_open']);
const ENDED: ReadonlySet<AttemptState> = new Set(['cancelled', 'failed_before_dispatch', 'shared_pending_import', 'dispatch_unknown', 'imported', 'effect_unverified']);
const DISPATCHED: ReadonlySet<AttemptState> = new Set(['dispatching', 'shared_pending_import', 'dispatch_unknown', 'imported']);
/** How much external effect an attempt's evidence shows; evidence only ever raises it. */
const EFFECT: Readonly<Record<AttemptState, number>> = {
  prepared: 0,
  panel_open: 0,
  cancelled: 0,
  failed_before_dispatch: 0,
  dispatching: 1,
  dispatch_unknown: 1,
  effect_unverified: 1,
  shared_pending_import: 2,
  imported: 3,
};

export type ExportReport = {
  /** Every attempt in order; a later attempt never rewrites an earlier one. */
  readonly attempts: ReadonlyArray<AttemptState>;
  readonly latest: AttemptState | null;
  /** Some attempt was delivered to a target (shared, awaiting import). */
  readonly everShared: boolean;
  /** Some attempt has target evidence of an actual import. */
  readonly everImported: boolean;
  /** Some attempt has dispatch evidence. */
  readonly everDispatched: boolean;
  /** Some attempt may have had an external effect (dispatch evidence or an unverified effect report). */
  readonly everExternalEffect: boolean;
};

/**
 * "Imported" needs target evidence; a completed share is only "shared, awaiting import";
 * opening a panel is only local. Cancellation, failure or reopening never erases what an
 * earlier attempt already did.
 */
export function reportExport(events: ReadonlyArray<ExportEvent>): ExportReport {
  const attempts: AttemptState[] = [];
  const set = (st: AttemptState): void => {
    attempts[attempts.length - 1] = st;
  };
  /** Raises the current attempt (or records one) to at least this evidence; never lowers it. */
  const raise = (st: AttemptState): void => {
    const cur = attempts.at(-1);
    if (cur === undefined) attempts.push(st);
    else if (EFFECT[st] > EFFECT[cur]) set(st);
  };
  for (const e of events) {
    const cur = attempts.at(-1);
    switch (e) {
      case 'prepared':
        attempts.push('prepared');
        break;
      case 'panel_opened':
        if (cur === 'prepared') set('panel_open');
        else if (cur === undefined || ENDED.has(cur)) attempts.push('panel_open');
        break;
      case 'cancelled_before_dispatch':
        if (cur !== undefined && PRE_DISPATCH.has(cur)) set('cancelled');
        break;
      case 'failed_before_dispatch':
        if (cur !== undefined && PRE_DISPATCH.has(cur)) set('failed_before_dispatch');
        break;
      case 'dispatch_started':
        raise('dispatching');
        break;
      case 'dispatch_completed':
        raise('shared_pending_import');
        break;
      case 'dispatch_outcome_unknown':
        // It reports a dispatch that started and has no result.
        if (cur === 'dispatching') set('dispatch_unknown');
        else raise('dispatch_unknown');
        break;
      case 'no_response':
        // A generic timeout creates no effect; after a dispatch start the outcome becomes unknown.
        if (cur === 'dispatching') set('dispatch_unknown');
        break;
      case 'target_import_confirmed':
        if (cur !== undefined && DISPATCHED.has(cur)) set('imported');
        else raise('effect_unverified');
        break;
    }
  }
  return {
    attempts,
    latest: attempts.at(-1) ?? null,
    everShared: attempts.some((a) => a === 'shared_pending_import' || a === 'imported'),
    everImported: attempts.includes('imported'),
    everDispatched: attempts.some((a) => DISPATCHED.has(a)),
    everExternalEffect: attempts.some((a) => EFFECT[a] > 0),
  };
}

/**
 * ADR 0002 §7: help-bearing content from an attempt that was shared, imported, dispatched
 * with a possibly effective (unknown) outcome, or reported as an unverified external effect
 * is a possible external exposure. Preparation, opening a panel, cancelling before dispatch,
 * or a generic timeout without dispatch evidence is not; a missing local dispatch event is
 * not proof of none. Whether the learner actually read it stays unknown.
 */
export function externalExposure(events: ReadonlyArray<ExportEvent>, helpBearing: boolean): { exposure: 'none' | 'possible'; learnerRead: 'unknown' } {
  return { exposure: helpBearing && reportExport(events).everExternalEffect ? 'possible' : 'none', learnerRead: 'unknown' };
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
