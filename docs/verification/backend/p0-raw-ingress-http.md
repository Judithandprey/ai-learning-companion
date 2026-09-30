# Opt-in raw capture HTTP adapter

Date: 2026-09-30 UTC. Owner: Backend, existing bounded P0-09 continuation.
Assigned integrated baseline: `0bc1571c40520970177343666badd9c4f2e872d4`.
Preserving worktree merge: `094620458f491b5356f5708eab6d860b9e7999c7`.
Delivery is the commit containing this evidence. Lead owns final integration.

## Observable outcome

The existing trusted ASGI factory can explicitly expose
`POST /v2/process/raw-frames:batch` with `enable_raw_ingress=True`. The default
remains false. Its closed request is RawFrameBatchRequest 0.2.6 with unchanged
ProcessBatch 0.2.0 and raw descriptors 0.2.5; success is verified-only ACK 0.2.0.
Errors use RawIngressError 0.2.6. Existing five ingress routes, their versions,
default application and local/preview factories remain unchanged.

The route requires current Bearer authentication, `process:capture` scope, and
both `process.raw-ingress.v0.2.6` and `process.capture.v0.2` capabilities. The new
capability does not grant old ingress, registration, upload or control rights.
Owned sources, membership, trusted producer grants and typed originals must
already exist. [Factory example and operation](../../../services/api/README.md#opt-in-raw-http-transport-026).

The complete ordered wrapper and its receipt join the existing actor transaction
through `ControlRegistry.ingest_raw_frame_request`. Replay is keyed by actor,
method, full route and Idempotency-Key. Object key order is irrelevant; changing
any array order or raw field at the same key conflicts. Internal raw-map replay
retains its separate namespace and existing equality rules. Every original is
verified from retained bytes before success, including replay; authorization,
Stop/withdrawal/deletion, source/ancestor inventories and lost-identity witnesses
remain enforced. There is no outer replay cache or second original-record store.

Strict JSON, headers, versions and error precedence use the released contract.
Both raw request bytes and canonical ordered metadata have a 4,194,304-byte
ceiling. The HTTP ceiling is not the differently serialized internal frame-ID-map
ceiling. Attempt authority remains unresolved (`dependency_missing`), and frameless
shared-display records remain refused (`unsupported_source`). No fake frame,
timestamp, orientation conversion or substituted original is introduced.

Affected original/English source clauses and decisions were refreshed at the
assigned baseline: R07/R29/R30/R35/R36/R46/R51/R52/R58/R59,
A12/A14/A16/A30/A31/A44, the complete §7.1 core flow, AUDIO-08/AUDIO-14 and
source-time verification. Unchanged source/translation pairs retained their
previously verified manifest hashes. PONYTAIL LITE reuses one factory, the existing
capture engine and actor transaction; no dependency, database kind or migration
is added. Existing migration 0003 remains the raw archive prerequisite.

## Executed verification

The existing locked lead Python environment was used read-only. Final command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_raw_ingress_http.py \
  services/api/tests/test_raw_ingress_http_limits.py \
  services/api/tests/test_ingress_http.py \
  services/api/tests/test_raw_frame_ingress.py \
  services/api/tests/test_control_http.py
```

Actual result: **352 passed in 22.54s**, exit 0. This includes 71 new cases and
281 existing regressions; earlier overlapping runs are not additional coverage.
Tests issue actual HTTP requests through HTTPX ASGITransport into the handlers
and use retained synthetic PNG/ink originals in MemoryStore, without a listener.

- Exact raw metadata, original bytes and ACK roundtrip; fresh factory over the
  same store returns the same replay. Old original GET returns unchanged data.
- Full ordered request equality, separate internal/HTTP keys, old version success
  and refusal behavior, explicit opt-in and independent capability requirements.
- Bearer/scope/owner boundaries before body consumption; expiry/generation changes
  before and inside the actor transaction, final authorization checks, stopped
  historical boundaries, source revocation, withdrawal and deletion.
- Unsupported outer/batch/individual frame versions, malformed/duplicate/nonfinite
  or invalid-UTF-8 JSON, representative strict header/query failures, early
  oversized-read termination and exact raw-byte boundary with whitespace.
- A valid 50-record request with exactly 4,194,304 canonical bytes succeeds and
  retains all records/frames even though the internal map serialization exceeds
  its separate ceiling. Internal ingestion correctly refuses that map unchanged.
- Lost frames, records, slots, bindings and pins; corrupt descriptors, PNG bytes,
  ink bindings, receipt JSON and dependency inventories; no cache repair or
  new-key resurrection. Legacy/raw frame collisions return the raw contract error.
- Ordinary failures and cancellation injected at authorization, raw-frame write,
  replay write and transaction commit cannot return ACK or leave partial state.
  The unchanged request can succeed on a fresh retry after the failure is removed.

The combined opt-in OpenAPI passed `openapi_spec_validator.validate`. Separate
assertions confirmed the default schema equals released 0.2.4, the added path
equals released 0.2.6, and overlapping schema definitions are identical.
`git diff --check` passed. Shared contracts, requirements, root manifests,
dependency files and all migrations are unchanged.

### Review findings and corrected expectations

Independent static review identified two compatibility risks in the first draft:
mapping `frame_identity_conflict` globally and propagating Future cancellation
globally would change old 0.2.4 failure behavior. Both are now scoped to the raw
route; tests explicitly retain legacy sanitized 503 behavior with raw opt-in both
enabled and disabled. The independent final review found no remaining raw
envelope/ACK transaction blocker.

One initial test expected `capture_stopped` for an old original-upload operation
after Stop. That existing operation returns `forbidden`; its expectation was
corrected without changing production authorization or permitting the upload.
Cancellation propagates from the raw route; ASGITransport with exception raising
disabled may synthesize a 500 response. Such a transport response is not an ACK
or a claimed closed JSON error. Rollback and fresh retry are asserted separately.

## Remaining evidence and next owner

This task ran no database operation or restart. The earlier dedicated PostgreSQL
raw archive evidence remains in [raw-frame adoption](p0-raw-frame-adoption.md);
MemoryStore HTTP checks are not a new PostgreSQL or crash-recovery pass. No preview
runtime/data, Paperclip, native producer, account or provider was touched.

Lead next reviews/integrates this commit and composes the actual native request
fixtures with this explicit adapter and separately authorized bootstrap. Native
network transport, current-device execution, real AI receipt, continuous full
visible-screen coverage, original-screen selection/ink, freshness and Notability
import remain unverified here. Both §7.1 core gates stay open; this bounded adapter
does not establish the full navigation/write/erase/undo/redo/ask/save/reopen/edit
experience or P1 acceptance.
