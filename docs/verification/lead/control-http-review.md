# Independent control HTTP review — 654564c

**Scoped approve for lead integration of this opt-in ASGI factory. No blocking finding.** This approves the released control 0.2.1 transport boundary; it is not runtime activation, producer/device stopping, PostgreSQL concurrency, capture ingress, AI receipt or a product gate pass.

## Exact provenance and source review

- Baseline: main `4a30b9dee4fb4dc7452f0c0e61fd9c6ace00b5f1`.
- Candidate: `654564c639a764fd1a677673f3297cb28d1614c1`, parent `8b5cfc3`. Isolated baseline archive plus **only** `git diff --binary 654564c^ 654564c`, checked and applied in `/tmp/control-http-review-2a1mp4am`; no parent branch history integrated.
- Candidate delta has exactly 3 files: `services/api/control_app.py`, `services/api/tests/test_control_http.py`, `docs/verification/backend/p0-control-http.md`. All three archived resulting files match candidate bytes.
- Read full 212-line factory and new test file; released `process_control/README.md` and generated OpenAPI; actual Authenticator/Principal → ControlRegistry → CaptureArchive/Archive authorization → MemoryStore transaction call flow; default app configuration and PostgreSQL constructor/transaction boundaries; ADR 0002 §§2–5; affected original/English R29/R30/R35/R36 and §3.9, and AUDIO-14 source stopping. Current workflow/PONYTAIL LITE applies: existing identity, registry and schema are reused, without a new authorization or storage system.
- Byte comparison against the exact main baseline confirms **62 files unchanged**: default app/auth plus every file under released `packages/contracts`. Current dirty capture-ingress preparation in main was not read as candidate content or edited.

## Actual independently run checks

```sh
cd /tmp/control-http-review-2a1mp4am
env -u LC_DATABASE_URL /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_control_http.py
# 64 passed in 0.90s

env -u LC_DATABASE_URL /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python independent_control_probe.py
# 16 independent ASGI/control groups passed

env -u LC_DATABASE_URL /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python cancel_probe.py
# cancellation-detail check: 503 unavailable/retryable, exact unchanged actor state, same-key retry succeeds
```

The 64 tests are the candidate's authored tests independently executed here; no 112-test legacy campaign was rerun or relabeled as new evidence. The 16 additional groups are reviewer probes through `httpx.ASGITransport` with the actual factory, registry and `MemoryStore`, synthetic principals and existing synthetic fixture setup. The targeted cancellation detail refines the same cancellation group, not an additional unique acceptance case. Files and evidence are retained in the archive above.

The independent groups establish:

1. Five missing/malformed explicit configuration variants fail closed with the released 503/403 envelope and unchanged state; explicit empty capabilities confer no capability.
2. Registration with valid control scope but no independently issued start grant returns 403, without adding a grant, stream or replay.
3. A separately issued exact-ID grant permits registration/read and returns a schema-valid released `StreamState`.
4. A client-proposed finite stop boundary without independent producer evidence returns 409 and preserves state; it is not copied into a trusted fact.
5. Unknown-boundary stop produces stopped revision 2. Registration replay returns stopped; a fresh key against old CAS fails. Withdrawal produces revision 3; old stop and registration keys return current withdrawn state. No device live-capture flag or capture record is activated by these requests.
6–10. Synthetic identity, extra-scope, generation, revocation and authenticator-outage changes at the **under-lock** recheck reject before mutation. The probe records authenticator calls as `[outside transaction, inside transaction]`, checks the complete actor store and pending grant remain unchanged, and verifies outage remains content-free retryable 503 rather than legacy 403 normalization.
11. Token expiry after actor-lock acquisition returns 401 without consuming the grant.
12–13. Actual registration and stop writes are staged before an injected context-exit/commit failure. The real MemoryStore rolls them back, including replay/stream/grant state. HTTP returns content-free 503; removing the fault and retrying the same key succeeds.
14. An async body that yields partial JSON then raises cancellation returns the released 503 envelope in this ASGI path. No actor, stream, grant or replay state changes; the same idempotency key remains usable for a valid retry. This is request-body cancellation evidence, not a claim to abort a transaction already committed or physically stop a device.
15. Five separately supplied malformed JSON/header/body-length cases reject with 422 and unchanged state, including duplicate JSON properties, invalid UTF-8, non-object JSON, inconsistent content length and duplicate idempotency keys.
16. `/openapi.json` exactly matches the released control artifact. No module-level `app`, start-grant, capture-batch, v1 or documentation UI route is exposed by this factory. Default v1 behavior/route absence is also exercised in the candidate's focused test file and its source bytes are unchanged.

Every response checked by the independent request helper carries `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; 401 uses the Bearer challenge. Negative envelopes are schema-validated and contain no synthetic bearer value or injected exception details. Successful states are schema-validated. Authorization is rechecked before replay, and idempotency remains owner/method/full-path/complete-body scoped through the existing registry.

## Boundaries and next owner

No listener, database connection, provider, account action, production credential read, preview/Paperclip operation or worker/main production edit occurred. The commands explicitly removed only `LC_DATABASE_URL` from their child environment without printing its value, and supplied fresh in-memory stores; no default service was started. The archive's Python bytecode/test cache is temporary reviewer output only. No Git mutation or peer message was made.

Native/network transport, actual production authenticator, durable deployment, PostgreSQL interconnection commit orders, consumer/device cancellation and real capture delivery remain separate evidence. This patch intentionally has no HTTP start-grant issuance or default route mount. The embedding must supply reviewed authentication, explicit immutable capability configuration and independently established start/stop authority; local test tokens are not a deployment credential design.

Lead may integrate the three-file delta and run the required changed-path checks on the resulting main commit. No additional architecture or unrelated refactor is requested.
