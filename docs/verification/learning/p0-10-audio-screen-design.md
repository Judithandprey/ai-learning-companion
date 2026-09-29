# P0-10: audio/screen case and scorecard design

2026-09-28. PONYTAIL LITE. Initial packet specification read:
`89602e742aea9c6ef6b6ec6a76c371e20bff2edf` (content `7f43b5935549aa5bf9d8f815d49c37fc5ae10551`).
**Design only: 24 authored scenario definitions, zero media samples, zero executed cases.**
The [case packet and scorecard](p0-10-audio-screen-design.json) are review documents,
not a wire schema, a labeled audio corpus, an evaluator, or evidence of capture/model quality.
All twelve AVTEST cases remain `not_run`; no provider winner is selected.

Current normalization read: `7fadd151c83118c22a4846bdb8b2622d47bb0df3`
(content `9edbc1c65ccc06c3daaaea34a7b05dfaa849e29d`). The original 24 definitions
remain intact; the packet's `normalization_addendum` adds four paired AVTEST-09
design variants (eight planned acoustic conditions) and a coexistence overlay.
All are author-proposed, unreviewed and unexecuted. Current decisions govern;
the initial source/hash and validation receipt below retain their historical scope.

Read the complete original-English `audio-screen-interpretation.md`, all four user
quotes, AUDIO-01–15 and AVTEST-01–12; main R60/A47–49 and §11; full English intent
and problem-solving documents with their applicable original clauses; current
P0-10/audio coordination, role/AGENTS/TEAM changes, V-SourceTimeRelations,
V-MultiDeviceUnderstanding/V-LearningProgress, and ADR 0002 §11.
The English working policy was read at `6efa59e`; all four source/translation pairs
were hash-checked against the current manifest. The audio source SHA-256 is
`728d2b5e20978becc1357b73dd4902b708fffce133baad49a43923dd90966881`.

## Behavioral separation

| Decision | Evidence and limit |
| --- | --- |
| Capture and retain | Preserve actually available authorized classroom/playback/microphone content and gaps even when AI must remain silent. A quiet response policy must not suppress the professor's VAD/capture path. Record loss before and after processing separately. |
| Interpret | Preserve initial ASR hypotheses, original-language spans, oral alternatives and acoustic availability. Context supports a separate proposed repair; it is not proof of the unheard word. Record evidence, changed span, revision, uncertainty and proposed/confirmed/rejected status. AI confidence is not user confirmation. |
| Attribute | Source track, diarized interval, proposed person/role and addressee are separate. Mixed/overlapping speech may remain unknown; a role correction keeps the original time and previous attribution. No claim of clean separation follows from a role label. |
| Respond | A request needs supported user/addressee evidence and current scoped permission. Teacher questions, nearby speech, echo, a pause, emotional inference or historical backfill do not grant help. Use the established talk control or one focused clarification where needed; preserve genuine interruptions. |
| Diagnose and remember | ASR repair never silently repairs an actual wrong derivation or removes negation, units or an abandoned branch. Assessment/role corrections invalidate affected derived claims without altering originals or inventing independent mastery. Retain source text, key images, oral attempts and correction history under scoped deletion. |

The base packet has two distinct cases per AVTEST, with explicit negative controls and
required execution layers. Their illustrative utterances are project-authored,
synthetic/test-only scripts, not things this user or a professor actually said.
Expected behavior is an **author proposal awaiting independent review**, not a
human-reviewed meaning reference. Real speech may be unintelligible even when its
script is known; never use the script to pretend a model heard the intended words.

## Coverage and reference preparation

| AVTEST | Local cases | Main distinction |
| --- | --- | --- |
| 01 | AS01–02 | Evidence-supported term repair versus context-driven invention; Chinese/English/code-switching |
| 02 | AS03–04 | Spoken revision/abandoned route and actual wrong reasoning; negation/sign/unit preservation |
| 03 | AS05–06 | Quiet speech, clipping and VAD loss; distant professor versus processing artifacts |
| 04 | AS07–08 | Actual headphone playback plus enabled mic; duplicate lecture/assistant echo versus a genuine interruption |
| 05 | AS09–10 | Live mixed classroom roles, unknown overlap and later correctable attribution |
| 06 | AS11–12 | Professor content retained in quiet mode; nearby speech does not initiate a user conversation |
| 07 | AS13–14 | Seek/speed/clock/source versions; shared camera-board legibility without invented audio/direct-camera access |
| 08 | AS15–16 | Genuine mathematical mistake versus ambiguous recognition; rejected repair and current exploration scope |
| 09 | AS17–18; AP01–04 | Tentative cues and missing audio; paired useful stress/pause/intonation/background evidence versus transcript-only interpretation |
| 10 | AS19–20 | Same-input route comparison; unavailable/noncomparable routes and absent human references |
| 11 | AS21–22 | Live listening without recording/upload; source stop, broader revocation, deletion and historical backfill |
| 12 | AS23–24 | Consequential uncertainty and bounded escalation; concurrent reservations and ambiguous failures |

Before a future comparison, QA reviews scenario relevance and independent annotators
establish source-time spans, spoken words/alternatives, critical terms/polarity/units,
known/unknown roles, intended referents and actual requests. Keep disagreements and
unknown meaning separately; ask the user only for genuinely consequential unresolved
meaning. Hide route identity and author expectations during initial output scoring.
Freeze source versions, reference labels and split before held-out runs. Use a pilot
for processing/prompt calibration; never tune on or silently remove held-out failures.
One judge model's agreement is not truth. Preserve original p06/p29/p37 and surface
review disagreements; this addition neither resolves them nor reruns the old 25/65/32.

## Bounded comparison plan, not an experiment authorization

Compare actually available Google native-audio, OpenAI native-audio and ASR-plus-
multimodal route slots. All are currently `availability_not_checked`. Verify actual
entitlement, API input features, device/path and budget controls before any call;
a subscription or consumer live product is not proof. No specific product/model is
recommended by this design. If a slot cannot receive the required modalities, mark
that condition unavailable/noncomparable; do not silently substitute text or a later frame.

For each matched interpretation trial, give every eligible route the same authorized
source audio segments, screen versions/crops and permitted prior context/glossary.
Native routes retain obtainable acoustic evidence. The ASR route consumes that same
audio, retains its ASR output as an intermediate, and passes the faithful transcript
and synchronized visual context to its interpretation stage. Record every adapter,
resample/processing step and prompt difference; preprocessing is a declared condition,
not a hidden route advantage. Include ASR-stage latency/cost in end-to-end totals.
Matched sample tests do not pass the separate live iPad capture/response tests.

Initial **engineering limits** in the packet propose 12 pilot and 24 held-out source
episodes, at most three route slots, two attempts per episode/route, two provider
requests per attempt, and a 20-minute batch deadline. Thus at most 432 request slots
exist before tighter time, entitlement or money limits; unused slots are not a quota
or permission to spend. These numbers are adjustable before a future run and are not
user requirements or a statistically sufficient quality guarantee. Each attempt has
a 20-second processing ceiling, not a live-response latency target. Stop new work at
any bound; keep unfinished/unavailable rows visible. No automatic comparison on every utterance.
Current execution is disabled and authorized spend for this packet is zero.

Before starting, the lead must supply the actual available routes and approved
batch reservation bound within existing controls; missing price/quota is unknown,
never free. Count retries, both ASR stages and ambiguous/timed-out requests; retain
their reservations until reconciled. Inspect available original evidence or ask one
focused question instead of guessing after the finite escalation allowance. Honor
new local/remote stops immediately; cancellation does not erase already incurred cost.

Score the versioned metrics in the packet with known/unknown denominators and
per-language, quiet/distant/overlap, device/app/headphone and input-availability strata.
For quiet professor loss, compare independent authorized reference content against
capture, post-processing delivery and interpretation separately; measuring only the
surviving transcript hides front-end loss. If reference evidence is unavailable,
report an unknown denominator, not zero loss. Keep critical failures item by item.
WER/CER may supplement semantic scores with a declared tokenization policy; they
cannot decide the winner alone. Freeze noncritical quality/timing tolerances after
pilot and before holdout, retaining the existing §11 voice-stop P95 ≤300 ms target.
Abstention on a human-resolvable meaning stays in the known-reference denominator
as an unanswered item; report it separately from genuinely unknown reference meaning.
Compare only eligible matched cells; report missing cells and uncertainty. Averages
cannot cancel negation reversals, professor loss, fabricated content or leaked answers.
No route passes an unmeasured or failed required condition merely by scoring well elsewhere.

## Narrow current-decision variants

Read the current-decision entry and D-AUDIO-SCREEN, full audio specification including
AUDIO-06/07/10/11 and AVTEST-04–06/09/11, synchronized R60/A47–49 source/English,
audio coordination and role guidance at `7fadd151`. Original new user quotations
were read in `history/audio-screen-discussion-2026-09-28.md` (§§5–8); history is not
competing current guidance. The four updated source/translation hashes match.

| Pair | Identical foreground words | Planned acoustic distinction / useful evidence to review |
| --- | --- | --- |
| AP01 | I said subtract the second term | Stress on **subtract** versus **second** may support an operation-versus-operand contrast; neither changes the literal words or grants a larger check. |
| AP02 | I would divide no multiply by two | Pause before versus after **no** changes observable repair timing/grouping; preserve the spoken alternatives, not an invented motive or a different final computation. |
| AP03 | You mean the second term | Rising versus falling/level ending may distinguish a confirmation question from a restatement; role/addressee/context remain necessary and ambiguity may survive. |
| AP04 | That is the one | Relevant background teacher speech refers to the numerator versus denominator while the same fraction remains visible. Preserve both speakers; a faithful full-source transcript may provide the same useful context. |

These scripts specify future contrasts, not actual acoustic artifacts or validated
reference meanings. A human must independently listen and annotate usable cues,
supported interpretations, ambiguity and disagreement before scoring. Do not expose
author stress/pause directions or candidate interpretations as model inputs. The
text-only condition uses the same screen/context and normalized words without inserted
prosody labels; for AP04 it includes the professor's actual faithful transcript too.
Do not quietly drop the professor to manufacture an audio advantage. Freeze the text
condition and its punctuation/timestamp/role metadata policy before comparison.
Measure supported additional specificity, justified unknowns and false certainty;
no audio winner or objective emotion truth is predetermined. Every comparison call,
including a text-only ablation, consumes the existing run limits; no fourth provider
slot, free extra calls or expanded trial/spend authorization is created.

The coexistence overlay extends AS05–12/21–22: a quiet near-mouth learner and distant
professor continue while additional people enter/leave and overlap. Keep each
reference person distinct within the authorized test, or an explicit unresolved
speaker span; do not force extra people into one bystander identity. Measure omissions
and attribution **per person and per stage** (capture, processing delivery, semantic
interpretation), with overlap/unknown denominators. Personal-microphone success
cannot cancel professor loss. Input listings, duplicated mono and quiet AI output
are insufficient evidence. On supported routes, primary interaction device/input
and AI output can switch without dropping other authorized sources or restarting a
stopped source. Logical primary interaction is not a hardware microphone-count limit.

Acceptance evidence is cumulative: required live inputs **and** actual AI input/
processing/output **and** human-reviewed semantic references **and** applicable
persistence/stop evidence. Existing `execution_layers` lists are dependencies, never
alternative ways to pass. Neither live capture alone nor another AI's agreement is
human-reviewed understanding evidence. All new measurements remain null.

The target is user-reported M5 iPad Pro 13-inch/iPadOS 26.5, not a device result.
Conditional dualRoute and other hardware routes remain the platform owner's tests
under the exact current candidate constraints; no USB/input-only or high-quality-
Bluetooth combination is inferred. Core classroom understanding remains P1-03;
optional two-device capture remains P3-01. No recording choice, purchase, mode
activation or new user product decision is introduced. Original ink, independent
display/purpose/destination and actual Notability import retain their own evidence.

## Evidence, lifecycle and contract dependencies

Live iPad classroom listening requires no saved lecture, manual upload or replay.
Actual app/playback audio with headphones plus enabled mic is a distinct real-device
check; loudspeaker recapture does not pass it. A displayed shared camera view is a
required possible screen source; buying/selecting a camera or a direct-camera SDK
is not required. Record legibility, occlusion/glare/motion and temporal uncertainty;
a visible preview proves neither its sound nor a direct-camera stream was received.

Required transcripts/key images/corrections outlive a temporary processing buffer
according to existing retention rules. Raw/processed audio correspondence is inspected
only during the actually authorized bounded window; this plan sets no permanent audio
archive or new retention grant. A separate authorized evaluation sample may be retained
only within its stated consent/retention scope. Buffer expiry limits later reproducibility:
keep permitted run metadata and required source records, mark raw audio unavailable,
and never fabricate replay evidence or retain deleted content/hashes as a hidden archive.
Declare buffer settings before capture with Backend/iOS; this engineering prerequisite
does not reopen the closed recording-choice question or delay other authorized work.

ADR 0002 §11 still needs a formal contract for segment/source identity, separate
speaker/addressee assessments, hypothesis/correction status, audio-to-frame clock/
media/version alignment, raw/processed lineage and scoped stop/deletion. Actual
display/playback receipts remain distinct from audio input and destination import.
Current `services/learning/archive.py` rejects actor-changing corrections and requires
later capture time; `retrieval.py` treats corrections as superseding in current queries.
Neither behavior represents a proposed/rejected transcript or later role assessment.
Do not coerce these cases into 0.1.0 `correction_of`, weaken frame identity or create
another archive. Consumer implementation awaits the lead's versioned baseline.

## Actual validation and limits

Standard-library document checks confirmed 24 unique definitions, two per AVTEST,
coverage of all assigned AUDIO IDs (plus AUDIO-13's cross-cutting live/retention rule),
not-run states, pending independent labels, null measurements and matching source/
translation hashes. Markdown links and `git diff --check` were checked. These are
document-integrity checks, **not 24 semantic or audio passes**. The check command
and actual receipt are recorded in the packet's `document_validation` entry.
That receipt applies to the base packet. The addendum's own static receipt additionally
checks unchanged base cases/metrics/run limits, four two-condition pairs, unreviewed
labels, cumulative evidence and current source hashes; it is not an acoustic result.

No audio collected/generated, human references acquired, provider availability
queried, model/API calls, device tests, services or dependencies added. All comparison
measurements are null; this turn's product API usage/cost is zero. P1-03/P1-04/P3-01
ownership stays as assigned; DT-G3-05/11 are capability prerequisites, not comprehension
evidence. A47–49/G3/G4/G7 and independent semantic review remain unaccepted.
R59/A44/A46, editable original ink and actual Notability import retain separate evidence.
There is no new user product-choice question or recording prerequisite.
