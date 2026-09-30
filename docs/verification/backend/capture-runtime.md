# Trusted local capture runtime

Task: configured lead `handoff_c6361466fc44f7a139ccdb33db82250c`, existing
P0-04/09 with bounded P0-08 delegation. Adopted baseline
`07e669154e6eae9944368c210c3f1f3d309aa258` in backend merge
`9fac156a7688c85f65d5987dcebcfc92b8796028`. All four source/English manifest
pairs match their `d2603fd1d3b728a2756d0869d40bbf169cb2de0c` content hashes.
Scope: R07/R27/R35/R36/R51/R52, A12/A14/A16/A30/A31 and §3.9/7.1.

## Observable result and embedding boundary

`services.api.capture_runtime.create_local_capture_runtime` now returns an
in-process composed `.app`, `.principal`, detached `.registration`, stable
`.producer_id`, `.start_status` and `.current_state`. A trusted Windows/macOS
host can initialize its explicitly consented binding, POST the existing stream
registration, read current state, and use the existing display/original routes.
No server, process, account connection, migration or producer is launched.
The default application and local preview remain unchanged.

All parameters except the conservative gates/callback defaults are required:

- `store`: an existing, migrated `PostgresStore` for durable use, or an explicitly
  chosen `MemoryStore` for tests. There is no environment lookup or memory fallback.
- Stable `user_id`, `device_id`, `session_id`, `producer_id` and exact released
  `registration`. Device/session must match the registration; its original
  authorization generation and membership revision are never refreshed silently.
- Caller-supplied secret `token` (32–4096 bearer-compatible characters) and explicit
  future, timezone-aware `expires_at`. Generate a random token in the trusted host;
  no real token or connection details belong in source, logs or saved configuration.
- Explicit frozen `scopes` limited to `process:control`, `process:capture`,
  `sources:read`, `sources:write`, and `capabilities` limited to released
  `process.control.v0.2.1`, `process.capture.v0.2`, `process.ingress.v0.2.4`,
  `process.raw-ingress.v0.2.6`. Control authority is necessary; narrower callers
  receive the existing endpoint refusals. Raw ingress additionally requires its
  capability/capture scope and `enable_raw_ingress=True`; default is OFF.
- Optional trusted `stop_fact_resolver` supplies independently obtained producer
  stop facts through the existing registry protocol. A proposed HTTP stop boundary
  alone is not such evidence. `clock` supports deterministic verification.

Only after actual fresh, scoped consent may the host pass `fresh_consent=True`.
The default `False` only reopens an exact retained grant; it cannot enroll or
mint one. A stored auto-start preference is not fresh consent. This is a callable
trust boundary, **not** a public provisioning endpoint or proof that OS permission
was obtained. Keep it outside course content. The host must serve locally, keep
tokens private, and perform actual platform permission/producer lifecycle work.

The factory grants but does not POST/register or start capture. The host retains
the same registration and HTTP Idempotency-Key through uncertain outcomes, posts
`/v2/process/streams`, then reads `/v2/process/streams/{stream_id}`. Factory
`current_state` is a transaction-time snapshot, never a perpetual live claim.
After Stop/withdraw, the same incarnation remains stopped/withdrawn. A new start
requires fresh consent, a new stream ID and the existing predecessor/unknown-gap
relationship. Restart does not auto-resume a stopped producer.

## Persistence and lifecycle decisions

New ownership, membership and one exact `control_start` grant share the existing
actor transaction. Reuse existing `Principal`, `LocalTestAuthenticator`,
`ControlRegistry`, stores and `create_capture_app`; no new identity/archive,
schema, dependency, migration or setup-receipt table was added.

The small `ControlRegistry._authorize_start` transaction seam removes nested
transactions without duplicating start policy. `Transaction.is_empty()` checks
all actor documents before first authorization creation: a surviving archive or
tombstone cannot masquerade as a pristine user after authorization loss. Existing
control/membership/binding witnesses prevent repair of missing used foundations.
Missing/corrupt retained state is an error; this is not an arbitrary database
tamper-repair service. Fresh consent may enroll a genuinely new second device;
the first device's grant and state remain unchanged.

Exact pending retries reuse their grant. Consumed retries return the actual
current stream state, checking owner/device/session/stream and generation pins
against the original decision. Changed registrations/producers, stale pins,
invalidated grants and revoked/deleted foundations refuse. HTTP control/capture
also now rejects revoked device/session rows and deleted/revoked memberships;
restarting is not necessary for these refusals. Tokens/expiry remain only in
the in-process authenticator and never enter store documents. This local adapter
is not production OAuth; independently constructed hosts must separately expire
or revoke their old in-memory tokens (persisted account revocation is shared).

## Verification

Focused callable/ASGI tests:
`python -m pytest -q -p no:cacheprovider services/api/tests/test_capture_runtime.py`
— **65 passed in 1.10s**, using explicit synthetic consent, original PNG/ink bytes,
MemoryStore and in-process ASGI requests. The target store starts pristine; fixture
construction happens in a separate store. Checks include actual registration,
current-state/display/original/raw receipt operations and readback, independent
devices, lost commit response, registration retry, concurrent starts, rollback,
stopped/withdrawn preservation, old/foreign pins and retained-source loss fences,
current token/account/device/session/membership expiry/revocation/deletion checks,
and configuration refusal before writes. This is not PostgreSQL evidence.

Existing control, HTTP control and composed app regression:
`python -m pytest -q services/api/tests/test_control.py services/api/tests/test_control_http.py services/api/tests/test_capture_app.py`
— **166 passed**. All commands use the existing locked repository `.venv/bin/python`.

Storage, display-source and both ingress families:
`python -m pytest -q services/api/tests/test_storage.py services/api/tests/test_display_sources.py services/api/tests/test_ingress_http.py services/api/tests/test_raw_ingress_http.py`
— **243 passed**. These plus the focused runtime tests exercise changed lifecycle
checks and the reused transport; no unrelated full suite was repeated.

Dedicated real PostgreSQL verification:
`docs/verification/backend/capture-runtime-postgres-check.py` reuses the existing
runner's `dedicated_test_dsn`, `verify_test_database`, exact-actor `cleanup` and
canonical test helpers. With the private operator handoff injected only into
`LC_TEST_DATABASE_URL`, execute from the worktree using the locked Python:

```python
import runpy
runpy.run_path("docs/verification/backend/capture-runtime-postgres-check.py", run_name="__main__")
```

**PASS, six focused groups, PostgreSQL 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1).**
All five generated synthetic actors were cleaned. The groups checked actor
emptiness/atomic bootstrap; actual ASGI registration/display/PNG/ink readback
and persisted Stop/revocation; concurrent exact setup through separate connections;
successful commit with lost response; retained arbitrary facts with missing
authorization; and full rollback before an explicit fresh-consent retry. Reopens
use fresh PostgresStore instances/connections, not a restarted API or database
process. No migration, listener or existing actor reset was performed.

Approval history is retained: the initial sandbox attempt failed with
`OperationalError` during read-only database validation (exit 2), before mutations.
An automatic exact-command review then rejected the check as outside the older
archive-snapshot task and cited possible residual synthetic data. No workaround
was attempted. The actual current native runtime assignment was re-read (snapshot
501, the task above), including its explicit conditional `lc_p0_test` allowance.
The identical command was submitted normally with the prior denial and recovered
task evidence disclosed; review allowed execution, all six groups passed (exit 0),
and exact-actor cleanup succeeded. Sandbox/approval settings stayed unchanged.

Independent static review found and verified the consumed-state binding equality
fix above. `git diff --check` passed. No preview database or ports, real desktop,
paid provider, external login, persistent listener or account writes were used.

## Remaining acceptance and next owner

Lead independently reviews auth/lifecycle and releases this exact local embedding
boundary to Windows and macOS. The host must retain stable identities, obtain
real consent, supply actual producer stop evidence, protect/rotate local tokens,
and use its own loopback serving lifecycle. ReplayKit-specific raw metadata is
not silently declared valid desktop metadata; lead still owns that compatibility
mapping. Neither actual desktop is connected by this callable alone.

Both §7.1 gates, actual Windows/macOS capture/input/audio and provider receipt,
editable ink and real Notability import remain separately unaccepted. Interactive
Mac access remains unconfirmed and the product provider remains disabled. This
does not pass full P0/P1, deferred mobile goals or P1–P4 desktop completion.
