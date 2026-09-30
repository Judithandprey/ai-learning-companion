# Windows capture ingress 0.2.10

Pure additive HTTP metadata contract for the released
[WindowsFrame 0.2.9](../windows_frame/README.md). It declares the separate
`POST /v2/process/windows-frames:batch`; **route and capability default OFF**.
No handler, capture grant, producer/provider, registration, upload or service is
activated. Released 0.1.0–0.2.9 formats and routes remain unchanged and reject this
envelope.

## Shape and binding

`WindowsFrameBatchRequest` has exactly `contract_version:'0.2.10'`, unchanged
`batch:ProcessBatch` 0.2.0 and `frames:WindowsFrame[]` 0.2.9 (0–100). Records remain
1–100. Frame IDs uniquely exhaust all non-null record frame IDs, without duplicate
or extra descriptors; several records may name the same retained frame.

Pure validation runs full Process causality, coverage, sequence and immutable
artifact checks, then the released Windows cross-field checks. The same artifact
or native PNG must carry consistent image facts across the entire envelope, even
under distinct archive IDs. Every framed
record must match its frame's exact owner/source/version and batch device/session/
stream, retain **every full raw and composed PNG reference**, and have null
`observed_at`, `media_position` and Process `clock`. Raw-only, shared raw/composed
originals and distinct image originals retain their 0.2.9 meaning. Extra editable
original references, generic Process vocabulary, scope and ordering stay intact;
neither an ink label nor a PNG establishes trusted structured-input acquisition.

`validate_frame_batch(..., user_id=...)` additionally binds every record, including
frameless ones, to the supplied authenticated owner. It never constructs a stored
display descriptor or original binding. Inside the actor transaction, the service
must call **`windows_frame.validate_binding` again with the STORED
DisplaySourceSnapshot 0.2.3 and every distinct OriginalArtifactBinding 0.2.2**, and
verify every exact retained typed original, including separate editable ink.
Known older ancestors need their own source/incarnation/original checks. Unknown
or corrupt stored variants fail closed; submitted metadata cannot reconstruct
missing originals, frames, receipts, sequence slots or child witnesses.

The route requires current trusted Bearer authentication, `process:capture`,
`process.capture.v0.2` and distinct `process.windows-ingress.v0.2.10`. The trusted
embedding resolves account/source access, device/session membership, producer,
generation and independently granted acquisition authority. Page/request labels,
native IDs and token possession do not grant them. No credentials go to course
pages/content scripts. Current pixel-producer restrictions remain Backend's
transactional admission rule, separate from the broad generic wire vocabulary.
Unresolved attempt authority remains `dependency_missing`, not a schema grant.

Shared-display registration and original PUT/GET remain the existing 0.2.4 routes
with independent capabilities/scopes. This capability implies neither
`process.ingress.v0.2.4` nor control authority. There is no second archive/upload.

## Missing observations

A frameless record (`frame_id:null`) requires existing `coverage` evidence with
`partial`, `unobserved` or `unknown` coverage, **no artifacts**, and null
`observed_at`, `media_position` and Process `clock`. Operations or
`observed_samples` without a frame are refused. Existing limitations and
missing-sequence checks still apply. This permits a gap-only batch before any
pixels exist without manufacturing a frame or exempting it from source authority.

Retained `state:gap` frames keep actual pixels and explicit known/unknown `gap_ms`;
missing producer duration remains null, never inferred from clocks or ordinals.
Refused/deferred/unwritten history and Stop are not images. A producer adapter must
preserve their actual unknowns/failures through appropriate existing coverage or
separate lifecycle records; it must not invent observed operations, stale fake
images, a lossless timeline or a Stop command from a coverage report. Unchanged
older entrypoints retain their own frameless restrictions.

## ACK and ordered replay

HTTP 200 carries unchanged **ProcessBatchAck 0.2.0**, only after one atomic commit.
Every artifact receipt must be `verified` from exact retained typed-original
bytes, including both image originals and any separate ink. Gap-only records have
zero artifact receipts. `validate_ack` checks correspondence and verified-only
status; caller-supplied verification tuples or synthetic ACKs are not commit proof.

Key HTTP replay by authenticated owner + method + full Windows route + exactly
one Idempotency-Key. `canonical_request` preserves the **whole ordered envelope**:
versions, frames, records, artifacts and evidence array order all participate;
only object member order is irrelevant. A changed body at the same key returns
409 `idempotency_conflict`. A different key cannot overwrite immutable identities.
The HTTP equality/receipt, descriptors, records and references commit in the SAME
actor transaction; an internal sorted frame map or wrapper cache cannot replace it.

Before any success, including exact replay, recheck current admission, account/
source access, device/session/producer/generation, Stop/revocation/deletion,
dependencies, every retained original and lost-original witnesses. Stopped
historical ingestion retains explicit pre-stop ceilings and cannot restart live
capture. New original uploads still require their separate current authority.
Cancellation, late failure or commit failure yields no partial ACK or mutation.

## Strict transport and deterministic errors

Use the released [raw-ingress rules](../raw_capture_ingress/README.md#strict-transport-and-deterministic-errors)
unchanged except for this route, capability and explicit versions: outer
**0.2.10**, batch **0.2.0**, frame **0.2.9**, error **WindowsIngressError 0.2.10**.

Exactly one Content-Type must be `application/json`, optionally `charset=utf-8`
(case-insensitive); absent or one identity Content-Encoding only. Other parameters
or encodings are unsupported. Duplicate Content-Type is 422 `invalid_request`;
missing/unsupported type or encoding is 415 `unsupported_media_type`. Optional
Content-Length must be a single unsigned decimal matching received bytes;
duplicate/invalid length or Content-Length with Transfer-Encoding is 422. No
query parameters are defined. A missing, duplicate or invalid Idempotency-Key is
422; validate the reused header definition without repair.

Raw UTF-8 bytes, including whitespace/escapes, and canonical metadata each have a
**4 MiB (4,194,304 byte)** ceiling. Stop oversized reads before parsing.
`decode_request` accepts immutable bytes only; duplicate members, invalid UTF-8,
malformed/nonfinite JSON, unsafe integers and excess nesting are rejected, never
normalized. Do not trim or resize originals; split only at valid record boundaries
or retain oversized input locally and report failure. The inherited per-original
32 MiB ceiling remains narrower than the native producer's 96 MiB ceiling.

`WindowsIngressError` is exactly `{contract_version:'0.2.10', error, retryable}`:

| Status | Codes |
| --- | --- |
| 400 | `invalid_json` |
| 401 | `unauthenticated` |
| 403 | `forbidden`, `capability_required` |
| 404 | `not_found` |
| 409 | `source_identity_conflict`, `record_conflict`, `idempotency_conflict`, `dependency_missing`, `stale_scope`, `capture_stopped`, `unsupported_source` |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` |
| 422 | `unsupported_version`, `invalid_request` |
| 503 | `unavailable` |

Authenticate and check current capabilities/scopes first; then query and
Idempotency-Key syntax; then media/length/encoding/raw size and strict JSON.
Malformed, duplicate, nonfinite or invalid-UTF-8 JSON is 400. **Explicit unsupported
outer/batch/frame versions then precede generic body-shape errors** (422
`unsupported_version`); missing versions and other shape/integrity failures are
422 `invalid_request`. Raw oversize is 413; canonical oversize during local
validation is 422, as in the existing routes. Current fences and retained-byte
checks precede cached success. Absent/foreign/deleted identities share 404.
Unknown stored variants, corrupt/missing committed evidence and storage/transaction
failures are 503 `unavailable`, not request-version errors. Reuse 0.2.4 internal
error aliases without exposing content or exceptions. Only `unavailable` and
`dependency_missing` may be retryable; dependency retries await actual resolution.
Pure helpers raise ValidationError; HTTP precedence is the future adapter's duty.

## Executable boundary and remaining evidence

Run `python -m packages.contracts.windows_capture_ingress.generate [--check]` and
the focused `test_windows_capture_ingress.py`. Schema, structural TypeScript and
OpenAPI are generated independently; Lead owns root registration and final release.
Tests reuse actual released Windows metadata examples with explicitly synthetic
archive relationships. They do not decode PNGs, prove composition/ink recovery,
authenticate a caller or commit storage. The held producer's integrity corrections,
runtime/adapter adoption, native input and permissions, real AI, audio, Notability
and both §7.1 gates remain separate and open. No native or provider is activated.

The separately reviewed [Backend implementation](../../../docs/verification/lead/windows-http-review/integration.md)
now consumes this unchanged contract through an explicit default-off flag. This
pure package still grants no authority or activation. Producer mapping/transport,
independent QA and actual device/provider evidence remain separate.
