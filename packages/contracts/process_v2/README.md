# Process capture contract 0.2.0 — first executable slice

P0-08, ADR 0002 §§2–5. This additive namespace implements JSON Schema,
Python local validation, TypeScript types, OpenAPI and compatibility fixtures.
It does **not** register a stream, run an endpoint, persist a record or enable
process-aware teaching. The default `packages.contracts.validate`, `/v1` shapes,
old identities and generated 0.1.0 artifacts remain unchanged.

Use `packages.contracts.process_v2.validate` explicitly. `schema.json` is the
composition source: its named legacy primitives are copied by the loader, never
modified. `generated/schema.json` is the self-contained published JSON Schema;
`generated/contracts.ts` and `generated/openapi.json` use that resolved version.
Regenerate/check with `python -m packages.contracts.process_v2.generate [--check]`.
Consumers must support both structural and documented service invariants.

## Supported records and evidence boundaries

This slice accepts `operation` and `coverage` only. Each immutable record retains
its source version, stream sequence, original observation time (or unknown),
optional capture clock with unknown uncertainty, reliable media position or null,
surface/method, causal parents and obtainable before/after states. Preserve exact
original-language text, selected option identifiers and immutable artifact
references; an unknown state is distinct from an observed empty state. Arrays of
records may arrive out of order; only same-stream sequence and evidenced causal
links order facts. Clock values from different domains/streams do not establish
cross-device causality. Retain unresolved timing instead of guessing.

`frame_id` is null when no exact legacy frame is available. A named frame must
resolve to the same owner/source/version/device/session/media position and its
exact immutable artifact hash; `validate_record_frame` checks that binding. Frame
capture time stays distinct from the record's observation time. A reference alone
does not prove freshness or temporal alignment, and cannot express cross-source
audio/screen alignment. The service checks ownership/deletion and actual bytes.

An observed actor/basis is a capture claim, not authenticated producer identity,
proven reasoning, a correct-answer label or consent. Site feedback cannot be
attributed to the learner. Visual-only records describe visible changes/feedback,
not inferred undo/keystroke history. `reason_quote` is an actually obtained user
quotation or null, never a generated explanation. A trusted-input label alone
does not establish the claimed actor; producer adapters need per-site evidence,
including scripted/shadow-DOM events. Capturing visible AI content is not a
learner-presentation receipt and does not authorize displaying it again.

Coverage records describe samples, partial/unobserved/unknown intervals and
limitations. Missing sequence intervals concern this stream, precede the reporting
record and cannot overlap its present batch members. Late recovery is a new
coverage assessment in a later record; it never rewrites the historical gap.
No `complete` flag is supported: zero reported gaps cannot prove complete capture.
A surface label cannot establish original-screen interaction, editable ink,
actual composed model input, audio access or Notability import. Artifact bytes
remain opaque here; encoding/geometry/audio alignment/ASR corrections require
later explicit contracts. This slice cannot fulfill A44/A46/A47–49.

`provisional_session` avoids inventing a known problem. An `attempt` scope pins
an existing server-resolved problem/attempt/relation revision; changing a relation
requires a subsequent separately versioned fact, not editing originals. No attempt
registration, discovery or revision API is released in this slice. Do not synthesize
one from a page title or source similarity. Preserve local data until dependencies
can be resolved under the service rules below.

## HTTP, authorization and capability

The specified endpoint is `POST /v2/process/events:batch`, JSON, bearer-authenticated
trusted client, `Idempotency-Key` required, `process:capture` scope and explicitly
negotiated **process.capture.v0.2** capability. No page/content-script credentials
or page-asserted capability. Unknown version is 422 `unsupported_version`; an
unknown record kind/field is 422 `invalid_request`. Never retry this payload as v1.
No current server advertises this capability merely because this package exists.

Before any mutation **and before cached-success replay**, the service authenticates
and resolves the owned device, session membership, registered stream incarnation,
accessible undeleted source/version, existing attempt binding, causal parents,
artifact identities and current stop/deletion/authorization generations. A stream
is immutably bound to owner/device/session. A new incarnation must be declared,
including any restart gap; it does not renumber v1 observations. Cross-owner,
absent/deleted subjects are indistinguishable 404 `not_found`. Missing required
owned causal dependencies reject the whole batch with 409 `dependency_missing`;
stale attempt relation is 409 `stale_scope`. Self/forward same-stream causality
and dependency cycles reject, including cycles against stored records. Named
dependencies are resolved before success; this slice does not accept an envelope
with unresolved causal/attempt relations. Pending artifact **bytes** are separate.

`CaptureAuthority` is a trusted in-process service snapshot, not a wire model or
token verifier. `validate_submission` checks shape, capability, bound identities,
source/attempt membership and transmission/stop limits against it. The backend
must resolve and recheck those facts inside its transaction, including attempt-to-
source/session association and stored-parent validation; this helper does not
implement DB authorization, registration, relation lookup, deletion or locking.

Scoped stop denies new live transmission on that path. `historical` delivery
does not restart capture, present help or become a live frame. When stopped, only
records at/below the explicitly retained pre-stop stream boundary may sync, and
only while transmission remains authorized. Broader withdrawal denies historical
replay too. Preserve local authorized originals; explicit deletion is separate.
Recheck all fences through commit. Unknown authorization/stop boundary cannot be
made permissive by a request field, arrival timestamp or old idempotency key.

## Atomic persistence, equality and exact ACK

Successful HTTP 200 requires one durable transaction for the **entire batch**.
Uniqueness is `(owner, record_id)` and `(owner, device, stream, sequence)` in a new
process namespace, independent of v1 Observation IDs/sequences. Exact record replay
returns `duplicate`; changed immutable payload/context or occupied slot returns
409 `record_conflict`, rolling back all new records. No highest-sequence ACK.

`canonical_record` defines equality bytes from bound device/session/stream and the
whole immutable record, including source owner. Object key order is normalized;
text and ordered evidence arrays are not rewritten. Batch ID, live/history transport
and later receive time are excluded. HTTP-key equality separately covers the
entire validated request body under owner + method + full path + key; changed use
is 409 `idempotency_conflict`. Duplicate records preserve their original server
`received_at`. Exact HTTP replay preserves the original result after fresh fences;
it neither bumps revisions nor repeats effects. A new batch may reflect newly
verified blob status without modifying the original record or prior receipt.

The ACK exhausts the exact requested record IDs and their sequences, each exactly
once, marked accepted or duplicate. `envelope: committed` means the record's inline
content and reference metadata were committed. Every artifact is listed with its
immutable ID/digest/size/type and `pending` or `verified`. A hash or upload request
is not verified preservation: backend must check owned durable bytes, size and
digest. Pending bytes never count as saved ink/image content. Do not tell the user
all content is saved because inline metadata was ACKed. Receipt generation, durable
commit, model input, actual presentation and external import remain separate.

`validate_ack` verifies correspondence and allows `verified` only with independently
supplied verified blob identities. It does not prove a transaction or hash check
actually happened. Examples and tests are synthetic, including the pending frame.

Error bodies are closed `ProcessError` values without echoed original content.
401 unauthenticated; 403 forbidden/capability_required; 404 not_found;
409 record_conflict/idempotency_conflict/dependency_missing/stale_scope/capture_stopped;
422 unsupported_version/invalid_request; 503 unavailable. Only unavailable and
dependency_missing may be marked retryable; dependency retries wait for actual
resolution. Do not blindly retry conflicts, stops or authorization errors. Invalid
members, storage failure and incomplete transactions cannot return partial success.
Request-size transport limits are an explicit service configuration, not a reason
to truncate originals; callers retain/split records without changing their identity.

## Remaining implementation and compatibility gates

Backend P0-09 owns additive migrations, authenticated append/read, transactions,
stream registration/resolution and rollback that retains originals. Deletion must
remove scoped content/replay bodies and fence stale resurrection using only needed
opaque identity/generation metadata, not retained answer hashes. Apply ADR §5
dependency closure and both commit orders; schema checks are not DB evidence.

This capture capability enables no process-aware jobs, linked-v1 association,
help presentation, organizer/export or diagnosis. Those later contracts must land
with current disclosure, revision and lifecycle guards, including linked legacy
GET/PUT **responses**, cached success and historical replay (ADR §§2/6–8). Do not
activate linked-v1 behavior before its adapter is safe; unassociated v1 remains
unchanged. Capture ACKs never confer any such capability. Richer record families
will require an explicit version/capability extension, not hidden new fields here.

Focused tests cover strict parsing, local capture invariants, trusted-context
comparisons, exact ACK/blob status, equality and frozen v1 bytes/examples. Separate
backend concurrency/rollback/deletion tests, independent QA, actual providers and
actual platform paths remain required and unverified. R51/R52/R58 and A30/A31/A42/A43
are supported by this foundation; none is marked product-accepted by it.
