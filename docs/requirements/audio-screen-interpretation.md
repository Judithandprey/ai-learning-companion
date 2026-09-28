# Audio and Screen Interpretation: Additive Product Requirements

Status: normative addendum adopted on 2026-09-28 UTC under the user's integration request; no capability, implementation, acceptance result, or provider winner is claimed.
Local IDs `AUDIO-01`–`AUDIO-15` and `AVTEST-01`–`AVTEST-12` remain stable and are mapped by [main specification](../requirements.md) R60/A47–A49. This is an original English source, not a translation.
Source packet SHA-256: `8dd09b2f586944950a54faa2058d191c19775a50393033f882d66f5bb7b5b5cf`; the four exact user quotes and all AUDIO/AVTEST clauses are retained. Editorial adoption labels and repository links are added here; [integration evidence](../verification/lead/audio-screen-interpretation-adoption.md) records provenance and checks.
The original requirements and later explicit user decisions remain authoritative. Read their relevant clauses together with this addition; summaries do not replace them.
English is the working language. Existing English-first teaching, original-language source preservation, exploration/disclosure limits, budgets, and stop semantics remain in force.

## 1. Exact user source

The following is the user's exact statement, including its original wording and spelling:

> OK, I just want the best interpretation of audio and screen, because I may have some accent, some unclear words, so context-correction is important, and I want the best one. I wish that ai can understand me even I stumble, I have vague voice, and speak in low voice, if ai can interpret more context, like my voice loudness, tone, emotion, background voice, that will be great. besides, when I use gemini live in class, it some time can't transcript what professor said, but if I watch video, or recoding during class, I wish that AI can both hear professor's sound and me, and distinguish us.

Confirmed intent: prioritize the most faithful available understanding of the user's speech and visible learning context, including imperfect speech, and hear and distinguish the professor and user during videos and classroom learning.
“Best” is a quality-first selection objective, not a guarantee of perfect recognition or authorization for unlimited spending, perpetual model comparisons, purchases, or account changes.

The user's subsequent input-method clarification, quoted exactly:

> I think I may use a seperate camera, to record and share what camera see on screen, but I may also use camera on ipad directly. I am not sure.

This left the camera choice tentative. The later clarification below resolves live listening versus a required saved recording.

The user's subsequent clarification of the main input, quoted exactly:

> I think wether ipad camera or seperate camera, they will eventually show on my screen, so the main thing important is to be able to see the screen, and audio shared to or directly recorded by ipad.

This clarifies the required experience: see the actually shared screen, including a camera view displayed there, and understand authorized audio shared to or directly recorded by the iPad. A dedicated direct-camera integration is an optional engineering route, not a separate required feature. Screen-image availability and audio availability still need separate verification.

The user's latest clarification of live audio, quoted exactly:

> or, actually no need for audio recorded, because when I am using ipad, the voice directly heared by ai just like my speeching. but if I am watching a video, the voice come inside my ipad. so what I want is, when it's in person class, the ai can distinguish my voice and professor's voice, when watching video on ipad, the ai can still hear the sound come from ipad.

The required experience is live listening without a manual recording/upload step or a saved lecture-audio/replay prerequisite. In person, the iPad microphone receives the classroom mixture and the AI must attempt to distinguish the learner from the professor. While watching a video on the iPad, the AI needs the video's playback audio, independently of whether it is audible through the iPad speakers, alongside the learner microphone when enabled. This resolves the earlier open recording question; transient capture/streaming and an authorized short verification buffer remain distinct from storing a replayable recording.

## 2. Interpretation and evidence requirements

### AUDIO-01 — Quality-first, evidence-grounded interpretation

Evaluate meaning, technical terms, references, speaker attribution, and preserved uncertainty together; a fluent transcript alone is insufficient.
Select the best demonstrated route for the relevant scenario within actual device, permission, entitlement, latency, and existing budget constraints. Do not choose a provider from brand reputation alone.

### AUDIO-02 — Native audio evidence alongside a faithful transcript

Where authorized and technically available, interpretation can use actual audio, including pauses, timing, loudness, tone, and other audible cues, together with a faithful transcript; do not reduce all available evidence to text before evaluating audio-aware routes.
Keep the relationship between audio segments, transcript revisions, source tracks, and interpretations inspectable. Preserve authorized unprocessed evidence during the permitted buffer period; this does not authorize permanent full-session audio storage.
An initial ASR transcript is a hypothesis, not guaranteed verbatim ground truth. If actual audio is unavailable, disclose unavailable acoustic cues and never invent prosody from text.

### AUDIO-03 — Reversible context correction

Use the current screen, relevant crops, captions, course glossary, previous utterances, and actually obtained course materials to propose corrections to misheard words or ambiguous references.
Cover Chinese, English and code-switching with course technical terms; preserve original-language spans and keep any translation as a separate derivative rather than silently translating away the input.
Preserve the observed transcript/candidates and a separate correction record with the changed span, supporting evidence, version, and proposed/confirmed/rejected or uncertain status. AI confidence is not user confirmation.
Corrections must be reversible and must not rewrite historical evidence. Missing audio or conflicting context remains explicitly unknown; ask the smallest useful clarification when the distinction matters.

### AUDIO-04 — Preserve the user's actual reasoning

Retain meaningful stumbles, pauses, self-corrections, alternatives, negations, qualifiers, and changes of mind in the source/process record, even if a separate reading view is tidied.
Distinguish spelling/ASR repair from correcting a genuine conceptual or reasoning mistake. Do not turn an incorrect claim into the expected answer or silently remove “not,” a sign, a unit, or an abandoned attempt.

### AUDIO-05 — Quiet and unclear speech without fabricated recovery

Measure quiet speech, accented speech, hesitant speech, unclear words, distant lecture speech, overlap, and changing noise against authorized original samples, including words lost before model interpretation.
Evaluate microphone choice/placement, levels, clipping, VAD, echo cancellation, denoising, and gain processing per source; amplification or aggressive processing is not presumed to improve recognition.
Retain raw/processed correspondence within the allowed buffer and report missing/clipped/suppressed spans. Response-suppression or silence detection must not silently discard speech that authorized source capture should preserve.

### AUDIO-06 — Course/system audio and user microphone

When the platform actually supports it, capture course/system audio and the user microphone as distinguishable sources so the professor remains audible while the user speaks or asks a question.
For iPad video viewing, verify delivery of the actual app/playback audio; do not substitute a microphone hearing the iPad loudspeaker and claim internal-audio capture. Include headphone playback, concurrent user speech and per-app availability; report unavailable sources clearly.
Keep both authorized sources available to interpretation; an assistant staying silent during a lecture does not mean lecture observation/transcription stops. Report unsupported or unavailable tracks instead of implying complete coverage.
Deduplicate the same lecture captured through a system track and microphone, and distinguish assistant playback/echo from fresh user speech without deleting genuine user interruptions.

### AUDIO-07 — Live classroom microphone audio and correctable speakers

For live classroom microphone audio with mixed voices, attempt speaker diarization with correctable role attribution: teacher, user, assistant, bystander, or unknown; preserve overlap and uncertain turns explicitly. This must work as a live listening workflow; requiring a saved recording and later upload is not an equivalent replacement. Authorized recorded samples may separately support evaluation.
A track identifies a capture source, not a person. Diarization labels who spoke when; it does not prove clean acoustic separation or reliable identity, and multiple speakers may occupy one track.
Do not discard the professor merely because their voice is distant or classified as background. Do not assign nearby speech to the user without evidence; an unresolved speaker may remain unknown.

### AUDIO-08 — Shared timing and screen references

Associate audio spans and transcript turns with capture time, received time, media playback position where known, device/source IDs, screen/frame versions, and relevant crops or selections.
Preserve alignment through playback-speed changes, seeking, pauses, clock differences, disconnection, and backfill. Distinguish a stale frame from the screen visible when the person spoke.
Resolve “this,” “that line,” or “the earlier step” from available synchronized evidence, including observed edits and versioned ink; do not invent unseen writing or use a later correction as evidence of an earlier utterance.

### AUDIO-09 — Speaking to the AI versus being observed

Separate lecture/source transcription from the decision to answer or interrupt. Professor speech, assistant echo, and bystanders must not automatically trigger an AI conversation.
Recognize actual user requests and interruptions from supported evidence; when attribution or addressee is unresolved, use a minimal clarification or the established explicit talk control rather than guessing.
Keep quiet lecture behavior and user-controlled video playback. Input availability, a pause, or an expressive voice does not authorize proactive solution disclosure.

### AUDIO-10 — Loudness, tone, and emotion as tentative context

Audible loudness, emphasis, hesitations, and tone may inform interpretation, but microphone distance, noise, gain, accent, and individual speaking style can confound them.
Treat inferred emotion or intent as tentative, correctable context; do not store it as a durable emotional fact, diagnosis, personality label, or mastery judgment without an appropriate confirmed basis.
Such clues never override explicit user requests, exploration boundaries, permissions, or the rules against premature answers. Preserve observable evidence separately from interpretations.

## 3. Selection, limits, and live listening

### AUDIO-11 — Repeatable comparison on representative samples

Compare actually available Google and OpenAI audio-capable routes, including native-audio interpretation, with an ASR-plus-multimodal route using the same authorized inputs and representative user/course samples.
Availability is verified, not assumed. Record unavailable candidates and reasons; neither a consumer live product nor a coding subscription proves API access or input-feature parity.
Use a versioned, repeatable scorecard: dataset and consent/retention scope, device/OS/microphone, environment, capture/processing settings, route/model/version, prompts/glossary, outputs, labels, and failure examples.
Score intent understanding, critical terms, negations/qualifiers, speaker attribution, missing lecture content, false responses/interruptions, invented content, screen/time grounding, end-to-end latency, and actual cost/quota usage.
Use human-reviewed references and the user's clarification where meaning is genuinely ambiguous; report unknown cases separately rather than inventing ground truth. Overall averages must not conceal critical-term, quiet-speech, or professor-loss failures.

### AUDIO-12 — Bounded escalation and unchanged spending authority

Escalate an uncertain consequential span to a more capable available route, inspect original evidence, or ask a focused question; reprocessing has finite attempts/time/cost and preserves provenance.
Numerical targets, sample counts, and retry limits are engineering defaults to calibrate and document, not figures the user has specified here. No perpetual multi-model calls or automatic comparison on every utterance.
Existing reservations, concurrency accounting, subscription/API distinctions, and budget ceilings remain unchanged. This requirement authorizes no purchases, new provider accounts, account changes, or silent quota/budget expansion.

### AUDIO-13 — Live listening does not require a saved recording

The latest user clarification resolves the earlier open question: live microphone/playback listening is required; a manual recording operation, saved lecture-audio file, later upload or replay feature is not required for this use case. Do not continue asking the same recording-choice question or block the live listening work on it.
Real-time capture/streaming and the existing authorized short verification buffer are processing mechanisms, not a requirement to retain a replayable lecture recording. Do not silently enable permanent recording or add a full-session replay requirement. A later separate explicit recording request can define its own scope.
Retain the existing source-transcript, key-image, process-history, stop and deletion requirements. Document any unresolved engineering buffer setting and its verification effect without treating it as an unresolved user choice about whether the AI should listen live.

### AUDIO-14 — Source continuity, correction, and stopping

Preserve required source text, key images, event provenance, original user wording, correction history, and actual capture gaps; summaries and context corrections must not overwrite them.
Ordinary switching back to a course is not ending the session. Explicit source/session stops, permission revocation, and deletion follow the existing distinct semantics; no auto-restart of stopped capture or resurrection of deleted evidence.
After a track becomes unavailable, do not treat its last audio/frame as live. Late transcripts/backfill retain historical timestamps and cannot create a new live request or restore stale assistance permission.

### AUDIO-15 — Shared screen and iPad audio as the primary inputs

The required experience is for the AI to see the actual authorized shared screen, including a displayed view from either an iPad camera or a separate camera, and hear live iPad microphone audio in class or the iPad video's actual playback audio plus enabled microphone input. The camera choice remains tentative; the displayed classroom/board view and digital course screens may both provide context.
A direct camera API, external-camera connection or SDK is an optional means to achieve that experience, not an additional mandatory product feature. The user need not choose or buy a camera now. Do not assume a USB/UVC/wireless connection or simultaneous iPad screen/camera/microphone/course-audio support; verify each actual device, OS, app, connection and capture combination separately.
Measure board/formula legibility, distance, glare, motion/obstruction, cropping, timing, and stale frames. Preserve whether evidence came from a physical camera, its displayed/shared view, or a digital screen; use original captured evidence within the authorized buffer and request a clearer view only when necessary.
Camera audio is another source, not proof of user identity. Apply the same speaker uncertainty, overlap, stop, and retention rules; screen-sharing a camera preview does not prove its audio was captured.

## 4. Acceptance cases

Every case starts as `not_run`. Synthetic tests, recorded-sample comparisons, and real-device checks are reported separately; a mock or model claim cannot establish capture capability.
For each run, record inputs/reference evidence, configuration/version, supported path, outputs, errors/unknowns, measured timing/cost where relevant, and pass/fail evidence. Define thresholds before comparison and keep failures.

| ID | Scenario and required evidence | Initial status |
| --- | --- | --- |
| AVTEST-01 | Accented/unclear Chinese, English and code-switched technical speech with a course glossary and screen. Recover the supported meaning; retain original-language spans, uncertain alternatives and reversible correction provenance rather than replacing a word solely because it fits the lesson. | not_run |
| AVTEST-02 | Stumbles, a spoken self-correction, negation, wrong reasoning, and an abandoned solution. Preserve the actual sequence and mistake; distinguish ASR repair from teaching correction and report any lost negation/qualifier. | not_run |
| AVTEST-03 | Quiet user and distant professor at varying noise/levels. Compare original and processed audio plus VAD outputs; measure missing speech, clipping, false speech, and recognition errors. Unsupported recovery remains unknown. | not_run |
| AVTEST-04 | Test the actual shared screen showing a camera view or playing a lecture video, plus actual iPad app/playback audio and enabled microphone input. Include headphones so the microphone cannot substitute for the video track, teacher/user overlap, and assistant playback. Record which simultaneous inputs actually reach the AI; identify duplicate lecture/echo and preserve real user interruptions without false replies. Camera audio does not establish user identity, and a visible preview does not establish captured audio. Direct camera integration is optional. | not_run |
| AVTEST-05 | Live classroom listening through the iPad microphone, with teacher, user, another person, overlap, and a role correction. No saved recording or upload step is required. Report diarization/attribution errors and unknown spans; correction propagates without rewriting the original or claiming clean separation. Recorded test samples alone do not pass this live-device case. | not_run |
| AVTEST-06 | Quiet lecture mode with a soft or background professor and an unrelated nearby speaker. Measure retained/missed lecture content separately from response triggering; do not drop the professor or turn the nearby voice into the user's question. | not_run |
| AVTEST-07 | Spoken references to digital screens and camera-observed boards under seeking/speed changes, scrolling/edits, distance, glare, motion, and delayed frames/backfill. Measure board/formula legibility and alignment; resolve against the proper source/time/version, retain unreadable/stale gaps, and do not attribute later content to the earlier utterance. | not_run |
| AVTEST-08 | Screen/ink shows a reasoning error while speech is ambiguous, followed by a correction. Keep source wording, observed edits, interpretation, and diagnosis distinct; ask minimally when needed and respect “let me try” across all output channels. | not_run |
| AVTEST-09 | Low volume/emphatic tone caused by microphone position or speaking style, with a user correction to an inferred feeling. Keep emotional interpretation tentative; no durable emotion/mastery claim or extra disclosure permission follows. | not_run |
| AVTEST-10 | Repeat the same representative sample set across available Google/OpenAI native-audio and ASR-plus-multimodal routes. Produce the versioned scorecard, denominators, critical failures, latency and cost; record unavailable routes and make no untested universal winner claim. | not_run |
| AVTEST-11 | Live listening without a saved recording, plus source stop, session end, revocation, deletion, and disconnection with late transcripts. Apply the correct scope, keep historical gaps honest, do not restart capture or act on stale audio, preserve required transcripts/context, and do not silently store a full replayable lecture recording. | not_run |
| AVTEST-12 | Unresolvable critical speech, provider failure, and a near-budget concurrent workload. Bound retries/escalation, preserve unknowns, request focused clarification where useful, and demonstrate no perpetual calls, silent overspend, purchase, or account change. | not_run |

## 5. Integration mapping and boundaries

The existing [task coordination](../tasks.md#audio-screen-coordination) and
[traceability](../requirements-traceability.md#audio-screen-traceability) apply this
mapping without creating duplicate assignments. Data/route suggestions remain
engineering plans, not implemented APIs.

- Main requirements: cross-reference this addition from audio/source interpretation, capture/time alignment, source memory, model routing, voice behavior, and acceptance sections; retain existing R IDs and requirements in full.
- Platform/capture work: link G3, P1-03, and the existing DT-G3-05/DT-G3-11 verification work to relevant `AUDIO-*`/`AVTEST-*` cases after checking their current owners and scope. Recording samples do not pass live-device capture tests.
- Original-screen work: preserve R59/A44/A46 and the distinction between live original-screen ink, AI receipt of the composite, captured/frozen alternatives, editable originals, and external note import. Audio improvements do not replace their evidence.
- Learning/policy work: link R51–R59 process evidence, language, corrections, and disclosure rules; use observed audio/screen evidence without inventing unseen steps or upgrading assisted completion to independent mastery.
- Contracts/verification: have the integration lead coordinate additive versioned fields and owner assignments for source segments, transcript/correction revisions, role uncertainty, alignment, and scorecards. Suggested fields are not existing APIs or implemented protocols.
- Live-listening clarification: propagate the fourth exact source quote and AUDIO-13 into the decisions, architecture, task and verification pointers; close the obsolete recording-choice question. Any future saved-recording/replay feature needs separate scope and does not delay this live listening requirement.

This adopted document specifies requirements and validation only. Implementation, provider availability, measured quality, live-device capability, and acceptance status require their own evidence.
