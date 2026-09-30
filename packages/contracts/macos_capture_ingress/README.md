# macOS capture ingress — candidate 0.2.12

**UNRELEASED**, prepared under Lead's isolated shared-file delegation at
`c2ac1c7f7f8337424812fb5e53cc078d9715548d`. Lead owns final review, root
registration and release. This pure metadata contract declares
`POST /v2/process/macos-frames:batch` with **route and capability default OFF**.
It adds no handler, producer, capture permission, original store, account,
provider or upload. Existing 0.1.0–0.2.11 families remain unchanged.

## Exact envelope and bindings

`MacOSFrameBatchRequest` has exactly `contract_version:'0.2.12'`, unchanged
`batch:ProcessBatch` 0.2.0 and `frames:MacRetainedFrame[]` 0.2.11 (0–100).
Records remain 1–100. Frame IDs uniquely exhaust the non-null frame IDs named by
records; no duplicate, missing or extra descriptor is accepted. Several records
may refer to the same retained frame.

The validator runs full Process causality, sequence, coverage and immutable
artifact checks and the released [macOS frame checks](../macos_frame/README.md).
Each framed record binds the exact owner/source/version and batch device/session/
stream, includes every complete distinct raw/composed PNG reference, and retains
null `observed_at`, `media_position` and Process `clock`. Separate editable-ink
originals, scope, parents and generic framed Process vocabulary remain intact.
PNG metadata, native paths and ink revision labels never grant structured-input
authority or prove an editable original was saved.

Batch-wide consistency checks keep three identities separate:

- One archive artifact ID has one exact artifact reference, dimensions and encoding.
- One PNG SHA-256 has consistent length, media type, dimensions and encoding.
- One `(profile.native_session_id, native_file)` has consistent PNG bytes and facts.

Different native sessions may both contain `frames/00000001.png` with different
bytes. Identical bytes may occur at multiple native paths and under separate
archive IDs. Paths and native session labels do not replace source ownership.

`validate_frame_batch(..., user_id=...)` additionally checks every record's owner,
including frameless coverage, against the caller-supplied trusted principal.
It does not authenticate that principal or synthesize stored source/originals.
The later service must call **`macos_frame.validate_binding` with the STORED
DisplaySourceSnapshot 0.2.3 and exactly one stored screen-image
OriginalArtifactBinding 0.2.2 for each distinct image artifact ID**. Binding order
is immaterial. It must verify every exact typed original, including separately
referenced editable ink, in the current actor transaction. Ancestors require
their own source/incarnation/original checks. Submitted metadata cannot repair
missing originals, descriptors, receipts, sequence slots or child witnesses.

## Retained facts and absent observations

Raw images, `composed`, `not_composed` and `unknown` outcomes retain the complete
0.2.11 facts without trimming, reordering or promoting unknown values. Empty ink
can truthfully alias the raw file with one or two archive references; nonempty
ink has a composed native file, which may contain identical bytes. A missing
outcome does not mean successful empty ink, a refusal, Stop or a missing raw file.
A refusal retains its actual reason/detail and outcome time; it is not a command.

Callback ordinals are not Process sequences. PTS, session wall/host anchors,
callback/source/composition host times and display rotation do not establish
capture UTC, video playhead, pixel orientation, latency or live permission.
Those frame fields and Process observation/media/clock fields remain null.
Null dirty rectangles remain distinct from an empty list. Ordered ink stroke
IDs, exact mapping/rendering text and limitations—including unknown reopened
revision time and save failures—stay intact. Document path/revision is not an
immutable ink-byte original or a complete operation history.

A frameless record requires existing `coverage` evidence marked `partial`,
`unobserved` or `unknown`, no artifacts and null observation/media/clock.
Operations and `observed_samples` without a frame are rejected. Gap-only batches
before any pixels exist still require trusted source and producer admission.
Do not infer missing durations, synthesize stale frames, or promote incomplete
coverage to an observed operation. Generic framed vocabulary stays broad; the
service's current trusted pixel-producer restrictions still apply before replay.

This envelope is not a whole-session export. Native session counters, gaps,
ending, capture-filter details, geometry changes, input/ASK events and complete
editable history/save state remain in their original records. A later native
adapter must preserve and report unmapped facts, not discard them because this
frame family cannot express them. Old entrypoints keep their own restrictions.

## Current authority, atomic ACK and replay

Require current trusted Bearer authentication, `process:capture`,
`process.capture.v0.2` and distinct `process.macos-ingress.v0.2.12`. The embedding
resolves account/source access, device/session membership, producer, generation
and independently granted acquisition authority. Request/page/native labels and
token possession alone grant none of these. Never expose credentials to course
pages/content scripts. Unresolved attempt authority stays `dependency_missing`.

Existing display registration and original PUT/GET remain the 0.2.4 routes with
their separate capabilities/scopes. The new capability implies neither
`process.ingress.v0.2.4` nor process-control authority.

HTTP 200 uses unchanged **ProcessBatchAck 0.2.0**, only after one atomic actor
commit. All artifact receipts must be `verified` against exact retained typed
original bytes; frameless gap records have none. `validate_ack` checks
correspondence and verified-only status. Supplied verification tuples or a
synthetic ACK do not prove a storage transaction committed.

Key replay by authenticated owner + method + full macOS route + exactly one
Idempotency-Key. `canonical_request` preserves the whole ordered HTTP envelope:
every version, descriptor and record, artifact, evidence, stroke and limitation
array participates. Only object-member order is ignored. A changed body at the
same key is 409 `idempotency_conflict`; a new key cannot overwrite immutable
identities. HTTP equality/receipt, descriptors, records and references must
commit in the SAME actor transaction; a sorted frame map or wrapper cache is
insufficient.

Before any success, including exact replay, recheck current source/original
access, account/device/session/producer/generation, Stop/revocation/deletion,
dependencies and lost-original witnesses. Recheck cross-batch stored image
consistency as well as this envelope's local consistency. Unknown/corrupt stored
variants fail closed. Historical upload preserves pre-stop ceilings and cannot
restart capture; original uploads retain independent current authorization.
Cancellation, late failure and transaction failure must yield no partial ACK or
mutation. Pure helpers do not implement these storage/lifecycle obligations.

## Strict transport and deterministic errors

Reuse the [Windows ingress transport conventions](../windows_capture_ingress/README.md#strict-transport-and-deterministic-errors)
with outer **0.2.12**, ProcessBatch **0.2.0**, MacRetainedFrame **0.2.11** and
`MacOSIngressError` **0.2.12**.

Exactly one Content-Type is `application/json`, optionally `charset=utf-8`
(case-insensitive); no other parameters. Content-Encoding is absent or a single
identity value. Duplicate Content-Type is 422; missing/unsupported type or
encoding is 415. Optional Content-Length is a single unsigned decimal matching
received bytes; invalid/duplicate length or Content-Length plus Transfer-Encoding
is 422. No query parameters. Missing, duplicate or invalid Idempotency-Key is 422;
reuse its header definition without repair.

Raw UTF-8 body bytes, including whitespace/escapes, and canonical metadata each
have a **4 MiB (4,194,304 byte)** ceiling. Stop oversized reads before parsing.
`decode_request` accepts immutable bytes only and rejects duplicate members,
invalid UTF-8, malformed/nonfinite JSON, unsafe integers and excessive nesting.
Integral JSON numbers such as `3.0`/`3e0` remain valid where the schema permits
integers; validators do not mutate input representation. Canonical JSON is the
existing equality convention, not a lossless record of HTTP whitespace/number
lexemes. The per-original 32 MiB limit remains. Character limits inside 0.2.11
remain character limits; refuse oversized facts, never truncate originals.

`MacOSIngressError` is exactly `{contract_version:'0.2.12', error, retryable}`:

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

Precedence: authenticate/current capabilities and scopes; query/Idempotency-Key
syntax; media/length/encoding/raw size; strict JSON; explicit unsupported
outer/batch/frame versions; then generic shape/integrity. Malformed, duplicate,
nonfinite or invalid-UTF-8 JSON is 400. Explicit wrong versions are 422
`unsupported_version`; absent versions and other shape/integrity failures are
422 `invalid_request`. Raw oversize is 413; canonical oversize is 422. Current
fences/retained bytes precede cached success. Absent/foreign/deleted identities
share 404. Unknown stored variants, corrupt/missing committed evidence and
storage failures are 503 `unavailable`, not request-version errors. Reuse 0.2.4
internal aliases without exposing content/exceptions. Only `unavailable` and
`dependency_missing` may be retryable, after actual dependency resolution.
Pure helpers raise ValidationError; the later HTTP adapter owns this precedence.

## Executable evidence and next owner

`examples/retained-batch.json` contains all seven unchanged released descriptors
from the audited Swift-generated synthetic buffers (six composed, one refused),
wrapped in explicitly synthetic historical Process records. See its
`provenance.json` and the original [0.2.11 provenance](../macos_frame/examples/provenance.json).
No native PNG archive is duplicated. Unknown-outcome and frameless fixtures in
tests are explicitly constructed edge cases, not claims about that producer run.

```sh
python -m packages.contracts.macos_capture_ingress.generate --check
python -m pytest packages/contracts/tests/test_macos_capture_ingress.py -q
```

Schema/readonly TypeScript/OpenAPI are structural; use the Python validator for
cross-field rules. Tests prove declared shapes and pure bindings only. They do
not authenticate callers, decode PNGs, retain editable originals, commit a DB,
exercise live macOS permissions or establish real AI receipt, audio, Notability
import or either §7.1 gate. Next: Lead reviews/registers/releases this candidate,
then assigns bounded handler/readers work. No root registration or existing
service behavior changes in this delivery.
