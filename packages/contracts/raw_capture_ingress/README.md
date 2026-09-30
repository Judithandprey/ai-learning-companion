# Raw capture ingress — pure HTTP contract 0.2.6

P0-08 additive baseline for the internal raw-frame adoption described in
[Backend next scope](../../../docs/verification/lead/raw-frame-backend-next-scope.md).
This package implements pure validation and generated structural TypeScript,
standalone JSON Schema and OpenAPI only. **Route and capability default OFF.**
There is no handler, migration, bootstrap, producer/provider activation or new
original-image upload endpoint. All 0.1.0–0.2.5 files and readers remain unchanged.

## One separate operation

`POST /v2/process/raw-frames:batch` requires current trusted Bearer authentication,
scope `process:capture`, capabilities `process.raw-ingress.v0.2.6` **and**
`process.capture.v0.2`, and one mandatory `Idempotency-Key`.
Capabilities, owned device/session membership and producer authority come from the
trusted current embedding/registry, never page/request fields or token possession
alone. No credentials go to course pages or content scripts. This new capability
does **not** imply `process.ingress.v0.2.4` or control authority. Native registration
and original PUT/GET continue through the existing 0.2.4 routes with their separate
capabilities/scopes; this document neither duplicates nor changes those routes.

The closed `RawFrameBatchRequest` contains exactly:

- `contract_version: '0.2.6'`;
- `batch: ProcessBatch` **0.2.0**, unchanged;
- `frames: RawCaptureFrame[]` **0.2.5**, 1–100 descriptors, unchanged.

Success is HTTP 200 with existing `ProcessBatchAck` **0.2.0**, after all descriptors,
process records, references and HTTP replay facts commit atomically. Every artifact
receipt must be `verified` using exact retained typed-original bytes; pending or
partial ACKs and pre-commit success are forbidden. `validate_ack` composes the
existing correspondence helper with that verified-only rule. Supplied verification
tuples and synthetic successful ACKs do not prove bytes exist or a commit occurred.

## Pure membership versus retained authority

`validate('RawFrameBatchRequest', payload)` checks the complete batch once,
including cross-record causality, missing sequences and artifact conflicts. Raw
shapes retain all eight/unknown orientations, unswapped dimensions, independent
buffer sequence, unknown capture UTC/course position, separate callback estimate
and finite sample PTS without rewriting anything. Frame IDs uniquely exhaust the
non-null IDs named by records; multiple records may name the same frame.

Each framed record must match the exact source owner/ID/version, batch
device/session/stream, and complete PNG artifact reference. Its `observed_at` and
`media_position` stay null. A supplied record clock must exactly equal the raw
callback clock, including domain, elapsed value and unknown uncertainty; a null
record clock may omit that duplication. Other references, scope, evidence, unknown
gaps and ordering survive unchanged. `validate_frame_batch(..., user_id=...)` also
checks every record against the caller-supplied trusted owner.

These small local comparisons mirror only the applicable part of 0.2.5
`capture_frame.validate_binding`, tested against that actual helper with explicitly
supplied synthetic display/original facts. The pure wrapper does not manufacture a
`DisplaySourceSnapshot`, creation time, stored-original assertion or authority.
Backend must call full binding with the **retained** DisplaySourceSnapshot 0.2.3
and OriginalArtifactBinding 0.2.2 and verify **every** artifact's exact bytes inside
the actor transaction. Raw ancestors require their own retained display incarnation
and originals, not the child's stream. Current account/source access, owned
device/session membership, producer, generations, stop/revoke/delete, dependencies,
cross-format ID conflicts, tombstones and lost-original receipt/slot/child witnesses
all remain mandatory, including before exact replay. Missing/corrupt originals or
descriptors cannot be reconstructed from the submitted envelope.

Current internal Backend adoption remains `provisional_session` only; unresolved
attempt authority returns `dependency_missing`. The pure schema preserves attempt
metadata without granting its authority. SourceRef does not reveal source family:
frameless members remain representable, but Backend refuses **frameless
shared-display** records with `unsupported_source`. Never fabricate a frame to hide
a gap or downgrade raw metadata into a legacy Frame. A valid pure envelope does
not prove freshness, capture coverage, image geometry/decoding, real AI receipt,
teaching/disclosure permission, answer submission or external import.

## Atomic ordered HTTP replay

Key requests by `(authenticated owner, method, full route path, Idempotency-Key)`.
`canonical_request('RawFrameBatchRequest', payload)` covers the entire wrapper,
all nested versions/fields and all array order. Object member order alone is
irrelevant. Reordering frames, records or evidence is a different HTTP envelope;
internal canonical frame-ID-map replay alone is insufficient. A changed envelope
at the same key returns `409 idempotency_conflict`. Exact replay returns the
committed verified-only ACK only after fresh fences and exact retained-byte checks.
HTTP equality and its receipt must join the **same actor transaction** as raw
descriptors and records; a before/after wrapper cache is insufficient. A new key
does not release immutable frame/record identities. Cancellation or any late
validation/commit failure yields no partial success. Stopped historical ingestion
keeps the existing explicit pre-stop boundary; new original uploads still need
the existing live authority and are not authorized by this route.

## Strict transport and deterministic errors

Use the same 0.2.4 transport rules: exactly one `Content-Type: application/json`,
optionally `charset=utf-8` (case-insensitive), with absent or one identity
`Content-Encoding`. Reject other parameters/encodings; duplicate Content-Type is
`422 invalid_request`, missing/unsupported type or encoding is
`415 unsupported_media_type`. Content-Length, when present, must be one unsigned
decimal header matching received bytes; duplicate/invalid length or simultaneous
Content-Length/Transfer-Encoding is `422 invalid_request`. No query parameters are
defined: unexpected/duplicate query input is invalid. Reject missing, duplicate or
invalid `Idempotency-Key` against the reused closed header definition; no repairs.

Both raw UTF-8 bytes (including whitespace/escapes) and canonical metadata are
bounded to **4 MiB (4,194,304 bytes)**. Stop oversized reads before JSON decoding.
`decode_request` accepts immutable bytes only; it rejects invalid UTF-8/JSON,
duplicate members, NaN/Infinity, unsafe integers, non-JSON values and more than the
existing 64-container depth. `validate` separately applies the canonical ceiling.
Do not truncate originals or evidence; split at valid record boundaries or retain
the oversized input locally and report failure.

`RawIngressError` is exactly `{contract_version:'0.2.6', error, retryable}` with
the unchanged 0.2.4 status/code sets:

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

Authenticate and check current capability/scopes first, then query and
Idempotency-Key syntax, body media/length/encoding/raw-size and strict JSON.
Malformed/duplicate/nonfinite/invalid-UTF-8 JSON is 400. Explicit unsupported outer
**0.2.6**, batch **0.2.0** or individual raw-frame **0.2.5** versions then take
precedence over generic body shape validation (422 unsupported_version);
missing versions and other shape/integrity
failures are 422 invalid_request. Raw size excess is 413; canonical excess during
local validation is 422 invalid_request, matching existing ingress behavior.
Current service fences and dependency/byte checks precede cached success.
Absent/foreign/deleted identities share 404; unknown stored variants, corrupt or
missing committed evidence and storage/transaction failures are 503 unavailable,
not request-version errors. Reuse existing 0.2.4 internal error aliases and never
echo original content or arbitrary exceptions. Only `unavailable` and
`dependency_missing` may be retryable; dependency retries wait for actual resolution.
Pure helpers raise ValidationError, not HTTP responses; descriptions are obligations
for a future explicitly authorized adapter, not claims that it exists.

## Checks and remaining evidence

Run `python -m packages.contracts.raw_capture_ingress.generate [--check]` and
`pytest packages/contracts/tests/test_raw_capture_ingress.py`. Tests use synthetic
metadata, references and receipts. This bounded contract supports
R07/R29/R30/R35/R36/R46/R51/R52/R58/R59 and A12/A14/A16/A30/A31/A44 boundaries.
Both §7.1 core gates remain open: continuous full visible screen reaching real AI,
and original-screen cross-app selection/ink reaching the same context. Preserve
the complete navigation/write/erase/undo/redo/ask/save/reopen/edit flow, editable
originals/history, source/time unknowns and separately verified Notability import.
No runtime activation, real-store transaction, native/device/provider operation,
live coverage, orientation rendering or destination import is proved here.
