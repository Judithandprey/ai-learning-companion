# P0 HTTP contract

`generated/openapi.json` is generated from `schema.json` by
`python -m packages.contracts.generate_openapi`. It is an interface specification,
not evidence that these routes are implemented or deployed. Existing bridge/event
v0.1.0 payloads remain compatible; the HTTP definitions are additive. Backend owns
the endpoint/repository implementation and migrations; lead owns changes here.

| Method / path | Request | Success |
| --- | --- | --- |
| POST `/v1/sources` | SourceRegistrationRequest + Idempotency-Key | SourceRegistrationResult; 201 new, 200 existing |
| GET `/v1/sources/{source_id}` | Authenticated identifier | SourceReadResult |
| GET `/v1/sources/{source_id}/versions/{source_version}` | Exact immutable version | SourceSnapshot |
| POST `/v1/events:batch` | EventBatch + Idempotency-Key | EventBatchAck after complete durable commit |
| GET `/v1/notes/{note_id}` | Authenticated identifier, optional revision query | Current or exact historical NoteRevision |
| PUT `/v1/notes/{note_id}` | NoteRevision + Idempotency-Key | NoteWriteResult; 201 new, 200 update/replay |
| POST `/v1/jobs/{job_id}/cancel` | No body; intrinsically idempotent | Actual JobCancelResult |
| GET `/v1/usage` | No client-selected accounting month | UsageResult |

All operations require bearer authentication in a trusted client/native context.
Course content scripts never receive the credential. Native bridge permissions are
not derived from a page-supplied claim. `x-required-scope` records each route's
required application scope; it does not configure OAuth or imply live login.
Body identities and path IDs must match the authenticated principal and target.
Return 404 for resources not owned by the caller. Scope insufficiency is 403.
Other errors use the common `ApiError` body without secrets or reflected stack traces.

Registration only stores a reference. A new record has `access_status=registered`
and `current_version=null`; do not invent content hashes or fetch timestamps.
The registration request requires original_url and nullable project_id; omitted
type defaults to web and omitted connection_id defaults to null on the server.
Version zero is never a real snapshot or a replacement for null.
Semantic URL query parameters and locators are preserved. URL format checks reject
embedded user credentials and non-HTTP schemes, but do not implement an SSRF policy
or grant permission to fetch a private network resource. Fetch authorization and
DNS/redirect destination checks are backend connector responsibilities.

Snapshots are immutable and separately retrievable by exact version. The current
version must appear in the returned available-version list. Updating the source does
not rewrite existing note anchors. A record can need reauthentication while retaining
an older archived snapshot. Deleted content follows the separate tombstone/cleanup
policy and must not be resurrected by old jobs.

Idempotency keys are scoped by user + HTTP method + full path. For a committed
request replay, return the original result even if newer note/source revisions now
exist. Reusing a key with changed input returns 409. Enforce domain event ID and
device sequence deduplication independently of the batch key; changing batch layout
or a server-generated received_at must not defeat deduplication. Conflict checks
and complete writes are transactional; never ACK an uncommitted partial batch.
Keep idempotency records with the source lifecycle for P0. Deletion revokes cached
responses containing deleted data; retry cannot recover erased content from a
replay cache. Persist only the minimum tombstone needed to prevent recreation.

Note PUT uses the existing NoteRevision shape, including base_revision. Initial
revision is 1/base 0, subsequent updates compare with current base before committing.
An idempotent replay may return its original older committed note, so a client that
needs latest state follows with GET. `persistence=server_committed` is only returned
after actual storage commit, never for local-only, queued or mock persistence.

Usage money is integer CNY fen; remaining includes active reservations and is floored
at zero when actual expenditure exceeds a limit. A truthful historical overage is
not permission to spend more. Unknown quota has null remaining_units, not an invented
balance. Pricing unknown blocks new paid execution. The service chooses the month
in America/Los_Angeles; caller-supplied month cannot move spending across budgets.
For this P0 interface, paid_executor_enabled must remain false. Enabling a provider
requires a later reviewed contract and verified reservation path.

Cancellation `cancelling` means requested, not stopped. Report cancelled only after
the executor stops without output commitment, or a queued task is atomically cancelled.
A completion/cancel race can truthfully return completed. Recheck cancellation,
source versions, revocation and tombstones transactionally with any derived write.

Local checks cover schema/local invariants, generated-artifact drift and OpenAPI
3.1 standard validation. Database ownership, transaction races, authentication,
providers and device behavior need separate backend/QA evidence.

References: [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html),
[OpenAPI validator documentation](https://openapi-spec-validator.readthedocs.io/en/latest/).
