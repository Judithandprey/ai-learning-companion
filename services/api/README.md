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

## Internal Learning snapshot extraction

`Archive.export_learning_snapshot(user_id, source_ids)` returns a detached
in-memory dictionary with `sources`, `frames`, `observations` (complete existing
v0.1 record lists) and `artifacts` (`artifact_id` to immutable bytes). Pass an
explicit nonempty list/tuple of distinct source IDs and an Archive configured
with the authenticated caller's `authorization_guard`. The entire read, current
source checks and reference/hash validation run under one existing actor lock.
No notes, help records or capture-v2 families are exposed; no HTTP route is added.

All stored requested versions and raw correction branches remain; there is no
latest/recent-N filter, translation, invented gap or timestamp reordering. Missing
or inconsistent references/bytes reject the complete extraction with 503
`unavailable`. Requested missing/foreign/deleted sources return the existing
404 `source_not_found`; revoked sources/auth retain existing 403 errors. A source
that is only a URL registration returns 404 `reference_not_found`, not fetched
content. Empty/duplicate/malformed selectors return 422 `invalid_contract`.

This is a snapshot of current authorization, not a durable access grant. Reacquire
through the guarded archive before later use; detached copies cannot be recalled
after revocation/deletion. Learning's reviewed `ArchiveSnapshot` consumption is a
separate pending integration. Its current synthetic FixtureArchive has stronger
correction-clock/missing-frame conventions that must not rewrite valid retained
legacy observations. See [snapshot evidence](../../docs/verification/backend/p0-07-learning-snapshot.md).

## Internal process capture

`CaptureArchive` implements the released `process_v2` 0.2.0 capture-only records
inside the existing actor transaction. It is an internal integration seam:
there is no `/v2` route, capability advertisement, public stream registration API,
attempt resolver, provider job or linked-v1 activation. Unassociated v1 stays as
before. See [capture evidence and boundaries](../../docs/verification/backend/p0-09-capture-evidence.md).

An embedding service must supply authenticated context and an authority resolver
that reads registered stream incarnation, device/session membership, current
authorization generation, source permissions and transmission/stop fences inside
the supplied transaction. A static or request-derived `CaptureAuthority` cannot
establish those facts. Missing resolver fails closed. The original capture tests
use synthetic registration rows; the internal control registry below now supplies
persisted resolution against the released separate 0.2.1 control contract.

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

## Internal process controls

`services.api.control.ControlRegistry` adds persisted registration, read and
restrictive commands from `process_control` 0.2.1. Supply authenticated frozen
sets of scopes/capabilities and a **callable current-caller authorization guard**.
The guard must check caller expiry, token revocation and pinned account generation
inside the transaction; the registry separately checks current account state.
No default guard, token verifier, HTTP endpoint or public grant issuer is supplied.

Trusted service entries establish membership with `set_membership(..., active=,
expected_revision=)` and issue one-use `authorize_start(user_id, registration,
producer_id=)` decisions. Two existing device/session IDs alone are insufficient.
An actual authorized start decision must precede that internal call. The trusted
adapter owns the stable producer ID; a page cannot invent another ID to disguise
a restart. Independent producers may share a device/session. Each grant pins the
exact new stream ID, complete registration and original account/membership
generations. Registration consumes it atomically. Invalidated/consumed IDs cannot
be issued again; existing capture bindings/slots also reserve old identities.

`register`, `read` and `command` use the existing actor transaction. Command replay
checks fresh access before idempotency and returns the current state before CAS;
fresh stale commands conflict. Account-generation changes and membership changes
close affected old bindings and invalidate pending starts. A stream's stop or
withdrawal invalidates only its producer's pending starts. Restart requires the
actual closed predecessor, a new decision/ID and the contractual unknown gap;
there is no old-ID resume. Control records contain no answer bytes or hashes.

For a finite stop/seal, `stop_fact_resolver(tx, user_id, stream_id)` must read an
independently persisted producer pre-stop sequence fact, using trusted ownership
and incarnation attribution. It must be read-only and must not derive the fact
from this command, a timestamp or the server's received maximum. Missing facts
leave unknown stops blocked. The committed floor comes from durable same-stream
capture slots, including after original deletion; zero is valid only for an empty
committed stream plus independent proof that no sequence was ever assigned.
Unknown stop and withdrawal do not depend on available producer evidence.

`registry.capture` reuses unchanged 0.2.0 ingestion and resolves all current owned
source versions, generation, membership and stop fences through that same
transaction and commit. If a trusted stop fact arrives before the control command,
live ingestion is denied while control synchronization remains unresolved. `read`
reports the last committed server control state, not proof a device is capturing.
A known stopped boundary continues to require its trusted fact; withdrawal denies
both transmission modes. Existing authorized historical reads remain distinct.

Typed upload and artifact-sharing rules remain lead-owned dependencies. This new
control-backed ingestion rejects artifact-reference batches as `dependency_missing`;
the earlier standalone capture seam retains its bounded synthetic test behavior.
No ownership of independent ink follows from a pending reference. This segment
does not optimize away validation or resolve the existing large-batch lock cost.

The registry uses additional document kinds in the existing schema, so no migration
or backfill is needed. Keep `0001`/`0002` unchanged. Feature rollback disables new
control/capture writers and retains all control rows, grants, lineage, originals
and opaque fences; do not delete state or downgrade the database to enable reuse.
Do not deploy a writer that ignores these controls. See
[control verification](../../docs/verification/backend/p0-09-control-registry.md)
for focused portable and real PostgreSQL evidence and the producer/device limits.

## Migration compatibility and limitations

For raw frames, first see the internal-only integration and additive migration
below. The original `0001` and `0002` files remain unchanged.

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

## Internal raw PNG metadata adoption

The released `capture_frame` 0.2.5 descriptor has three explicit internal entry
points, using the existing authenticated actor archive and registered controls:

```python
registry.ingest_raw_frames(user_id, batch, frames, idempotency_key)
reader.read_raw(record_ids, max_metadata_bytes=4 * 1024 * 1024)
resolver.resolve_raw(detached_frame, max_bytes=per_image_limit)
```

`registry` is `ControlRegistry`; `reader` and `resolver` are
`AuthorizedProcessContextReader` and `AuthorizedImageResolver` configured with
the same actor and a callable current-caller guard. Typed PNG originals and the
shared-display source must already exist through their authorized paths. These
internal methods add no registration, token, bootstrap or default activation.
Existing 0.2.4 HTTP frame ingress still rejects raw descriptors; the separate
explicit 0.2.6 opt-in is described below.

Ingestion accepts a complete 0.2.0 batch and 1–100 exactly named raw descriptors,
with at most 4 MiB of canonical UTF-8 request metadata. The actor-scoped replay
namespace is `internal_raw_capture_frames`. Equality binds the complete batch
and a frame-ID map: changing frame-array order alone is equivalent; changing
batch record order, timing or orientation conflicts. Stored originals, stream
bindings, slots, artifact pins and receipts fence missing-data reconstruction,
including through descendants and the legacy writer. History uploads never
restart capture. Current authorization is checked before and after the operation.

`read_raw` returns the existing `{batch, sources, frames}` shape, in requested
record order, for 1–100 distinct records within one incarnation and the metadata
ceiling. It checks retained source and typed original bindings under one actor
transaction. It does not decode or return blob bytes; the current document store
still loads the artifact row. Mixed legacy/raw selections are unsupported and
fail explicitly; no records are silently dropped or converted.

`resolve_raw` separately rechecks current permission and the exact retained
descriptor, source/incarnation, original binding, pins, tombstones, canonical
base64, byte limit, size, digest and PNG signature. Success returns
`{status: "available", frame, data, media_type: "image/png"}` with unchanged raw
metadata and bytes. There is no pixel rotation, PNG geometry/codec validation,
course-time inference, provider call or presentation permission. Unknown capture
UTC, callback estimates, sample PTS, independent buffer sequence and unapplied
mirrored orientation stay distinct. Cancellation propagates; ordinary failures
use the existing sanitized status vocabulary.

Apply additive `0003_raw_capture_frame` before enabling any of these writers.
It adds raw-document immutability, a unique frame identity across `frame` and
`raw_capture_frame`, and a common tombstone guard. Deletion removes both kinds
and their owned bytes even when process records are missing; unrelated legacy
exports are unchanged. Actor locks remain the supported writer protocol.

The existing dedicated PostgreSQL runner has a bounded option:

```sh
# Inject LC_TEST_DATABASE_URL securely; it must select local lc_p0_test.
uv run --extra backend --group backend-test python -m services.api.tests.postgres_check --raw-frames-only
```

This option checks migrations, exact readback, immutable and collision SQL guards,
atomic rollback, missing-witness refusal and deletion using one unique actor. It
does not start an HTTP server or rerun the old restart campaign. It cleans up only
that actor and never logs the DSN. Once migration 0003 is installed, other runners
must use a revision that knows 0003; old migration manifests refuse unknown state.

Feature rollback disables the new writer/consumer wiring while retaining data.
Database downgrade requires stopped writers and the existing explicit rollback
CLI. Migration 0003 takes a table lock and **refuses while any raw frame or shared
frame tombstone remains**. Shared tombstones do not identify their former kind;
retain the protection rather than deleting evidence to satisfy rollback. Empty
state downgrade is supplied but has not been executed on the dedicated database.
See [raw-frame evidence](../../docs/verification/backend/p0-raw-frame-adoption.md)
for actual checks and remaining integration/device/provider limits.

## Opt-in raw HTTP transport 0.2.6

The existing `create_ingress_app` factory adds exactly one raw route only when its
trusted embedding explicitly passes `enable_raw_ingress=True`. The default is
`False`; `services.api.app:app`, local factories, preview, existing five 0.2.4 routes
and their response versions remain unchanged. No environment switch, listener,
producer start, token or trusted grant is created by this option.

```python
from services.api.ingress_app import create_ingress_app

app = create_ingress_app(
    store, authenticator,
    capabilities=frozenset({"process.raw-ingress.v0.2.6", "process.capture.v0.2"}),
    stop_fact_resolver=trusted_stop_fact_resolver,
    enable_raw_ingress=True,
)
```

All constructor objects above must come from the current trusted embedding.
`POST /v2/process/raw-frames:batch` requires current Bearer authentication, scope
`process:capture`, both capabilities above, and one valid `Idempotency-Key`.
These capabilities do not grant registration, original uploads, control or legacy
ingress: those still require their own existing scopes/capabilities. Sources,
stream membership, grants and typed PNG/ink originals must already exist.

The closed request is `{contract_version: "0.2.6", batch, frames}` with unchanged
0.2.0 ProcessBatch and 0.2.5 raw descriptors. Success is the unchanged 0.2.0 ACK,
with every referenced original verified and all writes committed. Errors on this
explicit route use the closed 0.2.6 `RawIngressError`. Unknown exceptions never
expose original content. Cancellation cannot emit an accepted ACK or commit a
partial batch; a later retry still needs fresh permission and retained evidence.

Strict JSON, header, query and version precedence follows the released
[raw ingress contract](../../packages/contracts/raw_capture_ingress/README.md).
Raw transport bytes and canonical ordered metadata are bounded separately to
4 MiB. Oversized data is rejected, never truncated. The internal frame-ID-map
size/equality convention does not replace these HTTP rules.

HTTP replay uses `(actor, POST, /v2/process/raw-frames:batch, Idempotency-Key)` in
the same existing actor transaction as raw frames, records and receipts. It hashes
the complete canonical wrapper, including all array order. Changed frame order
at the same HTTP key conflicts even though the internal raw-map method permits
that reorder. Exact HTTP replay rechecks authorization, Stop/withdraw/delete,
source and ancestor inventories, descriptors and every original byte before
returning the original verified ACK. There is no outer check-then-call cache.

Migration 0003 from the preceding raw archive delivery remains required; this
adapter adds no migration. The opt-in OpenAPI adds the new path and definitions
to the existing schema without modifying old paths. Integration must explicitly
compose this factory only after trusted bootstrap is available. See
[HTTP evidence](../../docs/verification/backend/p0-raw-ingress-http.md).
No native network, device, real AI, freshness, ink overlay or core-gate pass is
established by this in-process adapter.

## Explicit single-origin capture lifecycle

Trusted embedding can now construct one ASGI callable for the existing control
and ingress paths:

```python
from services.api.capture_app import create_capture_app

app = create_capture_app(
    store, authenticator,
    capabilities=trusted_capabilities,
    stop_fact_resolver=trusted_stop_fact_resolver,
    clock=trusted_clock,
    enable_raw_ingress=True,
)
```

All objects and capabilities come from the embedding; construction does not read
or initialize authority, issue tokens/start grants, create membership or sources,
or resume capture. The raw flag defaults to `False`. Existing default, local,
preview, control-only and ingress-only applications are unchanged. This factory
does not start a listener or provide TLS; the native client's HTTPS origin and
trusted provisioning remain deployment dependencies.

Using the original root-level paths on that one origin, an authorized client can
register a stream (0.2.1), register its display source (0.2.4 request / 0.2.3
response), PUT typed originals (0.2.2), submit a raw batch (0.2.6 request / 0.2.0
ACK), Stop the stream (0.2.1), and read its current state and retained originals.
Each operation still requires its own scopes/capabilities; possession of one
family's capability grants no others. Fresh membership and an exact one-use start
decision must already be provisioned by an independently authorized trusted path.
No public bootstrap/grant route is supplied. Stop preserves authorized history,
refuses late live capture/upload replay, and never authorizes resume on the old ID.

Native Starlette routes delegate to the unchanged child ASGI applications, keeping
their current authorization, errors, size limits, transactions and receipt keys.
The wrapper adds no transaction or authentication cache. Known paths keep their
own 0.2.1 / 0.2.4 / 0.2.6 / 0.2.8 / 0.2.10 closed errors; unowned paths use the existing 0.2.4
closed refusal. Slash redirects remain disabled.

There is deliberately no combined OpenAPI endpoint: `/openapi.json` returns a
closed 404 for all methods. Released control and ingress schemas use different
definitions for some identically named parameters/security components; this
factory neither overwrites nor renames them. Use the released per-family contract
files. The independent factories retain their existing OpenAPI endpoints.

Ingress children select their closed error version using the effective router
path, preserving it under ASGI mounts. In-process tests cover root, single and
nested mounts, including the Windows route through this composed factory. These
checks do not establish a deployed proxy, TLS configuration or native network path.

The [same-origin verification](../../docs/verification/backend/p0-capture-app.md)
records actual ASGI lifecycle, permission, cancellation and compatibility checks
using synthetic provisioning and MemoryStore. No native network, real database,
device capture, real AI or complete classroom-flow acceptance is claimed.

## Opt-in Windows HTTP transport 0.2.10

`create_ingress_app`, `create_capture_app` and `create_local_capture_runtime` accept
the independent boolean `enable_windows_ingress=False`. An explicit `True` adds
`POST /v2/process/windows-frames:batch`; it does not activate a listener or change
the default application, local preview, existing route versions or other flags.

```python
from services.api.capture_app import create_capture_app

app = create_capture_app(
    store, authenticator,
    capabilities=trusted_capabilities,
    stop_fact_resolver=trusted_stop_fact_resolver,
    enable_windows_ingress=True,
)
```

The Windows route requires current Bearer authentication, `process:capture`,
`process.capture.v0.2` and `process.windows-ingress.v0.2.10`, plus existing current
source/device/session/control authority and trusted `desktop_pixels` admission.
The local runtime requires that producer profile explicitly before provisioning
anything; its original fresh-consent and exact registration rules still apply.
Adding the capability to an allowlist grants nothing. Registration, original
PUT/GET and control retain their separate existing scopes/capabilities.

Requests are the released `{contract_version: "0.2.10", batch, frames}` envelope,
using ProcessBatch 0.2.0 and exact WindowsFrame 0.2.9. Dual PNGs, valid shared-byte
aliases, raw-only samples and restricted frameless coverage keep their existing
meaning. Editable originals remain separate. Success is ProcessBatchAck 0.2.0;
closed route errors use WindowsIngressError 0.2.10. The released
[Windows HTTP contract](../../packages/contracts/windows_capture_ingress/README.md)
defines authentication/header/media/JSON/version precedence and both 4 MiB
metadata bounds; original files retain the separate 32 MiB limit.

HTTP replay uses actor + POST + full Windows route + Idempotency-Key. The whole
ordered envelope participates, including all array order; only JSON member order
is irrelevant. The canonical hash and ACK commit with original descriptors,
records, slots and reference pins in the same actor transaction. Internal
`ingest_windows_frames` map-order replay keeps its separate namespace. No wrapper
cache bypasses current admission, retained original bytes, source access, Stop,
withdrawal, generation, deletion or missing-history witnesses. A Windows HTTP
gap-only receipt also prevents loss of both producer-profile markers from
downgrading into generic or older cached capture paths.

The corrected cross-frame image-identity scan still applies before ACK and in
`read_windows` / `resolve_windows`. It compares producer-declared facts, not actual
decoded RGBA truth. Each call scans this actor's retained frame metadata; that
cost is separate from returned metadata limits. Learning validates supported PNG
structure/dimensions and separately retains raw/composed roles and uncertainty.

The ingress-only OpenAPI exposes the Windows path/definitions only when enabled,
including its own ordered replay description. The composed factory retains its
closed combined-schema endpoint. Feature rollback disables the explicit flag;
keep archived originals, receipt identities and tombstones. No migration is added.
See [Windows HTTP evidence](../../docs/verification/backend/windows-http-ingress.md)
for actual portable checks and remaining device/provider/durability limits.

## Opt-in macOS HTTP transport 0.2.12

The same three factories accept the independent boolean
`enable_macos_ingress=False`. Explicitly enable it in a trusted embedding to add
`POST /v2/process/macos-frames:batch`, with current `process:capture`,
`process.capture.v0.2` and `process.macos-ingress.v0.2.12` authority. The local
runtime also requires explicit `desktop_pixels` producer admission before any
provisioning. Default apps and the local preview keep this route disabled; the
flag neither starts a listener nor grants capture consent or other capabilities.

The released [macOS ingress contract](../../packages/contracts/macos_capture_ingress/README.md)
defines the exact 0.2.12 envelope, 0.2.11 retained frame, strict transport and
error precedence. Original PUT/GET and registration keep their separate 0.2.4
authorization. Every distinct raw/composed PNG and separately referenced ink
original is checked against stored typed bytes and source identity. The existing
actor transaction commits the ordered HTTP request hash, ACK, descriptors,
records, sequence slots and reference pins together. Internal
`ingest_macos_frames` retains its separate replay namespace.

Current authority, Stop, revocation, deletion, missing-history witnesses and
retained bytes are checked before cached success. Historical uploads retain
their sealed ceilings and cannot restart capture. A valid Mac frame or gap-only
HTTP receipt witnesses pixel-producer use even if producer markers are lost;
older routes cannot silently admit that producer as structured input. Exact
receipt erasures keep the existing `{key, deleted: true}` semantics.

`AuthorizedProcessContextReader.read_macos` returns `{batch, sources, frames}`;
`AuthorizedImageResolver.resolve_macos(frame, image_role="raw" | "composed",
max_bytes=...)` returns the full exact descriptor and selected role with available
PNG bytes. Mac 0.2.11 and Windows 0.2.9 share a storage kind but dispatch by exact
version. All distinct images are reauthorized before returning either role.
Cross-batch archive/hash/native-session-file contradictions fail closed. The
consistency check scans this actor's retained metadata, separately from returned
metadata limits; no new index or storage layer is added.

Pass `reader.read_macos` and `images.resolve_macos` as the existing Learning
context reader and optional `macos_resolver`. Learning decodes PNG structure and
dimensions and repeats the authorized selection read before returning context.
Raw, composed, refused and unknown outcomes, separate editable ink references,
limitations and unknown chronology remain distinct. Native paths, revision
labels and available PNGs do not prove an editable ink save or observed reasoning.

Rollback disables the explicit flag while preserving originals, receipts and
tombstones. No migration or dependency change is required. See
[macOS HTTP evidence](../../docs/verification/backend/macos-http-ingress.md) for
portable HTTP/archive/Learning checks and the remaining native, database and
provider acceptance boundaries.
