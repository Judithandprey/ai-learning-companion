# Audio and Screen Interpretation: Additive Product Requirements

Status: normative addendum adopted on 2026-09-28 UTC under the user's integration request; no capability, implementation, acceptance result, or provider winner is claimed.
Local IDs `AUDIO-01`–`AUDIO-15` and `AVTEST-01`–`AVTEST-12` remain stable and are mapped by [main specification](../requirements.md) R60/A47–A49. This is an original English source, not a translation.
Initial source packet SHA-256: `8dd09b2f586944950a54faa2058d191c19775a50393033f882d66f5bb7b5b5cf`. Exact quotations and superseded discussion are retained in [source history](history/audio-screen-discussion-2026-09-28.md); this page contains effective requirements and labeled engineering candidates. [Initial adoption](../verification/lead/audio-screen-interpretation-adoption.md) and [final normalization](../verification/lead/audio-final-decisions-normalization.md) record incremental provenance.
The original requirements and later explicit user decisions remain authoritative. Read their relevant clauses together with this addition; summaries do not replace them.
English is the working language. Existing English-first teaching, original-language source preservation, exploration/disclosure limits, budgets, and stop semantics remain in force.

<a id="current-audio-decisions"></a>

## 1. Current effective behavior

The single current-decision entry is [intent and confirmed decisions](intent-and-decisions.md#current-decisions). The exact conversation is preserved separately in [source history](history/audio-screen-discussion-2026-09-28.md); historical wording does not compete with current clauses.

Under [D-DESKTOP-FIRST](intent-and-decisions.md#desktop-first), complete the full audio/screen experience separately on Windows and macOS first; native iPad/phone variants are deferred without deleting their requirements or evidence. The AI is a companion beside the learner: jointly understand what is actually shared on screen and actually audible from each desktop or surrounding class, with the equivalent iPad experience retained for later. This objective grants no unseen actions, inaudible words, other people's intentions or unobserved edit history. Cover the learner, professor and additional people, changing speaker counts and overlaps; preserve correctable attribution and unknowns instead of forcing every speaker into two labels or promising perfect unlimited-speaker separation.

Hear a quiet personal question without losing the class. The microphone is unselected; recommend a route from measured effectiveness, not a purchase assumption. Designate one primary learner interaction input and one AI playback endpoint for interaction/echo control, while retaining additional authorized classroom/playback inputs on verified routes. A source is not a person. This logical primary-input role is distinct from a platform API's hardware primary route.

On each desktop, live authorized classroom/environment microphone listening and actual system/app playback plus enabled learner microphone are required; preserve equivalent iPad variants for later; headphones must not remove the video's audio from the AI input. No saved lecture recording, manual record/upload or replay is a prerequisite. Required source transcripts, key images and process context persist independently of authorized transient buffers. The actual shared screen may include a camera preview; dedicated camera integration is optional, and a visible preview proves neither camera-stream nor audio access.

Windows is available; interactive Mac access is unconfirmed. Hosted macOS CI/Xcode builds do not demonstrate desktop permission dialogs, system audio, microphone mixing, capture/pen overlays or Sidecar. The reported later mobile target remains **iPad Pro 13-inch (M5), iPadOS 26.5**; its identity question is answered, while runtime capabilities/routes/signals remain unverified. Sidecar is a later candidate, not an audio/capture dependency or native iPad overlay proof. Camera/microphone choices remain engineering candidates; no route is activated or purchased. The disabled product provider and unfinished trusted runtime bootstrap remain open dependencies, not passed by this specification.

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

Capture authorized classroom/teacher audio, actual course/system playback and the learner microphone as distinguishable sources where the route supports them. A quiet near-mouth personal microphone must not stop professor capture or interpretation. Evaluate actual simultaneous signals; logical source roles and available input listings alone do not establish hardware concurrency.
For video on Windows and macOS separately, verify actual system/app playback delivery alongside authorized microphone/environment sources. Do not substitute microphone recapture of loudspeakers for internal audio. Include headphones, concurrent quiet user/teacher/other speech, per-app availability, input/output selection, attach/detach and recovery. Preserve the equivalent iPad video test as deferred. Report unsupported/unavailable sources without blocking unrelated available work or passing missing coverage.
Keep both authorized sources available to interpretation; an assistant staying silent during a lecture does not mean lecture observation/transcription stops. Report unsupported or unavailable tracks instead of implying complete coverage.
Deduplicate the same lecture captured through a system track and microphone, and distinguish assistant playback/echo from fresh user speech without deleting genuine user interruptions.

### AUDIO-07 — Live classroom microphone audio and correctable speakers

For live classroom microphone audio with mixed voices, attempt speaker diarization with correctable role attribution: teacher, user, assistant, additional speakers, or unknown. Cover more than two people and changes in speaker count; preserve individual attribution evidence, overlap and uncertain turns rather than silently dropping or merging extra people. This must work as a live listening workflow; requiring a saved recording and later upload is not an equivalent replacement. Authorized recorded samples may separately support evaluation.
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
Score intent understanding, critical terms, negations/qualifiers, attribution and omitted content by speaker, missing lecture content, false responses/interruptions, invented content, screen/time grounding, end-to-end latency, and actual cost/quota usage. AVTEST-09 also compares human-reviewed paired acoustic examples against a transcript-only path; measure useful evidence, unknowns and failures without presuming an audio-route win or using subjective emotion labels as objective truth.
Use human-reviewed references and the user's clarification where meaning is genuinely ambiguous; report unknown cases separately rather than inventing ground truth. Overall averages must not conceal critical-term, quiet-speech, or professor-loss failures.

### AUDIO-12 — Bounded escalation and unchanged spending authority

Escalate an uncertain consequential span to a more capable available route, inspect original evidence, or ask a focused question; reprocessing has finite attempts/time/cost and preserves provenance.
Numerical targets, sample counts, and retry limits are engineering defaults to calibrate and document, not figures the user has specified here. No perpetual multi-model calls or automatic comparison on every utterance.
Existing reservations, concurrency accounting, subscription/API distinctions, and budget ceilings remain unchanged. This requirement authorizes no purchases, new provider accounts, account changes, or silent quota/budget expansion.

### AUDIO-13 — Live listening does not require a saved recording

Live microphone/playback listening is required without a manual recording operation, saved lecture-audio file, later upload or replay prerequisite. Q-AUDIO-RETENTION is settled; its chronology belongs only in source history.
Real-time capture/streaming and the existing authorized short verification buffer are processing mechanisms, not a requirement to retain a replayable lecture recording. Do not silently enable permanent recording or add a full-session replay requirement. A later separate explicit recording request can define its own scope.
Retain the existing source-transcript, key-image, process-history, stop and deletion requirements. Document any unresolved engineering buffer setting and its verification effect without treating it as an unresolved user choice about whether the AI should listen live.

### AUDIO-14 — Source continuity, correction, and stopping

Preserve required source text, key images, event provenance, original user wording, correction history, and actual capture gaps; summaries and context corrections must not overwrite them.
Ordinary switching back to a course is not ending the session. Explicit source/session stops, permission revocation, and deletion follow the existing distinct semantics; no auto-restart of stopped capture or resurrection of deleted evidence.
After a track becomes unavailable, do not treat its last audio/frame as live. Late transcripts/backfill retain historical timestamps and cannot create a new live request or restore stale assistance permission.

### AUDIO-15 — Shared screen and actual desktop audio first; mobile variants retained

The required current experience is for AI to receive the actual authorized whole visible display and audio on both Windows and macOS: original course/app views, a displayed camera preview when used, live authorized microphone/environment sources and actual system/video playback plus enabled learner microphone. Each OS separately proves capture→actual AI input→grounded interpretation, including the original-screen selector/ink in the same context under main §7.1. File import, DOM-only data, a mock provider or a local preview cannot substitute. Preserve later iPad camera/separate-camera displayed views, live iPad classroom microphone and video playback plus microphone variants. Camera choice remains tentative; displayed classroom/board and digital course screens both provide context.
A direct camera API, external-camera connection or SDK is an optional means to achieve that experience, not an additional mandatory product feature. The user need not choose or buy a camera now. Do not assume USB/UVC/wireless or simultaneous screen/camera/microphone/course-audio support on either desktop or later iPad; verify every actual device, OS, app, connection and capture combination separately.
Measure board/formula legibility, distance, glare, motion/obstruction, cropping, timing, and stale frames. Preserve whether evidence came from a physical camera, its displayed/shared view, or a digital screen; use original captured evidence within the authorized buffer and request a clearer view only when necessary.
Camera audio is another source, not proof of user identity. Apply the same speaker uncertainty, overlap, stop, and retention rules; screen-sharing a camera preview does not prove its audio was captured.

<a id="microphone-routing-candidates"></a>

### Engineering routing candidates — desktop first, later iPad candidates unverified

First measure each Windows/macOS route using authorized system playback plus microphone/environment sources, a quiet learner, distant teacher and additional/changing speakers. Record actual ports/channels, headphone-only AI output, attach/detach, input/output switching, recoveries, latency, source-specific stops and joint screen/ink context. Device listings and raw tracks identify sources, not speakers or successful understanding. A working Windows route cannot pass macOS, and hosted CI cannot exercise the missing interactive Mac permissions. Capture permission, actual AI delivery, understanding quality and response permission remain separate gates. No hardware is selected or bought.

The following Apple AVAudioSession candidates are **deferred iPad-specific work**, not a desktop routing mandate, desktop API claim or desktop-release prerequisite. Existing reports and original device test conditions stay preserved.

The first later iPad candidate to validate is built-in classroom pickup plus a near-mouth compatible bidirectional headset using `dualRoute`. Apple documents it from iPadOS 26.2 with `multiRoute` and `allowBluetoothHFP`; listed secondary types are `headsetMic`, `headphones`, `bluetoothLE` and `bluetoothHFP`, with both input and output required. USB/input-only devices are not established by that list. Check `availableModes`, active routes/channels and real signals on the reported 26.5 target. API primary hardware is built-in; this does not dictate the application's primary learner interaction input. [Apple dualRoute](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/dualroute), [availableModes](https://developer.apple.com/documentation/avfaudio/avaudiosession/availablemodes).

`bluetoothHighQualityRecording` requires `default` mode; do not promise it together with `dualRoute`. Quality and latency need measurement. Preserve Apple's participant-awareness condition and existing source authorization; capability documentation grants no capture authority. [Apple high-quality option](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/bluetoothhighqualityrecording). Earlier general/archived selected-input guidance does not prove the newer mode impossible. Lead's [official-source check](../verification/lead/audio-final-decisions-normalization/official-sources.json) records metadata and source hashes, not a device pass.

| Candidate | Evidence needed / limits | Existing phase |
| --- | --- | --- |
| Built-in classroom input plus compatible personal bidirectional headset through dualRoute | Actual independent signals, quiet learner/far professor/additional speakers, attach/detach/recovery, headphone-only AI output and screen/playback coexistence; unavailable mode/older OS and unsupported devices stay explicit. Hardware selection and output routing are unverified. | Deferred native iPad G3/P0-03/11 and later P1-03 variant; current core P1-03 runs on both desktops. |
| Compatible external multichannel interface/receiver | Independently varying real input channels, power/cable/processing and app delivery on this device; a hub, splitter or duplicated mono mix does not prove separate sources. | Deferred iPad G3/P1-03 candidate, not purchased/chosen; desktop interface routes require their own tests. |
| Existing iPad plus iPhone capture | Actual timestamps/drift, duplicate sound, latency, reconnect/lock/background and per-device stops; one AI playback endpoint. | Deferred optional iPad/iPhone P3-01 variant; current desktop classroom understanding is P1-03 and cross-desktop coordination P3-01. |

Recommend equipment only after relevant route/quality evidence. Test close placement for quiet speech and the clearest available authorized teacher source; a professor feed or closer microphone is optional, never assumed. No gain setting or stronger model proves recovery of words lost before capture. Do not switch modes/accounts or buy hardware during documentation work.

## 4. Acceptance cases

Every case starts as `not_run`. Execute all applicable cases on Windows and macOS separately; retain original iPad/headset/dualRoute/phone cases as explicitly deferred variants, never passed by desktop results. Native mobile and Sidecar are not prerequisites for desktop work. None of these cases is canceled or completed by reprioritization. Synthetic tests, recorded-sample comparisons, and real-device checks are reported separately; a mock or model claim cannot establish capture capability.
For each run, record inputs/reference evidence, configuration/version, supported path, outputs, errors/unknowns, measured timing/cost where relevant, and pass/fail evidence. Define thresholds before comparison and keep failures. Evidence dimensions are cumulative: live input where required, actual AI input/processing/output, human-reviewed references for semantic judgments, and persistence/stop evidence where relevant. Recorded inputs cannot substitute for a required live case; capture alone cannot pass understanding, and independent AI review is not human reference review.

| ID | Scenario and required evidence | Initial status |
| --- | --- | --- |
| AVTEST-01 | Accented/unclear Chinese, English and code-switched technical speech with a course glossary and screen. Recover the supported meaning; retain original-language spans, uncertain alternatives and reversible correction provenance rather than replacing a word solely because it fits the lesson. | not_run |
| AVTEST-02 | Stumbles, a spoken self-correction, negation, wrong reasoning, and an abandoned solution. Preserve the actual sequence and mistake; distinguish ASR repair from teaching correction and report any lost negation/qualifier. | not_run |
| AVTEST-03 | Quiet user and distant professor at varying noise/levels. Compare original and processed audio plus VAD outputs; measure missing speech, clipping, false speech, and recognition errors. Unsupported recovery remains unknown. | not_run |
| AVTEST-04 | Test the actual shared screen showing a camera view or playing a lecture video, plus actual Windows/macOS system/app playback and enabled authorized microphone/environment input, separately per OS. Retain the actual iPad playback-plus-microphone variant for later. Include headphones so the microphone cannot substitute for the video track, teacher/user overlap, and assistant playback. Record which simultaneous inputs actually reach the AI; identify duplicate lecture/echo and preserve real user interruptions without false replies. Camera audio does not establish user identity, and a visible preview does not establish captured audio. Direct camera integration is optional. Also test the personal microphone under headphone playback, attach/detach/recovery, actual ports/channels and assistant output; quiet learner and course contributions must both reach interpretation. | not_run |
| AVTEST-05 | Live classroom listening through actual authorized microphone/environment routes on each desktop, including teacher, user, another person, overlap and a role correction; retain the original iPad microphone variant for later. No saved recording or upload step is required. Report diarization/attribution errors and unknown spans; correction propagates without rewriting the original or claiming clean separation. Recorded test samples alone do not pass this live-device case. Include a near-mouth personal microphone plus built-in classroom pickup where supported, more than two people and changing speaker counts; measure omissions and attribution per person. For each desktop, test actual independent signals, system/screen-sharing coexistence, input/output switching, route loss and recovery; listed devices alone are insufficient. Retain later iPad conditional dualRoute, unavailable/older-mode and USB/input-only limitations; availableInputs alone is insufficient. A multichannel-interface candidate needs independent signals, not duplicated mono, on each claimed platform. | not_run |
| AVTEST-06 | Quiet lecture mode with a soft or background professor and an unrelated nearby speaker. Measure retained/missed lecture content separately from response triggering; do not drop the professor or turn the nearby voice into the user's question. Include a quiet learner speaking through the personal microphone while the distant professor and another speaker continue; distinguish omitted input from recognition loss and preserve all authorized sources. | not_run |
| AVTEST-07 | Spoken references to digital screens and camera-observed boards under seeking/speed changes, scrolling/edits, distance, glare, motion, and delayed frames/backfill. Measure board/formula legibility and alignment; resolve against the proper source/time/version, retain unreadable/stale gaps, and do not attribute later content to the earlier utterance. For P3-01 Windows/macOS cross-desktop input measure clock drift, duplicated sound, delay, reconnect and independent source identity. Retain the same measures for the later optional iPad/iPhone candidate; do not defer either desktop's P1-03 core classroom delivery. | not_run |
| AVTEST-08 | Screen/ink shows a reasoning error while speech is ambiguous, followed by a correction. Keep source wording, observed edits, interpretation, and diagnosis distinct; ask minimally when needed and respect “let me try” across all output channels. | not_run |
| AVTEST-09 | Low volume/emphatic tone caused by microphone position or speaking style, with a user correction to an inferred feeling. Keep emotional interpretation tentative; no durable emotion/mastery claim or extra disclosure permission follows. Add small human-reviewed paired examples with the same words but different stress, pauses or intonation, or different relevant background teacher speech. Compare an available original-audio path with a transcript-only path; retain interpretation, evidence, unknowns and critical errors. Test useful acoustic interpretation without a predetermined winner or objective emotion labels. | not_run |
| AVTEST-10 | Repeat the same representative sample set across available Google/OpenAI native-audio and ASR-plus-multimodal routes. Produce the versioned scorecard, denominators, critical failures, latency and cost; record unavailable routes and make no untested universal winner claim. | not_run |
| AVTEST-11 | Live listening without a saved recording, plus source stop, session end, revocation, deletion, and disconnection with late transcripts. Apply the correct scope, keep historical gaps honest, do not restart capture or act on stale audio, preserve required transcripts/context, and do not silently store a full replayable lecture recording. Include personal-microphone route changes, per-source stop/recovery, independent classroom continuation, desktop input/output switching and cross-desktop stop behavior, retaining the later optional iPad/iPhone variant; hardware indicators and actual AI input must agree with the claimed scope. | not_run |
| AVTEST-12 | Unresolvable critical speech, provider failure, and a near-budget concurrent workload. Bound retries/escalation, preserve unknowns, request focused clarification where useful, and demonstrate no perpetual calls, silent overspend, purchase, or account change. | not_run |

## 5. Integration mapping and boundaries

The existing [task coordination](../tasks.md#audio-screen-coordination) and
[traceability](../requirements-traceability.md#audio-screen-traceability) apply this
mapping without creating duplicate assignments. Data/route suggestions remain
engineering plans, not implemented APIs.

- Main requirements: cross-reference this addition from audio/source interpretation, capture/time alignment, source memory, model routing, voice behavior, and acceptance sections; retain existing R IDs and requirements in full.
- Platform/capture work: Windows/Web and macOS/Native owners link G3/P1-03 to every relevant desktop `AUDIO-*`/`AVTEST-*` equivalent. Preserve DT-G3-05/DT-G3-11 and their iPad-specific variants as deferred evidence plans under their existing owners; no repeated mobile assignment follows. Recorded samples and hosted CI do not pass live desktop/device capture.
- Original-screen work: preserve R59/A44/A46 and the distinction between live original-screen ink, AI receipt of the composite, captured/frozen alternatives, editable originals, and external note import. Audio improvements do not replace their evidence.
- Learning/policy work: link R51–R59 process evidence, language, corrections, and disclosure rules; use observed audio/screen evidence without inventing unseen steps or upgrading assisted completion to independent mastery.
- Contracts/verification: have the integration lead coordinate additive versioned fields and owner assignments for source segments, transcript/correction revisions, role uncertainty, alignment, and scorecards. Suggested fields are not existing APIs or implemented protocols.
- Current-decision maintenance: use the canonical decision entry and history references. P1-03 retains live classroom/video understanding on both desktops, P1-04 retains source evidence, and P3-01 handles cross-desktop understanding. Native mobile and optional iPad/iPhone capture variants are deferred; Sidecar remains a separate later candidate. Proposed routing fields and hardware are engineering candidates; no saved-recording choice is pending.

This adopted document specifies requirements and validation only. Implementation, provider availability, measured quality, live-device capability, and acceptance status require their own evidence.
