# Problem-Solving Companion Specification (requirements v1.1)

> English working derivative: the initial complete translation used source commit `d26f85c1f4be52f8de9815e8a7239eb9e2d8fdbf`; subsequent synchronized source/English increments are versioned in `english-translation-manifest.json` (under `docs/requirements`). Applicable originals and later explicit user decisions govern. Original quotations remain unchanged; links below intentionally point to the original documents. This derivative grants no new authority and makes no capability or performance claim.

On 2026-09-28 UTC, the user explicitly approved formally incorporating this increment and having the team develop against it. This document is a normative part of the
[main specification](../requirements.md), implementing R51–R59, A30–A46, and G7;
it must be read together with the sections relevant to the task. It is not a report that the requirements have been implemented or have passed acceptance.

Also read [User Intent and Decisions](intent-and-decisions.md) and [Original Goal Verification](original-goal-verification.md). Actual answers have been received for all three questions in this round; the pending statuses in the earlier review have been updated. The refinements below build on R03/R08/R46–R59 and A26–A46; they do not introduce additions or silent changes to the v0.1.0 protocol.

Source: the user-provided *AI Learning Companion—Problem-Solving Companion Requirements Review and Additions* (translated title), SHA-256
`f675e6ab00359b91263f21c896a4acd09177a1cae39a4357cc431ab0ceb705c1`.
The original document's descriptions of “suggested / not incorporated / not dispatched” describe its review status before approval, not the current product status.
The user confirmed the added behavioral goals; the data names, field organization, hint levels, sample counts,
numerical values, and phase arrangements below are engineering defaults. They may be improved while preserving the core behavior and verification evidence.

Preserve R01–R50, A01–A29, platform capability boundaries, and budget boundaries. Preserve v0.1.0 compatibility and use assigned released additive contracts (currently through v0.2.6);
this document does not claim that new entities, interfaces, migrations, or platform capabilities have already been connected. The lead engineer coordinates the evolution of shared contracts,
and the backend role exclusively owns database migrations. Updating the documentation must not disrupt the original P0 tasks already running.

Under [D-DESKTOP-FIRST](intent-and-decisions.md#desktop-first), complete Windows and macOS first, independently running every applicable acceptance behavior on both. Preserve iPad/phone source, history and Pencil/native-overlay/three-device variants for later; Sidecar is only a later candidate. A minimal loop or one OS passing is not full desktop delivery.

Six goals: reduce manual screenshots through continuous sharing; preserve the complete observable trial-and-error process and its gaps; support independent exploration without answering prematurely;
use evidence to support the earliest demonstrable divergence, valid revisions, and questions about unknown reasons; provide intuitive demonstrations in small steps and practice feedback;
use English-first technical terms with brief Chinese hints where needed.

The user's clarifications in this round cover webpage selections, text / formulas, webpage handwriting, external notes, and mixed use of multiple response surfaces.
In particular, “using this product's pen to write directly on the current original screen while sharing” belongs to the classroom-note
and external-archiving goals already in R03/R08/R46–R48; R59 only makes those goals explicit and more detailed. It must not be interpreted as the user only now changing direction. The complete behavior of R46–R48
remains valid, with platform order updated by the latest decision. The priority is not to make the user switch into a separate canvas; frozen captures, canvases, and side-by-side scratch work are explicitly identified alternatives only.

Original workflow: stay on the original course / learning page for the lesson → use this product's pen to take screen notes / write scratch work in real time → save the original,
independently editable ink, its source, the screen at the time, and the video position → let AI add only necessary diagrams / formulas / short explanations, with each addition separately deletable
→ send the notes to Notability through officially supported sharing / import, recording the actual import status. This App retains the original ink document.

The material sent externally here is learning notes. Scratch work is preserved in full but is not sent out automatically; once scratch work becomes a final solution, it is organized into the assignment according to the user's choice. Automatic AI notes may still remain in this App. Display mode (content-anchored / screen-fixed), purpose (notes / scratch work / final solution), and destination are mutually independent; none may be inferred from either of the others.

<a id="flow"></a>

## 1. Problem-Solving Workflow and States

Enter the current problem and establish its problem-statement version → choose or combine webpage options, text / formulas, webpage handwriting, external notes, or this product's pen on the original screen → default to independent exploration → check a local step or provide progressively stronger hints on request → let the user decide whether to keep trying or view a solution → review the attempt on request → offer skippable targeted practice → preserve the process and evidence.

“Independent exploration / hints / review” are teaching states; the existing `NAV / ASK / WRITE` are input modes. The two are independent. Normal writing may record an authorized process, but it must not automatically request an explanation or pop up a solution. The original R08 and the safeguards for normal finger interactions continue to apply.

The suggested design adds only a few clear entry points, such as “Let me try first,” “Check this step,” “Give me a hint,” “Show the solution,” and “Review my attempt.” Spoken requests are equally valid. Do not turn every backend state into a button the user must operate.

After the user completes a final solution on screen, promptly present a concise choice of whether to organize it and which destinations are available, without requiring the user to ask separately. Actual completion is distinct from having a correct answer; a pause, leaving the screen, or a correct result does not automatically prove completion. When uncertain, ask one short question that combines confirmation of completion with whether the user wants the solution organized. After a refusal, do not repeatedly ask about the same problem; continued revision or switching problems invalidates the old prompt. Use the connected assignment source to associate the course, assignment, problem number, and version; ask briefly only if there is ambiguity. Notability is a common destination but must not be hard-coded. bCourses is an authorized source, not an automatic submission destination. Present only the archiving / corresponding PDF document / preview / do-not-organize-yet paths that are actually available. See the complete rules in [Confirmed Decisions](intent-and-decisions.md#3-本轮已确认决定).

<a id="surfaces"></a>

### Multiple Response Surfaces, Obtainable Evidence, Limitations, and Alternatives

The following is the coverage that must be verified and the proposed engineering routes, not a statement that platforms already support these capabilities or that this project has implemented them.
Collect separate evidence for this product's own real-time annotations on the original screen and for writing tools belonging to websites / third-party apps. Multiple surfaces may be used for the same problem.

| Response surface / platform | Obtainable evidence (subject to authorization and actual testing) | Limitations and acceptance boundaries | Explicit alternative |
| --- | --- | --- | --- |
| Website single-choice / multiple-choice controls | Authorized DOM selection states verified to be readable, observable select / deselect / change-selection events, problem-statement version, and time | Verify each site individually; the final selection is not the complete operation sequence or the user's actual reason. Missing events must not be guessed. Keep page-provided answers / grading separately attributed. | Visually observe the visible selections and gaps; use minimal clarification when necessary. |
| Website text / formula input | Authorized input/change states verified to be readable, before-and-after content, location, and evidence attributing actions to the user | Do not assume that the internal process in complex formula editors, canvas, cross-origin iframes, or shadow DOM is readable merely because access to the page is authorized. Mark as unknown when programmatic population cannot be distinguished from user input. | Preserve visible screens / text and uncertain intervals; do not fabricate keystrokes or reasons for revisions. |
| A website's own handwriting canvas | Operation events the website actually exposes and that are authorized for reading, or actual pixel changes | Without an available operation interface, the evidence is visual only; do not promise every stroke, the undo stack, or all momentary revisions. | Mark gaps in visual evidence; optionally offer this product's scratch-work surface as an explicitly identified alternative. |
| An external note-taking app's own pen | Handwriting / revision frames actually observed during authorized sharing | Pixels are not structured strokes, a complete undo history, or user motives; invisible steps remain unknown. | Continue observing the original page and explain the gaps; explicitly switch to a reliable alternative when necessary. |
| This product's real-time annotation layer within supported webpages | Editable ink and operations saved by this product, problem-statement / page anchors, and the composited image actually transmitted to AI | Actually test finger navigation, buttons, scrolling and zooming, iframes / fullscreen, reflow / problem switching, and stopping sharing. An overlay visible locally does not prove AI has received it. | For unsupported pages, offer an explicitly identified frozen capture / side-by-side scratch-work alternative; do not present it as passing the in-place requirement. |
| This product's annotation layer on the original Windows desktop | Own editable ink/operations, original window/whole display, actual AI receipt of the composite and source/time/version, all requiring actual tests | Current P1-02/P2-03 core delivery; P3-02 is later hardening only. Test supported pen input, NAV/WRITE/ASK, partial erase, undo/redo, ASK return to WRITE, pass-through/window switching/DPI and both anchors. Webpage/macOS results cannot pass Windows. | Explicit adjacent/captured-image alternatives, retaining R59/A44 gaps. |
| This product's annotation layer on the original macOS desktop | The same complete behavior/evidence as Windows, verified against actual macOS permissions/capture/input | Independently pass both §7.1 real-AI gates and the complete pen loop. Interactive Mac access is unconfirmed; hosted CI/Xcode or Windows results prove no pass. Sidecar is not a dependency. | Explicit limited alternatives; preserve unaccepted in-place scope without inferring native iPad overlays. |
| This product's interactive annotation layer over native iPad/iPhone apps (preserved, deferred) | Original-screen ink / composited images obtainable only as demonstrated by public platform capabilities and actual device tests | A sharing API does not automatically grant an arbitrary interactive pen layer across apps. Mark each App/OS path as unverified or, with evidence, unsupported; do not guarantee all apps. | Original-page observation plus explicitly identified side-by-side / frozen / canvas alternatives. Preserve the requirement; do not count the alternatives as completing R59/A44. |
| This App's standalone native canvas | Design for this product's own editable ink, revisions, erasure, undo / redo, and branch logs; saving / restarting still require actual testing | The most controllable engineering route is not the same as an implemented capability; it does not satisfy the location requirement of “continuing to annotate the current original screen in real time.” | It may be a user-selected response surface or an alternative for a limited path; report it separately. |
| Annotation on a captured problem image / side-by-side scratch work | Stable problem-statement version, frozen frame, this product's own scratch-work log, and the relationship to the original page | Clearly identify the frozen / alternative state; notify the user when the original page changes. Do not let scratch work for an old problem drift onto a new one, and do not misrepresent frozen input as live. | Preserve context and provide a one-step return to the original page; passing A45 cannot replace A44. |

Any capture records only what was actually observed and user actions that can be attributed. Correct answers supplied by a website, automated grading, and AI
assistance must be separately attributed. A correct selection with an unknown reason does not prove independent mastery; results must not be used to infer steps or the user's thinking.
This specification does not authorize AI to select options, fill forms, click Submit, or submit assignments on the user's behalf. Human actions and system feedback must not be confused.

When switching surfaces within the same problem, preserve the problem statement / attempt, event sources, branches, and sequence relationships. Redoing the problem is a new attempt;
switching problems means a different problem statement. Leave gaps or ask a short clarification when events are missing, a new problem cannot be distinguished from a redo, or causal order is unclear.
Preserve the source and visible time of website feedback; do not attribute a solution that happens to appear on the page to the user's own words or independent reasoning.

<a id="live-annotation"></a>

### Determining Whether a Path Provides Original-Screen Annotation or an Alternative

R59 requires the original page to remain visible and interactive while the user writes with this product's pen directly on the current shared live image, and requires AI to actually
receive the composited image and available ink. NAV/ASK/WRITE remain separate from teaching states. Scrolling / zooming must use verifiable
problem-statement and coordinate anchors. If the problem changes or reliable relocation is not possible, freeze the original anchor and notify the user; never silently move the ink onto another problem.
After sharing stops, do not send new live frames / ink or make an old image appear live. Explain the historical save status separately.

Separately test the Windows and macOS original-screen pen: navigation→WRITE→writing→partial erase→undo/redo→ASK completion/cancellation restoring prior WRITE→save/reopen/continue editing. Mouse mode is an explicit trial only, not a substitute for supported pen input. Retain later Pencil/finger rules.

The original-screen pen retains both content-anchored and screen-fixed display modes. Verify scrolling and zooming, reflow, page changes, video changes, and source recovery separately for each. Both always preserve the original ink and context from the time of writing. Fixed display must not lose provenance, and content anchoring does not promise arbitrary tracking of objects in videos. A mode determines display only; it must not force a purpose or an external destination. Mixed writing and changes of purpose must not drift onto another problem. Platform limitations and A45 alternatives remain separately listed; implementing only fixed scratch work does not count as implementing both modes or passing A44.

Limited paths may offer automatically captured images, a standalone canvas, or side-by-side scratch work; they must not require the user to manually take and transfer a screenshot at every step.
Clearly identify the alternative and frozen state during use; notify the user when the original page changes and preserve a one-step return. Record in-place A44/R59 results
separately from A45 alternative results. Other feasible work may continue, but passing an alternative must not be used to mark the in-place requirement as passed.

<a id="notability-flow"></a>

### From Original-Screen Classroom Notes to Notability

Coordinate with main-specification §7.4/7.5, R46–R48, R59, and A26–A28/A46. Save the original ink independently together with the source, screen,
and reliable video position at the time. AI diagrams, formulas, and short explanations form a separate layer and must not replace or rewrite the original.
Archive to Notability through officially supported sharing / import paths. Record file preparation, sharing, awaiting import, actual import,
and failed / unknown states. Opening the share sheet does not count as importing; do not promise silent automatic writes without a public interface.
PDF/PNG are not Notability-native editable strokes; this App's saved original ink remains independently editable.
When a destination is unavailable on a desktop, show the reason and pending-import prerequisites, preserve originals and continue available work without automatically changing destinations or claiming import.
A46 must separately check original-screen writing, saving / provenance / the AI layer, and actual import into the target. Report any failure or alternative
honestly; a successful export cannot compensate for an unimplemented original-screen pen.

AI distinguishes learning notes from assignment scratch work based on the actual context, without forcing manual classification of every stroke. Use minimal clarification only when uncertain, and allow the user to correct the classification. Send notes to Notability according to the rules; do not automatically send scratch work externally, but preserve its complete trial-and-error history. When it produces a final solution, ask whether to organize it as described above. Organization must preserve the user's actual answer, derivation, original layout, and sources. AI suggestions / revisions must be separate and previewable; do not silently correct the work or replace it with a standard answer. An incorrect purpose label must not delete the original, and shared / awaiting import / imported states must not be conflated.

<a id="evidence"></a>

For current audio/source decisions start at [the canonical entry](intent-and-decisions.md#current-decisions). R60 covers quiet personal questions while the class remains observable, additional/changing speakers, Windows/macOS system playback and authorized microphone/environment sources, headphones and route switching, plus the reported later M5 iPadOS 26.5 target and verified extra sources distinct from one primary interaction input. Hardware routes are candidates; actual listening has no recording prerequisite. AVTEST-09 compares useful actual-audio clues with transcript-only input using human-reviewed pairs; no invented emotion or premature help follows.

## 2. Process Evidence and Data Recommendations

The [audio and screen addendum](audio-screen-interpretation.md), R60/A47–A49, also covers oral attempts: preserve hesitation, self-corrections, negations, abandoned branches and original ASR candidates; record contextual revisions and user confirmation separately instead of repairing a genuine reasoning mistake into the correct answer. AUDIO-02–10/AUDIO-13–15 require actually authorized audio and contemporaneous screens, correctable speakers, live classroom/video tracks and independent stops. Missing audio cannot be replaced by invented tone from transcripts. No recording/upload prerequisite or permanent-recording expansion; exploration/all-channel disclosure rules remain. AVTEST-01–12 are all not_run.

Reuse the existing Session, Observation, Frame, NoteRevision, and independent source archives to express the following domain concepts in subsequent shared contracts versioned centrally by the lead engineer. Do not create a second user identity system or an isolated database of incorrectly answered problems.

| Concept | Minimum relationships that must be expressed |
| --- | --- |
| ProblemAttempt | Current problem statement and version, response surfaces and switching relationships, attempt ID, previous attempt, start / end status, and associated course and source; distinguish redoing the same problem from a new problem. |
| AttemptStep / Revision | Step / operation ID, parent step or branch, replacement / undo relationships, before-and-after versions, original events and screens, device sequence number and time, and provenance of user input / website feedback / AI assistance; do not order cross-device events using wall-clock time alone. |
| ObservationCoverage | Authorized webpage state / this product's own ink operations / external visual observation / mixed evidence, live or frozen status, intervals of valid coverage, unconfirmed intervals, image freshness, and symbol ambiguity; the absence of reported dropped frames does not prove a complete process record. |
| AssistanceEvent | User request, attempt version at the time, permitted disclosure level, actual hint, and whether it has been displayed / played; subsequent mastery evidence references it. |
| DiagnosisRevision | The attempt being diagnosed, the step or candidate interval containing the divergence, evidence, reasons awaiting confirmation, valid corrections, user corrections, and diagnosis version. |
| LearningPreference | Default learning language, technical terms strategy, Chinese-hint preference, exploration / hint preferences, and a temporary override for the current problem. |

Original-screen notes continue to reuse NoteRevision's editable original, context at the time, and independent AI layer. Coordinate transformations, problem-statement changes, and evidence that composited images were actually delivered must be traceable. External archiving reuses ExportJob's actual states rather than creating isolated storage. All of these are design inputs for the subsequent P0-08 task, not advance changes to v0.1.0.

Model display mode, purpose classification and corrections, evidence and uncertainty about solution completion, consent / refusal to organize the solution, and actual destination separately. Preserve both the source at the time of writing and the current display relationship; do not interpret user choices as prescribing fixed database fields. Organized versions are independently linked to the original. Previously seen AI assistance must not turn into evidence of independent mastery merely because scratch work is promoted to a final solution or a layer is removed during export.

Erasure and undo are operations on the user's original work, not opportunities for AI to silently replace earlier steps. Visual changes also cannot directly establish the user's full reason. Preserve an unknown value for “I do not know why you made this change.”

Platform basis: Apple's app-isolation rules require access to other apps' data through services explicitly provided by the system, while a first-party PencilKit canvas has separate drawing-change and tool-operation callbacks. The engineering boundary is therefore as follows: save the edit history of this product's own canvas explicitly; do not infer “we have obtained its complete undo stack” from “the Notability screen is being shared.” [Apple runtime security](https://support.apple.com/guide/security/security-of-runtime-process-sec15bfe098e/web), [PKCanvasViewDelegate](https://developer.apple.com/documentation/pencilkit/pkcanvasviewdelegate). Apple also documents capture stalling and dropped frames when frames are not processed promptly. This supports separately verifying brief trial-and-error steps instead of treating enabled screen recording as proof of a complete record. [ScreenCaptureKit frame-processing explanation](https://developer.apple.com/videos/play/wwdc2022/10155/). These are documentary grounds, not results showing that this project has passed device testing.

<a id="coverage"></a>

### Capture-Completeness Levels and Reporting

The following level names are engineering defaults. Report actual capabilities by app, device, OS, source, and coverage interval:

| Path | Evidence claims that may be made | Limitations that must be retained |
| --- | --- | --- |
| Structured operations | Authorized website selection / input states verified as readable site by site, or this product's actual records of editable ink, writing / erasing / undo / redo, versions, and branch relationships | Explicitly mark unreceived events, sequence gaps, and unconfirmed synchronization intervals as unknown; having an event channel does not prove that no steps were missed. |
| External visual observation | Images, changes, and time ranges actually observed in an authorized screen stream | Unexposed semantic operations or a complete undo stack are not obtainable; brief revisions, occlusion, blur, and dropped frames may be unrecoverable. |
| Mixed evidence | Structured events and visual frames aligned within the same process | Label provenance and alignment confidence separately. Leave conflicts or inconsistencies awaiting confirmation; do not assemble them into fabricated steps. |
| Missing / uncertain intervals | Disconnection, stale images, missing frames, symbol ambiguity, or unknown reasons | Inferring intermediate steps from the final answer cannot fill gaps; the absence of reported dropped frames is not proof of completeness. |

The goal for this product's pen and authorized webpage operations is to preserve the history that can actually be obtained. For pixels from external apps, the maximum promise is the process demonstrably observable in testing. Original-screen overlay capability must be verified separately according to the surface matrix; it cannot be inferred from shared pixels.
Use brief sharing-status and disconnection indicators to explain whether the screen remains visible to the system; do not burden users with internal fields.
Report retention rates and sequence / branch accuracy only after comparing the captured output item by item against a human reference process.
Reasons, motives, or rationales for revisions remain unknown unless expressed by the user. Ask minimally when necessary and allow the user to defer answering.

<a id="disclosure"></a>

## 3. Preventing Premature Answer Disclosure Across All Channels

Changing only the model prompt is insufficient. Requests, caches, and presentation must all carry the attempt version, teaching state, permitted hint level, and preference version. Results may be displayed only after checking the user's current intent.

- A request to “Give me a hint” must not reuse a previously generated full-solution card. Even a conceptual hint may indirectly reveal the answer; acceptance must inspect the actual content.
- When the user has corrected the work, switched problems, or said “Do not tell me yet,” old cards and queued speech must be canceled or invalidated. Cached content may remain stored but must not be presented incorrectly.
- Card titles, notification previews, AI-added diagrams, review summaries, and speech must follow the same disclosure rules; no side channel may leak the answer.
- When the user changes the level of assistance on another device, synchronize it to the same problem session. During a temporary disconnection, do not proactively play an answer based on stale permission.

<a id="coordination"></a>

## 4. Coordination with the Original Specification

| Original location | Constraint to add |
| --- | --- |
| R12–13, §3.4 Pregeneration | Background preparation is allowed, but display only the currently permitted hint level; a cache hit must not bypass the exploration state. |
| R19–25, §3.9 Encouragement and supervision | Silence, repeated attempts, erasure, or looking up prerequisites alone must not establish distraction or avoidance of difficulty. Supervision policies must not disclose solutions during exploration. |
| R29, §3.1 | The requirement that continuous video replay is unnecessary still holds; preserve key attempts and traceable events. External-screen sampling may be lossy, so verify whether brief steps are retained. Record the actual short-term buffering strategy, cleanup, and cost separately. |
| R40, §3.7 Cost | Schedule capture, saving, and model calls separately: reliably save local changes first, without requiring a flagship-model call for every stroke. Reason as needed only on questions, key changes, or review. Downsampling must not silently erase important trial and error. |
| R03/R08/R46–48, §7.4/7.5 Ink and archiving | R59 explicitly refines the existing goal of classroom notes on the original screen. Preserve original ink, sources, obtainable operation history, and an independent AI layer; archive to Notability according to actual sharing / import status. Mark limitations when only external pixels are available. A standalone canvas / frozen alternative does not count as completing the in-place requirement. |
| R49, §7.3 Proactive teaching | R53 limits intervention during problem solving; ordinary lesson viewing retains the existing skippable proactive teaching. |
| R50, §9.2 Mastery | Explicitly record the assistance level, and separately count independent application, completion after hints, following a solution, and review outcomes. |
| §9–10 Domain and interfaces | The lead engineer coordinates additions to contracts and version migrations before modules consume them; do not let individual members insert incompatible fields into v0.1.0. |
| §12 Definition of done | Add a complete real problem-solving workflow; “can see the screen + can answer problems” alone is insufficient evidence that this set of requirements is complete. |

<a id="language"></a>

## 5. Learning Language and Original Records

The default preference in R57 applies to course explanations, hints, speech, reviews of incorrectly answered problems, short practice exercises, and automatic notes:
use simple English, preserve the original course's technical terms, and add brief Chinese hints only for difficult distinctions.
Persist the preference across devices, sessions, and models. “Use Chinese for this problem” creates only a scoped temporary override and must not replace the default.
Original course text, the user's own words, ink, and source records retain their original languages. Project engineering progress reports may use Chinese;
this must not change the product's teaching language. English examples are not evidence that the persistent-preference feature has been implemented.

<a id="verification"></a>

## 6. Acceptance and Measurement

Use the acceptance definitions A30–A46 in main-specification §6; do not create a separate, diverging set of acceptance IDs.

Also run the [five INTENT cases in the decision record](intent-and-decisions.md#4-直接验收与追踪): both display modes, mixed purposes and corrections, prompting at completion, destination selection at runtime, and faithful organization / actual import. These are named subcases of the original R and A requirements, and all are currently unrun / unaccepted. G7 reports results separately by path; a single label check must not be treated as semantic or device acceptance. Continue to verify the other behaviors in R01–R50 individually according to [Original Goal Verification](original-goal-verification.md).

**G7 Problem-solving process, original-screen notes, and restrained hints**: Evaluate website behavior, this product's own structured operations, external visual observation, and original-screen annotation separately for the response surfaces above. List this product's real-time overlay results separately for webpages and Windows/macOS original desktops, with native iPad/iPhone apps deferred; not every external app must pass. Label limited paths honestly. P1 completes a single-problem workflow on a clearly supported path on each of Windows and macOS, but canvas / frozen alternatives do not constitute passing R59/A44. Collect independent evidence for the complete Notability path under A46. P0 may first use synthetic examples to test the protocol, ordering, cache invalidation, and teaching policy; acceptance for real external apps and Pencil must be performed separately on devices.

For the first engineering round, the default is to prepare at least 30 annotated process examples, covering rapid revisions, backtracking, branching, valid alternative solutions, correct answers reached by faulty reasoning, missing frames, and unknown motives. Separately report key-step retention, sequence / branch accuracy, misclassification of correct solutions, unsupported diagnoses, and hint-boundary violations. The fixed acceptance set should have zero premature answer disclosures, fabricated steps, and incorrect labels of independent mastery. Passing a finite sample does not guarantee model behavior on every problem. Verify rules programmatically; verify mathematical correctness and semantic answer leakage through independent review and real-user trials, not solely the same model's self-evaluation.

Real-time performance follows the measurement principles in §11, with additional measurements of image freshness and the delay before key revisions are saved. Report latency for capture, synchronization, recognition, reasoning, and display separately, along with failure examples. A progress animation does not count as useful assistance. Determine specific device targets after G7's first measurement round; do not describe unmeasured numbers as achieved.

Windows is available; interactive Mac access is unconfirmed. Record compilation and operation separately from actual evidence. Hosted macOS/Xcode proves no desktop permission/capture/audio/pen/Sidecar operation; unexercised device paths remain unverified;
webpage tests, reading source code, and platform documentation cannot replace the relevant device and target-import verification under A41/A44/A46. Add A42–A46 to the evidence scope of the original A30–A41 and A26–A28. A correct selection with an unknown reason must not be classified as independent mastery, and alternatives must not be counted together with in-place results.

<a id="phases"></a>

## 7. Phase Integration and Responsibilities

These capabilities are now in the core product scope. Preserve the P0 tasks already running, and integrate process evidence and assistance policy at safe boundaries. Complete both desktops before native mobile is the user's decision; the following slices within desktop delivery remain adjustable engineering defaults, not a fixed user schedule. They must not cause omission of the original P1 workflow for lesson viewing, point-to-explain interaction, and memory.

1. **P0 increment:** The lead engineer coordinates contracts, G7, and tracking tables. The learning role creates process examples and hint-boundary evaluations; platform roles verify what process evidence can be obtained from the current devices. Reuse and extend the existing P0-08–P0-13 task cards instead of duplicating similar tasks, and do not change existing acceptance descriptions into claims of having passed.
2. **P1 minimal complete workflow:** On at least one clearly supported path on each of Windows and macOS, implement starting a real problem, trying independently, requesting hints, reviewing, saving, and returning to it the next day. If the cross-app process evidence is insufficient, preserve observation of the original page; an explicitly identified response canvas / frozen / side-by-side alternative may be offered. Those alternatives do not pass the original-screen R59/A44 requirement. Continue in-place verification according to actual support; do not migrate all of the user's learning into PDF-upload chats.
3. **P2 improve teaching effectiveness:** Add targeted micro-practice, review across problems, and evaluation of assistance levels and independent mastery. Improve external-note handling and diagnosis of complex branches. Coordinate A46/A26–A28 evidence collection for the actual import path from original-screen classroom notes to Notability; do not use an alternative to conceal gaps in the in-place capability.
4. **P3 cross-desktop and later hardening:** Synchronize process and hint permissions across Windows/macOS first. Original-desktop capture/pen work already proceeds in P0/P1/P2; P3-02 is later cross-surface hardening/regression, not a reason to defer the core pen. Retain iPad/iPhone and original three-device variants for later; desktop results cannot pass mobile or Sidecar.

The P1 point-to-explain probe cannot replace the original exit criteria for Google Calendar, persistent URL / usable Canvas connections, real voice interaction, local notes, and the other original items. The timely choice to organize a final on-screen solution applies as soon as that path is enabled. P2 improves both original-screen display modes, purpose recognition / correction, and faithful archiving of the original work. Ordinary proactive classroom teaching, authorized encouragement and supervision, autonomous lesson preparation, and P4 real work agents remain deliverables under the main specification and the [backlog with assigned owners](../tasks.md#phase-backlog); “Let me try on my own” must not be expanded to cancel them.

Team responsibilities: the lead engineer manages shared contracts, interfaces, and task tracking; the backend role owns persistent process records, versions, and corrections; the learning role owns hint policy, diagnosis, and teaching evaluations; the native/macOS and webpage/Windows roles own current desktop capture/interaction, preserving iPad source and later tasks; QA independently executes A30–A46. Model selection is not the principal gap here. Complete the shared evidence and behavioral contracts first.

The [task board](../tasks.md) is authoritative for current scheduling, exact baselines, and dependencies. Report implementation, compilation, automated tests,
actual connections, and device acceptance separately. Reading the new specification does not require discarding work. It is acceptable to first read it with
`git show <正式提交SHA>:docs/requirements/problem-solving-companion.md`,
then have the lead engineer coordinate a normal merge that preserves local changes. Do not reset or forcibly require ff-only.
