# Process stream control 0.2.1

P0-08 additive executable slice over ADR 0002 §§2–5. Explicit import
`packages.contracts.process_control`; capability **process.control.v0.2.1** and
scope **process:control**. Capture batches/ACKs stay **0.2.0** with their separate
`process.capture.v0.2` capability; default v0.1 and its wire bytes stay unchanged.
Version 0.2.1 identifies these new control messages, not a reinterpretation of
0.2.0 records. Unknown versions/fields reject without fallback.

This package supplies schemas, local pure helpers, generated types/OpenAPI and
tests. It implements no HTTP route, auth verifier, database, device action or
capture. Backend owns transaction/migration/resolver implementation after release;
typed artifact upload, attempt binding and presentation remain separate contracts.

## Stream identity and registration

`stream_id` already means one capture incarnation. Registration immutably binds it
to the authenticated owner, existing owned device/session, current authorization
generation and **explicit device-session membership revision**. Two existing IDs
alone do not establish membership. The service resolves all of these under its
existing actor transaction; a request/page must not supply authority booleans.

`POST /v2/process/streams` accepts `StreamRegistration`. A trusted capture client
must have a fresh, actually authorized scoped start decision for this producer;
old stream existence, reconnect, a new ID, replay or an initial/restart label is
not that decision. The request pins its original authorization generation and
membership revision; both must still equal the trusted current values. The
trusted one-use start decision binds this **exact new stream ID** plus those
generations, not a general session-wide start boolean. Consume it atomically with
registration; stop/revocation invalidates affected pending starts. A delayed
uncommitted start cannot inherit a later grant. Issuing/resolving that decision is
the trusted service's responsibility; no public grant-creation API is released here.
Client-proposed stream IDs are unique within owner for all
time needed to fence old replay; a stopped/deleted/withdrawn ID is never reused.
Exact request replay returns its current state without re-registering it.

Continuity is either initial or restart with the closed owned predecessor from
the same device/session. Restart uses a new stream ID and declares the intervening
gap **unknown**. An initial label must not conceal a known predecessor; the service
checks actual producer lineage. Subsequent capture coverage can separately describe
what was observed, without rewriting this original registration. Other independent
streams can remain live; a restart cannot silently revoke them or establish global
single-stream exclusivity. New membership/authorization generations require a new
authorized incarnation; old generations never become current by copying them.

## Restrictive transitions and capture mapping

`POST /v2/process/streams/{stream_id}:control` requires matching body/path identities
and `expected_revision` CAS. Successful changes increment the revision; no helper
mutates its input. There is deliberately no resume or regrant action on an old ID.

| Action | Allowed previous state | New state / required evidence |
| --- | --- | --- |
| stop | live | stopped; known pre-stop sequence or null for unknown. Immediately stop local capture/transmission even if server synchronization fails; report the unresolved server state honestly. |
| seal_stop | stopped with unknown boundary | still stopped; one independently verified finite pre-stop boundary, no live permission. |
| withdraw | live or stopped | withdrawn; neither live nor historical transmission allowed. |

Boundary 0 means no records were ever assigned in this incarnation; a drained
queue after acknowledged sequence 20 still has final boundary 20, not zero.
Null means unknown, **not unlimited**. A known
boundary must come from the producer's persisted pre-stop queue/stop fact, resolved
independently of this request under current authorization. A timestamp, server's
highest received record, or copying the request argument into the trusted helper
input does not prove it. Already committed same-stream records cannot exceed a
verified final boundary; reject contradictory evidence while preserving originals.
The helper requires an explicit `committed_through_sequence` from that transaction;
zero must mean there are actually no committed same-stream records, not a default.
Do not silently widen an already sealed boundary. If evidence is unavailable, stop
with unknown boundary and keep local originals; seal only when evidence is resolved.

`capture_authority` maps fresh service state to unchanged `CaptureAuthority`:
live permits authorized capture; stopped permits only authorized historical records
at/below a known boundary; withdrawn permits neither. Source/attempt accessibility
must be resolved separately in the same transaction. The existing ingestion helper
enforces delivery mode and sequence. Source deletion, membership removal or broader
authorization withdrawal must still reject before cached ingestion success. The
service holds those fences through commit, including either stop/delete race order.

Control state is not original content. Stop preserves authorized pre-stop text,
ink, frames, attempts and time relations; deletion remains the existing separate
explicit operation. Continuous AV replay is not required. No control receipt proves
AI receipt, presentation, actual device stopping, complete capture or Notability
import. This capture-only slice grants no teaching/disclosure permission.

## HTTP and replay obligations

All three specified endpoints require trusted bearer auth and explicit control
capability, including `GET /v2/process/streams/{stream_id}`. No course-page token.
Absent/foreign/deleted identities are indistinguishable `404 not_found`. The
service maps validation to closed, content-free errors: 401 unauthenticated;
403 forbidden/capability_required; 409 stream_conflict/idempotency_conflict/
stale_revision/invalid_transition; 422 unsupported_version/invalid_request;
503 unavailable. Only unavailable is automatically retryable. A stale revision
requires current-state reconciliation, not unconditional repeated mutation.

Mutations require `Idempotency-Key`, scoped by owner, method, full path and complete
validated body. Same key/different body conflicts. Exact replay rechecks current
authorization, membership and generations, performs no new transition, and returns
**current `StreamState`** in HTTP 200. This intentionally differs from immutable
capture ACK replay: a cached old `live` response must not revive a stopped stream.
Check an existing replay before CAS or consuming a fresh start grant, only after
current authorization checks; a fresh
key against an old expected revision conflicts. Registration replay after stop
returns stopped; after withdrawal returns withdrawn if control-read authority still
exists; broader auth/membership revocation rejects. No default live state on errors.

Record uniqueness, idempotency entries and state changes commit atomically with
membership/generation checks. Persist enough opaque identity to reject stale
resurrection after deletion; no answer bytes/hashes in control tombstones. Service
registration must enforce unused IDs even if no capture records ever arrived.
Revocation invalidates existing control bindings; re-enabling an account does not
re-enable old streams. Feature rollback keeps originals accessible and disables new
capture, with no destructive downgrade. Backend must test actual concurrent commit
orders; pure helper tests are not that evidence.

## Generation and compatibility

Run `python -m packages.contracts.process_control.generate [--check]`.
Schema is composed from unchanged local v0.1 identifier primitives. TypeScript is
structural only; semantic helpers and documented service checks are required.
The [stop/seal example](examples/stop.json) is synthetic local data, not a commit
receipt or actual device stop.
Control schemas cannot be passed to the default v1 or capture v0.2 validator.
Compatibility tests pin old artifacts independently. Original requirements,
R51/R52/R58/A30/A31/A38/A42/A43 and scoped AUDIO-14 stopping are supported by this
foundation, with R59/device/audio/G6/G7/full P1 still unverified.
