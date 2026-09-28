# P0-09 process persistence proposal

Status: **design and synthetic test vectors only**. No new runtime entity, endpoint,
wire field, migration or device capability is implemented by this document.
Specification read at `57aee9cfc86dfa0dcde674d118034063163ddb13` (requirements v1.1).
Task-card coverage correction read at `e8b02c5be9c343c35698dc7d67bb58cfbb5cb3e6`.
Implementation branch remains based on backend delivery `803916f`, contract 0.1.0;
the specification was read using `git show`, without merging or resetting work.
Targets: R51/R52/R53/R54/R55/R57/R58; A30/A31/A34/A37/A38/A40, supporting G7.

P0-04 was delivered with 195 local tests; integration review and real PostgreSQL
verification remain pending. Its existing user-scoped transactions, immutable
records, revision checks and deletion fences are reusable mechanisms, **not** proof
that the new process, preference or disclosure policy is implemented. A P0-04
review correction takes priority over this proposal. P0-08 supplies the future
shared version and implementation assignment. Names below are design vocabulary.

## One archive, linked evidence and independent projections

Reuse the existing authenticated user, session, source snapshot, observation,
frame, original artifact and note revision. Do not create a separate identity or
problem-history store. Original records retain their language and bytes. Immutable
means updates create another version; explicit privacy deletion is still allowed.

| Proposed record | Relationships and immutable evidence | Mutable selection / constraints |
| --- | --- | --- |
| Attempt | Exact question source/version, user, session, previous attempt if explicitly identified, problem identity evidence | Attempt status and selected branch use CAS. Ambiguous new-question versus retry stays unconfirmed; do not merge by title/text similarity. |
| Observed operation | Stable operation/event ID, originating device stream incarnation and sequence, explicit causal parents, branch, before/after ink revisions, raw event/frame references, observation class | No overwrite; write/erase/undo/redo/supersede are new operations. Undo points to what it undoes. An erase is not privacy deletion. |
| Ink revision | Original opaque bytes, hash, before revision, producing operation, source/frame context | Immutable artifact plus current-head reference; preserve layout and raw pen data. No claim that external-app pixels supply editable strokes. |
| Coverage interval | Device/stream, structured or visual path, observed interval, sequence gaps, missing/stale/blurred interval, clock alignment uncertainty, evidence references | Revised assessment appends a version; absent gap reports do not establish complete capture. Unknown motives remain null/unknown with provenance. |
| Help policy revision | Scope, explicit user request, teaching state, selected step/attempt revision, permitted assistance, revocation generation | CAS head; unrelated to NAV/ASK/WRITE. More permissive changes require a current explicit request. Restriction never silently loses to a stale offline expansion. |
| Assistance evidence | User request scope, permitted disclosure, actual content/version/hash and assistance extent, attempt/step versions, all channel parts, policy/preference binding, delivery attempt and receipt evidence | Generated, committed, queued, dispatched, client-reported displayed/played, partial, denied and unknown are distinct observations. No generated=seen shortcut. |
| Diagnosis revision | Attempt/branch and evidence revision set, candidate earliest evidenced deviation or interval, observation/user statement/inference labels, uncertain reason, supersedes link | CAS diagnosis head; user correction appends evidence and invalidates old derived labels. Old process remains intact. No diagnosis becomes a permanent ability label. |
| Preference revision | User default language/terms/Chinese-hint policy; explicit bounded override with scope and parent default revision | CAS defaults and overrides separately; effective-version tuple recorded on outputs. Original-language text is never rewritten. |

```mermaid
flowchart LR
    S[Exact source snapshot] --> A[Attempt]
    A --> B[Branches and selected head]
    B --> O[Observed operations and causal parents]
    O --> I[Original ink and frames]
    C[Coverage and unknown intervals] --> O
    O --> D[Versioned diagnosis]
    P[Help policy and preference revisions] --> H[Generated assistance]
    H --> F[Final presentation check]
    F --> R[Per-channel receipt or unknown]
    R --> D
```

## Ordering, branches and offline replay

Each originating stream needs a durable incarnation identifier if sequence numbers
can restart after reinstall/reset. Proposed uniqueness combines user, stream
incarnation and device sequence, in addition to stable event ID. P0-08 must decide how this evolves
the current device-sequence contract; backend will not silently reinterpret 0.1.0.

Use explicit causal-parent links and in-stream order. Preserve capture time, server
receive time, source clock/timezone and any measured uncertainty separately. Server
commit order is useful for synchronization cursors but is not a claim of causal or
real-world chronological order. Concurrent branches remain incomparable until an
explicit merge/selection event; UI tie-breaking must not fabricate causality.

Within a branch, a head-changing operation compares its recorded base revision.
Two valid children of one parent can be distinct explicit branches. Two writers
changing one selected head cannot both win the same CAS. A conflict preserves the
already archived original observation; it does not silently choose a winner by
timestamp or invent a branch. Selecting/reconciling branches is another revision.
Cycles, cross-user/attempt parents and changed-content ID reuse must be rejected.

Missing causal parents differ from invalid parents. Proposed ingestion may durably
archive a valid owned envelope while marking its projection unresolved, preserving
the original evidence without manufacturing a predecessor. It must not label the
operation applied or the interval complete. P0-08 must explicitly distinguish
durable-envelope ACK from applied-process ACK before enabling this behavior.
Parent arrival resolves links in a new transaction; malformed/conflicting members
roll back their atomic batch. Retried valid envelopes deduplicate by stable ID and
client-content fingerprint, excluding server receive time; exact ACK sets remain
independent of any largest sequence observed.

Restart rebuilds branch/diagnosis indexes only from retained original events and
explicit corrections, after loading current tombstones and policy generations.
Historical uploads never activate capture or set a newer help permission. A newly
discovered capture gap remains a gap even when the final answer is known.

## Transaction and presentation boundaries

Reuse the P0 user transaction lock initially. Transactions must not wait for model
or network calls. Finer-grained locks need a reviewed ordering and real race tests.

| Transaction | Checks under the same lock as writes | Commit / response meaning |
| --- | --- | --- |
| Archive observed batch | Identity/scope/generation, ownership, IDs/sequences, bytes/hash, deletion, valid relation domain | Original envelopes + exact receipts atomically stored; unresolved relations explicitly separate from applied state. |
| Select branch / correct diagnosis / change preference | Expected head, referenced owned immutable evidence, current lifecycle, user request provenance | Append revision + update one head + increment affected generation + invalidate dependent work atomically. |
| Tighten help / cancel / switch question | Current scope and generation; explicit intent, not pause/erasure inference | Append policy and cancel/invalidate matching jobs/outbox entries atomically. Historical help is retained. |
| Commit derived result | Source/attempt/branch revisions, auth/cancel/deletion generations, effective preference tuple, help policy and request scope | Persist derived result and eligibility metadata; never claim visible or audible. A mismatched fence cannot publish. |
| Authorize outbound channel | Recheck the same binding and current connected target; reject old higher-disclosure cache | Create short-lived, single-use delivery authorization/outbox record; dispatch is separate and is not a receipt. |
| Record presentation receipt | Exact delivery ID/content/channel and authenticated device, duplicate/partial ranges, deletion restrictions | Append reported exposure. A late receipt can describe past exposure without granting current display or replay permission. |

The binding includes user/session, source/version, attempt/revision/branch,
policy revision + explicit request, authorization/deletion/cancel generations,
default preference revision + override revision, content/channel manifest and
target-device state. The lead owns its final representation. Cache keys alone are
not authorization; a cached full solution cannot satisfy a local-step hint request.
Titles, diagrams, notes, notification previews, review snippets and queued audio
use the same check as body text. Learning/QA must assess actual semantic disclosure;
an enum or content hash cannot certify that a hint does not reveal the answer.

The database cannot atomically commit pixels or audio on another device. A server
authorization may race with a later revocation before actual rendering. Client
owners must recheck local intent/versions immediately before every render/play
segment, remove stale visible content where possible, purge queued output on a
newer generation, and suppress answer-bearing output when disconnected or freshness
is uncertain. An unexpired offline token does not prove current permission.
Short leases and online handshakes limit a race window; they do not prove globally
instant revocation. P0-08/P0-11/P0-12 must define and measure that window and the
revocation receipt semantics. Until then, A34/G7 remain unverified. A response
already seen cannot be retracted, and unknown delivery must not be called unseen.

Interrupted audio records the client-reported played prefix/ranges and unconfirmed
remainder. Receipt loss means unknown exposure, so later mastery projections must
not assume unaided work. Delayed exact receipts update history, never re-enqueue
presentation. Manual historical retrieval still passes the current disclosure
policy; a saved full-solution note must not appear automatically during exploration.

For R54/R55/A37, persist the difference between allowed assistance and what content
was actually reported displayed/played. A full-solution permission with only one
hint rendered is not evidence that the full solution was received. Record exact
content segments, their declared/reviewed help extent and classification uncertainty,
the request scope, and linked attempt/step revisions. Cancellation is not proof
that nothing had already appeared. Text visible in a notification or diagram counts
as a channel too, even if its main card was never opened.

Learning receives these facts and provenance: a self-correction observed before any
confirmed help within a known observation window; a correction after a specific
hint; or completion after reported solution exposure. These are evidence patterns,
not automatic causal explanations or independent-mastery labels. Missing receipts
or channels make assistance extent unknown, not zero. User statements about help
are separate from device-reported presentation. Novel-problem independent-transfer
evidence remains separate from helped completion of the same problem. Generated,
cached or queued content without presentation proof is not counted as confirmed
help, but any uncertain dispatch remains an uncertainty for later evaluation.

## Preferences, cancellation and deletion

Default product preference is simple English, original technical terms and brief
Chinese hints where helpful. A Chinese user utterance or Chinese engineering status
does not change it. Proposed precedence is explicit current-question override over
persistent user default, with effective versions saved on each result. An override
ends with its explicit scope, survives a restart only within that scope, and cannot
leak to another attempt or become a global preference by last-write-wins. Explicit
global changes use their own CAS. Stale offline preference changes conflict or
remain unapplied evidence; old clients cannot silently restore a retired override.
The lead must settle whether a repeated attempt belongs to the same override scope.

Withdrawing help is distinct from disabling capture, revoking a source, ending an
attempt and deleting history. Tightening help preserves original observations and
truthful assistance receipts, while fencing future presentation. Ordinary undo
preserves before/after originals. Privacy deletion traverses attempt operations,
ink/frame references, derived diagnosis/mastery links, generated help, replay caches
and outgoing queues; shared original sources survive unless separately deleted.
Delete a shared blob only when no retained original record references it. Ambiguous
ownership/reference sets block deletion completion rather than silently discard
unrelated course records.

The deletion transaction writes minimal ID/generation tombstones first and removes
accessible content/projections and pending delivery payloads atomically. Follow-up
object-store/index/client cleanup must be tracked, with late uploads, receipts,
rebuilds and old backups fenced; no claim of cross-device erasure before receipts.
Tombstones contain no original text/ink or unnecessary content fingerprints. A late
receipt for erased content may retain only an allowed non-content status and must
not restore the content. Storage-retention/backup-erasure policy remains a lead
decision before production; a database rollback must never revive erased records.

## Deterministic vectors and future verification

[p0-09-transaction-vectors.json](p0-09-transaction-vectors.json) contains synthetic
declarative schedules and expected outcomes. The numbered schedule is an injected
test interleaving, **not** timestamp-derived process order. They are neither wire
messages nor executable protocol tests. Static consistency checks are recorded in
[p0-09-evidence.md](p0-09-evidence.md); no runtime policy PASS is inferred.

After P0-08, implement deterministic domain checks using these schedules, then
run independent PostgreSQL connections with barriers before the decisive locked
read and commit. Verify both possible serial winners for concurrent operations:
event/receipt dedupe, head CAS, help-withdrawal versus outbox commit, deletion versus
rebuild/late upload, and preference override versus queued result. Kill/restart only
an expendable test worker between commit and ACK to test durable replay. Migration
apply/reapply/rollback compatibility belongs in a dedicated disposable database;
backup restore/erasure requires a separate controlled test. None has run here.

For G7 use human-reference traces on both external-visual and owned-canvas paths;
record retained/lost steps, branch accuracy, unknown intervals, latency segments and
actual shown/played content. No Notability undo-stack or Pencil history capability
is assumed from screen sharing. Synthetic rules do not establish mathematical
correctness, semantic restraint, device behavior or learning efficacy.

## Concrete dependencies for the lead

1. P0-08 versioned entity/link and transport definitions, including stream
   incarnation, unresolved-parent ACK semantics, exact batch/CAS receipts, legacy
   0.1.0 compatibility and unsupported-capability responses. Preserve old notes and
   original artifact identities; do not treat missing new fields as permission.
2. Help-policy scope/revision rules, concurrent restrictive versus expansive intent,
   multi-channel eligibility, outbox/presentation receipt vocabulary, disconnected
   behavior and revocation effectiveness bounds agreed with web/iOS. Bind explicit
   actions to authenticated intent; archive bytes are not presentation authority.
3. Preference scope identity, inheritance/expiry and whether an override follows a
   repeated attempt; diagnosis correction and assistance-aware evidence contracts
   agreed with learning. Ambiguity is not an excuse to modify persistent defaults.
4. Deletion graph ownership, shared-source/blob rules, retention and sync tombstone
   horizon, late-receipt policy and backup restoration fences; backend authors the
   reviewed migration only after the compatible shared contract is committed.
5. P0-10 labeled cases and P0-11/P0-12 measured coverage/presentation constraints.
   At the inspected specification commit these deliveries are not present in the
   platform/learning/web verification trees; do not invent their conclusions.
6. Dedicated PostgreSQL test DSN plus runnable/device conditions. P0-04's missing
   DSN remains unchanged. No new account, paid executor or deployment is requested
   or enabled by this design.
