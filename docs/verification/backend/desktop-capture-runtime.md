# Desktop 0.2.8 local runtime continuation

Lead assignment `handoff_18544947cf23fed4aac131855f6e268b` continues existing
P0-08/P0-09. Published baseline `21b51e1d89ede65f6c91aac6e08febd95a34020b` merged
normally at `d6fd0be07b8bc135fe6897540f2239d83506399c`. Three conflicts were incoming
`1c5eea2` source versus completed `0e71721` HTTP/gap additions. Exact comparisons
proved those incoming files matched `1c5eea2`; the resolutions preserved our
`0e71721` files byte-for-byte and retained the other incoming lead changes.
No independent work was reset. Product requirements/role/workflow were unchanged.

## Observable callable behavior

The existing `create_local_capture_runtime` now accepts the strict boolean
`enable_desktop_ingress=False`. A trusted caller must independently supply all of
`process.desktop-ingress.v0.2.8`, `process.capture.v0.2` and `process:capture` before
setting it to true. Invalid flags or missing authority fail before opening a
store transaction. Control permission remains required for the runtime; separate
legacy registration/original permissions remain necessary for those operations.
The flag passes through the existing composed app. Merely declaring a capability
does not enable the route, raw ingress or a producer.

Reuse the complete argument/consent/identity/token instructions in
[capture-runtime.md](capture-runtime.md), adding this explicit gate and capability
for desktop ingestion. The returned app supports the released framed/gap 0.2.8
HTTP path only when enabled. It retains the same source/original archive, stable
supplied identities, generation/membership pins, original start grant and
registration replay. Exact factory recreation reconciles pending/consumed grants;
it does not mint fresh consent or resume stopped capture. Current source/account/
membership/token and Stop/withdraw checks continue to govern HTTP retries.

No foundation, grant, principal or storage behavior was rewritten. No token is
read from the environment, generated, logged or stored in archive documents.
Tokens remain caller-supplied and ephemeral; independently constructed hosts
retain the previously documented responsibility to expire/revoke their older
in-memory tokens. Synthetic tests do not prove actual OS consent.

## Scoped inherited mount-path correction

The raw response selector used the external URL path while the desktop selector
used Starlette's routed path. Consequently, mounting the app at `/capture` or a
nested prefix selected legacy 0.2.4 errors for the raw 0.2.6 route and could swallow
`FutureCancelledError` in the legacy error branch.

The focused pre-fix suite reproduced **14 failures / 28 passes in 1.30s**. Failures
were mounted/nested raw auth/JSON/version/shape/method/unknown-service error
versions and application cancellation (`DID NOT RAISE`). Root raw and all desktop
mount variants passed. `response_contract` now resolves the routed path once and
uses it for both opt-in families. Status precedence, error schemas and route
activation are unchanged. There is no general routing/auth audit in this change.

## Verification and limits

The target runtime test store starts pristine, while request fixture construction
happens in a different store.
Tests use synthetic fresh consent and native metadata, project-authored PNG/ink,
the real local factory and ASGI handlers, and the existing MemoryStore. Runtime
recreation uses the same store; this is not process restart or PostgreSQL evidence.

The previous 65 runtime tests passed in 0.98s with the existing locked
`repo/.venv/bin/python -m pytest -q services/api/tests/test_capture_runtime.py`.
The new desktop runtime suite passed **29 tests in 1.09s**:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_desktop_capture_runtime.py
```

It covers pristine consent and pending registration, actual display/PNG/editable
ink ingestion, framed and first-gap ACKs, same-store recreation with token rotation,
exact retries, current Stop/withdraw/revocation/expiry, immutable source-loss
witnesses, stale generation/membership pins, independent default-off flags and
required authority before mutation. Desktop activation cannot expand original
upload permission. Tokens are absent from persisted documents and runtime repr.

The mount correction and old/new transport compatibility checks passed
**319 tests in 9.31s** with the same interpreter and
`services/api/tests/test_ingress_mounts.py`, `test_ingress_http.py`,
`test_raw_ingress_http.py`, `test_desktop_ingress_http.py` and
`test_capture_app_dispatch.py`. The 42 new mount cases check root/single/nested
paths for both families. With ASGITransport exception propagation enabled, the
identical cancellation object escapes the app; suppressed exceptions yield a
transport 500, without an ACK or leaked message. All staged documents roll back,
then the same key succeeds on a clean retry.

The final independent run of the two new suites passed **71 tests in 2.24s**:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_desktop_capture_runtime.py services/api/tests/test_ingress_mounts.py
```

Across the runtime and transport commands, **413 distinct tests passed** (65
existing runtime + 29 new runtime + 319 transport); the final 71 are a repeated
subset, not additional coverage. `git diff --check` passed. During test authoring,
two display re-registration expectations were corrected to the existing immutable
ID response: a missing source head with retained history is 409
`source_identity_conflict`, while a missing current snapshot is 503 `unavailable`.
Both remain refused with no archive mutation; no production check was weakened.

Independent bounded static review found no blocker in the runtime authority gates,
unchanged foundations/grants/token handling or corrected response selector.
No source schema, default application, preview, dependency or model setting changed.
No DB rerun, environment credential lookup, local listener, native capture/compiler,
OS permission prompt, provider/account action or destination import ran.

Lead owns review/release and the native hosts own actual integration after release.
This callable still requires real scoped consent, trusted identity provisioning,
secure local token delivery and producer lifecycle handling. R07/R27/R35/R36/R51/
R52/R58, A12/A14/A16/A30/A31 and desktop-first §7.1 retain their complete goals;
actual screen freshness, real-AI receipt, original-screen ink/audio and both
per-platform product gates remain open. No full desktop acceptance is claimed.
