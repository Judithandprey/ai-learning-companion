# P0 backend

This module implements the shared [HTTP contract](../../packages/contracts/HTTP.md)
with an authoritative PostgreSQL archive, immutable original records, atomic event
ACKs, revisioned notes, local identity gates, budget accounting, and guarded jobs.
Real OAuth, course fetchers, paid executors, media transport and device capture are
disabled or outside this slice. Saving a URL does not fetch its content.

## Environment and commands

From the repository root, use the lead-owned locked dependencies:

```sh
uv sync --frozen --extra backend --group backend-test
uv run --extra backend --group backend-test python -m pytest packages/contracts/tests services/api/tests -q
```

This delivery used the already installed lead `.venv/bin/python` read-only rather
than installing another environment. No dependency files were changed by backend.
[.env.example](.env.example) lists names only. Supply `LC_DATABASE_URL` via trusted
environment injection; do not embed passwords in shell command arguments or logs.
Do not use production data for the PostgreSQL acceptance runner.

```sh
uv run --extra backend --group backend-test python -m services.api.migrations apply
uv run --extra backend --group backend-test python -m services.api.tests.postgres_check
```

The second command requires a separately supplied `LC_TEST_DATABASE_URL` naming
**`lc_p0_test`**, with one explicit loopback or absolute Unix-socket endpoint.
Missing, indirect or nonlocal targets exit **2 / BLOCKED**, not green skip. A
read-only connection confirms the actual database before migration or cleanup;
test connections have bounded statement/lock timeouts. It applies the module
schema and cleans up only its uniquely named synthetic users. It also supervises
three short-lived API processes on ephemeral loopback ports to verify real HTTP
save/restart/readback, replay and identity rejection. No test service remains. See
[PostgreSQL evidence and rollout](../../docs/verification/backend/postgres.md).

## Local API probe

The default `services.api.app:app` has no authentication adapter and returns 503
for protected routes. It never substitutes an in-memory database. Production
authentication requires a later reviewed adapter; local bearer tokens are not OAuth.

For an explicitly local test only, supply `LC_DATABASE_URL`, set
`LC_ENABLE_LOCAL_TEST_AUTH=1`, and provide a fresh random `LC_LOCAL_TEST_TOKEN` with
at least 32 characters via your secret environment mechanism. To load the
project-authored test-only archive, also set `LC_IMPORT_SYNTHETIC_FIXTURE=1`.
The fixture factory uses user `fixture-user`, grants only implemented API scopes,
and expires its test principal after one hour. It does not auto-run migrations,
refresh real credentials, restore revoked authorization or enable providers.

```sh
uv run --extra backend --group backend-test uvicorn services.api.local:create_local_app --factory --host 127.0.0.1 --port 8173
```

Run the manual probe in the foreground and stop with Ctrl-C. The automated runner
owns and stops its separate test processes; it does not leave this manual probe running.
Send `Authorization: Bearer <local test token>` from a trusted local client, never
a course content script. Source/event/note writes require an `Idempotency-Key`.
The owner-generated schema is served at `/openapi.json`. A new source returns
`registered` with `current_version=null`; exact snapshots are a separate route.
Note write receipts say `server_committed` only after the repository exits its
successful transaction. Exact retry returns the original persisted result, even
after later versions; GET obtains the latest version.

## Archive and lifecycle

`Archive.import_fixture()` accepts only synthetic/test-only provenance and verifies
UTF-8 source and artifact SHA-256. Fixture frame bytes and controlled local ink
bytes reside in the canonical database as base64; this is not S3/media ingestion.
`Archive.import_ink()` stores opaque original bytes without interpreting/replacing
them. No real PencilKit compatibility has been tested.

All references resolve in the authenticated user's transaction. HTTP identity,
scope, expiry and authorization generation are checked again under its lock.
Client `received_at` never changes replay equality. Events may arrive out of device
sequence; ACKs identify exact events. A conflicting event ID or sequence, or one
invalid member, rolls back the entire batch. Corrections retain the original
record and cannot attribute a different speaker/source to it.

Notes compare base revisions and retain old revisions. Trusted assistant callers
cannot replace user blocks, ink or the original context. Source deletion erases
associated snapshots, frames, events, notes, derived outputs and cached response
content in one transaction, retaining minimal source/event/note/request tombstones.
Shared blobs still referenced by surviving records are retained. Old jobs cannot
rewrite deleted content; historical uploads never set live capture on.

Worker methods are local deterministic state transitions, not a running queue.
They capture authorization/source generations at enqueue and recheck at begin and
transactional output commit. Queued cancellation can be final immediately;
running cancellation remains `cancelling` until the worker acknowledges a safe
stop. Unknown external outcomes require trusted reconciliation; never infer
nonexecution from timeout. No connector calls or external writes are available.

The server computes its budget month in America/Los_Angeles. Trusted versioned
price/FX configuration supplies rounded-up integer CNY-fen bounds for all units
and allowed attempts. No configured price means no admission. Reservations are
atomic against 100,000 fen; settlement/release are idempotent. Actual overages are
recorded truthfully and block new reservations. Unknown outcomes retain exposure
until a trusted internal reconciliation; no HTTP endpoint can change the ledger.
Subscription balances are unconnected, and paid execution always remains false.

## Internal process capture

`CaptureArchive` implements the released `process_v2` 0.2.0 capture-only records
inside the existing actor transaction. It is an internal integration seam:
there is no `/v2` route, capability advertisement, stream registration API,
attempt resolver, provider job or linked-v1 activation. Unassociated v1 stays as
before. See [capture evidence and boundaries](../../docs/verification/backend/p0-09-capture-evidence.md).

An embedding service must supply authenticated context and an authority resolver
that reads registered stream incarnation, device/session membership, current
authorization generation, source permissions and transmission/stop fences inside
the supplied transaction. A static or request-derived `CaptureAuthority` cannot
establish those facts. Missing resolver fails closed. Tests use explicitly
synthetic registration rows; no production registration format has been invented.

Provisional-session operation/coverage records retain canonical originals and
exact receipt JSON as text within the existing JSONB repository. This preserves
NUL text escapes and numeric representation. Named causal/frame dependencies
must resolve; attempt-scoped records wait for the authoritative relation service.
Artifact metadata can be committed with bytes still pending. Verification requires
owned durable bytes, digest, size and independently stored MIME type; legacy blobs
without that MIME fact remain pending. No blob-upload/codec API is added here.

Source deletion includes capture originals and dependent replay bodies in the
same transaction. Opaque record/slot/blob fences prevent resurrection, while
blobs still referenced by surviving source records are retained. An unrelated
raw descendant remains readable without dereferencing its erased causal parent;
its replay cannot resolve that parent. Stop does not erase authorized originals.

## Migration compatibility and limitations

Migration `0001_documents` adds only `lc_backend` tables/functions and remains
unchanged. Additive `0002_capture_immutability` extends its immutable-kind trigger
without rewriting originals or changing v1 tables. Apply before starting this
revision; reapply is checked by hash. It does not alter another
module's schema. All data for one user is serialized by an actor row lock, including
reads, which favors P0 correctness over throughput. Each operation opens a new
database connection; pooling, fine-grained locks, object storage, scalable query
indexes, production queues, RLS and load tests remain future work. Other tools must
not write directly around the repository's lock/ownership protocol.

For rollback, stop all writers and export/backup original records first. With the
database explicitly selected by `LC_DATABASE_URL`:

```sh
uv run --extra backend --group backend-test python -m services.api.migrations rollback --confirm-erasure
```

Rollback affects the latest applied migration. `0002` takes a table lock and
refuses while any capture originals or opaque fences remain; refusal preserves
data and the migration receipt. Stop capture writers before a downgrade and keep
the deletion-aware archive deployed while capture state exists. Do not erase
originals/tombstones merely to make a downgrade succeed, or run an older archive
that can delete v1 sources without their capture content. Empty-state `0002`
downgrade is supplied but unexecuted. Rolling back `0001` destroys archive tables
and remains unexecuted. The CLI's erasure flag does not override these constraints.

Migration apply/reapply, PostgreSQL transaction races, unsafe `0002` downgrade
refusal, real v1 HTTP restart and internal capture passed the dedicated PostgreSQL
18.6 [acceptance run](../../docs/verification/backend/p0-09-capture-evidence.md).
That is not database-server crash recovery or device sync. Domain/ASGI memory
tests remain evidence for application logic only. G4, real course connectivity,
iPad/Pencil operation and end-to-end device persistence remain untested.
