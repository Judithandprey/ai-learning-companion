# Capture ingress — additive transport 0.2.4

P0-08 / ADR 0002 §§2–5. This pure package specifies transport for the existing
reviewed display-source → typed original → atomic Frame/process callables. It
adds no HTTP handler, auth service, start grant, codec, migration, archive, producer
or provider activation. Backend's opt-in `services.api.ingress_app.create_ingress_app` is now implemented and
reviewed (integration `6321d0c`). The default application does not mount these
routes or advertise `process.ingress.v0.2.4`; activation still needs explicit
trusted embedding and current authorization. Default capture
gates and all existing 0.1.0/0.2.0/0.2.1/0.2.2/0.2.3 bytes remain unchanged.

The new closed wrappers are `DisplaySourceRegistration` and `FrameBatchRequest`.
All reused definitions are copied from their released packages at generation;
they are not independently redefined. Generated JSON Schema and OpenAPI are
self-contained. TypeScript is structural; neither schema nor types establish
cross-object bindings, authority, storage or physical capture.

## Routes and current authority

All five operations require Bearer authentication from a trusted adapter and the
explicit **process.ingress.v0.2.4** capability. Page-supplied identities, capability
labels or producer assertions grant nothing; never expose tokens to course pages
or content scripts. Required scopes/capabilities are cumulative:

The existing authenticated Principal carries user/scopes/expiry/generation; it
does not by itself supply negotiated capabilities or producer authority. Those
remain trusted, current embedding/registry facts, not fields inferred from having
a Bearer token or accepted from the request.

| Operation | Body → successful HTTP 200 | Additional scopes / capabilities |
| --- | --- | --- |
| PUT `/v2/process/display-sources/{source_id}` | `DisplaySourceRegistration` 0.2.4 → `DisplaySourceSnapshot` 0.2.3 | `sources:write`, `process:control`, `process:capture`; `process.control.v0.2.1`, `process.capture.v0.2` |
| GET same display-source path | no body → retained `DisplaySourceSnapshot` 0.2.3 | `sources:read`; no live/control capability |
| PUT `/v2/process/originals/{artifact_id}` | exact `OriginalArtifactUpload` 0.2.2 → `OriginalArtifactReceipt` 0.2.2 | `sources:write`; for shared-display sources also `process:capture` and `process.capture.v0.2` |
| GET `/v2/process/sources/{source_id}/versions/{source_version}/originals/{artifact_id}` | no body → exact `OriginalArtifactUpload` 0.2.2 | `sources:read`; no live/control capability |
| POST `/v2/process/frames:batch` | `FrameBatchRequest` 0.2.4 → `ProcessBatchAck` **0.2.0** | `process:capture`; `process.capture.v0.2`; mandatory `Idempotency-Key` |

Registration contains exactly `contract_version`, `source_id`, `stream_id`,
`project_id` (required, nullable) and `source_timezone`. Path source ID equals
body source ID. The trusted adapter resolves producer identity from the current
registered stream and consumed start grant, under the same actor transaction as
registration. It must never create a grant, trust a body producer ID, infer consent
from knowing a stream, or race an out-of-transaction producer lookup against a
write. Current owner/device/session membership, generations, project ownership,
producer and stop facts are rechecked. The server supplies creation time.

Source ID itself is the immutable registration replay identity: exact replay
preserves the original descriptor/creation time; changed project/timezone/stream
or legacy-ID reuse conflicts. Creation **and exact replay** require current live
authority. A restart needs a new registered stream and distinct source ID. A GET
reads retained history, including after scoped stop/withdrawal/restart, while
rechecking current account/source access, retained incarnation and ownership.
Historical retention does not confer permission to capture or transmit.

Original PUT binds body source owner to the authenticated caller and body artifact
ID to the path. ID/source/version/kind/type/length/hash/bytes are immutable; exact
ID replay rechecks current fences. Shared-display uploads, **including exact byte
retries**, require live capture authority before replay success. This release has
no independently bounded historical-byte-upload grant: retain stopped queues
locally and report pending/unavailable; do not relabel them live. Original GET
instead checks all path values, caller, current source/version access, tombstones
and exact retained bytes. A scoped stop does not revoke ordinary historical reads;
account/source revocation or deletion does. Missing/corrupt bytes are never rebuilt
from a stale client or snapshot. No `Idempotency-Key` is required by either PUT.

## Atomic frames, originals and HTTP replay

`FrameBatchRequest` contains exactly outer `contract_version: 0.2.4`, existing
`batch: ProcessBatch` 0.2.0 and nonempty `frames: Frame[]` (at most 100).
Frame IDs are unique and exhaust exactly the non-null IDs named in records; there
are no extra frames. Multiple records may legitimately reference the same frame.
For each named frame, local validation constructs the proposed 0.2.2 screen-image
binding from that record's exact source and matching immutable artifact reference,
then calls `validate_capture_frame`. Screen-capture representation, source/version,
owner/device/session, media position and artifact identity/hash/size/type must agree.
These comparisons prove metadata consistency only, not that the bytes exist.

Backend resolves the real stored binding and exact bytes for **every** artifact,
current registered authority, source/display descriptor and all causal ancestors
inside the existing actor transaction. Use `validate_display_record` for current
records and retained ancestors with their actual original stream, not the child's
stream. Source/frame/artifact loss, conflicting IDs, deletion and surviving reverse
receipt/slot/child witnesses must not permit resurrection. All frames, records,
references, idempotency facts and ACK commit together or none do. No nested
check-then-call transactions, pending-blob success, partial ACK or pre-commit receipt.

The HTTP key is `(authenticated owner, method, full route path, Idempotency-Key)`.
`canonical_request` covers the **complete** wrapper and nested body: object member
order is irrelevant; frame-array and record/evidence-array order and all versions
remain significant. Changed envelope with the same key returns
`409 idempotency_conflict`. Exact replay returns the committed ACK only after fresh
authorization, dependency, stop and deletion checks. New keys do not release old
record/frame identities. Original record equality and received timestamps retain
the existing capture 0.2.0 rules; no change to `/events:batch` semantics.

**Implemented HTTP boundary:** the opt-in adapter passes the full ordered envelope
to `CaptureArchive._ingest`; HTTP equality and its receipt commit with the same
transaction. The existing internal `internal_capture_frames` path keeps its frame-ID
map semantics for compatibility. HTTP cached receipts must all remain `verified`;
an inconsistent cached receipt is refused without rewriting it. An independent
wrapper cache committed before/after the transaction remains insufficient.

Current backend supports only resolved `provisional_session` records on this path;
attempt relations without an authoritative resolver return `dependency_missing`.
It also refuses **frameless shared-display records**, even in an otherwise framed
batch. The pure wrapper cannot infer a source family from `SourceRef`, so Backend
enforces that limit from stored descriptors (`unsupported_source`). Unframed legacy
records in a mixed valid batch keep existing semantics. This bound does not remove
the requirement to retain observed gaps/steps or constitute full offline/coverage
acceptance. Never invent an Observation, URL, problem or frame to bypass it.

ACK correspondence uses existing `validate_ack` with independently verified blob
identities; this ingress requires all artifact receipts `verified` after exact
durable-byte checks. `bytes_committed`, envelope commit, AI input, displayed help
and destination import remain distinct. No capture/ink operation grants teaching,
answer disclosure, answer submission or an external write.

## Strict transport and deterministic errors

Only UTF-8 `application/json` with identity content encoding is supported for
request bodies. Reject duplicate object keys, invalid UTF-8/JSON, NaN/Infinity,
unexpected members and unsafe integers; do not repair or truncate. Existing depth
guard is 64 containers. Route IDs use `Identifier` after one URL decoding; version
paths use canonical positive decimal integers within the existing safe-integer
range. Reject duplicate/unexpected query parameters (none are defined), GET bodies,
and missing/duplicate/invalid `Idempotency-Key` on the batch route.

Raw body limits, checked while reading **before JSON/base64 decoding**, are:

- Registration/frame envelopes: **4 MiB (4,194,304 bytes)**.
- Original upload: **48,933,548 bytes**, comprising the existing 32 MiB original's
  maximum canonical base64 (44,739,244 characters) plus 4 MiB metadata/JSON budget.
- Original responses use the same finite upload bound; no new unlimited body.

Whitespace/escaping count toward raw limits. `decode_request` enforces immutable
byte input, raw limits, strict JSON and local validation. `validate` also bounds
canonical request JSON. These pure helpers raise `ValidationError`; the opt-in
HTTP adapter performs the following fixed route mapping, with a closed
`IngressError {contract_version: '0.2.4', error, retryable}` and no echoed originals:

| Status | Codes / condition |
| --- | --- |
| 400 | `invalid_json`: malformed/duplicate-key/non-finite/invalid-UTF-8 JSON |
| 401 | `unauthenticated`: absent/expired/invalid authenticated caller |
| 403 | `forbidden`, `capability_required`: current access/scope or negotiated capability denied |
| 404 | `not_found`: absent, foreign-owned or deleted identity; do not distinguish foreign existence |
| 409 | `source_identity_conflict`, `record_conflict`, `idempotency_conflict`, `dependency_missing`, `stale_scope`, `capture_stopped`, `unsupported_source` |
| 413 | `payload_too_large`: raw transport ceiling exceeded |
| 415 | `unsupported_media_type`: non-JSON type or unsupported content encoding |
| 422 | `unsupported_version`: any explicit unsupported outer/nested contract version; otherwise `invalid_request` for shape, path/body, byte integrity or header failures |
| 503 | `unavailable`: storage/transaction failure or inconsistent/missing committed evidence |

Transport checks apply before mutation; an oversize read stops at the bound.
After authentication and syntactic transport checks, check explicit versions before
generic shape validation. Current service fences precede cached success. Map internal
`invalid_contract` to `invalid_request`, owned-reference absence codes to `not_found`,
original identity/source/immutable-content conflicts to `record_conflict`, display
authority denial to `forbidden`, and corrupt-original/source state to `unavailable`;
do not expose arbitrary internal exception strings. Unsupported stored variants are
unavailable, not a request-version error. Only `unavailable` and `dependency_missing`
may be marked retryable; dependency retry waits for actual resolution. Size failures
retain originals locally: split a batch at record boundaries where valid, or report
an oversized original unavailable, never alter original IDs/content to fit.

## Checks and evidence limits

`examples.json` is synthetic contract input/output, not captures or receipts from
an actual device/store. Run `python -m packages.contracts.capture_ingress.generate
[--check]` and `pytest packages/contracts/tests/test_capture_ingress.py`.

This supports R07/R29/R30/R35/R36/R46/R51/R52/R58/R59 and the A12/A14/A16/A30/A31/A44
boundaries. Both §7.1 gates remain separate and unaccepted: continuous full visible
display reaching real AI, and original-screen cross-app selection/ink reaching that
same context. Preserve the full NAV→WRITE→partial erase→undo/redo→ASK→prior WRITE→
save/reopen/edit loop, originals/history/unknown gaps and supported Notability path.
No device, producer transport, image/ink decoding, live coverage, model receipt,
editable re-open, cross-device understanding or external import is proved here.
