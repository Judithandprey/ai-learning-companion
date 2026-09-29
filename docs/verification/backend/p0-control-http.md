# Explicit control-only ASGI transport

2026-09-29 — Backend P0-04/P0-09. Lead assignment
`handoff_dd5bcb876213b1f64547d2647e60db91`; exact released baseline
`2ccf5b9109476b7214620ec0b8e66d10ee0df9d6`, normally merged into `team/backend`
at `8b5cfc32818e7580b3fca6e160013820cef360db` before this implementation.

Read the complete process_control README/generated OpenAPI, ADR 0002 §§2–5,
current guidance and actual auth/app/ControlRegistry call flow. This transports
the existing released control 0.2.1 contract; it adds no product requirement or
wire fields. Existing R29/R30/R35/R36/R51/R52/R58, A14/A16/A30/A31/A38/A42/A43
and scoped AUDIO-14 stopping retain their original preservation/permission limits.

## Internal embedding and authorization

```python
from services.api.control_app import create_control_app

app = create_control_app(
    store=existing_actor_store,
    authenticator=reviewed_authenticator,
    capabilities=frozenset({"process.control.v0.2.1"}),
    stop_fact_resolver=trusted_persisted_stop_fact_resolver,
)
```

This creates an ASGI application object only. There is no module-level app,
environment-token/DSN lookup, server launch, v1 mount, producer start or executor.
The embedding deployment must issue `process:control` only to approved control
clients; a scope claim from a course page or request body is not an authenticator.
The existing Principal, Authenticator and ControlRegistry are reused. PONYTAIL
LITE keeps a separate small factory rather than changing the default v1 app or
creating another identity/stream system.

The only control routes are the released three:

- `POST /v2/process/streams`
- `GET /v2/process/streams/{stream_id}`
- `POST /v2/process/streams/{stream_id}:control`

All success responses are HTTP 200 with current `StreamState`. Registration
requires an independently issued existing `authorize_start` decision for that
exact ID, generation, membership and producer. No HTTP grant-creation method is
provided. The injected stop-fact resolver supplies independent finite boundary
evidence; the request boundary is never copied into a trusted fact. Missing
boundary evidence still permits an unknown-boundary stop, not a fabricated seal.

All three routes require trusted bearer authentication, current `process:control`
scope and explicit immutable deployment capability configuration. Control does
not require source-read or capture scopes. The same token is reauthenticated after
the actor transaction lock is acquired; principal changes, expiry, revocation and
authorization-generation mismatch reject before mutation/replay. Membership,
identity, stream incarnation and stop/CAS checks remain inside the registry's
existing transaction. Exact registration/command replay returns current stopped
or withdrawn state rather than cached live state.

Missing store/authenticator/capability configuration fails closed. Mutations
require exactly one schema-valid Idempotency-Key; duplicate auth/content headers,
duplicate JSON keys, unexpected fields/queries, unsupported body versions,
malformed UTF-8/JSON and invalid identities reject without input reflection.
Control bodies have a 16 KiB engineering transport bound, measured across streamed
chunks; declared length cannot bypass it. This is not an artifact or source quota.
GET accepts no request body. Identifier colons retain their literal identity.

Errors use exactly the released content-free `ControlError` with allowed status/
code pairs. Only `unavailable` is retryable; missing/configuration, authenticator
and transaction failures return 503 without exception or credential details.
Responses prohibit caching. Swagger/ReDoc UIs are absent; `/openapi.json` returns
the released control OpenAPI only. No default route or generated artifact changed.

## Verification and boundaries

The HTTP tests exercise `httpx.AsyncClient` with `ASGITransport`, using explicitly
synthetic principals, MemoryStore, owned memberships and independently supplied
service start/stop facts. No socket listener, background service or preview token
is involved. Local ASGI responses prove executable transport behavior, not a
deployed endpoint, production authenticator, device stop or AI receipt.

Existing control and v1 HTTP regression command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_control.py services/api/tests/test_http.py
# 112 passed in 0.89s

git diff --exit-code 2ccf5b9109476b7214620ec0b8e66d10ee0df9d6 -- \
  services/api/app.py services/api/auth.py packages/contracts/schema.json \
  packages/contracts/generated packages/contracts/process_v2 \
  packages/contracts/process_control
# exit 0: default app/auth and released wire files unchanged
```

New transport tests (test author execution on the final code):

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_control_http.py
# 64 passed in 0.60s
git diff --check
# exit 0
```

The actual request sequence first denies ungranted registration, then consumes a
separately issued fixture grant; register/read return live, stop returns stopped,
and the original registration key returns the current stopped state. Withdrawal
then makes both registration replay and the old stop-command key return withdrawn.
Other checks cover independently evidenced zero/finite boundaries, stale CAS and
changed-key conflicts, scope/capability/configuration denial, foreign/path/deleted
identity behavior, transaction-time token expiry/change/revocation, registration/
command/commit failure with exact unchanged storage, literal colon-ending stream
IDs, all three authenticated routes and both exact OpenAPI artifacts. Chunked
oversize requests and misleading Content-Length reject; exactly 16 KiB and a
128-character idempotency key remain accepted.

Independent review reproduced one transport integration defect: an authenticator
`DomainError(503)` during the under-lock recheck was normalized by the existing
capture guard into nonretryable 403. The new factory now classifies authenticator
availability failures before that legacy normalization, preserving the existing
capture/v1 code and yielding content-free retryable 503 both before and inside
the transaction. Two regressions preserve the complete actor state and unused
start grant. This is an availability/error-mapping fix, not weaker authentication.

Post-fix independent ASGI probes passed both outage orders, 16 parser/header/body
boundary negatives, token revocation before the guard, transaction-exit rollback,
colon identity routing and post-stop current-state replay. No blocking finding
remained in this focused review. No database or real transport concurrency claim
is inferred from these sequential in-process HTTP tests; existing registry race
evidence is not rerun or relabeled as new HTTP acceptance.

Lead next reviews/releases this factory before any runtime route activation.
Source registration, typed-original upload and frame/process HTTP transports still
need their coordinated release; no additional endpoints are inferred here. No DB,
provider, device, user preview/Paperclip, account or paid executor operation occurred.
Real native transport, durable deployment, whole-display AI input, original-screen
pen and Notability gates remain separate and unverified by this report.
