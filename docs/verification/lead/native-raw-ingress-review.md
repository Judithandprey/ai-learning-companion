# Native raw-ingress delivery review

Delivery `e52de7601bf09d7450ca818fe55753d5022b82b2` arrived in
`handoff_26df292974721646503721ce4d0814ef` at 2026-09-30 05:31:05 UTC.
Its parent `77a33bb` preserves the assigned `2a5e6bc` baseline. The owner also
reports reading the actual Backend notice and exact `8e4f52d` counterpart.
Review baseline is `1e0713a0baf71fc83c26c059bc1e75edec8828f5`.

**Source review APPROVED through `c874f98`; all recorded HOLD findings are closed
at source level. Integrated native compilation/runtime and fixture composition
are the next checks, not yet passed at this checkpoint.**
This continues the existing P0-03/11 request/retry/ACK task. No new producer,
credentials, default route or device/provider activation is assigned.

## Findings returned to the same owner

1. **Lost initialized raw history.** `frameBatches` is optional and the existing
   lock-file witness only proves the overall upload state once existed. Removing
   or nulling this member after a pending or committed batch is accepted as an old
   originals-only state. Sending then finishes without a POST, and the retained
   PNG can acquire a new process identity/key. An unknown item state is silently
   skipped too. Distinguish genuinely old state from lost initialized raw history
   using the existing witness/locked admission; reject malformed state without
   rewriting evidence. Preserve Stop and old-state compatibility. This is a
   component-loss recovery boundary, not a demonstrated race in supported writers
   or a request for arbitrary filesystem rollback detection.
2. **Malformed errors can become terminal.** The reused error parser checks that
   `retryable` is Boolean but ignores its value. Raw conflict/size errors with
   `retryable:true` fail the released validator yet enter permanent `refused`
   branches; malformed `capture_stopped` can install Stop. Validate the released
   status/code/retryable relation before those decisions. Invalid responses keep
   the same pending request/key with unknown outcome. Also align ACK timestamps
   with the released format: lowercase `t` and more than nine fractional digits
   are valid but currently rejected. Normal Backend timestamps are unaffected;
   this latter issue is compatibility, not a reproduced current-server failure.
3. **Exact original fixture is missing.** Both live and historical exports keep
   request/binding metadata but delete the matching PNG during session cleanup.
   Retain each actual recorded original PUT body, without headers or credentials,
   and validate decoded PNG bytes, length, digest and full binding correspondence.
   A substituted image or another suite's PNG cannot establish this request's
   provenance. The historical envelope is built/enqueued, not yet actually POSTed.

One consolidated correction was accepted through the existing iOS reply route as
`handoff_166f77dce70978b27324b5f47dd48785`, replying to the delivery above.
The receipt says unread and `execution_started:false`; it establishes delivery,
not adoption or a fix. A later read-only worktree inspection observes uncommitted
changes to `OriginalUpload.swift`, `RawFrameIngress.swift` and the native check
after the delivered commit; this is source activity, not a correction delivery
or test result. Scope stays `apps/ios/**` and platform evidence. Lead owns
the prepared workflow extension and final integration.

## Actual review evidence

Three bounded independent reviews inspected exact archived source. Local reports:
`/tmp/native-raw-ingress-state-review.md`,
`/tmp/native-raw-ingress-wire-review.md`, and
`/tmp/native-raw-ingress-harness-review.md`. Lead checked the affected source and
released validators before sending the correction.

Seven source-model state controls/reproductions and 20 portable source-template /
actual-contract checks executed. **These are Python evidence, not Swift, Codable,
actor/lock or device execution.** The owner's anticipated 27 native / 41 fixture
assertions remain unexecuted predictions. No request-shape, canonical-byte or
unknown-clock coercion defect was demonstrated in this review.

The workflow proposal at `/tmp/native-raw-ingress-workflow.patch` adds the new
native check, actual output validator and fixture/source archive to the existing
workflow while retaining old checks/builds and pinned dependencies. YAML, 12 shell
blocks, embedded Python ASTs, source references and patch applicability passed
static checks. It remains unapplied until the corrected source is ready; no
hosted run or new dependency was started for the held candidate.

## Actual correction review

Correction `b86e61492dad30dd41e1c4e4e45123343b966bc3`, directly over `e52de76`,
arrived in `handoff_81591e31985a07388af7d0a7cfa68adf` at 05:58:40 UTC. This is
an actual owner delivery, superseding the preceding activity-only observation.

The existing lock witness now marks initialized raw batches before saving them;
marked absent/null/empty history, unknown states, damaged requests and missing
ACKs are refused. Old originals-only admission and pre-mark raw-list migration
remain supported. Error status/code/retryable correspondence and timestamp format
are corrected. Both request fixtures now retain their exact recorded original PUT
bodies; the historical envelope is accurately labeled built/enqueued, not POSTed.

Bounded independent wire and harness retests approve those corrections. Actual
portable evidence: 40 source/contract wire checks, five original-byte helper
checks using an older audited native PUT with explicitly synthetic metadata,
six timestamp/eight error controls, and static workflow validation. These are
neither current Swift execution nor current native-to-Backend composition.
Reports: `/tmp/native-raw-ingress-wire-retest.md` and
`/tmp/native-raw-ingress-harness-retest.md`.

One part of the original saved-state/ACK correspondence finding remains:
`frameBatchesAreWellFormed` checks a saved ACK only by batch ID and the first
record ID/sequence. A committed ACK whose artifact status is changed to pending,
artifacts are removed, or owner differs still passes; the reopened sender skips
that item as committed. The original request/hash need not change. Eleven focused
source-model/actual-contract controls reproduce this mismatch and confirm the
other state closures; `/tmp/native-raw-ingress-state-retest.md` records their
limits. No new writer race, Stop loss or arbitrary filesystem rollback guarantee
is claimed.

ONE narrow same-task follow-up, `handoff_4e71803770d0a202a66eefb9178525f1`, was
accepted in reply to the actual correction. It requests reuse of full verified
ACK/request correspondence at locked state admission and decisive corrupt-ACK
reopen cases, preserving originals without POST/new identity/rewrite. Receipt
is initially unread/not started. No further feature or broad audit is assigned.
The existing workflow proposal remains ready and unapplied; anticipated 33 native
and 56 fixture assertions remain predictions until actual execution.

## Final saved-ACK correction and integration

Actual delivery `c874f98b6e6d28c4431391da27db6e50f03552ac` arrived in
`handoff_f9f7e93ace7ff3cbd5e540c88d0f9a5b` at 06:13:38 UTC. Lead and independent
bounded review approve the remaining saved-ACK correction. The network receiver
and locked state admission now reuse one complete verifier; saved ACK bytes must
also equal its canonical output. Original standalone check source lists remain
self-contained. The earlier witness/write/rollback path is unchanged.

Independent evidence `/tmp/native-raw-saved-ack-retest.md` records three exact
move/wiring checks, eight actual Python-contract controls and one canonical-byte
comparison. These are source/portable results, not Swift execution. Root verified
main files equal the delivered correction. Base and both fixes integrate as
`368efd0`, `6ae5fda`, `fa773a8`.

The prepared existing workflow extension is now included with this candidate.
Main YAML, all 12 shell blocks, embedded Python and validator ASTs pass; old
build/check steps, pinned actions/dependencies and permissions are preserved.
Actual hosted results will follow this exact pushed source; expected 35/56 counts
remain predictions until logs exist. The prepared exact-fixture composition
script is `/tmp/native-fixture-http-composition.py`, with syntax/help checked;
it has not yet consumed this candidate's native output.

## Next action and limits

Lead runs actual native checks and both unsigned SDK builds on the approved
integrated source/workflow. The resulting exact request and original PNG fixtures will
be exercised through the Backend HTTP handler and retained Learning context,
followed by one independent QA check of the exact integrated candidate.

Backend's same-origin composition is now integrated and CI-verified;
see [composition integration](capture-app-integration.md). No database, listener, user
preview or Paperclip state was touched. Trusted bootstrap, real transport,
signing/device access and actual provider receipt remain distinct dependencies.
Neither core §7.1 gate, original-screen ink nor Notability import is accepted here.
