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
| P1-03 Voice | A05, A06, A14; V-SourceTimeRelations; real interruption and cancellation of the old queue; §11 timing. R60/A47–A49: all AVTEST-01–12 (see the audio section) | A text-only silent fixture; recorded samples for live cases; loudspeaker recapture as playback audio |
| P1-04 Continuity/progress | A09–13, A23–24; V-ModelSwitchContext, V-ArchiveCompanionContinuity, V-LearningProgress. A47–A48: AVTEST-01/02/05/07/08/11 retention of oral attempts, original hypotheses, correction and role history, source-time gaps | A test corpus alone; a correction that overwrites the original hypothesis |
| P1-05 Local notes | A19, A27 when ink is offered; R46 incompleteness must be declared when only AI text notes exist | An AI text note reported as R46 handwriting |
| P1-06 Real problem loop | A30–43, A45; INTENT-ANSWER-PROMPT, INTENT-HOMEWORK-CHOICE when the screen-answer path is on | An A45 fallback reported as A44; synthetic cases |
| P2-01 Adaptive teaching/cache | A04, A05, A19, A29, A39; V-CacheProvenanceLatency (including R12 system-predicted candidates generated before selection), V-FutureCourseEvidence, V-ProactiveTeaching | `cache_hit` flags; pre-seeded answers; post-click generation; animations |
| P2-02 Diagnosis/mastery/language | A35–40; V-LearningProgress; semantic review plus user trial | Label or probe agreement |
| P2-03 Two display modes, original screen | A26, A27, A44–45; INTENT-INK-MODES | One mode; own canvas; fallback |
| P2-04 Classification/organization/export plus OneNote | A27, A28, A46; all five INTENT cases; OneNote page-id readback with reconciliation of unknown results | A share sheet; PDF/PNG as native ink; OneNote treated as a Notability substitute; any submission |
| P2-05 Archive/capacity | A09–12, A38; V-ArchiveCompanionContinuity, V-MemoryCapacityTransparency | Silent truncation; infinite claims |
| P3-01 Three devices | A15, A16, A31, A34, A38, A40; V-MultiDeviceUnderstanding, V-SourceTimeRelations. A48: AVTEST-04/05/06/07/11 across devices, including the optional iPad + iPhone capture candidate | Room membership; a track treated as a person; two-device results used to defer the P1-03 core classroom experience |
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

## Audio and screen interpretation: R60, A47–A49, AUDIO-01–15, AVTEST-01–12

Specification: `89602e742aea9c6ef6b6ec6a76c371e20bff2edf` (content
`7f43b5935549aa5bf9d8f815d49c37fc5ae10551`), updated for the final decision
normalization `7fadd151c83118c22a4846bdb8b2622d47bb0df3` (content
`9edbc1c65ccc06c3daaaea34a7b05dfaa849e29d`): the current-decisions entry
(`intent-and-decisions.en.md#current-decisions`), D-AUDIO-SCREEN, §1 and the
routing-candidate section of `audio-screen-interpretation.md`, and the updated
audio coordination rows. Sources read in full:
- `docs/requirements/audio-screen-interpretation.md` (original English, including the
  four exact user quotes);
- R60 and A47–A49 in `docs/requirements.en.md`;
- D-AUDIO-SCREEN and Q-AUDIO-RETENTION in `docs/requirements/intent-and-decisions.en.md`;
- `docs/tasks.md#audio-screen-coordination` and the P1-03, P1-04 and P3-01 backlog
  rows.

The recording-choice question is **closed**. Live listening needs no manual
recording, saved lecture audio, upload or replay. Transient streaming and the
authorized short verification buffer are not permanent recording. QA will not treat
buffer settings as an open user choice.

### Evidence dimensions QA reports separately (cumulative)

Each dimension is reported on its own, and the dimensions are **cumulative**: a case
passes only when **every** dimension it needs is present. No single dimension is
sufficient on its own. In particular, live capture alone proves neither what
actually reached the AI route nor that it was interpreted correctly.

| Dimension | Meaning | What it can and cannot establish |
| --- | --- | --- |
| S — synthetic | Fixtures, mocks, rule probes, generated audio or text | Can verify specified rule or policy components. Never establishes capture capability, AI receipt or comprehension, and never passes a full audio-understanding case on its own. |
| R — recorded sample | Authorized recorded user/course samples replayed offline through a route | Supports interpretation-quality measurement. Recorded input cannot substitute for live input: it never satisfies a live requirement (AVTEST-05, A48). |
| L — live input | Real iPad (and later iPhone/Windows) capturing in real time: classroom microphone, actual playback audio with headphones, actual shared screen | Required where a case is about live capture. Necessary, not sufficient: it shows the input path existed for that device, OS and app, not what the AI received or understood. |
| E — processing evidence | The actual input delivered to the route (tracks, frames, timing) and the actual outputs: transcript hypotheses, corrections, attribution, response/interrupt decisions, presented channels | Required for every case that claims AI receipt, interpretation, professor retention, attribution or late-transcript behavior. |
| D — persistence evidence | Backend records of source segments, hypotheses, correction and role history, stops, deletion and late arrival | Required where retention, correction history, stop or deletion behavior is part of the case. |
| P — provider route | A route verified as actually callable, with its input features. Unavailable routes are recorded with their reasons | Required for AVTEST-10/12. A consumer live product or a coding subscription is not API access. |
| H — human reference review | Reference meanings, labels and ambiguity decisions made by an **actual human** reviewer. The user's clarification settles genuinely ambiguous meaning | Required wherever meaning is judged. |
| A — independent AI review | Review by a model other than the generating one | Recorded separately. It is a perspective only and never substitutes for H. |

Further rules:
- A screen or camera preview proves neither captured audio nor direct camera
  access.
- A microphone hearing the iPad loudspeaker is not internal playback audio.
- DT-G3-05 and DT-G3-11 identify capture paths; they do not establish
  comprehension.
- Each run records inputs, reference evidence, configuration and version, the
  supported path, outputs, errors and unknowns, timing and cost where relevant.
  Thresholds are defined before comparison.

### Critical failure counters (never averaged away)

Each of these counts separately, with its denominator, per route and per path:
1. Loss or reversal of a negation, qualifier, sign, unit, or abandoned attempt.
2. A critical technical-term error, including a word replaced only because it fits
   the lesson.
3. Quiet-speech loss: words lost before interpretation, clipped, or suppressed by
   VAD or response suppression.
4. Professor or lecture content lost, including during quiet-assistant mode,
   while the user speaks, and while a quiet personal microphone is in use. Input
   that never reached the AI is counted separately from recognition loss.
5. A false response or interruption triggered by the professor, echo, a bystander
   or a duplicate lecture track.
6. Invented content: prosody or emotion inferred from text, unheard words, or unseen
   writing.
7. Speaker misattribution. Nearby speech assigned to the user without evidence,
   the professor labelled as the user, an unknown turn forced into a role, or
   additional or changing speakers silently dropped or merged into two labels.
   Omissions and attribution are counted per speaker.
8. A timing or screen misbinding: a stale frame treated as current, or later
   content attributed to an earlier utterance.
9. Loudspeaker recapture reported as internal audio; a preview reported as captured
   audio or camera.
10. Stop, stale or late-data violations: capture restarted, stale audio acted on, a
    late transcript turned into a live request or restored permission, or a
    full replayable lecture stored silently.
11. Unbounded retries or escalation, silent overspend, or a purchase or account
    change.

### Device and routing candidates (7fadd15): what QA will and will not count

- **Target.** The user-reported target is iPad Pro 13-inch (M5), iPadOS 26.5. The
  device identity is settled; runtime detection, route availability and signal
  delivery are **not device-tested**.
- **Roles are not hardware.** One primary learner interaction input and one AI
  playback endpoint are policy roles for interaction and echo control. They do not
  limit the number of authorized sources, and they are distinct from a platform
  API's hardware primary route. A track is not a person.
- **Conditional `dualRoute` (first candidate).** It needs `multiRoute` plus
  `allowBluetoothHFP` and a compatible **bidirectional** secondary device
  (headsetMic, headphones, bluetoothLE or bluetoothHFP, per Apple's documentation
  from iPadOS 26.2). QA requires, on the actual 26.5 target:
  - `availableModes` and the active routes/channels;
  - **actual independent signals** from a near-mouth learner microphone and the
    built-in classroom pickup, with a far professor and additional speakers;
  - attach/detach/recovery, headphone-only AI output, and coexistence with screen
    and playback capture.

  Unavailable modes, older OS versions and unsupported devices are reported
  explicitly.
- **Not counted as evidence:**
  - an `availableInputs` or `availableModes` listing alone;
  - logical source-role labels;
  - a USB or input-only device presumed to work with `dualRoute`;
  - `bluetoothHighQualityRecording` claimed together with `dualRoute` (it requires
    the `default` mode);
  - a gain setting or a stronger model presented as recovering words that were
    never captured.
- **Multichannel interface (separate candidate).** Needs independently varying
  real input channels on this device. A hub, splitter or duplicated mono mix does
  not show separate sources.
- **iPad + iPhone capture (optional, P3-01).** Needs measured clock drift,
  duplicated sound, delay, reconnect, lock/background behavior and per-device
  stops, with one AI playback endpoint. It never defers the P1-03 core classroom
  experience.
- Equipment is recommended only after route and quality evidence. QA makes no
  purchase, route or mode activation.

### AUDIO clause mapping

This mapping is QA's, derived from the A47–A49 rows and the clause text.
Implementation owners follow the audio coordination table.

| Clause | Acceptance | Main AVTEST coverage | Implementation owners |
| --- | --- | --- | --- |
| AUDIO-01 quality-first evidence | A47, A49 | 10 (scorecard); quality dimension of 01–09 | learning (+lead routing) |
| AUDIO-02 native audio with a faithful transcript | A47 | 01, 03, 09 | backend (relationships, buffer), learning |
| AUDIO-03 reversible context correction | A47 | 01 | learning, backend, web |
| AUDIO-04 preserve actual reasoning | A47 | 02, 08 | learning, backend |
| AUDIO-05 quiet and unclear speech | A47 | 03, 06 | iOS, learning |
| AUDIO-06 course/system audio plus mic | A48 | 04 | iOS, web |
| AUDIO-07 live classroom mic, correctable speakers | A48 | 05 | iOS, backend, learning |
| AUDIO-08 shared timing and screen references | A47, A48 | 07, 08, 11 | backend, iOS, web |
| AUDIO-09 speaking to the AI versus being observed | A48 | 04, 06 | learning, iOS, web |
| AUDIO-10 tone and emotion as tentative context | A47 | 09 | learning |
| AUDIO-11 repeatable comparison | A49 | 10 | learning (+lead) |
| AUDIO-12 bounded escalation, unchanged spending | A49 | 12 | learning, lead/backend budget ledger |
| AUDIO-13 live listening without saved recording | A48 | 05, 11 | iOS, backend, web |
| AUDIO-14 source continuity, correction, stopping | A48 | 11 | backend, iOS, web |
| AUDIO-15 shared screen and iPad audio as primary inputs | A48 | 04, 07 | iOS, web |

### AVTEST cases

The "required evidence" column lists every dimension a case needs; all of them must
be present (see the cumulative rule above). Where L is listed, recorded input cannot
substitute for live input. Dimensions not listed can support a case but cannot pass
it.

| Case | A / backlog | Required evidence (all) | Critical counters (above) | Must not count as a pass |
| --- | --- | --- | --- | --- |
| AVTEST-01 accent, code-switching, glossary + screen | A47 / P1-03, P1-04 | R + E + H + D (hypothesis and correction records); plus L when a live path is claimed | 2, 6 | A fluent transcript; a correction with no provenance or status; a lost original-language span |
| AVTEST-02 stumbles, self-correction, negation, wrong reasoning | A47 / P1-03, P1-04 | R + E + H + D (retained source/process record) | 1, 6 | A tidied reading view without the retained source record; an ASR repair presented as a teaching correction |
| AVTEST-03 quiet user, distant professor, noise | A47 / P1-03 | R (original and processed audio plus VAD output) + E + H; plus L + E for the device microphone path | 3, 4, 6 | Processed-only audio; "amplification helps" assumed; unsupported recovery not left unknown |
| AVTEST-04 shared screen with camera view or lecture video, playback audio, headphones, mic, overlap, assistant playback; also the personal mic under headphone playback, attach/detach/recovery, actual ports/channels and assistant output | A48 / P1-03, P3-01 | L (per device, OS and app; recorded input cannot substitute) + E (which simultaneous inputs actually reached the AI, including both the quiet learner and the course; response/interrupt decisions) + H | 4, 5, 9 | Loudspeaker recapture; a preview as audio; any recorded or synthetic run; live capture without E |
| AVTEST-05 live classroom mic, teacher/user/other, overlap, role correction; near-mouth personal mic plus built-in pickup where supported; more than two people and changing speaker counts; conditional `dualRoute` on the 26.5 target, with unavailable/older-mode and USB/input-only limits; multichannel interface as a separate candidate | A48 / P1-03, P1-04, P3-01 | L (recorded samples cannot substitute) + E (attribution and omissions per person, unknown spans, actual independent signals per route) + H (reference turns) + D (role-correction history without rewriting the original) | 4, 7, 10 | A saved-recording/upload workflow; a claim of clean separation; a correction that rewrites the original; live capture without E and H; an input or mode listing; duplicated mono counted as separate sources |
| AVTEST-06 quiet lecture mode, soft professor, unrelated nearby speaker; a quiet learner speaking through the personal mic while the distant professor and another speaker continue | A48 / P1-03, P3-01 | L + E (retained versus missed lecture content, measured separately from response triggering; omitted input distinguished from recognition loss; all authorized sources preserved) + H | 4, 5, 7 | Retention and response-triggering merged into one score; live capture without E; the personal mic causing professor dropout |
| AVTEST-07 spoken references to screens and camera-observed boards under seek/speed/scroll/edit/glare/delay; for the optional two-device candidate, clock drift, duplicated sound, delay, reconnect and independent source identity | A47, A48 / P1-03, P1-04, P3-01 | R + E + H for alignment logic; plus L + E for the camera/board path and for the two-device candidate; D where backfill is involved | 6, 8 | Legibility assumed; stale or unreadable spans hidden; P3-01 two-device results used to defer P1-03 classroom delivery |
| AVTEST-08 reasoning error on screen/ink, ambiguous speech, then a correction | A47 / P1-03, P1-04 (links P1-06) | S can verify specified policy components (separation of source wording, observed edits, interpretation and diagnosis; "let me try" on every channel) but **cannot pass the case alone**. A full pass needs actual audio + screen/ink input (R, or L for a live claim) + E on every output channel + H + D | 1, 6 | Source wording merged with diagnosis; any leak under "let me try"; synthetic policy checks reported as audio-understanding acceptance |
| AVTEST-09 low volume or emphatic tone, user corrects an inferred feeling; **positive comparison:** small paired examples with the same words but different stress, pauses or intonation, or different relevant background teacher speech, run through an available original-audio path and a transcript-only path | A47 / P1-03 | R + E (both paths' interpretations, evidence, unknowns and critical errors) + H (pair meanings reviewed by an **actual human**; another AI's agreement does not count) + D (no durable emotion record) | 6 | A durable emotion or mastery record; extra disclosure permission from tone; a predetermined audio-route winner; subjective emotion labels treated as objective truth; AI review in place of H |
| AVTEST-10 same samples across available Google/OpenAI native-audio and ASR+multimodal routes | A49 / P1-03 (G4) | P + R + E + H; a versioned scorecard with denominators, latency and actual cost | all, each reported separately | An average that hides counters 1–4; unavailable routes omitted; a universal winner claimed; AI review in place of H |
| AVTEST-11 live listening, source stop, session end, revocation, deletion, disconnection, late transcripts; personal-mic route changes, per-source stop and recovery, independent classroom continuation, optional two-device stops | A48 / P1-03, P1-04, P3-01 | L + E (no live request or restored permission from late data; hardware indicators and actual AI input agree with the claimed scope) + D (retention, stop, deletion) | 10 | Historical gaps hidden; required transcripts lost; a replayable recording stored silently |
| AVTEST-12 unresolvable critical speech, provider failure, near-budget concurrency | A49 / P1-03 (with P3-06 ledger) | P + E (bounded retries/escalation, preserved unknowns) + D (backend ledger evidence) | 11 | Retries without a bound; unknowns dropped; spending, quota or account changes |

Current status:
- A47–A49: 0/3 accepted.
- AUDIO-01–15: 0/15 verified.
- AVTEST-01–12: 0/12 run, all `not_run`.
- No provider route has been verified for QA, and there are no live-device,
  recorded-sample, processing-evidence or human reference sets yet.
- Final decision delta (7fadd15) folded in: quiet personal plus classroom sources,
  extra and changing speakers, conditional `dualRoute` candidate limits on the
  unverified 26.5 target, optional P3-01 two-device capture, and positive AVTEST-09
  comparisons with actual human review. Core classroom understanding remains
  P1-03. All still `not_run`.
- Correction after lead review (71f1389 message): evidence dimensions are
  cumulative; L means recorded input cannot substitute for live input, not that
  live capture alone passes; H means an actual human reviewer, with independent AI
  review recorded separately; synthetic AVTEST-08 checks cannot alone pass. Scope
  and all `not_run` statuses are unchanged.
- Link to V-SourceTimeRelations (P1–P3) for teacher/user/frame time relations.
- R59/A44/A46 original-screen ink and actual Notability import keep their separate
  evidence; audio work does not substitute for them.

## Current QA status

- INTENT: 0/5 executed.
- V: 0/19 executed.
- Backlog acceptance: 0/23 executed.
- Audio/screen: A47–A49 0/3, AVTEST 0/12 (all `not_run`).
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
