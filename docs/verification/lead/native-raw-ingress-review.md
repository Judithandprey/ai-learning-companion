# Native raw-ingress delivery review

Delivery `e52de7601bf09d7450ca818fe55753d5022b82b2` arrived in
`handoff_26df292974721646503721ce4d0814ef` at 2026-09-30 05:31:05 UTC.
Its parent `77a33bb` preserves the assigned `2a5e6bc` baseline. The owner also
reports reading the actual Backend notice and exact `8e4f52d` counterpart.
Review baseline is `1e0713a0baf71fc83c26c059bc1e75edec8828f5`.

**HOLD for the bounded corrections below; source is not integrated or compiled.**
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

## Next action and limits

iOS supplies one correction commit and focused evidence. Lead reviews the delta,
integrates the approved source/workflow, then runs actual native checks and both
unsigned SDK builds. The resulting exact request and original PNG fixtures will
be exercised through the Backend HTTP handler and retained Learning context,
followed by one independent QA check of the exact integrated candidate.

Backend's independently executable same-origin composition continues separately;
see [HTTP integration](raw-http-integration.md). No database, listener, user
preview or Paperclip state was touched. Trusted bootstrap, real transport,
signing/device access and actual provider receipt remain distinct dependencies.
Neither core §7.1 gate, original-screen ink nor Notability import is accepted here.
