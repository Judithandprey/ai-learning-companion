# P0-13 QA acceptance plan: INTENT cases, V cases and the phase backlog

Specification: `44e60ec289717e155fb0f4374784c791bf23689c`, updated for
`9ce270cc747676889797199b7e8455ccfef07a5f`: R12 must show system-predicted candidates
generated before selection, and R20/R22 must compare session-aware rest responses
and urgency/importance-driven reminder decisions (documents only; contract v0.1.0
unchanged; no new R/A). Sources:
- `docs/requirements/intent-and-decisions.md` §3–4
- `docs/requirements/original-goal-verification.md`
- `docs/tasks.md` (the P0-13 card and the phase backlog)
- `docs/requirements.md`
- `docs/roles/qa.md`

This is a QA plan only. **Every INTENT-, V- and backlog item below is unexecuted and
unaccepted.** It extends the
[A26–A46/G7 matrix](p0-13-acceptance-matrix.md) and does not replace it.

## QA acceptance rules for these cases

1. **Behavior, not labels.** A case passes only when the real-path behavior and its
   negative controls are observed. Field presence, tags, fixture labels, UI strings,
   probe agreement and model self-scores are supporting evidence, never the pass.
2. **Separate evidence dimensions.** Report each separately:
   - display mode (content-anchored / screen-fixed);
   - content purpose (note / draft / final answer, including mixed and corrected);
   - destination choice and actual outcome;
   - platform or path (web overlay / Windows P3 / iPad-iPhone native / A45 fallback).

   One cell's success cannot fill another. A fallback never passes A44 or
   INTENT-INK-MODES on the original screen.
3. **No false positives.** Record every false completion, false import, reverse
   drift and repeated prompt, each with a denominator. Numbers not stated in the
   specification (completion thresholds, prompt de-duplication windows, sample
   sizes) are **engineering defaults**. Report their actual distribution.
4. **Separate reports.** Report separately: phase slice completed versus remaining;
   source/compile/automated/provider/device/user-trial status; synthetic versus
   real course, account and device.
5. **No authority is granted by testing.** Testing never grants homework
   submission, external writes beyond the task, purchases or messages.

## INTENT cases (intent-and-decisions.md §4)

**INTENT-INK-MODES.**
- *Implementation owners and phase:* iOS P2-03; Web P3-02 (Windows); web overlay per
  site.
- *Scenarios QA must observe:*
  - Write in each mode, on each supported path, and include a mixed-mode session.
  - Scroll, zoom, reflow, change page, advance video and change problem.
  - Save, force-quit and reopen.
  - Stop sharing.
- *Negative controls:*
  - screen-fixed ink losing its source or frame;
  - content-anchored ink silently attached to the new problem or page;
  - a claim of arbitrary video-object tracking;
  - one mode's success reported for both;
  - own-canvas or frozen results reported as original-screen.
- *Evidence:* per mode × path × event: anchor before/after, the retained original and
  source, the composite the AI actually received (ink present), and finger
  navigation that still works.

**INTENT-NOTE-CLASSIFICATION.**
- *Implementation owners and phase:* Learning and Backend supporting iOS P2-04.
- *Scenarios QA must observe:*
  - One session mixes a note, a draft and a final answer.
  - Include a context misclassification that the user corrects, and an uncertain
    case that gets a single minimal clarification.
  - Test both display modes with both purposes.
- *Negative controls:*
  - per-stroke manual tagging required;
  - a draft auto-sent to Notability;
  - a correction that deletes or rewrites the original;
  - the display mode deciding the purpose;
  - a corrected purpose drifting to another problem;
  - a draft sent externally after being wrongly labeled.
- *Evidence:* classification basis versus user correction history. Only notes are
  filed to Notability automatically. Drafts are never auto-sent and stay complete in
  the process archive (hash unchanged). A draft that becomes a final answer follows
  the user's organize choice (INTENT-ANSWER-PROMPT and INTENT-HOMEWORK-CHOICE), which
  may be Notability.

**INTENT-ANSWER-PROMPT.**
- *Implementation owners and phase:* Learning P1-06 (when the screen-answer path is
  enabled); P2-04.
- *Scenarios QA must observe:*
  - Compare actual completion with a short pause, continued rewriting, a correct but
    unfinished answer, leaving the screen, a topic switch, and an explicit refusal.
  - Include a draft that becomes the final answer.
- *Negative controls:*
  - a pause, a correct value or leaving the screen treated as completion;
  - a prompt that arrives late for an old problem;
  - a repeated prompt after refusal;
  - more than one merged clarification per uncertain completion;
  - a prompt never shown so that organization must be requested manually.
- *Evidence:* prompt timestamps against human-labeled completion, counts of false and
  missed prompts, and refusal de-duplication per problem (after a refusal, the same
  problem is not asked again, including after a version bump). Thresholds are
  engineering defaults.

**INTENT-HOMEWORK-CHOICE.**
- *Implementation owners and phase:* Learning P1-06; iOS P2-04. Source connections
  follow the backlog owners.
- *Scenarios QA must observe:*
  - The options offered right after completion are real and available: Notability
    homework archive, the matching assignment PDF or document from bCourses or
    another connected site, preview, and "not now".
  - Include ambiguous course/assignment/problem/version cases, an expired or revoked
    source, and a draft that later becomes the final answer and is still organized
    by the user's choice.
- *Negative controls:*
  - hard-coded destinations;
  - unavailable paths offered;
  - the user asked again for sources already saved;
  - the wrong assignment, problem number or version;
  - a bCourses source treated as permission to submit;
  - "opened in Notability once" treated as write access.
- *Evidence:* the option list compared with the real capability state, the
  association to the source version, and a short question only when ambiguous.

**INTENT-FAITHFUL-EXPORT.**
- *Implementation owners and phase:* iOS P2-04 with Learning and Backend; Backend
  owns the OneNote connector in P2.
- *Scenarios QA must observe:*
  - The preview and the organized output keep the user's answer, derivation, errors,
    corrections and original layout.
  - AI suggestions are distinguishable, previewable and confirmable.
  - Test export versus share versus actual import; failure and unknown outcomes;
    retries.
- *Negative controls:*
  - silent correction, or replacement with a standard solution;
  - help-assisted work labeled independent;
  - a share sheet or PDF/PNG called imported native strokes;
  - duplicate external documents on retry;
  - the editable original lost in the app;
  - any homework submission.
- *Evidence:* diffs of original versus organized versions, per-state receipts with
  unknown results reconciled, an inspected target document, and an unchanged
  in-app original.

### Combination grid QA will require (P2-03/P2-04, per supported path)

| Display \ purpose | Note | Draft | Final answer | Mixed / corrected |
| --- | --- | --- | --- | --- |
| Content-anchored | Anchored across scroll/zoom; archived to Notability | Retained, not auto-sent | Prompt after completion, then the user's choice | Correction keeps the original; no drift |
| Screen-fixed | Keeps its source; archived | Retained, not auto-sent | Prompt, then the user's choice | As left |

Each filled cell needs its own real-path evidence plus the negative controls above.
An A45 fallback row is reported separately and never fills a cell.

## Original-goal V cases (original-goal-verification.md)

Owner = implementation lead; QA independently verifies every case. The earliest QA
evidence point is the first phase where a real run is possible. Synthetic, fixture
or probe results never pass these cases.

| V case | Owner / phases | QA must see (key) | QA will reject as evidence |
| --- | --- | --- | --- |
| DailyResume | iOS (+backend, learning, web); P1, P3 | Real iPad next-day resume with Calendar/Canvas progress, voice follow-up, saved note and source; a self-study project without Canvas; refresh vs revocation | The select → fixture card → save → restart probe; an empty project; re-sending the URL |
| ModelSwitchContext | learning (+backend); P1–P3 | Real switch between two callable models: early details, corrections and goals kept; when the temporary language override ends, English-first returns; no cross-user or cross-course leak | A mock with a relabelled model; summary similarity; the same login |
| WorkAgentActualAction | web (+learning, backend, lead); P4 | Real Windows Codex/Claude Code task: tool actions, mid-task steering, actual cancel or honest "unconfirmed", cross-day memory | Login; screen watching; a fabricated tool log |
| CacheProvenanceLatency | learning (+backend, clients); P1–P2 | **R12 (9ce270c):** on a new, not-prefilled segment, the system itself predicts candidate concepts from the real course position, materials and personal understanding, and generates content **before** the user selects; retained evidence shows the candidate grounds, the generation task and its source-versioned artifact, and a generation-complete event causally before the selection. Then hit/miss with matching source, understanding and help level; §11 latency (P95 ≤ 300 ms prefetched, miss status ≤ 150 ms, P50 ≤ 3 s / P95 ≤ 6 s first content). Pre-generation never authorizes early display | Any cache hit on its own, even a real one; manually pre-seeded answers; generation only after the click; a progress bar; same-word hits across courses |
| FutureCourseEvidence | learning (+backend); P1–P2 | Real later-chapter citations, or an honest "general use" when none exists | Invented teacher plans; same-name concepts from other courses |
| ReuseEvidence | lead (+modules); P0–P4 | ADR with license/version, minimal real integration, remaining responsibility | An installed dependency; a copied example; brand lists |
| SupervisionGoalHistory | learning (+backend, clients); P1, P3 | Evidence-based supervision, prerequisite lookup vs distraction, cross-day goals, calibrated tone; no leaks in "let me try" | App-name heuristics; invented user states; nagging templates |
| ExitReminderTimer | backend (+clients, learning); P3 (capture-stop protection applies from the earliest enabled path) | **R20/R22 (9ce270c):** paired identical rest requests under different actual study durations/session histories, with the actual responses and cited grounds; after exit, authorized reminders whose timing, intensity/frequency and wording respond to real urgency/importance (deadlines, progress, goals), with urgency and importance varied separately, recorded decision grounds, the user's feedback, and actual delivery; timing and intensity stay within the user's actual pause and authorization. Either a change or an unchanged schedule needs a checkable reason. Plus wall-clock timers across restart and devices; scoped stops; no revived capture; actual channel receipts | Fixed response templates or fixed periods; inferred fatigue or motives; invented deadlines; no reply read as non-completion; an arbitrary fixed threshold used as the pass rule; media-time timers; local notification counted as SMS/social delivery |
| ArchiveCompanionContinuity | backend (+learning, clients); P1–P3 | Real archive with early details retrievable after compression, rebuild and restart; deletion without resurrection. §11: at least 50 exact history questions with Top-5 correct-source recall ≥ 95%, and at least 30 fuzzy cases | A test corpus alone; summaries replacing sources |
| MemoryCapacityTransparency | backend (+learning, lead); P2–P3 | Measured capacity and cost, with no silent recent-N truncation | "Infinite memory" claims |
| AutonomousPreparationCycle | learning + backend (+lead); P3–P4 | Plan → execute → verify → adjust → remember, run offline with source-backed artifacts | Suggestions only; a user commanding every step |
| LongRunningCompanionship | iOS, web, backend, learning; P3 (honest disconnect from P1) | Long sessions with real gaps, freshness, resources and cost | Silent source loss |
| EntitlementBudgetQuality | lead (+backend, learning); P0, P3, P4 | Official entitlements; atomic concurrent reservation; ≥30 real-course full-flagship comparisons | Schema validation; development-subscription usage |
| DistractionAppCapability | iOS, web (+lead, backend); P4 | Per-app/platform apply, undo and refusal on real platforms | Reminder success counted as restriction |
| ResourceNeedEvidence | lead (+all); P0 method, P3 | Reproducible measurements with denominators | Estimates without runs |
| LearningProgress | learning (+backend, clients); P1–P3 | Plan, progress and help-aware mastery kept separate | Watch time or calendar completion counted as mastery |
| ProactiveTeaching | learning (+clients, backend); P1–P2 | Optional quiet teaching in normal course viewing still works, and is not globally disabled by "let me try". §11: voice interrupt to client stop P95 ≤ 300 ms | A fixture card |
| SourceTimeRelations | iOS/web (+backend, learning); P1–P3 | Teacher words, frame, user quote and ink time relations; missing capture disclosed. §11: ink saved locally ≤ 500 ms after the stroke ends; 0 AI queries across a fixed 100-run navigation/tap/zoom/scrub/write script, with a real-device check | Invented frames |
| MultiDeviceUnderstanding | backend (+learning, clients); P3 (P4 work-instruction effects: see V-WorkAgentActualAction) | Three real sources: related, unrelated and stale; individual stops | Room membership alone |

## Phase backlog: QA acceptance entry per item (tasks.md phase-backlog)

These items are not dispatched. QA's gate for each is the direct cases listed in
the backlog plus the V/INTENT/A items mapped here.

| Backlog | QA acceptance cases | Must not close on |
| --- | --- | --- |
| P1-01 Calendar/URL/Canvas | V-DailyResume, A17, A23–25; next-day/next-week restore; duplicate, changed, timezone | Registration or login; a single URL save |
| P1-02 iPad selection/source | A01–03, A12, A26, A44–45; §11 accidental input and latency | DOM text or desktop results |
| P1-03 Voice | A05, A06, A14; V-SourceTimeRelations; real interruption and cancellation of the old queue; §11 timing | A text-only silent fixture |
| P1-04 Continuity/progress | A09–13, A23–24; V-ModelSwitchContext, V-ArchiveCompanionContinuity, V-LearningProgress | A test corpus alone |
| P1-05 Local notes | A19, A27 when ink is offered; R46 incompleteness must be declared when only AI text notes exist | An AI text note reported as R46 handwriting |
| P1-06 Real problem loop | A30–43, A45; INTENT-ANSWER-PROMPT, INTENT-HOMEWORK-CHOICE when the screen-answer path is on | An A45 fallback reported as A44; synthetic cases |
| P2-01 Adaptive teaching/cache | A04, A05, A19, A29, A39; V-CacheProvenanceLatency (including R12 system-predicted candidates generated before selection), V-FutureCourseEvidence, V-ProactiveTeaching | `cache_hit` flags; pre-seeded answers; post-click generation; animations |
| P2-02 Diagnosis/mastery/language | A35–40; V-LearningProgress; semantic review plus user trial | Label or probe agreement |
| P2-03 Two display modes, original screen | A26, A27, A44–45; INTENT-INK-MODES | One mode; own canvas; fallback |
| P2-04 Classification/organization/export plus OneNote | A27, A28, A46; all five INTENT cases; OneNote page-id readback with reconciliation of unknown results | A share sheet; PDF/PNG as native ink; OneNote treated as a Notability substitute; any submission |
| P2-05 Archive/capacity | A09–12, A38; V-ArchiveCompanionContinuity, V-MemoryCapacityTransparency | Silent truncation; infinite claims |
| P3-01 Three devices | A15, A16, A31, A34, A38, A40; V-MultiDeviceUnderstanding, V-SourceTimeRelations | Room membership |
| P3-02 Windows desktop annotation | A44–46, INTENT-INK-MODES on Windows | Web or frozen-canvas success |
| P3-03 Autonomous preparation | A17, A18; V-AutonomousPreparationCycle | Suggestions without actual artifacts |
| P3-04 Supervision | A07, A13, A29; V-SupervisionGoalHistory, V-ProactiveTeaching | Leaks in exploration; invented motives |
| P3-05 Break/exit/reminders | A08, A14, A16, A22; V-ExitReminderTimer (including R20 session-aware rest responses and R22 urgency/importance-driven reminder decisions) | Timer delivery alone; fixed templates; sent reported as read; media-time timers |
| P3-06 Entitlement/budget/quality | A20, A21; V-EntitlementBudgetQuality; ≥30 comparisons | Development effort as product routing |
| P3-07 Long sessions/resources | V-LongRunningCompanionship, V-ResourceNeedEvidence, V-MemoryCapacityTransparency | Estimates only |
| P3-08 Resilient Calendar/source sync | A17, A23–25; V-DailyResume, V-AutonomousPreparationCycle | Deferring all P1 Calendar work to P3 |
| P4-01 Codex work Agent | V-WorkAgentActualAction | Login, prompts or fake receipts |
| P4-02 Claude Code adapter | V-WorkAgentActualAction, V-EntitlementBudgetQuality | Blanket parity claims |
| P4-03 Distraction-app limits | V-DistractionAppCapability | Reminder success |
| P4-04 Optional social channels | V-ExitReminderTimer | Inferred permission; automatic contact |

## Current QA status

- INTENT: 0/5 executed.
- V: 0/19 executed.
- Backlog acceptance: 0/23 executed.
- Synthetic review completed so far: 37 + 28 learning cases (see the
  [case review](p0-13-case-review.md) and the
  [surfaces review](p0-13-surfaces-review.md)), plus learning's 32 reconciliation rows
  and 16 unexecuted INTENT design scenarios in `7da2298`
  ([reconciliation review](p0-13-reconciliation-review.md)). This review is design
  evidence only.
- The learning fixture corpora contain no INTENT case (they predate `44e60ec`).
  `7da2298` adds 16 prose INTENT scenarios (I01–I16), unexecuted and without
  machine-readable labels; QA's coverage gaps for them are in the reconciliation
  review. Executable classification, completion-prompt and faithful-export vectors
  remain pending.
- **Blockers:**
  - the P0-08 contract;
  - fixed runnable integration candidates;
  - a Mac/Xcode or hosted build path, and iPad/Windows devices;
  - authorized Calendar, Canvas, bCourses and Notability/OneNote access;
  - consented user trials.
