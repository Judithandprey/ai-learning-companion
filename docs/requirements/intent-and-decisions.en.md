# User intent, confirmed decisions, and rules against loss of meaning

> English working derivative: the initial complete translation used source commit `d26f85c1f4be52f8de9815e8a7239eb9e2d8fdbf`; subsequent synchronized source/English increments are versioned in `english-translation-manifest.json` (under `docs/requirements`). Applicable originals and later explicit user decisions govern. Original quotations remain unchanged; links below intentionally point to the original documents. This derivative grants no new authority and makes no capability or performance claim.

**Normative decision record formally adopted on 2026-09-28 UTC.** Together with the main specification, this page governs tasks, acceptance, and handoffs. Record document adoption, code implementation, actual connections, and device acceptance separately; this document does not prove that any capability is complete. Current effective decisions are below; exact discussion records are kept separately in source history.

This document records behavioral requirements and the latest user decisions that are easily lost during summarization, task breakdown, and handoff. It does not replace the [main specification](../requirements.md), [problem-solving companion specification](problem-solving-companion.md), or original requirements. Before implementation, read the relevant original clauses, the decisions here, and the current [task board](../tasks.md) together.

<a id="current-decisions"></a>

## Current effective decisions — reading entry

Read this entry first, then the complete linked normative clauses. It locates final decisions without replacing unaffected requirements. History preserves quotations and supersession only; hardware/provider candidates and unverified capabilities are not unanswered product wishes. Current cumulative scope is R01–R60, A01–A49 and G1–G7.

| Subject | Effective decision and full clause | Source provenance | Acceptance / current status |
| --- | --- | --- | --- |
| Original learning screen | R03/R08/R46–48/R59, main §7.4–7.5/7.8: live original screen, operable page, AI sees composite, editable originals/source and separate AI additions. Owned/frozen alternatives do not pass the original-screen path. | §1 source references; history [ink decisions](history/audio-screen-discussion-2026-09-28.md#quote-ink-display) | A26–28/A44–46; real-device/import not verified. |
| Ink display, purpose and destination | Q-INK-DISPLAY/Q-NOTE-EXPORT-SCOPE and the three-dimension table below: both display modes; context-based correctable purpose; preserve drafts, notes enter Notability. Display never fixes purpose/destination. | [Selected option](history/audio-screen-discussion-2026-09-28.md#quote-ink-display), [complete answer](history/audio-screen-discussion-2026-09-28.md#quote-ink-note-export) | INTENT-INK-MODES/INTENT-NOTE-CLASSIFICATION; unaccepted. |
| Final answer | D-FINAL-ANSWER/Q-HOMEWORK-DESTINATION: promptly ask at completion, show actual available choices/preview/not now, retain original answer; no automatic homework submission. | [Final-answer source](history/audio-screen-discussion-2026-09-28.md#quote-ink-final-answer), [destination](history/audio-screen-discussion-2026-09-28.md#quote-ink-destination) | INTENT-ANSWER-PROMPT/INTENT-HOMEWORK-CHOICE/INTENT-FAITHFUL-EXPORT; unaccepted. |
| Live audio/screen companion | D-AUDIO-SCREEN, R60 and AUDIO-01–15: actual shared screen, live class and internal playback, quiet learner plus professor and other speakers; useful acoustic/context evidence, reversible correction and unknowns. | [Initial goal](history/audio-screen-discussion-2026-09-28.md#quote-audio-01), [screen](history/audio-screen-discussion-2026-09-28.md#quote-audio-03), [companion](history/audio-screen-discussion-2026-09-28.md#quote-audio-05) | A47–49/AVTEST-01–12, including positive AVTEST-09 comparisons; not_run. |
| Live processing and source retention | Q-AUDIO-RETENTION/AUDIO-13–14: no saved-record/upload/replay prerequisite; authorized buffers, durable source text/key images/process and scoped stops remain. No recording-choice question is open. | [Live clarification](history/audio-screen-discussion-2026-09-28.md#quote-audio-04) | AVTEST-11, V-SourceTimeRelations; not_run. |
| Device and hardware | R01/D-AUDIO-SCREEN: user-reported M5 iPadOS 26.5 target; microphone/camera unselected. One primary interaction input and one AI output allow extra verified authorized sources. Conditional dualRoute is a candidate, not universal concurrency or a purchase. | [Microphone request](history/audio-screen-discussion-2026-09-28.md#quote-audio-06), [device](history/audio-screen-discussion-2026-09-28.md#quote-audio-08) | G3/G4, AVTEST-03–07/11; route/device not tested. Core P1-03, optional two-device P3-01. |
| Language, evidence and help limits | R27–30/R52–58 and companion §2–6: English-first teaching, original-language source, unknown gaps, genuine trials and current disclosure permission across every output. Audio confidence never grants extra help. | Existing original-specification baselines in §1; [source goal](history/audio-screen-discussion-2026-09-28.md#quote-audio-01) | A30–43/A47–49 and V-*; existing unaccepted scopes remain. |

## 1. Sources and interpretation rules

| Source | Fixed reference and purpose |
| --- | --- |
| Original requirements v1.0 | User file `AI_Learning_Companion_Requirements.md`, finalized 2026-09-27 America/Los_Angeles; SHA-256 `c764160cde78c74d7dd76a950d593ecab45b390c7d9991b4db8ed5ad7f5dc9e4`. Retrieve it in the repository with `git show 9e1163b97972bf1a3ce492d271f269691db67c65:docs/requirements.md`; R01–R50 are user requirements, while implementation details in original §3/7–12 are engineering defaults. |
| Adopted problem-solving and original-screen clarifications | R51–R59, A30–A46, G7; original-screen clarification content baseline `a2567fa63cdc9c73e9902af57eabf5032a15e5a7`, audit baseline `796fed44ebbe584ff513c28d48b9a19ace441019`. These are traceable baselines, not instructions to revert subsequent commits. |
| Direct request for this revision | On 2026-09-28 UTC the user requested: “这个压缩的错误以后不要再犯了，现在检查文档，修正可能类似的错误，如果有不明确的地方，继续问我直到完全明确。” **English translation:** “Do not make this compression mistake again. Check the documents now and correct any similar mistakes. If anything is unclear, keep asking me until it is completely clear.” |
| Actual answers in this revision | §3 states the final effective decisions, with exact answers preserved in linked history. They clarify the corresponding original intent; they do not authorize automatic homework submission, purchases, account changes, or expanded capture. |
| Original words correcting the screen interpretation | The user said “我的意思是在我的屏幕上写的” (**English translation:** “I mean writing on my screen”) and pointed out that “一边上课一边记笔记” (**English translation:** “taking notes while attending class”) and sending the notes to Notability were already in the original requirements. R59 elaborates R03/R08/R46–48; do not retroactively describe this app's separate canvas as the user's original intent. |

Later explicit user decisions update the corresponding scope; original requirements outside that scope remain valid. Distinguish quotations of the user's actual words from editorial synthesis. A recommended option becomes a decision only after the user actually submits it. Do not relabel implementation suggestions, default parameters, investigation findings, or accepted facts as “specified by the user.”

## 2. The experience that must be preserved in full

The user continues attending classes, consulting material, and solving problems in their existing course websites, video apps, or note apps. AI follows the content actually shared to understand the observable exploration process. Inputs include selecting and changing web answers, text/formulas, handwriting on websites or in external notes, and this product's pen on the original screen; the same problem may combine these methods. Do not narrow this to “doing homework only in Notability” or “uploading material to chat on our canvas.”

The original classroom-note flow is: **stay on the original course view → use this product's pen to take notes/work through calculations on the live original screen → AI actually sees the composite content → retain editable original ink and its source, the view at that time, and a reliable video position → keep necessary AI additions separate → perform external archiving/homework organization according to purpose and the user's choice**. This is the original goal of R03/R08/R46–R48, made explicit by R59; this revision further specifies two ink display modes and selection of content for archiving.

The original page must remain visible and operable. Explanation and ink tools must not incorrectly intercept normal finger navigation. Gather separate evidence for webpage overlays, the Windows desktop layer, and iPad/iPhone native-app layers. Screen sharing alone proves neither a cross-app interactive overlay nor that AI received the ink visible locally. Where a platform is limited, preserve the goal, state the limits, and continue feasible paths. A separate canvas, frozen view, and side-by-side draft are disclosed fallbacks; passing those paths cannot substitute for passing R59/A44 in place on the original screen.

Notability remains the user's preferred destination. Official sharing/import and retaining the original in this app are different outcomes. Exported PDF/PNG does not mean native editable strokes in the destination app; opening a share sheet does not mean actual import. R17 still governs AI-generated learning notes: they may remain in this app. The user-handwritten-note archiving decision below does not require sending all AI notes to Notability.

## 3. Confirmed decisions in this revision

### Q-INK-DISPLAY: two ink display modes — confirmed

Source: [selected option and its final interpretation](history/audio-screen-discussion-2026-09-28.md#quote-ink-display). Display, purpose and destination are independent.

Provide both content-anchored and screen-fixed display modes. The former remains associated with its content as that content scrolls/zooms; the latter remains fixed relative to the screen. Both retain original ink and the source/view at the time of writing; a fixed display must not lose provenance. On page changes, reflow, problem changes, or changes in video content, old ink must not silently become associated with a different problem/view. If reliable relocation is impossible, retain the original anchor and explain the current state.

“Moves with the content” does not automatically extend to arbitrary video-object tracking or support in every third-party app. Validate specific anchoring algorithms, tool entry points, and switching defaults through engineering; success in one mode cannot compensate for a missing second mode.

### Q-NOTE-EXPORT-SCOPE: AI distinguishes notes from drafts using context — confirmed

AI uses the current situation to distinguish learning notes from homework drafts: **notes enter the Notability flow; drafts are not sent automatically**. The complete original answer, including ASR noise, is in [history](history/audio-screen-discussion-2026-09-28.md#quote-ink-note-export).

Do not require the user to classify every stroke manually before writing. Infer purpose from actual context, ask the smallest necessary clarification when uncertain, allow the user to correct the purpose, and retain the basis for the correction. Misclassification or “do not send externally” must never authorize deleting originals, rewriting history, or omitting the complete observable trial-and-error record. If a draft becomes a final answer, ask about organization under the next decision; the user may still choose the corresponding homework or Notability.

### D-FINAL-ANSWER: promptly ask about organization when a screen answer is complete — confirmed

Source quotation: [preserved original answer](history/audio-screen-discussion-2026-09-28.md#quote-ink-final-answer).

Once the user completes their final answer on the screen, promptly ask on screen whether to organize it into their homework. Do not hide this proactive entry point behind a requirement that the user ask separately. A pause, leaving the view, or a correct answer does not by itself establish completion. If the state is uncertain, one brief question may confirm both completion and the wish to organize; after refusal, do not repeatedly ask about the same problem.

Preserve the final answer, actual derivation, original layout, and provenance. Organization must not silently correct errors, replace the work with AI's standard solution, or relabel assisted completion as independent mastery. AI suggestions and layout/content changes must be distinguishable and previewable; changes to the substance of the user's answer must be available for confirmation. A request to organize homework is not permission to fill in or submit it on the user's behalf.

### Q-HOMEWORK-DESTINATION: show choices at the time of use — confirmed

Source quotation: [preserved original answer](history/audio-screen-discussion-2026-09-28.md#quote-ink-destination).

After the final answer is complete, offer concise choices based on saved/authorized homework and capabilities actually available at that time. The user chooses then; do not hard-code a destination during setup. Candidates must cover available Notability homework archiving, the corresponding homework PDF/document, and preview or not organizing for now. Specific labels and layout are engineering design choices.

Connected sites such as bCourses are homework sources. Reuse material already obtained rather than forcing the user to move it repeatedly. Associate the correct course, assignment, problem number, and version; ask briefly only where there is a real ambiguity. Having opened something in Notability once does not grant an interface for modifying its internal documents. Present only actually available paths and truthfully record prepared, shared, awaiting import, actually imported, failed, or unknown states. A bCourses source does not automatically become an authorized submission destination.

### Three independent dimensions

| Dimension | Distinctions to retain | Prohibited inference |
| --- | --- | --- |
| Ink display mode | Content-anchored / screen-fixed | Screen-fixed necessarily means draft, or content-anchored necessarily means learning note. |
| Content purpose | Learning note / calculation draft / final answer; correctable and able to change during the same writing activity | A canvas has only one permanent purpose, or a final answer is necessarily a correct answer. |
| Archiving and organization choice | Archive notes under the rules; organize final answers according to the user's choice at that time; retain drafts in the process archive | Not sending externally means deleting, or choosing Notability means automatically submitting to bCourses. |

This table states the semantic distinctions needed to implement the answers fully. It does not claim that the user specified three database fields or three fixed groups of controls.

**Unresolved-status check for this revision: Q-INK-DISPLAY, Q-NOTE-EXPORT-SCOPE, and Q-HOMEWORK-DESTINATION have all been answered; D-FINAL-ANSWER is also explicit. There are no pending questions in this group of product semantics.** These answers supersede “awaiting answer” entries in historical tasks/queued messages; do not ask them again. If a genuinely new conflict arises, identify the conflict and its sources, record the question, and ask while continuing independent work. Engineering implementation choices and platform capabilities not yet measured are not reasons to repeat the product interview.

### D-AUDIO-SCREEN: companion-like live understanding — confirmed

R60/A47–A49 and [AUDIO-01–15](audio-screen-interpretation.md) require joint understanding of actual shared-screen and live audio evidence, like a companion beside the learner. Preserve accents, quiet/unclear speech, oral trials, genuine mistakes, original-language ASR hypotheses and reversible corrections. Interpret useful acoustic cues only from actual audio; emotion and speaker roles remain uncertain/correctable rather than hidden knowledge or mastery facts.

Hear the learner, professor and additional/changing/overlapping people without silently restricting attribution to two speakers. A quiet near-mouth personal question must not drop classroom capture or interpretation. iPad video requires actual playback audio plus enabled microphone, including headphones; screen/camera previews do not prove audio delivery. Dedicated camera integration is optional.

One primary learner interaction input and one AI playback endpoint do not prohibit additional authorized sources through verified routes. The user-reported target is **iPad Pro 13-inch (M5), iPadOS 26.5**; the model/OS question is answered. Microphone and camera choices remain unselected engineering options; recommend by effectiveness without purchases. The [candidate route comparison](audio-screen-interpretation.md#microphone-routing-candidates) prioritizes conditional dualRoute validation, with interface and optional P3-01 two-device alternatives. None is measured or selected as implemented. Core classroom understanding remains P1-03.

**Q-AUDIO-RETENTION — settled:** live listening has no saved-lecture recording, manual upload or replay prerequisite. Authorized transient buffers and durable original-language transcripts, key images, process/revisions and scoped stop/deletion remain required under R27/R29/R30/R52/R58. Buffer configuration is engineering work, not an unresolved user recording choice. Quality-first selection does not choose a provider or expand the budget. Exact answers and superseded interpretations are in [history](history/audio-screen-discussion-2026-09-28.md).

## 4. Direct acceptance and traceability

The named cases below elaborate acceptance for this revision's decisions; they do not introduce a separate set of R numbers. The lead associates them with A26–A28, A30–A46, G7, and [requirements traceability](../requirements-traceability.md). **All currently remain definitions awaiting implementation/acceptance.**

| Case | Required observable outcome |
| --- | --- |
| INTENT-INK-MODES | Write in both display modes separately on actual paths claimed to be supported; scroll/zoom/change pages/change video content, save, and reopen. Both behaviors must be individually correct, originals and sources retrievable, and old ink not attached to a new problem. Verify finger navigation and AI's actual receipt of the composite content; list fallbacks separately. |
| INTENT-NOTE-CLASSIFICATION | Mix notes and drafts in one learning session, including misclassification, correction, and uncertainty. No manual labeling of every stroke is required. Only notes that should be archived enter the Notability flow; drafts remain complete, and correcting a classification does not delete originals. Display mode does not force a purpose. |
| INTENT-ANSWER-PROMPT | Compare actual completion, a brief pause, continued editing, a problem change, and explicit refusal to organize. Ask promptly after completion, do not assume completion while work continues, use one combined clarification when uncertain, and do not repeat prompts after refusal. Record actual prompt timing and failure cases; thresholds in seconds come from engineering measurement, not purported user quotations. |
| INTENT-HOMEWORK-CHOICE | Actually show available destinations after a screen answer is complete. Cover Notability and the corresponding homework document obtained from connected bCourses or similar sources, plus preview/not organizing for now. Check ambiguous problem numbers and versions; do not require the user to provide a saved source again. A draft that develops into a final answer can still be organized according to the user's choice. |
| INTENT-FAITHFUL-EXPORT | Preview/organized output preserves the user's answer, derivation, and layout, with AI suggestions separately identifiable. Gather distinct evidence for export/sharing/import; do not report failures or unknown outcomes as success, and retries must not create duplicate external documents. The editable original remains in the app, and no homework submission is performed. |

Each case needs an owner, phase, dependencies, and an actual evidence entry on the task board. Adding a table alone does not establish completed coverage. The existing P0 scaffold and synthetic examples support design; they do not prove real classification quality, screen interaction, or external import. See [original-goal verification](original-goal-verification.md) for direct acceptance of the other original goals, and continue maintaining them individually. Greater detail in these three decisions does not justify overlooking R01–R50.

See the [phase backlog](../tasks.md#phase-backlog) for current assignments: iOS/Web deliver `INTENT-INK-MODES` separately by path in P2-03 and P3-02; Learning/Backend support iOS's P2-04 for purpose classification and faithful export; `INTENT-ANSWER-PROMPT` and `INTENT-HOMEWORK-CHOICE` apply as soon as P1-06 enables the screen-final-answer path, with P2-04 completing the archiving flow. QA independently verifies all five. Current P0-08–13 continue only their respective design/verification preparation; this does not duplicate assignments for full implementation. Evidence accompanies the corresponding phase card; until delivered, the cases remain not run/not accepted.

## 5. Prevent summaries and handoffs from changing requirements

1. **A summary is an entry point; original intent remains the basis.** Before breaking down tasks, changing a design, or writing acceptance criteria, check the relevant original clauses and latest user decisions. Record source versions and unresolved differences; do not recreate user requirements from memory. Check the scenario, operating location, input method, degree of proactive/automatic behavior, retained content, target app, success conditions, platform, fallback, and phase. Counting R/A IDs or confirming that original text still exists is insufficient.
2. **Optimize the solution without silently narrowing behavioral goals.** Record accepted fallbacks, unsupported platforms, deferred phases, and design-only work for this revision separately; none cancels the original goal. If a goal needs to change, present the concrete difference. An implementation preference alone should not reopen already clear product intent.
3. **Every requirement needs a direct completion condition.** Do not copy a group's generic A/G mappings and pretend that each requirement is covered. Login does not prove actual work-agent execution; three devices joining a session does not prove joint understanding; sample retrieval does not prove complete long-term memory; sharing does not prove import; in-app saving does not prove external archiving; a canvas does not prove a pen on the original screen. P0 probes do not replace full P1 exit criteria; retain an owned backlog for unimplemented P1–P4 work.
4. **Preserve source memory and the right to explore.** Not requiring continuous audiovisual replay does not authorize deleting source text, key frames, temporal relationships, or observed attempts. Summaries, classifications, diagnoses, and indexes are rebuildable derivatives. Handle explicit user deletion/correction under the original rules. The user instruction “让我自己试” (**English translation:** “Let me try on my own”) limits help on the current problem; it does not cancel existing proactive classroom teaching, authorized proactive study supervision, or autonomous preparation, nor may those paths reveal an answer early. Stops and revocations take effect within their respective scopes.
5. **Propagate changes to the entry points actually used.** When user decisions change, update the relevant main-specification sections, detailed specification, traceability, tasks, and acceptance, and hand off an exact commit. Keep history but mark which decision superseded it. Do not duplicate entire documents across multiple long prompts and create divergent copies. An unread notification is not adoption; document adoption is not implementation or a pass.
6. **Continue independently authorized work.** Finishing one async message send does not permanently stop the project; old setup-only restrictions applied only to the completed setup turn. The lead continues reviewing deliveries, integrating, and assigning feasible tasks. A missing platform or temporary quota shortage does not eliminate other work, and does not authorize repeated retry loops, permission changes, or purchases.

## 6. Engineering defaults and factual boundaries

Engineering designs the technology stack, field/hint-level names, layout, classification thresholds, completion detection, reminder deduplication parameters, test sample sizes, and phase slices while preserving the behavior and evidence above. Existing specification measurement targets remain valid. Mark new numbers as initial engineering values and revise them through measurement; do not describe them as user-specified or already achieved.

The development team operates under the current [team contract](../../TEAM.md), role directory, and actual configuration. The user's Ultra reasoning-effort preference is separate from the finished product's quality-tested model routing under R04/R42. Ponytail lite only helps reduce irrelevant complexity; it must not delete requirements, compress source records, reduce necessary testing, pursue unreadable one-line code, or describe unknown capabilities as supported. Ponytail mode is not model effort, and upstream benchmarks are not this project's benefits.

Report writing code, compilation, automated tests, actual service connections, real-device verification, and user-experience calibration separately. Capability investigations, fallback paths, and promises to retain originals in documents do not replace that evidence. Implementers detect gaps in account authorization, platform APIs, build/device access, and similar prerequisites and specify the concrete input needed; do not make the user redesign confirmed goals. Product specifications themselves do not expand authorization for purchases, external messages, homework submissions, or account operations.
