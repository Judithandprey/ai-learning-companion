# ADR 0002: process evidence, current permission and actual outcomes

2026-09-28 UTC. **Status: capture-only contract formalized; remaining design proposed.**
Bounded Backend/Learning/QA design review was received. This ADR as a whole is not
an implemented runtime, approved migration or G7 pass.
Normative baseline: `9ce270cc747676889797199b7e8455ccfef07a5f`; main input baseline:
`0f944b9a482f51ab9e6ec57f21e4cea0cc42dded`. All names, route spellings and the
proposed process version below are engineering choices subject to review.


Implementation boundary: [capture-only 0.2.0](../../packages/contracts/process_v2/README.md)
now has separate executable schemas, Python validation, generated types/OpenAPI and
compatibility tests. This implements local shape/invariant checking for operation
and coverage batches, not this entire ADR or a running ingestion service. The
remaining record families, transactional lifecycle and presentation/export guards
stay proposed except the bounded internal capture persistence described in the
[P0-09 integration record](../verification/lead/p0-09-capture-integration.md).
Default 0.1.0 wire behavior remains unchanged. The narrow service specification
rejects unresolved causal/attempt dependencies atomically; artifact bytes may be
explicitly pending in an otherwise committed metadata receipt.

Read with [confirmed intent](../requirements/intent-and-decisions.md), the full
[process specification](../requirements/problem-solving-companion.md),
[original-goal cases](../requirements/original-goal-verification.md) and
[consumer traces](p0-08-consumer-review-inputs.md). Original R01–R50, stages and
budget boundaries remain; this design also covers R51–R59/A30–A46 and G7.

## 1. Evidence and current implementation

Current review qualification: the integrated Web test-only model is not a validated
implementation of this ADR. [Independent QA and bounded reproduction](../verification/lead/qa-continuation-2026-09-28.md)
found connected restrictive intent lost on reconnect (D1), possible export exposure
lost under reordered evidence (ORG-3), and closed-shadow script/user ambiguity
(EO-1). Preserve §§2/3/6–8 requirements when formalizing the wire contract; do not
inherit these model assumptions or treat their passing randomized oracle as proof.
The older Backend consumer packet also does not exhaust current T1/T3 or linked-v1
cases; integration of design evidence is separate from complete coverage.

Design inputs were read at their exact commits: Backend 014d1807, 14d5a7c and
45b6085; Learning fd5162b, 7da2298, 53300c8 and 45ce567; iOS b284db1; Web
c5345186/8a32a8a. The lead's
[iOS follow-up](../verification/lead/p0-11-delivery-review.md) requests corrections
to retention, provider-receipt and A44 qualification. They are not device results.
QA's existing case disagreements remain evidence, not majority-vote decisions.
The subsequent owner reviews are Backend `9e60468`, Learning `0b2a25a` and
QA `b82def6`; the latter's T1–T3 are incorporated below. The lead read iOS
`3f13167` and Support `7cb9057` as follow-up inputs. These are design reviews,
not execution results; see [integration disposition](../verification/lead/p0-review-integration.md).

The current [0.1.0 package](../../packages/contracts/README.md) has closed object
schemas and fixed version constants. Observation actor/gap enums, selection-only
bridge messages, silent explanation objects and G1–G6 CapabilityResult cannot
express the full new behavior. NoteRevision requires context frames; missing
capture must not be hidden behind invented frame IDs. TypeScript generation is
structural typing, not input validation or semantic authorization.

No schema, endpoint, generated file, migration, provider or device implementation
changes in this ADR. Existing raw sources, identity, notes and evidence stay intact.

Actual call-flow limits: `services/api/domain.py` validates old batches before
transactions; `import_fixture` is synthetic-only and `import_ink` has no production
transport. `services/api/storage.py` protects only five old immutable kinds, so new
records need explicit persistence/deletion protection, not merely generic JSONB.
`services/learning/archive.py` is a synthetic fixture adapter and orders corrections
by capture time; `retrieval.py` hides corrected events in current queries. Neither
is a general branch/undo/cross-device causality protocol. Session, device-stream and
export concepts also do not imply that matching public schemas already exist.

## 2. Compatibility decision proposed for review

Keep 0.1.0 schema and generated output frozen at the integrated baseline.
The explicit QA-14 validator safety correction rejects malformed extreme nesting
before error rendering; its byte-pin exception is recorded with regression tests,
without changing valid v1 payloads. Preserve `/v1` behavior for unassociated resources; the explicit linked
resource guards below apply when the extension is enabled. Add an explicitly selected **process extension 0.2.0**, with
its own schema identifier, generated namespace and validation entry point. Do not
silently change the default `validate(name, payload)` to interpret new records.
Reuse the existing local schema definitions through lead-owned generation or
reference resolution, not a separately maintained copy in each consumer. Any
generator extension must preserve byte-identical old artifacts in compatibility tests.

Candidate new route families are `/v2/process/events:batch` and a read of current
problem state under `/v2/problems/{id}`. Exact commands, auth scopes, errors and
request/ACK shapes are a subsequent lead contract slice. Trusted native/backend
capability negotiation must explicitly advertise the extension. A page cannot
claim support or grant authority. Unknown versions/kinds/actors never silently
fall back to ordinary text, an old card, unrestricted help or a positive capability.

Old clients may continue their verified 0.1.0 functions. They cannot present
process-aware AI help or mutate a v2 workflow they cannot enforce. Mark that path
unavailable; do not downgrade an active problem into an unguarded v1 explanation.
Ordinary course teaching outside the restricted problem retains its original scope.
The server must enforce resource associations on legacy entry points too. A valid
old note edit may proceed only with its original CAS/ink protection and atomic
invalidation of any affected v2 work. If the adapter cannot preserve the linked
invariants, return explicit unsupported/conflict behavior; never use a v1 write to
overwrite or bypass new authority. Existing unassociated v1 resources retain their
behavior. Client UI/version negotiation alone is not the security boundary.

For a note associated with a v2 problem, reject legacy AI-layer writes as
unsupported until a guarded adapter exists. CAS and protection of original ink
alone do not authorize adding a solution. Legacy reads must not return AI layers
whose current disclosure permission cannot be enforced by that client. Reject
the restricted read with an explicit use-v2 reason; provide originals and ink
through a compatible safe read, or the v2 original-only view. Never overwrite or
silently truncate the stored revision to achieve redaction. Keep retained originals
accessible on rollback. Legitimate user edits retain CAS/history and atomically
invalidate linked derivations, previews and confirmations in either commit order.
Check current associations/authority before cached-response or historical-replay
shortcuts as well. Replay preserves the original fact; it neither moves the note
head nor restores an old permission. A late association also invalidates affected
old and new scopes, including an edit committed before the association existed.

Retain original 0.1.0 stored bytes. New tables/indexes and adapters are additive,
owned by Backend. Do not backfill missing operations, consent, display receipts,
import results or mastery from old notes. Old evidence can be referenced with its
actual limits. Feature rollback disables new actions while preserving new originals
and export/read access; no destructive down-migration into lossy v1 text.

## 3. Shared relationships and facts

Every accepted relation must have the same authenticated owner and accessible,
undeleted subjects. Preserve source version, observed time, received time, device,
producer/method and synthetic-versus-real provenance. Optional or missing evidence
is explicit unknown, not a fabricated positive record. Reuse source/artifact storage;
there is no second user or question-content archive.

Producer authority is resolved by authenticated server capabilities, not a
page-provided actor or record kind. Raw capture clients may report their observed
operations; trusted presenters report their own display ranges; the provider adapter
and destination adapter report only their outcomes. Learning appends versioned
assessments with basis/model-or-rule revision, never rewrites raw facts or grants
itself user consent. Explicit user intent/corrections govern their actual scope;
a conflicting account of a captured fact stays a separately attributed statement
and uncertainty until resolved, not silent replacement of bytes. Same-question
relation proposals require evidence and, when necessary, brief user confirmation.

| Proposed family | Minimum relationship and separation |
| --- | --- |
| Problem / Attempt / ProblemRelationRevision | Problem owns pinned question/source versions; attempts and evidenced same-question/retry links refer to it. Separate new question, resumed attempt, same-question retry and unknown identity. URL/title/concept similarity alone is insufficient. Relation corrections are versioned and invalidate affected conclusions. |
| ProcessRecord / StepRevision / Coverage | Reference exact source events, frames, original ink/content artifacts and preceding/branch operations. Represent authorized DOM input, own ink, external pixels and mixed paths separately; user operation, site grading/answers, AI and unknown attribution remain distinct. Before/after may be unknown. No implicit undo/intent label from changed pixels. |
| InkContext / DisplayRevision | Keep immutable editable original ink, source/frame/video-time and original geometry; current content-attached or screen-fixed rendering is a separate relation. Unknown transform or changed question preserves original anchors and marks placement unresolved. A mode switch does not change purpose/destination or rewrite old ink. |
| AssistanceRequest / PolicyRevision | Exact problem/attempt/check target and current requested operation, disclosure bounds and original utterance. Evidence references/necessary premises are distinct from the target the user permits checking. NAV/ASK/WRITE are independent. Unknown/conflicting intent cannot authorize a larger answer. |
| AssistanceContent / AssessmentRevision | Exact candidate bytes/layers/audio ranges, producing request and semantic assessment with basis, uncertainty and supersession. A `hint` enum does not prove content is a hint. Original requests/labels/content remain when an assessment is corrected. |
| Receipt families | AI-input, learner-presentation and destination-import facts bind different producers and exact subjects/versions. A nonempty ID/string/hash alone proves none of them. See section 7. |
| DiagnosisRevision / LearningEvidence | Derived claims cite evidence-set version, source/identity/coverage and semantic assessments. Earliest deviation is earliest evidenced deviation; alternate valid solutions and unknown reasons remain possible. Actual help, possible external exposure, correctness and independent transfer are distinct. |
| LearningPreference | Persistent account preference and version, inherited by session/device/model; explicit question-scoped temporary overrides and expiry. English-first teaching does not rewrite source language, user words or handwriting. |
| Purpose / Completion / OrganizationChoice | Context-based, correctable purpose for portions/revisions; independent known/unknown completion; offered capabilities and actual scoped choice/refusal. Neither layout mode, correctness, quietness nor note type implies completion or destination. |
| OrganizedArtifact / ExportOutcome | Immutable manifest of exact original answer/layout, retained/removed AI layers, preview and confirmed changes; external attempt/result tied to that artifact, destination and authorization. Preparation, sharing, import, reading and submission never share one success flag. |

Use new process-record identity and a persisted capture-stream identity with
per-stream sequence for new envelopes (unique within authenticated owner/device/
stream). This namespace is distinct from the existing owner/device sequence;
starting a new process stream never resets or reuses an old Observation slot.
Reference existing Observation event IDs
and their existing device sequences without renumbering them. Stream sequences
order that stream only; cross-stream/device order needs causal references or stays
unknown. Restart preserves a stream or declares a new one and its gap. Backend
review must confirm uniqueness and replay behavior before schema implementation.

No v2 command authorizes AI to select, fill, change or submit answers on a website.
An observed AI-attributed website action is retained with its actual provenance
and flagged as an unauthorized action, not normalized into a learner operation or
treated as permission to repeat it. Unknown attribution stays unknown.

## 4. Ingestion, originals and stopping

The batch is durably accepted atomically or rejected; partial uncommitted ACKs are
forbidden. Exact same record/sequence replay deduplicates, changed payload reuse
conflicts. A durable ACK means storage commit, never model input, teaching success,
actual presentation or import. Server supplies received time and authenticated producer.
Permission/subject/shape validation precedes classification and derivation.

Capture locally first, including before/after obtainable evidence and gap markers.
Reference-only pending artifacts cannot be acknowledged as fully preserved content;
report what is local, uploaded and committed separately. Offline resend uses exact
unacknowledged identities, not a highest-sequence guess. Historical replay does not
activate capture, re-present help, restore withdrawn permission or become a live frame.

Stopping a particular share ends new capture and live transmission on that path.
Already authorized pre-stop original ink, attempts, source text, key frames and
time relations remain; explicit deletion is separate. Preserve the final pre-stop
queue boundary locally and distinguish saved history from what is allowed to sync
after a scoped stop/revocation. A broader withdrawal may prohibit transmission while
local history remains. Never send old data as newly live. Temporary AV buffers can
expire under a declared engineering policy only without silently discarding required
source evidence. Continuous AV replay is not a new requirement.

## 5. Evidence invalidation and deletion

Start with a conservative server-owned monotonic **problem evidence revision**,
rather than checking only the IDs a job happened to read. Adding a previously
absent receipt, coverage change, source association, same-question relation,
assessment correction or deletion advances affected evidence revisions. Actual
permission and preference revisions are separate dependencies. Scope revision
changes and invalidation of current projections commit in the same transaction.

A derived job pins relevant revisions, source/note versions and deletion/authority
fences. It commits only while all still match. If the job wins first, the later
fact invalidates its result; if the fact wins first, reject the stale job write.
Recomputation pending means old claims are historical/stale, not current. Identical
receipt replay does not repeatedly advance revisions or duplicate side effects.

Relation discovery/correction must fence all affected old/new problem scopes in
one consistent transaction. Unassigned evidence has an explicit provisional scope;
resolving it cannot miss consumers that previously saw an empty evidence set.
Use a conservative relevant session scope until the problem relation is resolved,
without asserting that every same-concept question was exposed. Exact index/locking
strategy is Backend-owned, with both commit orders tested on independent connections.

Explicit deletion removes scoped original and derived content, including dependent
cross-attempt judgments, caches and replay bodies, and fences old jobs/rebuilds.
Keep unrelated original work. Existing authorized deletion semantics permit only
the minimum opaque identity/generation tombstone needed to reject stale resurrection;
do not retain deleted text, answer hashes, embeddings or revealing assessment reasons.
Keep metadata only while required for stale references/cleanup, and remove it when
that need ends under the storage lifecycle. If retained facts cannot support a new
judgment, use unknown, never infer no help or reconstruct deleted content. Remote
or backup cleanup stays pending until its actual result is known.
Marker reclamation requires evidence that all accepted old replay/restore paths
are fenced; elapsed TTL alone is insufficient. Compute shared-artifact and
cross-source dependencies before removing references. Inseparable legacy mixed
originals retain explicit `409 mixed_source_note_conflict` with no partial mutation
rather than broadening deletion or falsely reporting success.

## 6. Requests, caches and final presentation

Exploration is quiet within the current problem. A pause, erase, wrong step or
continued writing changes neither permission nor teaching mode. Explicit check,
hint, solution or review requests have bounded targets; a request to check one
step may cite necessary premises but cannot answer an unattempted remainder.
Ambiguous user words versus UI labels remain a conflict needing minimum clarification
or a narrower result, not synthetic permission or model-vote resolution.

Preparation may happen before a user click under R12/R33, with source/personal-state
and generation-before-selection evidence. It grants no display permission. Cache
lookup matches source/problem/attempt/content/assessment, personal understanding,
policy and preference context. A hit remains subject to current checks; semantic
reclassification removes unsafe hint eligibility without rewriting what was shown.

Before showing a card, title, notification, diagram, organized preview or queued
audio segment, or dispatching AI content through export/share, the final boundary
checks the current context and content-specific permission for every included
layer or segment. Server completion is insufficient. Stop obsolete speech/queues and
record any range already presented. Client disconnection or uncertain authority
cannot permit higher disclosure from a stale cache. No fallback into the v1 path.

Proposed first implementation uses one active presenter per problem and current
server-authorized presentation claims bound to the exact content/segment and policy
revision. This uniqueness applies to same-problem AI help presentation only; it
limits neither simultaneous device capture, combined multi-screen understanding,
nor separate share start/stop. Transferring the presenter changes no capture grant. Clients keep consumed claims and cancel on new local/remote intent. This
does not assert an atomic transaction across a database and physical pixels: a
revocation can race with an already-started display. Record actual/partial/unknown
outcomes and measure cancellation; never claim that revocation erased prior exposure
or that missing ACK proves nothing played. Presentation fencing, restart and offline
behavior require independent client tests before any cross-device safety claim.

Claims and actual presentation facts also retain the server-known intent revision
and synchronization knowledge for same-problem devices able to accept user intent.
Unknown connectivity/order is not proof all intents are synchronized. If a later
arriving retraction has no causal order relative to a prior presentation, record
that relation as unknown, apply it to remaining output and invalidate affected
judgments; never retroactively mark the output compliant. QA reports these races
separately and does not hide them in a zero-disclosure success count. Proposed
initial policy: no proactive disclosure escalation while such a device is known
unsynced. A fresh explicit request on the presenter may be evaluated within current
known restrictive intent and its bounded target; it is not proof of global order
and cannot override an unordered conflicting refusal. This is a measured engineering
policy, not a guarantee of instant knowledge of every offline action.

Learning assesses content/extent; clients attest their actual display/playback;
Backend validates producer/subject/lifecycle and maintains facts. No client self-label,
schema enum or storage ACK alone establishes semantic safety or independent mastery.

## 7. Original-screen composition and three receipt families

AI-input evidence pins original source/frame/ink versions, geometry, freshness,
presentation kind and the exact post-transform image/layers in a real provider
request. Client upload, backend receipt, outgoing payload verification and provider
outcome are separate. Rejection, missing/wrong image, ambiguous transport and timeout
must not pass. Preserve any actual provider request identifier and limits; do not
invent a per-image receipt where the provider offers none. Input availability is
not evidence of correct model interpretation or learner exposure.

A44 eligibility is behavior-based: user remains on the live, visible and operable
original learning surface, uses this product's pen with normal navigation intact,
and the same source/time/geometry's ink reaches the evidenced model input. A DOM,
system capture or faithful app compositor is only a candidate method. Separate
pixels without this pen, stale reconstruction, frozen capture, owned canvas and
side-by-side fallbacks do not pass. Migrating Safari/Canvas/Notability into a new
in-app browser cannot close the original-app path. Each platform/page and both ink
display modes need their own actual results; Windows remains P3.

Proposed display behavior keeps the two confirmed modes usable during ordinary
video playback. Screen-fixed ink may remain at its screen position while the same
known problem/source continues, visibly retaining its written-at video/frame
context; normal clock progress alone must not make every stroke disappear. It does
not become ink on each later frame: AI composite evidence carries that original
context separately from the current view. Content-attached placement needs a valid
content transform, not implied video-object tracking. A different problem/material
version or unresolved placement preserves old originals/anchors and hides or marks
unresolved placement with a notice; never silently rebind to a new question. Test
both modes, continuous playback and an actual question change separately.

Learner-presentation evidence pins content revision, rendered channel/layers or
played range, authenticated reporting device and certainty. Generation/preparation,
AI-input or external import cannot fabricate that receipt. Correct a false or
partial report with a superseding fact and invalidate judgments, retaining history.
An unauthorized presentation is still an exposure fact, never erased to hide a violation.

Destination evidence pins exported manifest and exact target outcome/method.
User-reported import can be stored and shown as such; it is not machine verification
or A46 acceptance. Share-sheet completion is only sharing. Observe the actual target
for A46. Exporting X5 without L2 cannot prove L2 arrived; importing an artifact does
not prove the learner read it. PDF/PNG never replaces editable app originals or
claims native Notability strokes. A46 also requires the earlier A44/original/source/
independent-AI-layer steps, not merely successful final export.

If help-bearing content was shared/imported, or external dispatch may have taken
effect with an unknown outcome, record possible external exposure for the exact
problem/content/manifest. Actual learner reading remains unknown unless separately
observed. This evidence invalidates claims that assume no help merely because
in-app presentation receipts are empty, including a later same-question attempt.
Preparation alone or confirmed cancellation before any external effect does not
create external exposure. Do not equate possible exposure with proven reading or
mastery; a later resolved outcome supersedes uncertainty without rewriting history.

## 8. Completion, refusal and faithful organization

Persist the three independent display/purpose/destination dimensions and separate
completion evidence. Context-based classification may be mixed or uncertain and
is correctable; no mandatory per-stroke labeling. Save scratch even when not sent.
Learning notes follow the supported Notability workflow; automatic AI notes may
remain local. Do not silently substitute another destination.

Prompt promptly on actual completed screen answers, including wrong answers;
pause/correctness/leaving alone is insufficient. Unknown completion permits one
combined brief question. Claim one logical prompt and record actual display, not
just scheduling. Missing display ACK does not authorize repeated device prompts.
Offline clients suppress uncertain proactive prompts; this must be measured.

Question-scoped refusal survives edits, retry, restart and device changes. An old
positive click cannot approve a new answer/preview/version. A delayed explicit
refusal to an actually displayed Q1 prompt remains Q1 evidence even after an edit.
Only a causally later explicit reopening supersedes it; arrival/wall-clock order
cannot. Q2 and ordinary classroom teaching/reminders/preparation stay separate.
When refusal and reopening have unknown causal order, retain the refusal; newest
arrival time is not permission to reopen.

Runtime choices use real available paths, authorization and pinned course/assignment/
question versions. Reuse saved bCourses source; do not authorize submission. Preview,
defer, preparation, share and import remain separate actions. Bind confirmation to
the exact original and preview manifest; changes require rechecking, not silent
approval of regenerated content. Layout-only consent does not authorize displaying
AI corrections before asking for confirmation. Retain the learner's actual derivation,
errors and layout, separate necessary AI additions, and editable originals.

Before external dispatch, recheck current choice/source/version/purpose and target
permission, plus the current disclosure assessment and permission for each included
AI layer. For answer organization, the exact exported AI layers must be represented
in the permitted preview and scoped confirmation; a hidden or removed preview layer cannot silently remain
in the exported manifest. Layout-only consent never grants corrected-answer exposure.
If revalidation changes any content, create a new manifest and obtain its applicable
confirmation rather than reusing an old approval. Existing classroom-note archival
permission retains its own scope without mandatory per-stroke confirmation; it
cannot override a restricted problem's disclosure policy. If cancellation wins first, block the effect. If the effect wins first,
retain its actual or unknown historical outcome; do not pretend remote rollback.
Reconcile unknown outcomes before duplicate-risk retry. No export/import or purpose
change upgrades helped work into independent mastery.

## 9. Worked acceptance traces and original-goal coverage

These are test plans, **all unexecuted**. Reuse pinned owner vectors and case packets;
do not relabel old source cases or create duplicate corpora. L/B/J IDs belong to
their cited documents, not shared protocol identifiers.

| Applicable acceptance | Required execution after contract implementation |
| --- | --- |
| A30/A31/A42/A43 | Mixed DOM choice/input, real ink and observed pixels → known revisions/gaps → offline replay → retry/new-question link correction. Test rapid before/after loss, attribution and both evidence/job commit orders. Unknown reasons and site feedback do not become user reasoning. |
| A32/A33/A34 | Own exploration silence → scoped check/hint → exact permitted output; request changes after generation/cache hit and before every channel. Necessary-premise references do not extend the check target. Preserve p06/p29/p37 original disagreements and negative cases. |
| A34/A37, QA T1–T3 | Export cannot carry a hidden solution layer; actual/unknown external exposure affects same-question retry. Linked legacy AI writes/reads cannot bypass v2 guards. Offline intent versus connected presentation keeps unknown causal order and a separate race denominator; current explicit permission remains a positive control. |
| A35/A36/A38 | Alternate valid method, blurred premise, earliest evidenced deviation and corrected explanation; retain unknown motive. New evidence/assessment invalidates existing and in-flight claims; deleted evidence cannot be reconstructed. |
| A37 | Q1/A1 actual partial/full help → Q1/A2 retry with empty local receipts → cross-attempt evidence; separately unseen Q2 with actual reasoning. Use Learning J1/J4 and Backend C1–C4. Exported/correct output never implies unaided mastery. |
| A39/A40 | Requested, skippable relevant practice/demonstration with actual variable/figure behavior; persistent English-first across restart/device/model plus scoped Chinese override. Never rewrite source language or turn a skipped exercise into failure. |
| A41 | Real device fast edits, missing intervals, clock uncertainty, restart and share stop; report retention/freshness/latency/resources by path. Documents, hashes and zero reported gaps are not device evidence. Keep original specification thresholds, measure new defaults. |
| A44/A45 | Same live original source with both ink display modes, touch/scroll/zoom/problem changes, actual composed model input and stop. Frozen/side-by-side return paths are tested separately, with frozen/source-change notices, not counted as original-screen success. |
| A46/A26–A28 | Original lecture ink/context → editable reopen → separate removable AI → source recovery → prepared/shared → observed Notability import, with each step independently evidenced. Missing earlier step remains missing after import. |
| INTENT-ANSWER-PROMPT / HOMEWORK-CHOICE | B:I03/J2 delayed refusal and newer causal reopen; concurrent device prompt, lost ACK and stale menu; known completed answer versus pause; actual available destination and not-now. No repeated question or implicit submission. |
| INTENT-NOTE-CLASSIFICATION / FAITHFUL-EXPORT | B:I02/I05/J3: mixed purpose and correction race export; AI answer in layout-only preview blocked before presentation; old confirmation cannot authorize changed bytes. Record both external-action winners and real partial exposure. |
| INTENT-INK-MODES | Exercise content-attached and screen-fixed modes separately during scroll/zoom/video/page changes and save/reopen, with original sources, normal touch and actual AI composite evidence. Unknown placement is reported; neither mode implies purpose or destination. |

R12 also uses V-CacheProvenanceLatency's actual proactive candidate generation;
R20/R22 use V-ExitReminderTimer's real duration/context/urgency/importance evidence.
Those later stage implementations are not newly dispatched here. Preserve all
19 original V cases, five INTENT cases and 23 P1–P4 backlog items. P0-07's narrow
probe cannot close full P1 course/Calendar/Canvas/voice or real single-problem goals.

## 10. Review, migration and implementation sequence

1. Existing Backend and Learning owners review this proposed ADR against their
   actual consumer designs; QA checks trace coverage and adversarial boundaries.
   Only concrete conflicts need correction. No additional product interview or
   perpetual review loop is required to choose ordinary representation details.
2. Lead commits a reviewed schema/HTTP/bridge capability baseline with positive
   and negative contract fixtures, generator/version selection and old-artifact
   compatibility checks. This separate commit, not this prose, enables implementation.
3. Backend owns additive migrations, authenticated append/read, durable ACK and
   revision/invalidation/deletion transactions. Exercise both serial winners on
   two real PostgreSQL connections; local doubles are separately reported. Learning
   consumes pinned evidence and policies with semantic tests. No new archive.
4. Web/iOS consume the exact contract and implement their actual final-presentation,
   input/ink and result evidence paths. Existing capability investigations continue;
   do not wait for every native app to support overlays. Existing third-party
   permissions, deployment/purchases and real-device inputs remain separately gated.
5. QA reproduces an exact integrated candidate, distinguishes schema/semantic/client/
   provider/device results and retains known failures. Enable a bounded supported
   problem path only after its required checks; report unsupported paths explicitly.

Migration must preserve original bytes and actor ownership; unknown legacy process
facts stay unknown. Test old API and bridge payloads on the upgraded server, unknown
v2 messages on old entry points, mixed client capability, rollback with new stored
evidence, replay/duplicate conflict and deletion cleanup. Do not make product calls
until provider authorization and actual budget reservation controls are verified.
Include linked-note legacy AI writes and reads, a user edit racing a confirmed
export, unchanged originals/ink across both revisions, and no-change controls on
unassociated v1 resources. Merely validating the old payload is insufficient.

Outstanding engineering review items: stream/identity uniqueness versus legacy
events; coarse evidence-revision write contention; final-presenter claim fencing;
minimal deletion metadata lifecycle; versioned ink serialization/geometry and exact
provider outcome evidence. They are bounded owner review topics, not unresolved
user intent or permission to change models, dependencies, billing or accounts.

<a id="audio-screen-increment"></a>

## 11. R60 audio/screen increment: architecture review and follow-through

Read the complete original English [addendum](../requirements/audio-screen-interpretation.md),
AUDIO-01–15 / AVTEST-01–12, and D-AUDIO-SCREEN in the decision record.
This is an additive design constraint, not an implemented protocol or provider
selection. Live classroom microphone listening and actual iPad playback audio,
including headphones and the enabled learner microphone, are required experiences;
recording/upload and full-session replay are not prerequisites. Shared screen
pixels may contain a camera view but grant no original-camera-stream/audio access.

Code inspected at `c14b35d147b7d68b2c7f45f418765bcd7a679765`:

| Current boundary | Required future extension, preserving existing 0.1.0 behavior |
| --- | --- |
| Observation has text, one actor, confidence, frame/media references and correction_of; closed schema lacks audio spans/tracks/overlap and candidate/confirmation state | Separate original captured spans and capture-source identity from uncertain speaker/addressee assessments, transcript candidates, contextual repair and confirmed/rejected correction revisions |
| API and learning fixture archive reject actor-changing corrections; fixture archive also requires a later capture time, and retrieval treats any correction as superseding | A later speaker-role or interpretation assessment must not rewrite the utterance's actor/time/original text; proposed, rejected and confirmed corrections need distinct current-view rules |
| API observation/frame relation requires matching source/version/device/session/media position | Use a separately evidenced audio-to-screen alignment relation across sources, with clock domain, uncertainty, span intervals, playback speed/seek and historical backfill; do not weaken the existing same-source validation |
| Learning retrieval indexes text; Web reads video position and subtitle textTracks; iOS has no Swift capture implementation | None proves actual sound, acoustic cues, diarization, professor retention, quiet live listening or provider understanding; current fixtures cannot pass A47–49 |

Candidate processing design: preserve actually obtained audio and raw/processed
correspondence during the authorized window; evaluate native-audio interpretation
alongside faithful ASR with source/speaker evidence and synchronized screens.
Keep original-language hypotheses, oral alternatives/negations/self-corrections,
context-assisted proposals and user-confirmed corrections separately. Do not
flatten this into a cleaned transcript before assessing the native-audio path.
If audio is unavailable, report lost acoustic cues and unknown spans. Loudness or
tone is not certain emotion, intent, identity, mastery or help permission.

Capture/preservation, understanding and permission to answer are separate state
decisions. Quiet lectures still retain authorized professor content; do not infer
that silence proves capture failed or an input meter proves content was retained.
Keep system/playback audio, microphones, camera audio and echo distinct where
obtainable; a mixed classroom track requires uncertain/correctable attribution,
not an invented clean separation. Preserve genuine user interruptions while
deduplicating lecture/assistant echo. Late transcripts remain historical evidence,
never a new live request or a way to restore revoked assistance.

P0-08 owns the additive contract/compatibility design; Backend P0-09 owns archive,
revision, stop/deletion and bounded-buffer lifecycle; Learning P0-10 owns semantic
cases and interpretation; iOS P0-03/11 owns actual input-path evidence; Web P0-12
owns visible screen/media anchors and disclosure-safe presentation; QA P0-13 owns
independent acceptance planning. Do not repeat their completed reviews or add fields
to 0.1.0. P1-03/04 implement the live experience/source recovery, P3-01 extends
cross-device behavior. Existing DT-G3-05/11 are unexecuted capability prerequisites,
not comprehension tests. Runtime consumers await an exact formal contract.

The [current decision entry](../requirements/intent-and-decisions.md#current-decisions) governs audio behavior; exact conversation belongs to source history.
Temporary capture/streaming/authorized verification buffers are distinct from
permanent recordings; buffer limits are measurable engineering defaults, not a
pending choice about whether to listen live. Preserve required text/key images/
process/corrections under R29/R30 and scoped deletion. No perpetual raw archive,
provider activation, paid comparison, model switch or budget change follows.
All A47–49 and AVTEST cases remain not_run; G3/G4 and other gates are not passed.

Current source-role refinement: one designated learner interaction input and one
AI playback endpoint do not exclude extra authorized classroom/playback capture
sources. Keep quiet near-mouth learner speech and professor/additional speakers
observable together; role attribution is correctable and never limited to two by
the schema. The logical primary-input role differs from an API hardware primary
route. The reported target is M5 iPadOS 26.5; the [dualRoute and alternative plan](../requirements/audio-screen-interpretation.md#microphone-routing-candidates)
contains conditional engineering routes, not a device pass or a new protocol.
Core P1-03 remains; optional two-device capture stays P3-01. AVTEST-09 needs both
useful acoustic-understanding comparisons and non-fabrication negatives, with
human-reviewed paired meanings and no predetermined winner.
